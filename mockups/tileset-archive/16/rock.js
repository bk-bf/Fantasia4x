'use strict';
function shard(s, bx, by, w, h, lean, ramp, e) {
  const n = ramp.length - 1;
  for (let j = 0; j < h; j++) {
    const y = by - j, f = j / h, hw = f > .68 ? w * (1 - f) / .32 * .5 : w * .5, cx = bx + lean * j;
    for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
      const u = (x - cx) / (hw + .01);
      let k = u < -.25 ? n - 1 : u < .3 ? n - 2 : n - 4;
      if (f > .68 && u < .1) k = n;
      if (x === Math.round(cx - hw) && j % 3 === 1) k = n;
      s.set(x, y, ramp[clamp(k, 0, n)], e && k >= n - 2 ? e : 0);
    }
  }
}
const ROCKS = {
  boulder: { name: 'Stone Outcrop' },
  deposit: { name: 'Mineral Deposit' },
  mound: { name: 'Barrow Mound' },
  den: { name: 'Wolf Den' },
  warren: { name: 'Goblin Warren' },
  nest: { name: 'Harpy Roost' },
  cairn: { name: 'Sunken Cairn' },
  earth: { name: 'Disturbed Earth' },
  vent: { name: 'Mana Crystal Vent' },
  geode: { name: 'Star Geode' },
  voidshard: { name: 'Voidshard Cluster' },
};
for (const g of ['amethyst', 'ruby', 'sapphire', 'emerald', 'topaz', 'citrine', 'moonstone']) {
  const nm = g[0].toUpperCase() + g.slice(1);
  ROCKS[g] = { name: nm + ' Crystals', gem: g };
  ROCKS[g + '_inf'] = { name: 'Infused ' + nm, gem: g, inf: 1 };
}
const GLOW = { amethyst: [.7, .4, 1], ruby: [1, .3, .3], sapphire: [.3, .5, 1], emerald: [.3, 1, .5], topaz: [1, .7, .3], citrine: [1, .95, .4], moonstone: [.7, .85, 1], mana: [.4, .8, 1], void: [.6, .3, 1], star: [1, 1, .6] };

