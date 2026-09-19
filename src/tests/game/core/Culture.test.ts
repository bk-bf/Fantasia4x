import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateCulture,
  generateCulturePool,
  generateCultureRelations,
  generateCultureDescription,
  statBucket
} from '$lib/game/core/gen/culture';
import { generateColonyPawns } from '$lib/game/entities/Pawns';
import { rng } from '$lib/game/core/util/rng';
import type { Culture } from '$lib/game/core/types';
import loreData from '$lib/game/database/social/culture-lore.json';

interface Archetype {
  name: string;
  statFocus: string[];
  statDump: string[];
}
const ARCHETYPES = (loreData as unknown as { archetypes: Archetype[] }).archetypes;
const GAIT_PHRASES = (
  loreData as unknown as { phrases: { gait: { quick: string[]; slow: string[] } } }
).phrases.gait;

function makeCulture(dex: number): Culture {
  return {
    id: 'test-culture',
    name: 'Testfolk',
    archetype: 'Test',
    statRanges: {
      strength: [10, 10],
      dexterity: [dex, dex],
      constitution: [10, 10],
      intelligence: [10, 10],
      perception: [10, 10],
      charisma: [10, 10]
    },
    physicalTraits: { heightRange: [150, 190], weightRange: [60, 100], size: 'medium' },
    guaranteedTraits: [],
    culturalTraitPool: [],
    lore: {
      epithet: 'the Testborn',
      origin: 'a test origin',
      homeland: 'the test homeland',
      temperament: 'stoic',
      belief: 'that tests must pass',
      description: ''
    },
    population: 0
  };
}

describe('Culture overhaul — pool generation', () => {
  beforeEach(() => rng.reseed(20260617));

  it('generateCulturePool yields the requested number of cultures with unique ids', () => {
    const pool = generateCulturePool(20);
    expect(pool).toHaveLength(20);
    const ids = new Set(pool.map((r) => r.id));
    expect(ids.size).toBe(20);
  });

  it('every generated culture carries a full immersive lore description', () => {
    const pool = generateCulturePool(15);
    for (const r of pool) {
      expect(r.archetype).toBeTruthy();
      expect(r.lore.epithet).toBeTruthy();
      expect(r.lore.description.length).toBeGreaterThan(120);
      expect(r.lore.description).toContain(r.name);
      expect(r.culturalTraitPool.length).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(r.guaranteedTraits)).toBe(true);
    }
  });

  it('statBucket maps the exact boundary values to their bucket, in strict order', () => {
    expect(statBucket(14)).toBe('mighty');
    expect(statBucket(13.9)).toBe('strong');
    expect(statBucket(12)).toBe('strong');
    expect(statBucket(11.9)).toBe('average');
    expect(statBucket(9.5)).toBe('average');
    expect(statBucket(9.4)).toBe('frail');

    const rank: Record<string, number> = { frail: 0, average: 1, strong: 2, mighty: 3 };
    expect(rank[statBucket(16)]).toBeGreaterThan(rank[statBucket(13)]);
    expect(rank[statBucket(13)]).toBeGreaterThan(rank[statBucket(10)]);
    expect(rank[statBucket(10)]).toBeGreaterThan(rank[statBucket(5)]);
  });

  it('generateCultureDescription picks the dexterity-driven gait phrase (quick vs slow)', () => {
    const quickDesc = generateCultureDescription(makeCulture(16));
    expect(GAIT_PHRASES.quick.some((p) => quickDesc.includes(p)), quickDesc).toBe(true);

    const slowDesc = generateCultureDescription(makeCulture(5));
    expect(GAIT_PHRASES.slow.some((p) => slowDesc.includes(p)), slowDesc).toBe(true);
  });

  it('generateColonyPawns draws a fully-mixed colony, each pawn tagged to a pool culture', () => {
    const pool = generateCulturePool(18);
    const poolIds = new Set(pool.map((r) => r.id));
    const pawns = generateColonyPawns(pool, 5);
    expect(pawns).toHaveLength(5);
    for (const p of pawns) {
      expect(p.cultureId).toBeTruthy();
      expect(poolIds.has(p.cultureId!)).toBe(true);
      expect(p.cultureName).toBeTruthy();
    }
  });

  it('generateCultureRelations produces a symmetric, fully-connected relation set', () => {
    const pool = generateCulturePool(6);
    const rel = generateCultureRelations(pool);
    expect(rel).toHaveLength((6 * 5) / 2);
    for (const r of rel) {
      expect(r.score).toBeGreaterThanOrEqual(-100);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(['allied', 'friendly', 'neutral', 'wary', 'hostile']).toContain(r.disposition);
      if (r.score >= 60) expect(r.disposition, `score ${r.score}`).toBe('allied');
      else if (r.score >= 20) expect(r.disposition, `score ${r.score}`).toBe('friendly');
      else if (r.score > -20) expect(r.disposition, `score ${r.score}`).toBe('neutral');
      else if (r.score > -60) expect(r.disposition, `score ${r.score}`).toBe('wary');
      else expect(r.disposition, `score ${r.score}`).toBe('hostile');
    }
    const pairKeys = rel.map((r) => [r.a, r.b].sort().join('|'));
    expect(new Set(pairKeys).size, 'every unordered pair appears exactly once').toBe(
      pairKeys.length
    );
  });

  it('a single generateCulture has a unique slug id (no longer the hardcoded "player")', () => {
    const r = generateCulture();
    expect(r.id).not.toBe('player');
    expect(r.id).toMatch(/^[a-z0-9-]+$/);
  });

  it('generateCulture(archetype) tags the culture with that archetype and biases its stat ranges', () => {
    const archetype = ARCHETYPES.find((a) => a.statFocus.length > 0 && a.statDump.length > 0)!;
    const culture = generateCulture(archetype as unknown as Parameters<typeof generateCulture>[0]);
    expect(culture.archetype).toBe(archetype.name);

    for (const stat of archetype.statFocus) {
      const [min, max] = culture.statRanges[stat];
      expect(min, `${stat} focus min`).toBeGreaterThanOrEqual(10);
      expect(min, `${stat} focus min`).toBeLessThanOrEqual(15);
      expect(max, `${stat} focus max`).toBeGreaterThanOrEqual(16);
      expect(max, `${stat} focus max`).toBeLessThanOrEqual(20);
    }
    for (const stat of archetype.statDump) {
      const [min, max] = culture.statRanges[stat];
      expect(min, `${stat} dump min`).toBeGreaterThanOrEqual(5);
      expect(min, `${stat} dump min`).toBeLessThanOrEqual(9);
      expect(max, `${stat} dump max`).toBeGreaterThanOrEqual(9);
      expect(max, `${stat} dump max`).toBeLessThanOrEqual(13);
    }
  });
});
