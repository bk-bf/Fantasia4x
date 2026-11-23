'use strict';
function stampRim(dst, src) {
  const W = dst.w;
  for (let i = 0; i < src.c.length; i++) {
    if (!src.c[i]) continue;
    for (const d of [1, -1, W]) { const q = i + d; if (q >= 0 && q < src.c.length && !src.c[q] && dst.c[q] && dst.c[q] !== P.ink) dst.c[q] = dark(dst.c[q], .62); }
  }
  for (let i = 0; i < src.c.length; i++) if (src.c[i]) { dst.c[i] = src.c[i]; dst.e[i] = src.e[i]; }
}
const legCol = (lr, n, w) => (t, k) => lr[clamp(n - 2 + (k === 0 ? 1 : k >= w - 2 ? -1 : 0), 0, n)];

function fbLeg(s, o, lr, top, foot, lit, pts) {
  const n = o.fur.length - 1, legw = o.legw || 4, thin = legw > 3 ? 1 : 0, [x, y0] = top, [fx, fy] = foot, kx = mix(x, fx, .55), ky = mix(y0, fy, .5) - (y0 + o.leg * .9 - fy > 1.5 ? 1 : 0);
  s.ball(x + .5, y0, legw * .95, 4.6, lit ? 3 : -3, lr, furOpt(o));
  rigLimb(s, [[x, y0 + 2], [kx, ky]], legw, legCol(lr, n, legw));
  rigLimb(s, [[kx, ky], [fx, fy]], legw - thin, legCol(lr, n, legw - thin));
  const X = rnd(fx) - (legw >> 1), Y = rnd(fy), hoof = o.hoof ? (lit ? o.hoof : dark(o.hoof, .8)) : null;
  for (let i = -1; i < legw; i++) {
    if (hoof) { s.set(X + i, Y, hoof); s.set(X + i, Y - 1, hoof); if (i === (legw >> 1) - 1 && legw > 2) s.set(X + i, Y, lr[1]); }
    else { s.set(X + i, Y, lr[1]); if (i >= 0 && i < legw - 1 && (i & 1)) s.set(X + i, Y, lr[0]); }
  }
  pts.feet.push([fx, fy, true]);
}

function fbEars(s, o, hx, hy, ear, back) {
  const fur = o.fur, n = fur.length - 1, hr = o.head, inner = o.inner || fur[1];
  for (const sd of [-1, 1]) {
    const lit = sd < 0 ? fur[n - 1] : fur[n - 3];
    if (o.ears === 'point') {
      const h = ear < 0 ? 4 : 6, bx = hx + sd * hr * .55;
      for (let j = 0; j < h; j++) {
        const w = Math.max(1, rnd(4 - j * .6)), x0 = rnd(bx + sd * (ear < 0 ? j * .9 : j * .25) - w / 2), y = rnd(hy - hr * .62 - j + (ear < 0 ? 1 : 0));
        for (let i = 0; i < w; i++) s.set(x0 + i, y, !back && i > 0 && i < w - 1 && j < h - 2 ? inner : lit);
      }
    } else if (o.ears === 'round') s.oval(hx + sd * hr * .72, hy - hr * .72, 2.8, 2.8, (x, y, nx, ny) => !back && Math.hypot(nx, ny) < .45 ? fur[1] : lit);
    else if (o.ears === 'leaf') {
      const up = ear > 0 ? 1 : 0;
      for (let j = 0; j < 5; j++) { const x = rnd(hx + sd * (hr * .7 + j)), y = rnd(hy - hr * .5 - j * (up ? .9 : .35) + (ear < 0 ? j * .3 : 0)); s.rect(x - (sd < 0 ? 1 : 0), y, 2, j > 0 && j < 4 ? 2 : 1, lit); if (!back && j > 0 && j < 4) s.set(x, y + 1, P.skinPale[3]); }
    } else if (o.ears === 'flap') s.oval(hx + sd * (hr + 2.5), hy + 1, 5.2, 8.6, M.fur(fur.map(c => dark(c, sd < 0 ? .78 : .62)), n - 1, 3));
  }
}

