'use strict';
(() => {
  const X = DBX, { C, MAT, matOf, tierOf, tone, knap, flake, IC, lerp, frame, stroke, poly, qv, bez, arc, rough, sel, part, woodC, haft, cordC, lash, strand, metalFace, bladeC, blade, ball, glyphs, makers } = X.hd;
  const A = [11, 55], B = [49, 17];
  const hafts = {
    branch: (s, a, b, o) => { o = o || {}; const F = frame(a, b); haft(s, bez(a, F(F.len * .45, o.bend === undefined ? 1.6 : o.bend), b, 12), t => 2.1 + (o.club ? Math.pow(t, 3) * o.club : 0) + (t < .08 ? .4 : 0), C.wood, { seed: o.seed || 4, round: 1, knot: .36, len: F.len }); },
    shaped: (s, a, b, o) => { o = o || {}; haft(s, [a, b], t => 2.3 + (t < .14 ? (.14 - t) * 7 : 0) + (t > .2 && t < .5 ? .25 : 0), o.wood || C.ash, { seed: o.seed || 6, round: 1 }); },
    fine: (s, a, b, o) => {
      o = o || {}; const F = frame(a, b), pts = [...bez(a, F(F.len * .28, 2.6), F(F.len * .55, 0), 10), b];
      haft(s, pts, t => 2.2 + (t < .1 ? (.1 - t) * 14 : 0), o.wood || C.dark, { seed: o.seed || 8, round: 1 });
      part(s, t2 => stroke(t2, pts, t => t > .09 && t < .34 ? 2.9 : 0, cordC(o.grip || C.leather, 2.4, F.len)), { line: 0 });
    },
  };
  const langet = (s, F, q0, q1, m) => { stroke(s, [F(q0, -1), F(q1, -1)], .9, (t, u, v, hw, x, y) => tone(m, .7, x, y)); for (const q of [q0 * .7 + q1 * .3, q0 * .25 + q1 * .75]) { const p = F(q, -1); s.set(p[0], p[1], m.r[1]); } };
  const axeHead = o => {
    const he = o.he || 4.5, pr = o.pr === undefined ? 7 : o.pr, ex = o.ex || 17, toe = o.toe || 9, heel = o.heel || 11, neck = o.neck || 3.4;
    return [[he, pr, 'top'], ...qv([he, -3], [neck, -ex * .5], [toe, -ex], 'top'), ...qv([toe, -ex], [(toe - heel) / 2, -ex - (o.bulge || 5)], [-heel, -ex + (o.rake || 0)], 'edge'), ...qv([-heel, -ex + (o.rake || 0)], [-neck - (o.beard || 0), -ex * .5], [-he, -3], 'bot'), [-he, -3, 'bot'], [-he, pr, 'poll']];
  };
  const stoneHead = (s, F, pts, sd, o) => poly(s, rough(o && o.raw ? pts : F.pts(pts), o && o.amp || 1.5, sd, ['edge']), flake(MAT.flint, F, Object.assign({ sd }, o)));
  const bindings = (s, F, hw, R2, qs) => { for (const [q0, q1] of qs) lash(s, F, q0, q1, hw, R2); };
  const axes = {
    stone_axe: () => {
      const s = IC(), F = frame(A, B, .8, 1.2);
      part(s, t => stoneHead(t, F, [[2.6, 7, 'back'], ...qv([3.8, -3], [4.4, -10], [8, -16], 'edge'), ...qv([8, -16], [0, -21], [-8, -16], 'edge'), ...qv([-8, -16], [-4.4, -10], [-3.8, -3], 'edge'), [-3.8, -3, 'bot'], [-2.6, 7, 'back']], 11, { ridge: () => 0, pitch: 4.4 }));
      part(s, t => hafts.branch(t, A, F(11, 0), { club: 2.6 }));
      part(s, t => bindings(t, F, 4.6, C.sinew, [[4.4, 7.2], [-7.4, -4.6]]), { line: 0 });
      part(s, t => { strand(t, F(4.4, -3.6), F(-4.6, 3.6), C.sinew, 1); strand(t, F(4.4, 3.6), F(-4.6, -3.6), C.sinew, 1); }, { line: 0 });
      return sel(s);
    },
    stone_chopper: () => {
      const s = IC(), a = [6, 46], b = [58, 16], F = frame(a, b);
      part(s, t => hafts.branch(t, a, F(19, 0), { seed: 9, bend: .6 }));
      part(s, t => stoneHead(t, F, [[12, -3.8, 'back'], [21, -5.2, 'back'], [31, -5, 'back'], [40, -5.8, 'back'], [45, -4.4, 'back'], [48.5, -.5, 'edge'], [48.5, 5, 'edge'], [45.5, 11, 'edge'], [39, 14.6, 'edge'], [30, 15.6, 'edge'], [22, 14.6, 'edge'], [16.5, 11.6, 'edge'], [14, 7.4, 'edge'], [13, 4.6, 'back']], 23, { cortex: 2.8, amp: 2.4, pitch: 7.2, ridge: q => 7.5 }));
      part(s, t => bindings(t, F, 5.4, C.cord, [[10.6, 15.4]]), { line: 0 });
      return sel(s);
    },
    copper_axe: () => {
      const s = IC(), F = frame(A, B, .8, 1.25), m = MAT.copper;
      part(s, t => poly(t, F.pts([[2, 7, 'top'], ...qv([2.6, -3], [3, -11], [8, -17], 'top'), ...qv([8, -17], [0, -21], [-8, -17], 'edge'), ...qv([-8, -17], [-3, -11], [-2.6, -3], 'bot'), [-2.6, -3, 'bot'], [-2, 7, 'poll']]), metalFace(m, F, { bevel: 2.2 })));
      part(s, t => hafts.branch(t, A, F(8, 0), { club: 2.2, seed: 12 }));
      part(s, t => bindings(t, F, 4.3, C.hide, [[-5.6, 5.6]]), { line: 0 });
      return sel(s);
    },
    iron_axe: () => {
      const s = IC(), F = frame(A, B, .82), m = MAT.iron;
      part(s, t => hafts.shaped(t, A, F(7.5, 0)));
      part(s, t => poly(t, F.pts(axeHead({ ex: 18, toe: 9.5, heel: 12, bulge: 4, neck: 2.8, he: 4.2 })), metalFace(m, F, { eye: 3.2, bevel: 2.8 })));
      return sel(s);
    },
    steel_axe: () => {
      const s = IC(), F = frame(A, B, .82), m = MAT.steel;
      part(s, t => hafts.fine(t, A, F(7, 0)));
      part(s, t => langet(t, F, -5, -15, m), { line: 0 });
      part(s, t => poly(t, F.pts(axeHead({ ex: 19, toe: 9, heel: 15, bulge: 5, beard: 4, neck: 2.6, pr: 6, he: 4 })), metalFace(m, F, { eye: 3, bevel: 3.4, ph: 1 })));
      return sel(s);
    },
  };
  const pickBar = (s, F, m, o) => {
    const pts = [...bez(F(o.droop, -o.reach), F(o.arch + 2.5, -o.reach * .45), F(o.arch, 0), 12), ...bez(F(o.arch, 0), F(o.arch + 2.5, o.back * .45), F(o.droop * (o.back / o.reach), o.back), 12).slice(1)];
    const tm = o.reach / (o.reach + o.back);
    stroke(s, pts, t => { const k = t < tm ? t / tm : (1 - t) / (1 - tm); return .5 + Math.pow(k, .7) * (o.th || 3) * (t > tm && o.chisel ? 1 + (t - tm) * .2 : 1); }, (t, u, v, hw, x, y) => {
      let L = u < -.35 ? .72 : u < .3 ? .5 : .28;
      if (hw > 1.6 && Math.abs(u + .35) < .6 / hw) L = .9;
      const k = t < tm ? t / tm : (1 - t) / (1 - tm);
      if (k < .2) L += .16 * m.shine + .08;
      if (m.shine > .7) L += Math.max(0, Math.sin(t * 20) - .8) * .8;
      return tone(m, L, x, y);
    }, { round: 0 });
  };
  const collar = (s, F, m, q0, q1, hw) => poly(s, F.pts([[q1, hw, 'top'], [q1, -hw, 'top'], [q0, -hw, 'bot'], [q0, hw, 'poll']]), metalFace(m, F, { eye: hw - 1 }));
  const picks = {
    stone_pick: () => {
      const s = IC(), F = frame(A, B, .8);
      part(s, t => stoneHead(t, frame(F(0, 8), F(-2, -24)), [[2.6, 8, 'back'], ...qv([3.6, -3], [4.5, -13], [-2, -24], 'edge'), ...qv([-2, -24], [-3.5, -12], [-3.8, -3], 'edge'), [-3.8, -3, 'bot'], [-2.6, 8, 'back']].map(p => F(p[0], p[1]).concat(p[2])), 31, { amp: 1.1, raw: 1, pitch: 4 }));
      part(s, t => hafts.branch(t, A, F(10, 0), { club: 2.4, seed: 14 }));
      part(s, t => bindings(t, F, 4.4, C.cord, [[4.6, 7.6], [-7.8, -4.8]]), { line: 0 });
      part(s, t => { strand(t, F(4.6, -4.2), F(-4.8, 4.2), C.cord, 1); strand(t, F(4.6, 4.2), F(-4.8, -4.2), C.cord, 1); }, { line: 0 });
      return sel(s);
    },
    copper_pick: () => {
      const s = IC(), F = frame(A, B, .8), m = MAT.copper;
      part(s, t => poly(t, F.pts([[2.4, 7, 'top'], ...qv([3, -3], [4, -13], [-2.5, -22], 'top'), ...qv([-2.5, -22], [-2.6, -12], [-3, -3], 'bot'), [-3, -3, 'bot'], [-2.4, 7, 'poll']]), (x, y, D) => { const [q, r] = F.inv(x, y); let L = q > .6 - r * .06 ? .66 : .38; if (D.top < 1.2) L = .86; if (D.bot < 1.2) L -= .12; return tone(m, L, x, y); }));
      part(s, t => hafts.branch(t, A, F(10, 0), { club: 2.2, seed: 15 }));
      part(s, t => bindings(t, F, 4.2, C.hide, [[-6.5, 6.5]]), { line: 0 });
      return sel(s);
    },
    iron_pick: () => {
      const s = IC(), F = frame(A, B, .84), m = MAT.iron;
      part(s, t => hafts.shaped(t, A, F(6.5, 0)));
      part(s, t => pickBar(t, F, m, { reach: 22, back: 20, arch: 2.5, droop: -7, th: 3.2 }));
      part(s, t => collar(t, F, m, -3.6, 4.6, 3.8));
      return sel(s);
    },
    steel_pick: () => {
      const s = IC(), F = frame(A, B, .84), m = MAT.steel;
      part(s, t => hafts.fine(t, A, F(6.5, 0)));
      part(s, t => langet(t, F, -4, -14, m), { line: 0 });
      part(s, t => pickBar(t, F, m, { reach: 24, back: 15, arch: 2.5, droop: -9, th: 2.8, chisel: 1 }));
      part(s, t => collar(t, F, m, -3.4, 4.4, 3.6));
      return sel(s);
    },
    rune_etched_pick: () => {
      const s = IC(), F = frame(A, B, .84), m = MAT.alloy;
      part(s, t => hafts.fine(t, A, F(6.5, 0), { wood: C.black, grip: C.leather }));
      part(s, t => langet(t, F, -4, -14, m), { line: 0 });
      part(s, t => pickBar(t, F, m, { reach: 24, back: 20, arch: 2.5, droop: -9, th: 3.2 }));
      part(s, t => collar(t, F, m, -3.4, 4.4, 3.8));
      glyphs(s, [F(1.5, -15), F(2.6, -6)], 3); glyphs(s, [F(2.6, 6), F(1.5, 14)], 3, { seed: 2 });
      s.emit = { dx: 40, dy: 22, rad: 16, col: [.5, .85, 1] };
      return sel(s);
    },
  };
  const blob = (s, F, rq, rr, m, o) => {
    o = o || {};
    const R0 = Math.max(rq, rr) + 1;
    for (let y = Math.floor(F.o[1] - R0); y <= F.o[1] + R0; y++) for (let x = Math.floor(F.o[0] - R0); x <= F.o[0] + R0; x++) {
      const [q, r] = F.inv(x, y), nq = (q - (o.q || 0)) / rq, nr = (r - (o.r || 0)) / rr, d = nq * nq + nr * nr; if (d > 1) continue;
      const nz = Math.sqrt(1 - d), nx = F.u[0] * nq - F.u[1] * nr, ny = F.u[1] * nq + F.u[0] * nr;
      let L = .46 + (nx * LV[0] + ny * LV[1] + nz * LV[2]) * .46;
      if (o.groove && Math.abs(r - (o.r || 0)) < o.groove) L -= .2;
      s.set(x, y, tone(m, L, x, y));
    }
  };
  const hammerHead = (F, o) => [[o.h, -o.face, 'top'], [o.h, -o.face + 3, 'top'], [o.n, -o.face + 5, 'top'], [o.n + .6, -3.2, 'top'], [o.n + .6, 3.2, 'top'], ...qv([o.n, 4], [o.n + 1, o.claw * .6], [o.cq, o.claw], 'top', 8), ...qv([o.cq, o.claw], [-o.n + 1, o.claw * .5], [-o.n - .6, 3.2], 'bot', 8), [-o.n - .6, 3.2, 'bot'], [-o.n - .6, -3.2, 'bot'], [-o.n, -o.face + 5, 'bot'], [-o.h, -o.face + 3, 'bot'], [-o.h, -o.face, 'edge']];
  const hammers = {
    stone_hammer: () => {
      const s = IC(), F = frame(A, B, .8);
      part(s, t => hafts.branch(t, A, F(5, 0), { club: 1.6, seed: 21 }));
      part(s, t => blob(t, F, 8.4, 13.5, MAT.stone, { groove: 2.6 }));
      part(s, t => { strand(t, F(-8, -2.2), F(8, 2.2), C.hide, 1.2); strand(t, F(-8, 2.2), F(8, -2.2), C.hide, 1.2); }, { line: 0 });
      part(s, t => bindings(t, F, 3.5, C.hide, [[-12.5, -8.2]]), { line: 0 });
      return sel(s);
    },
    iron_hammer: () => {
      const s = IC(), a = [12, 54], b = [44, 22], F = frame(a, b, .84, 1.3), m = MAT.iron;
      part(s, t => hafts.shaped(t, a, F(5.6, 0)));
      part(s, t => poly(t, F.pts(hammerHead(F, { h: 4.6, n: 3, face: 11, claw: 12, cq: -6 })), metalFace(m, F, { eye: 2.6, bevel: 1.6 })));
      return sel(s);
    },
    steel_hammer: () => {
      const s = IC(), a = [11, 55], b = [45, 21], F = frame(a, b, .86, 1.3), m = MAT.steel;
      part(s, t => hafts.fine(t, a, F(5.4, 0)));
      part(s, t => langet(t, F, -4, -10, m), { line: 0 });
      part(s, t => poly(t, F.pts(hammerHead(F, { h: 4.8, n: 2.6, face: 13, claw: 15, cq: -2 })), metalFace(m, F, { eye: 2.4, bevel: 1.8, ph: 2 })));
      return sel(s);
    },
  };
  const hoeBlade = o => [[5, -o.r0, 'top'], [6, -o.r0 - 4.6, 'top'], ...qv([6, -o.r0 - 4.6], [-o.len * .4, -o.r0 - 6], [-o.len, -o.r0 - 7.5 - o.flare, 'top'], 'top', 6), [-o.len, -o.r0 - 7.5 - o.flare, 'edge'], [-o.len - 1, -o.r0 + 1.5, 'bot'], ...qv([-o.len - 1, -o.r0 + 1.5], [-o.len * .4, -o.r0 + .5], [5, -o.r0], 'bot', 6)];
  const hoes = {
    stone_hoe: () => {
      const s = IC(), F = frame(A, B, .86);
      part(s, t => hafts.branch(t, A, F(7, 0), { club: 1.4, seed: 26 }));
      part(s, t => stoneHead(t, frame(F(2, 4), F(-14, -20)), [[4.4, 5, 'back'], ...qv([5, -4], [3, -14], [-10, -23], 'edge', 6), [-10, -23, 'edge'], [-17, -17, 'edge'], ...qv([-17, -17], [-7, -10], [-4.6, -3], 'edge', 6), [-4.6, -3, 'bot'], [-3.6, 5, 'back']].map(p => F(p[0], p[1]).concat(p[2])), 41, { amp: 1.1, raw: 1, pitch: 4.4 }));
      part(s, t => bindings(t, F, 3.6, C.cord, [[-4.4, 4.4]]), { line: 0 });
      part(s, t => { strand(t, F(5, -3.4), F(-5, 3.4), C.cord, 1); strand(t, F(5, 3.4), F(-5, -3.4), C.cord, 1); }, { line: 0 });
      return sel(s);
    },
    metal: m => () => {
      const s = IC(), F = frame(A, B, .9), st = m === MAT.steel;
      part(s, t => (st ? hafts.fine : hafts.shaped)(t, A, F(3, 0)));
      part(s, t => collar(t, F, m, -6, 1.6, 3.3));
      part(s, t => stroke(t, [...bez(F(0, 0), F(6.5, 0), F(6, -6), 8), F(5, -9)], 1.5, (u, v, d, hw, x, y) => tone(m, .56 - v * .26, x, y), { round: 1 }));
      part(s, t => poly(t, F.pts(hoeBlade({ r0: 8, len: st ? 13 : 11, flare: st ? 2.5 : 1 })), metalFace(m, F, { bevel: st ? 2.4 : 1.8 })));
      return sel(s);
    },
  };
  const grips = {
    tee: (s, a, b) => { const F = frame(a, b, 0); stroke(s, [F(0, -6), F(0, 6)], 2.3, woodC(C.ash, 3), { round: 1 }); },
    dee: (s, a, b, m) => {
      const F = frame(a, b, 0);
      stroke(s, [F(7, -1.6), F(1, -5.4), F(-4.5, -5.4)], 1.3, woodC(C.dark, 3), { round: 1 }); stroke(s, [F(7, 1.6), F(1, 5.4), F(-4.5, 5.4)], 1.3, woodC(C.dark, 5), { round: 1 });
      stroke(s, [F(-4.5, -6.6), F(-4.5, 6.6)], 2, woodC(C.dark, 7), { round: 1 });
    },
  };
  const spades = {
    digging_stick: () => {
      const s = IC(), a = [10, 56], b = [53, 13], F = frame(a, b);
      part(s, t => stroke(t, bez(a, F(F.len * .5, 2.2), b, 14), u => u > .82 ? 2.4 * Math.pow((1 - u) / .18, .7) + .3 : 2.4 - u * .3 + (u < .06 ? .3 : 0), woodC(C.wood, 31, { char: .72, knot: .3, len: F.len }), { round: 1 }));
      return sel(s);
    },
    stone_spade: () => {
      const s = IC(), a = [10, 56], b = [38, 28], F = frame(a, b, 1);
      part(s, t => poly(t, rough(F.pts([[-4, 8, 'top'], ...qv([-4, -8], [-5, -9], [4, -9.5], 'top', 5), ...qv([4, -9.5], [17, -9], [21, 0], 'edge', 8), ...qv([21, 0], [17, 9], [4, 9.5], 'edge', 8), [4, 9.5, 'bot'], [-4, 8, 'bot']]), 1.2, 51, ['edge']), (x, y, D) => { const [q, r] = F.inv(x, y); let L = .5 - r * .012 + (D.edge < 2.4 ? .16 : 0) + (D.all < 1.3 ? .08 : 0); L += (hash(Math.floor((q + r * .3) * .8), 3, 2) - .5) * .12; return tone(MAT.stone, L, x, y); }));
      part(s, t => hafts.branch(t, a, F(9, 0), { seed: 33, bend: 1 }));
      part(s, t => bindings(t, F, 3.3, C.cord, [[-3, -.5], [4, 7]]), { line: 0 });
      part(s, t => { strand(t, F(-.5, -8), F(4, 2.6), C.cord, 1); strand(t, F(-.5, 8), F(4, -2.6), C.cord, 1); }, { line: 0 });
      return sel(s);
    },
    metal: m => () => {
      const s = IC(), a = [13, 53], b = [36, 30], F = frame(a, b, 1), st = m === MAT.steel;
      part(s, t => (st ? hafts.fine : hafts.shaped)(t, a, F(2, 0), { wood: st ? C.dark : C.ash }));
      part(s, t => (st ? grips.dee : grips.tee)(t, a, b, m));
      part(s, t => poly(t, F.pts([[-1, 8.6, 'top'], [1.5, 9, 'top'], ...qv([1.5, 9], [16, 9], [st ? 22 : 20, 0], 'edge', 9), ...qv([st ? 22 : 20, 0], [16, -9], [1.5, -9], 'edge', 9), [-1, -8.6, 'top'], [-1, -3, 'poll'], [-1, 3, 'top']]), (x, y, D) => { const [q, r] = F.inv(x, y); let L = .5 - r * .022; if (Math.abs(r) < 1.3 && q < 14) L += r < 0 ? .22 : -.12; if (D.edge < 2.2) L = .7 + m.shine * .2; if (D.top < 1.6) L += .14; if (m.shine > .7) L += Math.max(0, Math.sin((x - y) * .2) - .7) * .5; return tone(m, L, x, y); }));
      part(s, t => poly(t, F.pts([[-9, 2.4, 'bot'], [-9, -2.4, 'bot'], [0, -3.4, 'top'], [3, 0, 'top'], [0, 3.4, 'poll']]), metalFace(m, F, {})));
      return sel(s);
    },
  };
  const flintLeaf = (s, F, len, w, sd) => stoneHead(s, F, [...qv([0, -w * .55], [len * .3, -w * 1.25], [len, 0], 'edge', 9), ...qv([len, 0], [len * .45, w * 1.1], [0, w * .55], 'edge', 9), [0, w * .55, 'back']], sd, { amp: 1.1 });
  const knives = {
    flint_knife: () => {
      const s = IC(), a = [14, 50], b = [50, 14], F = frame(a, b, .4);
      part(s, t => flintLeaf(t, F, 30, 6.4, 61));
      part(s, t => stroke(t, [a, F(2.5, 0)], u => 3.4 - u * .5, cordC(C.hide, 2.6, 20), { round: 1 }));
      part(s, t => strand(t, F(-18, -2), F(-22, 3.5), C.hide, 1), { line: 0 });
      return sel(s);
    },
    copper_knife: () => {
      const s = IC(), a = [14, 50], b = [50, 14], F = frame(a, b, .4), m = MAT.copper;
      part(s, t => blade(t, F(-2, 0), b, 5, m, { leaf: 1, tip: .62, fuller: 0 }));
      part(s, t => stroke(t, [a, F(1.5, 0)], u => 3 + (u < .12 ? 1 : 0), cordC(C.cord, 2.4, 20), { round: 1 }));
      return sel(s);
    },
    bone_cleaver: () => {
      const s = IC(), a = [13, 52], b = [48, 17], F = frame(a, b, .42), m = MAT.bone;
      part(s, t => poly(t, rough(F.pts([[-3, -2.4, 'top'], [2, -6, 'top'], ...qv([2, -6], [14, -8], [28, -4.5], 'top', 6), [28, -4.5, 'top'], [29, 1, 'edge'], ...qv([29, 1], [18, 9.5], [3, 8], 'edge', 8), [3, 8, 'bot'], [-3, 2.4, 'poll']]), .9, 71, ['top']), (x, y, D) => { const [q, r] = F.inv(x, y); let L = .56 - r * .02 + (hash(Math.floor(r * 1.1 + Math.sin(q * .3) * 1.2), 2, 5) - .5) * .12; if (D.edge < 2.4) L += .2; if (D.top < 1.6) L -= .14; if (r < -2 && hash(x >> 1, y >> 1, 3) > .86) L -= .2; return tone(m, L, x, y); }));
      part(s, t => haft(t, [a, F(1, 0)], u => 3 + (u < .1 ? .8 : 0), C.dark, { seed: 44, round: 1 }));
      part(s, t => bindings(t, F, 3.6, C.cord, [[-6, 2]]), { line: 0 });
      return sel(s);
    },
  };
  const sickle = () => {
    const s = IC(), pts = [[13, 57], [27, 39], ...bez([27, 39], [41, 22], [37, 13], 10).slice(1), ...bez([37, 13], [33, 5], [22, 7], 8).slice(1), ...bez([22, 7], [14, 9], [9, 16], 6).slice(1)];
    const cx = 22, cy = 24, teeth = [];
    let L = 0; const acc = [0]; for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); acc.push(L); }
    const at = d => { let i = 1; while (i < pts.length - 1 && acc[i] < d) i++; const k = (d - acc[i - 1]) / (acc[i] - acc[i - 1]); return [lerp(pts[i - 1], pts[i], k), [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]]; };
    for (let d = 28; d < L - 4; d += 6.4) { const [p, tv] = at(d), l = Math.hypot(tv[0], tv[1]); let nx = -tv[1] / l, ny = tv[0] / l; if (nx * (cx - p[0]) + ny * (cy - p[1]) < 0) { nx = -nx; ny = -ny; } teeth.push([p, [tv[0] / l, tv[1] / l], [nx, ny]]); }
    part(s, t => teeth.forEach(([p, tv, nv], i) => poly(t, [[p[0] - tv[0] * 3.8, p[1] - tv[1] * 3.8, 'back'], [p[0] + tv[0] * 3.8, p[1] + tv[1] * 3.8, 'edge'], [p[0] + tv[0] * (1.4 - (i & 1) * 2) + nv[0] * 7.4, p[1] + tv[1] * (1.4 - (i & 1) * 2) + nv[1] * 7.4, 'edge']], (x, y, D) => rp(C.flint, D.edge < 1.1 ? .9 : .42 + (hash(i, 3, 5) - .5) * .2 + (D.back < 2 ? -.16 : 0), x, y, .2))));
    part(s, t => stroke(t, pts, u => 2.9 - u * 1.3 + (u < .05 ? .5 : 0), woodC(C.wood, 17, { knot: .2, len: L }), { round: 1 }));
    part(s, t => stroke(t, pts, u => u > .04 && u < .26 ? 3.4 - u * 1.3 : 0, cordC(C.cord, 2.4, L)), { line: 0 });
    return sel(s);
  };
  const handaxe = () => {
    const s = IC(), a = [18, 51], b = [48, 13], F = frame(a, b), n = 16, up = [], dn = [];
    const w = t => t < .3 ? 12.5 * Math.sqrt(1 - Math.pow((.3 - t) / .34, 2)) : 12.5 * Math.pow(1 - Math.pow((t - .3) / .7, 1.5), .9);
    for (let i = 0; i <= n; i++) { const t = i / n; up.push([t * F.len, -w(t) * .95, t < .22 ? 'back' : 'edge']); dn.push([t * F.len, w(t), t < .2 ? 'back' : 'edge']); }
    const pts = [...up, ...dn.reverse().map((p, i, l) => [p[0], p[1], (l[i + 1] || up[0])[2]])];
    part(s, t => poly(t, rough(F.pts(pts), 1.3, 91, ['back']), flake(MAT.flint, F, { sd: 91, cortex: 4.5, pitch: 5.6 })));
    return sel(s);
  };
  const saw = () => {
    const s = IC(), m = MAT.bronze;
    part(s, t => { for (let x = 13; x <= 50; x++) for (let y = 46; y <= 50; y++) { if (y === 50 && (x & 1)) continue; if (y === 49 && x % 4 === 3) continue; t.set(x, y, tone(m, y === 46 ? .8 : y >= 49 ? .86 : .52 + Math.max(0, Math.sin(x * .5) - .7) * .6, x, y)); } });
    part(s, t => stroke(t, [[13, 16], [51, 16]], 1.1, cordC(C.sinew, 2, 38)), { line: 0 });
    part(s, t => haft(t, [[34, 13], [27, 31]], 1.3, C.dark, { seed: 3, round: 1 }));
    part(s, t => haft(t, [[14, 30], [50, 30]], 2, C.ash, { seed: 5 }));
    part(s, t => { haft(t, [[12, 11], [12, 52]], u => 2.4 + (u > .9 ? .6 : 0), C.ash, { seed: 7, round: 1 }); });
    part(s, t => { haft(t, [[52, 11], [52, 52]], u => 2.4 + (u > .9 ? .6 : 0), C.ash, { seed: 9, round: 1 }); });
    return sel(s);
  };
  X.hdTools = { A, B, hafts, langet, axeHead, stoneHead, bindings, pickBar, collar, blob, flintLeaf, grips };
  makers.push(o => {
    const id = o.id, m = matOf(o);
    if (axes[id]) return axes[id];
    if (picks[id]) return picks[id];
    if (hammers[id]) return hammers[id];
    if (id === 'stone_hoe') return hoes.stone_hoe;
    if (/^(iron|steel)_hoe$/.test(id)) return hoes.metal(m);
    if (spades[id]) return spades[id];
    if (/^(iron|steel)_shovel$/.test(id)) return spades.metal(m);
    if (knives[id]) return knives[id];
    if (id === 'flint_sickle') return sickle;
    if (id === 'flint_handaxe') return handaxe;
    if (id === 'saw') return saw;
    return null;
  });
})();
