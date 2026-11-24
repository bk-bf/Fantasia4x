'use strict';
const PIXEL_TOOLS = (() => {
  const { assemble, part, patch, profile, run, stack, strip, mirror } = PX, { haft, binding, crossbar, grip, POMMEL, BLADE } = PARTS;

  const rungs = (from, to, at, tones) => part(from, Array.from({ length: to - from + 1 }, (_, i) => ' '.repeat(at) + tones[i % tones.length]));

  const PICK_ARM = part(-13, [
    'l      ',
    'ml     ',
    'ml     ',
    ' ml    ',
    ' ml    ',
    '  ml   ',
    '  dml  ',
    '   dml ',
    '  dmml ',
    '   dml ',
    '  dmml ',
    '   dml ',
    '  dmml '
  ]);
  const PICK_HEAD = stack(PICK_ARM, mirror(PICK_ARM, { l: 'm' }), strip(0, 3, 6, 'dml'));

  const SAW_FRAME = stack(
    strip(-9, 3, 23, 'l'), strip(-8, 3, 23, 'm'),
    rungs(-7, 0, 3, ['lm', 'md']), rungs(-7, 0, 21, ['lm', 'md']),
    strip(0, 0, 3, 'l'), strip(1, 0, 4, 'm'), strip(2, 0, 4, 'd')
  );
  const SAW_BLADE = stack(strip(1, 4, 23, 'l'), strip(2, 4, 23, 'm'), strip(3, 5, 22, 'm '));

  const HAIRPIN = profile([
    [-5, 3, 22, 'l'], [-4, 2, 23, 'm'], [4, 2, 23, 'm'], [5, 3, 22, 'd'],
    [-3, 1, 3, 'l'], [-2, 0, 2, 'l'], [-1, 0, 2, 'm'], [0, 0, 2, 'm'], [1, 0, 2, 'm'], [2, 0, 2, 'd'], [3, 1, 3, 'd'],
    [-3, 22, 24, 'm'], [-2, 24, 25, 'm'], [3, 22, 24, 'd'], [2, 24, 25, 'd']
  ]);
  const HAIRPIN_LASHING = rungs(-5, 5, 5, ['lm', 'ml']);

  const REIN = profile([
    [-5, 0, 12, 'l'], [-4, 0, 12, 'm'],
    [-4, 12, 14, 'l'], [-3, 12, 14, 'm'],
    [-3, 14, 16, 'l'], [-2, 14, 16, 'm'],
    [1, 18, 20, 'm'], [2, 18, 20, 'd'],
    [2, 20, 23, 'm'], [3, 20, 23, 'd'],
    [1, 23, 25, 'm'], [2, 23, 25, 'd']
  ]);
  const PIVOT = profile([[-2, 16, 18, 'l'], [-1, 15, 18, 'm'], [0, 16, 19, 'm'], [1, 15, 18, 'm'], [2, 16, 18, 'd'], [0, 17, 18, 'l']]);
  const TONGS = stack(REIN, mirror(REIN, { l: 'd', d: 'l' }), PIVOT);

  const KNAPPED_BLADE = stack(profile([[-2, 1, 6, 'm'], [-1, 0, 8, 'm'], [0, 1, 10, 'm'], [1, 0, 9, 'l'], [2, 2, 9, 'l']]), strip(-1, 2, 3, 'd'), strip(0, 5, 6, 'd'), strip(-2, 3, 4, 'd'));


  const FIRED_POINT = profile([[-1, 0, 3, 'm'], [0, 0, 5, 'l'], [0, 0, 2, 'm'], [1, 0, 2, 'd']]);
  const KNOT = part(-3, ['l', 'm', 'd']);
  const SPADE_STONE = stack(
    profile([[-4, 2, 10, 'l'], [-3, 1, 11, 'l'], [-2, 0, 11, 'm'], [-1, 0, 11, 'm'], [0, 0, 11, 'm'], [1, 0, 11, 'm'], [2, 0, 11, 'd'], [3, 1, 11, 'd'], [4, 2, 10, 'd']]),
    strip(-1, 4, 6, 'l'), strip(1, 7, 9, 'l'), strip(-2, 8, 9, 'd'), strip(2, 3, 5, 'm'), strip(-3, 10, 11, 'm')
  );
  const blade = (ends, tones) => profile(ends.map((end, i) => [i - 4, Math.abs(i - 4) > 3 ? 1 : 0, end, tones[i]]));
  const SHOVEL_IRON = stack(blade([8, 9, 10, 10, 10, 10, 10, 9, 8], 'llmmmmmdd'), strip(0, 1, 6, 'd'));
  const SHOVEL_STEEL = stack(profile([[-5, 0, 5, 'l'], [-4, 0, 7, 'l'], [-3, 0, 8, 'l'], [-2, 0, 9, 'm'], [-1, 0, 9, 'm'], [0, 0, 10, 'm'], [1, 0, 9, 'm'], [2, 0, 9, 'm'], [3, 0, 8, 'd'], [4, 0, 7, 'd'], [5, 0, 5, 'd']]), strip(-1, 1, 8, 'l'), strip(0, 1, 8, 'd'), profile([[-6, 0, 2, 'l'], [6, 0, 2, 'd']]));
  const SOCKET = part(-1, ['lll', 'mmm', 'ddd']);
  const STEEL_HOE_BLADE = part(-12, [
    'l     ',
    'll    ',
    'lml   ',
    'lmmm  ',
    'ldmmm ',
    '  dmm ',
    '   dm ',
    '   dmm',
    '   dm ',
    '   dmm',
    '   ll ',
    '   mmm',
    '   dd '
  ]);
  const STONE_POINT = patch([
    'l           ',
    'll          ',
    'lml         ',
    'lmml        ',
    ' lmml       ',
    ' dlmml      ',
    '  dmmml     ',
    '   dmmml    ',
    '    dmmmm   ',
    '     dmmmm  ',
    '      ddmm  ',
    '       ddd  '
  ], [8, 8], 0);
  const LONG_ARM = part(-14, [
    'l      ',
    'l      ',
    'ml     ',
    'ml     ',
    ' ml    ',
    ' ml    ',
    '  ml   ',
    '  dml  ',
    '   dml ',
    '  dmml ',
    '   dml ',
    '  dmml ',
    '   dml ',
    '  dmml '
  ]);
  const STEEL_PICK_HEAD = stack(LONG_ARM, mirror(LONG_ARM, { l: 'm' }), strip(0, 3, 6, 'dml'));
  const RUNE_PICK_HEAD = stack(STEEL_PICK_HEAD, strip(-9, 4, 5, 'L'), strip(-5, 5, 6, 'L'), strip(5, 5, 6, 'L'), strip(9, 4, 5, 'L'), strip(0, 4, 5, 'L'));
  const TORCH_WRAP = run(-2, ['ml', 'lm', 'md', 'dm'], 6);
  const FLAME = patch([
    '   z    ',
    '   yz   ',
    '  zyy  z',
    '  yyxz y',
    ' zyxzxyy',
    ' yxzzzxy',
    'zyxzzzxy',
    'yxzzzzxy',
    'yxzzzzy ',
    ' yxzzxy ',
    '  yyyy  '
  ], [2, 9], 0);

  const BONE_SLAB = part(-8, [
    ' lllllllllll',
    'lmmmmmmmmmml',
    'lmmmmmmmmmmm',
    'mmmmmmmmmmmm',
    'mmmmmmmmmmmd',
    'mmmmmmmm  md',
    'mmmmmmmm  dd',
    'mmmmmmmmmmdd',
    'dddddddddddd'
  ]);
  const KNIFE_BLADE = profile([[-1, 0, 9, 'l'], [0, 0, 11, 'm'], [1, 0, 10, 'm'], [2, 1, 8, 'd']]);
  const SCAPULA = patch([
    '     l        ',
    '     ll       ',
    '     lml      ',
    '    lmmml     ',
    '    lmmmll    ',
    '    lmmldml   ',
    '   lmmldmmml  ',
    '   lmldmmmmdll',
    '   lldmmmdd   ',
    '  lldmddd     ',
    '  lddd        ',
    '  ld          ',
    ' l            '
  ], [1, 12]);
  const DRAW_BLADE = PX.mirrored([
    'lm                          ml',
    'mm                          mm',
    'mm                          mm',
    'dm                          md',
    ' mm                        mm ',
    ' dmLLllllllllllllllllllllLLmd ',
    '  MMMMmmmmmmmmmmmmmmmmmmMMMM  ',
    '    MMMMMMmmmmmmmmmmMMMMMM    ',
    '       DDDDDDDDDDDDDDDD       '
  ]);
  const CANDLE = [
    '    z    ',
    '   zy    ',
    '   yxz   ',
    '   yxy   ',
    '    y    ',
    '    O    ',
    '  lllll  ',
    ' lmmmmml ',
    ' lmmmmmd ',
    ' lmmmmmd ',
    ' lmmmmmd ',
    ' lmmmmmd ',
    ' lmmmmmd ',
    ' lmmmmmd ',
    ' lmmmmmd ',
    ' lmmmmmd ',
    ' lmmmmmdd',
    'dllmmmmdd',
    'ldmdddddd'
  ];
  const INGOT_MOLD = PX.mirrored([
    '  llllllllllllllllll  ',
    ' lmmmmmmmmmmmmmmmmmml ',
    'lmmmmmmmmmmmmmmmmmmmml',
    'lmmmmoooooooooooommmml',
    'lmmmmoddddddddddommmml',
    'lmmmmodmmmmmmmmdommmml',
    'lmmmmmdmmmmmmmmdmmmmml',
    'lmmmmmmllllllllmmmmmml',
    'dmmmmmmmmmmmmmmmmmmmmd',
    'ddmmmmmmmmmmmmmmmmmmdd',
    ' dddddddddddddddddddd ',
    '  dddddddddddddddddd  '
  ]);
  const TILE_MOLD = PX.mirrored([
    '     llllllllllll     ',
    '   llmmmmmmmmmmmmll   ',
    '  lmmddddddddddddmml  ',
    'llmmdLLLLLLLLLLLLdmmll',
    'mmmmdLLLMMMMMMDDDdmmmm',
    'ddmmdLLMMMMMMMMDDdmmdd',
    '  mmdLLMMMMMMMMDDdmm  ',
    '  mmdLLMMMMMMMMDDdmd  ',
    '  mmdLLMMMMMMMMDDdmd  ',
    '  mmmdDDDDDDDDDDdmmd  ',
    '   dmmmmmmmmmmmmmmd   ',
    '    dddddddddddddd    '
  ]);
  const COOKING_POT = [
    '   llllllllll   ',
    '  lmooooooooml  ',
    '  dlmmmmmmmmld  ',
    '   dmmmmmmmmd   ',
    '  lmmmmmmmmmmd  ',
    ' lmmlmmmmmmmmmd ',
    'lmmlmmmmmmmmmmmd',
    'lmmlmmmmmmmmmmmd',
    'lmmmmmmmmmmmmmmd',
    'lmmmmmmmmmmmmmdd',
    'dmmmmmmmmmmmmmdd',
    ' dmmmmmmmmmmddd ',
    '  ddmmmmmmmmdd  ',
    '  dddDDDDDdddd  ',
    '   DDDDDDDDDD   '
  ];

  const WHEELBARROW = [
    'll                            ',
    'mmll                          ',
    'ddmmll                        ',
    '  ddmmlllllllllllllllllllll   ',
    '    dmmmmmmmmmmmmmmmmmmmmml   ',
    '     lmmmdmmmmmmdmmmmmmmmd    ',
    '     lmmmdmmmmmmdmmmmmmmd     ',
    '      lmmdmmmmmmdmmmmmmd      ',
    '      lmmdmmmmmmdmmmmmd       ',
    '       ddddddddddddddd        ',
    '        dd   dd  LLLLL        ',
    '        mm   dd LMMMMML       ',
    '        mm    dLMmmmmmML      ',
    '        mm     LMmlllmMD      ',
    '        mm    LMmlmmmlmMD     ',
    '        mm    LMmlmoomlMD     ',
    '        dd    MMmlmoomlMD     ',
    '        dd    MMmmlmmlmMD     ',
    '       dddd    MMmmllmMD      ',
    '               DMMmmmMDD      ',
    '                DDMMMDD       ',
    '                 DDDDD        '
  ];
  const HANDCART = [
    '        llllllllllllllllllllll',
    '        lmmmmldmmmmmmmmldmmmmd',
    '        lmmmmldmmmmmmmmldmmmmd',
    '        lddddldddddddddldddddd',
    '        lmmmmldmmmmmmmmldmmmmd',
    '        lddddldddddddddldddddd',
    'lllllllllmmmmldmmmmmmmmldmmmmd',
    'mmmmmmmmmddddddddddddddddddddd',
    'ddddddddd md     LLLLL        ',
    '          md   LLMMMMMLL      ',
    '          md  LMM  m  MMD     ',
    '          md  LM   m   MD     ',
    '          md LM    m    MD    ',
    '          md LM    m    MD    ',
    '             LMmmmmOmmmmMD    ',
    '             LM    m    MD    ',
    '             LM    m    MD    ',
    '              MD   m   DD     ',
    '              MMD  m  DDD     ',
    '               MDDDDDDDD      ',
    '                 DDDDD        '
  ];

  const BUTCHER_ROLL = [
    '               YYY        ',
    '   xx         Y  XZ       ',
    '              Y           ',
    '   yx         YX   yyyyy  ',
    '   yx  xy      X   y   x  ',
    '   yx  yx      Y   yxxxx  ',
    '   yx  yx      X    XXX   ',
    '   yx  yx      Y    XXX   ',
    '   yx  yx      X    XXX   ',
    '  llllllllllllllllllllll  ',
    ' mmmmmmmmmmmmmmmmmmmmmmmm ',
    'lmmmmmmmmmmmmmmmmmmmmmmmmd',
    'lmmmmmmmmmmmmmmmmmmmmmmmmd',
    'lmmmmmmmmmmmmmmmmmmmmmmmmd',
    'lddddddddddddddddddddddddd',
    'lmooooooooooLMoooooooooomd',
    'lmmmmmmmmmmmMLmmmmmmmmmmmd',
    'lmmmmmmmmmmmLMmmmmmmmmmmmd',
    'lmmmmmmmmmmmMLmmmmmmmmmmmd',
    'lmmmmmmmmmmmLMmmmmmmmmmmmd',
    'lmmmmmmmmmmmMLmmmmmmmmmmmd',
    ' mmmmmmmmmmmLMmmmmmmmmmmm ',
    '  dddddddddddddddddddddd  '
  ];
  const FLENSING_ROLL = [
    '               YYY        ',
    '   xx         Y  XZ       ',
    '              Y           ',
    '   yx         YX   yyyyy  ',
    '   yx  xy      X   y   x  ',
    '   yx  yx      Y   yxxxx  ',
    '   yx  yx      X    YYY   ',
    '   yx  yx      Y    YYY   ',
    '   yx  yx      X    YYY   ',
    '  lllmdllllllllllllmdlll  ',
    ' mmmmmdmmmmmmmmmmmmmdmmmm ',
    'lmmmmmdmmmmmmmmmmmmmdmmmmd',
    'lmmmmmdmmmmmmmmmmmmmdmmmmd',
    'lmmmmmdmmmmmmmmmmmmmdmmmmd',
    'ldddLLLLddddddddddLLLLdddd',
    'lmooLmdMooooooooooLmdMoomd',
    'lmmmMMMDmmmmmmmmmmMMMDmmmd',
    'lmmmmmdmmmmmmmmmmmmmdmmmmd',
    'lmmmmmdmmmmmmmmmmmmmdmmmmd',
    'lmmmmmdmmmmmmmmmmmmmdmmmmd',
    'lmmmmmdmmmmmmmmmmmmmdmmmmd',
    ' mmmmmdmmmmmmmmmmmmmdmmmm ',
    '  dddddddddddddddddddddd  '
  ];
  const CURRIER_SET = [
    '      xxxxxxxxxx          ',
    '      x        x          ',
    '      xyyyyyyyyx          ',
    'llllllllllllllllllld      ',
    'lmmmmmmmmmmmmmmmmmmd      ',
    'llllllllllllllllllld      ',
    'lddddddddddddddddddd      ',
    'llllllllllllllllllld      ',
    'lddddddddddddddddddd      ',
    'llllllllllllllllllld      ',
    'lddddddddddddddddddd      ',
    'llllllllllllllllllld      ',
    'lddddddddyyyyyyyyyyyyyyyy ',
    'lllllllllyxxxxxxxxxxxxxxw ',
    'ldddddddddLLLLLLLLLLLLLLLD',
    'ddddddddddLLLLLLLLLLLLLLLD',
    '          LMMMMMMMMMMMMMMD',
    '          LMMMMMMMMMMMMMMD',
    '          LMMMMMMMMMMMMMMD',
    '          DDDDDDDDDDDDDDDD'
  ];

  const PICK_PATCH = PX.patch([
    'll            ',
    ' ddlll        ',
    '   dmmll      ',
    '    ddmmll    ',
    '      dmmml   ',
    '       dmml   ',
    '       dmmml  ',
    '         mmml ',
    '          mmdd',
    '           ddd',
    '            d '
  ], [9, 7]);
  const lashing = n => [binding(n), 'cord'];
  const OPEN_SHEARS = [
    'l              l',
    'ml            lm',
    ' ml          lm ',
    ' dml        lmd ',
    '  dml      lmd  ',
    '   dml    lmd   ',
    '    dml  lmd    ',
    '     dmllmd     ',
    '      dLLd      ',
    '      MDDM      ',
    '     MD  DM     ',
    '  MMMM    MMMM  ',
    ' M    M  M    M ',
    ' M    D  M    D ',
    ' M    D  M    D ',
    '  DDDD    DDDD  '
  ];
  const CUSHION = [' l l l ', ' x x x ', 'llllmmd', 'lmmmmdd', 'mmmmddd', ' ddddd '];
  const LID = [
    'llllllllllllllllllllllll',
    'lmmmmmmmmmmmmmmmmmmmmmmd',
    'lmWWWWWWWWWWWWWWWWWWWWmd',
    'lmWZZZZZZZZZZZZZZZZZZYmd',
    'lmWZxZxZxZxZZZZZZZZZZYmd',
    'lmWZyZyZyZyZZZZZZZZZZYmd',
    'lmWXyXyXyXyXXXXXXXXXXXmd',
    'lmWZyZyZyZyZZZZZZZZZZYmd',
    'lmWZyZyZyZyZZZZZZZZZZYmd',
    'lmWZyZyZyZyZZZZZZZZZZYmd',
    'lmWYzYzYzYzYYYYYYYYYYXmd',
    'lmWYYYYYYYYYYYYYYYYYYXmd'
  ];
  const CASE_FRONT = [
    'llllllllllllllllllllllllllll',
    'lmmmmmmmmmmmmmmmmmmmmmmmmmmd',
    'lmmmmmmmmmmmLMMDmmmmmmmmmmmd',
    'lmmmmmmmmmmmMDDDmmmmmmmmmmmd',
    'lmmmmmmmmmmmmmmmmmmmmmmmmmmd',
    'lmmmmmmmmmmmmmmmmmmmmmmmmmmd',
    'lmmmmmmmmmmmmmmmmmmmmmmmmmmd',
    'dddddddddddddddddddddddddddd'
  ];
  const SPOOL = ['lmmmd', ' WXY ', ' WYZ ', ' WXY ', ' WYZ ', 'lmmmd'];
  const ROLL_BACK = ['llllllllllllllllllllll', ...new Array(10).fill('lmmmmmmmmmmmmmmmmmmmmm'), 'dddddddddddddddddddddd'];
  const POCKET = ['llllllllllllllllllllll', ...new Array(5).fill('lmmmmmdmmmmmdmmmmmdmmm'), 'dddddddddddddddddddddd'];
  const ROLLED_END = [' lmd ', ...new Array(14).fill('lmmdd'), ' mdd '];
  const NEEDLE = n => ['m', 'o', ...new Array(n).fill('l')];
  const AWL = [' lm ', 'lmmd', 'lmmd', 'lmmd', ' md ', ' ML ', ' MD ', ' MD ', ' MD '];
  const SKEIN = [' lmm ', 'lmlmd', 'mlmld', 'lmldd', ' mdd '];
  const sewingRoll = () => PX.layered(
    [0, 8, ROLL_BACK, 'hide'],
    [3, 2, NEEDLE(12), 'string'],
    [5, 4, NEEDLE(10), 'string'],
    [7, 3, NEEDLE(11), 'string'],
    [11, 2, AWL, 'wood', 'iron'],
    [0, 13, POCKET, 'hide'],
    [21, 7, ROLLED_END, 'hide'],
    [15, 4, SKEIN, 'cord'],
    [8, 2, ['l      ', ' l     ', '  l   l', '   lll '], 'string']
  );
  const tailorsCase = () => PX.layered(
    [2, 4, LID, 'leather', 'leather', 'steel', 'red'],
    [0, 15, CASE_FRONT, 'leather', 'gold'],
    [20, 9, SPOOL, 'wood', 'wood', 'wood', 'woad'],
    [13, 9, CUSHION, 'red', 'red', 'steel'],
    [0, 10, OPEN_SHEARS, 'steel', 'gold']
  );

  const copperPick = () => assemble([[haft(21), 'wood'], -1, [PICK_PATCH, 'copper'], -3, lashing(2)]);
  const ironPick = () => assemble([[haft(23), 'wood'], -8, [PICK_HEAD, 'iron']]);
  const saw = () => assemble([[SAW_FRAME, 'wood'], -SAW_FRAME.len, [SAW_BLADE, 'bronze']]);
  const woodenTongs = () => assemble([[HAIRPIN, 'sapwood'], -HAIRPIN.len, [HAIRPIN_LASHING, 'cord']]);
  const ironTongs = () => assemble([[TONGS, 'iron']]);
  const flintKnife = () => assemble([[run(-1, ['lm', 'md'], 6), 'hide'], -1, [KNAPPED_BLADE, 'flint']]);

  const diggingStick = () => assemble([[haft(14), 'wood'], [KNOT, 'wood'], [haft(7), 'wood'], [haft(3), 'ember'], [FIRED_POINT, 'ember']]);
  const stoneSpade = () => assemble([[crossbar(1), 'wood'], [haft(17), 'wood'], -3, lashing(3), -1, [SPADE_STONE, 'stone']]);
  const ironShovel = () => assemble([[crossbar(2), 'wood'], [haft(13), 'wood'], [SOCKET, 'iron'], [SHOVEL_IRON, 'iron']]);
  const steelShovel = () => assemble([[crossbar(2), 'steel'], [grip(3), 'leather'], [haft(8), 'ash'], [SOCKET, 'steel'], [SHOVEL_STEEL, 'steel']]);
  const steelHoe = () => assemble([[grip(5), 'leather'], [haft(20), 'ash'], -6, [STEEL_HOE_BLADE, 'steel']]);
  const stonePick = () => assemble([[haft(20), 'wood'], -1, [STONE_POINT, 'stone'], -1, lashing(2)]);
  const steelPick = () => assemble([[grip(4), 'leather'], [haft(19), 'ash'], -8, [STEEL_PICK_HEAD, 'steel']]);
  const runeEtchedPick = () => assemble([[grip(4), 'wool'], [haft(19), 'black'], -8, [RUNE_PICK_HEAD, 'runed', 'glow']]);
  const steelTongs = () => assemble([[TONGS, 'steel']]);
  const torch = () => assemble([[haft(13), 'wood'], -1, [TORCH_WRAP, 'hide'], -2, [FLAME, 'flame', 'flame', 'flame']]);

  const front = (rows, ...inks) => PX.stamp(PX.sketch(), 0, 0, rows, inks);
  const copperKnife = () => assemble([[POMMEL.dot, 'copper'], [binding(6), 'cord'], [crossbar(1), 'copper'], -1, [KNIFE_BLADE, 'copper']]);
  const boneCleaver = () => assemble([[grip(7), 'wood'], [binding(2), 'cord'], -1, [BONE_SLAB, 'bone']]);
  const boneFleshingScraper = () => assemble([[haft(15), 'wood'], [SCAPULA, 'bone'], -2, lashing(3)]);
  const ironFleshingKnife = () => front(DRAW_BLADE, 'wood', 'iron');
  const candle = () => front(CANDLE, 'linen', 'black', 'flame');
  const clayMold = () => front(INGOT_MOLD, 'clay');
  const tileMold = () => front(TILE_MOLD, 'bronze', 'clay');
  const clayCookingPot = () => front(COOKING_POT, 'clay', 'black');

  const wheelbarrow = () => front(WHEELBARROW, 'wood', 'iron');
  const handcart = () => front(HANDCART, 'wood', 'iron');

  const ironButcheryKit = () => front(BUTCHER_ROLL, 'leather', 'cord', 'wood', 'iron');
  const steelButcheryKit = () => front(FLENSING_ROLL, 'leather', 'steel', 'wood', 'steel');
  const curriersKit = () => front(CURRIER_SET, 'iron', 'iron', 'wood');
  const steelCurriersKit = () => front(CURRIER_SET, 'steel', 'steel', 'ash');
  const sewingKit = sewingRoll;
  const tailorsKit = tailorsCase;

  return [
    { id: 'copper_pick', draw: copperPick },
    { id: 'iron_pick', draw: ironPick },
    { id: 'saw', draw: saw },
    { id: 'wooden_tongs', draw: woodenTongs },
    { id: 'iron_tongs', draw: ironTongs },
    { id: 'flint_knife', draw: flintKnife },
    { id: 'digging_stick', draw: diggingStick },
    { id: 'stone_spade', draw: stoneSpade },
    { id: 'iron_shovel', draw: ironShovel },
    { id: 'steel_shovel', draw: steelShovel },
    { id: 'steel_hoe', draw: steelHoe },
    { id: 'stone_pick', draw: stonePick },
    { id: 'steel_pick', draw: steelPick },
    { id: 'rune_etched_pick', draw: runeEtchedPick },
    { id: 'steel_tongs', draw: steelTongs },
    { id: 'torch', draw: torch },
    { id: 'copper_knife', draw: copperKnife },
    { id: 'bone_cleaver', draw: boneCleaver },
    { id: 'bone_fleshing_scraper', draw: boneFleshingScraper },
    { id: 'iron_fleshing_knife', draw: ironFleshingKnife },
    { id: 'candle', draw: candle },
    { id: 'clay_mold', draw: clayMold },
    { id: 'tile_mold', draw: tileMold },
    { id: 'clay_cooking_pot', draw: clayCookingPot },
    { id: 'wheelbarrow', draw: wheelbarrow },
    { id: 'handcart', draw: handcart },
    { id: 'iron_butchery_kit', draw: ironButcheryKit },
    { id: 'steel_butchery_kit', draw: steelButcheryKit },
    { id: 'curriers_kit', draw: curriersKit },
    { id: 'steel_curriers_kit', draw: steelCurriersKit },
    { id: 'sewing_kit', draw: sewingKit },
    { id: 'tailors_kit', draw: tailorsKit }
  ];
})();
PIXEL_ICONS.push(...PIXEL_TOOLS);
