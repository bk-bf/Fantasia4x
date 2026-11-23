'use strict';
const sprCache = new Map();
function cached(key, make) {
  let s = sprCache.get(key);
  if (!s) { s = make(); sprCache.set(key, s); }
  return s;
}
const tree = (kind, seed, season) => cached('t' + kind + (seed % 4) + season, () => mkTree(kind, seed % 4, season));
const plant = (kind, seed, season) => cached('p' + kind + (seed % 3) + season, () => mkPlant(kind, seed % 3, season));
const crop = (kind, seed, season) => cached('c' + kind + (seed % 3) + season, () => mkCrop(kind, seed % 3, season));
const rock = (kind, seed, season) => cached('r' + kind + (seed % 3) + season, () => mkRock(kind, seed % 3, season));
function pickW(r, table) {
  let t = 0; for (const [, wt] of table) t += wt;
  let v = r * t;
  for (const [k, wt] of table) { v -= wt; if (v <= 0) return k; }
  return table[0][0];
}
const SW = 60, SH = 34;
function buildScene(season) {
  const W = SW, H = SH, w = new World(W, H, G.tall_grass);
  const set = (x, y, id) => { if (w.in(x, y)) w.g[y * W + x] = G[id]; };
  const biome = new Array(W * H);
  const river = y => 37.5 + 2.6 * Math.sin(y * .22 + 1) - (y - 17) * .13;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = fbm(x * .11, y * .11, 7, 3), n2 = fbm(x * .21 + 9, y * .21, 8, 2), fx = x + (n - .5) * 9, fy = y + (n2 - .5) * 7;
    let g, b;
    if (fx < 16 && fy >= 21.5) { b = 'swamp'; g = n2 < .4 ? 'bog' : n2 < .5 ? 'mud' : n2 < .7 ? 'moss' : n < .4 ? 'clay' : 'mud'; }
    else if (fx < 11.5) { b = 'deep'; g = n2 < .62 ? 'mossy_ground' : 'tree'; }
    else if (fx < 17.5) { b = 'forest'; g = n2 < .5 ? 'tree' : 'deep_grass'; }
    else { b = 'plains'; g = n2 < .36 ? 'grass' : n2 < .6 ? 'tall_grass' : n2 < .72 ? 'deep_grass' : x > 40 ? 'savanna' : 'tall_grass'; }
    const mv = (x - 41) * .085 + (15 - y) * .07 + (n - .5) * 1.1;
    const hill = Math.hypot((x - 54) * .8, y - 28.5) + (n2 - .5) * 3;
    if (mv > .5 || hill < 2.6) { b = 'rock'; g = 'rocky'; w.wall[y * W + x] = WL.mountain; }
    else if (mv > .34 || hill < 4.2) { b = 'rockedge'; g = 'rocky'; }
    const d = Math.abs(x - river(y)) + (n2 - .5) * .8;
    if (d < 3 && !(b === 'rock' && d > 1.6)) {
      w.wall[y * W + x] = 0; b = 'river';
      g = d < 1.15 ? (y >= 5 && y <= 9 ? 'rapids' : 'water') : d < 1.95 ? 'shallow_water' : 'riverbank';
    }
    set(x, y, g); biome[y * W + x] = b;
  }
  for (let y = 5; y <= 13; y++) for (let x = 46; x <= 55; x++) {
    const q = Math.hypot((x - 50.5) / 3.6, (y - 8.5) / 2.3);
    if (q < 1 || (x >= 46 && x <= 48 && y >= 10 && y <= 13 && Math.abs(x - 47 - (13 - y) * .5) < 1)) { w.wall[y * W + x] = 0; set(x, y, 'cave'); biome[y * W + x] = 'cave'; }
  }
  const oreSpots = [['hematite', 45, 9], ['malachite', 50, 5], ['gold', 55, 9], ['coal', 52, 12], ['azurite', 47, 5], ['galena', 55, 5], ['salt', 44, 4], ['cassiterite', 57, 12], ['magnetite', 49, 2], ['limonite', 53, 29]];
  for (const [k, ox, oy] of oreSpots) for (let y = oy - 2; y <= oy + 2; y++) for (let x = ox - 2; x <= ox + 2; x++) {
    if (!w.in(x, y) || w.wall[y * W + x] !== WL.mountain) continue;
    if (Math.hypot(x - ox, y - oy) < 1.6 + hash(x, y, 3) * .9) w.ore[y * W + x] = { ramp: ORE[k], seed: ox, glow: k === 'gold' ? [1, .8, .3] : null };
  }

  const colony = (x, y) => x >= 16 && x <= 33 && y >= 7 && y <= 27;
  const free = (x, y) => w.in(x, y) && !w.wall[y * W + x] && !w.floor[y * W + x] && !GROUND[w.g[y * W + x]].water;
  const used = new Uint8Array(W * H);
  const place = (s, x, y, dx, dy) => { used[y * W + x] = 1; return w.put(s, x, y, (dx || 0) * 2, (dy || 0) * 2); };

  buildColony(w, season, used, place);

  const special = [['heartwood', 6, 10], ['moonwood', 10, 17], ['soulwood', 5, 27], ['witchwood', 11, 30], ['emberwood', 44, 19], ['frostheart', 41, 3], ['ironwood', 3, 4], ['bonewood', 2, 24], ['apple', 30, 29], ['apple', 32, 30]];
  for (const [k, x, y] of special) if (free(x, y) && !used[y * W + x]) place(tree(k, x, season), x, y);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, b = biome[i], gid = GROUND[w.g[i]].id, h = hash(x, y, 77), h2 = hash(x, y, 78);
    if (!free(x, y) || used[i] || w.floor[i] || gid === 'tilled') continue;
    const jx = Math.floor(hash(x, y, 79) * 9) - 4, jy = Math.floor(hash(x, y, 80) * 7) - 3;
    const near = colony(x, y);
    let dens = 0, tbl = null;
    if (b === 'deep') { dens = .5; tbl = [['pine', 5], ['oak', 2.5], ['yew', 1], ['ash', 1]]; }
    else if (b === 'forest') { dens = gid === 'tree' ? .36 : .14; tbl = [['oak', 4], ['birch', 3], ['ash', 2], ['pine', 1]]; }
    else if (b === 'swamp') { dens = gid === 'bog' ? .04 : .13; tbl = [['willow', 4], ['dead', 3], ['birch', 1]]; }
    else if (b === 'plains') { dens = gid === 'deep_grass' ? .05 : gid === 'savanna' ? .02 : .018; tbl = [['oak', 3], ['birch', 2], ['ash', 1]]; }
    else if (b === 'rockedge') { dens = .04; tbl = [['pine', 3], ['dead', 1]]; }
    if (near) dens *= x < 19 ? .25 : 0;
    if (h < dens) { place(tree(pickW(h2, tbl), x * 7 + y, season), x, y, jx, jy); continue; }
    let p = null;
    if (b === 'deep') p = h2 < .05 ? 'mushroom' : h2 < .065 ? 'glowcap' : h2 < .08 ? 'bolete' : h2 < .12 ? 'bush' : h2 < .14 ? 'logs' : null;
    else if (b === 'forest') p = h2 < .05 ? 'berry' : h2 < .09 ? 'bush' : h2 < .11 ? 'stump' : h2 < .125 ? 'mushroom' : h2 < .14 ? 'logs' : null;
    else if (b === 'swamp') p = h2 < .1 ? 'reeds' : h2 < .12 ? 'madness' : h2 < .14 ? 'morel' : h2 < .16 ? 'bloodroot' : null;
    else if (b === 'plains' && !near) p = h2 < .035 ? 'flowers' : h2 < .055 ? 'bush' : h2 < .07 ? (gid === 'savanna' ? 'scrub' : 'berry') : h2 < .078 ? 'mandrake' : null;
    else if (b === 'plains' && near && x < 19) p = h2 < .16 ? 'stump' : null;
    else if (b === 'river' && gid !== 'water' && gid !== 'rapids') p = h2 < .2 ? 'reeds' : null;
    else if (b === 'rockedge') p = h2 < .05 ? 'scrub' : h2 < .07 ? 'emberbloom' : null;
    if (p) { place(plant(p, x + y * 3, season), x, y, jx >> 1, jy >> 1); continue; }
    if ((b === 'rockedge' && h2 > .9) || (b === 'cave' && h2 > .93)) place(rock('boulder', x + y, season), x, y, jx >> 1, 0);
  }
  populate(w, season, used, place, free);
  return w;
}
