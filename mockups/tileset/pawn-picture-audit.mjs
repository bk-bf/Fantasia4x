export const PICTURE_KEYS = ['q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y'];
export const PICTURE_NAMED = { q: 'arm not joined to a hand', r: 'arm tapers to a point', s: 'see-through pixel', t: 'length lost in profile', u: 'below the foot line', v: 'torn tipping outline', w: 'held thing with no hand on it', x: 'held thing against the face', y: 'legs shortened' };
const HAND_BLOCK = 4, TAPER = { long: 5, thin: 1, wide: 3 }, FIN = { out: 4, above: 1 }, PROFILE = .8, BAND = 2, LEGS = .6, TOUCH = 1;
const LEG_LAYERS = ['legs', 'far leg', 'near leg'], BROW = 6, FRONT = 5, GRASPED = .2;

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
const touches = (a, b, w) => { const near = new Set(); for (const i of a) for (let dy = -TOUCH; dy <= TOUCH; dy++) for (let dx = -TOUCH; dx <= TOUCH; dx++) near.add(i + dy * w + dx); return b.some(i => near.has(i)); };

export function pictured(now, face, ink) {
  const counts = Object.fromEntries(PICTURE_KEYS.map(k => [k, 0])), shown = now.spr.c, w = now.spr.w, sp = now.rigged.space, said = [];
  const stack = [...now.rigged.layers, ...(now.spr.loadLayer ? [now.spr.loadLayer] : [])].map((l, k) => [l, k]).sort((a, b) => a[0].cam - b[0].cam || a[1] - b[1]).map(x => x[0]);
  const isInk = c => same(c, ink), limbs = new Map(), hands = [];
  for (const l of stack) if (l.limb) { const px = pixels(l.spr); if (!limbs.has(l.limb)) limbs.set(l.limb, { all: [], hand: [], segs: [], anchor: l.anchor, lost: l.lost }); const limb = limbs.get(l.limb); limb.all.push(...px); if (l.seg === 'hand') { limb.hand = px; hands.push(...px); } else limb.segs.push([l.seg, px]); }
  const centre = now.rigged.pts.torso ? now.rigged.pts.torso[0] : now.spr.ax, half = sp ? sp.torso.half : 6;
  for (const [name, limb] of limbs) {
    if (!limb.all.length || limb.lost) continue;
    if (limb.hand.length < Math.min(HAND_BLOCK, 2 * (sp && sp.armWide || HAND_BLOCK) - 1)) { counts.q++; said.push(name + ' has no hand block'); }
    else if (pieces(limb.all, w) > 1) { counts.q++; said.push(name + ' is in pieces'); }
    for (const [seg, px] of limb.segs) if (tapers(px, w, seg === 'upper' ? limb.anchor : null)) { counts.r++; said.push(name + ' ' + seg + ' tapers'); }
    if (face !== 's' && limb.anchor && limb.hand.length) {
      const side = Math.sign(limb.anchor[0] - centre) || 1, out = limb.all.filter(i => ((i % w) - limb.anchor[0]) * side >= FIN.out && ((i / w) | 0) <= limb.anchor[1] + FIN.above).length, hb = box(limb.hand, w), inward = Math.abs((hb[0] + hb[2]) / 2 - centre) < half && (hb[1] + hb[3]) / 2 > limb.anchor[1];
      if (out && inward) { counts.r++; said.push(name + ' fins out at the shoulder'); }
    }
  }
  for (let i = 0; i < shown.length; i++) {
    if (!shown[i] || isInk(shown[i])) continue;
    let owner = null;
    for (let k = stack.length - 1; k >= 0 && !owner; k--) if (stack[k].spr.c[i]) owner = stack[k];
    if (owner && !same(shown[i], owner.spr.c[i]) && !stack.some(l => l.spr.c[i] && same(shown[i], l.spr.c[i]))) counts.s++;
  }
  const tools = stack.filter(l => l.name === 'tool' || l.name === 'tool butt'), toolPx = tools.filter(l => l.piece !== 'arrow' && l.piece !== 'string').flatMap(l => pixels(l.spr));
  if (face === 's' && sp && sp.tool && toolPx.length) {
    const b = box(toolPx, w), drawn = Math.hypot(b[2] - b[0] + 1, b[3] - b[1] + 1), real = sp.tool === 'bow' ? 2 * now.bowHalf : sp.reach + sp.butt;
    if (real > 4 && drawn < PROFILE * real) { counts.t++; said.push('tool ' + drawn.toFixed(0) + ' px of ' + real.toFixed(0)); }
  }
  const all = box(pixels(now.spr), w);
  if (sp && all && all[3] > sp.groundRow + BAND) { counts.u++; said.push((all[3] - sp.groundRow) + ' px below the foot line'); }
  const things = [['tool', toolPx], ['arrow', tools.filter(l => l.piece === 'arrow').flatMap(l => pixels(l.spr))], ...stack.filter(l => l.name === 'load' && !(now.pose.cu !== undefined && now.pose.cu < GRASPED)).map(l => ['load', pixels(l.spr)])];
  for (const [what, px] of things) if (px.length && !touches(px, hands, w)) { counts.w++; said.push(what + ' has no hand at it'); }
  const head = stack.find(l => l.name === 'head'), pts = now.rigged.pts;
  if (face === 's' && head && pts.mouth && !now.pose.covers && !now.fused) {
    let against = 0;
    for (const l of [...tools.filter(l => l.piece !== 'string' && l.piece !== 'arrow'), ...stack.filter(k => k.name === 'load' && !(now.pose.cu < 1))]) for (const i of pixels(l.spr)) { const y = (i / w) | 0; if (y < pts.mouth[1] - BROW || y > pts.chin || !shown[i] || !same(shown[i], l.spr.c[i])) continue; if ([i - 1, i + 1, i - w, i + w, i].some(q => head.spr.c[q] && q % w >= pts.mouth[0] - FRONT)) against++; }
    if (against) { counts.x += against; said.push(against + ' px of a held thing against the face'); }
  }
  if (sp && !now.pose.sit && !now.pose.kneel) {
    const legRows = new Set();
    for (const l of stack) if (LEG_LAYERS.includes(l.name)) for (const i of pixels(l.spr)) legRows.add((i / w) | 0);
    const full = sp.groundRow - sp.hipRow + 1;
    if (legRows.size && legRows.size < LEGS * full) { counts.y++; said.push('legs ' + legRows.size + ' rows of ' + full); }
  }
  counts.said = said;
  return counts;
}

export function tipping(spr, ink, loose) {
  const w = spr.w, px = pixels(spr), filled = new Set(px), isInk = c => same(c, ink);
  let torn = 0;
  for (const i of px) { const x = i % w, edge = [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1].some(q => q < 0 || q >= spr.c.length || !filled.has(q)); if (edge && !isInk(spr.c[i])) torn++; }
  const parts = pieces(px, w) - (loose ? 1 : 0);
  return { torn, parts: Math.max(0, parts - 1) };
}
