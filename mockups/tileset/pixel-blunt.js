'use strict';
const PIXEL_BLUNT = (() => {
  const { assemble, part } = PX, { haft, pole, grip, binding, crossbar } = PARTS;

  const COBBLE_HEAD = part(-5, [
    ' lll  ',
    ' llll ',
    'mmmlm ',
    'mmmmmm',
    'mmLmm ',
    'mmmMmm',
    'mmLmm ',
    'mmmMmm',
    'dmLmd ',
    ' ddMd ',
    ' ddd  '
  ]);
  const BLOCK_HEAD = part(-9, [
    ' ll  ',
    ' lll ',
    'llll ',
    ' lmm ',
    'lmmm ',
    ' mmm ',
    'LLLL ',
    ' MMM ',
    'mmmm ',
    ' mmm ',
    'LLLL ',
    ' MMM ',
    'mmmm ',
    ' mmd ',
    'mmdd ',
    ' mdd ',
    'dddd ',
    ' ddd ',
    ' dd  '
  ]);
  const BOULDER_HEAD = part(-9, [
    '  ll   ',
    '  lll  ',
    ' llll  ',
    ' llmmm ',
    'llmmmm ',
    'lmmmmmm',
    'LLLLLL ',
    'MMMMMMM',
    'mmmmmm ',
    'mmmmmmm',
    'mmmmmm ',
    'LLLLLLL',
    'MMMMMM ',
    'dmmmmmd',
    'ddmmmd ',
    ' ddddd ',
    ' dddd  ',
    '  ddd  ',
    '  dd   '
  ]);
  const KNOBBED_HEAD = part(-7, [
    '  l   ',
    '  ll  ',
    ' lll  ',
    ' llll ',
    'mmmmm ',
    'mmmmmm',
    'mmlmm ',
    'mmmmmm',
    'mmmmm ',
    'dmmmmm',
    'dmmmm ',
    ' dddd ',
    ' ddd  ',
    '  dd  ',
    '  d   '
  ]);
  const FLANGED_HEAD = part(-6, [
    '  lll  ',
    ' llll  ',
    ' lmmml ',
    ' dddd  ',
    '  ddd  ',
    'llllll ',
    'mmmmmmm',
    'mmmmmm ',
    '  ddd  ',
    ' dddd  ',
    ' mmmmd ',
    ' dddd  ',
    '  ddd  '
  ]);
  const FINIAL = part(-1, ['l ', 'mm', 'd ']);
  const CLAW_HEAD = part(-13, [
    'lllll ',
    'lllllm',
    'lmmmm ',
    'lmmmmd',
    'mmmmd ',
    ' dddd ',
    ' mmm  ',
    '  mm  ',
    ' mmd  ',
    '  md  ',
    ' mmd  ',
    '  md  ',
    ' mml  ',
    '  mm  ',
    ' mmd  ',
    '  md  ',
    ' md   ',
    ' md   ',
    'md    ',
    'md    '
  ]);

  const lashing = n => [binding(n), 'cord'];

  const stoneClub = () => assemble([[haft(15), 'wood'], -4, lashing(3), -1, [COBBLE_HEAD, 'stone', 'cord']]);
  const stoneHammer = () => assemble([[haft(19), 'wood'], -8, lashing(2), [BLOCK_HEAD, 'stone', 'cord']]);
  const stoneMaul = () => assemble([[pole(23), 'wood'], -9, lashing(2), [BOULDER_HEAD, 'stone', 'cord']]);
  const copperMace = () => assemble([[haft(18), 'ash'], -3, [crossbar(2), 'copper'], -1, [KNOBBED_HEAD, 'copper']]);
  const ironMace = () => assemble([[haft(15), 'wood'], -15, 1, [grip(4), 'leather'], 9, [crossbar(2), 'iron'], -1, [FLANGED_HEAD, 'iron'], -1, [FINIAL, 'iron']]);
  const ironHammer = () => assemble([[haft(20), 'wood'], -6, [CLAW_HEAD, 'iron']]);

  return [
    { id: 'stone_club', draw: stoneClub },
    { id: 'stone_hammer', draw: stoneHammer },
    { id: 'stone_maul', draw: stoneMaul },
    { id: 'copper_mace', draw: copperMace },
    { id: 'iron_mace', draw: ironMace },
    { id: 'iron_hammer', draw: ironHammer }
  ];
})();
PIXEL_ICONS.push(...PIXEL_BLUNT);
