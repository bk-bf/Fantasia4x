import { describe, it, expect } from 'vitest';
import { itemService } from '$lib/game/services/ItemService';
import {
  categoryPath,
  buildCategoryTree,
  collectItemIds,
  labelFor
} from '$lib/components/util/itemCategoryTree';
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
    expect(categoryPath(def('iron_boss_shield'))).toEqual(['weapons', 'shields']);
  });

  it('routes natural weapons under weapons/natural', () => {
    expect(categoryPath(def('fists'))).toEqual(['weapons', 'natural']);
  });

  it('falls back to a single-element Other path for a category with no route', () => {
    expect(categoryPath({ id: '', name: '', category: 'no_such_category' } as Item)).toEqual([
      'other'
    ]);
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

  it('routes every category in the item database somewhere other than Other', () => {
    const uncovered = itemService
      .getAllCategories()
      .filter((cat) => categoryPath({ id: '', name: '', category: cat } as Item)[0] === 'other');
    expect(uncovered).toEqual([]);
  });
});

describe('itemCategoryTree.buildCategoryTree', () => {
  it('builds a nested tree and rolls subtree ids up to parents', () => {
    // inserted cutting before blunt so an insertion-order pass would fail this
    const items = ['steel_longsword', 'steel_mace', 'war_bow'].map(def);
    const tree = buildCategoryTree(items);
    const weapons = tree.find((n) => n.key === 'weapons');
    expect(weapons).toBeDefined();
    expect(collectItemIds(weapons!).sort()).toEqual(items.map((i) => i.id).sort());
    const melee = weapons!.children.find((c) => c.key === 'melee');
    expect(melee!.children.map((c) => c.key)).toEqual(['blunt', 'cutting']);
  });

  it('seeds empty branches when asked', () => {
    const tree = buildCategoryTree([], { seedLeaves: [['materials', 'wood']] });
    const materials = tree.find((n) => n.key === 'materials');
    expect(materials?.children.map((c) => c.key)).toContain('wood');
  });

  it('orders root categories by TOP_ORDER, not by insertion or key alphabetically', () => {
    const items = [
      { id: 'seed1', name: 'Seed', category: 'grain_seed' } as Item,
      { id: 'weapon1', name: 'Weapon', category: 'combat' } as Item,
      { id: 'tool1', name: 'Tool', category: 'mining' } as Item
    ];
    const tree = buildCategoryTree(items);
    expect(tree.map((n) => n.key)).toEqual(['tools', 'weapons', 'seeds']);
  });

  it('orders sibling categories by label, not by key', () => {
    const items = [
      { id: 'soil1', name: 'Soil Sample', category: 'soil' } as Item,
      { id: 'hide1', name: 'Hide Scrap', category: 'hide' } as Item
    ];
    const tree = buildCategoryTree(items);
    const materials = tree.find((n) => n.key === 'materials');
    // 'Hides & Textiles' sorts before 'Soil', even though the key 'soil' sorts before 'textiles'
    expect(materials!.children.map((c) => c.key)).toEqual(['textiles', 'soil']);
  });

  it('orders items within a category by name, not by id', () => {
    const items = [
      { id: 'aaa_second', name: 'Zebra Soil', category: 'soil' } as Item,
      { id: 'zzz_first', name: 'Alpha Soil', category: 'soil' } as Item
    ];
    const tree = buildCategoryTree(items);
    const soil = tree.find((n) => n.key === 'materials')!.children.find((c) => c.key === 'soil');
    expect(soil!.items.map((i) => i.id)).toEqual(['zzz_first', 'aaa_second']);
  });

  it('filters items by a case-insensitive name query', () => {
    const items = [
      { id: 'i1', name: 'Alpha Blade', category: 'combat' } as Item,
      { id: 'i2', name: 'Beta Shield', category: 'combat' } as Item
    ];
    const tree = buildCategoryTree(items, { query: 'ALPHA' });
    const weapons = tree.find((n) => n.key === 'weapons');
    expect(collectItemIds(weapons!)).toEqual(['i1']);
  });
});

describe('itemCategoryTree.labelFor', () => {
  it('maps a known category key to its display label', () => {
    expect(labelFor('metals')).toBe('Metals & Ores');
    expect(labelFor('melee')).toBe('Melee Weapons');
  });

  it('humanizes an unmapped key by replacing underscores and title-casing', () => {
    expect(labelFor('some_unmapped_key')).toBe('Some Unmapped Key');
  });
});
