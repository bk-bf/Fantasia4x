'use strict';
(() => {
  const { part, run, profile, stack, strip } = PX, { grip, wrapped, BLADE, POMMEL } = WORLD_ITEMS.parts;

  const haft = n => run(-1, ['m', 'd'], n);
  const lashing = n => [run(-1, ['lm', 'md'], n), 'cord'];
  const collar = n => run(-2, ['l', 'm', 'm', 'd'], n);

  const HOE_BLADE = part(-5, [
    'lllll ',
    'mmmmmm',
    'mmmmmd',
    'ddddd ',
    '    dm'
  ]);
  const BROAD_HOE_BLADE = part(-6, [
    ' llll  ',
    'lmmmmm ',
    'mmmmmmm',
    'mmmmmmd',
    'dddddd ',
    '     dm'
  ]);
  const pickHead = reach => part(-reach, Array.from({ length: reach * 2 + 1 }, (_, i) => {
    const d = Math.abs(i - reach);
    return d === 0 ? '  dm' : d >= reach - 1 ? (d === reach ? 'd   ' : 'ml  ') : d >= reach - 3 ? ' ml ' : '  ml';
  }));
  const POINT = part(-5, [
    'l    ',
    'ml   ',
    ' ml  ',
    ' mml ',
    '  mml',
    '  ddm',
    '  dd '
  ]);
  const spadeBlade = (n, tip) => profile([[-3, 1, n - tip, 'l'], [-2, 0, n - 1, 'l'], [-1, 0, n, 'm'], [0, 0, n, 'm'], [1, 0, n - 1, 'm'], [2, 1, n - tip, 'd']]);
  const STONE_SPADE = stack(spadeBlade(10, 2), strip(-1, 3, 5, 'l'), strip(1, 6, 8, 'd'));
  const IRON_SHOVEL = stack(spadeBlade(10, 2), strip(0, 1, 7, 'd'));
  const STEEL_SHOVEL = stack(spadeBlade(11, 4), strip(-1, 1, 8, 'l'));
  const T_GRIP = part(-3, ['l', 'm', 'm', 'm', 'd']);
  const FIRED_TIP = profile([[-1, 0, 3, 'm'], [0, 0, 5, 'l']]);
  const KNOT = part(-2, ['l']);

  const SAW = stack(
    strip(-4, 0, 14, 'm'), strip(-3, 0, 14, 'd'),
    strip(-2, 0, 1, 'm'), strip(-1, 0, 1, 'm'), strip(-2, 13, 14, 'm'), strip(-1, 13, 14, 'm')
  );
  const SAW_BLADE = stack(strip(0, 0, 15, 'l'), strip(1, 0, 15, 'm'), strip(2, 1, 15, 'd '));
  const REINS = stack(strip(-2, 0, 10, 'm'), strip(1, 0, 10, 'd'), strip(-1, 10, 12, 'm'), strip(0, 10, 12, 'd'), strip(-1, 12, 16, 'l'), strip(0, 12, 16, 'm'), strip(-2, 15, 17, 'm'), strip(1, 15, 17, 'd'));
  const HAIRPIN = stack(strip(-2, 1, 17, 'l'), strip(1, 1, 17, 'd'), strip(-1, 0, 1, 'm'), strip(0, 0, 1, 'm'), strip(-2, 17, 18, 'm'), strip(1, 17, 18, 'm'));
  const KNAPPED = profile([[-2, 1, 6, 'm'], [-1, 0, 8, 'l'], [0, 0, 9, 'm'], [1, 0, 7, 'd']]);
  const KNIFE = profile([[-1, 0, 9, 'l'], [0, 0, 10, 'm'], [1, 0, 8, 'd']]);
  const CLEAVER = profile([[-4, 1, 9, 'l'], [-3, 0, 9, 'l'], [-2, 0, 9, 'm'], [-1, 0, 9, 'm'], [0, 0, 9, 'm'], [1, 0, 8, 'd']]);
  const SICKLE = part(-5, [
    '   llll  ',
    '  lMMMml ',
    ' lM    md',
    ' mM     d',
    'mM       ',
    'md       '
  ]);
  const SCAPULA = profile([[-4, 5, 9, 'l'], [-3, 3, 9, 'l'], [-2, 1, 9, 'm'], [-1, 0, 9, 'm'], [0, 0, 9, 'm'], [1, 1, 9, 'd'], [2, 3, 9, 'd'], [3, 5, 9, 'd']]);
  const DRAW_BLADE = profile([[-1, 0, 12, 'l'], [0, 0, 12, 'm'], [1, 0, 12, 'd']]);
  const DRAW_HANDLE = part(-1, ['l ', 'mm', 'mm', 'md', 'dd', ' d']);
  const TORCH_WRAP = run(-2, ['l', 'm', 'm', 'd'], 4);
  const FLAME = part(-2, [
    '  xy ',
    ' xyzy',
    'xyzzz',
    ' xyz ',
    '  y  '
  ]);

  const ROD = [
    { id: 'stone_hoe', pieces: () => [[haft(30), 'wood'], -5, lashing(2), -1, [HOE_BLADE, 'stone']] },
    { id: 'iron_hoe', pieces: () => [[haft(30), 'wood'], -6, [HOE_BLADE, 'iron']] },
    { id: 'steel_hoe', pieces: () => [[grip(5), 'leather'], [haft(25), 'ash'], -7, [BROAD_HOE_BLADE, 'steel']] },
    { id: 'copper_pick', pieces: () => [[haft(30), 'wood'], -4, lashing(2), -1, [pickHead(5), 'copper']] },
    { id: 'stone_pick', pieces: () => [[haft(29), 'wood'], -4, lashing(2), -2, [POINT, 'stone']] },
    { id: 'iron_pick', pieces: () => [[haft(30), 'wood'], -3, [pickHead(7), 'iron']] },
    { id: 'steel_pick', pieces: () => [[grip(5), 'leather'], [haft(25), 'ash'], -3, [pickHead(8), 'steel']] },
    { id: 'rune_etched_pick', pieces: () => [[grip(5), 'wool'], [haft(25), 'black'], -3, [pickHead(8), 'runed']] },
    { id: 'digging_stick', pieces: () => [[haft(16), 'wood'], [KNOT, 'wood'], [haft(10), 'wood'], [haft(3), 'ember'], [FIRED_TIP, 'ember']] },
    { id: 'stone_spade', pieces: () => [[T_GRIP, 'wood'], [haft(21), 'wood'], -3, lashing(3), -1, [STONE_SPADE, 'stone']] },
    { id: 'iron_shovel', pieces: () => [[T_GRIP, 'wood'], [haft(20), 'wood'], [collar(2), 'iron'], [IRON_SHOVEL, 'iron']] },
    { id: 'steel_shovel', pieces: () => [[T_GRIP, 'steel'], [grip(4), 'leather'], [haft(16), 'ash'], [collar(2), 'steel'], [STEEL_SHOVEL, 'steel']] },
    { id: 'torch', pieces: () => [[haft(12), 'wood'], -1, [TORCH_WRAP, 'hide'], [FLAME, 'flame', 'flame', 'flame']] }
  ];
  const HAND = [
    { id: 'saw', pieces: () => [[wrapped(4), 'wood'], [SAW, 'wood'], -15, [SAW_BLADE, 'bronze']] },
    { id: 'wooden_tongs', pieces: () => [[HAIRPIN, 'sapwood'], 2 - HAIRPIN.len, lashing(2), HAIRPIN.len - 4] },
    { id: 'iron_tongs', pieces: () => [[REINS, 'iron']] },
    { id: 'steel_tongs', pieces: () => [[REINS, 'steel']] },
    { id: 'flint_knife', pieces: () => [[wrapped(5), 'hide'], [KNAPPED, 'flint']] },
    { id: 'copper_knife', pieces: () => [[POMMEL.dot, 'copper'], [wrapped(5), 'cord'], [KNIFE, 'copper']] },
    { id: 'bone_cleaver', pieces: () => [[grip(6), 'wood'], lashing(2), [CLEAVER, 'bone']] },
    { id: 'flint_sickle', pieces: () => [[grip(6), 'wood'], lashing(2), [haft(2), 'wood'], [SICKLE, 'wood', 'flint']] },
    { id: 'bone_fleshing_scraper', pieces: () => [[haft(11), 'wood'], -2, lashing(2), [SCAPULA, 'bone']] },
    { id: 'iron_fleshing_knife', pieces: () => [[DRAW_HANDLE, 'wood'], [DRAW_BLADE, 'iron'], [DRAW_HANDLE, 'wood']] }
  ];

  const upright = new Set(['torch']);
  WORLD_ITEMS.add(Object.fromEntries([
    ...ROD.map(t => [t.id, { pieces: t.pieces, headUp: true, headBelow: !upright.has(t.id) }]),
    ...HAND.map(t => [t.id, { pieces: t.pieces }])
  ]));
})();
