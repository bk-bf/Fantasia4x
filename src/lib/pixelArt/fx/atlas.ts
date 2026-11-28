import { ambientNow, gradeGen } from './bake';
import type { Spr } from './spr';

export interface Slot {
  x: number;
  y: number;
}

type Rect = [number, number, number, number];

const SIZE = 1024;

interface Layer {
  c: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
}

interface Atlas {
  full: Layer;
  dim: Layer;
  mult: Layer;
  work: Layer;
  lit: Layer;
  fullPx: ImageData;
  dimPx: ImageData;
}

let atlas: Atlas | null | undefined;
const slots = new Map<number, Slot>();
const ids = new WeakMap<Spr, number>();
let nextId = 1;
let shelfX = 0;
let shelfY = 0;
let shelfH = 0;
let epoch = 0;
let litGen = -1;
let dirty: Rect | null = null;

function layer(): Layer | null {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d');
  return g ? { c, g } : null;
}

function open(): Atlas | null {
  if (atlas !== undefined) return atlas;
  const [full, dim, mult, work, lit] = [layer(), layer(), layer(), layer(), layer()];
  atlas =
    full && dim && mult && work && lit
      ? {
          full,
          dim,
          mult,
          work,
          lit,
          fullPx: full.g.createImageData(SIZE, SIZE),
          dimPx: dim.g.createImageData(SIZE, SIZE)
        }
      : null;
  return atlas;
}

function sprId(s: Spr): number {
  let id = ids.get(s);
  if (!id) {
    id = nextId++;
    ids.set(s, id);
  }
  return id;
}

function reset(): void {
  slots.clear();
  shelfX = shelfY = shelfH = 0;
  epoch++;
  dirty = null;
}

function alloc(w: number, h: number): Slot | null {
  if (shelfX + w > SIZE) {
    shelfY += shelfH;
    shelfX = 0;
    shelfH = 0;
  }
  if (w > SIZE || shelfY + h > SIZE) return null;
  const at = { x: shelfX, y: shelfY };
  shelfX += w + 1;
  shelfH = Math.max(shelfH, h + 1);
  return at;
}

function grow(r: Rect): void {
  dirty = dirty
    ? [
        Math.min(dirty[0], r[0]),
        Math.min(dirty[1], r[1]),
        Math.max(dirty[2], r[2]),
        Math.max(dirty[3], r[3])
      ]
    : r;
}

function write(a: Atlas, s: Spr, at: Slot): void {
  const f = a.fullPx.data;
  const d = a.dimPx.data;
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++) {
      const i = y * s.w + x;
      const p = ((at.y + y) * SIZE + at.x + x) * 4;
      const col = s.c[i];
      if (!col) {
        f.fill(0, p, p + 4);
        d.fill(0, p, p + 4);
        continue;
      }
      f[p] = col[0];
      f[p + 1] = col[1];
      f[p + 2] = col[2];
      f[p + 3] = 255;
      d.fill(255, p, p + 3);
      d[p + 3] = 255 - s.e[i];
    }
  grow([at.x, at.y, at.x + s.w, at.y + s.h]);
}

export const atlasEpoch = (): number => epoch;

export function tex(s: Spr): Slot | null {
  const a = open();
  if (!a) return null;
  const id = sprId(s);
  const had = slots.get(id);
  if (had) return had;
  let at = alloc(s.w, s.h);
  if (!at) {
    reset();
    at = alloc(s.w, s.h);
    if (!at) return null;
  }
  write(a, s, at);
  slots.set(id, at);
  return at;
}

function relight(a: Atlas, [x0, y0, x1, y1]: Rect): void {
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return;
  const m = ambientNow().map((v) => Math.round(Math.min(1, v) * 255));
  const mg = a.mult.g;
  mg.globalCompositeOperation = 'copy';
  mg.drawImage(a.dim.c, x0, y0, w, h, x0, y0, w, h);
  mg.globalCompositeOperation = 'source-in';
  mg.fillStyle = `rgb(${m.join(' ')})`;
  mg.fillRect(x0, y0, w, h);
  mg.globalCompositeOperation = 'destination-over';
  mg.fillStyle = '#fff';
  mg.fillRect(x0, y0, w, h);
  const wg = a.work.g;
  wg.globalCompositeOperation = 'copy';
  wg.drawImage(a.full.c, x0, y0, w, h, x0, y0, w, h);
  wg.globalCompositeOperation = 'multiply';
  wg.drawImage(a.mult.c, x0, y0, w, h, x0, y0, w, h);
  wg.globalCompositeOperation = 'destination-in';
  wg.drawImage(a.full.c, x0, y0, w, h, x0, y0, w, h);
  const lg = a.lit.g;
  lg.clearRect(x0, y0, w, h);
  lg.drawImage(a.work.c, x0, y0, w, h, x0, y0, w, h);
}

export function flushAtlas(): HTMLCanvasElement | null {
  const a = open();
  if (!a) return null;
  if (dirty) {
    const [x0, y0, x1, y1] = dirty;
    a.full.g.putImageData(a.fullPx, 0, 0, x0, y0, x1 - x0, y1 - y0);
    a.dim.g.putImageData(a.dimPx, 0, 0, x0, y0, x1 - x0, y1 - y0);
  }
  const gen = gradeGen();
  if (gen !== litGen) {
    litGen = gen;
    relight(a, [0, 0, SIZE, Math.min(SIZE, shelfY + shelfH)]);
  } else if (dirty) relight(a, dirty);
  dirty = null;
  return a.lit.c;
}
