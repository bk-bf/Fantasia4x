import { describe, it, expect, beforeEach } from 'vitest';
import { generateRace, drawPawnTraits, pawnMeetsRequires, TRAIT_DATABASE } from './Race';
import { generateColonyPawns } from '../entities/Pawns';
import { generateRacePool } from './Race';
import { rng } from './rng';
import type { Trait } from './types';

const byId = (id: string) => TRAIT_DATABASE.find((t) => t.id === id)!;

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

  it('physique gate (ADR-028 requires): a build too heavy/light is refused the contradictory trait', () => {
    const gaunt = byId('gaunt'); // requires maxBuild 0.55 (lean)
    const stocky = byId('stocky'); // requires minBuild 0.50 (broad)
    const sturdy = byId('sturdy'); // no requires → always allowed
    const elephant = { weight: 249, height: 270 }; // build ≈ 0.92 — heavyset
    const wisp = { weight: 40, height: 180 }; // build ≈ 0.22 — very lean

    expect(pawnMeetsRequires(gaunt, elephant)).toBe(false); // a 250 kg mass is never "wasted, spare"
    expect(pawnMeetsRequires(gaunt, wisp)).toBe(true);
    expect(pawnMeetsRequires(stocky, wisp)).toBe(false); // a wisp is never "short, broad"
    expect(pawnMeetsRequires(stocky, elephant)).toBe(true);
    expect(pawnMeetsRequires(sturdy, elephant)).toBe(true); // no gate
    expect(pawnMeetsRequires(gaunt, undefined)).toBe(true); // no physique → no gate (back-compat)
  });

  it('end-to-end: no generated pawn is BOTH gaunt and clearly heavyset', () => {
    const pool = generateRacePool(20);
    for (let i = 0; i < 40; i++) {
      for (const p of generateColonyPawns(pool, 5)) {
        if (!p.traits.some((t) => t.id === 'gaunt')) continue;
        const build = p.physicalTraits.weight / p.physicalTraits.height;
        // Gate reads the BASE build; a co-drawn heavy-boned adds ≤8 kg, so allow a small margin.
        expect(build).toBeLessThan(0.6);
      }
    }
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
