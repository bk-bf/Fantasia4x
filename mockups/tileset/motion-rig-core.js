'use strict';
const RG = { W: 104, H: 112, CX: 52, BASE: 72 };
const SEEN = { depth: .4 };
const seenAt = p => [p[0], SEEN.depth * p[1] - p[2]];
const D2R = Math.PI / 180;
const rnd = Math.round;

function ik2(ax, ay, bx, by, l1, l2, bend) {
  let dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || .001;
  const m = clamp(d, Math.abs(l1 - l2) + .01, l1 + l2 - .01);
  dx *= m / d; dy *= m / d; d = m;
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  return [ax + dx * a / d - dy / d * h * bend, ay + dy * a / d + dx / d * h * bend, ax + dx, ay + dy];
}

function limbStrip(s, a, b, w, j0, j1, col) {
  const half = w >> 1, dx = b[0] - a[0], dy = b[1] - a[1], n = Math.max(1, rnd(Math.max(Math.abs(dx), Math.abs(dy)))), vert = Math.abs(dy) >= Math.abs(dx);
  for (let i = 0; i <= n; i++) for (let k = 0; k < w; k++) {
    const x = mix(a[0], b[0], i / n), y = mix(a[1], b[1], i / n), X = rnd(vert ? x - half + k : x), Y = rnd(vert ? y : y - half + k), c = s.ok(X, Y) ? col(mix(j0, j1, i / n), k, vert, X, Y) : null;
    if (c) s.set(X, Y, c);
  }
}
function limbJoint(s, at, w, j, col, top = -Infinity) {
  const half = w >> 1;
  for (let ky = 0; ky < w; ky++) for (let k = 0; k < w; k++) { const corner = w > 2 && (k === 0 || k === w - 1) && (ky === 0 || ky === w - 1), X = rnd(at[0] - half + k), Y = rnd(at[1] - half + ky), c = !corner && Y >= top && s.ok(X, Y) ? col(j, k, true, X, Y) : null; if (c) s.set(X, Y, c); }
}
function limbDrawn(s, seg, path, w, zones, col, capless) {
  const [S, E, H] = path, back = Math.hypot(H[0] - E[0], H[1] - E[1]) || 1, wrist = [H[0] - (H[0] - E[0]) / back * Math.min(back, LIMB.hand), H[1] - (H[1] - E[1]) / back * Math.min(back, LIMB.hand)];
  if (seg === 'upper') { limbJoint(s, S, w, zones.upper[0], col, capless ? S[1] : -Infinity); limbStrip(s, S, E, w, zones.upper[0], zones.upper[1], col); limbJoint(s, E, w, zones.upper[1], col); }
  else if (seg === 'fore') { limbJoint(s, E, w, zones.fore[0], col); limbStrip(s, E, wrist, w, zones.fore[0], zones.fore[1], col); }
  else { limbStrip(s, wrist, H, w, zones.hand[0], zones.hand[1], col); limbJoint(s, H, Math.max(w, LIMB.block), zones.block, col); }
}
const LIMB = { hand: 2, block: 3 };
function rigLimb(s, pts, w, col, rim) {
  const px = new Map(), half = w >> 1;
  const dab = (x, y, vert, t) => {
    for (let k = 0; k < w; k++) {
      const X = rnd(vert ? x - half + k : x), Y = rnd(vert ? y : y - half + k);
      if (!s.ok(X, Y)) continue;
      const c = col(t, k, vert, X, Y);
      if (c) px.set(Y * s.w + X, c);
    }
  };
  let t = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, rnd(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))), vert = Math.abs(y1 - y0) >= Math.abs(x1 - x0);
    if (i > 0) dab(x0, y0, !vert, t);
    const along = j => rnd(vert ? mix(y0, y1, j / n) : mix(x0, x1, j / n));
    for (let j = 0; j <= n; j++) {
      if (j && Math.abs(along(j) - along(j - 1)) > 1) dab(mix(x0, x1, (j - .5) / n), mix(y0, y1, (j - .5) / n), vert, t + len * (j - .5) / n);
      dab(mix(x0, x1, j / n), mix(y0, y1, j / n), vert, t + len * j / n);
    }
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
    if (o.edge) return b === 0 ? (l >= -2 && l <= 1 ? P.leather[3] : P.wood[4]) : b === 1 ? (l >= -2 && l <= 1 ? P.leather[1] : P.wood[2]) : o.arrow && l === 0 && b === -1 ? P.iron[6] : null;
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
const FORE_FILLS = .5, EDGE_SEEN = { least: .6 }, EDGE_DOWN = ['axe'];
const edgeSeen = (view, aim) => { const e = [0, aim[2], -aim[1]], n = len3(e); return n < .2 ? null : view.at(mul3(e, 1 / n)); };
function toolAt(s, kind, gx, gy, ang, o) {
  const T = TOOLS[kind];
  if (!T) return null;
  o = o || {};
  const fore = o.fore || 1, a = (ang === undefined ? T.hold : ang) * D2R, ux = Math.sin(a), uy = -Math.cos(a), R = 38, m = o.mirror ? -1 : 1;
  const ev0 = o.edge ? o.edge[0] * Math.cos(a) + o.edge[1] * Math.sin(a) : 1, ev = o.edge ? (ev0 < 0 ? -1 : 1) * Math.max(EDGE_SEEN.least, Math.abs(ev0)) : 1, eu = o.edge ? o.edge[0] * ux + o.edge[1] * uy : 0;
  const vx = Math.cos(a) / ev, vy = Math.sin(a) / ev;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const across = m * dx * vx + dy * vy, along = m * dx * ux + dy * uy - across * eu, l = rnd(along / fore), b = rnd(across + .5);
    let c = T.f(l, b, o);
    for (let k = 1; !c && fore < FORE_FILLS && k * fore <= 1; k++) for (const q of [l + k, l - k]) if (!c && Math.abs(q * fore - along) <= .5) c = T.f(q, b, o);
    if (c) s.set(gx + dx, gy + dy, c, kind === 'staff' && P.mana.includes(c) ? 255 : 0);
  }
  const bx = eu * ux + ev * Math.cos(a), by = eu * uy + ev * Math.sin(a);
  return [gx + m * (ux * T.tip[0] * fore + bx * T.tip[1]), gy + uy * T.tip[0] * fore + by * T.tip[1]];
}

