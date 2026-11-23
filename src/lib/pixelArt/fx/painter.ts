import type { Rgb } from '../palette';
import { css } from './bake';
import { atlasEpoch, flushAtlas, tex, type Slot } from './atlas';
import type { Spr } from './spr';

interface Op {
  s: Spr | null;
  fill: string;
  a: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  at: Slot | null;
}

const RESOLVE_TRIES = 2;

type Rect = [number, number, number, number];

function bounds(ops: readonly Op[]): Rect | null {
  if (ops.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const o of ops) {
    x0 = Math.min(x0, o.dx);
    y0 = Math.min(y0, o.dy);
    x1 = Math.max(x1, o.dx + o.dw);
    y1 = Math.max(y1, o.dy + o.dh);
  }
  return [x0 - 1, y0 - 1, x1 + 1, y1 + 1];
}

export class FxPainter {
  g: CanvasRenderingContext2D;
  k = 1;
  kt = 1;
  ox = 0;
  oy = 0;
  private ops: Op[] = [];
  private style = '';
  private drawn: Rect | null = null;

  constructor(g: CanvasRenderingContext2D) {
    this.g = g;
  }

  view(k: number, ox: number, oy: number, kt = k): void {
    this.k = k;
    this.kt = kt;
    this.ox = ox;
    this.oy = oy;
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.g.imageSmoothingEnabled = false;
  }

  private X = (x: number) => Math.round(x * this.k + this.ox);
  private Y = (y: number) => Math.round(y * this.k + this.oy);

  private push(
    s: Spr | null,
    fill: string,
    a: number,
    x0: number,
    y0: number,
    w: number,
    h: number
  ) {
    const dx = this.X(x0);
    const dy = this.Y(y0);
    this.ops.push({
      s,
      fill,
      a,
      dx,
      dy,
      dw: this.X(x0 + w) - dx,
      dh: this.Y(y0 + h) - dy,
      at: null
    });
  }

  put(s: Spr, x: number, y: number): void {
    this.push(s, '', 1, Math.round(x) - s.ax, Math.round(y) - s.ay, s.w, s.h);
  }

  get textRatio(): number {
    return this.kt / this.k;
  }

  label(s: Spr, x: number, y: number, ox: number, oy: number): void {
    const dx = Math.round(x * this.k + this.ox + (Math.round(ox) - s.ax) * this.kt);
    const dy = Math.round(y * this.k + this.oy + (Math.round(oy) - s.ay) * this.kt);
    this.ops.push({ s, fill: '', a: 1, dx, dy, dw: s.w * this.kt, dh: s.h * this.kt, at: null });
  }

  veil(s: Spr, x: number, y: number, a: number): void {
    this.push(s, '', a, Math.round(x) - s.ax, Math.round(y) - s.ay, s.w, s.h);
  }

  forget(): void {
    this.drawn = null;
  }

  fill(c: Rgb, e: number): void {
    this.style = css(c, e);
  }

  rect(x: number, y: number, w: number, h: number): void {
    this.push(null, this.style, 1, x, y, w, h);
  }

  end(): void {
    const ops = this.ops;
    this.ops = [];
    for (let i = 0; i < RESOLVE_TRIES; i++) {
      const before = atlasEpoch();
      for (const op of ops) if (op.s) op.at = tex(op.s);
      if (atlasEpoch() === before) break;
    }
    const src = flushAtlas();
    const g = this.g;
    const now = bounds(ops);
    for (const r of [this.drawn, now]) if (r) g.clearRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
    this.drawn = now;
    for (const op of ops) {
      if (!op.s) {
        g.fillStyle = op.fill;
        g.fillRect(op.dx, op.dy, op.dw, op.dh);
        continue;
      }
      if (!src || !op.at) continue;
      g.globalAlpha = op.a;
      g.drawImage(src, op.at.x, op.at.y, op.s.w, op.s.h, op.dx, op.dy, op.dw, op.dh);
    }
    g.globalAlpha = 1;
  }
}
