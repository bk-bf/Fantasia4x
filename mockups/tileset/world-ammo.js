'use strict';
(() => {
  const FEATHER = 'LMD', WOOD = 'lmd', METAL = 'zyx', CORD = 'ZYX', SHIFT = [1, 0, 2, 0, 1];
  const toneOf = (set, r, n) => set[r === 0 ? 0 : r === n - 1 ? 2 : 1];
  const SHAPES = {
    arrow: { len: 14, fletch: 3, head: 2, sheaf: 3 },
    broad: { len: 14, fletch: 3, head: 3, sheaf: 3, barb: true },
    hooked: { len: 14, fletch: 3, head: 3, sheaf: 3, hook: true },
    bolt: { len: 10, fletch: 3, head: 2, sheaf: 3, vane: true },
    dart: { len: 11, fletch: 2, head: 2, sheaf: 4 }
  };

  function shaftRow(row, r, shape) {
    const x0 = SHIFT[r % SHIFT.length], n = shape.sheaf;
    for (let i = 0; i < shape.len; i++) row[x0 + i] = i < shape.fletch ? toneOf(FEATHER, r, n) : i >= shape.len - shape.head ? toneOf(METAL, r, n) : toneOf(WOOD, r, n);
  }
  function splay(grid, shape) {
    const n = shape.sheaf, top = SHIFT[0], bottom = SHIFT[(n - 1) % SHIFT.length], reach = shape.vane ? shape.fletch : shape.fletch - 1;
    for (let i = 0; i < reach; i++) { grid[0][top + i] = 'L'; grid[n + 1][bottom + i] = 'D'; }
    const headTop = top + shape.len - shape.head, headBottom = bottom + shape.len - shape.head;
    if (shape.barb) { grid[0][headTop] = 'z'; grid[n + 1][headBottom] = 'x'; }
    if (shape.hook) grid[0][top + shape.len - 1] = 'z';
  }
  function sheaf(shape) {
    const n = shape.sheaf, wide = shape.len + 3, tie = Math.floor(shape.len / 2) + 1;
    const grid = Array.from({ length: n + 2 }, () => new Array(wide).fill(' '));
    for (let r = 0; r < n; r++) shaftRow(grid[r + 1], r, shape);
    splay(grid, shape);
    grid.forEach((row, j) => { row[tie] = j === 0 ? 'Z' : j === n + 1 ? 'X' : 'Y'; });
    return grid.map(row => row.join(''));
  }

  const PILES = [[[0, 0]], [[0, 0], [3, 3]], [[2, 0], [0, 3], [4, 5]], [[1, 0], [5, 2], [0, 4], [4, 6]]];
  const HEAPS = [[[0, 2], [4, 2], [2, 0]], [[0, 4], [4, 4], [8, 4], [2, 2], [6, 2], [4, 0]], [[0, 6], [4, 6], [8, 6], [12, 6], [2, 4], [6, 4], [10, 4], [4, 2], [8, 2], [6, 0]]];
  const STAGES = [6, 20, 45, 80];
  const countOf = quantity => quantity <= 12 ? 1 : quantity <= 30 ? 2 : quantity <= 60 ? 3 : 4;
  const inksOf = wear => [wear.body, wear.trim || wear.body, wear.strap || wear.body, wear.lining || 'cord'];
  const laid = (spots, rows, wear) => spots.reduce((sk, [x, y]) => PX.overlay(sk, x, y, rows, ...inksOf(wear)), PX.sketch());

  const bundled = (shape, wear) => ({ kind: 'ammo', tuck: 'low', stages: STAGES, ground: quantity => laid(PILES[countOf(quantity || 1) - 1], sheaf(SHAPES[shape]), wear) });
  const heaped = (rows, wear) => ({ kind: 'ammo', tuck: 'low', stages: STAGES.slice(0, 3), ground: quantity => laid(HEAPS[Math.min(3, countOf(quantity || 1)) - 1], rows, wear) });

  const PEBBLE = [' lm ', 'lmmd', ' dd '];
  const BICONE = [' lL ', 'lmmd', ' dd '];
  const ACORN = [' lm ', 'lmmd', 'mmdd', ' dd '];
  const ALMOND = [' lL ', 'lmmd', ' dd '];
  const arrow = (wood, feather, metal, lash) => ({ body: wood, trim: feather, strap: metal, lining: lash || 'cord' });

  WORLD_GEAR.add({
    flint_arrow: bundled('arrow', arrow('sapwood', 'fur', 'flint')),
    bone_arrow: bundled('arrow', arrow('wood', 'hide', 'bone')),
    barbed_bone_arrow: bundled('broad', arrow('wood', 'fur', 'bone')),
    bronze_arrow: bundled('arrow', arrow('ash', 'linen', 'bronze')),
    broadhead_arrow: bundled('broad', arrow('wood', 'linen', 'iron')),
    iron_arrow: bundled('arrow', arrow('ash', 'linen', 'iron')),
    barbed_arrow: bundled('broad', arrow('wood', 'red', 'iron')),
    steel_bodkin_arrow: bundled('arrow', arrow('ash', 'wool', 'steel')),
    steel_broadhead_arrow: bundled('broad', arrow('wood', 'red', 'steel')),
    fang_arrow: bundled('hooked', arrow('black', 'red', 'bone', 'red')),
    bronze_bolt: bundled('bolt', arrow('wood', 'horn', 'bronze')),
    iron_bolt: bundled('bolt', arrow('wood', 'leather', 'iron')),
    heavy_quarrel: bundled('bolt', arrow('wood', 'leather', 'iron')),
    steel_quarrel: bundled('bolt', arrow('ash', 'linen', 'steel')),
    blow_dart: bundled('dart', arrow('sapwood', 'linen', 'wood')),
    sling_stone: heaped(PEBBLE, { body: 'stone' }),
    cast_sling_bullet: heaped(BICONE, { body: 'bronze', trim: 'gold' }),
    clay_bullet: heaped(ACORN, { body: 'clay' }),
    lead_glans: heaped(ALMOND, { body: 'lead', trim: 'silver' })
  });
})();
