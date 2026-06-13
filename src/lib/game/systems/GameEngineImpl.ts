import type {
  GameEngine,
  GameEngineConfig,
  TurnProcessingResult,
  SystemInteractionResult
} from './GameEngine';
import type { BuildingEffectResult } from './ModifierSystem';
import type { GameState, EntityNeeds } from '../core/types';
import { GameStateManager, reserveForOrder, releaseReservation } from '../core/GameState';
import { gameState } from '$lib/stores/gameState';
import { get } from 'svelte/store';
import { modifierSystem } from './ModifierSystem';
import { workService } from '../services/WorkService';
import { itemService } from '../services/ItemService';
import { recipeService } from '../services/RecipeService';
import { pawnService } from '../services/PawnService';
import { buildingService } from '../services/BuildingService';
import { researchService } from '../services/ResearchService';
import { WORK_CATEGORIES } from '../core/Work';
import itemsData from '../database/items.jsonc';
import buildingsData from '../database/buildings.jsonc';

import { pawnStateMachineService } from './PawnStateMachine';
import { jobService } from '../services/JobService';
import { wasmPathfinderService } from '../services/WasmPathfinderService';
import { resourceObjectService } from '../services/ResourceObjectService';
import { entityService } from '../services/EntityService';
import { combatService } from './Combat';
import { TICKS_PER_SECOND, ticksFromSeconds, perTick } from '../core/time';
import { buildPathfindingGridsWithBlocked } from '../services/PathfinderService';
import { occupancyService } from '../services/OccupancyService';
import { isGameDebug, gatedConsole } from '../core/log';
import type { WorkCategory } from '../core/types';
import type { Pawn } from '../core/types';
import { rng } from '../core/rng';

const ITEMS_DATABASE = itemsData as unknown as import('../core/types').Item[];
const AVAILABLE_BUILDINGS = buildingsData as unknown as import('../core/types').Building[];

/**
 * How many sim ticks pass between UI store notifications. The sim runs at
 * TICKS_PER_SECOND (60); notifying every 4th tick pushes UI updates at ~15 Hz.
 * The WebGL renderer interpolates pawn motion every animation frame, so movement
 * stays smooth regardless. Between notifications the engine still refreshes the
 * store's held value each tick (via pushFromEngine), so `get(gameState)` is
 * always current and manual edits are never lost.
 */
const UI_PUSH_INTERVAL = Math.max(1, Math.round(TICKS_PER_SECOND / 15));

export class GameEngineImpl implements GameEngine {
  private gameState: GameState | null = null;
  private gameStateManager: GameStateManager | null = null;
  private config: GameEngineConfig;
  private lastTurnProcessed = 0;
  /** Counts ticks toward the next throttled UI notification (see UI_PUSH_INTERVAL). */
  private uiPushCounter = 0;

  constructor(config: GameEngineConfig = {}) {
    this.config = {
      enableDebugLogging: false,
      validateStateOnEachUpdate: false,
      maxTurnsPerBatch: 10,
      enablePerformanceMetrics: false,
      errorRecoveryMode: 'lenient',
      ...config
    };
  }

  // ===== PAWN SERVICE COORDINATION METHODS =====

  getPawnNeeds(pawnId: string): EntityNeeds {
    if (!this.gameState) return { hunger: 0, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0 };

    // COORDINATION: Delegate to PawnService instead of direct pawn access
    const pawn = this.gameState.pawns.find((p) => p.id === pawnId);
    return pawn?.needs || { hunger: 0, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0 };
  }

  getPawnActivities(pawnId: string): string[] {
    if (!this.gameState) return [];
    return pawnService.getPawnActivities(pawnId, this.gameState);
  }

  getPawnNeedStatus(pawnId: string): { critical: string[]; warning: string[]; normal: string[] } {
    if (!this.gameState) return { critical: [], warning: [], normal: [] };
    return pawnService.getPawnNeedStatus(pawnId, this.gameState);
  }

  // ===== SERVICE COORDINATION METHODS FOR UI =====

  // COORDINATION: ItemService methods for UI components
  getItemById(itemId: string): any {
    return itemService.getItemById(itemId);
  }

  getAllItems(): any[] {
    // COORDINATION: Return all items from database
    return ITEMS_DATABASE;
  }

