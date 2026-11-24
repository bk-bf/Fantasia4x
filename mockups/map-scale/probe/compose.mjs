import { readFileSync, writeFileSync } from 'node:fs';
import { loadScene, distanceInside, blur, TILE } from '../../mountain-tops/probe/field.mjs';
import { DIRECTIONS } from '../../mountain-tops/probe/directions.mjs';
import { peakLayer, sunlight } from '../../mountain-tops/probe/layer.mjs';
import { loadArt, growTree } from './trees.mjs';
import { snowDepth } from './lands.mjs';
import { fbm, noise } from './grid.mjs';

const [, , TREE, SCENE, TARGET, SPEC] = process.argv;
const spec = JSON.parse(SPEC);
const scene = await loadScene(TREE, SCENE);
const { encodePng } = await import(`${TREE}/tools/tileset/png.mjs`);
const { W, H, FW, FH, M, LIFT, foot, top, today, s0 } = scene;
const A = await loadArt(TREE);
const plan = spec.plan ? JSON.parse(readFileSync(spec.plan, 'utf8')) : { trees: [], reeds: [], lilies: [] };
const { at: lightAt, noon } = sunlight(scene, A.P.rock);
const sun = spec.sun ?? noon;

const STAND = 24;
const TRUNK_FOOT = 28;
const CLEAR = 42;
const FEATHER = 30;
const SHADE = 0.74;

const img = new Float32Array(W * H * 3);
for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) img[i * 3 + c] = today[i * 4 + c];
const rockRow = new Int32Array(W * H);
const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
const snowy = spec.snowfield ? (x, y) => snowDepth(spec.x0 + x / TILE, spec.y0 + y / TILE, spec.map) : null;

for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (top[y * W + x]) rockRow[y * W + x] = y + LIFT;

if (spec.peaks) {
  const grain = scene.art(2048).rockTone;
  const box = { x0: 0, x1: FW, y0: 0, y1: FH };
  const { dist, nearX, nearY } = distanceInside(foot, FW, FH);
  const dir = DIRECTIONS.c({ grain, A: scene.art(4096), FW, FH, foot, dist, nearX, nearY, blur, box, snow: true });
  const { layer, drawn, source } = peakLayer(scene, dir, box);
  const ramp = A.P.rock,
    bright = lum(ramp[4]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const ci = y * W + x,
        fi = (y + M) * FW + x + M;
      if (!top[ci] || !drawn[fi]) continue;
      let c = [layer[fi * 3], layer[fi * 3 + 1], layer[fi * 3 + 2]];
      if (snowy && lum(c) >= bright && snowy(x, y) > 0) c = A.rp(A.P.snow, 0.5 + (lum(c) - bright) / 90, x, y, 0.4);
      for (let k = 0; k < 3; k++) img[ci * 3 + k] = s0[ci * 4 + k] + (c[k] - ramp[0][k]) * lightAt(ci, k);
      rockRow[ci] = source[fi] - M;
    }
}

if (snowy) {
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const ci = y * W + x;
      if (top[ci]) continue;
      let rocky = false;
      for (let k = 0; k <= LIFT && !rocky; k += 2) rocky = foot[(y + M + k) * FW + x + M] === 1;
      if (rocky) continue;
      const depth = snowy(x, y) + (noise(x / 11, y / 11, 201) - 0.5) * 3 + (A.dith(x, y) - 0.5) * 0.9;
      if (depth <= 0) continue;
      const t = 0.78 + (fbm(x / 130, y / 130, 203, 2) - 0.5) * 0.5 + (noise(x / 16, y / 8, 205) - 0.5) * 0.1 - (depth < 0.5 ? 0.2 : 0);
      const c = A.rp(A.P.snow, t, x, y, 0.2);
      for (let k = 0; k < 3; k++) img[ci * 3 + k] = c[k] * sun[k];
    }
}

const inView = (p, padX, padUp, padDown) => p[0] >= spec.x0 - padX && p[0] < spec.x0 + W / TILE + padX && p[1] >= spec.y0 - padUp && p[1] < spec.y0 + H / TILE + padDown;
const px = (tx) => (tx - spec.x0) * TILE;

const folk = (spec.folk ?? []).map((f) => {
  const built = A.mkPawn(A.PAWNS[f.kind].o),
    sprite = f.flip ? built.flip() : built;
  return { sprite, x: f.at[0] * TILE + TILE / 2, base: f.at[1] * TILE + STAND, order: f.at[1] * TILE + STAND };
});
const far = new Uint8Array(W * H).fill(1);
for (const f of folk)
  for (let y = f.base - f.sprite.h; y <= f.base; y++)
    for (let x = f.x - 9; x <= f.x + 9; x++) if (x >= 0 && y >= 0 && x < W && y < H) far[y * W + x] = 0;
const away = folk.length ? distanceInside(far, W, H).dist : null;
const wobble = (x, y) => (noise(x / 12, y / 12, 401) - 0.5) * 12;
const cutaway = (x, y) => {
  if (!away) return false;
  const d = away[y * W + x];
  if (d >= CLEAR + FEATHER + 6) return false;
  return (d + wobble(x, y) - CLEAR) / FEATHER <= A.dith(x, y) * 0.96 + 0.02;
};

