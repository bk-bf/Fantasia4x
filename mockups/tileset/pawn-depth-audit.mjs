import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PICTURE_KEYS, PICTURE_NAMED, pictured, tipping, spursOf } from './pawn-picture-audit.mjs';

const here = process.env.AUDIT_ROOT || dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), flag = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
const imageRef = flag('--image-from'), only = flag('--only'), listed = args.includes('--list'), noted = args.includes('--where'), smooth = args.includes('--smooth'), folk = args.includes('--folk'), EACH = smooth ? 3 : 1, TURN = smooth ? 2 : 5;

const fromDisk = file => readFileSync(join(here, file), 'utf8');
const fromGit = ref => file => execFileSync('git', ['-C', here, 'show', ref + ':mockups/tileset/' + file], { maxBuffer: 1 << 30 }).toString();
const WIDE = 1900, COSTUMED = ['d', 's'], FOLK_KINDS = ['marked', 'kirtle', 'maimed', 'winged', 'soldier', 'knight', 'sage'].map(k => 'folk-' + k), EMPTY_HANDS = { tool: null, shield: null }, WITH_AXE = { tool: 'axe', shield: null };
const FOLK_ROWS = { walk: EMPTY_HANDS, chop: WITH_AXE, heft: EMPTY_HANDS, sit: EMPTY_HANDS, idle: EMPTY_HANDS, guard: EMPTY_HANDS, hit: EMPTY_HANDS, stagger: EMPTY_HANDS, fall: EMPTY_HANDS }, FOLK_LOAD = { heft: 'wild_oats' };
function load(read, layered, composed) {
  const registry = new Function(read('registry-scripts.js') + '\nreturn REGISTRY_SCRIPTS;')();
  const left = composed ? /^motion\.js$/ : /^motion\.js$|motion-folk|motion-sheet|motion-stage|motion-fell|motion-timeline/, motion = read('motion.html').match(/data-then="([^"]+)"/)[1].split(' ').filter(f => !left.test(f) && !registry.includes(f));
  const source = [...registry, ...motion].map(read).join('\n;');
  const data = JSON.parse(read('catalog-data.json'));
  return new Function('DATA', 'innerWidth', source + '\nDBX.fromData(DATA); MOTION_LOAD.init(DATA);' + (composed ? 'MOTION_FOLK.init(FOLK_CAST);' : '') + (layered ? 'RIG_KEEP.layers = true;' : '') + '\nreturn { placed: typeof FOLK_PARTS !== "undefined" && !!FOLK_PARTS.rigged && typeof dressedLook === "function", style: typeof LOOK_STYLE === "undefined" ? null : LOOK_STYLE, PAWN_ANIMS, FB_POSES, fbPose, posed, PAWNS, FOLK, TOOLS, SEEN, BOW, rigPawn, rigPawnLie, RG, DBX, fitted, HAUL, MOTION_LOAD, HOLDS, P, mkActor, tipped' + (layered ? ', shade' : '') + (composed ? ', drawLook, SHEET' : '') + ' };')(data.objects, WIDE);
}
function loadThen(ref) {
  try { return load(fromGit(ref), false); } catch (e) {
    if (!(e instanceof ReferenceError)) throw e;
    console.error(`--image-from ${ref}: that commit's motion page has no ${e.message.replace(/ is not defined$/, '')}, which this audit drives; pick a newer commit`);
    process.exit(2);
  }
}
const NOW = load(fromDisk, true, folk), THEN = imageRef ? loadThen(imageRef) : null, PLACED = THEN ? THEN.placed : NOW.placed;
for (const G of [NOW, THEN]) if (G && G.style) G.style.pieces = PLACED;
if (THEN && !PLACED) console.log('image from ' + imageRef + ' draws pawns on the old body, so both builds are audited on the old body');

