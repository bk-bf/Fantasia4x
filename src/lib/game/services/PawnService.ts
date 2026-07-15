import type {
  GameState,
  Pawn,
  Mob,
  EntityNeeds,
  PawnState,
  TransientConditionDef,
  EntityCondition,
  ConditionDef,
  ConditionStage
} from '../core/types';
import { consumeFromStockpiles } from '../core/GameState';
import { pawnById } from '../core/pawnIndex';
import { categorizeStats, getStatDescription } from '../entities/Pawns';
import { pawnStatService } from './PawnStatService';
import { itemService } from './ItemService';
import { WORK_CATEGORIES } from '../core/Work';
import { TICKS_PER_SECOND, SECONDS_PER_TICK, perTick } from '../core/time';
import { stepBody } from './MovementSystem';
import { occupancyService } from './OccupancyService';
import conditionsData from '../database/pawns/conditions.jsonc';
import { NEEDS_DB, needNum } from '../core/needsDefs';
import { moodEffect, MOOD_BASE } from '../core/moodEffects';
import { getConditionCurrentStage, conditionNeedMultipliers, getConditionDefById } from '../core/needs';
import { amenityAt } from '../core/buildingAmenity';
import { effectiveMood, moodModifierValue } from '../core/Social';
import {
  getAmbientLight,
  weatherEffects,
  celestialMoodEffect,
  diurnalTempDelta,
  thermalAt,
  effectiveTemperature,
  isRoofedTile,
  tileWetness,
  accrueWetness,
  seasonBakedTemp
} from './EnvironmentService';
// Gated console shim — see core/log.ts. Silences per-tick log/debug/warn unless
// gameDebug(true); console.error still surfaces.
import { gatedConsole as console } from '../core/log';

// conditions.jsonc holds persistent and transient conditions; `pawn.transientConditions`
// references the transient ones — pick them out by the `duration` discriminant.
const TRANSIENT_CONDITIONS_DB = (
  conditionsData as unknown as Array<ConditionDef | TransientConditionDef>
).filter((d): d is TransientConditionDef => d.transient === true);

/** Resolve active effect definitions from a pawn's transientConditions id list. */
function getActiveTransientConditions(entity: Pawn | Mob): TransientConditionDef[] {
  return (entity.transientConditions ?? [])
    .map((id) => TRANSIENT_CONDITIONS_DB.find((e) => e.id === id))
    .filter((e): e is TransientConditionDef => e !== undefined);
}

// ── MOOD-REWORK tunables (realistic scale) ──────────────────────────────────────────────────────
// Mood is a single 0–100 value that eases toward a computed TARGET; it does NOT drift by per-tick
// nudges anymore. Everything (weather/conditions/traits/needs/events) is a signed point offset summed
// into that target (computeMoodTarget). Data-authored offsets live in the four *.jsonc files.
// MOOD-REWORK bands are DATA — tunable without code. Mood-general bands (base/health/labels) live in
// mood.jsonc; the PER-NEED mood bands live in needs.jsonc (each need owns its mood effect). The dynamic
// contributions (weather/trait/condition/thought/amenity) are still computed live in computeMoodTarget.
/** Per-need defs (needs.jsonc) — iterated below for each need's mood bands. */
const NEED_MOOD = NEEDS_DB;
// Ease at ~0.4 mood/in-game-second → a ~10-point gap closes in ~2 in-game hours (the design target).
const MOOD_EASE_STEP = perTick(0.4);

/** Does the pawn have condition `id` (persistent OR transient, allowing an "id:stage" transient)? Used
 *  for a mood effect's `negatedBy` gate. Allocation-free. */
function pawnHasCondition(pawn: Pawn, id: string): boolean {
  if (pawn.conditions?.some((c) => c.id === id)) return true;
  const tc = pawn.transientConditions;
  if (tc) for (const t of tc) if (t === id || (t.includes(':') && t.split(':')[0] === id)) return true;
  return false;
}

/**
 * PawnService - Clean interface for pawn behavior and need management
 * Handles ONLY pawn-specific business logic, delegates to other systems for calculations
 */
export interface PawnService {
  // Need Management (PawnService responsibility)
  updatePawnNeeds(pawnId: string, gameState: GameState): GameState;

  // State Management (PawnService responsibility)
  updatePawnState(pawnId: string, gameState: GameState): GameState;

  // Activity Management (PawnService responsibility)
  getPawnActivities(pawnId: string, gameState: GameState): string[];

  // Stat Calculations (DELEGATED to existing Pawns.ts functions)
  // NB: the display-stat map itself is built by systems/pawnDisplayStats.calculatePawnStats
  // (consumed by the pawnStats store) — a service method wrapping it had no callers and would
  // reach up a layer, so it was removed.
  categorizeStats(
    stats: Record<string, { value: number; sources: string[] }>
  ): Record<string, string[]>;
  getStatDescription(statName: string, statData: { value: number; sources: string[] }): string;

  // Turn Processing (PawnService coordination)
  processPawnTurn(gameState: GameState): GameState;

  /** Continuous needs accrual for one 60 Hz tick (hunger/fatigue rise + health regen). */
  processNeedsTick(gameState: GameState): GameState;

  /** §D auto-drink: thirsty pawns drink stored water, or raw from an adjacent river/lake. */
  processAutoDrink(gameState: GameState): GameState;

  /** §D auto-wash: filthy pawns wash at an adjacent river/lake, lowering hygiene. */
  processAutoWash(gameState: GameState): GameState;

  // Sleep decision (still used by clearTemporaryPawnStates wake logic)
  shouldPawnSleep(pawn: Pawn): boolean;

  // Pawn Needs Coordination (extracted from GameEngine)
  clearTemporaryPawnStates(gameState: GameState): GameState;

  // Need Calculations (PawnService internal logic)
  calculateNeedDecay(pawnId: string, gameState: GameState): { hunger: number; rest: number };
  getPawnNeedStatus(
    pawnId: string,
    gameState: GameState
  ): { critical: string[]; warning: string[]; normal: string[] };

  // Phase 3: Map movement
  assignPath(pawnId: string, path: { x: number; y: number }[], gameState: GameState): GameState;
  teleportPawn(pawnId: string, pos: { x: number; y: number }, gameState: GameState): GameState;
  processMovement(gameState: GameState): GameState;

  /**
   * Stat-derived movement speed in tiles/second on open (movementCost 1) terrain.
   * Calibrated so an all-average pawn (DEX 10, balanced weight, healthy legs,
   * rested & fed) walks at ≈4 tiles/s — the RimWorld baseline. `sources` lists
   * each contributing factor for UI display.
   */
  getMoveSpeed(entity: Pawn | Mob): { tilesPerSecond: number; sources: string[] };

