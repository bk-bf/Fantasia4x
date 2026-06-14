/**
 * JobService — Phase 5a
 *
 * Central job system: generates discrete jobs from world state, allows
 * pawns to claim and advance them, and handles completion side-effects.
 *
 * Port of Celestia job_service.gd, adapted for SvelteKit + immutable state.
 * Called from GameEngineImpl at the START of each turn (generateJobs) and
 * indirectly through PawnStateMachine (claimJob / advanceJob / releaseJob).
 */

import type {
  DesignationType,
  GameState,
  Job,
  JobDef,
  Pawn,
  DroppedItem,
  ZoneFilter
} from '../core/types';
import { WORK_CATEGORIES } from '../core/Work';
import jobsData from '../database/jobs.jsonc';
// Gated console shim — see core/log.ts. Silences per-tick log/debug/warn unless
// gameDebug(true); console.error still surfaces.
import { gatedConsole as console, isGameDebug } from '../core/log';
import itemsData from '../database/items.jsonc';
import { resourceObjectService } from './ResourceObjectService';
import { SUBTERRAINS, SUBTERRAIN_FALLBACK } from '../core/Terrains';
import { itemService } from './ItemService';
import { recipeService } from './RecipeService';
import { buildingService } from './BuildingService';
import * as fuelRules from './fuelRules';
import { pawnStatService } from './PawnStatService';
import {
  addToStockpileZone,
  consumeFromStockpiles,
  absorbDropIfOnStockpileTile
} from '../core/GameState';
import { ticksFromSeconds } from '../core/time';
import { rng } from '../core/rng';

const ITEMS_DATABASE = itemsData as unknown as import('../core/types').Item[];

// ===== JOB REGISTRY (data-driven, jobs.jsonc) =====
// The declarative half of the job system. jobs.jsonc lists the colony job types + their
// work-category mapping / claim-gating; the behavioural half (generate + complete) is bound by id
// in JobServiceImpl.handlers below. See ADR-017.
const JOB_DEFS = jobsData as unknown as JobDef[];
const JOB_DEF_BY_ID = new Map<string, JobDef>(JOB_DEFS.map((d) => [d.id, d]));

/** The colony pool job types — the subset of Job['type'] that JobService generates & completes. */
type JobPoolType = 'harvest' | 'haul' | 'construct' | 'deconstruct' | 'fetch' | 'craft' | 'refuel';
// Compile-time guard: every JobPoolType must be a real Job['type'] member (fails to build otherwise).
type _AssertPoolSubset = JobPoolType extends Job['type'] ? true : never;
const _assertPoolSubset: _AssertPoolSubset = true;
void _assertPoolSubset;

/** Behaviour bound to a job type id: how it's generated into the pool and completed. */
type JobHandler = {
  generate: (jobs: Job[], gs: GameState) => Job[];
  complete: (job: Job, gs: GameState) => GameState;
};

/**
 * Minimal shape needed to map a job to its labor work-category key. Both a full {@link Job}
 * and a Pawn's looser `activeJob` (which can be a 'need' type) satisfy this, so the mapping
 * accepts either without a cast.
 */
type WorkKeyJob = {
  type: string;
  targetX: number;
  targetY: number;
  resourceId?: string;
};

// ===== WORK CONSTANTS =====

/** Work-points per turn a pawn delivers (base rate; later modifiable by stats). */
// Deliberately PER-TURN: work delivery is gated through the turn-based job/state-machine
// flow (claimJob/advanceJob), so smoothing it would mean running job advancement every
// tick — high risk for purely cosmetic progress, and completion timing is unchanged either way.
export const BASE_WORK_RATE = 1;

/** Designation types that produce harvest-category jobs. */
const HARVEST_DTYPES: DesignationType[] = ['harvest', 'woodcut', 'forage'];

// ===== JOB SERVICE =====

class JobServiceImpl {
  // Behaviour registry: binds each jobs.jsonc id to its generate/complete implementation. This is
  // the ONLY place a job type's behaviour is wired — generateJobs and _completeJob both dispatch
  // through it, so there is no hardcoded type switch. (Arrow wrappers keep `this` bound.)
  private readonly handlers: Record<JobPoolType, JobHandler> = {
    harvest: {
      generate: (j, gs) => this._syncHarvestJobs(j, gs),
      complete: (job, gs) => this._completeHarvest(job, gs)
    },
    haul: {
      generate: (j, gs) => this._syncHaulJobs(j, gs),
      complete: (job, gs) => this._completeHaul(job, gs)
    },
    construct: {
      generate: (j, gs) => this._syncConstructJobs(j, gs),
      complete: (job, gs) => this._completeConstruct(job, gs)
    },
    deconstruct: {
      generate: (j, gs) => this._syncDeconstructJobs(j, gs),
      complete: (job, gs) => this._completeDeconstruct(job, gs)
    },
    fetch: {
      generate: (j, gs) => this._syncFetchJobs(j, gs),
      complete: (job, gs) => this._completeFetch(job, gs)
    },
    craft: {
      generate: (j, gs) => this._syncCraftJobs(j, gs),
      complete: (job, gs) => this._completeCraft(job, gs)
    },
    refuel: {
      generate: (j, gs) => this._syncRefuelJobs(j, gs),
      complete: (job, gs) => this._completeRefuel(job, gs)
    }
  };

  // ------------------------------------------------------------------ //
  // PUBLIC API                                                           //
  // ------------------------------------------------------------------ //

  /**
   * Sync gameState.jobs[] with current world state.
   * - Creates new jobs for designations, incomplete buildings, and queued crafts.
   * - Removes jobs whose sources are gone.
   * - Preserves existing jobs (keeping claimedBy + workDone intact).
   *
   * Called once per turn from GameEngineImpl BEFORE pawn processing.
   */
  generateJobs(gameState: GameState): GameState {
    let jobs: Job[] = [...(gameState.jobs ?? [])];

    // Run each registered generator in jobs.jsonc declaration order (= the historical sequence:
    // harvest → haul → construct → deconstruct → fetch → craft → refuel). Each generator syncs its
    // own job type from world state (designations, dropped items, buildings, the crafting queue).
    for (const def of JOB_DEFS) {
      jobs = this.handlers[def.id as JobPoolType].generate(jobs, gameState);
    }

    // Light jobs were removed (campfires auto-light whenever they have fuel); purge any stale ones
    // left in old save data.
    jobs = jobs.filter((j) => j.type !== 'light');

    return { ...gameState, jobs };
  }

  /**
   * Mark a job as claimed by a pawn.
   * Idempotent if the pawn already owns it.
   */
  claimJob(pawnId: string, jobId: string, gameState: GameState): GameState {
    const jobs = (gameState.jobs ?? []).map((j) =>
      j.id === jobId && (j.claimedBy === null || j.claimedBy === pawnId)
        ? { ...j, claimedBy: pawnId }
        : j
    );
    return { ...gameState, jobs };
  }

