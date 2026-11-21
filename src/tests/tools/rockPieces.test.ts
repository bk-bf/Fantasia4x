import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROCK, art } from '../../../tools/tileset/bake.mjs';
import {
  BLOB_LAYOUTS,
  CELL_H,
  CELL_W,
  CELL_X,
  CELL_Y,
  NEIGHBOURS,
  PATCH,
  REACH,
  TILE,
  TOP_SIZE,
  VEIN,
  blobLayout,
  layoutMass,
  rockVeins
} from '../../../tools/tileset/rock.mjs';

type Mass = (tx?: number, ty?: number) => boolean;
type Image = { x0: number; y0: number; w: number; h: number; px: Uint8ClampedArray };

const SIDE = PATCH * CELL_W;
const CELLS = Array.from({ length: PATCH * PATCH }, (_, i) => [i % PATCH, Math.floor(i / PATCH)]);
const pieces = new Map(BLOB_LAYOUTS.map((l) => [l, ROCK.piece(l)]));
const mod = (v: number) => ((v % PATCH) + PATCH) % PATCH;

function gridMass(rows: string[], ox = 0, oy = 0): Mass {
  return (tx = 0, ty = 0) => rows[ty - oy]?.[tx - ox] === '#';
}

function layoutAt(mass: Mass, tx: number, ty: number): number {
  return NEIGHBOURS.reduce((m, [dx, dy], bit) => (mass(tx + dx, ty + dy) ? m | (1 << bit) : m), 0);
}

function image(x0: number, y0: number, w: number, h: number): Image {
  return { x0, y0, w, h, px: new Uint8ClampedArray(w * h * 4) };
}

function put(img: Image, x: number, y: number, c: ArrayLike<number>) {
  const col = x - img.x0,
    row = y - img.y0;
  if (col < 0 || row < 0 || col >= img.w || row >= img.h) return;
  img.px.set([c[0], c[1], c[2], 255], (row * img.w + col) * 4);
}

function stamp(img: Image, mass: Mass, tx: number, ty: number) {
  const px = pieces.get(blobLayout(layoutAt(mass, tx, ty)))!;
  const cx = mod(tx),
    cy = mod(ty);
  for (let j = 0; j < CELL_H; j++)
    for (let i = 0; i < CELL_W; i++) {
      const k = ((cy * CELL_H + j) * SIDE + cx * CELL_W + i) * 4;
      if (px[k + 3])
        put(img, tx * TILE + CELL_X + i, ty * TILE + CELL_Y + j, px.subarray(k, k + 3));
    }
}

function signature(mass: Mass, tx: number, ty: number): string {
  const x0 = tx * TILE - REACH - 1,
    y0 = ty * TILE - REACH - 1,
    n = TILE + 2 * REACH + 2;
  const own = new Uint8Array(n * n),
    rock = new Uint8Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const o = ROCK.owner(mass, x0 + i, y0 + j);
      rock[j * n + i] = o === null ? 0 : 1;
      own[j * n + i] = o !== null && o[0] === tx && o[1] === ty ? 1 : 0;
    }
  const near = (i: number, j: number) =>
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ].some(([a, b]) => own[(j + b) * n + i + a] === 1);
  let out = '';
  for (let j = 1; j < n - 1; j++)
    for (let i = 1; i < n - 1; i++)
      out += own[j * n + i] ? '#' : near(i, j) ? (rock[j * n + i] ? '+' : '.') : '-';
  return out;
}

describe('rock pieces: one per neighbour layout that differs', () => {
  it('bakes one piece per blob layout, and no two of them are alike', () => {
    expect(BLOB_LAYOUTS).toHaveLength(47);
    const seen = new Set<string>();
    for (const px of pieces.values()) seen.add(Buffer.from(px).toString('base64'));
    expect(seen.size).toBe(BLOB_LAYOUTS.length);
  });

  it('draws every one of the 256 layouts exactly as its blob layout at every patch cell', () => {
    for (const [cx, cy] of CELLS) {
      const of = new Map(
        BLOB_LAYOUTS.map((l) => [l, signature(layoutMass(l, cx + 1, cy + 1), cx + 1, cy + 1)])
      );
      for (let layout = 0; layout < 256; layout++) {
        if (blobLayout(layout) === layout) continue;
        const own = signature(layoutMass(layout, cx + 1, cy + 1), cx + 1, cy + 1);
        expect(own === of.get(blobLayout(layout)), `layout ${layout} at cell ${cx},${cy}`).toBe(
          true
        );
      }
    }
  });
});

describe('rock pieces: neighbours agree on their shared edge', () => {
  const views = (a: number, extra: number, dir: 'east' | 'south') => {
    const ka = layoutMass(a, 1, 1);
    const kb: Mass = (tx = 0, ty = 0) => {
      const fresh = dir === 'east' ? tx === 3 : ty === 3;
      if (!fresh) return ka(tx, ty);
      const i = dir === 'east' ? ty : tx;
      return i >= 0 && i < 3 && (extra & (1 << i)) !== 0;
    };
    return { ka, kb };
  };

  for (const dir of ['east', 'south'] as const)
    it(`gives the same rock on both sides of the ${dir} edge from either tile's neighbours alone`, () => {
      const apart: string[] = [];
      for (const a of BLOB_LAYOUTS)
        for (let extra = 0; extra < 8; extra++) {
          const { ka, kb } = views(a, extra, dir);
          const bOnly: Mass = (tx = 0, ty = 0) =>
            Math.abs(tx - (dir === 'east' ? 2 : 1)) <= 1 &&
            Math.abs(ty - (dir === 'east' ? 1 : 2)) <= 1 &&
            kb(tx, ty);
          for (const [cx, cy] of CELLS) {
            const sx = cx * TILE,
              sy = cy * TILE;
            const shift =
              (m: Mass): Mass =>
              (tx = 0, ty = 0) =>
                m(tx - cx, ty - cy);
            const A = shift(ka),
              B = shift(bOnly);
            for (let along = -REACH; along < TILE + REACH; along++)
              for (const side of [TILE * 2 - 1, TILE * 2]) {
                const [x, y] =
                  dir === 'east' ? [sx + side, sy + TILE + along] : [sx + TILE + along, sy + side];
                const fromA = `${ROCK.owner(A, x, y)}`,
                  fromB = `${ROCK.owner(B, x, y)}`;
                if (fromA !== fromB)
                  apart.push(`layout ${a} + ${dir} ${extra} at cell ${cx},${cy}, pixel ${x},${y}`);
              }
          }
        }
      expect(apart).toEqual([]);
    });
});

