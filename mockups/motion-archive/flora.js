'use strict';
const TREES = {
  oak: { name: 'Oak Tree', shape: 'round', rx: 25, ry: 20, th: 30, tw: 8, trunk: P.wood, leaf: P.oak, fall: P.fallOrange },
  ash: { name: 'Ash Tree', shape: 'round', rx: 17, ry: 24, th: 30, tw: 6, trunk: P.woodGrey, leaf: P.ash, fall: P.fallYellow },
  apple: { name: 'Apple Tree', shape: 'round', rx: 19, ry: 15, th: 20, tw: 6, trunk: P.wood, leaf: P.ash, fall: P.fallRed, fruit: P.red },
  birch: { name: 'Birch Tree', shape: 'birch', trunk: P.birch, leaf: P.birchLeaf, fall: P.fallYellow },
  willow: { name: 'Willow Tree', shape: 'willow', rx: 24, ry: 15, th: 30, tw: 8, trunk: P.wood, leaf: P.willow, fall: P.fallYellow },
  pine: { name: 'Pine Tree', shape: 'pine', trunk: P.wood, leaf: P.pine, ever: 1 },
  yew: { name: 'Yew Tree', shape: 'round', rx: 25, ry: 15, th: 16, tw: 9, trunk: P.wood, leaf: P.pine, ever: 1, fruit: P.red },
  heartwood: { name: 'Heartwood Tree', shape: 'round', rx: 23, ry: 19, th: 30, tw: 8, trunk: P.wood, leaf: P.heart, ever: 1, glow: [.85, .42, 1] },
  frostheart: { name: 'Frostheart Pine', shape: 'pine', trunk: P.woodGrey, leaf: P.frost, ever: 1, glow: [.5, .8, 1], frosted: 1 },
  moonwood: { name: 'Moonwood Tree', shape: 'round', rx: 21, ry: 18, th: 32, tw: 6, trunk: P.birch, leaf: R('#1b2147 #2a3766 #445688 #6a7fa8 #98a8c4 #c9d2de #f4eebc'), ever: 1, glow: [.75, .8, 1], moon: 1 },
  ironwood: { name: 'Ironwood Tree', shape: 'round', rx: 27, ry: 21, th: 30, tw: 11, trunk: P.ironbark, leaf: P.ironleaf, ever: 1 },
  emberwood: { name: 'Emberwood Tree', shape: 'round', rx: 22, ry: 18, th: 28, tw: 8, trunk: P.furDark, leaf: P.ember, ever: 1, glow: [1, .5, .15], sparks: 1 },
  soulwood: { name: 'Soulwood Tree', shape: 'willow', rx: 24, ry: 15, th: 30, tw: 8, trunk: P.woodGrey, leaf: P.soul, ever: 1, glow: [.4, 1, .85] },
  witchwood: { name: 'Witchwood Tree', shape: 'dead', trunk: P.witch, tuft: P.witch, ever: 1 },
  bonewood: { name: 'Bonewood Snag', shape: 'dead', trunk: P.bone, ever: 1 },
  dead: { name: 'Dead Tree', shape: 'dead', trunk: P.woodGrey, ever: 1 },
};

function trunk2(s, cx, base, h, w, ramp, seed) {
  const n = ramp.length - 1;
  for (let j = 0; j < h; j++) {
    const y = base - j, ww = w + (j < 6 ? (6 - j) * 1.3 : 0) - (j > h * .65 ? 1 : 0), x0 = Math.round(cx - ww / 2), x1 = Math.round(cx + ww / 2);
    for (let x = x0; x < x1; x++) {
      const u = (x - x0) / Math.max(1, x1 - x0 - 1);
      let k = u < .2 ? n - 1 : u < .6 ? n - 2 : u < .84 ? n - 3 : n - 4;
      if (noise(x * 1.3 + (y >> 3) * 5, y * .16, seed) > .64) k -= 1;
      if (u < .14 && hash(x, y >> 1, seed) > .55) k = n;
      if (ramp === P.birch) { k = u < .25 ? 4 : u < .7 ? 3 : 2; if (hash(x >> 1, Math.floor(y / 3), seed + 3) > .82) k = 0; }
      s.set(x, y, ramp[clamp(k, 0, n)]);
    }
  }
  s.thick(cx - w / 2 - 1, base - 3, cx - w / 2 - 6, base + 1, 2, ramp, n - 2);
  s.thick(cx + w / 2, base - 3, cx + w / 2 + 5, base + 1, 2, ramp, n - 4);
}
function limb(s, x0, y0, x1, y1, w, ramp, r, depth) {
  s.thick(x0, y0, x1, y1, w, ramp, ramp.length - 3);
  if (!depth && s.tips) s.tips.push([x1, y1]);
  if (depth > 0) for (let i = 0; i < 2; i++) {
    const t = .45 + r() * .4, bx = x0 + (x1 - x0) * t, by = y0 + (y1 - y0) * t, a = Math.atan2(y1 - y0, x1 - x0) + (i ? 1 : -1) * (.5 + r() * .5), l = Math.hypot(x1 - x0, y1 - y0) * (.45 + r() * .3);
    limb(s, bx, by, bx + Math.cos(a) * l, by + Math.sin(a) * l, Math.max(1, w - 1), ramp, r, depth - 1);
  }
}
function canopy(s, cx, cy, rx, ry, ramp, seed, o) {
  o = o || {};
  const r = rng(seed * 13 + 1), N = o.n || Math.round(rx * ry * .13), cr0 = o.cr || 4.6, R = Math.min(rx, ry);
  for (let i = 0; i < N; i++) {
    const a = r() * 6.283, d = Math.sqrt(r()) * .97, u = Math.cos(a) * d, v = Math.sin(a) * d, z = Math.sqrt(Math.max(0, 1 - u * u - v * v));
    const l = u * LV[0] + v * LV[1] + z * LV[2], cr = cr0 * (.72 + r() * .62);
    s.ball(cx + u * rx, cy + v * ry, cr * 1.18, cr, (o.z || 0) + z * R, ramp, { bias: l * .4 + (r() - .5) * .1 + (o.b || 0), amp: .46, d: .16, n: .14, ns: .9, seed: seed + i, e: o.e });
  }
}