  /**
   * Release a pawn's claim on a job (e.g. interrupted).
   */
  releaseJob(pawnId: string, jobId: string, gameState: GameState): GameState {
    const jobs = (gameState.jobs ?? []).map((j) =>
      j.id === jobId && j.claimedBy === pawnId ? { ...j, claimedBy: null } : j
    );
    return { ...gameState, jobs };
  }

  /**
   * Add work-points to a job.
   * When workDone >= workRequired, completes the job and applies side-effects.
   */
  advanceJob(jobId: string, workPoints: number, gameState: GameState): GameState {
    const jobIdx = (gameState.jobs ?? []).findIndex((j) => j.id === jobId);
    if (jobIdx < 0) return gameState;

    const job = gameState.jobs[jobIdx];
    const newWorkDone = job.workDone + workPoints;

    if (newWorkDone >= job.workRequired) {
      // Job complete — run side effects, remove from pool
      return this._completeJob(job, gameState);
    }

    // Not done yet — update workDone in job (and mirror to building if construct)
    const newJobs = [...gameState.jobs];
    newJobs[jobIdx] = { ...job, workDone: newWorkDone };

    if (job.type === 'construct' && job.buildingId) {
      const newBuildings = (gameState.buildings ?? []).map((b) =>
        b.id === job.buildingId
          ? { ...b, status: 'under_construction' as const, workDone: newWorkDone }
          : b
      );
      return { ...gameState, jobs: newJobs, buildings: newBuildings };
    }

    if (job.type === 'deconstruct' && job.buildingId) {
      const newBuildings = (gameState.buildings ?? []).map((b) =>
        b.id === job.buildingId ? { ...b, deconstructWorkDone: newWorkDone } : b
      );
      return { ...gameState, jobs: newJobs, buildings: newBuildings };
    }

    if (job.type === 'craft' && job.craftQueueId) {
      const newQueue = (gameState.craftingQueue ?? []).map((e) =>
        e.id === job.craftQueueId ? { ...e, workDone: newWorkDone } : e
      );
      return { ...gameState, jobs: newJobs, craftingQueue: newQueue };
    }

    return { ...gameState, jobs: newJobs };
  }

  /**
   * Return unclaimed (or claimed by this pawn) jobs the pawn is allowed to work,
   * sorted by labor level (desc) then Manhattan distance (asc).
   */
  getAvailableJobs(pawn: Pawn, gameState: GameState): Job[] {
    if (!pawn.position) return [];
    const { x: px, y: py } = pawn.position;

    const assignment = gameState.workAssignments?.[pawn.id];
    const laborSettings = assignment?.laborSettings ?? {};
    const legacyPriorities = assignment?.workPriorities ?? {};

    const available = (gameState.jobs ?? []).filter((j) => {
      // Must be unclaimed or claimed by this pawn
      if (j.claimedBy !== null && j.claimedBy !== pawn.id) return false;

      // Claim-gating is declared per job type in jobs.jsonc (`claimGate`); the rule logic stays here.
      const claimGate = JOB_DEF_BY_ID.get(j.type)?.claimGate;

      // refuelAllowlist: a building may restrict who is allowed to refuel it.
      if (claimGate === 'refuelAllowlist' && j.buildingId) {
        const building = (gameState.buildings ?? []).find((b) => b.id === j.buildingId);
        const allowedPawns = building?.fuelSettings?.allowedRefuelPawnIds ?? [];
        if (allowedPawns.length > 0 && !allowedPawns.includes(pawn.id)) return false;
      }

      // harvestTool (ADR-009 / R4): a harvest whose interaction requires a tool (woodcut→axe,
      // mine→pick, …) is not claimable unless the colony has a matching tool in stock. The job
      // stays open until one is crafted. Tool-free scavenges (toolRequirement null) are exempt.
      if (claimGate === 'harvestTool' && !this._colonyHasHarvestTool(j, gameState)) return false;

      // Map job type to work category key used in labor settings
      const workKey = this._jobTypeToWorkKey(j, gameState);

      // Check new laborSettings first, fall back to legacy workPriorities.
      // Default to LABOR_LEVEL.NORMAL (2) so new pawns accept all jobs.
      let priority: number;
      if (workKey in laborSettings) {
        priority = laborSettings[workKey] ?? 2;
      } else if (workKey in legacyPriorities) {
        priority = legacyPriorities[workKey];
      } else {
        priority = 2; // LABOR_LEVEL.NORMAL — default enabled
      }
      return priority > 0;
    });

    return available.sort((a, b) => {
      const workKeyA = this._jobTypeToWorkKey(a, gameState);
      const workKeyB = this._jobTypeToWorkKey(b, gameState);
      const labA = laborSettings[workKeyA] ?? 2;
      const labB = laborSettings[workKeyB] ?? 2;
      if (labB !== labA) return labB - labA;
      const dA = Math.abs(a.targetX - px) + Math.abs(a.targetY - py);
      const dB = Math.abs(b.targetX - px) + Math.abs(b.targetY - py);
      return dA - dB;
    });
  }

  /**
   * P-4b: the "which job should this pawn take next" decision, lifted out of the FSM's
   * `handleIdle` so the handler only *applies* the result (claim + path). Returns the first
   * reachable available job (the caller injects `isReachable` — typically the pawn-system's
   * unreachable-job memory — so this stays free of FSM/movement state) plus a deduped soft-preview
   * of the next `queueSize` unclaimed jobs for the need-lookahead system.
   */
  selectJobForPawn(
    pawn: Pawn,
    gameState: GameState,
    opts: { isReachable: (jobId: string) => boolean; queueSize: number }
  ): { job: Job | null; queuePreview: string[] } {
    const availableJobs = this.getAvailableJobs(pawn, gameState);
    const job = availableJobs.find((j) => opts.isReachable(j.id)) ?? null;
    const queuePreview = [
      ...new Set(
        availableJobs
          .slice(1, 1 + opts.queueSize)
          .filter((j) => j.claimedBy === null)
          .map((j) => j.id)
      )
    ];
    return { job, queuePreview };
  }

  // ------------------------------------------------------------------ //
  // PRIVATE — JOB GENERATION                                            //
  // ------------------------------------------------------------------ //

