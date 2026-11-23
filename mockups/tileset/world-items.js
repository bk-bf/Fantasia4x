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

  const sword = (pommel, hilt, cross, blade) => [pommel, hilt, cross, blade];
  const knife = (hilt, collar, blade) => [hilt, collar, blade];
  const DRAWN = {
    flint_dagger: { pieces: () => knife([grip(5), 'wood'], [wrapped(2), 'cord'], [BLADE.broad(8), 'flint']) },
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
    orc_cleaver: { pieces: () => knife([wrapped(8), 'leather'], [guard(2), 'black'], [BLADE.slab(19), 'black']) }
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
