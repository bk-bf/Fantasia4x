import { describe, it, expect, beforeEach } from 'vitest';
import { generateRace, drawPawnTraits } from './Race';
import { rng } from './rng';
import type { Trait } from './types';

/**
 * ADR-028 FLAW layer: negative-rarity traits are an individual Gaussian-COUNT layer — most pawns carry
 * none/one, a rare wretch up to four — and they NEVER appear as a race's identity or variety pool.
 */
describe('negative-trait (flaw) layer', () => {
  beforeEach(() => rng.reseed(20260707));

  it('a race never carries a flaw in its identity or variety pool (flaws are individual)', () => {
    for (let i = 0; i < 60; i++) {
      const race = generateRace();
      for (const t of [...race.guaranteedTraits, ...race.racialTraitPool])
        expect(t.rarity, `${race.name} pool trait ${t.id} is a flaw`).not.toBe('negative');
    }
  });

  it('flaw COUNT follows a low-mean bell curve, capped at 4, with most pawns clean', () => {
    const race = generateRace();
    const counts: number[] = [];
    for (let i = 0; i < 4000; i++) {
      const traits: Trait[] = drawPawnTraits(race);
      counts.push(traits.filter((t) => t.rarity === 'negative').length);
    }
    const max = Math.max(...counts);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const zero = counts.filter((c) => c === 0).length / counts.length;
    const four = counts.filter((c) => c === 4).length / counts.length;

    expect(max).toBeLessThanOrEqual(4); // hard cap
    expect(mean).toBeGreaterThan(0.4); // flaws do happen
    expect(mean).toBeLessThan(1.4); // …but the average pawn is nearly clean
    expect(zero).toBeGreaterThan(0.25); // a solid chunk carry none
    expect(four).toBeLessThan(0.06); // four flaws is a rare wretch
  });

  it('drawn flaws honour conflict groups (no dense + brittle bones on one pawn)', () => {
    const race = generateRace();
    for (let i = 0; i < 2000; i++) {
      const ids = new Set(drawPawnTraits(race).map((t) => t.id));
      expect(ids.has('brittle-boned') && (ids.has('heavy-boned') || ids.has('stone-bones'))).toBe(false);
      expect(ids.has('night-blind') && (ids.has('night-owl') || ids.has('nocturnal'))).toBe(false);
    }
  });
});
