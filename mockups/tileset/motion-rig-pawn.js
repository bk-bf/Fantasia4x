'use strict';
function rigHead(s, f, o, X, hTop, face, p) {
  const skin = o.skin || f.skin, sn = skin.length - 1, hair = o.hair || P.furBrown, hn = hair.length - 1, tunic = o.tunic || P.cloth, hd = f.hd, hh = f.hh;
  const side = face === 's', back = face === 'b', er = hTop + Math.floor(hh * .5), noHair = o.bald || f.bald, hat = o.hat, sway = rnd(p.hair || 0);
  for (let j = 0; j < hh; j++) {
    const inset = j === 0 || j === hh - 1 ? 2 : j === 1 || j === hh - 2 ? 1 : 0;
    for (let i = -hd + inset; i < hd - inset; i++) {
      const u = (i + hd) / (2 * hd - 1);
      s.set(X + i, hTop + j, skin[clamp((u < .25 ? sn : u < .72 ? sn - 1 : sn - 2) - (j >= hh - 2 ? 1 : 0), 0, sn)]);
    }
  }
  const eye = f.eyes || P.ink, ee = f.eyes ? 220 : 0, brow = noHair ? skin[1] : hair[Math.max(0, hn - 3)], lk = p.look || 0;
  if (side) {
    const F = X + hd;
    s.set(F, er + 1, skin[sn - 1]); s.set(F, er + 2, skin[sn - 3]);
    s.set(X - 1, er, skin[sn - 2]); s.set(X, er, skin[sn - 2]); s.set(X - 1, er + 1, skin[sn - 3]); s.set(X, er + 1, skin[sn - 3]);
    if (p.blink) s.rect(F - 3, er, 2, 1, skin[Math.max(0, sn - 3)]); else { s.set(F - 3, er, P.cloth[5]); s.set(F - 2, er, eye, ee); }
    s.rect(F - 4, er - 1, 3, 1, brow);
    s.rect(F - 3, er + 3, 3, 1, skin[Math.max(0, sn - 3)]);
    if (p.mouth) s.rect(F - 2, er + 3, 2, 2, skin[0]);
    if (f.snout) { for (let j = 0; j < 4; j++) for (let i = 0; i < 4 + (j > 0 ? 1 : 0); i++) s.set(F - 2 + i, er + 1 + j, skin[clamp(sn - (i > 2 ? 0 : 1) - (j === 3 ? 1 : 0), 0, sn)]); s.rect(F + 1, er + 1, 2, 2, P.ink); s.rect(F - 2, er + 4, 5, 1, skin[0]); s.set(F, er + 5, P.bone[5]); s.set(F + 2, er + 5, P.bone[5]); }
    if (f.pointears) for (let k = 0; k < 5; k++) { const w = Math.max(1, 3 - (k >> 1)); s.rect(X + 1 - (k >> 1), hTop - 1 - k, w, 1, skin[sn - 2]); s.rect(X - 3 - (k >> 1), hTop - 1 - k, w, 1, skin[sn - 1]); }
  } else if (!back) {
    s.set(X - hd - 1, er, skin[sn - 1]); s.set(X - hd - 1, er + 1, skin[sn - 2]); s.set(X + hd, er, skin[sn - 2]); s.set(X + hd, er + 1, skin[sn - 3]);
    if (p.blink) { s.rect(X - 3, er, 2, 1, skin[Math.max(0, sn - 3)]); s.rect(X + 1, er, 2, 1, skin[Math.max(0, sn - 3)]); }
    else { s.set(X - 3, er, lk < 0 ? eye : P.cloth[5], lk < 0 ? ee : 0); s.set(X - 2, er, lk < 0 ? P.cloth[5] : eye, lk < 0 ? 0 : ee); s.set(X + 1, er, lk > 0 ? P.cloth[4] : eye, lk > 0 ? 0 : ee); s.set(X + 2, er, lk > 0 ? eye : P.cloth[4], lk > 0 ? ee : 0); }
    s.rect(X - 3, er - 1, 2, 1, brow); s.rect(X + 1, er - 1, 2, 1, brow);
    s.set(X - 1, er + 1, skin[sn]); s.set(X, er + 1, skin[sn - 2]); s.set(X - 1, er + 2, skin[sn - 2]);
    s.rect(X - 2, er + 3, 3, 1, skin[Math.max(0, sn - 3)]);
    if (p.mouth) s.rect(X - 1, er + 3, 2, 2, skin[0]);
    if (f.snout) { for (let j = 0; j < 4; j++) for (let i = -2 - (j > 0 ? 1 : 0); i < 2 + (j > 0 ? 1 : 0); i++) s.set(X + i, er + 1 + j, skin[clamp(sn - (i > 0 ? 1 : 0) - (j === 3 ? 1 : 0), 0, sn)]); s.rect(X - 1, er + 1, 2, 2, P.ink); s.rect(X - 2, er + 4, 4, 1, skin[0]); s.set(X - 2, er + 5, P.bone[5]); s.set(X + 1, er + 5, P.bone[5]); }
    if (f.pointears) for (let k = 0; k < 5; k++) { const w = Math.max(1, 3 - (k >> 1)); s.rect(X - hd + (k >> 1), hTop - 1 - k, w, 1, skin[sn - 1]); s.rect(X + hd - 3, hTop - 1 - k, w, 1, skin[sn - 2]); }
  } else {
    s.set(X - hd - 1, er, skin[sn - 1]); s.set(X - hd - 1, er + 1, skin[sn - 2]); s.set(X + hd, er, skin[sn - 2]); s.set(X + hd, er + 1, skin[sn - 3]);
    if (f.pointears) for (let k = 0; k < 5; k++) { const w = Math.max(1, 3 - (k >> 1)); s.rect(X - hd + (k >> 1), hTop - 1 - k, w, 1, skin[sn - 1]); s.rect(X + hd - 3, hTop - 1 - k, w, 1, skin[sn - 2]); }
  }
  if (!noHair) {
    const hc = (i, d) => { const u = (i + hd) / (2 * hd); return hair[clamp((u < .3 ? hn : u < .7 ? hn - 1 : hn - 2) - (d || 0), 0, hn)]; };
    for (let j = -1; j < 3; j++) { const inset = j === -1 ? 2 : j === 0 ? 1 : 0; for (let i = -hd + inset - (j > 0 ? 1 : 0); i < hd - inset + (j > 0 ? 1 : 0); i++) s.set(X + i, hTop + j, hc(i, j === 2 && (i & 1) ? 1 : 0)); }
    if (back) {
      for (let j = 3; j < hh - 2; j++) for (let i = -hd - (j < 6 ? 1 : 0); i < hd + (j < 6 ? 1 : 0); i++) s.set(X + i, hTop + j, hc(i, ((i * 3 + j) % 4 === 0 ? 1 : 0) + (j === hh - 3 && (i & 1) ? 1 : 0)));
      if (f.longhair || o.longhair) for (let j = hh - 2; j < hh + 6; j++) for (let i = -hd - 1; i < hd + 1; i++) if (j < hh + 4 || (i + j) & 1) s.set(X + i + (j > hh + 1 ? sway : 0), hTop + j, hc(i, (i * 3 + j) % 4 === 0 ? 1 : 0));
      if (o.bun) { s.oval(X, hTop - 2, 2.6, 2.2, () => hair[hn - 1]); s.set(X - 1, hTop - 3, hair[hn]); }
    } else if (side) {
      for (let i = 0; i < hd; i++) if (hash(i, 3, o.seed || 1) > .45) s.set(X + i, hTop + 3, hair[hn - 1 - (i > 1 ? 1 : 0)]);
      for (let j = 3; j < hh - 2; j++) for (let i = -hd - (j < 6 ? 1 : 0); i < -1 - (j > 5 ? 1 : 0); i++) s.set(X + i, hTop + j, hc(i, (i * 3 + j) % 4 === 0 ? 1 : 0));
      if (f.longhair || o.longhair) for (let j = 5; j < hh + 6; j++) s.rect(X - hd - 1 - (j > 8 ? 1 : 0) - (j > hh ? sway : 0), hTop + j, 3, 1, hair[hn - 1 - (j % 3 === 0 ? 1 : 0)]);
      if (o.bun) { s.oval(X - 3, hTop - 2, 2.6, 2.2, () => hair[hn - 1]); s.set(X - 4, hTop - 3, hair[hn]); }
    } else {
      for (let i = -hd; i < hd; i++) if (hash(i, 3, o.seed || 1) > .45) s.set(X + i, hTop + 3, hair[hn - 1 - (i > 1 ? 1 : 0)]);
      for (let j = 3; j < 6; j++) { s.set(X - hd - 1, hTop + j, hair[hn - 1]); s.set(X + hd, hTop + j, hair[hn - 3]); if (j < 5) { s.set(X - hd, hTop + j, hair[hn - 1]); s.set(X + hd - 1, hTop + j, hair[hn - 2]); } }
      if (f.longhair || o.longhair) for (let j = 5; j < hh + 6; j++) { const w = j > hh ? sway : 0; s.rect(X - hd - 1 - (j > 8 ? 1 : 0) + w, hTop + j, 2, 1, hair[hn - 1 - (j % 3 === 0 ? 1 : 0)]); s.rect(X + hd - 1 + (j > 8 ? 1 : 0) + w, hTop + j, 2, 1, hair[hn - 3]); }
      if (o.bun) { s.oval(X, hTop - 3, 2.6, 2.2, () => hair[hn - 1]); s.set(X - 1, hTop - 4, hair[hn]); }
    }
  }
  if ((f.beard || o.beard) && !back) {
    const n = f.beard ? 10 : 5;
    if (side) {
      const F = X + hd;
      for (let j = 0; j < n; j++) { const w = j < 6 ? 5 : Math.max(1, 5 - (j - 5)); for (let i = 0; i < w; i++) s.set(F - w + i + (j > 1 ? 0 : -1), er + 2 + j, hair[clamp(hn - 1 - (i > w - 3 ? 0 : 1) - (j % 3 === 2 ? 1 : 0), 0, hn)]); }
      s.rect(F - 3, er + 3, 2, 1, skin[Math.max(0, sn - 3)]);
      if (f.beard) { s.rect(F - 3, er + 10, 2, 3, hair[hn - 2]); s.set(F - 3, er + 13, P.gold[3]); }
    } else {
      for (let j = 0; j < n; j++) { const w = j < 2 ? hd - 1 : j < 6 ? hd - 2 : Math.max(1, hd - 3 - (j - 6)); for (let i = -w; i < w; i++) s.set(X + i, er + 2 + j, hair[clamp(hn - 1 - (i > 1 ? 1 : 0) - (j % 3 === 2 ? 1 : 0) + (i < -1 ? 1 : 0), 0, hn)]); }
      s.rect(X - 2, er + 3, 3, 1, skin[Math.max(0, sn - 3)]);
      if (p.mouth) s.rect(X - 1, er + 3, 2, 2, skin[0]);
      if (f.beard) { s.rect(X - 3, er + 9, 2, 3, hair[hn - 2]); s.rect(X + 1, er + 9, 2, 3, hair[hn - 3]); s.set(X - 3, er + 12, P.gold[3]); s.set(X + 1, er + 12, P.gold[3]); }
    }
  }
  if (f.ears) for (let k = 0; k < 4; k++) { if (side) s.set(X - 1 - (k >> 1), er - k, skin[sn - 1]); else { s.set(X - hd - 1 - (k > 1 ? 1 : 0), er - k, skin[sn - 1]); s.set(X + hd + (k > 1 ? 1 : 0), er - k, skin[sn - 2]); } }
  if (f.bigears) for (let k = 0; k < 5; k++) {
    const y = er - (k >> 1) - (k > 3 ? 1 : 0), h = k < 3 ? 3 : 2;
    if (side) s.rect(X - 1 - k, y - (k >> 1), 1, h, skin[sn - 1 - (k === 0 ? 1 : 0)]);
    else { s.rect(X - hd - 1 - k, y, 1, h, skin[sn - 1 - (k === 0 ? 1 : 0)]); s.rect(X + hd + k, y, 1, h, skin[sn - 2]); }
  }
  if (f.tusks) {
    if (side) { s.rect(X + hd - 2, er + 3, 1, 2, P.bone[5]); s.rect(X, er - 1, hd, 1, skin[0]); s.rect(X + 1, er + 4, hd - 2, 1, skin[1]); }
    else if (!back) { s.rect(X - 4, er + 3, 1, 2, P.bone[5]); s.rect(X + 3, er + 3, 1, 2, P.bone[4]); s.rect(X - 4, er - 1, 8, 1, skin[0]); s.rect(X - 3, er + 4, 6, 1, skin[1]); }
    if (o.mohawk) { if (side) for (let i = -hd + 1; i < hd - 1; i++) s.rect(X + i, hTop - 3 + (Math.abs(i + .5) > 3 ? 1 : 0), 1, 3, o.mohawk[3 - (i & 1)]); else for (let j = -3; j < (back ? hh - 3 : 4); j++) s.rect(X - 1, hTop + j, 2, 1, o.mohawk[3 - (j & 1)]); }
  }
  if (hat === 'straw') { for (let i = -hd - 5; i < hd + 5; i++) { s.set(X + i, hTop + 1, P.thatch[(i & 1) ? 4 : 5]); s.set(X + i, hTop + 2, P.thatch[2]); } for (let i = -hd - 3; i < hd + 3; i++) s.set(X + i, hTop, P.thatch[4]); for (let j = 0; j < 4; j++) for (let i = -hd + 1; i < hd - 1; i++) s.set(X + i, hTop - 4 + j, j === 3 ? P.red[2] : P.thatch[clamp(5 - (i > 1 ? 1 : 0) - ((i + j) & 1), 0, 5)]); }
  if (hat === 'hood') {
    const c = o.hood || tunic, n = c.length - 1;
    for (let j = -2; j < hh + 2; j++) { const inset = j === -2 ? 3 : j === -1 ? 1 : 0; for (let i = -hd - 1 + inset; i < hd + 1 - inset; i++) {
      if (!back && j > 2 && j < hh && (side ? i > 0 : i > -hd && i < hd - 1)) continue;
      const u = (i + hd + 1) / (2 * hd + 1); s.set(X + i, hTop + j, c[clamp((u < .3 ? n - 1 : u < .7 ? n - 2 : n - 3) + (j < 0 ? 1 : 0) - (back && i === 0 && j > 1 ? 1 : 0), 0, n)]);
    } }
    if (!back) for (let i = side ? 1 : -hd + 1; i < hd - 1 + (side ? 1 : 0); i++) s.set(X + i, hTop + 3, dark(skin[sn - 2], .7));
  }
  if (hat === 'helm') {
    for (let j = -2; j < 4; j++) { const inset = j === -2 ? 2 : j === -1 ? 1 : 0; for (let i = -hd - (j > 1 ? 1 : 0) + inset; i < hd + (j > 1 ? 1 : 0) - inset; i++) { const u = (i + hd) / (2 * hd); s.set(X + i, hTop + j, P.iron[clamp((u < .2 ? 5 : u < .35 ? 6 : u < .7 ? 4 : 2) - (j === 3 ? 1 : 0), 0, 6)]); } }
    if (back) for (let j = 4; j < hh - 1; j++) for (let i = -hd; i < hd; i++) s.set(X + i, hTop + j, P.iron[clamp((i < -2 ? 4 : i < 2 ? 3 : 2) - (j === hh - 2 ? 1 : 0), 0, 6)]);
    else if (side) { s.rect(X + hd - 2, hTop + 4, 2, 4, P.iron[4]); s.rect(X + hd - 2, hTop + 4, 1, 4, P.iron[5]); s.rect(X - hd, hTop + 4, 3, 4, P.iron[3]); s.rect(X - hd, hTop + 7, 3, 1, P.iron[2]); }
    else { s.rect(X - 1, hTop + 4, 2, 4, P.iron[4]); s.rect(X - 1, hTop + 4, 1, 4, P.iron[5]); }
    s.rect(X - hd - 1, hTop + 3, 2 * hd + 2, 1, P.iron[2]);
    if (o.crest) {
      if (side) for (let i = -3; i <= 3; i++) s.rect(X + i, hTop - 6 + (Math.abs(i) === 3 ? 1 : 0), 1, 4 - (Math.abs(i) === 3 ? 1 : 0), o.crest[i < -1 ? 4 : i > 1 ? 1 : 3]);
      else { s.rect(X - 1, hTop - 6, 2, 4, o.crest[3]); s.rect(X - 2, hTop - 5, 1, 3, o.crest[4]); s.rect(X + 1, hTop - 5, 1, 4, o.crest[1]); }
    }
  }
  if (hat === 'crown') { s.rect(X - hd, hTop - 1, 2 * hd, 2, P.gold[3]); s.rect(X - hd, hTop - 1, 2 * hd, 1, P.gold[4]); for (const i of [-hd, -1, hd - 2]) s.rect(X + i, hTop - 3, 2, 2, P.gold[4]); if (!back) s.set(X - 1 + (side ? hd - 1 : 0), hTop, P.red[4]); }
  return er;
}

