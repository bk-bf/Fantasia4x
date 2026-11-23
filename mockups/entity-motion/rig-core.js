'use strict';
const RG = { W: 104, H: 88, CX: 52, BASE: 72 };
const D2R = Math.PI / 180;
const rnd = Math.round;

function ik2(ax, ay, bx, by, l1, l2, bend) {
  let dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || .001;
  const m = clamp(d, Math.abs(l1 - l2) + .01, l1 + l2 - .01);
  dx *= m / d; dy *= m / d; d = m;
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  return [ax + dx * a / d - dy / d * h * bend, ay + dy * a / d + dx / d * h * bend, ax + dx, ay + dy];
}

function limb(s, pts, w, col, rim) {
  const px = new Map(), half = w >> 1;
  const dab = (x, y, vert, t) => {
    for (let k = 0; k < w; k++) {
      const X = rnd(vert ? x - half + k : x), Y = rnd(vert ? y : y - half + k);
      if (!s.ok(X, Y)) continue;
      const c = col(t, k, vert);
      if (c) px.set(Y * s.w + X, c);
    }
  };
  let t = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, rnd(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))), vert = Math.abs(y1 - y0) >= Math.abs(x1 - x0);
    if (i > 0) dab(x0, y0, !vert, t);
    for (let j = 0; j <= n; j++) dab(mix(x0, x1, j / n), mix(y0, y1, j / n), vert, t + len * j / n);
    t += len;
  }
  if (rim) for (const i of px.keys()) for (const d of [-1, 1, -s.w, s.w]) { const q = i + d; if (!px.has(q) && s.c[q] && s.c[q] !== P.ink) s.c[q] = rim(s.c[q]); }
  for (const [i, c] of px) { s.c[i] = c; s.e[i] = 0; }
}
const shade = c => dark(c, .6);

