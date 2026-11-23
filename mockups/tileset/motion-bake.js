'use strict';
const FRAMES = new Map();
const STRIKES = new Set(['chop', 'mine', 'hoe', 'hammer', 'attack', 'thrust', 'bite']);
const NODS = { stir: 2, gather: 2, draw: 2, eat: 3, drink: 1, talk: 4, listen: 2, warm: 1, tired: 1, cry: 6, graze: 3, peck: 2, cud: 4, sniff: 2 };
let SEEDS = 0;

function mkActor(rig, kind, over) {
  const A = { rig, kind, seed: (++SEEDS * .618) % 1, id: rig + ':' + kind + ':' + SEEDS };
  if (rig === 'pawn') { A.o = { ...PAWNS[kind].o, ...(over || {}) }; A.base = mkPawn(A.o); A.name = PAWNS[kind].name; A.ls = FOLK[A.o.race || 'human'].legs / 10; A.as = (FOLK[A.o.race || 'human'].tl - 1) / 11; A.look = JSON.stringify(Object.entries(A.o).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])); }
  else { A.base = mkBeast(kind); A.name = (BEASTS[kind] || {}).name || OTHER[kind]; A.look = kind; }
  A.anims = rig === 'pawn' ? PAWN_ANIMS : rig === 'quad' ? QUAD_ANIMS : rig === 'fowl' ? FOWL_ANIMS : rig === 'rabbit' ? RABBIT_ANIMS : rig === 'critter' ? CRIT_ANIMS[kind] : QUAD_ANIMS;
  return A;
}
const animOf = (A, name) => A.anims[name] || A.anims.idle;
const cycleDist = (A, def) => def.gait ? (A.rig === 'quad' ? gaitDist(A.kind, def.gait) : 16) : def.dist ? def.dist * (A.ls || 1) : 0;

function mirror(s) {
  const m = s.flip();
  if (s.pts) { m.pts = {}; for (const [k, v] of Object.entries(s.pts)) m.pts[k] = k === 'feet' ? v.map(q => [s.w - 1 - q[0], q[1], q[2]]) : [s.w - 1 - v[0], v[1]]; }
  return m;
}
function bounds(s) {
  if (s.bb) return s.bb;
  let x0 = s.w, x1 = 0, y0 = s.h, y1 = 0;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.c[y * s.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return s.bb = [x0, y0, x1, y1];
}
function warp(src, op) {
  const [x0, y0, x1, y1] = bounds(src), pad = 6, s = new Spr(src.w + pad * 2, src.h + pad * 2, src.ax + pad, src.ay + pad), H = Math.max(1, y1 - y0), half = Math.max(1, (x1 - x0) / 2);
  const sq = op.sq || 0, cut = rnd(y1 - H * .45), lean = op.lean || 0, pitch = op.pitch || 0;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    let sy = y - pad, sx = x - pad;
    if (pitch) sy -= rnd(pitch * (sx - src.ax) / half);
    if (sq > 0 && sy <= cut) sy -= sq; else if (sq < 0 && sy < cut) sy = Math.min(cut, sy - sq);
    const t = clamp((y1 - sy) / H, 0, 1);
    sx -= rnd(lean * t * Math.sqrt(t));
    if (!src.ok(sx, sy)) continue;
    const i = sy * src.w + sx;
    if (src.c[i]) { s.c[y * s.w + x] = src.c[i]; s.e[y * s.w + x] = src.e[i]; }
  }
  s.sh = src.sh; s.emit = src.emit;
  return s;
}
function plainPts(s) {
  const [x0, y0, x1] = bounds(s);
  return { head: [s.ax, y0 - 3], mouth: [x1 - 2, y0 + 8], tip: [x1, y0 + 6], hand: [x1, y0 + 20], body: [s.ax, (y0 + s.ay) >> 1], feet: [[s.ax - 3, s.ay, true], [s.ax + 3, s.ay, true]] };
}
function cachedFrame(key, make) {
  let s = FRAMES.get(key);
  if (!s) { if (FRAMES.size > 9000) FRAMES.clear(); s = make(); if (!s.pts) s.pts = plainPts(s); packSpr(s); FRAMES.set(key, s); }
  return s;
}
const quant = (p, a) => JSON.stringify(p, (k, v) => typeof v === 'number' ? (k === 'tool' || k === 'snout' || k === 'a' ? Math.round(v / a) * a : k === 'ph' ? Math.round(v * 4) / 4 : Math.round(v * 2) / 2) : v);

