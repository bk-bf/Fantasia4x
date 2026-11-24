'use strict';
const FBX_KEYS = ['hl', 'hr', 'hd'];
const SWUNG = { hr: [-2.6, 4.4], tool: 100, choke: 4, two: -5, ahead: .3 };
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
  lift(u, c) { const k = stooped(c); return lifted(u, { item: null, carry: c.hold, hl: HANG, hr: HANG, by: 0, hd: [0, 0], fl: [0, 0], fr: [0, 0], cu: 0, down: 1, reach: 0 }, { by: 6 * k, hl: [3, 10], hr: [-3, 10], hd: [0, k], reach: 1 }, carried(c.hold, 0, { ...c, face: 'f' }, 0)); },
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
  draw(u) { const a = sn(u); return { item: null, hl: [6, 4 + a * 3], hr: [-6, 5 - a * 3], by: .5 + Math.max(0, a) * .8, hd: [0, 0] }; },
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
  stagger(u) { return keyed(u, { hr: [3, 8.5], hl: [2, 8], tool: 178, bx: 0, hd: [0, 0], by: 0, fl: [0, 0], fr: [0, 0], blink: 0 }, [[0, {}], [.2, { hd: [0, -2], hr: [6, 5], hl: [7, 2], tool: 172, fr: [0, 3], by: -1, blink: 1 }, 'o'], [.45, { bx: -2, hr: [5, 6], hl: [6, 4], tool: 174, fr: [0, 0], fl: [0, 3], by: 0 }], [.7, { bx: 1, hd: [0, 1], hr: [3, 8.5], hl: [3, 8], tool: 178, fl: [0, 0], by: 1.5 }], [1, { bx: 0, by: 1 }]]); },
  fall(u) { if (u >= .7) return { lie: 1, blink: 1 }; return keyed(u, { item: null, hr: [-2, 8], hl: [2, 8], hd: [0, 0], by: 0, blink: 1 }, [[0, {}], [.22, { hd: [0, -2], hr: [-7, 2], hl: [7, 2], by: -1 }, 'o'], [.5, { hd: [0, 3], hr: [-4, 9], hl: [4, 9], by: 6 }, 'i'], [.7, { hd: [0, 4], hr: [-5, 9], hl: [5, 9], by: 8 }]]); },
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
