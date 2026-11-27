'use strict';
(() => {
  const { piece, scene, strewn, tiered, mound, packed, held, staged } = WORLD_STACKS;

  const PARCEL = [
    'lllylmd',
    'lmmymdd',
    'yyyyyyx',
    'lmmymdd',
    'dddxddd'
  ];
  const SALVED_PAD = [
    '   LLML   ',
    ' llLMMLmm ',
    'lmmmmmmmdd',
    ' dddddddd '
  ];
  const SEALED_ROLL = [
    '   lllLmmm   ',
    '  lmdlLmmmd  ',
    'zzldmlLmmmdyx',
    '   mmdDddd   '
  ];
  const SALVE_POT = [
    '  zzzz  ',
    ' zyyyyx ',
    '  lLmd  ',
    ' llLmmd ',
    ' lmmmdd ',
    '  mddd  '
  ];
  const BALM_TIN = [
    '  LLMMD      ',
    ' lMLMMDd     ',
    ' lllmmdd zyx ',
    '  mmddd zyyxx'
  ];
  const SURGEON_ROLL = [
    '   z  z     ',
    '   y  y  LLM',
    ' lllllllLMMD',
    'llmommomLMDd',
    'lmmommommmdd',
    ' dddddddddd '
  ];
  const HERB_BUNCH = [
    '      l L  ',
    '   llmlmmLd',
    'mmzlmmmmmd ',
    '   mmdlmLd ',
    '      d d  '
  ];
  const HERB_HEAP = [
    '   l L  l   ',
    ' Llmlmdlmmd ',
    'lmmmLmmmdLmd',
    ' mdmmmdmmdd '
  ];
  const POULTICE = [
    '  lLLMm  ',
    ' lLMyMMd ',
    'lmMMyMDdd',
    ' mddxddd '
  ];
  const TRUG = [
    'lllllllllllmmd',
    'lmlmlmlmlmdmdd',
    ' mlmlmlmdmdmd ',
    '  dddddddddd  '
  ];

  const MARKS = [1, 4, 12];
  const remedy = (...draws) => staged('remedy', MARKS, draws);
  const CHEST = { body: 'wood' };
  const parcel = piece(PARCEL, { body: 'leather', strap: 'linen' }), pad = piece(SALVED_PAD, { body: 'linen', trim: 'honey' });
  const roll = piece(SEALED_ROLL, { body: 'plaster', trim: 'red', strap: 'steel' }), pot = piece(SALVE_POT, { body: 'clay', trim: 'honey', strap: 'linen' });
  const tin = piece(BALM_TIN, { body: 'iron', trim: 'flame', strap: 'iron' }), kit = piece(SURGEON_ROLL, { body: 'leather', trim: 'linen', strap: 'steel' });
  const bunch = piece(HERB_BUNCH, { body: 'leaf', trim: 'poppy', strap: 'cord' }), poultice = piece(POULTICE, { body: 'linen', trim: 'poultice', strap: 'cord' });
  const trug = piece(TRUG, { body: 'ash' }), heap = piece(HERB_HEAP, { body: 'leaf', trim: 'poppy' });

  WORLD_GEAR.add({
    styptic_pack: remedy(() => scene([0, 0, parcel]), () => mound(parcel, [2, 1], 0, 4), () => packed(parcel, 2, 5, CHEST)),
    burn_dressing: remedy(() => scene([0, 0, pad]), () => strewn(pad, [[0, 6], [1, 3], [0, 0]]), () => packed(pad, 2, 5, CHEST)),
    surgeons_dressing: remedy(() => scene([0, 0, roll]), () => strewn(roll, [[0, 3], [2, 0]]), () => strewn(roll, [[0, 9], [2, 6], [0, 3], [1, 0]])),
    honey_salve: remedy(() => scene([0, 0, pot]), () => mound(pot, [2, 1], 1), () => packed(pot, 2, 5, CHEST)),
    emberbloom_balm: remedy(() => scene([0, 0, tin]), () => strewn(tin, [[0, 3], [3, 0]]), () => strewn(tin, [[0, 9], [4, 6], [1, 3], [3, 0]])),
    field_surgeons_kit: remedy(() => scene([0, 0, kit]), () => strewn(kit, [[0, 3], [1, 0]]), () => strewn(kit, [[1, 9], [0, 6], [1, 3], [0, 0]])),
    woundwort: remedy(() => scene([0, 0, bunch]), () => strewn(bunch, [[0, 3], [1, 0]]), () => held([[1, 0, heap]], trug, [0, 3])),
    chewed_poultice: remedy(() => scene([0, 0, poultice]), () => strewn(poultice, [[0, 3], [2, 0]]), () => packed(poultice, 2, 4, { body: 'ash' }))
  });
})();
