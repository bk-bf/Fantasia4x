'use strict';
(() => {
  const X = DBX, { C, MAT, tone, IC, lerp, frame, stroke, poly, qv, bez, arc, rough, sel, part, haft, cordC, lash, strand, ball, makers } = X.hd;
  const { blob } = X.hdTools, { rod, light, pebble } = X.hdWeapons, { skin } = X.hdGear;
  const rampFrom = h => { const c = typeof h === 'string' ? hex(h) : h; return [.2, .32, .46, .62, .8, 1, 1.2, 1.42].map(k => [clamp(c[0] * k + (k > 1 ? (k - 1) * 70 : (1 - k) * 4), 0, 255), clamp(c[1] * k + (k > 1 ? (k - 1) * 60 : 0), 0, 255), clamp(c[2] * k + (k > 1 ? (k - 1) * 50 : (1 - k) * 16), 0, 255)]); };
  const FUR = {
    tan: R('#3a2c1c #56422a #74593a #92734c #ae8e62 #c6a87c #dcc49c #eedcbc'),
    grey: R('#1c1e24 #2e3138 #454950 #5f646a #7c8286 #9ba0a2 #babdbc #d8d9d4'),
    dark: R('#0e0e12 #1a1a20 #282830 #383842 #4b4b56 #60606c #787884 #92929c'),
    brown: R('#1e130c #302014 #45301e #5c422a #745638 #8c6c4a #a48460 #ba9c78'),
    black: R('#140e0a #221812 #33241a #463224 #5a4230 #70543e #866850 #9c7e64'),
    rust: R('#24120a #3c1e10 #562c18 #703c22 #8a4e2e #a2643e #b87c52 #cc966a'),
    sand: R('#3a2a14 #56401e #745a2c #92763c #b09250 #c8ac6a #dcc488 #ecdaa8'),
    white: R('#4a4a44 #68685e #88877a #a8a696 #c4c2b2 #dcdacc #eeece2 #fafaf4'),
    rat: R('#1e1a16 #2e2822 #423a30 #584e40 #6e6252 #867868 #9e9080 #b6a898'),
    croc: R('#16200e #243216 #344820 #48602e #5e783e #789052 #92a86a #acc084'),
    bristle: R('#1a1410 #2a2018 #3c3024 #504232 #665644 #7e6c58 #96846e #ae9c86'),
  };
  const SP = [
    [/rabbit|coney/, { k: .56, fur: FUR.tan, belly: 1 }], [/rat|vermin/, { k: .5, fur: FUR.rat }], [/deer|buckskin|fawn/, { k: .88, fur: FUR.tan, belly: 1 }], [/goat|kid/, { k: .8, fur: FUR.white }],
    [/jackal/, { k: .74, fur: FUR.sand, saddle: 1 }], [/dire_?wolf/, { k: 1.06, fur: FUR.dark, dorsal: 1, mane: 1 }], [/worg/, { k: .98, fur: FUR.dark, dorsal: 1 }], [/wolf/, { k: .9, fur: FUR.grey, dorsal: 1 }],
    [/boar/, { k: .9, fur: FUR.bristle, dorsal: 2 }], [/elk/, { k: 1.04, fur: FUR.brown, belly: 1 }], [/aurochs|ox/, { k: 1.12, fur: FUR.black }], [/cave_bear/, { k: 1.16, fur: FUR.black, shag: 1 }], [/bear/, { k: 1.08, fur: FUR.brown, shag: 1 }],
    [/owlbear/, { k: 1.14, fur: FUR.brown, feather: .5 }], [/sabretooth/, { k: 1.06, fur: FUR.sand, stripes: 1 }], [/mammoth/, { k: 1.18, fur: FUR.rust, shag: 2 }], [/hippogriff/, { k: 1.08, fur: FUR.tan, feather: 1, fr: FUR.white }], [/croc|scale/, { k: 1, fur: FUR.croc, scales: 1 }],
  ];
  const spOf = id => { for (const [re, v] of SP) if (re.test(id)) return v; return { k: .9, fur: FUR.brown }; };
  const FLESH = R('#5a2c2a #7c4440 #9e6258 #bc8474 #d2a692 #e2c4b2 #f0dccf #faf0e8');
  const CURED = R('#4a3a28 #68543a #88704e #a68c66 #c0a882 #d6c2a0 #e8dabc #f6eedc');
  const furAt = (sp, x, y, cx, sd, D) => {
    const dx = x - cx, sg = dx > 0 ? 1 : -1;
    let L = .5 - dx * .004 + (noise(x * (sp.shag ? .7 : .9) - sg * y * .22, y * (sp.shag ? .2 : .3), sd) - .5) * (sp.shag ? .6 : .46) + (hash(x, y >> 1, sd) - .5) * .14;
    if (sp.dorsal && Math.abs(dx) < 3.4 * sp.k) L -= .1 * sp.dorsal;
    if (sp.saddle && Math.abs(dx) < 8 * sp.k) L -= .16;
    if (sp.belly && D && D.all < 3.6) L += .2;
    if (sp.stripes && Math.sin(y * .62 + Math.sin(x * .3) * 1.4) > .55 && Math.abs(dx) > 2) L -= .3;
    if (sp.scales) { const row = Math.floor(y / 4), xx = x + (row & 1) * 3, lx = ((xx % 6) + 6) % 6, ly = ((y % 4) + 4) % 4; L = .46 - dx * .006 + (lx === 0 || ly === 3 ? -.24 : lx === 2 && ly === 0 ? .2 : 0) + (Math.abs(dx) < 4 ? .08 : 0); }
    if (sp.feather) { const row = Math.floor((y + 40) / 5), xx = x + (row & 1) * 3, lx = ((xx % 6) + 6) % 6, ly = (((y + 40) % 5) + 5) % 5; if (sp.feather >= 1 ? y < (D ? 30 : 99) : hash(Math.floor(xx / 6), row, sd) > .5) { const R2 = sp.fr || sp.fur; return rp(R2, .56 + (ly === 4 ? -.26 : ly === 0 ? .16 : 0) + (lx === 0 ? -.14 : lx === 3 ? .08 : 0) - dx * .004, x, y, .2); } }
    return rp(sp.fur, L, x, y, .35);
  };
  const chaikin = (pts, n) => { for (let k = 0; k < n; k++) { const out = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; out.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25, a[2]], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75, a[2]]); } pts = out; } return pts; };
  const PELT = [[3, -24], [6, -20], [10, -17], [19, -21], [22, -16], [15, -11], [12, -4], [13, 4], [16, 10], [23, 14], [22, 20], [14, 17], [8, 20], [2.5, 21], [1.2, 27]];
  const peltPts = (k, cx, cy, sd, amp, long) => { const h = PELT.map(p => [p[0] * k * (long ? .7 : 1), p[1] * k * (long ? 1.08 : 1)]); return rough(chaikin([...h.map(p => [cx + p[0], cy + p[1], 'e']), ...h.slice().reverse().map(p => [cx - p[0], cy + p[1], 'e'])], 2), amp, sd); };
  const pelt = (sp, o) => () => {
    o = o || {};
    const s = IC(), k = Math.min(sp.k, 1.16), cx = 32, cy = 31 - k * 1.5, sd = Math.round(sp.k * 100);
    part(s, t => poly(t, peltPts(k, cx, cy, sd, sp.shag ? 2.6 : 1.6, sp.scales), (x, y, D) => {
      if (o.rot) { const L = .42 + (noise(x * .3, y * .3, sd) - .5) * .5; return noise(x * .22, y * .22, sd + 4) > .56 ? rp(R('#1c2412 #2c3a1a #405224 #566a30 #6e823e'), L + .1, x, y, .5) : rp(R('#1e1610 #30241a #463626 #5c4a34 #746044'), L, x, y, .5); }
      if (!o.flesh) return furAt(sp, x, y, cx, sd, D);
      if (D.all < (sp.shag ? 3 : 2.2)) return furAt(sp, x, y, cx, sd, null);
      let L = .66 + (noise(x * .16, y * .16, sd) - .5) * .3 - (x - cx) * .003;
      if (Math.abs(noise(x * .24, y * .24, sd + 3) - .5) < .022) L -= .26;
      if (noise(x * .3, y * .3, sd + 9) > .72) return rp(R('#8a7448 #ac9662 #cab682 #e0d2a4 #f0e8c8'), L, x, y, .4);
      if (D.all < 4.4) L -= .12;
      return rp(FLESH, L, x, y, .4);
    }));
    return sel(s);
  };
  const roll = o => () => {
    const s = IC(), r = o.r || 8, a = [15, 45], b = [45, 25], F = frame(a, b), len = F.len, sd = o.seed || 5;
    const inner = (x, y, D) => { let L = .62 + (noise(x * .4, y * .4, sd) - .5) * .2 - (D && D.all < 1.3 ? .16 : 0); if (o.salt && hash(x, y, sd) > .9) return [246, 244, 236]; return rp(o.inner, L, x, y, .35); };
    part(s, t => poly(t, rough(F.pts([[3, 2, 'top'], [len - 5, 2, 'top'], [len + 1, r + 7, 'bot'], [len * .6, r + 11, 'bot'], [9, r + 9, 'bot']]), 1.2, sd), (x, y, D) => { if (o.fur && D.bot < 2.4) return o.outer(x, y, .5); return inner(x, y, D); }));
    part(s, t => stroke(t, [a, b], r, (u, v, d, hw, x, y) => o.outer(x, y, .56 - v * .36 - (u < .04 ? .12 : 0), u, v)));
    part(s, t => { for (let y = Math.floor(b[1] - r - 2); y <= b[1] + r + 2; y++) for (let x = Math.floor(b[0] - r - 2); x <= b[0] + r + 2; x++) { const [q, rr] = F.inv(x, y), nq = (q - len) / (r * .46), nr = rr / r, d = Math.hypot(nq, nr); if (d > 1) continue; const ring = d * 3.4 + Math.atan2(nr, nq) / 6.283, f = ring - Math.floor(ring); t.set(x, y, d > .86 ? o.outer(x, y, .5 - nr * .3) : f < .3 ? rp(o.inner, .26, x, y, .2) : inner(x, y)); } }, { line: 0 });
    part(s, t => { for (const q of [.27, .7]) lash(t, F, len * q - 1.3, len * q + 1.3, r + .7, o.tie || C.cord, 1.7); const p = F(len * .27, -r - .5); strand(t, p, [p[0] - 5, p[1] - 3], o.tie || C.cord, .9); strand(t, p, [p[0] + 1, p[1] - 6], o.tie || C.cord, .9); }, { line: 0 });
    if (o.seal) part(s, t => { const p = F(len * .7, -r * .2); ball(t, p, 2.6, { r: C.red, d: .2, shine: 1 }); });
    return sel(s);
  };
  const leatherOuter = (R2, sp, prime) => (x, y, L, u, v) => {
    L += (noise(x * .5, y * .5, 3) - .5) * .12;
    if (prime && u !== undefined && Math.abs(v + .45) < .14) L += .22;
    if (sp.stripes && Math.sin((x - y) * .5) > .7) L -= .1;
    if (sp.scales) { const lx = ((x % 5) + 5) % 5, ly = ((y % 4) + 4) % 4; L += lx === 0 || ly === 3 ? -.2 : lx === 2 && ly === 0 ? .14 : 0; }
    if (hash(x, y, 7) > .94) L -= .08;
    return rp(R2, L, x, y, .3);
  };
  const scalePlate = () => {
    const s = IC(), R2 = FUR.croc;
    part(s, t => { for (let row = 0; row < 5; row++) for (let col = 0; col < 4; col++) { const cx = 14 + col * 11 + (row & 1) * 5.5, cy = 16 + row * 8.4; if (cx > 52) continue; poly(t, [[cx - 6, cy - 4, 'top'], [cx + 6, cy - 4, 'top'], ...qv([cx + 6, cy - 4], [cx + 6.6, cy + 6], [cx, cy + 8.4], 'bot', 5), ...qv([cx, cy + 8.4], [cx - 6.6, cy + 6], [cx - 6, cy - 4], 'top', 5)], (x, y, D) => { let L = .5 - (x - cx) * .04 - (y - cy) * .03; if (Math.abs(x - cx) < 1 && y > cy - 2) L += .2; if (D.all < 1.2) L -= .2; return rp(R2, L + (hash(x, y, 2) - .5) * .1, x, y, .3); }); } });
    return sel(s);
  };
  const MEAT = {
    red: R('#3c0c12 #5e141a #861e22 #ac2e2c #cc4a40 #e06e5c #ee9a84 #f8c8b4'),
    game: R('#2a080e #460e14 #68161a #8a2020 #a83430 #c05044 #d67664 #e8a090'),
    pork: R('#6a2a30 #8e4044 #b05a58 #cc7a72 #e09c90 #eebcb0 #f8dcd2'),
    pale: R('#8a5a52 #a87a6e #c49a8a #dab8a6 #eacfc0 #f6e6da'),
    skin: R('#7a5234 #a0744a #c29666 #dab686 #ecd2a8 #f8e8cc'),
    fat: R('#8e7a54 #b09c72 #cebc92 #e4d6b2 #f4ecd2 #fdf8ea'),
    dry: R('#2e100c #4a1c12 #6a2c1a #8a4024 #a65a34 #be7a4c #d29c6c'),
  };
  const flesh = (R2, o) => (x, y, D) => {
    o = o || {};
    const sd = o.seed || 3;
    if (o.rim && D.top < o.rim + (noise(x * .3, y * .3, sd) - .5) * 1.6) return rp(MEAT.fat, .62 + (noise(x * .5, y * .5, sd) - .5) * .3 - (D.all < 1.2 ? .2 : 0), x, y, .3);
    if (o.side && D.bot < o.side) return rp(R2, .26 + (hash(x >> 1, y, sd) - .5) * .1, x, y, .3);
    let L = .52 + (noise(x * .2, y * .2, sd) - .5) * .26 + (hash(Math.floor((x * .5 + y) * .7), sd, 2) - .5) * .08 - (x + y - 64) * .003;
    const mb = noise(x * .16 + y * .05, y * .3 - x * .08, sd + 5);
    if (o.marble && Math.abs(mb - .5) < o.marble * .5 && noise(x * .1, y * .1, sd + 2) > .4) return rp(MEAT.fat, .6, x, y, .2);
    if (Math.hypot(x - 24, y - 27) < 3.4 || Math.hypot(x - 30, y - 24) < 1.6) L += .2;
    if (D.all < 1.3) L -= .14;
    return rp(R2, L, x, y, .3);
  };
  const boneEnd = (s, p, r) => { ball(s, [p[0] - r * .5, p[1] - r * .4], r, MAT.bone); ball(s, [p[0] + r * .5, p[1] + r * .4], r, MAT.bone); };
  const boneC = (u, v, d, hw, x, y) => tone(MAT.bone, .62 - v * .3 + (hash(Math.floor(d * 1.3 + 9), 2, 3) - .5) * .1, x, y);
  const bone1 = (s, a, b, w, o) => { o = o || {}; const F = frame(a, b); part(s, t => { stroke(t, bez(a, F(F.len * .5, o.bend === undefined ? w * .5 : o.bend), b, 10), u => w * (.74 + Math.pow(Math.abs(u - .5) * 2, 2) * .4), boneC, { round: 1 }); if (o.e0 !== 0) boneEnd(t, a, w * (o.e0 || 1.1)); if (o.e1 !== 0) boneEnd(t, b, w * (o.e1 || 1.15)); }); };
  const steak = o => () => {
    const s = IC(), R2 = o.r, sd = o.seed || 3, k = o.k || 1, cx = 32, cy = 34;
    const P0 = [[-19, -3], [-14, -12], [-3, -15], [9, -11], [20, -9], [22, 2], [13, 9], [3, 15], [-11, 13], [-20, 6]].map(p => [cx + p[0] * k, cy + p[1] * k * (o.flat || .92)]);
    const pts = rough(chaikin(P0.map((p, i) => [p[0], p[1], i >= 5 && i <= 8 ? 'bot' : 'top']), 2), 1, sd);
    part(s, t => poly(t, pts.map(p => [p[0] + 1, p[1] + 4 * k, p[2]]), (x, y, D) => rp(R2, .22 + (hash(x >> 1, y, sd) - .5) * .1, x, y, .3)));
    part(s, t => poly(t, pts, flesh(R2, { seed: sd, rim: o.rim, marble: o.marble })));
    if (o.bone === 'T') part(s, t => { stroke(t, [[cx - 12 * k, cy - 6 * k], [cx + 3 * k, cy + 2 * k]], 1.8, boneC, { round: 1 }); stroke(t, [[cx - 3 * k, cy - 9 * k], [cx - 6 * k, cy + 8 * k]], 1.6, boneC, { round: 1 }); });
    if (o.bone === 'O') part(s, t => { ball(t, [cx - 4 * k, cy], 4 * k, MAT.bone); const p = [cx - 4 * k, cy]; for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0]]) t.set(p[0] + dx, p[1] + dy, MEAT.game[2]); });
    if (o.rib) part(s, t => { stroke(t, bez([cx - 14 * k, cy + 4 * k], [cx - 22 * k, cy + 12 * k], [cx - 24 * k, cy + 22 * k], 8), u => 2.2 - u * .4, boneC, { round: 1 }); ball(t, [cx - 24 * k, cy + 22 * k], 2.6, MAT.bone); });
    if (o.salt) part(s, t => { for (let y = 12; y < 56; y++) for (let x = 6; x < 60; x++) if (s.get(x, y) && s.get(x, y)[0] > 90 && (noise(x * .4, y * .4, 9) > .52 ? hash(x, y, 4) > .5 : hash(x, y, 4) > .88)) t.set(x, y, hash(x, y, 6) > .5 ? [250, 248, 242] : [214, 212, 204]); }, { line: 0 });
    return sel(s);
  };
  const haunch = o => () => {
    const s = IC(), R2 = o.r, sd = o.seed || 4, k = o.k || 1, a = [14, 52], b = [44, 20], F = frame(a, b);
    part(s, t => { stroke(t, [F(0, 0), F(F.len * .34, 0)], 2 * k + .4, boneC, { round: 0 }); boneEnd(t, F(0, 0), 2.6 * k + .4); });
    part(s, t => poly(t, rough(chaikin(F.pts([[F.len * .24, -2.4 * k, 'top'], [F.len * .46, -9 * k, 'top'], [F.len * .76, -13 * k, 'top'], [F.len * .98, -7 * k, 'top'], [F.len * 1.02, 4 * k, 'bot'], [F.len * .82, 13 * k, 'bot'], [F.len * .5, 11 * k, 'bot'], [F.len * .26, 3 * k, 'bot']]), 2), 1, sd), o.skin ? (x, y, D) => rp(MEAT.skin, .6 - (x + y - 64) * .006 + (noise(x * .3, y * .3, sd) - .5) * .14 - (D.all < 1.3 ? .16 : 0) + (hash(x, y, 3) > .93 ? -.12 : 0), x, y, .3) : flesh(R2, { seed: sd, rim: o.rim, marble: o.marble, side: 2.6 })));
    if (!o.skin) part(s, t => { const p = F(F.len * .96, -1); for (let y = -5; y <= 5; y++) for (let x = -4; x <= 4; x++) { const d = Math.hypot(x / 4.4, y / 5.4); if (d > 1) continue; t.set(p[0] + x, p[1] + y, d > .62 ? rp(MEAT.fat, .7, x, y, .2) : d > .3 ? rp(R2, .64, p[0] + x, p[1] + y, .3) : tone(MAT.bone, .7, x, y)); } }, { line: 0 });
    return sel(s);
  };
  const bird = o => () => {
    const s = IC(), R2 = MEAT.skin, k = o.k || 1, sk = (cx, cy) => (x, y, D) => rp(R2, .62 - (x - cx) * .012 - (y - cy) * .014 + (hash(x, y, 3) > .9 ? -.12 : 0) - (D.all < 1.3 ? .18 : 0), x, y, .3);
    part(s, t => { for (const sg of [-1, 1]) { stroke(t, [[32 + sg * 9 * k, 40], [32 + sg * 17 * k, 54]], u => (4.4 - u * 3) * k, (u, v, d, hw, x, y) => rp(R2, .6 - v * .3, x, y, .3), { round: 1 }); stroke(t, [[32 + sg * 17 * k, 53], [32 + sg * 19 * k, 58]], 1.1, boneC, { round: 1 }); } });
    part(s, t => poly(t, chaikin([[32 - 13 * k, 22, 'top'], [32, 16, 'top'], [32 + 13 * k, 22, 'top'], [32 + 16 * k, 36, 'bot'], [32 + 9 * k, 47, 'bot'], [32 - 9 * k, 47, 'bot'], [32 - 16 * k, 36, 'top']], 2), sk(32, 32)));
    part(s, t => { for (const sg of [-1, 1]) poly(t, chaikin([[32 + sg * 12 * k, 23, 'top'], [32 + sg * 21 * k, 27, 'top'], [32 + sg * 20 * k, 36, 'bot'], [32 + sg * 13 * k, 33, 'bot']], 2), sk(32 + sg * 16, 29)); });
    part(s, t => { for (let y = 26; y < 44; y++) t.set(32, y, R2[2]); for (const sg of [-1, 1]) for (let i = 0; i < 4; i++) t.set(32 + sg * (4 + i), 43 - i, R2[2]); t.rect(30, 13, 5, 4, MEAT.pork[2]); t.rect(30, 13, 5, 1, MEAT.pork[4]); }, { line: 0 });
    return sel(s);
  };
  const jerky = () => {
    const s = IC(), R2 = MEAT.dry;
    for (const [a, c, b, w, sd] of [[[14, 24], [22, 40], [16, 55], 3.6, 1], [[24, 20], [26, 38], [27, 56], 4, 2], [[35, 21], [39, 38], [36, 54], 3.4, 3], [[46, 23], [45, 40], [49, 53], 3.8, 4]]) part(s, t => stroke(t, bez(a, c, b, 10), u => w * (.7 + Math.sin(u * 7 + sd) * .16 + (u > .9 ? -(u - .9) * 4 : 0)), (u, v, d, hw, x, y) => { let L = .5 - v * .26 + (hash(Math.floor(d * 1.4 + 20), sd, 2) - .5) * .22 + (noise(x * .3, y * .3, sd) - .5) * .2; if (Math.abs(noise(x * .5, y * .2, sd + 4) - .5) < .04) return rp(MEAT.fat, .5, x, y, .3); return rp(R2, L, x, y, .3); }, { round: 1 }));
    part(s, t => { stroke(t, [[9, 22], [54, 22]], 1.5, cordC(C.cord, 2, 44), { round: 1 }); strand(t, [9, 22], [5, 30], C.cord, .9); strand(t, [54, 22], [58, 29], C.cord, .9); });
    return sel(s);
  };
  const scrap = o => () => {
    const s = IC(), R2 = o.r;
    part(s, t => poly(t, rough(chaikin([[20, 30, 'top'], [32, 25, 'top'], [44, 29, 'top'], [47, 38, 'bot'], [38, 45, 'bot'], [24, 43, 'bot'], [17, 37, 'top']], 2), 1.4, 9), flesh(R2, { seed: 9, side: 2.4 })));
    part(s, t => stroke(t, [[40, 33], [53, 27]], 1, boneC, { round: 1 }));
    return sel(s);
  };
  const bonePile = n => () => {
    const s = IC();
    if (n === 0) { bone1(s, [16, 46], [36, 40], 1.2, { bend: 1 }); bone1(s, [26, 50], [48, 45], 1.1, { bend: -1 }); bone1(s, [22, 36], [40, 30], 1, { bend: .6 }); part(s, t => { for (let k = 0; k < 4; k++) stroke(t, bez([38 + k * 3, 52], [41 + k * 3, 44], [45 + k * 3, 50], 6), .7, boneC, { round: 1 }); }); part(s, t => { ball(t, [20, 28], 4, MAT.bone); ball(t, [24, 30], 2.6, MAT.bone); t.set(19, 28, MAT.bone.r[1]); t.set(21, 28, MAT.bone.r[1]); }); }
    else if (n === 1) { bone1(s, [12, 44], [44, 34], 2, { bend: 2 }); bone1(s, [22, 54], [52, 46], 1.8, { bend: -1.6 }); part(s, t => { for (let k = 0; k < 3; k++) stroke(t, bez([16 + k * 6, 36], [22 + k * 6, 18 - k], [34 + k * 6, 26], 8), 1.2, boneC, { round: 1 }); }); bone1(s, [30, 46], [46, 22], 1.7, { bend: 1.4 }); }
    else if (n === 2) { part(s, t => { for (let k = 0; k < 4; k++) stroke(t, bez([10 + k * 7, 40], [18 + k * 7, 10 - k], [34 + k * 6, 24 + k * 2], 10), 1.7, boneC, { round: 1 }); stroke(t, bez([8, 42], [26, 36], [40, 44], 8), 2.4, boneC, { round: 1 }); }); bone1(s, [10, 54], [50, 42], 3.2, { bend: 2.4 }); bone1(s, [30, 58], [56, 30], 2.6, { bend: -2 }); }
    else { bone1(s, [8, 50], [54, 26], 4.6, { bend: 3, e0: 1.2, e1: 1.25 }); bone1(s, [16, 58], [58, 48], 3.4, { bend: -2 }); part(s, t => { blob(t, frame([22, 28], [23, 27]), 7, 6, MAT.bone); ball(t, [22, 28], 2.6, { r: C.dark, d: .2, shine: 0 }); for (const [dx, dy] of [[-9, -3], [8, 4], [-3, 9]]) stroke(t, [[22 + dx * .6, 28 + dy * .6], [22 + dx * 1.3, 28 + dy * 1.3]], 2, boneC, { round: 1 }); }); }
    return sel(s);
  };
  const tooth = o => () => {
    const s = IC(), a = o.a || [16, 52], c = o.c || [22, 14], b = o.b || [50, 16];
    part(s, t => stroke(t, bez(a, c, b, 16), u => o.w * (o.root ? Math.min(1, .5 + u * 3) : 1) * Math.pow(1 - u, o.pow || .6) + .5, (u, v, d, hw, x, y) => {
      let L = .62 - v * .32 + (hash(Math.floor(d * 1.2 + 20), 3, 2) - .5) * .08;
      if (o.rings && Math.floor(u * o.rings) % 2 === 0 && u < .7) L -= .07;
      if (o.root && u < .16) return rp(R('#5a3a30 #7c5444 #9c705a #b88e74'), .6 - v * .3, x, y, .3);
      if (o.ramp) return rp(o.ramp, L + (o.ridge && Math.floor(u * 22) % 2 ? .1 : 0), x, y, .25);
      return tone(MAT.bone, L + .08, x, y);
    }, { round: 1 }));
    return sel(s);
  };
  const antler = () => {
    const s = IC(), W = (w0) => u => w0 * (1 - u * .7) + .5;
    part(s, t => { stroke(t, bez([16, 56], [18, 34], [30, 20], 12), W(3.4), boneC, { round: 1 }); stroke(t, bez([30, 20], [38, 12], [50, 8], 8), W(2.4), boneC, { round: 1 }); stroke(t, bez([20, 40], [8, 32], [8, 20], 8), W(2.4), boneC, { round: 1 }); stroke(t, bez([26, 26], [22, 14], [28, 6], 8), W(2.2), boneC, { round: 1 }); stroke(t, bez([36, 15], [44, 22], [54, 22], 8), W(2), boneC, { round: 1 }); ball(t, [16, 56], 4.4, MAT.bone); });
    return sel(s);
  };
  const ORG = { heart: R('#1e0408 #380810 #561018 #781a22 #9c2a30 #bc4a48 #d87a70 #f0b4a8'), gland: R('#2a0e0c #48180e #6a2814 #8c3e20 #aa5a32 #c47c4c #dca274 #f0cca4'), pearl: R('#5a5648 #7e7a68 #a29e8a #c2c0ac #dcdccc #eeeee4 #fafaf6 #ffffff'), venom: R('#3a4420 #56642e #76863e #98a856 #b8c678 #d4dea0 #eaf0c8 #f8fbe8'), tissue: R('#4a1418 #6e2226 #923a38 #b05650 #c87a6e #dca090') };
  const wet = (R2, cx, cy, rx, ry, o) => (x, y, D) => { o = o || {}; const nx = (x + .5 - cx) / rx, ny = (y + .5 - cy) / ry, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)); let L = .44 + (nx * LV[0] + ny * LV[1] + nz * LV[2]) * .46; if (o.vein && Math.abs(noise(x * .22, y * .22, o.vein) - .5) < (o.vw || .028)) L -= .22; if (Math.hypot(nx + .36, ny + .42) < .2) L = 1; else if (Math.hypot(nx + .1, ny + .6) < .1) L = .92; if (D && D.all < 1.3) L -= .14; return rp(R2, L, x, y, .25); };
  const organs = {
    alpha_heart: () => {
      const s = IC(), H = ORG.heart;
      part(s, t => { stroke(t, bez([30, 24], [26, 12], [20, 9], 8), 3.2, (u, v, d, hw, x, y) => rp(H, .6 - v * .34, x, y, .3), { round: 0 }); stroke(t, bez([36, 22], [38, 12], [45, 10], 8), 2.8, (u, v, d, hw, x, y) => rp(ORG.tissue, .56 - v * .34, x, y, .3), { round: 0 }); stroke(t, [[33, 22], [33, 12]], 2.4, (u, v, d, hw, x, y) => rp(H, .5 - v * .34, x, y, .3), { round: 0 }); });
      part(s, t => poly(t, chaikin([[20, 24, 'top'], [31, 19, 'top'], [42, 21, 'top'], [50, 30, 'bot'], [46, 44, 'bot'], [35, 56, 'bot'], [24, 47, 'top'], [16, 34, 'top']], 3), wet(H, 33, 36, 18, 19, { vein: 5 })));
      part(s, t => { stroke(t, bez([30, 22], [38, 32], [34, 50], 10), .9, (u, v, d, hw, x, y) => rp(MEAT.fat, .5, x, y, .3)); stroke(t, bez([36, 30], [44, 30], [47, 36], 6), .7, (u, v, d, hw, x, y) => rp(MEAT.fat, .46, x, y, .3)); }, { line: 0 });
      part(s, t => { for (const [x, y] of [[30, 58], [31, 59], [38, 57]]) t.set(x, y, H[3]); }, { line: 0 });
      light(s, [33, 36], [.9, .15, .15], 16);
      return sel(s);
    },
    direwolf_hackles: () => {
      const s = IC(), Fg = FUR.dark;
      part(s, t => { for (let k = 0; k < 26; k++) { const x0 = 11 + k * 1.6, h0 = 16 + Math.sin(k * .5) * 6 + hash(k, 2, 3) * 8; stroke(t, bez([x0, 46], [x0 - 3 + hash(k, 1, 2) * 4, 46 - h0 * .6], [x0 - 7 + hash(k, 4, 2) * 5, 46 - h0], 6), u => 1.5 * (1 - u) + .4, (u, v, d, hw, x, y) => rp(FUR.grey, .3 + u * .5 + (hash(k, 7, 1) - .5) * .3 - v * .1, x, y, .3), { round: 1 }); } }, { k: .2 });
      part(s, t => poly(t, rough(chaikin([[7, 44, 'top'], [54, 42, 'top'], [57, 49, 'bot'], [32, 53, 'bot'], [9, 51, 'bot']], 2), 1.2, 4), (x, y, D) => D.top < 2.6 ? rp(Fg, .5, x, y, .4) : rp(FLESH, .5 + (noise(x * .3, y * .3, 2) - .5) * .3 - (D.all < 1.3 ? .16 : 0), x, y, .4)));
      part(s, t => { stroke(t, [[30, 40], [30, 54]], 1.4, cordC(C.sinew, 1.8, 12)); }, { line: 0 });
      return sel(s);
    },
    sabretooth_glands: () => {
      const s = IC(), Gd = ORG.gland;
      part(s, t => stroke(t, bez([22, 30], [32, 18], [43, 28], 10), 2.2, (u, v, d, hw, x, y) => rp(ORG.tissue, .5 - v * .3, x, y, .3)));
      part(s, t => poly(t, chaikin([[10, 34, 'top'], [20, 26, 'top'], [29, 32, 'bot'], [30, 46, 'bot'], [21, 55, 'bot'], [11, 48, 'top']], 3), wet(Gd, 20, 40, 11, 15, { vein: 3, vw: .05 })));
      part(s, t => poly(t, chaikin([[34, 32, 'top'], [45, 25, 'top'], [54, 33, 'bot'], [53, 46, 'bot'], [44, 53, 'bot'], [35, 45, 'top']], 3), wet(Gd, 44, 39, 11, 14, { vein: 8, vw: .05 })));
      part(s, t => { for (const [x, y] of [[16, 36], [24, 44], [40, 37], [48, 44], [19, 49]]) { t.set(x, y, Gd[1]); t.set(x + 1, y, Gd[2]); } }, { line: 0 });
      return sel(s);
    },
    owlbear_pineal: () => {
      const s = IC(), Pl = ORG.pearl;
      part(s, t => poly(t, rough(chaikin([[12, 40, 'top'], [22, 30, 'top'], [42, 30, 'top'], [53, 41, 'bot'], [46, 54, 'bot'], [20, 55, 'bot']], 2), 1.6, 3), (x, y, D) => rp(ORG.tissue, .46 + (noise(x * .3, y * .3, 4) - .5) * .4 - (D.all < 1.3 ? .16 : 0), x, y, .4)));
      part(s, t => { for (let y = 16; y <= 46; y++) for (let x = 17; x <= 47; x++) { const nx = (x + .5 - 32) / 14, ny = (y + .5 - 31) / 14, q = nx * nx + ny * ny; if (q > 1) continue; const nz = Math.sqrt(1 - q); let L = .5 + (nx * LV[0] + ny * LV[1] + nz * LV[2]) * .5; const iris = Math.hypot(nx - .12, ny - .1); let c = rp(Pl, L + Math.sin(iris * 9) * .05, x, y, .25); const tint = Math.sin((nx - ny) * 4 + 1); c = [c[0] + (tint > .3 ? 10 : -4), c[1] + (tint < -.3 ? 6 : 0), c[2] + (tint < -.3 ? 16 : 0)]; if (Math.abs(nx - .08) < .05 + (1 - Math.abs(ny - .08) * 2.6) * .05 && Math.abs(ny - .08) < .36) c = rp(Pl, .2, x, y, .2); if (Math.hypot(nx + .36, ny + .4) < .17) c = [255, 255, 255]; t.set(x, y, c, 70); } });
      light(s, [32, 31], [.9, .85, .6], 16);
      return sel(s);
    },
    venom_sac: () => {
      const s = IC(), V = ORG.venom;
      part(s, t => stroke(t, bez([34, 22], [38, 10], [48, 9], 8), u => 2.4 - u, (u, v, d, hw, x, y) => rp(ORG.tissue, .56 - v * .3, x, y, .3), { round: 1 }));
      part(s, t => poly(t, chaikin([[22, 24, 'top'], [34, 19, 'top'], [45, 27, 'bot'], [48, 42, 'bot'], [38, 55, 'bot'], [24, 53, 'bot'], [15, 40, 'top']], 3), wet(V, 32, 38, 17, 19, { vein: 6 })));
      part(s, t => { for (let y = 40; y < 53; y++) for (let x = 20; x < 46; x++) if (s.get(x, y) && s.get(x, y)[1] > 60 && y > 44 + Math.sin(x * .4) * 1.5) t.set(x, y, rp(V, .3 + (y - 44) * .012, x, y, .3)); }, { line: 0 });
      return sel(s);
    },
  };
  X.hdGoods = { FUR, spOf, furAt, rampFrom, chaikin, MEAT, flesh, boneC, bone1, boneEnd, FLESH, CURED, wet };
  makers.push(o => {
    const id = o.id, sp = spOf(id);
    if (o.group !== 'Material' && o.group !== 'Food' && o.group !== 'Consumable') return null;
    if (organs[id]) return organs[id];
    if (o.sub === 'Hide') return id === 'croc_scaled_hide' ? pelt(sp) : /^fleshed/.test(id) ? pelt(sp, { flesh: 1 }) : pelt(sp);
    if (id === 'rotten_hide') return pelt({ k: .8, fur: FUR.rat }, { rot: 1 });
    if (o.sub === 'Cured Hide') return roll({ r: 5.5 + sp.k * 3.4, fur: 1, inner: CURED, salt: 1, outer: (x, y, L) => { const c = furAt(sp, x, y, 32, 7, null); return L < .36 ? sp.fur[1] : L > .78 ? rp(sp.fur, .86, x, y, .3) : c; }, seed: Math.round(sp.k * 50) });
    if (o.sub === 'Leather') {
      if (id === 'scale_plate') return scalePlate;
      const prime = /^prime_/.test(id), base = prime ? o.id.replace('prime_', '') : id, src = X.data && X.data.find(p => p.id === base), col = hex((src && src.color) || o.color || '#8a6a44'), R2 = rampFrom(prime ? [col[0] * 1.04 + 14, col[1] * .92 + 4, col[2] * .74] : col), IN = rampFrom([col[0] * .9 + 50, col[1] * .9 + 44, col[2] * .9 + 34]);
      if (id === 'coney_fur') return roll({ r: 7, fur: 1, inner: CURED, outer: (x, y, L) => L < .36 ? FUR.tan[2] : rp(FUR.white, L + .2 + (noise(x * .9, y * .9, 3) - .5) * .3, x, y, .4), seed: 3 });
      return roll({ r: 5.6 + sp.k * 3.2 + (prime ? .6 : 0), inner: IN, outer: leatherOuter(R2, sp, prime), tie: prime ? C.red : C.cord, seal: prime, seed: Math.round(sp.k * 40) });
    }
    if (o.sub === 'Meat') {
      if (id === 'chicken_meat') return bird({ k: .86 });
      if (id === 'fowl_meat') return bird({ k: 1.04 });
      if (id === 'rabbit_meat') return haunch({ r: MEAT.pork, k: .74, seed: 6 });
      if (id === 'rat_meat') return scrap({ r: MEAT.game });
      if (id === 'venison') return haunch({ r: MEAT.game, k: 1, seed: 8 });
      if (id === 'elk_meat') return haunch({ r: MEAT.game, k: 1.14, seed: 9, rim: 2 });
      if (id === 'hippogriff_meat') return haunch({ r: MEAT.red, k: 1.1, seed: 12, marble: .02 });
      if (id === 'goat_meat') return steak({ r: MEAT.red, k: .86, rib: 1, rim: 2.4, seed: 5 });
      if (id === 'boar_meat') return steak({ r: MEAT.pork, k: .96, rib: 1, rim: 4.4, seed: 7 });
      if (id === 'bear_meat') return steak({ r: MEAT.game, k: 1.04, rim: 4.6, marble: .03, seed: 11 });
      if (id === 'aurochs_meat') return steak({ r: MEAT.red, k: 1.08, bone: 'T', rim: 2.6, marble: .045, seed: 13 });
      if (id === 'mammoth_meat') return steak({ r: MEAT.game, k: 1.22, bone: 'O', rim: 3.4, marble: .04, seed: 15 });
      if (id === 'owlbear_meat') return steak({ r: MEAT.game, k: 1.1, rim: 3, marble: .02, seed: 17, rib: 1 });
      if (id === 'sabretooth_meat') return steak({ r: MEAT.red, k: 1, seed: 19, marble: .012 });
      if (id === 'crocodile_meat') return steak({ r: MEAT.pale, k: .92, bone: 'O', seed: 21, flat: 1 });
      if (id === 'wolf_meat') return steak({ r: MEAT.game, k: .84, seed: 23 });
      if (id === 'worg_meat') return steak({ r: MEAT.game, k: .92, seed: 25, rib: 1 });
      if (id === 'salted_meat') return steak({ r: MEAT.pork, k: 1, salt: 1, seed: 27 });
      if (id === 'dried_meat') return jerky;
      return null;
    }
    if (id === 'small_bones') return bonePile(0);
    if (id === 'medium_bones') return bonePile(1);
    if (id === 'large_bones') return bonePile(2);
    if (id === 'huge_bones') return bonePile(3);
    if (id === 'great_bone') return () => { const s = IC(); bone1(s, [10, 54], [54, 12], 5, { bend: 2.6, e0: 1.25, e1: 1.3 }); return sel(s); };
    if (id === 'great_fang') return tooth({ w: 6.4, root: 1, a: [14, 50], c: [20, 12], b: [52, 14] });
    if (id === 'great_tusk' || id === 'ivory') return tooth({ w: id === 'ivory' ? 5 : 6.4, a: [8, 44], c: [30, 66], b: [58, 10], rings: 16, pow: .5 });
    if (id === 'predator_claw') return tooth({ w: 5.4, a: [20, 22], c: [50, 20], b: [40, 54], ramp: R('#0e0a08 #1c1410 #2e221a #423226 #584434 #705a46 #8a7460'), root: 1, pow: .7 });
    if (id === 'curved_horn') return tooth({ w: 6.6, a: [12, 50], c: [20, 10], b: [54, 18], ramp: R('#14100c #241c16 #382c22 #4e3e30 #665240 #806a54 #9c846c'), ridge: 1, pow: .55 });
    if (id === 'antler_rack') return antler;
    return null;
  });
})();