const CAST = [
  ['woodcutter', {}], ['guard', {}], ['guard', { shield: null }], ['warlord', {}], ['hunter', {}], ['miner', {}], ['smith', {}], ['farmer', {}], ['mage', {}], ['watch', {}],
  ['woodcutter', { tool: null }], ['woodcutter', { oneArm: 1 }], ['woodcutter', { sleeves: 'long' }], ['woodcutter', { oneLeg: 1 }],
];
const PEOPLE = ['carried_pawn', 'goblin_carcass', 'pawn_carcass'];
const LOADS = { tote: ['bone_stock', 'steel_cleaver', 'stone_spear'], heft: ['wild_berries', 'copper_bar'], lug: ['granite_block', 'wild_oats'], haul: ['pine_log', 'pine_plank'], bear: ['harpy_carcass', 'bullywug_carcass'], rescue: PEOPLE };
const SHOWN = ['coney_fur', 'branch', 'linen_gambeson', 'rabbit_carcass', 'giant_olm_carcass', 'steel_bodkin_arrow', 'great_bone'];
const HANDLING = ['lift', 'drop', 'held'];
const BODY = ['torso', 'head', 'legs', 'far leg', 'near leg', 'cape', 'pad'];
const FACES = ['s', 'f', 'b'], NAMES = { s: 'sideways', f: 'toward', b: 'away' };
const FINGERTIPS = 2, EDGE = 2, STEP = .5;

const FINE_KEYS = ['ahead', 'stow', 'cu', 'reach', 'bow', 'pull', 'grip'];
const quant = (p, a) => JSON.stringify(p, (k, v) => typeof v === 'number' ? (k === 'tool' || k === 'snout' || k === 'a' ? Math.round(v / a) * a : k === 'ph' ? Math.round(v * 4) / 4 : FINE_KEYS.includes(k) ? Math.round(v * 10) / 10 : Math.round(v * 2) / 2) : v);
const PLAYED_WITH = { chop: 'axe', mine: 'pick', hoe: 'hoe', hammer: 'hammer', shoot: 'bow', guardBow: 'bow', readyBow: 'bow', stowBow: 'bow', thrust: 'spear', guardTwo: 'spear', readyTwo: 'spear', stowTwo: 'spear', guard: 'sword', ready: 'sword', stow: 'sword', attack: 'sword', block: 'sword' };
function frame(G, kind, over, anim, face, u, loadId, seed) {
  const A = G.mkActor('pawn', kind, loadId ? { ...over, tool: null, shield: null } : PLAYED_WITH[anim] && over.tool !== null ? { ...over, tool: PLAYED_WITH[anim] } : over), def = G.PAWN_ANIMS[anim], load = loadId ? G.MOTION_LOAD.get(loadId) : null;
  const look = kind.startsWith('folk-') ? A.lookOf : null;
  A.lookOf = null;
  if (seed !== undefined) A.seed = seed;
  const c = { face, lvl: 3, t: 0, seed: A.seed, tool: A.o.tool, hold: load ? load.hold : 'chest', o: null };
  if (load && G.HAUL.span) Object.assign(c, G.HAUL.span(load, load.hold, face));
  const pose = G.posed(anim, def, u, c);
  G.fitted(A, pose);
  const layer = pose.carry && load ? G.HAUL.layer(load, pose.carry, c.face, pose.down > .5) : null;
  if (layer) pose.load = [layer.spr.w, layer.spr.h, ...layer.grip, ...(layer.hand || layer.grip), layer.rows ? 1 : 0, layer.draped ? 1 : 0, layer.yoked ? 1 : 0, layer.spr.head ? layer.spr.head[1] : -1, layer.under ? 1 : 0];
  const rigged = look ? G.drawLook(look, face, null, JSON.parse(quant(pose, TURN)), A.gear) : G.rigPawn(A.o, JSON.parse(quant(pose, TURN)));
  const lying = pose.lie && !look ? G.rigPawnLie(A.o, { br: pose.br ? 1 : 0, rest: pose.rest ? 1 : 0, out: pose.out ? 1 : 0, bent: pose.bent ? 1 : 0 }) : null;
  const asleep = lying ? Math.max(...[0, 1].map(br => tallOf(G.rigPawnLie(A.o, { br, rest: 1, out: 0, bent: 0 })))) : 0;
  return { spr: layer && rigged.mask ? G.MOTION_LOAD.put(rigged, layer) : rigged, rigged, pose, lying, asleep, seed: A.seed, fused: !!(layer && layer.fused), level: !!(layer && layer.rows), long: !!(load && (load.family === 'long' || load.slim || load.storage === 'shield' || (layer && layer.spr.along))), layer, load: load ? { ...load, figure: load.storage === 'body' || /_carcass$/.test(load.id), person: PEOPLE.includes(load.id) } : null, fullLoad: layer ? solid(G.DBX.built(G.DBX.byId.get(layer.sprite))) : 0 };
}

