'use strict';
(() => {
  const { laid, woven, TEXTURE } = WORLD_WORN;

  const GREAT_HELM = [
    ' llllmmmd ',
    'llllLDmmdd',
    'llllLDmmdd',
    'ooooLDoooo',
    'LLLLLDMMDD',
    'lllmLDmmdd',
    'llmoLDommd',
    'llmmLDmmdd',
    ' lmmLDmdd '
  ];
  const CLOSED_HELM = [
    '  lllmmd  ',
    ' llllmmdd ',
    'xyyxyyxyyx',
    'ooooldoooo',
    'lllmldmddd',
    'llmoldomdd',
    'xyyxyyxyyx',
    ' llmmmddd '
  ];
  const HOOD = [
    '   llm    ',
    '  llllmd  ',
    ' llLWWWDd ',
    ' lLWWWWXDd',
    'llLWWWXDdd',
    'lmmLMyDmdd',
    'llmmmymddd'
  ];
  const COIF = [
    '  lllmd  ',
    ' llllmmd ',
    'lllllmmdd',
    'llLWWWDdd',
    'llLWWXDdd',
    'llmWWXddd',
    ' lmmymdd '
  ];
  const DRAPED = [
    '   ++#-   ',
    '  ++##--  ',
    '  +WWWX-  ',
    '  +WWWX-  ',
    ' ++WWWX-- ',
    ' ++####-- ',
    '+++####---',
    '++######--'
  ];
  const DOME = [
    '   llmm   ',
    ' lllmmmdd ',
    'lllmmmmddd',
    'lllmmmmddd',
    'oooooooooo',
    'LLLMMMMDDD',
    ' WWWWWWWW '
  ];
  const SCALE_CAP = woven([
    '   +#--   ',
    ' +++##--- ',
    '+++####---',
    '+++####---',
    'oooooooooo',
    'LLLMMMMDDD',
    ' WWWWWWWW '
  ], TEXTURE.scale);
  const NASAL_HELM = [
    '    lm    ',
    '  lllmmd  ',
    ' llllmmdd ',
    'llllmmmddd',
    'oooooooooo',
    'LOLMMOMDOD',
    ' WWWLDWWW ',
    '    LD    ',
    '    MD    '
  ];
  const SPANGENHELM = [
    '    LD    ',
    '  llLDmd  ',
    ' lllLDmdd ',
    'llllLDmmdd',
    'LLLLMMDDDD',
    'lWWWWWWWWd',
    'ld      md'
  ];
  const KETTLE_HAT = [
    '    llmd    ',
    '   lllmdd   ',
    '   llmmdd   ',
    ' LLLLMMMDDD ',
    'LLLMMMMMMDDD',
    '  y      x  ',
    '   yyyyyx   '
  ];
  const SALLET = [
    '   lllmmd   ',
    '  llllmmdd  ',
    ' lllllmmddd ',
    ' oooooooooo ',
    'llllllmmdddd',
    'lllllmmmdddd'
  ];
  const BARBUTE = [
    '  lllmmd  ',
    ' llllmmdd ',
    'llllmmmddd',
    'llWWWWWWdd',
    'lllmWWmddd',
    'lllmWWmddd',
    'lllmWWmddd',
    ' llmWWmdd '
  ];
  const BURGONET = [
    '    lm    ',
    '  lllmmd  ',
    ' llllmmdd ',
    'LLLLMMMDDD',
    'lWWWWWWWWd',
    'lmWWWWWWdd',
    'll      dd'
  ];
  const QUILT_CAP = [
    '  llmmd  ',
    ' llmdmdd ',
    'llmdmdmdd',
    'LLMMMMDDD',
    'lWWWWWWWd',
    'y       x',
    ' y     x '
  ];
  const POT_HELM = [
    ' llllmmmd ',
    'llllmmmddd',
    'lLlmmLmdLd',
    'lllmmmmddd',
    'lllmmmmddd',
    'lllmmmmddd',
    'WXWXWXWXWX'
  ];
  const WARHELM = [
    '  l m d   ',
    ' llllmmdd ',
    'llllmmmddd',
    'LLLMMMMDDD',
    'lWWWLDWWWd',
    'llWWLDWWdd',
    ' llmLDmdd '
  ];
  const COOKPOT = [
    '  lllmmd  ',
    ' llllmmdd ',
    'llllmomddd',
    'LLLLMMMDDD',
    ' y      x ',
    '  yyyyyx  '
  ];
  const SKULL_HELM = [
    ' llllmd ',
    'lllllmdd',
    'loolmood',
    'looldood',
    'lllomddd',
    ' lmmmdd ',
    ' lododd '
  ];
  const BONE_HELM = [
    '  lllmmd  ',
    ' llllmmmd ',
    'llllmmmmdd',
    'lllmmmmddd',
    'ZYYXZYYXZY',
    ' Y X Y X Y'
  ];
  const HORNED_HELM = [
    'L        D',
    'LL llmd DD',
    ' MlllmmdD ',
    ' llllmmdd ',
    ' LLLMMMDD ',
    '  WWLDWW  ',
    '    MD    '
  ];
  const DIG_CAP = [
    '    Z     ',
    '    L     ',
    '  llLmmd  ',
    ' llllmmdd ',
    'lllmmmmddd',
    'yyyyyyyyyx'
  ];

  Object.assign(WORLD_WORN.SHAPES.HEAD, {
    greatHelm: laid(GREAT_HELM), closedHelm: laid(CLOSED_HELM), hood: laid(HOOD), coif: laid(COIF),
    mailCoif: laid(woven(DRAPED, TEXTURE.mail)), scaleCoif: laid(woven(DRAPED, TEXTURE.scale)),
    dome: laid(DOME), scaleCap: laid(SCALE_CAP), nasal: laid(NASAL_HELM), spangen: laid(SPANGENHELM), kettle: laid(KETTLE_HAT),
    sallet: laid(SALLET), barbute: laid(BARBUTE), burgonet: laid(BURGONET), quiltCap: laid(QUILT_CAP), pot: laid(POT_HELM),
    warhelm: laid(WARHELM), cookpot: laid(COOKPOT), skull: laid(SKULL_HELM), boneHelm: laid(BONE_HELM), horned: laid(HORNED_HELM), digCap: laid(DIG_CAP)
  });
})();
