import { describe, it, expect } from 'vitest';
import {
  createBodyPlanLimbs,
  createDefaultBodyParts,
  rollBodyPart,
  rollBodyPartOf,
  parentLimbOf,
  enabledNaturalWeapons,
  lethalAnatomyCause,
  organsOf,
  containedParts,
  cascadeSeveredContents,
  boneBreakBudget,
  BONE_FRACTION,
  BOUND_NATURAL_WEAPONS,
  PART_DEF_MAP,
  DEFAULT_PLAN
} from '$lib/game/core/defs/bodyParts';
import { rng } from '$lib/game/core/util/rng';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import type { BodyPartState, LimbState, Mob } from '$lib/game/core/types';

describe('body plans', () => {
  it('the humanoid plan is the 6-limb arms/legs body with fingers + toes', () => {
    const limbs = createBodyPlanLimbs(DEFAULT_PLAN, 1);
    const ids = limbs.map((l) => l.id).sort();
    expect(ids).toEqual(['head', 'left_arm', 'left_leg', 'right_arm', 'right_leg', 'torso']);
    const partIds = limbs.flatMap((l) => l.parts!.map((p) => p.id));
    expect(partIds).toContain('leftRingFinger');
    expect(partIds).toContain('leftBigToe');
  });

  it('a quadruped has 4 legs + a tail and NO fingers/toes (the bug being fixed)', () => {
    const limbs = createBodyPlanLimbs('quadruped', 1);
    const ids = limbs.map((l) => l.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'front_left_leg',
        'front_right_leg',
        'hind_left_leg',
        'hind_right_leg',
        'tail'
      ])
    );
    expect(ids).not.toContain('left_arm');
    const partIds = limbs.flatMap((l) => l.parts!.map((p) => p.id));
    expect(partIds).toContain('frontLeftPaw');
    expect(partIds.some((p) => /Finger|Toe/.test(p))).toBe(false);
  });

  it('each plan carries a brain-like + heart-like organ so the capacity model resolves', () => {
    for (const plan of [
      'humanoid',
      'quadruped',
      'quadruped_hooved',
      'amphibian',
      'avian',
      'arachnid',
      'serpentine',
      'winged_humanoid'
    ]) {
      const partIds = createBodyPlanLimbs(plan, 1).flatMap((l) => l.parts!.map((p) => p.id));
      expect(partIds.some((id) => /brain|synganglion/i.test(id))).toBe(true);
      expect(partIds.some((id) => /heart/i.test(id))).toBe(true);
    }
  });

  it('hooved vs clawed quadrupeds differ at the feet (hooves vs paws), sharing leg segments', () => {
    const clawed = createBodyPlanLimbs('quadruped', 1).flatMap((l) => l.parts!.map((p) => p.id));
    const hooved = createBodyPlanLimbs('quadruped_hooved', 1).flatMap((l) =>
      l.parts!.map((p) => p.id)
    );
    expect(clawed).toContain('frontLeftPaw');
    expect(clawed).not.toContain('frontLeftHoof');
    expect(hooved).toContain('frontLeftHoof');
    expect(hooved).not.toContain('frontLeftPaw');
    expect(clawed).toContain('frontLeftShoulder');
    expect(hooved).toContain('frontLeftShoulder');
  });

  it('amphibians have a maw + webbed feet (no humanoid digits)', () => {
    const parts = createBodyPlanLimbs('amphibian', 1).flatMap((l) => l.parts!.map((p) => p.id));
    expect(parts).toContain('maw');
    expect(parts).toContain('frontLeftWebFoot');
    expect(parts.some((p) => /Finger|Toe/.test(p))).toBe(false);
  });

  it('per-limb HP scales with bodyScale (HP = round(default size × bodyScale)); the map sets no HP itself', () => {
    const base = createBodyPlanLimbs('quadruped', 1);
    const big = createBodyPlanLimbs('quadruped', 2);
    const paw = (ls: ReturnType<typeof createBodyPlanLimbs>) =>
      ls.flatMap((l) => l.parts!).find((p) => p.id === 'frontLeftPaw')!;
    expect(big.flatMap((l) => l.parts!).find((p) => p.id === 'frontLeftPaw')!.maxHp).toBe(
      paw(base).maxHp * 2
    );
    expect(paw(big).health).toBe(paw(big).maxHp);
  });

  it('a bodyScale below 1 never rounds a part down to 0 HP (Math.max(1, …) floor)', () => {
    const limbs = createBodyPlanLimbs('humanoid', 0.001);
    const toe = limbs.flatMap((l) => l.parts!).find((p) => p.id === 'leftBigToe')!;
    expect(toe.maxHp).toBe(1);
    expect(toe.health).toBe(1);
  });

  it('createBodyPlanLimbs falls back to the default plan for an unrecognized plan key', () => {
    const fallback = createBodyPlanLimbs('totally-bogus-plan', 1);
    const expected = createBodyPlanLimbs(DEFAULT_PLAN, 1);
    expect(fallback.map((l) => l.id)).toEqual(expected.map((l) => l.id));
    expect(fallback.flatMap((l) => l.parts!.map((p) => p.id))).toEqual(
      expected.flatMap((l) => l.parts!.map((p) => p.id))
    );
  });

  it('rollBodyPart respects the plan — a quadruped never rolls a humanoid finger, and only ever rolls a hittable (hitWeight > 0) part', () => {
    rng.reseed(7);
    const planParts = new Set(
      Object.values(createBodyPlanLimbs('quadruped', 1).flatMap((l) => l.parts!.map((p) => p.id)))
    );
    for (let i = 0; i < 500; i++) {
      const part = rollBodyPart('quadruped');
      expect(planParts.has(part)).toBe(true);
      expect(/Finger|Toe/.test(part)).toBe(false);
      expect(PART_DEF_MAP[part]!.hitWeight).toBeGreaterThan(0);
    }
  });

  it('rollBodyPart falls back to the default plan when given an unrecognized plan key', () => {
    rng.reseed(13);
    const defaultOuterIds = new Set(
      createBodyPlanLimbs(DEFAULT_PLAN, 1)
        .flatMap((l) => l.parts!.map((p) => p.id))
        .filter((id) => PART_DEF_MAP[id]!.hitWeight > 0)
    );
    for (let i = 0; i < 200; i++) {
      expect(defaultOuterIds.has(rollBodyPart('totally-bogus-plan'))).toBe(true);
    }
  });

  it('parentLimbOf resolves a part to its limb within a plan', () => {
    expect(parentLimbOf('humanoid', 'leftHand')).toBe('left_arm');
    expect(parentLimbOf('quadruped', 'frontLeftPaw')).toBe('front_left_leg');
    expect(parentLimbOf('quadruped', 'tail')).toBe('tail');
  });

  it('parentLimbOf returns undefined for a part that does not belong to the given plan', () => {
    expect(parentLimbOf('humanoid', 'no-such-part-id')).toBeUndefined();
    expect(parentLimbOf('humanoid', 'frontLeftPaw')).toBeUndefined();
  });

  it('parentLimbOf falls back to the default plan for an unrecognized plan key', () => {
    expect(parentLimbOf('totally-bogus-plan', 'leftHand')).toBe(
      parentLimbOf(DEFAULT_PLAN, 'leftHand')
    );
  });

  it('the skull is the BONE (skeleton), the head is the flesh that holds the brain; a broken skull is not death', () => {
    const skull = PART_DEF_MAP['skull']!;
    expect(skull.skeleton).toBe(true);
    expect(skull.isCritical).toBeUndefined();
    expect(skull.containedIn).toBe('head');
    expect(PART_DEF_MAP['head']!.skeleton).toBeUndefined();
    expect(PART_DEF_MAP['brain']!.containedIn).toBe('head');
    expect(PART_DEF_MAP['brain']!.isVital).toBe(true);
  });

  describe('natural-weapon part binding', () => {
    const markMissing = (limbs: ReturnType<typeof createBodyPlanLimbs>, ids: string[]) => {
      for (const l of limbs) for (const p of l.parts!) if (ids.includes(p.id)) p.isMissing = true;
      return limbs;
    };

    it('weapons are bound to parts (jaw→bite, hands→fists/claw, hooves→kick)', () => {
      expect(PART_DEF_MAP['jaw']!.weapons).toContain('bite');
      expect(PART_DEF_MAP['leftHand']!.weapons).toEqual(expect.arrayContaining(['fists', 'claw']));
      expect(PART_DEF_MAP['hindLeftHoof']!.weapons).toContain('kick');
      expect(BOUND_NATURAL_WEAPONS.has('bite')).toBe(true);
      expect(BOUND_NATURAL_WEAPONS.has('claw')).toBe(true);
    });

    it('a healthy humanoid enables fists (hands), kick (feet) and headbutt (skull)', () => {
      const w = enabledNaturalWeapons(createBodyPlanLimbs('humanoid', 1));
      expect(w.has('fists')).toBe(true);
      expect(w.has('kick')).toBe(true);
      expect(w.has('headbutt')).toBe(true);
    });

    it('losing both hands drops fists but keeps kick; losing the feet too leaves no bound weapon', () => {
      const noHands = markMissing(createBodyPlanLimbs('humanoid', 1), ['leftHand', 'rightHand']);
      const wh = enabledNaturalWeapons(noHands);
      expect(wh.has('fists')).toBe(false);
      expect(wh.has('kick')).toBe(true);

      const crippled = markMissing(noHands, ['leftFoot', 'rightFoot', 'skull']);
      const wc = enabledNaturalWeapons(crippled);
      expect(wc.has('fists')).toBe(false);
      expect(wc.has('kick')).toBe(false);
    });

    it('natural armour is distributed per part (armoured trunk, soft belly, exposed eyes); every rollable part has a share', () => {
      const chest = PART_DEF_MAP['chest']!.armor!;
      const belly = PART_DEF_MAP['abdomen']!.armor!;
      const eye = PART_DEF_MAP['leftEye']!.armor!;
      expect(chest).toBeGreaterThan(belly);
      expect(belly).toBeGreaterThan(eye);
      expect(PART_DEF_MAP['cephalothorax']!.armor).toBe(1.0);
      for (const def of Object.values(PART_DEF_MAP)) {
        if (def && def.hitWeight > 0) expect(typeof def.armor).toBe('number');
      }
    });

    it("a quadruped that loses its mouth can't bite but still claws with a surviving paw", () => {
      const limbs = markMissing(createBodyPlanLimbs('quadruped', 1), [
        'jaw',
        'snout',
        'frontLeftPaw'
      ]);
      const w = enabledNaturalWeapons(limbs);
      expect(w.has('bite')).toBe(false);
      expect(w.has('claw')).toBe(true);
    });
  });
});