function fbAntlers(s, g, big) {
  for (const sd of [-1, 1]) {
    const k = sd < 0 ? 4 : 3, x0 = g.hx + sd * g.hr * .45, y0 = g.hy - g.hr * .8, p1 = [x0 + sd * 3, y0 - 6], p2 = [x0 + sd * (6 + big * 2), y0 - 12 - big * 3], p3 = [x0 + sd * (4 + big), y0 - 17 - big * 5];
    s.thick(x0, y0, p1[0], p1[1], 2, P.bone, k - 1); s.thick(p1[0], p1[1], p2[0], p2[1], 1, P.bone, k); s.thick(p2[0], p2[1], p3[0], p3[1], 1, P.bone, k + 1);
    s.thick(p1[0], p1[1], p1[0] + sd * 5, p1[1] - 2, 1, P.bone, k);
    const m = [mix(p1[0], p2[0], .5), mix(p1[1], p2[1], .5)];
    s.thick(m[0], m[1], m[0] - sd * 2, m[1] - 5, 1, P.bone, k);
    if (big) { s.thick(p2[0], p2[1], p2[0] + sd * 5, p2[1] - 1, 1, P.bone, k); s.thick(mix(p2[0], p3[0], .5), mix(p2[1], p3[1], .5), mix(p2[0], p3[0], .5) + sd * 3, mix(p2[1], p3[1], .5) - 4, 1, P.bone, k + 1); }
  }
}
function fbHorns(s, g) {
  for (const sd of [-1, 1]) {
    const k = sd < 0 ? 5 : 3, x0 = g.hx + sd * g.hr * .7, y0 = g.hy - g.hr * .55, x1 = x0 + sd * 5, y1 = y0 - 1;
    s.thick(x0, y0, x1, y1, 2, P.bone, k - 1); s.thick(x1, y1, x1 + sd * 2, y1 - 4, 2, P.bone, k - 1); s.thick(x1 + sd * 2, y1 - 4, x1 + sd, y1 - 7, 1, P.bone, k);
  }
}
function fbCurls(s, g) {
  for (const sd of [-1, 1]) for (let a = 0; a < 26; a++) {
    const t = a / 26 * 5.2 - 1.9, rr = 5.2 - a * .1, X = g.hx + sd * (g.hr * .55 + 2.5 - Math.cos(t) * rr * .55), Y = g.hy - 1 + Math.sin(t) * rr;
    s.set(X, Y, P.wicker[2 + (a % 3)]); s.set(X + sd, Y, P.wicker[1 + (a % 2)]);
  }
}
const FBX = {
  deer: { head: g => fbAntlers(g.s, g, 0) },
  elk: { head: g => fbAntlers(g.s, g, 1) },
  ox: { head: g => fbHorns(g.s, g) },
  packox: { head: g => fbHorns(g.s, g), load: 1 },
  bighorn: { head: g => fbCurls(g.s, g) },
  boar: { face(g) {
    const { s, hx, my } = g;
    s.oval(hx, my - 1, 2.6, 2, (x, y, nx, ny) => P.skinPale[nx + ny < -.4 ? 3 : 2]); s.set(hx - 1, my - 1, P.ink); s.set(hx, my - 1, P.ink);
    for (const sd of [-1, 1]) { const x = rnd(hx + sd * 3.2) - (sd > 0 ? 1 : 0); s.rect(x, my - 2, 1, 3, P.bone[sd < 0 ? 5 : 4]); s.set(x + sd, my - 3, P.bone[4]); }
  } },
  sabre: { face(g) { for (const sd of [-1, 1]) { const x = rnd(g.hx + sd * 2.2) - (sd > 0 ? 1 : 0); g.s.rect(x, g.my + 1, 1, 5, P.bone[sd < 0 ? 5 : 4]); g.s.set(x, g.my + 5, P.bone[3]); } }, stripes: 1 },
  mammoth: { face(g) {
    const { s, hx, hy } = g;
    for (let j = 0; j < 22; j++) { const x = hx - 2 + Math.sin(j * .22) * 1.5, w = j < 12 ? 5 : 4; for (let i = 0; i < w; i++) s.set(x + i - (w - 5) / 2, hy + 3 + j, P.furRust[clamp(3 - Math.floor(i / w * 3) - (j % 4 === 0 ? 1 : 0), 0, 4)]); }
    for (const sd of [-1, 1]) { const k = sd < 0 ? 5 : 3; s.thick(hx + sd * 4, hy + 6, hx + sd * 6, hy + 14, 2, P.bone, k); s.thick(hx + sd * 6, hy + 14, hx + sd * 10, hy + 17, 2, P.bone, k); s.thick(hx + sd * 10, hy + 17, hx + sd * 13, hy + 12, 2, P.bone, k + 1); }
  }, fringe: 1 },
  owlbear: { face(g) {
    const { s, hx, hy } = g;
    for (const sd of [-1, 1]) s.oval(hx + sd * 3.2, hy - .5, 3.4, 3.4, (x, y, nx, ny) => Math.hypot(nx, ny) < .35 ? P.ink : Math.hypot(nx, ny) < .62 ? P.gold[4] : P.cloth[5]);
    for (let j = 0; j < 4; j++) s.rect(hx - 2 + (j >> 1), hy + 2 + j, Math.max(1, 4 - j), 1, P.gold[j < 2 ? 3 : 2]);
  }, noEyes: 1, plumage: 1 },
  hippogriff: { face(g) { const { s, hx, hy } = g; for (let j = 0; j < 5; j++) s.rect(hx - 2 + (j > 2 ? 1 : 0), hy + 1 + j, j > 2 ? 2 : 4, 1, P.gold[4 - (j > 1 ? 1 : 0) - (j === 4 ? 1 : 0)]); s.set(hx, hy + 6, P.gold[1]); }, wings: 1 },
  lurker: { face(g) { for (let k = -3; k <= 3; k++) g.s.set(g.hx + k * 1.4, g.my + 1, P.bone[5]); }, ridge: 1 },
  fawn: { spots: 1 },
};

