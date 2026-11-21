'use strict';
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const mix = (a, b, t) => a + (b - a) * t;
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dith = (x, y) => (B4[((y & 3) << 2) | (x & 3)] + .5) / 16;
function hash(x, y, z) {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function noise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let xf = x - xi, yf = y - yi;
  xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
  return mix(mix(hash(xi, yi, s), hash(xi + 1, yi, s), xf), mix(hash(xi, yi + 1, s), hash(xi + 1, yi + 1, s), xf), yf);
}
function fbm(x, y, s, o) {
  let a = .5, f = 1, v = 0, n = 0;
  for (let i = 0; i < o; i++) { v += a * noise(x * f, y * f, s + i * 17); n += a; a *= .5; f *= 2; }
  return v / n;
}
let VEDGE = 0, VDX = 0, VDY = 0;
function vor(x, y, sc, s) {
  const gx = x / sc, gy = y / sc, cx = Math.floor(gx), cy = Math.floor(gy);
  let d1 = 9, d2 = 9, id = 0, bx = 0, by = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const px = cx + i + hash(cx + i, cy + j, s), py = cy + j + hash(cx + i, cy + j, s + 7);
    const d = Math.hypot(gx - px, gy - py);
    if (d < d1) { d2 = d1; d1 = d; id = hash(cx + i, cy + j, s + 13); bx = gx - px; by = gy - py; } else if (d < d2) d2 = d;
  }
  VEDGE = (d2 - d1) * sc; VDX = bx * sc; VDY = by * sc;
  return id;
}
function rng(seed) {
  let i = 0;
  return () => hash(seed, ++i, 91);
}
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const R = s => s.trim().split(/\s+/).map(hex);
function rp(ramp, t, x, y, d) {
  const n = ramp.length - 1;
  const i = Math.floor(clamp(t, 0, 1) * n + .5 + (dith(x, y) - .5) * (d === undefined ? .7 : d));
  return ramp[clamp(i, 0, n)];
}
const dark = (c, k) => [c[0] * k, c[1] * k, Math.min(255, c[2] * (k + .1))];

