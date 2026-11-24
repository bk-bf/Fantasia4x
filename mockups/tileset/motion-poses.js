'use strict';
const TAU = Math.PI * 2;
const sn = u => Math.sin(u * TAU), cs = u => Math.cos(u * TAU);
const EASE = { i: t => t * t, o: t => 1 - (1 - t) * (1 - t), l: t => t, s: t => t * t * (3 - 2 * t) };
const tween = (a, b, t) => Array.isArray(a) && Array.isArray(b) ? a.map((v, i) => tween(v, b[i], t)) : typeof a === 'number' && typeof b === 'number' ? mix(a, b, t) : t < .5 ? a : b;
function keyed(u, base, ks) {
  let i = 0;
  while (i + 1 < ks.length && ks[i + 1][0] <= u) i++;
  const A = ks[i], B = ks[Math.min(ks.length - 1, i + 1)], span = B[0] - A[0], t = span > 0 ? EASE[B[2] || 's'](clamp((u - A[0]) / span, 0, 1)) : 0;
  const a = { ...base, ...A[1] }, b = { ...base, ...B[1] }, out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out[k] = a[k] === undefined ? b[k] : b[k] === undefined ? a[k] : tween(a[k], b[k], t);
  return out;
}
const stride = (ph, duty, S, H) => {
  ph -= Math.floor(ph);
  if (ph < duty) return [S / 2 - S * ph / duty, 0];
  const v = (ph - duty) / (1 - duty);
  return [-S / 2 + S * (v * v * (3 - 2 * v)), Math.sin(Math.PI * v) * H];
};
const HANG = [0, 10];
const CARRY = {
  axe: s => ({ hr: [3 + s * .5, 5], tool: -42 }), pick: s => ({ hr: [3 + s * .5, 5], tool: -42 }), hoe: s => ({ hr: [3 + s * .5, 5], tool: -38 }),
  spear: s => ({ hr: [4 + s, 5], tool: 6 }), staff: s => ({ hr: [4 + s, 5], tool: 6 }), torch: s => ({ hr: [5 + s * .5, 3], tool: 14 }),
  sword: s => ({ hr: [1 + s * 2, 9.5], tool: 118 }), club: s => ({ hr: [1 + s * 2, 9.5], tool: 112 }), hammer: s => ({ hr: [1 + s * 2, 9.5], tool: 112 }),
  bow: s => ({ hr: [2 + s * 2, 9], tool: 22 }),
};
const held = (c, s) => (CARRY[c.tool] ? CARRY[c.tool](s) : { hr: [s * 5.5, 10 - Math.abs(s) * 1.2] });
const flow = (c, u, k) => c.lvl > 2 ? { cape: k + sn(u * 2 + .18) * 1.6, hair: rnd(sn(u * 2 + .22) * 1.2) } : {};
const face = c => ({ face: c.face });
const GAIT = {
  light: { duty: .58, S: 10.5, H: 3, up: 2.6, by: .3, bob: .7 },
  bulky: { duty: .62, S: 8, H: 2.4, up: 2.2, by: .6, bob: .6 },
  heavy: { duty: .66, S: 6.6, H: 1.8, up: 2, by: .7, bob: .9, heave: .5, sway: .8 },
  shouldered: { duty: .62, S: 7.2, H: 2.2, up: 2.6, by: .7, bob: .7, sway: .8 },
};
for (const g of Object.values(GAIT)) g.dist = g.S / g.duty;
const HOLD = {
  hip: { gait: 'light', swing: 1, side: { hr: [3, 7], lean: 1 }, fb: { hr: [0, 7], crook: ['hr'], fore: ['hr'] } },
  chest: { gait: 'bulky', side: { hr: [6, 7], hl: [7, 6.5], lean: -1 }, fb: { hl: [2.6, 8], hr: [-2.6, 8], fore: ['hl', 'hr'] }, beside: 8 },
  low: { gait: 'heavy', sink: .9, side: { hr: [6.5, 7.5], hl: [7.5, 7], lean: -1.6 }, fb: { hl: [1, 9], hr: [-1, 9], fore: ['hl', 'hr'] }, beside: 9 },
  shoulder: { gait: 'shouldered', tilt: 1, free: 1, side: { hr: [3, -4], hl: [5, -3], lean: 1.4 }, fb: { hl: [-5.5, -4], wing: 1, lean: 1.5, hd: [1, 0] } },
  game: { gait: 'heavy', sink: .9, free: 1, side: { hr: [3, -4], hl: [5, -3], lean: 2.4, hd: [1, 1] }, fb: { hl: [-5.5, -4], wing: 1, lean: 1.5, hd: [1, 1] } },
  drape: { gait: 'heavy', sink: .4, free: 1, side: { hr: [5, 3.5], hl: [6, 4], lean: 1.8 }, fb: { hl: [4, 4], crook: ['hl'], fore: ['hl'] } },
};
const LIFT = { reaches: .4, grips: .5, lands: .9 };
const lifted = (u, base, crouch, end) => u >= LIFT.lands ? end : keyed(u / LIFT.lands, base, [[0, {}], [LIFT.reaches, crouch], [LIFT.grips, { ...crouch, down: 0 }], [1, { ...end, cu: 1, down: 0 }, 'o']]);
const BESIDE = { shoulder: 5.5, wrap: 1, reach: 4.5 };
const HOLDS = { hip: ['tote', 'toteStand'], chest: ['heft', 'heftStand'], low: ['lug', 'lugStand'], shoulder: ['haul', 'haulStand'], game: ['bear', 'bearStand'], drape: ['rescue', 'rescueStand'] };
const turned = (p, keys) => { for (const k of keys) if (p[k]) p[k] = [-p[k][0], p[k][1]]; return p; };
function carried(hold, u, c, go) {
  const h = HOLD[hold], g = GAIT[h.gait], a = sn(u), side = c.face === 's', push = c.lvl > 2 && go ? 1 : 0;
  const p = { face: c.face, carry: hold, item: null, ...(side ? h.side : h.fb), by: g.by + (h.sink || 0) + (go ? cs(u * 2) * g.bob : 0), br: !go && u > .35 && u < .8 ? 1 : 0 };
  if (side) { p.fr = go ? stride(u, g.duty, g.S, g.H) : [1.5, 0]; p.fl = go ? stride(u + .5, g.duty, g.S, g.H) : [-1.5, 0]; }
  else { p.fl = [0, go ? Math.max(0, a) * g.up : 0]; p.fr = [0, go ? Math.max(0, -a) * g.up : 0]; }
  if (h.beside && !side && c.wide) { const out = clamp(BESIDE.shoulder - c.wide / 2 + BESIDE.wrap, -BESIDE.reach, BESIDE.shoulder); p.hl = [out, h.beside]; p.hr = [-out, h.beside]; }
  if (h.swing) p.hl = side ? [go * a * 5, 10 - go * Math.abs(a) * 1.2] : [0, 9.2 + go * a * 1.6];
  if (h.free && !side) p.hr = [0, 9.2 - go * a * 1.6];
  if (h.tilt && push && side) p.tilt = sn(u * 2 + .1);
  if (go && g.heave && side) p.lean += cs(u * 2) * g.heave;
  if (go && g.sway && !side) p.lean = (p.lean || 0) + sn(u) * g.sway;
  if (hold === 'shoulder' && side) return { ...p, ...flow(c, u, 2) };
  if (push) Object.assign(p, flow(c, u, hold === 'hip' ? 2.2 : 1.2));
  if (c.face === 'b' && p.lean) p.lean = -p.lean;
  return c.face === 'b' ? turned(p, ['hl', 'hr', 'hd']) : p;
}
const BOW_TUCK = { side: { hl: [3, 7], bow: 0, arrow: 0, cant: 100, lean: 1 }, fb: { hl: [0, 7], crook: ['hl'], fore: ['hl'], bow: 0, arrow: 0, cant: 40, stow: 1 } };
const armed = (c, side) => c.tool === 'bow' ? BOW_TUCK[side ? 'side' : 'fb'] : side ? { hr: [3, 7], tool: 104, tuck: 1, lean: 1 } : { hr: [0, 7], crook: ['hr'], fore: ['hr'], tool: 172, stow: 1 };
function tucked(u, c, go) {
  const g = GAIT.light, a = sn(u), side = c.face === 's', free = c.tool === 'bow' ? 'hr' : 'hl';
  const p = { face: c.face, ...armed(c, side), by: g.by + (go ? cs(u * 2) * g.bob : 0), br: !go && u > .35 && u < .8 ? 1 : 0, [free]: side ? [go * a * 5, 10 - go * Math.abs(a) * 1.2] : [0, 9.2 + go * a * 1.6] };
  if (side) { p.fr = go ? stride(u, g.duty, g.S, g.H) : [1.5, 0]; p.fl = go ? stride(u + .5, g.duty, g.S, g.H) : [-1.5, 0]; }
  else { p.fl = [0, go ? Math.max(0, a) * g.up : 0]; p.fr = [0, go ? Math.max(0, -a) * g.up : 0]; }
  return c.lvl > 2 && go ? { ...p, ...flow(c, u, 2.2) } : p;
}
const READY = {
  one: (u, c) => ({ face: 's', hr: [5, 2 + sn(u) * .5], tool: 30, hl: [6, 3], fl: [-3, 0], fr: [3, 0], by: 1 + sn(u) * .4, lean: 1 }),
  two: (u, c) => c.tool === 'spear' || c.tool === 'staff' ? { face: 's', two: 9, hr: [1, 4 + sn(u) * .4], tool: 72, fl: [-3, 0], fr: [3, 0], by: 1 + sn(u) * .4, lean: 1 } : { face: 's', two: 6, hr: [4, 3.5 + sn(u) * .4], tool: 38, fl: [-3, 0], fr: [3, 0], by: 1 + sn(u) * .4, lean: 1 },
  bow: (u, c) => ({ face: 's', hl: [8, 2.5 + sn(u) * .4], hr: [5, 3 + sn(u) * .4], bow: 1, arrow: 1, cant: 0, twang: 0, fl: [-3, 0], fr: [3, 0], by: .6 + sn(u) * .3, lean: .5 }),
};
const DRAWN = { lands: .8, turns: .45, stance: .125 };
const HALFWAY = { one: { hr: [4, 4.5], tool: 70, lean: 1, by: .6 }, two: { hr: [4, 4.5], tool: 70, lean: 1, by: .6 }, bow: { hl: [6, 5], hr: [3, 7], cant: 50, lean: 1, by: .6 } };
const readied = family => (u, c) => u >= DRAWN.lands ? READY[family](DRAWN.stance, c) : keyed(u / DRAWN.lands, { ...tucked(0, c, 0), br: 0 }, [[0, {}], [DRAWN.turns, HALFWAY[family], 'l'], [1, { ...READY[family](0, c), tuck: 0 }, 'l']]);

