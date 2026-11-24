'use strict';
(() => {
  const { piece, scene, strewn, tiered, mound, held, staged } = WORLD_STACKS;

  const SMOKED_LEG = [
    '   llmmm     ',
    ' llmmmmmmd   ',
    'lmmmymmmmmdZY',
    'lmmymmmmdd   ',
    ' mmmmmddd    ',
    '  ddddd      '
  ];
  const CARVED_LEG = [
    '  LLmmmm     ',
    ' LMMLmmmmm   ',
    'LMDMLmmmmmdZY',
    'LMMMLmmmmdd  ',
    ' LLLmmmddd   ',
    '   ddddd     '
  ];
  const HUNG_LEG = [
    '  y  ',
    '  Z  ',
    ' lmd ',
    'llmdd',
    'lmmdd',
    'lmmdd',
    ' mdd '
  ];
  const RAIL = [
    'zzzzzzzzzzzzzzzzzzzzy',
    'zyyyyyyyyyyyyyyyyyyyx',
    'zx                 yx',
    'zx                 yx',
    'zx                 yx',
    'zx                 yx',
    'zx                 yx',
    'zx                 yx',
    'zx                 yx',
    'zx                 yx',
    'zx                 yx'
  ];
  const PORK_CHUNK = [
    ' LLllmm ',
    'lLlmmmmd',
    'lmmmmmdd',
    ' dddddd '
  ];
  const BRINE_TUB = [
    '  LmLlmLd  ',
    ' llllllmmd ',
    ' zzzzyyyxx ',
    'lmlmmmmdmdd',
    'lmlmmmmdmdd',
    ' zzzzyyyxx ',
    ' lmmmmmddd ',
    '  ddddddd  '
  ];
  const CROCK = [
    '   zy   ',
    ' zzzzyx ',
    'llllmmdd',
    'lmmmmmdd',
    'lmmmmmdd',
    'LLLLMMDD',
    'LMMMMMDD',
    'LMMMMDDD',
    ' DDDDDD '
  ];
  const JAM_JAR = [
    '  zzzz  ',
    ' zzyyyx ',
    '  LMMD  ',
    ' llmmmd ',
    'llmmmmdd',
    'lmmmmddd',
    ' mmdddd ',
    '  dddd  '
  ];
  function wheelRows(rx, ry, side, cut) {
    const w = rx * 2, h = ry * 2 + side, cx = rx - .5, cy = ry - .5, rows = Array.from({ length: h }, () => new Array(w).fill(' '));
    const top = (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
    const angle = (x, y) => Math.atan2((y - cy) * rx / ry, x - cx) * 180 / Math.PI;
    const gone = (x, y) => !!cut && Math.hypot(x - cx, y - cy) > .5 && angle(x, y) > cut[0] && angle(x, y) < cut[1];
    const bottom = x => { let b = -1; for (let y = 0; y < ry * 2; y++) if (top(x, y)) b = y; return b; };
    for (let x = 0; x < w; x++) {
      const b = bottom(x), right = (x - cx) / rx;
      for (let y = 0; y <= b; y++) if (top(x, y) && !gone(x, y)) rows[y][x] = right > .5 ? 'M' : 'L';
      if (b >= 0 && !gone(x, b)) for (let k = 1; k <= side; k++) rows[b + k][x] = k === side || right > .3 ? 'D' : 'M';
    }
    if (!cut) return rows.map(r => r.join(''));
    const on = (x, y, a) => {
      const t = a * Math.PI / 180, ux = Math.cos(t) * rx, uy = Math.sin(t) * ry, L = Math.hypot(ux, uy), dx = x - cx, dy = y - cy, along = (dx * ux + dy * uy) / L;
      return along >= 0 && along <= L + .5 && Math.abs(-dx * uy + dy * ux) / L < .75;
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (rows[y][x] !== ' ') continue;
      for (let k = 0; k <= side; k++) {
        if (on(x, y - k, cut[1])) { rows[y][x] = k === side ? 'd' : 'm'; break; }
        if (on(x, y - k, cut[0])) { rows[y][x] = k === side ? 'd' : 'l'; break; }
      }
    }
    return rows.map(r => r.join(''));
  }
  const SMOKED_ROUND = [
    '  lllllm ',
    ' llllLLmd',
    'lmmmLLMmd',
    'lmmmmLMdd',
    ' ddddddd '
  ];
  const LOAF = [
    '  lllmmm  ',
    ' llLlLmmd ',
    'lmmmmmmmmd',
    'lzyyyyyyxd',
    'lmmmmmmmdd',
    ' dddddddd '
  ];
  const BOARD = ['zzzzzzzzzzzzzzzyx', ' xxxxxxxxxxxxxxx '];
  const BASKET = [
    'lllllllllllllllllmmdd',
    'lmlmlmlmlmlmlmlmdmdmd',
    'mlmlmlmlmlmlmlmdmdmdd',
    ' mlmlmlmlmlmlmdmdmdd ',
    '  ddddddddddddddddd  '
  ];

  const preserve = (marks, ...draws) => staged('preserve', marks, draws);
  const LARDER = [1, 4, 12], HAMS = [1, 3, 8];
  const smoked = piece(SMOKED_LEG, { body: 'smoked', strap: 'cord', lining: 'bone' }), cured = piece(CARVED_LEG, { body: 'salami', trim: 'ham', lining: 'bone' });
  const rail = wood => piece(RAIL, { body: wood, strap: wood }), board = piece(BOARD, { body: 'wood', strap: 'wood' }), basket = piece(BASKET, { body: 'ash' });
  const hung = (wear, wood) => () => scene([0, 0, rail(wood)], ...[3, 8, 13].map((x, i) => [x, 2 + (i & 1), piece(HUNG_LEG, wear)]));
  const chunk = piece(PORK_CHUNK, { body: 'ham', trim: 'milk' }), crock = piece(CROCK, { body: 'elkhide', trim: 'dun', strap: 'elkhide' });
  const jar = piece(JAM_JAR, { body: 'jam', trim: 'cord', strap: 'linen' });
  const RIND = { body: 'cheese', trim: 'amber' }, wheel = piece(wheelRows(8, 3, 4), RIND), cutWheel = piece(wheelRows(8, 3, 4, [10, 110]), RIND);
  const round = piece(SMOKED_ROUND, { body: 'amber', trim: 'cheese', strap: 'amber' }), loaf = piece(LOAF, { body: 'crust', trim: 'straw', strap: 'cord' });
  const shelved = p => scene(...tiered(p, [2, 1], 0, p.h + 1), [-2, 2 * p.h + 1, board]);

  WORLD_GEAR.add({
    smoked_ham: preserve(HAMS, () => scene([0, 0, smoked]), () => strewn(smoked, [[1, 0], [0, 4]]), hung({ body: 'smoked', strap: 'cord', lining: 'bone' }, 'black')),
    cured_ham: preserve(HAMS, () => scene([0, 0, cured]), () => strewn(cured, [[0, 4], [1, 0]]), hung({ body: 'salami', strap: 'cord', lining: 'bone' }, 'wood')),
    salt_pork: preserve(LARDER, () => scene([0, 0, chunk]), () => mound(chunk, [2, 1], 2), () => scene([0, 0, piece(BRINE_TUB, { body: 'wood', trim: 'ham', strap: 'iron' })])),
    pickled_vegetables: preserve(LARDER, () => scene([0, 0, crock]), () => strewn(crock, [[7, 0], [0, 2]]), () => strewn(crock, [[4, 0], [12, 1], [0, 4], [8, 5]])),
    preserved_fruit: preserve(LARDER, () => scene([0, 0, jar]), () => strewn(jar, [[5, 0], [0, 2]]), () => shelved(jar)),
    hard_cheese: preserve(LARDER, () => scene([0, 0, cutWheel]), () => scene([0, 0, wheel], [0, 5, wheel], [13, 7, cutWheel]), () => scene([0, 0, wheel], [0, 5, wheel], [0, 10, wheel], [15, 5, wheel], [15, 10, wheel], [8, 15, cutWheel], [-2, 25, board], [14, 25, board])),
    smoked_cheese: preserve(LARDER, () => scene([0, 0, round]), () => strewn(round, [[0, 5], [1, 0]]), () => held(tiered(round, [2, 1], 0), basket, [-2, 6])),
    marching_loaf: preserve(LARDER, () => scene([0, 0, loaf]), () => mound(loaf, [2, 1], 1), () => held(tiered(loaf, [2, 1], 1), basket, [-1, 7]))
  });
})();
