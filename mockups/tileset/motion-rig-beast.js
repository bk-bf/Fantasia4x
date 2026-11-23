'use strict';
const QG = { W: 120, H: 84, CX: 54, GY: 66 };
const QKIT = new Map();
const rot2 = (x, y, ox, oy, deg) => { const a = deg * D2R, c = Math.cos(a), sn = Math.sin(a); return [ox + (x - ox) * c - (y - oy) * sn, oy + (x - ox) * sn + (y - oy) * c]; };
const furOpt = o => ({ n: o.shag || .22, ns: .85, seed: 3, d: .14 });

function quadKit(kind) {
  let K = QKIT.get(kind);
  if (K) return K;
  const o = BEASTS[kind].o, L = o.L, Hb = o.Hb, fur = o.fur, n = fur.length - 1, bo = furOpt(o), hr = o.head;
  const body = new Spr(110, 80, 55, 40), cx = 55, cy = 40;
  body.ball(cx, cy, L, Hb, 0, fur, bo);
  body.ball(cx + L * .5, cy - (o.hump || 0) - .5, L * .56, Hb * 1.06 + (o.hump || 0), .5, fur, bo);
  body.ball(cx - L * .55, cy + .4, L * .5, Hb * .98, .3, fur, bo);
  if (o.belly) for (let y = rnd(cy + Hb * .3); y <= cy + Hb + 1; y++) for (let x = cx - L - 2; x <= cx + L + 2; x++) { const c = body.get(x, y), i = fur.indexOf(c); if (i >= 0) body.set(x, y, o.belly[clamp(i + 1, 0, o.belly.length - 1)]); }
  if (o.mane) for (let k = 0; k < 14; k++) { const x = cx + L * .2 + k, y = cy - Hb - (o.hump || 0) - 1 + (k > 9 ? k - 9 : 0); body.set(x, y, o.mane[2 + (k & 1)]); body.set(x, y - 1 - (k & 1), o.mane[1 + (k % 3)]); }
  const ex = { head: [], body: [] };
  if (o.extra) {
    const t = new Spr(140, 110), gx = 60, gcy = 60, hx = gx + L + hr * .35 + (o.neck || 0), hy = gcy - (o.up || 0), sl = o.snout || 0, sx = hx + hr * .7 + sl * .5, sy = hy + hr * .28;
    o.extra(t, { cx: gx, cy: gcy, hx, hy, hr, tip: rnd(sx + sl * .5 + .8), sy, gy: gcy + o.leg + Hb - 2, L, Hb, ax: rnd(hx - hr * .35), ay: rnd(hy - hr * .8), ex: rnd(hx + hr * .2), ey: rnd(hy - hr * .3) });
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
      const c = t.c[y * t.w + x]; if (!c) continue;
      const head = x > gx + L * .75 || (x > gx + L * .45 && y < gcy - Hb - 1);
      if (head) ex.head.push([x - hx, y - hy, c, x > hx + hr * .5 && y > hy - hr * .5]); else ex.body.push([x - gx, y - gcy, c]);
    }
    for (const [dx, dy, c] of ex.body) body.set(cx + dx, cy + dy, c);
  }
  K = { o, body, ex, heads: new Map() };
  QKIT.set(kind, K);
  return K;
}

