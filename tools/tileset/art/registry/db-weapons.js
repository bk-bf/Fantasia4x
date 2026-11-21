'use strict';
(() => {
  const X = DBX, { C, MAT, matOf, tierOf, tone, flake, IC, lerp, frame, stroke, poly, qv, bez, arc, rough, sel, part, woodC, haft, cordC, lash, strand, metalFace, bladeC, blade, ball, glyphs, makers } = X.hd;
  const { hafts, langet, axeHead, stoneHead, bindings, collar, blob } = X.hdTools;
  const GEMS = { ember: GEM.ruby, pyre: GEM.ruby, cinder: GEM.ruby, frost: GEM.sapphire, rime: GEM.sapphire, hoarfrost: GEM.sapphire, spark: GEM.topaz, tempest: GEM.topaz, storm: GEM.topaz };
  const GLOW = { ruby: [1, .45, .3], sapphire: [.45, .7, 1], topaz: [1, .85, .4] };
  const rod = (s, pts, w, m, o) => stroke(s, pts, w, (t, u, v, hw, x, y) => {
    let L = u < -.3 ? .74 : u < .35 ? .5 : .28;
    if (hw > 1.4 && Math.abs(u + .4) < .5 / hw) L = .92;
    if (o && o.band && Math.floor(t * o.band) % 2) L -= .14;
    return m.r ? tone(m, L, x, y) : rp(m, L, x, y, .2);
  }, { round: !o || o.round === undefined ? 1 : o.round });
  const gem = (s, p, r, ramp, e) => { s.ball(p[0], p[1], r, r, 5, ramp, { facet: Math.max(2, r * .7), d: .2, e: e === undefined ? 170 : e, seed: 3 }); s.set(Math.round(p[0] - r * .4), Math.round(p[1] - r * .45), ramp[ramp.length - 1], 220); };
  const light = (s, p, col, rad) => { s.emit = { dx: p[0], dy: p[1], rad: rad || 22, col }; };
  const GR = {
    wrap: R2 => cordC(R2, 2.6, 12),
    wood: W => woodC(W, 5),
    wire: m => (t, u, v, hw, x, y) => tone(m, (Math.floor(t * 12) & 1 ? .74 : .4) - u * .2, x, y),
    cast: m => (t, u, v, hw, x, y) => tone(m, .56 - u * .3 - (Math.abs(((t * 3.2) % 1) - .5) < .1 ? .22 : 0), x, y),
  };
  const guards = {
    bar: (m, w, th) => (s, F, g) => rod(s, [F(g, -w), F(g, w)], th || 1.5, m),
    curve: (m, w) => (s, F, g) => { rod(s, [F(g + 2.6, -w), F(g + .6, -w * .6), F(g, 0), F(g + .6, w * .6), F(g + 2.6, w)], 1.5, m); ball(s, F(g + 2.8, -w), 1.6, m); ball(s, F(g + 2.8, w), 1.6, m); },
    cast: (m, w) => (s, F, g) => poly(s, F.pts([[g - 3, -1.8, 'top'], [g + 1, -w, 'top'], [g + 4, -w + .6, 'top'], [g + 2.4, 0, 'bot'], [g + 4, w - .6, 'bot'], [g + 1, w, 'bot'], [g - 3, 1.8, 'poll']]), metalFace(m, F, { bevel: 0 })),
    disc: (m, w) => (s, F, g) => rod(s, [F(g, -w), F(g, w)], 2, m, { round: 0 }),
    swept: (m, w) => (s, F, g) => { rod(s, [F(g, -w), F(g, w)], 1.2, m); rod(s, bez(F(g, w), F(g * .45, w + 3.5), F(.5, 1.2), 10), .9, m); rod(s, arc(F(g + 2.4, 0)[0], F(g + 2.4, 0)[1], 3.2, 3.2, 0, 6.3, 18), .8, m); },
    spiked: (m, w) => (s, F, g) => { poly(s, F.pts([[g - 1.4, -w, 'top'], [g + 3.4, -w - 1.6, 'top'], [g + 1.4, -1.4, 'top'], [g + 1.4, 1.4, 'bot'], [g + 3.4, w + 1.6, 'bot'], [g - 1.4, w, 'poll']]), metalFace(m, F, { bevel: 0 })); },
  };
  const pommels = {
    ball: (m, r) => (s, F) => ball(s, F(0, 0), r || 2.6, m),
    wheel: (m, r) => (s, F) => { ball(s, F(0, 0), r || 3, m, { ry: r || 3 }); const p = F(0, 0); s.set(p[0], p[1], m.r[1]); },
    lobed: m => (s, F) => { ball(s, F(.4, -2.2), 1.8, m); ball(s, F(.4, 2.2), 1.8, m); ball(s, F(-.6, 0), 2.4, m); },
    gem: (m, ramp) => (s, F) => { ball(s, F(0, 0), 3.2, m); gem(s, F(0, 0), 2, ramp); },
    spike: m => (s, F) => poly(s, F.pts([[2, -2.2, 'top'], [-5, 0, 'bot'], [2, 2.2, 'poll']]), metalFace(m, F, { bevel: 0 })),
    ring: m => (s, F) => rod(s, arc(F(-2.4, 0)[0], F(-2.4, 0)[1], 2.8, 2.8, 0, 6.3, 16), 1, m),
  };
  const hiltOf = (o, m) => {
    const id = o.id, T = tierOf(o), bz = /bronze|copper/.test(id);
    if (/orc|gravemaker|flenser|chainbiter|anvil|reaver|iron_tide/.test(id)) return { grip: GR.wrap(C.red), guard: guards.spiked(MAT.orc, 4.6), pommel: pommels.spike(MAT.orc) };
    if (/goblin|kobold|gnoll|warren/.test(id)) return { grip: GR.wrap(C.cloth) };
    if (T === 4) return { grip: GR.wire(MAT.gold), guard: guards.curve(MAT.alloy, 7.4), pommel: pommels.gem(MAT.alloy, GEM.sapphire), rune: 1 };
    if (T === 3) return { grip: GR.wrap(C.leather), guard: guards.curve(MAT.steel, 7), pommel: pommels.wheel(MAT.steel) };
    if (T === 2) return { grip: GR.wood(C.dark), guard: guards.bar(MAT.iron, 5.4, 1.6), pommel: pommels.lobed(MAT.iron) };
    if (bz) return { grip: GR.cast(m), guard: guards.cast(m, 5), pommel: pommels.wheel(m, 3.2) };
    return { grip: GR.wrap(C.hide) };
  };
  const hilt = (s, F, g, h, gw) => {
    part(s, t => stroke(t, [F(1, 0), F(g + .5, 0)], gw || 2, h.grip, { round: 1 }));
    if (h.guard) part(s, t => h.guard(t, F, g));
    if (h.pommel) part(s, t => h.pommel(t, F));
  };
  const runes = (s, F, q0, q1, n, col) => { glyphs(s, [F(q0, -.8), F(q1, -.8)], n, { col: col || [150, 235, 255] }); };
  const sword = (m, o) => () => {
    const s = IC(), a = o.a || [9, 55], b = o.b || [55, 9], F = frame(a, b), g = o.g || 11, h = o.hilt, w = o.w || 3.6;
    part(s, t => blade(t, F(g - 1, 0), b, w, m, { leaf: o.leaf, tip: o.tip === undefined ? .82 : o.tip, fuller: o.fuller === undefined ? .7 : o.fuller, taper: o.taper, pow: o.pow }));
    if (h.rune || o.rune) { runes(s, F, g + 6, F.len * .62, o.runes || 5); light(s, F(F.len * .5, 0), [.5, .85, 1], 18); }
    hilt(s, F, g, h, o.gw);
    return sel(s);
  };
  const backsword = (m, o) => () => {
    const s = IC(), a = o.a || [12, 52], b = o.b || [52, 12], F = frame(a, b), g = o.g || 10, h = o.hilt, w = o.w || 4, L = F.len;
    part(s, t => poly(t, F.pts([[g, -w * .62, 'top'], [L * (o.clip || .72), -w * .62, 'top'], [L, w * .5, 'edge'], ...qv([L, w * .5], [L * .62, w * 1.05], [g, w * .62], 'edge', 10), [g, w * .62, 'poll']]), metalFace(m, F, { bevel: 2.2, fuller: (q, r) => r > -w * .4 && r < -w * .12 && q > g + 3 && q < L * .64 })));
    if (h.rune) runes(s, F, g + 5, L * .6, 4);
    hilt(s, F, g, h, o.gw);
    return sel(s);
  };
  const cleaver = (m, o) => () => {
    const s = IC(), a = o.a || [12, 52], b = o.b || [50, 14], F = frame(a, b), g = o.g || 12, h = o.hilt, w = o.w || 8, L = F.len;
    let pts = [[g, -2, 'top'], [g + 2.5, -w * .56, 'top'], [L - (o.square ? 0 : 5), -w * .64, 'top'], [L, -w * (o.square ? .64 : .26), 'top'], [L, w * .74, 'edge'], ...qv([L, w * .74], [L * .62, w * 1.02], [g + 3.5, w * .8], 'edge', 10), [g + 3.5, w * .8, 'bot'], [g + 1.5, 2, 'bot'], [g, 2, 'poll']];
    pts = F.pts(pts); if (m.jag || o.rough) pts = rough(pts, 1.6, 7, ['top']);
    part(s, t => { poly(t, pts, metalFace(m, F, { bevel: 3, fuller: (q, r) => m !== MAT.bone && Math.abs(r + w * .34) < .6 && q > g + 5 && q < L - 6 })); if (o.hole) { const p = F(L - 5, -w * .28); for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) t.set(p[0] + dx, p[1] + dy, null); } });
    if (h.rune) { runes(s, F, g + 6, L - 8, 4); light(s, F(L * .6, 0), [.5, .85, 1], 18); }
    hilt(s, F, g, h, 2.1);
    return sel(s);
  };
  const dagger = (m, o) => () => {
    const s = IC(), a = [17, 47], b = [47, 17], F = frame(a, b), g = 10, h = o.hilt, T = o.tier;
    if (o.stone) part(s, t => X.hdTools.flintLeaf(t, frame(a, b, .3), F.len * .7, 5.6, 33));
    else if (o.bone) part(s, t => stroke(t, bez(F(g - 1, 0), F(F.len * .6, -2.6), b, 10), u => 3.4 * Math.pow(1 - u, .7) + .3, (u, v, d, hw, x, y) => tone(MAT.bone, .62 - v * .3 + (hash(Math.floor(d * 1.3 + 9), 2, 3) - .5) * .12, x, y), { round: 1 }));
    else part(s, t => blade(t, F(g - 1, 0), b, o.w || 3.2, m, { leaf: o.leaf, tip: o.tip === undefined ? .55 : o.tip, fuller: o.fuller || 0, taper: o.taper, pow: o.pow }));
    if (h.rune) runes(s, F, g + 4, F.len * .7, 3);
    hilt(s, F, g, h, 1.9);
    return sel(s);
  };
  const battleAxe = (m, o) => () => {
    const s = IC(), a = o.a || [11, 55], b = o.b || [49, 17], F = frame(a, b, o.t || .8, o.k || 1), T = o.tier, hd = axeHead(o.head || {});
    part(s, t => (T >= 3 ? hafts.fine : T === 2 ? hafts.shaped : hafts.branch)(t, a, F(o.top || 7, 0), o.haft));
    if (T >= 3) part(s, t => langet(t, F, -5, -14, m), { line: 0 });
    const draw = (t, pts) => { let p = F.pts(pts); if (m.jag) p = rough(p, 1.8, 5, ['top', 'bot', 'poll']); poly(t, p, metalFace(m, F, { eye: 3, bevel: o.bevel || 3 })); };
    if (o.double) part(s, t => draw(t, hd.map(p => [p[0], -p[1], p[2]])));
    part(s, t => draw(t, hd));
    if (o.spike) part(s, t => blade(t, F(4, 0), F(15, 0), 2, m, { tip: .2 }));
    if (o.rune) { runes(s, F, -3, 3, 1); glyphs(s, [F(2, -13), F(-3, -9)], 2, { seed: 3 }); light(s, F(0, -10), [.5, .85, 1], 18); }
    if (o.lash) part(s, t => bindings(t, F, 3.6, C.hide, [[-9, -5.4], [5.4, 7.4]]), { line: 0 });
    return sel(s);
  };
  const stoneAxe = (o) => () => {
    const s = IC(), a = [13, 53], b = [47, 19], F = frame(a, b, .8, 1.1);
    part(s, t => stoneHead(t, F, [[2.6, 6, 'back'], ...qv([3.8, -3], [4.4, -10], [9, -15], 'edge'), ...qv([9, -15], [0, -20], [-9, -15], 'edge'), ...qv([-9, -15], [-4.4, -10], [-3.8, -3], 'edge'), [-3.8, -3, 'bot'], [-2.6, 6, 'back']], 51, { pitch: 4.4 }));
    part(s, t => hafts.branch(t, a, F(10, 0), { club: 2.4, seed: 51 }));
    part(s, t => bindings(t, F, 4.4, C.hide, [[4.4, 7.2], [-7.4, -4.6]]), { line: 0 });
    if (o.bones) part(s, t => { for (const q of [-16, -20]) ball(t, F(q, 3.4), 1.5, MAT.bone); strand(t, F(-14, 1), F(-22, 4), C.hide, .8); }, { line: 0 });
    return sel(s);
  };
  const hammer = (m, o) => () => {
    const s = IC(), a = o.a || [11, 55], b = o.b || [47, 19], F = frame(a, b, o.t || .82, o.k || 1), T = o.tier, hl = o.len || 9, th = o.th || 5;
    part(s, t => (T >= 3 ? hafts.fine : T === 2 ? hafts.shaped : hafts.branch)(t, a, F(th + 2, 0), o.haft));
    if (T >= 3) part(s, t => langet(t, F, -th, -th - 10, m), { line: 0 });
    if (o.maul) {
      part(s, t => poly(t, F.pts([[th, -hl, 'top'], [th + .8, -hl + 2, 'top'], [th + .8, hl - 2, 'top'], [th, hl, 'poll'], [-th, hl, 'bot'], [-th - .8, hl - 2, 'bot'], [-th - .8, -hl + 2, 'bot'], [-th, -hl, 'edge']]), (x, y, D) => {
        const [q, r] = F.inv(x, y); let L = .5 - q * .03 - (D.all < 1.3 ? .1 : 0);
        if (o.bands && (Math.abs(Math.abs(r) - hl + 3) < 1.1)) return tone(o.bands, .6 - q * .04, x, y);
        if (m === MAT.bone) L += (hash(Math.floor(q * 1.2), 3, 3) - .5) * .14;
        if (o.wood) return rp(o.wood, L + (hash(Math.floor(q * 1.1 + Math.sin(r * .4)), 5, 3) - .5) * .2, x, y, .25);
        if (D.edge < 1.4 || D.poll < 1.4) L += .14;
        return tone(m, L, x, y);
      }));
    } else {
      part(s, t => poly(t, F.pts([[th, -hl, 'top'], [th - .8, -hl + 3, 'top'], [th - 1.4, -3, 'top'], [th - 1.4, 3, 'top'], ...qv([th - 1.6, 3], [2, hl * .7], [0, hl + 5], 'top', 6), ...qv([0, hl + 5], [-2, hl * .7], [-th + 1.6, 3], 'bot', 6), [-th + 1.4, 3, 'bot'], [-th + 1.4, -3, 'bot'], [-th + .8, -hl + 3, 'bot'], [-th, -hl, 'edge']]), metalFace(m, F, { eye: 2.6, bevel: 1.6 })));
      if (o.spike) part(s, t => blade(t, F(th - 1.5, 0), F(th + 9, 0), 1.8, m, { tip: .15 }));
    }
    if (o.rune) { runes(s, F, -2, 2, 1); glyphs(s, [F(1, -hl + 4), F(-2, -hl + 7)], 2, { seed: 2 }); light(s, F(0, 0), [.5, .85, 1], 18); }
    if (o.wire) part(s, t => { for (const r of [-hl + 4, 0, hl - 4]) strand(t, F(th + .6, r), F(-th - .6, r + 1.5), C.iron, .8); }, { line: 0 });
    return sel(s);
  };
  const mace = (m, o) => () => {
    const s = IC(), a = [13, 53], b = [45, 21], F = frame(a, b, 1), T = o.tier;
    if (o.club) {
      part(s, t => stroke(t, bez(a, frame(a, b)(20, 2), F(10, 0), 12), u => 2.2 + Math.pow(u, 1.6) * (o.club - 2.2) + (u < .06 ? .5 : 0), o.bone ? (u, v, d, hw, x, y) => tone(MAT.bone, .6 - v * .3 + (hash(Math.floor(d * 1.2 + 9), 2, 3) - .5) * .12, x, y) : woodC(C.wood, 61, { knot: .7, len: 50 }), { round: 1 }));
      if (o.bone) part(s, t => { for (const [q0, r0, q1, r1] of [[2, -2, 9, -9], [6, 2, 14, 7], [8, -1, 17, -4]]) stroke(t, [F(q0, r0), F(q1, r1)], u => 1.8 * (1 - u * .7), (u, v, d, hw, x, y) => tone(MAT.bone, .66 - v * .3, x, y), { round: 1 }); });
      else if (o.studs) part(s, t => { for (const [q, r] of [[0, -3], [4, 2.6], [8, -2], [-3, 2], [6, -4.6]]) { const p = F(q, r); ball(t, p, 1.5, o.studs); } }, { line: 0 });
      part(s, t => stroke(t, [frame(a, b)(3, 0), frame(a, b)(11, 0)], 2.7, cordC(C.hide, 2.4, 8)), { line: 0 });
      return sel(s);
    }
    part(s, t => (T >= 3 ? hafts.fine : T >= 2 ? hafts.shaped : hafts.branch)(t, a, F(0, 0)));
    part(s, t => collar(t, F, m, -4, 0, 3));
    if (o.flange) {
      part(s, t => { for (const sg of [-1, 1]) poly(t, F.pts([[0, sg * 2, 'bot'], [3, sg * 8.5, 'top'], [8, sg * 9.5, 'top'], [12, sg * 5.5, 'top'], [14, sg * 2, 'top']]), metalFace(m, F, { bevel: 0 })); });
      part(s, t => poly(t, F.pts([[-.5, -2.6, 'top'], [14.5, -2.6, 'top'], [14.5, 2.6, 'bot'], [-.5, 2.6, 'poll']]), (x, y, D) => { const [q, r] = F.inv(x, y); return tone(m, Math.abs(r) < .8 ? .9 : r < 0 ? .62 : .34, x, y); }));
      part(s, t => ball(t, F(16, 0), 2.2, m));
    } else {
      part(s, t => ball(t, F(7, 0), o.r || 7.5, m));
      part(s, t => { for (const [q, r] of [[7, -8.6], [7, 8.6], [15.6, 0], [13, -6], [13, 6], [1.5, -6.4], [1.5, 6.4]]) poly(t, F.pts([[q - 1.6, r - 1.6, 'top'], [q + (q - 7) * .34, r + r * .34, 'top'], [q + 1.6, r + 1.6, 'bot']]), metalFace(m, F, { bevel: 0 })); for (const [q, r] of [[5, -3], [9, 2], [8, -4.4], [4, 3]]) { const p = F(q, r); t.set(p[0], p[1], m.r[m.r.length - 1]); t.set(p[0] + 1, p[1] + 1, m.r[1]); } });
    }
    if (o.rune) { glyphs(s, [F(3, 0), F(11, 0)], 3); light(s, F(7, 0), [.5, .85, 1], 18); }
    return sel(s);
  };
  const spikeBall = (s, p, r, m) => {
    for (let k = 0; k < 8; k++) { const an = k / 8 * 6.283 + .3, c = Math.cos(an), sn = Math.sin(an); poly(s, [[p[0] + c * r * .7 - sn * 1.5, p[1] + sn * r * .7 + c * 1.5, 'top'], [p[0] + c * (r + 3.4), p[1] + sn * (r + 3.4), 'bot'], [p[0] + c * r * .7 + sn * 1.5, p[1] + sn * r * .7 - c * 1.5, 'poll']], (x, y) => tone(m, c + sn < 0 ? .78 : .4, x, y)); }
    ball(s, p, r, m);
    for (const [dx, dy] of [[-.2, -.3], [.35, .1], [-.1, .45]]) { const x = Math.round(p[0] + dx * r), y = Math.round(p[1] + dy * r); s.set(x, y, m.r[m.r.length - 1]); s.set(x + 1, y + 1, m.r[1]); }
  };
  const chain = (s, pts, m) => {
    let L = 0; const acc = [0]; for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); acc.push(L); }
    const at = d => { let i = 1; while (i < pts.length - 1 && acc[i] < d) i++; return lerp(pts[i - 1], pts[i], (d - acc[i - 1]) / (acc[i] - acc[i - 1] || 1)); };
    for (let d = 1.5, k = 0; d < L; d += 3.2, k++) { const p = at(d), q = at(Math.min(L, d + .5)), dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1; if (k & 1) rod(s, [[p[0] - dx / l * 2, p[1] - dy / l * 2], [p[0] + dx / l * 2, p[1] + dy / l * 2]], .9, m); else rod(s, arc(p[0], p[1], 2, 2, 0, 6.3, 12), .7, m); }
  };
  const flail = (m, o) => () => {
    const s = IC(), a = [10, 56], b = [34, 28], T = o.tier, heads = o.heads || 1, r = o.r || 6;
    const ends = heads === 1 ? [[49, 30]] : heads === 2 ? [[52, 22], [42, 42]] : [[53, 20], [50, 37], [37, 46]];
    part(s, t => ends.forEach((e, i) => chain(t, bez(b, [b[0] + (e[0] - b[0]) * .5 + 4, b[1] - 9 + i * 7], e, 10), m)));
    part(s, t => (T >= 3 ? hafts.fine : T >= 2 ? hafts.shaped : hafts.branch)(t, a, b));
    part(s, t => collar(t, frame(a, b, 1), m, -5, .5, 3));
    part(s, t => ends.forEach(e => spikeBall(t, e, heads > 1 ? r - 1.4 : r, m)));
    if (o.rune) { ends.forEach(e => glyphs(s, [[e[0] - 1, e[1] - 1], [e[0] + 2, e[1]]], 1)); light(s, ends[0], [.5, .85, 1], 18); }
    return sel(s);
  };
  const spearHead = (s, F, m, o) => {
    const hl = o.hl || 17, w = o.w || 4.2;
    if (o.stone) { stoneHead(s, frame(F(-hl, 0), F(0, 0)), [...qv([-1, -w * .5], [hl * .3, -w * 1.2], [hl, 0], 'edge', 8), ...qv([hl, 0], [hl * .4, w * 1.1], [-1, w * .5], 'edge', 8), [-1, w * .5, 'back']], 41, { amp: 1, pitch: 4 }); return; }
    if (o.bone) { stroke(s, [F(-hl - 1, 0), F(0, 0)], u => w * .7 * Math.pow(1 - u, .8) + .4, (u, v, d, hw, x, y) => tone(MAT.bone, .62 - v * .3 + (hash(Math.floor(d * 1.3 + 9), 2, 3) - .5) * .12, x, y), { round: 1 }); return; }
    blade(s, F(-hl, 0), F(0, 0), w, m, { leaf: !o.narrow, tip: o.narrow ? .3 : .7, fuller: 0, pow: 1 });
  };
  const spear = (m, o) => () => {
    const s = IC(), a = o.a || [7, 59], b = o.b || [57, 9], F = frame(a, b, 1), L = frame(a, b).len, hl = o.hl || 17, sw = o.sw || 1.5;
    part(s, t => haft(t, [a, F(-hl + 3, 0)], sw, o.wood || C.ash, { seed: 71, round: 1 }));
    if (o.butt) part(s, t => rod(t, [frame(a, b)(0, 0), frame(a, b)(5, 0)], sw + .5, m));
    if (o.shank) part(s, t => rod(t, [F(-hl - o.shank, 0), F(-hl + 2, 0)], .9, m, { round: 0 }));
    part(s, t => spearHead(t, F, m, o));
    if (!o.stone && !o.bone && !o.shank) part(s, t => stroke(t, [F(-hl - 7, 0), F(-hl + 1, 0)], u => sw + .9 - u * .5, (u, v, d, hw, x, y) => tone(m, .58 - v * .3, x, y)));
    if (o.stone || o.bone || o.bind) part(s, t => stroke(t, [F(-hl - 6, 0), F(-hl + 2.5, 0)], sw + 1.1, cordC(o.cord || C.sinew, 2.2, 8)), { line: 0 });
    if (o.wings) part(s, t => { for (const sg of [-1, 1]) poly(t, F.pts([[-hl - 2, sg * 1, 'top'], [-hl - 1.5, sg * 6.5, 'top'], [-hl - 5.5, sg * 2, 'bot']]), metalFace(m, F, { bevel: 0 })); });
    if (o.hook) part(s, t => rod(t, bez(F(-hl + 3, 2), F(-hl + 2, 8), F(-hl - 6, 7), 8), 1.1, m));
    if (o.block) part(s, t => poly(t, F.pts([[-hl - o.shank - 5, -2.8, 'top'], [-hl - o.shank + 1, -2.2, 'top'], [-hl - o.shank + 1, 2.2, 'bot'], [-hl - o.shank - 5, 2.8, 'poll']]), (x, y, D) => rp(C.dark, .5 - (D.bot < 1.2 ? .2 : 0) + (D.top < 1.2 ? .2 : 0), x, y, .2)));
    if (o.weight) part(s, t => ball(t, F(-hl - 4, 0), 3, MAT.lead));
    if (o.fletch) part(s, t => { const G = frame(a, b); for (const sg of [-1, 1]) poly(t, G.pts([[1, sg * .6, 'top'], [3, sg * 4, 'top'], [10, sg * 4, 'top'], [13, sg * .6, 'bot']]), (x, y, D) => rp(C.cloth, .6 - (D.all < 1 ? .2 : 0) + (hash(x + y, 3, 2) - .5) * .2, x, y, .2)); });
    if (o.tassel) part(s, t => { for (let k = 0; k < 4; k++) strand(t, F(-hl - 4, 1), F(-hl - 9 - k, 5 + k * 1.3), C.red, .8); }, { line: 0 });
    if (o.rune) { glyphs(s, [F(-hl + 3, -.5), F(-6, -.5)], 3); light(s, F(-8, 0), [.5, .85, 1], 18); }
    if (o.grip) part(s, t => stroke(t, [frame(a, b)(L * .36, 0), frame(a, b)(L * .52, 0)], sw + .8, cordC(C.leather, 2.4, 10)), { line: 0 });
    return sel(s);
  };
  const polearm = (m, o) => () => {
    const s = IC(), a = [7, 59], b = [53, 13], F = frame(a, b, 1), T = o.tier;
    part(s, t => haft(t, [a, F(-2, 0)], 1.6, T >= 3 ? C.dark : C.ash, { seed: 81, round: 1 }));
    part(s, t => rod(t, [frame(a, b)(0, 0), frame(a, b)(4, 0)], 2, m));
    if (o.glaive) {
      part(s, t => poly(t, F.pts([[-20, -1.6, 'top'], ...qv([-20, -1.6], [-6, -4], [6, 1], 'top', 8), [6, 1, 'edge'], ...qv([6, 1], [-4, 6.5], [-14, 6], 'edge', 8), [-14, 6, 'edge'], [-17, 9.5, 'bot'], [-18, 4.5, 'bot'], [-21, 2, 'poll']]), metalFace(m, F, { bevel: 2.4 })));
    } else {
      part(s, t => blade(t, F(-8, 0), F(8, 0), 2.4, m, { tip: .25, fuller: 0 }));
      part(s, t => poly(t, F.pts([[-4, -1.5, 'top'], ...qv([-4, -1.5], [-5, -7], [0, -12.5], 'top', 6), ...qv([0, -12.5], [-9, -9], [-17, -12.5], 'edge', 8), ...qv([-17, -12.5], [-13, -6], [-14, -1.5], 'bot', 6), [-14, -1.5, 'poll']]), metalFace(m, F, { bevel: 2.4 })));
      part(s, t => poly(t, F.pts([[-6, 1.5, 'top'], [-7.5, 9.5, 'top'], [-11, 5, 'bot'], [-12, 1.5, 'poll']]), metalFace(m, F, { bevel: 0 })));
    }
    part(s, t => { langet(t, F, -14, -26, m); collar(t, F, m, -23, -19.5, 2.4); }, { line: 0 });
    if (o.rune) { glyphs(s, o.glaive ? [F(-14, 1.5), F(-2, 1)] : [F(-12, -8), F(-5, -8)], 3); light(s, F(-8, -4), [.5, .85, 1], 18); }
    return sel(s);
  };
  const staff = o => () => {
    const s = IC(), a = o.short ? [17, 49] : o.long ? [7, 59] : [9, 57], b = o.short ? [43, 23] : o.long ? [57, 9] : [45, 21], F = frame(a, b, 1), G = frame(a, b), W = o.wood || C.wood, L = G.len;
    const shaft = t => o.metal ? rod(t, [a, b], o.short ? 1.8 : 1.7, o.metal, { band: o.short ? 0 : 0 }) : haft(t, o.gnarl ? [a, G(L * .3, 1.4), G(L * .62, -1.2), b] : [a, b], u => (o.short ? 1.8 : 1.9) + (o.gnarl ? Math.sin(u * 11) * .3 + u * .5 : 0), W, { seed: 91, round: 1, knot: o.gnarl ? .44 : 0, len: L });
    part(s, shaft);
    for (const q of o.bands || []) part(s, t => rod(t, [G(L * q - 1.3, 0), G(L * q + 1.3, 0)], o.short ? 2.5 : 2.6, o.bandM || MAT.gold, { round: 0 }));
    if (o.caps) part(s, t => { rod(t, [G(0, 0), G(o.capLen || 5, 0)], 2.5, o.caps, { round: 1 }); rod(t, [F(-(o.capLen || 5), 0), F(0, 0)], 2.5, o.caps, { round: 1 }); });
    if (o.grip) part(s, t => stroke(t, [G(L * .34, 0), G(L * .56, 0)], 2.4, cordC(o.grip, 2.4, 12)), { line: 0 });
    const gs = o.gems || [];
    if (gs.length === 1) {
      const r = o.gr || 5, c = F(r + 3, 0), prong = o.prong || W;
      part(s, t => { for (const sg of [-1, 1]) (prong.r ? rod : (s2, p, w, m2) => haft(s2, p, w, m2, { seed: 93, round: 1 }))(t, bez(F(-1, sg * 1), F(r * .6, sg * (r + 3.4)), F(r * 2 + 3.5, sg * (o.open ? 3 : 1.4)), 10), 1.3, prong); });
      part(s, t => gem(t, c, r, gs[0].ramp));
      light(s, c, gs[0].glow, 26);
    } else if (gs.length > 1) {
      const cs = [F(7, 0), F(-1, -7), F(-1, 7)];
      part(s, t => { rod(t, [F(-3, 0), F(3, 0)], 2.6, o.metal || MAT.gold); for (const c of cs.slice(1)) rod(t, [F(-3, 0), c], 1.2, o.metal || MAT.gold); });
      part(s, t => gs.forEach((g2, i) => gem(t, cs[i], i ? 3.6 : 4.6, g2.ramp)));
      light(s, cs[0], gs[0].glow, 30);
    } else if (o.finial) part(s, t => ball(t, F(2, 0), 3.2, o.finial));
    if (o.rune) glyphs(s, [G(L * .2, -.5), G(L * .8, -.5)], 5);
    return sel(s);
  };
  const bow = o => () => {
    const s = IC(), t1 = o.long ? [8, 60] : [13, 55], t2 = o.long ? [60, 8] : [55, 13], mid = [(t1[0] + t2[0]) / 2, (t1[1] + t2[1]) / 2], dp = o.deep || 13, cx = mid[0] - dp * 1.42, cy = mid[1] - dp * 1.42, W = o.wood || C.wood;
    let pts = bez(t1, [cx, cy], t2, 20);
    if (o.recurve) { const e1 = [t1[0] + 5, t1[1] + 3], e2 = [t2[0] + 3, t2[1] + 5]; pts = [e1, ...bez(lerp(e1, t1, .5), t1, pts[2], 4).slice(1), ...pts.slice(3, -3), ...bez(pts[pts.length - 3], t2, lerp(e2, t2, .5), 4).slice(1), e2]; }
    const p0 = pts[0], p1 = pts[pts.length - 1];
    part(s, t => strand(t, p0, p1, C.cloth, .6), { line: 0 });
    part(s, t => stroke(t, pts, u => (o.th || 2.2) * (.42 + .58 * Math.sin(Math.min(1, Math.max(0, u)) * 3.1416)) + .3, (u, v, d, hw, x, y) => {
      if (o.tips && (u < .09 || u > .91)) return tone(MAT.bone, .62 - v * .3, x, y);
      if (o.backing && v < -.3) return rp(o.backing, .62 + (hash(Math.floor(u * 60), 2, 2) - .5) * .2, x, y, .2);
      return woodC(W, 31)(u, v, d, hw, x, y);
    }, { round: 1 }));
    part(s, t => stroke(t, pts, u => Math.abs(u - .5) < .075 ? (o.th || 2.2) + 1 : 0, cordC(o.grip || C.leather, 2.2, 90)), { line: 0 });
    if (o.bands) part(s, t => { for (const q of [.2, .32, .68, .8]) stroke(t, pts, u => Math.abs(u - q) < .012 ? (o.th || 2.2) * (.42 + .58 * Math.sin(u * 3.1416)) + .9 : 0, (u, v, d, hw, x, y) => tone(o.bands, .6 - v * .3, x, y)); }, { line: 0 });
    if (o.rune) { const q = bez(t1, [cx, cy], t2, 20); glyphs(s, [q[4], q[8]], 2); glyphs(s, [q[12], q[16]], 2, { seed: 2 }); light(s, [cx + 12, cy + 12], [.5, .85, 1], 18); }
    return sel(s);
  };
  const crossbow = (m, o) => () => {
    const s = IC(), a = [10, 56], b = [50, 16], F = frame(a, b), L = F.len, q0 = L - 9, sp = o.span || 19, P = o.steel ? m : null;
    const tipA = F(q0 - 7, -sp), tipB = F(q0 - 7, sp), nut = F(L * .47, 0);
    part(s, t => { strand(t, tipA, nut, C.cloth, .6); strand(t, tipB, nut, C.cloth, .6); }, { line: 0 });
    if (o.stirrup) part(s, t => rod(t, [F(L - 1, -2.6), F(L + 4, -2.6), F(L + 5.5, 0), F(L + 4, 2.6), F(L - 1, 2.6)], .9, MAT.iron));
    part(s, t => stroke(t, [F(q0 - 7, -sp), F(q0 - 1, -sp * .55), F(q0 + 1, 0), F(q0 - 1, sp * .55), F(q0 - 7, sp)].flatMap((p, i, l) => i ? bez(l[i - 1], lerp(l[i - 1], p, .5), p, 3).slice(1) : [p]), u => 1 + Math.sin(u * 3.1416) * (P ? 1.2 : 1.7), P ? (u, v, d, hw, x, y) => tone(P, .6 - v * .34, x, y) : woodC(o.horn ? C.black : C.wood, 41), { round: 1 }));
    part(s, t => haft(t, [a, F(L, 0)], u => 2.6 + (u < .28 ? (.28 - u) * 7 : 0) - (u > .6 ? .5 : 0), o.dark ? C.dark : C.wood, { seed: 43 }));
    part(s, t => { stroke(t, [F(q0 - 2.6, 0), F(q0 + 2.6, 0)], 3.4, cordC(C.sinew, 2, 5)); }, { line: 0 });
    part(s, t => { rod(t, [F(L * .47, -1), F(L - 3, -1)], .7, C.ash, { round: 0 }); poly(t, F.pts([[L - 4, -2.6, 'top'], [L + 1.5, -1, 'top'], [L - 4, .6, 'bot']]), metalFace(MAT.iron, F, { bevel: 0 })); }, { line: 0 });
    part(s, t => { ball(t, nut, 1.7, MAT.bone); rod(t, [F(L * .44, 2.6), F(L * .3, 6)], .9, MAT.iron); }, { line: 0 });
    if (o.crank) part(s, t => { collar(t, F, MAT.iron, 2, 8, 4.2); rod(t, [F(5, -4), F(5, -10)], .9, MAT.iron); rod(t, [F(5, 4), F(5, 10)], .9, MAT.iron); ball(t, F(5, -10.5), 1.6, MAT.bronze); ball(t, F(5, 10.5), 1.6, MAT.bronze); });
    if (o.rune) { glyphs(s, [F(L * .14, -.5), F(L * .4, -.5)], 3); light(s, F(L * .3, 0), [.5, .85, 1], 18); }
    return sel(s);
  };
  const pebble = (s, p, rx, ry, m, sd) => { for (let y = Math.floor(p[1] - ry); y <= p[1] + ry; y++) for (let x = Math.floor(p[0] - rx); x <= p[0] + rx; x++) { const nx = (x + .5 - p[0]) / rx, ny = (y + .5 - p[1]) / ry, q = nx * nx + ny * ny + (noise(x * .4, y * .4, sd) - .5) * .3; if (q > 1) continue; const nz = Math.sqrt(Math.max(0, 1 - q)); s.set(x, y, tone(m, .46 + (nx * LV[0] + ny * LV[1] + nz * LV[2]) * .46, x, y)); } };
  const sling = o => () => {
    const s = IC();
    if (o.staff) part(s, t => haft(t, [[9, 57], [41, 25]], 1.7, C.ash, { seed: 5, round: 1 }));
    const top = o.staff ? [41, 25] : [14, 14], c1 = o.staff ? bez(top, [56, 22], [50, 40], 12) : bez(top, [16, 44], [34, 47], 14), c2 = o.staff ? bez([39, 27], [44, 42], [46, 44], 10) : bez([20, 12], [46, 16], [44, 37], 14);
    part(s, t => { stroke(t, c1, .8, cordC(o.cord || C.cord, 1.6, 50)); stroke(t, c2, .8, cordC(o.cord || C.cord, 1.6, 50)); });
    const pc = o.staff ? [48, 43] : [39, 43];
    part(s, t => poly(t, [[pc[0] - 7, pc[1] - 2, 'top'], [pc[0], pc[1] - 5, 'top'], [pc[0] + 7, pc[1] - 3, 'top'], [pc[0] + 5, pc[1] + 4, 'bot'], [pc[0] - 3, pc[1] + 5, 'bot']], (x, y, D) => rp(C.leather, .5 - (y - pc[1]) * .04 - (D.all < 1.2 ? .14 : 0), x, y, .3)));
    part(s, t => pebble(t, [pc[0], pc[1] - 3], 3.6, 3, o.stone || MAT.stone, 4));
    if (!o.staff) part(s, t => rod(t, arc(15, 11, 3, 3, 0, 6.3, 14), .8, C.cord));
    if (o.rune) { glyphs(s, [[pc[0] - 3, pc[1] + 1], [pc[0] + 2, pc[1] + 1]], 2); light(s, pc, [.5, .85, 1], 16); }
    return sel(s);
  };
  const arrow1 = (s, a, b, m, o) => {
    const F = frame(a, b, 1), G = frame(a, b), hl = o.bolt ? 6 : 7;
    part(s, t => haft(t, [a, F(-hl + 1, 0)], o.bolt ? 1.3 : .9, C.ash, { seed: 3 }));
    part(s, t => { for (const sg of [-1, 1]) poly(t, G.pts([[1, sg * .5, 'top'], [2.5, sg * (o.bolt ? 3 : 3.4), 'top'], [o.bolt ? 8 : 11, sg * (o.bolt ? 3 : 3.2), 'top'], [o.bolt ? 10 : 14, sg * .5, 'bot']]), (x, y, D) => rp(o.vane || C.cloth, (sg < 0 ? .7 : .46) - (D.all < 1 ? .16 : 0) + (hash((x + y) >> 1, 3, 2) - .5) * .16, x, y, .2)); });
    part(s, t => {
      if (o.stone) stoneHead(t, frame(F(-hl, 0), F(0, 0)), [...qv([0, -1], [hl * .3, -3.6], [hl, 0], 'edge', 5), ...qv([hl, 0], [hl * .3, 3.6], [0, 1], 'edge', 5), [0, 1, 'back']], 9, { amp: .5, pitch: 3 });
      else if (o.bodkin) blade(t, F(-hl - 2, 0), F(0, 0), 1.3, m, { tip: .1, fuller: 0 });
      else poly(t, F.pts(o.broad || o.barb ? [[-hl, -.8, 'top'], [-hl - (o.barb ? 2.5 : .5), -(o.broad ? 4 : 3), 'edge'], [0, 0, 'edge'], [-hl - (o.barb ? 2.5 : .5), o.broad ? 4 : 3, 'bot'], [-hl, .8, 'poll']] : [[-hl, -1, 'top'], [-hl * .6, -2.4, 'edge'], [0, 0, 'edge'], [-hl * .6, 2.4, 'bot'], [-hl, 1, 'poll']]), (x, y, D) => { const r = F.inv(x, y)[1]; return tone(m, r < 0 ? .78 : .44, x, y); });
    });
    if (o.stone || o.bone) part(s, t => stroke(t, [F(-hl - 3, 0), F(-hl + 1, 0)], 1.4, cordC(C.sinew, 1.6, 4)), { line: 0 });
  };
  const arrows = (m, o) => () => { const s = IC(); for (const [a, b] of o.bolt ? [[[13, 45], [39, 19]], [[19, 51], [45, 25]], [[25, 57], [51, 31]]] : [[[8, 46], [44, 10]], [[13, 53], [51, 15]], [[20, 58], [56, 22]]]) arrow1(s, a, b, m, o); return sel(s); };
  const heapOf = (m, n, rx, ry, o) => () => { o = o || {}; const s = IC(), pts = [[22, 46], [34, 48], [44, 44], [28, 38], [39, 37], [33, 29]].slice(0, n); pts.forEach((p, i) => part(s, t => pebble(t, p, rx, ry, m, i * 7 + (o.seed || 1)))); return sel(s); };
  const weapon = o => {
    const id = o.id, m = matOf(o), T = tierOf(o), rune = /rune/.test(id), h = hiltOf(o, m), orc = m === MAT.orc;
    if (id === 'flint_handaxe') return null;
    if (/arbalest|crossbow/.test(id)) return crossbow(/steel|rune|siege/.test(id) ? (rune ? MAT.alloy : MAT.steel) : MAT.iron, { steel: /steel|rune|siege|arbalest/.test(id), horn: /composite/.test(id), crank: /arbalest/.test(id), stirrup: 1, rune, dark: /steel|rune|siege/.test(id), span: /siege|arbalest/.test(id) ? 21 : 18 });
    if (/staff_sling/.test(id)) return sling({ staff: 1 });
    if (/sling$/.test(id)) return sling({ rune, stone: /skullcracker/.test(id) ? MAT.orc : MAT.stone, cord: /skullcracker/.test(id) ? C.hide : rune ? C.blue : C.cord });
    if (/bow$|_bow|hornbow|longbow|warbow|recurve/.test(id)) return bow({ wood: /horn|warren/.test(id) ? C.black : /yew/.test(id) ? R('#3a1c14 #582a1c #783c26 #985232 #b46c44 #cc8a5c #e0aa7c') : /self/.test(id) ? C.ash : C.wood, long: /long|war_bow|warbow/.test(id), recurve: /recurve|composite|horn/.test(id), tips: /horn|composite|war/.test(id) ? 1 : 0, backing: /sinew|composite/.test(id) ? C.sinew : null, th: /war|composite|horn|long/.test(id) ? 2.6 : 2.2, rune, deep: /recurve|composite|horn/.test(id) ? 11 : /long|war/.test(id) ? 12 : 13, grip: /poison/.test(id) ? C.green : rune ? C.blue : C.leather, bands: rune ? MAT.alloy : /war_bow/.test(id) ? MAT.iron : null });
    if (/blowgun/.test(id)) return () => { const s = IC(), a = [8, 58], b = [56, 10], G = frame(a, b); part(s, t => haft(t, [a, b], 1.7, C.wicker, { seed: 3 })); part(s, t => { for (const q of [.22, .5, .78]) stroke(t, [G(G.len * q - 1, 0), G(G.len * q + 1.4, 0)], 2.2, cordC(C.dark, 1.4, 3)); }, { line: 0 }); part(s, t => rod(t, [G(0, 0), G(4, 0)], 2.3, MAT.bone)); const p = G(G.len - .5, 0); s.set(p[0], p[1], P.ink); return sel(s); };
    if (/net$/.test(id)) return () => { const s = IC(); part(s, t => { for (let y = 10; y < 56; y++) for (let x = 8; x < 58; x++) { const dx = (x - 33) / 24, dy = (y - 33) / 22; if (dx * dx + dy * dy > 1 + (noise(x * .2, y * .2, 3) - .5) * .4) continue; const u = x + Math.sin(y * .25) * 2, v = y + Math.sin(x * .22) * 2; if (Math.abs((u + v) % 7) < 1 || Math.abs((u - v + 70) % 7) < 1) t.set(x, y, rp(C.cord, .5 + (hash(x, y, 2) - .5) * .3, x, y, .2)); } }, { k: .2 }); part(s, t => { for (const [x, y] of [[11, 40], [22, 52], [40, 53], [54, 40], [53, 20], [14, 20], [32, 11]]) pebble(t, [x, y], 3, 2.6, MAT.stone, x); }); return sel(s); };
    if (/firepot/.test(id)) return () => { const s = IC(); part(s, t => { blob(t, frame([32, 40], [32, 30]), 12, 13, { r: C.clay, d: .4, n: .14, ns: .5, shine: 0 }); t.rect(26, 22, 12, 5, C.clay[3]); t.rect(26, 22, 12, 1, C.clay[5]); for (let x = 22; x < 43; x += 3) { t.set(x, 38 + (x & 1), C.clay[1]); t.set(x + 1, 44, C.clay[1]); } }); part(s, t => { t.rect(30, 16, 4, 7, C.cloth[3]); t.rect(30, 16, 1, 7, C.cloth[5]); }); flame2(s, 32, 17, 3, 12, 1); light(s, [32, 12], [1, .6, .24], 30); s.emit.flicker = 1; return sel(s); };
    if (/throwing_stone/.test(id)) return heapOf(MAT.stone, 3, 7, 6);
    if (/plumbata/.test(id)) return spear(m, { a: [16, 50], b: [50, 16], hl: 9, w: 3, narrow: 1, weight: 1, fletch: 1, sw: 1.3 });
    if (/pilum/.test(id)) return spear(m, { hl: 6, w: 2.4, narrow: 1, shank: 20, block: 1, sw: 1.9, wood: C.wood });
    if (/javelin|throwing_spear/.test(id)) return spear(/fang/.test(id) ? MAT.bone : m, { a: [11, 55], b: [53, 13], hl: /fang/.test(id) ? 12 : 13, w: 3.2, sw: 1.3, rune, bone: /fang/.test(id), bind: T < 2, stone: /throwing_spear/.test(id), grip: 1 });
    if (/halberd/.test(id)) return polearm(m, { rune, tier: T });
    if (/glaive/.test(id)) return polearm(m, { glaive: 1, rune, tier: T });
    if (/pike/.test(id)) return spear(m, { a: [5, 61], b: [59, 7], hl: 11, w: 2.6, narrow: 1, sw: 1.2, butt: 1 });
    if (/spear|framea|impaler/.test(id)) return spear(/impaler/.test(id) ? MAT.bone : m, { narrow: /framea/.test(id), wings: /winged|boar/.test(id), hook: /hooked|trap/.test(id), w: /impaler|leaf|boar/.test(id) ? 5 : 4.2, hl: /impaler/.test(id) ? 22 : /framea/.test(id) ? 12 : 17, rune, stone: /^stone_spear/.test(id), bone: /bone_tipped|impaler/.test(id), bind: T < 2 && !/socketed/.test(id), cord: /goblin|kobold/.test(id) ? C.cloth : C.sinew, wood: /goblin|kobold/.test(id) ? C.wood : C.ash, tassel: /goblin|kobold/.test(id), butt: T >= 3 });
    if (/greatstaff/.test(id)) return staff({ metal: MAT.alloy, gems: [{ ramp: GEM.ruby, glow: GLOW.ruby }, { ramp: GEM.sapphire, glow: GLOW.sapphire }, { ramp: GEM.topaz, glow: GLOW.topaz }], bands: [.3, .6], bandM: MAT.gold, rune: 1 });
    const el = Object.keys(GEMS).find(k => id.includes(k)), gk = el && (GEMS[el] === GEM.ruby ? 'ruby' : GEMS[el] === GEM.sapphire ? 'sapphire' : 'topaz'), gg = el && [{ ramp: GEMS[el], glow: GLOW[gk] }], ew = el && { ruby: R('#3a1410 #5a2016 #7e301e #a2482a #c0683c #d88c58'), sapphire: R('#2a3440 #3e4c5a #586a78 #788c98 #9cb0b8 #c2d2d6'), topaz: R('#2e2a3a #443e54 #5e5870 #7c768e #9e98ac #c2bece') }[gk];
    if (/scepter/.test(id)) return staff({ short: 1, metal: MAT.silver, gems: gg, gr: 5, prong: MAT.silver, bands: [.2, .82], bandM: MAT.gold });
    if (/_rod$/.test(id)) return el ? staff({ short: 1, wood: ew, gems: gg, gr: 4, bands: [.14], bandM: MAT.bronze, grip: C.leather }) : staff({ short: 1, metal: m, finial: m, bands: [.16, .3, .84] , bandM: m === MAT.copper ? MAT.bronze : MAT.gold });
    if (/staff/.test(id)) return el ? staff({ wood: ew, gnarl: 1, gems: gg, gr: /pyre|rime|tempest/.test(id) ? 6.4 : 5, bands: /pyre|rime|tempest/.test(id) ? [.22, .74] : null, open: 1 }) : staff({ long: 1, wood: T >= 3 ? C.dark : C.ash, caps: m, capLen: T >= 3 ? 7 : 5, bands: rune ? [.3, .7] : T >= 3 ? [.5] : null, bandM: m, rune, grip: T >= 2 ? C.leather : null });
    if (/flail|chainbiter/.test(id)) return flail(m, { heads: /chainbiter/.test(id) ? 3 : /great|lashing|chained/.test(id) ? 2 : 1, r: /great/.test(id) ? 7 : 6, tier: T, rune });
    if (/warhammer/.test(id)) return hammer(m, { len: 8, th: 4.2, spike: 1, tier: T, rune });
    if (/great_bone_maul/.test(id)) return () => { const s = IC(), a = [10, 56], b = [44, 22], F = frame(a, b, .86); part(s, t => hafts.branch(t, a, F(4, 0), { club: 1.2 })); part(s, t => { blob(t, F, 5.6, 12, MAT.bone, {}); blob(t, F, 7.4, 6.4, MAT.bone, { r: -11 }); blob(t, F, 5, 4.6, MAT.bone, { r: 11, q: 3 }); blob(t, F, 5, 4.6, MAT.bone, { r: 11, q: -3 }); }); part(s, t => { strand(t, F(-6, -2.4), F(6, 2.4), C.hide, 1.2); strand(t, F(-6, 2.4), F(6, -2.4), C.hide, 1.2); }, { line: 0 }); part(s, t => bindings(t, F, 3.5, C.hide, [[-11, -6.4]]), { line: 0 }); return sel(s); };
    if (/stone_maul/.test(id)) return () => { const s = IC(), a = [10, 56], b = [44, 22], F = frame(a, b, .86); part(s, t => hafts.branch(t, a, F(9, 0), { club: 1.2 })); part(s, t => blob(t, F, 9.4, 14.5, MAT.stone, { groove: 2.4 })); part(s, t => { strand(t, F(-9, -2.4), F(9, 2.4), C.hide, 1.2); strand(t, F(-9, 2.4), F(9, -2.4), C.hide, 1.2); }, { line: 0 }); part(s, t => bindings(t, F, 3.5, C.hide, [[-13.5, -9.4]]), { line: 0 }); return sel(s); };
    if (/maul|anvil_breaker/.test(id)) return hammer(m, { maul: 1, len: 11, th: 6.4, tier: T, a: [10, 56], b: [44, 22], t: .86, wire: /anvil/.test(id), bands: null });
    if (/stone_club/.test(id)) return mace(m, { club: 5.6, studs: MAT.stone });
    if (/club/.test(id)) return mace(m, { club: 3.4, bone: /antler/.test(id) });
    if (/mace/.test(id)) return mace(m, { flange: /flanged|ribbed|steel|iron/.test(id), rune, tier: T });
    if (/gnoll_flint_axe/.test(id)) return stoneAxe({ bones: 1 });
    if (/greataxe|double_axe/.test(id)) return battleAxe(m, { double: /double|tide|rune/.test(id), head: { ex: 17, toe: 12, heel: 14, bulge: 5, neck: 2.6, pr: /double|tide|rune/.test(id) ? 0 : 5, beard: /orc/.test(id) ? 3 : 0 }, a: [9, 57], b: [47, 19], t: .8, tier: T, rune, spike: T >= 3 });
    if (/axe|hatchet|francisca/.test(id)) return battleAxe(m, { head: /bearded/.test(id) ? { ex: 16, toe: 7, heel: 15, bulge: 3, beard: 5, neck: 2.4, pr: 5 } : /broad/.test(id) ? { ex: 17, toe: 13, heel: 13, bulge: 4, neck: 2.4, pr: 5 } : /francisca/.test(id) ? { ex: 17, toe: 11, heel: 4, bulge: 3, neck: 2.6, pr: 5, rake: -3 } : /flat|hatchet/.test(id) ? { ex: 16, toe: 7, heel: 7, bulge: 3, neck: 3, pr: 6, he: 3 } : { ex: 16, toe: 9, heel: 11, bulge: 4 }, a: /hatchet|francisca/.test(id) ? [17, 49] : [11, 55], b: /hatchet|francisca/.test(id) ? [45, 21] : [49, 17], tier: /flat|hatchet/.test(id) ? 0 : T, lash: /flat|hatchet/.test(id), rune, k: /hatchet|francisca/.test(id) ? .9 : 1 });
    if (/greatcleaver/.test(id)) return cleaver(m, { a: [8, 56], b: [54, 10], w: 9, g: 15, hilt: h, rough: /fanged/.test(id) });
    if (/cleaver|flenser|reaver/.test(id)) return cleaver(/gnoll_bone|fang/.test(id) ? MAT.bone : m, { square: /flenser/.test(id), hole: /steel|iron|bronze/.test(id), rough: /orc|gnoll|goblin|toothed|reaver/.test(id), w: /flenser|reaver/.test(id) ? 9 : 8, hilt: h });
    if (/greatsword|great_leaf|gravemaker/.test(id)) return sword(m, { w: /gravemaker/.test(id) ? 5 : 4.4, leaf: /leaf/.test(id), a: [6, 58], b: [58, 6], g: 16, hilt: /gravemaker/.test(id) ? h : Object.assign({}, h, T >= 3 ? { guard: guards.curve(m, 9.4) } : {}), runes: 7, gw: 2.1 });
    if (/rapier|estoc|needle/.test(id)) return sword(m, { w: /estoc/.test(id) ? 2 : 1.7, tip: .3, taper: .5, fuller: 0, pow: 1, hilt: Object.assign({}, h, /estoc/.test(id) ? {} : { guard: guards.swept(m === MAT.bronze ? m : rune ? MAT.alloy : MAT.steel, 5) }) });
    if (/seax/.test(id)) return backsword(m, { a: [14, 50], b: [48, 16], hilt: { grip: GR.wood(C.dark), pommel: pommels.ball(MAT.iron, 2.2) }, w: 4.4, clip: .62 });
    if (/sword|spatha/.test(id)) return sword(m, { leaf: /leaf/.test(id), a: /short/.test(id) ? [14, 50] : [9, 55], b: /short/.test(id) ? [48, 16] : [55, 9], w: /short|leaf/.test(id) ? 4 : 3.6, hilt: h });
    if (/dagger|dirk|shank|stiletto|rondel|needle|knife/.test(id)) return dagger(m, { stone: /flint/.test(id), bone: /fang|bone/.test(id), w: /stiletto|rondel/.test(id) ? 1.8 : /punch/.test(id) ? 4.4 : 3.2, leaf: /copper|bronze/.test(id) && !/punch/.test(id), tip: /stiletto|rondel/.test(id) ? .2 : /punch/.test(id) ? .1 : .55, taper: /stiletto|rondel/.test(id) ? .4 : 0, pow: /stiletto|rondel|punch/.test(id) ? 1 : .8, hilt: /rondel/.test(id) ? { grip: GR.wood(C.dark), guard: guards.disc(MAT.iron, 3.6), pommel: (s, F) => rod(s, [F(0, -3.6), F(0, 3.6)], 1.8, MAT.iron, { round: 0 }) } : /punch/.test(id) ? { grip: GR.cast(m), guard: guards.bar(m, 5.6, 1.8), pommel: (s, F) => rod(s, [F(0, -5), F(0, 5)], 1.8, m) } : /stiletto/.test(id) ? Object.assign({}, h, { guard: guards.bar(rune ? MAT.alloy : MAT.steel, 4.4, 1.2) }) : /flint|fang|bone|shank/.test(id) ? { grip: GR.wrap(/shank/.test(id) ? C.cloth : C.hide) } : h });
    return null;
  };
  const ammo = o => {
    const id = o.id, m = matOf(o);
    if (/arrow/.test(id)) return arrows(/fang|bone/.test(id) ? MAT.bone : m, { broad: /broadhead/.test(id), bodkin: /bodkin/.test(id), barb: /barbed/.test(id), stone: /flint/.test(id), bone: /fang|bone/.test(id), vane: /fang|bone|flint/.test(id) ? C.hide : /steel/.test(id) ? C.red : C.cloth });
    if (/bolt|quarrel/.test(id)) return arrows(m, { bolt: 1, broad: /heavy/.test(id), bodkin: /steel/.test(id), vane: /steel|heavy/.test(id) ? C.leather : C.wicker });
    if (/dart/.test(id)) return () => { const s = IC(); for (const [a, b] of [[[14, 44], [40, 18]], [[20, 50], [46, 24]], [[26, 56], [52, 30]]]) { const F = frame(a, b, 1), G = frame(a, b); part(s, t => stroke(t, [G(4, 0), F(0, 0)], u => 1.1 * (1 - u * .8) + .3, (u, v, d, hw, x, y) => tone(MAT.bone, .62 - v * .3, x, y), { round: 1 })); part(s, t => { for (let k = 0; k < 7; k++) strand(t, G(5, 0), G(hash(k, 3, 2) * 3 - 1, (k - 3) * 1.2), C.cloth, .7); }, { line: 0 }); } return sel(s); };
    if (/bullet|glans|sling_stone/.test(id)) return /lead|cast/.test(id) ? heapOf(MAT.lead, 5, 5.4, 3.6) : /clay/.test(id) ? heapOf({ r: C.clay, d: .4, n: .16, ns: .5, shine: 0 }, 5, 4.4, 4) : heapOf(MAT.stone, 5, 4.6, 4);
    return null;
  };
  X.hdWeapons = { rod, gem, light, pebble, heapOf, guards, pommels, GR, hilt, chain };
  makers.push(o => o.group === 'Weapon' && o.sub !== 'Natural Weapon' ? weapon(o) : o.sub === 'Ammunition' ? ammo(o) : null);
})();
