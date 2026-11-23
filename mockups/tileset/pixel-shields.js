'use strict';
const PIXEL_SHIELDS = (() => {
  const { dress, mark, plate, cut, times, WEAVE } = ARMOUR;

  const DISCS = {
    24: [8, 12, 14, 16, 18, 20, 20, 22, 22, 24, 24, 24, 24, 24, 24, 22, 22, 20, 20, 18, 16, 14, 12, 8],
    20: [6, 10, 12, 14, 16, 18, 18, 20, 20, 20, 20, 20, 20, 18, 18, 16, 14, 12, 10, 6],
    18: [6, 10, 12, 14, 16, 16, 18, 18, 18, 18, 18, 18, 16, 16, 14, 12, 10, 6]
  };
  const KITE = [10, 14, 18, 20, 20, 20, 20, 20, 20, 20, 20, 20, 18, 18, 18, 16, 16, 16, 14, 14, 12, 12, 10, 8, 8, 6, 4, 2];
  const TONES = { body: 'lmd', trim: 'LMD', strap: 'zyx' };
  const side = (dx, dy, reach) => dx + dy < -reach ? 0 : dx + dy > reach ? 2 : 1;
  const tone = (region, dx, dy, reach) => TONES[region][side(dx, dy, reach)];
  const far = (dx, dy) => Math.hypot(dx, dy);

  function disc(size, paint) {
    const half = (size - 1) / 2;
    const face = DISCS[size].map((_, y) => Array.from({ length: size }, (_, x) => paint(x - half, y - half, x, y)).join(''));
    return plate(cut(face, DISCS[size]));
  }
  function kite(paint) {
    const width = Math.max(...KITE), half = (width - 1) / 2;
    const face = KITE.map((w, y) => Array.from({ length: width }, (_, x) => paint(x - half, y, (width - w) / 2 + 2 > x || x >= width - (width - w) / 2 - 2 || y < 2)).join(''));
    return plate(cut(face, KITE));
  }
  const bossed = (dx, dy, reach) => far(dx, dy) < reach ? tone('trim', dx, dy, reach / 2) : null;

  const PLANKS = 'lllldlmmmdmmmmdmmmdodddd';
  const PLANK_ROUND = disc(24, (dx, dy, x) => PLANKS[x]);
  const HAND_HOLE = mark(10, 9, ['oooo', 'oooo', 'lmmd', 'mddd', 'oooo', 'oooo'], 'wood');
  const BATTENS = mark(4, 5, ['d   d    d   d', ...times(12, ''), 'd   d    d   d'], 'wood');

  const WATTLE = disc(20, (dx, dy, x, y) => far(dx, dy) > 8 ? tone('trim', dx, dy, 5) : far(dx, dy) < 2.2 ? tone('strap', dx, dy, 1) : WEAVE['+-#'[side(dx, dy, 6)]][y % 2][x % 4]);
  const RAWHIDE = disc(24, (dx, dy, x, y) => far(dx, dy) > 10 ? tone('trim', dx, dy, 6) : far(dx, dy) > 8.2 && far(dx, dy) < 9.4 && (x + y) % 2 ? 'x' : bossed(dx, dy, 3) || tone('body', dx, dy, 9));
  const BUCKLER = disc(18, (dx, dy) => far(dx, dy) > 7.2 ? tone('trim', dx, dy, 4) : far(dx, dy) < 4 ? tone('body', dx, dy, 2.2) : far(dx, dy) < 4.9 ? 'o' : tone('body', dx, dy, 7));
  const BUCKLER_RIVETS = mark(4, 4, ['l        l', ...times(8, ''), 'm        d'], 'iron');

  const BOSSED_KITE = kite((dx, y, rim) => rim ? tone('trim', dx, y - 12, 9) : bossed(dx, y - 8, 3.6) || (far(dx, y - 8) < 4.4 ? 'o' : tone('body', dx * 2, 0, 6)));
  const GRAVEN_KITE = kite((dx, y, rim) => rim ? tone('trim', dx, y - 12, 9) : bossed(dx, y - 7, 3) || (Math.abs(dx) < 1 && y > 11 && y < 25 ? 'dzy'[y % 3] : Math.abs(dx) < 5 && Math.abs(dx) > 3 && y > 12 && y < 20 && y % 2 ? 'y' : tone('body', dx * 2, 0, 6)));

  const HEATER = plate([
    'MMMMMMMMMMMMMMMMMMMMDD',
    'MLMMMMMMMMMMMMMMMMMLDD',
    ...times(5, 'MMlllllllllmmmmmmmmdDD'),
    'MLlllllllllmmmmmmmmdLD',
    ...times(5, 'MMlllllllllmmmmmmmmdDD'),
    'MLlllllllllmmmmmmmmdLD',
    'MMllllllllmmmmmmmdDD',
    'MMllllllllmmmmmmddDD',
    'MMlllllllmmmmmddDD',
    'MMllllllmmmmddDD',
    'MMlllllmmmddDD',
    'MMllllmmddDD',
    'MMlllmddDD',
    'MMlmddDD',
    'MMLDDD',
    'MDDD',
    'DD'
  ]);
  const SLAB = plate([
    'llllllmmmmmmdddd',
    'lLlllmmmmmmmmddLdd',
    'lllllmmmmmmmmddddd',
    'lllllmmmmmmmmddddd',
    'llllmmmmoommmddddd',
    'llllmmmmoommmddddd',
    'lllllmmmmmmmmddddd',
    'lLlllmmmmmmmmddLdd',
    'oooooooooooooooooo',
    'lLllllmmommmmddLdd',
    'llllllmmommmmddddd',
    'lllllmmmommmmddddd',
    'lllllmmmommmmddddd',
    'lllllmmmommmdddddd',
    'llllmmmmommmdddddd',
    'llllmmmmommmdddddd',
    'lLllmmmmommmdddLdd',
    'oooooooooooooooooo',
    'lLlllmmmmmmmdddLdd',
    'llllmmmmmmmmdddddd',
    'llllmmmmmmmddddddd',
    'llllmmmmmmmddddddd',
    'lllmmmmmmmmddddddd',
    'lLlmmmmmmmdddddLdd',
    'lllmmmmmmddddddd',
    'dddddddddddddd'
  ]);

  return [
    { id: 'wattle_buckler', draw: () => dress(WATTLE, { body: 'ash', trim: 'wood', strap: 'cord' }) },
    { id: 'rawhide_round_shield', draw: () => dress(RAWHIDE, { body: 'dun', trim: 'wood', strap: 'leather' }) },
    { id: 'plank_round_shield', draw: () => dress(PLANK_ROUND, { body: 'ash' }, HAND_HOLE, BATTENS) },
    { id: 'iron_buckler', draw: () => dress(BUCKLER, { body: 'iron', trim: 'iron' }, BUCKLER_RIVETS) },
    { id: 'iron_boss_shield', draw: () => dress(BOSSED_KITE, { body: 'leather', trim: 'iron' }) },
    { id: 'steel_heater_shield', draw: () => dress(HEATER, { body: 'steel', trim: 'iron' }) },
    { id: 'rune_graven_kite', draw: () => dress(GRAVEN_KITE, { body: 'runed', trim: 'gold', strap: 'glow' }) },
    { id: 'orc_iron_slab', draw: () => dress(SLAB, { body: 'black', trim: 'iron' }) }
  ];
})();
PIXEL_ICONS.push(...PIXEL_SHIELDS);
