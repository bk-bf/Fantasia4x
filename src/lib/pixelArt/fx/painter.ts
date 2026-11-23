import type { Rgb } from '../palette';
import { atlasCanvas, atlasEpoch, css, flushAtlas, tex, type Slot } from './bake';
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

export class FxPainter {
  g: CanvasRenderingContext2D;
  k = 1;
  ox = 0;
  oy = 0;
  private ops: Op[] = [];
  private style = '';

  constructor(g: CanvasRenderingContext2D) {
    this.g = g;
  }

  view(k: number, ox: number, oy: number): void {
    this.k = k;
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

  veil(s: Spr, x: number, y: number, a: number): void {
    this.push(s, '', a, Math.round(x) - s.ax, Math.round(y) - s.ay, s.w, s.h);
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
    flushAtlas();
    const src = atlasCanvas();
    const g = this.g;
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
