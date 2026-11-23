'use strict';
function rigPawnLie(o, p) {
  p = p || {};
  const f = FOLK[o.race || 'human'], s = new Spr(RG.W, RG.H, RG.CX, RG.BASE), skin = o.skin || f.skin, sn = skin.length - 1, tunic = o.tunic || P.cloth, pants = o.pants || P.leather, body = o.armor || tunic, hair = o.hair || P.furBrown, hn = hair.length - 1;
  const rest = !!p.rest, br = p.br ? 1 : 0, gy = RG.BASE - 1, th = Math.round(f.hw * 1.7), L = f.hh + f.tl + f.legs, x0 = RG.CX - (L >> 1), tx0 = x0 + f.hh - 1, lx0 = tx0 + f.tl, top = gy - th + 1, legH = Math.max(3, th >> 1);
  const headH = 2 * f.hd, hTop = gy - headH + 1 - (rest ? 1 : 0), noHair = o.bald || f.bald, rowU = y => clamp((y - top) / Math.max(1, th - 1), 0, 1);
  if (rest) {
    for (let x = x0 - 4; x <= x0 + L + 3; x++) for (let y = gy - 3; y <= gy + 1; y++) { const e = x === x0 - 4 || x === x0 + L + 3 || y === gy + 1; s.set(x, y, P.cloth[e ? 1 : y === gy - 3 ? 3 : 2 - ((x + y) % 7 === 0 ? 1 : 0)]); }
    s.oval(x0 + 3, gy - 2, 4.6, 2.6, (x, y, nx, ny) => P.cloth[ny < -.2 ? 5 : 4]);
  }
  const bootX = lx0 + f.legs - 3;
  const legRow = (y0, y1, far) => {
    for (let y = y0; y <= y1; y++) for (let x = lx0; x < lx0 + f.legs; x++) {
      const boot = x >= bootX, u = (y - y0) / Math.max(1, y1 - y0), c = pick3(boot ? P.leather : pants, u * .9, (boot && x === bootX ? 1 : 0) + (x === lx0 + f.legs - 1 ? -2 : 0) - (far ? 1 : 0));
      s.set(x, y, far ? dark(c, .82) : c);
    }
    const tx = lx0 + f.legs - 2;
    s.rect(tx, y0 - 2, 2, 2, far ? dark(P.leather[2], .82) : P.leather[3]); s.set(tx + 1, y0 - 2, P.leather[1]);
  };
  legRow(top + 1, top + legH, true);
  if (rest || !p.bent) legRow(top + legH + 1, gy, false);
  else {
    const w = legH, hip = [lx0, gy - (w >> 1)], knee = [lx0 + 4, top - 2], ft = [lx0 + 8, gy - (w >> 1)];
    rigLimb(s, [hip, knee, ft], w, (t, k) => pick3(t > f.legs - 3.5 ? P.leather : pants, k / (w - 1) * .9, t > f.legs - 3.5 ? 0 : 0), shade);
  }
  for (let y = top - br; y <= gy; y++) for (let x = tx0; x < lx0; x++) {
    if (y < top && x > tx0 + 7) continue;
    const u = rowU(y), belt = x >= lx0 - 2;
    let c;
    if (belt) c = Math.abs(y - (top + (th >> 1))) < 1 ? P.gold[x === lx0 - 2 ? 4 : 2] : pick3(P.leather, u, x === lx0 - 2 ? 1 : -1);
    else if (o.armor === P.iron && !o.plate) c = P.iron[clamp((u < .25 ? 4 : u < .7 ? 3 : 2) + (((x + y) & 1) ? 1 : -1), 0, 6)];
    else { c = pick3(body, u, (y <= top - br ? 1 : 0) - (x === tx0 ? 1 : 0)); if (o.apron && u > .3 && x > tx0 + 2) c = pick3(P.leather, u, 0); if (o.trim && x === tx0 + 1) c = o.trim[3]; }
    s.set(x, y, c);
  }
  if (o.cape && !rest) for (let x = tx0 - 1; x < lx0 + 4; x++) { s.set(x, gy + 1, o.cape[2]); s.set(x, gy + 2, o.cape[1]); }
  const aw = f.aw, armC = (t, k) => { const hand = t > f.tl - 4.5, bare = o.sleeves === 0 || t > 7; return hand || bare ? skin[clamp(sn - 1 - (k === aw - 1 ? 1 : 0), 0, sn)] : pick3(body, k / aw * .5, 0); };
  const sh0 = [tx0 + 2, gy - (aw >> 1)];
  if (!rest) {
    rigLimb(s, [[tx0 + 2, top + 1], [tx0 - 2, top - 4], [x0 + 1, top - 7]], aw, (t, k) => dark(armC(t, k), .85));
    rigLimb(s, [sh0, [tx0 + 7, gy + 1], [tx0 + 11, gy + 2]], aw, armC, shade);
  }
  for (let y = hTop; y < hTop + headH; y++) for (let x = x0; x < x0 + f.hh; x++) {
    const nx = (x + .5 - x0 - f.hh / 2) / (f.hh / 2), ny = (y + .5 - hTop - headH / 2) / (headH / 2);
    if (nx * nx + ny * ny > 1.08) continue;
    s.set(x, y, skin[clamp((ny < -.4 ? sn : ny < .3 ? sn - 1 : sn - 2) - (nx < -.6 ? 1 : 0), 0, sn)]);
  }
  for (let y = hTop + headH; y <= gy; y++) s.rect(x0 + 2, y, f.hh - 3, 1, skin[sn - 3]);
  const fx = x0 + Math.round(f.hh * .55), ey = hTop + 2;
  s.rect(fx, ey, 2, 1, skin[Math.max(0, sn - 3)]); s.set(fx - 1, ey - 1, noHair ? skin[1] : hair[Math.max(0, hn - 3)]);
  s.set(fx + 2, hTop - 1, skin[sn - 1]); s.set(fx + 2, hTop, skin[sn]);
  s.rect(x0 + f.hh - 2, hTop + 2, 1, 2, skin[Math.max(0, sn - 3)]);
  if (!rest) s.set(x0 + f.hh - 2, hTop + 3, skin[0]);
  s.set(x0 + Math.round(f.hh * .45), hTop + headH - 2, skin[sn - 2]);
  if (!noHair) {
    for (let y = hTop; y < hTop + headH; y++) for (let x = x0 - 1; x < x0 + 3; x++) { const nx = (x + .5 - x0 - f.hh / 2) / (f.hh / 2), ny = (y + .5 - hTop - headH / 2) / (headH / 2); if (nx * nx + ny * ny <= 1.25) s.set(x, y, hair[clamp((ny < -.3 ? hn : ny < .4 ? hn - 1 : hn - 2) - ((x + y) % 4 === 0 ? 1 : 0), 0, hn)]); }
    for (let x = x0 + 1; x < x0 + Math.round(f.hh * .45); x++) s.set(x, hTop, hair[hn - (x & 1)]);
    if (f.longhair || o.longhair) for (let x = x0 - 6; x < x0; x++) { s.set(x, gy - 1, hair[hn - 1 - (x & 1)]); s.set(x, gy, hair[hn - 2]); }
  }
  if (f.beard || o.beard) { const n = f.beard ? 7 : 4; for (let i = 0; i < n; i++) for (let j = 0; j < 4 - (i >> 1) + 1; j++) s.set(x0 + f.hh - 2 + i, hTop + 1 + j, hair[clamp(hn - 1 - (j === 0 ? 0 : 1) - (i % 3 === 2 ? 1 : 0), 0, hn)]); }
  if (f.snout) { s.rect(x0 + f.hh - 1, hTop + 1, 3, 3, skin[sn - 1]); s.set(x0 + f.hh + 1, hTop + 1, P.ink); }
  if (f.ears || f.bigears || f.pointears) for (let k = 0; k < (f.bigears ? 4 : 2); k++) s.rect(x0 + Math.round(f.hh * .45) - (k >> 1), hTop + headH - 1 + k, 2, 1, skin[sn - 2]);
  if (f.tusks) s.rect(x0 + f.hh - 3, hTop - 1, 1, 2, P.bone[5]);
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
  s.outline();
  s.sh = { rx: (L >> 1) + 3, ry: 3.6, dx: 2, dy: 0 };
  s.pts = { head: [x0 + (f.hh >> 1), hTop - 9], mouth: [x0 + f.hh, hTop + 3], body: [tx0 + (f.tl >> 1), top], feet: [] };
  return s;
}
