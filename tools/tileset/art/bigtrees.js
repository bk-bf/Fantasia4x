'use strict';
function treeBrushes(A) {
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
        w =
          w0 +
          (w1 - w0) * Math.pow(t, 0.8) +
          (j < flare ? (Math.pow(flare - j, 2) / flare) * (o.root ?? 0.9) : 0),
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
          put(
            s,
            x + dx,
            y + dy,
            rp(ramp, 0.44 + l * 0.3 + grain + tone, x + dx, y + dy, 0.12),
            z + Math.sqrt(Math.max(0, r * r - dx * dx - dy * dy))
          );
        }
    }
  }

  function clump(s, cl, ramp, crown, o) {
    const pad = cl.r * 1.6 + o.cr * 2;
    const ph =
      cl.ph ?? Math.floor(((cl.x * 0.045 + cl.y * 0.02 + (cl.seed % 97) * 0.013) % 1) * 255);
    stamp(s, [cl.x - pad, cl.y - pad, cl.x + pad, cl.y + pad], o.kind ?? 3, ph, () =>
      clumpRaw(s, cl, ramp, crown, o)
    );
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
      const bias =
        -0.08 +
        local * 0.5 -
        (cu * 0.5 + cv * 0.62) * 0.3 +
        (cl.z / crown.Z) * 0.14 +
        (v > 0.35 ? -0.24 : v < -0.4 ? 0.06 : 0) +
        (o.b ?? 0) +
        (cl.b ?? 0) +
        (r() - 0.5) * 0.05;
      s.ball(x, y, cr * 1.15, cr, cl.z + nz * R * 0.8, ramp, {
        bias,
        amp: 0.3,
        d: 0.1,
        n: 0.08,
        ns: 0.8,
        seed: cl.seed + i
      });
    }
  }

  function heart(s, crown, ramp, o, seed) {
    const pad = o.cr * 4;
    stamp(
      s,
      [
        crown.x - crown.rx - pad,
        crown.y - crown.ry - pad,
        crown.x + crown.rx + pad,
        crown.y + crown.ry + pad
      ],
      3,
      0,
      () => heartRaw(s, crown, ramp, o, seed)
    );
    if (!s.kind) return;
    for (let i = 0; i < s.c.length; i++)
      if (s.kind[i] === 3 && s.ph[i] === 0)
        s.ph[i] = Math.floor((((i % s.w) >> 3) * 37 + ((i / s.w) >> 3) * 53) % 255);
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
      s.ball(crown.x + u * crown.rx, crown.y + v * crown.ry, cr * 1.2, cr, -crown.Z * 0.15, ramp, {
        bias: -0.46 - v * 0.14 - u * 0.06,
        amp: 0.3,
        d: 0.1,
        n: 0.06,
        seed: seed + i
      });
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
        const nb =
          (y > 0 && c[i - w]) ||
          (x > 0 && c[i - 1]) ||
          (x < w - 1 && c[i + 1]) ||
          (y < h - 1 && c[i + w]);
        if (!nb) continue;
        const j =
          y > 0 && c[i - w]
            ? i - w
            : x > 0 && c[i - 1]
              ? i - 1
              : x < w - 1 && c[i + 1]
                ? i + 1
                : i + w;
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

  const fresh = (ramp, k = 0.17) =>
    ramp.map((c) =>
      [c[0] * (1 - k) + 170 * k, c[1] * (1 - k) + 198 * k, c[2] * (1 - k) + 96 * k].map((v) =>
        Math.min(255, v * 1.04)
      )
    );
  const blend = (a, b, k) => [0, 1, 2].map((i) => a[i] * (1 - k) + b[i] * k);

  return {
    put,
    tag,
    as,
    stamp,
    mode,
    furrow,
    bole,
    wood,
    clump,
    heart,
    scatter,
    shadeUnder,
    rim,
    seal,
    crownMask,
    fresh,
    blend
  };
}

const MATURE = {
  oak: {
    trunkH: 56,
    w0: 21,
    w1: 13,
    rx: 60,
    ry: 43,
    lift: 22,
    clumpR: [11, 15],
    spacing: 0.76,
    cr: 3.6,
    boughs: 5,
    floor: 0.66,
    bark: 'ridge'
  },
  ash: {
    trunkH: 72,
    w0: 14,
    w1: 9,
    rx: 38,
    ry: 54,
    lift: 30,
    clumpR: [8, 11],
    spacing: 0.8,
    cr: 3,
    boughs: 4,
    floor: 0.74,
    bark: 'mesh',
    fill: 1.15
  },
  apple: {
    trunkH: 32,
    w0: 15,
    w1: 10,
    rx: 46,
    ry: 31,
    lift: 12,
    clumpR: [9, 12],
    spacing: 0.8,
    cr: 3.2,
    boughs: 4,
    floor: 0.72,
    bark: 'ridge',
    lean: 6,
    fruit: 30
  },
  yew: {
    trunkH: 22,
    w0: 26,
    w1: 18,
    rx: 58,
    ry: 33,
    lift: 8,
    clumpR: [10, 13],
    spacing: 0.74,
    cr: 3.3,
    boughs: 6,
    floor: 0.86,
    bark: 'flake',
    fruit: 12,
    squash: 0.74
  },
  willow: {
    trunkH: 46,
    w0: 19,
    w1: 13,
    rx: 60,
    ry: 27,
    lift: 12,
    clumpR: [9, 12],
    spacing: 0.8,
    cr: 3.1,
    boughs: 5,
    floor: 0.6,
    bark: 'ridge',
    squash: 0.7,
    weep: true
  },
  heartwood: {
    trunkH: 56,
    w0: 19,
    w1: 12,
    rx: 54,
    ry: 42,
    lift: 22,
    clumpR: [10, 14],
    spacing: 0.78,
    cr: 3.5,
    boughs: 5,
    floor: 0.68,
    bark: 'ridge'
  },
  ironwood: {
    trunkH: 58,
    w0: 24,
    w1: 16,
    rx: 62,
    ry: 44,
    lift: 22,
    clumpR: [11, 15],
    spacing: 0.76,
    cr: 3.6,
    boughs: 5,
    floor: 0.68,
    bark: 'mesh'
  },
  moonwood: {
    trunkH: 66,
    w0: 15,
    w1: 9,
    rx: 44,
    ry: 40,
    lift: 24,
    clumpR: [9, 12],
    spacing: 0.8,
    cr: 3.1,
    boughs: 4,
    floor: 0.72,
    bark: 'birch',
    b: -0.24
  },
  emberwood: {
    trunkH: 52,
    w0: 19,
    w1: 12,
    rx: 50,
    ry: 40,
    lift: 20,
    clumpR: [10, 13],
    spacing: 0.78,
    cr: 3.3,
    boughs: 5,
    floor: 0.7,
    bark: 'flake'
  },
  soulwood: {
    trunkH: 46,
    w0: 19,
    w1: 13,
    rx: 58,
    ry: 27,
    lift: 12,
    clumpR: [9, 12],
    spacing: 0.8,
    cr: 3.1,
    boughs: 5,
    floor: 0.6,
    bark: 'ridge',
    squash: 0.7,
    weep: true
  }
};

