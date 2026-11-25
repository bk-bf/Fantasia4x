export type PaintedKind = 'subterrain' | 'resource' | 'building' | 'creature' | 'pawn' | 'item';

export const PAINTED_KINDS: readonly PaintedKind[] = [
  'subterrain',
  'resource',
  'building',
  'creature',
  'pawn',
  'item'
];

export interface ManifestSprite {
  x: number;
  y: number;
  w: number;
  h: number;
  ox: number;
  oy: number;
  patch?: number;
  cw?: number;
  ch?: number;
  cast?: number;
  emit?: SpriteLight;
}

export interface SpriteLight {
  x: number;
  y: number;
  rad: number;
  col: [number, number, number];
  flicker?: boolean;
  night?: boolean;
}

export interface ManifestPieceTop {
  image: string;
  veins: string;
  size: number;
  veinSize: number;
  lift: number;
  ramp: string;
}

export interface ManifestPieces {
  resources: string[];
  neighbours: [number, number][];
  layouts: string[];
  veins: Record<string, string>;
  top?: ManifestPieceTop;
}

export interface ManifestGroundKind {
  ramps: string;
  bare?: string;
  tufts?: { density: number; sprites: string[] };
}

export interface ManifestGround {
  field: ManifestField;
  far: ManifestField;
  pieces: string;
  grass: string[];
  kinds: Record<string, ManifestGroundKind>;
}

export interface ManifestDrop {
  pile?: string[];
  lean?: string[];
  lie?: string[];
  ground?: string;
}

export interface ManifestDrops {
  grass: Record<string, number>;
  items: Record<string, ManifestDrop>;
  cover: Record<string, string>;
}

export const TREE_AGES = ['young', 'mature'] as const;
export type TreeAge = (typeof TREE_AGES)[number];
export const TREE_SEASONS = ['summer', 'autumn', 'winter'] as const;
export type TreeSeason = (typeof TREE_SEASONS)[number];
export type ManifestTree = Record<TreeAge, Record<TreeSeason, string[]>>;
export type PaintedTree = Record<TreeAge, Record<TreeSeason, PaintedVariant[]>>;

export interface PaintedManifest {
  tile: number;
  atlas: { w: number; h: number };
  sprites: Record<string, ManifestSprite>;
  map: Partial<Record<PaintedKind, Record<string, string[]>>>;
  pieces?: Record<string, ManifestPieces>;
  drops?: ManifestDrops;
  trees?: Record<string, ManifestTree>;
  water?: ManifestField;
  ground?: ManifestGround;
}

export interface ManifestField {
  image: string;
  size: number;
}

export interface PaintedSprite {
  u1: number;
  v1: number;
  u2: number;
  v2: number;
  ox: number;
  oy: number;
  w: number;
  h: number;
  cast?: number;
  emit?: SpriteLight;
  vein?: PaintedVein;
  sway?: number;
  leafy?: boolean;
}

export interface PaintedWind {
  sway: Readonly<Record<string, number>>;
  leafy: readonly string[];
}

const STILL: PaintedWind = { sway: {}, leafy: [] };

export interface PaintedRamp {
  x: number;
  y: number;
}

export interface PaintedVein extends PaintedRamp {
  near: number;
}

export interface PaintedVariant {
  patch: number;
  cells: PaintedSprite[];
  entity: { painted: PaintedSprite; scale: undefined };
}

export interface PaintedPieceTop {
  image: string;
  veins: string;
  size: number;
  veinSize: number;
  lift: number;
  ramp: { x: number; y: number; length: number };
}

export interface PaintedPieces {
  members: ReadonlySet<string>;
  neighbours: readonly (readonly [number, number])[];
  layouts: PaintedVariant[];
  veins: ReadonlyMap<string, PaintedRamp>;
  top?: PaintedPieceTop;
}

export interface PaintedGroundKind {
  ramps: PaintedRamp;
  bare?: PaintedRamp & { side: number };
  tufts?: { density: number; sprites: PaintedSprite[] };
}

export interface PaintedGround {
  field: ManifestField;
  far: ManifestField;
  pieces: PaintedRamp;
  grass: ReadonlySet<string>;
  kinds: Map<string, PaintedGroundKind>;
}

export interface PaintedProp {
  sprite: PaintedSprite;
  cover?: readonly PaintedSprite[];
}