  getCraftableItems(): any[] {
    // Always read from the live Svelte store so building/inventory changes are reflected immediately
    const currentState = get(gameState);
    if (!currentState) return [];
    return itemService.getCraftableItems(currentState);
  }

  craftItem(
    itemId: string,
    quantity: number = 1,
    selectedIngredients?: Record<string, string>
  ): void {
    // Sync from store first so we check against the current buildings/materials
    const currentState = get(gameState);
    if (!currentState) return;
    this.gameState = { ...currentState };
    gatedConsole.log(`[GameEngine] Coordinating crafting: ${quantity}x ${itemId}`);

    const item = itemService.getItemById(itemId);
    if (!item) return;

    // Butchery is a dedicated multi-yield path (not yet folded into ADR-016 reserve-and-fetch):
    // one carcass → meat + hide + bone, scaled by intactness. Processed instantly here.
    if (item.isCarcass && item.yields) {
      this.craftButchery(item);
      this.updateStores();
      return;
    }

    // ADR-016 reserve-and-fetch: do NOT consume materials here. Lock the inputs to this order,
    // pick a workstation, and queue the order. Pawns then fetch the reserved inputs to the
    // station and craft them there; the output spawns on the station (see JobService).
    if (!itemService.canCraftItem(itemId, this.gameState)) {
      this.updateStores();
      return;
    }

    const resolved =
      selectedIngredients ?? itemService.autoSelectIngredients(itemId, this.gameState) ?? {};
    const activeCost = itemService.resolveActiveCost(item.id, this.gameState, resolved);
    if (!activeCost) {
      this.updateStores();
      return;
    }

    const recipe = recipeService.getRecipeForItem(item.id);
    // Inputs scale by quantity (one recipe run per queued unit).
    const inputs: Record<string, number> = {};
    for (const [id, q] of Object.entries(activeCost)) inputs[id] = q * quantity;

    const stationType = recipe?.station ?? null;
    const stationBuildingId = this.pickStationInstance(stationType, this.gameState);

    // Reserve every input from available stock (does not delete it). If anything is short,
    // release what we reserved and abort — affordability was checked but stock can race.
    const orderId = crypto.randomUUID();
    let gs = this.gameState;
    let allReserved = true;
    for (const [id, q] of Object.entries(inputs)) {
      const res = reserveForOrder(gs, id, q, orderId);
      gs = res.state;
      if (res.reserved < q) {
        allReserved = false;
        break;
      }
    }
    if (!allReserved) {
      this.gameState = releaseReservation(gs, orderId);
      this.updateStores();
      return;
    }

    const order: import('../core/types').CraftingInProgress = {
      id: orderId,
      item,
      quantity,
      workRequired: (recipe?.workAmount ?? 1) * quantity,
      workDone: 0,
      inputs,
      stationType,
      stationBuildingId,
      startedAt: gs.turn,
      selectedIngredients: Object.keys(resolved).length > 0 ? resolved : undefined
    };

    this.gameState = { ...gs, craftingQueue: [...(gs.craftingQueue ?? []), order] };
    this.updateStores();
  }

  /**
   * Butchery — delegated to ItemService (the engine coordinates, the service owns the math).
   * Processes one carcass into its multi-yield outputs, scaled by intactness/tools/building.
   */
  private craftButchery(carcassItem: import('../core/types').Item): void {
    if (!this.gameState) return;
    this.gameState = itemService.processButchery(carcassItem, this.gameState);
  }

  /**
   * ADR-016: choose the workstation instance an order's inputs are fetched to and crafted at —
   * the first complete building of the recipe's station type (craft_spot when the recipe has no
   * explicit station). Returns undefined when none exists (canCraftItem already gates on this).
   */
  private pickStationInstance(
    stationType: string | null | undefined,
    gs: GameState
  ): string | undefined {
    const wanted = stationType ?? 'craft_spot';
    const station = (gs.buildings ?? []).find(
      (b) => b.type === wanted && b.status === 'complete'
    );
    return station?.id;
  }

  // COORDINATION: BuildingService methods for UI components
  getBuildingById(buildingId: string): any {
    return buildingService.getBuildingById(buildingId);
  }

  getAllBuildings(): any[] {
    // COORDINATION: Return all buildings from database
    return AVAILABLE_BUILDINGS;
  }

