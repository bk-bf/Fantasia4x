import { describe, it, expect } from 'vitest';
import { itemService } from '$lib/game/services/ItemService';
import { categoryPath, buildCategoryTree, collectItemIds } from '$lib/utils/itemCategoryTree';
import type { Item } from '$lib/game/core/types';

function def(id: string): Item {
  const item = itemService.getItemById(id);
  if (!item) throw new Error(`missing test item ${id}`);
  return item;
}

describe('itemCategoryTree.categoryPath', () => {
  it('routes melee weapons by damage type', () => {
    expect(categoryPath(def('steel_mace'))).toEqual(['weapons', 'melee', 'blunt']);
    expect(categoryPath(def('steel_longsword'))).toEqual(['weapons', 'melee', 'cutting']);
    expect(categoryPath(def('steel_rapier'))).toEqual(['weapons', 'melee', 'piercing']);
  });

  it('routes ranged weapons (range/ammo/staff) under ranged, by damage type', () => {
    expect(categoryPath(def('war_bow'))).toEqual(['weapons', 'ranged', 'blunt']);
    expect(categoryPath(def('ember_staff'))).toEqual(['weapons', 'ranged', 'fire']);
  });

  it('routes shields and ammunition', () => {
    expect(categoryPath(def('sling_stone'))).toEqual(['weapons', 'ammunition']);
    expect(categoryPath(def('iron_boss_shield'))[1]).toBe('shields');
  });

  it('routes tools by their work category', () => {
    expect(categoryPath(def('stone_pick'))).toEqual(['tools', 'mining']);
  });

  it('collapses every *_seed into one Seeds group', () => {
    expect(categoryPath(def('apple_seed'))).toEqual(['seeds']);
  });

  it('nests food under consumables', () => {
    expect(categoryPath(def('spit_meat'))).toEqual(['consumables', 'food', 'meals']);
  });
});

describe('itemCategoryTree.buildCategoryTree', () => {
  it('builds a nested tree and rolls subtree ids up to parents', () => {
    const items = ['steel_mace', 'steel_longsword', 'war_bow'].map(def);
    const tree = buildCategoryTree(items);
    const weapons = tree.find((n) => n.key === 'weapons');
    expect(weapons).toBeDefined();
    expect(collectItemIds(weapons!).sort()).toEqual(items.map((i) => i.id).sort());
    // melee → cutting + blunt leaves exist under weapons
    const melee = weapons!.children.find((c) => c.key === 'melee');
    expect(melee!.children.map((c) => c.key).sort()).toEqual(['blunt', 'cutting']);
  });

  it('seeds empty branches when asked', () => {
    const tree = buildCategoryTree([], { seedLeaves: [['materials', 'wood']] });
    const materials = tree.find((n) => n.key === 'materials');
    expect(materials?.children.map((c) => c.key)).toContain('wood');
  });
});
