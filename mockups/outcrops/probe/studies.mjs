import { writeFileSync, mkdirSync } from 'node:fs';
import { hash, noise, fbm, smooth } from '../../map-scale/probe/grid.mjs';
import { loadArt } from '../../map-scale/probe/trees.mjs';

const [, , TREE, OUT] = process.argv;
const A = await loadArt(TREE);
const { encodePng } = await import(`${TREE}/tools/tileset/png.mjs`);
const P = A.P;
const W = 168,
  H = 112;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function canvas() {
  const px = new Uint8Array(W * H * 3);
  const put = (x, y, c) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    px.set(c, (y * W + x) * 3);
  };
  const tone = (ramp, t) => ramp[clamp(Math.round(t * (ramp.length - 1)), 0, ramp.length - 1)];
  const ground = (ramp, seed, base = 0.45) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, tone(ramp, base + Math.round((fbm(x / 22, y / 22, seed, 2) - 0.5) * 3) * 0.12));
  };
  const save = (name) => {
    const out = new Uint8Array(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      out.set(px.subarray(i * 3, i * 3 + 3), i * 4);
      out[i * 4 + 3] = 255;
    }
    writeFileSync(`${OUT}/study-${name}.png`, encodePng(W, H, out, 6));
  };
  return { put, tone, ground, save };
}

function block(c, ramp, x0, y0, w, h, lift, o = {}) {
  const r = o.round ?? Math.min(w, h) * 0.3;
  const inside = (x, y) => {
    const qx = Math.abs(x - (w - 1) / 2) - (w - 1) / 2 + r,
      qy = Math.abs(y - (h - 1) / 2) - (h - 1) / 2 + r;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r <= 0;
  };
  for (let y = -1; y < h + lift + 2; y++)
    for (let x = -1; x < w + 3; x++) if (inside(x - 2, y - lift - 2) && !inside(x, y)) c.put(x0 + x, y0 + y, c.tone(o.shadow ?? P.soilRich, 0.1));
  for (let k = lift; k > 0; k--)
    for (let x = 0; x < w; x++)
      for (let y = h - 1; y >= 0; y--)
        if (inside(x, y)) {
          const t = 0.34 - (k / lift) * 0.12 + (x < w * 0.25 ? 0.1 : 0) - (o.bed && k === Math.ceil(lift / 2) ? 0.1 : 0);
          c.put(x0 + x, y0 + y - lift + k, c.tone(ramp, t));
          break;
        }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      const nw = !inside(x - 1, y) || !inside(x, y - 1),
        se = !inside(x + 1, y) || !inside(x, y + 1);
      let t = nw ? 0.84 : se ? 0.46 : 0.66;
      if (o.lichen && !nw && !se && fbm((x0 + x) / 5, (y0 + y) / 5, o.lichen, 2) > 0.66) {
        c.put(x0 + x, y0 + y - lift, c.tone(P.bone, 0.62));
        continue;
      }
      c.put(x0 + x, y0 + y - lift, c.tone(ramp, t));
    }
}

function canopy(c, cx, cy, r, ramp) {
  for (let y = -r - 1; y <= r + 2; y++)
    for (let x = -r - 1; x <= r + 3; x++) if (Math.hypot(x - 2, y - 2) <= r && Math.hypot(x, y) > r) c.put(cx + x, cy + y, c.tone(P.soilRich, 0));
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++) {
      const d = Math.hypot(x, y);
      if (d > r) continue;
      const lit = Math.hypot(x + r * 0.4, y + r * 0.4) < r * 0.55;
      c.put(cx + x, cy + y, c.tone(ramp, d > r - 1 ? 0.15 : lit ? 0.7 : 0.42));
    }
}

