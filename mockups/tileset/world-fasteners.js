'use strict';
(() => {
  const { piece, scene, strewn, mound, staged } = WORLD_STACKS;

  const NAILS = [
    'lll      ',
    ' m      l',
    ' m  dmmml',
    ' m      d',
    ' d       '
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
  const STUDS = [
    'll     ll',
    ' lm   md ',
    '   m m   ',
    '    m    ',
    '   m m   ',
    '  d   d  '
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
  const TACKS = [
    ' m    m ',
    ' m    m ',
    'lld  lld',
    '   m    ',
    '   m    ',
    '  lld   '
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
  const RIVETS = [
    '      ll   ',
    '  ll lmmd  ',
    ' lmmd md   ',
    '  md       ',
    'lllllllllmd',
    'lmomomomodd',
    ' ddddddddd '
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
  const iron = piece(NAILS, { body: 'iron' }), bronze = piece(STUDS, { body: 'bronze' }), copper = piece(TACKS, { body: 'copper' });
  const rivets = piece(RIVETS, { body: 'steel' }), coil = piece(COIL, { body: 'iron' }), hank = piece(RING_HANK, { body: 'iron', strap: 'cord' });
  const gears = piece(GEARS, { body: 'steel', strap: 'wood' });

  WORLD_GEAR.add({
    iron_nail: fastener(HANDFULS, () => scene([0, 0, iron]), () => strewn(iron, [[0, 0], [6, 3]]), () => scene([0, 0, piece(NAIL_BOX, { body: 'wood', trim: 'iron' })])),
    bronze_nail: fastener(HANDFULS, () => scene([0, 0, bronze]), () => strewn(bronze, [[0, 0], [7, 2]]), () => scene([0, 0, piece(NAIL_POUCH, { body: 'hide', trim: 'bronze', strap: 'cord' })])),
    copper_tack: fastener(HANDFULS, () => scene([0, 0, copper]), () => strewn(copper, [[0, 0], [8, 2]]), () => scene([0, 0, piece(TACK_DISH, { body: 'clay', trim: 'copper' })])),
    steel_rivet: fastener(HANDFULS, () => scene([0, 0, rivets]), () => strewn(rivets, [[2, 0], [0, 5]]), () => scene([0, 0, piece(RIVET_KEG, { body: 'wood', trim: 'steel', strap: 'iron' })])),
    iron_wire: fastener([1, 4, 10], () => scene([0, 0, coil]), () => strewn(coil, [[0, 4], [1, 2], [0, 0]]), () => scene([5, -3, piece(STAKE, { body: 'iron', strap: 'wood' })], ...[8, 6, 4, 2, 0].map((y, i) => [i & 1, y, coil]))),
    mail_rings: fastener([1, 4, 10], () => scene([0, 0, hank]), () => mound(hank, [2, 1], 3), () => scene([0, 0, piece(RING_RAIL, { body: 'iron', strap: 'cord', lining: 'wood' })])),
    mechanism: fastener([1, 3, 8], () => scene([0, 0, gears]), () => strewn(gears, [[6, 0], [0, 4]]), () => scene([0, 0, piece(GEAR_CRATE, { body: 'steel', trim: 'ash', strap: 'iron' })]))
  });
})();
