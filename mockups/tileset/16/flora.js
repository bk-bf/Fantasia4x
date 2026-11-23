'use strict';
const TREES = {
  oak: { name: 'Oak Tree', shape: 'round', sz: 1.12, trunk: P.wood, leaf: P.oak, fall: P.fallOrange },
  ash: { name: 'Ash Tree', shape: 'tall', sz: 1, trunk: P.woodGrey, leaf: P.ash, fall: P.fallYellow },
  apple: { name: 'Apple Tree', shape: 'round', sz: .8, trunk: P.wood, leaf: P.ash, fall: P.fallRed, fruit: P.red },
  birch: { name: 'Birch Tree', shape: 'birch', trunk: P.birch, leaf: P.birchLeaf, fall: P.fallYellow },
  willow: { name: 'Willow Tree', shape: 'willow', trunk: P.wood, leaf: P.willow, fall: P.fallYellow },
  yew: { name: 'Yew Tree', shape: 'round', sz: .92, squat: 1, trunk: P.wood, leaf: P.pine, ever: 1, fruit: P.red },
  pine: { name: 'Pine Tree', shape: 'pine', trunk: P.wood, leaf: P.pine, ever: 1 },
  frostheart: { name: 'Frostheart Pine', shape: 'pine', trunk: P.woodGrey, leaf: P.frost, ever: 1, glow: [.5, .8, 1], frosted: 1 },
  heartwood: { name: 'Heartwood Tree', shape: 'round', sz: 1.05, trunk: P.wood, leaf: P.heart, ever: 1, glow: [.85, .42, 1] },
  moonwood: { name: 'Moonwood Tree', shape: 'birch', trunk: P.moon, leaf: P.moon, ever: 1, glow: [.6, .8, 1] },
  ironwood: { name: 'Ironwood Tree', shape: 'round', sz: 1.18, thick: 1, trunk: P.ironbark, leaf: P.ironleaf, ever: 1 },
  emberwood: { name: 'Emberwood Tree', shape: 'round', sz: .95, trunk: P.furDark, leaf: P.ember, ever: 1, glow: [1, .5, .15], sparks: 1 },
  soulwood: { name: 'Soulwood Tree', shape: 'willow', trunk: P.woodGrey, leaf: P.soul, ever: 1, glow: [.4, 1, .85] },
  witchwood: { name: 'Witchwood Tree', shape: 'dead', trunk: P.witch, tuft: P.witch, ever: 1 },
  bonewood: { name: 'Bonewood Snag', shape: 'dead', trunk: P.bone, ever: 1 },
  dead: { name: 'Dead Tree', shape: 'dead', trunk: P.woodGrey, ever: 1 },
};

function trunk(s, cx, base, h, w, ramp, seed) {
  const n = ramp.length - 1;
  for (let j = 0; j < h; j++) {
    const y = base - j, fl = j === 0 ? 2 : j === 1 ? 1 : 0, ww = w + fl * 2, x0 = cx - Math.floor(ww / 2);
    for (let i = 0; i < ww; i++) {
      const u = ww > 1 ? i / (ww - 1) : 0;
      let k = u < .3 ? n - 1 : u < .7 ? n - 2 : n - 4;
      if (hash(x0 + i, y >> 1, seed) > .78) k -= 1;
      s.set(x0 + i, y, ramp[clamp(k, 0, n)]);
    }
  }
}
function branches(s, cx, top, ramp, r, count, reach) {
  const n = ramp.length - 1;
  for (let b = 0; b < count; b++) {
    const side = b % 2 ? 1 : -1, y0 = top + 2 + b * 3 + r() * 2, len = reach * (.6 + r() * .5), rise = len * (.5 + r() * .5);
    const x1 = cx + side * len, y1 = y0 - rise;
    s.line(cx, y0, x1, y1, ramp[side < 0 ? n - 1 : n - 3]);
    s.line(cx, y0 + 1, cx + side * len * .5, y0 + 1 - rise * .5, ramp[n - 4 < 0 ? 0 : n - 4]);
    const m = .55 + r() * .2;
    s.line(cx + side * len * m, y0 - rise * m, cx + side * len * m + side * 2 + (r() - .5) * 3, y0 - rise * m - 4 - r() * 3, ramp[n - 2]);
  }
}
function leafOpts(seed) { return { n: .5, ns: .62, seed, d: .55 }; }

