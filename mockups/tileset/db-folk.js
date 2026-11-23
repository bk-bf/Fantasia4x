'use strict';
(() => {
  const X = DBX, pawnX = X.pawnX;
  const S = {
    stone: R('#3a3632 #524c46 #6e665c #8a8274 #a69e8e'),
    leaf: R('#2a4424 #3e6230 #588240 #76a054 #98bc70'),
    deep: R('#3a3a48 #54566a #74788c #989cae #bec2cc'),
    sky: R('#4a5874 #6a7c9c #8ea2be #b4c6da #d8e4ee'),
    marsh: R('#1e3a2e #2c5440 #3f7054 #588e68 #7aac80'),
    frost: R('#56647c #7888a0 #9cacc0 #c0cedc #e0e8f0'),
    ember: R('#3a1410 #5a1e16 #7e2e1e #a2442a #c2623c'),
    verdant: R('#24401a #386024 #508232 #6ea444 #92c45e'),
    leafHair: R('#16301f #224626 #335f2c #4b7a34 #6b963f #91b04e'),
    wrap: R('#5a4a30 #786440 #988054 #b89e6c #d4bc88 #e8d8aa'),
    star: R('#1a1c40 #262c62 #364488 #4e62ae #7088cc'),
    reed: R('#3a4a22 #52662c #6c8438 #8aa248 #a8bc60'),
  };
  Object.assign(FOLK, {
    mountain: { legs: 9, tl: 14, hw: 8, aw: 4, hh: 11, hd: 6, skin: S.stone, beard: 1 },
    forestkin: { legs: 10, tl: 11, hw: 5, aw: 2, hh: 10, hd: 5, skin: S.leaf, ears: 1 },
    deepfolk: { legs: 7, tl: 10, hw: 5, aw: 3, hh: 10, hd: 5, skin: S.deep, bald: 1, eyes: GEM.moonstone[5] },
    skyfolk: { legs: 12, tl: 12, hw: 5, aw: 2, hh: 10, hd: 5, skin: S.sky, longhair: 1, eyes: P.mana[5] },
    marshfolk: { legs: 8, tl: 11, hw: 6, aw: 3, hh: 10, hd: 6, skin: S.marsh, bald: 1, eyes: P.gold[4] },
    tundra: { legs: 10, tl: 13, hw: 7, aw: 4, hh: 10, hd: 5, skin: S.frost, beard: 0 },
    ember: { legs: 10, tl: 13, hw: 7, aw: 3, hh: 10, hd: 5, skin: S.ember, bald: 1, eyes: P.fire[3] },
    riverfolk: { legs: 9, tl: 11, hw: 5, aw: 3, hh: 10, hd: 5, skin: P.skinTan },
    nomad: { legs: 11, tl: 13, hw: 6, aw: 3, hh: 10, hd: 5, skin: P.skinDark },
    verdant: { legs: 11, tl: 13, hw: 6, aw: 3, hh: 10, hd: 5, skin: S.verdant },
  });
  const crest = (ramp, n) => (s, g) => { for (let i = 0; i < n; i++) { const x = g.cx - n + i * 2, h = 4 + (i === (n >> 1) ? 3 : i % 2 ? 2 : 0); for (let j = 0; j < h; j++) { s.set(x, g.hTop - 1 - j, ramp[clamp(2 + (j > h - 2 ? 2 : j & 1), 0, ramp.length - 1)]); if (j < h - 1) s.set(x + 1, g.hTop - 1 - j, ramp[1]); } } };
  const horns = (s, g) => { for (const sd of [-1, 1]) for (let j = 0; j < 5; j++) { const x = g.cx + sd * (g.hd - 2 + Math.round(Math.sin(j / 4 * 1.5) * 2)) - (sd > 0 ? 1 : 0), y = g.hTop + 1 - j; s.rect(x - (sd > 0 ? 0 : 1), y, j > 3 ? 1 : 2, 1, P.bone[sd < 0 ? 4 : 3]); if (j === 0) s.rect(x - (sd > 0 ? 0 : 1), y, 2, 1, P.bone[2]); } for (const [dx, dy] of [[-3, 3], [2, 4], [-1, 7], [3, 8]]) s.set(g.cx + dx, g.tTop + dy, P.fire[2], 160); };
  const fin = ramp => (s, g) => { for (let j = 0; j < 7; j++) for (let i = 0; i < 2; i++) s.set(g.cx - 1 + i, g.hTop - 1 - j + Math.abs(j - 3) - 3 + j, ramp[3 + i]); for (let j = 0; j < 5; j++) s.rect(g.cx - 1, g.hTop - 1 - j, 2, 1, ramp[clamp(4 - (j & 1), 0, 4)]); for (const sd of [-1, 1]) for (let j = 0; j < 4; j++) s.set(g.cx + sd * (g.hd + 1 + (j >> 1)) - (sd > 0 ? 1 : 0), g.er - 1 + j, ramp[3 - (j & 1)]); for (const [dx, dy] of [[-4, 2], [3, 3], [-2, 6], [2, 8], [-5, 9]]) s.set(g.cx + dx, g.tTop + dy, ramp[1]); };
  const furTrim = (s, g) => { for (let i = -g.hd - 2; i < g.hd + 2; i++) { s.set(g.cx + i, g.hTop + 3 - (Math.abs(i) > g.hd ? 0 : 1) + ((i & 1) ? 0 : 1) - 3, P.furWhite[4 - (i > 2 ? 1 : 0)]); } for (let i = -g.hw - 1; i < g.hw + 1; i++) { s.set(g.cx + i, g.tTop, P.furWhite[4 - (i > 2 ? 1 : 0)]); s.set(g.cx + i, g.tTop + 1, P.furWhite[(i & 1) ? 3 : 2]); } };
  const stars = (s, g) => { for (const [dx, dy] of [[-3, 3], [2, 5], [-1, 8], [3, 10], [-4, 11], [0, 14]]) if (s.get(g.cx + dx, g.tTop + dy)) s.set(g.cx + dx, g.tTop + dy, P.gold[4], 120); s.set(g.cx, g.er - 3, P.mana[5], 200); };
  const leaves = (s, g) => { for (let i = -g.hd - 1; i <= g.hd; i++) for (let j = 0; j < 4; j++) if (hash(i, j, 5) > .25) s.set(g.cx + i, g.hTop - 2 + j - (Math.abs(i) < 3 ? 1 : 0), S.leafHair[clamp(4 - j + (i < -1 ? 1 : 0) - (i > 2 ? 1 : 0), 0, 5)]); s.set(g.cx + 3, g.hTop - 3, P.red[4]); s.set(g.cx + 4, g.hTop - 3, hex('#e06bb5')); s.set(g.cx + 3, g.hTop - 4, hex('#e06bb5')); s.set(g.cx + 3, g.hTop - 2, P.gold[4]); for (let j = 3; j < 10; j += 3) { s.set(g.cx - g.hw - g.aw, g.tTop + j, S.leafHair[4]); s.set(g.cx - g.hw - g.aw - 1, g.tTop + j - 1, S.leafHair[5]); } };
  const wrap = (s, g) => { for (let i = -g.hd; i < g.hd; i++) { s.set(g.cx + i, g.er + 2, S.wrap[3 - (i > 1 ? 1 : 0)]); s.set(g.cx + i, g.er + 3, S.wrap[4 - (i > 1 ? 1 : 0)]); s.set(g.cx + i, g.er + 4, S.wrap[2]); } };
  const F = (id, o, extra) => X.reg('folk', id, '0', () => pawnX(o, extra));
  F('mountain_born', { race: 'mountain', tunic: P.furDark, pants: P.leather, hair: P.furGrey, tool: 'pick', apron: 1, sleeves: 0, seed: 21 });
  F('forest_kin', { race: 'forestkin', tunic: P.oak, pants: P.leather, hair: P.hay, tool: 'bow', cape: P.oak, seed: 22 }, crest(P.hay, 5));
  F('deep_dwellers', { race: 'deepfolk', tunic: P.furDark, pants: P.furDark, hat: 'hood', hood: P.furDark, tool: 'torch', seed: 23 });
  F('sky_touched', { race: 'skyfolk', tunic: S.star, pants: S.star, hair: P.furWhite, tool: 'staff', cape: S.star, trim: P.gold, seed: 24 }, stars);
  F('marsh_folk', { race: 'marshfolk', tunic: S.reed, pants: P.mud, tool: 'spear', sleeves: 0, seed: 25 }, fin(S.marsh));
  F('tundra_clans', { race: 'tundra', tunic: P.furBrown, pants: P.furDark, hair: P.furDark, hat: 'hood', hood: P.furBrown, tool: 'spear', cape: P.furBrown, seed: 26 }, furTrim);
  F('ember_kin', { race: 'ember', tunic: P.furDark, pants: P.furDark, apron: 1, tool: 'hammer', sleeves: 0, seed: 27 }, horns);
  F('river_people', { race: 'riverfolk', tunic: P.blue, pants: P.cloth, hair: P.furDark, hat: 'straw', tool: 'basket', seed: 28 });
  F('wastrel_nomads', { race: 'nomad', tunic: S.wrap, pants: S.wrap, hat: 'hood', hood: S.wrap, cape: S.wrap, tool: 'spear', seed: 29 }, wrap);
  F('verdant', { race: 'verdant', tunic: P.cloth, pants: P.green, hair: S.leafHair, tool: 'hoe', bald: 1, seed: 30 }, leaves);
})();