function mkTree(kind, seed, season) {
  const k = TREES[kind], r = rng(seed * 31 + 7), s = new Spr(76, 104, 38, 98), cx = 38, base = 98;
  let leaf = k.leaf, bare = false;
  if (!k.ever && season === 'autumn') leaf = [k.fall, P.fallOrange, P.fallRed][Math.floor(r() * 2.2)] || k.fall;
  if (!k.ever && season === 'winter') bare = true;
  let shR = 18;
  if (k.shape === 'dead' || bare) {
    const h = 42 + r() * 10;
    s.tips = [];
    trunk2(s, cx, base, h, 7, k.trunk, seed);
    for (let i = 0; i < 5; i++) { const side = i % 2 ? 1 : -1, y0 = base - h + 4 + i * 5 + r() * 3, len = 12 + r() * 10; limb(s, cx, y0, cx + side * len, y0 - len * (.6 + r() * .5), 2, k.trunk, r, 2); }
    limb(s, cx, base - h + 2, cx + (r() - .5) * 8, base - h - 16, 3, k.trunk, r, 2);
    if (k.tuft) for (let i = 0; i < s.tips.length; i += 2) canopy(s, s.tips[i][0], s.tips[i][1], 6.5, 4.6, k.tuft, seed + i, { cr: 3, n: 5 });
    shR = 8;
  } else if (k.shape === 'pine') {
    trunk2(s, cx, base, 12, 6, k.trunk, seed);
    const top = base - 84 + Math.floor(r() * 5), n = leaf.length - 1;
    for (let i = 4; i >= 0; i--) {
      const y0 = top + i * 14, y1 = y0 + 26, hw = 7 + i * 4.8;
      for (let y = y0; y <= y1; y++) {
        const f = (y - y0) / (y1 - y0), w = hw * f + 1.2;
        for (let x = Math.ceil(cx - w); x <= Math.floor(cx + w - .5); x++) {
          if (y1 - y < hash(x >> 1, i, seed) * 5) continue;
          const side = x < cx ? x + y : x - y;
          let t = .6 - ((x - cx) / hw) * .4 - f * .16 + (noise(x * .7, y * .7, seed) - .5) * .22;
          if (((side % 4) + 4) % 4 === 0) t += .13; else if (((side % 4) + 4) % 4 === 2) t -= .07;
          if (y >= y1 - 5) t -= .22;
          s.set(x, y, leaf[clamp(Math.round(t * n), 0, n)]);
        }
      }
    }
    shR = 16;
  } else if (k.shape === 'birch') {
    const h = 62 + Math.floor(r() * 8);
    trunk2(s, cx, base, h, 5, k.trunk, seed);
    for (let i = 0; i < 6; i++) {
      const cy = base - h + 4 + i * 8.5, side = i % 2 ? 1 : -1, rr = 9.5 + r() * 3 - Math.abs(i - 2) * .5;
      if (i > 0) s.thick(cx, cy + 4, cx + side * 6, cy, 1, k.trunk, 2);
      canopy(s, cx + side * (5 + r() * 3), cy, rr * 1.15, rr * .85, leaf, seed + i * 7, { cr: 3.8, z: i });
    }
    shR = 12;
  } else if (k.shape === 'willow') {
    trunk2(s, cx, base, k.th, k.tw, k.trunk, seed);
    const cy = base - k.th - 10;
    canopy(s, cx, cy, k.rx, k.ry, leaf, seed, { cr: 4.4 });
    const n = leaf.length - 1;
    for (let x = cx - k.rx; x <= cx + k.rx; x++) {
      if (hash(x >> 1, seed, 2) < .18) continue;
      let y = cy - 4;
      while (y < base && !(s.get(x, y) && s.z[y * s.w + x] > -1e8)) y++;
      while (y < base && s.get(x, y) && s.z[y * s.w + x] > -1e8) y++;
      const len = 10 + hash(x >> 1, seed, 4) * 22 * (1 - Math.abs(x - cx) / (k.rx * 1.7)), kk = hash(x >> 1, seed, 6) < .5 ? n - 2 : n - 3;
      for (let j = 0; j < len && y + j < base - 2; j++) s.set(x, y + j, leaf[clamp(kk + (j > len - 4 ? 1 : 0) - ((x & 1) ? 1 : 0), 0, n)]);
    }
    shR = 22;
  } else {
    trunk2(s, cx, base, k.th + 6, k.tw, k.trunk, seed);
    const cy = base - k.th - k.ry * .55;
    limb(s, cx - 1, base - k.th + 2, cx - k.rx * .5, cy + 4, 3, k.trunk, r, 0);
    limb(s, cx + 1, base - k.th + 4, cx + k.rx * .5, cy + 6, 3, k.trunk, r, 0);
    canopy(s, cx, cy, k.rx, k.ry, leaf, seed, { e: k.glow && !k.moon ? 60 : 0, b: k.moon ? -.16 : 0 });
    for (let i = 0; i < 4; i++) {
      const a = .5 + i * 1.7 + r() * .8, d = .62;
      canopy(s, cx + Math.cos(a) * k.rx * d, cy + Math.sin(a) * k.ry * d + 2, k.rx * .46, k.ry * .46, leaf, seed + 40 + i, { z: Math.sin(a) * 5 + 3, e: k.glow && !k.moon ? 60 : 0, b: k.moon ? -.16 : 0 });
    }
    shR = k.rx * 1.02;
  }
  const leafy = i => s.z[i] > -1e8;
  for (let x = 0; x < s.w; x++) { let under = 0; for (let y = 0; y < s.h; y++) { const i = y * s.w + x; if (leafy(i)) under = 7; else if (s.c[i] && under > 0) { s.c[i] = dark(s.c[i], under > 3 ? .55 : .75); under--; } } }
  if (k.fruit && !bare) for (let i = 0; i < 16; i++) {
    const x = Math.floor(cx + (r() - .5) * k.rx * 1.7), y = Math.floor(base - k.th - k.ry * 1.4 + r() * k.ry * 1.7);
    if (s.ok(x, y) && leafy(y * s.w + x) && s.get(x + 1, y + 2)) { s.set(x, y, k.fruit[4]); s.set(x + 1, y, k.fruit[3]); s.set(x, y + 1, k.fruit[2]); s.set(x + 1, y + 1, k.fruit[1]); }
  }
  if (k.glow) {
    const top = leaf[leaf.length - 1], top2 = leaf[leaf.length - 2];
    for (let i = 0; i < s.c.length; i++) if (s.c[i] === top) s.e[i] = 200; else if (s.c[i] === top2) s.e[i] = 110;
    if (k.moon) { for (let i = 0; i < s.c.length; i++) if (s.c[i] === top2 || s.c[i] === top) s.e[i] = 0; const orb = hex('#fff6c8'), halo = hex('#e6d98f'); for (let i = 0, tries = 0; i < 8 && tries < 200; tries++) { const x = Math.floor(cx + (r() - .5) * k.rx * 1.8), y = Math.floor(base - k.th - k.ry * 1.4 + r() * k.ry * 1.8); if (!s.ok(x, y) || !leafy(y * s.w + x) || !leafy((y + 3) * s.w + x + 2)) continue; i++; for (const [dx, dy] of [[1, 0], [0, 1], [2, 1], [1, 2]]) s.set(x + dx, y + dy, halo, 210); s.set(x + 1, y + 1, orb, 255); } }
    s.emit = { dx: 0, dy: -50, rad: 110, col: k.glow, pulse: 1 };
  }
  if (k.sparks) for (let i = 0; i < 22; i++) { const x = Math.floor(cx + (r() - .5) * 50), y = Math.floor(8 + r() * 50); s.set(x, y, P.fire[3 + (i & 1)], 255); if (i % 3 === 0) s.set(x + 1, y, P.fire[2], 255); }
  if (season === 'winter' || k.frosted) {
    if (bare || k.shape === 'dead') s.snowCap(2, .2);
    else {
      const hi = leaf[leaf.length - 1], hi2 = leaf[leaf.length - 2];
      if (season === 'winter') for (let i = 0; i < s.c.length; i++) { if (s.c[i] === hi) s.c[i] = P.snow[4]; else if (s.c[i] === hi2 && hash(i, seed, 3) < .7) s.c[i] = P.snow[3]; }
      s.snowCap(3, .1);
    }
  }
  s.outline(dark(k.shape === 'dead' || bare ? k.trunk[0] : leaf[0], .5));
  s.sh = { rx: shR * 1.15, ry: shR * .46, dx: 8, dy: 0, k: bare || k.shape === 'dead' ? .5 : 1 };
  s.sway = bare || k.shape === 'dead' ? .9 : k.shape === 'pine' ? 1.7 : 2.6;
  if (!bare && k.shape !== 'dead') s.leaf = leaf;
  return s;
}

