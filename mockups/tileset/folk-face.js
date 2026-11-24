'use strict';
const TURN = Math.PI * 2;
const STILL = { i: 0, n: 1, u: 0, br: 0, blink: false, glance: 0, still: true, wave: () => 0 };
function idlePose(look, time) {
  if (!time) return STILL;
  const n = time.n, i = (time.i + seedOf(look.id + ':phase')) % n, u = i / n;
  return { i, n, u, br: u >= .45 && u < .8 ? 1 : 0, blink: i === n - 2, glance: i === 3 || i === 4 ? (seedOf(look.id + ':glance') & 1 ? 1 : -1) : 0, still: false, wave: shift => Math.sin((u + (shift || 0)) * TURN) };
}

function lookGeometry(look, face, pose) {
  const b = look.body, cx = RG.CX, base = RG.BASE, legTop = base - b.legs + 1, tTop = legTop - b.tl, sTop = tTop - pose.br, hTop = sTop - b.hh;
  const X = face === 's' ? cx + 1 : cx, er = hTop + Math.floor(b.hh * .5);
  return { ...b, cx, base, legTop, tTop, sTop, hTop, X, er, F: X + b.hd, face, pose };
}

function canvasPen(s) {
  const at = (x, y) => y * s.w + x;
  const pen = {
    ok: (x, y) => s.ok(x, y),
    get: (x, y) => (s.ok(x, y) ? s.c[at(x, y)] : null),
    put: (x, y, c, e) => { if (s.ok(x, y)) { s.c[at(x, y)] = c; s.e[at(x, y)] = e || 0; } },
    under: (x, y, c, e) => { if (s.ok(x, y) && !s.c[at(x, y)]) pen.put(x, y, c, e); },
    rect: (x, y, w, h, c, e) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) pen.put(x + i, y + j, c, e); },
    line: (x0, y0, x1, y1, c, e, behind) => {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let k = 0; k <= n; k++) (behind ? pen.under : pen.put)(Math.round(x0 + (x1 - x0) * k / n), Math.round(y0 + (y1 - y0) * k / n), c, e);
    },
  };
  return pen;
}

function paintEyes(pen, g, look, skin) {
  const m = look.marks, { X, er, F, face } = g, sn = skin.length - 1, brow = skin[Math.max(0, sn - 1)];
  if (face === 'b') return;
  const eyes = face === 's' ? [[F - 3, F - 2]] : [[X - 3, X - 2], [X + 1, X + 2]];
  const pose = g.pose, open = !pose.blink;
  const recolour = (fn) => { if (open) eyes.forEach(([a, b2], i) => fn(a, b2, i)); };
  if (m.dragonEyes) { const flare = pose.wave() > .3; recolour((a, b2) => { pen.put(a, er, flare ? P.ember[5] : P.gold[4], 200); pen.put(b2, er, flare ? P.gold[4] : P.gold[3], 200); }); }
  else if (m.beastEyes) recolour((a, b2) => { pen.put(a, er, P.gold[2]); pen.put(b2, er, P.gold[4]); });
  else if (m.murkEyes) { const flip = (pose.i >> 1) & 1; recolour((a, b2) => { pen.put(a, er, P.frost[flip ? 5 : 4], 120); pen.put(b2, er, P.frost[flip ? 4 : 5], 120); }); }
  if (look.oddEye && face === 'f' && open) pen.put(X + 1, er, EYES[look.oddEye].col);
  if (m.spiderEyes) {
    const bare = skin[Math.max(0, sn - 1)];
    const beads = face === 's'
      ? [[F - 2, er - 2], [F - 4, er - 2], [F - 1, er + 1], [F - 3, er - 3]]
      : [[X - 2, er - 2], [X + 1, er - 2], [X - 4, er - 1], [X + 3, er - 1], [X - 1, er - 3], [X, er - 3]];
    const n = face === 's' ? m.spiderEyes : m.spiderEyes >= 4 ? 6 : m.spiderEyes >= 3 ? 4 : 2;
    for (let y = er - 3; y < er; y++) for (let x = (face === 's' ? F - 5 : X - 4); x < (face === 's' ? F : X + 4); x++) if (pen.get(x, y) && pen.get(x, y) !== P.ink) pen.put(x, y, bare);
    if (m.spiderEyes >= 3) recolour((a, b2) => { pen.put(a, er, P.ink); pen.put(b2, er, P.ink); pen.put(a, er - 1, P.ink); pen.put(b2, er - 1, P.ink); pen.put(a, er - 1, P.furWhite[4]); });
    beads.slice(0, n).forEach(([x, y], k) => {
      const shut = !pose.still && pose.i === (k * 2 + 1) % pose.n;
      pen.put(x, y, shut ? skin[Math.max(0, sn - 3)] : m.spiderEyes >= 4 ? P.red[1] : P.ink, shut ? 0 : 90);
    });
  }
}

