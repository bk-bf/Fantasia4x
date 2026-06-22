/**
 * needs.ts — Shared need/condition helpers used by both PawnService and EntityService.
 *
 * Extracted so the condition-stage multiplier logic is defined once and applied
 * consistently to any living entity (pawn or mob) that carries PawnCondition[].
 */

import type {
  EntityCondition,
  ConditionDef,
  ConditionStage,
  ConditionModifiers,
  TransientConditionDef,
  LimbState
} from './types';
import conditionsData from '../database/conditions.jsonc';
import { PART_DEF_MAP, BONE_FRACTION } from './BodyParts';
import { woundById } from './Wounds';
import { perTick } from './time';
import { simLog } from './logSink';

const CONDITIONS_DB = conditionsData as unknown as ConditionDef[];
/** Raw mixed list (persistent + transient shapes) for id-keyed lookups across both kinds. */
const ALL_CONDITION_DEFS = conditionsData as unknown as Array<ConditionDef | TransientConditionDef>;

/**
 * The ONE collapse threshold pair, shared by every consumer so pawns and mobs collapse/recover on the
 * SAME consciousness band (was duplicated in Combat, PawnStateMachine and entityConstants — they drifted).
 * `consciousness` (computeCapacities) folds pain + blood loss + organ damage, so downing has one cause.
 * Hysteresis: drop below COLLAPSE_CONSCIOUSNESS, only stand back up at RECOVER_CONSCIOUSNESS — so a body
 * teetering at the floor can't flicker. The `collapse` transient condition (conditions.jsonc) is kept in
 * lockstep with the down state on BOTH entity kinds (refreshed while down, cleared on recovery).
 */
export const COLLAPSE_CONSCIOUSNESS = 0.3;
export const RECOVER_CONSCIOUSNESS = 0.45;

/**
 * Fatigue at/above which the `tired` (Exhausted) transient is shown — the SAME badge for pawns and mobs
 * (was duplicated as pawnHelpers.FATIGUE_THRESHOLD-for-the-badge + entityConstants.TIRED_FATIGUE_THRESHOLD).
 * Distinct from the SEEK-REST threshold (pawn 72 / mob 60): a body normally rests long before this, so the
 * debuff only bites when something keeps it awake to the exhaustion ceiling.
 */
export const TIRED_FATIGUE_THRESHOLD = 100;

/**
 * If a (bare) transient/combat condition `id` is opted-in to floating text (`"floater": true` in
 * conditions.jsonc), return its display name + colour; otherwise undefined. For transient ids only
 * (`"winded"`, `"knockdown"`, …) — persistent conditions float via {@link emitPersistentConditionFloaters}
 * at their application site, keyed on the stage they reach, so they're not handled here.
 */
export function getConditionFloater(id: string): { name: string; color: string } | undefined {
  const def = ALL_CONDITION_DEFS.find((d) => d.id === id);
  if (!def || !(def as TransientConditionDef).floater) return undefined;
  return { name: def.name, color: (def as TransientConditionDef).color ?? '#dddddd' };
}

/**
 * Cheap content signature of a condition list (id+severity per entry, in order) — for detecting
 * whether a tick's in-place mutations actually changed anything, so the caller can give `conditions`
 * a NEW array ref ONLY on change. That ref flip is what the worker's per-field ref-diff keys on to
 * re-ship the (cold) conditions to the UI; an unchanged tick keeps the ref and ships nothing. Empty
 * list → '' with no allocation, so healthy entities (the common case) pay nothing.
 */
export function conditionsSig(conds: EntityCondition[]): string {
  if (conds.length === 0) return '';
  let s = '';
  for (let i = 0; i < conds.length; i++) s += conds[i].id + ':' + conds[i].severity + ';';
  return s;
}

/** Pain (0–100) at/above which the `shock` condition onsets; severity scales to 1 at pain 100. */
export const SHOCK_PAIN_ONSET = 40;
/** Fraction of blood lost (0–1) at which shock starts climbing from the blood side. */
export const SHOCK_BLOOD_ONSET = 0.35;

/**
 * Set the `shock` condition's severity DIRECTLY from current pain OR blood loss — whichever is worse
 * (reflected, tracks the live values; not accumulating). This is the SINGLE low-blood/high-pain
 * indicator now that the redundant `blood_loss` condition is gone: a body bled past `SHOCK_BLOOD_ONSET`
 * goes into shock just as one in severe pain does. Mutates `conditions` in place. Shared by pawns
 * (PawnStateMachine.tickConditions) and mobs (entityLifecycle.stepHunger). Non-lethal here — pain/blood
 * loss already drive consciousness → collapse → death; shock layers its stat/work penalty on top.
 */