const PLANTS = {
  bush: { name: 'Bush', f: 'bush', leaf: P.oak },
  berry: { name: 'Berry Bush', f: 'bush', leaf: P.ash, dots: P.red },
  flowers: { name: 'Wildflower Patch', f: 'flowers' },
  fern: { name: 'Fern', f: 'fern' },
  reeds: { name: 'Reeds', f: 'reeds' },
  stump: { name: 'Tree Stump', f: 'stump' },
  logs: { name: 'Fallen Logs', f: 'logs' },
  mushroom: { name: 'Mushroom Patch', f: 'shroom', cap: P.leather, stem: P.cloth },
  glowcap: { name: 'Glowcap', f: 'shroom', cap: P.soul, stem: P.moon, glow: [.3, 1, .85] },
  madness: { name: 'Spore of Madness', f: 'shroom', cap: P.red, stem: P.cloth, spots: 1 },
  bolete: { name: 'Nightshade Bolete', f: 'shroom', cap: P.witch, stem: P.furWhite, fat: 1 },
  morel: { name: "Witch's Morel", f: 'shroom', cap: P.furBrown, stem: P.cloth, tall: 1 },
  scrub: { name: 'Scrub Patch', f: 'scrub' },
  bloodroot: { name: 'Bloodroot', f: 'herb', leaf: P.green, bloom: P.red },
  mandrake: { name: 'Mandrake', f: 'herb', leaf: P.oak, bloom: P.purple, root: 1 },
  emberbloom: { name: 'Emberbloom', f: 'herb', leaf: P.furDark, bloom: P.fire, glow: [1, .5, .15] },
};
function trimPeaks(s, rad, xMax) {
  const top = x => { for (let y = 0; y < s.h; y++) if (s.get(x, y)) return y; return s.h; };
  const t = []; for (let x = 0; x < s.w; x++) t.push(top(x));
  const low = x => { let m = 0; for (let i = Math.max(0, x - rad); i <= Math.min(s.w - 1, x + rad); i++) m = Math.max(m, t[i]); return m; };
  const open = []; for (let x = 0; x < s.w; x++) { let m = s.h; for (let i = Math.max(0, x - rad); i <= Math.min(s.w - 1, x + rad); i++) m = Math.min(m, low(i)); open.push(m); }
  for (let x = 0; x <= xMax; x++) for (let y = 0; y < open[x]; y++) s.set(x, y, null);
}