function quadHead(K, v) {
  const key = (v.a || 0) + '|' + (v.ear || 0) + '|' + (v.blink ? 1 : 0) + '|' + (v.jaw ? 1 : 0);
  let s = K.heads.get(key);
  if (s) return s;
  const o = K.o, fur = o.fur, n = fur.length - 1, bo = furOpt(o), hr = o.head, a = v.a || 0;
  s = new Spr(84, 84, 42, 42);
  const hx = 42, hy = 42, sl = o.snout || 0, R = (x, y) => rot2(x, y, hx, hy, a);
  s.ball(hx, hy, hr, hr * .92, 2, fur, bo);
  const sx0 = hx + hr * .7 + sl * .5, sy0 = hy + hr * .28, [sx, sy] = R(sx0, sy0), k = Math.abs(Math.sin(a * D2R));
  if (sl) s.ball(sx, sy, mix(sl * .5 + 1.6, o.snoutH || 2.8, k), mix(o.snoutH || 2.8, sl * .5 + 1.6, k), 2.5, o.muzzle || fur, { d: .14, bias: .08 });
  if (!o.beak) {
    const [tx, ty] = R(sx0 + sl * .5 - .2, sy0 - 1), [m0x, m0y] = R(hx + hr * .7, sy0 + 1.6), [m1x, m1y] = R(hx + hr * .7 + Math.max(2, sl * .7), sy0 + 1.6);
    if (v.jaw) { const [j0x, j0y] = R(hx + hr * .6, sy0 + 2.2), [j1x, j1y] = R(hx + hr * .7 + sl * .75, sy0 + 4.6); s.thick(j0x, j0y, j1x, j1y, 2, o.muzzle || fur, 2); s.line(m0x, m0y + 1, m1x, m1y + 1, P.red[1]); s.set(m1x - 1, m1y + 1, P.bone[5]); s.set(m1x - 3, m1y + 1, P.bone[5]); }
    s.line(m0x, m0y, m1x, m1y, fur[0]);
    s.rect(rnd(tx), rnd(ty), 2, 2, P.ink); s.set(rnd(tx), rnd(ty), P.furGrey[2]);
  }
  const ex = rnd(hx + hr * .2), ey = rnd(hy - hr * .3);
  if (v.blink) s.rect(ex - 1, ey, 4, 1, fur[1]);
  else { s.rect(ex, ey, 2, 2, o.eye || P.ink, o.eye ? 230 : 0); s.set(ex, ey, o.eye ? P.cloth[5] : P.furGrey[3], o.eye ? 230 : 0); }
  s.rect(ex - 1, ey - 1, 4, 1, fur[1]);
  const ax = rnd(hx - hr * .35), ay = rnd(hy - hr * .8), ear = v.ear || 0;
  if (o.ears === 'point') for (const [dx, sh] of [[3, 1], [-1, 0]]) for (let j = 0; j < (ear < 0 ? 3 : 5); j++) for (let i = 0; i < (5 - j + 1) / 2 + .5; i++) {
    const x = ax + dx + i + (ear < 0 ? -j * 2 : ear > 0 ? j >> 2 : j >> 1), y = ay - j + (ear < 0 ? 1 : 0);
    s.set(x, y, sh ? fur[n - 3] : fur[i === 0 ? n - 1 : n - 2]);
    if (!sh && j < 3 && i === 1) s.set(x, y, o.inner || fur[1]);
  }
  if (o.ears === 'round') { s.oval(ax + 5, ay, 2.6, 2.6, () => fur[n - 3]); s.oval(ax, ay, 2.8, 2.8, (x, y, nx, ny) => Math.hypot(nx, ny) < .45 ? fur[1] : fur[n - 1]); }
  if (o.ears === 'leaf') {
    if (ear > 0) { for (let j = 0; j < 5; j++) s.rect(ax - 1 - (j >> 1), ay + 1 - j, 2, 2, fur[n - 1]); s.set(ax - 2, ay - 1, P.skinPale[3]); }
    else if (ear < 0) { for (let j = 0; j < 4; j++) s.rect(ax - 3 - j, ay + 2 + (j >> 1), 2, 2, fur[n - 1]); s.set(ax - 4, ay + 3, P.skinPale[3]); }
    else { for (let j = 0; j < 4; j++) s.rect(ax - 3 - j, ay + 1 - (j >> 1), 2, 2, fur[n - 1]); s.set(ax - 4, ay + 1, P.skinPale[3]); }
  }
  if (o.ears === 'flap') s.oval(ax - 3, ay + 9, 5.5, 9, M.fur(fur.map(c => dark(c, .62)), n - 1, 3));
  for (const [dx, dy, c, front] of K.ex.head) { const q = front ? R(hx + dx, hy + dy) : [hx + dx, hy + dy]; s.set(q[0], q[1], c); }
  s.tip = R(sx0 + sl * .5 + 1.5, sy0 + 1);
  K.heads.set(key, s);
  return s;
}

