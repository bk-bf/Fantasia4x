'use strict';
const SHEET = (() => {
  const GROUPS = ['Movement', 'Idle life', 'Work', 'Needs', 'Social', 'Combat', 'Creatures', 'World response'];
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
  const CELLS = [
    go('walk-side', 'Movement', 'Walking · sideways', 'pawn', 'woodcutter', 'walk', [1, 0], 28),
    go('walk-toward', 'Movement', 'Walking · toward', 'pawn', 'woodcutter', 'walk', [0, 1], 24),
    go('walk-away', 'Movement', 'Walking · away', 'pawn', 'woodcutter', 'walk', [0, -1], 24),
    go('walk-left', 'Movement', 'Walking · the other way', 'pawn', 'guard', 'walk', [-1, 0], 28),
    go('run', 'Movement', 'Running', 'pawn', 'hunter', 'run', [1, 0], 80),
    go('stalk', 'Movement', 'Stalking', 'pawn', 'hunter', 'stalk', [1, 0], 11),
    go('haul-side', 'Movement', 'Hauling · sideways', 'pawn', 'hauler', 'haul', [1, 0], 22),
    go('haul-toward', 'Movement', 'Hauling · toward', 'pawn', 'hauler', 'haul', [0, 1], 20),
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
    { id: 'lift', group: 'Work', label: 'Picking up', cast: [P1('pawn', 'hauler', [['act', 'idle', 1], ['act', 'lift', 2.6]], [-4, 0], { tool: null })], span: 3.6, n: 12 },
    { id: 'draw', group: 'Needs', label: 'Drawing water', cast: [P1('pawn', 'farmer', loop('draw'), [-18, 0], { tool: null })], props: [['well', 8, 1]], ground: 'dirt' },
    one('drink', 'Needs', 'Drinking', 'pawn', 'miner', 'drink'),
    one('eat', 'Needs', 'Eating', 'pawn', 'guard', 'eat', { over: { shield: null }, props: [['stool', -3, -1]] }),
    one('sleep', 'Needs', 'Sleeping', 'pawn', 'farmer', 'sleep'),
    one('tired', 'Needs', 'Tired', 'pawn', 'cook', 'tired', { over: { tool: null } }),
    one('cry', 'Needs', 'Crying', 'pawn', 'weaver', 'cry'),
    { id: 'talk', group: 'Social', label: 'Talking', cast: [P1('pawn', 'weaver', loop('talk'), [-13, 0]), P1('pawn', 'farmer', loop('listen', { flip: 1 }), [13, 0], { tool: null })] },
    one('guard', 'Combat', 'Ready stance', 'pawn', 'warlord', 'guard'),
    one('attack', 'Combat', 'Striking', 'pawn', 'warlord', 'attack', { ox: -8 }),
    one('thrust', 'Combat', 'Spear thrust', 'pawn', 'guard', 'thrust', { ox: -12 }),
    one('block', 'Combat', 'Blocking', 'pawn', 'guard', 'block'),
    { id: 'shoot', group: 'Combat', label: 'Loosing an arrow', w: 168, cast: [P1('pawn', 'hunter', loop('shoot', { to: [66, 0] }), [-52, 0])] },
    { id: 'downed', group: 'Combat', label: 'Blow, stagger, collapse', w: 128, cast: [P1('pawn', 'goblin', [['act', 'guard', 1.4], ['act', 'hit', .42], ['act', 'stagger', .9], ['act', 'fall', 1], ['act', 'down', 2.4]], [8, 0])], span: 3.72, t0: 1.4, n: 14 },
    { id: 'duel', group: 'Combat', label: 'Exchange of blows', w: 136, cast: [
      P1('pawn', 'guard', [['act', 'thrust', .8], ['act', 'guard', .2], ['act', 'block', .85], ['act', 'guard', .15]], [-17, 0]),
      P1('pawn', 'goblin', [['act', 'guard', .36, { flip: 1 }], ['act', 'hit', .42], ['act', 'guard', .22], ['act', 'attack', .85], ['act', 'guard', .15]], [17, 0])], span: 2, n: 16 },
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
    { id: 'fell', group: 'World response', label: 'Felling', w: 190, h: 140, fell: ['oak', 2, 20, -2], cast: [P1('pawn', 'woodcutter', [['act', 'idle', .8], ['act', 'chop', 3.75, { tag: 'fell' }], ['act', 'idle', 2.2], ['go', [[26, 6]], 22, 'walk'], ['act', 'lift', 1.1, { tag: 'take' }], ['go', [[-120, 6]], 22, 'haul'], ['hide', 1], ['at', [-120, 0]], ['go', [[-6, 0]], 28, 'walk']], [-6, 0])], span: 6.8, n: 20, ox: -10 },
    go('prints', 'World response', 'Prints in mud', 'pawn', 'farmer', 'walk', [1, 0], 28, { ground: 'mud', ox: 22, t0: 6 }),
    go('snow', 'World response', 'Snow prints and cold breath', 'pawn', 'guard', 'walk', [1, 0], 28, { ground: 'snow', cold: 1, ox: 22, t0: 6 }),
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
    if (cell.fell) { cell.tree = mkTreeProp(cell.fell[0], cell.fell[1], 'summer', cell.fell[2], cell.fell[3]); cell.plan = fellPlan(cell.S[0]); }
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
  function draw(cell, T, lvl, smooth, buf) {
    prep(cell);
    const W = cell.w, H = cell.h, items = castFrame(cell.S, T, lvl, smooth), lead = items[0].st;
    const camx = cell.follow ? rnd(lead.x) : 0, camy = cell.follow ? rnd(lead.y) : 0, ox = (W >> 1) + (cell.ox || 0) - camx, oy = H - 16 - camy;
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
  let root = null, figs = [], stripKey = '', seen = null;
  function mount(el, state, onPick) {
    root = el; figs = []; stripKey = '';
    const fit = w => Math.max(1, Math.min(+state.zoom, Math.floor((innerWidth - 26) / w)));
    el.innerHTML = '<section id="strip" hidden><header><h2></h2><p></p></header><div class="frames"></div></section>' + GROUPS.map(g => `<section class="grp-s"><h2>${g}</h2><div class="cells" data-g="${g}"></div></section>`).join('');
    seen = new IntersectionObserver(es => { for (const e of es) e.target._on = e.isIntersecting; }, { rootMargin: '120px' });
    for (const cell of CELLS) {
      prep(cell);
      const f = document.createElement('figure'), c = cv(cell.w, cell.h, fit(cell.w)), cap = document.createElement('figcaption');
      cap.textContent = cell.label; f.append(c, cap); f.dataset.id = cell.id; f.tabIndex = 0;
      f.addEventListener('click', () => onPick(cell.id));
      f.addEventListener('keydown', ev => { if (ev.key === 'Enter') onPick(cell.id); });
      el.querySelector(`.cells[data-g="${cell.group}"]`).append(f);
      const ctx = c.getContext('2d'), img = ctx.createImageData(cell.w, cell.h);
      figs.push({ cell, f, ctx, img, buf: new Uint32Array(img.data.buffer) });
      f._on = true; seen.observe(f);
    }
  }
  function strip(state, T) {
    const box = root.querySelector('#strip'), cell = CELLS.find(c => c.id === state.anim), on = state.frames === '1' && cell;
    box.hidden = !on;
    for (const g of figs) g.f.classList.toggle('sel', !!on && g.cell === cell);
    if (!on) { stripKey = ''; return; }
    const key = [cell.id, state.lvl, state.cad, state.zoom, state.pin ? T : ''].join('|');
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
  return { mount, frame, CELLS, draw, prep };
})();
