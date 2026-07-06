/**
 * PawnStateMachine — Phase 5a/5e
 *
 * Turn-based state machine for pawn behaviour.
 * States: Idle → MovingToResource → Working → Idle
 *         Idle → Hungry → Eating → Idle
 *         Idle → Tired  → Sleeping → Idle
 *
 * Phase 5 change: Idle now picks jobs through JobService instead of directly
 * scanning designations. All job completion side-effects live in JobService.
 *
 * Port of Celestia pawn_state_machine.gd + states/*.gd, adapted to
 * turn-based ticks and Fantasia4x GameState immutability.
 */

import type {
  GameState,
  Pawn,
  PlacedBuilding,
  ConditionDef,
  ConditionStage,
  Injury,
  LimbState,
  EntityCondition,
  DroppedItem,
  DeadPawnRecord
} from '../core/types';
import {
  HEALING_CONFIG,
  CARE_CONFIG,
  isTended,
  healLimbs,
  rollWoundClotting,
  CLOT_ROLL_INTERVAL,
  BASE_CLOT_CHANCE
} from '../core/Wounds';
import { lethalAnatomyCause } from '../core/BodyParts';
import conditionsData from '../database/conditions.jsonc';
import buildingsData from '../database/buildings.jsonc';
// Per-bed wound-recovery: a sleeping pawn knits faster on a better bed. We reuse each bed's
// `treatmentBonus` (the same quality gradient the caretaker dressing uses: sleeping_spot 0.1 →
// feather_bed 0.7) as a heal multiplier, so a colonist heals fastest in the softest bed.
const BED_TREATMENT_BONUS = new Map<string, number>(
  (buildingsData as unknown as Array<{ id: string; effects?: { treatmentBonus?: number } }>)
    .filter((b) => (b.effects?.treatmentBonus ?? 0) > 0)
    .map((b) => [b.id, b.effects!.treatmentBonus!])
);
import { itemService } from '../services/ItemService';
import { pawnStatService } from '../services/PawnStatService';
import { simLog } from '../core/logSink';
import { gameLogger } from '../dev/gameLogger';
import { perTick } from '../core/time';
import {
  driveNeedConditions,
  decayIntoxication,
  driveTemperatureConditions,
  driveEncumbrance,
  driveWindchill,
  getConditionFloater,
  applyShock,
  snapshotConditionStages,
  snapshotVitalStages,
  emitPersistentConditionFloaters,
  detectVitalEscalations,
  conditionsSig,
  syncFractureConditions,
  COLLAPSE_CONSCIOUSNESS,
  RECOVER_CONSCIOUSNESS,
  TIRED_FATIGUE_THRESHOLD
} from '../core/needs';
import {
  weatherEffects,
  diurnalTempDelta,
  coldExposure,
  heatExposure,
  thermalAt,
  isRoofedTile,
  effectiveTemperature,
  effectiveWindAt,
  seasonBakedTemp,
  getAmbientLight,
  TURNS_PER_DAY
} from '../services/EnvironmentService';
import { calcBloodRegenRate } from '../entities/Pawns';
import { rng } from '../core/rng';
import { pawnById } from '../core/pawnIndex';

// The pawn AI was decomposed out of this file (hotspot 2026-06-13): the 15 state handlers live in
// `pawn/handlers/{work,needs,combat}.ts`, the shared orchestration helpers + tuning constants in
// `pawn/pawnHelpers.ts`, the stateless queries in `pawn/pawnQueries.ts`, and the state enum in
// `pawn/pawnStates.ts`. What remains here is the health/lifecycle block + the per-pawn dispatcher.
import { PAWN_STATE, type PawnStateName } from './pawn/pawnStates';
import { findCombatThreat, amenityAt, FILTHY_THRESHOLD, WET_THRESHOLD } from './pawn/pawnHelpers';
import {
  handleIdle,
  handleMovingToResource,
  handleWorking,
  handleHauling,
  handleMovingToDeposit
} from './pawn/handlers/work';
import {
  handleHungry,
  handleTired,
  handleMovingToNeed,
  handleEating,
  handleSleeping,
  handleDrinking,
  handleWashing
} from './pawn/handlers/needs';
import { handleFighting, handleFleeing, handleHunting } from './pawn/handlers/combat';
// Re-exported for external consumers that imported them from this module historically.
export { PAWN_STATE, type PawnStateName };
export { resetUnreachableJobs } from './pawn/pawnHelpers';

/** RimWorld-style staggered AI (ENGINE-PERFORMANCE): a pawn NOT already in combat re-scans for
 *  threats once every N ticks (offset per pawn so the scans spread across ticks), instead of the
 *  whole colony scanning every tick (findCombatThreat was ~180 calls/tick — the combat-active
 *  spike). 6 ticks ≈ 0.1s max reaction delay, imperceptible; pawns already FIGHTING/FLEEING still
 *  scan every tick (live targeting + exit-when-clear is the combat handler's job). */
const COMBAT_SCAN_INTERVAL = 6;

/** SEASONS_WEATHER: a sheltered (roofed) pawn recovers from hypothermia/heat stroke this much faster. */
const SHELTER_RECOVERY_MUL = 2.5;
/** SEASONS_WEATHER: extra wind cut a ROOF gives beyond its (rain-oriented) weatherProtection — a roof
 *  over your head breaks the wind well regardless of how watertight it is, so a sheltered pawn drops
 *  windchill fast (and feels far less windchill amplification on the cold). */
const SHELTER_WIND_MUL = 0.25;

// SEASONS_WEATHER — cold/heat exposure is a TRACKED per-pawn meter (needs.coldExposure/heatExposure),
// not an instantaneous read: it lags toward the environmental exposure (degrees past comfort, after
// resistance + wetness) and drains back down when comfortable/sheltered — like the wetness meter. The
// tracked value (capped at the live environmental target so mild cold can't run it away) is what
// drives the hypothermia / heat-stroke conditions, and what the HEALTH panel shows as a %.
const EXPOSURE_GAIN_PER_SEC = 4; // how fast the meter rises toward the environmental target
const EXPOSURE_DRAIN_PER_SEC = 5; // how fast it falls when below target (× SHELTER_RECOVERY_MUL if roofed)

/** Move a tracked exposure meter one tick toward `target`, capped at it; drains faster when sheltered. */
function approachExposure(current: number, target: number, recoveryMul: number): number {
  if (target > current) return Math.min(target, current + perTick(EXPOSURE_GAIN_PER_SEC));
  if (target < current)
    return Math.max(target, current - perTick(EXPOSURE_DRAIN_PER_SEC) * recoveryMul);
  return current;
}

// SEASONS_WEATHER — being WET (needs.wetness) shifts temperature resistance: cold bites far harder,
// heat far less. Scaled by how soaked the pawn is (wetness/100).
const WET_COLD_EXTRA = 0.8; // at 100% wet, cold exposure ×1.8 ("greatly lower cold resistance")
const WET_HEAT_REDUCT = 0.6; // at 100% wet, heat exposure ×0.4 ("greatly raise fire resistance")
const WIND_COLD_EXTRA = 0.6; // in a full gale (effWind 1), cold exposure ×1.6 — windchill bites harder
// Fully soaked while genuinely cold → a per-second chance to catch a chill (accelerates hypothermia) —
// the rain consequence. Gated on real cold exposure (cold > 0), never on a flat temp, so it can't seed
// hypothermia while the cold-exposure meter is 0 (see the wet-chill block in tickConditions).
const WET_SOAKED = 95;
const WET_CHILL_CHANCE_PER_SEC = 0.04;
const WET_CHILL_SEVERITY = 0.04;

// COLLAPSE_CONSCIOUSNESS / RECOVER_CONSCIOUSNESS are the shared collapse band from core/needs — the SAME
// thresholds Combat and the mob FSM (entityAI) use, so pawns and creatures down/recover identically.

/** Wound healing is gated by what the pawn is doing (player decision): a pawn UP and active barely
 *  knits — only proper REST (the SLEEPING state, which the wound-recovery drive routes to) heals at
 *  full rate. So a wounded pawn that keeps wandering/working bleeds on instead of self-curing in a
 *  few turns. ACTIVE = anything but SLEEPING. */
