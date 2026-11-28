import type { PaintedSprite, TreeFx } from './manifest.js';
import { leanAt, WIND_SHAPE, type WindClock } from './wind.js';

export const BIT_FLOATS = 10;

export const SHAPE = { leaf: 0, dot: 1, plus: 2, apple: 3, puff: 4 } as const;

type Rgb = readonly [number, number, number];

const hex = (h: string): Rgb => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16)
];

const C = {
  snow: hex('#e6eef0'),
  snowDim: hex('#a4b6c8'),
  apple: hex('#de6a52'),
  mote: ['#ffd98a', '#f6a04a', '#d2602e', '#8c3a40'].map(hex),
  orb: hex('#fff6c8'),
  orbHalo: hex('#e6d98f'),
  wisp: ['#d0f8ec', '#94dcc8', '#56b0a4'].map(hex),
  spore: ['#c493de', '#a066c4', '#7d43a2'].map(hex),
  bone: hex('#e0dac4'),
  dust: hex('#c4bca0'),
  flame: ['#ffd98a', '#ffb35a', '#f6873a', '#d9582c', '#9c3a3c'].map(hex),
  rim: hex('#ffc070')
};

const LEVELS = WIND_SHAPE.trees.levels;
const SCAN_SECONDS = 0.25;
const MARGIN = 4;
const MAX_BITS = 1500;

const scaled = ([r, g, b]: Rgb, k: number): Rgb => [r * k, g * k, b * k];

export const packRgb = ([r, g, b]: Rgb): number =>
  Math.round(r) * 65536 + Math.round(g) * 256 + Math.round(b);

interface Bit {
  k: 'apple' | 'mote' | 'puff' | 'flake' | 'orb' | 'hmote' | 'wisp' | 'spore' | 'bone' | 'dust';
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  ph: number;
  floor?: number;
  bounced?: boolean;
  col?: Rgb;
  dim?: Rgb;
}

export interface FxTree {
  tx: number;
  ty: number;
  s: PaintedSprite & { fx: TreeFx };
}

export interface BitsFrame {
  view: { x: number; y: number; w: number; h: number };
  artTile: number;
  fxAt: (x: number, y: number) => (PaintedSprite & { fx: TreeFx }) | undefined;
}

type BitWind = Pick<WindClock, 'dir' | 'scroll' | 'scale' | 'idle' | 'strength' | 'clock'>;

function cell(x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return (h & 65535) / 65535;
}

function noise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let fx = x - ix;
  let fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const top = cell(ix, iy) + (cell(ix + 1, iy) - cell(ix, iy)) * fx;
  const bottom = cell(ix, iy + 1) + (cell(ix + 1, iy + 1) - cell(ix, iy + 1)) * fx;
  return top + (bottom - top) * fy;
}

export function windLevel(strength: number): number {
  let level = 0;
  for (let i = 1; i < LEVELS.length; i++) if (strength >= LEVELS[i]) level = i;
  return level;
}

export class TreeBits {
  bits: Bit[] = [];
  trees: FxTree[] = [];
  private clocks = new Map<number, Record<string, number>>();
  private scanIn = 0;
  private scanned = '';
  private out: Float32Array = new Float32Array(MAX_BITS * BIT_FLOATS);
  private n = 0;

  constructor(private readonly rand: () => number = Math.random) {}

  private scan(f: BitsFrame): void {
    const { x, y, w, h } = f.view;
    const trees: FxTree[] = [];
    for (let ty = y - 1; ty < y + h + MARGIN; ty++)
      for (let tx = x - MARGIN; tx < x + w + MARGIN; tx++) {
        const s = f.fxAt(tx, ty);
        if (s) trees.push({ tx, ty, s });
      }
    this.trees = trees;
    const keep = new Set(trees.map((t) => t.tx * 65536 + t.ty));
    for (const key of this.clocks.keys()) if (!keep.has(key)) this.clocks.delete(key);
  }

  private every(t: FxTree, name: string, rate: number, secs: number): number {
    const key = t.tx * 65536 + t.ty;
    let c = this.clocks.get(key);
    if (!c) this.clocks.set(key, (c = {}));
    c[name] = (c[name] ?? this.rand()) + rate * secs;
    let n = 0;
    while (c[name] >= 1) {
      c[name] -= 1;
      n++;
    }
    return n;
  }

