'use strict';
const PIXEL_FOOD = (() => {
  const { draw, layer, ellipsoid, spindle, lathe, disc, shift, bowl, deepPot, crock, plate, jar, wheel, BUNDLE } = GOODS;
  const on = (x, y, rows, part) => layer(x, y, rows, part, { keep: true });
  const heap = (stamp, spots, part) => spots.map(([x, y]) => layer(x, y, stamp, part || 'body'));
  const reshade = (rows, map) => rows.map(row => [...row].map(g => map[g] || g).join(''));
  const SOFTER = { l: 'm', m: 'd' };

  const BERRY = [' llm ', 'llmmd', 'lmmmd', 'mmmdd', ' ddd '];
  const GRAPE = [' lm ', 'lmmd', 'mmdd', ' dd '];
  const LEAF = ['   lm', ' llmd', 'lmmd ', 'md   '];
  const STEM = ['m', 'm', 'd'];

  const wildBerries = () => draw({ body: 'amethyst', fill: 'leaf' },
    layer(9, 0, LEAF, 'fill'),
    ...heap(BERRY, [[1, 4], [6, 3], [11, 4], [3, 8], [8, 8], [13, 8], [5, 12], [10, 12]]));
  const grapes = () => draw({ body: 'silk', fill: 'leaf', trim: 'wood' },
    layer(7, 0, ['m', 'm'], 'trim'), layer(8, 0, LEAF, 'fill'),
    ...heap(GRAPE, [[1, 2], [5, 2], [9, 2], [13, 2], [3, 5], [7, 5], [11, 5], [5, 8], [9, 8], [7, 11]]));
  const apple = () => draw({ body: 'ruby', fill: 'leaf', trim: 'wood' },
    layer(0, 3, ellipsoid(8, 7.5)), layer(7, 0, STEM, 'trim'), layer(8, 0, LEAF, 'fill'));
  const RING = ['  llmm  ', ' llmmmd ', 'llm  mdd', 'lm    dd', 'mm    dd', 'mmd  ddd', ' mdddddd', '  dddd  '];
  const driedFruit = () => draw({ body: 'amber', fill: 'jam' },
    layer(0, 4, RING), layer(9, 1, RING), layer(5, 8, RING, 'fill'));

  const OUTER_LEAF = [' lm  ', 'llmm ', 'lmlmd', 'mmlmd', ' mmld', '  mdd', '   dd'];
  const flipLeaf = rows => rows.map(r => [...r].reverse().map(g => ({ l: 'm', m: 'd', d: 'd' })[g] || g).join(''));
  const cabbage = () => draw({ body: 'cabbage', fill: 'kale' },
    layer(3, 0, ellipsoid(7, 6.5)),
    on(6, 3, ['  d', ' d ', 'd  ', 'd  ']), on(11, 2, ['d ', ' d', ' d', 'd ']),
    layer(0, 6, OUTER_LEAF, 'fill'), layer(13, 6, flipLeaf(OUTER_LEAF), 'fill'),
    layer(4, 11, ['mmmmmmmmmm', ' dddddddd '], 'fill'));
  const RUFFLE = [' l lm ', 'lllmmd', 'llmlmd', ' lmmmd', 'llmmdd', ' lmmd ', '  md  '];
  const kale = () => draw({ body: 'kale', trim: 'sapwood' },
    on(7, 13, ['zy', 'yx', 'yx', 'yx'], 'trim'),
    layer(0, 4, RUFFLE), layer(10, 4, flipLeaf(RUFFLE)), layer(5, 0, RUFFLE), layer(6, 7, ['lmmd', 'lmmd', ' md '], 'body'));
  const TOPS = [' lm  lm ', ' lmd lmd', '  md md ', '   lmd  '];
  const root = (flesh, crown, size, tail) => () => draw({ body: flesh, mark: crown, fill: 'leaf' },
    layer(2, 0, TOPS, 'fill'),
    layer(0, 4, ellipsoid(size, size * .85)),
    on(0, 4, ellipsoid(size, size * .85).slice(0, Math.round(size * .6)), 'mark'),
    on(Math.round(size) - 1, 4 + Math.round(size * 1.7) - 1, tail));
  const ONION = ['    lm    ', '    lmd   ', '   llmd   ', ' lllmmmmd ', 'llllmmmmdd', 'lllmmdmmdd', 'llmmmdmmdd', 'lmmmmdmddd', ' mmmmdddd ', '  ddddddd ', '   y y y  '];
  const onion = () => draw({ body: 'bronze', trim: 'linen' }, layer(0, 0, ONION));
  const pumpkin = () => draw({ body: 'topaz', trim: 'sapwood' },
    layer(0, 3, ellipsoid(10, 7)),
    on(5, 4, ['d', 'd', 'd', 'd', 'd', 'd', 'd', ' d', ' d'].map(r => r.padEnd(2)).map(r => r)),
    on(10, 3, ['d', 'd', 'd', 'd', 'd', 'd', 'd', 'd', 'd', 'd', 'd', 'd']),
    on(15, 4, [' d', ' d', ' d', ' d', ' d', ' d', ' d', 'd ', 'd ']),
    layer(9, 0, ['zy', 'yx', 'yx'], 'trim'));
  const BEAN = [' lmm', 'lmmd', 'mdd '];
  const beans = () => draw({ body: 'hide' }, ...heap(BEAN, [[4, 0], [9, 1], [1, 3], [6, 3], [11, 4], [3, 6], [8, 6], [13, 7], [5, 9], [10, 9]]));
  const POD = [
    '  llllllllllllll    ',
    ' llmmmmmmmmmmmmmmm  ',
    'lmdddddddddddddddmm ',
    'lmdd            ddmd',
    'lmmdddddddddddddddmd',
    ' mmmmmmmmmmmmmmmmmd ',
    '  dddddddddddddddd  '];
  const PEA = [' lm ', 'llmd', 'lmmd', ' dd '];
  const peas = () => draw({ body: 'kale', fill: 'pea' },
    layer(0, 0, POD), ...heap(PEA, [[2, 1], [6, 1], [10, 1], [14, 1]], 'fill'));
  const CANE = ['lm', 'lm', 'dd', 'lm', 'lm', 'lm', 'dd', 'lm', 'lm', 'lm', 'dd', 'lm', 'lm', 'md'];
  const sugarcane = () => draw({ body: 'sapwood', fill: 'leaf' },
    layer(2, 4, CANE), layer(6, 2, CANE), layer(10, 5, CANE), layer(6, 0, ['   lm', ' llmd', 'lmd  '], 'fill'));
  const honey = () => draw({ body: 'clay', fill: 'honey', trim: 'wood' },
    on(9, 0, ['  z', ' zy', ' y ', 'y  ', 'x  '], 'trim'),
    ...shift(crock(10), 0, 4),
    on(4, 6, ['L', 'M', 'M', 'D'], 'fill'));

  const EARS = {
    oats: ['l  ', ' m ', 'l d', ' m ', 'm d', ' m ', 'l d', ' d '],
    wheat: [' l ', 'lmd', 'lmd', 'lmd', 'lmd', 'lmd', ' d '],
    rye: [' l ', ' l ', 'lm ', ' md', 'lm ', ' md', 'lm ', ' md', ' d ']
  };
  const grain = (ear, kind) => () => draw({ body: ear, trim: 'sapwood' },
    layer(2, 1, EARS[kind]), layer(6, 0, EARS[kind]), layer(10, 2, EARS[kind]),
    layer(3, 9, ['y   ', ' y  ', '  y ', '  y ', '  y ', '  yx'], 'trim'),
    layer(7, 8, ['y', 'y', 'y', 'y', 'y', 'y', 'x'], 'trim'),
    layer(8, 10, ['  y', ' y ', 'y  ', 'y  ', 'x  '], 'trim'));
  const HERB_LEAF = { sage: ['lm ', 'lmd', 'lmd', ' d '], thyme: ['lm', 'md'], mint: [' lm ', 'llmd', 'lmmd', ' md '] };
  const SPRIG = [[5, 0], [1, 3], [8, 3], [1, 7], [8, 7], [2, 11]];
  const herb = (leafy, kind) => () => draw({ body: leafy, trim: 'sapwood' },
    layer(6, 2, ['y', 'y', 'y', 'y', 'y', 'y', 'y', 'y', 'y', 'y', 'y', 'x', 'x'], 'trim'),
    ...heap(HERB_LEAF[kind], kind === 'thyme' ? [...SPRIG, [4, 5], [4, 9], [9, 10]] : SPRIG));

  const FISH = { body: [3, 5, 7, 8, 9, 9, 9, 9, 9, 8, 8, 7, 6, 5, 4, 3], tail: ['ll   ', 'lmm  ', ' lmm ', '  mmd', '  mdd', ' mdd ', 'mdd  ', 'dd   '], dorsal: ['  lm ', ' lmmd', 'lmmmd'] };
  const fishLayers = () => [
    layer(15, 0, FISH.tail, 'fill'), layer(5, -2, FISH.dorsal, 'fill'), layer(7, 8, ['mdd'], 'fill'),
    on(0, 0, spindle(FISH.body)), on(2, 3, ['W'], 'mark'), on(4, 2, ['d', 'd', 'd', 'd', 'd']), on(0, 4, ['.'])];
  const fish = (scales, fins) => () => draw({ body: scales, fill: fins || scales, mark: 'black' }, ...fishLayers());
  const servedFish = (scales, sauce) => () => draw({ body: scales, fill: scales, mark: 'black', trim: 'plaster' },
    ...plate(26), ...(sauce ? [on(4, 2, GOODS.flatDisc(18, 5), 'mark')] : []), ...shift(fishLayers(), 3, -3).map(l => Object.assign({}, l, { part: l.part === 'mark' ? 'mark' : l.part })));

  const STEAK = [
    '     yyyyyy          ',
    '   yyzzllllmm        ',
    '  yzzllmmmmmmmm      ',
    ' yzllmmmmmmmmmmmm    ',
    ' yzlmmmmmmmmmmmmmmm  ',
    'yzlmmmmmmmmmmmmmmmmm ',
    'yzlmmmmmmmmmmmmmmmmmd',
    'yzmmmmmmmmmmmmmmmmmdd',
    ' yzmmmmmmmmmmmmmmmmdd',
    ' xyllllllllllllllldd ',
    '  xxdddddddddddddddd ',
    '    xxdddddddddddd   '];
  const SHANK = ['zz     ', 'zyyyyyy', ' yyyyyy', ' xx    '];
  const TOMAHAWK = ['zz         ', 'zyyyyyyyyyy', 'yyyyyyyyyyy', ' xx        '];
  const GRILL = ['   d   d', '  d   d ', ' d   d  ', 'd   d   '];
  const SALT = ['Z  ', '  Z', ' Z '];
  const steak = (flesh, fat, extra) => () => draw({ body: flesh, trim: fat || 'tallow', mark: 'bone' }, layer(0, 0, STEAK), ...(extra || []));
  const tBone = () => on(8, 3, T_BONE, 'trim');
  const chopBone = () => layer(-5, 5, SHANK, 'mark', { behind: true });

  const BONE = [' zy    ', 'zyyx   ', ' yyyy  ', ' xyyyy ', '   yyyx', '    yxx'];
  const FUR = [' ZY ZY ', 'ZYXZYXY', 'YXXYXX '];
  const FEATHER = ['   ZZ', '  ZYY', ' ZYX ', 'ZYX  ', 'X    '];
  const FAT_CAP = ['    ZZZZ', '  ZZYYYYY', ' ZYYY    ', 'ZYY      '];
  const SKEWER = ['                y', '               y ', '              y  ', '             y   ', '            y    ', '           y     ', '          y      ', '         y       ', '        y        ', '       y         ', '      y          ', '     y           ', '    y            ', '   y             ', '  y              ', ' y               ', 'y                '];
  const haunchLayers = (size, slim, x, y) => [layer(x, y + 9, BONE, 'trim'), layer(x + 5, y, ellipsoid(size * (slim ? 1.2 : 1), size * (slim ? .55 : .8), -40))];
  const haunch = (flesh, size, marks, wear, slim) => () => draw(Object.assign({ body: flesh, trim: 'bone' }, wear), ...haunchLayers(size, slim, 0, 0), ...(marks || []));
  const ratPair = () => draw({ body: 'carrion', trim: 'bone', mark: 'wood' }, on(0, 0, SKEWER, 'mark'), ...haunchLayers(4.2, false, 1, 1), ...haunchLayers(4.2, false, 7, -5));
  const stick = (size, x, y) => [layer(x, y + 7, [' zy  ', 'zyyy ', ' yyyx', '  yxx'], 'trim'), layer(x + 3, y, ellipsoid(size, size * .72, -45))];
  const drumstick = (flesh, size, marks, wear) => () => draw(Object.assign({ body: flesh, trim: 'bone' }, wear), ...stick(size, 0, 0), ...(marks || []));
  const brace = flesh => () => draw({ body: flesh, trim: 'bone' }, ...stick(5, 7, 0), ...stick(5, 0, 5));
  function rack(count, reach) {
    const w = count * 4 + 2, tips = Array.from({ length: reach }, (_, r) => ('  ' + (r ? 'yx  ' : 'zy  ').repeat(count)).slice(0, w));
    const seam = Array.from({ length: w }, (_, x) => x % 4 === 1 && x > 1 && x < w - 3 ? 'd' : 'm').join('');
    return [...tips, ' ' + 'l'.repeat(w - 6) + 'mmmm ', 'llll' + 'm'.repeat(w - 5) + 'd', 'l' + seam.slice(1, -2) + 'dd', 'l' + seam.slice(1, -2) + 'dd', ' ' + 'd'.repeat(w - 3) + '  '];
  }
  const ribs = (flesh, count, reach, marks, wear) => () => draw(Object.assign({ body: flesh, trim: 'bone' }, wear), layer(0, 0, rack(count, reach)), ...(marks || []));
  const STRIP = [' lllllllllmm  ', 'llmmmmmmmmmmd ', 'mmmmmmmmmmmdd ', ' mddddddddddd ', '   d    d     '];
  const jerky = (meat, tie) => () => draw({ body: meat, trim: 'cord' },
    layer(4, 0, STRIP), layer(0, 4, STRIP), layer(3, 8, STRIP), ...(tie ? [on(8, 0, ['y', 'y', 'y', 'y', 'y', 'y', 'y', 'y', 'y', 'y', 'y', 'x'], 'trim')] : []));
  const HAM = ['   zy    ', '  zyyx   ', '   yx    '];
  const hamLayers = () => [layer(9, 0, HAM, 'trim'), layer(8, 2, ellipsoid(3, 3.6, 30)), layer(0, 5, ellipsoid(7, 8, 30)), on(5, 8, ['Y         ', ' Y        ', '  YYYYYYYY'], 'mark')];
  const HOOK = ['  yyy', ' y   y', ' y', '  y', '  y', '  y'];
  const hungHam = rind => () => draw({ body: rind, trim: 'bone', mark: 'cord' }, ...shift(hamLayers(), 0, 6), on(8, 0, HOOK, 'mark'));
  const carvedHam = rind => () => draw({ body: rind, fill: 'tallow', trim: 'bone', mark: 'cord' }, ...hamLayers(),
    layer(0, 11, ellipsoid(4.2, 4.2), 'fill'), layer(1, 12, ellipsoid(3.2, 3.2).map(r => r.replace(/d/g, 'm')), 'body', { keep: true }));

  const LINK = a => ellipsoid(4.6, 3, a);
  const sausages = casing => () => draw({ body: casing, trim: 'cord' },
    layer(0, 0, LINK(60)), layer(3, 8, LINK(20)), layer(11, 9, LINK(-20)), layer(16, 1, LINK(-60)),
    on(4, 8, ['z'], 'trim'), on(12, 10, ['z'], 'trim'), on(18, 9, ['z'], 'trim'));
  const SPECKS = ['Z   Z', '  Z  ', 'Z   Z'];
  const salami = casing => () => draw({ body: casing, trim: 'cord', mark: 'tallow' },
    layer(0, 3, ellipsoid(11, 3.8, -28)), on(6, 8, SPECKS, 'mark'), on(13, 4, SPECKS, 'mark'), on(19, 0, [' yy', 'y  y', ' yy '], 'trim'));
  const fryLinks = casing => () => draw({ body: casing }, layer(0, 10, ellipsoid(6, 2.8, -20)), layer(4, 5, ellipsoid(6, 2.8, -20)), layer(8, 0, ellipsoid(6, 2.8, -20)));

  const chunk = (x, y, part) => layer(x, y, ['lm', 'md'], part || 'trim');
  const stew = (w, fill, chunks, vessel) => () => draw({ body: vessel || 'ash', fill, trim: 'roast', mark: 'topaz' },
    ...(w ? bowl(w) : deepPot(12)), ...chunks.map(([x, y, part]) => on(x, y, part === 'mark' ? ['ld'] : ['lm', 'md'], part || 'trim')));
  const cauldron = () => draw({ body: 'iron', fill: 'broth', trim: 'roast', mark: 'bone' },
    ...deepPot(16), layer(-1, 4, ['lm', 'md'], 'body'), layer(19, 4, ['mm', 'dd'], 'body'),
    on(4, 1, ['lm', 'md'], 'trim'), on(9, 1, ['zyyyx'], 'mark'), on(12, 2, ['lm', 'md'], 'trim'), on(7, 3, ['lm'], 'trim'));
  const lidded = () => draw({ body: 'clay', fill: 'clay', trim: 'clay' },
    ...deepPot(12), layer(1, -2, disc(14, 6)), layer(6, -4, ['lm', 'md'], 'body'));

  const PIE = [
    '     zyzyzyzyzy     ',
    '   zyllllllllllmy   ',
    '  zllllllllllllmmy  ',
    ' zlllllllllllmmmmmy ',
    'zylllllllllmmmmmmmyx',
    'zyllllllllllmmmmmmyx',
    'yzmmmmmmmmmmmmmmmmyx',
    'yyzyzyzyzyzyzyzyzyxx',
    ' xmmmmmmmmmmmmmmmdx ',
    ' xddddddddddddddddx ',
    '  xxxxxxxxxxxxxxxx  '];
  const SLITS = { one: [[9, 2, ['ld', ' d']]], three: [[5, 3, ['ld', ' d']], [9, 2, ['ld', ' d']], [13, 3, ['ld', ' d']]], lattice: [[4, 2, ['d   d   d   d']], [3, 4, ['d   d   d   d   ']]] };
  const pie = (crust, slits, deep) => () => draw({ body: crust, trim: 'ash' },
    layer(0, 0, deep ? [...PIE.slice(0, 9), PIE[8], PIE[8], ...PIE.slice(9)] : PIE), ...SLITS[slits].map(([x, y, rows]) => on(x, y, rows)));
  const STANDING = ['  zyzyzyzyzyzy  ', ' zlllllllllmmmy ', 'zyllllldlllmmmyx', 'zyyzyzyzyzyzyzyx', 'xmmmmmmmmmmmmmdx', 'xllmmmmmmmmmmmdx', 'xllmmmmmmmmmmddx', 'xlmmmmmmmmmmmddx', 'xlmmmmmmmmmmmddx', 'xmmmmmmmmmmmdddx', ' xddddddddddddx ', '  xxxxxxxxxxxx  '];
  const gamePie = () => draw({ body: 'crust', trim: 'ash' }, layer(0, 0, STANDING));
  const honeyTart = () => draw({ body: 'crust', fill: 'honey', mark: 'ruby' },
    layer(0, 0, ['   yyyyyyyyyyyy   ', ' yyzzzzzzzzzzzzyy ', 'yzzzzzzzzzzzzzzzzy', 'yzzzzzzzzzzzzzzzzy', ' yyzzzzzzzzzzzzyy ', 'xmmmyyyyyyyyyymmmx', 'xddmmmmmmmmmmmmddx', ' xxddddddddddddxx '].map(r => r.replace(/[yz]/g, c => c === 'z' ? 'm' : 'd'))),
    on(2, 1, GOODS.flatDisc(14, 4).map(r => r.replace(/m/g, 'l')), 'fill'), on(6, 1, ['WY', 'YX']), on(10, 2, ['WY', 'YX']));
  const SLICE_BREAD = ['   lllllllllll   ', ' lllmmmmmmmmmmmd ', 'llmmmmmmmmmmmmmdd', 'lmmmmmmmmmmmmmmdd', 'ddddddddddddddddd'];
  const sandwich = fillings => () => draw({ body: 'crust', fill: 'leaf', trim: 'ham', mark: 'cheese' },
    layer(0, 5 + fillings.length * 2, ['lmmmmmmmmmmmmmmdd', 'mmmmmmmmmmmmmmmdd', ' ddddddddddddddd ']),
    ...fillings.map((part, i) => layer(-1, 5 + (fillings.length - 1 - i) * 2, [' lmmmmmmmmmmmmmmmd', 'lmmmmmmmmmmmmmmmmd'], part)),
    layer(0, 0, SLICE_BREAD));
  const loaf = (fill) => () => draw({ body: 'crust', fill: fill || 'crust' },
    layer(0, 0, ellipsoid(10, 6)),
    ...(fill ? [on(5, 1, ['  dddddd  ', ' dMMMMMMd ', '  dMMMMd  '])] : [on(4, 2, [' l', 'ld', 'd ']), on(9, 1, [' l', 'ld', 'd ']), on(14, 2, [' l', 'ld', 'd '])]));
  const skewer = () => draw({ body: 'roast', trim: 'wood' },
    layer(0, 15, ['y   ', ' y  ', '  y ', '   x'].reverse().map(r => r), 'trim'),
    on(0, 0, Array.from({ length: 20 }, (_, i) => ' '.repeat(19 - i) + 'y'), 'trim'),
    layer(11, 1, ellipsoid(3.4, 3)), layer(7, 5, ellipsoid(3.4, 3)), layer(3, 9, ellipsoid(3.4, 3)));
  const ROOT = a => ellipsoid(4.5, 3, a);
  const roots = () => draw({ body: 'hide', trim: 'clay' }, ...plate(24), layer(3, -3, ROOT(-20)), layer(12, -3, ROOT(15)), layer(7, 0, ROOT(0)));
  const scored = rows => rows.map((row, y) => y > 1 && y < rows.length - 2 ? [...row].map((g, x) => g !== ' ' && x % 4 === 2 ? 'd' : g).join('') : row);
  const feast = () => PX.layered(
    [0, 12, disc(30, 11), 'wood'],
    [3, 13, GOODS.flatDisc(24, 8).map(r => r.replace(/m/g, 'l')), 'ash'],
    [15, 4, scored(ellipsoid(7, 5)), 'crust'],
    [0, 4, [' lm ', 'llmd', ' mmd', '  md'], 'bone'],
    [2, 6, ellipsoid(7, 6, -20), 'roast'],
    [3, 8, ['  l  ', ' l l ', '  l  '], 'roast'],
    [16, 13, ellipsoid(3, 3), 'ruby'],
    [21, 12, ellipsoid(3, 3), 'ruby'],
    [20, 11, ['lm', 'md'], 'leaf']
  );

  const smokedCheese = () => PX.layered(
    [0, 4, lathe(new Array(6).fill(20)), 'amber'],
    [0, 0, disc(20, 8).map(r => r.replace(/m/g, 'l').replace(/d/g, 'm')), 'amber'],
    [12, 2, ['  ll ', ' llll', 'lllll', 'mmmmm', 'mmmmm', 'mmmmd', 'mmmdd', 'mmdd '], 'cheese']);
  const crocTail = () => PX.layered(
    [0, 1, ellipsoid(10, 6.5), 'croc'],
    [1, 0, ['  l l l l l l l  ', ' lmlmlmlmlmlmlmd '], 'croc'],
    [12, 2, ellipsoid(4.5, 5.5).map(r => r.replace(/d/g, 'm')), 'tallow']);
  const roastJoint = () => PX.layered(
    [0, 9, disc(28, 9), 'wood'],
    [0, 4, [' lm ', 'llmd', ' mmd'], 'bone'],
    [2, 1, ellipsoid(10, 7.5), 'roast'],
    [15, 3, ellipsoid(4.2, 6), 'ham'],
    [17, 6, ['lm', 'mm', 'mm', 'md'], 'ham']);
  const WEDGE = [
    '             zy  ',
    '          llzzy  ',
    '       llllllzy  ',
    '    lllllllllzy  ',
    ' llllllllllllzyx ',
    'lmmmmmmmmmmmmyyx ',
    'lmmmmmmmmmmmmyxx ',
    'lmmmmmmmmmmmmyxx ',
    'lmmmmmmmmmmmmyxx ',
    'dmmmmmmmmmmmmyx  ',
    ' ddddddddddddx   '];
  const wedge = () => draw({ body: 'cheese', trim: 'topaz' }, layer(0, 0, WEDGE));
  const crockOf = (fill, extra, vessel) => () => draw({ body: vessel || 'clay', fill, trim: 'ham', mark: 'bone' }, ...crock(10), ...(extra || []));
  const covered = () => draw({ body: 'clay', trim: 'linen', mark: 'cord' }, ...shift(crock(10), 0, 3), layer(0, 0, ['   lllmmm   ', ' llllmmmmmd ', 'llmmmmmmmmdd', ' lmmmmmmmdd ', '  WYYYYYYX  '], 'trim'));
  const preserved = () => draw({ body: 'glass', fill: 'jam', trim: 'linen', mark: 'cord' }, ...jar({ top: 'cloth', level: 1 }));

  const SLUMP = ['      lllmm       ', '    llmmmmmmd     ', '   lmmmmmmmmmd    ', '  lmmmmmmmmmmmdd  ', ' lmmmmmmmmmmmmmdd ', 'lmmmmmmmmmmmmmmmdd', 'mmmmmmmmmmmmmmdddd', ' dddddddddddddddd '];
  const rotten = () => draw({ body: 'rot', fill: 'moss' }, layer(0, 0, SLUMP), on(4, 2, ['LM', 'MD'], 'fill'), on(9, 4, ['LM'], 'fill'));
  const rottenMeat = () => draw({ body: 'carrion', trim: 'bone', fill: 'moss' }, layer(0, 9, BONE, 'trim'), layer(5, 0, ellipsoid(7, 5.6, -40)), on(9, 3, ['LM', 'MD'], 'fill'), on(13, 6, ['LM'], 'fill'));

  const STEW_BITS = [[4, 1], [9, 0, 'mark'], [12, 1]];
  const RICH = [[3, 1], [7, 0, 'mark'], [10, 1], [6, 2, 'mark'], [13, 0]];

  const FLOUR_SACK = [
    '   llllllllmmmmmmd   ',
    '  lllllllmmmmmmmmmd  ',
    '   ddddddddddddddd   ',
    '    lllllmmmmmmmd    ',
    '   llllllmmmmmmmmd   ',
    '  llllllmmmmmmmmmdd  ',
    ' lllllllmmmmmmmmmddd ',
    ' llllllmmmmmmmmmmddd ',
    'llllllmmmmmmmmmmmdddd',
    'lllllmmmmmmmmmmmmdddd',
    'lllllmmmmmmmmmmmmdddd',
    'llllmmmmmmmmmmmmddddd',
    'llllmmmmmmmmmmmmddddd',
    ' lllmmmmmmmmmmmdddd  ',
    '  dddddddddddddddd   '
  ];
  const flour = () => PX.layered(
    [2, 0, ellipsoid(8, 3.5), 'milk'],
    [0, 5, FLOUR_SACK, 'linen'],
    [6, 11, ['  y  ', ' yyy ', 'y y y', '  y  ', '  y  '], 'linen', 'linen', 'straw'],
    [20, 15, [' lm', 'lmd'], 'milk']
  );
  const KERNEL = [' lm ', 'lmmd', ' dd '];
  const SPROUT = ['z', 'y'];
  const MALT_HEAP = [[9, 0], [7, 2], [13, 2], [3, 4], [9, 4], [15, 4], [2, 6], [7, 6], [12, 6], [17, 6], [0, 8], [4, 8], [9, 8], [13, 8], [18, 8], [3, 10], [8, 10], [12, 10], [17, 10]];
  const malt = () => draw({ body: 'crust', trim: 'tallow' },
    ...heap(KERNEL, MALT_HEAP),
    ...MALT_HEAP.filter((_, i) => i % 2 === 0).map(([x, y]) => on(x + 3, y - 1, SPROUT, 'trim')));

  return [
    { id: 'flour', draw: flour },
    { id: 'malt', draw: malt },
    { id: 'wild_berries', draw: wildBerries },
    { id: 'grapes', draw: grapes },
    { id: 'apple', draw: apple },
    { id: 'dried_fruit', draw: driedFruit },
    { id: 'cabbage', draw: cabbage },
    { id: 'kale', draw: kale },
    { id: 'turnip', draw: root('linen', 'regal', 6, ['m', 'd']) },
    { id: 'radish', draw: root('ruby', 'ruby', 4.5, ['z', 'y', 'x'].map(g => g).map(g => ({ z: 'l', y: 'm', x: 'd' })[g])) },
    { id: 'onion', draw: onion },
    { id: 'pumpkin', draw: pumpkin },
    { id: 'beans', draw: beans },
    { id: 'peas', draw: peas },
    { id: 'sugarcane', draw: sugarcane },
    { id: 'honey', draw: honey },
    { id: 'wild_oats', draw: grain('straw', 'oats') },
    { id: 'wheat', draw: grain('straw', 'wheat') },
    { id: 'rye', draw: grain('dun', 'rye') },
    { id: 'wild_sage', draw: herb('sage', 'sage') },
    { id: 'thyme', draw: herb('leaf', 'thyme') },
    { id: 'mint', draw: herb('mint', 'mint') },
    { id: 'common_carp', draw: fish('carp') },
    { id: 'river_trout', draw: fish('trout') },
    { id: 'smoked_fish', draw: fish('smoked', 'amber') },
    { id: 'baked_fish', draw: servedFish('drab') },
    { id: 'wine_poached_fish', draw: () => draw({ body: 'carp', fill: 'carp', mark: 'wine', trim: 'plaster' }, ...plate(26), on(4, 2, GOODS.flatDisc(18, 5), 'mark'), ...shift(fishLayers(), 3, -3).filter(l => l.part !== 'mark')) },
    { id: 'venison', draw: steak('flesh') },
    { id: 'elk_meat', draw: steak('flesh', 'tallow', [chopBone()]) },
    { id: 'aurochs_meat', draw: steak('blood', 'tallow', [layer(-9, 6, TOMAHAWK, 'mark', { behind: true })]) },
    { id: 'boar_meat', draw: steak('ham', 'tallow') },
    { id: 'crocodile_meat', draw: crocTail },
    { id: 'salted_meat', draw: steak('ham', 'tallow', [on(6, 3, SALT, 'mark'), on(12, 5, SALT, 'mark')]) },
    { id: 'seared_steak', draw: steak('roast', 'ash', [on(6, 3, GRILL), on(10, 3, GRILL)]) },
    { id: 'rabbit_meat', draw: haunch('flesh', 6, [], {}, true) },
    { id: 'bear_meat', draw: haunch('flesh', 8.5, [on(9, 0, FUR, 'mark')], { mark: 'fur' }) },
    { id: 'owlbear_meat', draw: haunch('owlpelt', 8, [on(15, 0, FEATHER, 'mark')], { mark: 'plume' }) },
    { id: 'mammoth_meat', draw: haunch('port', 9.5, [on(6, 1, FAT_CAP, 'mark')], { mark: 'tallow' }) },
    { id: 'rat_meat', draw: ratPair },
    { id: 'chicken_meat', draw: drumstick('trout', 6) },
    { id: 'fowl_meat', draw: brace('ham') },
    { id: 'hippogriff_meat', draw: drumstick('flesh', 7.5, [on(13, 0, FEATHER, 'mark')], { mark: 'plume' }) },
    { id: 'wolf_meat', draw: ribs('flesh', 4, 2) },
    { id: 'goat_meat', draw: ribs('ham', 3, 2) },
    { id: 'sabretooth_meat', draw: ribs('roast', 5, 4) },
    { id: 'worg_meat', draw: ribs('port', 4, 2, [on(1, 7, ['ZY ZY ZY ZY ZY ', 'YXYXYXYXYXYXYX'], 'mark')], { mark: 'wolfpelt' }) },
    { id: 'dried_meat', draw: jerky('leather') },
    { id: 'smoked_meat', draw: jerky('smoked', true) },
    { id: 'smoked_ham', draw: hungHam('smoked') },
    { id: 'cured_ham', draw: carvedHam('ham') },
    { id: 'dry_sausage', draw: salami('salami') },
    { id: 'smoked_sausage', draw: sausages('smoked') },
    { id: 'fresh_sausage', draw: fryLinks('ham') },
    { id: 'hard_cheese', draw: wedge },
    { id: 'smoked_cheese', draw: smokedCheese },
    { id: 'salt_pork', draw: () => draw({ body: 'wood', fill: 'brine', trim: 'salami', mark: 'iron' }, ...GOODS.bands(GOODS.open(14, [14, 16, 16, 16, 16, 16, 16, 14], 1), [1, 6]), on(3, 0, ['lmm', 'mdd'], 'trim'), on(8, 1, ['lm', 'md'], 'trim')) },
    { id: 'pickled_vegetables', draw: () => draw({ body: 'stone', fill: 'pickle', trim: 'cabbage', mark: 'poppy' }, ...shift(deepPot(12), 0, 2), layer(2, 0, ['  lll ', ' llmmd', 'lmmd  '], 'trim'), layer(9, 1, ['lm', 'md'], 'mark')) },
    { id: 'potted_meat', draw: covered },
    { id: 'confit_meat', draw: crockOf('tallow', [layer(7, -3, ['ZY', 'YX', 'YX', 'YX'], 'mark')], 'sage') },
    { id: 'preserved_fruit', draw: preserved },
    { id: 'marching_loaf', draw: loaf('roast') },
    { id: 'bread', draw: loaf() },
    { id: 'simple_sandwich', draw: sandwich(['trim']) },
    { id: 'hearty_sandwich', draw: sandwich(['fill', 'trim', 'mark']) },
    { id: 'simple_pie', draw: pie('ash', 'one') },
    { id: 'meat_pie', draw: pie('crust', 'three') },
    { id: 'hearty_pie', draw: pie('roast', 'lattice', true) },
    { id: 'game_pie', draw: gamePie },
    { id: 'honey_tart', draw: honeyTart },
    { id: 'spit_meat', draw: skewer },
    { id: 'small_stew', draw: stew(16, 'broth', STEW_BITS) },
    { id: 'fine_stew', draw: stew(0, 'broth', STEW_BITS, 'clay') },
    { id: 'lavish_stew', draw: cauldron },
    { id: 'pottage', draw: stew(16, 'pea', [[4, 1, 'mark'], [10, 1, 'mark']]) },
    { id: 'cold_milk_soup', draw: stew(16, 'milk', []) },
    { id: 'braised_game', draw: lidded },
    { id: 'roast_joint', draw: roastJoint },
    { id: 'baked_roots', draw: roots },
    { id: 'feast_platter', draw: feast },
    { id: 'rotten_food', draw: rotten },
    { id: 'rotten_meat', draw: rottenMeat }
  ];
})();
PIXEL_ICONS.push(...PIXEL_FOOD);
