'use strict';
function rigPawnLie(o, p) {
  p = p || {};
  const f = FOLK[o.race || 'human'], s = new Spr(RG.W, RG.H, RG.CX, RG.BASE), skin = o.skin || f.skin, sn = skin.length - 1, tunic = o.tunic || (o.bare ? skin : P.cloth), pants = o.pants || (o.bare ? skin : P.leather), body = o.armor || tunic, boots = o.boots || (o.bare ? skin : P.leather), belted = o.belt === undefined ? !o.bare || !!(o.tunic || o.armor) : !!o.belt, hair = o.hair || P.furBrown, hn = hair.length - 1;
  const rest = !!p.rest, out = !!p.out, tucked = !!p.tucked, br = p.br ? 1 : 0, gy = RG.BASE - 1, th = Math.round(f.hw * 1.7), L = f.hh + f.tl + f.legs, x0 = RG.CX - (L >> 1), tx0 = x0 + f.hh - 1, lx0 = tx0 + f.tl, top = gy - th + 1, legH = Math.max(3, th >> 1);
  const headH = 2 * f.hd, hTop = gy - headH + 1 - (rest ? 1 : 0) + (out ? 1 : 0), noHair = o.bald || f.bald, rowU = y => clamp((y - top) / Math.max(1, th - 1), 0, 1);
  if (rest) {
    for (let x = x0 - 4; x <= x0 + L + 3; x++) for (let y = gy - 3; y <= gy + 1; y++) { const e = x === x0 - 4 || x === x0 + L + 3 || y === gy + 1; s.set(x, y, P.cloth[e ? 1 : y === gy - 3 ? 3 : 2 - ((x + y) % 7 === 0 ? 1 : 0)]); }
    s.oval(x0 + 3, gy - 2, 4.6, 2.6, (x, y, nx, ny) => P.cloth[ny < -.2 ? 5 : 4]);
  }
  const bootX = lx0 + f.legs - 3;
  const legRow = (y0, y1, far) => {
    for (let y = y0; y <= y1; y++) for (let x = lx0; x < lx0 + f.legs; x++) {
      const boot = x >= bootX, u = (y - y0) / Math.max(1, y1 - y0), c = pick3(boot ? boots : pants, u * .9, (boot && x === bootX ? 1 : 0) + (x === lx0 + f.legs - 1 ? -2 : 0) - (far ? 1 : 0));
      s.set(x, y, far ? dark(c, .82) : c);
    }
    const tx = lx0 + f.legs - 2;
    s.rect(tx, y0 - 2, 2, 2, far ? dark(boots[2], .82) : boots[3]); s.set(tx + 1, y0 - 2, boots[1]);
  };
  if (out && !tucked) lieSprawledLegs(s, f, pants, lx0, top, gy, legH, boots);
  else legRow(top + 1, top + legH, true);
  if (out && !tucked) s.rect(lx0 - 1, top + 1, 2, th - 1, pick3(pants, .5, -1));
  else if (rest || tucked || !p.bent) legRow(top + legH + 1, gy, false);
  else {
    const w = legH, hip = [lx0, gy - (w >> 1)], knee = [lx0 + 4, top - 2], ft = [lx0 + 8, gy - (w >> 1)];
    rigLimb(s, [hip, knee, ft], w, (t, k) => pick3(t > f.legs - 3.5 ? boots : pants, k / (w - 1) * .9, t > f.legs - 3.5 ? 0 : 0), shade);
  }
  for (let y = top - br; y <= gy; y++) for (let x = tx0; x < lx0; x++) {
    if (y < top && x > tx0 + 7) continue;
    const u = rowU(y), belt = belted && x >= lx0 - 2;
    let c;
    if (belt) c = Math.abs(y - (top + (th >> 1))) < 1 ? P.gold[x === lx0 - 2 ? 4 : 2] : pick3(P.leather, u, x === lx0 - 2 ? 1 : -1);
    else if (o.armor === P.iron && !o.plate) c = P.iron[clamp((u < .25 ? 4 : u < .7 ? 3 : 2) + (((x + y) & 1) ? 1 : -1), 0, 6)];
    else { c = pick3(body, u, (y <= top - br ? 1 : 0) - (x === tx0 ? 1 : 0)); if (o.apron && u > .3 && x > tx0 + 2) c = pick3(P.leather, u, 0); if (o.trim && x === tx0 + 1) c = o.trim[3]; }
    s.set(x, y, c);
  }
  if (o.cape && !rest) for (let x = tx0 - 1; x < lx0 + 4; x++) { s.set(x, gy + 1, o.cape[2]); s.set(x, gy + 2, o.cape[1]); }
  const aw = f.aw, armC = (t, k) => { const hand = t > f.tl - 4.5, bare = o.sleeves === 0 || t > 7; return hand || bare ? skin[clamp(sn - 1 - (k === aw - 1 ? 1 : 0), 0, sn)] : pick3(o.sleeve || body, k / aw * .5, 0); };
  const sh0 = [tx0 + 2, gy - (aw >> 1)];
  const limp = len => (t, k) => t > len - 3.5 || o.sleeves === 0 ? skin[clamp(sn - 1 - (k === aw - 1 ? 1 : 0) + (t > len - 1.5 ? 1 : 0), 0, sn)] : pick3(body, k / aw * .5, 0);
  const flung = [[tx0 + 2, top + 1], [x0 + f.hh * .5, top - 3], [x0 - 1, top - 2], [x0 - 4, top + 1]], flopped = tucked ? [[tx0 + 3, gy - 3], [tx0 + 8, gy - 2], [tx0 + 12, gy - 3]] : [[tx0 + 3, gy - 2], [tx0 + 7, gy + 2], [tx0 + 12, gy + 1]];
  if (out && !tucked) rigLimb(s, flung, aw, (t, k) => dark(limp(lieLength(flung))(t, k), .85));
  else if (!rest && !tucked) {
    rigLimb(s, [[tx0 + 2, top + 1], [tx0 - 2, top - 4], [x0 + 1, top - 7]], aw, (t, k) => dark(armC(t, k), .85));
    rigLimb(s, [sh0, [tx0 + 7, gy + 1], [tx0 + 11, gy + 2]], aw, armC, shade);
  }
  for (let y = hTop; y < hTop + headH; y++) for (let x = x0; x < x0 + f.hh; x++) {
    const nx = (x + .5 - x0 - f.hh / 2) / (f.hh / 2), ny = (y + .5 - hTop - headH / 2) / (headH / 2);
    if (nx * nx + ny * ny > 1.08) continue;
    if (out && s.get(x, y - 1) && ny - 1 / (headH / 2) < -1 + .08) s.set(x, y - 1, dark(s.get(x, y - 1), .5));
    s.set(x, y, skin[clamp((ny < -.4 ? sn : ny < .3 ? sn - 1 : sn - 2) - (nx < -.6 ? 1 : 0), 0, sn)]);
  }
  for (let y = hTop + headH; y <= gy; y++) s.rect(x0 + 2, y, f.hh - 3, 1, skin[sn - 3]);
  const fx = x0 + Math.round(f.hh * .55), ey = hTop + 2, cy = hTop + (headH >> 1), ex = x0 + Math.round(f.hh * .5) + (o.hat === 'helm' ? 1 : 0);
  if (!out) {
    s.rect(fx, ey, 2, 1, skin[Math.max(0, sn - 3)]); s.set(fx - 1, ey - 1, noHair ? skin[1] : hair[Math.max(0, hn - 3)]);
    s.set(fx + 2, hTop - 1, skin[sn - 1]); s.set(fx + 2, hTop, skin[sn]);
    s.rect(x0 + f.hh - 2, hTop + 2, 1, 2, skin[Math.max(0, sn - 3)]);
    if (!rest) s.set(x0 + f.hh - 2, hTop + 3, skin[0]);
    s.set(x0 + Math.round(f.hh * .45), hTop + headH - 2, skin[sn - 2]);
  }
  if (!noHair) {
    for (let y = hTop; y < hTop + headH; y++) for (let x = x0 - 1; x < x0 + 3; x++) { const nx = (x + .5 - x0 - f.hh / 2) / (f.hh / 2), ny = (y + .5 - hTop - headH / 2) / (headH / 2); if (nx * nx + ny * ny <= 1.25) s.set(x, y, hair[clamp((ny < -.3 ? hn : ny < .4 ? hn - 1 : hn - 2) - ((x + y) % 4 === 0 ? 1 : 0), 0, hn)]); }
    for (let x = x0 + 1; x < x0 + Math.round(f.hh * .45); x++) s.set(x, hTop, hair[hn - (x & 1)]);
    if (f.longhair || o.longhair) for (let x = x0 - 6; x < x0; x++) { s.set(x, gy - 1, hair[hn - 1 - (x & 1)]); s.set(x, gy, hair[hn - 2]); }
  }
  if (out && (f.beard || o.beard)) { const n = f.beard ? 7 : 4; for (let i = 0; i < n; i++) { const half = 2 - (i >> 1); for (let j = -half - 1; j <= half; j++) s.set(x0 + f.hh - 2 + i, cy + j, hair[clamp(hn - 1 - (j === -half - 1 ? 0 : 1) - (i % 3 === 2 ? 1 : 0), 0, hn)]); } }
  else if (f.beard || o.beard) { const n = f.beard ? 7 : 4; for (let i = 0; i < n; i++) for (let j = 0; j < 4 - (i >> 1) + 1; j++) s.set(x0 + f.hh - 2 + i, hTop + 1 + j, hair[clamp(hn - 1 - (j === 0 ? 0 : 1) - (i % 3 === 2 ? 1 : 0), 0, hn)]); }
  if (out && f.snout) { s.rect(x0 + f.hh - 2, cy - 2, 4, 4, skin[sn - 1]); s.rect(x0 + f.hh - 2, cy - 2, 4, 1, skin[sn]); s.set(x0 + f.hh + 1, cy - 1, P.ink); }
  else if (f.snout) { s.rect(x0 + f.hh - 1, hTop + 1, 3, 3, skin[sn - 1]); s.set(x0 + f.hh + 1, hTop + 1, P.ink); }
  if (f.ears || f.bigears || f.pointears) for (let k = 0; k < (f.bigears ? 4 : 2); k++) s.rect(x0 + Math.round(f.hh * .45) - (k >> 1), hTop + headH - 1 + k, 2, 1, skin[sn - 2]);
  if (out) lieLolledFace(s, f, o, x0, ex, cy, skin, noHair ? skin[1] : hair[Math.max(0, hn - 3)]);
  if (out && !noHair) { for (let x = x0 + 1; x < x0 + Math.round(f.hh * .45); x++) s.set(x, hTop + headH - 1, hair[hn - 2]); for (let y = hTop + 1; y < hTop + headH - 1; y++) if (hash(y, 3, o.seed || 1) > .45) s.set(x0 + 3, y, hair[hn - 1]); }
  if (f.tusks && out) { s.set(ex + 2, cy - 3, P.bone[5]); s.set(ex + 2, cy + 2, P.bone[4]); }
  else if (f.tusks) s.rect(x0 + f.hh - 3, hTop - 1, 1, 2, P.bone[5]);
  if (o.hat === 'helm') { for (let y = hTop - 1; y < hTop + headH + 1; y++) for (let x = x0 - 2; x < x0 + Math.round(f.hh * .45); x++) { const nx = (x + .5 - x0 - f.hh / 2) / (f.hh / 2 + 1), ny = (y + .5 - hTop - headH / 2) / (headH / 2 + 1); if (nx * nx + ny * ny <= 1) s.set(x, y, P.iron[clamp(ny < -.3 ? 5 : ny < .3 ? 4 : 2, 0, 6)]); } s.rect(x0 + Math.round(f.hh * .45), hTop - 1, 1, headH + 2, P.iron[2]); if (o.crest) s.rect(x0 - 5, hTop + 2, 3, 2, o.crest[3]); }
  if (o.hat === 'hood') { const c = o.hood || tunic; for (let y = hTop - 1; y < hTop + headH + 1; y++) for (let x = x0 - 2; x < x0 + f.hh + 1; x++) { const nx = (x + .5 - x0 - f.hh / 2) / (f.hh / 2 + 1), ny = (y + .5 - hTop - headH / 2) / (headH / 2 + 1), q = nx * nx + ny * ny; if (q <= 1 && (q > .55 || nx < -.3)) s.set(x, y, pick3(c, (ny + 1) / 2, 0)); } }
  if (o.hat === 'straw') s.oval(x0 - 6, gy - 1, 5, 2.2, (x, y, nx, ny) => ny < -.3 ? P.thatch[5] : Math.abs(nx) < .5 && ny < .3 ? P.red[2] : P.thatch[3]);
  if (o.hat === 'crown') { s.rect(x0 - 1, hTop + 1, 2, headH - 2, P.gold[4]); s.set(x0 - 2, hTop + 2, P.gold[3]); }
  if (rest) {
    const blanket = P.red;
    for (let y = top - br - 1; y <= gy; y++) for (let x = tx0 + 7; x < x0 + L + 1; x++) {
      const u = rowU(y), edge = x === tx0 + 7;
      if (y < top - br && edge) continue;
      s.set(x, y, blanket[clamp((edge ? 4 : u < .25 ? 3 : u < .7 ? 2 : 1) - ((x * 3 + y) % 9 === 0 ? 1 : 0), 0, 4)]);
    }
    s.rect(lx0 + f.legs - 2, top - br - 3, 2, 2, blanket[3]);
    rigLimb(s, [sh0, [tx0 + 6, gy - 1], [tx0 + 10, top + 1 - br]], aw, armC, shade);
  }
  if (out) rigLimb(s, flopped, aw, limp(lieLength(flopped)), shade);
  s.outline();
  s.sh = out ? { rx: (L >> 1) + 5, ry: 4, dx: 0, dy: 1 } : { rx: (L >> 1) + 3, ry: 3.6, dx: 2, dy: 0 };
  s.pts = { head: [x0 + (f.hh >> 1), hTop - 9], mouth: [x0 + f.hh, hTop + 3], body: [tx0 + (f.tl >> 1), top], feet: [], lie: [x0, hTop, top, gy, out ? ex : x0, out ? cy : hTop] };
  if (out) s.pts.daze = [x0 + (f.hh >> 1), hTop - 10];
  if (tucked) s.hold = [RG.CX, gy + 1];
  return s;
}
const lieLength = pts => pts.slice(1).reduce((sum, q, i) => sum + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);
function lieSprawledLegs(s, f, pants, lx0, top, gy, w, boots = P.leather) {
  const h = w >> 1, fy = top + h, ny = gy - h + 1, knee = lx0 + Math.round(f.legs * .45), bent = [[lx0 - 1, fy + 1], [knee, fy - 3], [lx0 + f.legs - 2, fy + 1]], straight = [[lx0 - 1, ny - 1], [lx0 + f.legs, ny + 1]];
  const leg = (len, far) => (t, k) => { const boot = t > len - 3.5, c = pick3(boot ? boots : pants, k / Math.max(1, w - 1) * .9, boot && t < len - 2.5 ? 1 : 0); return far ? dark(c, .86) : c; };
  rigLimb(s, bent, w, leg(lieLength(bent), true));
  s.rect(lx0 + f.legs - 1, fy + h, 2, 2, dark(boots[3], .86));
  rigLimb(s, straight, w, leg(lieLength(straight), false), c => dark(c, .72));
  s.rect(lx0 + f.legs - 1, ny + 2 + h, 2, 2, boots[2]); s.set(lx0 + f.legs - 1, ny + 2 + h, boots[3]);
}
function lieLolledFace(s, f, o, x0, ex, cy, skin, lid) {
  const sn = skin.length - 1;
  const shut = skin[Math.max(0, sn - 3)];
  s.rect(ex, cy - 3, 1, 2, shut); s.rect(ex, cy + 1, 1, 2, shut); s.set(ex - 1, cy - 3, lid); s.set(ex - 1, cy + 2, lid);
  s.set(ex + 2, cy - 1, skin[sn]); s.set(ex + 2, cy, skin[Math.max(0, sn - 2)]);
  s.rect(ex + 3, cy - 1, 1, 2, dark(skin[0], .5));
  s.set(ex - 1, cy + 3, skin[Math.max(0, sn - 2)]);
}
const SLUNG = { hip: [5, 3.5], hang: 8, arm: 8, shins: 4 };
function rigPawnSlung(o, view) {
  const f = FOLK[o.race || 'human'], s = new Spr(RG.W, RG.H, RG.CX, RG.BASE), skin = o.skin || f.skin, sn = skin.length - 1, tunic = o.tunic || P.cloth, pants = o.pants || P.leather, body = o.armor || tunic, hair = o.hair || P.furBrown, hn = hair.length - 1;
  const X = RG.CX, Y = 34, [rx, ry] = SLUNG.hip, lw = 3, legs = f.legs + SLUNG.shins, hd = f.hd, bald = o.bald || f.bald;
  const leg = (path, far) => { const len = lieLength(path); rigLimb(s, path, lw, (t, k) => { const boot = t > len - 3.5, c = pick3(boot ? P.leather : pants, k / (lw - 1) * .8, boot && t < len - 2.5 ? 1 : 0); return far ? dark(c, .82) : c; }, far ? null : shade); };
  const arm = (x, y, far) => rigLimb(s, [[x, y], [x, y + SLUNG.arm]], f.aw, (t, k) => { const c = t > SLUNG.arm - 3 || o.sleeves === 0 ? skin[clamp(sn - 1 - (k ? 1 : 0), 0, sn)] : pick3(body, k / f.aw * .5, 0); return far ? dark(c, .82) : c; }, far ? null : shade);
  const rump = () => s.oval(X, Y - ry + 1, rx, ry, (x, y, nx, ny) => pick3(pants, (nx + 1) / 2, ny < -.4 ? 1 : ny > .5 ? -1 : 0));
  const head = (cx, cy, turnedAway) => {
    s.oval(cx, cy, hd - .5, hd, (x, y, nx, ny) => turnedAway || bald ? (bald ? skin[clamp(sn - 1 - (nx > .3 ? 1 : 0), 0, sn)] : hair[clamp(hn - 1 - (nx > .3 ? 1 : 0) - ((x + y) % 4 === 0 ? 1 : 0), 0, hn)]) : ny > .1 || nx < -.35 ? hair[clamp(hn - 1 - (ny > .6 ? 1 : 0), 0, hn)] : skin[clamp(sn - 1 - (nx > .4 ? 1 : 0), 0, sn)]);
    if (!turnedAway && !bald) s.rect(Math.round(cx) + 1, Math.round(cy) - 2, 2, 1, skin[Math.max(0, sn - 3)]);
  };
  if (view === 's') {
    leg([[X + 3, Y - 2], [X + 7, Y + 1], [X + 8, Y + legs - 2]], true);
    arm(X - 9, Y + SLUNG.hang - 1, true);
    for (let j = 0; j < SLUNG.hang; j++) for (let i = -10; i <= -3; i++) s.set(X + i, Y - 1 + j, j === 0 ? pick3(P.leather, (i + 10) / 7, 0) : pick3(body, (i + 10) / 7, j === SLUNG.hang - 1 ? -1 : 0));
    head(X - 6.5, Y + SLUNG.hang + hd - 2, false);
    leg([[X + 1, Y - 2], [X + 5, Y + 1], [X + 6, Y + legs - 2]], false);
    rump();
    arm(X - 4, Y + SLUNG.hang - 1, false);
  } else if (view === 'f') {
    for (const [x0, lit] of [[X - 4, 1], [X, 0]]) for (let j = 0; j < legs; j++) for (let i = 0; i < lw + 1; i++) { const boot = j >= legs - 3, c = pick3(boot ? P.leather : pants, (lit ? 0 : .3) + i / lw * .6, boot && j === legs - 3 ? 1 : j === legs - 1 ? -2 : 0); s.set(x0 + i, Y + j, c); }
    rump();
  } else {
    for (const x of [X - 7, X + 5]) arm(x + 1, Y + SLUNG.hang - 2, x > X);
    for (let j = 0; j < SLUNG.hang; j++) for (let i = -5; i <= 4; i++) s.set(X + i, Y + j, j === 0 ? pick3(P.leather, (i + 5) / 9, 0) : pick3(body, (i + 5) / 9, j === SLUNG.hang - 1 ? -1 : 0));
    head(X, Y + SLUNG.hang + hd - 2, true);
    if (!bald && (f.longhair || o.longhair)) for (let j = 0; j < 4; j++) s.rect(X - 3 + (j > 2 ? 1 : 0), Y + SLUNG.hang + 2 * hd - 3 + j, 6 - (j > 2 ? 2 : 0), 1, hair[clamp(hn - 2, 0, hn)]);
    rump();
  }
  s.outline();
  s.hold = [X, Y];
  return s;
}
