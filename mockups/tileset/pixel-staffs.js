'use strict';
const PIXEL_STAFFS = (() => {
  const { assemble, part, patch, run, stack, strip } = PX, { pole, haft } = PARTS;

  const band = n => run(-1, ['l', 'm', 'd'], n);
  const lipped = n => stack(band(n), strip(-2, 0, 1, 'l'), strip(2, 0, 1, 'd'));
  const capped = n => stack(band(n), strip(-2, n - 1, n, 'l'), strip(2, n - 1, n, 'd'));
  const BUTT = part(-1, [' ', 'm', 'd']);
  const TIP = part(-1, ['l', 'm', ' ']);
  const runes = n => run(-1, ['l', 'M', 'd'], n);

  const CLAW = patch([
    '     l  l ',
    '    lm  ml',
    '   m LM  m',
    '   mLLMM d',
    '   mMMMD d',
    '   dmMDmd ',
    '   lmddd  ',
    '  lmd     ',
    ' lmd      '
  ], [2, 8]);
  const FORK = patch([
    '   l    l ',
    '  lm   lm ',
    '  m LM  m ',
    ' m LLMM md',
    ' m MMMD m ',
    ' dm MDmd  ',
    '  lmmdd   ',
    '  lmd     ',
    ' lmd      '
  ], [2, 8]);
  const CRESCENT = patch([
    '   llll   ',
    '  lm   l  ',
    ' lm  LM   ',
    ' m  LLMM  ',
    ' m  MMMD  ',
    ' dm  MD  l',
    '  dmm  lmd',
    '   lmmmdd ',
    '  lmd     ',
    ' lmd      '
  ], [2, 9]);
  const CAP = patch([
    '    LM ',
    '   LLMM',
    '   MMMD',
    '  lmMD ',
    ' lmmd  ',
    'lmd    '
  ], [1, 5]);
  const SCEPTER = patch([
    '     LLM ',
    '    LLMMM',
    '  l LMMMD',
    ' lm MMMDD',
    ' mmm MDD ',
    'lmmmd    ',
    ' ddd     ',
    'lmd      '
  ], [1, 7]);
  const TRINITY = patch([
    '    LM     ',
    '   LLMD zy ',
    '   MMDDzyyx',
    '  l MD yyxx',
    ' lmm   xx  ',
    'lmmmm ZY   ',
    ' mmd ZZYX  ',
    'lmd   YXX  '
  ], [1, 7]);

  const quarterstaff = (shod, wood, ends) => assemble([[BUTT, shod], [capped(ends), shod], [pole(24 - 2 * ends), wood], [lipped(ends), shod], [TIP, shod]]);
  const longstaff = (shod, wood) => assemble([[BUTT, shod], [capped(3), shod], [pole(8), wood], [band(4), shod], [pole(8), wood], [lipped(3), shod], [TIP, shod]]);
  const runeBanded = () => assemble([[BUTT, 'runed'], [capped(2), 'runed'], [pole(4), 'wood'], [runes(2), 'runed', 'glow'], [pole(4), 'wood'], [runes(2), 'runed', 'glow'], [pole(4), 'wood'], [runes(2), 'runed', 'glow'], [pole(4), 'wood'], [lipped(2), 'runed'], [TIP, 'runed']]);

  const rod = (wood, shod, gem) => assemble([[BUTT, shod], [capped(2), shod], [pole(11), wood], [lipped(2), shod], [CAP, shod, gem]]);
  const clawRod = (wood, shod, gem) => assemble([[BUTT, shod], [capped(2), shod], [pole(10), wood], [CLAW, shod, gem]]);
  const scepter = (metal, glass, gem) => assemble([[BUTT, metal], [haft(4), metal], [band(2), glass], [haft(6), metal], [SCEPTER, glass, gem]]);
  const staff = (wood, head, gem) => assemble([[BUTT, wood], [pole(19), wood], [head, wood, gem]]);
  const attuned = (wood, head, gem) => assemble([[BUTT, 'gold'], [capped(2), 'gold'], [pole(12), wood], [band(2), 'gold'], [pole(2), wood], [head, 'gold', gem]]);

  return [
    { id: 'bronze_capped_staff', draw: () => quarterstaff('bronze', 'ash', 2) },
    { id: 'iron_shod_staff', draw: () => quarterstaff('iron', 'ash', 4) },
    { id: 'steel_shod_longstaff', draw: () => longstaff('steel', 'wood') },
    { id: 'rune_banded_longstaff', draw: runeBanded },
    { id: 'copper_rod', draw: () => rod('wood', 'copper', 'topaz') },
    { id: 'iron_rod', draw: () => clawRod('wood', 'iron', 'topaz') },
    { id: 'steel_rod', draw: () => clawRod('black', 'steel', 'sapphire') },
    { id: 'cinder_rod', draw: () => rod('ember', 'ember', 'ruby') },
    { id: 'hoarfrost_rod', draw: () => rod('moonwood', 'steel', 'sapphire') },
    { id: 'storm_rod', draw: () => rod('wood', 'runed', 'topaz') },
    { id: 'emberglass_scepter', draw: () => scepter('gold', 'flame', 'ruby') },
    { id: 'rimeglass_scepter', draw: () => scepter('steel', 'glow', 'sapphire') },
    { id: 'stormglass_scepter', draw: () => scepter('runed', 'gold', 'topaz') },
    { id: 'ember_staff', draw: () => staff('ember', FORK, 'ruby') },
    { id: 'pyre_staff', draw: () => attuned('ember', FORK, 'ruby') },
    { id: 'frost_staff', draw: () => staff('moonwood', CRESCENT, 'sapphire') },
    { id: 'rime_staff', draw: () => attuned('moonwood', CRESCENT, 'sapphire') },
    { id: 'spark_staff', draw: () => staff('wood', CLAW, 'topaz') },
    { id: 'tempest_staff', draw: () => attuned('wood', CLAW, 'topaz') },
    { id: 'manaforge_greatstaff', draw: () => assemble([[BUTT, 'runed'], [pole(8), 'runed'], [runes(2), 'runed', 'glow'], [pole(7), 'runed'], [TRINITY, 'gold', 'ruby', 'topaz', 'sapphire']]) }
  ];
})();
PIXEL_ICONS.push(...PIXEL_STAFFS);
