'use strict';
function paintLook(s, look, skin, hair, face, pose) {
  const g = lookGeometry(look, face, pose, s.pts), pen = canvasPen(s), head = canvasPen(s, s.front), body = canvasPen(s, s.front, g.lx);
  paintGarb(pen, body, g, look, skin, s);
  paintBuild(body, g, look);
  paintWomanFace(head, g, look, skin);
  paintSkin(pen, g, look, skin, hair);
  paintFaceMarks(head, g, look, skin);
  paintEyes(head, g, look, skin);
  paintHair(head, g, look, hair, skin);
  paintBeard(head, g, look, hair, skin);
  paintEyewear(head, g, look, skin);
  paintHead(head, g, look, skin, hair);
  paintLimbs(pen, g, look, skin, s);
  paintBack(body, g, look, skin, hair);
}

function paintSkin(pen, g, look, skin, hair) {
  const m = look.marks, sn = skin.length - 1, idx = new Map(skin.map((c, i) => [c, i]));
  const { X, hd, hTop, tTop, er, face } = g;
  const faceCore = (x, y) => face !== 'b' && y >= hTop && y < tTop && (face === 's' ? x > X : Math.abs(x - X + .5) < hd - 1.5);
  const each = f => { for (let y = 0; y < RG.H; y++) for (let x = 0; x < RG.W; x++) { const i = idx.get(pen.get(x, y)); if (i !== undefined) f(x, y, i); } };
  const sc = m.scales || 0, pose = g.pose;
  const sheen = (x, y, step, period) => !pose.still && ((x - y + pose.i * step) % period + period) % period < 2;
  if (sc === 2) each((x, y, i) => { if (!faceCore(x, y) && hash(x, y, 11) > .72) pen.put(x, y, skin[Math.max(0, i - 1)]); });
  if (sc >= 3) each((x, y, i) => {
    if (sc < 4 && faceCore(x, y)) return;
    const p = (x + ((y >> 1) & 1) * 2) & 3;
    if (p === 0) pen.put(x, y, skin[Math.max(0, i - (sc >= 4 ? 2 : 1))]);
    else if (p === 2 && !(y & 1)) pen.put(x, y, skin[Math.min(sn, i + 1)]);
    if (sc >= 4 && hash(x, y, 13 + (pose.i >> 2)) > .94) pen.put(x, y, P.gold[4], 140);
  });
  if (m.chitin) each((x, y, i) => {
    if (faceCore(x, y) && m.chitin < 4) return;
    if (m.chitin === 2 && y < tTop + 2) return;
    if (y % 3 === 0) pen.put(x, y, skin[Math.max(0, i - 2)]);
    else if (y % 3 === 1 && (x & 1) && m.chitin >= 3) pen.put(x, y, skin[sn], m.chitin >= 4 ? 60 : 0);
    if (m.chitin >= 3 && sheen(x, y, 5, 60)) pen.put(x, y, skin[sn], 60);
  });
  if (m.ironSkin) each((x, y, i) => { if ((x - X) % 4 === 0 && !faceCore(x, y)) pen.put(x, y, skin[0]); else if ((x - X) % 4 === 1 && y % 3 === 0) pen.put(x, y, skin[sn], 90); if (sheen(x, y, 5, 60)) pen.put(x, y, P.iron[6], 120); });
  if (m.feathers >= 3) each((x, y) => { if (!faceCore(x, y) && hash(x, y, 5) > .5) pen.put(x, y, P.furWhite[hash(x, y, 9) > .5 ? 4 : 3]); });
  if (m.feathers) for (let x = X - hd - 1; x < X + hd + 1; x++) for (let k = 0; k < 2; k++) if (hash(x, k, 31) > .35) pen.under(x, g.sTop - 1 + k - (pose.wave(.25) > .7 && !k ? 1 : 0), P.furWhite[3 + (k ? 0 : 1)]);
  if (m.fur) each((x, y) => { if (!faceCore(x, y) || hash(x, y, 3) > .75) pen.put(x, y, hair[clamp(hair.length - 2 - (hash(x, y, 4) > .5 ? 1 : 0), 0, hair.length - 1)]); });
  if (m.slick) each((x, y) => { if (hash(x, y, 7) > (m.slick >= 3 ? .8 : .9) || (sheen(x, y * 2, 4, 48) && !faceCore(x, y))) pen.put(x, y, skin[sn], 40); });
  if (m.leafSkin) {
    const sunline = pose.still ? -9 : g.base - Math.round(pose.u * (g.base - hTop + 6));
    each((x, y, i) => {
      const lit = Math.abs(y - sunline) <= 1;
      if (((x + y) % 5 === 0) && !faceCore(x, y)) pen.put(x, y, lit ? P.hay[4] : P.oak[5]);
      else if (y === sunline) pen.put(x, y, skin[Math.min(sn, i + 1)]);
    });
  }
  if (m.emberSkin === 1) each((x, y, i) => { if (hash(x, y, 2) > .8) pen.put(x, y, skin[Math.max(0, i - 2)]); else if (hash(x, y, 8 + pose.i) > .985) pen.put(x, y, P.ember[4], 160); });
  if (m.emberSkin === 2) each((x, y) => { if (hash(x, y, 2 + (pose.i >> 1)) > .9) pen.put(x, y, P.ember[5], 200); });
  if (m.emberSkin >= 3) { const hot = pose.wave() > 0 ? P.gold[4] : P.ember[5]; each((x, y) => { if (((x * 2 + y) % 7 === 0 || hash(x, y, 2 + (pose.i >> 1)) > .93) && !faceCore(x, y)) pen.put(x, y, hot, 230); }); }
}

