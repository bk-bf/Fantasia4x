import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './png.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = join(ROOT, 'static', 'tilesets', 'painted', 'weather');
const SHEETS = JSON.parse(
  readFileSync(
    join(ROOT, 'src', 'lib', 'components', 'UI', 'weather', 'weatherSheets.json'),
    'utf8'
  )
);
const { hash, mix, clamp } = new Function(
  `'use strict';\n${readFileSync(join(HERE, 'art', 'gfx.js'), 'utf8').replace(/^'use strict';\n/, '')}\nreturn { hash, mix, clamp };`
)();

const wrap = (v = 0, p = 1) => ((v % p) + p) % p;

function loopNoise(x = 0, y = 0, px = 1, py = 1, seed = 0) {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    at = (i = 0, j = 0) => hash(wrap(i, px), wrap(j, py), seed);
  let xf = x - xi,
    yf = y - yi;
  xf = xf * xf * (3 - 2 * xf);
  yf = yf * yf * (3 - 2 * yf);
  return mix(mix(at(xi, yi), at(xi + 1, yi), xf), mix(at(xi, yi + 1), at(xi + 1, yi + 1), xf), yf);
}

function paint(w = 0, h = 0, fn = (x = 0, y = 0) => (x + y < 0 ? [0] : null)) {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0, i = 0; y < h; y++)
    for (let x = 0; x < w; x++, i += 4) {
      const c = fn(x, y);
      if (!c) continue;
      px.set([c[0], c[1], c[2], Math.round(c.length > 3 ? c[3] : 255)], i);
    }
  return encodePng(w, h, px);
}

function rainTile(L = SHEETS.rain[0], heavy = false, seed = 0) {
  const p = L.p,
    cols = p / 6,
    seg = p / L.segs,
    base = L.dens[heavy ? 1 : 0];
  return paint(p, p * 3, (x = 0, y = 0) => {
    const u = wrap(x + Math.floor(y / 3), p);
    if (u % 6) return null;
    const col = u / 6,
      v = wrap(y + Math.floor(hash(col, 1, seed) * p), p),
      s = Math.floor(v / seg),
      ph = v - s * seg;
    const clump = loopNoise((col / cols) * 4, s + 0.5, 4, L.segs, seed + 3);
    if (hash(col, s, seed + 7) > base * (0.25 + 1.5 * clump)) return null;
    const len = Math.round(L.len * (0.6 + 0.8 * hash(col, s, seed + 9)));
    return ph < len ? [...SHEETS.rainInk, ph < len * 0.35 ? L.alpha * 0.55 : L.alpha] : null;
  });
}

function fogTile(L = SHEETS.fog[0]) {
  return paint(L.w, L.h, (x = 0, y = 0) => {
    let n = 0,
      a = 0.5,
      f = 1,
      t = 0;
    for (let o = 0; o < 3; o++) {
      n += a * loopNoise((x / L.w) * 4 * f, (y / L.h) * 3 * f, 4 * f, 3 * f, L.seed + o * 17);
      t += a;
      a *= 0.5;
      f *= 2;
    }
    const d = clamp((n / t - 0.46) / 0.22, 0, 1);
    return [...SHEETS.fogInk, 255 * L.peak * d * d * (3 - 2 * d)];
  });
}

function snowTile(L = SHEETS.snow) {
  return paint(L.size, L.size, (x = 0, y = 0) => {
    const h = hash(x >> 1, y >> 1, L.seed);
    if (h > 0.992) return [246, 248, 252, 235];
    return h > 0.986 && !(x & 1) && !(y & 1) ? [226, 232, 244, 200] : null;
  });
}

export function bakeWeather() {
  const out = Object.fromEntries([['snow', snowTile()]]);
  SHEETS.rain.forEach((L = SHEETS.rain[0], n = 0) => {
    out[`rain${n}`] = rainTile(L, false, 20 + n * 11);
    out[`storm${n}`] = rainTile(L, true, 20 + n * 11);
  });
  SHEETS.fog.forEach((L = SHEETS.fog[0], n = 0) => (out[`fog${n}`] = fogTile(L)));
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(OUT, { recursive: true });
  for (const [name, png] of Object.entries(bakeWeather())) {
    writeFileSync(join(OUT, `${name}.png`), png);
    console.log(`${name}.png ${Math.round(png.length / 1024)} KB`);
  }
}
