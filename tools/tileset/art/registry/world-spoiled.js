'use strict';
(() => {
  const { piece, scene, staged } = WORLD_STACKS, { raster, curved } = WORLD_RASTER;

  const domed = lumps => (x, y) => lumps.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) ? 0 : -1;
  const mound = (w, h, lumps, glyph) => raster(w, h, (x, y) => y < h ? domed(lumps)(x, y) : -1, glyph);
  const mottled = (seed, share) => (t, tone, x, y) => tone === 'm' && hash(x, y, seed) < share ? 'M' : tone === 'm' && hash(x, y, seed + 7) < share ? 'd' : tone;

  const LOAF_END = [
    '   lllllmm   ',
    ' ZZlLMlmmmmd ',
    'ZYYlMLLmmxmmd',
    'ZYYlmMmmwxmmd',
    'YYXlmmmmmxmdd',
    ' XXdmmLmmmddd',
    '  dddmmmdddd ',
    '    dddddd   '
  ];
  const BAD_FRUIT = [
    '  y   ',
    ' lmmd ',
    'lmMLmd',
    'lmmmdd',
    ' dddd '
  ];
  const FISH_BONES = [
    '   l l l  l',
    'LMMlllllll ',
    ' DDd d d  d'
  ];
  const LIMP_LEAF = [
    ' lmm   ',
    'lmdmmd ',
    ' dmmddd',
    '  ddd  '
  ];
  const BLOOM = [' ML', 'MLM', ' DM'];
  const SHANK = [
    '      lllmm    ',
    '    llmMMmmmd  ',
    'ZZ lmmMLmmmmmd ',
    'ZYYYmmmmmmmmmdd',
    'ZX ldmmmmmMmddd',
    '    dmmmmmDddd ',
    '     dddddd    '
  ];
  const GOBBET = [
    ' llm  ',
    'lmMmmd',
    'lmmmdd',
    ' ddd  '
  ];
  const BONE_JUT = [
    '    ZZ ',
    '   ZYZZ',
    '  ZYX  ',
    ' ZYX   ',
    'ZYX    '
  ];
  const SEEP = [
    '  dddddddddddd  ',
    ' dododdddddodod ',
    '  dddddodddddd  '
  ];
  const WISP = [
    ' l ',
    'l  ',
    ' m ',
    '  l',
    ' m ',
    'l  ',
    ' m '
  ];
  const SHORT_WISP = [
    'l  ',
    ' m ',
    '  l',
    ' m '
  ];

  const SLOP = { body: 'carrion', trim: 'rot' }, GORE = { body: 'putrid', trim: 'croc', lining: 'bone' }, PALE = { body: 'tallow', strap: 'tallow' };
  const loaf = piece(LOAF_END, { body: 'brine', trim: 'mould', strap: 'rot', lining: 'dun' }), fruit = piece(BAD_FRUIT, { body: 'tar', trim: 'mould', strap: 'wood' });
  const fish = piece(FISH_BONES, { body: 'bone', trim: 'plume' }), leaf = piece(LIMP_LEAF, { body: 'croc' }), bloom = piece(BLOOM, { body: 'mould', trim: 'mould' });
  const shank = piece(SHANK, GORE), gobbet = piece(GOBBET, GORE), jut = piece(BONE_JUT, GORE), seep = piece(SEEP, { body: 'blood' });
  const rib = piece(curved(6, 7, [[1.2, 6.8], [1.2, 3.4], [2.8, 1.2], [4.8, 2.4]], .75, .55), { body: 'bone' });
  const maggot = piece(['zy'], PALE), grub = piece(['z', 'y'], PALE);
  const wisp = piece(WISP, { body: 'stench' }), puff = piece(SHORT_WISP, { body: 'stench' });
  const fly = piece(['lo'], { body: 'midge' }), flyBack = piece(['ol'], { body: 'midge' }), flyUp = piece([' l', 'o '], { body: 'midge' });
  const mush = piece(mound(19, 7, [[9.5, 7, 9.5, 6.4], [3.5, 7, 3.5, 3.2], [16, 7, 3, 3.6]], mottled(3, .1)), SLOP);
  const midden = piece(mound(29, 12, [[12, 12, 11, 11.4], [22, 12, 7, 7], [4, 12, 4, 4.6]], mottled(5, .08)), SLOP);
  const runoff = piece(mound(11, 3, [[5.5, 0, 5.5, 2.8]], mottled(9, .1)), SLOP);
  const lumps = piece(mound(17, 8, [[8, 8, 8, 7.2], [14, 8, 3.5, 4]], mottled(11, .1)), GORE);
  const carcass = piece(mound(29, 13, [[12, 13, 11.5, 12.4], [22, 13, 7, 8], [4, 13, 4, 5]], mottled(13, .08)), GORE);
  const ribcage = (x, y, n) => Array.from({ length: n }, (_, i) => [x + i * 3, y + (i === 0 || i === n - 1 ? 1 : 0), rib]);

  const spoiled = (marks, ...draws) => staged('spoiled', marks, draws);

  WORLD_GEAR.add({
    rotten_food: spoiled([1, 6, 18],
      () => scene([0, 4, loaf], [8, 0, puff], [3, 1, fly]),
      () => scene([2, 6, loaf], [0, 9, mush], [13, 7, fruit], [6, 12, fish], [10, 9, bloom], [5, 0, wisp], [14, 1, puff], [9, 3, fly], [17, 5, flyBack]),
      () => scene([6, 5, loaf], [0, 8, midden], [15, 6, fruit], [2, 14, fruit], [19, 11, leaf], [8, 14, fish], [12, 10, bloom], [22, 15, bloom], [18, 20, runoff], [6, 0, wisp], [14, 0, wisp], [22, 3, puff], [10, 3, fly], [19, 4, flyBack], [26, 9, flyUp])),
    rotten_meat: spoiled([1, 6, 18],
      () => scene([1, 6, seep], [0, 1, shank], [7, 4, maggot], [10, 6, grub], [10, 0, flyUp]),
      () => scene([2, 15, seep], ...ribcage(6, 4, 3), [1, 8, lumps], [0, 10, shank], [12, 12, gobbet], [8, 9, maggot], [13, 10, grub], [5, 0, wisp], [14, 1, puff], [10, 3, fly], [17, 6, flyBack]),
      () => scene([0, 20, seep], [14, 21, seep], ...ribcage(7, 3, 5), [0, 8, carcass], [22, 5, jut], [-1, 15, shank], [14, 16, gobbet], [22, 14, gobbet], [9, 11, maggot], [12, 12, grub], [10, 13, maggot], [20, 11, maggot], [5, 0, wisp], [15, 0, wisp], [24, 0, puff], [11, 2, fly], [20, 2, flyBack], [28, 7, flyUp], [2, 6, fly]))
  });
})();