const wd = (b, R) => b === 0 ? R[5] : b === 1 ? R[3] : null;
const TOOLS = {
  axe: { hold: 9, tip: [20, 5], f(l, b) {
    if (l >= 18 && l <= 22 && b >= -1 && b <= 1) return P.iron[2];
    const j = 24 - l, w = j < 0 || j > 8 ? 0 : j < 2 ? 4 : j < 7 ? 6 + (j > 3 ? 1 : 0) : 4, i = b - 2;
    if (i >= 0 && i < w) return P.iron[i >= w - 2 ? 6 : j < 2 ? 5 : 4 - (j > 6 ? 1 : 0)];
    return l >= -4 && l <= 20 ? wd(b, P.wood) : null;
  } },
  pick: { hold: 9, tip: [19, 7], f(l, b) {
    if (l >= 20 && l <= 23 && b >= -1 && b <= 1) return P.iron[3];
    if (b >= -7 && b <= 8) { const t = 21 - rnd(b * b * .07); if (l === t) return P.iron[b < 0 ? 5 : 4]; if (l === t - 1) return P.iron[b < 0 ? 4 : 2]; }
    return l >= -4 && l <= 20 ? wd(b, P.wood) : null;
  } },
  hoe: { hold: 5, tip: [19, 6], f(l, b) {
    if (l >= 22 && l <= 23 && b >= 0 && b <= 6) return P.iron[5];
    if (l >= 18 && l <= 21 && b >= 5 && b <= 6) return P.iron[b === 6 ? 2 : 4];
    return l >= -11 && l <= 22 ? wd(b, P.wood) : null;
  } },
  hammer: { hold: 8, tip: [15, 0], f(l, b) {
    if (l >= 13 && l <= 17 && b >= -4 && b <= 4) return P.iron[l === 17 ? 6 : l === 13 || b === 4 ? 2 : 4];
    return l >= -2 && l <= 12 ? wd(b, P.wood) : null;
  } },
  sword: { hold: 15, tip: [20, 0], f(l, b) {
    if (l >= 3 && l <= 20) return b === 0 ? P.iron[6] : b === 1 ? P.iron[4] : null;
    if (l === 21) return b === 0 ? P.iron[6] : null;
    if (l === 2 || l === 1) return b >= -2 && b <= 3 ? P.gold[l === 2 ? 4 : 2] : null;
    if (l >= -2 && l <= 0) return b === 0 || b === 1 ? P.leather[2] : null;
    return l === -3 && (b === 0 || b === 1) ? P.gold[3] : null;
  } },
  spear: { hold: 0, tip: [34, 0], f(l, b) {
    if (l >= 27 && l <= 34) { const j = 34 - l, w = j < 5 ? Math.ceil((j + 1) / 2) : 2; return b <= 0 && b > -w ? P.iron[6] : b >= 1 && b <= w ? P.iron[3] : null; }
    if (l === 26 && b >= -1 && b <= 2) return P.leather[3];
    return l >= -11 && l <= 26 ? wd(b, P.wood) : null;
  } },
  club: { hold: 14, tip: [14, 1], f(l, b) {
    const q = Math.hypot((b - 1) / 4.4, (l - 14) / 5.4);
    if ((b === 4 && l === 16) || (b === -2 && l === 17)) return P.bone[5];
    if (b === 4 && l === 11) return P.bone[4];
    if (q <= 1) return P.wood[clamp(rnd(3 - (b - 1) * .5 + (l - 14) * .22), 1, 5)];
    return l >= -2 && l <= 10 ? (b === 0 ? P.wood[4] : b === 1 ? P.wood[2] : null) : null;
  } },
  bow: { hold: 0, tip: [0, 9], f(l, b, o) {
    const arc = 4 - rnd(l * l / 28), pull = o.pull || 0;
    if (l < -11 || l > 11) return null;
    if (l >= -2 && l <= 1 && (b === arc || b === arc + 1)) return P.leather[3];
    if (b === arc) return P.wood[4];
    if (b === arc + 1) return P.wood[2];
    if (o.arrow && l === 0 && b >= -pull - 1 && b <= 10) return b >= 9 ? P.iron[6] : b === -pull - 1 ? P.cloth[5] : P.wood[5];
    return b === -rnd(pull * (1 - Math.abs(l) / 11)) ? P.cloth[4] : null;
  } },
  torch: { hold: 0, tip: [12, 0], f(l, b) {
    if (l >= 9 && l <= 11 && b >= -1 && b <= 2) return P.cloth[2];
    return l >= -2 && l <= 9 ? wd(b, P.wood) : null;
  } },
  staff: { hold: 0, tip: [26, 0], f(l, b) {
    const nx = (b - .5) / 3.2, ny = (26 - l) / 3.6;
    if (nx * nx + ny * ny <= 1) return P.mana[nx + ny < -.3 ? 5 : nx + ny < .5 ? 4 : 2];
    if (l === 23 && (b === -2 || b === 3)) return P.wood[b < 0 ? 4 : 2];
    return l >= -11 && l <= 22 ? wd(b, P.wood) : null;
  } },
  ladle: { hold: 20, tip: [11, 0], f(l, b) {
    if (l >= 9 && l <= 11 && b >= -1 && b <= 2) return P.wood[l === 11 ? 4 : 2];
    return l >= -2 && l <= 9 ? wd(b, P.wood) : null;
  } },
  cup: { hold: 0, tip: [3, 0], f(l, b) { return l >= -1 && l <= 3 && b >= -1 && b <= 2 ? P.wood[l === 3 ? 5 : b === 2 ? 2 : 4] : null; } },
  bread: { hold: 0, tip: [2, 0], f(l, b) { return l >= -1 && l <= 2 && b >= -2 && b <= 3 ? P.thatch[l === 2 ? 5 : b === 3 || l === -1 ? 2 : 4] : null; } },
};
function toolAt(s, kind, gx, gy, ang, o) {
  const T = TOOLS[kind];
  if (!T) return null;
  o = o || {};
  const a = (ang === undefined ? T.hold : ang) * D2R, ux = Math.sin(a), uy = -Math.cos(a), vx = Math.cos(a), vy = Math.sin(a), R = 38, m = o.mirror ? -1 : 1;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const c = T.f(rnd(m * dx * ux + dy * uy), rnd(m * dx * vx + dy * vy + .5), o);
    if (c) s.set(gx + dx, gy + dy, c, kind === 'staff' && P.mana.includes(c) ? 255 : 0);
  }
  return [gx + m * (ux * T.tip[0] + vx * T.tip[1]), gy + uy * T.tip[0] + vy * T.tip[1]];
}

function logOn(s, x, y, len, tilt) {
  for (let i = -len; i <= len; i++) {
    const yy = y + rnd(i * (tilt || 0) / len);
    for (let j = 0; j < 6; j++) s.set(x + i, yy + j, P.wood[clamp([5, 4, 3, 3, 2, 1][j] - (noise(i * .3, j, 3) > .68 ? 1 : 0), 0, 5)]);
  }
  s.oval(x + len, y + rnd(tilt || 0) + 2.5, 2, 3, (px, py, nx, ny) => P.plank[Math.hypot(nx, ny) < .5 ? 3 : 5]);
}
function sackOn(s, x, y) {
  s.ball(x, y, 6, 5, 4, P.cloth, { d: .2, n: .25, ns: .8, seed: 5 });
  s.rect(x - 1, y - 6, 3, 2, P.cloth[2]); s.set(x, y - 7, P.leather[3]);
}

function turn(spr) {
  const s = new Spr(spr.h, spr.w, spr.h - 1 - spr.ay, spr.ax);
  for (let y = 0; y < spr.h; y++) for (let x = 0; x < spr.w; x++) {
    const i = y * spr.w + x, X = spr.h - 1 - y, Y = x, j = Y * s.w + X;
    s.c[j] = spr.c[i]; s.e[j] = spr.e[i];
  }
  return s;
}
function laid(spr) {
  const s = turn(spr);
  let x0 = s.w, x1 = 0, y1 = 0;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.c[y * s.w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  s.ax = (x0 + x1) >> 1; s.ay = y1 - 1;
  s.sh = { rx: (x1 - x0) / 2 + 2, ry: 3.6, dx: 2, dy: 0 };
  return s;
}
