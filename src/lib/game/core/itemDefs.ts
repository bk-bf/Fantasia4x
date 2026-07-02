// O(1) id lookup over the static item DB (items.jsonc) at the CORE layer. The DB never mutates at
// runtime, so it indexes once. This is the lookup core modules (PawnEquipment…) must use —
// importing `itemService` from core reaches UP into the services layer and closed a
// PawnEquipment → ItemService → EnvironmentService → … → PawnStatService → PawnEquipment module
// cycle. ItemService.getItemById delegates here, so there is exactly one index.
import itemsData from '../database/items.jsonc';
import type { Item } from './types';

const ITEMS_DATABASE = itemsData as unknown as Item[];

let _byId: Map<string, Item> | null = null;

/** The static item DEFINITION for an id, or undefined. */
export function itemDefById(id: string): Item | undefined {
  return (_byId ??= new Map(ITEMS_DATABASE.map((i) => [i.id, i]))).get(id);
}

/**
 * `category:<cat>` cost/slot match. Real item categories match by `item.category`; the special
 * pseudo-category **`plank`** matches ANY sawn plank (pine/oak/birch/ash/yew + magic-wood planks),
 * so a building cost (`category:plank`) or recipe slot can ask for "any plank" rather than hardcoding
 * `pine_plank`. Add further pseudo-categories here as the single chokepoint. (Was pasted into both
 * ItemService and BuildingService to dodge a service↔service cycle; core is below both, so one copy.)
 */
export function itemMatchesCostCategory(
  item: { id: string; category?: string },
  cat: string
): boolean {
  if (cat === 'plank') return item.id.endsWith('_plank');
  if (cat === 'log') return item.id.endsWith('_log');
  return item.category === cat;
}
