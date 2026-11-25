import { clamp, dith, noise } from '../noise';
import type { Rgb, Ramp } from '../palette';

export type Px = Rgb | null;

export const hex = (h: string): Rgb => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16)
];
export const R = (s: string): Ramp => s.trim().split(/\s+/).map(hex);
export const dark = (c: Rgb, k: number): Rgb => [
  c[0] * k,
  c[1] * k,
  Math.min(255, c[2] * (k + 0.1))
];
export const lit = (c: Rgb, k: number): Rgb => [
  Math.min(255, c[0] * k),
  Math.min(255, c[1] * k),
  Math.min(255, c[2] * k)
];

export function rp(ramp: Ramp, t: number, x: number, y: number, d = 0.7): Rgb {
  const n = ramp.length - 1;
  const i = Math.floor(clamp(t, 0, 1) * n + 0.5 + (dith(x, y) - 0.5) * d);
  return ramp[clamp(i, 0, n)];
}

export const P = {
  ink: hex('#0d0a10'),
  rock: R('#1c1b22 #2a2a33 #3b3c46 #4f515a #666970 #808388 #9c9e9f'),
  rockWarm: R('#2e2a28 #403a35 #554d45 #6b6257 #83796b #9c9282'),
  wood: R('#241a17 #35261e #4a3426 #624630 #7b5b3c #96744d'),
  bone: R('#3c382f #5a5448 #7c7564 #a09880 #c4bca0 #e0dac4'),
  ember: R('#3a120c #5e1c0e #8c2c10 #bc4a14 #e0781e #f6b23c'),
  frost: R('#16283a #1f3c52 #2c566c #427688 #6a9eaa #a8ccd0'),
  iron: R('#1a1c22 #2a2e36 #40464e #5c646c #7e888e #a6b0b2 #d0d8d6'),
  gold: R('#5a4010 #866214 #b4881c #dcb030 #f4d860'),
  red: R('#4a141a #701c22 #9a2a2a #c0443a #de6a52'),
  cloth: R('#5a5040 #7a6e58 #9c9074 #beb294 #dcd2b6 #efe8d2'),
  leather: R('#2e1c14 #46291a #603a22 #7c4f2e #98683e #b48556'),
  fire: R('#7a1c0e #c23a10 #f07818 #fcc23a #fff0a0'),
  mana: R('#12305a #1c5490 #2c84c4 #56b8e8 #a8e6fa #e8fcff'),
  furBrown: R('#1e1410 #32211a #4a3224 #644630 #80603f #9c7c52'),
  skinPale: R('#7a5444 #a67858 #cc9c78 #e8c09c #f6dcc0'),
  ooze: R('#1c3a16 #2c5a1c #44802a #68a83a #9cd058 #d0f090'),
  ice: R('#6f93ac #94b4c6 #bcd3dc #dde9ec'),
  wicker: R('#4a3a22 #66512c #846a38 #a28548 #bda05e'),
  copper: R('#4a2416 #70361c #985024 #c0702e #e09848 #f2c478'),
  purple: R('#24143a #3a2058 #56307c #7648a0 #9c6cc0')
};

export const STAR = R('#3a3410 #6c6418 #a49c2c #dcd654 #f8f6a0 #ffffe8');

export const RAMP = {
  oakDark: R('#110b08 #19110c #231810 #2e2015 #3a291a #493521 #5b442b'),
  beam: R('#1b120d #291b12 #3a2719 #4e3621 #64472b #7c5b38 #977448'),
  vellum: R('#6e5a3c #8c7650 #a89068 #c0a880 #d4c098 #e4d6b2 #f0e6c8'),
  leaf: R('#1c3020 #2a482a #3c6436 #558246 #76a05a #a2c47a'),
  blood: R('#3a0f12 #5e161a #8a2222 #b43a30 #d8604a #f09a7a'),
  vermilion: R('#4a1410 #741c14 #a02a18 #c8442a #e46e4a #f4a482'),
  inkwash: R('#1c130c #2c1e14 #3e2c1e #54402c #6e583e #8c7454')
};

const LV = (() => {
  const v = [-0.55, -0.6, 0.58];
  const l = Math.hypot(...v);
  return v.map((a) => a / l);
})();

export interface BallOpts {
  n?: number;
  ns?: number;
  seed?: number;
  d?: number;
  bias?: number;
  e?: number;
}

export class Spr {
  w: number;
  h: number;
  ax: number;
  ay: number;
  c: Px[];
  e: Uint8Array;
  z: Float32Array;
  tints?: Map<string, Spr>;

  constructor(w: number, h: number, ax?: number, ay?: number) {
    this.w = w;
    this.h = h;
    this.ax = ax === undefined ? w >> 1 : ax;
    this.ay = ay === undefined ? h - 1 : ay;
    this.c = new Array<Px>(w * h).fill(null);
    this.e = new Uint8Array(w * h);
    this.z = new Float32Array(w * h).fill(-1e9);
  }

  ok(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  set(x: number, y: number, c: Px, e?: number): void {
    x = Math.round(x);
    y = Math.round(y);
    if (!this.ok(x, y)) return;
    const i = y * this.w + x;
    this.c[i] = c;
    this.e[i] = e || 0;
  }

  rect(x: number, y: number, w: number, h: number, c: Rgb, e?: number): this {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, e);
    return this;
  }

  ball(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    zc: number,
    ramp: Ramp,
    o: BallOpts = {}
  ): this {
    const n = o.n || 0;
    const ns = o.ns || 0.5;
    const seed = o.seed || 0;
    const d = o.d === undefined ? 0.6 : o.d;
    const bias = o.bias || 0;
    const e = o.e || 0;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (!this.ok(x, y)) continue;
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        const q = nx * nx + ny * ny;
        if (q > 1) continue;
        const nz0 = Math.sqrt(1 - q);
        const z = zc + nz0 * Math.min(rx, ry);
        const i = y * this.w + x;
        if (z < this.z[i]) continue;
        this.z[i] = z;
        const l = nx * LV[0] + ny * LV[1] + nz0 * LV[2];
        let t = 0.5 + l * 0.52 + bias;
        if (n) t += (noise(x * ns, y * ns, seed) - 0.5) * n;
        this.c[i] = rp(ramp, t, x, y, d);
        this.e[i] = e;
      }
    return this;
  }

  outline(col: Rgb = P.ink): this {
    const { w, h, c } = this;
    const add: number[] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (c[y * w + x]) continue;
        if (
          (x > 0 && c[y * w + x - 1]) ||
          (x < w - 1 && c[y * w + x + 1]) ||
          (y > 0 && c[(y - 1) * w + x]) ||
          (y < h - 1 && c[(y + 1) * w + x])
        )
          add.push(y * w + x);
      }
    for (const i of add) c[i] = col;
    return this;
  }
}

export function copy(s: Spr): Spr {
  const c = new Spr(s.w, s.h, s.ax, s.ay);
  c.c = s.c.slice();
  c.e = s.e.slice();
  return c;
}

export function melt(s: Spr, amt: number): Spr {
  const c = copy(s);
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++) if (dith(x, y) < amt) c.c[y * s.w + x] = null;
  return c;
}