const ACTIVE_HEAL_MUL = 0.1;
/** A roofed/sheltered rest closes wounds faster than lying in the open (stacks onto the sleeping mult). */
const SHELTER_HEAL_MUL = 1.6;

// ===== CONDITION CONSTANTS (SURVIVAL-HEALTH spec) =====
const CONDITIONS_DB = conditionsData as unknown as ConditionDef[];
// Need-driven condition tuning (malnutrition ← hunger, dehydration ← thirst) now lives on each
// condition's `driver` block in conditions.jsonc — read generically by applyConditionDriver below.
// Blood regen is computed per-pawn via calcBloodRegenRate(pawn.stats) × SECONDS_PER_TICK.
// See blood_regeneration entry in stats.jsonc for the formula.

/** Blood-out ETA (in game-hours) at which the info-only `bleeding` tell hits full severity=1: severity
 *  = 1 − hoursToEmpty/REF, so with the stage cuts in conditions.jsonc it reads minor > ~4h, severe ≈ 4h,
 *  fatal ≈ 1.2h. Purely a readout scale — the actual blood drain/death lives in the blood-loss tick. */
const BLEED_ETA_REF_HOURS = 8;

/** Return the active ConditionStage for a condition at the given severity, or undefined. */
function getConditionStage(conditionId: string, severity: number): ConditionStage | undefined {
  const def = CONDITIONS_DB.find((d) => d.id === conditionId);
  if (!def) return undefined;
  let active: ConditionStage | undefined;
  for (const stage of def.stages) {
    if (severity >= stage.minSeverity) active = stage;
  }
  return active;
}

// ===== HELPERS =====

/**
 * Kill a pawn: finalise the death (corpse + gear drop, DeadPawnRecord, survivor mood, job
 * release) and log it. The dead pawn stays in pawns[] flagged `corpseDropped` until the
 * end-of-turn reaper (`reapDeadPawns`) removes it from the array.
 */
export function killPawn(
  pawn: Pawn,
  cause: DeadPawnRecord['cause'],
  gameState: GameState
): GameState {
  simLog.logActivity({
    turn: gameState.turn,
    type: 'pawn_action',
    actor: pawn.id,
    action: 'died',
    target: cause,
    result: `${pawn.name} has died of ${cause.replace('_', ' ')}.`,
    severity: 'critical'
  });
  return finalizePawnDeath(pawn, cause, gameState);
}

/**
 * Drop a dead pawn's corpse + carried/equipped goods, record the death, apply the survivor
 * mood penalty, release its claimed jobs, and flag it `corpseDropped`. Shared by `killPawn`
 * (need/condition deaths) and `reapDeadPawns` (combat deaths that bypassed `killPawn`). Does
 * NOT log — callers that already logged (combat) skip the activity entry.
 */
function finalizePawnDeath(
  pawn: Pawn,
  cause: DeadPawnRecord['cause'],
  gameState: GameState
): GameState {
  // Colony-wide death alert: auto-pause (autoPauseOnDeath) + pulsing chronicle entry + bugle. Fired
  // from the SHARED finaliser so it covers BOTH need/condition deaths (killPawn) and combat deaths
  // (reapDeadPawns) exactly once — independent of the per-path activity logging above.
  simLog.pawnDeath(
    pawn.id,
    pawn.name,
    String(cause),
    gameState.turn,
    pawn.position?.x ?? -1,
    pawn.position?.y ?? -1
  );
  const deadRecord = {
    name: pawn.name,
    cause,
    turn: gameState.turn,
    stats: {
      strength: pawn.stats.strength ?? 10,
      dexterity: pawn.stats.dexterity ?? 10,
      intelligence: pawn.stats.intelligence ?? 10
    }
  };

  // R10: a slain pawn leaves its carried goods, equipped gear, and a corpse on the death tile so
  // they re-enter the economy (permadeath must not silently delete the colony's best equipment).
  // The dead pawn's inventory/equipment are cleared (now physically on the ground).
  const pos = pawn.position;
  const newDrops: DroppedItem[] = [];
  if (pos) {
    const tag = `${pawn.id}-${gameState.turn}`;
    for (const [resourceId, qty] of Object.entries(pawn.inventory?.items ?? {})) {
      if (qty > 0)
        newDrops.push({
          id: `death-${tag}-${resourceId}`,
          resourceId,
          x: pos.x,
          y: pos.y,
          quantity: qty
        });
    }
    const droppedInstances = [
      ...(pawn.inventory?.instances ?? []),
      ...Object.values(pawn.equipment ?? {}).filter((i): i is NonNullable<typeof i> => !!i)
    ];
    for (const inst of droppedInstances) {
      newDrops.push({
        id: `death-${tag}-${inst.instanceId}`,
        resourceId: inst.itemId,
        x: pos.x,
        y: pos.y,
        quantity: 1,
        instance: inst
      });
    }
    // The carcass itself, with a dynamic per-instance name ("<Name>'s Carcass"). Identity-tracked:
    // the name rides the drop through hauling into the stockpile (carried as a named ItemInstance),
    // so it never collapses into an anonymous counted "Carcass ×N" pile.
    newDrops.push({
      id: `corpse-${tag}`,
      resourceId: 'pawn_carcass',
      x: pos.x,
      y: pos.y,
      quantity: 1,
      name: itemService.makeDynamicName('pawn_carcass', pawn.name)
    });
  }

  // Apply mood penalty to all living pawns
  const pawns = gameState.pawns.map((p) => {
    if (p.id === pawn.id) {
      return {
        ...p,
        isAlive: false,
        corpseDropped: true,
        currentState: 'Dead',
        activeJob: undefined,
        path: [],
        isMoving: false,
        // Gear is on the ground now — clear it off the corpse-pawn so it isn't duplicated.
        equipment: {},
        inventory: p.inventory ? { ...p.inventory, items: {}, instances: [] } : p.inventory
      };
    }
    if (p.isAlive === false) return p;
    return {
      ...p,
      state: { ...p.state, mood: Math.max(0, (p.state?.mood ?? 50) - 5) }
    };
  });

  // Release any pool jobs claimed by the dead pawn so a living pawn can take them.
  // Without this, a job stays claimedBy === deadPawnId forever and is unworkable.
  const jobs = (gameState.jobs ?? []).map((j) =>
    j.claimedBy === pawn.id ? { ...j, claimedBy: null } : j
  );

  return {
    ...gameState,
    pawns,
    jobs,
    droppedItems: [...(gameState.droppedItems ?? []), ...newDrops],
    deadPawns: [...(gameState.deadPawns ?? []), deadRecord]
  };
}

/**
 * End-of-turn death reaper. Two jobs:
 *  1. **Finalise combat deaths.** `Combat.ts` kills a pawn by setting `isAlive=false` directly
 *     (it can't import `killPawn` — that would cycle), so such a pawn reaches here un-finalised
 *     (`corpseDropped` falsy): drop its corpse + gear, record it, dock survivor mood. Combat
 *     already logged the kill, so this path stays silent.
 *  2. **Reap.** Remove every dead pawn from `pawns[]` so it leaves all UI (entity list, work
 *     grid, selection). The death lives on only in `deadPawns` + the dropped corpse/gear.
 * No-op (returns the same reference) when no dead pawns are present — cheap to call every turn.
 */
export function reapDeadPawns(gameState: GameState): GameState {
  if (!gameState.pawns.some((p) => p.isAlive === false)) return gameState;

  let state = gameState;
  for (const p of gameState.pawns) {
    if (p.isAlive === false && !p.corpseDropped) {
      // Combat death that bypassed killPawn — finalise without re-logging.
      state = finalizePawnDeath(p, 'combat', state);
    }
  }

  return {
    ...state,
    pawns: state.pawns.filter((p) => p.isAlive !== false)
  };
}

/**
 * Tick all progressive health conditions for a single pawn:
 * malnutrition progression, blood loss, critical limb checks.
 * Returns updated GameState (may trigger death via killPawn).
 */