export interface PaintedDrop {
  pile?: readonly PaintedProp[];
  lean?: readonly PaintedProp[];
  lie?: readonly PaintedProp[];
  ground?: PaintedProp;
}

export interface PaintedDrops {
  grass: ReadonlyMap<string, number>;
  items: ReadonlyMap<string, PaintedDrop>;
}

export interface PaintedTileset {
  tile: number;
  atlasW: number;
  atlasH: number;
  lookup: Map<PaintedKind, Map<string, PaintedVariant[]>>;
  map: PaintedManifest['map'];
  sprites: ReadonlyMap<string, PaintedVariant>;
  pieces: Map<string, PaintedPieces>;
  scenery: Map<string, PaintedVariant[]>;
  ground?: PaintedGround;
  drops?: PaintedDrops;
  trees: Map<string, PaintedTree>;
}

const SCENERY: Readonly<Record<string, string>> = {
  reeds: 'plant/reeds/',
  ...Object.fromEntries([1, 2, 3].map((n) => [`reedbed/${n}`, `plant/reedbed/${n}/`])),
  ...Object.fromEntries([5, 6, 7, 8].map((n) => [`lilies/${n}`, `plant/lilies/${n}/`]))
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

function readSprite(id: string, raw: unknown, m: { tile: number; w: number; h: number }) {
  if (!isObject(raw)) throw new Error(`sprite ${id} is not an object`);
  const { x, y, w, h, ox, oy, patch, cw, ch, cast, emit } = raw;
  if (![x, y, w, h, ox, oy].every(isInt)) throw new Error(`sprite ${id} has a non-integer field`);
  const s = { x, y, w, h, ox, oy } as ManifestSprite;
  if (s.w <= 0 || s.h <= 0) throw new Error(`sprite ${id} is empty`);
  if (s.x < 0 || s.y < 0 || s.x + s.w > m.w || s.y + s.h > m.h)
    throw new Error(`sprite ${id} lies outside the atlas`);
  if (patch !== undefined) {
    if (!isInt(patch) || patch < 1) throw new Error(`sprite ${id} has a bad patch`);
    const cell = { w: cw ?? m.tile, h: ch ?? m.tile };
    if (!isInt(cell.w) || !isInt(cell.h) || cell.w < m.tile || cell.h < m.tile)
      throw new Error(`sprite ${id} has a bad cell size`);
    if (s.w !== patch * cell.w || s.h !== patch * cell.h)
      throw new Error(`sprite ${id} is not ${patch} by ${patch} cells`);
    s.patch = patch;
    if (cw !== undefined || ch !== undefined) Object.assign(s, { cw: cell.w, ch: cell.h });
  }
  if (cast !== undefined) {
    if (!isInt(cast) || cast <= 0) throw new Error(`sprite ${id} has a bad cast height`);
    s.cast = cast;
  }
  if (emit !== undefined) s.emit = readEmit(id, emit);
  return s;
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function readEmit(id: string, raw: unknown): SpriteLight {
  if (!isObject(raw)) throw new Error(`sprite ${id} has a bad light`);
  const { x, y, rad, col, flicker, night } = raw;
  if (![x, y, rad].every(isNumber) || (rad as number) <= 0)
    throw new Error(`sprite ${id} light has no place or reach`);
  if (!Array.isArray(col) || col.length !== 3 || !col.every(isNumber))
    throw new Error(`sprite ${id} light has no colour`);
  return {
    x: x as number,
    y: y as number,
    rad: rad as number,
    col: col as [number, number, number],
    ...(flicker === true ? { flicker: true } : null),
    ...(night === true ? { night: true } : null)
  };
}

const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((e) => typeof e === 'string');

function readPieces(set: string, raw: unknown): ManifestPieces {
  if (!isObject(raw)) throw new Error(`pieces.${set} is not an object`);
  const { resources, neighbours, layouts, veins = {}, top } = raw;
  if (!isStrings(resources)) throw new Error(`pieces.${set}.resources is not a list of ids`);
  if (!isObject(veins) || !isStrings(Object.values(veins)))
    throw new Error(`pieces.${set}.veins does not map ids to sprites`);
  if (
    !Array.isArray(neighbours) ||
    !neighbours.every((n) => Array.isArray(n) && n.length === 2 && n.every(isInt))
  )
    throw new Error(`pieces.${set}.neighbours is not a list of offsets`);
  if (!isStrings(layouts) || layouts.length !== 1 << neighbours.length)
    throw new Error(`pieces.${set}.layouts does not name a sprite for every layout`);
  const out: ManifestPieces = {
    resources,
    neighbours: neighbours as [number, number][],
    layouts,
    veins: veins as Record<string, string>
  };
  if (top !== undefined) out.top = readTop(set, top);
  return out;
}

function readTop(set: string, raw: unknown): ManifestPieceTop {
  if (!isObject(raw)) throw new Error(`pieces.${set}.top is not an object`);
  const { image, veins, size, veinSize, lift, ramp } = raw;
  if (typeof image !== 'string' || typeof veins !== 'string' || typeof ramp !== 'string')
    throw new Error(`pieces.${set}.top does not name its images and ramp`);
  if (!isInt(size) || size <= 0 || !isInt(veinSize) || veinSize <= 0 || !isInt(lift) || lift < 0)
    throw new Error(`pieces.${set}.top has a bad size or lift`);
  return { image, veins, size, veinSize, lift, ramp };
}

function readField(name: string, raw: unknown): ManifestField {
  if (!isObject(raw) || typeof raw.image !== 'string' || !isInt(raw.size) || raw.size <= 0)
    throw new Error(`manifest ${name} is not an image and a size`);
  return { image: raw.image, size: raw.size };
}

function readGroundKind(id: string, raw: unknown): ManifestGroundKind {
  if (!isObject(raw) || typeof raw.ramps !== 'string')
    throw new Error(`ground.kinds.${id} names no ramps`);
  const out: ManifestGroundKind = { ramps: raw.ramps };
  if (raw.bare !== undefined) {
    if (typeof raw.bare !== 'string') throw new Error(`ground.kinds.${id}.bare is not a sprite`);
    out.bare = raw.bare;
  }
  if (raw.tufts !== undefined) {
    const t = raw.tufts;
    if (!isObject(t) || !isNumber(t.density) || t.density < 0 || !isStrings(t.sprites))
      throw new Error(`ground.kinds.${id}.tufts is not a density and sprites`);
    out.tufts = { density: t.density, sprites: t.sprites };
  }
  return out;
}

function readGround(raw: unknown): ManifestGround {
  if (!isObject(raw) || typeof raw.pieces !== 'string' || !isStrings(raw.grass))
    throw new Error('manifest ground names no pieces or grass');
  if (!isObject(raw.kinds)) throw new Error('manifest ground.kinds is not an object');
  const kinds: Record<string, ManifestGroundKind> = {};
  for (const [id, k] of Object.entries(raw.kinds)) kinds[id] = readGroundKind(id, k);
  return {
    field: readField('ground.field', raw.field),
    far: readField('ground.far', raw.far),
    pieces: raw.pieces,
    grass: raw.grass,
    kinds
  };
}

function readDrop(id: string, raw: unknown): ManifestDrop {
  if (!isObject(raw)) throw new Error(`drops.items.${id} is not an object`);
  const { pile, lean, lie, ground } = raw;
  const out: ManifestDrop = {};
  for (const [pose, ids] of Object.entries({ pile, lean, lie })) {
    if (ids === undefined) continue;
    if (!isStrings(ids) || ids.length === 0)
      throw new Error(`drops.items.${id}.${pose} is not a list of sprites`);
    out[pose as 'pile' | 'lean' | 'lie'] = ids;
  }
  if (ground !== undefined) {
    if (typeof ground !== 'string') throw new Error(`drops.items.${id}.ground is not a sprite`);
    out.ground = ground;
  }
  if (!out.pile && !out.lie && !out.ground)
    throw new Error(`drops.items.${id} has no sprite to rest on the ground`);
  return out;
}

function readTree(id: string, raw: unknown): ManifestTree {
  if (!isObject(raw)) throw new Error(`trees.${id} is not an object`);
  const out = {} as ManifestTree;
  for (const age of TREE_AGES) {
    const bySeason = raw[age];
    if (!isObject(bySeason)) throw new Error(`trees.${id}.${age} is not an object`);
    out[age] = {} as Record<TreeSeason, string[]>;
    for (const season of TREE_SEASONS) {
      const ids = bySeason[season];
      if (!isStrings(ids) || ids.length === 0)
        throw new Error(`trees.${id}.${age}.${season} is not a list of sprites`);
      out[age][season] = ids;
    }
  }
  return out;
}

function readDrops(raw: unknown): ManifestDrops {
  if (!isObject(raw) || !isObject(raw.grass) || !isObject(raw.items) || !isObject(raw.cover))
    throw new Error('manifest drops names no grass, items or cover');
  const grass: Record<string, number> = {};
  for (const [kind, ramp] of Object.entries(raw.grass)) {
    if (!isInt(ramp) || ramp < 0) throw new Error(`drops.grass.${kind} is not a ramp index`);
    grass[kind] = ramp;
  }
  const items: Record<string, ManifestDrop> = {};
  for (const [id, drop] of Object.entries(raw.items)) items[id] = readDrop(id, drop);
  const cover: Record<string, string> = {};
  for (const [sprite, blades] of Object.entries(raw.cover)) {
    if (typeof blades !== 'string') throw new Error(`drops.cover.${sprite} is not a sprite`);
    cover[sprite] = blades;
  }
  return { grass, items, cover };
}

export function parseManifest(raw: unknown): PaintedManifest {
  if (!isObject(raw)) throw new Error('manifest is not an object');
  const { tile, atlas, sprites, map, pieces, drops, trees, water, ground } = raw;
  if (!isInt(tile) || tile <= 0) throw new Error('manifest tile is not a positive integer');
  if (!isObject(atlas) || !isInt(atlas.w) || !isInt(atlas.h) || atlas.w <= 0 || atlas.h <= 0)
    throw new Error('manifest atlas size is missing');
  if (!isObject(sprites)) throw new Error('manifest sprites is not an object');
  if (!isObject(map)) throw new Error('manifest map is not an object');
  const dims = { tile, w: atlas.w, h: atlas.h };
  const out: PaintedManifest = { tile, atlas: { w: atlas.w, h: atlas.h }, sprites: {}, map: {} };
  for (const [id, s] of Object.entries(sprites)) out.sprites[id] = readSprite(id, s, dims);
  for (const kind of PAINTED_KINDS) {
    const entries = map[kind];
    if (entries === undefined) continue;
    if (!isObject(entries)) throw new Error(`map.${kind} is not an object`);
    const kindMap: Record<string, string[]> = {};
    for (const [id, ids] of Object.entries(entries)) {
      if (!Array.isArray(ids) || !ids.every((v) => typeof v === 'string'))
        throw new Error(`map.${kind}.${id} is not a list of sprite ids`);
      kindMap[id] = ids;
    }
    out.map[kind] = kindMap;
  }
  if (pieces !== undefined) {
    if (!isObject(pieces)) throw new Error('manifest pieces is not an object');
    out.pieces = {};
    for (const [set, p] of Object.entries(pieces)) out.pieces[set] = readPieces(set, p);
  }
  if (drops !== undefined) out.drops = readDrops(drops);
  if (trees !== undefined) {
    if (!isObject(trees)) throw new Error('manifest trees is not an object');
    out.trees = {};
    for (const [id, t] of Object.entries(trees)) out.trees[id] = readTree(id, t);
  }
  if (water !== undefined) out.water = readField('water', water);
  if (ground !== undefined) out.ground = readGround(ground);
  return out;
}

function cellOf(
  s: ManifestSprite,
  px: number,
  py: number,
  size: { w: number; h: number },
  m: PaintedManifest
): PaintedSprite {
  const t = m.tile;
  return {
    u1: px / m.atlas.w,
    v1: py / m.atlas.h,
    u2: (px + size.w) / m.atlas.w,
    v2: (py + size.h) / m.atlas.h,
    ox: s.ox / t,
    oy: s.oy / t,
    w: size.w / t,
    h: size.h / t,
    ...(s.cast ? { cast: s.cast } : null),
    ...(s.emit ? { emit: s.emit } : null)
  };
}

export function resolveVariant(m: PaintedManifest, s: ManifestSprite): PaintedVariant {
  const n = s.patch ?? 1;
  const cells: PaintedSprite[] = [];
  if (s.patch === undefined) cells.push(cellOf(s, s.x, s.y, s, m));
  else {
    const cell = { w: s.cw ?? m.tile, h: s.ch ?? m.tile };
    for (let cy = 0; cy < n; cy++)
      for (let cx = 0; cx < n; cx++)
        cells.push(cellOf(s, s.x + cx * cell.w, s.y + cy * cell.h, cell, m));
  }
  return { patch: n, cells, entity: { painted: cells[0], scale: undefined } };
}

export function buildTileset(
  m: PaintedManifest,
  wind: PaintedWind = STILL
): { tileset: PaintedTileset; problems: string[] } {
  const problems: string[] = [];
  const resolved = new Map<string, PaintedVariant>();
  const leafy = new Set(wind.leafy);
  const variantOf = (sid: string): PaintedVariant | undefined => {
    const s = m.sprites[sid];
    if (!s) return undefined;
    let v = resolved.get(sid);
    if (!v) {
      v = resolveVariant(m, s);
      const sway = wind.sway[sid];
      if (sway) for (const c of v.cells) c.sway = sway;
      if (leafy.has(sid)) for (const c of v.cells) c.leafy = true;
      resolved.set(sid, v);
    }
    return v;
  };
  const lookup = new Map<PaintedKind, Map<string, PaintedVariant[]>>();
  for (const kind of PAINTED_KINDS) {
    const kindMap = new Map<string, PaintedVariant[]>();
    for (const [id, spriteIds] of Object.entries(m.map[kind] ?? {})) {
      const variants: PaintedVariant[] = [];
      for (const sid of spriteIds) {
        const v = variantOf(sid);
        if (v) variants.push(v);
        else problems.push(`map.${kind}.${id} names unknown sprite ${sid}`);
      }
      if (variants.length > 0) kindMap.set(id, variants);
    }
    lookup.set(kind, kindMap);
  }
  const pieces = new Map<string, PaintedPieces>();
  for (const [set, p] of Object.entries(m.pieces ?? {})) {
    const layouts = p.layouts.map(variantOf);
    const missing = p.layouts.filter((_, i) => !layouts[i]);
    if (missing.length > 0) {
      problems.push(`pieces.${set} names unknown sprites ${[...new Set(missing)].join(', ')}`);
      continue;
    }
    const ramp = p.top ? m.sprites[p.top.ramp] : undefined;
    if (p.top && !ramp) {
      problems.push(`pieces.${set}.top names unknown sprite ${p.top.ramp}`);
      continue;
    }
    const veins = new Map<string, PaintedRamp>();
    for (const [id, sprite] of Object.entries(p.veins)) {
      const s = m.sprites[sprite];
      if (s) veins.set(id, { x: s.x, y: s.y });
      else problems.push(`pieces.${set}.veins.${id} names unknown sprite ${sprite}`);
    }
    pieces.set(set, {
      members: new Set(p.resources),
      neighbours: p.neighbours,
      layouts: layouts as PaintedVariant[],
      veins,
      ...(p.top && ramp
        ? { top: { ...p.top, ramp: { x: ramp.x, y: ramp.y, length: ramp.w } } }
        : null)
    });
  }
  const scenery = new Map<string, PaintedVariant[]>();
  for (const [id, prefix] of Object.entries(SCENERY)) {
    const variants = Object.keys(m.sprites)
      .filter((sid) => sid.startsWith(prefix))
      .sort()
      .flatMap((sid) => variantOf(sid) ?? []);
    if (variants.length > 0) scenery.set(id, variants);
  }
  const ground = m.ground && resolveGround(m, m.ground, problems);
  const drops = m.drops && resolveDrops(m, m.drops, problems);
  const trees = new Map<string, PaintedTree>();
  for (const [id, t] of Object.entries(m.trees ?? {})) {
    const tree = {} as PaintedTree;
    let whole = true;
    for (const age of TREE_AGES) {
      tree[age] = {} as Record<TreeSeason, PaintedVariant[]>;
      for (const season of TREE_SEASONS) {
        const variants = t[age][season].flatMap((sid) => variantOf(sid) ?? []);
        if (variants.length !== t[age][season].length) {
          problems.push(`trees.${id}.${age}.${season} names an unknown sprite`);
          whole = false;
        }
        tree[age][season] = variants;
      }
    }
    if (whole) trees.set(id, tree);
  }
  return {
    tileset: {
      tile: m.tile,
      atlasW: m.atlas.w,
      atlasH: m.atlas.h,
      lookup,
      map: m.map,
      sprites: resolved,
      pieces,
      scenery,
      trees,
      ...(ground ? { ground } : null),
      ...(drops ? { drops } : null)
    },
    problems
  };
}

function resolveDrops(m: PaintedManifest, d: ManifestDrops, problems: string[]): PaintedDrops {
  const ramps = Math.max(-1, ...Object.values(d.grass)) + 1;
  const cells = new Map<string, PaintedSprite | undefined>();
  const cell = (sid: string): PaintedSprite | undefined => {
    if (!cells.has(sid)) {
      const s = m.sprites[sid];
      if (!s) problems.push(`drops names unknown sprite ${sid}`);
      cells.set(sid, s && cellOf(s, s.x, s.y, s, m));
    }
    return cells.get(sid);
  };
  const prop = (sid: string): PaintedProp[] => {
    const sprite = cell(sid);
    if (!sprite) return [];
    const blades = d.cover[sid];
    if (blades === undefined) return [{ sprite }];
    const cover = Array.from({ length: ramps }, (_, ramp) => cell(`${blades}/${ramp}`));
    return [cover.every((c) => c) ? { sprite, cover: cover as PaintedSprite[] } : { sprite }];
  };
  const items = new Map<string, PaintedDrop>();
  for (const [id, drop] of Object.entries(d.items)) {
    const pile = drop.pile?.flatMap(prop);
    const lean = drop.lean?.flatMap(prop);
    const lie = drop.lie?.flatMap(prop);
    const ground = drop.ground === undefined ? undefined : prop(drop.ground)[0];
    const whole =
      pile?.length === drop.pile?.length &&
      lean?.length === drop.lean?.length &&
      lie?.length === drop.lie?.length &&
      (drop.ground === undefined) === (ground === undefined);
    if (!whole) continue;
    items.set(id, {
      ...(pile ? { pile } : null),
      ...(lean ? { lean } : null),
      ...(lie ? { lie } : null),
      ...(ground ? { ground } : null)
    });
  }
  return { grass: new Map(Object.entries(d.grass)), items };
}

function resolveGround(
  m: PaintedManifest,
  g: ManifestGround,
  problems: string[]
): PaintedGround | undefined {
  const at = (sid: string): ManifestSprite | undefined => {
    const s = m.sprites[sid];
    if (!s) problems.push(`ground names unknown sprite ${sid}`);
    return s;
  };
  const pieces = at(g.pieces);
  if (!pieces) return undefined;
  const kinds = new Map<string, PaintedGroundKind>();
  for (const [id, k] of Object.entries(g.kinds)) {
    const ramps = at(k.ramps);
    if (!ramps) continue;
    const kind: PaintedGroundKind = { ramps: { x: ramps.x, y: ramps.y } };
    const bare = k.bare === undefined ? undefined : at(k.bare);
    if (bare) kind.bare = { x: bare.x, y: bare.y, side: bare.w };
    const tufts = k.tufts?.sprites.flatMap((sid) => {
      const s = at(sid);
      return s ? [cellOf(s, s.x, s.y, s, m)] : [];
    });
    if (k.tufts && tufts?.length) kind.tufts = { density: k.tufts.density, sprites: tufts };
    kinds.set(id, kind);
  }
  return {
    field: g.field,
    far: g.far,
    pieces: { x: pieces.x, y: pieces.y },
    grass: new Set(g.grass),
    kinds
  };
}

export function positionHash(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function idHash(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export function pickVariant<T>(variants: readonly T[], hash: number): T {
  return variants[hash % variants.length];
}

export function patchCell(tileX: number, tileY: number, n: number): number {
  const cx = ((tileX % n) + n) % n;
  const cy = ((tileY % n) + n) % n;
  return cy * n + cx;
}

export function spriteAt(v: PaintedVariant, tileX: number, tileY: number): PaintedSprite {
  return v.patch === 1 ? v.cells[0] : v.cells[patchCell(tileX, tileY, v.patch)];
}

export function paintedQuad(
  s: PaintedSprite,
  tileX: number,
  tileY: number,
  basePx: number,
  offX: number,
  offY: number,
  scale: number,
  lying: boolean,
  out: number[] | Float32Array
): void {
  const left = tileX * basePx + offX;
  const top = tileY * basePx + offY;
  const half = basePx / 2;
  const w = (lying ? s.h : s.w) * basePx * scale;
  const h = (lying ? s.w : s.h) * basePx * scale;
  const x1 = lying ? left + half - w / 2 : left + half + (s.ox * basePx - half) * scale;
  const y1 = lying ? top + basePx - h : top + basePx + (s.oy * basePx - basePx) * scale;
  out[0] = x1;
  out[1] = y1;
  out[2] = x1 + w;
  out[3] = y1 + h;
}
