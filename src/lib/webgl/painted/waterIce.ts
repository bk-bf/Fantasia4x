import type { GameGrid } from '../game-grid.js';

export const ICE_UNIT = 13;
const FULL = 255;
const TEXEL = 2;

type Tile = { x: number; y: number };

export function iceRect(tiles: ReadonlyArray<Tile>, w: number, h: number) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (const { x, y } of tiles) {
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export class WaterIce {
  private readonly gl: WebGL2RenderingContext;
  private readonly tex: WebGLTexture;
  private levels = new Uint8Array(0);
  private still = new Uint8Array(0);
  private w = 0;
  private h = 0;
  private grid: GameGrid | null = null;
  private stale = true;
  private dirty: Tile[] = [];

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.tex = gl.createTexture()!;
    this.bind();
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
      gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
      gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
  }

  setGrid(grid: GameGrid | null, dirtyTiles?: ReadonlyArray<Tile>): void {
    if (grid !== this.grid || !dirtyTiles || dirtyTiles.length === 0) {
      this.grid = grid;
      this.stale = true;
      this.dirty = [];
      return;
    }
    if (!this.stale) for (const t of dirtyTiles) this.dirty.push(t);
  }

  setStill(reach: Uint8Array): void {
    this.still = reach;
    this.stale = true;
  }

  bind(): void {
    this.gl.activeTexture(this.gl.TEXTURE0 + ICE_UNIT);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.tex);
  }

  private levelAt(x: number, y: number): number {
    return Math.round(Math.min(1, Math.max(0, this.grid?.getTile(x, y)?.waterIce ?? 0)) * FULL);
  }

  sync(w: number, h: number): void {
    const gl = this.gl;
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      this.levels = new Uint8Array(w * h * TEXEL);
      this.stale = true;
    }
    if (!this.stale && this.dirty.length === 0) return;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.bind();
    if (this.stale) {
      this.levels.fill(0);
      for (const t of this.grid?.getAllTiles() ?? []) {
        const { x, y } = t.position;
        if (x >= 0 && y >= 0 && x < w && y < h)
          this.levels[(y * w + x) * TEXEL] = this.levelAt(x, y);
      }
      for (let i = 0; i < w * h; i++) this.levels[i * TEXEL + 1] = this.still[i] ?? 0;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, w, h, 0, gl.RG, gl.UNSIGNED_BYTE, this.levels);
    } else {
      const rect = iceRect(this.dirty, w, h);
      if (rect) {
        const part = new Uint8Array(rect.w * rect.h * TEXEL);
        for (let j = 0; j < rect.h; j++)
          for (let i = 0; i < rect.w; i++) {
            const at = (rect.y + j) * w + rect.x + i;
            this.levels[at * TEXEL] = this.levelAt(rect.x + i, rect.y + j);
            part.set(
              this.levels.subarray(at * TEXEL, at * TEXEL + TEXEL),
              (j * rect.w + i) * TEXEL
            );
          }
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          rect.x,
          rect.y,
          rect.w,
          rect.h,
          gl.RG,
          gl.UNSIGNED_BYTE,
          part
        );
      }
    }
    this.stale = false;
    this.dirty = [];
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.activeTexture(gl.TEXTURE0);
  }

  dispose(): void {
    this.gl.deleteTexture(this.tex);
  }
}
