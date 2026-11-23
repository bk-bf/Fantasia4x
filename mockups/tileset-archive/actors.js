'use strict';
const FOLK = {
  human: { legs: 10, tl: 12, hw: 6, aw: 3, hh: 10, hd: 5, skin: P.skinPale },
  dwarf: { legs: 6, tl: 12, hw: 7, aw: 4, hh: 10, hd: 5, skin: P.skinTan, beard: 1 },
  elf: { legs: 12, tl: 12, hw: 5, aw: 2, hh: 10, hd: 5, skin: P.skinPale, ears: 1, longhair: 1 },
  orc: { legs: 10, tl: 13, hw: 7, aw: 4, hh: 11, hd: 6, skin: P.skinOrc, tusks: 1, bald: 1 },
  goblin: { legs: 6, tl: 9, hw: 4, aw: 2, hh: 9, hd: 5, skin: P.skinGob, bigears: 1, bald: 1, eyes: P.gold[4] },
  kobold: { legs: 6, tl: 9, hw: 4, aw: 2, hh: 9, hd: 4, skin: P.furRust, snout: 1, bald: 1, eyes: P.gold[4], tail: 1 },
  gnoll: { legs: 12, tl: 12, hw: 6, aw: 3, hh: 10, hd: 5, skin: P.furTan, snout: 1, bald: 1, pointears: 1, eyes: P.gold[4] },
};
const pick3 = (ramp, u, d) => { const n = ramp.length - 1; return ramp[clamp((u < .22 ? n - 1 : u < .66 ? n - 2 : n - 3) + (d || 0), 0, n)]; };
function mkPawn(o) {
  const f = FOLK[o.race || 'human'], s = new Spr(40, 56, 20, 51), cx = 20, base = 51;
  const skin = o.skin || f.skin, sn = skin.length - 1, tunic = o.tunic || P.cloth, pants = o.pants || P.leather, hair = o.hair || P.furBrown, hn = hair.length - 1;
  const hw = f.hw, legTop = base - f.legs + 1, tTop = legTop - f.tl, hTop = tTop - f.hh, hd = f.hd, lw = hw - 1;
  for (let j = 0; j < f.legs; j++) {
    const y = legTop + j, boot = j >= f.legs - 3, sole = j === f.legs - 1;
    for (let i = 0; i < lw; i++) {
      const u = i / (lw - 1), R = boot ? P.leather : pants, d = boot ? (j === f.legs - 3 ? 1 : sole ? -2 : 0) : (j === Math.floor(f.legs * .4) ? 1 : 0);
      s.set(cx - hw + i, y, pick3(R, u * .7, d)); s.set(cx + 1 + i, y, pick3(R, .3 + u * .7, d - 1));
    }
    if (sole || j === f.legs - 2) { s.set(cx - hw - 1, y, P.leather[sole ? 0 : 3]); s.set(cx + hw, y, P.leather[sole ? 0 : 1]); }
    s.set(cx - 1, y, j < 2 ? pick3(pants, .6, -1) : P.ink);
  }
  const body = o.armor || tunic;
  for (let j = 0; j < f.tl + 2; j++) {
    const taper = j > 5 && j < f.tl ? 1 : 0, w = hw - taper;
    for (let i = -w; i < w; i++) {
      const y = tTop + j, u = (i + w) / (2 * w - 1);
      let c;
      if (j >= f.tl - 2 && j < f.tl) c = (Math.abs(i + .5) < 1.2) ? P.gold[j === f.tl - 2 ? 4 : 2] : pick3(P.leather, u, j === f.tl - 2 ? 1 : -1);
      else if (o.armor === P.iron && !o.plate) c = P.iron[clamp((u < .25 ? 4 : u < .7 ? 3 : 2) + (((i + j) & 1) ? 1 : -1), 0, 6)];
      else {
        let d = (j === 0 ? 1 : 0) - (j > f.tl - 1 ? 1 : 0);
        if (j > 3 && j < f.tl - 2 && (Math.abs(u - .32) < .06 || Math.abs(u - .72) < .06)) d -= 1;
        if (j === 1 && u > .7) d -= 1;
        c = pick3(body, u, d);
        if (o.apron && j > 2 && Math.abs(i + .5) < w - 1.5) c = pick3(P.leather, u, j === 3 ? 1 : 0);
        if (o.trim && (j === f.tl || (j < 3 && Math.abs(i + .5) < 1 + (2 - j)))) c = o.trim[3];
      }
      s.set(cx + i, y, c);
    }
  }
  if (!o.armor) { s.set(cx - 1, tTop, skin[sn - 2]); s.set(cx, tTop, skin[sn - 3]); s.set(cx - 1, tTop + 1, skin[sn - 2]); }
  const aw = f.aw, armLen = f.tl - 1;
  for (let j = 0; j < armLen; j++) for (let i = 0; i < aw; i++) {
    const y = tTop + 1 + j, hand = j >= armLen - 3, bare = o.sleeves === 0 || j > 6;
    if (j === 0 && i === 0) continue;
    const L = hand || bare ? skin : body;
    const lc = L === skin ? skin[clamp(sn - 1 - (i === aw - 1 ? 1 : 0) - (j === armLen - 1 ? 1 : 0), 0, sn)] : pick3(L, i / aw * .5, j === 6 ? -1 : 0);
    const rc = L === skin ? skin[clamp(sn - 3 + (i === 0 ? 1 : 0) - (j === armLen - 1 ? 1 : 0), 0, sn)] : pick3(L, .7, (i === 0 ? 1 : 0) + (j === 6 ? -1 : 0));
    s.set(cx - hw - aw + i, y, lc); s.set(cx + hw + aw - 1 - i, y, rc);
  }
  if (o.armor) for (const sd of [-1, 1]) { const x0 = sd < 0 ? cx - hw - aw : cx + hw - 1; s.rect(x0, tTop, aw + 1, 4, o.armor[sd < 0 ? 4 : 2]); s.rect(x0, tTop, aw + 1, 1, o.armor[sd < 0 ? o.armor.length - 1 : 4]); s.rect(x0, tTop + 3, aw + 1, 1, o.armor[1]); }
  for (let i = -2; i < 2; i++) s.set(cx + i, tTop - 1, skin[clamp(sn - 3 + (i < 0 ? 1 : 0), 0, sn)]);
  for (let j = 0; j < f.hh; j++) {
    const inset = j === 0 || j === f.hh - 1 ? 2 : j === 1 || j === f.hh - 2 ? 1 : 0;
    for (let i = -hd + inset; i < hd - inset; i++) {
      const u = (i + hd) / (2 * hd - 1);
      s.set(cx + i, hTop + j, skin[clamp((u < .25 ? sn : u < .72 ? sn - 1 : sn - 2) - (j >= f.hh - 2 ? 1 : 0), 0, sn)]);
    }
  }
  const er = hTop + Math.floor(f.hh * .5), noHair = o.bald || f.bald;
  s.set(cx - hd - 1, er, skin[sn - 1]); s.set(cx - hd - 1, er + 1, skin[sn - 2]); s.set(cx + hd, er, skin[sn - 2]); s.set(cx + hd, er + 1, skin[sn - 3]);
  const eye = f.eyes || P.ink;
  s.set(cx - 3, er, P.cloth[5]); s.set(cx - 2, er, eye, f.eyes ? 220 : 0); s.set(cx + 1, er, eye, f.eyes ? 220 : 0); s.set(cx + 2, er, P.cloth[4]);
  s.rect(cx - 3, er - 1, 2, 1, noHair ? skin[1] : hair[Math.max(0, hn - 3)]); s.rect(cx + 1, er - 1, 2, 1, noHair ? skin[1] : hair[Math.max(0, hn - 3)]);
  s.set(cx - 1, er + 1, skin[sn]); s.set(cx, er + 1, skin[sn - 2]); s.set(cx - 1, er + 2, skin[sn - 2]);
  s.rect(cx - 2, er + 3, 3, 1, skin[Math.max(0, sn - 3)]);
  if (f.snout) { for (let j = 0; j < 4; j++) for (let i = -2 - (j > 0 ? 1 : 0); i < 2 + (j > 0 ? 1 : 0); i++) s.set(cx + i, er + 1 + j, skin[clamp(sn - (i > 0 ? 1 : 0) - (j === 3 ? 1 : 0), 0, sn)]); s.rect(cx - 1, er + 1, 2, 2, P.ink); s.rect(cx - 2, er + 4, 4, 1, skin[0]); s.set(cx - 2, er + 5, P.bone[5]); s.set(cx + 1, er + 5, P.bone[5]); }
  if (f.pointears) for (let k = 0; k < 5; k++) { const w = Math.max(1, 3 - (k >> 1)); s.rect(cx - hd + (k >> 1), hTop - 1 - k, w, 1, skin[sn - 1]); s.rect(cx + hd - 3, hTop - 1 - k, w, 1, skin[sn - 2]); }
  if (f.tail) for (let k = 0; k < 9; k++) s.rect(cx + hw + aw + k, legTop + 1 + Math.round(Math.sin(k * .5) * 2) + (k >> 2), 1, k < 5 ? 3 : 2, skin[k < 5 ? sn - 2 : sn - 3]);
  if (!noHair) {
    for (let j = -1; j < 3; j++) { const inset = j === -1 ? 2 : j === 0 ? 1 : 0; for (let i = -hd + inset - (j > 0 ? 1 : 0); i < hd - inset + (j > 0 ? 1 : 0); i++) { const u = (i + hd) / (2 * hd); s.set(cx + i, hTop + j, hair[clamp((u < .3 ? hn : u < .7 ? hn - 1 : hn - 2) - (j === 2 && (i & 1) ? 1 : 0), 0, hn)]); } }
    for (let i = -hd; i < hd; i++) if (hash(i, 3, o.seed || 1) > .45) s.set(cx + i, hTop + 3, hair[hn - 1 - (i > 1 ? 1 : 0)]);
    for (let j = 3; j < 6; j++) { s.set(cx - hd - 1, hTop + j, hair[hn - 1]); s.set(cx + hd, hTop + j, hair[hn - 3]); if (j < 5) { s.set(cx - hd, hTop + j, hair[hn - 1]); s.set(cx + hd - 1, hTop + j, hair[hn - 2]); } }
    if (f.longhair || o.longhair) for (let j = 5; j < f.hh + 6; j++) { s.rect(cx - hd - 1 - (j > 8 ? 1 : 0), hTop + j, 2, 1, hair[hn - 1 - (j % 3 === 0 ? 1 : 0)]); s.rect(cx + hd - 1 + (j > 8 ? 1 : 0), hTop + j, 2, 1, hair[hn - 3]); }
    if (o.bun) { s.oval(cx, hTop - 3, 2.6, 2.2, () => hair[hn - 1]); s.set(cx - 1, hTop - 4, hair[hn]); }
  }
  if (f.beard || o.beard) {
    for (let j = 0; j < (f.beard ? 10 : 5); j++) { const w = j < 2 ? hd - 1 : j < 6 ? hd - 2 : Math.max(1, hd - 3 - (j - 6)); for (let i = -w; i < w; i++) s.set(cx + i, er + 2 + j, hair[clamp(hn - 1 - (i > 1 ? 1 : 0) - (j % 3 === 2 ? 1 : 0) + (i < -1 ? 1 : 0), 0, hn)]); }
    s.rect(cx - 2, er + 3, 3, 1, skin[Math.max(0, sn - 3)]);
    if (f.beard) { s.rect(cx - 3, er + 9, 2, 3, hair[hn - 2]); s.rect(cx + 1, er + 9, 2, 3, hair[hn - 3]); s.set(cx - 3, er + 12, P.gold[3]); s.set(cx + 1, er + 12, P.gold[3]); }
  }
  if (f.ears) for (let k = 0; k < 4; k++) { s.set(cx - hd - 1 - (k > 1 ? 1 : 0), er - k, skin[sn - 1]); s.set(cx + hd + (k > 1 ? 1 : 0), er - k, skin[sn - 2]); }
  if (f.bigears) for (let k = 0; k < 5; k++) { s.rect(cx - hd - 1 - k, er - (k >> 1) - (k > 3 ? 1 : 0), 1, k < 3 ? 3 : 2, skin[sn - 1 - (k === 0 ? 1 : 0)]); s.rect(cx + hd + k, er - (k >> 1) - (k > 3 ? 1 : 0), 1, k < 3 ? 3 : 2, skin[sn - 2]); }
  if (f.tusks) { s.rect(cx - 4, er + 3, 1, 2, P.bone[5]); s.rect(cx + 3, er + 3, 1, 2, P.bone[4]); s.rect(cx - 4, er - 1, 8, 1, skin[0]); s.rect(cx - 3, er + 4, 6, 1, skin[1]); if (o.mohawk) for (let j = -3; j < 4; j++) s.rect(cx - 1, hTop + j, 2, 1, o.mohawk[3 - (j & 1)]); }
  const hat = o.hat;
  if (hat === 'straw') { for (let i = -hd - 5; i < hd + 5; i++) { s.set(cx + i, hTop + 1, P.thatch[(i & 1) ? 4 : 5]); s.set(cx + i, hTop + 2, P.thatch[2]); } for (let i = -hd - 3; i < hd + 3; i++) s.set(cx + i, hTop, P.thatch[4]); for (let j = 0; j < 4; j++) for (let i = -hd + 1; i < hd - 1; i++) s.set(cx + i, hTop - 4 + j, j === 3 ? P.red[2] : P.thatch[clamp(5 - (i > 1 ? 1 : 0) - ((i + j) & 1), 0, 5)]); }
  if (hat === 'hood') { const c = o.hood || tunic, n = c.length - 1; for (let j = -2; j < f.hh + 2; j++) { const inset = j === -2 ? 3 : j === -1 ? 1 : 0; for (let i = -hd - 1 + inset; i < hd + 1 - inset; i++) { if (j > 2 && j < f.hh && i > -hd && i < hd - 1) continue; const u = (i + hd + 1) / (2 * hd + 1); s.set(cx + i, hTop + j, c[clamp((u < .3 ? n - 1 : u < .7 ? n - 2 : n - 3) + (j < 0 ? 1 : 0), 0, n)]); } } for (let i = -hd + 1; i < hd - 1; i++) s.set(cx + i, hTop + 3, dark(skin[sn - 2], .7)); }
  if (hat === 'helm') { for (let j = -2; j < 4; j++) { const inset = j === -2 ? 2 : j === -1 ? 1 : 0; for (let i = -hd - (j > 1 ? 1 : 0) + inset; i < hd + (j > 1 ? 1 : 0) - inset; i++) { const u = (i + hd) / (2 * hd); s.set(cx + i, hTop + j, P.iron[clamp((u < .2 ? 5 : u < .35 ? 6 : u < .7 ? 4 : 2) - (j === 3 ? 1 : 0), 0, 6)]); } } s.rect(cx - 1, hTop + 4, 2, 4, P.iron[4]); s.rect(cx - 1, hTop + 4, 1, 4, P.iron[5]); s.rect(cx - hd - 1, hTop + 3, 2 * hd + 2, 1, P.iron[2]); if (o.crest) { s.rect(cx - 1, hTop - 6, 2, 4, o.crest[3]); s.rect(cx - 2, hTop - 5, 1, 3, o.crest[4]); s.rect(cx + 1, hTop - 5, 1, 4, o.crest[1]); } }
  if (hat === 'crown') { s.rect(cx - hd, hTop - 1, 2 * hd, 2, P.gold[3]); s.rect(cx - hd, hTop - 1, 2 * hd, 1, P.gold[4]); for (const i of [-hd, -1, hd - 2]) s.rect(cx + i, hTop - 3, 2, 2, P.gold[4]); s.set(cx - 1, hTop, P.red[4]); }
  const hx = cx + hw + aw, hy = tTop + armLen - 1, t = o.tool;
  if (t === 'sword') { for (let j = 0; j < 18; j++) { const x = hx + Math.round(j * .28); s.set(x, hy - 3 - j, P.iron[6]); s.set(x + 1, hy - 3 - j, P.iron[4]); if (j === 17) s.set(x, hy - 4 - j, P.iron[6]); } s.rect(hx - 2, hy - 2, 6, 1, P.gold[4]); s.rect(hx - 2, hy - 1, 6, 1, P.gold[2]); s.rect(hx, hy, 2, 3, P.leather[2]); s.rect(hx, hy + 3, 2, 1, P.gold[3]); }
  if (t === 'staff') { s.rect(hx, hTop - 2, 2, base - hTop + 2, P.wood[3]); s.rect(hx, hTop - 2, 1, base - hTop + 2, P.wood[5]); s.oval(hx + 1, hTop - 6, 3, 3.4, (x, y, nx, ny) => P.mana[nx + ny < -.3 ? 5 : nx + ny < .5 ? 4 : 2], 255); s.set(hx - 2, hTop - 3, P.wood[4]); s.set(hx + 3, hTop - 3, P.wood[2]); s.emit = { dx: hx - cx, dy: -42, rad: 64, col: [.4, .8, 1] }; }
  if (t === 'axe') { s.thick(hx - 1, hy + 4, hx + 3, hy - 20, 2, P.wood, 4); for (let j = 0; j < 9; j++) { const w = j < 2 ? 4 : j < 7 ? 6 + (j > 3 ? 1 : 0) : 4; for (let i = 0; i < w; i++) s.set(hx + 4 + i, hy - 24 + j, P.iron[i >= w - 2 ? 6 : j < 2 ? 5 : 4 - (j > 6 ? 1 : 0)]); } s.rect(hx + 2, hy - 22, 3, 5, P.iron[2]); }
  if (t === 'pick') { s.thick(hx - 1, hy + 4, hx + 3, hy - 20, 2, P.wood, 4); for (let i = -7; i <= 8; i++) { const y = hy - 21 + Math.round(i * i * .07); s.set(hx + 3 + i, y, P.iron[i < 0 ? 5 : 4]); s.set(hx + 3 + i, y + 1, P.iron[i < 0 ? 4 : 2]); } s.rect(hx + 2, hy - 23, 3, 4, P.iron[3]); }
  if (t === 'hoe') { s.thick(hx - 1, base, hx + 2, hy - 22, 2, P.wood, 4); s.rect(hx + 2, hy - 23, 7, 2, P.iron[5]); s.rect(hx + 7, hy - 21, 2, 4, P.iron[4]); s.rect(hx + 8, hy - 21, 1, 4, P.iron[2]); }
  if (t === 'hammer') { s.thick(hx - 1, hy + 2, hx + 1, hy - 12, 2, P.wood, 4); s.rect(hx - 3, hy - 17, 9, 5, P.iron[4]); s.rect(hx - 3, hy - 17, 9, 1, P.iron[6]); s.rect(hx - 3, hy - 13, 9, 1, P.iron[2]); s.rect(hx + 5, hy - 17, 1, 5, P.iron[2]); }
  if (t === 'spear') { s.rect(hx, hTop - 6, 2, base - hTop + 6, P.wood[3]); s.rect(hx, hTop - 6, 1, base - hTop + 6, P.wood[5]); for (let j = 0; j < 8; j++) { const w = j < 5 ? Math.ceil((j + 1) / 2) : 2; s.rect(hx + 1 - w, hTop - 14 + j, w, 1, P.iron[6]); s.rect(hx + 1, hTop - 14 + j, w, 1, P.iron[3]); } s.rect(hx - 1, hTop - 6, 4, 1, P.leather[3]); }
  if (t === 'club') { s.thick(hx - 1, hy + 2, hx + 2, hy - 10, 2, P.wood, 3); s.ball(hx + 3, hy - 14, 4, 5, 3, P.wood, { d: .2, n: .3 }); s.set(hx + 6, hy - 16, P.bone[5]); s.set(hx, hy - 17, P.bone[5]); s.set(hx + 6, hy - 11, P.bone[4]); }
  if (t === 'bow') { for (let j = -11; j <= 11; j++) { const x = hx + 4 - Math.round(j * j / 28); s.set(x, hy - 6 + j, P.wood[4]); s.set(x + 1, hy - 6 + j, P.wood[2]); } s.rect(hx, hy - 17, 1, 23, P.cloth[4]); s.rect(hx + 3, hy - 8, 2, 4, P.leather[3]); }
  if (t === 'torch') { s.rect(hx, hy - 9, 2, 12, P.wood[3]); s.rect(hx, hy - 9, 1, 12, P.wood[5]); s.rect(hx - 1, hy - 11, 4, 3, P.cloth[2]); flame2(s, hx + 1, hy - 11, 2, 8, 0); s.emit = { dx: hx - cx, dy: -34, rad: 100, col: [1, .6, .24], flicker: 1 }; }
  if (t === 'basket') { s.slab(hx - 3, hy - 2, 9, 3, 5, M.weave(P.wicker, 3), M.weave(P.wicker, 3)); for (let i = 0; i < 4; i++) s.oval(hx - 1 + i * 2, hy - 2, 1.4, 1.4, () => P.red[3 + (i & 1)]); s.rect(hx - 2, hy - 6, 1, 4, P.wicker[2]); s.rect(hx + 4, hy - 6, 1, 4, P.wicker[1]); s.rect(hx - 2, hy - 7, 7, 1, P.wicker[3]); }
  if (t === 'log') { const ly = tTop + 4; for (let i = -14; i <= 14; i++) for (let j = 0; j < 6; j++) s.set(cx + i, ly + j, P.wood[clamp([5, 4, 3, 3, 2, 1][j] - (noise(i * .3, j, 3) > .68 ? 1 : 0), 0, 5)]); s.oval(cx - 14, ly + 2.5, 2, 3, (x, y, nx, ny) => P.plank[Math.hypot(nx, ny) < .5 ? 3 : 5]); for (const gx of [cx - 9, cx + 6]) { s.rect(gx, ly + 1, 3, 3, skin[sn - 1]); s.rect(gx, ly + 3, 3, 1, skin[sn - 3]); } }
  if (o.shield) { s.oval(cx - hw - aw - 1, tTop + 7, 6, 7.4, (x, y, nx, ny) => { const q = Math.hypot(nx, ny); return q > .84 ? P.iron[nx + ny < 0 ? 5 : 2] : Math.abs(nx) < .16 || Math.abs(ny) < .13 ? P.cloth[4] : o.shield[nx < -.2 ? 4 : nx < .4 ? 3 : 2]; }); s.oval(cx - hw - aw - 1, tTop + 7, 1.6, 1.6, () => P.iron[6]); }
  if (o.cape) { const c = o.cape; for (let j = 0; j < f.tl + f.legs - 4; j++) { s.set(cx - hw - aw - (j > 6 ? 1 : 0), tTop + 1 + j, c[3]); s.set(cx + hw + aw - 1 + (j > 6 ? 1 : 0), tTop + 1 + j, c[1]); } }
  s.outline();
  s.sh = { rx: 9, ry: 3.4, dx: 4, dy: 0 };
  return s;
}

