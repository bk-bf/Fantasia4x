// O(1) id lookup over the static item DB (items.jsonc) at the CORE layer. The DB never mutates at
// runtime, so it indexes once. This is the lookup core modules (PawnEquipment…) must use —
// importing `itemService` from core reaches UP into the services layer and closed a
// PawnEquipment → ItemService → EnvironmentService → … → PawnStatService → PawnEquipment module
// cycle. ItemService.getItemById delegates here, so there is exactly one index.
import itemsData from '../database/items/items.jsonc';
import type { Item } from './types';

const ITEMS_DATABASE = itemsData as unknown as Item[];

let _byId: Map<string, Item> | null = null;

/** The static item DEFINITION for an id, or undefined. `isCarcass` is derived from `category` at index
 *  time (the data files never set it) so every carcass-detecting consumer — butchery dispatch, craft
 *  yield-condition scaling — sees it from the one index. */
export function itemDefById(id: string): Item | undefined {
  return (_byId ??= new Map(
    ITEMS_DATABASE.map((i) => [i.id, i.category === 'carcass' ? { ...i, isCarcass: true } : i])
  )).get(id);
}

/** The full static item DB (read-only) — for whole-catalogue scans (caravan stock, wealth). */
export function allItemDefs(): readonly Item[] {
  return ITEMS_DATABASE;
}

/**
 * `category:<cat>` cost/slot match. Real item categories match by `item.category`; the special
 * pseudo-category **`plank`** matches ANY sawn plank (pine/oak/birch/ash/yew + magic-wood planks),
 * so a building cost (`category:plank`) or recipe slot can ask for "any plank" rather than hardcoding
 * `pine_plank`. Add further pseudo-categories here as the single chokepoint. (Was pasted into both
 * ItemService and BuildingService to dodge a service↔service cycle; core is below both, so one copy.)
 */
export function itemMatchesCostCategory(
  item: { id: string; category?: string; type?: string },
  cat: string
): boolean {
  if (cat === 'plank') return item.id.endsWith('_plank');
  if (cat === 'log') return item.id.endsWith('_log');
  // A FASTENER is whatever the colony currently pins things with — a tack, a nail, a rivet. Which
  // metal it is does not change the job, so a recipe asks for the pool and takes what is to hand
  // rather than naming one and going unbuildable in every other age.
  if (cat === 'fastener')
    return /_nail$|_rivet$|_tack$/.test(item.id) && item.type !== 'weapon' && item.type !== 'tool';
  // THREAD grade: the binding pool with the LASHINGS taken out. Cordage and rope tie things together
  // from the outside; everything else in the pool goes through a needle. Defined by what it excludes
  // rather than by a craftValue floor, so a better thread — silk, enchanted — is never accidentally
  // shut out of a recipe for being worth more than plain thread.
  if (cat === 'thread')
    return item.category === 'binding' && !/^cordage$|^rope$|_rope$|_cordage$/.test(item.id);
  // A `category:<cat>` cost/slot consumes raw stock — a material (or food, for cooking slots), never a
  // finished weapon/armour/tool. Those carry a `category` that doubles as their armour CLASS
  // (leather/metal/cloth), so without this guard a `category:leather` grip could be "crafted" from a
  // finished leather jerkin. Exclude the equipment types.
  if (item.type === 'armor' || item.type === 'weapon' || item.type === 'tool') return false;
  return item.category === cat;
}
