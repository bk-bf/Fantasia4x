import type { WebGLRenderer } from '$lib/webgl/renderer.js';
import { BASE_TILE_PX } from '$lib/webgl/tile-types.js';
import { Spr } from '$lib/pixelArt/fx/spr';
import type { Struck } from '$lib/pixelArt/fx/flight';
import type { Box } from '$lib/pixelArt/fx/effects';

export const ART_TILE = 32;
const K = ART_TILE / BASE_TILE_PX;
const OPAQUE = 128;

export interface Figure {
  x: number;
  y: number;
  head: number;
  lying: boolean;
  box: Box;
}

export function figureAt(
  r: WebGLRenderer | null,
  cellX: number,
  cellY: number,
  wx: number,
  wy: number
): Figure {
  const d = r?.drawnFigure('entity', cellX, cellY);
  if (d) {
    const b = d.box.map((v) => Math.round(v * K)) as unknown as Box;
    return { x: Math.round((b[0] + b[2]) / 2), y: b[3], head: b[1], lying: d.rotated, box: b };
  }
  const x = Math.round((wx + 0.5) * ART_TILE);
  const y = Math.round((wy + 1) * ART_TILE);
  return { x, y, head: y - 28, lying: false, box: [x - 8, y - 28, x + 8, y] };
}

const sprites = new Map<string, Spr | null>();

function cellSprite(r: WebGLRenderer, cell: readonly number[]): Spr | null {
  const key = cell.join(',');
  if (sprites.has(key)) return sprites.get(key) ?? null;
  const w = cell[2] - cell[0];
  const h = cell[3] - cell[1];
  const rgba = r.atlasCell([cell[0], cell[1], cell[2], cell[3]]);
  let s: Spr | null = null;
  if (rgba) {
    s = new Spr(w, h, 0, 0);
    for (let i = 0; i < w * h; i++)
      if (rgba[i * 4 + 3] >= OPAQUE) s.c[i] = [rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]];
  }
  sprites.set(key, s);
  return s;
}

export function struckAt(r: WebGLRenderer | null, cellX: number, cellY: number, f: Figure): Struck {
  const plain: Struck = { x: f.x, top: f.box[1], ht: f.box[3] - f.box[1], spr: null, at: [0, 0] };
  const d = r?.drawnFigure('entity', cellX, cellY);
  if (!r || !d || d.rotated || !d.cell) return plain;
  const qx = Math.round(d.quad[0] * K);
  const qy = Math.round(d.quad[1] * K);
  const qw = Math.round((d.quad[2] - d.quad[0]) * K);
  const cw = d.cell[2] - d.cell[0];
  if (Math.abs(qw - cw) > 1) return plain;
  return { ...plain, spr: cellSprite(r, d.cell), at: [qx, qy] };
}
