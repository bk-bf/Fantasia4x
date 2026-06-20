import { describe, it, expect } from 'vitest';
import { PART_DEF_MAP } from '../core/BodyParts';
import { woundById } from '../core/Wounds';
import { pawnStatService } from '../services/PawnStatService';
import { syncFractureConditions } from './PawnStateMachine';
import type { EntityCondition, LimbState, Pawn } from '../core/types';

/**
 * Bone fractures (COMBAT-SYSTEM): heavy/blunt trauma can BREAK a limb's bone — a structural wound that
 * cripples the limb (manipulation/moving + a broken_arm/leg condition crushing STR/DEX) WITHOUT severing
 * it, and a caved-in skull kills outright. These lock the deterministic data + wiring (the RNG fracture
 * roll itself lives in Combat.performAttack).
 */
describe('fracture anatomy + wound data', () => {
  it('skeletal parts carry boneHp (a fraction of maxHp); soft parts do not', () => {
    const forearm = PART_DEF_MAP['leftForearm']!;
    expect(forearm.boneHp).toBeGreaterThan(0);
    expect(forearm.boneHp!).toBeLessThan(forearm.maxHp); // bone breaks before the whole part is destroyed
    expect(PART_DEF_MAP['leftEye']!.boneHp).toBeUndefined(); // eyes have no bone
    expect(PART_DEF_MAP['heart']!.boneHp).toBeUndefined(); // organs have no bone
  });

  it('the skull is a CRITICAL part (its destruction is instant death)', () => {
    expect(PART_DEF_MAP['skull']!.isCritical).toBe(true);
    expect(PART_DEF_MAP['leftForearm']!.isCritical).toBeUndefined();
  });

  it('the fracture wound is structural, painful, slow to heal, and does NOT bleed', () => {
    const f = woundById('fracture')!;
    expect(f.structural).toBe(true);
    expect(f.bleedMod).toBe(0);
    expect(f.healDifficulty).toBeGreaterThan(2); // weeks
    // Blunt crush itself no longer bleeds either (its payoff is raw damage / limb removal).
    expect(woundById('crush')!.bleedMod).toBe(0);
  });
});

describe('broken bone effects', () => {
  const pawnWithBrokenArm = (broken: boolean): Pawn =>
    ({
      id: 'p',
      stats: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        perception: 10,
        intelligence: 10,
        charisma: 10
      },
      limbs: [
        {
          id: 'left_arm',
          health: 100,
          bleedRate: 0,
          parts: [
            {
              id: 'leftForearm',
              health: 100,
              maxHp: 35,
              isMissing: false,
              boneBroken: broken,
              injuries: []
            }
          ]
        },
        { id: 'right_arm', health: 100, bleedRate: 0, parts: [] }
      ]
    }) as unknown as Pawn;

  it('a broken arm bone guts manipulation without the limb being missing', () => {
    const intact = pawnStatService.computeCapacities(pawnWithBrokenArm(false)).manipulation;
    const broken = pawnStatService.computeCapacities(pawnWithBrokenArm(true)).manipulation;
    expect(broken).toBeLessThan(intact);
  });

  it('syncFractureConditions adds broken_arm while a bone is broken and clears it when it knits', () => {
    const conditions: EntityCondition[] = [];
    const limbs = pawnWithBrokenArm(true).limbs as LimbState[];
    syncFractureConditions(conditions, limbs);
    expect(conditions.some((c) => c.id === 'broken_arm')).toBe(true);
    expect(conditions.some((c) => c.id === 'broken_leg')).toBe(false);

    // Bone knits → flag clears → the condition is removed on the next sync.
    limbs[0].parts![0].boneBroken = false;
    syncFractureConditions(conditions, limbs);
    expect(conditions.some((c) => c.id === 'broken_arm')).toBe(false);
  });

  it('the broken_arm condition crushes STR/DEX (core stats), so combat suffers too', () => {
    const broken = pawnWithBrokenArm(true);
    broken.conditions = [{ id: 'broken_arm', severity: 1 }];
    // melee_damage reads STR; with broken_arm crushing strength it must fall below the intact value.
    const intactDmg = pawnStatService.evaluateStat('melee_damage', pawnWithBrokenArm(true));
    const brokenDmg = pawnStatService.evaluateStat('melee_damage', broken);
    expect(brokenDmg).toBeLessThan(intactDmg);
  });
});
