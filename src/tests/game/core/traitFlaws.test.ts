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

    const longReach = byId('long-reach');
    expect(pawnMeetsRequires(longReach, { weight: 100, height: 299 })).toBe(false);
    expect(pawnMeetsRequires(longReach, { weight: 100, height: 300 })).toBe(true);

    const weightGate: Trait = {
      name: 'weight-gate',
      description: '',
      effects: {},
      requires: { minWeightKg: 50, maxWeightKg: 100 }
    };
    expect(pawnMeetsRequires(weightGate, { weight: 49, height: 150 })).toBe(false);
    expect(pawnMeetsRequires(weightGate, { weight: 50, height: 150 })).toBe(true);
    expect(pawnMeetsRequires(weightGate, { weight: 100, height: 150 })).toBe(true);
    expect(pawnMeetsRequires(weightGate, { weight: 101, height: 150 })).toBe(false);

    const heightGate: Trait = {
      name: 'height-gate',
      description: '',
      effects: {},
      requires: { minHeightCm: 100, maxHeightCm: 200 }
    };
    expect(pawnMeetsRequires(heightGate, { weight: 50, height: 99 })).toBe(false);
    expect(pawnMeetsRequires(heightGate, { weight: 50, height: 100 })).toBe(true);
    expect(pawnMeetsRequires(heightGate, { weight: 50, height: 200 })).toBe(true);
    expect(pawnMeetsRequires(heightGate, { weight: 50, height: 201 })).toBe(false);

    expect(pawnMeetsRequires(heightGate, { weight: 50, height: 0 }), 'height<=0 guard').toBe(
      false
    );
    expect(
      pawnMeetsRequires(stocky, { weight: 100, height: 0 }),
      'height<=0 forces build to 0, below minBuild'
    ).toBe(false);
    expect(
      pawnMeetsRequires(gaunt, { weight: 100, height: 0 }),
      'height<=0 forces build to 0, still under maxBuild'
    ).toBe(true);
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

  it('affinity.guaranteed forces specific trait ids onto the pawn when the physique gate allows it', () => {
    const culture = generateCulture();
    const fitting = { weight: 200, height: 320 };
    const forced = drawPawnTraits(culture, fitting, {
      boost: new Set<string>(),
      guaranteed: ['long-reach']
    });
    expect(forced.some((t) => t.id === 'long-reach')).toBe(true);

    const tooShort = { weight: 200, height: 150 };
    const skipped = drawPawnTraits(culture, tooShort, {
      boost: new Set<string>(),
      guaranteed: ['long-reach']
    });
    expect(skipped.some((t) => t.id === 'long-reach')).toBe(false);
  });

  it('the 2-cultural-trait draw cap (MAX_CULTURAL_TRAITS) holds across many draws', () => {
    const culture = generateCulture();
    const knownCulturalIds = new Set([
      ...culture.guaranteedTraits.map((t) => t.id),
      ...culture.culturalTraitPool.map((t) => t.id)
    ]);
    for (let i = 0; i < 500; i++) {
      const traits = drawPawnTraits(culture);
      const fromCulture = traits.filter((t) => t.id && knownCulturalIds.has(t.id));
      expect(fromCulture.length, `draw ${i}`).toBeLessThanOrEqual(2);
    }
  });
});
