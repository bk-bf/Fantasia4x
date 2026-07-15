import { describe, it, expect } from 'vitest';
import { PART_DEF_MAP, skeletonPartOf } from '$lib/game/core/BodyParts';
import { woundById } from '$lib/game/core/Wounds';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import { syncFractureConditions } from '$lib/game/core/needs';
import type { EntityCondition, LimbState, Pawn } from '$lib/game/core/types';

// Heavy/blunt trauma can break a limb's bone — cripples without severing; the RNG fracture roll itself lives in Combat.performAttack.
describe('fracture anatomy + wound data', () => {
  it('there is ONE bone type: every bone is a hidden skeleton element whose whole HP is its break budget', () => {
    // The forearm is a SOFT segment wrapping its real bone, the ulna (proper anatomy — no `*Bone` names).
    const ulna = PART_DEF_MAP['leftUlna']!;
    expect(ulna.skeleton).toBe(true);
    expect(ulna.boneHp).toBeGreaterThan(0);
    expect(ulna.boneHp!).toBe(ulna.maxHp); // pure bone: whole HP IS the fracture budget
    // The `skull` IS the hidden bone; the `head` is the flesh outer that wraps it.
    const skull = PART_DEF_MAP['skull']!;
    expect(skull.skeleton).toBe(true);
    expect(skull.boneHp!).toBe(skull.maxHp);
    expect(skull.containedIn).toBe('head');
    expect(PART_DEF_MAP['mandible']!.containedIn).toBe('jaw'); // jaw flesh → mandible
    expect(PART_DEF_MAP['head']!.boneHp).toBeUndefined(); // the head flesh is not bone
    expect(PART_DEF_MAP['skullBone']).toBeUndefined(); // the lazy name never exists
    expect(PART_DEF_MAP['leftForearm']!.boneHp).toBeUndefined(); // the flesh segment itself is not bone
    expect(PART_DEF_MAP['leftEye']!.boneHp).toBeUndefined(); // eyes have no bone
    expect(PART_DEF_MAP['heart']!.boneHp).toBeUndefined(); // organs have no bone
  });

  it('the chest is a SOFT wall (no bone); the ribcage beneath it is the skeleton', () => {
    // The chest wraps organs and takes soft-tissue wounds, but it is NOT bone — it can't fracture.
    expect(PART_DEF_MAP['chest']!.boneHp).toBeUndefined();
    expect(PART_DEF_MAP['chest']!.skeleton).toBeUndefined();
    // The ribcage is a distinct internal skeleton: fracture-only (never struck directly) and bone-bearing.
    const ribcage = PART_DEF_MAP['ribcage']!;
    expect(ribcage.skeleton).toBe(true);
    expect(ribcage.boneHp).toBeGreaterThan(0);
    expect(ribcage.hitWeight).toBe(0); // internal — never rolled as a direct hit, so no cut/puncture/crush
    expect(ribcage.containedIn).toBe('chest'); // severed with the chest
  });

  it('a hit FRACTURES the skeleton: the flesh part routes its fracture to the bone it wraps', () => {
    expect(skeletonPartOf('chest')).toBe('ribcage'); // torso wall → ribcage
    expect(skeletonPartOf('leftForearm')).toBe('leftUlna'); // arm flesh → ulna
    expect(skeletonPartOf('leftFoot')).toBe('leftMetatarsus'); // foot flesh → metatarsus
    expect(skeletonPartOf('head')).toBe('skull'); // head flesh → skull (the bone keeps its name)
    expect(skeletonPartOf('abdomen')).toBeUndefined(); // soft, boneless → can't fracture
    expect(skeletonPartOf('leftEye')).toBeUndefined();
  });

  it('no BONE is instant-death: a broken skull/ribcage cripples, only tearing the flesh container kills', () => {
    // Bones are never `critical` — death comes from destroying the flesh container holding the vital organ.
    expect(PART_DEF_MAP['skull']!.isCritical).toBeUndefined();
    expect(PART_DEF_MAP['ribcage']!.isCritical).toBeUndefined();
    expect(PART_DEF_MAP['leftForearm']!.isCritical).toBeUndefined();
    // The only `critical` part is a vital CORE (the amorphous essence), not a bone.
    expect(PART_DEF_MAP['essence']!.isCritical).toBe(true);
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
    // The ulna's whole maxHp (35) is the break budget, so 35 damage = fully broken.
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
    expect(c!.severity).toBe(1); // fully broken = max severity

    // A hairline crack (low damage) → graded LOW severity.
    limbs[0].parts![0].injuries[0].damage = 5;
    syncFractureConditions(conditions, limbs);
    expect(conditions.find((x) => x.id === 'fractured')!.severity).toBeCloseTo(5 / 35, 2);

    // Heals away → condition removed.
    limbs[0].parts![0].injuries = [];
    syncFractureConditions(conditions, limbs);
    expect(conditions.some((x) => x.id === 'fractured')).toBe(false);
  });

  it('the `fractured` condition crushes STR/DEX (core stats), so combat suffers too', () => {
    const broken = pawnWithBrokenArm(true);
    broken.conditions = [{ id: 'fractured', severity: 1 }];
    // melee_damage reads STR; with the fracture crushing strength it must fall below the intact value.
    const intactDmg = pawnStatService.evaluateStat('melee_damage', pawnWithBrokenArm(true));
    const brokenDmg = pawnStatService.evaluateStat('melee_damage', broken);
    expect(brokenDmg).toBeLessThan(intactDmg);
  });
});
