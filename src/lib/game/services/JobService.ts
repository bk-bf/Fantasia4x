/**
 * JobService — Phase 5a
 *
 * Central job system: generates discrete jobs from world state, allows
 * pawns to claim and advance them, and handles completion side-effects.
 *
 * Port of Celestia job_service.gd, adapted for SvelteKit + immutable state.
 * Called from GameEngineImpl at the START of each turn (generateJobs) and
 * indirectly through PawnStateMachine (claimJob / advanceJob / releaseJob).
 *
 * P-4 (ADR-017 handler split): the per-job-type generate/complete behaviour lives in
 * services/jobs/<type>.ts modules; this service owns the registry that binds them, the public job
 * API (claim/advance/select), dispatch, claim-gating, and the job→work-category mapping. Shared
 * reserve-and-fetch staging helpers are in services/jobs/staging.ts; zone/designation predicates in
 * services/jobs/filters.ts; refuel rules in services/fuelRules.ts.
 */

import type { DesignationType, DroppedItem, GameState, Job, JobDef, Pawn } from '../core/types';
import { manhattan } from '../core/distance';
import { WORK_CATEGORIES } from '../core/Work';
import jobsData from '../database/jobs.jsonc';
import { resourceObjectService } from './ResourceObjectService';
import { itemService } from './ItemService';
import { recipeService } from './RecipeService';
import * as harvest from './jobs/harvest';
import * as haul from './jobs/haul';
import * as construct from './jobs/construct';
import * as deconstruct from './jobs/deconstruct';
import * as fetch from './jobs/fetch';
import * as craft from './jobs/craft';
import * as caretake from './jobs/caretake';
import * as refuel from './jobs/refuel';
import * as repair from './jobs/repair';
import * as plant from './jobs/plant';
import { isOrderSupplied as stagingIsOrderSupplied } from './jobs/staging';

// ===== JOB REGISTRY (data-driven, jobs.jsonc) =====
// The declarative half of the job system. jobs.jsonc lists the colony job types + their
// work-category mapping / claim-gating; the behavioural half (generate + complete) is bound by id
// in JobServiceImpl.handlers below. See ADR-017.
const JOB_DEFS = jobsData as unknown as JobDef[];
const JOB_DEF_BY_ID = new Map<string, JobDef>(JOB_DEFS.map((d) => [d.id, d]));

/** The colony pool job types — the subset of Job['type'] that JobService generates & completes. */
type JobPoolType =
  | 'harvest'
  | 'haul'
  | 'construct'
  | 'deconstruct'
  | 'fetch'
  | 'craft'
  | 'caretake'
  | 'refuel'
  | 'repair'
  | 'plant';
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
  craftQueueId?: string;
};

// ===== WORK CONSTANTS =====

/** Work-points per turn a pawn delivers (base rate; later modifiable by stats). */
// Deliberately PER-TURN: work delivery is gated through the turn-based job/state-machine
// flow (claimJob/advanceJob), so smoothing it would mean running job advancement every
// tick — high risk for purely cosmetic progress, and completion timing is unchanged either way.
export const BASE_WORK_RATE = 1;

// ===== JOB SERVICE =====

