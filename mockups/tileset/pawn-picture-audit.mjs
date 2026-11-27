export const PICTURE_KEYS = ['q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'K', 'L', 'N', 'O', 'P', 'R', 'S'];
export const PICTURE_NAMED = { q: 'arm not joined to a hand', r: 'arm tapers to a point', s: 'see-through pixel', t: 'length lost in profile', u: 'below the foot line', v: 'torn tipping outline', w: 'held thing shows with no hand showing on it', x: 'held thing against the face', y: 'legs shortened', B: 'arms knotted', C: 'tool in line with the arm', D: 'load cut short', E: 'carried body shows no head', F: 'load over one arm and under the other', G: 'hand on the wide end', H: 'load does not read', K: 'load in the arms shows above the shoulders from behind', L: 'carried person not cradled in both arms', N: 'tool shows shorter than it is drawn', O: 'hand off a two-handed tool', P: 'tool on the wrong side of the head or back', R: 'load on the shoulders hidden or crossed by the arms', S: 'block held at its edge with no hand under it' };
const HAND_BLOCK = 4, TAPER = { long: 5, thin: 1, wide: 3 }, FIN = { out: 4, above: 1 }, PROFILE = .8, BAND = 2, LEGS = .6, TOUCH = 1;
const LEG_LAYERS = ['legs', 'far leg', 'near leg'], BROW = 6, FRONT = 5, GRASPED = .2;
const SHOWS = 3, APART = 4, IN_LINE = { cos: .94, reach: 5, tools: ['hammer', 'club', 'axe', 'pick'] }, WHOLE = .6, HEAD_SHOWS = .6, WIDE_END = 1, IN_ARMS = ['chest', 'low', 'cradle'];
const KEPT_AS_APPROVED = { x: ['shoulder'] };
const QUIVERED = .9, BODY_HIDES = ['bow', 'arrow'];
const CRADLE = { palm: 3, across: 2, above: 3, below: 2 };
const HIDDEN = { share: .88, least: 10, head: 2 }, LAPPED = 4, SEEN_DEPTH = .4, FLAT_AIM = .3, SUNK_SHARE = .5, GRIP_OFF = 2.5, GRABBED = .15, FACE = { dark: .5, marks: 4 }, POLES = ['spear', 'staff'], LEVEL = 2, UPRIGHT = .7, YOKED = { above: .2 }, BLOCK = { wide: 12, tall: 8, under: 2, along: 3 };
const READS = { bars: s => s.w <= 9 && s.w >= 2 * s.h, bundles: s => s.filled <= .6 * s.w * s.h };

const same = (a, b) => Math.abs(a[0] - b[0]) < 1.01 && Math.abs(a[1] - b[1]) < 1.01 && Math.abs(a[2] - b[2]) < 1.01;
const pixels = spr => { const out = []; for (let i = 0; i < spr.c.length; i++) if (spr.c[i]) out.push(i); return out; };
const box = (px, w) => { let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1; for (const i of px) { const x = i % w, y = (i / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return px.length ? [x0, y0, x1, y1] : null; };
function pieces(px, w) {
  const left = new Set(px);
  let n = 0;
  while (left.size) {
    n++;
    const todo = [left.values().next().value];
    left.delete(todo[0]);
    while (todo.length) { const i = todo.pop(), x = i % w; for (const dy of [-w, 0, w]) for (const dx of [-1, 0, 1]) { const q = i + dy + dx; if (Math.abs((q % w) - x) <= 1 && left.has(q)) { left.delete(q); todo.push(q); } } }
  }
  return n;
}
function tapers(px, w, shoulder) {
  const b = box(px, w);
  if (!b) return false;
  const along = b[2] - b[0] >= b[3] - b[1], long = along ? b[2] - b[0] + 1 : b[3] - b[1] + 1, widths = new Map();
  if (long < TAPER.long) return false;
  for (const i of px) { const k = along ? i % w : (i / w) | 0; widths.set(k, (widths.get(k) || 0) + 1); }
  const inner = [...widths.entries()].sort((a, b) => a[0] - b[0]).slice(1, -1), at = shoulder ? shoulder[along ? 0 : 1] : null, capFirst = at !== null && inner.length > 1 && Math.abs(inner[0][0] - at) < Math.abs(inner[inner.length - 1][0] - at);
  const past = at === null ? inner : capFirst ? inner.slice(inner.length >> 1) : inner.slice(0, (inner.length + 1) >> 1);
  return inner.length > 1 && Math.max(...inner.map(e => e[1])) >= TAPER.wide && Math.min(...past.map(e => e[1])) <= TAPER.thin;
}
const axisOf = (px, w) => { let mx = 0, my = 0; for (const i of px) { mx += i % w; my += (i / w) | 0; } mx /= px.length; my /= px.length; let xx = 0, yy = 0, xy = 0; for (const i of px) { const dx = i % w - mx, dy = ((i / w) | 0) - my; xx += dx * dx; yy += dy * dy; xy += dx * dy; } const a = .5 * Math.atan2(2 * xy, xx - yy); return [Math.cos(a), Math.sin(a), mx, my]; };
const alongAxis = (px, w, ax) => { let lo = 1e9, hi = -1e9; for (const i of px) { const t = (i % w - ax[2]) * ax[0] + (((i / w) | 0) - ax[3]) * ax[1]; if (t < lo) lo = t; if (t > hi) hi = t; } return px.length ? hi - lo + 1 : 0; };
const crosses = (a, b, c, d) => { const side = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])); return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0; };
const centre = (px, w) => { let x = 0, y = 0; for (const i of px) { x += i % w; y += (i / w) | 0; } return [x / px.length, y / px.length]; };
const touches = (a, b, w) => { const near = new Set(); for (const i of a) for (let dy = -TOUCH; dy <= TOUCH; dy++) for (let dx = -TOUCH; dx <= TOUCH; dx++) near.add(i + dy * w + dx); return b.some(i => near.has(i)); };

