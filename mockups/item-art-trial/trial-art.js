'use strict';
const TRIAL = (() => {
  const { px, ball, poly, seg, path, curve, stamp } = TK;
  const M = {
    leather: TK.ramp('#2a1810 #44281a #603a22 #7e5030 #9c6a40 #b88858'),
    hide: TK.ramp('#3a2a1a #584028 #785a38 #987648 #b6945e #d0b27c'),
    fur: TK.ramp('#5e4e3a #84725a #a8967a #c8b898 #e4d8bc'),
    steel: TK.ramp('#1e2430 #323c4c #4c5a6a #6e7e8c #96a6b0 #c2ced2 #eaf0ee'),
    iron: TK.ramp('#17181e #272a32 #3c4048 #565c64 #747c82 #98a0a2 #c0c6c4'),
    bronze: TK.ramp('#3a2610 #5c401a #826024 #a88432 #caa84a #e8cf7a'),
    wood: TK.ramp('#261a14 #3a2a1e #54402a #705638 #8e7048 #ac8c5e'),
    pale: TK.ramp('#4a3a26 #675234 #876e46 #a88c5c #c6aa78 #dfc898'),
    cord: TK.ramp('#5a4a2c #7c683c #a08850 #c4ac6c'),
    meat: TK.ramp('#3c0e16 #5e151c #861f24 #ae3230 #cf5244 #e68a70'),
    fat: TK.ramp('#8a6e58 #b4967a #d8c0a0 #f0e2c8'),
    bone: TK.ramp('#6a6050 #948a74 #beb498 #e2dac0 #f6f0de'),
    broth: TK.ramp('#3a2010 #583216 #7a481e #9c642c #bc8642'),
    carrot: TK.ramp('#8a3a10 #c05c18 #e88a2c'),
    herb: TK.ramp('#2c4a1c #47702a #6a983c'),
    string: TK.ramp('#8a8474 #c8c2b0 #ece8dc')
  };
  const UP = [0, -1], MID = [0, 0], DOWN = [1, 0], UP2 = [-1, -1], DOWN2 = [1, 1];
  const diag = (o, i) => [o[0] + i, o[1] - i];
  const tone = k => typeof k === 'function' ? k : () => k;
  const band = (s, o, from, to, off, r, k) => { for (let i = from; i <= to; i++) px(s, o[0] + i + off[0], o[1] - i + off[1], r, tone(k)(i)); };
  const frame = o => { const h = Math.SQRT1_2, F = (a, q) => [o[0] + h * (a - q), o[1] - h * (a + q)]; F.q = (x, y) => -h * (x + .5 - o[0]) - h * (y + .5 - o[1]); F.a = (x, y) => h * (x + .5 - o[0]) - h * (y + .5 - o[1]); return F; };
  const rows = (s, y0, y1, x0, x1, fn) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const c = fn(x, y); if (c) s.set(x, y, c); } };

  function boot(s, cx, top) {
    const SHAFT = [4, 5, 4, 3, 3, 2, 2, 1];
    rows(s, top + 2, top + 12, cx - 4, cx + 3, (x, y) => TK.at(M.leather, SHAFT[x - cx + 4] - (y > top + 10 ? 1 : 0)));
    ball(s, cx, top + 16.5, 5.4, 4.6, M.leather, { bias: .06 });
    rows(s, top + 20, top + 20, cx - 4, cx + 3, () => M.leather[1]);
    rows(s, top, top + 3, cx - 4, cx + 3, (x, y) => ((x + .5 - cx) / 4.3) ** 2 + ((y + .5 - top - 2) / 2.1) ** 2 <= 1 ? M.leather[0] : null);
    for (let x = cx - 4; x <= cx + 3; x++) {
      const dy = Math.round(2 * Math.sqrt(Math.max(0, 1 - ((x + .5 - cx) / 4.3) ** 2)));
      px(s, x, top + 2 - dy, M.fur, 1 + (x & 1));
      px(s, x, top + 2 + dy, M.fur, x < cx ? 4 : 3);
    }
    for (let y = top + 6; y <= top + 12; y += 2) px(s, cx - 1, y, M.cord, 3);
    px(s, cx - 3, top + 14, M.leather, 2); px(s, cx - 2, top + 14, M.leather, 2); px(s, cx + 1, top + 14, M.leather, 1);
  }
  const boots = s => { boot(s, 10, 4); boot(s, 21, 7); };

  function sword(s) {
    const o = [4, 27], g = diag(o, 8);
    band(s, o, 2, 7, UP, M.leather, i => i & 1 ? 5 : 3);
    band(s, o, 2, 7, MID, M.leather, i => i & 1 ? 3 : 2);
    band(s, o, 2, 7, DOWN, M.leather, 1);
    band(s, o, 9, 19, UP2, M.steel, 6);
    band(s, o, 9, 21, UP, M.steel, i => i > 16 ? 6 : 5);
    band(s, o, 9, 22, MID, M.steel, i => i > 17 ? 5 : 3);
    band(s, o, 9, 21, DOWN, M.steel, 4);
    band(s, o, 9, 19, DOWN2, M.steel, 2);
    px(s, ...diag(o, 23), M.steel, 6);
    for (let k = -4; k <= 3; k++) { px(s, g[0] + k, g[1] + k, M.bronze, k < 0 ? 5 : 3); px(s, g[0] + k + 1, g[1] + k, M.bronze, k < 0 ? 4 : 1); }
    ball(s, 5, 27, 2.2, 2.2, M.bronze, { bias: .08 });
  }

  const EDGE = [[17, 9.5], [19.5, 10.4], [22.5, 10.8], [25.5, 10.2], [27.5, 8.5]];
  const edgeAt = a => { const i = Math.max(1, EDGE.findIndex(p => p[0] >= a) < 0 ? EDGE.length - 1 : EDGE.findIndex(p => p[0] >= a)), p = EDGE[i - 1], q = EDGE[i]; return p[1] + (q[1] - p[1]) * clamp((a - p[0]) / (q[0] - p[0]), 0, 1); };
  const AXE = {
    steel: M.steel,
    head: [[24.8, 1.4], ...EDGE.slice().reverse(), [19.4, 5.6], [21.4, 3], [21.8, 1.4]],
    socket: [[21.2, -1.8], [25.4, -1.8], [25.4, 1.8], [21.2, 1.8]],
    headTone(a, q) { const d = edgeAt(a) - q; return d < 1.1 ? 6 : d < 2.5 ? 5 : q < 3.2 ? 2 : a > 23.6 ? 4 : 3; },
    socketTone: q => q > .4 ? 4 : q > -.8 ? 3 : 1
  };
  function axe(s) {
    const o = [8, 27], F = frame([8.5, 27.5]);
    band(s, o, 0, 19, MID, M.wood, 5);
    band(s, o, 0, 19, DOWN, M.wood, 2);
    band(s, o, 1, 4, MID, M.leather, i => i & 1 ? 4 : 2);
    band(s, o, 1, 4, DOWN, M.leather, 1);
    poly(s, AXE.head.map(p => F(p[0], p[1])), (x, y) => TK.at(M.steel, AXE.headTone(F.a(x, y), F.q(x, y))));
    poly(s, AXE.socket.map(p => F(p[0], p[1])), (x, y) => TK.at(M.steel, AXE.socketTone(F.q(x, y))));
  }

  function helm(s) {
    const rim = x => 19.5 + 3.2 * Math.sqrt(Math.max(0, 1 - ((x + .5 - 16) / 10) ** 2));
    ball(s, 16, 13.5, 10, 10.5, M.iron, { clip: (x, y) => y <= rim(x), amp: 1.3, bias: -.04 });
    for (let x = 6; x <= 25; x++) {
      const y = Math.round(rim(x));
      px(s, x, y - 1, M.bronze, x < 11 ? 5 : x < 19 ? 4 : 2);
      px(s, x, y, M.bronze, x < 11 ? 3 : x < 19 ? 2 : 1);
      if (x % 3 === 1) px(s, x, y - 1, M.bronze, 0);
    }
    for (let y = 4; y <= 20; y++) { px(s, 15, y, M.iron, y < 13 ? 6 : 5); px(s, 16, y, M.iron, 2); }
    rows(s, 23, 29, 15, 16, (x, y) => TK.at(M.iron, x === 15 ? 5 : 2));
    rows(s, 28, 29, 14, 17, (x, y) => TK.at(M.iron, x < 16 ? 4 : 1));
  }

  const TORSO = [[9, 12, 19, 22], [8, 13, 18, 23], [7, 13, 18, 24], [7, 24], [7, 24], [8, 23], [8, 23], [8, 23], [7, 24], [7, 24], [7, 24], [7, 24], [7, 24], [7, 24], [8, 23], [8, 23], [9, 22], [9, 22], [9, 22], [8, 23], [8, 23], [8, 23], [7, 24], [7, 24], [7, 24]];
  function cuirass(s) {
    const plate = (x, y) => {
      const nx = (x + .5 - 16) / 10.5, ny = (y + .5 - 13) / 17, nz = Math.sqrt(Math.max(.05, 1 - nx * nx - ny * ny * .5));
      return TK.shade(M.steel, .34 + (nx * LV[0] + ny * LV[1] * .6 + nz * LV[2]) * .66, x, y, .2);
    };
    rows(s, 4, 6, 14, 17, (x, y) => TK.at(M.steel, y === 4 ? 3 : 1));
    TORSO.forEach((r, j) => { for (let k = 0; k < r.length; k += 2) rows(s, 4 + j, 4 + j, r[k], r[k + 1], plate); });
    for (let x = 14; x <= 17; x++) px(s, x, 7, M.steel, x < 16 ? 6 : 5);
    for (let y = 8; y <= 21; y++) { px(s, 15, y, M.steel, 6); px(s, 16, y, M.steel, 1); }
    for (const [y, x0, x1] of [[22, 9, 22], [25, 8, 23]]) for (let x = x0; x <= x1; x++) { px(s, x, y, M.steel, 1); px(s, x, y + 1, M.steel, x < 15 ? 6 : x < 20 ? 4 : 3); }
    for (const x of [10, 21]) px(s, x, 20, M.bronze, x < 16 ? 5 : 3);
  }

  function bow(s) {
    const limb = [...curve([3, 24], [4.5, 26.5], [6.5, 21], 4), ...curve([6.5, 21], [7, 13], [11, 11], 5).slice(1), ...curve([11, 11], [13, 7], [21, 6.5], 5).slice(1), ...curve([21, 6.5], [26.5, 4.5], [24, 3], 4).slice(1)];
    path(s, limb, t => .9 + .6 * Math.sin(Math.PI * t), (t, u) => TK.at(M.wood, u > .1 ? 2 : t < .1 || t > .9 ? 4 : 5));
    path(s, limb.slice(7, 12), 1.7, (t, u) => TK.at(M.leather, u > 0 ? 1 : 4));
  }
  const bowString = s => { for (let i = 0; i <= 19; i++) px(s, 5 + i, 25 - i, M.string, i % 5 === 2 ? 2 : 1); };

  function hoe(s) {
    const o = [3, 26], F = frame([3.5, 26.5]);
    band(s, o, 0, 17, MID, M.pale, 5);
    band(s, o, 0, 17, DOWN, M.pale, 2);
    poly(s, [[19.4, -.4], [24.8, -.4], [22, -10.6], [16.6, -10.6]].map(p => F(p[0], p[1])), (x, y) => { const q = F.q(x, y), a = F.a(x, y) + q * .27; return TK.at(M.steel, q < -9 ? 6 : a > 23.4 ? 5 : a < 20.6 ? 2 : q > -2.2 ? 2 : 4); });
    band(s, o, 14, 16, UP, M.steel, 5);
    band(s, o, 14, 16, MID, M.steel, 3);
    band(s, o, 14, 16, DOWN, M.steel, 1);
  }

  function belt(s) {
    const out = (x, y) => ((x + .5 - 15) / 11) ** 2 + ((y + .5 - 13.5) / 7.5) ** 2, hole = (x, y) => ((x + .5 - 15) / 8.6) ** 2 + ((y + .5 - 12.3) / 4.6) ** 2;
    rows(s, 5, 22, 3, 27, (x, y) => {
      if (out(x, y) > 1 || hole(x, y) <= 1) return null;
      if (y < 12 && Math.abs(x - 15) < 9) return TK.at(M.leather, hole(x, y + 1) <= 1 ? 0 : x < 13 ? 2 : 1);
      return TK.at(M.leather, hole(x, y - 1) <= 1 ? 5 : x < 9 ? 4 : x < 19 ? 3 : 2);
    });
    for (let x = 6; x <= 24; x += 3) { const ys = []; for (let y = 13; y <= 22; y++) if (out(x, y) <= 1 && hole(x, y) > 1) ys.push(y); if (ys.length > 2) px(s, x, ys[ys.length >> 1], M.cord, 3); }
    stamp(s, 8, 16, [' 555 ', '5   4', '5 4 4', '4   2', ' 322 '], { 5: M.bronze[5], 4: M.bronze[4], 3: M.bronze[3], 2: M.bronze[2] });
    seg(s, [22.2, 18.5], [20.4, 28], t => 2.1 - t * .7, (t, u) => TK.at(t < .14 ? M.bronze : t > .9 ? M.bronze : M.hide, t < .14 || t > .9 ? (u < 0 ? 5 : 3) : u < -.3 ? 3 : u < .4 ? 2 : 1));
    rows(s, 16, 18, 21, 23, (x, y) => TK.at(M.leather, x === 21 ? 5 : 4));
    rows(s, 19, 19, 20, 23, () => M.leather[0]);
  }

  function pack(s) {
    for (const x of [8, 22]) rows(s, 4, 29, x, x + 1, (qx, y) => TK.at(M.pale, qx === x ? 5 : 2));
    rows(s, 7, 8, 8, 23, (x, y) => TK.at(M.pale, y === 7 ? 5 : 3));
    rows(s, 27, 27, 10, 21, () => M.pale[2]);
    ball(s, 16, 18, 6.8, 8.6, M.hide, { amp: .9, bias: .02 });
    rows(s, 2, 6, 9, 22, (x, y) => (x === 9 || x === 22) && (y === 2 || y === 6) ? null : TK.at(M.fur, y === 2 ? 4 : y === 3 ? 4 : y === 4 ? 3 : y === 5 ? 2 : 1));
    for (const x of [12, 19]) rows(s, 2, 6, x, x, (qx, y) => TK.at(M.cord, y < 4 ? 3 : 1));
    rows(s, 10, 16, 10, 21, (x, y) => {
      const edge = 16 - Math.round(2.4 * ((x - 15.5) / 6) ** 2 * 2.2), inside = ((x + .5 - 16) / 6.8) ** 2 + ((y + .5 - 18) / 8.6) ** 2 <= 1;
      return !inside || y > edge ? null : TK.at(M.leather, y === edge ? 1 : y === edge - 1 ? 3 : x < 14 ? 5 : x < 18 ? 4 : 3);
    });
    rows(s, 13, 21, 15, 16, (x, y) => TK.at(M.leather, x === 15 ? 2 : 0));
    rows(s, 17, 18, 14, 17, (x, y) => TK.at(M.bronze, y === 17 ? 5 : 3));
    for (const [x, y] of [[10, 12], [21, 12], [10, 23], [21, 23]]) { px(s, x, y, M.cord, 3); px(s, x, y + 1, M.cord, 1); }
  }

  function shield(s) {
    const at = (x, y, rx, ry, cy) => ((x + .5 - 16) / rx) ** 2 + ((y + .5 - (cy || 15.5)) / ry) ** 2;
    rows(s, 5, 28, 3, 28, (x, y) => at(x, y, 12, 10.5, 17) <= 1 ? M.wood[0] : null);
    rows(s, 4, 27, 3, 28, (x, y) => {
      const q = at(x, y, 12, 10.5);
      if (q > 1) return null;
      if (q > .8) return TK.at(M.hide, x + y < 27 ? 5 : x + y < 36 ? 3 : 1);
      const plank = Math.floor((x + 1) / 4), seam = (x + 1) % 4 === 0;
      return TK.at(M.pale, seam ? 1 : (plank & 1 ? 3 : 4) + (x + y < 26 ? 1 : x + y > 38 ? -1 : 0));
    });
    ball(s, 16, 15.5, 4.4, 3.9, M.iron, { amp: .4, bias: -.16 });
    ball(s, 16, 15.2, 3, 2.7, M.iron, { amp: 1.1, bias: .1 });
    for (const [x, y] of [[16, 8], [8, 15], [23, 15], [16, 22]]) px(s, x, y, M.iron, 5);
  }

  function venison(s) {
    ball(s, 13.5, 15, 9.2, 7.6, M.meat, { amp: .95 });
    ball(s, 21, 20, 5.4, 4.2, M.meat, { amp: .8, bias: -.04 });
    rows(s, 7, 14, 4, 20, (x, y) => { const nx = (x + .5 - 13.5) / 9.2, ny = (y + .5 - 15) / 7.6, q = nx * nx + ny * ny; return q <= 1 && q > .68 && nx * LV[0] + ny * LV[1] > .52 ? TK.at(M.fat, q > .86 ? 2 : 3) : null; });
    seg(s, [23.5, 21.5], [27.5, 25.5], 1.3, (t, u) => TK.at(M.bone, u < 0 ? 4 : 2));
    ball(s, 27.6, 24.6, 1.9, 1.9, M.bone, { bias: .12 });
    ball(s, 26.2, 26.8, 1.9, 1.9, M.bone, { bias: .04 });
    rows(s, 11, 19, 5, 10, (x, y) => ((x + .5 - 7.8) / 2.9) ** 2 + ((y + .5 - 15.3) / 4.2) ** 2 <= 1 ? TK.at(M.meat, x < 7 ? 5 : 4) : null);
    stamp(s, 6, 13, [' f ', 'fbf', ' f ', '  f'], { f: M.fat[3], b: M.bone[1] });
    for (const [x, y] of [[13, 11], [14, 11], [15, 12], [17, 14], [18, 14]]) px(s, x, y, M.meat, 5);
  }

  function stew(s) {
    ball(s, 16, 14, 11, 11.4, M.wood, { clip: (x, y) => y >= 14, amp: .9, bias: .05 });
    rows(s, 25, 25, 12, 19, x => TK.at(M.wood, x < 15 ? 2 : 1));
    rows(s, 8, 20, 4, 27, (x, y) => { const q = ((x + .5 - 16) / 11) ** 2 + ((y + .5 - 14) / 5.6) ** 2; return q > 1 ? null : TK.at(M.wood, y < 14 ? (x < 14 ? 4 : 3) : x < 12 ? 5 : x < 21 ? 4 : 3); });
    rows(s, 9, 19, 6, 25, (x, y) => { const q = ((x + .5 - 16) / 9.2) ** 2 + ((y + .5 - 14.3) / 4.1) ** 2; return q > 1 ? null : TK.at(M.broth, q > .78 && y < 14 ? 1 : x + y < 26 ? 3 : 2); });
    stamp(s, 9, 12, ['   mm    cc  ', ' cc mM  p    ', ' cC   hh  mm ', '    pp h  Mm '], { m: M.broth[1], M: M.broth[0], c: M.carrot[1], C: M.carrot[2], p: M.fat[2], h: M.herb[2] });
    for (const x of [12, 13, 14]) px(s, x, 11, M.broth, 4);
  }

  const ITEMS = [
    { id: 'hide_boots', label: 'Boots', draw: boots },
    { id: 'steel_longsword', label: 'Sword', draw: sword },
    { id: 'bearded_axe', label: 'Axe', draw: axe },
    { id: 'iron_nasal_helm', label: 'Helm', draw: helm },
    { id: 'plate_cuirass', label: 'Cuirass', draw: cuirass },
    { id: 'hunting_recurve', label: 'Bow', draw: bow, over: bowString },
    { id: 'steel_hoe', label: 'Hoe', draw: hoe },
    { id: 'leather_sword_belt', label: 'Belt', draw: belt },
    { id: 'framed_leather_pack', label: 'Framed pack', draw: pack },
    { id: 'plank_round_shield', label: 'Shield', draw: shield },
    { id: 'venison', label: 'Raw meat', draw: venison },
    { id: 'small_stew', label: 'Stew', draw: stew }
  ];

  const CRISP_EDGE = { even: true, k: .55 };
  function crispIcon(it) {
    const s = TK.outline(TK.crisp(it.draw, 32, 32), CRISP_EDGE);
    if (it.over) it.over(s);
    return s;
  }
  return { ITEMS, crispIcon, AXE };
})();
