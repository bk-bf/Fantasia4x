'use strict';
const PIXEL_POLES = (() => {
  const { assemble, part, profile, run, stack, strip } = PX, { haft, binding, crossbar, HEAD } = PARTS;

  const FLINT_POINT = stack(HEAD.leaf(9), strip(-1, 3, 4, 'm'), strip(1, 5, 6, 'm'), strip(0, 2, 3, 'd'));
  const RIBBED_HEAD = profile([[-2, 2, 8, 'm'], [-1, 0, 10, 'm'], [0, 0, 13, 'l'], [1, 0, 10, 'd'], [2, 2, 8, 'd']]);
  const BOAR_HEAD = profile([[-3, 2, 7, 'l'], [-2, 1, 9, 'l'], [-1, 0, 10, 'm'], [0, 1, 13, 'l'], [1, 0, 10, 'm'], [2, 1, 9, 'd'], [3, 2, 7, 'd']]);
  const SOCKET = part(-1, ['lll', 'mmm', 'ddd']);
  const STONE_HOE_BLADE = part(-11, [
    'll   ',
    'lll  ',
    'lmm  ',
    'lmmm ',
    ' mmm ',
    ' mmmm',
    ' dmm ',
    '  mmm',
    '  dm ',
    '  dmm',
    '  LL ',
    '  MMM',
    '  dd '
  ]);
  const IRON_HOE_BLADE = part(-11, [
    'lll   ',
    'llll  ',
    'lmmm  ',
    'lmmmm ',
    ' dmm  ',
    '  dmm ',
    '   dm ',
    '   dmm',
    '   dm ',
    '   dmm',
    '   mm ',
    '   mmm',
    '   dd '
  ]);

  const lashing = n => [binding(n), 'cord'];
  const wetGrip = n => [run(-1, ['lm', 'md'], n), 'cord'];

  const stoneSpear = () => assemble([[haft(21), 'wood'], -3, lashing(3), -1, [FLINT_POINT, 'flint']]);
  const bronzeSocketedSpear = () => assemble([[haft(14), 'ash'], [SOCKET, 'bronze'], [RIBBED_HEAD, 'bronze']]);
  const steelBoarSpear = () => assemble([[haft(13), 'wood'], -10, wetGrip(6), 4, [SOCKET, 'steel'], [crossbar(5), 'steel'], -1, [BOAR_HEAD, 'steel']]);
  const stoneHoe = () => assemble([[haft(25), 'wood'], -6, lashing(1), [STONE_HOE_BLADE, 'stone', 'cord']]);
  const ironHoe = () => assemble([[haft(25), 'wood'], -6, [IRON_HOE_BLADE, 'iron']]);

  return [
    { id: 'stone_spear', draw: stoneSpear },
    { id: 'bronze_socketed_spear', draw: bronzeSocketedSpear },
    { id: 'steel_boar_spear', draw: steelBoarSpear },
    { id: 'stone_hoe', draw: stoneHoe },
    { id: 'iron_hoe', draw: ironHoe }
  ];
})();
PIXEL_ICONS.push(...PIXEL_POLES);