  private _syncHarvestJobs(jobs: Job[], gs: GameState): Job[] {
    // Remove harvest jobs whose exact designated tile no longer permits harvesting,
    // or whose resource is gone.
    jobs = jobs.filter((j) => {
      if (j.type !== 'harvest') return true;
      const designationType = gs.designations?.[`${j.targetX},${j.targetY}`];
      if (!designationType || !HARVEST_DTYPES.includes(designationType)) return false;
      if (!this._resourceMatchesDesignation(designationType, j.resourceId ?? '')) return false;
      if (
        !this._resourceMatchesFilter(
          designationType,
          j.resourceId ?? '',
          gs,
          `${j.targetX},${j.targetY}`
        )
      )
        return false;
      const tile = gs.worldMap[j.targetY]?.[j.targetX];
      return (tile?.resources?.[j.resourceId ?? ''] ?? 0) > 0;
    });

    // Add harvest jobs only for designated tiles that currently hold matching resources.
    for (const [key, dtype] of Object.entries(gs.designations ?? {})) {
      if (!HARVEST_DTYPES.includes(dtype)) continue;
      const [x, y] = key.split(',').map(Number);
      const tile = gs.worldMap[y]?.[x];
      if (!tile) continue;

      for (const [resourceId, amount] of Object.entries(tile.resources ?? {})) {
        if ((amount ?? 0) <= 0) continue;
        if (!this._resourceMatchesDesignation(dtype, resourceId)) continue;
        if (!this._resourceMatchesFilter(dtype, resourceId, gs, key)) continue;

        const exists = jobs.some(
          (j) =>
            j.type === 'harvest' &&
            j.targetX === x &&
            j.targetY === y &&
            j.resourceId === resourceId
        );
        if (exists) continue;

        jobs.push({
          id: `harvest-${x}-${y}-${resourceId}-${Date.now()}-${rng.random().toString(36).slice(2, 5)}`,
          type: 'harvest',
          targetX: x,
          targetY: y,
          resourceId,
          workRequired: resourceObjectService.getWorkAmount(resourceId, dtype as DesignationType),
          workDone: 0,
          claimedBy: null
        });
      }
    }

    return jobs;
  }

  private _syncDeconstructJobs(jobs: Job[], gs: GameState): Job[] {
    // Remove deconstruct jobs for buildings no longer queued or already gone
    jobs = jobs.filter((j) => {
      if (j.type !== 'deconstruct') return true;
      const b = (gs.buildings ?? []).find((b) => b.id === j.buildingId);
      return b && b.deconstructQueued === true;
    });

    // Add new deconstruct jobs for buildings freshly queued
    for (const building of gs.buildings ?? []) {
      if (!building.deconstructQueued) continue;
      const exists = jobs.some((j) => j.type === 'deconstruct' && j.buildingId === building.id);
      if (!exists) {
        jobs.push({
          id: `deconstruct-${building.id}-${Date.now()}`,
          type: 'deconstruct',
          targetX: building.x,
          targetY: building.y,
          buildingId: building.id,
          workRequired: building.deconstructWorkRequired ?? 1,
          workDone: building.deconstructWorkDone ?? 0,
          claimedBy: null
        });
      }
    }

    return jobs;
  }

  private _syncConstructJobs(jobs: Job[], gs: GameState): Job[] {
    // Remove construct jobs for buildings that no longer exist or are complete
    jobs = jobs.filter((j) => {
      if (j.type !== 'construct') return true;
      const b = (gs.buildings ?? []).find((b) => b.id === j.buildingId);
      return b && b.status !== 'complete';
    });

    // Add new construct jobs for incomplete buildings
    for (const building of gs.buildings ?? []) {
      if (building.status === 'complete') continue;
      if (!building.x && !building.y && building.x !== 0 && building.y !== 0) continue;

      // Phase 6: zero-workRequired buildings were already completed by BuildingService.placeBuilding
      // (buildTime === 0 → status 'complete' on placement), so they won't reach here.
      // Extra guard just in case:
      if ((building.workRequired ?? 1) === 0) continue;

      // ADR-016: don't open the construct job until all reserved build materials are staged on
      // the site (pawns fetch them first). The materials are consumed on completion.
      if (!this._buildingSupplied(building, gs)) continue;

      const exists = jobs.some((j) => j.type === 'construct' && j.buildingId === building.id);
      if (!exists) {
        jobs.push({
          id: `construct-${building.id}-${Date.now()}`,
          type: 'construct',
          targetX: building.x,
          targetY: building.y,
          buildingId: building.id,
          workRequired: building.workRequired ?? 50,
          workDone: building.workDone ?? 0,
          claimedBy: null
        });
      }
    }

    return jobs;
  }

  /** ADR-016: tile coords of an order's chosen workstation, or null if it's gone. */
  private _stationTileFor(
    order: import('../core/types').CraftingInProgress,
    gs: GameState
  ): { x: number; y: number } | null {
    if (!order.stationBuildingId) return null;
    const b = (gs.buildings ?? []).find(
      (b) => b.id === order.stationBuildingId && b.status === 'complete'
    );
    return b ? { x: b.x, y: b.y } : null;
  }

  /** Quantity of an order's reserved input `itemId` already staged ON its station tile. */
  private _stagedQty(
    order: import('../core/types').CraftingInProgress,
    itemId: string,
    station: { x: number; y: number },
    gs: GameState
  ): number {
    let q = 0;
    for (const d of gs.droppedItems ?? []) {
      if (
        d.stored &&
        d.reservedFor === order.id &&
        d.resourceId === itemId &&
        d.x === station.x &&
        d.y === station.y
      ) {
        q += d.quantity;
      }
    }
    return q;
  }

  /** True when every input of an order is fully staged on its station tile. */
  private _orderSupplied(
    order: import('../core/types').CraftingInProgress,
    station: { x: number; y: number },
    gs: GameState
  ): boolean {
    return Object.entries(order.inputs ?? {}).every(
      ([itemId, need]) => this._stagedQty(order, itemId, station, gs) >= need
    );
  }

  /** Public: is this craft order's station present and all inputs staged on it? (Passive furnaces.) */
  isOrderSupplied(order: import('../core/types').CraftingInProgress, gs: GameState): boolean {
    const station = this._stationTileFor(order, gs);
    return station ? this._orderSupplied(order, station, gs) : false;
  }

