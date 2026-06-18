// PRODUCTION-CHAIN-II §M — ancient-wood groves: tool-tier gating, soft glow, and the axes that gate them.
import { describe, it, expect } from 'vitest';
import { resourceObjectService } from '../services/ResourceObjectService';
import { lightingService } from '../services/LightingService';
import { itemService } from '../services/ItemService';
import { recipeService } from '../services/RecipeService';
import type { WorldTile } from '../core/types';

const GROVES: Array<[string, number]> = [
  ['heartwood_grove', 2],
  ['moonwood_grove', 2],
  ['emberwood_grove', 2],
  ['ironwood_grove', 3] // hardest wood → top-tier axe
];

function tile(x: number, y: number, resources: Record<string, number>): WorldTile {
  return {
    x,
    y,
    resources,
    subType: 'tree',
    terrainType: 'tree',
    walkable: false
  } as unknown as WorldTile;
}

describe('§M grove tool-tier gating', () => {
  it('each grove requires woodcutting at the balanced tier', () => {
    for (const [id, tier] of GROVES) {
      const def = resourceObjectService.getById(id);
      expect(def, id).toBeDefined();
      expect(def!.interaction.workCategory).toBe('woodcutting');
      expect(def!.interaction.toolRequirement?.workType).toBe('woodcutting');
      expect(def!.interaction.toolRequirement?.minTier, id).toBe(tier);
    }
  });

  it('higher-tier woodcutting axes exist to satisfy the gates', () => {
    const stone = itemService.getItemById('stone_axe');
    const iron = itemService.getItemById('iron_axe');
    const steel = itemService.getItemById('steel_axe');
    for (const [a, t] of [
      [stone, 1],
      [iron, 2],
      [steel, 3]
    ] as const) {
      expect(a).toBeDefined();
      expect(a!.type).toBe('tool');
      expect(a!.category).toBe('woodcutting');
      // `tier` is a data field the code reads via cast (not on the Item type) — mirror that here.
      expect((a as unknown as { tier?: number }).tier).toBe(t);
    }
    // the axes Work.ts already lists are now real and craftable at the anvil
    expect(recipeService.getRecipeForItem('iron_axe')?.station).toBe('anvil');
    expect(recipeService.getRecipeForItem('steel_axe')?.station).toBe('anvil');
    expect(recipeService.getRecipeForItem('steel_axe')?.researchRequired).toBe('steel_making');
  });
});

describe('§M grove soft glow', () => {
  it('every grove declares a dim glow (less glowy than a campfire ~1.1)', () => {
    for (const [id] of GROVES) {
      const glow = resourceObjectService.getById(id)!.glow;
      expect(glow, id).toBeDefined();
      expect(glow!.color).toHaveLength(3);
      expect(glow!.intensity).toBeGreaterThan(0);
      expect(glow!.intensity).toBeLessThan(0.7); // dimmer than fire
      expect(glow!.radius).toBeGreaterThan(0);
    }
  });

  it('collectResourceEmitters emits at grove tiles and ignores mundane trees', () => {
    const map: WorldTile[][] = [
      [tile(0, 0, { heartwood_grove: 1 }), tile(1, 0, { pine_tree: 1 })],
      [tile(0, 1, {}), tile(1, 1, { emberwood_grove: 2 })]
    ];
    const emitters = lightingService.collectResourceEmitters(map);
    expect(emitters).toHaveLength(2); // heartwood + emberwood, not the pine
    const at = (x: number, y: number) => emitters.find((e) => e.x === x && e.y === y);
    expect(at(0, 0)).toBeDefined();
    expect(at(1, 1)).toBeDefined();
    expect(at(1, 0)).toBeUndefined(); // pine tree has no glow
    // emberwood flickers (fire-themed), heartwood is a steady glow
    expect(at(1, 1)!.flicker).toBe(true);
    expect(at(0, 0)!.flicker).toBe(false);
  });

  it('a depleted (0-qty) grove resource emits no light', () => {
    const emitters = lightingService.collectResourceEmitters([
      [tile(0, 0, { heartwood_grove: 0 })]
    ]);
    expect(emitters).toHaveLength(0);
  });
});