function mkTree(kind, seed, season) {
  const k = TREES[kind], r = rng(seed * 31 + 7), s = new Spr(34, 46, 17, 43);
  const cx = 17, base = 43;
  let leaf = k.leaf, bare = false;
  if (!k.ever && season === 'autumn') leaf = [k.fall, P.fallOrange, P.fallRed][Math.floor(r() * 2.2)] || k.fall;
  if (!k.ever && season === 'winter') bare = true;
  const sz = k.sz || 1;
  let shR = 9;
  if (k.shape === 'dead' || bare) {
    const h = bare ? 22 + r() * 5 : 20 + r() * 6, w = k.thick ? 4 : 3;
    trunk(s, cx, base, h, w, k.trunk, seed);
    for (let j = 0; j < 6; j++) s.set(cx + Math.round((r() - .5) * 1.4), base - h - j, k.trunk[k.trunk.length - 2]);
    branches(s, cx, base - h, k.trunk, r, bare ? 5 : 4, bare ? 9 : 8);
    if (k.tuft) for (let i = 0; i < 6; i++) s.ball(cx + (r() - .5) * 18, base - h - 2 + (r() - .5) * 12, 2.5 + r() * 1.5, 2 + r(), 1, k.tuft, { n: .4, seed, bias: .12 });
    shR = 4;
  } else if (k.shape === 'pine') {
    trunk(s, cx, base, 6, 3, k.trunk, seed);
    const top = base - 39 + Math.floor(r() * 3);
    for (let i = 3; i >= 0; i--) {
      const y0 = top + i * 7, y1 = y0 + 12, hw = 4.2 + i * 2.7;
      for (let y = y0; y <= y1; y++) {
        const f = (y - y0) / (y1 - y0), w = hw * f + .7;
        for (let x = Math.ceil(cx - w); x <= Math.floor(cx + w - .5); x++) {
          if (y >= y1 - 1 && hash(x, i, seed) > .55) continue;
          let t = .6 - ((x - cx) / hw) * .4 - f * .2 + (noise(x * .8, y * .8, seed) - .5) * .34;
          if (y >= y1 - 2) t -= .25;
          s.set(x, y, rp(leaf, t, x, y, .5));
        }
      }
    }
    shR = 8;
  } else if (k.shape === 'birch') {
    const h = 30 + Math.floor(r() * 4);
    trunk(s, cx, base, h, 2, k.trunk, seed);
    if (k.trunk === P.birch) for (let j = 2; j < h; j += 3) if (r() > .3) s.set(cx - 1 + Math.floor(r() * 2), base - j, P.birch[0]);
    for (let i = 0; i < 5; i++) {
      const cy = base - h + 1 + i * 4.5, rr = 4.6 + r() * 1.8 - Math.abs(i - 1.5) * .3;
      s.ball(cx + (i % 2 ? 2.6 : -2.6) + (r() - .5) * 2, cy, rr * 1.1, rr * .9, i, leaf, leafOpts(seed));
    }
    shR = 6;
  } else if (k.shape === 'tall') {
    const h = 16 + Math.floor(r() * 3);
    trunk(s, cx, base, h, 3, k.trunk, seed);
    const cy = base - h - 9;
    s.ball(cx, cy, 8 * sz, 12 * sz, 0, leaf, leafOpts(seed));
    for (let i = 0; i < 5; i++) s.ball(cx + (r() - .5) * 11, cy - 8 + i * 4.4, 4.5 + r() * 2, 4 + r() * 1.5, 2 + r() * 3, leaf, leafOpts(seed));
    shR = 8;
  } else if (k.shape === 'willow') {
    const h = 15 + Math.floor(r() * 3);
    trunk(s, cx, base, h, 4, k.trunk, seed);
    const cy = base - h - 5;
    s.ball(cx, cy, 13, 9, 0, leaf, leafOpts(seed));
    s.ball(cx - 6, cy + 2, 7, 6, 2, leaf, leafOpts(seed));
    s.ball(cx + 6, cy + 2, 7, 6, 2, leaf, leafOpts(seed));
    const n = leaf.length - 1;
    for (let x = cx - 13; x <= cx + 13; x++) {
      if (hash(x, seed, 2) < .22) continue;
      let y = cy;
      while (y < base && !s.get(x, y)) y++;
      while (y < base && s.get(x, y) && s.z[y * s.w + x] > -1e8) y++;
      const len = 5 + hash(x, seed, 4) * 11 * (1 - Math.abs(x - cx) / 22);
      const kk = hash(x, seed, 6) < .5 ? n - 2 : n - 3;
      for (let j = 0; j < len && y + j < base - 1; j++) s.set(x, y + j, leaf[j > len - 2 ? kk + 1 : kk], k.glow && j > len - 2 ? 120 : 0);
    }
    shR = 11;
  } else {
    const h = (k.squat ? 9 : 13) + Math.floor(r() * 4);
    trunk(s, cx, base, h, k.thick ? 5 : 3 + (sz > 1 ? 1 : 0), k.trunk, seed);
    const R0 = 9.5 * sz + r() * 1.5, cy = base - h - R0 * .5;
    s.ball(cx, cy, R0 * (k.squat ? 1.25 : 1.08), R0 * .88, 0, leaf, leafOpts(seed));
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * 6.283 + r() * .8, d = R0 * (.55 + r() * .25), rr = R0 * (.42 + r() * .2);
      s.ball(cx + Math.cos(a) * d * (k.squat ? 1.4 : 1.12), cy + Math.sin(a) * d * .7, rr * 1.1, rr * .9, Math.sin(a) * 3 + 1, leaf, leafOpts(seed + i));
    }
    shR = R0 * 1.05;
  }
  const leafy = i => s.z[i] > -1e8;
  if (k.fruit && !bare) for (let i = 0; i < 9; i++) {
    const x = Math.floor(cx + (r() - .5) * 20), y = Math.floor(r() * 26);
    if (s.ok(x, y) && leafy(y * s.w + x) && s.get(x, y + 1)) { s.set(x, y, k.fruit[3]); s.set(x, y + 1, k.fruit[1]); }
  }
  if (k.glow) {
    const top = leaf[leaf.length - 1], top2 = leaf[leaf.length - 2];
    for (let i = 0; i < s.c.length; i++) if (s.c[i] === top) s.e[i] = 190; else if (s.c[i] === top2) s.e[i] = 90;
    s.emit = { dx: 0, dy: -24, rad: 54, col: k.glow, pulse: 1 };
  }
  if (k.sparks) for (let i = 0; i < 7; i++) s.set(cx + (r() - .5) * 22, 2 + r() * 24, P.fire[3 + (i & 1)], 255);
  if (season === 'winter' || k.frosted) {
    if (bare || k.shape === 'dead') s.snowCap(1, .25);
    else {
      const hi = leaf[leaf.length - 1], hi2 = leaf[leaf.length - 2];
      for (let i = 0; i < s.c.length; i++) {
        if (k.glow && season !== 'winter') continue;
        if (s.c[i] === hi) s.c[i] = P.snow[4]; else if (s.c[i] === hi2 && hash(i, seed, 3) < .6) s.c[i] = P.snow[3];
      }
      s.snowCap(2, .15);
    }
  }
  s.outline(dark(k.shape === 'dead' || bare ? k.trunk[0] : leaf[0], .55));
  s.sh = { rx: shR * 1.15, ry: shR * .5, dx: 4, dy: 0, k: bare || k.shape === 'dead' ? .5 : 1 };
  return s;
}

