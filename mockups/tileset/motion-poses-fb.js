'use strict';
const FBX_KEYS = ['hl', 'hr', 'hd'];
const SWUNG = { hr: [-2.6, 4.4], tool: 100, choke: 4, two: -5, ahead: .3 };
const outward = c => c && c.face === 'b' ? 1 : -1;
const FB_POSES = {
  chop(u, c) {
    const x = c.lvl > 2 ? 1 : 0, up = { hr: [3, -4], tool: 52 - x * 5, choke: 12, two: -15, ahead: 0, by: -x, hd: [-1, 0] }, down = { hr: [-8.5, 6.5], tool: 178, choke: 2, two: -4, ahead: .9, by: 1 + x, hd: [0, 1] };
    return keyed(u, { hr: [-7, 5], tool: 118, choke: 3, two: -4, ahead: .3, by: 0, hd: [0, 0] }, [[0, {}], [.3, up, 'o'], [.42, { ...up, hr: [3, -4.5] }], [.49, SWUNG], [.55, down], [.63, { ...down, by: 1 }], [.78, { ...down, by: 1 }], [1, {}]]);
  },
  mine(u, c) {
    const x = c.lvl > 2 ? 1 : 0, up = { hr: [3, -4], tool: 52 - x * 5, choke: 12, two: -15, ahead: 0, by: -x, hd: [-1, 0] }, down = { hr: [-8.5, 6.5], tool: 178, choke: 2, two: -4, ahead: .9, by: 1 + x, hd: [0, 1] };
    return keyed(u, { hr: [-7, 5], tool: 118, choke: 3, two: -4, ahead: .3, by: 0, hd: [0, 0] }, [[0, {}], [.32, up, 'o'], [.4, { ...up, hr: [3, -4.5] }], [.46, SWUNG], [.52, down], [.6, { ...down, by: 1 }], [.74, { ...down, by: 1 }], [1, {}]]);
  },
  hoe(u, c) {
    const x = c.lvl > 2 ? 1 : 0, up = { hr: [-3, 3], tool: 66 - x * 6, choke: -4, two: -5, ahead: .3, by: -x }, down = { hr: [-8, 6.5], tool: 172, choke: -4, two: -5, ahead: .9, by: 2 + x, hd: [0, 1] };
    return keyed(u, { hr: [-7, 7], tool: 64, choke: -4, two: -5, ahead: 0, by: 0, hd: [0, 0] }, [[0, {}], [.3, up, 'o'], [.38, up], [.45, { hr: [-3, 6], tool: 110, ahead: .4 }], [.5, down], [.72, { ...down, hr: [-8, 6], by: 1.5 }], [1, {}]]);
  },
  hammer(u, c) {
    const x = c.lvl > 2 ? 1 : 0;
    return keyed(u, { hl: [5, 8], hr: [1, 5], tool: 60, ahead: 0, by: 0, hd: [0, 1] }, [[0, {}],
      [.3, { hr: [3, -6], tool: 15 - x * 10, by: -x, hd: [0, 0] }, 'o'], [.38, { hr: [3, -6.5], tool: 12 - x * 10, by: -x, hd: [0, 0] }],
      [.5, { hr: [-3, 5], tool: 180, ahead: .8, by: 1 + x, hd: [0, 1] }, 'i'], [.58, { hr: [-3, 4], tool: 180, ahead: .7, by: 1 }], [1, {}]]);
  },
  stir(u, c) { return { item: 'ladle', hl: [4, 8], hr: [-4 + cs(u) * 2, 9 + sn(u) * 1], tool: 180 + sn(u) * 14, by: 1, hd: [cs(u) > .6 ? 1 : 0, 1], blink: c.lvl > 2 && u > .9 ? 1 : 0 }; },
  gather(u) { return { item: null, by: 5, hl: [4 + sn(u), 10 - Math.max(0, sn(u)) * 2], hr: [-4 + sn(u), 10 - Math.max(0, -sn(u)) * 2], hd: [0, 2] }; },
  lift(u, c) { const k = stooped(c); return lifted(u, { item: null, carry: c.hold, hl: HANG, hr: HANG, by: 0, hd: [0, 0], fl: [0, 0], fr: [0, 0], cu: 0, down: 1, reach: 0 }, { by: 6 * k + deeper(c), hl: [3, 10], hr: [-3, 10], hd: [0, k], reach: 1 }, carried(c.hold, 0, { ...c, face: 'f' }, 0)); },
  drop(u, c) { return FB_POSES.lift(1 - u, c); },
  held(u, c) { return carried(c.hold, u, { ...c, face: 'f' }, 0); },
  tuck(u, c) { return tucked(u, { ...c, face: 'f' }, 1); },
  tuckStand(u, c) { return tucked(u, { ...c, face: 'f' }, 0); },
  guardTwo(u, c) { return FB_READY.two(u, c); },
  guardBow(u, c) { return FB_READY.bow(u, c); },
  ready(u, c) { return fbReadied('one', u, c); },
  readyTwo(u, c) { return fbReadied('two', u, c); },
  readyBow(u, c) { return fbReadied('bow', u, c); },
  stow(u, c) { return fbReadied('one', 1 - u, c); },
  stowTwo(u, c) { return fbReadied('two', 1 - u, c); },
  stowBow(u, c) { return fbReadied('bow', 1 - u, c); },
  draw(u, c) { const a = sn(u), away = c && c.face === 'b'; return { item: null, hl: away ? [-1, 7 + a * 2] : [3, 6 + a * 2], hr: away ? [1, 8 - a * 2] : [-3, 8 - a * 2], by: .5 + Math.max(0, a) * .8, hd: [0, 0] }; },
  drink(u) { return keyed(u, { covers: 1, item: 'cup', hr: [-2, 6], tool: 0, hd: [0, 0], hl: HANG }, [[0, {}], [.28, { hr: [-7, -2], tool: -10, hd: [0, -1] }], [.66, { hr: [-7, -2.5], tool: -30, hd: [0, -1] }], [.82, { hr: [-2, 6] }], [1, {}]]); },
  eat(u) {
    const chew = u > .42 && u < .95 ? (Math.floor(u * 16) & 1) : 0;
    return keyed(u, { covers: 1, item: 'bread', by: 4, hr: [-2, 6], tool: 90, hd: [0, 0], hl: [3, 7], mouth: 0 }, [[0, {}], [.26, { hr: [-7, -1], hd: [0, 1], mouth: 1 }], [.38, { hr: [-7, -1], hd: [0, 1], mouth: 1 }], [.52, { hr: [-2, 6], hd: [0, chew], mouth: 0 }], [.95, { hd: [0, chew] }], [1, {}]]);
  },
  guard(u, c) { return FB_READY.one(u, c); },
  attack(u, c) {
    const x = c.lvl > 2 ? 1 : 0;
    return keyed(u, { ...FB_READY.one(0, c), ahead: 0, hd: [0, 0] }, [[0, {}],
      [.3, { hr: [4, -5], tool: 20 - x * 8, by: x ? 0 : 1, hd: [-1, 0] }, 'o'], [.36, { hr: [4, -5.5], tool: 18 - x * 8 }],
      [.48, { hr: [2, 7], tool: 172, ahead: .5, by: 2 + x, hd: [0, 1], fr: [0, 1] }, 'i'], [.62, { hr: [2, 8], tool: 165, ahead: .4, by: 2 }], [1, {}]]);
  },
  thrust(u, c) {
    const x = c.lvl > 2 ? 1 : 0;
    return keyed(u, { hl: [5, 7], hr: [1, 4], tool: 180, ahead: 1, by: 1, hd: [0, 0] }, [[0, {}],
      [.3, { hr: [2, 1], by: -x }, 'o'], [.45, { hr: [0, 8], by: 2 + x, hd: [0, 1] }, 'i'], [.62, { hr: [0, 8], by: 2, hd: [0, 1] }], [1, {}]]);
  },
  block(u, c) { return keyed(u, { ...FB_READY.one(0, c), bx: 0 }, [[0, {}], [.3, { hl: [6, 5], by: 1.5 }], [.48, { hl: [6, 5], by: 1.5 }], [.56, { hl: [5, 6], by: 0, hd: [0, -1] }, 'o'], [.8, { hl: [6, 5], by: 1, hd: [0, 0] }], [1, {}]]); },
  shoot(u, c) {
    const tr = c.lvl > 2 && u > .6 && u < .75 ? (Math.floor(u * 40) & 1) * .5 : 0, aimed = { hl: [5, 8], bow: 1, cant: 54, yaw: 60 };
    return keyed(u, { hl: [3, 8], hr: [-3, 8], bow: 0, cant: 54, yaw: 60, hd: [0, 0] }, [[0, {}], [.22, aimed], [.3, aimed], [.6, { ...aimed, bow: 5, by: tr }, 'o'], [.75, { ...aimed, bow: 5, by: tr }], [.76, { ...aimed, bow: 0, hr: [-6, 5] }, 'l'], [.9, { hl: [4, 8], hr: [-5, 6] }], [1, {}]]);
  },
  hit(u) { return keyed(u, { hr: [3, 8.5], hl: [2, 8], tool: 176, bx: 0, hd: [0, 0], blink: 0, by: 0 }, [[0, {}], [.25, { bx: -1, hd: [0, -2], hr: [6, 5], hl: [6, 3], tool: 170, blink: 1, by: -1 }, 'o'], [.55, { bx: 0, hd: [0, -1], hr: [5, 6], hl: [5, 5], tool: 172, blink: 1, by: 0 }], [1, {}]]); },
  stagger(u, c) { const o = outward(c); return keyed(u, { hr: [-2 * o, 8], hl: [2 * o, 8], bx: 0, hd: [0, 0], by: 0, fl: [0, 0], fr: [0, 0], blink: 0 }, [[0, {}], [.2, { hd: [0, -1], hr: [-4 * o, 3], hl: [4 * o, 3], by: .5, blink: 1 }, 'o'], [.45, { bx: -1, hr: [-4 * o, 5], hl: [4 * o, 5], by: 1 }], [.7, { bx: 1, hd: [0, 1], hr: [-3 * o, 8], hl: [3 * o, 8], by: 1 }], [1, { by: .5 }]]); },
  fall(u, c) {
    if (u >= FELL.lands) return { lie: 1, blink: 1, loose: 1 };
    const held = u < FELL.lets ? {} : { item: null };
    const o = outward(c);
    return { ...keyed(u, { hr: [-2 * o, 8], hl: [2 * o, 8], hd: [0, 0], by: 0, bx: 0, blink: 1, tip: 0, loose: 0 }, [[0, {}], [FELL.lets, { hd: [0, -1], hr: [-6 * o, 3], hl: [6 * o, 3], by: 1 }, 'o'], [FELL.gives, { hd: [0, 0], hr: [-5 * o, 5], hl: [5 * o, 5], by: 3, tip: FELL.leans, loose: .5 }], [FELL.lands, { hr: [-4 * o, 6], hl: [4 * o, 6], by: 3, tip: FELL.flat, loose: 1 }, 'i']]), ...held };
  },
};
const FB_READY = {
  one: (u, c) => ({ hr: [c.tool === 'spear' ? 1 : -1, 5 + sn(u) * .5], tool: c.tool === 'spear' ? 8 : 40, hl: [5, 7], by: 1 + sn(u) * .4, fl: [0, 0], fr: [0, 0] }),
  two: (u, c) => c.tool === 'spear' || c.tool === 'staff' ? { hr: [-1.5, 8 + sn(u) * .4], tool: -68, two: 12, palm: { hl: 'under', hr: 'under' }, by: 1 + sn(u) * .4, fl: [0, 0], fr: [0, 0] } : { hl: [5, 8], hr: [-5, 8 + sn(u) * .4], tool: 35, by: 1 + sn(u) * .4, fl: [0, 0], fr: [0, 0] },
  bow: (u, c) => ({ hl: [5, 7 + sn(u) * .4], hr: [-4, 4.5], bow: 1, arrow: 1, cant: 58, yaw: 60, by: .6 + sn(u) * .3, fl: [0, 0], fr: [0, 0] }),
};
const FB_HALFWAY = { one: { hr: [-1, 6], by: .6, stow: .55 }, two: { hr: [-1, 6.5], hl: [3, 6], by: .6, stow: .55 }, bow: { hl: [2, 6.5], hr: [-2, 7], by: .6, stow: .55 } };
function fbReadied(family, u, c) {
  const end = FB_READY[family](0, c);
  if (u >= DRAWN.lands) return FB_READY[family](DRAWN.stance, c);
  const { two, palm, ...lands } = end;
  return keyed(u / DRAWN.lands, { ...FB_POSES.tuckStand(0, c), br: 0, ...(end.tool === undefined ? {} : { tool: end.tool }) }, [[0, {}], [DRAWN.turns, FB_HALFWAY[family], 'l'], [1, { ...lands, crook: [], fore: [], stow: 0 }, 'l']]);
}
function fbPose(name, u, c) {
  const back = c.face === 'b', p = { ...FB_POSES[name](u, c), face: c.face };
  if (back) { for (const k of FBX_KEYS) if (p[k]) p[k] = [-p[k][0], p[k][1]]; if (p.bx) p.bx = -p.bx; }
  return p;
}
const UPRIGHT = [1.5, 2, 19];
const HANGS = { R: [.5, 1.5, -8.5], L: [-.5, 1.5, -8.5] };
const QUIVER = { in: [-.5, -.5, 2.5], out: [-.5, -.5, 5], lies: [0, -3, -19], swung: { at: [3.2, 1.5, 2.5], elbow: [1, .6, .2], lies: [14, -2, -5] }, behind: { in: [-.5, -1, 2], out: [-.5, -1, 4.5], lies: [0, -3, -19] }, past: [1.8, 6, -1.5], round: [2.5, 3.5, -2], holds: 14, elbow: [.5, .2, 1] };
const reached = (c, at) => c.face === 'b' ? { R: QUIVER.behind[at], shaft: QUIVER.behind.lies } : { R: QUIVER[at], elbowR: QUIVER.elbow, shaft: QUIVER.lies };
const BOW_LEADS = 4;
const SHOT_ASIDE = 50;
const SHOT_OUT = { arm: 9.5, pull: 6.5, drops: -2.5, ahead: 3.5 };
const POLES3 = ['spear', 'staff', 'hoe'], HAFTS3 = ['axe', 'pick'];
const spun = (v, deg) => { const c = Math.cos(deg * D2R), n = Math.sin(deg * D2R); return [v[0] * c - v[1] * n, v[0] * n + v[1] * c, v[2]]; };
const turned3 = (pose, deg) => { const out = { ...pose, turn: deg }; for (const k of ['R', 'L', 'aim', 'shaft', 'elbow']) if (pose[k]) out[k] = spun(pose[k], deg); return out; };
const POLE_TURN = 35;
const THRUST_AT = { f: 4.5, b: -4.5 };
const THRUST_SIDE = { rest: turned3({ R: [-4, 7.5, -3.5], aim: [17, 10, 4], both: 1 }, POLE_TURN), back: -3, out: 2.5 };
const pushed = (pose, by) => { const a = unit3(pose.aim); return { R: pose.R.map((v, i) => v + a[i] * by) }; };
const GUARD3 = {
  one: c => c.face === 'b' ? { R: [4, 5, -3.5], aim: c.tool === 'spear' ? [4, 11, 16] : [7, 12, 14], L: [-4, 6, -3] } : { R: [1, 6, -3.5], aim: c.tool === 'spear' ? [4, 11, 16] : [7, 12, 14], L: [0, 8.5, -3] },
  two: c => c.face !== 's' ? (POLES3.includes(c.tool) ? { R: [6, 6, -1.5], aim: [12, 0, 7], both: 1, mid: 1 } : { R: [7, 3, 0], aim: [9, 0, 17], both: 1, mid: 1 }) : POLES3.includes(c.tool) ? turned3({ R: [-4, 7.5, -3.5], aim: [17, 10, 4], both: 1 }, POLE_TURN) : { R: [-6.5, 5, -2], aim: [3, 8, 17], both: 1 },
  bow: c => ({ L: [1.2, 8.4, -3], R: c && c.face !== 'b' ? [-2.5, 7, -3.5] : [.5, 3, -7], aim: [0, 16, -4], shaft: [0, 16, -3], laid: c && c.face !== 'b' ? 1 : 0, out: QUIVER.holds, bow: 0, arrow: 0, pull: 0, cant: -28, lead: BOW_LEADS, mid: 0 }),
};
const BOW_DIPS = 1.2, BOW_REELS = [0, 2, -1.5];
function carried3(c, swing) {
  const s = swing || 0;
  if (!c.tool) return null;
  if (c.tool === 'bow') return { L: [-.5, 5 - s * 1.5, -7.5 + Math.abs(s) * .5 - Math.max(0, s) * BOW_DIPS], aim: [0, 14, -14], cant: -35, bow: 0, arrow: 0, pull: 0, lead: 0 };
  if (c.tool === 'torch') return { R: [1, 7.5, -3], aim: [6, 8, 18] };
  if (POLES3.includes(c.tool)) return { R: [1.5, 3 + s * 1.5, -8.2 + Math.abs(s) * .5], aim: [2, 11, 16] };
  return { R: [.5, 1.5 + s * 2.5, -8.5 + Math.abs(s)], aim: c.face === 's' ? [3, 20, -2] : UPRIGHT };
}
const drawn3 = family => (u, c) => {
  const from = { ...carried3(c, 0) }, to = GUARD3[family](c), lands = DRAWN.lands;
  if (u >= lands) return to;
  if (family === 'bow') return keyed(u / lands, { ...from, R: HANGS.R, out: 0 }, [[0, {}], [.13, { R: QUIVER.round }, 'l'], [.24, { L: [-.5, 4.5, -7.5], ...reached(c, 'in'), cant: -30, lead: BOW_LEADS }], [.64, { L: [-1, 6, -7], ...reached(c, 'out'), out: QUIVER.holds, cant: -38, lead: BOW_LEADS }, 'i'], ...(c.face === 'b' ? [] : [[.72, { L: [-.5, 6.8, -6], R: QUIVER.swung.at, elbowR: QUIVER.swung.elbow, shaft: QUIVER.swung.lies, out: QUIVER.holds, cant: -36, lead: BOW_LEADS }, 'l']]), [.8, { L: [0, 7.5, -5], R: QUIVER.past, shaft: [6, 10, -10], out: QUIVER.holds, cant: -34, lead: BOW_LEADS }, 'l'], [1, to, 'l']]);
  const { both, ...open } = to, held = both && gripsOf(c.tool, c.face) ? gripsOf(c.tool, c.face)[0] : 0, across = both && c.face !== 's';
  return keyed(u / lands, { L: HANGS.L, ...from, grip: 0, turn: 0, mid: 0 }, [[0, {}], ...(both && POLES3.includes(c.tool) && c.face === 's' ? [[.14, { R: [1.5, 4.5, -6], grip: held * .1, aim: [5, 11, 13.5] }, 'l'], [.4, { R: [1.5, 8, -3.5], grip: held * .3, aim: [4, 9, 17] }, 'l'], [.68, { ...turned3({ R: [1, 7.8, -3], aim: [12, 5, 14] }, POLE_TURN * .6), grip: held * .7 }, 'l'], [.92, { ...turned3({ R: [-2.5, 7.8, -3.8], aim: [16, 8, 6] }, POLE_TURN * .9), grip: held * .9 }, 'l']] : [[.4, { R: c.face === 's' ? [1, 6.5, -6.5] : [3.5, 6.5, -4.5], grip: held / 2, ...(from.aim && to.aim ? { aim: from.aim.map((v, i) => (v + to.aim[i]) / 2) } : null), ...(across ? { L: [2, 5, -6], mid: 0 } : null) }, 'l']]), [1, { L: across ? to.R.map((v, i) => v + unit3(to.aim)[i] * (gripsOf(c.tool, c.face) ? gripsOf(c.tool, c.face)[1] : -BARE_GRIP)) : HANGS.L, ...open, grip: held }, 'l']]);
};
const BARE_GRIP = 6;
const OVERHEAD = {
  s: { rest: { R: [0, 7.8, -3], aim: [0, 15, -9] }, up: { R: [0, 7.8, 2], aim: [0, 5, 16] }, over: { R: [0, 8, 1], aim: [0, 13, 9] }, bites: { R: [0, 8, -3.6], aim: [0, 15, -10] } },
  f: { rest: { R: [4, 6, -6], aim: [7, 1, -13] }, up: { R: [4.5, 5, 0], aim: [7, 0, 13] }, over: { R: [4.5, 6, -3], aim: [16, 0, 0] }, bites: { R: [4, 6, -6.5], aim: [6, 1, -13] } },
  b: { rest: { R: [4, 6, -6], aim: [7, 1, -13] }, up: { R: [4.5, 5, 0], aim: [7, 0, 13] }, over: { R: [4.5, 6, -3], aim: [16, 0, 0] }, bites: { R: [4, 6, -6.5], aim: [6, 1, -13] } },
};
const overhead = (u, face, at) => { const O = OVERHEAD[face]; return keyed(u, { ...O.rest, both: 1, mid: 1, clears: 1 }, [[0, {}], [at[0], O.up, 'o'], [at[1], O.up], [at[2], O.over, 'i'], [at[3], O.bites, 'l'], [at[4], O.bites], [1, {}]]); };
const ARMS3 = {
  idle: (u, c) => carried3(c, 0), look: (u, c) => carried3(c, 0), sit: () => null,
  walk: (u, c) => carried3(c, -sn(u)), run: (u, c) => carried3(c, -sn(u) * 1.4), stalk: (u, c) => carried3(c, 0), tuck: (u, c) => carried3(c, -sn(u)), tuckStand: (u, c) => carried3(c, 0),
  chop: (u, c) => overhead(u, c.face, [.3, .42, .49, .55, .78]),
  mine: (u, c) => overhead(u, c.face, [.32, .4, .46, .52, .74]),
  hoe: (u, c) => overhead(u, c.face, [.3, .36, .44, .52, .72]),
  hammer: (u, c) => { const struck = c.face === 's' ? [{ R: [4, 7, -3.5], aim: [6, 13, -13] }, { R: [4, 7, -3], aim: [6, 14, -12] }] : [{ R: [1.5, 5, -5.5], aim: [14, 0, -8] }, { R: [1.5, 5, -5], aim: [14, 0, -7] }]; return keyed(u, { R: [2, 6.5, -5], aim: [8, 13.5, 9], L: [1, 5, -5] }, [[0, {}], [.3, { R: [5, 7.4, 1], aim: [6, 11, 15] }, 'o'], [.38, { R: [5, 7.4, 1], aim: [6, 10, 15] }], [.52, struck[0], 'i'], [.6, struck[1]], [1, {}]]); },
  stir: (u, c) => c.face === 'b' ? { mid: 1, R: [cs(u) * .6, 6 + sn(u) * 1.5, -4], aim: [cs(u) * .3, 3 + sn(u) * 3, -19], L: [-6.5, 1.5, -8] } : { R: [-3 + cs(u) * 1.5, 6 + sn(u) * 1.5, -4], aim: [cs(u) * 3, 3 + sn(u) * 3, -19], L: [1, 4, -6] },
  drink: (u, c) => c.face === 'b' ? keyed(u, { mid: 1, R: [0, 5, -4], aim: [0, 0, 20], L: [-6, 1.5, -8.5], grip: -2 }, [[0, {}], [.28, { R: [0, 6.5, 4], aim: [0, -4, 19], grip: -1 }], [.66, { R: [0, 6.5, 4.5], aim: [0, -12, 16], grip: -1 }], [.82, {}], [1, {}]]) : keyed(u, { R: [-1, 5, -4], aim: [0, 0, 20], L: HANGS.L, grip: -2 }, [[0, {}], [.28, { R: [-4.5, 6.5, 4], aim: [0, -4, 19], grip: -1 }], [.66, { R: [-4.5, 6.5, 4.5], aim: [0, -12, 16], grip: -1 }], [.82, {}], [1, {}]]),
  eat: (u, c) => c.face === 'b' ? keyed(u, { mid: 1, R: [0, 5, -5], aim: [0, 20, 0], L: [-6.5, 1.5, -7], grip: -1 }, [[0, {}], [.26, { R: [0, 6.5, 4], aim: [0, 18, 4] }], [.38, { R: [0, 6.5, 4], aim: [0, 18, 4] }], [.52, {}], [1, {}]]) : keyed(u, { R: [-1, 5, -5], aim: [0, 20, 0], L: [1, 4, -6], grip: -1 }, [[0, {}], [.26, { R: [-4.5, 6.5, 4], aim: [-6, 18, 4] }], [.38, { R: [-4.5, 6.5, 4], aim: [-6, 18, 4] }], [.52, {}], [1, {}]]),
  guard: (u, c) => GUARD3.one(c), guardTwo: (u, c) => ({ ...GUARD3.two(c), slung: 1 }), guardBow: (u, c) => GUARD3.bow(c),
  ready: drawn3('one'), readyTwo: (u, c) => ({ ...drawn3('two')(u, c), slung: 1 }), readyBow: drawn3('bow'),
  stow: (u, c) => drawn3('one')(1 - u, c), stowTwo: (u, c) => ({ ...drawn3('two')(1 - u, c), slung: 1 }), stowBow: (u, c) => drawn3('bow')(1 - u, c),
  attack: (u, c) => keyed(u, GUARD3.one(c), [[0, {}], [.14, { R: [2, 8, -1.5], aim: [8, 13, 13] }], [.3, { R: [3, 8, 1.5], aim: [7, 10, 15] }, 'o'], [.36, { R: [3, 8, 1.5], aim: [7, 8, 16] }], [.52, { R: [3, 8, -1.5], aim: [10, 12, -6] }, 'l'], [.64, { R: [3, 7, -3.5], aim: [9, 12, -8] }], [1, {}]]),
  thrust: (u, c) => c.face !== 's' ? keyed(u, { mid: 1, R: [6, THRUST_AT[c.face], -3], aim: [16, 0, -5], L: [-4.5, 4, -4] }, [[0, {}], [.3, { R: [5, THRUST_AT[c.face], -2.6] }, 'o'], [.45, { R: [10, THRUST_AT[c.face], -4.2] }, 'i'], [.62, { R: [10, THRUST_AT[c.face], -4.2] }], [1, {}]]) : keyed(u, THRUST_SIDE.rest, [[0, {}], [.3, pushed(THRUST_SIDE.rest, THRUST_SIDE.back), 'o'], [.45, pushed(THRUST_SIDE.rest, THRUST_SIDE.out), 'i'], [.62, pushed(THRUST_SIDE.rest, THRUST_SIDE.out)], [1, {}]]),
  block: (u, c) => keyed(u, GUARD3.one(c), [[0, {}], [.3, { L: [-1, 8.5, -1.5] }], [.48, { L: [-1, 8.5, -1.5] }], [.56, { L: [-1, 7.5, -1.5] }, 'o'], [.8, { L: [-1, 8.5, -1.5] }], [1, {}]]),
  shoot: (u, c) => { const side = c.face !== 's', low = { ...GUARD3.bow(c), turn: 0 }, aside = v => side ? spun(v, SHOT_ASIDE) : v, placed = v => side ? [aside(v)[0], aside(v)[1] + SHOT_OUT.ahead, v[2]] : v, up = { L: placed([-1, side ? SHOT_OUT.arm : 6.9, side ? -3.5 : -4.5]), mid: 1, turn: side ? SHOT_ASIDE : 0, aim: aside([0, 19, side ? SHOT_OUT.drops : -6.5]), cant: -36, lead: BOW_LEADS + .5 }, nocks = placed([-1, side ? SHOT_OUT.arm + 1.9 : 8.8, side ? -1 : -2.5]), drawn = { ...up, R: nocks, bow: 1, arrow: 1, pull: c.face === 's' ? 3 : SHOT_OUT.pull }; return keyed(u, low, [[0, {}], [.1, { R: placed([-.7, 7.5, -5]) }], [.2, { ...up, R: nocks, shaft: up.aim }, 'l'], [.24, { ...drawn, pull: c.face === 's' ? 2.5 : SHOT_OUT.pull - 2 }, 'l'], [.6, drawn, 'o'], [.75, drawn], [.76, { ...up, out: 0, R: placed([-1, 7, -.5]) }, 'l'], [.84, { ...reached(c, 'in'), out: 0 }], [.92, { ...reached(c, 'out') }, 'l'], [.96, { R: QUIVER.past, shaft: [6, 10, -10] }, 'l'], [1, {}]]); },
  fall: (u, c) => { const rest = u < FELL.lets ? carried3(c, 0) : null; return rest && rest.R ? { ...rest, R: [rest.R[0], rest.R[1], rest.R[2] + u / FELL.lets] } : rest; },
  hit: (u, c) => { const rest = carried3(c, 0), by = d => rest.R.map((v, i) => v + d[i]); return rest && rest.R ? keyed(u, rest, [[0, {}], [.25, { R: by([2, 0, 2]) }, 'o'], [.55, { R: by([1.5, 0, 1.5]) }], [1, {}]]) : rest; },
  stagger: (u, c) => { const rest = carried3(c, 0), by = d => rest.R.map((v, i) => v + d[i]); return rest && rest.R ? keyed(u, rest, [[0, {}], [.2, { R: by([2.5, -.5, 2.5]) }, 'o'], [.45, { R: by([2, 0, 1.5]) }], [.7, { R: by([0, 0, 1]) }], [1, { R: by([0, 0, .5]) }]]) : rest && c.tool === 'bow' ? keyed(u, rest, [[0, {}], [.25, { L: rest.L.map((v, i) => v + BOW_REELS[i]) }, 'o'], [.8, { L: rest.L.map((v, i) => v + BOW_REELS[i]) }], [1, {}]]) : rest; },
};
function posed(name, def, u, c) {
  const pose = c.face !== 's' && FB_POSES[name] ? fbPose(name, u, c) : def.pose(u, c), arms = !pose.lie && !pose.carry && ARMS3[name] ? ARMS3[name](u, c) : null;
  return arms ? { ...pose, ...arms } : pose;
}

