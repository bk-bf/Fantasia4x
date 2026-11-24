import type { Rgb } from '../palette';
import { GORE, HONEY, tint, word, type Pair } from './glyphs';
import { P, Spr, copy, hex, melt } from './spr';
import { hash } from '../noise';
import { paint } from '../canvas';
import { toArt, type Art } from '../picture';
import { art, keys, lit, stamp } from './iconArt';
import { AILMENTS } from './conditionArt/ailments';
import { FACES } from './conditionArt/faces';
import { FARE } from './conditionArt/fare';
import { GEMS } from './conditionArt/gems';
import { TRAITS } from './conditionArt/traits';
import { MOTIFS, type MotifId } from './motifs';

type MockIconId =
  | 'collapsed'
  | 'winded'
  | 'knocked'
  | 'bleeding'
  | 'fractured'
  | 'poisoned'
  | 'sick'
  | 'burning'
  | 'frozen'
  | 'exhausted'
  | 'wellfed'
  | 'rested';

function flake(): Spr {
  const s = new Spr(15, 15, 7, 14);
  const M = P.mana;
  const c = 7;
  const px = (x: number, y: number, k: number) => s.set(c + x, c + y, M[k], 230);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ]) {
    for (let d = 1; d <= 6; d++) px(dx * d, dy * d, d === 6 ? 5 : dx + dy > 0 ? 3 : 4);
    for (const sd of [-1, 1]) {
      px(dx * 5 + dy * sd, dy * 5 + dx * sd, dx + dy > 0 ? 3 : 5);
      px(dx * 3 + dy * sd, dy * 3 + dx * sd, 4);
    }
  }
  for (const [dx, dy] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1]
  ])
    for (let d = 1; d <= 2; d++) px(dx * d, dy * d, dy > 0 ? 3 : 4);
  px(0, 0, 5);
  return s.outline(P.frost[0]);
}

const EMBER = tint('#e0452c');
const VIOLET = tint('#a98ae0');
const SLAM = tint('#ff6a3a');
const SALLOW = tint('#b4c060');
const DUSK = tint('#a8a8cc');

const MOCK_ICONS: Record<MockIconId, () => Spr> = {
  collapsed: () =>
    art(
      [
        '..y.....y....',
        '.yzy...yzy...',
        '..y.....y....',
        '.............',
        '.........hhh.',
        '..34444.hssss',
        '1344444khsksr',
        '11344444kssrr',
        '2222222222222'
      ],
      {
        ...keys(EMBER, '012345'),
        y: lit(HONEY[4], 255),
        z: lit(HONEY[5], 255),
        k: P.ink,
        h: P.furBrown[2],
        s: P.skinPale[3],
        r: P.skinPale[2]
      },
      190
    ),
  winded: () =>
    art(
      [
        '......5......',
        '......5......',
        '..44.454.44..',
        '.45544.44554.',
        '.45554.45554.',
        '455554.455543',
        '455543.345543',
        '455543.345543',
        '345433.334433',
        '.3433...3343.',
        '..33.....33..'
      ],
      keys(VIOLET, '012345'),
      190
    ),
  knocked: () =>
    art(
      [
        '....45554....',
        '....45543....',
        '....45543....',
        '....45543....',
        '.444455434443',
        '..455555433..',
        '...4555433...',
        '....45543....',
        '5....443....5',
        '.5....3....5.',
        '3333333333333',
        '.22222222222.'
      ],
      keys(SLAM, '012345'),
      200
    ),
  bleeding: () =>
    art(
      [
        '....3....',
        '....3....',
        '...343...',
        '...353...',
        '..34532..',
        '..35432..',
        '.3454322.',
        '.3543322.',
        '345433221',
        '344333221',
        '.3333221.',
        '..32221..'
      ],
      keys(GORE, '012345'),
      190
    ),
  fractured: () =>
    art(
      [
        '.........55..',
        '........5555.',
        '........55455',
        '.......455554',
        '......4554.4.',
        '....a..54....',
        '......b......',
        '....45..a....',
        '.4.4554......',
        '455554.......',
        '55455........',
        '.5554........',
        '..44.........'
      ],
      { ...keys(P.bone, '012345'), a: lit(hex('#ff9944'), 255), b: lit(hex('#ffd870'), 255) },
      170
    ),
  poisoned: () =>
    art(
      [
        '......5....',
        '...4.......',
        '.....4.5...',
        '...ssrr....',
        '....sr.....',
        '...s45r....',
        '..s4554r...',
        '.s345543q..',
        '.s334443q..',
        '.r233332p..',
        '..r2222p...',
        '...qppp....'
      ],
      { ...keys(P.ooze, '012345'), ...keys(P.ice, 'pqrs') },
      190
    ),
  sick: () =>
    art(
      [
        '...44444..b',
        '..4555544.b',
        '.455555544.',
        '.455555543.',
        '45kk55kk443',
        '45c55555c43',
        '4555kk55433',
        '.45k55kk43.',
        '.344555433.',
        '..3344433..',
        '...33333...'
      ],
      { ...keys(SALLOW, '012345'), k: P.ooze[0], c: P.ooze[3], b: lit(P.mana[4], 220) },
      180
    ),
  burning: () =>
    art(
      [
        '.....1.....',
        '.....11....',
        '....121....',
        '....1221.1.',
        '...12321.1.',
        '..123321121',
        '..123332121',
        '.1233432221',
        '.1234433221',
        '12344443321',
        '12344444321',
        '.123444321.',
        '..1223221..'
      ],
      keys(P.fire, '01234'),
      255
    ),
  frozen: flake,
  exhausted: () =>
    art(
      [
        '....4555...',
        '..45554....',
        '.45554.zzzz',
        '.4554.....z',
        '45554...zz.',
        '45554..z...',
        '45554..zzzz',
        '455543.....',
        '.455543...3',
        '.4555544434',
        '..34555543.',
        '....3444...'
      ],
      { ...keys(DUSK, '012345'), z: lit(hex('#b4d4ea'), 220) },
      180
    ),
  wellfed: () =>
    art(
      [
        '...3444......',
        '..345554.....',
        '.34555543....',
        '.345555432...',
        '.345555432...',
        '.334554322...',
        '..33443221...',
        '...3332215...',
        '....22215b...',
        '.......5b5b..',
        '........b55b.',
        '.......5b.b5.'
      ],
      { ...keys(P.copper, '012345'), b: P.bone[4] },
      170
    ),
  rested: () =>
    art(
      [
        '......5......',
        '..5...5...5..',
        '...5.....5...',
        '....44444....',
        '5..4555554..5',
        '.5.4555554.5.',
        '..455555554..',
        '3333333333333',
        '.22222222222.'
      ],
      keys(HONEY, '012345'),
      230
    )
};

