import { describe, it, expect } from 'vitest';
import {
  createBodyPlanLimbs,
  rollBodyPart,
  parentLimbOf,
  enabledNaturalWeapons,
  lethalAnatomyCause,
  BOUND_NATURAL_WEAPONS,
  PART_DEF_MAP,
  DEFAULT_PLAN
} from './BodyParts';
import { rng } from './rng';

/**
 * Body plans (limbmap.jsonc): each creature category gets an anatomy that fits it — a wolf carries paws
 * + a tail, not a humanoid's fingers/toes — and per-limb HP scales with bodyScale (the map supplies
 * STRUCTURE + default sizes only; it never sets the blood pool).
 */
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
    expect(partIds.some((p) => /Finger|Toe/.test(p))).toBe(false); // no humanoid digits on a beast
  });

  it('each plan still carries the core organs so the capacity model resolves', () => {
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
      expect(partIds).toContain('brain');
      expect(partIds).toContain('heart');
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
    // both reuse the same shared leg segment (declared on the quadruped plan).
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
    // health is seeded to the scaled maxHp (full).
    expect(paw(big).health).toBe(paw(big).maxHp);
  });

  it('rollBodyPart respects the plan — a quadruped never rolls a humanoid finger', () => {
    rng.reseed(7);
    const planParts = new Set(
      Object.values(
        // every outer part of the quadruped plan
        createBodyPlanLimbs('quadruped', 1).flatMap((l) => l.parts!.map((p) => p.id))
      )
    );
    for (let i = 0; i < 500; i++) {
      const part = rollBodyPart('quadruped');
      expect(planParts.has(part)).toBe(true);
      expect(/Finger|Toe/.test(part)).toBe(false);
    }
  });

  it('parentLimbOf resolves a part to its limb within a plan', () => {
    expect(parentLimbOf('humanoid', 'leftHand')).toBe('left_arm');
    expect(parentLimbOf('quadruped', 'frontLeftPaw')).toBe('front_left_leg');
    expect(parentLimbOf('quadruped', 'tail')).toBe('tail');
  });

  it('skull stays a critical, bone-bearing part across the rebuild', () => {
    expect(PART_DEF_MAP['skull']!.isCritical).toBe(true);
    expect(PART_DEF_MAP['skull']!.boneHp).toBeGreaterThan(0);
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
      expect(wc.has('kick')).toBe(false); // → attacker falls back to thrash
    });

    it('natural armour is distributed per part (armoured trunk, soft belly, exposed eyes); every rollable part has a share', () => {
      const chest = PART_DEF_MAP['chest']!.armor!;
      const belly = PART_DEF_MAP['abdomen']!.armor!;
      const eye = PART_DEF_MAP['leftEye']!.armor!;
      expect(chest).toBeGreaterThan(belly); // soft belly is a weak spot
      expect(belly).toBeGreaterThan(eye); // eyes barely armoured
      expect(PART_DEF_MAP['cephalothorax']!.armor).toBe(1.0); // chitin carapace
      // Every part that can be ROLLED as a hit location carries an armour share (no gaps).
      for (const def of Object.values(PART_DEF_MAP)) {
        if (def && def.hitWeight > 0) expect(typeof def.armor).toBe('number');
      }
    });

    it("a quadruped that loses its mouth can't bite but still claws with a surviving paw", () => {
      // bite comes from the whole mouth (jaw + snout); destroy both to lose it.
      const limbs = markMissing(createBodyPlanLimbs('quadruped', 1), [
        'jaw',
        'snout',
        'frontLeftPaw'
      ]);
      const w = enabledNaturalWeapons(limbs);
      expect(w.has('bite')).toBe(false); // mouth gone
      expect(w.has('claw')).toBe(true); // the OTHER front paw still claws
    });
  });
});

/**
 * Lethal anatomy — the SINGLE death rule shared by combat + the per-tick pawn/mob reapers. Regression
 * for the "heart-and-lungs-gone jackal still walking around" report: a CRUSHED vital organ (HP driven
 * to 0 without being severed) must be lethal, which the old `isMissing`-only / head-`isCritical`-only
 * checks missed.
 */
describe('lethalAnatomyCause', () => {
  const torsoOf = (limbs: ReturnType<typeof createBodyPlanLimbs>) =>
    limbs.find((l) => l.id === 'torso')!;

  it('a full-health body is not lethal', () => {
    expect(lethalAnatomyCause(createBodyPlanLimbs(DEFAULT_PLAN, 1))).toBeNull();
  });

  it('a CRUSHED heart (0 HP, NOT severed) is lethal — the jackal bug', () => {
    const limbs = createBodyPlanLimbs(DEFAULT_PLAN, 1);
    const heart = torsoOf(limbs).parts!.find((p) => p.id === 'heart')!;
    heart.health = 0; // caved in by crush, isMissing stays false
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
    // Finn's case: chest (container of the heart) beaten to 0 by mixed wounds, heart never zeroed by
    // the cascade (loaded from a pre-fix save / reaper path), torso aggregate still > 0.
    const limbs = createBodyPlanLimbs(DEFAULT_PLAN, 1);
    const torso = torsoOf(limbs);
    const chest = torso.parts!.find((p) => p.id === 'chest')!;
    const heart = torso.parts!.find((p) => p.id === 'heart')!;
    chest.health = 0; // caved in, not severed
    expect(chest.isMissing).toBe(false);
    expect(heart.health).toBeGreaterThan(0); // heart still pristine
    expect(torso.health).toBeGreaterThan(0); // aggregate still alive
    expect(lethalAnatomyCause(limbs)).toBe('critical_limb');
  });

  it('the ABDOMEN at 0 HP is NOT on its own lethal (it contains no vital organ)', () => {
    const limbs = createBodyPlanLimbs(DEFAULT_PLAN, 1);
    torsoOf(limbs).parts!.find((p) => p.id === 'abdomen')!.health = 0;
    expect(lethalAnatomyCause(limbs)).toBeNull();
  });
});