const PAWN_ANIMS = {
  idle: { label: 'Standing', group: 'Idle life', dur: 2.8, n: 4, pose(u, c) {
    const p = { ...face(c), br: u > .3 && u < .8 ? 1 : 0, ...(c.face === 's' ? held(c, 0) : {}) };
    if (c.lvl > 2) { const g = Math.floor(c.t / 1.6 + c.seed * 3) % 7, bl = (c.t * .37 + c.seed) % 1; p.look = g === 2 ? -1 : g === 5 ? 1 : 0; p.blink = bl > .93 ? 1 : 0; p.hd = [p.look && c.face !== 's' ? p.look : 0, 0]; p.cape = sn(u) * .8; }
    return p;
  } },
  look: { label: 'Keeping watch', group: 'Idle life', dur: 4.4, n: 8, pose(u, c) {
    const k = u > .12 && u < .42 ? -1 : u > .56 && u < .86 ? 1 : 0;
    return { ...face(c), br: sn(u * 2) > 0 ? 1 : 0, look: k, hd: [k, 0], blink: c.lvl > 2 && (u > .47 && u < .51) ? 1 : 0, ...(c.face === 's' ? held(c, 0) : {}) };
  } },
  walk: { label: 'Walking', group: 'Movement', dist: 19, n: 8, pose(u, c) {
    if (c.face !== 's') { const a = sn(u); return { ...face(c), fl: [0, Math.max(0, a) * 3], fr: [0, Math.max(0, -a) * 3], by: .2 + cs(u * 2) * .6, bx: c.lvl > 2 ? a * .6 : 0, hl: [0, 9.2 + a * 1.6], hr: [0, 9.2 - a * 1.6], ...flow(c, u, 1) }; }
    const a = sn(u);
    return { face: 's', fr: stride(u, .58, 11, 3.2), fl: stride(u + .5, .58, 11, 3.2), by: .3 + cs(u * 2) * .7, lean: 1, hl: [a * 5.5, 10 - Math.abs(a) * 1.2], ...held(c, -a), ...flow(c, u, 2.5) };
  } },
  run: { label: 'Running', group: 'Movement', dist: 34, n: 8, pose(u, c) {
    if (c.face !== 's') { const a = sn(u); return { ...face(c), fl: [0, Math.max(0, a) * 5], fr: [0, Math.max(0, -a) * 5], by: -Math.abs(a) * 1.6 + .6, hl: [-1, 6 + a * 3], hr: [1, 6 - a * 3], ...flow(c, u, 2) }; }
    const a = sn(u);
    return { face: 's', fr: stride(u, .38, 13, 5), fl: stride(u + .5, .38, 13, 5), by: .8 - Math.abs(sn(u + .12)) * 2.4, lean: 3, hl: [1 + a * 5, 6 - a], hr: [1 - a * 5, 6 + a], item: c.tool, tool: 100 - a * 30, ...flow(c, u, 5.5) };
  } },
  panic: { label: 'Panicking', group: 'Movement', dist: 30, n: 8, pose(u, c) {
    const a = sn(u), b = sn(u * 2);
    if (c.face !== 's') return { ...face(c), fl: [0, Math.max(0, a) * 5], fr: [0, Math.max(0, -a) * 5], by: -Math.abs(a) * 1.4 + .5, hl: [-3, -8 + b], hr: [3, -8 - b], mouth: 1, item: null, ...flow(c, u, 2) };
    return { face: 's', fr: stride(u, .4, 12, 5), fl: stride(u + .5, .4, 12, 5), by: .6 - Math.abs(sn(u + .12)) * 2, lean: 1.5, hl: [2, -8 + b], hr: [4, -8 - b], mouth: 1, item: null, ...flow(c, u, 5) };
  } },
  stalk: { label: 'Stalking', group: 'Movement', dist: 9.5, n: 8, pose(u, c) {
    return { face: 's', fr: stride(u, .7, 6.5, 2), fl: stride(u + .5, .7, 6.5, 2), by: 2.4 + cs(u * 2) * .4, lean: 2.6, hd: [1, 0], hl: [6, 7], hr: [5, 7.5], tool: 62, ...flow(c, u, 1) };
  } },
  tote: { label: 'Light carry', group: 'Carrying', dist: GAIT.light.dist, n: 8, pose(u, c) { return carried('hip', u, c, 1); } },
  heft: { label: 'Bulky carry', group: 'Carrying', dist: GAIT.bulky.dist, n: 8, pose(u, c) { return carried('chest', u, c, 1); } },
  haul: { label: 'Hauling', group: 'Carrying', dist: GAIT.shouldered.dist, n: 8, pose(u, c) { return carried('shoulder', u, c, 1); } },
  lug: { label: 'Heavy carry, low in front', group: 'Carrying', dist: GAIT.heavy.dist, n: 8, pose(u, c) { return carried('low', u, c, 1); } },
  bear: { label: 'Carrying game', group: 'Carrying', dist: GAIT.heavy.dist, n: 8, pose(u, c) { return carried('game', u, c, 1); } },
  rescue: { label: 'Carrying the downed', group: 'Carrying', dist: GAIT.heavy.dist, n: 8, pose(u, c) { return carried('drape', u, c, 1); } },
  rescueStand: { label: 'Standing with the downed', group: 'Carrying', dur: 2.8, n: 4, pose(u, c) { return carried('drape', u, c, 0); } },
  toteStand: { label: 'Standing with a light load', group: 'Carrying', dur: 2.8, n: 4, pose(u, c) { return carried('hip', u, c, 0); } },
  heftStand: { label: 'Standing with a bulky load', group: 'Carrying', dur: 2.8, n: 4, pose(u, c) { return carried('chest', u, c, 0); } },
  haulStand: { label: 'Standing with a shouldered load', group: 'Carrying', dur: 2.8, n: 4, pose(u, c) { return carried('shoulder', u, c, 0); } },
  lugStand: { label: 'Standing with a low load', group: 'Carrying', dur: 2.2, n: 4, pose(u, c) { return carried('low', u, c, 0); } },
  bearStand: { label: 'Standing with game', group: 'Carrying', dur: 2.2, n: 4, pose(u, c) { return carried('game', u, c, 0); } },
  lift: { label: 'Picking up', group: 'Work', dur: 1.1, n: 7, once: 1, pose(u, c) {
    const crouch = { by: 5, lean: 4, hr: [8, 8], hl: [9, 8], hd: [2, 3], fl: [-3, 0], fr: [3, 0] }, end = carried(c.hold, 0, { ...c, face: 's' }, 0);
    return lifted(u, { face: 's', item: null, carry: c.hold, hr: HANG, hl: HANG, by: 0, lean: 0, hd: [0, 0], fl: [0, 0], fr: [0, 0], cu: 0, down: 1 }, crouch, end);
  } },
  drop: { label: 'Setting down', group: 'Work', dur: 1.1, n: 7, once: 1, pose(u, c) { return PAWN_ANIMS.lift.pose(1 - u, c); } },
  held: { label: 'Standing with the load', group: 'Carrying', dur: 2.8, n: 4, pose(u, c) { return carried(c.hold, u, c, 0); } },
  tuck: { label: 'Weapon under the arm', group: 'Combat', dist: GAIT.light.dist, n: 8, pose(u, c) { return tucked(u, c, 1); } },
  tuckStand: { label: 'Standing with the weapon under the arm', group: 'Combat', dur: 2.8, n: 4, pose(u, c) { return tucked(u, c, 0); } },
  guardTwo: { label: 'Ready stance · two hands', group: 'Combat', dur: 1.4, n: 4, pose: READY.two },
  guardBow: { label: 'Ready stance · bow', group: 'Combat', dur: 1.6, n: 4, pose: READY.bow },
  ready: { label: 'Drawing to ready', group: 'Combat', dur: .5, n: 5, once: 1, pose: readied('one') },
  readyTwo: { label: 'Drawing to ready · two hands', group: 'Combat', dur: .55, n: 5, once: 1, pose: readied('two') },
  readyBow: { label: 'Drawing to ready · bow', group: 'Combat', dur: .6, n: 5, once: 1, pose: readied('bow') },
  stow: { label: 'Stowing the weapon', group: 'Combat', dur: .5, n: 5, once: 1, pose(u, c) { return readied('one')(1 - u, c); } },
  stowTwo: { label: 'Stowing the weapon · two hands', group: 'Combat', dur: .55, n: 5, once: 1, pose(u, c) { return readied('two')(1 - u, c); } },
  stowBow: { label: 'Stowing the bow', group: 'Combat', dur: .6, n: 5, once: 1, pose(u, c) { return readied('bow')(1 - u, c); } },
  chop: { label: 'Woodcutting', group: 'Work', dur: 1.25, n: 10, hit: [.55, 'chips'], pose(u, c) {
    const x = c.lvl > 2 ? 1 : 0;
    return keyed(u, { face: 's', two: 6, hr: [5, 3], tool: 35, lean: 0, by: 0, bx: 0, fl: [-3, 0], fr: [3, 0], hd: [0, 0] }, [[0, {}], [.3, { hr: [-3, -6], tool: -78 - x * 14, lean: -1.5 - x, bx: -1, hd: [-x, -x] }, 'o'], [.42, { hr: [-3, -6.5], tool: -82 - x * 16, lean: -1.5 - x, bx: -1, hd: [-x, -x] }], [.55, { hr: [8, 1], tool: 82 + x * 8, lean: 2.5 + x, by: 1 + x, bx: 1, hd: [1, x] }, 'i'], [.63, { hr: [7, 1], tool: 75, lean: 2, by: 1, bx: 1 }], [.78, { hr: [8, 1.5], tool: 82, lean: 2.2, by: 1, bx: 1 }], [1, {}]]);
  } },
  mine: { label: 'Mining', group: 'Work', dur: 1.3, n: 10, hit: [.52, 'stone'], pose(u, c) {
    const x = c.lvl > 2 ? 1 : 0;
    return keyed(u, { face: 's', two: 6, hr: [5, 2], tool: 30, lean: 0, by: 0, bx: 0, fl: [-3, 0], fr: [3, 0], hd: [0, 0] }, [[0, {}], [.32, { hr: [-2, -8], tool: -75 - x * 15, lean: -1.5 - x, by: -x, hd: [0, -1] }, 'o'], [.4, { hr: [-2, -8.5], tool: -78 - x * 16, lean: -1.5 - x, by: -x, hd: [0, -1] }], [.52, { hr: [8, -1], tool: 75 + x * 6, lean: 2.5 + x, by: 1 + x, bx: 1, hd: [1, 0] }, 'i'], [.6, { hr: [7, -1], tool: 66, lean: 2, by: 1, bx: 1 }], [.74, { hr: [8, 0], tool: 75, lean: 2.2, by: 1, bx: 1 }], [1, {}]]);
  } },
  hoe: { label: 'Planting', group: 'Work', dur: 1.4, n: 10, hit: [.5, 'soil'], pose(u, c) {
    const x = c.lvl > 2 ? 1 : 0;
    return keyed(u, { face: 's', two: 7, hr: [4, 3], tool: 40, lean: 0, by: 0, fl: [-3, 0], fr: [3, 0], hd: [0, 0] }, [[0, {}], [.3, { hr: [0, -7], tool: -20 - x * 14, lean: -1 - x, by: -x }, 'o'], [.38, { hr: [0, -7], tool: -22 - x * 14, lean: -1 - x, by: -x }], [.5, { hr: [8, 5], tool: 118, lean: 3 + x, by: 1.5 + x, hd: [1, 1] }, 'i'], [.72, { hr: [5, 6], tool: 110, lean: 2, by: 1.5, hd: [1, 1] }], [1, {}]]);
  } },
  hammer: { label: 'Metalworking', group: 'Work', dur: .95, n: 8, hit: [.5, 'spark'], pose(u, c) {
    const x = c.lvl > 2 ? 1 : 0;
    return keyed(u, { face: 's', hr: [5, 0], tool: 40, hl: [7, 5], lean: .5, by: 0, hd: [1, 0], fl: [-2, 0], fr: [3, 0] }, [[0, {}], [.3, { hr: [1, -7], tool: -25 - x * 20, lean: -.5 - x, hd: [0, -x] }, 'o'], [.38, { hr: [1, -7.5], tool: -28 - x * 20, lean: -.5 - x, hd: [0, -x] }], [.5, { hr: [8, 3], tool: 100, lean: 1.5 + x, by: .5 + x, hd: [1, 1] }, 'i'], [.58, { hr: [8, 1], tool: 80, lean: 1.5, by: .5 }], [1, {}]]);
  } },
  stir: { label: 'Cooking', group: 'Work', dur: 1.6, n: 8, pose(u, c) {
    return { face: 's', item: 'ladle', hr: [7 + cs(u) * 2, 5.5 + sn(u) * 1.2], tool: 152 + sn(u) * 12, hl: [5, 7], lean: 1.6, by: 1, hd: [1, 1], fl: [-2, 0], fr: [3, 0], blink: c.lvl > 2 && u > .9 ? 1 : 0 };
  } },
  gather: { label: 'Foraging', group: 'Work', dur: 1.4, n: 6, pose(u, c) {
    return { face: 's', item: null, by: 5, lean: 3.4, fl: [-4, 0], fr: [3, 0], hr: [7 + sn(u) * 1.5, 8 - Math.max(0, sn(u)) * 2], hl: [8 - sn(u) * 1.5, 8 - Math.max(0, -sn(u)) * 2], hd: [2, 2] };
  } },
  draw: { label: 'Drawing water', group: 'Needs', dur: 1.5, n: 8, pose(u, c) {
    const a = sn(u);
    return { face: 's', item: null, hr: [6, 1 + a * 4], hl: [6, 3 - a * 4], lean: 1, by: .5 + Math.max(0, a) * .8, fl: [-3, 0], fr: [3, 0], hd: [0, 0] };
  } },
  drink: { label: 'Drinking', group: 'Needs', dur: 2.6, n: 8, pose(u, c) {
    return keyed(u, { face: 's', item: 'cup', hr: [5, 4], tool: 0, hd: [0, 0], lean: 0, hl: HANG }, [[0, {}], [.28, { hr: [6, -3], tool: -35, hd: [-1, -1], lean: -.6 }], [.66, { hr: [6, -3.4], tool: -55, hd: [-1, -1], lean: -1 }], [.82, { hr: [5, 4] }], [1, {}]]);
  } },
  eat: { label: 'Eating', group: 'Needs', dur: 2.4, n: 8, pose(u, c) {
    const chew = u > .42 && u < .95 ? (Math.floor(u * 16) & 1) : 0;
    return keyed(u, { face: 's', item: 'bread', by: 4, fl: [5, 0], fr: [6, 0], hr: [5, 5], tool: 90, hd: [0, 0], hl: [4, 6], mouth: 0 }, [[0, {}], [.26, { hr: [6, -3], hd: [0, 1], mouth: 1 }], [.38, { hr: [6, -3], hd: [0, 1], mouth: 1 }], [.52, { hr: [5, 5], hd: [0, chew], mouth: 0 }], [.95, { hd: [0, chew] }], [1, {}]]);
  } },
  sit: { label: 'Sitting', group: 'Idle life', dur: 3, n: 4, pose(u, c) {
    return { face: 's', item: null, by: 4, fl: [5, 0], fr: [6, 0], hr: [5, 5.5], hl: [4, 6], br: u > .4 && u < .85 ? 1 : 0, blink: c.lvl > 2 && u > .94 ? 1 : 0 };
  } },
  warm: { label: 'Warming hands', group: 'Idle life', dur: 2.2, n: 6, pose(u, c) {
    return { face: 's', item: null, by: 4, fl: [5, 0], fr: [6, 0], hr: [8, 2 + sn(u) * .8], hl: [8, 3 - sn(u) * .8], lean: 1.4, hd: [1, 0] };
  } },
  tired: { label: 'Tired', group: 'Needs', dur: 3.2, n: 8, pose(u, c) {
    return keyed(u, { face: 'f', item: null, hl: HANG, hr: HANG, hd: [0, 0], by: 0, mouth: 0, blink: 0 }, [[0, {}], [.2, { hl: [-2, 2], hr: [2, 2] }], [.4, { hl: [-3, -9], hr: [3, -9], hd: [0, -1], by: -1, mouth: 1, blink: 1 }], [.66, { hl: [-4, -8], hr: [4, -8], hd: [0, -1], by: -1, mouth: 1, blink: 1 }], [.85, { hd: [0, 1] }], [1, {}]]);
  } },
  cry: { label: 'Crying', group: 'Needs', dur: 1.2, n: 6, pose(u, c) {
    const b = Math.floor(u * 6) & 1;
    return { face: 'f', item: null, hd: [0, 2], hl: [5, -2 - b * .5], hr: [-5, -2 - b * .5], by: 1 + b * .6, blink: 1 };
  } },
  talk: { label: 'Talking', group: 'Social', dur: 2.6, n: 8, pose(u, c) {
    const m = Math.floor(u * 10) & 1;
    return keyed(u, { face: 's', item: null, hr: [3, 8], hl: HANG, hd: [0, 0], mouth: m, lean: .5 }, [[0, {}], [.18, { hr: [7, 1] }], [.34, { hr: [6, 3], hd: [0, 1] }], [.5, { hr: [7, 0], hl: [5, 3] }], [.72, { hr: [4, 7], hd: [0, 0] }], [1, {}]]);
  } },
  listen: { label: 'Listening', group: 'Social', dur: 2.6, n: 8, pose(u, c) {
    return keyed(u, { face: 's', item: null, hr: [3, 8.5], hl: [2, 9], hd: [0, 0], blink: 0, br: 0 }, [[0, {}], [.3, { hd: [0, 1] }], [.4, { hd: [0, 0], br: 1 }], [.6, { hd: [0, 1], blink: c.lvl > 2 ? 1 : 0 }], [.7, { hd: [0, 0] }], [1, {}]]);
  } },
  guard: { label: 'Ready stance', group: 'Combat', dur: 1.4, n: 4, pose(u, c) {
    return { face: 's', hr: [5, 2 + sn(u) * .5], tool: c.tool === 'spear' ? 72 : 30, hl: [6, 3], fl: [-3, 0], fr: [3, 0], by: 1 + sn(u) * .4, lean: 1 };
  } },
  attack: { label: 'Striking', group: 'Combat', dur: .85, n: 8, hit: [.48, 'blow'], pose(u, c) {
    const x = c.lvl > 2 ? 1 : 0;
    return keyed(u, { face: 's', hr: [5, 2], tool: 30, hl: [6, 3], lean: 1, by: 1, bx: 0, fl: [-3, 0], fr: [3, 0], hd: [0, 0] }, [[0, {}], [.3, { hr: [-3, -7], tool: -60 - x * 25, lean: -1.5 - x, bx: -1 - x, hd: [-x, 0] }, 'o'], [.36, { hr: [-3, -7], tool: -64 - x * 25, lean: -1.5 - x, bx: -1 - x }], [.48, { hr: [9, 0], tool: 95, lean: 3 + x, bx: 2 + x, fr: [6, 0], hd: [1, 0] }, 'i'], [.62, { hr: [7, 5], tool: 140 + x * 12, lean: 3, bx: 2, fr: [6, 0] }], [1, {}]]);
  } },
  thrust: { label: 'Spear thrust', group: 'Combat', dur: .8, n: 7, hit: [.45, 'blow'], pose(u, c) {
    const x = c.lvl > 2 ? 1 : 0;
    return keyed(u, { face: 's', two: 9, hr: [1, 4], tool: 78, lean: 1, by: 1, bx: 0, fl: [-3, 0], fr: [3, 0] }, [[0, {}], [.3, { hr: [-4 - x, 4], tool: 82, lean: -1 - x, bx: -1 - x }, 'o'], [.45, { hr: [5, 3], tool: 88, lean: 3 + x, bx: 2 + x, fr: [7, 0] }, 'i'], [.62, { hr: [5, 3], tool: 88, lean: 3, bx: 2, fr: [7, 0] }], [1, {}]]);
  } },
  block: { label: 'Blocking', group: 'Combat', dur: .85, n: 6, pose(u, c) {
    return keyed(u, { face: 's', hl: [6, 3], hr: [3, 5], tool: 30, lean: 1, by: 1, bx: 0, fl: [-3, 0], fr: [3, 0] }, [[0, {}], [.3, { hl: [8, 0], lean: 1.5, by: 1.5 }], [.48, { hl: [8, 0], lean: 1.5, by: 1.5 }], [.56, { hl: [6, 0], lean: -1.5, bx: -2, by: 2 }, 'o'], [.8, { hl: [8, 1], lean: 1, bx: 0 }], [1, {}]]);
  } },
  shoot: { label: 'Loosing an arrow', group: 'Combat', dur: 2.2, n: 10, hit: [.76, 'arrow'], pose(u, c) {
    const tr = c.lvl > 2 && u > .6 && u < .75 ? (Math.floor(u * 40) & 1) * .5 : 0;
    return keyed(u, { face: 's', hl: [6, 6], hr: [4, 7], bow: 0, arrow: 0, twang: 0, lean: 0, hd: [0, 0], fl: [-3, 0], fr: [3, 0] }, [[0, {}], [.22, { hl: [9, 0], hr: [7, 0], bow: 1, arrow: 1 }], [.3, { hl: [9, 0], hr: [7, 0], bow: 1, arrow: 1 }], [.6, { hl: [9, 0], hr: [-2, tr], bow: 9, arrow: 1, lean: -.6 }, 'o'], [.75, { hl: [9, 0], hr: [-2, tr], bow: 9, arrow: 1, lean: -.6 }], [.76, { hl: [9, 0], hr: [-4, 1], bow: 0, arrow: 0, twang: 1, lean: -.6 }, 'l'], [.8, { hl: [9, 0], hr: [-4, 1], bow: 0, twang: 0 }], [.9, { hl: [9, 0], hr: [-3, 2] }], [1, {}]]);
  } },
  hit: { label: 'Taking a blow', group: 'Combat', dur: .42, n: 4, once: 1, pose(u, c) {
    return keyed(u, { face: 's', hr: [3, 7], hl: [3, 8], lean: 0, bx: 0, hd: [0, 0], blink: 0, by: 0 }, [[0, {}], [.25, { lean: -3, bx: -2, hd: [-1, -1], hr: [-2, 5], hl: [5, 4], blink: 1, by: 1 }, 'o'], [.55, { lean: -2.4, bx: -2, hd: [-1, 0], hr: [-1, 6], hl: [4, 5], blink: 1, by: 1 }], [1, {}]]);
  } },
  stagger: { label: 'Staggering', group: 'Combat', dur: .9, n: 6, once: 1, pose(u, c) {
    return keyed(u, { face: 's', hr: [2, 8], hl: [3, 8], lean: 0, bx: 0, hd: [0, 0], by: 0, fl: [0, 0], fr: [0, 0], blink: 0 }, [[0, {}], [.2, { lean: -3, bx: -2, hd: [-1, -1], hr: [-3, 3], hl: [6, 2], fr: [-3, 2], blink: 1 }, 'o'], [.45, { lean: -2, bx: -4, hr: [-2, 5], hl: [5, 4], fr: [-5, 0], fl: [-3, 2], by: 1 }], [.7, { lean: 2, bx: -4, hd: [1, 1], hr: [4, 8], hl: [5, 8], fr: [-5, 0], fl: [-6, 0], by: 1.5 }], [1, { lean: 1, bx: -4, fr: [-5, 0], fl: [-6, 0], by: 1 }]]);
  } },
  fall: { label: 'Collapsing', group: 'Combat', dur: 1, n: 7, once: 1, pose(u, c) {
    if (u >= .7) return { lie: 1, blink: 1, drop: 0 };
    return keyed(u, { face: 's', item: null, hr: [2, 8], hl: [3, 8], lean: 0, bx: 0, hd: [0, 0], by: 0, fl: [0, 0], fr: [0, 0], blink: 1 }, [[0, {}], [.22, { lean: -3, bx: -2, hd: [-1, -1], hr: [-3, 3], hl: [6, 2], by: 1 }, 'o'], [.5, { lean: 3, bx: -1, hd: [2, 3], hr: [4, 9], hl: [5, 9], by: 6, fl: [-4, 0], fr: [3, 0] }, 'i'], [.7, { lean: 5, bx: 0, hd: [3, 4], hr: [6, 9], hl: [7, 9], by: 7, fl: [-5, 0], fr: [2, 0] }]]);
  } },
  down: { label: 'Collapsed', group: 'Combat', dur: 3, n: 1, pose() { return { lie: 1, blink: 1 }; } },
  sleep: { label: 'Sleeping', group: 'Needs', dur: 3.4, n: 4, pose(u) { return { lie: 1, blink: 1, br: u > .35 && u < .8 ? 1 : 0, rest: 1 }; } },
  out: { label: 'Unconscious', group: 'Needs', dur: 5.6, n: 4, pose(u) { return { lie: 1, blink: 1, out: 1, br: u > .5 && u < .75 ? 1 : 0 }; } },
};