function stamp(dst, src, ox, oy, shear) {
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const c = src.c[y * src.w + x]; if (!c) continue;
    dst.set(ox + x - src.ax, oy + y - src.ay + (shear ? shear(x - src.ax) : 0), c, src.e[y * src.w + x]);
  }
}

function rigQuad(kind, p) {
  p = p || {};
  const K = quadKit(kind), o = K.o, s = new Spr(QG.W, QG.H, QG.CX, QG.GY), gy = QG.GY, L = o.L, Hb = o.Hb, fur = o.fur, n = fur.length - 1, bo = furOpt(o);
  const cx = QG.CX + rnd(p.bx || 0), by = p.by || 0, pitch = p.pitch || 0, cy = gy - o.leg - Hb + 2 + rnd(by), legw = o.legw || 4, farFur = fur.map(c => dark(c, .62)), st = p.stretch || 0;
  const legX = [cx - L + 2 - st, cx + L - legw - 3 + st], feet = p.feet || [[0, 0], [0, 0], [0, 0], [0, 0]], Lg = o.leg + Hb * .7 - 4, pts = s.pts = { feet: [] };
  const sh = dx => rnd(-pitch * dx / L);
  const leg = (x, far, front, ft) => {
    x = rnd(x);
    const lr = far ? farFur : fur, rx = x + (legw >> 1), ry = cy + Hb * .3 + 2 + sh(front ? L : -L), l1 = Lg * .52, l2 = Lg * .5, thin = legw > 3 ? 1 : 0;
    s.ball(x + legw / 2, ry, legw * .95, 5, far ? -3 : 3, lr, bo);
    const [jx, jy, ex, ey] = ik2(rx, ry, rx + ft[0], gy - ft[1], l1, l2, front ? -1 : 1);
    const col = w => (t, k) => lr[clamp(n - 2 + (k === 0 ? 1 : k >= w - 2 ? -1 : 0), 0, n)];
    rigLimb(s, [[rx, ry + 2], [jx, jy]], legw, col(legw));
    rigLimb(s, [[jx, jy], [ex, ey]], legw - thin, col(legw - thin));
    const fx = rnd(ex) - (legw >> 1), fy = rnd(ey), hoof = o.hoof ? (far ? dark(o.hoof, .8) : o.hoof) : null;
    for (let i = 0; i < legw + 1; i++) { s.set(fx + i, fy, hoof || lr[1]); if (o.hoof) s.set(fx + i, fy - 1, hoof); else if (i === legw) s.set(fx + i, fy - 1, lr[n - 2]); }
    pts.feet.push([fx + legw / 2, fy, ft[1] < .6]);
  };
  leg(legX[0] + 4, true, false, feet[0]); leg(legX[1] + 4, true, true, feet[1]);
  const tl = p.tail || {}, ta = (35.8 + (tl.a || 0)) * D2R, tw = tl.w || 0, tph = tl.ph || 0, ty0 = cy + sh(-L);
  if (o.tail === 'bushy') for (let k = 0; k < 6; k++) { const wv = Math.sin(k * .9 + tph) * tw * k / 5; s.ball(cx - L - st - 2 - Math.cos(ta) * k * 2.22 - Math.sin(ta) * wv, ty0 + 1 + Math.sin(ta) * k * 2.22 - Math.cos(ta) * wv, 4.6 - k * .4, 3.2 - k * .2, -1, k > 3 ? (o.tip || fur) : fur, bo); }
  if (o.tail === 'short') s.ball(cx - L - st - 1, ty0 - 1 - (tl.a ? 2 : 0) + rnd(tw * Math.sin(tph)), 2.6, 2.4 + (tl.a ? 1 : 0), 0, o.tip || fur, bo);
  if (o.tail === 'long') for (let k = 0; k < L + 6; k++) { const y = ty0 + 1 + Math.sin(k * .45 + tph) * 2 + k * .25, tp = o.tip || fur; s.set(cx - L - k, y, tp[Math.min(3, tp.length - 1)]); s.set(cx - L - k, y + 1, tp[1]); }
  if (o.tail === 'fat') { const tlen = Math.min(L + 6, cx - L - 1); for (let k = 0; k < tlen; k++) { const w = Math.max(1, Hb * (1 - k / tlen) * .9), y = ty0 + 1 + Math.sin(k * .3 + tph) * (1.5 + tw); for (let j = -w; j <= w; j++) s.set(cx - L + 2 - k, y + j, fur[clamp(n - 2 - rnd(j / w * 1.4) - (k % 3 === 0 ? 1 : 0), 0, n)]); } }
  if (o.tail === 'tuft') { const sw = rnd(Math.sin(tph) * tw); s.thick(cx - L - st, ty0 - 3, cx - L - st - 4 + sw, ty0 + Hb + 3, 2, fur, n - 2); s.ball(cx - L - st - 4 + sw, ty0 + Hb + 5, 2.4, 3, 0, farFur, bo); }
  if (o.belly) for (let y = rnd(cy + Hb * .3); y <= cy + Hb + 6; y++) for (let x = 0; x < cx - L + 4; x++) { const c = s.get(x, y), i = fur.indexOf(c); if (i >= 0) s.set(x, y, o.belly[clamp(i + 1, 0, o.belly.length - 1)]); }
  stamp(s, K.body, cx, cy, pitch ? sh : null);
  leg(legX[0], false, false, feet[2]); leg(legX[1], false, true, feet[3]);
  const hd = p.head || [0, 0], hr = o.head, hx0 = cx + L + hr * .35 + (o.neck || 0) + st, hy0 = cy - (o.up || 0) + sh(L), hx = rnd(hx0 + hd[0]), hy = rnd(hy0 + hd[1]);
  const nx0 = cx + L * .7 + st, ny0 = cy - Hb * .3 + sh(L * .7), nd = Math.hypot(hx - 1 - nx0, hy + 2 - ny0);
  if (o.up > 3 || nd > hr + 3) { const nw = o.neckw || (o.up > 3 ? 3.6 : hr * .66), m = Math.max(8, rnd(nd / 1.6)); for (let k = 0; k <= m; k++) s.ball(mix(nx0, hx - 1, k / m), mix(ny0, hy + 2, k / m), nw, nw, 1, fur, bo); }
  const H = quadHead(K, { a: p.snout || 0, ear: p.ear || 0, blink: p.blink, jaw: p.jaw });
  stamp(s, H, hx, hy);
  pts.head = [hx, hy - hr - 5]; pts.mouth = [hx + H.tip[0] - 42, hy + H.tip[1] - 42]; pts.body = [cx, cy];
  s.outline();
  s.sh = { rx: L + 4, ry: Math.max(4, Hb * .5), dx: 3, dy: 0 };
  return s;
}

