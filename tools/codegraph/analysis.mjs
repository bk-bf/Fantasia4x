// @ts-check
/**
 * Pure graph analysis — architecture checks, port-candidate ranking, orphans.
 *
 * No Node/DOM dependencies: takes a parsed graph object and returns plain data,
 * so the SAME implementation runs in the CLI (check.mjs), the server (api.mjs),
 * and inlined into the browser viewer. Edit the rules here, once.
 */

export const shortMod = (m) => m.replace(/^game\//, '');

// Layer rank: an edge A->B is healthy only when rank(A) >= rank(B)
// (higher layers depend on lower ones). -1 = exempt.
export const LAYER = {
  rust: 0, core: 0, utils: 0, database: 0, webgl: 1,
  entities: 1, ai: 2, services: 2, world: 3, systems: 3,
  stores: 4, components: 5, routes: 5, dev: -1,
};
export const GOD_FUNCTIONS = 40;
const WASM_TARGET = 'game/services/WasmPathfinderService';
const WASM_ALLOWED = new Set([WASM_TARGET]);

/** Architecture rule checks. Returns { findings, errors, warnings }. */
export function runChecks(graph) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const findings = [];
  const add = (level, rule, msg, extra) => findings.push({ level, rule, msg, ...extra });

  // module dependency graph
  const modOut = new Map();
  const modEdgeMeta = new Map();
  for (const e of graph.edges) {
    const a = byId.get(e.from).module, b = byId.get(e.to).module;
    if (a === b) continue;
    if (!modOut.has(a)) modOut.set(a, new Set());
    modOut.get(a).add(b);
    const k = `${a}|${b}`;
    modEdgeMeta.set(k, (modEdgeMeta.get(k) || 0) + (e.count || 1));
  }
  const groupOf = (m) => (graph.moduleNodes.find((x) => x.module === m) || {}).group;

  // 1. ADR-008
  for (const e of graph.edges) {
    const to = byId.get(e.to);
    if (to.module !== WASM_TARGET) continue;
    const from = byId.get(e.from);
    if (WASM_ALLOWED.has(from.module)) continue;
    add('error', 'ADR-008',
      `${shortMod(from.module)}::${from.short} calls WasmPathfinderService.${to.short} directly (use the PathfinderService interface)`,
      { module: from.module, id: from.id, file: from.file, line: from.line });
  }

  // 2. layer direction
  for (const [a, tos] of modOut) {
    const ra = LAYER[groupOf(a)];
    if (ra == null || ra < 0) continue;
    for (const b of tos) {
      const rb = LAYER[groupOf(b)];
      if (rb == null || rb < 0) continue;
      if (ra < rb) {
        add('warn', 'layers',
          `${shortMod(a)} (${groupOf(a)}) depends on higher layer ${shortMod(b)} (${groupOf(b)}) — ${modEdgeMeta.get(`${a}|${b}`)} call site(s)`,
          { module: a });
      }
    }
  }

  // 3. cycles (Tarjan SCC on the module graph)
  {
    let idx = 0;
    const index = new Map(), low = new Map(), onStack = new Set(), stack = [];
    const allMods = [...new Set([...modOut.keys(), ...graph.moduleNodes.map((m) => m.module)])];
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
        if (comp.length > 1) {
          add('error', 'cycle',
            `circular module dependency (${comp.length}): ${comp.map(shortMod).join(' → ')} → …`,
            { module: comp[0] });
        }
      }
    };
    for (const v of allMods) if (!index.has(v)) strong(v);
  }

  // 4. god modules
  for (const m of graph.moduleNodes) {
    if (m.fns > GOD_FUNCTIONS) {
      add('warn', 'god-module', `${shortMod(m.module)} has ${m.fns} functions (> ${GOD_FUNCTIONS}) — consider splitting`, { module: m.module });
    }
  }

  // 5. orphans (standalone private fns with no callers; class methods/stores excluded)
  const inDeg = new Map();
  for (const e of graph.edges) inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1);
  for (const n of graph.nodes) {
    if (n.kind !== 'function' || n.className) continue;
    if (n.exported || n.tested || inDeg.get(n.id) || n.group === 'stores') continue;
    add('warn', 'orphan', `${shortMod(n.module)}::${n.short} is never called (dead code?)`,
      { module: n.module, id: n.id, file: n.file, line: n.line });
  }

  const errors = findings.filter((f) => f.level === 'error').length;
  return { findings, errors, warnings: findings.length - errors };
}

/** Modules ranked as TS→Rust port candidates: compute-heavy and low-coupling. */
export function portCandidates(graph, limit = 15) {
  const HIGHER = new Set(['services', 'systems', 'stores', 'components', 'routes']);
  const agg = new Map();
  for (const n of graph.nodes) {
    const a = agg.get(n.module) || { fns: 0, loc: 0, numeric: 0, topFn: null };
    a.fns++; a.loc += n.loc || 0; a.numeric += n.numeric || 0;
    if (!a.topFn || (n.numeric || 0) > a.topFn.numeric) a.topFn = { name: n.short, numeric: n.numeric || 0 };
    agg.set(n.module, a);
  }
  const cross = new Map();
  const groupOf = (m) => (graph.moduleNodes.find((x) => x.module === m) || {}).group;
  for (const e of graph.moduleEdges) {
    if (HIGHER.has(groupOf(e.to))) cross.set(e.from, (cross.get(e.from) || 0) + 1);
  }
  return graph.moduleNodes
    .filter((m) => !['rust', 'dev'].includes(m.group))
    .map((m) => {
      const a = agg.get(m.module) || { fns: 0, loc: 0, numeric: 0, topFn: null };
      const coupling = cross.get(m.module) || 0;
      const score = +(a.numeric * Math.log2(a.loc + 2) / (1 + coupling)).toFixed(1);
      return {
        module: shortMod(m.module), fullModule: m.module, group: m.group, functions: a.fns,
        loc: a.loc, numericOps: a.numeric, couplingToHigherLayers: coupling,
        hottestFunction: a.topFn && a.topFn.name, score,
      };
    })
    .filter((r) => r.numericOps > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}

/** Standalone private functions with no in-graph callers (dead-code candidates). */
export function orphans(graph) {
  const inDeg = new Map();
  for (const e of graph.edges) inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1);
  return graph.nodes.filter(
    (n) => n.kind === 'function' && !n.className && !n.exported && !n.tested && !inDeg.get(n.id) && n.group !== 'stores'
  );
}
