import { describe, it, expect } from 'vitest';
import { PART_DEF_MAP, skeletonPartOf } from '../core/BodyParts';
import { woundById } from '../core/Wounds';
import { pawnStatService } from '../services/PawnStatService';
import { syncFractureConditions } from '../core/needs';
import type { EntityCondition, LimbState, Pawn } from '../core/types';

/**
 * Bone fractures (COMBAT-SYSTEM): heavy/blunt trauma can BREAK a limb's bone — a structural wound that
 * cripples the limb (manipulation/moving + a graded `fractured` condition crushing STR/DEX) WITHOUT severing
 * it, and a caved-in skull kills outright. These lock the deterministic data + wiring (the RNG fracture
 * roll itself lives in Combat.performAttack).
 */
describe('fracture anatomy + wound data', () => {
  it('there is ONE bone type: every bone is a hidden skeleton element whose whole HP is its break budget', () => {
    // The forearm is a SOFT segment wrapping leftForearmBone — the bone carries the boneHp.
    const forearmBone = PART_DEF_MAP['leftForearmBone']!;
    expect(forearmBone.skeleton).toBe(true);
    expect(forearmBone.boneHp).toBeGreaterThan(0);
    expect(forearmBone.boneHp!).toBe(forearmBone.maxHp); // pure bone: whole HP IS the fracture budget
    // The bone keeps its anatomical name: the `skull` IS the (hidden) bone; the `head` is the flesh outer
    // that wraps it. No more `bone: true`, no backwards `skullBone`.
    const skull = PART_DEF_MAP['skull']!;
    expect(skull.skeleton).toBe(true);
    expect(skull.boneHp!).toBe(skull.maxHp);
    expect(skull.containedIn).toBe('head');
    expect(PART_DEF_MAP['head']!.boneHp).toBeUndefined(); // the head flesh is not bone
    expect(PART_DEF_MAP['skullBone']).toBeUndefined(); // the backwards name is gone
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
    expect(skeletonPartOf('leftForearm')).toBe('leftForearmBone'); // arm flesh → forearm bone
    expect(skeletonPartOf('leftFoot')).toBe('leftFootBone'); // foot flesh → foot bone
    expect(skeletonPartOf('head')).toBe('skull'); // head flesh → skull (the bone keeps its name)
    expect(skeletonPartOf('abdomen')).toBeUndefined(); // soft, boneless → can't fracture
    expect(skeletonPartOf('leftEye')).toBeUndefined();
  });

  it('no BONE is instant-death: a broken skull/ribcage cripples, only tearing the flesh container kills', () => {
    // Bones are never `critical` — breaking one cripples the limb, it does not instantly kill. Death comes
    // from destroying the FLESH container (head/chest) that holds the vital organ (brain/heart).
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
              id: 'leftForearmBone',
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
    // leftForearmBone is a pure skeleton element → its whole maxHp (35) IS the break budget; a 35-damage
    // fracture (HP chipped to 0) is fully broken.
    const limbs = [
      {
        id: 'left_arm',
        health: 100,
        bleedRate: 0,
        parts: [
          {
            id: 'leftForearmBone',
            health: 35,
            maxHp: 35,
            isMissing: false,
            injuries: [
              {
                bodyPart: 'leftForearmBone',
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
