import type { Item } from '$lib/game/core/types.js';

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

const STATIC_CATEGORY_PATH: Record<string, string[]> = {
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
  jewelry: ['goods', 'jewelry'],
  light: ['goods', 'light'],
  fuel: ['goods', 'fuel'],
  storage: ['goods', 'storage'],
  primitive: ['goods', 'primitive']
};

function combatPath(item: Item): string[] {
  if (/shield/.test(item.id)) return ['weapons', 'shields'];
  const w = item.weaponProperties;
  const dmg = w?.damageType ?? 'other';
  const ranged = !!w && ((w.range ?? 0) > 1 || !!w.ammoCategory || !!w.channeled || !!w.drawPower);
  return ['weapons', ranged ? 'ranged' : 'melee', dmg];
}

export function categoryPath(item: Item): string[] {
  const cat = item.category || 'other';
  if (cat === 'combat') return combatPath(item);
  if (cat === 'ammunition') return ['weapons', 'ammunition'];
  if (cat === 'natural_weapon') return ['weapons', 'natural'];
  if (cat.endsWith('_seed')) return ['seeds'];
  if (TOOL_CATEGORIES.has(cat)) return ['tools', cat];
  return STATIC_CATEGORY_PATH[cat] ?? ['other'];
}

export function categoryKeyPath(category: string): string[] {
  if (category === 'combat') return ['weapons'];
  if (category === 'ammunition') return ['weapons', 'ammunition'];
  if (category === 'natural_weapon') return ['weapons', 'natural'];
  if (category.endsWith('_seed')) return ['seeds'];
  if (TOOL_CATEGORIES.has(category)) return ['tools', category];
  return STATIC_CATEGORY_PATH[category] ?? ['other'];
}

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

const TOP_ORDER = ['tools', 'weapons', 'consumables', 'seeds', 'materials', 'goods', 'other'];

export function labelFor(key: string): string {
  return CATEGORY_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export type TreeNode = {
  key: string;
  label: string;
  path: string[];
  children: TreeNode[];
  items: Item[];
};

function orderKey(key: string): number {
  const i = TOP_ORDER.indexOf(key);
  return i === -1 ? TOP_ORDER.length : i;
}

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

export function collectItemIds(node: TreeNode): string[] {
  const ids: string[] = [];
  const walk = (n: TreeNode) => {
    for (const it of n.items) ids.push(it.id);
    n.children.forEach(walk);
  };
  walk(node);
  return ids;
}
