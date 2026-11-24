'use strict';
(() => {
  const { inked } = WORLD_GEAR;

  const KNAPSACK = [
    '   yyyy   ',
    '  y    x  ',
    ' lllmmmdd ',
    'llolmmmodd',
    'llommmmodd',
    'llommmmodd',
    'lLLmmmmLLd',
    'lmommmmodd',
    'lmommmmodd',
    'lmmmmmmddd',
    ' dddddddd '
  ];
  const SATCHEL = [
    '   yyyyyyyy   ',
    '  y        x  ',
    ' y          x ',
    'lllllmmmmmmddd',
    'llllmmmmmmmddd',
    'oooooooooooooo',
    'lmmLLmmmmLLmdd',
    'lmmmmmmmmmmddd',
    ' dddddddddddd '
  ];
  const SNAPSACK = [
    '    yyyyyy    ',
    '  yy      xx  ',
    'ylllllmmmmmddx',
    'yllmmmommmoddx',
    'ylmmmmommmoddx',
    ' dddddddddddd '
  ];
  const SCRIP = [
    '  yyy  ',
    ' y lmx ',
    '  lmd  ',
    ' zyyyx ',
    ' llmdd ',
    'llmmmdd',
    'lmmmmdd',
    ' mdddd '
  ];
  const TOOL_ROLL = [
    '   L   L L    ',
    '   M   M D    ',
    '  lllllllmmmd ',
    ' lllymmmmymmdd',
    ' lmmymmmmymodd',
    ' mmdymdddyddd ',
    '  ddddddddd   '
  ];
  const WICKER_PACK = [
    ' Z       X ',
    ' Z       X ',
    ' ZlllmmddX ',
    'lmlmlmlmdmd',
    'mlmlmlmdmdd',
    'lmlmlmdmdmd',
    'mlmlmdmdmdd',
    'lmlmlmdmdmd',
    'mlmlmdmdmdd',
    'ldmdmdmdddd',
    ' Z       X '
  ];
  const FRAMED_SACK = [
    ' L       M ',
    ' LZZZZXZZM ',
    ' LYYYYXYYM ',
    ' llllllmmd ',
    'llllllmmmdd',
    'lmmmzyxmmdd',
    'loooooooodd',
    'lmmmmmmmmdd',
    'lmmmmmmmmdd',
    'lmmmmmmmddd',
    ' ddddddddd ',
    ' M       D '
  ];
  const SQUARE_SACK = [
    ' L       M ',
    ' LZZZZXZZM ',
    ' LYYYYXYYM ',
    'zllllllmmdx',
    'yllllmmmmdx',
    'lmmmzyxmmdd',
    'loooooooodd',
    'lmmmmmmmmdd',
    'ymmmmmmmmdx',
    'yxdddddddxx',
    ' M       D '
  ];
  const STEEL_SACK = [
    ' z       x ',
    ' LZZZZXZZM ',
    ' zYYYYXYYx ',
    ' llllllmmd ',
    'llllllmmmdd',
    'lmmmzyxmmdd',
    'loooooooodd',
    'lmmmmmmmmdd',
    'lmmmmmmmmdd',
    'lmmmmmmmmdd',
    'lmmmmmmmddd',
    ' ddddddddd ',
    ' z       x '
  ];
  const RUNE_SACK = [
    ' L       M ',
    ' LZZZZXZZM ',
    ' LYYYYXYYM ',
    ' llllllmmd ',
    'llllllmmmdd',
    'lmmmzyxmmdd',
    'loooooooodd',
    'lmymmmmmmdd',
    'lmmmmmmymdd',
    'lmymmmmmddd',
    ' ddddddddd ',
    ' M       D '
  ];

  const LOOP = [
    '   lmmmmmd   ',
    ' ll       dd ',
    'l           d'
  ];
  const BELT = [...LOOP, 'llmmmLLLmmddd', ' mmmdLMMdddd '];
  const POUCHED_BELT = [...LOOP, 'llmmmLLLmmddd', ' lmmdLMMdlmd ', ' lmd     lmd ', ' ddd     ddd '];
  const SIDE_POUCH_BELT = [...LOOP, 'llmmmLLLmmddd', ' mmmdLMMdlmd ', '         lmd ', '         ddd '];
  const RINGED_BELT = [...LOOP, 'llmmmLLLmmddd', ' mmmdLMMdddd ', ' M M     M M '];
  const ETCHED_BELT = [...LOOP, 'lLLzMMMzMDDDd', ' LMMzMMMzDDD '];
  const PLATED_BELT = [...LOOP, 'lLLoLLoMMoDDd', ' LMoMMoMDoDD '];
  const SWORD_BELT = [
    '   lmmmmmd  Ll',
    ' ll       dLMd',
    'l         lmd ',
    'llmmmLLLlmddd ',
    ' mmmdLMlmddd  ',
    '      lmd     ',
    '     lmd      ',
    '    Dm        '
  ];
  const SHEATH = [
    'LLL lllll   ',
    'LMMollymymd ',
    'DDDoddddd   '
  ];

  const QUIVER = [
    'Z Z             ',
    ' ZYZlllllllmmmd ',
    'ZYXYlmmymmmmymdd',
    ' ZYXlmmymmmmymd ',
    'Z Z  ddddddddd  '
  ];
  const BOLT_CASE = [
    ' ZYZYZ ',
    ' XYXYX ',
    'lllmmdd',
    'llmmmdd',
    'zyyyyyx',
    'llmmmdd',
    'llmmmdd',
    'lmmmddd',
    ' ddddd '
  ];
  const BANDED_CASE = [
    ' ZYZYZ ',
    ' XYXYX ',
    'lllmmdd',
    'zyyyyyx',
    'llmmmdd',
    'llmmmdd',
    'zyyyyyx',
    'lmmmddd',
    ' ddddd '
  ];

  const sits = (kind, tuck) => (rows, wear) => ({ kind, tuck, ground: () => inked(rows, wear) });
  const pack = sits('pack', 'low'), belt = sits('belt', 'none'), quiver = sits('quiver', 'low');
  const leather = (trim, strap) => ({ body: 'leather', trim, strap: strap || 'boarhide' });

  WORLD_GEAR.add({
    leather_knapsack: pack(KNAPSACK, leather('bronze')),
    iron_buckled_knapsack: pack(KNAPSACK, leather('iron')),
    steel_riveted_knapsack: pack(KNAPSACK, leather('steel', 'wood')),
    rune_stitched_knapsack: pack(KNAPSACK, leather('runed', 'glow')),
    iron_buckled_satchel: pack(SATCHEL, leather('iron')),
    steel_buckled_satchel: pack(SATCHEL, leather('steel')),
    rune_woven_satchel: pack(SATCHEL, { body: 'wool', trim: 'glow', strap: 'gold' }),
    linen_snapsack: pack(SNAPSACK, { body: 'linen', strap: 'cord' }),
    hide_scrip: pack(SCRIP, { body: 'hide', strap: 'cord' }),
    hide_tool_roll: pack(TOOL_ROLL, { body: 'hide', trim: 'wood', strap: 'cord' }),
    wicker_frame: pack(WICKER_PACK, { body: 'ash', lining: 'sapwood' }),
    framed_leather_pack: pack(FRAMED_SACK, { body: 'leather', trim: 'wood', strap: 'bronze', lining: 'linen' }),
    iron_framed_pack: pack(SQUARE_SACK, { body: 'leather', trim: 'wood', strap: 'iron', lining: 'fur' }),
    steel_framed_pack: pack(STEEL_SACK, { body: 'leather', trim: 'steel', strap: 'steel', lining: 'sackcloth' }),
    rune_bound_frame_pack: pack(RUNE_SACK, { body: 'linen', trim: 'runed', strap: 'glow', lining: 'runecloth' }),

    leather_belt: belt(POUCHED_BELT, leather('bronze')),
    ringed_belt: belt(RINGED_BELT, leather('iron')),
    steel_buckled_belt: belt(SIDE_POUCH_BELT, leather('steel')),
    rune_etched_belt: belt(ETCHED_BELT, { body: 'leather', trim: 'runed', strap: 'glow' }),
    plated_war_belt: belt(PLATED_BELT, leather('steel')),
    leather_sword_belt: belt(SWORD_BELT, leather('bronze')),
    mounted_sword_belt: belt(SWORD_BELT, leather('iron')),
    hide_knife_sheath: belt(SHEATH, { body: 'hide', trim: 'wood', strap: 'flint' }),

    hide_arrow_sheath: quiver(QUIVER, { body: 'hide', strap: 'cord', lining: 'linen' }),
    leather_back_quiver: quiver(QUIVER, { body: 'leather', strap: 'boarhide', lining: 'red' }),
    stiffened_war_quiver: quiver(QUIVER, { body: 'fur', strap: 'iron', lining: 'linen' }),
    leather_bolt_case: quiver(BOLT_CASE, { body: 'leather', strap: 'boarhide', lining: 'linen' }),
    banded_bolt_quiver: quiver(BANDED_CASE, { body: 'wood', strap: 'iron', lining: 'linen' })
  });
})();
