import type {
  GameEngine,
  GameEngineConfig,
  TurnProcessingResult,
  SystemInteractionResult
} from './GameEngine';
import type { GameState, WorldTile } from '../core/types';
import { GameStateManager } from '../core/state/GameStateManager';
import {
  peekRegrowthTurn,
  popRegrowth,
  pushRegrowth,
  minCooldownExpiry,
  rebuildRegrowthQueue
} from '../core/rules/world/regrowthQueue';
import { workService } from '../services/WorkService';
import { itemService } from '../services/ItemService';
import { recipeService } from '../services/RecipeService';
import { pawnService } from '../services/PawnService';
import { pawnGrowthService } from '../services/PawnGrowthService';
import { buildingService } from '../services/BuildingService';
import { researchService } from '../services/ResearchService';
import { WORK_CATEGORIES } from '../core/defs/work';
import buildingsData from '../database/world/buildings.jsonc';

import { pawnStateMachineService, reapDeadPawns } from './PawnStateMachine';
import { rollMigrantWave } from './migration';
import { kingdomService } from '../services/KingdomService';
import { socialService } from '../services/SocialService';
import { findNearestDepositPoint, depositInventory, pickUpFromTile } from './pawn/pawnHauling';
import { nearestShelterTile } from './pawn/handlers/rescue';
import { isAdjacent } from './pawn/pawnQueries';
import { tryAssignPath } from './pawn/pawnHelpers';
import {
  pickUpPawn,
  dropCarriedPawn,
  reconcileCarriedPawns,
  freeDropTileNear,
  separateStackedBodies
} from './pawn/carry';
import { tendPatient, hasUntendedWound, TEND_WORK } from '../services/jobs/caretake';
import { MIN_FORAGE_GROWTH } from '../services/jobs/filters';
import { equipDropToPawn, carryDropToInventory } from '../core/rules/gear/equipment';
import { jobService, BASE_WORK_RATE } from '../services/JobService';
import { pawnStatService } from '../services/PawnStatService';
import { resourceObjectService } from '../services/ResourceObjectService';
import { entityService } from '../services/EntityService';
import { readMobPathStats } from '../services/entity/entityHelpers';
import { maybeRebuildConnectivity } from '../services/entity/connectivity';
import { combatService } from './Combat';
import { getRangedWeapon, effectiveRangedRange, hasViableAmmo } from './rangedCombat';
import { TICKS_PER_SECOND, ticksFromSeconds, perTick } from '../core/util/time';
import {
  buildPathfindingGridsSoftBlocked,
  patchPathfindingWalkable,
  pathfinderService
} from '../services/PathfinderService';
import { occupancyService } from '../services/OccupancyService';
import { assignDraftMovePath } from '../services/draftMovePath';
import { isGameDebug, gatedConsole } from '../core/util/log';
import type { WorkCategory } from '../core/types';
import type { Pawn, PawnOrder } from '../core/types';
import { advanceJobOneTick } from './pawn/handlers/work';
import { rng } from '../core/util/rng';
import {
  seasonForTurn,
  dayIndexForTurn,
  recomputeWorldTemperature,
  seasonBakedTemp,
  advanceWeatherForDay,
  weatherEffects,
  rebuildThermalField,
  accumulateSnow,
  rederiveWeatherType,
  weatherFreezing,
  diurnalTempDelta,
  TURNS_PER_DAY,
  WEATHER_LABELS,
  SEASON_LABELS,
  weatherChronicleSeverity,
  seasonRegrowthMultiplier,
  thermalAt,
  tileTemperature,
  fermentTempRate
} from '../services/EnvironmentService';
import { zoneTileKeys } from '../services/DesignationService';
import { soilTierForTile } from '../core/defs/terrains';
import { cropHealth, cropLossPerDay } from '../core/rules/world/cropHealth';
import { markTileDirty } from '../core/state/tileDeltas';
import {
  RESOURCE_VISIBLE_GROWTH,
  rebuildWildGrowth,
  wildGrowthSize,
  wildGrowthEntries,
  removeWildGrowth
} from '../core/rules/world/wildGrowth';
import { simLog, vlog, isVerboseLogging } from '../core/util/logSink';

const AVAILABLE_BUILDINGS = buildingsData as unknown as import('../core/types').Building[];

const UI_PUSH_MS = 1000 / 15;
const PREVIEW_PUSH_MS = 1000 / 5;
const DETERIORATION_INTERVAL_TICKS = 600;
const DECAY_INTERVAL_TICKS = 60;
const DIALOG_INTERVAL_TICKS = 90;
const DRYING_INTERVAL_TICKS = 60;
const JOB_GENERATION_INTERVAL_TICKS = 6;
const PHASE_LOG_TICKS = 120;

function popOrder(p: Pawn): {
  draftTarget: PawnOrder | undefined;
  manualQueue: PawnOrder[] | undefined;
} {
  const q = p.manualQueue ?? [];
  return q.length > 0
    ? { draftTarget: q[0], manualQueue: q.length > 1 ? q.slice(1) : undefined }
    : { draftTarget: undefined, manualQueue: undefined };
}

