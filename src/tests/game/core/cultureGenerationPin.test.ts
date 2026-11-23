import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  drawPawnTraits,
  generateCulturePool,
  generateCultureRelations
} from '$lib/game/core/gen/culture';
import { rng } from '$lib/game/core/util/rng';
import type { Culture } from '$lib/game/core/types';

const SEEDS = [1, 431, 20260617, 987654321];

function withoutDescription(pool: Culture[]) {
  return pool.map((c) => ({ ...c, lore: { ...c.lore, description: '' } }));
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

function snapshot(seed: number) {
  rng.reseed(seed);
  const pool = generateCulturePool(6);
  const relations = generateCultureRelations(pool);
  const traits = pool.map((c) => drawPawnTraits(c, { weight: 70, height: 170 }).map((t) => t.id));
  return {
    ids: pool.map((c) => c.id),
    pool: digest(withoutDescription(pool)),
    relations: digest(relations),
    traits: digest(traits)
  };
}

const EXPECTED: Record<number, ReturnType<typeof snapshot>> = {
  1: {
    ids: ['vororn', 'nyxith', 'drakan', 'tharnian', 'fluxex', 'hexung'],
    pool: '7cc12ae87d34b58e',
    relations: '1ca66de827735b33',
    traits: 'a6a5fe003b22685a'
  },
  431: {
    ids: ['drakast', 'vexith', 'astraara', 'lumorn', 'zephek', 'zephung'],
    pool: '36e150e6df223af8',
    relations: '3a56aa5c2d80a236',
    traits: 'f48d8fe614916895'
  },
  20260617: {
    ids: ['nyxian', 'morys', 'tharnek', 'nyxur', 'tharnoth', 'fluxoth'],
    pool: '471a0b12ffec541a',
    relations: 'eefa960372274eb3',
    traits: '68d9df0df976c0b0'
  },
  987654321: {
    ids: ['quineth', 'moreon', 'drakur', 'hexast', 'skornara', 'tharnek'],
    pool: '36230b13df3c9a62',
    relations: '9fd7b187e65df361',
    traits: '2739486096e08bf7'
  }
};

describe('culture generation is pinned per seed', () => {
  for (const seed of SEEDS) {
    it(`seed ${seed} gives the same cultures, relations and pawn traits`, () => {
      expect(snapshot(seed)).toEqual(EXPECTED[seed]);
    });
  }
});
