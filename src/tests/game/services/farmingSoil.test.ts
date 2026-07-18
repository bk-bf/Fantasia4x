import { describe, it, expect } from 'vitest';
import { itemService } from '$lib/game/services/ItemService';
import { buildingService } from '$lib/game/services/BuildingService';
import { resourceObjectService } from '$lib/game/services/ResourceObjectService';
import { complete as constructComplete } from '$lib/game/services/jobs/construct';
import { complete as plantComplete } from '$lib/game/services/jobs/plant';
import {
  complete as harvestComplete,
  generate as harvestGenerate
} from '$lib/game/services/jobs/harvest';
import { isGrowableResource } from '$lib/game/services/ResourceObjectService';
import { SUBTERRAINS, soilFertilityPct } from '$lib/game/core/Terrains';
import type { GameState, Job } from '$lib/game/core/types';

// PRODUCTION-CHAIN-II §F — soil buildings (terraform) + compost + seeds + wild-crop seed yield.

describe('§F crop seeds', () => {
  it('each per-crop seed exists, and its category is its own id (so a grow zone can target it)', () => {
    for (const id of [
      'grain_seed',
      'cabbage_seed',
      'turnip_seed',
      'onion_seed',
      'bean_seed',
      'pea_seed',
      'fibre_seed',
      'berry_seed',
      'apple_seed',
      'grape_seed',
      'thyme_seed',
      'mint_seed',
      'prize_seed'
    ]) {
      // Per-crop seed categories (ADR cropping expansion): the grow-zone filter grid picks a seed by
      // category, so each seed's category equals its own id rather than a shared "seed" bucket.
      expect(itemService.getItemById(id)?.category).toBe(id);
    }
  });
});

describe('§F wild crops drop a few seeds when harvested', () => {
  it('wild barley yields grain_seed, wild rye yields rye_seed; berry bush yields berry_seed; each wild veg yields its own seed', () => {
    expect(
      resourceObjectService.calculateYield('wild_barley', undefined, undefined, 'harvest')
    ).toHaveProperty('grain_seed');
    expect(
      resourceObjectService.calculateYield('wild_rye', undefined, undefined, 'harvest')
    ).toHaveProperty('rye_seed');
    expect(
      resourceObjectService.calculateYield('berry_bush', undefined, undefined, 'harvest')
    ).toHaveProperty('berry_seed');
    // Each wild crop is its own plant, dropping its OWN vegetable + matching seed (no grab-bag plant).
    for (const [resId, seed] of [
      ['wild_turnip', 'turnip_seed'],
      ['wild_cabbage', 'cabbage_seed'],
      ['wild_onion', 'onion_seed'],
      ['wild_beans', 'bean_seed'],
      ['wild_peas', 'pea_seed']
    ] as const) {
      expect(
        resourceObjectService.calculateYield(resId, undefined, undefined, 'harvest')
      ).toHaveProperty(seed);
    }
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

    const job = {
      id: 'j',
      type: 'construct',
      buildingId: 'b1',
      targetX: 1,
      targetY: 1
    } as unknown as Job;
    const next = constructComplete(job, gs);

    expect(next.worldMap[1][1].subType).toBe('deep_grass'); // rich soil
    expect(soilFertilityPct(next.worldMap[1][1])).toBe(75);
    expect((next.buildings ?? []).find((b) => b.id === 'b1')).toBeUndefined(); // build consumed
  });
});

describe('§F dig = the harvest-vs-cut twin', () => {
  it('grass patches expose a dig interaction that yields soil + dirt and strips to bare dirt', () => {
    const cases: Record<string, string> = {
      grass_patch: 'poor_soil',
      tall_grass_patch: 'loam',
      deep_grass_patch: 'rich_soil'
    };
    for (const [id, soilItem] of Object.entries(cases)) {
      const def = resourceObjectService.getById(id)!;
      expect(def.designationTypes).toContain('dig');
      const dig = resourceObjectService.getInteractionByDesignationType(id, 'dig')!;
      expect(dig.harvestDepletes).toBe(true);
      expect(dig.harvestSubType).toBe('dirt');
      const yieldIds = dig.yields.map((y) => y.itemId);
      expect(yieldIds).toContain(soilItem);
      expect(yieldIds).toContain('dirt');
    }
  });
});

describe('§F crops + planting', () => {
  it('crops are resource objects with a crop spec and seed/food yields', () => {
    const wheat = resourceObjectService.getById('crop_wheat')!;
    expect(wheat.crop?.seedItem).toBe('grain_seed');
    expect(wheat.crop?.minSoil).toBe(1);
    const y = resourceObjectService.calculateYield('crop_wheat', undefined, undefined, 'harvest');
    expect(y).toHaveProperty('wheat');
    expect(y).toHaveProperty('grain_seed');
    // prize crop needs terra preta (tier 4)
    expect(resourceObjectService.getById('crop_pumpkin')!.crop?.minSoil).toBe(4);
  });

  it('plant completion places an immature crop with a growth cooldown', () => {
    const tile = {
      x: 2,
      y: 0,
      subType: 'tall_grass', // loam, 50% — wheat (minSoil 1) plants fine
      terrainType: 'plains',
      walkable: true,
      moisture: 40,
      resources: {}
    };
    const gs = {
      worldMap: [[{ ...tile, x: 0 }, { ...tile, x: 1 }, tile]],
      stockpile: { grain_seed: 3 },
      season: 'summer',
      turn: 100,
      pawns: []
    } as unknown as GameState;

    const job = {
      id: 'p',
      type: 'plant',
      resourceId: 'crop_wheat',
      targetX: 2,
      targetY: 0
    } as unknown as Job;
    const next = plantComplete(job, gs);

    const t = next.worldMap[0][2];
    expect(t.resources.crop_wheat).toBe(0); // immature — count 0 until growth reaches 100%
    expect(t.growth?.crop_wheat).toBe(0); // sown at 0%, climbs via processCropGrowth under good conditions
  });
});