function tickConditions(pawn: Pawn, gameState: GameState): GameState {
  // ADR-002 amendment: operate on the LIVE conditions array in place (no per-tick `[...]` clone — it
  // was a top allocator for healthy pawns that never change, §C). conditions is a cold snapshot field
  // (resync, ADR-021 W2b), so in-place mutation is safe. Initialised once per pawn if absent.
  const conditions = (pawn.conditions ??= []);
  // Stage of each flagged persistent condition BEFORE this tick's updates — so we can float a label
  // when one onsets or changes stage (shock/infection/thermia). Allocates nothing when none present.
  const prevStages = snapshotConditionStages(conditions);
  // SEPARATE prev-stage snapshot for the vital alert (malnutrition/dehydration) — dehydration isn't a
  // `floater` condition, so the floater snapshot above misses it; reusing it re-fired the alert every
  // tick (chronicle spam). Captured at the same pre-mutation point.
  const prevVitalStages = snapshotVitalStages(conditions);
  // Content signature BEFORE the in-place mutations below — so we can flip `pawn.conditions` to a new
  // array ref ONLY when something actually changed, which is what the worker's cold-field ref-diff
  // keys on to push the updated pills/health to the UI live (no churn on unchanged ticks). '' = empty.
  const condSigBefore = conditionsSig(conditions);
  const maxBloodVolume = pawn.maxBloodVolume ?? 100;
  let bloodVolume = pawn.bloodVolume ?? maxBloodVolume;
  const limbs = pawn.limbs ?? [];

  // ── Need-driven conditions (malnutrition ← hunger, dehydration ← thirst, …) ──
  // Onset/safe thresholds + accrual/recovery rates are authored on each condition's `driver` block
  // in conditions.jsonc — no hardcoded MALNUTRITION_*/DEHYDRATION_* constants.
  const needVals = pawn.needs as unknown as Record<string, number> | undefined;
  const lethalCause = driveNeedConditions(conditions, needVals);
  decayIntoxication(conditions); // §F8: the staged `intoxicated` condition wears off over time
  if (lethalCause) {
    return killPawn(
      { ...gameState.pawns.find((p) => p.id === pawn.id)!, conditions, bloodVolume },
      // A driven condition's id (malnutrition/dehydration) is also its death cause.
      lethalCause as Parameters<typeof killPawn>[1],
      {
        ...gameState,
        pawns: gameState.pawns.map((p) =>
          p.id === pawn.id ? { ...p, conditions, bloodVolume } : p
        )
      }
    );
  }

  // ── Temperature exposure → hypothermia / heat stroke (SEASONS_WEATHER) ──────
  // Effective temperature at the pawn = season-baked tile base (`seasonBakedTemp`, the SAME source the
  // HUD's `tileTemperature` uses) + live weather/diurnal delta. Computed live per pawn (O(1), a handful
  // of pawns) rather than read from a per-tile cache, so the sim and the UI can never disagree.
  // Cold/heat exposure past the comfort range drives the conditions, reduced by the pawn's
  // cold_resistance / fire_resistance stats — which were previously defined but unused.
  // Effective wind felt at the pawn (after roof + lee shelter); reused below for cold amplification
  // and to drive the staged `windchilled` condition. 0 when the pawn is off-map.
  let windLevel = 0;
  {
    const pos = pawn.position;
    const tile = pos ? gameState.worldMap[pos.y]?.[pos.x] : undefined;
    const needs = pawn.needs;
    const hasExposure = !!needs && ((needs.coldExposure ?? 0) > 0 || (needs.heatExposure ?? 0) > 0);
    const hasTempCondition = conditions.some(
      (c) => c.id === 'hypothermia' || c.id === 'heat_stroke'
    );
    if (tile || hasTempCondition || hasExposure) {
      const thermal = pos ? thermalAt(pos.x, pos.y) : undefined;
      if (pos && thermal) {
        windLevel = effectiveWindAt(pos.x, pos.y, gameState.weather, thermal, gameState.worldMap);
        // Being SHELTERED breaks the wind well beyond a roof's rain-protection: cut the felt wind hard
        // so a roofed pawn sheds windchill fast (and gets far less windchill on the cold) — see comment.
        if (thermal.roofed) windLevel *= SHELTER_WIND_MUL;
      }
      // Open-air delta = weather + the diurnal day/night swing, the same pair the need-rate hot path uses.
      const airDelta =
        weatherEffects(gameState.weather).tempDelta +
        diurnalTempDelta(gameState.turn, gameState.season);
      const base = tile ? seasonBakedTemp(tile.terrainType, gameState.season) : 15;
      const temp = thermal ? effectiveTemperature(base, airDelta, thermal) : base + airDelta;
      // Resistance (CON stat + worn gear) is folded into the comfort band as DEGREES of headroom, so the
      // onset temperature already accounts for it — see PawnStatService.temperatureTolerance. The meter
      // lags toward this target, and the tracked meter (not this raw read) drives the condition; wetness
      // and wind then amplify the bite PAST the onset below.
      const tol = pawnStatService.temperatureTolerance(pawn);
      let coldTarget = coldExposure(temp, tol.coldOnset);
      let heatTarget = heatExposure(temp, tol.heatOnset);
      // Being WET amplifies cold and dampens heat, scaled by how soaked the pawn is.
      const wetness = needs?.wetness ?? 0;
      if (wetness > 0) {
        const f = wetness / 100;
        coldTarget *= 1 + WET_COLD_EXTRA * f;
        heatTarget *= 1 - WET_HEAT_REDUCT * f;
      }
      // Windchill: a stiff wind makes cold bite far harder (it doesn't add heat — wind in the heat is
      // relief, already folded into the summer-windy tempDelta).
      if (windLevel > 0 && coldTarget > 0) coldTarget *= 1 + WIND_COLD_EXTRA * windLevel;
      // A pawn under a roof recovers from temperature conditions faster ("sheltered").
      const recoveryMul = pos && isRoofedTile(pos.x, pos.y) ? SHELTER_RECOVERY_MUL : 1;
      // Advance the TRACKED meters toward the targets (memory: builds up / drains over time), then
      // drive the conditions from the tracked values — not the instantaneous environmental read.
      const cold = approachExposure(needs?.coldExposure ?? 0, coldTarget, recoveryMul);
      const heat = approachExposure(needs?.heatExposure ?? 0, heatTarget, recoveryMul);
      // TEMP-DBG: why is a pawn cold/hot? Dumps the full chain when the meter is elevated so a stuck or
      // runaway reading can be diagnosed (effective temp vs comfort band, target before/after the meter,
      // worn cold-res, wetness, wind). NaN in coldTarget freezes the meter (approachExposure no-ops), so
      // it's printed raw. Gated behind verbose logging → .debug/needs.log.
      if (cold > 50 || heat > 50 || Number.isNaN(coldTarget)) {
        gameLogger.log(
          gameState.turn,
          'NEED-CHECK',
          () =>
            `TEMP-DBG ${pawn.name} pos:(${pawn.position?.x},${pawn.position?.y}) ` +
            `terrain:${tile?.terrainType ?? '?'} cachedTemp:${tile?.temperature} ` +
            `base:${base.toFixed(1)} eff:${temp.toFixed(1)} ` +
            `onset:[${tol.coldOnset.toFixed(1)},${tol.heatOnset.toFixed(1)}] ` +
            `comfort:[${tol.comfortMin},${tol.comfortMax}] resDeg:[${tol.coldDeg.toFixed(1)},${tol.heatDeg.toFixed(1)}] ` +
            `coldTarget:${coldTarget} heatTarget:${heatTarget} cold:${cold.toFixed(1)} heat:${heat.toFixed(1)} ` +
            `wet:${(needs?.wetness ?? 0).toFixed(0)} wind:${windLevel.toFixed(2)} roofed:${!!thermal?.roofed} ` +
            `equip:[${Object.values(pawn.equipment ?? {})
              .map((i) => i?.itemId)
              .filter(Boolean)
              .join(',')}]`
        );
      }
      if (needs) {
        needs.coldExposure = cold;
        needs.heatExposure = heat;
      }
      const lethalTemp = driveTemperatureConditions(conditions, cold, heat, recoveryMul);
      if (lethalTemp) {
        return killPawn(
          { ...gameState.pawns.find((p) => p.id === pawn.id)!, conditions, bloodVolume },
          lethalTemp as Parameters<typeof killPawn>[1],
          {
            ...gameState,
            pawns: gameState.pawns.map((p) =>
              p.id === pawn.id ? { ...p, conditions, bloodVolume } : p
            )
          }
        );
      }
      // Fully soaked while the cold-exposure meter is MAXED (cold ≥ 100) → a chance to catch a chill
      // that accelerates hypothermia — the "rain consequence" at 100% wetness. Gated on a FULL meter
      // (not just `cold > 0`) so this can never apply hypothermia before the cold meter is full — the
      // meter is the single source of truth for the condition (matching the driver's onset = 100).
      // "Wet makes cold worse" is still modelled by WET_COLD_EXTRA amplifying cold exposure above, so
      // a soaked pawn reaches a full meter (and hypothermia) sooner without the condition appearing early.
      if (wetness >= WET_SOAKED && cold >= 100 && rng.chance(perTick(WET_CHILL_CHANCE_PER_SEC))) {
        const idx = conditions.findIndex((c) => c.id === 'hypothermia');
        if (idx === -1) conditions.push({ id: 'hypothermia', severity: WET_CHILL_SEVERITY });
        else
          conditions[idx] = {
            ...conditions[idx],
            severity: Math.min(1, conditions[idx].severity + WET_CHILL_SEVERITY)
          };
      }
    }
  }

  // ── Windchill ← effective wind ───────────────────────────────────────────
  // Stage the `windchilled` condition (slightly→extremely windy) DIRECTLY from the wind felt this
  // tick — instantaneous like encumbrance, not accrued. The lee of a wall/mountain and especially a
  // roof (SHELTER_WIND_MUL, above) cut `windLevel` hard, so a sheltered pawn sheds windchill at once.
  driveWindchill(conditions, windLevel);

  // ── Encumbrance ← carry load ─────────────────────────────────────────────
  // Unified load model: worn armour + pack weight vs the STR-scaled capacity (bags raise it). Drives
  // the staged `encumbered` condition (move/dodge/hit/work/fatigue), set DIRECTLY from the ratio each
  // tick — instantaneous, not exposure. Replaces the old ad-hoc combat-only armour-encumbrance hook.
  {
    const cap = itemService.getCarryCapacityBreakdown(pawn).weight.total;
    const load = itemService.getCurrentCarryLoad(pawn, gameState).weightKg;
    driveEncumbrance(conditions, cap > 0 ? load / cap : 0);
  }

  // ── Clotting ────────────────────────────────────────────────────────────────
  // ~Every 3 in-game hours, each bleeding/untended wound rolls (against blood_clotting) for a chance
  // to advance a clot stage — a lucky natural stop that occasionally saves a pawn before it bleeds out,
  // but sparse/uncertain enough that wound care stays the reliable answer. Mutates limbs in place.
  let limbsDirty = false; // clotting mutates limb objects in place → bump the limbs ref on change
  if (gameState.turn % CLOT_ROLL_INTERVAL === 0 && limbs.length > 0) {
    const clotChance = Math.min(
      0.95,
      Math.max(0, BASE_CLOT_CHANCE * pawnStatService.evaluateStat('blood_clotting', pawn))
    );
    limbsDirty = rollWoundClotting(limbs, clotChance, gameState.turn);
  }

  // ── Blood Loss ────────────────────────────────────────────────────────────
  const totalBleedRate = limbs.reduce((sum, l) => sum + (l.bleedRate ?? 0), 0);

  if (totalBleedRate > 0) {
    bloodVolume = Math.max(0, bloodVolume - perTick(totalBleedRate));
  }

  // (The redundant `blood_loss` condition is gone — low blood now drives `shock` directly, below.)

  // Regen blood when not bleeding — rate driven by blood_regeneration ability (CON-scaled)
  if (totalBleedRate === 0 && bloodVolume < maxBloodVolume) {
    bloodVolume = Math.min(maxBloodVolume, bloodVolume + perTick(calcBloodRegenRate(pawn.stats)));
  }

  // ── Burning (ADR-023) ──────────────────────────────────────────────────────
  // Fire DoT from flame-on-hit / dragonfire (the `burning` transient, applied via onHitEffect →
  // conditionTimers). Eats HP each tick until it decrements away or is quenched; the bite is reduced
  // by fire resistance (so an Ever-Warm / Dragon-scaled pawn barely notices). Death cause = 'burning'.
  if ((pawn.conditionTimers?.burning ?? 0) > 0) {
    const fireRes = Math.min(0.9, Math.max(0, pawnStatService.evaluateStat('fire_resistance', pawn)));
    bloodVolume = Math.max(0, bloodVolume - perTick(BURNING_DPS) * (1 - fireRes));
    if (bloodVolume <= 0) {
      const gs = {
        ...gameState,
        pawns: gameState.pawns.map((p) =>
          p.id === pawn.id ? { ...p, conditions, bloodVolume: 0, limbs } : p
        )
      };
      return killPawn(gs.pawns.find((p) => p.id === pawn.id)!, 'burning', gs);
    }
  }

  // ── Photosynthesis (ADR-023) ───────────────────────────────────────────────
  // A photosynthetic pawn under a bright open sky drinks daylight — hunger quietly drains (the pill
  // itself is pushed by syncTransientConditions; hunger can't be filled by a modifier, so it's here).
  if (pawn.needs && photosynthesisActive(pawn, gameState.turn)) {
    pawn.needs.hunger = Math.max(0, pawn.needs.hunger - perTick(PHOTOSYNTHESIS_HUNGER_FILL_PER_SEC));
  }

  // Check blood loss lethality
  if (bloodVolume <= 0) {
    const updatedGs = {
      ...gameState,
      pawns: gameState.pawns.map((p) =>
        p.id === pawn.id ? { ...p, conditions, bloodVolume: 0, limbs } : p
      )
    };
    return killPawn(updatedGs.pawns.find((p) => p.id === pawn.id)!, 'blood_loss', updatedGs);
  }

  // ── Infection ─────────────────────────────────────────────────────────────
  // Untended open wounds fester; the immune system (CON) and good care push back.
  // Drives the multi-stage `infection` condition, lethal at full severity.
  let infectionPressure = 0;
  for (const limb of limbs) {
    for (const part of limb.parts ?? []) {
      for (const w of part.injuries) {
        const open =
          w.bleeding > 0 ||
          w.severity === 'serious' ||
          w.severity === 'critical' ||
          w.severity === 'destroyed';
        // Incubation grace: a wound only starts to fester once it's been open + untended for
        // `infectionIncubationTicks` (~2.5 days). Fresh combat wounds carry no infection risk, so a
        // pawn can't infect to lethal during or right after a fight — it's the days-later neglect
        // threat. (Wounds from a pre-change save have no `inflictedAt` → their clock starts at load.)
        const age = gameState.turn - (w.inflictedAt ?? gameState.turn);
        if (open && !isTended(w, gameState.turn) && age >= CARE_CONFIG.infectionIncubationTicks) {
          infectionPressure += CARE_CONFIG.infectionRiskPerWound;
        }
      }
    }
  }
  // Cap total pressure so many simultaneous combat wounds can't stack into a near-instant
  // lethal infection — infection is the slow post-fight threat, not a mid-combat killer (NT-3).
  infectionPressure = Math.min(infectionPressure, CARE_CONFIG.infectionRiskMax);
  const immune = Math.max(
    0,
    Math.min(0.95, CARE_CONFIG.immuneResistBase + (pawn.stats.constitution - 10) * 0.02)
  );
  const infIdx = conditions.findIndex((c) => c.id === 'infection');
  const curInf = infIdx >= 0 ? conditions[infIdx].severity : 0;
  // Per-SECOND rates → per-tick via perTick (matches the need drivers). Untended open wounds fester;
  // once every wound is tended or closed the pressure drops to 0 and the infection recovers. Tending
  // a wound (the caretake job) IS the cure — there's no "no way to heal it", the progression was just
  // 60× too fast (raw per-tick) to treat in time.
  const nextInf =
    infectionPressure > 0
      ? Math.min(1, curInf + perTick(infectionPressure * (1 - immune)))
      : Math.max(0, curInf - perTick(CARE_CONFIG.infectionRecovery));
  if (nextInf <= 0) {
    if (infIdx >= 0) conditions.splice(infIdx, 1);
  } else if (infIdx >= 0) {
    conditions[infIdx] = { ...conditions[infIdx], severity: nextInf };
  } else {
    conditions.push({ id: 'infection', severity: nextInf });
  }
  const infectionDef = CONDITIONS_DB.find((d) => d.id === 'infection');
  if (infectionDef && nextInf >= infectionDef.lethalSeverity) {
    const updatedGs = {
      ...gameState,
      pawns: gameState.pawns.map((p) =>
        p.id === pawn.id ? { ...p, conditions, bloodVolume, limbs } : p
      )
    };
    return killPawn(updatedGs.pawns.find((p) => p.id === pawn.id)!, 'infection', updatedGs);
  }

  // ── Lethal anatomy (destroyed vital organ — incl. a crushed-to-0 heart — or head/torso at 0 HP) ──
  // ONE shared rule (core/BodyParts.lethalAnatomyCause), identical to the combat resolver + mob reaper.
  if (lethalAnatomyCause(limbs)) {
    const updatedGs = {
      ...gameState,
      pawns: gameState.pawns.map((p) =>
        p.id === pawn.id ? { ...p, conditions, bloodVolume, limbs } : p
      )
    };
    return killPawn(updatedGs.pawns.find((p) => p.id === pawn.id)!, 'critical_limb', updatedGs);
  }

  // ── Broken-bone conditions ────────────────────────────────────────────────
  // A broken arm/leg bone (boneBroken part) drives a persistent condition that crushes STR/DEX on top
  // of the manipulation/moving capacity hit — synced from the limbs each tick, cleared as bones knit.
  syncFractureConditions(conditions, limbs);

  // ── Shock ──────────────────────────────────────────────────────────────────
  // Severe pain OR heavy blood loss sends the body into shock — shared rule for pawns + mobs
  // (applyShock). This subsumes the old `blood_loss` condition: the worse of pain/blood drives it.
  applyShock(conditions, pawn.pain ?? 0, 1 - bloodVolume / maxBloodVolume);

  // ── Persist updated condition/blood state ──────────────────────────────────
  // ADR-002 amendment (hot per-tick, behind the worker): the common (non-lethal) path mutates the
  // live pawn IN PLACE rather than rebuilding the whole pawns array each pawn each tick — that
  // per-pawn `.map` was a top steady-state line (`tickConditions/<.pawns<`). `pawn` is the live
  // object the caller fetched from gameState.pawns. (The lethal branches above stay immutable: rare,
  // and they hand a patched state to killPawn.) conditions/limbs are cold snapshot fields → resync;
  // bloodVolume is hot → every flush (ADR-021 W2b).
  // Flip to a NEW conditions ref only when the in-place mutations changed something (worker ref-diff
  // → live pill/health update); unchanged ticks keep the ref so nothing re-ships.
  pawn.conditions = conditionsSig(conditions) !== condSigBefore ? conditions.slice() : conditions;
  pawn.bloodVolume = bloodVolume;
  pawn.limbs = limbsDirty ? limbs.slice() : limbs;
  // Float a label for any flagged persistent condition that onset / changed stage this tick.
  emitPersistentConditionFloaters(
    prevStages,
    conditions,
    pawn.position?.x ?? -1,
    pawn.position?.y ?? -1
  );
  // Colony-wide alert (chronicle + bugle) when a colonist's malnutrition/dehydration WORSENS a stage —
  // a starving/dehydrating pawn is an emergency the player should be told about, not just a floater.
  for (const esc of detectVitalEscalations(prevVitalStages, conditions)) {
    simLog.vitalAlert(
      pawn.id,
      pawn.name,
      esc.id as 'malnutrition' | 'dehydration',
      esc.stageLabel,
      gameState.turn,
      pawn.position?.x ?? -1,
      pawn.position?.y ?? -1
    );
  }
  return gameState;
}