export function applyShock(conditions: EntityCondition[], pain: number, bloodLossFrac = 0): void {
  // §F8: a pain-numbing condition (drunk, painkillers) dulls the felt pain that drives shock — a
  // sloshed pawn shrugs off a wound that would stagger a sober one. Blood-loss shock is unaffected.
  const feltPain = pain * conditionPainMultiplier({ conditions });
  const painSev = (feltPain - SHOCK_PAIN_ONSET) / (100 - SHOCK_PAIN_ONSET);
  const bloodSev = (bloodLossFrac - SHOCK_BLOOD_ONSET) / (1 - SHOCK_BLOOD_ONSET);
  const severity = Math.min(0.99, Math.max(0, painSev, bloodSev));
  const idx = conditions.findIndex((c) => c.id === 'shock');
  if (severity > 0) {
    if (idx === -1) conditions.push({ id: 'shock', severity });
    else conditions[idx] = { ...conditions[idx], severity };
  } else if (idx !== -1) {
    conditions.splice(idx, 1);
  }
}

/** §F8: per-second severity the `intoxicated` condition sheds (drink wears off over a few minutes). */
const INTOX_DECAY_PER_SEC = 0.002;

/**
 * Decay the (persistent, staged) `intoxicated` condition one tick — drink wears off over time. Drinking
 * pushes severity UP ({@link pawnQueries.applyIntoxication}); this drains it back down, dropping through
 * the stages (blackout → drunk → merry → tipsy) and clearing at 0. Pawns only (mobs don't drink).
 */
export function decayIntoxication(conditions: EntityCondition[]): void {
  const idx = conditions.findIndex((c) => c.id === 'intoxicated');
  if (idx === -1) return;
  const next = conditions[idx].severity - perTick(INTOX_DECAY_PER_SEC);
  if (next <= 0) conditions.splice(idx, 1);
  else conditions[idx] = { ...conditions[idx], severity: next };
}

/**
 * Aggregate one modifier KEY's multiplier across an entity's active conditions (persistent stages ×
 * transient defs). Identity 1 when nothing relevant is active (early-out on the hot path). Used for the
 * non-stat capacity/feel keys (`pain`, `consciousness`) that don't flow through conditionStatMultipliers.
 */
function conditionModifierProduct(
  entity: { conditions?: EntityCondition[]; transientConditions?: string[] },
  key: keyof ConditionModifiers
): number {
  const conds = entity.conditions;
  const tconds = entity.transientConditions;
  if ((!conds || conds.length === 0) && (!tconds || tconds.length === 0)) return 1;
  let mult = 1;
  for (const c of conds ?? []) {
    const v = getConditionCurrentStage(c)?.modifiers[key];
    if (v != null) mult *= v;
  }
  for (const id of tconds ?? []) {
    const v = TRANSIENT_BY_ID.get(id)?.modifiers[key];
    if (v != null) mult *= v;
  }
  return mult;
}

/** `pain` multiplier (< 1 numbs felt pain — alcohol/painkillers). Applied to the shock driver and to
 *  PawnStatService's pain → consciousness chokepoint, so a drunk pawn staves off pain-shock + stays up. */
export function conditionPainMultiplier(entity: {
  conditions?: EntityCondition[];
  transientConditions?: string[];
}): number {
  return conditionModifierProduct(entity, 'pain');
}

/** `consciousness` multiplier (< 1 dims alertness — heavy drink, etc.). Applied to the consciousness
 *  capacity in PawnStatService: enough cups and a pawn goes woozy, then blacks out (collapse). */
export function conditionConsciousnessMultiplier(entity: {
  conditions?: EntityCondition[];
  transientConditions?: string[];
}): number {
  return conditionModifierProduct(entity, 'consciousness');
}

/**
 * Snapshot the current stage label of every FLAGGED persistent condition on an entity, keyed by id
 * (e.g. `shock → "moderate"`). Taken BEFORE a tick mutates `conditions` so
 * {@link emitPersistentConditionFloaters} can tell which conditions newly appeared or changed stage.
 * Returns undefined when nothing flagged is present — the common case allocates nothing (hot path).
 */
