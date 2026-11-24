'use strict';
const SMALL_PROPS = (() => {
  const below = (s, row) => { for (let y = row + 1; y < s.h; y++) for (let x = 0; x < s.w; x++) s.c[y * s.w + x] = null; };
  const tufts = (s, r, x0, x1, base, n, ramp, tall) => { for (let i = 0; i < n; i++) { const x = x0 + Math.floor(r() * (x1 - x0)), h = 2 + Math.floor(r() * tall); for (let j = 0; j < h; j++) s.set(x + (j > h * .6 ? (i & 1 ? 1 : -1) : 0), base - j, ramp[clamp(1 + Math.floor(j * 3 / h), 0, ramp.length - 1)]); } };
  const grassed = (s, r, x0, x1, y0, y1, n, ramp) => { for (let i = 0; i < n; i++) { const x = x0 + Math.floor(r() * (x1 - x0)), y = y0 + Math.floor(r() * (y1 - y0)); if (s.get(x, y) && s.get(x, y) !== P.ink) { s.set(x, y, ramp[2 + Math.floor(r() * 3)]); if (i % 3 === 0 && s.get(x, y - 1)) s.set(x, y - 1, ramp[4]); } } };
  const bits = (s, r, x0, x1, y0, y1, n, cols) => { for (let i = 0; i < n; i++) { const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0), c = cols[i % cols.length]; s.set(x, y, c[c.length - 1]); s.set(x + 1, y, c[Math.max(0, c.length - 3)]); } };
  const FEATHER = [P.furWhite, P.furRust, P.furGrey], FUR = [P.furTan, P.cloth, P.furDark];

  function earth(seed, d = 0) {
    const r = rng(seed * 31 + 7), s = new Spr(96, 54, 48, 44), B = 44, sag = [1, 1, .85, .6][d];
    s.ball(48, B - 10 * sag, 40, 15 * sag, 0, P.soil, { n: .45, ns: .4, d: .14, seed });
    s.ball(22, B - 6 * sag, 18, 9 * sag, 1, P.soil, { n: .4, ns: .4, d: .14, seed: seed + 1 });
    s.ball(76, B - 6 * sag, 17, 9 * sag, 1, P.soil, { n: .4, ns: .4, d: .14, seed: seed + 2 });
    below(s, B);
    for (let i = 0; i < 6; i++) { const x = 18 + r() * 60, y = B - 22 * sag + r() * 8; s.thick(x, y, x + (r() - .5) * 14, y + 6 + r() * 6, 1, P.wood, 2 + (i & 1)); }
    grassed(s, r, 6, 90, B - 26 * sag, B - 12 + [0, 0, 6, 12][d], [200, 200, 520, 1300][d], P.grass);
    for (const [hx, w] of [[34, 7], [58, 6], [74, 5]].slice(0, d > 2 ? 1 : 3)) {
      if (d > 2) { s.oval(hx, B - 3, w, 2.4, () => P.soilRich[1]); continue; }
      s.oval(hx, B - 5, w, w * .75, (x, y, nx, ny) => Math.hypot(nx, ny) > .78 ? P.soilRich[ny < 0 ? 0 : 2] : P.ink);
      if (d < 2) { s.oval(hx + 1, B + 1, w + 4, 3, (x, y) => P.sand[2 + Math.round(noise(x * .5, y * .7, seed) * 2.6)]); bits(s, r, hx - w, hx + w + 4, B, B + 3, 5, FUR); }
    }
    if (d < 2) bits(s, r, 20, 80, B - 2, B + 3, 10, [P.bone, ...FEATHER]);
    s.outline();
    if (d > 1) tufts(s, r, 4, 92, B + 2, d > 2 ? 44 : 16, P.grass, d > 2 ? 7 : 4);
    s.sh = { rx: 40, ry: 8, dx: 6, dy: 0, k: sag };
    return s;
  }

  function eyrie(seed, H, d = 0) {
    const r = rng(seed * 47 + 5), snapped = d > 2, h = snapped ? Math.round(H * .55) : H, s = new Spr(84, H + 46, 42, H + 34), B = H + 34, cx = 42, bark = d > 1 ? P.woodGrey : P.wood;
    for (const [dx, dy, w] of [[-9, 0, 3], [9, 1, 3], [-4, 2, 2], [6, 2, 2]]) s.thick(cx + dx * .3, B - 6, cx + dx, B + dy, w, bark, 2);
    for (let y = 0; y <= h; y++) { const t = y / h, w = 5.6 - t * 2.8, lean = Math.sin(t * 2.2 + seed) * 2.4; for (let x = -w; x <= w; x++) s.set(cx + x + lean, B - y, bark[clamp(Math.round(3 - x / w * 1.6 + (hash(rnd(x), y >> 1, seed) > .82 ? -1 : 0)), 0, 5)]); }
    const top = [cx + Math.sin(2.2 + seed) * 2.4, B - h];
    for (const [y, sd, l] of [[.35, -1, 13], [.55, 1, 11], [.72, -1, 9], [.88, 1, 10]]) { if (y * H > h - 3) continue; const bx = cx + Math.sin(y * 2.2 + seed) * 2.4, by = B - y * H; s.thick(bx, by, bx + sd * l, by - 5 - r() * 4, 1, bark, 3); s.thick(bx + sd * l * .6, by - 3, bx + sd * (l + 3), by - 2, 1, bark, 2); }
    if (!snapped && d < 2) for (const [y, sd] of [[.48, -1], [.66, 1]]) canopy(s, cx + sd * 10, B - y * H - 4, 7, 4.6, P.pine, seed + y * 9, { cr: 3, n: 5, z: 4 });
    if (!snapped) {
      const wash = [16, 16, 6, 0][d];
      for (let i = 0; i < wash; i++) { const x = top[0] - 3 + r() * 7, y0 = top[1] + 4 + r() * 6, len = 4 + r() * 12; for (let j = 0; j < len; j++) if (s.get(x, y0 + j)) s.set(x, y0 + j, P.furWhite[j < 2 ? 4 : 3]); }
      if (d < 2) { LAIR_PROPS.sticks(s, r, top[0], top[1] - 2, 15, 5.5, 110, P.wood); for (let i = 0; i < 10; i++) s.set(top[0] - 8 + r() * 16, top[1] - 5 - r() * 2, P.pine[3 + (i & 1)]); }
      else LAIR_PROPS.sticks(s, r, top[0] + 1, top[1] - 1, 11, 3.6, 34, P.woodGrey, true);
    } else { s.thick(top[0] - 2, top[1], top[0] + 3, top[1] - 5, 3, P.woodGrey, 4); }
    if (d > 0) LAIR_PROPS.sticks(s, r, cx + 10, B - 2, 12, 3, d > 2 ? 26 : 14, P.woodGrey, true);
    for (let i = 0; i < [12, 12, 5, 0][d]; i++) { const x = cx - 16 + r() * 32, y = B - 1 + r() * 4, c = FEATHER[i % 3]; s.set(x, y, c[4]); s.set(x + 1, y, c[3]); }
    if (d > 1) for (let i = 0; i < (d > 2 ? 120 : 50); i++) { const y = B - r() * h * .7, x = cx + (r() - .5) * 8; if (s.get(x, y)) s.set(x, y, P.moss[3 + (i % 3)]); }
    s.outline();
    if (d > 1) tufts(s, r, cx - 22, cx + 22, B + 2, d > 2 ? 26 : 10, P.grass, 5);
    s.sh = { rx: 24, ry: 6, dx: 10, dy: 0, k: .8 };
    s.top = h - 2;
    return s;
  }

  function post(seed, d = 0) {
    const r = rng(seed * 53 + 3), s = new Spr(44, 30, 22, 24), B = 24, wood = d > 1 ? P.woodGrey : P.wood;
    s.ball(22, B - 4, 7.5, 5, 0, wood, { n: .3, ns: .6, d: .14, seed });
    for (let y = B - 9; y < B - 2; y++) for (let x = 15; x <= 29; x++) if (s.get(x, y)) s.set(x, y, wood[clamp(2 + ((x * 7 + y) % 3 === 0 ? -1 : 0) + (x < 19 ? 1 : 0), 0, 5)]);
    s.oval(22, B - 9, 7, 2.4, (x, y, nx, ny) => Math.hypot(nx, ny) > .7 ? wood[4] : P.plank[3 + (Math.hypot(nx, ny) < .35 ? 1 : 0)]);
    below(s, B);
    const n = [26, 26, 10, 0][d];
    for (let i = 0; i < n; i++) { const a = r() * TAU, q = 8 + r() * 11, x = 22 + Math.cos(a) * q, y = B - 2 + Math.sin(a) * q * .32, c = FEATHER[i % 3]; s.set(x, y, c[4]); s.set(x + 1, y, c[3]); if (i % 4 === 0) s.set(x, y - 1, c[2]); }
    for (let i = 0; i < [5, 5, 2, 0][d]; i++) s.set(18 + r() * 9, B - 9.5 + r() * 1.5, P.red[1 + (i & 1)]);
    s.outline();
    if (d > 1) tufts(s, r, 8, 38, B + 2, d > 2 ? 18 : 8, P.grass, 4);
    s.sh = { rx: 9, ry: 3, dx: 3, dy: 0 };
    s.top = 9;
    return s;
  }

  function holt(seed, d = 0) {
    const r = rng(seed * 61 + 9), s = new Spr(100, 60, 50, 50), B = 50;
    const stones = [[30, 8, 13, 9], [52, 6, 15, 11], [72, 8, 12, 9], [40, 18, 11, 8], [61, 19, 12, 8], [50, 28, 9, 7], [20, 4, 8, 5], [84, 4, 8, 5]];
    stones.forEach(([x, y, rx, ry], i) => s.ball(x, B - y, rx, ry, 10 - y * .2, i > 5 ? P.rockWarm : P.rock, { facet: 6, seed: seed + i, d: .12 }));
    below(s, B);
    for (const [x, y, w] of [[41, 7, 4], [62, 8, 3.6], [51, 16, 3], [29, 3, 3]].slice(0, d > 2 ? 1 : 4)) s.oval(x, B - y, w, w * .7, (px, py, nx, ny) => Math.hypot(nx, ny) > .75 ? P.rock[1] : P.ink);
    if (d > 1) for (let i = 0; i < (d > 2 ? 300 : 120); i++) { const x = 10 + r() * 80, y = B - 4 - r() * 34; if (s.get(x, y) && s.get(x, y) !== P.ink) s.set(x, y, P.moss[2 + (i % 4)]); }
    if (d < 2) { bits(s, r, 24, 80, B - 1, B + 3, 12, [P.bone, P.bone, ...FUR]); s.oval(50, B + 1, 18, 2.6, (x, y) => P.soil[3 + Math.round(noise(x * .6, y, seed) * 2)]); }
    s.outline();
    if (d > 1) tufts(s, r, 6, 94, B + 2, d > 2 ? 40 : 14, P.grass, d > 2 ? 8 : 4);
    s.sh = { rx: 42, ry: 8, dx: 6, dy: 0 };
    s.top = 34;
    return s;
  }

  return { earth, eyrie, post, holt };
})();