function rigQuadFB(kind, p, back) {
  p = p || {};
  const o = BEASTS[kind].o, s = new Spr(QG.W, QG.H, QG.CX, QG.GY), gy = QG.GY, cx = QG.CX, L = o.L, Hb = o.Hb, fur = o.fur, n = fur.length - 1, bo = furOpt(o), lw = Math.max(3, (o.legw || 4) - 1), hr = o.head;
  const far = fur.map(c => dark(c, .62)), by = rnd(p.by || 0), dep = rnd(L * .36), bw = Hb * 1.28, cyN = gy - o.leg - Hb * .5 + by, cyF = cyN - dep, gap = rnd(bw * .42), feet = p.feet || [[0, 0], [0, 0], [0, 0], [0, 0]], pts = s.pts = { feet: [] };
  const col = (x, y0, y1, lr, sd) => { for (let y = rnd(y0); y <= y1; y++) for (let i = 0; i < lw; i++) s.set(x + i, y, lr[clamp(n - 2 + (i === 0 ? 1 : i >= lw - 1 ? -1 : 0), 0, n)]); for (let i = 0; i < lw + 1; i++) s.set(x + i - (sd < 0 ? 1 : 0), y1, lr[1]); pts.feet.push([x + lw / 2, y1, true]); };
  const fa = back ? [feet[1], feet[3]] : [feet[0], feet[2]], na = back ? [feet[0], feet[2]] : [feet[1], feet[3]], tw = p.tail || {}, sway = rnd(tw.w ? Math.sin(tw.ph || 0) * tw.w : 0);
  const ears = (hx, hy, ear, shadeBoth) => { if (o.ears !== 'point') { if (o.ears === 'round') for (const sd of [-1, 1]) s.oval(hx + sd * hr * .75, hy - hr * .7, 2.8, 2.8, (x, y, nx, ny) => Math.hypot(nx, ny) < .45 && !shadeBoth ? fur[1] : fur[sd < 0 ? n - 1 : n - 3]); return; } for (const sd of [-1, 1]) for (let j = 0; j < (ear < 0 ? 4 : 7); j++) { const w = Math.max(1, 4 - (j >> 1)); for (let i = 0; i < w; i++) { const x = rnd(hx + sd * (hr * .9 - i - (ear < 0 ? -j * .6 : j * .25))) - (sd > 0 ? 1 : 0), y = rnd(hy - hr * .55 - j); s.set(x, y, !shadeBoth && i > 0 && i < w - 1 && j < 4 ? (o.inner || fur[1]) : fur[sd < 0 ? n - 1 : n - 3]); } } };
  col(cx - gap - lw - 1, cyF, gy - dep - rnd(fa[0][1]), far, -1); col(cx + gap + 1, cyF, gy - dep - rnd(fa[1][1]), far, 1);
  if (back) {
    const hy = rnd(cyF - (o.up || 0) * .5 - hr * .5 + (p.head || [0, 0])[1]), hx = cx + rnd((p.head || [0, 0])[0]);
    s.ball(hx, hy, hr, hr * .92, 0, fur, bo); ears(hx, hy, p.ear || 0, true);
    s.ball(cx, cyF, bw * .9, Hb * .92 + (o.hump || 0), 1, fur, bo);
    s.ball(cx, cyN, bw, Hb, 3, fur, bo);
    col(cx - gap - lw, cyN + Hb * .3, gy - rnd(na[0][1]), fur, -1); col(cx + gap, cyN + Hb * .3, gy - rnd(na[1][1]), fur, 1);
    s.ball(cx - gap - lw / 2, cyN + Hb * .3, lw * 1.1, 4.4, 4, fur, bo); s.ball(cx + gap + lw / 2, cyN + Hb * .3, lw * 1.1, 4.4, 4, fur, bo);
    if (o.tail === 'bushy') for (let k = 0; k < 6; k++) s.ball(cx + rnd(sway * k / 5), cyN - Hb * .2 + k * 2.2, 3 - k * .2, 2.8, 5, k > 3 ? (o.tip || fur) : fur, bo);
    pts.head = [hx, hy - hr - 7]; pts.mouth = [hx, hy];
  } else {
    if (o.tail === 'bushy') for (let k = 0; k < 4; k++) s.ball(cx + bw * .8 + k * 1.7 + sway, cyF + 2 - k * 1.3, 3.2 - k * .4, 2.8, -2, k > 2 ? (o.tip || fur) : fur, bo);
    s.ball(cx, cyF, bw * .9, Hb * .92 + (o.hump || 0), 0, fur, bo);
    s.ball(cx, cyN, bw, Hb, 2, fur, bo);
    if (o.belly) for (let y = rnd(cyN + Hb * .1); y <= cyN + Hb + 2; y++) for (let x = cx - 4; x <= cx + 3; x++) { const c = s.get(x, y), i = fur.indexOf(c); if (i >= 0 && Math.abs(x - cx + .5) < 4.2 - Math.abs(y - cyN - Hb * .6) * .6) s.set(x, y, o.belly[clamp(i + 1, 0, o.belly.length - 1)]); }
    col(cx - gap - lw, cyN + Hb * .3, gy - rnd(na[0][1]), fur, -1); col(cx + gap, cyN + Hb * .3, gy - rnd(na[1][1]), fur, 1);
    const hd = p.head || [0, 0], hx = cx + rnd(hd[0]), hy = rnd(cyN - Hb * .5 - (o.up || 0) * .4 + hd[1]), sl = o.snout || 0, mz = o.muzzle || fur, mr = Math.max(2.2, hr * .42), mh = Math.max(2.6, sl * .5);
    s.ball(hx, hy, hr * 1.1, hr * .96, 3, fur, bo); ears(hx, hy, p.ear || 0, false);
    if (sl) s.ball(hx, hy + hr * .5, mr, mh, 4.5, mz, { d: .14, bias: .1 });
    const my = rnd(hy + hr * .5 + mh * .45);
    s.rect(hx - 1, my - 1, 2, 2, P.ink); s.set(hx - 1, my - 1, P.furGrey[2]);
    if (p.jaw) { s.rect(hx - 2, my + 2, 4, 2, P.red[1]); s.set(hx - 2, my + 2, P.bone[5]); s.set(hx + 1, my + 2, P.bone[5]); }
    for (const sd of [-1, 1]) { const ex = rnd(hx + sd * hr * .52) - (sd > 0 ? 1 : 0), ey = rnd(hy - hr * .12); if (p.blink) s.rect(ex, ey + 1, 2, 1, fur[1]); else { s.rect(ex, ey, 2, 2, o.eye || P.ink, o.eye ? 230 : 0); s.set(ex + (sd < 0 ? 1 : 0), ey + 1, P.ink, 0); } s.rect(ex - (sd < 0 ? 1 : 0), ey - 1, 3, 1, fur[1]); }
    pts.head = [hx, hy - hr - 8]; pts.mouth = [hx, my + 3];
  }
  pts.body = [cx, cyN];
  s.outline();
  s.sh = { rx: bw + 3, ry: Math.max(4, dep * .9), dx: 3, dy: -dep * .5 };
  return s;
}

