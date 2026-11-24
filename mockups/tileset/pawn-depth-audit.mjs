import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), flag = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
const imageRef = flag('--image-from'), only = flag('--only'), listed = args.includes('--list');

const fromDisk = file => readFileSync(join(here, file), 'utf8');
const fromGit = ref => file => execFileSync('git', ['-C', here, 'show', ref + ':mockups/tileset/' + file], { maxBuffer: 1 << 30 }).toString();
function load(read, layered) {
  const registry = new Function(read('registry-scripts.js') + '\nreturn REGISTRY_SCRIPTS;')();
  const motion = read('motion.html').match(/data-then="([^"]+)"/)[1].split(' ').filter(f => !/^motion\.js$|motion-folk|motion-sheet|motion-stage|motion-fell|motion-timeline/.test(f) && !registry.includes(f));
  const source = [...registry, ...motion].map(read).join('\n;');
  const data = JSON.parse(read('catalog-data.json'));
  return new Function('DATA', source + '\nDBX.fromData(DATA); MOTION_LOAD.init(DATA);' + (layered ? 'RIG_KEEP.layers = true;' : '') + '\nreturn { PAWN_ANIMS, FB_POSES, fbPose, PAWNS, FOLK, rigPawn, fitted, HAUL, MOTION_LOAD, HOLDS, P, mkActor' + (layered ? ', shade' : '') + ' };')(data.objects);
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

const quant = (p, a) => JSON.stringify(p, (k, v) => typeof v === 'number' ? (k === 'tool' || k === 'snout' || k === 'a' ? Math.round(v / a) * a : k === 'ph' ? Math.round(v * 4) / 4 : Math.round(v * 2) / 2) : v);
function frame(G, kind, over, anim, face, u, loadId) {
  const A = G.mkActor('pawn', kind, loadId ? { ...over, tool: null, shield: null } : over), def = G.PAWN_ANIMS[anim], load = loadId ? G.MOTION_LOAD.get(loadId) : null;
  A.lookOf = null;
  const c = { face, lvl: 3, t: 0, seed: A.seed, tool: A.o.tool, hold: load ? load.hold : 'chest', o: null };
  if (load && G.HAUL.span) Object.assign(c, G.HAUL.span(load, load.hold, face));
  const pose = face !== 's' && G.FB_POSES[anim] ? G.fbPose(anim, u, c) : def.pose(u, c);
  G.fitted(A, pose);
  const rigged = G.rigPawn(A.o, JSON.parse(quant(pose, 5))), layer = pose.carry && load ? G.HAUL.layer(load, pose.carry, c.face, pose.down > .5) : null;
  return { spr: layer && rigged.mask ? G.MOTION_LOAD.put(rigged, layer) : rigged, rigged, pose };
}

const alike = (a, b) => Math.abs(a[0] - b[0]) < 1.01 && Math.abs(a[1] - b[1]) < 1.01 && Math.abs(a[2] - b[2]) < 1.01;
const shows = (shown, own) => !!shown && !!own && (shown === own || alike(shown, own) || alike(shown, NOW.shade(own)) || alike(shown, NOW.shade(NOW.shade(own))));
const isBody = l => BODY.includes(l.name), isArm = l => !!l.limb, isTool = l => l.name === 'tool' || l.name === 'tool butt', isLoad = l => l.name === 'load';
const sameInk = c => c[0] === NOW.P.ink[0] && c[1] === NOW.P.ink[1] && c[2] === NOW.P.ink[2];

function audit(now, shown, face) {
  const stack = [...now.rigged.layers, ...(now.spr.loadLayer ? [now.spr.loadLayer] : [])].map((l, k) => [l, k]).sort((a, b) => a[0].cam - b[0].cam || a[1] - b[1]).map(x => x[0]);
  const w = now.spr.w, n = w * now.spr.h, counts = { a: 0, b: 0, c: 0, d: 0 }, torsoCam = stack.find(l => l.name === 'torso').cam;
  const at = (l, i) => l.spr.c[i], wanted = i => { for (let k = stack.length - 1; k >= 0; k--) if (at(stack[k], i)) return stack[k]; return null; };
  const drawn = i => { const want = wanted(i); if (want && shows(shown[i], at(want, i))) return want; for (let k = stack.length - 1; k >= 0; k--) if (at(stack[k], i) && shows(shown[i], at(stack[k], i))) return stack[k]; return null; };
  for (let i = 0; i < n; i++) {
    const want = wanted(i);
    if (!want || !shown[i] || sameInk(shown[i])) continue;
    const got = drawn(i);
    if (got !== want) counts.d++;
    if (face === 'b' && got && got !== want && isBody(want) && (isArm(got) || isTool(got) || isLoad(got)) && got.cam < torsoCam) counts.a++;
  }
  for (const hand of stack.filter(l => l.grips && l.palm)) {
    let wrong = 0;
    for (let i = 0; i < n; i++) {
      if (!at(hand, i) || !shown[i] || sameInk(shown[i])) continue;
      const thing = stack.find(l => (hand.grips === 'tool' ? isTool(l) : isLoad(l)) && at(l, i));
      if (!thing) continue;
      const got = drawn(i), handOnTop = got === hand, thingOnTop = got === thing;
      if (hand.palm === 'under' ? handOnTop : thingOnTop) wrong++;
    }
    counts.c += hand.palm === 'under' ? Math.max(0, wrong - FINGERTIPS) : wrong;
  }
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
  return counts;
}

const anims = Object.keys(NOW.PAWN_ANIMS).filter(a => !only || new RegExp(only).test(a));
const totals = { a: 0, b: 0, c: 0, d: 0 }, rows = [];
let frames = 0;
for (const anim of anims) {
  const def = NOW.PAWN_ANIMS[anim], n = def.n || 6, hold = Object.keys(NOW.HOLDS).find(k => NOW.HOLDS[k].includes(anim));
  const runs = hold ? LOADS[hold].map(id => ['woodcutter', {}, id]) : HANDLING.includes(anim) ? Object.values(LOADS).flat().map(id => ['woodcutter', {}, id]) : CAST.map(([k, o]) => [k, o, null]);
  for (const face of FACES) {
    const sum = { a: 0, b: 0, c: 0, d: 0 };
    for (const [kind, over, loadId] of runs) for (let i = 0; i < n; i++) {
      const u = (i + .5) / n, now = frame(NOW, kind, over, anim, face, u, loadId);
      if (now.pose.lie) continue;
      const got = audit(now, (THEN ? frame(THEN, kind, over, anim, face, u, loadId) : now).spr.c, face);
      for (const k of 'abcd') sum[k] += got[k];
      frames++;
    }
    for (const k of 'abcd') totals[k] += sum[k];
    if (listed || sum.a + sum.b + sum.c + sum.d) rows.push(anim.padEnd(12) + NAMES[face].padEnd(9) + ' over the back ' + String(sum.a).padStart(6) + '  arm through load ' + String(sum.b).padStart(4) + '  palm side ' + String(sum.c).padStart(6) + '  out of depth order ' + String(sum.d).padStart(6));
  }
}
console.log(rows.join('\n'));
console.log((imageRef ? 'image from ' + imageRef + ', ' : '') + anims.length + ' animations, ' + frames + ' frames: over the back ' + totals.a + ', arm through load ' + totals.b + ', palm side ' + totals.c + ', out of depth order ' + totals.d);
process.exit(totals.a + totals.b + totals.c + totals.d ? 1 : 0);
