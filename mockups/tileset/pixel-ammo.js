'use strict';
const PIXEL_AMMO = (() => {
  const { assemble, part, profile, run, stamp, sketch } = PX, { haft } = PARTS;

  const shaft = n => run(0, ['m'], n);
  const FLETCH = part(-2, ['LLLLL  ', ' LLLLL ', 'dmmmmmm', ' DDDDD ', 'DDDDD  ']);
  const VANES = part(-3, ['LLL   ', 'LLLL  ', ' LLLL ', 'mmmmmm', 'mmmmmm', ' DDDD ', 'DDDD  ', 'DDD   ']);
  const TUFT = part(-2, [' LL', 'LLL', 'mmm', 'DDD', ' DD']);
  const WHIP = part(-1, ['ll', 'mm', 'dd']);

  const HEADS = {
    flint: profile([[-2, 1, 3, 'l'], [-1, 0, 5, 'l'], [0, 0, 7, 'm'], [1, 0, 5, 'd'], [2, 1, 3, 'd']]),
    splinter: profile([[-1, 0, 5, 'l'], [0, 0, 8, 'm'], [1, 0, 3, 'd']]),
    barbedBone: part(-3, ['l      ', 'll     ', ' lllll ', 'mmmmmmm', ' ddddd ', 'dd     ', 'd      ']),
    socket: profile([[-2, 2, 4, 'l'], [-1, 0, 6, 'l'], [0, 0, 7, 'm'], [1, 0, 6, 'd'], [2, 2, 4, 'd']]),
    broad: part(-4, ['ll      ', ' lll    ', ' lllll  ', 'mmmmmmm ', 'mmmmmmmm', 'ddddddd ', ' ddddd  ', ' ddd    ', 'dd      ']),
    swept: part(-4, ['l       ', 'll      ', ' llll   ', ' mmmmmm ', 'mmmmmmmm', ' dddddd ', ' dddd   ', 'dd      ', 'd       ']),
    bodkin: profile([[-1, 0, 6, 'l'], [0, 0, 8, 'm'], [1, 0, 6, 'd']]),
    needle: profile([[-1, 0, 4, 'l'], [0, 0, 9, 'm'], [1, 0, 4, 'd']]),
    barbed: part(-3, ['l      ', 'll     ', ' llll  ', 'mmmmmmm', ' dddd  ', 'dd     ', 'd      ']),
    fang: part(-3, ['     ll ', '  lllmml', 'llmmmmm ', 'mmmmdd  ', 'ddd     ']),
    pyramid: profile([[-2, 0, 3, 'l'], [-1, 0, 5, 'l'], [0, 0, 7, 'm'], [1, 0, 5, 'd'], [2, 0, 3, 'd']]),
    stub: profile([[-1, 0, 4, 'l'], [0, 0, 6, 'm'], [1, 0, 4, 'd']])
  };

  const arrow = (wood, feather, head, metal, lash) => assemble([[FLETCH, wood, feather], [shaft(12), wood], ...(lash ? [-1, [WHIP, lash]] : []), [HEADS[head], metal]]);
  const bolt = (wood, vane, head, metal) => assemble([[VANES, wood, vane], [haft(8), wood], [HEADS[head], metal]]);
  const dart = () => assemble([[TUFT, 'sapwood', 'linen'], [shaft(13), 'sapwood'], [HEADS.needle, 'wood']]);

  const PEBBLE = [' lml ', 'lmmmd', 'mmmdd', ' ddd '];
  const BULLET = [' lll  ', 'lmmmd ', 'mmmmdd', ' mddd ', '  dd  '];
  const ACORN = [' ll ', 'lmmd', 'mmmd', 'mmdd', ' dd '];
  const ALMOND = ['  ll   ', ' lmmm  ', 'lmmLmmd', ' mmmdd ', '  ddd  '];
  const pile = (rows, ...inks) => [[0, 7], [8, 9], [4, 1]].reduce((sk, [x, y]) => stamp(sk, x, y, rows, inks), sketch());

  return [
    { id: 'flint_arrow', draw: () => arrow('sapwood', 'fur', 'flint', 'flint', 'cord') },
    { id: 'bone_arrow', draw: () => arrow('wood', 'hide', 'splinter', 'bone', 'cord') },
    { id: 'barbed_bone_arrow', draw: () => arrow('wood', 'fur', 'barbedBone', 'bone', 'cord') },
    { id: 'bronze_arrow', draw: () => arrow('ash', 'linen', 'socket', 'bronze') },
    { id: 'broadhead_arrow', draw: () => arrow('wood', 'linen', 'broad', 'iron') },
    { id: 'iron_arrow', draw: () => arrow('ash', 'linen', 'bodkin', 'iron') },
    { id: 'barbed_arrow', draw: () => arrow('wood', 'red', 'barbed', 'iron') },
    { id: 'steel_bodkin_arrow', draw: () => arrow('ash', 'wool', 'needle', 'steel') },
    { id: 'steel_broadhead_arrow', draw: () => arrow('wood', 'red', 'swept', 'steel') },
    { id: 'fang_arrow', draw: () => arrow('black', 'red', 'fang', 'bone', 'red') },
    { id: 'bronze_bolt', draw: () => bolt('wood', 'horn', 'stub', 'bronze') },
    { id: 'iron_bolt', draw: () => bolt('wood', 'leather', 'stub', 'iron') },
    { id: 'heavy_quarrel', draw: () => bolt('wood', 'leather', 'pyramid', 'iron') },
    { id: 'steel_quarrel', draw: () => bolt('ash', 'linen', 'pyramid', 'steel') },
    { id: 'blow_dart', draw: dart },
    { id: 'sling_stone', draw: () => pile(PEBBLE, 'stone') },
    { id: 'cast_sling_bullet', draw: () => pile(BULLET, 'bronze') },
    { id: 'clay_bullet', draw: () => pile(ACORN, 'clay') },
    { id: 'lead_glans', draw: () => pile(ALMOND, 'lead', 'lead') }
  ];
})();
PIXEL_ICONS.push(...PIXEL_AMMO);
