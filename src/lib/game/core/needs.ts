/**
 * needs.ts — Shared need/condition helpers used by both PawnService and EntityService.
 *
 * Extracted so the condition-stage multiplier logic is defined once and applied
 * consistently to any living entity (pawn or mob) that carries PawnCondition[].
 */

import type { EntityCondition, ConditionDef, ConditionStage } from './types';
import conditionsData from '../database/conditions.jsonc';
import { perTick } from './time';

const CONDITIONS_DB = conditionsData as unknown as ConditionDef[];

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
  needVal: number
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
    const newSeverity = conditions[idx].severity - perTick(d.recovery);
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
    const needVal = needVals?.[def.driver.need] ?? 0;
    applyConditionDriver(conditions, def, needVal);
    const current = conditions.find((c) => c.id === def.id);
    if (current && current.severity >= def.lethalSeverity) return def.id;
  }
  return null;
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