const CONDITION_ART = { ...AILMENTS, ...FACES, ...FARE, ...GEMS, ...TRAITS };

export type IconId = MockIconId | MotifId | keyof typeof CONDITION_ART;

const ICONS: Record<IconId, () => Spr> = { ...MOCK_ICONS, ...MOTIFS, ...CONDITION_ART };

export const ICON_IDS = Object.keys(ICONS) as IconId[];

const memo = new Map<string, Pair>();
const pair = (s: Spr): Pair => [s, melt(s, 0.5)];

export function icon(id: IconId): Pair {
  let p = memo.get(id);
  if (!p) {
    p = pair(ICONS[id]());
    memo.set(id, p);
  }
  return p;
}

export type Trend = -1 | 0 | 1 | 2 | 3;

const UP = ['..5..', '.454.', '45554', '.454.', '.343.', '.343.'];
const ARROW_STEP = 6;
const arrow = (rows: string[], col: string) => art(rows, keys(tint(col), '012345'), 230);
const RISE = () => arrow(UP, '#ff5a3a');
const EASE = () => arrow([...UP].reverse(), '#7cc060');
const arrowMemo = new Map<Trend, Spr>();

export function arrows(t: Trend): Spr | null {
  if (t === 0) return null;
  let s = arrowMemo.get(t);
  if (!s) {
    const one = t < 0 ? EASE() : RISE();
    const n = Math.max(1, t);
    s = new Spr(one.w + (n - 1) * ARROW_STEP, one.h, 0, one.h - 1);
    for (let i = 0; i < n; i++) stamp(s, one, i * ARROW_STEP, 0);
    arrowMemo.set(t, s);
  }
  return s;
}

export interface Strike {
  x: number;
  y: number;
  w: number;
}

const strikes = new WeakMap<Spr, Strike>();

export const strikeOf = (s: Spr): Strike => strikes.get(s) ?? { x: 1, y: s.h >> 1, w: s.w - 2 };

function row(parts: [Spr, number][], lead: Spr, struck: Spr): Spr {
  const h = Math.max(...parts.map(([p]) => p.h));
  const w = parts.reduce((n, [p, gap]) => n + gap + p.w, 0);
  let x = 0;
  let ax = 0;
  let ay = 0;
  let line: Strike = { x: 1, y: h >> 1, w: w - 2 };
  const s = new Spr(w, h, 0, 0);
  for (const [p, gap] of parts) {
    x += gap;
    const y = (h - p.h + 1) >> 1;
    stamp(s, p, x, y);
    if (p === lead) [ax, ay] = [x + p.ax, y + p.ay];
    if (p === struck) line = { x: 1, y: y + (p.h >> 1) + 1, w: w - 2 };
    x += p.w;
  }
  s.ax = ax;
  s.ay = ay;
  strikes.set(s, line);
  return s;
}

