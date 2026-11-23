'use strict';
const SCENES = (() => {
  const TILE = 32, SEED = 3, SHARES = [.15, .5, 1];
  const drop = (item, quantity, x, y) => ({ item, quantity, x, y });
  function ruled(wide, high, drops, o) {
    const opts = o || {}, w = DBX.flat(wide, high, 'tall_grass'), walled = opts.walled || (() => false);
    for (let y = 0; y < high; y++) for (let x = 0; x < wide; x++) if (walled(x, y)) w.wall[y * wide + x] = WL.stone;
    const env = { stations: [], wall: (x, y) => x >= 0 && y >= 0 && x < wide && y < high && walled(x, y), floor: () => false, zone: opts.zoned || (() => false), field: () => false, grass: () => P.grassLoam };
    const placed = RULES.plan(env, drops.filter(d => d.item), SEED);
    for (const p of placed) w.objs.push({ spr: p.spr, x: p.x, y: p.y });
    for (const [x, y] of opts.pawns || []) w.objs.push({ spr: mkPawn(PAWNS.woodcutter.o), x: Math.round(x * TILE) + 16, y: y * TILE + 27 });
    return { img: DBX.crop({ world: w, rect: [0, 0, wide * TILE, high * TILE], season: opts.season || 'summer' }), labels: placed.flatMap(p => p.labels) };
  }
  const stages = (item, cls) => SHARES.map((share, i) => drop(item, Math.max(1, Math.round(RULES.CAP[cls] * share)), i, 1));
  function ofItem(item, season) {
    const k = RULES.classify(item);
    if (k.pile) return ruled(5, 2, stages(item, k.pile), { pawns: [[3.8, 1]], season });
    if (k.long) return ruled(5, 4, [drop(item, 1, 1, 1), drop(item, 1, 1, 3)], { walled: (x, y) => y === 0, pawns: [[3.2, 2]], season });
    return ruled(4, 2, [drop(item, 1, 1, 1)], { pawns: [[2.6, 1]], season });
  }
  return { TILE, drop, ruled, stages, ofItem };
})();
