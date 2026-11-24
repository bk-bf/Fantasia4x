import { brushes } from './paint.mjs';

const MATURE = {
  oak: { trunkH: 56, w0: 21, w1: 13, rx: 60, ry: 43, lift: 22, clumpR: [11, 15], spacing: 0.76, cr: 3.6, boughs: 5, floor: 0.66, bark: 'ridge' },
  ash: { trunkH: 72, w0: 14, w1: 9, rx: 38, ry: 54, lift: 30, clumpR: [8, 11], spacing: 0.8, cr: 3, boughs: 4, floor: 0.74, bark: 'mesh', fill: 1.15 },
  apple: { trunkH: 32, w0: 15, w1: 10, rx: 46, ry: 31, lift: 12, clumpR: [9, 12], spacing: 0.8, cr: 3.2, boughs: 4, floor: 0.72, bark: 'ridge', lean: 6, fruit: 30 },
  yew: { trunkH: 22, w0: 26, w1: 18, rx: 58, ry: 33, lift: 8, clumpR: [10, 13], spacing: 0.74, cr: 3.3, boughs: 6, floor: 0.86, bark: 'flake', fruit: 12, squash: 0.74 },
  willow: { trunkH: 46, w0: 19, w1: 13, rx: 60, ry: 27, lift: 12, clumpR: [9, 12], spacing: 0.8, cr: 3.1, boughs: 5, floor: 0.6, bark: 'ridge', squash: 0.7, weep: true },
  heartwood: { trunkH: 56, w0: 19, w1: 12, rx: 54, ry: 42, lift: 22, clumpR: [10, 14], spacing: 0.78, cr: 3.5, boughs: 5, floor: 0.68, bark: 'ridge' },
  ironwood: { trunkH: 58, w0: 24, w1: 16, rx: 62, ry: 44, lift: 22, clumpR: [11, 15], spacing: 0.76, cr: 3.6, boughs: 5, floor: 0.68, bark: 'mesh' }
};

