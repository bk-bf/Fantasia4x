'use strict';
const DOWNGRADE_LOOK = (() => {
  const X = DBX, RAMP = X.creatureRamps;
  const lum = c => c[0] * .3 + c[1] * .59 + c[2] * .11;
  const toward = (k, lift, t) => ramp => ramp && ramp.map(c => { const l = lum(c) * lift + t; return [mix(c[0], l, k), mix(c[1], l, k), mix(c[2], l + 3, k)]; });
  const dull = ramp => ramp && toward(.55, .86, 0)(ramp).map(c => c.map(v => v * .92));
  const frost = toward(.62, .82, 34), hoary = toward(.85, .5, 112);
  const fitRamp = (from, to) => v => v === from ? to : Array.isArray(v) && from.includes(v) ? to[Math.round(from.indexOf(v) / Math.max(1, from.length - 1) * (to.length - 1))] : v;
  const pen = (s, args) => new Proxy(s, { get: (t, m) => typeof t[m] === 'function' ? (...a) => { const b = args(m, a); return b ? t[m](...b) : pen(t, args); } : t[m] });
  const edited = (extra, edit, swap) => extra && ((s, g) => { const seen = {}; extra(pen(s, (m, a) => { const b = swap ? a.map(swap) : a, n = seen[m] = (seen[m] || 0) + 1; return edit ? edit(n - 1, m, b) : b; }), g); });
  const shorten = (a, k) => { const b = a.slice(); b[2] = mix(a[0], a[2], k); b[3] = mix(a[1], a[3], k); return b; };
  const chain = (...fs) => (s, g) => { for (const f of fs) if (f) f(s, g); };

  const antler = per => (n, m, a) => m !== 'thick' || n < per ? a : n === per ? shorten(a, .55) : null;
  const BREAK = {
    deer: antler(4),
    elk: antler(6),
    ox: (n, m, a) => m !== 'thick' ? a : n === 0 ? shorten(a, .55) : n === 1 ? null : a,
    bighorn: (n, m, a) => m === 'set' && n >= 30 ? null : a,
    boar: (n, m, a) => m === 'rect' && n === 0 ? null : a,
    sabre: (n, m, a) => { if (m !== 'rect' || n > 1) return a; const b = a.slice(); b[3] = 2; return b; },
    mammoth: (n, m, a) => m !== 'thick' || n > 3 ? a : n === 0 ? shorten(a, .35) : n === 2 ? shorten(a, .8) : null,
  };

  const onBody = X.onBody;
  const tint = (s, x, y, f) => { const c = s.get(Math.round(x), Math.round(y)); if (c && c !== P.ink) s.set(x, y, f(c)); };
  const lighter = k => c => [mix(c[0], 255, k), mix(c[1], 255, k), mix(c[2], 245, k)];
  const shade = k => c => [c[0] * k, c[1] * k, c[2] * k];
  const hollow = (s, g) => { const fx = g.cx - g.L * .18, fy = g.cy + g.Hb * .42, rx = g.L * .34, ry = g.Hb * .42; for (let y = Math.floor(fy - ry); y <= fy + ry; y++) for (let x = Math.floor(fx - rx); x <= fx + rx; x++) { const q = ((x - fx) / rx) ** 2 + ((y - fy) / ry) ** 2; if (q < 1 && y > g.cy) tint(s, x, y, shade(q < .45 ? .74 : .86)); } };
  const bones = (s, g) => {
    const hx = g.cx - g.L * .6, top = y => { let t = Math.round(g.cy - g.Hb - 4); while (t < g.cy && !onBody(s, y, t)) t++; return t; };
    for (const dx of [0, 1, 2]) { const y = top(hx + dx); s.set(hx + dx, y - 1, s.get(Math.round(hx + dx), y)); tint(s, hx + dx, y - 1, lighter(.18)); }
    for (let x = g.cx - g.L * .4; x < g.cx + g.L * .5; x += 2) tint(s, x, top(x), lighter(.16));
  };
  const speckle = (s, g) => { for (let x = Math.floor(g.cx - g.L * 1.1); x < g.cx + g.L * 1.2; x++) { let y = Math.round(g.cy - g.Hb - (g.hump || 0) - 4); while (y < g.cy && !onBody(s, x, y)) y++; for (let j = 0; j < 4; j++) if (hash(x, y + j, 7) > .55 - j * .1) tint(s, x, y + j, lighter(.42)); } };

  const legwOf = o => (o.legw || 4) >= 6 ? Math.round((o.legw || 4) * (o.ears === 'flap' ? .9 : .8)) : o.legw || 4;
  const clearLeg = (s, o, x0, x1, y0, y1) => { const own = new Set([...o.fur, o.hoof, P.ink].filter(Boolean)); for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (own.has(s.get(x, y))) s.set(x, y, null); };
  const foot = (s, o, x, y, w) => { for (let i = 0; i < w + 1; i++) { s.set(x + i, y, o.hoof || o.fur[1]); if (o.hoof) s.set(x + i, y - 1, o.hoof); } };
  const LEGS = {
    fore: (s, g, o) => {
      const w = legwOf(o), lx = Math.round(g.cx + g.L - w - 3), cut = Math.round(g.cy + g.Hb + 1), len = g.gy - cut, n = o.fur.length - 1;
      clearLeg(s, o, lx - 2, lx + w + 2, cut, g.gy);
      const kx = lx + w / 2 + .5, ky = cut + len * .34, px2 = kx - len * .34, py = ky + len * .24;
      s.thick(lx + w / 2, cut - 2, kx, ky, Math.max(2, w - 1), o.fur, n - 2);
      s.thick(kx, ky, px2, py, Math.max(2, w - 2), o.fur, n - 2);
      foot(s, o, Math.round(px2 - w / 2), Math.round(py), Math.max(2, w - 2));
    },
    hind: (s, g, o) => {
      const w = legwOf(o), lx = Math.round(g.cx - g.L + 2), cut = Math.round(g.cy + g.Hb * .7), n = o.fur.length - 1, fx = lx - (g.gy - cut) * .75;
      clearLeg(s, o, lx - 2, lx + w + 2, Math.round(g.cy + g.Hb + 1), g.gy);
      s.thick(lx + w / 2, cut, fx + w / 2, g.gy - 1, Math.max(2, w - 1), o.fur, n - 2);
      foot(s, o, Math.round(fx - 1), g.gy, w + 1);
    },
  };
  const nick = (s, pts) => { for (const [x, y] of pts) if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !s.get(x + dx, y + dy))) s.set(x, y, null); };
  const torn = (s, ax, ay, o) => {
    if (o.ears === 'point') X.earNotch(s, { ax, ay });
    if (o.ears === 'round') nick(s, [[-3, -2], [-2, -3], [-2, -2], [-1, -3], [-1, -2]].map(([x, y]) => [ax + x, ay + y]));
    if (o.ears === 'leaf') nick(s, [[-7, 1], [-7, 0], [-6, 0], [-6, -1], [-5, -1]].map(([x, y]) => [ax + x, ay + y]));
    if (o.ears === 'flap') nick(s, Array.from({ length: 14 }, (_, i) => [ax - 7 + (i >> 1), ay + 17 + (i & 1)]));
  };


  const FORM = {
    gaunt: o => ({ ...o, Hb: o.Hb * .76, hump: (o.hump || 0) * .4, up: (o.up || 0) * .5 - 1.5, shag: Math.min(o.shag || .22, .12), fur: dull(o.fur), belly: dull(o.belly), muzzle: dull(o.muzzle), mane: dull(o.mane), tip: dull(o.tip) }),
    crippled: o => ({ ...o }),
    grizzled: o => ({ ...o, Hb: o.Hb * .88, hump: (o.hump || 0) * .6, up: (o.up || 0) - 1, shag: .2, fur: frost(o.fur), belly: frost(o.belly), mane: frost(o.mane), tip: frost(o.tip), muzzle: hoary(o.muzzle || o.fur) }),
  };
  const MARKS = {
    gaunt: () => ({ body: chain(X.ribs, bones, hollow) }),
    crippled: (line, o) => ({ body: X.scars(4, line.length), head: (s, ax, ay) => torn(s, ax, ay, o), leg: LEGS[LIMP[line]] }),
    grizzled: (line, o) => ({ body: speckle, face: (s, g) => X.greyFace(hoary(o.fur), o.fur)(s, g) }),
  };
  const LIMP = { wolf: 'fore', jackal: 'fore', worg: 'fore', bear: 'hind', sabretooth: 'fore', owlbear: 'hind', boar: 'fore', deer: 'fore', elk: 'fore', aurochs: 'hind', woolly_mammoth: 'hind', mountain_goat: 'fore' };
  const QUAD = {
    wolf: { beast: 'wolf' }, jackal: { beast: 'jackal' }, worg: { beast: 'worg' }, bear: { beast: 'bear' }, sabretooth: { beast: 'sabre' },
    owlbear: { beast: 'owlbear', still: (s, g, o) => { X.wingOf(s, g, o.fur.map(c => dark(c, .8)), g.hr / 8); X.owlFace(o.fur)(s, g); } },
    boar: { beast: 'boar' }, deer: { beast: 'deer' }, elk: { beast: 'elk' }, aurochs: { beast: 'ox' },
    woolly_mammoth: { beast: 'mammoth', adult: () => X.grow(BEASTS.mammoth.o, Math.pow(3.5 / 4.02, .85), { fur: RAMP.mammoth }), from: P.furRust },
    mountain_goat: { beast: 'bighorn' },
  };

  const looks = {};
  for (const [line, Q] of Object.entries(QUAD)) {
    const base = BEASTS[Q.beast].o, adult = Q.adult ? Q.adult() : base;
    const kind = Q.adult ? line : Q.beast;
    if (Q.adult && !BEASTS[line]) BEASTS[line] = { name: DOWNGRADES.lines[line].group, o: { ...adult, extra: edited(base.extra, null, fitRamp(Q.from, adult.fur)) } };
    for (const form of Object.keys(FORM)) {
      const id = line + '_' + form, meta = DOWNGRADES.byId.get(id), o = FORM[form](adult);
      o.downgrade = form;
      if (form === 'crippled') o.limp = LIMP[line];
      o.extra = edited(base.extra, form === 'crippled' ? BREAK[Q.beast] : null, Q.from ? fitRamp(Q.from, o.fur) : null);
      const marks = o.marks = MARKS[form](line, o);
      BEASTS[id] = { name: meta.name, o };
      looks[id] = { line, form, beast: Q.beast, kind, o };
      const still = (s, g) => { if (Q.still) Q.still(s, g, o); if (marks.body) marks.body(s, g); if (marks.face) marks.face(s, g); if (marks.head) marks.head(s, g.ax, g.ay); if (marks.leg) marks.leg(s, g, o); };
      X.reg('creature', id, '0', () => X.quadX({ ...o, extra: chain(o.extra, still) }), { origin: 'mockup' });
    }
  }

  const RAG = R('#3a3226 #524838 #6c604c #887a62 #a4967c #beb298');
  const ribsP = (s, g) => { for (let j = 2; j < g.f.tl - 3; j += 2) for (let i = -g.hw + 2; i < g.hw - 1; i++) tint(s, g.cx + i, g.tTop + j, shade(.72)); };
  TOOLS.crutch = { hold: 180, tip: [0, 0], f: (l, b) => l >= -6 && l <= 16 && b >= 0 && b <= 1 ? P.wood[b ? 2 : 4] : l >= -7 && l <= -6 && b >= -2 && b <= 3 ? P.leather[l === -7 ? 4 : 2] : null };
  const crutch = (s, g) => { s.rect(g.hx, g.tTop, 2, g.base - g.tTop + 1, P.wood[3]); s.rect(g.hx, g.tTop, 1, g.base - g.tTop + 1, P.wood[5]); s.rect(g.hx - 2, g.tTop - 1, 6, 2, P.leather[3]); s.rect(g.hx - 2, g.tTop - 1, 6, 1, P.leather[4]); };
  const leggings = (s, g) => { for (const dy of [2, 4]) for (let i = -g.hw + 1; i < 0; i++) s.set(g.cx + i, g.legTop + dy, P.cloth[4 - (i & 1)]); };
  const PAWN = {
    goblin: { kind: 'goblin', thin: { hw: 3, aw: 2 } },
    orc: { kind: 'orc', thin: { hw: 6, aw: 3 } },
  };
  const PFORM = {
    gaunt: (o, f, Q) => ({ o: { ...o, skin: dull(f.skin), tunic: dull(f.skin), armor: null, plate: 0, pants: RAG }, folk: { ...f, ...Q.thin }, extra: ribsP }),
    crippled: (o, f) => ({ o: { ...o, tool: 'crutch', shield: null }, folk: f, extra: chain(X.scarsP, leggings, crutch) }),
    grizzled: (o, f) => ({ o: { ...o, skin: frost(f.skin), hair: P.furWhite, mohawk: o.mohawk ? P.furWhite : o.mohawk }, folk: { ...f, beard: 1 } }),
  };
  for (const [line, Q] of Object.entries(PAWN)) {
    const adult = PAWNS[Q.kind].o, f = FOLK[adult.race];
    for (const form of Object.keys(PFORM)) {
      const id = line + '_' + form, race = adult.race + '_' + form;
      const made = PFORM[form](adult, f, Q);
      FOLK[race] = made.folk;
      const o = { ...made.o, race, downgrade: form };
      PAWNS[id] = { name: DOWNGRADES.byId.get(id).name, o };
      looks[id] = { line, form, beast: null, kind: Q.kind, pawn: 1, o };
      X.reg('creature', id, '0', () => X.pawnX(o, made.extra), { origin: 'mockup' });
    }
  }

  const kitOf = quadKit, headOf = quadHead;
  quadKit = function (kind) {
    const K = kitOf(kind), m = K.o.marks;
    if (m && m.body && !K.marked) { K.marked = 1; m.body(K.body, { cx: 55, cy: 40, L: K.o.L, Hb: K.o.Hb, hump: K.o.hump || 0, ex: -99, ey: -99 }); }
    return K;
  };
  quadHead = function (K, v) {
    const s = headOf(K, v), m = K.o.marks;
    if (m && m.head && !s.marked) { s.marked = 1; const hr = K.o.head, [ax, ay] = rot2(42 - hr * .35, 42 - hr * .8, 42, 42, v.a || 0); m.head(s, rnd(ax), rnd(ay)); }
    return s;
  };

  return { looks, LIMP };
})();