const brightness = c => c[0] * .3 + c[1] * .6 + c[2] * .1;
function blindfoldCloth(skin) {
  const tone = brightness(skin[Math.max(0, skin.length - 2)]);
  const cloths = [P.furDark.slice(2, 5), P.furWhite.slice(2, 5)];
  return cloths.reduce((a, c) => Math.abs(brightness(c[1]) - tone) > Math.abs(brightness(a[1]) - tone) ? c : a);
}

function paintEyewear(pen, g, look, skin) {
  const m = look.marks, { X, er, F, hd, hTop, hh, face } = g, strap = P.leather[1], patch = P.leather[0];
  if (m.blind) {
    const [shade, mid, light] = blindfoldCloth(skin), x0 = X - hd, x1 = face === 's' ? F - 1 : X + hd - 1, sway = Math.round(g.pose.wave(.15));
    for (let x = x0; x <= x1; x++) {
      const fold = face === 'f' && (x === X - 3 || x === X + 2);
      pen.put(x, er - 1, fold ? mid : light);
      pen.put(x, er, x === x0 || x === x1 ? shade : mid);
    }
    if (face === 'f') return;
    const kx = face === 's' ? x0 - 1 : X - 1;
    pen.rect(kx, er - 1, 2, 2, light); pen.put(kx + 1, er, shade);
    for (let k = 1; k <= 4; k++) pen.put(kx + (k > 2 ? sway : 0), er + k, k === 4 ? shade : mid);
    for (let k = 1; k <= 3; k++) pen.put(kx + 1 + (face === 'b' ? 1 : 0) + (k > 1 ? sway : 0), er + k, k === 3 ? shade : light);
    return;
  }
  if (!m.oneEye) return;
  if (face === 'f') {
    pen.rect(X - 4, er - 1, 3, 3, patch); pen.put(X - 3, er - 1, P.leather[2]);
    pen.line(X - 1, er - 1, X + hd - 1, hTop + 3, strap); pen.line(X - 4, er, X - hd - 1, er, strap);
  } else if (face === 's') {
    pen.rect(F - 4, er - 1, 3, 3, patch); pen.put(F - 3, er - 1, P.leather[2]);
    pen.line(F - 5, er, X - hd - 1, er - 2, strap);
  } else {
    pen.line(X - hd - 1, er, X + hd, hTop + 3, strap);
  }
}