function mkPlant(kind, seed, season) {
  const k = PLANTS[kind], r = rng(seed * 13 + 3), s = new Spr(40, 40, 20, 34), B = 34;
  const winter = season === 'winter', fall = season === 'autumn';
  let shr = 10;
  if (k.f === 'bush') {
    const leaf = fall ? P.fallOrange : k.leaf;
    if (winter) { for (let i = 0; i < 9; i++) limb(s, 20, B, 20 + (i - 4) * 3 + (r() - .5) * 2, B - 12 - r() * 6, 1, P.wood, r, 1); s.snowCap(2, .3); } else {
      canopy(s, 20, B - 9, 13, 9, leaf, seed, { cr: 3.6 });
      canopy(s, 11, B - 5, 7, 5, leaf, seed + 5, { cr: 3.2, z: 3 }); canopy(s, 29, B - 5, 7, 5, leaf, seed + 9, { cr: 3.2, z: 3 });
      if (!k.dots) trimPeaks(s, 4, 19);
      if (k.dots) for (let i = 0; i < 12; i++) { const x = 8 + Math.floor(r() * 24), y = B - 16 + Math.floor(r() * 14); if (s.get(x, y) && s.get(x + 1, y + 1)) { s.set(x, y, k.dots[4]); s.set(x + 1, y, k.dots[3]); s.set(x, y + 1, k.dots[2]); s.set(x + 1, y + 1, k.dots[1]); } }
    }
  } else if (k.f === 'flowers') {
    for (let i = 0; i < 9; i++) {
      const x = 6 + Math.floor(r() * 28), y = B - 3 - Math.floor(r() * 16), hh = 5 + Math.floor(r() * 6), c = FLW[Math.floor(r() * FLW.length)];
      for (let j = 0; j < hh; j++) s.set(x + (j > hh - 3 && i % 2 ? 1 : 0), y - j + hh, P.grass[2 + (j & 1)]);
      s.set(x - 2, y + hh - 2, P.grass[4]); s.set(x - 1, y + hh - 1, P.grass[3]);
      if (!winter) { const fx = x + (i % 2 ? 1 : 0); s.set(fx, y, P.gold[4]); s.set(fx - 1, y, c); s.set(fx + 1, y, dark(c, .78)); s.set(fx, y - 1, lit(c, 1.15)); s.set(fx, y + 1, dark(c, .72)); }
    }
    shr = 0;
  } else if (k.f === 'fern') {
    const g = fall ? P.fallYellow : P.grassLoam;
    for (let i = 0; i < 7; i++) { const a = -.35 - i / 6 * 2.45, l = 11 + r() * 5; for (let t = 0; t < l; t++) { const x = 20 + Math.cos(a) * t * 1.2, y = B - 1 + Math.sin(a) * t - t * t * .02 * Math.sin(a) * -1; s.set(x, y, g[3]); if (t > 2 && t % 2 === 0) { s.set(x + (Math.cos(a) > 0 ? 0 : 0), y - 1, g[4]); s.set(x, y + 1, g[1]); s.set(x - Math.sign(Math.cos(a)), y - 2, g[4 - (t % 4 === 0 ? 1 : 0)]); } } }
    shr = 7;
  } else if (k.f === 'reeds') {
    const g = winter ? P.savanna : P.grassLoam;
    for (let i = 0; i < 12; i++) {
      const x = 5 + Math.floor(r() * 30), h = 14 + Math.floor(r() * 14), lean = (r() - .5) * .25;
      for (let j = 0; j < h; j++) s.set(x + Math.round(lean * j), B - j, g[clamp(1 + (i % 3) + (j > h * .6 ? 1 : 0), 0, 4)]);
      if (i % 3 === 0) { const tx = x + Math.round(lean * h); s.rect(tx, B - h - 5, 2, 6, P.leather[2]); s.rect(tx, B - h - 5, 1, 6, P.leather[4]); s.set(tx, B - h - 6, g[3]); }
      else s.set(x + Math.round(lean * h) + 1, B - h + 1, g[4]);
    }
    shr = 0;
  } else if (k.f === 'stump') {
    s.tube(11, B - 12, 18, 12, (x, y) => P.wood[3 - (noise(x * 1.3, y * .2, seed) > .66 ? 1 : 0)]);
    s.oval(20, B - 12, 9.5, 4.2, (x, y, nx, ny) => { const q = Math.hypot(nx, ny); return P.plank[q < .2 ? 2 : (Math.floor(q * 5) & 1) ? 5 : 4]; });
    s.thick(10, B - 2, 5, B + 1, 2, P.wood, 3); s.thick(29, B - 2, 34, B + 1, 2, P.wood, 2); s.thick(18, B, 16, B + 3, 2, P.wood, 3);
    s.line(18, B - 14, 24, B - 11, P.plank[1]);
    if (winter) s.snowCap(2); else for (let i = 0; i < 6; i++) s.set(11 + r() * 7, B - 2 - r() * 5, P.moss[3 + (i & 1)]);
  } else if (k.f === 'logs') {
    const log = (x, y, w, ramp, sd) => {
      for (let i = 0; i < w; i++) for (let j = 0; j < 8; j++) s.set(x + i, y + j, ramp[clamp([4, 5, 4, 3, 3, 2, 1, 0][j] - (noise(i * .25, j * 1.2, sd) > .66 ? 1 : 0), 0, 5)]);
      s.oval(x + 1, y + 4, 3, 4, (px, py, nx, ny) => P.plank[Math.hypot(nx, ny) < .4 ? 3 : 5]);
      for (let j = 1; j < 7; j++) s.set(x + w, y + j, ramp[0]);
    };
    log(4, B - 8, 32, P.wood, seed); log(9, B - 15, 24, P.woodGrey, seed + 3);
    s.thick(22, B - 15, 26, B - 21, 2, P.woodGrey, 3);
    for (let i = 0; i < 14; i++) { const x = 8 + r() * 26, y = B - 15 + (i & 1) * 7; s.set(x, y, winter ? P.snow[4] : P.moss[3 + (i % 3)]); s.set(x + 1, y, winter ? P.snow[3] : P.moss[2]); }
    if (winter) s.snowCap(2);
    shr = 16;
  } else if (k.f === 'shroom') {
    for (const [x, by, cr, ch, sh] of (k.fat ? [[20, B, 11, 7.5, 9]] : k.tall ? [[11, B - 1, 4.4, 9, 6], [22, B + 1, 5.4, 12, 8], [31, B - 2, 3.6, 7, 4]] : [[10, B - 1, 5.5, 4.5, 7], [22, B + 1, 7.5, 5.5, 10], [31, B - 3, 4.2, 3.6, 5]])) {
      s.tube(x - (k.fat ? 3 : 1), by - sh, k.fat ? 7 : 3, sh + 1, () => k.stem[3]);
      for (let i = -cr + 1; i < cr - 1; i++) s.set(x + i, by - sh, k.stem[1]);
      const cy = by - sh;
      for (let y = Math.floor(cy - ch); y <= cy; y++) for (let x2 = Math.floor(x - cr); x2 <= Math.ceil(x + cr); x2++) {
        const nx = (x2 + .5 - x) / (cr + .4), ny = (y + .5 - cy) / ch;
        if (nx * nx + ny * ny > 1) continue;
        const n = k.cap.length - 1;
        s.set(x2, y, k.cap[clamp(Math.round(n * (.62 - nx * .34 + ny * .34)) - (k.tall && (x2 + y) % 3 === 0 ? 2 : 0), 0, n)], k.glow ? 170 : 0);
      }
      if (k.spots) { s.rect(x - 2, cy - 3, 2, 1, P.cloth[5]); s.set(x + 2, cy - 4, P.cloth[5]); s.set(x + 3, cy - 2, P.cloth[4]); }
    }
    if (k.glow) s.emit = { dx: 0, dy: -8, rad: 50, col: k.glow };
    if (winter && !k.glow) s.snowCap(1, .4);
    shr = 9;
  }
  if (k.f === 'scrub') {
    for (let i = 0; i < 16; i++) { const a = -.3 - r() * 2.5, l = 8 + r() * 10, x1 = 20 + Math.cos(a) * l * 1.2, y1 = B + Math.sin(a) * l; s.thick(20 + (r() - .5) * 6, B, x1, y1, 1, i & 1 ? P.wood : P.savanna, 3); if (!winter) { s.set(x1, y1, P.grassDry[4]); s.set(x1 + 1, y1 - 1, P.grassDry[3]); s.set(x1 - 1, y1, P.grassDry[2]); } }
    if (winter) s.snowCap(1, .4);
    shr = 8;
  }
  if (k.f === 'herb') {
    const n = k.leaf.length - 1, e = k.glow ? 255 : 0, bl = k.bloom, bn = bl.length - 1;
    for (let i = 0; i < 9; i++) { const a = -.15 - i / 8 * 2.85, l = 7 + r() * 5; for (let t = 0; t < l; t++) { const x = 20 + Math.cos(a) * t * 1.3, y = B - 1 + Math.sin(a) * t * .8 - Math.sin(t / l * 3.14) * 3; s.set(x, y, k.leaf[clamp(n - 1 - (i % 3), 0, n)]); if (t > 1 && t < l - 1) s.set(x, y + 1, k.leaf[clamp(n - 3, 0, n)]); } }
    s.thick(20, B - 4, 20, B - 17, 1, k.leaf, n - 2); s.set(21, B - 9, k.leaf[n - 1]); s.set(22, B - 10, k.leaf[n - 1]); s.set(19, B - 12, k.leaf[n - 2]); s.set(18, B - 13, k.leaf[n - 1]);
    for (const [dx, dy, kk] of [[-2, 0, bn - 1], [2, 0, bn - 2], [0, -2, bn], [0, 2, bn - 2], [-1, -1, bn - 1], [1, -1, bn - 1], [-1, 1, bn - 2], [1, 1, bn - 3], [-1, 0, bn - 1], [1, 0, bn - 2], [0, -1, bn], [0, 1, bn - 2]]) s.set(20 + dx, B - 19 + dy, bl[clamp(kk, 0, bn)], e);
    s.set(20, B - 19, P.gold[4], e);
    if (k.root) { s.oval(20, B, 3.4, 2.4, () => P.cloth[3]); s.set(19, B - 1, P.cloth[5]); s.set(18, B + 1, P.ink); s.set(21, B + 1, P.ink); }
    if (k.glow) s.emit = { dx: 0, dy: -16, rad: 44, col: k.glow };
    shr = 6;
  }
  s.sway = { bush: 1.5, flowers: 1.6, fern: 1.8, reeds: 2.6, scrub: 1.3, herb: 1.2 }[k.f] || 0;
  s.outline(dark(P.oak[0], .5));
  if (shr) s.sh = { rx: shr * 1.2, ry: shr * .42, dx: 4, dy: 0, k: .8 };
  return s;
}

