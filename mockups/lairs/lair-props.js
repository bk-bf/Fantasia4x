'use strict';
const LAIR_PROPS = (() => {
  const below = (s, row) => { for (let y = row + 1; y < s.h; y++) for (let x = 0; x < s.w; x++) s.c[y * s.w + x] = null; };
  const grassed = (s, r, x0, x1, y0, y1, n, ramp) => { for (let i = 0; i < n; i++) { const x = x0 + Math.floor(r() * (x1 - x0)), y = y0 + Math.floor(r() * (y1 - y0)); if (!s.get(x, y)) continue; s.set(x, y, ramp[2 + Math.floor(r() * 3)]); if (i % 3 === 0 && s.get(x, y - 1)) { s.set(x, y - 1, ramp[4]); s.set(x, y - 2, ramp[3]); } } };
  const bone = (s, x, y, len, dy) => { s.line(x, y, x + len, y + (dy || 0), P.bone[5]); s.line(x, y + 1, x + len, y + 1 + (dy || 0), P.bone[3]); for (const [ex, ey] of [[x, y], [x + len, y + (dy || 0)]]) { s.set(ex, ey - 1, P.bone[5]); s.set(ex, ey + 2, P.bone[4]); } };

  function den(seed, mouths) {
    const r = rng(seed * 19 + 3), s = new Spr(92, 56, 46, 48), B = 48;
    s.ball(46, B - 11, 42, 17, 0, P.soil, { n: .4, ns: .4, d: .14, seed });
    s.ball(24, B - 7, 20, 11, 1, P.soil, { n: .4, ns: .4, d: .14, seed: seed + 1 });
    s.ball(70, B - 6, 18, 10, 1, P.soil, { n: .4, ns: .4, d: .14, seed: seed + 2 });
    below(s, B);
    grassed(s, r, 4, 88, B - 29, B - 14, 240, P.grass);
    for (const hx of mouths) {
      s.oval(hx, B - 6, 10, 8, (x, y, nx, ny) => Math.hypot(nx, ny) > .8 ? P.soilRich[ny < 0 ? 0 : 2] : P.ink);
      for (const [dx, bend] of [[-9, 4], [-2, -3], [6, 3]]) { s.thick(hx + dx, B - 20, hx + dx + bend, B - 10, 2, P.wood, 3); s.thick(hx + dx + bend, B - 10, hx + dx + bend * 1.6, B - 5, 1, P.wood, 2); }
      for (let i = 0; i < 16; i++) { const x = hx - 13 + r() * 26, y = B + 1 + r() * 4; s.set(x, y, P.soil[4 + (i & 1)]); s.set(x + 1, y, P.soil[3]); }
    }
    for (let i = 0; i < 10; i++) { const x = 8 + r() * 76, y = B - 1 + r() * 2; s.set(x, y, P.rockWarm[5]); s.set(x + 1, y, P.rockWarm[3]); }
    s.outline();
    s.sh = { rx: 44, ry: 9, dx: 7, dy: 0 };
    return s;
  }

  function bed(seed, ramp, soil, w) {
    const h = Math.round(w * .46), s = new Spr(w, h, w >> 1, 0), n = ramp.length - 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const nx = (x - w / 2) / (w / 2 - 2), ny = (y - h / 2) / (h / 2 - 1), q = Math.hypot(nx, ny) + (noise(x * .3, y * .3, seed) - .5) * .3;
      if (q > 1 || (q > .8 && dith(x, y) > (1 - q) * 5)) continue;
      const swirl = Math.sin(Math.atan2(ny, nx) * 6 + q * 8 + seed);
      s.set(x, y, q > .72 ? soil[clamp(2 + (ny > 0 ? -1 : 1), 0, soil.length - 1)] : ramp[clamp(Math.round(n * .5 + swirl * 1.2 - (ny > .3 ? 1 : 0) - (q < .3 ? 1 : 0)), 0, n)]);
    }
    return s;
  }

  function overhang(seed) {
    const r = rng(seed * 13 + 5), s = new Spr(104, 78, 52, 68), B = 68;
    s.ball(52, B - 26, 46, 30, 0, P.rock, { facet: 11, seed, d: .12 });
    s.ball(20, B - 12, 18, 14, 2, P.rock, { facet: 7, seed: seed + 1, d: .12 });
    s.ball(84, B - 11, 17, 13, 2, P.rock, { facet: 7, seed: seed + 2, d: .12 });
    below(s, B);
    s.oval(52, B - 9, 20, 13, (x, y, nx, ny) => Math.hypot(nx, ny) > .84 ? P.rock[ny < 0 ? 0 : 1] : P.ink);
    below(s, B);
    for (let i = 0; i < 60; i++) { const x = 10 + Math.floor(r() * 84), y = B - 54 + Math.floor(r() * 22); if (s.get(x, y) && s.get(x, y) !== P.ink) { s.set(x, y, P.moss[3 + (i % 3)]); if (i % 4 === 0) s.set(x, y - 1, P.moss[5]); } }
    for (let i = 0; i < 12; i++) { const x = 8 + r() * 88, y = B - 1 + r() * 3; s.set(x, y, P.rock[5]); s.set(x + 1, y, P.rock[3]); s.set(x + 1, y + 1, P.rock[1]); }
    s.outline();
    s.sh = { rx: 50, ry: 11, dx: 8, dy: 0 };
    return s;
  }

  function brush(seed) {
    const r = rng(seed * 17 + 9), s = new Spr(54, 30, 27, 26), B = 26;
    s.ball(27, B - 7, 22, 9, 0, P.soil, { n: .5, ns: .5, d: .16, seed });
    below(s, B);
    for (let i = 0; i < 26; i++) { const x = 6 + r() * 40, y = B - 14 + r() * 10, a = (r() - .5) * 1.6, l = 6 + r() * 9; s.line(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l * .4, P.wood[2 + Math.floor(r() * 4)]); }
    for (let i = 0; i < 30; i++) { const x = 6 + r() * 42, y = B - 15 + r() * 11; if (s.get(x, y)) s.set(x, y, P.litter[2 + Math.floor(r() * 3)]); }
    s.outline();
    s.sh = { rx: 23, ry: 5, dx: 4, dy: 0 };
    return s;
  }

  function ribs(seed) {
    const s = new Spr(46, 28, 23, 24), r = rng(seed + 9);
    for (let i = 0; i < 16; i++) s.set(8 + r() * 30, 18 + r() * 6, P.red[r() > .6 ? 1 : 0]);
    s.line(9, 16, 35, 14, P.bone[4]); s.line(9, 17, 35, 15, P.bone[2]);
    for (let i = 0; i < 6; i++) { const x = 12 + i * 4, y = 16 - i * .3, h = 9 - Math.abs(i - 2.2) * 1.2; s.line(x, y, x - 1, y - h * .6, P.bone[5]); s.line(x - 1, y - h * .6, x + 2, y - h, P.bone[5]); s.line(x + 2, y - h, x + 3, y - h + 2, P.bone[3]); s.line(x + 1, y + 1, x + 2, y + 5, P.bone[4]); }
    s.oval(38, 13, 3.6, 3, () => P.bone[5]); s.rect(40, 14, 3, 2, P.bone[4]); s.set(38, 12, P.ink); s.set(41, 16, P.bone[2]);
    bone(s, 3, 22, 7, -1);
    s.outline();
    s.sh = { rx: 18, ry: 4, dx: 3, dy: 0, k: .7 };
    return s;
  }

  function skeleton(seed) {
    const s = new Spr(50, 22, 25, 18), r = rng(seed + 5);
    s.oval(9, 12, 4, 3.8, (x, y, nx, ny) => P.bone[nx + ny < -.2 ? 5 : 4]); s.set(8, 11, P.ink); s.set(10, 11, P.ink); s.rect(8, 14, 3, 1, P.bone[2]);
    s.line(13, 13, 30, 14, P.bone[4]);
    for (let i = 0; i < 5; i++) { const x = 16 + i * 3; s.line(x, 10, x + 1, 13, P.bone[5]); s.line(x, 15, x + 1, 17, P.bone[3]); }
    bone(s, 30, 13, 9, -3); bone(s, 31, 15, 10, 1); bone(s, 15, 7, 7, -2); bone(s, 20, 18, 6, 0);
    for (let i = 0; i < 9; i++) s.set(12 + r() * 30, 16 + r() * 3, P.cloth[1 + (i & 1)]);
    s.outline();
    return s;
  }

  function stakes(seed, n) {
    const r = rng(seed * 5 + 2), s = new Spr(n * 9 + 12, 34, (n * 9 + 12) >> 1, 30), B = 30;
    for (let i = 0; i < n; i++) { const x = 6 + i * 9 + r() * 2, lean = (r() - .5) * 5, top = B - 20 - r() * 6; s.thick(x, B, x + lean, top + 5, 3, P.wood, 3); s.thick(x + lean, top + 5, x + lean + .5, top, 1, P.plank, 5); s.set(x + lean, top + 5, P.plank[4]); }
    s.thick(4, B - 9, n * 9 + 6, B - 11, 2, P.wood, 2);
    for (let i = 0; i < n; i++) s.rect(5 + i * 9, B - 11, 3, 3, P.leather[3]);
    s.outline();
    s.sh = { rx: n * 4.5 + 4, ry: 3, dx: 4, dy: 0 };
    return s;
  }

  function totem(seed) {
    const s = new Spr(30, 62, 15, 58), B = 58;
    s.thick(14, B, 14, B - 44, 3, P.wood, 3);
    s.thick(4, B - 34, 26, B - 36, 2, P.wood, 3);
    for (const [x, len] of [[5, 9], [9, 6], [21, 7], [25, 10]]) { s.rect(x, B - 33, 2, len, P.red[2 + (x & 1)]); s.set(x, B - 33 + len, P.red[1]); }
    s.oval(15, B - 47, 5, 5, (x, y, nx, ny) => P.bone[nx + ny < -.2 ? 5 : 4]); s.rect(12, B - 48, 2, 2, P.ink); s.rect(16, B - 48, 2, 2, P.ink); s.rect(13, B - 43, 5, 2, P.bone[3]); s.set(15, B - 43, P.ink);
    s.thick(10, B - 50, 4, B - 57, 2, P.bone, 4); s.thick(20, B - 50, 26, B - 57, 2, P.bone, 3);
    s.outline();
    s.sh = { rx: 7, ry: 3, dx: 4, dy: 0 };
    return s;
  }

  function hut(seed) {
    const r = rng(seed * 11 + 1), s = new Spr(70, 54, 35, 48), B = 48;
    s.ball(35, B - 6, 31, 24, 0, P.leather, { n: .5, ns: .3, d: .16, seed });
    below(s, B);
    for (let i = 0; i < 7; i++) { const x = 10 + r() * 50, y = B - 26 + r() * 18; if (s.get(x, y)) { s.rect(x, y, 6, 1, P.leather[1]); s.rect(x, y + 1, 1, 5, P.leather[1]); s.set(x + 3, y + 3, P.cloth[3]); } }
    for (const x of [16, 35, 54]) { s.thick(x, B - 22 - (x === 35 ? 8 : 0), 35 + (x - 35) * .15, B - 36, 2, P.wood, 3); }
    s.thick(30, B - 34, 28, B - 42, 2, P.wood, 4); s.thick(38, B - 35, 42, B - 43, 2, P.wood, 2);
    s.oval(35, B - 5, 9, 11, (x, y, nx, ny) => Math.hypot(nx, ny) > .82 ? P.leather[0] : P.ink);
    below(s, B);
    grassed(s, r, 4, 66, B - 6, B, 40, P.grassDry);
    s.outline();
    s.sh = { rx: 33, ry: 8, dx: 7, dy: 0 };
    return s;
  }

  function spit(seed) {
    const s = new Spr(44, 34, 22, 30), B = 30;
    for (const x of [6, 36]) { s.thick(x, B, x, B - 18, 2, P.wood, 3); s.line(x, B - 18, x - 3, B - 23, P.wood[4]); s.line(x + 1, B - 18, x + 4, B - 23, P.wood[2]); }
    s.thick(4, B - 19, 40, B - 19, 1, P.wood, 4);
    s.ball(22, B - 18, 11, 5, 2, P.furRust, { d: .16, n: .3 }); s.ball(31, B - 19, 4, 3.4, 3, P.furRust, { d: .16 });
    for (const x of [15, 26]) s.rect(x, B - 14, 2, 4, P.furRust[1]);
    s.outline();
    s.sh = { rx: 18, ry: 3, dx: 3, dy: 0 };
    return s;
  }

  function eggs(seed, n) {
    const r = rng(seed * 3 + 7), s = new Spr(58, 34, 29, 28), B = 28;
    s.ball(29, B - 6, 26, 10, 0, P.mud, { n: .5, ns: .5, d: .16, seed });
    below(s, B);
    for (let i = 0; i < 60; i++) { const a = r() * 6.283, x = 29 + Math.cos(a) * (14 + r() * 12), y = B - 7 + Math.sin(a) * (4 + r() * 5); if (s.get(x, y)) s.line(x, y, x + (r() - .5) * 7, y - 1 - r() * 3, P.mossSwamp[2 + Math.floor(r() * 3)]); }
    s.oval(29, B - 10, 13, 5, () => P.mud[1]);
    for (let i = 0; i < n; i++) { const x = 29 + (i - (n - 1) / 2) * 5.4 + (r() - .5), y = B - 11 - (i & 1) * 2; s.oval(x, y, 2.9, 3.6, (px, py, nx, ny) => P.cloth[nx + ny < -.2 ? 5 : nx + ny < .6 ? 4 : 2]); s.set(x + 1, y + 1, P.mossSwamp[3]); }
    s.outline();
    s.sh = { rx: 27, ry: 6, dx: 5, dy: 0 };
    return s;
  }

  function sticks(s, r, cx, cy, rx, ry, n) {
    s.oval(cx, cy, rx, ry, () => P.wood[1]);
    for (let a = 0; a < n; a++) { const t = r() * 6.283, rr = .7 + r() * .36, x = cx + Math.cos(t) * rx * rr, y = cy + Math.sin(t) * ry * rr, l = 4 + r() * 6, ang = t + 1.57 + (r() - .5); s.line(x, y, x + Math.cos(ang) * l, y + Math.sin(ang) * l * .5, P.wood[2 + Math.floor(r() * 4)]); }
    s.oval(cx, cy, rx * .56, ry * .5, () => P.wood[0]);
  }
  function spire(seed, tall, hoard) {
    const r = rng(seed * 23 + 11), H = tall, s = new Spr(64, H + 44, 32, H + 34), B = H + 34;
    for (let k = 0; k < 5; k++) { const u = k / 4; s.ball(32 + (r() - .5) * 6, B - 8 - u * (H - 12), 22 - u * 9, 13 - u * 3, k, P.rock, { facet: 8 - k, seed: seed + k, d: .12 }); }
    s.ball(14, B - 5, 9, 7, 5, P.rock, { facet: 5, seed: seed + 9, d: .12 }); s.ball(51, B - 4, 8, 6, 5, P.rock, { facet: 5, seed: seed + 10, d: .12 });
    below(s, B);
    for (let i = 0; i < 14; i++) { const x = 16 + Math.floor(r() * 32), y = B - H + 6 + Math.floor(r() * (H - 10)); if (s.get(x, y)) { s.set(x, y, P.cloth[4]); s.set(x, y + 1, P.cloth[3]); s.set(x, y + 2, P.cloth[2]); } }
    sticks(s, r, 32, B - H - 2, 17, 7, 100);
    if (hoard) for (const [x, c] of [[26, P.gold], [31, GEM.citrine], [36, P.gold], [29, GEM.amethyst]]) { s.set(x, B - H - 3, c[4], 200); s.set(x + 1, B - H - 3, c[3], 200); s.set(x, B - H - 2, c[2]); }
    s.outline();
    s.sh = { rx: 26, ry: 8, dx: 8, dy: 0 };
    s.top = H + 2;
    return s;
  }
  function groundNest(seed, hoard) {
    const r = rng(seed * 29 + 1), s = new Spr(56, 30, 28, 24), B = 24;
    sticks(s, r, 28, B - 8, 24, 9, 150);
    if (hoard) for (const [x, y, c] of [[20, B - 9, P.gold], [26, B - 11, GEM.citrine], [32, B - 8, P.gold], [36, B - 10, GEM.amethyst], [24, B - 7, P.copper]]) { s.rect(x, y, 2, 2, c[4], 200); s.set(x + 1, y + 1, c[2]); s.set(x, y - 1, c[5] || c[4], 220); }
    s.outline();
    s.sh = { rx: 25, ry: 6, dx: 4, dy: 0, k: .8 };
    return s;
  }

  function clawed(tree) {
    const s = LAIR.copy(tree), cx = s.ax;
    for (const dx of [-3, 0, 3]) for (let j = 0; j < 12; j++) { const x = cx + dx + (j >> 2), y = s.ay - 9 - j; if (s.get(x, y)) s.set(x, y, P.plank[j < 2 || j > 9 ? 3 : 5]); }
    s.pk = null;
    return s;
  }

  return { den, bed, overhang, brush, ribs, skeleton, stakes, totem, hut, spit, eggs, spire, groundNest, clawed };
})();
