'use strict';
const FRAMES = new Map();
const LOOK_CAST = {};
const IN_HAND_GEAR = ['tool', 'shield'];
const inHandOf = gear => Object.fromEntries(IN_HAND_GEAR.filter(k => gear && k in gear).map(k => [k, gear[k]]));
const STRIKES = new Set(['chop', 'mine', 'hoe', 'hammer', 'attack', 'thrust', 'bite']);
const NODS = { stir: 2, gather: 2, draw: 2, eat: 3, drink: 1, talk: 4, listen: 2, warm: 1, tired: 1, cry: 6, graze: 3, peck: 2, cud: 4, sniff: 2 };
let SEEDS = 0;

function mkActor(rig, kind, over) {
  const A = { rig, kind, seed: (++SEEDS * .618) % 1, id: rig + ':' + kind + ':' + SEEDS };
  const cast = rig === 'pawn' && (LOOK_CAST[kind] || (LOOK_STYLE.pieces ? dressedLook(kind) : null));
  if (cast) { A.lookOf = cast.look; A.gear = { ...(LOOK_STYLE.pieces ? inHandOf(cast.gear) : cast.gear || {}), ...(over || {}) }; A.o = { ...(LOOK_STYLE.pieces ? FOLK_PARTS.rigged(cast.look) : lookRig(cast.look)).o, ...A.gear }; A.base = drawLook(cast.look, 's', null, { face: 's' }, A.gear); A.name = cast.name; A.ls = FOLK[A.o.race].legs / 10; A.as = (FOLK[A.o.race].tl - 1) / 11; A.look = JSON.stringify(cast.look) + JSON.stringify(A.gear); }
  else if (rig === 'pawn') { A.o = { ...PAWNS[kind].o, ...(over || {}) }; A.base = mkPawn(A.o); A.name = PAWNS[kind].name; A.ls = FOLK[A.o.race || 'human'].legs / 10; A.as = (FOLK[A.o.race || 'human'].tl - 1) / 11; A.look = JSON.stringify(Object.entries(A.o).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])); }
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
function cachedFrame(plain, make) {
  const key = (LOOK_STYLE.pieces ? 'pieces|' : '') + plain;
  let s = FRAMES.get(key);
  if (!s) { if (FRAMES.size > 9000) FRAMES.clear(); s = make(); if (!s.pts) s.pts = plainPts(s); packSpr(s); FRAMES.set(key, s); }
  return s;
}
const FINE_KEYS = ['ahead', 'stow', 'cu', 'reach', 'bow', 'pull', 'grip'];
const quant = (p, a) => JSON.stringify(p, (k, v) => typeof v === 'number' ? (k === 'tool' || k === 'snout' || k === 'a' ? Math.round(v / a) * a : k === 'ph' ? Math.round(v * 4) / 4 : FINE_KEYS.includes(k) ? Math.round(v * 10) / 10 : Math.round(v * 2) / 2) : v);

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
  const a = st.anim, lie = a === 'sleep' || a === 'down' || a === 'out' || (a === 'fall' && u > .5);
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

