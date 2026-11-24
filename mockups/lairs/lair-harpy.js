'use strict';
(() => {
  const FEATHER = R('#3a2430 #563646 #764c5e #986878 #b88a96 #d4b0b6'), MATRON = R('#241a2a #3a2a40 #54405a #725a76 #927894 #b49cb2');
  const between = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t)];

  LAIR.RIGS.harpy = (A, p) => {
    const o = A.o, k = o.matron ? 1.16 : 1, ramp = o.matron ? MATRON : FEATHER, hair = o.matron ? P.furWhite : P.furDark;
    const s = new Spr(116, 156, 58, 146), cx = 58, gy = 146, alt = rnd(p.alt || 0), bow = p.bow || 0, fold = p.fold || 0, w = p.wing || 0, cy = gy - rnd(18 * k) - alt + rnd(bow * 3);
    for (const sd of [-1, 1]) {
      const sh = [cx + sd * 3 * k, cy - 5 * k], a = -w * .7 + .12, turn = (x, y) => [sh[0] + sd * (x * Math.cos(a) - y * Math.sin(a)) * k, sh[1] + (x * Math.sin(a) + y * Math.cos(a)) * k];
      const E = fold ? [sh[0] + sd * 4 * k, sh[1] + 4 * k] : turn(8, -8), T = fold ? [sh[0] + sd * 3 * k, sh[1] + 15 * k] : turn(21, -2);
      const edge = u => u < .45 ? between(sh, E, u / .45) : between(E, T, (u - .45) / .55);
      for (let i = 0; i <= 13; i++) {
        const u = i / 13, [x0, y0] = edge(u), fa = fold ? 1.5708 - sd * .12 : 1.5708 - sd * (u * .95 - .1) - sd * w * .5, len = (fold ? 5 + u * 5 : 8 + u * 8 - (u > .9 ? 3 : 0)) * k;
        s.thick(x0, y0, x0 + Math.cos(fa) * len, y0 + Math.sin(fa) * len, 2, ramp, (sd < 0 ? 3 : 2) - (i & 1)); s.set(x0 + Math.cos(fa) * len, y0 + Math.sin(fa) * len, ramp[1]);
      }
      for (let i = 0; i <= 30; i++) { const [x, y] = edge(i / 30); s.set(x, y, ramp[sd < 0 ? 5 : 4]); s.set(x, y + 1, ramp[sd < 0 ? 4 : 3]); }
    }
    for (let i = -2; i <= 2; i++) s.thick(cx + i * 1.2 * k, cy + 6 * k, cx + i * 2.6 * k, cy + 13 * k, 2, ramp, 2 + (i < 0 ? 1 : 0) - (Math.abs(i) & 1));
    const grip = p.prey && !p.held, reach = p.legs && !grip ? 10 : 15;
    if (p.prey) stamp(s, rigRabbit({ blink: 1, ear: -1 }), cx + (p.held ? 9 : 2), p.held ? gy - alt + 3 : cy + rnd(15 * k) + 12);
    for (const sd of [-1, 1]) {
      const lx = cx + sd * 2.6 * k, fx = lx + sd * (grip ? 0 : k), fy = cy + reach * k;
      s.thick(lx, cy + 7 * k, fx, fy, 1, P.gold, 2);
      for (const d of [-1, 0, 1]) s.line(fx, fy, fx + d * 2, fy + (p.legs && !grip ? 2 : 3) * k, P.gold[d ? 3 : 4]);
    }
    s.ball(cx, cy + 3 * k, 4.6 * k, 5.6 * k, 3, ramp, { n: .4, ns: 1, d: .2 });
    s.ball(cx + bow, cy - 3 * k + bow * 2, 3.8 * k, 3.6 * k, 4, P.skinPale, { d: .2, bias: .04 });
    s.rect(rnd(cx - 3 * k), rnd(cy - k), rnd(6 * k), 1, ramp[1]);
    const hx = cx + bow * 2, hy = cy - 10.5 * k + bow * 8 + (p.tuck ? 3 : 0), hr = 3.8 * k;
    for (let i = -4; i <= 4; i++) s.thick(hx + i * .9 * k, hy - 1, hx + i * 1.9 * k, hy + (7 + (Math.abs(i * 7) % 5)) * k, 1, hair, 2 + (i < 0 ? 1 : 0));
    s.ball(hx, hy, hr, hr * 1.05, 5, P.skinPale, { d: .2, bias: .05 });
    for (let i = -4; i <= 4; i++) { s.set(hx + i * k * .9, hy - hr + Math.abs(i) * .4, hair[2 + (i < 0 ? 1 : 0)]); s.set(hx + i * k * .9, hy - hr + Math.abs(i) * .4 + 1, hair[1 + (i < 0 ? 1 : 0)]); }
    const e = Math.max(1, rnd(k)), shut = p.tuck || p.blink;
    for (const ex of [rnd(hx - 2 * k), rnd(hx + k)]) { if (shut) s.rect(ex, rnd(hy) + 1, e + 1, 1, P.skinPale[1]); else s.rect(ex, rnd(hy), e, e, P.ink); }
    s.rect(rnd(hx - 1), rnd(hy + 2 * k), 2, p.cry ? 3 : Math.max(2, rnd(1.4 * k)), P.red[p.cry ? 1 : 0]);
    if (o.matron) for (let i = -2; i <= 2; i++) s.thick(hx + i * 1.5, hy - hr, hx + i * 3, hy - hr - 5 - (2 - Math.abs(i)) * 2, 1, P.red, 3);
    s.outline();
    s.sh = { rx: Math.max(4, 10 - alt * .06) * k, ry: Math.max(1.6, 3 - alt * .02) * k, dx: 2, dy: 0, k: Math.max(.3, .7 - alt * .006) };
    s.pts = { head: [hx, hy - hr - 5], mouth: [hx, hy + 3], body: [cx, cy], feet: [] };
    return s;
  };

  const flap = (u, more) => ({ wing: cs(u), legs: 1, ...more });
  const ramped = (from, to, more) => (u, c) => ({ alt: mix(from(c.o), to(c.o), u * u * (3 - 2 * u)), wing: cs(u * 3), ...more });
  const ANIMS = {
    idle: { label: 'Standing', dur: 3, n: 4, pose(u, c) { return { alt: c.o.at, fold: 1, blink: u > .92 ? 1 : 0 }; } },
    roost: { label: 'Roosting', dur: 3.6, n: 4, pose(u, c) { return { alt: c.o.at + (u > .4 && u < .8 ? 1 : 0), fold: 1, tuck: 1 }; } },
    cry: { label: 'Screaming', dur: 1.6, n: 8, pose(u, c) { const k = u > .2 && u < .8 ? 1 : 0; return { alt: c.o.at, wing: -.2 + k * .5, cry: k }; } },
    fly: { label: 'Flying', dist: 46, n: 6, pose(u, c) { return flap(u, { alt: c.o.sky }); } },
    carry: { label: 'Carrying prey', dist: 46, n: 6, pose(u, c) { return flap(u, { alt: c.o.sky, prey: 1 }); } },
    circle: { label: 'Circling', dist: 70, n: 6, pose(u, c) { return { alt: c.o.sky, wing: .35 + cs(u) * .25, legs: 1 }; } },
    stoop: { label: 'Stooping', dur: .8, n: 8, once: 1, pose: ramped(o => o.sky, () => 5, { legs: 0 }) },
    snatch: { label: 'Taking prey', dur: 1.1, n: 8, once: 1, pose: ramped(() => 5, o => o.sky, { prey: 1 }) },
    lift: { label: 'Taking off', dur: .9, n: 8, once: 1, pose: ramped(o => o.at, o => o.sky, { legs: 1 }) },
    settle: { label: 'Landing', dur: .9, n: 8, once: 1, pose: ramped(o => o.sky, o => o.at, { legs: 0 }) },
    settleprey: { label: 'Landing with prey', dur: .9, n: 8, once: 1, pose: ramped(o => o.sky, o => o.at, { prey: 1 }) },
    eat: { label: 'Eating', dur: 1.4, n: 8, pose(u, c) { const k = Math.floor(u * 8) & 1; return { alt: c.o.at, fold: 1, bow: .7 + k * .3, prey: 1, held: 1 }; } },
  };
  let N = 0;
  LAIR.harpy = (at, sky, matron) => ({ rig: 'harpy', kind: matron ? 'matron' : 'harpy', seed: (++N * .618) % 1, id: 'harpy' + N, look: 'harpy' + N, o: { at, sky, matron }, base: null, name: matron ? 'Harpy matron' : 'Screamer', anims: ANIMS });
})();
