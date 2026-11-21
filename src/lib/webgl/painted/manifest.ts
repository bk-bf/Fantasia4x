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
}

export interface ManifestPieceTop {
  image: string;
  veins: string;
  size: number;
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

export interface PaintedManifest {
  tile: number;
  atlas: { w: number; h: number };
  sprites: Record<string, ManifestSprite>;
  map: Partial<Record<PaintedKind, Record<string, string[]>>>;
  pieces?: Record<string, ManifestPieces>;
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
  vein?: PaintedVein;
}

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

export interface PaintedTileset {
  tile: number;
  atlasW: number;
  atlasH: number;
  lookup: Map<PaintedKind, Map<string, PaintedVariant[]>>;
  pieces: Map<string, PaintedPieces>;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

function readSprite(id: string, raw: unknown, m: { tile: number; w: number; h: number }) {
  if (!isObject(raw)) throw new Error(`sprite ${id} is not an object`);
  const { x, y, w, h, ox, oy, patch, cw, ch } = raw;
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
  return s;
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
  const { image, veins, size, lift, ramp } = raw;
  if (typeof image !== 'string' || typeof veins !== 'string' || typeof ramp !== 'string')
    throw new Error(`pieces.${set}.top does not name its images and ramp`);
  if (!isInt(size) || size <= 0 || !isInt(lift) || lift < 0)
    throw new Error(`pieces.${set}.top has a bad size or lift`);
  return { image, veins, size, lift, ramp };
}

export function parseManifest(raw: unknown): PaintedManifest {
  if (!isObject(raw)) throw new Error('manifest is not an object');
  const { tile, atlas, sprites, map, pieces } = raw;
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
    h: size.h / t
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

export function buildTileset(m: PaintedManifest): { tileset: PaintedTileset; problems: string[] } {
  const problems: string[] = [];
  const resolved = new Map<string, PaintedVariant>();
  const variantOf = (sid: string): PaintedVariant | undefined => {
    const s = m.sprites[sid];
    if (!s) return undefined;
    let v = resolved.get(sid);
    if (!v) {
      v = resolveVariant(m, s);
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
  return {
    tileset: { tile: m.tile, atlasW: m.atlas.w, atlasH: m.atlas.h, lookup, pieces },
    problems
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
