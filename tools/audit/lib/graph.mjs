// Enrichment from the sibling `codegraph` extract: call edges, the `tested` flag, and
// hop distance from named entry points.
//
// codegraph node ids embed a line number, so they cannot be the ledger's key. This maps
// them onto ours by (file, class, name), disambiguating same-named siblings by nearest
// declared line.
//
// The two inventories do not agree on what a symbol IS, and matching on the triple alone
// loses every node where they differ: codegraph splits out nested functions and
// object-literal methods that we deliberately fold into their enclosing symbol, and it
// names a Svelte component after the file where we call it `<markup>`. Those nodes are not
// missing -- they are parts of one of our symbols -- so they are mapped onto whichever
// symbol's span contains them. Without that, their call edges are dropped and the
// reachability they carry never reaches the ledger.

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

/**
 * codegraph node id -> ledger symbol key.
 *
 * Returns the match rate broken down by how each node was matched, because the three
 * routes mean different things: `exact` is one-to-one, `enclosing` is a node folded into
 * the symbol it is written inside, and whatever is left has no counterpart here at all
 * (Rust, which this inventory does not walk).
 */
export function mapNodes(graph, symbols) {
  const byTriple = indexSymbols(symbols);
  const markup = new Map();
  const byFile = new Map();
  for (const s of symbols) {
    if (s.kind === 'markup') markup.set(s.file, s.key);
    if (!byFile.has(s.file)) byFile.set(s.file, []);
    byFile.get(s.file).push(s);
  }

  const map = new Map();
  const unmatched = [];
  let exact = 0;
  let enclosing = 0;

  for (const n of graph.nodes) {
    const cands = byTriple.get(`${n.file} ${n.className ?? ''} ${graphName(n)}`);
    if (cands && cands.length) {
      const pick =
        cands.length === 1
          ? cands[0]
          : cands.reduce((a, b) =>
              Math.abs(a.startLine - n.line) <= Math.abs(b.startLine - n.line) ? a : b
            );
      map.set(n.id, pick.key);
      exact++;
      continue;
    }
    // A component node is the whole file to codegraph; here the file's markup is one symbol
    // and its script functions are others. The component's edges belong to the markup.
    if (n.kind === 'component' && markup.has(n.file)) {
      map.set(n.id, markup.get(n.file));
      enclosing++;
      continue;
    }
    // Otherwise: the smallest symbol whose span contains the node. codegraph gives endLine
    // for a real span; older extracts only have `line`, which still lands inside the owner.
    const owner = smallestContaining(byFile.get(n.file), n);
    if (owner) {
      map.set(n.id, owner.key);
      enclosing++;
      continue;
    }
    unmatched.push(n);
  }
  return { map, matched: exact + enclosing, exact, enclosing, unmatched, total: graph.nodes.length };
}

/** The tightest ledger symbol whose line span covers a codegraph node. */
function smallestContaining(symbols, n) {
  if (!symbols) return null;
  const end = typeof n.endLine === 'number' ? n.endLine : n.line;
  let best = null;
  for (const s of symbols) {
    if (s.startLine > n.line || s.endLine < end) continue;
    if (!best || s.endLine - s.startLine < best.endLine - best.startLine) best = s;
  }
  return best;
}

/**
 * Call edges in ledger keys. An edge whose ends fold into the SAME symbol (a helper calling
 * its own enclosing function) is internal to that symbol and carries no reachability, so it
 * is counted separately from an edge dropped for want of a mapping.
 */
export function edgesFor(graph, nodeMap) {
  const out = [];
  let internal = 0;
  let dropped = 0;
  for (const e of graph.edges) {
    const a = nodeMap.get(e.from);
    const b = nodeMap.get(e.to);
    if (a && b && a !== b) out.push([a, b]);
    else if (a && b) internal++;
    else dropped++;
  }
  return { edges: out, internal, dropped };
}

export function testedKeys(graph, nodeMap) {
  const s = new Set();
  for (const n of graph.nodes) {
    if (n.tested && nodeMap.has(n.id)) s.add(nodeMap.get(n.id));
  }
  return s;
}

/**
 * symbol key -> hops from the nearest directly-tested node, over codegraph's call edges.
 * Several nodes can fold into one symbol, so the shortest reach wins: if any part of a
 * symbol is reached by a test, the symbol is.
 */
export function testDepths(graph, nodeMap) {
  const out = new Map();
  for (const n of graph.nodes) {
    if (n.testDepth == null) continue;
    const key = nodeMap.get(n.id);
    if (!key) continue;
    const cur = out.get(key);
    if (cur === undefined || n.testDepth < cur) out.set(key, n.testDepth);
  }
  return out;
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