const TOOL_BUTT = { sword: 3, axe: 4, pick: 4, hoe: 11, hammer: 2, spear: 11, club: 2, bow: 11, torch: 2, staff: 11 };
const STOWED = { toward: 172, away: 8, shown: 3, least: .12 };
function aimed(ang, stow, back) {
  if (!(stow > 0)) return { ang, fore: 1 };
  const along = back ? STOWED.away : STOWED.toward, turn = ((ang - along + 540) % 360) - 180;
  return { ang: along + turn * (1 - stow), fore: mix(SEEN.depth, 1, 1 - stow) };
}
const BOW = { half: 11, sag: 4, nock: 10, grip: 4.5 };
const SIDE_DEPTH = { far: -3, farHeld: -2.9, farHand: -2.85, shield: -2.8, cape: -2, tail: -1.9, farLeg: -1, nearLeg: -.9, torso: 0, over: .25, head: .3, pad: .9, tucked: .9, near: 1, tool: 1.5, hand: 1.6, fingers: 1.7 };
const TOWARD_DEPTH = { slung: -3.5, cape: -1.3, tail: -1.25, legs: -.3, torso: -.2, head: .3, upper: 1, pad: 1.5, fore: 2, shield: 2.5, hand: 3, butt: -.5, step: .05 };
const AWAY_DEPTH = { shield: -3.5, hand: -3, fore: -2, upper: -1, tail: -.4, legs: -.3, torso: -.2, pad: -.15, cape: -.12, slung: .2, head: .3, butt: 3.2, step: .05 };
const ON_ONE_SHOULDER = ['shoulder', 'game'], IN_BOTH_ARMS = ['chest', 'low', 'cradle'], HELD_LOW = { chest: 8, low: 10, cradle: 10 };
const HELD = {
  hip: { s: { at: .95, palm: 'around' }, f: { at: 2.95, palm: 'around' }, b: { at: -3.05, palm: 'around' } },
  chest: { s: { at: .95, palm: 'around' }, f: { at: 6, palm: 'around' }, b: { at: -6, palm: 'around' } },
  low: { s: { at: .95, palm: 'around' }, f: { at: 6, palm: 'under' }, b: { at: -6, palm: 'under' } },
  shoulder: { s: { at: .95, palm: 'around' }, f: { at: 7, palm: 'under' }, b: { at: 7, palm: 'under' } },
  game: { s: { at: .2, palm: 'around' }, f: { at: .25, palm: 'around' }, b: { at: .35, palm: 'around' } },
  cradle: { s: { at: .95, palm: 'under' }, f: { at: 6, palm: 'under' }, b: { at: -6, palm: 'under' } },
  rest: { s: { at: .95, palm: 'around' }, f: { at: 6, palm: 'under' }, b: { at: -6, palm: 'under' } },
};
const REST = { toes: 4, along: 5, edge: 2, raised: .7, sunk: 2, long: 2, underArms: .97 };
const RIG_KEEP = { layers: false };
const SPACE = { flat: .15, pole: [.35, -.25, -.9], least: .12, cam: { s: [.35, 6, 6], f: [-.2, 3, 6], b: [-.2, 3, 6] }, ahead: 1, before: 4.5, carried: 4.5, jut: 1.5, held: .02, shield: .2, chest: 3 };
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len3 = a => Math.hypot(a[0], a[1], a[2]), unit3 = a => mul3(a, 1 / (len3(a) || 1));
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const VIEWS = {
  s: { at: v => [v[1], SEEN.depth * SPACE.flat * v[0] - v[2]], depth: v => v[0], seen: v => [v[1], SPACE.flat * v[0], v[2]] },
  f: { at: v => [-v[0], SEEN.depth * v[1] - v[2]], depth: v => v[1], seen: v => [-v[0], v[1], v[2]] },
  b: { at: v => [v[0], -SEEN.depth * v[1] - v[2]], depth: v => -v[1], seen: v => [v[0], -v[1], v[2]] },
};
const TOOL_CHUNK = 5;
function armSolved(S, T, l1, l2, sign, out) {
  let d = sub3(T, S), D = len3(d) || .001;
  const m = clamp(D, Math.abs(l1 - l2) + .01, l1 + l2 - .01);
  d = mul3(d, m / D); D = m;
  const axis = mul3(d, 1 / D), a = (l1 * l1 - l2 * l2 + D * D) / (2 * D), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const turned = out || SPACE.pole, pole = [turned[0] * sign, turned[1], turned[2]], off = sub3(pole, mul3(axis, dot3(pole, axis))), n = len3(off) > .001 ? unit3(off) : [sign, 0, 0];
  return { S, E: add3(add3(S, mul3(axis, a)), mul3(n, h)), H: add3(S, d) };
}
function aimGrounded(aim, handZ, tip, butt, head) {
  const flat = Math.hypot(aim[0], aim[1]);
  let up = aim[2];
  for (let n = 0; n < 4; n++) {
    const clear = (head || 0) * Math.sqrt(Math.max(0, 1 - up * up));
    if (handZ + up * tip < clear) up = Math.max(-1, (clear - handZ) / tip);
  }
  if (handZ - up * butt < 0) up = Math.min(1, handZ / butt);
  if (up === aim[2] || flat < .001) return aim;
  const k = Math.sqrt(Math.max(0, 1 - up * up)) / flat;
  return [aim[0] * k, aim[1] * k, up];
}
function aimSeen(aim, hand, tip, face) {
  if (face !== 'f') return aim;
  let v = aim;
  for (let n = 0; n < FOOT_LINE.turns; n++) {
    const sunk = SEEN.depth * Math.max(0, hand[1] + v[1] * tip) - (hand[2] + v[2] * tip);
    if (sunk <= FOOT_LINE.band) break;
    const up = Math.min(1, v[2] + FOOT_LINE.step), flat = Math.hypot(v[0], v[1]) || 1, k = Math.sqrt(Math.max(0, 1 - up * up)) / flat;
    v = [v[0] * k, v[1] * k, up];
  }
  return v;
}
const HEAD_CLEAR = { gap: 3.5, step: .04, turns: 40 };
function gapTo(c, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], t = clamp(((c[0] - a[0]) * dx + (c[1] - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(a[0] + dx * t - c[0], a[1] + dy * t - c[1]);
}
function aimClear(aim, face, gapOf, least) {
  const turned = (v, a) => face === 's' ? [v[0], v[1] * Math.cos(a) - v[2] * Math.sin(a), v[1] * Math.sin(a) + v[2] * Math.cos(a)] : [v[0] * Math.cos(a) - v[2] * Math.sin(a), v[1], v[0] * Math.sin(a) + v[2] * Math.cos(a)];
  let v = aim;
  for (let n = 0; n < HEAD_CLEAR.turns && gapOf(v) < least; n++) { const l = turned(v, HEAD_CLEAR.step), r = turned(v, -HEAD_CLEAR.step); v = gapOf(l) >= gapOf(r) ? l : r; }
  return v;
}
const FOOT_LINE = { band: -1.5, step: .03, turns: 67, under: 1, lifts: 3 };
function toolSeen(view, aim) {
  const v = view.at(aim);
  return { ang: Math.atan2(v[0], -v[1]) / D2R, fore: Math.hypot(v[0], v[1]) < SPACE.least ? SPACE.least : 1 };
}
function staveOf(aim, cant) {
  const up = [0, 0, 1], off = sub3(up, mul3(aim, dot3(up, aim))), u = len3(off) > .2 ? unit3(off) : unit3(sub3([0, 1, 0], mul3(aim, aim[1]))), c = (cant || 0) * D2R;
  return add3(mul3(u, Math.cos(c)), mul3(cross3(aim, u), Math.sin(c)));
}
const TOOL_REACH = { axe: 24, pick: 23, hoe: 23, hammer: 17, sword: 21, spear: 34, club: 20, torch: 12, staff: 30, ladle: 11, cup: 3, bread: 2 };
const WIDE_GRIP = { axe: [2, -6], pick: [2, -6], hoe: [-4, -6] }, gripsOf = (kind, face) => (face !== 's' && WIDE_GRIP[kind]) || TWO_HANDED[kind];
const TWO_HANDED = { axe: [0, -3], pick: [0, -3], hoe: [-8, -2], spear: [5, -13], staff: [5, -13] }, TOOL_HEAD = { axe: 7, pick: 8, hoe: 6, hammer: 4, club: 4, staff: 3 };
const TOOL_AIM = { sword: [0, .9, -.44], club: [0, .9, -.44], hammer: [0, .9, -.44], axe: [0, .9, -.44], pick: [0, .9, -.44], spear: [0, 1, .04], staff: [0, 1, .04], hoe: [0, 1, .04], torch: [0, .35, .94], ladle: [0, .3, -.95], cup: [0, 0, 1], bread: [0, 1, 0] };
const STRUCK = { reach: 1.5 };
const TWO_HANDS = { apart: 3 };
function aheadSeen(ang, ahead, back) {
  const a = ang * D2R, flat = Math.sqrt(Math.max(0, 1 - ahead * ahead)), across = Math.sin(a) * flat, down = -Math.cos(a) * flat + (back ? -1 : 1) * SEEN.depth * ahead;
  return { ang: Math.atan2(across, -down) / D2R, fore: Math.max(STOWED.least, Math.hypot(across, down)) };
}
function struckAway(ang) {
  const a = ang * D2R, across = Math.sin(a), up = Math.cos(a), ahead = STRUCK.reach * Math.max(0, -up), n = Math.hypot(across, up, ahead), rise = (up + SEEN.depth * ahead) / n;
  return { ang: Math.atan2(across / n, rise) / D2R, fore: Math.max(STOWED.least, Math.hypot(across / n, rise)) };
}
const HELD_THINGS = ['tool', 'tool butt', 'shield'];
function rigComposite(s, layers) {
  const order = layers.map((l, i) => [l, i]).sort((a, b) => a[0].cam - b[0].cam || a[1] - b[1]).map(x => x[0]), owner = new Uint8Array(s.w * s.h), near = [-1, 1, -s.w, s.w], rims = new Map();
  order.forEach((l, n) => {
    const t = l.spr, inked = l.inks ? order.findIndex(x => x.name === l.inks) + 1 : 0, rimmed = rims.get(l.limb || l.name) || rims.set(l.limb || l.name, new Set()).get(l.limb || l.name);
    for (let i = 0; i < t.c.length; i++) {
      if (!t.c[i]) continue;
      for (const d of near) {
        const q = i + d;
        if (t.c[q] || !s.c[q]) continue;
        if (inked && owner[q] === inked) s.c[q] = P.ink;
        else if (l.rim && s.c[q] !== P.ink && !rimmed.has(q) && !(l.limb && owner[q] && order[owner[q] - 1].limb === l.limb)) { s.c[q] = l.rim === 'ink' || (owner[q] && HELD_THINGS.includes(order[owner[q] - 1].name)) ? P.ink : shade(s.c[q]); rimmed.add(q); }
      }
    }
    for (let i = 0; i < t.c.length; i++) if (t.c[i]) { s.c[i] = t.c[i]; s.e[i] = t.e[i]; owner[i] = n + 1; }
  });
  return { order, owner };
}
function bowSeen(S, gx, gy, o) {
  const { half, sag, nock } = BOW, pull = o.pull || 0, mix3 = (t, off) => o.u.map((c, i) => c * t + o.v[i] * off);
  const at = (t, off) => { const p = seenAt(mix3(t, off)); return [rnd(gx + p[0]), rnd(gy + p[1])]; };
  const upright = Math.abs(seenAt(o.u)[1]) >= Math.abs(seenAt(o.u)[0]), thick = upright ? [1, 0] : [0, 1];
  if (!o.only || o.only === 'string') for (let t = -half; t <= half; t += .5) { const [x, y] = at(t, -sag - pull * (1 - Math.abs(t) / half)); S.set(x, y, P.cloth[4]); }
  if (o.arrow && (!o.only || o.only === 'arrow')) for (let d = -sag - pull; d <= nock; d += .5) { const [x, y] = at(0, d); S.set(x, y, d > nock - 2.5 ? P.iron[6] : d < -sag - pull + 1.5 ? P.cloth[5] : P.wood[5]); }
  if (!o.only || o.only === 'stave') for (let t = -half; t <= half; t += .5) {
    const [x, y] = at(t, -sag * t * t / (half * half)), held = Math.abs(t) <= 1.5;
    S.set(x, y, held ? P.leather[3] : P.wood[4]); S.set(x + thick[0], y + thick[1], held ? P.leather[1] : P.wood[2]);
  }
  return at(0, nock);
}
function arrowSeen(S, gx, gy, v, out) {
  const long = BOW.sag + BOW.nock;
  for (let d = 0; d <= out; d += .5) { const q = seenAt(v.map(c => c * d)); S.set(rnd(gx + q[0]), rnd(gy + q[1]), d > long - 2.5 ? P.iron[6] : d < 1.5 ? P.cloth[5] : P.wood[5]); }
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
