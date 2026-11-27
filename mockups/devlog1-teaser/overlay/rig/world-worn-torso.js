'use strict';
(() => {
  const { laid, woven, TEXTURE } = WORLD_WORN;

  const CUIRASS = [
    '  ll      dd  ',
    ' lllmWWWWmddd ',
    'llllmmWWmmdddd',
    'lllmmmldmmmddd',
    'lllmmmldmmmddd',
    ' llmmmldmmddd ',
    ' oooooooooooo ',
    ' lllmmmmmmddd ',
    ' lWWWWWWWWWWd ',
    '  dddddddddd  '
  ];
  const BREASTPLATE = [
    '  yy      xx  ',
    ' lllmWWWWmddd ',
    'llllmmmmmmdddd',
    'lllmmmmmmmmddd',
    'lllmmmmmmmmddd',
    ' llmmmmmmmddd ',
    '  LMMMMMMMMD  ',
    '  lWWWWWWWWd  ',
    '   dddddddd   '
  ];
  const SLAB_PLATE = [
    ' llllmd llmmdd ',
    'llllmmdollmmddd',
    'lLlmmmdolmmmDdd',
    'llmmmddolmmdddd',
    ' ooooooooooooo ',
    ' lLmmmdd lmmDd ',
    ' llmmdd  lmmdd '
  ];
  const LAYERED_PLATE = [
    ' lll    ddd ',
    'llllmWWmmddd',
    'oooooyoooooo',
    'lllmmmmmmddd',
    'oooooyoooooo',
    'lllmmmmmmddd',
    'oooooyoooooo',
    'lllmmmmmmddd',
    ' dddddddddd '
  ];
  const BONE_CUIRASS = [
    ' ll  WW  dd ',
    'lLLoLLoMMoMd',
    'lLMoLMoMDoMd',
    'looooooooood',
    'lLLoLLoMMoMd',
    'lLMoLMoMDoMd',
    ' dddddddddd '
  ];
  const RIB_HARNESS = [
    ' ll  yx  dd ',
    'llllmodmdddd',
    ' oooooooooo ',
    'llllmodmdddd',
    ' oooooooooo ',
    ' lllmodmddd ',
    ' zyyyLLyyyx '
  ];
  const JERKIN = [
    ' ll      dd ',
    'lllm    mddd',
    'llllWWWWdddd',
    'lyllmWWmdddd',
    'lyllmmmmdddd',
    'lyllmmmmdddd',
    'lyllmmmmdddd',
    'lLLLMMMMDDDd'
  ];
  const VEST = [
    ' ++      -- ',
    '+++#    #---',
    '+++#WWWW#---',
    '+++##WW##---',
    '+++######---',
    '+++######---',
    '+++######---',
    '+++######---'
  ];
  const RING_VEST = woven([
    ' ++      -- ',
    '+++#    #---',
    '+++#WWWW#---',
    '+++##WW##---',
    '+++######---',
    '+++######---'
  ], TEXTURE.mail).concat(['L MLM MD MDD']);
  const SHIRT = [
    '     ++WW--     ',
    ' ++++++##------ ',
    '+++++++##-------',
    '+++ ++####-- ---',
    '    ++####--    ',
    '    zyyyyyyx    ',
    '    ++####--    ',
    '    ++####--    ',
    '    +####---    '
  ];
  const HAUBERK = woven([
    '     ++WW--     ',
    ' ++++++##------ ',
    '++++++####------',
    '+++ +##oo##- ---',
    '    +######-    ',
    '   ++#oo###--   '
  ], TEXTURE.mail).concat(['   LMLMLMDMDMD  ']);
  const COAT = woven([
    '     ++WW--     ',
    '  +++++LD-----  ',
    ' ++++++LD------ ',
    '+++ +++LD--- ---',
    '++  +##LD#--  --',
    '    +##LD#--    ',
    '    +##LD#--    ',
    '    +##LD#--    ',
    '    ++####--    '
  ], TEXTURE.quilt);
  const ROBE = [
    '     llWWdd     ',
    '  llllllmddddd  ',
    ' lllllllmdddddd ',
    'LLl llmmmmdd dDD',
    '    zyyyyyyx    ',
    '    llmmmmdd    ',
    '   lllmmmmddd   ',
    '   lllmmmmddd   ',
    '  llllmmmmdddd  ',
    '  LLLLMMMMDDDD  '
  ];
  const CLOAK = [
    '     llLDdd     ',
    '   lllmWWmddd   ',
    '  lllmlWWdmddd  ',
    ' lllmllWWddmddd ',
    ' llmlllWWdddmdd ',
    'lllmllmWWmddmddd',
    'llmlllmWWmdddmdd',
    ' dd ddd  ddd dd '
  ];
  const PLAIN = { '+': ['l'], '#': ['m'], '-': ['d'] };

  Object.assign(WORLD_WORN.SHAPES.TORSO, {
    cuirass: laid(CUIRASS), breastplate: laid(BREASTPLATE), slabPlate: laid(SLAB_PLATE), layeredPlate: laid(LAYERED_PLATE),
    boneCuirass: laid(BONE_CUIRASS), ribHarness: laid(RIB_HARNESS), jerkin: laid(JERKIN),
    wickerVest: laid(woven(VEST, TEXTURE.weave)), scaleVest: laid(woven(VEST, TEXTURE.scale)), lamellarVest: laid(woven(VEST, TEXTURE.lamellar)), ringVest: laid(RING_VEST),
    tunic: laid(woven(SHIRT, PLAIN)), scaleShirt: laid(woven(SHIRT, TEXTURE.scale)), hauberk: laid(HAUBERK),
    coat: laid(COAT), robe: laid(ROBE), cloak: laid(CLOAK)
  });
})();
