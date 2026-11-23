'use strict';
const YARD = (() => {
  const TILE = 32, W = 17, H = 11, SEASON = 'summer';
  const ZONE = { x0: 8, x1: 12, y0: 5, y1: 7 }, FIELD = { x0: 14, x1: 16, y0: 5, y1: 8 }, HOUSE = { x0: 1, y0: 1, x1: 5, y1: 4 };
  const STOCK = ['oak_log', 'pine_log', 'birch_log', 'oak_plank', 'pine_plank', 'granite_block', 'limestone_block', 'fired_brick', 'small_stone', 'granite', 'hematite', 'malachite', 'coal', 'sand', 'copper_bar', 'iron_bar', 'bronze_bar', 'gold_bar', 'wheat', 'flour', 'grain_seed', 'venison', 'boar_meat', 'deer_hide', 'cured_deer_hide', 'linen_cloth', 'woolcloth', 'hay', 'flax_fiber', 'cabbage', 'apple', 'turnip', 'water', 'ale', 'wine', 'small_stew', 'iron_nail', 'salt'];
  const LOOSE = ['steel_longsword', 'hunting_recurve', 'iron_nasal_helm', 'hide_boots', 'plate_cuirass', 'framed_leather_pack', 'iron_mace', 'bearded_axe', 'spatha', 'plank_round_shield', 'leather_sword_belt', 'venison', 'apple', 'kettle_hat', 'war_bow'];
  const LEANERS = ['steel_boar_spear', 'steel_longsword', 'plank_round_shield', 'hunting_recurve', 'iron_winged_spear', 'iron_hoe', 'bearded_axe'];
  const INDOOR = ['small_stew', 'flour', 'linen_cloth', 'iron_nail', 'ale', 'bread'];
  const BENCH = [['iron_hammer', 'anvil'], ['iron_tongs', 'smelter'], ['steel_tongs', 'bloomery'], ['iron_pick', 'stonecutter'], ['bone_cleaver', 'butcher'], ['steel_hammer', 'anvil']];
  const inside = (r, x, y) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
  const calm = s => Object.assign(Object.create(Object.getPrototypeOf(s)), s, { sway: 0, frames: undefined });

  function environment() {
    const w = new World(W, H, G.tall_grass), stations = [], busy = new Set();
    const key = (x, y) => x + ',' + y, hold = (x, y) => busy.add(key(x, y));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const n = fbm(x * .3 + 4, y * .3, 9, 2); w.g[y * W + x] = n > .62 ? G.deep_grass : n < .36 ? G.grass : G.tall_grass; }
    for (let y = 4; y <= 8; y++) for (let x = 7; x <= 13; x++) w.g[y * W + x] = G.dirt;
    for (let x = 0; x <= 6; x++) w.g[5 * W + x] = x > 3 ? G.dirt : w.g[5 * W + x];
    w.room(HOUSE.x0, HOUSE.y0, HOUSE.x1, HOUSE.y1, WL.stone, FL.plank);
    w.feat[HOUSE.y1 * W + 3] = 1;
    for (let x = 7; x <= 13; x++) w.wall[x] = WL.stone;
    for (let y = 1; y <= 3; y++) for (let x = 8; x <= 12; x++) w.floor[y * W + x] = FL.flagstone;
    for (let y = FIELD.y0; y <= FIELD.y1; y++) for (let x = FIELD.x0; x <= FIELD.x1; x++) { w.g[y * W + x] = G.tilled; w.put(calm(crop(x < 16 ? 'wheat' : 'cabbage', x * 3 + y, SEASON)), x, y, 0, 8); hold(x, y); }
    const station = (kind, x, y, dx, dy) => { const o = w.put(calm(build(kind)), x, y, (dx || 0) * 2, (dy || 0) * 2); stations.push({ kind, tx: x, ty: y, x: o.x, y: o.y, low: kind === 'campfire' }); hold(x, y); };
    station('bloomery', 8, 1); station('smelter', 10, 1); station('anvil', 9, 2, 0, 3); station('stonecutter', 12, 3);
    station('campfire', 3, 7); station('butcher', 5, 9); station('cupboard', 4, 2, 0, 2);
    const stand = (spr, x, y, dx, dy) => { w.put(calm(spr), x, y, dx || 0, dy || 4); hold(x, y); };
    stand(build('stool'), 2, 8, 4, 4); stand(tree('pine', 3, SEASON), 15, 1); stand(tree('oak', 5, SEASON), 0, 3); stand(tree('pine', 7, SEASON), 16, 10);
    stand(plant('bush', 2, SEASON), 0, 9); stand(plant('stump', 4, SEASON), 14, 10); stand(plant('berry', 1, SEASON), 6, 1);
    stand(pawn('smith', true), 11, 2, 2, 8); stand(pawn('woodcutter'), 6, 6); stand(pawn('hunter'), 10, 6, 0, 6); stand(pawn('farmer', true), 13, 9); stand(pawn('cook'), 4, 8, -4, 2);
    const wall = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !!w.wall[y * W + x] && w.feat[y * W + x] !== 1, floor = (x, y) => !!w.floor[y * W + x];
    const zone = (x, y) => inside(ZONE, x, y), field = (x, y) => inside(FIELD, x, y);
    const grass = (x, y) => { if (floor(x, y) || wall(x, y)) return null; const g = GROUND[w.g[y * W + x]]; if (g.id === 'dirt' || g.id === 'tilled') return null; const t = (g.dec || []).find(d => d[0] === 'tuft'); return t ? t[2] : null; };
    const free = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !w.wall[y * W + x] && !busy.has(key(x, y));
    return { world: w, env: { stations, wall, floor, zone, field, grass }, free, hold };
  }

  function scatter(items, seed, yard) {
    const r = rng(seed * 7919 + 13), drops = [], pick = list => list[Math.floor(r() * list.length)];
    const add = (id, quantity, x, y) => { if (!items.get(id) || !yard.free(x, y)) return false; drops.push({ item: items.get(id), quantity, x, y }); yard.hold(x, y); return true; };
    const amount = id => { const cls = RULES.classify(items.get(id)).pile, cap = RULES.CAP[cls] || 1, t = r(); return Math.max(1, Math.round(cap * (t < .28 ? .08 + r() * .14 : t < .62 ? .32 + r() * .28 : .72 + r() * .28))); };
    for (let y = ZONE.y0; y <= ZONE.y1; y++) for (let x = ZONE.x0; x <= ZONE.x1;) {
      if (!yard.free(x, y) || r() < .12) { x++; continue; }
      const id = pick(STOCK), run = 1 + Math.floor(r() * 3);
      let n = 0;
      while (n < run && x + n <= ZONE.x1 && add(id, amount(id), x + n, y)) n++;
      x += Math.max(1, n);
    }
    const around = (s, list) => list.map(([dx, dy]) => [s.tx + dx, s.ty + dy]).filter(p => yard.free(p[0], p[1]));
    for (const [id, kind] of BENCH) {
      const s = yard.env.stations.find(q => q.kind === kind), spots = s && r() < .7 ? around(s, [[1, 0], [-1, 0], [0, 1]]) : [];
      if (spots.length) { const p = pick(spots); add(id, 1, p[0], p[1]); }
    }
    add(pick(['iron_hoe', 'steel_hoe', 'stone_hoe']), 1, 13, 5 + Math.floor(r() * 4));
    const logs = drops.find(d => /_log$/.test(d.item.id));
    if (logs) for (const dx of [-1, 1]) if (add(pick(['iron_axe', 'copper_axe']), 1, logs.x + dx, logs.y)) break;
    const wallSpots = [[1, 5], [2, 5], [4, 5], [5, 5], [9, 1], [11, 1], [12, 1], [6, 2], [6, 3]];
    for (let i = 0; i < 4; i++) { const p = pick(wallSpots); add(pick(LEANERS), r() < .2 ? 2 : 1, p[0], p[1]); }
    for (let i = 0; i < 2; i++) { const id = pick(STOCK); add(id, amount(id), pick([1, 2, 4, 5]), 5); }
    for (let i = 0; i < 2; i++) { const id = pick(INDOOR); add(id, RULES.classify(items.get(id)).pile ? amount(id) : 1, 2 + Math.floor(r() * 2), 2 + Math.floor(r() * 2)); }
    for (let i = 0; i < 7; i++) { const id = pick(LOOSE), x = Math.floor(r() * W), y = 5 + Math.floor(r() * 6); if (!inside(ZONE, x, y) && !(x >= 7 && x <= 13 && y < 9)) add(id, /venison|apple/.test(id) ? 1 + Math.floor(r() * 4) : 1, x, y); }
    return drops;
  }

  function flat(icon) {
    if (Math.max(icon.w, icon.h) <= 28) return icon;
    return TK.image(TK.shrink(TK.fromImage(icon, 0), 28), true);
  }
  function stamp(img, icon, cx, cy) {
    const x0 = Math.round(cx - icon.w / 2), y0 = Math.round(cy - icon.h / 2);
    for (let y = 0; y < icon.h; y++) for (let x = 0; x < icon.w; x++) {
      const i = (y * icon.w + x) * 4, px = x0 + x, py = y0 + y;
      if (icon.rgba[i + 3] < 128 || px < 0 || py < 0 || px >= img.w || py >= img.h) continue;
      const o = (py * img.w + px) * 4;
      img.rgba[o] = icon.rgba[i]; img.rgba[o + 1] = icon.rgba[i + 1]; img.rgba[o + 2] = icon.rgba[i + 2];
    }
  }
  const shot = w => DBX.crop({ world: w, rect: [0, 0, W * TILE, H * TILE], season: SEASON });

  function compose(items, seed, mode) {
    const yard = environment(), drops = scatter(items, seed, { ...yard, env: yard.env });
    if (mode === 'today') {
      const img = shot(yard.world);
      for (const d of drops) { const e = DBX.pick('item', d.item.id, SEASON); if (e) stamp(img, flat(DBX.bake(e)), d.x * TILE + 16, d.y * TILE + 16); }
      return { img, drops, labels: drops.map(d => ({ x: d.x * TILE + 16, y: d.y * TILE + 29 + (d.x % 2) * 7, text: d.item.name + (d.quantity > 1 ? ' x' + d.quantity : '') })), rules: {} };
    }
    const placed = RULES.plan(yard.env, drops, seed), rules = {};
    for (const p of placed) { yard.world.objs.push({ spr: p.spr, x: p.x, y: p.y }); if (p.labels.length) rules[p.rule] = (rules[p.rule] || 0) + 1; }
    return { img: shot(yard.world), drops, labels: placed.flatMap(p => p.labels), rules };
  }
  return { compose, W, H, TILE };
})();
