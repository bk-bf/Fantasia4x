import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateCulture,
  drawPawnTraits,
  pawnMeetsRequires,
  TRAIT_DATABASE
} from '$lib/game/core/gen/culture';
import { generateColonyPawns } from '$lib/game/entities/Pawns';
import { generateCulturePool } from '$lib/game/core/gen/culture';
import { rng } from '$lib/game/core/util/rng';
import type { Trait } from '$lib/game/core/types';

const byId = (id: string) => TRAIT_DATABASE.find((t) => t.id === id)!;

describe('negative-trait (flaw) layer', () => {
  beforeEach(() => rng.reseed(20260707));

  it('a culture never carries a flaw in its identity or variety pool (flaws are individual)', () => {
    for (let i = 0; i < 60; i++) {
      const culture = generateCulture();
      for (const t of [...culture.guaranteedTraits, ...culture.culturalTraitPool])
        expect(t.rarity, `${culture.name} pool trait ${t.id} is a flaw`).not.toBe('negative');
    }
  });

  it('flaw COUNT follows a low-mean bell curve, capped at 4, with most pawns clean', () => {
    const culture = generateCulture();
    const counts: number[] = [];
    for (let i = 0; i < 4000; i++) {
      const traits: Trait[] = drawPawnTraits(culture);
      counts.push(traits.filter((t) => t.rarity === 'negative').length);
    }
    const max = Math.max(...counts);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const zero = counts.filter((c) => c === 0).length / counts.length;
    const four = counts.filter((c) => c === 4).length / counts.length;

    expect(max).toBeLessThanOrEqual(4);
    expect(mean).toBeGreaterThan(0.4);
    expect(mean).toBeLessThan(1.4);
    expect(zero).toBeGreaterThan(0.25);
    expect(four).toBeLessThan(0.06);
  });

  it('physique gate (ADR-028 requires): a build too heavy/light is refused the contradictory trait', () => {
    const gaunt = byId('gaunt');
    const stocky = byId('stocky');
    const sturdy = byId('sturdy');
    const elephant = { weight: 249, height: 270 };
    const wisp = { weight: 40, height: 180 };

    expect(pawnMeetsRequires(gaunt, elephant)).toBe(false);
    expect(pawnMeetsRequires(gaunt, wisp)).toBe(true);
    expect(pawnMeetsRequires(stocky, wisp)).toBe(false);
    expect(pawnMeetsRequires(stocky, elephant)).toBe(true);
    expect(pawnMeetsRequires(sturdy, elephant)).toBe(true);
    expect(pawnMeetsRequires(gaunt, undefined)).toBe(true);
  });

  it('end-to-end: no generated pawn is BOTH gaunt and clearly heavyset', () => {
    const pool = generateCulturePool(20);
    for (let i = 0; i < 40; i++) {
      for (const p of generateColonyPawns(pool, 5)) {
        if (!p.traits.some((t) => t.id === 'gaunt')) continue;
        const build = p.physicalTraits.weight / p.physicalTraits.height;
        expect(build).toBeLessThan(0.6);
      }
    }
  });

  it('drawn flaws honour conflict groups (no dense + brittle bones on one pawn)', () => {
    const culture = generateCulture();
    for (let i = 0; i < 2000; i++) {
      const ids = new Set(drawPawnTraits(culture).map((t) => t.id));
      expect(ids.has('brittle-boned') && (ids.has('heavy-boned') || ids.has('stone-bones'))).toBe(
        false
      );
      expect(ids.has('night-blind') && (ids.has('night-owl') || ids.has('nocturnal'))).toBe(false);
    }
  });
});
