'use strict';
const PIXEL_AXES = (() => {
  const { assemble, part } = PX, { haft, pole, grip, binding } = PARTS;

  const BIFACE_HEAD = part(-12, [
    ' llllll',
    'lmmmmml',
    ' ddmmmm',
    ' mmmdm ',
    ' dmmmmd',
    ' dmmmm ',
    '  mmmm ',
    ' dmmdm ',
    '  dmmm ',
    '  mmm  ',
    '  dmmm ',
    '  mmd  ',
    '  dmm  ',
    '  ddd  ',
    '   dd  '
  ]);
  const CHOPPER_HEAD = part(-8, [
    '     lll  ll  ',
    '   lllllllll  ',
    '  llmlllmlllm ',
    '  lmmllmmllmm ',
    ' lmmmlmmmlmmm ',
    ' mmmmmmmmmmmm ',
    ' mmmmmmmmmmmmm',
    ' mmmmmmmmmmmm ',
    ' mmmmmmmmmmmmm',
    ' dmmmmmmmmmmd ',
    '  dddddddddd  ',
    '   dddddddd   '
  ]);
  const CELT_HEAD = part(-14, [
    ' llllll',
    'lmmmmml',
    ' dmmmmm',
    ' dmmmm ',
    '  dmmm ',
    '  dmm  ',
    '   mmm ',
    '   mm  ',
    '   dm  ',
    '   mm  ',
    '   dm  ',
    '   mm  ',
    '   dm  ',
    '   mm  ',
    '   mm  ',
    '   dd  ',
    '   dd  '
  ]);
  const FELLING_HEAD = part(-14, [
    '   lll  ',
    ' llmmll ',
    ' lmmmmml',
    'dmmmmmm ',
    ' dmmmmm ',
    ' dmmmmm ',
    '  dmmmm ',
    '  mmmm  ',
    '  dmmmm ',
    '  dmmm  ',
    '   dddd ',
    '   dmm  ',
    '   dmmm ',
    '   mml  ',
    '   mmm  ',
    '   dmm  ',
    '    dd  '
  ]);
  const BEARDED_HEAD = part(-14, [
    '  lllll  ',
    ' lllllll ',
    'lmmmmmmml',
    'dmmmmmmm ',
    ' dmmmmmmm',
    '  dmmmmm ',
    '   dmmmmm',
    '    dmmm ',
    '     mmmm',
    '    dmmm ',
    '     mmmm',
    '    dmmm ',
    '     mmml',
    '    mmmm ',
    '     mmmm',
    '    dddd ',
    '     ddd '
  ]);

  const lashing = n => [binding(n), 'cord'];
  const lashed = (length, drop, head, ink) => assemble([[haft(length), 'wood'], -drop, lashing(2), 3, lashing(1), -drop - 1, [head, ink]]);

  const flintHandaxe = () => lashed(17, 6, BIFACE_HEAD, 'flint');
  const stoneChopper = () => assemble([[pole(8), 'wood'], -3, [CHOPPER_HEAD, 'stone'], -14, lashing(3)]);
  const copperAxe = () => lashed(21, 7, CELT_HEAD, 'copper');
  const ironAxe = () => assemble([[haft(22), 'wood'], -8, [FELLING_HEAD, 'iron']]);
  const beardedAxe = () => assemble([[haft(24), 'wood'], -23, [grip(5), 'leather'], 6, [BEARDED_HEAD, 'iron']]);

  return [
    { id: 'flint_handaxe', draw: flintHandaxe },
    { id: 'stone_chopper', draw: stoneChopper },
    { id: 'copper_axe', draw: copperAxe },
    { id: 'iron_axe', draw: ironAxe },
    { id: 'bearded_axe', draw: beardedAxe }
  ];
})();