  /**
   * ADR-016: emit one `fetch` job per reserved input stack that still sits on a stockpile tile
   * (not yet carried to the order's station). A pawn picks it up and stages it ON the station;
   * the craft job only opens once every input is staged (see _syncCraftJobs).
   */
  private _syncFetchJobs(jobs: Job[], gs: GameState): Job[] {
    // Drop fetch jobs whose owner (craft order OR building) or source drop is gone / already moved.
    jobs = jobs.filter((j) => {
      if (j.type !== 'fetch') return true;
      const owner = j.craftQueueId ?? j.buildingId;
      if (!owner) return false;
      const ownerExists = j.craftQueueId
        ? (gs.craftingQueue ?? []).some((e) => e.id === j.craftQueueId)
        : (gs.buildings ?? []).some((b) => b.id === j.buildingId && b.status !== 'complete');
      if (!ownerExists) return false;
      const src = (gs.droppedItems ?? []).find((d) => d.id === j.droppedItemId);
      return !!src && src.reservedFor === owner;
    });

    const addFetchJobs = (
      ownerId: string,
      dest: { x: number; y: number },
      buildingId: string | undefined,
      craftQueueId: string | undefined
    ) => {
      for (const drop of gs.droppedItems ?? []) {
        if (!drop.stored || drop.reservedFor !== ownerId) continue;
        if (drop.x === dest.x && drop.y === dest.y) continue; // already staged at the destination
        const exists = jobs.some((j) => j.type === 'fetch' && j.droppedItemId === drop.id);
        if (exists) continue;
        jobs.push({
          id: `fetch-${drop.id}-${Date.now()}`,
          type: 'fetch',
          targetX: drop.x,
          targetY: drop.y,
          resourceId: drop.resourceId,
          droppedItemId: drop.id,
          craftQueueId,
          buildingId,
          stationX: dest.x,
          stationY: dest.y,
          workRequired: 1, // instant pick-up on arrival
          workDone: 0,
          claimedBy: null
        });
      }
    };

    // Craft orders: carry reserved inputs to the workstation tile.
    for (const order of gs.craftingQueue ?? []) {
      const station = this._stationTileFor(order, gs);
      if (!station) continue;
      addFetchJobs(order.id, station, order.stationBuildingId, order.id);
    }

    // Buildings under construction: carry reserved build materials to the build site (ADR-016).
    for (const b of gs.buildings ?? []) {
      if (b.status === 'complete') continue;
      addFetchJobs(b.id, { x: b.x, y: b.y }, b.id, undefined);
    }

    return jobs;
  }

  /** True when no build material reserved for this building is still off the build tile. */
  private _buildingSupplied(b: import('../core/types').PlacedBuilding, gs: GameState): boolean {
    return !(gs.droppedItems ?? []).some(
      (d) => d.stored && d.reservedFor === b.id && !(d.x === b.x && d.y === b.y)
    );
  }

  private _syncCraftJobs(jobs: Job[], gs: GameState): Job[] {
    // Remove craft jobs for queue entries that no longer exist
    jobs = jobs.filter((j) => {
      if (j.type !== 'craft') return true;
      return (gs.craftingQueue ?? []).some((e) => e.id === j.craftQueueId);
    });

    // Add a craft job only once the order's inputs are fully staged on its station tile, and
    // target that tile so the pawn actually walks to the workstation to craft (ADR-016).
    for (const order of gs.craftingQueue ?? []) {
      if (!order.id) continue;
      // ADR-016 passive furnaces: no pawn-worked craft job — the station produces it over time
      // (GameEngineImpl.processPassiveProduction). Inputs are still fetched/staged as usual.
      if (recipeService.isPassiveStation(order.stationType)) continue;
      const station = this._stationTileFor(order, gs);
      if (!station) continue;
      if (!this._orderSupplied(order, station, gs)) continue;
      const exists = jobs.some((j) => j.type === 'craft' && j.craftQueueId === order.id);
      if (!exists) {
        jobs.push({
          id: `craft-${order.id}-${Date.now()}`,
          type: 'craft',
          targetX: station.x,
          targetY: station.y,
          craftQueueId: order.id,
          buildingId: order.stationBuildingId,
          workRequired: order.workRequired ?? order.item.craftingTime ?? 1,
          workDone: order.workDone ?? 0,
          claimedBy: null
        });
      }
    }

    return jobs;
  }

  // ------------------------------------------------------------------ //
  // PRIVATE — JOB COMPLETION                                            //
  // ------------------------------------------------------------------ //

  private _completeJob(job: Job, gameState: GameState): GameState {
    // Remove the finished job from the pool, then run its registered completion side-effect.
    const jobs = (gameState.jobs ?? []).filter((j) => j.id !== job.id);
    const state: GameState = { ...gameState, jobs };
    const handler = this.handlers[job.type as JobPoolType];
    return handler ? handler.complete(job, state) : state;
  }

  private _completeHarvest(job: Job, gs: GameState): GameState {
    if (!job.resourceId) return gs;

    const tile = gs.worldMap[job.targetY]?.[job.targetX];
    const available = tile?.resources?.[job.resourceId] ?? 0;
    if (available <= 0) return gs;

    // Pick the interaction matching the current designation type on this tile.
    const def = resourceObjectService.getById(job.resourceId);
    const designationType = (gs.designations ?? {})[`${job.targetX},${job.targetY}`] as
      | DesignationType
      | undefined;
    const interaction = def
      ? (resourceObjectService.getInteractionByDesignationType(
          job.resourceId,
          designationType ?? 'harvest'
        ) ?? def.interaction)
      : undefined;

    // A persistent node stays on the map after harvesting (yields regrow via cooldown).
    // A node with harvestDepletes:true is removed permanently when cut (e.g. woodcut).
    const shouldPersist = interaction?.persistent === true && interaction?.harvestDepletes !== true;

    // Determine which yields are currently available (their per-yield cooldowns may be active).
    // Compound cooldown keys are formatted as "resourceId:itemId".
    let availableItemIds: Set<string> | undefined;
    if (shouldPersist && def && interaction) {
      const currentCooldowns = tile.resourceCooldowns ?? {};
      const yieldHasPerItemCooldowns = interaction.yields.some(
        (y) => y.regrowthTurns !== undefined
      );
      if (yieldHasPerItemCooldowns) {
        availableItemIds = new Set<string>();
        for (const y of interaction.yields) {
          const key = `${job.resourceId}:${y.itemId}`;
          if (!(key in currentCooldowns)) {
            availableItemIds.add(y.itemId);
          }
        }
      }
    }

    const pawn = gs.pawns.find((p) => p.id === job.claimedBy);
    const yields = resourceObjectService.calculateYield(
      job.resourceId,
      pawn,
      availableItemIds,
      designationType
    );
    const yieldEntries = Object.entries(yields);

    // Build updated tile — zero resources + set per-yield or interaction-level cooldowns.
    const newWorldMap = gs.worldMap.map((row, ry) =>
      ry === job.targetY
        ? row.map((col, rx) => {
            if (rx !== job.targetX) return col;
            const updatedResources = { ...col.resources, [job.resourceId!]: 0 };
            if (!shouldPersist) {
              // Resource removed permanently — restore tile walkability to base subterrain.
              const baseSub = SUBTERRAINS[col.subType] ?? SUBTERRAIN_FALLBACK;
              return {
                ...col,
                resources: updatedResources,
                walkable: baseSub.walkable,
                movementCost: baseSub.movementCost
              };
            }

            const newCooldowns = { ...(col.resourceCooldowns ?? {}) };
            const yieldHasPerItemCooldowns = interaction!.yields.some(
              (y) => y.regrowthTurns !== undefined
            );

            if (yieldHasPerItemCooldowns) {
              // Per-yield compound keys: "resourceId:itemId" → turn
              for (const y of interaction!.yields) {
                if (y.regrowthTurns && (availableItemIds?.has(y.itemId) ?? true)) {
                  newCooldowns[`${job.resourceId!}:${y.itemId}`] =
                    gs.turn + ticksFromSeconds(y.regrowthTurns);
                }
              }
            } else if (interaction?.regrowthTurns) {
              // Simple whole-resource cooldown
              newCooldowns[job.resourceId!] = gs.turn + ticksFromSeconds(interaction.regrowthTurns);
            }

            return { ...col, resources: updatedResources, resourceCooldowns: newCooldowns };
          })
        : row
    );

    // Spawn one DroppedItem per yield type.
    const newDropped = [...(gs.droppedItems ?? [])];
    const newDropIds: string[] = [];
    for (const [dropResourceId, dropAmount] of yieldEntries) {
      const id = `drop-${dropResourceId}-${job.targetX}-${job.targetY}-${Date.now()}-${rng.random().toString(36).slice(2, 5)}`;
      newDropped.push({
        id,
        resourceId: dropResourceId,
        x: job.targetX,
        y: job.targetY,
        quantity: dropAmount
      });
      newDropIds.push(id);
      console.log(
        `[JobService] Harvest complete: ${job.resourceId} at (${job.targetX},${job.targetY}) → ${dropResourceId} x${dropAmount}${shouldPersist ? ' (persistent)' : ''}`
      );
    }
    // Clear the designation for this tile now that the harvest is complete.
    const newDesignations = { ...(gs.designations ?? {}) };
    delete newDesignations[`${job.targetX},${job.targetY}`];

    // Trigger-based absorption: if any drop landed on a stockpile tile, absorb immediately.
    // Note: designations is already updated above so a harvested stockpile tile has its
    // harvest designation removed; stockpile designation is a separate designation type
    // so this correctly absorbs items harvested on a tile that is ALSO a stockpile.
    let state: GameState = {
      ...gs,
      worldMap: newWorldMap,
      droppedItems: newDropped,
      designations: newDesignations
    };
    for (const id of newDropIds) {
      state = absorbDropIfOnStockpileTile(state, id);
    }

    // §B tool work-wear: a tool-gated harvest spends durability on the colony's tool for
    // that work category (stone axe ≈ 8 fells, then it breaks).
    if (interaction?.toolRequirement && interaction.workCategory) {
      state = itemService.applyToolWear(interaction.workCategory, state);
    }
    return state;
  }

