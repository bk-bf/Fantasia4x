'use strict';
(() => {
  const SLATE = R('#1a1e26 #282e3a #3a4250 #4e5868 #687284 #8a94a2'), DOWN = R('#7a746c #9c968c #bab4a8 #d4cec2 #e8e4da #f6f4ee');
  const UMBER = R('#1a120c #2a1c12 #3c2a1a #523a24 #6a4e30 #84663e'), STORM = R('#121a2a #1c2840 #283a58 #385072 #4c6a8e #6a88a8');
  const LOOK = {
    hawk_eyas: { k: .74, back: DOWN, breast: DOWN, head: DOWN, tail: DOWN, eye: P.ink, legs: P.gold, down: 1 },
    hawk: { k: 1.05, back: SLATE, breast: P.furWhite, bars: SLATE, head: SLATE, brow: P.furWhite[4], tail: SLATE, band: P.furDark, eye: P.fire[2], legs: P.gold },
    moor_harrier: { k: 1, back: P.furBrown, breast: P.furTan, bars: P.furBrown, head: P.furTan, tail: P.furGrey, band: P.furDark, rump: P.furWhite[4], eye: P.gold[4], legs: P.gold },
    crag_eagle: { k: 1.38, back: UMBER, breast: UMBER, head: P.gold, nape: 1, tail: UMBER, band: P.furDark, eye: P.furBrown[4], legs: P.gold, trousers: 1 },
    stormcrest_eagle: { k: 1.62, back: STORM, breast: P.furWhite, bars: STORM, head: P.furWhite, tail: STORM, band: P.furWhite, eye: P.mana[4], legs: P.gold, crest: P.mana, trousers: 1 },
  };
  const D = Math.PI / 180, add = (p, v, f = 1) => [p[0] + v[0] * f, p[1] + v[1] * f], dir = deg => [Math.cos(deg * D), Math.sin(deg * D)];

  function wing(s, S, phi, k, ramp, bright, short) {
    const sw = phi < 0 ? -28 : 28, W = add(S, dir(phi), 7 * k * (short ? .55 : 1)), T = add(W, dir(phi + sw), 9 * k * (short ? .5 : 1));
    const edge = t => t < .45 ? [mix(S[0], W[0], t / .45), mix(S[1], W[1], t / .45)] : [mix(W[0], T[0], (t - .45) / .55), mix(W[1], T[1], (t - .45) / .55)];
    const n = ramp.length - 1;
    for (let i = 0; i <= 14; i++) {
      const t = i / 14, e0 = edge(Math.max(0, t - .05)), e1 = edge(Math.min(1, t + .05)), ex = e1[0] - e0[0], ey = e1[1] - e0[1], el = Math.hypot(ex, ey) || 1;
      let px = -ey / el, py = ex / el;
      if (px > 0) { px = -px; py = -py; }
      const fing = t > .8, len = (fing ? 4 + (t - .8) * 14 : 4.5 + t * 3.5) * k * (short ? .6 : 1), p0 = edge(t), fx = fing ? mix(px, ex / el, .55) : px, fy = fing ? mix(py, ey / el, .55) : py;
      s.thick(p0[0], p0[1], p0[0] + fx * len, p0[1] + fy * len, Math.max(1, rnd(1.2 * k)), ramp, clamp(bright - (i & 1), 0, n));
      s.set(p0[0] + fx * len, p0[1] + fy * len, ramp[Math.max(0, bright - 3)]);
    }
    for (let i = 0; i <= 24; i++) { const p = edge(i / 24); s.set(p[0], p[1], ramp[clamp(bright + 1, 0, n)]); }
    return T;
  }

  LAIR.RIGS.raptor = (A, p) => {
    const L = LOOK[A.kind], k = L.k, s = new Spr(150, 210, 75, 200), gy = 200, cx = 75, alt = rnd(p.alt || 0), tilt = (p.tilt === undefined ? -55 : p.tilt) * D;
    const u = [Math.cos(tilt), Math.sin(tilt)], nr = [Math.sin(tilt), -Math.cos(tilt)], legs = p.legs || 'perch', bo = { n: L.down ? .7 : .3, ns: 1, d: .16 };
    const foot = legs === 'reach' ? null : [cx, gy - alt], C = legs === 'perch' ? [cx - 1, gy - alt - (5 + (L.trousers ? 1 : 0)) * k - 3.6 * k] : legs === 'grip' ? [cx, gy - alt - 6 * k] : [cx, gy - alt - 5 * k];
    const S = add(add(C, u, 2.4 * k), nr, 2 * k), TB = add(C, u, -4.6 * k), spread = p.fan || 0;
    if (p.wf !== undefined && !L.down) wing(s, add(S, [-1, -1]), p.wf, k, L.back.map(c => dark(c, .7)), 3);
    for (let i = -2; i <= 2; i++) {
      const end = add(add(TB, u, -8 * k), nr, i * (.45 + spread * .9) * k);
      s.thick(TB[0], TB[1], end[0], end[1], Math.max(1, rnd(1.3 * k)), L.tail, 2 + (i < 0 ? 1 : 0) - (Math.abs(i) & 1));
      if (L.band) for (const f of [.45, .75]) s.set(mix(TB[0], end[0], f), mix(TB[1], end[1], f), L.band[1]);
    }
    const knee = add(C, [-.6 * k, 3 * k]), farFoot = legs === 'reach' ? add(C, [7 * k, 4.6 * k]) : legs === 'grip' ? add(C, [-1.6 * k, 6 * k]) : [foot[0] - 1.6 * k, foot[1]];
    const nearFoot = legs === 'reach' ? add(C, [8 * k, 6 * k]) : legs === 'grip' ? add(C, [1.4 * k, 6 * k]) : foot;
    const talon = (F, open, lr) => { const n = lr.length - 1; for (const [dx, dy] of open ? [[2.4, -1], [2.6, 1.4], [-2, .6]] : [[2, 0], [1.4, 1], [-1.6, 0]]) { s.line(F[0], F[1], F[0] + dx * k, F[1] + dy * k, lr[n - 1]); s.set(F[0] + dx * k + (dx > 0 ? 1 : -1), F[1] + dy * k + 1, P.ink); } };
    const leg = (F, far) => { if (legs === 'tuck') return; const lr = far ? L.legs.map(c => dark(c, .75)) : L.legs; s.thick(knee[0] + (far ? -1 : 0), knee[1], F[0], F[1], Math.max(1, rnd(k)), lr, lr.length - 2); talon(F, legs === 'reach', lr); };
    leg(farFoot, true);
    if (p.kill) stamp(s, SMALL.lying(p.kill), cx + 5 * k, gy - alt + 1);
    if (p.prey) stamp(s, SMALL.limp(p.prey, 3), cx, C[1] + 5.4 * k);
    s.ball(C[0] + u[0] * 2.2 * k, C[1] + u[1] * 2.2 * k, 4 * k, 3.7 * k, 2, L.back, bo);
    s.ball(C[0] - u[0] * 2.2 * k, C[1] - u[1] * 2.2 * k, 3.6 * k, 3.3 * k, 1, L.back, bo);
    if (L.trousers || legs !== 'tuck') s.ball(knee[0], knee[1] - .6 * k, 2 * k, 2.4 * k, 3, L.breast, bo);
    for (let y = rnd(C[1] - 8 * k); y <= C[1] + 8 * k; y++) for (let x = rnd(C[0] - 8 * k); x <= C[0] + 8 * k; x++) {
      const c = s.get(x, y), i = L.back.indexOf(c);
      if (i < 0) continue;
      const dn = (x - C[0]) * nr[0] + (y - C[1]) * nr[1], du = (x - C[0]) * u[0] + (y - C[1]) * u[1];
      if (dn < -.4 * k) s.set(x, y, L.bars && (rnd(du) & 1) && dith(x, y) > .4 ? L.bars[clamp(i, 1, L.bars.length - 2)] : L.breast[clamp(i + 1, 0, L.breast.length - 1)]);
      else if (L.rump && du < -2.4 * k && du > -4 * k) s.set(x, y, L.rump);
    }
    leg(nearFoot, false);
    if (p.prey && legs === 'grip') for (const F of [farFoot, nearFoot]) talon(F, false, L.legs);
    if (p.wn === undefined || L.down) {
      const short = L.down, E = add(add(S, u, (short ? -6 : -11) * k), nr, -.6 * k);
      for (let j = 0; j < 4; j++) s.thick(S[0] - nr[0] * j * .8 * k, S[1] - nr[1] * j * .8 * k, E[0] - nr[0] * j * .5 * k, E[1] - nr[1] * j * .5 * k, Math.max(1, rnd(1.4 * k)), L.back, 3 - (j & 1) - (j > 2 ? 1 : 0));
      for (let t = .35; t <= 1; t += .12) { const q = [mix(S[0], E[0], t), mix(S[1], E[1], t)]; s.set(q[0] - nr[0] * 2.2 * k, q[1] - nr[1] * 2.2 * k, L.back[5] || L.back[4]); }
      if (p.wn !== undefined && L.down) wing(s, S, p.wn, k, L.back, 4, true);
    } else wing(s, S, p.wn, k, L.back, 4);
    const bow = p.bow || 0, H = p.tuck ? add(add(C, u, 3 * k), nr, 2.6 * k) : add(add(add(C, u, 5.6 * k), nr, 1.8 * k), [bow * 2 * k, bow * 5.5 * k]), hr = (L.down ? 3.4 : 2.9) * k;
    s.ball(H[0], H[1], hr, hr * .95, 5, L.head, { ...bo, bias: .04 });
    if (L.nape) for (let j = 0; j < 4; j++) s.thick(H[0] - 2 * k, H[1] - j, H[0] - 3.6 * k, H[1] + 3 * k - j, 1, L.back, 2 + (j & 1));
    if (L.crest) for (let j = 0; j < 4; j++) { const a = -150 - j * 12, e = add(H, dir(a), (5 + j) * k); s.thick(H[0] - k, H[1] - hr * .6, e[0], e[1], 1, L.crest, 3 + (j & 1), 0); s.set(e[0], e[1], L.crest[5], 230); s.set(mix(H[0], e[0], .6), mix(H[1], e[1], .6), L.crest[4], 200); }
    if (!p.tuck) {
      const bd = bow > .4 ? [.45, 1] : [1, .3], bx = H[0] + hr * .8, by = H[1] + .4 * k, n = Math.max(2, rnd(2.2 * k));
      s.set(bx, by - 1, P.gold[3]); s.set(bx - 1, by - 1, P.gold[4]);
      for (let i = 0; i < n; i++) { s.set(bx + bd[0] * i, by + bd[1] * i, i === n - 1 ? P.ink : P.furDark[3]); s.set(bx + bd[0] * i, by + bd[1] * i + 1, P.furDark[2]); }
      s.set(bx + bd[0] * (n - 1) + (bd[0] > .6 ? 0 : -1), by + bd[1] * (n - 1) + 2, P.ink);
      if (p.cry) { s.set(bx + 1, by + 2, P.red[1]); s.set(bx + 2, by + 2, P.furDark[2]); }
      const ex = rnd(H[0] + .9 * k), ey = rnd(H[1] - .6 * k);
      if (p.blink) s.rect(ex - 1, ey, 2, 1, L.head[1]); else { s.rect(ex, ey, Math.max(1, rnd(k * .8)), Math.max(1, rnd(k * .8)), L.eye, L.crest ? 220 : 0); s.set(ex, ey + 1, P.ink); }
      if (L.brow) for (let i = -2; i <= 1; i++) s.set(ex + i, ey - 1, L.brow);
      else s.set(ex - 1, ey - 1, L.head[0]);
    }
    s.outline();
    s.sh = { rx: Math.max(4, 9 - alt * .05) * k, ry: Math.max(1.6, 2.6 - alt * .015) * k, dx: 1, dy: 0, k: Math.max(.25, .7 - alt * .006) };
    s.pts = { head: [H[0], H[1] - hr - 4], mouth: [H[0] + hr, H[1] + 1], body: C, feet: [] };
    return s;
  };

  const ease = u => u * u * (3 - 2 * u);
  const ramped = (from, to, more) => (u, c) => ({ alt: mix(from(c.o), to(c.o), ease(u)), ...more(u, c) });
  const flapping = (u, n = 1) => ({ wn: -95 + (1 + cs(u * n)) * 80, wf: -100 + (1 + cs(u * n + .06)) * 70 });
  const soaring = u => ({ wn: 100 + sn(u) * 6, wf: -96 - sn(u) * 6, tilt: 0, legs: 'tuck', fan: .6 });
  const perched = (c, more) => ({ alt: c.o.at, tilt: -55, ...more });
  const ANIMS = {
    idle: { label: 'Perched', dur: 3, n: 6, pose(u, c) { const j = Math.floor(u * 6); return perched(c, { blink: u > .9 ? 1 : 0, bow: j === 2 ? -.2 : 0 }); } },
    roost: { label: 'Roosting', dur: 3.6, n: 4, pose(u, c) { return perched(c, { tuck: 1, tilt: -40, alt: c.o.at + (u > .4 && u < .8 ? 0 : 1) }); } },
    cry: { label: 'Calling', dur: 1.4, n: 6, pose(u, c) { const k = u > .2 && u < .75; return perched(c, { cry: k ? 1 : 0, tilt: k ? -65 : -55 }); } },
    rouse: { label: 'Rousing its feathers', dur: 1.2, n: 8, pose(u, c) { const k = Math.floor(u * 8) & 1; return perched(c, { wn: k ? -40 : 20, wf: k ? -50 : 10, fan: k, tilt: -50 }); } },
    beg: { label: 'Begging', dur: 1.1, n: 6, pose(u, c) { const k = Math.floor(u * 6) & 1; return perched(c, { cry: 1, tilt: -70, wn: k ? -30 : 10 }); } },
    feed: { label: 'Feeding the young', dur: 1.6, n: 8, pose(u, c) { const k = Math.floor(u * 8) & 1; return perched(c, { bow: .6 + k * .3, tilt: -30, kill: c.o.kill }); } },
    lift: { label: 'Taking off', dur: .9, n: 8, once: 1, pose: ramped(o => o.at, o => o.sky, u => ({ ...flapping(u, 3), tilt: mix(-50, -5, u), legs: u > .6 ? 'tuck' : 'perch', fan: 1 })) },
    fly: { label: 'Flying', dist: 54, n: 6, pose(u, c) { return { alt: c.o.sky, ...flapping(u), tilt: -4, legs: 'tuck' }; } },
    glide: { label: 'Soaring', dist: 80, n: 6, pose(u, c) { return { alt: c.o.sky + sn(u) * 2, ...soaring(u) }; } },
    stoop: { label: 'Stooping', dist: 112, n: 10, pose(u, c) {
      const f = u < .82 ? ease(u / .82) : 1, flare = u > .82;
      return flare ? { alt: mix(10, 2, (u - .82) / .18), wn: -100, wf: -94, tilt: -40, legs: 'reach', fan: 1 } : { alt: mix(c.o.sky, 10, f), tilt: mix(15, 55, f), legs: 'tuck' };
    } },
    strike: { label: 'Striking', dur: .7, n: 7, once: 1, hit: [.4, 'blow'], pose(u, c) { const k = Math.floor(u * 7) & 1; return { alt: 1, wn: -100 + k * 20, wf: -94 + k * 16, tilt: -30, legs: u < .4 ? 'reach' : 'perch', fan: 1, kill: u >= .4 ? c.o.prey : null }; } },
    mantle: { label: 'Mantling over the kill', dur: 2, n: 4, pose(u, c) { return { alt: 1, wn: 55, wf: 20, tilt: -35, fan: 1, bow: u > .5 ? .2 : 0, kill: c.o.prey, blink: u > .9 ? 1 : 0 }; } },
    pluck: { label: 'Plucking', dur: 1.3, n: 8, hit: [.6, 'blow'], pose(u, c) { const k = Math.floor(u * 8) & 1; return { alt: c.o.post || 1, tilt: -30, bow: .7 + k * .3, kill: c.o.prey }; } },
    snatch: { label: 'Rising with the kill', dur: 1.1, n: 8, once: 1, pose: ramped(() => 1, o => o.sky, (u, c) => ({ ...flapping(u, 4), tilt: mix(-40, -6, u), legs: 'grip', prey: c.o.prey, fan: 1 })) },
    carry: { label: 'Carrying in its talons', dist: 54, n: 6, pose(u, c) { return { alt: c.o.sky, ...flapping(u), tilt: -6, legs: 'grip', prey: c.o.prey }; } },
    settle: { label: 'Landing', dur: .9, n: 8, once: 1, pose: ramped(o => o.sky, o => o.at, u => ({ ...flapping(u, 2), tilt: mix(-10, -55, u), legs: u > .5 ? 'perch' : 'tuck', fan: 1 })) },
    settleprey: { label: 'Landing with the kill', dur: 1, n: 8, once: 1, pose: ramped(o => o.sky, o => o.at, (u, c) => ({ ...flapping(u, 2), tilt: mix(-10, -50, u), legs: u > .85 ? 'perch' : 'grip', prey: u > .85 ? null : c.o.prey, kill: u > .85 ? c.o.prey : null, fan: 1 })) },
    landpost: { label: 'Landing with the kill', dur: 1, n: 8, once: 1, pose: ramped(o => o.sky, o => o.post || 1, (u, c) => ({ ...flapping(u, 2), tilt: mix(-10, -50, u), legs: u > .85 ? 'perch' : 'grip', prey: u > .85 ? null : c.o.prey, kill: u > .85 ? c.o.prey : null, fan: 1 })) },
    liftpost: { label: 'Taking the kill up', dur: 1, n: 8, once: 1, pose: ramped(o => o.post || 1, o => o.sky, (u, c) => ({ ...flapping(u, 4), tilt: mix(-40, -6, u), legs: 'grip', prey: c.o.prey, fan: 1 })) },
    down: { label: 'Dead', dur: 3, n: 1, pose() { return { alt: -3, tilt: 12, wn: 150, legs: 'tuck', blink: 1, fan: .4 }; } },
    eat: { label: 'Eating', dur: 1.4, n: 8, pose(u, c) { const k = Math.floor(u * 8) & 1; return perched(c, { bow: .7 + k * .3, tilt: -30, kill: c.o.prey }); } },
  };
  const NAMES = { hawk_eyas: 'Eyas', hawk: 'Goshawk', moor_harrier: 'Moor Harrier', crag_eagle: 'Crag Eagle', stormcrest_eagle: 'Stormcrest Eagle' };
  let N = 0;
  LAIR.raptor = (kind, at, sky, more) => ({ rig: 'raptor', kind, seed: (++N * .618) % 1, id: 'raptor' + N, look: 'raptor:' + kind, o: { at, sky, ...(more || {}) }, base: null, name: NAMES[kind], anims: ANIMS });
  LAIR.RAPTOR = { LOOK, ANIMS, NAMES };
})();
