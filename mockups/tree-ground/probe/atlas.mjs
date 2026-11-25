import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { loadArt } from '../../big-trees/probe/paint.mjs';
import { forest } from '../../big-trees/probe/trees.mjs';

export const ORDINARY = ['oak', 'ash', 'birch', 'apple', 'willow', 'pine', 'yew', 'dead'];
export const MAGIC = ['heartwood', 'frostheart', 'moonwood', 'ironwood', 'emberwood', 'soulwood', 'witchwood', 'bonewood'];
const FOLK = ['woodcutter', 'hunter', 'farmer', 'cook', 'miner', 'weaver'];
const YOUNG = [1, 2],
  MATURE = [1, 2, 3],
  ELDER = [1];
const ATLAS_W = 2048;
const TWIG = [
  [36, 28, 26],
  [58, 46, 40],
  [90, 74, 62]
];

const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
const hex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

function flatten(s) {
  const n = s.w * s.h;
  const rgb = new Float32Array(n * 3),
    on = new Uint8Array(n),
    crown = new Uint8Array(n);
  const lay = (p, veil) => {
    for (let i = 0; i < n; i++) {
      const c = p.c[i];
      if (!c) continue;
      rgb[i * 3] = c[0];
      rgb[i * 3 + 1] = c[1];
      rgb[i * 3 + 2] = c[2];
      on[i] = 1;
      crown[i] = veil || p.crown?.[i] ? 1 : 0;
    }
  };
  if (s.veil) lay(s.veil[0], true);
  lay(s, false);
  if (s.veil) lay(s.veil[1], true);
  const edge = [];
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++) {
      const i = y * s.w + x;
      if (!on[i] || crown[i]) continue;
      let near = false,
        wood = false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const j = i + dy * s.w + dx;
          if (x + dx < 0 || x + dx >= s.w || y + dy < 0 || y + dy >= s.h || !on[j]) continue;
          if (crown[j]) near = true;
          else if (dx || dy) wood = true;
        }
      if (near && (!wood || lum([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]]) < 40)) edge.push(i);
    }
  for (const i of edge) crown[i] = 1;
  return { w: s.w, h: s.h, ax: s.ax, ay: s.ay, sh: s.sh ?? null, rgb, on, crown };
}

function winterise(f, leaf, ever, A) {
  if (!leaf) return;
  const n = leaf.length - 1,
    snow = A.P.snow;
  const lo = lum(leaf[0]),
    hi = lum(leaf[n]);
  for (let i = 0; i < f.w * f.h; i++) {
    if (!f.on[i] || !f.crown[i]) continue;
    const c = [f.rgb[i * 3], f.rgb[i * 3 + 1], f.rgb[i * 3 + 2]];
    const t = Math.max(0, Math.min(1, (lum(c) - lo) / (hi - lo)));
    const step = Math.round(t * 5);
    let out = null;
    if (ever) {
      if (step === 5) out = snow[4];
      else if (step === 4 && A.hash(i, 3, 5) < 0.7) out = snow[3];
    } else out = step === 5 ? snow[4] : step === 4 ? snow[3] : step === 3 ? snow[1] : TWIG[Math.max(0, step)] ?? TWIG[0];
    if (!out) continue;
    f.rgb[i * 3] = out[0];
    f.rgb[i * 3 + 1] = out[1];
    f.rgb[i * 3 + 2] = out[2];
  }
}

function barkOf(f) {
  const seen = new Map();
  for (let y = Math.max(0, f.ay - 14); y < Math.min(f.h, f.ay + 1); y++)
    for (let x = 0; x < f.w; x++) {
      const i = y * f.w + x;
      if (!f.on[i] || f.crown[i]) continue;
      const k = hex([f.rgb[i * 3], f.rgb[i * 3 + 1], f.rgb[i * 3 + 2]]);
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
  const top = [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);
  return top.sort((a, b) => parseInt(a.slice(1), 16) - parseInt(b.slice(1), 16)).sort((a, b) => lum(rgbOf(a)) - lum(rgbOf(b)));
}
const rgbOf = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function footOf(f) {
  let x0 = f.w,
    x1 = 0;
  for (let y = Math.max(0, f.ay - 3); y <= Math.min(f.h - 1, f.ay); y++)
    for (let x = 0; x < f.w; x++)
      if (f.on[y * f.w + x] && !f.crown[y * f.w + x]) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
      }
  return x1 < x0 ? 4 : Math.max(3, Math.round((x1 - x0 + 1) / 2));
}

