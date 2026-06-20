import { describe, it, expect } from 'vitest';
import {
  createBodyPlanLimbs,
  rollBodyPart,
  parentLimbOf,
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
});
