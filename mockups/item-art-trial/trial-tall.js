'use strict';
(() => {
  const { px, ball, poly, path, stamp } = TK, { M, rows } = TRIAL;
  const W = 32, H = 64;
  const shaft = (s, y0, y1, ramp) => rows(s, y0, y1, 15, 17, (x, y) => TK.at(ramp, x === 15 ? 5 : x === 16 ? (y % 9 === 4 ? 3 : 4) : 2));
  const wrap = (s, y0, y1) => rows(s, y0, y1, 15, 17, (x, y) => TK.at(M.leather, (y & 1 ? 4 : 3) - (x - 15) - (x === 17 ? 1 : 0)));
  function bevel(s, y0, y1, fromLeft, ramp) {
    for (let y = y0; y <= y1; y++) {
      const xs = []; for (let x = 0; x < W; x++) if (TK.peek(s, x, y)) xs.push(x);
      if (xs.length < 3) continue;
      const edge = fromLeft ? xs[0] : xs[xs.length - 1], step = fromLeft ? 1 : -1;
      px(s, edge, y, ramp, ramp.length - 1); px(s, edge + step, y, ramp, ramp.length - 2);
    }
  }

  function sword(s) {
    const S = M.steel, TONE = [6, 5, 2, 4, 2];
    for (let y = 3; y <= 40; y++) { const half = y < 5 ? 0 : y < 8 ? 1 : 2; for (let d = -half; d <= half; d++) px(s, 16 + d, y, S, d === 0 ? (y > 10 && y < 36 ? 2 : 5) : TONE[d + 2]); }
    px(s, 15, 12, S, 6); px(s, 15, 13, S, 6); px(s, 15, 24, S, 6);
    rows(s, 40, 40, 14, 18, x => TK.at(S, x < 16 ? 4 : 3));
    rows(s, 41, 43, 8, 24, (x, y) => y === 43 && (x < 10 || x > 22) ? null : TK.at(M.bronze, y === 41 ? 5 : y === 42 ? (x < 16 ? 4 : 3) : 1));
    px(s, 7, 42, M.bronze, 5); px(s, 25, 42, M.bronze, 2);
    wrap(s, 44, 54);
    for (const y of [46, 50, 54]) px(s, 16, y, M.cord, 3);
    ball(s, 16.5, 57.5, 2.9, 2.9, M.bronze, { bias: .06 });
  }

  function axe(s) {
    shaft(s, 4, 60, M.wood);
    rows(s, 4, 4, 15, 17, () => M.wood[5]);
    wrap(s, 46, 56);
    rows(s, 60, 61, 14, 18, (x, y) => TK.at(M.wood, y === 60 ? 3 : 1));
    poly(s, [[14, 9], [9, 7], [5, 3.4], [3, 5], [2.4, 14], [3, 22], [5.6, 27.6], [8, 23], [11, 18], [14, 17]], (x, y) => TK.at(M.steel, x > 11 ? 2 : y < 11 ? 4 : y > 21 ? 2 : 3));
    bevel(s, 3, 27, true, M.steel);
    rows(s, 8, 17, 13, 19, (x, y) => TK.at(M.steel, y === 8 ? 5 : y === 17 ? 1 : x === 19 ? 1 : x === 13 ? 4 : 3));
    px(s, 16, 12, M.steel, 6); px(s, 16, 13, M.steel, 1);
    rows(s, 18, 23, 16, 16, () => M.steel[4]);
  }

  function hoe(s) {
    shaft(s, 5, 60, M.pale);
    rows(s, 5, 5, 15, 17, () => M.pale[5]);
    rows(s, 60, 61, 14, 18, (x, y) => TK.at(M.pale, y === 60 ? 3 : 1));
    rows(s, 7, 12, 14, 18, (x, y) => TK.at(M.steel, y === 7 ? 5 : y === 12 ? 1 : x === 18 ? 2 : x === 14 ? 5 : 3));
    rows(s, 8, 10, 19, 23, (x, y) => TK.at(M.steel, y === 8 ? 5 : y === 9 ? 3 : 1));
    rows(s, 9, 27, 20, 29, (x, y) => { const left = y > 15 ? 20 : 21, right = y > 19 ? 29 : 28; return x < left || x > right ? null : TK.at(M.steel, y < 11 ? 2 : y > 25 ? 6 : x === left ? 5 : x === right ? 1 : y > 23 ? 5 : x < 24 ? 4 : 3); });
    px(s, 24, 14, M.steel, 6); px(s, 24, 15, M.steel, 6);
  }

  const STAVE = [[19, 3], [17.5, 5], [13.5, 14], [11, 31], [13.5, 48], [17.5, 57], [19, 59]];
  function bow(s) {
    path(s, STAVE, t => 1.2 + .7 * Math.sin(Math.PI * t), (t, u, x) => TK.at(M.wood, t < .05 || t > .95 ? 5 : u < -.15 ? 5 : u > .35 ? 2 : 4));
    rows(s, 26, 36, 9, 13, (x, y) => TK.peek(s, x, y) || x === 12 ? TK.at(M.leather, (y & 1 ? 4 : 3) - (x > 11 ? 2 : 0)) : null);
    for (const y of [3, 59]) { px(s, 19, y, M.bone, 4); px(s, 18, y, M.bone, 3); }
  }
  const bowString = s => rows(s, 5, 57, 19, 19, (x, y) => TK.at(M.string, y % 6 === 2 ? 2 : 1));

  const LEAF = [0, 0, 1, 1, 2, 2, 2, 3, 3, 3, 2, 2, 1, 1];
  function spear(s) {
    shaft(s, 16, 60, M.wood);
    LEAF.forEach((half, i) => { for (let d = -half; d <= half; d++) px(s, 16 + d, 2 + i, M.steel, d === 0 ? 6 : d === -half ? 6 : d < 0 ? 5 : d === half ? 2 : 3); });
    rows(s, 16, 19, 14, 18, (x, y) => TK.at(M.steel, y === 16 ? 5 : y === 19 ? 1 : x === 18 ? 2 : x === 14 ? 5 : 3));
    rows(s, 20, 23, 15, 17, (x, y) => TK.at(M.cord, (y & 1 ? 3 : 2) - (x === 17 ? 1 : 0)));
    rows(s, 59, 61, 15, 17, (x, y) => y === 61 && x !== 16 ? null : TK.at(M.steel, x === 15 ? 5 : 2));
  }

  const TALL = { steel_longsword: [sword], bearded_axe: [axe], hunting_recurve: [bow, bowString], steel_hoe: [hoe] };
  for (const it of TRIAL.ITEMS) if (TALL[it.id]) [it.tall, it.tallOver] = TALL[it.id];
  TRIAL.ITEMS.push({ id: 'steel_boar_spear', label: 'Spear', tall: spear, tallOnly: true });
  TRIAL.tall = it => TRIAL.sharp(it.tall, it.tallOver, W, H);
  TRIAL.tallHalf = it => TK.outline(TK.shrink(TK.crisp(it.tall, W, H), 29), TRIAL.CRISP_EDGE);
})();