export function snapshotConditionStages(
  conditions: EntityCondition[]
): Map<string, string> | undefined {
  let snap: Map<string, string> | undefined;
  for (const c of conditions) {
    const def = CONDITIONS_DB.find((d) => d.id === c.id);
    if (!def?.floater) continue;
    const stage = getConditionCurrentStage(c);
    if (stage) (snap ??= new Map()).set(c.id, stage.label);
  }
  return snap;
}

/**
 * Pop a floating label ("Name (stage)", in the stage colour) for each FLAGGED persistent condition
 * that newly appeared OR graduated to a different stage since `prevStages` (from
 * {@link snapshotConditionStages}). Shared by pawns + mobs so shock/infection/thermia surface
 * identically for every living entity (mobs don't run the transient-condition sync). Re-derives stage
 * downgrades too (recovery), which is the desired "status changed" cue.
 */
export function emitPersistentConditionFloaters(
  prevStages: Map<string, string> | undefined,
  next: EntityCondition[],
  x: number,
  y: number
): void {
  if (x < 0 || y < 0) return;
  for (const c of next) {
    const def = CONDITIONS_DB.find((d) => d.id === c.id);
    if (!def?.floater) continue;
    const stage = getConditionCurrentStage(c);
    if (!stage || prevStages?.get(c.id) === stage.label) continue;
    simLog.pushCombatText({
      worldX: x,
      worldY: y,
      text: `${def.name} (${stage.label})`,
      kind: 'condition',
      color: stage.color
    });
  }
}

/** Return the active ConditionStage for a given condition at its current severity. */
export function getConditionCurrentStage(condition: EntityCondition): ConditionStage | undefined {
  const def = CONDITIONS_DB.find((d) => d.id === condition.id);
  if (!def) return undefined;
  // Stages are ordered ascending by minSeverity; last one that passes wins.
  let active: ConditionStage | undefined;
  for (const stage of def.stages) {
    if (condition.severity >= stage.minSeverity) active = stage;
  }
  return active;
}

/** Display name for a condition (def name, else prettified id), without the stage suffix. */
export function getConditionName(condition: EntityCondition): string {
  const def = CONDITIONS_DB.find((d) => d.id === condition.id);
  return def?.name ?? condition.id.replace(/_/g, ' ');
}

/** Human-readable "Name (stage)" label for a condition, e.g. "Infection (mild)". */
export function getConditionLabel(condition: EntityCondition): string {
  const def = CONDITIONS_DB.find((d) => d.id === condition.id);
  const name = def?.name ?? condition.id.replace(/_/g, ' ');
  const stage = getConditionCurrentStage(condition);
  return stage ? `${name} (${stage.label})` : name;
}

/**
 * Advance or recover ONE need-driven condition per its conditions.jsonc `driver`, mutating the live
 * `conditions` array IN PLACE (ADR-002 hot-path amendment — the common case, need below onset and the
 * condition absent, allocates nothing). Rates are authored per-second; `perTick()` scales them to one
 * tick.
 */
export function applyConditionDriver(
  conditions: EntityCondition[],
  def: ConditionDef,
  needVal: number,
  recoveryMul = 1,
  // Elapsed real ticks this call represents. 1 for per-tick callers (pawns, in-bubble mobs); an
  // off-bubble mob only reaches here on its throttled think-tick, so it passes AI_THROTTLE_TICKS to
  // accrue/recover at the same per-tick rate over the ticks it skipped (matches the bars in stepHunger).
  // The onset *delay* is wall-clock and does NOT scale — only the post-onset accrual/recovery does.
  tickScale = 1
): void {
  const d = def.driver!;
  const idx = conditions.findIndex((c) => c.id === def.id);
  if (needVal >= d.onset) {
    const rate = perTick(needVal >= 100 ? d.rateMax : d.rateCritical) * tickScale;
    if (idx === -1) {
      // Onset delay: seed a NEGATIVE severity so the condition only crosses 0 — becoming visible,
      // stat-affecting and lethal-eligible — after the need has held at/above onset for `onsetDelay`
      // seconds. Severity climbs by rateMax/sec at a maxed need, so seeding -(onsetDelay·rateMax)
      // means a maxed need takes exactly `onsetDelay` s to begin (longer at a partial need). A negative
      // severity matches no stage, so it stays hidden everywhere (display skips severity ≤ 0, stage
      // lookups return undefined → no modifiers/floaters/lethal) until it surfaces.
      conditions.push({ id: def.id, severity: -(d.onsetDelay ?? 0) * d.rateMax + rate });
    } else
      conditions[idx] = {
        ...conditions[idx],
        severity: Math.min(1.0, conditions[idx].severity + rate)
      };
    return;
  }
  if (needVal < d.safe && idx !== -1) {
    // `recoveryMul` accelerates recovery (e.g. a sheltered pawn warms/cools faster — SEASONS_WEATHER).
    const newSeverity = conditions[idx].severity - perTick(d.recovery) * recoveryMul * tickScale;
    if (newSeverity <= 0) conditions.splice(idx, 1);
    else conditions[idx] = { ...conditions[idx], severity: newSeverity };
  }
}

