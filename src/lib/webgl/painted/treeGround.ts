import { hash, noise } from './tierNoise.js';
import type {
  PaintedTreeGround,
  TreeGroundKind,
  TreeGroundProp,
  TreeSoil,
  TreeStand
} from './treeGroundManifest.js';
import type { PaintedSprite } from './manifest.js';

export const BED = 0.5;
const RAG = 0.56;
const HARD_RAG = 0.72;
const RIM_STEP = 3;
const RIM_INSET = 0.02;
const PLACE_LEVEL = 0.3;
const SPACING = 8;
const SPACING_SQUASH = 1.6;
const ROUND = 0.583;
const SQUASH = 1.3;
const DEPTH = 0.62;
const DROP = 2;
const ELDER_SPREAD = 44;
const SPREAD = 22;
const DRESS_SALT = 211;
const PERIOD = 2048;
export const FOOT_X = 16;
export const FOOT_Y = 23;
const AGES = {
  young: { peak: 0.46, reach: 14 },
  mature: { peak: 1.2, reach: 30 },
  elder: { peak: 1.3, reach: 58 }
} as const;
const WARP = { wideF: 0.042, wideA: 22, fineF: 0.155, fineA: 7 };
const NONE: TreeSoil = { gain: 0 };

const cells = (f: number) => Math.max(1, Math.round(PERIOD * f));
const C17 = cells(0.17);
const C02 = cells(0.02);

function pfbm(x: number, y: number, q: number, s: number, o: number): number {
  let a = 0.5;
  let m = 1;
  let v = 0;
  let n = 0;
  for (let i = 0; i < o; i++) {
    const p = q * m;
    v += a * noise((x * p) / PERIOD, (y * p) / PERIOD, s + i * 17, p);
    n += a;
    a *= 0.5;
    m *= 2;
  }
  return v / n;
}

export const coverAt = (x: number, y: number): number =>
  pfbm(x, y, C02, 3, 3) * 0.72 + noise((x * C17) / PERIOD, (y * C17) / PERIOD, 5, C17) * 0.28;

export function warpAt(x: number, y: number, out: [number, number]): [number, number] {
  out[0] =
    x +
    (noise(x * WARP.wideF, y * WARP.wideF, 11) - 0.5) * WARP.wideA +
    (noise(x * WARP.fineF, y * WARP.fineF, 12) - 0.5) * WARP.fineA;
  out[1] =
    y +
    (noise(x * WARP.wideF, y * WARP.wideF, 14) - 0.5) * WARP.wideA +
    (noise(x * WARP.fineF, y * WARP.fineF, 15) - 0.5) * WARP.fineA;
  return out;
}

export interface PlacedTree {
  key: number;
  x: number;
  y: number;
  stand: TreeStand;
  fx: number;
  fy: number;
  reach: number;
  peak: number;
}

export interface Placed {
  sprite: PaintedSprite;
  dx: number;
  dy: number;
}

export interface Probe {
  level: number;
  tree: number;
  soil: TreeSoil;
}

export class TreeField {
  readonly str: Float32Array;
  readonly own: Int32Array;
  readonly trees = new Map<number, PlacedTree>();
  private readonly warped: [number, number] = [0, 0];

  constructor(
    readonly w: number,
    readonly h: number,
    readonly art: number,
    readonly look: PaintedTreeGround,
    private readonly soilAt: (tx: number, ty: number) => TreeSoil | undefined
  ) {
    this.str = new Float32Array(w * h);
    this.own = new Int32Array(w * h).fill(-1);
  }

  kind(t: PlacedTree): TreeGroundKind {
    return this.look.kinds[t.stand.kind];
  }

  plant(x: number, y: number, stand: TreeStand | undefined): boolean {
    const key = y * this.w + x;
    const was = this.trees.get(key);
    if (!stand) return this.trees.delete(key);
    if (
      was &&
      was.stand.kind === stand.kind &&
      was.stand.age === stand.age &&
      was.stand.season === stand.season &&
      was.stand.foot === stand.foot
    )
      return false;
    const age = AGES[stand.age];
    const gain = this.look.kinds[stand.kind]?.gain ?? 1;
    this.trees.set(key, {
      key,
      x,
      y,
      stand,
      fx: x * this.art + FOOT_X,
      fy: y * this.art + FOOT_Y,
      reach: (stand.foot + age.reach * gain) / ROUND,
      peak: age.peak
    });
    return true;
  }

