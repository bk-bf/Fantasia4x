import type { TileData } from './tile-types.js';
import { paintedQuad, type PaintedSprite } from './painted/manifest.js';

export const ALPHA_CUT = 0.5;
export const FACE_ALPHA = 254;
export const FACE_ROWS = 22;
export const OBJECT_FOOT = 23;
const TOP_KEY_LEVEL = 0.99;
const TOP_KEY_GREEN = 0.05;

const TEXEL_CLEAR = 0;
const TEXEL_SOLID = 1;
const TEXEL_TOP = 2;
const TEXEL_FACE = 3;

const REACH_SIDE = 2;
const REACH_ABOVE = 1;
const REACH_BELOW = 3;

export interface AtlasTexels {
  w: number;
  h: number;
  kinds: Uint8Array;
}

export interface DrawnGrid {
  getTile(x: number, y: number): TileData | undefined;
}

export interface DrawnFrame {
  basePx: number;
  artPx: number;
  lift: number | null;
  texels: AtlasTexels | null;
  depth: boolean;
}

export interface DrawnHit {
  layer: number;
  x: number;
  y: number;
}

export type Quad = [number, number, number, number];

export function texelKind(r: number, g: number, b: number, a: number): number {
  if (a === 255 && r / 255 > TOP_KEY_LEVEL && b / 255 > TOP_KEY_LEVEL && g / 255 < TOP_KEY_GREEN)
    return TEXEL_TOP;
  if (a <= FACE_ALPHA && a > FACE_ALPHA - FACE_ROWS) return TEXEL_FACE + FACE_ALPHA - a;
  return a / 255 < ALPHA_CUT ? TEXEL_CLEAR : TEXEL_SOLID;
}

export function atlasTexels(rgba: ArrayLike<number>, w: number, h: number): AtlasTexels {
  const kinds = new Uint8Array(w * h);
  for (let i = 0; i < kinds.length; i++)
    kinds[i] = texelKind(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2], rgba[i * 4 + 3]);
  return { w, h, kinds };
}

export function tileQuad(
  tile: TileData,
  tileW: number,
  tileH: number,
  out: number[] | Float32Array
): void {
  const offsetX = tile.animationOffset?.x || 0;
  const offsetY = tile.animationOffset?.y || 0;
  const scale = tile.scale && tile.scale > 0 ? tile.scale : 1;
  if (tile.painted) {
    const lying = tile.rotation === 90 || tile.rotation === 270;
    paintedQuad(
      tile.painted,
      tile.position.x,
      tile.position.y,
      tileW,
      offsetX,
      offsetY,
      scale,
      lying,
      out
    );
    if (mirrored(tile)) {
      const axis = 2 * (tile.position.x * tileW + offsetX) + tileW;
      const left = axis - out[2];
      out[2] = axis - out[0];
      out[0] = left;
    }
    return;
  }
  const drawW = tileW * scale;
  const drawH = tileH * scale;
  const x1 = tile.position.x * tileW + offsetX - (drawW - tileW) / 2;
  const y1 = tile.position.y * tileH + offsetY + (scale >= 1 ? tileH - drawH : (tileH - drawH) / 2);
  out[0] = x1;
  out[1] = y1;
  out[2] = x1 + drawW;
  out[3] = y1 + drawH;
}

export function mirrored(tile: TileData): boolean {
  return !!tile.flip && !tile.rotation && !!tile.painted;
}

function cellOf(t: AtlasTexels, s: PaintedSprite): Quad {
  return [
    Math.round(s.u1 * t.w),
    Math.round(s.v1 * t.h),
    Math.round(s.u2 * t.w),
    Math.round(s.v2 * t.h)
  ];
}

function quadToCell(rotation: TileData['rotation'], fx: number, fy: number): [number, number] {
  if (rotation === 90) return [fy, 1 - fx];
  if (rotation === 180) return [1 - fx, 1 - fy];
  if (rotation === 270) return [1 - fy, fx];
  return [fx, fy];
}

function cellToQuad(rotation: TileData['rotation'], fu: number, fv: number): [number, number] {
  if (rotation === 90) return [1 - fv, fu];
  if (rotation === 180) return [1 - fu, 1 - fv];
  if (rotation === 270) return [fv, 1 - fu];
  return [fu, fv];
}

function texelAt(t: AtlasTexels, tile: TileData, q: Quad, px: number, py: number): number {
  const s = tile.painted!;
  const [x0, y0, x1, y1] = cellOf(t, s);
  const fx = (px - q[0]) / (q[2] - q[0]);
  const [fu, fv] = quadToCell(
    tile.rotation,
    mirrored(tile) ? 1 - fx : fx,
    (py - q[1]) / (q[3] - q[1])
  );
  const tx = Math.min(x1 - 1, Math.max(x0, x0 + Math.floor(fu * (x1 - x0))));
  const ty = Math.min(y1 - 1, Math.max(y0, y0 + Math.floor(fv * (y1 - y0))));
  return t.kinds[ty * t.w + tx];
}

