/**
 * itemCategoryTree — the single source of truth for grouping items into a nested, human-labelled
 * category taxonomy. The raw `items.jsonc` `category` is a flat ~60-value string soup (with 14
 * one-item `*_seed` categories); this collapses it into a readable tree:
 *
 *   Tools · Weapons (Melee→Cutting/Blunt/Piercing, Ranged→…, Ammunition, Shields, Natural) ·
 *   Consumables (Food→Meat/Produce/Meals, Drinks, Medicine, Spoiled) · Seeds · Materials · Goods
 *
 * Like `bodyLabels.ts`, this is the ONE chokepoint that turns backend ids into player-facing labels —
 * panels render `node.label`, never a raw category id (AGENTS "never leak ids in the UI"). Used by
 * `ItemFilterChecklist`, `StockpileZonePanel`, and `ResourceSidebar` so categories read identically
 * everywhere.
 */
import type { Item } from '$lib/game/core/types.js';

/** Tool item-categories that are work-category bound (Work.ts `toolsRequired`). */
const TOOL_CATEGORIES = new Set([
  'woodcutting',
  'digging',
  'mining',
  'planting',
  'harvesting',
  'hunting',
  'butchery',
  'crafting',
  'cooking',
  'hauling',
  'metalworking'
]);

/** Flat-category → fixed path, for everything that isn't resolved by item-shape (combat/seeds). */
const STATIC_CATEGORY_PATH: Record<string, string[]> = {
  // consumables
  meat: ['consumables', 'food', 'meat'],
  fish: ['consumables', 'food', 'meat'],
  fruit: ['consumables', 'food', 'produce'],
  vegetable: ['consumables', 'food', 'produce'],
  grain: ['consumables', 'food', 'produce'],
  legume: ['consumables', 'food', 'produce'],
  herb: ['consumables', 'food', 'produce'],
  meal: ['consumables', 'food', 'meals'],
  food: ['consumables', 'food', 'meals'],
  cooking: ['consumables', 'food', 'meals'],
  consumable: ['consumables', 'food', 'meals'],
  drink: ['consumables', 'drinks'],
  medicine: ['consumables', 'medicine'],
  spoiled: ['consumables', 'spoiled'],
  // materials
  wood: ['materials', 'wood'],
  magic_wood: ['materials', 'wood'],
  stone: ['materials', 'stone'],
  block: ['materials', 'stone'],
  construction: ['materials', 'stone'],
  metal: ['materials', 'metals'],
  ore: ['materials', 'metals'],
  gem: ['materials', 'gems'],
  magic_gem: ['materials', 'gems'],
  crystal: ['materials', 'gems'],
  magic_crystal: ['materials', 'gems'],
  leather: ['materials', 'textiles'],
  cloth: ['materials', 'textiles'],
  fiber: ['materials', 'textiles'],
  organic: ['materials', 'organic'],
  carcass: ['materials', 'organic'],
  soil: ['materials', 'soil'],
  // goods
  jewelry: ['goods', 'jewelry'],
  light: ['goods', 'light'],
  fuel: ['goods', 'fuel'],
  storage: ['goods', 'storage'],
  primitive: ['goods', 'primitive']
};

/** Resolve a combat item into a weapons sub-path using its `weaponProperties`. */
function combatPath(item: Item): string[] {
  if (/shield/.test(item.id)) return ['weapons', 'shields'];
  const w = item.weaponProperties;
  const dmg = w?.damageType ?? 'other';
  const ranged = !!w && ((w.range ?? 0) > 1 || !!w.ammoCategory || !!w.channeled || !!w.drawPower);
  return ['weapons', ranged ? 'ranged' : 'melee', dmg];
}

/** Ordered node-key path for an item, e.g. `['weapons','melee','cutting']`. */
export function categoryPath(item: Item): string[] {
  const cat = item.category || 'other';
  if (cat === 'combat') return combatPath(item);
  if (cat === 'ammunition') return ['weapons', 'ammunition'];
  if (cat === 'natural_weapon') return ['weapons', 'natural'];
  if (cat.endsWith('_seed')) return ['seeds'];
  if (TOOL_CATEGORIES.has(cat)) return ['tools', cat];
  return STATIC_CATEGORY_PATH[cat] ?? ['other'];
}

/**
 * Best-effort path from a bare category STRING (no item shape) — used only to seed empty branches
 * (e.g. ResourceSidebar's "show all categories"). Combat can't be sub-typed without an item, so it
 * seeds the generic `weapons` parent; real weapon items still create the melee/ranged leaves.
 */
