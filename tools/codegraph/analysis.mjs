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

// ===========================================================================
// ADR registry — one entry per Architecture Decision Record.
//
// ONBOARDING A NEW ADR (see AGENTS.md "Doc Sync"): add an entry below. Either
//   • give it `check(graph, { byId })` returning findings (a structural
//     invariant the call graph can verify), or
//   • set `checkable: false` with a `reason` (design/runtime decision the graph
//     can't express).
// `pnpm graph:check` flags any ADR in DECISIONS.md missing from this list, so
// onboarding is self-enforcing. A finding is { msg, module?, id?, file?, line? }.
// ===========================================================================
export const ADR_RULES = [
  {
    adr: 'ADR-008', severity: 'error',
    title: 'Spatial logic only via the PathfinderService interface',
    check: (graph, { byId }) => {
      const out = [];
      for (const e of graph.edges) {
        const to = byId.get(e.to);
        if (to.module !== WASM_TARGET) continue;
        const from = byId.get(e.from);
        if (from.module === WASM_TARGET) continue;
        out.push({
          msg: `${shortMod(from.module)}::${from.short} calls WasmPathfinderService.${to.short} directly (use the PathfinderService interface)`,
          module: from.module, id: from.id, file: from.file, line: from.line,
        });
      }
      return out;
    },
  },
  // Design / runtime decisions — acknowledged as not call-graph-expressible.
  { adr: 'ADR-001', checkable: false, reason: 'Layered singletons — layer direction is enforced by the `layers` rule; "import the singleton, never new XImpl()" needs new-expression analysis.' },
  { adr: 'ADR-002', checkable: false, reason: 'GameStateManager-only mutation — needs field-assignment analysis, not call edges.' },
  { adr: 'ADR-003', checkable: false, reason: 'All stat calcs via ModifierSystem — a semantic contract, not a structural edge.' },
  { adr: 'ADR-004', checkable: false, reason: 'AI generation server-side only — a deployment/runtime boundary.' },
  { adr: 'ADR-005', checkable: false, reason: 'LocalStorage persistence via store — runtime behaviour.' },
  { adr: 'ADR-006', checkable: false, reason: 'Data files = definitions not logic — partly covered by the `layers` rule (core must not call services).' },
  { adr: 'ADR-007', checkable: false, reason: 'Tech-stack choice (SvelteKit + WebGL2) — not an invariant.' },
  { adr: 'ADR-009', checkable: false, reason: 'Production-chain game design — content, not structure.' },
  { adr: 'ADR-010', checkable: false, reason: 'Need-priority interruption formula — runtime behaviour.' },
  { adr: 'ADR-011', checkable: false, reason: 'Gated hot-path logging — runtime behaviour.' },
  { adr: 'ADR-012', checkable: false, reason: 'Combat wound model — game design.' },
  { adr: 'ADR-013', checkable: false, reason: 'Deferred combat depth — game design.' },
  { adr: 'ADR-014', checkable: false, reason: 'Tile occupancy via OccupancyService — bypass detection needs field-level analysis.' },
  { adr: 'ADR-015', checkable: false, reason: 'Single work model — the superseded path was deleted; nothing to detect.' },
  { adr: 'ADR-016', checkable: false, reason: 'Physical production (reserve-and-fetch) — runtime behaviour.' },
  { adr: 'ADR-017', checkable: false, reason: 'Data-driven jobs (jobs.jsonc ↔ Job[type] union ↔ JobService handler registry) — a data-coverage invariant, not a call edge. Drift is enforced by jobRegistry.test.ts + compile-time JobPoolType guards.' },
];