function paintHair(pen, g, look, hair, skin) {
  const { X, er, hd, hh, hTop, tTop, face } = g, n = hair.length - 1, side = face === 's', back = face === 'b';
  const h = (k) => hair[clamp(n - 1 - k, 0, n)], tie = look.trim ? look.trim[3] : P.red[3];
  const skinSet = new Set(skin), rear = side ? X - hd - 1 : X, sway = Math.round(g.pose.wave(.1));
  if (look.hat === 'hood' || look.hat === 'coif') return;
  switch (look.style) {
    case 'crop':
      for (let y = hTop; y < hTop + (back ? hh - 2 : 3); y++) for (let x = X - hd; x < X + hd; x++) if (skinSet.has(pen.get(x, y)) && !(y === hTop + 2 && !back && hash(x, y, 37) > .6)) pen.put(x, y, h(hash(x, y, 41) > .7 ? 1 : 2));
      break;
    case 'ponytail':
      if (back) { for (let y = hTop + 3; y < hTop + hh + 6; y++) { const w = y > hTop + hh + 3 ? 1 : 2; for (let i = 0; i < w; i++) pen.put(X - 1 + i + (y > hTop + hh + 1 ? sway : 0), y, h((y + i) % 3 === 0 ? 1 : 0)); } pen.rect(X - 1, hTop + hh - 1, 2, 1, tie); }
      else if (side) { for (let y = hTop + 3; y < tTop + 4; y++) { pen.under(rear - (y >= tTop && sway > 0 ? 1 : 0), y, h(y % 3 === 0 ? 1 : 0)); if (y < tTop) pen.under(rear - 1, y, h(1)); } pen.put(rear, hTop + hh - 2, tie); }
      break;
    case 'braids': {
      const cols = side ? [rear] : [X - hd - 1, X + hd];
      for (const c of cols) { for (let y = er - 1; y < tTop + 6; y++) { pen.put(c + (y > tTop + 2 ? sway : 0), y, h(y & 1)); if (!back && !side) pen.under(c + (c < X ? -1 : 1), y, (y & 1) ? h(2) : null); } pen.put(c, tTop + 6, tie); }
      break;
    }
    case 'topknot': {
      const kx = side ? X - 1 : X;
      for (let j = 0; j < 3; j++) for (let i = -1 - (j === 1 ? 1 : 0); i < 1 + (j === 1 ? 1 : 0); i++) pen.put(kx + i, hTop - 4 + j, h(i < 0 ? 0 : 1));
      pen.rect(kx - 1, hTop - 1, 2, 1, tie);
      break;
    }
    case 'curls':
      for (let y = hTop - 2; y < er + (back ? 4 : 2); y++) for (let x = X - hd - 2; x < X + hd + 2; x++) {
        const inside = Math.abs(x - X + .5) < hd + 2 && y >= hTop - 2 - (Math.abs(x - X + .5) > hd ? -2 : 0);
        if (inside && !(side && x > X + 1 && y > hTop + 1)) pen.under(x, y, h(hash(x >> 1, y >> 1, 43) > .55 ? (hash(x, y, 47) > .5 ? 0 : 1) : 2));
      }
      break;
    case 'pigtails':
      for (const c of side ? [rear - 1] : [X - hd - 2, X + hd + 1]) { for (let y = er - 2; y < er + 3; y++) { pen.under(c, y, h(y & 1)); pen.under(c + (c < X ? 1 : -1), y, h(1)); } pen.put(c, er - 2, tie); }
      break;
    case 'fringe':
      if (!back) for (let x = (side ? X : X - hd + 1); x < (side ? g.F - 1 : X + hd - 1); x++) { pen.put(x, hTop + 3, h(x & 1)); if (x % 3 === 0) pen.put(x, hTop + 4, h(1)); }
      break;
  }
}

function paintBeard(pen, g, look, hair, skin) {
  const { X, er, F, hTop, hh, face } = g, dark = hair[Math.max(0, hair.length - 3)], sn = skin.length - 1;
  if (face === 'b' || look.beard === 'none') return;
  const skinSet = new Set(skin);
  const span = face === 's' ? [F - 4, F] : [X - 3, X + 2];
  if (look.beard === 'moustache' || look.beard === 'goatee') for (let x = span[0]; x < span[1]; x++) pen.put(x, er + 2, dark);
  if (look.beard === 'goatee') for (let y = er + 4; y < er + 6; y++) for (let x = (face === 's' ? F - 3 : X - 2); x < (face === 's' ? F - 1 : X + 1); x++) pen.put(x, y, dark);
  if (look.beard === 'stubble') for (let y = er + 2; y < hTop + hh; y++) for (let x = X - g.hd; x < X + g.hd + 1; x++) if (skinSet.has(pen.get(x, y)) && ((x + y) & 1)) pen.put(x, y, skin[Math.max(0, sn - 3)]);
  if (look.beard === 'braided') { const bx = face === 's' ? F - 2 : X - 1; for (let y = hTop + hh + 4; y < hTop + hh + 8; y++) pen.put(bx, y, hair[(y & 1) ? 2 : 3]); pen.put(bx, hTop + hh + 8, look.trim ? look.trim[3] : P.gold[3]); }
}