/**
 * Drive EVERY need-based condition (malnutrition ← hunger, dehydration ← thirst, …) for one living
 * entity by its `driver`, mutating `conditions` in place. Returns the id of the first condition that
 * reached its lethal severity this tick (also its death cause), else `null`. Shared by pawns
 * (PawnStateMachine.tickConditions) and mobs (entityLifecycle.stepHunger) so starvation/thirst is ONE
 * data-driven model for every living entity — no hardcoded thresholds. Entities lacking a given need
 * (mobs have no `thirst`) simply never onset that condition.
 */
export function driveNeedConditions(
  conditions: EntityCondition[],
  needVals: Record<string, number> | undefined,
  // Off-bubble mobs call this once per throttled think-tick — pass AI_THROTTLE_TICKS so malnutrition
  // accrues/recovers at the real per-tick rate over the skipped ticks. Pawns omit it (per-tick → 1).
  tickScale = 1
): string | null {
  for (const def of CONDITIONS_DB) {
    if (!def.driver) continue;
    if (def.driver.source) continue; // environment-driven (temperature) — see driveTemperatureConditions
    const needVal = needVals?.[def.driver.need!] ?? 0;
    applyConditionDriver(conditions, def, needVal, 1, tickScale);
    const current = conditions.find((c) => c.id === def.id);
    if (current && current.severity >= def.lethalSeverity) return def.id;
  }
  return null;
}

/**
 * Drive the temperature-exposure conditions (SEASONS_WEATHER): hypothermia ← cold exposure,
 * heat stroke ← heat exposure. `coldExposure`/`heatExposure` are 0–100 "need-like" values (degrees
 * past the pawn's comfort range, after resistance) computed by the caller — see
 * EnvironmentService.coldExposure/heatExposure + PawnStateMachine.tickConditions. Mutates
 * `conditions` in place; returns the first lethal condition id this tick, else `null`. Two scalar
 * params (no per-pawn object allocation), reusing the same `applyConditionDriver` onset/recovery model.
 */
export function driveTemperatureConditions(
  conditions: EntityCondition[],
  coldExposure: number,
  heatExposure: number,
  recoveryMul = 1
): string | null {
  for (const def of CONDITIONS_DB) {
    const src = def.driver?.source;
    if (!src) continue;
    applyConditionDriver(
      conditions,
      def,
      src === 'heat' ? heatExposure : coldExposure,
      recoveryMul
    );
    const current = conditions.find((c) => c.id === def.id);
    if (current && current.severity >= def.lethalSeverity) return def.id;
  }
  return null;
}

/** Load ratio below which a pawn is unencumbered; ratio at/above which encumbrance is maxed. */
export const ENC_BURDEN_START = 0.8;
export const ENC_OVERLOAD_FULL = 1.4;

/**
 * Set the `encumbered` condition's severity DIRECTLY from the carry-load ratio (load ÷ weight
 * capacity). Unlike need/temperature conditions this is INSTANTANEOUS — a pawn is encumbered *now*
 * because of what it bears, not after sustained exposure — so severity snaps to the load each tick
 * (like combat's `blood_loss`), not accruing via `applyConditionDriver`. severity 0 at/below
 * `ENC_BURDEN_START`, 1 at `ENC_OVERLOAD_FULL`. Mutates `conditions` in place (ADR-002 hot path:
 * nothing allocated while the pawn is light + the condition absent).
 */
export function driveEncumbrance(conditions: EntityCondition[], loadRatio: number): void {
  const sev = Math.min(
    1,
    Math.max(0, (loadRatio - ENC_BURDEN_START) / (ENC_OVERLOAD_FULL - ENC_BURDEN_START))
  );
  const idx = conditions.findIndex((c) => c.id === 'encumbered');
  if (sev <= 0) {
    if (idx !== -1) conditions.splice(idx, 1);
    return;
  }
  if (idx === -1) conditions.push({ id: 'encumbered', severity: sev });
  else if (Math.abs(conditions[idx].severity - sev) > 1e-3)
    conditions[idx] = { ...conditions[idx], severity: sev };
}

