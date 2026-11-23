'use strict';
(() => {
  const F = HUD.fxart, tint = F.ramps.of, { GORE, HONEY, HURT } = F.ramps;
  const keys = (r, chars) => Object.fromEntries([...chars].map((ch, i) => [ch, r[i]]));
  const lit = (c, e) => ({ c, e });
  const art = (rows, pal, e) => {
    const h = rows.length, w = Math.max(...rows.map(r => r.length)), s = new Spr(w + 2, h + 2, (w >> 1) + 1, h + 1);
    rows.forEach((r, y) => [...r].forEach((ch, x) => { const p = pal[ch]; if (p) s.set(x + 1, y + 1, p.c || p, p.e === undefined ? e : p.e); }));
    return s.outline();
  };
  const stamp = (dst, src, ox, oy) => { for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const i = y * src.w + x; if (src.c[i]) dst.set(x + ox, y + oy, src.c[i], src.e[i]); } return dst; };
  const boon = s => {
    const o = new Spr(s.w + 3, s.h + 2, s.ax, s.ay + 2), x = s.w, G = lit(HONEY[5], 255), g = lit(HONEY[3], 255);
    stamp(o, s, 0, 2);
    for (const [dx, dy, c] of [[1, 0, G], [0, 1, G], [1, 1, G], [2, 1, g], [1, 2, g]]) o.set(x - 1 + dx, dy + 1, c.c, c.e);
    return o.outline();
  };
  const flake = () => {
    const s = new Spr(15, 15, 7, 14), M = P.mana, c = 7, px = (x, y, k) => s.set(c + x, c + y, M[k], 230);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let d = 1; d <= 6; d++) px(dx * d, dy * d, d === 6 ? 5 : dx + dy > 0 ? 3 : 4);
      for (const sd of [-1, 1]) { px(dx * 5 + dy * sd, dy * 5 + dx * sd, dx + dy > 0 ? 3 : 5); px(dx * 3 + dy * sd, dy * 3 + dx * sd, 4); }
    }
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) for (let d = 1; d <= 2; d++) px(dx * d, dy * d, dy > 0 ? 3 : 4);
    px(0, 0, 5);
    return s.outline(P.frost[0]);
  };

  const EMBER = tint('#e0452c'), VIOLET = tint('#a98ae0'), SLAM = tint('#ff6a3a'), SALLOW = tint('#b4c060'), DUSK = tint('#a8a8cc');
  const ICONS = {
    collapsed: () => art([
      '..y.....y....',
      '.yzy...yzy...',
      '..y.....y....',
      '.............',
      '.........hhh.',
      '..34444.hssss',
      '1344444khsksr',
      '11344444kssrr',
      '2222222222222'
    ], { ...keys(EMBER, '012345'), y: lit(HONEY[4], 255), z: lit(HONEY[5], 255), k: P.ink, h: P.furBrown[2], s: P.skinPale[3], r: P.skinPale[2] }, 190),
    winded: () => art([
      '......5......',
      '......5......',
      '..44.454.44..',
      '.45544.44554.',
      '.45554.45554.',
      '455554.455543',
      '455543.345543',
      '455543.345543',
      '345433.334433',
      '.3433...3343.',
      '..33.....33..'
    ], keys(VIOLET, '012345'), 190),
    knocked: () => art([
      '....45554....',
      '....45543....',
      '....45543....',
      '....45543....',
      '.444455434443',
      '..455555433..',
      '...4555433...',
      '....45543....',
      '5....443....5',
      '.5....3....5.',
      '3333333333333',
      '.22222222222.'
    ], keys(SLAM, '012345'), 200),
    bleeding: () => art([
      '....3....',
      '....3....',
      '...343...',
      '...353...',
      '..34532..',
      '..35432..',
      '.3454322.',
      '.3543322.',
      '345433221',
      '344333221',
      '.3333221.',
      '..32221..'
    ], keys(GORE, '012345'), 190),
    fractured: () => art([
      '.........55..',
      '........5555.',
      '........55455',
      '.......455554',
      '......4554.4.',
      '....a..54....',
      '......b......',
      '....45..a....',
      '.4.4554......',
      '455554.......',
      '55455........',
      '.5554........',
      '..44.........'
    ], { ...keys(P.bone, '012345'), a: lit(hex('#ff9944'), 255), b: lit(hex('#ffd870'), 255) }, 170),
    poisoned: () => art([
      '......5....',
      '...4.......',
      '.....4.5...',
      '...ssrr....',
      '....sr.....',
      '...s45r....',
      '..s4554r...',
      '.s345543q..',
      '.s334443q..',
      '.r233332p..',
      '..r2222p...',
      '...qppp....'
    ], { ...keys(P.ooze, '012345'), ...keys(P.ice, 'pqrs') }, 190),
    sick: () => art([
      '...44444..b',
      '..4555544.b',
      '.455555544.',
      '.455555543.',
      '45kk55kk443',
      '45c55555c43',
      '4555kk55433',
      '.45k55kk43.',
      '.344555433.',
      '..3344433..',
      '...33333...'
    ], { ...keys(SALLOW, '012345'), k: P.ooze[0], c: P.ooze[3], b: lit(P.mana[4], 220) }, 180),
    burning: () => art([
      '.....1.....',
      '.....11....',
      '....121....',
      '....1221.1.',
      '...12321.1.',
      '..123321121',
      '..123332121',
      '.1233432221',
      '.1234433221',
      '12344443321',
      '12344444321',
      '.123444321.',
      '..1223221..'
    ], keys(P.fire, '01234'), 255),
    frozen: flake,
    starving: () => art([
      '..444444444..',
      '.45555555554.',
      '4500000000054',
      '4510000000154',
      '.45111111154.',
      '.34455555443.',
      '..344444433..',
      '...3333332...',
      '....22222....',
      '....33322....'
    ], keys(P.wicker.concat([hex('#d8bc80')]), '012345'), 150),
    exhausted: () => art([
      '....4555...',
      '..45554....',
      '.45554.zzzz',
      '.4554.....z',
      '45554...zz.',
      '45554..z...',
      '45554..zzzz',
      '455543.....',
      '.455543...3',
      '.4555544434',
      '..34555543.',
      '....3444...'
    ], { ...keys(DUSK, '012345'), z: lit(hex('#b4d4ea'), 220) }, 180),
    moodbreak: () => art([
      '....4555.....',
      '..455555544..',
      '.45555445554.',
      '4555444444443',
      '4444433334433',
      '.3333333y3332',
      '..2222yy2222.',
      '.....yy......',
      '....yyyy.....',
      '......yy.....',
      '.....yy......',
      '....y........'
    ], { ...keys(P.purple.concat([hex('#c4a0e0')]), '012345'), y: lit(GEM.star[4], 255) }, 170),
    wellfed: () => boon(art([
      '...3444......',
      '..345554.....',
      '.34555543....',
      '.345555432...',
      '.345555432...',
      '.334554322...',
      '..33443221...',
      '...3332215...',
      '....22215b...',
      '.......5b5b..',
      '........b55b.',
      '.......5b.b5.'
    ], { ...keys(P.copper, '012345'), b: P.bone[4] }, 170)),
    rested: () => boon(art([
      '......5......',
      '..5...5...5..',
      '...5.....5...',
      '....44444....',
      '5..4555554..5',
      '.5.4555554.5.',
      '..455555554..',
      '3333333333333',
      '.22222222222.'
    ], keys(HONEY, '012345'), 230)),
    healed: () => boon(art([
      '.344...443.',
      '34554.45543',
      '35555w54443',
      '35555w44443',
      '355wwwww433',
      '.3555w4443.',
      '.3554w4433.',
      '..3544433..',
      '...34433...',
      '....333....',
      '.....3.....'
    ], { ...keys(HURT, '012345'), w: lit(hex('#fff6e0'), 255) }, 190))
  };

  const LIST = [
    ['collapsed', 'Collapsed', 'Faint', '#e0452c'], ['winded', 'Winded', 'Winded', '#a98ae0'], ['knocked', 'Knocked Down', 'Down', '#ff6a3a'],
    ['bleeding', 'Bleeding', 'Bleed', '#e85040'], ['fractured', 'Fractured', 'Crack', '#ff9944'], ['poisoned', 'Poisoned', 'Poison', '#8cc850'],
    ['sick', 'Sick', 'Sick', '#c8c860'], ['burning', 'Burning', 'Burn', '#f6a23c'], ['frozen', 'Frozen', 'Frozen', '#6ec0f0'],
    ['starving', 'Starving', 'Starve', '#c8a070'], ['exhausted', 'Exhausted', 'Spent', '#a8a8c0'], ['moodbreak', 'Mood Break', 'Snap', '#b070d0'],
    ['wellfed', 'Well Fed', 'Fed', '#e0b040'], ['rested', 'Rested', 'Rested', '#f0d060'], ['healed', 'Healed', 'Healed', '#70c070']
  ].map(([id, name, short, col]) => ({ id, name, short, col }));
  const memo = {};
  const pair = s => [s, F.melt(s, .5)];
  const icon = id => memo[id] || (memo[id] = pair(ICONS[id]()));
  const worded = id => memo[id + 'w'] || (memo[id + 'w'] = (() => {
    const c = LIST.find(q => q.id === id), a = icon(id)[0], b = F.word(c.short, tint(c.col), { small: 1 })[0], h = Math.max(a.h, b.h), s = new Spr(a.w + 2 + b.w, h, a.w >> 1, h - 1);
    stamp(s, a, 0, h - a.h); stamp(s, b, a.w + 2, h - b.h - Math.max(0, (a.h - b.h) >> 1));
    return pair(s);
  })());
  HUD.fxicons = { list: LIST, icon, worded, text: c => F.word(c.name, tint(c.col), { small: 1, icon: 'pip' }) };

  F.mouth = kind => { const o = PAWNS[kind].o, f = FOLK[o.race || 'human'], hTop = 52 - f.legs - f.tl - f.hh; return [-1, hTop + Math.floor(f.hh * .5) + 3 - 51]; };
})();