/** Architecture rule checks. Returns { findings, errors, warnings, rules }. */
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

  // 1. ADR rules (from the registry) — one rule per checkable ADR.
  const adrRuleIds = [];
  for (const r of ADR_RULES) {
    if (!r.check) continue;
    adrRuleIds.push(r.adr);
    for (const f of r.check(graph, { byId })) add(r.severity || 'error', r.adr, f.msg, f);
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

  // 6. ADR onboarding — any ADR in DECISIONS.md not in the registry above.
  const known = new Set(ADR_RULES.map((r) => r.adr));
  for (const a of graph.adrs || []) {
    if (!known.has(a.id)) {
      add('warn', 'adr-coverage',
        `${a.id} (${a.title}) is not onboarded into graph:check — add a rule or mark it non-checkable in analysis.mjs ADR_RULES`,
        {});
    }
  }

  const errors = findings.filter((f) => f.level === 'error').length;
  // Ordered rule ids evaluated (so consumers can show passing rules as ✓ too).
  const rules = [...adrRuleIds, 'cycle', 'layers', 'god-module', 'orphan', 'adr-coverage'];
  return { findings, errors, warnings: findings.length - errors, rules };
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

// Tunable thresholds for the best-practice recommendations.
const COMPONENT_MAX_LINES = 200; // AGENTS.md + SvelteKit guidance
const FUNCTION_MAX_LINES = 80;   // keep functions focused

/**
 * Stack-specific best-practice recommendations (SvelteKit 5 + TS + layered + WASM),
 * grounded in the current ecosystem guidance and the project's own rules. Returns
 * an ordered list of { id, severity, title, rationale, findings:[{label,sub,nav}] }.
 * Stack best-practices only; structural rules live in the Architecture check.
 */
export function recommendations(graph) {
  const inDeg = new Map();
  for (const e of graph.edges) inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1);
  const recs = [];
  const nodeFind = (n, sub) => ({ label: n.short, sub, nav: ['node', n.id] });

  // ---- source-derived signals ----
  // 1. Svelte 5: migrate legacy `$:` to runes
  const legacy = graph.nodes.filter((n) => n.kind === 'component' && n.legacyReactive > 0)
    .sort((a, b) => b.legacyReactive - a.legacyReactive);
  if (legacy.length) recs.push({
    id: 'runes', severity: 'warn',
    title: `Migrate ${legacy.length} component(s) from legacy \`$:\` to runes`,
    rationale: 'Svelte 5 favours $state/$derived/$effect over legacy `$:` reactivity — clearer dependencies, smaller bundles, better tree-shaking. The project mandates runes.',
    findings: legacy.map((n) => nodeFind(n, `${n.legacyReactive} legacy $: statement(s)`)),
  });

  // 2. Component size (≤ 200 lines)
  const bigComp = graph.nodes.filter((n) => n.kind === 'component' && (n.loc || 0) > COMPONENT_MAX_LINES)
    .sort((a, b) => b.loc - a.loc);
  if (bigComp.length) recs.push({
    id: 'component-size', severity: 'warn',
    title: `${bigComp.length} Svelte component(s) exceed ${COMPONENT_MAX_LINES} lines`,
    rationale: 'Large components are hard to test and re-render less efficiently. SvelteKit guidance and the project AGENTS.md cap components at 200 lines — extract sub-components.',
    findings: bigComp.map((n) => nodeFind(n, `${n.loc} lines`)),
  });

  // 3. Function length (keep functions focused)
  const bigFns = graph.nodes.filter((n) => (n.kind === 'function' || n.kind === 'method') && (n.loc || 0) > FUNCTION_MAX_LINES)
    .sort((a, b) => b.loc - a.loc);
  if (bigFns.length) recs.push({
    id: 'function-size', severity: 'info',
    title: `${bigFns.length} function(s) over ${FUNCTION_MAX_LINES} lines`,
    rationale: 'Long functions concentrate complexity and resist unit testing. Split the largest into named helpers.',
    findings: bigFns.map((n) => nodeFind(n, `${n.loc} lines · ${shortMod(n.module)}`)),
  });

  // 4. Test the business layer (used service/engine logic, by call count)
  const core = graph.nodes.filter((n) => ['services', 'systems'].includes(n.group) &&
    (n.kind === 'function' || n.kind === 'method') && (inDeg.get(n.id) || 0) >= 1);
  const untested = core.filter((n) => !n.tested).sort((a, b) => (inDeg.get(b.id) || 0) - (inDeg.get(a.id) || 0));
  if (untested.length) recs.push({
    id: 'coverage', severity: 'info',
    title: `Test core logic — ${untested.length}/${core.length} used service/engine fns are untested`,
    rationale: 'A layered architecture pays off when the business layer is covered. These are functions with callers but no test touching them — the most-called are the highest-value targets.',
    findings: untested.map((n) => nodeFind(n, `${inDeg.get(n.id) || 0} callers · ${shortMod(n.module)}`)),
  });

  // NB: structural rules (ADR-008, cycles, layers, god-modules) live in the
  // Architecture check, not here — this section is only stack best-practices
  // that the hard checker doesn't (and shouldn't) enforce.
  const order = { error: 0, warn: 1, info: 2 };
  return recs.sort((a, b) => order[a.severity] - order[b.severity] || b.findings.length - a.findings.length);
}

/** Standalone private functions with no in-graph callers (dead-code candidates). */
export function orphans(graph) {
  const inDeg = new Map();
  for (const e of graph.edges) inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1);
  return graph.nodes.filter(
    (n) => n.kind === 'function' && !n.className && !n.exported && !n.tested && !inDeg.get(n.id) && n.group !== 'stores'
  );
}
