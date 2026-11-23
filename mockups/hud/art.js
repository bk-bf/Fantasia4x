'use strict';
(() => {
  const A = HUD.art = {};
  const RAMP = A.RAMP = {
    oakDark: R('#110b08 #19110c #231810 #2e2015 #3a291a #493521 #5b442b'),
    beam: R('#1b120d #291b12 #3a2719 #4e3621 #64472b #7c5b38 #977448'),
    vellum: R('#6e5a3c #8c7650 #a89068 #c0a880 #d4c098 #e4d6b2 #f0e6c8'),
    brass: R('#2a1c0a #47310e #6e4e14 #987219 #c29628 #e2bd48 #f7e38a'),
    glass: R('#070b13 #0b121d #101a29 #162336 #1d2e44 #273b54'),
    ember: R('#5a1a0c #8c2c10 #bc4a14 #e0781e #f6b23c #ffe89a'),
    leaf: R('#1c3020 #2a482a #3c6436 #558246 #76a05a #a2c47a'),
    blood: R('#3a0f12 #5e161a #8a2222 #b43a30 #d8604a #f09a7a'),
    water: R('#12264a #1c3c6c #2c5890 #4a7cb4 #78a6d4 #b4d4ee'),
    honey: R('#4a3408 #76540e #a47a16 #cca02a #e8c650 #f8e690'),
    violet: R('#24143a #3a2058 #56307c #7648a0 #9c6cc0 #c4a0e0'),
    verdigris: R('#12322c #1c4c42 #2c6c5c #44907a #6cb49a #a4d8c0'),
    vermilion: R('#4a1410 #741c14 #a02a18 #c8442a #e46e4a #f4a482'),
    lapis: R('#101c44 #182c68 #24448e #3a62b0 #5e88cc #94b4e4'),
    ochre: R('#4a3410 #6e4e16 #94701e #b8922c #d4b44c #ecd480'),
    inkwash: R('#1c130c #2c1e14 #3e2c1e #54402c #6e583e #8c7454')
  };
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  A.mk = mk;
  A.paint = (w, h, fn) => {
    const c = mk(w, h), g = c.getContext('2d'), im = g.createImageData(c.width, c.height), d = im.data;
    for (let y = 0, i = 0; y < c.height; y++) for (let x = 0; x < c.width; x++, i += 4) {
      const p = fn(x, y);
      if (!p) continue;
      d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2]; d[i + 3] = p.length > 3 ? p[3] : 255;
    }
    g.putImageData(im, 0, 0);
    return c;
  };
  const tone = (c, k) => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
  A.tone = tone;

  function boards(n, seed, lo, hi) {
    const id = new Int16Array(n), pos = new Int16Array(n), wid = new Int16Array(n);
    for (let a = 0, k = 0; a < n; k++) {
      const bw = lo + Math.floor(hash(k, seed, 4) * (hi - lo + 1));
      for (let i = 0; i < bw && a < n; i++, a++) { id[a] = k; pos[a] = i; wid[a] = bw; }
    }
    return { id, pos, wid };
  }
  function grain(c, k, a, seed) {
    let t = (hash(k, seed, 1) - .5) * .16;
    t += (fbm(c * .028 + k * 13.7, a * .5 + k * 3.1, seed + 2, 3) - .5) * .44;
    if (noise(a * 1.7 + k * 5.3, c * .012, seed + 5) > .74) t -= .09;
    return t;
  }
  A.planks = (w, h, o) => {
    o = o || {};
    const v = o.dir !== 'h', ramp = o.ramp || RAMP.oakDark, base = o.base === undefined ? .42 : o.base, seed = o.seed || 1, B = boards(v ? w : h, seed, o.lo || 20, o.hi || 30);
    return (x, y) => {
      const a = v ? x : y, c = v ? y : x, k = B.id[a], pa = B.pos[a];
      if (pa === B.wid[a] - 1) return ramp[0];
      let t = base + grain(c, k, a, seed);
      if (pa === 0) t += .1;
      return rp(ramp, t, x, y, .8);
    };
  };
  const ironPx = (x, y, k) => P.iron[clamp(k + (hash(x, y, 9) > .82 ? 1 : 0) - (hash(x, y, 11) > .88 ? 1 : 0), 0, 6)];

  A.timber = (w, h, o) => {
    o = o || {};
    const bw = o.beam === undefined ? 5 : o.beam, face = A.planks(w, h, o), br = o.beamRamp || RAMP.beam, seed = (o.seed || 1) + 40, strap = o.strap === undefined ? 12 : o.strap;
    return A.paint(w, h, (x, y) => {
      const l = x, r = w - 1 - x, t = y, b = h - 1 - y, d = Math.min(l, r, t, b);
      if (d === 0) return P.ink;
      const cx = Math.min(l, r), cy = Math.min(t, b);
      if (strap && cx < strap && cy < strap && (cx <= bw + 1 || cy <= bw + 1)) {
        if (cx === strap - 1 || cy === strap - 1 || (cx === bw + 1 && cy >= bw + 1) || (cy === bw + 1 && cx >= bw + 1)) return P.iron[0];
        if ((cx === 3 && cy === 3) || (cx === strap - 4 && cy === 3) || (cx === 3 && cy === strap - 4)) return P.iron[6];
        if ((cx === 4 && cy === 4) || (cx === strap - 3 && cy === 4) || (cx === 4 && cy === strap - 3)) return P.iron[0];
        return ironPx(x, y, t === 1 || l === 1 ? 4 : b === 1 || r === 1 ? 1 : 2);
      }
      if (d <= bw) {
        const horiz = d === t || d === b;
        let k = .5 + grain(horiz ? x : y, d === t ? 1 : d === b ? 2 : d === l ? 3 : 4, (horiz ? y : x) * 1.6, seed) * .8;
        if (d === t) k += t === 1 ? .2 : t === bw ? -.2 : 0;
        else if (d === b) k += b === bw ? .14 : b === 1 ? -.22 : 0;
        else if (d === l) k += l === 1 ? .18 : l === bw ? -.16 : 0;
        else k += r === bw ? .1 : r === 1 ? -.22 : 0;
        if (cx === cy) k -= .2;
        const along = horiz ? x : y;
        if (d === 3 && along % 72 === 36) return P.iron[6];
        if (d === 4 && along % 72 === 37) return P.ink;
        return rp(br, k, x, y, .8);
      }
      if (d === bw + 1) return face === null ? P.ink : RAMP.oakDark[0];
      const c = face(x, y);
      return t === bw + 2 || l === bw + 2 ? tone(c, .72) : c;
    });
  };

  A.ironBtn = (w, h, o) => {
    o = o || {};
    const down = !!o.down;
    return A.paint(w, h, (x, y) => {
      const l = x, r = w - 1 - x, t = y, b = h - 1 - y, d = Math.min(l, r, t, b), cx = Math.min(l, r), cy = Math.min(t, b);
      if (cx + cy === 0) return null;
      if (d === 0) return P.ink;
      if (d === 1) return ironPx(x, y, (t === 1 || l === 1) ? (down ? 0 : 4) : (down ? 3 : 1));
      if (o.rivets && cx === 4 && cy === 4) return P.iron[6];
      if (o.rivets && cx === 5 && cy === 5) return P.iron[0];
      const k = .34 + (fbm(x * .16, y * .16, 3, 2) - .5) * .22 + (down ? -.12 : 0) + (t === 2 && !down ? .08 : 0);
      return rp(P.iron, k, x, y, .7);
    });
  };

  A.inset = (w, h, o) => {
    o = o || {};
    const ramp = o.ramp || RAMP.oakDark, hi = o.hi || RAMP.beam[5];
    return A.paint(w, h, (x, y) => {
      const l = x, r = w - 1 - x, t = y, b = h - 1 - y, d = Math.min(l, r, t, b);
      if (d === 0) return t === 0 || l === 0 ? P.ink : hi;
      const k = .12 + (fbm(x * .05, y * .05, 21, 2) - .5) * .16 + (t === 1 || l === 1 ? -.1 : 0);
      return rp(ramp, k, x, y, .8);
    });
  };

  A.bar = (w, h, frac, ramp, o) => {
    o = o || {};
    const n = ramp.length - 1, fx = Math.round((w - 2) * clamp(frac, 0, 1)), empty = o.empty || [13, 10, 8], line = o.line || P.ink;
    return A.paint(w, h, (x, y) => {
      const l = x, r = w - 1 - x, t = y, b = h - 1 - y, d = Math.min(l, r, t, b);
      if (d === 0) return o.open && (t === 0 || b === 0) && !(l === 0 || r === 0) && t !== 0 ? null : line;
      const i = x - 1, tick = o.ticks && (i === Math.round((w - 2) * .25) || i === Math.round((w - 2) * .5) || i === Math.round((w - 2) * .75));
      if (i < fx && !(i >= fx - 3 && dith(x, y) > (fx - i) / 3.5)) {
        let k = n - 1;
        if (t === 1) k = n; else if (b === 1) k = n - 3; else if (b === 2) k = n - 2;
        if (tick && (t === 1 || b === 1)) k -= 2;
        if (hash(x >> 1, y, 5) > .9) k -= 1;
        return ramp[clamp(k, 0, n)];
      }
      if (tick && (t === 1 || b === 1)) return o.tickCol || [58, 44, 30];
      return o.emptyFn ? o.emptyFn(x, y) : (hash(x, y, 6) > .9 ? tone(empty, 1.5) : empty);
    });
  };

  A.vellum = (w, h, o) => {
    o = o || {};
    const seed = o.seed || 3, ramp = o.ramp || RAMP.vellum, rag = o.rag === undefined ? 1.6 : o.rag, rule = o.rule || 0, base = o.base === undefined ? .78 : o.base;
    const red = RAMP.vermilion[2], ink = RAMP.inkwash[1], gold = P.gold;
    return A.paint(w, h, (x, y) => {
      const l = x, r = w - 1 - x, t = y, b = h - 1 - y, d = Math.min(l, r, t, b);
      const wob = (noise(x * .11, y * .11, seed) - .5) * rag * 2.2 + (hash(x >> 1, y >> 1, seed + 1) - .5) * rag * .5;
      const ed = d + wob;
      if (ed < .6) return null;
      let k = base + (fbm(x * .011, y * .011, seed + 2, 3) - .5) * .3 + (fbm(x * .07, y * .07, seed + 4, 2) - .5) * .1;
      k -= Math.max(0, 1 - ed / 12) * .26;
      if (ed < 1.7) k -= .3;
      if (hash(x, y, seed + 6) > .988) k -= .14;
      if (o.gutter && Math.abs(x - o.gutter) < 14) k -= (1 - Math.abs(x - o.gutter) / 14) * .34;
      if (rule) {
        const cx = Math.min(l, r), cy = Math.min(t, b), q = Math.abs(cx - rule) + Math.abs(cy - rule);
        if (cx <= rule + 4 && cy <= rule + 4 && cx >= rule - 3 && cy >= rule - 3) {
          const m = Math.max(Math.abs(cx - rule), Math.abs(cy - rule));
          if (m === 3) return ink;
          if (m === 2) return gold[dith(x, y) > .5 ? 3 : 2];
          if (m === 1) return red;
          if (m === 0) return gold[4];
        } else if (q > 0) {
          if (d === rule && hash(x, y, seed + 8) > .03) return ink;
          if (d === rule + 2 && hash(x >> 1, y >> 1, seed + 9) > .06) return red;
        }
      }
      return rp(ramp, k, x, y, .9);
    });
  };
  A.candleMask = (src, o) => {
    o = o || {};
    const w = src.width, h = src.height, c = mk(w, h), g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    const im = g.getImageData(0, 0, w, h), d = im.data, cx = (o.cx === undefined ? .5 : o.cx) * w, cy = (o.cy === undefined ? .5 : o.cy) * h, rx = w * (o.rx || .62) + 30, ry = h * (o.ry || .62) + 30;
    for (let y = 0, i = 3; y < h; y++) for (let x = 0; x < w; x++, i += 4) {
      const q = Math.hypot((x - cx) / rx, (y - cy) / ry), e = clamp(Math.min(x, y, w - 1 - x, h - 1 - y) / (o.rim || 22), 0, 1), a = e * clamp(1.5 - q * .6, 0, 1);
      if (a < dith(x, y) * .92 + .04) d[i] = 0;
    }
    g.putImageData(im, 0, 0);
    return c;
  };
  A.ribbon = (w, h, ramp, o) => {
    o = o || {};
    const tex = M.cloth(ramp, ramp.length - 3, o.seed || 4), n = ramp.length - 1, tail = o.tail === undefined ? 7 : o.tail;
    return A.paint(w, h, (x, y0) => {
      const l = x, r = w - 1 - x, y = o.down ? h - 1 - y0 : y0;
      if (tail && y < tail && Math.abs(x - (w - 1) / 2) < (tail - y) * (w / 2 / tail) * .55) return null;
      const nb = tail && y < tail + 1 && Math.abs(x - (w - 1) / 2) < (tail + 1 - y) * (w / 2 / tail) * .55 + 1;
      if (l === 0 || r === 0 || nb || y === h - 1) return RAMP.inkwash[0];
      if (l === 2 || r === 2) return P.gold[dith(x, y0) > .45 ? 3 : 2];
      let c = tex(x, y0);
      if (l === 1) c = tone(c, 1.2); else if (r === 1) c = tone(c, .7);
      if (y > h - 4) c = tone(c, .6);
      if (o.on && (l === 3 || r === 3 || l === 4 || r === 4)) c = P.gold[4];
      return c;
    });
  };
  A.dial = (w, h, amb, flip) => {
    const br = RAMP.brass, cx = (w - 1) / 2, cy = h - 9, R0 = Math.min(cx, cy) - 1, rim = R0 > 90 ? 7 : 5, hr = ((amb.hour % 24) + 24) % 24;
    const day = hr >= 6 && hr < 18, f = day ? (hr - 6) / 12 : ((hr - 18 + 24) % 24) / 12, ang = Math.PI * (1 - f), orbR = R0 - rim - 13;
    const ox = cx + Math.cos(ang) * orbR, oy = cy - Math.sin(ang) * orbR * .92, wx = amb.weather, sky = amb.skyTint;
    const top = [28 + 70 * sky[0], 50 + 110 * sky[1], 86 + 150 * sky[2]], low = [70 + 185 * sky[0] * (.55 + amb.warm * .45), 62 + 150 * sky[1], 70 + 110 * sky[2] * (1 - amb.warm * .6)];
    const cloud = wx.rain || wx.snow || wx.fog ? 1 : 0;
    return A.paint(w, h, (x, y0) => {
      const y = flip ? h - 1 - y0 : y0, dx = x - cx, dy = y - cy, rr = Math.hypot(dx, dy);
      if (y > cy + 8) return null;
      if (y > cy) {
        if (Math.abs(dx) > R0 + 6) return null;
        const j0 = y - cy, j = flip ? 8 - j0 : j0;
        if (j0 === 8 || Math.abs(dx) > R0 + 5) return br[0];
        if (j === 1) return br[6];
        if (j === 7) return br[1];
        if (j >= 3 && j <= 5 && Math.abs(dx) < R0 - 4 && ((x - Math.round(cx) + 600) % 12 === 0)) return br[1];
        return rp(br, .5 + (fbm(x * .05, y * .6, 3, 2) - .5) * .2, x, y, .8);
      }
      if (rr > R0) return null;
      if (rr > R0 - 1) return br[0];
      if (rr > R0 - rim) {
        const a = Math.atan2(-dy, dx), u = (R0 - 1 - rr) / (rim - 1), li = (-dx * .55 - dy * (flip ? -.6 : .6)) / R0, tk = (a / Math.PI) * 12, near = Math.abs(tk - Math.round(tk));
        if (near < (Math.round(tk) % 3 === 0 ? .09 : .05) && u > .2 && u < (Math.round(tk) % 3 === 0 ? .95 : .7)) return br[0];
        return br[clamp(Math.round(3.4 + li * 2.6 + (u < .2 ? 1 : u > .85 ? -2 : 0)), 1, 6)];
      }
      if (rr > R0 - rim - 1) return br[0];
      const up = clamp(-dy / (R0 - rim), 0, 1), sk = flip ? 1 - up : up;
      const od = Math.hypot(x - ox, y - oy);
      if (day) {
        if (od < 6.5 && !(cloud && wx.fog)) return P.fire[od < 3 ? 4 : od < 5 ? 3 : 2];
        if (od < 11 && !cloud) { const ra = Math.atan2(y - oy, x - ox), sp = Math.abs(((ra / (Math.PI / 4)) % 1 + 1) % 1 - .5); if (sp > .36 && od > 8) return P.fire[3]; }
      } else {
        if (od < 6 && Math.hypot(x - ox - 3, y - oy + 1) >= 5) return P.moon[od < 4 ? 5 : 4];
        if (!cloud && hash(x, y, 31) > .975 && od > 9) return hash(x, y, 32) > .5 ? [232, 236, 250] : [150, 164, 210];
      }
      if (cloud) {
        const cl = fbm(x * .09 + 7, y * .16, 44, 3) + sk * .28 - (wx.fog ? .2 : .42) - (1 - Math.max(wx.rain, wx.snow, wx.fog)) * .06;
        if (cl > .2) { const g = 70 + 130 * amb.light * (wx.fog ? 1 : .8), k = cl > .3 ? 1 : .86; return [g * k * (0.8 + .2 * sky[0]), g * k * (0.86 + .14 * sky[1]), g * k * 1.04]; }
        if (wx.rain && ((x + y * 2) % 7 === 0) && ((y + (x >> 2)) % 5 < 3) && sk < .8) return [150, 176, 220];
        if (wx.snow && hash(x, y, 51) > .93 && sk < .85) return [240, 244, 250];
      }
      const hills = !flip && dy > -9 + Math.sin(x * .13) * 3 + noise(x * .2, 3, 6) * 4;
      if (hills) return day ? [34 + 30 * sky[0], 52 + 40 * sky[1], 40 + 20 * sky[2]] : [14, 20, 30];
      const t = sk + (dith(x, y) - .5) * .22, glow = amb.warm * Math.max(0, 1 - od / (R0 * .9)) * .5;
      return [mix(low[0], top[0], t) + glow * 90, mix(low[1], top[1], t) + glow * 40, mix(low[2], top[2], t)].map(v => clamp(Math.round(v / 12) * 12, 0, 255));
    });
  };

  A.scrim = (w, h, right) => A.paint(w, h, (x, y) => {
    const inner = right ? x : w - 1 - x, a = Math.min(1, inner / 44);
    return a > dith(x, y) * .96 + .02 ? [9, 7, 11, 118] : null;
  });
  A.doll = hp => {
    const s = new Spr(36, 66, 18, 65), col = (i, k) => { const v = hp[i], r = v >= .99 ? RAMP.leaf : v >= .9 ? RAMP.honey : RAMP.blood; return r[clamp(3 + k, 0, r.length - 1)]; };
    const part = (i, x, y, w, h) => { for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) s.set(x + k, y + j, col(i, k === 0 || j === 0 ? 1 : k === w - 1 || j === h - 1 ? -1 : 0)); };
    part(0, 13, 1, 10, 11); part(1, 11, 14, 14, 22); part(2, 5, 14, 5, 24); part(3, 26, 14, 5, 24); part(4, 11, 38, 6, 26); part(5, 19, 38, 6, 26);
    s.outline();
    return s.canvas(1);
  };
  const GLYPH = {
    sun: ['.....#.....', '.#...#...#.', '..#.....#..', '....###....', '...#####...', '##.#####.##', '...#####...', '....###....', '..#.....#..', '.#...#...#.', '.....#.....'],
    moon: ['....####...', '..###......', '.###.......', '.###.......', '###........', '###........', '###........', '.###.....#.', '.####...##.', '..########.', '....#####..'],
    cloud: ['...........', '...........', '....###....', '...#####...', '.#########.', '###########', '###########', '.#########.', '...........', '...........', '...........'],
    rain: ['....###....', '...#####...', '.#########.', '###########', '###########', '.#########.', '...........', '..#..#..#..', '.#..#..#...', '...........', '..#..#..#..'],
    storm: ['....###....', '...#####...', '.#########.', '###########', '###########', '.#########.', '.....##....', '....##.....', '...####....', '.....##....', '....##.....'],
    snow: ['....###....', '...#####...', '.#########.', '###########', '###########', '.#########.', '...........', '.#...#...#.', '...#...#...', '.#...#...#.', '...#...#...'],
    fog: ['...........', '.#########.', '...........', '###########', '...........', '.#########.', '...........', '#########..', '...........', '..########.', '...........'],
    pause: ['...........', '.###...###.', '.###...###.', '.###...###.', '.###...###.', '.###...###.', '.###...###.', '.###...###.', '.###...###.', '.###...###.', '...........'],
    play: ['...........', '..##.......', '..####.....', '..######...', '..########.', '..#########', '..########.', '..######...', '..####.....', '..##.......', '...........'],
    axe: ['......###..', '.....#####.', '....######.', '.....#####.', '....##.###.', '...##...#..', '..##.......', '.##........', '##.........', '#..........', '...........'],
    sword: ['.........##', '........###', '.......###.', '......###..', '.....###...', '#...###....', '##.###.....', '.###.......', '.####......', '##..##.....', '#....#.....'],
    hammer: ['..######...', '.########..', '.########..', '..######...', '....##.....', '....##.....', '....##.....', '....##.....', '....##.....', '....##.....', '....##.....'],
    eye: ['...........', '...........', '...#####...', '.##.....##.', '#...###...#', '#..#####..#', '#...###...#', '.##.....##.', '...#####...', '...........', '...........'],
    x: ['...........', '.##.....##.', '..##...##..', '...##.##...', '....###....', '...##.##...', '..##...##..', '.##.....##.', '...........', '...........', '...........'],
    bang: ['....###....', '....###....', '....###....', '....###....', '....###....', '.....#.....', '.....#.....', '...........', '....###....', '....###....', '...........'],
    flag: ['.##........', '.#######...', '.#########.', '.#########.', '.#######...', '.##........', '.##........', '.##........', '.##........', '.##........', '####.......'],
    bow: ['..###......', '....##....#', '.....##..#.', '......#.#..', '......##...', '.....#.#...', '....#..#...', '...#...#...', '..#...##...', '.#..###....', '####.......'],
    paw: ['...........', '..##...##..', '..##...##..', '##.......##', '##..###..##', '...#####...', '..#######..', '..#######..', '...##.##...', '...........', '...........'],
    left: ['...........', '......##...', '.....##....', '....##.....', '...##......', '..##.......', '...##......', '....##.....', '.....##....', '......##...', '...........'],
    right: ['...........', '...##......', '....##.....', '.....##....', '......##...', '.......##..', '......##...', '.....##....', '....##.....', '...##......', '...........'],
    flame: ['.....#.....', '....##.....', '....###....', '...####.#..', '..#####.##.', '..########.', '.#########.', '.####.####.', '.###...###.', '..##...##..', '...#####...'],
    drop: ['.....#.....', '.....#.....', '....###....', '....###....', '...#####...', '..#######..', '..#######..', '.#########.', '.#########.', '..#######..', '...#####...'],
    bowl: ['...#...#...', '....#...#..', '...#...#...', '...........', '###########', '###########', '.#########.', '.#########.', '..#######..', '...#####...', '..#######..'],
    pine: ['.....#.....', '....###....', '...#####...', '....###....', '...#####...', '..#######..', '...#####...', '..#######..', '.#########.', '.....#.....', '.....#.....'],
    lone: ['...........', '....###....', '....###....', '....###....', '.....#.....', '...#####...', '..#.###.#..', '..#.###.#..', '....#.#....', '....#.#....', '...##.##...'],
    shield: ['...........', '.#########.', '.#########.', '.####.####.', '.###...###.', '.####.####.', '.#########.', '..#######..', '..#######..', '...#####...', '.....#.....'],
    crate: ['...........', '###########', '#.........#', '#.#.....#.#', '#..#...#..#', '#...#.#...#', '#....#....#', '#...#.#...#', '#..#...#..#', '#.#.....#.#', '###########'],
    sprout: ['...........', '.##.....##.', '####...####', '.####.####.', '...##.##...', '.....#.....', '.....#.....', '.....#.....', '...#####...', '.#########.', '###########'],
    wind: ['...........', '......##...', '.......##..', '#########..', '...........', '###########', '...........', '#######....', '......##...', '.....##....', '...........']
  };
  A.glyph = (name, ramp, o) => {
    o = o || {};
    const g = GLYPH[name] || GLYPH.bang, gh = g.length, gw = g[0].length, s = new Spr(gw + 2, gh + 2), n = ramp.length - 1, on = (x, y) => y >= 0 && y < gh && x >= 0 && x < gw && g[y][x] === '#';
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      if (!on(x, y)) continue;
      const hi = !on(x, y - 1) || !on(x - 1, y), lo = !on(x, y + 1) || !on(x + 1, y);
      s.set(x + 1, y + 1, ramp[clamp(n - 1 + (hi && !lo ? 1 : 0) - (lo && !hi ? 2 : 0), 0, n)]);
    }
    if (o.line !== null) s.outline(o.line || P.ink);
    return s.canvas(1);
  };

  A.badge = (name, ramp, o) => {
    o = o || {};
    const g = GLYPH[name] || GLYPH.bang, n = ramp.length - 1, on = (x, y) => x >= 0 && y >= 0 && x < 11 && y < 11 && g[y][x] === '#';
    return A.paint(17, 17, (x, y) => {
      const d = Math.min(x, y, 16 - x, 16 - y);
      if (d === 0) return (x === 0 || x === 16) && (y === 0 || y === 16) ? null : o.line || P.ink;
      if (on(x - 3, y - 3)) return o.fg || ramp[!on(x - 3, y - 4) || !on(x - 4, y - 3) ? n : n - 1];
      if (on(x - 4, y - 4)) return ramp[0];
      if (d === 1) return ramp[y === 1 || x === 1 ? 3 : 1];
      return rp(ramp, (o.fill === undefined ? .3 : o.fill) + (hash(x, y, 7) - .5) * .12, x, y, .8);
    });
  };
  const fromBake = b => { const c = mk(b.w, b.h); c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(b.rgba), b.w, b.h), 0, 0); return c; };
  const halve = b => {
    const w = Math.ceil(b.w / 2), h = Math.ceil(b.h / 2), s = new Spr(w + 2, h + 2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let best = null, bl = -1, n = 0;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const sx = x * 2 + i, sy = y * 2 + j, k = (sy * b.w + sx) * 4;
        if (sx >= b.w || sy >= b.h || !b.rgba[k + 3]) continue;
        const l = b.rgba[k] + b.rgba[k + 1] + b.rgba[k + 2];
        n++;
        if (l > bl) { bl = l; best = [b.rgba[k], b.rgba[k + 1], b.rgba[k + 2]]; }
      }
      if (n >= 2) s.set(x + 1, y + 1, best);
    }
    s.outline();
    return A.sprite(s);
  };
  A.item = (id, size) => {
    const l = DBX.of('item', id), full = l.find(e => e.variant === '0'), map = l.find(e => e.variant === 'map') || full;
    if (!full) return A.glyph('bang', RAMP.honey);
    const big = DBX.bake(full);
    if (size === 'hd') return fromBake(big.w <= 64 && big.h <= 64 ? big : DBX.bake(map));
    return size === 'map' ? fromBake(DBX.bake(map)) : halve(DBX.bake(map));
  };
  A.thing = (cat, id, small) => {
    const l = DBX.of(cat, id), e = l.find(x => x.variant === '0') || l.find(x => /^autumn-0|^summer-0/.test(x.variant)) || l[0];
    return e ? (small ? halve : fromBake)(DBX.bake(e)) : null;
  };
  A.sprite = spr => {
    let x0 = spr.w, y0 = spr.h, x1 = 0, y1 = 0;
    for (let y = 0; y < spr.h; y++) for (let x = 0; x < spr.w; x++) if (spr.c[y * spr.w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const src = spr.canvas(1), c = mk(x1 - x0 + 1, y1 - y0 + 1);
    c.getContext('2d').drawImage(src, -x0, -y0);
    return c;
  };
  A.building = kind => A.sprite(mkBuild(kind, 0));
  A.portrait = (kind, size, bgFn) => {
    const spr = mkPawn(PAWNS[kind].o);
    let top = 0;
    while (top < spr.h && !spr.c.slice(top * spr.w, (top + 1) * spr.w).some(Boolean)) top++;
    const sc = 2, n = Math.ceil(size / sc), src = spr.canvas(1), c = mk(size, size), g = c.getContext('2d');
    if (bgFn) g.drawImage(A.paint(size, size, bgFn), 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(src, spr.ax - n / 2, top - 2, n, n, 0, 0, n * sc, n * sc);
    return c;
  };
  A.pawnFull = kind => A.sprite(mkPawn(PAWNS[kind].o));
})();
