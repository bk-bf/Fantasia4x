'use strict';
const FBX_KEYS = ['hl', 'hr', 'hd'];
const FB_POSES = {
  chop(u, c) {
    const x = c.lvl > 2 ? 1 : 0;
    return keyed(u, { hl: [5, 8], hr: [-5, 8], tool: 35, by: 0, hd: [0, 0], uf: 0, nb: 0 }, [[0, {}],
      [.3, { hl: [3, -9.5], hr: [-3, -9.5], tool: -20 - x * 10, by: -x, hd: [0, -1], uf: 1 }, 'o'], [.42, { hl: [3, -10], hr: [-3, -10], tool: -24 - x * 10, by: -x, hd: [0, -1], uf: 1 }],
      [.55, { hl: [6, 9], hr: [-4, 10], tool: 172, by: 1 + x, hd: [0, 1], nb: 1 }, 'i'], [.63, { hl: [6, 9], hr: [-4, 10], tool: 165, by: 1, hd: [0, 1], nb: 1 }], [.78, { hl: [6, 8.5], hr: [-4, 9.5], tool: 170, by: 1, nb: 1 }], [1, {}]]);
  },
  mine(u, c) {
    const x = c.lvl > 2 ? 1 : 0;
    return keyed(u, { hl: [5, 8], hr: [-5, 8], tool: 30, by: 0, hd: [0, 0], uf: 0, nb: 0 }, [[0, {}],
      [.32, { hl: [3, -9.5], hr: [-3, -9.5], tool: -15 - x * 12, by: -x, hd: [0, -1], uf: 1 }, 'o'], [.4, { hl: [3, -10], hr: [-3, -10], tool: -18 - x * 12, by: -x, hd: [0, -1], uf: 1 }],
      [.52, { hl: [6, 8], hr: [-4, 9], tool: 165, by: 1 + x, hd: [0, 1], nb: 1 }, 'i'], [.6, { hl: [6, 8], hr: [-4, 9], tool: 158, by: 1, nb: 1 }], [.74, { hl: [6, 8], hr: [-4, 9], tool: 165, by: 1, nb: 1 }], [1, {}]]);
  },
  hoe(u, c) {
    const x = c.lvl > 2 ? 1 : 0;
    return keyed(u, { hl: [5, 6], hr: [-5, 8], tool: 20, by: 0, hd: [0, 0], uf: 0, nb: 0 }, [[0, {}],
      [.3, { hl: [3, -6], hr: [-3, -7], tool: -8 - x * 8, by: -x, uf: 1 }, 'o'], [.38, { hl: [3, -6.5], hr: [-3, -7.5], tool: -10 - x * 8, by: -x, uf: 1 }],
      [.5, { hl: [6, 8], hr: [-4, 10], tool: 178, by: 2 + x, hd: [0, 1], nb: 1 }, 'i'], [.72, { hl: [6, 6], hr: [-4, 8], tool: 176, by: 1.5, hd: [0, 1], nb: 1 }], [1, {}]]);
  },
  hammer(u, c) {
    const x = c.lvl > 2 ? 1 : 0;
    return keyed(u, { hl: [5, 8], hr: [-2, 8], tool: 30, by: 0, hd: [0, 1], uf: 0, nb: 0 }, [[0, {}],
      [.3, { hr: [-1, -8], tool: -10 - x * 15, by: -x, hd: [0, 0], uf: 1 }, 'o'], [.38, { hr: [-1, -8.5], tool: -12 - x * 15, by: -x, hd: [0, 0], uf: 1 }],
      [.5, { hr: [-3, 9], tool: 175, by: 1 + x, hd: [0, 1], nb: 1 }, 'i'], [.58, { hr: [-3, 8], tool: 165, by: 1, nb: 1 }], [1, {}]]);
  },
  stir(u, c) { return { item: 'ladle', hl: [4, 8], hr: [-4 + cs(u) * 2, 9 + sn(u) * 1], tool: 180 + sn(u) * 14, by: 1, hd: [cs(u) > .6 ? 1 : 0, 1], uf: 0, nb: 1, blink: c.lvl > 2 && u > .9 ? 1 : 0 }; },
  gather(u) { return { item: null, by: 5, hl: [4 + sn(u), 10 - Math.max(0, sn(u)) * 2], hr: [-4 + sn(u), 10 - Math.max(0, -sn(u)) * 2], hd: [0, 2], nb: 1 }; },
  lift(u, c) { const crouch = { by: 5, hl: [3, 10], hr: [-3, 10], hd: [0, 2] }; return keyed(u, { item: null, hl: HANG, hr: HANG, by: 0, hd: [0, 0], fl: [0, 0], fr: [0, 0], cu: 0 }, [[0, {}], [.4, crouch], [.55, { ...crouch, carry: c.hold }], [1, { ...carried(c.hold, 0, { ...c, face: 'f' }, 0), cu: 1 }, 'o']]); },
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
  draw(u) { const a = sn(u); return { item: null, hl: [6, 1 + a * 4], hr: [-6, 3 - a * 4], by: .5 + Math.max(0, a) * .8, hd: [0, 0] }; },
  drink(u) { return keyed(u, { item: 'cup', hr: [-2, 6], tool: 0, hd: [0, 0], hl: HANG }, [[0, {}], [.28, { hr: [-7, -2], tool: -10, hd: [0, -1] }], [.66, { hr: [-7, -2.5], tool: -30, hd: [0, -1] }], [.82, { hr: [-2, 6] }], [1, {}]]); },
  eat(u) {
    const chew = u > .42 && u < .95 ? (Math.floor(u * 16) & 1) : 0;
    return keyed(u, { item: 'bread', by: 4, hr: [-2, 6], tool: 90, hd: [0, 0], hl: [3, 7], mouth: 0 }, [[0, {}], [.26, { hr: [-7, -1], hd: [0, 1], mouth: 1 }], [.38, { hr: [-7, -1], hd: [0, 1], mouth: 1 }], [.52, { hr: [-2, 6], hd: [0, chew], mouth: 0 }], [.95, { hd: [0, chew] }], [1, {}]]);
  },
  guard(u, c) { return { hr: [-2, 5 + sn(u) * .5], tool: c.tool === 'spear' ? 8 : 25, hl: [5, 4], by: 1 + sn(u) * .4, fl: [0, 0], fr: [0, 0], clasp: 1, ub: 1 }; },
  attack(u, c) {
    const x = c.lvl > 2 ? 1 : 0;
    return keyed(u, { hr: [-2, 5], tool: 25, hl: [5, 4], by: 1, hd: [0, 0], uf: 0, nb: 0 }, [[0, {}],
      [.3, { hr: [0, -9], tool: -15 - x * 15, by: x ? 0 : 1, hd: [0, -1], uf: 1 }, 'o'], [.36, { hr: [0, -9.5], tool: -18 - x * 15, uf: 1 }],
      [.48, { hr: [-4, 9], tool: 170, by: 2 + x, hd: [0, 1], fr: [0, 1], nb: 1 }, 'i'], [.62, { hr: [-5, 8], tool: 150 + x * 10, by: 2, nb: 1 }], [1, {}]]);
  },
  thrust(u, c) {
    const x = c.lvl > 2 ? 1 : 0;
    return keyed(u, { hl: [5, 6], hr: [-3, 5], tool: 175, tool_b: 5, by: 1, uf: 0, nb: 0 }, [[0, {}],
      [.3, { hl: [5, 3], hr: [-3, 1], by: -x }, 'o'], [.45, { hl: [5, 10], hr: [-3, 10], by: 2 + x, hd: [0, 1] }, 'i'], [.62, { hl: [5, 10], hr: [-3, 10], by: 2, hd: [0, 1] }], [1, {}]]);
  },
  block(u) { return keyed(u, { hl: [5, 4], hr: [-2, 6], tool: 25, by: 1, bx: 0 }, [[0, {}], [.3, { hl: [7, -1], by: 1.5 }], [.48, { hl: [7, -1], by: 1.5 }], [.56, { hl: [6, 0], by: 0, hd: [0, -1] }, 'o'], [.8, { hl: [7, 0], by: 1, hd: [0, 0] }], [1, {}]]); },
  shoot(u, c) {
    const tr = c.lvl > 2 && u > .6 && u < .75 ? (Math.floor(u * 40) & 1) * .5 : 0;
    return keyed(u, { hl: [3, 8], hr: [-3, 8], bow: 0, hd: [0, 0] }, [[0, {}], [.22, { hl: [6, 1], hr: [-8, 1], bow: 1 }], [.3, { hl: [6, 1], hr: [-8, 1], bow: 1 }], [.6, { hl: [6, 1], hr: [-12, -1 + tr], bow: 5 }, 'o'], [.75, { hl: [6, 1], hr: [-12, -1 + tr], bow: 5 }], [.76, { hl: [6, 1], hr: [-13, 2], bow: 0 }, 'l'], [.9, { hl: [6, 2], hr: [-10, 4] }], [1, {}]]);
  },
  hit(u) { return keyed(u, { hr: [-2, 7], hl: [2, 8], bx: 0, hd: [0, 0], blink: 0, by: 0 }, [[0, {}], [.25, { bx: -1, hd: [0, -2], hr: [-6, 3], hl: [6, 3], blink: 1, by: -1 }, 'o'], [.55, { bx: 0, hd: [0, -1], hr: [-5, 5], hl: [5, 5], blink: 1, by: 0 }], [1, {}]]); },
  stagger(u) { return keyed(u, { hr: [-2, 8], hl: [2, 8], bx: 0, hd: [0, 0], by: 0, fl: [0, 0], fr: [0, 0], blink: 0 }, [[0, {}], [.2, { hd: [0, -2], hr: [-7, 2], hl: [7, 2], fr: [0, 3], by: -1, blink: 1 }, 'o'], [.45, { bx: -2, hr: [-6, 4], hl: [6, 4], fr: [0, 0], fl: [0, 3], by: 0 }], [.7, { bx: 1, hd: [0, 1], hr: [-3, 8], hl: [3, 8], fl: [0, 0], by: 1.5 }], [1, { bx: 0, by: 1 }]]); },
  fall(u) { if (u >= .7) return { lie: 1, blink: 1 }; return keyed(u, { item: null, hr: [-2, 8], hl: [2, 8], hd: [0, 0], by: 0, blink: 1 }, [[0, {}], [.22, { hd: [0, -2], hr: [-7, 2], hl: [7, 2], by: -1 }, 'o'], [.5, { hd: [0, 3], hr: [-4, 9], hl: [4, 9], by: 6 }, 'i'], [.7, { hd: [0, 4], hr: [-5, 9], hl: [5, 9], by: 8 }]]); },
};
const FB_READY = {
  one: (u, c) => ({ hr: [-2, 5 + sn(u) * .5], tool: 25, hl: [5, 4], by: 1 + sn(u) * .4, fl: [0, 0], fr: [0, 0], clasp: 1, ub: 1 }),
  two: (u, c) => c.tool === 'spear' || c.tool === 'staff' ? { hl: [4, 1.2 + sn(u) * .4], hr: [-1, 7 + sn(u) * .4], tool: -60, by: 1 + sn(u) * .4, fl: [0, 0], fr: [0, 0], clasp: 1, ub: 1 } : { hl: [5, 8], hr: [-5, 8 + sn(u) * .4], tool: 35, by: 1 + sn(u) * .4, fl: [0, 0], fr: [0, 0], clasp: 1, ub: 1 },
  bow: (u, c) => ({ hl: [-1.5, 2.5 + sn(u) * .4], hr: [-5, 3], bow: 1, arrow: 1, by: .6 + sn(u) * .3, fl: [0, 0], fr: [0, 0] }),
};
const fbReadied = (family, u, c) => keyed(u, { ...FB_POSES.tuckStand(0, c), br: 0, clasp: 0, ub: 1 }, [[0, {}], [.45, { hr: [-1, 6], tool: 100, by: .6 }], [1, { ...FB_READY[family](0, c), crook: [], fore: [], stow: 0 }, 'o']]);
function fbPose(name, u, c) {
  const back = c.face === 'b', p = { ...FB_POSES[name](u, c), face: c.face };
  p.under = (!back && p.uf > .5) || (back && p.ub > .5) ? 1 : 0;
  if (back && p.nb > .5) p.item = null;
  if (back && p.tool_b !== undefined) p.tool = p.tool_b;
  if (back) { for (const k of FBX_KEYS) if (p[k]) p[k] = [-p[k][0], p[k][1]]; if (p.bx) p.bx = -p.bx; }
  delete p.nb; delete p.uf; delete p.ub; delete p.tool_b;
  return p;
}
