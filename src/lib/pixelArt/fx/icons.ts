import type { Ramp, Rgb } from '../palette';
import { GORE, HONEY, HURT, tint, word, type Pair } from './glyphs';
import { P, STAR, Spr, hex, melt } from './spr';

export type IconId =
  | 'collapsed'
  | 'winded'
  | 'knocked'
  | 'bleeding'
  | 'fractured'
  | 'poisoned'
  | 'sick'
  | 'burning'
  | 'frozen'
  | 'starving'
  | 'exhausted'
  | 'moodbreak'
  | 'wellfed'
  | 'rested'
  | 'healed';

interface Lit {
  c: Rgb;
  e: number;
}
type Pal = Record<string, Rgb | Lit>;

const keys = (r: Ramp, chars: string): Pal =>
  Object.fromEntries([...chars].map((ch, i) => [ch, r[i]]));
const lit = (c: Rgb, e: number): Lit => ({ c, e });
const isLit = (p: Rgb | Lit): p is Lit => 'c' in p;

function art(rows: string[], pal: Pal, e: number): Spr {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const s = new Spr(w + 2, h + 2, (w >> 1) + 1, h + 1);
  rows.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      const p = pal[ch];
      if (p) s.set(x + 1, y + 1, isLit(p) ? p.c : p, isLit(p) ? p.e : e);
    })
  );
  return s.outline();
}

function stamp(dst: Spr, src: Spr, ox: number, oy: number): Spr {
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const i = y * src.w + x;
      const c = src.c[i];
      if (c) dst.set(x + ox, y + oy, c, src.e[i]);
    }
  return dst;
}

function boon(s: Spr): Spr {
  const o = new Spr(s.w + 3, s.h + 2, s.ax, s.ay + 2);
  const x = s.w;
  const G = lit(HONEY[5], 255);
  const g = lit(HONEY[3], 255);
  stamp(o, s, 0, 2);
  for (const [dx, dy, c] of [
    [1, 0, G],
    [0, 1, G],
    [1, 1, G],
    [2, 1, g],
    [1, 2, g]
  ] as const)
    o.set(x - 1 + dx, dy + 1, c.c, c.e);
  return o.outline();
}

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

const ICONS: Record<IconId, () => Spr> = {
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
  starving: () =>
    art(
      [
        '..444444444..',
        '.45555555554.',
        '4500000000054',
        '4510000000154',
        '.45111111154.',
        '.34455555443.',
        '..344444433..',
        '...3333332...',
        '....22222....',
        '....33322....'
      ],
      keys([...P.wicker, hex('#d8bc80')], '012345'),
      150
    ),
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
  moodbreak: () =>
    art(
      [
        '....4555.....',
        '..455555544..',
        '.45555445554.',
        '4555444444443',
        '4444433334433',
        '.3333333y3332',
        '..2222yy2222.',
        '.....yy......',
        '....yyyy.....',
        '......yy.....',
        '.....yy......',
        '....y........'
      ],
      { ...keys([...P.purple, hex('#c4a0e0')], '012345'), y: lit(STAR[4], 255) },
      170
    ),
  wellfed: () =>
    boon(
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
      )
    ),
  rested: () =>
    boon(
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
    ),
  healed: () =>
    boon(
      art(
        [
          '.344...443.',
          '34554.45543',
          '35555w54443',
          '35555w44443',
          '355wwwww433',
          '.3555w4443.',
          '.3554w4433.',
          '..3544433..',
          '...34433...',
          '....333....',
          '.....3.....'
        ],
        { ...keys(HURT, '012345'), w: lit(hex('#fff6e0'), 255) },
        190
      )
    )
};

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

export function worded(id: IconId, label: string, col: string): Pair {
  const key = `${id}|${label}|${col}`;
  let p = memo.get(key);
  if (!p) {
    const a = icon(id)[0];
    const b = word(label, tint(col), { small: true })[0];
    const h = Math.max(a.h, b.h);
    const s = new Spr(a.w + 2 + b.w, h, a.w >> 1, h - 1);
    stamp(s, a, 0, h - a.h);
    stamp(s, b, a.w + 2, h - b.h - Math.max(0, (a.h - b.h) >> 1));
    p = pair(s);
    memo.set(key, p);
  }
  return p;
}
