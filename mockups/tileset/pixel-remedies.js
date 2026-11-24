'use strict';
const PIXEL_REMEDIES = (() => {
  const { draw, layer, flask, jar, jug, crock, deepPot, crucible, tin, roll, bowl, pail, shift, ellipsoid, lathe, POUCH, BUNDLE } = GOODS;
  const on = (x, y, rows, part) => layer(x, y, rows, part, { keep: true });

  const labelled = fill => () => draw({ body: 'glass', fill, trim: 'wood', mark: 'linen' }, ...flask('tall', { label: [5, 4] }));
  const drops = fill => () => draw({ body: 'glass', fill, trim: 'wood', mark: 'linen' }, ...flask('phial', { label: [4, 3] }));
  const liniment = () => draw({ body: 'stone', fill: 'buckskin', mark: 'linen' }, ...jug());
  const pouch = (body, tie) => () => draw({ body, trim: tie }, layer(0, 0, POUCH));
  const bundle = (leaf, tie) => () => draw({ body: leaf, trim: tie }, layer(0, 0, BUNDLE));
  const dressing = (cloth, extra, wear) => () => draw(Object.assign({ body: cloth }, wear), ...roll(), ...(extra || []));
  const STRIP = ['llllllllllllllllllmd', 'lmmmmmmmmmmmmmmmmmmd', 'lmmmmmmmmmmmmmmmmmmd', 'dddddddddddddddddddd'];
  const honeySalve = () => PX.layered(
    [0, 6, STRIP, 'linen'], [14, 3, [' lmd', 'lmmd', 'lmmd', 'lmmd', 'lmdd', ' dd '], 'linen'],
    [2, 5, [' lllmmm  ', 'llmmmmmmd', ' mmmmddd '], 'honey'],
    [8, 1, ['   lm', ' llmd', 'lmmd ', 'md   '], 'kale']);
  const EMBER_BLOOM = [' l  l ', 'llmlmm', ' lmmd ', 'lmMMmd', ' mdmd ', ' d  d '];
  const emberBalm = () => draw({ body: 'iron', fill: 'tallow', mark: 'red', trim: 'citrine' }, ...shift(tin(), 0, 4),
    layer(5, 0, EMBER_BLOOM.map(r => r.replace(/M/g, 'y')), 'mark'), layer(7, 3, ['yy'], 'trim', { keep: true }));
  const SURGEON_ROLL = ['llllllllllllllllllll', ...new Array(8).fill('lmmmmmdmmmmmdmmmmmmm'), 'dddddddddddddddddddd'];
  const surgeonsRoll = () => PX.layered(
    [0, 8, SURGEON_ROLL, 'leather'],
    [3, 2, ['  lm', ' l  ', 'l   ', 'l   ', 'l   ', 'l   ', 'l   ', 'l   ', 'l   '], 'string'],
    [8, 1, ['l', 'm', 'm', 'm', 'm', 'm', 'm', 'm', 'd'], 'steel'],
    [11, 4, [' lll ', 'lmmmd', 'lmmmd', 'lmmmd', ' ddd '], 'linen'],
    [17, 7, [' lmd ', ...new Array(10).fill('lmmdd'), ' mdd '], 'leather'],
    [0, 13, ['llllllllllllllllll', 'lmmmmmmmmmmmmmmmmm', 'lmmmmmmmmmmmmmmmmm', 'dddddddddddddddddd'], 'leather']);

  const reagentJar = fill => () => draw({ body: 'glass', fill, trim: 'wood' }, ...jar({ level: 2 }));
  const ichorPhial = () => draw({ body: 'glass', fill: 'blood', trim: 'black', mark: 'red' }, ...flask('round', { stopper: 'wax', level: 1 }));
  const SEAL = ['  lllmmm  ', ' llmmmmmmd', 'llmmmmmmdd', ' mmmmmmdd ', '   ddd    '];
  const SPILL = ['z', 'y', 'y', 'x'];
  const sealedPot = () => draw({ body: 'clay', fill: 'caustic', trim: 'venom', mark: 'red' }, ...shift(crock(10), 0, 2), layer(2, 0, SEAL, 'mark'), on(3, 6, SPILL, 'trim'), on(11, 7, SPILL.slice(1), 'trim'));
  const HEART = [
    '   zy   zy     ',
    '  lllm lmmm    ',
    ' llllmmmmmmd   ',
    'llllmmmmmmmdd  ',
    'lllmmmmmmmmdd  ',
    'llmmmmmmmmmddd ',
    ' lmmmmmmmmmddd ',
    '  mmmmmmmmddd  ',
    '   mmmmmmddd   ',
    '    mmmmddd    ',
    '     dddd      ',
    '      dd       '];
  const heart = () => draw({ body: 'blood', trim: 'flesh' }, layer(0, 0, HEART));
  const TUFT = ['l    l    l   ', 'lm   lm   lm  ', ' lm  lm  lmd  ', ' lmm lmm lmd l', '  lmm lmmlmdlm', '  lmmmlmmmmdmd', '   lmmmmmmmmd ', '   lmmmmmmmmd ', '    yyyyyyyx  ', '    lmmmmmmd  ', '    lmmmmmdd  ', '     mmmmdd   ', '     lmd md   ', '     l   d    '];
  const hackles = () => draw({ body: 'direpelt', trim: 'cord' }, layer(0, 0, TUFT));
  const glands = () => draw({ body: 'owlpelt', trim: 'flesh' },
    layer(0, 2, ellipsoid(5, 4, 20)), layer(8, 0, ellipsoid(5, 4, -20)), on(8, 6, ['y', 'y', 'x'], 'trim'));
  const pearl = () => draw({ body: 'dun', trim: 'linen' }, layer(0, 6, ['  zzzzzzzzzz  ', 'zyyyyyyyyyyyyx', ' xxxxxxxxxxxx '], 'trim'), layer(2, 0, ellipsoid(5, 4.5)));

  const BRUSH = ['   zy', '  zy ', ' zy  ', 'zyx  '];
  const coating = (paste, tier) => () => {
    const pot = crock(10), body = pot[0];
    const hoops = (tier > 1 ? [3, 6] : tier ? [4] : []).map(r => on(body.x, body.y + r, [body.rows[r]], 'mark'));
    return draw({ body: tier > 1 ? 'bronze' : 'clay', fill: paste, trim: 'wood', mark: tier > 1 ? 'gold' : 'bone' },
      ...shift(pot, 0, 3), ...shift(hoops, 0, 3), layer(9, 0, BRUSH, 'trim'), on(3, 5, ['L', 'M', 'M', 'D'], 'fill'));
  };
  const COATINGS = [['venom_coating', 'tar'], ['caustic_coating', 'caustic'], ['tanglefoot_coating', 'resin'], ['dread_coating', 'arcane']];
  const coatings = COATINGS.flatMap(([id, paste]) => ['', 'greater_', 'grand_'].map((prefix, tier) => ({ id: prefix + id, draw: coating(paste, tier) })));
  const WHETSTONE = ['  lllm', ' lmmmd', 'lmmmd ', 'mmdd  '];
  const OILS = [
    () => draw({ body: 'stone', fill: 'iron', mark: 'cord' }, ...jug()),
    () => draw({ body: 'glass', fill: 'iron', trim: 'wood', mark: 'stone' }, ...flask('round'), layer(13, 13, WHETSTONE, 'mark')),
    () => draw({ body: 'glass', fill: 'iron', trim: 'gold', mark: 'gold' }, ...flask('bottle', { stopper: 'knob', band: true, label: [6, 3] }))
  ];
  const oil = tier => OILS[tier];

  const INGOTS = {
    oxhide: ['ll  ll', ' lmmd ', ' mmmd ', 'md  dd'],
    bun: [' lm ', 'lmmd', ' dd '],
    bar: [' llllm', 'lmmmmd', 'mddddd'],
    pig: ['   lllm', ' llmmmmd', 'lmmmmmdd', 'mmmdddd '],
    cake: [' llm ', 'lmmmd', 'mmmdd', ' ddd '],
    nugget: [' lm ', 'lmmd', 'mmd ', ' d  ']
  };
  const molten = (metal, solid, ingot) => () => draw({ body: 'clay', fill: metal, mark: solid }, ...crucible(), on(4, 1, ['ZZZ'], 'fill'), layer(-1, 1, ['lm', 'md'], 'body'), layer(13, 8, INGOTS[ingot], 'mark'));
  const RESIN = ['    lllm    ', '  lllmmmmd  ', ' llLmmmmmmd ', 'lllmmmmmmmdd', 'llmmmmmmmddd', ' mmmmmmmdddd', '  ddmmdddd  ', '     md     ', '     d      '];
  const resin = () => draw({ body: 'resin', fill: 'resin' }, layer(0, 0, RESIN.map(r => r.replace('L', 'l'))), on(3, 2, ['Z'], 'fill'));
  const STICK = ['  zy', ' zy ', 'zy  ', 'y   '];
  const gluePot = (vessel, glue, deep) => () => draw({ body: vessel, fill: glue, trim: 'wood' }, ...shift(deep ? deepPot(12) : crock(10), 0, 3), layer(8, 0, STICK, 'trim'));
  const tub = (fill, hoops) => () => draw({ body: 'wood', fill, mark: 'iron' }, ...pail().slice(0, 3), ...pail().slice(3, 3 + hoops));
  const tannin = () => draw({ body: 'glass', fill: 'boarhide', trim: 'wood' }, ...jar({ level: 1 }));
  const CLOTH = ['lm', 'lm', 'md', 'md', 'mmd', ' md'];
  const dye = () => draw({ body: 'ash', fill: 'dye', mark: 'dye' }, ...bowl(16), layer(13, 0, CLOTH, 'mark'));
  const SOAP = ['   llllllllllm  ', ' llllllllllmmmd ', 'lllllllmmmmmmmdd', 'llmmmmmmmmmmmmdd', 'lmmmmmmmmmmmmddd', 'mmmmmmmmmmmmdddd', ' dddddddddddddd '];
  const soap = () => draw({ body: 'plaster' }, layer(0, 0, SOAP), on(5, 1, ['ddddd'], 'body'));
  const SHARD = ['     Z    ', '    lY    ', '    lmY   ', '   llmY   ', '   llmdY  ', '  llmmdY  ', '  lmmmddY ', ' llmmmddY ', ' lmmmmddd ', 'llmmmmdddY', 'lmmmmddd  ', ' lmmmddY  ', '  lmmdd   ', '   mdd    ', '    Y     '];
  const voidshard = () => draw({ body: 'black', mark: 'amethyst' }, layer(0, 0, SHARD));

  const WOUNDWORT = [
    '       LM       ',
    '      LMMD      ',
    '      MLMD      ',
    '     LMMMMD     ',
    '      MDDM      ',
    '    LMLMMLMD    ',
    '     MDdmDD     ',
    '    LMMdmMMD    ',
    '     DD dm DD   ',
    '       dm       ',
    ' llm   dm   lmd ',
    'lllmm  dm  lmmdd',
    ' lllmmmdmmmmmdd ',
    '  lllmmdmmmddd  ',
    '    ddddmddd    ',
    '       dm       ',
    '  lm   dm   lmd ',
    ' llmm  dm  lmmd ',
    'lllmmmmdmmmmmddd',
    ' llmmmddmddmmdd ',
    '   dddddmdddd   ',
    '       dm       ',
    '       dm       ',
    '      xyyx      ',
    '      xyyx      ',
    '       dm       '
  ];
  const woundwort = () => PX.stamp(PX.sketch(), 0, 0, WOUNDWORT, ['kale', 'dye', 'cord']);
  const TUFTS = [[3, 2], [8, 1], [13, 2], [18, 3], [5, 5], [10, 4], [15, 5], [2, 8], [7, 7], [12, 7], [17, 8], [9, 10], [4, 11], [14, 10]];
  const sphagnum = () => {
    const sk = PX.layered([0, 0, ellipsoid(11, 6.5), 'pea'], [2, 11, ['  d d    d  d     ', ' d   d  d    d d  '], 'rose']);
    for (const [x, y] of TUFTS) PX.stamp(sk, x, y, [' l ', 'lml', ' d '], ['sage']);
    return sk;
  };

  return [
    { id: 'woundwort', draw: woundwort },
    { id: 'sphagnum_moss', draw: sphagnum },
    { id: 'bonemeal_draught', draw: labelled('bone') },
    { id: 'emberbloom_draught', draw: labelled('flame') },
    { id: 'fever_draught', draw: labelled('sage') },
    { id: 'charcoal_purge', draw: labelled('black') },
    { id: 'poppy_draught', draw: drops('poppy') },
    { id: 'spirit_tincture', draw: drops('tincture') },
    { id: 'warming_liniment', draw: liniment },
    { id: 'styptic_pack', draw: pouch('leather', 'cord') },
    { id: 'chewed_poultice', draw: bundle('poultice', 'cord') },
    { id: 'burn_dressing', draw: dressing('cheese') },
    { id: 'surgeons_dressing', draw: dressing('linen', [layer(4, 2, ['WYYYYYYYYYYX'], 'mark')], { mark: 'steel' }) },
    { id: 'honey_salve', draw: honeySalve },
    { id: 'emberbloom_balm', draw: emberBalm },
    { id: 'field_surgeons_kit', draw: surgeonsRoll },
    { id: 'alpha_ichor', draw: ichorPhial },
    { id: 'owlbear_bile', draw: reagentJar('resin') },
    { id: 'caustic_bile', draw: sealedPot },
    { id: 'distilled_spirit', draw: () => draw({ body: 'glass', fill: 'moonstone', trim: 'wood' }, ...flask('bottle', { neck: 2, level: 0 })) },
    { id: 'alpha_heart', draw: heart },
    { id: 'direwolf_hackles', draw: hackles },
    { id: 'sabretooth_glands', draw: glands },
    { id: 'owlbear_pineal', draw: pearl },
    ...coatings,
    { id: 'honing_oil', draw: oil(0) },
    { id: 'keen_edge_oil', draw: oil(1) },
    { id: 'razors_grace', draw: oil(2) },
    { id: 'molten_copper', draw: molten('flame', 'copper', 'oxhide') },
    { id: 'molten_tin', draw: molten('moonstone', 'moonstone', 'bun') },
    { id: 'molten_bronze', draw: molten('bronze', 'bronze', 'bar') },
    { id: 'molten_lead', draw: molten('lead', 'lead', 'pig') },
    { id: 'molten_silver', draw: molten('silver', 'silver', 'cake') },
    { id: 'molten_gold', draw: molten('gold', 'gold', 'nugget') },
    { id: 'resin', draw: resin },
    { id: 'bone_glue', draw: gluePot('iron', 'bone', true) },
    { id: 'hide_glue', draw: gluePot('clay', 'hide') },
    { id: 'tanning_brine', draw: tub('brine', 2) },
    { id: 'beast_brine', draw: () => draw({ body: 'iron', fill: 'smoked' }, ...deepPot(14)) },
    { id: 'tannin', draw: tannin },
    { id: 'dye', draw: dye },
    { id: 'soap', draw: soap },
    { id: 'voidshard', draw: voidshard }
  ];
})();
PIXEL_ICONS.push(...PIXEL_REMEDIES);