describe('lethalAnatomyCause', () => {
  const torsoOf = (limbs: ReturnType<typeof createBodyPlanLimbs>) =>
    limbs.find((l) => l.id === 'torso')!;

  it('a full-health body is not lethal', () => {
    expect(lethalAnatomyCause(createBodyPlanLimbs(DEFAULT_PLAN, 1))).toBeNull();
  });

  it('a CRUSHED heart (0 HP, NOT severed) is lethal — the jackal bug', () => {
    const limbs = createBodyPlanLimbs(DEFAULT_PLAN, 1);
    const heart = torsoOf(limbs).parts!.find((p) => p.id === 'heart')!;
    heart.health = 0;
    expect(heart.isMissing).toBe(false);
    expect(lethalAnatomyCause(limbs)).toBe('critical_limb');
  });

  it('a severed (missing) vital organ is lethal', () => {
    const limbs = createBodyPlanLimbs(DEFAULT_PLAN, 1);
    const heart = torsoOf(limbs).parts!.find((p) => p.id === 'heart')!;
    heart.isMissing = true;
    expect(lethalAnatomyCause(limbs)).toBe('critical_limb');
  });

  it('a non-vital torso part at 0 HP (e.g. a kidney) is NOT on its own lethal', () => {
    const limbs = createBodyPlanLimbs(DEFAULT_PLAN, 1);
    torsoOf(limbs).parts!.find((p) => p.id === 'leftKidney')!.health = 0;
    expect(lethalAnatomyCause(limbs)).toBeNull();
  });

  it('the torso ROOT limb reduced to 0 aggregate HP is lethal', () => {
    const limbs = createBodyPlanLimbs(DEFAULT_PLAN, 1);
    torsoOf(limbs).health = 0;
    expect(lethalAnatomyCause(limbs)).toBe('critical_limb');
  });

  it('a CHEST caved to 0 HP is lethal even with a still-intact heart — the walking-corpse bug', () => {
    const limbs = createBodyPlanLimbs(DEFAULT_PLAN, 1);
    const torso = torsoOf(limbs);
    const chest = torso.parts!.find((p) => p.id === 'chest')!;
    const heart = torso.parts!.find((p) => p.id === 'heart')!;
    chest.health = 0;
    expect(chest.isMissing).toBe(false);
    expect(heart.health).toBeGreaterThan(0);
    expect(torso.health).toBeGreaterThan(0);
    expect(lethalAnatomyCause(limbs)).toBe('critical_limb');
  });

  it('the ABDOMEN at 0 HP is NOT on its own lethal (it contains no vital organ)', () => {
    const limbs = createBodyPlanLimbs(DEFAULT_PLAN, 1);
    torsoOf(limbs).parts!.find((p) => p.id === 'abdomen')!.health = 0;
    expect(lethalAnatomyCause(limbs)).toBeNull();
  });
});

