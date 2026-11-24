'use strict';
(() => {
  const { inked } = WORLD_GEAR;

  const WITHY_BASKET = [
    '   lmmmd   ',
    '  l     d  ',
    ' l       d ',
    'lllllllmmdd',
    'loooooooood',
    'lmlmlmlmdmd',
    'mlmlmlmdmdd',
    'lmlmlmdmdmd',
    ' mlmlmdmdd ',
    '  ddddddd  '
  ];
  const CARRY_BASKET = [
    ' l          d ',
    'llllllllmmmmdd',
    'looooooooooood',
    'lmlmlmlmdmdmdd',
    'mlmlmlmdmdmdmd',
    'lmlmlmdmdmdmdd',
    ' mlmlmdmdmdmd ',
    '  dddddddddd  '
  ];
  const URN = [
    '     OOOO     ',
    '     lmmd     ',
    '   llmmmmdd   ',
    ' mllmmmmmmddm ',
    'm lzzyyyyyxd m',
    'm lmmmmmmmmd m',
    ' mlmmmmmmmmdm ',
    '  lmmmmmmmdd  ',
    '   mmmmmmdd   ',
    '    dddddd    '
  ];
  const JUG = [
    '   OOOO    ',
    '   lmmd mm ',
    ' llmmmmdd m',
    'llmmmmmmddm',
    'lmmmmmmmddm',
    'lmmmmmmmdd ',
    ' mmmmmmmdd ',
    '  dddddd   '
  ];
  const BUCKET = [
    '   yyyyx   ',
    '  y     x  ',
    ' y       x ',
    'lllllllmmdd',
    'lLMMMMMMMDd',
    'lmmmmmmmmdd',
    'zzzzyyyyyxx',
    'lmmmmmmmmdd',
    ' mmmmmmmdd ',
    ' ddddddddd '
  ];
  const BARREL = [
    '  lllmmmdd  ',
    ' lmmmmmmmmd ',
    ' zzzyyyyyxx ',
    'lmlmmmmmmdmd',
    'lmlmmmmmmdmd',
    'zzzzyyyyyxxx',
    'lmlmmmmmmdmd',
    'lmlmmmmmmdmd',
    'lmlmmmmmmdmd',
    'zzzzyyyyyxxx',
    'lmlmmmmmmdmd',
    ' lmmmmmmmdd ',
    ' zzzyyyyyxx ',
    '  dddddddd  '
  ];
  const CHEST = [
    ' lllllllllllllmd ',
    'zllllllllllllllmx',
    'zmmmmmmmmmmmmmmdx',
    'zooooooooooooooox',
    'zmmmmmmzymmmmmmdx',
    'zmmmmmmyxmmmmmmdx',
    'zmmmmmmmmmmmmmmdx',
    'zmmmmmmmmmmmmmmdx',
    'zmmmmmmmmmmmmmmdx',
    'zmmmmmmmmmmmmmddx',
    'zdddddddddddddddx',
    ' x             x '
  ];
  const BIN = [
    'llllllllllllld',
    'looooooooooood',
    'lmmdmmdmmdmmdd',
    'lmmdmmdmmdmmdd',
    'lmmdmmdmmdmmdd',
    'lmmdmmdmmdmmdd',
    'lmmdmmdmmdmmdd',
    'lmmdmmdmmdmmdd',
    'lmmdmmdmmdmddd',
    'lmmdmmdmmdmddd',
    'dddddddddddddd'
  ];
  const CRATE = [
    'LLLLLLLLLLLLLLD',
    'LzlllllllllllyD',
    'LmmmmmmmmmmmmmD',
    'LoooooooooooooD',
    'LlllllllllllllD',
    'LmmmmmmmmmmmmmD',
    'LoooooooooooooD',
    'LlllllllllllllD',
    'LmmmmmmmmmmmmmD',
    'LydddddddddddxD',
    'DDDDDDDDDDDDDDO'
  ];
  const CRUCIBLE = [
    'llllllmmmd',
    'lMLLMMMDDd',
    'lmmmmmmmdd',
    ' mmmmmmdd ',
    '  xxxxxx  '
  ];
  const RUNE_FLASK = [
    '    zy    ',
    '    lm    ',
    '   lmmd   ',
    ' llmmmmdd ',
    'lmLLMMMMDd',
    'lLMYMMYMDd',
    'lMMMYYMMDd',
    ' mMMMMMDd ',
    '  dddddd  '
  ];
  const ROUND_PHIAL = [
    '   LD   ',
    '   lm   ',
    '   lm   ',
    '  lmmd  ',
    ' llmmmd ',
    'llmmmmdd',
    'lmmmmmdd',
    'lmmmmmdd',
    ' mmmmdd ',
    '  dddd  '
  ];
  const TALL_PHIAL = [
    ' LD ',
    ' lm ',
    'lmmd',
    'lmmd',
    'lmmd',
    'lmdd',
    'dddd'
  ];
  const GINGER_JAR = [
    '   lmmd   ',
    '  llmmmd  ',
    ' llllmmmd ',
    '  dddddd  ',
    ' lmMmmMmd ',
    'lmmmmmmmmd',
    'lMmMmmMmdd',
    'lmmmmmmmdd',
    ' mmmmmmdd ',
    '  dddddd  '
  ];
  const WATERSKIN = [
    '    LM    ',
    '    MD    ',
    '   lmmd   ',
    '  llmmmd  ',
    ' llmmmmmd ',
    'llmmmmmmdd',
    'lmmmmmmmdd',
    'lmmmmmmddd',
    ' mmmmmddd ',
    '  dddddd  '
  ];
  const FLASK = [
    '   LM   ',
    '   lm   ',
    '  zyyx  ',
    '   lm   ',
    ' llmmmd ',
    'llmmmmdd',
    'lmmmmmdd',
    'lmmmmddd',
    ' mmmmdd ',
    '  dddd  '
  ];
  const ALEMBIC = [
    '   llmd            ',
    '  llmmmd           ',
    '  lmmmmmmd         ',
    '  lmmmddmmmd       ',
    '   zyyx   mmmd     ',
    '   llmd     mmd    ',
    '  llmmmd      md   ',
    ' llmmmmmd          ',
    ' lmmmmmmd     l   d',
    ' lmmmmmdd     lmmmd',
    '  mmmmdd      lmmdd',
    '   dddd        ddd '
  ];
  const COOKING_POT = [
    '  llllmmmd  ',
    ' lOOOOOOOOd ',
    '  lmmmmmdd  ',
    ' llmmmmmmdd ',
    'llmmmmmmmmdd',
    'lmmmmmmmmmdd',
    'lmmmmmmmmddd',
    ' mmmmmmmddd ',
    '  DDDDDDDD  '
  ];
  const CLAY_MOLD = [
    'llllllllllmd',
    'lmdddddddmdd',
    'lmdooooodmdd',
    'lmmmmmmmmmdd',
    'mmmmmmmmmddd',
    'dddddddddddd'
  ];
  const TILE_MOLD = [
    ' llllllllllmd ',
    'lmLMMMMMMMDmdd',
    ' mMMMMMMMMDmd ',
    'lmMDDDDDDDDmdd',
    ' mmmmmmmmmmdd ',
    '  dddddddddd  '
  ];

  const MELT = [
    '   Z  Z   ',
    'llLLMLLmmd',
    'lMLLMMMDDd',
    'lmmmmmmmdd',
    ' mmmmmmdd ',
    '  xxxxxx  '
  ];

  const sits = (rows, wear, tuck) => ({ kind: 'vessel', tuck: tuck || 'low', ground: () => inked(rows, wear) });
  const molten = metal => sits(MELT, { body: 'dun', trim: metal, strap: 'black', lining: 'flame' });
  const GLASS = { body: 'glass', trim: 'wood' };
  const phials = { kind: 'vessel', tuck: 'low', ground: () => PX.overlay(inked(ROUND_PHIAL, GLASS), 8, 3, TALL_PHIAL, GLASS.body, GLASS.trim) };

  WORLD_GEAR.add({
    basket: sits(WITHY_BASKET, { body: 'sapwood' }),
    woven_basket: sits(CARRY_BASKET, { body: 'ash' }),
    water_urn: sits(URN, { body: 'clay', trim: 'black', strap: 'ember' }),
    clay_jug: sits(JUG, { body: 'clay', trim: 'black' }),
    wooden_bucket: sits(BUCKET, { body: 'wood', trim: 'water', strap: 'cord' }),
    wooden_barrel: sits(BARREL, { body: 'wood', strap: 'iron' }),
    wooden_chest: sits(CHEST, { body: 'wood', strap: 'iron' }),
    storage_bin: sits(BIN, { body: 'wood' }),
    crate: sits(CRATE, { body: 'ash', trim: 'wood', strap: 'iron' }),
    fireclay_crucible: sits(CRUCIBLE, { body: 'dun', trim: 'flame', strap: 'black' }),
    rune_sealed_flask: sits(RUNE_FLASK, { body: 'glass', trim: 'glow', strap: 'gold', lining: 'runed' }),
    glassware: phials,
    porcelain_vessels: sits(GINGER_JAR, { body: 'milk', trim: 'sapphire' }),
    waterskin: sits(WATERSKIN, { body: 'leather', trim: 'cord' }),
    flask: sits(FLASK, { body: 'clay', trim: 'wood', strap: 'cord' }),
    clay_alembic: sits(ALEMBIC, { body: 'clay', strap: 'black' }),
    clay_cooking_pot: sits(COOKING_POT, { body: 'clay', trim: 'black' }),
    unfired_jug: sits(JUG, { body: 'dun', trim: 'dun' }),
    unfired_flask: sits(FLASK, { body: 'dun', trim: 'dun', strap: 'dun' }),
    clay_mold: sits(CLAY_MOLD, { body: 'clay' }),
    tile_mold: sits(TILE_MOLD, { body: 'bronze', trim: 'clay' }),
    molten_copper: molten('copper'),
    molten_tin: molten('moonstone'),
    molten_bronze: molten('bronze'),
    molten_lead: molten('lead'),
    molten_silver: molten('silver'),
    molten_gold: molten('gold')
  });
})();
