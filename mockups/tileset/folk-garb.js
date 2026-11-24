'use strict';
function legSpan(pen, g) {
  const { cx, hw, legTop, face } = g, y = legTop + 2;
  if (face !== 's') return [cx - hw, cx + hw - 1];
  let x0 = null, x1 = null;
  for (let x = cx - hw - 3; x <= cx + hw + 3; x++) { const c = pen.get(x, y); if (c && c !== P.ink) { if (x0 === null) x0 = x; x1 = x; } }
  return x0 === null ? [cx - 2, cx + 2] : [x0, x1];
}

function paintSleeves(pen, g, look, skin, cloth, s) {
  const { cx, hw, aw, sTop, tl, face } = g, n = cloth.length - 1, skinSet = new Set(skin);
  if (look.sleeves !== 'long') return;
  if (face === 's') {
    const wrist = s.pts.hand[1] - 3;
    for (let y = sTop + 2; y <= wrist; y++) for (let x = cx - hw - aw - 2; x <= cx + hw + aw + 2; x++) if (skinSet.has(pen.get(x, y))) pen.put(x, y, cloth[clamp(n - (y === wrist ? 4 : 2), 0, n)]);
    return;
  }
  const wrist = sTop + tl - 4;
  for (let y = sTop + 1; y <= wrist; y++) for (const [x0, x1, shade] of [[cx - hw - aw - 1, cx - hw - 1, 1], [cx + hw, cx + hw + aw, 3]]) {
    for (let x = x0; x <= x1; x++) if (skinSet.has(pen.get(x, y))) pen.put(x, y, cloth[clamp(n - (y === wrist ? 4 : shade), 0, n)]);
  }
}

function paintSkirt(pen, g, look, cloth) {
  const { legTop, legs, base, tTop, tl, cx, hw, face } = g, n = cloth.length - 1, gown = look.sex === 'female';
  const hem = gown ? base - 3 : legTop + Math.max(2, Math.round(legs * .35)), [left, right] = legSpan(pen, g);
  for (let y = legTop + 2; y <= hem; y++) {
    const flare = gown && y > legTop + legs * .4 ? 1 : 0, x0 = left - flare, x1 = right + (face === 's' ? 0 : flare);
    for (let x = x0; x <= x1; x++) {
      const u = (x - x0) / Math.max(1, x1 - x0), fold = gown && (x - cx) % 3 === 0 ? 1 : 0;
      const shade = (u < .25 ? 1 : u < .7 ? 2 : 3) + fold;
      pen.put(x, y, y === hem ? (look.trim ? look.trim[3] : cloth[clamp(n - shade - 2, 0, n)]) : cloth[clamp(n - shade, 0, n)]);
    }
  }
  if (look.apron && face !== 'b') {
    const a0 = face === 's' ? right - 1 : cx - hw + 2, a1 = face === 's' ? right : cx + hw - 3;
    for (let y = tTop + tl; y <= hem - 2; y++) for (let x = a0; x <= a1; x++) pen.put(x, y, P.cloth[y === hem - 2 ? 3 : x === a0 ? 5 : 4]);
  }
  if (look.pouch && face === 'f') {
    const px = cx + hw - 4, py = tTop + tl;
    pen.rect(px, py, 2, 3, P.leather[3]); pen.rect(px, py, 2, 1, P.leather[4]); pen.put(px + 1, py + 2, P.leather[2]);
  }
  reink(pen, left - 3, legTop, right + 3, base + 1);
}

function paintGarb(pen, g, look, skin, s) {
  const cloth = DYES[look.garb];
  paintSleeves(pen, g, look, skin, cloth, s);
  paintSkirt(pen, g, look, cloth);
}

function paintBuild(pen, g, look) {
  const { cx, hw, tTop, tl, face } = g, build = look.body.build, cloth = DYES[look.garb], n = cloth.length - 1;
  if (build >= 1.3) {
    if (face === 's') {
      const front = cx + hw - 1, deep = build >= 1.5 ? 2 : 1, top = tTop + 3, low = tTop + tl - 3;
      for (let y = top; y <= low; y++) for (let d = 0; d < deep; d++) {
        if (d === deep - 1 && deep > 1 && (y === top || y === low)) continue;
        pen.put(front + d, y, cloth[clamp(n - 2 - d, 0, n)]);
      }
      reink(pen, front - 1, top - 2, front + deep + 1, low + 2);
    } else {
      for (let y = tTop + 6; y < tTop + tl - 2; y++) { pen.put(cx - hw, y, cloth[clamp(n - 1, 0, n)]); pen.put(cx + hw - 1, y, cloth[clamp(n - 3, 0, n)]); }
      for (let x = cx - hw + 2; x < cx + hw - 2; x++) pen.put(x, tTop + tl - 3, cloth[clamp(n - 4, 0, n)]);
      for (const y of [tTop + tl - 2, tTop + tl - 1]) { pen.put(cx - hw, y, P.leather[3]); pen.put(cx + hw - 1, y, P.leather[1]); }
    }
  }
}