/** Effective wind below which a pawn feels no windchill; wind at/above which it's maxed (extreme).
 *  Onset sits at the "somewhat windy" degree (see EnvironmentService.windDegreeWord) so a merely
 *  "slightly windy" world — the calm baseline ambient wind drifts around here — never chills a pawn;
 *  windchill only bites once the wind picks up past slight. */
export const WIND_ONSET = 0.36;
export const WIND_FULL = 1.0;

/**
 * Set the `windchilled` condition's severity DIRECTLY from the tile's effective wind 0–1 (after roof
 * + lee shelter — see EnvironmentService.effectiveWindAt). Like `driveEncumbrance` this is
 * INSTANTANEOUS, not accrued: a pawn is windblown *now* by what's blowing on it, so severity snaps to
 * the wind each tick. severity 0 at/below `WIND_ONSET`, 1 at `WIND_FULL`; the five stages
 * (slightly→extremely windy) live in conditions.jsonc. Mutates `conditions` in place (ADR-002 hot
 * path: nothing allocated while it's calm + the condition absent).
 */
export function driveWindchill(
  conditions: EntityCondition[],
  effWind: number,
  onset = WIND_ONSET,
  full = WIND_FULL
): void {
  const sev = Math.min(1, Math.max(0, (effWind - onset) / (full - onset)));
  const idx = conditions.findIndex((c) => c.id === 'windchilled');
  if (sev <= 0) {
    if (idx !== -1) conditions.splice(idx, 1);
    return;
  }
  if (idx === -1) conditions.push({ id: 'windchilled', severity: sev });
  else if (Math.abs(conditions[idx].severity - sev) > 1e-3)
    conditions[idx] = { ...conditions[idx], severity: sev };
}

// ── Temperature comfort (SEASONS_WEATHER Subsystem 3) ──────────────────────────
/** Default comfortable temperature band in conceptual °C; traits widen/shift it. */
export const COMFORT_MIN_DEFAULT = 5;
export const COMFORT_MAX_DEFAULT = 30;

/**
 * A pawn/entity's comfortable temperature range, shifted by racial traits. Outside this band cold
 * tires and heat starves (PawnService need-rate) and drives hypothermia / heat stroke.
 */
export function comfortRange(traits: ReadonlyArray<{ name: string }> | undefined): {
  min: number;
  max: number;
} {
  let min = COMFORT_MIN_DEFAULT;
  let max = COMFORT_MAX_DEFAULT;
  if (traits) {
    for (let i = 0; i < traits.length; i++) {
      const name = traits[i].name;
      if (name === 'Cold Blooded') {
        min = 15;
        max = 40;
      } else if (name === 'Insulated') {
        min = -5;
        max = 25;
      }
    }
  }
  return { min, max };
}

/**
 * Aggregate hungerRate / fatigueRate multipliers from all active condition stages.
 * Returns { hungerRate: 1, fatigueRate: 1 } (identity) when no conditions are active.
 */
export function conditionNeedMultipliers(conditions: EntityCondition[]): {
  hungerRate: number;
  fatigueRate: number;
  thirstRate: number;
} {
  let hungerRate = 1;
  let fatigueRate = 1;
  let thirstRate = 1;
  for (const c of conditions) {
    const stage = getConditionCurrentStage(c);
    if (stage) {
      hungerRate *= stage.modifiers.hungerRate ?? 1;
      fatigueRate *= stage.modifiers.fatigueRate ?? 1;
      thirstRate *= stage.modifiers.thirstRate ?? 1;
    }
  }
  return { hungerRate, fatigueRate, thirstRate };
}

// ── Condition → base-stat penalties ────────────────────────────────────────────────────────────
const TRANSIENT_BY_ID = new Map<string, TransientConditionDef>(
  (
    ALL_CONDITION_DEFS.filter(
      (d) => (d as TransientConditionDef).transient === true
    ) as TransientConditionDef[]
  ).map((d) => [d.id, d])
);

