'use strict';
function paintMarks(s, look, skin) {
  const b = look.body, m = look.marks, cx = RG.CX, base = RG.BASE;
  const legTop = base - b.legs + 1, tTop = legTop - b.tl, hTop = tTop - b.hh, er = hTop + Math.floor(b.hh * .5);
  const sn = skin.length - 1, hair = HAIRS[look.hair].ramp, idx = new Map(skin.map((c, i) => [c, i]));
  const at = (x, y) => y * s.w + x;
  const isSkin = (x, y) => s.ok(x, y) && idx.has(s.c[at(x, y)]);
  const empty = (x, y) => s.ok(x, y) && !s.c[at(x, y)];
  const put = (x, y, c, e) => { if (s.ok(x, y)) { s.c[at(x, y)] = c; s.e[at(x, y)] = e || 0; } };
  const putEmpty = (x, y, c) => { if (empty(x, y)) put(x, y, c); };
  const eachSkin = f => { for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (isSkin(x, y)) f(x, y, idx.get(s.c[at(x, y)])); };
  const face = (x, y) => y >= hTop && y < tTop && Math.abs(x - cx + .5) < b.hd - 1;

  if (m.scales) eachSkin((x, y, i) => { if (!face(x, y) && ((x + (y >> 1) * 2) & 3) === 0) put(x, y, skin[Math.max(0, i - 1)]); else if (m.scales > 1 && ((x + y) & 3) === 1) put(x, y, skin[Math.min(sn, i + 1)]); });
  if (m.chitin) eachSkin((x, y, i) => { if (!face(x, y) && y % 3 === 0) put(x, y, skin[Math.max(0, i - 2)]); if (!face(x, y) && y % 3 === 1 && (x & 1)) put(x, y, skin[sn]); });
  if (m.feathers) eachSkin((x, y) => { if (!face(x, y) && hash(x, y, 5) > .55) put(x, y, P.furWhite[hash(x, y, 9) > .5 ? 3 : 2]); });
  if (m.fur) eachSkin((x, y) => { if (!face(x, y) || hash(x, y, 3) > .7) put(x, y, hair[clamp(hair.length - 2 - (hash(x, y, 4) > .5 ? 1 : 0), 0, hair.length - 1)]); });
  if (m.fur > 2) for (let j = 0; j < b.hh + 3; j++) for (const sd of [-1, 1]) for (let k = 0; k < 2; k++) putEmpty(cx + (sd < 0 ? -b.hd - 2 - k : b.hd + 1 + k), hTop + j, hair[hair.length - 2 - k]);
  if (m.slick) eachSkin((x, y) => { if (hash(x, y, 7) > .86) put(x, y, skin[sn]); });
  if (m.emberSkin) eachSkin((x, y, i) => { if (hash(x, y, 2) > .8) put(x, y, P.ember[5], 220); });

  if (m.pox) for (let k = 0; k < 6; k++) { const x = cx - b.hd + 1 + Math.floor(hash(k, 1, 6) * (2 * b.hd - 2)), y = er + 1 + Math.floor(hash(k, 2, 6) * 3); if (isSkin(x, y)) put(x, y, skin[Math.max(0, sn - 3)]); }
  if (m.scar) for (let k = 0; k < 2 + m.scar; k++) { const x = cx + 1 + k - 1, y = hTop + 2 + k; if (isSkin(x, y)) put(x, y, skin[0]); }
  if (m.oneEye) { put(cx - 3, er, skin[0]); put(cx - 2, er, skin[1]); put(cx - 4, er - 1, skin[0]); put(cx - 1, er + 1, skin[0]); }
  if (m.extraEyes) {
    const eyes = [[cx - 2, er - 2], [cx + 1, er - 2], [cx - 3, er - 3], [cx + 2, er - 3], [cx - 1, er - 4], [cx, er - 4]].slice(0, m.extraEyes * 2);
    for (const [x, y] of eyes) put(x, y, P.ink);
  }
  if (m.beak) {
    const len = 2 + m.beak;
    for (let j = 0; j < len; j++) for (let i = -2 + (j >> 1); i < 2 - (j >> 1) + (j === 0 ? 0 : 0); i++) put(cx + i, er + 1 + j, P.gold[j === 0 ? 4 : i < 0 ? 3 : 2]);
    put(cx - 1, er + len, P.gold[1]);
  }
  if (m.fangs) for (let k = 0; k < m.fangs; k++) { put(cx - 2, er + 4 + k, P.bone[5]); put(cx + 1, er + 4 + k, P.bone[5]); }
  if (m.horns) {
    const len = 1 + m.horns * 2;
    for (const sd of [-1, 1]) for (let k = 0; k < len; k++) {
      const x = cx + (sd < 0 ? -b.hd + 1 : b.hd - 2) + sd * Math.round(k * k / (len * 1.6)), y = hTop - 1 - k;
      put(x, y, P.bone[k > len - 2 ? 5 : sd < 0 ? 4 : 3]); if (k < len / 2) put(x - sd, y, P.bone[2]);
    }
  }
  if (m.claws) for (const hx of [cx - b.hw - b.aw, cx + b.hw + b.aw - 1]) for (let k = 0; k < m.claws; k++) for (const dx of [-1, 1]) putEmpty(hx + dx, tTop + b.tl + 1 + k, P.bone[5 - k]);
  if (m.wings) {
    const span = 3 + m.wings * 4, drop = 5 + m.wings * 3, col = m.feathers ? P.furWhite : hair;
    for (const sd of [-1, 1]) for (let k = 0; k < span; k++) {
      const x = cx + sd * (b.hw + b.aw + 1 + k) - (sd > 0 ? 1 : 0), top = tTop - 2 - Math.round(k * .6 * (1 - k / span) * 2), h = Math.max(1, Math.round(drop * (1 - k / span)) + 2);
      for (let j = 0; j < h; j++) putEmpty(x, top + j, col[clamp(col.length - 2 - (j === 0 ? -1 : 0) - ((k + j) % 4 === 0 ? 1 : 0), 0, col.length - 1)]);
    }
  }
  if (m.oneArm) {
    for (let y = tTop - 2; y < legTop + 2; y++) for (let x = 0; x < cx - b.hw; x++) if (s.c[at(x, y)] && !face(x, y)) put(x, y, null);
    for (let y = tTop - 1; y < tTop + 3; y++) put(cx - b.hw - 1, y, P.ink);
  }
  if (m.oneLeg) {
    for (let y = legTop + 2; y <= base + 1; y++) for (let x = cx - b.hw - 2; x < cx - 1; x++) put(x, y, null);
    for (let x = cx - b.hw - 1; x < cx - 1; x++) put(x, legTop + 2, P.ink);
  }
}
