// PRODUCTION-CHAIN-II §Q (R8) — quality roll, stat scaling, stamp-on-output, and display.
import { describe, it, expect } from 'vitest';
import {
  rollCraftQuality,
  qualityMultiplier,
  qualityPrefix,
  qualityColor,
  qualityName,
  scaleWeaponQuality,
  scaleArmorQuality,
  STANDARD_QUALITY
} from './itemQuality';
import { mulberry32 } from './rng';
import { completeCraftOrder } from '../services/jobs/craft';
import { itemService } from '../services/ItemService';
import type { GameState } from './types';

describe('rollCraftQuality', () => {
  // Average the tier over many seeded rolls — the axis sets where the distribution centres.
  const meanTier = (axis: number, n = 4000): number => {
    const rand = mulberry32(1234);
    let sum = 0;
    for (let i = 0; i < n; i++) sum += rollCraftQuality(axis, rand);
    return sum / n;
  };

  it('higher crafting_quality axis shifts the distribution up', () => {
    const poor = meanTier(0.75);
    const avg = meanTier(1.0);
    const expert = meanTier(1.7);
    expect(poor).toBeLessThan(avg);
    expect(avg).toBeLessThan(expert);
  });

  it('a poor/rushed craft floors near Crude–Standard; a master craft reaches the top tiers', () => {
    expect(meanTier(0.7)).toBeLessThan(1.2); // Crude/Standard band
    expect(meanTier(1.8)).toBeGreaterThan(3.5); // Masterwork-ish
  });

  it('Legendary is reachable for a master but rare for a journeyman', () => {
    const rolls = (axis: number) => {
      const rand = mulberry32(99);
      let legendary = 0;
      for (let i = 0; i < 4000; i++) if (rollCraftQuality(axis, rand) === 5) legendary++;
      return legendary / 4000;
    };
    expect(rolls(1.0)).toBeLessThan(0.02); // journeyman almost never
    expect(rolls(1.9)).toBeGreaterThan(0.1); // master regularly
  });

  it('maps the axis to the expected band at neutral jitter (rand=0.5: jitter 0, no long tail)', () => {
    const mid = () => 0.5;
    expect(rollCraftQuality(0.5, mid)).toBe(0); // Crude — injured/dark/rushed
    expect(rollCraftQuality(1.0, mid)).toBe(1); // Standard — average crafter
    expect(rollCraftQuality(1.25, mid)).toBe(2); // Fine — skilled
    expect(rollCraftQuality(1.5, mid)).toBe(3); // Superior — expert
    expect(rollCraftQuality(1.7, mid)).toBe(4); // Masterwork
    expect(rollCraftQuality(2.0, mid)).toBe(5); // Legendary
  });

  it('jitter can push an identical crafter a band up or down', () => {
    expect(rollCraftQuality(1.0, () => 0)).toBe(0); // 1.0 − 0.18 = 0.82 < 0.85 → Crude
    expect(rollCraftQuality(1.05, () => 0.999)).toBeGreaterThanOrEqual(2); // +0.18 → Fine+
  });

  it('clamps to 0..5', () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const q = rollCraftQuality(3.0, rand);
      expect(q).toBeGreaterThanOrEqual(0);
      expect(q).toBeLessThanOrEqual(5);
    }
  });
});

