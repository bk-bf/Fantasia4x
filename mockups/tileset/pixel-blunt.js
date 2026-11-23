'use strict';
const PIXEL_BLUNT = (() => {
  const { assemble, part, patch, stack, strip, mirror, sketch, stamp } = PX, { POMMEL, haft, pole, grip, binding, crossbar } = PARTS;

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

  const SHADE_BELOW = { l: 'd', d: 'l', L: 'D', D: 'L' };
  const CLAW = patch([
    'lll             ',
    ' ddmll          ',
    '   dmmll        ',
    '    dmmml       ',
    '     dmmml      ',
    '      dmmmlll   ',
    '       dmmmmll  ',
    '        dmmmmll ',
    '        dmmmmmll',
    '        ddmmmmmd',
    '         ddmmmd ',
    '          ddmd  ',
    '           dd   '
  ], [8, 5]);
  const SPIKED_POLL = patch([
    'l              ',
    ' ll            ',
    ' dml           ',
    '  dmll         ',
    '   dmml        ',
    '   dmmml       ',
    '    dmmml      ',
    '     dmmmlll   ',
    '      dmmmmll  ',
    '       dmmmmll ',
    '       dmmmmmll',
    '       ddmmmmmd',
    '        ddmmmd ',
    '         ddmd  ',
    '          dd   '
  ], [7, 7]);
  const BEAK = patch([
    'lll             ',
    ' dmmll          ',
    '  ddmmml        ',
    '    dmmml       ',
    '     dmmml      ',
    '     ddmmmlll   ',
    '       dmmmmll  ',
    '        dmmmmll ',
    '        dmmmmmll',
    '        ddmmmmmd',
    '         ddmmmd ',
    '          ddmd  ',
    '           dd   '
  ], [8, 5]);
  const TOP_SPIKE = part(-1, ['ll  ', 'mmml', 'dd  ']);
  const KNOB_HEAD = patch([
    '    ll      ',
    '   lll   m  ',
    '    lllmmmm ',
    '   lllmmmm  ',
    'lllllmmmmm  ',
    'llllmmmmmd  ',
    '  lmmmmmdddd',
    ' lmmmmmddddd',
    'llmmmmddd d ',
    'lmmmmddd    ',
    ' mmdd dd    ',
    '  dd  dd    '
  ], [2, 9]);
  const symmetric = (upper, middle) => stack(upper, mirror(upper, SHADE_BELOW), middle);
  const ANTLER_BEAM = part(-8, [
    '              l      ',
    '             lm      ',
    '            lmd      ',
    '           lmmd      ',
    '          lmmd       ',
    '          lmmd    l  ',
    '      llllllmmd  lll ',
    ' lllllllmmmmmmmmllmmm',
    'lmmmmmmmmmmmmmmmmlmmd',
    'mmmmmdmmmmmmdmmmmmmdd',
    'mdddddddddddddddmmmdd',
    '  dddddd   ddd  dddd ',
    '                 dd  '
  ]);
  const STEEL_FLANGES = symmetric(part(-9, [
    '  lllll  ',
    '  lmmml  ',
    '  lmmmd  ',
    '   lmd   ',
    ' lllllll ',
    'lmmmmmmd ',
    'lmmmmmmmd',
    'lmmmmmmmd',
    'mmmmmmmmd'
  ]), part(0, ['mllllllld']));
  const RUNE_FLANGES = symmetric(part(-9, [
    '  lllll  ',
    '  lLMLl  ',
    '  lmMmd  ',
    '   lmd   ',
    ' lllllll ',
    'lmmmmmmd ',
    'lmmmmmmmd',
    'lmmmmmmmd',
    'mmmmmmmmd'
  ]), part(0, ['mLMLLMLmd']));
  const RIBBED_HEAD = symmetric(part(-8, [
    '    lll   ',
    '   lllllll',
    '  lmmmmmmm',
    '  dddddddd',
    ' mmmmmmmmm',
    ' mmmmmmmmm',
    'llllllllll',
    'dddddddddd'
  ]), part(0, ['mmmmmmmmmm']));
  const MAUL_BLOCK = symmetric(part(-9, [
    'lllllll',
    'lmmmmml',
    'lmmmmml',
    'dddddd ',
    'lmmmmml',
    'dmmmmml',
    'dmmmmml',
    'dmmmmml',
    'dmmmmml'
  ]), part(0, ['dmmmmml']));
  const ANVIL_BLOCK = symmetric(part(-11, [
    ' lllllll ',
    'llmmmmmll',
    'lmmmmmmml',
    'lmmmmmmml',
    'dmmmmmmml',
    'dmmmmmmml',
    'dMMMMMMMl',
    'dDDDDDDDl',
    'dmmmmmmml',
    'dmmmmmmml',
    'dmmmmmmml'
  ]), part(0, ['dmmmmmmml']));
  const JAGGED_BLOCK = symmetric(part(-11, [
    ' l  l  l ',
    'lll lllll',
    'lmmmlmmml',
    'dmmmmmmm ',
    ' mmmmmmml',
    'dmmmmmmm ',
    'dmmmmmmmm',
    ' dmmmmmm ',
    'dmmmmmmml',
    'dmmmmmmm ',
    'dmmmmmmml'
  ]), part(0, ['dmmmmmmml']));
  const FEMUR = symmetric(part(-12, [
    ' lll  lll ',
    'lllllllllm',
    'lmmmllmmmd',
    ' dmmmmmmd ',
    '  lmmmmd  ',
    '  lmmmmd  ',
    '  lmmmmd  ',
    '  lmmmmd  ',
    '  lmmmmd  ',
    ' LLLLLLLL ',
    ' DDDDDDDD ',
    '  lmmmmd  '
  ]), part(0, [' LLLLLLLL ']));
  const RUNE_HAMMER_HEAD = symmetric(part(-11, [
    'lllllll  ',
    'lmmmmml  ',
    'lLMLMLl  ',
    'lmmmmml  ',
    'dmmmmml  ',
    ' dmmml   ',
    ' dmmml   ',
    'ddddddd  ',
    'dmmmmmml ',
    'dmmmmmmml',
    'dmmmmmmml'
  ]), part(0, ['dmLMLMLml']));
  const netCell = (x, y) => (x + y) % 4 === 0 || (x - y + 40) % 4 === 0;
  function weightedNet() {
    const R = 11, rows = [];
    for (let y = -R; y <= R; y++) {
      let row = '';
      for (let x = -R; x <= R; x++) {
        const d = Math.abs(x) + Math.abs(y);
        row += d > R ? ' ' : d === R ? 'y' : netCell(x + R, y + R) ? (d % 4 ? 'y' : 'z') : ' ';
      }
      rows.push(row);
    }
    const sk = stamp(sketch(), 0, 0, rows, ['ember', 'cord', 'string']);
    const WEIGHT = [' l ', 'lmd', ' d '];
    for (const [x, y] of [[R, 0], [0, R], [2 * R, R], [R, 2 * R]]) stamp(sk, x - 1, y - 1, WEIGHT, ['ember']);
    return sk;
  }

  const lashing = n => [binding(n), 'cord'];

  const stoneClub = () => assemble([[haft(15), 'wood'], -4, lashing(3), -1, [COBBLE_HEAD, 'stone', 'cord']]);
  const stoneHammer = () => assemble([[haft(19), 'wood'], -8, lashing(2), [BLOCK_HEAD, 'stone', 'cord']]);
  const stoneMaul = () => assemble([[pole(23), 'wood'], -9, lashing(2), [BOULDER_HEAD, 'stone', 'cord']]);
  const copperMace = () => assemble([[haft(18), 'ash'], -1, [crossbar(2), 'copper'], -1, [KNOB_HEAD, 'copper']]);
  const ironMace = () => assemble([[haft(15), 'wood'], -15, 1, [grip(4), 'leather'], 9, [crossbar(2), 'iron'], -1, [FLANGED_HEAD, 'iron'], -1, [FINIAL, 'iron']]);
  const ironHammer = () => assemble([[haft(20), 'wood'], -1, [CLAW, 'iron']]);

  const antlerClub = () => assemble([[part(0, ['lm']), 'bone'], [binding(6), 'cord'], -1, [ANTLER_BEAM, 'bone']]);
  const bronzeFlangedMace = () => assemble([[haft(16), 'wood'], -3, [crossbar(2), 'bronze'], -1, [RIBBED_HEAD, 'bronze'], -1, [FINIAL, 'bronze']]);
  const steelMace = () => assemble([[POMMEL.block, 'steel'], [grip(5), 'leather'], [haft(9), 'wood'], -2, [crossbar(2), 'steel'], -1, [STEEL_FLANGES, 'steel'], -1, [FINIAL, 'steel']]);
  const runeRibbedMace = () => assemble([[POMMEL.jewel, 'gold', 'sapphire'], [grip(5), 'wool'], [haft(9), 'wood'], -2, [crossbar(2), 'gold'], -1, [RUNE_FLANGES, 'runed', 'glow'], -1, [FINIAL, 'gold']]);
  const bronzeMaul = () => assemble([[grip(5), 'leather'], [haft(18), 'ash'], -7, [MAUL_BLOCK, 'bronze']]);
  const ironWarhammer = () => assemble([[grip(5), 'leather'], [haft(13), 'wood'], [TOP_SPIKE, 'iron'], -5, [SPIKED_POLL, 'iron']]);
  const steelWarhammer = () => assemble([[POMMEL.block, 'steel'], [grip(6), 'leather'], [haft(12), 'wood'], [TOP_SPIKE, 'steel'], -5, [BEAK, 'steel']]);
  const runeWeightedWarhammer = () => assemble([[POMMEL.jewel, 'gold', 'sapphire'], [grip(6), 'wool'], [haft(15), 'wood'], -7, [RUNE_HAMMER_HEAD, 'runed', 'glow']]);
  const anvilBreaker = () => assemble([[POMMEL.block, 'black'], [haft(4), 'wood'], [binding(14), 'iron'], [haft(4), 'wood'], -9, [ANVIL_BLOCK, 'black', 'iron']]);
  const orcMaul = () => assemble([[binding(6), 'red'], [pole(17), 'black'], -9, [JAGGED_BLOCK, 'black']]);
  const greatBoneMaul = () => assemble([[grip(6), 'leather'], [haft(16), 'wood'], -8, [FEMUR, 'bone', 'iron']]);
  const goblinNet = weightedNet;

  return [
    { id: 'stone_club', draw: stoneClub },
    { id: 'stone_hammer', draw: stoneHammer },
    { id: 'stone_maul', draw: stoneMaul },
    { id: 'copper_mace', draw: copperMace },
    { id: 'iron_mace', draw: ironMace },
    { id: 'iron_hammer', draw: ironHammer },
    { id: 'steel_hammer', draw: () => assemble([[grip(5), 'leather'], [haft(15), 'ash'], -1, [CLAW, 'steel']]) },
    { id: 'antler_club', draw: antlerClub },
    { id: 'bronze_flanged_mace', draw: bronzeFlangedMace },
    { id: 'steel_mace', draw: steelMace },
    { id: 'rune_ribbed_mace', draw: runeRibbedMace },
    { id: 'bronze_maul', draw: bronzeMaul },
    { id: 'iron_warhammer', draw: ironWarhammer },
    { id: 'steel_warhammer', draw: steelWarhammer },
    { id: 'rune_weighted_warhammer', draw: runeWeightedWarhammer },
    { id: 'anvil_breaker', draw: anvilBreaker },
    { id: 'orc_maul', draw: orcMaul },
    { id: 'great_bone_maul', draw: greatBoneMaul },
    { id: 'goblin_net', draw: goblinNet }
  ];
})();
PIXEL_ICONS.push(...PIXEL_BLUNT);