const CROPS = {
  wheat: { name: 'Wheat', f: 'grain', c: P.savanna },
  cabbage: { name: 'Cabbage Patch', f: 'head', c: P.birchLeaf },
  turnip: { name: 'Turnip Bed', f: 'root', c: P.cloth, top: P.purple },
  beans: { name: 'Bean Rows', f: 'stake', c: P.ash, pod: P.grassLoam },
  pumpkin: { name: 'Pumpkin Patch', f: 'gourd' },
  flax: { name: 'Flax Field', f: 'stalk', c: P.grassLoam, bloom: P.blue },
};
function mkCrop(kind, seed, season) {
  const k = CROPS[kind], r = rng(seed * 7 + 1), s = new Spr(34, 48, 17, 40), B = 40;
  if (k.f === 'grain') {
    const n = k.c.length - 1;
    for (let row = 0; row < 4; row++) for (let i = 0; i < 9; i++) {
      const x = 2 + i * 3.4 + (row & 1) * 1.6 + (r() - .5), by = B - 24 + row * 8, h = 13 + Math.floor(r() * 4), lean = (r() - .5) * .2;
      for (let j = 0; j < h; j++) s.set(x + lean * j, by - j, k.c[j < h - 6 ? 1 + (i & 1) : 2]);
      const tx = Math.round(x + lean * h);
      for (let j = 0; j < 6; j++) { s.set(tx, by - h + j, k.c[n - (j > 3 ? 1 : 0)]); if (j % 2 === 0 && j < 5) { s.set(tx - 1, by - h + j + 1, k.c[n - 1]); s.set(tx + 1, by - h + j + 1, k.c[n - 2]); } }
      s.set(tx, by - h - 1, k.c[n]);
    }
  } else if (k.f === 'head') {
    for (let row = 0; row < 2; row++) for (let i = 0; i < 2; i++) {
      const x = 8.5 + i * 16 + (r() - .5) * 2, y = B - 21 + row * 15, n = k.c.length - 1;
      for (let a = 0; a < 6; a++) { const t = a / 6 * 6.283 + .4; s.ball(x + Math.cos(t) * 4.6, y + Math.sin(t) * 3.4, 3.6, 2.8, 0, k.c, { bias: -.14, d: .2, amp: .7 }); }
      s.ball(x, y - 1, 4.6, 4, 2, k.c, { bias: .16, d: .2 });
      s.line(x - 2, y - 2, x + 1, y + 1, k.c[n - 2]); s.set(x - 1, y - 3, k.c[n]);
    }
  } else if (k.f === 'root') {
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) {
      const x = 4 + i * 8 + (row & 1) * 3, y = B - 22 + row * 10;
      s.ball(x, y, 2.6, 2.2, 0, k.top, { bias: .1, d: .2 }); s.set(x - 1, y + 1, k.c[4]); s.set(x, y + 1, k.c[3]);
      for (let a = 0; a < 5; a++) { const t = -2.7 + a * .58, l = 5 + r() * 3; s.line(x, y - 2, x + Math.cos(t) * l, y - 2 + Math.sin(t) * l, P.ash[2 + (a % 3)]); }
    }
  } else if (k.f === 'stake') {
    for (let i = 0; i < 3; i++) {
      const x = 6 + i * 11, by = B - 3 + (i & 1) * 3;
      s.thick(x, by, x, by - 30, 2, P.plank, 3);
      for (let j = 2; j < 28; j++) {
        const sx = x + Math.round(Math.sin(j * .7) * 2.4);
        s.set(sx, by - j, k.c[2 + (j % 3)]);
        if (j % 3 === 0) { const d = sx < x ? -1 : 1; s.set(sx + d, by - j, k.c[4]); s.set(sx + d * 2, by - j - 1, k.c[5]); s.set(sx + d * 2, by - j, k.c[3]); }
        if (j % 7 === 3) { s.set(sx + 1, by - j + 1, k.pod[4]); s.set(sx + 1, by - j + 2, k.pod[3]); s.set(sx + 1, by - j + 3, k.pod[2]); }
      }
    }
  } else if (k.f === 'gourd') {
    for (let i = 0; i < 9; i++) { const x = 3 + r() * 28, y = B - 24 + r() * 24; s.ball(x, y, 3.4, 2.4, 0, P.oak, { d: .2, amp: .7 }); s.set(x, y, P.oak[5]); }
    for (let i = 0; i < 20; i++) s.set(2 + r() * 30, B - 24 + r() * 24, P.oak[2]);
    for (const [x, y, rr] of [[9, B - 15, 6.4], [23, B - 5, 7.4], [25, B - 21, 5]]) {
      s.ball(x, y, rr, rr * .82, 3, P.ember, { bias: .2, d: .2 });
      for (const dx of [-.55, 0, .55]) for (let j = -rr * .6; j < rr * .6; j++) { const c = s.get(Math.round(x + dx * rr), Math.round(y + j)); if (c) s.set(x + dx * rr, y + j, dark(c, .78)); }
      s.rect(Math.round(x), Math.round(y - rr * .82 - 2), 2, 3, P.oak[2]); s.set(Math.round(x) + 2, Math.round(y - rr * .82 - 2), P.oak[4]);
    }
  }
  if (k.f === 'stalk') for (let row = 0; row < 4; row++) for (let i = 0; i < 8; i++) {
    const x = Math.round(2 + i * 3.8 + (row & 1) * 1.8), by = B - 24 + row * 8, h = 11 + Math.floor(r() * 4), b = k.bloom, bn = b.length - 1;
    for (let j = 0; j < h; j++) s.set(x, by - j, k.c[2 + (j & 1)]);
    s.set(x - 1, by - 4, k.c[4]); s.set(x + 1, by - 7, k.c[3]);
    s.set(x, by - h, b[bn]); s.set(x - 1, by - h, b[bn - 1]); s.set(x + 1, by - h, b[bn - 2]); s.set(x, by - h - 1, b[bn]); s.set(x, by - h + 1, P.gold[4]);
  }
  s.sway = { grain: 2.4, stalk: 2.2, stake: 1 }[k.f] || 0;
  if (season === 'winter') s.snowCap(1, .5);
  s.outline(dark(P.tilled[0], .6));
  return s;
}

