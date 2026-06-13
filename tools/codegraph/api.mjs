// @ts-check
/**
 * JSON query API over the codebase graph — gives an LLM agent the same
 * information the browser viewer shows: function descriptions, signatures,
 * call edges (callers/callees), module dependencies, search, call paths,
 * and architectural hubs.
 *
 * Mounted under /api by serve.mjs. Reads graph.json + descriptions.json and
 * is refreshed by serve.mjs after every rebuild via reload().
 *
 * Every response is JSON with permissive CORS so an agent can fetch it from
 * anywhere. Add ?format=md to function/module/search/path for a prose summary.
 */
import fs from 'node:fs';
import path from 'node:path';
import { runChecks, portCandidates, orphans } from './analysis.mjs';

const shortMod = (m) => m.replace(/^game\//, '');

export function createApi(DIR) {
  /** @type {any} */ let G = null;        // parsed graph.json
  /** @type {any} */ let DESC = { modules: {}, functions: {}, groups: {} };
  // indexes
  let byId = new Map();
  let byShort = new Map();      // lowercased Class.method / fn -> [node]
  let byMethod = new Map();     // lowercased trailing name -> [node]
  let byModule = new Map();     // module -> [node]
  let moduleKey = new Map();    // lowercased alias -> canonical module
  let outAdj = new Map();       // id -> [edgeIndex]
  let inAdj = new Map();
  let modSize = new Map();      // module -> { loc, chars, depIn, depOut }

  function reload() {
    try {
      G = JSON.parse(fs.readFileSync(path.join(DIR, 'graph.json'), 'utf8'));
    } catch { G = null; return; }
    try {
      DESC = JSON.parse(fs.readFileSync(path.join(DIR, 'descriptions.json'), 'utf8'));
    } catch { DESC = { modules: {}, functions: {}, groups: {} }; }

    byId = new Map(); byShort = new Map(); byMethod = new Map(); byModule = new Map();
    moduleKey = new Map(); outAdj = new Map(); inAdj = new Map();

    for (const n of G.nodes) {
      byId.set(n.id, n);
      const sk = n.short.toLowerCase();
      (byShort.get(sk) || byShort.set(sk, []).get(sk)).push(n);
      const mk = (n.short.split('.').pop() || n.short).toLowerCase();
      (byMethod.get(mk) || byMethod.set(mk, []).get(mk)).push(n);
      (byModule.get(n.module) || byModule.set(n.module, []).get(n.module)).push(n);
    }
    for (const m of G.moduleNodes) {
      for (const key of [m.module, shortMod(m.module), m.module.split('/').pop()]) {
        if (!moduleKey.has(key.toLowerCase())) moduleKey.set(key.toLowerCase(), m.module);
      }
    }
    G.edges.forEach((e, i) => {
      (outAdj.get(e.from) || outAdj.set(e.from, []).get(e.from)).push(i);
      (inAdj.get(e.to) || inAdj.set(e.to, []).get(e.to)).push(i);
    });
    // per-module size + dependency aggregates (parity with the viewer's lists)
    modSize = new Map(G.moduleNodes.map((m) => [m.module, { loc: 0, chars: 0, depIn: 0, depOut: 0 }]));
    for (const n of G.nodes) { const a = modSize.get(n.module); if (a) { a.loc += n.loc || 0; a.chars += n.chars || 0; } }
    for (const e of G.moduleEdges) { const f = modSize.get(e.from), t = modSize.get(e.to); if (f) f.depOut++; if (t) t.depIn++; }
  }

  // ---- description resolution (mirrors the browser viewer) ----
  function describe(n) {
    const key = `${n.module}::${n.short}`;
    if (DESC.functions && DESC.functions[key]) return { text: DESC.functions[key], source: 'curated' };
    if (n.doc) return { text: n.desc, source: 'jsdoc' };
    return { text: n.desc || n.humanized, source: 'inferred' };
  }
  function describeModule(m) {
    return (DESC.modules && DESC.modules[m.module]) || `${m.fns} functions. No curated description yet.`;
  }

  // ---- shaping ----
  function fnRow(n) {
    const d = describe(n);
    return {
      id: n.id, name: n.short, module: shortMod(n.module), group: n.group, kind: n.kind,
      exported: n.exported, tested: !!n.tested, file: n.file, line: n.line,
      loc: n.loc, chars: n.chars, numeric: n.numeric,
      description: d.text, descriptionSource: d.source,
      inDegree: n.inDegree, outDegree: n.outDegree,
    };
  }
  function fnRef(n) {
    return { name: n.short, module: shortMod(n.module), file: n.file, line: n.line, description: describe(n).text };
  }
  function fnDetail(n) {
    const calls = (outAdj.get(n.id) || []).map((i) => fnRef(byId.get(G.edges[i].to)));
    const calledBy = (inAdj.get(n.id) || []).map((i) => fnRef(byId.get(G.edges[i].from)));
    return { ...fnRow(n), signature: n.signature, calls, calledBy };
  }
  function moduleSummary(m) {
    const sz = modSize.get(m.module) || { loc: 0, chars: 0, depIn: 0, depOut: 0 };
    return {
      module: shortMod(m.module), fullModule: m.module, group: m.group, file: m.file,
      functionCount: m.fns, description: describeModule(m),
      loc: sz.loc, chars: sz.chars,
      dependsOnCount: sz.depOut, usedByCount: sz.depIn,
    };
  }
  function moduleDetail(m) {
    const outs = G.moduleEdges.filter((e) => e.from === m.module).sort((a, b) => b.count - a.count);
    const ins = G.moduleEdges.filter((e) => e.to === m.module).sort((a, b) => b.count - a.count);
    const fns = (byModule.get(m.module) || []).slice().sort((a, b) => b.inDegree - a.inDegree);
    return {
      module: shortMod(m.module), fullModule: m.module, group: m.group, file: m.file,
      functionCount: m.fns, description: describeModule(m),
      dependsOn: outs.map((e) => ({ module: shortMod(e.to), callSites: e.count })),
      usedBy: ins.map((e) => ({ module: shortMod(e.from), callSites: e.count })),
      functions: fns.map((n) => ({ name: n.short, line: n.line, inDegree: n.inDegree, outDegree: n.outDegree, description: describe(n).text })),
    };
  }

  // ---- resolvers ----
  function resolveFns(q) {
    if (!q) return [];
    if (byId.has(q)) return [byId.get(q)];
    const lq = q.toLowerCase();
    if (byShort.has(lq)) return byShort.get(lq);
    if (byMethod.has(lq)) return byMethod.get(lq);
    // substring fallback on the qualified name
    const hits = G.nodes.filter((n) => n.short.toLowerCase().includes(lq));
    return hits;
  }
  function resolveModule(q) {
    if (!q) return null;
    const lq = q.toLowerCase();
    if (moduleKey.has(lq)) return G.moduleNodes.find((m) => m.module === moduleKey.get(lq));
    const hit = G.moduleNodes.find((m) => m.module.toLowerCase().includes(lq));
    return hit || null;
  }

  // ---- search (functions + modules by name & description) ----
  function search(q, limit) {
    const lq = q.toLowerCase();
    const score = (hay, isName) => {
      const h = hay.toLowerCase();
      if (h === lq) return isName ? 100 : 60;
      if (h.startsWith(lq)) return isName ? 70 : 40;
      if (h.includes(lq)) return isName ? 45 : 25;
      return 0;
    };
    const fns = [];
    for (const n of G.nodes) {
      const s = Math.max(score(n.short, true), score(describe(n).text, false));
      if (s > 0) fns.push({ s, n });
    }
    fns.sort((a, b) => b.s - a.s || b.n.inDegree - a.n.inDegree);
    const mods = [];
    for (const m of G.moduleNodes) {
      const s = Math.max(score(shortMod(m.module), true), score(describeModule(m), false));
      if (s > 0) mods.push({ s, m });
    }
    mods.sort((a, b) => b.s - a.s || b.m.fns - a.m.fns);
    return {
      functions: fns.slice(0, limit).map((x) => fnRow(x.n)),
      modules: mods.slice(0, limit).map((x) => moduleSummary(x.m)),
    };
  }

  // ---- shortest call path (directed caller -> callee) ----
  function callPath(fromN, toN, max) {
    if (fromN.id === toN.id) return [fnRef(fromN)];
    const prev = new Map([[fromN.id, null]]);
    const queue = [fromN.id];
    while (queue.length) {
      const cur = queue.shift();
      for (const i of outAdj.get(cur) || []) {
        const nxt = G.edges[i].to;
        if (prev.has(nxt)) continue;
        prev.set(nxt, cur);
        if (nxt === toN.id) {
          const path = [];
          let c = nxt;
          while (c) { path.unshift(fnRef(byId.get(c))); c = prev.get(c); }
          if (path.length - 1 > max) return null;
          return path;
        }
        queue.push(nxt);
      }
    }
    return null;
  }

  // ---- markdown formatting (optional, agent-friendly prose) ----
  function fnMd(d) {
    return [
      `# ${d.name}  (${d.module})`,
      ``, d.description, ``,
      `- **kind**: ${d.kind}${d.exported ? ' · exported' : ''}  ·  **source**: ${d.file}:${d.line}  ·  **desc from**: ${d.descriptionSource}`,
      `- **signature**: \`${d.signature}\``,
      ``, `## Calls (${d.calls.length})`,
      ...d.calls.map((c) => `- ${c.name} (${c.module}) — ${c.description}`),
      ``, `## Called by (${d.calledBy.length})`,
      ...d.calledBy.map((c) => `- ${c.name} (${c.module}) — ${c.description}`),
    ].join('\n');
  }
  function moduleMd(d) {
    return [
      `# ${d.module}  (${d.group})`,
      ``, d.description, ``,
      `Source: ${d.file} · ${d.functionCount} functions`, ``,
      `## Depends on (${d.dependsOn.length})`,
      ...d.dependsOn.map((e) => `- ${e.module} (${e.callSites})`),
      ``, `## Used by (${d.usedBy.length})`,
      ...d.usedBy.map((e) => `- ${e.module} (${e.callSites})`),
      ``, `## Functions`,
      ...d.functions.map((f) => `- ${f.name} — ${f.description}`),
    ].join('\n');
  }

  // ---- HTTP ----
  function send(res, status, body, type = 'application/json') {
    const data = type === 'application/json' ? JSON.stringify(body, null, 2) : body;
    res.writeHead(status, {
      'Content-Type': `${type}; charset=utf-8`,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  }
  const ok = (res, b) => send(res, 200, b);
  const err = (res, code, msg, extra) => send(res, code, { error: msg, ...extra });
  const num = (v, d) => (v == null || v === '' || isNaN(+v) ? d : +v);

  const INDEX = {
    service: 'fantasia4x-codegraph',
    description: 'Query the codebase call graph (functions, descriptions, call edges, module deps).',
    humanView: '/',
    identifiers:
      'Functions resolve by exact id, by Class.method, or by bare method name (?name=). ' +
      'Modules resolve by full path, short path, or basename (?name=, e.g. JobService).',
    endpoints: {
      'GET /api': 'this index',
      'GET /api/stats': 'counts (functions, edges, modules, files)',
      'GET /api/graph': 'full graph: nodes (with descriptions), edges, modules, moduleEdges',
      'GET /api/modules': 'all module summaries',
      'GET /api/module?name=&format=md': 'one module: description, deps, function list',
      'GET /api/functions?module=&q=&kind=&exported=&limit=': 'list/filter functions',
      'GET /api/function?name=|id=&format=md': 'one function: description, signature, callers, callees',
      'GET /api/search?q=&limit=&format=md': 'search functions + modules by name and description',
      'GET /api/callers?name=': 'functions that call the target',
      'GET /api/callees?name=': 'functions the target calls',
      'GET /api/path?from=&to=&max=&format=md': 'shortest call path from one function to another',
      'GET /api/check': 'architecture rule findings (ADR-008, cycles, layers, god-modules, orphans)',
      'GET /api/port-candidates?limit=': 'modules ranked as TS→Rust port candidates (compute-heavy, low coupling)',
      'GET /api/orphans': 'standalone private functions with no callers (dead-code candidates)',
      'GET /api/hubs?limit=': 'most-called functions and most-depended-on modules',
    },
  };

  /** Returns true if it handled the request. */
  function handle(req, res, url) {
    if (!url.pathname.startsWith('/api')) return false;
    if (req.method === 'OPTIONS') { send(res, 204, ''); return true; }
    if (req.method !== 'GET') { err(res, 405, 'GET only'); return true; }
    if (!G) { err(res, 503, 'graph not built yet'); return true; }

    const p = url.pathname.replace(/\/+$/, '') || '/api';
    const qp = url.searchParams;
    const md = qp.get('format') === 'md';

    try {
      if (p === '/api') return ok(res, INDEX), true;
      if (p === '/api/stats') return ok(res, { ...G.stats, generatedAt: G.generatedAt }), true;

      if (p === '/api/graph') {
        return ok(res, {
          stats: G.stats, generatedAt: G.generatedAt,
          nodes: G.nodes.map(fnRow),
          edges: G.edges.map((e) => ({ from: e.from, to: e.to, count: e.count })),
          modules: G.moduleNodes.map(moduleSummary),
          moduleEdges: G.moduleEdges.map((e) => ({ from: shortMod(e.from), to: shortMod(e.to), count: e.count })),
        }), true;
      }

      if (p === '/api/modules') return ok(res, { modules: G.moduleNodes.map(moduleSummary) }), true;

      if (p === '/api/module') {
        const m = resolveModule(qp.get('name'));
        if (!m) return err(res, 404, 'module not found', { hint: 'try /api/modules' }), true;
        const d = moduleDetail(m);
        return md ? send(res, 200, moduleMd(d), 'text/markdown') : ok(res, d), true;
      }

      if (p === '/api/functions') {
        let list = G.nodes;
        const mod = qp.get('module');
        if (mod) { const m = resolveModule(mod); list = m ? (byModule.get(m.module) || []) : []; }
        const q = (qp.get('q') || '').toLowerCase();
        if (q) list = list.filter((n) => n.short.toLowerCase().includes(q) || describe(n).text.toLowerCase().includes(q));
        const kind = qp.get('kind'); if (kind) list = list.filter((n) => n.kind === kind);
        const exp = qp.get('exported'); if (exp != null) list = list.filter((n) => String(n.exported) === exp);
        const limit = num(qp.get('limit'), 100);
        const sorted = list.slice().sort((a, b) => b.inDegree - a.inDegree);
        return ok(res, { count: list.length, functions: sorted.slice(0, limit).map(fnRow) }), true;
      }

      if (p === '/api/function') {
        const q = qp.get('id') || qp.get('name');
        if (!q) return err(res, 400, 'provide ?name= or ?id='), true;
        const hits = resolveFns(q);
        if (!hits.length) return err(res, 404, `no function matches "${q}"`), true;
        if (hits.length > 1) return ok(res, { ambiguous: true, query: q, matches: hits.map(fnRow) }), true;
        const d = fnDetail(hits[0]);
        return md ? send(res, 200, fnMd(d), 'text/markdown') : ok(res, d), true;
      }

      if (p === '/api/callers' || p === '/api/callees') {
        const q = qp.get('name') || qp.get('id');
        const hits = resolveFns(q);
        if (!hits.length) return err(res, 404, `no function matches "${q}"`), true;
        if (hits.length > 1) return ok(res, { ambiguous: true, matches: hits.map(fnRow) }), true;
        const n = hits[0];
        const idxs = (p.endsWith('callers') ? inAdj : outAdj).get(n.id) || [];
        const refs = idxs.map((i) => fnRef(byId.get(p.endsWith('callers') ? G.edges[i].from : G.edges[i].to)));
        return ok(res, { function: n.short, module: shortMod(n.module), [p.endsWith('callers') ? 'callers' : 'callees']: refs }), true;
      }

      if (p === '/api/search') {
        const q = qp.get('q');
        if (!q) return err(res, 400, 'provide ?q='), true;
        const r = search(q, num(qp.get('limit'), 20));
        if (md) {
          const lines = [`# search: ${q}`, ``, `## Functions`,
            ...r.functions.map((f) => `- ${f.name} (${f.module}) — ${f.description}`),
            ``, `## Modules`, ...r.modules.map((m) => `- ${m.module} — ${m.description}`)];
          return send(res, 200, lines.join('\n'), 'text/markdown'), true;
        }
        return ok(res, { query: q, ...r }), true;
      }

      if (p === '/api/path') {
        const from = resolveFns(qp.get('from'));
        const to = resolveFns(qp.get('to'));
        if (!from.length) return err(res, 404, `from: no match for "${qp.get('from')}"`), true;
        if (!to.length) return err(res, 404, `to: no match for "${qp.get('to')}"`), true;
        if (from.length > 1) return ok(res, { ambiguous: 'from', matches: from.map(fnRow) }), true;
        if (to.length > 1) return ok(res, { ambiguous: 'to', matches: to.map(fnRow) }), true;
        const path = callPath(from[0], to[0], num(qp.get('max'), 12));
        if (!path) return ok(res, { from: from[0].short, to: to[0].short, reachable: false }), true;
        if (md) {
          const lines = [`# call path: ${from[0].short} → ${to[0].short}  (${path.length - 1} hops)`, ``,
            ...path.map((n, i) => `${i + 1}. ${n.name} (${n.module}) — ${n.description}`)];
          return send(res, 200, lines.join('\n'), 'text/markdown'), true;
        }
        return ok(res, { from: from[0].short, to: to[0].short, hops: path.length - 1, path }), true;
      }

      if (p === '/api/hubs') {
        const limit = num(qp.get('limit'), 15);
        const fns = G.nodes.slice().sort((a, b) => b.inDegree - a.inDegree).slice(0, limit).map(fnRow);
        const mods = G.moduleNodes
          .map((m) => ({ m, used: G.moduleEdges.filter((e) => e.to === m.module).reduce((s, e) => s + e.count, 0) }))
          .sort((a, b) => b.used - a.used).slice(0, limit)
          .map((x) => ({ ...moduleSummary(x.m), incomingCallSites: x.used }));
        return ok(res, { mostCalledFunctions: fns, mostDependedOnModules: mods }), true;
      }

      if (p === '/api/check') {
        const { findings, errors, warnings } = runChecks(G);
        return ok(res, { errors, warnings, findings }), true;
      }

      if (p === '/api/port-candidates') {
        return ok(res, {
          note: 'Higher score = more numeric/compute-heavy and less coupled into the engine — i.e. an easier TS→Rust/WASM port. couplingToHigherLayers = distinct deps into services/systems/stores/UI, each a callback you would have to bridge. Already-Rust and dev modules excluded.',
          candidates: portCandidates(G, num(qp.get('limit'), 15)),
        }), true;
      }

      if (p === '/api/orphans') {
        const list = orphans(G).map(fnRow);
        return ok(res, {
          count: list.length,
          note: 'Standalone private functions with no in-graph callers — dead-code candidates. Excludes class methods and stores (dynamic dispatch / object-literal wiring make 0-callers unreliable there).',
          orphans: list,
        }), true;
      }

      err(res, 404, `unknown endpoint ${p}`, { see: '/api' });
      return true;
    } catch (e) {
      err(res, 500, 'internal error: ' + e.message);
      return true;
    }
  }

  return { reload, handle };
}