describe('§F resource growth/maturity', () => {
  it('plants are growable (roll maturity), minerals are not', () => {
    expect(isGrowableResource(resourceObjectService.getById('grass_patch')!)).toBe(true);
    expect(isGrowableResource(resourceObjectService.getById('crop_wheat')!)).toBe(true);
    expect(isGrowableResource(resourceObjectService.getById('pine_tree')!)).toBe(true);
    expect(isGrowableResource(resourceObjectService.getById('hematite')!)).toBe(false);
  });

  it('growth scales harvest yield — an ungrown node yields nothing, a full one yields normally', () => {
    const none = resourceObjectService.calculateYield(
      'grass_patch',
      undefined,
      undefined,
      'harvest',
      0
    );
    expect(Object.keys(none).length).toBe(0); // 0% growth → no harvest
    const full = resourceObjectService.calculateYield(
      'grass_patch',
      undefined,
      undefined,
      'harvest',
      100
    );
    expect(full).toHaveProperty('plant_fiber');
  });

  it('a tree forage only strips ~20% growth (just branches) — the tree stays standing', () => {
    const forage = resourceObjectService.getInteractionByDesignationType('pine_tree', 'forage')!;
    expect(forage.harvestGrowthCost).toBe(20);
  });

  it('a foraged-down tree (growth < 60%) queues no new forage job until it regrows', () => {
    const mk = (growth: number) =>
      ({
        worldMap: [
          [
            {
              x: 0,
              y: 0,
              subType: 'deep_grass',
              terrainType: 'forest',
              walkable: false,
              resources: { pine_tree: 3 },
              growth: { pine_tree: growth }
            }
          ]
        ],
        designations: { '0,0': 'forage' },
        pawns: []
      }) as unknown as GameState;

    expect(harvestGenerate([], mk(80)).some((j) => j.resourceId === 'pine_tree')).toBe(true);
    expect(harvestGenerate([], mk(40)).some((j) => j.resourceId === 'pine_tree')).toBe(false);
  });
});

describe('§F soil exhaustion from farming', () => {
  it('every crop declares a fertility cost; prize crops draw the most', () => {
    for (const id of [
      'crop_wheat',
      'crop_cabbage',
      'crop_turnip',
      'crop_onion',
      'crop_beans',
      'crop_peas',
      'crop_flax',
      'crop_berries',
      'crop_apples',
      'crop_grapes',
      'crop_thyme',
      'crop_mint'
    ]) {
      expect(resourceObjectService.getById(id)!.crop!.fertilityCost).toBeGreaterThan(0);
    }
    expect(resourceObjectService.getById('crop_pumpkin')!.crop!.fertilityCost).toBeGreaterThan(
      resourceObjectService.getById('crop_wheat')!.crop!.fertilityCost
    );
  });

  it('repeatedly harvesting a crop degrades the soil one tier (terra preta → rich soil)', () => {
    const tile = {
      x: 0,
      y: 0,
      subType: 'terra_preta',
      terrainType: 'plains',
      walkable: true,
      movementCost: 1.2,
      moisture: 60,
      resources: { crop_pumpkin: 1 },
      growth: { crop_pumpkin: 100 }
    };
    let gs = {
      worldMap: [[tile]],
      designations: {},
      droppedItems: [],
      pawns: [],
      stockpile: {},
      season: 'summer',
      turn: 1
    } as unknown as GameState;

    const reap = () => {
      const t = gs.worldMap[0][0];
      t.resources = { crop_pumpkin: 1 };
      t.growth = { crop_pumpkin: 100 };
      gs = harvestComplete(
        {
          id: 'h',
          type: 'harvest',
          resourceId: 'crop_pumpkin',
          targetX: 0,
          targetY: 0,
          claimedBy: null
        } as unknown as Job,
        gs
      );
    };

    // pumpkin fertilityCost 10, WEAR_PER_TIER 100 → 10 harvests per tier drop (generous, since the
    // crop is BLOCKED from replanting the moment terra preta drops below tier 4).
    for (let i = 0; i < 9; i++) reap(); // wear 90 — still terra preta
    expect(gs.worldMap[0][0].subType).toBe('terra_preta');
    reap(); // 100 → drop a tier
    expect(gs.worldMap[0][0].subType).toBe('deep_grass'); // worn down to rich soil
    expect(soilFertilityPct(gs.worldMap[0][0])).toBe(75);
  });
});