function fbBodyBits(s, o, X, g, back) {
  const { cx, cy, cyF, bw, Hb } = g;
  if (o.mane && !back) for (let i = -4; i <= 4; i++) { const y = rnd(cy - Hb * .7 - (4 - Math.abs(i)) * .4); s.set(cx + i, y, o.mane[2 + (i & 1)]); s.set(cx + i, y + 1, o.mane[1 + ((i + 9) % 3)]); }
  if (o.mane && back) for (let y = rnd(cyF - Hb * .9); y < cy - Hb * .4; y++) { s.set(cx - 1, y, o.mane[2 + (y & 1)]); s.set(cx, y, o.mane[1 + (y % 3 + 3) % 3]); }
  if (X.ridge) for (let y = rnd(cyF - Hb); y < cy; y += 2) { s.set(cx - 2, y, P.mossSwamp[4]); s.set(cx + 1, y, P.mossSwamp[4]); }
  if (X.stripes) for (let k = 0; k < 4; k++) for (const sd of [-1, 1]) s.thick(cx + sd * (bw * .55 + k * .3), cyF - 2 + k * 3, cx + sd * (bw * .9), cyF + k * 3 + 1, 1, P.leather, 1);
  if (X.spots) for (let i = 0; i < 5; i++) s.set(cx - 4 + i * 2, cyF - 1 + (i % 3), P.cloth[5]);
  if (X.plumage) for (let k = 0; k < 8; k++) for (let q = 0; q < 2; q++) { const x = cx - 7 + k * 2 + (q & 1), y = (back ? cy : cyF) - 2 + q * 4; s.set(x, y, P.furBrown[2]); s.set(x + 1, y + 1, P.furBrown[3]); }
  if (X.fringe) for (let x = rnd(cx - bw); x < cx + bw; x += 2) for (let j = 0; j < 3 + (x & 1); j++) s.set(x, cy + Hb - 3 + j, P.furRust[1 + (x & 1)]);
  if (X.wings) for (const sd of [-1, 1]) for (let k = 0; k < 9; k++) s.thick(cx + sd * (bw * .5), cyF - 3 + k * .5, cx + sd * (bw + 1 - k * .2), cyF + 2 + k * 1.2, 2, P.furWhite, 1 + (k % 3));
  if (X.load) {
    const ly = rnd(cyF - Hb - 2);
    s.slab(cx - 8, ly - 3, 16, 4, 4, M.cloth(P.cloth, 4, 3), M.cloth(P.cloth, 3, 5));
    for (const sd of [-1, 1]) s.ball(cx + sd * (bw + 1), cyF + 2, 3.6, 5, 4, P.red, { d: .15 });
    s.rect(cx - 1, ly - 3, 2, 10, P.leather[2]); s.rect(cx - 1, ly - 3, 1, 10, P.leather[4]);
  }
}