const solid = spr => { let n = 0; for (let i = 0; i < spr.c.length; i++) if (spr.c[i]) n++; return n; };
const tallOf = s => { let top = -1, low = -1; for (let q = 0; q < s.c.length; q++) if (s.c[q]) { if (top < 0) top = (q / s.w) | 0; low = (q / s.w) | 0; } return low - top + 1; };
const RIGID = { share: .88, least: 10 }, UNDER = 1, SEATED = ['sit', 'warm', 'eat'], SEATS = ['stool', 'bench', 'chair'], SEAT_REACH = 8;
const alike = (a, b) => Math.abs(a[0] - b[0]) < 1.01 && Math.abs(a[1] - b[1]) < 1.01 && Math.abs(a[2] - b[2]) < 1.01;
const shows = (shown, own) => !!shown && !!own && (shown === own || alike(shown, own) || alike(shown, NOW.shade(own)) || alike(shown, NOW.shade(NOW.shade(own))));
const isBody = l => BODY.includes(l.name), isArm = l => !!l.limb, isTool = l => l.name === 'tool' || l.name === 'tool butt', isArrow = l => isTool(l) && l.piece === 'arrow', isLoad = l => l.name === 'load';
const sameInk = c => c[0] === NOW.P.ink[0] && c[1] === NOW.P.ink[1] && c[2] === NOW.P.ink[2];

