import { readFileSync } from 'node:fs';

const SCOPE = '({ Spr, P, R, rp, dark, lit, hash, noise, clamp, rng, LV, TREES, mkTree, mkPawn, PAWNS })';

export async function loadArt(TREE) {
  const { BAKE_ART } = await import(`${TREE}/tools/tileset/sources.mjs`);
  const source = BAKE_ART.map((f) => readFileSync(`${TREE}/tools/tileset/art/${f}`, 'utf8').replace(/^'use strict';\n/, '')).join('\n');
  return new Function('ART_PERIOD', `'use strict';\n${source}\nreturn ${SCOPE};`)(4096);
}

export function brushes(A) {
  const { clamp, noise, rp, dark, LV, rng } = A;

  const mode = { k: 2, p: 0 };
  const put = (s, x, y, c, z) => {
    x = Math.round(x);
    y = Math.round(y);
    if (!s.ok(x, y)) return false;
    const i = y * s.w + x;
    if (z < s.z[i]) return false;
    s.z[i] = z;
    s.c[i] = c;
    s.e[i] = 0;
    if (s.kind) {
      s.kind[i] = mode.k;
      s.ph[i] = mode.p;
    }
    return true;
  };
  const tag = (s) => {
    s.kind = new Uint8Array(s.w * s.h);
    s.ph = new Uint8Array(s.w * s.h);
    return s;
  };
  const as = (k, p, fn) => {
    const was = { ...mode };
    mode.k = k;
    mode.p = p & 255;
    fn();
    Object.assign(mode, was);
  };
  const stamp = (s, box, kind, ph, fn) => {
    const x0 = Math.max(0, Math.floor(box[0])),
      y0 = Math.max(0, Math.floor(box[1])),
      x1 = Math.min(s.w - 1, Math.ceil(box[2])),
      y1 = Math.min(s.h - 1, Math.ceil(box[3]));
    const before = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) before.push(s.c[y * s.w + x]);
    fn();
    if (!s.kind) return;
    let n = 0;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++, n++) {
        const i = y * s.w + x;
        if (s.c[i] !== before[n]) {
          s.kind[i] = kind;
          s.ph[i] = ph & 255;
        }
      }
  };

  const furrow = (dx, y, seed, fx, fy, bands, edge) => {
    const q = noise(dx * fx + 40, y * fy, seed) * bands,
      f = q - Math.floor(q);
    return { crack: f < edge, plate: Math.floor(q) & 1, f };
  };

  function bole(s, o) {
    const { cx, base, h, w0, w1, seed } = o,
      flare = o.flare ?? 7,
      lean = o.lean ?? 0,
      z0 = o.z ?? 0;
    const at = [];
    for (let j = 0; j <= h; j++) {
      const t = j / h,
        y = base - j,
        w = w0 + (w1 - w0) * Math.pow(t, 0.8) + (j < flare ? (Math.pow(flare - j, 2) / flare) * (o.root ?? 0.9) : 0),
        c = cx + lean * t * t + (noise(j * 0.045, 0.5, seed) - 0.5) * (o.wander ?? 2.4);
      at.push(c);
      const x0 = Math.round(c - w / 2),
        x1 = Math.round(c + w / 2);
      for (let x = x0; x < x1; x++) {
        const u = (x - x0 + 0.5) / Math.max(1, x1 - x0),
          round = Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
        as(o.kind ?? 1, 0, () => put(s, x, y, o.skin(x, y, u, j, x - c, t), z0 + (round * w) / 2));
      }
    }
    return (j) => at[clamp(Math.round(j), 0, h)];
  }

  function wood(s, x0, y0, x1, y1, w0, w1, ramp, z0, z1, seed, bend = 0, tone = 0) {
    const len = Math.hypot(x1 - x0, y1 - y0) || 1,
      n = Math.max(1, Math.ceil(len * 1.6)),
      nx = -(y1 - y0) / len,
      ny = (x1 - x0) / len;
    for (let i = 0; i <= n; i++) {
      const t = i / n,
        b = Math.sin(t * Math.PI) * bend,
        x = x0 + (x1 - x0) * t + nx * b,
        y = y0 + (y1 - y0) * t + ny * b,
        r = (w0 + (w1 - w0) * t) / 2,
        z = z0 + (z1 - z0) * t,
        R = Math.ceil(r);
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++) {
          if (r < 0.75 ? dx || dy : dx * dx + dy * dy > r * r + 0.3) continue;
          const l = r < 1 ? 0.1 : -(dx * 0.7 + dy * 0.6) / r,
            grain = (noise(t * len * 0.25, (dx * nx + dy * ny) * 0.8, seed) - 0.5) * 0.16;
          put(s, x + dx, y + dy, rp(ramp, 0.44 + l * 0.3 + grain + tone, x + dx, y + dy, 0.12), z + Math.sqrt(Math.max(0, r * r - dx * dx - dy * dy)));
        }
    }
  }

  function clump(s, cl, ramp, crown, o) {
    const pad = cl.r * 1.6 + o.cr * 2;
    const ph = cl.ph ?? Math.floor(((cl.x * 0.045 + cl.y * 0.02 + (cl.seed % 97) * 0.013) % 1) * 255);
    stamp(s, [cl.x - pad, cl.y - pad, cl.x + pad, cl.y + pad], o.kind ?? 3, ph, () => clumpRaw(s, cl, ramp, crown, o));
  }

  function clumpRaw(s, cl, ramp, crown, o) {
    const r = rng(cl.seed),
      sq = o.squash ?? 0.84,
      R = cl.r,
      N = Math.round(((R * R * sq) / (o.cr * o.cr)) * (o.fill ?? 1.25));
    for (let i = 0; i < N; i++) {
      const a = r() * 6.283,
        d = Math.sqrt(r()) * 0.96,
        u = Math.cos(a) * d,
        v = Math.sin(a) * d,
        nz = Math.sqrt(Math.max(0, 1 - d * d)),
        local = u * LV[0] + v * LV[1] + nz * LV[2],
        x = cl.x + u * R,
        y = cl.y + v * R * sq,
        cu = (x - crown.x) / crown.rx,
        cv = (y - crown.y) / crown.ry,
        cr = o.cr * (0.72 + r() * 0.56);
      const bias = -0.08 + local * 0.5 - (cu * 0.5 + cv * 0.62) * 0.3 + (cl.z / crown.Z) * 0.14 + (v > 0.35 ? -0.24 : v < -0.4 ? 0.06 : 0) + (o.b ?? 0) + (cl.b ?? 0) + (r() - 0.5) * 0.05;
      s.ball(x, y, cr * 1.15, cr, cl.z + nz * R * 0.8, ramp, { bias, amp: 0.3, d: 0.1, n: 0.08, ns: 0.8, seed: cl.seed + i });
    }
  }

  function heart(s, crown, ramp, o, seed) {
    const pad = o.cr * 4;
    stamp(s, [crown.x - crown.rx - pad, crown.y - crown.ry - pad, crown.x + crown.rx + pad, crown.y + crown.ry + pad], 3, 0, () => heartRaw(s, crown, ramp, o, seed));
    if (!s.kind) return;
    for (let i = 0; i < s.c.length; i++) if (s.kind[i] === 3 && s.ph[i] === 0) s.ph[i] = Math.floor((((i % s.w) >> 3) * 37 + ((i / s.w) >> 3) * 53) % 255);
  }

  function heartRaw(s, crown, ramp, o, seed) {
    const r = rng(seed * 7 + 3),
      N = Math.round(((crown.rx * crown.ry) / (o.cr * o.cr)) * 0.9);
    for (let i = 0; i < N; i++) {
      const a = r() * 6.283,
        d = Math.sqrt(r()) * 0.9,
        u = Math.cos(a) * d,
        v = Math.sin(a) * d * (o.squash ?? 0.84),
        cr = o.cr * 1.25;
      s.ball(crown.x + u * crown.rx, crown.y + v * crown.ry, cr * 1.2, cr, -crown.Z * 0.15, ramp, { bias: -0.46 - v * 0.14 - u * 0.06, amp: 0.3, d: 0.1, n: 0.06, seed: seed + i });
    }
  }

  function scatter(r, crown, count, size, spacing, floor) {
    const out = [];
    for (let t = 0; t < 6000 && out.length < count; t++) {
      const u = r() * 2 - 1,
        v = r() * 2 - 1;
      if (u * u + v * v > 1 || v > floor) continue;
      const x = crown.x + u * crown.rx,
        y = crown.y + v * crown.ry,
        R = size[0] + r() * (size[1] - size[0]) * (1 - Math.max(0, v) * 0.4);
      if (out.some((c) => Math.hypot(c.x - x, (c.y - y) * 1.15) < (c.r + R) * spacing)) continue;
      const q = Math.sqrt(Math.max(0, 1 - u * u - v * v));
      out.push({ x, y, r: R, z: (r() * 1.7 - 0.7) * q * crown.Z, u, v });
    }
    return out;
  }

  function shadeUnder(s, snap, reach) {
    for (let x = 0; x < s.w; x++) {
      let under = 0;
      for (let y = 0; y < s.h; y++) {
        const i = y * s.w + x;
        if (s.c[i] && s.c[i] !== snap[i]) under = reach;
        else if (s.c[i] && under > 0) {
          s.c[i] = dark(s.c[i], under > reach / 2 ? 0.55 : 0.74);
          under--;
        }
      }
    }
  }

  function rim(s, k = 0.42) {
    const { w, h, c } = s,
      add = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (c[i]) continue;
        const nb = (y > 0 && c[i - w]) || (x > 0 && c[i - 1]) || (x < w - 1 && c[i + 1]) || (y < h - 1 && c[i + w]);
        if (!nb) continue;
        const j = y > 0 && c[i - w] ? i - w : x > 0 && c[i - 1] ? i - 1 : x < w - 1 && c[i + 1] ? i + 1 : i + w;
        add.push([i, dark(nb, k), j]);
      }
    for (const [i, col, j] of add) {
      c[i] = col;
      if (s.kind) {
        s.kind[i] = s.kind[j];
        s.ph[i] = s.ph[j];
      }
    }
  }

  function seal(s) {
    for (let y = 1; y < s.h - 1; y++)
      for (let x = 1; x < s.w - 1; x++) {
        const i = y * s.w + x;
        if (!s.c[i] && s.c[i - 1] && s.c[i + 1] && s.c[i - s.w] && s.c[i + s.w]) {
          s.c[i] = dark(s.c[i - s.w], 0.7);
          if (s.kind) {
            s.kind[i] = s.kind[i - s.w];
            s.ph[i] = s.ph[i - s.w];
          }
        }
      }
  }

  function crownMask(s, snap) {
    s.crown = new Uint8Array(s.w * s.h);
    for (let i = 0; i < s.c.length; i++) if (s.c[i] && s.c[i] !== snap[i]) s.crown[i] = 1;
  }

  const fresh = (ramp, k = 0.17) => ramp.map((c) => [c[0] * (1 - k) + 170 * k, c[1] * (1 - k) + 198 * k, c[2] * (1 - k) + 96 * k].map((v) => Math.min(255, v * 1.04)));
  const blend = (a, b, k) => [0, 1, 2].map((i) => a[i] * (1 - k) + b[i] * k);

  return { put, tag, as, stamp, mode, furrow, bole, wood, clump, heart, scatter, shadeUnder, rim, seal, crownMask, fresh, blend };
}
