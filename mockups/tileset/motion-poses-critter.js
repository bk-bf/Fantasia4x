'use strict';
const pairs = (u, off, duty, S, H) => off.map(f => stride(u + f, duty, S, H));
const hopDx = (u, a, b, d) => clamp((u - a) / (b - a), 0, 1) * d - u * d;
const deathOf = (dur, n, keys, last) => ({
  fall: { label: 'Death', group: 'Creatures', dur, n, once: 1, pose(u, c) { return u >= keys[keys.length - 1][0] ? last : keyed(u, keys[0][1], keys); } },
  down: { label: 'Dead', group: 'Creatures', dur: 3, n: 1, pose() { return last; } },
});
const blinkAt = (c, u) => c.lvl > 2 && (c.t * .31 + c.seed) % 1 > .94 ? 1 : 0;

const CRIT_ANIMS = {
  rat: {
    idle: { label: 'Sniffing', group: 'Creatures', dur: 2.2, n: 8, pose(u, c) { const s2 = Math.floor(u * 8); return { head: [s2 % 4 === 1 ? 1 : 0, s2 % 4 === 1 ? -1 : s2 === 6 ? 1 : 0], by: s2 === 6 ? .5 : 0, tail: u * TAU, blink: blinkAt(c, u) }; } },
    walk: { label: 'Scurrying', group: 'Creatures', dist: 12, n: 8, pose(u) { return { feet: pairs(u, [.5, 0, 0, .5], .5, 6, 2), by: -Math.abs(sn(u * 2)) * 1, stretch: sn(u * 2) * .8, tail: u * TAU * 2, head: [0, sn(u * 2) * .5] }; } },
    attack: { label: 'Biting', group: 'Creatures', dur: .7, n: 7, hit: [.45, 'blow'], pose(u) { return keyed(u, { dx: 0, by: 0, head: [0, 0], jaw: 0, stretch: 0, feet: still4 }, [[0, {}], [.3, { dx: -2, by: 1, head: [-1, 1], stretch: -1 }, 'o'], [.45, { dx: 4, by: -1, head: [2, -1], jaw: 1, stretch: 1.5, feet: [[-3, 0], [3, 2], [-3, 0], [3, 2]] }, 'i'], [.6, { dx: 4, head: [2, 1], jaw: 0, stretch: 1 }], [1, {}]]); } },
    ...deathOf(.8, 6, [[0, { by: 0, head: [0, 0], dx: 0 }], [.25, { by: -2, head: [-1, -2], dx: -1 }, 'o'], [.55, { by: 1, head: [1, 1], dx: -1 }, 'i']], { dead: 1, dx: -1 }),
  },
  croaker: {
    idle: { label: 'Croaking', group: 'Creatures', dur: 2.4, n: 8, pose(u, c) { const k = u > .3 && u < .7 ? Math.sin((u - .3) / .4 * Math.PI) : 0; return { throat: k, blink: u > .85 && u < .92 ? 1 : 0, sq: u > .4 && u < .6 ? .5 : 0 }; } },
    walk: { label: 'Hopping', group: 'Creatures', dist: 18, n: 8, pose(u) { const air = u > .25 && u < .75, k = air ? Math.sin((u - .25) / .5 * Math.PI) : 0; return { dx: hopDx(u, .25, .75, 18), by: -k * 8, kick: air ? .3 + k * .7 : 0, tilt: air ? 2 * (1 - (u - .25) / .5 * 1.6) : 0, sq: u < .25 ? Math.sin(u / .25 * Math.PI) : u >= .75 ? Math.sin((u - .75) / .25 * Math.PI) * .8 : -.6, reach: air ? 3 : 0, air: air ? 1 : 0 }; } },
    attack: { label: 'Tongue lash', group: 'Creatures', dur: .8, n: 8, hit: [.4, 'blow'], pose(u) { return keyed(u, { tongue: 0, tdy: 0, sq: 0, tilt: 0, throat: 0 }, [[0, {}], [.25, { sq: .8, tilt: 1, throat: .5 }, 'o'], [.4, { tongue: 16, tdy: 1, sq: -.3, tilt: -1 }, 'i'], [.55, { tongue: 14, tdy: 2, tilt: -1 }], [.75, { tongue: 0, tilt: 0 }, 'i'], [1, {}]]); } },
    ...deathOf(.9, 6, [[0, { by: 0, sq: 0, kick: 0 }], [.3, { by: -6, kick: .8, sq: -.6 }, 'o'], [.6, { by: 0, sq: 1, kick: .4 }, 'i']], { dead: 1, kick: 1, sq: 1.5, reach: 4 }),
  },
  spider: {
    idle: { label: 'Waiting', group: 'Creatures', dur: 2.6, n: 8, pose(u) { const t = Math.floor(u * 8); return { by: t % 4 === 2 ? -1 : 0, feet: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [t === 5 ? 1 : 0, t === 5 ? 2 : 0], [t === 1 ? 1 : 0, t === 1 ? 2 : 0]], fang: t === 3 || t === 7 ? 1 : 0 }; } },
    walk: { label: 'Skittering', group: 'Creatures', dist: 12, n: 8, pose(u) { return { feet: pairs(u, [0, .5, .5, 0, 0, .5, .5, 0], .5, 6, 3), by: -Math.abs(cs(u * 2)) * .8 }; } },
    attack: { label: 'Rearing bite', group: 'Creatures', dur: 1, n: 8, hit: [.55, 'blow'], pose(u) { return keyed(u, { rear: 0, bx: 0, by: 0, fang: 0 }, [[0, {}], [.35, { rear: 1, bx: -2, by: -2, fang: 1 }, 'o'], [.45, { rear: 1, bx: -2, by: -2, fang: 1 }], [.55, { rear: .2, bx: 4, by: 1, fang: 2 }, 'i'], [.7, { rear: 0, bx: 3, by: 0, fang: 0 }], [1, {}]]); } },
    ...deathOf(.9, 6, [[0, { by: 0, bx: 0, rear: 0 }], [.3, { by: -2, rear: .8 }, 'o'], [.6, { by: 3, rear: 0 }, 'i']], { dead: 1 }),
  },
  adder: {
    idle: { label: 'Tasting the air', group: 'Creatures', dur: 2.2, n: 8, pose(u) { const t = Math.floor(u * 8); return { ph: sn(u) * .3, tongue: t === 2 || t === 3 ? 3 + (t & 1) : t === 6 ? 4 : 0, rise: 1 + sn(u) * .08 }; } },
    walk: { label: 'Slithering', group: 'Creatures', dist: 23.9, n: 8, pose(u) { return { ph: u * TAU, rise: .75 }; } },
    attack: { label: 'Striking', group: 'Creatures', dur: .9, n: 8, hit: [.5, 'blow'], pose(u) { return keyed(u, { reach: 0, back: 0, rise: 1, jaw: 0 }, [[0, {}], [.35, { back: 8, rise: 1.2, jaw: 1 }, 'o'], [.42, { back: 9, rise: 1.25, jaw: 1 }], [.5, { reach: 14, rise: .45, jaw: 1 }, 'i'], [.62, { reach: 12, rise: .5, jaw: 0 }], [1, {}]]); } },
    ...deathOf(1, 6, [[0, { rise: 1, amp: 4, ph: 0 }], [.3, { rise: 1.3, amp: 5, ph: 1.5 }, 'o'], [.7, { rise: .1, amp: 2, ph: 2.4 }, 'i']], { dead: 1, rise: 0, amp: 1.6, ph: 2.4, tongue: 2 }),
  },
  ooze: {
    idle: { label: 'Pulsing', group: 'Creatures', dur: 2.4, n: 8, pose(u) { return { rx: 18 + sn(u) * .8, bub: u, slosh: sn(u) * 1.2 }; } },
    walk: { label: 'Creeping', group: 'Creatures', dist: 10, n: 8, pose(u) { const e = u < .5 ? u : 1 - u; return { rx: 18 + e * 10, sy: 1 - e * .3, arm: [8 + e * 10, -3 - e * 2, 5 + e * 6], bub: u * 2, slosh: -e * 4 }; } },
    attack: { label: 'Engulfing', group: 'Creatures', dur: 1.2, n: 8, hit: [.6, 'blow'], pose(u) { const arm = (ax, ay, ar) => ({ arm: [ax, ay, ar] }); return keyed(u, { rx: 18, sy: 1, cx: 0, arm: [0, 0, 1], bub: 0 }, [[0, {}], [.35, { rx: 14, sy: 1.35, cx: -1, ...arm(4, -8, 8), bub: .3 }, 'o'], [.6, { rx: 20, sy: .85, cx: 3, ...arm(18, -2, 9), bub: .6 }, 'i'], [.75, { rx: 22, sy: .8, cx: 4, ...arm(16, 2, 8) }], [1, {}]]); } },
    ...deathOf(1.4, 8, [[0, { rx: 18, sy: 1, glow: 80, bub: 0 }], [.4, { rx: 16, sy: 1.15, glow: 80, bub: .5 }, 'o'], [.9, { rx: 26, sy: .48, glow: 30, bub: .9 }, 'i']], { rx: 26, sy: .48, glow: 30 }),
  },
  shade: {
    idle: { label: 'Hovering', group: 'Creatures', dur: 3, n: 8, pose(u) { return { by: rnd(sn(u) * 1.5), hem: u, wave: u }; } },
    walk: { label: 'Drifting', group: 'Creatures', dist: 20, n: 8, pose(u) { return { by: rnd(sn(u) * 1.2), trail: .8 + sn(u * 2) * .15, hem: u * 2, wave: u * 2 }; } },
    attack: { label: 'Reaching', group: 'Creatures', dur: 1.1, n: 8, hit: [.55, 'blow'], pose(u) { return keyed(u, { by: 0, bx: 0, reach: 0, eye: 0, trail: 0, hem: 0, wave: 0 }, [[0, {}], [.35, { by: -4, bx: -2, reach: .2, eye: 1, hem: .4, wave: .3 }, 'o'], [.55, { by: 0, bx: 6, reach: 1, eye: 1, trail: 1.2, hem: .8, wave: .6 }, 'i'], [.75, { by: 0, bx: 5, reach: .8, eye: 1, trail: .8, hem: 1 }], [1, { hem: 1.4 }]]); } },
    ...deathOf(1.4, 8, [[0, { by: 0, fade: 0, hem: 0, eye: 0 }], [.3, { by: -3, fade: .05, hem: .6, eye: 1 }, 'o'], [.95, { by: 8, fade: .92, hem: 2.4, eye: 0 }, 'i']], { by: 8, fade: 1 }),
  },
  stirge: {
    idle: { label: 'Hovering', group: 'Creatures', dur: .6, n: 6, pose(u) { return { wing: cs(u), by: rnd(sn(u) * 1.5), legs: .3 }; } },
    walk: { label: 'Flapping', group: 'Creatures', dist: 26, n: 6, pose(u) { return { wing: cs(u) * 1.1, by: rnd(sn(u) * 2) - 1, legs: .6 }; } },
    attack: { label: 'Darting', group: 'Creatures', dur: .9, n: 8, hit: [.55, 'blow'], pose(u) { return keyed(u, { wing: 1, sweep: 0, dip: 0, by: 0, dx: 0, legs: 0 }, [[0, {}], [.3, { wing: 1.2, by: -4, dx: -3 }, 'o'], [.55, { wing: .2, sweep: 1, dip: 2, by: 6, dx: 10, legs: 1 }, 'i'], [.7, { wing: .3, sweep: .8, dip: 2, by: 6, dx: 10, legs: 1 }], [1, {}]]); } },
    ...deathOf(.9, 6, [[0, { wing: 1, by: 0, dip: 0, legs: 0 }], [.25, { wing: -.6, by: 3, dip: 1 }], [.85, { wing: .3, sweep: .6, by: 38, dip: 1, legs: 1 }, 'i']], { dead: 1, wing: .15, sweep: .7, by: 40, dip: 1, legs: 1 }),
  },
};
