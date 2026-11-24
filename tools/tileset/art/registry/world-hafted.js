'use strict';
(() => {
  const { part, run, stack, mirror } = PX, { POMMEL, grip, wrapped } = WORLD_ITEMS.parts;

  const shaft = n => run(-1, ['m', 'd'], n);
  const beam = n => run(-1, ['l', 'm', 'd'], n);
  const graven = n => run(-1, ['m', 'dddL'], n);
  const cap = part(-1, ['m', 'd']);
  const SHADE_RIGHT = { l: 'd', d: 'l', L: 'D', D: 'L' };
  const symmetric = (upper, middle) => stack(upper, mirror(upper, SHADE_RIGHT), middle);

  const AXE = {
    biface: part(-7, [
      ' lll   ',
      'llmml  ',
      'lmdmmd ',
      'lmmdmd ',
      ' lmmd  ',
      'yzyzyz ',
      'xyxyxy ',
      'yxyxyx ',
      ' xxxx  '
    ]),
    chopper: part(-5, [
      '  llll     ',
      ' llmmmll   ',
      'lmmmmmmmll ',
      'lmmmmmmmmml',
      'mmmmmmmmmmm',
      'dmmmmmmmmmd',
      ' dddddddddd'
    ]),
    celt: part(-7, [
      'lll  ',
      'lmmd ',
      'lmmd ',
      ' lmd ',
      ' lmd ',
      ' lmd ',
      'yzyzy',
      'xyxyx',
      ' dmd ',
      '  d  '
    ]),
    felling: part(-8, [
      'llllllll ',
      'lmmmmmmd ',
      ' lmmmmd  ',
      '  lmmmd  ',
      '  lmmd   ',
      '  lmmd   ',
      ' lmmmmd  ',
      ' lmmmmd  ',
      ' dmmmmd  ',
      '  dddd   '
    ]),
    bearded: part(-9, [
      '     lllll ',
      'lllllmmmmml',
      'dmmmmmmmmmd',
      ' ddmmmmmmd ',
      '   ddmmmd  ',
      '     lmmd  ',
      '     lmmd  ',
      '    lmmmmd ',
      '    lmmmmd ',
      '    dmmmmd ',
      '     dddd  '
    ]),
    hatchet: part(-7, [
      'lllllll',
      'lmmmmmd',
      ' dmmmd ',
      '  lmd  ',
      '  lmd  ',
      ' ddddd ',
      ' lmmmd ',
      ' dmmmd ',
      ' ddddd '
    ]),
    gnoll: part(-8, [
      ' l l l  ',
      'llmlmll ',
      'lmdmmdm ',
      'lmmdmmd ',
      ' mdmmd  ',
      ' lmmdd  ',
      'DMDMDM  ',
      'ODODOD  ',
      'DODODO  ',
      ' OOOOyz ',
      '     xy ',
      '     yz ',
      '     x  '
    ]),
    flat: part(-12, [
      'llll',
      'lmmd',
      'lmmd',
      ' lmd',
      ' lmd',
      'yzzy',
      'xyyx',
      ' MD ',
      ' MD ',
      ' MD ',
      ' MD ',
      'MMD ',
      'DDD '
    ]),
    cheek: part(-9, [
      'llllllllll',
      'lmmmmmmmmd',
      ' lmmmmmmd ',
      '  LMMMMD  ',
      '   LMMD   ',
      '   LMMD   ',
      '  LMMMMD  ',
      '  LMMMMD  ',
      '  DMMMMD  ',
      '   DDDD   '
    ]),
    splitting: part(-9, [
      ' llllllll ',
      'lmmmmmmmmd',
      'lmLLmLLmd ',
      ' lmmmmmmd ',
      '  lmMMmd  ',
      '   lmmd   ',
      '  dddddd  ',
      '  lmmmmd  ',
      '  lmLLmd  ',
      '  dddddd  '
    ]),
    serrated: part(-10, [
      'l l l l l  ',
      'lllllllll  ',
      'lmmmmmmmmd ',
      ' lmmmmmmd  ',
      '  lmmmmd   ',
      '   lmmd    ',
      '   lmmd    ',
      '  lmmmmd   ',
      '  lmmmmd   ',
      '  dmmmmd   ',
      '   lmmd    ',
      '   lmd     ',
      '   ld      ',
      '   d       '
    ]),
    crescent: part(-11, [
      '  llllllll  ',
      ' lmmmmmmmml ',
      'lmmmmmmmmmmd',
      'lmmmmmmmmmmd',
      'lmmmmmmmmmmd',
      'ld  lmmd  ld',
      'l   lmmd   d',
      '    lmmd    ',
      '   lmmmmd   ',
      '   lmmmmd   ',
      '   dmmmmd   ',
      '    dddd    '
    ]),
    halfmoon: part(-11, [
      '       lllllll ',
      '   lllllmmmmmml',
      ' llmmmmmmmmmmmd',
      'lmmmmmmmmmmmmd ',
      ' ddmmmmmmmmmd  ',
      '   dddmmmmmd   ',
      '       lmmd    ',
      '      lmmmmd   ',
      '      lmmmmd   ',
      '      dmmmmd   ',
      '       dddd    '
    ]),
    labrys: symmetric(part(-10, [
      'lllllllll',
      'lmmmmmmmd',
      ' lmmmmmd ',
      ' lmmmmmd ',
      '  lmmmd  ',
      '  lmmmd  ',
      '   lmd   ',
      '   lmd   ',
      '  lmmmd  '
    ]), part(-1, ['  lmmmd  ', '  dmmmd  '])),
    graven: part(-13, [
      '   llllllllll   ',
      ' llmmmmmmmmmmll ',
      'lmmmmmmmmmmmmmmd',
      'lmmLLmLLLmLLmmmd',
      'lmmmMmMMMmMMmmmd',
      'lmmmmmmmmmmmmmmd',
      'lmm  lmmmmd  mmd',
      'lm    lmmd    md',
      'l     lmmd     d',
      '     lmmmmd     ',
      '     lmLLmd     ',
      '     lmmmmd     ',
      '     dmmmmd     ',
      '      dddd      '
    ]),
    orcDouble: symmetric(part(-11, [
      'l ll l ll ',
      'lllllllll ',
      'lmmmmmmmmd',
      'lmmmmmmmmd',
      ' lmmmmmmd ',
      '  lmmmmd  ',
      '   lmmd   ',
      '   lmmd   ',
      '   lmmd   ',
      '  dddddd  '
    ]), part(-1, ['  LMMMMD  ', '  DMMMMD  '])),
    tide: part(-14, [
      '              lll',
      '   llllllll   ll ',
      ' lllmmmmmmmlll   ',
      'llMMMMMMMMMMMMl  ',
      'lmmmmmmmmmmmmmmd ',
      'lmmmmmmmmmmmmmmd ',
      'lmMMmmmmmmmmmmd  ',
      ' ld  lmmmmmmd    ',
      ' l    lmmmmd     ',
      '       lmmd      ',
      '       lMMd      ',
      '      dddddd     ',
      '      LMMMMD     ',
      '      dmmmmd     ',
      '      DMMMMD     ',
      '      dddddd     ',
      '       lmmd      ',
      '       lmd       ',
      '        d        '
    ])
  };

  const BLUNT = {
    cobble: part(-4, [
      ' llll  ',
      'lmmmml ',
      'lmmmmmd',
      'yzyzmmd',
      'xyxymmd',
      'dmmmmmd',
      ' ddddd '
    ]),
    block: symmetric(part(-6, [
      'lllll',
      'lmmmd',
      'lmmmd',
      'yzyzy',
      'xyxyx'
    ]), part(0, ['lmmmd'])),
    boulder: symmetric(part(-8, [
      ' lllll ',
      'lmmmmml',
      'lmmmmmd',
      'lmmmmmd',
      'yzyzyzy',
      'xyxyxyx',
      'lmmmmmd'
    ]), part(0, ['lmmmmmd'])),
    knobbed: symmetric(part(-4, [
      '  lll ',
      ' lmmml',
      'lmmlmd',
      'lmmmmd'
    ]), part(0, ['lmmmmd'])),
    flanged: symmetric(part(-5, [
      ' lll  ',
      ' lmd  ',
      'llllll',
      'lmmmmd',
      'lmmmmd'
    ]), part(0, ['llllll'])),
    claw: part(-6, [
      'llll ',
      'lmmd ',
      ' lmd ',
      ' lmd ',
      ' lmd ',
      'llmmd',
      'dmmmd',
      ' lmd ',
      ' lmd ',
      'lmd  ',
      'ld   '
    ]),
    ribbed: symmetric(part(-5, [
      '  llll ',
      ' lllll ',
      ' dddddd',
      'lmmmmmd',
      'llllll '
    ]), part(0, ['dddddd '])),
    steelFlanges: symmetric(part(-6, [
      ' llll ',
      ' lmmd ',
      '  ld  ',
      'llllll',
      'lmmmmd',
      'lmmmmd'
    ]), part(0, ['llllll'])),
    runeFlanges: symmetric(part(-6, [
      ' llll ',
      ' LMLd ',
      '  ld  ',
      'llllll',
      'lmmmmd',
      'lmmmmd'
    ]), part(0, ['lLMLld'])),
    maulBlock: symmetric(part(-7, [
      'llllll',
      'lmmmmd',
      'dddddd',
      'lmmmmd',
      'lmmmmd',
      'lmmmmd',
      'lmmmmd'
    ]), part(0, ['lmmmmd'])),
    anvil: symmetric(part(-8, [
      ' llllll ',
      'lmmmmmmd',
      'lmmmmmmd',
      'lmmmmmmd',
      'LLLLLLLL',
      'DDDDDDDD',
      'lmmmmmmd',
      'lmmmmmmd'
    ]), part(0, ['lmmmmmmd'])),
    jagged: symmetric(part(-9, [
      'l  l  l ',
      'll lll l',
      'lmllmmld',
      'lmmmmmd ',
      ' lmmmmmd',
      'lmmmmmd ',
      'lmmmmmmd',
      ' lmmmmmd',
      'lmmmmmmd'
    ]), part(0, ['lmmmmmmd'])),
    femur: symmetric(part(-9, [
      'll  ll ',
      'lmllmmd',
      'lmmmmmd',
      ' lmmmd ',
      ' lmmmd ',
      ' lmmmd ',
      'LLLLLLL',
      'DDDDDDD',
      ' lmmmd '
    ]), part(0, ['LLLLLLL'])),
    warhammer: part(-7, [
      ' lll    ',
      ' lmd    ',
      ' lmd    ',
      ' lmd    ',
      ' ddd    ',
      'lllll   ',
      'lmmmmlll',
      'dmmmmddd',
      'ddddd   ',
      ' lmd    ',
      ' lmd    ',
      ' lmd    ',
      ' ld     ',
      ' ld     ',
      ' d      '
    ]),
    beaked: part(-7, [
      ' lll     ',
      ' lmd     ',
      ' lmd     ',
      ' lmd     ',
      ' ddd     ',
      'lllll    ',
      'lmmmmllll',
      'dmmmmdddd',
      'ddddd    ',
      ' lmd     ',
      ' lmd     ',
      'lmd      ',
      'lmd      ',
      'ld       ',
      'd        '
    ]),
    runeHammer: symmetric(part(-8, [
      'llllll',
      'lLMLMd',
      'lmmmmd',
      ' lmmd ',
      ' lmmd ',
      'dddddd',
      'lmmmmd',
      'lmmmmd'
    ]), part(0, ['lmLMmd']))
  };

  const ANTLER = stack(
    part(-2, [
      '      l              l   ',
      'yzyzylllllllllllllllllll ',
      'xyxyxmmmmmmmmmmmmmmmmmmml',
      'wxwxwddddddddddddddddddd '
    ]),
    part(-6, [
      '         l     l    ',
      '        lm    lm    ',
      '       lm    lm     ',
      '      lm    lm      '
    ])
  );
  const NET = part(-3, [
    ' l    y  y  y  y  l ',
    'lmdzyzyzyzyzyzyzlmd ',
    ' dyxyxyxyxyxyxyxyd  ',
    '  zyzyzyzyzyzyzyz   ',
    ' lxyxyxyxyxyxyxyxl  ',
    'lmdy  y  y  y  y lmd',
    ' d                d '
  ]);

  const LINK = part(-1, ['ld', 'dl']);
  const BALL = symmetric(part(-3, [' lll ', 'lmmmd', 'lmmmd']), part(0, ['lmmmd']));
  const KNOBS = symmetric(part(-3, [' l l ', 'lmlmd', 'lmmmd']), part(0, ['lmmmd']));
  const SPIKES = symmetric(part(-4, ['  l  ', ' lll ', 'lmmmd', 'lmmmd']), part(0, ['llmmdd']));
  const GREAT_SPIKES = symmetric(part(-5, ['   l   ', ' l l l ', '  lmm  ', ' lmmmd ', 'llmmmdd']), part(0, ['lmmmmmd']));
  const RUNE_SPIKES = symmetric(part(-5, ['   l   ', ' l l l ', '  lMm  ', ' lmLmd ', 'llmMmdd']), part(0, ['lmLMLmd']));
  const THREE_HEADS = part(-7, [
    '        l l ',
    '       lmlmd',
    '       lmmmd',
    '     D  ddd ',
    '    L       ',
    '   D    l l ',
    'LDL    lmlmd',
    'DLDLDLDlmmmd',
    '   L    ddd ',
    '    D       ',
    '     L  l l ',
    '       lmlmd',
    '       lmmmd',
    '        d d '
  ]);
  const chainOf = (ink, n) => Array.from({ length: n }, () => [LINK, ink]);

  const wood = n => [shaft(n), 'wood'];
  const drawn = (pieces, extra) => ({ pieces, headBelow: true, ...extra });
  const DRAWINGS = {
    flint_handaxe: drawn(() => [wood(16), -1, [AXE.biface, 'flint', 'flint', 'cord']]),
    stone_chopper: drawn(() => [[beam(8), 'wood'], -8, [wrapped(3), 'cord'], 4, [AXE.chopper, 'stone']]),
    copper_axe: drawn(() => [wood(19), -1, [AXE.celt, 'copper', 'copper', 'cord']]),
    iron_axe: drawn(() => [wood(23), -1, [AXE.felling, 'iron']]),
    bearded_axe: drawn(() => [[grip(6), 'leather'], wood(17), -2, [AXE.bearded, 'iron']]),
    cast_bronze_hatchet: drawn(() => [wood(16), -1, [AXE.hatchet, 'bronze']]),
    gnoll_flint_axe: drawn(() => [wood(17), -1, [AXE.gnoll, 'flint', 'hide', 'fur']]),
    copper_flat_axe: drawn(() => [wood(19), -1, [AXE.flat, 'copper', 'wood', 'cord']]),
    steel_broadaxe: drawn(() => [[POMMEL.dot, 'iron'], [grip(6), 'leather'], wood(15), -2, [AXE.cheek, 'steel', 'iron']]),
    rune_etched_axe: drawn(() => [[POMMEL.jewel, 'gold', 'sapphire'], [wrapped(6), 'wool'], wood(15), -2, [AXE.splitting, 'runed', 'glow']]),
    orc_serrated_axe: drawn(() => [[wrapped(8), 'leather'], [shaft(13), 'black'], -1, [AXE.serrated, 'black']]),
    iron_broadaxe: drawn(() => [[grip(8), 'leather'], wood(16), -1, [AXE.crescent, 'iron']]),
    steel_greataxe: drawn(() => [[POMMEL.dot, 'steel'], [grip(8), 'leather'], wood(13), -1, [AXE.halfmoon, 'steel']]),
    bronze_double_axe: drawn(() => [wood(26), -1, [AXE.labrys, 'bronze']]),
    rune_bitten_greataxe: drawn(() => [[POMMEL.jewel, 'gold', 'sapphire'], [wrapped(8), 'wool'], [graven(12), 'wood', 'glow'], -1, [AXE.graven, 'runed', 'glow']]),
    orc_greataxe: drawn(() => [[wrapped(9), 'red'], [beam(15), 'black'], -1, [AXE.orcDouble, 'black', 'red']]),
    iron_tide_greataxe: drawn(() => [[POMMEL.block, 'copper'], [wrapped(8), 'red'], [shaft(10), 'black'], -1, [AXE.tide, 'black', 'copper']]),

    stone_club: drawn(() => [wood(14), -3, [BLUNT.cobble, 'stone', 'stone', 'cord']]),
    stone_hammer: drawn(() => [wood(18), -1, [BLUNT.block, 'stone', 'stone', 'cord']]),
    stone_maul: drawn(() => [[beam(25), 'wood'], -1, [BLUNT.boulder, 'stone', 'stone', 'cord'], -1, [beam(2), 'wood']]),
    copper_mace: drawn(() => [[shaft(17), 'ash'], [KNOBS, 'copper'], -2, [BLUNT.knobbed, 'copper']]),
    iron_mace: drawn(() => [[POMMEL.dot, 'iron'], [grip(5), 'leather'], wood(12), [BLUNT.flanged, 'iron'], [cap, 'iron']]),
    iron_hammer: drawn(() => [wood(13), -1, [BLUNT.claw, 'iron']]),
    antler_club: drawn(() => [[ANTLER, 'bone', 'cord', 'hide']]),
    bronze_flanged_mace: drawn(() => [wood(16), [BLUNT.ribbed, 'bronze'], [cap, 'bronze']]),
    steel_mace: drawn(() => [[POMMEL.block, 'steel'], [grip(6), 'leather'], wood(11), [BLUNT.steelFlanges, 'steel'], [cap, 'steel']]),
    rune_ribbed_mace: drawn(() => [[POMMEL.jewel, 'gold', 'sapphire'], [wrapped(6), 'wool'], wood(11), [BLUNT.runeFlanges, 'runed', 'glow'], [cap, 'gold']]),
    bronze_maul: drawn(() => [[grip(8), 'leather'], [shaft(21), 'ash'], -1, [BLUNT.maulBlock, 'bronze'], -1, [shaft(2), 'ash']]),
    iron_warhammer: drawn(() => [[grip(8), 'leather'], wood(21), -1, [BLUNT.warhammer, 'iron'], -2, [cap, 'iron']]),
    steel_warhammer: drawn(() => [[POMMEL.block, 'steel'], [grip(7), 'leather'], wood(19), -1, [BLUNT.beaked, 'steel'], -2, [cap, 'steel']]),
    rune_weighted_warhammer: drawn(() => [[POMMEL.jewel, 'gold', 'sapphire'], [wrapped(8), 'wool'], wood(19), -1, [BLUNT.runeHammer, 'runed', 'glow'], -1, [cap, 'gold']]),
    anvil_breaker: drawn(() => [[POMMEL.block, 'black'], wood(5), [wrapped(14), 'iron'], wood(7), -1, [BLUNT.anvil, 'black', 'iron']]),
    orc_maul: drawn(() => [[wrapped(9), 'red'], [beam(19), 'black'], -1, [BLUNT.jagged, 'black'], -1, [beam(2), 'black']]),
    great_bone_maul: drawn(() => [[grip(8), 'leather'], wood(20), -1, [BLUNT.femur, 'bone', 'iron']]),
    goblin_net: drawn(() => [[NET, 'ember', 'cord', 'string']]),

    bronze_chain_flail: drawn(() => [wood(14), [cap, 'bronze'], ...chainOf('bronze', 4), [KNOBS, 'bronze']]),
    iron_ball_flail: drawn(() => [[POMMEL.dot, 'iron'], [grip(6), 'leather'], wood(8), [cap, 'iron'], ...chainOf('iron', 3), [BALL, 'iron']]),
    steel_flail: drawn(() => [[POMMEL.block, 'steel'], [grip(6), 'leather'], wood(8), [cap, 'steel'], ...chainOf('steel', 4), [SPIKES, 'steel']]),
    rune_chained_flail: drawn(() => [[POMMEL.jewel, 'gold', 'sapphire'], [wrapped(6), 'wool'], wood(8), [cap, 'gold'], ...chainOf('runed', 4), [BALL, 'runed']]),
    steel_greatflail: drawn(() => [[POMMEL.block, 'steel'], [grip(8), 'leather'], wood(8), [cap, 'steel'], ...chainOf('steel', 4), [GREAT_SPIKES, 'steel']]),
    rune_lashing_greatflail: drawn(() => [[POMMEL.jewel, 'gold', 'sapphire'], [wrapped(7), 'wool'], [graven(9), 'wood', 'glow'], [cap, 'gold'], ...chainOf('runed', 4), [RUNE_SPIKES, 'runed', 'glow']]),
    chainbiter: drawn(() => [[POMMEL.ring, 'black'], [wrapped(8), 'red'], [shaft(10), 'black'], [cap, 'black'], [THREE_HEADS, 'black', 'iron']])
  };

  WORLD_ITEMS.add(DRAWINGS);
})();
