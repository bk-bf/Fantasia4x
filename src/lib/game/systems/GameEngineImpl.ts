import type {
  GameEngine,
  GameEngineConfig,
  TurnProcessingResult,
  SystemInteractionResult
} from './GameEngine';
import type { GameState, WorldTile } from '../core/types';
import { GameStateManager } from '../core/GameState';
import {
  peekRegrowthTurn,
  popRegrowth,
  pushRegrowth,
  minCooldownExpiry,
  rebuildRegrowthQueue
} from './regrowthQueue';
// NB: the engine no longer imports the Svelte store — its per-tick output goes through an
// injected `outputSink` (set by the store on the main thread; postMessage in the sim worker).
// This severs the only engine→store coupling, the prerequisite for running the sim off-thread
// (ENGINE-PERFORMANCE ADR-021 / sim→Worker W0).
import { workService } from '../services/WorkService';
import { itemService } from '../services/ItemService';
import { recipeService } from '../services/RecipeService';
import { pawnService } from '../services/PawnService';
import { buildingService } from '../services/BuildingService';
import { researchService } from '../services/ResearchService';
import { WORK_CATEGORIES } from '../core/Work';
import buildingsData from '../database/buildings.jsonc';

import { pawnStateMachineService, reapDeadPawns } from './PawnStateMachine';
import { findNearestDepositPoint, depositInventory, pickUpFromTile } from './pawn/pawnHauling';
import { jobService } from '../services/JobService';
import { wasmPathfinderService } from '../services/WasmPathfinderService';
import { resourceObjectService } from '../services/ResourceObjectService';
import { entityService } from '../services/EntityService';
import { combatService } from './Combat';
import { getRangedWeapon, effectiveRangedRange, hasViableAmmo } from './rangedCombat';
import { TICKS_PER_SECOND, ticksFromSeconds, perTick } from '../core/time';
import {
  buildPathfindingGridsWithBlocked,
  patchPathfindingWalkable
} from '../services/PathfinderService';
import { occupancyService } from '../services/OccupancyService';
import { assignDraftMovePath } from '../services/draftMovePath';
import { isGameDebug, gatedConsole } from '../core/log';
import type { WorkCategory } from '../core/types';
import type { Pawn } from '../core/types';
import { rng } from '../core/rng';
import {
  seasonForTurn,
  recomputeWorldTemperature,
  advanceWeatherForDay,
  weatherEffects,
  rebuildThermalField,
  accumulateSnow,
  TURNS_PER_DAY,
  WEATHER_LABELS,
  SEASON_LABELS,
  weatherChronicleSeverity,
  seasonRegrowthMultiplier,
  computeThermalAt,
  tileTemperature
} from '../services/EnvironmentService';
import { zoneTileKeys } from '../services/DesignationService';
import { soilTierForTile } from '../core/Terrains';
import { markTileDirty } from '../core/tileDeltas';
import { simLog } from '../core/logSink';

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
/** UI flush cadence in REAL milliseconds (~15 Hz) — wall-clock so it's independent of TPS. */
const UI_PUSH_MS = 1000 / 15;
/** Item-deterioration runs every N ticks (not every tick): durability lifespans are days/weeks, so
 *  weathering all loose items every tick is wasted work + array churn. 600 ticks ≈ 0.8 in-game hour. */
const DETERIORATION_INTERVAL_TICKS = 600;
/** Spoilage (`stepItemDecay`) runs every N ticks for the same reason: a decay clock is days-long, but
 *  per-tick it re-references the whole `droppedItems` (+ `stockpile`) array — which, because the array
 *  isn't in the snapshot ref-diff's skip set, ships + structured-clones across the worker→render
 *  boundary EVERY flush (the carcass-FPS regression). 60 ticks ≈ 1 s: invisible for spoilage, but cuts
 *  the ref-churn (and thus the cross-boundary clone) ~60×. Erosion is scaled by the elapsed ticks. */
const DECAY_INTERVAL_TICKS = 60;
/** Job-board reconcile cadence (ADR-022). `generateJobs` rebuilds the board from current world
 *  sources — a self-healing, emission-derived pass — but that's wasted at 60 Hz when designations/
 *  buildings/drops change far slower. Running it every 6 ticks caps job-appearance latency at ≤6
 *  ticks (~0.1 in-game-sec — imperceptible, so no per-event "kick" is needed) while cutting the scan
 *  to ~1/6 the cost. Claim/advance/complete still run every tick (independent of this pass), so
 *  claimed/in-progress jobs are untouched between rebuilds. */