export class GameEngineImpl implements GameEngine {
  private gameState: GameState | null = null;
  private gameStateManager: GameStateManager | null = null;
  private _lastRegrowthWorldMap: WorldTile[][] | null = null;
  private _lastWildGrowthWorldMap: WorldTile[][] | null = null;
  private config: GameEngineConfig;
  private lastTurnProcessed = 0;
  private lastFlushMs = 0;
  private temperatureSeason: import('../core/types').Season | undefined = undefined;
  private tempProbe: { x: number; y: number } | undefined = undefined;
  private _seasonJustTransitioned = false;
  private _lastGrowthDay: number | undefined = undefined;
  private weatherFreezing = false;
  private _snowScanRow = 0;
  private _phaseMs: Record<string, number> = {};
  private _phaseTicks = 0;
  private _dbg = false;
  private avgTileTemp: number | undefined = undefined;
  private outputSink: ((state: GameState, flush: boolean) => void) | null = null;
  private commitSink: ((state: GameState, save: boolean) => void) | null = null;

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

  private timed(label: string, fn: () => void): void {
    if (!this._dbg) {
      fn();
      return;
    }
    const s = performance.now();
    fn();
    this._phaseMs[label] = (this._phaseMs[label] ?? 0) + (performance.now() - s);
  }

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
      this.gameState = { ...this.gameState, turn: this.gameState.turn + 1 };

      if (this.previewMode) return this.processPreviewTurn();

      this._dbg = isVerboseLogging();
      const dbg = this._dbg;
      const acc = this._phaseMs;
      const t = (label: string, fn: () => void): void => this.timed(label, fn);

      t('environment', () => this.processEnvironment());

      t('needsTick', () => {
        this.gameState = pawnService.processNeedsTick(this.gameState!);
        this.gameState = pawnService.processAutoDrink(this.gameState!);
        this.gameState = pawnService.processAutoWash(this.gameState!);
      });
      t('itemDecay', () => {
        if (this.gameState!.turn % DECAY_INTERVAL_TICKS === 0)
          this.gameState = itemService.stepItemDecay(this.gameState!, DECAY_INTERVAL_TICKS);
      });
      t('itemDeterioration', () => {
        if (this.gameState!.turn % DETERIORATION_INTERVAL_TICKS === 0)
          this.gameState = itemService.stepItemDeterioration(
            this.gameState!,
            DETERIORATION_INTERVAL_TICKS
          );
      });
      t('drying', () => {
        if (this.gameState!.turn % DRYING_INTERVAL_TICKS === 0)
          this.gameState = itemService.stepDrying(this.gameState!, DRYING_INTERVAL_TICKS);
      });
      t('researchTick', () => {
        this.gameState = researchService.processResearchTick(this.gameState!);
      });
      t('pendingCrafts', () => {
        this.gameState = jobService.reservePendingCraftOrders(this.gameState!);
      });
      t('generateJobs', () => {
        if (this.gameState!.turn % JOB_GENERATION_INTERVAL_TICKS === 0)
          this.gameState = jobService.generateJobs(this.gameState!);
      });
      t('buildings', () => this.processBuildings());
      t('passiveProd', () => this.processPassiveProduction());
      t('pawns', () => this.processPawns());
      t('growth', () => this.processGrowth());
      t('resourceRegrowth', () => this.processResourceRegrowth());
      t('cropGrowth', () => this.processCropGrowth());
      t('wildGrowth', () => this.processWildGrowth());
      t('entityStep', () => {
        t('es:spawn', () => (this.gameState = entityService.spawnEntities(this.gameState!)));
        t('es:lairs', () => (this.gameState = entityService.tickLairs(this.gameState!)));
        t('es:step', () => (this.gameState = entityService.stepEntities(this.gameState!)));
        t('es:move', () => (this.gameState = entityService.advanceMobMovement(this.gameState!)));
        t('es:hunger', () => (this.gameState = entityService.stepHunger(this.gameState!)));
        t('es:removeDead', () => (this.gameState = entityService.removeDead(this.gameState!)));
      });
      t('combat', () => {
        const preCombatState = this.gameState!;
        this.gameState = combatService.tickCombat(this.gameState!, 1000 / TICKS_PER_SECOND);
        this.gameState = entityService.handleFreshCombatCorpses(preCombatState, this.gameState!);
      });
      t('reapDead', () => {
        this.gameState = reapDeadPawns(this.gameState!);
      });
      t('events', () => {
        if (this._seasonJustTransitioned && !this.gameState!.pendingEvent) {
          this.gameState = rollMigrantWave(this.gameState!);
        }
        this._seasonJustTransitioned = false;
        if (this.gameState!.turn % (TURNS_PER_DAY * TICKS_PER_SECOND) === 0) {
          this.gameState = kingdomService.processKingdomsDaily(this.gameState!);
          this.gameState = socialService.processSocialTurn(this.gameState!);
        }
        if (this.gameState!.turn % DIALOG_INTERVAL_TICKS === 0) {
          this.gameState = socialService.processDialogTick(this.gameState!);
        }
      });
      this.debugLogPawns();

