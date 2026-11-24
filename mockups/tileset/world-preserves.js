'use strict';
(() => {
  const { piece, scene, strewn, tiered, mound, held, staged } = WORLD_STACKS;

  const SMOKED_LEG = [
    '   llmmm     ',
    ' llmmmmmmd   ',
    'lmmmymmmmmdZY',
    'lmmymmmmdd   ',
    ' mmmmmddd    ',
    '  ddddd      '
  ];
  const CARVED_LEG = [
    '  LLmmmm     ',
    ' LMMLmmmmm   ',
    'LMDMLmmmmmdZY',
    'LMMMLmmmmdd  ',
    ' LLLmmmddd   ',
    '   ddddd     '
  ];
  const HUNG_LEG = [
    '  y  ',
    '  Z  ',
    ' lmd ',
    'llmdd',
    'lmmdd',
    'lmmdd',
    ' mdd '
  ];
  const RAIL = [
    'zzzzzzzzzzzzzzzzzzzzy',
    'zyyyyyyyyyyyyyyyyyyyx',
    'zx                 yx',
    'zx                 yx',
    'zx                 yx',
    'zx                 yx',
    'zx                 yx',
    'zx                 yx',
    'zx                 yx',
    'zx                 yx',
    'zx                 yx'
  ];
  const PORK_CHUNK = [
    ' LLllmm ',
    'lLlmmmmd',
    'lmmmmmdd',
    ' dddddd '
  ];
  const BRINE_TUB = [
    '  LmLlmLd  ',
    ' llllllmmd ',
    ' zzzzyyyxx ',
    'lmlmmmmdmdd',
    'lmlmmmmdmdd',
    ' zzzzyyyxx ',
    ' lmmmmmddd ',
    '  ddddddd  '
  ];
  const CROCK = [
    '   zy   ',
    ' zzzzyx ',
    'llllmmdd',
    'lmmmmmdd',
    'lmmmmmdd',
    'LLLLMMDD',
    'LMMMMMDD',
    'LMMMMDDD',
    ' DDDDDD '
  ];
  const JAM_JAR = [
    '  zzzz  ',
    ' zzyyyx ',
    '  LMMD  ',
    ' llmmmd ',
    'llmmmmdd',
    'lmmmmddd',
    ' mmdddd ',
    '  dddd  '
  ];
  const CHEESE_WHEEL = [
    '  lllllll  ',
    ' lllllllmm ',
    'lllllllmmmd',
    'lmmmmmmmmdd',
    'lmmmmmmmddd',
    ' ddddddddd '
  ];
  const SMOKED_ROUND = [
    '  lllllm ',
    ' llllLLmd',
    'lmmmLLMmd',
    'lmmmmLMdd',
    ' ddddddd '
  ];
  const LOAF = [
    '  lllmmm  ',
    ' llLlLmmd ',
    'lmmmmmmmmd',
    'lzyyyyyyxd',
    'lmmmmmmmdd',
    ' dddddddd '
  ];
  const BOARD = ['zzzzzzzzzzzzzzzyx', ' xxxxxxxxxxxxxxx '];
  const BASKET = [
    'lllllllllllllllllmmdd',
    'lmlmlmlmlmlmlmlmdmdmd',
    'mlmlmlmlmlmlmlmdmdmdd',
    ' mlmlmlmlmlmlmdmdmdd ',
    '  ddddddddddddddddd  '
  ];

  const preserve = (marks, ...draws) => staged('preserve', marks, draws);
  const LARDER = [1, 4, 12], HAMS = [1, 3, 8];
  const smoked = piece(SMOKED_LEG, { body: 'smoked', strap: 'cord', lining: 'bone' }), cured = piece(CARVED_LEG, { body: 'salami', trim: 'ham', lining: 'bone' });
  const rail = wood => piece(RAIL, { body: wood, strap: wood }), board = piece(BOARD, { body: 'wood', strap: 'wood' }), basket = piece(BASKET, { body: 'ash' });
  const hung = (wear, wood) => () => scene([0, 0, rail(wood)], ...[3, 8, 13].map((x, i) => [x, 2 + (i & 1), piece(HUNG_LEG, wear)]));
  const chunk = piece(PORK_CHUNK, { body: 'ham', trim: 'milk' }), crock = piece(CROCK, { body: 'elkhide', trim: 'dun', strap: 'elkhide' });
  const jar = piece(JAM_JAR, { body: 'jam', trim: 'cord', strap: 'linen' }), wheel = piece(CHEESE_WHEEL, { body: 'cheese', trim: 'tallow' });
  const round = piece(SMOKED_ROUND, { body: 'amber', trim: 'cheese', strap: 'amber' }), loaf = piece(LOAF, { body: 'crust', trim: 'straw', strap: 'cord' });
  const shelved = p => scene(...tiered(p, [2, 1], 0, p.h + 1), [-2, 2 * p.h + 1, board]);

  WORLD_GEAR.add({
    smoked_ham: preserve(HAMS, () => scene([0, 0, smoked]), () => strewn(smoked, [[1, 0], [0, 4]]), hung({ body: 'smoked', strap: 'cord', lining: 'bone' }, 'black')),
    cured_ham: preserve(HAMS, () => scene([0, 0, cured]), () => strewn(cured, [[0, 4], [1, 0]]), hung({ body: 'salami', strap: 'cord', lining: 'bone' }, 'wood')),
    salt_pork: preserve(LARDER, () => scene([0, 0, chunk]), () => mound(chunk, [2, 1], 2), () => scene([0, 0, piece(BRINE_TUB, { body: 'wood', trim: 'ham', strap: 'iron' })])),
    pickled_vegetables: preserve(LARDER, () => scene([0, 0, crock]), () => strewn(crock, [[7, 0], [0, 2]]), () => strewn(crock, [[4, 0], [12, 1], [0, 4], [8, 5]])),
    preserved_fruit: preserve(LARDER, () => scene([0, 0, jar]), () => strewn(jar, [[5, 0], [0, 2]]), () => shelved(jar)),
    hard_cheese: preserve(LARDER, () => scene([0, 0, wheel]), () => strewn(wheel, [[0, 6], [1, 0]]), () => scene([0, 12, wheel], [1, 6, wheel], [0, 0, wheel], [11, 13, wheel], [12, 7, wheel])),
    smoked_cheese: preserve(LARDER, () => scene([0, 0, round]), () => strewn(round, [[0, 5], [1, 0]]), () => held(tiered(round, [2, 1], 0), basket, [-2, 6])),
    marching_loaf: preserve(LARDER, () => scene([0, 0, loaf]), () => mound(loaf, [2, 1], 1), () => held(tiered(loaf, [2, 1], 1), basket, [-1, 7]))
  });
})();
