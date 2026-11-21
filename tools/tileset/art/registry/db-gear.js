'use strict';
(() => {
  const X = DBX, { C, MAT, matOf, tierOf, tone, flake, IC, lerp, frame, stroke, poly, qv, bez, arc, rough, sel, part, woodC, haft, cordC, lash, strand, metalFace, bladeC, blade, ball, glyphs, makers } = X.hd;
  const { hafts, collar, blob, flintLeaf } = X.hdTools, { rod, gem, light, pebble, heapOf } = X.hdWeapons;
  const rrect = (x0, y0, x1, y1, r, tags) => {
    tags = tags || {}; const out = [], cs = [[x1 - r, y0 + r, -1.5708, 0, tags.r || 'bot'], [x1 - r, y1 - r, 0, 1.5708, tags.b || 'bot'], [x0 + r, y1 - r, 1.5708, 3.1416, tags.l || 'top'], [x0 + r, y0 + r, 3.1416, 4.7124, tags.t || 'top']];
    for (const [cx, cy, a0, a1, tg] of cs) for (let i = 0; i <= 4; i++) { const a = a0 + (a1 - a0) * i / 4; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, tg]); }
    return out;
  };
  const skin = (R2, o) => {
    o = o || {};
    return (x, y, D) => {
      let L = (o.base || .5) + (o.light ? o.light(x, y) : 0) + (noise(x * .45, y * .45, o.seed || 3) - .5) * (o.n === undefined ? .16 : o.n);
      if (o.pores !== 0 && hash(x, y, 7) > .93) L -= .1;
      if (D.all < 1.3) L -= .16; else if (D.all < 2.4 && D.top < 2.4) L += .08;
      if (o.stitch && Math.abs(D.all - (o.stitchAt || 3.2)) < .55 && (x + y * 2) % 3 !== 0) return rp(o.thread || C.cord, .82, x, y, 0);
      if (o.tex) L += o.tex(x, y);
      return rp(R2, L, x, y, .3);
    };
  };
  const bulge = (cx, cy, w, h, k) => (x, y) => -((x - cx) / w) * (k || .16) - ((y - cy) / h) * (k || .16);
  const strap = (s, pts, w, R2, o) => stroke(s, pts, w, (t, u, v, hw, x, y) => { if (o && o.stitch && Math.abs(Math.abs(u) - .55) < .3 / hw && Math.floor(t * (o.len || 40)) % 3) return rp(C.cord, .8, x, y, 0); return rp(R2, .48 - u * .14 - (Math.abs(u) > .78 ? .16 : 0), x, y, .25); }, { round: o && o.round });
  const buckle = (s, x, y, m, w, h) => {
    w = w || 5; h = h || 5;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { if (i > 0 && i < w - 1 && j > 0 && j < h - 1) continue; s.set(x + i, y + j, tone(m, i === 0 || j === 0 ? .85 : .45, x + i, y + j)); }
    for (let i = 1; i < w; i++) s.set(x + i, y + (h >> 1), tone(m, .7, x + i, y));
  };
  const rivet = (s, x, y, m) => { s.set(x, y, m.r[m.r.length - 1]); s.set(x + 1, y, m.r[m.r.length - 3]); s.set(x, y + 1, m.r[m.r.length - 3]); s.set(x + 1, y + 1, m.r[1]); };
  const fletch = (s, a, b, vane, sd) => {
    const F = frame(a, b, 1);
    haft(s, [a, F(-1, 0)], .8, C.ash, { seed: sd });
    for (const sg of [-1, 1]) poly(s, F.pts([[-11, sg * .5, 'top'], [-9.5, sg * 3, 'top'], [-3, sg * 3, 'top'], [-1, sg * .5, 'bot']]), (x, y, D) => rp(vane, (sg < 0 ? .72 : .46) - (D.all < 1 ? .16 : 0) + (hash((x + y) >> 1, sd, 2) - .5) * .16, x, y, .2));
    const p = F(0, 0); s.set(p[0], p[1], C.dark[1]);
  };
  const pack = o => () => {
    const s = IC(), L = o.L, cx = 32, w = o.w || 16, top = o.top || 21, bot = o.bot || 56, fl = o.flap || 13, lt = bulge(cx, 38, w, 18), bk = o.buckle;
    if (o.frame) part(s, t => { const fr = o.frame, draw = (p, wd) => fr.r ? rod(t, p, wd, fr) : haft(t, p, wd, fr, { seed: 5, round: 1 }); for (const x of [cx - w - 2, cx + w + 2]) draw([[x, top - 10], [x, bot + 4]], 1.7); draw([[cx - w - 2, top - 6], [cx + w + 2, top - 6]], 1.3); draw([[cx - w - 2, bot + 1], [cx + w + 2, bot + 1]], 1.5); });
    part(s, t => { for (const sg of [-1, 1]) strap(t, bez([cx + sg * 5, top + 3], [cx + sg * 12, top - 12], [cx + sg * (w - 1), top + 8], 12), 1.6, C.leather, { round: 1 }); });
    if (o.roll) part(s, t => { const y0 = top - 5; for (let y = y0 - 5; y <= y0 + 5; y++) for (let x = cx - w + 1; x <= cx + w - 1; x++) { const v = (y - y0) / 5.4; if (Math.abs(v) > 1) continue; t.set(x, y, rp(o.roll, .56 - v * .3 + (hash(x >> 1, 2, 3) - .5) * .1 - (x < cx - w + 3 || x > cx + w - 3 ? .14 : 0), x, y, .3)); } for (const x of [cx - 8, cx + 7]) for (let y = y0 - 5; y <= y0 + 5; y++) { t.set(x, y, C.leather[2]); t.set(x + 1, y, C.leather[4]); } });
    part(s, t => poly(t, rrect(cx - w, top, cx + w, bot, 6), skin(L, { light: lt, stitch: 1, tex: o.tex })));
    if (o.pocket) part(s, t => { poly(t, rrect(cx - 9, 41, cx + 9, bot - 2, 3), skin(L, { light: lt, base: .46, stitch: 1, stitchAt: 2.4, tex: o.tex })); poly(t, [[cx - 10, 40, 'top'], [cx + 10, 40, 'top'], [cx + 9, 45, 'bot'], [cx, 47, 'bot'], [cx - 9, 45, 'bot']], skin(L, { base: .58, light: lt })); });
    if (o.side) part(s, t => { for (const sg of [-1, 1]) poly(t, rrect(cx + sg * (w + 2) - 4, 38, cx + sg * (w + 2) + 4, 52, 3), skin(L, { base: .42, light: lt, stitch: 1, stitchAt: 2.2 })); });
    part(s, t => poly(t, [[cx - w - 1, top + 4, 'top'], ...qv([cx - w - 1, top + 4], [cx - w, top - 2], [cx - w + 7, top - 2], 'top', 5), [cx + w - 7, top - 2, 'top'], ...qv([cx + w - 7, top - 2], [cx + w, top - 2], [cx + w + 1, top + 4], 'top', 5), [cx + w + 1, top + fl - 3, 'bot'], ...qv([cx + w + 1, top + fl - 3], [cx, top + fl + 5], [cx - w - 1, top + fl - 3], 'bot', 10)], skin(L, { base: .58, light: lt, stitch: 1, tex: o.tex, thread: o.thread })));
    const sx = o.one ? [cx - 1] : [cx - 8, cx + 6];
    part(s, t => { for (const x of sx) { for (let y = top; y < top + fl + 9; y++) for (let i = 0; i < 3; i++) t.set(x + i, y, rp(o.strapL || C.leather, i === 0 ? .56 : i === 2 ? .3 : .42, x + i, y, .2)); } }, { k: .2 });
    if (bk) part(s, t => { for (const x of sx) buckle(t, x - 1, top + fl + 1, bk, 5, 5); }, { line: 0 });
    if (o.rivets) part(s, t => { for (const [x, y] of [[cx - w + 2, top + 2], [cx + w - 3, top + 2], [cx - w + 2, bot - 4], [cx + w - 3, bot - 4], [cx - w + 2, 38], [cx + w - 3, 38]]) rivet(t, x, y, o.rivets); }, { line: 0 });
    if (o.corners) part(s, t => { for (const [x, y, sx2, sy2] of [[cx - w - 2, top - 10, 1, 1], [cx + w + 2, top - 10, -1, 1], [cx - w - 2, bot + 1, 1, -1], [cx + w + 2, bot + 1, -1, -1]]) { rod(t, [[x - 2 * sx2, y], [x + 4 * sx2, y]], 1.3, o.corners, { round: 0 }); rod(t, [[x, y - 2 * sy2], [x, y + 5 * sy2]], 1.3, o.corners, { round: 0 }); } });
    if (o.rune) { glyphs(s, [[cx - w + 4, top + fl - 6], [cx + w - 5, top + fl - 6]], 5); glyphs(s, [[cx - w + 4, bot - 6], [cx + w - 5, bot - 6]], 4, { seed: 2 }); light(s, [cx, 36], [.5, .85, 1], 24); }
    return sel(s);
  };
  const satchel = o => () => {
    const s = IC(), L = o.L, cx = 32, lt = bulge(cx, 40, 20, 12), bk = o.buckle;
    part(s, t => strap(t, [...bez([13, 33], [10, 8], [32, 7], 12), ...bez([32, 7], [54, 8], [51, 33], 12).slice(1)], 1.8, o.strapL || C.leather, { round: 1 }));
    part(s, t => poly(t, rrect(11, 28, 53, 54, 5), skin(L, { light: lt, stitch: 1, tex: o.tex, thread: o.thread })));
    part(s, t => poly(t, [[10, 30, 'top'], ...qv([10, 30], [10, 25], [16, 25], 'top', 4), [48, 25, 'top'], ...qv([48, 25], [54, 25], [54, 30], 'top', 4), [54, 40, 'bot'], ...qv([54, 40], [32, 49], [10, 40], 'bot', 10)], skin(L, { base: .58, light: lt, stitch: 1, tex: o.tex, thread: o.thread })));
    const sx = o.one ? [31] : [21, 40];
    if (!o.silk) part(s, t => { for (const x of sx) for (let y = 26; y < 50; y++) for (let i = 0; i < 3; i++) t.set(x + i, y, rp(C.leather, i === 0 ? .56 : i === 2 ? .3 : .42, x + i, y, .2)); }, { k: .2 });
    if (bk) part(s, t => { for (const x of sx) buckle(t, x - 1, 44, bk, 5, o.one ? 6 : 5); }, { line: 0 });
    if (o.silk) part(s, t => { rod(t, arc(32, 44, 2.6, 2.6, 0, 6.3, 14), .9, MAT.gold); });
    if (o.rune) { glyphs(s, [[16, 33], [47, 33]], 6, { col: o.silk ? [255, 226, 140] : undefined }); light(s, [32, 38], o.silk ? [1, .85, .5] : [.5, .85, 1], 22); }
    return sel(s);
  };
  const snapsack = () => {
    const s = IC(), a = [14, 50], b = [50, 18], F = frame(a, b);
    part(s, t => strap(t, bez([12, 46], [18, 14], [48, 14], 14), 1.2, C.cord, { round: 1 }));
    part(s, t => stroke(t, [a, b], u => { const k = Math.min(u, 1 - u); return k < .08 ? 2.4 + k * 30 : 8.2 + Math.sin(u * 9) * .5; }, (u, v, d, hw, x, y) => rp(C.cloth, .58 - v * .3 + (hash(Math.floor(d + 20), Math.floor(u * 30), 2) - .5) * .1 + (((x + y) & 1) ? .03 : -.03) - (Math.abs(u - .5) > .4 ? .1 : 0), x, y, .3), { round: 1 }));
    part(s, t => { for (const q of [.085, .915]) stroke(t, [F(F.len * q - 1, 0), F(F.len * q + 1, 0)], 3.4, cordC(C.cord, 1.6, 3)); }, { line: 0 });
    return sel(s);
  };
  const pouch = () => {
    const s = IC(), lt = bulge(32, 40, 14, 14, .2);
    part(s, t => { strap(t, bez([27, 19], [20, 6], [32, 6], 8), 1, C.cord, { round: 1 }); strap(t, bez([37, 19], [44, 6], [32, 6], 8), 1, C.cord, { round: 1 }); });
    part(s, t => poly(t, [...qv([25, 22], [10, 30], [15, 46], 'top', 8), ...qv([15, 46], [20, 57], [32, 56], 'bot', 8), ...qv([32, 56], [45, 57], [49, 46], 'bot', 8), ...qv([49, 46], [54, 30], [39, 22], 'bot', 8), [39, 22, 'top']], skin(C.hide, { light: lt, seed: 5, tex: (x, y) => (x > 24 && x < 40 && y < 30 ? Math.sin(x * 1.6) * .1 : 0) })));
    part(s, t => { poly(t, [[23, 16, 'top'], [27, 21, 'top'], [37, 21, 'bot'], [41, 16, 'bot'], [36, 14, 'top'], [32, 16, 'top'], [28, 14, 'top']], skin(C.hide, { base: .6, tex: (x, y) => Math.sin(x * 1.6) * .12 })); });
    part(s, t => stroke(t, [[25, 21.5], [39, 21.5]], 1.2, cordC(C.cord, 1.8, 14)), { line: 0 });
    return sel(s);
  };
  const toolRoll = () => {
    const s = IC(), a = [13, 44], b = [49, 26], F = frame(a, b);
    part(s, t => { haft(t, [F(F.len - 3, -2.4), F(F.len + 8, -3.4)], 1.4, C.wood, { seed: 2, round: 1 }); haft(t, [F(F.len - 3, 2), F(F.len + 6, 3)], 1.5, C.ash, { seed: 3, round: 1 }); stroke(t, [F(F.len - 3, 0), F(F.len + 10, .4)], u => 1.5 * (1 - u * .6), (u, v, d, hw, x, y) => tone(MAT.bone, .62 - v * .3, x, y), { round: 1 }); });
    part(s, t => stroke(t, [a, b], 8, (u, v, d, hw, x, y) => rp(C.hide, .56 - v * .34 + (noise(x * .5, y * .5, 4) - .5) * .16 - (u > .94 || u < .05 ? .14 : 0), x, y, .3)));
    part(s, t => { const p = F(F.len, 0); for (let k = 0; k < 26; k++) { const an = k * .5, r = 1 + k * .26; t.set(p[0] + Math.cos(an) * r * .5, p[1] + Math.sin(an) * r, C.hide[1]); } }, { line: 0 });
    part(s, t => { for (const q of [.26, .72]) stroke(t, [F(F.len * q - 1, 0), F(F.len * q + 1, 0)], 8.6, cordC(C.leather, 1.6, 3)); strand(t, F(F.len * .26, 8), F(F.len * .2, 14), C.leather, .9); strand(t, F(F.len * .26, 8), F(F.len * .34, 13), C.leather, .9); }, { line: 0 });
    return sel(s);
  };
  const weaveC = (R2, o) => (x, y, D) => { o = o || {}; const u = x + Math.sin(y * .5) * .5, k = (Math.floor(u / 3) + Math.floor(y / 2)) & 1, f = (u % 3 + 3) % 3; let L = (k ? .62 : .42) + (f < 1 ? .08 : f > 2 ? -.08 : 0) + (o.light ? o.light(x, y) : 0); if (y % 2 === 1 && !k) L -= .1; if (D && D.all < 1.2) L -= .12; return rp(R2, L, x, y, .2); };
  const basket = o => () => {
    const s = IC(), lt = bulge(32, 40, 20, 16, .22);
    part(s, t => poly(t, [[12, 26, 'top'], ...qv([12, 26], [13, 50], [22, 55], 'top', 8), [42, 55, 'bot'], ...qv([42, 55], [51, 50], [52, 26], 'bot', 8)], weaveC(C.wicker, { light: lt })));
    part(s, t => { for (let y = 20; y <= 31; y++) for (let x = 10; x <= 54; x++) { const nx = (x + .5 - 32) / 22, ny = (y + .5 - 25.5) / 5.6, q = nx * nx + ny * ny; if (q > 1) continue; t.set(x, y, q > .62 ? rp(C.wicker, (ny < 0 ? .8 : .56) + ((x >> 1) & 1 ? .08 : -.08), x, y, .2) : rp(C.dark, .2 + (o && o.fill ? 0 : (hash(x, y, 2) - .5) * .1), x, y, .3)); } });
    if (o && o.strap) part(s, t => strap(t, bez([13, 28], [32, 2], [51, 28], 14), 1.4, C.cord, { round: 1 }));
    return sel(s);
  };
  const wickerFrame = () => {
    const s = IC();
    part(s, t => { for (const sg of [-1, 1]) strap(t, bez([32 + sg * 7, 14], [32 + sg * 22, 20], [32 + sg * 13, 44], 10), 1.1, C.cord, { round: 1 }); });
    part(s, t => { for (const y of [14, 24, 34, 44, 53]) haft(t, [[17, y + (y % 3)], [47, y - (y % 2)]], 1.2, C.wicker, { seed: y, round: 1 }); for (let x = 22; x <= 42; x += 5) haft(t, [[x, 10], [x + (x % 2), 55]], .9, C.wicker, { seed: x, round: 1 }); });
    part(s, t => { haft(t, bez([17, 58], [15, 30], [19, 7], 10), 1.7, C.wood, { seed: 3, round: 1 }); haft(t, bez([47, 58], [49, 30], [45, 7], 10), 1.7, C.wood, { seed: 4, round: 1 }); haft(t, [[13, 54], [51, 54]], 1.5, C.wood, { seed: 8, round: 1 }); });
    part(s, t => { for (const [x, y] of [[17, 14], [47, 14], [17, 34], [47, 34], [17, 54], [47, 54]]) stroke(t, [[x - 2, y - 2], [x + 2, y + 2]], 1.9, cordC(C.cord, 1.5, 5)); }, { line: 0 });
    return sel(s);
  };
  const waterskin = () => {
    const s = IC(), lt = bulge(32, 40, 16, 16, .26);
    part(s, t => strap(t, bez([22, 22], [14, 4], [40, 6], 12), 1.3, C.leather, { round: 1 }));
    part(s, t => poly(t, [...qv([27, 20], [26, 26], [17, 34], 'top', 6), ...qv([17, 34], [9, 48], [22, 56], 'top', 8), ...qv([22, 56], [36, 61], [46, 52], 'bot', 8), ...qv([46, 52], [55, 40], [42, 29], 'bot', 8), ...qv([42, 29], [36, 25], [36, 20], 'bot', 6), [36, 20, 'top']], skin(C.leather, { light: lt, seed: 8, stitch: 1, stitchAt: 2.6 })));
    part(s, t => { t.rect(27, 15, 9, 6, C.leather[2]); for (let x = 27; x < 36; x++) { t.set(x, 15, C.leather[4]); t.set(x, 18, C.cord[4]); } });
    part(s, t => { t.rect(29, 10, 5, 5, C.wood[4]); t.rect(29, 10, 5, 1, C.wood[6]); t.rect(33, 11, 1, 4, C.wood[2]); });
    return sel(s);
  };
  const clayFlask = () => {
    const s = IC(), cl = { r: C.clay, d: .4, n: .14, ns: .5, shine: 0 };
    part(s, t => { blob(t, frame([32, 41], [32, 31]), 13.5, 13, cl); for (let y = 18; y < 30; y++) for (let x = 28; x <= 36; x++) t.set(x, y, tone(cl, .6 - (x - 32) * .06, x, y)); for (let x = 26; x <= 38; x++) { t.set(x, 17, C.clay[5]); t.set(x, 18, C.clay[3]); } for (let x = 21; x < 44; x += 3) { t.set(x, 37, C.clay[1]); t.set(x + 1, 46, C.clay[1]); } });
    part(s, t => { t.rect(29, 11, 7, 6, C.wood[4]); t.rect(29, 11, 7, 1, C.wood[6]); t.rect(35, 12, 1, 5, C.wood[2]); });
    part(s, t => { stroke(t, [[27, 22], [37, 22]], 1.2, cordC(C.cord, 1.8, 10)); strap(t, bez([27, 22], [14, 26], [20, 40], 8), .9, C.cord, { round: 1 }); }, { line: 0 });
    return sel(s);
  };
  const belt = o => () => {
    const s = IC(), L = o.L, cx = 32, cy = 27, rx = 24, ry = 9, bh = o.wide ? 9 : 7;
    const band = (t, front) => { for (let x = cx - rx; x <= cx + rx; x++) { const nx = (x + .5 - cx) / rx, yy = Math.sqrt(Math.max(0, 1 - nx * nx)) * ry, y0 = Math.round(cy + (front ? yy : -yy)); for (let j = 0; j < bh; j++) { const y = y0 + j; let Lm = front ? .52 - nx * .14 : .3 - nx * .06; if (j === 0) Lm += .14; if (j === bh - 1) Lm -= .14; if (front && (j === 1 || j === bh - 2) && x % 3) { t.set(x, y, rp(o.thread || C.cord, .8, x, y, 0)); continue; } t.set(x, y, rp(L, Lm + (noise(x * .5, y * .5, 3) - .5) * .12, x, y, .3)); } } };
    part(s, t => band(t, 0));
    if (o.scabbard) part(s, t => { const a = [44, 34], b = [20, 60], F = frame(a, b); stroke(t, [a, b], u => 3.4 * (1 - u * .35), (u, v, d, hw, x, y) => rp(C.leather, .5 - v * .3, x, y, .3), { round: 1 }); if (o.mount) { rod(t, [F(0, 0), F(5, 0)], 3.8, o.mount, { round: 0 }); rod(t, [F(F.len - 5, 0), F(F.len, 0)], 2.6, o.mount); } const G = frame(a, [50, 28]); rod(t, [G(1, -5), G(1, 5)], 1.3, o.mount || MAT.bronze); stroke(t, [G(1, 0), G(9, 0)], 1.6, cordC(C.leather, 2, 8), { round: 1 }); ball(t, G(10, 0), 2, o.mount || MAT.bronze); });
    part(s, t => band(t, 1));
    if (o.plates) part(s, t => { for (let k = -3; k <= 3; k++) { if (k === 0) continue; const x = cx + k * 6.4, nx = (x - cx) / rx, y = Math.round(cy + Math.sqrt(1 - nx * nx) * ry); poly(t, rrect(x - 2.6, y + 1, x + 2.6, y + bh - 1, 1), metalFace(o.plates, frame([x, y], [x, y - 1]), { bevel: 0 })); rivet(t, Math.round(x) - 1, y + (bh >> 1), o.plates); } });
    if (o.rings) part(s, t => { for (const k of [-2.6, -1.4, 1.4, 2.6]) { const x = cx + k * 7, nx = (x - cx) / rx, y = cy + Math.sqrt(1 - nx * nx) * ry + bh; rod(t, arc(x, y + 1.5, 2.4, 2.4, 0, 6.3, 12), .8, o.rings); } });
    if (o.pouches) part(s, t => { for (const [k, w2, h2] of o.pouches) { const x = cx + k * 7, nx = (x - cx) / rx, y = Math.round(cy + Math.sqrt(1 - nx * nx) * ry) + bh - 2; poly(t, rrect(x - w2, y, x + w2, y + h2, 2.5), skin(L, { base: .46, light: bulge(x, y + h2 / 2, w2, h2, .2), stitch: 1, stitchAt: 2.2 })); poly(t, [[x - w2 - .5, y - 1, 'top'], [x + w2 + .5, y - 1, 'top'], [x + w2, y + h2 * .42, 'bot'], [x, y + h2 * .56, 'bot'], [x - w2, y + h2 * .42, 'bot']], skin(L, { base: .6 })); const m2 = o.buckle || MAT.bronze; t.set(x, y + h2 * .5, m2.r[m2.r.length - 2]); } });
    if (o.sheath) part(s, t => { const a = [46, 34], b = [53, 52]; stroke(t, [a, b], u => 2.4 * (1 - u * .5), (u, v, d, hw, x, y) => rp(C.leather, .46 - v * .3, x, y, .3), { round: 1 }); haft(t, [[45, 31], [43, 26]], 1.3, C.dark, { seed: 3, round: 1 }); rod(t, [[42.4, 31.4], [47.6, 30.2]], .9, o.buckle || MAT.iron); });
    part(s, t => { const m2 = o.buckle || MAT.bronze, y = cy + ry - 1; buckle(t, cx - 4, y, m2, 8, bh + 2); for (let x = cx + 4; x < cx + 13; x++) for (let j = 2; j < bh - 1; j++) t.set(x, y + j + (x > cx + 9 ? 1 : 0), rp(L, j === 2 ? .66 : .44, x, y, .2)); });
    if (o.rune) { for (const k of [-3, -2, -1, 1, 2, 3]) { const x = cx + k * 6, nx = (x - cx) / rx, y = cy + Math.sqrt(1 - nx * nx) * ry + (bh >> 1) - 1; glyphs(s, [[x, y], [x, y]], 1, { seed: k + 3 }); } light(s, [cx, cy + ry + 3], [.5, .85, 1], 22); }
    return sel(s);
  };
  const quiver = o => () => {
    const s = IC(), a = o.a || [16, 55], b = o.b || [42, 22], F = frame(a, b), L = o.L, w0 = o.w0 || 5.4, w1 = o.w1 || 7, len = F.len;
    part(s, t => strap(t, bez(F(len * .15, -w0), F(len * .5, -22), F(len * .92, -w1), 12), 1.5, o.strapL || C.leather, { round: 1 }));
    part(s, t => { const n = o.n || 5; for (let k = 0; k < n; k++) { const r = (k - (n - 1) / 2) * (w1 * 1.5 / n), ex = (hash(k, 3, 1) - .5) * 4; fletch(t, F(len - 4, r * .8), F(len + (o.bolt ? 12 : 19) + ex, r * 1.5), o.vanes ? o.vanes[k % o.vanes.length] : C.cloth, k + 2); } });
    part(s, t => stroke(t, [a, b], u => w0 + (w1 - w0) * u + (o.flare && u > .86 ? (u - .86) * 14 : 0), (u, v, d, hw, x, y) => {
      let Lm = .52 - v * .32 + (noise(x * .45, y * .45, 5) - .5) * .14;
      if (o.wood) return woodC(o.wood, 7)(u, v, d, hw, x, y);
      if (o.seam && Math.abs(v + .2) < .7 / hw && Math.floor(u * len) % 3) return rp(C.cord, .82, x, y, 0);
      if (u > .955) Lm += .14; if (u < .05) Lm -= .1;
      return rp(L, Lm, x, y, .3);
    }, { round: o.round === undefined ? 1 : o.round }));
    for (const q of o.bands || []) part(s, t => stroke(t, [F(len * q - 1.2, 0), F(len * q + 1.2, 0)], w0 + (w1 - w0) * q + .7, o.bandM ? (u, v, d, hw, x, y) => tone(o.bandM, .58 - v * .32, x, y) : cordC(o.cord || C.cord, 1.6, 3)), { line: 0 });
    if (o.spine) part(s, t => rod(t, [F(2, -1), F(len - 2, -1)], .9, o.spine, { round: 0 }), { line: 0 });
    if (o.lid) part(s, t => poly(t, F.pts([[len - 3, -w1 - 1, 'top'], [len + 1, -w1 - 1, 'top'], [len + 1, w1 + 1, 'bot'], [len - 9, w1 + 1, 'bot'], [len - 9, w1 * .2, 'top']]), skin(L, { base: .6 })));
    if (o.loop) part(s, t => { poly(t, F.pts([[len * .5 - 3, -w1 - 5, 'top'], [len * .5 + 3, -w1 - 5, 'top'], [len * .5 + 3, -w1 + 2, 'bot'], [len * .5 - 3, -w1 + 2, 'bot']]), skin(C.leather, { base: .4 })); });
    if (o.rune) glyphs(s, [F(len * .2, 0), F(len * .8, 0)], 4);
    return sel(s);
  };
  const sheath = () => {
    const s = IC(), a = [20, 54], b = [42, 24], F = frame(a, b);
    part(s, t => { haft(t, [F(F.len - 1, 0), F(F.len + 12, 0)], 2, C.dark, { seed: 4, round: 1 }); stroke(t, [F(F.len + 2, 0), F(F.len + 10, 0)], 2.4, cordC(C.hide, 2.2, 8)); });
    part(s, t => poly(t, F.pts([[0, 0, 'bot'], ...qv([0, 0], [6, -5], [F.len, -5], 'top', 8), [F.len, 5, 'bot'], ...qv([F.len, 5], [8, 4], [0, 0], 'bot', 8)]), skin(C.hide, { seed: 6, stitch: 1, stitchAt: 2 })));
    part(s, t => poly(t, F.pts([[F.len - 12, -8, 'top'], [F.len - 5, -8, 'top'], [F.len - 5, -3, 'bot'], [F.len - 12, -3, 'bot']]), skin(C.leather, { base: .4 })));
    return sel(s);
  };
  const kit = o => () => {
    const s = IC(), L = o.L, m = o.m, lt = bulge(30, 34, 24, 14, .1);
    part(s, t => poly(t, rrect(5, 19, 53, 51, 3), skin(L, { light: lt, stitch: 1, base: .46 })));
    part(s, t => { for (let y = 17; y <= 53; y++) for (let x = 50; x <= 60; x++) { const v = (x - 55) / 5.4; if (Math.abs(v) > 1) continue; t.set(x, y, rp(L, .6 - v * .34 - (y < 19 || y > 51 ? .14 : 0), x, y, .3)); } for (const y of [26, 44]) for (let x = 50; x <= 60; x++) t.set(x, y, C.cord[4 - (x > 56 ? 2 : 0)]); });
    part(s, t => o.tools(t, m));
    part(s, t => { for (let x = 7; x < 50; x++) for (let j = 0; j < 4; j++) t.set(x, 37 + j, rp(L, j === 0 ? .66 : j === 3 ? .3 : .5, x, 37 + j, .2)); }, { k: .2 });
    return sel(s);
  };
  const knifeV = (t, x, m, o) => { o = o || {}; const top = o.top || 22; for (let y = top; y < 37; y++) { const w = y - top < 4 ? (y - top) * .5 + .5 : 1.6; for (let i = -Math.round(w); i <= Math.round(w); i++) t.set(x + i, y, tone(m, i < 0 ? .78 : i === 0 ? .6 : .4, x + i, y)); } for (let y = 41; y < 49; y++) for (let i = -1; i <= 1; i++) t.set(x + i, y, rp(o.wood || C.dark, i < 0 ? .7 : i === 0 ? .5 : .3, x + i, y, .2)); };
  const KITS = {
    iron_butchery_kit: (t, m) => { knifeV(t, 11, m); knifeV(t, 19, m, { top: 25 }); for (let y = 24; y < 37; y++) t.set(27, y, tone(m, .7, 27, y)); rod(t, arc(29, 25, 2.4, 2.4, 3.1, 6.3, 6), .7, m); for (let y = 41; y < 48; y++) t.set(27, y, C.dark[4]); for (let y = 23; y < 37; y++) for (let i = 0; i < 5; i++) { if (i === 4 && y % 2) continue; t.set(34 + i, y, tone(m, i === 0 ? .8 : .52, 34 + i, y)); } for (let y = 41; y < 49; y++) for (let i = 0; i < 4; i++) t.set(34 + i, y, rp(C.wood, .6 - i * .1, 34 + i, y, .2)); knifeV(t, 45, m, { top: 27 }); },
    steel_butchery_kit: (t, m) => { knifeV(t, 10, m); knifeV(t, 17, m, { top: 24 }); knifeV(t, 24, m, { top: 26 }); for (let y = 23; y < 37; y++) for (let i = 0; i < 5; i++) { if (i === 4 && y % 2) continue; t.set(30 + i, y, tone(m, i === 0 ? .86 : .56, 30 + i, y)); } for (let y = 41; y < 49; y++) for (let i = 0; i < 4; i++) t.set(30 + i, y, rp(C.dark, .6 - i * .1, 30 + i, y, .2)); for (const x of [40, 46]) { rod(t, [[x, 37], [x, 28], [x - 2, 25]], .8, m); rod(t, [[x, 28], [x + 2, 25]], .8, m); } },
    curriers_kit: (t, m) => { for (const x of [9, 22]) { poly(t, rrect(x, 23, x + 9, 36, 1.5), metalFace(m, frame([x, 30], [x, 29]), { bevel: 0 })); for (let y = 25; y < 35; y += 2) for (let i = 2; i < 8; i++) t.set(x + i, y, m.r[2]); } haft(t, [[36, 47], [36, 24]], 1.6, C.wood, { seed: 2, round: 1 }); haft(t, [[42, 47], [42, 26]], 1.4, C.ash, { seed: 3, round: 1 }); poly(t, rrect(44, 28, 49, 36, 1), metalFace(m, frame([46, 30], [46, 29]), { bevel: 0 })); for (let y = 41; y < 48; y++) t.set(46, y, C.dark[4]); },
    steel_curriers_kit: (t, m) => KITS.curriers_kit(t, m),
    sewing_kit: (t, m) => { for (const [x, y0] of [[9, 24], [13, 26], [17, 23]]) { for (let y = y0; y < 47; y++) t.set(x, y, tone(m, .82, x, y)); t.set(x, y0 + 1, P.ink); } for (let y = 22; y < 37; y++) t.set(23, y, tone(m, .7, 23, y)); for (let y = 41; y < 49; y++) for (let i = -1; i <= 1; i++) t.set(23 + i, y, rp(C.wood, .6 - i * .2, 23, y, .2)); for (let y = 25; y < 35; y++) for (let x = 30; x < 39; x++) t.set(x, y, rp(C.red, .5 + (y % 2 ? .12 : -.08) - (x - 34) * .04, x, y, .2)); t.rect(29, 23, 11, 2, C.ash[5]); t.rect(29, 35, 11, 2, C.ash[3]); for (let y = 24; y < 36; y++) for (let x = 43; x < 48; x++) t.set(x, y, rp(C.cloth, .6 + (y % 2 ? .1 : -.1), x, y, .2)); },
    tailors_kit: (t, m) => { for (const [x, y0] of [[9, 24], [12, 27], [15, 23]]) { for (let y = y0; y < 47; y++) t.set(x, y, tone(m, .9, x, y)); t.set(x, y0 + 1, P.ink); } for (const sg of [-1, 1]) { blade(t, [24 + sg * 1, 37], [24 + sg * 2, 21], 1.6, m, { tip: .3, fuller: 0 }); rod(t, arc(24 + sg * 3.4, 45, 2.6, 3, 0, 6.3, 12), .9, m); } t.set(24, 38, m.r[1]); for (let y = 25; y < 35; y++) for (let x = 32; x < 40; x++) t.set(x, y, rp(C.blue, .5 + (y % 2 ? .12 : -.08) - (x - 36) * .04, x, y, .2)); t.rect(31, 23, 10, 2, C.ash[5]); t.rect(31, 35, 10, 2, C.ash[3]); for (let y = 23; y < 37; y++) t.set(45, y, tone(m, .7, 45, y)); for (let y = 41; y < 49; y++) for (let i = -1; i <= 1; i++) t.set(45 + i, y, rp(C.bone, .7 - i * .15, 45, y, .2)); },
  };
  const tongs = (m, o) => () => {
    const s = IC(), pv = [38, 28];
    if (o.wood) { part(s, t => haft(t, [[10, 51], [34, 30], ...bez([34, 30], [45, 18], [50, 20], 6).slice(1), ...bez([50, 20], [52, 26], [42, 33], 6).slice(1), [17, 57]], 1.5, R('#3c4a1e #54662a #6e8238 #8a9e4c #a6b866 #c0d088'), { seed: 3, round: 1 })); part(s, t => stroke(t, [[44, 17], [51, 24]], 2.3, cordC(C.cord, 1.6, 8)), { line: 0 }); return sel(s); }
    part(s, t => rod(t, [[9, 48], [pv[0] - 6, pv[1] + 3], pv, [48, 15], [54, 13]], 1.4, m));
    part(s, t => rod(t, [[14, 56], [pv[0] - 3, pv[1] + 7], pv, [51, 21], [56, 17]], 1.4, m));
    part(s, t => { ball(t, pv, 2.4, m); s.set(pv[0], pv[1], m.r[1]); });
    return sel(s);
  };
  const mold = o => () => {
    const s = IC(), m = o.metal, cl = { r: C.clay, d: .4, n: .16, ns: .5, shine: 0 }, T = (L, x, y) => m ? tone(m, L, x, y) : tone(cl, L, x, y);
    part(s, t => { for (let y = 22; y <= 50; y++) for (let x = 8; x <= 56; x++) { const top = y < 40; let L = top ? .58 - (x - 32) * .003 : .36; if (y === 22 || x === 8) L += .16; if (y === 39 || y === 40) L -= .06; if (x === 56 || y === 50) L -= .14; t.set(x, y, T(L, x, y)); } const cav = o.tile ? [[12, 26, 30, 36], [34, 26, 52, 36]] : [[14, 26, 50, 36]]; for (const [x0, y0, x1, y1] of cav) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { let L = .2; if (y === y0 || x === x0) L = .08; if (y === y1 || x === x1) L = .34; if (o.tile && y > y0 && y < y1 && (x - x0) % 4 === 2) L += .1; t.set(x, y, T(L, x, y)); } });
    if (!o.tile) part(s, t => { for (let y = 28; y <= 34; y++) for (let x = 44; x <= 55; x++) if (x > 49) t.set(x, y, T(.16, x, y)); }, { line: 0 });
    return sel(s);
  };
  const torch = () => {
    const s = IC(), a = [18, 56], b = [38, 26];
    part(s, t => haft(t, [a, b], u => 2 + u * .5, C.wood, { seed: 5, round: 1, knot: .4, len: 36 }));
    part(s, t => { blob(t, frame(b, [44, 17], .5), 8, 5.4, { r: C.cloth, d: .5, n: .3, ns: .8, shine: 0 }); stroke(t, [[36, 28], [41, 21]], 5.6, (u, v, d, hw, x, y) => (Math.floor(u * 5 + v) & 1) ? rp(C.char, .5, x, y, .4) : null); });
    flame2(s, 43, 17, 5, 15, 0); light(s, [43, 10], [1, .62, .24], 60); s.emit.flicker = 1;
    return sel(s);
  };
  const candle = () => {
    const s = IC();
    part(s, t => { for (let y = 46; y <= 55; y++) for (let x = 18; x <= 46; x++) { const nx = (x + .5 - 32) / 14.5, ny = (y + .5 - 50.5) / 5; if (nx * nx + ny * ny > 1) continue; t.set(x, y, tone(MAT.bronze, nx * nx + ny * ny > .6 ? (ny < 0 ? .8 : .3) : .5 - nx * .14, x, y)); } });
    part(s, t => { for (let y = 22; y <= 50; y++) for (let x = 26; x <= 37; x++) { const u = (x - 31.5) / 6; t.set(x, y, rp(C.bone, .78 - u * .22 - (y > 46 ? .1 : 0), x, y, .2)); } for (const [x, l] of [[27, 9], [34, 14], [37, 6]]) for (let k = 0; k < l; k++) t.set(x, 22 + k, C.bone[7]); t.set(34, 37, C.bone[7]); t.set(35, 37, C.bone[7]); t.rect(31, 19, 1, 3, P.ink); });
    flame2(s, 31, 19, 2, 9, 0); light(s, [31, 14], [1, .7, .3], 36); s.emit.flicker = 1;
    return sel(s);
  };
  const cookPot = () => {
    const s = IC(), cl = { r: C.clay, d: .45, n: .2, ns: .5, pit: .05, shine: 0 };
    part(s, t => { blob(t, frame([32, 40], [32, 30]), 16, 19, cl); for (let x = 12; x <= 52; x++) for (let y = 53; y < 60; y++) t.set(x, y, null); for (const x of [11, 50]) for (let y = 33; y < 40; y++) for (let i = 0; i < 3; i++) t.set(x + i, y, tone(cl, .5 - i * .1, x + i, y)); for (let x = 16; x < 49; x += 3) t.set(x, 44 + ((x >> 1) & 1), C.clay[1]); });
    part(s, t => { for (let y = 20; y <= 31; y++) for (let x = 15; x <= 49; x++) { const nx = (x + .5 - 32) / 17, ny = (y + .5 - 25.5) / 5.6, q = nx * nx + ny * ny; if (q > 1) continue; t.set(x, y, q > .6 ? tone(cl, ny < 0 ? .8 : .56, x, y) : rp(C.char, .3 + (hash(x, y, 2) - .5) * .2, x, y, .3)); } });
    return sel(s);
  };
  const wheel = (t, x, y, r) => { for (let a = 0; a < 4; a++) { const an = a / 4 * 3.1416 + .3; haft(t, [[x - Math.cos(an) * r, y - Math.sin(an) * r], [x + Math.cos(an) * r, y + Math.sin(an) * r]], .9, C.ash, { seed: a }); } stroke(t, arc(x, y, r, r, 0, 6.3, 28), 1.5, (u, v, d, hw, x2, y2) => v > .2 ? tone(MAT.iron, .5 - (x2 - x + y2 - y) * .03, x2, y2) : rp(C.wood, .5 - (x2 - x + y2 - y) * .02, x2, y2, .2)); ball(t, [x, y], 2, MAT.iron); };
  const barrow = cart => () => {
    const s = IC(), WP2 = (x, y, D) => rp(C.ash, .54 - (y - 30) * .012 + (hash(Math.floor(y / 4), 3, 2) - .5) * .12 - (y % 4 === 3 ? .16 : 0) - (D.all < 1.2 ? .12 : 0), x, y, .25);
    if (cart) {
      part(s, t => { haft(t, [[46, 34], [61, 26]], 1.4, C.wood, { seed: 4, round: 1 }); haft(t, [[8, 44], [50, 44]], 1.4, C.dark, { seed: 2 }); });
      part(s, t => poly(t, [[6, 22, 'top'], [50, 22, 'top'], [47, 42, 'bot'], [9, 42, 'bot']], WP2));
      part(s, t => { for (const x of [10, 27, 44]) for (let y = 23; y < 42; y++) { t.set(x, y, C.wood[2]); t.set(x + 1, y, C.wood[5]); } rod(t, [[6, 22], [50, 22]], 1.1, C.ash, { round: 0 }); });
      part(s, t => wheel(t, 27, 47, 10));
    } else {
      part(s, t => { haft(t, [[30, 40], [3, 30]], 1.4, C.wood, { seed: 4, round: 1 }); haft(t, [[26, 44], [20, 57]], 1.3, C.wood, { seed: 6, round: 1 }); });
      part(s, t => poly(t, [[12, 20, 'top'], [54, 24, 'top'], [48, 42, 'bot'], [22, 42, 'bot']], WP2));
      part(s, t => { rod(t, [[12, 20], [54, 24]], 1.1, C.ash, { round: 0 }); for (const x of [24, 36, 47]) for (let y = 24; y < 42; y++) { t.set(x, y, C.wood[2]); } });
      part(s, t => wheel(t, 47, 49, 9));
    }
    return sel(s);
  };
  const LEA = { hide: C.hide, leather: C.leather, dark: C.dark, black: C.black };
  X.hdGear = { rrect, skin, bulge, strap, buckle, rivet, fletch, weaveC };
  makers.push(o => {
    const id = o.id;
    if (o.group !== 'Tool') return null;
    if (o.sub === 'Storage') {
      if (id === 'waterskin') return waterskin;
      if (id === 'flask') return clayFlask;
      if (id === 'woven_basket') return basket({});
      if (id === 'hide_tool_roll') return toolRoll;
      if (id === 'hide_scrip') return pouch;
      if (id === 'linen_snapsack') return snapsack;
      if (id === 'wicker_frame') return wickerFrame;
      if (id === 'leather_knapsack') return pack({ L: C.leather, buckle: MAT.bronze });
      if (id === 'framed_leather_pack') return pack({ L: C.leather, frame: C.wood, top: 25, flap: 11, w: 15, roll: C.cloth });
      if (id === 'iron_buckled_knapsack') return pack({ L: C.leather, buckle: MAT.iron, pocket: 1, flap: 11 });
      if (id === 'iron_framed_pack') return pack({ L: C.dark, frame: C.wood, corners: MAT.iron, buckle: MAT.iron, top: 25, flap: 10, w: 15, side: 1 });
      if (id === 'steel_riveted_knapsack') return pack({ L: C.dark, frame: C.dark, buckle: MAT.steel, rivets: MAT.steel, top: 26, flap: 11, w: 15, roll: C.red, pocket: 1 });
      if (id === 'steel_framed_pack') return pack({ L: C.dark, frame: MAT.steel, buckle: MAT.steel, rivets: MAT.steel, top: 27, flap: 10, w: 16, roll: C.cloth, side: 1, pocket: 1 });
      if (id === 'rune_stitched_knapsack') return pack({ L: C.black, buckle: MAT.alloy, rune: 1, thread: R('#2a6a8a #3a8aaa #5ab0cc #8ad6ea #c0f0fa'), flap: 14 });
      if (id === 'rune_bound_frame_pack') return pack({ L: C.black, frame: MAT.alloy, buckle: MAT.alloy, rivets: MAT.alloy, rune: 1, top: 27, flap: 10, w: 16, side: 1, roll: C.blue });
      if (id === 'iron_buckled_satchel') return satchel({ L: C.leather, buckle: MAT.iron });
      if (id === 'steel_buckled_satchel') return satchel({ L: C.dark, buckle: MAT.steel, one: 1 });
      if (id === 'rune_woven_satchel') return satchel({ L: R('#1c1440 #2c2260 #423484 #5e4ea8 #8070c6 #a898de #d0c6f2'), silk: 1, rune: 1, thread: C.gold, strapL: R('#1c1440 #2c2260 #423484 #5e4ea8 #8070c6'), tex: (x, y) => Math.sin(x * .5 + y * .3) * .06 });
      if (id === 'leather_belt') return belt({ L: C.leather, pouches: [[-2, 4.6, 10], [2.2, 4.6, 10]], buckle: MAT.bronze });
      if (id === 'ringed_belt') return belt({ L: C.leather, rings: MAT.iron, pouches: [[0, 4, 9]], buckle: MAT.iron, sheath: 1 });
      if (id === 'steel_buckled_belt') return belt({ L: C.dark, wide: 1, rings: MAT.steel, pouches: [[-2.2, 5.6, 13], [.4, 3.6, 8]], buckle: MAT.steel, sheath: 1 });
      if (id === 'rune_etched_belt') return belt({ L: C.black, wide: 1, plates: MAT.alloy, buckle: MAT.alloy, rune: 1 });
      if (id === 'hide_knife_sheath') return sheath;
      if (id === 'leather_sword_belt') return belt({ L: C.leather, scabbard: 1, buckle: MAT.bronze });
      if (id === 'mounted_sword_belt') return belt({ L: C.dark, scabbard: 1, mount: MAT.iron, buckle: MAT.iron });
      if (id === 'plated_war_belt') return belt({ L: C.dark, wide: 1, plates: MAT.steel, scabbard: 1, mount: MAT.steel, buckle: MAT.steel });
      if (id === 'hide_arrow_sheath') return quiver({ L: C.hide, bands: [.1, .5, .9], n: 4, vanes: [C.hide, C.cloth] });
      if (id === 'leather_back_quiver') return quiver({ L: C.leather, flare: 1, seam: 1, n: 6, vanes: [C.cloth, C.red, C.cloth], w1: 7.4, bands: [.94], cord: C.dark });
      if (id === 'stiffened_war_quiver') return quiver({ L: C.dark, spine: MAT.iron, bands: [.08, .5, .93], bandM: MAT.iron, n: 7, vanes: [C.red, C.cloth], w0: 6, w1: 7.6, round: 0 });
      if (id === 'leather_bolt_case') return quiver({ L: C.leather, a: [20, 52], b: [40, 28], w0: 7.4, w1: 7.8, bolt: 1, n: 5, seam: 1, lid: 1, loop: 1, round: 0, vanes: [C.wicker, C.leather] });
      if (id === 'banded_bolt_quiver') return quiver({ wood: C.dark, a: [20, 52], b: [40, 28], w0: 7.4, w1: 7.8, bolt: 1, n: 5, bands: [.1, .5, .92], bandM: MAT.iron, loop: 1, round: 0, vanes: [C.wicker, C.leather] });
      return null;
    }
    const m = matOf(o);
    if (KITS[id]) return kit({ L: /sewing|tailor/.test(id) ? C.cloth : /steel/.test(id) ? C.dark : C.leather, m, tools: KITS[id] });
    if (id === 'bone_fleshing_scraper') return () => { const s = IC(), a = [12, 54], b = [40, 26], F = frame(a, b, 1); part(s, t => poly(t, rough(F.pts([[-3, -3, 'top'], ...qv([-3, -3], [6, -13], [19, -12], 'top', 6), ...qv([19, -12], [24, 0], [19, 12], 'edge', 8), ...qv([19, 12], [6, 13], [-3, 3], 'bot', 6), [-3, 3, 'poll']]), .8, 5, ['edge']), (x, y, D) => { const [q, r] = F.inv(x, y); let L = .6 - r * .012 + (hash(Math.floor(Math.atan2(r, q + 8) * 14), 2, 3) - .5) * .12; if (D.edge < 2) L += .16; if (Math.abs(r) < 1 && q < 14) L += .14; if (D.all < 1.2) L -= .12; return tone(MAT.bone, L, x, y); })); part(s, t => hafts.branch(t, a, F(4, 0), { seed: 7, bend: 1 })); part(s, t => stroke(t, [F(-5, 0), F(3, 0)], 3.4, cordC(C.sinew, 2, 8)), { line: 0 }); return sel(s); };
    if (id === 'iron_fleshing_knife') return () => { const s = IC(), pts = bez([12, 30], [32, 52], [52, 30], 16); part(s, t => stroke(t, pts, u => 2.2 + Math.sin(u * 3.1416) * 2.4, (u, v, d, hw, x, y) => tone(m, v > .55 ? .88 : v > .3 ? .36 : v < -.6 ? .34 : .56 + Math.max(0, Math.sin(u * 16) - .8) * .5, x, y))); part(s, t => { for (const [p, q] of [[[12, 30], [7, 18]], [[52, 30], [57, 18]]]) { rod(t, [p, lerp(p, q, .3)], 1, m); haft(t, [lerp(p, q, .25), q], 2.6, C.ash, { seed: p[0], round: 1 }); } }); return sel(s); };
    if (/tongs/.test(id)) return tongs(m, { wood: /wooden/.test(id) });
    if (/mold/.test(id)) return mold({ tile: /tile/.test(id), metal: /tile/.test(id) ? MAT.bronze : null });
    if (id === 'torch') return torch;
    if (id === 'candle') return candle;
    if (id === 'clay_cooking_pot') return cookPot;
    if (id === 'wheelbarrow') return barrow(0);
    if (id === 'handcart') return barrow(1);
    return null;
  });
})();
