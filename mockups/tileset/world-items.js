'use strict';
const WORLD_ITEMS = (() => {
  const { part, run, profile, assemble, outline } = PX;
  const SLOPE = 4;
  const AXIS = {
    handleUp: () => (step, band) => [Math.floor(step / SLOPE) + band, step],
    headUp: L => (step, band) => [Math.floor((L - 1 - step) / SLOPE) + band, L - 1 - step],
    flat: () => (step, band) => [step, Math.floor(step / SLOPE) + band],
    headBelow: () => (step, band) => [step, Math.floor(step / SLOPE) - band]
  };

  const POMMEL = {
    dot: part(-1, ['m', 'd']),
    block: part(-2, ['ll', 'lm', 'md', 'dd']),
    wheel: part(-2, [' l ', 'lmm', 'mmd', ' d ']),
    ring: part(-2, [' l ', 'l m', 'm d', ' d ']),
    jewel: part(-2, [' l ', 'lMm', 'mMd', ' d ']),
    disc: part(-3, ['l', 'l', 'm', 'm', 'd', 'd'])
  };
  const grip = n => run(-1, ['mm', 'dd'], n);
  const wrapped = n => run(-1, ['lm', 'md'], n);
  const third = (band, reach) => band < -reach / 3 ? 'l' : band >= reach / 3 ? 'd' : 'm';
  const guard = reach => part(-reach, Array.from({ length: reach * 2 }, (_, i) => third(i - reach + .5, reach)));

  const shaped = spans => profile(spans.filter(span => span[2] > span[1]));
  const BLADE = {
    straight: n => shaped([[-2, 0, n - 3, 'l'], [-1, 0, n - 1, 'l'], [0, 0, n, 'm'], [1, 0, n - 2, 'd']]),
    runed: n => shaped([[-2, 0, n - 3, 'l'], [-1, 0, n - 1, 'mmL'], [0, 0, n, 'm'], [1, 0, n - 2, 'd']]),
    leaf: n => shaped([[-3, 6, n - 7, 'l'], [-2, 2, n - 4, 'l'], [-1, 0, n - 1, 'l'], [0, 0, n, 'm'], [1, 2, n - 4, 'm'], [2, 6, n - 7, 'd']]),
    broad: n => shaped([[-3, 1, n - 3, 'l'], [-2, 0, n - 2, 'l'], [-1, 0, n - 1, 'm'], [0, 0, n, 'm'], [1, 0, n - 2, 'm'], [2, 1, n - 3, 'd']]),
    fullered: (n, fuller) => shaped([[-3, 1, n - 3, 'l'], [-2, 0, n - 2, 'l'], [-1, 0, n - 1, 'm'], [0, 0, n, 'm'], [-1, 1, fuller, 'd'], [1, 0, n - 2, 'm'], [2, 1, n - 3, 'd']]),
    seax: n => shaped([[-2, 0, n - 5, 'd'], [-1, 0, n - 3, 'm'], [0, 0, n - 1, 'm'], [1, 0, n, 'l']]),
    needle: n => shaped([[-1, 0, n - 1, 'l'], [0, 0, n, 'm']]),
    spike: (n, stout) => shaped([[-2, 0, stout, 'l'], [-1, 0, n - 1, 'l'], [0, 0, n, 'm'], [1, 0, stout, 'd']]),
    jagged: n => shaped([[-3, 2, n - 4, 'l  '], [-2, 0, n - 2, 'l'], [-1, 0, n - 1, 'm'], [0, 0, n, 'd'], [1, 0, n - 2, 'm'], [2, 2, n - 4, 'd  ']]),
    slab: n => shaped([[-6, 3, n - 2, 'l'], [-5, 2, n - 1, 'l'], [-4, 1, n, 'm'], [-3, 0, n, 'm'], [-2, 0, n, 'm'], [-1, 0, n, 'd'], [0, 0, n - 1, 'd'], [1, 0, n - 2, 'd']])
  };

  const BLADES = {
    greatLeaf: n => shaped([[-4, 9, n - 9, 'l'], [-3, 4, n - 6, 'l'], [-2, 1, n - 3, 'l'], [-1, 0, n - 1, 'l'], [0, 0, n, 'm'], [1, 1, n - 3, 'm'], [2, 4, n - 6, 'd'], [3, 9, n - 9, 'd']]),
    verse: (n, fuller) => shaped([[-3, 1, n - 3, 'l'], [-2, 0, n - 2, 'l'], [-1, 0, n - 1, 'm'], [0, 0, n, 'm'], [-1, 1, fuller, 'DL'], [1, 0, n - 2, 'm'], [2, 1, n - 3, 'd']]),
    splinter: n => shaped([[-2, 1, 4, 'l'], [-1, 0, n - 3, 'l'], [0, 0, n, 'm'], [1, 0, n - 5, 'd']]),
    triangle: n => shaped([[-2, 0, n - 7, 'l'], [-1, 0, n - 3, 'l'], [0, 0, n, 'm'], [1, 0, n - 3, 'd'], [2, 0, n - 7, 'd']]),
    scrap: n => shaped([[-2, 1, 3, 'l'], [-2, 5, 7, 'l'], [-1, 0, n - 2, 'l'], [0, 0, n, 'm'], [0, n - 5, n - 1, 'L'], [1, 0, n - 4, 'd'], [1, n - 7, n - 4, 'M']]),
    slotted: n => shaped([[-1, 0, n - 1, 'l'], [0, 0, n, 'm'], [-1, 1, n - 4, 'L'], [1, 0, 5, 'd']]),
    rapier: n => shaped([[-1, 0, n - 1, 'l'], [0, 0, n, 'm'], [1, 0, 4, 'd']]),
    runeNeedle: n => shaped([[-1, 0, n - 1, 'LLM'], [0, 0, n, 'm'], [1, 0, 4, 'd']]),
    leafPoint: n => shaped([[-2, 0, n - 8, 'l'], [-1, 0, n - 1, 'l'], [0, 0, n, 'm'], [1, 0, n - 8, 'd']])
  };
  function curved(n, root, bend) {
    const centre = i => bend * (i / n) ** 2, half = i => root * (1 - (i / n) ** 1.6);
    const tone = (b, i) => b < centre(i) - half(i) / 3 ? 'l' : b > centre(i) + half(i) / 3 ? 'd' : 'm';
    const bands = Array.from({ length: Math.ceil(root + bend) + Math.ceil(root) + 1 }, (_, k) => k - Math.ceil(root));
    const cell = (b, i) => Math.abs(b - centre(i)) <= half(i) + .25 ? tone(b, i) : ' ';
    return part(bands[0], bands.map(b => Array.from({ length: n }, (_, i) => cell(b, i)).join('')));
  }
  const bevel = (k, depth) => k >= depth - 2 ? 'l' : k <= 1 ? 'd' : 'm';
  const chopper = (n, depth, from, to, extras) => shaped([
    ...Array.from({ length: depth }, (_, k) => [1 - k, from(k), to(k), bevel(k, depth)]),
    ...(extras || [])
  ]);
  const clip = (k, n, teeth) => n - Math.max(0, teeth - k);
  const CHOPPER = {
    butcher: (n, depth) => chopper(n, depth, () => 0, k => k === depth - 1 ? n - 1 : n, [[-3, n - 4, n - 2, '.'], [-4, n - 4, n - 2, '.']]),
    flared: (n, depth) => chopper(n, depth, k => Math.max(0, k - 3), k => k === depth - 1 ? n - 1 : n),
    falchion: (n, depth, extras) => chopper(n, depth, k => Math.max(0, k - 2), k => clip(k, n, 3), extras),
    toothed: (n, depth) => CHOPPER.falchion(n, depth, [[1 - depth, 4, n, 'l.'], [3 - depth, 2, n - 1, 'mmM']]),
    jaw: (n, depth) => chopper(n, depth, k => Math.max(0, 2 * (k - depth + 3)), k => n - Math.max(0, 2 * (k - depth + 3)), [[-depth, 3, n - 3, 'L  '], [1 - depth, 3, n - 3, 'M']]),
    rolled: (n, depth) => chopper(n, depth, () => 0, () => n, [[1, 0, n, 'D'], [0, 0, n, 'L']]),
    fanged: (n, depth) => chopper(n, depth, k => Math.max(0, 2 * (k - 5)), k => clip(k, n, 2), [[2 - depth, 2, n - 1, 'MM '], [3 - depth, 2, n - 1, ' D ']])
  };
  const ferrule = part(-1, ['l', 'd']);
  const punchHilt = part(-3, ['lllll', ' M  m', ' M  m', ' M  m', ' D  d', 'ddddd']);
  const buttPlate = part(-3, ['l ', 'll', 'Lm', 'mm', 'Lm', 'dd']);
  const bowed = (n, bow) => shaped([[-1, 0, n, 'MM'], [0, 0, n, 'DD'], [bow, 1, n, 'ml'], ...Array.from({ length: bow }, (_, i) => [i + 1, 0, 1, 'm'])]);
  const swept = (reach, bow) => part(-reach, Array.from({ length: reach + bow + 1 }, (_, i) => third(i - reach, reach + 1)));

  const sword = (pommel, hilt, cross, blade) => [pommel, hilt, cross, blade];
  const knife = (hilt, collar, blade) => [hilt, collar, blade];
  const DRAWN = {
    copper_dagger: { pieces: () => sword([POMMEL.dot, 'bone'], [wrapped(4), 'bone'], [guard(3), 'copper'], [BLADE.leaf(10), 'copper']) },
    iron_rondel: { pieces: () => sword([POMMEL.disc, 'iron'], [grip(5), 'wood'], [POMMEL.disc, 'iron'], [BLADE.spike(11, 5), 'iron']) },
    steel_stiletto: { pieces: () => sword([POMMEL.dot, 'steel'], [wrapped(5), 'leather'], [guard(3), 'steel'], [BLADE.needle(13), 'steel']) },
    short_seax: { pieces: () => knife([wrapped(7), 'wood'], [guard(2), 'iron'], [BLADE.seax(14), 'iron']) },
    copper_shortsword: { pieces: () => sword([POMMEL.block, 'copper'], [grip(5), 'wood'], [guard(4), 'copper'], [BLADE.broad(15), 'copper']) },
    bronze_leaf_sword: { pieces: () => sword([POMMEL.wheel, 'bronze'], [wrapped(5), 'bronze'], [guard(3), 'bronze'], [BLADE.leaf(19), 'bronze']) },
    spatha: { pieces: () => sword([POMMEL.block, 'bone'], [grip(5), 'wood'], [guard(3), 'iron'], [BLADE.straight(22), 'iron']) },
    steel_longsword: { pieces: () => sword([POMMEL.wheel, 'steel'], [wrapped(6), 'leather'], [guard(5), 'steel'], [BLADE.straight(24), 'steel']) },
    steel_greatsword: { pieces: () => sword([POMMEL.wheel, 'steel'], [wrapped(9), 'leather'], [guard(6), 'steel'], [BLADE.fullered(24, 14), 'steel']) },
    rune_etched_arming_sword: { pieces: () => sword([POMMEL.jewel, 'gold', 'sapphire'], [wrapped(6), 'wool'], [guard(5), 'gold'], [BLADE.runed(22), 'runed', 'glow']) },
    gravemaker: { pieces: () => sword([POMMEL.ring, 'black'], [wrapped(8), 'red'], [guard(5), 'black'], [BLADE.jagged(24), 'black']) },
    orc_cleaver: { pieces: () => knife([wrapped(8), 'leather'], [guard(2), 'black'], [BLADE.slab(19), 'black']) },
    iron_greatsword: { pieces: () => sword([POMMEL.block, 'iron'], [wrapped(8), 'leather'], [guard(6), 'iron'], [BLADE.broad(25), 'iron']) },
    bronze_great_leaf_sword: { pieces: () => sword([POMMEL.wheel, 'bronze'], [wrapped(7), 'bronze'], [guard(3), 'bronze'], [BLADES.greatLeaf(25), 'bronze']) },
    rune_sung_greatsword: { pieces: () => sword([POMMEL.jewel, 'gold', 'ruby'], [wrapped(9), 'wool'], [guard(6), 'gold'], [BLADES.verse(24, 19), 'runed', 'glow']) },
    fang_reaver: { pieces: () => knife([grip(11), 'wood'], [wrapped(3), 'hide'], [curved(16, 2.6, 3), 'bone']) },
    bone_knife: { pieces: () => knife([grip(3), 'bone'], [wrapped(3), 'hide'], [BLADES.splinter(9), 'bone']) },
    bronze_punch_dagger: { pieces: () => knife([punchHilt, 'bronze', 'bone'], [part(-1, ['m', 'm']), 'bronze'], [BLADES.triangle(9), 'bronze']) },
    goblin_shank: { pieces: () => knife([wrapped(6), 'leather'], [part(-1, ['d', 'd']), 'iron'], [BLADES.scrap(9), 'iron', 'sapwood']) },
    great_fang_dirk: { pieces: () => knife([wrapped(5), 'leather'], [part(-1, ['d', 'd']), 'bone'], [curved(11, 2, 2), 'bone']) },
    rune_slotted_stiletto: { pieces: () => sword([POMMEL.dot, 'runed'], [grip(5), 'black'], [guard(3), 'runed'], [BLADES.slotted(13), 'runed', 'glow']) },
    steel_rapier: { pieces: () => sword([POMMEL.wheel, 'steel'], [bowed(6, 4), 'steel', 'leather'], [swept(4, 4), 'steel'], [BLADES.rapier(25), 'steel']) },
    warren_needle: { pieces: () => sword([POMMEL.dot, 'iron'], [bowed(6, 4), 'copper', 'hide'], [swept(2, 4), 'copper'], [BLADES.rapier(24), 'iron']) },
    iron_estoc: { pieces: () => sword([POMMEL.wheel, 'iron'], [wrapped(7), 'leather'], [guard(4), 'iron'], [BLADE.spike(23, 19), 'iron']) },
    bronze_rapier: { pieces: () => sword([POMMEL.dot, 'bronze'], [grip(5), 'wood'], [buttPlate, 'bronze', 'copper'], [BLADES.leafPoint(21), 'bronze']) },
    rune_needle_rapier: { pieces: () => sword([POMMEL.jewel, 'gold', 'sapphire'], [bowed(6, 4), 'gold', 'wool'], [swept(4, 4), 'gold'], [BLADES.runeNeedle(25), 'runed', 'glow']) },
    bronze_cleaver: { pieces: () => knife([wrapped(7), 'wood'], [ferrule, 'bronze'], [CHOPPER.flared(12, 8), 'bronze']) },
    iron_cleaver: { pieces: () => knife([wrapped(7), 'wood'], [ferrule, 'iron'], [CHOPPER.butcher(13, 8), 'iron']) },
    steel_cleaver: { pieces: () => sword([POMMEL.dot, 'steel'], [grip(6), 'leather'], [guard(2), 'steel'], [CHOPPER.falchion(15, 7), 'steel']) },
    rune_toothed_cleaver: { pieces: () => sword([POMMEL.dot, 'runed'], [grip(6), 'black'], [guard(2), 'runed'], [CHOPPER.toothed(15, 7), 'runed', 'glow']) },
    gnoll_bone_cleaver: { pieces: () => knife([wrapped(7), 'hide'], [ferrule, 'bone'], [CHOPPER.jaw(16, 8), 'bone', 'flint']) },
    flenser: { pieces: () => knife([wrapped(14), 'leather'], [ferrule, 'steel'], [CHOPPER.rolled(20, 10), 'iron', 'steel']) },
    bronze_greatcleaver: { pieces: () => knife([grip(15), 'wood'], [ferrule, 'bronze'], [CHOPPER.flared(18, 10), 'bronze']) },
    iron_greatcleaver: { pieces: () => knife([grip(15), 'wood'], [ferrule, 'iron'], [CHOPPER.butcher(18, 10), 'iron']) },
    steel_greatcleaver: { pieces: () => sword([POMMEL.block, 'steel'], [wrapped(12), 'leather'], [guard(3), 'steel'], [CHOPPER.falchion(19, 10), 'steel']) },
    rune_fanged_greatcleaver: { pieces: () => sword([POMMEL.jewel, 'gold', 'ruby'], [wrapped(12), 'black'], [guard(3), 'gold'], [CHOPPER.fanged(19, 10), 'runed', 'glow']) }
  };

  const lengthOf = pieces => pieces.reduce((n, piece) => n + (typeof piece === 'number' ? piece : piece[0].len), 0);
  function axisFor(def, pose, L) {
    if (pose === 'lean') return def.headUp ? AXIS.headUp(L) : AXIS.handleUp(L);
    return def.headBelow ? AXIS.headBelow(L) : AXIS.flat(L);
  }
  function cells(id, pose) {
    const def = DRAWN[id], pieces = def.pieces(), L = lengthOf(pieces);
    return { L, cells: [...outline(assemble(pieces, undefined, axisFor(def, pose, L))).values()] };
  }

  const add = drawings => Object.assign(DRAWN, drawings);
  return { has: id => id in DRAWN, ids: () => Object.keys(DRAWN), cells, add, parts: { POMMEL, BLADE, grip, wrapped, guard, shaped } };
})();
