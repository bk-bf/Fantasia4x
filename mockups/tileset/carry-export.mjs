import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCRIPTS } from './db-sheet.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const RIG = ['motion-rig-pawn.js', 'motion-poses.js', 'motion-poses-fb.js', 'motion-carry.js', 'motion-bake.js'];
const FACES = ['s', 'f', 'b'], PUSHED = 3;
const source = [...SCRIPTS, ...RIG.filter(f => !SCRIPTS.includes(f))].map(f => readFileSync(join(here, f), 'utf8')).join('\n;');
const data = JSON.parse(readFileSync(join(here, 'catalog-data.json'), 'utf8'));
const G = new Function('DATA', source + '\nDBX.fromData(DATA);\nreturn { DBX, HAUL, FOLK, RG, HOLDS, HELD, PAWN_ANIMS, rigPawn, fitted };')(data.objects);

const drawn = data.objects.filter(o => o.cat === 'item' && G.DBX.of('item', o.id).length);
const loads = drawn.map(o => G.HAUL.of(o));
const tally = G.HAUL.tally(loads);
const count = pick => loads.filter(pick).length;

function frames(anim, race) {
  const def = G.PAWN_ANIMS[anim], f = G.FOLK[race], fit = { ls: f.legs / 10, as: (f.tl - 1) / 11 };
  return Object.fromEntries(FACES.map(face => [face, Array.from({ length: def.n }, (_, i) => {
    const s = G.rigPawn({ race }, G.fitted(fit, def.pose((i + .5) / def.n, { face, lvl: PUSHED, t: 0, seed: 0 })));
    return [s.pts.carry[0] - G.RG.CX, s.pts.carry[1] - G.RG.BASE, Math.round(s.tilt * 2) / 2];
  })]));
}
const anchors = shots => Object.fromEntries(FACES.map(face => [face, shots[face].map(a => a.slice(0, 2))]));
const tilts = shots => Object.fromEntries(FACES.map(face => [face, shots[face].map(a => a[2])]));
const holds = Object.fromEntries(G.HAUL.HOLDS.map(hold => {
  const [walk, stand] = G.HOLDS[hold], def = G.PAWN_ANIMS[walk], lead = frames(walk, 'human');
  const row = { items: count(l => l.hold === hold), walk, stand, frames: def.n, cycle: def.dist, held: G.HELD[hold] };
  if (FACES.some(face => lead[face].some(a => a[2]))) row.tilt = tilts(lead);
  row.anchors = Object.fromEntries(Object.keys(G.FOLK).map(race => [race, { walk: anchors(frames(walk, race)), stand: anchors(frames(stand, race)) }]));
  return [hold, row];
}));
const bulk = Object.fromEntries(G.HAUL.BULKS.map(b => [b, { items: tally[b].count, holds: tally[b].holds, storage: tally[b].storage }]));
const stances = Object.fromEntries(Object.entries(G.HAUL.STANCES).map(([family, moves]) => [family, { weapons: count(l => l.stance === family), ...moves }]));
const items = loads.map(l => '    ' + JSON.stringify(l.id) + ': ' + JSON.stringify(G.HAUL.ported(l)));
const flat = text => text.replace(/\s+/g, ' ');
const head = JSON.stringify({ origin: 'feet', mirror: 'a pawn facing left flips the sideways frame and its anchor', bulk, holds, stances }, null, 1)
  .replace(/\[\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]/g, '[$1, $2]').replace(/\[\s+((?:"[^"]+",?\s*)+)\]/g, flat).replace(/\[\s+((?:\[-?[\d.]+, -?[\d.]+\],?\s*)+)\]/g, flat).replace(/\[\s+((?:-?[\d.]+,?\s*)+)\]/g, flat).replace(/"(storage|holds)": \{[^{}]+\}/g, flat);
writeFileSync(join(here, 'carry-data.json'), head.replace(/\n}$/, ',\n "items": {\n' + items.join(',\n') + '\n }\n}\n'));

const added = G.DBX.list.filter(e => e.variant.startsWith('map-carry')).length;
for (const b of G.HAUL.BULKS) console.log(b.padEnd(6), String(tally[b].count).padEnd(5), Object.entries(tally[b].holds).map(([k, n]) => k + ' ' + n).join(', ').padEnd(40), Object.entries(tally[b].storage).sort((x, y) => y[1] - x[1]).map(([k, n]) => k + ' ' + n).join(', '));
console.log(loads.length, 'items written to carry-data.json,', added, 'carry sprites,', Object.entries(stances).map(([k, v]) => k + ' ' + v.weapons).join(', '), 'weapons by stance');