const GAITS = {
  walk: { off: [.5, .75, 0, .25], duty: .62, S: 1, H: .28 },
  trot: { off: [.5, 0, 0, .5], duty: .46, S: 1.35, H: .4 },
  run: { off: [0, .42, .1, .52], duty: .3, S: 2.1, H: .5 },
  stalk: { off: [.5, .75, 0, .25], duty: .72, S: .7, H: .2 },
};
const gaitDist = (kind, g) => { const o = BEASTS[kind].o, G = GAITS[g]; return o.leg * G.S / G.duty; };
const gaitFeet = (o, g, u) => { const G = GAITS[g]; return G.off.map(f => stride(u + f, G.duty, o.leg * G.S, o.leg * G.H)); };
const still4 = [[0, 0], [0, 0], [0, 0], [0, 0]];
const life = (c, p) => { if (c.lvl > 2) { const e = (c.t * .23 + c.seed * 1.7) % 1, b = (c.t * .31 + c.seed) % 1; if (e > .92) p.ear = p.ear ? 0 : -1; if (b > .94) p.blink = 1; } return p; };
const lying = (o, u, dead) => ({ by: o.leg - 1, feet: [[o.leg * .9, 1], [o.leg * 1.1, 1], [o.leg * .8, 0], [o.leg * 1.2, 0]], head: [2, (o.up || 0) + o.leg * .2 + (dead ? 3 : 0)], snout: dead ? 20 : 8, blink: 1, ear: dead ? -1 : 0, tail: { a: 25 }, low: 1 });