  private _syncHaulJobs(jobs: Job[], gs: GameState): Job[] {
    // Only consider non-stored drops (stored = already in stockpile)
    const allDrops = (gs.droppedItems ?? []).filter((d) => !d.stored);
    // Apply stockpile zone filter — prefer per-instance filters, fall back to legacy zoneFilters.
    const stockpileInstances = (gs.zoneInstances ?? []).filter((z) => z.type === 'stockpile');
    const drops = allDrops.filter((d) => {
      if (stockpileInstances.length > 0) {
        return stockpileInstances.some((inst) => {
          if (inst.filter.allowedCategories.length === 0) return true;
          return this._itemMatchesFilter(d.resourceId, inst.filter);
        });
      }
      const legacyFilter = gs.zoneFilters?.['stockpile'];
      if (!legacyFilter || legacyFilter.allowedCategories.length === 0) return true;
      return this._itemMatchesFilter(d.resourceId, legacyFilter);
    });
    // Heavy per-tick string building guarded behind the debug flag (see core/log.ts):
    // gatedConsole suppresses output, but the drops.map() would still run every tick.
    if (isGameDebug()) {
      console.log(
        `[HAUL-SYNC] drops on ground: ${drops.length}`,
        drops.map((d) => `${d.id}(${d.resourceId}×${d.quantity})`)
      );
    }

    // Haul jobs only make sense when there is a stockpile zone to deliver to.
    const stockpileTiles = Object.entries(gs.designations ?? {}).filter(
      ([, t]) => t === 'stockpile'
    );
    if (stockpileTiles.length === 0) {
      // Remove any leftover haul jobs and skip creation
      const pruned = jobs.filter((j) => j.type !== 'haul');
      if (pruned.length !== jobs.length)
        console.log('[HAUL-SYNC] no stockpile zone — removed all haul jobs');
      return pruned;
    }

    // Count free stockpile tiles (not occupied by a stored item)
    const usedCoords = new Set(
      (gs.droppedItems ?? []).filter((d) => d.stored).map((d) => `${d.x},${d.y}`)
    );
    // A tile is "available" if it's free OR already holds the same resource (can stack)
    const storedResourceIds = new Set(
      (gs.droppedItems ?? []).filter((d) => d.stored).map((d) => d.resourceId)
    );
    const freeTileCount = stockpileTiles.filter(([key]) => !usedCoords.has(key)).length;
    // Total capacity = free tiles + tiles that can accept more of an already-stored type
    const canAccept = freeTileCount + storedResourceIds.size;

    // Remove haul jobs whose dropped item no longer exists
    jobs = jobs.filter((j) => {
      if (j.type !== 'haul') return true;
      const stillExists = drops.some((d) => d.id === j.droppedItemId);
      if (!stillExists) console.log(`[HAUL-SYNC] pruned stale haul job ${j.id}`);
      return stillExists;
    });

    // Count active haul jobs to avoid scheduling more than we have capacity for
    const activeHaulCount = jobs.filter((j) => j.type === 'haul').length;

    // Add haul jobs for dropped items that have no job yet, up to available capacity
    for (const drop of drops) {
      if (activeHaulCount >= canAccept) break; // stockpile full
      const exists = jobs.some((j) => j.type === 'haul' && j.droppedItemId === drop.id);
      if (!exists) {
        console.log(
          `[HAUL-SYNC] creating haul job for drop ${drop.id} (${drop.resourceId}×${drop.quantity})`
        );
        jobs.push({
          id: `haul-${drop.id}-${Date.now()}`,
          type: 'haul',
          targetX: drop.x,
          targetY: drop.y,
          resourceId: drop.resourceId,
          droppedItemId: drop.id,
          workRequired: 1, // instant pick-up on arrival
          workDone: 0,
          claimedBy: null
        });
      }
    }

    return jobs;
  }

