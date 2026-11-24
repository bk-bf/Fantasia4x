'use strict';
(() => {
  const X = DBX, INK = dark(P.oak[0], .5);
  const C = {
    barley: R('#5a4a1c #7c6624 #a0862e #c4a83c #dcc65a #f0e08c'),
    rye: R('#4c4a30 #68643c #86804a #a69c5c #c2b878 #dcd49c'),
    ryeStem: R('#2e3d2c #40543a #557048 #6e8a5a #8aa472'),
    kale: R('#12281c #1b3b26 #285231 #3a6b3f #548652 #7da56c'),
    cabbage: R('#1f3a2c #2c5238 #3f6c45 #588a54 #7aa868 #a3c688'),
    onion: R('#274a3a #356348 #4a7e58 #67996c #8cb488'),
    bulb: R('#6a4a1e #8e682a #b48a3a #d4ac56 #ecd088'),
    radish: R('#5a1a26 #862838 #b23e4c #d2606a #ea9296'),
    turnip: R('#4a2052 #6a2f72 #8c4a94 #b074b4'),
    pea: R('#24462a #33602f #4a7e3a #68994a #8cb460 #b4d084'),
    bean: R('#1e3a22 #2b5228 #3e6c30 #568740 #74a254'),
    vine: R('#1c3418 #294a1e #3a6426 #527f30 #70993e #94b356'),
    grape: R('#1e1030 #33194e #4c2670 #6a3c92 #8e5eb2 #b890d0'),
    cane: R('#4a5a1e #647a26 #82982e #a4b440 #c2cc62 #dce090'),
    caneLeaf: R('#234a22 #2f642a #418034 #5a9c42 #7cb656'),
    cotton: R('#1e3626 #2a4c30 #3a663c #50804a #6c9a5e'),
    thyme: R('#2c4034 #3d5842 #527252 #6c8c66 #8ca682'),
    mint: R('#1a4a34 #246440 #32804e #4a9c60 #6cb87a #98d09c'),
    dream: R('#2e4840 #436258 #5e8074 #82a094 #a9bfb2 #d0dcd2 #eef2ea'),
    lilac: R('#5a4a7a #7a66a0 #a08cc4 #c8b8e4'),
    sandstone: R('#3a2c22 #54402e #6f573c #8c704c #a88b60 #c2a67a #d9c298'),
    peat: R('#140f0b #201812 #2e221a #3e2e22 #52402e'),
    fireclay: R('#6a5236 #8a6e48 #aa8c5e #c6aa78 #dcc696 #eedcb4'),
    egg: R('#4a5a48 #6a7c62 #8c9e80 #b0c0a0 #d4dcc0'),
    eggBlue: R('#46606a #62828c #84a4aa #a8c4c6 #cfe0dc'),
  };
  const px = (s, x, y, ramp, k, e) => s.set(x, y, ramp[clamp(k, 0, ramp.length - 1)], e);
  const blade = (s, x, y, h, lean, ramp, k) => { for (let j = 0; j < h; j++) px(s, x + Math.round(lean * j * j / Math.max(1, h)), y - j, ramp, k + (j > h - 3 ? 1 : 0) - (j < 2 ? 1 : 0)); };
  const leaf = (s, x0, y0, ang, len, wid, ramp, k, o) => {
    o = o || {};
    const ca = Math.cos(ang), sa = Math.sin(ang), n = ramp.length - 1;
    for (let y = Math.floor(y0 - len - 1); y <= y0 + len + 1; y++) for (let x = Math.floor(x0 - len - 1); x <= x0 + len + 1; x++) {
      const dx = x + .5 - x0, dy = y + .5 - y0, u = (dx * ca + dy * sa) / len, v = (-dx * sa + dy * ca);
      if (u < 0 || u > 1) continue;
      const hw = o.round ? wid * .5 * Math.sqrt(Math.max(0, 1 - Math.pow((u - .58) / (u < .58 ? .58 : .42), 2))) : wid * Math.pow(Math.sin(Math.PI * Math.pow(u, o.tipBias || .8)), .8) * .5;
      if (Math.abs(v) > hw + .15) continue;
      let kk = k + (v * (ca >= 0 ? 1 : -1) < -.3 || (Math.abs(ca) < .3 && v * sa > .3) ? 1 : 0) + (Math.abs(v) < .5 && wid > 2.4 && !o.noRib ? (o.rib === undefined ? -1 : o.rib) : 0) + (u > .82 ? 1 : 0);
      if (o.ruffle && Math.abs(v) > hw - .9) kk += ((Math.floor(u * len * 1.3) & 1) ? 1 : -1);
      s.set(x, y, ramp[clamp(kk, 0, n)], o.e);
    }
  };
  const dots = (s, r, n, x0, y0, w, h, fn) => { for (let i = 0, t = 0; i < n && t < n * 30; t++) { const x = Math.floor(x0 + r() * w), y = Math.floor(y0 + r() * h); if (s.get(x, y) && s.get(x + 1, y + 1) && s.get(x, y) !== INK) { fn(x, y, i); i++; } } };
  const berry = (s, x, y, ramp) => { const n = ramp.length - 1; s.set(x, y, ramp[n]); s.set(x + 1, y, ramp[n - 1]); s.set(x, y + 1, ramp[n - 2]); s.set(x + 1, y + 1, ramp[Math.max(0, n - 3)]); };
  const finish = (s, season, sh, sway, snow) => {
    if (season === 'winter' && snow !== 0) s.snowCap(snow || 1, .4);
    s.outline(INK);
    if (sh) s.sh = { rx: sh * 1.2, ry: sh * .42, dx: 4, dy: 0, k: .8 };
    if (sway) s.sway = sway;
    return s;
  };
  const fallOf = (ramp, season, to) => season === 'autumn' ? (to || P.fallYellow) : ramp;

  const HEADS = {
    barley(s, x, y, r) { for (let j = 0; j < 6; j++) { px(s, x, y + j, C.barley, 4 - (j > 3 ? 1 : 0)); px(s, x + 1, y + j, C.barley, 3 - (j & 1)); } for (let a = 0; a < 3; a++) { const d = a - 1; for (let j = 1; j < 5 + (a === 1 ? 1 : 0); j++) px(s, x + d * Math.ceil(j * .5) + (d > 0 ? 1 : 0), y - j, C.barley, 5 - (j > 3 ? 1 : 0)); } },
    rye(s, x, y, r) { const d = r() < .5 ? -1 : 1; for (let j = 0; j < 8; j++) { const xx = x + (j < 3 ? d : 0); px(s, xx, y + j, C.rye, 5 - (j > 5 ? 1 : 0) - (j & 1)); if (j % 2 === 0 && j < 7) px(s, xx + d, y + j, C.rye, 3); } px(s, x + d, y - 1, C.rye, 4); px(s, x + d * 2, y - 2, C.rye, 5); },
  };
  const nodding = (s, x0, by, h, d, stem, head, long) => {
    let x = x0, y = by, tx = x0, ty = by;
    for (let j = 0; j < h; j++) { const u = j / h; x = x0 + d * u * u * 5; y = by - j; px(s, x, y, stem, 1 + (j > h * .5 ? 1 : 0)); tx = x; ty = y; }
    for (let j = 0; j < 6; j++) { const hx = tx + d * (1 + j * .7), hy = ty - 1 - j * .55; px(s, hx, hy, head, 4 - (j & 1)); px(s, hx, hy + 1, head, 2); }
    const ex = tx + d * 5.2, ey = ty - 4.3;
    for (let a = -1; a <= 1; a++) for (let j = 1; j < long; j++) px(s, ex + d * j * .8, ey - j * (.5 + a * .45), head, 5 - (j > long - 3 ? 1 : 0));
  };
  const stalk = (s, x, by, h, lean, stem, head, r) => {
    for (let j = 0; j < h; j++) px(s, x + lean * j, by - j, stem, j < h - 6 ? 1 + (Math.round(x) & 1) : 2);
    head(s, Math.round(x + lean * h), by - h - 6, r);
  };
  const wildGrain = (kind, stem) => (seed, season) => {
    const s = new Spr(40, 48, 20, 40), B = 40, r = rng(seed * 11 + kind.length);
    for (let i = 0; i < 9; i++) blade(s, 9 + i * 2.6 + r() * 2, B, 5 + r() * 5, (r() - .5) * .6, season === 'summer' ? P.grassLoam : P.grassDry, 2);
    const list = [], head = kind === 'barley' ? C.barley : C.rye, st = season === 'summer' ? stem : C.barley;
    for (let i = 0; i < 8; i++) list.push([14 + i * 1.7 + r(), B - (i % 3), (kind === 'rye' ? 21 : 16) + Math.floor(r() * 8), i < 4 ? -1 : 1]);
    for (const i of [3, 4, 2, 5, 1, 6, 0, 7]) { const [x, by, h, d] = list[i]; nodding(s, x, by, h, d * (.4 + Math.abs(i - 3.5) * .28), st, head, kind === 'barley' ? 7 : 4); }
    return finish(s, season, 8, 2.4);
  };
  HEADS.wheat = (s, x, y, r) => { const c = P.savanna, n = c.length - 1; for (let j = 0; j < 6; j++) { px(s, x, y + j, c, n - (j > 3 ? 1 : 0)); if (j % 2 === 0 && j < 5) { px(s, x - 1, y + j + 1, c, n - 1); px(s, x + 1, y + j + 1, c, n - 2); } } px(s, x, y - 1, c, n); };
  const grainCrop = (kind, stem, green) => (seed, season) => {
    const s = new Spr(34, 50, 17, 42), B = 42, r = rng(seed * 7 + 1 + kind.length), list = [];
    for (let row = 0; row < 4; row++) { const n = 7 + Math.floor(r() * 3), wob = (r() - .5) * 3; for (let i = 0; i < n; i++) { if (r() < .07) continue; list.push([2.5 + i * (29 / (n - 1)) + (r() - .5) * 2.4, B - 24 + row * 8 + wob + (r() - .5) * 3, 10 + Math.floor(r() * 8), (r() - .5) * .34, r()]); } }
    list.sort((a, b) => a[1] - b[1]);
    for (const [x, by, h, lean, q] of list) { if (q < .06) { for (let j = 0; j < h * .5; j++) px(s, x + lean * j, by - j, stem, 1); for (let j = 0; j < 5; j++) px(s, x + lean * h * .5 + (lean < 0 ? -j : j), by - h * .5 + j * .5, stem, 2); continue; } stalk(s, x, Math.round(by), h, lean, q > .86 && green ? green : stem, HEADS[kind], r); }
    weeds(s, r, B, 3);
    s.sway = 2.4;
    if (season === 'winter') s.snowCap(1, .5);
    return s.outline(dark(P.tilled[0], .6));
  };
  const kale = (s, x, y, r, sz) => {
    for (let i = 0; i < 9; i++) { const a = -Math.PI * (.1 + (i * 5 % 9) / 8 * .8), l = sz * (.75 + r() * .4); leaf(s, x + Math.cos(a) * 1.5, y, a, l, 4.2, C.kale, 3 - (i < 3 ? 1 : 0), { ruffle: 1 }); }
    for (let i = 0; i < 4; i++) { const a = -Math.PI * (.3 + i * .14); s.line(x, y, x + Math.cos(a) * sz * .55, y + Math.sin(a) * sz * .55, hex('#a9c48f')); }
  };
  const rosette = (s, x, y, r, o) => {
    const order = [];
    for (let i = 0; i < o.n; i++) order.push(i / o.n * 6.283 + (o.turn || 0) + (r() - .5) * .25);
    order.sort((a, b) => Math.sin(a) - Math.sin(b));
    for (const a of order) { const sq = Math.sin(a) < 0 ? .62 : .8, l = o.len * (.85 + r() * .3) * (Math.abs(Math.cos(a)) * (1 - sq) + sq); leaf(s, x + Math.cos(a) * 1.2, y + Math.sin(a) * .8, a, l, o.wid, o.ramp, (o.k === undefined ? 3 : o.k) - (Math.sin(a) > .5 ? 1 : 0), o); }
  };
  const vleaf = (s, x, y, ramp, k, big) => {
    const rows = big ? [[1, 2], [0, 3], [0, 4], [1, 4], [2, 2]] : [[1, 1], [0, 2], [0, 3], [1, 2]];
    rows.forEach(([a, b], j) => { for (let i = a; i <= b; i++) px(s, x + i, y + j, ramp, k + (j === 0 || i === a ? 1 : 0) - (i === b && j > 0 ? 1 : 0) - (j === rows.length - 1 ? 1 : 0)); });
    if (big) px(s, x + 2, y + 2, ramp, k - 1);
  };
  const leafMound = (s, cx, by, w, h, ramp, r, n, big) => {
    const l = [];
    for (let i = 0; i < n; i++) { const a = r() * 3.1416, d = Math.sqrt(r()); l.push([cx + Math.cos(a) * w * d, by - Math.sin(a) * h * d]); }
    l.sort((a, b) => a[1] - b[1]);
    for (const [x, y] of l) { const lit = clamp((cx - x) / w * .9 + (by - y) / h * 1.5, -1, 2); vleaf(s, Math.round(x) - 2, Math.round(y) - 3, ramp, Math.round(2.4 + lit), big); }
  };
  const cabbage = (s, x, y, r, sz, tight) => {
    const n = C.cabbage.length - 1;
    for (let a = 0; a < 7; a++) { const t = a / 7 * 6.283 + .4; s.ball(x + Math.cos(t) * sz, y + Math.sin(t) * sz * .72, sz * .78, sz * .6, 0, C.cabbage, { bias: -.16, d: .2, amp: .7 }); }
    if (tight) s.ball(x, y - 1, sz, sz * .86, 2, C.cabbage, { bias: .16, d: .2 }); else for (let a = 0; a < 4; a++) { const t = a / 4 * 6.283 + 1; s.ball(x + Math.cos(t) * sz * .4, y - 1 + Math.sin(t) * sz * .3, sz * .6, sz * .48, 2 + a * .1, C.cabbage, { bias: .08 + a * .03, d: .2, amp: .8 }); }
    s.line(x - 2, y - 2, x + 1, y + 1, C.cabbage[n - 2]); s.set(x - 1, y - 3, C.cabbage[n]);
  };
  const rootPlant = (s, x, y, r, o) => {
    for (let a = 0; a < o.leaves; a++) { const t = -Math.PI * (.14 + (a * 3 % o.leaves) / (o.leaves - 1) * .72), l = o.len * (.75 + r() * .45); leaf(s, x, y - 1, t, l, o.wid, o.leaf, o.k === undefined ? 3 : o.k, { ruffle: o.ruffle }); }
    s.ball(x, y, o.rx, o.ry, 3, o.root, { bias: .12, d: .2 });
    if (o.under) for (let i = -1; i <= 1; i++) s.set(x + i, y + Math.round(o.ry) - 1, o.under[i < 0 ? 4 : 3]);
  };
  const onion = (s, x, y, r, tall, flower) => {
    for (let a = 0; a < 5; a++) { const lean = (a - 2) * .16 + (r() - .5) * .1, h = tall * (.7 + r() * .4), bend = r() < .35; for (let j = 0; j < h; j++) { const xx = x + lean * j * (bend && j > h * .7 ? 2.2 : 1), yy = y - 2 - j + (bend && j > h * .7 ? (j - h * .7) * 1.2 : 0); px(s, xx, yy, C.onion, 2 + (a & 1) + (j > h - 3 ? 1 : 0)); if (j < 3) px(s, xx + 1, yy, C.onion, 1); } }
    s.ball(x, y, 2.6, 2.2, 3, C.bulb, { bias: .12, d: .2 });
    if (flower) { for (let j = 0; j < tall + 3; j++) px(s, x + 1, y - 2 - j, C.onion, 3); s.ball(x + 1, y - tall - 6, 3, 2.8, 4, C.lilac, { d: .3, bias: .1, n: .5, ns: 1.7, seed: x }); px(s, x, y - tall - 8, P.cloth, 5); px(s, x + 2, y - tall - 6, P.cloth, 5); }
  };
  const pod = (s, x, y, ramp, len) => { for (let j = 0; j < len; j++) px(s, x, y + j, ramp, ramp.length - 1 - (j > len - 2 ? 2 : j ? 1 : 0)); px(s, x + 1, y + 1, ramp, ramp.length - 3); };
  const tangle = (s, cx, B, r, ramp, o) => {
    canopy(s, cx, B - o.h * .5, o.w, o.h * .5, ramp, o.seed, { cr: o.cr || 2.6, n: o.n });
    for (let i = 0; i < (o.tendrils || 0); i++) { const x = cx + (r() - .5) * o.w * 1.6, y0 = B - o.h * (.6 + r() * .4), d = r() < .5 ? -1 : 1; for (let j = 0; j < 6; j++) px(s, x + d * Math.round(Math.sin(j * .9) * 1.6 + j * .4), y0 - j, ramp, ramp.length - 2); }
  };
  const trellis = (s, B, posts, wires, top) => {
    for (const x of posts) { s.rect(x, B - top, 2, top + 1, P.plank[2]); s.rect(x, B - top, 1, top + 1, P.plank[4]); s.set(x, B - top - 1, P.plank[5]); s.set(x + 1, B - top - 1, P.plank[3]); }
    for (const wy of wires) for (let x = posts[0]; x <= posts[posts.length - 1] + 1; x++) if (!s.get(x, B - wy)) s.set(x, B - wy, P.wicker[(x & 3) === 0 ? 2 : 3]);
  };
  const bunch = (s, x, y, ramp) => { const n = ramp.length - 1; for (const [dx, dy, k] of [[0, 0, n - 1], [1, 0, n - 2], [2, 0, n - 3], [-1, 1, n - 1], [0, 1, n], [1, 1, n - 2], [2, 1, n - 3], [3, 1, n - 4], [0, 2, n - 1], [1, 2, n - 2], [2, 2, n - 4], [0, 3, n - 2], [1, 3, n - 3], [2, 3, n - 4], [1, 4, n - 3], [1, 5, n - 4]]) px(s, x + dx, y + dy, ramp, k); s.set(x + 1, y - 1, P.wood[3]); };

  const WILD = {
    wild_barley: wildGrain('barley', P.savanna),
    wild_rye: wildGrain('rye', C.ryeStem),
    wild_cabbage(seed, season) {
      const s = new Spr(40, 40, 20, 34), B = 34, r = rng(seed * 5 + 2);
      rosette(s, 20, B - 6, r, { n: 8, len: 10, wid: 8, ramp: C.cabbage, k: 2, rib: 2, turn: .3, round: 1 });
      s.ball(20, B - 7, 3.4, 2.8, 4, C.cabbage, { bias: .2, d: .2 });
      for (let j = 0; j < 13; j++) px(s, 22 + (j > 8 ? 1 : 0), B - 9 - j, C.cabbage, 3 + (j & 1));
      for (const [dx, dy] of [[0, 0], [2, 1], [-2, 2], [1, -2], [3, 3], [-1, 4]]) { s.set(22 + dx, B - 24 + dy, P.gold[4]); s.set(23 + dx, B - 24 + dy, P.gold[3]); }
      return finish(s, season, 9, 1.2);
    },
    wild_kale(seed, season) {
      const s = new Spr(40, 40, 20, 34), B = 34, r = rng(seed * 5 + 3);
      kale(s, 20, B - 1, r, 14);
      return finish(s, season, 8, 1.4);
    },
    wild_turnip(seed, season) {
      const s = new Spr(40, 40, 20, 34), B = 34, r = rng(seed * 5 + 4);
      rootPlant(s, 14, B - 3, r, { leaves: 7, len: 12, wid: 4, leaf: P.ash, root: C.turnip, rx: 4.2, ry: 3.4, under: P.cloth });
      rootPlant(s, 27, B - 1, r, { leaves: 6, len: 10, wid: 3.6, leaf: P.ash, root: C.turnip, rx: 3.6, ry: 3, under: P.cloth });
      return finish(s, season, 9, 1.2);
    },
    wild_radish(seed, season) {
      const s = new Spr(40, 40, 20, 34), B = 34, r = rng(seed * 5 + 5);
      for (const [x, y] of [[11, B - 3], [20, B - 1], [29, B - 3]]) rootPlant(s, x + (r() - .5) * 2, y, r, { leaves: 5, len: 8, wid: 3.4, leaf: P.birchLeaf, root: C.radish, rx: 2.8, ry: 2.6, under: P.cloth, k: 2 });
      return finish(s, season, 9, 1.2);
    },
    wild_onion(seed, season) {
      const s = new Spr(40, 44, 20, 38), B = 38, r = rng(seed * 5 + 6);
      onion(s, 12, B - 2, r, 11, false); onion(s, 20, B - 1, r, 13, true); onion(s, 28, B - 2, r, 10, seed % 2 === 0);
      return finish(s, season, 8, 1.6);
    },
    wild_beans(seed, season) {
      const s = new Spr(40, 40, 20, 34), B = 34, r = rng(seed * 5 + 7);
      leafMound(s, 20, B, 12, 14, C.bean, r, 30, true);
      for (const [x, y] of [[11, B - 6], [16, B - 3], [22, B - 8], [27, B - 4], [19, B - 12], [30, B - 7]]) pod(s, x + Math.round(r()), y, C.cane, 6);
      for (const [x, y] of [[14, B - 13], [25, B - 14]]) { s.set(x, y, P.cloth[5]); s.set(x + 1, y, hex('#d8a8e0')); s.set(x, y + 1, hex('#b07cc8')); }
      return finish(s, season, 10, 1);
    },
    wild_peas(seed, season) {
      const s = new Spr(40, 40, 20, 34), B = 34, r = rng(seed * 5 + 8);
      for (let i = 0; i < 6; i++) { const x = 8 + i * 4.6 + r() * 2, y0 = B - 8 - r() * 5, d = i < 3 ? -1 : 1; for (let j = 0; j < 8; j++) px(s, x + d * Math.round(Math.sin(j * .95) * 1.7 + j * .3), y0 - j, C.pea, 4 + (j & 1)); }
      leafMound(s, 20, B, 13, 11, C.pea, r, 30, false);
      for (const [x, y] of [[10, B - 6], [15, B - 9], [22, B - 5], [26, B - 8], [30, B - 4]]) { s.set(x, y, P.snow[4]); s.set(x + 1, y, P.snow[4]); s.set(x, y + 1, P.snow[3]); s.set(x + 1, y + 1, hex('#e8a8d0')); }
      for (const [x, y] of [[13, B - 3], [19, B - 2], [25, B - 3]]) pod(s, x, y, C.cane, 4);
      return finish(s, season, 10, 1.4);
    },
    wild_grapevine(seed, season) {
      const s = new Spr(44, 44, 22, 38), B = 38, r = rng(seed * 5 + 9), lf = fallOf(C.vine, season, P.fallRed), arcs = [[-1, 15, 15], [1, 16, 17], [-1, 8, 22], [1, 9, 24]];
      const at = (d, w, h, u) => [22 + d * w * u, B - Math.sin(u * 2.5) * h * 1.02];
      for (const [d, w, h] of arcs) for (let t = 0; t <= 40; t++) { const [x, y] = at(d, w, h, t / 40); px(s, x, y, P.wood, 3 - (t & 1)); px(s, x, y + 1, P.wood, 1); }
      s.thick(21, B, 21, B - 8, 3, P.wood, 3);
      if (season !== 'winter') {
        for (const [d, w, h] of arcs) for (const u of [.42, .7]) { const [x, y] = at(d, w, h, u); bunch(s, Math.round(x) - 1, Math.round(y) + 3, C.grape); }
        for (const [d, w, h] of arcs) for (const u of [.2, .34, .5, .62, .78, .92, 1]) { const [x, y] = at(d, w, h, u + (r() - .5) * .05); vleaf(s, Math.round(x) - 2, Math.round(y) - 3, lf, 3 + (u < .6 ? 1 : 0) - (d > 0 ? 1 : 0), true); }
      }
      return finish(s, season, 14, 1.2, 2);
    },
    sugarcane(seed, season) {
      const s = new Spr(44, 60, 22, 54), B = 54, r = rng(seed * 5 + 10), canes = [];
      for (let i = 0; i < 7; i++) canes.push([8 + i * 4.4 + r() * 2, B - Math.floor(r() * 3), 26 + Math.floor(r() * 12), (r() - .5) * .16]);
      canes.sort((a, b) => a[1] - b[1]);
      for (const [x, by, h, lean] of canes) {
        const tx = x + lean * h, ty = by - h;
        for (let a = 0; a < 5; a++) { const d = (a % 2 ? 1 : -1) * (.5 + r() * .6), l = 9 + r() * 7; for (let t = 0; t < l; t++) { const u = t / l; px(s, tx + d * t * .8, ty + 2 - Math.sin(u * 2.4) * 6 + u * u * 7, C.caneLeaf, 3 + (a & 1) - (u > .7 ? 1 : 0)); } }
        for (let j = 0; j < h; j++) { const xx = Math.round(x + lean * j), joint = j % 5 === 4; px(s, xx, by - j, C.cane, joint ? 1 : j < 5 ? 3 : 4); px(s, xx + 1, by - j, C.cane, joint ? 0 : j < 5 ? 1 : 2); if (j % 5 === 0 && j) px(s, xx, by - j, C.cane, 5); }
      }
      return finish(s, season, 12, 2.2);
    },
    dreamleaf(seed, season) {
      const s = new Spr(40, 40, 20, 34), B = 34, r = rng(seed * 5 + 11);
      rosette(s, 20, B - 5, r, { n: 9, len: 9, wid: 5.4, ramp: C.dream, k: 2, rib: 1, turn: .2, round: 1 });
      for (const [dx, a] of [[-3, -1.95], [0, -1.57], [3, -1.2]]) leaf(s, 20 + dx, B - 6, a + (r() - .5) * .2, 8 + r() * 2, 3, C.dream, 5, { noRib: 1, round: 1 });
      for (let j = 0; j < 4; j++) { px(s, 20, B - 16 - j, C.lilac, 1 + (j & 1) + (j > 2 ? 1 : 0)); if (j & 1) px(s, 21, B - 16 - j, C.lilac, 3); }
      return finish(s, season, 8, 1.2);
    },
  };
  for (const id in WILD) X.seasonal('plant', id, 3, WILD[id]);

  const bed = (cols, rows, x0, dx, y0, dy, stag, r, o) => { o = o || {}; const l = []; for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { if (r && r() < (o.skip === undefined ? .1 : o.skip)) continue; const jit = r ? (o.jit === undefined ? 1.6 : o.jit) : 0; l.push([x0 + i * dx + ((j & 1) ? stag || 0 : 0) + (r ? (r() - .5) * 2 * jit : 0), y0 + j * dy + (r ? (r() - .5) * jit : 0), r ? .78 + r() * .44 : 1]); } return l.sort((a, b) => a[1] - b[1]); };
  const weeds = (s, r, B, n) => { for (let i = 0; i < n; i++) { const x = Math.round(3 + r() * 28), y = Math.round(B - 24 + r() * 24); if (s.get(x, y)) continue; if (r() < .5) { s.set(x, y, P.grassLoam[3]); s.set(x, y - 1, P.grassLoam[4]); s.set(x + 1, y, P.grassLoam[2]); } else { s.set(x, y, P.tilled[4]); s.set(x + 1, y, P.tilled[3]); s.set(x + 1, y + 1, P.tilled[1]); } } };
  const cropDone = (s, season, sway) => { if (sway) s.sway = sway; if (season === 'winter') s.snowCap(1, .5); return s.outline(dark(P.tilled[0], .6)); };
  const CROP = {
    crop_rye: grainCrop('rye', C.ryeStem),
    crop_kale(seed, season) { const s = new Spr(34, 48, 17, 40), r = rng(seed * 7 + 2); for (const [x, y, k] of bed(2, 2, 9, 16, 22, 15, 3, r, { skip: .04, jit: 2.6 })) kale(s, x, y, r, 9.5 * k); weeds(s, r, 40, 4); return cropDone(s, season, 1); },
    crop_radish(seed, season) { const s = new Spr(34, 48, 17, 40), r = rng(seed * 7 + 3); for (const [x, y, k] of bed(4, 3, 4, 8, 18, 10, 3, r)) rootPlant(s, x, y, r, { leaves: 5, len: 6 * k, wid: 3, leaf: P.birchLeaf, root: C.radish, rx: 2.4 * k, ry: 2.2 * k, under: P.cloth, k: 2 }); weeds(s, r, 40, 4); return cropDone(s, season); },
    crop_onion(seed, season) { const s = new Spr(34, 48, 17, 40), r = rng(seed * 7 + 4); for (const [x, y, k] of bed(4, 3, 4, 8, 20, 10, 3, r)) onion(s, x, y, r, 8 * k, false); weeds(s, r, 40, 4); return cropDone(s, season, 1.2); },
    crop_peas(seed, season) {
      const s = new Spr(34, 50, 17, 42), B = 42, r = rng(seed * 7 + 5);
      for (const [by, top] of [[B - 15, 17], [B, 19]]) {
        trellis(s, by, [2, 30], [5, 11, top - 1], top);
        for (let i = 0; i < 6; i++) {
          const x0 = 5 + i * 4.6 + r(), h = top - 2 - Math.floor(r() * 4);
          for (let j = 0; j < h; j++) { const x = Math.round(x0 + Math.sin(j * .8 + i) * 1.3); px(s, x, by - j, C.pea, 2 + (j & 1)); if (j % 3 === 1) { const d = (j % 6 === 1) ? -1 : 1; px(s, x + d, by - j, C.pea, 4); px(s, x + d * 2, by - j, C.pea, 5); px(s, x + d, by - j - 1, C.pea, 5); px(s, x + d * 2, by - j + 1, C.pea, 3); } }
          if (r() < .8) { const y = by - 4 - Math.floor(r() * (h - 6)); s.set(Math.round(x0) + 1, y, P.snow[4]); s.set(Math.round(x0) + 1, y - 1, P.snow[4]); }
          if (r() < .8) pod(s, Math.round(x0) - 1, by - 3 - Math.floor(r() * (h - 8)), C.cane, 4);
        }
      }
      return cropDone(s, season, 1);
    },
    crop_cotton(seed, season) {
      const s = new Spr(34, 48, 17, 40), r = rng(seed * 7 + 6);
      for (const [x, y0, k] of bed(3, 3, 6, 11, 16, 10, 3, r, { jit: 2.2 })) {
        const cx = x, y = Math.round(y0);
        s.rect(Math.round(cx), y, 1, 4, P.wood[3]);
        s.ball(cx, y - 3, 5 * k, 4.4 * k, y, C.cotton, { n: .5, ns: 1.2, seed: x + y, d: .2 });
        for (const [dx, dy] of [[-3, -4], [2, -6], [3, -1], [-1, -1]]) if (r() < .85) { const bx = Math.round(cx + dx), by = y + dy; s.set(bx, by, P.snow[4]); s.set(bx + 1, by, P.snow[4]); s.set(bx, by + 1, P.snow[3]); s.set(bx + 1, by + 1, P.cloth[4]); s.set(bx + 1, by - 1, P.snow[4]); s.set(bx, by + 2, P.wood[2]); }
      }
      return cropDone(s, season, 1);
    },
    crop_berries(seed, season) {
      const s = new Spr(36, 48, 18, 40), B = 40, r = rng(seed * 7 + 7), lf = fallOf(P.ash, season, P.fallOrange);
      for (const [x, y, i] of [[10, B - 14, 0], [25, B - 12, 1], [12, B - 1, 2], [26, B, 3]]) {
        s.rect(x, y - 3, 1, 4, P.wood[3]);
        if (season === 'winter') { for (let k = 0; k < 5; k++) limb(s, x, y, x + (k - 2) * 2.5, y - 8 - r() * 3, 1, P.wood, r, 0); continue; }
        canopy(s, x, y - 5, 6.4, 5, lf, seed + i * 3, { cr: 2.9, z: y });
        dots(s, r, 6, x - 6, y - 10, 12, 9, (bx, by) => berry(s, bx, by, P.red));
      }
      return cropDone(s, season, 1.2);
    },
    crop_apples(seed, season) {
      const s = new Spr(44, 64, 22, 56), B = 56, r = rng(seed * 7 + 8), lf = fallOf(P.ash, season, P.fallRed);
      s.thick(30, B, 29, B - 26, 1, P.plank, 3);
      trunk2(s, 22, B, 24, 4, P.wood, seed);
      s.line(24, B - 15, 29, B - 17, P.cloth[3]);
      if (season === 'winter') { for (let i = 0; i < 5; i++) limb(s, 22, B - 20 - i, 22 + (i % 2 ? 1 : -1) * (7 + r() * 5), B - 30 - r() * 8, 2, P.wood, r, 1); return cropDone(s, season); }
      limb(s, 21, B - 18, 13, B - 28, 2, P.wood, r, 0); limb(s, 23, B - 18, 31, B - 27, 2, P.wood, r, 0);
      canopy(s, 22, B - 34, 15, 11, lf, seed, { cr: 4 });
      canopy(s, 14, B - 27, 6, 5, lf, seed + 2, { cr: 3.4, z: 3 }); canopy(s, 31, B - 28, 6, 5, lf, seed + 4, { cr: 3.4, z: 3 });
      dots(s, r, 9, 8, B - 44, 28, 20, (x, y) => berry(s, x, y, P.red));
      s.sh = { rx: 14, ry: 5, dx: 5, dy: 0 };
      return cropDone(s, season, 2);
    },
    crop_grapes(seed, season) {
      const s = new Spr(36, 52, 18, 44), B = 44, r = rng(seed * 7 + 9), lf = fallOf(C.vine, season, P.fallRed);
      trellis(s, B, [3, 31], [14, 25], 27);
      for (const x0 of [11, 23]) { s.thick(x0, B, x0 + 1, B - 14, 2, P.wood, 3); for (let j = 14; j < 26; j++) px(s, x0 + 1 + Math.round(Math.sin(j * .7) * 1.6), B - j, P.wood, 2 + (j & 1)); }
      if (season !== 'winter') {
        for (const wy of [14, 25]) for (let x = 2; x < 34; x++) for (let j = -4; j < 4; j++) { const v = noise(x * .4 + wy, j * .55 + wy, seed + 3); if (v < .44 + Math.abs(j) * .04) continue; px(s, x, B - wy + j, lf, 1 + Math.floor(v * 5) - (j > 1 ? 1 : 0)); }
        for (let i = 0; i < 6; i++) bunch(s, 4 + i * 5 + Math.floor(r() * 2), B - (i & 1 ? 12 : 23) + Math.floor(r() * 2), C.grape);
      }
      return cropDone(s, season, .8);
    },
    crop_thyme(seed, season) {
      const s = new Spr(34, 48, 17, 40), r = rng(seed * 7 + 10);
      for (const [x, y, k] of bed(3, 3, 6, 11, 17, 10, 3, r, { jit: 2.4 })) { const cx = x; s.ball(cx, y, 4.6 * k, 3 * k, y, C.thyme, { n: .7, ns: 1.6, seed: x * 3 + y, d: .25, bias: -.04 }); for (let i = 0; i < 5; i++) { const fx = Math.round(cx + (r() - .5) * 7), fy = Math.round(y - 1 + (r() - .5) * 4); if (s.get(fx, fy)) s.set(fx, fy, C.lilac[2 + (i & 1)]); } for (let i = 0; i < 4; i++) px(s, cx - 3 + i * 2 + r(), y - 3 - r(), C.thyme, 4); }
      return cropDone(s, season);
    },
    crop_mint(seed, season) {
      const s = new Spr(34, 48, 17, 40), r = rng(seed * 7 + 11);
      for (const [x, y0, k] of bed(4, 3, 4, 8, 19, 10, 3, r, { jit: 2 })) {
        const h = Math.round((9 + Math.floor(r() * 4)) * k), cx = Math.round(x), y = Math.round(y0);
        for (let j = 0; j < h; j++) px(s, cx, y - j, C.mint, 1 + (j & 1));
        for (let j = 1; j < h; j += 3) { px(s, cx - 1, y - j, C.mint, 4); px(s, cx - 2, y - j - 1, C.mint, 5); px(s, cx - 2, y - j, C.mint, 3); px(s, cx + 1, y - j, C.mint, 3); px(s, cx + 2, y - j - 1, C.mint, 4); px(s, cx + 2, y - j, C.mint, 2); }
        if (r() < .5) { px(s, cx, y - h, C.lilac, 3); px(s, cx, y - h - 1, C.lilac, 2); px(s, cx, y - h - 2, C.lilac, 3); } else px(s, cx, y - h, C.mint, 5);
      }
      return cropDone(s, season, 1.2);
    },
  };
  Object.assign(CROP, {
    crop_wheat: grainCrop('wheat', P.savanna, P.grassDry),
    crop_cabbage(seed, season) { const s = new Spr(34, 48, 17, 40), r = rng(seed * 7 + 21); for (const [x, y, k] of bed(2, 2, 8.5, 16, 19, 15, 2, r, { skip: 0, jit: 2.4 })) cabbage(s, x, y, r, 4.7 * (k * .7 + .3), k > .84); weeds(s, r, 40, 4); return cropDone(s, season); },
    crop_turnip(seed, season) { const s = new Spr(34, 48, 17, 40), r = rng(seed * 7 + 22); for (const [x, y, k] of bed(4, 3, 4, 8, 18, 10, 3, r)) rootPlant(s, x, y, r, { leaves: 5, len: 7 * k, wid: 3, leaf: P.ash, root: C.turnip, rx: 2.6 * k, ry: 2.2 * k, under: P.cloth }); weeds(s, r, 40, 4); return cropDone(s, season); },
    crop_beans(seed, season) {
      const s = new Spr(34, 50, 17, 42), B = 42, r = rng(seed * 7 + 23);
      for (let i = 0; i < 3; i++) {
        const x = 6 + i * 11 + (r() - .5) * 3, by = B - 3 + (i & 1) * 3 + Math.round((r() - .5) * 2), top = 24 + Math.floor(r() * 8), lean = (r() - .5) * .16;
        s.thick(x, by, x + lean * top, by - top, 2, P.plank, 3);
        for (let j = 2; j < top - 2 - Math.floor(r() * 5); j++) { const sx = x + lean * j + Math.round(Math.sin(j * .7 + i) * 2.4); px(s, sx, by - j, C.bean, 2 + (j % 3)); if (j % 3 === 0) { const d = Math.sin(j * .7 + i) < 0 ? -1 : 1; px(s, sx + d, by - j, C.bean, 4); px(s, sx + d * 2, by - j - 1, C.bean, 4); px(s, sx + d * 2, by - j, C.bean, 3); } if (j % 7 === 3 && r() < .8) pod(s, Math.round(sx) + 1, by - j + 1, P.grassLoam, 3); }
      }
      weeds(s, r, B, 4);
      return cropDone(s, season, 1);
    },
    crop_flax(seed, season) {
      const s = new Spr(34, 50, 17, 42), B = 42, r = rng(seed * 7 + 24), list = [];
      for (let row = 0; row < 4; row++) { const n = 6 + Math.floor(r() * 3); for (let i = 0; i < n; i++) if (r() > .08) list.push([3 + i * (28 / (n - 1)) + (r() - .5) * 2.6, B - 24 + row * 8 + (r() - .5) * 3.4, 9 + Math.floor(r() * 7), r()]); }
      list.sort((a, b) => a[1] - b[1]);
      for (const [x0, by0, h, q] of list) { const x = Math.round(x0), by = Math.round(by0); for (let j = 0; j < h; j++) px(s, x, by - j, P.grassLoam, 2 + (j & 1)); px(s, x - 1, by - 4, P.grassLoam, 4); px(s, x + 1, by - 7, P.grassLoam, 3); if (q > .2) { px(s, x, by - h, P.blue, 4); px(s, x - 1, by - h, P.blue, 3); px(s, x + 1, by - h, P.blue, 2); px(s, x, by - h - 1, P.blue, 4); px(s, x, by - h + 1, P.gold, 4); } else px(s, x, by - h, P.grassLoam, 4); }
      weeds(s, r, B, 3);
      return cropDone(s, season, 2.2);
    },
  });
  for (const id in CROP) { X.drop('crop', id); X.seasonal('crop', id, 3, CROP[id]); }
  X.drop('plant', 'berry_bush');
  X.seasonal('plant', 'berry_bush', 3, (seed, season) => {
    const s = new Spr(40, 40, 20, 34), B = 34, r = rng(seed * 13 + 77), lf = fallOf(P.ash, season, P.fallOrange);
    if (season === 'winter') { for (let i = 0; i < 9; i++) limb(s, 20, B, 20 + (i - 4) * 3 + (r() - .5) * 2, B - 12 - r() * 6, 1, P.wood, r, 1); s.snowCap(2, .3); return finish(s, season, 10, 0, 0); }
    s.thick(19, B, 18, B - 5, 2, P.wood, 3); s.thick(22, B, 24, B - 4, 1, P.wood, 2);
    canopy(s, 20, B - 10, 13 + r() * 1.5, 8.6, lf, seed, { cr: 3.6, n: 22 });
    canopy(s, 20, B - 5, 12, 4.4, lf, seed + 5, { cr: 3.2, z: 2, b: -.06, n: 12 });
    dots(s, r, 13, 8, B - 18, 24, 15, (x, y) => berry(s, x, y, P.red));
    return finish(s, season, 11, 1.5);
  });
})();
(() => {
  const X = DBX;
  const C = {
    sandstone: R('#3a2c22 #54402e #6f573c #8c704c #a88b60 #c2a67a #d9c298'),
    peat: R('#140f0b #201812 #2e221a #3e2e22 #52402e #6a543c'),
    fireclay: R('#6a5236 #8a6e48 #aa8c5e #c6aa78 #dcc696 #eedcb4'),
    egg: R('#4a5a48 #6a7c62 #8c9e80 #b0c0a0 #d4dcc0'),
    eggBlue: R('#46606a #62828c #84a4aa #a8c4c6 #cfe0dc'),
    blood: R('#2a0a0c #4a1012 #6e1a1a'),
  };
  const px = (s, x, y, ramp, k, e) => s.set(x, y, ramp[clamp(k, 0, ramp.length - 1)], e);
  const tileSpr = () => new Spr(32, 42, 0, 41);
  const TILE = { at: [0, 31] };
  const tuft = (s, x, y, n, hmin, hvar, ramp, r) => {
    const m = ramp.length - 1;
    for (let i = 0; i < n; i++) { const bh = hmin + Math.floor(r() * hvar), lean = i < n * .35 ? -1 : i > n * .65 ? 1 : 0, bx = x + i - (n >> 1); for (let j = 0; j < bh; j++) px(s, bx + (j > bh - 3 ? lean : 0) + (j > bh - 2 && bh > 7 ? lean : 0), y - j, ramp, j === bh - 1 ? m : j > bh - 4 ? m - 1 : m - 2 - (i & 1)); if (!(i & 1)) px(s, bx, y + 1, ramp, 0); }
  };
  const scatter = (r, n, x0, x1, y0, y1) => { const l = []; for (let i = 0; i < n; i++) l.push([Math.floor(x0 + r() * (x1 - x0)), Math.floor(y0 + r() * (y1 - y0))]); return l.sort((a, b) => a[1] - b[1]); };
  const winterOf = (s, season, d) => { if (season === 'winter') s.snowCap(d || 1, .45); return s; };
  const grassCover = (ramp, fall, tufts, hmin, hvar, wide, specks) => (seed, season) => {
    const s = tileSpr(), r = rng(seed * 19 + tufts), rp2 = season === 'autumn' ? fall : ramp;
    for (const [x, y] of scatter(r, specks, 0, 32, 11, 41)) { px(s, x, y, rp2, 2 + Math.floor(r() * 2)); px(s, x, y - 1, rp2, 3 + Math.floor(r() * 2)); }
    for (const [x, y] of scatter(r, tufts, 3, 29, 12, 41)) tuft(s, x, y, wide + Math.floor(r() * 3), hmin, hvar, rp2, r);
    return winterOf(s, season);
  };
  const mossCover = (ramp, forest) => (seed, season) => {
    const s = tileSpr(), r = rng(seed * 23 + (forest ? 5 : 1));
    for (const [x, y] of scatter(r, forest ? 6 : 7, 4, 28, 14, 39)) {
      const rx = 4 + r() * 4.5, ry = rx * (.5 + r() * .15);
      s.ball(x, y, rx, ry, y * .1, ramp, { n: .55, ns: 1.3, seed: seed + x, d: .5, bias: -.04 });
      for (let i = 0; i < 3; i++) { const sx = Math.round(x + (r() - .5) * rx * 1.4), sy = Math.round(y - ry * .3 + (r() - .5) * ry); if (s.get(sx, sy)) { px(s, sx, sy, ramp, 5); if (forest && i === 0) { px(s, sx, sy - 1, P.leather, 4); px(s, sx, sy - 2, P.leather, 5); } } }
    }
    if (forest) for (const [x, y] of scatter(r, 5, 2, 30, 12, 40)) { const c = (season === 'summer' ? P.litter : P.fallOrange)[2 + Math.floor(r() * 3)]; s.set(x, y, c); s.set(x + 1, y, c); s.set(x + 1, y + 1, dark(c, .72)); }
    return winterOf(s, season);
  };
  const lumps = (s, r, n, ramp, o) => {
    for (const [x, y] of scatter(r, n, o.x0 || 5, o.x1 || 27, o.y0 || 16, o.y1 || 39)) {
      const rx = o.rmin + r() * o.rvar, ry = rx * (o.flat || .62);
      s.ball(x, y, rx, ry, y * .1, ramp, { facet: o.facet, seed: x * 7 + y, d: o.d === undefined ? .2 : o.d, n: o.n || 0, ns: 1.1, bias: o.bias || 0 });
      for (let i = Math.ceil(-rx * .7); i < rx * .7; i++) if (!s.get(Math.round(x + i), Math.round(y + ry) + 1)) s.set(Math.round(x + i), Math.round(y + ry) + 1, dark(ramp[0], .7));
      if (o.sheen) { px(s, Math.round(x - rx * .35), Math.round(y - ry * .45), o.sheen, o.sheen.length - 1); }
    }
  };
  const COVER = {
    grass_patch: [grassCover(P.grassDry, P.grassDry, 8, 3, 4, 4, 34), 'dirt'],
    tall_grass_patch: [grassCover(P.grassLoam, P.grassDry, 9, 6, 6, 5, 40), 'dirt'],
    deep_grass_patch: [grassCover(P.grass, P.grassLoam, 14, 5, 5, 6, 60), 'dirt'],
    moss: [mossCover(P.mossSwamp, false), 'mud'],
    forest_moss: [mossCover(P.moss, true), 'dirt'],
  };
  const field = (make, ground) => season => { const w = X.flat(3, 2, ground); for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 3; tx++) if (tx + ty !== 3) w.objs.push({ spr: make((tx + ty * 3) % 4, season), x: tx * 32, y: ty * 32 + 31 }); return { world: w, rect: [0, 0, 96, 64], season }; };
  for (const id in COVER) X.seasonal('plant', id, 4, COVER[id][0], Object.assign({ ground: COVER[id][1], layer: 'cover', view: field(COVER[id][0], COVER[id][1]) }, TILE));

  const DEPOSIT = {
    savanna: [(seed, season) => {
      const s = tileSpr(), r = rng(seed * 29 + 1);
      for (const [x, y] of scatter(r, 26, 1, 31, 12, 40)) { px(s, x, y, P.sand, 3 + Math.floor(r() * 3)); if (r() < .4) px(s, x + 1, y, P.sand, 2); }
      for (const [x, y] of scatter(r, 5, 4, 28, 14, 40)) tuft(s, x, y, 6 + Math.floor(r() * 3), 5, 6, season === 'winter' ? P.grassDry : P.savanna, r);
      return winterOf(s, season);
    }, 'dirt'],
    quicksand: [(seed, season) => {
      const s = tileSpr(), r = rng(seed * 29 + 2), cx = 12 + r() * 8, cy = 24 + r() * 6;
      for (let y = 12; y < 41; y++) for (let x = 0; x < 32; x++) { const q = Math.hypot((x - cx) / 11, (y - cy) / 6.4) + (noise(x * .25, y * .3, seed + 3) - .5) * .5; if (q < .7) px(s, x, y, P.quick, q < .3 ? 0 : 1); else if (q < 1 && dith(x, y) > (q - .7) / .3) px(s, x, y, P.quick, 1); }
      for (let i = 0; i < 5; i++) { const x = Math.round(cx - 6 + r() * 12), y = Math.round(cy - 3 + r() * 5); px(s, x, y, P.quick, 4); px(s, x + 1, y, P.quick, 3); }
      const tx = Math.round(cx + 2), ty = Math.round(cy - 1); for (let i = 0; i < 6; i++) px(s, tx + i, ty - (i >> 1), P.wood, 3 + (i & 1)); px(s, tx + 3, ty - 3, P.wood, 3);
      return s;
    }, 'quicksand'],
    mud_deposit: [(seed, season) => {
      const s = tileSpr(), r = rng(seed * 29 + 3);
      s.oval(10 + r() * 10, 30 + r() * 6, 6, 2.6, (x, y, nx, ny) => P.mud[ny < -.3 ? 0 : 1]);
      lumps(s, r, 7, P.mud, { rmin: 2.4, rvar: 3, sheen: P.mud, n: .3 });
      return winterOf(s, season);
    }, 'mud'],
    bog_deposit: [(seed, season) => {
      const s = tileSpr(), r = rng(seed * 29 + 4);
      lumps(s, r, 6, C.peat, { rmin: 2.6, rvar: 3, n: .3, flat: .7 });
      for (const [x, y] of scatter(r, 4, 4, 28, 15, 40)) { s.ball(x, y, 2.6 + r() * 2, 1.8 + r(), 5, P.duck, { n: .6, ns: 1.5, seed: x, d: .5 }); px(s, x, y - 2, P.duck, 2); }
      for (const [x, y] of scatter(r, 3, 3, 29, 14, 40)) { px(s, x, y, P.bog, 4); px(s, x + 1, y, P.bog, 3); }
      return s;
    }, 'bog'],
    riverbank_deposit: [(seed, season) => {
      const s = tileSpr(), r = rng(seed * 29 + 6);
      for (let k = 0; k < 2; k++) { const cx = 9 + r() * 14, cy = 20 + k * 11 + r() * 3; s.oval(cx, cy, 7 + r() * 3, 2.4, (x, y, nx, ny) => hash(x, y, seed) > .85 ? null : P.clayBlue[ny < -.2 ? 2 : nx > .5 ? 1 : 3 - ((x + y) & 1 && ny > .3 ? 1 : 0)]); }
      for (const [x, y] of scatter(r, 5, 3, 28, 14, 39)) { s.ball(x, y, 1.6 + r() * 1.4, 1.3 + r() * .8, 2, P.rock, { d: .2, bias: .08 }); px(s, x, y + 2, P.sand, 0); }
      for (const [x, y] of scatter(r, 10, 1, 31, 12, 40)) { px(s, x, y, P.sand, 5); px(s, x + 1, y, P.sand, 4); }
      return winterOf(s, season);
    }, 'riverbank'],
  };
  for (const id in DEPOSIT) X.seasonal('ore', id, 4, DEPOSIT[id][0], Object.assign({ ground: DEPOSIT[id][1], layer: 'cover', view: field(DEPOSIT[id][0], DEPOSIT[id][1]) }, TILE));

  X.seasonal('ore', 'fire_clay', 3, (seed, season) => {
    const s = new Spr(44, 44, 22, 36), B = 36, r = rng(seed * 31 + 3);
    s.ball(22, B - 7, 15, 9, 0, C.fireclay, { facet: 6, seed, d: .14, bias: -.02 });
    s.ball(11, B - 4, 7, 5, 2, C.fireclay, { facet: 4, seed: seed + 2, d: .14 }); s.ball(32, B - 3, 6.4, 4.6, 2, C.fireclay, { facet: 4, seed: seed + 4, d: .14, bias: -.06 });
    for (let x = 0; x < 44; x++) for (let y = B + 1; y < 44; y++) s.set(x, y, null);
    for (let i = 0; i < 3; i++) { let cx = 14 + i * 7, cy = B - 13 + (i & 1) * 3; for (let j = 0; j < 7; j++) { if (s.get(cx, cy)) px(s, cx, cy, C.fireclay, 0); if (hash(i, j, seed) > .5) cx++; else cy++; } }
    for (let i = 0; i < 8; i++) { const x = 5 + r() * 34, y = B - r() * 2; px(s, x, y, C.fireclay, 4); px(s, x + 1, y, C.fireclay, 2); }
    if (season === 'winter') s.snowCap(2, .2);
    s.outline(); s.sh = { rx: 18, ry: 5, dx: 5, dy: 0 };
    return s;
  });
})();
(() => {
  const X = DBX;
  const C = { egg: R('#4a5a48 #6a7c62 #8c9e80 #b0c0a0 #d4dcc0'), eggBlue: R('#46606a #62828c #84a4aa #a8c4c6 #cfe0dc'), blood: R('#2a0a0c #4a1012 #6e1a1a #8e2420') };
  const px = (s, x, y, ramp, k, e) => s.set(x, y, ramp[clamp(k, 0, ramp.length - 1)], e);
  const cutBelow = (s, B) => { for (let x = 0; x < s.w; x++) for (let y = B + 1; y < s.h; y++) s.set(x, y, null); };
  const bone = (s, x, y, len, k) => { s.rect(x, y, len, 1, P.bone[k]); s.set(x - 1, y - 1, P.bone[k - 1]); s.set(x - 1, y + 1, P.bone[k - 1]); s.set(x + len, y - 1, P.bone[k - 2]); s.set(x + len, y + 1, P.bone[k - 2]); };
  const skull = (s, x, y) => { s.oval(x, y, 2.8, 2.6, (px2, py, nx, ny) => P.bone[nx + ny < -.3 ? 5 : nx + ny < .5 ? 4 : 3]); s.set(x - 1, y, P.ink); s.set(x + 1, y, P.ink); s.rect(x - 1, y + 2, 3, 1, P.bone[3]); };
  const egg = (s, x, y, ramp, rx, ry) => { s.oval(x, y, rx, ry, (qx, qy, nx, ny) => ramp[clamp(Math.round(2.6 - (nx + ny) * 1.6), 0, ramp.length - 1)]); s.set(x - 1, y - Math.round(ry * .5), ramp[ramp.length - 1]); s.set(x + 1, y + 1, ramp[1]); };
  const twigs = (s, r, cx, cy, rx, ry, n, ramps) => { for (let a = 0; a < n; a++) { const t = r() * 6.283, rr = .7 + r() * .36, x = cx + Math.cos(t) * rx * rr, y = cy + Math.sin(t) * ry * rr, l = 4 + r() * 6, ang = t + 1.57 + (r() - .5), rp2 = ramps[a % ramps.length]; s.line(x, y, x + Math.cos(ang) * l, y + Math.sin(ang) * l * .5, rp2[2 + Math.floor(r() * (rp2.length - 2))]); } };

  X.seasonal('site', 'buried_hoard', 3, (seed, season) => {
    const s = new Spr(40, 36, 20, 30), B = 30, r = rng(seed * 37 + 1), o = (sd, b) => ({ n: .7, ns: 1, seed: seed + sd, d: .3, bias: b });
    for (const [x, y, rx, ry, b] of [[13, B - 3, 7, 4.4, -.1], [27, B - 3, 7.4, 4.6, -.14], [20, B - 6, 8, 5.4, .02], [16, B - 1, 5, 3, .1], [25, B - 1, 5.4, 3, .06]]) s.ball(x + (r() - .5) * 2, y, rx, ry, y * .1, b > 0 ? P.soil : P.soilRich, o(x, b));
    cutBelow(s, B);
    for (let i = 0; i < 8; i++) { const x = 4 + r() * 32, y = B - r() * 2; s.ball(x, y, 1.4 + r() * 1.4, 1.1 + r() * .8, 4, i & 1 ? P.soil : P.soilRich, { d: .3, bias: .1 }); }
    for (let i = 0; i < 4; i++) { let cx = 11 + i * 5, cy = B - 9 + (i & 1) * 2; for (let j = 0; j < 6; j++) { if (s.get(cx, cy)) px(s, cx, cy, P.preta, 0); if (hash(i, j, seed) > .45) cx++; else cy++; } }
    for (const [x, y] of [[22, B - 8], [15, B - 4]]) { s.set(x, y, P.gold[4], 200); s.set(x + 1, y, P.gold[3], 120); s.set(x, y + 1, P.gold[2]); }
    if (season === 'winter') s.snowCap(2, .3);
    s.outline(); s.sh = { rx: 14, ry: 4, dx: 4, dy: 0, k: .7 };
    return s;
  });

  X.seasonal('site', 'predator_den', 3, (seed, season) => {
    const s = new Spr(56, 52, 28, 44), B = 44, r = rng(seed * 37 + 2), fo = (sd, b) => ({ facet: 6, seed: seed + sd, d: .12, bias: b || 0 });
    s.ball(28, B - 16, 22, 15, 0, P.rock, fo(1, -.04)); cutBelow(s, B);
    s.ball(11, B - 8, 10, 9, 2, P.rock, fo(3)); s.ball(45, B - 7, 9.4, 8, 2, P.rock, fo(5, -.06)); s.ball(28, B - 26, 13, 6.5, 3, P.rock, fo(7, .06)); cutBelow(s, B);
    for (let y = B - 17; y <= B; y++) for (let x = 17; x <= 39; x++) { const nx = (x - 28) / 10.5, ny = (B - y) / 17; if (nx * nx + ny * ny * ny < 1) s.set(x, y, nx * nx + ny * ny * ny > .78 ? P.rock[ny > .5 ? 0 : 1] : P.ink); }
    for (let k = 0; k < 3; k++) s.line(7 + k * 2, B - 14, 11 + k * 2, B - 6, P.rock[6]);
    for (let i = 0; i < 5; i++) { const x = 21 + i * 3, h = 4 + (i === 2 ? 2 : i % 2); for (let j = 0; j < h; j++) px(s, x + (j > h - 2 ? (i < 2 ? 1 : i > 2 ? -1 : 0) : 0), B - 1 - j, P.bone, 5 - (i > 2 ? 1 : 0)); }
    s.rect(20, B, 14, 1, P.bone[3]);
    skull(s, 41, B - 1); bone(s, 6, B, 6, 5); bone(s, 44, B + 3, 5, 4);
    for (let i = 0; i < 14; i++) { const x = 22 + Math.floor(r() * 13), y = B - 1 + Math.floor(r() * 4); px(s, x, y, C.blood, 1 + Math.floor(r() * 3)); }
    if (season !== 'winter') for (let i = 0; i < 26; i++) { const x = 8 + Math.floor(r() * 40), y = B - 33 + Math.floor(r() * 12); if (s.get(x, y) && s.get(x, y) !== P.ink) px(s, x, y, P.moss, 2 + (i % 3)); } else s.snowCap(3, .15);
    s.outline(); s.sh = { rx: 27, ry: 8, dx: 6, dy: 0 };
    return s;
  });

  X.seasonal('site', 'swamp_nest', 3, (seed, season) => {
    const s = new Spr(48, 44, 24, 36), B = 36, r = rng(seed * 37 + 3);
    for (let i = 0; i < 7; i++) { const x = 30 + i * 2 - (i > 3 ? 20 : 0), h = 14 + r() * 12, lean = (r() - .5) * .3; for (let j = 0; j < h; j++) px(s, x + Math.round(lean * j), B - 8 - j, P.grassLoam, 1 + (i % 3) + (j > h * .6 ? 1 : 0)); if (i % 2 === 0) { const tx = x + Math.round(lean * h); s.rect(tx, B - 8 - h - 5, 2, 6, P.leather[2]); s.rect(tx, B - 8 - h - 5, 1, 6, P.leather[4]); } }
    s.ball(24, B - 5, 19, 9, 0, P.mud, { n: .5, ns: .6, seed, d: .2, bias: .06 }); cutBelow(s, B);
    twigs(s, r, 24, B - 8, 16, 6.4, 120, [P.savanna, P.grassDry, P.wood]);
    s.oval(24, B - 9, 10, 3.8, (x, y, nx, ny) => P.mud[ny < -.2 ? 0 : 1]);
    egg(s, 19, B - 10, C.egg, 2.8, 3.4); egg(s, 24, B - 11, C.egg, 3, 3.6); egg(s, 29, B - 10, C.egg, 2.8, 3.4);
    for (const [x, y] of [[18, B - 11], [25, B - 9], [30, B - 12], [23, B - 13]]) s.set(x, y, P.mossSwamp[1]);
    bone(s, 37, B - 1, 5, 5); s.set(8, B - 1, P.ooze[4], 120); s.set(9, B, P.ooze[3], 80); s.set(41, B - 5, P.ooze[4], 120);
    if (season === 'winter') s.snowCap(1, .5);
    s.outline(); s.sh = { rx: 21, ry: 6, dx: 4, dy: 0, k: .8 };
    return s;
  });

  X.seasonal('site', 'griffon_aerie', 3, (seed, season) => {
    const s = new Spr(60, 76, 30, 68), B = 68, r = rng(seed * 37 + 4), fo = (sd, f, b) => ({ facet: f, seed: seed + sd, d: .12, bias: b || 0 });
    s.ball(30, B - 10, 20, 12, 0, P.rockWarm, fo(1, 8)); cutBelow(s, B);
    s.ball(28, B - 24, 15, 11, 1, P.rockWarm, fo(3, 7)); s.ball(32, B - 36, 12, 9, 2, P.rockWarm, fo(5, 6, .04)); s.ball(14, B - 6, 8, 7, 3, P.rockWarm, fo(7, 5)); s.ball(47, B - 5, 7, 6, 3, P.rockWarm, fo(9, 5, -.06)); cutBelow(s, B);
    for (let j = 0; j < 30; j++) { const x = 24 + Math.round(noise(j * .3, 1, seed) * 5); if (s.get(x, B - 8 - j)) px(s, x, B - 8 - j, P.rockWarm, 0); }
    const ny = B - 46;
    s.oval(30, ny, 19, 7.5, () => P.wood[1]);
    twigs(s, r, 30, ny, 19, 7.5, 150, [P.wood, P.woodGrey, P.wicker]);
    s.oval(30, ny - 1, 11, 3.8, () => P.wood[0]);
    egg(s, 26, ny - 3, C.eggBlue, 3.6, 4.4); egg(s, 34, ny - 2, C.eggBlue, 3.6, 4.4);
    for (const [x, y] of [[25, ny - 4], [27, ny - 1], [33, ny - 4], [35, ny], [36, ny - 3]]) s.set(x, y, P.furTan[2]);
    for (const [x, y, d] of [[46, ny - 6, 1], [12, ny - 3, -1], [41, ny + 4, 1]]) { for (let j = 0; j < 7; j++) { px(s, x + d * j, y - Math.round(j * .7), P.furWhite, 4); px(s, x + d * j, y + 1 - Math.round(j * .7), P.gold, 2 + (j & 1)); } }
    bone(s, 9, B, 6, 5); bone(s, 44, B + 2, 5, 4); s.set(38, B - 14, P.cloth[5]); s.set(38, B - 13, P.cloth[4]); s.set(39, B - 12, P.cloth[5]); s.set(22, B - 27, P.cloth[5]); s.set(22, B - 26, P.cloth[4]);
    if (season === 'winter') s.snowCap(3, .15);
    s.outline(); s.sh = { rx: 26, ry: 8, dx: 7, dy: 0 };
    return s;
  });

  const GLOW2 = Object.assign({ citrine: [1, .85, .3], moonstone: [.75, .85, 1], void: [.6, .3, 1] }, GLOW);
  const crystal = (gem, inf) => (seed, season) => {
    const s = new Spr(44, 48, 22, 40), B = 40, r = rng(seed * 41 + gem.length), ramp = GEM[gem], e = inf ? 210 : 0, j = () => (r() - .5) * 2;
    s.ball(22, B - 3, 14, 5, 0, P.rockWarm, { facet: 5, seed: seed + 1, d: .15 });
    shard(s, 13 + j(), B - 3, 6, 14 + j() * 2, -.24, ramp, e); shard(s, 31 + j(), B - 3, 6, 17 + j() * 2, .26, ramp, e); shard(s, 22 + j(), B - 2, 9, 28 + j() * 2, .03 * (seed % 2 ? 1 : -1), ramp, e);
    shard(s, 17, B, 4, 9 + j(), -.12, ramp, e); shard(s, 27, B, 4, 8 + j(), .16, ramp, e);
    if (inf) for (let i = 0; i < 8; i++) { const x = Math.floor(8 + r() * 28), y = Math.floor(4 + r() * 22); if (s.get(x, y)) continue; s.set(x, y, ramp[5], 255); if (i % 2 === 0) { s.set(x - 1, y, ramp[4], 200); s.set(x + 1, y, ramp[4], 200); s.set(x, y - 1, ramp[4], 200); s.set(x, y + 1, ramp[3], 200); } }
    s.emit = { dx: 0, dy: -16, rad: e ? 60 : 22, col: GLOW2[gem], pulse: e ? 1 : 0 };
    s.sh = { rx: 16, ry: 5, dx: 4, dy: 0 };
    if (season === 'winter') s.snowCap(3, .15);
    return s.outline();
  };
  for (const g of ['amethyst', 'ruby', 'sapphire', 'emerald', 'topaz', 'citrine', 'moonstone']) {
    if (!X.of('ore', g + '_node').length) X.seasonal('ore', g + '_node', 3, crystal(g, false));
    if (!X.of('ore', 'infused_' + g + '_node').length) X.seasonal('ore', 'infused_' + g + '_node', 3, crystal(g, true));
  }
  X.seasonal('ore', 'voidshard_cluster', 3, (seed, season) => {
    const s = new Spr(44, 48, 22, 40), B = 40, r = rng(seed * 43 + 5), V = GEM.void;
    for (let y = B - 6; y <= B + 4; y++) for (let x = 3; x < 41; x++) { const q = Math.hypot((x - 22) / 18, (y - B + 1) / 5.4); if (q < 1 && ((x + y) & 1 || q < .62)) s.set(x, y, q < .62 ? P.ink : hex('#0b0714')); }
    const list = [[9, B - 1, 4, 13, -.5], [34, B - 1, 4, 15, .46], [15, B, 5, 22, -.2], [28, B, 5, 19, .24], [21, B + 1, 6, 31, .04], [24, B + 2, 3, 12, .5], [18, B + 2, 3, 10, -.6]];
    for (const [x, y, w, h, lean] of list) {
      const hh = h + Math.round((r() - .5) * 4);
      for (let k = 0; k < hh; k++) { const f = k / hh, hw = w * .5 * (1 - f * f), cx = x + lean * k; for (let xx = Math.round(cx - hw); xx <= Math.round(cx + hw); xx++) { const u = (xx - cx) / (hw + .01); let c = u < -.55 ? 3 : u < .1 ? 1 : 0; if (xx === Math.round(cx - hw)) c = k > hh * .5 ? 5 : 4; if (hash(xx, (y - k) >> 2, seed) > .95) c = 4; s.set(xx, y - k, V[c], c >= 4 ? 160 : 0); } }
    }
    s.emit = { dx: 0, dy: -14, rad: 30, col: GLOW2.void, pulse: 1 };
    s.sh = { rx: 18, ry: 6, dx: 3, dy: 0 };
    return s.outline(hex('#05030a'));
  });

  const variants = c => { const a = new Uint8ClampedArray(3), out = []; for (const f of [c2 => c2, c2 => lit(c2, 1.14), c2 => dark(c2, .72), c2 => dark(c2, .6), c2 => dark(lit(c2, 1.14), .6), c2 => dark(dark(c2, .72), .6), c2 => dark(c2, .5)]) { const v = f(c); a[0] = v[0]; a[1] = v[1]; a[2] = v[2]; out.push([a[0], a[1], a[2]]); } return out; };
  const recolour = (from, to, band) => img => {
    const map = new Map();
    from.forEach((c, i) => { const fv = variants(c), lo = variants(to[Math.max(0, i - 1)]), tv = variants(to[i]); fv.forEach((v, k) => map.set((v[0] << 16) | (v[1] << 8) | v[2], [tv[k], lo[k]])); });
    for (let i = 0; i < img.w * img.h; i++) {
      const hit = map.get((img.rgba[i * 4] << 16) | (img.rgba[i * 4 + 1] << 8) | img.rgba[i * 4 + 2]); if (!hit) continue;
      const x = i % img.w, y = (i / img.w) | 0, c = hit[band(x, y) ? 1 : 0];
      img.rgba[i * 4] = c[0]; img.rgba[i * 4 + 1] = c[1]; img.rgba[i * 4 + 2] = c[2];
    }
  };
  const SAND = R('#3a2c22 #54402e #6f573c #8c704c #a88b60 #c2a67a #d9c298');
  const strata = (x, y) => ((y + Math.round(noise(x * .06, y * .02, 7) * 5)) % 6) === 0;
  const cliffWorld = (w, h) => { const wd = X.flat(w, h + 1, 'dirt'); for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) wd.wall[y * w + x] = WL.mountain; return wd; };
  for (let n = 0; n < 3; n++) X.tile('ore', 'cliff_wall', n, () => ({ world: cliffWorld(4 + n, 3), rect: [32 + n * 32, 10, 32, 32], oy: -22, post: recolour(P.rock, SAND, strata) }), { view: () => ({ world: cliffWorld(3, 2), rect: [0, 0, 96, 96], post: recolour(P.rock, SAND, strata) }) });
})();