const QUAD_ANIMS = {
  idle: { label: 'Standing', group: 'Creatures', dur: 3, n: 4, pose(u, c) { return life(c, { by: u > .4 && u < .8 ? -.6 : 0, feet: still4, tail: { w: c.lvl > 2 ? 1.4 : 0, ph: u * TAU } }); } },
  walk: { label: 'Walk', group: 'Creatures', gait: 'walk', n: 8, pose(u, c) { return life(c, { feet: gaitFeet(c.o, 'walk', u), by: sn(u * 2) * .5, head: [0, sn(u * 2 + .2) * .9], tail: { w: 1.2, ph: u * TAU } }); } },
  trot: { label: 'Trot', group: 'Creatures', gait: 'trot', n: 8, pose(u, c) { return life(c, { feet: gaitFeet(c.o, 'trot', u), by: .5 - Math.abs(sn(u)) * 1.7, head: [1, -1 + sn(u * 2 + .2) * .7], tail: { a: -12, w: 1.6, ph: u * TAU * 2 } }); } },
  run: { label: 'Run', group: 'Creatures', gait: 'run', n: 8, pose(u, c) { return { feet: gaitFeet(c.o, 'run', u), by: -1 - sn(u * 2 + .1) * 1.6, pitch: sn(u - .08) * 2.4, stretch: cs(u - .3) * 1.6, head: [2, 1 - sn(u - .08) * 1.2], ear: -1, tail: { a: -28 + sn(u) * 8, w: 1, ph: u * TAU } }; } },
  stalk: { label: 'Stalking low', group: 'Creatures', gait: 'stalk', n: 8, pose(u, c) { return { feet: gaitFeet(c.o, 'stalk', u), by: c.o.leg * .28 + sn(u * 2) * .3, head: [3, (c.o.up || 0) + 2], snout: 8, ear: -1, tail: { a: 12, w: .4, ph: u * TAU } }; } },
  graze: { label: 'Grazing', group: 'Creatures', dur: 2.6, n: 8, pose(u, c) { const o = c.o, d = (o.up || 0) + o.leg + o.Hb * .5 - o.head * .5; return life(c, { feet: [[0, 0], [1, 0], [0, 0], [-1, 0]], head: [1 + sn(u * 3) * .8, d + sn(u * 6) * .5], snout: 62, jaw: Math.floor(u * 12) % 3 === 0 ? 1 : 0, tail: { w: c.lvl > 2 ? 1.5 : 0, ph: u * TAU * 2 } }); } },
  alert: { label: 'Startled', group: 'Creatures', dur: 1.6, n: 6, pose(u, c) { const o = c.o, d = (o.up || 0) + o.leg + o.Hb * .5 - o.head * .5, x = c.lvl > 2 ? 1 : 0; return keyed(u, { feet: still4, head: [1, d], snout: 62, by: 0, ear: 0, tail: { a: 0 } }, [[0, {}], [.14, { head: [-1, -3 - x], snout: -8, by: -1 - x * 2, ear: 1, tail: { a: -40 } }, 'o'], [.24, { head: [-1, -3], snout: -6, by: 0, ear: 1, tail: { a: -40 } }], [1, { head: [-1, -3], snout: -6, ear: 1, tail: { a: -40 } }]]); } },
  watch: { label: 'Head up', group: 'Creatures', dur: 2.4, n: 4, pose(u, c) { return life(c, { feet: still4, head: [-1, -3], snout: -6, ear: 1, tail: { a: -30, w: 1, ph: u * TAU * 3 } }); } },
  sniff: { label: 'Scenting', group: 'Creatures', dur: 2.2, n: 8, pose(u, c) { const o = c.o; return life(c, { feet: still4, head: [3 + sn(u * 2) * 1.6, (o.up || 0) + o.leg * .75 + sn(u * 4) * .6], snout: 38, tail: { a: 6, w: 1, ph: u * TAU } }); } },
  howl: { label: 'Howling', group: 'Creatures', dur: 3.2, n: 8, pose(u, c) { return keyed(u, { feet: [[2, 0], [0, 0], [2, 0], [0, 0]], head: [0, 0], snout: 0, jaw: 0, pitch: 0, tail: { a: 0 } }, [[0, {}], [.2, { head: [-2, -5], snout: -55, pitch: 1.2, tail: { a: 14 } }], [.28, { head: [-2, -6], snout: -62, jaw: 1, pitch: 1.4, tail: { a: 14 } }], [.8, { head: [-2, -6], snout: -66, jaw: 1, pitch: 1.4, tail: { a: 14 } }], [1, {}]]); } },
  sit: { label: 'Sitting', group: 'Creatures', dur: 3, n: 4, pose(u, c) { const o = c.o; return life(c, { pitch: o.leg * .42, by: o.leg * .2, feet: [[o.leg * .8, 0], [0, 0], [o.leg * .7, 0], [0, 0]], head: [-2, -1 - (u > .5 ? .6 : 0)], tail: { a: 40, w: c.lvl > 2 ? 2 : 0, ph: u * TAU * 2 } }); } },
  rest: { label: 'Lying down', group: 'Creatures', dur: 3.4, n: 4, pose(u, c) { const p = lying(c.o, u); p.by += u > .4 && u < .8 ? -.6 : 0; p.blink = 0; return life(c, p); } },
  bite: { label: 'Lunging bite', group: 'Creatures', dur: .7, n: 7, hit: [.45, 'blow'], pose(u, c) { const o = c.o, x = c.lvl > 2 ? 1 : 0; return keyed(u, { feet: still4, bx: 0, by: 0, head: [0, 1], snout: 0, jaw: 0, ear: -1, pitch: 0, stretch: 0, tail: { a: -10 } }, [[0, {}], [.28, { bx: -2 - x, by: 1.5 + x, pitch: -1, head: [-1, 2], feet: [[2, 0], [2, 0], [2, 0], [2, 0]] }, 'o'], [.45, { bx: 5, by: -1, pitch: 1.5, stretch: 2, head: [3, -1], snout: -10, jaw: 1, feet: [[-5, 0], [3, 3], [-5, 0], [4, 4]] }, 'i'], [.58, { bx: 5, by: 0, stretch: 1.5, head: [3, 1], snout: 6, jaw: 0, feet: [[-5, 0], [3, 0], [-5, 0], [4, 0]] }], [1, {}]]); } },
  hit: { label: 'Taking a blow', group: 'Creatures', dur: .45, n: 4, once: 1, pose(u, c) { return keyed(u, { feet: still4, bx: 0, by: 0, head: [0, 0], snout: 0, ear: 0, pitch: 0, blink: 0 }, [[0, {}], [.3, { bx: -3, by: 1, head: [-2, 2], snout: 14, ear: -1, pitch: -1.5, blink: 1, feet: [[3, 0], [3, 0], [3, 0], [3, 0]] }, 'o'], [1, {}]]); } },
  fall: { label: 'Falling', group: 'Creatures', dur: .9, n: 6, once: 1, pose(u, c) { const o = c.o, L = lying(o, 0, 1); return keyed(u, { feet: still4, bx: 0, by: 0, head: [0, 0], snout: 0, ear: -1, pitch: 0, blink: 1, tail: { a: 0 } }, [[0, {}], [.25, { bx: -2, by: 1, head: [-2, -2], snout: -20, pitch: 2 }, 'o'], [.55, { by: o.leg * .55, pitch: -2, head: [1, o.leg * .5], snout: 20, feet: [[o.leg * .5, 0], [o.leg * .6, 0], [o.leg * .4, 0], [o.leg * .7, 0]] }, 'i'], [.8, L, 'i'], [1, L]]); } },
  down: { label: 'Dead', group: 'Creatures', dur: 3, n: 1, pose(u, c) { return lying(c.o, 0, 1); } },
  shake: { label: 'Shaking off rain', group: 'Creatures', dur: 1.1, n: 8, hit: [.2, 'drops'], pose(u, c) { const k = u > .15 && u < .85 ? (Math.floor(u * 16) & 1 ? 1 : -1) : 0; return { feet: [[-1, 0], [1, 0], [-1, 0], [1, 0]], bx: k, by: .6, head: [k * 1.5, 2], snout: k * 16, ear: k < 0 ? -1 : 0, tail: { a: -10, w: 3 * Math.abs(k), ph: u * 40 } }; } },
  cud: { label: 'Chewing', group: 'Creatures', dur: 2.8, n: 8, pose(u, c) { return life(c, { feet: still4, jaw: Math.floor(u * 10) & 1, head: [0, sn(u * 5) * .4], tail: { w: 3, ph: u > .6 ? u * TAU * 4 : 0 } }); } },
};
const FB_ANIMS = {
  idle: (u, c) => ({ feet: still4, by: u > .4 && u < .8 ? -.6 : 0, blink: c.lvl > 2 && (c.t * .31 + c.seed) % 1 > .94 ? 1 : 0, tail: { w: 1.5, ph: u * TAU } }),
  walk: (u, c) => ({ feet: gaitFeet(c.o, 'walk', u), by: sn(u * 2) * .5, head: [0, sn(u * 2 + .2) * .8], tail: { w: 2, ph: u * TAU } }),
  trot: (u, c) => ({ feet: gaitFeet(c.o, 'trot', u), by: .4 - Math.abs(sn(u)) * 1.5, head: [0, -Math.abs(sn(u))], tail: { w: 2.5, ph: u * TAU * 2 } }),
  run: (u, c) => ({ feet: gaitFeet(c.o, 'run', u), by: -1 - sn(u * 2 + .1) * 1.6, head: [0, -1 + sn(u - .08)], ear: -1, tail: { w: 2, ph: u * TAU } }),
  stalk: (u, c) => ({ feet: gaitFeet(c.o, 'stalk', u), by: c.o.leg * .28 + sn(u * 2) * .3, head: [0, 2], ear: -1, tail: { w: .5, ph: u * TAU } }),
};