export function forest(A) {
  const B = brushes(A);
  const { Spr, P, rp, dark, hash, noise, rng, clamp, TREES } = A;

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
        if (y % 2 === 0 && hash(band, Math.floor((dx + 40) / (3 + hash(band, 1, seed) * 5)), seed) > 0.84 && u > 0.06 && u < 0.96) k -= 0.6;
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
          const k = 0.92 - u * 0.5 + (peel < 0.705 ? -0.5 : 0) + (B.furrow(dx, y, seed + 2, 0.8, 0.02, 3, 0.1).crack ? -0.25 : 0);
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
    s.sh = { rx: shadow * 1.12, ry: shadow * 0.44, dx: 8 + shadow * 0.08 };
    return s;
  }

  function weep(s, crown, leaf, seed, base) {
    const n = leaf.length - 1,
      r = rng(seed * 13 + 5),
      top = new Map();
    for (let x = 0; x < s.w; x++)
      for (let y = 0; y < base; y++) {
        const i = y * s.w + x;
        if (s.c[i] && s.z[i] > -1e8 && s.c[i] !== s.snap[i]) {
          top.set(x, y);
          break;
        }
      }
    for (const layer of [0, 1, 2]) {
      for (let bx = crown.x - crown.rx * 1.05; bx < crown.x + crown.rx * 1.05; bx += 3 + r() * 3) {
        const x0 = Math.round(bx),
          surface = top.get(x0);
        if (surface === undefined || r() < 0.12) continue;
        const u = (bx - crown.x) / (crown.rx * 1.05),
          side = Math.sign(u) || 1,
          width = 3 + Math.floor(r() * 3),
          start = surface + Math.round((layer === 0 ? 2 : layer === 1 ? 6 : 12) + r() * crown.ry * (0.35 + layer * 0.2)),
          L = (base - 6 - start) * (0.34 + r() * 0.6) * (1 - Math.abs(u) * 0.3) * (layer === 2 ? 0.75 : 1),
          z = crown.Z * (0.6 + layer * 0.5) + 2,
          tone = (layer === 0 ? -0.16 : layer === 1 ? -0.02 : 0.08) - u * 0.12;
        for (let c = 0; c < width; c++) {
          const len = L * (0.75 + hash(x0 + c, seed, 3) * 0.3),
            cu = c / Math.max(1, width - 1);
          for (let j = 0; j < len; j++) {
            const out = side * Math.abs(u) * (1 - Math.exp(-j / 10)) * 4,
              x = x0 + c + Math.round(out + Math.sin(j / 13 + bx) * 0.8),
              y = start + j,
              k = 0.62 + tone - cu * 0.26 - (j / len) * 0.14 + (j < 3 ? 0.08 : 0) + (c & 1 ? -0.05 : 0);
            if (y >= base - 2) break;
            B.put(s, x, y, leaf[clamp(Math.round(k * n), 0, n)], z);
          }
        }
      }
    }
  }

  function fruit(s, leaf, ramp, count, seed, size) {
    const r = rng(seed * 5 + 11);
    for (let i = 0, tries = 0; i < count && tries < count * 60; tries++) {
      const x = Math.floor(r() * s.w),
        y = Math.floor(r() * s.h);
      const ok = (dx, dy) => s.ok(x + dx, y + dy) && s.z[(y + dy) * s.w + x + dx] > -1e8 && s.c[(y + dy) * s.w + x + dx] && !s.wood?.[(y + dy) * s.w + x + dx];
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

  function broad(kind, seed) {
    const k = TREES[kind],
      o = MATURE[kind] ?? MATURE.oak,
      r = rng(seed * 31 + 7),
      leaf = k.leaf;
    const W = Math.ceil(o.rx * 2 + o.clumpR[1] * 2 + 30),
      H = Math.ceil(o.trunkH + o.lift + o.ry + o.clumpR[1] + (o.weep ? 30 : 26)),
      base = H - 8,
      cx = W >> 1;
    const s = new Spr(W, H, cx, base);
    const at = B.bole(s, { cx, base, h: o.trunkH + 6, w0: o.w0, w1: o.w1, seed, lean: o.lean ?? 0, skin: skin(o.bark, k.trunk, seed) });
    const forkY = base - o.trunkH,
      fx = at(o.trunkH);
    const crown = { x: fx, y: forkY - o.lift, rx: o.rx, ry: o.ry, Z: Math.min(o.rx, o.ry) * 0.7 };
    const clumps = B.scatter(r, crown, 60, o.clumpR, o.spacing, o.floor);
    const anchors = [];
    for (let i = 0; i < o.boughs; i++) {
      const a = -Math.PI + ((i + 0.5) / o.boughs) * Math.PI + (r() - 0.5) * 0.4,
        d = 0.42 + r() * 0.16;
      anchors.push({ x: crown.x + Math.cos(a) * crown.rx * d, y: crown.y + Math.sin(a) * crown.ry * d * (o.weep ? 0.5 : 0.9) + crown.ry * 0.12, z: (r() * 0.6 - 0.5) * crown.Z });
    }
    for (const [i, a] of anchors.entries()) B.wood(s, fx + (a.x - fx) * 0.08, forkY + 3, a.x, a.y, o.w1 * 0.78, o.w1 * 0.4, k.trunk, 2, a.z, seed + i, (r() - 0.5) * 10, -0.16);
    for (const [i, c] of clumps.entries()) {
      const a = anchors.reduce((b, n) => (Math.hypot(n.x - c.x, n.y - c.y) < Math.hypot(b.x - c.x, b.y - c.y) ? n : b));
      const t = 0.55 + r() * 0.45,
        sx = fx + (a.x - fx) * t,
        sy = forkY + 3 + (a.y - forkY - 3) * t;
      B.wood(s, sx, sy, c.x, c.y + c.r * 0.25, Math.max(1.5, o.w1 * 0.34), 1, k.trunk, a.z * t, c.z - c.r * 0.6, seed + 50 + i, (r() - 0.5) * 6, -0.24);
      c.seed = seed * 97 + i;
    }
    s.wood = new Uint8Array(s.w * s.h);
    for (let i = 0; i < s.c.length; i++) if (s.c[i]) s.wood[i] = 1;
    const snap = s.c.slice();
    const lo = { cr: o.cr * 0.7, squash: o.squash, fill: (o.fill ?? 1.25) * 1.25 };
    B.heart(s, crown, leaf, lo, seed);
    for (const c of clumps.sort((a, b) => a.z - b.z)) B.clump(s, c, leaf, crown, lo);
    s.snap = snap;
    if (o.weep) weep(s, crown, leaf, seed, base);
    if (k.fruit && o.fruit) fruit(s, leaf, k.fruit, o.fruit, seed, kind === 'yew' ? 1 : 2);
    return finish(s, snap, leaf, crown.rx * 0.98);
  }

  function birch(kind, seed) {
    const k = TREES[kind],
      r = rng(seed * 31 + 7),
      leaf = k.leaf;
    const W = 120,
      H = 176,
      base = H - 8,
      cx = W >> 1;
    const s = new Spr(W, H, cx, base);
    const stems = [
      { dx: -3, lean: -9, h: 148, w0: 10, w1: 3, flare: 7 },
      { dx: 4, lean: 15, h: 122, w0: 8, w1: 2, flare: 3 }
    ];
    const crown = { x: cx + 2, y: base - 104, rx: 40, ry: 52, Z: 26 };
    const clumps = [];
    for (const [si, st] of stems.entries()) {
      const at = B.bole(s, { cx: cx + st.dx, base, h: st.h, w0: st.w0, w1: st.w1, seed: seed + si, lean: st.lean, flare: st.flare, root: 0.6, wander: 1.6, skin: skin('birch', k.trunk, seed + si) });
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
        clumps.push({ x: x1 + side * 2, y: y1 + 2, r: 6 + r() * 3.5, z, seed: seed * 97 + clumps.length });
        if (r() < 0.6) clumps.push({ x: (x0 + x1) / 2, y: y0 + 4, r: 5 + r() * 2.5, z: z * 0.5 + 2, seed: seed * 97 + clumps.length });
      }
      clumps.push({ x: at(st.h), y: base - st.h + 2, r: 6.5, z: 0, seed: seed * 97 + clumps.length });
    }
    const snap = s.c.slice();
    const lo = { cr: 2.1, squash: 0.82, fill: 1.3, b: -0.06 };
    for (const c of clumps.sort((a, b) => a.z - b.z)) B.clump(s, c, leaf, crown, lo);
    return finish(s, snap, leaf, 22, 7);
  }

  function conifer(kind, seed, o) {
    const k = TREES[kind],
      r = rng(seed * 31 + 7),
      leaf = o.leaf ?? k.leaf,
      n = leaf.length - 1;
    const W = Math.ceil(o.half * 2 + 34),
      H = o.tall + 22,
      base = H - 8,
      cx = W >> 1;
    const s = new Spr(W, H, cx, base);
    const plate = kind === 'frostheart' ? skin('ridge', k.trunk, seed) : skin('plate', k.trunk, seed);
    const at = B.bole(s, { cx, base, h: o.tall - 8, w0: o.w0, w1: o.w1, seed, lean: o.lean ?? 0, flare: o.young ? 3 : 7, root: o.young ? 0.5 : 0.9, wander: 1.4, skin: plate });
    const bottom = base - o.bare,
      top = base - o.tall + 6;
    for (let i = 0; i < (o.stubs ?? 0); i++) {
      const j = o.bare * (0.4 + r() * 0.5),
        side = i % 2 ? 1 : -1,
        x0 = at(j),
        len = 4 + r() * 4;
      B.wood(s, x0, base - j, x0 + side * len, base - j - len * 0.4, 2.2, 1, P.woodGrey, 3, 3, seed + i);
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
      return [x0 + b.dx * t, b.y + (b.L * o.droop + b.dz * 0.26) * Math.pow(t, 1.7) - Math.sin(t * Math.PI) * b.L * 0.06];
    };
    for (const [i, b] of boughs.entries()) {
      const [x1, y1] = path(b, 1);
      B.wood(s, at(base - b.y), b.y, x1, y1, Math.max(1, 2.6 * (1 - b.t)), 1, k.trunk, 0, b.dz, seed + i);
    }
    for (let y = 0; y < bottom - 4; y++) for (let x = 0; x < W; x++) if (s.c[y * W + x]) s.c[y * W + x] = dark(s.c[y * W + x], 0.66);
    const snap = s.c.slice();
    const crown = { x: cx, y: (bottom + top) / 2, rx: o.half, ry: (bottom - top) / 2, Z: o.half };
    for (const b of boughs.sort((a, c) => a.dz - c.dz)) {
      const steps = Math.ceil(b.L / (o.cr * 0.8));
      for (let i = 2; i <= steps; i++) {
        const t = i / steps,
          [px, py] = path(b, t),
          thick = o.pad * (1 - t * 0.5) * (0.75 + b.L / o.half / 2);
        for (let m = 0; m < 3; m++) {
          const oy = (r() * 1.7 - 0.55) * thick,
            cr = o.cr * (0.7 + r() * 0.5),
            bias = (-oy / thick) * 0.32 - ((px - cx) / o.half) * 0.16 + (b.dz / o.half) * 0.1 - (1 - b.t) * 0.05 + (o.b ?? 0) + (r() - 0.5) * 0.05;
          s.ball(px + (r() - 0.5) * 2, py + oy, cr * 1.55, cr * 0.78, b.dz * t + cr, leaf, { bias, amp: 0.36, d: 0.1, n: 0.08, ns: 0.9, seed: seed + i * 7 + m });
        }
      }
      const [tx, ty] = path(b, 1),
        side = Math.sign(b.dx) || 1;
      for (let q = 0; q < 3; q++) {
        const len = 2 + Math.floor(r() * 3),
          ox = (r() - 0.5) * 4;
        for (let j = 0; j < len; j++) B.put(s, tx + ox + side * (j * 0.6 + 1), ty + 1 + j, leaf[clamp(2 - (j >> 1), 0, n)], b.dz + o.cr + 1);
      }
    }
    for (let j = 0; j < o.leader; j++) {
      const y = top - 2 - j,
        x = at(o.tall - 8) + Math.round(Math.sin(j / 5) * 0.6),
        tip = j > o.leader - 4;
      B.put(s, x, y, tip ? leaf[n] : leaf[3], o.half);
      if (j < o.leader * 0.5) B.put(s, x - 1, y, leaf[4], o.half);
    }
    if (k.frosted) s.snowCap(2, 0.25);
    return finish(s, snap, leaf, o.half * 0.7, 5);
  }

  function snag(kind, seed) {
    const k = TREES[kind],
      r = rng(seed * 31 + 7);
    const W = 120,
      H = 132,
      base = H - 8,
      cx = W >> 1,
      tall = 96;
    const s = new Spr(W, H, cx, base);
    const at = B.bole(s, { cx, base, h: tall, w0: 18, w1: 10, seed, lean: 5, skin: skin('snag', k.trunk, seed) });
    for (let x = 0; x < W; x++) {
      const cut = base - tall + 2 + Math.floor(Math.abs(noise(x * 0.35, 0, seed) - 0.5) * 16 + hash(x, seed, 1) * 3);
      for (let y = base - tall - 1; y < cut; y++) {
        s.c[y * W + x] = null;
        s.z[y * W + x] = -1e9;
      }
      if (s.c[cut * W + x]) s.c[cut * W + x] = P.bone[4];
    }
    const limbs = [
      [0.48, -1, 30, 6],
      [0.62, 1, 36, 6],
      [0.76, -1, 22, 4],
      [0.84, 1, 7, 4]
    ];
    for (const [i, [f, side, len, w]] of limbs.entries()) {
      const j = tall * f,
        x0 = at(j),
        y0 = base - j,
        a = -0.55 - r() * 0.5,
        x1 = x0 + side * Math.cos(a) * len,
        y1 = y0 + Math.sin(a) * len,
        z = (r() - 0.5) * 8;
      B.wood(s, x0, y0, x1, y1, w, 2, k.trunk, 0, z, seed + i, side * 3, -0.04);
      B.put(s, x1, y1, P.bone[3], z + 4);
      if (len > 15)
        for (let q = 0; q < 2; q++) {
          const t = 0.5 + q * 0.3,
            bx = x0 + (x1 - x0) * t,
            by = y0 + (y1 - y0) * t,
            b = a + (q ? -0.7 : 0.6) * side,
            l = 8 + r() * 6;
          B.wood(s, bx, by, bx + side * Math.cos(b) * l, by + Math.sin(b) * l, 2, 1, k.trunk, z, z, seed + 9 + i * 3 + q);
        }
    }
    const hx = Math.round(at(tall * 0.55) - 2),
      hy = base - Math.round(tall * 0.55);
    for (let j = -2; j <= 2; j++) for (let i = -1; i <= 1; i++) if (Math.abs(j) < 2 || !i) s.set(hx + i, hy + j, k.trunk[0]);
    s.set(hx, hy + 3, k.trunk[3]);
    for (const [f, side] of [
      [0.26, 1],
      [0.33, 1],
      [0.3, -1]
    ]) {
      const j = Math.round(tall * f),
        x0 = Math.round(at(j) + side * 7),
        y0 = base - j;
      for (let i = 0; i < 6; i++) {
        const xx = x0 + side * i,
          dep = i < 4 ? 2 : 1;
        s.set(xx, y0, P.cloth[i < 2 ? 4 : 3]);
        for (let d = 1; d <= dep; d++) s.set(xx, y0 + d, d === dep ? P.leather[1] : P.leather[3]);
      }
    }
    B.rim(s);
    s.crown = new Uint8Array(W * H);
    s.sh = { rx: 14, ry: 6, dx: 10 };
    return s;
  }

  const YOUNG_PINE = { tall: 94, bare: 5, half: 27, step: 7, w0: 6, w1: 2, cr: 2.4, pad: 3, droop: 0.16, leader: 8, young: true };
  const OLD_PINE = { tall: 182, bare: 46, half: 44, step: 15, w0: 16, w1: 3, cr: 3, pad: 3.6, droop: 0.44, gaps: 0.34, stubs: 3, leader: 10, b: -0.05 };

  function young(kind, seed) {
    const k = TREES[kind];
    if (k.shape === 'pine') {
      const s = conifer(kind, seed, { ...YOUNG_PINE, leaf: B.fresh(k.leaf, 0.12), b: 0.04 });
      return s;
    }
    const id = `young_${kind}`;
    if (!TREES[id]) {
      if (k.shape === 'dead') TREES[id] = k;
      else if (k.shape === 'birch') TREES[id] = { ...k, leaf: B.fresh(k.leaf) };
      else TREES[id] = { ...k, tw: Math.max(3, k.tw - 3), th: Math.round(k.th * 0.92), rx: Math.round(k.rx * 0.86), ry: Math.round(k.ry * 0.86), leaf: B.fresh(k.leaf), fruit: undefined };
    }
    const s = A.mkTree(id, seed, 'summer');
    s.crown = new Uint8Array(s.w * s.h);
    for (let i = 0; i < s.c.length; i++) if (s.c[i] && s.z[i] > -1e8) s.crown[i] = 1;
    return s;
  }

  function mature(kind, seed) {
    const k = TREES[kind];
    if (k.shape === 'pine') return conifer(kind, seed, OLD_PINE);
    if (k.shape === 'birch') return birch(kind, seed);
    if (k.shape === 'dead') return snag(kind, seed);
    return broad(kind, seed);
  }

  const today = (kind, seed) => {
    const s = A.mkTree(kind, seed, 'summer');
    s.crown = new Uint8Array(s.w * s.h);
    for (let i = 0; i < s.c.length; i++) if (s.c[i] && s.z[i] > -1e8) s.crown[i] = 1;
    return s;
  };

  return { young, mature, today, dark };
}
