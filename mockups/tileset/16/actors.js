'use strict';
const FOLK = {
  human: { legs: 4, hw: 3, head: 6, skin: P.skinPale },
  dwarf: { legs: 2, hw: 4, head: 6, skin: P.skinTan, beard: 1 },
  elf: { legs: 5, hw: 3, head: 6, skin: P.skinPale, ears: 1, slim: 1, longhair: 1 },
  orc: { legs: 4, hw: 4, head: 7, skin: P.skinOrc, tusks: 1, bald: 1 },
  goblin: { legs: 2, hw: 2, head: 6, skin: P.skinGob, bigears: 1, bald: 1, eyes: P.gold[4] },
  kobold: { legs: 2, hw: 2, head: 5, skin: P.furRust, snout: 1, bald: 1, eyes: P.gold[4], tail: 1 },
  gnoll: { legs: 5, hw: 3, head: 6, skin: P.furTan, snout: 1, bald: 1, pointears: 1, eyes: P.gold[4] },
};
function mkPawn(o) {
  const f = FOLK[o.race || 'human'], s = new Spr(22, 26, 10, 23), cx = 10, base = 23;
  const skin = o.skin || f.skin, sn = skin.length - 1, tunic = o.tunic || P.cloth, pants = o.pants || P.leather, hair = o.hair || P.furBrown;
  const legTop = base - f.legs, tTop = legTop - 6, hTop = tTop - f.head + 1, hw = f.hw;
  for (let j = 0; j < f.legs; j++) {
    const y = base - j, boot = j === 0;
    const L = boot ? P.leather : pants;
    s.set(cx - 2, y, L[boot ? 2 : 3]); s.set(cx - 1, y, L[boot ? 1 : 2]); s.set(cx + 1, y, L[boot ? 1 : 2]); s.set(cx + 2, y, L[boot ? 0 : 1]);
    if (hw > 3) { s.set(cx - 3, y, L[boot ? 2 : 3]); s.set(cx + 3 - 1 + 1, y, L[boot ? 0 : 1]); }
    else if (j > 0 || true) s.set(cx, y, hw > 2 ? P.ink : L[1]);
  }
  for (let j = 0; j < 6; j++) for (let i = -hw; i < hw; i++) {
    const y = tTop + j, u = (i + hw) / (2 * hw - 1);
    let k = u < .25 ? 4 : u < .7 ? 3 : 2;
    if (j === 5) { s.set(cx + i, y, o.armor ? P.iron[2] : P.leather[i === 0 ? 5 : 1]); continue; }
    if (o.armor) { s.set(cx + i, y, o.armor[clamp(k + (j === 0 ? 1 : 0) - ((i + j) % 3 === 0 ? 1 : 0), 0, o.armor.length - 1)]); continue; }
    if (o.apron && j > 1 && Math.abs(i + .5) < hw - 1) { s.set(cx + i, y, P.leather[k]); continue; }
    s.set(cx + i, y, tunic[clamp(k - (j === 4 ? 1 : 0), 0, tunic.length - 1)]);
  }
  const armL = cx - hw - 1, armR = cx + hw;
  for (let j = 0; j < 5; j++) {
    const y = tTop + j, c = j < (o.sleeves === 0 ? 0 : 3) ? (o.armor || tunic) : skin;
    s.set(armL, y, c === skin ? skin[sn - 1] : c[3]); s.set(armR, y, c === skin ? skin[sn - 2] : c[1]);
    if (f.hw > 3) { s.set(armL - 0, y, c === skin ? skin[sn - 1] : c[3]); }
  }
  const hx0 = cx - 3, hW = f.head >= 7 ? 7 : 6;
  for (let j = 0; j < f.head; j++) for (let i = 0; i < hW; i++) {
    const corner = (j === 0 || j === f.head - 1) && (i === 0 || i === hW - 1);
    if (corner) continue;
    s.set(hx0 + i, hTop + j, skin[i === 0 ? sn : i >= hW - 1 ? sn - 2 : sn - 1]);
  }
  const eyeY = hTop + Math.floor(f.head / 2);
  s.set(hx0 + 1, eyeY, f.eyes || P.ink, f.eyes ? 200 : 0); s.set(hx0 + hW - 2, eyeY, f.eyes || P.ink, f.eyes ? 200 : 0);
  if (f.snout) { s.rect(hx0 + 2, eyeY + 1, hW - 4, 2, skin[sn]); s.set(hx0 + 2, eyeY + 2, P.ink); s.set(cx, eyeY + 3, skin[sn - 1]); }
  if (!f.bald && !o.bald) {
    const hn = hair.length - 1;
    for (let i = 0; i < hW; i++) { if (i > 0 && i < hW - 1) s.set(hx0 + i, hTop - 1, hair[hn - 1]); s.set(hx0 + i, hTop, hair[i < 2 ? hn : hn - 1]); s.set(hx0 + i, hTop + 1, hair[i > hW - 3 ? hn - 2 : hn - 1]); }
    s.set(hx0, hTop + 2, hair[hn - 1]); s.set(hx0 + hW - 1, hTop + 2, hair[hn - 2]);
    if (f.longhair || o.longhair) for (let j = 3; j < 8; j++) { s.set(hx0 - (j > 4 ? 1 : 0), hTop + j, hair[hn - 1]); s.set(hx0 + hW - 1 + (j > 4 ? 1 : 0), hTop + j, hair[hn - 2]); }
  }
  if (f.beard) { const hn = hair.length - 1; for (let j = 0; j < 5; j++) for (let i = 1 + (j > 3 ? 1 : 0); i < hW - 1 - (j > 3 ? 1 : 0); i++) s.set(hx0 + i, eyeY + 1 + j, hair[i < 3 ? hn - 1 : hn - 2]); s.set(cx - 1, eyeY + 1, skin[sn]); }
  if (f.ears) { s.set(hx0 - 1, eyeY - 1, skin[sn]); s.set(hx0 + hW, eyeY - 1, skin[sn - 2]); s.set(hx0 - 1, eyeY - 2, skin[sn - 1]); s.set(hx0 + hW, eyeY - 2, skin[sn - 2]); }
  if (f.bigears) { s.rect(hx0 - 2, eyeY - 1, 2, 1, skin[sn]); s.rect(hx0 + hW, eyeY - 1, 2, 1, skin[sn - 2]); s.set(hx0 - 3, eyeY - 2, skin[sn - 1]); s.set(hx0 + hW + 2, eyeY - 2, skin[sn - 2]); }
  if (f.pointears) { s.set(hx0, hTop - 1, skin[sn - 1]); s.set(hx0 + hW - 1, hTop - 1, skin[sn - 2]); s.set(hx0, hTop - 2, skin[sn - 2]); s.set(hx0 + hW - 1, hTop - 2, skin[sn - 3]); }
  if (f.tusks) { s.set(hx0 + 1, hTop + f.head - 2, P.bone[5]); s.set(hx0 + hW - 2, hTop + f.head - 2, P.bone[5]); s.rect(hx0 + 1, eyeY - 1, hW - 2, 1, skin[1]); }
  if (f.tail) { s.set(cx + hw + 1, legTop, skin[2]); s.set(cx + hw + 2, legTop + 1, skin[2]); s.set(cx + hw + 3, legTop + 1, skin[1]); }
  const hat = o.hat;
  if (hat === 'straw') { s.rect(hx0 - 2, hTop, hW + 4, 1, P.thatch[4]); s.rect(hx0 - 1, hTop + 1, hW + 2, 1, P.thatch[2]); s.rect(hx0 + 1, hTop - 2, hW - 2, 2, P.thatch[5]); s.rect(hx0 + 1, hTop - 1, hW - 2, 1, P.red[2]); }
  if (hat === 'hood') { const c = o.hood || tunic, n = c.length - 1; for (let i = 0; i < hW; i++) { s.set(hx0 + i, hTop - 1, c[n - 1]); s.set(hx0 + i, hTop, c[i < 2 ? n : n - 1]); } for (let j = 1; j < f.head + 1; j++) { s.set(hx0 - 1, hTop + j, c[n - 1]); s.set(hx0 + hW, hTop + j, c[n - 3]); s.set(hx0, hTop + j, c[n - 2]); s.set(hx0 + hW - 1, hTop + j, c[n - 3]); } }
  if (hat === 'helm') { for (let i = 0; i < hW; i++) { s.set(hx0 + i, hTop - 1, P.iron[i === 1 ? 6 : 4]); s.set(hx0 + i, hTop, P.iron[i < 2 ? 5 : 3]); s.set(hx0 + i, hTop + 1, P.iron[i < 2 ? 4 : 2]); } s.set(cx, hTop + 2, P.iron[4]); s.set(cx, hTop + 3, P.iron[3]); if (o.crest) { s.rect(cx - 1, hTop - 3, 2, 2, o.crest[3]); } }
  if (hat === 'crown') { s.rect(hx0, hTop - 1, hW, 1, P.gold[3]); s.set(hx0, hTop - 2, P.gold[4]); s.set(cx, hTop - 2, P.gold[4]); s.set(hx0 + hW - 1, hTop - 2, P.gold[3]); }
  const hx = armR + 1, hy = tTop + 4, t = o.tool;
  if (t === 'axe') { s.line(hx, hy + 2, hx + 2, hy - 8, P.wood[4]); s.rect(hx + 1, hy - 9, 3, 3, P.iron[5]); s.rect(hx + 3, hy - 9, 1, 3, P.iron[6]); }
  if (t === 'pick') { s.line(hx, hy + 2, hx + 2, hy - 8, P.wood[4]); s.line(hx - 1, hy - 7, hx + 5, hy - 9, P.iron[5]); s.set(hx + 5, hy - 8, P.iron[3]); }
  if (t === 'hoe') { s.line(hx, hy + 6, hx + 1, hy - 8, P.wood[4]); s.rect(hx + 1, hy - 8, 3, 1, P.iron[5]); s.set(hx + 3, hy - 7, P.iron[3]); }
  if (t === 'hammer') { s.line(hx, hy + 1, hx + 1, hy - 5, P.wood[4]); s.rect(hx - 1, hy - 7, 4, 2, P.iron[5]); }
  if (t === 'spear') { s.line(hx, base, hx, hTop - 4, P.wood[4]); s.set(hx, hTop - 5, P.iron[6]); s.set(hx, hTop - 6, P.iron[5]); s.set(hx - 1, hTop - 4, P.iron[4]); s.set(hx + 1, hTop - 4, P.iron[3]); }
  if (t === 'sword') { s.line(hx, hy, hx + 3, hy - 8, P.iron[6]); s.set(hx - 1, hy, P.gold[3]); s.set(hx + 1, hy, P.gold[2]); s.set(hx, hy + 1, P.leather[2]); }
  if (t === 'club') { s.line(hx, hy + 1, hx + 2, hy - 6, P.wood[3]); s.rect(hx + 1, hy - 8, 3, 3, P.wood[4]); s.set(hx + 3, hy - 8, P.bone[5]); }
  if (t === 'bow') { for (let j = -5; j <= 5; j++) s.set(hx + 2 - Math.round(Math.abs(j) * Math.abs(j) / 12), hy - 2 + j, P.wood[4]); s.line(hx, hy - 7, hx, hy + 3, P.cloth[4]); }
  if (t === 'torch') { s.line(hx, hy + 1, hx, hy - 4, P.wood[3]); s.rect(hx - 1, hy - 7, 3, 3, P.fire[2], 255); s.set(hx, hy - 8, P.fire[4], 255); s.set(hx, hy - 6, P.fire[4], 255); s.emit = { dx: hx - cx, dy: -16, rad: 46, col: [1, .6, .24], flicker: 1 }; }
  if (t === 'staff') { s.line(hx, base, hx, hTop - 2, P.wood[3]); s.rect(hx - 1, hTop - 5, 3, 3, P.mana[3], 255); s.set(hx, hTop - 4, P.mana[5], 255); s.emit = { dx: hx - cx, dy: -20, rad: 30, col: [.4, .8, 1] }; }
  if (t === 'basket') { s.rect(hx - 1, hy, 4, 3, P.wicker[3]); s.rect(hx - 1, hy, 4, 1, P.red[3]); s.set(hx - 1, hy + 1, P.wicker[4]); }
  if (t === 'log') for (let i = -8; i <= 8; i++) for (let j = 0; j < 3; j++) { const x = cx + i, y = tTop - 1 + j; if (!s.get(x, y)) s.set(x, y, i === -8 ? P.plank[j === 1 ? 5 : 3] : P.wood[[5, 3, 1][j]]); }
  if (o.shield) { s.disc(armL - .5, tTop + 3, 2.6, 3.2, (x, y, nx) => o.shield[nx < -.2 ? 4 : nx < .4 ? 3 : 1]); s.set(armL - 1, tTop + 3, P.iron[6]); }
  if (o.cape) { const c = o.cape; for (let j = 0; j < 8; j++) { s.set(armL, tTop + j, c[3]); s.set(armR, tTop + j, c[1]); } }
  s.outline();
  s.sh = { rx: 4.5, ry: 1.8, dx: 2, dy: 0 };
  return s;
}