function shard(s, bx, by, w, h, lean, ramp, e) {
  const n = ramp.length - 1;
  for (let j = 0; j < h; j++) {
    const y = by - j, f = j / h, hw = f > .72 ? w * (1 - f) / .28 * .5 : w * .5, cx = bx + lean * j;
    for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
      const u = (x - cx) / (hw + .01);
      let k = u < -.45 ? n - 1 : u < -.1 ? n - 2 : u < .4 ? n - 3 : n - 4;
      if (f > .72) k = u < 0 ? n : n - 2;
      if (x === Math.round(cx - hw)) k = n;
      if (Math.abs(u + .1) < .12 && f < .72) k = n - 1;
      if (hash(x, y >> 2, 5) > .93) k += 1;
      s.set(x, y, ramp[clamp(k, 0, n)], e && k >= n - 2 ? e : 0);
    }
  }
}
const ROCKS = {
  boulder: { name: 'Stone Outcrop' }, mound: { name: 'Barrow Mound', f: 'mound' }, den: { name: 'Wolf Den', f: 'mound' }, warren: { name: 'Goblin Warren', f: 'mound' },
  nest: { name: 'Harpy Roost', f: 'nest' }, cairn: { name: 'Sunken Cairn', f: 'cairn' }, geode: { name: 'Star Geode', f: 'geode' }, vent: { name: 'Mana Crystal Vent', gem: 'mana', inf: 1, vent: 1 },
  amethyst: { name: 'Amethyst Crystals', gem: 'amethyst' }, emerald: { name: 'Emerald Crystals', gem: 'emerald' }, ruby: { name: 'Ruby Crystals', gem: 'ruby' }, topaz: { name: 'Topaz Crystals', gem: 'topaz' }, sapphire: { name: 'Infused Sapphire', gem: 'sapphire', inf: 1 },
};
const GLOW = { amethyst: [.7, .4, 1], ruby: [1, .3, .3], sapphire: [.3, .5, 1], emerald: [.3, 1, .5], topaz: [1, .7, .3], mana: [.4, .8, 1], star: [1, 1, .6] };
function mkRock(kind, seed, season) {
  const k = ROCKS[kind], r = rng(seed * 17 + 5), s = new Spr(44, 48, 22, 40), B = 40, winter = season === 'winter';
  const cut = () => { for (let x = 0; x < 44; x++) for (let y = B + 1; y < 48; y++) s.set(x, y, null); };
  if (k.gem) {
    const ramp = GEM[k.gem], e = k.inf ? 210 : 0;
    s.ball(22, B - 3, 14, 5, 0, k.vent ? P.rock : P.rockWarm, { facet: 5, seed, d: .15 });
    shard(s, 13, B - 3, 6, 15, -.24, ramp, e); shard(s, 31, B - 3, 6, 18, .26, ramp, e); shard(s, 22, B - 2, 9, k.vent ? 33 : 29, .03, ramp, e);
    shard(s, 17, B, 4, 9, -.12, ramp, e); shard(s, 27, B, 4, 8, .16, ramp, e);
    if (k.vent) for (let i = 0; i < 9; i++) { const x = 8 + r() * 28, y = 2 + r() * 14; s.set(x, y, P.mana[4 + (i & 1)], 255); if (i % 3 === 0) s.set(x, y + 1, P.mana[3], 255); }
    s.emit = { dx: 0, dy: -16, rad: k.vent ? 90 : e ? 60 : 22, col: GLOW[k.gem], pulse: e ? 1 : 0 };
    s.sh = { rx: 16, ry: 5, dx: 4, dy: 0 };
  } else if (k.f === 'mound') {
    s.ball(22, B - 9, 20, 14, 0, P.soil, { n: .4, ns: .4, d: .14 }); cut();
    if (!winter) for (let i = 0; i < 90; i++) { const x = 4 + Math.floor(r() * 36), y = B - 23 + Math.floor(r() * 13); if (s.get(x, y)) { s.set(x, y, P.grassLoam[2 + Math.floor(r() * 3)]); if (i % 3 === 0 && s.get(x, y - 1)) { s.set(x, y - 1, P.grassLoam[4]); s.set(x, y - 2, P.grassLoam[3]); } } }
    if (kind === 'mound') {
      for (const x of [13, 28]) s.slab(x, B - 17, 4, 2, 16, M.flat(P.stone, 5, 3), M.flat(P.stone, 4, 5)); s.slab(11, B - 21, 23, 3, 4, M.flat(P.stone, 5, 7), M.flat(P.stone, 4, 9));
      s.fill(17, B - 14, 11, 15, (x, y, i, j) => j < 2 ? P.stone[0] : P.ink); s.rect(15, B, 15, 1, P.stone[3]); s.set(22, B - 18, P.stone[1]); s.set(23, B - 19, P.stone[1]);
    } else {
      s.oval(22, B - 5, 9, 6.5, (x, y, nx, ny) => Math.hypot(nx, ny) > .8 ? P.soilRich[ny < 0 ? 0 : 2] : P.ink);
      if (kind === 'den') for (const [x, y] of [[33, B - 1], [9, B], [36, B - 3]]) { s.rect(x, y, 5, 1, P.bone[5]); s.set(x - 1, y - 1, P.bone[4]); s.set(x - 1, y + 1, P.bone[4]); s.set(x + 5, y - 1, P.bone[3]); s.set(x + 5, y + 1, P.bone[3]); }
      else { for (const x of [6, 13, 31, 38]) { const d = x < 22 ? -1 : 1; s.thick(x, B, x + d * 2, B - 18, 2, P.wood, 3); s.oval(x + d * 2 + 1, B - 20, 2.6, 2.6, () => P.bone[5]); s.set(x + d * 2, B - 20, P.ink); s.set(x + d * 2 + 2, B - 20, P.ink); s.rect(x + d * 2, B - 18, 3, 1, P.bone[3]); } s.rect(18, B - 14, 9, 2, P.red[2]); s.rect(21, B - 16, 2, 6, P.red[3]); }
    }
    s.sh = { rx: 23, ry: 7, dx: 6, dy: 0 };
  } else if (k.f === 'nest') {
    s.oval(22, B - 6, 16, 7.5, () => P.wood[1]);
    for (let a = 0; a < 110; a++) { const t = r() * 6.283, rr = .72 + r() * .34, x = 22 + Math.cos(t) * 16 * rr, y = B - 6 + Math.sin(t) * 7.5 * rr, l = 4 + r() * 5, ang = t + 1.57 + (r() - .5); s.line(x, y, x + Math.cos(ang) * l, y + Math.sin(ang) * l * .5, P.wood[2 + Math.floor(r() * 4)]); }
    s.oval(22, B - 6, 9, 3.6, () => P.wood[0]);
    for (const [x, y] of [[17, B - 6], [22, B - 8], [27, B - 6]]) { s.oval(x, y, 2.8, 3.4, (px, py, nx, ny) => P.cloth[nx + ny < -.2 ? 5 : nx + ny < .6 ? 4 : 2]); s.set(x + 1, y, P.furTan[2]); s.set(x - 1, y + 1, P.furTan[2]); }
    for (const [x, y] of [[34, B - 13], [8, B - 3]]) { s.line(x, y, x + 5, y - 3, P.furWhite[4]); s.line(x, y + 1, x + 4, y - 1, P.furWhite[2]); }
    s.sh = { rx: 18, ry: 5, dx: 4, dy: 0, k: .8 };
  } else if (k.f === 'cairn') {
    s.ball(22, B - 6, 13, 7, 0, P.stone, { facet: 6, seed, d: .12 }); s.ball(22, B - 15, 9.5, 6, 1, P.stone, { facet: 5, seed: seed + 3, d: .12 });
    s.ball(23, B - 23, 6.5, 4.6, 2, P.stone, { facet: 4, seed: seed + 5, d: .12 }); s.ball(22, B - 29, 4, 3.2, 3, P.stone, { facet: 3, seed: seed + 7, d: .12 });
    if (!winter) for (let i = 0; i < 22; i++) { const x = 10 + Math.floor(r() * 24), y = B - 22 + Math.floor(r() * 20); if (s.get(x, y)) { s.set(x, y, P.mossSwamp[2 + (i % 3)]); if (s.get(x + 1, y)) s.set(x + 1, y, P.mossSwamp[1]); } }
    s.sh = { rx: 15, ry: 5, dx: 4, dy: 0 };
  } else if (k.f === 'geode') {
    s.ball(22, B - 11, 15, 12, 0, P.rock, { facet: 7, seed, d: .12 }); cut();
    s.oval(21, B - 12, 10, 7.5, (x, y, nx, ny) => Math.hypot(nx, ny) > .82 ? P.cloth[4] : P.rock[0]);
    for (let i = 0; i < 9; i++) { const t = i / 9 * 6.283, x = 21 + Math.cos(t) * 6, y = B - 12 + Math.sin(t) * 4.4 + 3; shard(s, x, y, 3, 5 + (i % 3), Math.cos(t) * .2, GEM.star, 230); }
    shard(s, 21, B - 8, 4, 8, 0, GEM.star, 230);
    s.emit = { dx: 0, dy: -12, rad: 60, col: GLOW.star, pulse: 1 }; s.sh = { rx: 17, ry: 6, dx: 5, dy: 0 };
  } else {
    s.ball(22, B - 13, 16, 12, 0, P.rock, { facet: 8, seed, d: .12 });
    s.ball(10, B - 6, 8, 6.5, 2, P.rock, { facet: 5, seed: seed + 1, d: .12 });
    s.ball(33, B - 5, 7, 5.6, 2, P.rock, { facet: 5, seed: seed + 2, d: .12 });
    for (let i = 0; i < 9; i++) { const x = 6 + r() * 30, y = B - 1 + r() * 2; s.set(x, y, P.rock[5]); s.set(x + 1, y, P.rock[3]); s.set(x + 1, y + 1, P.rock[1]); }
    if (!winter) for (let i = 0; i < 16; i++) { const x = 8 + Math.floor(r() * 26), y = B - 24 + Math.floor(r() * 8); if (s.get(x, y)) s.set(x, y, P.moss[3 + (i % 3)]); }
    s.sh = { rx: 20, ry: 7, dx: 6, dy: 0 };
  }
  if (winter) s.snowCap(3, .15);
  s.outline();
  return s;
}
