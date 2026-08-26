// buildingTree.ts — the /gear-db BUILDINGS view. Same idea as `itemTree`: a branch says what a
// building IS, and the AGE level underneath says when a colony can raise it.
//
// Buildings were only ever visible as the "Made at" column on an item row, which answers "where is
// this made" and never "what does this age actually give me to build, and what is missing". The
// station LADDERS in particular — cooking 0–5, tailoring 0–4, lapidary 0–3, butchery 0–3 — are
// invisible in a flat list and obvious as a tree: a family with one rung is a hole.

import buildingsData from '../game/database/world/buildings.jsonc';
import recipesData from '../game/database/items/recipes.jsonc';
import itemsData from '../game/database/items/items.jsonc';
import { AGE_NAMES } from './chainAge';

/* eslint-disable @typescript-eslint/no-explicit-any */
const buildings = buildingsData as any[];
const recipes = recipesData as any[];

const prettify = (id: string) => id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * What each station MAKES, named for the thing it produces. A count answers "is anything made here"
 * and nothing else; the list answers "is the RIGHT thing made here", which is the audit question —
 * cheese on a cupboard and hams on a storage rail were both a wrong name in a list, invisible as a
 * number.
 */
const ITEM_NAME = new Map<string, string>(
  (itemsData as any[]).filter((i) => i?.id).map((i) => [i.id, i.name ?? prettify(i.id)])
);
const RECIPES_AT = new Map<string, string[]>();
for (const r of recipes) {
  if (!r?.station) continue;
  const out = Object.keys(r.outputs ?? {});
  const label = out.length
    ? out.map((o) => ITEM_NAME.get(o) ?? prettify(o)).join(' + ')
    : prettify(String(r.id).replace(/^(make|carve|bake|brew|smelt|cast|melt|tan|spin)_/, ''));
  RECIPES_AT.set(r.station, [...(RECIPES_AT.get(r.station) ?? []), label]);
}
for (const list of RECIPES_AT.values()) list.sort((a, b) => a.localeCompare(b));

const LEGACY_LADDER: [string, string][] = [
  ['cookingTier', 'cooking'],
  ['butcheryTier', 'butchery'],
  ['lapidaryTier', 'lapidary'],
  ['tailoringTier', 'tailoring']
];

const laddersOf = (b: any): { family: string; rung: number }[] => {
  const e = b?.effects ?? {};
  const out: { family: string; rung: number }[] = [];
  if (typeof e.family === 'string' && typeof e.rung === 'number')
    out.push({ family: e.family, rung: e.rung });
  for (const [key, family] of LEGACY_LADDER)
    if (typeof e[key] === 'number' && !out.some((l) => l.family === family))
      out.push({ family, rung: e[key] as number });
  return out;
};

const INHERITED = new Map<string, string[]>();
for (const b of buildings) {
  const mine = laddersOf(b);
  if (!mine.length) continue;
  const below = buildings.filter(
    (o: any) =>
      o.id !== b.id &&
      laddersOf(o).some((l) => mine.some((m) => m.family === l.family && l.rung < m.rung))
  );
  const labels = below.flatMap((o: any) => RECIPES_AT.get(o.id) ?? []);
  if (labels.length) INHERITED.set(b.id, [...new Set(labels)].sort((x, y) => x.localeCompare(y)));
}

export const BUILD_AGES = ['Primitive', 'Copper', 'Bronze', 'Iron', 'Steel', 'Runed'] as const;
export type BuildAge = (typeof BUILD_AGES)[number];

const ageOf = (b: any): BuildAge => {
  const word = String(b?.ageTier ?? 'primitive').split(':')[0];
  const i = AGE_NAMES.indexOf(word as never);
  return BUILD_AGES[i < 0 ? 0 : i];
};

/**
 * The station LADDER a building belongs to, if any — the four tier families plus the generic craft
 * tier. This is the level that makes a missing rung visible.
 */