for (const [tx, ty] of plan.lilies.filter((p) => inView(p, 1, 1, 1))) {
  const cx = px(tx) + 6 + Math.floor(A.hash(tx, ty, 301) * 20),
    cy = (ty - spec.y0) * TILE + 6 + Math.floor(A.hash(tx, ty, 303) * 20),
    pads = 1 + Math.floor(A.hash(tx, ty, 305) * 3);
  for (let p = 0; p < pads; p++) {
    const ox = cx + Math.round((A.hash(tx + p, ty, 307) - 0.5) * 16),
      oy = cy + Math.round((A.hash(tx, ty + p, 309) - 0.5) * 12),
      wide = 3 + Math.floor(A.hash(tx + p, ty + p, 311) * 2);
    for (let j = -2; j <= 2; j++)
      for (let i = -wide; i <= wide; i++) {
        if ((i * i) / (wide * wide + 1) + (j * j) / 5 > 1 || (i === wide - 1 && j === 0) || (i === wide && j === 0)) continue;
        const x = ox + i,
          y = oy + j;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const c = A.P.green[j < 0 ? 4 : j === 2 || i === -wide ? 1 : 3];
        for (let k = 0; k < 3; k++) img[(y * W + x) * 3 + k] = c[k] * sun[k];
      }
    if (A.hash(tx + p, ty - p, 313) < 0.3 && ox > 0 && oy > 1 && ox < W - 1 && oy < H) {
      const bloom = [[0, -1, [250, 244, 236]], [1, -1, [236, 196, 214]], [0, -2, [236, 196, 214]]];
      for (const [i, j, c] of bloom) for (let k = 0; k < 3; k++) img[((oy + j) * W + ox + i) * 3 + k] = c[k] * sun[k];
    }
  }
}

const cache = new Map();
const tree = (t) => {
  const f = Math.round(t.f * 4) / 4,
    key = `${t.kind}|${t.seed}|${f}`;
  if (!cache.has(key)) cache.set(key, growTree(A, t.kind, t.seed, f));
  return cache.get(key);
};
const sprites = [];
for (const t of plan.trees.filter((p) => inView([p.x, p.y], 14, 4, 24))) {
  const sprite = tree(t);
  sprites.push({ sprite, x: px(t.x) + TILE / 2, base: (t.y - spec.y0) * TILE + TRUNK_FOOT, order: (t.y - spec.y0) * TILE + TRUNK_FOOT, crown: true });
}
for (const [tx, ty] of plan.reeds.filter((p) => inView(p, 2, 2, 3))) {
  const sprite = A.mkPlant('reeds', 1 + Math.floor(A.hash(tx, ty, 315) * 3), 'summer');
  sprites.push({ sprite, x: px(tx) + TILE / 2 + Math.round((A.hash(tx, ty, 317) - 0.5) * 10), base: (ty - spec.y0) * TILE + 22 + Math.round(A.hash(tx, ty, 319) * 8), order: (ty - spec.y0) * TILE + 26 });
}
for (const f of folk) sprites.push(f);
sprites.sort((a, b) => a.order - b.order);

const shade = new Uint8Array(W * H);
for (const s of sprites) {
  if (!s.crown || !s.sprite.sh) continue;
  const { rx, ry, dx } = s.sprite.sh,
    cx = s.x + dx,
    cy = s.base;
  for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(H - 1, Math.ceil(cy + ry)); y++)
    for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(W - 1, Math.ceil(cx + rx)); x++) {
      const q = Math.hypot((x - cx) / rx, (y - cy) / ry);
      if (q < 1 && (1 - q) / 0.16 > A.dith(x, y)) shade[y * W + x] = 1;
    }
}
for (let i = 0; i < W * H; i++) if (shade[i] && !rockRow[i]) for (let k = 0; k < 3; k++) img[i * 3 + k] *= SHADE;

for (const s of sprites) {
  const { sprite } = s,
    ox = s.x - sprite.ax,
    oy = s.base - sprite.ay;
  for (let sy = 0; sy < sprite.h; sy++) {
    const y = oy + sy;
    if (y < 0 || y >= H) continue;
    for (let sx = 0; sx < sprite.w; sx++) {
      const x = ox + sx;
      if (x < 0 || x >= W) continue;
      const i = sy * sprite.w + sx;
      const c = sprite.c[i];
      if (!c) continue;
      const ci = y * W + x;
      if (rockRow[ci] > s.base + 2) continue;
      if (s.crown && sprite.crown[i] && cutaway(x, y)) continue;
      for (let k = 0; k < 3; k++) img[ci * 3 + k] = c[k] * sun[k];
    }
  }
}

const out = new Uint8Array(W * H * 4);
for (let i = 0; i < W * H; i++) {
  for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.max(0, Math.min(255, Math.round(img[i * 3 + k])));
  out[i * 4 + 3] = 255;
}
writeFileSync(TARGET, encodePng(W, H, out, 6));
console.log('wrote', TARGET, 'trees', sprites.filter((s) => s.crown).length, 'sun', sun.map((v) => v.toFixed(3)).join(' '));