      this.lastTurnProcessed = this.gameState.turn;
      t('mgrUpdate', () => this.gameStateManager!.updateState(this.gameState!));
      t('uiPush', () => {
        const nowMs = performance.now();
        const flush = nowMs - this.lastFlushMs >= UI_PUSH_MS;
        if (flush) this.lastFlushMs = nowMs;
        this.outputSink?.(this.gameState!, flush);
      });

      if (dbg && ++this._phaseTicks >= PHASE_LOG_TICKS) {
        const ticks = this._phaseTicks;
        const line = Object.entries(acc)
          .sort((a, b) => b[1] - a[1])
          .map(([k, ms]) => `${k}=${(ms / ticks).toFixed(3)}`)
          .join(' ');
        vlog('perf', this.gameState.turn, `PHASE-MS/tick over ${ticks}t: ${line}`);
        const p = readMobPathStats();
        let walkable = 0;
        let total = 0;
        for (const row of this.gameState.worldMap) {
          total += row.length;
          for (const t of row) if (t.walkable) walkable++;
        }
        vlog(
          'perf',
          this.gameState.turn,
          `A*-STATS/tick over ${ticks}t: calls=${(p.calls / ticks).toFixed(1)} ` +
            `fail%=${p.calls ? ((p.fails / p.calls) * 100).toFixed(0) : 0} ` +
            `ms=${(p.ms / ticks).toFixed(2)} avgLen=${p.calls - p.fails > 0 ? (p.len / (p.calls - p.fails)).toFixed(1) : 0} ` +
            `| fails-by: ${p.byLabel} | map=${total} walkable=${walkable} (${total ? ((walkable / total) * 100).toFixed(0) : 0}%)`
        );
        this._phaseMs = {};
        this._phaseTicks = 0;
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

  private processPreviewTurn(): TurnProcessingResult {
    try {
      this.processEnvironment();

      this.gameState = entityService.stepEntities(this.gameState!);
      this.gameState = entityService.advanceMobMovement(this.gameState!);

      this.lastTurnProcessed = this.gameState!.turn;
      this.gameStateManager!.updateState(this.gameState!);

      const nowMs = performance.now();
      const flush = nowMs - this.lastFlushMs >= PREVIEW_PUSH_MS;
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

  private processEnvironment(): void {
    const gs = this.gameState;
    if (!gs) return;

    const derived = seasonForTurn(gs.turn);
    const season = gs._debugSeason ?? derived.season;
    const seasonDay = derived.seasonDay;
    if (season !== gs.season) {
      const prevSeason = gs.season;
      gs.season = season;
      if (prevSeason) {
        this._seasonJustTransitioned = true;
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

    if (gs.worldMap.length > 0) {
      let probe = this.tempProbe ? gs.worldMap[this.tempProbe.y]?.[this.tempProbe.x] : undefined;
      if (!probe?.walkable) {
        probe = undefined;
        outer: for (const row of gs.worldMap) {
          for (const t of row) {
            if (t.walkable) {
              probe = t;
              this.tempProbe = { x: t.x, y: t.y };
              break outer;
            }
          }
        }
      }
      const cacheValid =
        this.temperatureSeason === season &&
        !!probe &&
        probe.temperature === seasonBakedTemp(probe.terrainType, season);
      if (!cacheValid) {
        this.avgTileTemp = recomputeWorldTemperature(gs.worldMap, season);
        this.temperatureSeason = season;
      }
    }

    const globalAirTemp = (this.avgTileTemp ?? 10) + diurnalTempDelta(gs.turn, gs.season);
    const freezing = weatherFreezing(globalAirTemp, this.weatherFreezing);
    this.weatherFreezing = freezing;

    const ticksPerDay = TURNS_PER_DAY * TICKS_PER_SECOND;
    if (!this.previewMode && gs.turn % ticksPerDay === 0 && gs.weather) {
      const prevType = gs.weather.type;
      gs.weather = advanceWeatherForDay(gs.weather, season, rng, freezing);
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

    if (!this.previewMode && gs.weather) {
      const liveType = rederiveWeatherType(gs.weather, season, freezing);
      if (liveType !== gs.weather.type) gs.weather = { ...gs.weather, type: liveType };
    }

    if (this.avgTileTemp !== undefined) {
      const avg = Math.round(
        this.avgTileTemp +
          weatherEffects(gs.weather).tempDelta +
          diurnalTempDelta(gs.turn, gs.season)
      );
      if (avg !== gs.avgTemperature) gs.avgTemperature = avg;
    }

    const snowInterval = Math.max(1, Math.floor(ticksPerDay / 24));
    const H = gs.worldMap.length;
    if (H > 0) {
      const rowsPerTick = Math.max(1, Math.ceil(H / snowInterval));
      const sweepTicks = Math.ceil(H / rowsPerTick);
      const hours = sweepTicks / (ticksPerDay / 24);
      const startRow = this._snowScanRow >= H ? 0 : this._snowScanRow;
      const endRow = Math.min(H, startRow + rowsPerTick);
      this.timed('env:snowIce', () =>
        accumulateSnow(
          gs.worldMap,
          gs.weather,
          gs.season,
          gs.turn,
          hours,
          patchPathfindingWalkable,
          startRow,
          endRow
        )
      );
      this._snowScanRow = endRow >= H ? 0 : endRow;
    }

    this.timed('env:thermal', () => rebuildThermalField(gs.buildings, gs.worldMap));

    this.timed('env:connectivity', () => maybeRebuildConnectivity(gs.worldMap, gs.turn));
  }

  private processResourceRegrowth(): void {
    if (!this.gameState) return;
    const gs = this.gameState;

    if (gs.worldMap !== this._lastRegrowthWorldMap) {
      rebuildRegrowthQueue(gs.worldMap);
      this._lastRegrowthWorldMap = gs.worldMap;
    }
    if (peekRegrowthTurn() > gs.turn) return;

    while (peekRegrowthTurn() <= gs.turn) {
      const e = popRegrowth()!;
      const tile = gs.worldMap[e.y]?.[e.x];
      const cooldowns = tile?.resourceCooldowns;
      if (!tile || !cooldowns) continue;

      let expiredKeys: string[] | null = null;
      for (const k in cooldowns) {
        if (gs.turn >= cooldowns[k]) (expiredKeys ??= []).push(k);
      }
      if (!expiredKeys) continue;

      let tileChanged = false;
      for (const key of expiredKeys) {
        const isCompound = key.includes(':');

        if (isCompound) {
          const colonIdx = key.indexOf(':');
          const resourceId = key.slice(0, colonIdx);

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
            tile.resources[resourceId] = 1;
            gatedConsole.log(
              `[Regrowth] ${key} at (${tile.x},${tile.y}) recovered (partial — other yields still cooling)`
            );
          } else {
            const [minAmt, maxAmt] = def?.nodeAmountRange ?? [1, 3];
            const newResourceCount = minAmt + Math.floor(rng.random() * (maxAmt - minAmt + 1));
            tile.resources[resourceId] = newResourceCount;
            if (tile.growth) tile.growth[resourceId] = 100;
            if (def?.walkable === false) {
              tile.walkable = false;
              tile.blocksSight = def.blocksSight ?? false;
              patchPathfindingWalkable(tile.x, tile.y, false);
            }
            gatedConsole.log(
              `[Regrowth] ${resourceId} at (${tile.x},${tile.y}) fully restored ×${newResourceCount}`
            );
          }
        } else {
          const def = resourceObjectService.getById(key);
          const [minAmt, maxAmt] = def?.nodeAmountRange ?? [1, 3];
          const restored = minAmt + Math.floor(rng.random() * (maxAmt - minAmt + 1));

          delete cooldowns[key];
          tile.resources[key] = restored;
          if (tile.growth) tile.growth[key] = 100;
          if (def?.walkable === false) {
            tile.walkable = false;
            tile.blocksSight = def.blocksSight ?? false;
            patchPathfindingWalkable(tile.x, tile.y, false);
          }
          gatedConsole.log(`[Regrowth] ${key} at (${tile.x},${tile.y}) regrew ×${restored}`);
        }
        tileChanged = true;
      }

      if (tileChanged) markTileDirty(e.y, e.x, tile);

      const nextMin = minCooldownExpiry(cooldowns);
      if (nextMin !== Infinity) pushRegrowth(nextMin, e.x, e.y);
    }
  }

  private processCropGrowth(): void {
    if (!this.gameState) return;
    const gs = this.gameState;
    const growTiles = zoneTileKeys(gs, 'grow');
    if (growTiles.length === 0) return;
    const rate = seasonRegrowthMultiplier(gs.season);
    const ticksPerDay = TURNS_PER_DAY * TICKS_PER_SECOND;
    const growthScale = gs._devCropGrowthScale ?? 1;

    for (const key of growTiles) {
      const ci = key.indexOf(',');
      const x = +key.slice(0, ci);
      const y = +key.slice(ci + 1);
      const tile = gs.worldMap[y]?.[x];
      const growth = tile?.growth;
      if (!tile || !growth) continue;

      for (const id in growth) {
        if (growth[id] >= 100) continue;
        const def = resourceObjectService.getById(id);
        const c = def?.crop;
        if (!c) continue;

        const thermal = thermalAt(x, y);
        const temp = tileTemperature(tile.terrainType, gs.season, gs.turn, gs.weather, thermal);
        const m = tile.moisture ?? 0;
        const health = cropHealth(c, {
          soilTier: soilTierForTile(tile),
          temp,
          moisture: m,
          snow: tile.snow ?? 0
        });
        if (health.soilDead) {
          if (growth[id] !== 1) {
            growth[id] = 1;
            if ((tile.resources[id] ?? 0) > 0) tile.resources[id] = 0;
            markTileDirty(y, x, tile);
          }
          continue;
        }
        if (health.severity > 0) {
          const loss = (cropLossPerDay(health.severity) / ticksPerDay) * growthScale;
          const next = Math.max(1, growth[id] - loss);
          if (next !== growth[id]) {
            growth[id] = next;
            if (next <= 1 && (tile.resources[id] ?? 0) > 0) tile.resources[id] = 0;
            markTileDirty(y, x, tile);
          }
          continue;
        }
        if (c.needsLight && thermal.roofed) continue;

        const totalTicks = Math.max(1, ticksFromSeconds(c.growthTurns) / rate);
        const next = Math.min(100, growth[id] + (100 / totalTicks) * growthScale);
        growth[id] = next;
        if (next >= 100 && (tile.resources[id] ?? 0) <= 0) {
          const [mn, mx] = def!.nodeAmountRange ?? [1, 1];
          tile.resources[id] = mn + Math.floor(rng.random() * (mx - mn + 1));
        }
        markTileDirty(y, x, tile);
      }
    }
  }

  private processWildGrowth(): void {
    if (!this.gameState) return;
    const gs = this.gameState;
    if (gs.worldMap !== this._lastWildGrowthWorldMap) {
      rebuildWildGrowth(gs.worldMap, (id) => resourceObjectService.isRegrowsFromZero(id));
      this._lastWildGrowthWorldMap = gs.worldMap;
    }
    if (wildGrowthSize() === 0) return;

    const rate = seasonRegrowthMultiplier(gs.season);
    const DIRTY_BUCKET = 5;
    const visualBucket = (g: number) =>
      g < RESOURCE_VISIBLE_GROWTH ? -1 : Math.floor(g / DIRTY_BUCKET);

    for (const { x, y } of wildGrowthEntries()) {
      const tile = gs.worldMap[y]?.[x];
      const growth = tile?.growth;
      if (!tile || !growth) {
        removeWildGrowth(x, y);
        continue;
      }
      let stillGrowing = false;
      for (const id in growth) {
        const g = growth[id];
        if (g >= 100) continue;
        const interaction = resourceObjectService.getRegrowsFromZeroInteraction(id);
        if (!interaction?.regrowthTurns) continue;
        const totalTicks = Math.max(1, ticksFromSeconds(interaction.regrowthTurns) / rate);
        const next = Math.min(100, g + 100 / totalTicks);
        growth[id] = next;
        if (next >= MIN_FORAGE_GROWTH && (tile.resources[id] ?? 0) <= 0) {
          const [mn, mx] = resourceObjectService.getById(id)?.nodeAmountRange ?? [1, 1];
          tile.resources[id] = mn + Math.floor(rng.random() * (mx - mn + 1));
        }
        if (next < 100) stillGrowing = true;
        if (visualBucket(g) !== visualBucket(next)) markTileDirty(y, x, tile);
      }
      if (!stillGrowing) removeWildGrowth(x, y);
    }
  }

  private debugLogPawns(): void {
    if (!this.gameState) return;
    if (!isGameDebug()) return;
    const gs = this.gameState;
    if (gs.turn % TICKS_PER_SECOND !== 0) return;
    const T = gs.turn;
    const wasmReady = pathfinderService.isReady();
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
    const blocked = occupancyService.blockedTiles(gs);
    for (const pawn of gs.pawns) {
      if (pawn.isAlive === false || !pawn.drafted || !pawn.draftTarget || !pawn.position) continue;
      if (pawn.currentState === 'Collapsed') continue;
      const target = pawn.draftTarget;
      if (target.type === 'move') {
        if (pawn.position.x === target.x && pawn.position.y === target.y) {
          gs = pawnService.assignPath(pawn.id, [], gs);
          gs = {
            ...gs,
            pawns: gs.pawns.map((p) =>
              p.id === pawn.id ? { ...p, ...popOrder(p), hasReachedDestination: true } : p
            )
          };
          continue;
        }
        const route = pawn.path;
        const end = route && route.length > 0 ? route[route.length - 1] : undefined;
        const hasLiveRoute =
          !!end &&
          (pawn.pathIndex ?? 0) < route!.length &&
          end.x === target.x &&
          end.y === target.y;
        if (hasLiveRoute) continue;
        gs = assignDraftMovePath(gs, pawn, target.x, target.y, blocked);
      } else if (target.type === 'attack') {
        let tx = -1,
          ty = -1;
        if (target.targetType === 'mob') {
          const mob = (gs.mobs ?? []).find((m) => m.id === target.targetId);
          if (!mob || mob.isAlive === false) {
            gs = {
              ...gs,
              pawns: gs.pawns.map((p) => (p.id === pawn.id ? { ...p, ...popOrder(p) } : p))
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
              pawns: gs.pawns.map((p) => (p.id === pawn.id ? { ...p, ...popOrder(p) } : p))
            };
            continue;
          }
          tx = tp.position?.x ?? -1;
          ty = tp.position?.y ?? -1;
        }
        if (tx < 0 || ty < 0) continue;
        const dx = Math.abs(pawn.position.x - tx);
        const dy = Math.abs(pawn.position.y - ty);
        const rw = getRangedWeapon(pawn);
        const rangedAuto = !!rw && target.mode !== 'melee';
        const meleeReach = rw
          ? 1
          : Math.max(
              1,
              (pawn.equipment?.mainHand
                ? itemService.getItemById(pawn.equipment.mainHand.itemId)?.weaponProperties?.reach
                : undefined) ?? 1
            );
        const stopDist =
          rangedAuto && !hasViableAmmo(pawn, rw!)
            ? Infinity
            : rangedAuto
              ? Math.max(1, Math.floor(effectiveRangedRange(pawn, rw!)))
              : meleeReach;
        if (Math.max(dx, dy) <= stopDist) {
          if (pawn.isMoving) {
            gs = pawnService.assignPath(pawn.id, [], gs);
          }
        } else {
          const { walkable, costs, width, height } = buildPathfindingGridsSoftBlocked(
            gs.worldMap,
            blocked,
            pawn.position.x,
            pawn.position.y,
            tx,
            ty
          );
          const path = pathfinderService.findPath(
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
            pawns: gs.pawns.map((p) => (p.id === pawn.id ? { ...p, ...popOrder(p) } : p))
          };
        };
        const walkTo = (tx: number, ty: number) => {
          const grids = buildPathfindingGridsSoftBlocked(
            gs.worldMap,
            blocked,
            pawn.position!.x,
            pawn.position!.y,
            tx,
            ty
          );
          const path = pathfinderService.findPath(
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
          const dp = findNearestDepositPoint(pawn, gs);
          if (!dp) {
            clearHaul();
          } else if (pawn.position.x === dp.x && pawn.position.y === dp.y) {
            gs = pawnService.assignPath(pawn.id, [], gs);
            const here = gs.pawns.find((p) => p.id === pawn.id);
            if (here) gs = depositInventory(here, gs);
          } else {
            walkTo(dp.x, dp.y);
          }
        } else if (srcHasLoose) {
          const atSrc =
            (pawn.position.x === target.x && pawn.position.y === target.y) ||
            isAdjacent(pawn.position.x, pawn.position.y, target.x, target.y);
          if (atSrc) {
            gs = pawnService.assignPath(pawn.id, [], gs);
            gs = pickUpFromTile(gs, pawn.id, target.x, target.y, { looseOnly: true });
          } else {
            gs = this._draftWalk(gs, pawn, target.x, target.y);
          }
        } else {
          clearHaul();
        }
      } else if (target.type === 'equip') {
        const drop = (gs.droppedItems ?? []).find((d) => d.id === target.dropId && d.quantity > 0);
        const clearEquip = () => {
          gs = {
            ...gs,
            pawns: gs.pawns.map((p) => (p.id === pawn.id ? { ...p, ...popOrder(p) } : p))
          };
        };
        const atDrop =
          !!drop &&
          ((pawn.position.x === drop.x && pawn.position.y === drop.y) ||
            isAdjacent(pawn.position.x, pawn.position.y, drop.x, drop.y));
        if (!drop) {
          clearEquip();
        } else if (atDrop) {
          gs = pawnService.assignPath(pawn.id, [], gs);
          gs =
            target.slot === 'inventory'
              ? carryDropToInventory(gs, pawn.id, target.dropId)
              : equipDropToPawn(gs, pawn.id, target.dropId, target.slot);
          clearEquip();
        } else {
          gs = this._draftWalk(gs, pawn, drop.x, drop.y);
        }
      } else if (target.type === 'rescue') {
        const endRescue = () => {
          gs = {
            ...gs,
            pawns: gs.pawns.map((p) =>
              p.id === pawn.id
                ? { ...p, ...popOrder(p), drafted: target.auto ? false : p.drafted }
                : p
            )
          };
        };
        const victim = gs.pawns.find((p) => p.id === target.victimId);
        const carrying = victim?.carriedBy === pawn.id;
        const here = pawn.position;
        const setDownBeside = () => {
          const t = freeDropTileNear(gs, here.x, here.y, target.victimId);
          gs = dropCarriedPawn(gs, pawn.id, target.victimId, t.x, t.y);
        };
        if (!victim || victim.isAlive === false || !victim.position) {
          if (carrying) setDownBeside();
          endRescue();
        } else if (!carrying) {
          if (victim.currentState !== 'Collapsed') {
            endRescue();
          } else if (
            isAdjacent(here.x, here.y, victim.position.x, victim.position.y) ||
            (here.x === victim.position.x && here.y === victim.position.y)
          ) {
            gs = pawnService.assignPath(pawn.id, [], gs);
            gs = pickUpPawn(gs, pawn.id, target.victimId);
          } else {
            gs = this._draftWalk(gs, pawn, victim.position.x, victim.position.y);
          }
        } else {
          const dest = nearestShelterTile(gs, here.x, here.y);
          if (!dest) {
            setDownBeside();
            endRescue();
          } else if (
            (here.x === dest.x && here.y === dest.y) ||
            isAdjacent(here.x, here.y, dest.x, dest.y)
          ) {
            gs = pawnService.assignPath(pawn.id, [], gs);
            gs = dropCarriedPawn(gs, pawn.id, target.victimId, dest.x, dest.y);
            endRescue();
          } else {
            gs = this._draftWalk(gs, pawn, dest.x, dest.y);
          }
        }
      } else if (target.type === 'tend') {
        const patient = gs.pawns.find((p) => p.id === target.patientId);
        const clearTend = () => {
          gs = {
            ...gs,
            pawns: gs.pawns.map((p) =>
              p.id === pawn.id ? { ...p, ...popOrder(p), tendProgress: undefined } : p
            )
          };
        };
        const setNextTend = (nextTendTurn: number) => {
          gs = {
            ...gs,
            pawns: gs.pawns.map((p) =>
              p.id === pawn.id
                ? { ...p, draftTarget: { type: 'tend', patientId: target.patientId, nextTendTurn } }
                : p
            )
          };
        };
        const perWoundTurns = (medic: Pawn) =>
          Math.max(
            1,
            Math.ceil(
              (TEND_WORK /
                (BASE_WORK_RATE *
                  (pawnStatService.getWorkModifiers(medic, 'caretaking').speed || 1))) *
                TICKS_PER_SECOND
            )
          );
        const setTendProgress = (progress: number) => {
          gs = {
            ...gs,
            pawns: gs.pawns.map((p) => (p.id === pawn.id ? { ...p, tendProgress: progress } : p))
          };
        };
        if (
          !patient ||
          patient.isAlive === false ||
          !patient.position ||
          !hasUntendedWound(patient, gs.turn)
        ) {
          clearTend();
        } else if (
          isAdjacent(pawn.position.x, pawn.position.y, patient.position.x, patient.position.y) ||
          (pawn.position.x === patient.position.x && pawn.position.y === patient.position.y)
        ) {
          gs = pawnService.assignPath(pawn.id, [], gs);
          if (target.nextTendTurn === undefined || gs.turn >= target.nextTendTurn) {
            const medic = gs.pawns.find((p) => p.id === pawn.id)!;
            gs = tendPatient(patient, medic, gs);
            const after = gs.pawns.find((p) => p.id === target.patientId);
            if (!after || !hasUntendedWound(after, gs.turn)) {
              clearTend();
            } else {
              setNextTend(gs.turn + perWoundTurns(medic));
              setTendProgress(0);
            }
          } else {
            const medic = gs.pawns.find((p) => p.id === pawn.id)!;
            const window = perWoundTurns(medic);
            const remaining = target.nextTendTurn - gs.turn;
            setTendProgress(Math.max(0, Math.min(1, 1 - remaining / window)));
          }
        } else {
          gs = this._draftWalk(gs, pawn, patient.position.x, patient.position.y);
        }
      } else if (target.type === 'forceJob') {
        const job = (gs.jobs ?? []).find((j) => j.id === target.jobId);
        const dropOrder = () => {
          let next = gs;
          if (job && job.claimedBy === pawn.id) next = jobService.releaseJob(pawn.id, job.id, next);
          gs = {
            ...next,
            pawns: next.pawns.map((p) => (p.id === pawn.id ? { ...p, ...popOrder(p) } : p))
          };
        };
        if (!job) {
          dropOrder();
        } else {
          const atSite =
            (job.targetX === 0 && job.targetY === 0) ||
            (pawn.position.x === job.targetX && pawn.position.y === job.targetY) ||
            isAdjacent(pawn.position.x, pawn.position.y, job.targetX, job.targetY);
          if (!atSite) {
            gs = this._draftWalk(gs, pawn, job.targetX, job.targetY);
          } else {
            gs = pawnService.assignPath(pawn.id, [], gs);
            gs = jobService.claimJob(pawn.id, job.id, gs);
            gs = advanceJobOneTick(pawn, job, job.id, gs);
            if (!(gs.jobs ?? []).some((j) => j.id === job.id)) {
              gs = {
                ...gs,
                pawns: gs.pawns.map((p) => (p.id === pawn.id ? { ...p, ...popOrder(p) } : p))
              };
            }
          }
        }
      }
    }
    return gs;
  }

  private _draftWalk(gs: GameState, pawn: Pawn, tx: number, ty: number): GameState {
    return tryAssignPath(pawn, tx, ty, gs) ?? gs;
  }

  private processGrowth(): void {
    const gs = this.gameState;
    if (!gs) return;
    const day = dayIndexForTurn(gs.turn);
    if (this._lastGrowthDay === undefined) {
      this._lastGrowthDay = day;
      return;
    }
    if (day === this._lastGrowthDay) return;
    for (let d = this._lastGrowthDay + 1; d <= day; d++) pawnGrowthService.processDay(gs, d);
    this._lastGrowthDay = day;
  }

  private processPawns(): void {
    const tp = (_label: string, fn: () => void): void => fn();
    if (this.gameState!.pawns?.some((p) => p.drafted && p.draftTarget)) {
      tp('p.draft', () => {
        this.gameState = this._processDraftOrders(this.gameState!);
      });
    }
    if (this.gameState!.pawns?.some((p) => p.isMoving)) {
      tp('p.movement', () => {
        this.gameState = pawnService.processMovement({ ...this.gameState! });
      });
    }
    tp('p.stateMachine', () => {
      this.gameState = pawnStateMachineService.tick(this.gameState!);
    });
    tp('p.clearTemp', () => {
      this.gameState = pawnService.clearTemporaryPawnStates(this.gameState!);
    });
    tp('p.syncWork', () => {
      this.gameState = workService.syncPawnWorkingStates(this.gameState!);
    });
    tp('p.pawnTurn', () => {
      this.gameState = pawnService.processPawnTurn(this.gameState!);
    });
    tp('p.reconcileCarry', () => {
      this.gameState = reconcileCarriedPawns(this.gameState!);
    });
    tp('p.deOverlap', () => {
      if (((this.gameState!.turn ?? 0) & 31) === 0)
        this.gameState = separateStackedBodies(this.gameState!);
    });
  }

  private processPassiveProduction(): void {
    if (!this.gameState) return;
    const queue = this.gameState.craftingQueue ?? [];
    if (queue.length === 0) return;

    const PASSIVE_WORK_PER_SECOND = 1;
    let state = this.gameState;
    let changed = false;

    for (const order of [...queue]) {
      if (
        !recipeService.isPassive(
          order.recipeId
            ? recipeService.getRecipeById(order.recipeId)
            : recipeService.getRecipeForItem(order.item.id)
        ) &&
        !recipeService.isPassiveStation(order.stationType)
      )
        continue;
      const station = (state.buildings ?? []).find(
        (b) => b.id === order.stationBuildingId && b.status === 'complete'
      );
      if (!station) continue;
      if (!jobService.isOrderSupplied(order, state)) continue;
      const def = AVAILABLE_BUILDINGS.find((d) => d.id === station.type);
      if ((def?.maxFuel ?? 0) > 0 && !state._devInfiniteFuel) {
        if (!station.lit) continue;
        if ((station.fireHeat ?? 0) < (def?.minFuelHeat ?? 0)) continue;
      }

      let workRate = 1;
      if (def?.effects?.fermentation) {
        const tile = state.worldMap?.[station.y]?.[station.x];
        const temp = tileTemperature(
          tile?.terrainType ?? 'plains',
          state.season,
          state.turn,
          state.weather
        );
        workRate = fermentTempRate(temp);
        if (workRate <= 0) continue;
      }

      const newDone = (order.workDone ?? 0) + perTick(PASSIVE_WORK_PER_SECOND) * workRate;
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
    this.gameState = buildingService.processDeconstructionQueue(this.gameState!);

    this.gameState = this._processCampfireFuel(this.gameState!);

    this.gameState = buildingService.stepBuildingCondition(this.gameState!);

    this.gameState = buildingService.stepTraps(this.gameState!);
  }

  private _processCampfireFuel(gs: GameState): GameState {
    let changed = false;
    const newBuildings = (gs.buildings ?? []).map((b) => {
      const buildingDef = AVAILABLE_BUILDINGS.find((def) => def.id === b.type);
      if (!buildingDef?.maxFuel || !buildingDef.fuelConsumptionRate) return b;
      if (b.status !== 'complete') return b;
      if (gs._devInfiniteFuel) {
        const heat = Math.max(buildingDef.minFuelHeat ?? 0, 5);
        if (b.lit && b.fuel === buildingDef.maxFuel && b.fireHeat === heat) return b;
        changed = true;
        return { ...b, lit: true, fuel: buildingDef.maxFuel, fireHeat: heat, burnFactor: 1 };
      }
      if (!b.lit && (b.fuel ?? 0) > 0) {
        changed = true;
        return { ...b, lit: true };
      }
      if (!b.lit) return b;
      const burnFactor = b.burnFactor ?? 1;
      const newFuel = Math.max(
        0,
        (b.fuel ?? 0) - perTick(buildingDef.fuelConsumptionRate / burnFactor)
      );
      const newLit = newFuel > 0;
      if (newFuel === b.fuel && newLit === b.lit) return b;
      changed = true;
      return newLit
        ? { ...b, fuel: newFuel, lit: newLit }
        : { ...b, fuel: newFuel, lit: newLit, fireHeat: 0, burnFactor: 1 };
    });
    if (!changed) return gs;
    return { ...gs, buildings: newBuildings };
  }

  updateStores(): void {
    if (!this.gameState) return;
    this.commitSink?.(this.gameState, true);
  }

  applyCommand(updater: (state: GameState) => GameState, save: boolean): void {
    if (!this.gameState) return;
    this.gameState = updater(this.gameState);
    this.gameStateManager?.updateState(this.gameState);
    this.commitSink?.(this.gameState, save);
  }

  processTick(): void {
    this.processGameTurn();
  }

  patchWorldMap(worldMap: import('../core/types').WorldTile[][]): void {
    if (this.gameState) this.gameState = { ...this.gameState, worldMap };
  }

  getGameState(): GameState {
    if (!this.gameState) throw new Error('GameState not initialized');
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

  setGameStateManager(manager: GameStateManager): void {
    this.gameStateManager = manager;
    this.gameState = manager.getState();
  }

  integrateServices(services: any): void {
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

export const gameEngine = new GameEngineImpl();

export function initializeGameEngine(gameStateManager: GameStateManager): GameEngineImpl {
  gameEngine.setGameStateManager(gameStateManager);
  return gameEngine;
}