const FAMILY_LABEL: Record<string, string> = {
  cooking: 'Hearth & stove',
  butchery: 'Butchery',
  lapidary: 'Lapidary',
  tailoring: 'Tailoring',
  milling: 'Milling',
  baking: 'Baking',
  brewing: 'Brewing',
  alchemy: 'Alchemy',
  crafting: 'General crafting'
};
/** the older per-family keys, still read for a station that has not been migrated */
const LEGACY: [string, string][] = [
  ['cookingTier', 'cooking'],
  ['butcheryTier', 'butchery'],
  ['lapidaryTier', 'lapidary'],
  ['tailoringTier', 'tailoring'],
  ['tier', 'crafting']
];

/** The ladder a station is on, however it declares it. */
function ladderOf(b: any): { family: string; rung: number } | null {
  const e = b?.effects ?? {};
  if (typeof e.family === 'string' && typeof e.rung === 'number')
    return { family: e.family, rung: e.rung };
  for (const [key, family] of LEGACY)
    if (typeof e[key] === 'number') return { family, rung: e[key] };
  return null;
}

/** What a building is FOR. Read off what it enables, never off its name. */
function purposeOf(b: any): string {
  const e = b?.effects ?? {};
  const has = (k: string) => e[k] != null;
  const l = ladderOf(b);
  if (l) return FAMILY_LABEL[l.family] ?? prettify(l.family);
  if (has('smithingEnabled')) return 'Forging';
  if (has('smeltingEnabled')) return 'Smelting & alloying';
  if (has('bonecarvingEnabled')) return 'Bone & antler carving';
  if (has('bakingEnabled')) return 'Baking';
  if (has('brewingEnabled') || has('fermentation')) return 'Brewing';
  if (has('alchemyEnabled')) return 'Alchemy';
  if (has('woodworkingEnabled')) return 'Woodwork';
  if (has('leatherworkingEnabled')) return 'Leatherwork';
  if (has('lapidaryEnabled')) return 'Lapidary';
  if (has('farming') || has('catchItem')) return 'Land & water';
  if (b?.passive) return 'Passive processing';
  return 'Other work';
}

function storageOf(b: any): string {
  const f = b?.storageFilter;
  if (Array.isArray(f) && f.length) return f.map(prettify).join(' / ');
  return 'General stores';
}

function structureOf(b: any): string {
  const e = b?.effects ?? {};
  if (e.door) return 'Doors';
  if (e.roofSupport || /roof/.test(b.id)) return 'Roofs';
  if (e.floorSpeed != null || e.floorDryness != null || /floor|path|road/.test(b.id))
    return 'Floors';
  if (/wall|palisade|fence|gate/.test(b.id)) return 'Walls';
  return 'Other structure';
}

function furnitureOf(b: any): string {
  const e = b?.effects ?? {};
  if (e.fatigueRecovery != null || /bed|bunk|cot|bedroll/.test(b.id)) return 'Sleeping';
  if (e.daylight != null || e.lightRadius != null || /lamp|torch|lantern|candle/.test(b.id))
    return 'Light';
  if (e.comfort != null || e.beauty != null) return 'Comfort & beauty';
  return 'Other furniture';
}

/** The path a building files itself under. A building is a WORKSTATION, a STORE, or a part of the
 *  building itself — and it may be the first two at once, which is why storage is checked second
 *  rather than exclusively. */
function pathOf(b: any): string[] {
  const age = ageOf(b);
  if (b?.workstation) return ['Workstations', purposeOf(b), age];
  if (b?.storage) return ['Storage', storageOf(b), age];
  if (b?.category === 'structure') return ['Structure', structureOf(b), age];
  if (b?.category === 'shelter') return ['Shelter', age];
  if (b?.category === 'furniture') return ['Furniture', furnitureOf(b), age];
  return ['Other', age];
}

export interface BuildRow {
  id: string;
  name: string;
  path: string[];
  age: BuildAge;
  ageRank: number;
  /** rung within its ladder, or null for a building that is not in one */
  rung: number | null;
  /** crafting speed bonus, as a percentage */
  speed: number;
  /** yield/preservation/drying bonuses, as a percentage each, in one readout */
  boosts: string;
  /** how many stacks it keeps, and of what */
  stores: string;
  /** how much of a fuel charge it burns per tick; null when it needs no fire */
  fuel: number | null;
  /** recipes that name it as their station */
  makes: number;
  /** what those recipes produce, by name */
  recipes: string[];
  /** what it also runs by superseding every lower rung of its own ladder */
  inherited: string[];
  cost: string;
  work: number;
  desc: string;
}

