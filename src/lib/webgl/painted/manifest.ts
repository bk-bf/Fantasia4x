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
}

export interface PaintedManifest {
  tile: number;
  atlas: { w: number; h: number };
  sprites: Record<string, ManifestSprite>;
  map: Partial<Record<PaintedKind, Record<string, string[]>>>;
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
}

export interface PaintedVariant {
  patch: number;
  cells: PaintedSprite[];
  entity: { painted: PaintedSprite; scale: undefined };
}

export interface PaintedTileset {
  tile: number;
  atlasW: number;
  atlasH: number;
  lookup: Map<PaintedKind, Map<string, PaintedVariant[]>>;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

function readSprite(id: string, raw: unknown, m: { tile: number; w: number; h: number }) {
  if (!isObject(raw)) throw new Error(`sprite ${id} is not an object`);
  const { x, y, w, h, ox, oy, patch } = raw;
  if (![x, y, w, h, ox, oy].every(isInt)) throw new Error(`sprite ${id} has a non-integer field`);
  const s = { x, y, w, h, ox, oy } as ManifestSprite;
  if (s.w <= 0 || s.h <= 0) throw new Error(`sprite ${id} is empty`);
  if (s.x < 0 || s.y < 0 || s.x + s.w > m.w || s.y + s.h > m.h)
    throw new Error(`sprite ${id} lies outside the atlas`);
  if (patch !== undefined) {
    if (!isInt(patch) || patch < 1) throw new Error(`sprite ${id} has a bad patch`);
    if (s.w !== patch * m.tile || s.h !== patch * m.tile)
      throw new Error(`sprite ${id} is not ${patch} by ${patch} tiles`);
    s.patch = patch;
  }
  return s;
}

export function parseManifest(raw: unknown): PaintedManifest {
  if (!isObject(raw)) throw new Error('manifest is not an object');
  const { tile, atlas, sprites, map } = raw;
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
    const cell = { w: m.tile, h: m.tile };
    for (let cy = 0; cy < n; cy++)
      for (let cx = 0; cx < n; cx++)
        cells.push(cellOf(s, s.x + cx * m.tile, s.y + cy * m.tile, cell, m));
  }
  return { patch: n, cells, entity: { painted: cells[0], scale: undefined } };
}

export function buildTileset(m: PaintedManifest): { tileset: PaintedTileset; problems: string[] } {
  const problems: string[] = [];
  const resolved = new Map<string, PaintedVariant>();
  const lookup = new Map<PaintedKind, Map<string, PaintedVariant[]>>();
  for (const kind of PAINTED_KINDS) {
    const kindMap = new Map<string, PaintedVariant[]>();
    for (const [id, spriteIds] of Object.entries(m.map[kind] ?? {})) {
      const variants: PaintedVariant[] = [];
      for (const sid of spriteIds) {
        const s = m.sprites[sid];
        if (!s) {
          problems.push(`map.${kind}.${id} names unknown sprite ${sid}`);
          continue;
        }
        let v = resolved.get(sid);
        if (!v) {
          v = resolveVariant(m, s);
          resolved.set(sid, v);
        }
        variants.push(v);
      }
      if (variants.length > 0) kindMap.set(id, variants);
    }
    lookup.set(kind, kindMap);
  }
  return { tileset: { tile: m.tile, atlasW: m.atlas.w, atlasH: m.atlas.h, lookup }, problems };
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