  /** Active transient condition defs for an entity, with `hidden` (internal) effects filtered out.
   *  The single source for surfacing effects in any UI (tile-HUD pills, needs panel). */
  getTransientConditions(entity: Pawn | Mob): TransientConditionDef[];
}

// §D water needs — per-second accrual (hunger baseline is ~0.54/s for reference). Values live in
// needs.jsonc (resolved once at load; the per-tick loop still reads these plain numbers).
const THIRST_INCREASE_PER_SECOND = needNum('thirst', 'rate', 0.7); // thirst builds a bit faster than hunger
const HYGIENE_INCREASE_PER_SECOND = needNum('hygiene', 'rate', 0.3); // grime builds slowly
// SOCIAL: `fun` DECAYS toward 0 (100 = entertained). ~100→0 over ~2.5 in-game days of no company, so a
// pawn seeks the fire every couple of days. Paused while SOCIALISING (recovery happens there instead).
const FUN_DECREASE_PER_SECOND = needNum('fun', 'decayRate', 0.13);
// §D auto-drink: thirst threshold to drink, and relief per unit of water.
const AUTO_DRINK_THIRST = needNum('thirst', 'autoSatisfy', 70);
const WATER_THIRST_RELIEF = needNum('thirst', 'relief', 65);
// §D auto-wash: hygiene threshold to wash at water, and the cleanliness restored.
const AUTO_WASH_HYGIENE = needNum('hygiene', 'autoSatisfy', 75);
const WASH_HYGIENE_RELIEF = needNum('hygiene', 'relief', 70);

// SEASONS_WEATHER Subsystem 3 — temperature/night need effects (PERF-3: scalar constants, read in
// the per-tick loop; no allocation). Per-degree multipliers match the spec (cold→fatigue, heat→hunger).
// Comfort range lives in core/needs.ts (comfortRange), shared with the hypothermia/heat-stroke driver.
const DEFAULT_COMFORT_TEMP = 15; // fallback when a pawn has no tile (unspawned)
const COLD_FATIGUE_PER_DEG = 0.03;
const HEAT_HUNGER_PER_DEG = 0.02;
const NIGHT_LIGHT_THRESHOLD = 0.3; // ambient below this counts as "night" for the fatigue bump
const NIGHT_FATIGUE_MUL = 1.1;

// SEASONS_WEATHER — pawn wetness meter (0-100). Soaks fast on wet tiles (rain raises tile wetness):
// a >50% tile fills the meter in ~1 in-game hour, a >80% tile in ~30 in-game minutes, and a fully-wet
// (100%) tile soaks instantly. Dries over 1–5 in-game hours depending on warmth + shelter.
// The soak/dry rates + WET_TILE_THRESHOLD now live in EnvironmentService.accrueWetness (shared with
// mobs); these are the PAWN-only dry-speed inputs (warmth + shelter) fed into it.
const WET_DRY_WARM_REF = 25; // °C at which warmth contributes its full drying speedup
const WET_DRY_SHELTER_SPEED = 0.7; // a roof contributes this much (0–1) toward fastest drying — being
//   sheltered is the dominant lever, so a pawn under cover towels off quickly even when it's cold out
const WET_DRY_WARMTH_SPEED = 0.6; // warmth contributes this much (0–1) on top (independent of shelter)

/**
 * PawnService Implementation - Focused on pawn behavior and needs only
 */
export class PawnServiceImpl implements PawnService {
  // ===== RECOVERY CONFIGURATION =====
  private RECOVERY_CONFIG = {
    EATING: {
      BASE_HUNGER_REDUCTION: 8, // Low base recovery per eating turn
      BASE_MOOD_BOOST: 2,
      DURATION_TURNS: 2,
      MAX_RECOVERY_PER_TURN: 15 // Prevents massive overflow
    },
    SLEEPING: {
      BASE_REST_REDUCTION: 12, // Single rest recovery (replaces fatigue + sleep)
      BASE_MOOD_BOOST: 1,
      DURATION_TURNS: 3,
      MAX_RECOVERY_PER_TURN: 20, // Prevents massive overflow
      MIN_RECOVERY_THRESHOLD: 30 // Must be 30+ to benefit from sleep
    },
    RESTING: {
      BASE_REST_REDUCTION: 3, // Light rest for just resting (not sleeping)
      DURATION_TURNS: 1,
      MAX_RECOVERY_PER_TURN: 8
    }
  };

  // ===== NEED MANAGEMENT =====

  updatePawnNeeds(pawnId: string, gameState: GameState): GameState {
    const pawn = gameState.pawns.find((p) => p.id === pawnId);
    if (!pawn) return gameState;

    const updatedPawn = this.calculateNeedsUpdate(pawn, gameState.turn);

    return {
      ...gameState,
      pawns: gameState.pawns.map((p) => (p.id === pawnId ? updatedPawn : p))
    };
  }

  calculateNeedDecay(pawnId: string, gameState: GameState): { hunger: number; rest: number } {
    const pawn = gameState.pawns.find((p) => p.id === pawnId);
    if (!pawn) return { hunger: 0, rest: 0 };

    return {
      hunger: this.getHungerIncreasePerTurn(pawn),
      rest: this.getRestIncreasePerTurn(pawn)
    };
  }

  getPawnNeedStatus(
    pawnId: string,
    gameState: GameState
  ): { critical: string[]; warning: string[]; normal: string[] } {
    const pawn = gameState.pawns.find((p) => p.id === pawnId);
    if (!pawn) return { critical: [], warning: [], normal: [] };

    const critical = [];
    const warning = [];
    const normal = [];

    // Categorize needs by severity
    if (pawn.needs.hunger > 90) critical.push('hunger');
    else if (pawn.needs.hunger > 70) warning.push('hunger');
    else normal.push('hunger');

    // Use fatigue as "rest" need (single rest system)
    if (pawn.needs.fatigue > 95) critical.push('rest');
    else if (pawn.needs.fatigue > 80) warning.push('rest');
    else normal.push('rest');

    return { critical, warning, normal };
  }

  // ===== STATE MANAGEMENT =====

  // ADR-002 amendment (hot per-tick, behind the worker): mutate the live pawn IN PLACE instead of
  // rebuilding the whole pawns array (`{...p}` spread + a fresh n-element array) once per pawn per
  // tick. That per-pawn full-array `.map` was O(n²) allocation/GC — a top steady-state line in the
  // profile (`updatePawnState/<.pawns<` + `CopyDataPropertiesUnfiltered`). State is a HOT snapshot
  // field, so the change still ships to the renderer every flush (ADR-021 W2b).
  updatePawnState(pawnId: string, gameState: GameState): GameState {
    const pawn = pawnById(gameState.pawns, pawnId);
    if (!pawn) return gameState;
    pawn.state = this.calculateStateUpdate(pawn, gameState);
    return gameState;
  }