/** Every bonus a station grants beyond raw speed, as one readable line. */
const BOOSTS: [string, string][] = [
  ['butcheryYieldBonus', 'yield'],
  ['treatmentBonus', 'treatment'],
  ['dryingBonus', 'drying'],
  ['preservation', 'keeps'],
  ['fermentation', 'ferments'],
  ['warmth', 'warmth'],
  ['comfort', 'comfort'],
  ['beauty', 'beauty']
];
const boostsOf = (b: any): string => {
  const e = b?.effects ?? {};
  return BOOSTS.filter(([k]) => e[k])
    .map(([k, label]) => `${label} +${e[k] > 3 ? e[k] : Math.round(e[k] * 100) + '%'}`)
    .join(' · ');
};

/** What a store holds, and how much of it. */
const storesOf = (b: any): string => {
  const stacks = b?.effects?.storageStacks;
  if (!stacks) return '';
  const f = b?.storageFilter;
  return Array.isArray(f) && f.length ? `${stacks} × ${f.length} kinds` : `${stacks} stacks`;
};

const costOf = (b: any): string =>
  Object.entries(b?.buildingCost ?? {})
    .map(([k, v]) => `${v}× ${prettify(k.replace(/^category:/, ''))}`)
    .join(', ');

const rungOf = (b: any): number | null => ladderOf(b)?.rung ?? null;

export const BUILD_ROWS: BuildRow[] = buildings
  .filter((b) => b?.id && !b.notBuildable)
  .map((b) => ({
    id: b.id,
    name: b.name ?? prettify(b.id),
    path: pathOf(b),
    age: ageOf(b),
    ageRank: BUILD_AGES.indexOf(ageOf(b)),
    rung: rungOf(b),
    speed: Math.round((b.effects?.craftingBonus ?? 0) * 100),
    boosts: boostsOf(b),
    stores: storesOf(b),
    fuel: b.fuelConsumptionRate ?? null,
    makes: (RECIPES_AT.get(b.id) ?? []).length,
    recipes: RECIPES_AT.get(b.id) ?? [],
    inherited: INHERITED.get(b.id) ?? [],
    cost: costOf(b),
    work: b.workAmount ?? 0,
    desc: b.description ?? ''
  }));

export interface BuildNode {
  key: string;
  label: string;
  depth: number;
  count: number;
  children: BuildNode[];
  rows: BuildRow[];
}

const ROOT_ORDER = ['Workstations', 'Storage', 'Shelter', 'Structure', 'Furniture', 'Other'];

export function buildBuildingTree(rows: BuildRow[] = BUILD_ROWS): BuildNode {
  const root: BuildNode = { key: '', label: '', depth: -1, count: 0, children: [], rows: [] };
  for (const r of rows) {
    let node = root;
    r.path.forEach((label, i) => {
      const key = r.path.slice(0, i + 1).join('|');
      let child = node.children.find((c) => c.key === key);
      if (!child) {
        child = { key, label, depth: i, count: 0, children: [], rows: [] };
        node.children.push(child);
      }
      child.count++;
      node = child;
    });
    node.rows.push(r);
  }
  (function sort(n: BuildNode) {
    n.children.sort((a, b) => {
      const ai = BUILD_AGES.indexOf(a.label as BuildAge);
      const bi = BUILD_AGES.indexOf(b.label as BuildAge);
      if (ai >= 0 && bi >= 0) return ai - bi; // the age ladder, not the alphabet
      const ar = ROOT_ORDER.indexOf(a.label);
      const br = ROOT_ORDER.indexOf(b.label);
      if (ar >= 0 && br >= 0) return ar - br;
      return a.label.localeCompare(b.label);
    });
    // a ladder reads by its rung, everything else by name
    n.rows.sort((a, b) => (a.rung ?? 99) - (b.rung ?? 99) || a.name.localeCompare(b.name));
    n.children.forEach(sort);
  })(root);
  root.count = rows.length;
  return root;
}

export const BUILDING_TREE = buildBuildingTree();

export type BuildSortKey =
  | 'name'
  | 'age'
  | 'rung'
  | 'speed'
  | 'boosts'
  | 'stores'
  | 'fuel'
  | 'makes'
  | 'recipes'
  | 'work'
  | 'cost';
