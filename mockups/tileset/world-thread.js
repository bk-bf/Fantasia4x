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
    ' llmm    lmmd ',
    'lm  mlzlmm  md',
    'lm  dmymdm  dd',
    ' mmdd  x mddd '
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
    ' zllmlmmm   ',
    'zylmm  lmmmd',
    'zymmlmmmd   ',
    ' xdmmmddmmd '
  ];
  const TENDON_SHEAF = [
    ' zllmlmmmmd   ',
    'zylmmmllmmmmd ',
    'zyllmm   lmmmd',
    'zymmlmmmmd    ',
    'zylmmmddmmmd  ',
    ' xdmmmdd  mmd '
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
  const coil = piece(ROPE_COIL, { body: 'buckskin' }), tendons = piece(TENDONS, { body: 'dun', strap: 'leather' });

  WORLD_GEAR.add({
    thread: thread(() => scene([0, 0, spool]), () => mound(spool, [2, 1], 0), () => packed(spool, 3, 4, { body: 'wood' })),
    cotton_thread: thread(() => scene([0, 0, ball]), () => mound(ball, [2, 1], 2), () => basketed(ball)),
    spider_silk_thread: thread(() => scene([0, 0, skein]), () => mound(skein, [2, 1], 0), () => packed(skein, 2, 4, { body: 'wood' })),
    enchant_thread: thread(() => scene([0, 0, bobbin]), () => mound(bobbin, [2, 1], 2), () => packed(bobbin, 2, 5, { body: 'moonwood' })),
    cordage: thread(() => scene([0, 0, hank]), () => strewn(hank, [[1, 0], [0, 3]]), () => strewn(hank, [[0, 9], [2, 6], [0, 3], [1, 0]])),
    rope: thread(() => scene([0, 0, coil]), () => strewn(coil, [[0, 3], [1, 0]]), () => scene([0, 0, piece(ROPE_DRUM, { body: 'buckskin' })])),
    sinew: thread(() => scene([0, 0, tendons]), () => strewn(tendons, [[2, 0], [0, 3]]), () => scene([0, 0, piece(TENDON_SHEAF, { body: 'dun', strap: 'leather' })]))
  });
})();