  private pick(list: number[] | undefined): [number, number] | null {
    if (!list || list.length < 2) return null;
    const i = Math.floor(this.rand() * (list.length / 2)) * 2;
    return [list[i], list[i + 1]];
  }

  private put(
    x: number,
    y: number,
    col: Rgb,
    glow: number,
    alpha: number,
    shape: number,
    arm: Rgb = col
  ): void {
    if (this.n >= MAX_BITS || alpha <= 0) return;
    const o = this.n * BIT_FLOATS;
    this.out[o] = Math.round(x);
    this.out[o + 1] = Math.round(y);
    this.out[o + 2] = 0;
    this.out[o + 3] = 0;
    this.out[o + 4] = 0;
    this.out[o + 5] = packRgb(col);
    this.out[o + 6] = packRgb(arm);
    this.out[o + 7] = glow;
    this.out[o + 8] = alpha;
    this.out[o + 9] = shape;
    this.n++;
  }

  step(secs: number, wind: BitWind, f: BitsFrame): void {
    const at = `${f.view.x},${f.view.y},${f.view.w},${f.view.h}`;
    this.scanIn -= secs;
    if (this.scanIn <= 0 || at !== this.scanned) {
      this.scanIn = SCAN_SECONDS;
      this.scanned = at;
      this.scan(f);
    }
    const level = windLevel(wind.strength);
    const A = f.artTile;
    if (secs > 0)
      for (const t of this.trees) {
        const fx = t.s.fx;
        const ox = t.tx * A;
        const oy = t.ty * A;
        const mature = fx.age !== 'young';
        const elder = fx.age === 'elder';
        const has = (k: TreeFx['fx'][number]) => fx.fx.includes(k);
        const foot = { x: ox + A / 2, y: oy + A };
        if (has('apple'))
          for (let n = this.every(t, 'apple', 1 / 8, secs); n > 0; n--) {
            const p = this.pick(fx.leaves);
            if (!p || p[1] < fx.box[1] + (fx.box[3] - fx.box[1]) * 0.45) continue;
            this.bits.push({
              k: 'apple',
              x: ox + p[0],
              y: oy + p[1],
              vx: 0,
              vy: 0,
              age: 0,
              life: 9,
              ph: 0,
              floor: foot.y - 2 + this.rand() * 12
            });
          }
        if (has('frost')) {
          for (
            let n = this.every(t, 'puff', [0.15, 0.25, 0.7, 1.6][level] * (mature ? 1 : 0.4), secs);
            n > 0;
            n--
          ) {
            const p = this.pick(fx.bright ?? fx.leaves);
            if (p)
              this.bits.push({
                k: 'puff',
                x: ox + p[0],
                y: oy + p[1],
                vx: wind.scale * 18 + 2,
                vy: 6,
                age: 0,
                life: 1.6,
                ph: 0
              });
          }
          if (elder)
            for (let n = this.every(t, 'flake', 3, secs); n > 0; n--)
              this.bits.push({
                k: 'flake',
                x: ox + fx.box[0] + this.rand() * (fx.box[2] - fx.box[0]),
                y: oy + fx.box[1] + this.rand() * 20,
                vx: wind.scale * 10,
                vy: 9 + this.rand() * 5,
                age: 0,
                life: 6,
                floor: foot.y + this.rand() * 10,
                ph: this.rand() * 6
              });
        }
        if (has('moon') && elder)
          for (let n = this.every(t, 'rise', 0.3, secs); n > 0; n--) {
            const o = fx.orbs;
            if (!o?.length) break;
            const i = Math.floor(this.rand() * (o.length / 3)) * 3;
            this.bits.push({
              k: 'orb',
              x: ox + o[i],
              y: oy + o[i + 1],
              vx: 0,
              vy: -4,
              age: 0,
              life: 6,
              ph: this.rand() * 6
            });
          }
        if (has('ember'))
          for (let n = this.every(t, 'mote', elder ? 7 : 3.5, secs); n > 0; n--) {
            const p = this.pick(fx.edges);
            if (p)
              this.bits.push({
                k: 'mote',
                x: ox + p[0],
                y: oy + p[1] - 2,
                vx: wind.scale * 5,
                vy: -(7 + this.rand() * 6),
                age: 0,
                life: 3 + this.rand() * 1.5,
                ph: this.rand() * 6
              });
          }
        if (has('hollow') && fx.hollow)
          for (let n = this.every(t, 'hollow', 0.45, secs); n > 0; n--) {
            const [hx, hy, r, g, b, dr, dg, db] = fx.hollow;
            this.bits.push({
              k: 'hmote',
              x: ox + hx + (this.rand() - 0.5) * 6,
              y: oy + hy + (this.rand() - 0.5) * 10,
              vx: (this.rand() - 0.5) * 3,
              vy: -3 - this.rand() * 2,
              age: 0,
              life: 3.2,
              ph: this.rand() * 6,
              col: [r, g, b],
              dim: [dr, dg, db]
            });
          }
        if (has('wisp'))
          for (let n = this.every(t, 'wisp', 0.9, secs); n > 0; n--)
            this.bits.push({
              k: 'wisp',
              x: foot.x + (this.rand() - 0.5) * 12,
              y: foot.y - fx.h * 0.12,
              vx: 0,
              vy: -5 - this.rand() * 3,
              age: 0,
              life: 5,
              ph: this.rand() * 6
            });
        if (has('spore'))
          for (let n = this.every(t, 'spore', elder ? 1.4 : 0.6, secs); n > 0; n--) {
            const p = this.pick(fx.leaves);
            if (p)
              this.bits.push({
                k: 'spore',
                x: ox + p[0],
                y: oy + p[1],
                vx: wind.scale * 8 + 1,
                vy: 3 + this.rand() * 3,
                age: 0,
                life: 4.5,
                ph: this.rand() * 6,
                floor: foot.y + 10
              });
          }
        if (has('bark')) {
          for (let n = this.every(t, 'bark', 0.35, secs); n > 0; n--)
            this.bits.push({
              k: 'bone',
              x: foot.x + (this.rand() - 0.5) * fx.w * 0.12,
              y: foot.y - fx.h * (0.3 + this.rand() * 0.4),
              vx: wind.scale * 6,
              vy: 14,
              age: 0,
              life: 6,
              ph: 0,
              floor: foot.y + this.rand() * 6
            });
          if (elder)
            for (let n = this.every(t, 'dust', 0.8, secs); n > 0; n--)
              this.bits.push({
                k: 'dust',
                x: foot.x + (this.rand() - 0.5) * 10,
                y: foot.y - fx.h * 0.1,
                vx: 0,
                vy: -4,
                age: 0,
                life: 4,
                ph: this.rand() * 6
              });
        }
      }
    this.move(secs);
    if (this.bits.length > MAX_BITS) this.bits.splice(0, this.bits.length - MAX_BITS);
  }