export const BUILD_COLUMNS: { key: BuildSortKey; label: string; num?: boolean }[] = [
  { key: 'name', label: 'Building' },
  { key: 'age', label: 'Age' },
  { key: 'rung', label: 'Rung', num: true },
  { key: 'speed', label: 'Speed', num: true },
  { key: 'boosts', label: 'Also grants' },
  { key: 'stores', label: 'Stores' },
  { key: 'fuel', label: 'Fuel', num: true },
  { key: 'makes', label: 'Makes', num: true },
  { key: 'recipes', label: 'Recipes' },
  { key: 'work', label: 'Work', num: true },
  { key: 'cost', label: 'Built from' }
];

const valueOf = (r: BuildRow, k: BuildSortKey): number | string => {
  switch (k) {
    case 'age':
      return r.ageRank;
    case 'rung':
      return r.rung ?? -1;
    case 'fuel':
      return r.fuel ?? -1;
    case 'recipes':
      return r.recipes.join(', ');
    case 'speed':
    case 'makes':
    case 'work':
      return r[k];
    default:
      return r[k] ?? '';
  }
};

export function sortBuildingTree(
  node: BuildNode,
  key: BuildSortKey | null,
  dir: 1 | -1
): BuildNode {
  if (!key) return node;
  const cmp = (a: BuildRow, b: BuildRow) => {
    const av = valueOf(a, key);
    const bv = valueOf(b, key);
    const r =
      typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
    return r * dir;
  };
  const walk = (n: BuildNode): BuildNode => ({
    ...n,
    rows: [...n.rows].sort(cmp),
    children: n.children.map(walk)
  });
  return walk(node);
}

// ── the table's view of this data ───────────────────────────────────────────────────────────────
// Same instrument as the items view, pointed at buildings — see `treeView`.

import type { TreeSource, ViewNode, ViewRow } from './treeView';

const recipeCell = (b: BuildRow): string => {
  if (!b.recipes.length) return '';
  if (!b.inherited.length) return b.recipes.join(', ');
  return `${b.recipes.join(', ')} · supersedes: ${b.inherited.join(', ')}`;
};

const CELLS = (b: BuildRow): ViewRow['cells'] => [
  { v: b.name, cls: 'nm' },
  { v: b.age, cls: 'age' },
  { v: b.rung ?? '—', cls: 'num' },
  { v: b.speed ? `+${b.speed}%` : '', cls: 'num' },
  { v: b.boosts, cls: 'fx', title: b.boosts },
  { v: b.stores, cls: 'cls' },
  { v: b.fuel ?? '', cls: 'num' },
  { v: b.makes || '—', cls: 'num' },
  {
    v: recipeCell(b),
    cls: 'recipes',
    title: [
      b.recipes.length ? `Its own:\n  ${b.recipes.join('\n  ')}` : 'Introduces no recipe of its own',
      b.inherited.length ? `\nSupersedes:\n  ${b.inherited.join('\n  ')}` : ''
    ]
      .filter(Boolean)
      .join('\n')
  },
  { v: b.work || '', cls: 'num' },
  { v: b.cost, cls: 'src', title: b.cost }
];

const asView = (n: BuildNode): ViewNode => ({
  key: n.key,
  label: n.label,
  depth: n.depth,
  count: n.count,
  missing: [],
  children: n.children.map(asView),
  rows: n.rows.map((b) => ({ id: b.id, cells: CELLS(b), desc: b.desc, hover: b }))
});

export const BUILDING_SOURCE: TreeSource = {
  noun: 'buildings',
  total: BUILD_ROWS.length,
  columns: BUILD_COLUMNS,
  view(needle, sortKey, dir) {
    const base = needle
      ? buildBuildingTree(
          BUILD_ROWS.filter(
            (b) =>
              b.name.toLowerCase().includes(needle) ||
              b.id.includes(needle.replace(/ /g, '_')) ||
              b.path.some((p) => p.toLowerCase().includes(needle))
          )
        )
      : BUILDING_TREE;
    return asView(sortBuildingTree(base, sortKey as BuildSortKey | null, dir));
  }
};
