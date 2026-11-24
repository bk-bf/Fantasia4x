'use strict';
(() => {
  const { piece, scene, strewn, mound, staged } = WORLD_STACKS;

  const NAIL_FLAT = [
    'l      ',
    'llllllm',
    'mddddd ',
    'd      '
  ];
  const NAIL_UP = [
    'llmd',
    ' lm ',
    ' lm ',
    ' lm ',
    ' ld ',
    ' d  '
  ];
  const NAIL_SLANT = [
    '    lm',
    '   lmd',
    '  lm  ',
    ' lm   ',
    'ld    ',
    'd     '
  ];
  const NAIL_BOX = [
    '   L  M L   ',
    ' LMDLMLDMLD ',
    'lDMLMDLMDMLd',
    'lllllllllmmd',
    'lmmmmmmmmmdd',
    'lmmmmmmmmmdd',
    'lmmmmmmmmddd',
    ' dddddddddd '
  ];
  const STUD_FLAT = [
    'll      ',
    'lm      ',
    'lmllllll',
    'lmdddddd',
    'md      ',
    'dd      '
  ];
  const STUD_UP = [
    ' lm ',
    'llmd',
    'lmdd',
    ' ld ',
    ' ld ',
    ' ld ',
    ' d  '
  ];
  const NAIL_POUCH = [
    '   L M L   ',
    '  LMDMLMD  ',
    ' zllllmmdx ',
    ' llmmmmmdd ',
    'llmmmmmmmdd',
    'lmmmmmmmddd',
    ' mmmmmmddd ',
    '  ddddddd  '
  ];
  const TACK_UP = [
    'lllmm',
    'mmddd',
    '  l  ',
    '  m  ',
    '  d  '
  ];
  const TACK_SIDE = [
    'l    ',
    'lm   ',
    'lmllm',
    'md   ',
    'd    '
  ];
  const TACK_POINT = [
    '  l  ',
    '  l  ',
    '  m  ',
    'lllmd',
    'ddddd'
  ];
  const TACK_DISH = [
    '   L  M    ',
    '  LMDLMLD  ',
    ' LMDMLMDMD ',
    'llllllmmmdd',
    ' lmmmmmmdd ',
    '  mmmmmdd  ',
    '   ddddd   '
  ];
  const RIVET_UP = [
    ' llm ',
    'llmmd',
    'mmddd',
    ' lmd ',
    ' lmd ',
    ' ddd '
  ];
  const RIVET_SIDE = [
    ' l    ',
    'llm   ',
    'lmllmd',
    'lmmddd',
    'md    ',
    ' d    '
  ];
  const RIVET_DOWN = [
    ' lmd ',
    ' lmd ',
    'llmmd',
    'lmmdd',
    ' ddd '
  ];
  const RIVET_KEG = [
    '  LL LL  ',
    ' LMMLMMD ',
    'lLMDMLMDd',
    'lllllmmdd',
    'zzzyyyyxx',
    'lmlmmmdmd',
    'lmlmmmdmd',
    'zzzyyyyxx',
    ' lmmmmdd ',
    '  ddddd  '
  ];
  const COIL = [
    '  llmlmmd   ',
    ' lmdmmmddd  ',
    'lmd     mdd ',
    'lmd     mdd ',
    ' lmmlmmmddl ',
    '  ddddddd lm'
  ];
  const STAKE = ['zy', 'zy', 'zy', 'zy'];
  const RING_HANK = [
    '   zyyx   ',
    '  z    x  ',
    '  lmlmld  ',
    ' lmdmdmld ',
    ' mdlmlmdd ',
    ' lmdmdmld ',
    '  dmdmdd  '
  ];
  const RING_RAIL = [
    'ZZZZZZZZZZZZZZZYX',
    'ZX y   y   y   YX',
    'ZX lmd lmd lmd YX',
    'ZXlmdmlmdmlmdmdYX',
    'ZXmdlmmdlmmdlmdYX',
    'ZXlmdmlmdmlmdmdYX',
    'ZX dmd dmd dmd YX',
    'ZX             YX',
    'ZX             YX'
  ];
  const GEARS = [
    '  l l l      ',
    ' lmmmmmd     ',
    'lmmdddmmd l  ',
    ' mmdodmmdlmd ',
    'lmmdddmdlmodd',
    ' mmmmmdd dmd ',
    '  d d d   d  ',
    'zzzzzzzzzzzzz',
    'yyyyyyyyyyyxx'
  ];
  const GEAR_CRATE = [
    '   l l     l   ',
    '  lmmmd l lmd  ',
    ' lmdodmdmdmodl ',
    'LLLLLLLLLLLLLLD',
    'LMMMMMMMMMMMMDD',
    'LOOOOOOOOOOOOOD',
    'LMMMMMMMMMMMMDD',
    'LMMMMMMMMMMMMDD',
    'LOOOOOOOOOOOOOD',
    'LMMMMMMMMMMMDDD',
    'DDDDDDDDDDDDDDD'
  ];

  const fastener = (marks, ...draws) => staged('fastener', marks, draws);
  const HANDFULS = [8, 30, 90];
  const kit = (wear, ...rows) => rows.map(r => piece(r, wear));
  const [nailFlat, nailUp, nailSlant] = kit({ body: 'iron' }, NAIL_FLAT, NAIL_UP, NAIL_SLANT);
  const [studFlat, studUp] = kit({ body: 'bronze' }, STUD_FLAT, STUD_UP);
  const [tackUp, tackSide, tackPoint] = kit({ body: 'copper' }, TACK_UP, TACK_SIDE, TACK_POINT);
  const [rivetUp, rivetSide, rivetDown] = kit({ body: 'steel' }, RIVET_UP, RIVET_SIDE, RIVET_DOWN);
  const coil = piece(COIL, { body: 'iron' }), hank = piece(RING_HANK, { body: 'iron', strap: 'cord' });
  const gears = piece(GEARS, { body: 'steel', strap: 'wood' });

  WORLD_GEAR.add({
    iron_nail: fastener(HANDFULS, () => scene([0, 4, nailFlat], [9, 0, nailUp], [12, 3, nailSlant]), () => scene([0, 6, nailFlat], [4, 0, nailSlant], [8, 2, nailUp], [11, 7, nailFlat], [14, 1, nailSlant], [3, 10, nailFlat]), () => scene([0, 0, piece(NAIL_BOX, { body: 'wood', trim: 'iron' })])),
    bronze_nail: fastener(HANDFULS, () => scene([0, 2, studFlat], [10, 0, studUp], [5, 6, studFlat]), () => scene([0, 3, studFlat], [10, 0, studUp], [14, 2, studUp], [4, 8, studFlat], [13, 9, studFlat]), () => scene([0, 0, piece(NAIL_POUCH, { body: 'hide', trim: 'bronze', strap: 'cord' })])),
    copper_tack: fastener(HANDFULS, () => scene([0, 3, tackUp], [8, 0, tackPoint], [15, 3, tackSide]), () => scene([0, 3, tackUp], [7, 0, tackPoint], [13, 2, tackSide], [3, 8, tackPoint], [10, 8, tackUp], [17, 6, tackPoint]), () => scene([0, 0, piece(TACK_DISH, { body: 'clay', trim: 'copper' })])),
    steel_rivet: fastener(HANDFULS, () => scene([0, 0, rivetUp], [6, 3, rivetSide], [13, 1, rivetDown]), () => scene([0, 0, rivetUp], [6, 3, rivetSide], [13, 1, rivetDown], [2, 7, rivetDown], [9, 8, rivetUp], [15, 6, rivetSide]), () => scene([0, 0, piece(RIVET_KEG, { body: 'wood', trim: 'steel', strap: 'iron' })])),
    iron_wire: fastener([1, 4, 10], () => scene([0, 0, coil]), () => strewn(coil, [[0, 4], [1, 2], [0, 0]]), () => scene([5, -3, piece(STAKE, { body: 'iron', strap: 'wood' })], ...[8, 6, 4, 2, 0].map((y, i) => [i & 1, y, coil]))),
    mail_rings: fastener([1, 4, 10], () => scene([0, 0, hank]), () => mound(hank, [2, 1], 3), () => scene([0, 0, piece(RING_RAIL, { body: 'iron', strap: 'cord', lining: 'wood' })])),
    mechanism: fastener([1, 3, 8], () => scene([0, 0, gears]), () => strewn(gears, [[6, 0], [0, 4]]), () => scene([0, 0, piece(GEAR_CRATE, { body: 'steel', trim: 'ash', strap: 'iron' })]))
  });
})();
