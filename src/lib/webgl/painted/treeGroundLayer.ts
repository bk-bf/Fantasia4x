import source from '../shaders/treeGround.glsl?raw';
import { GameGrid } from '../game-grid.js';
import type { GpuDevice, GpuTexture } from '../../gpu/device.js';
import { SizedTexture } from '../sizedTexture.js';
import type { TileData } from '../tile-types.js';
import { TreeField, type PlacedTree } from './treeGround.js';
import { TABLE_W, tableRows, treeGroundTable } from './treeGroundTable.js';
import type { PaintedTreeGround, TreeSoil } from './treeGroundManifest.js';
import { placedTuft } from './tufts.js';

export const TREE_UNIT = 8;
const NEAR = 2;
const SEASON = { summer: 0, autumn: 1, winter: 2 } as const;
const FULL = 255;
const NO_COLOUR = { r: 0, g: 0, b: 0 };
const VIEW_MARGIN = 3;

const MARKER = '#define TREE_GROUND_CODE\n';

export const withTreeGround = (shader: string): string => shader.replace(MARKER, `${source}\n`);

type Tile = { x: number; y: number };
type Rect = { x0: number; y0: number; x1: number; y1: number };

export class TreeGroundLayer {
  private readonly tex: SizedTexture;
  private field: TreeField | null = null;
  private bytes: Uint8Array = new Uint8Array(0);
  private grids: readonly (GameGrid | null)[] = [];
  private whole = true;
  private changed: Tile[] = [];
  private stale: Rect[] = [];
  private readonly dressed = new Set<number>();
  private soils: readonly TreeSoil[] = [];
  private kinds: Uint8Array = new Uint8Array(0);
  readonly decor = new GameGrid();
  private decorDirty: Tile[] = [];
  private dressedView = '';
  winter = false;

  constructor(
    private readonly gpu: GpuDevice,
    private readonly look: PaintedTreeGround,
    private readonly art: number
  ) {
    this.tex = new SizedTexture(gpu, 'rgba8unorm');
  }

  get texture(): GpuTexture {
    return this.tex.texture;
  }

  get tableRow(): number {
    return this.field?.h ?? 0;
  }

  setTrees(grids: readonly (GameGrid | null)[], dirty?: ReadonlyArray<Tile>): void {
    const same = grids.length === this.grids.length && grids.every((g, i) => g === this.grids[i]);
    this.grids = grids;
    if (!same) {
      this.whole = true;
      this.changed = [];
      return;
    }
    if (!this.whole && dirty) for (const t of dirty) this.changed.push(t);
  }

  private standAt(x: number, y: number) {
    for (const g of this.grids) {
      const painted = g?.getTile(x, y)?.painted;
      const stand = painted && this.look.stands.get(painted);
      if (stand) return stand;
    }
    return undefined;
  }

