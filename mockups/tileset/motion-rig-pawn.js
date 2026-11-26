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
      if (f.longhair || o.longhair) for (let i = -hd - 1; i < hd + 1; i++) { const strand = (i + hd + 1) % 3 === 0 ? 1 : 0, end = hh + 4 + (hash(i, 5, o.seed || 1) > .5 ? 1 : 0) + strand; for (let j = hh - 2; j < end; j++) s.set(X + i + (j > hh + 1 ? sway : 0), hTop + j, hc(i, strand + (j === end - 1 ? 1 : 0))); }
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
  rigHat(s, o, X, hTop, face, skin, tunic, hd, hh);
  return er;
}

function rigHat(s, o, X, hTop, face, skin, tunic, hd, hh, drape = 2) {
  const sn = skin.length - 1, side = face === 's', back = face === 'b', hat = o.hat;
  if (hat === 'straw') { for (let i = -hd - 5; i < hd + 5; i++) { s.set(X + i, hTop + 1, P.thatch[(i & 1) ? 4 : 5]); s.set(X + i, hTop + 2, P.thatch[2]); } for (let i = -hd - 3; i < hd + 3; i++) s.set(X + i, hTop, P.thatch[4]); for (let j = 0; j < 4; j++) for (let i = -hd + 1; i < hd - 1; i++) s.set(X + i, hTop - 4 + j, j === 3 ? P.red[2] : P.thatch[clamp(5 - (i > 1 ? 1 : 0) - ((i + j) & 1), 0, 5)]); }
  if (hat === 'hood') {
    const c = o.hood || tunic, n = c.length - 1;
    for (let j = -2; j < hh + drape; j++) { const inset = j === -2 ? 3 : j === -1 ? 1 : 0; for (let i = -hd - 1 + inset; i < hd + 1 - inset; i++) {
      if (!back && j > 2 && j < hh && (side ? i > 0 : i > -hd && i < hd - 1)) continue;
      const u = (i + hd + 1) / (2 * hd + 1); s.set(X + i, hTop + j, c[clamp((u < .3 ? n - 1 : u < .7 ? n - 2 : n - 3) + (j < 0 ? 1 : 0) - (back && i === 0 && j > 1 ? 1 : 0), 0, n)]);
    } }
    if (!back) for (let i = side ? 1 : -hd + 1; i < hd - 1 + (side ? 1 : 0); i++) s.set(X + i, hTop + 3, dark(skin[sn - 2], .7));
  }
  if (hat === 'helm') {
    const hm = o.helm || P.iron;
    for (let j = -2; j < 4; j++) { const inset = j === -2 ? 2 : j === -1 ? 1 : 0; for (let i = -hd - (j > 1 ? 1 : 0) + inset; i < hd + (j > 1 ? 1 : 0) - inset; i++) { const u = (i + hd) / (2 * hd); s.set(X + i, hTop + j, hm[clamp((u < .2 ? 5 : u < .35 ? 6 : u < .7 ? 4 : 2) - (j === 3 ? 1 : 0), 0, 6)]); } }
    if (back) for (let j = 4; j < hh - 1; j++) for (let i = -hd; i < hd; i++) s.set(X + i, hTop + j, hm[clamp((i < -2 ? 4 : i < 2 ? 3 : 2) - (j === hh - 2 ? 1 : 0), 0, 6)]);
    else if (side) { s.rect(X + hd - 2, hTop + 4, 2, 4, hm[4]); s.rect(X + hd - 2, hTop + 4, 1, 4, hm[5]); s.rect(X - hd, hTop + 4, 3, 4, hm[3]); s.rect(X - hd, hTop + 7, 3, 1, hm[2]); }
    else { s.rect(X - 1, hTop + 4, 2, 4, hm[4]); s.rect(X - 1, hTop + 4, 1, 4, hm[5]); }
    s.rect(X - hd - 1, hTop + 3, 2 * hd + 2, 1, hm[2]);
    if (o.crest) {
      if (side) for (let i = -3; i <= 3; i++) s.rect(X + i, hTop - 6 + (Math.abs(i) === 3 ? 1 : 0), 1, 4 - (Math.abs(i) === 3 ? 1 : 0), o.crest[i < -1 ? 4 : i > 1 ? 1 : 3]);
      else { s.rect(X - 1, hTop - 6, 2, 4, o.crest[3]); s.rect(X - 2, hTop - 5, 1, 3, o.crest[4]); s.rect(X + 1, hTop - 5, 1, 4, o.crest[1]); }
    }
  }
  if (hat === 'crown') { const cm = o.band || P.gold; s.rect(X - hd, hTop - 1, 2 * hd, 2, cm[3]); s.rect(X - hd, hTop - 1, 2 * hd, 1, cm[4]); for (const i of [-hd, -1, hd - 2]) s.rect(X + i, hTop - 3, 2, 2, cm[4]); if (!back) s.set(X - 1 + (side ? hd - 1 : 0), hTop, P.red[4]); }
}

const WRAP = [P.cloth[2], P.cloth[1]];
const rimOf = (was, c) => !!(was && c) && c[0] === was[0] * .6 && c[1] === was[1] * .6;

