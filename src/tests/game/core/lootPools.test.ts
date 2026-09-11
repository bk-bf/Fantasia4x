import { describe, it, expect } from 'vitest';
import {
  drawLoadout,
  drawCarried,
  rollCondition,
  getLootPool,
  validateLootItemIds,
  type LootPool
} from '$lib/game/core/defs/loot';
import { isFluidId, servingL } from '$lib/game/core/rules/gear/vessels';

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
    const drawn = drawLoadout(POOL, seq([0.1, 0.0, 0.0, 0.9]));
    expect(drawn).toHaveLength(1);
    expect(drawn[0]).toMatchObject({ slot: 'mainHand', itemId: 'sword', quality: 1 });
  });

  it('skips a slot whose chance roll fails', () => {
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

  it('drawCarried merges repeat picks of one id and converts a fluid pick to litres', () => {
    expect(isFluidId('bloodrage_draught')).toBe(true);
    expect(servingL('bloodrage_draught')).not.toBe(1);
    const fluidPool: LootPool = {
      dropChance: 1,
      slots: {},
      carried: [
        { chance: 1, count: [2, 2], pick: [{ id: 'bloodrage_draught', w: 1 }] },
        { chance: 1, count: [1, 1], pick: [{ id: 'bloodrage_draught', w: 1 }] }
      ]
    };
    const drawn = drawCarried(fluidPool, seq([0, 0, 0, 0, 0, 0]));
    expect(drawn).toHaveLength(1);
    expect(drawn[0].itemId).toBe('bloodrage_draught');
    expect(drawn[0].qty).toBeCloseTo(3 * servingL('bloodrage_draught'));

    expect(isFluidId('chewed_poultice')).toBe(false);
    const unitPool: LootPool = {
      dropChance: 1,
      slots: {},
      carried: [
        { chance: 1, count: [2, 2], pick: [{ id: 'chewed_poultice', w: 1 }] },
        { chance: 1, count: [1, 1], pick: [{ id: 'chewed_poultice', w: 1 }] }
      ]
    };
    const drawnUnits = drawCarried(unitPool, seq([0, 0, 0, 0, 0, 0]));
    expect(drawnUnits).toHaveLength(1);
    expect(drawnUnits[0]).toEqual({ itemId: 'chewed_poultice', qty: 3 });
  });
});

describe('getLootPool', () => {
  it('returns undefined for a pool id that does not exist', () => {
    expect(getLootPool('no-such-pool-id')).toBeUndefined();
  });
});

describe('validateLootItemIds', () => {
  it('throws naming the slot when a slot pick resolves to an unknown item id', () => {
    expect(() =>
      validateLootItemIds((id) => id !== 'goblin_bark_bracers')
    ).toThrow(/goblin_bark_bracers/);
  });

  it('throws naming "carried" when a carried pick resolves to an unknown item id', () => {
    expect(() => validateLootItemIds((id) => id !== 'venom_coating')).toThrow(/carried/);
  });
});

describe('drawCarried', () => {
  it('skips a carry entry whose chance roll fails', () => {
    const pool: LootPool = {
      dropChance: 1,
      slots: {},
      carried: [{ chance: 0.5, count: [1, 1], pick: [{ id: 'rock' }] }]
    };
    expect(drawCarried(pool, seq([0.9]))).toEqual([]);
  });

  it('rolls a count within range and weighted-picks among the carry pool', () => {
    const pool: LootPool = {
      dropChance: 1,
      slots: {},
      carried: [
        {
          chance: 1,
          count: [2, 2],
          pick: [
            { id: 'twig', w: 1 },
            { id: 'branch', w: 3 }
          ]
        }
      ]
    };
    const drawn = drawCarried(pool, seq([0.0, 0.0, 0.9]));
    expect(drawn).toEqual([{ itemId: 'branch', qty: 2 }]);
  });

  it('aggregates qty when two carry entries draw the same item id', () => {
    const pool: LootPool = {
      dropChance: 1,
      slots: {},
      carried: [
        { chance: 1, count: [1, 1], pick: [{ id: 'coin' }] },
        { chance: 1, count: [2, 2], pick: [{ id: 'coin' }] }
      ]
    };
    const drawn = drawCarried(pool, seq([0, 0, 0, 0, 0, 0]));
    expect(drawn).toEqual([{ itemId: 'coin', qty: 3 }]);
  });

  it('drops a carry entry whose rolled quantity is 0', () => {
    const pool: LootPool = {
      dropChance: 1,
      slots: {},
      carried: [{ chance: 1, count: [0, 0], pick: [{ id: 'rock' }] }]
    };
    expect(drawCarried(pool, seq([0.0, 0.0]))).toEqual([]);
  });
});