export function categoryKeyPath(category: string): string[] {
  if (category === 'combat') return ['weapons'];
  if (category === 'ammunition') return ['weapons', 'ammunition'];
  if (category === 'natural_weapon') return ['weapons', 'natural'];
  if (category.endsWith('_seed')) return ['seeds'];
  if (TOOL_CATEGORIES.has(category)) return ['tools', category];
  return STATIC_CATEGORY_PATH[category] ?? ['other'];
}

/** Human label per node key. Fallback = humanized key (Title Case, underscores → spaces). */
export const CATEGORY_LABELS: Record<string, string> = {
  tools: 'Tools',
  weapons: 'Weapons',
  melee: 'Melee Weapons',
  ranged: 'Ranged Weapons',
  cutting: 'Cutting',
  blunt: 'Blunt',
  piercing: 'Piercing',
  fire: 'Fire',
  frost: 'Frost',
  lightning: 'Lightning',
  ammunition: 'Ammunition',
  shields: 'Shields',
  natural: 'Natural Weapons',
  consumables: 'Consumables',
  food: 'Food',
  meat: 'Meat & Fish',
  produce: 'Produce',
  meals: 'Meals',
  drinks: 'Drinks',
  medicine: 'Medicine',
  spoiled: 'Spoiled',
  seeds: 'Seeds',
  materials: 'Materials',
  wood: 'Wood',
  stone: 'Stone & Masonry',
  metals: 'Metals & Ores',
  gems: 'Gems & Crystals',
  textiles: 'Hides & Textiles',
  organic: 'Organic',
  soil: 'Soil',
  goods: 'Goods',
  jewelry: 'Jewelry',
  light: 'Lighting',
  fuel: 'Fuel',
  storage: 'Containers',
  primitive: 'Primitive',
  other: 'Other'
};

/** Fixed display order for top-level groups; anything else falls to the end, then alpha. */
const TOP_ORDER = ['tools', 'weapons', 'consumables', 'seeds', 'materials', 'goods', 'other'];

export function labelFor(key: string): string {
  return CATEGORY_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export type TreeNode = {
  /** This node's key (last path segment). */
  key: string;
  /** Player-facing label. */
  label: string;
  /** Full path from the root, e.g. `['weapons','melee','cutting']` — a stable per-node id. */
  path: string[];
  children: TreeNode[];
  /** Items directly bucketed at this node (leaf). Parents normally have none. */
  items: Item[];
};

function orderKey(key: string): number {
  const i = TOP_ORDER.indexOf(key);
  return i === -1 ? TOP_ORDER.length : i;
}

/**
 * Build the nested category tree from the items present. Empty branches don't appear (matching the
 * old flat behaviour). Top level is sorted by `TOP_ORDER` then alpha; deeper levels alpha by label;
 * leaf items by name. `opts.query` filters items by name (case-insensitive) before building.
 */
export function buildCategoryTree(
  items: Item[],
  opts: { query?: string; seedLeaves?: string[][] } = {}
): TreeNode[] {
  const q = opts.query?.trim().toLowerCase() ?? '';
  const roots: TreeNode[] = [];
  const byPath = new Map<string, TreeNode>();

  function ensure(path: string[]): TreeNode {
    const id = path.join('/');
    const existing = byPath.get(id);
    if (existing) return existing;
    const key = path[path.length - 1];
    const node: TreeNode = { key, label: labelFor(key), path, children: [], items: [] };
    byPath.set(id, node);
    if (path.length === 1) roots.push(node);
    else ensure(path.slice(0, -1)).children.push(node);
    return node;
  }

  // Seed empty branches first (so categories with no items still appear when requested).
  for (const path of opts.seedLeaves ?? []) ensure(path);

  for (const item of items) {
    if (q && !item.name.toLowerCase().includes(q)) continue;
    ensure(categoryPath(item)).items.push(item);
  }

  function sortNode(node: TreeNode) {
    node.items.sort((a, b) => a.name.localeCompare(b.name));
    node.children.sort((a, b) => a.label.localeCompare(b.label));
    node.children.forEach(sortNode);
  }
  roots.forEach(sortNode);
  roots.sort((a, b) => orderKey(a.key) - orderKey(b.key) || a.label.localeCompare(b.label));
  return roots;
}

/** Flatten a node's whole subtree into its leaf item ids (for tri-state toggles / counts). */
export function collectItemIds(node: TreeNode): string[] {
  const ids: string[] = [];
  const walk = (n: TreeNode) => {
    for (const it of n.items) ids.push(it.id);
    n.children.forEach(walk);
  };
  walk(node);
  return ids;
}
