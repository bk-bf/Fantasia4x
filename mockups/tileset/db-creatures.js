'use strict';
(() => {
  const X = DBX;
  const C = {
    timber: R('#1c1a18 #302c27 #47413a #615a50 #7e766a #9c9488'),
    moor: R('#2e2a22 #46402f #615840 #7e7354 #9c906c #b8ac88'),
    blood: R('#160c0c #2a1413 #42201c #5e2c24 #7a3b2e #96503c'),
    silver: R('#2a2e38 #414754 #5e6674 #808a96 #a6aeb6 #ccd2d4'),
    black: R('#0c0b0d #171519 #242127 #332f37 #454048 #5a545c'),
    ironhide: R('#22252a #33373d #494e55 #626870 #7e858c #9ca3a8'),
    golden: R('#2e1e12 #46301c #62462a #7e5e3a #9a784c #b49464'),
    mammoth: R('#221b17 #352a23 #4b3c31 #645142 #7e6855 #99826c'),
    olm: R('#7a5a5c #a07c7c #c29e9c #dcbcb8 #eed6d0 #faeae4'),
    quill: R('#2a2018 #40301f #5a442c #76593a #94724c #b08c60'),
    mud: P.mud,
    royal: R('#4a2c10 #6e4416 #94601e #ba822a #d8a640 #f0cc68'),
    wraith: R('#140f2a #221a48 #36296c #503e94 #7460b8 #a48cdc'),
    grime: R('#141a0e #202a14 #2e3c1c #405226 #566a32 #728444'),
    viper: R('#10241a #183624 #244c2e #32643a #46804a #62a05e'),
    hoar: R('#5a6a7c #7c8ea0 #a2b4c2 #c6d6de #e4eef0 #f8fcfc'),
    chick: R('#8a6a16 #b48e1e #dcb62e #f4d858 #fcee98'),
    bark: R('#1e1812 #30261b #453727 #5c4a34 #766044 #907a58'),
    pale: R('#3a3440 #564e5c #766c7a #988e98 #bab0b6 #d8d0d2'),
    plate: R('#0c0e12 #181c22 #282e36 #3c444e #545e68 #707a84'),
    queen: R('#1a0c22 #2e1638 #482452 #663670 #884c90 #b06cb4'),
    venom: R('#16200e #223214 #32481c #466226 #5e8032 #7ca044'),
  };
  const px = (s, x, y, ramp, k, e) => s.set(x, y, ramp[clamp(k, 0, ramp.length - 1)], e);
  const recolor = (s, from, to) => { const m = new Map(); from.forEach((c, i) => m.set(c, to[Math.round(i / Math.max(1, from.length - 1) * (to.length - 1))])); for (let i = 0; i < s.c.length; i++) { const t = m.get(s.c[i]); if (t) s.c[i] = t; } return s; };
  const grow = (o, f, over) => Object.assign({}, o, { L: o.L * f, Hb: o.Hb * f, leg: o.leg * f, legw: Math.max(2, Math.round((o.legw || 4) * f)), head: o.head * f, snout: (o.snout || 0) * f, snoutH: (o.snoutH || 2.8) * f, neckw: (o.neckw || 3.6) * f, hump: (o.hump || 0) * f, up: (o.up || 0) * f, neck: (o.neck || 0) * f, extra: null }, over);
  const fac = (sc, base) => Math.pow(sc / base, .85);
  const chain = (...fs) => (s, g) => { for (const f of fs) if (f) f(s, g); };
  const onBody = (s, x, y) => { const c = s.get(Math.round(x), Math.round(y)); return c && c !== P.ink; };
  const scars = (n, seed) => (s, g) => { for (let i = 0; i < n; i++) { const x = g.cx - g.L * .7 + hash(i, seed, 1) * g.L * 1.3, y = g.cy - g.Hb * .6 + hash(i, seed, 2) * g.Hb, l = 4 + hash(i, seed, 3) * 4; for (let j = 0; j < l; j++) if (onBody(s, x + j, y + j * .7)) { s.set(x + j, y + j * .7, P.skinPale[3]); if (j % 3 === 1 && onBody(s, x + j, y + j * .7 + 1)) s.set(x + j, y + j * .7 + 1, P.red[1]); } } for (let j = 0; j < 4; j++) s.set(g.ex - 1 + j, g.ey - 2 + j, P.skinPale[3]); };
  const ribs = (s, g) => { for (let i = 0; i < 4; i++) for (let j = 0; j < g.Hb * .9; j++) { const x = g.cx - g.L * .25 + i * 3, y = g.cy - g.Hb * .2 + j; if (onBody(s, x, y)) { const c = s.get(Math.round(x), Math.round(y)); s.set(x, y, dark(c, .72)); } } };
  const ridge = (ramp, h, span) => (s, g) => { for (let k = 0; k < g.L * (span || 1.5); k += 2) { const x = g.cx - g.L * .7 + k, top = g.cy - g.Hb - (k > g.L * .8 ? (g.hump || 0) : 0); let y = Math.round(top + 2); while (y > 0 && onBody(s, x, y - 1)) y--; const hh = h * (.6 + hash(k, 3, 9) * .6); for (let j = 0; j < hh; j++) { px(s, x - Math.round(j * .35), y - 1 - j, ramp, 2 + (j > hh - 2 ? 2 : j & 1)); if (j < hh - 1) px(s, x + 1 - Math.round(j * .35), y - 1 - j, ramp, 1); } } };
  const tusks = (len, ramp) => (s, g) => { for (const [o2, k] of [[0, 5], [-2, 3]]) for (let j = 0; j < len; j++) { const x = g.tip - 3 + o2 + Math.round(Math.sin(j / len * 1.6) * len * .35), y = g.sy + 1 - j; px(s, x, y, ramp, k - (j < 1 ? 1 : 0)); if (len > 5 && j < len - 2) px(s, x + 1, y, ramp, k - 2); } s.rect(g.tip - 1, Math.round(g.sy - 2), 2, 4, P.skinPale[2]); };
  const stripes = ramp => (s, g) => { for (let k = 0; k < 3; k++) for (let x = g.cx - g.L * .8; x < g.cx + g.L * .8; x++) { const y = g.cy - g.Hb * .5 + k * g.Hb * .45 + Math.sin(x * .5) * .6; if (onBody(s, x, y)) px(s, x, y, ramp, 4 + (x & 1)); } };
  const patch = (ramp, n, seed, lo) => (s, g) => { for (let i = 0; i < n; i++) { const cx = g.cx - g.L + hash(i, seed, 1) * g.L * 2, cy = g.cy + (lo ? g.Hb * .1 : -g.Hb * .8) + hash(i, seed, 2) * g.Hb * (lo ? 1 : 1.6), r = 1.6 + hash(i, seed, 3) * 2.6; for (let y = -r; y <= r; y++) for (let x = -r * 1.4; x <= r * 1.4; x++) if (x * x / 2 + y * y < r * r && onBody(s, cx + x, cy + y)) px(s, cx + x, cy + y, ramp, 2 + Math.round(-(x + y) / r * 1.1) + (hash(Math.round(cx + x), Math.round(cy + y), seed) > .8 ? 1 : 0)); } };
  const paws = ramp => (s, g) => { for (let x = g.cx - g.L - 2; x < g.cx + g.L + 4; x++) { if (onBody(s, x, g.gy)) px(s, x, g.gy, ramp, 1 + (Math.round(x) & 1) * 2); if ((Math.round(x) & 1) && onBody(s, x, g.gy - 1)) px(s, x, g.gy - 1, ramp, 2); } for (let j = 0; j < 3; j++) px(s, g.tip - 2 - j, g.sy + 2, ramp, 2); };
  const blaze = ramp => (s, g) => { for (let j = 0; j < g.Hb * .9; j++) for (let i = 0; i < 4; i++) { const x = g.cx + g.L * .62 + i - j * .25, y = g.cy + g.Hb * .1 + j; if (onBody(s, x, y) && Math.abs(i - 1.5) < 2 - j * .12) px(s, x, y, ramp, 4 - (i > 2 ? 1 : 0)); } };
  const greyFace = (ramp, fur) => (s, g) => { for (let y = g.hy - g.hr - 1; y <= g.hy + g.hr + 1; y++) for (let x = g.hx + g.hr * .25; x <= g.hx + g.hr * 2 + 10; x++) { const i = fur.indexOf(s.get(Math.round(x), Math.round(y))); if (i >= 0) px(s, x, y, ramp, i + 1); } };
  const earNotch = (s, g) => { s.set(g.ax + 4, g.ay - 3, null); s.set(g.ax + 5, g.ay - 4, null); s.set(g.ax + 4, g.ay - 4, null); };
  function quadX(o) {
  const lg = o.leg < 4 ? o.leg : o.leg * clamp(.47 / (o.leg / (2 * o.Hb)), 1, 1.42);
  const cx = Math.max(38, Math.ceil(o.L + 24)), gy = Math.max(56, Math.ceil(lg + 2 * o.Hb + (o.hump || 0) + Math.max(0, o.up || 0) + o.head + 22 + (o.top || 0))), s = new Spr(Math.ceil(cx + o.L + o.head * 1.5 + (o.neck || 0) + (o.snout || 0) + 12 + (o.front || 0)), gy + 8, cx, gy), L = o.L, Hb = o.Hb, fur = o.fur, n = fur.length - 1;
  const cy = gy - lg - Hb + 2, legw = (o.legw || 4) >= 6 ? Math.round((o.legw || 4) * (o.ears === 'flap' ? .9 : .8)) : o.legw || 4, bo = { n: o.shag || .22, ns: .85, seed: 3, d: .14 }, farFur = fur.map(c => dark(c, .62));
  const legX = [cx - L + 2, cx + L - legw - 3];
  const leg = (x, far) => {
    const top = cy + Hb * .3, lr = far ? farFur : fur, hind = x < cx, y0 = Math.round(top + 3), len = Math.max(1, gy - y0), flat = lg < 4, pillar = o.ears === 'flap';
    const wl = flat ? legw : Math.max(2, Math.round(legw * (pillar ? .7 : o.hoof ? .42 : .52))), bk = flat || pillar ? 0 : clamp(len * .17, 1, 3);
    s.ball(x + legw / 2, top + 2, legw * (hind && !flat ? 1.2 : .95), hind && !flat ? 6 : 5, far ? -3 : 3, lr, bo);
    let x0 = x, w = legw;
    for (let y = y0; y <= gy; y++) {
      const t = (y - y0) / len;
      w = Math.max(2, Math.round(flat ? legw : t < .42 ? legw * 1.05 + (wl - legw * 1.05) * (t / .42) : wl));
      const off = flat ? 0 : hind ? (t < .3 ? t / .3 : t < .62 ? 1 - (t - .3) / .32 * (1 + bk) : -bk + (t - .62) / .38 * Math.min(1.4, bk)) : (t > .36 && t < .6 ? .6 : 0);
      x0 = Math.round(x + (legw - w) / 2 + off);
      for (let i = 0; i < w; i++) s.set(x0 + i, y, lr[clamp(n - 2 + (i === 0 ? 1 : i >= w - 1 && w > 2 ? -1 : 0), 0, n)]);
    }
    const hoof = o.hoof ? (far ? dark(o.hoof, .8) : o.hoof) : null;
    if (hoof) { for (let i = 0; i < w + 1; i++) { s.set(x0 + i, gy, hoof); if (len > 4) s.set(x0 + i, gy - 1, hoof); } }
    else if (pillar) { for (let i = -1; i < w + 1; i++) { s.set(x0 + i, gy, i >= 0 && (i & 1) === 0 ? P.bone[far ? 3 : 5] : lr[1]); s.set(x0 + i, gy - 1, lr[clamp(n - 2 + (i <= 0 ? 1 : 0), 0, n)]); } }
    else if (flat) { for (let i = 0; i < w + 2; i++) s.set(x0 + i, gy, lr[1]); }
    else { for (let i = 0; i < w + 2; i++) s.set(x0 + i, gy, lr[i > w ? 1 : clamp(n - 3, 0, n)]); for (let i = 0; i < w + 1; i++) s.set(x0 + i, gy - 1, lr[clamp(n - 2 + (i === 0 ? 1 : 0), 0, n)]); if (legw >= 5) { s.set(x0 + w + 1, gy, P.ink); s.set(x0 + w + 1, gy - 1, lr[n - 2]); } }
  };
  for (const lx of legX) leg(Math.round(lx + Math.max(4, legw)), true);
  if (o.tail === 'bushy') for (let k = 0; k < 6; k++) s.ball(cx - L - 2 - k * 1.8, cy + 1 + k * 1.3, 4.6 - k * .4, 3.2 - k * .2, -1, k > 3 ? (o.tip || fur) : fur, bo);
  if (o.tail === 'short') s.ball(cx - L - 1, cy - 1, 2.6, 2.4, 0, o.tip || fur, bo);
  if (o.tail === 'long') for (let k = 0; k < L + 6; k++) { const y = cy + 1 + Math.sin(k * .45) * 2 + k * .25, tp = o.tip || fur; s.set(cx - L - k, y, tp[Math.min(3, tp.length - 1)]); s.set(cx - L - k, y + 1, tp[1]); }
  if (o.tail === 'fat') { const tl = Math.min(L + 6, cx - L - 1); for (let k = 0; k < tl; k++) { const w = Math.max(1, Hb * (1 - k / tl) * .9), y = cy + 1 + Math.sin(k * .3) * 1.5; for (let j = -w; j <= w; j++) s.set(cx - L + 2 - k, y + j, fur[clamp(n - 2 - Math.round(j / w * 1.4) - (k % 3 === 0 ? 1 : 0), 0, n)]); } }
  if (o.tail === 'tuft') { s.thick(cx - L, cy - 3, cx - L - 4, cy + Hb + 3, 2, fur, n - 2); s.ball(cx - L - 4, cy + Hb + 5, 2.4, 3, 0, farFur, bo); }
  s.ball(cx, cy, L, Hb, 0, fur, bo);
  s.ball(cx + L * .5, cy - (o.hump || 0) - .5, L * .56, Hb * 1.06 + (o.hump || 0), .5, fur, bo);
  s.ball(cx - L * .55, cy + .4, L * .5, Hb * .98, .3, fur, bo);
  if (o.belly) for (let y = Math.round(cy + Hb * .3); y <= cy + Hb + 1; y++) for (let x = cx - L - 2; x <= cx + L + 2; x++) { const c = s.get(x, y), i = fur.indexOf(c); if (i >= 0) s.set(x, y, o.belly[clamp(i + 1, 0, o.belly.length - 1)]); }
  for (const lx of legX) leg(Math.round(lx), false);
  const hr = o.head, hx = cx + L + hr * .35 + (o.neck || 0), hy = cy - (o.up || 0);
  if (o.up > 3) for (let k = 0; k <= 8; k++) s.ball(mix(cx + L * .7, hx - 1, k / 8), mix(cy - Hb * .3, hy + 2, k / 8), o.neckw || 3.6, o.neckw || 3.6, 1, fur, bo);
  if (o.mane) for (let k = 0; k < 14; k++) { const x = cx + L * .2 + k, y = cy - Hb - (o.hump || 0) - 1 + (k > 9 ? k - 9 : 0); s.set(x, y, o.mane[2 + (k & 1)]); s.set(x, y - 1 - (k & 1), o.mane[1 + (k % 3)]); }
  s.ball(hx, hy, hr, hr * .92, 2, fur, bo);
  const sl = o.snout || 0, sx = hx + hr * .7 + sl * .5, sy = hy + hr * .28;
  if (sl) s.ball(sx, sy, sl * .5 + 1.6, o.snoutH || 2.8, 2.5, o.muzzle || fur, { d: .14, bias: .08 });
  const tip = Math.round(sx + sl * .5 + .8);
  if (!o.beak) { s.rect(tip - 1, Math.round(sy - 1.5), 2, 2, P.ink); s.set(tip - 1, Math.round(sy - 1.5), P.furGrey[2]); s.rect(Math.round(hx + hr * .7), Math.round(sy + 1.6), Math.max(2, Math.round(sl * .7)), 1, fur[0]); }
  const ex = Math.round(hx + hr * .2), ey = Math.round(hy - hr * .3);
  if (!o.blind) { s.rect(ex, ey, 2, 2, o.eye || P.ink, o.eye ? 230 : 0); s.set(ex, ey, o.eye ? P.cloth[5] : P.furGrey[3], o.eye ? 230 : 0); s.rect(ex - 1, ey - 1, 4, 1, fur[1]); }
  const ax = Math.round(hx - hr * .35), ay = Math.round(hy - hr * .8);
  if (o.ears === 'point') for (const [dx, sh] of [[3, 1], [-1, 0]]) for (let j = 0; j < 5; j++) for (let i = 0; i < (5 - j + 1) / 2 + .5; i++) { s.set(ax + dx + i + (j >> 1), ay - j, sh ? fur[n - 3] : fur[i === 0 ? n - 1 : n - 2]); if (!sh && j < 3 && i === 1) s.set(ax + dx + i + (j >> 1), ay - j, o.inner || fur[1]); }
  if (o.ears === 'round') { s.oval(ax + 5, ay, 2.6, 2.6, () => fur[n - 3]); s.oval(ax, ay, 2.8, 2.8, (x, y, nx, ny) => Math.hypot(nx, ny) < .45 ? fur[1] : fur[n - 1]); }
  if (o.ears === 'long') for (let j = 0; j < 10; j++) { s.rect(ax + 3 + (j > 6 ? 1 : 0), ay - j, 2, 1, fur[n - 3]); s.rect(ax - (j > 5 ? 1 : 0), ay - j, 3, 1, fur[n - 1]); s.set(ax + 1 - (j > 5 ? 1 : 0), ay - j, o.inner || P.skinPale[3]); }
  if (o.ears === 'leaf') { for (let j = 0; j < 4; j++) s.rect(ax - 3 - j, ay + 1 - (j >> 1), 2, 2, fur[n - 1]); s.set(ax - 4, ay + 1, P.skinPale[3]); }
  if (o.ears === 'flap') s.oval(ax - 3, ay + 9, 5.5, 9, M.fur(farFur, n - 1, 3));
  if (o.extra) o.extra(s, { cx, cy, hx, hy, hr, tip, sy, gy, L, Hb, ax, ay, ex, ey });
  s.outline();
  s.sh = { rx: L + 4, ry: Math.max(4, Hb * .5), dx: 3, dy: 0 };
  return s;
}
  const beastOf = k => BEASTS[k].o;
  const Q = (id, o, meta) => X.reg('creature', id, '0', () => quadX(o), meta);

  const W = beastOf('wolf'), DW = beastOf('direwolf');
  Q('wolf_pup', grow(W, fac(.6, 1.1), { head: 4.4, snout: 2.6, snoutH: 2.2, leg: 4.4, legw: 3, Hb: 4, up: 1.4, shag: .4 }));
  Q('scrawny_wolf', grow(W, fac(.9, 1.1), { Hb: 4.4, fur: C.timber, belly: null, muzzle: null, tip: null, shag: .12, extra: ribs }));
  Q('grey_yearling', grow(W, fac(1, 1.1), { head: 5.2, shag: .2 }));
  Q('timber_wolf', grow(W, fac(1.2, 1.1), { Hb: 7.4, fur: C.timber, belly: P.furGrey, muzzle: P.furGrey, tip: P.furGrey, shag: .46, hump: 1 }));
  Q('moor_runner', grow(W, fac(1.05, 1.1), { leg: 11, Hb: 5.2, L: 13.4, fur: C.moor, belly: P.cloth, muzzle: P.cloth, tip: P.furDark, shag: .14 }));
  Q('pack_alpha', grow(W, fac(1.35, 1.1), { fur: P.furGrey, mane: P.furDark, belly: P.furWhite, muzzle: P.furWhite, tip: P.furWhite, hump: 1.4, shag: .36 }));
  Q('scarred_hunter', grow(W, fac(1.3, 1.1), { fur: C.timber, muzzle: P.furGrey, tip: P.furGrey, belly: null, shag: .3, extra: chain(scars(5, 3), earNotch) }));
  Q('bloodmoon_alpha', grow(DW, fac(1.7, 1.5), { fur: C.blood, mane: P.furDark, eye: P.red[4], shag: .46 }));
  Q('direwolf_matriarch', grow(DW, fac(1.8, 1.5), { fur: P.furDark, mane: P.furGrey, shag: .5, extra: greyFace(P.furGrey, P.furDark) }));
  Q('great_wolf', grow(DW, fac(2, 1.5), { fur: C.silver, mane: C.black, eye: P.mana[4], shag: .5, hump: 2.4 }));
  Q('alpha_worg', grow(beastOf('worg'), fac(1.69, 1.3), { fur: C.black, mane: P.furGrey, eye: P.red[4] }));
  Q('jackal_pup', grow(beastOf('jackal'), fac(.77, 1.1), { head: 4.2, snout: 3, leg: 5, Hb: 3.8 }));

  const B = beastOf('bear'), CB = beastOf('cavebear');
  Q('bear_cub', grow(B, fac(.8, 1.8), { head: 5.2, snout: 2.6, snoutH: 2.4, leg: 3.4, legw: 4, hump: .6, Hb: 5.6 }));
  Q('yearling_bear', grow(B, fac(1.2, 1.8), { hump: 1.2 }));
  Q('sun_bear', grow(B, fac(1.3, 1.8), { fur: C.black, muzzle: P.furTan, hump: .8, shag: .2, extra: blaze(P.furTan) }));
  Q('black_bear', grow(B, fac(1.6, 1.8), { fur: C.black, muzzle: P.furTan, hump: 1, shag: .3 }));
  Q('grizzly', grow(B, fac(1.9, 1.8), { hump: 3.6, mane: P.furTan, shag: .5 }));
  Q('scarred_grizzly', grow(B, fac(2, 1.8), { hump: 3.6, fur: P.furBrown, mane: P.furTan, shag: .5, extra: chain(scars(7, 5), earNotch) }));
  Q('ridgeback_bear', grow(B, fac(2, 1.8), { fur: C.bark, muzzle: P.furTan, hump: 3, shag: .6, top: 6, extra: ridge(C.black, 5, 1.6) }));
  Q('elder_cave_bear', grow(CB, fac(2.5, 2.2), { muzzle: P.furGrey, extra: greyFace(P.furGrey, P.furDark) }));
  Q('ironhide_bruin', grow(CB, fac(2.4, 2.2), { fur: C.ironhide, muzzle: P.furGrey, shag: .3, extra: chain(patch(C.silver, 9, 4), scars(6, 8)) }));
  Q('bloodclaw_bear', grow(CB, fac(2.3, 2.2), { fur: C.bark, muzzle: P.furBrown, extra: paws(P.red) }));
  Q('great_bear', grow(CB, Math.min(1.2, fac(2.9, 2.2)), { fur: C.golden, muzzle: P.furTan, mane: null, hump: 5, shag: .6 }));

  const BO = beastOf('boar');
  const boar = (id, sc, over, tk, tr, ex) => Q(id, grow(BO, fac(sc, 1.3), Object.assign({ extra: chain(tk ? tusks(tk, tr || P.bone) : null, ex) }, over)));
  boar('piglet', .6, { fur: P.furTan, mane: null, hump: .3, shag: .2, head: 4, snout: 2.6, snoutH: 2.2, Hb: 4.4, leg: 3, legw: 2 }, 0, null, stripes(P.cloth));
  boar('scrub_boar', 1, { fur: P.furBrown, mane: null, Hb: 5.6, hump: .8, shag: .3 }, 2);
  boar('young_tusker', 1.1, { fur: P.furBrown, mane: P.furDark, shag: .4 }, 3);
  boar('razorback', 1.25, { top: 6 }, 4, null, ridge(C.black, 5, 1.5));
  boar('bristleback', 1.35, { fur: C.bark, mane: P.furDark, shag: .9, hump: 2.6, top: 4 }, 4, null, ridge(C.bark, 3, 1.7));
  boar('elder_tusker', 1.55, { fur: P.furGrey, mane: P.furWhite }, 8, P.gold);
  boar('irontusk', 1.5, { fur: C.black, mane: P.furGrey }, 7, P.iron);
  boar('grey_sow', 1.5, { fur: P.furGrey, mane: null, hump: .6, Hb: 9.6, shag: .3 }, 0);
  boar('direboar', 1.9, { fur: P.furDark, mane: P.furBrown, hump: 3.4 }, 7);
  boar('blackmane_tusker', 1.8, { fur: C.timber, mane: null, top: 8 }, 6, null, ridge(C.black, 7, 1.2));
  boar('bog_colossus', 2, { fur: P.furDark, mane: null, shag: .7 }, 6, null, patch(P.mud, 16, 6));
  boar('great_boar', 2.3, { fur: C.golden, mane: null, hump: 4, top: 6 }, 10, null, ridge(P.furDark, 4, 1.4));

  const MM = beastOf('mammoth');
  X.reg('creature', 'woolly_mammoth', '0', () => recolor(quadX(grow(MM, fac(3.5, 4.02), { fur: C.mammoth, extra: MM.extra })), P.furRust, C.mammoth));
  X.quadX = quadX; X.grow = grow; X.onBody = onBody; X.greyFace = greyFace; X.ridge = ridge; X.patch = patch;
  const REDO = { wolf: 'wolf', direwolf: 'dire_wolf', bear: 'bear', boar: 'boar', deer: 'deer', elk: 'elk', ox: 'aurochs', packox: 'kingdom_pack_beast', frostfang: 'frost_fang', worg: 'worg', jackal: 'jackal', cavebear: 'cave_bear', fawn: 'fawn', sabre: 'sabretooth', bighorn: 'mountain_goat', mammoth: 'bull_mammoth', lurker: 'mire_crocodile', owlbear: 'owlbear' };
  for (const k in REDO) { X.drop('creature', REDO[k]); X.reg('creature', REDO[k], '0', () => quadX(BEASTS[k].o)); }
})();
(() => {
  const X = DBX;
  const C = {
    black: R('#0c0b0d #171519 #242127 #332f37 #454048 #5a545c'),
    olm: R('#7a5a5c #a07c7c #c29e9c #dcbcb8 #eed6d0 #faeae4'),
    quill: R('#2a2018 #40301f #5a442c #76593a #94724c #b08c60'),
    quillGrey: R('#22201e #36332f #4e4a44 #68635b #847e74 #a09a8e'),
    wraith: R('#140f2a #221a48 #36296c #503e94 #7460b8 #a48cdc'),
    grime: R('#141a0e #202a14 #2e3c1c #405226 #566a32 #728444'),
    viper: R('#10241a #183624 #244c2e #32643a #46804a'),
    brute: R('#1c2a14 #2a3e1c #3c5626 #527030 #6c8c3e'),
    hoar: R('#5a6a7c #7c8ea0 #a2b4c2 #c6d6de #e4eef0'),
    hoarTail: R('#46586c #627a90 #84a0b2 #aac4d0 #d0e2e8'),
    chick: R('#8a6a16 #b48e1e #dcb62e #f4d858 #fcee98'),
    bark: R('#1e1812 #30261b #453727 #5c4a34 #766044'),
    pale: R('#3a3440 #564e5c #766c7a #988e98 #bab0b6'),
    plate: R('#0c0e12 #181c22 #282e36 #3c444e #545e68'),
    queen: R('#1a0c22 #2e1638 #482452 #663670 #884c90'),
    venom: R('#0e1810 #18261a #263a26 #385234 #4e6e44'),
    tarant: R('#1a1210 #2e1e18 #472e22 #62422e #80583c'),
    dread: R('#0a090c #141218 #201c24 #302a34 #423a46'),
    harpy: R('#3a2430 #563646 #764c5e #986878 #b88a96 #d4b0b6'),
    matron: R('#241a2a #3a2a40 #54405a #725a76 #927894 #b49cb2'),
    royal: R('#4a2c10 #6e4416 #94601e #ba822a #d8a640 #f0cc68'),
    elderOwl: R('#3a3028 #564a3c #746654 #92846e #b0a48c #ccc2aa'),
    crocOld: R('#1c2414 #2a361c #3c4a26 #505f30 #68783e'),
    aurochs: R('#161210 #261e19 #382c24 #4c3c30 #62503f #7a6650'),
  };
  const px = (s, x, y, ramp, k, e) => s.set(x, y, ramp[clamp(k, 0, ramp.length - 1)], e);
  const recolor = (s, from, to) => { const m = new Map(); from.forEach((c, i) => m.set(c, to[Math.round(i / Math.max(1, from.length - 1) * (to.length - 1))])); for (let i = 0; i < s.c.length; i++) { const t = m.get(s.c[i]); if (t) s.c[i] = t; } return s; };
  const fac = (sc, base) => Math.pow(sc / base, .85);
  const proxy = (s, k, x0, y0, qx, qy) => {
    const Xf = x => qx + (x - x0) * k, Yf = y => qy + (y - y0) * k, n = v => Math.max(1, Math.round(v * k)), b = k > 1 ? Math.ceil(k) : 1;
    const p = {
      ball(cx, cy, rx, ry, z, ramp, o) { s.ball(Xf(cx), Yf(cy), rx * k, ry * k, z * k, ramp, o); return p; },
      oval(cx, cy, rx, ry, t, e) { s.oval(Xf(cx), Yf(cy), Math.max(.8, rx * k), Math.max(.8, ry * k), t, e); return p; },
      rect(x, y, w, h, c, e) { s.rect(Math.round(Xf(x)), Math.round(Yf(y)), n(w), n(h), c, e); },
      set(x, y, c, e) { s.rect(Math.round(Xf(x)), Math.round(Yf(y)), b, b, c, e); },
      get(x, y) { return s.get(Math.round(Xf(x)), Math.round(Yf(y))); },
      line(a, b2, c, d, col, e) { s.line(Xf(a), Yf(b2), Xf(c), Yf(d), col, e); },
      thick(a, b2, c, d, w, ramp, bb) { s.thick(Xf(a), Yf(b2), Xf(c), Yf(d), n(w), ramp, bb); return p; },
      get c() { return s.c; }, get e() { return s.e; },
      set sh(v) { s.sh = { rx: v.rx * k, ry: v.ry * k, dx: v.dx * k, dy: v.dy * k, k: v.k }; },
      set emit(v) { s.emit = Object.assign({}, v, { dx: v.dx * k, dy: v.dy * k, rad: v.rad * Math.sqrt(k) }); },
    };
    return p;
  };
  const BIG = new Set(['shade', 'ooze', 'spider', 'adder', 'stirge']);
  const scaledNQ = (kind, k, more) => {
    const big = BIG.has(kind), W0 = big ? 64 : 44, H0 = big ? 60 : 44, ax0 = big ? 26 : 20, gy0 = big ? 52 : 39;
    const s = new Spr(Math.ceil(W0 * k) + 8, Math.ceil(H0 * k) + 14, Math.round(ax0 * k) + 4, Math.round(gy0 * k) + 10), p = proxy(s, k, ax0, gy0, s.ax, s.ay);
    NQ[kind](p, gy0);
    if (more) more(p, gy0, s);
    return s;
  };
  const S1 = (id, kind, k, more, post) => X.reg('creature', id, '0', () => { const s = scaledNQ(kind, k, more); if (post) post(s); return s.outline(); });

  S1('rabbit_kit', 'rabbit', .68);
  S1('stirgeling', 'stirge', .64);
  S1('grime_horror', 'ooze', fac(1.49, 1.1), (p, gy) => { p.oval(14, gy - 6, 2.4, 2.2, () => P.bone[5]); p.set(13, gy - 6, P.ink); p.set(15, gy - 6, P.ink); p.rect(24, gy - 17, 6, 1, P.bone[4]); p.rect(40, gy - 10, 1, 4, P.bone[4]); }, s => recolor(s, P.ooze, C.grime));
  S1('bullywug_brute', 'croaker', fac(1.2, 1) * 1.04, (p, gy) => { for (let i = 0; i < 5; i++) p.set(15 + i * 3, gy - 15 + (i & 1), P.mossSwamp[0]); }, s => recolor(s, P.mossSwamp, C.brute));
  S1('hoarfowl', 'fowl', 1.14, null, s => { recolor(s, P.furRust, C.hoar); recolor(s, P.furBrown, C.hoarTail); recolor(s, P.furDark, C.hoarTail); recolor(s, P.green, C.hoar); recolor(s, P.blue, C.hoarTail); });
  const chick = (ramp) => () => {
    const s = new Spr(20, 20, 10, 15), gy = 15;
    s.rect(8, gy - 2, 1, 3, P.gold[2]); s.rect(11, gy - 2, 1, 3, P.gold[3]); s.set(12, gy, P.gold[3]); s.set(9, gy, P.gold[2]);
    s.ball(9.5, gy - 5, 3.6, 3.2, 0, ramp, { d: .2, n: .3, ns: 1.2 }); s.ball(12, gy - 8.5, 2.6, 2.5, 1, ramp, { d: .2, bias: .1 });
    s.set(14, gy - 8, P.gold[4]); s.set(15, gy - 8, P.gold[2]); s.set(12, gy - 9, P.ink); s.set(6, gy - 6, ramp[1]); s.set(7, gy - 5, ramp[1]);
    s.sh = { rx: 4, ry: 1.6, dx: 1, dy: 0 };
    return s.outline();
  };
  X.reg('creature', 'chick', '0', chick(C.chick));
  X.reg('creature', 'hoarfowl_chick', '0', chick(C.hoar));

  const spider = (id, k, o) => S1(id, 'spider', k, o.more, s => { if (o.ramp) recolor(s, P.chitin, o.ramp); if (o.post) o.post(s); });
  const by = gy => gy - 9;
  const thorns = (ramp, n, len) => (p, gy) => { for (let i = 0; i < n; i++) { const t = -2.7 + i / (n - 1) * 2.2, x = 22 + Math.cos(t) * 9.4, y = by(gy) - 1 + Math.sin(t) * 7.4; p.line(x, y, x + Math.cos(t) * len, y + Math.sin(t) * len, ramp[3]); p.set(x + Math.cos(t) * len, y + Math.sin(t) * len, ramp[4]); } };
  const sac = (p, gy) => { p.ball(8, by(gy) + 3, 6.4, 5.6, 1, P.cloth, { d: .2, n: .3, ns: 1.4, bias: -.04 }); for (let i = 0; i < 5; i++) p.line(4 + i * 2, by(gy) - 2, 6 + i * 2, by(gy) + 8, P.cloth[5]); };
  const plates = ramp => (p, gy) => { for (let k = 0; k < 4; k++) for (let a = 0; a < 16; a++) { const t = -2.6 + a / 15 * 2.1, rr = .45 + k * .17; if (rr > 1) continue; p.set(22 + Math.cos(t) * 10 * rr - 1, by(gy) - 1 + Math.sin(t) * 8 * rr, ramp[4 - (k & 1)]); } };
  const mark = (c, e) => (p, gy) => { for (const [x, y] of [[20, -5], [22, -6], [24, -5], [21, -3], [23, -3], [22, -1], [20, 1], [24, 1]]) p.set(x, by(gy) + y, c, e || 0); };
  const eyes = c => (p, gy) => { for (const [x, y] of [[37, by(gy) - 1], [39, by(gy)], [37, by(gy) + 1], [35, by(gy) - 2]]) p.set(x, y, c, 255); };
  const both = (...f) => (p, gy, s) => { for (const g of f) g(p, gy, s); };
  X.reg('creature', 'spiderling', '0', () => {
    const s = new Spr(46, 34, 23, 28);
    for (const [x, y, k] of [[9, 12, .3], [27, 9, .26], [17, 22, .32], [33, 24, .28], [39, 14, .24]]) NQ.spider(proxy(s, k, 26, 52, x, y), 52);
    s.sh = { rx: 16, ry: 5, dx: 2, dy: -6, k: .5 };
    return s.outline();
  });
  spider('web_scuttler', fac(.8, 1.1), { ramp: C.pale });
  spider('thorn_hatchling', fac(.9, 1.1), { more: thorns(C.bark, 7, 4), ramp: C.venom });
  spider('ambush_weaver', fac(1.05, 1.1), { ramp: C.bark, more: plates(C.bark) });
  spider('bristle_spider', fac(1.15, 1.1), { ramp: C.tarant, more: thorns(C.tarant, 15, 2.4) });
  spider('broodmother', fac(1.4, 1.1), { more: sac });
  spider('venomfang_stalker', fac(1.2, 1.1), { ramp: C.venom, more: both(mark(P.ooze[4], 160), (p, gy) => { p.rect(39, by(gy) + 3, 1, 5, P.bone[5]); p.rect(37, by(gy) + 4, 1, 5, P.bone[4]); p.set(39, by(gy) + 8, P.ooze[4], 220); p.set(37, by(gy) + 9, P.ooze[3], 220); }) });
  spider('carapace_lurker', fac(1.25, 1.1), { ramp: C.plate, more: plates(C.plate) });
  spider('great_weaver', 1.3, { more: mark(P.cloth[5]) });
  spider('dread_broodmother', 1.35, { ramp: C.dread, more: both(sac, mark(P.red[3])) });
  spider('chitin_horror', 1.3, { ramp: C.plate, more: both(plates(C.plate), thorns(C.plate, 9, 3)) });
  spider('spider_queen', 1.45, { ramp: C.queen, more: both(mark(P.gold[4], 120), thorns(P.gold, 5, 3), eyes(GEM.amethyst[5])) });

  const extraAt = (extra, k) => (s, g) => {
    const t = (x, y) => [g.cx + (x - g.cx) / k, g.gy + (y - g.gy) / k], g2 = Object.assign({}, g, { L: g.L / k, Hb: g.Hb / k, hr: g.hr / k });
    for (const [a, b] of [['cx', 'cy'], ['hx', 'hy'], ['ax', 'ay'], ['ex', 'ey'], ['tip', 'sy']]) { const q = t(g[a], g[b]); g2[a] = Math.round(q[0]); g2[b] = b === 'cy' || b === 'hy' || b === 'sy' ? q[1] : Math.round(q[1]); }
    extra(proxy(s, k, g.cx, g.gy, g.cx, g.gy), g2);
  };
  X.extraAt = extraAt; X.recolor = recolor; X.spriteProxy = proxy;
})();
(() => {
  const X = DBX, quadX = X.quadX, grow = X.grow, recolor = X.recolor, extraAt = X.extraAt;
  const C = {
    olm: R('#7a5a5c #a07c7c #c29e9c #dcbcb8 #eed6d0 #faeae4'),
    quill: R('#2a2018 #40301f #5a442c #76593a #94724c #b08c60'),
    quillGrey: R('#22201e #36332f #4e4a44 #68635b #847e74 #a09a8e'),
    harpy: R('#3a2430 #563646 #764c5e #986878 #b88a96 #d4b0b6'),
    matron: R('#241a2a #3a2a40 #54405a #725a76 #927894 #b49cb2'),
    royal: R('#4a2c10 #6e4416 #94601e #ba822a #d8a640 #f0cc68'),
    elderOwl: R('#3a3028 #564a3c #746654 #92846e #b0a48c #ccc2aa'),
    crocOld: R('#1c2414 #2a361c #3c4a26 #505f30 #68783e'),
    aurochs: R('#161210 #261e19 #382c24 #4c3c30 #62503f #7a6650'),
  };
  const px = (s, x, y, ramp, k, e) => s.set(x, y, ramp[clamp(k, 0, ramp.length - 1)], e);
  const fac = (sc, base) => Math.pow(sc / base, .85);
  const O = k => BEASTS[k].o;
  const big = (id, base, f, over, post) => X.reg('creature', id, '0', () => { const o = O(base), s = quadX(grow(o, f, Object.assign({ extra: o.extra ? extraAt(o.extra, f) : null }, over))); if (post) post(s); return s; });
  const also = (a, b) => (s, g) => { a(s, g); b(s, g); };

  big('great_elk', 'elk', fac(1.82, 1.4), { top: 12 });
  big('goat_kid', 'bighorn', fac(.6, 1) * 1.04, { extra: (s, g) => { s.set(g.ax + 2, g.ay - 1, P.wicker[3]); s.set(g.ax + 4, g.ay - 1, P.wicker[2]); }, head: 3.4, shag: .3 });
  big('elder_aurochs', 'ox', fac(2.4, 2), { fur: C.aurochs, muzzle: P.furGrey, top: 6 });
  const owlFace = fur => (s, g) => {
    const n = fur.length - 1, k = g.hr / 8, cx = g.hx + g.hr * .32, cy = g.hy - g.hr * .02, rx = g.hr * .66, ry = g.hr * .74;
    for (let y = Math.floor(cy - ry) - 1; y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx) - 1; x <= cx + rx + 1; x++) {
      const nx = (x + .5 - cx) / rx, ny = (y + .5 - cy) / ry, q = nx * nx + ny * ny;
      if (q <= 1 && X.onBody(s, x, y)) s.set(x, y, q > .72 ? fur[n - 3] : fur[n - (nx + ny < 0 ? 0 : 1)]);
    }
    const er = Math.max(2, Math.round(g.hr * .22)), ex = Math.round(g.hx + g.hr * .3), ey = Math.round(g.hy - g.hr * .2);
    s.oval(ex, ey, er + 1.4, er + 1.4, () => fur[1]);
    s.oval(ex, ey, er, er, (x, y, nx, ny) => { const q = Math.hypot(nx, ny); return q < .42 ? P.ink : P.gold[q < .82 ? 4 : 3]; });
    s.set(ex - 1, ey - 1, P.cloth[5]);
    s.rect(ex - er - 1, ey - er - 2, er * 2 + 3, 1, fur[0]);
    const bx = Math.round(g.hx + g.hr * .74), by = Math.round(g.hy + g.hr * .02);
    for (const [dx, dy, w, kk] of [[0, 0, 4, 4], [0, 1, 5, 4], [1, 2, 4, 3], [2, 3, 3, 3], [3, 4, 2, 2], [3, 5, 1, 1]]) s.rect(bx + dx, by + Math.round(dy * k), Math.max(1, Math.round(w * k)), Math.max(1, Math.round(k)), P.gold[kk]);
  };
  const owlbear = (id, f, over, fur) => {
    X.drop('creature', id);
    X.reg('creature', id, '0', () => {
      const o = O('owlbear'), base = f === 1 ? o.extra : extraAt(o.extra, f);
      return quadX(grow(o, f, Object.assign({ extra: (s, g) => { base(s, g); X.wingOf(s, g, fur.map(c => dark(c, .8)), g.hr / 8); owlFace(fur)(s, g); } }, over)));
    });
  };
  owlbear('owlbear', 1, {}, P.furTan);
  owlbear('elder_owlbear', fac(2.5, 2), { fur: C.elderOwl }, C.elderOwl);
  big('dire_sabretooth', 'sabre', fac(1.95, 1.5), {});
  X.reg('creature', 'elder_crocodile', '0', () => { const o = O('lurker'), f = fac(2.25, 1.8), s = quadX(grow(o, f, { fur: C.crocOld, top: 4, extra: also(extraAt(o.extra, f), (s2, g) => { for (let i = 0; i < 22; i++) { const x = g.cx - g.L * .8 + hash(i, 1, 5) * g.L * 1.5, y = g.cy - g.Hb + hash(i, 2, 5) * 3; if (X.onBody(s2, x, y)) { px(s2, x, y, P.moss, 3 + (i % 3)); px(s2, x, y - 1, P.moss, 4); } } }) })); return recolor(s, P.mossSwamp, C.crocOld); });

  const quills = (ramp, n, len) => (s, g) => {
    for (let i = 0; i < n; i++) {
      const t = -2.95 + (i * 7 % n) / (n - 1) * 2.35, x0 = g.cx - g.L * .12 + Math.cos(t) * g.L * .78, y0 = g.cy + Math.sin(t) * g.Hb * .8, l = len * (.7 + hash(i, 3, 7) * .5), a = t - .25;
      for (let j = 0; j < l; j++) { const x = x0 + Math.cos(a) * j, y = y0 + Math.sin(a) * j, u = j / l; s.set(x, y, u > .78 ? P.furDark[1] : u > .3 ? P.cloth[i & 1 ? 5 : 4] : ramp[2 + (i & 1)]); }
    }
  };
  const QB = { L: 11, Hb: 6.6, leg: 3, legw: 3, head: 4.2, up: -2, snout: 3.6, snoutH: 2.4, ears: 'round', tail: 'short', fur: C.quill, muzzle: P.furTan, shag: .5, top: 12 };
  X.reg('creature', 'quillback', '0', () => quadX(Object.assign({}, QB, { extra: quills(C.quill, 34, 11) })));
  X.reg('creature', 'elder_quillback', '0', () => quadX(grow(QB, fac(1.56, 1.2), { fur: C.quillGrey, muzzle: P.furGrey, top: 16, extra: quills(C.quillGrey, 44, 15) })));

  const gills = (s, g) => { for (const [dy, k] of [[-1, 4], [1, 3], [3, 2]]) for (let j = 0; j < 5; j++) { px(s, g.hx - g.hr * .7 - j, g.hy - g.hr * .5 - j * .8 + dy, P.red, k); if (j > 1) px(s, g.hx - g.hr * .7 - j, g.hy - g.hr * .5 - j * .8 + dy - 1, P.red, 4); } for (const lx of [g.cx - g.L + 4, g.cx + g.L - 6]) { s.set(lx + 4, g.gy, C.olm[4]); s.set(lx + 5, g.gy - 1, C.olm[5]); } };
  const OLM = { L: 15, Hb: 3.2, leg: 2, legw: 3, head: 3.6, up: 0, snout: 4, snoutH: 2.2, ears: 'none', tail: 'fat', fur: C.olm, shag: .08, blind: 1, beak: 1 };
  X.reg('creature', 'giant_olm', '0', () => quadX(Object.assign({}, OLM, { extra: gills })));
  X.reg('creature', 'elder_olm', '0', () => quadX(grow(OLM, fac(1.3, 1), { blind: 1, beak: 1, extra: gills })));

  const harpy = (k, ramp, matron) => () => {
    const s = new Spr(Math.ceil(64 * k), Math.ceil(64 * k), Math.round(32 * k), Math.round(58 * k)), cx = s.ax, gy = s.ay, cy = gy - 24 * k, hairR = matron ? P.furWhite : P.furDark;
    for (const sd of [-1, 1]) {
      const edge = u => u < .45 ? [cx + sd * (3 + u / .45 * 8) * k, cy - (5 + u / .45 * 8) * k] : [cx + sd * (11 + (u - .45) / .55 * 13) * k, cy - (13 - (u - .45) / .55 * 6) * k];
      for (let i = 0; i <= 13; i++) { const u = i / 13, [x0, y0] = edge(u), a = 1.5708 - sd * (u * .95 - .1), len = (8 + u * 8 - (u > .9 ? 3 : 0)) * k; s.thick(x0, y0, x0 + Math.cos(a) * len, y0 + Math.sin(a) * len, 2, ramp, (sd < 0 ? 3 : 2) - (i & 1)); px(s, x0 + Math.cos(a) * len, y0 + Math.sin(a) * len, ramp, 1); }
      for (let i = 0; i <= 30; i++) { const [x, y] = edge(i / 30); px(s, x, y, ramp, sd < 0 ? 5 : 4); px(s, x, y + 1, ramp, sd < 0 ? 4 : 3); }
    }
    for (let i = -2; i <= 2; i++) s.thick(cx + i * 1.2 * k, cy + 6 * k, cx + i * 2.6 * k, cy + 13 * k, 2, ramp, 2 + (i < 0 ? 1 : 0) - (Math.abs(i) & 1));
    for (const sd of [-1, 1]) { const lx = cx + sd * 2.6 * k; s.thick(lx, cy + 7 * k, lx + sd * k, cy + 15 * k, 1, P.gold, 2); for (const d of [-1, 0, 1]) s.line(lx + sd * k, cy + 15 * k, lx + sd * k + d * 2, cy + 18 * k, P.gold[d ? 3 : 4]); }
    s.ball(cx, cy + 3 * k, 4.6 * k, 5.6 * k, 3, ramp, { n: .4, ns: 1, d: .2 });
    s.ball(cx, cy - 3 * k, 3.8 * k, 3.6 * k, 4, P.skinPale, { d: .2, bias: .04 });
    s.rect(Math.round(cx - 3 * k), Math.round(cy - 1 * k), Math.round(6 * k), 1, ramp[1]);
    const hy = cy - 10.5 * k, hr = 3.8 * k;
    for (let i = -4; i <= 4; i++) { const l = (7 + (Math.abs(i * 7) % 5)) * k; s.thick(cx + i * .9 * k, hy - 1, cx + i * 1.9 * k, hy + l, 1, hairR, 2 + (i < 0 ? 1 : 0)); }
    s.ball(cx, hy, hr, hr * 1.05, 5, P.skinPale, { d: .2, bias: .05 });
    for (let i = -4; i <= 4; i++) { s.set(cx + i * k * .9, hy - hr + Math.abs(i) * .4, hairR[2 + (i < 0 ? 1 : 0)]); s.set(cx + i * k * .9, hy - hr + Math.abs(i) * .4 + 1, hairR[1 + (i < 0 ? 1 : 0)]); }
    const e = Math.max(1, Math.round(k)); s.rect(Math.round(cx - 2 * k), Math.round(hy), e, e, P.ink); s.rect(Math.round(cx + 1 * k), Math.round(hy), e, e, P.ink);
    s.rect(Math.round(cx - 1), Math.round(hy + 2 * k), 2, Math.max(2, Math.round(1.4 * k)), P.red[0]);
    if (matron) for (let i = -2; i <= 2; i++) s.thick(cx + i * 1.5, hy - hr, cx + i * 3, hy - hr - 5 - (2 - Math.abs(i)) * 2, 1, P.red, 3);
    s.sh = { rx: 10 * k, ry: 3 * k, dx: 2, dy: 0, k: .7 };
    return s.outline();
  };
  X.reg('creature', 'harpy', '0', harpy(1, C.harpy, false));
  X.reg('creature', 'harpy_matron', '0', harpy(fac(1.32, 1.1), C.matron, true));
})();
(() => {
  const X = DBX;
  const C = {
    black: R('#0c0b0d #171519 #242127 #332f37 #454048 #5a545c'),
    caveSkin: R('#3a4438 #566452 #76866e #98a88e #bccab0'),
    mudSkin: R('#2a2a16 #3e3e1e #56562a #727238 #8e8c4a'),
    rag: R('#3a3226 #524838 #6c604c #887a62 #a4967c #beb298'),
    fireRobe: R('#4a140c #74200e #a23412 #cc5618 #e8862a #f8bc4c'),
  };
  Object.assign(FOLK, {
    goblin_small: Object.assign({}, FOLK.goblin, { legs: 5, tl: 8, hw: 4, aw: 2, hh: 9, hd: 5 }),
    hobgoblin: Object.assign({}, FOLK.goblin, { legs: 9, tl: 12, hw: 6, aw: 3, hh: 10, hd: 5 }),
    hobgoblin_lord: Object.assign({}, FOLK.goblin, { legs: 10, tl: 13, hw: 6, aw: 3, hh: 10, hd: 5 }),
    orc_small: Object.assign({}, FOLK.orc, { legs: 8, tl: 11, hw: 6, aw: 3, hh: 10, hd: 5 }),
    orc_big: Object.assign({}, FOLK.orc, { legs: 11, tl: 14, hw: 8, aw: 4, hh: 11, hd: 6 }),
    orc_boss: Object.assign({}, FOLK.orc, { legs: 12, tl: 15, hw: 8, aw: 4, hh: 12, hd: 6 }),
    gnoll_big: Object.assign({}, FOLK.gnoll, { legs: 13, tl: 14, hw: 7, aw: 4, hh: 11, hd: 6 }),
    kobold_big: Object.assign({}, FOLK.kobold, { legs: 7, tl: 10, hw: 4, aw: 2, hh: 9, hd: 4 }),
  });
  const pawnX = (o, extra) => {
    const f = FOLK[o.race || 'human'], cx = 20, base = 51, legTop = base - f.legs + 1, tTop = legTop - f.tl, hTop = tTop - f.hh, armLen = f.tl - 1;
    const g = { cx, base, legTop, tTop, hTop, hd: f.hd, hw: f.hw, aw: f.aw, er: hTop + Math.floor(f.hh * .5), hx: cx + f.hw + f.aw, hy: tTop + armLen - 1, lx: cx - f.hw - f.aw, f };
    if (!extra) return mkPawn(o);
    const orig = Spr.prototype.outline;
    Spr.prototype.outline = function (c) { Spr.prototype.outline = orig; extra(this, g); return orig.call(this, c); };
    try { return mkPawn(o); } finally { Spr.prototype.outline = orig; }
  };
  X.pawnX = pawnX;
  const all = (...fs) => (s, g) => { for (const f of fs) f(s, g); };
  const dagger = left => (s, g) => { const x = left ? g.lx : g.hx, y = g.hy; for (let j = 0; j < 7; j++) { s.set(x, y - 2 - j, P.iron[6]); if (j < 6) s.set(x + 1, y - 2 - j, P.iron[4]); } s.rect(x - 1, y - 1, 4, 1, P.gold[3]); s.rect(x, y, 2, 2, P.leather[2]); };
  const blade2 = (s, g) => { const x = g.lx - 1, y = g.hy; for (let j = 0; j < 16; j++) { const xx = x - Math.round(j * .25); s.set(xx, y - 3 - j, P.iron[6]); s.set(xx + 1, y - 3 - j, P.iron[4]); } s.rect(x - 2, y - 2, 6, 1, P.gold[4]); s.rect(x, y - 1, 2, 3, P.leather[2]); };
  const net = (s, g) => { const x0 = g.lx - 6, y0 = g.hy - 2; for (let j = 0; j < 14; j++) for (let i = 0; i < 9 - Math.abs(j - 6) * .5; i++) if ((i + j) % 3 === 0 || (i - j + 30) % 3 === 0) s.set(x0 + i + (j > 8 ? (j - 8) * .5 : 0), y0 + j, P.wicker[(i + j) & 1 ? 4 : 2]); for (const [x, y] of [[x0, y0 + 13], [x0 + 4, y0 + 14], [x0 + 8, y0 + 12]]) { s.set(x, y, P.rock[5]); s.set(x + 1, y, P.rock[3]); } s.thick(g.hx, g.base, g.hx + 1, g.hTop - 2, 2, P.wood, 4); for (let i = 0; i < 4; i++) s.set(g.hx + 2 + (i < 3 ? i : 2), g.hTop - 3 + (i === 3 ? 2 : i === 2 ? 1 : 0), P.iron[5]); };
  const paint = c => (s, g) => { for (const [dx, dy] of [[-3, -3], [-3, -2], [2, -3], [2, -2], [-4, 2], [3, 2]]) s.set(g.cx + dx, g.er + dy, c); for (let j = 2; j < g.f.tl - 3; j += 3) for (let i = -g.hw + 2; i < g.hw - 2; i++) if ((i + j) % 4 < 2) s.set(g.cx + i, g.tTop + j, c); };
  const topknot = ramp => (s, g) => { for (let j = 0; j < 6; j++) { s.rect(g.cx - 1 - (j > 3 ? 1 : 0), g.hTop - 1 - j, 2 + (j > 3 ? 2 : 0), 1, ramp[3 - (j & 1)]); } s.rect(g.cx - 1, g.hTop - 1, 2, 1, P.bone[4]); };
  const saucer = (s, g) => { for (const dx of [-3, 1]) { s.rect(g.cx + dx - 1, g.er - 1, 3, 3, P.cloth[5], 200); s.rect(g.cx + dx, g.er, 1, 1, P.ink); } };
  const firepot = (s, g) => { const x = g.lx - 1, y = g.hy - 1; s.ball(x, y, 3.4, 3.2, 6, P.clay, { d: .2 }); s.rect(x - 1, y - 4, 3, 1, P.clay[1]); flame2(s, x, y - 4, 1, 5, 1); for (const dx of [-3, 3]) s.ball(g.cx + dx, g.legTop - 1, 1.8, 1.8, 6, P.clay, { d: .2 }); };
  const banner = ramp => (s, g) => { const x = g.cx - g.hw - 1; s.rect(x, g.hTop - 14, 1, g.base - g.hTop + 10, P.wood[4]); for (let j = 0; j < 9; j++) for (let i = 1; i < 8 - (j > 6 ? (j - 6) * 2 : 0); i++) s.set(x - i, g.hTop - 13 + j, ramp[clamp(3 - (i > 4 ? 1 : 0) + (j === 0 ? 1 : 0), 0, 4)]); s.set(x - 4, g.hTop - 9, P.gold[4]); s.set(x - 3, g.hTop - 9, P.gold[4]); };
  const sack = (s, g) => { s.ball(g.cx - g.hw - 2, g.tTop + 5, 5, 6, -1, P.cloth, { d: .2, n: .3, bias: -.1 }); s.rect(g.cx - g.hw - 3, g.tTop - 1, 3, 2, P.leather[3]); };
  const horns = (s, g) => { for (const sd of [-1, 1]) for (let j = 0; j < 6; j++) { const x = g.cx + sd * (g.hd + 1 + Math.round(Math.sin(j / 5 * 1.5) * 3)) - (sd > 0 ? 1 : 0), y = g.hTop - j; s.set(x, y, P.bone[sd < 0 ? 5 : 4]); if (j < 4) s.set(x - sd, y, P.bone[3]); } };
  const skulls = (s, g) => { for (const sd of [-1, 1]) { const x = g.cx + sd * (g.hw + 2), y = g.tTop + 1; s.oval(x, y, 2.6, 2.4, () => P.bone[sd < 0 ? 5 : 4]); s.set(x - 1, y, P.ink); s.set(x + 1, y, P.ink); } };
  const cleaver = (s, g) => { const x = g.hx, y = g.hy; s.thick(x - 1, y + 4, x + 1, y - 10, 2, P.wood, 4); for (let j = 0; j < 12; j++) { const w = j < 2 ? 5 : j < 9 ? 7 : 6 - (j - 9) * 2; for (let i = 0; i < w; i++) s.set(x + 2 + i, y - 22 + j, P.bone[i >= w - 2 ? 5 : j < 2 ? 4 : 3 - ((i + j) % 5 === 0 ? 1 : 0)]); } s.set(x + 4, y - 19, P.ink); for (let j = 0; j < 3; j++) s.set(x + 6 + j, y - 12, P.red[2]); };
  const snare = (s, g) => { for (let a = 0; a < 14; a++) { const t = a / 14 * 6.283; s.set(g.cx - 4 + Math.cos(t) * 3, g.legTop - 1 + Math.sin(t) * 3, P.wicker[a & 1 ? 4 : 2]); } s.rect(g.cx + g.hw - 1, g.tTop + 2, 4, 6, P.leather[2]); s.rect(g.cx + g.hw - 1, g.tTop + 2, 4, 1, P.leather[4]); };
  const studs = (s, g) => { for (let j = 1; j < g.f.tl - 3; j += 3) for (let i = -g.hw + 1; i < g.hw - 1; i += 3) s.set(g.cx + i + ((j / 3) & 1), g.tTop + j, P.iron[6]); };
  const scarsP = (s, g) => { for (let j = 0; j < 5; j++) s.set(g.cx - 4 + j, g.er - 3 + j, P.skinPale[3]); for (let j = 0; j < 4; j++) s.set(g.cx + 2 - j, g.tTop + 3 + j, P.skinPale[3]); };
  const PW = (id, o, extra) => X.reg('creature', id, '0', () => pawnX(o, extra));
  const gob = (o) => Object.assign({ race: 'goblin', pants: P.furDark, sleeves: 0 }, o);
  PW('goblin_sneak', gob({ tunic: C.black, hat: 'hood', hood: C.black, cape: C.black, sleeves: 1 }), dagger(false));
  PW('goblin_whelp', gob({ race: 'goblin_small', tunic: C.rag, pants: C.rag }));
  PW('cave_goblin', gob({ skin: C.caveSkin, tunic: P.furGrey, tool: 'club' }), saucer);
  PW('goblin_cutter', gob({ tunic: P.red, hat: 'hood', hood: P.red }), all(dagger(false), dagger(true)));
  PW('goblin_netter', gob({ tunic: P.wicker }), net);
  PW('goblin_bloodrager', gob({ tunic: P.skinGob, pants: P.red, tool: 'axe', eyes: 1 }), all(paint(P.red[3]), topknot(P.red)));
  PW('goblin_slinker', gob({ skin: C.mudSkin, tunic: P.mud, pants: P.mud, hat: 'hood', hood: P.mud }), dagger(false));
  PW('goblin_warchief', gob({ armor: P.copper, plate: 1, tool: 'sword', hat: 'helm', crest: P.red, shield: P.red, cape: P.red, sleeves: 1 }));
  PW('hobgoblin_champion', gob({ race: 'hobgoblin', armor: P.iron, tool: 'spear', hat: 'helm', crest: P.blue, shield: P.blue, sleeves: 1 }));
  PW('goblin_firecaller', gob({ tunic: C.fireRobe, pants: C.fireRobe, hat: 'hood', hood: C.fireRobe, tool: 'torch', sleeves: 1 }), firepot);
  PW('goblin_warlord', gob({ race: 'hobgoblin_lord', armor: P.gold, plate: 1, tool: 'sword', hat: 'crown', shield: P.purple, cape: P.purple, sleeves: 1 }), banner(P.purple));
  const orc = o => Object.assign({ race: 'orc', pants: P.furDark, sleeves: 0 }, o);
  PW('orc_whelp', orc({ race: 'orc_small', tunic: P.leather, tool: 'club' }));
  PW('orc_grunt', orc({ tunic: P.leather, tool: 'club', mohawk: P.furDark }));
  PW('orc_scavenger', orc({ tunic: C.rag, pants: C.rag, hat: 'hood', hood: C.rag }), sack);
  PW('orc_marauder', orc({ armor: P.leather, plate: 1, tool: 'torch', mohawk: P.furDark }), dagger(true));
  PW('orc_berserker', orc({ tunic: P.skinOrc, pants: P.red, tool: 'axe', mohawk: P.red }), paint(P.red[3]));
  PW('orc_veteran', orc({ armor: P.iron, tool: 'sword', hat: 'helm', shield: P.furDark, sleeves: 1 }), scarsP);
  PW('orc_ironhide', orc({ armor: P.leather, plate: 1, tool: 'hammer', mohawk: P.furDark }), studs);
  PW('orc_slayer', orc({ armor: P.furDark, plate: 1, tool: 'sword' }), all(blade2, topknot(P.red)));
  PW('orc_blackguard', orc({ armor: C.black, plate: 1, tool: 'spear', hat: 'helm', crest: C.black, shield: C.black, cape: C.black, sleeves: 1 }));
  PW('orc_chosen', orc({ race: 'orc_big', armor: P.iron, plate: 1, tool: 'axe', mohawk: P.cloth }), all(paint(P.cloth[5]), skulls));
  PW('orc_warboss', orc({ race: 'orc_boss', armor: P.iron, plate: 1, tool: 'sword', hat: 'helm', crest: P.gold, shield: P.red, cape: P.red, trim: P.gold, sleeves: 1 }), horns);
  PW('kobold_trapper', { race: 'kobold_big', tunic: P.leather, pants: P.furRust, tool: 'spear', hat: 'hood', hood: P.leather }, snare);
  PW('gnoll_reaver', { race: 'gnoll_big', armor: P.leather, plate: 1, pants: P.red, sleeves: 0 }, cleaver);
  PW('kingdom_visitor', { race: 'human', tunic: P.blue, pants: P.cloth, hair: P.fallOrange, cape: P.blue, trim: P.gold, longhair: 1, seed: 14 });
})();
(() => {
  const X = DBX, quadX = X.quadX, grow = X.grow, recolor = X.recolor, proxy = X.spriteProxy;
  const px = (s, x, y, ramp, k, e) => s.set(x, y, ramp[clamp(k, 0, ramp.length - 1)], e);
  const C = {
    mange: R('#1c1816 #2c2622 #403730 #564b40 #6e6152 #887a68'),
    shade: R('#0e0c1c #19152e #272046 #382f62 #4e447e #6a609c'),
    wraith: R('#0a0714 #150e26 #22163c #332256 #483272 #624890'),
    royal: R('#3a2410 #5a3a16 #7c541e #a0722a #c2943e #dcb85e'),
    viper: R('#101c14 #18301e #24462a #346038 #4a7c4a #66985e'),
    adder: R('#2a3318 #3b4720 #505e28 #6a7832 #879340'),
  };
  X.drop('creature', 'giant_rat'); X.drop('creature', 'dire_rat');
  const rat = (k, dire) => () => {
    const W0 = 44, s = new Spr(Math.ceil(W0 * k) + 10, Math.ceil(44 * k) + 14, Math.round(20 * k) + 4, Math.round(39 * k) + 10), p = proxy(s, k, 20, 39, s.ax, s.ay), gy = 39;
    if (dire) { p.ball(22, gy - 9, 6.4, 5.4, -.5, C.mange, { n: .5, ns: 1, d: .14 }); for (let i = 0; i < 9; i++) p.line(17 + i * 1.6, gy - 13 + Math.abs(i - 4) * .5, 16 + i * 1.6, gy - 17 + Math.abs(i - 4) * .6, C.mange[1 + (i & 1)]); }
    NQ.rat(p, gy);
    if (dire) {
      recolor(s, P.furDark, C.mange);
      for (const [x, y] of [[24, gy - 7], [26, gy - 8], [25, gy - 5], [21, gy - 4]]) p.set(x, y, P.skinPale[2]);
      for (let j = 0; j < 4; j++) p.set(28 + j, gy - 8 + j, P.skinPale[3]);
      p.rect(38, gy - 3, 1, 3, P.bone[5]); p.rect(37, gy - 3, 1, 2, P.bone[4]); p.set(30, gy - 11, null); p.set(31, gy - 11, null);
      p.set(34, gy - 6, P.fire[3], 255);
    }
    return s.outline();
  };
  X.reg('creature', 'giant_rat', '0', rat(1, false), { origin: 'mockup' });
  X.reg('creature', 'dire_rat', '0', rat(1.5, true));

  const wraith = (k, R2, greater) => () => {
    const s = new Spr(Math.ceil(56 * k), Math.ceil(64 * k), Math.round(26 * k), Math.round(58 * k)), cx = s.ax, gy = s.ay, n = R2.length - 1, top = gy - 44 * k;
    const mid = y => cx + Math.sin((y - top) * .09) * 2.4 * k;
    for (let y = Math.round(top); y < gy - 2; y++) {
      const t = (y - top) / (gy - top), w = (t < .16 ? 3 + t * 34 : t < .5 ? 8.4 + (t - .16) * 5 : 10.2 - (t - .5) * 6) * k, m = mid(y);
      for (let x = Math.ceil(m - w); x <= m + w; x++) {
        if (t > .62 && hash(x >> 1, 0, 5) < (t - .62) * 2.6 + (hash(x >> 1, y >> 2, 9) > .7 ? .2 : 0)) continue;
        const u = (x - m + w) / (2 * w); let kk = (u < .16 ? n : u < .34 ? n - 1 : u < .7 ? n - 3 : n - 4) - (Math.sin(x * .8 + y * .22) > .6 ? 1 : 0) - (t > .5 ? 1 : 0);
        s.set(x, y, R2[clamp(kk, 0, n)], u < .2 ? 70 : 0);
      }
    }
    const hy = top + 8 * k;
    s.oval(mid(hy) + 1 * k, hy, 4.6 * k, 5.4 * k, () => P.ink);
    for (const dx of [-1.6, 2.2]) { const ex = Math.round(mid(hy) + dx * k), ey = Math.round(hy - 1); s.set(ex, ey, P.mana[5], 255); s.set(ex + 1, ey, P.mana[4], 255); s.set(ex + 1, ey + 1, P.mana[3], 200); }
    for (const [sd, sh] of [[-1, 0], [1, 3]]) {
      const ax = mid(top + 16 * k) + sd * 8 * k, ay = top + (16 + sh) * k, hx = ax + sd * 11 * k, hy2 = ay + 9 * k;
      s.thick(ax, ay, ax + sd * 5 * k, ay + 6 * k, Math.max(2, Math.round(3 * k)), R2, n - 2); s.thick(ax + sd * 5 * k, ay + 6 * k, hx, hy2, 2, R2, n - 2);
      for (const d of [-1, 0, 1]) { s.line(hx, hy2, hx + sd * 4 * k, hy2 + (2 + d * 2.4) * k, R2[n]); s.set(hx + sd * 4 * k, hy2 + (2 + d * 2.4) * k, P.cloth[5]); }
      for (let i = 0; i < 4; i++) s.set(ax + sd * (2 + i * 2) * k, ay + (7 + i * 2 + (i & 1) * 2) * k, R2[n - 3]);
    }
    if (greater) for (const dx of [-4, -1.4, 1.6, 4.4]) s.thick(mid(top) + dx * k, top + 3 * k, mid(top) + dx * 1.5 * k, top - (3 + (Math.abs(dx) < 2 ? 3 : 0)) * k, 1, R2, n - 1);
    for (let i = 0; i < 9; i++) { const x = cx - 12 * k + hash(i, 1, 7) * 24 * k, y = gy - 5 * k + hash(i, 2, 7) * 5 * k; s.set(x, y, P.ice[2 + (i % 2)], 120); if (i % 3 === 0) s.set(x + 1, y, P.ice[3], 90); }
    s.emit = { dx: 0, dy: -22 * k, rad: 46 * k, col: [.55, .6, 1] };
    s.sh = { rx: 8 * k, ry: 2.4 * k, dx: 0, dy: 0, k: .5 };
    return s.outline(hex('#07050f'));
  };
  X.drop('creature', 'shadow_wraith'); X.drop('creature', 'greater_wraith');
  X.reg('creature', 'shadow_wraith', '0', wraith(.8, C.shade, false));
  X.reg('creature', 'greater_wraith', '0', wraith(1.02, C.wraith, true));

  const wingOf = (s, g, W, k) => {
    const n = W.length - 1, bx = g.cx + g.L * .5, by = g.cy - g.Hb * .7;
    for (let i = 0; i < 26 * k; i++) { const t = i / (26 * k), x = bx - t * g.L * 1.9, yT = by - Math.sin(t * 2.6) * 6 * k - 1, yB = by + (3 + Math.sin(t * 3.1) * 7) * k + t * 2 * k; for (let y = Math.round(yT); y <= yB; y++) { const v = (y - yT) / Math.max(1, yB - yT), row = Math.floor(v * 3.4 + t * .3); px(s, x, y, W, (v < .22 ? n : v < .6 ? n - 1 : n - 2) - ((i + row * 2) % 4 === 0 ? 2 : 0) - (row & 1)); } }
    for (let i = 0; i < 4; i++) s.thick(bx - g.L * 1.7 + i, by + (5 + i * 1.6) * k, bx - g.L * 2.3 + i * 2, by + (7 + i * 2.6) * k, 2, W, n - 2 - (i & 1));
  };
  X.wingOf = wingOf;
  const griff = (o) => (s, g) => {
    const k = o.k || 1;
    wingOf(s, g, o.wing, k);
    const nk = o.ruff, nn = nk.length - 1;
    for (let i = 0; i < 16; i++) { const a = -1 + i * .16, x = g.hx - g.hr * .9 + Math.cos(a) * 1, y = g.hy + g.hr * .5 + i * .8; for (let j = 0; j < 3; j++) px(s, x - j + (i & 1), y, nk, nn - (j ? 1 : 0) - (i % 3 === 0 ? 1 : 0)); }
    s.ball(g.hx, g.hy, g.hr * .95, g.hr * .9, 2.5, o.head, { d: .14, n: .2, ns: 1.2 });
    const bX = Math.round(g.hx + g.hr * .55), bY = Math.round(g.hy - 1);
    for (const [dx, dy, w, kk] of [[0, 0, 5, 4], [0, 1, 6, 4], [1, 2, 5, 3], [3, 3, 3, 3], [4, 4, 2, 2], [4, 5, 1, 1]]) s.rect(bX + dx, bY + dy, Math.max(1, Math.round(w * (k > 1.1 ? 1.2 : 1))), 1, P.gold[kk]);
    s.rect(bX, bY + 3, 3, 1, P.gold[1]); s.set(bX + 1, bY + 1, P.ink);
    const ex = Math.round(g.hx + g.hr * .1), ey = Math.round(g.hy - g.hr * .35);
    s.rect(ex, ey, 2, 2, P.ink); s.set(ex, ey, P.gold[4], 200); s.rect(ex - 2, ey - 1, 5, 1, o.head[0]); s.set(ex + 3, ey, o.head[0]);
    if (o.crest) for (let i = 0; i < 5; i++) s.thick(g.hx - g.hr * .4 + i, g.hy - g.hr * .8, g.hx - g.hr * 1.2 + i * .6, g.hy - g.hr * 1.7 - (i % 2) * 2, 1, o.crest, 3 + (i & 1));
    const fx = g.cx + g.L - 6;
    for (let y = Math.round(g.cy + g.Hb * .9); y <= g.gy; y++) for (let x = Math.round(fx - 4); x < fx + 10; x++) { const c = s.get(x, y); if (c && c !== P.ink) { const fi = o.fur.indexOf(c); s.set(x, y, P.gold[fi >= 0 ? clamp(fi - 1, 1, 4) : 1]); } }
    for (const d of [0, 2, 4]) s.set(Math.round(fx) + d, g.gy, P.ink);
  };
  const HG = BEASTS.hippogriff.o;
  X.drop('creature', 'hippogriff'); X.drop('creature', 'royal_hippogriff');
  X.reg('creature', 'hippogriff', '0', () => quadX(grow(HG, 1, { head: 4.6, up: 11, neck: 3, neckw: 3.8, beak: 1, snout: 0, ears: 'none', top: 8, extra: griff({ wing: P.furGrey, ruff: P.furWhite, head: P.furWhite, fur: P.furGrey }) })));
  X.reg('creature', 'royal_hippogriff', '0', () => quadX(grow(HG, Math.pow(1.88 / 1.5, .85), { fur: C.royal, head: 5.4, up: 13, neck: 3.6, neckw: 4.6, beak: 1, snout: 0, ears: 'none', top: 12, extra: griff({ wing: [P.blue[0], P.blue[1], P.blue[2], P.blue[3], P.blue[4], P.cloth[5]], ruff: P.cloth, head: P.cloth, fur: C.royal, crest: P.red, k: 1.2 }) })));

  const snake = (k, R2, o) => () => {
    o = o || {}; const s = new Spr(Math.ceil(52 * k), Math.ceil(34 * k), Math.round(24 * k), Math.round(27 * k)), cx = s.ax, cy = s.ay - 6 * k, n = R2.length - 1, N = Math.round(150 * k);
    let hx = 0, hy = 0, ha = 0;
    for (let i = 0; i <= N; i++) {
      const t = i / N, a = 2.2 + t * 11.5, r = (15 - t * 9.5) * k, x = cx + Math.cos(a) * r * 1.25, y = cy + Math.sin(a) * r * .5 - t * 4 * k, th = (t < .12 ? .8 + t * 14 : 2.5) * k * (o.fat || 1);
      s.ball(x, y, th, th * .86, t * 6, R2, { d: .1, bias: (Math.floor(i / (5 * k)) % 2 ? .1 : -.16) + (Math.sin(a) > .2 ? -.05 : .05) });
      if (o.zig && i % Math.round(7 * k) === 0 && t > .1) { s.set(x, y - 1, o.zig); s.set(x + 1, y, o.zig); }
      hx = x; hy = y; ha = a;
    }
    const dx = Math.cos(ha + 1.57), ex = hx + 5 * k, ey = hy - 1.6 * k;
    s.ball(ex - 1 * k, ey, 3.6 * k * (o.fat || 1), 2.5 * k, 8, R2, { d: .1, bias: .08 }); s.ball(ex + 2.4 * k, ey + .5 * k, 2.2 * k, 1.7 * k, 9, R2, { d: .1, bias: .14 });
    s.set(Math.round(ex), Math.round(ey - 1), P.gold[4], 200); s.set(Math.round(ex) + 1, Math.round(ey - 1), P.ink);
    const tx = Math.round(ex + 4.4 * k), ty = Math.round(ey + 1); s.set(tx, ty, P.red[3]); s.set(tx + 1, ty, P.red[3]); s.set(tx + 2, ty - 1, P.red[4]); s.set(tx + 2, ty + 1, P.red[4]);
    if (o.fang) { s.set(tx - 1, ty + 1, P.bone[5]); s.set(tx - 2, ty + 2, P.bone[5]); }
    s.sh = { rx: 20 * k, ry: 4 * k, dx: 2, dy: 0, k: .7 };
    return s.outline();
  };
  X.drop('creature', 'marsh_viper'); X.drop('creature', 'giant_viper');
  X.reg('creature', 'marsh_viper', '0', snake(.8, C.adder, { zig: P.furDark[1] }));
  X.reg('creature', 'giant_viper', '0', snake(1.2, C.viper, { zig: P.gold[2], fat: 1.25, fang: 1 }));
})();