  private move(secs: number): void {
    let kept = 0;
    for (const p of this.bits) {
      p.age += secs;
      if (p.age >= p.life) continue;
      this.bits[kept++] = p;
      if (p.k === 'apple') {
        if (p.y < (p.floor ?? p.y)) {
          p.vy += 170 * secs;
          p.y = Math.min(p.floor ?? p.y, p.y + p.vy * secs);
          if (p.y >= (p.floor ?? p.y) && !p.bounced) {
            p.bounced = true;
            p.y = (p.floor ?? p.y) - 1;
            p.vy = -p.vy * 0.25;
          }
        }
        continue;
      }
      if (p.floor !== undefined && p.y >= p.floor) continue;
      const sway = p.k === 'puff' || p.k === 'mote' ? 0 : Math.sin(p.age * 2.2 + p.ph) * 4;
      p.x += (p.vx + sway) * secs;
      p.y += p.vy * secs;
    }
    this.bits.length = kept;
  }

  private attached(wind: BitWind, f: BitsFrame): void {
    const A = f.artTile;
    const t = wind.clock;
    for (const tree of this.trees) {
      const fx = tree.s.fx;
      if (!fx.edges && !fx.orbs) continue;
      const ox = tree.tx * A;
      const oy = tree.ty * A;
      const lean = leanAt(ox + A / 2, oy + A, tree.s.sway ?? 0, wind);
      const top = oy + tree.s.oy * A;
      const rows = tree.s.h * A;
      const shift = (y: number) => {
        const r = Math.round(y - top);
        const rise = Math.max(0, Math.min(1, (rows - r + (r % 3)) / rows));
        return Math.round(lean * rise * Math.sqrt(rise));
      };
      if (fx.orbs)
        for (let i = 0; i < fx.orbs.length; i += 3) {
          const [x, y, ph0] = [fx.orbs[i], fx.orbs[i + 1], (fx.orbs[i + 2] / 255) * 6];
          const wx = ox + x + shift(oy + y) + Math.round(Math.sin(t * 0.55 + ph0) * 1.4);
          const wy = oy + y + Math.round(Math.cos(t * 0.42 + ph0 * 1.3) * 1.1);
          const p = 0.5 + 0.5 * Math.sin(t * 1.3 + ph0);
          this.put(wx, wy, C.orb, 1, 1, SHAPE.plus, scaled(C.orbHalo, 0.7 + 0.3 * p));
        }
      if (fx.edges)
        for (let i = 0; i < fx.edges.length; i += 2) {
          const x = fx.edges[i];
          const y = fx.edges[i + 1];
          const v = noise(x * 0.085 + t * 0.55 + tree.tx, y * 0.05 + t * 0.3);
          if (v < 0.46) continue;
          const fxp = ox + x + shift(oy + y);
          const fyp = oy + y;
          this.put(fxp, fyp, C.rim, 0.7, Math.min(0.55, (v - 0.46) * 3), SHAPE.dot);
          const hgt = Math.floor(Math.max(0, v - 0.47) * 24 + cell(x, Math.floor(t * 4)) * 1.4);
          const curl = Math.sin(t * 2.2 + x * 0.21);
          for (let j = 0; j < Math.min(hgt, 6); j++) {
            const dx = Math.round(((j * j) / 10) * (wind.dir.x * wind.scale * 0.7 + curl * 0.6));
            const c =
              C.flame[
                j === 0 ? 0 : Math.min(4, 1 + Math.floor(((j - 1) / Math.max(1, hgt - 1)) * 4))
              ];
            this.put(fxp + dx, fyp - 1 - j, c, j < 3 ? 1 : 0.75, j < hgt - 1 ? 1 : 0.7, SHAPE.dot);
          }
        }
    }
  }

