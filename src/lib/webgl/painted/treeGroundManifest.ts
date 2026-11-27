import type { ManifestTree, PaintedSprite, TreeAge, TreeSeason } from './manifest.js';

export const TREE_GROUND_WINTERS = ['buried', 'well', 'melt', 'ice'] as const;
export type TreeGroundWinter = (typeof TREE_GROUND_WINTERS)[number];
export const TREE_GROUND_TINTS = ['wet', 'hex', 'rime', 'remap'] as const;
export const FLECK_SHAPES = ['leaf', 'needle', 'glint'] as const;
type Place = 'foot' | 'rim' | 'spread';
const PROP_SEASONS = ['summer', 'autumn', 'winter'] as const;
const ROOT_AGES = ['mature', 'elder'] as const;
type RootSeason = 'summer' | 'winter';
const FALLBACK_SOIL = 'g';

type Ramp = string[];

export interface TreeGroundLook {
  bed: Ramp;
  remap: boolean;
  core: Ramp | null;
  herb: { ramp: Ramp; amount: number; low: number } | null;
  tint: { mode: (typeof TREE_GROUND_TINTS)[number]; reach: number; ramp: Ramp | null } | null;
  fleck: { shape: (typeof FLECK_SHAPES)[number]; bed: number; out: number; cols: string[] };
  fall: { ramp: Ramp; carpet: number } | null;
  moss: { ramp: Ramp; amount: number; base: number } | null;
  crack: { col: string; hot: string | null } | null;
  glow: string | null;
  stain: Ramp | null;
}

interface ManifestProp {
  sprites: string[];
  mature: number;
  elder: number;
  at: Place;
  r0: number;
  r1: number;
  thirsty: boolean;
}

interface ManifestTreeGroundKind {
  name: string;
  gain: number;
  hard: boolean;
  winter: TreeGroundWinter;
  props: Record<TreeSeason, ManifestProp[]>;
  ring?: { sprites: string[]; n: [number, number]; r: [number, number] };
  roots: Partial<Record<(typeof ROOT_AGES)[number], Record<RootSeason, string[]>>>;
  look: TreeGroundLook;
}

export interface TreeSoil {
  gain: number;
  grassy?: boolean;
  dry?: boolean;
  wet?: boolean;
}

export interface ManifestTreeGround {
  kinds: ManifestTreeGroundKind[];
  soils: Record<string, string>;
  classes: Record<string, TreeSoil>;
  shared: { snow: Ramp; frost: Ramp; mud: Ramp; ice: Ramp };
  grassShift: [number, number];
  resources: Record<string, number>;
  feet: Record<string, number>;
}

export interface TreeGroundProp extends Omit<ManifestProp, 'sprites'> {
  sprites: PaintedSprite[];
}

export interface TreeGroundKind {
  name: string;
  gain: number;
  hard: boolean;
  winter: TreeGroundWinter;
  props: Record<TreeSeason, TreeGroundProp[]>;
  ring?: { sprites: PaintedSprite[]; n: [number, number]; r: [number, number] };
  roots: Partial<
    Record<(typeof ROOT_AGES)[number], Record<RootSeason, PaintedSprite[]>>
  >;
  look: TreeGroundLook;
}

export interface TreeStand {
  kind: number;
  age: TreeAge;
  season: TreeSeason;
  foot: number;
}

export interface PaintedTreeGround {
  kinds: TreeGroundKind[];
  soils: ReadonlyMap<string, TreeSoil>;
  fallback: TreeSoil;
  shared: ManifestTreeGround['shared'];
  grassShift: [number, number];
  stands: ReadonlyMap<PaintedSprite, TreeStand>;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function readTreeGround(raw: unknown): ManifestTreeGround {
  if (
    !isObject(raw) ||
    !Array.isArray(raw.kinds) ||
    !isObject(raw.soils) ||
    !isObject(raw.classes) ||
    !isObject(raw.shared) ||
    !isObject(raw.resources) ||
    !isObject(raw.feet) ||
    !Array.isArray(raw.grassShift)
  )
    throw new Error('manifest treeGround is missing its kinds, soils, shared ramps or feet');
  raw.kinds.forEach((k, i) => {
    if (!isObject(k) || !isObject(k.look) || !isObject(k.props) || !isObject(k.roots))
      throw new Error(`treeGround.kinds.${i} is not a kind`);
    if (!TREE_GROUND_WINTERS.includes(k.winter as TreeGroundWinter))
      throw new Error(`treeGround.kinds.${i} has no winter rule`);
    for (const season of PROP_SEASONS)
      if (!Array.isArray(k.props[season]))
        throw new Error(`treeGround.kinds.${i}.props.${season} is not a list`);
  });
  return raw as unknown as ManifestTreeGround;
}

export function resolveTreeGround(
  g: ManifestTreeGround,
  trees: Record<string, ManifestTree>,
  cell: (sid: string) => PaintedSprite | undefined,
  problems: string[]
): PaintedTreeGround {
  const cells = (ids: string[]) =>
    ids.flatMap((sid) => {
      const c = cell(sid);
      if (!c) problems.push(`treeGround names unknown sprite ${sid}`);
      return c ? [c] : [];
    });
  const kinds = g.kinds.map((k): TreeGroundKind => {
    const props = Object.fromEntries(
      PROP_SEASONS.map((s) => [s, k.props[s].map((p) => ({ ...p, sprites: cells(p.sprites) }))])
    ) as Record<TreeSeason, TreeGroundProp[]>;
    const roots: TreeGroundKind['roots'] = {};
    for (const age of ROOT_AGES) {
      const r = k.roots[age];
      if (r) roots[age] = { summer: cells(r.summer), winter: cells(r.winter) };
    }
    return {
      name: k.name,
      gain: k.gain,
      hard: k.hard,
      winter: k.winter,
      props,
      roots,
      look: k.look,
      ...(k.ring ? { ring: { ...k.ring, sprites: cells(k.ring.sprites) } } : null)
    };
  });
  const soils = new Map<string, TreeSoil>();
  for (const [id, c] of Object.entries(g.soils)) {
    const soil = g.classes[c];
    if (soil) soils.set(id, soil);
  }
  const stands = new Map<PaintedSprite, TreeStand>();
  for (const [resource, tree] of Object.entries(trees)) {
    const kind = g.resources[resource];
    if (kind === undefined || !kinds[kind]) continue;
    for (const [age, bySeason] of Object.entries(tree) as [TreeAge, Record<TreeSeason, string[]>][])
      for (const season of PROP_SEASONS)
        for (const sid of bySeason[season]) {
          const c = cell(sid);
          if (c && !stands.has(c)) stands.set(c, { kind, age, season, foot: g.feet[sid] ?? 4 });
        }
  }
  const fallback = g.classes[FALLBACK_SOIL] ?? { gain: 1, grassy: true };
  return { kinds, soils, fallback, shared: g.shared, grassShift: g.grassShift, stands };
}
