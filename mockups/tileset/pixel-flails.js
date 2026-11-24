'use strict';
const PIXEL_FLAILS = (() => {
  const { assemble, stamp, run } = PX, { POMMEL, haft, grip, binding } = PARTS;

  const CAP = [' l ', 'lmd', ' d '];
  const LINK = [' ll ', 'l  m', 'm  d', ' dd '];
  const RUNE_LINK = [' lL ', 'l  m', 'M  d', ' dd '];
  const DOWN = ['m', 'd'];
  const BALL = [
    '  lll  ',
    ' llmmm ',
    'llmmmmd',
    'lmmmmmd',
    'mmmmmdd',
    ' mmddd ',
    '  ddd  '
  ];
  const KNOBBED = [
    '  l l  ',
    ' llmlm ',
    'llmmmmd',
    ' mmlmd ',
    'lmmmmdd',
    ' mdmdd ',
    '  d d  '
  ];
  const SPIKED = [
    '    l    ',
    ' l lll l ',
    '  llmmm  ',
    ' llmmmmd ',
    'llmmmmmdd',
    ' lmmmmmd ',
    '  mmmdd  ',
    ' d ddd d ',
    '    d    '
  ];
  const GREAT_SPIKED = [
    '     l     ',
    '  l lll l  ',
    '   llmmm   ',
    '  llmmmmm  ',
    ' llmmlmmmd ',
    'llmmmmmmmdd',
    ' lmmmmmmmd ',
    '  mmmmmmd  ',
    '   mmddd   ',
    '  d ddd d  ',
    '     d     '
  ];
  const RUNE_SPIKED = [
    '     l     ',
    '  l lll l  ',
    '   llmmm   ',
    '  llmLmmm  ',
    ' llmLMLmmd ',
    'llmmmLmmmdd',
    ' lmmmMmmmd ',
    '  mmmmmmd  ',
    '   mmddd   ',
    '  d ddd d  ',
    '     d     '
  ];

  const lengthOf = pieces => pieces.reduce((n, piece) => n + (typeof piece === 'number' ? piece : piece[0].len), 0);
  function flail(handle, hung) {
    const sk = assemble(handle), n = lengthOf(handle), [ax, ay] = PX.diagonal(n, 0);
    for (const [rows, dx, dy, ...inks] of hung) stamp(sk, ax + dx, ay + dy, rows, inks);
    return sk;
  }
  const chain = (ink, links) => links.map(([rows, dx, dy]) => [rows, dx, dy, ink]);

  const hanging = (link, links) => links.flatMap(k => [[link, k[0], k[1]], [DOWN, k[0] + 2, k[1] + 4]]);
  const bronzeChainFlail = () => flail([[haft(17), 'wood']], [
    [CAP, -1, -1, 'bronze'],
    ...chain('bronze', hanging(LINK, [[1, -2], [2, 4]])),
    [KNOBBED, 1, 10, 'bronze']
  ]);
  const ironBallFlail = () => flail([[POMMEL.block, 'iron'], [grip(7), 'leather'], [haft(8), 'wood']], [
    [CAP, -1, -1, 'iron'],
    ...chain('iron', [[LINK, 1, -2], [DOWN, 3, 2]]),
    [BALL, 1, 4, 'iron']
  ]);
  const steelFlail = () => flail([[POMMEL.block, 'steel'], [grip(6), 'leather'], [haft(10), 'wood']], [
    [CAP, -1, -1, 'steel'],
    ...chain('steel', hanging(LINK, [[1, -2], [2, 4]])),
    [SPIKED, 0, 10, 'steel']
  ]);
  const runeChainedFlail = () => flail([[POMMEL.jewel, 'gold', 'sapphire'], [grip(6), 'wool'], [haft(10), 'wood']], [
    [CAP, -1, -1, 'gold'],
    ...chain('runed', hanging(RUNE_LINK, [[1, -2], [2, 4]])).map(link => [...link, 'glow']),
    [BALL.map(row => row.replace('mmmm', 'mLMm')), 1, 10, 'runed', 'glow']
  ]);
  const steelGreatflail = () => flail([[POMMEL.block, 'steel'], [grip(8), 'leather'], [haft(9), 'wood']], [
    [CAP, -1, -1, 'steel'],
    ...chain('steel', hanging(LINK, [[1, -2]])),
    [GREAT_SPIKED, -1, 4, 'steel']
  ]);
  const runeLashingGreatflail = () => flail([[POMMEL.jewel, 'gold', 'sapphire'], [grip(6), 'wool'], [run(-1, ['m', 'dddL'], 11), 'wood', 'glow']], [
    [CAP, -1, -1, 'gold'],
    ...chain('runed', hanging(RUNE_LINK, [[1, -2]])).map(link => [...link, 'glow']),
    [RUNE_SPIKED, -1, 4, 'runed', 'glow']
  ]);
  const STUD_BALL = [' lll ', 'lmlmd', 'lmmmd', 'lmldd', ' ddd '];
  const CHAINBITER_DROPS = [[0, 1, 8, -2, 9], [1, 1, 6, 5, 5], [1, 0, 8, 9, -2]];
  function chainbiter() {
    const sk = flail([[POMMEL.ring, 'black'], [binding(5), 'red'], [haft(8), 'black']], [[CAP, -1, -1, 'black']]), [x, y] = PX.diagonal(15, 0);
    for (const [dx, dy, n, bx, by] of CHAINBITER_DROPS) {
      for (let k = 1; k <= n; k++) stamp(sk, x + dx * k, y + dy * k, [k % 2 ? 'm' : 'd'], ['iron']);
      stamp(sk, x + bx, y + by, STUD_BALL, ['black']);
    }
    return sk;
  }

  return [
    { id: 'bronze_chain_flail', draw: bronzeChainFlail },
    { id: 'iron_ball_flail', draw: ironBallFlail },
    { id: 'steel_flail', draw: steelFlail },
    { id: 'rune_chained_flail', draw: runeChainedFlail },
    { id: 'steel_greatflail', draw: steelGreatflail },
    { id: 'rune_lashing_greatflail', draw: runeLashingGreatflail },
    { id: 'chainbiter', draw: chainbiter }
  ];
})();
PIXEL_ICONS.push(...PIXEL_FLAILS);