const PLANTS = {
  bush: { name: 'Bush', f: 'bush', leaf: P.oak },
  berry: { name: 'Berry Bush', f: 'bush', leaf: P.ash, dots: P.red },
  scrub: { name: 'Scrub Patch', f: 'scrub' },
  grape: { name: 'Wild Grapevine', f: 'vine', dots: P.purple },
  cane: { name: 'Sugar Cane', f: 'cane' },
  bloodroot: { name: 'Bloodroot', f: 'herb', leaf: P.green, bloom: P.red },
  dreamleaf: { name: 'Dreamleaf', f: 'herb', leaf: P.blue, bloom: P.mana, glow: [.4, .7, 1] },
  mandrake: { name: 'Mandrake', f: 'herb', leaf: P.oak, bloom: P.purple, root: 1 },
  emberbloom: { name: 'Emberbloom', f: 'herb', leaf: P.furDark, bloom: P.fire, glow: [1, .5, .15] },
  flowers: { name: 'Wildflower Patch', f: 'flowers' },
  reeds: { name: 'Reeds', f: 'reeds' },
  stump: { name: 'Tree Stump', f: 'stump' },
  logs: { name: 'Fallen Logs', f: 'logs' },
  mushroom: { name: 'Mushroom Patch', f: 'shroom', cap: P.leather, stem: P.cloth },
  glowcap: { name: 'Glowcap', f: 'shroom', cap: P.soul, stem: P.moon, glow: [.3, 1, .85] },
  bolete: { name: 'Nightshade Bolete', f: 'shroom', cap: P.witch, stem: P.furWhite, fat: 1 },
  morel: { name: "Witch's Morel", f: 'shroom', cap: P.furBrown, stem: P.cloth, tall: 1 },
  madness: { name: 'Spore of Madness', f: 'shroom', cap: P.red, stem: P.cloth, spots: 1, glow: [1, .3, .3] },
};