const HELD = l => (isTool(l) || isLoad(l)), SHIELD = l => l.name === 'shield';
const SPACE_TOL = { length: .05, grip: 1.2, skin: 1.2, ground: .6 }, CARRYING = { wide: 18, tall: 15, belowHip: 2, aboveGround: 3 };
const REACH = 2, JUMP = { held: 8, struck: 16 }, HIDDEN = .6, HALF = .5, FACE = { up: 6, half: 3, side: 6, nose: 1 };
const pixelsOf = l => { const out = []; for (let i = 0; i < l.spr.c.length; i++) if (l.spr.c[i]) out.push(i); return out; };
const boxOf = (px, w) => { let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1; for (const i of px) { const x = i % w, y = (i / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return px.length ? [x0, y0, x1, y1] : null; };
const middle = (px, w) => { let x = 0, y = 0; for (const i of px) { x += i % w; y += (i / w) | 0; } return [x / px.length, y / px.length]; };
const near = (pt, px, w, r) => px.some(i => Math.abs(i % w - pt[0]) <= r + .5 && Math.abs(((i / w) | 0) - pt[1]) <= r + .5);
const faceOf = (pts, face) => face === 'f' ? [pts.mouth[0] - FACE.half, pts.mouth[1] - FACE.up, pts.mouth[0] + FACE.half, pts.chin] : face === 's' ? [pts.mouth[0] - FACE.side, pts.mouth[1] - FACE.up, pts.mouth[0] + FACE.nose, pts.chin] : [0, 0, 1e9, pts.chin];
const shieldShows = (l, w) => { if (l.shows) return l.shows; const px = pixelsOf(l), b = boxOf(px, w); if (!b) return null; return b[2] - b[0] < 7 ? 'edge' : px.some(i => alike(l.spr.c[i], NOW.P.cloth[4])) ? 'front' : 'inside'; };
const SHIELD_SIDE = { f: 'front', b: 'inside', s: 'edge' }, SLUNG_SIDE = { f: 'inside', b: 'front' };

function audit(now, shown, face) {
  const stack = [...now.rigged.layers, ...(now.spr.loadLayer ? [now.spr.loadLayer] : [])].map((l, k) => [l, k]).sort((a, b) => a[0].cam - b[0].cam || a[1] - b[1]).map(x => x[0]);
  const w = now.spr.w, n = w * now.spr.h, counts = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, i: 0, j: 0, k: 0, l: 0, m: 0, n: 0, o: 0, p: 0 }, torsoCam = stack.find(l => l.name === 'torso').cam;
  if (face === 'f') for (const l of stack) if (isTool(l) && !l.inFist && l.own > torsoCam && l.cam < torsoCam) for (let i = 0; i < n; i++) if (l.spr.c[i] && stack.some(b => (b.name === 'torso' || b.name === 'legs') && b.spr.c[i])) counts.o++;
  const at = (l, i) => l.spr.c[i], wanted = i => { for (let k = stack.length - 1; k >= 0; k--) if (at(stack[k], i)) return stack[k]; return null; };
  const drawn = i => { const want = wanted(i); if (want && shows(shown[i], at(want, i))) return want; for (let k = stack.length - 1; k >= 0; k--) if (at(stack[k], i) && shows(shown[i], at(stack[k], i))) return stack[k]; return null; };
  const region = (now.pose.covers && face !== 'b') || now.fused ? null : faceOf(now.rigged.pts, face), over = new Map(), head = stack.find(l => l.name === 'head'), chin = now.rigged.pts.chin;
  for (let i = 0; i < n; i++) {
    const want = wanted(i);
    if (!want || !shown[i] || sameInk(shown[i])) continue;
    const got = drawn(i);
    if (got !== want) counts.d++;
    if (face === 'b' && got && got !== want && isBody(want) && (isArm(got) || isTool(got) || isLoad(got)) && got.cam < torsoCam) counts.a++;
    if (got && (HELD(got) || SHIELD(got)) && !(now.fused && isLoad(got)) && !alike(shown[i], at(got, i))) counts.i++;
    if (region && got && at(head, i) && ((i / w) | 0) <= chin && !(got.spr.e && got.spr.e[i]) && (HELD(got) || SHIELD(got) || got.seg === 'hand')) { const x = i % w, y = (i / w) | 0; if (got.seg !== 'hand' || (x >= region[0] && x <= region[2] && y >= region[1] && y <= region[3])) { counts.f++; over.set(got.name, (over.get(got.name) || 0) + 1); } }
  }
  for (const hand of stack.filter(l => l.grips && l.palm)) {
    let wrong = 0;
    for (let i = 0; i < n; i++) {
      if (!at(hand, i) || !shown[i] || sameInk(shown[i])) continue;
      const thing = stack.find(l => (hand.grips === 'tool' ? l.name === 'tool' && (!hand.piece || l.piece === hand.piece) : isLoad(l)) && at(l, i));
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
  const tool = boxOf(stack.filter(l => isTool(l) && !isArrow(l)).flatMap(pixelsOf), w), arrow = boxOf(stack.filter(isArrow).flatMap(pixelsOf), w), all = boxOf(shown.map((c, i) => c ? i : -1).filter(i => i >= 0), w);
  counts.over = [...over].map(([name, n]) => name + ' ' + n).join(', ');
  const sp = now.rigged.space, len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  if (sp && sp.arms) {
    for (const key of ['R', 'L']) { const arm = sp.arms[key]; if (Math.abs(len(arm.S, arm.E) - sp.upper) > SPACE_TOL.length || Math.abs(len(arm.E, arm.H) - sp.fore) > SPACE_TOL.length) counts.k++; }
    if (sp.arms.second && len(sp.arms.second.want, sp.arms.second.got) > SPACE_TOL.grip) counts.l++;
    const inHead = q => !now.pose.covers && len(q, sp.head.at) < sp.head.r - SPACE_TOL.skin, about = sp.torso.turned || 0, square = q => [q[0] * Math.cos(about) + q[1] * Math.sin(about), q[1] * Math.cos(about) - q[0] * Math.sin(about)], inTorso = q => { const [x, y] = square(q); return Math.abs(x) < sp.torso.half - SPACE_TOL.skin && Math.abs(y) < sp.torso.deep - SPACE_TOL.skin && q[2] < -SPACE_TOL.skin && q[2] > -sp.torso.tall; };
    const points = [sp.arms.R.H, sp.arms.L.H], inside = [];
    counts.inside = inside;
    if (sp.tool && sp.tool !== 'bow' && sp.arms.aim) {
      const at = sp.arms.R.H, aim = sp.arms.aim;
      for (let t = -sp.butt; t <= sp.reach; t += 2) points.push([at[0] + aim[0] * t, at[1] + aim[1] * t, at[2] + aim[2] * t]);
      for (const t of [-sp.butt, sp.reach]) if (sp.shoulderZ + at[2] + aim[2] * t < -SPACE_TOL.ground) counts.m++;
      const front = sp.head.at[1] + sp.head.r, crown = sp.head.at[2] + FACE.up - 3, hidden = points.slice(2).filter(q => face === 'f' ? Math.abs(q[0]) <= FACE.half && q[1] > front && q[2] - NOW.SEEN.depth * (q[1] - front) >= 1 && q[2] - NOW.SEEN.depth * (q[1] - front) <= crown : face === 's' ? q[0] > sp.head.r - 1 && q[1] >= front - FACE.side && q[1] <= front && q[2] >= 1 && q[2] <= crown : false).length;
      if (hidden && !now.pose.covers) { counts.f += hidden; over.set('tool before the face', hidden); counts.over = [...over].map(([name, n]) => name + ' ' + n).join(', '); }
    }
    points.forEach((q, n) => { if (!(n === 1 && sp.lostArm) && (inHead(q) || inTorso(q))) { counts.p++; inside.push((n === 0 ? 'right hand' : n === 1 ? 'left hand' : 'tool at ' + (-sp.butt + (n - 2) * 2)) + ' in ' + (inHead(q) ? 'head' : 'torso') + ' ' + q.map(v => v.toFixed(1))); } });
    for (const key of ['R', 'L']) if (sp.shoulderZ + sp.arms[key].H[2] < -SPACE_TOL.ground) counts.m++;
  }
  if (sp) {
    const ahead = sp.tool && sp.arms && sp.arms.aim ? Math.max(0, ...(sp.tool === 'bow' ? [-NOW.BOW.half, NOW.BOW.half].map(t => sp.arms.L.H[1] + t) : [-sp.butt, 0, sp.reach].map(t => sp.arms.R.H[1] + sp.arms.aim[1] * t)).map(v => (face === 'b' ? -1 : 1) * v)) : 0, allowed = sp.groundRow + 1 + (face === 's' ? 0 : Math.ceil(NOW.SEEN.depth * ahead));
    for (const l of stack.filter(l => isTool(l) || SHIELD(l))) { const b = boxOf(pixelsOf(l), w); if (b && b[3] > allowed) counts.m++; }
    const carriedLoad = stack.find(isLoad);
    if (carriedLoad && !(now.pose.down > .5)) {
      const b = boxOf(pixelsOf(carriedLoad), w);
      if (b && b[3] > sp.groundRow && !(now.level && face !== 's')) counts.m++;
      if (b && ['hip', 'chest', 'low'].includes(now.pose.carry) && (now.pose.cu === undefined || now.pose.cu >= 1) && !now.long && (b[2] - b[0] + 1 > CARRYING.wide || b[3] - b[1] + 1 > CARRYING.tall || b[3] > (now.pose.carry === 'hip' ? sp.groundRow - CARRYING.aboveGround : sp.hipRow + CARRYING.belowHip))) counts.n++;
    }
  }
  const toolPx = stack.filter(isTool).flatMap(pixelsOf), seen = toolPx.filter(i => { const got = drawn(i); return got && isTool(got); }).length;
  counts.hidden = toolPx.length > 0 && seen < toolPx.length * HIDDEN;
  counts.half = toolPx.length ? (seen >= toolPx.length * HALF ? 1 : 0) : null;
  const loadPx = stack.filter(isLoad).flatMap(pixelsOf), loadSeen = loadPx.filter(i => { const got = drawn(i); return got && isLoad(got); }).length;
  counts.halfLoad = loadPx.length ? (loadSeen >= loadPx.length * HALF ? 1 : 0) : null;
  counts.size = tool ? Math.hypot(tool[2] - tool[0] + 1, tool[3] - tool[1] + 1) : 0;
  counts.arrow = arrow ? Math.hypot(arrow[2] - arrow[0] + 1, arrow[3] - arrow[1] + 1) : 0;
  counts.low = Math.max(0, ...stack.filter(l => !HELD(l) && !SHIELD(l)).map(l => { const b = boxOf(pixelsOf(l), w); return b ? b[3] : 0; }));
  return counts;
}

const KEYS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', ...PICTURE_KEYS, 'z', 'I', 'J', 'M'];
const NAMED = { a: 'over the back', b: 'arm through load', c: 'palm side', d: 'out of depth order', e: 'hand off its object', f: 'over the face', g: 'size jump or missing', h: 'below the ground', i: 'blended', j: 'shield side', k: 'arm length', l: 'grip off the hand', m: 'under the ground', n: 'load too big to carry', o: 'held thing behind the body it is in front of', p: 'inside the body', ...PICTURE_NAMED, z: 'rigid thing changes length', I: 'seated with no seat', J: 'lying figure under its ground line', M: 'limb sticks up from a lying figure' };
const anims = Object.keys(NOW.PAWN_ANIMS).filter(a => !only || new RegExp(only).test(a));
const totals = Object.fromEntries(KEYS.map(k => [k, 0])), rows = [], notes = [], ground = new Map(), shares = [], seenShare = args.includes('--seen');
let frames = 0;
const standing = (kind, over, face) => { const key = kind + JSON.stringify(over) + face; if (!ground.has(key)) { const f = frame(NOW, kind, over, 'idle', face, .1, null); ground.set(key, audit(f, f.spr.c, face).low); } return ground.get(key); };
for (const anim of anims) {
  const def = NOW.PAWN_ANIMS[anim], n = (def.n || 6) * EACH, hold = LOADS[anim.replace(/Stand$/, '')] ? anim.replace(/Stand$/, '') : null;
  const shown = SHOWN.filter(id => NOW.MOTION_LOAD.get(id)), carriedAs = id => NOW.HOLDS[NOW.MOTION_LOAD.get(id).hold][0];
  const runs = hold ? [...LOADS[hold], ...shown.filter(id => carriedAs(id) === hold)].map(id => ['woodcutter', {}, id]) : HANDLING.includes(anim) ? [...Object.values(LOADS).flat(), ...shown].map(id => ['woodcutter', {}, id]) : CAST.map(([k, o]) => [k, o, null]);
  if (folk && FOLK_ROWS[anim]) runs.push(...FOLK_KINDS.map(k => [k, FOLK_ROWS[anim], FOLK_LOAD[anim] || null]));
  for (const face of FACES) {
    const sum = Object.fromEntries(KEYS.map(k => [k, 0])), share = { tool: [0, 0], load: [0, 0] };
    for (const [kind, over, loadId] of runs) {
      if (over.oneArm && PLAYED_WITH[anim] === 'bow') continue;
      const floor = standing(kind, over, face), sizes = [], arrows = [], lengths = [], who = kind + Object.entries(over).map(([k, v]) => ' ' + k + ' ' + v).join('');
      for (let i = 0; i < n; i++) {
        const u = (i + .5) / n, now = frame(NOW, kind, over, anim, face, u, loadId);
        if (now.pose.tip && now.pose.face === face) { const tip = tipping(NOW.tipped(now.spr, face === 'f' ? -now.pose.tip : now.pose.tip), NOW.P.ink, false); const spurs = Math.max(0, tip.spurs - spursOf(now.spr)); if (tip.torn || tip.parts || spurs) { sum.v++; if (noted) notes.push(anim + ' ' + NAMES[face] + ' ' + who + ' frame ' + (i + 1) + ': ' + PICTURE_NAMED.v + ', ' + tip.torn + ' edge pixels not inked, ' + tip.parts + ' loose parts, ' + spurs + ' spurs'); } }
        if (now.lying && face === 's') { let low = 0; for (let q = 0; q < now.lying.c.length; q++) if (now.lying.c[q]) low = (q / now.lying.w) | 0; if (low > NOW.RG.BASE + UNDER) { sum.J++; if (noted) notes.push(anim + ' ' + who + ' frame ' + (i + 1) + ': ' + NAMED.J + ', ' + (low - NOW.RG.BASE) + ' px under'); } }
        if (now.lying && tallOf(now.lying) > now.asleep) { sum.M++; if (noted) notes.push(anim + ' ' + NAMES[face] + ' ' + who + ' frame ' + (i + 1) + ': ' + NAMED.M + ', ' + tallOf(now.lying) + ' rows tall, ' + now.asleep + ' asleep'); }
        if (now.pose.lie || now.pose.tip || now.pose.face !== face) { sizes.push(null); arrows.push(null); lengths.push(null); continue; }
        const got = audit(now, (THEN ? frame(THEN, kind, over, anim, face, u, loadId, now.seed) : now).spr.c, face), where = who + (loadId ? ' ' + loadId : '') + ' frame ' + (i + 1);
        const seen = pictured({ ...now, bowHalf: NOW.BOW.half, shade: NOW.shade }, face, NOW.P.ink);
        for (const k of PICTURE_KEYS) got[k] = seen[k];
        if (kind.startsWith('folk-')) for (const k of COSTUMED) got[k] = 0;
        if (noted && seen.said.length) notes.push(anim + ' ' + NAMES[face] + ' ' + where + ': ' + seen.said.join('; '));
        for (const k of KEYS) if (got[k]) { sum[k] += got[k]; if (noted && 'bcefijklmnop'.includes(k)) notes.push(anim + ' ' + NAMES[face] + ' ' + where + ': ' + NAMED[k] + ' ' + got[k] + (k === 'f' ? ' (' + got.over + ')' : k === 'p' ? ' (' + got.inside.join('; ') + ')' : '')); }
        if (got.low > floor) { sum.h++; if (noted) notes.push(anim + ' ' + NAMES[face] + ' ' + where + ': ' + (got.low - floor) + ' px below the ground'); }
        const expects = !loadId && !now.pose.carry && now.pose.item !== null && NOW.TOOLS[now.pose.item === undefined ? NOW.mkActor('pawn', kind, over).o.tool : now.pose.item];
        if (expects && !got.size) { sum.g++; if (noted) notes.push(anim + ' ' + NAMES[face] + ' ' + where + ': the tool is not drawn'); }
        lengths.push(now.rigged.space && now.rigged.space.tool === 'bow' ? null : seen.rigid || null);
        sizes.push(got.size && !got.hidden ? got.size : null);
        arrows.push(got.arrow);
        if (got.half !== null) { share.tool[0] += got.half; share.tool[1]++; }
        if (got.halfLoad !== null) { share.load[0] += got.halfLoad; share.load[1]++; }
        frames++;
      }
      const longest = Math.max(0, ...lengths.filter(Boolean).map(r => r.all));
      lengths.forEach((r, i) => { if (r && longest >= RIGID.least && r.all < RIGID.share * longest) { sum.z++; if (noted) notes.push(anim + ' ' + NAMES[face] + ' ' + who + ' frame ' + (i + 1) + ': tool drawn ' + r.all.toFixed(1) + ' px long, longest in the row ' + longest.toFixed(1)); } });
      const most = (def.hit ? JUMP.struck : JUMP.held) / (smooth ? 2 : 1) + (smooth ? 1 : 0);
      for (let i = 0; i < n; i++) { const a = arrows[i], b = arrows[(i + 1) % n]; if (i + 1 === n && def.once) continue; const loosed = def.hit && def.hit[1] === 'arrow' && b < a && (i + .5) / n <= def.hit[0] && (i + 1.5) / n > def.hit[0]; if (a !== null && b !== null && Math.abs(a - b) > most && !(def.hit && !b) && !loosed) { sum.g++; if (noted) notes.push(anim + ' ' + NAMES[face] + ' ' + who + ' frames ' + (i + 1) + ' to ' + ((i + 1) % n + 1) + ': arrow ' + a.toFixed(0) + ' px to ' + b.toFixed(0) + ' px'); } }
      for (let i = 0; i < n; i++) { const a = sizes[i], b = sizes[(i + 1) % n]; if (i + 1 === n && def.once) continue; if (a && b && Math.abs(a - b) > most) { sum.g++; if (noted) notes.push(anim + ' ' + NAMES[face] + ' ' + who + ' frames ' + (i + 1) + ' to ' + ((i + 1) % n + 1) + ': tool ' + a.toFixed(0) + ' px to ' + b.toFixed(0) + ' px'); } }
    }
    for (const k of KEYS) totals[k] += sum[k];
    for (const what of ['tool', 'load']) if (share[what][1]) shares.push(anim.padEnd(12) + NAMES[face].padEnd(9) + what.padEnd(5) + String(Math.round(100 * share[what][0] / share[what][1])).padStart(4) + '% of ' + share[what][1] + ' frames at least half visible');
    if (listed || KEYS.some(k => sum[k])) rows.push(anim.padEnd(12) + NAMES[face].padEnd(9) + KEYS.map(k => ' ' + k + ' ' + String(sum[k]).padStart(6)).join(''));
  }
}
if (NOW.SHEET && !only) for (const cell of NOW.SHEET.CELLS) for (const p of cell.cast || []) {
  const sits = p.rig === 'pawn' && p.steps.some(st => SEATED.includes(st[0] === 'act' ? st[1] : st[3]));
  if (sits && !(cell.props || []).some(([name, x]) => SEATS.includes(name) && Math.abs(x - (p.at ? p.at[0] : 0)) <= SEAT_REACH)) { totals.I++; notes.push(cell.id + ': ' + NAMED.I); }
}
console.log(rows.join('\n'));
if (noted) console.log(notes.join('\n'));
if (seenShare) console.log(shares.join('\n'));
console.log(KEYS.map(k => k + ' = ' + NAMED[k]).join(', '));
console.log((imageRef ? 'image from ' + imageRef + ', ' : '') + anims.length + ' animations, ' + frames + ' frames: ' + KEYS.map(k => NAMED[k] + ' ' + totals[k]).join(', '));
process.exit(KEYS.some(k => totals[k]) ? 1 : 0);