function tor() {
  const c = canvas();
  c.ground(P.grassDry, 3, 0.4);
  const stones = [];
  for (let k = 0; k < 70; k++) {
    const a = hash(k, 1, 5) * Math.PI * 2,
      d = 26 + hash(k, 2, 5) * 46;
    const x = 84 + Math.cos(a) * d * 1.3 + 18,
      y = 50 + Math.sin(a) * d * 0.8 + 14;
    if (Math.sin(a) < -0.4 && hash(k, 3, 5) > 0.3) continue;
    stones.push([x, y, 3 + Math.floor(hash(k, 4, 5) * 5)]);
  }
  const blocks = [
    [56, 34, 20, 14, 9],
    [76, 33, 16, 15, 12],
    [93, 37, 17, 12, 8],
    [62, 49, 24, 13, 6],
    [86, 50, 18, 12, 5],
    [70, 23, 14, 11, 16],
    [84, 24, 11, 10, 13],
    [112, 46, 12, 9, 4],
    [48, 50, 11, 9, 3]
  ];
  const all = [...stones.map(([x, y, s]) => [x, y, s + 1, s, 2]), ...blocks].sort((p, q) => p[1] + p[3] - (q[1] + q[3]));
  for (const [x, y, w, h, lift] of all) block(c, P.stone, x, y, w, h, lift, { lichen: w > 9 ? 41 : 0, bed: lift > 10 });
  c.save('tor');
}

function pavement() {
  const c = canvas();
  const S = P.concrete;
  const scar = (x) => 74 + Math.round((noise(x / 30, 0, 7) - 0.5) * 10);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const s = scar(x);
      if (y >= s + 10) {
        c.put(x, y, c.tone(P.grass, 0.45 + Math.round((fbm(x / 20, y / 20, 9, 2) - 0.5) * 3) * 0.12));
        continue;
      }
      if (y >= s) {
        const k = y - s;
        let t = 0.48 - k * 0.025;
        if (hash(Math.floor(x / 9), 0, 11) > 0.6 && x % 9 === 0) t -= 0.2;
        if (k === 9) t = 0.1;
        c.put(x, y, c.tone(S, t));
        continue;
      }
      const u = x * 0.96 + y * 0.28,
        v = -x * 0.28 + y * 0.96;
      const strip = Math.floor(v / 13),
        sv = v - strip * 13;
      const L = 22 + 20 * hash(strip, 0, 13),
        uu = u + hash(strip, 1, 13) * L,
        cell = Math.floor(uu / L),
        su = uu - cell * L;
      const grike = (sv < 1.2 && hash(strip, 2, 13) < 0.7) || (su < 1.2 && hash(strip, cell, 15) < 0.7);
      const green = grike && hash(strip, cell, 17) > 0.45;
      if (fbm(x / 26, y / 26, 19, 3) > 0.66 && sv > 2) c.put(x, y, c.tone(P.grass, 0.4));
      else if (green) c.put(x, y, c.tone(P.moss, 0.3));
      else if (grike) c.put(x, y, c.tone(S, 0.06));
      else c.put(x, y, c.tone(S, (y === s - 1 ? 0.86 : 0.62) + (sv < 2.4 || su < 2.4 ? 0.08 : 0) + (hash(strip, cell, 21) - 0.5) * 0.08));
    }
  for (let k = 0; k < 26; k++) {
    const x = 6 + hash(k, 1, 23) * 156,
      y = scar(Math.round(x)) + 11 + hash(k, 2, 23) * 10 * (1 - k / 30);
    block(c, S, x, y, 4 + Math.floor(hash(k, 3, 23) * 4), 3 + Math.floor(hash(k, 4, 23) * 3), 1, { round: 1.5 });
  }
  canopy(c, 40, 30, 5, P.oak);
  canopy(c, 118, 52, 4, P.ash);
  c.save('pavement');
}

