import { describe, it, expect } from 'vitest';
import {
  healLimbs,
  makeScarInjury,
  recomputeWound,
  recomputeWoundInPlace,
  rollWoundClotting,
  severityFromFrac,
  SCARRING_CONFIG
} from '$lib/game/core/defs/wounds';
import {
  boneBreakBudget,
  createBodyPlanLimbs,
  PART_DEF_MAP,
  skeletonPartOf
} from '$lib/game/core/defs/bodyParts';
import { rng } from '$lib/game/core/util/rng';
import type { BodyPartState, Injury, LimbState } from '$lib/game/core/types';

const partOf = (limbs: LimbState[], id: string): BodyPartState =>
  limbs.flatMap((l) => l.parts ?? []).find((p) => p.id === id)!;

function bodyWith(health: number | null, ...wounds: Injury[]): LimbState[] {
  const limbs = createBodyPlanLimbs('humanoid');
  for (const w of wounds) {
    const part = partOf(limbs, w.bodyPart);
    part.injuries.push(w);
    part.health = health ?? part.health - w.damage;
  }
  return limbs;
}

function scarRate(w: Omit<Injury, 'bodyPart' | 'damage'>, trials = 3000): number {
  rng.reseed(41);
  let scars = 0;
  for (let i = 0; i < trials; i++) {
    const limbs = bodyWith(null, { ...w, bodyPart: 'chest', damage: 0.5 } as Injury);
    const out = healLimbs(limbs, 100, 1, false, true);
    if (partOf(out, 'chest').injuries.some((x) => x.permanent)) scars++;
  }
  return scars / trials;
}

const criticalCut = {
  type: 'cut',
  severity: 'critical',
  bleeding: 0,
  painContribution: 0,
  infected: false
} as const;

describe('wound severity bands', () => {
  it('a wound turns serious at 0.4 of the part and critical at 0.7', () => {
    expect(severityFromFrac(0.3999)).toBe('minor');
    expect(severityFromFrac(0.4)).toBe('serious');
    expect(severityFromFrac(0.6999)).toBe('serious');
    expect(severityFromFrac(0.7)).toBe('critical');
  });
});

describe('scarring on heal', () => {
  it('a well-tended critical cut scars about 30% as often as an untended one', () => {
    const untended = scarRate(criticalCut);
    const tended = scarRate({ ...criticalCut, treatmentQuality: 1 });
    expect(untended).toBeGreaterThan(0.15);
    expect(tended / untended).toBeGreaterThan(0.2);
    expect(tended / untended).toBeLessThan(0.42);
  });

  it('an infected critical burn scars no more often than the chance cap', () => {
    const rate = scarRate({ ...criticalCut, type: 'burn', infected: true });
    expect(rate).toBeGreaterThan(SCARRING_CONFIG.chanceCap - 0.05);
    expect(rate).toBeLessThan(SCARRING_CONFIG.chanceCap + 0.05);
  });

  it('a part holding a scar heals only up to its maximum less the scar', () => {
    const scar = makeScarInjury('chest', 'cut', 'critical', 80);
    const limbs = bodyWith(null, scar, recomputeWound('chest', 'cut', 5, undefined, 0));
    const chest = partOf(limbs, 'chest');
    chest.health = chest.maxHp - 5;
    const out = partOf(healLimbs(limbs, 1, 0, false), 'chest');
    expect(out.health).toBe(chest.maxHp - scar.damage);
  });
});

describe('bone breaks while healing', () => {
  it('a fracture healed down to exactly the bone budget is still broken', () => {
    const bone = skeletonPartOf('leftUpperArm')!;
    const def = PART_DEF_MAP[bone]!;
    const budget = boneBreakBudget(def, def.maxHp);
    const limbs = bodyWith(def.maxHp, recomputeWound(bone, 'fracture', budget + 1, undefined, 0));
    const humerus = partOf(healLimbs(limbs, 4, 0, false), bone);
    expect(humerus.injuries[0].damage).toBe(budget);
    expect(humerus.boneBroken).toBe(true);
  });
});

describe('clotting', () => {
  it('a tended wound is never rolled for clotting', () => {
    const w = { ...recomputeWound('chest', 'cut', 40, undefined, 0), treatedAt: 0, bleeding: 1 };
    const limbs = bodyWith(null, w);
    expect(rollWoundClotting(limbs, 1, 5)).toBe(false);
    expect(partOf(limbs, 'chest').injuries[0].clotProgress ?? 0).toBe(0);
  });
});

describe('recomputeWoundInPlace', () => {
  it('a severed stump bleeds at the 2.5× stump rate', () => {
    const w = recomputeWound('chest', 'cut', 10, undefined, 0);
    recomputeWoundInPlace(w, 80, 3);
    expect(w.severity).toBe('destroyed');
    expect(w.bleeding).toBeCloseTo(0.12 * 32 * 2.5, 2);
  });

  it('stamps when a wound was inflicted only if it was never stamped', () => {
    const fresh = { ...recomputeWound('chest', 'cut', 10, undefined, 0), inflictedAt: undefined };
    recomputeWoundInPlace(fresh, 12, 77);
    expect(fresh.inflictedAt).toBe(77);
    recomputeWoundInPlace(fresh, 14, 90);
    expect(fresh.inflictedAt).toBe(77);
  });
});