const SAP = { witchwood: [4, 2], ironwood: [5, 3], bonewood: [1, 0] };
const MAGIC = new Set([
  'heartwood',
  'frostheart',
  'moonwood',
  'ironwood',
  'emberwood',
  'soulwood',
  'witchwood',
  'bonewood'
]);

function treeArt(A) {
  const B = treeBrushes(A);
  const { Spr, P, rp, dark, hash, noise, rng, clamp, TREES } = A;
  const BARK = { witchwood: A.R('#100d12 #1c1720 #2a2330 #3a3242 #4c4456 #615a6a') };
  const LEAF = { witchwood: A.R('#1a0d26 #2c1640 #43215e #5e2f80 #7d43a2 #a066c4 #c493de') };
  const AUTUMN = [P.fallOrange, P.fallRed];
  const leafFor = (k, season, seed, leaf = k.leaf) => {
    if (k.ever || !leaf) return leaf;
    if (season === 'autumn')
      return [k.fall, ...AUTUMN][Math.floor(rng(seed * 5 + 3)() * 2.2)] || k.fall;
    return leaf;
  };
  const bareIn = (k, season) => !k.ever && season === 'winter';
  function frost(s, leaf, seed) {
    const n = leaf.length - 1;
    for (let i = 0; i < s.c.length; i++) {
      if (s.e[i]) continue;
      if (s.c[i] === leaf[n]) s.c[i] = P.snow[4];
      else if (s.c[i] === leaf[n - 1] && hash(i, seed, 3) < 0.7) s.c[i] = P.snow[3];
    }
    cap(s, 3, 0.1);
  }
  function cap(s, depth, keep) {
    const snow = new Set([P.snow[2], P.snow[3], P.snow[4]]);
    const tops = [];
    for (let y = 0; y < s.h; y++)
      for (let x = 0; x < s.w; x++) {
        const i = y * s.w + x;
        if (!s.c[i] || s.e[i] || snow.has(s.c[i])) continue;
        if (y > 0 && s.c[i - s.w]) continue;
        if (keep && hash(x, y, 5) < keep) continue;
        tops.push([x, y]);
      }
    for (const [x, y] of tops) {
      s.c[y * s.w + x] = P.snow[4];
      for (let k = 1; k < depth; k++) {
        const j = (y + k) * s.w + x;
        if (y + k < s.h && s.c[j] && !s.e[j] && hash(x, y + k, 8) < 0.75)
          s.c[j] = k === depth - 1 ? P.snow[2] : P.snow[3];
      }
    }
  }
  function twigs(s, c, ramp, seed, r) {
    const x0 = c.x,
      y0 = c.y + c.r * 0.25;
    for (let q = 0; q < 3; q++) {
      const a = -Math.PI / 2 + (r() - 0.5) * 2.4,
        l = c.r * (0.8 + r() * 0.7),
        x1 = x0 + Math.cos(a) * l,
        y1 = y0 + Math.sin(a) * l;
      B.wood(s, x0, y0, x1, y1, 1.6, 1, ramp, c.z, c.z, seed + q, (r() - 0.5) * 3);
      const b = a + (r() < 0.5 ? -0.6 : 0.6),
        bx = x0 + (x1 - x0) * 0.6,
        by = y0 + (y1 - y0) * 0.6;
      B.wood(
        s,
        bx,
        by,
        bx + Math.cos(b) * l * 0.45,
        by + Math.sin(b) * l * 0.45,
        1,
        1,
        ramp,
        c.z,
        c.z,
        seed + q + 7
      );
    }
  }
  function winter(s, k, leaf, season, seed, bare) {
    if (season !== 'winter') return;
    if (bare || !leaf) cap(s, 2, 0.2);
    else frost(s, leaf, seed);
  }
  const sapOf = (kind) => {
    const tone = SAP[kind];
    if (!tone) return null;
    const ramp = kind === 'witchwood' ? LEAF.witchwood : kind === 'ironwood' ? P.iron : P.bone;
    return [ramp[tone[0]], ramp[tone[1]]];
  };

  const skin = (kind, ramp, seed) => {
    if (kind === 'birch')
      return (x, y, u, j, dx, t) => {
        let k = 0.86 - u * 0.62;
        const low = Math.max(0, 1 - t / 0.2);
        if (low > 0) {
          const f = B.furrow(dx, y, seed, 0.5, 0.08, 4, 0.22);
          k -= low * (0.55 + (f.crack ? 0.25 : 0));
        }
        const band = y >> 1;
        if (
          y % 2 === 0 &&
          hash(band, Math.floor((dx + 40) / (3 + hash(band, 1, seed) * 5)), seed) > 0.84 &&
          u > 0.06 &&
          u < 0.96
        )
          k -= 0.6;
        return rp(ramp, k, x, y, 0.1);
      };
    if (kind === 'plate')
      return (x, y, u, j, dx, t) => {
        const r2 = ramp,
          f = B.furrow(dx, y, seed, 0.42, 0.11, 5, 0.14);
        let k = 0.8 - u * 0.62 + (f.plate ? 0.06 : -0.02);
        if (f.crack) k -= 0.34;
        return rp(r2, k, x, y, 0.12);
      };
    if (kind === 'snag')
      return (x, y, u, j, dx, t) => {
        const peel = noise(dx * 0.22 + 9, y * 0.035, seed + 9);
        if (peel > 0.68 && u > 0.08 && u < 0.92) {
          const k =
            0.92 -
            u * 0.5 +
            (peel < 0.705 ? -0.5 : 0) +
            (B.furrow(dx, y, seed + 2, 0.8, 0.02, 3, 0.1).crack ? -0.25 : 0);
          return rp(P.bone, k, x, y, 0.1);
        }
        const f = B.furrow(dx, y, seed, 0.45, 0.05, 4, 0.16);
        return rp(ramp, 0.74 - u * 0.62 + (f.crack ? -0.32 : 0), x, y, 0.12);
      };
    const fx = kind === 'mesh' ? 0.6 : kind === 'flake' ? 0.3 : 0.4,
      fy = kind === 'mesh' ? 0.09 : kind === 'flake' ? 0.14 : 0.05,
      edge = kind === 'flake' ? 0.18 : 0.14;
    return (x, y, u, j, dx) => {
      const f = B.furrow(dx, y, seed, fx, fy, 4, edge);
      let k = 0.8 - u * 0.64 + (f.plate ? 0.05 : -0.03);
      if (f.crack) k -= 0.34;
      else if (f.f > 0.86) k += 0.08;
      return rp(ramp, k, x, y, 0.12);
    };
  };

  function finish(s, snap, leaf, shadow, reach = 9) {
    B.seal(s);
    B.shadeUnder(s, snap, reach);
    B.crownMask(s, snap);
    B.rim(s);
    s.sh = { rx: shadow * 1.12, ry: shadow * 0.44, dx: 8 + shadow * 0.08, dy: 0, k: 1 };
    return s;
  }

  function weep(s, crown, leaf, seed, base, glow) {
    const n = leaf.length - 1,
      r = rng(seed * 13 + 5),
      top = new Map(),
      low = new Map();
    for (let x = 0; x < s.w; x++)
      for (let y = 0; y < base; y++) {
        const i = y * s.w + x;
        if (!(s.c[i] && s.z[i] > -1e8 && s.c[i] !== s.snap[i])) continue;
        if (!top.has(x)) top.set(x, y);
        low.set(x, y);
      }
    const back = B.tag(new Spr(s.w, s.h, s.ax, s.ay)),
      front = B.tag(new Spr(s.w, s.h, s.ax, s.ay));
    let id = 0;
    for (const layer of [0, 1, 2]) {
      const into = layer === 0 ? back : front,
        gap = layer === 0 ? 10 : layer === 1 ? 11 : 14;
      for (
        let bx = crown.x - crown.rx * 0.98 + r() * gap;
        bx < crown.x + crown.rx * 0.98;
        bx += gap * (0.85 + r() * 0.3)
      ) {
        const x0 = Math.round(bx),
          surface = top.get(x0),
          under = low.get(x0);
        if (surface === undefined) continue;
        const u = (bx - crown.x) / crown.rx,
          side = Math.sign(u) || 1,
          count = 2 + Math.floor(r() * 2),
          start = Math.round(surface + (under - surface) * (0.42 + layer * 0.12 + r() * 0.1)),
          hem = 0.62 + 0.16 * Math.sin(bx * 0.19 + seed) + r() * 0.08,
          L =
            (base - 4 - start) *
            hem *
            (1 - Math.abs(u) * 0.38) *
            (layer === 0 ? 1.05 : layer === 2 ? 0.82 : 1),
          bunch = id++ & 63,
          tone = (layer === 0 ? 0.3 : layer === 1 ? 0.5 : 0.66) - u * 0.1;
        for (let i = 0; i < count; i++) {
          const mid = (count - 1) / 2,
            off = i - mid,
            len = L * (0.8 + 0.2 * (1 - Math.abs(off) / (mid + 1))),
            lit = i === 0 ? 0.07 : i === count - 1 ? -0.07 : 0;
          for (let j = 0; j < len; j++) {
            const f = j / len,
              x = Math.round(
                x0 + off * (2.2 - f * 1.7) + side * Math.abs(u) * 3.5 * (1 - Math.exp(-j / 12))
              ),
              y = start + j;
            if (y >= base - 2) break;
            const tip = j > len - 4,
              k = tone + lit - f * 0.14 + (tip ? 0.05 : 0),
              c = leaf[clamp(Math.round(k * n), 1, n)],
              h = Math.min(15, Math.floor(f * 16));
            B.as((h << 4) | (tip ? 7 : 4), (layer << 6) | bunch, () => B.put(into, x, y, c, layer));
            if (glow && tip) into.e[y * s.w + x] = 110;
          }
        }
      }
    }
    for (const v of [back, front]) {
      v.anim = null;
      v.crown = new Uint8Array(v.w * v.h);
    }
    s.veil = [back, front];
    return s;
  }

  function fruit(s, leaf, ramp, count, seed, size) {
    const r = rng(seed * 5 + 11);
    for (let i = 0, tries = 0; i < count && tries < count * 60; tries++) {
      const x = Math.floor(r() * s.w),
        y = Math.floor(r() * s.h);
      const ok = (dx, dy) =>
        s.ok(x + dx, y + dy) &&
        s.z[(y + dy) * s.w + x + dx] > -1e8 &&
        s.c[(y + dy) * s.w + x + dx] &&
        !s.wood?.[(y + dy) * s.w + x + dx];
      if (!ok(0, 0) || !ok(1, 1) || !ok(0, 3) || !ok(-1, 0) || !ok(2, 0)) continue;
      i++;
      if (size > 1) {
        s.set(x, y, ramp[4]);
        s.set(x + 1, y, ramp[3]);
        s.set(x, y + 1, ramp[2]);
        s.set(x + 1, y + 1, ramp[1]);
      } else s.set(x, y, ramp[3]);
    }
  }

  function magic(s, k, leaf, snap, crown, base, big) {
    const n = leaf.length - 1;
    if (k.glow && !k.moon)
      for (let i = 0; i < s.c.length; i++) {
        if (!s.c[i] || s.c[i] === snap[i]) continue;
        if (s.c[i] === leaf[n]) s.e[i] = 200;
        else if (s.c[i] === leaf[n - 1]) s.e[i] = 110;
      }
    const r = rng(base * 7 + 13);
    s.orbs = [];
    if (k.moon) {
      const orb = A.R('#fff6c8 #e6d98f');
      for (let i = 0, tries = 0; i < (big ? 44 : 20) && tries < 4000; tries++) {
        const x = Math.floor(crown.x + (r() * 2 - 1) * crown.rx),
          y = Math.floor(crown.y + (r() * 2 - 1) * crown.ry);
        const leafy = (dx, dy) =>
          s.ok(x + dx, y + dy) &&
          s.c[(y + dy) * s.w + x + dx] &&
          s.c[(y + dy) * s.w + x + dx] !== snap[(y + dy) * s.w + x + dx];
        if (!leafy(0, 0) || !leafy(2, 3) || !leafy(-1, 0) || s.e[y * s.w + x]) continue;
        i++;
        s.orbs.push([x + 1, y + 1, Math.floor(r() * 255)]);
      }
    }
    if (k.glow)
      s.emit = {
        dx: 0,
        dy: Math.round(crown.y - base),
        rad: Math.round(crown.rx * (big ? 2.6 : 2.2)),
        col: k.glow,
        pulse: 1
      };
    s.crownBox = [
      Math.round(crown.x - crown.rx),
      Math.round(crown.y - crown.ry),
      Math.round(crown.x + crown.rx),
      Math.round(crown.y + crown.ry)
    ];
  }

  function roots(s, at, base, w0, ramp, seed, count) {
    const r = rng(seed * 3 + 1),
      cx = at(0);
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? 1 : -1,
        reach = w0 * (0.7 + r() * 0.8),
        x1 = cx + side * (w0 * 0.35 + reach),
        y1 = base + (r() - 0.25) * 6,
        x0 = cx + side * w0 * 0.25,
        y0 = base - 4 - r() * 6;
      B.as(1, 0, () =>
        B.wood(
          s,
          x0,
          y0,
          x1,
          y1,
          w0 * 0.26,
          2,
          ramp,
          1 + (r() - 0.5) * 6,
          -2 + r() * 6,
          seed + 70 + i,
          side * (2 + r() * 4),
          0.02
        )
      );
    }
  }

  function hollow(s, at, base, w0, h, ramp, glow, seed) {
    const n = ramp.length - 1,
      cx = at(h * 0.5) - w0 * 0.06,
      hw = w0 * 0.2,
      floor = base - 8;
    const halfAt = (t) =>
      hw *
        Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.5 + 0.5)), 0.5) *
        (t > 0.6 ? Math.sqrt(Math.max(0, 1 - ((t - 0.6) / 0.4) ** 2)) : 1) +
      (noise(t * 9, 0, seed) - 0.5) * 1.6;
    s.hollowAt = [Math.round(cx), Math.round(floor - h * 0.35)];
    if (glow) s.hollowRamp = [dark(ramp[0], 0.5), ramp[0], ...glow.slice(1)];
    for (let j = 0; j < h; j++) {
      const t = j / h,
        half = halfAt(t),
        y = floor - j,
        x0 = Math.round(cx - half),
        x1 = Math.round(cx + half);
      if (half < 0.6) continue;
      for (let x = x0 - 1; x <= x1 + 1; x++) {
        if (!s.ok(x, y) || !s.c[y * s.w + x]) continue;
        const i = y * s.w + x;
        if (x === x0 - 1) {
          s.c[i] = ramp[n - 1];
          continue;
        }
        if (x === x1 + 1) {
          s.c[i] = ramp[Math.max(1, n - 4)];
          continue;
        }
        const u = (x - x0) / Math.max(1, x1 - x0),
          across = 1 - Math.pow(Math.abs(u * 2 - 1), 1.6),
          lip = t > 0.62 ? Math.max(0, 1 - (t - 0.62) / 0.42) : 1,
          sill = Math.min(1, j / 4),
          depth = Math.max(
            0,
            Math.min(
              1,
              across * lip * sill * (0.75 + 0.25 * Math.sin(Math.PI * Math.min(1, t * 1.6)))
            )
          );
        if (glow) {
          s.c[i] = glow[Math.min(glow.length - 1, 1 + Math.floor(depth * (glow.length - 2)))];
          s.kind[i] = 8;
          s.ph[i] = Math.round(depth * 255);
          s.e[i] = 0;
          continue;
        }
        const d = depth + (noise(x * 0.45, y * 0.3, seed + 5) - 0.5) * 0.16;
        let c =
          d > 0.66
            ? dark(ramp[0], 0.42)
            : d > 0.4
              ? dark(ramp[0], 0.62)
              : d > 0.18
                ? dark(ramp[0], 0.82)
                : ramp[0];
        if (u > 0.8 && t < 0.72 && d < 0.5) c = ramp[Math.min(n, 2)];
        else if (u > 0.68 && t < 0.6 && d < 0.4) c = ramp[1];
        if (j < 2) c = ramp[Math.min(n, j === 0 ? 3 : 2)];
        s.c[i] = c;
      }
    }
  }

  function moss(s, snap, seed) {
    const tone = P.moss;
    for (let y = 0; y < s.h; y++)
      for (let x = 0; x < s.w; x++) {
        const i = y * s.w + x;
        if (!s.c[i] || s.c[i] !== snap[i] || s.e[i]) continue;
        const v = noise(x * 0.09, y * 0.05, seed + 31);
        const left = x > 0 && s.c[i - 1] ? 1 : 0,
          right = x < s.w - 1 && s.c[i + 1] ? 1 : 0;
        if (v > 0.6 && left && (right || v > 0.7) && noise(x * 0.4, y * 0.12, seed + 33) > 0.42)
          s.c[i] = tone[v > 0.7 ? 2 : v > 0.64 ? 1 : 0];
      }
  }

  function veins(s, at, base, h, k, leaf, seed, tones) {
    const glow = Boolean(k.glow);
    const col = glow ? leaf[leaf.length - 1] : tones?.[0],
      soft = glow ? leaf[leaf.length - 2] : tones?.[1];
    if (!col) return;
    for (let v = 0; v < 3; v++) {
      let off = (v - 1) * 0.22;
      for (let j = 6; j < h; j++) {
        off += (noise(j * 0.08, v, seed + 41) - 0.5) * 0.05;
        const x = Math.round(at(j) + off * 26),
          y = base - j;
        if (!s.ok(x, y) || !s.c[y * s.w + x]) continue;
        if (hash(j >> 3, v, seed) < 0.18) continue;
        s.kind[y * s.w + x] = 6;
        s.ph[y * s.w + x] = j & 255;
        s.c[y * s.w + x] = col;
        if (glow) s.e[y * s.w + x] = 230;
        if (s.ok(x + 1, y) && s.c[y * s.w + x + 1]) {
          s.c[y * s.w + x + 1] = soft;
          s.kind[y * s.w + x + 1] = 6;
          s.ph[y * s.w + x + 1] = j & 255;
          if (glow) s.e[y * s.w + x + 1] = 90;
        }
      }
    }
  }

  function stag(s, crown, ramp, seed, count) {
    const r = rng(seed * 11 + 5);
    for (let i = 0; i < count; i++) {
      const x0 = crown.x + (r() - 0.5) * crown.rx * 0.9,
        y0 = crown.y - crown.ry * 0.62,
        a = -Math.PI / 2 + (r() - 0.5) * 1.3,
        len = crown.ry * (0.5 + r() * 0.2),
        x1 = x0 + Math.cos(a) * len,
        y1 = y0 + Math.sin(a) * len,
        z = crown.Z * 3;
      B.wood(s, x0, y0, x1, y1, 7, 3, ramp, z, z, seed + 90 + i, (r() - 0.5) * 10, 0.08);
      for (let q = 0; q < 2; q++) {
        const b = a + (q ? 0.7 : -0.6),
          l = 7 + r() * 8,
          bx = x0 + (x1 - x0) * (0.7 + q * 0.2),
          by = y0 + (y1 - y0) * (0.7 + q * 0.2);
        B.wood(
          s,
          bx,
          by,
          bx + Math.cos(b) * l,
          by + Math.sin(b) * l,
          2,
          1,
          ramp,
          z,
          z,
          seed + 95 + i * 2 + q
        );
      }
    }
  }

  const ELDER = 2.1;

  function broad(kind, seed, elder = false, season = 'summer') {
    const k = TREES[kind],
      bare = bareIn(k, season),
      m = MATURE[kind] ?? MATURE.oak,
      E = elder ? ELDER : 1,
      o = {
        ...m,
        trunkH: m.trunkH * (elder ? 1.4 : 1),
        w0: m.w0 * (elder ? 2.6 : 1),
        w1: m.w1 * (elder ? 1.8 : 1),
        rx: m.rx * E,
        ry: m.ry * E,
        lift: m.lift * E,
        boughs: m.boughs + (elder ? 3 : 0),
        clumpR: elder ? [m.clumpR[0] + 1, m.clumpR[1] + 3] : m.clumpR
      },
      r = rng(seed * 31 + 7),
      leaf = leafFor(k, season, seed);
    const W = Math.ceil(o.rx * 2 + o.clumpR[1] * 2 + (elder ? 70 : 30)),
      H = Math.ceil(
        o.trunkH + o.lift + o.ry * (elder ? 1.5 : 1) + o.clumpR[1] + (o.weep ? 30 : 26)
      ),
      base = H - 8,
      cx = W >> 1;
    const s = B.tag(new Spr(W, H, cx, base));
    const at = B.bole(s, {
      cx,
      base,
      h: o.trunkH + 6,
      w0: o.w0,
      w1: o.w1,
      seed,
      lean: o.lean ?? 0,
      flare: elder ? 16 : 7,
      root: elder ? 1.3 : 0.9,
      wander: elder ? 6 : 2.4,
      skin: skin(o.bark, k.trunk, seed)
    });
    if (elder) roots(s, at, base, o.w0, k.trunk, seed, 7);
    const forkY = base - o.trunkH,
      fx = at(o.trunkH);
    const crown = { x: fx, y: forkY - o.lift, rx: o.rx, ry: o.ry, Z: Math.min(o.rx, o.ry) * 0.7 };
    const clumps = B.scatter(r, crown, elder ? 240 : 60, o.clumpR, o.spacing, o.floor);
    const anchors = [];
    for (let i = 0; i < o.boughs; i++) {
      const a = -Math.PI + ((i + 0.5) / o.boughs) * Math.PI + (r() - 0.5) * 0.4,
        d = 0.42 + r() * 0.16;
      anchors.push({
        x: crown.x + Math.cos(a) * crown.rx * d,
        y: crown.y + Math.sin(a) * crown.ry * d * (o.weep ? 0.5 : 0.9) + crown.ry * 0.12,
        z: (r() * 0.6 - 0.5) * crown.Z
      });
    }
    for (const [i, a] of anchors.entries())
      B.wood(
        s,
        fx + (a.x - fx) * 0.08,
        forkY + 3,
        a.x,
        a.y,
        o.w1 * 0.78,
        o.w1 * 0.4,
        k.trunk,
        2,
        a.z,
        seed + i,
        (r() - 0.5) * (elder ? 26 : 10),
        -0.16
      );
    for (const [i, c] of clumps.entries()) {
      const a = anchors.reduce((b, n) =>
        Math.hypot(n.x - c.x, n.y - c.y) < Math.hypot(b.x - c.x, b.y - c.y) ? n : b
      );
      const t = 0.55 + r() * 0.45,
        sx = fx + (a.x - fx) * t,
        sy = forkY + 3 + (a.y - forkY - 3) * t;
      B.wood(
        s,
        sx,
        sy,
        c.x,
        c.y + c.r * 0.25,
        Math.max(1.5, Math.min(6, o.w1 * 0.34)),
        1,
        k.trunk,
        a.z * t,
        c.z - c.r * 0.6,
        seed + 50 + i,
        (r() - 0.5) * 6,
        -0.24
      );
      c.seed = seed * 97 + i;
      if (bare) twigs(s, c, k.trunk, seed + 300 + i * 3, r);
    }
    if (elder) {
      hollow(s, at, base, o.w0, o.trunkH * 0.42, k.trunk, k.glow ? leaf : null, seed);
      veins(s, at, base, o.trunkH, k, leaf, seed, sapOf(kind));
    }
    s.wood = new Uint8Array(s.w * s.h);
    for (let i = 0; i < s.c.length; i++) if (s.c[i]) s.wood[i] = 1;
    const snap = s.c.slice();
    if (elder && !k.glow && kind !== 'emberwood') moss(s, snap, seed);
    const lo = { cr: o.cr * 0.7, squash: o.squash, fill: (o.fill ?? 1.25) * 1.25, b: o.b ?? 0 };
    s.snap = snap;
    if (!bare) {
      B.heart(s, crown, leaf, lo, seed);
      for (const c of clumps.sort((a, b) => a.z - b.z))
        B.clump(s, c, leaf, crown, { ...lo, b: lo.b + (elder ? -0.04 : 0) });
      if (o.weep) flatten(weep(s, crown, leaf, seed, base, Boolean(k.glow)));
      if (k.fruit && o.fruit) fruit(s, leaf, k.fruit, o.fruit, seed, kind === 'yew' ? 1 : 2);
    }
    if (elder && !o.weep) stag(s, crown, kind === 'emberwood' ? P.furDark : P.woodGrey, seed, 2);
    magic(s, k, leaf, snap, crown, base, elder);
    winter(s, k, leaf, season, seed, bare);
    return finish(s, snap, leaf, crown.rx * (bare ? 0.6 : 0.98));
  }

  function birch(kind, seed, season = 'summer') {
    const k = TREES[kind],
      bare = bareIn(k, season),
      r = rng(seed * 31 + 7),
      leaf = leafFor(k, season, seed);
    const W = 120,
      H = 176,
      base = H - 8,
      cx = W >> 1;
    const s = B.tag(new Spr(W, H, cx, base));
    const stems = [
      { dx: -3, lean: -9, h: 148, w0: 10, w1: 3, flare: 7 },
      { dx: 4, lean: 15, h: 122, w0: 8, w1: 2, flare: 3 }
    ];
    const crown = { x: cx + 2, y: base - 104, rx: 40, ry: 52, Z: 26 };
    const clumps = [];
    for (const [si, st] of stems.entries()) {
      const at = B.bole(s, {
        cx: cx + st.dx,
        base,
        h: st.h,
        w0: st.w0,
        w1: st.w1,
        seed: seed + si,
        lean: st.lean,
        flare: st.flare,
        root: 0.6,
        wander: 1.6,
        skin: skin('birch', k.trunk, seed + si)
      });
      for (let j = st.h * 0.36, n = 0; j < st.h - 4; j += 7 + r() * 4, n++) {
        const side = (n + si) % 2 ? 1 : -1,
          x0 = at(j),
          y0 = base - j,
          up = j / st.h,
          len = (10 + r() * 12) * (1.15 - up * 0.6),
          x1 = x0 + side * len,
          y1 = y0 + 2 + r() * 6 - up * 4,
          z = (r() * 2 - 1) * crown.Z * 0.7;
        B.wood(s, x0, y0, x1, y1, 2.2, 1, k.trunk, 0, z, seed + n, side * 2, 0.15);
        clumps.push({
          x: x1 + side * 2,
          y: y1 + 2,
          r: 6 + r() * 3.5,
          z,
          seed: seed * 97 + clumps.length
        });
        if (r() < 0.6)
          clumps.push({
            x: (x0 + x1) / 2,
            y: y0 + 4,
            r: 5 + r() * 2.5,
            z: z * 0.5 + 2,
            seed: seed * 97 + clumps.length
          });
      }
      clumps.push({
        x: at(st.h),
        y: base - st.h + 2,
        r: 6.5,
        z: 0,
        seed: seed * 97 + clumps.length
      });
    }
    const snap = s.c.slice();
    const lo = { cr: 2.1, squash: 0.82, fill: 1.3, b: -0.06 };
    if (bare) for (const [i, c] of clumps.entries()) twigs(s, c, k.trunk, seed + 300 + i * 3, r);
    else for (const c of clumps.sort((a, b) => a.z - b.z)) B.clump(s, c, leaf, crown, lo);
    winter(s, k, leaf, season, seed, bare);
    return finish(s, snap, leaf, bare ? 14 : 22, 7);
  }

  function conifer(kind, seed, o, season = 'summer') {
    const k = TREES[kind],
      r = rng(seed * 31 + 7),
      leaf = o.leaf ?? k.leaf,
      n = leaf.length - 1;
    const W = Math.ceil(o.half * 2 + 34),
      H = o.tall + 22,
      base = H - 8,
      cx = W >> 1;
    const s = B.tag(new Spr(W, H, cx, base));
    const plate =
      kind === 'frostheart' ? skin('ridge', k.trunk, seed) : skin('plate', k.trunk, seed);
    const at = B.bole(s, {
      cx,
      base,
      h: o.tall - 8,
      w0: o.w0,
      w1: o.w1,
      seed,
      lean: o.lean ?? 0,
      flare: o.young ? 3 : 7,
      root: o.young ? 0.5 : 0.9,
      wander: 1.4,
      skin: plate
    });
    const bottom = base - o.bare,
      top = base - o.tall + 6;
    for (let i = 0; i < (o.stubs ?? 0); i++) {
      const j = o.bare * (0.4 + r() * 0.5),
        side = i % 2 ? 1 : -1,
        x0 = at(j),
        len = 4 + r() * 4;
      B.wood(
        s,
        x0,
        base - j,
        x0 + side * len,
        base - j - len * 0.4,
        2.2,
        1,
        P.woodGrey,
        3,
        3,
        seed + i
      );
    }
    const boughs = [];
    for (let y = bottom, wi = 0; y > top + 4; wi++) {
      const t = (bottom - y) / (bottom - top),
        env = Math.pow(1 - t, 0.9) * (0.86 + 0.14 * Math.sin(t * 8 + seed)),
        reach = o.half * env * (0.86 + r() * 0.26) + 3,
        count = 4 + (r() < 0.5 ? 1 : 0),
        rot = r() * 6.283;
      for (let i = 0; i < count; i++) {
        if (r() < (o.gaps ?? 0) * (1 - t)) continue;
        const th = rot + (i * 6.283) / count + (r() - 0.5) * 0.7,
          L = reach * (0.78 + r() * 0.32);
        boughs.push({ y, dx: Math.cos(th) * L, dz: Math.sin(th) * L, L, t });
      }
      y -= o.step * (0.8 + r() * 0.4) * (1 - t * 0.4);
    }
    const path = (b, t) => {
      const x0 = at(base - b.y);
      return [
        x0 + b.dx * t,
        b.y + (b.L * o.droop + b.dz * 0.26) * Math.pow(t, 1.7) - Math.sin(t * Math.PI) * b.L * 0.06
      ];
    };
    for (const [i, b] of boughs.entries()) {
      const [x1, y1] = path(b, 1);
      B.wood(
        s,
        at(base - b.y),
        b.y,
        x1,
        y1,
        Math.max(1, 2.6 * (1 - b.t)),
        1,
        k.trunk,
        0,
        b.dz,
        seed + i
      );
    }
    for (let y = 0; y < bottom - 4; y++)
      for (let x = 0; x < W; x++) if (s.c[y * W + x]) s.c[y * W + x] = dark(s.c[y * W + x], 0.66);
    const snap = s.c.slice();
    const crown = { x: cx, y: (bottom + top) / 2, rx: o.half, ry: (bottom - top) / 2, Z: o.half };
    for (const b of boughs.sort((a, c) => a.dz - c.dz)) {
      const steps = Math.ceil(b.L / (o.cr * 0.8)),
        bph = Math.floor(((b.y * 0.11 + b.dx * 0.01 + 7) % 1) * 255),
        reachX = Math.abs(b.dx) + o.pad * 3 + 8,
        x0b = at(base - b.y);
      B.stamp(
        s,
        [
          x0b - reachX,
          b.y - o.pad * 3 - 6,
          x0b + reachX,
          b.y + b.L * o.droop + Math.abs(b.dz) * 0.3 + o.pad * 3 + 8
        ],
        5,
        bph,
        () => {
          for (let i = 2; i <= steps; i++) {
            const t = i / steps,
              [px, py] = path(b, t),
              thick = o.pad * (1 - t * 0.5) * (0.75 + b.L / o.half / 2);
            for (let m = 0; m < 3; m++) {
              const oy = (r() * 1.7 - 0.55) * thick,
                cr = o.cr * (0.7 + r() * 0.5),
                bias =
                  (-oy / thick) * 0.32 -
                  ((px - cx) / o.half) * 0.16 +
                  (b.dz / o.half) * 0.1 -
                  (1 - b.t) * 0.05 +
                  (o.b ?? 0) +
                  (r() - 0.5) * 0.05;
              s.ball(px + (r() - 0.5) * 2, py + oy, cr * 1.55, cr * 0.78, b.dz * t + cr, leaf, {
                bias,
                amp: 0.36,
                d: 0.1,
                n: 0.08,
                ns: 0.9,
                seed: seed + i * 7 + m
              });
            }
          }
          const [tx, ty] = path(b, 1),
            side = Math.sign(b.dx) || 1;
          for (let q = 0; q < 3; q++) {
            const len = 2 + Math.floor(r() * 3),
              ox = (r() - 0.5) * 4;
            for (let j = 0; j < len; j++)
              B.put(
                s,
                tx + ox + side * (j * 0.6 + 1),
                ty + 1 + j,
                leaf[clamp(2 - (j >> 1), 0, n)],
                b.dz + o.cr + 1
              );
          }
        }
      );
    }
    for (const off of o.elder ? [-5, 6] : [0])
      for (let j = 0; j < o.leader; j++) {
        const y = top - 2 - j + Math.abs(off) * 0.6,
          x = at(o.tall - 8) + off * Math.min(1, j / 6) + Math.round(Math.sin(j / 5) * 0.6),
          tip = j > o.leader - 4;
        B.as(5, 200, () => {
          B.put(s, x, y, tip ? leaf[n] : leaf[3], o.half);
          if (j < o.leader * 0.5) B.put(s, x - 1, y, leaf[4], o.half);
        });
      }
    if (o.elder) {
      veins(s, at, base, o.bare + 20, k, leaf, seed);
      roots(s, at, base, o.w0, k.trunk, seed, 6);
    }
    magic(s, k, leaf, snap, crown, base, o.elder);
    if (k.frosted) s.snowCap(o.elder ? 3 : 2, 0.25);
    winter(s, k, leaf, season, seed, false);
    return finish(s, snap, leaf, o.half * 0.7, 5);
  }

  function snag(kind, seed, elder = false, season = 'summer') {
    const k = TREES[kind],
      bark = BARK[kind] ?? k.trunk,
      tuft = LEAF[kind] ?? k.tuft,
      r = rng(seed * 31 + 7),
      S = elder ? 2 : 1,
      dead = kind === 'dead';
    const W = Math.round(120 * S * 1.1),
      H = Math.round(132 * S),
      base = H - 8,
      cx = W >> 1,
      tall = 96 * S;
    const s = B.tag(new Spr(W, H, cx, base));
    const at = B.bole(s, {
      cx,
      base,
      h: tall,
      w0: 18 * S * (elder ? 1.3 : 1),
      w1: 10 * S,
      seed,
      lean: 5 * S,
      flare: elder ? 14 : 7,
      root: elder ? 1.2 : 0.9,
      wander: elder ? 7 : 2.4,
      skin: skin(dead ? 'snag' : 'ridge', bark, seed)
    });
    if (elder) roots(s, at, base, 18 * S * 1.3, bark, seed, 6);
    const scar = dead ? P.bone : kind === 'witchwood' ? P.woodGrey : bark;
    for (let x = 0; x < W; x++) {
      const cut =
        base -
        tall +
        2 +
        Math.floor(Math.abs(noise(x * 0.35, 0, seed) - 0.5) * 16 * S + hash(x, seed, 1) * 3);
      for (let y = base - tall - 1; y < cut; y++) {
        s.c[y * W + x] = null;
        s.z[y * W + x] = -1e9;
      }
      if (s.c[cut * W + x]) s.c[cut * W + x] = scar[scar.length - 2];
    }
    const limbs = elder
      ? [
          [0.38, -1, 34, 7],
          [0.46, 1, 40, 7],
          [0.55, -1, 46, 6],
          [0.63, 1, 30, 6],
          [0.72, -1, 26, 5],
          [0.8, 1, 34, 5],
          [0.88, -1, 12, 4]
        ]
      : [
          [0.48, -1, 30, 6],
          [0.62, 1, 36, 6],
          [0.76, -1, 22, 4],
          [0.84, 1, 7, 4]
        ];
    const tips = [];
    for (const [i, [f, side, len0, w0]] of limbs.entries()) {
      const len = len0 * (elder ? 1.5 : 1),
        w = w0 * (elder ? 1.5 : 1),
        j = tall * f,
        x0 = at(j),
        y0 = base - j,
        a = -0.55 - r() * 0.5,
        x1 = x0 + side * Math.cos(a) * len,
        y1 = y0 + Math.sin(a) * len,
        z = (r() - 0.5) * 8;
      B.wood(s, x0, y0, x1, y1, w, 2, bark, 0, z, seed + i, side * (elder ? 9 : 3), -0.04);
      B.put(s, x1, y1, scar[scar.length - 2], z + 4);
      tips.push([x1, y1, z]);
      if (len > 15)
        for (let q = 0; q < 2; q++) {
          const t = 0.5 + q * 0.3,
            bx = x0 + (x1 - x0) * t,
            by = y0 + (y1 - y0) * t,
            b = a + (q ? -0.7 : 0.6) * side,
            l = (8 + r() * 6) * (elder ? 1.5 : 1),
            ex = bx + side * Math.cos(b) * l,
            ey = by + Math.sin(b) * l;
          B.wood(
            s,
            bx,
            by,
            ex,
            ey,
            elder ? 3 : 2,
            1,
            bark,
            z,
            z,
            seed + 9 + i * 3 + q,
            side * (elder ? 3 : 0)
          );
          tips.push([ex, ey, z]);
        }
    }
    const hx = Math.round(at(tall * 0.55) - 2),
      hy = base - Math.round(tall * 0.55),
      hs = elder ? 2 : 1;
    if (elder) {
      hollow(s, at, base, 18 * S * 1.3, tall * 0.32, bark, null, seed);
      veins(s, at, base, tall * 0.9, k, bark, seed, sapOf(kind));
    } else {
      for (let j = -2 * hs; j <= 2 * hs; j++)
        for (let i = -hs; i <= hs; i++)
          if (Math.abs(j) < 2 * hs || !i) s.set(hx + i, hy + j, bark[0]);
      s.set(hx, hy + 3, bark[3]);
    }
    if (dead)
      for (const [f, side] of [
        [0.26, 1],
        [0.33, 1],
        [0.3, -1]
      ]) {
        const j = Math.round(tall * f),
          x0 = Math.round(at(j) + side * 7 * S),
          y0 = base - j;
        for (let i = 0; i < 6 * S; i++) {
          const xx = x0 + side * i,
            dep = i < 4 * S ? 2 * S : S;
          s.set(xx, y0, P.cloth[i < 2 * S ? 4 : 3]);
          for (let d = 1; d <= dep; d++) s.set(xx, y0 + d, d === dep ? P.leather[1] : P.leather[3]);
        }
      }
    const snap = s.c.slice();
    if (elder && kind === 'dead') moss(s, snap, seed);
    if (tuft) {
      const crown = { x: cx, y: base - tall, rx: 60 * S, ry: 40 * S, Z: 20 * S };
      for (const [i, [x, y, z]] of tips.entries())
        B.clump(
          s,
          {
            x,
            y: y + 2,
            r: (elder ? 9 : 6.5) + hash(i, seed, 3) * 3,
            z: z + 4,
            seed: seed * 53 + i
          },
          tuft,
          crown,
          { cr: 2.3, squash: 0.72, fill: 1.4 }
        );
    }
    if (season === 'winter') cap(s, 2, 0.2);
    B.crownMask(s, snap);
    B.rim(s);
    s.sh = { rx: 14 * S, ry: 6 * S, dx: 10 * S, dy: 0, k: 0.5 };
    return s;
  }

  const OLD_PINE = {
    tall: 182,
    bare: 46,
    half: 44,
    step: 15,
    w0: 16,
    w1: 3,
    cr: 3,
    pad: 3.6,
    droop: 0.44,
    gaps: 0.34,
    stubs: 3,
    leader: 10,
    b: -0.05
  };
  const ELDER_PINE = {
    tall: 316,
    bare: 118,
    half: 74,
    step: 19,
    w0: 40,
    w1: 5,
    cr: 3.2,
    pad: 4.4,
    droop: 0.5,
    gaps: 0.42,
    stubs: 7,
    leader: 16,
    b: -0.08,
    elder: true
  };

  const brighten = (ramp) => ramp.map((c) => B.blend(c, [255, 255, 255], 0.1));

  const LEAFY = new Set([3, 4, 5, 7]);
  const COVERING = 5;
  const hex = (c) =>
    '#' +
    c
      .map((v) =>
        Math.round(Math.max(0, Math.min(255, v)))
          .toString(16)
          .padStart(2, '0')
      )
      .join('');

  function classify(s) {
    B.tag(s);
    s.crown = new Uint8Array(s.w * s.h);
    for (let i = 0; i < s.c.length; i++) {
      if (!s.c[i]) continue;
      const leafy = s.z[i] > -1e8;
      s.kind[i] = leafy ? 3 : 1;
      s.ph[i] = leafy ? Math.floor(hash((i % s.w) >> 3, Math.floor(i / s.w / 6), 5) * 255) : 0;
      if (leafy) s.crown[i] = 1;
    }
    return s;
  }

  function dress(s, kind, age, from) {
    const k = TREES[kind],
      shape = k.shape,
      name = from ?? kind;
    let x0 = 1e9,
      y0 = 1e9,
      x1 = -1,
      y1 = -1;
    for (let i = 0; i < s.c.length; i++) {
      if (!s.c[i] || !LEAFY.has(s.kind[i])) continue;
      const x = i % s.w,
        y = Math.floor(i / s.w);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    if (x1 < 0) [x0, y0, x1, y1] = [0, 0, s.w - 1, Math.round(s.h * 0.4)];
    const big = age === 'elder' ? 1 : 0;
    const sway =
      age === 'young'
        ? (s.sway ?? 2.6)
        : shape === 'pine'
          ? 2.2 + big * 0.4
          : shape === 'dead'
            ? 1.1 + big * 0.2
            : 3.4 + big * 0.6;
    const leaf = k.leaf ?? k.tuft;
    s.anim = {
      kind: name,
      age,
      sway,
      box: [x0, y0, x1, y1],
      shape,
      ever: Boolean(k.ever),
      weep: shape === 'willow',
      glow: k.glow ?? null,
      moon: Boolean(k.moon) && age !== 'young',
      ember: Boolean(k.sparks) && age !== 'young',
      heart: name === 'heartwood',
      soul: name === 'soulwood',
      frost: Boolean(k.frosted),
      apple: name === 'apple' && age !== 'young',
      iron: name === 'ironwood',
      witch: name === 'witchwood',
      bone: name === 'bonewood',
      leaf: leaf ? leaf.map(hex) : null,
      hollow: s.hollowRamp ? s.hollowRamp.map(hex) : null,
      hollowAt: s.hollowAt ?? null,
      orbs: s.orbs ?? []
    };
    return s;
  }

  function young(kind, seed, season = 'summer') {
    const k = TREES[kind];
    const id = `young_${kind}`;
    if (!TREES[id]) {
      const leaf = k.leaf && (MAGIC.has(kind) ? brighten(k.leaf) : B.fresh(k.leaf));
      if (k.shape === 'dead') TREES[id] = k.tuft ? { ...k, tuft: brighten(k.tuft) } : k;
      else if (k.shape === 'birch' || k.shape === 'pine') TREES[id] = { ...k, leaf };
      else
        TREES[id] = {
          ...k,
          tw: Math.max(3, k.tw - 3),
          th: Math.round(k.th * 0.92),
          rx: Math.round(k.rx * 0.86),
          ry: Math.round(k.ry * 0.86),
          leaf,
          fruit: undefined,
          sparks: undefined
        };
    }
    return dress(classify(A.mkTree(id, seed, season)), id, 'young', kind);
  }

  function mature(kind, seed, season = 'summer') {
    const k = TREES[kind];
    const s =
      k.shape === 'pine'
        ? conifer(kind, seed, OLD_PINE, season)
        : k.shape === 'birch'
          ? birch(kind, seed, season)
          : k.shape === 'dead'
            ? snag(kind, seed, false, season)
            : broad(kind, seed, false, season);
    return dress(flatten(s), kind, 'mature');
  }

  function elder(kind, seed, season = 'summer') {
    const k = TREES[kind];
    const s =
      k.shape === 'pine'
        ? conifer(kind, seed, ELDER_PINE, season)
        : k.shape === 'dead'
          ? snag(kind, seed, true, season)
          : broad(kind, seed, true, season);
    return dress(flatten(s), kind, 'elder');
  }

  function flatten(s) {
    if (!s.veil) return s;
    const [back, front] = s.veil;
    for (let i = 0; i < s.c.length; i++) {
      const from = front.c[i] ? front : !s.c[i] && back.c[i] ? back : null;
      if (!from) continue;
      const covers = from === front && Boolean(s.c[i]);
      s.c[i] = from.c[i];
      s.e[i] = from.e[i];
      s.kind[i] = covers ? from.kind[i] + COVERING : from.kind[i];
      s.ph[i] = from.ph[i];
    }
    delete s.veil;
    return s;
  }

  return { young, mature, elder, MAGIC };
}
