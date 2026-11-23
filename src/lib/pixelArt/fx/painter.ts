import type { Rgb } from '../palette';
import { css, tex } from './bake';
import type { Spr } from './spr';

export class FxPainter {
  g: CanvasRenderingContext2D;
  k = 1;
  ox = 0;
  oy = 0;

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

  put(s: Spr, x: number, y: number): void {
    const x0 = Math.round(x) - s.ax;
    const y0 = Math.round(y) - s.ay;
    const dx = this.X(x0);
    const dy = this.Y(y0);
    this.g.drawImage(tex(s), dx, dy, this.X(x0 + s.w) - dx, this.Y(y0 + s.h) - dy);
  }

  veil(s: Spr, x: number, y: number, a: number): void {
    this.g.globalAlpha = a;
    this.put(s, x, y);
    this.g.globalAlpha = 1;
  }

  fill(c: Rgb, e: number): void {
    this.g.fillStyle = css(c, e);
  }

  rect(x: number, y: number, w: number, h: number): void {
    const dx = this.X(x);
    const dy = this.Y(y);
    this.g.fillRect(dx, dy, this.X(x + w) - dx, this.Y(y + h) - dy);
  }
}