  getBuildableBuildings(): any[] {
    if (!this.gameState) return [];
    return buildingService.getAvailableBuildings(this.gameState);
  }

  constructBuilding(buildingId: string, locationId?: string): void {
    if (!this.gameState) return;
    gatedConsole.log(
      `[GameEngine] Coordinating building construction: ${buildingId} at ${locationId || 'default location'}`
    );

    // COORDINATION: Check if can build and add to building queue
    if (buildingService.canBuildBuilding(buildingId, this.gameState)) {
      const building = buildingService.getBuildingById(buildingId);
      if (building) {
        // Add to building queue
        const buildingInProgress = {
          building: building,
          turnsRemaining: building.workAmount || 1,
          startedAt: this.gameState.turn,
          locationId: locationId || 'default'
        };

        // Consume materials
        if (building.buildingCost) {
          this.gameState = itemService.consumeItems(building.buildingCost, this.gameState);
        }

        // Add to queue
        this.gameState = {
          ...this.gameState,
          buildingQueue: [...(this.gameState.buildingQueue || []), buildingInProgress]
        };
      }
    }

    this.updateStores();
  }

  // COORDINATION: ResearchService methods for UI components
  getResearchById(researchId: string): any {
    return researchService.getResearchById(researchId);
  }

  getAllResearch(): any[] {
    return researchService.getAllResearch();
  }

  getAvailableResearch(): any[] {
    if (!this.gameState) return [];
    return researchService.getAvailableResearch(this.gameState);
  }

  startResearch(researchId: string): void {
    if (!this.gameState) return;
    gatedConsole.log(`[GameEngine] Coordinating research start: ${researchId}`);
    this.gameState = researchService.startResearch(researchId, this.gameState);
    this.updateStores();
  }

  // COORDINATION: WorkService methods for UI components
  assignPawnToWork(pawnId: string, workType: string): void {
    if (!this.gameState) return;
    gatedConsole.log(`[GameEngine] Coordinating work assignment: ${pawnId} to ${workType}`);
    this.gameState = workService.assignPawnToWork(pawnId, workType, this.gameState);
    this.updateStores();
  }

  unassignPawnFromWork(pawnId: string): void {
    if (!this.gameState) return;
    gatedConsole.log(`[GameEngine] Coordinating work unassignment: ${pawnId}`);

    // COORDINATION: Remove work assignment by clearing priorities
    if (this.gameState.workAssignments && this.gameState.workAssignments[pawnId]) {
      this.gameState = {
        ...this.gameState,
        workAssignments: {
          ...this.gameState.workAssignments,
          [pawnId]: {
            ...this.gameState.workAssignments[pawnId],
            workPriorities: {},
            currentWork: undefined
          }
        }
      };
    }

    this.updateStores();
  }

  getWorkAssignments(): Record<string, any> {
    if (!this.gameState) return {};
    return this.gameState.workAssignments || {};
  }

  // ===== CORE COORDINATION - MOVED FROM GAMESTATE =====