function procOp(A, st, def, u) {
  const a = st.anim, op = { dx: 0, dy: 0, lean: 0, sq: 0, pitch: 0 }, beast = A.rig !== 'pawn', h = def.hit ? def.hit[0] : .5;
  if (def.dist || def.gait) {
    const fast = a === 'run' || a === 'panic' || a === 'bolt' || a === 'flap', b = Math.abs(Math.sin(u * TAU));
    op.dy = -rnd(b * (fast ? 2.4 : a === 'trot' ? 1.6 : 1));
    if (a === 'hop' || a === 'bolt') { const k = Math.sin(clamp((u - .15) / .7, 0, 1) * Math.PI); op.dy = -rnd(k * 6); op.sq = k > .2 ? -1 : u > .85 ? 1 : 0; }
    else if (beast) op.pitch = fast ? rnd(Math.sin(u * TAU) * 1.4) : 0; else op.lean = fast ? 2 : a === 'stalk' ? 2 : 1;
    if (a === 'stalk') { op.sq = 1; op.dy = 0; }
  } else if (STRIKES.has(a)) {
    if (u > h - .25 && u < h - .05) { op.lean = beast ? 0 : -1; op.dx = -1; }
    else if (u >= h - .05 && u < h + .16) { op.dx = 4; op.lean = beast ? 0 : 2; op.sq = 1; op.pitch = beast ? 1 : 0; }
  } else if (a === 'idle' || a === 'sit' || a === 'look' || a === 'guard' || a === 'watch' || a === 'rest' || a === 'sleep') op.sq = u > .35 && u < .8 ? -1 : 0;
  else if (NODS[a]) { op.sq = Math.sin(u * TAU * NODS[a]) > .3 ? 1 : 0; if (a === 'graze' || a === 'sniff' || a === 'peck') op.pitch = a === 'peck' ? (op.sq ? 3 : 0) : 3; if (a === 'talk') op.dy = -op.sq; if (a === 'tired') op.sq = u > .3 && u < .7 ? -2 : 0; }
  else if (a === 'hit' || a === 'stagger' || a === 'shake') { op.dx = (Math.floor(u * 8) & 1 ? 2 : -2) * (1 - u); op.sq = u < .5 ? 1 : 0; }
  else if (a === 'alert') { op.dy = u < .2 ? -3 : 0; op.sq = u < .2 ? -1 : 0; op.pitch = -1; }
  else if (a === 'howl') op.pitch = u > .2 && u < .85 ? -3 : 0;
  else if (a === 'shoot') { op.lean = u > .3 && u < .76 ? -1 : 0; op.dx = u >= .76 && u < .86 ? -1 : 0; }
  else if (a === 'block') { op.lean = u > .3 ? -1 : 0; op.dx = u > .48 && u < .7 ? -2 : 0; }
  else if (a === 'lift') op.sq = u > .3 && u < .6 ? 2 : 0;
  else if (a === 'up') op.sq = -2;
  return op;
}
function procFrame(A, st, def, u, lvl) {
  const a = st.anim, lie = a === 'sleep' || a === 'down' || (a === 'fall' && u > .5);
  if (!lvl) {
    if (lie && A.rig !== 'pawn') return a === 'sleep' ? { s: cachedFrame(A.look + '|0', () => A.base), dx: 0, dy: 0 } : null;
    const s = lie ? cachedFrame(A.look + '|0lie', () => laid(A.base)) : cachedFrame(A.look + '|0', () => A.base);
    let dx = 0;
    if (STRIKES.has(a) && def.hit) { const k = (u - def.hit[0]) * def.dur / .26; if (k > 0 && k < 1) dx = rnd(Math.sin(k * Math.PI) * 12.8) * (st.flip ? -1 : 1); }
    return { s, dx, dy: 0 };
  }
  if (lie && A.rig === 'pawn') { const br = a === 'sleep' && u > .35 && u < .8; return { s: cachedFrame(A.look + '|1lie' + (br ? 1 : 0), () => laid(br ? warp(A.base, { sq: -1 }) : A.base)), dx: 0, dy: 0 }; }
  if (lie) return { s: cachedFrame(A.look + '|1dead' + (st.flip ? 'f' : ''), () => { const w = warp(A.base, { sq: Math.floor((bounds(A.base)[3] - bounds(A.base)[1]) * .34), pitch: 2 }); return st.flip ? mirror(w) : w; }), dx: 0, dy: 0 };
  const op = procOp(A, st, def, u), key = A.look + '|1|' + (st.flip ? 'f' : '') + op.lean + ',' + op.sq + ',' + op.pitch;
  const s = cachedFrame(key, () => { const w = op.lean || op.sq || op.pitch ? warp(A.base, op) : A.base; return st.flip ? mirror(w) : w; });
  return { s, dx: rnd(op.dx) * (st.flip ? -1 : 1), dy: op.dy };
}