function rigFowl(p) {
  p = p || {};
  const s = new Spr(44, 44, 20, 39), gy = 39, f = P.furRust, by = rnd(p.by || 0), hd = p.head || [0, 0], feet = p.feet || [[0, 0], [0, 0]], tl = rnd(p.tail || 0);
  [[18, 3], [21, 2]].forEach(([x, g], i) => { const dx = rnd(feet[i][0]), lf = rnd(feet[i][1]); s.line(x, gy - 4 + by, x + dx, gy - lf, P.gold[g]); s.rect(x + dx, gy - lf, 3, 1, P.gold[g]); });
  for (let i = 0; i < 4; i++) s.thick(15, gy - 8 + by, 10 + i * .5, gy - 15 + i * 2.4 + by - tl, 1, [P.furDark, P.green, P.blue, P.furDark][i], 2);
  s.ball(19, gy - 8 + by, 5.6, 4.2, 0, f, { n: .4, ns: 1, d: .14 }); s.ball(17, gy - 7 + by, 3.4, 2.4, 1, P.furBrown, { n: .4, ns: 1, d: .14, bias: .1 });
  const hx = 24.5 + hd[0], hy = gy - 15 + by + hd[1], nx = mix(22.5, hx, .5), ny = mix(gy - 9 + by, hy, .5) + 1;
  s.ball(nx, ny, 2.2, 2.8, 1, f, { d: .14 }); s.ball(mix(22.5, hx, .25), mix(gy - 9 + by, hy, .25) + 1, 2.2, 2.4, 1, f, { d: .14 }); s.ball(hx, hy, 2.3, 2.3, 2, f, { d: .14, bias: .1 });
  const X = rnd(hx - .5), Y = rnd(hy), dn = hd[1] > 5;
  if (dn) { s.rect(X + 1, Y + 2, 1, 2, P.gold[4]); s.set(X + 2, Y + 2, P.gold[2]); } else { s.rect(X + 2, Y, 2, 1, P.gold[4]); s.set(X + 3, Y + 1, P.gold[2]); s.set(X + 2, Y + 2, P.red[2]); }
  s.rect(X, Y - 3, 2, 1, P.red[3]); s.set(X + 1, Y - 4, P.red[4]); s.set(X + 1, Y - 1, P.ink);
  s.pts = { head: [X, Y - 8], mouth: [X + 3, Y + 2], feet: [[19, gy, feet[0][1] < .6], [22, gy, feet[1][1] < .6]] };
  s.outline();
  s.sh = { rx: 7, ry: 2.4, dx: 2, dy: 0 };
  return s;
}

