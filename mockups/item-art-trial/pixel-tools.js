'use strict';
const PIXEL_TOOLS = (() => {
  const { assemble, part, profile, run, stack, strip, mirror } = PX, { haft, binding } = PARTS;

  const rungs = (from, to, at, tones) => part(from, Array.from({ length: to - from + 1 }, (_, i) => ' '.repeat(at) + tones[i % tones.length]));

  const POINT_HEAD = part(-11, [
    ' l    ',
    ' ll   ',
    ' ml   ',
    '  ml  ',
    ' dml  ',
    '  dml ',
    '  ml  ',
    '  dml ',
    '  ml  ',
    '  dml ',
    '  ml  ',
    '  dml ',
    '  md  ',
    '  dmm ',
    '  dd  '
  ]);
  const PICK_ARM = part(-13, [
    'l      ',
    'ml     ',
    'ml     ',
    ' ml    ',
    ' ml    ',
    '  ml   ',
    '  dml  ',
    '   dml ',
    '  dmml ',
    '   dml ',
    '  dmml ',
    '   dml ',
    '  dmml '
  ]);
  const PICK_HEAD = stack(PICK_ARM, mirror(PICK_ARM, { l: 'm' }), strip(0, 3, 6, 'dml'));

  const SAW_FRAME = stack(
    strip(-9, 3, 23, 'l'), strip(-8, 3, 23, 'm'),
    rungs(-7, 0, 3, ['lm', 'md']), rungs(-7, 0, 21, ['lm', 'md']),
    strip(0, 0, 3, 'l'), strip(1, 0, 4, 'm'), strip(2, 0, 4, 'd')
  );
  const SAW_BLADE = stack(strip(1, 4, 23, 'l'), strip(2, 4, 23, 'm'), strip(3, 5, 22, 'm '));

  const HAIRPIN = profile([
    [-5, 3, 22, 'l'], [-4, 2, 23, 'm'], [4, 2, 23, 'm'], [5, 3, 22, 'd'],
    [-3, 1, 3, 'l'], [-2, 0, 2, 'l'], [-1, 0, 2, 'm'], [0, 0, 2, 'm'], [1, 0, 2, 'm'], [2, 0, 2, 'd'], [3, 1, 3, 'd'],
    [-3, 22, 24, 'm'], [-2, 24, 25, 'm'], [3, 22, 24, 'd'], [2, 24, 25, 'd']
  ]);
  const HAIRPIN_LASHING = rungs(-5, 5, 5, ['lm', 'ml']);

  const REIN = profile([
    [-5, 0, 12, 'l'], [-4, 0, 12, 'm'],
    [-4, 12, 14, 'l'], [-3, 12, 14, 'm'],
    [-3, 14, 16, 'l'], [-2, 14, 16, 'm'],
    [1, 18, 20, 'm'], [2, 18, 20, 'd'],
    [2, 20, 23, 'm'], [3, 20, 23, 'd'],
    [1, 23, 25, 'm'], [2, 23, 25, 'd']
  ]);
  const PIVOT = profile([[-2, 16, 18, 'l'], [-1, 15, 18, 'm'], [0, 16, 19, 'm'], [1, 15, 18, 'm'], [2, 16, 18, 'd'], [0, 17, 18, 'l']]);
  const TONGS = stack(REIN, mirror(REIN, { l: 'd', d: 'l' }), PIVOT);

  const KNAPPED_BLADE = stack(profile([[-2, 1, 6, 'm'], [-1, 0, 8, 'm'], [0, 1, 10, 'm'], [1, 0, 9, 'l'], [2, 2, 9, 'l']]), strip(-1, 2, 3, 'd'), strip(0, 5, 6, 'd'), strip(-2, 3, 4, 'd'));

  const lashing = n => [binding(n), 'cord'];

  const copperPick = () => assemble([[haft(22), 'wood'], -8, lashing(2), -2, [POINT_HEAD, 'copper'], -3, lashing(2)]);
  const ironPick = () => assemble([[haft(23), 'wood'], -8, [PICK_HEAD, 'iron']]);
  const saw = () => assemble([[SAW_FRAME, 'wood'], -SAW_FRAME.len, [SAW_BLADE, 'bronze']]);
  const woodenTongs = () => assemble([[HAIRPIN, 'sapwood'], -HAIRPIN.len, [HAIRPIN_LASHING, 'cord']]);
  const ironTongs = () => assemble([[TONGS, 'iron']]);
  const flintKnife = () => assemble([[run(-1, ['lm', 'md'], 6), 'hide'], -1, [KNAPPED_BLADE, 'flint']]);

  return [
    { id: 'copper_pick', draw: copperPick },
    { id: 'iron_pick', draw: ironPick },
    { id: 'saw', draw: saw },
    { id: 'wooden_tongs', draw: woodenTongs },
    { id: 'iron_tongs', draw: ironTongs },
    { id: 'flint_knife', draw: flintKnife }
  ];
})();
