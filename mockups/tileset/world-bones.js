'use strict';
(() => {
  const { piece, scene, staged } = WORLD_STACKS, { tube, disc, union, raster, curved } = WORLD_RASTER;

  function boneRows(len, thick, deg) {
    const a = deg * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), px = -uy, py = ux, lobe = thick / 2 + .9, pad = lobe + 1;
    const w = Math.ceil(Math.abs(ux) * len + pad * 2), h = Math.ceil(Math.abs(uy) * len + pad * 2);
    const ax = w / 2 - ux * len / 2, ay = h / 2 - uy * len / 2, bx = ax + ux * len, by = ay + uy * len, off = thick / 2 + .1;
    const ends = [[ax, ay, -1], [bx, by, 1]].flatMap(([x, y, s]) => [1, -1].map(k => disc(x + px * off * k + ux * s * .4, y + py * off * k + uy * s * .4, lobe)));
    return raster(w, h, union(tube([[ax, ay], [bx, by]], thick / 2, thick / 2), ...ends));
  }
  const rooted = cut => (t, tone) => t < cut ? tone.toUpperCase() : tone;
  const ridged = (n, cut) => (t, tone) => t < cut ? tone.toUpperCase() : tone === 'm' && Math.floor(t * n) % 2 ? 'd' : tone;
  const IVORY_ROUND = [
    ' LLLM ',
    'LMLMMD',
    'LLMMMD',
    'lMMMDd',
    'lmmmmd',
    ' dddd '
  ];
  const IVORY_BLOCK = [
    ' LLLLLLM',
    'LLMMMMMD',
    'lllllllm',
    'lmmmmmmd',
    'dddddddd'
  ];
  const CORD_RAIL = ['zzzzzzzzzzzzzzzzzzzzzyx', ' x                   x ', ' x                   x '];
  const BAND = ['zz', 'yy', 'yy', 'yy', 'xx'];

  const BONE = { body: 'bone', trim: 'dun' }, wear = (body, trim, strap) => ({ body, trim: trim || body, strap: strap || 'cord' });
  const bone = (len, thick, deg) => piece(boneRows(len, Math.abs(deg % 90) > 20 ? Math.max(thick, 1.6) : thick, deg || 0), BONE);
  const rib = piece(curved(10, 6, [[1.5, 4.5], [3, 1.5], [6, 1], [8.5, 3], [8.5, 5]], .9, .7), BONE);
  const knuckle = piece(raster(5, 5, union(disc(2.5, 2.2, 1.8), disc(1.5, 3.6, 1.2), disc(3.6, 3.6, 1.2))), BONE);
  const fang = piece(curved(7, 11, [[2.5, 1.5], [3.5, 5], [4.2, 8], [3.6, 10.2]], 2.1, .45, rooted(.2)), wear('bone', 'horn'));
  const claw = piece(curved(13, 9, [[2, 5.6], [4, 2.8], [7, 1.8], [9.8, 3], [11.4, 7.6]], 2.2, .3, rooted(.28)), wear('boarhide', 'dun'));
  const tusk = piece(curved(22, 9, [[1.8, 4.5], [8, 6.5], [15, 5.6], [19, 3.4], [20.6, 1.2]], 2.4, .6, rooted(.12)), wear('milk', 'drab'));
  const spiral = Array.from({ length: 26 }, (_, k) => { const a = (200 + k * 20) * Math.PI / 180, R = 6.4 - k * .19; return [8.5 + R * Math.cos(a) * 1.15, 7.6 + R * Math.sin(a) * .95]; });
  const horn = piece(curved(17, 15, spiral, 2.6, .5, ridged(22, 0)), wear('horn'));
  const section = piece(raster(11, 7, union(tube([[1.5, 4.2], [8, 3.4]], 2.4, 2.1), disc(8.6, 3.4, 2.3)), (t, tone, x, y) => Math.hypot(x + .5 - 8.6, y + .5 - 3.4) < 2.3 ? (Math.hypot(x + .5 - 8.6, y + .5 - 3.4) < 1.2 ? 'M' : 'L') : tone), wear('tallow', 'milk'));
  const antlerRows = raster(20, 13, union(
    tube([[3, 12], [4.5, 9], [8, 6.6], [13, 4.2], [17.6, 1.4]], 1.6, .55),
    tube([[5.6, 8.2], [4.2, 4.6], [3.2, 1.2]], 1.1, .5),
    tube([[9.4, 6], [9.2, 3], [8.4, 1]], 1, .5),
    tube([[13.4, 4.2], [14, 1.6], [13.6, .6]], .9, .5),
    disc(3, 12, 1.7)
  ), (t, tone, x, y) => y >= 11 && x <= 5 ? tone.toUpperCase() : tone);
  const antler = piece(antlerRows, wear('horn', 'bone'));
  const round = piece(IVORY_ROUND, wear('tallow', 'milk')), block = piece(IVORY_BLOCK, wear('tallow', 'milk'));
  const rail = piece(CORD_RAIL, { body: 'wood', strap: 'wood' }), band = piece(BAND, { body: 'cord', strap: 'leather' });
  const flipH = p => ({ ...p, rows: WORLD_GEAR.flipped(p.rows) });
  const MARKS = [2, 10, 25], FEW = [1, 4, 12];
  const bones = (marks, ...draws) => staged('bone', marks, draws);

  const s7 = bone(7, 1, 0), s6d = bone(6, 1, 35), s6u = bone(6, 1, -40);
  const m11 = bone(11, 2, 0), m10d = bone(10, 2, 30), m10u = bone(10, 2, -30);
  const l15 = bone(15, 2, 0), l14d = bone(14, 2, -25);
  const h19 = bone(19, 3, 0), h18d = bone(18, 3, -20);
  const g24 = bone(24, 3.4, 0), g24d = bone(24, 3.4, -12);

  WORLD_GEAR.add({
    small_bones: bones(MARKS,
      () => scene([0, 4, s7], [7, 0, rib], [4, 7, knuckle]),
      () => scene([3, 0, rib], [0, 4, s6d], [8, 3, s7], [5, 8, s6u], [0, 9, knuckle], [13, 8, knuckle]),
      () => scene([6, 0, rib], [1, 3, s6d], [11, 2, s6u], [4, 6, s7], [13, 6, rib], [0, 9, s6u], [8, 9, s6d], [16, 10, knuckle], [3, 12, s7], [12, 13, s7], [9, 14, knuckle])),
    medium_bones: bones(MARKS,
      () => scene([0, 0, m11]),
      () => scene([1, 0, m10d], [0, 6, m11]),
      () => scene([0, 0, m10d], [9, 0, m10u], [3, 6, m11], [0, 10, m11], [11, 10, m11], [6, 13, m11])),
    large_bones: bones(FEW,
      () => scene([0, 0, l15]),
      () => scene([0, 0, l14d], [3, 7, l15]),
      () => scene([0, 0, l15], [1, 3, l15], [0, 6, l15], [1, 9, l15], [4, 1, band], [11, 1, band], [4, 7, band], [11, 7, band])),
    huge_bones: bones(FEW,
      () => scene([0, 0, h19]),
      () => scene([0, 0, h18d], [2, 9, h19]),
      () => scene([5, 0, h19], [0, 6, h19], [11, 6, h19], [5, 12, h19])),
    great_bone: bones([1, 2, 4],
      () => scene([0, 0, g24]),
      () => scene([0, 0, g24d], [3, 9, g24]),
      () => scene([0, 0, g24], [3, 6, g24d], [0, 12, g24], [2, 18, g24])),
    great_fang: bones(FEW,
      () => scene([0, 0, fang]),
      () => scene([0, 1, fang], [6, 0, flipH(fang)], [12, 2, fang]),
      () => scene([0, 0, rail], ...[1, 6, 11, 16].map((x, i) => [x, 2 + (i % 2), i % 2 ? flipH(fang) : fang]))),
    predator_claw: bones(FEW,
      () => scene([0, 0, claw]),
      () => scene([0, 0, claw], [9, 3, flipH(claw)], [3, 8, claw]),
      () => scene([0, 0, claw], [11, 1, flipH(claw)], [5, 5, claw], [15, 7, flipH(claw)], [0, 10, flipH(claw)], [9, 11, claw])),
    great_tusk: bones([1, 2, 4],
      () => scene([0, 0, tusk]),
      () => scene([0, 0, tusk], [2, 5, flipH(tusk)]),
      () => scene([0, 0, tusk], [1, 4, flipH(tusk)], [0, 8, tusk], [2, 12, flipH(tusk)], [8, 2, band], [8, 10, band])),
    ivory: bones(MARKS,
      () => scene([0, 0, section]),
      () => scene([3, 0, section], [0, 5, section], [10, 6, block]),
      () => scene([0, 0, block], [9, 0, block], [0, 5, block], [9, 5, block], [17, 2, round], [2, 10, section], [12, 10, section])),
    antler_rack: bones(FEW,
      () => scene([0, 0, antler]),
      () => scene([0, 0, antler], [4, 5, flipH(antler)]),
      () => scene([0, 0, antler], [6, 3, flipH(antler)], [1, 8, antler], [7, 11, flipH(antler)])),
    curved_horn: bones(FEW,
      () => scene([0, 0, horn]),
      () => scene([0, 0, horn], [13, 3, flipH(horn)]),
      () => scene([5, 0, horn], [0, 7, horn], [12, 6, flipH(horn)], [6, 12, flipH(horn)]))
  });
})();