function fitted(A, pose) {
  for (const k of ['hl', 'hr']) if (pose[k]) pose[k] = [pose[k][0] * A.as, pose[k][1] * A.as];
  for (const k of ['R', 'L']) if (pose[k]) pose[k] = pose[k].map(v => v * A.as);
  for (const k of ['fl', 'fr']) if (pose[k]) pose[k] = [pose[k][0] * A.ls, pose[k][1] * A.ls];
  if (pose.by) pose.by *= A.ls;
  if (pose.two) pose.two *= A.as;
  return pose;
}
function frameOf(A, st, lvl, smooth) {
  const def = animOf(A, st.anim), n = (def.n || 6) * (smooth ? 3 : 1), u0 = clamp(st.u - Math.floor(st.u), 0, .9999), u = (Math.floor(u0 * n) + .5) / n;
  if (lvl < 2 || A.rig === 'plain') return procFrame(A, st, def, lvl ? u : u0, lvl);
  const c = { face: st.face || 's', lvl, t: st.t || 0, seed: A.seed, tool: A.o && A.o.tool, hold: A.load ? A.load.hold : 'chest', long: !!A.load && A.load.family === 'long', ...(A.load ? HAUL.span(A.load, A.load.hold, st.face || 's') : null), o: A.rig === 'quad' ? BEASTS[A.kind].o : null }, ang = smooth ? 2 : 5;
  let flip = !!st.flip, make, pose;
  if (A.rig === 'pawn') {
    pose = posed(st.anim, def, u, c);
    if (pose.lie) { const q = { br: pose.br ? 1 : 0, rest: pose.rest ? 1 : 0, out: pose.out ? 1 : 0, bent: pose.bent ? 1 : 0 }, fl = !!st.flip !== (c.face === 'f' && FALLS_OVER.includes(st.anim)), let_go = pose.loose && c.tool ? c.tool : ''; return { s: cachedFrame(A.look + '|lie' + JSON.stringify(q) + (fl ? 'F' : '') + let_go, () => { const lying = A.lookOf ? drawLook(A.lookOf, 's', null, { lie: 1, ...q }, A.gear) : rigPawnLie(A.o, q), s = let_go ? dropped(lying, let_go, 's', 1, lainReach(A)) : lying; return fl ? mirror(s) : s; }), dx: 0, dy: 0 }; }
    fitted(A, pose);
    if (pose.face !== 's') flip = false;
    make = () => A.lookOf ? drawLook(A.lookOf, pose.face, null, JSON.parse(key0), A.gear) : rigPawn(A.o, JSON.parse(key0));
  } else if (A.rig === 'quad') {
    const fb = c.face !== 's' && FB_ANIMS[st.anim];
    if (fb) { pose = fb(u, c); flip = false; make = () => rigQuadFB(A.kind, JSON.parse(key0), c.face === 'b'); }
    else { pose = def.pose(u, c); make = () => rigQuad(A.kind, JSON.parse(key0)); }
  } else if (A.rig === 'critter') { pose = def.pose(u, c); make = () => rigCritter(A.kind, JSON.parse(key0)); }
  else { pose = def.pose(u, c); make = () => (A.rig === 'fowl' ? rigFowl : rigRabbit)(JSON.parse(key0)); }
  const layer = pose.carry && A.load ? HAUL.layer(A.load, pose.carry, c.face, pose.down > .5) : null;
  if (layer && A.rig === 'pawn') pose.load = [layer.spr.w, layer.spr.h, ...layer.grip, ...(layer.hand || layer.grip), layer.rows ? 1 : 0, layer.draped ? 1 : 0, layer.yoked ? 1 : 0, layer.spr.head ? layer.spr.head[1] : -1, layer.under ? 1 : 0, layer.hafted ? 1 : 0];
  const key0 = quant(pose, ang), key = A.look + '|' + lvl + (c.face !== 's' ? c.face : '') + (flip ? 'F' : '') + key0 + (layer ? '|' + layer.key : '');
  return { s: cachedFrame(key + (pose.loose && c.tool ? '|' + c.tool : ''), () => { const bare = make(), laden = layer && bare.mask ? MOTION_LOAD.put(bare, layer) : bare, leant = pose.tip ? tipped(laden, c.face === 'f' ? -pose.tip : pose.tip) : laden, s = pose.loose && c.tool ? dropped(leant, c.tool, c.face, pose.loose, lainReach(A)) : leant; if (!s.pts) s.pts = {}; return flip ? mirror(s) : s; }), dx: 0, dy: 0 };
}

