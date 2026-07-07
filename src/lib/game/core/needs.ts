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
import { PART_DEF_MAP, boneBreakBudget } from './BodyParts';
import { woundById } from './Wounds';
import { perTick } from './time';
import { simLog } from './logSink';

const CONDITIONS_DB = conditionsData as unknown as ConditionDef[];
/** Raw mixed list (persistent + transient shapes) for id-keyed lookups across both kinds. */
const ALL_CONDITION_DEFS = conditionsData as unknown as Array<ConditionDef | TransientConditionDef>;
/** Transient condition defs keyed by id — for id→modifiers/needOnset lookups (used by the helpers below). */
const TRANSIENT_BY_ID = new Map<string, TransientConditionDef>(
  (
    ALL_CONDITION_DEFS.filter(
      (d) => (d as TransientConditionDef).transient === true
    ) as TransientConditionDef[]
  ).map((d) => [d.id, d])
);

/**
 * The ONE collapse threshold pair, shared by every consumer so pawns and mobs collapse/recover on the
 * SAME consciousness band (was duplicated in Combat, PawnStateMachine and entityConstants — they drifted).
 * `consciousness` (computeCapacities) folds pain + blood loss + organ damage, so downing has one cause.
 * Hysteresis: drop below COLLAPSE_CONSCIOUSNESS, stand back up once consciousness climbs back past
 * RECOVER_CONSCIOUSNESS. The gap is INTENTIONALLY tiny — just enough to stop a body teetering exactly at
 * the floor from flickering up/down. A body should wake as soon as the thing that downed it (pain / blood
 * loss) eases back past the trigger, NOT have to recover all the way to near-full (the old 0.45 band meant
 * a pawn collapsed at pain ~80 only woke at pain ~65, which read as "stays down until healed").
 * The `collapse` transient condition (conditions.jsonc) is kept in lockstep with the down state on BOTH
 * entity kinds (refreshed while down, cleared on recovery).
 */
export const COLLAPSE_CONSCIOUSNESS = 0.3;
export const RECOVER_CONSCIOUSNESS = 0.32;

/** The need + cutoff at which a NEED-threshold transient onsets, declared in conditions.jsonc (`needOnset`),
 *  e.g. `tired` → fatigue ≥ 100. Read by the deriving code so the threshold lives in DATA, not constants. */
export function transientNeedOnset(id: string): { need: string; atOrAbove: number } | undefined {
  return TRANSIENT_BY_ID.get(id)?.needOnset;
}

/** The full transient condition def for an id (or undefined). Lets combat + UI resolve a body
 *  condition's ADR-023 grants (natural weapon / armor) from the condition itself — the pill is the hub. */
export function getTransientConditionDef(id: string): TransientConditionDef | undefined {
  return TRANSIENT_BY_ID.get(id);
}

/** Any condition def (persistent OR transient) by id — for the TRAIT-SYSTEM-V2 §5 graph, whose edges
 *  can be declared on either kind. */
const CONDITION_BY_ID = new Map<string, ConditionDef | TransientConditionDef>(
  ALL_CONDITION_DEFS.map((d) => [d.id, d])
);
export function getConditionDefById(id: string): ConditionDef | TransientConditionDef | undefined {
  return CONDITION_BY_ID.get(id);
}

/** Precomputed set of condition ids whose def declares outgoing `triggers` — the cheap per-tick gate
 *  so the graph trigger pass does work only for pawns that actually carry a trigger-bearing condition. */
export const CONDITION_IDS_WITH_TRIGGERS: ReadonlySet<string> = new Set(
  ALL_CONDITION_DEFS.filter((d) => (d.triggers?.length ?? 0) > 0).map((d) => d.id)
);

/** Status-animation priority for a condition id (conditions.jsonc `priority`), default 0. When an entity
 *  has several glyph-animated states active, the renderer plays the highest-priority one (collapse > sleep
 *  > winded), so the most important state-to-know shows over its sprite. */
export function conditionPriority(id: string): number {
  return TRANSIENT_BY_ID.get(id)?.priority ?? 0;
}

/**
 * Fatigue at/above which the `tired` (Exhausted) transient shows — sourced from the `tired` condition's
 * `needOnset` in conditions.jsonc (single source of truth), shared by pawns and mobs. Distinct from the
 * SEEK-REST threshold (pawn 72 / mob 60): a body normally rests long before this, so the debuff only bites
 * when something keeps it awake to the exhaustion ceiling. Falls back to 100 if the data is ever missing.
 */
export const TIRED_FATIGUE_THRESHOLD = transientNeedOnset('tired')?.atOrAbove ?? 100;

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

/** Pain (0–100) at/above which `pain_shock` onsets; severity scales to 1 at pain 100. */
export const SHOCK_PAIN_ONSET = 40;
/** Fraction of blood lost (0–1) at which `hypovolemia` starts climbing. */
export const SHOCK_BLOOD_ONSET = 0.35;

/** Set (add/update/clear) a reflected meter-driven condition's severity in place (capped 0–0.99). */
function setReflectedSeverity(conditions: EntityCondition[], id: string, severity: number): void {
  const sev = Math.min(0.99, Math.max(0, severity));
  const idx = conditions.findIndex((c) => c.id === id);
  if (sev > 0) {
    if (idx === -1) conditions.push({ id, severity: sev });
    else conditions[idx] = { ...conditions[idx], severity: sev };
  } else if (idx !== -1) {
    conditions.splice(idx, 1);
  }
}