describe('species-specific organ + weapon wiring', () => {
  const kill = (
    limbs: ReturnType<typeof createBodyPlanLimbs>,
    pred: (id: string) => boolean
  ): ReturnType<typeof createBodyPlanLimbs> => {
    for (const l of limbs)
      for (const p of l.parts!)
        if (pred(p.id)) {
          p.isMissing = true;
          p.health = 0;
        }
    return limbs;
  };
  const entity = (limbs: ReturnType<typeof createBodyPlanLimbs>): Mob =>
    ({
      limbs,
      injuries: [],
      conditions: [],
      stats: { strength: 12, dexterity: 12, constitution: 10, intelligence: 8, perception: 10 },
      bloodVolume: 100,
      maxBloodVolume: 100
    }) as unknown as Mob;

  it('ADR-031: the neck holds an unclottable carotid the organ roll can find (across beast plans)', () => {
    for (const plan of ['humanoid', 'quadruped', 'avian', 'amphibian', 'serpentine']) {
      const parts = createBodyPlanLimbs(plan, 1).flatMap((l) => l.parts!.map((p) => p.id));
      expect(parts).toContain('neck');
      expect(parts).toContain('carotidArtery');
    }
    expect(organsOf('neck')).toContain('carotidArtery');
    expect(PART_DEF_MAP['carotidArtery']!.artery).toBe(true);
    expect(PART_DEF_MAP['carotidArtery']!.isVital).toBe(false);
  });

  it('ADR-031: the humanoid groin holds an unclottable femoral artery', () => {
    const parts = createBodyPlanLimbs('humanoid', 1).flatMap((l) => l.parts!.map((p) => p.id));
    expect(parts).toContain('groin');
    expect(organsOf('groin')).toContain('femoralArtery');
    expect(PART_DEF_MAP['femoralArtery']!.artery).toBe(true);
  });

  it('a viper carries venom glands + kidneys, with venom_bite bound to the glands (not the fangs)', () => {
    const parts = createBodyPlanLimbs('serpentine', 1).flatMap((l) => l.parts!.map((p) => p.id));
    expect(parts.filter((id) => /venomGland/i.test(id)).length).toBe(2);
    expect(parts.filter((id) => /kidney/i.test(id)).length).toBe(2);
    expect(parts).not.toContain('spine');
    expect(PART_DEF_MAP['fangs']!.weapons).toEqual(['bite']);
    expect(PART_DEF_MAP['leftVenomGland']!.weapons).toContain('venom_bite');
  });

  it("destroying a viper's venom glands takes the venomous bite — a plain bite remains on the fangs", () => {
    const intact = enabledNaturalWeapons(createBodyPlanLimbs('serpentine', 1));
    expect(intact.has('venom_bite')).toBe(true);
    expect(intact.has('bite')).toBe(true);
    const deglanded = enabledNaturalWeapons(
      kill(createBodyPlanLimbs('serpentine', 1), (id) => /venomGland/i.test(id))
    );
    expect(deglanded.has('venom_bite')).toBe(false);
    expect(deglanded.has('bite')).toBe(true);
  });

  it("the snake's kidneys drive blood_filtration (no longer a silent 100%)", () => {
    const full = pawnStatService.computeCapacities(
      entity(createBodyPlanLimbs('serpentine', 1))
    ).blood_filtration;
    const noKidney = pawnStatService.computeCapacities(
      entity(kill(createBodyPlanLimbs('serpentine', 1), (id) => /kidney/i.test(id)))
    ).blood_filtration;
    expect(full).toBeCloseTo(1.0);
    expect(noKidney).toBeCloseTo(0.0);
  });

  it('an amorphous body (grimeling) can claw — its outer mass enables the weapon (no dead-weapon thrash)', () => {
    const w = enabledNaturalWeapons(createBodyPlanLimbs('amorphous', 1));
    expect(w.has('claw')).toBe(true);
    expect(w.has('spectral_strike')).toBe(true);
  });
});