const FALLS_OVER = ['fall', 'down'], DROPPED = { rest: [12, 1], clear: 2, lies: 90, quick: 1.6, from: { s: [7, -9], f: [-8, -9], b: [8, -9] } };
const UNPOSED_LIE = { br: 0, rest: 0, out: 0, bent: 0 };
function lainReach(A) {
  const lying = cachedFrame(A.look + '|lain', () => A.lookOf ? drawLook(A.lookOf, 's', null, { lie: 1, ...UNPOSED_LIE }, A.gear) : rigPawnLie(A.o, UNPOSED_LIE));
  let far = 0;
  for (let q = 0; q < lying.c.length; q++) if (lying.c[q]) far = Math.max(far, q % lying.w - lying.ax);
  return { far, room: Math.min(lying.ax, lying.w - 1 - lying.ax) };
}
function dropped(pawn, kind, face, k, reach) {
  const loose = new Spr(pawn.w, pawn.h, pawn.ax, pawn.ay), from = DROPPED.from[face], side = face === 'f' ? -1 : 1, rest = Math.min(Math.max(DROPPED.rest[0], reach.far + 1 + DROPPED.clear + TOOL_BUTT[kind]), reach.room - TOOL_REACH[kind] - 2), x = pawn.ax + rnd(mix(from[0], side * rest, k)), y = pawn.ay + rnd(mix(from[1], DROPPED.rest[1], Math.min(1, (k * DROPPED.quick) ** 2)));
  const held = toolSeen(VIEWS[face], unit3((carried3({ tool: kind }, 0) || {}).aim || [0, 0, 1]));
  toolAt(loose, kind, x, y, mix(held.ang, side * DROPPED.lies, k), { fore: mix(held.fore, 1, k) });
  loose.outline();
  for (let q = 0; q < loose.c.length; q++) if (loose.c[q] && !pawn.c[q]) { pawn.c[q] = loose.c[q]; pawn.e[q] = loose.e[q]; }
  return pawn;
}
function tipped(src, deg) {
  const a = -deg * D2R, cs2 = Math.cos(a), sn2 = Math.sin(a), s = new Spr(src.w, src.h, src.ax, src.ay);
  const slid = rnd(Math.sign(deg) * (src.ay - bounds(src)[1]) / 2 * Math.sin(Math.abs(deg) * D2R) * (deg / FELL.flat) ** 2);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const dx = x - slid - src.ax, dy = y - src.ay, sx = rnd(src.ax + dx * cs2 + dy * sn2), sy = rnd(src.ay - dx * sn2 + dy * cs2);
    if (src.ok(sx, sy) && src.c[sy * src.w + sx]) { s.c[y * s.w + x] = src.c[sy * src.w + sx]; s.e[y * s.w + x] = src.e[sy * src.w + sx]; }
  }
  const sunk = bounds(s)[3] - bounds(src)[3];
  s.bb = null;
  if (sunk > 0) for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const from = y + sunk < s.h ? (y + sunk) * s.w + x : -1; s.c[y * s.w + x] = from < 0 ? 0 : s.c[from]; s.e[y * s.w + x] = from < 0 ? 0 : s.e[from]; }
  s.sh = src.sh;
  return closed(s);
}
const SPUR_PASSES = 3;
function closed(s) {
  const seen = new Uint8Array(s.c.length), groups = [], near = q => [q - 1, q + 1, q - s.w, q + s.w];
  for (let q = 0; q < s.c.length; q++) {
    if (!s.c[q] || seen[q]) continue;
    const group = [q];
    seen[q] = 1;
    for (let k = 0; k < group.length; k++) for (const n of near(group[k])) if (n >= 0 && n < s.c.length && s.c[n] && !seen[n] && Math.abs((n % s.w) - (group[k] % s.w)) <= 1) { seen[n] = 1; group.push(n); }
    groups.push(group);
  }
  const most = Math.max(0, ...groups.map(g => g.length));
  for (const g of groups) if (g.length < most) for (const q of g) { s.c[q] = null; s.e[q] = 0; }
  const joined = q => near(q).filter(n => n >= 0 && n < s.c.length && s.c[n] && Math.abs((n % s.w) - (q % s.w)) <= 1).length;
  for (let pass = 0; pass < SPUR_PASSES; pass++) { const spurs = []; for (let q = 0; q < s.c.length; q++) if (s.c[q] && joined(q) <= 1) spurs.push(q); for (const q of spurs) { s.c[q] = null; s.e[q] = 0; } }
  const edge = [];
  for (let q = 0; q < s.c.length; q++) if (s.c[q] && near(q).some(n => n < 0 || n >= s.c.length || !s.c[n] || Math.abs((n % s.w) - (q % s.w)) > 1)) edge.push(q);
  for (const q of edge) s.c[q] = P.ink;
  s.bb = null;
  return s;
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
