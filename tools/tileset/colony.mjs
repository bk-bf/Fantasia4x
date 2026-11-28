import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeApng, encodePng } from './png.mjs';
import { COLONY_ART } from './sources.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', 'static', 'tilesets', 'painted', 'colony');
const SEASONS = ['autumn', 'winter'];
const TIMES = ['day', 'dusk', 'night'];
const FPS = 10;
const FRAMES = 64;
const REST = 3;

/** @typedef {{ leafy: unknown[], gm: Uint8Array, season: string, W: number, H: number, water: ArrayLike<unknown>, gw: Record<string, Uint32Array> }} World */

const loadArt = () =>
  new Function(
    `'use strict';\n${COLONY_ART.map((f) => readFileSync(join(HERE, 'art', f), 'utf8').replace(/^'use strict';\n/, '')).join('\n')}\nreturn { buildScene, renderWorld, present };`
  )();

const surface = {
  createImageData: (w = 0, h = 0) => ({
    data: new Uint8ClampedArray(w * h * 4),
    width: w,
    height: h
  }),
  putImageData: () => undefined
};

/** @param {World} r */
function withoutParticles(r) {
  r.leafy = [];
  r.gm = new Uint8Array(r.W * r.H);
  r.season = '';
}

/** @param {World} r @param {string} [time] */
function stillWater(r, time = '') {
  const n = r.water.length;
  const all = r.gw[time];
  const rest = all.slice(0, n);
  const out = new Uint32Array(all.length);
  for (let o = 0; o < all.length; o += n) out.set(rest, o);
  r.gw[time] = out;
}

const rgba = (px = new Uint32Array(0)) => new Uint8Array(px.buffer, px.byteOffset, px.length * 4);

function delta(prev = new Uint32Array(0), cur = new Uint32Array(0), W = 0, H = 0, whole = false) {
  let x0 = W,
    y0 = H,
    x1 = -1,
    y1 = -1;
  for (let i = 0; i < cur.length; i++)
    if (cur[i] !== prev[i]) {
      const x = i % W,
        y = (i / W) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  if (whole) [x0, y0, x1, y1] = [0, 0, W - 1, H - 1];
  else if (x1 < 0) [x0, y0, x1, y1] = [0, 0, 0, 0];
  const w = x1 - x0 + 1,
    h = y1 - y0 + 1,
    px = new Uint32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y0 + y) * W + x0 + x;
      if (cur[i] !== prev[i]) px[y * w + x] = cur[i];
    }
  return { x: x0, y: y0, w, h, rgba: rgba(px) };
}

export function bakeSeason(season = 'autumn') {
  const A = loadArt();
  const r = A.renderWorld(A.buildScene(season), { season, roofs: 'cut', cache: {} });
  withoutParticles(r);
  const out = [];
  for (const time of TIMES) {
    A.present(r, surface, time, REST, { calm: false });
    stillWater(r, time);
    A.present(r, surface, time, REST, { calm: true });
    const base = r.out.slice();
    const frames = [];
    let prev = base;
    for (let f = 0; f < FRAMES; f++) {
      const ts = f / FPS;
      r.lkey = time + Math.floor(ts * 6);
      A.present(r, surface, time, ts, { calm: false, dt: 1 / FPS });
      const cur = r.out.slice();
      frames.push(delta(prev, cur, r.W, r.H, f === 0));
      prev = cur;
    }
    out.push({
      name: `${season}-${time}`,
      still: encodePng(r.W, r.H, rgba(base)),
      live: encodeApng(r.W, r.H, frames, FPS)
    });
  }
  return { w: r.W, h: r.H, layers: out };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(OUT, { recursive: true });
  for (const season of SEASONS) {
    const { w, h, layers } = bakeSeason(season);
    for (const { name, still, live } of layers) {
      writeFileSync(join(OUT, `${name}.png`), still);
      writeFileSync(join(OUT, `${name}-live.png`), live);
      console.log(
        `${name} ${w}x${h}: still ${Math.round(still.length / 1024)} KB, live ${Math.round(live.length / 1024)} KB`
      );
    }
  }
}
