import { noise, fbm, smooth, hash } from '../../map-scale/probe/grid.mjs';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const LIGHT = [-1, -1, 1.25];
const LN = Math.hypot(...LIGHT);

function each(ctx, fn) {
  const { box, FW } = ctx;
  for (let y = box.y0; y < box.y1; y++)
    for (let x = box.x0; x < box.x1; x++) fn(x, y, y * FW + x);
}

function shading(ctx, height, reach) {
  const { FW, FH, foot } = ctx;
  const lambert = new Float32Array(FW * FH);
  const at = (x, y) => height[clamp(y, 0, FH - 1) * FW + clamp(x, 0, FW - 1)];
  each(ctx, (x, y, i) => {
    if (!foot[i]) return;
    const gx = (at(x + reach, y) - at(x - reach, y)) / (2 * reach),
      gy = (at(x, y + reach) - at(x, y - reach)) / (2 * reach);
    lambert[i] = (-gx * LIGHT[0] - gy * LIGHT[1] + LIGHT[2]) / (Math.hypot(gx, gy, 1) * LN) - LIGHT[2] / LN;
  });
  return lambert;
}

function turned(x, y, a, seed, sway = 8) {
  const wx = x + (fbm(x / 70, y / 70, seed, 2) - 0.5) * sway * 2,
    wy = y + (fbm(x / 70, y / 70, seed + 2, 2) - 0.5) * sway * 2;
  return [wx * Math.cos(a) + wy * Math.sin(a), -wx * Math.sin(a) + wy * Math.cos(a)];
}

function roundRect(qx, qy, hx, hy, r) {
  const dx = qx - hx + r,
    dy = qy - hy + r;
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - r;
}

function scatter(ctx, cell, seed, pick) {
  const { box, FW } = ctx;
  const out = [];
  for (let gy = box.y0; gy < box.y1; gy += cell)
    for (let gx = box.x0; gx < box.x1; gx += cell) {
      const x = gx + Math.floor(hash(gx, gy, seed) * cell),
        y = gy + Math.floor(hash(gx, gy, seed + 1) * cell);
      if (x >= box.x1 || y >= box.y1) continue;
      const p = pick(x, y, y * FW + x, hash(gx, gy, seed + 2));
      if (p) out.push({ x, y, seed: 1 + Math.floor(hash(gx, gy, seed + 3) * 4), ...p });
    }
  return out;
}

function creeps(ctx, x, y, i, reach, seed) {
  return ctx.dist[i] < reach * (0.2 + 1.05 * fbm(x / 22, y / 22, seed, 3));
}

const turfTone = (x, y, seed) => 0.44 + (fbm(x / 48, y / 48, seed, 2) - 0.5) * 0.36;

