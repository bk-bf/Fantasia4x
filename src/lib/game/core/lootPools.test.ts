import { describe, it, expect } from 'vitest';
import { drawLoadout, rollCondition, type LootPool } from './LootPools';

// A seeded, deterministic rng stub — feeds a fixed sequence, wrapping. Lets us assert the pure draw
// logic (slot chance gate → weighted pick → quality roll) without the game rng singleton.
function seq(values: number[]) {
  let i = 0;
  return { random: () => values[i++ % values.length] };
}

const POOL: LootPool = {
  dropChance: 0.5,
  conditionRange: [0.4, 0.8],
  quality: [
    [1, 1],
    [3, 1]
  ],
  slots: {
    mainHand: {
      chance: 0.9,
      pick: [
        { id: 'sword', w: 3 },
        { id: 'axe', w: 1 }
      ]
    },
    bodyOuter: { chance: 0.3, pick: [{ id: 'jerkin', w: 1 }] }
  }
};

describe('lootpool draw', () => {
  it('fills a slot only when the chance roll passes, then weighted-picks + rolls quality', () => {
    // mainHand: chance 0.9 → pass at 0.1; pick roll 0.0 → first (sword); quality roll 0.0 → first (1).
    // bodyOuter: chance 0.3 → FAIL at 0.9 (skipped).
    const drawn = drawLoadout(POOL, seq([0.1, 0.0, 0.0, 0.9]));
    expect(drawn).toHaveLength(1);
    expect(drawn[0]).toMatchObject({ slot: 'mainHand', itemId: 'sword', quality: 1 });
  });

  it('skips a slot whose chance roll fails', () => {
    // mainHand chance 0.9 → FAIL only at ≥0.9; feed 0.95 → both slots skipped (bodyOuter 0.3 fails at 0.95).
    const drawn = drawLoadout(POOL, seq([0.95, 0.95]));
    expect(drawn).toHaveLength(0);
  });

  it('rolls condition within the pool range', () => {
    expect(rollCondition(POOL, seq([0.0]))).toBeCloseTo(0.4);
    expect(rollCondition(POOL, seq([1.0]))).toBeCloseTo(0.8);
    const mid = rollCondition(POOL, seq([0.5]));
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.8);
  });

  it('defaults to Standard quality when the pool authors no quality table', () => {
    const noQual: LootPool = {
      dropChance: 1,
      slots: { mainHand: { chance: 1, pick: [{ id: 'x' }] } }
    };
    const drawn = drawLoadout(noQual, seq([0.0, 0.0]));
    expect(drawn[0].quality).toBe(1);
  });

  it('§4b: a famed-flagged pick rolls a legend identity onto the drawn piece', () => {
    // A guaranteed boss signature: chance 1, single famed pick, dropChance 1.
    const bossPool: LootPool = {
      dropChance: 1,
      slots: { mainHand: { chance: 1, pick: [{ id: 'iron_tide', w: 1, famed: true }] } }
    };
    const drawn = drawLoadout(bossPool, seq([0.0, 0.0, 0.5]));
    expect(drawn).toHaveLength(1);
    expect(drawn[0].itemId).toBe('iron_tide');
    expect(drawn[0].famed).toBeDefined();
    expect(drawn[0].famed?.famedName).toBeTruthy();
    expect(drawn[0].famed?.famedStatMult).toBeGreaterThanOrEqual(2);
    expect(drawn[0].famed?.famedEnchants.length).toBeGreaterThanOrEqual(1);
  });

  it('§4b: an unflagged pick carries no famed identity (the common case)', () => {
    const drawn = drawLoadout(POOL, seq([0.1, 0.0, 0.0, 0.9]));
    expect(drawn[0].famed).toBeUndefined();
  });
});
