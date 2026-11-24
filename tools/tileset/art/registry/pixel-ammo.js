'use strict';
const PIXEL_AMMO = (() => {
  const { assemble, part, profile, run } = PX, { haft } = PARTS;

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

  const PEBBLE = [' llll ', 'lmmmml', 'lmmmmd', 'mmmmdd', ' dddd '];
  const BICONE = ['   ll   ', ' llmLm  ', 'lmmmLmmd', ' mmmMdd ', '   dd   '];
  const ACORN = [' ll ', 'lmmd', 'mmmd', 'mmdd', ' dd '];
  const TRAY = ['llllllllllllll', 'mmmmmmmmmmmmmm', ' dddddddddddd '];
  const ALMOND = ['    lll    ', '  llmmmml  ', ' lmmmLLmmmd', 'lmmmmmmmmd ', ' mmmmmddd  ', '  dddd     '];
  const heap = (rows, spots, ...inks) => PX.layered(...spots.map(([x, y]) => [x, y, rows, ...inks]));
  const slingStones = () => heap(PEBBLE, [[0, 4], [7, 5], [4, 0]], 'stone');
  const slingBullets = () => heap(BICONE, [[0, 8], [4, 4], [8, 0]], 'bronze', 'gold');
  const clayTray = () => PX.layered([0, 3, TRAY, 'wood'], [1, -1, ACORN, 'clay'], [5, -1, ACORN, 'clay'], [9, -1, ACORN, 'clay'], [3, -4, ACORN, 'clay'], [7, -4, ACORN, 'clay']);
  const leadGlandes = () => heap(ALMOND, [[0, 5], [3, 0]], 'lead', 'silver');

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
    { id: 'sling_stone', draw: slingStones },
    { id: 'cast_sling_bullet', draw: slingBullets },
    { id: 'clay_bullet', draw: clayTray },
    { id: 'lead_glans', draw: leadGlandes }
  ];
})();
PIXEL_ICONS.push(...PIXEL_AMMO);