const WRAP = [P.cloth[2], P.cloth[1]];
const rimOf = (was, c) => !!(was && c) && c[0] === was[0] * .6 && c[1] === was[1] * .6;

function rigPawn(o, p) {
  p = p || {};
  const f = FOLK[o.race || 'human'], s = new Spr(RG.W, RG.H, RG.CX, RG.BASE), face = p.face || 'f', side = face === 's', back = face === 'b';
  const skin = o.skin || f.skin, sn = skin.length - 1, tunic = o.tunic || P.cloth, pants = o.pants || P.leather, body = o.armor || tunic;
  const by = rnd(p.by || 0), lean = p.lean || 0, cx = RG.CX + rnd(p.bx || 0), base = RG.BASE, hw = f.hw, aw = f.aw, lw = hw - 1, br = p.br ? 1 : 0;
  const legTop = base - f.legs + 1 + by, tTop = legTop - f.tl, armLen = f.tl - 1, hTop = tTop - br - f.hh + rnd(p.hd ? p.hd[1] : 0), HX = cx + rnd(lean + (p.hd ? p.hd[0] : 0));
  const lx = j => rnd(lean * clamp(1 - j / f.tl, 0, 1)), kind = p.item === undefined ? o.tool : p.item, pts = s.pts = {}, sx0 = cx + rnd(lean);
  const fl = p.fl || [0, 0], fr = p.fr || [0, 0], SW = 2 * hw;

  const legF = (sd, ft, lost) => {
    const dx = rnd(ft[0]), n = Math.max(3, f.legs - by - rnd(ft[1])), x0 = sd < 0 ? cx - hw + dx : cx + 1 + dx, cut = Math.ceil(f.legs * .4);
    for (let j = 0; j < n; j++) {
      const y = legTop + j, jb = n - 1 - j, boot = jb < 3, sole = jb === 0;
      if (lost && j >= cut) continue;
      if (lost && j === cut - 1) { for (let i = 0; i < lw; i++) s.set(x0 + i, y, WRAP[(x0 + i) & 1]); if (sd < 0) s.set(x0 + lw, y, j < 2 ? pick3(pants, .6, -1) : P.ink); continue; }
      for (let i = 0; i < lw; i++) {
        const u = i / (lw - 1), R = boot ? P.leather : pants, d = boot ? (jb === 2 ? 1 : sole ? -2 : 0) : (j === Math.floor(f.legs * .4) ? 1 : 0);
        s.set(x0 + i, y, sd < 0 ? pick3(R, u * .7, d) : pick3(R, .3 + u * .7, d - 1));
      }
      if (jb < 2) s.set(sd < 0 ? x0 - 1 : x0 + lw, y, P.leather[sole ? 0 : sd < 0 ? 3 : 1]);
      if (sd < 0) s.set(x0 + lw, y, j < 2 ? pick3(pants, .6, -1) : P.ink);
    }
  };
  const legS = (ft, far) => {
    const w = lw, tot = f.legs - 1, l1 = Math.ceil(tot / 2), l2 = tot - l1, rx = cx - 2 + (far ? 3 : 0);
    const [kx, ky, ex, ey] = ik2(rx, legTop, rx + ft[0], base - ft[1], l1, l2, -1);
    (pts.legs = pts.legs || []).push({ path: [[rx, legTop], [kx, ky], [ex, ey]], w });
    rigLimb(s, [[rx, legTop], [kx, ky], [ex, ey]], w, (t, k) => {
      const u = k / (w - 1), boot = t >= tot - 2.5, sole = t >= tot - .5, c = pick3(boot ? P.leather : pants, far ? .3 + u * .7 : u * .7, (boot ? (sole ? -2 : t < tot - 1.5 ? 1 : 0) : 0) - (far ? 1 : 0));
      return far ? dark(c, .82) : c;
    }, far ? null : shade);
    const tx = rnd(ex) - (w >> 1) + w, ty = rnd(ey);
    s.set(tx, ty, P.leather[0]); s.set(tx, ty - 1, far ? dark(P.leather[2], .82) : P.leather[2]);
  };
  const torso = () => {
    const sw = SW;
    for (let j = -br; j < f.tl + 2; j++) {
      const jj = Math.max(0, j), taper = jj > 5 && jj < f.tl ? 1 : 0, y = tTop + j, ox = cx + lx(jj), w = hw - taper, i0 = side ? -(sw >> 1) - 1 + taper : -w, i1 = side ? sw - (sw >> 1) - 1 : w;
      for (let i = i0; i < i1; i++) {
        const u = (i - i0) / (i1 - i0 - 1);
        let c;
        if (jj >= f.tl - 2 && jj < f.tl) c = (side ? i === i1 - 1 : !back && Math.abs(i + .5) < 1.2) ? P.gold[jj === f.tl - 2 ? 4 : 2] : pick3(P.leather, u, jj === f.tl - 2 ? 1 : -1);
        else if (o.armor === P.iron && !o.plate) c = P.iron[clamp((u < .25 ? 4 : u < .7 ? 3 : 2) + (((i + jj) & 1) ? 1 : -1), 0, 6)];
        else {
          let d = (jj === 0 ? 1 : 0) - (jj > f.tl - 1 ? 1 : 0);
          if (!side && jj > 3 && jj < f.tl - 2 && (Math.abs(u - .32) < .06 || Math.abs(u - .72) < .06)) d -= 1;
          if (jj === 1 && u > .7) d -= 1;
          c = pick3(body, u, d);
          if (o.apron && !back && jj > 2 && (side ? i >= i1 - 3 : Math.abs(i + .5) < w - 1.5)) c = pick3(P.leather, u, jj === 3 ? 1 : 0);
          if (o.apron && back && jj === 3 && Math.abs(i + .5) < w - 1.5) c = P.leather[2];
          if (o.trim && (jj === f.tl || (!back && !side && jj < 3 && Math.abs(i + .5) < 1 + (2 - jj)))) c = o.trim[3];
        }
        s.set(ox + i, y, c);
      }
    }
    if (!o.armor && !back && !side) { s.set(sx0 - 1, tTop - br, skin[sn - 2]); s.set(sx0, tTop - br, skin[sn - 3]); s.set(sx0 - 1, tTop + 1 - br, skin[sn - 2]); }
    for (let y = hTop + f.hh; y < tTop - br; y++) s.rect(HX - 2, y, side ? 3 : 4, 1, skin[clamp(sn - 3, 0, sn)]);
  };
  const cuff = armLen - 4, bn = body.length - 1;
  const armCol = (lit, far, lost) => (t, k, v, X) => {
    const j = rnd(t), hand = j >= armLen - 3, bare = o.sleeves === 0 || j > 6, L = hand || bare ? skin : body, last = j >= armLen - 1, e = k === aw - 1;
    if (lost && j > 2 + br) return null;
    if (lost && j === 2 + br) return WRAP[X & 1];
    let c = L === skin ? skin[clamp(lit ? sn - 1 - (e ? 1 : 0) - (last ? 1 : 0) : sn - 3 + (e ? 1 : 0) - (last ? 1 : 0), 0, sn)] : lit ? pick3(L, k / aw * .5, j === 6 ? -1 : 0) : pick3(L, .7, (e ? 1 : 0) + (j === 6 ? -1 : 0));
    if (o.sleeves === 'long' && j > 6 && j <= cuff) c = body[clamp(bn - (j === cuff ? 4 : side ? 2 : lit ? 1 : 3), 0, bn)];
    return far ? dark(c, .8) : c;
  };
  const TOT = armLen - 1;
  const reach = (ax, ay, tgt, bend, crook) => {
    const l1 = Math.ceil(TOT / 2), t = tgt || [0, TOT];
    if (!side && !crook && Math.abs(t[0]) < 2.5 && t[1] > 4) return [[ax, ay], [ax + t[0], ay + t[1]]];
    const [ex, ey, hx, hy] = ik2(ax, ay, ax + t[0], ay + t[1], l1, TOT - l1, bend);
    return [[ax, ay], [ex, ey], [hx, hy]];
  };
  const spanOf = path => path.length === 2 ? Math.hypot(path[1][0] - path[0][0], path[1][1] - path[0][1]) : 0;
  const limb = (S, path, lit, far, rim, span, lost) => { const col = armCol(lit, far, lost), k = span ? TOT / span : 1; rigLimb(S, path, aw, (d, e, v, X) => col(d * k, e, v, X), rim ? shade : null); };
  const handOf = path => path[path.length - 1].map(rnd);
  const upper = path => { if (path.length === 3) return path.slice(0, 2); const k = .55; return [path[0], [mix(path[0][0], path[1][0], k), mix(path[0][1], path[1][1], k)]]; };
  const arm = (ax, ay, tgt, lit, far, bend, rim, S, lost) => { const path = reach(ax, ay, tgt, bend); limb(S || s, path, lit, far, rim, spanOf(path), lost); return handOf(path); };
  const pad = (x0, lit) => { if (!o.armor) return; s.rect(x0, tTop - br, aw + 1, 4, o.armor[lit ? 4 : 2]); s.rect(x0, tTop - br, aw + 1, 1, o.armor[lit ? o.armor.length - 1 : 4]); s.rect(x0, tTop + 3 - br, aw + 1, 1, o.armor[1]); };
  const shield = (x, y) => { if (!o.shield) return; s.oval(x, y, 6, 7.4, (px, py, nx, ny) => { const q = Math.hypot(nx, ny); return q > .84 ? P.iron[nx + ny < 0 ? 5 : 2] : Math.abs(nx) < .16 || Math.abs(ny) < .13 ? P.cloth[4] : o.shield[nx < -.2 ? 4 : nx < .4 ? 3 : 2]; }); s.oval(x, y, 1.6, 1.6, () => P.iron[6]); };
  const grip = (hx, hy, ang, opt) => {
    if (!TOOLS[kind]) return;
    if (opt && opt.under) { const t = new Spr(s.w, s.h); pts.tip = toolAt(t, kind, hx, hy, ang, opt); for (let i = 0; i < t.c.length; i++) if (t.c[i] && !s.c[i]) { s.c[i] = t.c[i]; s.e[i] = t.e[i]; } }
    else pts.tip = toolAt(s, kind, hx, hy, ang, opt);
    if (kind === 'torch' || kind === 'staff') pts.glow = pts.tip;
  };
  const knuckle = (hx, hy) => { s.set(hx, hy, skin[sn - 1]); s.set(hx, hy + 1, skin[Math.max(0, sn - 3)]); s.set(hx - 1, hy, skin[sn - 2]); };
  const capeLen = f.tl + f.legs - 4, cs = p.cape || 0;
  let parts = null, holds = null, hand = null, headDone = null;

  if (side) {
    const sy = tTop + 1 - br, far = [sx0, sy], near = [sx0 - 1, sy], bowing = kind === 'bow' && p.bow !== undefined;
    let htl = p.hl;
    const hr = p.hr || (TOOLS[kind] ? [2, armLen - 2] : null), ang = p.tool === undefined ? (TOOLS[kind] || {}).hold || 0 : p.tool;
    if (p.two && hr) { const a = ang * D2R; htl = [near[0] + hr[0] + Math.sin(a) * p.two - far[0], near[1] + hr[1] - Math.cos(a) * p.two - far[1]]; }
    const fh = arm(far[0], far[1], htl, false, true, 1, false, null, o.oneArm);
    if (bowing) { toolAt(s, 'bow', fh[0] + 1, fh[1], 0, { pull: p.bow, arrow: p.arrow, twang: p.twang }); pts.tip = [fh[0] + 10, fh[1]]; }
    if (o.shield) shield(fh[0] + 2, fh[1] - 3);
    if (o.cape) for (let j = 0; j < capeLen; j++) { const k = j / capeLen, x = sx0 - (SW >> 1) - 2 - rnd(cs * k * k) - (j > 6 ? 1 : 0); s.rect(x, tTop + 1 + j, 3 + (j > 6 ? 1 : 0), 1, o.cape[j % 5 === 4 ? 1 : 2]); s.set(x, tTop + 1 + j, o.cape[3]); }
    if (f.tail) for (let k = 0; k < 9; k++) s.rect(cx - (SW >> 1) - 2 - k, legTop + 1 + rnd(Math.sin(k * .5 + (p.tail || 0)) * 2) + (k >> 2), 1, k < 5 ? 3 : 2, skin[k < 5 ? sn - 2 : sn - 3]);
    legS(fl, true); legS(fr, false);
    torso();
    rigHead(s, f, o, HX + 1, hTop, 's', p);
    headDone = s.c.slice();
    pad(sx0 - 3, true);
    const nearArm = S => arm(near[0], near[1], hr, true, false, 1, true, S), tucked = p.tuck && !bowing;
    if (tucked) grip(...handOf(reach(near[0], near[1], hr, 1)), ang);
    const nh = nearArm(s);
    parts = { head: [S => rigHead(S, f, o, HX + 1, hTop, 's', p)], 'near arm': [nearArm] };
    hand = [nh[0], nh[1] + 1]; holds = { hip: hand, chest: nh, low: nh, shoulder: [sx0 + 1, tTop + 1 - br], cradle: [sx0 + 1, tTop + 1 - br], yoke: [sx0 - 1, tTop + 2 - br] };
    if (!bowing && !p.carry && !tucked) { grip(nh[0], nh[1], ang); if (pts.tip) knuckle(nh[0], nh[1]); }
    if (p.two && pts.tip) { const a = ang * D2R; knuckle(rnd(nh[0] + Math.sin(a) * p.two), rnd(nh[1] - Math.cos(a) * p.two)); }
    pts.hand = nh; pts.hands = [nh]; pts.mouth = [HX + f.hd + 2, hTop + Math.floor(f.hh * .5) + 3]; pts.head = [HX + 1, hTop - 3];
    pts.feet = [[cx + fl[0], base - fl[1]], [cx - 1 + fr[0], base - fr[1]]];
  } else {
    const xL = cx - hw - 1 - ((aw - 1) >> 1) + rnd(lean), xR = cx + hw + (aw >> 1) + rnd(lean), sy = tTop + 1 - br, tl = back ? p.hr : p.hl, tr = back ? p.hl : p.hr;
    const raised = t => t && (t[1] <= 4 || Math.abs(t[0]) >= 2.5);
    if (back && o.shield) shield(xR + 2, tTop + 7);
    legF(-1, fl, !back && o.oneLeg); legF(1, fr, back && o.oneLeg);
    torso();
    const keyL = back ? 'hr' : 'hl', keyR = back ? 'hl' : 'hr', crooked = key => (p.crook || []).includes(key), winged = t => p.wing && t && t[1] < 0 ? -1 : 1;
    const pathL = reach(xL, sy, tl, winged(tl), crooked(keyL)), pathR = reach(xR, sy, tr, -winged(tr), crooked(keyR)), hL = handOf(pathL), hR = handOf(pathR);
    const seen = (path, key) => back && (p.fore || []).includes(key) ? upper(path) : path;
    const armL = (rim, S) => limb(S || s, seen(pathL, keyL), true, false, rim, spanOf(pathL), !back && o.oneArm), armR = (rim, S) => limb(S || s, seen(pathR, keyR), false, false, rim, spanOf(pathR), back && o.oneArm);
    if (!raised(tl)) armL(false);
    if (!raised(tr)) armR(false);
    if (!tl && !p.carry) s.set(xL - (aw >> 1), sy, null);
    pad(cx - hw - aw + rnd(lean), true); pad(cx + hw - 1 + rnd(lean), false);
    if (f.tail) for (let k = 0; k < 9; k++) s.rect(cx + hw + aw + k, legTop + 1 + rnd(Math.sin(k * .5 + (p.tail || 0)) * 2) + (k >> 2), 1, k < 5 ? 3 : 2, skin[k < 5 ? sn - 2 : sn - 3]);
    if (o.cape) for (let j = 0; j < capeLen; j++) {
      const k = j / capeLen, w = rnd(cs * k * k), xa = cx - hw - aw - (j > 6 ? 1 : 0) + w, xb = cx + hw + aw - 1 + (j > 6 ? 1 : 0) + w;
      if (back) for (let x = xa + 1; x < xb; x++) { const u = (x - xa) / (xb - xa); s.set(x, tTop + 1 + j, o.cape[clamp((u < .25 ? 3 : u < .7 ? 2 : 1) - ((x + (j >> 2)) % 5 === 0 ? 1 : 0), 0, 4)]); }
      s.set(xa, tTop + 1 + j, o.cape[3]); s.set(xb, tTop + 1 + j, o.cape[1]);
    }
    rigHead(s, f, o, HX, hTop, face, p);
    headDone = s.c.slice();
    if (raised(tl)) armL(true);
    if (raised(tr)) armR(true);
    if (!back && o.shield) shield(hL[0] - 1, hL[1] - 3);
    const th = back ? hL : hR, off = (back ? -1 : 1) * (aw - (aw >> 1));
    const head = S => rigHead(S, f, o, HX, hTop, face, p), arms = [S => armL(true, S), S => armR(true, S)], mid = cx + rnd(lean);
    const near = (draw, at, r) => S => { const t = new Spr(s.w, s.h); draw(t); for (let y = at[1] - r; y <= at[1] + r; y++) for (let x = at[0] - r; x <= at[0] + r; x++) if (t.get(x, y)) S.set(x, y, t.get(x, y)); };
    const grips = S => { for (const g of [-9, 6]) { S.rect(cx + g, tTop + 5, 3, 3, skin[sn - 1]); S.rect(cx + g, tTop + 7, 3, 1, skin[Math.max(0, sn - 3)]); } };
    const elbows = [S => limb(S, upper(pathL), true, false, false, spanOf(pathL)), S => limb(S, upper(pathR), false, false, false, spanOf(pathR))];
    if (p.carry === 'shoulder' || (p.carry === 'cradle' && !back)) grips(s);
    parts = { head: [head], arms, hands: [near(arms[0], hL, 2), near(arms[1], hR, 2)], 'carrying arm': [arms[back ? 0 : 1]], grips: [grips], elbows };
    const low = Math.max(hL[1], hR[1]);
    hand = p.carry === 'hip' ? [th[0], th[1] + 1] : [mid, low + 2]; holds = { hip: hand, chest: [mid, low], low: [mid, low], shoulder: [cx, tTop + 10], cradle: [cx, tTop + 12], yoke: [mid, tTop + (back ? 4 : 2) - br] };
    if (p.carry) pts.hold = hand;
    else if (kind === 'bow' && p.bow !== undefined) { const bh = back ? hR : hL; toolAt(s, 'bow', bh[0] + (back ? 1 : -1), bh[1] - 6, 0, { pull: p.bow, mirror: back ? 0 : 1 }); pts.tip = [bh[0], bh[1] - 6]; }
    else grip(th[0] + off, th[1] - 1 - (kind === 'bow' ? 6 : 0), p.tool, { mirror: back ? 1 : 0, under: p.under });
    pts.hand = th; pts.hands = [hL, hR].filter((h, i) => !(o.oneArm && i === (back ? 1 : 0))); pts.mouth = [HX, hTop + Math.floor(f.hh * .5) + 4]; pts.head = [HX, hTop - 3];
    pts.feet = [[cx - hw + 2, base - fl[1]], [cx + 3, base - fr[1]]];
  }
  pts.torso = [sx0, tTop - br, lean]; pts.hip = [cx, legTop];
  if (p.carry) { const cu = p.cu === undefined ? 1 : p.cu, to = holds[p.carry]; pts.carry = [rnd(mix(hand[0], to[0], cu)), rnd(mix(hand[1], to[1], cu))]; }
  s.front = s.c.map((c, i) => c !== headDone[i] && !rimOf(headDone[i], c) ? 1 : 0);
  const bare = p.carry ? { c: s.c.slice(), e: s.e.slice() } : null;
  s.outline();
  if (p.carry) Object.assign(s, { bare, mask: rigMask(s, RIG_OVER[p.carry][face], parts), tilt: p.tilt || 0, clipRow: tTop + 1 - br });
  s.sh = { rx: 9, ry: 3.4, dx: 4, dy: 0 };
  return s;
}
