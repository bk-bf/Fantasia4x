import { describe, it, expect } from 'vitest';
import { itemService } from './ItemService';
import { buildingService } from './BuildingService';
import { resourceObjectService } from './ResourceObjectService';
import { complete as constructComplete } from './jobs/construct';
import { SUBTERRAINS, soilFertilityPct } from '../core/Terrains';
import type { GameState, Job } from '../core/types';

// PRODUCTION-CHAIN-II §F — soil buildings (terraform) + compost + seeds + wild-crop seed yield.

describe('§F crop seeds', () => {
  it('all seven seed items exist with category "seed"', () => {
    for (const id of [
      'grain_seed',
      'veg_seed',
      'legume_seed',
      'fibre_seed',
      'fruit_seed',
      'herb_seed',
      'prize_seed'
    ]) {
      expect(itemService.getItemById(id)?.category).toBe('seed');
    }
  });
});

describe('§F wild crops drop a few seeds when harvested', () => {
  it('wild barley/rye yield grain_seed; berry bush yields fruit_seed', () => {
    expect(resourceObjectService.calculateYield('wild_barley', undefined, undefined, 'harvest')).toHaveProperty(
      'grain_seed'
    );
    expect(resourceObjectService.calculateYield('wild_rye', undefined, undefined, 'harvest')).toHaveProperty(
      'grain_seed'
    );
    expect(resourceObjectService.calculateYield('berry_bush', undefined, undefined, 'harvest')).toHaveProperty(
      'fruit_seed'
    );
  });
});

describe('§F compost bin', () => {
  it('compost_bin is a passive building and make_compost rots real items into compost', () => {
    const bin = buildingService.getBuildingById('compost_bin');
    expect(bin?.passive).toBe(true);
    expect(itemService.getItemById('compost')?.category).toBe('soil');
    // make_compost inputs must be real items (rotten matter + hay).
    for (const id of ['rotten_food', 'hay', 'rotten_meat', 'rotten_carcass', 'rotten_hide']) {
      expect(itemService.getItemById(id)).toBeTruthy();
    }
  });
});

describe('§F Soil-Works terraform builds', () => {
  it('each soil build targets a real subterrain, is compost-gated, and tags FARMING', () => {
    const expected: Record<string, string> = {
      lay_poor_soil: 'grass',
      lay_loam: 'tall_grass',
      lay_rich_soil: 'deep_grass',
      lay_terra_preta: 'terra_preta'
    };
    for (const [id, sub] of Object.entries(expected)) {
      const def = buildingService.getBuildingById(id)!;
      expect(def.terraformSubType).toBe(sub);
      expect(SUBTERRAINS[sub]).toBeTruthy();
      expect(def.effects?.farming).toBe(1);
      // higher soils cost compost (poor soil is the cheap entry)
      if (id !== 'lay_poor_soil') expect(def.buildingCost?.compost).toBeGreaterThan(0);
    }
    // fertility actually rises along the chain
    expect(soilFertilityPct({ subType: 'tall_grass' })).toBe(50);
    expect(soilFertilityPct({ subType: 'terra_preta' })).toBe(100);
  });

  it('completing a terraform build rewrites the tile soil and removes the build', () => {
    const tile = {
      x: 1,
      y: 1,
      subType: 'dirt',
      terrainType: 'plains',
      walkable: true,
      movementCost: 1.2,
      resources: {}
    };
    const gs = {
      worldMap: [
        [tile, tile],
        [tile, { ...tile, x: 1, y: 1 }]
      ],
      buildings: [
        { id: 'b1', type: 'lay_rich_soil', x: 1, y: 1, status: 'in-progress', workRequired: 40 }
      ],
      droppedItems: [],
      pawns: [],
      buildingCounts: {}
    } as unknown as GameState;
    // fix the grid so [1][1] is the building's tile
    (gs.worldMap as unknown as Record<number, Record<number, typeof tile>>)[1][1] = tile;

    const job = { id: 'j', type: 'construct', buildingId: 'b1', targetX: 1, targetY: 1 } as unknown as Job;
    const next = constructComplete(job, gs);

    expect(next.worldMap[1][1].subType).toBe('deep_grass'); // rich soil
    expect(soilFertilityPct(next.worldMap[1][1])).toBe(75);
    expect((next.buildings ?? []).find((b) => b.id === 'b1')).toBeUndefined(); // build consumed
  });
});
