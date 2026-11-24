import { describe, it, expect } from 'vitest';
import items from '$lib/game/database/items/items.json';
import storage from '$lib/game/database/items/storage.json';
import type { Item } from '$lib/game/core/types';
import {
  LONG_KINDS,
  LONG_STACK_SIZE,
  PILE_CLASSES,
  PILE_STACK_SIZE,
  itemStorage,
  ownStorageIds,
  stackSize,
  stageCount,
  storageStage,
  type ItemStorage
} from '$lib/game/services/storageRules';

const ITEMS = items as unknown as Item[];
const byId = new Map(ITEMS.map((i) => [i.id, i]));
const of = (id: string): ItemStorage => itemStorage(byId.get(id)!);

describe('item storage classes', () => {
  it('gives every item in the database a class it knows and a stack size', () => {
    const unclassified: string[] = [];
    for (const item of ITEMS) {
      const s = itemStorage(item);
      const known =
        (s.kind === 'pile' && PILE_CLASSES.includes(s.pile)) ||
        (s.kind === 'long' && LONG_KINDS.includes(s.long)) ||
        (s.kind === 'loose' && s.family.length > 0);
      if (!known || !(stackSize(item) >= 1)) unclassified.push(item.id);
    }
    expect(unclassified).toEqual([]);
  });

  it('sends no material, food or fluid to the pile for unsorted goods', () => {
    const unsorted = ITEMS.filter((i) => {
      const s = itemStorage(i);
      return s.kind === 'pile' && s.pile === 'crates';
    }).map((i) => i.id);
    expect(unsorted).toEqual([]);
  });

  it('classes by type and category', () => {
    expect(of('oak_log')).toEqual({ kind: 'pile', pile: 'logs' });
    expect(of('oak_plank')).toEqual({ kind: 'pile', pile: 'planks' });
    expect(of('granite_block')).toEqual({ kind: 'pile', pile: 'blocks' });
    expect(of('hematite')).toEqual({ kind: 'pile', pile: 'rubble' });
    expect(of('iron_bar')).toEqual({ kind: 'pile', pile: 'bars' });
    expect(of('wheat')).toEqual({ kind: 'pile', pile: 'sacks' });
    expect(of('grain_seed')).toEqual({ kind: 'pile', pile: 'sacks' });
    expect(of('venison')).toEqual({ kind: 'pile', pile: 'meat' });
    expect(of('small_stew')).toEqual({ kind: 'pile', pile: 'pots' });
    expect(of('ale')).toEqual({ kind: 'pile', pile: 'fluids' });
    expect(of('deer_hide')).toEqual({ kind: 'pile', pile: 'hides' });
    expect(of('linen_cloth')).toEqual({ kind: 'pile', pile: 'cloth' });
    expect(of('cabbage')).toEqual({ kind: 'pile', pile: 'baskets' });
  });

  it('classes weapons and tools as long items by what their id names', () => {
    expect(of('steel_longsword')).toEqual({ kind: 'long', long: 'sword', tool: false });
    expect(of('steel_boar_spear')).toEqual({ kind: 'long', long: 'spear', tool: false });
    expect(of('self_bow')).toEqual({ kind: 'long', long: 'bow', tool: false });
    expect(of('iron_axe')).toEqual({ kind: 'long', long: 'axe', tool: true });
    expect(of('iron_hoe')).toEqual({ kind: 'long', long: 'hoe', tool: true });
    expect(of('iron_pick')).toEqual({ kind: 'long', long: 'pick', tool: true });
    expect(of('iron_tongs')).toEqual({ kind: 'long', long: 'tongs', tool: true });
  });

  it('lets an item named in storage.json override its type and category', () => {
    expect(of('iron_nail')).toEqual({
      kind: 'loose',
      family: 'fastener',
      own: true,
      tuck: 'low',
      stages: [18, 59]
    });
    expect(of('plank_round_shield')).toMatchObject({ kind: 'loose', family: 'shield' });
    expect(of('goblin_net')).toMatchObject({ family: 'kit', tuck: 'none' });
  });

  it('classes gear with no row of its own by the slot it is worn on', () => {
    const worn = (id: string, slot: string, extra: Partial<Item> = {}) =>
      itemStorage({
        id,
        type: 'armor',
        category: 'leather',
        armorProperties: { slot },
        ...extra
      } as Item);
    expect(worn('new_helm', 'head')).toMatchObject({ family: 'helm', own: false, tuck: 'lush' });
    expect(worn('new_hood', 'head')).toMatchObject({ family: 'roll' });
    expect(worn('new_plate', 'torso', { category: 'metal' })).toMatchObject({ family: 'cuirass' });
    expect(worn('new_shoes', 'feet')).toMatchObject({ family: 'boots' });
    expect(worn('new_buckler', 'offHand')).toMatchObject({ family: 'shield' });
    expect(
      itemStorage({ id: 'new_pack', type: 'tool', category: 'storage' } as Item)
    ).toMatchObject({ family: 'pack', tuck: 'low' });
    expect(itemStorage({ id: 'new_keg', type: 'tool', category: 'storage' } as Item)).toEqual({
      kind: 'pile',
      pile: 'fluids'
    });
  });

  it('names only items the database has in storage.json', () => {
    expect(ownStorageIds().filter((id) => !byId.has(id))).toEqual([]);
  });

  it('keeps every staged row rising up to its stack size', () => {
    for (const [id, row] of Object.entries(
      storage as Record<string, { stages?: number[]; stack?: number }>
    )) {
      if (!row.stages) continue;
      const rising = [...row.stages, row.stack!];
      expect(
        rising.every((n, i) => i === 0 || n > rising[i - 1]),
        id
      ).toBe(true);
    }
  });
});

describe('stack sizes and stages', () => {
  it('reads a pile stack size from its class, three for long items, the last stage for staged', () => {
    expect(stackSize(byId.get('oak_log')!)).toBe(PILE_STACK_SIZE.logs);
    expect(stackSize(byId.get('steel_longsword')!)).toBe(LONG_STACK_SIZE);
    expect(stackSize(byId.get('flint_arrow')!)).toBe(80);
    expect(stackSize(byId.get('plank_round_shield')!)).toBe(1);
  });

  it('fills a pile in three stages at a quarter and at 65 percent of its stack size', () => {
    const logs = of('oak_log');
    expect(stageCount(logs)).toBe(3);
    expect([1, 7, 8, 19, 20, 30, 400].map((q) => storageStage(logs, q))).toEqual([
      0, 0, 1, 1, 2, 2, 2
    ]);
  });

  it('stages an item with its own sprites at the bounds in its row', () => {
    const arrows = of('flint_arrow');
    expect(stageCount(arrows)).toBe(4);
    expect([1, 12, 13, 30, 31, 60, 61, 500].map((q) => storageStage(arrows, q))).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3
    ]);
  });

  it('draws one stage for a long item or an unstaged one', () => {
    expect(stageCount(of('steel_longsword'))).toBe(1);
    expect(storageStage(of('steel_longsword'), 3)).toBe(0);
    expect(storageStage(of('plank_round_shield'), 5)).toBe(0);
  });
});
