import { describe, it, expect, beforeEach } from 'vitest';
import { generateCulture, generateCulturePool, generateCultureRelations } from './Culture';
import { generateColonyPawns } from '../entities/Pawns';
import { rng } from './rng';

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
      // 3–4 sentence paragraph — sanity-check it's real prose, not an empty template.
      expect(r.lore.description.length).toBeGreaterThan(120);
      expect(r.lore.description).toContain(r.name);
      // ADR-023: a culture has a mundane variety pool each pawn draws from (+ optional identity traits).
      expect(r.culturalTraitPool.length).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(r.guaranteedTraits)).toBe(true);
    }
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
    expect(rel).toHaveLength((6 * 5) / 2); // one per unordered pair
    for (const r of rel) {
      expect(r.score).toBeGreaterThanOrEqual(-100);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(['allied', 'friendly', 'neutral', 'wary', 'hostile']).toContain(r.disposition);
    }
  });

  it('a single generateCulture has a unique slug id (no longer the hardcoded "player")', () => {
    const r = generateCulture();
    expect(r.id).not.toBe('player');
    expect(r.id).toMatch(/^[a-z0-9-]+$/);
  });
});