export function healWounds(pawn: Pawn, turn = 0, buildings?: PlacedBuilding[]): Pawn {
  const limbs = pawn.limbs;
  const hasWounds = limbs?.some((l) => (l.parts ?? []).some((p) => p.injuries.length > 0));
  if (!limbs || !hasWounds) return pawn;

  const healRate = Math.max(0, pawnStatService.evaluateStat('heal_rate', pawn));
  // Activity gate: only REST heals at full rate — SLEEPING (the wound-recovery drive routes here) or
  // lying COLLAPSED on the ground. An up-and-active pawn barely knits, so wounds persist and bleed on.
  const resting =
    pawn.currentState === PAWN_STATE.SLEEPING || pawn.currentState === PAWN_STATE.COLLAPSED;
  let mult = resting ? 1 : ACTIVE_HEAL_MUL;
  if (resting) {
    mult *= HEALING_CONFIG.sleepingMultiplier;
    if (pawn.position && isRoofedTile(pawn.position.x, pawn.position.y)) mult *= SHELTER_HEAL_MUL;
    // Per-bed recovery: a better bed knits wounds faster (sleeping_spot ×1.1 → feather_bed ×1.7).
    if (buildings && pawn.position) {
      const px = pawn.position.x;
      const py = pawn.position.y;
      for (const b of buildings) {
        if (b.status !== 'complete' || b.x !== px || b.y !== py) continue;
        const bonus = BED_TREATMENT_BONUS.get(b.type);
        if (bonus) mult *= 1 + bonus;
        break;
      }
      // §M room amenity: recovering in a comfortable, beautiful, finely-furnished room (couch/cushions/
      // silk/wool) knits wounds faster — the surrounding furniture, scaled small + capped.
      const a = amenityAt(buildings, px, py);
      const amenityHeal = Math.min(0.5, (a.comfort + a.beauty) * 0.15);
      if (amenityHeal > 0) mult *= 1 + amenityHeal;
    }
  }
  if ((pawn.needs?.hunger ?? 0) <= HEALING_CONFIG.wellFedHunger)
    mult *= HEALING_CONFIG.wellFedMultiplier;
  if ((pawn.state?.mood ?? 50) >= HEALING_CONFIG.goodMood)
    mult *= HEALING_CONFIG.goodMoodMultiplier;
  const baseHeal = HEALING_CONFIG.baseHealPerTick * healRate * mult; // part HP / tick, per wound
  if (baseHeal <= 0) return pawn;

  const newLimbs = healLimbs(limbs, baseHeal, turn, true);
  if (newLimbs === limbs) return pawn;

  let painTotal = 0;
  const newInjuries: Injury[] = [];
  for (const l of newLimbs) {
    for (const p of l.parts ?? []) {
      for (const w of p.injuries) {
        painTotal += w.painContribution;
        newInjuries.push(w);
      }
    }
  }
  return {
    ...pawn,
    limbs: newLimbs,
    pain: Math.max(0, Math.min(100, Math.round(painTotal))),
    injuries: newInjuries
  };
}