describe('rock pieces: the outline runs on across tile edges', () => {
  const block = gridMass([
    '............',
    '.##########.',
    '.##########.',
    '.##########.',
    '............'
  ]);

  function steps(outline: number[], start: number) {
    let seam = 0,
      inside = 0;
    for (let i = 1; i < outline.length; i++) {
      const step = Math.abs(outline[i] - outline[i - 1]);
      if ((start + i) % TILE === 0) seam = Math.max(seam, step);
      else inside = Math.max(inside, step);
    }
    return { seam, inside };
  }

  it('steps no further where two pieces meet than within a piece, along every side', () => {
    const xs = Array.from({ length: 8 * TILE }, (_, i) => 2 * TILE + i);
    const ys = Array.from({ length: TILE }, (_, i) => 2 * TILE + i);
    const top = xs.map((x) => {
      let y = TILE - REACH;
      while (!ROCK.rock(block, x, y)) y++;
      return y;
    });
    const bottom = xs.map((x) => {
      let y = 4 * TILE + REACH;
      while (!ROCK.rock(block, x, y)) y--;
      return y;
    });
    const left = ys.map((y) => {
      let x = TILE - REACH;
      while (!ROCK.rock(block, x, y)) x++;
      return x;
    });
    const right = ys.map((y) => {
      let x = 11 * TILE + REACH;
      while (!ROCK.rock(block, x, y)) x--;
      return x;
    });
    for (const [side, outline, start] of [
      ['top', top, xs[0]],
      ['bottom', bottom, xs[0]],
      ['left', left, ys[0]],
      ['right', right, ys[0]]
    ] as const) {
      const { seam, inside } = steps([...outline], start);
      expect(seam, side).toBeLessThanOrEqual(inside);
    }
  });
});

describe('rock pieces: placed by row, they rebuild a single drawing of the mass', () => {
  const maps = [
    [
      '..........',
      '.##..###..',
      '.#####.##.',
      '..####..#.',
      '.##.#####.',
      '..#..##...',
      '..........'
    ],
    ['.#.#.#.#', '#.#.#.#.', '.###.##.', '########', '.#..#..#', '##.###.#'],
    ['......', '.####.', '.#..#.', '.####.', '......']
  ];

  for (const [n, rows] of maps.entries())
    for (const [ox, oy] of [
      [0, 0],
      [1, 3]
    ])
      it(`matches tile for tile on map ${n + 1} placed at ${ox},${oy}`, () => {
        const mass = gridMass(rows, ox, oy);
        const w = rows[0].length,
          h = rows.length;
        const area = {
          x0: (ox - 1) * TILE,
          x1: (ox + w + 1) * TILE,
          y0: (oy - 1) * TILE,
          y1: (oy + h + 1) * TILE
        };
        const make = () =>
          image(area.x0, area.y0 + CELL_Y, area.x1 - area.x0, area.y1 - area.y0 - CELL_Y);
        const drawn = make();
        ROCK.paintOwned(
          mass,
          () => true,
          area,
          (x = 0, y = 0, c: number[] = []) => put(drawn, x, y, c)
        );
        const pieced = make();
        for (let ty = oy; ty < oy + h; ty++)
          for (let tx = ox; tx < ox + w; tx++) if (mass(tx, ty)) stamp(pieced, mass, tx, ty);
        let differ = 0;
        for (let i = 0; i < drawn.px.length; i++) if (drawn.px[i] !== pieced.px[i]) differ++;
        expect(differ).toBe(0);
      });
});

describe('rock veins: where ore shows in the rock top', () => {
  const veins = rockVeins(art(TOP_SIZE));
  const code = (x: number, y: number) => veins[(y * TOP_SIZE + x) * 4];

  it('names its codes as the fragment shader reads them', () => {
    const glsl = readFileSync(join(__dirname, '../../lib/webgl/shaders/fragment.glsl'), 'utf8');
    for (const [name, value] of [
      ['NONE', VEIN.none],
      ['EDGE', VEIN.edge],
      ['SHADE', VEIN.shade],
      ['TILE', TILE]
    ])
      expect(glsl).toContain(`const int VEIN_${name} = ${value};`);
  });

  it('puts ore shades in every tile', () => {
    for (let ty = 0; ty < TOP_SIZE / TILE; ty++)
      for (let tx = 0; tx < TOP_SIZE / TILE; tx++) {
        let shades = 0;
        for (let j = 0; j < TILE; j++)
          for (let i = 0; i < TILE; i++)
            if (code(tx * TILE + i, ty * TILE + j) >= VEIN.shade) shades++;
        expect(shades, `tile ${tx},${ty}`).toBeGreaterThan(TILE);
      }
  });
});
