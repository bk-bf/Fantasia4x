'use strict';
(() => {
  const { px, ball, seg, stamp } = TK, { M, rows } = TRIAL;
  const N = {
    clay: TK.ramp('#4a2c20 #683e2a #875438 #a56e4a #be8a62'),
    pot: TK.ramp('#15151a #23242b #34363e #494c55 #60646c #7c8088'),
    wheat: TK.ramp('#6a5420 #8c722a #ae9236 #cdb24c #e6d070'),
    sack: TK.ramp('#4e4028 #6c5a38 #8a754a #a8915e #c4ad78'),
    copper: TK.ramp('#4a2416 #70361c #985024 #c0702e #e09848 #f2c478'),
    warm: TK.ramp('#32302c #4a463e #655f52 #827a68 #a09682 #bcb29c'),
    leaf: TK.ramp('#1e3a1c #2c5426 #3e7030 #568c3c')
  };
  const oval = (x, y, cx, cy, rx, ry) => ((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2;
  const disc = (s, cx, cy, rx, ry, fn) => rows(s, Math.floor(cy - ry), Math.ceil(cy + ry), Math.floor(cx - rx), Math.ceil(cx + rx), (x, y) => { const q = oval(x, y, cx, cy, rx, ry); return q <= 1 ? fn(x, y, q) : null; });

  function haunch(s, cx, cy, k, flip) {
    const d = flip ? -1 : 1;
    ball(s, cx, cy, 5.6 * k, 4.4 * k, M.meat, { amp: .95 });
    ball(s, cx + d * 5.2 * k, cy + 2.8 * k, 3.2 * k, 2.6 * k, M.meat, { bias: -.04 });
    seg(s, [cx + d * 7 * k, cy + 4 * k], [cx + d * 9.4 * k, cy + 6 * k], .9, (t, u) => TK.at(M.bone, u * d < 0 ? 4 : 2));
    ball(s, cx + d * 10 * k, cy + 6.2 * k, 1.5, 1.5, M.bone, { bias: .1 });
    disc(s, cx, cy, 5.6 * k, 4.4 * k, (x, y, q) => q > .62 && (x - cx) * LV[0] + (y - cy) * LV[1] > 2.2 * k ? TK.at(M.fat, q > .84 ? 2 : 3) : null);
    px(s, cx - 1, cy - 2 * k, M.meat, 5); px(s, cx, cy - 2 * k, M.meat, 5);
  }
  function ribs(s, x, y, w) {
    rows(s, y, y + 6, x, x + w - 1, (qx, qy) => (qy === y + 6) && (qx === x || qx === x + w - 1) ? null : TK.at(M.meat, qy === y ? 4 : qy > y + 4 ? 1 : qx < x + 3 ? 3 : 2));
    for (let qx = x + 1; qx < x + w; qx += 2) for (let qy = y - 1; qy <= y + 5; qy++) px(s, qx, qy, M.bone, qy < y + 1 ? 4 : qy > y + 3 ? 2 : 3);
  }
  function steak(s, cx, cy, rx, ry) {
    disc(s, cx, cy, rx, ry, (x, y, q) => q > .66 ? TK.at(M.fat, x < cx ? 3 : 2) : TK.at(M.meat, x + y < cx + cy ? 5 : 4));
    stamp(s, Math.round(cx) - 1, Math.round(cy) - 1, ['bb ', ' b '], { b: M.bone[3] });
  }
  function meatFew(s) { ribs(s, 15, 19, 11); haunch(s, 11, 25, 1); }
  function meatPile(s) {
    disc(s, 17, 27.5, 15.5, 4.4, (x, y, q) => q > .82 && hash(x, y, 4) > .7 ? null : TK.at(M.hide, q > .7 ? (y < 27 ? 4 : 1) : x + y < 42 ? 3 : 2));
    haunch(s, 15, 15, 1.25);
    seg(s, [22, 11], [26.5, 5.5], 1, (t, u) => TK.at(M.bone, u < 0 ? 4 : 2));
    ball(s, 27, 5, 1.8, 1.8, M.bone, { bias: .1 });
    ribs(s, 3, 19, 11);
    steak(s, 25, 23, 5.6, 3.4);
    haunch(s, 14, 25, .8, true);
    steak(s, 20, 28.4, 4.2, 2.2);
  }

  function bowl(s, cx, cy) {
    ball(s, cx, cy, 4.6, 4.4, M.wood, { clip: (x, y) => y >= cy, amp: .9, bias: .05 });
    disc(s, cx, cy, 4.6, 2, (x, y, q) => q > .62 ? TK.at(M.wood, y < cy ? 3 : 5) : TK.at(M.broth, x < cx ? 3 : 2));
    px(s, cx - 1, cy, M.carrot, 2); px(s, cx + 1, cy - 1, M.herb, 2);
  }
  function vessel(s, cx, top, rx, deep, ramp, mouth) {
    ball(s, cx, top + deep * .42, rx, deep * .62, ramp, { clip: (x, y) => y >= top, amp: 1.1, bias: -.02 });
    disc(s, cx, top, rx * mouth, rx * mouth * .34, (x, y, q) => q > .6 ? TK.at(ramp, y < top ? ramp.length - 3 : ramp.length - 1) : TK.at(M.broth, x < cx ? 3 : 2));
  }
  function stewFew(s) {
    vessel(s, 12, 20, 7.4, 10.4, N.clay, .78);
    rows(s, 18, 19, 7, 16, (x, y) => TK.at(N.clay, y === 18 ? 4 : x < 11 ? 3 : 1));
    for (const [x, k] of [[4, 4], [20, 1]]) { px(s, x, 23, N.clay, k); px(s, x, 24, N.clay, k - 1); }
    stamp(s, 9, 19, ['c  h ', ' m  c'], { c: M.carrot[2], h: M.herb[2], m: M.broth[0] });
    bowl(s, 25, 27);
  }
  function stewPile(s) {
    for (const x of [8, 16, 25]) rows(s, 28, 31, x, x + 1, (qx, y) => TK.at(N.pot, qx === x ? 3 : 1));
    vessel(s, 17, 13, 12, 16.6, N.pot, .9);
    rows(s, 15, 16, 5, 28, (x, y) => oval(x, y, 17, 20, 12, 10.4) <= 1 ? TK.at(N.pot, y === 15 ? 5 : x < 14 ? 4 : 2) : null);
    stamp(s, 10, 11, ['  c   hh  m   ', ' mm p    cc  h', '   c  m p   c '], { c: M.carrot[2], h: M.herb[2], m: M.broth[0], p: M.fat[2] });
    seg(s, [20, 12], [29, 3], 1, (t, u) => TK.at(M.pale, u < 0 ? 5 : 2));
    bowl(s, 5.5, 28); bowl(s, 28.5, 28.4);
  }

  function logAt(s, x, y, len, end) {
    rows(s, y, y + 4, x, x + len - 1, (qx, qy) => TK.at(M.bark, [3, 4, 2, 2, 1][qy - y] - (hash(qx >> 1, qy, 3) > .86 ? 1 : 0)));
    if (end !== 0) { disc(s, x + len, y + 2.5, 2.2, 3, qx => TK.at(M.pale, qx < x + len ? 5 : 4)); px(s, x + len, y + 2, M.pale, 2); px(s, x + len, y + 3, M.pale, 3); }
  }
  function butt(s, cx, cy) {
    disc(s, cx, cy, 2.9, 2.9, (x, y, q) => q > .62 ? TK.at(M.bark, x + y < cx + cy ? 3 : 1) : TK.at(M.pale, x + y < cx + cy ? 5 : 4));
    px(s, cx - .5, cy - .5, M.pale, 2);
  }
  function logsFew(s) { logAt(s, 4, 17, 15); logAt(s, 7, 21, 15); logAt(s, 5, 26, 16); }
  function logsPile(s) {
    logAt(s, 3, 26, 25);
    for (const x of [7, 13, 19, 25]) butt(s, x + .5, 23);
    logAt(s, 4, 15, 23);
    for (const x of [10, 16, 22]) butt(s, x + .5, 12);
    logAt(s, 7, 5, 17);
  }

  const rock = (s, cx, cy, rx, ry, ramp) => { ball(s, cx, cy, rx, ry, ramp, { amp: 1.15, d: .2 }); px(s, cx - rx * .4, cy - ry * .5, ramp, ramp.length - 1); };
  function stonesFew(s) { rock(s, 11, 26.5, 5.4, 4.2, M.stone); rock(s, 21, 28, 3.8, 3, N.warm); rock(s, 16, 30, 2, 1.5, M.stone); rock(s, 26, 30, 1.6, 1.3, N.warm); }
  function stonesPile(s) {
    rock(s, 8, 27.5, 6.4, 3.8, M.stone); rock(s, 26, 28, 5.4, 3.4, M.stone); rock(s, 17, 28, 7, 3.6, N.warm);
    rock(s, 12, 21.5, 6, 3.4, N.warm); rock(s, 22.5, 22, 5.4, 3.2, M.stone);
    rock(s, 17, 16, 5.2, 3, M.stone); rock(s, 17, 11, 3.6, 2.6, N.warm); rock(s, 17.5, 7.4, 2, 1.6, M.stone);
    rock(s, 3, 30.4, 1.6, 1.2, N.warm); rock(s, 30.5, 30.6, 1.4, 1, M.stone);
  }

  function sheaf(s, bx, by, lean, tall) {
    const top = [bx + lean, by - tall];
    seg(s, [bx, by], top, t => 2.4 - 1.1 * Math.sin(Math.PI * Math.min(1, t * 1.25)), (t, u, x, y) => TK.at(N.wheat, (x & 1 ? 3 : 2) - (u > .4 ? 1 : 0)));
    ball(s, top[0], top[1] - 1, 3.2, 2.8, N.wheat, { bias: .12, d: .5 });
    for (const [dx, dy] of [[-2, -3], [0, -4], [2, -3], [-3, -1], [3, -1]]) px(s, top[0] + dx, top[1] + dy - 1, N.wheat, 4);
    const tie = [bx + lean * .45, by - tall * .45];
    for (const dx of [-1, 0, 1]) px(s, tie[0] + dx, tie[1], M.cord, dx < 0 ? 3 : 1);
  }
  const grainOne = s => sheaf(s, 8, 15, 0, 9);
  function grainFew(s) { sheaf(s, 9, 31, 5, 13); sheaf(s, 25, 31, -5, 13); sheaf(s, 17, 31, 0, 14); }
  function sackAt(s, cx, cy, rx, ry, open) {
    ball(s, cx, cy, rx, ry, N.sack, { amp: 1, d: .4 });
    if (open) { disc(s, cx, cy - ry + 1.4, rx * .62, 1.7, (x, y, q) => q > .6 ? TK.at(N.sack, 4) : TK.at(N.wheat, x < cx ? 4 : 3)); return; }
    rows(s, Math.round(cy - ry) - 2, Math.round(cy - ry), Math.round(cx) - 1, Math.round(cx) + 1, (x, y) => TK.at(N.sack, x < cx ? 4 : 2));
    px(s, cx - 1, cy - ry + 1, M.cord, 3); px(s, cx, cy - ry + 1, M.cord, 1); px(s, cx + 1, cy - ry + 1, M.cord, 1);
  }
  function grainPile(s) {
    sackAt(s, 9, 25, 7.2, 6.2); sackAt(s, 24, 25.5, 7, 5.8, true);
    sackAt(s, 15, 15, 7, 5.6);
    sheaf(s, 30, 31, -3, 15);
    for (const [x, y] of [[15, 31], [17, 30], [18, 31], [20, 31]]) px(s, x, y, N.wheat, 4);
  }

  function bar(s, x, y, w, ramp) {
    rows(s, y, y + 2, x + 1, x + w - 2, (qx, qy) => TK.at(ramp, qy === y ? (qx < x + w / 2 ? 5 : 4) : 4));
    rows(s, y + 3, y + 5, x, x + w - 1, (qx, qy) => TK.at(ramp, qx === x + w - 1 ? 1 : qy === y + 5 ? 1 : qy === y + 3 ? 3 : 2));
    px(s, x + 2, y + 1, ramp, 5);
  }
  const barOne = s => bar(s, 3, 9, 10, N.copper);
  function barFew(s) { bar(s, 4, 25, 12, N.copper); bar(s, 17, 26, 12, N.copper); bar(s, 10, 20, 12, N.copper); }
  function barPile(s) {
    rows(s, 28, 31, 2, 31, (x, y) => (x - 2) % 10 === 9 && y > 28 ? null : TK.at(M.pale, y === 28 ? 5 : y === 29 ? 3 : 1));
    for (const x of [3, 12, 21]) bar(s, x, 22, 9, N.copper);
    for (const x of [7, 17]) bar(s, x, 16, 9, N.copper);
    bar(s, 12, 10, 9, N.copper);
  }

  function pelt(s, cx, cy, rx, ry, ramp) {
    disc(s, cx, cy, rx, ry, (x, y, q) => TK.at(ramp, q > .74 ? (y > cy ? 1 : 4) : Math.abs(x - cx) < 1.2 ? 4 : x < cx ? 3 : 2));
    for (const [dx, dy] of [[-.8, -.8], [.8, -.8], [-.8, .8], [.8, .8]]) { px(s, cx + dx * rx, cy + dy * ry, ramp, dy < 0 ? 3 : 2); px(s, cx + dx * rx + Math.sign(dx), cy + dy * ry + Math.sign(dy), ramp, dy < 0 ? 3 : 1); }
  }
  const hideOne = s => pelt(s, 8, 10, 5.4, 3.4, M.hide);
  function fold(s, x, y, w, ramp) {
    rows(s, y, y + 1, x + 1, x + w - 1, (qx, qy) => TK.at(ramp, qy === y ? 5 : 4));
    rows(s, y + 2, y + 3, x, x + w - 1, (qx, qy) => TK.at(ramp, qx === x ? 4 : qy === y + 3 ? 1 : qx > x + w - 3 ? 2 : 3));
  }
  function hideFew(s) { fold(s, 8, 27, 18, M.hide); fold(s, 9, 23, 16, M.leather); fold(s, 10, 19, 15, M.fur); }
  function hidePile(s) {
    const LAYERS = [M.fur, M.hide, M.leather, M.hide, M.fur, M.leather];
    LAYERS.forEach((r, i) => {
      const y = 12 + i * 3, inset = i === 0 || i === 5 ? 2 : i & 1;
      rows(s, y, y + 2, 4 + inset, 29 - inset, (x, qy) => (x === 4 + inset || x === 29 - inset) && qy !== y + 1 ? null : TK.at(r, qy === y ? 4 : x < 9 ? 3 : x > 25 ? 1 : qy === y + 2 ? 1 : 2));
    });
    rows(s, 9, 11, 7, 26, (x, y) => (x === 7 || x === 26) && y === 9 ? null : TK.at(M.hide, y === 9 ? 5 : y === 10 ? 4 : 3));
    rows(s, 9, 29, 16, 17, (x, y) => TK.at(M.cord, x === 16 ? 3 : 1));
    rows(s, 20, 20, 4, 29, x => TK.at(M.cord, x < 14 ? 3 : 2));
    stamp(s, 15, 19, ['3443', '4  1', '3111'], { 4: M.cord[3], 3: M.cord[2], 1: M.cord[0] });
    for (const [x, y] of [[6, 12], [27, 13], [5, 27], [28, 26]]) px(s, x, y, M.fur, 4);
  }

  TRIAL.ITEMS.push(
    { id: 'wheat', label: 'Grain', mini: grainOne, stacks: true, mapOnly: true },
    { id: 'copper_bar', label: 'Metal bars', mini: barOne, stacks: true, mapOnly: true },
    { id: 'deer_hide', label: 'Hides', mini: hideOne, stacks: true, mapOnly: true }
  );
  const STAGES = {
    venison: [meatFew, meatPile], small_stew: [stewFew, stewPile], oak_log: [logsFew, logsPile], small_stone: [stonesFew, stonesPile],
    wheat: [grainFew, grainPile], copper_bar: [barFew, barPile], deer_hide: [hideFew, hidePile]
  };
  TRIAL.STAGE_NAMES = ['one', 'a few', 'full pile'];
  TRIAL.stage = (it, i) => i === 0 ? TRIAL.onMap(it) : TRIAL.sharp(STAGES[it.id][i - 1], null, 34, 34);
})();
