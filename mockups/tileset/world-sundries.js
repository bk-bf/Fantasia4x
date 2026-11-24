'use strict';
(() => {
  const { piece, scene, strewn, mound, packed, staged } = WORLD_STACKS;

  const FLAT_WHEEL = [
    '   zzzzzzzzz   ',
    ' zzlllmmmmmyyy ',
    'zl   mmOOmm   yx',
    ' yymmmmmmddxxx ',
    '   xxxxxxxxx   '
  ];
  const UPRIGHT_WHEEL = [
    '    zzzyy    ',
    '  zz  m  yy  ',
    ' z l  m  m x ',
    ' z  l m m  x ',
    'z    lmm    x',
    'zmmmmmOOmmmmx',
    'y    mmd    x',
    ' y  m m d  x ',
    ' y m  m  d x ',
    '  yy  m  xx  ',
    '    yxxxx    '
  ];
  const SUGAR_TWIST = [
    '  LML  ',
    ' LMLMD ',
    'llmmmdd',
    'lmmmmdd',
    ' ddddd '
  ];
  const SUGAR_BOWL = [
    '    LL    ',
    '  LLMLMD  ',
    ' LMLMMLMD ',
    'llllllmmdd',
    ' lmmmmmdd ',
    '  mmmddd  '
  ];
  const SUGAR_SACK = [
    '    LLLL    ',
    '  LLMLLMLD  ',
    ' zLMLMMLMDx ',
    ' zzzzzzzzxx ',
    '  wwwwwwww  ',
    ' llmdmmdmdd ',
    'llmmdmmdmmdd',
    'lmmmdmmdmmdd',
    'lmmmmmmmmddd',
    'ldddddddddd '
  ];
  const SOAP_BAR = [
    ' llllll ',
    'lmmmmmmd',
    'lmmDDmdd',
    ' dddddd '
  ];

  const sundry = (marks, ...draws) => staged('sundry', marks, draws);
  const wheel = piece(FLAT_WHEEL, { body: 'ash', trim: 'iron', strap: 'iron' }), upright = piece(UPRIGHT_WHEEL, { body: 'ash', trim: 'iron', strap: 'iron' });
  const SUGAR = { body: 'drab', trim: 'milk', strap: 'sackcloth' }, bar = piece(SOAP_BAR, { body: 'tallow', trim: 'dun' });

  WORLD_GEAR.add({
    wheel: sundry([1, 3, 6], () => scene([0, 0, upright]), () => scene([8, 0, upright], [0, 9, wheel], [1, 7, wheel]), () => scene([10, 0, upright], ...[8, 6, 4, 2].map((y, i) => [i & 1, y + 2, wheel]))),
    sugar: sundry([2, 10, 30], () => scene([0, 0, piece(SUGAR_TWIST, SUGAR)]), () => scene([0, 0, piece(SUGAR_BOWL, { body: 'wood', trim: 'milk' })]), () => scene([0, 0, piece(SUGAR_SACK, SUGAR)])),
    soap: sundry([1, 4, 12], () => scene([0, 0, bar]), () => mound(bar, [2, 1], 0, 5), () => packed(bar, 2, 5, { body: 'wood' }, 1))
  });
})();