  // ===== ACTIVITY MANAGEMENT =====

  getPawnActivities(pawnId: string, gameState: GameState): string[] {
    const pawn = gameState.pawns.find((p) => p.id === pawnId);
    if (!pawn) return [];

    const activities = [];

    // Current activities based on state
    if (pawn.state.isWorking) {
      const workAssignment = gameState.workAssignments?.[pawnId];
      if (workAssignment?.currentWork) {
        // FIXED: Get proper work category name instead of just the ID
        const workCategory = WORK_CATEGORIES.find((w) => w.id === workAssignment.currentWork);
        const workName = workCategory?.name || workAssignment.currentWork;
        activities.push(`Working: ${workName}`);
      } else {
        activities.push('Working (unassigned)');
      }
    }

    if (pawn.state.isSleeping) activities.push('Sleeping');
    if (pawn.state.isEating) activities.push('Eating');

    // Idle state
    if (activities.length === 0) {
      // Check if they have work assignment but aren't marked as working
      const workAssignment = gameState.workAssignments?.[pawnId];
      if (workAssignment?.currentWork) {
        const workCategory = WORK_CATEGORIES.find((w) => w.id === workAssignment.currentWork);
        const workName = workCategory?.name || workAssignment.currentWork;
        activities.push(`Idle (assigned to ${workName})`);
      } else {
        activities.push('Idle (no work assigned)');
      }
    }

    // Add need-based activities
    const needStatus = this.getPawnNeedStatus(pawnId, gameState);
    if (needStatus.critical.length > 0) {
      activities.push(`Critical needs: ${needStatus.critical.join(', ')}`);
    }

    return activities;
  }

  // ===== STAT CALCULATIONS (DELEGATED) =====

  categorizeStats(
    stats: Record<string, { value: number; sources: string[] }>
  ): Record<string, string[]> {
    // DELEGATE to existing Pawns.ts function
    return categorizeStats(stats);
  }

  getStatDescription(statName: string, statData: { value: number; sources: string[] }): string {
    // DELEGATE to existing Pawns.ts function
    return getStatDescription(statName, statData);
  }

  // ===== TURN PROCESSING =====

  processPawnTurn(gameState: GameState): GameState {
    let newState = { ...gameState };

    // Process each pawn's needs and state.
    // NOTE: Do NOT call processNeedsAutomatically here — PawnStateMachine already
    // handles HUNGRY→EATING and TIRED→SLEEPING via its state transitions each tick.
    // Calling it here caused double food consumption (and direct array mutation),
    // draining the stockpile extremely fast.
    // NOTE: hunger/fatigue rise and health regen are NOT accrued here anymore — they
    // advance smoothly every tick via processNeedsTick(). This turn pass only runs the
    // threshold reactions (mood) and morale off the already-accrued need values.
    gameState.pawns.forEach((pawn) => {
      if (pawn.isAlive === false) return; // skip dead pawns
      if (pawn.drafted) return; // skip drafted pawns — player-controlled
      newState = this.updatePawnState(pawn.id, newState);
    });

    return newState;
  }