function rigRabbit(p) {
  p = p || {};
  const s = new Spr(52, 48, 22, 41), gy = 41, f = P.furTan, o = { n: .3, ns: 1, d: .14 }, by = rnd(p.by || 0), st = p.stretch || 0, up = p.up || 0, ear = p.ear || 0, bx = 2;
  const hy0 = gy - 5 + by, fx = bx + 19.5 + st - up * .5, fy = gy - 6 + by - up * 1.2, hx = bx + 25.5 + st * 1.4 - up * 1.2, hy = gy - 10 + by - up * 2.2 - st * .3;
  s.oval(bx + 9 - st * .4, hy0, 2.6, 2.6, () => P.cloth[5]); s.set(bx + 8 - rnd(st * .4), hy0 + 1, P.cloth[3]);
  if (st > 1.5) { s.rect(bx + 4 - rnd(st), gy - 3 + by, 9, 2, f[3]); s.rect(bx + 4 - rnd(st), gy - 3 + by, 9, 1, f[4]); } else { s.rect(bx + 11, gy - 1, 8, 2, f[3]); s.rect(bx + 11, gy - 1, 8, 1, f[4]); s.set(bx + 19, gy, f[4]); }
  s.ball(bx + 14, hy0, 5.6, 5.2 - st * .25, 0, f, o); s.ball(fx, fy, 6.4 + st * .3, 4.6 - st * .2, 1, f, o);
  for (let j = 0; j < 9; j++) { const q = ear < 0 ? [-j * .8, -j * .35] : [-(j > 6 ? 1 : 0), -j]; s.rect(hx + .5 + q[0], hy - 2 + q[1], 2, 1, f[2]); }
  s.ball(hx, hy, 3.8, 3.4, 2, f, { d: .14, bias: .06 }); s.ball(hx + 2.9, hy + 1, 2.1, 1.9, 3, f, { d: .14, bias: .14 });
  for (let j = 0; j < 10; j++) { const q = ear < 0 ? [-j * .85, -j * .3] : [-(j > 5 ? 1 : 0) + (ear > 0 && j > 6 ? 1 : 0), -j], x = rnd(hx - 2.5 + q[0]), y = rnd(hy - 3 + q[1]); s.set(x, y, f[5]); s.set(x + 1, y, j > 0 && j < 9 ? P.skinPale[3] : f[4]); s.set(x + 2, y, f[3]); if (ear < 0) s.set(x + 1, y + 1, f[3]); }
  for (let x = bx + 12; x < bx + 26 + st; x++) for (let y = gy - 3 + by - rnd(up); y <= gy - 1 + by; y++) { const c = s.get(x, y); if (c && f.indexOf(c) >= 0) s.set(x, y, P.cloth[clamp(f.indexOf(c) + 1, 0, 5)]); }
  const lx = rnd(fx + 3.5 + st), ly = rnd(fy + 3);
  if (st > 1.5) { s.rect(lx, ly, 5, 2, f[3]); s.rect(lx, ly, 5, 1, f[4]); } else if (up > 1) { s.rect(lx, ly - 1, 2, 3, f[3]); s.set(lx + 2, ly + 1, f[4]); } else { s.rect(lx, ly, 2, gy - ly, f[3]); s.rect(lx, gy, 3, 1, f[4]); }
  const X = rnd(hx), Y = rnd(hy);
  if (p.blink) s.set(X, Y - 1, f[1]); else { s.rect(X, Y - 1, 1, 2, P.ink); s.set(X, Y - 1, P.furGrey[4]); }
  s.set(X + 5, Y + 1, P.skinPale[2]); s.set(X + 4, Y + 3, f[1]);
  s.pts = { head: [X, Y - 16], mouth: [X + 5, Y + 2], feet: [[bx + 15, gy, by > -1], [lx, gy, by > -1]] };
  s.outline();
  s.sh = { rx: 10 + st, ry: 2.8, dx: 2, dy: 0 };
  return s;
}
