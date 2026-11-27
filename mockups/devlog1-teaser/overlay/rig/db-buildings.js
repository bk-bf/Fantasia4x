'use strict';
(() => {
  const X = DBX;
  const BK = {
    f: {},
    add(id, f, o) {
      this.f[id] = f; o = o || {};
      X.drop('building', id);
      const n = o.frames || 1;
      for (let i = 0; i < n; i++) X.reg('building', id, i ? 'f' + i : (o.first || '0'), () => this.make(id, f, o, i));
      for (const st of o.states || []) X.reg('building', id, st, () => this.make(id, f, o, 0, st));
      if (o.emit && o.idle !== false) X.reg('building', id, 'idle', () => this.make(id, f, o, 0, 'idle'));
    },
    cold(s) {
      const set = s.set.bind(s);
      s.set = (x, y, c, e) => { x = Math.round(x); y = Math.round(y); if (!s.ok(x, y)) return; const has = s.c[y * s.w + x]; if (e >= 200) { if (has && has !== P.ink) set(x, y, P.furDark[hash(x, y, 3) > .5 ? 1 : 0], 0); return; } if ((c === P.furGrey[3] || c === P.furGrey[4]) && !has) return; set(x, y, c, e); };
      return () => { delete s.set; for (let i = 0; i < s.c.length; i++) if (s.e[i] >= 200) { s.c[i] = P.furDark[i & 1]; s.e[i] = 0; } };
    },
    make(id, f, o, frame, state) {
      const s = o.canvas ? new Spr(...o.canvas) : o.tall ? new Spr(72, 112, 36, 102) : o.wide ? new Spr(56, 56, 28, 48) : new Spr(40, 52, 20, BY), r = rng(id.length * 7 + id.charCodeAt(0) + id.charCodeAt(id.length - 1));
      const warm = state === 'idle' ? this.cold(s) : null;
      const out = f(s, r, frame || 0, state) || s;
      if (warm) warm();
      if (!out.done) out.outline();
      if (o.emit && state !== 'idle') out.emit = Object.assign({}, o.emit);
      if (!o.flat && !out.sh) out.sh = o.tall ? { rx: 22, ry: 7, dx: 8, dy: 0 } : o.wide ? { rx: 24, ry: 7, dx: 7, dy: 0 } : { rx: 17, ry: 6, dx: 6, dy: 0 };
      return out;
    },
  };
  X.BK = BK;
  const FIRE = { dx: 0, dy: -8, rad: 90, col: [1, .55, .2], flicker: 1 }, EMBER = { dx: 0, dy: -6, rad: 50, col: [1, .5, .2] };
  const FB = (seed, b) => BR(P.fireBrick, seed, b === undefined ? 2 : b), BRK = (seed, b) => BR(P.brick, seed, b);
  const mouth = (s, x, yb, w, h, hot) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const nx = (i - (w - 1) / 2) / (w / 2), ny = (h - 1 - j) / Math.max(1, h - 1); if (nx * nx + ny * ny < 1) s.set(x + i, yb - h + 1 + j, ny < .5 && Math.abs(nx) < .6 ? P.fire[ny < .25 ? 4 : hot ? 3 : 2] : ny < .78 ? P.fire[1] : P.ink, ny < .78 ? 255 : 0); } };
  const hole = (s, x, yb, w, h) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const nx = (i - (w - 1) / 2) / (w / 2), ny = (h - 1 - j) / Math.max(1, h - 1); if (nx * nx + ny * ny < 1) s.set(x + i, yb - h + 1 + j, hash(i, j, 3) > .9 ? P.stone[0] : P.ink); } };
  const door = (s, x, y, w, h, ramp, arch) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { if (arch && j < 2 && (i < 2 - j || i >= w - 2 + j)) continue; s.set(x + i, y + j, ramp[clamp(ramp.length - 3 + (i === 0 || j === 0 ? 1 : 0) - (i === w - 1 || j === h - 1 ? 2 : 0) - ((i + j) % 7 === 0 ? 1 : 0), 0, ramp.length - 1)]); } s.set(x + w - 2, y + (h >> 1), P.ink); s.set(x + 1, y + 1, ramp[ramp.length - 1]); s.set(x + 1, y + h - 2, ramp[ramp.length - 1]); };
  const pipe = (s, x, yTop, yBot, w, ramp, cap) => { s.tube(x, yTop, w, yBot - yTop, () => ramp[Math.max(0, ramp.length - 4)]); if (cap) { s.rect(x - 1, yTop, w + 2, 2, ramp[ramp.length - 3]); s.rect(x - 1, yTop, w + 2, 1, ramp[ramp.length - 2]); } };
  const chimney = (s, x, yTop, yBot, w, tex) => { s.tube(x, yTop, w, yBot - yTop, tex); s.rect(x - 1, yTop, w + 2, 2, P.stone[4]); s.rect(x - 1, yTop + 2, w + 2, 1, P.stone[1]); s.rect(x + 1, yTop, w - 2, 1, P.ink); };
  const pot = (s, cx, yb, r, ramp, fill) => { const n = ramp.length - 1; s.tube(Math.round(cx - r), yb - Math.round(r * 1.3), Math.round(r * 2), Math.round(r * 1.3) + 1, () => ramp[n - 2]); s.oval(cx, yb - r * 1.3, r + .6, Math.max(1.2, r * .42), (x, y, nx, ny) => Math.hypot(nx, ny) > .72 ? ramp[n - 1] : fill || ramp[0]); s.set(Math.round(cx - r) - 1, yb - Math.round(r * .9), ramp[n - 3]); s.set(Math.round(cx + r), yb - Math.round(r * .9), ramp[Math.max(0, n - 4)]); };
  const loaf = (s, x, y, w) => { s.oval(x, y, w || 3.4, 2, (qx, qy, nx, ny) => P.furTan[ny < -.2 ? 4 : nx > .4 ? 2 : 3]); s.set(x - 1, y - 1, P.furTan[5]); s.set(x + 1, y - 1, P.furTan[5]); };
  const bellows = (s, x, yb, w, h, flip) => { for (let j = 0; j < h; j++) { const ww = Math.min(w, 3 + j); for (let i = 0; i < ww; i++) s.set(flip ? x - i : x + i, yb - h + 1 + j, P.leather[j < 2 ? 5 : j < h - 2 ? (j & 1 ? 3 : 2) : 1]); } s.rect(flip ? x - w + 1 : x, yb - h, w - 2, 1, P.plank[5]); s.rect(flip ? x - w + 1 : x, yb + 1, w, 1, P.plank[2]); s.rect(flip ? x + 1 : x - 3, yb - 2, 3, 2, P.iron[4]); };
  const dome = (s, cx, cy, rx, ry, ramp, o) => { s.ball(cx, cy, rx, ry, 0, ramp, Object.assign({ n: .2, d: .15 }, o)); for (let x = 0; x < s.w; x++) for (let y = BY + 1; y < s.h; y++) s.set(x, y, null); };
  const bands = (s, x0, x1, ys) => { for (const y of ys) for (let x = x0; x <= x1; x++) { const c = s.get(x, y); if (c && c !== P.ink) s.set(x, y, dark(c, .74)); } };
  const hoops = (s, x0, x1, ys, ramp) => { for (const y of ys) for (let x = x0; x <= x1; x++) if (s.get(x, y)) { const u = (x - x0) / Math.max(1, x1 - x0); s.set(x, y, ramp[u < .2 ? 5 : u < .6 ? 4 : 2]); if (s.get(x, y + 1)) s.set(x, y + 1, ramp[u < .6 ? 2 : 1]); } };
  Object.assign(BK, { mouth, hole, door, pipe, chimney, pot, loaf, bellows, dome, bands, hoops, FIRE, EMBER });

  BK.add('brick_hearth', (s, r, fr) => {
    chimney(s, 24, BY - 44, BY - 18, 9, BRK(5, 3));
    const y0 = bx2(s, 4, 32, 9, 19, BRK(1, 4), BRK(2, 3), { fd: .82 });
    hole(s, 9, BY, 16, 14); s.thick(11, BY - 1, 22, BY - 3, 2, P.wood, 2); s.thick(12, BY - 4, 21, BY - 1, 2, P.wood, 3);
    flame2(s, 17, BY - 2, 4, 10, fr);
    s.rect(4, y0 + 9, 32, 2, P.brick[5]); s.rect(4, y0 + 11, 32, 1, P.brick[1]);
  }, { frames: 3, emit: FIRE });
  BK.add('brick_stove', (s, r, fr) => {
    pipe(s, 29, BY - 38, BY - 20, 4, P.iron, true);
    const y0 = bx2(s, 4, 32, 12, 15, BRK(3, 4), BRK(4, 3), { fd: .84 });
    s.oval(13, y0 + 6, 5, 2.6, (x, y, nx, ny) => Math.hypot(nx, ny) > .7 ? P.brick[1] : P.fire[hash(x, y + fr, 2) > .6 ? 2 : 1], 200);
    s.oval(26, y0 + 6, 5, 2.6, () => P.brick[1]); pot(s, 26, y0 + 6, 4.4, P.iron, P.furTan[3]);
    door(s, 14, BY - 10, 10, 8, P.iron, true); s.rect(17, BY - 4, 4, 1, P.fire[2], 255);
  }, { frames: 2, emit: EMBER });
  BK.add('iron_stove', (s, r, fr) => {
    pipe(s, 28, BY - 42, BY - 22, 4, P.iron, true);
    const y0 = bx2(s, 5, 30, 4, 13, BRK(3, 4), BRK(6, 3), { fd: .84 });
    s.slab(3, y0 - 9, 34, 10, 3, M.flat(P.iron, 4, 3), M.flat(P.iron, 3, 5));
    for (const x of [10, 21]) s.oval(x + 1, y0 - 4, 4, 2, (px2, py, nx, ny) => Math.hypot(nx, ny) > .7 ? P.iron[2] : P.iron[1]);
    pot(s, 11, y0 - 4, 4, P.copper, P.cloth[4]); pot(s, 22, y0 - 4, 3.4, P.iron, P.furTan[2]);
    door(s, 12, BY - 10, 12, 8, P.iron, false); s.rect(15, BY - 7, 6, 1, P.fire[3], 255); s.rect(15, BY - 5, 6, 1, P.fire[2], 255);
  }, { emit: EMBER });
  BK.add('steel_stove', (s, r, fr) => {
    pipe(s, 6, BY - 46, BY - 24, 5, P.iron, true); s.rect(10, BY - 33, 4, 1, P.iron[6]); s.rect(13, BY - 34, 1, 3, P.gold[3]);
    const y0 = bx2(s, 3, 34, 12, 17, M.flat(P.iron, 3, 3), M.flat(P.iron, 3, 5), { fd: .8 });
    for (const [x, y] of [[9, y0 + 3], [20, y0 + 3], [30, y0 + 4], [14, y0 + 8], [26, y0 + 9]]) s.oval(x, y, 3.4, 1.7, (px2, py, nx, ny) => Math.hypot(nx, ny) > .66 ? P.iron[2] : P.iron[0]);
    pot(s, 9, y0 + 3, 3.4, P.copper, P.furTan[3]); pot(s, 20, y0 + 3, 3.6, P.iron, P.cloth[4]); pot(s, 26, y0 + 9, 3, P.copper, P.red[3]);
    door(s, 6, BY - 13, 12, 11, P.iron, false); door(s, 21, BY - 13, 13, 6, P.iron, false); door(s, 21, BY - 6, 13, 5, P.iron, false);
    s.rect(8, BY - 5, 8, 1, P.fire[3], 255); s.rect(3, y0 + 12, 34, 1, P.iron[6]); for (let x = 5; x < 36; x += 5) s.set(x, y0 + 14, P.iron[6]);
    s.rect(3, BY, 34, 1, P.fireBrick[1]);
  }, { emit: EMBER });
  BK.add('oven', (s, r, fr) => {
    bx2(s, 5, 30, 5, 8, BRK(2, 4), BRK(5, 3), { fd: .84 });
    s.ball(20, BY - 17, 14, 12, 2, P.clay, { n: .25, d: .15 }); for (let y = BY - 7; y < BY - 4; y++) for (let x = 5; x < 35; x++) if (s.get(x, y) && P.clay.indexOf(s.get(x, y)) >= 0) s.set(x, y, P.brick[y === BY - 7 ? 5 : 3]);
    mouth(s, 14, BY - 9, 12, 9, false); s.rect(13, BY - 18, 14, 1, P.clay[4]);
    s.rect(8, BY - 8, 24, 1, P.brick[5]);
    loaf(s, 9, BY - 3, 3.2); s.thick(24, BY + 2, 36, BY - 10, 1, P.plank, 4); s.oval(25, BY, 3.4, 1.8, () => P.plank[4]);
    s.oval(20, BY - 29, 2.6, 1.2, () => P.ink);
  }, { emit: EMBER });
  BK.add('brick_bake_oven', (s, r, fr) => {
    chimney(s, 28, BY - 44, BY - 20, 7, ST(3, 3));
    bx2(s, 3, 34, 5, 10, ST(1), ST(2, 4), { fd: .84 });
    s.ball(18, BY - 20, 15, 13, 2, P.stone, { facet: 5, seed: 3, d: .12, bias: .04 }); for (let y = BY - 9; y < BY - 4; y++) for (let x = 3; x < 37; x++) if (s.get(x, y) && P.stone.indexOf(s.get(x, y)) < 0) s.set(x, y, null);
    bx2(s, 3, 34, 5, 10, ST(1), ST(2, 4), { fd: .84 });
    mouth(s, 11, BY - 11, 14, 10, false); for (let i = 0; i < 9; i++) { const t = Math.PI * (i / 8), x = 18 - Math.cos(t) * 8.4, y = BY - 11 - Math.sin(t) * 10.4; s.rect(Math.round(x) - 1, Math.round(y) - 1, 2, 2, P.fireBrick[3 - (i & 1)]); }
    loaf(s, 8, BY - 12, 2.6); loaf(s, 29, BY - 2, 3.2); loaf(s, 23, BY, 3);
  }, { emit: EMBER });
  BK.add('bakehouse', (s, r, fr) => {
    chimney(s, 16, BY - 46, BY - 24, 8, BRK(5, 3));
    const y0 = bx2(s, 2, 36, 9, 24, BRK(1, 4), BRK(2, 3), { fd: .84 });
    door(s, 4, BY - 21, 11, 10, P.iron, true); door(s, 25, BY - 21, 11, 10, P.iron, true);
    hole(s, 15, BY, 10, 9); flame2(s, 20, BY - 1, 2, 6, fr);
    s.rect(2, BY - 10, 36, 1, P.brick[5]); s.rect(15, BY - 20, 10, 8, P.brick[1]);
    for (const y of [BY - 19, BY - 16, BY - 13]) { s.rect(16, y, 8, 1, P.plank[4]); }
    loaf(s, 20, BY - 20, 2.4); loaf(s, 19, BY - 17, 2.4);
    s.thick(37, BY + 2, 33, BY - 28, 1, P.plank, 4); s.oval(33, BY - 30, 2.6, 3.4, () => P.plank[4]);
  }, { frames: 2, emit: FIRE });
  BK.add('steel_bake_range', (s, r, fr) => {
    for (const x of [8, 19, 30]) { pipe(s, x, BY - 46, BY - 30, 3, P.iron, true); s.rect(x - 1, BY - 37, 5, 1, P.gold[3]); }
    const y0 = bx2(s, 2, 36, 8, 28, FB(1, 3), FB(2, 2), { fd: .86 });
    for (let k = 0; k < 3; k++) { const y = y0 + 10 + k * 8; door(s, 5, y, 30, 6, P.iron, false); s.rect(8, y + 2, 24, 1, P.iron[6]); s.rect(31, y + 1, 2, 3, P.plank[4]); }
    s.rect(2, BY, 36, 1, P.fireBrick[0]); s.rect(12, BY - 3, 16, 2, P.ink); s.rect(14, BY - 3, 12, 1, P.fire[2 + (fr & 1)], 255);
    loaf(s, 10, y0 + 4, 3); loaf(s, 22, y0 + 3, 3);
  }, { emit: EMBER });
  BK.add('advanced_kiln', (s, r, fr) => {
    for (let j = 0; j < 40; j++) { const f = j / 39, w = Math.round(j < 14 ? 8 + j * 1.1 : 23 + Math.sin((f - .35) * 2.6) * 3); s.tube(20 - (w >> 1), BY - 39 + j, w, 1, FB(3, 2)); }
    hoops(s, 4, 36, [BY - 26, BY - 13], P.iron);
    s.oval(20, BY - 39, 4, 1.6, (x, y, nx, ny) => Math.hypot(nx, ny) < .6 ? P.ink : P.fireBrick[4]);
    mouth(s, 14, BY, 12, 10, true); s.rect(13, BY - 10, 14, 1, P.fireBrick[4]);
    pot(s, 34, BY, 2.6, P.clay); s.oval(5, BY, 3, 1.6, () => P.cloth[4]);
  }, { emit: FIRE });
  BK.add('porcelain_workshop', (s, r, fr) => {
    for (let j = 0; j < 34; j++) { const w = Math.round(j < 12 ? 6 + j : 18 + Math.sin(j / 33 * 3) * 2); s.tube(12 - (w >> 1) + 2, BY - 33 + j, w, 1, FB(5, 2)); }
    hoops(s, 4, 26, [BY - 20], P.iron); mouth(s, 9, BY, 10, 8, true); s.rect(8, BY - 8, 12, 1, P.fireBrick[4]);
    s.oval(14, BY - 33, 3, 1.3, (x, y, nx, ny) => Math.hypot(nx, ny) < .6 ? P.ink : P.fireBrick[4]);
    const y0 = table2(s, 24, 14, 8, 7, WP(3, 'h', 4), P.plank);
    const W = P.snow;
    s.ball(28, y0 - 2, 2.6, 4, 3, W, { d: .15, bias: .1 }); s.rect(27, y0 - 7, 2, 2, W[4]); s.rect(26, y0 - 8, 4, 1, W[3]); s.set(28, y0 - 2, P.blue[3]); s.set(27, y0 - 1, P.blue[3]); s.set(29, y0 - 3, P.blue[2]);
    s.oval(34, y0 + 2, 3, 1.5, (x, y, nx, ny) => Math.hypot(nx, ny) < .5 ? W[2] : W[4]); s.ball(33, y0 - 1, 1.8, 2.4, 3, W, { d: .15, bias: .1 });
  }, { emit: FIRE });
  BK.add('casting_hearth', (s, r, fr) => {
    const y0 = bx2(s, 3, 18, 10, 14, BRK(2, 4), BRK(4, 3), { fd: .84 });
    s.fill(5, y0 + 2, 14, 6, (x, y) => hash(x, y + fr, 3) > .7 ? P.fire[1 + (hash(x, y, 5) > .5 ? 1 : 0)] : P.furDark[1]); s.rect(5, y0 + 2, 14, 1, P.ink);
    pot(s, 12, y0 + 7, 3.6, P.clay, P.fire[3]); for (let i = -2; i < 3; i++) s.set(12 + i, y0 + 2, P.fire[4], 255);
    mouth(s, 7, BY, 9, 7, false);
    s.oval(29, BY - 5, 9.5, 5.6, (x, y, nx, ny) => Math.hypot(nx, ny) > .86 ? P.plank[nx + ny < 0 ? 4 : 2] : P.sand[3 + (hash(x, y, 7) > .7 ? 1 : 0) - (hash(x, y, 9) > .85 ? 1 : 0)]);
    for (const [x, y, w] of [[23, BY - 8, 5], [30, BY - 7, 6], [26, BY - 4, 6]]) { s.rect(x, y, w, 2, P.sand[0]); s.rect(x + 1, y, w - 2, 1, w === 6 && x === 30 ? P.fire[3] : P.copper[4], w === 6 && x === 30 ? 255 : 0); }
    s.thick(21, BY - 12, 30, BY - 20, 1, P.iron, 4); s.thick(23, BY - 12, 31, BY - 18, 1, P.iron, 3);
  }, { frames: 2, emit: FIRE });
  BK.add('finery_forge', (s, r, fr) => {
    chimney(s, 9, BY - 42, BY - 20, 8, BRK(5, 3));
    const y0 = bx2(s, 3, 22, 11, 13, BRK(2, 4), BRK(4, 3), { fd: .84 });
    s.fill(5, y0 + 2, 18, 7, (x, y) => hash(x, y + fr, 3) > .6 ? P.fire[1 + (hash(x, y, 5) > .5 ? 1 : 0)] : P.furDark[hash(x, y, 7) > .5 ? 1 : 0]); s.rect(5, y0 + 2, 18, 1, P.ink);
    s.ball(14, y0 + 5, 4, 2.6, 6, P.fire, { d: .3, bias: .1, e: 255 });
    flame2(s, 14, y0 + 3, 3, 7, fr);
    bellows(s, 26, BY - 2, 11, 10, false); s.rect(23, BY - 6, 4, 2, P.iron[3]);
    s.thick(30, BY - 14, 36, BY - 26, 2, P.wood, 4); s.rect(33, BY - 30, 6, 5, P.iron[4]); s.rect(33, BY - 30, 6, 1, P.iron[6]);
  }, { frames: 3, emit: FIRE });
  BK.add('cementation_furnace', (s, r, fr) => {
    chimney(s, 28, BY - 40, BY - 22, 6, BRK(5, 3));
    const y0 = bx2(s, 2, 36, 12, 16, BRK(2, 4), BRK(4, 3), { fd: .84 });
    for (const x of [5, 16, 27]) { s.slab(x, y0 + 1, 9, 8, 1, M.flat(P.stone, 5, x), M.flat(P.stone, 3, 5)); s.rect(x + 3, y0 + 4, 3, 1, P.iron[5]); s.rect(x, y0 + 1, 9, 1, P.clay[4]); }
    mouth(s, 6, BY, 7, 6, false); mouth(s, 27, BY, 7, 6, false);
    for (let x = 4; x < 36; x += 4) s.set(x, BY - 8, P.iron[5]); s.rect(2, BY - 9, 36, 1, P.iron[3]);
  }, { emit: EMBER });
  BK.add('puddling_furnace', (s, r, fr) => {
    chimney(s, 28, BY - 48, BY - 16, 8, FB(5, 3));
    for (let j = 0; j < 20; j++) { const f = j / 19, x0 = 2 + Math.round((1 - Math.sin(Math.min(1, f * 1.6) * 1.57)) * 6); s.tube(x0, BY - 19 + j, 31 - x0, 1, FB(2, 2)); }
    hoops(s, 2, 34, [BY - 12], P.iron);
    door(s, 11, BY - 10, 9, 8, P.iron, true); s.rect(13, BY - 7, 5, 3, P.fire[3], 255); s.rect(14, BY - 6, 3, 1, P.fire[4], 255);
    s.thick(15, BY - 5, 2, BY + 3, 1, P.iron, 5); s.rect(1, BY + 2, 2, 2, P.wood[3]);
    mouth(s, 23, BY, 6, 5, false);
  }, { frames: 2, emit: FIRE });
  BK.add('blast_furnace', (s, r, fr) => {
    const B = 102, cx = 34;
    for (let j = 0; j < 70; j++) { const f = j / 69, w = Math.round(18 + f * 22 - (f > .82 ? (f - .82) * 30 : 0)); s.tube(cx - (w >> 1), B - 69 + j, w, 1, ST(3, 3)); }
    hoops(s, 10, 58, [B - 52, B - 34, B - 16], P.iron);
    s.oval(cx, B - 69, 9, 3, (x, y, nx, ny) => Math.hypot(nx, ny) < .7 ? P.fire[2] : P.stone[5], 0); for (let x = cx - 6; x <= cx + 6; x++) for (let y = B - 70; y <= B - 68; y++) if (Math.hypot((x - cx) / 6.3, (y - B + 69) / 2.1) < 1) s.set(x, y, P.fire[2 + (hash(x, y, fr) > .5 ? 1 : 0)], 255);
    flame2(s, cx, B - 70, 5, 12, fr);
    mouth(s, cx - 8, B, 16, 13, true); for (let i = 0; i < 11; i++) { const t = Math.PI * (i / 10), x = cx - Math.cos(t) * 9.6, y = B - Math.sin(t) * 14; s.rect(Math.round(x) - 1, Math.round(y) - 1, 2, 2, P.fireBrick[3 - (i & 1)]); }
    for (let k = 0; k < 14; k++) { s.set(cx - 2 + k * .6, B + 1 + (k >> 2), P.fire[4 - (k > 9 ? 1 : 0)], 255); s.set(cx - 1 + k * .6, B + 1 + (k >> 2), P.fire[3], 255); }
    s.rect(cx + 6, B + 3, 6, 3, P.iron[3]); s.rect(cx + 7, B + 3, 4, 1, P.fire[3], 255);
    bellows(s, 9, B - 3, 14, 12, true); s.rect(10, B - 8, 6, 2, P.iron[3]);
    s.slab(48, B - 30, 16, 5, 2, WP(3, 'h', 4), WP(4, 'h', 3)); for (const x of [49, 61]) { s.rect(x, B - 23, 2, 24, P.wood[3]); s.rect(x, B - 23, 1, 24, P.wood[5]); } for (let y = B - 20; y < B; y += 5) s.rect(51, y, 10, 1, P.wood[2]);
  }, { tall: 1, frames: 3, emit: { dx: 0, dy: -30, rad: 150, col: [1, .55, .2], flicker: 1 } });
  BK.add('crucible_steelworks', (s, r, fr) => {
    chimney(s, 27, BY - 44, BY - 18, 8, FB(5, 3));
    const y0 = bx2(s, 2, 36, 14, 11, FB(2, 3), FB(4, 2), { fd: .84 });
    for (const [x, hot] of [[6, 1], [17, 0], [28, 0]]) { s.rect(x, y0 + 3, 8, 7, P.ink); if (hot) { s.fill(x + 1, y0 + 4, 6, 5, (px2, py) => P.fire[1 + (hash(px2, py + fr, 3) > .5 ? 1 : 0)], 255); pot(s, x + 4, y0 + 8, 2.6, P.clay, P.fire[4]); } else s.slab(x, y0 + 2, 8, 7, 1, M.flat(P.fireBrick, 3, x), M.flat(P.fireBrick, 2, 5)); s.rect(x, y0 + 3, 8, 1, P.fireBrick[4]); }
    pot(s, 7, BY + 2, 2.6, P.clay); pot(s, 13, BY + 3, 2.6, P.clay, P.fire[3]);
    s.thick(20, BY + 2, 33, BY - 7, 1, P.iron, 5); s.thick(21, BY + 3, 34, BY - 5, 1, P.iron, 3);
    mouth(s, 20, BY, 6, 5, false);
  }, { frames: 2, emit: FIRE });
})();
(() => {
  const X = DBX, BK = X.BK, { mouth, hole, door, pipe, chimney, pot, loaf, bellows, hoops, FIRE, EMBER } = BK;
  const post = (s, x, yTop, yBot, ramp, w) => { s.rect(x, yTop, w || 3, yBot - yTop + 1, ramp[2]); s.rect(x, yTop, 1, yBot - yTop + 1, ramp[4]); if ((w || 3) > 2) s.rect(x + (w || 3) - 1, yTop, 1, yBot - yTop + 1, ramp[1]); };
  const lash = (s, x, y, w) => { for (let i = 0; i < w; i++) s.set(x + i, y + (i & 1), P.cloth[i & 1 ? 3 : 4]); s.rect(x, y + 2, w, 1, P.cloth[2]); };
  const hide = (s, x, y, w, h, ramp, seed) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const cut = (j < 2 || j > h - 3) && (i < 2 || i > w - 3) && !((j === 0 || j === h - 1) && (i === 0 || i === w - 1)) ? 0 : 1, notch = (i === 0 || i === w - 1) && j > h * .35 && j < h * .65; if (notch || ((j < 2 || j > h - 3) && i > 2 && i < w - 3 && (j === 0 || j === h - 1) && (i % 5 === 2))) continue; if (!cut && !((j === 0 || j === h - 1) || (i === 0 || i === w - 1))) continue; s.set(x + i, y + j, ramp[clamp(3 + (i < 2 ? 1 : i > w - 3 ? -1 : 0) - (noise(i * .6, j * .5, seed) > .62 ? 1 : 0) + (j < 2 ? 1 : 0), 0, ramp.length - 1)]); } };
  const gear = (s, cx, cy, r, ramp, teeth) => { const n = ramp.length - 1; for (let a = 0; a < teeth; a++) { const t = a / teeth * 6.283; s.rect(Math.round(cx + Math.cos(t) * (r + .6) - .5), Math.round(cy + Math.sin(t) * (r + .6) - .5), 2, 2, ramp[n - 2]); } s.oval(cx, cy, r, r, (x, y, nx, ny) => { const q = Math.hypot(nx, ny); return q < .28 ? ramp[1] : q > .7 ? ramp[nx + ny < 0 ? n : n - 2] : ramp[n - 1]; }); };
  const wheelV = (s, cx, cy, r, ramp, rim) => { s.oval(cx, cy, r * .5, r, (x, y, nx, ny) => { const q = Math.hypot(nx, ny); return q > .82 ? rim[nx < 0 ? 4 : 2] : q < .2 ? P.iron[2] : ramp[clamp(3 - Math.round(nx * 1.4) - (hash(x, y, 3) > .85 ? 1 : 0), 0, ramp.length - 1)]; }); };
  const meat = (s, x, y, h, w) => { for (let j = 0; j < h; j++) { const ww = j < 2 || j > h - 3 ? Math.max(1, w - 2) : w; for (let i = 0; i < ww; i++) s.set(x + i + ((w - ww) >> 1), y + j, P.red[clamp(3 - (i > ww - 2 ? 1 : 0) + (i === 0 ? 1 : 0) - (j % 4 === 3 ? 1 : 0), 0, 4)]); } s.set(x + (w >> 1), y + 1, P.bone[5]); s.set(x + (w >> 1), y + h - 2, P.cloth[5]); };
  const sacklet = (s, x, y, rr, z) => { s.ball(x, y, rr, rr * 1.05, z || 0, P.cloth, { n: .22, ns: .5, d: .15, bias: -.04 }); s.rect(x - 1, Math.round(y - rr - 1), 3, 2, P.cloth[4]); s.rect(x - 1, Math.round(y - rr + 1), 3, 1, P.leather[3]); };
  const logOnSide = (s, x, y, w, ramp, sd) => { for (let j = 0; j < 7; j++) for (let i = 0; i < w; i++) s.set(x + i, y + j, ramp[clamp([4, 5, 4, 3, 2, 1, 0][j] - (noise(i * .22 + sd * 7, j * 1.3, sd) > .68 ? 1 : 0), 0, 5)]); s.oval(x + 1.5, y + 3.5, 2.6, 3.5, (px2, py, nx, ny) => { const q = Math.hypot(nx, ny); return q > .8 ? ramp[2] : q < .25 ? P.plank[2] : P.plank[q < .55 ? 5 : 4]; }); for (let j = 1; j < 6; j++) s.set(x + w, y + j, ramp[0]); };
  const flask = (s, x, yb, ramp, liq) => { s.rect(x, yb - 6, 2, 3, ramp[4]); s.ball(x + 1, yb - 2, 2.6, 2.4, 3, ramp, { d: .15, bias: .1 }); s.set(x, yb - 2, liq); s.set(x + 1, yb - 1, liq); s.set(x + 2, yb - 2, liq); s.rect(x, yb - 7, 2, 1, P.wood[3]); };
  const GLASS = R('#3a5a5e #56807e #7aa6a0 #a6ccc2 #d4ece4');

  BK.add('craft_spot', (s, r) => {
    s.oval(20, BY - 4, 15, 6.4, (x, y, nx, ny) => { const q = nx * nx + ny * ny; return q > .8 && hash(x, y, 3) > .5 ? null : P.soilPoor[2 + (hash(x, y, 5) > .7 ? 1 : 0) - (q > .6 ? 1 : 0)]; });
    s.ball(14, BY - 5, 6, 3.6, 2, P.rock, { facet: 4, seed: 3, d: .12, bias: .06 }); s.ball(15, BY - 9, 2.4, 1.8, 3, P.rockWarm, { d: .15 });
    for (let i = 0; i < 10; i++) { const x = 20 + r() * 12, y = BY - 6 + r() * 6; s.set(x, y, P.rock[5 + (i & 1)]); s.set(x + 1, y, P.rock[3]); }
    for (let i = 0; i < 6; i++) s.line(24 + i, BY - 10, 30 + i, BY - 7, P.grassLoam[2 + (i % 3)]); s.rect(26, BY - 10, 2, 4, P.cloth[3]);
    s.thick(27, BY - 1, 33, BY - 3, 2, P.wood, 3); s.rect(33, BY - 4, 3, 3, P.rock[5]); s.rect(33, BY - 4, 3, 1, P.rock[6]);
  }, { flat: 1 });
  BK.add('makers_bench', (s, r) => {
    const y0 = BY + 1 - 9 - 3 - 12;
    for (const lx of [5, 31]) { s.tube(lx, BY - 9, 3, 10, () => P.wood[3]); }
    s.rect(8, BY - 5, 23, 2, P.wood[2]); s.rect(8, BY - 5, 23, 1, P.wood[4]);
    s.slab(3, y0, 34, 12, 3, WD(3, 'h', 4), WD(5, 'h', 3));
    for (const x of [4, 32]) { lash(s, x, y0 + 12, 4); }
    s.ball(11, y0 + 5, 3.4, 2.4, 3, P.rock, { facet: 3, d: .12, bias: .06 }); s.thick(17, y0 + 9, 25, y0 + 4, 2, P.wood, 4); s.rect(24, y0 + 2, 4, 4, P.rock[4]); s.rect(24, y0 + 2, 4, 1, P.rock[6]);
    for (let i = 0; i < 5; i++) s.line(28 + i, y0 + 8, 33 + i * .4, y0 + 10, P.grassLoam[2 + (i % 3)]);
    s.set(15, y0 + 3, P.rock[6]); s.set(16, y0 + 4, P.rock[5]); s.set(14, y0 + 8, P.rock[6]);
  });
  BK.add('butcher_spot', (s, r) => {
    post(s, 5, BY - 34, BY, P.wood); post(s, 32, BY - 34, BY, P.wood);
    s.tube(3, BY - 33, 34, 3, () => P.wood[4]); lash(s, 4, BY - 34, 5); lash(s, 31, BY - 34, 5);
    s.rect(19, BY - 30, 1, 4, P.iron[5]); s.set(20, BY - 26, P.iron[5]); s.set(20, BY - 27, P.iron[3]);
    const c = P.furTan; s.ball(20, BY - 16, 5.6, 9, 2, c, { n: .3, ns: .9, d: .15 });
    for (const dx of [-3, 2]) { s.rect(20 + dx, BY - 27, 2, 5, c[2]); s.rect(20 + dx, BY - 9, 2, 5, c[3]); s.rect(20 + dx, BY - 4, 2, 1, P.ink); }
    for (let j = 0; j < 10; j++) s.set(20, BY - 22 + j, P.red[3 - (j & 1)]); s.set(19, BY - 16, P.red[4]); s.set(21, BY - 14, P.red[2]);
    s.oval(20, BY, 5, 1.6, () => P.red[1]); s.set(22, BY - 1, P.red[2]);
  });
  BK.add('dressing_stone', (s, r) => {
    post(s, 3, BY - 34, BY - 8, P.wood, 2); post(s, 35, BY - 34, BY - 8, P.wood, 2); s.tube(2, BY - 34, 36, 2, () => P.wood[4]);
    s.rect(12, BY - 32, 1, 4, P.iron[5]); meat(s, 10, BY - 28, 9, 5); s.rect(27, BY - 32, 1, 3, P.iron[5]); s.set(28, BY - 29, P.iron[4]);
    for (const x of [6, 30]) s.tube(x, BY - 7, 4, 8, () => P.wood[3]);
    s.slab(3, BY - 19, 34, 10, 4, M.flat(P.stone, 5, 3), M.flat(P.stone, 3, 5));
    for (let x = 6; x < 34; x++) s.set(x, BY - 11, P.stone[1]); s.rect(33, BY - 11, 1, 3, P.stone[1]);
    for (let i = 0; i < 12; i++) s.set(8 + r() * 24, BY - 17 + r() * 5, P.red[1 + (i % 2)]);
    s.rect(20, BY - 16, 8, 2, P.iron[5]); s.rect(28, BY - 16, 3, 2, P.bone[4]);
  });
  BK.add('chopping_block', (s, r) => {
    s.tube(10, BY - 11, 18, 12, (x, y) => P.wood[3 - (noise(x * 1.3, y * .2, 4) > .66 ? 1 : 0)]);
    s.oval(19, BY - 11, 9.5, 3.8, (x, y, nx, ny) => { const q = Math.hypot(nx, ny); return P.plank[q < .2 ? 2 : (Math.floor(q * 5) & 1) ? 5 : 4]; });
    s.thick(21, BY - 12, 31, BY - 27, 2, P.wood, 4);
    for (let j = 0; j < 7; j++) for (let i = 0; i < 6 - (j > 4 ? 2 : 0); i++) s.set(16 + i + (j >> 2), BY - 18 + j, P.iron[i < 2 ? 6 : j < 2 ? 5 : 4 - (j > 5 ? 1 : 0)]);
    for (const [x, y, w] of [[3, BY - 2, 7], [30, BY - 1, 8], [32, BY - 5, 6]]) { s.rect(x, y, w, 2, P.plank[4]); s.rect(x, y, w, 1, P.plank[5]); s.rect(x, y + 2, w, 1, P.wood[2]); s.set(x, y + 1, P.plank[2]); }
    for (let i = 0; i < 6; i++) { const x = 4 + r() * 30, y = BY + r() * 2; s.set(x, y, P.plank[5]); }
  });
  BK.add('sawtable', (s, r) => {
    for (const x of [6, 30]) { s.thick(x - 3, BY, x + 1, BY - 16, 2, P.plank, 3); s.thick(x + 6, BY, x + 2, BY - 16, 2, P.plank, 2); s.rect(x - 1, BY - 8, 6, 1, P.plank[2]); }
    s.rect(4, BY - 17, 32, 2, P.plank[4]); s.rect(4, BY - 15, 32, 1, P.plank[1]);
    logOnSide(s, 3, BY - 24, 33, P.wood, 2);
    for (let i = 0; i < 26; i++) { s.set(8 + i, BY - 30 + Math.round(i * .32), P.iron[6]); s.set(8 + i, BY - 29 + Math.round(i * .32), P.iron[i & 1 ? 4 : 2]); }
    s.rect(5, BY - 33, 3, 5, P.wood[3]); s.rect(5, BY - 33, 3, 1, P.wood[5]); s.rect(34, BY - 24, 3, 5, P.wood[3]);
    s.line(20, BY - 24, 20, BY - 18, P.plank[1]);
    for (let i = 0; i < 10; i++) { const x = 8 + r() * 24, y = BY - r() * 3; s.set(x, y, P.plank[5]); s.set(x + 1, y, P.plank[4]); }
  });
  BK.add('bone_carvers_bench', (s, r) => {
    const y0 = table2(s, 4, 32, 13, 9, WD(7, 'h', 4), P.wood);
    for (let i = 0; i < 22; i++) s.set(6 + hash(i, 1, 5) * 28, y0 + 2 + hash(i, 2, 5) * 9, P.bone[5 - (i % 2)]);
    s.oval(11, y0 + 5, 3.4, 3, (x, y, nx, ny) => P.bone[nx + ny < -.2 ? 5 : nx + ny < .6 ? 4 : 3]); s.set(10, y0 + 5, P.ink); s.set(12, y0 + 5, P.ink); s.rect(10, y0 + 8, 3, 1, P.bone[2]);
    s.thick(17, y0 + 9, 27, y0 + 3, 2, P.bone, 4); s.set(16, y0 + 9, P.bone[5]); s.set(16, y0 + 11, P.bone[4]); s.set(28, y0 + 2, P.bone[5]); s.set(29, y0 + 4, P.bone[4]);
    s.thick(30, y0 + 10, 33, y0 + 1, 1, P.bone, 5); s.thick(31, y0 + 6, 35, y0 + 3, 1, P.bone, 4); s.thick(31, y0 + 4, 28, y0, 1, P.bone, 4);
    s.rect(20, y0 + 10, 7, 1, P.iron[5]); s.rect(27, y0 + 10, 3, 1, P.wood[4]);
    s.thick(7, BY - 1, 16, BY - 3, 2, P.bone, 4);
  });
  BK.add('hide_rack', (s, r) => {
    s.thick(5, BY, 8, BY - 36, 2, P.wood, 4); s.thick(34, BY, 31, BY - 36, 2, P.wood, 2);
    s.tube(6, BY - 36, 28, 2, () => P.wood[4]); s.tube(5, BY - 6, 30, 2, () => P.wood[3]);
    lash(s, 6, BY - 37, 4); lash(s, 30, BY - 37, 4);
    hide(s, 11, BY - 31, 18, 22, P.furTan, 3);
    for (const [x, y, tx, ty] of [[11, BY - 31, 8, BY - 35], [28, BY - 31, 32, BY - 35], [11, BY - 10, 7, BY - 6], [28, BY - 10, 33, BY - 6], [11, BY - 20, 8, BY - 20], [28, BY - 20, 32, BY - 20]]) s.line(x, y, tx, ty, P.cloth[4]);
  });
  BK.add('curriers_bench', (s, r) => {
    const y0 = table2(s, 14, 23, 11, 8, WP(3, 'h', 4), P.plank);
    s.thick(3, BY, 14, BY - 26, 3, P.plank, 3); s.rect(2, BY - 1, 6, 2, P.plank[2]);
    for (let j = 0; j < 22; j++) { const x = 4 + Math.round(j * .44), w = j < 3 ? 5 : 7; for (let i = 0; i < w; i++) s.set(x + i - 2, BY - 5 - j, P.leather[clamp(4 - Math.round(i / w * 3) - (noise(i, j * .4, 3) > .65 ? 1 : 0), 0, 5)]); }
    s.fill(17, y0 + 2, 13, 7, M.fur(P.leather, 3, 2)); s.rect(17, y0 + 2, 13, 1, P.leather[5]);
    s.rect(31, y0 + 3, 4, 2, P.iron[5]); s.rect(31, y0 + 5, 4, 1, P.wood[4]); pot(s, 33, y0 + 11, 2, P.clay);
  });
  BK.add('ropewalk', (s, r) => {
    post(s, 3, BY - 24, BY, P.wood); post(s, 34, BY - 24, BY, P.wood);
    s.rect(1, BY - 25, 7, 2, P.wood[4]); s.rect(32, BY - 25, 7, 2, P.wood[3]);
    for (let k = 0; k < 4; k++) for (let x = 6; x < 34; x++) { const y = BY - 21 + k * 3 + Math.round(Math.sin((x - 6) / 28 * 3.14) * (1 + k * .6)); s.set(x, y, P.wicker[(x + k) % 3 === 0 ? 2 : 4]); }
    gear(s, 36, BY - 15, 3, P.plank, 6); s.rect(38, BY - 15, 2, 5, P.wood[3]);
    s.oval(20, BY - 2, 7, 3.4, (x, y, nx, ny) => { const q = Math.hypot(nx, ny); return q < .3 ? P.wicker[0] : (Math.floor(q * 4.2) & 1) ? P.wicker[4] : P.wicker[2]; });
    s.oval(20, BY - 4, 7, 3.4, (x, y, nx, ny) => { const q = Math.hypot(nx, ny); return q < .3 ? P.wicker[0] : (Math.floor(q * 4.2) & 1) ? P.wicker[3] : P.wicker[4]; });
  });
  const grinder = (wheel, rim, gems) => (s, r) => {
    const y0 = table2(s, 4, 32, 12, 9, WP(4, 'h', 4), P.plank);
    for (const x of [9, 18]) post(s, x, y0 - 8, y0 + 5, P.wood, 2);
    wheelV(s, 14.5, y0 - 3, 9, wheel, rim); s.rect(9, y0 - 4, 11, 1, P.iron[4]); s.rect(20, y0 - 4, 3, 1, P.iron[5]); s.rect(22, y0 - 4, 1, 4, P.iron[4]);
    s.slab(24, y0 + 3, 11, 5, 2, (x, y) => P.sand[3 + (hash(x, y, 3) > .6 ? 1 : 0)], WD(2, 'h', 3)); s.rect(24, y0 + 3, 11, 1, P.wood[4]);
    gems.forEach((g, i) => { const x = 25 + i * 3, y = y0 + 10 - (i & 1); s.set(x, y, g[5], 120); s.set(x + 1, y, g[3]); s.set(x, y + 1, g[2]); });
    s.thick(12, BY, 9, BY - 6, 1, P.wood, 3); s.rect(6, BY, 9, 1, P.plank[3]);
  };
  BK.add('lapidary_bench', grinder(P.sand, P.sand, [GEM.amethyst, GEM.citrine, GEM.moonstone]));
  BK.add('emery_bench', grinder(P.rock, P.iron, [GEM.emerald, GEM.topaz, GEM.emerald]));
  BK.add('faceting_lathe', (s, r) => {
    const y0 = table2(s, 4, 32, 12, 9, WP(6, 'h', 4), P.plank);
    s.slab(6, y0 - 3, 12, 6, 5, M.flat(P.iron, 4, 3), M.flat(P.iron, 3, 5)); gear(s, 12, y0 - 7, 4, P.iron, 8); gear(s, 19, y0 - 3, 2.6, P.copper, 6);
    s.oval(27, y0 + 4, 6, 3, (x, y, nx, ny) => { const q = Math.hypot(nx, ny); return q > .8 ? P.iron[nx + ny < 0 ? 6 : 3] : q < .15 ? P.iron[1] : P.iron[4 + ((Math.floor(q * 6) & 1) ? 1 : 0)]; });
    s.thick(18, y0, 26, y0 + 3, 1, P.iron, 5); s.set(27, y0 + 2, GEM.ruby[5], 200); s.set(26, y0 + 2, GEM.ruby[3], 120); s.set(27, y0 + 3, GEM.ruby[2]);
    s.set(31, y0 + 10, GEM.sapphire[5], 150); s.set(32, y0 + 10, GEM.sapphire[3]); s.set(8, y0 + 10, GEM.ruby[4], 150); s.set(9, y0 + 10, GEM.ruby[2]);
    s.thick(12, BY, 9, BY - 6, 1, P.iron, 3); s.rect(6, BY, 9, 1, P.iron[3]);
  });
  BK.add('clockwork_bench', (s, r) => {
    const y0 = table2(s, 4, 32, 13, 9, WP(8, 'h', 4), P.plank);
    gear(s, 12, y0 + 5, 4.4, P.copper, 9); gear(s, 19, y0 + 8, 2.8, P.iron, 7); gear(s, 27, y0 + 4, 3.4, P.gold, 8); gear(s, 32, y0 + 9, 2, P.copper, 5);
    s.slab(22, y0 - 4, 9, 4, 4, M.flat(P.iron, 4, 3), M.flat(P.iron, 3, 5)); s.rect(24, y0 - 7, 2, 3, P.iron[5]); s.rect(21, y0 - 2, 2, 1, P.wood[4]);
    s.line(6, y0 + 11, 13, y0 + 11, P.iron[6]); s.rect(13, y0 + 10, 3, 2, P.wood[4]);
    for (let j = 0; j < 5; j++) { s.set(7 + (j & 1), y0 + 2 + j, P.iron[5]); }
    s.rect(8, BY - 5, 24, 1, P.plank[2]); gear(s, 16, BY - 6, 2.4, P.iron, 6);
  });
  BK.add('alchemy_lab', (s, r, fr) => {
    const y0 = table2(s, 4, 32, 13, 9, WD(5, 'h', 4), P.wood);
    stoneRing(s, 13, y0 + 8, 5, 2, 8, true); s.set(12, y0 + 7, P.fire[3], 255); s.set(13, y0 + 6, P.fire[4], 255); s.set(14, y0 + 7, P.fire[2], 255); stoneRing(s, 13, y0 + 8, 5, 2, 8, false);
    s.ball(13, y0 + 1, 5, 4.6, 4, P.clay, { d: .15, bias: .05 }); s.ball(13, y0 - 5, 3.2, 2.8, 5, P.clay, { d: .15, bias: .1 });
    for (let i = 0; i < 10; i++) { s.set(16 + i, y0 - 5 + Math.round(i * .7), P.clay[4]); s.set(16 + i, y0 - 4 + Math.round(i * .7), P.clay[2]); }
    pot(s, 27, y0 + 9, 2.8, P.clay, P.purple[3]);
    flask(s, 31, y0 + 6, GLASS, P.green[4]); flask(s, 21, y0 + 12, GLASS, P.red[3]);
    for (let i = 0; i < 4; i++) s.line(5 + i, y0 + 3, 7 + i, y0 + 7, P.grassLoam[2 + (i % 3)]);
  }, { emit: { dx: -6, dy: -18, rad: 30, col: [1, .5, .2], flicker: 1 } });
  BK.add('apothecary', (s, r, fr) => {
    const y0 = bx2(s, 4, 32, 7, 26, WP(5, 'h', 4), WP(6, 'v', 3), { fd: .86 });
    for (const sy of [y0 + 10, y0 + 18, y0 + 26]) { s.rect(6, sy, 14, 6, P.plank[1]); s.rect(6, sy + 6, 14, 1, P.plank[4]); for (let i = 0; i < 4; i++) { const c = [P.green, P.red, P.purple, P.blue, P.gold][(i + sy) % 5]; s.rect(7 + i * 3, sy + 2, 2, 4, c[3]); s.set(7 + i * 3, sy + 2, GLASS[4]); s.set(7 + i * 3, sy + 1, P.wood[3]); } }
    for (const dy of [10, 22]) { s.rect(22, y0 + dy, 12, 10, P.plank[2]); s.rect(23, y0 + dy + 1, 10, 8, P.plank[3]); s.rect(27, y0 + dy + 4, 2, 2, P.copper[4]); }
    s.ball(11, y0 - 5, 5, 4.6, 4, P.copper, { d: .15, bias: .05 }); s.rect(10, y0 - 12, 3, 3, P.copper[4]);
    for (let a = 0; a < 16; a++) { const t = -1.57 + a / 15 * 3.14; s.set(17 + Math.cos(t) * 5, y0 - 8 + Math.sin(t) * 4 + a * .25, P.copper[4 - (a & 1)]); }
    for (let k = 0; k < 4; k++) for (let i = 0; i < 6; i++) s.set(22 + i + (k & 1), y0 - 5 + k * 2, P.copper[i < 2 ? 5 : 3]);
    pot(s, 31, y0 + 3, 2.4, P.copper, GLASS[3]);
    s.slab(4, BY - 1, 8, 0, 1, M.flat(P.stone, 5, 3), M.flat(P.stone, 4, 3));
  });
  BK.add('cheese_basin', (s, r) => {
    const st = M.wood(P.plank, { dir: 'v', pw: 4, b: 3, seed: 5 });
    for (let j = 0; j < 14; j++) s.tube(7, BY - 13 + j, 26, 1, j === 3 || j === 10 ? () => P.iron[4] : st);
    s.oval(20, BY - 14, 13, 5, (x, y, nx, ny) => { const q = Math.hypot(nx, ny); return q > .86 ? P.plank[5] : P.cloth[clamp(4 + (((x >> 1) + (y >> 1)) & 1 ? 1 : 0) - (q < .4 ? 1 : 0), 0, 5)]; });
    for (let a = 0; a < 20; a++) { const t = a / 20 * 6.283; s.set(20 + Math.cos(t) * 13.4, BY - 13 + Math.sin(t) * 5.2, P.wicker[a & 1 ? 4 : 2]); }
    for (const [x, y, rr] of [[8, BY + 2, 4.4], [31, BY + 1, 4]]) { s.tube(Math.round(x - rr), y - 3, Math.round(rr * 2), 4, () => P.hay[3]); s.oval(x, y - 3, rr, rr * .46, (px2, py, nx, ny) => P.hay[ny < 0 ? 4 : 3]); }
    s.rect(30, BY - 2, 2, 1, P.hay[1]);
  });
  BK.add('resin_tap', (s, r) => {
    trunk2(s, 20, BY, 40, 10, P.wood, 3);
    for (let k = 0; k < 5; k++) for (let i = 0; i < 4; i++) { s.set(18 - i, BY - 34 + k * 4 + i, P.plank[5]); s.set(19 + i, BY - 34 + k * 4 + i, P.plank[4]); }
    for (let j = 0; j < 20; j++) s.set(18 + (j > 14 ? 1 : 0), BY - 32 + j, P.fallYellow[4 + (j & 1)]);
    s.rect(18, BY - 13, 5, 1, P.plank[5]); s.rect(22, BY - 12, 2, 1, P.plank[3]);
    pot(s, 22, BY - 4, 4, P.clay, P.fallYellow[4]); s.line(18, BY - 9, 18, BY - 14, P.cloth[3]); s.line(26, BY - 9, 24, BY - 14, P.cloth[3]);
    s.set(22, BY - 11, P.fallYellow[5]); s.set(22, BY - 10, P.fallYellow[4]);
  });
  const cask = (s, x, y, w, h, o) => { const st = M.wood(P.plank, { pw: 3, b: 3, seed: x }); for (let j = 0; j < h; j++) { const bulge = Math.round(Math.sin(j / (h - 1) * 3.1416) * 1.6); s.tube(x - bulge, y + j, w + bulge * 2, 1, j === 2 || j === h - 3 ? () => (o && o.hoop || P.iron)[4] : (px2, py) => st(py, px2)); } };
  BK.add('fermenter', (s, r) => {
    for (const x of [4, 33]) { s.rect(x, BY - 8, 3, 9, P.wood[2]); s.rect(x, BY - 8, 1, 9, P.wood[4]); } s.rect(3, BY - 9, 34, 2, P.wood[3]); s.rect(3, BY - 9, 34, 1, P.wood[5]);
    for (const [x, h] of [[5, 16], [15, 18], [26, 15]]) {
      const st = M.wood(P.plank, { dir: 'v', pw: 3, b: 3, seed: x }), w = 9;
      for (let j = 0; j < h; j++) { const bulge = Math.round(Math.sin(j / (h - 1) * 3.14) * 1.2); s.tube(x - bulge, BY - 9 - h + j, w + bulge * 2, 1, j === 3 || j === h - 4 ? () => P.iron[4] : st); }
      s.oval(x + 4.5, BY - 9 - h, 5, 2.2, (px2, py, nx, ny) => P.cloth[ny < -.2 ? 5 : nx > .4 ? 3 : 4]); for (let i = -4; i <= 5; i += 2) s.set(x + 4 + i, BY - 8 - h + 1, P.cloth[3]); s.rect(x + 1, BY - 7 - h + 1, 8, 1, P.leather[3]);
    }
    s.rect(19, BY - 14, 2, 2, P.wood[1]); s.set(20, BY - 12, P.gold[3]);
  });
  BK.add('brewing_barrel', (s, r) => {
    const st = M.wood(P.plank, { dir: 'v', pw: 4, b: 2, seed: 3 });
    for (let j = 0; j < 9; j++) s.tube(3, BY - 8 + j, 34, 1, j === 2 || j === 6 ? () => P.iron[4] : st);
    s.oval(20, BY - 9, 17, 7, (x, y, nx, ny) => { const q = Math.hypot(nx, ny); return q > .88 ? P.plank[nx + ny < 0 ? 5 : 3] : ny < -.6 ? P.ink : P.leather[noise(x * .3, y * .5, 3) > .68 ? 2 : noise(x * .2 + 5, y * .4, 7) > .7 ? 0 : 1]; });
    for (let i = 0; i < 7; i++) { const x = 9 + r() * 22, y = BY - 11 + r() * 5; s.rect(x, y, 3, 1, P.wood[3 + (i & 1)]); s.set(x, y + 1, P.wood[1]); }
    s.set(14, BY - 8, P.cloth[5]); s.set(15, BY - 8, P.cloth[4]); s.thick(31, BY - 8, 36, BY - 22, 2, P.wood, 4);
  }, { flat: 1 });
  BK.add('beast_tanning_bucket', (s, r) => {
    s.oval(20, BY - 10, 17, 10, WD(3, 'v', 3)); for (let a = 0; a < 60; a++) { const t = a / 60 * 6.283; s.set(20 + Math.cos(t) * 17, BY - 10 + Math.sin(t) * 10, P.iron[Math.cos(t - 3.9) > 0 ? 5 : 2]); s.set(20 + Math.cos(t) * 16, BY - 10 + Math.sin(t) * 9.3, P.iron[Math.cos(t - 3.9) > 0 ? 4 : 1]); }
    s.oval(20, BY - 9, 13.4, 7.2, (x, y, nx, ny) => ny < -.55 ? P.ink : P.furDark[noise(x * .3, y * .5, 3) > .7 ? 2 : 1]);
    s.fill(11, BY - 13, 12, 6, M.fur(P.furBrown, 3, 2)); s.fill(22, BY - 8, 8, 4, M.fur(P.furDark, 3, 4)); s.rect(13, BY - 14, 6, 1, P.furBrown[5]);
    for (const [x, y] of [[4, BY - 10], [35, BY - 10], [20, BY - 1]]) { s.rect(x, y, 2, 2, P.iron[6]); }
  }, { flat: 1 });
  BK.add('brewhouse', (s, r, fr) => {
    const y0 = bx2(s, 3, 20, 8, 12, BR(P.brick, 2, 4), BR(P.brick, 4, 3), { fd: .84 });
    s.ball(13, y0 - 5, 10, 9, 3, P.copper, { d: .14, bias: .04 }); for (let x = 3; x < 24; x++) for (let y = y0 + 2; y < y0 + 8; y++) if (s.get(x, y) && P.copper.indexOf(s.get(x, y)) >= 0 && y > y0 + 4) s.set(x, y, null);
    bx2(s, 3, 20, 3, 12, BR(P.brick, 2, 4), BR(P.brick, 4, 3), { fd: .84 });
    s.oval(13, y0 - 13, 5, 1.8, (x, y, nx, ny) => Math.hypot(nx, ny) < .7 ? P.furTan[3] : P.copper[5]); s.rect(4, y0 - 4, 2, 1, P.copper[5]); for (const x of [5, 9, 13, 17, 21]) s.set(x, y0 - 1, P.copper[5]);
    s.rect(9, BY - 8, 8, 7, P.ink); flame2(s, 13, BY - 2, 2, 5, fr); s.rect(8, BY - 9, 10, 1, P.brick[5]);
    const st = M.wood(P.plank, { dir: 'v', pw: 4, b: 3, seed: 7 }); for (let j = 0; j < 13; j++) s.tube(25, BY - 12 + j, 12, 1, j === 3 || j === 9 ? () => P.iron[4] : st);
    s.oval(31, BY - 13, 6, 2.4, (x, y, nx, ny) => Math.hypot(nx, ny) > .8 ? P.plank[5] : P.hay[2 + (hash(x, y, 3) > .6 ? 1 : 0)]);
    s.thick(27, BY - 14, 35, BY - 26, 1, P.wood, 4);
  }, { frames: 2, emit: { dx: -6, dy: -4, rad: 50, col: [1, .5, .2], flicker: 1 } });
  BK.add('lagering_cellar', (s, r) => {
    const st = ST(3, 3);
    for (let j = 0; j < 36; j++) for (let i = 0; i < 36; i++) { const nx = (i - 17.5) / 18, ny = (35 - j) / 36; if (nx * nx + ny * ny * .9 > 1) continue; const inner = Math.pow(Math.abs(nx) * 1.32, 2) + Math.pow(ny * 1.22, 2) < 1; s.set(2 + i, BY - 35 + j, inner ? (j > 31 ? P.stone[1] : P.ink) : st(2 + i, BY - 35 + j)); }
    for (let i = 0; i < 9; i++) { const t = Math.PI * (i / 8), x = 20 - Math.cos(t) * 14.6, y = BY - 2 - Math.sin(t) * 28.4; s.rect(Math.round(x) - 1, Math.round(y) - 1, 3, 2, P.stone[5 - (i & 1)]); }
    const cs = M.wood(P.plank, { pw: 3, b: 3, seed: 5 });
    s.oval(20, BY - 12, 10, 10, (x, y, nx, ny) => { const q = Math.hypot(nx, ny); return q > .86 ? P.iron[nx + ny < 0 ? 6 : 3] : q < .12 ? P.wood[1] : Math.abs(q - .5) < .05 ? P.iron[5] : cs(x, y); });
    s.rect(19, BY - 5, 3, 2, P.copper[4]); s.set(20, BY - 3, P.copper[2]);
    for (const x of [9, 28]) { s.rect(x, BY - 3, 4, 4, P.wood[2]); s.rect(x, BY - 3, 4, 1, P.wood[4]); }
    for (let i = 0; i < 8; i++) s.set(6 + r() * 28, BY - 30 + r() * 12, P.snow[3]);
  });
  BK.add('donkey_mill', (s, r) => {
    const st = M.flat(P.stone, 3, 3);
    s.tube(8, BY - 9, 26, 10, st); s.oval(21, BY - 9, 13, 5, M.flat(P.stone, 5, 5));
    s.tube(12, BY - 18, 18, 9, st); s.oval(21, BY - 18, 9, 3.6, M.flat(P.stone, 5, 7));
    s.rect(20, BY - 32, 3, 14, P.wood[3]); s.rect(20, BY - 32, 1, 14, P.wood[5]); s.rect(18, BY - 33, 7, 2, P.iron[4]);
    s.thick(21, BY - 28, 54, BY - 24, 2, P.wood, 4); s.thick(21, BY - 26, 30, BY - 19, 1, P.wood, 2);
    s.thick(52, BY - 24, 50, BY - 12, 1, P.leather, 3); s.thick(55, BY - 24, 55, BY - 12, 1, P.leather, 2); s.rect(49, BY - 12, 8, 2, P.leather[4]); s.rect(49, BY - 10, 8, 1, P.leather[1]);
    for (let i = 0; i < 9; i++) s.set(13 + hash(i, 1, 3) * 16, BY - 10 + hash(i, 2, 3) * 2, P.hay[3 + (i & 1)]);
    for (let a = 0; a < 26; a++) { const t = a / 26 * 6.283; if (Math.sin(t) > .2) s.set(28 + Math.cos(t) * 26, BY - 3 + Math.sin(t) * 6, P.soilPoor[1 + (a & 1)]); }
    sacklet(s, 3, BY - 4, 3.6, 2);
  }, { wide: 1 });
  BK.add('watermill', (s, r, fr) => {
    const B = 102, st = ST(3, 3), tw = daubTex(4, 31);
    s.fill(22, B - 20, 42, 21, (x, y) => st(x, y)); s.rect(22, B - 20, 42, 1, P.stone[5]);
    for (let j = 0; j < 26; j++) s.tube(22, B - 46 + j, 42, 1, (x, y) => (j % 13 < 2 || x % 14 === 8) ? P.wood[3] : tw(x, y));
    for (let j = 0; j < 22; j++) { const hw = 3 + j * 1.05; for (let x = Math.round(43 - hw); x <= 43 + hw; x++) s.set(x, B - 68 + j, thTex(x + j, B - 68 + j)); } s.rect(19, B - 46, 48, 1, P.thatch[0]);
    s.fill(46, B - 15, 10, 16, WD(4, 'v', 3)); s.rect(45, B - 16, 12, 1, P.wood[5]); s.set(54, B - 7, P.iron[6]);
    s.rect(50, B - 38, 7, 7, P.wood[1]); s.rect(51, B - 37, 5, 5, P.deep[2]); s.rect(51, B - 37, 1, 5, P.deep[4]);
    const wx = 18, wy = B - 20, R2 = 18;
    for (let a = 0; a < 8; a++) { const t = a / 8 * 6.283 + fr * .26; s.thick(wx, wy, wx + Math.cos(t) * R2, wy + Math.sin(t) * R2, 2, P.wood, a < 4 ? 2 : 4); }
    for (let a = 0; a < 140; a++) { const t = a / 140 * 6.283, li = Math.cos(t - 3.9) > 0; for (const rr of [R2, R2 - 1, R2 - 5]) s.set(wx + Math.cos(t) * rr, wy + Math.sin(t) * rr, P.wood[li ? 5 : 2]); }
    for (let a = 0; a < 12; a++) { const t = a / 12 * 6.283 + fr * .26; s.thick(wx + Math.cos(t) * (R2 - 5), wy + Math.sin(t) * (R2 - 5), wx + Math.cos(t + .16) * (R2 + 1), wy + Math.sin(t + .16) * (R2 + 1), 2, P.plank, 3); }
    s.oval(wx, wy, 3, 3, () => P.iron[4]); s.set(wx - 1, wy - 1, P.iron[6]);
    for (let x = 0; x < 34; x++) for (let y = B - 2; y < B + 5; y++) { const v = noise(x * .3 + fr, y * .7, 5); s.set(x, y, v > .62 ? P.foam[1] : P.shallow[2 + (v > .45 ? 1 : 0)]); }
    s.slab(0, B - 40, 20, 3, 2, WD(3, 'h', 4), WD(5, 'h', 3)); for (let y = B - 36; y < B - 20; y++) s.set(17 + (y & 1), y, P.shallow[4]); 
  }, { tall: 1, frames: 3 });
})();
(() => {
  const X = DBX, BK = X.BK, { pot } = BK;
  const C = { couch: R('#3a2440 #54365a #724c76 #906892 #ae88ae'), ivory: R('#5a4a30 #86724c #b09c70 #d2c298 #eadfbc #f8f2dc'), green: P.green, fleece: P.cloth };
  const chair = (s, x, w, seatTex, backTex, o) => {
    o = o || {};
    const bh = o.back || 16;
    s.fill(x, BY - 14 - bh, w, bh + 2, backTex); s.rect(x, BY - 14 - bh, w, 1, P.plank[5]); s.rect(x, BY - 14 - bh, 1, bh, P.plank[4]); s.rect(x + w - 1, BY - 14 - bh, 1, bh, P.plank[1]);
    for (const lx of [x, x + w - 2]) { s.rect(lx, BY - 6, 2, 7, P.plank[2]); s.rect(lx, BY - 6, 1, 7, P.plank[4]); }
    s.slab(x - 1, BY - 14, w + 2, 6, 3, seatTex, seatTex);
  };
  BK.add('wooden_table', (s) => {
    const y0 = table2(s, 4, 32, 14, 9, WP(5, 'v', 4), P.plank);
    for (const [x, y] of [[5, y0 + 1], [34, y0 + 1], [5, y0 + 12], [34, y0 + 12], [5, y0 + 15], [34, y0 + 15]]) s.set(x, y, P.iron[6]);
    s.oval(13, y0 + 7, 4.6, 2.6, (x, y, nx, ny) => P.plank[nx * nx + ny * ny < .4 ? 2 : 5]); s.oval(13, y0 + 6.6, 2.4, 1.2, () => P.red[3]);
    pot(s, 26, y0 + 9, 2.8, P.clay, P.deep[3]); s.rect(29, y0 + 4, 1, 3, P.clay[2]);
    s.oval(20, y0 + 11, 3, 1.6, (x, y, nx, ny) => P.furTan[ny < 0 ? 4 : 3]);
  });
  BK.add('wooden_stool', (s) => {
    s.thick(12, BY, 15, BY - 9, 2, P.plank, 3); s.thick(27, BY, 24, BY - 9, 2, P.plank, 2); s.thick(19, BY + 2, 19, BY - 8, 2, P.plank, 3);
    s.tube(11, BY - 12, 18, 3, WP(3, 'h', 3)); s.oval(20, BY - 12, 9, 3.6, WP(4, 'h', 4));
  });
  BK.add('cushioned_chair', (s) => { chair(s, 10, 20, M.cloth(C.green, 3, 3), WP(3, 'v', 3)); s.ball(20, BY - 15, 9, 3.4, 4, C.green, { d: .2, bias: .08 }); s.rect(11, BY - 12, 18, 1, C.green[1]); });
  BK.add('tacked_chair', (s) => { chair(s, 10, 20, M.cloth(C.fleece, 4, 3), WP(5, 'v', 3), { back: 17 }); for (let x = 10; x < 31; x += 3) s.set(x, BY - 9, P.copper[5]); for (let x = 11; x < 30; x += 4) s.set(x, BY - 29, P.copper[5]); s.rect(12, BY - 27, 16, 9, P.cloth[4]); s.rect(12, BY - 27, 16, 1, P.cloth[5]); for (let x = 12; x < 28; x += 3) { s.set(x, BY - 27, P.copper[4]); s.set(x, BY - 19, P.copper[3]); } });
  BK.add('wicker_chair', (s) => {
    const wv = M.weave(P.wicker, 3);
    for (let j = 0; j < 22; j++) { const hw = 10 + Math.round(Math.sin(j / 21 * 1.4) * 2); s.tube(20 - hw, BY - 30 + j, hw * 2, 1, wv); }
    for (let j = 0; j < 9; j++) s.tube(9, BY - 8 + j, 22, 1, wv);
    s.oval(20, BY - 9, 9.4, 4, (x, y, nx, ny) => P.cloth[clamp(4 + (nx + ny < -.3 ? 1 : 0) - (nx + ny > .6 ? 1 : 0) - (hash(x, y, 3) > .85 ? 1 : 0), 0, 5)]);
    s.rect(9, BY - 30, 22, 1, P.wicker[4]);
  });
  BK.add('padded_bench', (s) => {
    for (const lx of [4, 34]) { s.rect(lx, BY - 7, 2, 8, P.plank[2]); s.rect(lx, BY - 7, 1, 8, P.plank[4]); } s.rect(6, BY - 3, 28, 1, P.plank[1]);
    s.slab(2, BY - 14, 36, 6, 3, WP(3, 'h', 4), WP(4, 'h', 3));
    s.slab(4, BY - 16, 32, 5, 2, M.cloth(C.fleece, 4, 3), M.cloth(C.fleece, 3, 5)); for (let x = 8; x < 34; x += 6) s.set(x, BY - 13, P.cloth[1]);
  });
  BK.add('couch', (s) => {
    const up = M.cloth(C.couch, 2, 3);
    s.fill(3, BY - 28, 50, 16, up); s.rect(3, BY - 28, 50, 1, C.couch[4]); s.rect(3, BY - 28, 1, 16, C.couch[3]); s.rect(52, BY - 28, 1, 16, C.couch[0]);
    for (const x of [19, 36]) s.rect(x, BY - 27, 1, 14, C.couch[0]);
    for (let i = 0; i < 3; i++) { s.slab(5 + i * 16, BY - 14, 15, 7, 5, M.cloth(C.couch, 3, 5 + i), M.cloth(C.couch, 2, 7)); s.set(12 + i * 16, BY - 22, P.gold[3]); }
    for (const x of [0, 51]) s.slab(x, BY - 20, 5, 6, 15, WP(2, 'v', 4), WP(3, 'v', 3));
    for (const x of [2, 52]) s.rect(x, BY, 2, 2, P.plank[1]);
  }, { wide: 1 });
  const bedFrame = (s, frame) => { const x = 9, w = 22, y = 14; s.fill(x, y + 6, w, 26, WD(3, 'v', 2)); s.fill(x, y + 30, w, 3, WP(1, 'v', 2)); s.rect(x, y + 30, w, 1, frame[4]); s.rect(x, y + 6, 1, 26, frame[4]); s.rect(x + w - 1, y + 6, 1, 26, frame[1]); return [x, y, w]; };
  BK.add('hide_bed', (s) => {
    const [x, y, w] = bedFrame(s, P.wood);
    s.fill(x + 2, y + 7, w - 4, 23, (px2, py) => P.hay[clamp(2 + (noise(px2 * .9, py * .4, 3) > .55 ? 1 : 0) - (noise(px2 * .7 + 5, py * .5, 5) > .65 ? 1 : 0), 0, 4)]);
    const fur = M.fur(P.furTan, 3, 5); for (let j = 0; j < 18; j++) for (let i = 0; i < w - 2; i++) { if ((j === 0 || j === 17) && (i % 4 === 0)) continue; let c = fur(x + 1 + i, y + 13 + j); if (j < 2) c = lit(c, 1.15); if (i > w - 6) c = dark(c, .82); s.set(x + 1 + i, y + 13 + j, c); }
    s.fill(x + 3, y + 8, w - 6, 5, M.fur(P.furGrey, 3, 2)); s.rect(x + 3, y + 8, w - 6, 1, P.furGrey[5]);
    s.rect(x, y + 4, w, 3, P.wood[3]); s.rect(x, y + 4, w, 1, P.wood[5]);
  }, { flat: 1 });
  BK.add('leather_bed', (s) => {
    bed2(s, P.plank, P.leather, {});
    for (let j = 0; j < 12; j += 4) for (let i = 0; i < 16; i += 4) { s.set(12 + i + ((j / 4) & 1) * 2, 32 + j, P.leather[0]); s.set(12 + i + ((j / 4) & 1) * 2, 31 + j, P.leather[5]); }
  }, { flat: 1 });
  BK.add('sleeping_spot', (s, r) => {
    s.oval(20, BY - 8, 15, 10, (x, y, nx, ny) => { const q = nx * nx + ny * ny; return q > .82 && hash(x, y, 3) > .45 ? null : P.soilPoor[2 + (hash(x, y, 5) > .75 ? 1 : 0) - (q > .6 ? 1 : 0)]; });
    for (let i = 0; i < 60; i++) { const x = 9 + r() * 22, y = BY - 15 + r() * 14; if (Math.hypot((x - 20) / 12, (y - BY + 8) / 7.4) < 1) { s.set(x, y, P.hay[2 + (i % 3)]); s.set(x + 1, y, P.hay[1 + (i % 2)]); } }
    s.ball(20, BY - 16, 5, 2.6, 2, P.hay, { n: .5, ns: 1.2, d: .3 });
    for (const [x, y] of [[6, BY - 12], [34, BY - 10], [8, BY - 1], [31, BY]]) s.ball(x, y, 2.2, 1.7, 3, P.rock, { d: .15, bias: .06 });
  }, { flat: 1 });
  const rug = (fur, o) => (s) => {
    const f = M.fur(fur, 3, 5), k = o.k || 1, cx = 20, n = fur.length - 1;
    for (const [x, y] of [[cx - 12 * k, 20], [cx + 8 * k, 20], [cx - 13 * k, 40], [cx + 9 * k, 40]]) { s.oval(x + 1.5, y, 3.4 * k, 4 * k, f); s.set(x, y + 3 * k, P.bone[5]); s.set(x + 2, y + 4 * k, P.bone[4]); if (o.claws) { s.set(x + 1, y + 4 * k, o.claws); s.set(x - 1, y + 3 * k, o.claws); } }
    s.oval(cx, 31, 11 * k, 13, f);
    if (o.stripes) for (let j = 0; j < 7; j++) for (let i = -8; i <= 8; i++) if (Math.abs(i) > 2 && s.get(cx + i, 21 + j * 3 + Math.abs(i) * .3)) s.set(cx + i, 21 + j * 3 + Math.abs(i) * .3, P.leather[1]);
    if (o.mane) for (let i = -7; i <= 7; i++) for (let j = 0; j < 5; j++) if (hash(i, j, 3) > .3) s.set(cx + i, 18 + j + Math.abs(i) * .4, o.mane[2 + ((i + j) & 1)]);
    s.ball(cx, 14, 6 * k, 5.4 * k, 1, fur, { n: .3, ns: .9, d: .2 });
    if (o.pointEars) for (const sd of [-1, 1]) for (let j = 0; j < 4; j++) s.rect(cx + sd * (5 * k) - (sd > 0 ? 2 - (j >> 1) : 0), 9 - j, 3 - (j >> 1), 1, fur[sd < 0 ? n - 1 : n - 3]); else { s.oval(cx - 5 * k, 9.5, 2, 2, () => fur[n - 1]); s.oval(cx + 5 * k, 9.5, 2, 2, () => fur[n - 3]); }
    s.ball(cx, 17 + (k - 1) * 2, 3 * k, 2.4 * k, 2, o.muzzle || P.furTan, { d: .2 });
    s.set(cx - 3, 13, o.eye || P.ink); s.set(cx + 3, 13, o.eye || P.ink); s.rect(cx - 1, 16, 2, 2, P.ink);
    if (o.jaw) { s.rect(cx - 3, 19 + (k - 1) * 2, 6, 3, P.red[0]); s.rect(cx - 3, 19 + (k - 1) * 2, 6, 1, P.ink); for (const dx of [-3, -1, 1, 2]) s.set(cx + dx, 20 + (k - 1) * 2, P.bone[5]); for (const dx of [-2, 2]) s.set(cx + dx, 21 + (k - 1) * 2, P.bone[4]); } else { s.set(cx - 2, 19, P.bone[5]); s.set(cx + 2, 19, P.bone[5]); }
    if (o.fangs) for (const dx of [-3, 2]) { s.rect(cx + dx, 18, 1, 6, P.bone[5]); s.set(cx + dx + (dx < 0 ? 1 : -1), 18, P.bone[3]); }
  };
  BK.add('dire_wolf_rug', rug(P.furDark, { mane: P.furGrey, pointEars: 1, muzzle: P.furGrey, eye: P.fire[3] }), { flat: 1 });
  BK.add('cave_bear_rug', rug(P.furDark, { k: 1.14, jaw: 1, muzzle: P.furBrown, claws: P.bone[5] }), { flat: 1 });
  BK.add('sabretooth_rug', rug(P.savanna, { stripes: 1, fangs: 1, muzzle: P.cloth }), { flat: 1 });
  BK.add('trophy_mount', (s) => {
    s.rect(18, BY - 14, 4, 15, P.wood[2]); s.rect(18, BY - 14, 1, 15, P.wood[4]); s.slab(12, BY - 1, 16, 0, 2, WD(2, 'h', 4), WD(3, 'h', 3));
    for (let j = 0; j < 16; j++) { const hw = j < 3 ? 5 + j : j > 11 ? 8 - (j - 11) * 1.6 : 8; for (let i = -hw; i < hw; i++) s.set(20 + i, BY - 30 + j, P.plank[clamp(3 + (i < -hw + 2 ? 1 : i > hw - 3 ? -1 : 0) + (j === 0 ? 1 : 0) - ((i + 40) % 5 === 0 ? 1 : 0), 0, 5)]); }
    s.oval(20, BY - 24, 3.6, 4.4, (x, y, nx, ny) => P.bone[nx + ny < -.3 ? 5 : nx + ny < .5 ? 4 : 3]); s.set(18, BY - 25, P.ink); s.set(21, BY - 25, P.ink); s.rect(19, BY - 21, 2, 2, P.bone[2]);
    for (const sd of [-1, 1]) { const c = sd < 0 ? 5 : 4; s.thick(20 + sd * 3, BY - 27, 20 + sd * 9, BY - 36, 2, P.bone, c - 1); s.thick(20 + sd * 9, BY - 36, 20 + sd * 7, BY - 43, 1, P.bone, c - 1); s.thick(20 + sd * 7, BY - 33, 20 + sd * 13, BY - 38, 1, P.bone, c - 1); s.thick(20 + sd * 9, BY - 37, 20 + sd * 14, BY - 44, 1, P.bone, c - 1); s.thick(20 + sd * 5, BY - 30, 20 + sd * 4, BY - 36, 1, P.bone, c - 1); }
  });
  BK.add('claw_totem', (s) => {
    s.tube(16, BY - 38, 8, 39, (x, y) => P.furDark[clamp(3 - (noise(x * 1.2, y * .2, 3) > .66 ? 1 : 0), 0, 4)]);
    for (const y of [BY - 33, BY - 22]) { s.rect(17, y, 6, 5, P.furDark[1]); s.rect(18, y + 1, 1, 2, P.red[3]); s.rect(21, y + 1, 1, 2, P.red[3]); s.rect(18, y + 4, 4, 1, P.bone[4]); }
    s.rect(15, BY - 39, 10, 2, P.furDark[4]); s.rect(14, BY - 27, 12, 1, P.leather[4]); s.rect(14, BY - 15, 12, 1, P.leather[4]);
    for (const [y0, sd] of [[BY - 26, -1], [BY - 26, 1], [BY - 14, -1], [BY - 14, 1]]) for (let i = 0; i < 4; i++) { const x = 20 + sd * (5 + i * 2), y = y0 + 1 + i; s.set(x, y - 1, P.cloth[3]); for (let j = 0; j < 5; j++) s.set(x + sd * (j > 2 ? 1 : 0), y + j, P.bone[j > 3 ? 5 : 4 - (sd > 0 ? 1 : 0)]); }
    s.oval(20, BY - 42, 3.4, 3, (x, y, nx, ny) => P.bone[nx + ny < -.2 ? 5 : 4]); s.set(19, BY - 42, P.ink); s.set(21, BY - 42, P.ink);
  });
  BK.add('ivory_idol', (s) => {
    s.slab(11, BY - 5, 18, 4, 3, WD(2, 'h', 4), WD(3, 'h', 3));
    const I = C.ivory;
    for (let j = 0; j < 30; j++) { const f = j / 29, hw = 1.2 + f * 4.2, cx = 20 - Math.round(Math.pow(1 - f, 2) * 7); for (let i = Math.round(-hw); i <= hw; i++) { const u = (i + hw) / (2 * hw + .01); s.set(cx + i, BY - 35 + j, I[clamp((u < .2 ? 5 : u < .55 ? 4 : u < .8 ? 3 : 2) - (j % 7 === 6 ? 2 : 0), 0, 5)]); } }
    for (const [x, y] of [[18, BY - 22], [21, BY - 22]]) { s.set(x, y, I[0]); s.set(x, y - 1, I[1]); }
    s.rect(18, BY - 19, 4, 1, I[0]); s.set(19, BY - 20, I[1]); s.set(20, BY - 20, I[1]);
    for (let i = 0; i < 4; i++) { s.set(17 + i, BY - 13 + (i > 1 ? 1 : 0), I[1]); s.set(23 - i, BY - 11 + (i > 1 ? 1 : 0), I[1]); }
    for (let i = -3; i <= 3; i++) s.set(20 + i, BY - 25 + (Math.abs(i) > 2 ? 1 : 0), I[1]);
  });
  BK.add('hay_rack', (s, r) => {
    for (const x of [4, 33]) { s.thick(x, BY, x + (x < 20 ? 3 : -3), BY - 22, 2, P.wood, x < 20 ? 4 : 2); }
    for (let k = 0; k < 4; k++) s.rect(6, BY - 6 - k * 4, 28, 1, P.wood[3 - (k & 1)]);
    for (let x = 8; x < 33; x += 4) s.rect(x, BY - 19, 1, 14, P.wood[2]);
    s.ball(20, BY - 22, 15, 8, 3, P.hay, { n: .7, ns: 1.3, d: .3 }); for (let i = 0; i < 26; i++) { const x = Math.round(6 + r() * 28), y = Math.round(BY - 28 + r() * 12); if (s.get(x, y)) { s.set(x, y, P.hay[4]); s.set(x + 1, y + 1, P.hay[1]); } }
    for (let i = 0; i < 8; i++) { const x = 7 + r() * 26; s.set(x, BY - 12 + r() * 3, P.hay[3]); s.set(x, BY - 11 + r() * 3, P.hay[2]); }
    for (let i = 0; i < 5; i++) s.set(6 + r() * 28, BY + r(), P.hay[3]);
  });
  BK.add('meat_larder', (s) => {
    for (const x of [4, 33]) { s.rect(x, BY - 34, 3, 35, P.wood[x < 20 ? 3 : 2]); s.rect(x, BY - 34, 1, 35, P.wood[5]); }
    for (let x = 6; x < 34; x++) { s.set(x, BY - 31 + Math.round(Math.sin((x - 6) / 28 * 3.14) * 2), P.wicker[x % 3 ? 4 : 2]); s.set(x, BY - 30 + Math.round(Math.sin((x - 6) / 28 * 3.14) * 2), P.wicker[1]); }
    const hang = (x, len, w) => { const y0 = BY - 29 + Math.round(Math.sin((x - 6) / 28 * 3.14) * 2); s.rect(x, y0, 1, 3, P.iron[5]); s.set(x + 1, y0 + 3, P.iron[5]); for (let j = 0; j < len; j++) { const ww = Math.round(w * Math.sin((j + 1) / (len + 1) * 2.6 + .3)); for (let i = -ww; i <= ww; i++) s.set(x + i, y0 + 4 + j, P.red[clamp(3 + (i < -ww + 1 ? 1 : i > ww - 1 ? -1 : 0) - (j % 5 === 4 ? 1 : 0), 0, 4)]); } s.set(x, y0 + 4, P.bone[5]); s.set(x, y0 + 5, P.bone[4]); s.set(x - 1, y0 + 6 + (len >> 1), P.cloth[5]); };
    hang(11, 13, 3); hang(20, 16, 4); hang(29, 11, 3);
  });
  BK.add('rope_granary', (s) => {
    for (const x of [5, 32]) { s.rect(x, BY - 36, 3, 37, P.wood[x < 20 ? 3 : 2]); s.rect(x, BY - 36, 1, 37, P.wood[5]); s.ball(x + 1.5, BY - 1, 3.4, 2.4, 2, P.stone, { d: .15, bias: .05 }); }
    s.tube(3, BY - 37, 34, 3, () => P.wood[4]);
    for (const [x, y, rr] of [[12, BY - 18, 5.4], [21, BY - 15, 6], [29, BY - 19, 5]]) { s.line(x, BY - 34, x, y - rr - 1, P.wicker[3]); s.ball(x, y, rr, rr * 1.12, 3, P.cloth, { n: .22, ns: .5, d: .15, bias: -.04 }); s.rect(x - 1, Math.round(y - rr - 2), 3, 2, P.cloth[4]); s.rect(x - 2, Math.round(y - rr), 5, 1, P.wicker[2]); for (let j = -3; j < 4; j += 2) s.set(x + 2, y + j, P.cloth[1]); }
    for (let i = 0; i < 5; i++) s.set(12 + i * 4, BY, P.hay[3 + (i & 1)]);
  });
  BK.add('root_clamp', (s, r) => {
    s.ball(20, BY - 8, 17, 12, 0, P.soil, { n: .4, ns: .5, d: .2 }); for (let x = 0; x < 40; x++) for (let y = BY + 1; y < 52; y++) s.set(x, y, null);
    for (let i = 0; i < 150; i++) { const x = 5 + Math.floor(r() * 30), y = BY - 20 + Math.floor(r() * 12); if (s.get(x, y)) { s.set(x, y, P.hay[2 + Math.floor(r() * 3)]); if (s.get(x + 1, y + 1) && i % 2) s.set(x + 1, y + 1, P.hay[1]); } }
    for (let j = 0; j < 9; j++) for (let i = 0; i < 12; i++) { const nx = (i - 5.5) / 6, ny = (8 - j) / 9; if (nx * nx + ny * ny < 1) s.set(14 + i, BY - 8 + j, P.soilRich[ny > .7 ? 2 : 0]); }
    for (const [x, y] of [[17, BY - 2], [22, BY - 3], [20, BY], [25, BY - 1]]) { s.ball(x, y, 2.4, 2.1, 3, P.purple, { d: .2, bias: .12 }); s.set(x, y + 1, P.cloth[4]); s.set(x - 1, y - 2, P.ash[4]); }
  });
  BK.add('snare_trap', (s) => {
    for (let t = 0; t <= 40; t++) { const u = t / 40, x = 8 + u * 20, y = BY - Math.sin(u * 2.2) * 30 + u * 8; s.set(x, y, P.ash[2 + (t % 3 === 0 ? 1 : 0)]); s.set(x + 1, y, P.wood[3]); if (t % 9 === 4 && u > .3) { s.set(x - 1, y - 1, P.ash[4]); s.set(x - 2, y - 2, P.ash[5]); } }
    s.line(28, BY - 17, 26, BY - 5, P.cloth[3]);
    for (let a = 0; a < 26; a++) { const t = a / 26 * 6.283; s.set(25 + Math.cos(t) * 6, BY - 2 + Math.sin(t) * 2.6, P.cloth[Math.sin(t) < 0 ? 2 : 4]); }
    s.rect(32, BY - 6, 2, 7, P.wood[3]); s.rect(32, BY - 6, 1, 7, P.wood[5]); s.rect(31, BY - 6, 4, 1, P.wood[1]); s.rect(7, BY - 1, 3, 2, P.wood[2]);
  }, { flat: 1 });
  BK.add('deadfall', (s) => {
    for (let j = 0; j < 9; j++) for (let i = 0; i < 28; i++) { const x = 5 + i, y = BY - 20 + j + Math.round(i * .36); s.set(x, y, P.rock[clamp(5 - Math.floor(j / 2.4) - (i > 24 ? 1 : 0) + (i < 2 ? 1 : 0) - (hash(i >> 2, j >> 1, 3) > .8 ? 1 : 0), 0, 6)]); }
    for (let i = 0; i < 26; i++) s.set(6 + i, BY - 21 + Math.round(i * .36), P.rock[6]);
    s.thick(10, BY, 12, BY - 14, 2, P.wood, 4); s.thick(8, BY - 6, 21, BY - 3, 1, P.wood, 3); s.thick(11, BY - 12, 16, BY - 5, 1, P.wood, 2);
    s.set(21, BY - 3, P.red[3]); s.set(22, BY - 3, P.red[4]); s.set(22, BY - 2, P.red[2]);
    for (let x = 12; x < 34; x++) if ((x & 1)) s.set(x, BY + 1, P.soilPoor[0]);
  });
  BK.add('barricade', (s, r) => {
    logOnSide(s, 3, BY - 8, 33);
    for (const [x0, x1, w] of [[6, 13, 2], [14, 9, 2], [17, 24, 2], [25, 20, 2], [28, 35, 2], [35, 30, 2]]) { s.thick(x0, BY + 1, x1, BY - 26, w, P.wood, x1 > x0 ? 4 : 2); s.set(x1, BY - 27, P.plank[5]); s.set(x1 + (x1 > x0 ? 1 : 0), BY - 28, P.plank[4]); }
    for (const x of [10, 21, 32]) { for (let i = 0; i < 4; i++) s.set(x - 2 + i, BY - 9 + (i & 1), P.cloth[i & 1 ? 3 : 4]); }
    s.thick(2, BY - 13, 37, BY - 15, 2, P.woodGrey, 3);
  });
  function logOnSide(s, x, y, w) { for (let j = 0; j < 7; j++) for (let i = 0; i < w; i++) s.set(x + i, y + j, P.wood[clamp([4, 5, 4, 3, 2, 1, 0][j] - (noise(i * .22 + 7, j * 1.3, 2) > .68 ? 1 : 0), 0, 5)]); s.oval(x + 1.5, y + 3.5, 2.6, 3.5, (px2, py, nx, ny) => { const q = Math.hypot(nx, ny); return q > .8 ? P.wood[2] : q < .25 ? P.plank[2] : P.plank[q < .55 ? 5 : 4]; }); for (let j = 1; j < 6; j++) s.set(x + w, y + j, P.wood[0]); }
  const gatehouse = (s) => {
    const B = 102, st = M.stone(P.stone, 10, 6, { seed: 3, b: 4 }), fc = (x, y) => dark(st(x, y), .84);
    for (const x of [4, 50]) { s.slab(x, B - 62, 18, 10, 53, st, fc, { fd: .9 }); for (let k = 0; k < 3; k++) s.slab(x + k * 7, B - 68, 5, 4, 6, st, fc); s.rect(x + 8, B - 38, 2, 9, P.ink); s.rect(x + 7, B - 35, 4, 2, P.ink); }
    s.slab(20, B - 54, 32, 10, 14, st, fc, { fd: .9 }); for (let k = 0; k < 4; k++) s.slab(21 + k * 8, B - 59, 5, 3, 5, st, fc);
    for (let j = 0; j < 31; j++) for (let i = 0; i < 28; i++) { const nx = (i - 13.5) / 14, ny = (30 - j) / 31, arch = j < 10 ? nx * nx + Math.pow((9 - j) / 10, 2) < 1 : true; if (!arch) { s.set(22 + i, B - 30 + j, fc(22 + i, B - 30 + j)); continue; } const pl = i % 5 === 4 ? 1 : 3 - (noise(i * 1.3, j * .25, 5) > .68 ? 1 : 0) + (i % 5 === 0 ? 1 : 0); s.set(22 + i, B - 30 + j, i === 13 || i === 14 ? P.ink : P.wood[pl]); }
    for (const y of [B - 22, B - 8]) { s.rect(22, y, 28, 2, P.iron[4]); s.rect(22, y, 28, 1, P.iron[6]); for (let x = 24; x < 50; x += 5) s.set(x, y + 1, P.iron[1]); }
    for (let i = 0; i < 12; i++) { const t = Math.PI * (i / 11), x = 36 - Math.cos(t) * 15.4, y = B - 21 - Math.sin(t) * 10.6; s.rect(Math.round(x) - 1, Math.round(y) - 1, 3, 2, P.stone[5 - (i & 1)]); }
    s.rect(33, B - 14, 2, 3, P.iron[6]); s.rect(37, B - 14, 2, 3, P.iron[5]);
    for (const x of [12, 58]) { s.rect(x, B - 78, 1, 12, P.wood[4]); for (let j = 0; j < 6; j++) for (let i = 1; i < 8 - j; i++) s.set(x + i, B - 77 + j, P.red[clamp(3 - (i > 4 ? 1 : 0) + (j === 0 ? 1 : 0), 0, 4)]); }
  };
  X.concept('building', 'gatehouse', { id: 'gatehouse', name: 'Gatehouse', note: 'concept for later', about: 'The stone gate tower with its portcullis and pennants. One frame. Set aside as a concept; it is not a building the game has.', step: 1, frames: () => [BK.make('gatehouse', gatehouse, { tall: 1 }, 0)] });
})();
(() => {
  const X = DBX;
  const C = { mudbrick: R('#3a2a1c #54402a #6e5638 #887048 #a08a5c #b8a474'), lime: R('#4a4840 #66635a #848074 #a29e90 #beb9aa #d6d1c2') };
  const addWall = def => { WALLS.push(def); WL[def.id] = WALLS.length - 1; return WALLS.length - 1; };
  const addFloor = def => { FLOORS.push(def); FL[def.id] = FLOORS.length - 1; return FLOORS.length - 1; };
  const branchCol = (x, seed) => { const lx = ((x % 32) + 32) % 32, w = [3, 2, 4, 3, 2, 3, 4, 2, 3, 3, 3][Math.floor(lx / 3) % 11]; return { i: Math.floor(lx / 3), p: lx % 3, grey: hash(Math.floor(x / 3), seed, 3) > .6 }; };
  X.wallKind('branch_wall', addWall({ id: 'branch', name: 'Branch Wall', h: 17, thin: 6, ramp: P.wood,
    cap: (x, y) => { const b = branchCol(x, 5); return b.p === 2 ? P.wood[0] : (b.grey ? P.woodGrey : P.wood)[b.p ? 3 : 5]; },
    face: (x, y, fy, h) => { const b = branchCol(x, 5), top = Math.floor(hash(b.i, Math.floor(x / 32), 7) * 4); if (fy < top) return null; if (b.p === 2) return fy === 6 || fy === 7 || fy === h - 5 ? P.cloth[fy === 6 ? 4 : 2] : (hash(x, fy >> 2, 9) > .5 ? P.wood[0] : null); if (fy === 6 || fy === h - 5) return P.cloth[4]; if (fy === 7 || fy === h - 4) return P.cloth[2]; const R2 = b.grey ? P.woodGrey : P.wood; return R2[clamp((b.p ? 2 : 4) - (noise(x * 1.1, fy * .22, 5) > .66 ? 1 : 0) + (fy === top ? 1 : 0), 0, 5)]; } }));
  const wv = M.weave(P.wicker, 3);
  X.wallKind('wicker_wall', addWall({ id: 'wicker', name: 'Wicker Wall', h: 16, thin: 6, ramp: P.wicker,
    cap: (x, y) => ((x & 15) < 3 ? P.wood[(x & 15) === 2 ? 2 : 4] : P.wicker[(x >> 1) & 1 ? 4 : 3]),
    face: (x, y, fy, h) => { const lx = x & 15; if (lx < 3) return P.wood[lx === 0 ? 4 : lx === 1 ? 3 : 1]; const row = fy >> 1, on = ((lx - 3) >> 2) + row & 1; return P.wicker[clamp((on ? 4 : 2) - ((lx - 3) % 4 === 3 ? 1 : 0) + ((fy & 1) ? 0 : 1) - (fy > h - 3 ? 1 : 0), 0, 4)]; } }));
  const mbCap = M.stone(C.mudbrick, 12, 7, { b: 4, seed: 11 }), mbFace = M.stone(C.mudbrick, 12, 5, { b: 3, seed: 13 });
  X.wallKind('mud_brick_wall', addWall({ id: 'mudbrick', name: 'Mud Brick Wall', h: 14, ramp: C.mudbrick, cap: mbCap,
    face: (x, y, fy, h) => { let c = dark(mbFace(x, y), .82); if (hash(x, y, 17) > .97) c = C.mudbrick[5]; return c; } }));
  X.wallKind('rebar_concrete_wall', addWall({ id: 'concrete', name: 'Reinforced Concrete Wall', h: 14, ramp: C.lime,
    cap: (x, y) => { const m = fbm(x * .07, y * .07, 31, 2), h2 = hash(x, y, 33); let k = 4 + (m > .6 ? 1 : m < .4 ? -1 : 0); if (h2 > .95) k -= 2; else if (h2 < .04) k += 1; if ((x & 15) === 8 && (y & 15) > 5 && (y & 15) < 9) return P.fireBrick[(y & 15) === 6 ? 3 : 1]; return C.lime[clamp(k, 0, 5)]; },
    face: (x, y, fy, h) => { const m = fbm(x * .07, y * .09, 35, 2), h2 = hash(x, y, 37); let k = 3 + (m > .62 ? 1 : m < .4 ? -1 : 0); if (fy % 5 === 4) k -= 1; if (h2 > .95) k -= 1; if ((x & 15) === 4 && fy % 5 === 2) return P.ink; if (noise(x * .5, fy * .15, 39) > .78 && fy > 4) return dark(C.lime[2], .8); return dark(C.lime[clamp(k, 0, 5)], .86); } }));
  const gateIdx = addWall({ id: 'branchgate', name: 'Branch Door', h: 15, thin: 4, ramp: P.wood,
    cap: (x, y) => P.wood[(x & 3) === 3 ? 1 : 4],
    face: (x, y, fy, h) => { const lx = x & 31; if (lx < 3 || lx > 28) return P.wood[lx === 0 || lx === 29 ? 5 : lx === 2 || lx === 31 ? 1 : 3]; if (fy === 2 || fy === h - 4) return P.wood[4]; if (fy === 3 || fy === h - 3) return P.wood[1]; if (Math.abs((lx - 3) - (fy - 2) * 2.6) < 1.2) return P.woodGrey[3]; const p = (lx - 3) % 4; if (p === 3) return null; if (fy < 1 + ((lx >> 2) & 1)) return null; return (((lx >> 2) & 1) ? P.woodGrey : P.wood)[clamp(p === 0 ? 4 : p === 1 ? 3 : 2, 0, 5)]; } });
  X.tile('building', 'branch_door', '0', () => { const mk = g => { const w = X.flat(5, 3, 'dirt'); for (let x = 0; x < 5; x++) w.wall[5 + x] = x === 2 ? (g ? gateIdx : 0) : WL.wicker; return w; }; return { world: mk(1), clear: mk(0), rect: [64, 32 - 15, 32, 47], oy: -15 }; }, { view: () => { const w = X.flat(3, 3, 'tall_grass'); w.wall[3] = WL.wicker; w.wall[4] = gateIdx; w.wall[5] = WL.wicker; return { world: w, rect: [0, 0, 96, 96] }; } });

  const cord = M.wood(P.wood, { pw: 5, b: 3, seed: 21 });
  X.floorKind('branch_floor', addFloor({ id: 'branch', name: 'Branch Floor', f: (x, y) => {
    const soil = P.soilRich[hash(x, y, 29) > .9 ? 1 : 0], yy = y - Math.round(1.2 * Math.sin(x * .06 + Math.floor(y / 4) * 1.7)), i = Math.floor(yy / 4), d = yy - i * 4;
    if (d === 3) return soil;
    const h = hash(i, 3, 23), L = 34 + Math.floor(h * 30), gx = (x + Math.floor(h * 97)) % L, seg = Math.floor((x + Math.floor(h * 97)) / L), sh = hash(i, seg, 31);
    if (gx === 0 || (gx === L - 1 && d === 2)) return soil;
    if ((x & 31) >= 13 && (x & 31) <= 14) return P.leather[d === 0 ? 3 : d === 1 ? 2 : 0];
    const R2 = sh > .78 ? P.woodGrey : P.wood;
    let k = [4, 3, 1][d] - (sh < .3 ? 1 : 0);
    if (hash(Math.floor(x / 4), i, 25) > .86 && d === 1) k -= 1;
    if (gx < 3 && d === 0) k -= 1;
    return R2[clamp(k, 0, 5)];
  } }));
  X.floorKind('hay_floor', addFloor({ id: 'rush', name: 'Rush Floor', f: (x, y) => { const a = noise(x * .05, y * .05, 41) * 6.283, u = x * Math.cos(a) + y * Math.sin(a), v = -x * Math.sin(a) + y * Math.cos(a); let k = 2 + (noise(u * .12, v * .9, 43) > .55 ? 1 : 0) + (noise(u * .1 + 9, v * 1.1, 45) > .7 ? 1 : 0) - (noise(u * .15, v * .8 + 5, 47) > .72 ? 1 : 0); if (hash(x, y, 49) > .97) k -= 2; return P.hay[clamp(k, 0, 4)]; } }));
  X.floorKind('clay_floor', addFloor({ id: 'clayfloor', name: 'Rammed-Clay Floor', f: (x, y) => { const m = fbm(x * .04, y * .04, 51, 2), h2 = hash(x, y, 53); let k = 3 + (m > .6 ? 1 : m < .4 ? -1 : 0); if (h2 > .97) k -= 1; if (Math.abs(noise(x * .045, y * .045, 55) - .5) < .008) k -= 2; return P.clay[clamp(k, 0, 4)]; } }));
  const mbf = M.stone(C.mudbrick, 16, 8, { b: 4, seed: 57 });
  X.floorKind('mud_brick_floor', addFloor({ id: 'mudbrickfloor', name: 'Mud-Brick Floor', f: (x, y) => mbf(x, y) }));

  const rockHt = (x, y) => { let r = 0, a = .5, f = .013, n = 0; for (let o = 0; o < 4; o++) { const v = 1 - Math.abs(2 * noise(x * f, y * f, 141 + o * 9) - 1); r += a * v * v; n += a; a *= .5; f *= 2.1; } vor(x, y, 34, 151); const hh = r / n * .62 + clamp(1 - Math.hypot(VDX, VDY) / 24, 0, 1) * .38; return hh + Math.floor(hh * 7) / 7 * .55; };
  ROOFS.mountain = (x, y, u) => { const hC = rockHt(x, y), dx = rockHt(x + 1, y) - rockHt(x - 1, y), dy = rockHt(x, y + 1) - rockHt(x, y - 1); let t = .6 + (hC - .75) * .3 + (dx * .55 + dy * .6) * 4.4 + (hash(x, y, 44) - .5) * .07; if (Math.abs(noise(x * .035, y * .035, 161) - .5) < .012) t -= .3; return rp(P.rock, t - .06, x, y, .3); };
  X.roofKind('mountain_roof', 'mountain');
})();
(() => {
  const X = DBX, BK = X.BK, { pot } = BK;
  for (const kind in BUILDS) {
    const k = BUILDS[kind], e = X.list.find(v => v.cat === 'building' && v.origin === 'mockup' && v.kind === 'sprite' && v.variant === '0' && v.make.toString().includes('mkBuild') && X.built(v) && false);
    if (!k.emit) continue;
    const id = { campfire: 'campfire', hearth: 'hearth', table: 'hewn_table', bloomery: 'bloomery', kiln: 'pottery_kiln', smelter: 'stone_forge', smoking: 'smoking_rack', charcoal: 'charcoal_pit' }[kind];
    if (!id || kind === 'table') continue;
    X.reg('building', id, 'idle', () => { const s = k.tall ? new Spr(72, 112, 36, 102) : new Spr(40, 52, 20, BY), warm = BK.cold(s); k.f(s, rng(kind.length * 7 + kind.charCodeAt(0)), 0); warm(); s.outline(); if (!k.flat) s.sh = { rx: 17, ry: 6, dx: 6, dy: 0 }; return s; }, { origin: 'new' });
  }
  const stumpI = (s, x, w, h) => { s.tube(x, BY - h + 1, w, h, (px2, py) => P.wood[3 - (noise(px2 * 1.3, py * .2, 4) > .66 ? 1 : 0)]); s.oval(x + w / 2, BY - h + 1, w / 2 + .5, 3.8, (px2, py, nx, ny) => { const q = Math.hypot(nx, ny); return P.plank[q < .2 ? 2 : (Math.floor(q * 5) & 1) ? 5 : 4]; }); };
  BK.add('chopping_block', (s, r) => {
    stumpI(s, 10, 18, 12);
    s.thick(21, BY - 17, 31, BY - 34, 2, P.wood, 4); s.set(32, BY - 35, P.wood[5]);
    for (let j = 0; j < 8; j++) { const w = 4 + Math.round(j * .55); for (let i = 0; i < w; i++) s.set(22 - i + (j < 3 ? 1 : 0), BY - 20 + j, P.iron[i === w - 1 ? 6 : j > 5 ? 5 : i < 1 ? 2 : 4]); }
    s.rect(15, BY - 12, 9, 1, P.plank[1]); s.rect(21, BY - 19, 2, 2, P.wood[2]);
    for (const [x, y, w] of [[3, BY - 2, 7], [30, BY - 1, 8], [32, BY - 5, 6]]) { s.rect(x, y, w, 2, P.plank[4]); s.rect(x, y, w, 1, P.plank[5]); s.rect(x, y + 2, w, 1, P.wood[2]); s.set(x, y + 1, P.plank[2]); }
    for (let i = 0; i < 6; i++) s.set(4 + r() * 30, BY + r() * 2, P.plank[5]);
  });
  BK.add('sawtable', (s, r) => {
    for (const x of [6, 30]) { s.thick(x - 3, BY, x + 1, BY - 16, 2, P.plank, 3); s.thick(x + 6, BY, x + 2, BY - 16, 2, P.plank, 2); s.rect(x - 1, BY - 8, 6, 1, P.plank[2]); }
    s.rect(4, BY - 17, 32, 2, P.plank[4]); s.rect(4, BY - 15, 32, 1, P.plank[1]);
    for (let j = 0; j < 7; j++) for (let i = 0; i < 33; i++) s.set(3 + i, BY - 24 + j, P.wood[clamp([4, 5, 4, 3, 2, 1, 0][j] - (noise(i * .22 + 14, j * 1.3, 2) > .68 ? 1 : 0), 0, 5)]);
    s.oval(4.5, BY - 20.5, 2.6, 3.5, (px2, py, nx, ny) => { const q = Math.hypot(nx, ny); return q > .8 ? P.wood[2] : q < .25 ? P.plank[2] : P.plank[q < .55 ? 5 : 4]; });
    for (let i = 0; i < 24; i++) { const y = BY - 32 + Math.round(i * .25); s.set(8 + i, y, P.iron[6]); s.set(8 + i, y + 1, P.iron[4]); s.set(8 + i, y + 2, P.iron[i & 1 ? 5 : 1]); }
    for (const [x, y] of [[5, BY - 38], [31, BY - 32]]) { s.rect(x, y, 3, 9, P.wood[3]); s.rect(x, y, 1, 9, P.wood[5]); s.rect(x - 1, y, 5, 2, P.wood[4]); s.rect(x - 1, y, 5, 1, P.wood[5]); }
    s.line(20, BY - 24, 20, BY - 18, P.plank[1]);
    for (let i = 0; i < 10; i++) { const x = 8 + r() * 24, y = BY - r() * 3; s.set(x, y, P.plank[5]); s.set(x + 1, y, P.plank[4]); }
  });
  BK.add('flensing_table', (s, r, fr, st) => {
    const y0 = table2(s, 4, 32, 13, 9, WP(7, 'h', 4), P.plank);
    for (let i = 0; i < 20; i++) s.set(6 + hash(i, 1, 5) * 26, y0 + 2 + hash(i, 2, 5) * 9, P.red[hash(i, 3, 5) > .5 ? 1 : 2]);
    if (st !== 'empty') { s.oval(12, y0 + 6, 6, 3.6, (x, y, nx, ny) => Math.hypot(nx, ny) > .7 ? P.cloth[5] : P.red[nx < 0 ? 3 : 2]); s.oval(12, y0 + 6, 1.6, 1.2, () => P.bone[5]); }
    s.rect(19, y0 + 3, 9, 6, P.iron[4]); s.rect(19, y0 + 3, 9, 1, P.iron[5]); s.rect(19, y0 + 8, 9, 1, P.iron[6]); s.set(20, y0 + 4, P.ink); s.rect(28, y0 + 4, 6, 2, P.wood[3]); s.rect(28, y0 + 4, 6, 1, P.wood[5]);
    for (const x of [9, 17, 25]) { s.rect(x, BY - 9, 1, 3, P.iron[5]); s.set(x + 1, BY - 6, P.iron[5]); s.set(x + 1, BY - 7, P.iron[3]); }
    if (st !== 'empty') s.rect(14, BY - 1, 5, 2, P.red[1]);
  }, { states: ['empty'] });
  BK.add('anvil', (s) => {
    stumpI(s, 11, 18, 11);
    s.rect(13, BY - 13, 14, 3, P.iron[2]); s.rect(13, BY - 13, 14, 1, P.iron[4]); s.rect(15, BY - 17, 10, 4, P.iron[3]); s.rect(15, BY - 17, 2, 4, P.iron[4]); s.rect(23, BY - 17, 2, 4, P.iron[1]);
    s.rect(8, BY - 22, 22, 2, P.iron[6]); s.rect(8, BY - 20, 22, 3, P.iron[4]); s.rect(8, BY - 17, 22, 1, P.iron[2]); s.rect(8, BY - 22, 1, 5, P.iron[5]);
    for (let i = 0; i < 7; i++) { s.rect(30 + i, BY - 22 + (i > 3 ? 1 : 0), 1, Math.max(1, 4 - (i >> 1)), P.iron[i < 3 ? 5 : 4]); s.set(30 + i, BY - 22 + (i > 3 ? 1 : 0), P.iron[6]); }
    s.rect(11, BY - 21, 2, 1, P.ink);
    s.rect(2, BY + 3, 13, 2, P.wood[3]); s.rect(2, BY + 3, 13, 1, P.wood[5]); s.rect(14, BY + 1, 5, 6, P.iron[4]); s.rect(14, BY + 1, 5, 1, P.iron[6]); s.rect(18, BY + 1, 1, 6, P.iron[2]);
    s.line(26, BY + 5, 37, BY + 1, P.iron[5]); s.line(26, BY + 3, 37, BY + 4, P.iron[3]); s.set(31, BY + 3, P.iron[6]);
  });
  BK.add('drying_rack', (s, r, fr, st) => {
    for (const x of [4, 33]) { s.rect(x, BY - 32, 3, 33, P.wood[x < 20 ? 3 : 2]); s.rect(x, BY - 32, 1, 33, P.wood[5]); }
    s.tube(3, BY - 33, 34, 3, () => P.wood[4]);
    for (const x of [4, 33]) for (let i = 0; i < 3; i++) s.set(x + i, BY - 34 + (i & 1), P.cloth[4]);
    for (const y of [BY - 26, BY - 14]) for (let x = 7; x < 33; x++) s.set(x, y + (Math.abs(x - 20) < 9 ? 1 : 0), P.cloth[x % 3 ? 4 : 2]);
    if (st === 'empty') return;
    for (const [x, len] of [[9, 9], [13, 7], [17, 10], [22, 8], [26, 9], [30, 6]]) { s.set(x, BY - 25, P.cloth[5]); for (let j = 0; j < len; j++) { s.set(x, BY - 24 + j, P.red[j < 2 ? 3 : j > len - 3 ? 1 : 2]); if (j > 0 && j < len - 2) s.set(x + 1, BY - 24 + j, P.red[1]); } }
    for (const x of [10, 17]) { s.set(x + 1, BY - 13, P.cloth[5]); for (let j = 0; j < 8; j++) { const w = j < 1 ? 1 : j < 6 ? 2 : 1; for (let i = 0; i < w + 1; i++) s.set(x + i + (j < 1 ? 1 : 0), BY - 12 + j, P.furGrey[i === 0 ? 5 : j % 3 === 0 ? 3 : 4]); } s.set(x, BY - 12, P.furGrey[2]); s.set(x + 2, BY - 12, P.furGrey[2]); s.set(x + 1, BY - 5, P.ink); }
    for (const x of [24, 29]) { s.rect(x, BY - 13, 2, 2, P.wicker[3]); for (let j = 0; j < 7; j++) for (let i = -1 - (j >> 2); i <= 2 + (j >> 2); i++) s.set(x + i, BY - 11 + j, P.ash[clamp(4 - (i > 1 ? 1 : 0) - (j % 3 === 2 ? 1 : 0), 0, 5)]); }
  }, { states: ['empty'] });

  const flipped = f => (s, r, fr, st) => { f(s, r, fr, st); s.outline(); const o = s.flip(); o.done = 1; return o; };
  const faces = (id, draw, o) => {
    o = o || {}; X.drop('building', id);
    const order = o.order || ['s', 'e', 'n', 'w'];
    for (const d of order) X.reg('building', id, d, () => BK.make(id, d === 'w' ? flipped((s, r, fr) => draw(s, 'e', r)) : (s, r) => draw(s, d, r), o, 0));
  };
  const chairF = (seatTex, backTex, o) => (s, d) => {
    o = o || {}; const x = 10, w = 20, bh = o.back || 16, leg = (lx, ly) => { s.rect(lx, ly, 2, BY - ly + 1, P.plank[2]); s.rect(lx, ly, 1, BY - ly + 1, P.plank[4]); };
    if (d === 's') {
      s.fill(x, BY - 14 - bh, w, bh + 2, backTex); s.rect(x, BY - 14 - bh, w, 1, P.plank[5]); s.rect(x, BY - 14 - bh, 1, bh, P.plank[4]); s.rect(x + w - 1, BY - 14 - bh, 1, bh, P.plank[1]);
      leg(x, BY - 6); leg(x + w - 2, BY - 6);
      s.slab(x - 1, BY - 14, w + 2, 6, 3, seatTex, seatTex);
      if (o.cushion) { s.ball(20, BY - 15, 9, 3.4, 4, o.cushion, { d: .2, bias: .08 }); s.rect(11, BY - 12, 18, 1, o.cushion[1]); }
      if (o.arms) for (const ax of [x - 5, x + w]) s.slab(ax, BY - 20, 5, 5, 16, o.arms[0], o.arms[1]);
      if (o.tacks) for (let tx = x; tx < x + w + 1; tx += 3) s.set(tx, BY - 9, o.tacks);
    } else if (d === 'n') {
      leg(x, BY - 6); leg(x + w - 2, BY - 6);
      if (o.arms) for (const ax of [x - 5, x + w]) s.slab(ax, BY - 20, 5, 5, 16, o.arms[0], o.arms[1]);
      s.fill(x, BY - 8 - bh - 6, w, bh + 6, o.rear || backTex); s.rect(x, BY - 8 - bh - 6, w, 1, P.plank[5]); s.rect(x, BY - 8 - bh - 6, 1, bh + 6, P.plank[4]); s.rect(x + w - 1, BY - 8 - bh - 6, 1, bh + 6, P.plank[1]); s.rect(x, BY - 9, w, 2, P.plank[1]);
      if (!o.rear) for (const ry of [BY - 22, BY - 14]) s.rect(x + 1, ry, w - 2, 1, P.plank[1]);
    } else {
      const sx = 12, sw = 16;
      leg(sx + 1, BY - 6); leg(sx + sw - 3, BY - 6);
      s.slab(sx, BY - 14, sw, 6, 3, seatTex, seatTex);
      if (o.cushion) { s.ball(sx + sw / 2 + 1, BY - 15, sw / 2 - 1, 3.2, 4, o.cushion, { d: .2, bias: .08 }); }
      s.slab(sx - 1, BY - 8 - 6 - bh, 4, 6, bh, o.rear || backTex, o.rear || backTex);
      if (o.arms) s.slab(sx + 2, BY - 20, sw - 2, 4, 15, o.arms[0], o.arms[1]);
      if (o.tacks) for (let tx = sx; tx < sx + sw; tx += 3) s.set(tx, BY - 9, o.tacks);
    }
  };
  const GREEN = P.green, RED = P.red, FLEECE = P.cloth, wv = M.weave(P.wicker, 3);
  faces('cushioned_chair', chairF(M.cloth(GREEN, 3, 3), WP(3, 'v', 3), { cushion: GREEN }));
  faces('tacked_chair', chairF(M.cloth(FLEECE, 4, 3), WP(5, 'v', 3), { back: 17, tacks: P.copper[5] }));
  faces('wicker_chair', chairF(wv, wv, { back: 15, cushion: FLEECE, rear: wv }));
  faces('armchair', chairF(M.cloth(RED, 3, 5), M.cloth(RED, 2, 3), { back: 18, cushion: RED, arms: [WP(2, 'v', 4), WP(3, 'v', 3)], rear: M.cloth(RED, 1, 3) }));
  const tableF = (top, legR, stuff) => (s, d) => {
    if (d === 's' || d === 'n') { const y0 = table2(s, 4, 32, 14, 9, top('h'), legR); stuff(s, 4, y0, 32, 14, d); }
    else { const y0 = table2(s, 11, 18, 28, 9, top('v'), legR); stuff(s, 11, y0, 18, 28, d); }
  };
  faces('wooden_table', tableF(dir => WP(5, dir === 'h' ? 'v' : 'h', 4), P.plank, (s, x, y0, w, d2) => {
    for (const [nx, ny] of [[x + 1, y0 + 1], [x + w - 2, y0 + 1], [x + 1, y0 + d2 - 2], [x + w - 2, y0 + d2 - 2]]) s.set(nx, ny, P.iron[6]);
    const cx = x + w / 2, cy = y0 + d2 / 2;
    s.oval(cx - (w > 20 ? 7 : 0), cy - (w > 20 ? 0 : 6), 4.6, 2.6, (px2, py, nx, ny) => P.plank[nx * nx + ny * ny < .4 ? 2 : 5]); s.oval(cx - (w > 20 ? 7 : 0), cy - (w > 20 ? 0 : 6) - .4, 2.4, 1.2, () => P.red[3]);
    pot(s, cx + (w > 20 ? 7 : 1), cy + (w > 20 ? 2 : 8), 2.8, P.clay, P.deep[3]);
  }), { order: ['s', 'e'] });
  faces('hewn_table', tableF(dir => WD(2, dir, 4), P.wood, (s, x, y0, w, d2) => {
    const cx = x + w / 2, cy = y0 + d2 / 2;
    s.oval(cx - (w > 20 ? 6 : 1), cy - (w > 20 ? 1 : 7), 5, 3, (px2, py, nx, ny) => P.cloth[nx * nx + ny * ny < .45 ? 3 : 5]); s.oval(cx - (w > 20 ? 6 : 1), cy - (w > 20 ? 1 : 7) - .4, 2.6, 1.4, () => P.furTan[2]);
    s.tube(Math.round(cx + (w > 20 ? 4 : -2)), Math.round(cy + (w > 20 ? -1 : 4)), 4, 5, () => P.copper[3]);
    for (const lx of [x + 1, x + w - 3]) for (let i = 0; i < 3; i++) s.set(lx + i, y0 + d2 + 1 + (i & 1), P.cloth[4]);
  }), { order: ['s', 'e'] });
  faces('padded_bench', (s, d) => {
    const pad = M.cloth(FLEECE, 4, 3), pad2 = M.cloth(FLEECE, 3, 5);
    if (d === 'e') { for (const lx of [14, 24]) { s.rect(lx, BY - 6, 2, 7, P.plank[2]); s.rect(lx, BY - 6, 1, 7, P.plank[4]); } s.slab(12, BY - 39, 16, 31, 3, WP(3, 'v', 4), WP(4, 'h', 3)); s.slab(13, BY - 40, 14, 29, 2, pad, pad2); for (let y = BY - 34; y < BY - 12; y += 6) s.set(20, y, P.cloth[1]); return; }
    for (const lx of [4, 34]) { s.rect(lx, BY - 7, 2, 8, P.plank[2]); s.rect(lx, BY - 7, 1, 8, P.plank[4]); } s.rect(6, BY - 3, 28, 1, P.plank[1]);
    s.slab(2, BY - 14, 36, 6, 3, WP(3, 'h', 4), WP(4, 'h', 3)); s.slab(4, BY - 16, 32, 5, 2, pad, pad2); for (let x = 8; x < 34; x += 6) s.set(x, BY - 13, P.cloth[1]);
  }, { order: ['s', 'e'] });
  const COUCH = R('#3a2440 #54365a #724c76 #906892 #ae88ae');
  faces('couch', (s, d) => {
    const up = M.cloth(COUCH, 2, 3);
    if (d === 'e') {
      s.slab(8, 4, 6, 38, 12, M.cloth(COUCH, 2, 3), M.cloth(COUCH, 1, 5));
      for (let i = 0; i < 3; i++) s.slab(13, 12 + i * 12, 15, 11, 4, M.cloth(COUCH, 3, 5 + i), M.cloth(COUCH, 2, 7));
      s.slab(8, 6, 21, 4, 12, WP(2, 'h', 4), WP(3, 'h', 3)); s.slab(8, 44, 21, 4, 8, WP(2, 'h', 4), WP(3, 'h', 3));
      return;
    }
    if (d === 'n') { s.fill(3, BY - 28, 50, 24, M.cloth(COUCH, 1, 3)); s.rect(3, BY - 28, 50, 1, COUCH[3]); s.rect(3, BY - 28, 1, 24, COUCH[2]); s.rect(52, BY - 28, 1, 24, COUCH[0]); for (const x of [19, 36]) s.rect(x, BY - 27, 1, 22, COUCH[0]); for (const x of [0, 51]) s.slab(x, BY - 20, 5, 6, 15, WP(2, 'v', 4), WP(3, 'v', 3)); for (const x of [4, 50]) s.rect(x, BY - 4, 2, 5, P.plank[1]); return; }
    s.fill(3, BY - 28, 50, 16, up); s.rect(3, BY - 28, 50, 1, COUCH[4]); s.rect(3, BY - 28, 1, 16, COUCH[3]); s.rect(52, BY - 28, 1, 16, COUCH[0]);
    for (const x of [19, 36]) s.rect(x, BY - 27, 1, 14, COUCH[0]);
    for (let i = 0; i < 3; i++) { s.slab(5 + i * 16, BY - 14, 15, 7, 5, M.cloth(COUCH, 3, 5 + i), M.cloth(COUCH, 2, 7)); s.set(12 + i * 16, BY - 22, P.gold[3]); }
    for (const x of [0, 51]) s.slab(x, BY - 20, 5, 6, 15, WP(2, 'v', 4), WP(3, 'v', 3));
    for (const x of [2, 52]) s.rect(x, BY, 2, 2, P.plank[1]);
  }, { canvas: [56, 60, 28, 48], wide: 1 });
})();
(() => {
  const X = DBX, BK = X.BK;
  const C = { tick: R('#5a5446 #7a7462 #9c9680 #beb8a0 #dcd6c0 #f0ecdc'), quilt: P.red, wool: P.blue, lea: P.leather, sheet: P.snow, fur: P.furTan, furG: P.furGrey };
  const K = (r, k) => r[clamp(k, 0, r.length - 1)];
  const STYLES = {
    hay: { frame: P.wood, rough: 1, hay: 1, pillow: null, blanket: (u, v) => K(P.wicker, 2 + ((((u >> 1) + (v >> 1)) & 1) ? 1 : 0) - ((u & 1) && (v & 1) ? 1 : 0)), from: 20 },
    hide: { frame: P.wood, rough: 1, hay: 1, pillow: C.furG, furPillow: 1, blanket: (u, v) => K(C.fur, 3 + (noise(v * .9, u * .35, 5) > .62 ? 1 : 0) - (noise(v * .8 + 9, u * .3, 8) > .66 ? 1 : 0)), ragged: 1, from: 13 },
    wool: { frame: P.plank, pillow: P.cloth, sheet: (u, v) => K(C.tick, v % 4 === 0 ? 2 : 4), blanket: (u, v) => K(C.wool, (u % 9 < 2 ? 4 : 2) + (v % 2 ? 0 : 0) - ((u + v) % 7 === 0 ? 1 : 0)), fringe: P.cloth, from: 14 },
    leather: { frame: P.plank, posts: 1, pillow: P.cloth, pillowTrim: C.lea, sheet: (u, v) => K(P.cloth, 4), blanket: (u, v) => K(C.lea, 3 - ((u + v) % 6 === 0 || (u - v + 60) % 6 === 0 ? 2 : 0) + ((u + v) % 6 === 1 ? 1 : 0)), studs: P.gold[4], from: 14 },
    feather: { frame: P.plank, posts: 1, gilt: 1, pillow: P.snow, plump: 1, sheet: (u, v) => K(P.snow, 3), blanket: (u, v, L, W) => { const du = Math.abs(u - (14 + (L - 16) / 2)), dv = Math.abs(v - W / 2); return du + dv < 6 ? K(P.gold, du + dv < 2 ? 4 : du + dv > 4.6 ? 2 : 3) : K(C.quilt, 3 - ((u + v) % 7 === 0 || (u - v + 70) % 7 === 0 ? 1 : 0)); }, fringe: P.gold, from: 14 },
  };
  const bed = (styleId, W, d, o) => () => {
    o = o || {}; const st = STYLES[styleId], L = o.L || 38, horiz = d === 'e' || d === 'w', fw = horiz ? L : W, fh = horiz ? W : L, X0 = 5, Y0 = 12, s = new Spr(fw + 10, fh + 22, X0 + (fw >> 1), Y0 + fh + 1);
    const pillows = W > 30 ? [W * .27, W * .73] : [W / 2], pr = W > 30 ? W * .2 : W * .34, F = st.frame, hgt = new Float32Array(s.w * s.h), from = st.from;
    const part = (u, v) => {
      if (st.posts && (u < 3 || u >= L - 3) && (v < 3 || v >= W - 3)) return [10, K(F, 5)];
      if (u < 3) return [st.rough ? 5 : 8, st.gilt && u === 1 && v % 4 === 1 ? P.gold[4] : K(F, st.rough ? 3 - (v % 5 === 0 ? 2 : 0) : 4 - (v % 6 === 0 ? 2 : 0))];
      if (u >= L - 2) return [5, K(F, 3 - (v % 6 === 0 ? 2 : 0))];
      if (v < 2 || v >= W - 2) return [4.5, K(F, st.rough && u % 7 === 0 ? 1 : 3)];
      if (st.pillow) for (const pv of pillows) { const q = Math.pow((u - 8) / (st.plump ? 4.4 : 3.8), 2) + Math.pow((v - pv) / pr, 2); if (q < 1) return [7 + (1 - q), st.furPillow ? K(st.pillow, 3 + (noise(v, u * .5, 3) > .6 ? 1 : 0)) : st.pillowTrim && q > .72 ? K(st.pillowTrim, 3) : K(st.pillow, q < .35 ? 5 : q < .7 ? 4 : 3)]; }
      if (u >= from) { if (st.ragged && u < from + 2 && hash(v, u, 7) > .5) return [5, st.hay ? K(P.hay, 3) : K(P.cloth, 4)]; if (u < from + 3 && !st.hay) return [6.5, K(P.cloth, u === from ? 5 : 4)]; if (st.studs && u % 6 === 2 && v % 6 === 2) return [6, st.studs]; if (st.fringe && u === L - 3) return [6, K(st.fringe, v & 1 ? 4 : 2)]; return [6, st.blanket(u, v, L, W)]; }
      if (st.hay) return [5 + noise(u * .5, v * .5, 3), K(P.hay, 2 + (noise(v * .9, u * .4, 3) > .55 ? 1 : 0) - (noise(v * .7 + 5, u * .5, 5) > .65 ? 1 : 0) + (hash(u, v, 9) > .9 ? 1 : 0))];
      return [5, st.sheet(u, v)];
    };
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) { const uv = d === 'n' ? [y, x] : d === 's' ? [L - 1 - y, W - 1 - x] : d === 'e' ? [x, y] : [L - 1 - x, W - 1 - y], p = part(uv[0], uv[1]); hgt[(Y0 + y) * s.w + X0 + x] = p[0]; s.set(X0 + x, Y0 + y, p[1]); }
    const H = (x, y) => hgt[y * s.w + x] || 0;
    for (let y = Y0; y < Y0 + fh; y++) for (let x = X0; x < X0 + fw; x++) { const h = H(x, y); let c = s.get(x, y), k = 1; if (H(x, y - 1) < h - .4) k *= 1.16; else if (H(x, y - 1) > h + .4) k *= .78; if (H(x, y + 1) < h - .4) k *= .8; if (H(x - 1, y) < h - .4) k *= 1.08; else if (H(x - 1, y) > h + .4) k *= .86; if (H(x + 1, y) < h - .4) k *= .86; s.set(x, y, k > 1 ? lit(c, k) : k < 1 ? dark(c, k) : c); }
    for (let x = X0; x < X0 + fw; x++) for (let j = 0; j < 4; j++) s.set(x, Y0 + fh + j, dark(K(F, 3 - (x % 6 === 0 ? 1 : 0)), j === 0 ? .9 : j === 3 ? .5 : .7));
    for (const lx of [X0, X0 + fw - 2]) s.rect(lx, Y0 + fh + 4, 2, 2, K(F, 1));
    const board = (x, y, w, h2, tall) => { for (let j = 0; j < tall; j++) for (let i = 0; i < w; i++) s.set(x + i, y - tall + j, lit(K(F, 4 - (st.rough && i % 5 === 0 ? 2 : i % 7 === 0 ? 1 : 0)), j === 0 ? 1.2 : 1)); if (st.gilt) for (let i = 2; i < w - 2; i += 4) s.set(x + i, y - tall + 2, P.gold[4]); };
    const tall = st.rough ? 3 : o.king ? 9 : 6;
    if (d === 'n') board(X0, Y0 + 1, fw, 0, tall); else if (d === 's') board(X0, Y0 + fh + 1, fw, 0, tall + 3); else { const hx = d === 'e' ? X0 : X0 + fw - 3; s.slab(hx, Y0 - tall, 3, fh, tall, (x, y) => K(F, 4), (x, y) => K(F, 3)); }
    if (st.posts) for (const [px, py] of [[X0, Y0], [X0 + fw - 3, Y0], [X0, Y0 + fh - 3], [X0 + fw - 3, Y0 + fh - 3]]) { s.slab(px, py - (o.king ? 9 : 5), 3, 3, o.king ? 9 : 5, () => K(F, 5), () => K(F, 3)); if (st.gilt) s.set(px + 1, py - (o.king ? 9 : 5), P.gold[4]); }
    if (st.hay) { const cu = 24; for (let t = 0; t < W; t++) { const p2 = d === 'n' ? [X0 + t, Y0 + cu] : d === 's' ? [X0 + t, Y0 + L - 1 - cu] : d === 'e' ? [X0 + cu, Y0 + t] : [X0 + L - 1 - cu, Y0 + t]; if (styleId === 'hay') s.set(p2[0], p2[1], P.cloth[t & 1 ? 4 : 2]); } }
    s.outline(); s.done = 1; s.sh = { rx: fw * .5, ry: 5, dx: 4, dy: 0, k: .8 };
    return s;
  };
  const BEDS = [['sleeping_spot', null], ['hay_bed', 'hay'], ['hide_bed', 'hide'], ['wool_tick_bed', 'wool'], ['leather_bed', 'leather'], ['feather_bed', 'feather']];
  for (const [id, st] of BEDS) {
    if (!st) continue;
    X.drop('building', id);
    for (const d of ['n', 'e', 's', 'w']) X.reg('building', id, d, bed(st, 24, d));
    const name = { hay: 'Double Hay Bed', hide: 'Double Hide Bed', wool: 'Double Wool-Tick Bed', leather: 'Double Leather Bed', feather: 'Double Feather Bed' }[st];
    for (const d of ['n', 'e', 's', 'w']) X.reg('building', '_double_' + id, d, bed(st, 46, d), { extra: name + ' (concept)' });
  }
  for (const d of ['n', 'e', 's', 'w']) X.reg('building', '_king_feather_bed', d, bed('feather', 58, d, { king: 1, L: 42 }), { extra: 'King Feather Bed (concept)' });
})();