function groundOf(kind: number, artY: number, row: number, f: DrawnFrame): number {
  if (f.lift !== null && kind === TEXEL_TOP) return artY + f.lift;
  if (f.lift !== null && kind >= TEXEL_FACE) return artY + f.lift - 1 - (kind - TEXEL_FACE);
  return row * f.artPx + OBJECT_FOOT;
}

const isBlank = (tile: TileData) =>
  tile.scenery || (!tile.painted && (!tile.char || tile.char === ' '));

interface Candidate extends DrawnHit {
  ground: number;
  top: boolean;
}

export function drawnAt(
  grids: readonly (DrawnGrid | null)[],
  px: number,
  py: number,
  f: DrawnFrame
): DrawnHit | null {
  const cx = Math.floor(px / f.basePx);
  const cy = Math.floor(py / f.basePx);
  const artY = (py * f.artPx) / f.basePx;
  const q: Quad = [0, 0, 0, 0];
  const tops: Candidate[] = [];
  let best: Candidate | null = null;
  grids.forEach((grid, layer) => {
    if (!grid) return;
    for (let y = cy - REACH_ABOVE; y <= cy + REACH_BELOW; y++)
      for (let x = cx - REACH_SIDE; x <= cx + REACH_SIDE; x++) {
        const tile = grid.getTile(x, y);
        if (!tile || isBlank(tile)) continue;
        tileQuad(tile, f.basePx, f.basePx, q);
        if (px < q[0] || px >= q[2] || py < q[1] || py >= q[3]) continue;
        const kind = tile.painted && f.texels ? texelAt(f.texels, tile, q, px, py) : TEXEL_SOLID;
        if (kind === TEXEL_CLEAR) continue;
        const row = tile.position.y + (tile.animationOffset?.y || 0) / f.basePx;
        const hit: Candidate = {
          layer,
          x,
          y,
          ground: groundOf(kind, artY, row, f),
          top: kind === TEXEL_TOP
        };
        if (hit.top) tops.push(hit);
        if (!best || !f.depth || hit.ground >= best.ground) best = hit;
      }
  });
  if (!best) return null;
  const winner: Candidate = best;
  const own = winner.top
    ? tops.find(
        (c) =>
          c.layer === winner.layer &&
          c.ground === winner.ground &&
          c.x === cx &&
          c.y === Math.floor(winner.ground / f.artPx)
      )
    : undefined;
  const { layer, x, y } = own ?? winner;
  return { layer, x, y };
}

const opaqueBoxes = new WeakMap<PaintedSprite, Quad | null>();

function opaqueBox(t: AtlasTexels, s: PaintedSprite): Quad | null {
  if (opaqueBoxes.has(s)) return opaqueBoxes.get(s)!;
  const [x0, y0, x1, y1] = cellOf(t, s);
  let minX = x1;
  let minY = y1;
  let maxX = x0 - 1;
  let maxY = y0 - 1;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      if (t.kinds[y * t.w + x] === TEXEL_CLEAR) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  const box: Quad | null =
    maxX < minX
      ? null
      : [
          (minX - x0) / (x1 - x0),
          (minY - y0) / (y1 - y0),
          (maxX + 1 - x0) / (x1 - x0),
          (maxY + 1 - y0) / (y1 - y0)
        ];
  opaqueBoxes.set(s, box);
  return box;
}

export function drawnBounds(tile: TileData, f: DrawnFrame): Quad {
  const q: Quad = [0, 0, 0, 0];
  tileQuad(tile, f.basePx, f.basePx, q);
  const box = tile.painted && f.texels ? opaqueBox(f.texels, tile.painted) : null;
  if (!box) return q;
  const flip = mirrored(tile);
  const [ax, ay] = cellToQuad(tile.rotation, flip ? 1 - box[0] : box[0], box[1]);
  const [bx, by] = cellToQuad(tile.rotation, flip ? 1 - box[2] : box[2], box[3]);
  const w = q[2] - q[0];
  const h = q[3] - q[1];
  return [
    q[0] + Math.min(ax, bx) * w,
    q[1] + Math.min(ay, by) * h,
    q[0] + Math.max(ax, bx) * w,
    q[1] + Math.max(ay, by) * h
  ];
}

export interface DrawnFigure {
  quad: Quad;
  box: Quad;
  rotated: boolean;
  flipped: boolean;
  cell: Quad | null;
}

export function drawnFigure(tile: TileData, f: DrawnFrame): DrawnFigure {
  const quad: Quad = [0, 0, 0, 0];
  tileQuad(tile, f.basePx, f.basePx, quad);
  const s = tile.painted;
  return {
    quad,
    box: drawnBounds(tile, f),
    rotated: tile.rotation === 90 || tile.rotation === 270,
    flipped: mirrored(tile),
    cell: s && f.texels ? cellOf(f.texels, s) : null
  };
}