describe('boneBreakBudget', () => {
  it('a skeleton part spends its whole scaled max HP as break budget', () => {
    const ulna = PART_DEF_MAP['leftUlna'];
    expect(ulna?.skeleton).toBe(true);
    expect(boneBreakBudget(ulna, 70)).toBe(70);
  });

  it('a non-skeleton (flesh) part only spends BONE_FRACTION of its scaled max HP', () => {
    const forearm = PART_DEF_MAP['leftForearm'];
    expect(forearm?.skeleton).toBeUndefined();
    expect(boneBreakBudget(forearm, 70)).toBeCloseTo(BONE_FRACTION * 70);
  });
});

describe('containedParts', () => {
  it('walks the containment tree transitively across multiple levels, excluding the parent itself', () => {
    const contained = containedParts('leftWing');
    expect(contained.has('leftWing')).toBe(false);
    expect(contained.has('leftWingHumerus')).toBe(true);
    expect(contained.has('leftWingtip')).toBe(true);
    expect(contained.has('leftCarpometacarpus')).toBe(true);
    expect(contained.has('leftWingClaw')).toBe(true);
    expect(contained.has('leftWingPhalanx')).toBe(true);
  });

  it('a leaf part with nothing contained in it returns an empty set', () => {
    expect(containedParts('leftCarpometacarpus').size).toBe(0);
  });
});

