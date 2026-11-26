'use strict';
(() => {
  const X = DBX, old = { origin: 'mockup' };
  const groundTile = (cat, dbId, kind, meta) => {
    for (const season of X.seasons) for (let n = 0; n < 4; n++) X.tile(cat, dbId, season + '-' + n, () => ({ world: X.flat(4, 4, kind), rect: [32 * (1 + (n & 1)), 32 * (1 + (n >> 1)), 32, 32], season }), Object.assign({ view: s => ({ world: X.flat(3, 2, kind), rect: [0, 0, 96, 64], season: s }) }, meta));
  };
  X.groundTile = groundTile;
  for (const g of GROUND) groundTile('ground', g.id === 'tilled' ? '_tilled' : g.id, g.id, g.id === 'tilled' ? { origin: 'mockup', extra: 'Tilled Soil' } : old);

  const TREE_ID = { oak: 'oak_tree', ash: 'ash_tree', apple: 'apple_tree', birch: 'birch_tree', willow: 'willow_tree', pine: 'pine_tree', yew: 'yew_tree', heartwood: 'heartwood_grove', frostheart: 'frostheart_pine', moonwood: 'moonwood_grove', ironwood: 'ironwood_grove', emberwood: 'emberwood_grove', soulwood: 'soulwood_grove', witchwood: 'witchwood_grove', bonewood: 'bonewood_snag', dead: 'dead_tree' };
  for (const k in TREES) X.seasonal('tree', TREE_ID[k], 4, (i, s) => mkTree(k, i, s), old);

  const PLANT_ID = { berry: 'berry_bush', flowers: 'wildflower_patch', stump: 'tree_stump', logs: 'fallen_logs', mushroom: 'mushroom_patch', glowcap: 'glowcap', madness: 'spore_of_madness', bolete: 'nightshade_bolete', morel: 'witch_morel', scrub: 'scrub_patch', bloodroot: 'bloodroot', mandrake: 'mandrake', emberbloom: 'emberbloom' };
  for (const k in PLANTS) X.seasonal('plant', PLANT_ID[k] || '_' + k, 3, (i, s) => mkPlant(k, i, s), PLANT_ID[k] ? old : { origin: 'mockup', extra: PLANTS[k].name });

  for (const k in CROPS) X.seasonal('crop', 'crop_' + k, 3, (i, s) => mkCrop(k, i, s), old);

  const ROCK_ID = { boulder: ['ore', 'stone_outcrop'], mound: ['site', 'barrow_cache'], den: ['site', 'wolf_den'], warren: ['site', 'goblin_warren'], nest: ['site', 'harpy_roost'], cairn: ['site', 'sunken_relic'], geode: ['ore', 'star_geode'], vent: ['ore', 'mana_crystal_vent'], amethyst: ['ore', 'amethyst_node'], emerald: ['ore', 'emerald_node'], ruby: ['ore', 'ruby_node'], topaz: ['ore', 'topaz_node'], sapphire: ['ore', 'infused_sapphire_node'] };
  for (const k in ROCKS) X.seasonal(ROCK_ID[k][0], ROCK_ID[k][1], 3, (i, s) => mkRock(k, i, s), old);

  const oreWorld = (ramp, seed, glow, w, h) => { const wd = X.flat(w, h + 1, 'rocky'); for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) { wd.wall[y * w + x] = WL.mountain; if (ramp) wd.ore[y * w + x] = { ramp, seed, glow }; } return wd; };
  const richSeeds = [];
  for (let sd = 1; richSeeds.length < 4 && sd < 400; sd++) if (fbm(48 * .028, 40 * .028, 61 + sd, 2) > .6 && fbm(30 * .028, 24 * .028, 61 + sd, 2) > .5 && fbm(70 * .028, 50 * .028, 61 + sd, 2) > .5) richSeeds.push(sd);
  X.oreVein = (dbId, ramp, glow, meta) => {
    for (let n = 0; n < 3; n++) X.tile('ore', dbId, n, () => ({ world: oreWorld(ramp, richSeeds[n + 1], glow, 3, 3), rect: [32, 10, 32, 32], oy: -22 }), Object.assign({ view: () => ({ world: oreWorld(ramp, richSeeds[0], glow, 3, 2), rect: [0, 0, 96, 96] }) }, meta));
  };
  const ORE_ID = { gold: 'native_gold', salt: 'rock_salt' };
  for (const k in ORE) X.oreVein(ORE_ID[k] || k, ORE[k], k === 'gold' ? [1, .8, .3] : null, old);
  X.oreVein('mountain_wall', null, null, old);

  const wallRoom = (i, feats) => { const w = X.flat(6, 5, 'tall_grass'), m = WALLS[i]; for (let x = 1; x <= 4; x++) { w.wall[6 + x] = i; w.wall[18 + x] = i; } w.wall[13] = i; w.wall[16] = i; if (!m.thin && feats) { w.feat[20] = 1; w.feat[21] = 2; w.floor[14] = w.floor[15] = FL.plank; } return w; };
  X.wallKind = (dbId, i, meta) => {
    const m = WALLS[i], lone = () => { const w = X.flat(3, 3, 'dirt'); w.wall[4] = i; return w; };
    X.tile('building', dbId, 'post', () => ({ world: lone(), clear: X.flat(3, 3, 'dirt'), rect: [32, 32 - m.h, 32, 32 + m.h], oy: -m.h }), Object.assign({ view: () => ({ world: wallRoom(i, true), rect: [0, 0, 192, 160] }) }, meta));
    X.tile('building', dbId, 'run', () => { const w = X.flat(5, 3, 'dirt'); for (let x = 0; x < 5; x++) w.wall[5 + x] = i; return { world: w, clear: X.flat(5, 3, 'dirt'), rect: [64, 32 - m.h, 32, 32 + m.h], oy: -m.h }; }, meta);
  };
  X.wallKind('stone_block_wall', WL.stone, old); X.wallKind('daub_wall', WL.daub, old); X.wallKind('palisade', WL.palisade, old);
  const featTile = (dbId, feat) => X.tile('building', dbId, '0', () => { const mk = f => { const w = X.flat(5, 3, 'dirt'); for (let x = 0; x < 5; x++) w.wall[5 + x] = WL.stone; if (f) w.feat[7] = f; return w; }; return { world: mk(feat), clear: mk(0), rect: [64, 32 - 14, 32, 46], oy: -14 }; }, { origin: 'mockup', view: () => { const w = X.flat(3, 3, 'tall_grass'); for (let x = 0; x < 3; x++) w.wall[3 + x] = WL.stone; w.feat[4] = feat; return { world: w, rect: [0, 0, 96, 96] }; } });
  featTile('door', 1); featTile('window', 2);

  X.floorKind = (dbId, i, meta) => {
    for (let n = 0; n < 4; n++) X.tile('building', dbId, n, () => { const w = X.flat(4, 4, 'dirt'); w.floor.fill(i); return { world: w, rect: [32 * (1 + (n & 1)), 32 * (1 + (n >> 1)), 32, 32] }; }, Object.assign({ view: () => { const w = X.flat(3, 2, 'dirt'); w.floor.fill(i); return { world: w, rect: [0, 0, 96, 64] }; } }, meta));
  };
  X.floorKind('wooden_floor', FL.plank, old); X.floorKind('stone_floor', FL.flagstone, old); X.floorKind('packed_earth_floor', FL.earth, old);

  X.roofKind = (dbId, kind, meta) => {
    const room = () => { const w = X.flat(6, 5, 'tall_grass'); w.room(1, 1, 4, 3, WL.stone, FL.plank, kind); return w; };
    X.tile('building', dbId, 'room', () => ({ world: room(), rect: [28, 6, 136, 116], ox: -4, oy: -26, roofs: true }), Object.assign({ view: () => ({ world: room(), rect: [0, 0, 192, 160], roofs: true }) }, meta));
  };
  X.roofKind('thatch_roof', 'thatch', old); X.roofKind('tile_roof', 'tile', old);

  const BUILD_ID = { campfire: 'campfire', hearth: 'hearth', featherbed: 'feather_bed', woolbed: 'wool_tick_bed', haybed: 'hay_bed', table: 'hewn_table', stool: 'log_stool', cupboard: 'larder_cupboard', rug: 'bear_rug', carpenter: 'carpenter_bench', anvil: 'anvil', bloomery: 'bloomery', kiln: 'pottery_kiln', well: 'well', drying: 'drying_rack', loom: 'weaving_frame', armchair: 'armchair', tailor: 'outfitters_bench', spinning: 'spinning_wheel', smelter: 'stone_forge', stonecutter: 'masons_bench', butcher: 'flensing_table', smoking: 'smoking_rack', potter: 'potters_wheel', charcoal: 'charcoal_pit', windmill: 'windmill', quern: 'quern', tanning: 'tanning_bucket_station', trough: 'soaking_trough', compost: 'compost_bin' };
  for (const k in BUILDS) {
    const id = BUILD_ID[k] || '_' + k, meta = BUILD_ID[k] ? old : { origin: 'mockup', extra: BUILDS[k].name };
    for (let f = 0; f < (BUILDS[k].frames || 1); f++) X.reg('building', id, f ? 'f' + f : '0', () => mkBuild(k, f), meta);
  }

  const BEAST_ID = { wolf: 'wolf', direwolf: 'dire_wolf', bear: 'bear', boar: 'boar', deer: 'deer', elk: 'elk', ox: 'aurochs', packox: 'kingdom_pack_beast', frostfang: 'frost_fang', worg: 'worg', jackal: 'jackal', cavebear: 'cave_bear', fawn: 'fawn', sabre: 'sabretooth', bighorn: 'mountain_goat', mammoth: 'bull_mammoth', lurker: 'mire_crocodile', hippogriff: 'hippogriff', owlbear: 'owlbear', fowl: 'wild_chicken', rabbit: 'rabbit', rat: 'giant_rat', spider: 'thornwood_spider', adder: 'marsh_viper', ooze: 'grimeling', shade: 'shadow_wraith', croaker: 'bullywug', stirge: 'stirge' };
  for (const k in BEAST_ID) X.reg('creature', BEAST_ID[k], '0', () => mkBeast(k), old);

  const PAWN_ID = { gobboss: 'goblin_boss', kobold: 'kobold_skulker', warlord: 'orc_warlord', gnoll: 'gnoll_marauder', goblin: 'goblin', orc: 'orc_reaver', trader: 'kingdom_trader', guard: 'kingdom_guard' };
  for (const k in PAWNS) {
    if (PAWN_ID[k]) X.reg('creature', PAWN_ID[k], '0', () => mkPawn(PAWNS[k].o), old);
  }
})();
