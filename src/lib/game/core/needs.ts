/**
 * needs.ts — Shared need/condition helpers used by both PawnService and EntityService.
 *
 * Extracted so the condition-stage multiplier logic is defined once and applied
 * consistently to any living entity (pawn or mob) that carries PawnCondition[].
 */

import type { EntityCondition, ConditionDef, ConditionStage, TransientConditionDef } from './types';
import conditionsData from '../database/conditions.jsonc';
import { perTick } from './time';

const CONDITIONS_DB = conditionsData as unknown as ConditionDef[];
/** Raw mixed list (persistent + transient shapes) for id-keyed lookups across both kinds. */
const ALL_CONDITION_DEFS = conditionsData as unknown as Array<ConditionDef | TransientConditionDef>;

/**
 * If a condition `id` is opted-in to floating text (`"floater": true` in conditions.jsonc), return
 * its display name + colour for a floater; otherwise undefined. Used by the combat + state-machine
 * emit sites to pop a label the first tick the condition latches (or, for persistent conditions,
 * graduates to a new stage).
 *
 * Two id shapes: a transient id is bare (`"winded"`) and carries a top-level `color`; a persistent
 * condition surfaces in `transientConditions` stage-suffixed (`"shock:moderate"`), so split on `:`,
 * resolve the base def, and use the matching stage's colour + a "Name (stage)" label.
 */
export function getConditionFloater(id: string): { name: string; color: string } | undefined {
  const sep = id.indexOf(':');
  if (sep !== -1) {
    const baseId = id.slice(0, sep);
    const stageLabel = id.slice(sep + 1);
    const def = ALL_CONDITION_DEFS.find((d) => d.id === baseId);
    if (!def || !(def as ConditionDef).floater || !(def as ConditionDef).stages) return undefined;
    const stage = (def as ConditionDef).stages.find((s) => s.label === stageLabel);
    return { name: `${def.name} (${stageLabel})`, color: stage?.color ?? '#dddddd' };
  }
  const def = ALL_CONDITION_DEFS.find((d) => d.id === id);
  if (!def || !(def as TransientConditionDef).floater) return undefined;
  return { name: def.name, color: (def as TransientConditionDef).color ?? '#dddddd' };
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
  recoveryMul = 1
): void {
  const d = def.driver!;
  const idx = conditions.findIndex((c) => c.id === def.id);
  if (needVal >= d.onset) {
    const rate = perTick(needVal >= 100 ? d.rateMax : d.rateCritical);
    if (idx === -1) conditions.push({ id: def.id, severity: rate });
    else
      conditions[idx] = {
        ...conditions[idx],
        severity: Math.min(1.0, conditions[idx].severity + rate)
      };
    return;
  }
  if (needVal < d.safe && idx !== -1) {
    // `recoveryMul` accelerates recovery (e.g. a sheltered pawn warms/cools faster — SEASONS_WEATHER).
    const newSeverity = conditions[idx].severity - perTick(d.recovery) * recoveryMul;
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
  needVals: Record<string, number> | undefined
): string | null {
  for (const def of CONDITIONS_DB) {
    if (!def.driver) continue;
    if (def.driver.source) continue; // environment-driven (temperature) — see driveTemperatureConditions
    const needVal = needVals?.[def.driver.need!] ?? 0;
    applyConditionDriver(conditions, def, needVal);
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
} {
  let hungerRate = 1;
  let fatigueRate = 1;
  for (const c of conditions) {
    const stage = getConditionCurrentStage(c);
    if (stage) {
      hungerRate *= stage.modifiers.hungerRate ?? 1;
      fatigueRate *= stage.modifiers.fatigueRate ?? 1;
    }
  }
  return { hungerRate, fatigueRate };
}
