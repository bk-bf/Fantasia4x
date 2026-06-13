// @ts-check
/**
 * Graph snapshot + diff — track how the architecture changes over time.
 *
 *   node diff.mjs --save [name]   save current graph.json as a baseline
 *   node diff.mjs [baseline]      diff current graph.json against the baseline
 *
 * (wired as `pnpm graph:snapshot` and `pnpm graph:diff`.)
 *
 * Reports new/removed modules, modules that grew or shrank, new/removed
 * cross-module dependencies, and new god-modules — so a refactor's effect (or a
 * regression forming) is visible at a glance instead of after the fact.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const C = { red: '\x1b[31m', grn: '\x1b[32m', yel: '\x1b[33m', dim: '\x1b[2m', bold: '\x1b[1m', off: '\x1b[0m' };
const GOD = 40;

const load = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const curPath = path.join(DIR, 'graph.json');
if (!fs.existsSync(curPath)) { console.error('graph.json missing — run extract.mjs first.'); process.exit(2); }

const args = process.argv.slice(2);

// ---- snapshot mode ------------------------------------------------------
if (args[0] === '--save') {
  const name = args[1] ? `graph.snapshot.${args[1]}.json` : 'graph.snapshot.json';
  const dest = path.join(DIR, name);
  fs.copyFileSync(curPath, dest);
  console.log(`${C.grn}✓${C.off} saved baseline → tools/codegraph/${name}`);
  process.exit(0);
}

// ---- diff mode ----------------------------------------------------------
const baseName = args[0] || 'graph.snapshot.json';
const basePath = path.isAbsolute(baseName) ? baseName : path.join(DIR, baseName);
if (!fs.existsSync(basePath)) {
  console.error(`No baseline at ${basePath}.\nCreate one first:  pnpm graph:snapshot   (e.g. on main, before a refactor)`);
  process.exit(2);
}

const base = load(basePath);
const cur = load(curPath);

/** module -> { fns, group } */
const modMap = (g) => new Map(g.moduleNodes.map((m) => [m.module, m]));
const bMods = modMap(base), cMods = modMap(cur);
/** set of "from→to" module deps */
const modDeps = (g) => new Set(g.moduleEdges.map((e) => `${e.from} → ${e.to}`));
const bDeps = modDeps(base), cDeps = modDeps(cur);
const short = (m) => m.replace(/^game\//, '');

const line = (sym, color, txt) => console.log(`    ${color}${sym}${C.off} ${txt}`);
let changes = 0;
const section = (title) => console.log(`\n  ${C.bold}${title}${C.off}`);

console.log(`\n${C.bold}Graph diff${C.off}  ${C.dim}baseline ${path.basename(basePath)} (${base.generatedAt?.slice(0, 16) || '?'}) → current (${cur.generatedAt?.slice(0, 16) || '?'})${C.off}`);

// totals
const d = (a, b) => (b - a >= 0 ? `+${b - a}` : `${b - a}`);
section('Totals');
console.log(`    functions ${base.stats.functions} → ${cur.stats.functions} (${d(base.stats.functions, cur.stats.functions)})   ` +
  `edges ${base.stats.edges} → ${cur.stats.edges} (${d(base.stats.edges, cur.stats.edges)})   ` +
  `modules ${base.stats.modules} → ${cur.stats.modules} (${d(base.stats.modules, cur.stats.modules)})`);

// modules added / removed
const added = [...cMods.keys()].filter((m) => !bMods.has(m));
const removed = [...bMods.keys()].filter((m) => !cMods.has(m));
if (added.length || removed.length) {
  section('Modules');
  added.forEach((m) => { line('+', C.grn, `${short(m)} ${C.dim}(${cMods.get(m).fns} fns)${C.off}`); changes++; });
  removed.forEach((m) => { line('-', C.red, `${short(m)} ${C.dim}(was ${bMods.get(m).fns} fns)${C.off}`); changes++; });
}

// function-count changes
const grew = [];
for (const [m, cm] of cMods) {
  const bm = bMods.get(m);
  if (bm && bm.fns !== cm.fns) grew.push({ m, from: bm.fns, to: cm.fns });
}
grew.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));
if (grew.length) {
  section('Module size changes');
  for (const g of grew) {
    const up = g.to > g.from;
    const crossedGod = g.to > GOD && g.from <= GOD;
    line(up ? '▲' : '▼', up ? C.yel : C.grn,
      `${short(g.m)} ${g.from} → ${g.to} fns${crossedGod ? `  ${C.red}⚠ now a god-module (>${GOD})${C.off}` : ''}`);
    changes++;
  }
}

// dependency edges added / removed (module level)
const newDeps = [...cDeps].filter((x) => !bDeps.has(x));
const goneDeps = [...bDeps].filter((x) => !cDeps.has(x));
if (newDeps.length || goneDeps.length) {
  section('Module dependencies');
  newDeps.slice(0, 30).forEach((x) => { line('+', C.yel, short(x.split(' → ')[0]) + ' → ' + short(x.split(' → ')[1])); changes++; });
  goneDeps.slice(0, 30).forEach((x) => { line('-', C.grn, short(x.split(' → ')[0]) + ' → ' + short(x.split(' → ')[1])); changes++; });
  if (newDeps.length > 30 || goneDeps.length > 30) console.log(`    ${C.dim}… (${newDeps.length} new, ${goneDeps.length} removed)${C.off}`);
}

if (!changes) console.log(`\n  ${C.grn}No structural changes.${C.off}`);
console.log('');
