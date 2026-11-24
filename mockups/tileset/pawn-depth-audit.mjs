import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = process.env.AUDIT_ROOT || dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), flag = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
const imageRef = flag('--image-from'), only = flag('--only'), listed = args.includes('--list'), noted = args.includes('--where'), smooth = args.includes('--smooth'), EACH = smooth ? 3 : 1, TURN = smooth ? 2 : 5;

const fromDisk = file => readFileSync(join(here, file), 'utf8');
const fromGit = ref => file => execFileSync('git', ['-C', here, 'show', ref + ':mockups/tileset/' + file], { maxBuffer: 1 << 30 }).toString();
function load(read, layered) {
  const registry = new Function(read('registry-scripts.js') + '\nreturn REGISTRY_SCRIPTS;')();
  const motion = read('motion.html').match(/data-then="([^"]+)"/)[1].split(' ').filter(f => !/^motion\.js$|motion-folk|motion-sheet|motion-stage|motion-fell|motion-timeline/.test(f) && !registry.includes(f));
  const source = [...registry, ...motion].map(read).join('\n;');
  const data = JSON.parse(read('catalog-data.json'));
  return new Function('DATA', source + '\nDBX.fromData(DATA); MOTION_LOAD.init(DATA);' + (layered ? 'RIG_KEEP.layers = true;' : '') + '\nreturn { PAWN_ANIMS, FB_POSES, fbPose, PAWNS, FOLK, TOOLS, rigPawn, fitted, HAUL, MOTION_LOAD, HOLDS, P, mkActor' + (layered ? ', shade' : '') + ' };')(data.objects);
}
const NOW = load(fromDisk, true), THEN = imageRef ? load(fromGit(imageRef), false) : null;

const CAST = [
  ['woodcutter', {}], ['guard', {}], ['guard', { shield: null }], ['warlord', {}], ['hunter', {}], ['miner', {}], ['smith', {}], ['farmer', {}], ['mage', {}], ['watch', {}],
  ['woodcutter', { tool: null }], ['woodcutter', { oneArm: 1 }], ['woodcutter', { sleeves: 'long' }], ['woodcutter', { oneLeg: 1 }],
];
const LOADS = { hip: ['bone_stock', 'steel_cleaver', 'stone_spear'], chest: ['wild_berries', 'copper_bar'], low: ['granite_block', 'wild_oats'], shoulder: ['pine_log', 'pine_plank'], game: ['deer_carcass', 'boar_carcass'], drape: ['carried_pawn'] };
const HANDLING = ['lift', 'drop', 'held'];
const BODY = ['torso', 'head', 'legs', 'far leg', 'near leg', 'cape', 'pad'];
const FACES = ['s', 'f', 'b'], NAMES = { s: 'sideways', f: 'toward', b: 'away' };
const FINGERTIPS = 2, EDGE = 2, STEP = .5;

const FINE_KEYS = ['ahead', 'stow', 'cu', 'reach', 'bow'];
const quant = (p, a) => JSON.stringify(p, (k, v) => typeof v === 'number' ? (k === 'tool' || k === 'snout' || k === 'a' ? Math.round(v / a) * a : k === 'ph' ? Math.round(v * 4) / 4 : FINE_KEYS.includes(k) ? Math.round(v * 10) / 10 : Math.round(v * 2) / 2) : v);
const PLAYED_WITH = { chop: 'axe', mine: 'pick', hoe: 'hoe', hammer: 'hammer', shoot: 'bow', guardBow: 'bow', readyBow: 'bow', stowBow: 'bow', thrust: 'spear', guardTwo: 'spear', readyTwo: 'spear', stowTwo: 'spear', guard: 'sword', ready: 'sword', stow: 'sword', attack: 'sword', block: 'sword' };
function frame(G, kind, over, anim, face, u, loadId) {
  const A = G.mkActor('pawn', kind, loadId ? { ...over, tool: null, shield: null } : PLAYED_WITH[anim] && over.tool !== null ? { ...over, tool: PLAYED_WITH[anim] } : over), def = G.PAWN_ANIMS[anim], load = loadId ? G.MOTION_LOAD.get(loadId) : null;
  A.lookOf = null;
  const c = { face, lvl: 3, t: 0, seed: A.seed, tool: A.o.tool, hold: load ? load.hold : 'chest', o: null };
  if (load && G.HAUL.span) Object.assign(c, G.HAUL.span(load, load.hold, face));
  const pose = face !== 's' && G.FB_POSES[anim] ? G.fbPose(anim, u, c) : def.pose(u, c);
  G.fitted(A, pose);
  const layer = pose.carry && load ? G.HAUL.layer(load, pose.carry, c.face, pose.down > .5) : null;
  if (layer) pose.load = [layer.spr.w, layer.spr.h, ...layer.grip, ...(layer.hand || layer.grip), layer.rows ? 1 : 0];
  const rigged = G.rigPawn(A.o, JSON.parse(quant(pose, TURN)));
  return { spr: layer && rigged.mask ? G.MOTION_LOAD.put(rigged, layer) : rigged, rigged, pose, fused: !!(layer && layer.fused) };
}