function mkRock(kind, seed, season) {
  const k = ROCKS[kind], r = rng(seed * 17 + 5), s = new Spr(22, 24, 11, 20);
  const winter = season === 'winter';
  const rubble = () => { for (let i = 0; i < 5; i++) { const x = 4 + r() * 13, y = 18 + r() * 2; s.set(x, y, P.rock[4 + (i & 1)]); s.set(x + 1, y, P.rock[2]); } };
  if (k.gem || kind === 'vent' || kind === 'voidshard' || kind === 'geode') {
    const gem = k.gem || (kind === 'vent' ? 'mana' : kind === 'geode' ? 'star' : 'void'), ramp = GEM[gem], e = (k.inf || !k.gem) ? 200 : 0;
    if (kind === 'geode') {
      s.ball(11, 15, 7, 5, 0, P.rock, { facet: 4, seed, d: .3 });
      s.disc(11, 14, 4.5, 2.6, P.rock[0]);
      for (let i = 0; i < 5; i++) shard(s, 8 + i * 1.6, 15 - (i & 1), 2, 3 + (i % 3), (i - 2) * .12, ramp, 220);
    } else {
      s.ball(11, 18, 7, 2.6, 0, kind === 'vent' ? P.rock : P.rockWarm, { facet: 3, seed, d: .3 });
      const big = k.inf || !k.gem ? 1.15 : 1;
      shard(s, 7, 18, 3, 8 * big, -.22, ramp, e);
      shard(s, 15, 18, 3, 9 * big, .26, ramp, e);
      shard(s, 11, 18, 4.4, 14 * big, .04, ramp, e);
      shard(s, 9, 19, 2, 5, -.1, ramp, e);
      shard(s, 13.5, 19, 2, 4, .15, ramp, e);
      if (kind === 'vent') for (let i = 0; i < 5; i++) s.set(7 + r() * 8, 1 + r() * 5, P.mana[4 + (i & 1)], 255);
    }
    if (e) s.emit = { dx: 0, dy: -8, rad: kind === 'vent' ? 46 : 30, col: GLOW[gem], pulse: 1 };
    else s.emit = { dx: 0, dy: -8, rad: 12, col: GLOW[gem] };
    s.sh = { rx: 8, ry: 3, dx: 2, dy: 0 };
  } else if (kind === 'boulder' || kind === 'deposit') {
    s.ball(11, 13, 8, 6, 0, P.rock, { facet: 4.5, seed, d: .3 });
    s.ball(5.5, 16, 4, 3.4, 1, P.rock, { facet: 3, seed: seed + 1, d: .3 });
    s.ball(16, 16.5, 3.4, 2.8, 1, P.rock, { facet: 3, seed: seed + 2, d: .3 });
    if (kind === 'deposit') { const o = ORE[['hematite', 'malachite', 'chalcopyrite'][seed % 3]]; for (let i = 0; i < 16; i++) { const x = 4 + Math.floor(r() * 14), y = 8 + Math.floor(r() * 10); if (s.get(x, y)) { s.set(x, y, o[2 + (i & 1)]); if (r() > .5) s.set(x + 1, y, o[1]); } } }
    rubble();
    s.sh = { rx: 10, ry: 4, dx: 3, dy: 0 };
  } else if (kind === 'mound' || kind === 'den' || kind === 'warren' || kind === 'earth') {
    const flat = kind === 'earth';
    s.ball(11, flat ? 17 : 15, 9.5, flat ? 3 : 6.5, 0, P.soil, { n: .5, ns: .5, seed, d: .5 });
    if (!flat && !winter) for (let i = 0; i < 26; i++) { const x = 3 + Math.floor(r() * 16), y = 9 + Math.floor(r() * 6); if (s.get(x, y)) s.set(x, y, P.grassLoam[2 + Math.floor(r() * 3)]); }
    if (kind === 'mound') { s.rect(8, 14, 6, 6, P.stone[4]); s.rect(9, 15, 4, 5, P.ink); s.rect(7, 13, 8, 1, P.stone[5]); s.set(8, 19, P.stone[2]); s.set(13, 19, P.stone[2]); }
    if (kind === 'den' || kind === 'warren') { s.disc(11, 17, 3.6, 2.6, P.ink); s.set(9, 15, P.soilRich[1]); s.set(13, 15, P.soilRich[1]); }
    if (kind === 'den') { s.set(15, 19, P.bone[5]); s.set(16, 19, P.bone[3]); s.set(5, 19, P.bone[4]); }
    if (kind === 'warren') { for (const x of [4, 7, 15, 18]) { s.line(x, 19, x + (x < 11 ? -1 : 1), 12, P.wood[3]); s.set(x + (x < 11 ? -1 : 1), 11, P.bone[5]); } s.set(11, 12, P.bone[5]); s.set(10, 12, P.bone[4]); s.set(11, 13, P.bone[3]); }
    if (flat) for (let i = 0; i < 8; i++) s.set(4 + r() * 14, 15 + r() * 4, P.soilRich[Math.floor(r() * 3)]);
    s.sh = { rx: 11, ry: 4, dx: 3, dy: 0 };
  } else if (kind === 'nest') {
    for (let a = 0; a < 40; a++) { const t = a / 40 * 6.283, x = 11 + Math.cos(t) * (6.5 + r()), y = 15 + Math.sin(t) * (3 + r() * .6); s.line(x, y, x + (r() - .5) * 4, y + (r() - .5) * 2, P.wood[2 + Math.floor(r() * 4)]); }
    s.disc(11, 15, 4.5, 2, P.wood[0]);
    for (const [x, y] of [[9, 15], [11, 14], [13, 15]]) { s.set(x, y, P.cloth[5]); s.set(x, y + 1, P.cloth[3]); s.set(x + 1, y, P.cloth[4]); }
    s.set(16, 12, P.furWhite[4]); s.set(17, 11, P.furWhite[3]);
    s.sh = { rx: 9, ry: 3, dx: 2, dy: 0, k: .8 };
  } else if (kind === 'cairn') {
    s.ball(11, 17, 6, 3, 0, P.stone, { facet: 3, seed, d: .3 });
    s.ball(11, 13, 4.4, 2.6, 1, P.stone, { facet: 3, seed: seed + 3, d: .3 });
    s.ball(11.5, 9.5, 3, 2.2, 2, P.stone, { facet: 2.5, seed: seed + 5, d: .3 });
    s.ball(11, 6.5, 1.8, 1.5, 3, P.stone, { d: .3 });
    for (let i = 0; i < 6; i++) { const x = 6 + Math.floor(r() * 10), y = 9 + Math.floor(r() * 9); if (s.get(x, y)) s.set(x, y, P.mossSwamp[2 + (i % 3)]); }
    s.sh = { rx: 7, ry: 3, dx: 2, dy: 0 };
  }
  if (winter) s.snowCap(2, .2);
  s.outline();
  return s;
}
const rock = (kind, seed, season) => cached('r' + kind + (seed % 3) + season, () => mkRock(kind, seed % 3, season));
