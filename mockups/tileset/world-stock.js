'use strict';
(() => {
  const { piece, scene, strewn, mound, staged } = WORLD_STACKS;

  const FLAT_BAR = ['lllllllllllllmmd', 'mmmmmmmmmmmddddd'];
  const FLAT_END = ['lmd', 'mdd'];
  const PIG = [
    ' lllm lmmm ',
    'lmmmmlmmmdd',
    'mmdmmmmdmdd',
    ' ddddddddd '
  ];
  const PIG_END = [' ll ', 'lmmd', 'dddd'];
  const BLOOM_BAR = [
    '  lll    lm ',
    ' lmmmmllmmmd',
    'lmmdmmmmmddd',
    ' mddd dmmdd '
  ];
  const BLOOM_END = [' lm ', 'lmdd', ' dd '];
  const BLISTER_BAR = [
    ' L  LL   L  L ',
    'lmllmmlllmllmd',
    'mmmmmmmmmmmddd',
    ' dddddddddddd '
  ];
  const BLISTER_END = [' L ', 'lmd', 'ddd'];
  const SHEAR_BAR = [
    'lllzlllllzlmd',
    'dddzdddddzddd',
    'mmmymmmmmymmd',
    'dddxdddddxddd'
  ];
  const SHEAR_END = ['llm', 'ddd', 'mmd', 'ddd'];
  const BILLET = [
    'lllllllllmd',
    'lmmmmmmmmdd',
    'lmmmmmmmmdd',
    'ddddddddddd'
  ];
  const BILLET_END = ['llmd', 'lmmd', 'lmdd', 'dddd'];
  const CAKE = [
    ' llmm ',
    'llmmmd',
    'lmmmdd',
    ' dddd '
  ];
  const RIPPLED_BAR = [
    'lllllllllllllmd',
    'mDmmDmmDmmDmmDd',
    'DmmDmmDmmDmmDdd',
    ' dddddddddddddd'
  ];
  const RIPPLED_END = ['lmd', 'Dmd', 'ddd'];

  const MARKS = [1, 4, 12];
  const stock = (...draws) => staged('stock', MARKS, draws);
  function crossed(bar, end) {
    const count = Math.floor((bar.w + 1) / (end.w + 1)), inset = (bar.w - count * (end.w + 1) + 1) >> 1, middle = bar.h + 1, base = middle + end.h + 1;
    return scene([1, 0, bar], ...Array.from({ length: count }, (_, i) => [inset + i * (end.w + 1), middle, end]), [0, base, bar]);
  }
  const lifted = bar => strewn(bar, [[2, 0], [0, bar.h + 1]]);
  const barred = (rows, ends, wear) => { const bar = piece(rows, wear), end = piece(ends, wear); return stock(() => scene([0, 0, bar]), () => lifted(bar), () => crossed(bar, end)); };
  const cake = piece(CAKE, { body: 'steel' });

  WORLD_GEAR.add({
    wrought_iron: barred(FLAT_BAR, FLAT_END, { body: 'iron' }),
    pig_iron: barred(PIG, PIG_END, { body: 'black' }),
    bloom_steel: barred(BLOOM_BAR, BLOOM_END, { body: 'lead' }),
    blister_steel: barred(BLISTER_BAR, BLISTER_END, { body: 'lead', trim: 'iron' }),
    shear_steel: barred(SHEAR_BAR, SHEAR_END, { body: 'iron', strap: 'cord' }),
    mild_steel: barred(BILLET, BILLET_END, { body: 'silver' }),
    crucible_steel: stock(() => scene([0, 0, cake]), () => mound(cake, [2, 1]), () => mound(cake, [3, 2, 1])),
    pattern_welded_steel: barred(RIPPLED_BAR, RIPPLED_END, { body: 'steel', trim: 'black' })
  });
})();
