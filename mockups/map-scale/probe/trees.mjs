import { readFileSync } from 'node:fs';

const SCOPE = '({ Spr, canopy, trunk2, limb, rng, noise, hash, clamp, dark, lit, rp, dith, P, TREES, mkTree, mkPlant, mkPawn, PAWNS, decal })';

export async function loadArt(TREE) {
  const { BAKE_ART } = await import(`${TREE}/tools/tileset/sources.mjs`);
  const source = BAKE_ART.map((f) => readFileSync(`${TREE}/tools/tileset/art/${f}`, 'utf8').replace(/^'use strict';\n/, '')).join('\n');
  return new Function('ART_PERIOD', `'use strict';\n${source}\nreturn ${SCOPE};`)(4096);
}

function finish(A, s, wood, leafDark, shadow) {
  for (let y = 1; y < s.h - 1; y++)
    for (let x = 1; x < s.w - 1; x++) {
      const i = y * s.w + x;
      if (!s.c[i] && s.c[i - 1] && s.c[i + 1] && s.c[i - s.w] && s.c[i + s.w]) s.c[i] = s.c[i - 1];
    }
  s.outline(leafDark);
  s.crown = new Uint8Array(s.w * s.h);
  for (let i = 0; i < s.c.length; i++) if (s.c[i] && s.c[i] !== wood[i]) s.crown[i] = 1;
  s.sh = { rx: shadow * 1.12, ry: shadow * 0.44, dx: 8 + shadow * 0.08, dy: 0 };
  return s;
}

function shadeUnder(A, s, wood, reach) {
  for (let x = 0; x < s.w; x++) {
    let under = 0;
    for (let y = 0; y < s.h; y++) {
      const i = y * s.w + x;
      if (s.c[i] && s.c[i] !== wood[i]) under = reach;
      else if (s.c[i] && under > 0) {
        s.c[i] = A.dark(s.c[i], under > reach / 2 ? 0.55 : 0.75);
        under--;
      }
    }
  }
}

function stem(A, w, h, base, k, seed, height, girth) {
  const s = new A.Spr(w, h, w >> 1, base);
  A.trunk2(s, w >> 1, base, height, girth, k.trunk, seed);
  return s;
}

function round(A, k, seed, f, weeping) {
  const r = A.rng(seed * 31 + 7);
  const rx = k.rx * f,
    ry = k.ry * f * 0.94,
    th = k.th * Math.pow(f, 1.22),
    tw = Math.min(27, k.tw * Math.pow(f, 0.85));
  const w = Math.ceil(rx * 2.7) + 28,
    h = Math.ceil(th + ry * 2.3) + 30,
    base = h - 8,
    cx = w >> 1,
    cy = base - th - ry * 0.55;
  const s = stem(A, w, h, base, k, seed, th + ry * 0.55, tw);
  const boughs = Math.round(2 + f * 1.4);
  for (let i = 0; i < boughs; i++) {
    const side = i % 2 ? 1 : -1,
      from = base - th * (0.62 + r() * 0.36);
    A.limb(s, cx + side, from, cx + side * rx * (0.2 + r() * 0.26), cy + ry * (r() * 0.3), Math.max(2, Math.round(tw * 0.28)), k.trunk, r, f > 2.4 ? 1 : 0);
  }
  s.outline(A.dark(k.trunk[0], 0.5));
  const wood = s.c.slice();
  const cr = 4.6 * Math.pow(f, 0.42),
    balls = (a, b) => Math.round(a * b * 0.13 * Math.pow(4.6 / cr, 2) * 1.25);
  A.canopy(s, cx, cy, rx * 0.8, ry * 0.8, k.leaf, seed, { cr, n: balls(rx * 0.8, ry * 0.8) });
  const lobes = Math.round(3 + f * 2.2);
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * 6.283 + r() * 0.7,
      d = 0.5 + r() * 0.22,
      lx = rx * (0.4 + r() * 0.14),
      ly = ry * (0.4 + r() * 0.14);
    A.canopy(s, cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d + 2, lx, ly, k.leaf, seed + 40 + i, { z: Math.sin(a) * 5 * f + 3, cr, n: balls(lx, ly) });
  }
  if (weeping) {
    const n = k.leaf.length - 1;
    for (let x = Math.round(cx - rx); x <= cx + rx; x++) {
      if (A.hash(x >> 1, seed, 2) < 0.18) continue;
      let y = Math.round(cy - 4);
      while (y < base && !(s.get(x, y) && s.z[y * s.w + x] > -1e8)) y++;
      while (y < base && s.get(x, y) && s.z[y * s.w + x] > -1e8) y++;
      const len = (10 + A.hash(x >> 1, seed, 4) * 22 * (1 - Math.abs(x - cx) / (rx * 1.7))) * Math.pow(f, 0.9),
        tone = A.hash(x >> 1, seed, 6) < 0.5 ? n - 2 : n - 3;
      for (let j = 0; j < len && y + j < base - 2; j++) s.set(x, y + j, k.leaf[A.clamp(tone + (j > len - 4 ? 1 : 0) - (x & 1 ? 1 : 0), 0, n)]);
    }
  }
  shadeUnder(A, s, wood, Math.round(7 * Math.pow(f, 0.7)));
  return finish(A, s, wood, A.dark(k.leaf[0], 0.5), rx * 1.02);
}

