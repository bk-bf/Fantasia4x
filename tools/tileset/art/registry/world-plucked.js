'use strict';
(() => {
  const { piece, scene, staged } = WORLD_STACKS, { tube, disc, union, raster } = WORLD_RASTER;

  function plumes(w, h, base, spokes, wide) {
    const vanes = spokes.map(([deg, len]) => {
      const a = deg * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), at = k => [base[0] + dx * len * k, base[1] + dy * len * k];
      return { a: at(0), b: at(1), shape: union(tube([at(.18), at(.55)], .5, wide), tube([at(.55), at(1)], wide, .4)) };
    });
    const quill = (x, y) => vanes.some(({ a, b }) => tube([a, b], .55, .45)(x, y) >= 0);
    return raster(w, h, union(...vanes.map(v => v.shape), ...vanes.map(v => tube([v.a, v.b], .6, .45))), (t, tone, x, y) => quill(x + .5, y + .5) ? (tone === 'd' ? 'x' : 'z') : tone);
  }
  const strips = (w, h, paths, r) => raster(w, h, union(...paths.map(p => tube(p, r, r * .8))), (t, tone, x, y) => tone !== 'l' && (x + y * 2) % 4 === 0 ? 'M' : tone);
  function hide(w, h, seed) {
    const cx = w / 2, cy = h / 2, body = (x, y) => ((x - cx) / (w * .3)) ** 2 + ((y - cy) / (h * .3)) ** 2 <= 1 ? 0 : -1;
    const legs = [[.04, .1], [.96, .14], [.06, .92], [.95, .9]].map(([u, v]) => tube([[cx + (u - .5) * w * .3, cy + (v - .5) * h * .3], [u * w, v * h]], 1.6, .8));
    const neck = tube([[cx - w * .2, cy - h * .05], [1.5, cy - h * .12]], 1.6, 1), tail = tube([[cx + w * .25, cy + h * .05], [w - 1, cy + h * .2]], .9, .5);
    return raster(w, h, union(body, ...legs, neck, tail), (t, tone, x, y) => tone === 'm' && hash(x >> 1, y >> 1, seed) > .7 ? (hash(x, y, seed) > .4 ? 'M' : 'D') : tone);
  }

  const SACK = [
    '   zyyyyx   ',
    '  llllllmd  ',
    ' lllllllmmd ',
    'llllllllmmdd',
    'lllllllmmmdd',
    'lmmmmmmmmddd',
    ' mmmmmmmddd ',
    '  dddddddd  '
  ];
  const CUSHION = [
    'L           M',
    ' lllllllllmm ',
    ' llllllllmmmd',
    ' llllllmmmmmd',
    ' lllllzmmmmdd',
    ' lmmmmmmmmmdd',
    ' mmmmmmmmmddd',
    'D dddddddddd D'
  ];
  const TALLOW_CAKE = [
    '  lllm  ',
    ' llllmm ',
    'lllllmmd',
    'mmmmmddd',
    ' dddddd '
  ];
  const CROCK = [
    '  LLLLLLM  ',
    ' llllllllm ',
    'zyyyyyyyyyx',
    'lmlmmmmmmdd',
    'lmlmmmmmddd',
    'lmmmmmmmddd',
    ' mmmmmmddd ',
    '  ddddddd  '
  ];
  const COCOON = [
    ' ll lm ',
    'llllmmd',
    'lmmmmdd',
    ' dd dd '
  ];
  const TRAY = [
    'lmlmlmlmlmlmlmlmldmd',
    'lmlmlmlmlmlmlmldmdmd',
    ' mdmdmdmdmdmdmdmdmd ',
    '  dddddddddddddddd  '
  ];
  const RACK = ['zzzzzzzzzzzzzzzzzzzyx', 'zx                 yx', 'zx                 yx', 'zx                 yx', 'zx                 yx', 'zx                 yx', 'zx                 yx', 'zx                 yx', 'zx                 yx', 'zx                 yx', 'zx                 yx'];

  const wear = (body, trim, strap) => ({ body, trim: trim || body, strap: strap || 'cord' });
  const plucked = (marks, ...draws) => staged('plucked', marks, draws);
  const MARKS = [2, 10, 25];

  function feathered(look) {
    const one = piece(plumes(15, 10, [1, 9], [[-30, 14.5]], look.wide * 1.2), look.wear), two = piece(plumes(13, 7, [12, 6], [[-162, 12]], look.wide), look.wear);
    const fan = piece(plumes(15, 15, [7.5, 14], [[-62, 12], [-78, 13], [-92, 13.5], [-106, 13], [-120, 12]], look.wide), look.wear);
    const tie = piece(['zyx', 'zyx'], wear('cord', 'cord', 'leather')), sack = piece(SACK, wear(look.sack, look.sack, 'cord'));
    const poke = piece(plumes(15, 9, [7.5, 9], [[-55, 9], [-75, 9.5], [-95, 9], [-118, 9.5]], look.wide), look.wear);
    return plucked(MARKS,
      () => scene([0, 0, one], [5, 6, two]),
      () => scene([0, 0, fan], [6, 12, tie]),
      () => scene([0, 0, poke], [2, 6, sack], [-6, 10, two]));
  }

  const cushion = piece(CUSHION, wear('linen', 'red', 'red'));
  const cake = piece(TALLOW_CAKE, wear('tallow')), crock = piece(CROCK, wear('clay', 'tallow', 'cord'));
  const cocoon = piece(COCOON, wear('milk')), tray = piece(TRAY, wear('sapwood'));
  const sinew = piece(strips(15, 8, [[[1, 2.5], [4, 1], [7, 3], [10, 1.4], [13.5, 2.6]], [[1.5, 6], [5, 4.6], [8, 6.4], [11, 5], [13.5, 6.2]]], 1.2), wear('bone', 'poppy'));
  const hanging = piece(strips(7, 12, [[[1.5, 1], [2, 5], [1.5, 9], [2.2, 11]], [[5, 1], [5.4, 4], [4.8, 7.5], [5.3, 10]]], 1), wear('bone', 'poppy'));
  const rack = piece(RACK, wear('wood', 'wood', 'wood'));
  const pelt = piece(hide(20, 12, 7), wear('drab', 'moss')), folded = piece(hide(14, 8, 3), wear('drab', 'moss'));

  WORLD_GEAR.add({
    feathers: feathered({ wide: 1.9, wear: wear('plume', 'plume', 'bone'), sack: 'sackcloth' }),
    chicken_feathers: feathered({ wide: 2.2, wear: wear('birch', 'birch', 'linen'), sack: 'linen' }),
    cushion: plucked([1, 3, 8],
      () => scene([0, 0, cushion]),
      () => scene([0, 0, cushion], [2, -4, cushion]),
      () => scene([0, 0, cushion], [2, -4, cushion], [1, -8, cushion], [13, 2, cushion])),
    tallow: plucked(MARKS,
      () => scene([0, 0, cake]),
      () => scene([4, 0, cake], [0, 3, cake], [8, 4, cake]),
      () => scene([0, 3, crock], [12, 6, cake], [3, 0, cake])),
    raw_silk: plucked(MARKS,
      () => scene([0, 0, cocoon], [7, 1, cocoon], [3, 4, cocoon]),
      () => scene([4, 0, cocoon], [0, 3, cocoon], [8, 3, cocoon], [12, 1, cocoon], [3, 6, cocoon], [10, 7, cocoon]),
      () => scene(...[[2, 0], [8, 0], [13, 1], [0, 3], [5, 2], [10, 3], [15, 3]].map(([x, y]) => [x, y, cocoon]), [0, 6, tray])),
    raw_sinew: plucked(MARKS,
      () => scene([0, 0, sinew]),
      () => scene([0, 0, sinew], [2, 4, sinew]),
      () => scene([0, 0, rack], [2, 1, hanging], [7, 1, hanging], [12, 1, hanging])),
    rotten_hide: plucked([1, 3, 6],
      () => scene([0, 0, pelt]),
      () => scene([0, 0, pelt], [5, 5, folded]),
      () => scene([0, 0, folded], [6, 2, pelt], [0, 7, pelt], [9, 9, folded]))
  });
})();
