// Enrichment from the sibling `codegraph` extract: call edges, the `tested` flag, and
// hop distance from named entry points.
//
// codegraph node ids embed a line number, so they cannot be the ledger's key. This maps
// them onto ours by (file, class, name), disambiguating same-named siblings by nearest
// declared line. Unmatched nodes are counted and reported rather than silently dropped --
// a low match rate means the graph extract is stale and reachability triggers are lying.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

// codegraph is a sibling of the MAIN checkout, so `../codegraph` does not resolve from
// inside a worktree under .claude/worktrees/. Candidates are tried in order.
function candidates(root) {
  const c = [];
  if (process.env.CODEGRAPH_JSON) c.push(process.env.CODEGRAPH_JSON);
  if (process.env.CODEGRAPH_DIR) c.push(join(process.env.CODEGRAPH_DIR, 'data', 'Fantasia4x.json'));
  c.push(join(root, '..', 'codegraph', 'data', 'Fantasia4x.json'));
  try {
    const main = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: root,
      encoding: 'utf8'
    }).trim();
    c.push(join(dirname(main), '..', 'codegraph', 'data', 'Fantasia4x.json'));
  } catch {
    // not a git checkout, or git unavailable -- the earlier candidates still apply
  }
  return c;
}

export let GRAPH_PATH = candidates(process.cwd()).join(' | ');

export function loadGraph(root = process.cwd()) {
  for (const path of candidates(root)) {
    if (!existsSync(path)) continue;
    GRAPH_PATH = path;
    return { ...JSON.parse(readFileSync(path, 'utf8')), path };
  }
  GRAPH_PATH = candidates(root)[candidates(root).length - 1];
  return null;
}

// codegraph names a method `Class.method` while also setting className, and prefixes
// accessors with `get `/`set `. Normalise both before matching.
function graphName(n) {
  let name = n.name ?? '';
  if (n.className && name.startsWith(n.className + '.')) name = name.slice(n.className.length + 1);
  return name.replace(/^(get|set)\s+/, '');
}

function indexSymbols(symbols) {
  const byTriple = new Map();
  for (const s of symbols) {
    const k = `${s.file} ${s.className ?? ''} ${s.name}`;
    if (!byTriple.has(k)) byTriple.set(k, []);
    byTriple.get(k).push(s);
  }
  return byTriple;
}

/** codegraph node id -> ledger symbol key. */
export function mapNodes(graph, symbols) {
  const byTriple = indexSymbols(symbols);
  const map = new Map();
  let matched = 0;
  for (const n of graph.nodes) {
    const cands = byTriple.get(`${n.file} ${n.className ?? ''} ${graphName(n)}`);
    if (!cands || cands.length === 0) continue;
    const pick =
      cands.length === 1
        ? cands[0]
        : cands.reduce((a, b) =>
            Math.abs(a.startLine - n.line) <= Math.abs(b.startLine - n.line) ? a : b
          );
    map.set(n.id, pick.key);
    matched++;
  }
  return { map, matched, total: graph.nodes.length };
}

export function edgesFor(graph, nodeMap) {
  const out = [];
  let dropped = 0;
  for (const e of graph.edges) {
    const a = nodeMap.get(e.from);
    const b = nodeMap.get(e.to);
    if (a && b && a !== b) out.push([a, b]);
    else dropped++;
  }
  return { edges: out, dropped };
}

export function testedKeys(graph, nodeMap) {
  const s = new Set();
  for (const n of graph.nodes) {
    if (n.tested && nodeMap.has(n.id)) s.add(nodeMap.get(n.id));
  }
  return s;
}

/** BFS from each entry symbol name over the call edges. */
export function reachability(edges, symbols, entryNames) {
  const adj = new Map();
  for (const [a, b] of edges) {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push(b);
  }
  const rows = [];
  for (const entry of entryNames) {
    const seeds = symbols.filter((s) => s.name === entry).map((s) => s.key);
    if (seeds.length === 0) continue;
    const dist = new Map(seeds.map((k) => [k, 0]));
    let frontier = seeds;
    while (frontier.length) {
      const next = [];
      for (const k of frontier) {
        for (const nb of adj.get(k) ?? []) {
          if (dist.has(nb)) continue;
          dist.set(nb, dist.get(k) + 1);
          next.push(nb);
        }
      }
      frontier = next;
    }
    for (const [key, hops] of dist) rows.push({ entry, key, hops });
  }
  return rows;
}

/** dep_hash: sha over the sorted content hashes of a symbol's 1-hop callees.
 *  This is what makes an audit of a caller re-open when a callee's body changes. */
export function depHashes(edges, symbols, sha) {
  const hash = new Map(symbols.map((s) => [s.key, s.contentHash]));
  const callees = new Map();
  for (const [a, b] of edges) {
    if (!callees.has(a)) callees.set(a, new Set());
    callees.get(a).add(b);
  }
  const out = [];
  for (const s of symbols) {
    const cs = [...(callees.get(s.key) ?? [])]
      .map((k) => hash.get(k))
      .filter(Boolean)
      .sort();
    out.push([s.key, cs.length ? sha(cs.join('|')) : '']);
  }
  return out;
}