export function tor(ctx, o = {}) {
  const { A, FW, FH, foot, dist } = ctx;
  const P = A.P;
  const SU = o.su ?? 76,
    SV = o.sv ?? 54;
  const size = FW * FH;
  const body = ctx.blur(dist, FW, FH, 24, 2);
  const height = new Float32Array(size),
    pillow = new Float32Array(size),
    slot = new Uint8Array(size),
    open = new Uint8Array(size),
    block = new Int32Array(size).fill(-1);
  each(ctx, (x, y, i) => {
    if (!foot[i]) return;
    const [u, v] = turned(x, y, o.turn ?? 0.42, 11, 5);
    const cu = Math.floor(u / SU),
      off = hash(cu, 0, 17) * SV,
      cv = Math.floor((v + off) / SV);
    let lu = u - cu * SU,
      lv = v + off - cv * SV,
      hu = SU / 2,
      hv = SV / 2,
      id = cu * 4099 + cv;
    const a = o.turn ?? 0.42,
      uc = (cu + 0.5) * SU,
      vc = (cv + 0.5) * SV - off;
    const cx = clamp(Math.round(uc * Math.cos(a) - vc * Math.sin(a)), 0, FW - 1),
      cy = clamp(Math.round(uc * Math.sin(a) + vc * Math.cos(a)), 0, FH - 1);
    const stack = fbm(cx / 120, cy / 120, 13, 3) + smooth(30, 180, body[cy * FW + cx]) * 0.22;
    const crowd = stack > (o.stack ?? 0.63) ? 1 : 0;
    open[i] = crowd ? 0 : 1;
    let gap = crowd ? 1.5 + 2.5 * hash(cu, cv, 19) : 2 + 2.5 * hash(cu, cv, 19);
    const parts = crowd ? (hash(cu, cv, 23) > 0.55 ? 2 : 1) : hash(cu, cv, 21) > 0.45 ? 3 : 2;
    if (parts > 1) {
      const su = Math.min(parts - 1, Math.floor((lu * parts) / SU)),
        sv = Math.min(parts - 1, Math.floor((lv * parts) / SV));
      hu = SU / parts / 2;
      hv = SV / parts / 2;
      lu -= su * hu * 2;
      lv -= sv * hv * 2;
      id = id * 9 + su * 3 + sv + 7;
      if (!crowd && hash(id, 1, 25) > (o.clitter ?? 0.9) * smooth(0.5, 0.64, fbm(cx / 70, cy / 70, 24, 2) + (stack - 0.45) * 0.6)) return;
      if (!crowd) {
        lu += (hash(id, 6, 26) - 0.5) * 6;
        lv += (hash(id, 7, 27) - 0.5) * 6;
      }
    }
    const r = Math.min(hu, hv) * (crowd ? 0.32 : 0.7);
    const sdf = roundRect(Math.abs(lu - hu), Math.abs(lv - hv), hu - gap, hv - gap, r);
    if (sdf >= 0) {
      if (crowd && gap < 4.2) slot[i] = 1;
      return;
    }
    let tall = crowd ? ((o.low ?? 7) + (o.high ?? 11) * smooth(0.6, 0.9, stack)) * (0.75 + 0.5 * hash(id, 2, 29)) : 3 + 3 * hash(id, 2, 29);
    let shoulder = smooth(0, 5, -sdf);
    if (crowd && hash(id, 3, 31) > 0.55) {
      const upper = sdf + 9 + 8 * hash(id, 4, 33);
      if (upper < 0) {
        tall += 5 + 4 * hash(id, 5, 35);
        shoulder = 1 + smooth(0, 4, -upper);
      }
    }
    height[i] = Math.min(Math.round(tall), dist[i] * 0.9);
    pillow[i] = shoulder;
    block[i] = id;
  });
  const lift = new Float32Array(size);
  for (let i = 0; i < size; i++) lift[i] = pillow[i] * 5;
  const lambert = shading(ctx, lift, 1);
  const shadowed = (x, y) => {
    for (let k = 1; k <= 5; k++) {
      const j = (y - k) * FW + x - k;
      if (block[j] >= 0 && height[j] > k * 1.6) return true;
    }
    return false;
  };
  const S = o.rock ?? P.stone;
  const colour = (x, y, r, k, span) => {
    const i = y * FW + x;
    if (k > 0 && span >= 4) {
      let t = 0.36 - (k / span) * 0.1;
      if (block[i - 1] < 0 || height[i - 1] < height[i] - 2) t += 0.12;
      else if (block[i + 1] < 0 || height[i + 1] < height[i] - 2) t -= 0.08;
      if (span >= 12 && k === Math.round(span * 0.45)) t -= 0.1;
      if (k === span - 1) t -= 0.1;
      return A.rp(S, t, x, r, 0.1);
    }
    if (block[i] < 0) {
      if (slot[i] && dist[i] > 10) return A.rp(S, 0.06, x, r, 0);
      return A.rp(o.turf ?? P.grassDry, shadowed(x, y) ? 0.12 : turfTone(x, y, 39) - 0.06, x, r, 0.05);
    }
    const l = lambert[i];
    const t = 0.6 + (l > 0 ? l * 1.2 : l * 1.1);
    const patch = fbm(x / 15, y / 15, 41, 2);
    if (l < -0.1 && patch > 0.58) return A.rp(P.moss, 0.22 + t * 0.3, x, r, 0);
    if (l > -0.05 && patch > (o.lichen ?? 0.7)) return A.rp(P.bone, t - 0.12, x, r, 0);
    return A.rp(S, t, x, r, 0.05);
  };
  const plants = scatter(ctx, 50, 43, (x, y, i, roll) => {
    if (block[i] >= 0 || slot[i] || !foot[i] || dist[i] < 12) return null;
    if (roll < 0.08) return { plant: 'fern' };
    if (roll < 0.11) return { plant: 'scrub' };
    return null;
  });
  return { height, colour, plants };
}