function paintFaceMarks(pen, g, look, skin) {
  const m = look.marks, sn = skin.length - 1, idx = new Map(skin.map((c, i) => [c, i])), { X, hd, hTop, er, face } = g;
  if (m.pox) for (let k = 0; k < 6; k++) { const x = X - hd + 1 + Math.floor(hash(k, 1, 6) * (2 * hd - 2)), y = er + 1 + Math.floor(hash(k, 2, 6) * 3); if (idx.has(pen.get(x, y))) pen.put(x, y, skin[Math.max(0, sn - 3)]); }
  if (m.burn && face !== 'b') {
    const big = /critical/.test(look.from.burn) ? 2 : /serious/.test(look.from.burn) ? 1 : 0, x0 = face === 's' ? g.F - 4 : X - hd + 1;
    const wide = Math.min(hd - 1, 2 + big), tall = Math.min(g.hh - 4, 2 + big);
    for (let y = er + 1; y < er + 1 + tall; y++) for (let x = x0; x < x0 + wide; x++) if (idx.has(pen.get(x, y))) pen.put(x, y, hash(x, y, 17) > .55 ? P.red[3] : hash(x, y, 19) > .5 ? P.red[2] : skin[0]);
  }
  if (m.scar && face !== 'b') {
    const len = /critical/.test(look.from.scar) ? 5 : /serious/.test(look.from.scar) ? 4 : 3, x0 = face === 's' ? g.F - 4 : X + 1;
    for (let k = 0; k < len; k++) if (idx.has(pen.get(x0 + (k >> 1), hTop + 3 + k))) pen.put(x0 + (k >> 1), hTop + 3 + k, skin[0]);
  }
}

