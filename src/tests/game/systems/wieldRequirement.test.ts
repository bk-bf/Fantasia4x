import { describe, it, expect } from 'vitest';
import {
  driveWieldStrain,
  conditionStatMultipliers,
  conditionNeedMultipliers,
  getConditionCurrentStage
} from '$lib/game/core/needs';
import { itemService } from '$lib/game/services/ItemService';
import type { EntityCondition } from '$lib/game/core/types';

// §2c wielding requirement, wired via the `overmatched` CONDITION (not inline combat math). Orc gear
// carries a `wieldRequirement.strength`; a pawn below it is driven `overmatched` each tick, and the
// staged condition's modifiers (strength/hitChance/dodge/fatigueRate) flow into combat via the same
// conditionStatMultipliers / conditionHitMult / conditionNeedMultipliers reads as encumbrance.

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

  it('driveWieldStrain sets, scales, and clears the overmatched condition from the STR shortfall', () => {
    const conds: EntityCondition[] = [];
    driveWieldStrain(conds, 0); // meets the bar → nothing
    expect(conds.find((c) => c.id === 'overmatched')).toBeUndefined();

    driveWieldStrain(conds, 3); // small shortfall → mild
    const mild = conds.find((c) => c.id === 'overmatched')!;
    expect(mild).toBeTruthy();
    expect(getConditionCurrentStage(mild)?.label).toBe('unwieldy');

    driveWieldStrain(conds, 14); // STR-8 pawn on a STR-22 slab → maxed
    const severe = conds.find((c) => c.id === 'overmatched')!;
    expect(severe.severity).toBeCloseTo(1);
    expect(getConditionCurrentStage(severe)?.label).toBe('flailing');

    driveWieldStrain(conds, 0); // unequip / strong enough → clears
    expect(conds.find((c) => c.id === 'overmatched')).toBeUndefined();
  });

  it('the condition cripples combat: softer blows (strength), worse aim (hitChance), faster fatigue', () => {
    const conds: EntityCondition[] = [];
    driveWieldStrain(conds, 14); // flailing
    // strength multiplier < 1 → less damage AND less raw force (combat reads it via conditionStatMultipliers).
    expect(conditionStatMultipliers({ conditions: conds }).strength).toBeLessThan(1);
    // hitChance < 1 → flails (Combat.resolveHit folds this via conditionHitMult).
    expect(getConditionCurrentStage(conds[0])?.modifiers.hitChance).toBeLessThan(1);
    // fatigueRate > 1 → tires fast, so a sustained fight drains stamina and winds the wielder.
    expect(conditionNeedMultipliers(conds).fatigueRate).toBeGreaterThan(1);
  });
});