function edge() {
  const c = canvas();
  const lip = (x) => 40 + Math.round((noise(x / 40, 0, 31) - 0.5) * 12);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const l = lip(x);
      if (y < l) c.put(x, y, c.tone(P.leather, 0.3 + Math.round((fbm(x / 14, y / 14, 33, 2) - 0.5) * 3) * 0.14 + (y === l - 1 ? 0.4 : 0)));
      else c.put(x, y, c.tone(P.grassLoam, 0.42 + Math.round((fbm(x / 18, y / 18, 35, 2) - 0.5) * 3) * 0.14));
    }
  for (let x = 0; x < W; x++) {
    const l = lip(x),
      bay = Math.floor(x / 11 + hash(Math.floor(x / 11), 0, 37) * 0.3),
      depth = 16 + Math.round(hash(bay, 1, 37) * 6);
    for (let k = 0; k < depth; k++) {
      let t = 0.5 - (k / depth) * 0.22;
      if (x % 11 === 0 && hash(bay, 2, 37) > 0.3) t -= 0.22;
      if (k % 6 === 5) t -= 0.08;
      if (k === depth - 1) t = 0.08;
      c.put(x, l + k, c.tone(P.rockWarm, t));
    }
  }
  const skirt = [];
  for (let k = 0; k < 60; k++) {
    const x = hash(k, 1, 39) * W,
      d = Math.pow(hash(k, 2, 39), 1.6) * 44;
    skirt.push([x, lip(Math.round(clamp(x, 0, W - 1))) + 20 + d, Math.round(9 - d / 7)]);
  }
  skirt.sort((p, q) => p[1] - q[1]);
  for (const [x, y, s] of skirt) block(c, P.rockWarm, x, y, s + 2, Math.max(3, s - 1), Math.max(1, Math.round(s / 3)), { round: 1.5 });
  c.save('edge');
}

function knoll() {
  const c = canvas();
  c.ground(P.grassLoam, 51, 0.36);
  const cx = 84,
    cy = 56;
  const r = (x, y) => Math.hypot((x - cx) / 62, (y - cy) / 38) + (fbm(x / 16, y / 16, 53, 2) - 0.5) * 0.24;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = r(x, y);
      if (d > 1) continue;
      const gx = (x - cx) / 62,
        gy = (y - cy) / 38;
      let t = 0.62 - Math.round((gx + gy) * 2.4) * 0.09 - (d > 0.9 ? 0.1 : 0);
      const sheet = Math.floor((1 - d) * 5 + (fbm(x / 20, y / 20, 55, 2) - 0.5) * 1.2);
      const next = Math.floor((1 - r(x + 1, y + 1)) * 5 + (fbm((x + 1) / 20, (y + 1) / 20, 55, 2) - 0.5) * 1.2);
      if (next < sheet && noise(x / 30, y / 30, 57) > 0.45) t += 0.2;
      const mat = fbm(x / 18, y / 18, 59, 3) + (d > 0.8 ? 0.12 : 0);
      if (mat > 0.68) c.put(x, y, c.tone(P.moss, 0.32 - (gx + gy) * 0.2));
      else c.put(x, y, c.tone(P.stone, t));
    }
  const trees = [];
  for (let k = 0; k < 90; k++) {
    const x = hash(k, 1, 61) * W,
      y = hash(k, 2, 61) * H;
    const d = r(x, y);
    if (d < 1.12 && !(k % 13 === 0 && d < 0.8 && fbm(x / 18, y / 18, 59, 3) > 0.62)) continue;
    trees.push([x, y, d < 1 ? 3 : 4 + Math.floor(hash(k, 3, 61) * 4), d < 1 ? P.pine : hash(k, 4, 61) > 0.5 ? P.pine : P.oak]);
  }
  trees.sort((p, q) => p[1] - q[1]);
  for (const [x, y, s, ramp] of trees) canopy(c, Math.round(x), Math.round(y), s, ramp);
  c.save('knoll');
}

mkdirSync(OUT, { recursive: true });
tor();
pavement();
edge();
knoll();
console.log('wrote studies to', OUT);
