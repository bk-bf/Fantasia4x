'use strict';
const PIXEL_RANGED = (() => {
  const { assemble, part, patch, profile, run, stamp, sketch, diagonal } = PX, { haft, pole, binding, HEAD } = PARTS;

  const ARMS = {
    short: [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 5], [7, 6], [8, 6]],
    long: [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 6], [8, 7], [9, 7], [10, 7]]
  };
  const STRING_DRAW = 11;
  const stock = (n, butt) => profile([[-2, 0, butt, 'l'], [-1, 0, n, 'l'], [0, 0, n, 'm'], [1, 0, n, 'd'], [2, 0, butt, 'd']]);
  const NUT = part(-1, ['L', 'M', 'D']);
  const TRIGGER = part(2, ['dm', ' d', ' d']);
  const STIRRUP = patch([
    '  ll ',
    ' l  l',
    'l   m',
    'm  m ',
    ' md  '
  ], [1, 4], 0);
  const CRANK = patch([
    'mm   ',
    ' dm  ',
    '  dm ',
    '   MM',
    '   MD'
  ], [0, 0], 0);
  const LEVER = part(2, ['dddd', '  d ', '  dd', '   d']);

  function prod(sk, step, arm, bow) {
    const [cx, cy] = diagonal(step, 0), [nx, ny] = diagonal(step - STRING_DRAW, 0), [ta, tb] = arm[arm.length - 1];
    stamp(sk, cx - 1, cy - 1, ['lm', 'md'], [bow]);
    for (const [a, b] of arm) {
      stamp(sk, cx - a, cy - b, ['l', 'd'], [bow]);
      stamp(sk, cx + b - 1, cy + a, ['dm'], [bow]);
    }
    cords(sk, cx - ta, cy - tb + 1, nx, ny, 'y', ['string', 'string', 'string']);
    return cords(sk, cx + tb - 1, cy + ta, nx, ny, 'y', ['string', 'string', 'string']);
  }
  const crossbow = ({ wood, bow, metal, nut, arm, n, spanned, levered }) => assemble([
    n - 13, [NUT, metal, nut], -5, [TRIGGER, metal],
    ...(levered ? [-1, [LEVER, metal], -3] : []),
    ...(spanned ? [16, [STIRRUP, metal], 1 - n, [CRANK, metal, nut]] : [])
  ], prod(assemble([[stock(n, 7), wood]]), n - 2, ARMS[arm], bow));

  const SLING_CRADLE = [
    '   lmml   ',
    '  lmMMml  ',
    ' lmMLLMmd ',
    ' dmMMMMmd ',
    '  ddmmdd  ',
    '    dd    '
  ];
  const cords = (sk, x0, y0, x1, y1, glyph, inks) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) stamp(sk, Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), [glyph], inks);
    return sk;
  };
  const sling = (cradle, cord, loop) => {
    const sk = sketch();
    cords(sk, 4, 3, 10, 20, 'y', [cradle, cradle, cord]);
    cords(sk, 6, 2, 20, 20, 'y', [cradle, cradle, cord]);
    stamp(sk, 2, 0, [' yy ', 'y  y', ' yy '], [cradle, cradle, loop]);
    return stamp(sk, 10, 18, SLING_CRADLE, [cradle, 'stone']);
  };

  const staffSling = () => {
    const sk = assemble([[PARTS.pole(19), 'wood'], [part(-1, ['l', 'm', 'd']), 'bronze']]);
    const [x, y] = diagonal(19, 0);
    cords(sk, x + 1, y, x + 2, y + 9, 'y', ['leather', 'leather', 'cord']);
    cords(sk, x + 1, y, x + 7, y + 8, 'y', ['leather', 'leather', 'cord']);
    return stamp(sk, x - 1, y + 8, SLING_CRADLE, ['leather', 'stone']);
  };

  const ROCK = [
    '     lll       ',
    '   lllmmll     ',
    '  llmmmmmmll   ',
    ' llmmmmmmmmml  ',
    'llmmmmmmmmmmmd ',
    'lmmmmmmmmmmmmdd',
    'lmmmmmmmmmmmddd',
    'mmmmmmmmmmmmddd',
    'mmmmmmmmmmmddd ',
    ' dmmmmmmmmddd  ',
    '  ddmmmmdddd   ',
    '    dddddd     '
  ];
  const POT = [
    '      y    ',
    '     y     ',
    '   llmd    ',
    '   ddddd   ',
    '  lmmmmmd  ',
    ' lllmmmmmd ',
    ' llmmmmmmd ',
    ' lmmmmmmmd ',
    ' mmmmmmmdd ',
    '  mmmmmdd  ',
    '   ddddd   '
  ];
  const FIREPOT = (sk) => stamp(stamp(sk, 9, 8, POT, ['clay', 'string', 'cord']), 14, 7, [' L ', 'LMD', ' D '], ['clay', 'flame']);

  const DART_FLIGHT = part(-3, ['LL  ', ' LL ', 'mmmm', 'dddd', ' DD ', 'DD  ']);
  const LEAD = part(-2, [' ll ', 'llll', 'mmmm', 'dddd', ' dd ']);
  const PYRAMID = profile([[-1, 0, 2, 'l'], [0, 0, 4, 'm'], [1, 0, 2, 'd']]);
  const PILUM_BLOCK = part(-2, ['ll', 'lm', 'mm', 'md', 'dd']);
  const FANG = part(-3, [
    '      ll ',
    '   llllml',
    'llllmmmm ',
    'mmmmmmd  ',
    'mmmddd   ',
    'ddd      '
  ]);
  const FRANCISCA = part(-8, [
    '     llll',
    '    lmmml',
    '    mmmm ',
    '   dmmm  ',
    '   mmm   ',
    '  dmm    ',
    ' mmmm    ',
    'lmmmmm   ',
    'mmmmmm   ',
    'dddddd   ',
    ' dddd    '
  ]);
  const REED = n => run(-1, ['l', 'm'], n);
  const NODE = run(-1, ['d', 'd'], 1);
  const MOUTH = part(-1, ['l', 'o']);
  const WRAP = run(-1, ['L', 'D'], 3);
  const DART = [[part(-1, ['ZZ', 'YY']), 'linen', 'linen', 'linen', 'linen'], [run(0, ['m'], 9), 'sapwood'], [part(0, ['dm']), 'wood']];
  const beside = (dx, dy) => (step, band) => { const [x, y] = diagonal(step, band); return [x + dx, y + dy]; };

  const throwingStone = () => stamp(sketch(), 0, 0, ROCK, ['stone']);
  const goblinFirepot = () => FIREPOT(sketch());
  const throwingSpear = () => assemble([[haft(19), 'ash'], -2, [binding(2), 'cord'], [HEAD.narrow(7), 'flint']]);
  const bronzeJavelin = () => assemble([[haft(10), 'ash'], [binding(3), 'leather'], [haft(6), 'ash'], [HEAD.narrow(7), 'bronze']]);
  const pilum = () => assemble([[haft(10), 'wood'], [PILUM_BLOCK, 'wood'], [run(0, ['m'], 12), 'iron'], [PYRAMID, 'iron']]);
  const runeMarkedJavelin = () => assemble([[haft(4), 'black'], [run(-1, ['l', 'M'], 1), 'runed', 'glow'], [haft(4), 'black'], [run(-1, ['l', 'M'], 1), 'runed', 'glow'], [haft(6), 'black'], [HEAD.leaf(9), 'runed']]);
  const greatFangJavelin = () => assemble([[haft(13), 'wood'], -3, [binding(5), 'red'], -2, [FANG, 'bone']]);
  const francisca = () => assemble([[haft(18), 'wood'], -6, [FRANCISCA, 'iron']]);
  const steelPlumbata = () => assemble([[DART_FLIGHT, 'wood', 'red'], [haft(5), 'wood'], [LEAD, 'lead'], [HEAD.narrow(6), 'steel']]);
  const blowgun = () => assemble([2, ...DART], assemble([[MOUTH, 'sapwood'], [WRAP, 'sapwood', 'leather'], [REED(4), 'sapwood'], [NODE, 'sapwood'], [REED(6), 'sapwood'], [NODE, 'sapwood'], [REED(6), 'sapwood'], [NODE, 'sapwood'], [REED(3), 'sapwood'], [MOUTH, 'sapwood']]), beside(4, 2));

  return [
    { id: 'composite_crossbow', draw: () => crossbow({ wood: 'wood', bow: 'horn', metal: 'bronze', nut: 'bone', arm: 'short', n: 20 }) },
    { id: 'crossbow', draw: () => crossbow({ wood: 'wood', bow: 'wood', metal: 'iron', nut: 'bone', arm: 'long', n: 21, levered: true }) },
    { id: 'steel_arbalest', draw: () => crossbow({ wood: 'wood', bow: 'steel', metal: 'steel', nut: 'bone', arm: 'long', n: 20, spanned: true }) },
    { id: 'siege_lock_arbalest', draw: () => crossbow({ wood: 'black', bow: 'steel', metal: 'iron', nut: 'red', arm: 'long', n: 20, spanned: true }) },
    { id: 'rune_cranked_arbalest', draw: () => crossbow({ wood: 'black', bow: 'runed', metal: 'gold', nut: 'glow', arm: 'long', n: 20, spanned: true }) },
    { id: 'sling', draw: () => sling('leather', 'cord', 'cord') },
    { id: 'skullcracker_sling', draw: () => sling('hide', 'cord', 'red') },
    { id: 'staff_sling', draw: staffSling },
    { id: 'rune_whistling_sling', draw: () => sling('runed', 'gleam', 'gold') },
    { id: 'throwing_stone', draw: throwingStone },
    { id: 'goblin_firepot', draw: goblinFirepot },
    { id: 'throwing_spear', draw: throwingSpear },
    { id: 'bronze_javelin', draw: bronzeJavelin },
    { id: 'pilum', draw: pilum },
    { id: 'rune_marked_javelin', draw: runeMarkedJavelin },
    { id: 'great_fang_javelin', draw: greatFangJavelin },
    { id: 'francisca', draw: francisca },
    { id: 'steel_plumbata', draw: steelPlumbata },
    { id: 'blowgun', draw: blowgun }
  ];
})();
PIXEL_ICONS.push(...PIXEL_RANGED);