const JOB_GENERATION_INTERVAL_TICKS = 6;

export class GameEngineImpl implements GameEngine {
  private gameState: GameState | null = null;
  private gameStateManager: GameStateManager | null = null;
  // ENGINE-PERFORMANCE-II §S2: the worldMap ref the regrowth min-heap was last (re)built from. A change
  // (load / regen) triggers a one-time rebuild; during play the ref is stable so the heap is incremental.
  private _lastRegrowthWorldMap: WorldTile[][] | null = null;
  private config: GameEngineConfig;
  private lastTurnProcessed = 0;
  /** `performance.now()` of the last UI flush — throttles notify/snapshot to ~15 Hz (UI_PUSH_MS). */
  private lastFlushMs = 0;
  /**
   * The season the worldMap temperatures were last recomputed for (SEASONS_WEATHER Phase B).
   * `undefined` until the first non-empty recompute, so a fresh world (temperature: 0) and a
   * reloaded save both get their temperatures populated on the first tick — and a season change
   * triggers exactly one in-place recompute (PERF-1), not one per tick.
   */
  private temperatureSeason: import('../core/types').Season | undefined = undefined;
  /** Average baked tile temperature (biome + season, no weather) — combined with the live weather
   *  delta into `gameState.avgTemperature` for the HUD. Set whenever temperatures are recomputed. */
  private avgTileTemp: number | undefined = undefined;
  /**
   * Per-tick output sink (ENGINE-PERFORMANCE ADR-021, sim→Worker W0). The engine no longer imports
   * the Svelte store; the owner injects how to publish each tick's state — on the main thread that's
   * `pushFromEngine` (store), in the sim worker it'll postMessage a snapshot. `flush` mirrors the old
   * UI-push throttle (notify subscribers this tick).
   */
  private outputSink: ((state: GameState, flush: boolean) => void) | null = null;
  /** Command-path commit sink (P-2 user actions). Same decoupling as outputSink. */
  private commitSink: ((state: GameState, save: boolean) => void) | null = null;

  /** Menu-preview mode (set via the worker `init` message). When true, `processGameTurn` branches to
   *  the slim `processPreviewTurn` — environment + prey-only entity step only — so the main-menu
   *  backdrop costs almost nothing. The real PEACE hot path below is left completely untouched. */
  private previewMode = false;

  setPreviewMode(v: boolean): void {
    this.previewMode = v;
  }

  setOutputSink(sink: (state: GameState, flush: boolean) => void): void {
    this.outputSink = sink;
  }

  setCommitSink(sink: (state: GameState, save: boolean) => void): void {
    this.commitSink = sink;
  }

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

      // Menu-preview backdrop: run only the atmospheric phases and bail before the full sim — see
      // processPreviewTurn. Branches out HERE so none of the per-tick hot path below changes.
      if (this.previewMode) return this.processPreviewTurn();

      // Phase runner — profiler removed; profile via the browser (Firefox Profiler) instead.
      const t = (_label: string, fn: () => void): void => fn();

      // Living-world environment (SEASONS_WEATHER Phase B/C): advance season + weather and refresh
      // tile temperature BEFORE needs tick, so the need-rate hot path reads current values.
      t('environment', () => this.processEnvironment());