function frameOf(A, st, lvl, smooth) {
  const def = animOf(A, st.anim), n = (def.n || 6) * (smooth ? 3 : 1), u0 = clamp(st.u - Math.floor(st.u), 0, .9999), u = (Math.floor(u0 * n) + .5) / n;
  if (lvl < 2 || A.rig === 'plain') return procFrame(A, st, def, lvl ? u : u0, lvl);
  const c = { face: st.face || 's', lvl, t: st.t || 0, seed: A.seed, tool: A.o && A.o.tool, o: A.rig === 'quad' ? BEASTS[A.kind].o : null }, ang = smooth ? 2 : 5;
  let flip = !!st.flip, make, pose;
  if (A.rig === 'pawn') {
    pose = def.pose(u, c);
    if (pose.lie) return { s: cachedFrame(A.look + '|lie' + (pose.br ? 1 : 0) + lvl, () => laid(rigPawn(A.o, { face: 'f', blink: 1, br: pose.br, item: null }))), dx: 0, dy: 0 };
    for (const k of ['hl', 'hr']) if (pose[k]) pose[k] = [pose[k][0] * A.as, pose[k][1] * A.as];
    for (const k of ['fl', 'fr']) if (pose[k]) pose[k] = [pose[k][0] * A.ls, pose[k][1] * A.ls];
    if (pose.by) pose.by *= A.ls;
    if (pose.two) pose.two *= A.as;
    if (pose.face !== 's') flip = false;
    make = () => rigPawn(A.o, JSON.parse(key0));
  } else if (A.rig === 'quad') {
    const fb = c.face !== 's' && FB_ANIMS[st.anim];
    if (fb) { pose = fb(u, c); flip = false; make = () => rigQuadFB(A.kind, JSON.parse(key0), c.face === 'b'); }
    else { pose = def.pose(u, c); make = () => rigQuad(A.kind, JSON.parse(key0)); }
  } else if (A.rig === 'critter') { pose = def.pose(u, c); make = () => rigCritter(A.kind, JSON.parse(key0)); }
  else { pose = def.pose(u, c); make = () => (A.rig === 'fowl' ? rigFowl : rigRabbit)(JSON.parse(key0)); }
  const key0 = quant(pose, ang), key = A.look + '|' + lvl + (c.face !== 's' ? c.face : '') + (flip ? 'F' : '') + key0;
  return { s: cachedFrame(key, () => { const s = make(); return flip ? mirror(s) : s; }), dx: 0, dy: 0 };
}

function rotated(src, deg, dir) {
  const a = deg * D2R * dir, cs2 = Math.cos(a), sn2 = Math.sin(a), R = Math.ceil(Math.hypot(src.w, src.h)), s = new Spr(R * 2, R * 2, R, R);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const dx = x - R, dy = y - R, sx = rnd(src.ax + dx * cs2 + dy * sn2), sy = rnd(src.ay - dx * sn2 + dy * cs2);
    if (!src.ok(sx, sy)) continue;
    const i = sy * src.w + sx;
    if (src.c[i]) { s.c[y * s.w + x] = src.c[i]; s.e[y * s.w + x] = src.e[i]; }
  }
  s.sh = src.sh && { rx: src.sh.rx * (1 + deg / 70), ry: src.sh.ry, dx: (src.sh.dx || 0) + dir * deg * .25, dy: src.sh.dy || 0, k: src.sh.k };
  s.leaf = src.leaf;
  return s;
}
