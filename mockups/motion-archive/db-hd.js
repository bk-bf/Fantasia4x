'use strict';
(() => {
  const X = DBX;
  const C = {
    steel: R('#161c26 #27303c #3c4958 #586876 #7b8c97 #a2b1b8 #c9d5d7 #f0f5f3'),
    iron: R('#121418 #1f2228 #2f343b #434a52 #5a636a #747e84 #909a9d #adb5b5'),
    orc: R('#0b0b0d #151518 #212126 #2e2e35 #3e3f47 #51535b #686b73 #868a90 #a8acb0 #c6cacc'),
    rust: R('#24130c #3c1f12 #58301a #754526 #905e36 #a87a4c #bd9868 #d0b488'),
    bronze: R('#2a1c0c #453012 #66491a #8a6724 #ae8934 #cfac4c #e8cf78 #f8ecb0'),
    copper: R('#30140c #501f12 #74321a #9a4a26 #be6a38 #da9058 #eeb888 #fadcb8'),
    gold: R('#3e2806 #62420a #8a6010 #b4841a #d8aa2e #f0cc54 #fbe68c #fff6c8'),
    silver: R('#2c3038 #444a56 #626a76 #868e98 #aab2b8 #cbd2d4 #e6eaea #fbfcfa'),
    lead: R('#1c1e24 #2c3038 #40454e #575d66 #70777f #8b9198 #a6abae'),
    tin: R('#3a3e42 #54595d #72787b #92989a #b2b7b7 #d0d4d2 #eaecea'),
    alloy: R('#181a2a #282c44 #3e4464 #5b6488 #808bac #aab5d0 #d3dcee #f6f8ff'),
    flint: R('#111318 #1d2128 #2c323b #3f4752 #56606c #727d88 #949ea6 #bcc4c8'),
    chert: R('#2a2218 #403424 #5a4a32 #766244 #927c58 #ad9870 #c6b48c'),
    stone: R('#222227 #33343a #47494f #5e6167 #787b80 #95989a #b2b4b2 #cfd0cc'),
    bone: R('#3e3424 #5c4e36 #7e6e4e #a09068 #c0b188 #d9cdaa #ece4c8 #faf6e6'),
    wood: R('#1e130c #302014 #45301c #5c4226 #755633 #8f6e44 #a8885a #c0a476'),
    ash: R('#3a2c18 #54401f #70572b #8d703a #a98b4f #c2a66c #d8c08c #eadaae'),
    dark: R('#150c08 #24150c #362012 #4a2e1a #5f3e24 #755030 #8c6540 #a37c54'),
    bark: R('#17110d #261c15 #382a1f #4b3a2a #5f4b37 #745e46'),
    leather: R('#1e100a #321b10 #4a2917 #643a20 #7f4e2c #9a653c #b47f50 #cc9c6a'),
    hide: R('#33261a #4c3a26 #675034 #836844 #9e8258 #b89d70 #d0b88c #e4d2aa'),
    black: R('#0a090b #141216 #201d23 #2e2a32 #3e3943 #514b56 #665f6b'),
    cord: R('#3e321c #5a4a2a #78643a #96804e #b39c66 #cdb884 #e2d2a6'),
    sinew: R('#4a3a30 #6a5444 #8a705a #a88e74 #c4ac90 #dccab0 #efe2cc'),
    cloth: R('#4a4234 #655b48 #82765e #a09378 #bcb094 #d6ccb2 #ebe4d0'),
    red: R('#2c0a0e #4a1014 #6e181c #942428 #b83a38 #d65c50 #ea8a78'),
    blue: R('#0e1630 #16264e #223a72 #325496 #4c74b6 #7098d0 #9cbee6'),
    green: R('#0e2012 #18341c #264c28 #386838 #50864c #70a468 #98c28c'),
    patina: R('#1e4a3c #2e6a56 #44886e #62a688 #88c2a4'),
    char: R('#0c0a0a #181412 #261f1b #382d26 #4c3e34'),
    clay: R('#3c2014 #5a301e #7a442a #9a5c3a #b6784e #cc9468 #dfb088'),
    glass: R('#24403e #386058 #528076 #74a296 #9cc2b4 #c6e0d2 #e8f6ee'),
    wicker: R('#3a2a14 #56401e #74582a #92723a #ae8e50 #c8aa6c #dcc48c'),
  };
  const MAT = {
    steel: { r: C.steel, d: .3, n: .05, ns: .3, shine: 1 },
    iron: { r: C.iron, d: .55, n: .22, ns: .5, pit: .07, shine: .45 },
    orc: { r: C.orc, d: .6, n: .3, ns: .6, pit: .1, shine: .3, jag: 1 },
    rust: { r: C.rust, d: .7, n: .34, ns: .6, pit: .12, shine: .2, jag: 1 },
    bronze: { r: C.bronze, d: .35, n: .1, ns: .4, pit: .03, shine: .8 },
    copper: { r: C.copper, d: .4, n: .12, ns: .4, shine: .6, pat: 1 },
    gold: { r: C.gold, d: .3, n: .05, ns: .3, shine: 1 },
    silver: { r: C.silver, d: .3, n: .05, ns: .3, shine: 1 },
    lead: { r: C.lead, d: .5, n: .14, ns: .4, shine: .3 },
    tin: { r: C.tin, d: .4, n: .08, ns: .4, shine: .7 },
    alloy: { r: C.alloy, d: .3, n: .05, ns: .3, shine: 1, rune: 1 },
    flint: { r: C.flint, d: .2, knap: 7 },
    stone: { r: C.stone, d: .6, n: .3, ns: .55, pit: .08 },
    bone: { r: C.bone, d: .3, n: .1, ns: .5, grain: 1 },
  };
  const matOf = o => {
    const id = o.id;
    if (/rune/.test(id)) return MAT.alloy;
    for (const k of ['steel', 'iron', 'bronze', 'copper', 'flint', 'gold', 'silver', 'lead', 'tin']) if (id.includes(k)) return MAT[k];
    if (/stone/.test(id)) return MAT.stone;
    if (/bone|fang|tusk|antler|gnoll|skull|ivory/.test(id)) return MAT.bone;
    if (/orc|gravemaker|anvil_breaker|flenser|chainbiter|iron_tide/.test(id)) return MAT.orc;
    if (/goblin|warren|kobold/.test(id)) return MAT.rust;
    const t = o.src && o.src.tier;
    return t >= 3 ? MAT.steel : t === 2 ? MAT.iron : t === 1 ? MAT.bronze : MAT.iron;
  };
  const tierOf = o => { const m = matOf(o); return m === MAT.alloy ? 4 : m === MAT.steel ? 3 : m === MAT.iron || m === MAT.orc || m === MAT.rust ? 2 : m === MAT.bronze || m === MAT.copper ? 1 : 0; };
  const tone = (m, L, x, y) => {
    if (m.n) L += (noise(x * m.ns, y * m.ns, 3) - .5) * m.n;
    if (m.pit && hash(x, y, 17) < m.pit) L -= .2;
    if (m.grain) L += (hash(Math.floor((x + y) * .8), 3, 5) - .5) * .14 + (noise(x * .2, y * .2, 8) > .7 ? -.1 : 0);
    if (m.pat && noise(x * .3, y * .3, 9) > .76 && L < .5) return rp(C.patina, L + .1, x, y, .5);
    return rp(m.r, L, x, y, m.d);
  };
  const knap = (m, x, y, D, sd, o) => {
    o = o || {};
    const id = vor(x, y, m.knap || o.sc || 7, sd), e = VEDGE, lx = VDX, ly = VDY;
    let L = .36 + (id - .5) * .3 - (lx + ly) * .03;
    L += Math.sin(Math.hypot(lx, ly) * 1.7 + id * 6) * .04;
    if (e < 1.1) L += lx + ly < 0 ? .3 : -.14;
    if (D && D.all < 1.6) L += .2;
    if (D && D.edge < 2.6) L += .16;
    if (o.cortex && D && D.back < o.cortex + (noise(x * .4, y * .4, sd) - .5) * 3) return rp(C.chert, .5 + (noise(x * .7, y * .7, sd + 1) - .5) * .5 - (D.back < 1.4 ? .2 : 0), x, y, .5);
    return rp(m.r, L, x, y, m.d);
  };
  const flake = (m, F, o) => {
    o = o || {};
    const sd = o.sd || 1, pitch = o.pitch || 5;
    return (x, y, D) => {
      const [q, r0] = F.inv(x, y), r = r0 - (o.ridge ? o.ridge(q) : 0), side = r < 0 ? 0 : 1, k = F.k;
      const sl = (q + Math.abs(r) * .6) * k / pitch + side * .37, i = Math.floor(sl), f = sl - i;
      let L = (side ? .28 : .5) + (hash(i, side, sd) - .5) * .24 + (f - .5) * .12;
      if (f < .14) L -= .18; else if (f < .32) L += .1;
      if (Math.abs(r) * k < .9) L = side ? .46 : .8;
      if (D.all < 3.6) { const sj = q * k / (pitch * .46) + side * .5, j = Math.floor(sj), g = sj - j; L = (side ? .38 : .6) + (hash(j, side + 5, sd) - .5) * .28; if (g < .22) L -= .2; }
      if (D.all < 1.3) L += .2;
      if (o.cortex && D.back < o.cortex + (noise(x * .4, y * .4, sd) - .5) * 3) return rp(C.chert, .52 + (noise(x * .7, y * .7, sd + 1) - .5) * .5 - (D.back < 1.4 ? .2 : 0), x, y, .5);
      return rp(m.r, L, x, y, .2);
    };
  };
  const IC = () => new Spr(64, 64, 0, 0);
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const frame = (a, b, t, k) => {
    k = k || 1;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, o = t === undefined ? a : lerp(a, b, t);
    const F = (q, r) => [o[0] + (ux * q - uy * r) * k, o[1] + (uy * q + ux * r) * k];
    F.inv = (x, y) => { const px = x + .5 - o[0], py = y + .5 - o[1]; return [(px * ux + py * uy) / k, (-px * uy + py * ux) / k]; };
    F.pts = l => l.map(p => { const c = F(p[0], p[1]); return [c[0], c[1], p[2]]; });
    F.len = L / k; F.o = o; F.u = [ux, uy]; F.k = k;
    return F;
  };
  const stroke = (s, pts, wf, cf, o) => {
    o = o || {};
    if (typeof wf === 'number') { const w0 = wf; wf = () => w0; }
    const segs = [], n = pts.length - 1; let L = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < n; i++) { const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], l = Math.hypot(dx, dy); if (l < 1e-6) continue; segs.push({ a: pts[i], ux: dx / l, uy: dy / l, l, l0: L }); L += l; }
    if (!segs.length) return;
    for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    const pad = o.pad || 10, first = segs[0], last = segs[segs.length - 1];
    for (let y = Math.max(0, Math.floor(y0 - pad)); y <= Math.min(s.h - 1, Math.ceil(y1 + pad)); y++) for (let x = Math.max(0, Math.floor(x0 - pad)); x <= Math.min(s.w - 1, Math.ceil(x1 + pad)); x++) {
      let best = null, bd = 1e9, bq = 0, bv = 0;
      for (const g of segs) {
        const px = x + .5 - g.a[0], py = y + .5 - g.a[1], q = px * g.ux + py * g.uy, qc = clamp(q, 0, g.l), d = Math.hypot(px - g.ux * qc, py - g.uy * qc);
        if (d < bd) { bd = d; best = g; bq = q; bv = -px * g.uy + py * g.ux; }
      }
      if (!o.round && ((best === first && bq < 0) || (best === last && bq > best.l))) continue;
      const t = clamp((best.l0 + clamp(bq, 0, best.l)) / L, 0, 1), hw = wf(t);
      if (hw <= 0 || bd > hw) continue;
      const v = bv < 0 ? -bd : bd, c = cf(t, v / hw, v, hw, x, y);
      if (c) s.set(x, y, c, o.e);
    }
  };
  const poly = (s, pts, cf, o) => {
    const n = pts.length; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(s.h - 1, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(s.w - 1, Math.ceil(x1)); x++) {
      const px = x + .5, py = y + .5, D = { all: 1e9 }; let ins = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const a = pts[j], b = pts[i];
        if ((a[1] > py) !== (b[1] > py) && px < (b[0] - a[0]) * (py - a[1]) / (b[1] - a[1]) + a[0]) ins = !ins;
        const ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey || 1, t = clamp(((px - a[0]) * ex + (py - a[1]) * ey) / l2, 0, 1), d = Math.hypot(px - a[0] - ex * t, py - a[1] - ey * t);
        if (d < D.all) D.all = d;
        const tg = a[2] || 'e'; if (!(D[tg] < d)) D[tg] = d;
      }
      if (!ins) continue;
      const c = cf(x, y, D);
      if (c) s.set(x, y, c, o && o.e);
    }
  };
  const qv = (p0, c, p1, tag, n) => { n = n || 10; const out = []; for (let i = 0; i < n; i++) { const t = i / n, p = lerp(lerp(p0, c, t), lerp(c, p1, t), t); out.push([p[0], p[1], tag]); } return out; };
  const bez = (p0, c, p1, n) => [...qv(p0, c, p1, null, n || 14).map(p => [p[0], p[1]]), p1];
  const arc = (cx, cy, rx, ry, a0, a1, n) => { n = n || 20; const out = []; for (let i = 0; i <= n; i++) { const t = a0 + (a1 - a0) * i / n; out.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]); } return out; };
  const rough = (pts, amp, sd, keep) => {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.round(l / 3.2));
      for (let j = 0; j < k; j++) { const p = lerp(a, b, j / k), f = keep && keep.includes(a[2]) ? .35 : 1; out.push([p[0] + (hash(i, j, sd) - .5) * amp * f, p[1] + (hash(i, j, sd + 1) - .5) * amp * f, a[2]]); }
    }
    return out;
  };
  const sel = (s, k) => {
    k = k === undefined ? .26 : k;
    const { w, h, c } = s, add = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (c[i]) continue;
      let r = 0, g = 0, b = 0, m = 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const q = c[yy * w + xx]; if (q) { r += q[0]; g += q[1]; b += q[2]; m++; } }
      if (m) add.push([i, [r / m * k + 6, g / m * k + 5, b / m * k + 9]]);
    }
    for (const [i, col] of add) c[i] = col;
    return s;
  };
  const part = (s, fn, o) => {
    const t = IC(); fn(t); if (!o || o.line !== 0) sel(t, o && o.k);
    for (let i = 0; i < t.c.length; i++) if (t.c[i]) { s.c[i] = t.c[i]; s.e[i] = t.e[i]; }
    return s;
  };
  const woodC = (W, sd, o) => {
    o = o || {};
    return (t, u, v, hw, x, y) => {
      let L = .56 - u * .3;
      if (u > .5) L -= .12; if (u < -.55) L += .08;
      L += (hash(Math.floor((v + 30) * 1.15 + Math.sin(t * 8 + sd) * .9), sd, 3) - .5) * .2;
      if (o.bark && noise(x * .55, y * .55, sd) > .58) return rp(C.bark, L - .1 + (hash(x, y, sd) - .5) * .2, x, y, .4);
      if (o.knot && Math.abs(t - o.knot) < 1.6 / (o.len || 50) && Math.abs(u) < .5) L -= .26;
      if (o.char && t > o.char) return rp(C.char, L + .1 - (t - o.char) * .4, x, y, .5);
      return rp(W, L, x, y, .25);
    };
  };
  const haft = (s, pts, w, W, o) => { o = o || {}; stroke(s, pts, w, woodC(W, o.seed || 1, o), { round: o.round }); };
  const cordC = (R2, pitch, len) => (t, u, v, hw, x, y) => {
    const k = t * len / pitch + u * .7, f = k - Math.floor(k);
    return rp(R2, .3 + Math.sin(f * 3.1416) * .42 - u * .2, x, y, .15);
  };
  const lash = (s, F, q0, q1, hw, R2, pitch) => stroke(s, [F(q0, 0), F(q1, 0)], hw, cordC(R2, pitch || 2.3, Math.abs(q1 - q0)));
  const strand = (s, p0, p1, R2, w) => stroke(s, [p0, p1], w || 1, (t, u, v, hw, x, y) => rp(R2, .62 - u * .3, x, y, .1), { round: 1 });
  const metalFace = (m, F, o) => {
    o = o || {};
    const bw = o.bevel === undefined ? 2.6 : o.bevel;
    return (x, y, D) => {
      const [q, r] = F.inv(x, y);
      let L = .44 - (x + y - F.o[0] - F.o[1]) * .007;
      if (m.shine > .7) L += Math.max(0, Math.sin((x - y) * .16 + (o.ph || 0)) - .55) * .5 * m.shine;
      if (o.eye && Math.abs(r) < o.eye) L += .1 - Math.abs(r) / o.eye * .06;
      if (o.eye && Math.abs(Math.abs(r) - o.eye - .6) < .6) L -= .14;
      if (D.top < 1.3) L += .16; if (D.bot < 1.3) L -= .16; if (D.poll < 1.3) L -= .1;
      if (D.edge < bw) L = .72 + m.shine * .22 - D.edge * .03 + (m.jag ? (hash(x, y, 4) - .5) * .2 : 0);
      else if (D.edge < bw + 1.1) L -= .16;
      if (o.fuller && o.fuller(q, r)) L -= .2;
      return tone(m, L, x, y);
    };
  };
  const bladeC = (m, o) => {
    o = o || {};
    return (t, u, v, hw, x, y) => {
      let L;
      if (o.single) {
        L = .5 - u * .08;
        if (u < -1 + 1.6 / hw) L = .34; else if (u > 1 - Math.min(.7, 2.4 / hw)) L = .82 + m.shine * .14; else if (u > 1 - Math.min(.8, 3.4 / hw)) L = .4;
        if (o.fuller && u < -.2 && u > -.55 && t < .8) L -= .16;
      } else {
        L = u < 0 ? .66 : .4;
        if (hw > 2.4 && Math.abs(v) < .7) L = u < 0 ? .86 : .56;
        if (o.fuller && hw > 2.4 && Math.abs(v) < hw * .3 && t < o.fuller) L = v < 0 ? .3 : .5;
        if (Math.abs(u) > 1 - 1.3 / hw) L = u < 0 ? .9 : .58;
      }
      if (m.shine > .7) L += Math.max(0, Math.sin(t * (o.gl || 15) + 1.2) - .82) * 1.2 * m.shine;
      if (m.jag && hash(Math.floor(t * 40), 3, 9) > .8 && Math.abs(u) > .7) return null;
      return tone(m, L, x, y);
    };
  };
  const blade = (s, a, b, w, m, o) => {
    o = o || {};
    const tip = o.tip === undefined ? .8 : o.tip;
    const wf = t => {
      let k = o.leaf ? .62 + .38 * Math.sin(Math.min(1, t / tip) * 2.5 + .35) : 1 - (o.taper || 0) * t;
      if (t > tip) k *= Math.pow(Math.max(0, (1 - t) / (1 - tip)), o.pow || .8);
      return w * k + (t > tip ? 0 : 0);
    };
    stroke(s, [a, b], wf, bladeC(m, o));
  };
  const ball = (s, p, r, m, o) => {
    o = o || {};
    const rx = r, ry = o.ry || r;
    for (let y = Math.floor(p[1] - ry); y <= Math.ceil(p[1] + ry); y++) for (let x = Math.floor(p[0] - rx); x <= Math.ceil(p[0] + rx); x++) {
      const nx = (x + .5 - p[0]) / rx, ny = (y + .5 - p[1]) / ry, q = nx * nx + ny * ny; if (q > 1) continue;
      const nz = Math.sqrt(1 - q); let L = .5 + (nx * LV[0] + ny * LV[1] + nz * LV[2]) * .5;
      if (m.shine > .5 && Math.hypot(nx + .38, ny + .4) < .26) L = 1;
      s.set(x, y, m.knap ? knap(m, x, y, null, o.seed || 2) : tone(m, L, x, y), o.e);
    }
  };
  const glyphs = (s, pts, n, o) => {
    o = o || {};
    const G = [[[0, 0], [0, 1], [0, 2], [1, 0]], [[0, 0], [1, 1], [0, 2]], [[0, 0], [1, 0], [1, 1], [1, 2]], [[1, 0], [0, 1], [1, 2], [1, 1]], [[0, 0], [0, 1], [1, 1], [0, 2], [1, 2]]];
    for (let k = 0; k < n; k++) {
      const p = lerp(pts[0], pts[1], n === 1 ? .5 : k / (n - 1)), g = G[(k + (o.seed || 0)) % G.length];
      for (const [dx, dy] of g) { const x = Math.round(p[0]) + dx, y = Math.round(p[1]) + dy; if (s.get(x, y)) s.set(x, y, o.col || [150, 235, 255], o.e === undefined ? 190 : o.e); }
    }
  };
  const half = s => {
    const o = new Spr(32, 32, 0, 0);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const px = []; for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const k = (y * 2 + j) * 64 + x * 2 + i; if (s.c[k]) px.push(k); }
      if (px.length < 2) continue;
      let best = px[0], bl = -1;
      for (const k of px) { const c = s.c[k], l = c[0] + c[1] + c[2]; if (l > bl) { bl = l; best = k; } }
      o.c[y * 32 + x] = s.c[best]; o.e[y * 32 + x] = s.e[best];
    }
    o.outline();
    if (s.emit) o.emit = { ...s.emit, dx: s.emit.dx / 2, dy: s.emit.dy / 2 };
    return o;
  };
  const makers = [];
  const reg = (id, make) => {
    X.drop('item', id);
    const e = X.reg('item', id, '0', make, { icon: true, at: [0, 0], cell: 64 });
    X.reg('item', id, 'map', () => half(X.built(e)), { icon: true, at: [0, 0], cell: 32 });
  };
  const prev = X.fromData;
  X.fromData = objects => {
    X.data = objects;
    for (const o of objects) {
      if (o.cat !== 'item' || X.skipReason(o)) continue;
      for (const mk of makers) { const f = mk(o); if (f) { reg(o.id, f); break; } }
    }
    prev(objects);
  };
  X.hd = { C, MAT, matOf, tierOf, tone, knap, flake, IC, lerp, frame, stroke, poly, qv, bez, arc, rough, sel, part, woodC, haft, cordC, lash, strand, metalFace, bladeC, blade, ball, glyphs, half, makers, reg };
})();
