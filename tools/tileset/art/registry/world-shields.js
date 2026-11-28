'use strict';
(() => {
  const { inked, marked, squashed } = WORLD_GEAR;
  const FLAT = .55, FLAT_LONG = .68, TONES = { body: 'lmd', trim: 'LMD', strap: 'zyx' };
  const side = (nx, ny) => nx + ny < -.4 ? 0 : nx + ny > .5 ? 2 : 1;
  const tone = (region, nx, ny) => TONES[region][side(nx, ny)];

  function oval(w, h, paint) {
    return Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => {
      const nx = (x + .5 - w / 2) / (w / 2), ny = (y + .5 - h / 2) / (h / 2);
      return nx * nx + ny * ny > 1 ? ' ' : paint(nx, ny, Math.hypot(nx, ny), x, y);
    }).join(''));
  }
  const spanOf = (widths, y, wide) => y < 0 || y >= widths.length ? [1, 0] : [(wide - widths[y]) / 2, (wide + widths[y]) / 2 - 1];
  function shaped(widths, paint) {
    const wide = Math.max(...widths), within = (x, y) => { const [from, to] = spanOf(widths, y, wide); return x >= from && x <= to; };
    const edge = (x, y) => !within(x - 1, y) || !within(x + 1, y) || !within(x, y - 1) || !within(x, y + 1);
    return widths.map((_, y) => Array.from({ length: wide }, (_, x) => within(x, y) ? paint((x + .5 - wide / 2) / (wide / 2), (y + .5) / widths.length, edge(x, y), x, y) : ' ').join(''));
  }
  const thick = (rows, glyph) => [...rows, ' '.repeat(rows[0].length)].map((row, y, all) => [...row].map((cell, x) => cell === ' ' && y > 0 && all[y - 1][x] !== ' ' ? glyph : cell).join(''));

  const round = (size, paint, rim) => ({ lean: () => oval(size - 1, size, paint), ground: () => thick(oval(size + 1, Math.round(size * FLAT), paint), rim) });
  const drawn = (rows, rim) => ({ lean: () => rows, ground: () => thick(squashed(rows, FLAT_LONG), rim) });
  const cut = (widths, paint, rim) => drawn(shaped(widths, paint), rim);

  const wattle = (nx, ny, q, x, y) => q > .8 ? tone('trim', nx, ny) : q < .24 ? tone('strap', nx, ny) : (x + y) % 2 ? 'm' : side(nx, ny) > 1 ? 'd' : 'l';
  const rawhide = (nx, ny, q, x, y) => q > .84 ? tone('trim', nx, ny) : q > .6 && q < .74 && (x + y) % 2 ? 'x' : q < .26 ? tone('trim', nx * 4, ny * 4) : tone('body', nx, ny);
  const planks = (nx, ny, q, x) => Math.abs(nx) < .2 && Math.abs(ny) < .3 ? (Math.abs(ny) < .1 ? 'M' : 'O') : x % 4 === 3 ? 'd' : tone('body', nx, ny);
  const buckler = (nx, ny, q) => q > .8 ? tone('trim', nx, ny) : q < .4 ? tone('body', nx * 3, ny * 3) : q < .54 ? 'o' : tone('body', nx, ny);

  const KITE = [6, 10, 12, 12, 12, 12, 12, 12, 12, 10, 10, 10, 8, 8, 6, 6, 4, 4, 2];
  const HEATER = [14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 12, 12, 10, 8, 6, 4, 2];
  const boss = (nx, v, at, reach) => Math.hypot(nx, (v - at) * 3) < reach;
  const bossed = (nx, v, edge) => edge ? tone('trim', nx, v - .5) : boss(nx, v, .3, .36) ? tone('trim', nx * 3, (v - .3) * 9) : boss(nx, v, .3, .52) ? 'o' : tone('body', nx * 1.6, 0);
  const graven = (nx, v, edge, x, y) => edge ? tone('trim', nx, v - .5) : boss(nx, v, .26, .34) ? tone('trim', nx * 3, (v - .26) * 9) : Math.abs(nx) < .1 && v > .42 && v < .86 ? 'zy'[y % 2] : Math.abs(nx) > .3 && Math.abs(nx) < .5 && v > .45 && v < .7 && y % 2 ? 'y' : tone('body', nx * 1.6, 0);
  const heater = (nx, v, edge, x, y) => edge ? (y % 5 === 1 ? 'L' : tone('trim', nx, v - .5)) : nx < -.05 ? 'l' : 'm';

  const SLAB = [
    ' llllmmmddd ',
    'lLlllmmmddLd',
    'llllmmoodddd',
    'lLllmmmmddLd',
    'oooooooooooo',
    'lLllmmomddLd',
    'llllmmomdddd',
    'llllmmomdddd',
    'lLllmmomddLd',
    'oooooooooooo',
    'lLllmmmmddLd',
    'lllmmmmmdddd',
    'lLlmmmmdddLd',
    'llmmmmmddddd',
    ' ddddddddddd'
  ];

  const FACES = {
    wattle_buckler: [round(12, wattle, 'D'), { body: 'ash', trim: 'wood', strap: 'cord' }],
    rawhide_round_shield: [round(16, rawhide, 'D'), { body: 'dun', trim: 'wood', strap: 'leather' }],
    plank_round_shield: [round(16, planks, 'd'), { body: 'ash', trim: 'wood' }],
    iron_buckler: [round(11, buckler, 'D'), { body: 'iron', trim: 'iron' }],
    iron_boss_shield: [cut(KITE, bossed, 'D'), { body: 'leather', trim: 'iron' }],
    steel_heater_shield: [cut(HEATER, heater, 'D'), { body: 'steel', trim: 'iron' }],
    rune_graven_kite: [cut(KITE, graven, 'D'), { body: 'runed', trim: 'gold', strap: 'glow' }],
    orc_iron_slab: [drawn(SLAB, 'd'), { body: 'black', trim: 'iron' }]
  };
  const emblazoned = (id, rows, wear) => marked(inked(rows, wear), WORLD_CARD.extras(id, wear));
  const shield = (id, [face, wear]) => ({ kind: 'shield', ground: () => emblazoned(id, face.ground(), wear), lean: () => emblazoned(id, face.lean(), wear) });
  WORLD_GEAR.add(Object.fromEntries(Object.entries(FACES).map(([id, face]) => [id, shield(id, face)])));
})();