export function pictured(now, face, ink) {
  const counts = Object.fromEntries(PICTURE_KEYS.map(k => [k, 0])), shown = now.spr.c, w = now.spr.w, sp = now.rigged.space, said = [];
  const stack = [...now.rigged.layers, ...(now.spr.loadLayer ? [now.spr.loadLayer] : [])].map((l, k) => [l, k]).sort((a, b) => a[0].cam - b[0].cam || a[1] - b[1]).map(x => x[0]);
  const isInk = c => same(c, ink), limbs = new Map(), hands = [];
  for (const l of stack) if (l.limb) { const px = pixels(l.spr); if (!limbs.has(l.limb)) limbs.set(l.limb, { all: [], hand: [], segs: [], anchor: l.anchor, lost: l.lost, path: l.path }); const limb = limbs.get(l.limb); limb.all.push(...px); if (l.seg === 'hand') { limb.hand = px; hands.push(...px); } else limb.segs.push([l.seg, px]); }
  const top = new Int16Array(shown.length).fill(-1);
  stack.forEach((l, k) => { const c = l.spr.c; for (let i = 0; i < c.length; i++) if (c[i]) top[i] = k; });
  const showing = l => { const k = stack.indexOf(l), out = []; for (let i = 0; i < top.length; i++) if (top[i] === k && shown[i] && (l.name !== 'load' || same(shown[i], l.spr.c[i]))) out.push(i); return out; };
  const middleX = now.rigged.pts.torso ? now.rigged.pts.torso[0] : now.spr.ax, half = sp ? sp.torso.half : 6;
  for (const [name, limb] of limbs) {
    if (!limb.all.length || limb.lost) continue;
    if (limb.hand.length < Math.min(HAND_BLOCK, 2 * (sp && sp.armWide || HAND_BLOCK) - 1)) { counts.q++; said.push(name + ' has no hand block'); }
    else if (pieces(limb.all, w) > 1) { counts.q++; said.push(name + ' is in pieces'); }
    for (const [seg, px] of limb.segs) if (tapers(px, w, seg === 'upper' ? limb.anchor : null)) { counts.r++; said.push(name + ' ' + seg + ' tapers'); }
    if (face !== 's' && limb.anchor && limb.hand.length) {
      const side = Math.sign(limb.anchor[0] - middleX) || 1, out = limb.all.filter(i => ((i % w) - limb.anchor[0]) * side >= FIN.out && ((i / w) | 0) <= limb.anchor[1] + FIN.above).length, hb = box(limb.hand, w), inward = Math.abs((hb[0] + hb[2]) / 2 - middleX) < half && (hb[1] + hb[3]) / 2 > limb.anchor[1];
      if (out && inward) { counts.r++; said.push(name + ' fins out at the shoulder'); }
    }
  }
  const lumaOf = c => .3 * c[0] + .59 * c[1] + .11 * c[2];
  const showing0 = px => px.filter(i => top[i] >= 0 && stack[top[i]].seg === 'hand').length;
  const shadeRimmed = i => !!now.shade && stack.some(l => l.rim && l.rim !== 'ink' && !l.spr.c[i] && [i - 1, i + 1, i - w, i + w].some(q => l.spr.c[q])) && stack.some(l => l.spr.c[i] && same(shown[i], now.shade(l.spr.c[i])));
  for (let i = 0; i < shown.length; i++) {
    if (!shown[i] || isInk(shown[i])) continue;
    let owner = null;
    for (let k = stack.length - 1; k >= 0 && !owner; k--) if (stack[k].spr.c[i]) owner = stack[k];
    if (owner && !same(shown[i], owner.spr.c[i]) && !stack.some(l => l.spr.c[i] && same(shown[i], l.spr.c[i])) && !shadeRimmed(i)) counts.s++;
  }
  const tools = stack.filter(l => l.name === 'tool' || l.name === 'tool butt'), toolPx = tools.filter(l => l.piece !== 'arrow' && l.piece !== 'string').flatMap(l => pixels(l.spr));
  if (face === 's' && sp && sp.tool && toolPx.length) {
    const b = box(toolPx, w), drawn = Math.hypot(b[2] - b[0] + 1, b[3] - b[1] + 1), real = sp.tool === 'bow' ? 2 * now.bowHalf : sp.reach + sp.butt;
    if (real > 4 && drawn < PROFILE * real) { counts.t++; said.push('tool ' + drawn.toFixed(0) + ' px of ' + real.toFixed(0)); }
  }
  const all = box(pixels(now.spr), w);
  if (sp && all && all[3] > sp.groundRow + BAND) { counts.u++; said.push((all[3] - sp.groundRow) + ' px below the foot line'); }
  const rigid = tools.filter(l => l.piece !== 'arrow' && l.piece !== 'string'), loads = stack.filter(l => l.name === 'load'), onGround = now.pose.down > .5 && !(now.pose.reach >= 1) && !now.waited;
  const ownArm = h => { const mine = l => l.limb === h.limb || l.name === 'pad', k = new Set(stack.map((l, i) => mine(l) || l.name === 'tool' || l.name === 'tool butt' ? i : -1)), px = pixels(h.spr); return px.length && 4 * px.filter(i => k.has(top[i])).length >= px.length ? stack.filter(l => mine(l) && l !== h).flatMap(showing) : []; };
  const shaft = now.pose.shaft, quivered = !!shaft && shaft[2] < -QUIVERED * Math.hypot(...shaft);
  const inFront = h => face === 'b' && h.grips === 'load' && (IN_ARMS.includes(now.pose.carry) || now.pose.down > .5) && !showing(h).length ? stack.filter(l => l.limb === h.limb && l !== h).flatMap(showing) : [];
  const handsOn = kind => { const own = stack.filter(l => l.seg === 'hand' && l.grips === kind); return (own.length ? own : stack.filter(l => l.seg === 'hand')).flatMap(h => [...showing(h), ...ownArm(h), ...inFront(h)]); };
  const drawnOf = ls => ls.flatMap(l => pixels(l.spr)), arrowsOf = tools.filter(l => l.piece === 'arrow');
  const things = [['tool', rigid.flatMap(showing), handsOn('tool'), drawnOf(rigid)], ['arrow', quivered ? [] : arrowsOf.flatMap(showing), stack.filter(l => l.seg === 'hand').flatMap(showing), drawnOf(arrowsOf)], ...(onGround ? [] : loads.map(l => ['load', showing(l), handsOn('load'), pixels(l.spr)]))];
  const behindBody = what => { const own = stack.filter(l => l.seg === 'hand' && l.grips === 'tool' && (what === 'arrow' ? l.piece !== 'stave' : l.piece !== 'string')); return own.length > 0 && own.every(h => showing(h).length < SHOWS); };
  for (const [what, px, by, drawn] of things) if (px.length >= SHOWS && !touches(drawn, by, w) && !(BODY_HIDES.includes(what === 'tool' ? sp && sp.tool : what) && (face === 'b' || behindBody(what))) && !(face === 'b' && what === 'tool' && behindBody(what))) { counts.w++; said.push(what + ' shows ' + px.length + ' px with no hand showing on it'); }
  if (toolPx.length) {
    const ax = axisOf(toolPx, w), seen = rigid.flatMap(showing), gripped = toolPx.filter(i => top[i] >= 0 && stack[top[i]].limb), underHead = toolPx.filter(i => top[i] >= 0 && stack[top[i]].name === 'head'), behindBack = face !== 'f' ? toolPx.filter(i => top[i] >= 0 && !stack[top[i]].limb && !rigid.includes(stack[top[i]]) && (face === 'b' || stack[top[i]].name !== 'head')) : [];
    const paired = !!(sp && sp.arms && sp.arms.second && sp.arms.aim && sp.tool !== 'bow'), along = i => (i % w - ax[2]) * ax[0] + (((i / w) | 0) - ax[3]) * ax[1];
    const offGrip = px => { const cx = px.reduce((t, i) => t + i % w, 0) / px.length, cy = px.reduce((t, i) => t + ((i / w) | 0), 0) / px.length; return !toolPx.some(i => Math.hypot(i % w - cx, ((i / w) | 0) - cy) <= GRIP_OFF); };
    const depthOf = () => { const aim = sp.arms.aim, flat = [aim[0], -SEEN_DEPTH * aim[1] - aim[2]], run = Math.hypot(flat[0], flat[1]), way = flat[0] * ax[0] + flat[1] * ax[1] >= 0 ? 1 : -1, tip = Math.max(...toolPx.map(i => way * along(i))); return run < FLAT_AIM ? null : i => sp.arms.R.H[1] + aim[1] * (sp.reach - (tip - way * along(i)) / run); };
    const trunk = stack.filter(l => !l.limb && l.seg !== 'hand' && l.name !== 'load' && !tools.includes(l)), wrongSide = () => { const at = depthOf(); return at ? [...underHead.filter(i => at(i) < sp.head.at[1]), ...seen.filter(i => at(i) > sp.torso.deep && trunk.some(l => l.spr.c[i]))] : []; };
    counts.rigid = { all: alongAxis(toolPx, w, ax), seen: alongAxis([...seen, ...(seen.length ? gripped : [])], w, ax), px: seen.length, sunk: face === 'b' && behindBack.length >= SUNK_SHARE * toolPx.length };
    const pole = POLES.includes(sp && sp.tool), torso = stack.find(l => l.name === 'torso'), across = torso ? rigid.map(l => [l, pixels(l.spr).filter(i => torso.spr.c[i]).length]).filter(q => q[1]) : [];
    if (pole && face === 's') { const over = across.filter(q => q[0].cam > torso.cam).reduce((t, q) => t + q[1], 0), under = across.reduce((t, q) => t + q[1], 0) - over; counts.poleSide = over >= LAPPED && over > under ? 1 : under >= LAPPED ? -1 : 0; }
    const level = !!(sp && sp.arms && sp.arms.aim) && Math.abs(sp.arms.aim[0]) >= LEVEL * Math.max(Math.abs(sp.arms.aim[1]), Math.abs(sp.arms.aim[2])), shielded = toolPx.filter(i => top[i] >= 0 && stack[top[i]].name === 'shield'), fisted = stack.some(l => l.seg === 'hand' && l.grips === 'tool' && showing(l).length >= SHOWS);
    if (pole && face !== 's' && !paired && sp.arms.aim && sp.arms.aim[2] >= UPRIGHT) { const rowsOf = px => Math.max(...px.map(i => (i / w) | 0)), feet = stack.filter(l => LEG_LAYERS.includes(l.name)).flatMap(l => pixels(l.spr)); if (feet.length && rowsOf(toolPx) > rowsOf(feet)) { counts.u++; said.push('the upright pole ends ' + (rowsOf(toolPx) - rowsOf(feet)) + ' px below the feet'); } }
    const open = alongAxis([...seen, ...gripped, ...shielded, ...(paired || !level || !fisted ? behindBack : [])], w, ax), lost = paired ? face === 'b' ? [...new Set([...wrongSide(), ...(pole ? underHead : [])])] : underHead : [];
    if ((paired || pole) && counts.rigid.all >= HIDDEN.least && seen.length && open < HIDDEN.share * counts.rigid.all) { counts.N++; said.push('tool shows ' + open.toFixed(1) + ' px of ' + counts.rigid.all.toFixed(1)); }
    if (lost.length >= HIDDEN.head) { counts.P++; said.push(lost.length + (face === 'b' ? ' px of the tool on the wrong side of the body' : ' px of the tool behind the head')); }
    for (const h of paired ? stack.filter(l => l.seg === 'hand' && l.grips === 'tool') : []) if (showing(h).length >= SHOWS && offGrip(pixels(h.spr))) { counts.O++; said.push('a gripping hand shows ' + showing(h).length + ' px off the ' + sp.tool); }
    const second = sp && sp.arms && sp.arms.second && sp.tool !== 'bow' ? stack.filter(l => l.seg === 'hand' && l.grips !== 'tool') : [];
    for (const h of second) if (showing(h).length >= SHOWS && !touches(toolPx, showing(h), w)) { counts.O++; said.push('the second hand shows ' + showing(h).length + ' px off the ' + sp.tool); }
  }
  if (face !== 's' && limbs.size === 2 && ![...limbs.values()].some(l => l.lost)) {
    const [a, b] = [...limbs.values()], lower = l => new Set([...l.hand, ...l.segs.filter(g => g[0] === 'fore').flatMap(g => g[1])]), lapped = [...lower(a)].filter(i => lower(b).has(i)).length, knot = lapped >= LAPPED || a.path && b.path && a.path.slice(1).some((q, i) => b.path.slice(1).some((r, j) => crosses(a.path[i], q, b.path[j], r)));
    const near = a.hand.length && b.hand.length ? Math.hypot(centre(a.hand, w)[0] - centre(b.hand, w)[0], centre(a.hand, w)[1] - centre(b.hand, w)[1]) : 99;
    if ([a, b].every(l => showing0(l.hand) >= SHOWS) && (knot || near < APART)) { counts.B++; said.push(knot ? 'the arms cross' : 'the hands are ' + near.toFixed(1) + ' px apart'); }
  }
  if (face !== 's' && sp && sp.arms && IN_LINE.tools.includes(sp.tool) && !sp.arms.second && toolPx.length && now.rigged.pts.tip) {
    const grip = stack.find(l => l.seg === 'hand' && l.grips === 'tool'), limb = grip && limbs.get(grip.limb), path = limb && limb.path;
    if (path && path.length > 1) { const a = path[0], b = path[path.length - 1], reach = Math.hypot(b[0] - a[0], b[1] - a[1]), tip = now.rigged.pts.tip, far = Math.hypot(tip[0] - b[0], tip[1] - b[1]), along = reach && far ? ((b[0] - a[0]) * (tip[0] - b[0]) + (b[1] - a[1]) * (tip[1] - b[1])) / (reach * far) : 0; if (reach >= IN_LINE.reach && along > IN_LINE.cos) { counts.C++; said.push('the ' + sp.tool + ' runs straight on from the arm, ' + along.toFixed(2)); } }
  }
  for (const l of loads) {
    const meta = now.load, lay = now.layer, placed = pixels(l.spr);
    if (!meta || !lay) continue;
    const sideOn = face === 's' && IN_ARMS.includes(now.pose.carry);
    if (now.fullLoad && !sideOn && !onGround && placed.length < WHOLE * now.fullLoad) { counts.D++; said.push('load drawn ' + placed.length + ' px of ' + now.fullLoad); }
    if (meta.figure && !onGround && !(now.pose.cu < GRABBED) && !(face === 'b' && !meta.person && IN_ARMS.includes(now.pose.carry))) { const h = l.head, disc = h ? placed.filter(i => Math.hypot(i % w - h[0], ((i / w) | 0) - h[1]) <= h[2]) : [], seen = new Set(showing(l)), headSeen = disc.filter(i => seen.has(i)).length; if (!h || !disc.length || headSeen < HEAD_SHOWS * disc.length) { counts.E++; said.push(h ? 'head of the carried body shows ' + headSeen + ' px of ' + disc.length : 'the carried body has no head marked'); } else if (now.pose.carry === 'cradle') { const tones = disc.filter(i => seen.has(i) && !isInk(shown[i])).map(i => lumaOf(shown[i])).sort((a, b) => a - b), marks = tones.filter(t => t < FACE.dark * tones[tones.length >> 1]).length; if (marks < FACE.marks) { counts.E++; said.push('the carried head shows ' + marks + ' dark face pixels'); } } }
    if (meta.person && !onGround && !(now.pose.cu < 1)) {
      const wrong = [], seen = showing(l), torso = now.rigged.pts.torso, shoulderRow = torso[1], hipRow = sp.hipRow, handLayers = stack.filter(s => s.seg === 'hand'), h = l.head, rowOf = i => (i / w) | 0, off = i => i % w - middleX;
      const palmUp = hand => showing(hand).some(i => { for (let d = 1; d <= CRADLE.palm; d++) if (l.spr.c[i - d * w]) return true; return false; });
      const mid = centre(placed, w)[1];
      if (mid < shoulderRow || mid > hipRow + CRADLE.below) wrong.push('the body rides at row ' + mid.toFixed(0) + ', shoulders ' + shoulderRow + ' and hips ' + hipRow);
      if (h && (h[1] < shoulderRow - CRADLE.above || h[1] > hipRow)) wrong.push('the head is at row ' + h[1] + ', shoulders ' + shoulderRow);
      if (face === 'f') {
        const under = handLayers.filter(hand => showing(hand).length >= SHOWS && palmUp(hand)).length, across = seen.filter(i => Math.abs(off(i)) <= half && rowOf(i) >= shoulderRow && rowOf(i) <= hipRow).length;
        if (under < 2) wrong.push(under + ' of 2 hands show under the body');
        if (across < CRADLE.across * (2 * half + 1)) wrong.push('the body covers ' + across + ' px of the chest');
        if (h && Math.abs(h[0] - middleX) < half) wrong.push('the head is in front of the chest');
        if (h && seen.filter(i => off(i) * Math.sign(h[0] - middleX) < -half).length < SHOWS) wrong.push('no legs show past the far arm');
      }
      if (face === 'b') {
        const back = stack.find(s => s.name === 'torso'), spans = new Map(); for (const i of back ? pixels(back.spr) : []) { const y = rowOf(i), x = i % w, at = spans.get(y) || [x, x]; spans.set(y, [Math.min(at[0], x), Math.max(at[1], x)]); }
        const within = i => { const at = spans.get(rowOf(i)); return !!at && i % w > at[0] && i % w < at[1]; }, through = seen.filter(within).length, armsAcross = stack.filter(s => s.limb).flatMap(showing).filter(within).length;
        if (through) wrong.push(through + ' px of the body show through the back');
        if (armsAcross) wrong.push(armsAcross + ' px of an arm across the back');
        if (h && seen.filter(i => off(i) * Math.sign(h[0] - middleX) < -half).length < SHOWS) wrong.push('no feet show past the body');
      }
      if (face === 's') {
        const over = name => stack.filter(s => s.limb === name && s.seg !== 'hand').flatMap(showing).filter(i => l.spr.c[i]).length;
        if (over('near arm') < SHOWS) wrong.push('the near arm is not in front of the body');
        if (over('far arm')) wrong.push(over('far arm') + ' px of the far arm in front of the body');
        if (!(now.pose.lean < 0)) wrong.push('the carrier does not lean back');
        if (seen.length && centre(seen, w)[0] <= torso[0]) wrong.push('the body is not in front of the carrier');
      }
      if (wrong.length) { counts.L += wrong.length; said.push(...wrong); }
    }
    if (face !== 's' && IN_ARMS.includes(now.pose.carry) && limbs.size === 2) {
      const state = [...limbs.keys()].map(name => { let over = 0, under = 0; for (const seg of stack.filter(s => s.limb === name && s.seg !== 'hand')) { const k = stack.indexOf(seg); for (const i of pixels(seg.spr)) if (l.spr.c[i]) { if (top[i] === k) over++; else if (stack[top[i]] === l) under++; } } return over + under < 2 ? 0 : over > under ? 1 : -1; });
      if (state[0] * state[1] < 0) { counts.F++; said.push('load over one arm and under the other'); }
    }
    if (now.pose.load && now.pose.load[8] && !onGround && !(now.pose.cu < 1)) {
      const shoulders = stack.find(s => s.name === 'torso').anchor[1], all = pixels(l.spr).length, above = showing(l).filter(i => ((i / w) | 0) < shoulders).length, across = stack.filter(s => s.limb && s.seg !== 'hand').flatMap(showing).filter(i => l.spr.c[i]).length;
      if (face === 'f' && above < YOKED.above * all) { counts.R++; said.push(above + ' of ' + all + ' px of the load show above the shoulders'); }
      if (face === 'b' && across > LAPPED) { counts.R++; said.push(across + ' px of the arms cross the load on the shoulders'); }
    }
    if (IN_ARMS.includes(now.pose.carry) && now.pose.carry !== 'cradle' && !now.pose.load[10] && face !== 'b' && !onGround && !(now.pose.cu < 1) && placed.length) {
      const xs = placed.map(i => i % w), left = Math.min(...xs), right = Math.max(...xs);
      if (lay.spr.w >= BLOCK.wide && lay.spr.h >= BLOCK.tall) for (const hand of stack.filter(s => s.seg === 'hand' && (face === 'f' || s.limb === 'near arm'))) {
        const px = showing(hand); if (px.length < SHOWS) continue;
        const x = centre(px, w)[0], inside = Math.min(x - left, right - x);
        if (inside < (face === 'f' ? BLOCK.under : BLOCK.along)) { counts.S++; said.push('the ' + hand.limb + ' hand is ' + inside.toFixed(1) + ' px in from the edge of the load'); }
      }
    }
    if (meta.family === 'long' && lay.spr && !onGround) {
      const s = lay.spr, tall = s.h >= s.w, n = tall ? s.h : s.w, wide = k => { let c = 0; for (let j = 0; j < (tall ? s.w : s.h); j++) if (s.c[tall ? k * s.w + j : j * s.w + k]) c++; return c; }, widths = Array.from({ length: n }, (_, k) => wide(k)).filter(v => v).sort((x, y) => x - y), at = wide(lay.grip[tall ? 1 : 0]);
      if (widths.length && at > widths[widths.length >> 1] + WIDE_END) { counts.G++; said.push('hand where the load is ' + at + ' px wide, its middle width is ' + widths[widths.length >> 1]); }
    }
    if (READS[meta.storage] && lay.spr) { const s = lay.spr, filled = pixels(s).length; if (!READS[meta.storage]({ w: s.w, h: s.h, filled })) { counts.H++; said.push(meta.storage + ' sprite ' + s.w + 'x' + s.h + ' with ' + filled + ' px'); } }
  }
  const head = stack.find(l => l.name === 'head'), pts = now.rigged.pts;
  if (face === 's' && head && pts.mouth && !now.pose.covers) {
    let against = 0;
    for (const l of [...tools.filter(l => l.piece !== 'arrow'), ...stack.filter(k => k.name === 'load' && !(now.pose.cu < 1) && k.cam > head.cam && !KEPT_AS_APPROVED.x.includes(now.pose.carry))]) for (const i of pixels(l.spr)) { const y = (i / w) | 0; if (y < pts.mouth[1] - BROW || y > pts.chin || !shown[i] || !same(shown[i], l.spr.c[i])) continue; if ([i - 1, i + 1, i - w, i + w, i].some(q => head.spr.c[q] && q % w >= pts.mouth[0] - FRONT)) against++; }
    if (against) { counts.x += against; said.push(against + ' px of a held thing against the face'); }
  }
  if (face === 'b' && IN_ARMS.includes(now.pose.carry) && pts.torso && !(now.pose.down > .5) && !(now.pose.cu < 1)) {
    const above = loads.flatMap(showing).filter(i => ((i / w) | 0) < pts.torso[1]).length;
    if (above) { counts.K += above; said.push(above + ' px of the load above the shoulders'); }
  }
  if (sp && !now.pose.sit && !now.pose.kneel) {
    const legRows = new Set();
    for (const l of stack) if (LEG_LAYERS.includes(l.name)) for (const i of pixels(l.spr)) legRows.add((i / w) | 0);
    const full = sp.groundRow - sp.hipRow + 1;
    if (legRows.size && legRows.size < LEGS * full) { counts.y++; said.push('legs ' + legRows.size + ' rows of ' + full); }
  }
  counts.said = said;
  if (loads.length) { const px = pixels(loads[0].spr); counts.loadLow = px.length ? Math.max(...px.map(i => (i / w) | 0)) : null; }
  return counts;
}

export function spursOf(spr) {
  const w = spr.w, filled = new Set(pixels(spr));
  let spurs = 0;
  for (const i of filled) { const x = i % w; if ([i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1].filter(q => filled.has(q)).length <= 1) spurs++; }
  return spurs;
}

export function tipping(spr, ink, loose) {
  const w = spr.w, px = pixels(spr), filled = new Set(px), isInk = c => same(c, ink);
  let torn = 0;
  for (const i of px) { const x = i % w, edge = [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1].some(q => q < 0 || q >= spr.c.length || !filled.has(q)); if (edge && !isInk(spr.c[i])) torn++; }
  const parts = pieces(px, w) - (loose ? 1 : 0);
  return { torn, parts: Math.max(0, parts - 1), spurs: spursOf(spr) };
}