function quad(o) {
  const s = new Spr(84, 64, 38, 56), cx = 38, gy = 56, L = o.L, Hb = o.Hb, fur = o.fur, n = fur.length - 1;
  const cy = gy - o.leg - Hb + 2, legw = o.legw || 4, bo = { n: o.shag || .22, ns: .85, seed: 3, d: .14 }, farFur = fur.map(c => dark(c, .62));
  const legX = [cx - L + 2, cx + L - legw - 3];
  const leg = (x, far) => {
    const top = cy + Hb * .3, lr = far ? farFur : fur;
    s.ball(x + legw / 2, top + 2, legw * .95, 5, far ? -3 : 3, lr, bo);
    for (let y = Math.round(top + 4); y <= gy; y++) { const thin = y > top + o.leg * .55 && legw > 3 ? 1 : 0; for (let i = 0; i < legw - thin; i++) s.set(x + i, y, lr[clamp(n - 2 + (i === 0 ? 1 : i >= legw - 2 ? -1 : 0), 0, n)]); }
    const hoof = o.hoof ? (far ? dark(o.hoof, .8) : o.hoof) : null;
    for (let i = 0; i < legw + 1; i++) { s.set(x + i, gy, hoof || lr[1]); if (o.hoof) s.set(x + i, gy - 1, hoof); else if (i === legw) s.set(x + i, gy - 1, lr[n - 2]); }
  };
  for (const lx of legX) leg(Math.round(lx + 4), true);
  if (o.tail === 'bushy') for (let k = 0; k < 6; k++) s.ball(cx - L - 2 - k * 1.8, cy + 1 + k * 1.3, 4.6 - k * .4, 3.2 - k * .2, -1, k > 3 ? (o.tip || fur) : fur, bo);
  if (o.tail === 'short') s.ball(cx - L - 1, cy - 1, 2.6, 2.4, 0, o.tip || fur, bo);
  if (o.tail === 'long') for (let k = 0; k < L + 6; k++) { const y = cy + 1 + Math.sin(k * .45) * 2 + k * .25, tp = o.tip || fur; s.set(cx - L - k, y, tp[Math.min(3, tp.length - 1)]); s.set(cx - L - k, y + 1, tp[1]); }
  if (o.tail === 'fat') { const tl = Math.min(L + 6, cx - L - 1); for (let k = 0; k < tl; k++) { const w = Math.max(1, Hb * (1 - k / tl) * .9), y = cy + 1 + Math.sin(k * .3) * 1.5; for (let j = -w; j <= w; j++) s.set(cx - L + 2 - k, y + j, fur[clamp(n - 2 - Math.round(j / w * 1.4) - (k % 3 === 0 ? 1 : 0), 0, n)]); } }
  if (o.tail === 'tuft') { s.thick(cx - L, cy - 3, cx - L - 4, cy + Hb + 3, 2, fur, n - 2); s.ball(cx - L - 4, cy + Hb + 5, 2.4, 3, 0, farFur, bo); }
  s.ball(cx, cy, L, Hb, 0, fur, bo);
  s.ball(cx + L * .5, cy - (o.hump || 0) - .5, L * .56, Hb * 1.06 + (o.hump || 0), .5, fur, bo);
  s.ball(cx - L * .55, cy + .4, L * .5, Hb * .98, .3, fur, bo);
  if (o.belly) for (let y = Math.round(cy + Hb * .3); y <= cy + Hb + 1; y++) for (let x = cx - L - 2; x <= cx + L + 2; x++) { const c = s.get(x, y), i = fur.indexOf(c); if (i >= 0) s.set(x, y, o.belly[clamp(i + 1, 0, o.belly.length - 1)]); }
  for (const lx of legX) leg(Math.round(lx), false);
  const hr = o.head, hx = cx + L + hr * .35 + (o.neck || 0), hy = cy - (o.up || 0);
  if (o.up > 3) for (let k = 0; k <= 8; k++) s.ball(mix(cx + L * .7, hx - 1, k / 8), mix(cy - Hb * .3, hy + 2, k / 8), o.neckw || 3.6, o.neckw || 3.6, 1, fur, bo);
  if (o.mane) for (let k = 0; k < 14; k++) { const x = cx + L * .2 + k, y = cy - Hb - (o.hump || 0) - 1 + (k > 9 ? k - 9 : 0); s.set(x, y, o.mane[2 + (k & 1)]); s.set(x, y - 1 - (k & 1), o.mane[1 + (k % 3)]); }
  s.ball(hx, hy, hr, hr * .92, 2, fur, bo);
  const sl = o.snout || 0, sx = hx + hr * .7 + sl * .5, sy = hy + hr * .28;
  if (sl) s.ball(sx, sy, sl * .5 + 1.6, o.snoutH || 2.8, 2.5, o.muzzle || fur, { d: .14, bias: .08 });
  const tip = Math.round(sx + sl * .5 + .8);
  if (!o.beak) { s.rect(tip - 1, Math.round(sy - 1.5), 2, 2, P.ink); s.set(tip - 1, Math.round(sy - 1.5), P.furGrey[2]); s.rect(Math.round(hx + hr * .7), Math.round(sy + 1.6), Math.max(2, Math.round(sl * .7)), 1, fur[0]); }
  const ex = Math.round(hx + hr * .2), ey = Math.round(hy - hr * .3);
  s.rect(ex, ey, 2, 2, o.eye || P.ink, o.eye ? 230 : 0); s.set(ex, ey, o.eye ? P.cloth[5] : P.furGrey[3], o.eye ? 230 : 0); s.rect(ex - 1, ey - 1, 4, 1, fur[1]);
  const ax = Math.round(hx - hr * .35), ay = Math.round(hy - hr * .8);
  if (o.ears === 'point') for (const [dx, sh] of [[3, 1], [-1, 0]]) for (let j = 0; j < 5; j++) for (let i = 0; i < (5 - j + 1) / 2 + .5; i++) { s.set(ax + dx + i + (j >> 1), ay - j, sh ? fur[n - 3] : fur[i === 0 ? n - 1 : n - 2]); if (!sh && j < 3 && i === 1) s.set(ax + dx + i + (j >> 1), ay - j, o.inner || fur[1]); }
  if (o.ears === 'round') { s.oval(ax + 5, ay, 2.6, 2.6, () => fur[n - 3]); s.oval(ax, ay, 2.8, 2.8, (x, y, nx, ny) => Math.hypot(nx, ny) < .45 ? fur[1] : fur[n - 1]); }
  if (o.ears === 'long') for (let j = 0; j < 10; j++) { s.rect(ax + 3 + (j > 6 ? 1 : 0), ay - j, 2, 1, fur[n - 3]); s.rect(ax - (j > 5 ? 1 : 0), ay - j, 3, 1, fur[n - 1]); s.set(ax + 1 - (j > 5 ? 1 : 0), ay - j, o.inner || P.skinPale[3]); }
  if (o.ears === 'leaf') { for (let j = 0; j < 4; j++) s.rect(ax - 3 - j, ay + 1 - (j >> 1), 2, 2, fur[n - 1]); s.set(ax - 4, ay + 1, P.skinPale[3]); }
  if (o.ears === 'flap') s.oval(ax - 3, ay + 9, 5.5, 9, M.fur(farFur, n - 1, 3));
  if (o.extra) o.extra(s, { cx, cy, hx, hy, hr, tip, sy, gy, L, Hb, ax, ay, ex, ey });
  s.outline();
  s.sh = { rx: L + 4, ry: Math.max(4, Hb * .5), dx: 3, dy: 0 };
  return s;
}
const antlers = (c, big) => (s, g) => {
  for (const [d, k] of [[4, 3], [0, 5]]) {
    const x = g.ax + d, y = g.ay - 1;
    s.thick(x, y, x - 3 + d * .5, y - 9, 2, c, k - 1); s.thick(x - 3 + d * .5, y - 9, x - 1 + d * .5, y - 15 - (big ? 4 : 0), 1, c, k);
    s.thick(x - 2 + d * .5, y - 6, x + 3 + d * .5, y - 10, 1, c, k); s.thick(x - 2 + d * .5, y - 9, x - 7 + d * .5, y - 12, 1, c, k - 1);
    if (big) { s.thick(x - 1 + d * .5, y - 13, x + 4 + d * .5, y - 17, 1, c, k); s.thick(x - 3 + d * .5, y - 12, x - 8 + d * .5, y - 17, 1, c, k - 1); }
  }
};
const BEASTS = {
  wolf: { name: 'Grey Wolf', o: { L: 13, Hb: 6.2, leg: 9, head: 5.4, up: 3, snout: 5.6, ears: 'point', tail: 'bushy', fur: P.furGrey, belly: P.furWhite, tip: P.furWhite, muzzle: P.furWhite, eye: P.gold[4], shag: .3 } },
  direwolf: { name: 'Dire Wolf', o: { L: 17, Hb: 8.4, leg: 11, legw: 5, head: 6.8, up: 4, snout: 6.4, ears: 'point', tail: 'bushy', fur: P.furDark, mane: P.furGrey, eye: P.fire[3], shag: .42, hump: 1.5 } },
  bear: { name: 'Brown Bear', o: { L: 16, Hb: 10.4, leg: 7, legw: 6, head: 7.2, up: 1, snout: 4.6, snoutH: 3.2, ears: 'round', tail: 'short', fur: P.furBrown, muzzle: P.furTan, hump: 2.4, shag: .42 } },
  boar: { name: 'Wild Boar', o: { L: 13, Hb: 8, leg: 6, legw: 4, head: 6.4, up: -1, snout: 6, snoutH: 3.4, ears: 'point', tail: 'short', fur: P.furDark, mane: P.furBrown, hump: 1.8, shag: .5, hoof: P.ink, extra: (s, g) => { s.rect(g.tip - 4, g.sy - 1, 1, 4, P.bone[5]); s.rect(g.tip - 3, g.sy - 2, 1, 2, P.bone[4]); s.rect(g.tip - 1, g.sy - 2, 2, 4, P.skinPale[2]); } } },
  deer: { name: 'Red Deer', o: { L: 12.5, Hb: 6.4, leg: 13, legw: 3, head: 4.6, up: 11, neck: 2, snout: 4.6, snoutH: 2.4, ears: 'leaf', tail: 'short', tip: P.cloth, fur: P.furTan, belly: P.cloth, hoof: P.ink, extra: antlers(P.bone, 0) } },
  elk: { name: 'Woodland Elk', o: { L: 15.5, Hb: 8, leg: 15, legw: 4, head: 5.4, up: 13, neck: 2, neckw: 4.6, snout: 5.6, snoutH: 2.8, ears: 'leaf', tail: 'short', fur: P.furBrown, mane: P.furDark, hoof: P.ink, extra: antlers(P.bone, 1) } },
  ox: { name: 'Wild Ox', o: { L: 18, Hb: 10, leg: 9, legw: 5, head: 6.8, up: 0, snout: 5, snoutH: 3.6, ears: 'leaf', tail: 'tuft', fur: P.furBrown, hump: 2.6, hoof: P.ink, muzzle: P.furTan, extra: (s, g) => { s.thick(g.ax + 1, g.ay + 1, g.ax - 2, g.ay - 5, 2, P.bone, 5); s.thick(g.ax - 2, g.ay - 5, g.ax + 1, g.ay - 8, 1, P.bone, 5); s.thick(g.ax + 6, g.ay + 1, g.ax + 10, g.ay - 4, 2, P.bone, 3); s.thick(g.ax + 10, g.ay - 4, g.ax + 8, g.ay - 8, 1, P.bone, 4); } } },
  packox: { name: 'Pack Ox', o: { L: 18, Hb: 10, leg: 9, legw: 5, head: 6.8, up: 0, snout: 5, snoutH: 3.6, ears: 'leaf', tail: 'tuft', fur: P.furTan, hump: 1.4, hoof: P.ink, extra: (s, g) => { s.thick(g.ax + 1, g.ay + 1, g.ax - 2, g.ay - 5, 2, P.bone, 5); s.thick(g.ax + 6, g.ay + 1, g.ax + 10, g.ay - 4, 2, P.bone, 3); s.slab(g.cx - 11, g.cy - g.Hb - 7, 18, 5, 5, M.cloth(P.cloth, 4, 3), M.cloth(P.cloth, 3, 5)); s.rect(g.cx - 2, g.cy - g.Hb + 2, 2, 15, P.leather[2]); s.rect(g.cx - 2, g.cy - g.Hb + 2, 1, 15, P.leather[4]); s.ball(g.cx - 12, g.cy - 4, 4.4, 5.4, 4, P.red, { d: .15 }); s.rect(g.cx - 13, g.cy - 10, 2, 2, P.leather[3]); } } },
  frostfang: { name: 'Frost-Fang', o: { L: 17, Hb: 8.2, leg: 11, legw: 5, head: 6.6, up: 4, snout: 6.4, ears: 'point', tail: 'bushy', fur: P.furWhite, mane: P.moon, eye: P.mana[4], shag: .36, hump: 1.2 } },
  worg: { name: 'Grey Worg', o: { L: 17, Hb: 9, leg: 10, legw: 5, head: 7.2, up: 2, snout: 6.6, ears: 'point', tail: 'bushy', fur: P.furGrey, mane: P.furDark, eye: P.red[4], hump: 2.6, shag: .5 } },
  jackal: { name: 'Golden Jackal', o: { L: 10.5, Hb: 5, leg: 8, legw: 3, head: 4.6, up: 3, snout: 5, snoutH: 2.2, ears: 'point', tail: 'bushy', fur: P.furTan, belly: P.cloth, tip: P.furDark } },
  cavebear: { name: 'Cave Bear', o: { L: 20, Hb: 13, leg: 8, legw: 7, head: 8.4, up: 1, snout: 5.2, snoutH: 3.6, ears: 'round', tail: 'short', fur: P.furDark, muzzle: P.furBrown, hump: 3.4, shag: .5 } },
  fawn: { name: 'Fawn', o: { L: 7.5, Hb: 4, leg: 8, legw: 2, head: 3.4, up: 6, neck: 1, neckw: 2.4, snout: 2.8, snoutH: 1.8, ears: 'leaf', tail: 'short', tip: P.cloth, fur: P.furTan, belly: P.cloth, hoof: P.ink, extra: (s, g) => { for (let i = 0; i < 7; i++) s.set(g.cx - 5 + i * 1.7, g.cy - 2 + (i % 3), P.cloth[5]); } } },
  sabre: { name: 'Sabretooth Cat', o: { L: 14.5, Hb: 7, leg: 8, legw: 5, head: 6, up: 3, snout: 3.4, snoutH: 3, ears: 'round', tail: 'short', fur: P.savanna, belly: P.cloth, extra: (s, g) => { s.rect(g.tip - 2, g.sy + 2, 2, 6, P.bone[5]); s.rect(g.tip - 1, g.sy + 2, 1, 6, P.bone[3]); for (let k = 0; k < 6; k++) s.thick(g.cx - 10 + k * 4, g.cy - 6, g.cx - 12 + k * 4, g.cy + 1, 1, P.leather, 1); } } },
  bighorn: { name: 'Bighorn', o: { L: 11, Hb: 6.6, leg: 8, legw: 3, head: 4.8, up: 6, neck: 1, neckw: 3.4, snout: 3.6, snoutH: 2.2, ears: 'none', tail: 'short', fur: P.cloth, hoof: P.ink, shag: .5, extra: (s, g) => { for (let a = 0; a < 26; a++) { const t = a / 26 * 5.2 - 1.9, rr = 5.2 - a * .1; s.set(g.hx - 2 + Math.cos(t) * rr, g.hy - 1 + Math.sin(t) * rr, P.wicker[2 + (a % 3)]); s.set(g.hx - 2 + Math.cos(t) * (rr - 1), g.hy - 1 + Math.sin(t) * (rr - 1), P.wicker[1 + (a % 2)]); } } } },
  mammoth: { name: 'Bull Mammoth', o: { L: 23, Hb: 16, leg: 12, legw: 8, head: 10, up: 4, snout: 0, ears: 'flap', tail: 'tuft', fur: P.furRust, hump: 5, shag: .7, beak: 1, extra: (s, g) => { for (let j = 0; j < 24; j++) { const x = g.hx + 7 + Math.sin(j * .22) * 3, w = j < 14 ? 5 : 4; for (let i = 0; i < w; i++) s.set(x + i, g.hy + 3 + j, P.furRust[clamp(3 - Math.floor(i / w * 3) - (j % 4 === 0 ? 1 : 0), 0, 4)]); } for (const [o2, k] of [[0, 5], [1, 3]]) { s.thick(g.hx + 3, g.hy + 8 + o2 * 2, g.hx + 15, g.hy + 19 + o2, 2, P.bone, k); s.thick(g.hx + 15, g.hy + 19 + o2, g.hx + 19, g.hy + 11 + o2, 2, P.bone, k); } for (let x = g.cx - 20; x < g.cx + 18; x += 2) for (let j = 0; j < 4 + (x % 3); j++) s.set(x, g.cy + g.Hb - 2 + j, P.furRust[1 + (x % 2)]); } } },
  lurker: { name: 'Bog Lurker', o: { L: 18, Hb: 4.6, leg: 2, legw: 6, head: 4.8, up: 0, snout: 11, snoutH: 2.6, ears: 'none', tail: 'fat', fur: P.mossSwamp, belly: P.cloth, eye: P.gold[4], shag: .6, extra: (s, g) => { for (let k = 0; k < 15; k++) { s.set(g.cx - 15 + k * 2.2, g.cy - g.Hb - 1, P.mossSwamp[4]); s.set(g.cx - 15 + k * 2.2, g.cy - g.Hb, P.mossSwamp[1]); } for (let k = 0; k < 6; k++) s.set(g.tip - 3 - k * 2, g.sy + 3, P.bone[5]); } } },
  hippogriff: { name: 'Grey Hippogriff', o: { L: 15, Hb: 7.6, leg: 12, legw: 4, head: 5.6, up: 12, neck: 2, neckw: 4.4, snout: 0, ears: 'none', tail: 'tuft', fur: P.furGrey, hoof: P.ink, beak: 1, extra: (s, g) => { for (let j = 0; j < 4; j++) s.rect(g.hx + 4, g.hy + j, 6 - j, 1, P.gold[4 - (j > 1 ? 1 : 0) - (j === 3 ? 1 : 0)]); s.set(g.hx + 9, g.hy + 3, P.gold[1]); for (let k = 0; k < 16; k++) { const x0 = g.cx + 8 - k, x1 = g.cx - 4 - k * 1.7; s.thick(x0, g.cy - 5, x1, g.cy - 22 + k * 1.1, 2, P.furWhite, 1 + (k % 3)); } for (let k = 0; k < 5; k++) s.set(g.ax + k, g.ay - 1 - (k & 1), P.furWhite[4]); } } },
  owlbear: { name: 'Tawny Owlbear', o: { L: 16, Hb: 11.5, leg: 7, legw: 6, head: 8, up: 4, snout: 0, ears: 'point', tail: 'none', fur: P.furTan, hump: 3, shag: .7, beak: 1, eye: P.gold[4], extra: (s, g) => { s.oval(g.ex + 1, g.ey + 1, 3.6, 3.6, (x, y, nx, ny) => Math.hypot(nx, ny) < .35 ? P.ink : Math.hypot(nx, ny) < .62 ? P.gold[4] : P.cloth[5]); for (let j = 0; j < 5; j++) s.rect(g.hx + 5, g.hy + 1 + j, Math.max(1, 4 - j), 1, P.gold[j < 2 ? 3 : 2]); for (let k = 0; k < 14; k++) for (let q = 0; q < 3; q++) { const x = g.cx - 13 + k * 2 + (q & 1), y = g.cy - 3 + q * 4; s.set(x, y, P.furBrown[2]); s.set(x + 1, y + 1, P.furBrown[3]); } } } },
};
const NQ = {
  fowl(s, gy) {
    const f = P.furRust;
    for (const x of [18, 21]) { s.rect(x, gy - 4, 1, 4, P.gold[x < 20 ? 3 : 2]); s.rect(x, gy, 3, 1, P.gold[x < 20 ? 3 : 2]); }
    for (let i = 0; i < 4; i++) s.thick(15, gy - 8, 10 + i * .5, gy - 15 + i * 2.4, 1, [P.furDark, P.green, P.blue, P.furDark][i], 2);
    s.ball(19, gy - 8, 5.6, 4.2, 0, f, { n: .4, ns: 1, d: .14 }); s.ball(17, gy - 7, 3.4, 2.4, 1, P.furBrown, { n: .4, ns: 1, d: .14, bias: .1 });
    s.ball(23.5, gy - 11.5, 2.2, 2.8, 1, f, { d: .14 }); s.ball(24.5, gy - 15, 2.3, 2.3, 2, f, { d: .14, bias: .1 });
    s.rect(26, gy - 15, 2, 1, P.gold[4]); s.set(27, gy - 14, P.gold[2]); s.rect(24, gy - 18, 2, 1, P.red[3]); s.set(25, gy - 19, P.red[4]); s.set(26, gy - 13, P.red[2]); s.set(25, gy - 16, P.ink);
    s.sh = { rx: 7, ry: 2.4, dx: 2, dy: 0 };
  },
  rabbit(s, gy) {
    const f = P.furTan, o = { n: .3, ns: 1, d: .14 };
    s.oval(9, gy - 5, 2.6, 2.6, () => P.cloth[5]); s.set(8, gy - 4, P.cloth[3]);
    s.ball(14, gy - 5, 5.6, 5.2, 0, f, o); s.ball(19.5, gy - 6, 6.4, 4.6, 1, f, o);
    for (let j = 0; j < 9; j++) { s.rect(26 - (j > 6 ? 1 : 0), gy - 12 - j, 2, 1, f[2]); }
    s.ball(25.5, gy - 10, 3.8, 3.4, 2, f, { d: .14, bias: .06 }); s.ball(28.4, gy - 9, 2.1, 1.9, 3, f, { d: .14, bias: .14 });
    for (let j = 0; j < 10; j++) { const x = 23 - (j > 5 ? 1 : 0); s.set(x, gy - 13 - j, f[5]); s.set(x + 1, gy - 13 - j, j > 0 && j < 9 ? P.skinPale[3] : f[4]); s.set(x + 2, gy - 13 - j, f[3]); }
    for (let x = 12; x < 25; x++) for (let y = gy - 3; y <= gy - 1; y++) { const c = s.get(x, y); if (c && f.indexOf(c) >= 0) s.set(x, y, P.cloth[clamp(f.indexOf(c) + 1, 0, 5)]); }
    s.rect(11, gy - 1, 8, 2, f[3]); s.rect(11, gy - 1, 8, 1, f[4]); s.set(19, gy, f[4]);
    s.rect(23, gy - 3, 2, 4, f[3]); s.rect(23, gy, 3, 1, f[4]);
    s.rect(26, gy - 11, 1, 2, P.ink); s.set(26, gy - 11, P.furGrey[4]); s.set(30, gy - 9, P.skinPale[2]); s.set(29, gy - 7, f[1]);
    s.sh = { rx: 10, ry: 2.8, dx: 2, dy: 0 };
  },
  rat(s, gy) {
    const f = P.furDark, o = { n: .3, ns: 1, d: .14 };
    for (let k = 0; k < 15; k++) { const y = gy - 2 - Math.sin(k * .4) * 2.2 - (k > 10 ? (k - 10) * .5 : 0); s.set(17 - k, y, P.skinPale[k < 11 ? 3 : 2]); if (k < 5) s.set(17 - k, y + 1, P.skinPale[1]); }
    s.ball(20.5, gy - 5.5, 5.4, 5, 0, f, o); s.ball(26, gy - 5, 7.2, 4.4, 1, f, o);
    s.oval(32.5, gy - 9.5, 2, 2, () => f[2]);
    s.ball(33, gy - 5, 3.8, 3.3, 2, f, { d: .14, bias: .05 }); s.ball(36.6, gy - 4.2, 2.6, 1.9, 3, f, { d: .14, bias: .1 });
    s.oval(30, gy - 9, 2.2, 2.2, (x, y, nx, ny) => Math.hypot(nx, ny) < .5 ? P.skinPale[2] : f[4]);
    s.set(39, gy - 4, P.skinPale[3]); s.set(34, gy - 6, P.red[4], 220); s.set(34, gy - 7, f[1]);
    s.line(37, gy - 3, 40, gy - 2, P.furGrey[4]); s.line(37, gy - 5, 40, gy - 6, P.furGrey[3]);
    s.rect(19, gy, 4, 1, P.skinPale[2]); s.rect(29, gy, 3, 1, P.skinPale[2]); s.rect(20, gy - 1, 2, 1, f[2]); s.rect(29, gy - 1, 2, 1, f[2]);
    s.sh = { rx: 11, ry: 2.6, dx: 2, dy: 0 };
  },
  spider(s, gy) {
    const c = P.chitin, by = gy - 9, bx = 28;
    for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) { const off = (i - 1.5) * 4.6, kx = bx + off * 1.8 + sd * (9 + Math.abs(i - 1.5) * 2.4), ky = by - 11 + Math.abs(i - 1.5) * 2.4, fx = kx + sd * 7 + off * .8; s.thick(bx + off, by, kx, ky, 2, c, sd < 0 ? 3 : 2); s.thick(kx, ky, fx, gy, 2, c, sd < 0 ? 4 : 2); s.set(kx, ky - 1, c[4]); }
    s.ball(22, by - 1, 10, 8, 2, c, { n: .3, ns: 1, d: .14 }); s.ball(35, by + 1, 5.6, 4.8, 3, c, { d: .14 });
    for (const [x, y] of [[19, by - 3], [22, by - 5], [24, by - 2], [21, by]]) { s.set(x, y, P.red[3]); s.set(x + 1, y, P.red[2]); }
    for (const [x, y] of [[37, by - 1], [39, by], [37, by + 1], [35, by - 2]]) s.set(x, y, P.red[4], 255);
    s.rect(39, by + 3, 1, 3, P.bone[4]); s.rect(37, by + 4, 1, 3, P.bone[3]);
    s.sh = { rx: 20, ry: 6, dx: 2, dy: 0 };
  },
  adder(s, gy) {
    const c = P.mossSwamp; let lx = 0, ly = 0;
    for (let i = 0; i < 100; i++) { const t = i / 99, x = 6 + t * 38, y = gy - 3 + Math.sin(t * 10) * 4 - (t > .8 ? (t - .8) * 80 : 0); s.ball(x, y, 2.6 - (t < .15 ? (.15 - t) * 9 : 0), 2.4 - (t < .15 ? (.15 - t) * 9 : 0), i * .01, c, { d: .1, bias: Math.floor(i / 7) % 2 ? .12 : -.14 }); lx = x; ly = y; }
    s.ball(lx + 2, ly - 1, 4.2, 3, 3, c, { d: .1, bias: .1 }); s.set(lx + 3, ly - 2, P.gold[4], 230); s.set(lx + 4, ly - 2, P.ink); s.line(lx + 6, ly, lx + 9, ly, P.red[4]); s.set(lx + 10, ly - 1, P.red[4]); s.set(lx + 10, ly + 1, P.red[4]);
    s.sh = { rx: 20, ry: 3.4, dx: 2, dy: 0 };
  },
  ooze(s, gy) {
    s.ball(26, gy - 9, 18, 13, 0, P.ooze, { n: .3, ns: .35, d: .16, bias: .04 }); for (let x = 0; x < 64; x++) for (let y = gy + 1; y < 60; y++) s.set(x, y, null);
    for (let i = 0; i < s.e.length; i++) if (s.c[i]) s.e[i] = 80;
    s.oval(18, gy - 15, 4, 2.4, () => P.ooze[5], 230); s.oval(15, gy - 11, 1.4, 1.2, () => P.ooze[5], 230);
    for (const [x, y] of [[30, gy - 8], [22, gy - 5], [35, gy - 13]]) { s.oval(x, y, 2.2, 2.2, (px, py, nx, ny) => Math.hypot(nx, ny) > .6 ? P.ooze[1] : P.ooze[3]); s.set(x - 1, y - 1, P.ooze[5]); }
    s.rect(34, gy - 6, 5, 1, P.bone[5]); s.set(33, gy - 7, P.bone[4]); s.set(39, gy - 5, P.bone[3]); s.oval(27, gy - 14, 2.4, 2.2, () => P.bone[5]); s.set(26, gy - 14, P.ink); s.set(28, gy - 14, P.ink);
    s.emit = { dx: 0, dy: -8, rad: 44, col: [.5, 1, .3] }; s.sh = { rx: 19, ry: 5, dx: 2, dy: 0 };
  },
  shade(s, gy) {
    const g = P.ghost, cx = 26;
    for (let j = 0; j < 38; j++) { const w = j < 10 ? 5 + j * .5 : 9 + (j - 10) * .22; for (let x = Math.ceil(cx - w); x <= cx + w; x++) { if (j > 30 && hash(x >> 1, j >> 1, 3) > .45 + (38 - j) * .04) continue; const u = (x - cx + w) / (2 * w); s.set(x, gy - 40 + j, g[clamp(4 - Math.floor(u * 3.6) - (j > 26 ? 1 : 0) - (Math.sin(x * .9 + j * .2) > .7 ? 1 : 0), 0, 4)], 110); } }
    s.oval(cx, gy - 31, 5, 4.4, () => P.ink); s.rect(cx - 3, gy - 32, 2, 2, P.mana[5], 255); s.rect(cx + 2, gy - 32, 2, 2, P.mana[5], 255);
    for (let k = 0; k < 12; k++) { s.set(cx - 9 - k, gy - 22 + k * .6 + Math.sin(k) * 1.2, g[3], 110); s.set(cx - 9 - k, gy - 21 + k * .6, g[1], 110); s.set(cx + 9 + k, gy - 22 + k * .5 + Math.cos(k) * 1.2, g[2], 110); }
    s.emit = { dx: 0, dy: -22, rad: 56, col: [.5, .7, 1] };
  },
  croaker(s, gy) {
    const c = P.mossSwamp;
    s.ball(13, gy - 4, 7, 5, 0, c, { d: .14, bias: -.08 }); s.rect(5, gy - 1, 9, 2, c[2]); s.rect(4, gy, 4, 1, c[3]);
    s.ball(22, gy - 8, 11, 8, 1, c, { n: .4, ns: 1, d: .14 }); s.ball(32, gy - 13, 6.4, 5.4, 2, c, { d: .14 });
    s.ball(34, gy - 8, 4.4, 4, 3, P.cloth, { d: .14 }); s.oval(31, gy - 18, 2.8, 2.6, (x, y, nx, ny) => Math.hypot(nx, ny) < .45 ? P.ink : P.gold[4]);
    s.rect(28, gy - 4, 3, 5, c[3]); s.rect(27, gy, 6, 1, c[4]); s.rect(34, gy - 11, 5, 1, c[0]);
    for (let i = 0; i < 8; i++) s.set(14 + hash(i, 1, 3) * 16, gy - 13 + hash(i, 2, 3) * 8, c[1]);
    s.sh = { rx: 15, ry: 4.4, dx: 2, dy: 0 };
  },
  stirge(s, gy) {
    const by = gy - 22;
    for (let k = 0; k < 12; k++) { s.thick(24, by, 8 - k * .2, by - 14 + k * 2.2, 1, P.red, 1 + (k % 3)); s.thick(26, by, 40 + k * .3, by - 15 + k * 2, 1, P.red, 1 + (k % 3)); }
    s.ball(25, by + 1, 5.6, 4.4, 2, P.furRust, { d: .14, n: .3 }); s.ball(31, by + 2, 3.2, 3, 3, P.furRust, { d: .14 });
    s.line(33, by + 3, 41, by + 7, P.ink); s.set(32, by + 1, P.red[4], 230); s.line(23, by + 5, 21, by + 10, P.ink); s.line(26, by + 5, 26, by + 10, P.ink);
    s.sh = { rx: 7, ry: 2.4, dx: 2, dy: 22 };
  },
};
function mkBeast(kind) {
  if (BEASTS[kind]) return quad(BEASTS[kind].o);
  const big = kind === 'shade' || kind === 'ooze' || kind === 'spider' || kind === 'adder' || kind === 'stirge', s = big ? new Spr(64, 60, 26, 52) : new Spr(44, 44, 20, 39);
  NQ[kind](s, big ? 52 : 39);
  s.outline();
  return s;
}
const beast = (kind, flip) => cached('a' + kind + (flip ? 'f' : ''), () => { const s = mkBeast(kind); return flip ? s.flip() : s; });
const OTHER = { fowl: 'Junglefowl', rabbit: 'Cottontail', rat: 'Plague Rat', spider: 'Bramble Weaver', adder: 'Fen Adder', ooze: 'Bog Ooze', shade: 'Grave Shade', croaker: 'Bog Croaker', stirge: 'Fen Stirge' };
const PAWNS = {
  woodcutter: { name: 'Woodcutter', o: { race: 'human', tunic: P.green, hair: P.furBrown, tool: 'axe', beard: 1, seed: 2 } },
  farmer: { name: 'Farmer', o: { race: 'human', tunic: P.cloth, pants: P.blue, hair: P.hay, hat: 'straw', tool: 'hoe', skin: P.skinTan, seed: 3 } },
  smith: { name: 'Smith', o: { race: 'dwarf', tunic: P.furDark, hair: P.fallOrange, apron: 1, tool: 'hammer', sleeves: 0, seed: 4 } },
  miner: { name: 'Miner', o: { race: 'dwarf', tunic: P.blue, hair: P.furGrey, tool: 'pick', hat: 'helm', seed: 5 } },
  hunter: { name: 'Hunter', o: { race: 'elf', tunic: P.oak, pants: P.leather, hair: P.hay, tool: 'bow', hat: 'hood', seed: 6 } },
  guard: { name: 'Guard', o: { race: 'human', armor: P.iron, pants: P.furDark, hair: P.furDark, hat: 'helm', tool: 'spear', shield: P.red, crest: P.red, seed: 7 } },
  hauler: { name: 'Hauler', o: { race: 'orc', tunic: P.leather, pants: P.furDark, tool: 'log', sleeves: 0, mohawk: P.furDark, seed: 8 } },
  cook: { name: 'Cook', o: { race: 'human', tunic: P.cloth, apron: 1, hair: P.furDark, tool: 'basket', skin: P.skinDark, bun: 1, seed: 9 } },
  weaver: { name: 'Weaver', o: { race: 'human', tunic: P.red, pants: P.cloth, hair: P.fallOrange, longhair: 1, trim: P.gold, seed: 10 } },
  watch: { name: 'Night watch', o: { race: 'human', tunic: P.blue, pants: P.furDark, hair: P.furBrown, hat: 'hood', tool: 'torch', cape: P.blue, seed: 11 } },
  mage: { name: 'Attuner', o: { race: 'elf', tunic: P.purple, pants: P.purple, hair: P.furWhite, tool: 'staff', cape: P.purple, trim: P.gold, seed: 12 } },
  trader: { name: 'Trader', o: { race: 'human', tunic: P.gold, pants: P.purple, hair: P.furDark, hat: 'hood', hood: P.purple, cape: P.purple, skin: P.skinDark, seed: 13 } },
  gobboss: { name: 'Goblin Boss', o: { race: 'goblin', armor: P.copper, plate: 1, pants: P.furDark, tool: 'sword', hat: 'crown', shield: P.furDark } },
  kobold: { name: 'Cave Kobold', o: { race: 'kobold', tunic: P.leather, pants: P.furRust, tool: 'spear', sleeves: 0 } },
  warlord: { name: 'Orc Warlord', o: { race: 'orc', armor: P.iron, pants: P.furDark, tool: 'sword', hat: 'helm', crest: P.red, shield: P.red, cape: P.red } },
  gnoll: { name: 'Pack Gnoll', o: { race: 'gnoll', tunic: P.leather, pants: P.furDark, tool: 'club', sleeves: 0 } },
  goblin: { name: 'Goblin Raider', o: { race: 'goblin', tunic: P.leather, pants: P.furDark, tool: 'club', sleeves: 0 } },
  orc: { name: 'Orc Reaver', o: { race: 'orc', armor: P.furDark, plate: 1, pants: P.leather, tool: 'axe', sleeves: 0, mohawk: P.red } },
};
const pawn = (kind, flip) => cached('w' + kind + (flip ? 'f' : ''), () => { const s = mkPawn(PAWNS[kind].o); return flip ? s.flip() : s; });
