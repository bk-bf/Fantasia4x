import { paint } from './canvas';
import { badge, type GlyphName } from './glyphs';
import { inset, ironButton } from './iron';
import { meter } from './meter';
import { fbm, hash } from './noise';
import { INK, RAMPS, pick, tone, type Ramp, type RampName, type Rgb } from './palette';
import { planks, timber } from './timber';
import { candleMask, vellumPage, type PageOptions } from './vellum';

export type ChromeKind =
  | 'rail'
  | 'win'
  | 'winbar'
  | 'btn'
  | 'btnOn'
  | 'btnOff'
  | 'verb'
  | 'card'
  | 'tip'
  | 'tag'
  | 'well'
  | 'cell'
  | 'cellOn';

export type BadgeKind = 'warn' | 'cold' | 'good' | 'trait' | 'neg';

export interface Painted {
  base: HTMLCanvasElement;
  lit?: HTMLCanvasElement;
}

type Paint = (w: number, h: number) => Painted | null;

export interface Skin {
  chrome: Record<ChromeKind, Paint>;
  glyphRamp: Ramp;
  glyphLine: Rgb | null;
  bar: (w: number, h: number, frac: number, ramp: RampName) => HTMLCanvasElement;
  badge: (g: GlyphName, k: BadgeKind) => HTMLCanvasElement;
}

const INKWASH = RAMPS.inkwash;
const KIND: Record<BadgeKind, RampName> = {
  warn: 'ember',
  cold: 'water',
  good: 'leaf',
  trait: 'honey',
  neg: 'blood'
};
const PIGMENT: Partial<Record<RampName, Ramp>> = {
  leaf: RAMPS.verdigris,
  honey: RAMPS.ochre,
  ember: RAMPS.vermilion,
  water: RAMPS.lapis,
  blood: RAMPS.vermilion,
  violet: RAMPS.violet
};

const only = (base: HTMLCanvasElement): Painted => ({ base });

function timberRail(w: number, h: number): HTMLCanvasElement {
  const f = planks(w, h, { dir: 'h', base: 0.46, seed: 6, lo: h, hi: h });
  return paint(w, h, (x, y) => {
    if (y === h - 1) return INK;
    if (y === h - 2) return RAMPS.oakDark[0];
    if (y === 0) return RAMPS.beam[4];
    if (x % 192 === 96 && (y === 5 || y === h - 7)) return RAMPS.iron[6];
    return f(x, y);
  });
}

function timberWinbar(w: number, h: number): HTMLCanvasElement {
  const f = planks(w, h, { dir: 'h', base: 0.2, seed: 12, lo: h, hi: h });
  return paint(w, h, (x, y) => {
    if (y === h - 1) return INK;
    if (y === h - 2) return RAMPS.iron[hash(x, 2, 3) > 0.8 ? 4 : 3];
    if (y === h - 3) return RAMPS.iron[1];
    if (x % 96 === 10 && y === (h >> 1) - 2) return RAMPS.iron[6];
    return tone(f(x, y), 0.86);
  });
}

const page =
  (o: PageOptions & { rim: number }): Paint =>
  (w, h) => {
    const base = vellumPage(w, h, o);
    return { base, lit: candleMask(base, o.rim) };
  };

function box(
  w: number,
  h: number,
  seed: number,
  fill: ((x: number, y: number, d: number, t: number) => Rgb | null) | null
): HTMLCanvasElement {
  return paint(w, h, (x, y) => {
    const l = x;
    const r = w - 1 - x;
    const t = y;
    const b = h - 1 - y;
    const d = Math.min(l, r, t, b);
    if (Math.min(l, r) + Math.min(t, b) === 0) return null;
    if (d === 0) return hash(x, y, seed) > 0.05 ? INKWASH[1] : INKWASH[3];
    return fill ? fill(x, y, d, t) : null;
  });
}

const vermilionWash = (x: number, y: number, k: number, spread: number) =>
  pick(RAMPS.vermilion, k + (fbm(x * 0.2, y * 0.3, 4, 2) - 0.5) * spread, x, y, 0.9);