function paintHead(pen, g, look, skin, hair) {
  const m = look.marks, { X, er, F, hd, hTop, hh, face, pose } = g, side = face === 's', bone = P.bone;
  if (m.emberSkin >= 2 && !pose.still) for (let k = 0; k < (m.emberSkin >= 3 ? 3 : 1); k++) {
    const rise = (pose.u + k / 3) % 1;
    if (rise > .8) continue;
    pen.under(X + [-3, 2, 0][k] + Math.round(Math.sin(rise * TURN * 1.5 + k) * 1.5), hTop - 2 - Math.round(rise * 9), rise < .4 ? P.ember[5] : rise < .65 ? P.ember[4] : P.ember[3], 255);
  }
  if (m.horns) {
    const great = m.horns >= 4, len = m.horns === 2 ? 2 : great ? 12 : 6;
    for (const sd of side ? [-1] : [-1, 1]) {
      const rx = side ? X - 1 : X + (sd < 0 ? -hd + 2 : hd - 3), path = [];
      for (let k = 0; k < len; k++) {
        const t = k / Math.max(1, len - 1);
        if (great) { const dir = side ? -1 : sd, ccx = (side ? X - 1 : X + sd * (hd + 1)) + dir * 2, ccy = hTop + 1, a = Math.PI * (.75 - 1.7 * t), r = 4 - 1.5 * t; path.push([ccx + dir * r * Math.cos(a) - dir * 1, ccy - r * Math.sin(a)]); }
        else path.push([rx + (side ? -1 : sd) * k * .55, hTop - 1 - k * (m.horns === 2 ? .6 : .95) + (t > .7 ? (t - .7) * 3 : 0)]);
      }
      path.forEach(([x, y], k) => {
        const t = k / Math.max(1, len - 1), w = great ? (t < .5 ? 3 : t < .85 ? 2 : 1) : m.horns === 2 ? 2 : (t < .5 ? 2 : 1);
        for (let i = 0; i < w; i++) for (let j = 0; j < (great ? 2 : 1); j++) pen.put(Math.round(x) + i - (w >> 1), Math.round(y) + j, bone[clamp(5 - Math.floor(t * 2) - (i === 0 ? 0 : 1) - (great && k % 3 === 1 ? 2 : 0), 1, 5)]);
      });
    }
    reink(pen, X - hd - 10, hTop - 10, X + hd + 10, hTop + hh);
  }
  if (m.scales >= 4 || m.fur >= 4 || m.feathers >= 3) {
    const tint = m.scales >= 4 ? skin[0] : m.feathers ? P.furWhite[4] : P.furWhite[3];
    const crest = side ? [X - 2, X - 4, X - 6] : [X - 2, X, X + 1];
    crest.forEach((x, i) => { const tall = m.scales >= 4 ? 3 - (i === 1 ? 0 : 1) : 2; for (let k = 1; k <= tall; k++) pen.put(x, hTop - k, tint); });
  }
  if (m.fur >= 4) {
    const mx = side ? X - 2 : X, my = hTop + Math.floor(hh * .6), rx = hd + 5, ry = Math.floor(hh / 2) + 5, tint = P.furWhite;
    for (let y = my - ry; y <= my + ry + 3; y++) for (let x = mx - rx - 1; x <= mx + rx; x++) {
      const drift = y > my ? Math.round(pose.wave((y - my) * .02)) : 0;
      const dx = (x - drift - mx + .5) / rx, dy = (y - my) / ry, d = dx * dx + dy * dy, edge = 1 + hash(x - drift, y, 29) * .25;
      if (d > edge || (side && x > X + 1 && y < g.er + 3)) continue;
      pen.under(x, y, d > .85 ? tint[4] : d > .55 ? tint[3 - ((x + y * 2) % 3 === 0 ? 1 : 0)] : tint[2 - ((x * 3 + y) % 4 === 0 ? 1 : 0)]);
    }
    reink(pen, mx - rx - 3, my - ry - 2, mx + rx + 3, my + ry + 5);
  }
  if (face === 'b') return;
  const mx = side ? F - 2 : X - 1;
  if (m.beak) {
    const len = m.beak + 1, col = m.beak >= 4 ? bone : P.gold;
    for (let j = 0; j < len; j++) {
      const w = Math.max(1, 3 - (j >> 1));
      for (let i = 0; i < w; i++) pen.put(side ? F - 1 + i + (j >> 1) : X - 1 - (w >> 1) + i + 1, er + 1 + j, col[j === 0 ? 4 : i === 0 ? 3 : 2]);
    }
    pen.put(side ? F + (len >> 1) + 1 : X, er + len, m.beak >= 4 ? P.ink : col[1]);
  }
  if (m.fangs) for (let k = 0; k < Math.min(4, m.fangs); k++) { pen.put(mx - (side ? 0 : 1), er + 4 + k, bone[5]); if (!side) pen.put(mx + 2, er + 4 + k, bone[5]); }
  if (m.tusks >= 4) for (const sd of side ? [1] : [-1, 1]) for (let k = 0; k < 3; k++) pen.put((side ? F - 1 : X + sd * 3 - (sd > 0 ? 1 : 0)) + (side ? k >> 1 : 0), er + 2 - k, bone[5 - (k >> 1)]);
  if (m.gills) for (const sd of side ? [-1] : [-1, 1]) {
    const gx = side ? X - 2 : X + sd * (hd - 1) - (sd > 0 ? 1 : 0);
    const flare = pose.wave() > .4 ? 1 : 0;
    for (let k = 0; k < 3; k++) if (k !== 1 || !flare) pen.put(gx, g.er + 1 + k, skin[0]);
    if (/frill/.test(look.from.gills)) for (let j = 0; j < 5; j++) for (let k = 1; k < 4 + flare - Math.abs(j - 2); k++) pen.under(gx + (side ? -k : sd * k), g.er + j, j & 1 ? P.red[3] : P.red[2]);
  }
}

function reink(pen, x0, y0, x1, y1) {
  const solid = (x, y) => { const c = pen.get(x, y); return c && c !== P.ink; };
  const near = (x, y, f) => f(x - 1, y) || f(x + 1, y) || f(x, y - 1) || f(x, y + 1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (pen.get(x, y) === P.ink && !near(x, y, solid)) pen.put(x, y, null);
  const add = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!pen.get(x, y) && near(x, y, solid)) add.push([x, y]);
  for (const [x, y] of add) pen.put(x, y, P.ink);
}

