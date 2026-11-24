'use strict';
(() => {
  const { inked } = WORLD_GEAR;

  const BARROW = [
    'll                          ',
    ' dmm                        ',
    '   dmm lllllllllllllllllll  ',
    '     mmlmmmmmmmmmmmmmmmmmmd ',
    '       dmmmmmmmmmmmmmmmmmdd ',
    '        dmmmmmmmmmmmmmmmdd  ',
    '         ddddddddddddddd    ',
    '          ld                ',
    '          ld                ',
    '          ld                ',
    '          ld                ',
    '          ld                ',
    '          dd                '
  ];
  const SMALL_WHEEL = [
    '  LLMMD  ',
    ' L  m  D ',
    'L   m   D',
    'L   m   D',
    'MmmmlmmmD',
    'M   m   D',
    'M   m   D',
    ' M  m  D ',
    '  DDDDD  '
  ];
  const CART = [
    '         llllllllllllllllllld ',
    '         lmmmmdmmmmmmdmmmmmd  ',
    '         lmmmmdmmmmmmdmmmmmd  ',
    'llllllllllllllllllllllllllld  ',
    ' ddddddddddddddddddddddddddd  ',
    '                         ld   ',
    '                         ld   ',
    '                         ld   ',
    '                         ld   ',
    '                         ld   ',
    '                         ld   ',
    '                         ld   ',
    '                         dd   '
  ];
  const BIG_WHEEL = [
    '   LLLMM   ',
    ' LL  m  DD ',
    ' L   m   D ',
    'L    m    D',
    'L    m    D',
    'MmmmmlmmmmD',
    'M    m    D',
    'M    m    D',
    ' M   m   D ',
    ' MD  m  DD ',
    '   DDDDD   '
  ];

  const IRON_WHEELED = { body: 'wood', trim: 'iron' };
  const wheeled = (bed, wheel, at) => ({ kind: 'hauler', tuck: 'low', ground: () => PX.overlay(inked(bed, IRON_WHEELED), at[0], at[1], wheel, 'wood', 'iron') });

  WORLD_GEAR.add({
    wheelbarrow: wheeled(BARROW, SMALL_WHEEL, [18, 4]),
    handcart: wheeled(CART, BIG_WHEEL, [12, 2])
  });
})();
