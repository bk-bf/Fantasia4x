'use strict';
function fallTree(kind, seed, season, ang, dir) {
  const k = TREES[kind], r = rng(seed * 31 + 7);
  if (!k || k.shape !== 'round') return null;
  let leaf = k.leaf;
  if (!k.ever && season === 'autumn') leaf = [k.fall, P.fallOrange, P.fallRed][Math.floor(r() * 2.2)] || k.fall;
  if (!k.ever && season === 'winter') return null;
  const Rr = 112, s = new Spr(Rr * 2, Rr * 2, Rr, Rr), cx = 38, base = 98, py = 94, deg = ang * dir;
  const T = (x, y) => { const q = rot2(x, y, cx, py, deg); return [q[0] - cx + Rr, q[1] - py + Rr]; }, pen = turnedPen(s, T);
  const n = k.trunk.length - 1, top = base - k.th - 6;
  const bark = w => (t, kk) => {
    const x = Math.round(cx - w / 2) + kk, y = Math.round(base - t), u = kk / Math.max(1, w - 1);
    let q = u < .2 ? n - 1 : u < .6 ? n - 2 : u < .84 ? n - 3 : n - 4;
    if (noise(x * 1.3 + (y >> 3) * 5, y * .16, seed) > .64) q -= 1;
    if (u < .14 && hash(x, y >> 1, seed) > .55) q = n;
    return k.trunk[clamp(q, 0, n)];
  };
  rigLimb(s, [T(cx, base), T(cx, top)], k.tw, bark(k.tw));
  rigLimb(s, [T(cx, base), T(cx, base - 4)], k.tw + 3, bark(k.tw + 3));
  const cy = base - k.th - k.ry * .55;
  limb(pen, cx - 1, base - k.th + 2, cx - k.rx * .5, cy + 4, 3, k.trunk, r, 0);
  limb(pen, cx + 1, base - k.th + 4, cx + k.rx * .5, cy + 6, 3, k.trunk, r, 0);
  canopy(pen, cx, cy, k.rx, k.ry, leaf, seed, { e: k.glow && !k.moon ? 60 : 0, b: k.moon ? -.16 : 0 });
  for (let i = 0; i < 4; i++) {
    const a = .5 + i * 1.7 + r() * .8, d = .62;
    canopy(pen, cx + Math.cos(a) * k.rx * d, cy + Math.sin(a) * k.ry * d + 2, k.rx * .46, k.ry * .46, leaf, seed + 40 + i, { z: Math.sin(a) * 5 + 3, e: k.glow && !k.moon ? 60 : 0, b: k.moon ? -.16 : 0 });
  }
  const leafy = i => s.z[i] > -1e8;
  for (let x = 0; x < s.w; x++) { let under = 0; for (let y = 0; y < s.h; y++) { const i = y * s.w + x; if (leafy(i)) under = 7; else if (s.c[i] && under > 0) { s.c[i] = dark(s.c[i], under > 3 ? .55 : .75); under--; } } }
  s.outline(dark(leaf[0], .5));
  const sh = mkTreeShadow(k);
  s.sh = { rx: sh.rx * (1 + ang / 70), ry: sh.ry, dx: sh.dx + dir * ang * .25, dy: 0, k: 1 };
  s.leaf = leaf;
  return s;
}
const mkTreeShadow = k => ({ rx: k.rx * 1.02 * 1.15, ry: k.rx * 1.02 * .46, dx: 8 });