function fbFace(s, o, hx, hy, p, X) {
  const fur = o.fur, hr = o.head, sl = o.snout || 0, mz = o.muzzle || fur;
  s.ball(hx, hy, hr * 1.04, hr * .94, 3, fur, furOpt(o));
  const g = { s, hx, hy, hr, mr: 0, my: rnd(hy + hr * .55) };
  if (sl) {
    const mr = clamp(hr * .38 + sl * .07, 2.2, hr * .72), mh = clamp(1.4 + sl * .32, 2.2, hr * .75), my0 = hy + hr * .42;
    s.ball(hx, my0, mr, mh, hr * 1.3, mz, { d: .14, bias: .08 });
    g.mr = mr; g.my = rnd(my0 + mh * .4);
    const nw = mr > 3 ? 3 : 2, nx = rnd(hx - nw / 2);
    s.rect(nx, g.my - 2, nw, 2, P.ink); s.set(nx, g.my - 2, P.furGrey[2]);
    s.rect(nx, g.my + 1, nw, 1, mz[0]);
    if (p.jaw) { s.rect(nx - 1, g.my + 1, nw + 2, 2, P.red[1]); s.set(nx - 1, g.my + 1, P.bone[5]); s.set(nx + nw, g.my + 1, P.bone[5]); }
  }
  if (!X.noEyes) for (const sd of [-1, 1]) {
    const ex = rnd(hx + sd * hr * .5) - (sd > 0 ? 1 : 0), ey = rnd(hy - hr * .2);
    if (p.blink) s.rect(ex, ey + 1, 2, 1, fur[1]);
    else { s.rect(ex, ey, 2, 2, o.eye || P.ink, o.eye ? 230 : 0); s.set(ex + (sd < 0 ? 0 : 1), ey, o.eye ? P.cloth[5] : P.furGrey[3], o.eye ? 230 : 0); }
    s.rect(ex - (sd < 0 ? 1 : 0), ey - 1, 3, 1, fur[1]);
  }
  if (X.face) X.face(g);
  return g;
}

function fbTail(s, o, cx, y, p, back, lr) {
  const fur = o.fur, n = fur.length - 1, bo = furOpt(o), tw = p.tail || {}, sway = tw.w ? Math.sin(tw.ph || 0) * tw.w : 0, tip = o.tip || fur;
  if (back) {
    if (o.tail === 'bushy') for (let k = 0; k < 6; k++) s.ball(cx + sway * k / 5, y + k * 2.2, 3.1 - k * .18, 2.8, 6, k > 3 ? tip : fur, bo);
    if (o.tail === 'short') { s.ball(cx, y + 1, 3.4, 3, 6, tip, bo); }
    if (o.tail === 'tuft') { s.thick(cx + rnd(sway * .5), y, cx + rnd(sway), y + 9, 1, fur, n - 2); s.ball(cx + sway, y + 11, 2, 2.6, 6, lr, bo); }
    if (o.tail === 'fat') for (let k = 0; k < 8; k++) s.ball(cx + sway * k / 7, y + k * 1.6, 4.2 - k * .45, 2.4, 6, fur, bo);
  } else {
    if (o.tail === 'bushy') for (let k = 0; k < 4; k++) s.ball(cx + 7 + k * 1.7 + sway, y + 1 - k * 1.3, 3.2 - k * .4, 2.8, -6, k > 2 ? tip : fur, bo);
    if (o.tail === 'tuft') s.thick(cx + 5 + rnd(sway), y - 1, cx + 7 + rnd(sway), y + 4, 1, lr, 2);
  }
}

