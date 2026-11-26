import type { GameGrid } from '../game-grid.js';
import type { GpuDevice } from '../../gpu/device.js';
import { SizedTexture } from '../sizedTexture.js';
import { samplersOf } from '../samplers.js';

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
  private readonly gpu: GpuDevice;
  private readonly tex: SizedTexture;
  private levels = new Uint8Array(0);
  private still: Uint8Array = new Uint8Array(0);
  private w = 0;
  private h = 0;
  private grid: GameGrid | null = null;
  private stale = true;
  private dirty: Tile[] = [];

  constructor(gpu: GpuDevice) {
    this.gpu = gpu;
    this.tex = new SizedTexture(gpu, 'rg8unorm');
    gpu.bindSampler(ICE_UNIT, samplersOf(gpu).linear);
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
    this.gpu.setTextureSlot(ICE_UNIT);
    this.gpu.bindTexture(this.tex.texture);
  }

  private levelAt(x: number, y: number): number {
    return Math.round(Math.min(1, Math.max(0, this.grid?.getTile(x, y)?.waterIce ?? 0)) * FULL);
  }

  sync(w: number, h: number): void {
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      this.levels = new Uint8Array(w * h * TEXEL);
      this.stale = true;
    }
    if (!this.stale && this.dirty.length === 0) return;
    if (this.stale) {
      this.levels.fill(0);
      for (const t of this.grid?.getAllTiles() ?? []) {
        const { x, y } = t.position;
        if (x >= 0 && y >= 0 && x < w && y < h)
          this.levels[(y * w + x) * TEXEL] = this.levelAt(x, y);
      }
      for (let i = 0; i < w * h; i++) this.levels[i * TEXEL + 1] = this.still[i] ?? 0;
      this.tex.resize(w, h);
      this.tex.write(this.levels);
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
        this.tex.write(part, rect.x, rect.y, rect.w, rect.h);
      }
    }
    this.stale = false;
    this.dirty = [];
  }

  dispose(): void {
    this.tex.destroy();
  }
}
