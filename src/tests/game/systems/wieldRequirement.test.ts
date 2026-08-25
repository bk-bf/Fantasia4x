import { describe, it, expect } from 'vitest';
import {
  driveWieldStrain,
  conditionStatMultipliers,
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

  it('the condition cripples combat: softer blows (strength), worse aim (hitChance), faster fatigue', () => {
    const conds: EntityCondition[] = [];
    driveWieldStrain(conds, 14);
    expect(conditionStatMultipliers({ conditions: conds }).strength).toBeLessThan(1);
    expect(getConditionCurrentStage(conds[0])?.modifiers.hitChance).toBeLessThan(1);
    expect(conditionNeedMultipliers(conds).fatigueRate).toBeGreaterThan(1);
  });
});