const REACH = { hip: 3, front: 6 }, SUNK = { log: 2, game: 8, behind: .34, slung: 7, aside: 2.2, oneHand: .3 }, CLEAR = { ground: 4, shins: 3 }, BEHIND_HEAD = ['game', 'drape'];
function rigPawn(o, p) {
  p = p || {};
  let s = new Spr(RG.W, RG.H, RG.CX, RG.BASE);
  const f = FOLK[o.race || 'human'], face = p.face || 'f', side = face === 's', back = face === 'b';
  const skin = o.skin || f.skin, sn = skin.length - 1, tunic = o.tunic || (o.bare ? skin : P.cloth), pants = o.pants || (o.bare ? skin : P.leather), body = o.armor || tunic;
  const boots = o.boots || (o.bare ? skin : P.leather), belted = o.belt === undefined ? !o.bare || !!(o.tunic || o.armor) : !!o.belt;
  const wv = (k, x, y) => o.weave && o.weave[k] ? WORN_WEAVE(o.weave[k], x, y) : 0, sl = o.sleeve || body;
  const by = Math.min(rnd(p.by || 0), f.legs - CLEAR.shins), lean = p.lean || 0, cx = RG.CX + rnd(p.bx || 0), base = RG.BASE, hw = f.hw, aw = f.aw, lw = hw - 1, br = p.br ? 1 : 0;
  const legTop = base - f.legs + 1 + by, tTop = legTop - f.tl, armLen = f.tl - 1, hTop = tTop - br - f.hh + rnd(p.hd ? p.hd[1] : 0), HX = cx + rnd(lean + (p.hd ? p.hd[0] : 0));
  const lx = j => rnd(lean * clamp(1 - j / f.tl, 0, 1)), kind = p.item === undefined ? o.tool : p.item, pts = s.pts = {}, sx0 = cx + rnd(lean);
  const fl = p.fl || [0, 0], fr = p.fr || [0, 0], SW = 2 * hw, shaped = o.shape || null;

  const legF = (sd, ft, lost) => {
    const dx = rnd(ft[0]), n = Math.max(3, f.legs - by - rnd(ft[1])), x0 = shaped ? (sd < 0 ? cx - lw + dx : cx + dx) : sd < 0 ? cx - hw + dx : cx + 1 + dx, cut = Math.ceil(f.legs * .4), glyph = shaped && shaped.leg(face, sd > 0);
    for (let j = 0; j < n; j++) {
      const y = legTop + j, jb = n - 1 - j, boot = jb < 3, sole = jb === 0;
      if (lost && j >= cut) continue;
      if (lost && j === cut - 1) { for (let i = 0; i < lw; i++) s.set(x0 + i, y, WRAP[(x0 + i) & 1]); if (sd < 0) s.set(x0 + lw, y, j < 2 ? pick3(pants, .6, -1) : P.ink); continue; }
      for (let i = 0; i < lw; i++) {
        const u = i / (lw - 1), R = boot ? boots : pants, d = boot ? (jb === 2 ? 1 : sole ? -2 : 0) : (j === Math.floor(f.legs * .4) ? 1 : 0);
        const w = wv(boot ? 'boots' : 'legs', x0 + i, y), c = sd < 0 ? pick3(R, u * .7, d + w) : pick3(R, .3 + u * .7, d - 1 + w); s.set(x0 + i, y, shaped ? shaped.tone(c, glyph(j, i, n)) : c);
      }
      if (jb < 2 && !shaped) s.set(sd < 0 ? x0 - 1 : x0 + lw, y, boots[sole ? 0 : sd < 0 ? 3 : 1]);
      if (sd < 0 && !shaped) s.set(x0 + lw, y, j < 2 ? pick3(pants, .6, -1) : P.ink);
    }
  };
  const legS = (ft, far) => {
    const w = lw, tot = f.legs - 1, l1 = Math.ceil(tot / 2), l2 = tot - l1, rx = cx - 2 + (far ? 3 : 0);
    const glyph = shaped && shaped.leg('s', false, far), [kx, ky, ex, ey] = ik2(rx, legTop, rx + ft[0], base - ft[1], l1, l2, -1);
    (pts.legs = pts.legs || []).push({ path: [[rx, legTop], [kx, ky], [ex, ey]], w });
    rigLimb(s, [[rx, legTop], [kx, ky], [ex, ey]], w, (t, k) => {
      const u = k / (w - 1), boot = t >= tot - 2.5, sole = t >= tot - .5, c = pick3(boot ? boots : pants, far ? .3 + u * .7 : u * .7, (boot ? (sole ? -2 : t < tot - 1.5 ? 1 : 0) : 0) - (far ? 1 : 0) + wv(boot ? 'boots' : 'legs', k, Math.round(t)));
      return shaped ? shaped.tone(c, glyph(rnd(t), k, tot + 1, w), far) : far ? dark(c, .82) : c;
    }, far ? null : shade);
    const tx = rnd(ex) - (w >> 1) + w, ty = rnd(ey);
    if (!shaped) { s.set(tx, ty, boots[0]); s.set(tx, ty - 1, far ? dark(boots[2], .82) : boots[2]); }
  };
  const torsoAt = (i, jj, y, ox, u, i1, w) => {
        let c;
        if (belted && jj >= f.tl - 2 && jj < f.tl) c = (side ? i === i1 - 1 : !back && Math.abs(i + .5) < 1.2) ? P.gold[jj === f.tl - 2 ? 4 : 2] : pick3(P.leather, u, jj === f.tl - 2 ? 1 : -1);
        else if (o.armor === P.iron && !o.plate) c = P.iron[clamp((u < .25 ? 4 : u < .7 ? 3 : 2) + (((i + jj) & 1) ? 1 : -1), 0, 6)];
        else {
          let d = (jj === 0 ? 1 : 0) - (jj > f.tl - 1 ? 1 : 0);
          if (body !== skin && !side && jj > 3 && jj < f.tl - 2 && (Math.abs(u - .32) < .06 || Math.abs(u - .72) < .06)) d -= 1;
          if (jj === 1 && u > .7) d -= 1;
          c = pick3(body, u, d + wv('torso', ox + i, y));
          if (o.apron && !back && jj > 2 && (side ? i >= i1 - 3 : Math.abs(i + .5) < w - 1.5)) c = pick3(P.leather, u, jj === 3 ? 1 : 0);
          if (o.apron && back && jj === 3 && Math.abs(i + .5) < w - 1.5) c = P.leather[2];
          if (o.trim && (jj === f.tl || (!back && !side && jj < 3 && Math.abs(i + .5) < 1 + (2 - jj)))) c = o.trim[3];
        }
        return c;
  };
  const torso = () => {
    const sw = SW;
    if (shaped) {
      const layer = shaped.torso(face, br), cut = side ? 0 : aw, hips = layer.rows[layer.rows.length - 1];
      const rows = body === skin ? layer.rows : [...layer.rows, hips, hips];
      rows.forEach((row, r) => {
        const j = r - br, jj = Math.max(0, j), y = tTop + j, ox = cx + lx(jj), i0 = layer.x + cut, i1 = layer.x + row.length - cut;
        for (let i = i0; i < i1; i++) { const g = row[i - layer.x]; if (g && g !== ' ') s.set(ox + i, y, shaped.tone(torsoAt(i, jj, y, ox, (i - i0) / Math.max(1, i1 - i0 - 1), i1, hw), g)); }
      });
      return;
    }
    for (let j = -br; j < f.tl + 2; j++) {
      const jj = Math.max(0, j), taper = jj > 5 && jj < f.tl ? 1 : 0, y = tTop + j, ox = cx + lx(jj), w = hw - taper, i0 = side ? -(sw >> 1) - 1 + taper : -w, i1 = side ? sw - (sw >> 1) - 1 : w;
      for (let i = i0; i < i1; i++) s.set(ox + i, y, torsoAt(i, jj, y, ox, (i - i0) / (i1 - i0 - 1), i1, w));
    }
    if (!o.armor && !back && !side) { s.set(sx0 - 1, tTop - br, skin[sn - 2]); s.set(sx0, tTop - br, skin[sn - 3]); s.set(sx0 - 1, tTop + 1 - br, skin[sn - 2]); }
    for (let y = hTop + f.hh; y < tTop - br; y++) s.rect(HX - 2, y, side ? 3 : 4, 1, skin[clamp(sn - 3, 0, sn)]);
  };
  const cuff = armLen - 4, bn = sl.length - 1;
  const hangs = path => path[1][1] - path[0][1] > 2 * Math.abs(path[1][0] - path[0][0]);
  const armCol = (lit, far, lost, path) => { const glyph = shaped && shaped.arm(face, br, lit, far, path && !hangs(path)); return (t, k, v, X) => {
    const j = rnd(t), hand = j >= armLen - 3, bare = o.sleeves === 0 || j > 6, L = hand || bare ? skin : sl, last = j >= armLen - 1, e = k === aw - 1;
    if (lost && j > 2 + br) return null;
    if (lost && j === 2 + br) return WRAP[X & 1];
    let c = L === skin ? skin[clamp(lit ? sn - 1 - (e ? 1 : 0) - (last ? 1 : 0) : sn - 3 + (e ? 1 : 0) - (last ? 1 : 0), 0, sn)] : lit ? pick3(L, k / aw * .5, (j === 6 ? -1 : 0) + wv('sleeve', X, j)) : pick3(L, .7, (e ? 1 : 0) + (j === 6 ? -1 : 0) + wv('sleeve', X, j));
    if (o.sleeves === 'long' && j > 6 && j <= cuff) c = sl[clamp(bn - (j === cuff ? 4 : side ? 2 : lit ? 1 : 3), 0, bn)];
    return shaped ? shaped.tone(c, glyph(j, k, armLen), far) : far ? dark(c, .8) : c;
  }; };
  const TOT = armLen - 1;
  const reach = (ax, ay, tgt, bend, crook) => {
    const l1 = Math.ceil(TOT / 2), t = tgt || [0, TOT];
    if (!side && !crook && Math.abs(t[0]) < 2.5 && t[1] > 4) return [[ax, ay], [ax + t[0], ay + t[1]]];
    const [ex, ey, hx, hy] = ik2(ax, ay, ax + t[0], ay + t[1], l1, TOT - l1, bend);
    return [[ax, ay], [ex, ey], [hx, hy]];
  };
  const spanOf = path => path.length === 2 ? Math.hypot(path[1][0] - path[0][0], path[1][1] - path[0][1]) : 0;
  const limb = (S, path, lit, far, rim, span, lost) => { const col = armCol(lit, far, lost, path), k = span ? TOT / span : 1; rigLimb(S, path, aw, (d, e, v, X) => col(d * k, e, v, X), rim ? shade : null); };
  const handOf = path => path[path.length - 1].map(rnd);
  const upper = path => { if (path.length === 3) return path.slice(0, 2); const k = 1 - 3 / spanOf(path); return [path[0], [mix(path[0][0], path[1][0], k), mix(path[0][1], path[1][1], k)]]; };
  const arm = (ax, ay, tgt, lit, far, bend, rim, S, lost) => { const path = reach(ax, ay, tgt, bend); limb(S || s, path, lit, far, rim, spanOf(path), lost); return handOf(path); };
  const pad = (x0, lit) => { if (!o.armor) return; s.rect(x0, tTop - br, aw + 1, 4, o.armor[lit ? 4 : 2]); s.rect(x0, tTop - br, aw + 1, 1, o.armor[lit ? o.armor.length - 1 : 4]); s.rect(x0, tTop + 3 - br, aw + 1, 1, o.armor[1]); };
  const shieldDrawn = (x, y, shows) => {
    if (shows === 'edge') { s.oval(x, y, 2.2, 7.4, (px, py, nx, ny) => Math.hypot(nx, ny) > .7 ? P.iron[nx < 0 ? 5 : 2] : o.shield[3]); return; }
    if (shows === 'inside') { s.oval(x, y, 6, 7.4, (px, py, nx, ny) => Math.hypot(nx, ny) > .84 ? P.iron[nx + ny < 0 ? 4 : 1] : Math.abs(ny) < .13 ? P.leather[1] : P.wood[nx < -.2 ? 4 : nx < .4 ? 3 : 2]); return; }
    s.oval(x, y, 6, 7.4, (px, py, nx, ny) => { const q = Math.hypot(nx, ny); return q > .84 ? P.iron[nx + ny < 0 ? 5 : 2] : Math.abs(nx) < .16 || Math.abs(ny) < .13 ? P.cloth[4] : o.shield[nx < -.2 ? 4 : nx < .4 ? 3 : 2]; }); s.oval(x, y, 1.6, 1.6, () => P.iron[6]);
  };
  const knuckle = (hx, hy) => { s.set(hx, hy, skin[sn - 1]); s.set(hx, hy + 1, skin[Math.max(0, sn - 3)]); s.set(hx - 1, hy, skin[sn - 2]); };
  const capeLen = f.tl + f.legs - 4, cs = p.cape || 0, layers = [];
  const part = (name, cam, draw, more) => { const whole = s, t = new Spr(whole.w, whole.h, whole.ax, whole.ay); s = t; let out; try { out = draw(t); } finally { s = whole; } if (!HELD_THINGS.includes(name)) for (let q = (base + 1) * t.w; q < t.c.length; q++) t.c[q] = null; layers.push({ name, cam, spr: t, ...(more || {}) }); return out; };
  const WRIST = armLen - 3, ELBOW = Math.ceil(TOT / 2), SPANS = { upper: [0, ELBOW], fore: [ELBOW, WRIST], hand: [WRIST, Infinity] };
  const drawnLength = path => path.slice(1).reduce((n, q, i) => n + Math.hypot(q[0] - path[i][0], q[1] - path[i][1]), 0);
  const armParts = (name, path, shown, lit, far, cams, lost, more) => {
    const span = path.length === 2 ? spanOf(path) : path.rigid ? drawnLength(path) : 0, k = span > 1 ? TOT / span : 1, col = armCol(lit, far, lost, shown);
    const zones = { upper: [0, ELBOW - 1], fore: [ELBOW, WRIST - 1], hand: [WRIST, armLen - 1] };
    for (const seg of ['upper', 'fore', 'hand']) part(name + ' ' + seg, cams[seg], t => path.rigid ? limbDrawn(t, seg, shown.map(q => q.map(rnd)), aw, zones, col) : rigLimb(t, shown, aw, (d, e, v, X) => { const j = rnd(d * k); return j >= SPANS[seg][0] && j < SPANS[seg][1] ? col(d * k, e, v, X) : null; }, null), { limb: name, seg, rim: far || (shaped && side) ? null : path.rigid ? 'ink' : 'shade', lost: !!lost, anchor: path[0].map(rnd), path: shown, ...(seg === 'hand' ? more : null) });
  };
  const resting = p.carry && p.down > .5;
  let held = p.carry ? HELD[resting || (p.cu < REST.raised && !BEHIND_HEAD.includes(p.carry)) ? 'rest' : p.carry][face] : null;
  let holds = null, hand = null, ground = null;

  const chinRow = hTop + f.hh - 1, chin = hTop + f.hh, load = p.carry && p.load ? p.load : null, cu = p.cu === undefined ? 1 : p.cu, reached = clamp(p.reach || 0, 0, 1);
  const boxAt = at => { const left = at[0] - load[2], top = at[1] - load[3]; return { left, top, right: left + load[0] - 1, bottom: top + load[1] - 1 }; };
  const anchored = (left, bottom) => [left + load[2], bottom - load[1] + 1 + load[3]];
  const between = (a, b, k) => [mix(a[0], b[0], k), mix(a[1], b[1], k)];
  let put = null, origin = null;
  const space = { arms: null };
  const sy = tTop + 1 - br, view = VIEWS[face], L1 = Math.ceil(TOT / 2), L2 = TOT - L1, J = hw + 1, joints = { R: [J, 0, 0], L: [-J, 0, 0] }, shoulderZ = base - sy;
  const shownAt = q => { const a = view.at(q); return [origin[0] + a[0], origin[1] + a[1]]; };
  const before = P => Math.abs(P[0] - origin[0]) >= hw + 1 ? SPACE.ahead : P[1] > origin[1] - 1 ? SPACE.before : f.hd + SPACE.jut + 1;
  const spaceOf = (P, sign, F) => { const d = F || before(P); return side ? [sign * J, P[0] - origin[0], origin[1] - P[1]] : back ? [P[0] - origin[0], d, origin[1] - P[1] - SEEN.depth * d] : [origin[0] - P[0], d, origin[1] - P[1] + SEEN.depth * d]; };
  const solved = (key, target) => armSolved(joints[key], target, L1, L2, key === 'R' ? 1 : -1, p.elbow);
  const camOf = q => SPACE.cam[face][0] + (view.depth(q) - SPACE.cam[face][1]) / SPACE.cam[face][2], mid3 = (a, b) => mul3(add3(a, b), .5);
  const limbOf = (arm, art) => { const path = [art, shownAt(arm.E), shownAt(arm.H)]; path.rigid = true; return { path, hand: shownAt(arm.H).map(rnd), cams: { upper: camOf(mid3(arm.S, arm.E)), fore: camOf(mid3(arm.E, arm.H)), hand: camOf(arm.H) } }; };
  const bowing = kind === 'bow' && !p.carry, wielded = !p.carry && !!TOOLS[kind] && !bowing, nocked = bowing && p.bow >= 1 && p.arrow > .5, fetched = bowing && !nocked && p.out > 0 ? Math.min(BOW.sag + BOW.nock, p.out) : 0;
  const aimOf = () => unit3(p.aim || (p.tool === undefined ? TOOL_AIM[kind] || [0, .3, .95] : side ? [0, Math.sin(p.tool * D2R), Math.cos(p.tool * D2R)] : [(back ? 1 : -1) * Math.sin(p.tool * D2R), 0, Math.cos(p.tool * D2R)]));
  const armed = (tR, tL) => {
    let R = solved('R', tR), L = solved('L', tL), aim = null, second = null, from = null;
    const far = TOOL_REACH[kind] || 1, butt = TOOL_BUTT[kind] || 1, head = TOOL_HEAD[kind] || 1;
    if (wielded) {
      const raw = aimOf(), paired = p.both && TWO_HANDED[kind] ? TWO_HANDED[kind] : null, grips = [p.grip === undefined ? (paired ? paired[0] : 0) : p.grip, ...(paired ? [paired[1]] : [])], aimed = () => aimSeen(aimGrounded(raw, shoulderZ + R.H[2], far - grips[0], butt + grips[0], head), [R.H[0], R.H[1], shoulderZ + R.H[2]], far - grips[0] + head / 2, face);
      aim = aimed();
      if (grips.length > 1 && !o.oneArm) for (let n = 0; n < 6; n++) {
        const want = add3(R.H, mul3(aim, grips[1]));
        L = solved('L', want); second = { want, got: L.H };
        const miss = sub3(L.H, want);
        if (len3(miss) < .2) break;
        tR = add3(tR, mul3(miss, .7)); R = solved('R', tR); aim = aimed();
      }
      from = sub3(R.H, mul3(aim, grips[0]));
    } else if (bowing) {
      aim = unit3(p.aim || (p.bow >= 1 ? [0, 1, 0] : [-.2, 0, .98]));
      if (p.bow >= 1) for (let n = 0; n < 6; n++) {
        const want = sub3(L.H, mul3(aim, BOW.sag + (p.pull || 0)));
        R = solved('R', want); second = { want, got: R.H };
        const miss = sub3(R.H, want);
        if (len3(miss) < .2) break;
        tL = add3(tL, mul3(miss, .7)); L = solved('L', tL);
      }
      from = L.H;
    }
    return { R, L, aim, second, from, shaft: bowing ? unit3(p.shaft || aim) : null };
  };
  const slung = !!p.carry || !!p.both || !!p.slung || bowing, gripAt = p.grip === undefined ? (p.both && TWO_HANDED[kind] ? TWO_HANDED[kind][0] : 0) : p.grip;

  if (side) {
    const far = [sx0, sy], near = [sx0 - 1, sy], D = SIDE_DEPTH, head = [HX + 1 - f.hd, HX + 2 + f.hd], fused = p.carry === 'shoulder';
    origin = [sx0 - .5, sy];
    ground = [cx + REST.toes, base];
    if (load && resting && base - load[1] + 1 <= chinRow) {
      ground = [Math.min(Math.max(ground[0], head[1] + 2 + REST.edge), near[0] + TOT - 2), base];
      if (boxAt(ground).left <= head[1]) held = { ...held, at: D.far - 1 };
    }
    let htl = p.hl, hr = p.hr || (TOOLS[kind] ? [2, armLen - 2] : null);
    let grasp = null;
    const clearOf = y => load && p.carry === 'hip' && !resting && cu >= 1 ? Math.min(y, base - CLEAR.ground - (load[1] - 1 - load[3]) - 1) : y;
    if (hr && p.carry === 'hip') hr = [hr[0], clearOf(near[1] + hr[1]) - near[1]];
    if (load && resting) { const b = boxAt(ground); grasp = [b.left + load[4], Math.min(b.top + load[5], sy + TOT - 1)]; }
    else if (load && (IN_BOTH_ARMS.includes(p.carry) || p.carry === 'game')) {
      const inArms = IN_BOTH_ARMS.includes(p.carry), left = sx0 + REACH.hip;
      let bottom = sy + HELD_LOW[p.carry];
      if (inArms && bottom - load[1] + 1 < chin && left <= head[1]) bottom = chin + load[1] - 1;
      put = between(anchored(ground[0] - REST.edge, base), inArms ? anchored(left, bottom) : load[7] ? [sx0, tTop + 1 - br] : [sx0 - 1, tTop + SUNK.slung - br], cu);
      const b = boxAt(put), low = clamp(sy + TOT - 1, b.top, b.bottom);
      grasp = inArms ? [b.left + (low === b.bottom ? 1 : 0), low] : [b.left + load[4], b.top + load[5]];
    }
    if (grasp) { const k = resting ? reached : 1; hr = between(hr || [0, TOT], [grasp[0] - near[0], grasp[1] - near[1]], k); htl = between(htl || [0, TOT], [grasp[0] + 1 - far[0], grasp[1] - far[1]], k); }
    const bent = hr && hr[0] < 0 && hr[1] < 0 ? -1 : 1;
    const held3 = fused ? null : armed(p.R && !p.carry ? add3(joints.R, p.R) : spaceOf(hr ? [near[0] + hr[0], near[1] + hr[1]] : [near[0], near[1] + TOT], 1), p.L && !p.carry ? add3(joints.L, p.L) : spaceOf(htl ? [far[0] + htl[0], far[1] + htl[1]] : [far[0], far[1] + TOT], -1));
    const farLimb = fused ? null : limbOf(held3.L, far), nearLimb = fused ? null : limbOf(held3.R, near);
    const farPath = fused ? reach(far[0], far[1], htl, 1) : farLimb.path, fh = fused ? handOf(farPath) : farLimb.hand, farCams = p.carry ? { upper: D.far, fore: D.far, hand: D.far } : farLimb.cams;
    armParts('far arm', farPath, farPath, false, true, farCams, o.oneArm, bowing ? { grips: 'tool', palm: 'around', piece: 'stave' } : held3 && held3.second && wielded ? { grips: 'tool', palm: 'around', piece: 'second' } : null);
    if (bowing) { const at = shownAt(held3.L.H).map(rnd), bow = { u: view.seen(staveOf(held3.aim, p.cant)), v: view.seen(held3.aim), pull: p.pull || 0, arrow: nocked }; part('tool', farCams.hand - SPACE.held, t => { pts.tip = bowSeen(t, at[0], at[1], { ...bow, only: 'stave' }); }, { anchor: fh, piece: 'stave' }); part('tool', (p.bow >= 1 ? Math.min(farCams.hand, nearLimb.cams.hand) : farCams.hand) - SPACE.held, t => bowSeen(t, at[0], at[1], { ...bow, only: 'string' }), { anchor: fh, piece: 'string' }); if (nocked) part('tool', Math.min(farCams.hand, nearLimb.cams.hand) - SPACE.held, t => bowSeen(t, at[0], at[1], { ...bow, only: 'arrow' }), { anchor: fh, piece: 'arrow' }); if (fetched) { const by = shownAt(held3.R.H).map(rnd); part('tool', nearLimb.cams.hand - SPACE.held, t => arrowSeen(t, by[0], by[1], view.seen(held3.shaft), fetched), { anchor: by, piece: 'arrow' }); } }
    if (o.shield) { const on = slung ? [sx0 - (SW >> 1) - 1, tTop + 7] : [fh[0] + 1, fh[1]]; part('shield', slung ? D.shield : farCams.hand - SPACE.held, () => shieldDrawn(on[0], on[1], 'edge'), { anchor: on, shows: 'edge', slung }); }
    if (o.cape) part('cape', D.cape, () => { for (let j = 0; j < capeLen; j++) { const k = j / capeLen, x = sx0 - (SW >> 1) - 2 - rnd(cs * k * k) - (j > 6 ? 1 : 0); s.rect(x, tTop + 1 + j, 3 + (j > 6 ? 1 : 0), 1, o.cape[j % 5 === 4 ? 1 : 2]); s.set(x, tTop + 1 + j, o.cape[3]); } }, { anchor: [sx0, tTop] });
    if (f.tail) part('tail', D.tail, () => { for (let k = 0; k < 9; k++) s.rect(cx - (SW >> 1) - 2 - k, legTop + 1 + rnd(Math.sin(k * .5 + (p.tail || 0)) * 2) + (k >> 2), 1, k < 5 ? 3 : 2, skin[k < 5 ? sn - 2 : sn - 3]); }, { anchor: [cx, legTop] });
    part('far leg', D.farLeg, () => legS(fl, true), { anchor: [cx + 1, legTop] }); part('near leg', D.nearLeg, () => legS(fr, false), { anchor: [cx - 2, legTop] });
    part('torso', D.torso, torso, { anchor: [sx0, tTop] });
    part('head', D.head, t => shaped ? (shaped.head(t, 's', HX, hTop, p), rigHat(t, o, HX, hTop, 's', skin, tunic, f.hd, f.hh, shaped.drape)) : rigHead(t, f, o, HX + 1, hTop, 's', p), { anchor: [HX + 1, hTop + f.hh] });
    part('pad', D.pad, () => pad(sx0 - 3, true), { anchor: near });
    const nearPath = fused ? reach(near[0], near[1], hr, bent) : nearLimb.path, nh = fused ? handOf(nearPath) : nearLimb.hand, nearCams = p.carry ? { upper: D.near, fore: D.near, hand: D.near } : nearLimb.cams;
    if (wielded) {
      const seen = toolSeen(view, held3.aim), at = shownAt(held3.from).map(rnd), whole = t => { pts.tip = toolAt(t, kind, at[0], at[1], seen.ang, { fore: seen.fore }); };
      if (held3.second) {
        const a = shownAt(held3.R.H), b = shownAt(held3.L.H), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], along = [b[0] - a[0], b[1] - a[1]];
        const kept = (t, side) => { whole(t); for (let q = 0; q < t.c.length; q++) if (t.c[q] && ((q % t.w - mid[0]) * along[0] + (((q / t.w) | 0) - mid[1]) * along[1]) * side > 0) { t.c[q] = null; t.e[q] = 0; } };
        part('tool', nearCams.hand - SPACE.held, t => kept(t, 1), { anchor: nh, inks: 'shield', piece: 'main' });
        part('tool', farCams.hand - SPACE.held, t => kept(t, -1), { anchor: fh, inks: 'shield', piece: 'second' });
      } else part('tool', nearCams.hand - SPACE.held, whole, { anchor: nh, inks: 'shield' });
      if (kind === 'torch' || kind === 'staff') pts.glow = pts.tip;
    }
    const gripped = p.carry ? { grips: 'load', palm: held.palm } : wielded ? { grips: 'tool', palm: 'around', ...(held3.second ? { piece: 'main' } : null) } : bowing && p.bow >= 1 ? { grips: 'tool', palm: 'around', piece: 'string' } : fetched ? { grips: 'tool', palm: 'around', piece: 'arrow' } : null;
    armParts('near arm', nearPath, nearPath, true, false, nearCams, false, gripped);
    if (held3) space.arms = { R: held3.R, L: held3.L, aim: held3.aim, second: held3.second, from: held3.from };
    hand = [nh[0], nh[1] + 1];
    holds = { hip: hand, chest: nh, low: nh, shoulder: [sx0 + 1, tTop + 1 - br], game: [sx0 - 1, tTop + 2 - br], drape: [sx0 - 1, tTop + 1 - br] };
    if (put) { put = [rnd(put[0] + nh[0] - rnd(grasp[0])), Math.min(rnd(put[1] + nh[1] - rnd(grasp[1])), base - (load[1] - 1 - load[3]))]; hand = put; holds[p.carry] = put; }
    pts.hand = nh; pts.hands = [nh]; pts.mouth = [HX + f.hd + 2, hTop + Math.floor(f.hh * .5) + 3]; pts.head = [HX + (shaped ? 0 : 1), hTop - 3];
    pts.feet = [[cx + fl[0], base - fl[1]], [cx - 1 + fr[0], base - fr[1]]];
  } else {
    const xL = cx - hw - 1 - ((aw - 1) >> 1) + rnd(lean), xR = cx + hw + (aw >> 1) + rnd(lean), roots = [[xL, sy], [xR, sy]], head = [HX - f.hd, HX + f.hd];
    const T = back ? -1 : 1, D = back ? AWAY_DEPTH : TOWARD_DEPTH, mid = cx + rnd(lean), ahead = T, nearer = d => rnd(ahead * SEEN.depth * d);
    const keys = back ? ['hr', 'hl'] : ['hl', 'hr'], targets = [p[keys[0]], p[keys[1]]];
    const toolSide = back ? 1 : 0, other = 1 - toolSide, laden = toolSide, armKey = i => i === toolSide ? 'R' : 'L';
    origin = [mid, sy];
    ground = [mid, base - (load && resting && !load[3] ? REST.along : 0)];
    if (load && resting && !back && ground[1] - load[3] <= chinRow) ground = [mid, chinRow + 1 + load[3]];
    let palms = null, grasps = null;
    const heaved = load && p.carry !== 'hip' && (resting || cu < (IN_BOTH_ARMS.includes(p.carry) ? 1 : SUNK.oneHand));
    if (load && p.carry === 'hip' && !resting && cu >= 1 && !load[6] && targets[toolSide]) targets[toolSide] = [targets[toolSide][0], Math.min(targets[toolSide][1], base - CLEAR.ground - (load[1] - 1 - load[3]) - 1 - sy)];
    if (load && p.carry === 'hip' && resting) { const b = boxAt(ground); targets[toolSide] = between(targets[toolSide] || [0, TOT], [(b.left + b.right) / 2 - roots[toolSide][0], Math.max(b.top, Math.min(b.bottom - 2, sy + TOT - 1)) - sy], reached); }
    if (load && p.carry !== 'hip') {
      const inArms = IN_BOTH_ARMS.includes(p.carry), w = load[0], h = load[1], sunk = p.carry === 'drape' ? h - 1 - load[3] : p.carry === 'shoulder' ? SUNK.log : SUNK.game, tucked = p.carry === 'shoulder' ? 0 : rnd(w * SUNK.behind);
      let left = mid - (w >> 1), bottom = Math.min(sy + (HELD_LOW[p.carry] || 0) + nearer(REACH.front), sy + TOT - 2);
      if (inArms && bottom - h + 1 < chin) bottom = chin + h - 1;
      if (!inArms) { bottom = tTop - br + sunk; left = back ? head[1] + 1 - tucked : head[0] - w + tucked; }
      const from = anchored(mid - (w >> 1), ground[1]), to = load[7] && !inArms ? [roots[laden][0], tTop + 1 - br] : anchored(left, bottom);
      put = resting ? ground : [mix(from[0], to[0], Math.min(1, cu * SUNK.aside)), mix(from[1], to[1], cu)];
      const b = boxAt(put), y = clamp(sy + TOT, b.top, b.bottom + 1), under = y === b.bottom + 1, middle = (b.left + b.right) / 2, out = under || heaved ? Math.min(w / 2 - 1, hw + 1) : w / 2;
      if (inArms) { grasps = [[middle - out, y], [middle + out, y]]; palms = under ? 'under' : 'around'; }
      else if (heaved) { const row = resting ? y : rnd((b.top + b.bottom) / 2), wide = Math.min(w / 2, hw + 1); grasps = [[middle - wide, row], [middle + wide, row]]; palms = 'around'; }
      else if (load[7]) { grasps = []; grasps[laden] = [b.left + load[4], b.top + load[5]]; palms = 'around'; }
      else { grasps = []; grasps[laden] = [clamp(roots[laden][0] + (back ? 2 : -2), b.left + 1, b.right - 1), b.bottom + 1]; palms = 'under'; }
      const k = resting ? reached : 1;
      for (const i of [0, 1]) if (grasps[i]) targets[i] = between(targets[i] || [0, TOT], [grasps[i][0] - roots[i][0], grasps[i][1] - roots[i][1]], k);
    }
    if (f.tail) part('tail', D.tail, () => { for (let k = 0; k < 9; k++) s.rect(cx + hw + aw + k, legTop + 1 + rnd(Math.sin(k * .5 + (p.tail || 0)) * 2) + (k >> 2), 1, k < 5 ? 3 : 2, skin[k < 5 ? sn - 2 : sn - 3]); }, { anchor: [cx, legTop] });
    part('legs', D.legs, () => { legF(-1, fl, !back && o.oneLeg); legF(1, fr, back && o.oneLeg); }, { anchor: [cx, legTop] });
    part('torso', D.torso, torso, { anchor: [sx0, tTop] });
    part('pad', D.pad, () => { pad(cx - hw - aw + rnd(lean), true); pad(cx + hw - 1 + rnd(lean), false); }, { anchor: [sx0, tTop] });
    if (o.cape) part('cape', D.cape, () => { for (let j = 0; j < capeLen; j++) {
      const k = j / capeLen, w = rnd(cs * k * k), xa = cx - hw - aw - (j > 6 ? 1 : 0) + w, xb = cx + hw + aw - 1 + (j > 6 ? 1 : 0) + w;
      for (let x = xa + 1; x < xb; x++) { const u = (x - xa) / (xb - xa); s.set(x, tTop + 1 + j, o.cape[clamp((back ? (u < .25 ? 3 : u < .7 ? 2 : 1) : 1) - ((x + (j >> 2)) % 5 === 0 ? 1 : 0), 0, 4)]); }
      s.set(xa, tTop + 1 + j, o.cape[3]); s.set(xb, tTop + 1 + j, o.cape[1]);
    } }, { anchor: [sx0, tTop] });
    part('head', D.head, t => shaped ? (shaped.head(t, face, HX, hTop, p), rigHat(t, o, HX, hTop, face, skin, tunic, f.hd, f.hh, shaped.drape)) : rigHead(t, f, o, HX, hTop, face, p), { anchor: [HX, hTop + f.hh] });
    const reachOut = p.carry ? SPACE.carried : 0, wanted = i => !p.carry && p[armKey(i)] ? add3(joints[armKey(i)], p[armKey(i)]) : spaceOf(targets[i] ? [roots[i][0] + targets[i][0], roots[i][1] + targets[i][1]] : [roots[i][0], roots[i][1] + TOT], 0, reachOut);
    const held3 = armed(wanted(toolSide), wanted(other)), limbs = [0, 1].map(i => limbOf(held3[armKey(i)], roots[i])), paths = limbs.map(l => l.path), hL = limbs[0].hand, hR = limbs[1].hand, handsAt = [hL, hR], th = handsAt[toolSide];
    space.arms = { R: held3.R, L: held3.L, aim: held3.aim, second: held3.second, from: held3.from };
    if (shaped && bowing && face === 'f') for (const l of limbs) for (const seg of ['upper', 'fore']) l.cams[seg] = Math.max(l.cams[seg], D.torso + SPACE.held);
    if (shaped && bowing && back && p.bow >= 1) limbs[toolSide].cams.upper = Math.max(limbs[toolSide].cams.upper, D.head + SPACE.held);
    if (put && !resting && (IN_BOTH_ARMS.includes(p.carry) || cu < 1)) { const on = [0, 1].filter(i => grasps[i]), miss = on.reduce((m, i) => [m[0] + handsAt[i][0] - rnd(grasps[i][0]), m[1] + handsAt[i][1] - rnd(grasps[i][1])], [0, 0]); put = [rnd(put[0] + miss[0] / on.length), rnd(put[1] + miss[1] / on.length)]; }
    if (put && !resting && IN_BOTH_ARMS.includes(p.carry) && !back && boxAt(put).top < chin) put = [put[0], put[1] + chin - boxAt(put).top];
    if (put && !resting && p.carry === 'shoulder') { const b = boxAt(put); if (b.top <= chinRow && b.left <= head[1] && b.right >= head[0]) put = [back ? head[1] + 1 + load[2] : head[0] - load[0] + load[2], put[1]]; }
    const seen = i => paths[i];
    const carrying = p.carry ? (p.carry === 'hip' ? [toolSide] : ON_ONE_SHOULDER.includes(p.carry) && !heaved ? [laden] : [0, 1]) : [];
    const gripping = bowing ? (p.bow >= 1 || fetched ? [0, 1] : [other]) : !wielded ? [] : held3.second ? [0, 1] : [toolSide];
    const palmOf = i => p.carry ? palms || held.palm : 'around';
    const lifted = i => carrying.includes(i) && !(back && held.at > D.torso) && !(resting && reached < 1);
    const shieldArm = o.shield && !slung ? other : -1;
    const handCam = i => lifted(i) ? held.at + (palmOf(i) === 'under' ? -D.step : D.step) : D.hand;
    const over = i => lifted(i) && palmOf(i) === 'around';
    for (const i of [0, 1]) armParts(i ? 'right arm' : 'left arm', paths[i], seen(i), !i, false, p.carry ? { upper: over(i) ? Math.max(D.upper, held.at + D.step / 4) : D.upper, fore: over(i) ? Math.max(D.fore, held.at + D.step / 2) : D.fore, hand: handCam(i) } : limbs[i].cams, i === other && o.oneArm, lifted(i) ? { grips: 'load', palm: palmOf(i) } : gripping.includes(i) ? { grips: 'tool', palm: palmOf(i), ...(bowing ? { piece: i === other ? 'stave' : fetched ? 'arrow' : 'string' } : null) } : null);
    if (!targets[0] && !p.carry) layers.find(l => l.name === 'left arm upper').spr.set(xL - (aw >> 1), sy, null);
    if (o.shield) { const on = slung ? [mid, tTop + 7] : [handsAt[other][0], handsAt[other][1]], shows = slung === back ? 'front' : 'inside'; part('shield', slung ? D.slung : limbs[other].cams.hand + (back ? -SPACE.shield : SPACE.shield), () => shieldDrawn(on[0], on[1], shows), { anchor: on, shows, slung }); }
    const low = Math.max(hL[1], hR[1]);
    hand = p.carry === 'hip' ? th : put || [mid, low + 2 + nearer(REACH.front)];
    holds = { hip: hand, chest: hand, low: hand, shoulder: hand, game: hand, drape: hand };
    if (p.carry) pts.hold = hand;
    else if (wielded) {
      const seen = toolSeen(view, held3.aim), at = shownAt(held3.from).map(rnd), along = [Math.sin(seen.ang * D2R), -Math.cos(seen.ang * D2R)], gripped = Math.min(limbs[toolSide].cams.hand, held3.second ? limbs[other].cams.hand : 9) - SPACE.held;
      const whole = new Spr(s.w, s.h, s.ax, s.ay), chunks = new Map();
      pts.tip = toolAt(whole, kind, at[0], at[1], seen.ang, { fore: seen.fore });
      whole.c.forEach((c, q) => { if (!c) return; const k = Math.floor(((q % whole.w - at[0]) * along[0] + (((q / whole.w) | 0) - at[1]) * along[1]) / seen.fore / TOOL_CHUNK); if (!chunks.has(k)) chunks.set(k, []); chunks.get(k).push(q); });
      for (const [k, px] of chunks) part('tool', k === 0 || k === -1 ? gripped : Math.min(gripped, camOf(add3(held3.from, mul3(held3.aim, (k + .5) * TOOL_CHUNK))) - SPACE.held), t => { for (const q of px) { t.c[q] = whole.c[q]; t.e[q] = whole.e[q]; } }, { anchor: th, inks: 'shield' });
      if (kind === 'torch' || kind === 'staff') pts.glow = pts.tip;
    } else if (bowing) {
      const at = handsAt[other], bow = { u: view.seen(staveOf(held3.aim, p.cant)), v: view.seen(held3.aim), pull: p.pull || 0, arrow: nocked };
      part('tool', limbs[other].cams.hand - SPACE.held, t => { pts.tip = bowSeen(t, at[0], at[1], { ...bow, only: 'stave' }); }, { anchor: at, piece: 'stave' });
      part('tool', (p.bow >= 1 ? Math.min(limbs[other].cams.hand, limbs[toolSide].cams.hand) : limbs[other].cams.hand) - SPACE.held, t => bowSeen(t, at[0], at[1], { ...bow, only: 'string' }), { anchor: at, piece: 'string' });
      if (nocked) part('tool', Math.min(limbs[other].cams.hand, limbs[toolSide].cams.hand) - SPACE.held, t => bowSeen(t, at[0], at[1], { ...bow, only: 'arrow' }), { anchor: at, piece: 'arrow' });
      if (fetched) { const by = handsAt[toolSide]; part('tool', limbs[toolSide].cams.hand - SPACE.held, t => arrowSeen(t, by[0], by[1], view.seen(held3.shaft), fetched), { anchor: by, piece: 'arrow' }); }
    }
    pts.hand = th; pts.hands = [hL, hR].filter((h, i) => !(o.oneArm && i === other)); pts.mouth = [HX, hTop + Math.floor(f.hh * .5) + 4]; pts.head = [HX, hTop - 3];
    pts.feet = [[cx - hw + 2, base - fl[1]], [cx + 3, base - fr[1]]];
  }
  pts.torso = [sx0, tTop - br, lean]; pts.hip = [cx, legTop]; pts.chin = hTop + f.hh - 1;
  if (p.carry) { const to = holds[p.carry], lowest = load && !load[6] ? base - (load[1] - 1 - load[3]) : Infinity; pts.carry = resting ? ground : [rnd(mix(hand[0], to[0], cu)), Math.min(rnd(mix(hand[1], to[1], cu)), lowest)]; }
  if (o.part) for (const l of layers) o.part(l.name, l.spr, l);
  const { order, owner } = rigComposite(s, layers), headCam = order.find(l => l.name === 'head').cam;
  s.parts = order.map(({ spr, ...l }) => l); s.owner = owner;
  if (RIG_KEEP.layers) s.layers = order;
  s.space = { ...space, face, shoulderZ, upper: L1, fore: L2, tool: wielded ? kind : bowing ? 'bow' : null, reach: (TOOL_REACH[kind] || 0) - gripAt, butt: (TOOL_BUTT[kind] || 0) + gripAt, head: { at: [0, SPACE.jut, f.hh / 2 + 1], r: f.hd }, torso: { half: hw, deep: 3, tall: f.tl }, hipRow: legTop, groundRow: base };
  s.front = owner.map(n => n && order[n - 1].cam > headCam ? 1 : 0);
  const bare = p.carry ? { c: s.c.slice(), e: s.e.slice() } : null;
  s.outline();
  if (p.carry) Object.assign(s, { bare, mask: owner.map(n => n && order[n - 1].cam > held.at ? 1 : 0), loadCam: held.at, floor: face === 'b' && p.cu < REST.raised ? base : null, tilt: resting ? 0 : p.tilt || 0, clipRow: tTop + 1 - br });
  s.sh = { rx: 9, ry: 3.4, dx: 4, dy: 0 };
  return s;
}
