'use strict';
const PIXEL_RANGED = (() => {
  const { assemble, part, patch, profile, run, stack, strip, stamp, sketch, diagonal } = PX, { haft, pole, binding, HEAD, side } = PARTS;

  const sweepAt = (b, reach, sweep) => Math.round(sweep * (b / reach) ** 2);
  function prod(reach, sweep, draw) {
    const width = draw + 2, rows = [];
    for (let b = -reach; b <= reach; b++) {
      const row = new Array(width).fill(' '), back = sweepAt(b, reach, sweep), arm = draw - back;
      row[arm] = row[arm + 1] = side(b, reach);
      const pull = Math.round(Math.abs(b) / reach * (draw - sweep));
      const from = Math.round((Math.abs(b) - 1) / reach * (draw - sweep));
      if (Math.abs(b) > 1) for (let c = from; c <= pull && c < arm; c++) if (row[c] === ' ') row[c] = 'y';
      rows.push(row.join(''));
    }
    return part(-reach, rows);
  }
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

  const crossbow = ({ wood, bow, metal, nut, reach, sweep, n, spanned, levered }) => assemble([
    [stock(n, 7), wood], -14, [prod(reach, sweep, 12), bow, nut, 'string'], -14, [NUT, metal, nut], -5, [TRIGGER, metal],
    ...(levered ? [-1, [LEVER, metal], -3] : []),
    ...(spanned ? [16, [STIRRUP, metal], 1 - n, [CRANK, metal, nut]] : [])
  ]);

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
    '   llll   ',
    '  lllmmm  ',
    ' llmmmmmd ',
    'llmmmlmmd ',
    'lmmmmmmmdd',
    'mmmdmmmmdd',
    'mmmmmmmddd',
    ' dmmmmddd ',
    '  dddddd  '
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

  const throwingStone = () => stamp(sketch(), 0, 0, ROCK, ['stone']);
  const goblinFirepot = () => FIREPOT(sketch());
  const throwingSpear = () => assemble([[haft(19), 'ash'], -2, [binding(2), 'cord'], [HEAD.narrow(7), 'flint']]);
  const bronzeJavelin = () => assemble([[haft(10), 'ash'], [binding(3), 'leather'], [haft(6), 'ash'], [HEAD.narrow(7), 'bronze']]);
  const pilum = () => assemble([[haft(10), 'wood'], [PILUM_BLOCK, 'wood'], [run(0, ['m'], 12), 'iron'], [PYRAMID, 'iron']]);
  const runeMarkedJavelin = () => assemble([[haft(4), 'black'], [run(-1, ['l', 'M'], 1), 'runed', 'glow'], [haft(4), 'black'], [run(-1, ['l', 'M'], 1), 'runed', 'glow'], [haft(6), 'black'], [HEAD.leaf(9), 'runed']]);
  const greatFangJavelin = () => assemble([[haft(13), 'wood'], -3, [binding(5), 'red'], -2, [FANG, 'bone']]);
  const francisca = () => assemble([[haft(18), 'wood'], -6, [FRANCISCA, 'iron']]);
  const steelPlumbata = () => assemble([[DART_FLIGHT, 'wood', 'red'], [haft(5), 'wood'], [LEAD, 'lead'], [HEAD.narrow(6), 'steel']]);
  const blowgun = () => assemble([[MOUTH, 'sapwood'], [REED(6), 'sapwood'], [NODE, 'sapwood'], [REED(8), 'sapwood'], [NODE, 'sapwood'], [REED(8), 'sapwood'], [MOUTH, 'sapwood']]);

  return [
    { id: 'composite_crossbow', draw: () => crossbow({ wood: 'wood', bow: 'horn', metal: 'bronze', nut: 'bone', reach: 9, sweep: 2, n: 20 }) },
    { id: 'crossbow', draw: () => crossbow({ wood: 'wood', bow: 'wood', metal: 'iron', nut: 'bone', reach: 10, sweep: 2, n: 21, levered: true }) },
    { id: 'steel_arbalest', draw: () => crossbow({ wood: 'wood', bow: 'steel', metal: 'steel', nut: 'bone', reach: 10, sweep: 2, n: 20, spanned: true }) },
    { id: 'siege_lock_arbalest', draw: () => crossbow({ wood: 'black', bow: 'steel', metal: 'iron', nut: 'red', reach: 11, sweep: 2, n: 20, spanned: true }) },
    { id: 'rune_cranked_arbalest', draw: () => crossbow({ wood: 'black', bow: 'runed', metal: 'gold', nut: 'glow', reach: 10, sweep: 3, n: 20, spanned: true }) },
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