// ===== COMBAT STATE (COMBAT-SYSTEM) =====

// ===== HUNTING (work-driven) =====

// ===== PER-PAWN STATE HANDLERS =====

// ===== HAULING HELPERS =====

/**
 * Decrement temporary transient condition durations and remove expired ones.
 */
function tickConditionTimers(pawn: Pawn): Pawn {
  const durations = pawn.conditionTimers;
  if (!durations || Object.keys(durations).length === 0) return pawn;
  const next: Record<string, number> = {};
  for (const [key, val] of Object.entries(durations)) {
    const remaining = val - 1;
    if (remaining > 0) next[key] = remaining;
  }
  const changed =
    Object.keys(next).length !== Object.keys(durations).length ||
    Object.entries(next).some(([k, v]) => v !== durations[k]);
  if (!changed) return pawn;
  return { ...pawn, conditionTimers: next };
}

/**
 * Reap SHATTERED gear — any worn or carried item whose durability has hit 0 is destroyed (removed), so
 * a cond-0 stone maul can't keep sitting in the equipment doll, still usable. Combat already removes a
 * weapon/armour the instant it breaks (Combat.decrEquipDurability), and tool-wear removes a worn-out
 * tool (harvest.ts); this is the catch-all safety net for anything that reached 0 by another path or in
 * an older save. Returns a NEW pawn only when something was reaped — allocation-free otherwise (the
 * common case: no broken gear). Carcasses and a carried colonist (dynamicName / non-durable instances)
 * legitimately sit at durability 0 and are NEVER reaped — only real wearable gear is.
 */