  pack(wind: BitWind, f: BitsFrame): Float32Array {
    this.n = 0;
    this.attached(wind, f);
    const t = wind.clock;
    for (const p of this.bits) {
      const u = p.age / p.life;
      const fade = u > 0.75 ? 1 - (u - 0.75) / 0.25 : 1;
      if (p.k === 'apple') this.put(p.x, p.y, C.apple, 0, fade, SHAPE.apple);
      else if (p.k === 'puff')
        this.put(p.x, p.y, u > 0.5 ? C.snowDim : C.snow, 0.2, 0.75 * fade, SHAPE.puff);
      else if (p.k === 'flake') this.put(p.x, p.y, C.snow, 0.3, 0.85 * fade, SHAPE.dot);
      else if (p.k === 'mote')
        this.put(
          p.x,
          p.y,
          C.mote[Math.min(3, Math.floor(u * 4))],
          1,
          u > 0.6 ? 0.55 : 1,
          SHAPE.dot
        );
      else if (p.k === 'orb') {
        const pulse = 0.6 + 0.4 * Math.sin(t * 2 + p.ph);
        this.put(p.x, p.y, C.orb, 1, fade, SHAPE.plus, scaled(C.orbHalo, pulse));
      } else if (p.k === 'hmote')
        this.put(p.x, p.y, (u < 0.5 ? p.col : p.dim) ?? C.orb, 1, fade, SHAPE.dot);
      else if (p.k === 'wisp')
        this.put(p.x, p.y, C.wisp[Math.min(2, Math.floor(u * 3))], 1, fade, SHAPE.dot);
      else if (p.k === 'spore')
        this.put(p.x, p.y, C.spore[Math.min(2, Math.floor(u * 3))], 0.5, fade, SHAPE.dot);
      else if (p.k === 'bone') this.put(p.x, p.y, C.bone, 0, fade, SHAPE.dot);
      else this.put(p.x, p.y, C.dust, 0.2, 0.7 * fade, SHAPE.dot);
    }
    return this.out.subarray(0, this.n * BIT_FLOATS);
  }
}