function paintLimbs(pen, g, look, skin, s) {
  const m = look.marks, { cx, hw, aw, tTop, legTop, legs, base, face } = g, sn = skin.length - 1;
  if (face === 's') return;
  const wrap = [P.cloth[2], P.cloth[1]];
  if (m.oneArm) {
    const x0 = face === 'b' ? cx + hw : cx - hw - aw - 3, x1 = face === 'b' ? cx + hw + aw + 2 : cx - hw - 1, cut = tTop + 4;
    for (let y = cut; y <= base; y++) for (let x = x0; x <= x1; x++) pen.put(x, y, null);
    for (let x = x0; x <= x1; x++) if (pen.get(x, cut - 1) && pen.get(x, cut - 1) !== P.ink) pen.put(x, cut - 1, wrap[x & 1]);
    reink(pen, x0 - 1, tTop - 2, x1 + 1, base + 1);
  }
  if (m.oneLeg) {
    const x0 = face === 'b' ? cx : cx - hw - 2, x1 = face === 'b' ? cx + hw + 1 : cx - 2, cut = legTop + Math.ceil(legs * .4);
    for (let y = cut; y <= base + 1; y++) for (let x = x0; x <= x1; x++) pen.put(x, y, null);
    for (let x = x0; x <= x1; x++) if (pen.get(x, cut - 1) && pen.get(x, cut - 1) !== P.ink) pen.put(x, cut - 1, wrap[x & 1]);
    reink(pen, x0 - 1, legTop - 1, x1 + 1, base + 1);
  }
  if ((m.claws || m.webbed) && s.pts.hand) {
    const [hx, hy] = s.pts.hand, hands = face === 's' ? [hx] : [hx, 2 * cx - 1 - hx];
    if (m.webbed) for (const x of hands) { pen.under(x - 1, hy + 2, skin[Math.max(0, sn - 2)]); pen.under(x + 1, hy + 2, skin[Math.max(0, sn - 2)]); pen.under(x, hy + 3, skin[Math.max(0, sn - 1)]); }
    const n = m.claws >= 3 ? 3 : 2, len = m.claws >= 4 ? 4 : m.claws >= 3 ? 3 : 1;
    if (m.claws) for (const x of hands) for (let c = 0; c < n; c++) {
      const dx = c - (n >> 1);
      for (let k = 0; k < len; k++) pen.under(x + dx + (k >= len - 1 && len > 2 ? (x < cx ? -1 : 1) : 0), hy + 2 + k, k === len - 1 ? P.bone[2] : P.bone[5 - (k >> 1)]);
    }
  }
}