const timberSkin: Skin = {
  glyphRamp: RAMPS.iron,
  glyphLine: INK,
  bar: (w, h, v, ramp) => meter(w, h, v, RAMPS[ramp], { ticks: w > 70 }),
  badge: (g, k) => badge(g, RAMPS[KIND[k]]),
  chrome: {
    rail: (w, h) => only(timberRail(w, h)),
    win: (w, h) =>
      only(timber(w, h, { dir: 'v', beam: 4, strap: 11, seed: 8, base: 0.38, lo: 24, hi: 34 })),
    winbar: (w, h) => only(timberWinbar(w, h)),
    btn: (w, h) => only(ironButton(w, h, { rivets: w >= 70 })),
    btnOn: (w, h) => only(ironButton(w, h, { rivets: w >= 70, down: true })),
    btnOff: (w, h) => only(inset(w, h)),
    verb: (w, h) => only(ironButton(w, h, { rivets: true, down: true })),
    card: (w, h) => only(timber(w, h, { dir: 'h', beam: 4, strap: 10, seed: 5, base: 0.4 })),
    tip: (w, h) => only(timber(w, h, { dir: 'h', beam: 3, strap: 9, seed: 9, base: 0.3 })),
    tag: (w, h) => only(timber(w, h, { dir: 'h', beam: 3, strap: 9, seed: 3, base: 0.34 })),
    well: (w, h) => only(inset(w, h)),
    cell: () => null,
    cellOn: (w, h) => only(ironButton(w, h, { down: true }))
  }
};

const vellumSkin: Skin = {
  glyphRamp: INKWASH.slice(0, 4),
  glyphLine: null,
  bar: (w, h, v, ramp) =>
    meter(w, h, v, PIGMENT[ramp] ?? RAMPS.verdigris, {
      empty: [226, 212, 176],
      line: INKWASH[1],
      ticks: w > 70,
      tickCol: INKWASH[3]
    }),
  badge: (g, k) =>
    badge(g, k === 'trait' ? RAMPS.violet : (PIGMENT[KIND[k]] ?? RAMPS.ochre), {
      line: INKWASH[1],
      fg: RAMPS.vellum[6],
      fill: 0.5
    }),
  chrome: {
    rail: page({ rag: 0.7, seed: 5, base: 0.84, rim: 3 }),
    win: page({ rule: 5, seed: 9, rim: 14 }),
    winbar: (w, h) =>
      only(
        paint(w, h, (x, y) =>
          y === h - 1 && hash(x, 1, 5) > 0.03
            ? INKWASH[1]
            : y === h - 3 && hash(x >> 1, 2, 6) > 0.06
              ? RAMPS.vermilion[2]
              : null
        )
      ),
    btn: (w, h) =>
      only(
        box(w, h, 3, (x, y, d) =>
          d === 2 ? INKWASH[4] : pick(RAMPS.vellum, 0.96 + (hash(x, y, 3) - 0.5) * 0.1, x, y, 0.7)
        )
      ),
    btnOn: (w, h) => only(box(w, h, 7, (x, y) => vermilionWash(x, y, 0.46, 0.4))),
    btnOff: (w, h) =>
      only(
        paint(w, h, (x, y) =>
          Math.min(x, y, w - 1 - x, h - 1 - y) === 0 && ((x + y) >> 1) % 2 === 0 ? INKWASH[3] : null
        )
      ),
    verb: (w, h) =>
      only(box(w, h, 5, (x, y, d) => (d === 2 ? RAMPS.gold[3] : vermilionWash(x, y, 0.5, 0.3)))),
    card: page({ rule: 5, seed: 14, rim: 14 }),
    tip: page({ rule: 4, seed: 30, rag: 1.2, rim: 10 }),
    tag: page({ rag: 1.1, seed: 5, base: 0.82, rim: 5 }),
    well: (w, h) =>
      only(
        box(w, h, w + h, (x, _y, _d, t) =>
          t === 2 && hash(x >> 1, 3, w) > 0.08 ? RAMPS.vermilion[2] : null
        )
      ),
    cell: () => null,
    cellOn: (w, h) => only(box(w, h, 7, (x, y) => vermilionWash(x, y, 0.46, 0.4)))
  }
};

export const SKINS: Record<'timber' | 'vellum', Skin> = {
  timber: timberSkin,
  vellum: vellumSkin
};
