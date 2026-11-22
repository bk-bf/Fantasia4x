import { describe, it, expect } from 'vitest';
import {
  feedOnVictim,
  lineageParentTraits,
  resolveTraitGamble,
  rollLineageTrait
} from '$lib/game/core/defs/lineages';
import { createBodyPlanLimbs } from '$lib/game/core/defs/bodyParts';
import type { Pawn, Trait } from '$lib/game/core/types';

const spec = { tier: 3, traitPool: ['feral-adrenaline', 'pack-fury', 'bestial-might'] };
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++] ?? 0.5;
};
const outcome = (r: number) => {
  const { trait, flaw } = resolveTraitGamble(spec, 0, seq(r));
  return trait && !flaw ? 'good' : trait ? 'mixed' : 'bad';
};

describe('trait gamble bands at tier 3 with no alchemy', () => {
  it('a roll just under 0.15 is bad and a roll of exactly 0.15 is mixed', () => {
    expect(outcome(0.1499)).toBe('bad');
    expect(outcome(0.15)).toBe('mixed');
  });

  it('a roll of 0.6 or more is good and one just under is mixed', () => {
    expect(outcome(0.5999)).toBe('mixed');
    expect(outcome(0.65)).toBe('good');
  });
});

describe('lineage growth', () => {
  it('a lineage hands out only its first-stage traits, never a later stage directly', () => {
    const parent = lineageParentTraits()[0];
    const pawn = { id: 'p', isAlive: true, stats: {}, traits: [parent] } as unknown as Pawn;
    const gained: Trait[] = [];
    for (let i = 0; i < 50; i++) {
      const [next] = rollLineageTrait(pawn, () => 0);
      if (!next) break;
      gained.push(next);
      pawn.traits!.push(next);
    }
    expect(gained.length).toBeGreaterThan(0);
    expect(gained.filter((t) => (t.stage ?? 1) > 1).map((t) => t.id)).toEqual([]);
  });
});

describe('feeding on a victim', () => {
  it('the bite on the neck makes the neck’s limb bleed', () => {
    const victim = {
      id: 'v',
      isAlive: true,
      limbs: createBodyPlanLimbs(),
      bloodVolume: 100,
      maxBloodVolume: 100
    } as unknown as Pawn;
    const feeder = { id: 'f', needs: { bloodHunger: 90 } } as unknown as Pawn;
    feedOnVictim(feeder, victim, 10);
    const limb = victim.limbs!.find((l) => l.parts?.some((p) => p.id === 'neck'))!;
    const neck = limb.parts!.find((p) => p.id === 'neck')!;
    expect(neck.injuries[0].bleeding).toBeGreaterThan(0);
    expect(limb.bleedRate).toBeCloseTo(neck.injuries[0].bleeding, 9);
  });
});
