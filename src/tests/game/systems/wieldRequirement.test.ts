import { describe, it, expect } from 'vitest';
import {
  driveWieldStrain,
  conditionModifierSum,
  conditionNeedMultipliers,
  getConditionCurrentStage
} from '$lib/game/core/rules/body/conditions';
import { itemService } from '$lib/game/services/ItemService';
import type { EntityCondition } from '$lib/game/core/types';

describe('§2c wield strain', () => {
  it('orc gear carries a wieldRequirement.strength; goblin gear does not', () => {
    expect(
      itemService.getItemById('orc_cleaver')?.weaponProperties?.wieldRequirement?.strength
    ).toBe(20);
    expect(itemService.getItemById('orc_maul')?.weaponProperties?.wieldRequirement?.strength).toBe(
      22
    );
    expect(
      itemService.getItemById('goblin_shank')?.weaponProperties?.wieldRequirement
    ).toBeUndefined();
  });

  it('driveWieldStrain sets, scales, and clears the overmatched condition from the STRENGTH shortfall', () => {
    const conds: EntityCondition[] = [];
    driveWieldStrain(conds, 0);
    expect(conds.find((c) => c.id === 'overmatched')).toBeUndefined();

    driveWieldStrain(conds, 3);
    const mild = conds.find((c) => c.id === 'overmatched')!;
    expect(mild).toBeTruthy();
    expect(getConditionCurrentStage(mild)?.label).toBe('unwieldy');

    driveWieldStrain(conds, 14);
    const severe = conds.find((c) => c.id === 'overmatched')!;
    expect(severe.severity).toBeCloseTo(1);
    expect(getConditionCurrentStage(severe)?.label).toBe('flailing');

    driveWieldStrain(conds, 0);
    expect(conds.find((c) => c.id === 'overmatched')).toBeUndefined();
  });

  it('the condition cripples combat: softer blows (melee damage), worse aim (hitChance), faster fatigue', () => {
    const conds: EntityCondition[] = [];
    driveWieldStrain(conds, 14);
    expect(conditionModifierSum({ conditions: conds }, 'melee_damage')).toBeLessThan(0);
    expect(getConditionCurrentStage(conds[0])?.modifiers.hitChance).toBeLessThan(1);
    expect(conditionNeedMultipliers(conds).fatigueRate).toBeGreaterThan(1);
  });

  it('conditionModifierSum adds contributions across conditions naming the same stat, not just the last', () => {
    const conds: EntityCondition[] = [
      { id: 'overmatched', severity: 0.5 },
      { id: 'encumbered', severity: 0.5 }
    ];
    expect(conditionModifierSum({ conditions: conds }, 'melee_damage')).toBeCloseTo(
      -0.14 + -0.1,
      10
    );
  });

  it('conditionNeedMultipliers multiplies fatigueRate across conditions rather than overwriting it', () => {
    const conds: EntityCondition[] = [
      { id: 'overmatched', severity: 0.1 },
      { id: 'encumbered', severity: 0.1 }
    ];
    expect(conditionNeedMultipliers(conds).fatigueRate).toBeCloseTo(1.25 * 1.1, 10);
  });

  it('getConditionCurrentStage: undefined for an unknown id and for a severity below every stage', () => {
    expect(getConditionCurrentStage({ id: 'not-a-real-condition', severity: 0.5 })).toBeUndefined();
    expect(getConditionCurrentStage({ id: 'overmatched', severity: -1 })).toBeUndefined();
  });
});