describe('cascadeSeveredContents', () => {
  const partState = (id: string, isMissing = false): BodyPartState => ({
    id,
    health: 10,
    maxHp: 10,
    isMissing,
    injuries: []
  });

  it('severing a container that holds a live vital organ destroys it and reports lostVital', () => {
    const parts = [
      partState('chest'),
      partState('heart'),
      partState('leftLung'),
      partState('rightLung'),
      partState('ribcage')
    ];
    const { parts: next, lostVital } = cascadeSeveredContents(parts, 'chest');
    expect(lostVital).toBe(true);
    const heart = next.find((p) => p.id === 'heart')!;
    expect(heart.isMissing).toBe(true);
    expect(heart.health).toBe(0);
  });

  it('severing a container whose contents are all non-vital reports lostVital false', () => {
    const parts = [
      partState('abdomen'),
      partState('liver'),
      partState('stomach'),
      partState('leftKidney'),
      partState('rightKidney')
    ];
    const { parts: next, lostVital } = cascadeSeveredContents(parts, 'abdomen');
    expect(lostVital).toBe(false);
    expect(next.find((p) => p.id === 'liver')!.isMissing).toBe(true);
  });

  it('is a no-op identity return when the container has children but none of them are still alive', () => {
    const parts = [
      partState('chest'),
      partState('heart', true),
      partState('leftLung', true),
      partState('rightLung', true),
      partState('ribcage', true)
    ];
    const result = cascadeSeveredContents(parts, 'chest');
    expect(result.parts).toBe(parts);
    expect(result.lostVital).toBe(false);
  });
});

describe('rollBodyPartOf', () => {
  it('never rolls a part that is missing or lives on a missing limb', () => {
    const limbs = createBodyPlanLimbs('humanoid', 1);
    limbs.flatMap((l) => l.parts!).find((p) => p.id === 'leftHand')!.isMissing = true;
    rng.reseed(19);
    for (let i = 0; i < 2000; i++) {
      expect(rollBodyPartOf(limbs, 'humanoid')).not.toBe('leftHand');
    }
  });

  it('can roll a part that is present on the body but outside the plan set, when it has hitWeight > 0', () => {
    const limbs: LimbState[] = [
      {
        id: 'front_left_leg',
        health: 100,
        isMissing: false,
        bleedRate: 0,
        parts: [
          {
            id: 'frontLeftPaw',
            health: 22,
            maxHp: 22,
            isMissing: false,
            injuries: []
          }
        ]
      }
    ];
    rng.reseed(23);
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i++) seen.add(rollBodyPartOf(limbs, 'humanoid'));
    expect(seen.has('frontLeftPaw')).toBe(true);
  });
});

describe('createDefaultBodyParts', () => {
  it('returns the humanoid plan parts for a known limb, each defaulted to full HP', () => {
    const expectedIds = createBodyPlanLimbs(DEFAULT_PLAN, 1)
      .find((l) => l.id === 'left_arm')!
      .parts!.map((p) => p.id);
    const parts = createDefaultBodyParts('left_arm');
    expect(parts.map((p) => p.id)).toEqual(expectedIds);
    for (const p of parts) {
      const def = PART_DEF_MAP[p.id]!;
      expect(p.health).toBe(def.maxHp);
      expect(p.maxHp).toBe(def.maxHp);
      expect(p.isMissing).toBe(false);
      expect(p.injuries).toEqual([]);
    }
  });

  it('returns an empty array for a limb id absent from the humanoid plan', () => {
    expect(createDefaultBodyParts('front_left_leg')).toEqual([]);
  });
});
