'use strict';
function buildColony(w, season, used, place) {
  const W = w.W, set = (x, y, id) => { w.g[y * W + x] = G[id]; };
  const b = (kind, x, y, dx, dy) => place(build(kind), x, y, dx, dy);
  for (let x = 16; x <= 34; x++) set(x, 16, 'dirt');
  for (let y = 15; y <= 24; y++) set(26, y, 'dirt');
  for (let x = 20; x <= 26; x++) set(x, 24, 'dirt');
  for (let x = 27; x <= 30; x++) for (let y = 15; y <= 17; y++) set(x, y, 'dirt');
  set(22, 15, 'dirt');

  for (let x = 17; x <= 27; x++) w.wall[8 * W + x] = WL.palisade;
  for (let y = 8; y <= 26; y++) if (y !== 16 && y !== 17) w.wall[y * W + 17] = WL.palisade;
  for (let x = 17; x <= 21; x++) w.wall[26 * W + x] = WL.palisade;

  w.room(19, 10, 26, 14, WL.stone, FL.plank, 'thatch');
  w.wall[14 * W + 22] = WL.stone; w.feat[14 * W + 22] = 1;
  w.feat[14 * W + 20] = 2; w.feat[14 * W + 24] = 2; w.feat[10 * W + 21] = 2; w.feat[10 * W + 24] = 2;
  b('featherbed', 20, 11, 0, 2); b('woolbed', 21, 11, 1, 2); b('hearth', 23, 11, 0, 1); b('cupboard', 25, 11, 0, 2);
  b('table', 23, 13, 0, -2); b('woodstool', 22, 13, 2, -2); b('armchair', 25, 13, -1, 0); b('rug', 21, 13, -6, 0);

  w.room(19, 19, 25, 23, WL.daub, FL.earth, 'tile');
  w.feat[23 * W + 22] = 1; w.feat[23 * W + 20] = 2; w.feat[23 * W + 24] = 2;
  b('carpenter', 20, 20); b('loom', 22, 20); b('tailor', 24, 20); b('spinning', 24, 22, 0, -2); b('crate', 20, 22, 0, -2);

  for (let y = 10; y <= 12; y++) for (let x = 28; x <= 31; x++) w.floor[y * W + x] = FL.flagstone;
  b('bloomery', 28, 10); b('smelter', 30, 10); b('anvil', 29, 11, 0, 3); b('stonecutter', 31, 12, 0, 0); b('ingots', 28, 12, 0, 0);
  w.roofs.push({ x0: 28, y0: 10, x1: 31, y1: 10, kind: 'thatch', h: 9, open: 1 });

  b('campfire', 28, 16); b('stool', 27, 17, -2, 2); b('stool', 29, 17, 3, 2); b('stool', 30, 16, 0, -3);
  b('well', 23, 17, 0, 0); b('butcher', 31, 14); b('drying', 32, 15, 0, 2); b('smoking', 32, 13, 0, 0);
  b('logpile', 28, 13, 0, 4); b('logpile', 29, 13, 2, 4); b('stonepile', 27, 13, -2, 4); b('sacks', 30, 13, 4, 3); b('hides', 27, 14, 0, 6);
  b('kiln', 32, 9); b('potter', 33, 10, -2, 4); b('charcoal', 33, 18, -2, 0); b('windmill', 31, 7, 0, 4); b('quern', 30, 8, -4, 6);
  b('tanning', 20, 25, 0, 0); b('trough', 22, 25, 0, 2); b('compost', 26, 26, 0, 0);

  const fields = [['wheat', 27, 19, 29, 22], ['cabbage', 30, 19, 32, 20], ['beans', 30, 21, 32, 22], ['turnip', 27, 23, 29, 24], ['flax', 30, 23, 32, 24], ['pumpkin', 27, 25, 30, 25]];
  for (const [kind, x0, y0, x1, y1] of fields) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { set(x, y, 'tilled'); place(crop(kind, x * 3 + y, season), x, y, 0, 3); }

  for (let x = 22; x <= 24; x++) w.wall[27 * W + x] = WL.runed;
  w.floor[28 * W + 22] = w.floor[28 * W + 23] = w.floor[28 * W + 24] = FL.flagstone;
  b('attune', 23, 28, 0, 0);

  const pw = (kind, x, y, flip, dx, dy) => place(pawn(kind, flip), x, y, dx || 0, dy || 2);
  pw('cook', 27, 15, 0, 2); pw('smith', 30, 11, 1, 2, 4); pw('hauler', 25, 16); pw('guard', 18, 16, 0, 0, 0); pw('farmer', 31, 25, 1); pw('mage', 25, 28, 1);
  pw('weaver', 22, 21, 0, 2, 4); pw('watch', 21, 15, 0, -4, 2); pw('trader', 33, 16, 1, 2, 0);
  place(beast('packox', 1), 32, 17, 6, -3); place(beast('fowl'), 24, 15, 4, 2); place(beast('fowl', 1), 25, 18, 0, 0);
}

function populate(w, season, used, place, free) {
  const W = w.W;
  const near = (x, y) => { for (let r = 0; r < 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (free(x + dx, y + dy) && !used[(y + dy) * W + x + dx]) return [x + dx, y + dy]; return null; };
  const put = (s, x, y) => { const p = near(x, y); if (p) place(s, p[0], p[1], 0, 2); };
  const A = (k, x, y, flip) => put(beast(k, flip), x, y), Pn = (k, x, y, flip) => put(pawn(k, flip), x, y), Rk = (k, x, y) => put(rock(k, x, season), x, y);
  Rk('den', 14, 3); A('direwolf', 13, 6); A('wolf', 15, 5); A('wolf', 12, 8, 1); A('wolf', 16, 7);
  A('owlbear', 14, 13); A('spider', 5, 15); A('spider', 8, 13, 1); A('shade', 3, 22); A('boar', 15, 21); A('boar', 13, 22, 1);
  A('lurker', 8, 26); A('croaker', 4, 26); A('adder', 12, 28); A('ooze', 3, 31); A('stirge', 9, 23); Rk('cairn', 7, 29);
  Pn('woodcutter', 15, 14); Pn('hunter', 13, 19, 1);
  A('deer', 43, 23); A('deer', 45, 25, 1); A('fawn', 44, 24); A('elk', 47, 22, 1); A('rabbit', 40, 30); A('rabbit', 22, 30, 1); A('rabbit', 41, 21);
  A('sabre', 45, 30, 1); A('mammoth', 50, 22, 1); A('ox', 36, 31); A('jackal', 43, 17); Rk('mound', 42, 28);
  Pn('miner', 44, 12); Rk('warren', 45, 14);
  Pn('goblin', 47, 12); Pn('goblin', 48, 13, 1); Pn('gobboss', 46, 13); Pn('kobold', 49, 10); A('cavebear', 52, 8, 1);
  Rk('amethyst', 50, 7); Rk('sapphire_inf', 53, 9); Rk('emerald', 48, 8); Rk('vent', 51, 10); Rk('ruby', 54, 7); Rk('geode', 49, 6);
  A('hippogriff', 50, 31, 1); Rk('nest', 49, 29); A('bighorn', 57, 23); Rk('topaz', 56, 25);
  Pn('orc', 39, 2); Pn('warlord', 40, 3); Pn('gnoll', 42, 5, 1); A('worg', 41, 1);
  A('frostfang', 34, 3, 1); A('bear', 19, 4); A('rat', 26, 27);
}
