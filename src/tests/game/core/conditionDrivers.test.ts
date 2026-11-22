import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  applyShock,
  conditionNeedMultipliers,
  driveEncumbrance,
  driveNeedConditions,
  driveTemperatureConditions,
  emitPersistentConditionFloaters,
  snapshotConditionStages,
  syncFractureConditions
} from '$lib/game/core/rules/body/conditions';
import { recomputeWound } from '$lib/game/core/defs/wounds';
import { createBodyPlanLimbs, skeletonPartOf } from '$lib/game/core/defs/bodyParts';
import { simLog } from '$lib/game/core/util/logSink';
import type { EntityCondition } from '$lib/game/core/types';

const sev = (conds: EntityCondition[], id: string) => conds.find((c) => c.id === id)?.severity;

afterEach(() => vi.restoreAllMocks());

describe('need and exposure drivers', () => {
  it('a creature thinking every 60 ticks starves 60 times as far per think as one thinking every tick', () => {
    const step = (scale: number) => {
      const conds = [{ id: 'malnutrition', severity: 0.5 }];
      driveNeedConditions(conds, { hunger: 100 }, scale);
      return sev(conds, 'malnutrition')! - 0.5;
    };
    expect(step(1)).toBeGreaterThan(0);
    expect(step(60) / step(1)).toBeCloseTo(60, 6);
  });

  it('shelter that doubles recovery thaws hypothermia twice as fast', () => {
    const thaw = (mul: number) => {
      const conds = [{ id: 'hypothermia', severity: 0.5 }];
      driveTemperatureConditions(conds, 0, 0, mul);
      return 0.5 - sev(conds, 'hypothermia')!;
    };
    expect(thaw(1)).toBeGreaterThan(0);
    expect(thaw(2) / thaw(1)).toBeCloseTo(2, 6);
  });

  it('cold between the safe line and onset neither worsens nor eases hypothermia', () => {
    const conds = [{ id: 'hypothermia', severity: 0.5 }];
    driveTemperatureConditions(conds, 50, 0);
    expect(sev(conds, 'hypothermia')).toBe(0.5);
  });
});

describe('load conditions', () => {
  it('encumbrance deepens as the load ratio rises from 1.1 to 1.3', () => {
    const conds: EntityCondition[] = [];
    driveEncumbrance(conds, 1.1);
    expect(sev(conds, 'encumbered')).toBeCloseTo(0.25, 6);
    driveEncumbrance(conds, 1.3);
    expect(sev(conds, 'encumbered')).toBeCloseTo(0.75, 6);
  });
});

describe('shock', () => {
  it('blood loss past 35% brings on hypovolemia, and 35% exactly does not', () => {
    const at = (frac: number) => {
      const conds: EntityCondition[] = [];
      applyShock(conds, 0, frac);
      return sev(conds, 'hypovolemia');
    };
    expect(at(0.35)).toBeUndefined();
    expect(at(0.4)).toBeCloseTo(0.05 / 0.65, 6);
  });

  it('unbearable pain holds shock just short of its lethal end', () => {
    const conds: EntityCondition[] = [];
    applyShock(conds, 500, 0);
    expect(sev(conds, 'pain_shock')).toBe(0.99);
  });
});

describe('condition need multipliers', () => {
  it('advanced malnutrition makes a body hungrier by its stage modifier', () => {
    expect(
      conditionNeedMultipliers([{ id: 'malnutrition', severity: 0.85 }]).hungerRate
    ).toBeCloseTo(1.5, 6);
  });
});

describe('fracture condition', () => {
  it('a broken bone in a missing limb does not count as fractured', () => {
    const limbs = createBodyPlanLimbs('humanoid');
    const bone = skeletonPartOf('leftUpperArm')!;
    const arm = limbs.find((l) => l.parts?.some((p) => p.id === bone))!;
    const part = arm.parts!.find((p) => p.id === bone)!;
    part.injuries.push(recomputeWound(bone, 'fracture', part.maxHp, undefined, 0));
    const whole: EntityCondition[] = [];
    syncFractureConditions(whole, limbs);
    expect(sev(whole, 'fractured')).toBeGreaterThan(0);
    arm.isMissing = true;
    const severed = [...whole];
    syncFractureConditions(severed, limbs);
    expect(sev(severed, 'fractured')).toBeUndefined();
  });
});

describe('condition floaters', () => {
  it('a condition whose stage has not changed does not float its label again', () => {
    const push = vi.spyOn(simLog, 'pushCombatText');
    const conds = [{ id: 'infection', severity: 0.3 }];
    emitPersistentConditionFloaters(snapshotConditionStages(conds), conds, 3, 3);
    expect(push).not.toHaveBeenCalled();
    emitPersistentConditionFloaters(
      snapshotConditionStages(conds),
      [{ id: 'infection', severity: 0.6 }],
      3,
      3
    );
    expect(push).toHaveBeenCalledTimes(1);
  });
});