const P = {
  ink: hex('#0d0a10'),
  soil: R('#2b2019 #3d2e22 #52402d #68533a #7e6848 #96805c'),
  soilPoor: R('#31261c #443525 #584630 #6c573c #806a4a'),
  soilRich: R('#1f1814 #2c221b #3b2e23 #4b3b2c #5c4a36'),
  preta: R('#120f0e #1b1614 #261f1b #322922 #3f342c'),
  tilled: R('#1e1612 #2c2019 #3c2c21 #4d3a2a #5e4934'),
  grass: R('#1d3324 #27452a #33592f #457034 #5d883c #7ea04a'),
  grassDry: R('#3a3f24 #4c5229 #62662f #7b7b3a #969048'),
  grassLoam: R('#26391f #344d26 #47632c #5f7a34 #7a923f'),
  savanna: R('#5a4a22 #76622a #937c33 #b0973f #c9b256 #dcc878'),
  moss: R('#173028 #1f4234 #2a5a42 #3a7450 #529060 #74ab72'),
  mossSwamp: R('#2a3318 #3b4720 #505e28 #6a7832 #879340'),
  litter: R('#33241a #45301f #5c3d23 #764c28 #915f2c'),
  mud: R('#1e1712 #2b211a #3a2c22 #4a392b #5d4a38 #7d6a55'),
  bog: R('#12180f #1a2416 #24311b #314022 #42532b'),
  duck: R('#4e6a2a #6f8a3a #93a84c'),
  clay: R('#4f3226 #66412f #7e533a #956849 #ab7f5c'),
  clayBlue: R('#33414b #455862 #5b727c #768e96 #94a8aa'),
  sand: R('#5f5238 #7a6a48 #94835a #ae9d70 #c7b88a #dccfa4'),
  quick: R('#6d5c3a #8a7648 #a5905a #bfaa72 #d2c08c'),
  rock: R('#1c1b22 #2a2a33 #3b3c46 #4f515a #666970 #808388 #9c9e9f'),
  rockWarm: R('#2e2a28 #403a35 #554d45 #6b6257 #83796b #9c9282'),
  cave: R('#17161c #22212a #2f2e38 #3d3c47 #4c4b56'),
  deep: R('#0f1d33 #152a47 #1b3a5c #245072 #2f6888 #4a8aa2'),
  shallow: R('#1c4a52 #266066 #33787a #4a9490 #6fb0a4 #a5d2c0'),
  foam: R('#a9cfd0 #cfe6e2 #eef7f2'),
  ice: R('#6f93ac #94b4c6 #bcd3dc #dde9ec'),
  snow: R('#7c8ea6 #a4b6c8 #c8d6e0 #e6eef0 #f8fcfc'),
  wood: R('#241a17 #35261e #4a3426 #624630 #7b5b3c #96744d'),
  woodGrey: R('#25221f #37332e #4c4740 #645e54 #7e776a #999180'),
  plank: R('#4a3626 #644a31 #80613f #9b7a50 #b59465 #cdb080'),
  birch: R('#3a3632 #6f6b66 #9a968c #c4c0b2 #e2ded0'),
  bone: R('#3c382f #5a5448 #7c7564 #a09880 #c4bca0 #e0dac4'),
  oak: R('#132a22 #1b3d28 #26532c #3a6c31 #568738 #7aa243'),
  ash: R('#16301f #224626 #335f2c #4b7a34 #6b963f #91b04e'),
  pine: R('#0e2223 #143129 #1b4230 #275637 #387042 #52885a'),
  birchLeaf: R('#24401f #36592a #4f7532 #6d913a #8fae48 #b3c862'),
  willow: R('#1f3a2a #2e5232 #446c3a #5f8744 #80a252 #a3ba68'),
  fallRed: R('#33140f #521c13 #7a2a17 #a3401b #c5601f #de8a2c'),
  fallOrange: R('#3a1f10 #5c3013 #86491a #b06a20 #d18f2a #e8b644'),
  fallYellow: R('#40300e #614a12 #896c18 #b29222 #d4b834 #ecd65a'),
  heart: R('#2a1030 #45184a #672566 #8f3a86 #b85aa6 #dd8cc6'),
  moon: R('#1c2a44 #2c4466 #46688c #6c93b0 #9cc0d0 #d0e6ea'),
  ironleaf: R('#111c1b #1a2a27 #263c35 #355046 #48685a #5e8070'),
  ironbark: R('#16161a #222228 #32333a #45474e #5a5d64'),
  ember: R('#3a120c #5e1c0e #8c2c10 #bc4a14 #e0781e #f6b23c'),
  soul: R('#0f2a2c #164244 #206060 #328684 #56b0a4 #94dcc8'),
  witch: R('#150f20 #201630 #2e2046 #40305e #584678 #7660a0'),
  frost: R('#16283a #1f3c52 #2c566c #427688 #6a9eaa #a8ccd0'),
  stone: R('#2c2b2e #3f3e40 #565554 #6f6d69 #898680 #a5a297'),
  daub: R('#6a5d48 #86775c #a39372 #bfb08a #d6c9a4 #e6dcbc'),
  brick: R('#3e2b1f #563b28 #6f4e33 #896340 #a27a50 #b89466'),
  fireBrick: R('#4a2018 #6c2e1e #8e4228 #ad5a36 #c8784c'),
  concrete: R('#3a3d42 #50545a #696e73 #84898c #a0a4a4 #bcbfbc'),
  thatch: R('#4a3c1e #665326 #846c30 #a2873c #bfa44e #d8c06c'),
  rooftile: R('#4a1f18 #6a2c1e #8c3d26 #ab5332 #c66f44'),
  wicker: R('#4a3a22 #66512c #846a38 #a28548 #bda05e'),
  iron: R('#1a1c22 #2a2e36 #40464e #5c646c #7e888e #a6b0b2 #d0d8d6'),
  copper: R('#4a2416 #70361c #985024 #c0702e #e09848 #f2c478'),
  gold: R('#5a4010 #866214 #b4881c #dcb030 #f4d860'),
  red: R('#4a141a #701c22 #9a2a2a #c0443a #de6a52'),
  blue: R('#16243e #20385c #2e507c #44709c #6a98bc'),
  green: R('#1c3020 #2a482a #3c6436 #558246 #76a05a'),
  purple: R('#24143a #3a2058 #56307c #7648a0 #9c6cc0'),
  cloth: R('#5a5040 #7a6e58 #9c9074 #beb294 #dcd2b6 #efe8d2'),
  leather: R('#2e1c14 #46291a #603a22 #7c4f2e #98683e #b48556'),
  hay: R('#6a5a22 #8a762c #aa9238 #c8b04a #e0cc6a'),
  fire: R('#7a1c0e #c23a10 #f07818 #fcc23a #fff0a0'),
  mana: R('#12305a #1c5490 #2c84c4 #56b8e8 #a8e6fa #e8fcff'),
  furGrey: R('#1e2026 #33363e #4e525a #70747a #969a9c #c0c2c0'),
  furBrown: R('#1e1410 #32211a #4a3224 #644630 #80603f #9c7c52'),
  furTan: R('#4a2e1c #6c4426 #906036 #b4824e #d2a872 #e8d0a4'),
  furDark: R('#141210 #221d19 #332b24 #463c32 #5c5042'),
  furWhite: R('#6a6e78 #8e929a #b4b8ba #d6d8d6 #f0f0ec'),
  furRust: R('#3a1c10 #5a2a16 #7e3e1c #a45a26 #c47c38'),
  chitin: R('#140e16 #241828 #38243c #503454 #6c4a70'),
  ooze: R('#1c3a16 #2c5a1c #44802a #68a83a #9cd058 #d0f090'),
  ghost: R('#2a3a5a #46608a #6c8cb4 #9cbcd8 #d0e6f2'),
  skinPale: R('#7a5444 #a67858 #cc9c78 #e8c09c #f6dcc0'),
  skinTan: R('#4e2e20 #744630 #9a6444 #bc8660 #d8a880'),
  skinDark: R('#2a1812 #44281c #603a2a #7e503a #9a6a50'),
  skinOrc: R('#1e3018 #30481f #476428 #628234 #84a046'),
  skinGob: R('#2e3a14 #46561a #627424 #849232 #a8b048'),
  skinGrey: R('#34343c #4c4e58 #686c76 #8a8e96 #aeb2b6'),
};
const ORE = {
  malachite: R('#14402c #1f6a44 #34985e #62c486'),
  chalcopyrite: R('#5a4a1c #86702a #b49a3c #dcc45c'),
  azurite: R('#142a66 #1f4496 #3466c4 #6494e6'),
  cassiterite: R('#2a1c16 #46301f #654628 #866238'),
  hematite: R('#3a1410 #602018 #8c3222 #b4503a'),
  magnetite: R('#0c0c12 #1a1a24 #30323e #5a6070'),
  limonite: R('#4a3410 #745216 #a0761e #c89c30'),
  galena: R('#3a3e48 #5a606c #868e98 #bcc4c8'),
  gold: R('#6a4c10 #a47c18 #dcb030 #fce66c'),
  electrum: R('#6a6436 #9c9654 #ccc882 #f2efbc'),
  coal: R('#08080a #121216 #1e1e24 #34343c'),
  salt: R('#9a8a8c #c4b4b4 #e4d8d6 #faf4f0'),
};
const GEM = {
  amethyst: R('#2a1248 #45207a #6a34ae #9658dc #c490f4 #ecd0ff'),
  ruby: R('#40080e #6e1018 #a41c26 #d8383c #f47468 #ffc4b4'),
  sapphire: R('#0c1a50 #142c84 #2048bc #3e74e6 #7aaaf8 #c8e2ff'),
  emerald: R('#06301c #0c5230 #187c48 #32ac66 #6cd894 #c0f8d2'),
  topaz: R('#4a2606 #7c420a #b46812 #e2962a #f8c462 #fff0b8'),
  citrine: R('#4a3c06 #7a660c #ac9418 #d8c234 #f2e270 #fffac4'),
  moonstone: R('#2e3a52 #4c6080 #7690ac #a6c0d2 #d2e6ee #f6fdff'),
  mana: P.mana,
  void: R('#06040c #120a24 #24124a #3e1e7c #6a3cc0 #b488ff'),
  star: R('#3a3410 #6c6418 #a49c2c #dcd654 #f8f6a0 #ffffe8'),
};

