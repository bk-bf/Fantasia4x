// buildingTree.ts — the /gear-db BUILDINGS view. Same idea as `itemTree`: a branch says what a
// building IS, and the AGE level underneath says when a colony can raise it.
//
// Buildings were only ever visible as the "Made at" column on an item row, which answers "where is
// this made" and never "what does this age actually give me to build, and what is missing". The
// station LADDERS in particular — cooking 0–5, tailoring 0–4, lapidary 0–3, butchery 0–3 — are
// invisible in a flat list and obvious as a tree: a family with one rung is a hole.

import buildingsData from '../game/database/world/buildings.jsonc';
import recipesData from '../game/database/items/recipes.jsonc';
import { AGE_NAMES } from './chainAge';

/* eslint-disable @typescript-eslint/no-explicit-any */
const buildings = buildingsData as any[];
const recipes = recipesData as any[];

const prettify = (id: string) => id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** How many recipes name this building as their station. A workstation nothing is made at is a hole. */
const RECIPE_COUNT = new Map<string, number>();
for (const r of recipes)
  if (r?.station) RECIPE_COUNT.set(r.station, (RECIPE_COUNT.get(r.station) ?? 0) + 1);

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
const LADDER: { key: string; label: string }[] = [
  { key: 'cookingTier', label: 'Hearth & stove' },
  { key: 'butcheryTier', label: 'Butchery' },
  { key: 'lapidaryTier', label: 'Lapidary' },
  { key: 'tailoringTier', label: 'Tailoring' },
  { key: 'tier', label: 'General crafting' }
];

/** What a building is FOR. Read off what it enables, never off its name. */
function purposeOf(b: any): string {
  const e = b?.effects ?? {};
  const has = (k: string) => e[k] != null;
  for (const l of LADDER) if (has(l.key)) return l.label;
  if (has('smeltingEnabled') || has('smithingEnabled')) return 'Forge & smelting';
  if (has('bakingEnabled')) return 'Baking & milling';
  if (has('brewingEnabled') || has('fermentation') || has('alchemyEnabled'))
    return 'Brewing & alchemy';
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
  /** how much of a fuel charge it burns per tick; null when it needs no fire */
  fuel: number | null;
  /** recipes that name it as their station */
  makes: number;
  cost: string;
  work: number;
  desc: string;
}

const costOf = (b: any): string =>
  Object.entries(b?.buildingCost ?? {})
    .map(([k, v]) => `${v}× ${prettify(k.replace(/^category:/, ''))}`)
    .join(', ');

const rungOf = (b: any): number | null => {
  const e = b?.effects ?? {};
  for (const l of LADDER) if (e[l.key] != null) return Number(e[l.key]);
  return null;
};

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
    fuel: b.fuelConsumptionRate ?? null,
    makes: RECIPE_COUNT.get(b.id) ?? 0,
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

export type BuildSortKey = 'name' | 'age' | 'rung' | 'speed' | 'fuel' | 'makes' | 'work' | 'cost';
export const BUILD_COLUMNS: { key: BuildSortKey; label: string; num?: boolean }[] = [
  { key: 'name', label: 'Building' },
  { key: 'age', label: 'Age' },
  { key: 'rung', label: 'Rung', num: true },
  { key: 'speed', label: 'Speed', num: true },
  { key: 'fuel', label: 'Fuel', num: true },
  { key: 'makes', label: 'Makes', num: true },
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

const CELLS = (b: BuildRow): ViewRow['cells'] => [
  { v: b.name, cls: 'nm' },
  { v: b.age, cls: 'age' },
  { v: b.rung ?? '—', cls: 'num' },
  { v: b.speed ? `+${b.speed}%` : '', cls: 'num' },
  { v: b.fuel ?? '', cls: 'num' },
  { v: b.makes || '—', cls: 'num' },
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
  rows: n.rows.map((b) => ({ id: b.id, cells: CELLS(b), desc: b.desc }))
});

export const BUILDING_SOURCE: TreeSource = {
  noun: 'buildings',
  total: BUILD_ROWS.length,
  hint:
    'Every building, filed by what it is FOR and then by <b>age</b> — read off what it enables, ' +
    'never off its name. <b>Rung</b> is its place in a station ladder: a family climbs 0, 1, 2 … and ' +
    'each rung cooks, cuts or sews the SAME recipes faster than the one below, so a gap in the ' +
    'numbers is a missing station rather than a missing recipe. <b>Makes</b> counts the recipes that ' +
    'name it — a rung showing none is inheriting its family&rsquo;s work, which is the ladder doing ' +
    'its job; a station outside any ladder showing none is the question.',
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