const alike = (a, b) => Math.abs(a[0] - b[0]) < 1.01 && Math.abs(a[1] - b[1]) < 1.01 && Math.abs(a[2] - b[2]) < 1.01;
const shows = (shown, own) => !!shown && !!own && (shown === own || alike(shown, own) || alike(shown, NOW.shade(own)) || alike(shown, NOW.shade(NOW.shade(own))));
const isBody = l => BODY.includes(l.name), isArm = l => !!l.limb, isTool = l => l.name === 'tool' || l.name === 'tool butt', isLoad = l => l.name === 'load';
const sameInk = c => c[0] === NOW.P.ink[0] && c[1] === NOW.P.ink[1] && c[2] === NOW.P.ink[2];

const HELD = l => (isTool(l) || isLoad(l)), SHIELD = l => l.name === 'shield';
const REACH = 2, JUMP = { held: 8, struck: 16 }, HIDDEN = .6, FACE = { up: 6, half: 3, side: 6 };
const pixelsOf = l => { const out = []; for (let i = 0; i < l.spr.c.length; i++) if (l.spr.c[i]) out.push(i); return out; };
const boxOf = (px, w) => { let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1; for (const i of px) { const x = i % w, y = (i / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return px.length ? [x0, y0, x1, y1] : null; };
const middle = (px, w) => { let x = 0, y = 0; for (const i of px) { x += i % w; y += (i / w) | 0; } return [x / px.length, y / px.length]; };
const near = (pt, px, w, r) => px.some(i => Math.abs(i % w - pt[0]) <= r + .5 && Math.abs(((i / w) | 0) - pt[1]) <= r + .5);
const faceOf = (pts, face) => face === 'f' ? [pts.mouth[0] - FACE.half, pts.mouth[1] - FACE.up, pts.mouth[0] + FACE.half, pts.chin] : face === 's' ? [pts.mouth[0] - FACE.side, pts.mouth[1] - FACE.up, pts.mouth[0] - 1, pts.chin] : [0, 0, 1e9, pts.chin];
const shieldShows = (l, w) => { if (l.shows) return l.shows; const px = pixelsOf(l), b = boxOf(px, w); if (!b) return null; return b[2] - b[0] < 7 ? 'edge' : px.some(i => alike(l.spr.c[i], NOW.P.cloth[4])) ? 'front' : 'inside'; };
const SHIELD_SIDE = { f: 'front', b: 'inside', s: 'edge' }, SLUNG_SIDE = { f: 'inside', b: 'front' };

function audit(now, shown, face) {
  const stack = [...now.rigged.layers, ...(now.spr.loadLayer ? [now.spr.loadLayer] : [])].map((l, k) => [l, k]).sort((a, b) => a[0].cam - b[0].cam || a[1] - b[1]).map(x => x[0]);
  const w = now.spr.w, n = w * now.spr.h, counts = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, i: 0, j: 0 }, torsoCam = stack.find(l => l.name === 'torso').cam;
  const at = (l, i) => l.spr.c[i], wanted = i => { for (let k = stack.length - 1; k >= 0; k--) if (at(stack[k], i)) return stack[k]; return null; };
  const drawn = i => { const want = wanted(i); if (want && shows(shown[i], at(want, i))) return want; for (let k = stack.length - 1; k >= 0; k--) if (at(stack[k], i) && shows(shown[i], at(stack[k], i))) return stack[k]; return null; };
  const region = now.pose.covers || now.fused ? null : faceOf(now.rigged.pts, face), over = new Map(), head = stack.find(l => l.name === 'head'), chin = now.rigged.pts.chin;
  for (let i = 0; i < n; i++) {
    const want = wanted(i);
    if (!want || !shown[i] || sameInk(shown[i])) continue;
    const got = drawn(i);
    if (got !== want) counts.d++;
    if (face === 'b' && got && got !== want && isBody(want) && (isArm(got) || isTool(got) || isLoad(got)) && got.cam < torsoCam) counts.a++;
    if (got && (HELD(got) || SHIELD(got)) && !(now.fused && isLoad(got)) && !alike(shown[i], at(got, i))) counts.i++;
    if (region && got && at(head, i) && ((i / w) | 0) <= chin && (HELD(got) || SHIELD(got) || got.seg === 'hand')) { const x = i % w, y = (i / w) | 0; if (got.seg !== 'hand' || (x >= region[0] && x <= region[2] && y >= region[1] && y <= region[3])) { counts.f++; over.set(got.name, (over.get(got.name) || 0) + 1); } }
  }
  for (const hand of stack.filter(l => l.grips && l.palm)) {
    let wrong = 0;
    for (let i = 0; i < n; i++) {
      if (!at(hand, i) || !shown[i] || sameInk(shown[i])) continue;
      const thing = stack.find(l => (hand.grips === 'tool' ? l.name === 'tool' : isLoad(l)) && at(l, i));
      if (!thing) continue;
      const got = drawn(i), handOnTop = got === hand, thingOnTop = got === thing;
      if (hand.palm === 'under' ? handOnTop : thingOnTop) wrong++;
    }
    counts.c += hand.palm === 'under' ? Math.max(0, wrong - FINGERTIPS) : wrong;
  }
  const hands = stack.filter(l => l.seg === 'hand').map(l => ({ l, px: pixelsOf(l) })).filter(h => h.px.length).map(h => ({ ...h, pt: middle(h.px, w) }));
  const resting = now.pose.down > .5 && !(now.pose.reach >= 1);
  for (const kind of ['tool', 'load']) {
    const px = stack.filter(l => kind === 'tool' ? isTool(l) : isLoad(l)).flatMap(pixelsOf);
    if (!px.length || (kind === 'load' && resting) || now.pose.behind) continue;
    for (const h of hands) if (h.l.grips === kind && !near(h.pt, px, w, REACH)) counts.e++;
    if (!hands.some(h => near(h.pt, px, w, REACH))) counts.e++;
  }
  for (const l of stack.filter(SHIELD)) { const side = shieldShows(l, w); if (side && side !== (l.slung && face !== 's' ? SLUNG_SIDE[face] : SHIELD_SIDE[face])) counts.j++; }
  const load = stack.find(isLoad);
  if (load) {
    const deep = (x, y) => { for (let dy = -EDGE; dy <= EDGE; dy++) for (let dx = -EDGE; dx <= EDGE; dx++) if (!at(load, (y + dy) * w + x + dx)) return false; return true; };
    for (const name of new Set(stack.filter(isArm).map(l => l.limb))) {
      const segs = stack.filter(l => l.limb === name), path = segs[0].path;
      let state = 0, through = false;
      for (let k = 0; k + 1 < path.length; k++) {
        const [x0, y0] = path[k], [x1, y1] = path[k + 1], len = Math.hypot(x1 - x0, y1 - y0);
        for (let t = 0; t <= len; t += STEP) {
          const x = Math.round(x0 + (x1 - x0) * t / (len || 1)), y = Math.round(y0 + (y1 - y0) * t / (len || 1)), i = y * w + x;
          if (!segs.some(l => at(l, i))) continue;
          const got = drawn(i), armShown = segs.includes(got);
          if (state === 0 && armShown) state = 1;
          else if (state === 1 && got === load) state = 2;
          else if (state === 2 && armShown && deep(x, y)) through = true;
        }
      }
      if (through) counts.b++;
    }
  }
  const tool = boxOf(stack.filter(isTool).flatMap(pixelsOf), w), all = boxOf(shown.map((c, i) => c ? i : -1).filter(i => i >= 0), w);
  counts.over = [...over].map(([name, n]) => name + ' ' + n).join(', ');
  const toolPx = stack.filter(isTool).flatMap(pixelsOf), seen = toolPx.filter(i => { const got = drawn(i); return got && isTool(got); }).length;
  counts.hidden = toolPx.length > 0 && seen < toolPx.length * HIDDEN;
  counts.size = tool ? Math.hypot(tool[2] - tool[0] + 1, tool[3] - tool[1] + 1) : 0;
  counts.low = Math.max(0, ...stack.filter(l => !HELD(l) && !SHIELD(l)).map(l => { const b = boxOf(pixelsOf(l), w); return b ? b[3] : 0; }));
  return counts;
}

const KEYS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
const NAMED = { a: 'over the back', b: 'arm through load', c: 'palm side', d: 'out of depth order', e: 'hand off its object', f: 'over the face', g: 'size jump or missing', h: 'below the ground', i: 'blended', j: 'shield side' };
const anims = Object.keys(NOW.PAWN_ANIMS).filter(a => !only || new RegExp(only).test(a));
const totals = Object.fromEntries(KEYS.map(k => [k, 0])), rows = [], notes = [], ground = new Map();
let frames = 0;
const standing = (kind, over, face) => { const key = kind + JSON.stringify(over) + face; if (!ground.has(key)) { const f = frame(NOW, kind, over, 'idle', face, .1, null); ground.set(key, audit(f, f.spr.c, face).low); } return ground.get(key); };
for (const anim of anims) {
  const def = NOW.PAWN_ANIMS[anim], n = (def.n || 6) * EACH, hold = Object.keys(NOW.HOLDS).find(k => NOW.HOLDS[k].includes(anim));
  const runs = hold ? LOADS[hold].map(id => ['woodcutter', {}, id]) : HANDLING.includes(anim) ? Object.values(LOADS).flat().map(id => ['woodcutter', {}, id]) : CAST.map(([k, o]) => [k, o, null]);
  for (const face of FACES) {
    const sum = Object.fromEntries(KEYS.map(k => [k, 0]));
    for (const [kind, over, loadId] of runs) {
      if (over.oneArm && PLAYED_WITH[anim] === 'bow') continue;
      const floor = standing(kind, over, face), sizes = [];
      for (let i = 0; i < n; i++) {
        const u = (i + .5) / n, now = frame(NOW, kind, over, anim, face, u, loadId);
        if (now.pose.lie || now.pose.face !== face) { sizes.push(null); continue; }
        const got = audit(now, (THEN ? frame(THEN, kind, over, anim, face, u, loadId) : now).spr.c, face), where = kind + (loadId ? ' ' + loadId : '') + ' frame ' + (i + 1);
        for (const k of KEYS) if (got[k]) { sum[k] += got[k]; if (noted && 'bcefij'.includes(k)) notes.push(anim + ' ' + NAMES[face] + ' ' + where + ': ' + NAMED[k] + ' ' + got[k] + (k === 'f' ? ' (' + got.over + ')' : '')); }
        if (got.low > floor) { sum.h++; if (noted) notes.push(anim + ' ' + NAMES[face] + ' ' + where + ': ' + (got.low - floor) + ' px below the ground'); }
        const expects = !loadId && !now.pose.carry && now.pose.item !== null && NOW.TOOLS[now.pose.item === undefined ? NOW.mkActor('pawn', kind, over).o.tool : now.pose.item];
        if (expects && !got.size) { sum.g++; if (noted) notes.push(anim + ' ' + NAMES[face] + ' ' + where + ': the tool is not drawn'); }
        sizes.push(got.size && !got.hidden ? got.size : null);
        frames++;
      }
      for (let i = 0; i < n; i++) { const a = sizes[i], b = sizes[(i + 1) % n]; if (i + 1 === n && def.once) continue; if (a && b && Math.abs(a - b) > (def.hit ? JUMP.struck : JUMP.held) / (smooth ? 2 : 1) + (smooth ? 1 : 0)) { sum.g++; if (noted) notes.push(anim + ' ' + NAMES[face] + ' ' + kind + ' frames ' + (i + 1) + ' to ' + ((i + 1) % n + 1) + ': tool ' + a.toFixed(0) + ' px to ' + b.toFixed(0) + ' px'); } }
    }
    for (const k of KEYS) totals[k] += sum[k];
    if (listed || KEYS.some(k => sum[k])) rows.push(anim.padEnd(12) + NAMES[face].padEnd(9) + KEYS.map(k => ' ' + k + ' ' + String(sum[k]).padStart(6)).join(''));
  }
}
console.log(rows.join('\n'));
if (noted) console.log(notes.join('\n'));
console.log(KEYS.map(k => k + ' = ' + NAMED[k]).join(', '));
console.log((imageRef ? 'image from ' + imageRef + ', ' : '') + anims.length + ' animations, ' + frames + ' frames: ' + KEYS.map(k => NAMED[k] + ' ' + totals[k]).join(', '));
process.exit(KEYS.some(k => totals[k]) ? 1 : 0);
