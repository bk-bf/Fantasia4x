'use strict';
const PIXEL_AXES = (() => {
  const { assemble, part } = PX, { POMMEL, haft, pole, grip, binding } = PARTS;

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

  const HATCHET_HEAD = part(-12, [
    '  lllll  ',
    ' lllllll ',
    'llmmmmmml',
    'dmmmmmmml',
    ' dmmmmmm ',
    ' ddmmmml ',
    '  ddmmm  ',
    '   dmml  ',
    '   dmmm  ',
    '   dmml  ',
    '  dddddd ',
    '  dmmmml ',
    '  dmmmml ',
    '  dddddd ',
    '   dddd  '
  ]);
  const GNOLL_HEAD = part(-14, [
    '  l  l  l  ',
    ' lll lllll ',
    'llmmlmmlmml',
    'dmmdmmmdmm ',
    ' mmmmdmmmd ',
    ' dmdmmmdm  ',
    '  mmmdmmm  ',
    '  dmmmdm   ',
    '   mdmmm   ',
    '   dmmd    ',
    '   dmmm    ',
    '    dm     ',
    '    dd     '
  ]);
  const TUFT = PX.patch([' l ', 'lmm', 'mmd', 'md ', 'mdd', ' d ', 'd  '], [-1, -1]);
  const FLAT_HEAD = part(-17, [
    ' llll ',
    'llllll',
    'dmmmml',
    ' dmmm ',
    ' dmml ',
    '  dm  ',
    '  dm  ',
    ' xzzx ',
    ' xyyx ',
    ' xzzx ',
    '  DM  ',
    '  DM  ',
    '  DL  ',
    '  DM  ',
    '  DM  ',
    '  DM  ',
    ' DDM  ',
    'DDDM  '
  ]);
  const CHEEK_HEAD = part(-14, [
    '   lllllll  ',
    ' lllllllllll',
    'dlmmmmmmmmml',
    ' ddmmmmmmmm ',
    '   DMMMMMML ',
    '   DDMMMMM  ',
    '    DMMMML  ',
    '    DMMMM   ',
    '    DMMML   ',
    '    DMMMM   ',
    '    DMMMM   ',
    '   DDDDDDD  ',
    '   DMMMMML  ',
    '   DMMMMML  ',
    '   DMMMMML  ',
    '   DDDDDDD  '
  ]);
  const SPLITTING_HEAD = part(-14, [
    '   llllll  ',
    ' lllllllll ',
    'dlmmmmmmmml',
    ' dmLLmLLLm ',
    '  dmMmMMml ',
    '  ddmmmmm  ',
    '   dmmmml  ',
    '   ddmmmm  ',
    '    dmmml  ',
    '    dmmmm  ',
    '    dmmmm  ',
    '   ddddddd ',
    '   dmmmmml ',
    '   dmLLLml ',
    '   dmmmmml ',
    '   ddddddd '
  ]);
  const SERRATED_HEAD = part(-15, [
    ' l l l l l  ',
    'llllllllll  ',
    'dmmmmmmmmml ',
    ' dmmmmmmmmm ',
    ' ddmmmmmmm  ',
    '  dmmmmmml  ',
    '  ddmmmmm   ',
    '   dmmmm    ',
    '   ddmmm    ',
    '    dmmm    ',
    '    dmmm    ',
    '    dmml    ',
    '   dddddd   ',
    '   dmmmmm   ',
    '   dmmmmm   ',
    '   dmmmmm   ',
    '   ddmmmd   ',
    '    dmmd    ',
    '    dmd     ',
    '     dd     ',
    '     d      '
  ]);
  const CRESCENT_HEAD = part(-16, [
    '    lllll    ',
    '  lllllllll  ',
    ' llmmmmmmmll ',
    'llmmmmmmmmmml',
    'lmmmmmmmmmmml',
    'dmmmmmmmmmmmm',
    'dm  dmmmml mm',
    'd   dmmmm   m',
    '     dmmm    ',
    '     dmmm    ',
    '     dmml    ',
    '     dmmm    ',
    '    dddddd   ',
    '    dmmmml   ',
    '    dmmmml   ',
    '    dmmmml   ',
    '    dmmmml   ',
    '    dddddd   '
  ]);
  const HALFMOON_HEAD = part(-15, [
    '      lllllll  ',
    '   llllllllllll',
    ' llmmmmmmmmmmml',
    'llmmmmmmmmmmmm ',
    'dmmmmmmmmmmmmm ',
    ' ddmmmmmmmmmml ',
    '   ddmmmmmmmm  ',
    '     ddmmmmml  ',
    '       dmmmm   ',
    '       dmmml   ',
    '       dmmmm   ',
    '      dddddd   ',
    '      dmmmml   ',
    '      dmmmml   ',
    '      dmmmml   ',
    '      dddddd   '
  ]);
  const labrysWing = part(-13, [
    ' lllllllll ',
    'llmmmmmmmll',
    'dmmmmmmmmml',
    ' dmmmmmmml ',
    '  dmmmmml  ',
    '   dmmml   ',
    '   dmmml   ',
    '    dml    ',
    '    dml    ',
    '    dmm    ',
    '    dmm    '
  ]);
  const LABRYS_HEAD = PX.stack(labrysWing, PX.mirror(labrysWing, { l: 'd', d: 'l' }), part(-2, ['   ddddd   ', '   dmmml   ', '   dmmml   ', '   dmmml   ', '   ddddd   ']));
  const GRAVEN_HEAD = part(-17, [
    '    llllllll   ',
    '  llllllllllll ',
    ' llmmmmmmmmmmll',
    'llmmmmmmmmmmmml',
    'lmmLLmLLLmLLmml',
    'dmmmMmMMMmMMmmm',
    'dmmmmmmmmmmmmmm',
    'dmm  dmmmmml  m',
    'dm    dmmml   m',
    'd     dmmmm    ',
    '      dmLmm    ',
    '      dmMml    ',
    '      dmmmm    ',
    '     ddddddd   ',
    '     dmmmmml   ',
    '     dmLLLml   ',
    '     dmmmmml   ',
    '     ddddddd   '
  ]);
  const orcWing = part(-13, [
    ' l ll l ll  ',
    'llllllllll  ',
    'dmmmmmmmmml ',
    'dmmmmmmmmml ',
    ' dmmmmmmmm  ',
    '  dmmmmmm   ',
    '   dmmmm    ',
    '   ddmmm    ',
    '    dmmm    ',
    '    dmmm    ',
    '    dmmm    '
  ]);
  const ORC_DOUBLE_HEAD = PX.stack(orcWing, PX.mirror(orcWing, { l: 'd', d: 'l' }), part(-2, ['   dddddd   ', '   dMMMMd   ', '   dmmmmd   ', '   dMMMMd   ', '   dddddd   ']));
  const TIDE_HEAD = part(-18, [
    '            lll ',
    '    lllllll  ll ',
    '  llllllllllll  ',
    ' llmmmmmmmmmmml ',
    'llMMMMMMMMMMMMm ',
    'lmmmmmmmmmmmmmm ',
    'dmmmmmmmmmmmmmd ',
    'dmmMMmmmmmmmmm  ',
    ' dm  dmmmmmmd   ',
    ' d    dmmmmd    ',
    '       dmmm     ',
    '       dmmm     ',
    '       dMMM     ',
    '       dmmm     ',
    '      ddddddd   ',
    '      DMMMMML   ',
    '      dmmmmml   ',
    '      dmmmmml   ',
    '      DMMMMML   ',
    '      ddddddd   ',
    '       dmmd     ',
    '       dmd      ',
    '        d       '
  ]);

  const BEARD_PATCH = PX.patch([
    '     ll       ',
    '    lll       ',
    '   llmml      ',
    '  llmmmml     ',
    ' llmmmmmml    ',
    'llmmmmmmmml   ',
    'lddddddmmmlm  ',
    '        ddmmm ',
    '         mmmmd',
    '         mmmdd',
    '          mdd ',
    '           d  '
  ], [10, 9]);
  const lashing = n => [binding(n), 'cord'];
  const lashed = (length, drop, head, ink) => assemble([[haft(length), 'wood'], -drop, lashing(2), 3, lashing(1), -drop - 1, [head, ink]]);

  const flintHandaxe = () => lashed(17, 6, BIFACE_HEAD, 'flint');
  const stoneChopper = () => assemble([[pole(8), 'wood'], -3, [CHOPPER_HEAD, 'stone'], -14, lashing(3)]);
  const copperAxe = () => lashed(21, 7, CELT_HEAD, 'copper');
  const ironAxe = () => assemble([[haft(22), 'wood'], -8, [FELLING_HEAD, 'iron']]);
  const castBronzeHatchet = () => assemble([[haft(18), 'wood'], -8, [HATCHET_HEAD, 'bronze']]);
  const gnollFlintAxe = () => assemble([[haft(17), 'wood'], -5, [binding(3), 'hide'], -5, [GNOLL_HEAD, 'flint'], -9, [TUFT, 'fur']]);
  const copperFlatAxe = () => assemble([[haft(17), 'wood'], -4, [FLAT_HEAD, 'copper', 'wood', 'cord']]);
  const steelBroadaxe = () => assemble([[grip(5), 'leather'], [haft(13), 'wood'], -8, [CHEEK_HEAD, 'steel', 'iron']]);
  const runeEtchedAxe = () => assemble([[POMMEL.block, 'gold'], [grip(5), 'wool'], [haft(13), 'wood'], -8, [SPLITTING_HEAD, 'runed', 'glow']]);
  const orcSerratedAxe = () => assemble([[binding(6), 'leather'], [haft(13), 'black'], -8, [SERRATED_HEAD, 'black']]);
  const ironBroadaxe = () => assemble([[grip(5), 'leather'], [haft(14), 'wood'], -10, [CRESCENT_HEAD, 'iron']]);
  const steelGreataxe = () => assemble([[grip(5), 'leather'], [haft(13), 'wood'], -11, [HALFMOON_HEAD, 'steel']]);
  const bronzeDoubleAxe = () => assemble([[haft(22), 'wood'], -9, [LABRYS_HEAD, 'bronze']]);
  const runeBittenGreataxe = () => assemble([[POMMEL.block, 'gold'], [grip(5), 'wool'], [haft(10), 'wood'], -11, [GRAVEN_HEAD, 'runed', 'glow']]);
  const orcGreataxe = () => assemble([[binding(7), 'red'], [pole(16), 'black'], -10, [ORC_DOUBLE_HEAD, 'black', 'red']]);
  const ironTideGreataxe = () => assemble([[POMMEL.block, 'copper'], [binding(5), 'red'], [haft(10), 'black'], -12, [TIDE_HEAD, 'black', 'copper']]);
  const beardedAxe = () => assemble([[haft(21), 'wood'], -20, [grip(5), 'leather'], 14, [BEARD_PATCH, 'iron']]);

  return [
    { id: 'flint_handaxe', draw: flintHandaxe },
    { id: 'stone_chopper', draw: stoneChopper },
    { id: 'copper_axe', draw: copperAxe },
    { id: 'iron_axe', draw: ironAxe },
    { id: 'stone_axe', draw: () => lashed(20, 7, CELT_HEAD, 'flint') },
    { id: 'steel_axe', draw: () => assemble([[grip(4), 'leather'], [haft(18), 'ash'], -8, [FELLING_HEAD, 'steel']]) },
    { id: 'bearded_axe', draw: beardedAxe },
    { id: 'cast_bronze_hatchet', draw: castBronzeHatchet },
    { id: 'gnoll_flint_axe', draw: gnollFlintAxe },
    { id: 'copper_flat_axe', draw: copperFlatAxe },
    { id: 'steel_broadaxe', draw: steelBroadaxe },
    { id: 'rune_etched_axe', draw: runeEtchedAxe },
    { id: 'orc_serrated_axe', draw: orcSerratedAxe },
    { id: 'iron_broadaxe', draw: ironBroadaxe },
    { id: 'steel_greataxe', draw: steelGreataxe },
    { id: 'bronze_double_axe', draw: bronzeDoubleAxe },
    { id: 'rune_bitten_greataxe', draw: runeBittenGreataxe },
    { id: 'orc_greataxe', draw: orcGreataxe },
    { id: 'iron_tide_greataxe', draw: ironTideGreataxe }
  ];
})();
PIXEL_ICONS.push(...PIXEL_AXES);
