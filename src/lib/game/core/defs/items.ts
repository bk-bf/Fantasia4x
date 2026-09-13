import itemsData from '../../database/items/items.json';
import type { Item } from '../types';

const ITEMS_DATABASE = itemsData as unknown as Item[];

let _byId: Map<string, Item> | null = null;

export function itemDefById(id: string): Item | undefined {
  return (_byId ??= new Map(
    ITEMS_DATABASE.map((i) => [i.id, i.category === 'carcass' ? { ...i, isCarcass: true } : i])
  )).get(id);
}

export function allItemDefs(): readonly Item[] {
  return ITEMS_DATABASE;
}