describe('quality tier accessors', () => {
  it('multiplier rises with tier; Standard/undefined = 1.0', () => {
    expect(qualityMultiplier(undefined)).toBe(1.0);
    expect(qualityMultiplier(STANDARD_QUALITY)).toBe(1.0);
    expect(qualityMultiplier(0)).toBeLessThan(1.0); // Crude penalty
    expect(qualityMultiplier(5)).toBeGreaterThan(qualityMultiplier(2));
  });

  it('prefix is empty only for Standard', () => {
    expect(qualityPrefix(STANDARD_QUALITY)).toBe('');
    expect(qualityPrefix(undefined)).toBe('');
    expect(qualityPrefix(4)).toBe('Masterwork');
  });

  it('colour is undefined for Standard, set otherwise', () => {
    expect(qualityColor(STANDARD_QUALITY)).toBeUndefined();
    expect(qualityColor(5)).toMatch(/^#/);
  });

  it('name maps tiers', () => {
    expect(qualityName(0)).toBe('Crude');
    expect(qualityName(3)).toBe('Superior');
  });
});

describe('stat scaling (consume side)', () => {
  it('scaleWeaponQuality scales damage/accuracy/crit/pen, leaves intrinsic fields', () => {
    const wp = {
      damage: 10,
      baseDamage: 8,
      damMin: 6,
      damMax: 12,
      accuracy: 5,
      critMod: 0.1,
      armorPenetration: 0.2,
      attackSpeed: 1,
      range: 0,
      reach: 1
    };
    const fine = scaleWeaponQuality(wp, 2); // ×1.15
    expect(fine.baseDamage).toBeCloseTo(8 * 1.15);
    expect(fine.damMax).toBeCloseTo(12 * 1.15);
    expect(fine.accuracy).toBeCloseTo(5 * 1.15);
    expect(fine.critMod).toBeCloseTo(0.1 * 1.15);
    expect(fine.armorPenetration).toBeCloseTo(0.2 * 1.15);
    // intrinsic — not scaled
    expect(fine.attackSpeed).toBe(1);
    expect(fine.reach).toBe(1);
    expect(fine.range).toBe(0);
  });

  it('Standard/undefined returns the SAME object (no hot-path allocation)', () => {
    const wp = { damage: 10, attackSpeed: 1, range: 0 };
    expect(scaleWeaponQuality(wp, STANDARD_QUALITY)).toBe(wp);
    expect(scaleWeaponQuality(wp, undefined)).toBe(wp);
  });

  it('scaleArmorQuality scales defense/armorValue', () => {
    const ap = { defense: 20, armorValue: 8, movementPenalty: 0.1 };
    const master = scaleArmorQuality(ap, 4); // ×1.5
    expect(master.defense).toBeCloseTo(30);
    expect(master.armorValue).toBeCloseTo(12);
    expect(master.movementPenalty).toBe(0.1); // intrinsic
  });

  it('Crude weapon is weaker than Standard', () => {
    const wp = { damage: 10, baseDamage: 10, attackSpeed: 1, range: 0 };
    expect(scaleWeaponQuality(wp, 0).baseDamage).toBeLessThan(10);
  });
});

describe('stamp on craft output', () => {
  const station = { id: 'wb', type: 'craft_spot', x: 5, y: 5, status: 'complete' } as never;
  const makeOrder = (itemId: string) =>
    ({
      id: 'o1',
      item: { id: itemId, name: itemId, amount: 0 },
      quantity: 1,
      workRequired: 4,
      workDone: 0,
      inputs: {},
      stationType: 'craft_spot',
      stationBuildingId: 'wb'
    }) as never;
  const baseState = (order: never): GameState =>
    ({
      droppedItems: [],
      craftingQueue: [order],
      buildings: [station],
      zoneTiles: {}
    }) as never;

  it('stamps the rolled tier on an instance-bearing tool output', () => {
    const order = makeOrder('stone_axe');
    const gs = completeCraftOrder(order, baseState(order), 3);
    const drop = (gs.droppedItems ?? []).find((d) => d.resourceId === 'stone_axe');
    expect(drop?.quality).toBe(3);
  });

  it('does NOT stamp quality on a bulk material output', () => {
    const order = makeOrder('branch');
    const gs = completeCraftOrder(order, baseState(order), 3);
    const drop = (gs.droppedItems ?? []).find((d) => d.resourceId === 'branch');
    expect(drop).toBeDefined();
    expect(drop?.quality).toBeUndefined();
  });

  it('passive production (no quality) leaves the output unstamped', () => {
    const order = makeOrder('stone_axe');
    const gs = completeCraftOrder(order, baseState(order));
    const drop = (gs.droppedItems ?? []).find((d) => d.resourceId === 'stone_axe');
    expect(drop?.quality).toBeUndefined();
  });
});

describe('display name prefix', () => {
  it('prepends the tier prefix; Standard adds nothing', () => {
    const id = 'stone_axe';
    const base = itemService.getItemDisplayName({ resourceId: id });
    expect(itemService.getItemDisplayName({ resourceId: id, quality: 4 })).toBe(
      `Masterwork ${base}`
    );
    expect(itemService.getItemDisplayName({ resourceId: id, quality: STANDARD_QUALITY })).toBe(
      base
    );
  });
});