const LV = (() => { const v = [-.55, -.6, .58], l = Math.hypot(...v); return v.map(a => a / l); })();

class Spr {
  constructor(w, h, ax, ay) {
    this.w = w; this.h = h; this.ax = ax === undefined ? w >> 1 : ax; this.ay = ay === undefined ? h - 1 : ay;
    this.c = new Array(w * h).fill(null);
    this.e = new Uint8Array(w * h);
    this.z = new Float32Array(w * h).fill(-1e9);
  }
  ok(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x, y, c, e) {
    x = Math.round(x); y = Math.round(y);
    if (!this.ok(x, y)) return;
    const i = y * this.w + x;
    this.c[i] = c; this.e[i] = e || 0;
  }
  get(x, y) { return this.ok(x, y) ? this.c[y * this.w + x] : null; }
  rect(x, y, w, h, c, e) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, e); }
  line(x0, y0, x1, y1, c, e) {
    const n = Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
    for (let i = 0; i <= n; i++) { const k = n ? i / n : 0; this.set(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, c, e); }
  }
  ball(cx, cy, rx, ry, zc, ramp, o) {
    o = o || {};
    const n = o.n || 0, ns = o.ns || .5, seed = o.seed || 0, d = o.d === undefined ? .6 : o.d, bias = o.bias || 0, e = o.e || 0, facet = o.facet || 0, amp = o.amp === undefined ? 1 : o.amp;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (!this.ok(x, y)) continue;
      let nx = (x + .5 - cx) / rx, ny = (y + .5 - cy) / ry;
      const q = nx * nx + ny * ny;
      if (q > 1) continue;
      const nz0 = Math.sqrt(1 - q), z = zc + nz0 * Math.min(rx, ry), i = y * this.w + x;
      if (z < this.z[i]) continue;
      this.z[i] = z;
      if (facet) {
        const id = vor(x, y, facet, seed);
        nx += (id - .5) * .9; ny += (hash(id * 9999, seed, 3) - .5) * .9;
      }
      const l = nx * LV[0] + ny * LV[1] + nz0 * LV[2];
      let t = .5 + l * .52 * amp + bias;
      if (n) t += (noise(x * ns, y * ns, seed) - .5) * n;
      if (facet && VEDGE < .7) t -= .22;
      this.c[i] = rp(ramp, t, x, y, d); this.e[i] = e;
    }
    return this;
  }
  box(x, y, w, dp, h, top, front, o) {
    o = o || {};
    const tn = top.length - 1, fn = front.length - 1;
    for (let j = 0; j < dp; j++) for (let i = 0; i < w; i++) {
      let k = tn - 1;
      if (j === 0 || i === 0) k = tn;
      if (i === w - 1) k = tn - 2;
      if (o.tex) k += o.tex(i, j, 0);
      this.set(x + i, y + j, top[clamp(k, 0, tn)]);
    }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let k = fn - 3;
      if (j === 0) k = fn - 2;
      if (i === 0) k += 1;
      if (i === w - 1 || j === h - 1) k -= 1;
      if (o.tex) k += o.tex(i, j, 1);
      this.set(x + i, y + dp + j, front[clamp(k, 0, fn)]);
    }
    return this;
  }
  cyl(x, y, w, h, ramp, o) {
    o = o || {};
    const n = ramp.length - 1;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const u = w > 1 ? i / (w - 1) : .5;
      let k = Math.round(n * (.92 - u * .8)) - (u < .12 ? 1 : 0);
      if (o.tex) k += o.tex(i, j);
      this.set(x + i, y + j, ramp[clamp(k, 0, n)], o.e);
    }
    return this;
  }
  disc(cx, cy, rx, ry, c, e) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + .5 - cx) / rx, ny = (y + .5 - cy) / ry;
      if (nx * nx + ny * ny <= 1) this.set(x, y, typeof c === 'function' ? c(x, y, nx, ny) : c, e);
    }
    return this;
  }
  outline(col) {
    col = col || P.ink;
    const { w, h, c } = this, add = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (c[y * w + x]) continue;
      if ((x > 0 && c[y * w + x - 1]) || (x < w - 1 && c[y * w + x + 1]) || (y > 0 && c[(y - 1) * w + x]) || (y < h - 1 && c[(y + 1) * w + x])) add.push(y * w + x);
    }
    for (const i of add) c[i] = col;
    return this;
  }
  snowCap(depth, keep) {
    const { w, h, c } = this, S = P.snow;
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
      const i = y * w + x;
      if (!c[i] || (y > 0 && c[(y - 1) * w + x] && c[(y - 1) * w + x] !== S[4] && c[(y - 1) * w + x] !== S[3] && c[(y - 1) * w + x] !== P.ink)) continue;
      if (c[i] === S[4] || c[i] === S[3] || c[i] === P.ink || this.e[i]) continue;
      if (keep && hash(x, y, 5) < keep) continue;
      c[i] = S[4];
      for (let k = 1; k < depth; k++) if (y + k < h && c[(y + k) * w + x] && c[(y + k) * w + x] !== P.ink && hash(x, y + k, 8) < .75) c[(y + k) * w + x] = k === depth - 1 ? S[2] : S[3];
    }
    return this;
  }
  flip() {
    const s = new Spr(this.w, this.h, this.w - 1 - this.ax, this.ay);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      s.c[y * this.w + x] = this.c[y * this.w + this.w - 1 - x]; s.e[y * this.w + x] = this.e[y * this.w + this.w - 1 - x];
    }
    Object.assign(s, { sh: this.sh, emit: this.emit && { ...this.emit, dx: -this.emit.dx } });
    return s;
  }
}
