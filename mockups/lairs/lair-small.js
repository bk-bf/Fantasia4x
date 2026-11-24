'use strict';
const SMALL = (() => {
  const C = {
    fox: R('#2e1208 #50200c #7a3412 #a24c1a #c46a26 #dc8c3e'),
    kit: R('#30201a #4a3022 #66432c #825838 #9c7048 #b48a5c'),
    sand: R('#5a4630 #7a6244 #9a7e58 #b89a6e #d0b688 #e4cea4'),
    silver: R('#0e0e12 #1a1a20 #2a2a32 #3e3e48 #5a5a64 #7c7c84'),
    ember: R('#120c10 #1e141a #2c1e24 #3e2a30 #523a3e #6a4c4c'),
    stoat: R('#22140c #3a2214 #56341e #70482a #8c5e38 #a8784a'),
    ermine: R('#7a7c84 #9c9ea4 #bcbec0 #d8d8d6 #eceae4 #f8f6f0'),
    marten: R('#140c08 #24160e #362216 #4a3020 #5e402a #745236'),
    blood: R('#140808 #260e0e #3c1414 #561c18 #70261e #8c3426'),
    bib: R('#6a5420 #8a6e2a #a88a38 #c6a84c #dcc46a #ecdc94'),
  };
  const B = DBX.grow;
  const FOX = { L: 10.5, Hb: 3.8, leg: 7.6, legw: 2, head: 3.9, up: 2.8, snout: 5.8, snoutH: 1.6, ears: 'point', tail: 'bushy', fur: C.fox, muzzle: P.furWhite, tip: P.furWhite, hoof: P.furDark[1], eye: P.gold[3], shag: .24 };
  const own = ramp => ramp.map(c => c.slice()), bib = ramp => (s, g) => s.ball(g.cx + g.L * .62, g.cy + g.Hb * .45, g.L * .26, g.Hb * .7, 3, ramp, { d: .14 });
  const STOAT = { L: 10, Hb: 2.3, leg: 5, legw: 2, head: 2.8, up: 1.6, snout: 2.4, snoutH: 1.5, ears: 'leaf', tail: 'long', fur: C.stoat, belly: P.cloth, tip: own(C.stoat), tailTip: P.furDark, shag: .2 };
  const LINES = {
    fox: [
      ['fox_kit', 'Fox Kit', B(FOX, .66, { head: 3.6, snout: 3, snoutH: 1.6, leg: 5.4, legw: 2, Hb: 3.2, fur: C.kit, muzzle: P.cloth, tip: C.kit, shag: .42 })],
      ['fox', 'Red Fox', { ...FOX }],
      ['sand_fox', 'Sand Fox', B(FOX, .92, { fur: C.sand, muzzle: P.cloth, tip: P.furDark, hoof: C.sand[1], shag: .16 })],
      ['silver_fox', 'Silver Fox', B(FOX, 1.18, { fur: C.silver, mane: P.furGrey, muzzle: P.furGrey, tip: P.furWhite, hoof: P.ink, eye: P.gold[4], shag: .4 })],
      ['foxfire_vixen', 'Foxfire Vixen', B(FOX, 1.32, { fur: C.ember, mane: P.soul, tip: P.soul, hoof: P.ink, eye: P.soul[5], glow: 200, shag: .34 })],
    ],
    stoat: [
      ['stoat_kit', 'Stoat Kit', B(STOAT, .68, { head: 2.6, leg: 4.2, Hb: 2.2, shag: .38, tailTip: null })],
      ['stoat', 'Stoat', { ...STOAT }],
      ['ermine', 'Ermine', { ...STOAT, fur: C.ermine, belly: null, tip: own(C.ermine), eye: P.ink }],
      ['pine_marten', 'Pine Marten', B(STOAT, 1.3, { fur: C.marten, belly: null, tip: C.marten, tailTip: null, tail: 'bushy', ears: 'round', leg: 5.8, Hb: 3, shag: .34, extra: bib(C.bib) })],
      ['bloodneck_marten', 'Bloodneck Marten', B(STOAT, 1.55, { fur: C.blood, belly: null, tip: own(C.blood), tailTip: P.ink, mane: P.red, eye: P.red[4], leg: 6.4, Hb: 3.4, shag: .44, extra: bib(P.furDark) })],
    ],
  };
  for (const list of Object.values(LINES)) for (const [id, name, o] of list) BEASTS[id] = { name, o };

  GAITS.bound = { off: [.5, 0, .5, 0], duty: .38, S: 2.4, H: .9 };

  const DROOP = { rabbit: { hw: 4.6, r: 3.5, fur: P.furTan, belly: P.cloth }, fowl: { hw: 4, r: 3.1, fur: P.furRust, belly: P.furBrown }, rat: { hw: 4.8, r: 2.9, fur: P.furDark, belly: P.furDark } };
  function limp(kind, sag = 3, flat = 0) {
    const D = DROOP[kind], s = new Spr(36, 34, 18, 8), cx = 18, top = 8, curve = t => top + D.r * .8 + sag * t * t, o = { n: .3, ns: 1, d: .14 };
    const dang = flat ? .3 : 1, end = t => [cx + t * D.hw, curve(t)], [bx, by] = end(-1.05), [hx, hy] = end(1.05);
    if (kind === 'rabbit') { s.thick(bx - 1, by + 1, bx - 3, by + 1 + 3 * dang, 2, D.fur, 3); s.rect(rnd(bx - 4), rnd(by + 2 + 3 * dang), 3, 1, D.fur[4]); }
    if (kind === 'fowl') for (let i = 0; i < 4; i++) s.thick(bx, by, bx - 4 + i * .6, by + 5 * dang + i * .6, 1, [P.furDark, P.green, P.blue, P.furDark][i], 2);
    if (kind === 'rat') for (let k = 0; k < 12; k++) s.set(bx - 1 - k * (flat ? .8 : .25), by + 1 + k * (flat ? .15 : .75), P.skinPale[k < 8 ? 3 : 2]);
    for (let i = 0; i <= 8; i++) { const t = -1 + i / 8 * 1.8, [x, y] = end(t); s.ball(x, y, D.r * (t < 0 ? 1.05 : .9 - t * .15), D.r * (t < 0 ? .95 : .85 - t * .1), 0, D.fur, o); }
    for (let x = 0; x < s.w; x++) for (let y = 0; y < s.h; y++) { const c = s.get(x, y), i = D.fur.indexOf(c); if (i >= 0 && y > curve((x - cx) / D.hw) + D.r * .35) s.set(x, y, D.belly[clamp(i + 1, 0, D.belly.length - 1)]); }
    const fx = hx + 1, fy = hy + 1.5 * dang;
    if (kind === 'rabbit') {
      s.oval(bx - 1, by - D.r * .6, 1.8, 1.8, () => P.cloth[5]);
      s.ball(fx, fy, 2.5, 2.3, 2, D.fur, { d: .14 }); s.ball(fx + 1.4, fy + 1.4, 1.5, 1.3, 3, D.fur, { d: .14 });
      for (let j = 0; j < 6; j++) { const x = fx - 1.5 - j * (flat ? .8 : .2), y = fy + 1 + j * (flat ? .2 : .8); s.set(x, y, D.fur[4]); s.set(x + 1, y, j > 0 && j < 5 ? P.skinPale[3] : D.fur[3]); }
      s.rect(rnd(fx), rnd(fy) - 1, 2, 1, D.fur[1]); s.set(rnd(fx) + 3, rnd(fy) + 2, P.skinPale[2]);
    }
    if (kind === 'fowl') {
      s.ball(fx, fy + 1, 2.2, 2.2, 2, D.fur, { d: .14 }); s.set(fx + 2, fy + 2, P.gold[4]); s.set(fx + 2, fy + 3, P.gold[2]); s.rect(rnd(fx) - 1, rnd(fy) - 1, 2, 1, P.red[3]); s.set(rnd(fx), rnd(fy) + 3, P.red[2]); s.set(rnd(fx) + 1, rnd(fy), P.ink);
      for (let i = 0; i < 4; i++) { const [x, y] = end(-.4 + i * .25); s.thick(x, y + 1, x - 1, y + 2 + 2 * dang, 1, P.furBrown, 2 + (i & 1)); }
      const [lx, ly] = end(.1); s.line(lx, ly + D.r, lx + 1, ly + D.r + 3 * dang, P.gold[3]); s.set(lx + 2, ly + D.r + 3 * dang, P.gold[2]);
    }
    if (kind === 'rat') {
      s.ball(fx, fy, 2.6, 2.2, 2, D.fur, { d: .14 }); s.ball(fx + 2.4, fy + 1.4, 1.6, 1.2, 3, D.fur, { d: .14 }); s.oval(fx - 2, fy - 2, 1.6, 1.6, () => P.skinPale[2]); s.set(fx + 4, fy + 2, P.skinPale[3]); s.rect(rnd(fx), rnd(fy) - 1, 2, 1, D.fur[1]);
    }
    if (flat) { const [x0] = end(-1), [x1] = end(1); for (let x = rnd(x0) - 1; x <= x1 + 2; x++) if (hash(x, 3, 9) > .4) s.set(x, rnd(curve(0) + D.r * 1.6 + 1), P.red[1 + (x & 1)]); }
    s.outline();
    return s;
  }
  const lying = kind => { const s = limp(kind, .8, 1); s.ay = bounds(s)[3] - 1; s.sh = { rx: 8, ry: 2, dx: 1, dy: 0, k: .6 }; s.pts = { feet: [] }; return s; };
  const HOLD = { quad: [-3, 0] };

  const kitRig = rigQuad;
  rigQuad = function (kind, p) {
    const s = kitRig(kind, p), o = BEASTS[kind].o;
    if (o.tailTip) {
      let x0 = s.w;
      for (let i = 0; i < s.c.length; i++) if (s.c[i] && s.c[i] !== P.ink) x0 = Math.min(x0, i % s.w);
      for (let y = 0; y < s.h; y++) for (let x = x0; x < x0 + 4; x++) { const c = s.get(x, y); if (c && c !== P.ink) { const n = o.tip.indexOf(c); s.set(x, y, o.tailTip[clamp(n < 0 ? 1 : n - 1, 0, o.tailTip.length - 1)]); } }
    }
    if (o.glow) for (let i = 0; i < s.c.length; i++) if (s.c[i] && o.tip.includes(s.c[i])) s.e[i] = o.glow;
    if (p && p.prey) { const m = s.pts.mouth; stamp(s, limp(p.prey, p.sag || 3), m[0] + HOLD.quad[0], m[1] + HOLD.quad[1]); s.pts.prey = [m[0], m[1] + 6]; }
    return s;
  };

  const trot = QUAD_ANIMS.trot.pose, walk = QUAD_ANIMS.walk.pose;
  const carrying = (base, prey) => (u, c) => ({ ...base(u, c), head: [1, -2 + sn(u * 2) * .4], snout: -8, ear: 0, prey });
  const lifted = (o, by, lift) => [[lift, -by], [lift, -by], [lift, -by], [lift, -by]];
  const ANIMS = {
    pounce: { label: 'Pouncing', dist: 40, n: 10, pose(u, c) {
      const o = c.o;
      return keyed(u, { feet: still4, by: 0, pitch: 0, head: [2, (o.up || 0) + 1], snout: 20, ear: -1, tail: { a: 0 } }, [
        [0, { by: 1.5, pitch: -1.2, feet: [[-2, 0], [2, 0], [-2, 0], [2, 0]], tail: { a: 10 } }],
        [.16, { by: -3, pitch: 3.5, feet: [[-4, 0], [3, 4], [-4, 0], [4, 5]], head: [1, -2], snout: -10, tail: { a: -20 } }, 'o'],
        [.42, { by: -o.leg * 1.4, pitch: .5, feet: lifted(o, -o.leg * 1.1, 2), head: [2, -1], snout: 10, tail: { a: -30 } }, 'o'],
        [.7, { by: -o.leg * .8, pitch: -4, feet: [[-1, o.leg], [5, o.leg * .3], [-1, o.leg], [6, o.leg * .3]], head: [3, (o.up || 0) + 2], snout: 50, tail: { a: -40 } }, 'i'],
        [.86, { by: 1.5, pitch: -2.5, feet: [[-3, 1], [4, 0], [-3, 1], [5, 0]], head: [3, (o.up || 0) + o.leg * .6], snout: 60, jaw: 1, tail: { a: -10 } }, 'i'],
        [1, { by: 1, pitch: -2, feet: [[-2, 0], [4, 0], [-2, 0], [5, 0]], head: [3, (o.up || 0) + o.leg * .6], snout: 60, jaw: 1 }],
      ]);
    } },
    dig: { label: 'Caching a kill', dur: 1.4, n: 8, hit: [.5, 'soil'], pose(u, c) { const o = c.o, k = Math.floor(u * 8) & 1; return { feet: [[0, 0], [3, o.leg * .5 * k], [0, 0], [4, o.leg * .5 * (1 - k)]], by: o.leg * .3, pitch: -2, head: [3, (o.up || 0) + o.leg * .6], snout: 46, tail: { a: 10, w: 1, ph: u * TAU } }; } },
    stand: { label: 'Standing up to look', dur: 2.4, n: 6, pose(u, c) { const o = c.o, k = u < .12 ? u / .12 : u > .88 ? (1 - u) / .12 : 1; return { pitch: o.L * .72 * k, by: -k, feet: [[2 * k, 0], [-1 * k, o.leg * 1.4 * k], [2 * k, 0], [-1 * k, o.leg * 1.3 * k]], head: [-2 * k, -2 * k], snout: -14 * k, ear: k > .9 ? 1 : 0, tail: { a: 35 * k } }; } },
    dance: { label: 'Dancing', dur: 1.8, n: 12, pose(u, c) {
      const o = c.o, j = Math.floor(u * 12), hop = [0, -3, -5, -2, 0, -4, -1, 0, -5, -3, -1, 0][j], tw = [0, 2, 4, -2, -4, 3, -3, 0, 4, -4, 2, 0][j];
      return { by: hop, pitch: tw, feet: hop < -1 ? lifted(o, hop, 1) : [[-1, 0], [1, 0], [-1, 0], [1, 0]], head: [j & 1 ? 1 : -1, -1 + (j % 3)], snout: tw * 8, ear: j & 1 ? -1 : 0, jaw: j % 4 === 1 ? 1 : 0, tail: { a: -30 + tw * 10, w: 2, ph: u * TAU * 3 } };
    } },
    crouch: { label: 'Crouched, watching', dur: 2.4, n: 4, pose(u, c) { const o = c.o; return { feet: [[-1, 0], [1, 0], [-1, 0], [1, 0]], by: o.leg * .32, pitch: -.6, head: [3, (o.up || 0) + 1.5], snout: 6, ear: 1, blink: u > .92 ? 1 : 0, tail: { a: 16, w: .6, ph: u * TAU * 2 } }; } },
    bound: { label: 'Bounding', gait: 'bound', n: 8, pose(u, c) { return { feet: gaitFeet(c.o, 'bound', u), by: -.5 - Math.abs(sn(u)) * 2.6, pitch: sn(u) * 2.6, stretch: cs(u) * 1.4, head: [1, -sn(u) * 1.2], ear: -1, tail: { a: -16 + sn(u) * 10, w: 1, ph: u * TAU } }; } },
  };
  for (const prey of Object.keys(DROOP)) {
    ANIMS['carry_' + prey] = { label: 'Carrying a kill', gait: 'trot', n: 8, pose: carrying(trot, prey) };
    ANIMS['tote_' + prey] = { label: 'Carrying a kill', gait: 'walk', n: 8, pose: carrying(walk, prey) };
    ANIMS['drag_' + prey] = { label: 'Dragging a kill', gait: 'bound', n: 8, pose(u, c) { return { ...ANIMS.bound.pose(u, c), by: -.3 - Math.abs(sn(u)) * 1.2, pitch: sn(u) * 1.4, head: [1, -1], snout: -4, prey, sag: 2 }; } },
    ANIMS['worry_' + prey] = { label: 'Shaking the kill', dur: .9, n: 8, pose(u) { const k = u > .1 && u < .9 ? (Math.floor(u * 10) & 1 ? 1 : -1) : 0; return { feet: [[-1, 0], [1, 0], [-1, 0], [1, 0]], by: .5, head: [k * 1.5, -1], snout: k * 14 - 4, ear: -1, prey, sag: 3 + k, tail: { a: -10, w: 2, ph: u * 20 } }; } };
    ANIMS['hold_' + prey] = { label: 'Holding a kill', dur: 2.4, n: 4, pose(u, c) { return { feet: still4, head: [1, -2], snout: -8, prey, tail: { w: c.lvl > 2 ? 1.2 : 0, ph: u * TAU } }; } };
  }
  const small = kind => { const A = LAIR.quad(kind); A.anims = { ...A.anims, ...ANIMS }; return A; };
  const kill = prey => LAIR.prop(lying(prey));
  return { C, LINES, limp, lying, small, kill, ANIMS };
})();
