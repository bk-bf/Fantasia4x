/**
 * needs.ts — Shared need/condition helpers used by both PawnService and EntityService.
 *
 * Extracted so the condition-stage multiplier logic is defined once and applied
 * consistently to any living entity (pawn or mob) that carries PawnCondition[].
 */

import type { EntityCondition, ConditionDef, ConditionStage } from './types';
import conditionsData from '../database/conditions.jsonc';

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

/**
 * Aggregate hungerRate / fatigueRate multipliers from all active condition stages.
 * Returns { hungerRate: 1, fatigueRate: 1 } (identity) when no conditions are active.
 */
export function conditionNeedMultipliers(
    conditions: EntityCondition[]
): { hungerRate: number; fatigueRate: number } {
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