      t('needsTick', () => {
        this.gameState = pawnService.processNeedsTick(this.gameState!);
        this.gameState = pawnService.processAutoDrink(this.gameState!);
        this.gameState = pawnService.processAutoWash(this.gameState!);
      });
      t('itemDecay', () => {
        // Throttled (see DECAY_INTERVAL_TICKS): spoil that many ticks' worth in one pass instead of
        // re-referencing the whole droppedItems array every tick (which churns the snapshot diff).
        if (this.gameState!.turn % DECAY_INTERVAL_TICKS === 0)
          this.gameState = itemService.stepItemDecay(this.gameState!, DECAY_INTERVAL_TICKS);
      });
      t('itemDeterioration', () => {
        // Throttled (see DETERIORATION_INTERVAL_TICKS): apply that many ticks of wear in one pass
        // instead of rebuilding the dropped-items array every tick for a sliver of durability.
        if (this.gameState!.turn % DETERIORATION_INTERVAL_TICKS === 0)
          this.gameState = itemService.stepItemDeterioration(
            this.gameState!,
            DETERIORATION_INTERVAL_TICKS
          );
      });
      t('woodDrying', () => {
        this.gameState = itemService.stepWoodDrying(this.gameState!);
      });
      t('researchTick', () => {
        this.gameState = researchService.processResearchTick(this.gameState!);
      });
      t('pendingCrafts', () => {
        // ADR-016 queue-without-materials: reserve inputs for `pending` orders as soon as the stock
        // exists (cheap no-op guard when none are pending). Runs unthrottled so a stocked order isn't
        // stalled waiting on the next generateJobs cadence.
        this.gameState = jobService.reservePendingCraftOrders(this.gameState!);
      });
      t('generateJobs', () => {
        // ADR-022: throttled reconcile (every JOB_GENERATION_INTERVAL_TICKS). The board persists
        // between passes; only its sync against world sources is amortised.
        if (this.gameState!.turn % JOB_GENERATION_INTERVAL_TICKS === 0)
          this.gameState = jobService.generateJobs(this.gameState!);
      });
      t('buildings', () => this.processBuildings());
      t('passiveProd', () => this.processPassiveProduction());
      t('pawns', () => this.processPawns());
      t('resourceRegrowth', () => this.processResourceRegrowth());
      t('cropGrowth', () => this.processCropGrowth());
      t('entityStep', () => {
        this.gameState = entityService.spawnEntities(this.gameState!);
        this.gameState = entityService.tickLairs(this.gameState!);
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
      // (World-event phase removed — the previous random-event system was half-built spam, not
      // gameplay. A proper event system is planned later; see core/Events.ts. The Chronicle now
      // records combat, weather, and season changes only.)
      this.debugLogPawns();

      this.lastTurnProcessed = this.gameState.turn;
      t('mgrUpdate', () => this.gameStateManager!.updateState(this.gameState!));
      // Throttled UI push — WALL-CLOCK gated, not tick-gated. The old `% UI_PUSH_INTERVAL` (4 ticks)
      // assumed 60 TPS; once the sim ran at 80+ (and fluctuating) TPS it flushed at 20+ Hz tracking
      // the tick rate, so the main thread's snapshot deserialize/notify/GC load swung with TPS →
      // FPS sawtooth. Capping to ~15 Hz of real time decouples UI cost from TPS (the renderer
      // interpolates positions from get() every frame, so UI never needs faster).
      t('uiPush', () => {
        const nowMs = performance.now();
        const flush = nowMs - this.lastFlushMs >= UI_PUSH_MS;
        if (flush) this.lastFlushMs = nowMs;
        this.outputSink?.(this.gameState!, flush);
      });

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
   * Slim per-tick loop for the main-menu backdrop preview (see `previewMode`). Advances only the
   * atmospheric, consequence-free systems the menu wants:
   *   • environment — weather Markov roll + day/night light (no tile-state consequence).
   *   • entity step — prey-only spawn + FSM wander/graze + movement.
   * Deliberately OMITTED vs the full turn: needs/items/research/jobs/buildings/passiveProd/pawns,
   * resource regrowth, crop growth, combat. Also skips `tickLairs` (no lairs), `stepHunger` and
   * `removeDead` — preview prey never starve or die, so there are no carcasses and no array churn;
   * they just graze and wander indefinitely.
   */
  private processPreviewTurn(): TurnProcessingResult {
    try {
      this.processEnvironment();

      this.gameState = entityService.spawnEntities(this.gameState!, { preyOnly: true });
      this.gameState = entityService.stepEntities(this.gameState!);
      this.gameState = entityService.advanceMobMovement(this.gameState!);

      this.lastTurnProcessed = this.gameState!.turn;
      this.gameStateManager!.updateState(this.gameState!);

      // Same wall-clock-gated UI push as the real turn so the backdrop renders at ~15 Hz.
      const nowMs = performance.now();
      const flush = nowMs - this.lastFlushMs >= UI_PUSH_MS;
      if (flush) this.lastFlushMs = nowMs;
      this.outputSink?.(this.gameState!, flush);

      return { success: true, turnsProcessed: 1, systemsUpdated: ['preview'], errors: [] };
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
   * Living-world environment update (SEASONS_WEATHER Phases B & C).
   *
   * - Season/seasonDay are derived from the turn and written only when they change.
   * - On a season change (or first non-empty tick), tile temperatures are recomputed IN PLACE
   *   (PERF-1: no `worldMap.map()`, no ref flip → `worldMapRef` stays 0; temperature is worker-only
   *   so it is not shipped as a tile delta — PERF-2).
   * - Weather is re-rolled once per in-game day (midnight boundary), so at most one new WeatherState
   *   object per day rides the sectional snapshot — negligible churn (PERF-4: season/weather are
   *   cheap top-level scalars, never per-tile worldMap fields).
   */
  private processEnvironment(): void {
    const gs = this.gameState;
    if (!gs) return;

    const derived = seasonForTurn(gs.turn);
    // Debug override (in-game debug menu): force a season but keep the natural day index.
    const season = gs._debugSeason ?? derived.season;
    const seasonDay = derived.seasonDay;
    if (season !== gs.season) {
      const prevSeason = gs.season;
      gs.season = season;
      // Chronicle the turn of the season — skip the initial undefined→first-season assignment on a
      // fresh world (turn 0), which isn't a transition the player witnessed.
      if (prevSeason) {
        simLog.logActivity({
          turn: gs.turn,
          type: 'season',
          actor: 'system',
          action: `${SEASON_LABELS[season]} has arrived`,
          result: `(was ${SEASON_LABELS[prevSeason]})`,
          severity: 'info'
        });
      }
    }
    if (seasonDay !== gs.seasonDay) gs.seasonDay = seasonDay;

    // Recompute temperatures once when the season the map was baked for changes (or on first
    // populated tick — fresh worlds carry temperature 0 until baked here).
    if (gs.worldMap.length > 0 && this.temperatureSeason !== season) {
      this.avgTileTemp = recomputeWorldTemperature(gs.worldMap, season);
      this.temperatureSeason = season;
    }

    // Weather: one Markov step per in-game day at midnight.
    const ticksPerDay = TURNS_PER_DAY * TICKS_PER_SECOND;
    if (gs.turn % ticksPerDay === 0 && gs.weather) {
      const prevType = gs.weather.type;
      gs.weather = advanceWeatherForDay(gs.weather, season, rng);
      // Chronicle only an actual change of weather type (a spell merely running down isn't news).
      if (gs.weather.type !== prevType) {
        simLog.logActivity({
          turn: gs.turn,
          type: 'weather',
          actor: 'system',
          action: WEATHER_LABELS[gs.weather.type],
          result: `(was ${WEATHER_LABELS[prevType]})`,
          severity: weatherChronicleSeverity(gs.weather.type)
        });
      }
    }

    // HUD readout: average effective map temperature = baked tile average + live weather delta.
    // Assigned only on change to keep the sectional snapshot quiet (PERF-4: a cheap top-level scalar).
    if (this.avgTileTemp !== undefined) {
      const avg = Math.round(this.avgTileTemp + weatherEffects(gs.weather).tempDelta);
      if (avg !== gs.avgTemperature) gs.avgTemperature = avg;
    }

    // Snow cover: a slow (hourly) IN-PLACE pass — builds while snowing & below freezing, melts above.
    // Cadence-gated so the per-tile snow churn stays bounded (only bucket-crossing tiles ship a delta).
    const snowInterval = Math.max(1, Math.floor(ticksPerDay / 24));
    if (gs.worldMap.length > 0 && gs.turn % snowInterval === 0) {
      accumulateSnow(gs.worldMap, gs.weather, 1);
    }

    // Rebuild the fire-warmth + roof-shelter field once per tick (before needs/conditions read it).
    rebuildThermalField(gs.buildings);
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

    // ENGINE-PERFORMANCE-II §S2: drain a min-heap of cooldown expiries instead of scanning all 562,500
    // tiles (750²) EVERY tick. Rebuild the heap on a worldMap REPLACE (load / regen / test — the ref
    // changed); during play the ref is stable and new cooldowns are pushed at the harvest set-site.
    if (gs.worldMap !== this._lastRegrowthWorldMap) {
      rebuildRegrowthQueue(gs.worldMap);
      this._lastRegrowthWorldMap = gs.worldMap;
    }
    // O(1) common case: nothing is due this tick.
    if (peekRegrowthTurn() > gs.turn) return;

    // ADR-002 amendment + ADR-021 §4c: mutate the handful of expired tiles IN PLACE and ship them as
    // worldMap *deltas* (markTileDirty) — no full-map re-clone. Drain every entry due this tick.
    while (peekRegrowthTurn() <= gs.turn) {
      const e = popRegrowth()!;
      const tile = gs.worldMap[e.y]?.[e.x];
      const cooldowns = tile?.resourceCooldowns;
      if (!tile || !cooldowns) continue; // stale entry (tile cleared / re-harvested / already done)

      // Collect the keys expiring this turn (snapshot before we start deleting).
      let expiredKeys: string[] | null = null;
      for (const k in cooldowns) {
        if (gs.turn >= cooldowns[k]) (expiredKeys ??= []).push(k);
      }
      // Stale: this entry's cooldown is already gone; remaining (future) ones are already queued.
      if (!expiredKeys) continue;

      let tileChanged = false;
      for (const key of expiredKeys) {
        const isCompound = key.includes(':');

        if (isCompound) {
          // Compound key: "resourceId:itemId"
          const colonIdx = key.indexOf(':');
          const resourceId = key.slice(0, colonIdx);

          // Remove this yield's cooldown, then check whether any others for this resource remain.
          delete cooldowns[key];
          let anyStillCooling = false;
          for (const k in cooldowns) {
            if (k.startsWith(resourceId + ':')) {
              anyStillCooling = true;
              break;
            }
          }

          const def = resourceObjectService.getById(resourceId);
          if (anyStillCooling) {
            // Partial recovery — make node available (count = 1) so a job can be
            // created, but only the non-cooled yields will actually be harvested.
            tile.resources[resourceId] = 1;
            gatedConsole.log(
              `[Regrowth] ${key} at (${tile.x},${tile.y}) recovered (partial — other yields still cooling)`
            );
          } else {
            // All yields recovered — full random restore.
            const [minAmt, maxAmt] = def?.nodeAmountRange ?? [1, 3];
            const newResourceCount = minAmt + Math.floor(rng.random() * (maxAmt - minAmt + 1));
            tile.resources[resourceId] = newResourceCount;
            if (tile.growth) tile.growth[resourceId] = 100; // §F: fully regrown ⇒ 100% maturity
            // Restore blocking for non-walkable resources that have fully regrown.
            if (def?.walkable === false) {
              tile.walkable = false;
              tile.blocksSight = def.blocksSight ?? false; // re-close LoS for a regrown rock node (Part VII)
              patchPathfindingWalkable(tile.x, tile.y, false); // keep memoized A* grid in sync (worldMap ref unchanged)
            }
            gatedConsole.log(
              `[Regrowth] ${resourceId} at (${tile.x},${tile.y}) fully restored ×${newResourceCount}`
            );
          }
        } else {
          // Simple whole-resource cooldown.
          const def = resourceObjectService.getById(key);
          const [minAmt, maxAmt] = def?.nodeAmountRange ?? [1, 3];
          const restored = minAmt + Math.floor(rng.random() * (maxAmt - minAmt + 1));

          delete cooldowns[key];
          tile.resources[key] = restored;
          if (tile.growth) tile.growth[key] = 100; // §F: fully regrown ⇒ 100% maturity
          // Restore blocking for non-walkable resources that have regrown.
          if (def?.walkable === false) {
            tile.walkable = false;
            tile.blocksSight = def.blocksSight ?? false; // re-close LoS for a regrown rock node (Part VII)
            patchPathfindingWalkable(tile.x, tile.y, false); // keep memoized A* grid in sync (worldMap ref unchanged)
          }
          gatedConsole.log(`[Regrowth] ${key} at (${tile.x},${tile.y}) regrew ×${restored}`);
        }
        tileChanged = true;
      }

      if (tileChanged) markTileDirty(e.y, e.x, tile);

      // Re-queue this tile for its next-soonest remaining cooldown (if any).
      const nextMin = minCooldownExpiry(cooldowns);
      if (nextMin !== Infinity) pushRegrowth(nextMin, e.x, e.y);
    }

    // worldMap mutated in place (ref unchanged) → the snapshot publisher ships the marked tiles as a
    // delta and bumps _terrainRev. No `this.gameState` reassignment, no full-map re-clone.
  }

  /**
   * PRODUCTION-CHAIN-II §F — advance sown crops toward maturity. Iterates ONLY grow-zone tiles
   * (farm-bounded, not the whole map) and grows each immature crop ONLY while its tile meets ALL of
   * the crop's needs (fertility / wetness / temperature / light — tracked per crop in resources.jsonc).
   * Conditions unmet ⇒ growth stalls. At 100% the crop becomes harvestable (count → nodeAmount). Wild
   * plants don't use this — their growth is event-based (world-gen roll + harvest reset + timed regrow).
   * In-place tile mutation + delta (ADR-002 amendment), like processResourceRegrowth.
   */
  private processCropGrowth(): void {
    if (!this.gameState) return;
    const gs = this.gameState;
    const growTiles = zoneTileKeys(gs, 'grow');
    if (growTiles.length === 0) return;
    const rate = seasonRegrowthMultiplier(gs.season);

    for (const key of growTiles) {
      const ci = key.indexOf(',');
      const x = +key.slice(0, ci);
      const y = +key.slice(ci + 1);
      const tile = gs.worldMap[y]?.[x];
      const growth = tile?.growth;
      if (!tile || !growth) continue;

      for (const id in growth) {
        if (growth[id] >= 100) continue; // mature crops wait to be reaped; frost only kills the immature
        const def = resourceObjectService.getById(id);
        const c = def?.crop;
        if (!c) continue;

        const thermal = computeThermalAt(x, y, gs.buildings);
        const temp = tileTemperature(tile.terrainType, gs.season, gs.weather, thermal);
        const m = tile.moisture ?? 0;
        // DEATH conditions (the soil can no longer carry the crop): exhausted fertility, frost/snow,
        // cold/heat out of the crop's window, or drought/flood. A dead crop is set to 1% — NOT 0% — so
        // it never reads as a harvested cycle (no soil wear) and the whole map can't churn itself barren.
        const dead =
          soilTierForTile(tile) < c.minSoil ||
          (tile.snow ?? 0) > 0 ||
          temp < c.minTemp ||
          temp > c.maxTemp ||
          m < c.minMoisture ||
          m > c.maxMoisture;
        if (dead) {
          if (growth[id] !== 1) {
            growth[id] = 1;
            if ((tile.resources[id] ?? 0) > 0) tile.resources[id] = 0;
            markTileDirty(y, x, tile);
          }
          continue;
        }
        // Light is a non-lethal STALL: a roofed (sunless) crop survives but doesn't grow.
        if (c.needsLight && thermal.roofed) continue;

        // Advance toward 100% at the base rate (season-scaled). In place — no per-tick allocation.
        const totalTicks = Math.max(1, ticksFromSeconds(c.growthTurns) / rate);
        const next = Math.min(100, growth[id] + 100 / totalTicks);
        growth[id] = next;
        if (next >= 100 && (tile.resources[id] ?? 0) <= 0) {
          const [mn, mx] = def!.nodeAmountRange ?? [1, 1];
          tile.resources[id] = mn + Math.floor(rng.random() * (mx - mn + 1)); // matured → harvestable
        }
        markTileDirty(y, x, tile);
      }
    }
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
      // A collapsed (unconscious) pawn can't be marched anywhere — never path it toward a draft target
      // (it's un-drafted on collapse anyway; this guards the transition tick so it never crawls).
      if (pawn.currentState === 'Collapsed') continue;
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
        // A move target is STATIC: once a route to it exists, movement just advances along it —
        // re-running A* every tick recomputes the identical path and (per call) slices the whole
        // walkable grid, which scales with map size (250k tiles @ 500×500). Skip the re-path while the
        // pawn still holds a live route whose end is this target; recovery is automatic — movement drops
        // the path when it empties (arrival) or stays blocked (MAX_BLOCKED_TICKS), and the empty path
        // fails this guard next tick → re-path. (Soft-body occupancy means a transient body on the path
        // routes around at the movement layer, not a wall, so a stale-by-a-tick path is safe.)
        const route = pawn.path;
        const end = route && route.length > 0 ? route[route.length - 1] : undefined;
        const hasLiveRoute =
          !!end &&
          (pawn.pathIndex ?? 0) < route!.length &&
          end.x === target.x &&
          end.y === target.y;
        if (hasLiveRoute) continue;
        // Shared with the draft-move commands so a move order computed at command time (even paused)
        // traces the same route this tick would (see draftMovePath.ts).
        gs = assignDraftMovePath(gs, pawn, target.x, target.y, blocked);
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
        // Stop distance, re-evaluated each tick:
        //  • force-melee or a melee-only pawn → close to adjacency (1).
        //  • auto-ranged WITH ammo → hold at weapon range and shoot.
        //  • auto-ranged OUT of ammo → hold POSITION (Infinity): it never auto-closes — keeping a
        //    fragile shooter safe; engaging in melee is opt-in via "Target (melee)".
        const rw = getRangedWeapon(pawn);
        const rangedAuto = !!rw && target.mode !== 'melee';
        const stopDist =
          rangedAuto && !hasViableAmmo(pawn, rw!)
            ? Infinity
            : rangedAuto
              ? Math.max(1, Math.floor(effectiveRangedRange(pawn, rw!)))
              : 1;
        if (Math.max(dx, dy) <= stopDist) {
          // In position (in weapon range / adjacent) — stop moving, let the combat tick attack.
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
      } else if (target.type === 'haul') {
        // Drafted "haul to stockpile": shuttle the loose stack on (target.x, target.y) to the
        // nearest stockpile a budget-load at a time. Pinned items don't count as cargo (they're
        // never deposited), so they can't stall the loop.
        const pinned = new Set(pawn.pinnedItems ?? []);
        const carrying = Object.entries(pawn.inventory?.items ?? {}).some(
          ([id, q]) => q > 0 && !pinned.has(id)
        );
        const srcHasLoose = (gs.droppedItems ?? []).some(
          (d) =>
            d.x === target.x && d.y === target.y && !d.stored && !d.reservedFor && d.quantity > 0
        );
        const clearHaul = () => {
          gs = {
            ...gs,
            pawns: gs.pawns.map((p) => (p.id === pawn.id ? { ...p, draftTarget: undefined } : p))
          };
        };
        const walkTo = (tx: number, ty: number) => {
          const grids = buildPathfindingGridsWithBlocked(
            gs.worldMap,
            blocked,
            pawn.position!.x,
            pawn.position!.y,
            tx,
            ty
          );
          const path = wasmPathfinderService.findPath(
            grids.walkable,
            grids.costs,
            grids.width,
            grids.height,
            pawn.position!.x,
            pawn.position!.y,
            tx,
            ty
          );
          if (path && path.length > 0) gs = pawnService.assignPath(pawn.id, path, gs);
        };

        if (carrying) {
          // Deposit phase — walk to the nearest stockpile and unload.
          const dp = findNearestDepositPoint(pawn, gs);
          if (!dp) {
            clearHaul(); // nowhere to deliver — abandon
          } else if (pawn.position.x === dp.x && pawn.position.y === dp.y) {
            gs = pawnService.assignPath(pawn.id, [], gs);
            const here = gs.pawns.find((p) => p.id === pawn.id);
            // depositInventory keeps draftTarget, so the next tick fetches the next load.
            if (here) gs = depositInventory(here, gs);
          } else {
            walkTo(dp.x, dp.y);
          }
        } else if (srcHasLoose) {
          // Pickup phase — walk to the source and grab a budget-load of loose goods.
          if (pawn.position.x === target.x && pawn.position.y === target.y) {
            gs = pawnService.assignPath(pawn.id, [], gs);
            gs = pickUpFromTile(gs, pawn.id, target.x, target.y, { looseOnly: true });
          } else {
            walkTo(target.x, target.y);
          }
        } else {
          clearHaul(); // nothing carried and the source is clear — done
        }
      }
    }
    return gs;
  }

  private processPawns(): void {
    const tp = (_label: string, fn: () => void): void => fn();
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
      // Per-RECIPE passive flag (data-driven): a recipe marked `passive` in recipes.jsonc produces
      // here without a pawn job, even at a mixed station (stone_forge smelts passively but its
      // shaping recipes stay pawn-worked). `isPassive` falls back to the legacy passive-station set.
      if (
        !recipeService.isPassive(recipeService.getRecipeForItem(order.item.id)) &&
        !recipeService.isPassiveStation(order.stationType)
      )
        continue;
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
    this.commitSink?.(this.gameState, true);
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
    this.commitSink?.(this.gameState, save);
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

export function initializeGameEngine(gameStateManager: GameStateManager): GameEngineImpl {
  gameEngine.setGameStateManager(gameStateManager);
  return gameEngine;
}
