import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { generateCulture, generateCulturePool } from '$lib/game/core/gen/culture';
import { buildPawnFromCulture, resetPawnDebugIds } from '$lib/game/core/gen/pawnBuild';
import { generateColonyPawns } from '$lib/game/core/gen/colonyPawns';
import { generateWorldKin } from '$lib/game/core/gen/pawnKin';
import { rng } from '$lib/game/core/util/rng';

const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);

const PINNED_BUILDS = [
  { seed: 1, name: 'Roderick Ironback', digest: 'f3c49ee0eb17a007' },
  { seed: 7, name: 'Liora Goldleaf', digest: '1721e44cd3cca8bb' },
  { seed: 431, name: 'Xara Jewelcrest', digest: 'b6cb209de9f7350f' }
];

describe('pawn generation with a fixed seed', () => {
  it.each(PINNED_BUILDS)(
    'buildPawnFromCulture after reseed($seed)',
    ({ seed, name, digest: d }) => {
      rng.reseed(seed);
      resetPawnDebugIds();
      const pawn = buildPawnFromCulture(generateCulture(), 3);
      expect(pawn.name).toBe(name);
      expect(digest(pawn)).toBe(d);
    }
  );

  it('generateColonyPawns and generateWorldKin after reseed(99)', () => {
    rng.reseed(99);
    resetPawnDebugIds();
    const pool = generateCulturePool(6);
    const founders = generateColonyPawns(pool, 6);
    const kin = generateWorldKin(founders, pool, []);
    expect(digest(founders)).toBe('4227d1bcdbfe4268');
    expect(kin).toHaveLength(25);
    expect(digest(kin)).toBe('5dee5fd619c8e9b2');
    expect(digest(founders.map((f) => f.kin))).toBe('84f4bf72c2363f04');
  });
});
