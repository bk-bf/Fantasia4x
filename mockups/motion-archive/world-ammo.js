'use strict';
(() => {
  const { piece, scene, strewn, packed, held, staged } = WORLD_STACKS;
  const SHAFT = 'lmd', STAGGER = [0, 3, 1], PITCH = 2, CORD = 'ZYYYX';
  const HEADS = {
    flint: [' z ', 'zyx', ' x '],
    splinter: ['    ', 'zzyx', '    '],
    tined: ['z   ', ' zyx', 'x   '],
    leaf: [' zy ', 'zyyx', ' xx '],
    broad: ['zz  ', 'zyyx', 'xx  '],
    bodkin: ['z    ', 'yzyyx', 'x    '],
    barbed: ['zz   ', '  zyx', 'xx   '],
    needle: ['      ', 'zzyyyx', '      '],
    swept: ['zz   ', 'zzyyx', 'xx   '],
    fang: ['   z', 'zzyy', '    '],
    cast: ['zy ', 'zyx', 'xx '],
    square: ['zz ', 'zyx', 'xx '],
    chisel: ['zzy ', 'zyyx', 'xxx '],
    socketed: ['z    ', 'zzyyx', 'x    '],
    point: ['  ', 'yx', '  ']
  };
  const VANES = { feather: [' LL', 'MMM', ' DD'], horn: ['LL', 'MM', 'DD'], down: ['L ', 'LM', 'D '] };
  const SHAPES = { arrow: { len: 12, vane: 'feather' }, bolt: { len: 7, vane: 'horn' }, dart: { len: 8, vane: 'down' } };

  function stamped(grid, rows, x, y) {
    rows.forEach((row, j) => [...row].forEach((glyph, i) => { if (glyph !== ' ') grid[y + j][x + i] = glyph; }));
  }
  function sheaf(shape, head) {
    const reach = HEADS[head][1].length, wide = shape.len + reach + Math.max(...STAGGER), tie = 3 + (shape.len >> 1);
    const grid = Array.from({ length: PITCH * (STAGGER.length - 1) + 3 }, () => new Array(wide).fill(' '));
    STAGGER.forEach((x0, k) => {
      const y = k * PITCH;
      for (let i = 0; i < shape.len + 2; i++) grid[y + 1][x0 + i] = SHAFT[k];
      stamped(grid, VANES[shape.vane], x0, y);
      stamped(grid, HEADS[head], x0 + shape.len, y);
    });
    [...CORD].forEach((glyph, j) => { grid[j + 1][tie] = glyph; });
    return grid.map(row => row.join(''));
  }

  const STANDING = [[1, 1], [4, 0], [7, 2], [10, 1]];
  function upright(shape) {
    const grid = Array.from({ length: Math.max(shape.len + 1, 11) }, () => new Array(12).fill(' '));
    for (const [x, top] of STANDING) {
      for (let y = top; y < grid.length; y++) grid[y][x] = y === top ? 'm' : y > top + 3 && (x + y) % 5 === 0 ? 'm' : 'l';
      for (let y = top + 1; y < top + 4; y++) { grid[y][x - 1] = y === top + 3 ? 'M' : 'L'; grid[y][x + 1] = y === top + 3 ? 'D' : 'M'; }
    }
    const tie = grid.length - 4;
    for (let x = 0; x < 12; x++) grid[tie][x] = x < 4 ? 'Z' : x < 9 ? 'Y' : 'X';
    return grid.map(row => row.join(''));
  }
  const BUCKET = [
    'lmlmlmlmldmd',
    'zzzzyyyyyyxx',
    'lmlmmmmmmddd',
    'lmlmmmmmdddd',
    'zzzzyyyyyyxx',
    ' lmmmmmmddd '
  ];
  function bale(shape, head) {
    const tip = HEADS[head][1].replace(/ /g, '').slice(-3), long = shape.len + 3, ties = [Math.round(long * .3), Math.round(long * .7)];
    return ['l', 'd', 'm', 'd', 'm', 'd', 'd'].map((glyph, r) => {
      const lift = r < 2 ? 0 : r < 5 ? 1 : 2, band = 'ZYX'[lift], shift = r % 2 ? ' ' : '';
      let row = shift + 'LMD'[lift] + (r % 2 ? 'M' : 'L');
      for (let i = 0; i < long; i++) row += ties.includes(i) || ties.includes(i - 1) ? band : glyph;
      return row + tip + (r % 2 ? '' : ' ');
    });
  }
  const SHEAVES = [6, 20, 45, 80], countOf = quantity => quantity <= 12 ? 1 : quantity <= 30 ? 2 : quantity <= 60 ? 3 : 4;
  const arrow = (wood, feather, metal, lash) => ({ body: wood, trim: feather, strap: metal, lining: lash || 'cord' });
  const bucket = piece(BUCKET, { body: 'wood', strap: 'iron' });
  function bundled(shape, head, wear) {
    const loose = piece(sheaf(SHAPES[shape], head), wear), sheafed = piece(upright(SHAPES[shape]), wear), baled = piece(bale(SHAPES[shape], head), wear);
    const draws = [() => scene([0, 0, loose]), () => strewn(loose, [[0, 0], [2, 4]]), () => held([[0, 0, sheafed]], bucket, [0, sheafed.h - 2]), () => scene([0, 0, baled], [2, 5, baled])];
    return { kind: 'ammo', tuck: 'low', stages: SHEAVES, ground: quantity => draws[countOf(quantity || 1) - 1]() };
  }

  const PEBBLE = [
    ' llm ',
    'llmmd',
    'lmmdd',
    ' ddd '
  ];
  const BICONE = [
    ' llmm ',
    'lLmmdd',
    ' mddd '
  ];
  const ACORN = [
    ' llm  ',
    'llmmmd',
    ' mddd '
  ];
  const ALMOND = [
    ' lm ',
    'lLmd',
    ' dd '
  ];
  const CREEL = [
    'lllllllllllllllmmdd',
    'lmlmlmlmlmlmlmdmdmd',
    ' mlmlmlmlmlmdmdmdd ',
    '  ddddddddddddddd  '
  ];
  const SHOT_BAG = [
    ' zllllllmmdx ',
    ' llmmmmmmmdd ',
    'llmmmmmmmmmdd',
    'lmmmmmmmmmddd',
    ' mmmmmmmmddd ',
    '  ddddddddd  '
  ];

  const SHOT = [6, 20, 45];
  function cairn(p, rows) {
    const step = p.w + 1, most = Math.max(...rows);
    return rows.flatMap((n, tier) => Array.from({ length: n }, (_, i) => [((most - n) * step >> 1) + i * step, tier * (p.h - 1), p]));
  }
  const heaped = (p, many) => staged('ammo', SHOT, [() => scene(...cairn(p, [1, 2])), () => scene(...cairn(p, [1, 2, 3])), many]);
  const pebble = piece(PEBBLE, { body: 'stone' }), bicone = piece(BICONE, { body: 'bronze', trim: 'gold' });
  const acorn = piece(ACORN, { body: 'clay' }), almond = piece(ALMOND, { body: 'lead', trim: 'silver' });
  const creel = piece(CREEL, { body: 'sapwood' }), bag = piece(SHOT_BAG, { body: 'hide', strap: 'cord' });

  WORLD_GEAR.add({
    flint_arrow: bundled('arrow', 'flint', arrow('sapwood', 'fur', 'flint')),
    bone_arrow: bundled('arrow', 'splinter', arrow('wood', 'hide', 'bone')),
    barbed_bone_arrow: bundled('arrow', 'tined', arrow('wood', 'fur', 'bone')),
    bronze_arrow: bundled('arrow', 'leaf', arrow('ash', 'linen', 'bronze')),
    broadhead_arrow: bundled('arrow', 'broad', arrow('wood', 'linen', 'iron')),
    iron_arrow: bundled('arrow', 'bodkin', arrow('ash', 'linen', 'iron')),
    barbed_arrow: bundled('arrow', 'barbed', arrow('wood', 'red', 'iron')),
    steel_bodkin_arrow: bundled('arrow', 'needle', arrow('ash', 'wool', 'steel')),
    steel_broadhead_arrow: bundled('arrow', 'swept', arrow('wood', 'red', 'steel')),
    fang_arrow: bundled('arrow', 'fang', arrow('black', 'red', 'bone', 'red')),
    bronze_bolt: bundled('bolt', 'cast', arrow('wood', 'horn', 'bronze')),
    iron_bolt: bundled('bolt', 'square', arrow('wood', 'leather', 'iron')),
    heavy_quarrel: bundled('bolt', 'chisel', arrow('wood', 'leather', 'black')),
    steel_quarrel: bundled('bolt', 'socketed', arrow('ash', 'linen', 'steel')),
    blow_dart: bundled('dart', 'point', arrow('sapwood', 'linen', 'wood')),
    sling_stone: heaped(pebble, () => held(cairn(pebble, [2, 3]), creel, [-1, 5])),
    cast_sling_bullet: heaped(bicone, () => packed(bicone, 2, 5, { body: 'wood' }, 1)),
    clay_bullet: heaped(acorn, () => packed(acorn, 3, 3, { body: 'ash' }, 1)),
    lead_glans: heaped(almond, () => held(cairn(almond, [2, 3]), bag, [0, 3]))
  });
})();
