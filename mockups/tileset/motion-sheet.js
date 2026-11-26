'use strict';
const SHEET = (() => {
  const GROUPS = ['Movement', 'Carrying', 'Idle life', 'Work', 'Needs', 'Social', 'Combat', 'Creatures', 'World response', 'Composed folk'];
  const TILES = {}, TW = 256, TH = 128;
  const GKIND = { grass: 'grass', dirt: 'soft', mud: 'soft', tilled: 'soft', sand: 'soft', snow: 'snow', water: 'water' };
  const groundFn = {
    grass: () => GROUND[G.tall_grass].f, dirt: () => GROUND[G.dirt].f, mud: () => GROUND[G.mud].f, tilled: () => GROUND[G.tilled].f, sand: () => GROUND[G.riverbank].f,
    snow: () => (x, y) => rp(P.snow, .62 + (fbm(x * .018, y * .018, 21, 2) - .5) * 1.2 + (noise(x * .05, y * .08, 25) - .5) * .5, x, y, .3),
  };
  function tile(kind) {
    if (TILES[kind]) return TILES[kind];
    SEASON = 'summer';
    const f = groundFn[kind](), px = new Uint32Array(TW * TH), rgb = new Array(TW * TH);
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) { const c = f(x + 300, y + 200); rgb[y * TW + x] = c; px[y * TW + x] = pack(c); }
    return TILES[kind] = { px, rgb };
  }
  const P1 = (rig, kind, steps, at, over, opt) => ({ rig, kind, steps, at: at || [0, 0], over, opt });
  const loop = (anim, o) => [['act', anim, 9999, o]];
  const one = (id, group, label, rig, kind, anim, x) => ({ id, group, label, cast: [P1(rig, kind, loop(anim))], ...(x || {}) });
  const go = (id, group, label, rig, kind, anim, dir, v, x) => ({ id, group, label, follow: 1, cast: [P1(rig, kind, [['run', dir, v, anim]])], ...(x || {}) });
  const BARE = { tool: null, shield: null }, PACE = { hip: 26, chest: 17, low: 11.5, shoulder: 13, game: 11.5, drape: 11.5 }, BEARER = { hip: 'weaver', chest: 'cook', low: 'woodcutter', shoulder: 'hauler', game: 'hauler', drape: 'woodcutter' };
  const OWN = { hip: 'bone_stock', chest: 'wild_berries', low: 'granite_block', shoulder: 'pine_log', game: 'harpy_carcass', drape: 'carried_pawn' }, FIXED = ['drape'];
  const HOLD_NAMES = { hip: 'at the hip', chest: 'in front', low: 'low in front', shoulder: 'on one shoulder', game: 'game on one shoulder', drape: 'draped over one shoulder' };
  const WAYS = [['side', 'sideways', [1, 0]], ['toward', 'toward', [0, 1]], ['away', 'away', [0, -1]], ['left', 'the other way', [-1, 0]]];
  const haul = (id, label, kind, hold, dir, load, x) => go(id, 'Carrying', label, 'pawn', kind, HOLDS[hold][0], dir, PACE[hold], { over: BARE, loads: [load], hold, w: 120, h: 108, ...(x || {}) });
  const carries = hold => WAYS.map(([way, text, dir]) => haul(HOLDS[hold][0] + '-' + way, PAWN_ANIMS[HOLDS[hold][0]].label + ' · ' + text, way === 'left' && hold !== 'shoulder' ? 'smith' : BEARER[hold], hold, dir, OWN[hold], { pick: FIXED.includes(hold) ? 0 : 1 }));
  const stood = (id, label, face) => ({ id, group: 'Carrying', label, w: 296, h: 108, pick: 1, loads: HAUL.HOLDS.map(h => OWN[h]), fixed: HAUL.HOLDS.map(h => FIXED.includes(h)), cast: HAUL.HOLDS.map((h, i) => P1('pawn', BEARER[h], loop(HOLDS[h][1], { face }), [(i - 2.5) * 48, 0], BARE)) });
  const ARMS = [['one', 'sword and shield', 'warlord', null], ['two', 'spear in two hands', 'guard', { shield: null }], ['bow', 'bow', 'hunter', null]];
  const DRILL = { stands: .4, guards: .8, tick: .1 };
  const drill = (family, face) => { const m = HAUL.STANCES[family]; return [['act', m.carry + 'Stand', DRILL.stands, { face }], ['act', m.draw, PAWN_ANIMS[m.draw].dur, { face }], ['act', m.ready, DRILL.guards, { face }], ['act', m.stow, PAWN_ANIMS[m.stow].dur, { face }]]; };
  const drilled = family => { const m = HAUL.STANCES[family], span = DRILL.stands + PAWN_ANIMS[m.draw].dur + DRILL.guards + PAWN_ANIMS[m.stow].dur; return { span, n: Math.round(span / DRILL.tick) }; };
  const HANDLED = { lifts: 1.5, holds: 1.2, drops: 1.9, tick: .1 };
  const handled = face => [['act', 'lift', HANDLED.lifts, { face }], ['act', 'held', HANDLED.holds, { face }], ['act', 'drop', HANDLED.drops, { face }]];
  const handling = { span: HANDLED.lifts + HANDLED.holds + HANDLED.drops, n: Math.round((HANDLED.lifts + HANDLED.holds + HANDLED.drops) / HANDLED.tick) };
  const armed = ([family, text, kind, over]) => [
    { id: 'arms-' + family, group: 'Combat', label: 'Weapon carry to ready · ' + text, w: 176, h: 124, ...drilled(family), t0: 18 / PACE.hip, cast: [P1('pawn', kind, [['go', [[18, 0]], PACE.hip, HAUL.STANCES[family].carry], ...drill(family, 's'), ['at', [-30, 0]]], [-30, 0], over)] },
    { id: 'arms-' + family + '-fb', group: 'Combat', label: 'Weapon carry to ready · ' + text + ' · toward and away', w: 200, h: 124, ...drilled(family), cast: [P1('pawn', kind, drill(family, 'f'), [-48, 0], over), P1('pawn', kind, drill(family, 'b'), [48, -2], over)] },
  ];
  const CELLS = [
    go('walk-side', 'Movement', 'Walking · sideways', 'pawn', 'woodcutter', 'walk', [1, 0], 28),
    go('walk-toward', 'Movement', 'Walking · toward', 'pawn', 'woodcutter', 'walk', [0, 1], 24),
    go('walk-away', 'Movement', 'Walking · away', 'pawn', 'woodcutter', 'walk', [0, -1], 24),
    go('walk-left', 'Movement', 'Walking · the other way', 'pawn', 'guard', 'walk', [-1, 0], 28),
    go('run', 'Movement', 'Running', 'pawn', 'hunter', 'run', [1, 0], 80),
    go('stalk', 'Movement', 'Stalking', 'pawn', 'hunter', 'stalk', [1, 0], 11),
    ...HAUL.HOLDS.flatMap(carries),
    stood('carry-stand', 'Standing with a load', 's'), stood('carry-stand-fb', 'Standing with a load · toward', 'f'), stood('carry-stand-b', 'Standing with a load · away', 'b'),
    go('panic', 'Movement', 'Panicking', 'pawn', 'weaver', 'panic', [1, 0], 66),
    one('idle', 'Idle life', 'Standing', 'pawn', 'farmer', 'idle', { face: 'f' }),
    one('idle-mage', 'Idle life', 'Standing · cloak and long hair', 'pawn', 'mage', 'idle', { face: 'f' }),
    one('look', 'Idle life', 'Keeping watch', 'pawn', 'guard', 'look', { face: 'f' }),
    one('sit', 'Idle life', 'Sitting', 'pawn', 'weaver', 'sit', { props: [['stool', -3, -1]] }),
    one('warm', 'Idle life', 'Warming hands', 'pawn', 'watch', 'warm', { over: { tool: null }, props: [['stool', -3, -1], ['campfire', 24, 2]], ox: -10 }),
    { id: 'chop', group: 'Work', label: 'Woodcutting', h: 132, cast: [P1('pawn', 'woodcutter', loop('chop'), [-16, 0])], props: [['tree:oak', 12, -2]] },
    { id: 'mine', group: 'Work', label: 'Mining', cast: [P1('pawn', 'miner', loop('mine'), [-16, 0])], props: [['rock:boulder', 13, -1]], ground: 'dirt' },
    one('hoe', 'Work', 'Planting', 'pawn', 'farmer', 'hoe', { ground: 'tilled', ox: -8 }),
    { id: 'hammer', group: 'Work', label: 'Metalworking', cast: [P1('pawn', 'smith', loop('hammer'), [-12, 0])], props: [['anvil', 10, 3]], ground: 'dirt' },
    { id: 'stir', group: 'Work', label: 'Cooking', cast: [P1('pawn', 'cook', loop('stir'), [-14, 0], { tool: null })], props: [['campfire', 9, 3]], ground: 'dirt', smoke: [9, -18] },
    one('gather', 'Work', 'Foraging', 'pawn', 'weaver', 'gather', { ox: -6 }),
    { id: 'lift', group: 'Work', label: 'Picking up and setting down', w: 152, h: 108, pick: 1, loads: [OWN.shoulder], cast: [P1('pawn', 'hauler', handled('s'), [-22, 0], BARE)], ...handling },
    { id: 'chop-fb', group: 'Work', label: 'Woodcutting · toward and away', w: 136, cast: [P1('pawn', 'woodcutter', loop('chop', { face: 'f' }), [-30, 0]), P1('pawn', 'woodcutter', loop('chop', { face: 'b' }), [30, -2])] },
    { id: 'mine-fb', group: 'Work', label: 'Mining · toward and away', w: 136, h: 96, below: 20, cast: [P1('pawn', 'miner', loop('mine', { face: 'f' }), [-30, 0]), P1('pawn', 'miner', loop('mine', { face: 'b' }), [30, -2])] },
    { id: 'hoe-fb', group: 'Work', label: 'Planting · toward and away', w: 136, ground: 'tilled', cast: [P1('pawn', 'farmer', loop('hoe', { face: 'f' }), [-30, 0]), P1('pawn', 'farmer', loop('hoe', { face: 'b' }), [30, -2])] },
    { id: 'hammer-fb', group: 'Work', label: 'Metalworking · toward and away', w: 136, cast: [P1('pawn', 'smith', loop('hammer', { face: 'f' }), [-30, 0]), P1('pawn', 'smith', loop('hammer', { face: 'b' }), [30, -2])] },
    { id: 'stir-fb', group: 'Work', label: 'Cooking · toward and away', w: 136, cast: [P1('pawn', 'cook', loop('stir', { face: 'f' }), [-30, 0], { tool: null }), P1('pawn', 'cook', loop('stir', { face: 'b' }), [30, -2], { tool: null })] },
    { id: 'gather-fb', group: 'Work', label: 'Foraging · toward and away', w: 136, cast: [P1('pawn', 'weaver', loop('gather', { face: 'f' }), [-30, 0]), P1('pawn', 'weaver', loop('gather', { face: 'b' }), [30, -2])] },
    { id: 'lift-fb', group: 'Work', label: 'Picking up and setting down · toward and away', w: 184, h: 116, below: 24, pick: 1, loads: [OWN.shoulder, OWN.shoulder], ...handling, cast: [P1('pawn', 'hauler', handled('f'), [-44, 0], BARE), P1('pawn', 'hauler', handled('b'), [44, -2], BARE)] },
    { id: 'draw', group: 'Needs', label: 'Drawing water', cast: [P1('pawn', 'farmer', loop('draw'), [-18, 0], { tool: null })], props: [['well', 8, 1]], ground: 'dirt' },
    one('drink', 'Needs', 'Drinking', 'pawn', 'miner', 'drink'),
    one('eat', 'Needs', 'Eating', 'pawn', 'guard', 'eat', { over: { shield: null }, props: [['stool', -3, -1]] }),
    { id: 'draw-fb', group: 'Needs', label: 'Drawing water · toward and away', w: 136, cast: [P1('pawn', 'farmer', loop('draw', { face: 'f' }), [-30, 0], { tool: null }), P1('pawn', 'farmer', loop('draw', { face: 'b' }), [30, -2], { tool: null })] },
    { id: 'drink-fb', group: 'Needs', label: 'Drinking · toward and away', w: 136, cast: [P1('pawn', 'miner', loop('drink', { face: 'f' }), [-30, 0]), P1('pawn', 'miner', loop('drink', { face: 'b' }), [30, -2])] },
    { id: 'eat-fb', group: 'Needs', label: 'Eating · toward and away', w: 136, cast: [P1('pawn', 'guard', loop('eat', { face: 'f' }), [-30, 0], { shield: null }), P1('pawn', 'guard', loop('eat', { face: 'b' }), [30, -2], { shield: null })] },
    one('sleep', 'Needs', 'Sleeping', 'pawn', 'farmer', 'sleep'),
    one('out', 'Needs', 'Unconscious', 'pawn', 'farmer', 'out', { ox: 4 }),
    { id: 'out-folk', group: 'Needs', label: 'Unconscious · other folk', w: 204, h: 124, cast: [P1('pawn', 'guard', loop('out'), [-62, -38]), P1('pawn', 'smith', loop('out', { flip: 1 }), [2, -38]), P1('pawn', 'mage', loop('out'), [66, -38]), P1('pawn', 'hauler', loop('out', { flip: 1 }), [-62, 0]), P1('pawn', 'goblin', loop('out'), [0, 0]), P1('pawn', 'gnoll', loop('out', { flip: 1 }), [62, 0])] },
    one('tired', 'Needs', 'Tired', 'pawn', 'cook', 'tired', { over: { tool: null } }),
    one('cry', 'Needs', 'Crying', 'pawn', 'weaver', 'cry'),
    { id: 'talk', group: 'Social', label: 'Talking', cast: [P1('pawn', 'weaver', loop('talk'), [-13, 0]), P1('pawn', 'farmer', loop('listen', { flip: 1 }), [13, 0], { tool: null })] },
    ...ARMS.flatMap(armed),
    one('guard', 'Combat', 'Ready stance', 'pawn', 'warlord', 'guard'),
    one('attack', 'Combat', 'Striking', 'pawn', 'warlord', 'attack', { ox: -8 }),
    one('thrust', 'Combat', 'Spear thrust', 'pawn', 'guard', 'thrust', { ox: -12 }),
    one('block', 'Combat', 'Blocking', 'pawn', 'guard', 'block'),
    { id: 'shoot', group: 'Combat', label: 'Loosing an arrow', w: 168, cast: [P1('pawn', 'hunter', loop('shoot', { to: [66, 0] }), [-52, 0])] },
    { id: 'downed', group: 'Combat', label: 'Blow, stagger, collapse', w: 128, cast: [P1('pawn', 'goblin', [['act', 'guard', 1.4], ['act', 'hit', .42], ['act', 'stagger', .9], ['act', 'fall', 1], ['act', 'down', 2.4]], [8, 0])], span: 3.72, t0: 1.4, n: 14 },
    { id: 'duel', group: 'Combat', label: 'Exchange of blows', w: 136, cast: [
      P1('pawn', 'guard', [['act', 'thrust', .8], ['act', 'guard', .2], ['act', 'block', .85], ['act', 'guard', .15]], [-17, 0]),
      P1('pawn', 'goblin', [['act', 'guard', .36, { flip: 1 }], ['act', 'hit', .42], ['act', 'guard', .22], ['act', 'attack', .85], ['act', 'guard', .15]], [17, 0])], span: 2, n: 16 },
    { id: 'guard-fb', group: 'Combat', label: 'Ready stance · toward and away', w: 136, cast: [P1('pawn', 'warlord', loop('guard', { face: 'f' }), [-30, 0]), P1('pawn', 'warlord', loop('guard', { face: 'b' }), [30, -2])] },
    { id: 'attack-fb', group: 'Combat', label: 'Striking · toward and away', w: 136, cast: [P1('pawn', 'warlord', loop('attack', { face: 'f' }), [-30, 0]), P1('pawn', 'warlord', loop('attack', { face: 'b' }), [30, -2])] },
    { id: 'thrust-fb', group: 'Combat', label: 'Spear thrust · toward and away', w: 136, h: 108, below: 32, cast: [P1('pawn', 'guard', loop('thrust', { face: 'f' }), [-30, 0]), P1('pawn', 'guard', loop('thrust', { face: 'b' }), [30, -2])] },
    { id: 'block-fb', group: 'Combat', label: 'Blocking · toward and away', w: 136, cast: [P1('pawn', 'guard', loop('block', { face: 'f' }), [-30, 0]), P1('pawn', 'guard', loop('block', { face: 'b' }), [30, -2])] },
    { id: 'shoot-fb', group: 'Combat', label: 'Loosing an arrow · toward and away', w: 136, h: 120, cast: [P1('pawn', 'hunter', loop('shoot', { face: 'f', to: [-30, 70] }), [-30, -20]), P1('pawn', 'hunter', loop('shoot', { face: 'b', to: [30, -90] }), [30, -2])] },
    { id: 'downed-fb', group: 'Combat', label: 'Blow, stagger, collapse · toward and away', w: 136, span: 3.72, t0: 1.4, n: 14, cast: [P1('pawn', 'goblin', [['act', 'guard', 1.4, { face: 'f' }], ['act', 'hit', .42, { face: 'f' }], ['act', 'stagger', .9, { face: 'f' }], ['act', 'fall', 1, { face: 'f' }], ['act', 'down', 2.4, { face: 'f' }]], [-30, 0]), P1('pawn', 'goblin', [['act', 'guard', 1.4, { face: 'b' }], ['act', 'hit', .42, { face: 'b' }], ['act', 'stagger', .9, { face: 'b' }], ['act', 'fall', 1, { face: 'b' }], ['act', 'down', 2.4, { face: 'b' }]], [30, -2])] },
    go('wolf-walk', 'Creatures', 'Grey Wolf · walk', 'quad', 'wolf', 'walk', [1, 0], 24),
    go('wolf-trot', 'Creatures', 'Grey Wolf · trot', 'quad', 'wolf', 'trot', [1, 0], 58),
    go('wolf-run', 'Creatures', 'Grey Wolf · run', 'quad', 'wolf', 'run', [1, 0], 150),
    go('wolf-toward', 'Creatures', 'Grey Wolf · toward', 'quad', 'wolf', 'trot', [0, 1], 44),
    go('wolf-away', 'Creatures', 'Grey Wolf · away', 'quad', 'wolf', 'trot', [0, -1], 44),
    go('wolf-stalk', 'Creatures', 'Grey Wolf · stalking low', 'quad', 'wolf', 'stalk', [1, 0], 12),
    one('wolf-sniff', 'Creatures', 'Grey Wolf · scenting', 'quad', 'wolf', 'sniff'),
    one('wolf-howl', 'Creatures', 'Grey Wolf · howling', 'quad', 'wolf', 'howl'),
    one('wolf-sit', 'Creatures', 'Grey Wolf · sitting', 'quad', 'wolf', 'sit'),
    one('wolf-rest', 'Creatures', 'Grey Wolf · lying down', 'quad', 'wolf', 'rest'),
    one('wolf-bite', 'Creatures', 'Grey Wolf · lunging bite', 'quad', 'wolf', 'bite', { ox: -8 }),
    one('wolf-shake', 'Creatures', 'Grey Wolf · shaking off rain', 'quad', 'wolf', 'shake'),
    { id: 'wolf-fall', group: 'Creatures', label: 'Grey Wolf · blow and fall', cast: [P1('quad', 'wolf', [['act', 'idle', 1.2], ['act', 'hit', .45], ['act', 'fall', .9], ['act', 'down', 2.2]])], span: 2.4, t0: 1.2, n: 12 },
    one('deer-graze', 'Creatures', 'Red Deer · grazing', 'quad', 'deer', 'graze', { h: 104 }),
    { id: 'deer-alert', group: 'Creatures', label: 'Red Deer · startled', h: 104, cast: [P1('quad', 'deer', [['act', 'graze', 2.6], ['act', 'alert', 1.6], ['act', 'watch', 1.6]])], span: 2.4, t0: 2.4, n: 12 },
    go('deer-run', 'Creatures', 'Red Deer · run', 'quad', 'deer', 'run', [1, 0], 180, { h: 104, w: 136 }),
    go('deer-north', 'Creatures', 'Red Deer · away', 'quad', 'deer', 'walk', [0, -1], 22, { h: 104 }),
    go('bear-walk', 'Creatures', 'Brown Bear · walk', 'quad', 'bear', 'walk', [1, 0], 20),
    go('deer-toward', 'Creatures', 'Red Deer · toward', 'quad', 'deer', 'walk', [0, 1], 19, { h: 104 }),
    go('elk-toward', 'Creatures', 'Woodland Elk · toward', 'quad', 'elk', 'walk', [0, 1], 22, { h: 112 }),
    go('elk-away', 'Creatures', 'Woodland Elk · away', 'quad', 'elk', 'walk', [0, -1], 22, { h: 112 }),
    go('bear-toward', 'Creatures', 'Brown Bear · toward', 'quad', 'bear', 'walk', [0, 1], 10, { h: 92 }),
    go('bear-away', 'Creatures', 'Brown Bear · away', 'quad', 'bear', 'walk', [0, -1], 10, { h: 92 }),
    go('boar-toward', 'Creatures', 'Wild Boar · toward', 'quad', 'boar', 'walk', [0, 1], 9, { h: 92 }),
    go('boar-away', 'Creatures', 'Wild Boar · away', 'quad', 'boar', 'walk', [0, -1], 9, { h: 92 }),
    go('ox-toward', 'Creatures', 'Wild Ox · toward', 'quad', 'ox', 'walk', [0, 1], 13, { h: 92 }),
    go('ox-away', 'Creatures', 'Wild Ox · away', 'quad', 'ox', 'walk', [0, -1], 13, { h: 92 }),
    go('mammoth-toward', 'Creatures', 'Bull Mammoth · toward', 'quad', 'mammoth', 'walk', [0, 1], 18, { h: 112 }),
    go('mammoth-away', 'Creatures', 'Bull Mammoth · away', 'quad', 'mammoth', 'walk', [0, -1], 18, { h: 112 }),
    go('sabre-toward', 'Creatures', 'Sabretooth Cat · toward', 'quad', 'sabre', 'walk', [0, 1], 12, { h: 92 }),
    go('sabre-away', 'Creatures', 'Sabretooth Cat · away', 'quad', 'sabre', 'walk', [0, -1], 12, { h: 92 }),
    go('bighorn-toward', 'Creatures', 'Bighorn · toward', 'quad', 'bighorn', 'walk', [0, 1], 12, { h: 92 }),
    go('bighorn-away', 'Creatures', 'Bighorn · away', 'quad', 'bighorn', 'walk', [0, -1], 12, { h: 92 }),
    go('jackal-toward', 'Creatures', 'Golden Jackal · toward', 'quad', 'jackal', 'walk', [0, 1], 12, { h: 92 }),
    go('jackal-away', 'Creatures', 'Golden Jackal · away', 'quad', 'jackal', 'walk', [0, -1], 12, { h: 92 }),
    go('fawn-toward', 'Creatures', 'Fawn · toward', 'quad', 'fawn', 'walk', [0, 1], 12, { h: 92 }),
    go('fawn-away', 'Creatures', 'Fawn · away', 'quad', 'fawn', 'walk', [0, -1], 12, { h: 92 }),
    go('packox-toward', 'Creatures', 'Pack Ox · toward', 'quad', 'packox', 'walk', [0, 1], 13, { h: 92 }),
    go('packox-away', 'Creatures', 'Pack Ox · away', 'quad', 'packox', 'walk', [0, -1], 13, { h: 92 }),
    go('owlbear-toward', 'Creatures', 'Tawny Owlbear · toward', 'quad', 'owlbear', 'walk', [0, 1], 10, { h: 96 }),
    go('owlbear-away', 'Creatures', 'Tawny Owlbear · away', 'quad', 'owlbear', 'walk', [0, -1], 10, { h: 96 }),
    go('boar-trot', 'Creatures', 'Wild Boar · trot', 'quad', 'boar', 'trot', [1, 0], 44),
    one('ox-cud', 'Creatures', 'Pack Ox · chewing', 'quad', 'packox', 'cud', { w: 128 }),
    go('fowl-walk', 'Creatures', 'Junglefowl · walk', 'fowl', 'fowl', 'walk', [1, 0], 13),
    one('fowl-peck', 'Creatures', 'Junglefowl · pecking', 'fowl', 'fowl', 'peck', { ground: 'dirt' }),
    go('rabbit-hop', 'Creatures', 'Cottontail · hopping', 'rabbit', 'rabbit', 'hop', [1, 0], 40),
    one('rabbit-up', 'Creatures', 'Cottontail · sitting up', 'rabbit', 'rabbit', 'up'),
    go('rat-go', 'Creatures', 'Plague Rat · scurrying', 'critter', 'rat', 'walk', [1, 0], 30, { ground: 'dirt' }),
    one('rat-idle', 'Creatures', 'Plague Rat · idle', 'critter', 'rat', 'idle', { ground: 'dirt' }),
    one('rat-attack', 'Creatures', 'Plague Rat · biting', 'critter', 'rat', 'attack', { ground: 'dirt', ox: -8 }),
    { id: 'rat-death', group: 'Creatures', label: 'Plague Rat · death', ground: 'dirt', cast: [P1('critter', 'rat', [['act', 'idle', 1], ['act', 'fall', 0.8], ['act', 'down', 2.4]])], span: 1.3, t0: .9, n: 10 },
    go('croaker-go', 'Creatures', 'Bog Croaker · hopping', 'critter', 'croaker', 'walk', [1, 0], 22, { ground: 'mud' }),
    one('croaker-idle', 'Creatures', 'Bog Croaker · idle', 'critter', 'croaker', 'idle', { ground: 'mud' }),
    one('croaker-attack', 'Creatures', 'Bog Croaker · tongue lash', 'critter', 'croaker', 'attack', { ground: 'mud', ox: -8 }),
    { id: 'croaker-death', group: 'Creatures', label: 'Bog Croaker · death', ground: 'mud', cast: [P1('critter', 'croaker', [['act', 'idle', 1], ['act', 'fall', 0.9], ['act', 'down', 2.4]])], span: 1.4, t0: .9, n: 10 },
    go('spider-go', 'Creatures', 'Bramble Weaver · skittering', 'critter', 'spider', 'walk', [1, 0], 20, { ground: 'dirt' }),
    one('spider-idle', 'Creatures', 'Bramble Weaver · idle', 'critter', 'spider', 'idle', { ground: 'dirt' }),
    one('spider-attack', 'Creatures', 'Bramble Weaver · rearing bite', 'critter', 'spider', 'attack', { ground: 'dirt', ox: -8 }),
    { id: 'spider-death', group: 'Creatures', label: 'Bramble Weaver · death', ground: 'dirt', cast: [P1('critter', 'spider', [['act', 'idle', 1], ['act', 'fall', 0.9], ['act', 'down', 2.4]])], span: 1.4, t0: .9, n: 10 },
    go('adder-go', 'Creatures', 'Fen Adder · slithering', 'critter', 'adder', 'walk', [1, 0], 16, { ground: 'grass' }),
    one('adder-idle', 'Creatures', 'Fen Adder · idle', 'critter', 'adder', 'idle', { ground: 'grass' }),
    one('adder-attack', 'Creatures', 'Fen Adder · striking', 'critter', 'adder', 'attack', { ground: 'grass', ox: -8 }),
    { id: 'adder-death', group: 'Creatures', label: 'Fen Adder · death', ground: 'grass', cast: [P1('critter', 'adder', [['act', 'idle', 1], ['act', 'fall', 1], ['act', 'down', 2.4]])], span: 1.5, t0: .9, n: 10 },
    go('ooze-go', 'Creatures', 'Bog Ooze · creeping', 'critter', 'ooze', 'walk', [1, 0], 8, { ground: 'mud' }),
    one('ooze-idle', 'Creatures', 'Bog Ooze · idle', 'critter', 'ooze', 'idle', { ground: 'mud' }),
    one('ooze-attack', 'Creatures', 'Bog Ooze · engulfing', 'critter', 'ooze', 'attack', { ground: 'mud', ox: -8 }),
    { id: 'ooze-death', group: 'Creatures', label: 'Bog Ooze · death', ground: 'mud', cast: [P1('critter', 'ooze', [['act', 'idle', 1], ['act', 'fall', 1.4], ['act', 'down', 2.4]])], span: 1.9, t0: .9, n: 10 },
    go('shade-go', 'Creatures', 'Grave Shade · drifting', 'critter', 'shade', 'walk', [1, 0], 14, { ground: 'dirt' }),
    one('shade-idle', 'Creatures', 'Grave Shade · idle', 'critter', 'shade', 'idle', { ground: 'dirt' }),
    one('shade-attack', 'Creatures', 'Grave Shade · reaching', 'critter', 'shade', 'attack', { ground: 'dirt', ox: -8 }),
    { id: 'shade-death', group: 'Creatures', label: 'Grave Shade · death', ground: 'dirt', cast: [P1('critter', 'shade', [['act', 'idle', 1], ['act', 'fall', 1.4], ['act', 'down', 2.4]])], span: 1.9, t0: .9, n: 10 },
    go('stirge-go', 'Creatures', 'Fen Stirge · flapping', 'critter', 'stirge', 'walk', [1, 0], 40, { ground: 'mud', h: 124 }),
    one('stirge-idle', 'Creatures', 'Fen Stirge · idle', 'critter', 'stirge', 'idle', { ground: 'mud', h: 124 }),
    one('stirge-attack', 'Creatures', 'Fen Stirge · darting', 'critter', 'stirge', 'attack', { ground: 'mud', ox: -8, h: 124 }),
    { id: 'stirge-death', group: 'Creatures', label: 'Fen Stirge · death', ground: 'mud', h: 124, cast: [P1('critter', 'stirge', [['act', 'idle', 1], ['act', 'fall', 0.9], ['act', 'down', 2.4]])], span: 1.4, t0: .9, n: 10 },
    { id: 'fell', group: 'World response', label: 'Felling', w: 190, h: 140, loads: [OWN.shoulder], fell: ['oak', 2, 20, -2], cast: [P1('pawn', 'woodcutter', [['act', 'idle', .8], ['act', 'chop', 3.75, { tag: 'fell' }], ['act', 'idle', 2.2], ['go', [[26, 6]], 22, 'walk'], ['act', 'lift', 1.1, { tag: 'take' }], ['go', [[-120, 6]], PACE.shoulder, 'haul'], ['hide', 1], ['at', [-120, 0]], ['go', [[-6, 0]], 28, 'walk']], [-6, 0])], span: 6.8, n: 20, ox: -10 },
    { id: 'fall-tree', group: 'World response', label: 'Felled tree falling', w: 190, h: 140, loads: [OWN.shoulder], fell: ['oak', 2, 20, -2], cast: [P1('pawn', 'woodcutter', [['act', 'idle', .8], ['act', 'chop', 3.75, { tag: 'fell' }], ['act', 'idle', 2.2], ['go', [[26, 6]], 22, 'walk'], ['act', 'lift', 1.1, { tag: 'take' }], ['go', [[-120, 6]], PACE.shoulder, 'haul'], ['hide', 1], ['at', [-120, 0]], ['go', [[-6, 0]], 28, 'walk']], [-6, 0])], fallOnly: 1, ox: -10 },
    go('prints', 'World response', 'Prints in mud', 'pawn', 'farmer', 'walk', [1, 0], 28, { ground: 'mud', ox: 22, t0: 6 }),
    go('snow', 'World response', 'Snow prints and cold breath', 'pawn', 'guard', 'walk', [1, 0], 28, { ground: 'snow', cold: 1, ox: 16, t0: 6 }),
    go('shallows', 'World response', 'Wading the shallows', 'pawn', 'hunter', 'walk', [1, 0], 24, { ground: 'water', ox: 14, t0: 6 }),
    go('dust', 'World response', 'Dust underfoot', 'pawn', 'hauler', 'run', [1, 0], 80, { ground: 'dirt', over: { tool: null }, ox: 22, t0: 6 }),
    go('grass', 'World response', 'Grass parting', 'quad', 'boar', 'trot', [1, 0], 44, { ox: 10, t0: 6 }),
    go('torch', 'World response', 'Carried torch', 'pawn', 'watch', 'walk', [1, 0], 28),
  ];
  const propSpr = name => { const [k, v] = name.split(':'); return k === 'tree' ? tree(v, 1, 'summer') : k === 'rock' ? rock(v, 1, 'summer') : build(k); };
  function prep(cell) {
    if (cell.S) return cell;
    SEASON = 'summer';
    cell.S = cell.cast.map(c => script(mkActor(c.rig, c.kind, c.over || cell.over), c.at, c.steps, c.opt));
    if (cell.face) for (const S of cell.S) for (const st of S.steps) if (st.type === 'act') st.face = cell.face;
    cell.P = (cell.props || []).map(([n, x, y]) => ({ s: propSpr(n), x, y }));
    cell.w = cell.w || 112; cell.h = cell.h || 92; cell.ground = cell.ground || 'grass';
    if (cell.fell) { cell.tree = mkTreeProp(cell.fell[0], cell.fell[1], 'summer', cell.fell[2], cell.fell[3]); cell.plan = fellPlan(cell.S[0]);  if (cell.fallOnly) { cell.t0 = cell.plan.fallAt + .3; cell.span = .9; cell.n = 12; } }
    const S0 = cell.S[0], last = S0.steps[S0.steps.length - 1], def = animOf(S0.A, last.anim), cd = cycleDist(S0.A, def);
    if (!cell.span) { cell.span = cd ? cd / (last.v || 30) : def.dur; cell.n = def.n || 6; cell.cyc = 1; }
    return cell;
  }
  function blit(buf, W, H, s, x0, y0) {
    const pk = s.pk || packSpr(s), c32 = pk.c32;
    for (let j = 0; j < s.h; j++) { const Y = y0 + j; if (Y < 0 || Y >= H || pk.rb[j] <= pk.ra[j]) continue; for (let i = pk.ra[j]; i < pk.rb[j]; i++) { const c = c32[j * s.w + i], X = x0 + i; if (c && X >= 0 && X < W) buf[Y * W + X] = c; } }
  }
  function shadow(buf, W, H, s, cx, cy) {
    const sh = s.sh; if (!sh) return;
    const mx = cx + sh.dx, my = cy + sh.dy;
    for (let y = Math.floor(my - sh.ry); y <= my + sh.ry; y++) for (let x = Math.floor(mx - sh.rx); x <= mx + sh.rx; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const nx = (x - mx) / sh.rx, ny = (y - my) / sh.ry, q = nx * nx + ny * ny;
      if (q >= 1 || clamp((1 - q) * 3.2, 0, 1) <= dith(x, y) * .7 + .15) continue;
      const c = buf[y * W + x];
      buf[y * W + x] = (0xff000000 | (((c >> 16 & 255) * .68) << 16) | (((c >> 8 & 255) * .56) << 8) | ((c & 255) * .56)) >>> 0;
    }
  }
  let picked = '';
  const loadOf = (cell, i) => MOTION_LOAD.get((cell.pick && !(cell.fixed && cell.fixed[i]) && picked) || cell.loads[i] || cell.loads[0]);
  function draw(cell, T, lvl, smooth, buf) {
    prep(cell);
    if (cell.loads) cell.S.forEach((S, i) => { S.A.load = loadOf(cell, i); });
    const W = cell.w, H = cell.h, items = castFrame(cell.S, T, lvl, smooth), lead = items[0].st;
    const camx = cell.follow ? rnd(lead.x) : 0, camy = cell.follow ? rnd(lead.y) : 0, ox = (W >> 1) + (cell.ox || 0) - camx, oy = H - (cell.below || 16) - camy;
    if (cell.ground === 'water') { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) buf[y * W + x] = pack(waterCol(x - ox + 900, y - oy + 400, 1, T * 2.1, 0)); }
    else { const tl = tile(cell.ground).px; for (let y = 0; y < H; y++) { const ty = ((y - oy) % TH + TH) % TH; for (let x = 0; x < W; x++) buf[y * W + x] = tl[ty * TW + (((x - ox) % TW) + TW) % TW]; } }
    const kind = GKIND[cell.ground], rgb = cell.ground === 'water' ? null : tile(cell.ground).rgb;
    const pen = { put(x, y, c) { const X = rnd(x) + ox, Y = rnd(y) + oy; if (X >= 0 && Y >= 0 && X < W && Y < H) buf[Y * W + X] = pack(c); }, ground: () => kind, under: rgb ? (x, y) => rgb[(((rnd(y)) % TH + TH) % TH) * TW + ((rnd(x) % TW) + TW) % TW] : null };
    castGround(pen, items, T, lvl);
    const list = [];
    for (const p of cell.P) list.push({ s: p.s.frames ? p.s.frames[Math.floor(T * 6) % p.s.frames.length] : p.s, x: p.x, y: p.y });
    let bursts = [];
    if (cell.tree) { const ts = treeState(cell.tree, cell.plan, T, lvl, smooth); for (const p of ts.parts) list.push(p); bursts = ts.bursts; }
    for (const it of items) if (it.fr) list.push({ s: it.fr.s, x: it.x, y: it.y });
    list.sort((a, b) => (a.top ? 1e6 : a.y) - (b.top ? 1e6 : b.y));
    for (const o of list) shadow(buf, W, H, o.s, o.x + ox, o.y + oy);
    for (const o of list) blit(buf, W, H, o.s, o.x + ox - o.s.ax, o.y + oy - o.s.ay);
    for (const b of bursts) MOTION_FX.burst(pen, ...b);
    if (cell.smoke && lvl > 2) MOTION_FX.smoke(pen, cell.smoke[0], cell.smoke[1], T);
    castFx(pen, items, T, lvl, { cold: cell.cold });
    return items.length + cell.P.length;
  }

  const cv = (w, h, z) => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.style.width = w * z + 'px'; c.style.height = h * z + 'px'; return c; };
  let root = null, figs = [], stripKey = '', seen = null, samples = null, cast = null;
  const sampled = () => samples || (samples = HAUL.BULKS.flatMap(b => MOTION_LOAD.dozen(b).map(l => haul('sample-' + l.id, l.name, BEARER[l.hold], l.hold, [1, 0], l.id, { group: 'bulk-' + b, w: 96, h: 104, sample: l.id }))));
  function bulkBlocks() {
    const tally = MOTION_LOAD.tally();
    return HAUL.BULKS.map(b => `<h3>${b[0].toUpperCase() + b.slice(1)} · ${tally[b].count} items<small>${MOTION_LOAD.NOTES[b]}</small></h3><p class="counts">${Object.entries(tally[b].storage).sort((x, y) => y[1] - x[1]).map(([k, n]) => `<span><b>${n}</b>${HAUL.nameOf(k)}</span>`).join('')}</p><div class="cells" data-g="bulk-${b}"></div>`).join('');
  }
  const optionOf = l => { const o = document.createElement('option'); o.value = l.id; o.textContent = l.name + ' · ' + HAUL.nameOf(l.storage); return o; };
  function shown() {
    const sel = root.querySelector('#load');
    if (picked && ![...sel.options].some(o => o.value === picked)) sel.append(optionOf(MOTION_LOAD.get(picked)));
    sel.value = picked;
    marks();
  }
  function loadBar(onLoad) {
    const sel = root.querySelector('#load'), own = document.createElement('option');
    own.value = ''; own.textContent = 'Each carry with its own sample'; sel.append(own);
    for (const g of MOTION_LOAD.picker()) { const og = document.createElement('optgroup'); og.label = g.bulk; og.append(...g.loads.map(optionOf)); sel.append(og); }
    sel.addEventListener('change', () => onLoad(sel.value));
    shown();
  }
  function marks() {
    const l = picked && MOTION_LOAD.get(picked);
    root.querySelector('#loadnote').textContent = l ? `${l.name} · ${HAUL.nameOf(l.storage)} · ${l.bulk}, ${HOLD_NAMES[l.hold]}` : '';
    for (const g of figs) g.f.classList.toggle('off', !!(l && g.cell.pick && g.cell.hold && g.cell.hold !== l.hold));
  }
  function setLoad(id) { picked = MOTION_LOAD.get(id) ? id : ''; stripKey = ''; if (root) shown(); }
  function mount(el, state, onPick, onLoad) {
    root = el; figs = []; stripKey = ''; picked = MOTION_LOAD.get(state.load) ? state.load : '';
    const fit = w => Math.max(1, Math.min(+state.zoom, Math.floor((innerWidth - 26) / w)));
    const extra = g => g === 'Carrying' ? ['<label class="loadbar">Carried <select id="load"></select><output id="loadnote"></output></label>', '<div class="bulks">' + bulkBlocks() + '</div>'] : ['', ''];
    el.innerHTML = '<section id="strip" hidden><header><h2></h2><p></p></header><div class="frames"></div></section>' + GROUPS.map(g => `<section class="grp-s"><h2>${g}</h2>${extra(g)[0]}<div class="cells" data-g="${g}"></div>${extra(g)[1]}</section>`).join('');
    seen = new IntersectionObserver(es => { for (const e of es) e.target._on = e.isIntersecting; }, { rootMargin: '120px' });
    if (!cast) cast = { pieces: LOOK_STYLE.pieces, seeds: SEEDS };
    else if (cast.pieces !== LOOK_STYLE.pieces) { cast.pieces = LOOK_STYLE.pieces; SEEDS = cast.seeds; for (const cell of [...CELLS, ...sampled()]) cell.S = null; }
    for (const cell of [...CELLS, ...sampled()]) {
      prep(cell);
      const f = document.createElement('figure'), c = cv(cell.w, cell.h, fit(cell.w)), cap = document.createElement('figcaption'), act = () => cell.sample ? onLoad(cell.sample) : onPick(cell.id);
      cap.textContent = cell.label; f.append(c, cap); f.dataset.id = cell.id; f.tabIndex = 0;
      f.addEventListener('click', act);
      f.addEventListener('keydown', ev => { if (ev.key === 'Enter') act(); });
      el.querySelector(`.cells[data-g="${cell.group}"]`).append(f);
      const ctx = c.getContext('2d'), img = ctx.createImageData(cell.w, cell.h);
      figs.push({ cell, f, ctx, img, buf: new Uint32Array(img.data.buffer) });
      f._on = true; seen.observe(f);
    }
    loadBar(onLoad);
  }
  function strip(state, T) {
    const box = root.querySelector('#strip'), cell = CELLS.find(c => c.id === state.anim), on = state.frames === '1' && cell;
    box.hidden = !on;
    for (const g of figs) g.f.classList.toggle('sel', !!on && g.cell === cell);
    if (!on) { stripKey = ''; return; }
    const key = [cell.id, state.lvl, state.cad, state.zoom, state.folk, picked, state.pin ? T : ''].join('|');
    if (key === stripKey) return;
    stripKey = key;
    const smooth = state.cad === 'smooth', n = cell.n * (smooth && cell.cyc ? 3 : 1), t0 = cell.t0 || 0, z = Math.max(1, Math.min(Math.max(2, +state.zoom), Math.floor((innerWidth - 26) / cell.w))), row = box.querySelector('.frames');
    box.querySelector('h2').textContent = cell.label;
    box.querySelector('p').textContent = `${n} frames · ${(cell.span).toFixed(2)} s at 1x`;
    row.textContent = '';
    for (let i = 0; i < n; i++) {
      const c = cv(cell.w, cell.h, z), ctx = c.getContext('2d'), img = ctx.createImageData(cell.w, cell.h), fig = document.createElement('figure'), cap = document.createElement('figcaption');
      draw(cell, t0 + (i + .5) / n * cell.span, +state.lvl, smooth, new Uint32Array(img.data.buffer));
      ctx.putImageData(img, 0, 0); cap.textContent = i + 1; fig.append(c, cap); row.append(fig);
    }
  }
  function frame(state, T) {
    let actors = 0;
    const lvl = +state.lvl, smooth = state.cad === 'smooth';
    for (const g of figs) { if (!g.f._on) continue; actors += draw(g.cell, T, lvl, smooth, g.buf); g.ctx.putImageData(g.img, 0, 0); }
    strip(state, T);
    return actors;
  }
  return { mount, frame, setLoad, CELLS, draw, prep };
})();