function paintBack(pen, g, look, skin, hair) {
  const m = look.marks, { cx, hw, aw, legTop, legs, base, face, pose } = g, tTop = g.sTop, back = face === 'b', side = face === 's';
  const tailCol = m.fur ? hair : skin, size = clamp((legs + g.tl + g.hh) / 32, .6, 1.7);
  if (m.tail) {
    const pts = back ? [[cx - 1, legTop - 1], [cx - 1, legTop + 3], [cx + 2, legTop + 6], [cx + 6, legTop + 6], [cx + 9, legTop + 3], [cx + 9, legTop]]
      : side ? [[cx - hw - 1, legTop + 1], [cx - hw - 4, legTop + 4], [cx - hw - 8, legTop + 4], [cx - hw - 10, legTop + 1], [cx - hw - 9, legTop - 2]]
        : [[cx + hw - 1, legTop + 3], [cx + hw + 3, legTop + 6], [cx + hw + 7, legTop + 5], [cx + hw + 9, legTop + 2], [cx + hw + 8, legTop - 1]];
    const n = tailCol.length - 1, [rootX, rootY] = pts[0];
    for (const pt of pts) { pt[0] = rootX + Math.round((pt[0] - rootX) * size); pt[1] = rootY + Math.round((pt[1] - rootY) * size); }
    pts.forEach((pt, j) => { if (j > 1) pt[side ? 1 : 0] += Math.round(pose.wave(-j * .08) * (j - 1) * .7); });
    pts.slice(1).forEach(([x1, y1], i) => {
      const [x0, y0] = pts[i], w = i < 2 ? 2 : 1;
      for (let d = 0; d < w; d++) pen.line(x0, y0 + d, x1, y1 + d, tailCol[clamp(n - 1 - (d ? 1 : 0), 0, n)], 0, !back);
    });
    if (m.fur) { const [tx, ty] = pts[pts.length - 1]; pen.rect(tx - 1, ty - 1, 3, 2, hair[n]); }
    reink(pen, cx - hw - Math.round(12 * size) - 3, legTop - Math.round(4 * size) - 3, cx + hw + Math.round(12 * size) + 3, legTop + Math.round(9 * size) + 3);
  }
  if (m.membrane && !side) for (const sd of [-1, 1]) for (let y = tTop + 3; y < legTop + 4; y++) {
    const w = (pose.still ? y < legTop : (y + pose.i) % 6 < 4) ? 2 : 1;
    for (let k = 0; k < w; k++) pen.under(cx + sd * (hw + aw + 1 + k) - (sd > 0 ? 1 : 0), y, skin[k ? 1 : 2]);
  }
  if (!m.wings) return;
  const leathery = (m.scales >= 3 || m.chitin || m.emberSkin >= 3) && !m.feathers;
  const plumes = [P.furWhite, P.furGrey, P.furDark, P.hay, P.furBrown].filter(r => r !== hair);
  const ramp = leathery ? skin : m.feathers ? P.furWhite : plumes[seedOf(look.id + ':plume') % plumes.length], rn = ramp.length - 1;
  const great = look.from.wings === 'great-wings', beat = pose.wave(), span = Math.round((m.wings <= 3 ? 5 : great ? 19 : 13) * size);
  const rise = Math.min(tTop - 5, Math.round((m.wings <= 3 ? 4 : great ? 17 : 12) * size) + Math.round(beat * (m.wings <= 3 ? 1 : great ? 3 : 2)));
  const drop = (m.wings === 3 ? 6 : legTop + Math.round(legs * .4) - tTop) - Math.round(beat * (m.wings <= 3 ? 1 : 2));
  const draw = back ? pen.put : pen.under;
  if (side) {
    const w = Math.max(2, Math.round((m.wings <= 3 ? 3 : great ? 7 : 5) * size)) + (beat > .5 ? 1 : 0), top = tTop - Math.round(rise * .6), low = m.wings <= 3 ? tTop + 4 : legTop + Math.round(legs * (great ? .7 : .45));
    for (let k = 0; k < w; k++) {
      const x = cx - hw + 2 - k, y0 = top + Math.round(k * k * .4), y1 = low - (leathery && k % 2 ? 2 : 0) - Math.round(k * .5);
      for (let y = y0; y <= y1; y++) pen.put(x, y, y - y0 < 2 ? ramp[rn] : y > y1 - 2 ? ramp[Math.max(0, rn - 3)] : ramp[clamp(rn - 1 - (k & 1), 0, rn)]);
    }
    reink(pen, cx - hw - w - 2, top - 2, cx + 2, low + 2);
    return;
  }
  const wrist = Math.round(span * .55), root = m.wings <= 3 ? hw - 2 : 2;
  for (const sd of [-1, 1]) for (let k = 0; k <= span; k++) {
    const x = cx + sd * (root + k) - (sd > 0 ? 1 : 0);
    const top = k <= wrist ? Math.round(tTop + 2 - rise * k / wrist) : Math.round(tTop + 2 - rise + 4 * (k - wrist) / Math.max(1, span - wrist));
    const reachDown = Math.round(drop * (1 - .55 * k / span));
    let bottom = Math.max(top + 2, tTop + reachDown - (k > wrist ? Math.round((k - wrist) * 1.2) : 0));
    if (leathery && k > 2 && k % 4 >= 2) bottom -= 2;
    if (!leathery && k > wrist && (k & 1)) bottom -= 1;
    for (let y = top; y <= bottom; y++) {
      const d = y - top;
      let c;
      if (leathery) c = d === 0 || (k === wrist && d < (bottom - top) * .8) || (k % 4 === 0 && k > wrist && d < (bottom - top) * .7) ? ramp[Math.max(0, rn - 3)] : ramp[clamp(rn - 1 - (d > (bottom - top) * .6 ? 1 : 0), 0, rn)];
      else c = d < 2 ? ramp[rn] : d < 4 ? ramp[Math.max(0, rn - 1)] : y > bottom - 2 ? ramp[Math.max(0, rn - 3)] : ramp[clamp(rn - 1 - (k & 1) - (k > wrist ? 1 : 0), 0, rn)];
      draw(x, y, c);
    }
  }
  reink(pen, cx - span - 4, tTop - rise - 3, cx + span + 4, tTop + drop + 2);
}
