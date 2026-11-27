'use strict';
(() => {
  const { inked } = WORLD_GEAR;

  const BUTCHERY_KIT = [
    '  L L    ZZ   ',
    '  M M   Z  LL ',
    '  M D   Z  ZY ',
    '  D D   Z  ZY ',
    ' llllllmmmmmd ',
    'lllmmmmmmmmmdd',
    'ooooooyooooooo',
    'llmmmmymmmmmdd',
    'lmmmmmmmmmdddd',
    ' dddddddddddd '
  ];
  const CURRIERS_KIT = [
    '   LLLLLL     ',
    '  LMMMMMMD    ',
    ' llllllmmmd   ',
    ' lmmmmmmmdd   ',
    ' lmmmmmLLLLLL ',
    ' lmmmmllllmmmd',
    ' dddddlmmmmmdd',
    '      ddddddd '
  ];
  const SEWING_KIT = [
    '  Z Z    LL ',
    '  Z Z Z LyyL',
    '  Z Z Z LyyL',
    ' llllmmmmmdd',
    'llmommommodd',
    'lmmommommodd',
    ' ddddddddd  '
  ];
  const TAILORS_KIT = [
    '   llllllllmd ',
    '   lZZZYYYYXd ',
    '   lZZYYYYXXd ',
    'z  lZYYYYXXXd ',
    'zz llllmmmmdd ',
    ' zzlmmmLmmmdd ',
    '  zzmmmmmmddd ',
    ' L zzdddddd   ',
    'L LL          ',
    ' LL           '
  ];
  const NET = [
    '     lmlm     ',
    '   lmdmlmdm   ',
    '  mlmdmlmdmlL ',
    ' lmdmlmdmlmdm ',
    'LmlmdmlmdmlmdM',
    ' dmdmlmdmdmdd ',
    '   L ddmd  L  '
  ];

  const kit = (rows, wear, tuck) => ({ kind: 'kit', tuck: tuck || 'low', ground: () => inked(rows, wear) });

  WORLD_GEAR.add({
    iron_butchery_kit: kit(BUTCHERY_KIT, { body: 'leather', trim: 'wood', strap: 'cord', lining: 'iron' }),
    steel_butchery_kit: kit(BUTCHERY_KIT, { body: 'leather', trim: 'wood', strap: 'steel', lining: 'steel' }),
    curriers_kit: kit(CURRIERS_KIT, { body: 'iron', trim: 'wood' }),
    steel_curriers_kit: kit(CURRIERS_KIT, { body: 'steel', trim: 'ash' }),
    sewing_kit: kit(SEWING_KIT, { body: 'hide', trim: 'wood', strap: 'cord', lining: 'iron' }),
    tailors_kit: kit(TAILORS_KIT, { body: 'leather', trim: 'gold', strap: 'steel', lining: 'red' }),
    goblin_net: kit(NET, { body: 'string', trim: 'ember' }, 'none')
  });
})();
