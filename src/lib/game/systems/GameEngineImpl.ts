import type {
  GameEngine,
  GameEngineConfig,
  TurnProcessingResult,
  SystemInteractionResult
} from './GameEngine';
import type { GameState } from '../core/types';
import { GameStateManager } from '../core/GameState';
import { gameState } from '$lib/stores/gameState';
import { workService } from '../services/WorkService';
import { itemService } from '../services/ItemService';
import { recipeService } from '../services/RecipeService';
import { pawnService } from '../services/PawnService';
import { buildingService } from '../services/BuildingService';
import { researchService } from '../services/ResearchService';
import { WORK_CATEGORIES } from '../core/Work';
import buildingsData from '../database/buildings.jsonc';

import { pawnStateMachineService, reapDeadPawns } from './PawnStateMachine';
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

const AVAILABLE_BUILDINGS = buildingsData as unknown as import('../core/types').Building[];

/**
 * How many sim ticks pass between UI store notifications. The sim runs at
 * TICKS_PER_SECOND (60); notifying every 4th tick pushes UI updates at ~15 Hz.
 * The WebGL renderer interpolates pawn motion every animation frame, so movement
 * stays smooth regardless. Between notifications the engine still refreshes the
 * store's held value each tick (via pushFromEngine), so `get(gameState)` reads a
 * current projection. The engine — not the store — is the single writer of
 * canonical state (P-2); user actions reach it as commands (see applyCommand).
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

  // UI-facing coordination (getById lookups, craftItem, startResearch, work assignment…) lives in
  // GameCoordinator (P-2b) — this class stays a turn coordinator + state owner. Mutating UI actions
  // reach canonical state via applyCommand (P-2).

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
      // P-2: no store read-back. The engine owns canonical state; user actions already mutated
      // it via applyCommand, so there is nothing to re-sync. Shallow-copy before bumping the
      // counter so the object last committed to the store (same reference) is never mutated in
      // place. (gameState.turn counts ticks.)
      this.gameState = { ...this.gameState, turn: this.gameState.turn + 1 };

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
      t('passiveProd', () => this.processPassiveProduction());
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
      // End-of-turn reaper: finalise any combat death that bypassed killPawn (drop corpse + gear,
      // record it) and remove all dead pawns from pawns[] so they leave the UI (NT-2).
      t('reapDead', () => {
        this.gameState = reapDeadPawns(this.gameState!);
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
        // ADR-011: the profiler must always print (GameEngineImpl deliberately does NOT shadow
        // console), so this is the sanctioned raw-console exemption.
        // eslint-disable-next-line no-console
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
    // R7: derive isWorking/currentWork from the FSM state ONCE, before processPawnTurn reads
    // isWorking for mood. (The old duplicate post-call was removed.)
    tp('p.syncWork', () => {
      this.gameState = workService.syncPawnWorkingStates(this.gameState!);
    });
    // Phase 5e: automatic needs now handled by PawnStateMachine (HUNGRY/TIRED states).
    tp('p.pawnTurn', () => {
      this.gameState = pawnService.processPawnTurn(this.gameState!);
    });
    if (prof && this.gameState!.turn % TICKS_PER_SECOND === 0) {
      const out: Record<string, string> = {};
      for (const k of Object.keys(prof)) out[k] = (prof[k].sum / prof[k].n).toFixed(3) + 'ms';
      // ADR-011 sanctioned profiler output (always prints).
      // eslint-disable-next-line no-console
      console.log('[PROF-PAWN] ' + JSON.stringify(out));
      for (const k of Object.keys(prof)) {
        prof[k].sum = 0;
        prof[k].n = 0;
      }
    }
  }

  /**
   * ADR-016 passive furnaces: a loaded furnace (bloomery/kiln/charcoal pit) transforms its
   * staged inputs over time WITHOUT a pawn working it — gated by the station being lit (fuel
   * present) for fuel-burning furnaces. Each supplied passive order accrues work each tick and,
   * on reaching workRequired, completes through the same path as a pawn-worked craft (staged
   * inputs destroyed → outputs spawned on the station). Pawns still fetch the inputs + fuel.
   */
  private processPassiveProduction(): void {
    if (!this.gameState) return;
    const queue = this.gameState.craftingQueue ?? [];
    if (queue.length === 0) return;

    const PASSIVE_WORK_PER_SECOND = 1;
    let state = this.gameState;
    let changed = false;

    for (const order of [...queue]) {
      if (!recipeService.isPassiveStation(order.stationType)) continue;
      const station = (state.buildings ?? []).find(
        (b) => b.id === order.stationBuildingId && b.status === 'complete'
      );
      if (!station) continue;
      // Inputs must be fully loaded onto the furnace first.
      if (!jobService.isOrderSupplied(order, state)) continue;
      // Gated by fuel/heat: a fuel-burning furnace must be lit. Furnaces without a fuel tank
      // (e.g. charcoal_pit, where the loaded wood IS the fuel) run as soon as they're loaded.
      const def = AVAILABLE_BUILDINGS.find((d) => d.id === station.type);
      if ((def?.maxFuel ?? 0) > 0 && !station.lit) continue;

      const newDone = (order.workDone ?? 0) + perTick(PASSIVE_WORK_PER_SECOND);
      if (newDone >= (order.workRequired ?? 1)) {
        state = jobService.completeCraftOrder(order, state);
      } else {
        state = {
          ...state,
          craftingQueue: (state.craftingQueue ?? []).map((o) =>
            o.id === order.id ? { ...o, workDone: newDone } : o
          )
        };
      }
      changed = true;
    }

    if (changed) this.gameState = state;
  }

  private processBuildings(): void {
    // Building construction is handled by the job system (construct jobs) + ADR-016 material
    // hauling; the legacy buildingQueue/processBuildingQueue countdown was deleted (R6).

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
    // Engine is the single writer (P-2): commit canonical state to the store as a projection
    // (notify + debounced save). Routing through updateWithSave would just bounce back here.
    gameState.commitFromEngine(this.gameState, true);
  }

  /**
   * P-2 single-writer entry point for user actions. A user action is a *command*: an updater
   * applied to the engine's canonical state. The engine applies it, keeps the GameStateManager
   * in sync, and commits the result to the store as a read-only projection (the store never
   * mutates state itself). `save` mirrors the previous store split — updateWithSave passes
   * true, update/set pass false (the next tick's throttled push persists them regardless).
   */
  applyCommand(updater: (state: GameState) => GameState, save: boolean): void {
    if (!this.gameState) return;
    this.gameState = updater(this.gameState);
    this.gameStateManager?.updateState(this.gameState);
    gameState.commitFromEngine(this.gameState, save);
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

  // ===== STATE MANAGEMENT =====

  getGameState(): GameState {
    if (!this.gameState) throw new Error('GameState not initialized');
    // Engine state is treated as immutable (replaced wholesale each tick/command, never mutated
    // in place), so a shallow copy is a safe snapshot — no need to deep-clone the 240×160 map.
    return { ...this.gameState };
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
