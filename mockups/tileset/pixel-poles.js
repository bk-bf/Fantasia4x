'use strict';
const PIXEL_POLES = (() => {
  const { assemble, part, profile, run, stack, strip, stamp, diagonal } = PX, { haft, binding, crossbar, HEAD } = PARTS;

  const FLINT_POINT = stack(HEAD.leaf(9), strip(-1, 3, 4, 'm'), strip(1, 5, 6, 'm'), strip(0, 2, 3, 'd'));
  const RIBBED_HEAD = profile([[-2, 2, 8, 'm'], [-1, 0, 10, 'm'], [0, 0, 13, 'l'], [1, 0, 10, 'd'], [2, 2, 8, 'd']]);
  const BOAR_HEAD = profile([[-3, 2, 7, 'l'], [-2, 1, 9, 'l'], [-1, 0, 10, 'm'], [0, 1, 13, 'l'], [1, 0, 10, 'm'], [2, 1, 9, 'd'], [3, 2, 7, 'd']]);
  const SOCKET = part(-1, ['lll', 'mmm', 'ddd']);
  const COLLAR = part(-1, ['l', 'm', 'd']);
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

  const BONE_SPLINTER = profile([[-1, 0, 6, 'l'], [0, 0, 10, 'm'], [1, 1, 8, 'd'], [2, 2, 4, 'd']]);
  const COPPER_LEAF = profile([[-2, 2, 6, 'l'], [-1, 0, 8, 'l'], [0, 0, 10, 'm'], [1, 0, 8, 'd'], [2, 2, 6, 'd']]);
  const BRONZE_LEAF = profile([[-3, 4, 9, 'l'], [-2, 2, 11, 'l'], [-1, 0, 12, 'm'], [0, 0, 15, 'L'], [1, 0, 12, 'm'], [2, 2, 11, 'd'], [3, 4, 9, 'd']]);
  const FRAMEA_HEAD = profile([[-1, 0, 7, 'l'], [0, 0, 10, 'm'], [1, 0, 7, 'd']]);
  const NEEDLE = profile([[-1, 0, 3, 'l'], [0, 0, 8, 'm'], [1, 0, 3, 'd']]);
  const LANGET = profile([[-1, 0, 6, 'l'], [0, 0, 6, 'm'], [1, 0, 6, 'd']]);
  const HOOK_HEAD = part(-4, [
    '  mm      ',
    '   md     ',
    '    ml    ',
    '    lllll ',
    'mmmmmmmmmm',
    'dddddddd  '
  ]);
  const TRAP_HEAD = part(-3, [
    '    m     ',
    '   llll   ',
    'lllllllll ',
    'mmmmmmmmmm',
    'ddddddddd ',
    '   dddd   ',
    '    d     '
  ]);
  const SNARE = [
    '  mmm  ',
    ' m   m ',
    'm     m',
    'm     m',
    'm     m',
    ' m   m ',
    '  mmm  '
  ];
  const TUSK = part(-6, [
    '            l',
    '           ll',
    '          lm ',
    '       llmm  ',
    '    lllmmm   ',
    'lllllmmmdd   ',
    'mmmmmmmdd    ',
    'mmmmddd      ',
    'ddd          '
  ]);
  const LUGS = part(-4, ['ll   ', 'lll  ', ' lll ', 'mmmmm', 'mmmmm', 'ddddd', ' ddd ', 'ddd  ', 'dd   ']);
  const HALBERD_HEAD = PX.patch([
    '               l',
    '              ld',
    '             ld ',
    '            ld  ',
    '  l        ld   ',
    '  ll      ld    ',
    ' lmm    lmd     ',
    ' lmmm  lmd      ',
    'lmmmmmlmdl      ',
    'lmmmmlmdmml     ',
    'lmmmlmd  ddml   ',
    'lmd lmd     dm  ',
    'ld           dm ',
    '              d '
  ], [4, 11]);
  const RUNE_HALBERD_HEAD = PX.patch([
    '               l',
    '              ld',
    '             ld ',
    '            ld  ',
    '  l        ld   ',
    '  ll      ld    ',
    ' lmm    lmd     ',
    ' lmLm  lmd      ',
    'lmMmLmlmdl      ',
    'lmmMmlmdmml     ',
    'lmmmlmd  ddml   ',
    'lmd lmd     dm  ',
    'ld           dm ',
    '              d '
  ], [4, 11]);
  const GLAIVE_BLADE = profile([[-2, 3, 11, 'l'], [-1, 0, 13, 'l'], [0, 0, 13, 'mmMmm'], [1, 0, 12, 'm'], [2, 0, 10, 'd'], [3, 1, 7, 'd']]);
  const GRAVEN_HEAD = profile([[-1, 0, 9, 'l'], [0, 0, 12, 'mM'], [1, 0, 9, 'd']]);
  const BANNER = [
    'llllllll',
    'lmmmmmmd',
    'lmmLmmmd',
    'lmLmLmmd',
    'lmmLmmmd',
    'lmmmmmd ',
    'lmmmmd  ',
    'lmmmd   ',
    'ldd     '
  ];

  const lashing = n => [binding(n), 'cord'];
  const wetGrip = n => [run(-1, ['lm', 'md'], n), 'cord'];
  const hang = (sk, step, band, rows, ...inks) => { const [x, y] = diagonal(step, band); return stamp(sk, x, y, rows, inks); };

  const stoneSpear = () => assemble([[haft(21), 'wood'], -3, lashing(3), -1, [FLINT_POINT, 'flint']]);
  const bronzeSocketedSpear = () => assemble([[haft(14), 'ash'], [SOCKET, 'bronze'], [RIBBED_HEAD, 'bronze']]);
  const steelBoarSpear = () => assemble([[haft(13), 'wood'], -10, wetGrip(6), 4, [SOCKET, 'steel'], [crossbar(5), 'steel'], -1, [BOAR_HEAD, 'steel']]);
  const stoneHoe = () => assemble([[haft(25), 'wood'], -6, lashing(1), [STONE_HOE_BLADE, 'stone', 'cord']]);
  const ironHoe = () => assemble([[haft(25), 'wood'], -6, [IRON_HOE_BLADE, 'iron']]);

  const boneTippedSpear = () => assemble([[haft(20), 'wood'], -3, [binding(4), 'hide'], -1, [BONE_SPLINTER, 'bone']]);
  const copperSpear = () => assemble([[haft(17), 'wood'], [SOCKET, 'copper'], [COPPER_LEAF, 'copper']]);
  const leafBladeSpear = () => assemble([[haft(11), 'ash'], [SOCKET, 'bronze'], [BRONZE_LEAF, 'bronze', 'gold']]);
  const goblinHookedSpear = () => assemble([[haft(18), 'sapwood'], -4, [binding(3), 'leather'], -1, [HOOK_HEAD, 'bronze']]);
  const koboldTrapSpear = () => hang(assemble([[haft(18), 'wood'], [COLLAR, 'bronze'], [TRAP_HEAD, 'bronze']]), 13, 1, SNARE, 'cord');
  const greatTuskImpaler = () => assemble([[haft(14), 'wood'], -4, [binding(5), 'red'], -1, [TUSK, 'bone']]);
  const framea = () => assemble([[haft(16), 'ash'], [SOCKET, 'iron'], [FRAMEA_HEAD, 'iron']]);
  const steelPike = () => assemble([[haft(17), 'ash'], -1, [LANGET, 'steel'], [NEEDLE, 'steel']]);
  const ironWingedSpear = () => assemble([[haft(11), 'wood'], [SOCKET, 'iron'], [LUGS, 'iron'], [HEAD.leaf(10), 'iron']]);
  const steelHalberd = () => assemble([[haft(17), 'ash'], [HALBERD_HEAD, 'steel']]);
  const runeEtchedHalberd = () => assemble([[haft(15), 'black'], [binding(2), 'gold'], [RUNE_HALBERD_HEAD, 'runed', 'glow']]);
  const runeGravenSpear = () => assemble([[haft(13), 'black'], [binding(2), 'gold'], [SOCKET, 'runed'], [GRAVEN_HEAD, 'runed', 'glow']]);
  const runeStandardGlaive = () => hang(assemble([[haft(14), 'black'], [crossbar(2), 'gold'], [GLAIVE_BLADE, 'runed', 'glow']]), 12, 2, BANNER, 'red', 'gold');

  return [
    { id: 'stone_spear', draw: stoneSpear },
    { id: 'bronze_socketed_spear', draw: bronzeSocketedSpear },
    { id: 'steel_boar_spear', draw: steelBoarSpear },
    { id: 'stone_hoe', draw: stoneHoe },
    { id: 'iron_hoe', draw: ironHoe },
    { id: 'bone_tipped_spear', draw: boneTippedSpear },
    { id: 'copper_spear', draw: copperSpear },
    { id: 'leaf_blade_spear', draw: leafBladeSpear },
    { id: 'goblin_hooked_spear', draw: goblinHookedSpear },
    { id: 'kobold_trap_spear', draw: koboldTrapSpear },
    { id: 'great_tusk_impaler', draw: greatTuskImpaler },
    { id: 'framea', draw: framea },
    { id: 'steel_pike', draw: steelPike },
    { id: 'iron_winged_spear', draw: ironWingedSpear },
    { id: 'steel_halberd', draw: steelHalberd },
    { id: 'rune_etched_halberd', draw: runeEtchedHalberd },
    { id: 'rune_graven_spear', draw: runeGravenSpear },
    { id: 'rune_standard_glaive', draw: runeStandardGlaive }
  ];
})();
PIXEL_ICONS.push(...PIXEL_POLES);
