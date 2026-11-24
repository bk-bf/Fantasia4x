'use strict';
function shadeBy(pen, x, y, ramp, step) {
  const i = ramp.indexOf(pen.get(x, y)), last = ramp.length - 1;
  if (i < 0) return;
  pen.put(x, y, i + step > last ? ramp[last].map(v => v + (255 - v) * .4) : ramp[clamp(i + step, 0, last)]);
}

function paintFigure(pen, g, look, cloth) {
  const { cx, hw, aw, sTop, tTop, tl, face } = g, n = cloth.length - 1, tone = k => cloth[clamp(n - k, 0, n)];
  if (look.sex !== 'female') return;
  const full = look.body.build >= 1.3 ? 3 : look.body.build < .9 ? 1 : 2, tall = tl < 8 ? 1 : full >= 3 ? 3 : 2, top = tTop + 2;
  if (face === 's') {
    const front = cx + hw - 1, peak = full >= 2 ? 2 : 1, rows = tall + 2;
    for (let r = 0; r < rows; r++) {
      const reach = r === 0 || r === rows - 1 ? 1 : peak, shade = r === 0 ? 0 : r === rows - 1 ? 3 : r === 1 ? 1 : 2;
      for (let k = 0; k < reach; k++) pen.put(front + k, top - 1 + r, tone(shade + (k < reach - 1 ? 1 : 0)));
    }
    reink(pen, front - 1, top - 3, front + peak + 1, top + rows);
    return;
  }
  for (const x of [cx - hw - aw, cx + hw + aw - 1]) pen.put(x, sTop + 2, null);
  reink(pen, cx - hw - aw - 2, sTop, cx + hw + aw + 1, sTop + 4);
  if (face !== 'f' || hw < 4) return;
  const wide = hw >= 7 ? 3 : 2;
  for (const x0 of [cx - 1 - wide, cx + 1]) {
    for (let y = top; y < top + tall; y++) for (let x = x0; x < x0 + wide; x++) shadeBy(pen, x, y, cloth, 1);
    shadeBy(pen, x0, top, cloth, 1);
  }
  for (let y = top + 1; y <= top + tall; y++) for (const x of [cx - 1, cx]) shadeBy(pen, x, y, cloth, -1);
  if (full >= 2) for (let x = cx - hw + 2; x <= cx + hw - 3; x++) if (x !== cx - 1 && x !== cx) shadeBy(pen, x, top + tall, cloth, -1);
}

function paintWaist(pen, g, look) {
  const { cx, hw, tTop, tl, face } = g, belt = tTop + tl - 2;
  if (look.sex !== 'female' || !(tl >= 9 && hw >= 5 && look.body.build < 1.3)) return;
  const waistTop = Math.max(tTop + 7, belt - 3);
  for (let y = waistTop; y <= belt + 1; y++) for (const x of face === 's' ? [cx + hw - 2, cx - hw] : [cx - hw + 1, cx + hw - 2]) pen.put(x, y, null);
  reink(pen, cx - hw - 2, waistTop - 2, cx + hw, belt + 3);
}

function paintBuild(pen, g, look, skin) {
  const { cx, hw, tTop, tl, face } = g, build = look.body.build, n = skin.length - 1;
  if (build < 1.3) return;
  if (face === 's') {
    const front = cx + hw - 1, deep = build >= 1.5 ? 2 : 1, top = tTop + 3, low = tTop + tl - 3;
    for (let y = top; y <= low; y++) for (let d = 0; d < deep; d++) {
      if (d === deep - 1 && deep > 1 && (y === top || y === low)) continue;
      pen.put(front + d, y, skin[clamp(n - 2 - d, 0, n)]);
    }
    reink(pen, front - 1, top - 2, front + deep + 1, low + 2);
    return;
  }
  for (let y = tTop + 6; y < tTop + tl - 2; y++) { pen.put(cx - hw, y, skin[clamp(n - 1, 0, n)]); pen.put(cx + hw - 1, y, skin[clamp(n - 3, 0, n)]); }
  for (let x = cx - hw + 2; x < cx + hw - 2; x++) pen.put(x, tTop + tl - 3, skin[clamp(n - 4, 0, n)]);
}

function paintBody(body, g, look, skin) {
  paintFigure(body, g, look, skin);
  paintWaist(body, g, look);
  paintBuild(body, g, look, skin);
}
