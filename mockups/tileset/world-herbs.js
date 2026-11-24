'use strict';
(() => {
  const { piece, scene, strewn, tiered, mound, held, staged } = WORLD_STACKS;

  const MOSS_CLUMP = [
    '  l L l  ',
    ' lLmlmLd ',
    'lmmLmmmdd',
    ' mdmmddd '
  ];
  const MOSS_HEAP = [
    '    l L  l    ',
    '  lLmlmLmlLm  ',
    ' lmmLmmmLmmmd ',
    'lmLmmmdmmLmmdd'
  ];
  const TAPROOT = [
    ' L          ',
    'LMllmmm     ',
    ' LMlmmmmmdd ',
    'L  mmdddd dd'
  ];
  const SILVER_LEAVES = [
    '  ll   LL ',
    ' lmmd LMMD',
    'lmmmdLMMD ',
    ' mddzyMD  ',
    '   zy     '
  ];
  const MANDRAKE = [
    '  L L  ',
    '  LML  ',
    '  lmd  ',
    ' llmmd ',
    'lmmmmdd',
    '  mmd  ',
    ' lm md ',
    ' m   d '
  ];
  const EMBER_FLOWER = [
    '       l l ',
    '  z   lLLmd',
    'zzyyyylLMLd',
    '  x   mmLdd',
    '       d d '
  ];
  const GLOWCAPS = [
    '  llmm    ',
    ' lLlmmd   ',
    'lmmmmmdd l',
    '  zyx  lmd',
    '  zyx   y ',
    '  zyx   y '
  ];
  const BOLETE = [
    '  llmmm  ',
    ' lmmmmmd ',
    'lmmmmmmdd',
    '  zzyx   ',
    '  zyyx   ',
    ' zzyyxx  ',
    '  zyxO   '
  ];
  const MOREL = [
    '   lm   ',
    '  lmdm  ',
    ' lmdmdd ',
    ' mdlmdd ',
    ' lmdmdd ',
    '  mddd  ',
    '   zy   ',
    '   zx   '
  ];
  const PUFFBALL = [
    ' Z   Z  ',
    '   Z    ',
    '  llmm  ',
    ' llmOmd ',
    'lmmmmmdd',
    'lmmmmddd',
    ' mmddd  '
  ];
  const MASH_BOWL = [
    '   LL L   ',
    '  LMLLMD  ',
    'llllllmmdd',
    ' lmmmmmdd ',
    '  mmmddd  '
  ];
  const MASH_TUB = [
    'z   L  L    x',
    'zyLMLLMLMDDyx',
    ' lllllllmmdd ',
    ' zzzzyyyyyxx ',
    ' lmlmmmmdmdd ',
    '  ddddddddd  '
  ];
  const MASH_VAT = [
    '    L  LL  L   ',
    '  LLMLMLLMLMD  ',
    ' llllllllllmmd ',
    ' zzzzzyyyyyyxx ',
    'lmlmmlmmmdmmdmd',
    'lmlmmlmmmdmmdmd',
    ' zzzzzyyyyyyxx ',
    'lmlmmlmmmdmmdmd',
    ' zzzzzyyyyyyxx ',
    ' lmmlmmmdmmddd ',
    '  ddddddddddd  '
  ];
  const POWDER_TWIST = [
    '  LL   ',
    ' LMLD  ',
    'llmmmdd',
    ' ddddd '
  ];
  const POWDER_DISH = [
    '    L     ',
    '  LLMLD   ',
    ' LMLMMLD  ',
    'zzzzzyyyxx',
    ' zyyyyyxx ',
    '  xxxxxx  '
  ];
  const POWDER_JAR = [
    '   ww   ',
    '  zzyx  ',
    ' zLLMMx ',
    'zLMLMMDx',
    'zLMMLMDx',
    'zMMLMMDx',
    'zMMMMDDx',
    ' yxxxxx '
  ];
  const TRUG = [
    'lllllllllllllmmd',
    'lmlmlmlmlmlmdmdd',
    ' mlmlmlmlmdmdmd ',
    '  dddddddddddd  '
  ];

  const MARKS = [1, 5, 20], BREW = [2, 8, 24];
  const herb = (marks, ...draws) => staged('herb', marks, draws);
  const trug = piece(TRUG, { body: 'ash' });
  const gathered = (p, fan, lap) => herb(MARKS, () => scene([0, 0, p]), () => strewn(p, fan), () => held(tiered(p, [2, 1], lap), trug, [(2 * p.w - lap - trug.w) >> 1, Math.round(p.h * .6) + p.h - 2]));
  const MOSS = { body: 'sage', trim: 'pickle' }, moss = piece(MOSS_CLUMP, MOSS);
  const MASH = { body: 'wood', trim: 'straw', strap: 'iron' }, CATALYST = { body: 'linen', trim: 'amethyst', strap: 'glass' };

  WORLD_GEAR.add({
    sphagnum_moss: herb(MARKS, () => scene([0, 0, moss]), () => mound(moss, [2, 1], 3), () => held([[1, 0, piece(MOSS_HEAP, MOSS)]], trug, [0, 3])),
    bloodroot: gathered(piece(TAPROOT, { body: 'blood', trim: 'leaf' }), [[0, 0], [2, 3]], 4),
    dreamleaf: gathered(piece(SILVER_LEAVES, { body: 'calm', trim: 'silver', strap: 'sage' }), [[0, 0], [5, 2]], 3),
    mandrake: gathered(piece(MANDRAKE, { body: 'dun', trim: 'leaf' }), [[0, 0], [6, 1]], 1),
    emberbloom: gathered(piece(EMBER_FLOWER, { body: 'red', trim: 'flame', strap: 'kale' }), [[0, 0], [2, 3]], 4),
    glowcap: gathered(piece(GLOWCAPS, { body: 'glow', trim: 'milk', strap: 'moonwood' }), [[0, 0], [7, 1]], 3),
    nightshade_bolete: gathered(piece(BOLETE, { body: 'arcane', trim: 'black', strap: 'plume' }), [[0, 0], [7, 1]], 2),
    witch_morel: gathered(piece(MOREL, { body: 'elkhide', strap: 'bone' }), [[0, 0], [6, 1]], 2),
    spore_of_madness: gathered(piece(PUFFBALL, { body: 'wolfpelt', trim: 'black', lining: 'string' }), [[0, 0], [6, 1]], 2),
    fermented_mash: herb(BREW, () => scene([0, 0, piece(MASH_BOWL, { body: 'clay', trim: 'straw' })]), () => scene([0, 0, piece(MASH_TUB, MASH)]), () => scene([0, 0, piece(MASH_VAT, MASH)])),
    purified_catalyst: herb(BREW, () => scene([0, 0, piece(POWDER_TWIST, CATALYST)]), () => scene([0, 0, piece(POWDER_DISH, CATALYST)]), () => scene([0, 0, piece(POWDER_JAR, { body: 'cord', trim: 'amethyst', strap: 'glass' })]))
  });
})();