const FADE_GREY = 0.65;
const FADE_DIM = 0.85;

function faded(s: Spr): Spr {
  const o = new Spr(s.w, s.h, s.ax, s.ay);
  for (let i = 0; i < s.c.length; i++) {
    const c = s.c[i];
    if (!c) continue;
    const g = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
    const v = c.map((k) => Math.round((k + (g - k) * FADE_GREY) * FADE_DIM)) as Rgb;
    o.set(i % s.w, Math.floor(i / s.w), v, s.e[i]);
  }
  strikes.set(o, strikeOf(s));
  return o;
}

export function floater(
  id: IconId | null,
  label: string | null,
  col: string,
  trend: Trend = 0,
  struck = false
): Pair {
  const key = `${id ?? ''}|${label ?? ''}|${col}|${trend}|${struck}`;
  let p = memo.get(key);
  if (p) return p;
  const look = id ? icon(id) : null;
  const text = label ? word(label, tint(col), { small: true }) : null;
  const up = arrows(trend);
  if (!up && !(look && text)) p = (look ?? text)!;
  else {
    const parts: [Spr, number][] = look
      ? [
          [look[0], 0],
          ...(up ? [[up, 1] as [Spr, number]] : []),
          ...(text ? [[text[0], 2] as [Spr, number]] : [])
        ]
      : [
          [text![0], 0],
          [up!, 2]
        ];
    const lead = (look ?? text)![0];
    p = pair(row(parts, lead, (text ?? look)![0]));
  }
  if (struck) p = pair(faded(p[0]));
  memo.set(key, p);
  return p;
}

export const worded = (id: IconId, label: string, col: string): Pair => floater(id, label, col);

const dressed = new WeakMap<Spr, Map<IconId, Pair>>();

export function withIcon(id: IconId, text: Pair | null): Pair {
  if (!text) return icon(id);
  let byId = dressed.get(text[0]);
  if (!byId) {
    byId = new Map();
    dressed.set(text[0], byId);
  }
  let p = byId.get(id);
  if (!p) {
    p = pair(
      row(
        [
          [icon(id)[0], 0],
          [text[0], 2]
        ],
        text[0],
        text[0]
      )
    );
    byId.set(id, p);
  }
  return p;
}

export const STRIKE_LIGHT = hex('#f4ecd8');
export const CRUMBLE_FRAMES = 6;
const CRUMBLE_FALL = 6;
const crumbles = new WeakMap<Spr, Spr[]>();

function struckThrough(s: Spr): Spr {
  const o = copy(s);
  const line = strikeOf(s);
  for (let x = line.x - 1; x <= line.x + line.w; x++) {
    o.set(x, line.y, P.ink, 255);
    o.set(x, line.y + 1, P.ink, 255);
  }
  for (let x = line.x; x < line.x + line.w; x++) o.set(x, line.y, STRIKE_LIGHT, 255);
  return o;
}

export function crumbled(s: Spr): Spr[] {
  let frames = crumbles.get(s);
  if (frames) return frames;
  const base = struckThrough(s);
  frames = [];
  for (let k = 1; k <= CRUMBLE_FRAMES; k++) {
    const t = k / CRUMBLE_FRAMES;
    const o = new Spr(s.w, s.h + CRUMBLE_FALL, s.ax, s.ay);
    for (let y = 0; y < s.h; y++)
      for (let x = 0; x < s.w; x++) {
        const i = y * s.w + x;
        const c = base.c[i];
        if (!c || hash(x, y, 7) < t * 1.1 - 0.1) continue;
        const fall = Math.floor(t * t * CRUMBLE_FALL * (0.4 + hash(x, y, 11)));
        o.set(x, y + fall, c, base.e[i]);
      }
    frames.push(o);
  }
  crumbles.set(s, frames);
  return frames;
}

const pictures = new Map<string, Art>();

export function iconArt(id: IconId, grade: Trend = 0): Art {
  const key = `${id}+${grade}`;
  let art = pictures.get(key);
  if (!art) {
    const s = floater(id, null, '', grade)[0];
    art = toArt(paint(s.w, s.h, (x, y) => s.c[y * s.w + x]));
    pictures.set(key, art);
  }
  return art;
}
