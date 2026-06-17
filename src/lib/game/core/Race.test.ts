import { describe, it, expect, beforeEach } from 'vitest';
import { generateRace, generateRacePool, generateRaceRelations } from './Race';
import { generateColonyPawns } from '../entities/Pawns';
import { rng } from './rng';

describe('Race overhaul — pool generation', () => {
  beforeEach(() => rng.reseed(20260617));

  it('generateRacePool yields the requested number of races with unique ids', () => {
    const pool = generateRacePool(20);
    expect(pool).toHaveLength(20);
    const ids = new Set(pool.map((r) => r.id));
    expect(ids.size).toBe(20);
  });

  it('every generated race carries a full immersive lore description', () => {
    const pool = generateRacePool(15);
    for (const r of pool) {
      expect(r.archetype).toBeTruthy();
      expect(r.lore.epithet).toBeTruthy();
      // 3–4 sentence paragraph — sanity-check it's real prose, not an empty template.
      expect(r.lore.description.length).toBeGreaterThan(120);
      expect(r.lore.description).toContain(r.name);
      expect(r.racialTraits.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('generateColonyPawns draws a fully-mixed colony, each pawn tagged to a pool race', () => {
    const pool = generateRacePool(18);
    const poolIds = new Set(pool.map((r) => r.id));
    const pawns = generateColonyPawns(pool, 5);
    expect(pawns).toHaveLength(5);
    for (const p of pawns) {
      expect(p.raceId).toBeTruthy();
      expect(poolIds.has(p.raceId!)).toBe(true);
      expect(p.raceName).toBeTruthy();
    }
  });

  it('generateRaceRelations produces a symmetric, fully-connected relation set', () => {
    const pool = generateRacePool(6);
    const rel = generateRaceRelations(pool);
    expect(rel).toHaveLength((6 * 5) / 2); // one per unordered pair
    for (const r of rel) {
      expect(r.score).toBeGreaterThanOrEqual(-100);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(['allied', 'friendly', 'neutral', 'wary', 'hostile']).toContain(r.disposition);
    }
  });

  it('a single generateRace has a unique slug id (no longer the hardcoded "player")', () => {
    const r = generateRace();
    expect(r.id).not.toBe('player');
    expect(r.id).toMatch(/^[a-z0-9-]+$/);
  });
});
