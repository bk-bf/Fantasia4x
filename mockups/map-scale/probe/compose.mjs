import { readFileSync, writeFileSync } from 'node:fs';
import { loadScene, distanceInside, blur, TILE } from '../../mountain-tops/probe/field.mjs';
import { DIRECTIONS } from '../../mountain-tops/probe/directions.mjs';
import { peakLayer, sunlight } from '../../mountain-tops/probe/layer.mjs';
import { excavate } from '../../mountain-tops/probe/mine.mjs';
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

const UNDER = 0.74;
const outcrop = spec.top ? (await import(spec.top.module))[spec.top.name] : null;
let rockPlants = [];
let dig = null;
let lifted = null;
if (spec.peaks || outcrop) {
  const grain = scene.art(2048).rockTone;
  const box = { x0: 0, x1: FW, y0: 0, y1: FH };
  const { dist, nearX, nearY } = distanceInside(foot, FW, FH);
  const ctx = { grain, A: scene.art(4096), FW, FH, foot, dist, nearX, nearY, blur, box, snow: !outcrop };
  const dir = outcrop ? outcrop(ctx, spec.top.options) : DIRECTIONS.c(ctx);
  rockPlants = dir.plants ?? [];
  lifted = dir.height;
  dig = spec.mined ? excavate({ ...scene, A: scene.art(4096), grain }) : null;
  const RIM = { [dig?.PART.rimLit]: 1.24, [dig?.PART.rimDark]: 0.74 };
  const { layer, drawn, source } = peakLayer(scene, dir, box);
  const ramp = A.P.rock,
    bright = lum(ramp[4]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const ci = y * W + x,
        fx = x + M,
        fy = y + M,
        fi = fy * FW + fx;
      const peak = top[ci] && drawn[fi] && !(dig && dig.seeThrough(fx, fy));
      if (dig) {
        const stands = dig.ground[fi] > 0 && (peak ? source[fi] : dig.cover(fx, fy)) < dig.ground[fi];
        const dug = !peak && !stands ? dig.part[fi] : 0;
        if (stands) {
          for (let k = 0; k < 3; k++) img[ci * 3 + k] = dig.folk[fi * 3 + k] * (top[ci] ? lightAt(ci, k) : noon[k]);
          continue;
        }
        if (dug === dig.PART.floor || dug === dig.PART.face) {
          for (let k = 0; k < 3; k++) img[ci * 3 + k] = dig.colour[fi * 3 + k] * (top[ci] ? lightAt(ci, k) : noon[k]) * (dug === dig.PART.face ? UNDER : 1);
          rockRow[ci] = 0;
          continue;
        }
        if (dug) {
          for (let k = 0; k < 3; k++) img[ci * 3 + k] *= RIM[dug] * UNDER;
          continue;
        }
        if (!peak && top[ci] && drawn[fi]) {
          for (let k = 0; k < 3; k++) img[ci * 3 + k] *= UNDER;
          continue;
        }
      }
      if (!peak) continue;
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
const px = (tx) => Math.round((tx - spec.x0) * TILE);

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
  const hx = Math.floor(tx * 7),
    hy = Math.floor(ty * 7);
  const cx = px(tx) + 6 + Math.floor(A.hash(hx, hy, 301) * 20),
    cy = Math.round((ty - spec.y0) * TILE) + 6 + Math.floor(A.hash(hx, hy, 303) * 20),
    pads = 1 + Math.floor(A.hash(hx, hy, 305) * 3);
  for (let p = 0; p < pads; p++) {
    const ox = cx + Math.round((A.hash(hx + p, hy, 307) - 0.5) * 16),
      oy = cy + Math.round((A.hash(hx, hy + p, 309) - 0.5) * 12);
    A.decal('lily', ox, oy, A.hash(hx + p, hy - p, 313), null, (x, y, c) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      for (let k = 0; k < 3; k++) img[(y * W + x) * 3 + k] = c[k] * sun[k];
    });
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
for (const p of rockPlants) {
  const x = p.x - M,
    y = p.y - M;
  if (x < -20 || y < -10 || x >= W + 20 || y >= H + 40) continue;
  if (dig && dig.seeThrough(p.x, p.y - LIFT - Math.round(lifted[p.y * FW + p.x]))) continue;
  const sprite = p.tree ? tree({ kind: p.tree, seed: p.seed, f: p.f }) : A.mkPlant(p.plant, p.seed, 'summer');
  const lift = LIFT + Math.round(lifted[p.y * FW + p.x]);
  sprites.push({ sprite, x, base: y - lift + (p.tree ? 4 : 2), depth: y, order: y, crown: Boolean(p.tree), onRock: true });
}
for (const [tx, ty] of plan.reeds.filter((p) => inView(p, 2, 2, 3))) {
  const hx = Math.floor(tx * 7),
    hy = Math.floor(ty * 7);
  const sprite = A.mkPlant('reeds', 1 + Math.floor(A.hash(hx, hy, 315) * 3), 'summer');
  sprites.push({ sprite, x: px(tx) + TILE / 2 + Math.round((A.hash(hx, hy, 317) - 0.5) * 10), base: Math.round((ty - spec.y0) * TILE) + 22 + Math.round(A.hash(hx, hy, 319) * 8), order: (ty - spec.y0) * TILE + 26 });
}
for (const f of folk) sprites.push(f);
sprites.sort((a, b) => a.order - b.order);

const shade = new Uint8Array(W * H);
for (const s of sprites) {
  if (!s.crown || !s.sprite.sh || s.onRock) continue;
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
      if (rockRow[ci] > (s.depth ?? s.base) + 2) continue;
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