  shouldPawnSleep(pawn: Pawn): boolean {
    const fatigue = pawn.needs.fatigue;
    const hunger = pawn.needs.hunger;

    // Don't sleep if already sleeping
    if (pawn.state.isSleeping) {
      // Mirror state-machine wake thresholds: fed → sleep to 0; hungry → wake at 30
      const wakeThreshold = hunger >= 70 ? 30 : 0;
      const shouldContinueSleeping = fatigue > wakeThreshold && hunger < 87;
      console.log(
        `[PawnService] ${pawn.name} sleeping: fatigue=${fatigue}, hunger=${hunger}, continue=${shouldContinueSleeping}`
      );
      return shouldContinueSleeping;
    }

    // Start sleeping when state-machine FATIGUE_THRESHOLD (72) is reached,
    // but only if not ravenously hungry (87+).
    if (hunger < 87) {
      return fatigue >= 72;
    } else {
      // Very hungry: don't sleep, eat instead
      return false;
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  /**
   * Per-turn hunger/fatigue increase including every active transient-condition and
   * condition-stage multiplier. This is the single source of truth for the need-drain rate;
   * both the legacy per-turn path and the per-tick accrual (processNeedsTick) scale this value.
   */
  private getNeedIncreasePerTurn(pawn: Pawn): {
    hunger: number;
    fatigue: number;
    thirstRate: number;
  } {
    const transientConditions = getActiveTransientConditions(pawn);

    // Combine hunger/fatigue/thirst rate multipliers from all active transient conditions (multiply
    // together). e.g. 'eating' sets hungerRate=0 (paused), 'sleeping' sets hungerRate=0.33, fatigueRate=0;
    // 'dysentery' sets thirstRate>1 (fluid loss makes the pawn thirstier).
    let hungerRate = transientConditions.reduce((r, e) => r * (e.modifiers.hungerRate ?? 1), 1);
    let fatigueRate = transientConditions.reduce((r, e) => r * (e.modifiers.fatigueRate ?? 1), 1);
    let thirstRate = transientConditions.reduce((r, e) => r * (e.modifiers.thirstRate ?? 1), 1);

    // Also apply persistent condition-stage rate modifiers (e.g. malnutrition increases hunger rate).
    const condMults = conditionNeedMultipliers(pawn.conditions ?? []);
    hungerRate *= condMults.hungerRate;
    fatigueRate *= condMults.fatigueRate;
    thirstRate *= condMults.thirstRate;

    return {
      hunger: this.getHungerIncreasePerTurn(pawn) * hungerRate,
      fatigue: this.getRestIncreasePerTurn(pawn) * fatigueRate,
      thirstRate
    };
  }

  private calculateNeedsUpdate(pawn: Pawn, currentTurn: number): Pawn {
    const updatedPawn = { ...pawn };
    const { hunger: hungerIncrease, fatigue: fatigueIncrease } = this.getNeedIncreasePerTurn(pawn);

    updatedPawn.needs = {
      ...pawn.needs,
      hunger: Math.min(100, pawn.needs.hunger + hungerIncrease),
      fatigue: Math.min(100, pawn.needs.fatigue + fatigueIncrease),
      sleep: pawn.needs.sleep || 0
    };

    return updatedPawn;
  }

  /**
   * Continuous needs accrual for ONE simulation tick (turn = 1 tick). Applies hunger rise,
   * fatigue rise and health regen at perTick() of their per-second magnitude, so a
   * full second (TICKS_PER_SECOND ticks) accrues exactly the authored per-second amount.
   * Threshold reactions, eating/sleeping recovery, mood and morale stay per-turn
   * (processPawnTurn / PawnStateMachine). During eating/sleeping the relevant rate
   * multiplier is already 0, so recovery handled per-turn never double-counts here.
   */
  processNeedsTick(gameState: GameState): GameState {
    const dt = SECONDS_PER_TICK;
    let changed = false;

    // M1 (ENGINE-PERFORMANCE ★ ACTIVE): mutate need fields IN PLACE. The old per-pawn
    // `{...pawn, needs:{...}, state:{...}}` allocated 3 objects × every pawn × every tick — the
    // dominant tick cost the R1 benchmark isolated (immutable spread = 12.5× the mutable cost).
    // Mutation is safe here: processGameTurn shallow-copies the top-level state (turn bump) each
    // tick so ref-based change detection still fires, and under ?simworker the snapshot is cloned
    // at the boundary — nothing retains a pre-tick reference to these objects.
    const pawns = gameState.pawns;
    // SEASONS_WEATHER (PERF-3): precompute the GLOBAL env factors ONCE per tick — scalar reads, no
    // allocation. Per-pawn temperature base is computed live from `seasonBakedTemp(terrainType, season)`
    // — the SAME source the HUD's `tileTemperature` uses — plus this live weather delta, so the
    // need-rate sim and the displayed temperature can never disagree (a stale per-tile cache caused
    // exactly that — see BUGS.md). O(1) per pawn (one biome lookup), not per-tile.
    const weatherFx = weatherEffects(gameState.weather);
    // Open-air temperature delta = weather + the diurnal day/night swing (coldest pre-dawn, warmest
    // mid-afternoon). Both are global scalars precomputed once per tick; shelter flattens them downstream.
    const weatherTemp = weatherFx.tempDelta + diurnalTempDelta(gameState.turn, gameState.season);
    const nightFatigueMul =
      getAmbientLight(gameState.turn) < NIGHT_LIGHT_THRESHOLD ? NIGHT_FATIGUE_MUL : 1;
    const worldMap = gameState.worldMap;
    for (let i = 0; i < pawns.length; i++) {
      const pawn = pawns[i];
      if (pawn.isAlive === false) continue;

      const rate = this.getNeedIncreasePerTurn(pawn);
      // Effective temperature at the pawn = season-baked tile base + live weather delta, shaped by
      // fire warmth + roof shelter (insulation/weather protection) from the per-tick thermal field.
      const pos = pawn.position;
      const tile = pos ? worldMap[pos.y]?.[pos.x] : undefined;
      const thermal = pos ? thermalAt(pos.x, pos.y) : undefined;
      const base = tile
        ? seasonBakedTemp(tile.terrainType, gameState.season)
        : DEFAULT_COMFORT_TEMP;
      const temp = thermal ? effectiveTemperature(base, weatherTemp, thermal) : base + weatherTemp;
      // Comfort band shifted outward by cold/heat resistance (CON stat + worn gear), in degrees — the
      // same onset the hypothermia/heat-stroke meter uses, so warm clothing pushes back the fatigue/
      // hunger weather penalty too.
      const tol = pawnStatService.temperatureTolerance(pawn);
      const cold = tol.coldOnset - temp; // >0 when too cold → tires faster
      const heat = temp - tol.heatOnset; // >0 when too hot → hungers faster
      const fatigueMul =
        weatherFx.fatigueMul * nightFatigueMul * (cold > 0 ? 1 + cold * COLD_FATIGUE_PER_DEG : 1);
      const hungerMul = weatherFx.hungerMul * (heat > 0 ? 1 + heat * HEAT_HUNGER_PER_DEG : 1);

      const needs = pawn.needs;
      const hunger = Math.min(100, needs.hunger + rate.hunger * hungerMul * dt);
      const fatigue = Math.min(100, needs.fatigue + rate.fatigue * fatigueMul * dt);
      // §D water needs: thirst & hygiene accrue each tick like hunger. Eating quenches
      // some thirst (handled where meals are consumed); drinking/washing reset them. A condition's
      // `thirstRate` (dysentery's fluid loss) speeds the climb.
      const thirst = Math.min(
        100,
        (needs.thirst ?? 0) + THIRST_INCREASE_PER_SECOND * rate.thirstRate * dt
      );
      const hygiene = Math.min(100, (needs.hygiene ?? 0) + HYGIENE_INCREASE_PER_SECOND * dt);

      // SEASONS_WEATHER wetness: soak fast on wet (>50%) tiles (roofs keep tiles dry — tileWetness
      // already cuts the rain contribution under cover); a fully-wet tile is instant. Off wet ground
      // the meter dries over 1–5 in-game hours, faster when warm and/or sheltered.
      // SEASONS_WEATHER wetness meter (shared with mobs via accrueWetness): soaks on a wet (>50%) tile —
      // fill rate slowed by the pawn's wetness_resistance — and dries when off wet ground, faster when
      // warm and/or under a roof. The `wet` condition onsets at the full meter (100), same for every entity.
      const wet0 = needs.wetness ?? 0;
      // Ice on the tile reads wetness DOWN (frozen ground isn't liquid water) so a pawn doesn't soak
      // standing on a frozen puddle / iced-over tile.
      let tileWet = tile
        ? tileWetness(tile.moisture ?? 0, gameState.weather, thermal, tile.ice ?? 0)
        : 0;
      // A constructed floor keeps the pawn off the wet ground (dry boards/flagstones): cut the tile's
      // effective wetness by the floor's `dryness`. Pair with a roof to stay dry in the rain too.
      if (tile?.floor) tileWet *= 1 - tile.floor.dryness;
      const warmth = Math.max(0, Math.min(1, temp / WET_DRY_WARM_REF));
      const drySpeed = Math.min(
        1,
        warmth * WET_DRY_WARMTH_SPEED + (thermal?.roofed ? WET_DRY_SHELTER_SPEED : 0)
      );
      const wetRes = pawnStatService.evaluateStat('wetness_resistance', pawn);
      const wetness = accrueWetness(wet0, tileWet, dt, wetRes, drySpeed);

      // SOCIAL: fun decays toward 0 (recovered by SOCIALISING — paused while in that state).
      const fun0 = needs.fun ?? 100;
      const fun =
        pawn.currentState === 'Socialising'
          ? fun0
          : Math.max(0, fun0 - FUN_DECREASE_PER_SECOND * dt);

      const prevHealth = pawn.state.health ?? 100;
      const health =
        prevHealth < 100
          ? Math.min(100, prevHealth + this.getHealthRegenPerTurn(needs) * dt)
          : prevHealth;

      if (
        hunger === needs.hunger &&
        fatigue === needs.fatigue &&
        thirst === (needs.thirst ?? 0) &&
        hygiene === (needs.hygiene ?? 0) &&
        wetness === wet0 &&
        fun === fun0 &&
        health === prevHealth
      ) {
        continue;
      }

      needs.hunger = hunger;
      needs.fatigue = fatigue;
      needs.thirst = thirst;
      needs.hygiene = hygiene;
      needs.wetness = wetness;
      needs.fun = fun;
      pawn.state.health = health;
      changed = true;
    }

    if (!changed) return gameState;
    // Bump the array + top-level refs (entities already mutated) so ref-based "changed?" checks
    // still fire — one array copy instead of 3 allocations per pawn.
    return { ...gameState, pawns: pawns.slice() };
  }

  /**
   * §D auto-drink. A pawn whose thirst passes AUTO_DRINK_THIRST drinks:
   *   1. stored `water` from the colony (consumes one unit), else
   *   2. raw water if standing next to a river/lake tile (free, but a small hygiene hit), else
   *   3. nothing (thirst keeps climbing → dehydration condition).
   * Mirrors auto-eat: a lightweight relief pass so thirst isn't a dead-end need.
   */
  processAutoDrink(gameState: GameState): GameState {
    let state = gameState;
    for (const pawn of gameState.pawns) {
      if (pawn.isAlive === false) continue;
      if ((pawn.needs.thirst ?? 0) < AUTO_DRINK_THIRST) continue;

      // 1. stored water
      if ((state.stockpile?.['water'] ?? 0) > 0) {
        state = consumeFromStockpiles(state, { water: 1 });
        state = this.adjustThirst(pawn.id, -WATER_THIRST_RELIEF, 0, state);
        continue;
      }
      // 2. raw water from an adjacent river/lake tile
      if (pawn.position && this.isNextToWater(pawn.position.x, pawn.position.y, state)) {
        state = this.adjustThirst(pawn.id, -WATER_THIRST_RELIEF, 6, state); // +6 hygiene (untreated)
      }
    }
    return state;
  }

  /**
   * §D auto-wash. A pawn whose hygiene passes AUTO_WASH_HYGIENE washes at an adjacent river/lake
   * (lowering hygiene) — a lightweight opportunistic relief that keeps hygiene from being a
   * dead-end mood drain. The deliberate version (walking to a painted wash zone) is the FSM's
   * `tryRouteToWaterNeed`/WASHING flow; a dedicated wash-basin building is still future.
   */
  processAutoWash(gameState: GameState): GameState {
    let state = gameState;
    for (const pawn of gameState.pawns) {
      if (pawn.isAlive === false) continue;
      if ((pawn.needs.hygiene ?? 0) < AUTO_WASH_HYGIENE) continue;
      if (pawn.position && this.isNextToWater(pawn.position.x, pawn.position.y, state)) {
        state = this.adjustHygiene(pawn.id, -WASH_HYGIENE_RELIEF, state);
      }
    }
    return state;
  }

  // M1: mutate the one pawn's needs in place instead of mapping the whole pawns array per call
  // (the old form was O(pawns) allocation per thirsty/dirty pawn → O(n²) under load). The turn-bump
  // wrapper + flush-time clone make this safe (see processNeedsTick).
  private adjustHygiene(pawnId: string, hygieneDelta: number, gameState: GameState): GameState {
    const pawn = gameState.pawns.find((p) => p.id === pawnId);
    if (pawn) {
      pawn.needs.hygiene = Math.min(100, Math.max(0, (pawn.needs.hygiene ?? 0) + hygieneDelta));
      pawn.needs.lastWash = gameState.turn;
    }
    return gameState;
  }

  private adjustThirst(
    pawnId: string,
    thirstDelta: number,
    hygieneDelta: number,
    gameState: GameState
  ): GameState {
    const pawn = gameState.pawns.find((p) => p.id === pawnId);
    if (pawn) {
      pawn.needs.thirst = Math.max(0, (pawn.needs.thirst ?? 0) + thirstDelta);
      pawn.needs.hygiene = Math.min(100, Math.max(0, (pawn.needs.hygiene ?? 0) + hygieneDelta));
      pawn.needs.lastDrink = gameState.turn;
    }
    return gameState;
  }

  private isNextToWater(x: number, y: number, gameState: GameState): boolean {
    const map = gameState.worldMap;
    if (!map) return false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const t = map[y + dy]?.[x + dx];
        if (t && (t.type === 'water' || t.terrainType === 'river' || t.terrainType === 'lake')) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * MOOD-REWORK — per-tick pawn state update: keep the critical-need activity booleans, then EASE the
   * pawn's single mood value toward its computed TARGET (no more per-tick nudges). The gap closes at a
   * fixed step so a ~10-point move takes ~2 in-game hours. Runs every tick for each non-drafted living
   * pawn (hot path — allocation-free; `computeMoodTarget` takes no `out` array here).
   */
  private calculateStateUpdate(pawn: Pawn, gameState: GameState): PawnState {
    const needs = pawn.needs;
    const newState = { ...pawn.state };

    // Critical needs override current activities (booleans only — mood is handled by the target below).
    // NOTE: isEating=true here is safe for sleeping pawns because handleSleeping in PawnStateMachine
    // explicitly sets isEating:false each tick before syncTransientConditions reads it.
    if (needs.hunger > 90) {
      newState.isWorking = false;
      newState.isSleeping = false;
      newState.isEating = true;
    } else if (needs.fatigue > 95) {
      newState.isWorking = false;
      newState.isEating = false;
      newState.isSleeping = true;
    } else if (needs.fatigue > 90) {
      newState.isWorking = false;
    }

    // Ease mood toward its target; snap when within a step so it settles exactly on the target.
    const target = this.computeMoodTarget(pawn, gameState);
    const cur = newState.mood ?? MOOD_BASE;
    const gap = target - cur;
    newState.mood =
      Math.abs(gap) <= MOOD_EASE_STEP ? target : cur + Math.sign(gap) * MOOD_EASE_STEP;

    return newState;
  }

  /**
   * MOOD-REWORK — the pawn's mood TARGET: BASE(50) + Σ signed contributions (weather, surroundings, raw
   * needs, health, permanent trait temperament, active conditions, and event "thought" modifiers — the
   * expiring ones FADED to zero over their life). The live path calls this allocation-free (`out` null);
   * the MOOD panel passes an `out` array to also collect the itemised, labelled contributions. Clamped
   * 0–100. MUST stay the single source of truth — nothing else should nudge `state.mood`.
   */
  computeMoodTarget(
    pawn: Pawn,
    gameState: GameState,
    out: { label: string; value: number }[] | null = null
  ): number {
    let t = MOOD_BASE;

    // Every contribution below resolves a mood-effect id → { label, value } from the registry
    // (mood.jsonc via moodEffect). Allocation-free on the hot path: `moodEffect` returns a shared ref,
    // and the `{ label, value }` push happens only when `out` is provided (the MOOD panel).

    // Weather — a roof softens foul weather's gloom.
    const wEff = moodEffect(weatherEffects(gameState.weather).mood);
    if (wEff && wEff.value != null && wEff.value !== 0) {
      let v = wEff.value;
      if (v < 0 && pawn.position && isRoofedTile(pawn.position.x, pawn.position.y)) v *= 0.4;
      t += v;
      if (out) out.push({ label: wEff.label, value: v });
    }

    // Pleasant surroundings — comfort + beauty of the occupied tile (value computed; effect = label).
    if (pawn.position) {
      const a = amenityAt(gameState.buildings, pawn.position.x, pawn.position.y);
      const am = Math.min(3, (a.comfort + a.beauty) * 1.5);
      if (am > 0) {
        t += am;
        const e = moodEffect('amenity_pleasant');
        if (out && e) out.push({ label: e.label, value: am });
      }
    }

    // Celestial — the rising/setting sun or a full moon (day/night + lunar cycle). Skipped by its
    // `negatedBy` condition (sheltered ⇒ can't see the sky).
    const cEff = moodEffect(celestialMoodEffect(gameState.turn) ?? undefined);
    if (
      cEff &&
      cEff.value != null &&
      cEff.value !== 0 &&
      !(cEff.negatedBy && pawnHasCondition(pawn, cEff.negatedBy))
    ) {
      t += cEff.value;
      if (out) out.push({ label: cEff.label, value: cEff.value });
    }

    // Per-need mood bands (needs.jsonc) — each need applies its FIRST (most-severe) matching band,
    // resolving the named effect. `fun` is inverted (low = bad → atOrBelow); survival needs use atOrAbove.
    const n = pawn.needs;
    for (const need in NEED_MOOD) {
      let v: number;
      switch (need) {
        case 'hunger':
          v = n.hunger;
          break;
        case 'fatigue':
          v = n.fatigue;
          break;
        case 'thirst':
          v = n.thirst ?? 0;
          break;
        case 'hygiene':
          v = n.hygiene ?? 0;
          break;
        case 'fun':
          v = n.fun ?? 100;
          break;
        default:
          continue;
      }
      for (const band of NEED_MOOD[need].moodBands ?? []) {
        const hit =
          (band.atOrAbove != null && v >= band.atOrAbove) ||
          (band.atOrBelow != null && v <= band.atOrBelow);
        if (hit) {
          const e = moodEffect(band.effect);
          if (e && e.value != null) {
            t += e.value;
            if (out) out.push({ label: e.label, value: e.value });
          }
          break; // first (most severe) band per need wins
        }
      }
    }

    // (No separate health→mood band: being HURT flows through injury conditions — cond_bleeding,
    // cond_fractured, cond_pain_shock, cond_hypovolemia — below. The old flat state.health is vestigial.)

    // Traits — permanent temperament effect (traits.jsonc top-level `mood` = effect id).
    for (const tr of pawn.traits ?? []) {
      const e = moodEffect(tr.mood);
      if (e && e.value != null) {
        t += e.value;
        if (out) out.push({ label: e.label, value: e.value });
      }
    }

    // Conditions — the condition's `mood` effect id while active. Both persistent + transient; a
    // transient may be stored as "id:stage", so take the id before the colon.
    for (const c of pawn.conditions ?? []) {
      const e = moodEffect(getConditionDefById(c.id)?.mood);
      if (e && e.value != null) {
        t += e.value;
        if (out) out.push({ label: e.label, value: e.value });
      }
    }
    for (const id of pawn.transientConditions ?? []) {
      const cid = id.includes(':') ? id.split(':')[0] : id;
      const e = moodEffect(getConditionDefById(cid)?.mood);
      if (e && e.value != null) {
        t += e.value;
        if (out) out.push({ label: e.label, value: e.value });
      }
    }

    // Event "thought" modifiers (grief, meals, insults, breakups…) — expiring ones faded to zero.
    for (const m of pawn.moodModifiers ?? []) {
      const v = moodModifierValue(m, gameState.turn);
      if (v) {
        t += v;
        if (out) out.push({ label: m.label, value: v });
      }
    }

    return t < 0 ? 0 : t > 100 ? 100 : t;
  }

  /**
   * MOOD-REWORK — breakdown for the MOOD pop-up: the pawn's CURRENT (eased) mood, the TARGET it is
   * easing toward, and the itemised signed contributions behind that target (weather, needs, health,
   * traits, conditions, event thoughts). Delegates to `computeMoodTarget` so the readout can never
   * drift from what actually moves the bar.
   */
  getMoodBreakdown(
    pawn: Pawn,
    gameState: GameState
  ): { mood: number; target: number; contributions: { label: string; value: number }[] } {
    const contributions: { label: string; value: number }[] = [];
    const target = this.computeMoodTarget(pawn, gameState, contributions);
    return { mood: Math.round(effectiveMood(pawn)), target: Math.round(target), contributions };
  }

  // Per-second magnitude. Applied smoothly each tick (via perTick) by processNeedsTick().
  private getHealthRegenPerTurn(needs: EntityNeeds): number {
    let regen = 0.5; // Base health regen per turn

    // Well-fed and rested pawns regenerate faster
    if (needs.hunger < 30 && needs.fatigue < 30) {
      regen *= 2;
    }

    // Starving or exhausted pawns regenerate slower
    if (needs.hunger > 80 || needs.fatigue > 80) {
      regen *= 0.5;
    }

    return regen;
  }

  // Calibrated to 1 day = 300 in-game seconds: 0→72 in ~225 s ≈ 0.75 days (matches Rimworld ~18h wake cycle).
  // Per-second magnitude. Applied smoothly each tick (via perTick) by processNeedsTick().
  private getRestIncreasePerTurn(pawn: Pawn): number {
    // Per-pawn base from the `fatigue_rate` stat (CON-driven — fitter pawns tire slower), mirroring
    // how hunger keys off `hunger_rate`. 0.32 is the reference rate at a 1.0× stat. Everything below
    // (work/combat/traits) plus the condition fatigueRate (getNeedIncreasePerTurn) and weather/night/
    // cold (processNeedsTick) multiply this stat-based base.
    let baseRest = 0.32 * pawnStatService.evaluateStat('fatigue_rate', pawn);

    if (pawn.state.isWorking) {
      baseRest *= 1.5;
    }

    // Combat increases rest need significantly
    if ((pawn.state as any).inCombat) {
      baseRest *= 2.5;
    }

    pawn.traits.forEach((trait) => {
      if ((trait.effects as any).fatigueRate) {
        baseRest *= (trait.effects as any).fatigueRate;
      }
      switch (trait.name) {
        case 'Tireless':
          baseRest *= 0.7;
          break;
        case 'Energetic':
          baseRest *= 0.8;
          break;
        case 'Lazy':
          baseRest *= 1.3;
          break;
        case 'Frail':
          baseRest *= 1.4;
          break;
      }
    });

    return Math.max(0.1, baseRest);
  }

  // Calibrated to 1 day = 300 in-game seconds: 0→70 in ~130 s ≈ 0.43 days (matches Rimworld ~10.5h hunger trigger).
  // Per-second magnitude. Applied smoothly each tick (via perTick) by processNeedsTick().
  private getHungerIncreasePerTurn(pawn: Pawn): number {
    // Body size drives appetite via the data-driven `hunger_rate` stat (stats.jsonc):
    // a 70 kg pawn = 1.0×, heavier bodies hunger faster, lighter slower.
    let baseHunger = 0.54 * pawnStatService.evaluateStat('hunger_rate', pawn);

    if (pawn.state.isWorking) {
      baseHunger *= 1.4;
    }

    pawn.traits.forEach((trait) => {
      switch (trait.name) {
        case 'Efficient Metabolism':
          baseHunger *= 0.7;
          break;
        case 'Large Appetite':
          baseHunger *= 1.4;
          break;
        case 'Hardy':
          baseHunger *= 0.9;
          break;
      }
    });

    return Math.max(0.1, baseHunger);
  }

  // ===== PAWN NEEDS COORDINATION (EXTRACTED FROM GAMEENGINE) =====

  /**
   * Clear temporary eating/sleeping states from previous turn
   * Extracted from GameEngine.clearTemporaryPawnStates()
   */
  clearTemporaryPawnStates(gameState: GameState): GameState {
    try {
      // M2: mutate state flags in place (leaf transform). The old form mapped the whole pawns
      // array + spread a new pawn/state object per affected pawn every tick.
      let changed = false;
      for (const pawn of gameState.pawns) {
        let shouldClearStates = false;

        // Clear eating state after one turn (eating is always one turn)
        if (pawn.state.isEating) {
          shouldClearStates = true;
        }

        // Only clear sleeping state if pawn should wake up
        if (pawn.state.isSleeping && !this.shouldPawnSleep(pawn)) {
          shouldClearStates = true;
        }

        if (shouldClearStates) {
          pawn.state.isEating = false;
          pawn.state.isSleeping = false; // shouldClearStates ⇒ wake / clear
          changed = true;
        }
      }

      return changed ? { ...gameState, pawns: gameState.pawns.slice() } : gameState;
    } catch (error) {
      console.error('[PawnService] Error in clearTemporaryPawnStates:', error);
      return gameState; // Return original state on error
    }
  }

  // ===== PHASE 3: MAP MOVEMENT =====

  assignPath(pawnId: string, path: { x: number; y: number }[], gameState: GameState): GameState {
    return {
      ...gameState,
      pawns: gameState.pawns.map((p) =>
        p.id === pawnId
          ? {
              ...p,
              path,
              pathIndex: 0,
              isMoving: path.length > 0,
              hasReachedDestination: false
            }
          : p
      )
    };
  }

  teleportPawn(pawnId: string, pos: { x: number; y: number }, gameState: GameState): GameState {
    return {
      ...gameState,
      pawns: gameState.pawns.map((p) =>
        p.id === pawnId
          ? {
              ...p,
              position: pos,
              path: [],
              pathIndex: 0,
              isMoving: false,
              hasReachedDestination: true
            }
          : p
      )
    };
  }

  /**
   * Stat-derived walking speed in tiles/second on open (movementCost 1) terrain.
   * Multiplicative model where every factor is ×1.0 for an all-average pawn, so
   * the baseline lands on the RimWorld-ish 4 tiles/s. Factors:
   *   • Dexterity — nimbleness (DEX 10 = ×1.0)
   *   • Body load — own weight carried by strength (weight ≈ STR×6kg = ×1.0)
   *   • Legs — each leg ≈ half of locomotion; missing/injured legs cripple speed
   *   • Needs — hunger/fatigue above 50% progressively slow the pawn
   *   • Conditions — transient & persistent condition moveSpeed multipliers
   */
  getMoveSpeed(entity: Pawn | Mob): { tilesPerSecond: number; sources: string[] } {
    const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
    const sources: string[] = [];

    const base = 4.0; // tiles/s on open terrain at all-average stats

    // Dexterity: average (10) → ×1.0; capped so extremes stay sane.
    const dex = entity.stats?.dexterity ?? 10;
    const dexFactor = clamp(0.5 + dex / 20, 0.4, 1.8);
    sources.push(`DEX ${dex} ×${dexFactor.toFixed(2)}`);

    // Body load: own bodyweight carried by strength-derived capacity.
    const str = entity.stats?.strength ?? 10;
    const weight = entity.physicalTraits?.weight ?? 60;
    const capacity = Math.max(1, str * 6); // STR 10 ≈ 60 kg comfortable
    const weightFactor = clamp(1.15 - 0.15 * (weight / capacity), 0.65, 1.1);
    sources.push(`${weight}kg/STR${str} ×${weightFactor.toFixed(2)}`);

    // Legs: average leg health fraction; missing legs count as 0.
    let legFactor = 1;
    const legs = (entity.limbs ?? []).filter((l) => l.id === 'left_leg' || l.id === 'right_leg');
    if (legs.length > 0) {
      const locomotion =
        legs.reduce((sum, l) => sum + (l.isMissing ? 0 : l.health / 100), 0) / legs.length;
      legFactor = clamp(locomotion, 0.1, 1);
      if (legFactor < 0.999) sources.push(`legs ×${legFactor.toFixed(2)}`);
    }

    // Needs: hunger & fatigue above the halfway mark drag speed down.
    const hunger = entity.needs?.hunger ?? 0;
    const fatigue = entity.needs?.fatigue ?? 0;
    const hungerPenalty = Math.max(0, (hunger - 50) / 50) * 0.25;
    const fatiguePenalty = Math.max(0, (fatigue - 50) / 50) * 0.25;
    const needsFactor = clamp(1 - hungerPenalty - fatiguePenalty, 0.5, 1);
    if (needsFactor < 0.999) sources.push(`needs ×${needsFactor.toFixed(2)}`);

    // Transient + persistent conditions that modify movement.
    let conditionFactor = getActiveTransientConditions(entity).reduce(
      (r, e) => r * (e.modifiers.moveSpeed ?? 1),
      1
    );
    for (const c of entity.conditions ?? []) {
      const stage = getConditionCurrentStage(c);
      if (stage?.modifiers.moveSpeed != null) conditionFactor *= stage.modifiers.moveSpeed;
    }
    if (Math.abs(conditionFactor - 1) > 0.001)
      sources.push(`conditions ×${conditionFactor.toFixed(2)}`);

    // Encumbrance: PACK cargo drags the pawn — empty ≈ ×1.0, at carry capacity ≈ ×0.6. This is what
    // makes overloading cost something (PRODUCTION-CHAIN-II §L): a wheelbarrow/handcart RAISES the
    // carry budget (inventoryBonus), so a pawn hauls far more, but stuffing it toward the new ceiling
    // slows the push proportionally. General — a sack-laden pawn without a cart slows too. Worn gear is
    // NOT counted here (the body-weight `weightFactor` already covers armour); only the pack does. Hot
    // path: skipped entirely for the common unladen pawn, and computed inline (no getCurrentCarryLoad).
    let loadFactor = 1;
    const inv = (entity as Pawn).inventory;
    const itemEntries = inv?.items ? Object.entries(inv.items) : [];
    const instances = inv?.instances ?? [];
    if (itemEntries.length > 0 || instances.length > 0) {
      const budget = itemService.getCarryBudget(entity as Pawn, {} as GameState);
      let lw = 0;
      let lv = 0;
      for (const [id, qty] of itemEntries) {
        if (qty <= 0) continue;
        const d = itemService.getItemById(id);
        lw += (d?.weightKg ?? 0.1) * qty;
        lv += (d?.volumeL ?? 0.2) * qty;
      }
      for (const it of instances) {
        const d = itemService.getItemById(it.itemId);
        lw += d?.weightKg ?? 0.5;
        lv += d?.volumeL ?? 0.5;
      }
      const fw = budget.maxWeightKg > 0 ? lw / budget.maxWeightKg : 0;
      const fv = budget.maxVolumeL > 0 ? lv / budget.maxVolumeL : 0;
      const loadFrac = clamp(Math.max(fw, fv), 0, 1);
      loadFactor = clamp(1 - loadFrac * 0.4, 0.6, 1);
      if (loadFactor < 0.999) sources.push(`load ×${loadFactor.toFixed(2)}`);
    }

    const tilesPerSecond = Math.max(
      0.05,
      base * dexFactor * weightFactor * legFactor * needsFactor * conditionFactor * loadFactor
    );
    return { tilesPerSecond, sources };
  }

  getTransientConditions(entity: Pawn | Mob): TransientConditionDef[] {
    return getActiveTransientConditions(entity).filter((e) => !e.hidden);
  }

  /**
   * Advance pawn movement by ONE simulation tick (called every tick at 60 Hz,
   * not once per turn). RimWorld-style budget drain: each tick a pawn spends
   * `speed` cost-units, and entering a cell costs `movementCost × TICKS_PER_SECOND`
   * units (diagonals ×√2). `nextCellCostLeft` carries the remaining cost to the
   * next cell across ticks, so a tile with movementCost 2.5 genuinely takes
   * 2.5× as long to cross as a normal (1.0) tile.
   */
  processMovement(gameState: GameState): GameState {
    let state = gameState;

    // Hard tile occupancy: a pawn may not step onto a tile already held by another body (pawn or
    // non-corpse mob) — no phasing, no stacking. The actual hold / blocked-ticks reroute / one-body-
    // per-tile claim logic is shared with the mob pass via MovementSystem.stepBody (MOVE-1), so
    // pawns and mobs can't diverge. `occupied` is built once from start-of-pass positions.
    const occupied = occupancyService.blockedTiles(state);
    // Each moving body's intended next tile (pawns + mobs) — lets stepBody break head-on swaps at once.
    const targetByTile = occupancyService.movingTargets(state);
    // Pre-seed claims with pawns already mid-crossing — they own their target tile this tick
    // (pawns store position as {x,y}, so this is inlined rather than via seedMidCrossClaims).
    const claimed = new Set<string>();
    for (const p of state.pawns) {
      if (p.isAlive === false || !p.position || !p.path?.length || p.nextCellCostLeft == null)
        continue;
      const t = p.path[p.pathIndex ?? 0];
      if (t) claimed.add(`${t.x},${t.y}`);
    }

    // ADR-002 amendment: apply each mover's result IN PLACE on the live pawn the loop already holds
    // (Object.assign), not via a fresh `state.pawns.map` per mover (O(n²) array churn). Movement
    // decisions read the start-of-pass `occupied` set + live `claimed`, never the live pawn objects,
    // so mutating positions as we go doesn't perturb later movers (the snapshot semantics hold).
    const patch = (p: Pawn, fields: Partial<Pawn>) => Object.assign(p, fields);

    for (const pawn of state.pawns) {
      if (pawn.isAlive === false) continue;
      // Repair inconsistent state saved from earlier bugs: path exists but isMoving=false.
      if (!pawn.isMoving && pawn.path && pawn.path.length > 0) {
        patch(pawn, { path: [], pathIndex: 0, nextCellCostLeft: undefined });
        continue;
      }
      if (!pawn.isMoving || !pawn.path || pawn.path.length === 0 || !pawn.position) continue;

      // Cost-units spendable this tick: spending `tilesPerSecond` units/tick yields that many
      // tiles per second on open terrain (see getMoveSpeed).
      const speed = Math.max(0.01, this.getMoveSpeed(pawn).tilesPerSecond);
      const res = stepBody(
        {
          id: pawn.id,
          x: pawn.position.x,
          y: pawn.position.y,
          path: pawn.path,
          pathIndex: pawn.pathIndex,
          nextCellCostLeft: pawn.nextCellCostLeft,
          blockedTicks: pawn.blockedTicks
        },
        occupied,
        claimed,
        state.worldMap,
        speed,
        targetByTile
      );

      if (res.status === 'held' || res.status === 'idle') {
        // Held behind another body — keep path + isMoving, only the blocked counter advances.
        patch(pawn, { blockedTicks: res.body.blockedTicks });
      } else if (res.status === 'dropped') {
        // Blocked too long — drop the path so the FSM re-routes; did NOT arrive.
        patch(pawn, {
          path: [],
          pathIndex: 0,
          nextCellCostLeft: undefined,
          isMoving: false,
          hasReachedDestination: false,
          blockedTicks: 0
        });
      } else {
        // Moved (possibly arriving this tick when res.done).
        const b = res.body;
        patch(pawn, {
          position: { x: b.x, y: b.y },
          path: b.path ?? [],
          pathIndex: b.pathIndex ?? 0,
          isMoving: !res.done,
          hasReachedDestination: res.done,
          blockedTicks: 0,
          nextCellCostLeft: b.nextCellCostLeft
        });
      }
    }
    return state;
  }
}

// Export singleton instance
export const pawnService = new PawnServiceImpl();