  /**
   * ADR-016 fetch pickup: lift the reserved source drop into the carrying pawn's inventory and
   * tag the pawn with the order id (`carryingForOrder`) so the FSM stages it on the order's
   * station tile (not the nearest stockpile). The reservation "moves" with the items: the source
   * stored drop is removed here; a fresh `reservedFor` drop is created on the station when staged.
   */
  private _completeFetch(job: Job, gs: GameState): GameState {
    // The reservation owner is a craft order (craftQueueId) OR a building (buildingId).
    const owner = job.craftQueueId ?? job.buildingId;
    if (!job.droppedItemId || !owner) return gs;
    const drop = (gs.droppedItems ?? []).find((d) => d.id === job.droppedItemId);
    if (!drop) return gs;
    const pawnId = job.claimedBy;
    if (!pawnId) return gs;
    const pawn = gs.pawns.find((p) => p.id === pawnId);
    if (!pawn) return gs;

    // R5 carry budget: take only what fits; the rest stays reserved on the stockpile tile and a
    // fresh fetch job is generated for it (another trip / another pawn).
    const taken = itemService.clampPickupQuantity(pawn, drop.resourceId, drop.quantity, gs);
    if (taken <= 0) return gs;
    const remainder = drop.quantity - taken;
    const newDropped =
      remainder > 0
        ? (gs.droppedItems ?? []).map((d) => (d.id === drop.id ? { ...d, quantity: remainder } : d))
        : (gs.droppedItems ?? []).filter((d) => d.id !== drop.id);

    const newPawns = gs.pawns.map((p) => {
      if (p.id !== pawnId) return p;
      const inv = p.inventory ?? {
        items: {},
        instances: [],
        weightKg: 0,
        maxWeightKg: 20,
        volumeL: 0,
        maxVolumeL: 20
      };
      const newItems = { ...inv.items };
      newItems[drop.resourceId] = (newItems[drop.resourceId] ?? 0) + taken;
      return { ...p, inventory: { ...inv, items: newItems }, carryingForOrder: owner };
    });
    return { ...gs, droppedItems: newDropped, pawns: newPawns };
  }

  private _completeHaul(job: Job, gs: GameState): GameState {
    if (!job.droppedItemId) return gs;

    const drop = (gs.droppedItems ?? []).find((d) => d.id === job.droppedItemId);
    if (!drop) return gs;

    // Add to carrying pawn's inventory
    const pawnId = job.claimedBy;
    if (pawnId) {
      const pawn = gs.pawns.find((p) => p.id === pawnId);
      // R5 carry budget: take only what fits; the rest stays on the ground for another trip.
      const taken = pawn
        ? itemService.clampPickupQuantity(pawn, drop.resourceId, drop.quantity, gs)
        : drop.quantity;
      if (taken <= 0) return gs;
      const remainder = drop.quantity - taken;
      const newDropped =
        remainder > 0
          ? (gs.droppedItems ?? []).map((d) =>
              d.id === drop.id ? { ...d, quantity: remainder } : d
            )
          : (gs.droppedItems ?? []).filter((d) => d.id !== drop.id);
      const newPawns = gs.pawns.map((p) => {
        if (p.id !== pawnId) return p;
        const inv = p.inventory ?? {
          items: {},
          instances: [],
          weightKg: 0,
          maxWeightKg: 20,
          volumeL: 0,
          maxVolumeL: 20
        };
        const newItems = { ...inv.items };
        newItems[drop.resourceId] = (newItems[drop.resourceId] ?? 0) + taken;
        return { ...p, inventory: { ...inv, items: newItems } };
      });
      return { ...gs, droppedItems: newDropped, pawns: newPawns };
    }

    // No pawn claimed it (fallback path below uses the whole drop).
    const newDropped = (gs.droppedItems ?? []).filter((d) => d.id !== drop.id);
    console.warn(
      `[HAUL-COMPLETE] no claimedBy on haul job ${job.id} — dropping straight to stockpile`
    );

    // No pawn claimed it (shouldn't happen) — fall back to stockpile and item
    const newStockpile = { ...(gs.stockpile ?? {}) };
    newStockpile[drop.resourceId] = (newStockpile[drop.resourceId] ?? 0) + drop.quantity;
    const baseState = { ...gs, droppedItems: newDropped, stockpile: newStockpile };
    return itemService.addItems({ [drop.resourceId]: drop.quantity }, baseState);
  }

  private _completeDeconstruct(job: Job, gs: GameState): GameState {
    if (!job.buildingId) return gs;
    const building = (gs.buildings ?? []).find((b) => b.id === job.buildingId);
    if (!building) return gs;

    // Refund 50% of building cost to stockpile
    const def = buildingService.getBuildingById(building.type);
    const refunds: Record<string, number> = {};
    if (def?.buildingCost) {
      for (const [itemId, cost] of Object.entries(def.buildingCost)) {
        if (itemId.startsWith('category:')) continue; // category slots have no specific item to refund
        const refund = Math.floor(Number(cost) * 0.5);
        if (refund > 0) refunds[itemId] = (refunds[itemId] ?? 0) + refund;
      }
    }

    // Keep buildingCounts in sync
    const newCounts = { ...(gs.buildingCounts ?? {}) };
    if (newCounts[building.type]) {
      newCounts[building.type] = Math.max(0, newCounts[building.type] - 1);
    }

    console.log(`[JobService] Deconstruction complete: ${building.type} (${building.id})`);
    // Restore the tile's walkability if this was a solid (tile-blocking) building.
    const afterRestore = buildingService.applyBuildingFootprint(
      {
        ...gs,
        buildingCounts: newCounts,
        buildings: (gs.buildings ?? []).filter((b) => b.id !== job.buildingId)
      },
      building,
      false
    );
    return addToStockpileZone(afterRestore, null, refunds);
  }

  private _completeConstruct(job: Job, gs: GameState): GameState {
    if (!job.buildingId) return gs;

    const building = (gs.buildings ?? []).find((b) => b.id === job.buildingId);
    if (!building) return gs;

    // Wire stats.jsonc construction quality into building durability
    const pawn = gs.pawns.find((p) => p.id === job.claimedBy);
    const qualityMult = pawn
      ? (pawnStatService.getWorkModifiers(pawn, 'construction').quality ?? 1)
      : 1;

    const newBuildings = (gs.buildings ?? []).map((b) =>
      b.id === job.buildingId
        ? {
            ...b,
            status: 'complete' as const,
            progress: 1,
            workDone: b.workRequired ?? 50,
            quality: qualityMult
          }
        : b
    );

    // Keep buildingCounts in sync for legacy compatibility
    const newCounts = { ...(gs.buildingCounts ?? {}) };
    newCounts[building.type] = (newCounts[building.type] ?? 0) + 1;

    // ADR-016: the build materials staged on the site (reserved to this building) are consumed
    // by completing the construction.
    const newDropped = (gs.droppedItems ?? []).filter((d) => d.reservedFor !== building.id);

    console.log(
      `[JobService] Construction complete: ${building.type} (${building.id}) quality=${qualityMult.toFixed(2)}`
    );
    // A solid building (def.walkable === false) now blocks its tile — pathfinding routes around it.
    return buildingService.applyBuildingFootprint(
      { ...gs, buildings: newBuildings, buildingCounts: newCounts, droppedItems: newDropped },
      { ...building, status: 'complete' },
      true
    );
  }

  private _completeCraft(job: Job, gs: GameState): GameState {
    if (!job.craftQueueId) return gs;
    const entry = (gs.craftingQueue ?? []).find((e) => e.id === job.craftQueueId);
    if (!entry) return gs;
    return this.completeCraftOrder(entry, gs);
  }