function reapBrokenGear(pawn: Pawn): Pawn | null {
  let equipment = pawn.equipment;
  let equipChanged = false;
  // Only real gear can be equipped, so a slot at durability 0 is genuinely worn out → remove it.
  for (const slot of Object.keys(pawn.equipment ?? {}) as (keyof NonNullable<
    Pawn['equipment']
  >)[]) {
    const inst = pawn.equipment?.[slot];
    if (inst && inst.durability != null && inst.durability <= 0) {
      if (!equipChanged) {
        equipment = { ...pawn.equipment };
        equipChanged = true;
      }
      delete (equipment as Record<string, unknown>)[slot as string];
    }
  }
  // Carried pack instances: reap only broken WEARABLE gear (tool/weapon/armour with a durability pool);
  // never a carcass (dynamicName) or a carried colonist (no maxDurability).
  const insts = pawn.inventory?.instances ?? [];
  const keptInsts = insts.filter((i) => {
    if (i.durability == null || i.durability > 0) return true;
    const def = itemService.getItemById(i.itemId);
    const wearable = !!def?.maxDurability && def.maxDurability > 0 && !def.dynamicName;
    return !wearable; // keep everything except broken wearable gear
  });
  const instChanged = keptInsts.length !== insts.length;
  if (!equipChanged && !instChanged) return null;
  return {
    ...pawn,
    equipment: equipChanged ? equipment : pawn.equipment,
    inventory: instChanged ? { ...pawn.inventory!, instances: keptInsts } : pawn.inventory
  };
}

// ── Racial self-conditions (ADR-023) ─────────────────────────────────────────
// Every supernatural/legendary body trait keeps a legible pill via its `selfCondition`. Most are
// permanent while the trait is present; `photosynthesis`/`light_sensitive` are ENVIRONMENT-GATED
// (need turn-of-day light + an open sky), so they're pushed only while active.
const PHOTOSYNTHESIS_LIGHT = 0.95; // ambient light at/above which sunlit skin feeds
const DAYLIGHT_SENSITIVE = 0.7; // ambient light at/above which the sun-cursed are seared
const PHOTOSYNTHESIS_HUNGER_FILL_PER_SEC = 3.0; // hunger drained per second in bright open sky
const BURNING_DPS = 2.5; // bloodVolume-equivalent HP burned per second while alight

function hasSelfCondition(pawn: Pawn, id: string): boolean {
  return (pawn.racialTraits ?? []).some((t) => t.selfCondition === id);
}
function isUnsheltered(pawn: Pawn): boolean {
  return !(pawn.position && isRoofedTile(pawn.position.x, pawn.position.y));
}
function photosynthesisActive(pawn: Pawn, turn: number): boolean {
  return (
    hasSelfCondition(pawn, 'photosynthesis') &&
    isUnsheltered(pawn) &&
    getAmbientLight(turn) >= PHOTOSYNTHESIS_LIGHT
  );
}
function lightSensitiveActive(pawn: Pawn, turn: number): boolean {
  return (
    hasSelfCondition(pawn, 'light_sensitive') &&
    isUnsheltered(pawn) &&
    getAmbientLight(turn) >= DAYLIGHT_SENSITIVE
  );
}

/**
 * Derive the pawn's transientConditions list from current state flags, needs, and durations.
 * Called after each tick so PawnService.calculateNeedsUpdate always reads fresh values. `turn` is
 * passed so environment-gated racial pills (photosynthesis / light_sensitive) can read the day/night
 * light curve; omit it (tests) to skip those.
 */
export function syncTransientConditions(pawn: Pawn, turn?: number): Pawn {
  const ids: string[] = [];
  const isEating = pawn.state?.isEating || pawn.currentState === PAWN_STATE.EATING;
  const isSleeping = pawn.state?.isSleeping || pawn.currentState === PAWN_STATE.SLEEPING;

  if (isEating) ids.push('eating');
  if (isSleeping) ids.push('sleeping');
  // Fatigue badge when not already sleeping. (Hunger/thirst no longer surface a transient flag —
  // they fold into the malnutrition/dehydration conditions, which now onset at the same need=70
  // threshold and escalate; the HUNGER/THIRST need bars are the live indicator.)
  if (!isSleeping && (pawn.needs?.fatigue ?? 0) >= TIRED_FATIGUE_THRESHOLD) ids.push('tired');
  if ((pawn.needs?.hygiene ?? 0) >= FILTHY_THRESHOLD) ids.push('filthy');

  // Timer-based transient conditions (knockdown, etc.)
  for (const [id, remaining] of Object.entries(pawn.conditionTimers ?? {})) {
    if (remaining > 0) ids.push(id);
  }

  // SEASONS_WEATHER: under a roof → sheltered (faster cold/heat recovery + storm-mood relief).
  if (pawn.position && isRoofedTile(pawn.position.x, pawn.position.y)) ids.push('sheltered');
  // SEASONS_WEATHER: only FULLY soaked → wet (cold bites harder, heat less; chance of a chill when
  // soaked + cold). The wetness meter still amplifies cold below the threshold; the `wet` tell shows only
  // at max — WET_THRESHOLD sourced from the `wet` condition's needOnset (data, shared with the gradient).
  if ((pawn.needs?.wetness ?? 0) >= WET_THRESHOLD) ids.push('wet');

  // ADR-023 racial self-conditions: the permanent pill for a supernatural/legendary body trait
  // (clawed/furred/scaled/…). `photosynthesis`/`light_sensitive` are environment-gated below.
  for (const t of pawn.racialTraits ?? []) {
    const sc = t.selfCondition;
    if (!sc || sc === 'photosynthesis' || sc === 'light_sensitive') continue;
    if (!ids.includes(sc)) ids.push(sc);
  }
  if (turn != null) {
    if (photosynthesisActive(pawn, turn) && !ids.includes('photosynthesis')) ids.push('photosynthesis');
    if (lightSensitiveActive(pawn, turn) && !ids.includes('light_sensitive')) ids.push('light_sensitive');
  }

  // Mood-based transient conditions (discrete ranges replace continuous morale calculation)
  const mood = pawn.state?.mood ?? 50;
  if (mood >= 80) ids.push('mood_ecstatic');
  else if (mood >= 60) ids.push('mood_content');
  else if (mood >= 40) {
    /* neutral — no condition */
  } else if (mood >= 20) ids.push('mood_sad');
  else ids.push('mood_depressed');

  // §M passive magical buffs: any worn item that lists `grantsConditions` pushes those condition
  // ids while equipped (auto-clear on unequip — they're re-derived fresh each tick like every other
  // transient condition). This is the foundation MAGIC-SKILLS' active spells/skill-nodes reuse.
  const equipment = pawn.equipment;
  if (equipment) {
    for (const inst of Object.values(equipment)) {
      if (!inst) continue;
      const granted = itemService.getItemById(inst.itemId)?.grantsConditions;
      if (granted) for (const cid of granted) if (!ids.includes(cid)) ids.push(cid);
    }
  }

  // Bleeding tell (info-only): while any wound is seeping, surface HOW urgent it is — staged off the
  // blood-out ETA, the same figure shown on the Blood pill. Pushed as an `id:stageLabel` combo (like the
  // persistent stages below) so it renders a graded chip without applying any stat modifier.
  const totalBleed = (pawn.limbs ?? []).reduce((s, l) => s + (l.bleedRate ?? 0), 0);
  if (totalBleed > 0 && (pawn.bloodVolume ?? 0) > 0) {
    const hoursToEmpty = (pawn.bloodVolume! / totalBleed) * (24 / TURNS_PER_DAY);
    const severity = Math.max(0, Math.min(1, 1 - hoursToEmpty / BLEED_ETA_REF_HOURS));
    const stage = getConditionStage('bleeding', severity);
    if (stage) ids.push(`bleeding:${stage.label}`);
  }

  // Push persistent-condition stage labels too (e.g. "malnutrition:moderate").
  for (const condition of pawn.conditions ?? []) {
    const stage = getConditionStage(condition.id, condition.severity);
    if (stage) ids.push(`${condition.id}:${stage.label}`);
  }

  const current = pawn.transientConditions ?? [];
  if (ids.length === current.length && ids.every((e, i) => e === current[i])) return pawn;

  // Floating-text cue for a flagged condition the first tick it latches. Only SYNC-derived transient
  // ids fire here (e.g. tired). Skipped: timer-based/combat ids (knockdown, winded, on-hit effects),
  // floated by Combat at their application site; and persistent stage labels (contain ':'), floated by
  // tickConditions via emitPersistentConditionFloaters — either would double-label otherwise.
  // Guarded by the equality early-return above: this loop only runs on a tick where the set changed.
  const timers = pawn.conditionTimers ?? {};
  if (pawn.position) {
    for (const id of ids) {
      if (current.includes(id) || id.includes(':') || (timers[id] ?? 0) > 0) continue;
      const f = getConditionFloater(id);
      if (f)
        simLog.pushCombatText({
          worldX: pawn.position.x,
          worldY: pawn.position.y,
          text: f.name,
          kind: 'condition',
          color: f.color
        });
    }
  }
  return { ...pawn, transientConditions: ids };
}

