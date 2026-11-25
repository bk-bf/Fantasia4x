'use strict';
const PROPS = (() => {
  const B = 54, CX = 24, HIGH = 64;
  const at = (r, k) => r[clamp(Math.round(k), 0, r.length - 1)];
  const hi = (r, d) => at(r, r.length - 1 - (d || 0));
  const RAMPS = new Map();
  function rampOf(colour) {
    if (RAMPS.has(colour)) return RAMPS.get(colour);
    const c = hex(colour), r = [.3, .46, .64, .82, 1, 1.2].map((k, i) => [clamp(Math.round(c[0] * k - (i < 2 ? 5 : 0)), 0, 255), clamp(Math.round(c[1] * k), 0, 255), clamp(Math.round(c[2] * k + (i < 2 ? 12 : 0)), 0, 255)]);
    RAMPS.set(colour, r);
    return r;
  }
  const six = r => [0, 1, 2, 3, 4, 5].map(i => r[Math.round(i * (r.length - 1) / 5)]);
  const MIXED = new Map();
  function mixed(base, colour, amount) {
    const key = base[0].join() + colour + amount;
    if (MIXED.has(key)) return MIXED.get(key);
    const t = rampOf(colour), r = six(base).map((c, i) => c.map((v, j) => Math.round(mix(v, t[i][j], amount))));
    MIXED.set(key, r);
    return r;
  }
  const trim = s => { for (let y = B + 1; y < s.h; y++) for (let x = 0; x < s.w; x++) s.c[y * s.w + x] = null; };

  function log(s, x, y, w, sd, bark, end) {
    for (let j = 0; j < 7; j++) for (let i = 0; i < w; i++) s.set(x + i, y + j, at(bark, [4, 5, 4, 3, 2, 1, 0][j] - (noise(i * .22 + sd * 7, j * 1.3, sd) > .68 ? 1 : 0)));
    s.oval(x + 1.5, y + 3.5, 2.6, 3.5, (px, py, nx, ny) => { const q = Math.hypot(nx, ny); return q > .8 ? at(bark, 2) : q < .25 ? at(end, 2) : at(end, q < .55 ? 5 : 4); });
    for (let j = 1; j < 6; j++) s.set(x + w, y + j, at(bark, 0));
    s.rect(x + 7 + (sd * 5) % Math.max(1, w - 14), y + 2, 2, 1, at(bark, 1));
  }
  const LOG_ROWS = [[[-13, 10, 26], [-15, 6, 29]], [[-15, 12, 29], [-17, 6, 31], [-13, 17, 27]], [[-15, 18, 29], [-17, 12, 31], [-14, 6, 29], [-14, 23, 28], [-16, 17, 30], [-13, 28, 26]]];
  function logs(s, cx, st, r, o) {
    const grow = o.left ? 3 : 0, tall = st === 2 ? 21 : 13;
    if (st > 0) for (const [x, on] of [[cx - 14, !o.left], [cx + 13, !o.right]]) if (on) { s.rect(x, B - tall + 1, 2, tall, at(r.a, 2)); s.rect(x, B - tall + 1, 1, tall, at(r.a, 4)); }
    LOG_ROWS[st].forEach(([dx, up, w], i) => log(s, cx + dx - grow, B - up, w + grow + (o.right ? 3 : 0), i + 1 + o.seed % 5, r.a, r.b));
  }

  function planks(s, cx, st, r, o) {
    const top = M.wood(r.a, { pw: 4, seed: o.seed, b: 3 }), front = M.flat(r.a, 2, o.seed + 1, .04), x = cx - 15 - (o.left ? 2 : 0), w = 30 + (o.left ? 2 : 0) + (o.right ? 2 : 0);
    if (st === 0) { s.slab(x + 4, B - 8, w - 7, 4, 2, top, front); s.slab(x, B - 5, w - 2, 4, 2, top, front); return; }
    const n = st === 1 ? 3 : 6;
    for (let i = 0; i < n; i++) s.slab(x + Math.floor(hash(i, o.seed, 3) * 3) - 1, B - i * 3 - 10, w, 8, 3, top, front);
  }

  const BLOCKS = [[[-8, 12, 16, 6]], [[-17, 12, 16, 6], [1, 11, 15, 5]], [[-17, 12, 16, 6], [1, 11, 15, 5], [-10, 24, 18, 6]]];
  function blocks(s, cx, st, r) {
    const a = M.flat(r.a, 4, 3), b = M.flat(r.a, 3, 5);
    for (const [dx, up, w, d] of BLOCKS[st]) s.slab(cx + dx, B - up, w, d, 7, a, b);
    if (st > 0) s.line(cx - 14, B - 4, cx - 10, B - 2, at(r.a, 1));
  }

  const ROCKS = [
    [[-6, 4, 5, 4], [5, 3.4, 4.4, 3.4], [0, 2.4, 2.8, 2.2]],
    [[-9, 4.4, 6, 4.4], [8, 4, 5.6, 4], [-1, 5, 6.4, 4.6], [1, 11, 6, 4.6], [-13, 2, 2.6, 2], [13, 2, 2.4, 1.8]],
    [[-11, 5, 7, 5], [10, 4.6, 6.6, 4.6], [0, 5.4, 7.6, 5.2], [-6, 12, 7, 5], [6, 12, 6.6, 4.8], [0, 18.5, 6.6, 4.8], [-15, 2, 2.6, 2], [15, 2, 2.4, 1.8], [1, 23.5, 3.4, 2.6]]
  ];
  function rubble(s, cx, st, r, o) {
    ROCKS[st].forEach(([dx, up, rx, ry], i) => s.ball(cx + dx, B - up, rx, ry, 30 - up, r.a, { facet: 4, seed: o.seed + i, d: .3, amp: 1.1 }));
    if (!r.speck) return;
    for (let y = B - 28; y <= B; y++) for (let x = cx - 18; x <= cx + 18; x++) if (s.get(x, y) && noise(x * .45, y * .45, o.seed + 9) > .7 && hash(x, y, 5) > .35) s.set(x, y, at(r.b, hash(x, y, 2) > .6 ? 5 : 3));
  }

  const LUMPS = [
    [[-5, 3, 3.6, 3], [4, 2.6, 3.4, 2.8], [0, 6.4, 3.4, 2.8], [-9, 1.6, 2, 1.6]],
    [[-9, 3, 3.8, 3], [-2, 3.2, 4, 3.2], [6, 2.8, 3.8, 3], [-6, 8, 3.8, 3], [2, 8.4, 4, 3.2], [-2, 13, 3.6, 2.8], [12, 1.6, 2, 1.6], [-14, 1.6, 2, 1.6]],
    [[-12, 3, 4, 3.2], [-4, 3.4, 4.2, 3.4], [4, 3.2, 4, 3.2], [12, 2.8, 3.8, 3], [-8, 8.6, 4, 3.2], [0, 9, 4.2, 3.4], [8, 8.4, 4, 3.2], [-4, 14, 4, 3.2], [4, 14, 3.8, 3], [0, 19, 3.6, 2.8], [-17, 1.6, 2, 1.6], [17, 1.6, 2, 1.6]]
  ];
  function lumps(s, cx, st, r, o) {
    LUMPS[st].forEach(([dx, up, rx, ry], i) => s.ball(cx + dx, B - up, rx, ry, 30 - up, r.a, { facet: 3, seed: o.seed + i, d: .3, amp: 1.25 }));
    for (let y = B - 24; y <= B; y++) for (let x = cx - 20; x <= cx + 20; x++) if (s.get(x, y) && s.get(x, y - 1) && hash(x, y, o.seed + 3) > .93) s.set(x, y, hi(r.a));
  }

  const HEAPS = [[8, 5], [12, 8], [15, 12]];
  function heap(s, cx, st, r, o) {
    if (r.lumps) return lumps(s, cx, st, r, o);
    const [rx, ry] = HEAPS[st];
    s.ball(cx, B, rx, ry, 0, r.a, { n: .34, ns: .6, seed: o.seed, d: .5 });
    s.ball(cx + rx * .5, B, rx * .55, ry * .45, 4, r.a, { n: .3, ns: .7, seed: o.seed + 1, d: .5 });
    trim(s);
  }

  function bar(s, x, y, c) {
    const n = c.length - 1;
    s.rect(x + 1, y, 10, 2, c[n]); s.rect(x, y + 2, 12, 3, c[n - 2]); s.rect(x, y + 2, 12, 1, c[n - 1]); s.rect(x + 11, y + 2, 1, 3, c[1]); s.rect(x, y + 4, 12, 1, c[1]); s.set(x + 2, y, lit(c[n], 1.18));
  }
  const BARS = [[[-13, 4], [1, 4]], [[-14, 4], [-1, 4], [-8, 9]], [[-16, 4], [-3, 4], [4, 9], [-9, 9], [-3, 14], [-16, 14]]];
  function bars(s, cx, st, r) {
    for (const [dx, up] of BARS[st]) bar(s, cx + dx, B - up, r.a);
  }

  function sack(s, x, y, rr, z, mark) {
    const c = P.cloth;
    s.ball(x, y, rr, rr * .98, z, c, { n: .22, ns: .5, d: .15, bias: -.04 });
    s.rect(x - 2, y - rr - 2, 4, 3, c[4]); s.rect(x - 2, y - rr + 1, 4, 1, P.leather[3]); s.set(x - 3, y - rr - 3, c[5]); s.set(x + 2, y - rr - 3, c[3]);
    for (let j = -4; j < 5; j += 2) s.set(x + 3, y + j, c[1]);
    s.rect(x - 5, y, 3, 3, at(mark, 3)); s.rect(x - 5, y, 3, 1, at(mark, 5)); s.set(x - 3, y + 2, at(mark, 1));
  }
  const SACKS = [[[0, 8, 8.6, 0]], [[-9, 8, 8.6, 0], [8, 7, 8, 0]], [[-9, 8, 8.6, 0], [8, 7, 8, 0], [-1, 21, 8, 2]]];
  function sacks(s, cx, st, r) {
    for (const [dx, up, rr, z] of SACKS[st]) sack(s, cx + dx, B - up, rr, z, r.a);
    trim(s);
    s.set(cx - 3, B, at(r.a, 5)); s.set(cx - 1, B, at(r.a, 4)); s.set(cx + 2, B - 1, at(r.a, 5));
  }

  function crate(s, x, base, w, d, h, sd, mark) {
    const y0 = base + 1 - h - d;
    s.slab(x, y0, w, d, h, WP(4 + sd, 'v', 4), WP(6 + sd, 'h', 3), { fd: .84 });
    s.rect(x, y0 + d, w, 2, P.plank[4]); s.rect(x, base - 1, w, 2, P.plank[1]); s.rect(x, y0 + d, 3, h + 1, P.plank[4]); s.rect(x + w - 3, y0 + d, 3, h + 1, P.plank[1]);
    for (let i = 0; i < w - 6; i++) s.set(x + 3 + i, y0 + d + 2 + Math.round(i * (h - 4) / (w - 6)), P.plank[1]);
    for (const [px, py] of [[x + 1, y0 + d + 1], [x + w - 2, y0 + d + 1], [x + 1, base - 1], [x + w - 2, base - 1]]) s.set(px, py, P.iron[5]);
    s.rect(x + (w >> 1) - 2, y0 + d + (h >> 1) - 1, 4, 3, at(mark, 3)); s.rect(x + (w >> 1) - 2, y0 + d + (h >> 1) - 1, 4, 1, at(mark, 5));
  }
  function crates(s, cx, st, r, o) {
    if (st === 0) return crate(s, cx - 8, B, 16, 7, 9, o.seed, r.a);
    crate(s, cx - 14, B, 28, 12, 16, o.seed, r.a);
    if (st === 2) crate(s, cx - 11, B - 20, 17, 7, 9, o.seed + 3, r.a);
  }

  function barrel(s, cx, base, liquid) {
    const st = M.wood(P.plank, { dir: 'v', pw: 4, b: 3, seed: 3 });
    for (let j = 0; j < 22; j++) { const bulge = Math.round(Math.sin(j / 21 * 3.1416) * 2); s.tube(cx - 10 - bulge, base - 21 + j, 20 + bulge * 2, 1, j === 4 || j === 5 || j === 16 || j === 17 ? flatc(P.iron[j === 4 || j === 16 ? 5 : 3]) : st); }
    s.oval(cx, base - 22, 10, 4, (x, y, nx, ny) => Math.hypot(nx, ny) > .78 ? P.plank[5] : liquid ? at(liquid, nx + ny < -.3 ? 5 : nx + ny > .5 ? 2 : 4) : st(x, y));
    if (!liquid) s.rect(cx - 1, base - 23, 2, 2, P.wood[1]);
  }
  function jug(s, cx, base, liquid) {
    s.ball(cx, base - 7, 6.6, 7, 0, P.clay, { d: .3 });
    s.rect(cx - 2, base - 17, 5, 4, at(P.clay, 3)); s.rect(cx - 2, base - 17, 1, 4, hi(P.clay)); s.rect(cx - 3, base - 18, 7, 1, hi(P.clay, 1)); s.rect(cx - 1, base - 18, 3, 1, at(liquid, 3));
    s.rect(cx + 4, base - 15, 3, 1, at(P.clay, 2)); s.rect(cx + 6, base - 14, 1, 4, at(P.clay, 2));
  }
  function flask(s, cx, base, liquid) {
    s.ball(cx, base - 3, 3.8, 3.6, 0, P.clay, { d: .3 });
    s.rect(cx - 1, base - 8, 3, 2, at(P.clay, 3)); s.rect(cx - 1, base - 8, 1, 2, hi(P.clay)); s.rect(cx - 2, base - 9, 5, 1, hi(P.clay, 1)); s.set(cx, base - 9, at(liquid, 3));
    s.rect(cx + 3, base - 7, 1, 2, at(P.clay, 2));
  }
  function fluids(s, cx, st, r) {
    if (st === 0) return jug(s, cx, B, r.a);
    if (st === 2) { barrel(s, cx - 8, B - 5); barrel(s, cx + 6, B, r.a); return; }
    barrel(s, cx, B, r.a);
  }

  const HEAPED = [[[-3, 0], [3, 0], [0, 2]], [[-6, 0], [0, 0], [6, 0], [-3, 2.4], [3, 2.4], [0, 4.4]]];
  function basket(s, cx, base, r, h, produce, sd) {
    const wv = M.weave(P.wicker, 2);
    for (let j = 0; j < h; j++) { const half = r - Math.round(2 * j / (h - 1)); s.tube(cx - half, base - h + 1 + j, half * 2, 1, wv); }
    s.oval(cx, base - h, r, r * .36, (x, y, nx, ny) => Math.hypot(nx, ny) > .74 ? hi(P.wicker) : at(produce, 1));
    HEAPED[r > 8 ? 1 : 0].forEach(([dx, up], i) => s.ball(cx + dx, base - h - 1 - up, 3, 2.7, up + 1, produce, { d: .3, seed: sd + i }));
    s.rect(cx - r, base - h + 3, r * 2, 1, at(P.wicker, 1));
  }
  function baskets(s, cx, st, r, o) {
    if (st === 0) return basket(s, cx, B, 7, 8, r.a, o.seed);
    if (st === 2) { basket(s, cx - 7, B - 4, 9, 10, r.a, o.seed); basket(s, cx + 8, B, 9, 11, r.a, o.seed + 2); return; }
    basket(s, cx, B, 10, 11, r.a, o.seed);
  }

  function haunch(s, x, y, k, flip, c, z) {
    const d = flip ? -1 : 1;
    s.ball(x, y, 5.6 * k, 4.4 * k, z + 2, c, { d: .3, amp: .95 });
    s.ball(x + d * 5 * k, y + 2.6 * k, 3 * k, 2.4 * k, z + 1, c, { d: .3, bias: -.05 });
    s.line(x + d * 7 * k, y + 4 * k, x + d * 10 * k, y + 6.2 * k, P.bone[4]); s.set(x + d * 10.6 * k, y + 5.8 * k, P.bone[5]); s.set(x + d * 10 * k, y + 7.2 * k, P.bone[5]);
    s.set(x - 2 * k, y - 2.4 * k, P.cloth[5]); s.set(x - k, y - 2.4 * k, P.cloth[4]);
  }
  function ribs(s, x, y, w, c) {
    s.rect(x, y, w, 6, at(c, 2)); s.rect(x, y, w, 1, at(c, 4)); s.rect(x, y + 5, w, 1, at(c, 1));
    for (let i = 1; i < w; i += 2) { s.rect(x + i, y - 1, 1, 6, P.bone[4]); s.set(x + i, y - 1, P.bone[5]); }
  }
  const steak = (s, x, y, rx, ry, c) => { s.oval(x, y, rx, ry, (px, py, nx, ny) => Math.hypot(nx, ny) > .7 ? P.cloth[4] : at(c, nx + ny < 0 ? 4 : 3)); s.set(x, y, P.bone[5]); };
  const spread = (s, cx, rx, ramp) => s.oval(cx, B - 2, rx, 3.6, (x, y) => at(ramp, 2 + (hash(x, y, 3) > .7 ? 1 : 0)));
  function meat(s, cx, st, r) {
    if (st === 0) { spread(s, cx, 9, P.grass); haunch(s, cx - 2, B - 7, .9, false, r.a, 0); return; }
    spread(s, cx, st === 1 ? 13 : 16, P.furTan);
    if (st === 1) { ribs(s, cx + 2, B - 12, 11, r.a); haunch(s, cx - 5, B - 7, 1, false, r.a, 4); return; }
    haunch(s, cx - 1, B - 18, 1.25, false, r.a, 0);
    s.line(cx + 5, B - 21, cx + 10, B - 27, P.bone[4]); s.set(cx + 11, B - 28, P.bone[5]); s.set(cx + 10, B - 28, P.bone[5]);
    ribs(s, cx - 14, B - 13, 11, r.a);
    steak(s, cx + 9, B - 9, 5.6, 3.4, r.a);
    haunch(s, cx - 1, B - 8, .85, true, r.a, 8);
  }

  function pelt(s, cx, y, rx, ramp, sd, smooth, top) {
    const tex = smooth ? M.flat(ramp, 3, sd, .03) : M.fur(ramp, 3, sd);
    s.oval(cx, y, rx, top ? 4.2 : 3.4, (x, py, nx, ny) => { const c = tex(x, py); return ny > .45 ? dark(c, .62) : top && ny < -.2 ? lit(c, 1.12) : c; });
    if (!top) return;
    s.rect(cx - rx - 1, y + 1, 3, 2, at(ramp, 2)); s.rect(cx + rx - 2, y - 3, 3, 2, at(ramp, 4)); s.rect(cx - 4, y - 1, 7, 1, at(ramp, 2));
  }
  function hides(s, cx, st, r, o) {
    const n = [1, 3, 6][st];
    for (let i = 0; i < n; i++) pelt(s, cx + (i % 2 ? 1 : -1), B - 3 - i * 3, 12.4 - (i % 3) * .6, i % 2 ? r.b : r.a, o.seed + i, r.smooth, i === n - 1);
    if (st < 2) return;
    s.rect(cx - 1, B - 21, 2, 21, P.hay[2]); s.rect(cx - 1, B - 21, 1, 21, P.hay[4]); s.rect(cx - 2, B - 19, 4, 2, P.hay[4]);
  }

  function bolt(s, x, y, w, c, sd) {
    for (let j = 0; j < 6; j++) for (let i = 0; i < w; i++) s.set(x + i, y + j, at(c, [4, 5, 4, 3, 2, 1][j] - ((i + sd * 3) % 7 === 0 ? 1 : 0)));
    s.oval(x + 1.5, y + 3, 2.4, 3, (px, py, nx, ny) => { const q = Math.hypot(nx, ny); return q > .75 ? at(c, 2) : (Math.floor(q * 5) & 1) ? at(c, 5) : at(c, 3); });
    for (let j = 1; j < 5; j++) s.set(x + w, y + j, at(c, 0));
  }
  const BOLTS = [[[-11, 5, 22]], [[-12, 9, 22], [-10, 5, 23], [-11, 13, 22]], [[-12, 15, 23], [-11, 10, 22], [-12, 5, 24], [-10, 19, 22], [-12, 14, 23], [-11, 23, 22]]];
  function cloth(s, cx, st, r, o) { BOLTS[st].forEach(([dx, up, w], i) => bolt(s, cx + dx, B - up, w, i % 2 ? r.b : r.a, o.seed + i)); }

  const soup = (liquid, nx, ny, x, y) => hash(x, y, 7) > .86 ? P.red[4] : hash(x, y, 8) > .9 ? P.grass[4] : at(liquid, nx + ny < 0 ? 4 : 3);
  function bowl(s, cx, base, liquid) {
    s.oval(cx, base - 3, 5, 3.6, () => P.plank[3]);
    s.oval(cx, base - 5, 5, 2, (x, y, nx, ny) => Math.hypot(nx, ny) > .7 ? P.plank[5] : soup(liquid, nx, ny, x, y));
  }
  function pot(s, cx, base, liquid) {
    s.ball(cx, base - 8, 8.6, 8, 0, P.clay, { d: .3 });
    s.rect(cx - 11, base - 12, 3, 3, at(P.clay, 2)); s.rect(cx + 8, base - 12, 3, 3, at(P.clay, 1));
    s.oval(cx, base - 15, 6.4, 2.4, (x, y, nx, ny) => Math.hypot(nx, ny) > .7 ? hi(P.clay) : soup(liquid, nx, ny, x, y));
  }
  function cauldron(s, cx, base, liquid) {
    for (const x of [cx - 9, cx + 7]) { s.rect(x, base - 3, 2, 4, P.iron[2]); s.rect(x, base - 3, 1, 4, P.iron[4]); }
    s.ball(cx, base - 12, 12.6, 10.4, 0, P.iron, { d: .3, bias: -.06 });
    s.thick(cx + 2, base - 22, cx + 11, base - 32, 2, P.plank, 4);
    s.oval(cx, base - 21, 10.6, 3.4, (x, y, nx, ny) => Math.hypot(nx, ny) > .78 ? P.iron[6] : soup(liquid, nx, ny, x, y));
    s.rect(cx - 13, base - 18, 2, 2, P.iron[5]); s.rect(cx + 12, base - 18, 2, 2, P.iron[3]);
  }
  function pots(s, cx, st, r) {
    if (st === 0) return bowl(s, cx, B, r.a);
    if (st === 1) { pot(s, cx - 4, B, r.a); bowl(s, cx + 10, B, r.a); return; }
    bowl(s, cx - 15, B - 1, r.a); cauldron(s, cx + 3, B, r.a);
  }

  function sheaf(s, x, y, w, c, sd) {
    for (let j = 0; j < 7; j++) {
      const x0 = x + (j % 2) + 1 - Math.floor(hash(j, sd, 3) * 3), x1 = x + w - 1 - Math.floor(hash(j, sd, 4) * 3);
      for (let i = x0; i <= x1; i++) s.set(i, y + j, at(c, [4, 5, 4, 3, 3, 2, 1][j] - (hash(i >> 1, j, sd) > .8 ? 1 : 0)));
    }
    s.rect(x + (w >> 1) - 1, y, 2, 7, P.leather[3]); s.rect(x + (w >> 1) - 1, y, 2, 1, P.leather[5]);
  }
  function rick(s, cx, c) {
    const tex = M.thatch(c, { rh: 6, seed: 4 });
    for (let y = B - 25; y <= B; y++) {
      const half = 15 * Math.sqrt(Math.max(0, 1 - ((B - y) / 26) ** 2));
      for (let x = Math.ceil(cx - half); x <= cx + half; x++) { const u = (x - cx) / Math.max(1, half), t = tex(x, y); s.set(x, y, u < -.45 ? lit(t, 1.14) : u > .45 ? dark(t, .74) : t); }
    }
    s.rect(cx, B - 30, 1, 6, P.wood[3]); s.set(cx, B - 30, P.wood[5]);
  }
  function bundles(s, cx, st, r, o) {
    if (st === 2) return rick(s, cx, r.a);
    if (st === 1) { sheaf(s, cx - 11, B - 10, 24, r.a, o.seed); sheaf(s, cx - 13, B - 6, 25, r.a, o.seed + 1); sheaf(s, cx - 12, B - 14, 23, r.a, o.seed + 2); return; }
    sheaf(s, cx - 12, B - 6, 24, r.a, o.seed);
  }

  function helm(s, cx, r) {
    s.ball(cx, B - 7, 6.6, 6.6, 0, r.a, { d: .3 });
    for (let y = B - 4; y <= B; y++) for (let x = cx - 8; x <= cx + 8; x++) s.set(x, y, null);
    s.rect(cx - 7, B - 4, 14, 2, at(r.a, 2)); s.rect(cx - 7, B - 4, 14, 1, hi(r.a, 1)); s.rect(cx - 7, B - 4, 1, 2, hi(r.a)); s.rect(cx - 1, B - 2, 2, 3, at(r.a, 3)); s.rect(cx - 1, B - 2, 1, 3, hi(r.a, 1));
    s.rect(cx - 1, B - 12, 1, 6, hi(r.a));
  }
  const TORSO = [7, 7, 7, 6.5, 6.5, 6.5, 6, 6, 5.5, 5.5, 5.5, 6, 6.5, 7, 7, 7];
  function cuirass(s, cx, r) {
    TORSO.forEach((half, j) => s.tube(Math.round(cx - half), B - 15 + j, Math.round(half * 2), 1, () => at(r.a, j > 11 ? 3 : 4)));
    s.rect(cx - 2, B - 15, 4, 2, at(r.a, 0)); s.rect(cx - 7, B - 13, 1, 3, at(r.a, 0)); s.rect(cx + 6, B - 13, 1, 3, at(r.a, 0));
    s.rect(cx - 6, B - 4, 12, 1, at(r.a, 1)); s.rect(cx - 6, B - 2, 13, 1, at(r.a, 1)); s.rect(cx, B - 12, 1, 8, at(r.a, 2));
  }
  function boot(s, x, base, c) {
    s.tube(x - 2, base - 9, 5, 7, () => at(c, 3));
    s.oval(x + .5, base - 9, 2.6, 1.3, () => at(c, 0));
    s.ball(x + 1, base - 1.6, 3.6, 2.5, 1, c, { d: .3 });
    s.rect(x - 2, base - 7, 5, 1, hi(c));
  }
  function boots(s, cx, r) { boot(s, cx + 4, B - 2, r.a); boot(s, cx - 4, B, r.a); }
  function pack(s, cx, r) {
    for (const x of [cx - 7, cx + 6]) { s.rect(x, B - 19, 2, 8, P.plank[3]); s.rect(x, B - 19, 1, 8, P.plank[5]); }
    s.ball(cx, B - 7, 8.6, 8.4, 0, r.a, { d: .3, n: .2, ns: .6 });
    trim(s);
    s.oval(cx, B - 13, 7, 3.4, (x, y, nx, ny) => at(r.a, ny > .3 ? 2 : nx < -.2 ? 5 : 4));
    s.rect(cx - 1, B - 11, 2, 6, at(r.a, 1)); s.rect(cx - 1, B - 6, 2, 2, P.gold[4]);
    s.rect(cx - 8, B - 4, 16, 1, at(r.a, 1)); s.rect(cx - 4, B - 16, 8, 2, P.cloth[3]); s.rect(cx - 4, B - 16, 8, 1, P.cloth[5]);
  }
  function roll(s, cx, r) {
    s.oval(cx, B - 3, 7, 3.6, (x, y, nx, ny) => at(r.a, nx + ny < -.3 ? 4 : 3));
    s.oval(cx - 4, B - 3, 2.2, 2.6, (x, y, nx, ny) => (Math.floor(Math.hypot(nx, ny) * 4) & 1) ? at(r.a, 5) : at(r.a, 2));
    s.rect(cx + 1, B - 6, 2, 7, P.hay[3]);
  }
  function shieldFlat(s, cx, r) {
    const tex = M.wood(r.a, { dir: 'v', pw: 5, b: 3, seed: 2 });
    s.oval(cx, B - 4, 10.4, 5, (x, y, nx, ny) => Math.hypot(nx, ny) > .84 ? at(r.a, 1) : tex(x, y));
    s.ball(cx, B - 5, 2.8, 2.2, 3, P.iron, { d: .3 });
  }
  function shieldUp(s, cx, r) {
    const tex = M.wood(r.a, { dir: 'v', pw: 5, b: 3, seed: 2 });
    s.oval(cx, B - 10, 8.6, 10, (x, y, nx, ny) => Math.hypot(nx, ny) > .84 ? at(r.a, 1) : tex(x, y));
    s.ball(cx, B - 11, 3, 3, 3, P.iron, { d: .3 });
  }

  function frame(a, b) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = [u[1], -u[0]];
    const F = (t, v) => [a[0] + u[0] * t + n[0] * (v || 0), a[1] + u[1] * t + n[1] * (v || 0)];
    F.v = (x, y) => (x + .5 - a[0]) * n[0] + (y + .5 - a[1]) * n[1];
    return F;
  }
  const shaft = (s, F, t0, t1, hw, ramp, k) => TK.seg(s, F(t0), F(t1), hw, (t, v) => at(ramp, (k === undefined ? 3 : k) + (v < -.25 ? 1 : v > .25 ? -1 : 0)));
  const plate = (s, F, pts, ramp, k, edge) => TK.poly(s, pts.map(p => F(p[0], p[1])), (x, y) => { const v = F.v(x, y); return edge && edge(v) ? hi(ramp) : at(ramp, k + (v > .4 ? 1 : v < -.4 ? -1 : 0)); });
  const scaled = (pts, k) => pts.map(p => [p[0] * k, p[1] * k]);
  function blade(s, F, k) {
    shaft(s, F, 0, 1.6 * k, 1.1, P.gold, 4);
    shaft(s, F, 1.6 * k, 5.6 * k, .9, P.leather, 3);
    TK.seg(s, F(6.2 * k, -3.6 * k), F(6.2 * k, 3.6 * k), .8, () => P.gold[4]);
    plate(s, F, scaled([[7, 1.7], [18, 1.6], [21, 0], [18, -1.6], [7, -1.7]], k), P.iron, 5);
  }
  const inside = (v, a, b) => v >= a && v <= b;
  const wrap = (t, v) => [P.leather, (t & 1 ? 4 : 2) - (v > -1 ? 1 : 0)];
  function swordCell(t, v) {
    if (t === 0 || t === 2) return inside(v, -1, 0) && [P.gold, (t ? 2 : 3) - v];
    if (t === 1) return inside(v, -2, 1) && [P.gold, v < 0 ? 4 : 2 - (v > 0 ? 1 : 0)];
    if (t <= 9) return inside(v, -1, 0) && wrap(t, v);
    if (t === 10) return inside(v, -5, 4) && [P.gold, Math.abs(v + .5) > 4 ? 2 : v < 0 ? 4 : 3];
    if (t === 11) return inside(v, -2, 1) && [P.gold, v < 0 ? 3 : 1];
    const half = t <= 30 ? [-2, 1] : t <= 32 ? [-1, 1] : t === 33 ? [-1, 0] : [0, 0];
    if (!inside(v, half[0], half[1])) return null;
    if (t >= 33) return [P.iron, 6];
    return [P.iron, v === -2 ? 5 : v === -1 ? (t < 14 ? 4 : 6) : v === 0 ? 3 : 2];
  }
  const AXE_EDGE = [[17, 9.5], [19.5, 10.4], [22.5, 10.8], [25.5, 10.2], [27.5, 8.5]];
  function axeEdgeAt(a) {
    const found = AXE_EDGE.findIndex(p => p[0] >= a), i = Math.max(1, found < 0 ? AXE_EDGE.length - 1 : found), p = AXE_EDGE[i - 1], q = AXE_EDGE[i];
    return p[1] + (q[1] - p[1]) * clamp((a - p[0]) / (q[0] - p[0]), 0, 1);
  }
  const AXE = {
    steel: TK.ramp('#1e2430 #323c4c #4c5a6a #6e7e8c #96a6b0 #c2ced2 #eaf0ee'),
    head: [[24.8, 1.4], ...AXE_EDGE.slice().reverse(), [19.4, 5.6], [21.4, 3], [21.8, 1.4]],
    socket: [[21.2, -1.8], [25.4, -1.8], [25.4, 1.8], [21.2, 1.8]],
    headTone(a, q) { const d = axeEdgeAt(a) - q; return d < 1.1 ? 6 : d < 2.5 ? 5 : q < 3.2 ? 2 : a > 23.6 ? 4 : 3; },
    socketTone: q => q > .4 ? 4 : q > -.8 ? 3 : 1
  };
  const AXE_TOP = 27.5;
  function within(pts, a, q) {
    let hit = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [ai, qi] = pts[i], [aj, qj] = pts[j];
      if ((qi > q) !== (qj > q) && a < ai + (aj - ai) * (q - qi) / (qj - qi)) hit = !hit;
    }
    return hit;
  }
  function axeCell(t, v) {
    const a = t + .5 - (LONG.axe.L - AXE_TOP), q = -v - .5;
    if (within(AXE.socket, a, q)) return [AXE.steel, AXE.socketTone(q)];
    if (within(AXE.head, a, q)) return [AXE.steel, AXE.headTone(a, q)];
    if (!inside(v, -1, 0)) return null;
    if (inside(t, 1, 6)) return wrap(t, v);
    return [P.wood, t === 0 ? 3 : v < 0 ? 5 : 3];
  }
  const LEAN_STEP = 4;
  function cells(def, pose) {
    const out = [];
    for (let t = 0; t < def.L; t++) for (let v = -12; v <= 12; v++) {
      const c = def.cell(t, v);
      if (!c) continue;
      const lean = pose === 'lean';
      out.push({ x: lean ? Math.floor(t / LEAN_STEP) + v : t, y: lean ? t : Math.floor(t / LEAN_STEP) - v, r: c[0], k: c[1] });
    }
    return out;
  }
  function drawn(def, pose) {
    const pts = cells(def, pose), s = new Spr(48, HIGH, CX, B), lean = pose === 'lean';
    const dy = B - 1 - Math.max(...pts.map(p => p.y));
    const dx = lean ? CX + 4 - Math.floor((def.L - 1) / LEAN_STEP) : CX - (def.L >> 1);
    const ramp = new Map();
    for (const p of pts) { s.set(p.x + dx, p.y + dy, at(p.r, p.k)); ramp.set((p.y + dy) * s.w + p.x + dx, p.r); }
    const edge = [];
    for (let y = 1; y < s.h - 1; y++) for (let x = 1; x < s.w - 1; x++) {
      if (ramp.has(y * s.w + x)) continue;
      const n = [(y - 1) * s.w + x, y * s.w + x - 1, y * s.w + x + 1, (y + 1) * s.w + x].find(i => ramp.has(i));
      if (n !== undefined) edge.push([x, y, ramp.get(n)[0]]);
    }
    for (const [x, y, c] of edge) s.set(x, y, c);
    return s;
  }
  const LONG = {
    sword: { L: 35, cell: swordCell },
    dagger: { L: 11, f: (s, F) => blade(s, F, .52) },
    axe: { L: 35, cell: axeCell },
    hoe: { headUp: true, L: 34, f(s, F) { shaft(s, F, 0, 34, .9, P.plank, 3); plate(s, F, [[30.6, -.5], [34, -.5], [34, -7.4], [31.6, -7.4]], P.iron, 4, v => v < -6.2); } },
    spear: { headUp: true, L: 40, f(s, F) { shaft(s, F, 0, 34, .9, P.plank, 2); shaft(s, F, 33, 35.4, 1.4, P.iron, 3); plate(s, F, [[35, 2.3], [38, 1.7], [41, 0], [38, -1.7], [35, -2.3], [34, 0]], P.iron, 5); } },
    staff: { headUp: true, L: 36, f(s, F) { shaft(s, F, 0, 34, 1, P.wood, 3); shaft(s, F, 24, 28, 1.3, P.cloth, 3); const p = F(35); s.ball(p[0], p[1], 2.4, 2.4, 2, P.blue, { d: .3 }); } },
    bow: { L: 25, f(s, F) { TK.path(s, TK.curve(F(0), F(12.5, 7.6), F(25)), 1.1, (t, v) => Math.abs(t - .5) < .09 ? P.leather[3] : at(P.wood, 4 + (v < 0 ? 1 : -1))); }, over: (s, F) => { const a = F(0), b = F(25); s.line(a[0], a[1], b[0], b[1], P.cloth[4]); } },
    hammer: { L: 15, f(s, F) { shaft(s, F, 0, 14, .9, P.plank, 3); plate(s, F, [[10.4, 3.6], [15, 3.6], [15, -3.6], [10.4, -3.6]], P.iron, 4); } },
    pick: { headUp: true, L: 24, f(s, F) { shaft(s, F, 0, 24, .9, P.plank, 3); plate(s, F, [[21, 0], [23.6, 0], [21.6, 8.6], [20.4, 8.4]], P.iron, 4); plate(s, F, [[21, 0], [23.6, 0], [21.6, -8.6], [20.4, -8.4]], P.iron, 4); } },
    mace: { L: 17, f(s, F) { shaft(s, F, 0, 13, .9, P.plank, 3); const p = F(14.6); s.ball(p[0], p[1], 3.2, 3.2, 2, P.iron, { d: .3 }); for (const v of [-3.6, 3.6]) { const q = F(14.6, v); s.set(q[0], q[1], P.iron[6]); } } },
    saw: { L: 20, f(s, F) { plate(s, F, [[0, 2.6], [4.4, 2.6], [4.4, -2.6], [0, -2.6]], P.plank, 3); plate(s, F, [[4, 2.4], [20, 1.2], [20, -2.6], [4, -2.6]], P.iron, 5); for (let t = 5; t < 20; t += 2) { const p = F(t, -2.8); s.set(p[0], p[1], P.iron[2]); } } },
    tongs: { L: 17, f(s, F) { TK.seg(s, F(0, 1.8), F(17, -1.2), .7, () => P.iron[4]); TK.seg(s, F(0, -1.8), F(17, 1.2), .7, () => P.iron[3]); const p = F(10.6); s.set(p[0], p[1], P.iron[6]); } }
  };
  const POSES = {
    lie: L => [[CX - L * .47, B - 1 - L * .2], [CX + L * .47, B - 1]],
    lean(L, headUp) {
      const foot = [CX + (L > 30 ? 5 : 3), B - (headUp ? 0 : 1)], top = [CX - (L > 30 ? 4 : 2), foot[1] - L * .94];
      return headUp ? [foot, top] : [top, foot];
    }
  };
  const ARMOUR = { helm, cuirass, boots, pack, roll, shield: shieldFlat, shieldUp };
  const PILES = { logs, planks, blocks, rubble, heap, bars, sacks, crates, fluids, baskets, meat, hides, cloth, pots, bundles };
  const WIDTH = { logs: 17, planks: 16, blocks: 17, rubble: [8, 13, 16], heap: [8, 12, 15], bars: [13, 15, 17], sacks: [9, 17, 17], crates: [9, 15, 15], fluids: [7, 11, 17], baskets: [8, 11, 17], meat: [10, 14, 17], hides: 13, cloth: 12, pots: [6, 14, 17], bundles: [13, 14, 15] };
  const spread1 = (v, st) => Array.isArray(v) ? v[st] : v;

  function pile(cls, stages, ramps, seed) {
    const n = stages.length, s = new Spr(32 * n + 16, HIGH, CX, B);
    stages.forEach((st, i) => PILES[cls](s, CX + 32 * i, st, ramps, { seed: seed + i * 3, left: i > 0, right: i < n - 1 }));
    s.outline();
    const half = spread1(WIDTH[cls], stages[n - 1]) + 16 * (n - 1);
    s.sh = { rx: half + 2, ry: 4.6 + (Math.max(...stages) > 0 ? 1 : 0), dx: 16 * (n - 1) + 4, dy: 0, k: .9 };
    return s;
  }
  function itemSprite(id, pose) {
    const made = WORLD_ITEMS.cells(id, pose), s = new Spr(48, HIGH, CX, B), lean = pose === 'lean';
    const ys = made.cells.map(c => c.y), low = Math.max(...ys), foot = made.cells.filter(c => c.y === low).map(c => c.x), xs = made.cells.map(c => c.x);
    const dx = lean ? CX + 4 - Math.round((Math.min(...foot) + Math.max(...foot)) / 2) : CX - Math.round((Math.min(...xs) + Math.max(...xs)) / 2);
    for (const c of made.cells) s.set(c.x + dx, c.y + B - 1 - low, c.rgb);
    return { s, L: made.L };
  }
  function long(kind, pose, flip, id) {
    const own = id && WORLD_ITEMS.has(id) && itemSprite(id, pose), def = own || LONG[kind];
    let s;
    if (own) s = own.s;
    else if (def.cell) s = drawn(def, pose);
    else {
      const [a, b] = POSES[pose](def.L, def.headUp), F = frame(a, b);
      s = new Spr(48, HIGH, CX, B);
      def.f(s, F);
      s.outline();
      if (def.over) def.over(s, F);
    }
    s.sh = pose === 'lie' ? null : { rx: 5, ry: 2.2, dx: 4, dy: 0, k: .7 };
    return flip ? s.flip() : s;
  }
  function worn(kind, ramps, flip, item, quantity) {
    const own = item && WORLD_GEAR.of(item);
    const s = own ? WORLD_GEAR.sprite(own, kind === 'shieldUp' ? 'lean' : 'ground', quantity) : generic(kind, ramps);
    return flip ? s.flip() : s;
  }
  const SHOULDERED = { half: 14, tones: [5, 4, 3, 3, 2, 1], recedes: 4 };
  function shouldered(s, bark, end) {
    const { half, tones } = SHOULDERED, top = B - tones.length + 1;
    for (let i = -half; i <= half; i++) tones.forEach((tone, j) => s.set(CX + i, top + j, at(bark, tone - (noise(i * .3, j, 3) > .68 ? 1 : 0))));
    s.oval(CX + half, top + 2.5, 2, 3, (px, py, nx, ny) => at(end, Math.hypot(nx, ny) < .5 ? 3 : 5));
  }
  const CARRIED = {
    logs: (s, r) => shouldered(s, r.a, r.b),
    planks: (s, r, seed) => s.slab(CX - SHOULDERED.half, B - 3, SHOULDERED.half * 2 + 1, 2, 2, M.wood(r.a, { pw: 4, seed, b: 3 }), M.flat(r.a, 2, seed + 1, .04)),
    rubble: (s, r, seed) => basket(s, CX, B, 6, 6, r.a, seed),
    heap: (s, r, seed) => basket(s, CX, B, 6, 6, r.a, seed),
    baskets: (s, r, seed) => basket(s, CX, B, 6, 6, r.a, seed),
    bars: (s, r) => bar(s, CX - 6, B - 4, r.a),
    sacks: (s, r) => { sack(s, CX, B - 5, 4.6, 0, r.a); trim(s); },
    fluids: (s, r) => flask(s, CX, B, r.a),
    blocks: (s, r) => s.slab(CX - 6, B - 9, 12, 3, 7, M.flat(r.a, 4, 3), M.flat(r.a, 3, 5)),
    hides: (s, r, seed) => pelt(s, CX, B - 3, 7, r.a, seed, r.smooth, true),
    bundles: (s, r, seed) => sheaf(s, CX - 7, B - 6, 14, r.a, seed),
    cloth: (s, r, seed) => bolt(s, CX - 7, B - 5, 14, r.a, seed),
    meat: (s, r) => haunch(s, CX - 1, B - 5, .62, false, r.a, 0)
  };
  const SHOULDER_FORMS = ['logs', 'planks'], TURNED_FORMS = ['bars'];
  const END_REST = { logs: 0, planks: 0 };
  const ENDS = {
    logs(s, r) {
      const rows = SHOULDERED.recedes;
      for (let j = 0; j < rows; j++) for (let i = -3; i <= 4; i++) if (j || (i > -3 && i < 4)) s.set(CX + i, B - 6 - rows + j, at(r.a, [3, 5, 4, 4, 3, 3, 2, 1][i + 3] - (noise(i * 1.3, j * .5, 3) > .68 ? 1 : 0)));
      s.oval(CX + .5, B - 3, 4, 3.7, (px, py, nx, ny) => { const q = Math.hypot(nx, ny); return q > .8 ? at(r.a, 2) : q < .3 ? at(r.b, 2) : at(r.b, q < .6 ? 5 : 4); });
    },
    planks(s, r) {
      const rows = SHOULDERED.recedes;
      for (let j = 0; j < rows; j++) for (let i = -3; i <= 4; i++) s.set(CX + i, B - 2 - rows + j, at(r.a, i === -1 || i === 2 ? 4 : 5));
      s.rect(CX - 3, B - 1, 8, 2, at(r.a, 3)); s.rect(CX - 3, B, 8, 1, at(r.a, 1));
    },
    bars(s, r) {
      const n = r.a.length - 1;
      s.rect(CX - 1, B - 4, 3, 1, r.a[n]); s.rect(CX - 2, B - 3, 5, 3, r.a[n - 2]); s.rect(CX - 2, B - 3, 5, 1, r.a[n - 1]); s.rect(CX - 2, B - 1, 5, 1, r.a[1]);
    },
    meat(s, r, size) {
      const rx = clamp(size * .3, 5, 9), ry = rx * .8, top = B - ry * 2;
      for (const dx of [-rx * .45, rx * .45]) { s.rect(Math.round(CX + dx) - 1, B - 2, 2, 6, at(r.a, 2)); s.rect(Math.round(CX + dx) - 1, B + 3, 2, 2, at(r.a, 0)); }
      s.ball(CX, top + ry, rx, ry, 0, r.a, { d: .3, n: .3, ns: .7, seed: 3 });
      s.ball(CX - rx * .5, top + ry * 1.5, rx * .42, ry * .45, 3, r.a, { d: .3, bias: -.08 });
      s.set(Math.round(CX - rx * .7), Math.round(top + ry * 1.5), at(r.a, 0));
    }
  };
  function carriedEnd(cls, ramps, size) {
    const s = new Spr(48, HIGH, CX, B);
    ENDS[cls](s, ramps, size);
    s.outline();
    if (cls === 'meat') s.hold = [CX, B + 1];
    else if (SHOULDER_FORMS.includes(cls)) s.hold = [CX, B + 1 - END_REST[cls] - (SHOULDERED.recedes >> 1)];
    return s;
  }
  function carried(cls, ramps, seed) {
    const s = new Spr(48, HIGH, CX, B);
    CARRIED[cls](s, ramps, seed);
    s.outline();
    if (SHOULDER_FORMS.includes(cls)) s.hold = [CX, B + 1];
    return s;
  }
  function generic(kind, ramps) {
    const s = new Spr(48, HIGH, CX, B);
    ARMOUR[kind](s, CX, ramps);
    s.outline();
    s.sh = { rx: kind === 'shield' ? 11 : 8, ry: 3, dx: 3, dy: 0, k: .8 };
    return s;
  }
  function tucked(spr, ramp, seed, lush) {
    const s = new Spr(spr.w, spr.h, spr.ax, spr.ay), m = ramp.length - 1;
    s.c = spr.c.slice(); s.e = spr.e.slice(); s.sh = spr.sh;
    for (let x = 1; x < s.w - 1; x++) {
      let foot = -1;
      for (let y = B + 1; y >= B - 3; y--) if (spr.c[y * s.w + x]) { foot = y; break; }
      if (foot < 0 || hash(x, seed, 31) > (lush ? .5 : .4)) continue;
      const tall = 2 + Math.floor(hash(x, seed, 32) * (lush ? 4 : 3));
      for (let j = 0; j < tall; j++) s.set(x + (j > tall - 2 && hash(x, seed, 33) > .5 ? 1 : 0), foot + 1 - j, ramp[j === tall - 1 ? m : j > tall - 3 ? m - 1 : m - 2]);
    }
    return s;
  }
  function undersides(spr) {
    const out = [];
    for (let x = 0; x < spr.w; x++) for (let y = spr.h - 1; y >= 0; y--) if (spr.c[y * spr.w + x]) { out.push([x, y]); break; }
    return out;
  }
  function blade(s, x, root, tall, lean, ramp) {
    const top = lean ? ramp.length - 1 : ramp.length - 2;
    for (let j = 0; j < tall; j++) s.set(x + (j >= tall - 1 ? lean : 0), root - j, ramp[clamp(top - tall + 1 + j, 0, top)]);
  }
  function bedded(spr, ramp, seed) {
    const s = new Spr(spr.w, spr.h, spr.ax, spr.ay);
    s.c = spr.c.slice(); s.e = spr.e.slice(); s.sh = spr.sh;
    for (const [x, foot] of undersides(spr)) {
      const roll = hash(x, seed, 41);
      if (roll > .62) continue;
      const crossing = roll < .16, tall = crossing ? 4 + Math.floor(hash(x, seed, 42) * 3) : 2 + Math.floor(hash(x, seed, 43) * 2);
      blade(s, x, foot + 1, tall, crossing ? (hash(x, seed, 44) > .5 ? 1 : -1) : 0, ramp);
    }
    return s;
  }
  const headUp = (kind, id) => id && WORLD_ITEMS.has(id) ? WORLD_ITEMS.headUp(id) : !!LONG[kind].headUp;
  return { B, rampOf, mixed, pile, long, worn, carried, carriedEnd, SHOULDERED: SHOULDER_FORMS, TURNED: TURNED_FORMS, headUp, tucked, bedded, undersides, PILES: Object.keys(PILES), LONG: Object.keys(LONG), CARRIED: Object.keys(CARRIED), lengthOf: k => LONG[k].L };
})();
