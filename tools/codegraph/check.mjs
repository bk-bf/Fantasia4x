// @ts-check
/**
 * Architecture rule checks over the codebase graph (`pnpm graph:check`).
 *
 * Turns the graph from a viewer into an enforced contract. Reports:
 *   - ADR-008 : nothing may call WasmPathfinderService directly (only the interface)
 *   - layers  : a lower layer must not depend on a higher one (core→services, etc.)
 *   - cycles  : circular module dependencies (SCCs)
 *   - god     : oversized modules
 *   - orphans : private functions nothing calls (dead-code candidates)
 *
 * Exits non-zero if any ERROR-level findings exist (use --strict to fail on
 * warnings too). Reads tools/codegraph/graph.json — run extract.mjs first.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const STRICT = process.argv.includes('--strict');

const graphPath = path.join(DIR, 'graph.json');
if (!fs.existsSync(graphPath)) {
  console.error('graph.json missing — run `node tools/codegraph/extract.mjs` first.');
  process.exit(2);
}
const G = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const byId = new Map(G.nodes.map((n) => [n.id, n]));
const shortMod = (m) => m.replace(/^game\//, '');

// ---- config -------------------------------------------------------------
// Layer rank: an edge A->B is healthy only when rank(A) >= rank(B)
// (higher layers depend on lower ones). -1 = exempt.
const LAYER = {
  rust: 0, core: 0, utils: 0, database: 0, webgl: 1,
  entities: 1, ai: 2, services: 2, world: 3, systems: 3,
  stores: 4, components: 5, routes: 5, dev: -1,
};
const GOD_FUNCTIONS = 40; // functions per module before it's a "god module"
// Only these modules may reference the WASM pathfinder implementation directly.
const WASM_ALLOWED = new Set(['game/services/WasmPathfinderService']);
const WASM_TARGET = 'game/services/WasmPathfinderService';

const findings = []; // { level: 'error'|'warn', rule, msg }
const add = (level, rule, msg) => findings.push({ level, rule, msg });

// ---- module dependency graph (from node edges) --------------------------
const modOut = new Map(); // module -> Set(module)
const modEdgeMeta = new Map(); // "a|b" -> count
for (const e of G.edges) {
  const a = byId.get(e.from).module, b = byId.get(e.to).module;
  if (a === b) continue;
  if (!modOut.has(a)) modOut.set(a, new Set());
  modOut.get(a).add(b);
  const k = `${a}|${b}`;
  modEdgeMeta.set(k, (modEdgeMeta.get(k) || 0) + (e.count || 1));
}
const groupOf = (mod) => (G.moduleNodes.find((m) => m.module === mod) || {}).group;

// ---- 1. ADR-008 ---------------------------------------------------------
for (const e of G.edges) {
  const to = byId.get(e.to);
  if (to.module !== WASM_TARGET) continue;
  const from = byId.get(e.from);
  if (WASM_ALLOWED.has(from.module)) continue;
  add('error', 'ADR-008',
    `${shortMod(from.module)}::${from.short} calls WasmPathfinderService.${to.short} directly (use the PathfinderService interface) — ${from.file}:${from.line}`);
}

// ---- 2. layer direction -------------------------------------------------
for (const [a, tos] of modOut) {
  const ga = groupOf(a), ra = LAYER[ga];
  if (ra == null || ra < 0) continue;
  for (const b of tos) {
    const gb = groupOf(b), rb = LAYER[gb];
    if (rb == null || rb < 0) continue;
    if (ra < rb) {
      add('warn', 'layers',
        `${shortMod(a)} (${ga}) depends on higher layer ${shortMod(b)} (${gb}) — ${modEdgeMeta.get(`${a}|${b}`)} call site(s)`);
    }
  }
}

// ---- 3. cycles (Tarjan SCC on the module graph) -------------------------
{
  let idx = 0;
  const index = new Map(), low = new Map(), onStack = new Set(), stack = [];
  const sccs = [];
  const nodesList = [...modOut.keys(), ...G.moduleNodes.map((m) => m.module)];
  const allMods = [...new Set(nodesList)];
  const strong = (v) => {
    index.set(v, idx); low.set(v, idx); idx++;
    stack.push(v); onStack.add(v);
    for (const w of modOut.get(v) || []) {
      if (!index.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) === index.get(v)) {
      const comp = [];
      let w;
      do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
      if (comp.length > 1) sccs.push(comp);
    }
  };
  for (const v of allMods) if (!index.has(v)) strong(v);
  for (const comp of sccs) {
    add('error', 'cycle', `circular module dependency (${comp.length}): ${comp.map(shortMod).join(' → ')} → …`);
  }
}

// ---- 4. god modules -----------------------------------------------------
for (const m of G.moduleNodes) {
  if (m.fns > GOD_FUNCTIONS) {
    add('warn', 'god-module', `${shortMod(m.module)} has ${m.fns} functions (> ${GOD_FUNCTIONS}) — consider splitting (${m.file})`);
  }
}

// ---- 5. orphans (dead private code) -------------------------------------
// Conservative: only standalone, non-exported functions with zero callers.
// Class methods are excluded — dynamic dispatch through interfaces means an
// unresolved call doesn't reliably mean "dead", which would flood false hits.
const inDeg = new Map();
for (const e of G.edges) inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1);
for (const n of G.nodes) {
  if (n.kind !== 'function' || n.className) continue; // standalone fns only
  if (n.exported || n.tested || inDeg.get(n.id)) continue;
  // stores wire functions through object-literal shorthand (not a call edge),
  // so a 0-caller fn there isn't reliably dead — skip the store layer.
  if (n.group === 'stores') continue;
  add('warn', 'orphan', `private ${shortMod(n.module)}::${n.short} is never called (dead code?) — ${n.file}:${n.line}`);
}

// ---- report -------------------------------------------------------------
const errors = findings.filter((f) => f.level === 'error');
const warns = findings.filter((f) => f.level === 'warn');
const RULES = ['ADR-008', 'cycle', 'layers', 'god-module', 'orphan'];
const C = { red: '\x1b[31m', yel: '\x1b[33m', dim: '\x1b[2m', grn: '\x1b[32m', bold: '\x1b[1m', off: '\x1b[0m' };

console.log(`\n${C.bold}Codebase graph — architecture check${C.off}  (${G.stats.functions} fns, ${G.stats.modules} modules)\n`);
for (const rule of RULES) {
  const fs_ = findings.filter((f) => f.rule === rule);
  if (!fs_.length) { console.log(`  ${C.grn}✓${C.off} ${rule}`); continue; }
  const err = fs_.some((f) => f.level === 'error');
  console.log(`  ${err ? C.red + '✗' : C.yel + '!'}${C.off} ${rule} ${C.dim}(${fs_.length})${C.off}`);
  for (const f of fs_.slice(0, 25)) {
    console.log(`      ${f.level === 'error' ? C.red : C.yel}•${C.off} ${f.msg}`);
  }
  if (fs_.length > 25) console.log(`      ${C.dim}… +${fs_.length - 25} more${C.off}`);
}
console.log(`\n  ${errors.length ? C.red : C.grn}${errors.length} error(s)${C.off}, ${warns.length ? C.yel : C.dim}${warns.length} warning(s)${C.off}${STRICT ? ' (strict)' : ''}\n`);

const failed = errors.length > 0 || (STRICT && warns.length > 0);
process.exit(failed ? 1 : 0);
