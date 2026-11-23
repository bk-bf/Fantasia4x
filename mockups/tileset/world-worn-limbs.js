'use strict';
(() => {
  const { plain, paired, mated, woven, TEXTURE } = WORLD_WORN;

  const VAMBRACE = [
    ' llld ',
    'lWWWWd',
    'llmmdd',
    ' zyLx ',
    ' lmmd ',
    ' zyLx ',
    ' lmmd ',
    'llmmdd'
  ];
  const WRAP_BRACER = [
    ' LLMD ',
    'lWWWWd',
    'llymdd',
    ' lmyd ',
    ' lymd ',
    ' lmyd ',
    ' lymd ',
    ' LMMD '
  ];
  const SPLINT_BRACER = [
    ' llmd ',
    'lWWWWd',
    'llmmdd',
    ' LdLD ',
    ' zyyx ',
    ' LdLD ',
    ' zyyx ',
    ' llmd '
  ];
  const SCALE_BRACER = woven([
    ' LLMD ',
    'lWWWWd',
    '++##--',
    ' +#-- ',
    ' +#-- ',
    ' +#-- ',
    ' +#-- ',
    ' LMMD '
  ], TEXTURE.scale);
  const STICK_BRACER = [
    'ld md ',
    'ldmdmd',
    'zyyyyx',
    'ldmdmd',
    'ldmdmd',
    'zyyyyx',
    'ldmdmd',
    ' d md '
  ];
  const BARK_BRACER = [
    'llm dd',
    'lmmodd',
    'zyyyyx',
    'lmmodd',
    'lmmodd',
    'zyyyyx',
    'lmmodd',
    'lm odd'
  ];

  const ARM_SPLINT = [
    ' lmmd ',
    'LlmmdD',
    'zyyyyx',
    'LlmmdD',
    'LlmmdD',
    'zyyyyx',
    'LlmmdD',
    'zyyyyx',
    ' lmmd '
  ];
  const LEG_SPLINT = [
    ' lmmd ',
    'LlmmdD',
    'zyyyyx',
    'LlmmdD',
    'LlmmdD',
    'zyyyyx',
    'LlmmdD',
    'LlmmdD',
    'zyyyyx',
    'LlmmdD',
    'zyyyyx',
    ' lmmd '
  ];
  const ARM_CAST = [
    ' lWWd    ',
    ' lmmd    ',
    ' lmmd    ',
    ' llmmmmmd',
    ' lmmmmmWd',
    '  dddddd '
  ];
  const LEG_CAST = [
    '  lWWd ',
    '  lmmd ',
    '  lmmd ',
    '  lmmd ',
    '  lmmd ',
    ' llmmd ',
    'lllmmmd',
    ' ddddd '
  ];

  const GAUNTLET = [
    'l l l ',
    'lolod ',
    'lolod ',
    'LLMDD ',
    'lmmddm',
    'ooooo ',
    ' lmd  ',
    'llmdd '
  ];
  const GLOVE = [
    'l m d ',
    'lomod ',
    'lmmdd ',
    'lmmddd',
    'lmmdd ',
    ' lmd  ',
    'LLMDD '
  ];
  const MITT = [
    ' lmd  ',
    'llmdd ',
    'lmmddd',
    'lmmddd',
    'lmmdd ',
    ' yyx  ',
    'llmdd '
  ];
  const SCALE_GLOVE = [
    'l m d ',
    'lomod ',
    'LMDLD ',
    'MDLMDd',
    'LMDLD ',
    ' lmd  ',
    'llmdd '
  ];
  const SPLINT_GLOVE = [
    'l m d ',
    'lomod ',
    'lmmdd ',
    'LLMDDd',
    'LLMDD ',
    ' lmd  ',
    'llmdd '
  ];
  const THREE_FINGER = [
    'l m d',
    'l m d',
    'lomod',
    'lmmdd',
    'lmLdd',
    ' yyx '
  ];

  const GREAVE = [
    '  llmd',
    ' lllmd',
    'llllmd',
    ' lllmd',
    '  oooo',
    '  lmld',
    '  lmld',
    '  lmld',
    '  lmld',
    '  lmld',
    '   lmd'
  ];
  const LEG_WRAP = [
    'lWWWd',
    'llmdd',
    'llmdd',
    'LLMDD',
    ' lmd ',
    ' lyd ',
    ' lmd ',
    ' lyd ',
    ' LMD '
  ];
  const SPLINT_GREAVE = [
    'lWWWd',
    'llmdd',
    'LdLdD',
    'LdLdD',
    'zyyyx',
    'LdLdD',
    'LdLdD',
    'zyyyx',
    ' lmd '
  ];
  const SCALE_GREAVE = woven([
    'LWWWD',
    '+##--',
    '+##--',
    '+##--',
    '+##--',
    '+##--',
    ' +#- ',
    ' +#- ',
    ' zyx '
  ], TEXTURE.scale);
  const SHIN_WRAP = [
    'LMLMD',
    'lmmdd',
    'zyyyx',
    'lmmdd',
    'zyyyx',
    'lmmdd',
    'zyyyx',
    ' lmd ',
    ' LMD '
  ];
  const BAND_GREAVE = [
    'LLMDD',
    'lmmdd',
    'LLMDD',
    'lmmdd',
    'LLMDD',
    'lmmdd',
    'LLMDD',
    'lmmdd',
    ' LMD '
  ];
  const THIGH_SLAB = [
    'L L D ',
    'llmmdd',
    'llmmdd',
    'zyyyyx',
    'llmmdd',
    'llmmdd',
    ' lmmd ',
    ' LMMD '
  ];
  const STICK_GREAVE = [
    'ld md ',
    'ldmdmd',
    'zyyyyx',
    'ldmdmd',
    'ldmdmd',
    'ldmdmd',
    'zyyyyx',
    'ldmdmd',
    'ldmdmd',
    ' d md '
  ];
  const SKIRT = [
    '   zyyyyx   ',
    '  lmolmodm  ',
    '  lmolmodd  ',
    ' llmolmodmd ',
    ' lmmolmodmd ',
    'llmmolmoddmd',
    'lmdolmdomdod'
  ];
  const TROUSERS = [
    '  zyyyyyx  ',
    '  llmmmdd  ',
    ' lllmommdd ',
    ' llm  omdd ',
    ' llm   mdd ',
    'llm    mdd ',
    'LLM    MDD '
  ];
  const QUILT_TROUSERS = [
    '  zyyyyyx  ',
    '  llmmmdd  ',
    ' lmdmomddd ',
    ' llm  omdd ',
    ' lmd   ddd ',
    'llm    mdd ',
    'LLM    MDD '
  ];

  const BOOT = [
    '   lWWd',
    '   LMMD',
    '   lmmd',
    '   lmmd',
    '   lmmd',
    '  llmmd',
    'lllmmdd',
    'xxxxxxx'
  ];
  const ANKLE_BOOT = [
    '   lWWd',
    '   LMMD',
    '  llmmd',
    ' lllmmd',
    'llmmmdd',
    'xxxxxxx'
  ];
  const SABATON = [
    '   lWWd',
    '   LMMD',
    '   lmmd',
    '  lomdd',
    ' lomomd',
    'lomommd',
    'xxxxxxx'
  ];
  const FOOTWRAP = [
    '   lWWd',
    '   lmmd',
    '  lmodd',
    ' lmommd',
    'lmommdd',
    ' dddd  '
  ];
  const SHOE = [
    '   lWWd',
    '  LLmmd',
    'lLMDmdd',
    'xxxxxxx'
  ];
  const SANDAL = [
    ' llm ',
    'lyyyd',
    'lmymd',
    'lymyd',
    'lmmmd',
    'lmmdd',
    ' mdd '
  ];

  Object.assign(WORLD_WORN.SHAPES.ARMS, {
    vambrace: paired(VAMBRACE, [6, 1]), wrap: paired(WRAP_BRACER, [6, 1]), splint: paired(SPLINT_BRACER, [6, 1]),
    scale: paired(SCALE_BRACER, [6, 1]), sticks: paired(STICK_BRACER, [7, 1]), bark: paired(BARK_BRACER, [7, 1])
  });
  Object.assign(WORLD_WORN.SHAPES.MEDICAL, { armSplint: plain(ARM_SPLINT), legSplint: plain(LEG_SPLINT), armCast: plain(ARM_CAST), legCast: plain(LEG_CAST) });
  Object.assign(WORLD_WORN.SHAPES.HANDS, {
    gauntlet: mated(GAUNTLET, [5, 1]), glove: mated(GLOVE, [5, 1]), mitt: mated(MITT, [5, 1]),
    scaleGlove: mated(SCALE_GLOVE, [5, 1]), splintGlove: mated(SPLINT_GLOVE, [5, 1]), threeFinger: plain(THREE_FINGER)
  });
  Object.assign(WORLD_WORN.SHAPES.LEGS, {
    greave: mated(GREAVE, [7, 1]), wrap: paired(LEG_WRAP, [5, 1]), splint: paired(SPLINT_GREAVE, [5, 1]), scale: paired(SCALE_GREAVE, [5, 1]),
    shinWrap: paired(SHIN_WRAP, [5, 1]), band: paired(BAND_GREAVE, [5, 1]), thighSlab: paired(THIGH_SLAB, [7, 1]), sticks: paired(STICK_GREAVE, [7, 1]),
    skirt: plain(SKIRT), trousers: plain(TROUSERS), quiltTrousers: plain(QUILT_TROUSERS)
  });
  Object.assign(WORLD_WORN.SHAPES.FEET, {
    boot: paired(BOOT, [5, 2]), ankleBoot: paired(ANKLE_BOOT, [5, 2]), sabaton: paired(SABATON, [5, 2]),
    footwrap: paired(FOOTWRAP, [5, 2]), shoe: paired(SHOE, [5, 2]), sandal: paired(SANDAL, [6, 1])
  });
})();