class JobServiceImpl {
  // Behaviour registry: binds each jobs.jsonc id to its generate/complete implementation (the
  // services/jobs/<type>.ts modules). This is the ONLY place a job type's behaviour is wired —
  // generateJobs and _completeJob both dispatch through it, so there is no hardcoded type switch.
  private readonly handlers: Record<JobPoolType, JobHandler> = {
    harvest: { generate: harvest.generate, complete: harvest.complete },
    haul: { generate: haul.generate, complete: haul.complete },
    construct: { generate: construct.generate, complete: construct.complete },
    deconstruct: { generate: deconstruct.generate, complete: deconstruct.complete },
    fetch: { generate: fetch.generate, complete: fetch.complete },
    craft: { generate: craft.generate, complete: craft.complete },
    caretake: { generate: caretake.generate, complete: caretake.complete },
    refuel: { generate: refuel.generate, complete: refuel.complete },
    repair: { generate: repair.generate, complete: repair.complete },
    plant: { generate: plant.generate, complete: plant.complete }
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
  /** ADR-016: retry input reservation for `pending` craft orders (queued without materials). Run
   *  each tick before generateJobs so a newly-stocked order starts fetching promptly. */
  reservePendingCraftOrders(gameState: GameState): GameState {
    return craft.reservePendingOrders(gameState);
  }

  generateJobs(gameState: GameState): GameState {
    // Re-home any stored pile the player has just filtered out of its stockpile/bin: flip it back to a
    // loose drop so it stops counting as stored, the haul sync below relocates it to another accepting
    // store (if one exists), and its URGENT/FORBID buttons reappear. No-op (no realloc) when nothing
    // was evicted — the common path.
    gameState = haul.reconcileEvictedDrops(gameState);

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

      // repairAllowlist: a building may restrict who is allowed to repair it.
      if (claimGate === 'repairAllowlist' && j.buildingId) {
        const building = (gameState.buildings ?? []).find((b) => b.id === j.buildingId);
        const allowedPawns = building?.repairSettings?.allowedRepairPawnIds ?? [];
        if (allowedPawns.length > 0 && !allowedPawns.includes(pawn.id)) return false;
      }

      // harvestTool (ADR-009 step 2): a tool-gated harvest (woodcut→axe, mine→pick, …) is claimable
      // when this pawn already holds a qualifying tool, OR the colony has one in stock (the pawn
      // auto-grabs it en route — see the tool-fetch detour in handlers/work). When NEITHER has one,
      // the job stays open until a tool is crafted. Tool-free scavenges (no toolRequirement) pass.
      // Same per-pawn tool gate for harvest (axe/pick) AND craft (knife at butcher/tannery): the job
      // is claimable if the pawn holds a qualifying tool OR the colony has one (auto-grab en route).
      if (claimGate === 'harvestTool' || claimGate === 'craftTool') {
        const req = this.requiredToolForJob(j, gameState);
        if (
          req &&
          !this.pawnHasToolFor(pawn, req.workType, req.minTier) &&
          !this.colonyHasToolFor(gameState, req.workType, req.minTier)
        )
          return false;
      }

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
      // Urgent-flagged haul jobs jump to the very top of the queue, ahead of labor level + distance.
      const urgA = a.urgent ? 1 : 0;
      const urgB = b.urgent ? 1 : 0;
      if (urgB !== urgA) return urgB - urgA;
      const workKeyA = this._jobTypeToWorkKey(a, gameState);
      const workKeyB = this._jobTypeToWorkKey(b, gameState);
      const labA = laborSettings[workKeyA] ?? 2;
      const labB = laborSettings[workKeyB] ?? 2;
      if (labB !== labA) return labB - labA;
      const dA = manhattan(a.targetX, a.targetY, px, py);
      const dB = manhattan(b.targetX, b.targetY, px, py);
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

  /** Public: is this craft order's station present and all inputs staged on it? (Passive furnaces.) */
  isOrderSupplied(order: import('../core/types').CraftingInProgress, gs: GameState): boolean {
    return stagingIsOrderSupplied(order, gs);
  }

  /**
   * ADR-016: complete a craft ORDER (independent of a pawn job). Delegates to the craft handler;
   * used by passive furnace production (GameEngineImpl.processPassiveProduction).
   */
  completeCraftOrder(entry: import('../core/types').CraftingInProgress, gs: GameState): GameState {
    return craft.completeCraftOrder(entry, gs);
  }

  // ------------------------------------------------------------------ //
  // PRIVATE — JOB COMPLETION DISPATCH                                    //
  // ------------------------------------------------------------------ //

  private _completeJob(job: Job, gameState: GameState): GameState {
    // Remove the finished job from the pool, then run its registered completion side-effect.
    const jobs = (gameState.jobs ?? []).filter((j) => j.id !== job.id);
    const state: GameState = { ...gameState, jobs };
    const handler = this.handlers[job.type as JobPoolType];
    return handler ? handler.complete(job, state) : state;
  }

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

  /** The human label for a job type from jobs.jsonc (`caretake` → "Tend", `construct` → "Build"…). The
   *  UI status reads this so a working pawn's tag is task-specific instead of a generic "Working". */
  getJobLabel(type: string): string | undefined {
    return JOB_DEF_BY_ID.get(type)?.label;
  }

  /** Optional work-SFX override id for a job type (jobs.jsonc `audio`); undefined → resolve by work
   *  category. Read by the audio layer (AudioController) for the medieval labour sounds. */
  getJobAudio(type: string): string | undefined {
    return JOB_DEF_BY_ID.get(type)?.audio;
  }

  /** Colony job type ids that have a registered behaviour handler (= jobs.jsonc ids). Exposed for
   *  the drift-guard test and tooling. */
  jobTypeIds(): string[] {
    return Object.keys(this.handlers);
  }

  // ------------------------------------------------------------------ //
  // PRIVATE — CLAIM GATING & WORK-CATEGORY MAPPING                       //
  // ------------------------------------------------------------------ //

  /**
   * ADR-009 step 2 — the tool requirement for a tool-gated job (`{workType, minTier}`), or null when
   * tool-free. CRAFT jobs read the recipe's `toolRequirement` (override) or its station's
   * (data-driven, recipes.jsonc/buildings.jsonc). HARVEST jobs read the resource's interaction
   * (designation-specific when available) + the matching work category's gating tool list.
   */
  requiredToolForJob(job: Job, gs: GameState): { workType: string; minTier: number } | null {
    // Craft jobs: gate on the recipe's station tool (e.g. butcher_spot → a knife, tannery → a knife).
    if (job.type === 'craft' || job.craftQueueId) {
      const order = (gs.craftingQueue ?? []).find((e) => e.id === job.craftQueueId);
      if (!order) return null;
      const recipe = recipeService.getRecipeForItem(order.item.id);
      const req = recipeService.toolRequirementForRecipe(recipe);
      if (!req) return null;
      const tools = WORK_CATEGORIES.find((w) => w.id === req.workType)?.toolsRequired ?? [];
      if (tools.length === 0) return null; // category lists no gating tools
      return req;
    }
    // Harvest jobs:
    if (!job.resourceId) return null;
    const def = resourceObjectService.getById(job.resourceId);
    if (!def) return null;
    const dtype = (gs.designations ?? {})[`${job.targetX},${job.targetY}`] as
      | DesignationType
      | undefined;
    const interaction =
      (dtype
        ? resourceObjectService.getInteractionByDesignationType(job.resourceId, dtype)
        : undefined) ?? def.interaction;
    const req = interaction?.toolRequirement;
    if (!req) return null; // tool-free harvest
    const tools = WORK_CATEGORIES.find((w) => w.id === req.workType)?.toolsRequired ?? [];
    if (tools.length === 0) return null; // category lists no gating tools
    return { workType: req.workType, minTier: req.minTier ?? 1 };
  }

  /** Tool ids in a work category whose item `tier` meets `minTier` (default tier 1). */
  private _qualifyingToolIds(workType: string, minTier: number): string[] {
    const tools = WORK_CATEGORIES.find((w) => w.id === workType)?.toolsRequired ?? [];
    return tools.filter(
      (id) => ((itemService.getItemById(id) as { tier?: number } | undefined)?.tier ?? 1) >= minTier
    );
  }

  /**
   * ADR-009 step 2 — does this pawn PERSONALLY hold a qualifying tool (equipped in a slot, e.g. the
   * `belt` tool slot, or carried as a tracked inventory instance)? This is the real per-pawn gate: a
   * pawn can only WORK a tool-gated job while holding the tool. Tools are NOT read from
   * `inventory.items` (that's haul cargo — INV-1).
   */
  pawnHasToolFor(pawn: Pawn, workType: string, minTier: number): boolean {
    const ids = this._qualifyingToolIds(workType, minTier);
    if (ids.length === 0) return false;
    if (Object.values(pawn.equipment ?? {}).some((inst) => inst && ids.includes(inst.itemId)))
      return true;
    if ((pawn.inventory?.instances ?? []).some((inst) => ids.includes(inst.itemId))) return true;
    // Also a tool sitting in the bulk `inventory.items` count map counts as held.
    const bulk = pawn.inventory?.items ?? {};
    return ids.some((id) => (bulk[id] ?? 0) > 0);
  }

  /** Does the colony hold a qualifying tool in stock? Keeps a gated job claimable so a toolless pawn
   *  can be sent to grab one (the auto-grab detour in handlers/work); when NEITHER the pawn nor the
   *  colony has a tool, the job stays open until one is crafted (bootstrap-safe). */
  colonyHasToolFor(gs: GameState, workType: string, minTier: number): boolean {
    return this._qualifyingToolIds(workType, minTier).some((id) => (gs.stockpile?.[id] ?? 0) > 0);
  }

  /** Nearest stored, unreserved tool drop satisfying (workType, minTier) — the auto-grab target. */
  findStockToolDropFor(
    gs: GameState,
    workType: string,
    minTier: number,
    near?: { x: number; y: number }
  ): DroppedItem | null {
    const ids = new Set(this._qualifyingToolIds(workType, minTier));
    if (ids.size === 0) return null;
    let best: DroppedItem | null = null;
    let bestD = Infinity;
    for (const d of gs.droppedItems ?? []) {
      if (!d.stored || (d.quantity ?? 0) <= 0 || d.reservedFor) continue;
      if (!ids.has(d.resourceId)) continue;
      if (!near) return d;
      const dd = manhattan(d.x, d.y, near.x, near.y);
      if (dd < bestD) {
        bestD = dd;
        best = d;
      }
    }
    return best;
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

    // Dynamic: a craft job producing a prepared MEAL (cooked dish — stew/bread/pie/pottage/roast) is a
    // cooking job — so the Cooking labor slider (Work.ts `cooking`) drives its priority and
    // `cooking_speed`/`cooking_quality` apply. Raw foods come from harvest, not craft; any other craft
    // output falls through to the static `crafting` category below.
    if (def?.workCategorySource === 'recipe-output') {
      const order = (gs?.craftingQueue ?? []).find((o) => o.id === job.craftQueueId);
      const cat = order ? itemService.getItemById(order.item.id)?.category : undefined;
      if (cat === 'meal') return 'cooking';
    }

    // Static mapping from jobs.jsonc. FSM-internal kinds (eat/sleep/need) have no JobDef and map to
    // their own id, matching the historical behaviour.
    return def?.workCategory ?? job.type;
  }
}

export const jobService = new JobServiceImpl();
