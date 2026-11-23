'use strict';
(() => {
  const A = HUD.art, RAMP = A.RAMP, INK = RAMP.inkwash;
  const DYES = [P.red, P.blue, P.green, P.purple, RAMP.ochre, RAMP.verdigris];
  const ribbon = (w, h, el) => A.ribbon(w, h, DYES[+el.dataset.dye], { down: true, on: el.classList.contains('on'), seed: +el.dataset.dye });
  const page = o => (w, h) => { const base = A.vellum(w, h, o); return { base, lit: A.candleMask(base, { rim: o.rim }) }; };
  const box = (w, h, fill, seed) => A.paint(w, h, (x, y) => {
    const l = x, r = w - 1 - x, t = y, b = h - 1 - y, d = Math.min(l, r, t, b), cx = Math.min(l, r), cy = Math.min(t, b);
    if (cx + cy === 0) return null;
    if (d === 0) return hash(x, y, seed) > .05 ? INK[1] : INK[3];
    return fill ? fill(x, y, d, t) : null;
  });
  const KIND = { warn: 'ember', cold: 'water', good: 'leaf', trait: 'honey', neg: 'blood' };
  const PIGMENT = { leaf: RAMP.verdigris, honey: RAMP.ochre, ember: RAMP.vermilion, water: RAMP.lapis, blood: RAMP.vermilion, violet: RAMP.violet };

  HUD.skins = {
    timber: {
      name: 'Timber', pov: 'an oak beam across the top with the flags and the sky bowl hanging from it; oak and iron windows float over the map',
      tokens: { '--ink': '#ecdcb4', '--dim': '#c2a678', '--mute': '#957c58', '--hot': '#f2a444', '--pos': '#a4d070', '--neg': '#f0735a', '--cold': '#96c8ec' },
      emit: { '--ember': '#ffc466' },
      glyphRamp: P.iron, glyphLine: undefined,
      portraitBg: (x, y) => rp(RAMP.oakDark, .3 - Math.hypot(x - 24, y - 22) / 120 + (fbm(x * .06, y * .06, 2, 2) - .5) * .2, x, y, .8),
      bar: (w, h, v, ramp) => A.bar(w, h, v, RAMP[ramp] || RAMP.leaf, { ticks: w > 70 }),
      badge: (g, k) => A.badge(g, RAMP[KIND[k]] || RAMP.honey),
      paint: {
        ribbon,
        rail: (w, h) => { const f = A.planks(w, h, { dir: 'h', base: .46, seed: 6, lo: h, hi: h }); return A.paint(w, h, (x, y) => (y === h - 1 ? P.ink : y === h - 2 ? RAMP.oakDark[0] : y === 0 ? RAMP.beam[4] : x % 192 === 96 && (y === 5 || y === h - 7) ? P.iron[6] : f(x, y))); },
        win: (w, h) => A.timber(w, h, { dir: 'v', beam: 4, strap: 11, seed: 8, base: .38, lo: 24, hi: 34 }),
        winbar: (w, h) => { const f = A.planks(w, h, { dir: 'h', base: .2, seed: 12, lo: h, hi: h }); return A.paint(w, h, (x, y) => (y === h - 1 ? P.ink : y === h - 2 ? P.iron[hash(x, 2, 3) > .8 ? 4 : 3] : y === h - 3 ? P.iron[1] : (x % 96 === 10 && y === (h >> 1) - 2) ? P.iron[6] : A.tone(f(x, y), .86))); },
        btn: (w, h) => A.ironBtn(w, h, { rivets: w >= 70 }),
        btnOn: (w, h) => A.ironBtn(w, h, { rivets: w >= 70, down: true }),
        btnOff: (w, h) => A.inset(w, h),
        verb: (w, h) => A.ironBtn(w, h, { rivets: true, down: true }),
        card: (w, h) => A.timber(w, h, { dir: 'h', beam: 4, strap: 10, seed: 5, base: .4 }),
        tip: (w, h) => A.timber(w, h, { dir: 'h', beam: 3, strap: 9, seed: 9, base: .3 }),
        tag: (w, h) => A.timber(w, h, { dir: 'h', beam: 3, strap: 9, seed: 3, base: .34 }),
        well: (w, h) => A.inset(w, h),
        cell: () => null,
        cellOn: (w, h) => A.ironBtn(w, h, { down: true })
      }
    },
    vellum: {
      name: 'Vellum', pov: 'a strip of vellum across the top with the ribbons and the sky bowl hanging from it; every window is a loose leaf laid on the map',
      tokens: { '--ink': '#2a1b10', '--dim': '#5c4631', '--mute': '#86704e', '--hot': '#a3271a', '--pos': '#36632a', '--neg': '#a3271a', '--cold': '#27467e' },
      emit: { '--ember': '#fff2cc' }, inkOnLit: true,
      glyphRamp: INK.slice(0, 4), glyphLine: null,
      portraitBg: (x, y) => { const dia = (x + y) % 8 === 0 || (x - y + 800) % 8 === 0; return dia && (x + y) % 16 === 0 && (x - y + 800) % 16 === 0 ? P.gold[4] : rp(RAMP.lapis, (dia ? .6 : .36) + (fbm(x * .1, y * .1, 2, 2) - .5) * .2, x, y, .7); },
      bar: (w, h, v, ramp) => A.bar(w, h, v, PIGMENT[ramp] || RAMP.verdigris, { empty: [226, 212, 176], line: INK[1], ticks: w > 70, tickCol: INK[3] }),
      badge: (g, k) => A.badge(g, k === 'trait' ? RAMP.violet : PIGMENT[KIND[k]] || RAMP.ochre, { line: INK[1], fg: RAMP.vellum[6], fill: .5 }),
      paint: {
        ribbon,
        rail: page({ rag: .7, seed: 5, base: .84, rim: 3 }),
        win: page({ rule: 5, seed: 9, rim: 14 }),
        winbar: (w, h) => A.paint(w, h, (x, y) => (y === h - 1 && hash(x, 1, 5) > .03 ? INK[1] : y === h - 3 && hash(x >> 1, 2, 6) > .06 ? RAMP.vermilion[2] : null)),
        btn: (w, h) => box(w, h, (x, y, d) => (d === 2 ? INK[4] : rp(RAMP.vellum, .96 + (hash(x, y, 3) - .5) * .1, x, y, .7)), 3),
        btnOn: (w, h) => box(w, h, (x, y) => rp(RAMP.vermilion, .46 + (fbm(x * .2, y * .3, 4, 2) - .5) * .4, x, y, .9), 7),
        btnOff: (w, h) => A.paint(w, h, (x, y) => (Math.min(x, y, w - 1 - x, h - 1 - y) === 0 && ((x + y) >> 1) % 2 === 0 ? INK[3] : null)),
        verb: (w, h) => box(w, h, (x, y, d) => (d === 2 ? P.gold[3] : rp(RAMP.vermilion, .5 + (fbm(x * .2, y * .3, 4, 2) - .5) * .3, x, y, .9)), 5),
        card: page({ rule: 5, seed: 14, rim: 14 }),
        tip: page({ rule: 4, seed: 30, rag: 1.2, rim: 10 }),
        tag: page({ rag: 1.1, seed: 5, base: .82, rim: 5 }),
        well: (w, h) => box(w, h, (x, y, d, t) => (t === 2 && hash(x >> 1, 3, w) > .08 ? RAMP.vermilion[2] : null), w + h),
        cell: () => null,
        cellOn: (w, h) => box(w, h, (x, y) => rp(RAMP.vermilion, .46 + (fbm(x * .2, y * .3, 4, 2) - .5) * .4, x, y, .9), 7)
      }
    }
  };
})();