  /**
   * ADR-016: complete a craft ORDER (independent of a pawn job) — destroy the inputs staged on
   * its station, spawn outputs on the station tile, apply mold wear, and remove the order. Used
   * by both the pawn-worked craft completion (_completeCraft) and passive furnace production
   * (GameEngineImpl.processPassiveProduction).
   */
  completeCraftOrder(entry: import('../core/types').CraftingInProgress, gs: GameState): GameState {
    // Recipe registry (Stage C): a craft completion runs the producing recipe once per queued
    // unit and emits ALL its outputs — the primary product plus any byproducts (e.g. splitting
    // a log yields firewood AND branches; charcoal burns yield ash).
    const itemId = entry.item.id;
    const quantity = entry.quantity ?? 1;
    const recipe = recipeService.getRecipeForItem(itemId);
    const recipeOutputs: Record<string, number> = recipe ? recipe.outputs : { [itemId]: 1 };

    const outputs: Record<string, number> = {};
    for (const [outId, outQty] of Object.entries(recipeOutputs)) {
      outputs[outId] = (outputs[outId] ?? 0) + outQty * quantity;
    }

    // ADR-016: destroy the inputs staged on the station (the reserved drops carried here), then
    // spawn the outputs as drops ON the station tile. If the tile is a stockpile they're absorbed;
    // otherwise they sit on the station until a hauler stores them — exactly the physical model.
    const station = this._stationTileFor(entry, gs);
    const droppedItems = (gs.droppedItems ?? []).filter((d) => d.reservedFor !== entry.id);
    const newQueue = (gs.craftingQueue ?? []).filter((e) => e.id !== entry.id);
    let state: GameState = { ...gs, droppedItems, craftingQueue: newQueue };

    if (station) {
      const newDropIds: string[] = [];
      const next = [...(state.droppedItems ?? [])];
      for (const [outId, qty] of Object.entries(outputs)) {
        if (qty <= 0) continue;
        const id = `craft-${outId}-${station.x}-${station.y}-${Date.now()}-${rng.random().toString(36).slice(2, 5)}`;
        next.push({ id, resourceId: outId, x: station.x, y: station.y, quantity: qty });
        newDropIds.push(id);
      }
      state = { ...state, droppedItems: next };
      for (const id of newDropIds) state = absorbDropIfOnStockpileTile(state, id);
    } else {
      // Station vanished mid-craft — fall back to crediting the general stockpile so output isn't lost.
      state = itemService.addItems(outputs, state);
    }

    // §5 casting-mold wear: if this recipe's station needs a mold (forge/bloomery), the clay mold
    // takes one cast's wear and cracks after enough pours.
    const mold = itemService.moldForRecipeStation(recipe?.station);
    if (mold) {
      for (let i = 0; i < quantity; i++) state = itemService.wearToolById(mold, state);
    }

    console.log(
      `[JobService] Crafting complete: ${itemId} ×${outputs[itemId] ?? 0} (${Object.keys(outputs).length} output types) at station ${entry.stationBuildingId ?? '—'}`
    );
    return state;
  }

  /** Phase 6: generate 'light' jobs for unlit campfires that have fuel. */
  /** Phase 6: generate 'refuel' jobs using per-building fuel settings where present. */
  private _syncRefuelJobs(jobs: Job[], gs: GameState): Job[] {
    // Remove refuel jobs whose building is gone, at max, or stockpile no longer
    // has enough fuel to fill to max (prevents partial top-ups).
    jobs = jobs.filter((j) => {
      if (j.type !== 'refuel') return true;
      const b = (gs.buildings ?? []).find((b) => b.id === j.buildingId);
      if (!b || b.status !== 'complete') return false;
      if (b.fuelSettings?.paused) return false;
      const maxFuel = buildingService.getBuildingById(b.type)?.maxFuel ?? 60;
      const fuelRatio = (b.fuel ?? 0) / Math.max(maxFuel, 1);
      if (fuelRatio >= fuelRules.getRefuelThresholdRatio(b)) return false;
      const needed = maxFuel - (b.fuel ?? 0);
      return needed > 0 && fuelRules.canSatisfyRefuelRequirements(gs, b, needed);
    });

    for (const b of gs.buildings ?? []) {
      if (b.status !== 'complete') continue;
      const bDef = buildingService.getBuildingById(b.type);
      if (!bDef?.maxFuel) continue;
      if (b.fuelSettings?.paused) continue;
      const fuelRatio = (b.fuel ?? 0) / Math.max(bDef.maxFuel, 1);
      if (fuelRatio >= fuelRules.getRefuelThresholdRatio(b)) continue;
      const needed = bDef.maxFuel - (b.fuel ?? 0);
      if (needed <= 0) continue;
      // Only queue refuel when stockpile can fully top up the tank.
      if (!fuelRules.canSatisfyRefuelRequirements(gs, b, needed)) continue;
      const exists = jobs.some((j) => j.type === 'refuel' && j.buildingId === b.id);
      if (!exists) {
        jobs.push({
          id: `refuel-${b.id}-${Date.now()}`,
          type: 'refuel',
          targetX: b.x,
          targetY: b.y,
          buildingId: b.id,
          workRequired: 5,
          workDone: 0,
          claimedBy: null
        });
      }
    }
    return jobs;
  }

  private _completeRefuel(job: Job, gs: GameState): GameState {
    if (!job.buildingId) return gs;
    const building = (gs.buildings ?? []).find((b) => b.id === job.buildingId);
    if (!building) return gs;
    const maxFuel = buildingService.getBuildingById(building.type)?.maxFuel ?? 60;
    const stockpile = gs.stockpile ?? {};
    const consumed: Record<string, number> = {};
    const allowedFuelIds = new Set(building.fuelSettings?.allowedFuelItemIds ?? []);
    const hasFuelFilter = allowedFuelIds.size > 0;
    const requirements = fuelRules.getRefuelRequirements(building.type);

    if ((stockpile[requirements.tinderItemId] ?? 0) < requirements.tinderAmount) return gs;
    if (requirements.tinderAmount > 0) {
      consumed[requirements.tinderItemId] = requirements.tinderAmount;
    }

    let currentFuel = building.fuel ?? 0;
    // §2 fuel-heat gate: a station only accepts fuel hot enough for it (minFuelHeat) — a
    // bloomery won't light on green wood; charcoal/coal are needed for smelting heat.
    const minHeat = buildingService.getBuildingById(building.type)?.minFuelHeat ?? 0;
    // Track which items to consume (read-only from aggregate; apply via consumeFromStockpiles)
    for (const item of ITEMS_DATABASE) {
      if ((item.fuelValue ?? 0) <= 0) continue;
      if ((item.fuelHeat ?? 1) < minHeat) continue;
      if (hasFuelFilter && !allowedFuelIds.has(item.id)) continue;
      while (currentFuel < maxFuel) {
        const available = (stockpile[item.id] ?? 0) - (consumed[item.id] ?? 0);
        if (available <= 0) break;
        consumed[item.id] = (consumed[item.id] ?? 0) + 1;
        currentFuel = Math.min(currentFuel + item.fuelValue!, maxFuel);
      }
    }
    if (currentFuel === (building.fuel ?? 0)) return gs; // nothing added
    if (!fuelRules.hasRequiredFuelTypesForRefuel(consumed, requirements)) return gs;
    const newBuildings = (gs.buildings ?? []).map((b) =>
      b.id === job.buildingId ? { ...b, fuel: currentFuel, lit: currentFuel > 0 } : b
    );
    console.log(`[JobService] Campfire refuelled to ${currentFuel}/${maxFuel}: ${job.buildingId}`);
    const afterConsume = consumeFromStockpiles(gs, consumed);
    return { ...afterConsume, buildings: newBuildings };
  }