function mkPlant(kind, seed, season) {
  const k = PLANTS[kind], r = rng(seed * 13 + 3), s = new Spr(18, 18, 9, 16);
  const winter = season === 'winter', fall = season === 'autumn';
  let shr = 5;
  if (k.f === 'bush') {
    const leaf = fall ? P.fallOrange : k.leaf;
    if (winter) { for (let i = 0; i < 7; i++) s.line(9, 16, 9 + (i - 3) * 2 + (r() - .5), 8 + r() * 3, P.wood[2 + (i & 1)]); s.snowCap(1, .3); } else {
      s.ball(9, 11, 6.5, 5, 0, leaf, leafOpts(seed));
      s.ball(5.5, 12.5, 3.6, 3.2, 1, leaf, leafOpts(seed)); s.ball(12.5, 12.5, 3.8, 3.2, 1, leaf, leafOpts(seed));
      if (k.dots) for (let i = 0; i < 6; i++) { const x = 4 + Math.floor(r() * 11), y = 8 + Math.floor(r() * 7); if (s.get(x, y)) s.set(x, y, k.dots[3 + (i & 1)]); }
    }
  } else if (k.f === 'scrub') {
    for (let i = 0; i < 9; i++) { const x = 3 + r() * 12, h = 3 + r() * 5; s.line(x, 16, x + (r() - .5) * 4, 16 - h, P.savanna[1 + Math.floor(r() * 3)]); }
    if (!winter) for (let i = 0; i < 5; i++) s.set(3 + r() * 12, 9 + r() * 4, P.grassDry[3 + (i & 1)]);
    shr = 4;
  } else if (k.f === 'vine') {
    s.line(4, 16, 4, 5, P.wood[3]); s.line(13, 16, 13, 5, P.wood[2]); s.line(4, 6, 13, 6, P.wood[4]); s.line(4, 10, 13, 10, P.wood[3]);
    if (!winter) {
      for (let i = 0; i < 16; i++) { const x = 3 + Math.floor(r() * 12), y = 4 + Math.floor(r() * 9); s.set(x, y, (fall ? P.fallYellow : P.ash)[2 + Math.floor(r() * 3)]); }
      for (let i = 0; i < 4; i++) { const x = 5 + i * 2 + Math.floor(r() * 2), y = 8 + Math.floor(r() * 4); s.set(x, y, k.dots[3]); s.set(x, y + 1, k.dots[2]); s.set(x + 1, y, k.dots[2]); s.set(x, y + 2, k.dots[1]); }
    }
  } else if (k.f === 'cane') {
    for (let i = 0; i < 6; i++) {
      const x = 3 + i * 2 + Math.floor(r() * 2), h = 9 + Math.floor(r() * 5);
      for (let j = 0; j < h; j++) s.set(x, 16 - j, j % 4 === 3 ? P.savanna[2] : P.birchLeaf[3 + (i & 1)]);
      s.set(x - 1, 16 - h, P.birchLeaf[4]); s.set(x + 1, 15 - h, P.birchLeaf[5]); s.set(x - 1, 13 - h + 4, P.birchLeaf[2]);
    }
  } else if (k.f === 'herb') {
    const n = k.leaf.length - 1;
    for (let i = 0; i < 7; i++) { const a = -.2 - i / 6 * 2.7, l = 3 + r() * 2.5; s.line(9, 15, 9 + Math.cos(a) * l * 1.3, 15 + Math.sin(a) * l, k.leaf[clamp(n - 1 - (i % 3), 0, n)]); }
    s.line(9, 14, 9, 8, k.leaf[n - 2]);
    const b = k.bloom, bn = b.length - 1, e = k.glow ? 255 : 0;
    s.set(9, 7, b[bn - 1], e); s.set(8, 7, b[bn - 2], e); s.set(10, 7, b[bn - 2], e); s.set(9, 6, b[bn], e); s.set(9, 8, b[bn - 3], e);
    if (k.root) { s.set(8, 15, P.cloth[3]); s.set(9, 15, P.cloth[4]); s.set(10, 15, P.cloth[2]); s.set(9, 16, P.cloth[3]); }
    if (k.glow) s.emit = { dx: 0, dy: -7, rad: 22, col: k.glow };
    shr = 3;
  } else if (k.f === 'flowers') {
    const cols = [P.red[4], P.gold[4], P.purple[4], P.cloth[5], P.blue[4], hex('#e06bb5')];
    for (let i = 0; i < 11; i++) {
      const x = 2 + Math.floor(r() * 14), y = 6 + Math.floor(r() * 10), c = cols[Math.floor(r() * cols.length)];
      s.set(x, y + 1, P.grass[3]); s.set(x, y + 2, P.grass[2]);
      if (!winter) { s.set(x, y, c); if (r() > .5) s.set(x + 1, y, dark(c, .75)); }
    }
    shr = 0;
  } else if (k.f === 'reeds') {
    for (let i = 0; i < 7; i++) {
      const x = 3 + Math.floor(r() * 12), h = 6 + Math.floor(r() * 7);
      for (let j = 0; j < h; j++) s.set(x + (j > h - 3 && i % 2 ? 1 : 0), 16 - j, (winter ? P.savanna : P.grassLoam)[2 + (i % 3)]);
      if (i % 2) { s.set(x, 16 - h, P.leather[2]); s.set(x, 15 - h, P.leather[3]); s.set(x, 14 - h, P.leather[1]); }
    }
    shr = 0;
  } else if (k.f === 'stump') {
    s.cyl(5, 10, 8, 6, P.wood, { tex: (i, j) => hash(i, j >> 1, seed) > .7 ? -1 : 0 });
    s.disc(9, 10, 4, 2.2, (x, y, nx, ny) => P.plank[nx * nx + ny * ny < .25 ? 3 : nx * nx + ny * ny < .6 ? 5 : 4]);
    s.set(4, 16, P.wood[2]); s.set(13, 16, P.wood[1]); s.set(3, 16, P.wood[3]);
    if (winter) s.snowCap(1);
  } else if (k.f === 'logs') {
    const log = (x, y, w, ramp) => {
      for (let i = 0; i < w; i++) for (let j = 0; j < 4; j++) s.set(x + i, y + j, ramp[[4, 3, 2, 1][j] - (hash(i >> 1, j, seed) > .7 ? 1 : 0)]);
      s.set(x, y + 1, P.plank[5]); s.set(x, y + 2, P.plank[3]); s.set(x + w - 1, y + 1, ramp[1]);
    };
    log(1, 12, 14, P.wood); log(4, 8, 12, P.woodGrey);
    for (let i = 0; i < 6; i++) s.set(3 + r() * 12, 8 + (i & 1) * 4, winter ? P.snow[4] : P.moss[3 + (i % 3)]);
    if (winter) s.snowCap(1);
  } else if (k.f === 'shroom') {
    const caps = k.fat ? [[9, 15, 4, 3, 4]] : k.tall ? [[6, 15, 2, 6, 3], [11, 15, 2.4, 7, 4], [14, 16, 1.6, 4, 2]] : [[5, 15, 2.6, 2.2, 3], [10, 16, 3.4, 2.6, 5], [14, 14, 2, 1.8, 2]];
    for (const [x, by, cr, ch, sh] of caps) {
      for (let j = 0; j < sh; j++) { s.set(x, by - j, k.stem[3]); if (cr > 2.2) s.set(x - 1, by - j, k.stem[4]); if (k.fat) s.set(x + 1, by - j, k.stem[2]); }
      const cy = by - sh - (k.tall ? ch * .5 : 0);
      for (let y = Math.floor(cy - ch); y <= cy; y++) for (let x2 = Math.floor(x - cr); x2 <= Math.ceil(x + cr); x2++) {
        const nx = (x2 + .5 - x) / (cr + .4), ny = (y + .5 - cy) / ch;
        if (nx * nx + ny * ny > 1) continue;
        let t = .55 - nx * .35 + ny * .3;
        if (k.tall && hash(x2, y, seed) > .6) t -= .3;
        s.set(x2, y, rp(k.cap, t, x2, y, .3), k.glow && !k.spots ? 150 : 0);
      }
      if (k.spots) { s.set(x - 1, cy - 1, P.cloth[5]); s.set(x + 1, cy - 2, P.cloth[5]); }
    }
    if (k.glow) s.emit = { dx: 0, dy: -5, rad: k.spots ? 16 : 26, col: k.glow };
    if (winter && !k.glow) s.snowCap(1, .4);
    shr = 4;
  }
  s.outline(dark(P.oak[0], .5));
  if (shr) s.sh = { rx: shr * 1.2, ry: shr * .5, dx: 2, dy: 0, k: .8 };
  return s;
}