  restamp(x0: number, y0: number, x1: number, y1: number): void {
    const { w, str, own, art } = this;
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        str[ty * w + tx] = 0;
        own[ty * w + tx] = -1;
      }
    const best = new Float32Array((x1 - x0 + 1) * (y1 - y0 + 1));
    for (const t of this.trees.values()) {
      const ax = Math.max(x0, Math.floor((t.fx - t.reach) / art));
      const bx = Math.min(x1, Math.floor((t.fx + t.reach) / art));
      const ay = Math.max(y0, Math.floor((t.fy - t.reach) / art));
      const by = Math.min(y1, Math.floor((t.fy + t.reach) / art));
      for (let ty = ay; ty <= by; ty++)
        for (let tx = ax; tx <= bx; tx++) {
          const d = Math.hypot((tx + 0.5) * art - t.fx, ((ty + 0.5) * art - t.fy) * SQUASH);
          const s = Math.min(1, t.peak * (1 - d / t.reach));
          if (s <= 0) continue;
          const i = ty * w + tx;
          str[i] = 1 - (1 - str[i]) * (1 - s);
          const b = (ty - y0) * (x1 - x0 + 1) + tx - x0;
          if (s > best[b]) {
            best[b] = s;
            own[i] = t.key;
          }
        }
    }
  }

  probe(ax: number, ay: number, out: Probe): Probe {
    const { w, h, art, str, own } = this;
    const [wx, wy] = warpAt(ax, ay, this.warped);
    const tx = Math.min(w - 1, Math.max(0, Math.floor(wx / art)));
    const ty = Math.min(h - 1, Math.max(0, Math.floor(wy / art)));
    out.soil = this.soilAt(tx, ty) ?? NONE;
    out.level = -1;
    out.tree = -1;
    if (!out.soil.gain || w < 2 || h < 2) return out;
    const gx = wx / art - 0.5;
    const gy = wy / art - 0.5;
    const x0 = Math.min(w - 2, Math.max(0, Math.floor(gx)));
    const y0 = Math.min(h - 2, Math.max(0, Math.floor(gy)));
    const fx = Math.min(1, Math.max(0, gx - x0));
    const fy = Math.min(1, Math.max(0, gy - y0));
    const i = y0 * w + x0;
    const a = str[i] * (1 - fx) * (1 - fy);
    const b = str[i + 1] * fx * (1 - fy);
    const d = str[i + w] * (1 - fx) * fy;
    const e = str[i + w + 1] * fx * fy;
    const s = a + b + d + e;
    if (s <= 0) return out;
    const top = Math.max(a, b, d, e);
    out.tree = own[top === a ? i : top === b ? i + 1 : top === d ? i + w : i + w + 1];
    const t = this.trees.get(out.tree);
    if (!t) return out;
    const rag = this.kind(t).hard ? RAG * HARD_RAG : RAG;
    out.level = s * out.soil.gain + (coverAt(ax, ay) - 0.5) * rag;
    return out;
  }

  dress(t: PlacedTree): Placed[] {
    if (t.stand.age === 'young') return [];
    const k = this.kind(t);
    const elder = t.stand.age === 'elder';
    const winter = t.stand.season === 'winter';
    let n = 0;
    const r = () => hash(t.key, ++n, DRESS_SALT);
    const out: Placed[] = [];
    const at: Probe = { level: -1, tree: -1, soil: NONE };
    const local = (px: number, py: number, sprite: PaintedSprite): Placed => ({
      sprite,
      dx: Math.round(px) - t.x * this.art,
      dy: Math.round(py) - t.y * this.art
    });
    const roots = k.roots[elder ? 'elder' : 'mature'];
    const snowed = winter && (k.winter === 'buried' || k.winter === 'ice');
    const rootSet = roots?.[snowed ? 'winter' : 'summer'];
    if (rootSet?.length)
      out.push(local(t.fx, t.fy - 1, rootSet[Math.floor(r() * rootSet.length)]));
    const placed: [number, number][] = [];
    const put = (sprites: readonly PaintedSprite[], thirsty: boolean, a: number, rad: number) => {
      const px = t.fx + Math.cos(a) * rad;
      const py = t.fy + Math.sin(a) * rad * DEPTH + DROP;
      this.probe(px, py, at);
      if (at.level < PLACE_LEVEL || at.tree !== t.key) return;
      if (at.soil.dry && thirsty) return;
      if (placed.some(([qx, qy]) => Math.hypot(qx - px, (qy - py) * SPACING_SQUASH) < SPACING))
        return;
      placed.push([px, py]);
      out.push(local(px, py, sprites[Math.floor(r() * sprites.length)]));
    };
    const rim = (a: number): number => {
      for (let rad = t.reach; rad > t.stand.foot; rad -= RIM_STEP) {
        this.probe(t.fx + Math.cos(a) * rad, t.fy + Math.sin(a) * rad * DEPTH + DROP, at);
        if (at.level >= BED + RIM_INSET && at.tree === t.key) return rad - 1 - r() * 5;
      }
      return -1;
    };
    const foot = t.stand.foot;
    for (const p of k.props[t.stand.season] as TreeGroundProp[]) {
      if (p.sprites.length === 0) continue;
      const count = elder ? p.elder : p.mature;
      for (let i = 0; i < count; i++) {
        let a = r() * Math.PI * 2;
        if (p.at === 'rim') {
          const rad = rim(a);
          if (rad > 0) put(p.sprites, p.thirsty, a, rad);
          continue;
        }
        if (Math.sin(a) < -0.3) a = -a;
        if (p.at === 'foot') put(p.sprites, p.thirsty, a, foot * (0.9 + r() * 0.3) + 3 + r() * 4);
        else
          put(
            p.sprites,
            p.thirsty,
            a,
            foot * (elder ? 0.9 : 1) + (p.r0 + r() * (p.r1 - p.r0)) * (elder ? ELDER_SPREAD : SPREAD)
          );
      }
    }
    const ring = k.ring;
    if (ring?.sprites.length) {
      const count = ring.n[elder ? 1 : 0];
      const rad = foot + ring.r[elder ? 1 : 0] * this.art;
      const gap = r() * count;
      for (let i = 0; i < count; i++) {
        if (Math.abs(i - gap) < 1.2 || r() < 0.12) continue;
        put(ring.sprites, true, (i / count) * Math.PI * 2 + (r() - 0.5) * 0.12, rad + (r() - 0.5) * 5);
      }
    }
    return out;
  }
}
