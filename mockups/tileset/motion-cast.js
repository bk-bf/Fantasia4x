'use strict';
function buildCast(w, season) {
  const tp = (x, y) => [x * 32 + 16, y * 32 + 23], cast = [], follows = [];
  const conv = st => st[0] === 'go' ? ['go', st[1].map(p => tp(p[0], p[1])), st[2], st[3], st[4]] : st[0] === 'at' ? ['at', tp(st[1][0], st[1][1])] : st[0] === 'act' && st[3] && st[3].to ? ['act', st[1], st[2], { ...st[3], to: tp(st[3].to[0], st[3].to[1]) }] : st;
  const add = (name, rig, kind, start, steps, opt, over) => { const S = script(mkActor(rig, kind, over), tp(start[0], start[1]), steps.map(conv), opt); S.name = name; cast.push(S); if (name) follows.push([String(cast.length - 1), name]); return S; };
  const rep = (n, round) => { const out = []; for (let i = 0; i < n; i++) out.push(...round); return out; };
  const L = { flip: 1 }, F = { face: 'f' };

  const cutter = add('Woodcutter', 'pawn', 'woodcutter', [27.7, 14.5], [
    ['go', [[26, 15.2], [26, 24.7], [24, 27.7], [22.6, 28.05]], 32], ['act', 'idle', .6, { flip: 0 }], ['act', 'chop', 6.25, { tag: 'fell' }], ['act', 'idle', 1.8],
    ['go', [[23.9, 28.3]], 30], ['act', 'lift', 1.1, { tag: 'take' }], ['go', [[24, 27.7], [26, 24.7], [26, 15.2], [27.7, 14.5]], 22, 'haul'], ['act', 'gather', 1.4], ['act', 'idle', 1.5]]);
  const tree = mkTreeProp('oak', 2, season, ...tp(23.45, 28)), plan = fellPlan(cutter);

  let spot = [44, 12], best = 1e9;
  for (let y = 9; y <= 15; y++) for (let x = 40; x <= 47; x++) { const i = y * w.W + x; if (w.wall[i] || GROUND[w.g[i]].water || w.wall[i + 1] !== WL.mountain || w.wall[i - 1] || w.wall[i + w.W]) continue; const d = Math.hypot(x - 44, y - 12); if (d < best) { best = d; spot = [x, y]; } }
  add('Miner', 'pawn', 'miner', [spot[0] + .18, spot[1] + .1], [['act', 'mine', 5.2, { flip: 0 }], ['act', 'idle', 1.6], ['act', 'mine', 3.9], ['act', 'drink', 2.6]]);

  const rows = [];
  for (let i = 0; i < 3; i++) rows.push(['act', 'hoe', 4.2, { flip: 0 }], ['go', [[30.6 + i * .95, 19.75]], 26]);
  add('Farmer', 'pawn', 'farmer', [29.65, 19.75], [...rows, ['act', 'gather', 2.8], ['act', 'tired', 3.2, F], ['go', [[29.65, 19.75]], 28], ['act', 'idle', 1.2, { flip: 0 }]]);
  add('Smith', 'pawn', 'smith', [29.72, 11.06], [['act', 'hammer', 5.7, L], ['act', 'idle', 1.4], ['act', 'hammer', 3.8], ['act', 'drink', 2.6]]);
  add('Cook', 'pawn', 'cook', [27.28, 16.05], [['act', 'stir', 6.4, { flip: 0 }], ['act', 'idle', 1.4], ['act', 'stir', 4.8], ['act', 'tired', 3.2, F]], null, { tool: null });
  add('Thirsty weaver', 'pawn', 'weaver', [22, 24.2], [['hide', 6], ['go', [[22, 24.5], [26, 24.6], [26, 18.4], [24.25, 17.75]], 30], ['act', 'draw', 3, L], ['act', 'drink', 2.6], ['act', 'idle', 1],
    ['go', [[26, 17.9], [26.88, 17.14]], 30], ['act', 'eat', 7.2, { flip: 0 }], ['act', 'warm', 5], ['go', [[26, 18.4], [26, 24.6], [22, 24.5], [22, 24.2]], 30], ['hide', 2]]);
  add('', 'pawn', 'trader', [29.19, 17.14], [['act', 'eat', 7.2, L], ['act', 'sit', 4], ['act', 'warm', 4.4]], null, { cape: null });
  add('', 'pawn', 'hauler', [30.45, 16.55], [['act', 'sleep', 30]], null, { tool: null });
  add('', 'pawn', 'mage', [24.3, 15.55], [['act', 'talk', 5.2, { flip: 0 }], ['act', 'listen', 5.2]], null, { tool: null });
  add('', 'pawn', 'weaver', [25.25, 15.55], [['act', 'listen', 5.2, L], ['act', 'talk', 5.2]], null, { tunic: P.blue, hair: P.furDark, trim: null, skin: P.skinTan });

  const R = 64;
  add('Gate guard', 'pawn', 'guard', [18.2, 10], [
    ['go', [[18.2, 15.2]], 26], ['act', 'look', 8.6, F], ['act', 'guard', .8, { flip: 1, tag: 'alert' }], ['go', [[18.2, 16.4], [16.6, 16.3]], 80, 'run'], ['act', 'guard', .7, L],
    ...rep(3, [['act', 'thrust', .8], ['act', 'guard', .2], ['act', 'block', .85], ['act', 'guard', .15]]), ['act', 'thrust', .8], ['act', 'guard', 2.6], ['act', 'look', 3, F],
    ['go', [[18.2, 16.4], [18.2, 10]], 26], ['act', 'look', 6, F]], { pad: R });
  add('', 'pawn', 'goblin', [6.5, 16.4], [['hide', 14], ['go', [[15.55, 16.3]], 80, 'run'], ...rep(3, [['act', 'guard', .36], ['act', 'hit', .42], ['act', 'guard', .22], ['act', 'attack', .85], ['act', 'guard', .15]]),
    ['act', 'guard', .36], ['act', 'hit', .42], ['act', 'stagger', .9], ['act', 'fall', 1], ['act', 'down', 30]], { pad: R });
  add('', 'pawn', 'guard', [18.4, 17], [['act', 'look', 15.4, F], ['act', 'guard', .6, L], ['go', [[16.7, 17.15]], 80, 'run'], ['act', 'guard', .9, L],
    ...rep(2, [['act', 'attack', .85], ['act', 'guard', .15], ['act', 'block', .85], ['act', 'guard', .15]]), ['act', 'guard', .41], ['act', 'hit', .42], ['act', 'stagger', .9], ['act', 'guard', .9],
    ['act', 'attack', .85], ['act', 'guard', 2.5], ['act', 'look', 3, F], ['go', [[18.4, 17]], 26], ['act', 'look', 20, F]], { pad: R }, { tool: 'sword', shield: P.blue, crest: P.blue, hair: P.hay });
  add('', 'pawn', 'orc', [6.3, 17.2], [['hide', 13.9], ['go', [[15.6, 17.15]], 80, 'run'], ...rep(2, [['act', 'guard', .41], ['act', 'hit', .42], ['act', 'guard', .17], ['act', 'attack', .85], ['act', 'guard', .15]]),
    ['act', 'attack', .85], ['act', 'guard', 2.19], ['act', 'hit', .42], ['act', 'guard', .94], ['act', 'guard', .5, { tag: 'alert' }], ['go', [[6.3, 16.7]], 70, 'panic'], ['hide', 10]], { pad: R });

  add('Night watch', 'pawn', 'watch', [26.4, 15.3], [['go', [[26.4, 24.6], [20.6, 24.6]], 26], ['act', 'look', 4.4, F], ['go', [[26.4, 24.6], [26.4, 16.4], [33.4, 16.4]], 26], ['act', 'look', 4.4, F], ['go', [[26.4, 16.4], [26.4, 15.3]], 26], ['act', 'idle', 2, F]]);

  const H = 60;
  add('Hunter', 'pawn', 'hunter', [19.6, 29.2], [['hide', 3], ['go', [[23.6, 30.6]], 11, 'stalk'], ['act', 'shoot', 2.2, { to: [27.6, 30.6], tag: 'kill' }], ['act', 'idle', 1.5],
    ['go', [[26.9, 30.75]], 30], ['act', 'gather', 3, { tag: 'take' }], ['go', [[19.6, 29.2]], 24, 'lug'], ['hide', 5]], { pad: H });
  add('Red Deer', 'quad', 'deer', [27.6, 30.6], [['act', 'graze', 17.36, { flip: 0 }], ['act', 'hit', .45], ['act', 'fall', .9], ['act', 'down', 5.2], ['hide', 14], ['at', [35.2, 31.4]], ['act', 'graze', 6, L], ['go', [[27.6, 30.6]], 22], ['act', 'graze', 5, { flip: 0 }]], { pad: H });
  for (const [k, x, y, ex, ey] of [['deer', 28.9, 29.7, 34.6, 29.9], ['fawn', 29.4, 31.1, 34.8, 31.3]])
    add('', 'quad', k, [x, y], [['act', 'graze', 17.2, { flip: k === 'fawn' ? 1 : 0 }], ['act', 'alert', .45], ['go', [[ex, ey]], 180, 'run'], ['act', 'watch', 5, L], ['act', 'idle', 8], ['go', [[x, y]], 22], ['act', 'graze', 12]], { pad: H });
  add('', 'rabbit', 'rabbit', [21.6, 29.6], [['act', 'idle', 3, { flip: 0 }], ['act', 'up', 2.6], ['go', [[20.5, 33.2]], 110, 'bolt'], ['hide', 30], ['go', [[21.6, 29.6]], 40, 'hop'], ['act', 'idle', 4], ['act', 'up', 2.6], ['go', [[22.7, 30.5]], 40, 'hop'], ['act', 'idle', 3], ['go', [[21.6, 29.6]], 40, 'hop']], { pad: H });

  const ring = k => { const pts = []; for (let i = 0; i <= 12; i++) { const a = (i + k) / 12 * TAU; pts.push([12.5 + Math.cos(a) * 2.5, 11.5 + Math.sin(a) * 3]); } return pts; };
  add('Wolf pack', 'quad', 'wolf', ring(0)[0], [['go', ring(0).slice(1), 50, 'trot']]);
  add('', 'quad', 'wolf', ring(5)[0], [['go', ring(5).slice(1, 8), 50, 'trot'], ['act', 'sniff', 4.4], ['go', ring(5).slice(8), 24, 'walk']]);
  add('', 'quad', 'wolf', ring(9)[0], [['go', ring(9).slice(1, 7), 50, 'trot'], ['act', 'sit', 3], ['act', 'howl', 3.2], ['act', 'sit', 1.6], ['go', ring(9).slice(7), 50, 'trot']]);

  add('', 'fowl', 'fowl', [24.3, 14.95], [['act', 'peck', 3], ['go', [[25.2, 15.15]], 13], ['act', 'peck', 4.5], ['act', 'idle', 2], ['go', [[23.6, 15.3]], 13], ['act', 'peck', 3], ['go', [[24.3, 14.95]], 13], ['act', 'idle', 2]]);
  add('', 'fowl', 'fowl', [25.3, 18.4], [['act', 'idle', 2, L], ['act', 'peck', 4.5], ['go', [[24.6, 18.9]], 13], ['act', 'peck', 3], ['go', [[25.3, 18.4]], 13]]);
  add('', 'quad', 'packox', [32.5, 17.1], [['act', 'cud', 8.4, L], ['act', 'idle', 3]]);
  add('', 'quad', 'boar', [14.6, 21.2], [['act', 'sniff', 4.4, L], ['go', [[13.4, 21.8]], 20], ['act', 'graze', 5.2], ['go', [[14.6, 21.2]], 20], ['act', 'idle', 3]]);
  add('', 'quad', 'boar', [13, 22.4], [['act', 'graze', 5.2], ['act', 'idle', 3], ['go', [[12.2, 21.6]], 20], ['act', 'sniff', 4.4], ['go', [[13, 22.4]], 20]]);

  return { cast, follows, tree, plan, cutter, smoke: [912, 516], clear: [tp(23.45, 28), tp(22.6, 28.05), tp(24, 28.3), tp(16, 16.6), tp(27.6, 30.6), tp(23.6, 30.6), tp(25.5, 30.6), tp(24.6, 30.4), tp(26.5, 30.8)] };
}
