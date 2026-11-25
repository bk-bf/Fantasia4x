'use strict';
(() => {
  const { inked } = WORLD_GEAR;

  const HEART = [
    ' lm md ',
    'lLmmmdd',
    'lmmmmdd',
    ' mmmdd ',
    '  mdd  ',
    '   d   '
  ];
  const HACKLES = [
    'l l m d',
    'lmlmmdd',
    ' lmmmd ',
    ' lmmdd ',
    ' zyyx  ',
    '  md   '
  ];
  const GLANDS = [
    ' lmd     ',
    'lLmmd lmd',
    'mmmddlmmd',
    ' ddd mmdd',
    '      dd '
  ];
  const PINEAL = [
    ' llm ',
    'lLLmd',
    'lmmmd',
    ' ddd '
  ];
  const SAC = [
    '     LM',
    '    M  ',
    ' llmm  ',
    'llmmmd ',
    'lmmmmdd',
    'lmmmmdd',
    ' mmmdd ',
    '  ddd  '
  ];

  const organ = (rows, wear) => ({ kind: 'organ', tuck: 'low', ground: () => inked(rows, wear) });

  WORLD_GEAR.add({
    alpha_heart: organ(HEART, { body: 'blood', trim: 'flesh' }),
    direwolf_hackles: organ(HACKLES, { body: 'direpelt', strap: 'cord' }),
    sabretooth_glands: organ(GLANDS, { body: 'owlpelt', trim: 'flesh' }),
    owlbear_pineal: organ(PINEAL, { body: 'dun', trim: 'linen' }),
    venom_sac: organ(SAC, { body: 'pickle', trim: 'flesh' })
  });
})();