async function season(TREE, name) {
  const A = await loadArt(TREE);
  if (name === 'autumn') for (const k of ORDINARY) if (A.TREES[k].fall && !A.TREES[k].ever) A.TREES[k].leaf = A.TREES[k].fall;
  const F = forest(A);
  const list = [];
  const add = (key, s, kind) => {
    const f = flatten(s);
    const def = kind ? A.TREES[kind] : null;
    if (name === 'winter' && def) winterise(f, def.leaf ?? def.tuft, Boolean(def.ever), A);
    list.push({ key, kind, ...f });
  };
  for (const kind of [...ORDINARY, ...MAGIC]) {
    for (const seed of YOUNG) add(`${kind}-young-${seed}`, F.young(kind, seed), kind);
    for (const seed of MATURE) add(`${kind}-mature-${seed}`, F.mature(kind, 10 + seed + ORDINARY.concat(MAGIC).indexOf(kind)), kind);
    if (MAGIC.includes(kind)) for (const seed of ELDER) add(`${kind}-elder-${seed}`, F.elder(kind, 40 + seed + MAGIC.indexOf(kind)), kind);
  }
  for (const kind of FOLK) {
    add(`folk-${kind}`, F.pawn(kind, false), null);
    add(`folk-${kind}-flip`, F.pawn(kind, true), null);
  }
  return { A, list };
}

export async function buildAtlas(TREE, WORK, IMG, encodePng) {
  const seasons = {};
  for (const name of ['summer', 'autumn', 'winter']) seasons[name] = await season(TREE, name);
  const base = seasons.summer.list;
  const order = base.map((s, i) => i).sort((a, b) => base[b].h - base[a].h);
  const place = [];
  let cx = 0,
    cy = 0,
    shelf = 0;
  for (const i of order) {
    const s = base[i];
    if (cx + s.w + 1 > ATLAS_W) {
      cx = 0;
      cy += shelf + 1;
      shelf = 0;
    }
    place[i] = [cx, cy];
    cx += s.w + 1;
    shelf = Math.max(shelf, s.h);
  }
  const ATLAS_H = cy + shelf + 1;
  const write = (name, list, bare) => {
    const rgba = new Uint8Array(ATLAS_W * ATLAS_H * 4);
    list.forEach((s, n) => {
      const [ox, oy] = place[n];
      for (let y = 0; y < s.h; y++)
        for (let x = 0; x < s.w; x++) {
          const j = y * s.w + x;
          if (!s.on[j] || (bare && s.crown[j])) continue;
          const o = ((oy + y) * ATLAS_W + ox + x) * 4;
          for (let k = 0; k < 3; k++) rgba[o + k] = Math.max(0, Math.min(255, Math.round(s.rgb[j * 3 + k])));
          rgba[o + 3] = 255;
        }
    });
    writeFileSync(`${WORK}/${name}.png`, encodePng(ATLAS_W, ATLAS_H, rgba, 6));
    execFileSync('cwebp', ['-quiet', '-lossless', '-exact', '-z', '9', `${WORK}/${name}.png`, '-o', `${IMG}/${name}.webp`]);
  };
  for (const name of Object.keys(seasons)) write(`trees-${name}`, seasons[name].list, false);
  write('trees-bare', seasons.winter.list, true);
  const sprites = {};
  base.forEach((s, n) => {
    sprites[s.key] = { x: place[n][0], y: place[n][1], w: s.w, h: s.h, ax: s.ax, ay: s.ay, sh: s.sh ? { rx: Math.round(s.sh.rx), ry: Math.round(s.sh.ry), dx: Math.round(s.sh.dx) } : null, foot: s.kind ? footOf(s) : 0 };
  });
  const A = seasons.summer.A;
  const kinds = {};
  for (const kind of [...ORDINARY, ...MAGIC]) {
    const def = A.TREES[kind];
    kinds[kind] = {
      magic: MAGIC.includes(kind),
      ever: Boolean(def.ever),
      bark: barkOf(base.find((s) => s.key === `${kind}-mature-1`)),
      leaf: (def.leaf ?? def.tuft ?? []).map(hex),
      fall: def.fall ? def.fall.map(hex) : null
    };
  }
  const palette = Object.fromEntries(Object.entries(A.P).filter(([, v]) => Array.isArray(v) && Array.isArray(v[0])).map(([k, v]) => [k, v.map(hex)]));
  return { atlas: [ATLAS_W, ATLAS_H], sprites, kinds, palette, A };
}