const CROPS = {
  wheat: { name: 'Wheat', f: 'grain', c: P.savanna },
  rye: { name: 'Rye', f: 'grain', c: P.hay, tall: 1 },
  barley: { name: 'Wild Barley', f: 'grain', c: P.grassDry, awn: 1 },
  cabbage: { name: 'Cabbage Patch', f: 'head', c: P.birchLeaf },
  kale: { name: 'Kale Patch', f: 'head', c: P.pine, frill: 1 },
  turnip: { name: 'Turnip Bed', f: 'root', c: P.cloth, top: P.purple },
  radish: { name: 'Radish Bed', f: 'root', c: P.red, top: P.red },
  onion: { name: 'Onion Bed', f: 'root', c: P.savanna, top: P.savanna, spike: 1 },
  beans: { name: 'Bean Rows', f: 'stake', c: P.ash, pod: P.grassLoam },
  peas: { name: 'Pea Rows', f: 'stake', c: P.birchLeaf, pod: P.cloth },
  flax: { name: 'Flax Field', f: 'stalk', c: P.grassLoam, bloom: P.blue },
  cotton: { name: 'Cotton Field', f: 'stalk', c: P.oak, bloom: P.furWhite, boll: 1 },
  pumpkin: { name: 'Pumpkin Patch', f: 'gourd' },
  thyme: { name: 'Thyme Garden', f: 'mat', c: P.willow, bloom: P.purple },
  mint: { name: 'Mint Bed', f: 'mat', c: P.moss, bloom: P.cloth },
};
function mkCrop(kind, seed, season) {
  const k = CROPS[kind], r = rng(seed * 7 + 1), s = new Spr(16, 22, 8, 19);
  const B = 19;
  if (k.f === 'grain') {
    const n = k.c.length - 1;
    for (let row = 0; row < 3; row++) for (let i = 0; i < 7; i++) {
      const x = 1 + i * 2 + (row & 1), by = B - 10 + row * 5, h = (k.tall ? 9 : 7) + Math.floor(r() * 2);
      for (let j = 0; j < h; j++) s.set(x, by - j, k.c[clamp(j < h - 3 ? 1 + (i % 2) : n - (j === h - 1 ? 0 : 1), 0, n)]);
      if (k.awn) s.set(x + 1, by - h, k.c[n]);
    }
  } else if (k.f === 'head') {
    for (let row = 0; row < 2; row++) for (let i = 0; i < 2; i++) {
      const x = 4 + i * 8 + (r() - .5), y = B - 10 + row * 8;
      s.ball(x, y, 3.6, 3, row, k.c, { n: k.frill ? .7 : .25, ns: 1.3, seed: seed + i + row * 2, bias: .05 });
      if (!k.frill) { s.set(x, y - 1, k.c[k.c.length - 1]); s.set(x - 2, y + 1, k.c[1]); s.set(x + 1, y + 1, k.c[1]); }
    }
  } else if (k.f === 'root') {
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) {
      const x = 2 + i * 4 + (row & 1), y = B - 11 + row * 5;
      s.set(x, y, k.top[3]); s.set(x - 1, y, k.top[2]);
      const lf = k.spike ? P.birchLeaf : P.ash;
      s.set(x, y - 1, lf[3]); s.set(x - 1, y - 2, lf[4]); s.set(x + 1, y - 2, lf[2]); s.set(x, y - 2, lf[3]);
      if (k.spike) { s.set(x, y - 3, lf[4]); s.set(x + 1, y - 4, lf[5]); }
    }
  } else if (k.f === 'stake') {
    for (let i = 0; i < 3; i++) {
      const x = 3 + i * 5, by = B - 2 + (i & 1) * 2;
      for (let j = 0; j < 13; j++) s.set(x, by - j, P.plank[j % 3 ? 3 : 2]);
      for (let j = 1; j < 12; j++) {
        const sx = x + (j % 4 < 2 ? -1 : 1);
        s.set(sx, by - j, k.c[2 + (j % 3)]); if (j % 3 === 0) s.set(sx + (sx < x ? -1 : 1), by - j, k.c[4]);
        if (j % 5 === 2) s.set(sx, by - j + 1, k.pod[k.pod.length - 1]);
      }
    }
  } else if (k.f === 'stalk') {
    for (let row = 0; row < 3; row++) for (let i = 0; i < 5; i++) {
      const x = 1 + i * 3 + (row & 1), by = B - 10 + row * 5, h = 5 + Math.floor(r() * 3);
      for (let j = 0; j < h; j++) s.set(x, by - j, k.c[2 + (j & 1)]);
      s.set(x - 1, by - 2, k.c[3]);
      const b = k.bloom, bn = b.length - 1;
      s.set(x, by - h, b[bn]); if (k.boll) { s.set(x + 1, by - h, b[bn - 1]); s.set(x, by - h + 1, b[bn - 1]); s.set(x + 1, by - h + 1, b[bn - 2]); }
    }
  } else if (k.f === 'gourd') {
    for (let i = 0; i < 14; i++) s.set(1 + r() * 14, B - 12 + r() * 12, P.oak[2 + Math.floor(r() * 3)]);
    for (const [x, y, rr] of [[5, B - 8, 3.4], [11, B - 3, 4], [12, B - 11, 2.6]]) {
      s.ball(x, y, rr, rr * .8, 1, P.ember, { bias: .22, d: .3 }); s.set(x, y - rr * .8 - .5, P.oak[2]);
    }
  } else if (k.f === 'mat') {
    for (let row = 0; row < 3; row++) for (let i = 0; i < 3; i++) {
      const x = 3 + i * 5 + (row & 1), y = B - 11 + row * 5;
      s.ball(x, y, 2.6, 1.9, 0, k.c, { n: .6, ns: 1.5, seed: seed + i });
      if (r() > .3) s.set(x + (r() - .5) * 3, y - 1, k.bloom[k.bloom.length - 1]);
    }
  }
  if (season === 'winter') s.snowCap(1, .5);
  s.outline(dark(P.tilled[0], .6));
  return s;
}