/**
 * Hunger/fatigue/thirst rate multipliers from a list of TRANSIENT condition IDs (the `eating`/`sleeping`
 * pause + every timed transient with a need modifier). Mirrors {@link conditionNeedMultipliers} (which
 * covers the PERSISTENT stage-based ones) for the transient half, so a mob can source its eating-pause /
 * sleeping-slowdown from the SAME conditions.jsonc data pawns read — never a hardcoded constant.
 */
export function transientNeedMultipliers(ids: ReadonlyArray<string>): {
  hungerRate: number;
  fatigueRate: number;
  thirstRate: number;
} {
  let hungerRate = 1;
  let fatigueRate = 1;
  let thirstRate = 1;
  for (const id of ids) {
    const m = TRANSIENT_BY_ID.get(id)?.modifiers;
    if (m) {
      hungerRate *= m.hungerRate ?? 1;
      fatigueRate *= m.fatigueRate ?? 1;
      thirstRate *= m.thirstRate ?? 1;
    }
  }
  return { hungerRate, fatigueRate, thirstRate };
}

export interface StatMultipliers {
  strength: number;
  dexterity: number;
  constitution: number;
  perception: number;
  intelligence: number;
}
/** Shared identity result returned for the common (no-condition) case — never mutated. */
const NO_STAT_MULT: StatMultipliers = Object.freeze({
  strength: 1,
  dexterity: 1,
  constitution: 1,
  perception: 1,
  intelligence: 1
});

/**
 * Aggregate the base-stat multipliers (STR/DEX/CON/PER/INT) an entity's active conditions impose —
 * persistent stages (by current severity) × transient conditions. These scale the RAW attributes
 * wherever they're read (combat damage/hit/dodge, carry, every work formula), so a severe condition
 * genuinely cripples the body. Identity (all 1) when nothing is active — early-out so healthy entities
 * pay nothing on this hot path.
 */
export function conditionStatMultipliers(entity: {
  conditions?: EntityCondition[];
  transientConditions?: string[];
}): StatMultipliers {
  const conds = entity.conditions;
  const tconds = entity.transientConditions;
  if ((!conds || conds.length === 0) && (!tconds || tconds.length === 0)) return NO_STAT_MULT;
  const out: StatMultipliers = {
    strength: 1,
    dexterity: 1,
    constitution: 1,
    perception: 1,
    intelligence: 1
  };
  const apply = (m?: ConditionModifiers) => {
    if (!m) return;
    if (m.strength != null) out.strength *= m.strength;
    if (m.dexterity != null) out.dexterity *= m.dexterity;
    if (m.constitution != null) out.constitution *= m.constitution;
    if (m.perception != null) out.perception *= m.perception;
    if (m.intelligence != null) out.intelligence *= m.intelligence;
  };
  for (const c of conds ?? []) apply(getConditionCurrentStage(c)?.modifiers);
  for (const id of tconds ?? []) apply(TRANSIENT_BY_ID.get(id)?.modifiers);
  return out;
}

/** Sync the graded `fractured` condition from the limb tree. Severity = the WORST bone-damage fraction
 *  across all still-attached bone parts: a fracture wound's accumulated damage ÷ that part's break
 *  threshold (BONE_FRACTION × the part's SCALED maxHp). 0 → no condition; → 1.0 once a bone is fully
 *  broken ("bone HP at 0" = max debuff). A broken bone never severs the limb (Combat excludes structural
 *  wounds from isMissing); the per-limb manipulation/moving cripple rides the boneBroken flag separately.
 *  Mutates the conditions array in place (matching the surrounding tick style). */
export function syncFractureConditions(conditions: EntityCondition[], limbs: LimbState[]): void {
  let worst = 0;
  for (const l of limbs) {
    if (l.isMissing) continue;
    for (const p of l.parts ?? []) {
      if (p.isMissing) continue;
      if (PART_DEF_MAP[p.id]?.boneHp == null) continue; // part has no skeleton → can't fracture
      const frac = p.injuries.find((w) => woundById(w.type)?.structural);
      if (!frac) continue;
      const breakAt = BONE_FRACTION * p.maxHp; // scaled break threshold ("bone HP")
      const sev = breakAt > 0 ? Math.min(1, frac.damage / breakAt) : 0;
      if (sev > worst) worst = sev;
    }
  }
  const idx = conditions.findIndex((c) => c.id === 'fractured');
  if (worst > 0) {
    if (idx >= 0) conditions[idx] = { ...conditions[idx], severity: worst };
    else conditions.push({ id: 'fractured', severity: worst });
  } else if (idx >= 0) {
    conditions.splice(idx, 1);
  }
}
