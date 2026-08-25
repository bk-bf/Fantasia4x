import { describe, it, expect } from 'vitest';
import { PART_DEF_MAP, skeletonPartOf } from '$lib/game/core/defs/bodyParts';
import { woundById } from '$lib/game/core/defs/wounds';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import { syncFractureConditions } from '$lib/game/core/rules/body/conditions';
import type { EntityCondition, LimbState, Pawn } from '$lib/game/core/types';

describe('fracture anatomy + wound data', () => {
  it('there is ONE bone type: every bone is a hidden skeleton element whose whole HP is its break budget', () => {
    const ulna = PART_DEF_MAP['leftUlna']!;
    expect(ulna.skeleton).toBe(true);
    expect(ulna.boneHp).toBeGreaterThan(0);
    expect(ulna.boneHp!).toBe(ulna.maxHp);
    const skull = PART_DEF_MAP['skull']!;
    expect(skull.skeleton).toBe(true);
    expect(skull.boneHp!).toBe(skull.maxHp);
    expect(skull.containedIn).toBe('head');
    expect(PART_DEF_MAP['mandible']!.containedIn).toBe('jaw');
    expect(PART_DEF_MAP['head']!.boneHp).toBeUndefined();
    expect(PART_DEF_MAP['skullBone']).toBeUndefined();
    expect(PART_DEF_MAP['leftForearm']!.boneHp).toBeUndefined();
    expect(PART_DEF_MAP['leftEye']!.boneHp).toBeUndefined();
    expect(PART_DEF_MAP['heart']!.boneHp).toBeUndefined();
  });

  it('the chest is a SOFT wall (no bone); the ribcage beneath it is the skeleton', () => {
    expect(PART_DEF_MAP['chest']!.boneHp).toBeUndefined();
    expect(PART_DEF_MAP['chest']!.skeleton).toBeUndefined();
    const ribcage = PART_DEF_MAP['ribcage']!;
    expect(ribcage.skeleton).toBe(true);
    expect(ribcage.boneHp).toBeGreaterThan(0);
    expect(ribcage.hitWeight).toBe(0);
    expect(ribcage.containedIn).toBe('chest');
  });

  it('a hit FRACTURES the skeleton: the flesh part routes its fracture to the bone it wraps', () => {
    expect(skeletonPartOf('chest')).toBe('ribcage');
    expect(skeletonPartOf('leftForearm')).toBe('leftUlna');
    expect(skeletonPartOf('leftFoot')).toBe('leftMetatarsus');
    expect(skeletonPartOf('head')).toBe('skull');
    expect(skeletonPartOf('abdomen')).toBeUndefined();
    expect(skeletonPartOf('leftEye')).toBeUndefined();
  });

  it('no BONE is instant-death: a broken skull/ribcage cripples, only tearing the flesh container kills', () => {
    expect(PART_DEF_MAP['skull']!.isCritical).toBeUndefined();
    expect(PART_DEF_MAP['ribcage']!.isCritical).toBeUndefined();
    expect(PART_DEF_MAP['leftForearm']!.isCritical).toBeUndefined();
    expect(PART_DEF_MAP['essence']!.isCritical).toBe(true);
  });

  it('the fracture wound is structural, painful, slow to heal, and does NOT bleed', () => {
    const f = woundById('fracture')!;
    expect(f.structural).toBe(true);
    expect(f.bleedMod).toBe(0);
    expect(f.healDifficulty).toBeGreaterThan(2);
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
              id: 'leftUlna',
              health: 35,
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

  it('syncFractureConditions drives a GRADED `fractured` condition from bone damage, clearing on heal', () => {
    const conditions: EntityCondition[] = [];
    const limbs = [
      {
        id: 'left_arm',
        health: 100,
        bleedRate: 0,
        parts: [
          {
            id: 'leftUlna',
            health: 35,
            maxHp: 35,
            isMissing: false,
            injuries: [
              {
                bodyPart: 'leftUlna',
                type: 'fracture',
                severity: 'serious',
                damage: 35,
                bleeding: 0,
                painContribution: 0,
                infected: false
              }
            ]
          }
        ]
      }
    ] as unknown as LimbState[];
    syncFractureConditions(conditions, limbs);
    const c = conditions.find((x) => x.id === 'fractured');
    expect(c).toBeDefined();
    expect(c!.severity).toBe(1);

    limbs[0].parts![0].injuries[0].damage = 5;
    syncFractureConditions(conditions, limbs);
    expect(conditions.find((x) => x.id === 'fractured')!.severity).toBeCloseTo(5 / 35, 2);

    limbs[0].parts![0].injuries = [];
    syncFractureConditions(conditions, limbs);
    expect(conditions.some((x) => x.id === 'fractured')).toBe(false);
  });

  it('the `fractured` condition crushes STRENGTH/DEXTERITY (core stats), so combat suffers too', () => {
    const broken = pawnWithBrokenArm(true);
    broken.conditions = [{ id: 'fractured', severity: 1 }];
    const intactDmg = pawnStatService.evaluateStat('melee_damage', pawnWithBrokenArm(true));
    const brokenDmg = pawnStatService.evaluateStat('melee_damage', broken);
    expect(brokenDmg).toBeLessThan(intactDmg);
  });
});
