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
} from '$lib/game/core/itemQuality';
import { mulberry32 } from '$lib/game/core/rng';
import { completeCraftOrder } from '$lib/game/services/jobs/craft';
import { itemService } from '$lib/game/services/ItemService';
import type { GameState } from '$lib/game/core/types';

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
    expect(meanTier(0.7)).toBeLessThan(1.2); // novice: Crude/Standard band
    expect(meanTier(2.0)).toBeGreaterThan(3.5); // master (levelBase 2.0): Masterwork-ish
  });

  it('Legendary is reachable for a master but rare for a mid-level crafter', () => {
    const rolls = (axis: number) => {
      const rand = mulberry32(99);
      let legendary = 0;
      for (let i = 0; i < 4000; i++) if (rollCraftQuality(axis, rand) === 5) legendary++;
      return legendary / 4000;
    };
    expect(rolls(1.0)).toBeLessThan(0.02); // competent mid-level almost never
    expect(rolls(2.1)).toBeGreaterThan(0.1); // master with a finesse edge regularly
  });

  it('maps the axis to the expected band at neutral jitter (rand=0.5: jitter 0, no long tail)', () => {
    // WORK-EXPERIENCE bands: the axis is levelBase(level 1–50) × style — novice ≈ 0.6 rolls Crude,
    // a competent mid-level ≈ 1.0 rolls Standard, a master ≈ 2.0 rolls Masterwork; Legendary needs
    // the top of the curve (finesse-leaning master ≈ 2.5) or the jitter/long-tail.
    const mid = () => 0.5;
    expect(rollCraftQuality(0.6, mid)).toBe(0); // Crude — fresh novice
    expect(rollCraftQuality(1.0, mid)).toBe(1); // Standard — competent mid-level
    expect(rollCraftQuality(1.4, mid)).toBe(2); // Fine — seasoned artisan
    expect(rollCraftQuality(1.7, mid)).toBe(3); // Superior — expert
    expect(rollCraftQuality(2.0, mid)).toBe(4); // Masterwork — master
    expect(rollCraftQuality(2.3, mid)).toBe(5); // Legendary — finesse-leaning master
  });

  it('jitter can push an identical crafter a band up or down', () => {
    expect(rollCraftQuality(0.9, () => 0)).toBe(0); // 0.9 − 0.18 = 0.72 < 0.8 → Crude
    expect(rollCraftQuality(1.1, () => 0.999)).toBeGreaterThanOrEqual(2); // +0.18 → Fine+
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
    expect(fine.damage).toBeCloseTo(10 * 1.15);
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
    const wp = { damage: 10, attackSpeed: 1, range: 0 };
    expect(scaleWeaponQuality(wp, 0).damage).toBeLessThan(10);
  });

  // PRODUCTION-CHAIN-III §I — the Famed stat-explosion layers ×2–5 OVER the §Q tier multiplier.
  it('famedStatMult explodes weapon stats on top of the quality tier', () => {
    const wp = { damage: 10, attackSpeed: 1, range: 0 };
    // Masterwork (×1.5) × Famed ×3 = ×4.5
    const famedMaster = scaleWeaponQuality(wp, 4, 3);
    expect(famedMaster.damage).toBeCloseTo(10 * 1.5 * 3);
    expect(famedMaster.attackSpeed).toBe(1); // intrinsic — still unscaled
  });

  it('famedStatMult explodes armour value on top of the quality tier', () => {
    const ap = { defense: 20, armorValue: 8 };
    const famedFine = scaleArmorQuality(ap, 2, 2.5); // ×1.15 × 2.5
    expect(famedFine.defense).toBeCloseTo(20 * 1.15 * 2.5);
    expect(famedFine.armorValue).toBeCloseTo(8 * 1.15 * 2.5);
  });

  it('famed on a no-tier (Standard) item still explodes; absent famedStatMult keeps the no-alloc path', () => {
    const wp = { damage: 10, attackSpeed: 1, range: 0 };
    // Standard tier (×1.0) but Famed ×4 → ×4, and a fresh object (not the same ref)
    const famedStd = scaleWeaponQuality(wp, STANDARD_QUALITY, 4);
    expect(famedStd.damage).toBeCloseTo(40);
    expect(famedStd).not.toBe(wp);
    // No famedStatMult + Standard → SAME object (hot-path invariant preserved)
    expect(scaleWeaponQuality(wp, STANDARD_QUALITY)).toBe(wp);
    expect(scaleWeaponQuality(wp, STANDARD_QUALITY, 0)).toBe(wp);
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
    const gs = completeCraftOrder(order, baseState(order), () => 3);
    const drop = (gs.droppedItems ?? []).find((d) => d.resourceId === 'stone_axe');
    expect(drop?.quality).toBe(3);
  });

  it('does NOT stamp quality on a bulk material output', () => {
    const order = makeOrder('branch');
    const gs = completeCraftOrder(order, baseState(order), () => 3);
    const drop = (gs.droppedItems ?? []).find((d) => d.resourceId === 'branch');
    expect(drop).toBeDefined();
    expect(drop?.quality).toBeUndefined();
  });

  // WORK-EXPERIENCE Phase B: a batch rolls EACH unit separately — one drop per rolled tier.
  it('a ×3 batch rolls per unit and splits into per-tier stacks', () => {
    const order = makeOrder('stone_axe');
    (order as { quantity: number }).quantity = 3;
    const seq = [0, 1, 1]; // Crude, Standard, Standard
    let i = 0;
    const gs = completeCraftOrder(order, baseState(order), () => seq[i++ % seq.length] as 0 | 1);
    const drops = (gs.droppedItems ?? []).filter((d) => d.resourceId === 'stone_axe');
    expect(drops).toHaveLength(2);
    const crude = drops.find((d) => d.quality === 0);
    const standard = drops.find((d) => d.quality === 1);
    expect(crude?.quantity).toBe(1);
    expect(standard?.quantity).toBe(2);
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
