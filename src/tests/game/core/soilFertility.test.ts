import { describe, it, expect, afterEach } from 'vitest';
import {
  soilFertilityPct,
  soilTierForTile,
  SOIL_TIER_NAME,
  SOIL_ITEM_BY_TIER,
  SUBTYPE_BY_SOIL_TIER,
  resolveCharSpans,
  terrainBlocksSight,
  BIOMES
} from '$lib/game/core/defs/terrains';
import { pickBiome, isSpawnableTile, pickSubterrain } from '$lib/game/core/rules/world/terrain';
import { applyBiomeShares, resetBiomeConfig } from '$lib/game/world/WorldGenerator';
import { itemService } from '$lib/game/services/ItemService';
import type { WorldTile } from '$lib/game/core/types';

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

describe('resolveCharSpans (glyph resolution)', () => {
  it('a literal glyph bypasses sheet lookup entirely, even under an unknown sheet name', () => {
    expect(resolveCharSpans([{ literal: 'Z', sheet: 'nonexistent-sheet' as never }])).toEqual([
      'Z'
    ]);
  });

  it('an unknown sheet falls back to a placeholder glyph instead of throwing', () => {
    expect(resolveCharSpans([{ sheet: 'nonexistent-sheet' as never, id: 1 }])).toEqual(['?']);
  });

  it('an omitted sheet defaults to "plants"', () => {
    expect(resolveCharSpans([{ id: 5 }])).toEqual(resolveCharSpans([{ sheet: 'plants', id: 5 }]));
  });

  it('a from/to range expands to the same glyphs as calling by id one at a time', () => {
    const range = resolveCharSpans([{ sheet: 'plants', from: 5, to: 8 }]);
    const byId = [5, 6, 7, 8].map((id) => resolveCharSpans([{ sheet: 'plants', id }])[0]);
    expect(range).toEqual(byId);
  });
});

describe('pickBiome (density → biome band)', () => {
  it('resolves the real biome bands with an inclusive lower / exclusive upper edge', () => {
    expect(pickBiome(0)).toBe('swamp');
    expect(pickBiome(0.27999)).toBe('swamp');
    expect(pickBiome(0.28)).toBe('plains');
    expect(pickBiome(0.6)).toBe('mountain');
  });

  it('falls through to null when density sits outside every band (exactly at the top edge)', () => {
    expect(pickBiome(1)).toBeNull();
    expect(pickBiome(-0.1)).toBeNull();
  });
});

describe('terrainBlocksSight', () => {
  it('only an unwalkable, non-water subterrain blocks sight', () => {
    expect(terrainBlocksSight(true, 'stone_wall')).toBe(false);
    expect(terrainBlocksSight(false, 'water')).toBe(false);
    expect(terrainBlocksSight(false, 'shallow_water')).toBe(false);
    expect(terrainBlocksSight(false, 'stone_wall')).toBe(true);
  });
});

describe('isSpawnableTile', () => {
  const tile = (over: Partial<WorldTile>): WorldTile =>
    ({
      x: 0,
      y: 0,
      walkable: true,
      terrainType: 'plains',
      subType: 'grass',
      ...over
    }) as WorldTile;

  it('rejects a missing tile and an unwalkable tile', () => {
    expect(isSpawnableTile(undefined)).toBe(false);
    expect(isSpawnableTile(null)).toBe(false);
    expect(isSpawnableTile(tile({ walkable: false }))).toBe(false);
  });

  it('rejects a biome that is not spawnable, even if walkable', () => {
    expect(isSpawnableTile(tile({ terrainType: 'mountain' }))).toBe(false);
  });

  it('accepts a spawnable biome reached through its parent (e.g. deep_forest → forest)', () => {
    expect(isSpawnableTile(tile({ terrainType: 'deep_forest' }))).toBe(true);
  });

  it('rejects a water subtype even inside a spawnable biome', () => {
    expect(isSpawnableTile(tile({ terrainType: 'plains', subType: 'water' }))).toBe(false);
  });

  it('accepts a walkable, non-water tile in a spawnable biome', () => {
    expect(isSpawnableTile(tile({ terrainType: 'plains', subType: 'grass' }))).toBe(true);
  });
});

describe('pickSubterrain (biome + noise → subterrain id)', () => {
  it('honours inclusive-min / exclusive-max range edges', () => {
    expect(pickSubterrain('plains', -0.40001)).toBe('dirt');
    expect(pickSubterrain('plains', -0.4)).toBe('grass');
  });

  it('falls back to the parent biome when the child biome has no direct match', () => {
    expect(pickSubterrain('deep_forest', 0.5)).toBe('deep_grass');
  });

  it('defaults to dirt when nothing matches the biome at all', () => {
    expect(pickSubterrain('not-a-real-biome', 0)).toBe('dirt');
  });
});

describe('applyBiomeShares', () => {
  afterEach(() => resetBiomeConfig());

  it('clamps a negative share to zero width and forces the last band to end exactly at 1', () => {
    applyBiomeShares({ swamp: -5, plains: 1, forest: 1, mountain: 1 });
    expect(BIOMES.swamp.densityRange).toEqual([0, 0]);
    expect(BIOMES.mountain.densityRange![1]).toBe(1);
  });

  it('keeps the last band pinned to exactly 1 despite floating-point drift from uneven shares', () => {
    applyBiomeShares({ swamp: 1, plains: 1, forest: 3, mountain: 1 });
    expect(BIOMES.mountain.densityRange![1]).toBe(1);
  });
});