function pine(A, k, seed, f) {
  const r = A.rng(seed * 31 + 7);
  const tiers = Math.round(5 * Math.pow(f, 0.75)),
    tall = 84 * Math.pow(f, 0.97),
    reach = 26.2 * Math.pow(f, 0.78),
    deep = 26 * Math.pow(f, 0.45),
    bare = 2 + 11 * (f - 1);
  const w = Math.ceil(reach * 2) + 30,
    h = Math.ceil(tall) + 26,
    base = h - 8,
    cx = w >> 1;
  const s = stem(A, w, h, base, k, seed, bare + deep * 0.8, Math.min(22, 6 * Math.pow(f, 0.85)));
  s.outline(A.dark(k.trunk[0], 0.5));
  const wood = s.c.slice();
  const top = base - tall + Math.floor(r() * 5),
    step = (base - bare - deep - top) / (tiers - 1),
    n = k.leaf.length - 1,
    stripe = Math.max(4, Math.round(4 * Math.pow(f, 0.35)));
  for (let i = tiers - 1; i >= 0; i--) {
    const y0 = Math.round(top + i * step),
      y1 = Math.round(y0 + deep),
      hw = reach * (0.27 + (0.73 * i) / (tiers - 1));
    for (let y = y0; y <= y1; y++) {
      const g = (y - y0) / (y1 - y0),
        half = hw * g + 1.2;
      for (let x = Math.ceil(cx - half); x <= Math.floor(cx + half - 0.5); x++) {
        if (y1 - y < A.hash(x >> 1, i, seed) * 5) continue;
        const side = x < cx ? x + y : x - y,
          band = ((side % stripe) + stripe) % stripe;
        let t = 0.6 - ((x - cx) / hw) * 0.4 - g * 0.16 + (A.noise(x * 0.7, y * 0.7, seed) - 0.5) * 0.22;
        if (band === 0) t += 0.13;
        else if (band === stripe >> 1) t -= 0.07;
        if (y >= y1 - 5) t -= 0.22;
        s.set(x, y, k.leaf[A.clamp(Math.round(t * n), 0, n)]);
      }
    }
  }
  return finish(A, s, wood, A.dark(k.leaf[0], 0.5), reach * 0.62);
}

function birch(A, k, seed, f) {
  const r = A.rng(seed * 31 + 7);
  const tall = (62 + Math.floor(r() * 8)) * Math.pow(f, 0.97),
    puff = Math.pow(f, 0.8),
    clumps = Math.round(6 * Math.pow(f, 0.7));
  const w = Math.ceil(44 * puff) + 30,
    h = Math.ceil(tall + 16 * puff) + 24,
    base = h - 8,
    cx = w >> 1;
  const s = stem(A, w, h, base, k, seed, tall, Math.min(16, 5 * Math.pow(f, 0.85)));
  const spots = [];
  for (let i = 0; i < clumps; i++) {
    const cy = base - tall + 4 * puff + (i * tall * 0.72) / clumps,
      side = i % 2 ? 1 : -1,
      rr = (9.5 + r() * 3 - Math.abs(i - clumps / 3) * (3 / clumps)) * puff;
    if (i > 0) s.thick(cx, cy + 4 * puff, cx + side * 6 * puff, cy, Math.max(1, Math.round(puff)), k.trunk, 2);
    spots.push([cx + side * (5 + r() * 3) * puff, cy, rr, i]);
  }
  s.outline(A.dark(k.trunk[0], 0.5));
  const wood = s.c.slice();
  const cr = 3.8 * Math.pow(f, 0.42);
  for (const [x, y, rr, i] of spots) A.canopy(s, x, y, rr * 1.15, rr * 0.85, k.leaf, seed + i * 7, { cr, z: i, n: Math.round(rr * rr * 0.98 * 0.13 * Math.pow(4.6 / cr, 2) * 1.6) });
  shadeUnder(A, s, wood, Math.round(7 * Math.pow(f, 0.7)));
  return finish(A, s, wood, A.dark(k.leaf[0], 0.5), 12 * puff);
}

function snag(A, k, seed, f) {
  const r = A.rng(seed * 31 + 7);
  const tall = (42 + r() * 10) * Math.pow(f, 0.95),
    span = Math.pow(f, 0.9);
  const w = Math.ceil(70 * span) + 20,
    h = Math.ceil(tall + 30 * span) + 20,
    base = h - 8,
    cx = w >> 1;
  const s = stem(A, w, h, base, k, seed, tall, Math.min(20, 7 * Math.pow(f, 0.85)));
  const arms = Math.round(5 * Math.pow(f, 0.6));
  for (let i = 0; i < arms; i++) {
    const side = i % 2 ? 1 : -1,
      y0 = base - tall + (4 + (i * 25) / arms + r() * 3) * span,
      len = (12 + r() * 10) * span;
    A.limb(s, cx, y0, cx + side * len, y0 - len * (0.6 + r() * 0.5), Math.max(2, Math.round(2 * Math.pow(f, 0.6))), k.trunk, r, 2);
  }
  A.limb(s, cx, base - tall + 2, cx + (r() - 0.5) * 8 * span, base - tall - 16 * span, 3, k.trunk, r, 2);
  s.outline(A.dark(k.trunk[0], 0.5));
  s.crown = new Uint8Array(s.w * s.h);
  s.sh = { rx: 9 * span, ry: 4 * span, dx: 8, dy: 0 };
  return s;
}

export function growTree(A, kind, seed, f) {
  const k = A.TREES[kind];
  if (k.shape === 'dead') return snag(A, k, seed, f);
  if (k.shape === 'pine') return pine(A, k, seed, f);
  if (k.shape === 'birch') return birch(A, k, seed, f);
  return round(A, k, seed, f, k.shape === 'willow');
}