  private _resourceMatchesDesignation(
    designationType: DesignationType,
    resourceId: string
  ): boolean {
    if (!HARVEST_DTYPES.includes(designationType)) return false;
    const def = resourceObjectService.getById(resourceId);
    if (!def) return true;
    return def.designationTypes.includes(designationType);
  }

  /**
   * Returns false if the zone's filter excludes this tile resource.
   * A resource passes if at least one of its yielded items falls in allowedCategories
   * and is not in blockedItems.
   */
  private _resourceMatchesFilter(
    designationType: DesignationType,
    resourceId: string,
    gs: GameState,
    tileKey?: string
  ): boolean {
    let filter: import('../core/types').ZoneFilter | undefined;
    if (tileKey) {
      const instanceId = gs.designationZoneId?.[tileKey];
      if (instanceId) {
        const inst = (gs.zoneInstances ?? []).find((z) => z.id === instanceId);
        filter = inst?.filter;
      }
    }
    filter =
      filter ??
      gs.zoneFilters?.[designationType as import('$lib/game/core/types.js').FilterableZoneType];
    if (!filter || filter.allowedCategories.length === 0) return true;
    const def = resourceObjectService.getById(resourceId);
    if (!def) return true;
    const interaction =
      resourceObjectService.getInteractionByDesignationType(resourceId, designationType) ??
      def.interaction;
    return interaction.yields.some((y) => this._itemMatchesFilter(y.itemId, filter!));
  }

  /** Check whether a single item ID passes a ZoneFilter. */
  private _itemMatchesFilter(itemId: string, filter: ZoneFilter): boolean {
    if (filter.blockedItems.includes(itemId)) return false;
    const item = ITEMS_DATABASE.find((i) => i.id === itemId);
    return item ? filter.allowedCategories.includes(item.category) : false;
  }

  // ------------------------------------------------------------------ //
  // PRIVATE — HELPERS                                                   //
  // ------------------------------------------------------------------ //
  // PUBLIC HELPERS                                                       //
  // ------------------------------------------------------------------ //

  /**
   * Return the labor priority level (0–4) this pawn has assigned to the given job.
   * 0 = disabled, 1 = low, 2 = normal (default), 3 = high, 4 = critical.
   */
  getJobLaborLevel(job: Job, pawn: Pawn, gs: GameState): number {
    const assignment = gs.workAssignments?.[pawn.id];
    const laborSettings = assignment?.laborSettings ?? {};
    const legacyPriorities = assignment?.workPriorities ?? {};
    const workKey = this._jobTypeToWorkKey(job, gs);
    if (workKey in laborSettings) return laborSettings[workKey] ?? 2;
    if (workKey in legacyPriorities) return Math.max(0, Math.min(4, legacyPriorities[workKey]));
    return 2; // LABOR_LEVEL.NORMAL default
  }

  /** Public accessor for work-category mapping (used by PawnStateMachine for stat wiring). */
  getJobWorkCategory(job: WorkKeyJob, gs?: GameState): string {
    return this._jobTypeToWorkKey(job, gs);
  }

  /** Whether low light slows this job type (§G light→work). Defaults to true; jobs.jsonc sets it
   *  false for carrying jobs (haul/fetch/refuel) that don't need close sight. */
  isJobLightAffected(type: string): boolean {
    return JOB_DEF_BY_ID.get(type)?.lightAffected !== false;
  }

  /** Colony job type ids that have a registered behaviour handler (= jobs.jsonc ids). Exposed for
   *  the drift-guard test and tooling. */
  jobTypeIds(): string[] {
    return Object.keys(this.handlers);
  }

  // ------------------------------------------------------------------ //

  /**
   * ADR-009 tool gating (R4, step 1 = colony stock): does the colony hold a tool that satisfies
   * this harvest's `interaction.toolRequirement`? Tool-free interactions (toolRequirement null —
   * foraging, surface-stone scavenging) always pass. A required tool is satisfied when the
   * stockpile holds ANY tool listed in the matching work category's `toolsRequired`. (Step 2 —
   * per-pawn claimed inventory + minTier — is a later refinement.)
   */
  private _colonyHasHarvestTool(job: Job, gs: GameState): boolean {
    if (!job.resourceId) return true;
    const def = resourceObjectService.getById(job.resourceId);
    if (!def) return true;
    const dtype = (gs.designations ?? {})[`${job.targetX},${job.targetY}`] as
      | DesignationType
      | undefined;
    const interaction =
      (dtype
        ? resourceObjectService.getInteractionByDesignationType(job.resourceId, dtype)
        : undefined) ?? def.interaction;
    const req = interaction?.toolRequirement;
    if (!req) return true; // tool-free harvest
    const tools = WORK_CATEGORIES.find((w) => w.id === req.workType)?.toolsRequired ?? [];
    if (tools.length === 0) return true; // category lists no gating tools
    return tools.some((t) => (gs.stockpile?.[t] ?? 0) > 0);
  }

  /** Map Job to the work category key used in WorkAssignment.laborSettings */
  private _jobTypeToWorkKey(job: WorkKeyJob, gs?: GameState): string {
    const def = JOB_DEF_BY_ID.get(job.type);

    // Dynamic: a harvest's labor category is read off the harvested resource's interaction
    // (designation-specific when gs is available, else the resource's default interaction) — so a
    // single `harvest` job type still maps to woodcutting / mining / foraging / … per resource.
    if (def?.workCategorySource === 'designation') {
      const designationType = gs
        ? ((gs.designations ?? {})[`${job.targetX},${job.targetY}`] as DesignationType | undefined)
        : undefined;
      const rdef = resourceObjectService.getById(job.resourceId ?? '');
      const interaction =
        designationType && rdef
          ? (resourceObjectService.getInteractionByDesignationType(
              job.resourceId ?? '',
              designationType
            ) ?? rdef.interaction)
          : rdef?.interaction;
      return interaction?.workCategory ?? 'foraging';
    }

    // Static mapping from jobs.jsonc. FSM-internal kinds (eat/sleep/need) have no JobDef and map to
    // their own id, matching the historical behaviour.
    return def?.workCategory ?? job.type;
  }
}

export const jobService = new JobServiceImpl();
