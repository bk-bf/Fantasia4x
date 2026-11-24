'use strict';
const WORLD_STACKS = (() => {
  const REGIONS = ['body', 'trim', 'strap', 'lining'];
  const widest = rows => Math.max(...rows.map(row => row.length));
  const piece = (rows, wear) => ({ rows: rows.map(row => row.padEnd(widest(rows))), inks: REGIONS.map(region => wear[region] || wear.body), w: widest(rows), h: rows.length });
  const scene = (...layers) => layers.reduce((sk, [x, y, p]) => PX.overlay(sk, x, y, p.rows, ...p.inks), PX.sketch());
  const strewn = (p, spots) => scene(...spots.map(([x, y]) => [x, y, p]));

  function tiered(p, tiers, lap, rise) {
    const dx = p.w - (lap === undefined ? 1 : lap), dy = rise === undefined ? Math.max(1, Math.round(p.h * .6)) : rise, base = tiers[0];
    return tiers.flatMap((n, tier) => Array.from({ length: n }, (_, i) => [Math.round((base - n) * dx / 2) + i * dx, (tiers.length - 1 - tier) * dy, p]));
  }
  const mound = (p, tiers, lap, rise) => scene(...tiered(p, tiers, lap, rise));

  function wall(wide, deep, planked) {
    const rows = ['l'.repeat(wide - 2) + 'md'];
    for (let j = 1; j < deep - 1; j++) rows.push(planked && j % 3 === 0 ? 'l' + 'o'.repeat(wide - 2) + 'd' : 'l' + 'm'.repeat(wide - 3) + 'dd');
    return [...rows, 'd'.repeat(wide)];
  }
  function packed(p, columns, deep, wear, sink) {
    const step = p.w + 1, wide = columns * step + 3, lift = Math.max(2, Math.round(p.h * .4)), under = sink === undefined ? 2 : sink;
    const back = Array.from({ length: columns }, (_, i) => [2 + i * step, 0, p]), front = Array.from({ length: columns }, (_, i) => [1 + i * step, lift, p]);
    return scene(...back, ...front, [0, lift + p.h - under, piece(wall(wide, deep, deep > 4), wear)]);
  }
  const held = (layers, vessel, at) => scene(...layers, [at[0], at[1], vessel]);

  const stageAt = (marks, quantity) => marks.findIndex((mark, i) => i === marks.length - 1 || quantity < (mark + marks[i + 1]) / 2);
  const staged = (kind, marks, draws, tuck) => ({ kind, tuck: tuck || 'low', stages: marks, ground: quantity => draws[stageAt(marks, quantity || 1)]() });

  return { piece, scene, strewn, tiered, mound, packed, held, staged };
})();