  processGameTurn(): TurnProcessingResult {
    if (!this.gameState || !this.gameStateManager) {
      return {
        success: false,
        turnsProcessed: 0,
        systemsUpdated: [],
        errors: ['GameEngine not initialized']
      };
    }

    try {
      // Sync from Svelte store so user changes (work priorities, etc.) made between ticks are preserved
      this.gameState = { ...get(gameState) };

      // Increment the tick counter (gameState.turn counts ticks).
      this.gameState.turn += 1;

      // On-demand per-phase profiler. Zero cost unless toggled on at runtime
      // via `profileTurns()` in the dev console (sets globalThis.__profileTurns).
      // When active, average phase timings log as `[PROF]` once per second.
      const prof = (globalThis as any).__profileTurns ? ((globalThis as any).__prof ??= {}) : null;
      const t = prof
        ? (label: string, fn: () => void) => {
            const s = performance.now();
            fn();
            const e = (prof[label] ??= { sum: 0, n: 0 });
            e.sum += performance.now() - s;
            e.n++;
          }
        : (_label: string, fn: () => void) => fn();

      t('needsTick', () => {
        this.gameState = pawnService.processNeedsTick(this.gameState!);
        this.gameState = pawnService.processAutoDrink(this.gameState!);
        this.gameState = pawnService.processAutoWash(this.gameState!);
      });
      t('itemDecay', () => {
        this.gameState = itemService.stepItemDecay(this.gameState!);
      });
      t('itemDeterioration', () => {
        this.gameState = itemService.stepItemDeterioration(this.gameState!);
      });
      t('woodDrying', () => {
        this.gameState = itemService.stepWoodDrying(this.gameState!);
      });
      t('researchTick', () => {
        this.gameState = researchService.processResearchTick(this.gameState!);
      });
      t('generateJobs', () => {
        this.gameState = jobService.generateJobs(this.gameState!);
      });
      t('buildings', () => this.processBuildings());
      t('pawns', () => this.processPawns());
      t('resourceRegrowth', () => this.processResourceRegrowth());
      t('entityStep', () => {
        this.gameState = entityService.spawnEntities(this.gameState!);
        this.gameState = entityService.stepEntities(this.gameState!);
        this.gameState = entityService.advanceMobMovement(this.gameState!);
        this.gameState = entityService.stepHunger(this.gameState!);
        this.gameState = entityService.removeDead(this.gameState!);
      });
      t('combat', () => {
        const preCombatState = this.gameState!;
        this.gameState = combatService.tickCombat(this.gameState!, 1000 / TICKS_PER_SECOND);
        this.gameState = entityService.handleFreshCombatCorpses(preCombatState, this.gameState!);
      });
      this.debugLogPawns();

      this.lastTurnProcessed = this.gameState.turn;
      t('mgrUpdate', () => this.gameStateManager!.updateState(this.gameState!));
      // Throttled UI push: refresh the store value every tick, notify
      // subscribers at ~15 Hz (see UI_PUSH_INTERVAL).
      t('uiPush', () => {
        this.uiPushCounter = (this.uiPushCounter + 1) % UI_PUSH_INTERVAL;
        gameState.pushFromEngine(this.gameState!, this.uiPushCounter === 0);
      });

      if (prof && this.gameState.turn % TICKS_PER_SECOND === 0) {
        const out: Record<string, string> = {};
        let total = 0;
        for (const k of Object.keys(prof)) {
          const e = prof[k];
          out[k] = (e.sum / e.n).toFixed(3) + 'ms';
          total += e.sum / e.n;
        }
        out.TOTAL = total.toFixed(3) + 'ms';
        (globalThis as any).__profOut = out;
        console.log('[PROF] ' + JSON.stringify(out));
        for (const k of Object.keys(prof)) {
          prof[k].sum = 0;
          prof[k].n = 0;
        }
      }

      return {
        success: true,
        turnsProcessed: 1,
        systemsUpdated: ['pawns', 'work', 'buildings', 'research', 'crafting'],
        errors: []
      };
    } catch (error) {
      return {
        success: false,
        turnsProcessed: 0,
        systemsUpdated: [],
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Restore resources on tiles whose regrowth cooldown has expired.
   * Handles two key formats:
   *  - Simple:   `"resourceId"` → whole-resource cooldown (berry_bush, wildflower, etc.)
   *  - Compound: `"resourceId:itemId"` → per-yield cooldown (tree bark vs wood)
   *
   * For compound keys, the resource partially restores (count = 1) when the first
   * yield recovers so a new job can be claimed.  Full restoration happens once all
   * per-yield cooldowns for that resource have cleared.
   */
  private processResourceRegrowth(): void {
    if (!this.gameState) return;
    const gs = this.gameState;
    let anyChanged = false;

    // Cheap pre-scan: most ticks have no cooldown expiring. Rebuilding the whole
    // worldMap (38,400 tiles → new row arrays + per-tile closure) every tick is a
    // fixed O(map) tax independent of pawn count — catastrophic on large maps. Skip
    // the allocation entirely unless at least one tile actually has an expired
    // cooldown this tick.
    let needsRegrowth = false;
    outer: for (const row of gs.worldMap) {
      for (const tile of row) {
        const cd = tile.resourceCooldowns;
        if (!cd) continue;
        for (const k in cd) {
          if (gs.turn >= cd[k]) {
            needsRegrowth = true;
            break outer;
          }
        }
      }
    }
    if (!needsRegrowth) return;

    const newWorldMap = gs.worldMap.map((row) =>
      row.map((tile) => {
        const cooldowns = tile.resourceCooldowns;
        if (!cooldowns || Object.keys(cooldowns).length === 0) return tile;

        // Take a snapshot of the entries we need to process this turn.
        const expiredEntries = Object.entries(cooldowns).filter(([, turn]) => gs.turn >= turn);
        if (expiredEntries.length === 0) return tile;

        let updatedTile = tile;
        for (const [key] of expiredEntries) {
          const isCompound = key.includes(':');

          if (isCompound) {
            // Compound key: "resourceId:itemId"
            const colonIdx = key.indexOf(':');
            const resourceId = key.slice(0, colonIdx);

            // Remove this yield's cooldown.
            const newCooldowns = { ...updatedTile.resourceCooldowns };
            delete newCooldowns[key];

            // Check whether any other per-yield cooldowns for this resource remain.
            const anyStillCooling = Object.keys(newCooldowns).some((k) =>
              k.startsWith(resourceId + ':')
            );

            const def = resourceObjectService.getById(resourceId);
            let newResourceCount: number;
            if (anyStillCooling) {
              // Partial recovery — make node available (count = 1) so a job can be
              // created, but only the non-cooled yields will actually be harvested.
              newResourceCount = 1;
              gatedConsole.log(
                `[Regrowth] ${key} at (${tile.x},${tile.y}) recovered (partial — other yields still cooling)`
              );
            } else {
              // All yields recovered — full random restore.
              const [minAmt, maxAmt] = def?.nodeAmountRange ?? [1, 3];
              newResourceCount = minAmt + Math.floor(rng.random() * (maxAmt - minAmt + 1));
              gatedConsole.log(
                `[Regrowth] ${resourceId} at (${tile.x},${tile.y}) fully restored ×${newResourceCount}`
              );
            }

            updatedTile = {
              ...updatedTile,
              resources: { ...updatedTile.resources, [resourceId]: newResourceCount },
              resourceCooldowns: newCooldowns,
              // Restore blocking for non-walkable resources that have fully regrown.
              ...(!anyStillCooling && def?.walkable === false ? { walkable: false } : {})
            };
          } else {
            // Simple whole-resource cooldown.
            const def = resourceObjectService.getById(key);
            const [minAmt, maxAmt] = def?.nodeAmountRange ?? [1, 3];
            const restored = minAmt + Math.floor(rng.random() * (maxAmt - minAmt + 1));

            const newCooldowns = { ...updatedTile.resourceCooldowns };
            delete newCooldowns[key];
            updatedTile = {
              ...updatedTile,
              resources: { ...updatedTile.resources, [key]: restored },
              resourceCooldowns: newCooldowns,
              // Restore blocking for non-walkable resources that have regrown.
              ...(def?.walkable === false ? { walkable: false } : {})
            };
            gatedConsole.log(`[Regrowth] ${key} at (${tile.x},${tile.y}) regrew ×${restored}`);
          }
          anyChanged = true;
        }
        return updatedTile;
      })
    );

    if (anyChanged) this.gameState = { ...gs, worldMap: newWorldMap };
  }

  private debugLogPawns(): void {
    if (!this.gameState) return;
    // Per-pawn debug dump — only when hot-path debugging is explicitly enabled
    // (gameDebug(true)). Off by default so it costs nothing in normal play.
    if (!isGameDebug()) return;
    const gs = this.gameState;
    // The pipeline runs TICKS_PER_SECOND times per second — log at most once per
    // in-game second to avoid flooding the console.
    if (gs.turn % TICKS_PER_SECOND !== 0) return;
    const T = gs.turn;
    const wasmReady = wasmPathfinderService.isReady();
    const jobPool = (gs.jobs ?? []).length;
    const lines: string[] = [`[PAWN_DEBUG] T=${T} WASM=${wasmReady} jobs=${jobPool}`];
    for (const p of gs.pawns) {
      const pos = p.position ? `(${p.position.x},${p.position.y})` : 'no-pos';
      const state = (p.currentState ?? 'Idle').padEnd(18);
      const isMoving = p.isMoving ?? false;
      const pathLen = p.path?.length ?? 0;
      const pathIdx = p.pathIndex ?? 0;
      let target = 'no-job';
      if (p.activeJob) {
        target = `→(${p.activeJob.targetX},${p.activeJob.targetY}) ${p.activeJob.type}`;
        if (p.activeJob.resourceId) target += `/${p.activeJob.resourceId}`;
        if (p.activeJob.jobId) target += ` jid=${p.activeJob.jobId.slice(-6)}`;
      }
      const pathInfo = isMoving
        ? `mv ${pathIdx}/${pathLen}`
        : pathLen > 0
          ? `STUCK(path ${pathLen})`
          : 'still';
      const hunger = Math.floor(p.needs?.hunger ?? 0);
      const fatigue = Math.floor(p.needs?.fatigue ?? 0);
      lines.push(
        `  ${p.name.padEnd(14)} ${pos.padEnd(10)} [${state}] ${target.padEnd(38)} ${pathInfo.padEnd(12)} H:${hunger} F:${fatigue}`
      );
    }
    gatedConsole.log(lines.join('\n'));
  }

  private _processDraftOrders(state: GameState): GameState {
    let gs = state;
    // Solid bodies routed around (shared occupancy). Positions don't change within
    // this loop — assignPath only sets the path — so one snapshot serves every pawn;
    // each pawn's own start tile and its goal are kept walkable per call below.
    const blocked = occupancyService.blockedTiles(gs);
    for (const pawn of gs.pawns) {
      if (pawn.isAlive === false || !pawn.drafted || !pawn.draftTarget || !pawn.position) continue;
      const target = pawn.draftTarget;
      if (target.type === 'move') {
        if (pawn.position.x === target.x && pawn.position.y === target.y) {
          gs = pawnService.assignPath(pawn.id, [], gs);
          gs = {
            ...gs,
            pawns: gs.pawns.map((p) =>
              p.id === pawn.id ? { ...p, draftTarget: undefined, hasReachedDestination: true } : p
            )
          };
          continue;
        }
        const { walkable, costs, width, height } = buildPathfindingGridsWithBlocked(
          gs.worldMap,
          blocked,
          pawn.position.x,
          pawn.position.y,
          target.x,
          target.y
        );
        const path = wasmPathfinderService.findPath(
          walkable,
          costs,
          width,
          height,
          pawn.position.x,
          pawn.position.y,
          target.x,
          target.y
        );
        if (path && path.length > 0) {
          gs = pawnService.assignPath(pawn.id, path, gs);
        }
      } else if (target.type === 'attack') {
        let tx = -1,
          ty = -1;
        if (target.targetType === 'mob') {
          const mob = (gs.mobs ?? []).find((m) => m.id === target.targetId);
          if (!mob || mob.isAlive === false) {
            gs = {
              ...gs,
              pawns: gs.pawns.map((p) => (p.id === pawn.id ? { ...p, draftTarget: undefined } : p))
            };
            continue;
          }
          tx = mob.x;
          ty = mob.y;
        } else {
          const tp = gs.pawns.find((p) => p.id === target.targetId);
          if (!tp || tp.isAlive === false) {
            gs = {
              ...gs,
              pawns: gs.pawns.map((p) => (p.id === pawn.id ? { ...p, draftTarget: undefined } : p))
            };
            continue;
          }
          tx = tp.position?.x ?? -1;
          ty = tp.position?.y ?? -1;
        }
        if (tx < 0 || ty < 0) continue;
        const dx = Math.abs(pawn.position.x - tx);
        const dy = Math.abs(pawn.position.y - ty);
        if (dx <= 1 && dy <= 1) {
          // Adjacent — stop moving and let combat tick handle the attack
          if (pawn.isMoving) {
            gs = pawnService.assignPath(pawn.id, [], gs);
          }
        } else {
          const { walkable, costs, width, height } = buildPathfindingGridsWithBlocked(
            gs.worldMap,
            blocked,
            pawn.position.x,
            pawn.position.y,
            tx,
            ty
          );
          const path = wasmPathfinderService.findPath(
            walkable,
            costs,
            width,
            height,
            pawn.position.x,
            pawn.position.y,
            tx,
            ty
          );
          if (path && path.length > 0) {
            gs = pawnService.assignPath(pawn.id, path, gs);
          }
        }
      }
    }
    return gs;
  }

  private processPawns(): void {
    const prof = (globalThis as any).__profileTurns ? ((globalThis as any).__profP ??= {}) : null;
    const tp = prof
      ? (label: string, fn: () => void) => {
          const s = performance.now();
          fn();
          const e = (prof[label] ??= { sum: 0, n: 0 });
          e.sum += performance.now() - s;
          e.n++;
        }
      : (_label: string, fn: () => void) => fn();
    // Draft orders: pathfind and assign movement before the movement step
    if (this.gameState!.pawns?.some((p) => p.drafted && p.draftTarget)) {
      tp('p.draft', () => {
        this.gameState = this._processDraftOrders(this.gameState!);
      });
    }
    // Movement advances every tick (smooth, terrain-cost aware). Run it before
    // the state machine so hasReachedDestination is fresh.
    if (this.gameState!.pawns?.some((p) => p.isMoving)) {
      tp('p.movement', () => {
        this.gameState = pawnService.processMovement({ ...this.gameState! });
      });
    }
    // Phase 4a: run state machine (after movement so hasReachedDestination is fresh)
    tp('p.stateMachine', () => {
      this.gameState = pawnStateMachineService.tick(this.gameState!);
    });
    // COORDINATION: Delegate all pawn processing to PawnService
    tp('p.clearTemp', () => {
      this.gameState = pawnService.clearTemporaryPawnStates(this.gameState!);
    });
    tp('p.syncWork1', () => {
      this.gameState = workService.syncPawnWorkingStates(this.gameState!);
    });
    // Phase 5e: automatic needs now handled by PawnStateMachine (HUNGRY/TIRED states).
    tp('p.pawnTurn', () => {
      this.gameState = pawnService.processPawnTurn(this.gameState!);
    });
    tp('p.syncWork2', () => {
      this.gameState = workService.syncPawnWorkingStates(this.gameState!);
    });
    if (prof && this.gameState!.turn % TICKS_PER_SECOND === 0) {
      const out: Record<string, string> = {};
      for (const k of Object.keys(prof)) out[k] = (prof[k].sum / prof[k].n).toFixed(3) + 'ms';
      console.log('[PROF-PAWN] ' + JSON.stringify(out));
      for (const k of Object.keys(prof)) {
        prof[k].sum = 0;
        prof[k].n = 0;
      }
    }
  }

  private processBuildings(): void {
    // Phase 5c: building construction is now handled by the job system (construct jobs).
    // processBuildingQueue countdown removed.

    // Process any buildings queued for deconstruction — remove and refund materials
    this.gameState = buildingService.processDeconstructionQueue(this.gameState!);

    // Phase 6: tick campfire fuel consumption
    this.gameState = this._processCampfireFuel(this.gameState!);

    // Refactor Stage 1: structural condition decay (opt-in per building def)
    this.gameState = buildingService.stepBuildingCondition(this.gameState!);

    // §E Trapping: complete traps roll their catch chance
    this.gameState = buildingService.stepTraps(this.gameState!);
  }

  private _processCampfireFuel(gs: GameState): GameState {
    let changed = false;
    const newBuildings = (gs.buildings ?? []).map((b) => {
      const buildingDef = AVAILABLE_BUILDINGS.find((def) => def.id === b.type);
      if (!buildingDef?.maxFuel || !buildingDef.fuelConsumptionRate) return b;
      if (b.status !== 'complete') return b;
      // Auto-light: campfire ignites itself whenever it has fuel.
      if (!b.lit && (b.fuel ?? 0) > 0) {
        changed = true;
        return { ...b, lit: true };
      }
      if (!b.lit) return b;
      const newFuel = Math.max(0, (b.fuel ?? 0) - perTick(buildingDef.fuelConsumptionRate));
      const newLit = newFuel > 0;
      if (newFuel === b.fuel && newLit === b.lit) return b;
      changed = true;
      return { ...b, fuel: newFuel, lit: newLit };
    });
    if (!changed) return gs;
    return { ...gs, buildings: newBuildings };
  }

  // ===== HELPER METHODS =====

  updateStores(): void {
    if (!this.gameState) return;
    gameState.updateWithSave(() => this.gameState!);
  }

  /**
   * Legacy alias. The whole pipeline now runs on a single uniform tick, so a
   * "tick" and a "turn" are the same step — both are processGameTurn().
   */
  processTick(): void {
    this.processGameTurn();
  }

  /** Patch just the worldMap in the engine's internal state (used by regenWorld). */
  patchWorldMap(worldMap: import('../core/types').WorldTile[][]): void {
    if (this.gameState) this.gameState = { ...this.gameState, worldMap };
  }

  // ===== BASIC CALCULATIONS =====

  calculateBuildingEffects(buildingId: string, locationId?: string): BuildingEffectResult {
    if (!this.gameState) {
      return {
        buildingId,
        effects: {},
        workBonuses: {},
        productionBonuses: {}
      };
    }
    return modifierSystem.calculateBuildingEffects(buildingId, this.gameState);
  }

  calculateCombatEffectiveness(
    pawnId: string,
    combatType: 'melee_damage' | 'hit_chance' | 'dodge' | 'knockdown_resistance' | 'aggro_range'
  ): number {
    if (!this.gameState) return 0;

    const pawn = this.gameState.pawns.find((p) => p.id === pawnId);
    if (!pawn) return 0;

    // Formulas mirror COMBAT-SYSTEM.md spec exactly.
    const { strength: str, dexterity: dex, constitution: con, perception: per } = pawn.stats;
    switch (combatType) {
      case 'melee_damage':
        return str / 100;
      case 'hit_chance':
        return dex * 3;
      case 'dodge':
        return dex * 2;
      case 'knockdown_resistance':
        return con / 4;
      case 'aggro_range':
        return 8 + Math.floor(per / 20);
    }
  }

  // ===== STATE MANAGEMENT =====

  getGameState(): GameState {
    if (!this.gameState) throw new Error('GameState not initialized');
    return JSON.parse(JSON.stringify(this.gameState));
  }

  getCurrentState(): GameState {
    if (!this.gameState) throw new Error('GameState not initialized');
    return this.gameState;
  }

  updateGameState(updates: Partial<GameState>): SystemInteractionResult {
    if (!this.gameState) {
      return { success: false, error: 'GameState not initialized' };
    }

    this.gameState = { ...this.gameState, ...updates };
    this.updateStores();

    return { success: true };
  }

  resetGameState(newState?: GameState): SystemInteractionResult {
    if (newState) {
      this.gameState = JSON.parse(JSON.stringify(newState));
      this.updateStores();
    }
    return { success: true };
  }

  // ===== INTEGRATION =====

  setGameStateManager(manager: GameStateManager): void {
    this.gameStateManager = manager;
    this.gameState = manager.getState();
  }

  integrateServices(services: any): void {
    // COORDINATION: Services are integrated through direct imports
    gatedConsole.log('[GameEngine] Services integrated:', Object.keys(services || {}));
  }

  getServices(): any {
    throw new Error('Method not implemented - services accessed directly');
  }

  initialize(initialState: GameState, services: any): SystemInteractionResult {
    try {
      this.gameState = JSON.parse(JSON.stringify(initialState));
      this.integrateServices(services);
      gatedConsole.log('[GameEngine] Initialized with state and services');
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to initialize GameEngine'
      };
    }
  }

  shutdown(): SystemInteractionResult {
    return { success: true };
  }

  getEngineStatus(): any {
    return {
      isInitialized: !!this.gameState,
      systemsIntegrated: ['work', 'research', 'crafting'],
      lastTurnProcessed: this.lastTurnProcessed,
      pendingOperations: 0,
      errors: []
    };
  }
}

// Export singleton
export const gameEngine = new GameEngineImpl();

// Dev console helper: toggle the on-demand per-phase turn profiler.
//   profileTurns()       → start profiling (logs avg phase ms as [PROF] each second)
//   profileTurns(false)  → stop profiling
// Results are also available at globalThis.__profOut. Off by default — adds zero
// cost to the tick loop until enabled.
if (typeof globalThis !== 'undefined' && import.meta.env?.DEV) {
  (globalThis as any).profileTurns = (enable = true) => {
    (globalThis as any).__profileTurns = !!enable;
    (globalThis as any).__prof = {};
    return enable
      ? 'Turn profiler ON — avg phase timings log as [PROF] every second.'
      : 'Turn profiler OFF.';
  };
}

export function initializeGameEngine(gameStateManager: GameStateManager): GameEngineImpl {
  gameEngine.setGameStateManager(gameStateManager);
  return gameEngine;
}
