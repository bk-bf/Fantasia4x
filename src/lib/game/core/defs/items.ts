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

export function itemMatchesCostCategory(
  item: { id: string; category?: string; type?: string },
  cat: string
): boolean {
  if (cat === 'plank') return item.id.endsWith('_plank');
  if (cat === 'log') return item.id.endsWith('_log');
  if (cat === 'fastener')
    return /_nail$|_rivet$|_tack$/.test(item.id) && item.type !== 'weapon' && item.type !== 'tool';
  if (cat === 'thread')
    return item.category === 'binding' && !/^cordage$|^rope$|_rope$|_cordage$/.test(item.id);
  if (item.type === 'armor' || item.type === 'weapon' || item.type === 'tool') return false;
  return item.category === cat;
}
