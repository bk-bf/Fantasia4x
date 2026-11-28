import { clamp } from '../noise';
import type { Ramp, Rgb } from '../palette';
import { FX_FONT, type Font } from './font';
import { R, Spr, dark, hex, lit, melt } from './spr';

const MEMO_LIMIT = 3000;
const memo = new Map<string, unknown>();
export function keep<T>(k: string, make: () => T): T {
  let v = memo.get(k) as T | undefined;
  if (v === undefined) {
    if (memo.size >= MEMO_LIMIT) memo.clear();
    v = make();
    memo.set(k, v);
  }
  return v;
}

export const STAR_R = R('#5a1a0c #8c2c10 #c8442a #f07818 #fcc23a #fff0a0');
export const CROSS_R = R('#4a1410 #741c14 #a02a18 #d04a30 #f08060 #ffc0a0');
export const SLEEP_R = R('#1c2a44 #2c4466 #46688c #7ea4c4 #b4d4ea #e6f4fa');
export const HURT = R('#4a1410 #7c1c16 #b02c20 #e0503a #ff8a70 #ffc8b0');
export const CRIT = R('#5a1a0c #a02a18 #e0541e #f6a23c #ffd870 #fff6c0');
export const DULL = R('#2c2b2e #56544e #8a8678 #b8b2a0 #d8d2bc #f0ead8');
export const COLD = R('#12264a #1c3c6c #3c6ea4 #6ea6d8 #a4d4f2 #e0f2fc');
export const GORE = R('#2c0a0c #5e1216 #8e1c1c #c02c26 #e85040 #ff9478');
export const HONEY = R('#4a3408 #76540e #b0841a #e0b030 #f8d860 #fff2a8');
export const tint = (h: string): Ramp => {
  const c = hex(h);
  return [dark(c, 0.34), dark(c, 0.5), dark(c, 0.72), c, lit(c, 1.22), lit(c, 1.5)];
};

export type Pair = [Spr, Spr];

interface ShadeOpts {
  e?: number;
  grad?: boolean;
  line?: Rgb | null;
}

export function shade(rows: string[], ramp: Ramp, o: ShadeOpts = {}): Spr {
  const h = rows.length;
  const w = rows[0].length;
  const s = new Spr(w + 2, h + 2, (w >> 1) + 1, h + 1);
  const n = ramp.length - 1;
  const e = o.e === undefined ? 150 : o.e;
  const on = (x: number, y: number) => y >= 0 && y < h && x >= 0 && x < w && rows[y][x] === '#';
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!on(x, y)) continue;
      const hi = !on(x, y - 1) || !on(x - 1, y);
      const lo = !on(x, y + 1) || !on(x + 1, y);
      const k = o.grad
        ? n - Math.floor((y * 3) / h)
        : n - 1 + (hi && !lo ? 1 : 0) - (lo && !hi ? 2 : 0);
      s.set(x + 1, y + 1, ramp[clamp(k, 0, n)], e);
    }
  return o.line === null ? s : s.outline(o.line);
}

const glyph = (font: Font, ch: string, tall?: boolean): string[] => {
  const g = font[ch] || font[ch.toUpperCase()] || font['?'];
  if (!tall) return g;
  const d = /[a-z]/.test(ch) ? [1, 3] : [1, 4];
  return g.flatMap((r, i) => (d.includes(i) ? [r, r] : [r]));
};
const zoom = (g: string[], k: number): string[] =>
  k > 1 ? g.flatMap((r) => Array<string>(k).fill([...r].map((c) => c.repeat(k)).join(''))) : g;

export function typeset(
  text: string,
  font: Font,
  o: { gap: number; tall?: boolean; k?: number }
): string[] {
  const gs = [...text].map((ch) => zoom(glyph(font, ch, o.tall), o.k || 1));
  return Array.from({ length: gs[0].length }, (_, y) =>
    gs.map((g) => g[y]).join('.'.repeat(o.gap))
  );
}

export const unknownGlyphs = (text: string, small: boolean): string[] => {
  const font = small ? FX_FONT.thin : FX_FONT.bold;
  return [...new Set([...text].filter((ch) => !font[ch] && !font[ch.toUpperCase()]))];
};

export const advance = (text: string, font: Font, gap: number): number =>
  [...text].reduce((n, ch) => n + (font[ch] || font['?'])[0].length + gap, -gap);

const trim = (rows: string[]): string[] => {
  const used = rows.map((r) => r.includes('#'));
  const y0 = used.indexOf(true);
  const y1 = used.lastIndexOf(true);
  if (y0 < 0) return ['.'];
  let x0 = rows[0].length;
  let x1 = 0;
  for (const r of rows) {
    const a = r.indexOf('#');
    if (a >= 0) {
      x0 = Math.min(x0, a);
      x1 = Math.max(x1, r.lastIndexOf('#'));
    }
  }
  return rows.slice(y0, y1 + 1).map((r) => r.slice(x0, x1 + 1));
};

export interface WordOpts {
  big?: boolean;
  small?: boolean;
  e?: number;
}

export function word(text: string, ramp: Ramp, o: WordOpts = {}): Pair {
  return keep(`w${text}${ramp[3]}${JSON.stringify(o)}`, () => {
    const rows = trim(
      o.big
        ? typeset(text, FX_FONT.bold, { gap: 3, k: 2 })
        : typeset(text, o.small ? FX_FONT.thin : FX_FONT.bold, { gap: 2, tall: true })
    );
    const s = shade(rows, ramp, { e: o.e === undefined ? 170 : o.e, grad: o.small });
    return [s, melt(s, 0.5)] as Pair;
  });
}

const glyphs = (list: string[][], ramp: Ramp, o: ShadeOpts) => list.map((r) => shade(r, ramp, o));

export const zed = (): Spr[] =>
  keep('zed', () => {
    const z = glyphs(
      [
        ['#####', '...#.', '..#..', '.#...', '#####'],
        ['#######', '#######', '....##.', '...##..', '..##...', '#######', '#######'],
        [
          '#########',
          '#########',
          '......###',
          '.....###.',
          '...###...',
          '.###.....',
          '###......',
          '#########',
          '#########'
        ]
      ],
      SLEEP_R,
      { e: 180 }
    );
    return [...z, melt(z[2], 0.5)];
  });

export const cross = (): Spr[] =>
  keep('cross', () => {
    const c = glyphs(
      [
        ['.##.', '####', '####', '.##.'],
        ['..##..', '..##..', '######', '######', '..##..', '..##..'],
        [
          '...##...',
          '...##...',
          '...##...',
          '########',
          '########',
          '...##...',
          '...##...',
          '...##...'
        ]
      ],
      CROSS_R,
      { e: 170 }
    );
    return [...c, melt(c[2], 0.5)];
  });

export const star = (): Spr[] =>
  keep('star', () =>
    glyphs(
      [
        ['.#.', '###', '.#.'],
        ['..#..', '..#..', '#####', '..#..', '..#..'],
        ['...#...', '...#...', '..###..', '#######', '..###..', '...#...', '...#...']
      ],
      STAR_R,
      { e: 210 }
    )
  );

export const dot = (c: Rgb, e: number): Spr =>
  keep(`d${c}${e}`, () => {
    const s = new Spr(1, 1, 0, 0);
    s.set(0, 0, c, e);
    return s;
  });