const FOWL_ANIMS = {
  idle: { label: 'Fowl', group: 'Creatures', dur: 2, n: 6, pose(u, c) { const j = Math.floor(u * 6); return { head: [j === 2 ? -1 : j === 4 ? 1 : 0, j === 2 ? 1 : 0] }; } },
  walk: { label: 'Fowl walking', group: 'Creatures', dist: 9, n: 8, pose(u, c) { const a = stride(u, .6, 4, 2), b = stride(u + .5, .6, 4, 2), k = (u * 2) % 1; return { feet: [a, b], head: [2 - k * 3, k < .15 ? 1 : 0], by: Math.abs(sn(u)) * -.6, tail: sn(u * 2) * .6 }; } },
  peck: { label: 'Pecking', group: 'Creatures', dur: 1.5, n: 8, pose(u, c) { const d = (u > .12 && u < .28) || (u > .42 && u < .58) ? 1 : 0, x = c.lvl > 2 && d ? 1 : 0; return { head: [d ? 3.5 : 0, d ? 10 + x : u > .7 ? -1 : 0], tail: d ? 2 + x : 0, by: d ? .6 : 0 }; } },
  flap: { label: 'Fowl startled', group: 'Creatures', dist: 20, n: 6, pose(u, c) { return { feet: [stride(u, .4, 6, 3), stride(u + .5, .4, 6, 3)], by: -1 - Math.abs(sn(u)) * 3, head: [2, -1], tail: 3 * Math.abs(sn(u * 2)) }; } },
};
const RABBIT_ANIMS = {
  idle: { label: 'Cottontail', group: 'Creatures', dur: 2.4, n: 6, pose(u, c) { return { ear: c.lvl > 2 && u > .7 && u < .8 ? 1 : 0, blink: c.lvl > 2 && u > .45 && u < .5 ? 1 : 0 }; } },
  up: { label: 'Sitting up', group: 'Creatures', dur: 2.6, n: 6, pose(u, c) { const k = u < .15 ? u / .15 : u > .85 ? (1 - u) / .15 : 1; return { up: 4.5 * k, ear: k > .9 ? 1 : 0 }; } },
  hop: { label: 'Hopping', group: 'Creatures', dist: 22, n: 8, pose(u, c) { const air = u > .2 && u < .8, k = air ? Math.sin((u - .2) / .6 * Math.PI) : 0; return { by: -k * 5, stretch: air ? 1.5 + k * 2.5 : u >= .8 ? -.6 : 0, ear: air ? -1 : 0 }; } },
  bolt: { label: 'Bolting', group: 'Creatures', dist: 34, n: 6, pose(u, c) { const air = u > .12 && u < .88, k = air ? Math.sin((u - .12) / .76 * Math.PI) : 0; return { by: -k * 6, stretch: air ? 2.5 + k * 2.5 : 0, ear: -1 }; } },
};
