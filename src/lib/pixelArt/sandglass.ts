import { paint, type Painter } from './canvas';
import { hash } from './noise';
import { INK, RAMPS, pick, tone, type Ramp, type Rgb } from './palette';
import { planks } from './timber';

const W = 44;
const H = 76;
const CX = 22;
const TOP = 9;
const BOT = 66;
const NECK = 37.5;

export const SANDGLASS = { w: W, h: H };

const MATERIALS = {
  timber: { wood: RAMPS.beam, metal: RAMPS.iron, sand: RAMPS.ochre },
  vellum: { wood: RAMPS.oakDark, metal: RAMPS.brass, sand: RAMPS.honey }
} satisfies Record<string, { wood: Ramp; metal: Ramp; sand: Ramp }>;

export type SandglassKind = keyof typeof MATERIALS;

const GLASS_RIM: Rgb = [214, 232, 238, 200];
const GLASS_SHINE: Rgb = [236, 246, 250, 150];
const GLASS_TINT: Rgb = [176, 206, 222, 46];

function bulb(y: number, yc: number): number {
  const d = (y - yc) / 14.2;
  return d * d >= 1 ? 0 : 12.4 * Math.pow(1 - Math.pow(Math.abs(d), 2.4), 1 / 2.4);
}

const HALF = Array.from({ length: H }, (_, row) => {
  const y = row + 0.5;
  if (y < TOP || y > BOT) return -1;
  return Math.max(Math.abs(y - NECK) < 2.6 ? 1.3 : 0, bulb(y, 23.2), bulb(y, 51.8));
});

const inside = (x: number, y: number) => y >= 0 && y < H && Math.abs(x + 0.5 - CX) <= HALF[y];
const rim = (x: number, y: number) =>
  inside(x, y) &&
  (Math.abs(x + 0.5 - CX) > HALF[y] - 1.1 || !inside(x, y - 1) || !inside(x, y + 1));

export function sandglassFrame(kind: SandglassKind): HTMLCanvasElement {
  const f = MATERIALS[kind];
  const wood = planks(W, H, { dir: 'h', ramp: f.wood, base: 0.5, seed: 11, lo: 3, hi: 4 });
  const cap = (x: number, y: number, y0: number): Rgb | null => {
    const r = y - y0;
    const inset = r === 0 ? 2 : r === 1 ? 1 : r === 6 ? 2 : 0;
    if (x < inset || x > W - 1 - inset) return null;
    if (r === 0 || r === 6 || x === inset || x === W - 1 - inset) return INK;
    if (r === 3 && (x === 5 || x === W - 6 || x === CX - 1)) return f.metal[f.metal.length - 2];
    const c = wood(x, y);
    return r === 1 ? tone(c, 1.25) : r === 5 ? tone(c, 0.72) : c;
  };
  const post = (x: number, y: number, px: number): Rgb | null => {
    const d = x - px;
    const wave =
      1.6 + 0.7 * Math.cos(((y - 23) / 14.3) * Math.PI) - (Math.abs(y - NECK) < 2 ? 0.5 : 0);
    const ring = y === 11 || y === 64 || y === 37;
    const reach = wave + (ring ? 0.9 : 0);
    if (Math.abs(d) > reach) return null;
    if (Math.abs(d) > reach - 0.6) return INK;
    if (ring) return f.metal[d < 0 ? f.metal.length - 2 : 3];
    return pick(f.wood, 0.55 - d * 0.16 + (hash(x, y >> 2, 3) - 0.5) * 0.08, x, y, 0.7);
  };
  return paint(W, H, (x, y) =>
    y <= 6 ? cap(x, y, 0) : y >= H - 7 ? cap(x, y, H - 7) : post(x, y, 4) || post(x, y, W - 5)
  );
}

function sand(kind: SandglassKind, f: number, tick: number): Painter {
  const S = MATERIALS[kind].sand;
  const ltop = TOP + 2.5 + (NECK - TOP - 2.5) * Math.pow(f, 0.82);
  const hb = f <= 0 ? 0 : 4 + f * 16;
  const base = f * 8;
  const flowing = f > 0 && f < 1;
  const pileTop = BOT + 1 - Math.max(base, hb);
  return (x, y) => {
    if (!inside(x, y)) return null;
    const dx = Math.abs(x + 0.5 - CX);
    const shade = 0.62 - (x + 0.5 - CX) * 0.022 + (hash(x, y, 21) - 0.5) * 0.14;
    if (y < NECK + 1) {
      const dip = flowing ? Math.max(0, 3.2 - dx * 0.7) * Math.min(1, f * 8) : 0;
      if (y >= ltop + dip && ltop < NECK)
        return pick(S, shade + (y < ltop + dip + 1 ? 0.18 : 0), x, y, 0.8);
    } else {
      const surf = Math.max(base, hb - dx * 0.62);
      if (y >= BOT + 1 - surf) return pick(S, shade + (y < BOT + 2 - surf ? 0.16 : 0), x, y, 0.8);
    }
    if (flowing && dx < 1 && y > NECK - 1 && y < pileTop && hash(x, y - tick * 3, 7) > 0.3)
      return S[S.length - 2 - (hash(x, y + tick, 2) > 0.7 ? 1 : 0)];
    if (flowing && y > pileTop - 3 && y < pileTop && dx < 3 && hash(x, y + tick * 5, 9) > 0.82)
      return S[S.length - 1];
    return null;
  };
}

export function sandglassGlass(kind: SandglassKind, f: number, tick: number): HTMLCanvasElement {
  const grain = sand(kind, f, tick);
  return paint(W, H, (x, y) => {
    if (!inside(x, y)) return null;
    const g = grain(x, y);
    if (rim(x, y)) return GLASS_RIM;
    const d = x + 0.5 - CX;
    const streak = y < NECK - 4 || (y > NECK + 4 && y < BOT - 6);
    if (Math.abs(d + HALF[y] * 0.55) < 0.6 && streak) return g ? tone(g, 1.3) : GLASS_SHINE;
    return g || GLASS_TINT;
  });
}