function quad(o) {
  const s = new Spr(40, 30, 18, 27), cx = 18, gy = 27, L = o.L, Hb = o.Hb, fur = o.fur, n = fur.length - 1;
  const cy = gy - o.leg - Hb + 1, legw = o.legw || 2, bo = { n: o.shag || .22, ns: .8, seed: 3, d: .5 };
  const legX = [cx - L + 1.5, cx + L - 2.5 - legw + 2];
  for (const lx of legX) s.rect(Math.round(lx + 1.5), gy - o.leg - 1, legw, o.leg + 2, fur[1]);
  if (o.tail === 'bushy') { s.ball(cx - L - 2, cy + 1.5, 3.4, 1.8, 0, fur, bo); s.ball(cx - L - 4.4, cy + 2.6, 2, 1.5, 0, fur, bo); }
  if (o.tail === 'long') s.line(cx - L, cy, cx - L - 6, cy + Hb + 1, fur[n - 2]);
  if (o.tail === 'whip') { s.line(cx - L, cy - 1, cx - L - 4, cy - 3, fur[n - 2]); s.line(cx - L - 4, cy - 3, cx - L - 7, cy, fur[n - 3]); }
  if (o.tail === 'short') { s.set(cx - L - 1, cy - 1, fur[n - 1]); s.set(cx - L - 1, cy, fur[n - 2]); }
  if (o.tail === 'tuft') { s.line(cx - L, cy - 1, cx - L - 2, cy + Hb + 1, fur[n - 2]); s.set(cx - L - 2, cy + Hb + 2, fur[0]); s.set(cx - L - 3, cy + Hb + 2, fur[1]); }
  if (o.tail === 'fat') for (let i = 0; i < L + 3; i++) { const yy = cy + 1 + Math.sin(i * .5) * 1.2; s.set(cx - L - i, yy, fur[n - 1]); if (i < L) s.set(cx - L - i, yy + 1, fur[n - 3]); }
  s.ball(cx, cy, L, Hb, 0, fur, bo);
  s.ball(cx + L * .5, cy - (o.hump || 0) - .3, L * .55, Hb * 1.06 + (o.hump || 0), .5, fur, bo);
  s.ball(cx - L * .55, cy + .2, L * .5, Hb * .98, .3, fur, bo);
  if (o.belly) for (let y = Math.round(cy + Hb * .35); y <= cy + Hb; y++) for (let x = cx - L; x <= cx + L; x++) { const c = s.get(x, y); if (c && fur.indexOf(c) >= 0) s.set(x, y, o.belly[clamp(fur.indexOf(c) + 1, 0, o.belly.length - 1)]); }
  for (const lx of legX) { const x = Math.round(lx); s.rect(x, gy - o.leg, legw, o.leg + 1, fur[n - 2]); s.rect(x, gy - o.leg, 1, o.leg + 1, fur[n - 1]); s.set(x + legw, gy, o.hoof || fur[n - 2]); if (o.hoof) s.rect(x, gy, legw, 1, o.hoof); }
  const hr = o.head, hx = cx + L + hr * .35 + (o.neck || 0), hy = cy - (o.up || 0);
  if (o.up > 1.5) for (let k = 0; k <= 6; k++) s.ball(mix(cx + L * .7, hx, k / 6), mix(cy - Hb * .3, hy + 1, k / 6), o.neckw || 1.9, o.neckw || 1.9, 1, fur, bo);
  if (o.mane) for (let k = 0; k < 7; k++) s.set(cx + L * .3 + k, cy - Hb - (o.hump || 0) - 1 + (k > 4 ? 1 : 0), o.mane[2 + (k & 1)]);
  s.ball(hx, hy, hr, hr * .92, 2, fur, bo);
  const sl = o.snout || 0, sx = hx + hr * .7 + sl * .5;
  if (sl) s.ball(sx, hy + hr * .25, sl * .5 + .9, o.snoutH || 1.5, 2.5, o.muzzle || fur, { d: .4, bias: .08 });
  const tip = Math.round(sx + sl * .5 + .4);
  if (!o.beak) s.set(tip, Math.round(hy + hr * .25 - .5), P.ink);
  s.set(Math.round(hx + hr * .25), Math.round(hy - hr * .25), o.eye || P.ink, o.eye ? 220 : 0);
  const ex = Math.round(hx - hr * .3), ey = Math.round(hy - hr);
  if (o.ears === 'point') { s.set(ex, ey, fur[n - 1]); s.set(ex, ey - 1, fur[n - 2]); s.set(ex + 2, ey, fur[n - 2]); s.set(ex + 2, ey - 1, fur[n - 3]); }
  if (o.ears === 'round') { s.rect(ex - 1, ey, 2, 1, fur[n - 1]); s.rect(ex + 2, ey, 2, 1, fur[n - 3]); }
  if (o.ears === 'long') { s.line(ex, ey, ex - 1, ey - 4, fur[n - 1]); s.line(ex + 1, ey, ex + 1, ey - 4, fur[n - 3]); }
  if (o.ears === 'flap') { s.rect(ex - 2, ey + 1, 3, 4, fur[n - 3]); s.rect(ex - 2, ey + 1, 1, 4, fur[n - 2]); }
  if (o.extra) o.extra(s, { cx, cy, hx, hy, hr, tip, gy, L, Hb, ex, ey });
  s.outline();
  s.sh = { rx: L + 2, ry: Math.max(2, Hb * .55), dx: 1, dy: 0 };
  return s;
}
const antlers = (c, big) => (s, g) => { for (const d of [0, 2]) { const x = g.ex + d, y = g.ey; s.line(x, y, x - 2 + d, y - 4, c[4 - d]); s.line(x - 1 + d, y - 3, x + 2, y - 5 - (big ? 2 : 0), c[5 - d]); if (big) { s.line(x - 2 + d, y - 4, x - 3 + d, y - 7, c[4]); s.line(x, y - 4, x + 3, y - 4, c[3]); } } };
const BEASTS = {
  wolf: { name: 'Grey Wolf', o: { L: 6, Hb: 3, leg: 4, head: 2.6, up: 1.5, snout: 2.6, ears: 'point', tail: 'bushy', fur: P.furGrey, belly: P.furWhite } },
  direwolf: { name: 'Dire Wolf', o: { L: 8, Hb: 4, leg: 5, head: 3.2, up: 2, snout: 3, ears: 'point', tail: 'bushy', fur: P.furDark, mane: P.furGrey, eye: P.fire[3], shag: .4 } },
  frostfang: { name: 'Frost-Fang', o: { L: 7.5, Hb: 3.8, leg: 5, head: 3, up: 2, snout: 3, ears: 'point', tail: 'bushy', fur: P.furWhite, eye: P.mana[4], shag: .3 } },
  jackal: { name: 'Golden Jackal', o: { L: 5, Hb: 2.4, leg: 4, head: 2.2, up: 1.5, snout: 2.4, ears: 'point', tail: 'bushy', fur: P.furTan } },
  bear: { name: 'Brown Bear', o: { L: 7.5, Hb: 5, leg: 3, legw: 3, head: 3.4, up: .5, snout: 2.2, ears: 'round', tail: 'short', fur: P.furBrown, muzzle: P.furTan, hump: 1, shag: .4 } },
  cavebear: { name: 'Cave Bear', o: { L: 9.5, Hb: 6.4, leg: 4, legw: 3, head: 4, up: .5, snout: 2.6, ears: 'round', tail: 'short', fur: P.furDark, muzzle: P.furBrown, hump: 1.6, shag: .5 } },
  boar: { name: 'Wild Boar', o: { L: 6, Hb: 3.8, leg: 3, head: 3, up: -.5, snout: 3, snoutH: 1.8, ears: 'point', tail: 'short', fur: P.furDark, mane: P.furBrown, hump: .8, shag: .5, extra: (s, g) => { s.set(g.tip - 1, g.hy + 2, P.bone[5]); s.set(g.tip - 1, g.hy + 1, P.bone[5]); } } },
  deer: { name: 'Red Deer', o: { L: 6, Hb: 3, leg: 6, legw: 1, head: 2.2, up: 5, neck: 1, snout: 2.2, ears: 'none', tail: 'short', fur: P.furTan, belly: P.cloth, hoof: P.ink, extra: antlers(P.bone, 0) } },
  elk: { name: 'Woodland Elk', o: { L: 7.5, Hb: 3.8, leg: 7, legw: 2, head: 2.6, up: 6, neck: 1, neckw: 2.4, snout: 2.8, ears: 'none', tail: 'short', fur: P.furBrown, mane: P.furDark, hoof: P.ink, extra: antlers(P.bone, 1) } },
  fawn: { name: 'Fawn', o: { L: 3.6, Hb: 2, leg: 4, legw: 1, head: 1.7, up: 3, snout: 1.4, ears: 'point', tail: 'short', fur: P.furTan, belly: P.cloth, extra: (s, g) => { s.set(g.cx - 1, g.cy - 1, P.cloth[5]); s.set(g.cx + 2, g.cy, P.cloth[5]); } } },
  rabbit: { name: 'Cottontail', o: { L: 3, Hb: 2.3, leg: 1, head: 1.8, up: 1.2, snout: 0, ears: 'long', tail: 'none', fur: P.furTan, extra: (s, g) => { s.set(g.cx - 4, g.cy, P.cloth[5]); s.set(g.cx - 4, g.cy + 1, P.cloth[4]); } } },
  rat: { name: 'Plague Rat', o: { L: 3.6, Hb: 2, leg: 1, head: 1.7, up: 0, snout: 1.8, ears: 'round', tail: 'long', fur: P.furDark, eye: P.red[4] } },
  ox: { name: 'Wild Ox', o: { L: 8.5, Hb: 4.8, leg: 4, legw: 2, head: 3.2, up: 0, snout: 2.4, snoutH: 1.8, ears: 'none', tail: 'tuft', fur: P.furBrown, hump: 1.2, hoof: P.ink, extra: (s, g) => { s.line(g.ex, g.ey + 1, g.ex - 1, g.ey - 2, P.bone[5]); s.line(g.ex + 3, g.ey + 1, g.ex + 5, g.ey - 2, P.bone[4]); } } },
  packox: { name: 'Pack Ox', o: { L: 8.5, Hb: 4.8, leg: 4, legw: 2, head: 3.2, up: 0, snout: 2.4, snoutH: 1.8, ears: 'none', tail: 'tuft', fur: P.furTan, hump: .6, hoof: P.ink, extra: (s, g) => { s.line(g.ex, g.ey + 1, g.ex - 1, g.ey - 2, P.bone[5]); s.line(g.ex + 3, g.ey + 1, g.ex + 5, g.ey - 2, P.bone[4]); s.rect(g.cx - 5, g.cy - g.Hb - 3, 9, 4, P.cloth[3]); s.rect(g.cx - 5, g.cy - g.Hb - 3, 9, 1, P.cloth[5]); s.rect(g.cx - 1, g.cy - g.Hb + 1, 1, 7, P.leather[2]); s.rect(g.cx - 6, g.cy - g.Hb - 1, 2, 3, P.red[2]); } } },
  mammoth: { name: 'Bull Mammoth', o: { L: 12, Hb: 8.5, leg: 6, legw: 4, head: 5.5, up: 2, snout: 0, ears: 'flap', tail: 'tuft', fur: P.furRust, hump: 2.5, shag: .6, extra: (s, g) => { for (let j = 0; j < 12; j++) { const x = g.hx + 4 + Math.sin(j * .35) * 1.6; s.set(x, g.hy + 2 + j, P.furRust[3]); s.set(x + 1, g.hy + 2 + j, P.furRust[1]); } s.line(g.hx + 2, g.hy + 4, g.hx + 9, g.hy + 9, P.bone[5]); s.line(g.hx + 9, g.hy + 9, g.hx + 11, g.hy + 5, P.bone[5]); s.line(g.hx + 2, g.hy + 5, g.hx + 8, g.hy + 10, P.bone[3]); } } },
  sabre: { name: 'Sabretooth Cat', o: { L: 7, Hb: 3.4, leg: 4, head: 3, up: 1.5, snout: 1.6, ears: 'round', tail: 'short', fur: P.savanna, belly: P.cloth, extra: (s, g) => { s.rect(g.tip - 1, g.hy + 2, 1, 3, P.bone[5]); for (let k = 0; k < 4; k++) s.line(g.cx - 4 + k * 3, g.cy - 3, g.cx - 5 + k * 3, g.cy, P.leather[1]); } } },
  bighorn: { name: 'Bighorn', o: { L: 5.4, Hb: 3.2, leg: 4, head: 2.4, up: 3, snout: 1.8, ears: 'none', tail: 'short', fur: P.cloth, hoof: P.ink, shag: .4, extra: (s, g) => { for (let a = 0; a < 9; a++) { const t = a / 9 * 4.6 - 1.6; s.set(g.hx - 1 + Math.cos(t) * 2.4, g.hy - 1 + Math.sin(t) * 2.4, P.wicker[2 + (a % 3)]); } } } },
  worg: { name: 'Grey Worg', o: { L: 8, Hb: 4.2, leg: 5, head: 3.4, up: 1, snout: 3.2, ears: 'point', tail: 'bushy', fur: P.furGrey, mane: P.furDark, eye: P.red[4], hump: 1.4, shag: .5 } },
  salamander: { name: 'Cave Salamander', o: { L: 6, Hb: 1.9, leg: 1, head: 2, up: 0, snout: 1.4, ears: 'none', tail: 'fat', fur: P.ember, eye: P.gold[4] } },
  lurker: { name: 'Bog Lurker', o: { L: 9, Hb: 2.2, leg: 1, legw: 3, head: 2.2, up: 0, snout: 5, snoutH: 1.4, ears: 'none', tail: 'fat', fur: P.mossSwamp, belly: P.cloth, eye: P.gold[4], shag: .6, extra: (s, g) => { for (let k = 0; k < 7; k++) s.set(g.cx - 6 + k * 2, g.cy - g.Hb - .5, P.mossSwamp[4]); for (let k = 0; k < 4; k++) s.set(g.tip - 1 - k, g.hy + 2, P.bone[5]); } } },
  hippogriff: { name: 'Grey Hippogriff', o: { L: 7.5, Hb: 3.8, leg: 5, head: 2.8, up: 5, neck: 1, neckw: 2.2, snout: 0, ears: 'none', tail: 'tuft', fur: P.furGrey, hoof: P.ink, beak: 1, extra: (s, g) => { s.rect(g.hx + 2, g.hy, 3, 1, P.gold[3]); s.set(g.hx + 4, g.hy + 1, P.gold[2]); for (let k = 0; k < 9; k++) { s.line(g.cx + 3 - k, g.cy - 2, g.cx - 2 - k * 1.2, g.cy - 9 + k * .6, P.furWhite[2 + (k % 3)]); } s.set(g.ex, g.ey - 1, P.furWhite[4]); s.set(g.ex - 1, g.ey - 2, P.furWhite[3]); } } },
  owlbear: { name: 'Tawny Owlbear', o: { L: 7.5, Hb: 5.4, leg: 3, legw: 3, head: 3.8, up: 2, snout: 0, ears: 'point', tail: 'none', fur: P.furTan, hump: 1.5, shag: .7, beak: 1, eye: P.gold[4], extra: (s, g) => { s.rect(g.hx + 3, g.hy, 2, 2, P.gold[3]); s.set(g.hx + 4, g.hy + 2, P.gold[1]); s.disc(g.hx + 1, g.hy - 1, 1.6, 1.6, P.cloth[5]); s.set(g.hx + 1, g.hy - 1, P.ink); for (let k = 0; k < 8; k++) s.set(g.cx - 6 + k * 2, g.cy + (k & 1), P.furBrown[2]); } } },
};
function mkBeast(kind) {
  if (BEASTS[kind]) return quad(BEASTS[kind].o);
  const s = new Spr(30, 26, 15, 23);
  if (kind === 'fowl' || kind === 'hoarfowl') {
    const f = kind === 'fowl' ? P.furRust : P.furWhite, k = kind === 'fowl' ? 1 : 1.5;
    s.line(14, 23, 14, 20, P.gold[2]); s.line(17, 23, 17, 20, P.gold[1]); s.set(15, 23, P.gold[2]); s.set(18, 23, P.gold[1]);
    s.ball(15, 23 - 3 - 2.6 * k, 4 * k, 3 * k, 0, f, { n: .4, ns: 1 }); s.ball(19 + k, 23 - 7 * k - 1, 1.9 * k, 1.9 * k, 1, f, { d: .4 });
    for (let i = 0; i < 4; i++) s.line(11 - k, 23 - 5 * k, 8 - k * 2, 23 - 8 * k - i, [P.furDark, P.green, P.furDark, P.blue][i][2]);
    s.set(21 + k * 2, 23 - 7 * k - 1, P.gold[4]); s.set(19 + k, 23 - 9 * k - 1, P.red[3]); s.set(20 + k, 23 - 7 * k - 2, P.ink);
    s.sh = { rx: 5, ry: 2, dx: 1, dy: 0 };
  } else if (kind === 'spider' || kind === 'broodmother') {
    const k = kind === 'spider' ? 1 : 1.6, c = P.chitin, by = 23 - 4 * k;
    for (let i = 0; i < 4; i++) { const a = (i - 1.5) * .5, kx = 15 + (i - 1.5) * 3.4 * k; for (const sd of [-1, 1]) { const x0 = 15 + sd * 2 * k, x1 = x0 + sd * (3 + Math.abs(a) * 3) * k, x2 = x1 + sd * 2.4 * k; s.line(x0 + (i - 1.5) * k, by, x1 + (i - 1.5) * k, by - 4 * k, c[sd < 0 ? 3 : 2]); s.line(x1 + (i - 1.5) * k, by - 4 * k, x2 + (i - 1.5) * 1.6 * k, 23, c[sd < 0 ? 4 : 2]); } }
    s.ball(12, by, 4.6 * k, 3.6 * k, 1, c, { n: .3, ns: 1 }); s.ball(18 + k, by + .6, 2.6 * k, 2.2 * k, 2, c, { d: .4 });
    s.set(19 + k * 2, by, P.red[4], 255); s.set(19 + k * 2, by + 1, P.red[4], 255); s.set(17 + k * 2, by - 1, P.red[4], 255); s.set(11, by - 1, P.red[3]); s.set(13, by + 1, P.red[2]);
    s.sh = { rx: 8 * k, ry: 2.6 * k, dx: 1, dy: 0 };
  } else if (kind === 'adder') {
    for (let i = 0; i < 20; i++) { const x = 5 + i, y = 21 + Math.sin(i * .7) * 1.6 - (i > 15 ? (i - 15) * 1.4 : 0); s.set(x, y, P.mossSwamp[i % 3 === 0 ? 1 : 4]); s.set(x, y + 1, P.mossSwamp[2]); }
    s.rect(24, 13, 3, 2, P.mossSwamp[4]); s.set(26, 13, P.gold[4], 200); s.set(27, 14, P.red[4]);
    s.sh = { rx: 9, ry: 1.6, dx: 1, dy: 0 };
  } else if (kind === 'ooze') {
    s.ball(15, 19, 8.5, 6, 0, P.ooze, { n: .3, ns: .5, d: .5, bias: .05 }); for (let x = 0; x < 30; x++) { s.set(x, 24, null); s.set(x, 25, null); }
    for (let i = 0; i < s.e.length; i++) if (s.c[i]) s.e[i] = 80;
    s.set(11, 16, P.ooze[5], 220); s.set(12, 15, P.ooze[5], 220); s.set(18, 19, P.ooze[0]); s.set(14, 20, P.ooze[0]); s.set(20, 17, P.bone[5]); s.set(21, 18, P.bone[3]);
    s.emit = { dx: 0, dy: -4, rad: 20, col: [.5, 1, .3] }; s.sh = { rx: 9, ry: 2.6, dx: 1, dy: 0 };
  } else if (kind === 'shade') {
    const g = P.ghost;
    for (let j = 0; j < 17; j++) { const w = j < 5 ? 2.6 + j * .3 : 3.6 + (j - 5) * .22; for (let x = Math.ceil(15 - w); x <= 15 + w; x++) { if (j > 13 && hash(x, j, 3) > .5) continue; s.set(x, 6 + j, g[clamp(4 - Math.floor((x - 15 + w) / (2 * w) * 3.5) - (j > 11 ? 1 : 0), 0, 4)], 110); } }
    s.rect(13, 9, 5, 3, P.ink); s.set(14, 10, P.mana[5], 255); s.set(16, 10, P.mana[5], 255);
    s.line(11, 14, 7, 17, g[3], 110); s.line(19, 14, 23, 16, g[2], 110);
    s.emit = { dx: 0, dy: -10, rad: 26, col: [.5, .7, 1] };
  } else if (kind === 'croaker') {
    s.ball(15, 19.5, 5, 3.6, 0, P.mossSwamp, { n: .4, ns: 1 }); s.ball(18.5, 17, 2.6, 2.2, 1, P.mossSwamp, { d: .4 });
    s.set(19, 15, P.gold[4]); s.set(19, 16, P.ink); s.rect(9, 21, 4, 2, P.mossSwamp[2]); s.rect(8, 23, 3, 1, P.mossSwamp[3]); s.rect(17, 21, 2, 3, P.mossSwamp[3]); s.rect(17, 20, 4, 1, P.cloth[4]);
    s.sh = { rx: 6, ry: 2, dx: 1, dy: 0 };
  } else if (kind === 'stirge') {
    s.ball(15, 12, 2.6, 2, 0, P.furRust, { d: .4 }); s.line(17, 12, 21, 14, P.ink); s.set(16, 11, P.red[4], 200);
    for (let k = 0; k < 5; k++) { s.line(14, 11, 9 - k * .4, 6 + k * 1.4, P.red[1 + (k % 3)]); s.line(15, 11, 19 + k * .3, 5 + k, P.red[1 + (k % 3)]); }
    s.sh = { rx: 3, ry: 1.2, dx: 1, dy: 11 };
  } else if (kind === 'harpy') {
    const p = mkPawn({ race: 'human', skin: P.skinGrey, tunic: P.furDark, pants: P.furGrey, hair: P.furDark, longhair: 1, sleeves: 0 });
    for (let k = 0; k < 7; k++) { p.line(7, 12, 1, 6 + k * 1.6, P.furGrey[2 + (k % 3)]); p.line(13, 12, 19, 6 + k * 1.6, P.furGrey[1 + (k % 3)]); }
    p.set(8, 23, P.gold[3]); p.set(12, 23, P.gold[2]); p.outline(); return p;
  }
  s.outline();
  return s;
}
const beast = (kind, flip) => cached('a' + kind + (flip ? 'f' : ''), () => { const s = mkBeast(kind); return flip ? s.flip() : s; });
const OTHER = { fowl: 'Junglefowl', hoarfowl: 'Snow Hoarfowl', spider: 'Bramble Weaver', broodmother: 'Broodmother', adder: 'Fen Adder', ooze: 'Bog Ooze', shade: 'Grave Shade', croaker: 'Bog Croaker', stirge: 'Fen Stirge', harpy: 'Harpy Matron' };
const PAWNS = {
  woodcutter: { name: 'Woodcutter', o: { race: 'human', tunic: P.green, hair: P.furBrown, tool: 'axe' } },
  farmer: { name: 'Farmer', o: { race: 'human', tunic: P.cloth, pants: P.blue, hair: P.hay, hat: 'straw', tool: 'hoe', skin: P.skinTan } },
  smith: { name: 'Smith', o: { race: 'dwarf', tunic: P.furDark, hair: P.fallOrange, apron: 1, tool: 'hammer', sleeves: 0 } },
  miner: { name: 'Miner', o: { race: 'dwarf', tunic: P.blue, hair: P.furGrey, tool: 'pick', hat: 'helm' } },
  hunter: { name: 'Hunter', o: { race: 'elf', tunic: P.oak, pants: P.leather, hair: P.hay, tool: 'bow', hat: 'hood' } },
  mage: { name: 'Attuner', o: { race: 'elf', tunic: P.purple, pants: P.purple, hair: P.furWhite, tool: 'staff', cape: P.purple } },
  guard: { name: 'Guard', o: { race: 'human', armor: P.iron, pants: P.furDark, hair: P.furDark, hat: 'helm', tool: 'spear', shield: P.red, crest: P.red } },
  hauler: { name: 'Hauler', o: { race: 'orc', tunic: P.leather, pants: P.furDark, tool: 'log', sleeves: 0 } },
  cook: { name: 'Cook', o: { race: 'human', tunic: P.cloth, apron: 1, hair: P.furDark, tool: 'basket', skin: P.skinDark } },
  weaver: { name: 'Weaver', o: { race: 'human', tunic: P.red, pants: P.cloth, hair: P.fallOrange, longhair: 1 } },
  watch: { name: 'Night watch', o: { race: 'human', tunic: P.blue, pants: P.furDark, hair: P.furBrown, hat: 'hood', tool: 'torch', cape: P.blue } },
  trader: { name: 'Trader', o: { race: 'human', tunic: P.gold, pants: P.purple, hair: P.furDark, hat: 'hood', hood: P.purple, cape: P.purple, skin: P.skinDark } },
  goblin: { name: 'Goblin Raider', o: { race: 'goblin', tunic: P.leather, pants: P.furDark, tool: 'club', sleeves: 0 } },
  gobboss: { name: 'Goblin Boss', o: { race: 'goblin', armor: P.copper, pants: P.furDark, tool: 'sword', hat: 'crown', shield: P.furDark } },
  orc: { name: 'Orc Reaver', o: { race: 'orc', armor: P.furDark, pants: P.leather, tool: 'axe', sleeves: 0 } },
  warlord: { name: 'Orc Warlord', o: { race: 'orc', armor: P.iron, pants: P.furDark, tool: 'sword', hat: 'helm', crest: P.red, shield: P.red, cape: P.red } },
  kobold: { name: 'Cave Kobold', o: { race: 'kobold', tunic: P.leather, pants: P.furRust, tool: 'spear', sleeves: 0 } },
  gnoll: { name: 'Pack Gnoll', o: { race: 'gnoll', tunic: P.leather, pants: P.furDark, tool: 'club', sleeves: 0 } },
};
const pawn = (kind, flip) => cached('w' + kind + (flip ? 'f' : ''), () => { const s = mkPawn(PAWNS[kind].o); return flip ? s.flip() : s; });
