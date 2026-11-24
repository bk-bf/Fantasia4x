'use strict';
(() => {
  const { piece, scene, strewn, tiered, mound, packed, held, staged } = WORLD_STACKS;

  const ROUGH = {
    ruby: [
      '  llm   ',
      ' llmmd  ',
      ' lmmmd  ',
      ' lmmddlm',
      ' zmddymd',
      'zzyyyyxx',
      ' yyxxxx '
    ],
    sapphire: [
      '   l    ',
      '  llm   ',
      ' llmmd  ',
      'lllmmdd ',
      ' lmmdd  ',
      '  mdd   ',
      'zzydyxx '
    ],
    emerald: [
      ' lmd    ',
      ' lmd lm ',
      ' lmd lmd',
      ' lmd lmd',
      'zlmdylmd',
      'zzyyyyxx',
      ' yyxxxx '
    ],
    topaz: [
      '    lm  ',
      '  llmmd ',
      '  llmmd ',
      '  llmmd ',
      '  lmmdd ',
      ' zlmddyx',
      ' yyxxxx '
    ],
    amethyst: [
      '   l     ',
      '   lm  l ',
      ' l lmd lm',
      ' lmlmdlmd',
      'zlmdmdlmd',
      'zzyyyyyxx',
      ' yyxxxxx '
    ],
    citrine: [
      '     l  ',
      '    lm  ',
      '   lmd  ',
      '   lmd  ',
      ' l lmd  ',
      'zlmlmdyx',
      ' yyxxxx '
    ],
    moonstone: [
      '  lllm  ',
      ' llLmmd ',
      ' lLmmmd ',
      ' lmmLdd ',
      'zzmmddyx',
      ' yyxxxx '
    ]
  };
  const CUT = {
    ruby: [
      ' llmm ',
      'llLmmd',
      'lmmmdd',
      ' mddd '
    ],
    sapphire: [
      ' llm ',
      'llLmd',
      'lmmmd',
      'lmmdd',
      ' ddd '
    ],
    emerald: [
      'lllmd',
      'lLLmd',
      'lLmmd',
      'lmmdd',
      'mdddd'
    ],
    topaz: [
      '  l  ',
      ' llm ',
      'llLmd',
      'lmmmd',
      ' mdd '
    ],
    amethyst: [
      ' lmm ',
      'lLmmd',
      'mmLdd',
      'mmddd',
      ' ddd '
    ],
    citrine: [
      '  lllm  ',
      'llLLmmdd',
      '  mddd  '
    ],
    moonstone: [
      ' llll ',
      'lLLmmd',
      'lmmmdd',
      ' dddd '
    ]
  };
  const SPARK = [' Z ', 'ZZZ', ' Z '];
  const BEZEL = [
    '  zzzzzy  ',
    ' zy    yx ',
    'zy      yx',
    'zy      yx',
    'zy      yx',
    ' yx    xx ',
    '  yxxxxx  '
  ];
  const CASKET_LID = [
    ' zzzzzzzzzzzy ',
    'zllllllllllmdx',
    'zlmmmmmmmmmddx',
    'zyyyyyyyyyyyxx'
  ];
  const CASKET = [
    'zyyyyyyzyyyyyx',
    'zlmmmmmyxmmmdx',
    'zlmmmmmmmmmddx',
    'zyyyyyyyyyyyxx',
    ' x          x '
  ];
  const SPIRE = [
    '    l    ',
    '   llm   ',
    '   lmd   ',
    '   lmd l ',
    ' l lmd lm',
    ' lmlmdlmd',
    ' lmlmdlmd',
    'zlmdmdlmd',
    'zzyyyyyxx',
    ' yyxxxxx '
  ];
  const STAR_SLIVER = [
    '      l ',
    '     lm ',
    '    lmd ',
    '  llmmd ',
    ' llmmdd ',
    'lmmmdd  ',
    ' mddd   '
  ];
  const VOID_SHARD = [
    '   l  ',
    '  lmL ',
    '  lmdL',
    ' lmmdL',
    ' lmddL',
    'lmdddd',
    ' ddd  '
  ];
  const DUST_PINCH = [
    '   L   ',
    ' LLMLD ',
    'zzyyyxx'
  ];
  const DUST_DISH = [
    '    L     ',
    '  LLMLD   ',
    ' LMLMMLDD ',
    'llllllmmdd',
    ' lmmmmmdd ',
    '  mmmddd  '
  ];
  const DUST_POUCH = [
    '    L  L    ',
    '  LLMLLMLD  ',
    ' zLMLMMLMDx ',
    ' zzyyyyyyxx ',
    ' llmmmmmmdd ',
    'llmmmmmmmmdd',
    'lmmmmmmmmddd',
    ' mmmmmmmddd ',
    '  dddddddd  '
  ];

  const MARKS = [1, 4, 12];
  const gem = (...draws) => staged('gem', MARKS, draws);
  const GLINT = { ruby: [5, -2], sapphire: [4, -2], emerald: [3, -2], topaz: [5, -2], amethyst: [4, -1], citrine: [5, -1], moonstone: [5, -2] };
  const spark = piece(SPARK, { body: 'gleam', lining: 'gleam' }), bezel = piece(BEZEL, { body: 'gold', strap: 'gold' });
  const lid = piece(CASKET_LID, { body: 'wood', strap: 'gold' }), casket = piece(CASKET, { body: 'wood', strap: 'gold' });
  const TRAY = { body: 'wood' };

  const rough = (stone, lit) => { const p = piece(ROUGH[stone], { body: stone, trim: 'milk', strap: 'stone' }); return lit ? [[0, 0, p], [GLINT[stone][0], GLINT[stone][1], spark]] : [[0, 0, p]]; };
  const mined = (stone, lit) => gem(() => scene(...rough(stone, lit)), () => scene(...rough(stone, lit), ...rough(stone, lit).map(([x, y, p]) => [x + 6, y + 2, p])), () => packed(piece(ROUGH[stone], { body: stone, trim: 'milk', strap: 'stone' }), 2, 5, TRAY, 3));
  const faceted = stone => piece(CUT[stone], { body: stone, trim: 'milk' });
  const set = stone => { const p = faceted(stone); return [[0, 0, bezel], [(bezel.w - p.w) >> 1, (bezel.h - p.h) >> 1, p]]; };
  const coffered = layers => scene([0, 0, lid], ...layers, [0, 6, casket]);
  const polished = stone => { const p = faceted(stone); return gem(() => scene([0, 0, p]), () => mound(p, [2, 1], 0), () => coffered(tiered(p, [2, 1], 0).map(([x, y, q]) => [x + 2, y + 1, q]))); };
  const attuned = stone => gem(() => scene(...set(stone), [7, -2, spark]), () => scene(...set(stone), ...set(stone).map(([x, y, p]) => [x + 7, y + 3, p]), [14, 1, spark]), () => coffered([...set(stone).map(([x, y, p]) => [x, y + 1, p]), ...set(stone).map(([x, y, p]) => [x + 5, y + 2, p]), [11, -1, spark]]));

  const STONES = Object.keys(ROUGH), drawings = {};
  for (const stone of STONES) Object.assign(drawings, { [stone]: mined(stone, false), ['infused_' + stone]: mined(stone, true), ['cut_' + stone]: polished(stone), ['attuned_' + stone]: attuned(stone) });

  const spire = piece(SPIRE, { body: 'amethyst', strap: 'stone' }), sliver = piece(STAR_SLIVER, { body: 'moonstone' }), shard = piece(VOID_SHARD, { body: 'black', trim: 'amethyst' });
  const DUST = { body: 'clay', trim: 'amethyst', strap: 'leather' };

  WORLD_GEAR.add(Object.assign(drawings, {
    mana_crystal: gem(() => scene([0, 0, spire], [6, -1, spark]), () => scene([0, 0, spire], [7, 2, spire], [6, -1, spark]), () => packed(spire, 2, 5, TRAY, 3)),
    star_shard: gem(() => scene([0, 0, sliver], [6, -2, spark]), () => scene([0, 0, sliver], [5, 2, sliver], [6, -2, spark]), () => packed(sliver, 2, 5, TRAY, 3)),
    voidshard: gem(() => scene([0, 0, shard]), () => strewn(shard, [[0, 0], [5, 2]]), () => packed(shard, 2, 5, { body: 'black' }, 3)),
    gem_dust: staged('gem', [2, 10, 30], [() => scene([0, 0, piece(DUST_PINCH, DUST)], [3, -3, spark]), () => scene([0, 0, piece(DUST_DISH, DUST)], [5, -3, spark]), () => scene([0, 0, piece(DUST_POUCH, { body: 'leather', trim: 'amethyst', strap: 'cord' })], [6, -3, spark])])
  }));
})();