/**
 * Drive the TWO split crisis conditions from live pain and blood loss, SEPARATELY (2026-07-08 — the old
 * unified `shock` conflated them into one confusing pill). Each REFLECTS (tracks, doesn't accumulate) its
 * own driver:
 *  - `pain_shock` from pain past `SHOCK_PAIN_ONSET` — dulled by painkillers/drink (§F8
 *    `conditionPainMultiplier`: a sloshed pawn shrugs off a wound that would stagger a sober one);
 *  - `hypovolemia` from blood lost past `SHOCK_BLOOD_ONSET` — unaffected by pain-numbing (it's emptiness,
 *    not pain).
 * Each carries HALF the old shock stat debuff; when BOTH fire they stack (× in `conditionStatMultipliers`)
 * back to roughly the old unified crisis — now legible as two distinct causes. Mutates `conditions` in
 * place; shared by pawns (PawnStateMachine.tickConditions) and mobs (entityLifecycle.stepHunger).
 * Non-lethal here — pain/blood loss already drive consciousness → collapse → death; these layer the
 * stat/work penalty on top. Signature unchanged so both callers are untouched.
 */
export function applyShock(conditions: EntityCondition[], pain: number, bloodLossFrac = 0): void {
  const feltPain = pain * conditionPainMultiplier({ conditions });
  const painSev = (feltPain - SHOCK_PAIN_ONSET) / (100 - SHOCK_PAIN_ONSET);
  const bloodSev = (bloodLossFrac - SHOCK_BLOOD_ONSET) / (1 - SHOCK_BLOOD_ONSET);
  setReflectedSeverity(conditions, 'pain_shock', painSev);
  setReflectedSeverity(conditions, 'hypovolemia', bloodSev);
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

/** Combat-SFX cue id for a condition (conditions.jsonc `audio`), or undefined. Read by Combat to fire
 *  a sound the tick a combat condition latches (knockdown/envenomed/shock/…). */
export function conditionAudio(id: string): string | undefined {
  return ALL_CONDITION_DEFS.find((d) => d.id === id)?.audio;
}

/** Vital conditions that raise a colony-wide chronicle alert when they worsen a stage (a starving or
 *  dehydrating colonist is an emergency the player should be told about, not just a floating label). */
const VITAL_ALERT_IDS = new Set(['malnutrition', 'dehydration']);

/**
 * Snapshot the stage label of every VITAL condition (malnutrition/dehydration) on an entity, taken
 * BEFORE a tick mutates `conditions`, for {@link detectVitalEscalations}. This is DELIBERATELY separate
 * from {@link snapshotConditionStages}, which only captures `floater`-flagged conditions — dehydration
 * is NOT a floater, so reusing that snapshot left its prev-stage perpetually unknown and the alert
 * re-fired EVERY tick (chronicle spam). Returns undefined when no vital condition is present.
 */
export function snapshotVitalStages(
  conditions: EntityCondition[]
): Map<string, string> | undefined {
  let snap: Map<string, string> | undefined;
  for (const c of conditions) {
    if (!VITAL_ALERT_IDS.has(c.id)) continue;
    const stage = getConditionCurrentStage(c);
    if (stage) (snap ??= new Map()).set(c.id, stage.label);
  }
  return snap;
}

/**
 * Detect which vital conditions (malnutrition/dehydration) just ESCALATED to a worse stage since
 * `prevStages` (from {@link snapshotVitalStages} — NOT the floater snapshot) — for the chronicle/bugle
 * alert. Only UPWARD graduations past the benign baseline stage (index 0 = "hungry"/"thirsty", which
 * every pawn hits routinely) count; recovery (downgrade) and the baseline never alert. Returns
 * `{id, stageLabel}` per escalation. Pure — the caller (PawnStateMachine) emits the sink event.
 */
export function detectVitalEscalations(
  prevStages: Map<string, string> | undefined,
  next: EntityCondition[]
): { id: string; stageLabel: string }[] {
  const out: { id: string; stageLabel: string }[] = [];
  for (const c of next) {
    if (!VITAL_ALERT_IDS.has(c.id)) continue;
    const def = CONDITIONS_DB.find((d) => d.id === c.id);
    if (!def) continue;
    const stages = def.stages;
    let curIdx = -1;
    for (let i = 0; i < stages.length; i++) if (c.severity >= stages[i].minSeverity) curIdx = i;
    if (curIdx < 1) continue; // none, or the benign baseline stage — not alert-worthy
    const prevLabel = prevStages?.get(c.id);
    const prevIdx = prevLabel ? stages.findIndex((s) => s.label === prevLabel) : -1;
    if (curIdx > prevIdx) out.push({ id: c.id, stageLabel: stages[curIdx].label });
  }
  return out;
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

/** Load ratio below which a pawn is unencumbered; ratio at/above which encumbrance is maxed.
 *  The floor sits at FULL capacity (1.0): a pawn carrying anything up to its limit is fine, and
 *  encumbrance only bites once it's OVER capacity (matches the UI "past ~100% encumbers" copy). */
export const ENC_BURDEN_START = 1.0;
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
 *  budget (boneBreakBudget — a skeleton element's whole HP, or BONE_FRACTION of a flesh-wrapped bone).
 *  0 → no condition; → 1.0 once a bone is fully
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
      const breakAt = boneBreakBudget(PART_DEF_MAP[p.id], p.maxHp); // scaled break threshold ("bone HP")
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