function rigQuadFB(kind, p, back) {
  p = p || {};
  const o = BEASTS[kind].o, X = FBX[kind] || {}, s = new Spr(QG.W, QG.H, QG.CX, QG.GY), gy = QG.GY, cx = QG.CX, L = o.L, Hb = o.Hb, fur = o.fur, n = fur.length - 1, bo = furOpt(o), hr = o.head;
  const far = fur.map(c => dark(c, .62)), by = p.by || 0, dep = rnd(L * .36), bw = Hb * 1.22, cy = gy - o.leg - Hb + 2 + by, cyF = cy - dep, gap = Math.max(o.legw || 4, bw * .52), pts = s.pts = { feet: [] };
  const feet = p.feet || [[0, 0], [0, 0], [0, 0], [0, 0]], fwd = back ? -1 : 1, hd = p.head || [0, 0], legTop = cy + Hb * .35;
  const g = { cx, cy, cyF, bw, Hb };
  const legAt = (sd, near, ft) => {
    const gx = near ? gap : gap * .58, top = [cx + sd * gx - .5, (near ? cy : cyF) + Hb * .35], base = near ? gy : gy - dep;
    fbLeg(s, o, near ? fur : far, top, [top[0] + sd * .5, base + ft[0] * fwd * .9 - ft[1]], near && sd < 0, pts);
  };
  const farFeet = back ? [feet[1], feet[3]] : [feet[0], feet[2]], nearFeet = back ? [feet[0], feet[2]] : [feet[1], feet[3]];
  legAt(-1, false, farFeet[0]); legAt(1, false, farFeet[1]);
  const neck = o.up > 3, nw = (o.neckw || 3.6) * 1.15;
  if (back) {
    const hx = cx + rnd(hd[0]), hy = rnd(cyF - Hb * .55 - (o.up || 0) * .85 - hr * .4 + hd[1]);
    if (neck) for (let k = 0; k <= 6; k++) s.ball(cx + (hx - cx) * k / 6, mix(cyF - Hb * .5, hy + hr * .5, k / 6), nw, nw, -1, fur, bo);
    if (o.ears === 'flap') fbEars(s, o, hx, hy, p.ear || 0, true);
    s.ball(hx, hy, hr * 1.04, hr * .94, -2, fur, bo);
    if (o.ears !== 'flap') fbEars(s, o, hx, hy, p.ear || 0, true);
    if (X.head) X.head({ s, hx, hy, hr });
    const b = new Spr(QG.W, QG.H, QG.CX, QG.GY);
    if (o.hump) b.ball(cx, cyF - Hb * .3 - o.hump * .6, bw * .7, Hb * .5 + o.hump, 0, fur, bo);
    b.ball(cx, cyF, bw * .92, Hb * .95, 1, fur, bo);
    b.ball(cx, cy, bw, Hb * 1.02, 3, fur, bo);
    for (const sd of [-1, 1]) b.ball(cx + sd * (bw * .55), cy + Hb * .25, bw * .52, Hb * .78, 4, fur, bo);
    fbBodyBits(b, o, X, g, true);
    stampRim(s, b);
    legAt(-1, true, nearFeet[0]); legAt(1, true, nearFeet[1]);
    fbTail(s, o, cx, rnd(cy - Hb * .55), p, true, fur);
    pts.head = [hx, hy - hr - 7]; pts.mouth = [hx, hy];
  } else {
    fbTail(s, o, cx, rnd(cyF), p, false, far);
    if (o.hump) s.ball(cx, cyF - Hb * .2 - o.hump * .5, bw * .75, Hb * .55 + o.hump, -1, fur, bo);
    s.ball(cx, cyF, bw * .9, Hb * .92, 0, fur, bo);
    s.ball(cx, cy, bw, Hb, 2, fur, bo);
    if (o.belly) for (let y = rnd(cy - Hb * .1); y <= cy + Hb + 2; y++) for (let x = cx - 5; x <= cx + 4; x++) { const c = s.get(x, y), i = fur.indexOf(c); if (i >= 0 && Math.abs(x - cx + .5) < 3.6 - Math.abs(y - cy - Hb * .6) * .5) s.set(x, y, o.belly[clamp(i + 1, 0, o.belly.length - 1)]); }
    fbBodyBits(s, o, X, g, false);
    legAt(-1, true, nearFeet[0]); legAt(1, true, nearFeet[1]);
    const hx = cx + rnd(hd[0]), hy = rnd(cy - Hb * .55 - (o.up || 0) * .85 + hd[1]), h = new Spr(QG.W, QG.H, QG.CX, QG.GY);
    if (neck) for (let k = 0; k <= 6; k++) h.ball(cx + (hx - cx) * k / 6, mix(cy - Hb * .3, hy + hr * .4, k / 6), nw, nw, 3, fur, bo);
    if (o.mane) h.ball(hx, hy + hr * .75, hr * 1.1, hr * .6, 2.5, o.mane, bo);
    if (o.ears === 'flap') fbEars(h, o, hx, hy, p.ear || 0, false);
    const f = fbFace(h, o, hx, hy, p, X);
    if (o.ears !== 'flap') fbEars(h, o, hx, hy, p.ear || 0, false);
    if (X.head) X.head(f);
    stampRim(s, h);
    pts.head = [hx, hy - hr - 8]; pts.mouth = [hx, f.my + 3];
  }
  pts.body = [cx, cy];
  s.outline();
  s.sh = { rx: bw + 4, ry: Math.max(4, dep * .9), dx: 3, dy: -dep * .5 };
  return s;
}