// ===== PER-PAWN STATE HANDLERS =====

// ── Debug tick logger ─────────────────────────────────────────────────────────
/**
 * Writes a compact [PAWN-TICK] line to the file-backed gameLogger.
 * Suppressed for dead pawns.
 */
function logPawnTick(pawn: Pawn, gs: GameState): void {
  if (pawn.isAlive === false) return;
  // D9.5: skip all the per-pawn string assembly below when file logging is off.
  if (!gameLogger.isEnabled) return;

  const pos = pawn.position ? `(${pawn.position.x},${pawn.position.y})` : '(-,-)';
  const job = pawn.activeJob;
  const targetStr = job
    ? `(${job.targetX},${job.targetY}) [${job.type}${job.jobId ? `#${job.jobId.slice(-4)}` : ''}]`
    : 'none';

  const hunger = (pawn.needs?.hunger ?? 0).toFixed(1);
  const fatigue = (pawn.needs?.fatigue ?? 0).toFixed(1);
  const state = (pawn.currentState ?? 'Idle').padEnd(18);

  const queueLabels = (pawn.jobQueue ?? []).map((id) => {
    const j = (gs.jobs ?? []).find((j) => j.id === id);
    return j
      ? `${j.type}(${j.targetX},${j.targetY})${j.claimedBy && j.claimedBy !== pawn.id ? '!' : ''}`
      : `?${id.slice(-4)}`;
  });
  const queueStr = queueLabels.length ? queueLabels.join(' > ') : 'empty';

  gameLogger.log(
    gs.turn,
    'PAWN-TICK',
    `${pawn.name.padEnd(12)} ${state}` +
      ` H:${hunger.padStart(5)} F:${fatigue.padStart(5)}` +
      ` pos:${pos.padEnd(9)} → target:${targetStr.padEnd(30)}` +
      ` queue:[${queueStr}]`
  );
}

/**
 * State → handler dispatch table (hotspot step 3). Replaces the 15-case `tickPawn` switch so
 * adding a state is a one-line registration and `tickPawn`'s fan-out drops from 16 to ~1. Every
 * handler has the same `(pawn, gameState) => GameState` shape. (Function declarations are hoisted,
 * so referencing the handlers here — above their definitions — is fine.)
 */
type PawnHandler = (pawn: Pawn, gameState: GameState) => GameState;
const STATE_HANDLERS: Record<string, PawnHandler> = {
  [PAWN_STATE.IDLE]: handleIdle,
  [PAWN_STATE.MOVING_TO_RESOURCE]: handleMovingToResource,
  [PAWN_STATE.WORKING]: handleWorking,
  [PAWN_STATE.HUNGRY]: handleHungry,
  [PAWN_STATE.TIRED]: handleTired,
  [PAWN_STATE.MOVING_TO_NEED]: handleMovingToNeed,
  [PAWN_STATE.EATING]: handleEating,
  [PAWN_STATE.SLEEPING]: handleSleeping,
  [PAWN_STATE.HAULING]: handleHauling,
  [PAWN_STATE.MOVING_TO_DEPOSIT]: handleMovingToDeposit,
  [PAWN_STATE.DRINKING]: handleDrinking,
  [PAWN_STATE.WASHING]: handleWashing,
  [PAWN_STATE.FIGHTING]: handleFighting,
  [PAWN_STATE.FLEEING]: handleFleeing,
  [PAWN_STATE.HUNTING]: handleHunting
};

function tickPawn(pawn: Pawn, gameState: GameState): GameState {
  // Throttle file logging to every 30 turns (~0.5 s at 60 TPS) so PAWN-TICK
  // doesn't flood the buffer and bury ENTITY-STATE / MOB-SNAP lines.
  if (gameState.turn % 30 === 0) logPawnTick(pawn, gameState);
  const state = pawn.currentState ?? PAWN_STATE.IDLE;
  const handler = STATE_HANDLERS[state];
  return handler ? handler(pawn, gameState) : gameState;
}

// ===== STATE MACHINE SERVICE =====