export function pavement(ctx, o = {}) {
  const { A, FW, FH, foot, dist } = ctx;
  const P = A.P;
  const size = FW * FH;
  const T = o.terrace ?? 92,
    SW = o.strip ?? 40,
    RISE = o.rise ?? 12,
    TOP = o.levels ?? 2,
    ROUND = 5;
  const height = new Float32Array(size),
    level = new Uint8Array(size),
    kind = new Uint8Array(size),
    edge = new Int8Array(size),
    clint = new Int32Array(size);
  const K = { slab: 0, grike: 1, green: 2, turf: 3 };
  const merged = (s) => hash(s, 0, 51) > 0.6;
  each(ctx, (x, y, i) => {
    if (!foot[i]) return;
    const raw = (dist[i] + (fbm(x / 130, y / 130, 51, 3) - 0.5) * 44) / T;
    const lev = clamp(Math.floor(raw), 0, TOP);
    level[i] = lev;
    height[i] = lev * RISE;
    const [u, v] = turned(x, y, o.turn ?? 0.3, 53, 2.5);
    const strip = Math.floor(v / SW),
      sv = v - strip * SW;
    const L = 50 + 80 * hash(strip, 2, 55);
    const uu = u + hash(strip, 1, 57) * L + (sv - SW / 2) * (hash(strip, 3, 57) - 0.5) * 0.7;
    const cell = Math.floor(uu / L),
      su = uu - cell * L;
    const open = hash(strip, cell, 59) < 0.66,
      close = hash(strip, cell + 1, 59) < 0.66;
    const top = merged(strip) ? 99 : sv,
      bottom = merged(strip + 1) ? 99 : SW - sv,
      west = open ? su : 99,
      east = close ? L - su : 99;
    const du = Math.min(west, east),
      dv = Math.min(top, bottom);
    const d = du < ROUND && dv < ROUND ? ROUND - Math.hypot(ROUND - du, ROUND - dv) : Math.min(du, dv);
    const wide = noise(x / 70, y / 70, 63) > 0.6;
    const gr = wide ? 2.2 : 1.1;
    clint[i] = strip * 8191 + (open ? cell : cell - 1);
    const till = fbm(x / 120, y / 120, 65, 3) + (fbm(x / 14, y / 14, 66, 2) - 0.5) * 0.12;
    if (creeps(ctx, x, y, i, o.creep ?? 24, 67) || till > 0.66) {
      if (!(till < 0.7 && d > gr + 2 && hash(clint[i], 9, 81) > 0.4)) {
        kind[i] = K.turf;
        return;
      }
    }
    if (d < gr) {
      kind[i] = wide || hash(clint[i], 4, 71) > 0.62 ? K.green : K.grike;
      return;
    }
    if (d < gr + 1.6) edge[i] = Math.min(top, west) < Math.min(bottom, east) ? 1 : -1;
  });
  const S = o.rock ?? P.concrete;
  const colour = (x, y, r, k, span) => {
    const i = y * FW + x;
    if (k > 0 && span >= 4) {
      let t = 0.5 - (k / span) * 0.16;
      if (kind[i] === K.grike || kind[i] === K.green) t -= 0.16;
      if (k === span - 1) t -= 0.12;
      return A.rp(S, t, x, r, 0.1);
    }
    const scar = (foot[i - FW] && level[i - FW] < level[i]) || (foot[i - 1] && level[i - 1] < level[i]);
    switch (kind[i]) {
      case K.turf:
        return A.rp(o.turf ?? P.grass, turfTone(x, y, 73), x, r, 0.05);
      case K.green:
        return A.rp(P.moss, 0.28 + (fbm(x / 30, y / 30, 75, 2) - 0.5) * 0.3, x, r, 0);
      case K.grike:
        return A.rp(S, 0.08, x, r, 0);
      default: {
        let t = 0.62 + (hash(clint[i], 2, 77) - 0.5) * 0.08 + Math.round((fbm(x / 50, y / 50, 79, 3) - 0.5) * 3) * 0.08;
        if (scar) t += 0.2;
        else if (edge[i] > 0) t += 0.07;
        else if (edge[i] < 0) t -= 0.09;
        return A.rp(S, t, x, r, 0);
      }
    }
  };
  const plants = scatter(ctx, 54, 83, (x, y, i, roll) => {
    if (!foot[i] || dist[i] < 16) return null;
    if (kind[i] === K.green && roll < 0.22) return { plant: roll < 0.07 ? 'bush' : 'fern', lift: height[i] };
    if (kind[i] === K.turf && roll < 0.04) return { plant: 'bush', lift: height[i] };
    return null;
  });
  return { height, colour, plants };
}