  sync(kinds: Uint8Array, w: number, h: number, soils: readonly TreeSoil[]): void {
    this.kinds = kinds;
    this.soils = soils;
    if (!this.field || this.field.w !== w || this.field.h !== h) {
      this.field = new TreeField(w, h, this.art, this.look, (tx, ty) => this.soilOf(tx, ty));
      this.clearDecor();
      this.allocate(w, h, soils);
      this.whole = true;
    }
    const f = this.field;
    if (this.whole) {
      this.whole = false;
      this.changed = [];
      f.trees.clear();
      for (const g of this.grids)
        for (const t of g?.getAllTiles() ?? []) {
          const { x, y } = t.position;
          if (x >= 0 && y >= 0 && x < w && y < h) f.plant(x, y, this.standAt(x, y));
        }
      this.restamp({ x0: 0, y0: 0, x1: w - 1, y1: h - 1 });
      this.winter = [...f.trees.values()].some((t) => t.stand.season === 'winter');
      return;
    }
    if (this.changed.length === 0) return;
    const reach = (t: PlacedTree | undefined) => (t ? Math.ceil(t.reach / this.art) + 1 : 1);
    for (const { x, y } of this.changed) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const before = reach(f.trees.get(y * w + x));
      if (!f.plant(x, y, this.standAt(x, y))) continue;
      const r = Math.max(before, reach(f.trees.get(y * w + x)));
      this.stale.push({ x0: x - r, y0: y - r, x1: x + r, y1: y + r });
    }
    this.changed = [];
    if (this.stale.length === 0) return;
    for (const rect of this.stale.splice(0)) this.restamp(rect);
    this.winter = [...f.trees.values()].some((t) => t.stand.season === 'winter');
  }

  private clearDecor(): void {
    this.dressed.clear();
    this.dressedView = '';
    for (const t of [...this.decor.getAllTiles()]) {
      const { x, y } = t.position;
      this.decor.removeTile(x, y);
      this.decorDirty.push({ x, y });
    }
  }

  private soilOf(tx: number, ty: number): TreeSoil | undefined {
    return this.soils[this.kinds[ty * (this.field?.w ?? 0) + tx]];
  }

  private allocate(w: number, h: number, soils: readonly TreeSoil[]): void {
    const rows = tableRows(this.look.kinds.length);
    this.bytes = new Uint8Array(w * h * 4);
    this.tex.resize(Math.max(w, TABLE_W), h + rows, true);
    this.tex.write(treeGroundTable(this.look, soils), 0, h, TABLE_W, rows);
  }

  private restamp(r: Rect): void {
    const f = this.field;
    if (!f) return;
    const box = {
      x0: Math.max(0, r.x0),
      y0: Math.max(0, r.y0),
      x1: Math.min(f.w - 1, r.x1),
      y1: Math.min(f.h - 1, r.y1)
    };
    if (box.x1 < box.x0 || box.y1 < box.y0) return;
    f.restamp(box.x0, box.y0, box.x1, box.y1);
    const out = {
      x0: Math.max(0, box.x0 - NEAR),
      y0: Math.max(0, box.y0 - NEAR),
      x1: Math.min(f.w - 1, box.x1 + NEAR),
      y1: Math.min(f.h - 1, box.y1 + NEAR)
    };
    this.writeBytes(out);
    this.undress(box);
  }

  private writeBytes(r: Rect): void {
    const f = this.field!;
    const { w, h, str, own, trees } = f;
    const bytes = this.bytes;
    for (let ty = r.y0; ty <= r.y1; ty++)
      for (let tx = r.x0; tx <= r.x1; tx++) {
        const i = ty * w + tx;
        let near = 0;
        for (let dy = -NEAR; dy <= NEAR && !near; dy++)
          for (let dx = -NEAR; dx <= NEAR; dx++) {
            const x = tx + dx;
            const y = ty + dy;
            if (x >= 0 && y >= 0 && x < w && y < h && str[y * w + x] > 0) {
              near = 1;
              break;
            }
          }
        const t = own[i] >= 0 ? trees.get(own[i]) : undefined;
        bytes[i * 4] = Math.round(Math.min(1, str[i]) * FULL);
        bytes[i * 4 + 1] = t ? t.stand.kind + 1 : 0;
        bytes[i * 4 + 2] = near ? FULL : 0;
        bytes[i * 4 + 3] = t ? SEASON[t.stand.season] : 0;
      }
    const rw = r.x1 - r.x0 + 1;
    const rh = r.y1 - r.y0 + 1;
    const sub = new Uint8Array(rw * rh * 4);
    for (let j = 0; j < rh; j++)
      sub.set(
        bytes.subarray(((r.y0 + j) * w + r.x0) * 4, ((r.y0 + j) * w + r.x1 + 1) * 4),
        j * rw * 4
      );
    this.tex.write(sub, r.x0, r.y0, rw, rh);
  }

  private undress(r: Rect): void {
    const f = this.field!;
    this.dressedView = '';
    const strip = (x: number, y: number) => {
      this.dressed.delete(y * f.w + x);
      if (this.decor.removeTile(x, y)) this.decorDirty.push({ x, y });
    };
    for (const t of f.trees.values()) {
      if (!this.dressed.has(t.key)) continue;
      const reach = Math.ceil(t.reach / this.art) + 1;
      if (t.x + reach < r.x0 || t.x - reach > r.x1 || t.y + reach < r.y0 || t.y - reach > r.y1)
        continue;
      strip(t.x, t.y);
    }
    for (const key of [...this.dressed])
      if (!f.trees.has(key)) strip(key % f.w, Math.floor(key / f.w));
  }

  dressAround(view: { x: number; y: number; w: number; h: number }, budgetMs: number): Tile[] {
    const f = this.field;
    const touched = this.decorDirty.splice(0);
    if (!f) return touched;
    const start = performance.now();
    const x0 = Math.max(0, Math.floor(view.x) - VIEW_MARGIN);
    const y0 = Math.max(0, Math.floor(view.y) - VIEW_MARGIN);
    const x1 = Math.min(f.w - 1, Math.ceil(view.x + view.w) + VIEW_MARGIN);
    const y1 = Math.min(f.h - 1, Math.ceil(view.y + view.h) + VIEW_MARGIN);
    const viewKey = `${x0},${y0},${x1},${y1}`;
    if (viewKey === this.dressedView) return touched;
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        const key = ty * f.w + tx;
        const t = f.trees.get(key);
        if (!t || this.dressed.has(key)) continue;
        if (performance.now() - start > budgetMs) return touched;
        this.dressed.add(key);
        const placed = f.dress(t);
        if (placed.length === 0) continue;
        const tile: TileData = {
          char: ' ',
          foreground: NO_COLOUR,
          background: NO_COLOUR,
          backgroundAlpha: 0,
          position: { x: tx, y: ty },
          tufts: placed.map((p) => placedTuft(p.sprite, p.dx, p.dy, this.art))
        };
        this.decor.setTile(tx, ty, tile);
        touched.push({ x: tx, y: ty });
      }
    this.dressedView = viewKey;
    return touched;
  }

  dispose(): void {
    this.tex.destroy();
  }
}