class PawnStateMachineImpl {
  /**
   * Run one turn tick for every pawn.
   * Called from GameEngineImpl.processPawns() AFTER processMovement().
   */
  tick(gameState: GameState): GameState {
    // Periodic map snapshot every 60 turns (~1 s at 60 TPS).
    if (gameState.turn % 60 === 0) gameLogger.logMapSnap(gameState);

    let state = gameState;
    for (const pawn of state.pawns) {
      const current = pawnById(state.pawns, pawn.id);
      if (!current) continue;
      // Skip dead pawns entirely.
      if (current.isAlive === false) continue;

      // Drafted pawns are player-controlled, so release any job they still claim (they don't
      // auto-work). R2: they do NOT `continue` here — they still run the full health block below
      // (caretaking, conditions/bleed/infection/death, healing, the collapse lifecycle, status
      // durations). ONLY the behavioural state machine is skipped (see the drafted check after the
      // collapse lifecycle). Otherwise a drafted pawn never bled, healed, or collapsed.
      if (current.drafted) {
        if (current.activeJob || (state.jobs ?? []).some((j) => j.claimedBy === current.id)) {
          const jobs = (state.jobs ?? []).map((j) =>
            j.claimedBy === current.id ? { ...j, claimedBy: null } : j
          );
          state = {
            ...state,
            jobs,
            pawns: state.pawns.map((p) =>
              p.id === current.id ? { ...p, activeJob: undefined } : p
            )
          };
        }
      }

      // Caretaking is now a proper colony JOB (services/jobs/caretake): a pawn with the Caretaking
      // labor walks to a resting wounded patient and dresses the wound (shelter-gated quality). No
      // passive teleport-tend here anymore — an untended wound bleeds on until a medic reaches it.

      // Tick conditions (malnutrition, blood loss, infection, limb checks) — may kill pawn.
      state = tickConditions(current, state);
      // Re-fetch pawn in case tickConditions updated it.
      let afterConditions = pawnById(state.pawns, pawn.id);
      if (!afterConditions || afterConditions.isAlive === false) continue;

      // Reap any gear that has worn down to condition 0 (every ~0.5 s — durability changes slowly, so
      // no need to scan every tick). Allocation-free unless something actually broke.
      if (gameState.turn % 30 === 0) {
        const reaped = reapBrokenGear(afterConditions);
        if (reaped) {
          state = { ...state, pawns: state.pawns.map((p) => (p.id === pawn.id ? reaped : p)) };
          afterConditions = reaped;
        }
      }

      // ── Wound healing + collapse lifecycle (COMBAT-SYSTEM) ────────────────
      // Pain is the sum of active wounds, so a pawn recovers by mending them — but
      // not mid-fight (wounds don't knit while trading blows), so a sustained brawl
      // still marches to collapse. A collapsed pawn is down until pain subsides.
      const inMelee =
        afterConditions.currentState === PAWN_STATE.FIGHTING ||
        afterConditions.currentState === PAWN_STATE.FLEEING ||
        afterConditions.currentState === PAWN_STATE.HUNTING ||
        (afterConditions.drafted === true && afterConditions.draftTarget?.type === 'attack');
      if (!inMelee) {
        const healed = healWounds(afterConditions, state.turn, state.buildings);
        if (healed !== afterConditions) {
          afterConditions = healed;
          state = {
            ...state,
            pawns: state.pawns.map((p) => (p.id === pawn.id ? healed : p))
          };
        }
      }
      const consciousness = pawnStatService.computeCapacities(afterConditions).consciousness ?? 1;

      if (afterConditions.currentState === PAWN_STATE.COLLAPSED) {
        const durations = { ...(afterConditions.conditionTimers ?? {}) };
        let downed: Pawn;
        if (consciousness >= RECOVER_CONSCIOUSNESS) {
          delete durations.collapse; // recovered — stand back up
          downed = {
            ...afterConditions,
            currentState: PAWN_STATE.IDLE,
            conditionTimers: durations
          };
        } else {
          durations.collapse = Math.max(durations.collapse ?? 0, 2); // keep it active
          downed = { ...afterConditions, conditionTimers: durations };
        }
        state = {
          ...state,
          pawns: state.pawns.map((p) =>
            p.id === pawn.id ? syncTransientConditions(downed, gameState.turn) : p
          )
        };
        continue;
      }

      if (consciousness < COLLAPSE_CONSCIOUSNESS) {
        // Enter collapse: drop the job, halt, and go down.
        const jobs = (state.jobs ?? []).some((j) => j.claimedBy === afterConditions.id)
          ? (state.jobs ?? []).map((j) =>
              j.claimedBy === afterConditions.id ? { ...j, claimedBy: null } : j
            )
          : state.jobs;
        const durations = { ...(afterConditions.conditionTimers ?? {}) };
        durations.collapse = Math.max(durations.collapse ?? 0, 2);
        const downed = syncTransientConditions({
          ...afterConditions,
          currentState: PAWN_STATE.COLLAPSED,
          activeJob: undefined,
          // Going down RELEASES the draft: an unconscious pawn can't be commanded, so drop the drafted
          // flag + any attack/move order. Otherwise the draft-path loop kept crawling it toward its
          // target at a fraction of a tile/s — a downed pawn dragging itself in to "attack" a wolf.
          drafted: false,
          draftTarget: undefined,
          path: [],
          isMoving: false,
          hasReachedDestination: false,
          conditionTimers: durations
        }, gameState.turn);
        state = {
          ...state,
          jobs,
          pawns: state.pawns.map((p) => (p.id === pawn.id ? downed : p))
        };
        continue;
      }

      let forCollapse = afterConditions;

      // R2: drafted pawns ran the full health block above (bleed/heal/death/collapse). They are
      // player-controlled, so skip the BEHAVIOURAL state machine (auto combat-engage, exhaustion
      // collapse, eat/sleep/work). Still tick transient condition durations so a combat-inflicted
      // knockdown/collapse actually expires, then sync transientConditions, and move on.
      if (forCollapse.drafted) {
        const stepped = tickConditionTimers(forCollapse);
        const synced = syncTransientConditions(stepped, gameState.turn);
        if (synced !== forCollapse) {
          state = {
            ...state,
            pawns: state.pawns.map((p) => (p.id === pawn.id ? synced : p))
          };
        }
        continue;
      }

      // ── Combat interrupt (top priority): a hostile is within aggro range. ──
      // Drop the current job and switch to a combat state so the pawn defends
      // itself instead of walking off to work. While already in a combat state we
      // leave path/movement to the handler (so a fleeing pawn can keep retreating).
      const inCombat =
        forCollapse.currentState === PAWN_STATE.FIGHTING ||
        forCollapse.currentState === PAWN_STATE.FLEEING;
      // Staggered detection (COMBAT_SCAN_INTERVAL): only re-scan a non-combat pawn every Nth tick,
      // offset by debugId so scans spread across ticks; in-combat pawns scan every tick.
      const scanForThreat =
        inCombat || (state.turn + (forCollapse.debugId ?? 0)) % COMBAT_SCAN_INTERVAL === 0;
      const threat = scanForThreat ? findCombatThreat(forCollapse, state) : null;
      if (threat) {
        const desired =
          (forCollapse.combatStance ?? 'defensive') === 'flee'
            ? PAWN_STATE.FLEEING
            : PAWN_STATE.FIGHTING;
        if (!inCombat) {
          // Entering combat: release any claimed job and plant in place.
          const jobs =
            forCollapse.activeJob || (state.jobs ?? []).some((j) => j.claimedBy === forCollapse.id)
              ? (state.jobs ?? []).map((j) =>
                  j.claimedBy === forCollapse.id ? { ...j, claimedBy: null } : j
                )
              : state.jobs;
          forCollapse = {
            ...forCollapse,
            currentState: desired,
            activeJob: undefined,
            path: [],
            isMoving: false,
            hasReachedDestination: false
          };
          state = {
            ...state,
            jobs,
            pawns: state.pawns.map((p) => (p.id === pawn.id ? forCollapse : p))
          };
        } else if (forCollapse.currentState !== desired) {
          // Switch between fighting/fleeing without clobbering an active flee path.
          forCollapse = { ...forCollapse, currentState: desired };
          state = {
            ...state,
            pawns: state.pawns.map((p) => (p.id === pawn.id ? forCollapse : p))
          };
        }
        // Run the combat handler and tick transient conditions, then move to next pawn —
        // skip the need/work state machine entirely while a threat is present.
        state = tickPawn(forCollapse, state);
        const afterCombat = pawnById(state.pawns, pawn.id);
        if (afterCombat) {
          const stepped = tickConditionTimers(afterCombat);
          const synced = syncTransientConditions(stepped, gameState.turn);
          if (synced !== afterCombat) {
            state = {
              ...state,
              pawns: state.pawns.map((p) => (p.id === pawn.id ? synced : p))
            };
          }
        }
        continue;
      }

      // Exhaustion collapse: fatigue >= 100 → force sleeping on the ground.
      if (
        (forCollapse.needs?.fatigue ?? 0) >= 100 &&
        forCollapse.currentState !== PAWN_STATE.SLEEPING
      ) {
        forCollapse = {
          ...forCollapse,
          currentState: PAWN_STATE.SLEEPING,
          activeJob: undefined,
          // Stop movement on collapse — otherwise processMovement keeps walking the
          // pawn along its old path while it's shown sleeping ("sleepwalking").
          path: [],
          isMoving: false,
          hasReachedDestination: false,
          state: { ...forCollapse.state, isSleeping: true, isWorking: false, isEating: false }
        };
        state = { ...state, pawns: state.pawns.map((p) => (p.id === pawn.id ? forCollapse : p)) };
      }

      // Run state machine for this pawn.
      state = tickPawn(forCollapse, state);
      // Tick transient condition durations, then sync transientConditions so PawnService reads fresh values.
      const updated = pawnById(state.pawns, pawn.id);
      if (updated) {
        let stepped = tickConditionTimers(updated);
        const synced = syncTransientConditions(stepped, gameState.turn);
        if (synced !== stepped) {
          state = { ...state, pawns: state.pawns.map((p) => (p.id === pawn.id ? synced : p)) };
        } else if (stepped !== updated) {
          state = { ...state, pawns: state.pawns.map((p) => (p.id === pawn.id ? stepped : p)) };
        }
      }
    }
    return state;
  }
}

export const pawnStateMachineService = new PawnStateMachineImpl();
