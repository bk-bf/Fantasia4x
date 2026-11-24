'use strict';
(() => {
  const { part, run, profile, stack, strip } = PX, { guard, shaped } = WORLD_ITEMS.parts;

  const block = (top, rows) => part(top, rows.map(r => r.padEnd(Math.max(...rows.map(x => x.length)))));
  const shaft = n => run(-1, ['m', 'd'], n);
  const thin = n => run(0, ['m'], n);
  const ring = n => run(-1, ['l', 'd'], n);
  const wrap = n => run(-1, ['lm', 'md'], n);
  const glowing = n => run(-1, ['L', 'M'], n);
  const BUTT = block(-1, ['m', 'd']);

  const HEAD = {
    leaf: n => shaped([[-2, 2, n - 3, 'l'], [-1, 0, n - 1, 'l'], [0, 0, n, 'm'], [1, 1, n - 2, 'd']]),
    narrow: n => shaped([[-1, 0, n - 1, 'l'], [0, 0, n, 'm'], [1, 1, n - 3, 'd']]),
    needle: n => shaped([[-1, 0, 2, 'l'], [0, 0, n, 'm']]),
    broad: n => shaped([[-2, 1, n - 3, 'l'], [-1, 0, n - 1, 'l'], [0, 0, n, 'm'], [1, 0, n - 2, 'd'], [2, 1, n - 4, 'd']]),
    runed: n => shaped([[-1, 0, n - 1, 'l'], [0, 0, n, 'mM'], [1, 1, n - 3, 'd']]),
    splinter: n => shaped([[-1, 0, n - 3, 'l'], [0, 0, n, 'm'], [1, 1, n - 4, 'd']])
  };
  const SOCKET = block(-1, ['ll', 'mm', 'dd']);
  const HOOK = block(-4, ['   l ', '  l  ', '  l  ', ' lmmm', 'mmmmmm', 'ddddd ']);
  const TUSK = block(-3, ['        ll', '      lll ', '  lllmmm  ', 'mmmmmmd   ', 'mmmddd    ', 'dd        ']);
  const WINGS = block(-3, ['l  ', ' l ', 'lll', 'mmm', 'ddd', ' d ', 'd  ']);
  const HALBERD = block(-5, ['  l     ', '  l     ', '   l    ', 'lllllll ', 'mmmmmmmmm', 'dddddd  ', ' dddd   ', 'mmmmm    ', 'lllll    ', 'l   l    ']);
  const GLAIVE = shaped([[-2, 4, 9, 'l'], [-1, 0, 11, 'l'], [0, 0, 11, 'mmM'], [1, 0, 10, 'm'], [2, 0, 8, 'd'], [3, 1, 5, 'd']]);
  const BANNER = block(1, ['dllllll', 'dmmLmmd', 'dmLmLmd', 'dmmLmd ', 'dmmmd  ']);
  const SNARE = block(1, [' mmm', 'm  m', 'm  m', ' mm ']);

  const GEM = block(-1, ['LM', 'MD', 'DD']);
  const CLAW = block(-2, ['l  l ', 'lLM l', 'mMMDm', 'dMD d', 'd  d ']);
  const FORK = block(-3, ['  l  l', ' l    ', 'mLM  ', 'mMMD m', 'dMD   ', ' d  d ', '  d  d']);
  const CRESCENT = block(-3, ['  lll ', ' l    ', 'm LM  ', 'mMMD  ', 'd MD  ', ' d    ', '  ddd ']);
  const CAP = block(-1, ['lLM', 'mMD', 'dDD']);
  const FLANGE = block(-2, [' l', 'll', 'mm', 'dd', ' d']);
  const TRINITY = block(-3, ['   LM ', '  LMD ', 'mm  zy', 'mm zyx', 'dd ZY ', '  ZYX ', '   XX ']);

  const bowStave = (L, depth, curl, grip) => {
    const mid = (L - 1) / 2, rows = new Map();
    const at = (band, step, glyph) => { if (!rows.has(band)) rows.set(band, new Array(L).fill(' ')); rows.get(band)[step] = glyph; };
    for (let s = 0; s < L; s++) {
      const end = Math.min(s, L - 1 - s), bend = -Math.round(depth * Math.sin(Math.PI * s / (L - 1))) + (end < curl ? curl - end : 0);
      const held = Math.abs(s - mid) <= grip;
      at(bend, s, held ? 'M' : 'l');
      at(bend + 1, s, held ? 'D' : 'd');
      if (end >= curl && bend < -1) at(0, s, 'y');
    }
    const bands = [...rows.keys()], top = Math.min(...bands), bottom = Math.max(...bands);
    return part(top, Array.from({ length: bottom - top + 1 }, (_, i) => (rows.get(top + i) || new Array(L).fill(' ')).join('')));
  };

  const prod = (reach, sweep) => {
    const rows = [];
    for (let b = -reach; b <= reach; b++) {
      const row = new Array(9).fill(' '), back = Math.round(sweep * (b / reach) ** 2);
      row[7 - back] = b < 0 ? 'l' : b > 0 ? 'd' : 'm';
      row[8 - back] = b < 0 ? 'm' : 'd';
      const pull = Math.round(Math.abs(b) / reach * (7 - sweep));
      if (Math.abs(b) > 0) for (let c = Math.round((Math.abs(b) - 1) / reach * (7 - sweep)); c <= pull; c++) if (row[c] === ' ') row[c] = 'y';
      rows.push(row.join(''));
    }
    return part(-reach, rows);
  };
  const STOCK = n => profile([[-2, 0, 5, 'l'], [-1, 0, n, 'l'], [0, 0, n, 'm'], [1, 0, 5, 'd']]);
  const crossbow = (wood, bow, metal, reach) => [[STOCK(18), wood], -9, [prod(reach, 2), bow, metal, 'string'], -9, [part(-1, ['L', 'M']), wood, metal], 8];

  const ROCK = block(-2, [' ll ', 'lmmm', 'mmmd', 'mmdd', ' dd ']);
  const POT = block(-3, ['  ll  ', ' lmmm ', 'lmmmmd', 'mmmmmd', 'mmmmdd', ' mmdd ', '  dd  ']);
  const FLAME = block(-1, ['L', 'M', 'D']);
  const AXE = block(-5, ['    l', '   ll', '  lmm', ' lmm ', 'lmmm ', 'mmmm ', 'mmmmm', 'ddddd', ' dd  ']);
  const FANG = block(-2, ['     ll', '  lllm ', 'lmmmm  ', 'mmdd   ', 'dd     ']);
  const PYRAMID = shaped([[-1, 0, 2, 'l'], [0, 0, 3, 'm'], [1, 0, 2, 'd']]);
  const FLIGHT = block(-2, ['LL ', ' L ', 'mmm', ' D ', 'DD ']);
  const LEAD = block(-1, ['ll', 'mm', 'dd']);

  const spear = (wood, len, ...head) => ({ headUp: true, pieces: () => [[BUTT, wood], [shaft(len), wood], ...head] });
  const staffDef = (pieces) => ({ headUp: true, pieces });
  const long = (wood, shod, ends, len) => [[BUTT, shod], [ring(ends), shod], [shaft(len), wood], [ring(ends), shod]];
  const rod = (wood, shod, head, gem, len) => staffDef(() => [[BUTT, shod], [ring(1), shod], [shaft(len), wood], [ring(1), shod], [head, shod, gem]]);
  const gemStaff = (wood, bind, head, gem) => staffDef(() => [[BUTT, wood], [shaft(32), wood], [head, bind, gem]]);
  const attuned = (wood, head, gem) => staffDef(() => [[BUTT, 'gold'], [ring(2), 'gold'], [shaft(24), wood], [ring(2), 'gold'], [shaft(4), wood], [head, 'gold', gem]]);
  const scepter = (metal, glass, gem) => staffDef(() => [[BUTT, metal], [shaft(10), metal], [FLANGE, glass], [CAP, metal, gem]]);
  const bow = (L, depth, curl, grip, ...inks) => ({ pieces: () => [[bowStave(L, depth, curl, grip), ...inks]] });
  const flat = pieces => ({ pieces });

  WORLD_ITEMS.add({
    stone_spear: spear('wood', 29, [wrap(3), 'cord'], [HEAD.leaf(7), 'flint']),
    bone_tipped_spear: spear('wood', 29, [wrap(3), 'hide'], [HEAD.splinter(7), 'bone']),
    copper_spear: spear('wood', 30, [SOCKET, 'copper'], [HEAD.leaf(7), 'copper']),
    bronze_socketed_spear: spear('ash', 29, [SOCKET, 'bronze'], [HEAD.narrow(8), 'bronze']),
    leaf_blade_spear: spear('ash', 27, [SOCKET, 'bronze'], [HEAD.broad(10), 'bronze']),
    goblin_hooked_spear: spear('sapwood', 29, [wrap(3), 'leather'], [HOOK, 'bronze']),
    kobold_trap_spear: spear('wood', 18, [SNARE, 'cord'], [shaft(8), 'wood'], [SOCKET, 'bronze'], [HEAD.broad(6), 'bronze']),
    great_tusk_impaler: spear('wood', 25, [wrap(4), 'red'], [TUSK, 'bone']),
    framea: spear('ash', 31, [SOCKET, 'iron'], [HEAD.narrow(6), 'iron']),
    steel_pike: spear('ash', 32, [SOCKET, 'steel'], [HEAD.needle(5), 'steel']),
    iron_winged_spear: spear('wood', 27, [SOCKET, 'iron'], [WINGS, 'iron'], [HEAD.leaf(7), 'iron']),
    steel_boar_spear: spear('wood', 18, [wrap(6), 'cord'], [shaft(4), 'wood'], [SOCKET, 'steel'], [guard(3), 'steel'], [HEAD.broad(8), 'steel']),
    steel_halberd: spear('ash', 28, [SOCKET, 'steel'], [HALBERD, 'steel']),
    rune_etched_halberd: spear('black', 28, [SOCKET, 'gold'], [HALBERD, 'runed']),
    rune_graven_spear: spear('black', 29, [SOCKET, 'gold'], [HEAD.runed(8), 'runed', 'glow']),
    rune_standard_glaive: spear('black', 12, [BANNER, 'red', 'gold'], [shaft(8), 'black'], [guard(2), 'gold'], [GLAIVE, 'runed', 'glow']),

    bronze_capped_staff: staffDef(() => long('ash', 'bronze', 2, 32)),
    iron_shod_staff: staffDef(() => long('ash', 'iron', 4, 28)),
    steel_shod_longstaff: staffDef(() => [[BUTT, 'steel'], [ring(3), 'steel'], [shaft(14), 'wood'], [ring(4), 'steel'], [shaft(14), 'wood'], [ring(3), 'steel']]),
    rune_banded_longstaff: staffDef(() => [[BUTT, 'runed'], [ring(2), 'runed'], [shaft(8), 'wood'], [glowing(2), 'runed', 'glow'], [shaft(8), 'wood'], [glowing(2), 'runed', 'glow'], [shaft(8), 'wood'], [ring(2), 'runed']]),
    copper_rod: rod('wood', 'copper', CAP, 'topaz', 14),
    iron_rod: rod('wood', 'iron', CLAW, 'topaz', 13),
    steel_rod: rod('black', 'steel', CLAW, 'sapphire', 13),
    cinder_rod: rod('ember', 'ember', CAP, 'ruby', 14),
    hoarfrost_rod: rod('moonwood', 'steel', CAP, 'sapphire', 14),
    storm_rod: rod('wood', 'runed', CAP, 'topaz', 14),
    emberglass_scepter: scepter('gold', 'flame', 'ruby'),
    rimeglass_scepter: scepter('steel', 'glow', 'sapphire'),
    stormglass_scepter: scepter('runed', 'gold', 'topaz'),
    ember_staff: gemStaff('ember', 'ember', FORK, 'ruby'),
    pyre_staff: attuned('ember', FORK, 'ruby'),
    frost_staff: gemStaff('moonwood', 'moonwood', CRESCENT, 'sapphire'),
    rime_staff: attuned('moonwood', CRESCENT, 'sapphire'),
    spark_staff: gemStaff('wood', 'wood', CLAW, 'topaz'),
    tempest_staff: attuned('wood', CLAW, 'topaz'),
    manaforge_greatstaff: staffDef(() => [[BUTT, 'runed'], [shaft(14), 'runed'], [glowing(2), 'runed', 'glow'], [shaft(14), 'runed'], [TRINITY, 'gold', 'ruby', 'topaz', 'sapphire']]),

    self_bow: bow(25, 4, 0, 1, 'ash', 'leather', 'string'),
    hunting_recurve: bow(23, 3, 2, 1, 'wood', 'cord', 'string'),
    sinew_backed_bow: bow(24, 4, 0, 1, 'wood', 'leather', 'string'),
    horn_composite_bow: bow(21, 3, 2, 1, 'horn', 'bone', 'string'),
    war_bow: bow(27, 4, 0, 1, 'wood', 'leather', 'string'),
    yew_longbow: bow(31, 4, 0, 1, 'ash', 'leather', 'string'),
    goblin_poison_bow: bow(20, 3, 2, 1, 'horn', 'leather', 'venom'),
    warren_hornbow: bow(21, 4, 2, 1, 'horn', 'red', 'string'),
    rune_strung_warbow: bow(27, 4, 0, 1, 'runed', 'gold', 'gleam'),

    composite_crossbow: flat(() => crossbow('wood', 'horn', 'bone', 6)),
    crossbow: flat(() => crossbow('wood', 'wood', 'iron', 6)),
    steel_arbalest: flat(() => crossbow('wood', 'steel', 'steel', 7)),
    siege_lock_arbalest: flat(() => crossbow('black', 'steel', 'red', 7)),
    rune_cranked_arbalest: flat(() => crossbow('black', 'runed', 'glow', 7)),

    throwing_stone: flat(() => [[ROCK, 'stone']]),
    goblin_firepot: flat(() => [[POT, 'clay'], [FLAME, 'clay', 'flame']]),
    throwing_spear: spear('ash', 13, [HEAD.narrow(5), 'flint']),
    bronze_javelin: spear('ash', 13, [HEAD.narrow(5), 'bronze']),
    pilum: spear('wood', 7, [part(-1, ['l', 'm', 'd']), 'wood'], [thin(6), 'iron'], [PYRAMID, 'iron']),
    rune_marked_javelin: spear('black', 6, [glowing(1), 'runed', 'glow'], [shaft(6), 'black'], [HEAD.runed(6), 'runed', 'glow']),
    great_fang_javelin: spear('wood', 8, [wrap(3), 'red'], [FANG, 'bone']),
    francisca: flat(() => [[shaft(8), 'wood'], [AXE, 'iron']]),
    steel_plumbata: flat(() => [[FLIGHT, 'wood', 'red'], [thin(3), 'wood'], [LEAD, 'lead'], [HEAD.needle(4), 'steel']]),
    blowgun: flat(() => [[thin(6), 'sapwood'], [ring(1), 'cord'], [thin(6), 'sapwood'], [ring(1), 'cord'], [thin(6), 'sapwood']])
  });
})();
