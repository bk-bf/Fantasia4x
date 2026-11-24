'use strict';
const LAIR_PROPS = (() => {
  const below = (s, row) => { for (let y = row + 1; y < s.h; y++) for (let x = 0; x < s.w; x++) s.c[y * s.w + x] = null; };
  const grassed = (s, r, x0, x1, y0, y1, n, ramp) => { for (let i = 0; i < n; i++) { const x = x0 + Math.floor(r() * (x1 - x0)), y = y0 + Math.floor(r() * (y1 - y0)); if (!s.get(x, y)) continue; s.set(x, y, ramp[2 + Math.floor(r() * 3)]); if (i % 3 === 0 && s.get(x, y - 1)) { s.set(x, y - 1, ramp[4]); s.set(x, y - 2, ramp[3]); } } };
  const bone = (s, x, y, len, dy, ramp = P.bone) => { s.line(x, y, x + len, y + (dy || 0), ramp[5]); s.line(x, y + 1, x + len, y + 1 + (dy || 0), ramp[3]); for (const [ex, ey] of [[x, y], [x + len, y + (dy || 0)]]) { s.set(ex, ey - 1, ramp[5]); s.set(ex, ey + 2, ramp[4]); } };
  const solid = c => c && c !== P.ink;
  const BLEACHED = [P.bone[2], P.bone[3], P.bone[4], P.bone[4], P.bone[5], P.bone[5]];

  const tufts = (s, r, x0, x1, base, n, ramp, tall) => {
    for (let i = 0; i < n; i++) {
      const x = x0 + Math.floor(r() * (x1 - x0)), y = base - Math.floor(r() * 3), h = 2 + Math.floor(r() * tall), lean = r() < .5 ? -1 : 1;
      for (let j = 0; j < h; j++) s.set(x + (j > h - 3 && h > 3 ? lean : 0), y - j, ramp[clamp(2 + (j * 2 > h ? 1 : 0) + (i & 1), 0, ramp.length - 1)]);
    }
  };
  const sprouts = (s, r, x0, x1, n, ramp, tall) => {
    for (let i = 0; i < n; i++) {
      const x = x0 + Math.floor(r() * (x1 - x0)), h = 1 + Math.floor(r() * tall);
      let y = 0;
      while (y < s.h && !solid(s.get(x, y))) y++;
      if (y < s.h) for (let j = 0; j <= h; j++) s.set(x, y - j, ramp[clamp(2 + (j * 2 > h ? 1 : 0) + (i & 1), 0, ramp.length - 1)]);
    }
  };
  const mossed = (s, r, p, ramp) => {
    for (let y = 1; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      if (!solid(s.get(x, y)) || solid(s.get(x, y - 1)) || r() > p) continue;
      s.set(x, y, ramp[3 + (x & 1)]);
      if (solid(s.get(x, y + 1)) && r() < .5) s.set(x, y + 1, ramp[2]);
    }
  };
  const moss = (s, r, n, x0, xs, y0, ys) => { for (let i = 0; i < n; i++) { const x = x0 + Math.floor(r() * xs), y = y0 + Math.floor(r() * ys); if (solid(s.get(x, y))) { s.set(x, y, P.moss[3 + (i % 3)]); if (i % 4 === 0) s.set(x, y - 1, P.moss[5]); } } };
  const worn = (c, f) => { const l = c[0] * .32 + c[1] * .5 + c[2] * .18; return [mix(c[0], l * 1.03, f), mix(c[1], l, f), mix(c[2], l * .94, f)]; };
  const faded = (s, f) => {
    const seen = new Map();
    for (let i = 0; i < s.c.length; i++) { const c = s.c[i]; if (!solid(c) || s.e[i]) continue; if (!seen.has(c)) seen.set(c, worn(c, f)); s.c[i] = seen.get(c); }
  };
  const moved = (src, w, h, ax, ay, to) => { const s = new Spr(w, h, ax, ay); for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const c = src.c[y * src.w + x]; if (c) { const p = to(x, y); s.set(p[0], p[1], c, src.e[y * src.w + x]); } } return s; };
  const leant = (src, k) => moved(src, src.w, src.h, src.ax, src.ay, (x, y) => [x + (src.ay - y) * k, y]);
  const slumped = (src, x0, k) => moved(src, src.w, src.h, src.ax, src.ay, (x, y) => [x, y + Math.max(0, x - x0) * k]);
  const felled = src => moved(src, src.h + 4, 44, 2, 25, (x, y) => [src.ay - y + 2, 22 + (x - src.ax) * .6]);
  const bent = (s, x0, y0, cx, cy, x1, y1, w, ramp, b, upto = 1) => {
    let px = x0, py = y0;
    for (let i = 1; i <= Math.round(12 * upto); i++) { const t = i / 12, u = 1 - t, x = u * u * x0 + 2 * u * t * cx + t * t * x1, y = u * u * y0 + 2 * u * t * cy + t * t * y1; s.thick(px, py, x, y, w, ramp, b); px = x; py = y; }
  };

  function den(seed, mouths, d = 0) {
    const r = rng(seed * 19 + 3), s = new Spr(92, 56, 46, 48), B = 48, sag = [1, 1, .88, .58][d];
    s.ball(46, B - 11 * sag, 42, 17 * sag, 0, P.soil, { n: .4, ns: .4, d: .14, seed });
    s.ball(24, B - 7 * sag, 20, 11 * sag, 1, P.soil, { n: .4, ns: .4, d: .14, seed: seed + 1 });
    s.ball(70, B - 6 * sag, 18, 10 * sag, 1, P.soil, { n: .4, ns: .4, d: .14, seed: seed + 2 });
    below(s, B);
    grassed(s, r, 4, 88, B - 29, B - 14 + [0, 0, 7, 13][d], [240, 240, 560, 1500][d], P.grass);
    for (const hx of mouths) {
      if (d > 2) { s.oval(hx, B - 3, 9, 3.4, () => P.soilRich[1]); s.oval(hx - 2, B - 4, 4, 1.4, () => P.ink); s.thick(hx - 9, B - 1, hx - 2, B - 10, 2, P.woodGrey, 3); }
      else s.oval(hx, B - 6, 10, 8, (x, y, nx, ny) => Math.hypot(nx, ny) > .8 ? P.soilRich[ny < 0 ? 0 : 2] : P.ink);
      if (d === 2) { s.oval(hx + 3, B - 2, 9, 5.5, (x, y) => P.soil[2 + Math.round(noise(x * .5, y * .5, seed) * 3)]); s.thick(hx + 1, B - 3, hx + 12, B - 8, 2, P.woodGrey, 3); }
      for (const [dx, bend] of [[-9, 4], [-2, -3], [6, 3]].slice(0, [3, 3, 2, 0][d])) { s.thick(hx + dx, B - 20, hx + dx + bend, B - 10, 2, P.wood, 3); s.thick(hx + dx + bend, B - 10, hx + dx + bend * 1.6, B - 5, 1, P.wood, 2); }
      for (let i = 0; i < 16; i++) { const x = hx - 13 + r() * 26, y = B + 1 + r() * 4; s.set(x, y, P.soil[4 + (i & 1)]); s.set(x + 1, y, P.soil[3]); }
    }
    for (let i = 0; i < 10; i++) { const x = 8 + r() * 76, y = B - 1 + r() * 2; s.set(x, y, P.rockWarm[5]); s.set(x + 1, y, P.rockWarm[3]); }
    s.outline();
    if (d > 1) { sprouts(s, r, 6, 86, d > 2 ? 46 : 16, P.grass, d > 2 ? 5 : 3); tufts(s, r, 4, 88, B + 2, d > 2 ? 40 : 14, P.grass, d > 2 ? 7 : 4); }
    s.sh = { rx: 44, ry: 9, dx: 7, dy: 0, k: sag };
    return s;
  }

  function bed(seed, ramp, soil, w, d = 0) {
    const h = Math.round(w * .46), s = new Spr(w, h, w >> 1, 0), n = ramp.length - 1, lost = [0, 0, .42, .78][d], rim = [.72, .72, .46, 0][d];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const nx = (x - w / 2) / (w / 2 - 2), ny = (y - h / 2) / (h / 2 - 1), q = Math.hypot(nx, ny) + (noise(x * .3, y * .3, seed) - .5) * .3;
      if (q > 1 || (q > .8 && dith(x, y) > (1 - q) * 5)) continue;
      if (lost && noise(x * .2, y * .3, seed + 40) * .65 + hash(x, y, seed + 41) * .35 < lost * (.5 + q * .55)) continue;
      const swirl = Math.sin(Math.atan2(ny, nx) * 6 + q * 8 + seed);
      s.set(x, y, q > rim ? soil[clamp(2 + (ny > 0 ? -1 : 1), 0, soil.length - 1)] : ramp[clamp(Math.round(n * .5 + swirl * 1.2 - (ny > .3 ? 1 : 0) - (q < .3 ? 1 : 0)) - (d > 1 ? 1 : 0), 0, n)]);
    }
    return s;
  }

  function overhang(seed, d = 0) {
    const r = rng(seed * 13 + 5), s = new Spr(104, 78, 52, 68), B = 68;
    s.ball(52, B - 26, 46, 30, 0, P.rock, { facet: 11, seed, d: .12 });
    s.ball(20, B - 12, 18, 14, 2, P.rock, { facet: 7, seed: seed + 1, d: .12 });
    s.ball(84, B - 11, 17, 13, 2, P.rock, { facet: 7, seed: seed + 2, d: .12 });
    below(s, B);
    s.oval(52, B - 9, 20, 13, (x, y, nx, ny) => Math.hypot(nx, ny) > .84 ? P.rock[ny < 0 ? 0 : 1] : P.ink);
    if (d > 1) s.oval(52, B - 1, 17, d > 2 ? 6 : 3.6, (x, y) => P.litter[1 + Math.round(noise(x * .6, y * .6, seed) * 2.4)]);
    below(s, B);
    moss(s, r, [60, 60, 260, 560][d], 10, 84, B - 54, [22, 22, 36, 50][d]);
    for (let i = 0; i < 12; i++) { const x = 8 + r() * 88, y = B - 1 + r() * 3; s.set(x, y, P.rock[5]); s.set(x + 1, y, P.rock[3]); s.set(x + 1, y + 1, P.rock[1]); }
    for (let i = 0; i < [0, 0, 4, 11][d]; i++) {
      const x = 34 + Math.floor(r() * 36), len = 4 + Math.floor(r() * (d > 2 ? 13 : 7));
      let y = B - 26;
      while (y < B - 4 && s.get(x, y) !== P.ink) y++;
      for (let j = -2; j < len && y + j < B - 1; j++) s.set(x, y + j, P.moss[2 + ((j + i) & 1) + (j > len - 3 ? 1 : 0)]);
    }
    s.outline();
    if (d > 1) { sprouts(s, r, 10, 94, d > 2 ? 30 : 10, P.moss, 3); tufts(s, r, 4, 100, B + 2, d > 2 ? 34 : 12, P.grass, d > 2 ? 7 : 4); }
    s.sh = { rx: 50, ry: 11, dx: 8, dy: 0 };
    return s;
  }

  function brush(seed, d = 0) {
    const r = rng(seed * 17 + 9), s = new Spr(54, 30, 27, 26), B = 26, flat = d > 1, wood = flat ? P.woodGrey : P.wood;
    s.ball(27, B - (flat ? 4 : 7), 22, flat ? 5 : 9, 0, P.soil, { n: .5, ns: .5, d: .16, seed });
    below(s, B);
    for (let i = 0; i < (flat ? 16 : 26); i++) { const x = 6 + r() * 40, y = B - (flat ? 8 : 14) + r() * (flat ? 6 : 10), a = (r() - .5) * 1.6, l = 6 + r() * 9; s.line(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l * .4, wood[2 + Math.floor(r() * 4)]); }
    for (let i = 0; i < (flat ? 10 : 30); i++) { const x = 6 + r() * 42, y = B - 15 + r() * 11; if (s.get(x, y)) s.set(x, y, P.litter[2 + Math.floor(r() * 3)]); }
    s.outline();
    if (flat) tufts(s, r, 4, 50, B + 1, 14, P.grass, 5);
    s.sh = { rx: 23, ry: 5, dx: 4, dy: 0, k: flat ? .5 : 1 };
    return s;
  }

  function ribs(seed, d = 0) {
    const s = new Spr(46, 28, 23, 24), r = rng(seed + 9), old = d > 1, ramp = old ? BLEACHED : P.bone, stain = d ? P.soilRich : P.red;
    if (!old) for (let i = 0; i < 16; i++) s.set(8 + r() * 30, 18 + r() * 6, stain[r() > .6 ? 1 : 0]);
    s.line(9, 16, d > 2 ? 22 : 35, d > 2 ? 15 : 14, ramp[4]); s.line(9, 17, d > 2 ? 22 : 35, d > 2 ? 16 : 15, ramp[2]);
    for (let i = 0; i < 6; i++) {
      if (d > 2 ? i > 2 : old && (i === 1 || i === 4)) continue;
      const x = 12 + i * 4, y = 16 - i * .3, h = 9 - Math.abs(i - 2.2) * 1.2;
      s.line(x, y, x - 1, y - h * .6, ramp[5]); s.line(x - 1, y - h * .6, x + 2, y - h, ramp[5]); s.line(x + 2, y - h, x + 3, y - h + 2, ramp[3]); s.line(x + 1, y + 1, x + 2, y + 5, ramp[4]);
    }
    const [hx, hy] = [[38, 13], [38, 13], [40, 20], [33, 21]][d];
    s.oval(hx, hy, 3.6, 3, () => ramp[5]); s.rect(hx + 2, hy + 1, 3, 2, ramp[4]); s.set(hx, hy - 1, P.ink); s.set(hx + 3, hy + 3, ramp[2]);
    bone(s, 3, 22, 7, -1, ramp);
    if (old) { bone(s, 24, 23, 6, 1, ramp); bone(s, 27, 8 + d * 2, 5, -1, ramp); }
    s.outline();
    if (old) { mossed(s, r, d > 2 ? .2 : .06, P.moss); tufts(s, r, 3, 43, 26, d > 2 ? 12 : 7, P.grass, d > 2 ? 6 : 4); }
    s.sh = { rx: 18, ry: 4, dx: 3, dy: 0, k: old ? .4 : .7 };
    return s;
  }

  function skeleton(seed, d = 0) {
    const s = new Spr(50, 22, 25, 18), r = rng(seed + 5), old = d > 1, ramp = old ? BLEACHED : P.bone;
    s.oval(9, 12, 4, 3.8, (x, y, nx, ny) => ramp[nx + ny < -.2 ? 5 : 4]); s.set(8, 11, P.ink); s.set(10, 11, P.ink); s.rect(8, 14, 3, 1, ramp[2]);
    if (d < 3) s.line(13, 13, 30, 14, ramp[4]);
    for (let i = 0; i < [5, 5, 3, 0][d]; i++) { const x = 16 + i * (old ? 5 : 3); s.line(x, 10, x + 1, 13, ramp[5]); s.line(x, 15, x + 1, 17, ramp[3]); }
    for (const [x, y, len, dy] of [[30, 13, 9, -3], [31, 15, 10, 1], [15, 7, 7, -2], [20, 18, 6, 0]].slice(0, [4, 4, 3, 2][d])) bone(s, x + (old ? 4 : 0), y, len, dy, ramp);
    for (let i = 0; i < [9, 9, 3, 0][d]; i++) s.set(12 + r() * 30, 16 + r() * 3, P.cloth[1 + (i & 1)]);
    s.outline();
    if (old) { mossed(s, r, d > 2 ? .22 : .07, P.moss); tufts(s, r, 3, 47, 20, d > 2 ? 12 : 7, P.grass, d > 2 ? 6 : 4); }
    return s;
  }

  function stakes(seed, n, d = 0) {
    const r = rng(seed * 5 + 2), w = n * 9 + 12, s = new Spr(w, 34, w >> 1, 30), B = 30, old = d > 1, post = old ? P.woodGrey : P.wood, tip = old ? P.woodGrey : P.plank;
    for (let i = 0; i < n; i++) {
      const x = 6 + i * 9 + r() * 2, lean = (r() - .5) * 5, top = B - 20 - r() * 6;
      const fate = !old ? 0 : d > 2 ? (i === seed % n ? 1 : i === (seed + 1) % n ? 2 : 3) : hash(seed, i, 23) < .3 ? 2 : 1;
      if (fate === 3) continue;
      if (fate === 2) { s.thick(x - 5, B, x + 8, B - 2 + (i & 1) * 3, 3, post, 2); s.set(x + 9, B - 1 + (i & 1) * 3, tip[4]); continue; }
      const tilt = clamp(lean * (fate ? 3.2 : 1), 3 - x, w - 4 - x), head = d > 2 ? B - 13 : top;
      s.thick(x, B, x + tilt, head + 5, 3, post, 3); s.thick(x + tilt, head + 5, x + tilt + .5, head, 1, tip, 5); s.set(x + tilt, head + 5, tip[4]);
    }
    if (!old) { s.thick(4, B - 9, n * 9 + 6, B - 11, 2, P.wood, 2); for (let i = 0; i < n; i++) s.rect(5 + i * 9, B - 11, 3, 3, P.leather[3]); }
    else if (d === 2) s.thick(4, B - 9, 4 + n * 5, B - 3, 2, post, 2);
    s.outline();
    if (old) tufts(s, r, 2, w - 2, B + 2, d > 2 ? 18 : 8, P.grass, d > 2 ? 8 : 5);
    s.sh = { rx: n * 4.5 + 4, ry: 3, dx: 4, dy: 0, k: old ? .5 : 1 };
    return s;
  }

  function totem(seed, d = 0) {
    const r = rng(seed * 7 + 5), up = new Spr(44, 62, 15, 58), B = 58, old = d > 1, wood = old ? P.woodGrey : P.wood, ramp = old ? BLEACHED : P.bone;
    up.thick(14, B, 14, B - 44, 3, wood, 3);
    up.thick(4, B - 34, 26, B - 36, 2, wood, 3);
    if (d < 3) for (const [x, len] of [[5, 9], [9, 6], [21, 7], [25, 10]]) { const l = old ? len >> 1 : len, c = old ? 0 : 2 + (x & 1); if (old && x === 9) continue; up.rect(x, B - 33, 2, l, P.red[c]); up.set(x, B - 33 + l, P.red[old ? 0 : 1]); }
    up.oval(15, B - 47, 5, 5, (x, y, nx, ny) => ramp[nx + ny < -.2 ? 5 : 4]); up.rect(12, B - 48, 2, 2, P.ink); up.rect(16, B - 48, 2, 2, P.ink); up.rect(13, B - 43, 5, 2, ramp[3]); up.set(15, B - 43, P.ink);
    up.thick(10, B - 50, 4, B - 57, 2, ramp, 4);
    if (!old) up.thick(20, B - 50, 26, B - 57, 2, ramp, 3);
    const s = d > 2 ? felled(up) : d > 1 ? leant(up, .17) : up;
    s.outline();
    if (old) { mossed(s, r, d > 2 ? .2 : .08, P.moss); tufts(s, r, d > 2 ? 2 : 8, d > 2 ? 60 : 24, s.ay + 2, d > 2 ? 26 : 6, P.grass, d > 2 ? 8 : 5); }
    if (d < 3) s.sh = { rx: 7, ry: 3, dx: 4, dy: 0 };
    return s;
  }

  function hut(seed, d = 0) {
    const r = rng(seed * 11 + 1), B = 48, old = d > 1, wood = old ? P.woodGrey : P.wood;
    let s = new Spr(70, 54, 35, 48);
    const frame = () => {
      bent(s, 7, B - 3, 7, B - 30, 35, B - 33, 1, wood, 1); bent(s, 63, B - 3, 63, B - 30, 35, B - 33, 1, wood, 1);
      bent(s, 21, B, 19, B - 30, 35, B - 34, 2, wood, 3, d > 2 ? .55 : 1); bent(s, 50, B, 52, B - 30, 35, B - 34, 2, wood, 2);
      if (d < 3) bent(s, 8, B - 14, 35, B - 8, 62, B - 14, 1, wood, 2);
    };
    if (d > 2) {
      frame();
      s.thick(24, B, 40, B + 2, 2, wood, 2);
      for (const [x, y, rx, ry] of [[10, B - 6, 6, 7], [53, B - 5, 7, 6]]) s.oval(x, y, rx, ry, (px, py) => noise(px * .45, py * .45, seed + px) > .46 ? P.leather[1 + Math.round(noise(px * .3, py * .3, seed) * 2.4)] : null);
      below(s, B + 2);
      faded(s, .4);
    } else {
      const top = d > 1 ? 4 : 0, inside = dark(P.leather[0], .55);
      let back = null;
      if (old) { frame(); back = s.c.slice(); }
      s.ball(35, B - 6, 31, 24 - top, 0, P.leather, { n: .5, ns: .3, d: .16, seed });
      const torn = (x, y) => y < B - 9 && noise(x * .15, y * .19, seed + 5) > .61;
      if (old) for (let y = 0; y < B; y++) for (let x = 0; x < s.w; x++) {
        const i = y * s.w + x;
        if (s.z[i] < -1e8 || !torn(x, y)) continue;
        s.c[i] = back[i] || inside;
        if (!torn(x, y - 1) && hash(x, y, seed) < .4) for (let j = 0; j < 2 + hash(x, seed, 3) * 4; j++) s.set(x, y + j, P.leather[2]);
      }
      below(s, B);
      for (let i = 0; i < 7; i++) { const x = 10 + r() * 50, y = B - 26 + r() * 18; if (!old && s.get(x, y)) { s.rect(x, y, 6, 1, P.leather[1]); s.rect(x, y + 1, 1, 5, P.leather[1]); s.set(x + 3, y + 3, P.cloth[3]); } }
      for (const x of [16, 35, 54]) { s.thick(x, B - 22 - (x === 35 ? 8 : 0) + top, 35 + (x - 35) * .15, B - 36 + top, 2, wood, 3); }
      s.thick(30, B - 34 + top, 28, B - 42 + top, 2, wood, 4); s.thick(38, B - 35 + top, 42, B - 43 + top, 2, wood, 2);
      s.oval(35, B - 5, 9, 11 - top, (x, y, nx, ny) => Math.hypot(nx, ny) > .82 ? P.leather[0] : P.ink);
      below(s, B);
      grassed(s, r, 4, 66, B - (old ? 12 : 6), B, old ? 150 : 40, old ? P.grass : P.grassDry);
      if (old) { faded(s, .28); s = slumped(s, 36, .13); below(s, B); }
    }
    s.outline();
    if (old) { mossed(s, r, d > 2 ? .16 : .1, P.moss); tufts(s, r, 3, 67, B + 2, d > 2 ? 44 : 16, P.grass, d > 2 ? 9 : 5); }
    s.sh = { rx: 33, ry: 8, dx: 7, dy: 0, k: d > 2 ? .3 : 1 };
    return s;
  }

  function spit(seed, d = 0) {
    const r = rng(seed * 3 + 1), s = new Spr(44, 34, 22, 30), B = 30, old = d > 1, wood = old ? P.woodGrey : P.wood;
    for (const x of [6, 36]) {
      if (old && x > 20) { if (d === 2) s.thick(24, B, 40, B - 2, 2, wood, 2); continue; }
      const h = d > 2 ? 11 : 18, tilt = d > 2 ? 3 : 0;
      s.thick(x, B, x + tilt, B - h, 2, wood, 3); s.line(x + tilt, B - h, x + tilt - 3, B - h - 5, wood[4]); s.line(x + tilt + 1, B - h, x + tilt + 4, B - h - 5, wood[2]);
    }
    if (!old) s.thick(4, B - 19, 40, B - 19, 1, P.wood, 4);
    else if (d === 2) s.thick(5, B - 19, 31, B - 1, 1, wood, 4);
    if (!d) { s.ball(22, B - 18, 11, 5, 2, P.furRust, { d: .16, n: .3 }); s.ball(31, B - 19, 4, 3.4, 3, P.furRust, { d: .16 }); for (const x of [15, 26]) s.rect(x, B - 14, 2, 4, P.furRust[1]); }
    s.outline();
    if (old) tufts(s, r, 2, 42, B + 2, d > 2 ? 14 : 7, P.grass, d > 2 ? 8 : 5);
    s.sh = { rx: 18, ry: 3, dx: 3, dy: 0, k: old ? .4 : 1 };
    return s;
  }

  function eggs(seed, n, d = 0) {
    const r = rng(seed * 3 + 7), s = new Spr(58, 34, 29, 28), B = 28, old = d > 1, low = d > 2;
    s.ball(29, B - (low ? 5 : 6), 26, low ? 8 : 10, 0, P.mud, { n: .5, ns: .5, d: .16, seed });
    below(s, B);
    for (let i = 0; i < [60, 60, 30, 12][d]; i++) { const a = r() * 6.283, x = 29 + Math.cos(a) * (14 + r() * 12), y = B - 7 + Math.sin(a) * (4 + r() * 5); if (s.get(x, y)) s.line(x, y, x + (r() - .5) * 7, y - 1 - r() * 3, (old ? P.grassDry : P.mossSwamp)[2 + Math.floor(r() * 3)]); }
    s.oval(29, B - (low ? 8 : 10), low ? 10 : 13, low ? 2.6 : 5, () => P.mud[1]);
    for (let i = 0; i < n; i++) {
      const x = 29 + (i - (n - 1) / 2) * 5.4 + (r() - .5), y = B - 11 - (i & 1) * 2;
      if (!old) { s.oval(x, y, 2.9, 3.6, (px, py, nx, ny) => P.cloth[nx + ny < -.2 ? 5 : nx + ny < .6 ? 4 : 2]); s.set(x + 1, y + 1, P.mossSwamp[3]); }
      else if (!low && i % 3 < 2) s.oval(x, y + 1, 2.9, 3.4, (px, py, nx, ny) => ny < -.2 + (px & 1) * .32 ? null : ny < .22 ? P.mud[0] : P.cloth[nx < 0 ? 4 : 2]);
      if (old) for (let j = 0; j < 3; j++) s.set(x - 5 + r() * 10, y + (low ? 4 : 2) + r() * 4, P.cloth[4 + (j & 1)]);
    }
    if (low) grassed(s, r, 4, 54, B - 13, B, 90, P.mossSwamp);
    s.outline();
    if (old) { sprouts(s, r, 6, 52, low ? 20 : 8, P.mossSwamp, 3); tufts(s, r, 3, 55, B + 2, low ? 26 : 10, P.grassLoam, low ? 9 : 5); }
    s.sh = { rx: 27, ry: 6, dx: 5, dy: 0, k: low ? .5 : 1 };
    return s;
  }

  function sticks(s, r, cx, cy, rx, ry, n, wood = P.wood, loose = false) {
    if (!loose) s.oval(cx, cy, rx, ry, () => wood[1]);
    for (let a = 0; a < n; a++) { const t = r() * 6.283, rr = .7 + r() * .36, x = cx + Math.cos(t) * rx * rr, y = cy + Math.sin(t) * ry * rr, l = 4 + r() * 6, ang = t + 1.57 + (r() - .5); s.line(x, y, x + Math.cos(ang) * l, y + Math.sin(ang) * l * .5, wood[2 + Math.floor(r() * 4)]); }
    if (!loose) s.oval(cx, cy, rx * .56, ry * .5, () => wood[0]);
  }
  function spire(seed, tall, hoard, d = 0) {
    const r = rng(seed * 23 + 11), H = tall, s = new Spr(64, H + 44, 32, H + 34), B = H + 34, old = d > 1;
    for (let k = 0; k < 5; k++) { const u = k / 4; s.ball(32 + (r() - .5) * 6, B - 8 - u * (H - 12), 22 - u * 9, 13 - u * 3, k, P.rock, { facet: 8 - k, seed: seed + k, d: .12 }); }
    s.ball(14, B - 5, 9, 7, 5, P.rock, { facet: 5, seed: seed + 9, d: .12 }); s.ball(51, B - 4, 8, 6, 5, P.rock, { facet: 5, seed: seed + 10, d: .12 });
    below(s, B);
    for (let i = 0; i < [14, 14, 7, 2][d]; i++) { const x = 16 + Math.floor(r() * 32), y = B - H + 6 + Math.floor(r() * (H - 10)); if (s.get(x, y)) { s.set(x, y, P.cloth[4]); s.set(x, y + 1, P.cloth[3]); s.set(x, y + 2, P.cloth[2]); } }
    if (old) moss(s, r, d > 2 ? 190 : 70, 8, 48, B - H - 4, H);
    if (!old) sticks(s, r, 32, B - H - 2, 17, 7, 100);
    else {
      if (d === 2) sticks(s, r, 33, B - H - 1, 14, 5.5, 55, P.woodGrey);
      else { sticks(s, r, 32, B - H, 11, 3.6, 12, P.woodGrey, true); canopy(s, 30, B - H - 5, 6, 4, P.oak, seed, { cr: 2.6, n: 6, z: 9 }); }
      for (let i = 0; i < (d > 2 ? 3 : 8); i++) { const x = 19 + r() * 27, y = B - H + 2; s.line(x, y, x + (r() - .5) * 4, y + 5 + r() * 13, P.woodGrey[2 + (i % 3)]); }
      sticks(s, r, 47, B - 3, 12, 3, d > 2 ? 30 : 14, P.woodGrey, true);
    }
    if (hoard && d < 3) for (const [x, c] of [[26, P.gold], [31, GEM.citrine], [36, P.gold], [29, GEM.amethyst]]) { s.set(x, B - H - 3, c[4], 200); s.set(x + 1, B - H - 3, c[3], 200); s.set(x, B - H - 2, c[2]); }
    s.outline();
    if (old) tufts(s, r, 4, 60, B + 2, d > 2 ? 30 : 10, P.grassDry, d > 2 ? 8 : 4);
    s.sh = { rx: 26, ry: 8, dx: 8, dy: 0 };
    s.top = H + 2;
    return s;
  }
  function groundNest(seed, hoard, d = 0) {
    const r = rng(seed * 29 + 1), s = new Spr(56, 30, 28, 24), B = 24, old = d > 1;
    sticks(s, r, 28, B - 8, 24, old ? 7 : 9, [150, 150, 90, 36][d], old ? P.woodGrey : P.wood, d > 2);
    if (hoard) for (const [x, y, c] of [[20, B - 9, P.gold], [26, B - 11, GEM.citrine], [32, B - 8, P.gold], [36, B - 10, GEM.amethyst], [24, B - 7, P.copper]].slice(0, d > 2 ? 3 : 5)) { s.rect(x, y, 2, 2, c[4], 200); s.set(x + 1, y + 1, c[2]); s.set(x, y - 1, c[5] || c[4], 220); }
    s.outline();
    if (old) tufts(s, r, 4, 52, B + 1, d > 2 ? 22 : 9, P.grassDry, d > 2 ? 8 : 4);
    s.sh = { rx: 25, ry: 6, dx: 4, dy: 0, k: old ? .4 : .8 };
    return s;
  }

  function clawed(tree, d = 0) {
    const s = LAIR.copy(tree), cx = s.ax, scar = d > 2 ? [P.woodGrey[1], P.woodGrey[2]] : d > 1 ? [P.woodGrey[3], P.woodGrey[4]] : [P.plank[3], P.plank[5]];
    for (const dx of [-3, 0, 3]) for (let j = 0; j < 12; j++) { const x = cx + dx + (j >> 2), y = s.ay - 9 - j; if (s.get(x, y)) s.set(x, y, scar[j < 2 || j > 9 ? 0 : 1]); }
    s.pk = null;
    return s;
  }

  function firepit(seed, d) {
    const r = rng(seed * 7 + 31), s = new Spr(40, 52, 20, 44), old = d > 1;
    stoneRing(s, 20, 38, 12, 5, 12, true);
    s.oval(20, 38, 9, 3.6, (x, y) => d > 2 ? P.grass[1 + (hash(x, y, 3) > .5 ? 1 : 0)] : hash(x, y, seed) > (old ? .88 : .6) ? P.stone[old ? 3 : 5] : (old ? P.soilRich : P.furDark)[hash(x, y, 5) > .5 ? 1 : 0]);
    if (d < 3) { s.thick(9, 40, 30, 34, 3, P.furDark, 2); s.oval(9.5, 41, 1.8, 1.8, () => P.stone[4]); }
    if (!old) { s.thick(10, 34, 31, 40, 3, P.furDark, 1); s.oval(31, 41, 1.8, 1.8, () => P.stone[3]); for (let i = 0; i < 7; i++) s.set(14 + r() * 12, 36 + r() * 4, P.stone[5]); }
    stoneRing(s, 20, 38, 12, 5, 12, false);
    s.outline();
    if (old) { mossed(s, r, d > 2 ? .3 : .15, P.moss); tufts(s, r, 13, 28, 41, d > 2 ? 12 : 4, P.grass, d > 2 ? 7 : 4); tufts(s, r, 5, 36, 46, d > 2 ? 12 : 6, P.grass, d > 2 ? 6 : 4); }
    s.sh = { rx: 15, ry: 5, dx: 4, dy: 0, k: .5 };
    return s;
  }

  function rack(seed, d) {
    const r = rng(seed * 13 + 17), s = new Spr(40, 52, 20, 44), B = 44, wood = P.woodGrey;
    if (d < 3) {
      for (const x of [5, 32]) { s.rect(x, B - 28, 3, 29, wood[x < 20 ? 3 : 2]); s.rect(x, B - 28, 1, 29, wood[5]); }
      s.tube(4, B - 28, 32, 3, () => wood[3]);
      s.thick(7, B - 15, 27, B - 2, 2, wood, 2);
      for (const x of [11, 19, 27]) s.line(x, B - 25, x, B - 21 + (x % 5), P.cloth[2]);
    } else {
      s.thick(6, B, 11, B - 17, 3, wood, 2); s.thick(13, B - 1, 36, B - 4, 3, wood, 2); s.thick(17, B + 1, 33, B + 2, 2, wood, 1);
    }
    s.outline();
    mossed(s, r, d > 2 ? .2 : .08, P.moss);
    tufts(s, r, 2, 38, B + 2, d > 2 ? 20 : 8, P.grass, d > 2 ? 9 : 5);
    s.sh = { rx: 17, ry: 5, dx: 5, dy: 0, k: d > 2 ? .3 : .7 };
    return s;
  }

  function weeds(seed, w, lush, turf) {
    const r = rng(seed * 37 + 13), s = new Spr(w, 26, w >> 1, 21), B = 21;
    for (let i = 0; i < w * .7 * lush; i++) {
      const x = 3 + r() * (w - 6), y = B - r() * 5, len = 3 + r() * (4 + lush * 5), lean = (r() - .5) * .5, ramp = i % 3 ? turf : P.grassLoam;
      for (let j = 0; j < len; j++) s.set(x + lean * j, y - j, ramp[clamp(1 + Math.floor(j * 4 / len), 0, ramp.length - 1)]);
      if (i % 5 === 0) s.set(x + lean * len, y - len, P.savanna[4]);
    }
    s.outline(dark(P.oak[0], .5));
    s.sway = 1.6;
    return s;
  }

  function sapling(seed, kind) {
    const k = TREES[kind], r = rng(seed * 41 + 3), s = new Spr(40, 60, 20, 54), B = 54, h = 20 + Math.floor(r() * 12), top = 20 + (r() - .5) * 5;
    s.thick(20, B, top, B - h, 2, k.trunk, k.trunk.length - 3);
    for (let i = 0; i < 3; i++) {
      const cy = B - h + i * 6, side = i % 2 ? 1 : -1;
      if (i) s.thick(mix(top, 20, i * 6 / h), cy + 3, top + side * 5, cy, 1, k.trunk, 2);
      canopy(s, top + (i ? side * 5 : 0), cy - (i ? 0 : 2), 7 - i, 5 - i * .6, k.leaf, seed + i * 7, { cr: 2.8, z: i });
    }
    s.outline(dark(k.leaf[0], .5));
    s.sh = { rx: 9, ry: 3.4, dx: 4, dy: 0, k: .8 };
    s.sway = 2.4;
    s.leaf = k.leaf;
    return s;
  }

  function weathered(src, d, seed, turf) {
    if (d < 2) return src;
    const s = LAIR.copy(src), r = rng(seed * 43 + d), b = bounds(src);
    faded(s, d > 2 ? .55 : .3);
    mossed(s, r, d > 2 ? .16 : .07, P.moss);
    tufts(s, r, b[0], b[2] + 1, b[3] + 1, (b[2] - b[0]) * (d > 2 ? .45 : .2), turf, d > 2 ? clamp((b[3] - b[1]) * .45, 4, 9) : 4);
    return s;
  }

  return { den, bed, overhang, brush, ribs, skeleton, stakes, totem, hut, spit, eggs, spire, groundNest, clawed, firepit, rack, weeds, sapling, weathered, sticks };
})();
