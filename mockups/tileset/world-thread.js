'use strict';
(() => {
  const { piece, scene, strewn, tiered, mound, packed, held, staged } = WORLD_STACKS;

  const SPOOL = [
    'yzzzzzx',
    ' lllmd ',
    ' mmmdd ',
    ' lllmd ',
    ' mmmdd ',
    'yyyyyxx'
  ];
  const BALL = [
    '  llmm  ',
    ' llmlmd ',
    'lmlmmdmd',
    'lmmmdmdd',
    ' mmdmdd ',
    '  dddd l'
  ];
  const SKEIN = [
    'Z     Y',
    'ZYlllYX',
    ' lLmmd ',
    ' lmLmd ',
    ' lmmLd ',
    'ZYdddYX',
    'Y     X'
  ];
  const BOBBIN = [
    'z       x',
    'zllmlmmmx',
    'zlmLmmLdx',
    'zmmmmdddx',
    'y       x'
  ];
  const HANK = [
    '  lldllld   dllldl   ',
    ' ldllldlllzyzldllldl ',
    'dllm   mdmzyzlmm  mmd',
    'lld     mmzyzld    mm',
    'dmm   mmdmzyzmmmd  md',
    ' mdmmmdmmmzyzmdmmmdm ',
    '  ddddddd xyx dddddd '
  ];
  const ROPE_COIL = [
    '   llllmmm   ',
    ' llmmlmmlmdd ',
    'lmmdlllmmdmdd',
    'lmd lmmd dmdd',
    ' mmddddddmdd ',
    '  mlmmlmddd m',
    '   dddddd  md'
  ];
  const ROPE_DRUM = [
    '   llllmmm    ',
    ' llmmlmmlmdd  ',
    'lmmdlllmmdmdd ',
    'lmd lmmd dmdd ',
    'lmmddddddmddd ',
    'dlllllmmmmmdd ',
    'ldddddddddddd ',
    'dlllllmmmmmdd ',
    'ldddddddddddd ',
    ' llllmmmmmdd m',
    '  ddddddddd md'
  ];
  const TENDONS = [
    '   z  llllllmm      ',
    '  zyllmmmmmmmlld    ',
    ' zyylllllllmmmmmdm  ',
    ' zyymmmmmmmmddddmmd ',
    '  yxddddddddd  dd  d',
    '   x                '
  ];
  const TENDON_SHEAF = [
    '    z   llllllmm     ',
    '   zyllllmmmmmlld    ',
    '  zyylmmmmllllmmmd m ',
    '  zyyllllllmmmmmddmmd',
    ' zyyymmmmmmmmdddddd d',
    ' zyyyllllllllmmmd    ',
    '  zyymmmmmmmmmmdmmd  ',
    '   yxdddddddddd  dd d',
    '    x                '
  ];
  const BASKET = [
    'lllllllllllmmdd',
    'lmlmlmlmlmdmdmd',
    'mlmlmlmlmdmdmdd',
    ' mlmlmlmdmdmdd ',
    '  ddddddddddd  '
  ];

  const MARKS = [1, 5, 15];
  const thread = (...draws) => staged('thread', MARKS, draws);
  const WICKER = { body: 'sapwood' }, basket = piece(BASKET, WICKER);
  const basketed = p => held(tiered(p, [2, 1], 2), basket, [(2 * p.w - 2 - basket.w) >> 1, Math.round(p.h * .6) + p.h - 3]);
  const spool = piece(SPOOL, { body: 'linen', strap: 'wood' }), ball = piece(BALL, { body: 'milk' }), skein = piece(SKEIN, { body: 'silk', trim: 'milk', lining: 'horn' });
  const bobbin = piece(BOBBIN, { body: 'arcane', trim: 'glow', strap: 'gold' }), hank = piece(HANK, { body: 'cord', strap: 'leather' });
  const coil = piece(ROPE_COIL, { body: 'buckskin' }), tendons = piece(TENDONS, { body: 'tallow', strap: 'leather' });

  WORLD_GEAR.add({
    thread: thread(() => scene([0, 0, spool]), () => mound(spool, [2, 1], 0), () => packed(spool, 3, 4, { body: 'wood' })),
    cotton_thread: thread(() => scene([0, 0, ball]), () => mound(ball, [2, 1], 2), () => basketed(ball)),
    spider_silk_thread: thread(() => scene([0, 0, skein]), () => mound(skein, [2, 1], 0), () => packed(skein, 2, 4, { body: 'wood' })),
    enchant_thread: thread(() => scene([0, 0, bobbin]), () => mound(bobbin, [2, 1], 2), () => packed(bobbin, 2, 5, { body: 'moonwood' })),
    cordage: thread(() => scene([0, 0, hank]), () => strewn(hank, [[3, 0], [0, 5]]), () => scene([0, 0, hank], [17, 2, hank], [3, 5, hank], [20, 7, hank], [0, 10, hank])),
    rope: thread(() => scene([0, 0, coil]), () => strewn(coil, [[0, 3], [1, 0]]), () => scene([0, 0, piece(ROPE_DRUM, { body: 'buckskin' })])),
    sinew: thread(() => scene([0, 0, tendons]), () => strewn(tendons, [[2, 0], [0, 3]]), () => scene([0, 0, piece(TENDON_SHEAF, { body: 'tallow', strap: 'leather' })]))
  });
})();
