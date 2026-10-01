import { describe, it, expect, beforeEach } from 'vitest';
import { generatePawns, TALENTED_STAT_COUNT } from '$lib/game/entities/Pawns';
import { generateCulturePool } from '$lib/game/core/gen/culture';
import { CORE_STAT_KEYS } from '$lib/game/core/types';
import { rng } from '$lib/game/core/util/rng';

beforeEach(() => rng.reseed(20260918));

function population(count: number) {
  const cultures = generateCulturePool(6);
  return cultures.flatMap((culture) => generatePawns(culture, Math.ceil(count / cultures.length)));
}

describe('talent stars', () => {
  it('gives every pawn three talented stats drawn from the six core stats', () => {
    for (const pawn of population(300)) {
      const talented = Object.keys(pawn.talentStars ?? {});
      expect(talented.length).toBe(TALENTED_STAT_COUNT);
      for (const stat of talented) expect(CORE_STAT_KEYS).toContain(stat);
    }
  });

  it('gives each talented stat one, two or three stars at about 60/30/10', () => {
    const counts = [0, 0, 0, 0];
    let total = 0;
    for (const pawn of population(2400)) {
      for (const stars of Object.values(pawn.talentStars ?? {})) {
        expect(stars).toBeGreaterThanOrEqual(1);
        expect(stars).toBeLessThanOrEqual(3);
        counts[stars]++;
        total++;
      }
    }
    expect(total).toBeGreaterThan(6000);
    expect(counts[1] / total).toBeCloseTo(0.6, 1);
    expect(counts[2] / total).toBeCloseTo(0.3, 1);
    expect(counts[3] / total).toBeCloseTo(0.1, 1);
  });

  it('leaves the other three stats untalented', () => {
    for (const pawn of population(300)) {
      const untalented = CORE_STAT_KEYS.filter((stat) => !(pawn.talentStars ?? {})[stat]);
      expect(untalented.length).toBe(CORE_STAT_KEYS.length - TALENTED_STAT_COUNT);
    }
  });

  it('spreads talent across all six stats over a population', () => {
    const seen = new Set<string>();
    for (const pawn of population(600))
      for (const stat of Object.keys(pawn.talentStars ?? {})) seen.add(stat);
    expect(seen.size).toBe(CORE_STAT_KEYS.length);
  });
});