export function knoll(ctx, o = {}) {
  const { A, FW, FH, foot, dist } = ctx;
  const P = A.P;
  const size = FW * FH;
  const TOP = o.top ?? 40,
    SHEET = o.sheet ?? 13;
  const dome = new Float32Array(size),
    height = new Float32Array(size),
    sheet = new Int16Array(size),
    lip = new Uint8Array(size),
    kind = new Uint8Array(size);
  const K = { rock: 0, moss: 1, soil: 2, crack: 3, turf: 4 };
  each(ctx, (x, y, i) => {
    if (!foot[i]) return;
    dome[i] = TOP * (1 - Math.exp(-dist[i] / (o.reach ?? 95))) * (0.7 + 0.6 * fbm(x / 260, y / 260, 81, 2));
  });
  const soft = ctx.blur(dome, FW, FH, 6, 2);
  each(ctx, (x, y, i) => {
    if (!foot[i]) return;
    const lvl = Math.floor((soft[i] + (fbm(x / 50, y / 50, 83, 3) - 0.5) * 22) / SHEET);
    const on = smooth(0.42, 0.5, noise(x / 110, y / 110, 85));
    sheet[i] = lvl;
    lip[i] = on > 0.5 ? 1 : 0;
    height[i] = Math.min(dist[i] * 0.9, soft[i] * 0.35);
  });
  const relief = new Float32Array(size);
  for (let i = 0; i < size; i++) relief[i] = soft[i] * (o.relief ?? 3);
  const lambert = shading(ctx, relief, 3);
  each(ctx, (x, y, i) => {
    if (!foot[i]) return;
    const l = lambert[i];
    if (creeps(ctx, x, y, i, o.creep ?? 26, 87)) {
      kind[i] = K.turf;
      return;
    }
    const mat = fbm(x / 70, y / 70, 89, 3) + (fbm(x / 18, y / 18, 90, 2) - 0.5) * 0.08 + (l < -0.05 ? 0.05 : 0) + (1 - smooth(20, 70, dist[i])) * 0.1;
    if (mat > 0.72) kind[i] = K.soil;
    else if (mat > 0.62) kind[i] = K.moss;
    if (dist[i] < 20) return;
    const c = Math.abs(noise(x / 170, y / 170, 91) - 0.5);
    const on = noise(x / 80, y / 80, 93) > 0.5;
    if (on && c < 0.0022) kind[i] = K.crack;
    else if (on && c < 0.0065 && kind[i] === K.rock) kind[i] = K.moss;
  });
  const S = o.rock ?? P.stone;
  const colour = (x, y, r, k, span) => {
    const i = y * FW + x;
    if (k > 0 && span >= 4) {
      let t = 0.4 - (k / span) * 0.14 + lambert[i] * 0.4;
      if (k === span - 1) t -= 0.12;
      return A.rp(S, t, x, r, 0.1);
    }
    const l = lambert[i];
    switch (kind[i]) {
      case K.turf:
        return A.rp(o.turf ?? P.grassLoam, turfTone(x, y, 95), x, r, 0.05);
      case K.soil:
        return A.rp(P.grassLoam, 0.3 + l * 0.6, x, r, 0);
      case K.moss:
        return A.rp(P.moss, 0.3 + l * 0.7, x, r, 0);
      case K.crack:
        return A.rp(S, 0.04, x, r, 0);
      default: {
        let t = (o.key ?? 0.62) + Math.round((l > 0 ? l * 1.2 : l * 1.1) * 5) / 5;
        if (lip[i]) {
          const below = (j) => foot[j] && sheet[j] < sheet[i];
          const above = (j) => foot[j] && sheet[j] > sheet[i];
          if (below(i + 2 * FW) || below(i + 2) || below(i + FW) || below(i + 1)) t += 0.18;
          else if (above(i - 2 * FW) || above(i - 2) || above(i - 3 * FW - 3)) t -= 0.2;
        }
        return A.rp(S, t, x, r, 0);
      }
    }
  };
  const plants = scatter(ctx, 44, 101, (x, y, i, roll) => {
    if (!foot[i] || dist[i] < 16) return null;
    if (kind[i] === K.soil && roll < 0.24) return roll < 0.1 ? { tree: 'pine', f: 0.9 + roll * 5, lift: height[i] } : { plant: roll < 0.17 ? 'bush' : 'scrub', lift: height[i] };
    if (kind[i] === K.crack && roll < 0.2) return { plant: 'fern', lift: height[i] };
    return null;
  });
  return { height, colour, plants };
}
