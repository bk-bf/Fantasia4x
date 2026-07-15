import { describe, it, expect } from 'vitest';
import {
  soilFertilityPct,
  soilTierForTile,
  SOIL_TIER_NAME,
  SOIL_ITEM_BY_TIER,
  SUBTYPE_BY_SOIL_TIER
} from '$lib/game/core/Terrains';
import { itemService } from '$lib/game/services/ItemService';

// PRODUCTION-CHAIN-II §F P1 — fertility is a 0–100% value (5 steps), depicted like wetness, derived
// from the grass-density subterrain (no tile.soil field): bare dirt → 0%, grass → 25%, tall_grass →
// 50%, deep_grass → 75%, terra preta (terraform-earned) → 100%.

describe('§F soil fertility derives from the grass subterrain', () => {
  it('maps grass density → fertility % in 25-point steps', () => {
    expect(soilFertilityPct({ subType: 'dirt' })).toBe(0);
    expect(soilFertilityPct({ subType: 'savanna' })).toBe(0);
    expect(soilFertilityPct({ subType: 'grass' })).toBe(25);
    expect(soilFertilityPct({ subType: 'tall_grass' })).toBe(50);
    expect(soilFertilityPct({ subType: 'deep_grass' })).toBe(75);
    expect(soilFertilityPct({ subType: 'terra_preta' })).toBe(100);
    expect(soilFertilityPct(null)).toBe(0);
  });

  it('tier is the 0–4 bucket of the percentage', () => {
    expect(soilTierForTile({ subType: 'dirt' })).toBe(0);
    expect(soilTierForTile({ subType: 'grass' })).toBe(1);
    expect(soilTierForTile({ subType: 'tall_grass' })).toBe(2);
    expect(soilTierForTile({ subType: 'deep_grass' })).toBe(3);
    expect(soilTierForTile({ subType: 'terra_preta' })).toBe(4);
  });

  it('every tier has a human name and a real soil item', () => {
    for (const tier of [0, 1, 2, 3, 4] as const) {
      expect(SOIL_TIER_NAME[tier]).toBeTruthy();
      const itemId = SOIL_ITEM_BY_TIER[tier];
      expect(itemService.getItemById(itemId)?.category).toBe('soil');
    }
  });

  it('soil item ↔ subtype round-trips (dig tier → item; terraform item → fertile subtype)', () => {
    for (const tier of [0, 1, 2, 3, 4] as const) {
      const subtype = SUBTYPE_BY_SOIL_TIER[tier];
      expect(soilTierForTile({ subType: subtype })).toBe(tier);
    }
  });
});
