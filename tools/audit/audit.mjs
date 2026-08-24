#!/usr/bin/env node
// audit — tiered, resumable, parallel-safe code audit over a symbol ledger.
//
//   audit index          rebuild the symbol inventory (spans, hashes, flags, call graph)
//   audit plan           cross active rules against symbols -> the pending work set
//   audit status         coverage: how much of the in-scope surface has a current verdict
//   audit next           claim a batch and print the prompt for it (one symbol per call)
//   audit submit <file>  validate and record an agent's JSON answer
//   audit release        return this worker's claims to the pool
//   audit findings       open fails, most recent first
//   audit na             n/a verdicts + per-rule n/a rate (rule-scope review)
//   audit t0             deterministic checks (ADR constant drift, ADR coverage gap)
//   audit demote         T2 rules that have earned a move down to T0
//   audit export         write the ledger out as JSONL for git
//   audit rules          list loaded rules and validation errors

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostname } from 'node:os';

import * as L from './lib/ledger.mjs';
import { extractRepo, sliceOf } from './lib/extract.mjs';
import * as G from './lib/graph.mjs';
import { loadRules } from './lib/rules.mjs';
import { makeContext, match } from './lib/triggers.mjs';
import { buildPrompt } from './lib/prompt.mjs';
import { parseResponse, validate } from './lib/verdict.mjs';
import { adrConstDrift, adrCoverage } from './lib/t0.mjs';

const ROOT = process.env.AUDIT_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Stable by default so `audit release` can find this machine's claims across separate
// CLI invocations. Parallel workers each set AUDIT_WORKER to something distinct.
const WORKER = process.env.AUDIT_WORKER || hostname();
const ENTRIES = ['processGameTurn', 'tickPawn'];

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : process.argv[i + 1];
};
const flag = (name) => process.argv.includes(`--${name}`);
const out = (s) => process.stdout.write(s + '\n');

// --- index -------------------------------------------------------------------

function cmdIndex() {
  const db = L.open();
  const t0 = Date.now();
  const symbols = extractRepo(ROOT);
  out(`extracted ${symbols.length} symbols in ${Date.now() - t0} ms`);

  const graph = G.loadGraph(ROOT);
  let edges = [];
  if (!graph) {
    out(`[warn] no codegraph extract at ${G.GRAPH_PATH} — reachability and caller triggers will not fire.`);
    out(`[warn] run \`pnpm graph\` first, or set CODEGRAPH_DIR.`);
  } else {
    const { map, matched, total } = G.mapNodes(graph, symbols);
    const e = G.edgesFor(graph, map);
    edges = e.edges;
    const tested = G.testedKeys(graph, map);
    for (const s of symbols) if (tested.has(s.key)) s.tested = true;
    const pct = ((matched / total) * 100).toFixed(0);
    out(`graph: ${matched}/${total} nodes mapped (${pct}%), ${edges.length} edges, ${e.dropped} unmapped`);
    if (matched / total < 0.8) {
      out(`[warn] low map rate — the codegraph extract (${graph.generatedAt}) is likely stale; re-run \`pnpm graph\`.`);
    }
    // The `tested` flag comes from codegraph's heuristic. When it collapses, family F asks
    // "is this untested?" about code that has tests -- noise, and it looks like coverage.
    const testedRate = tested.size / Math.max(1, symbols.filter((s) => s.kind === 'function' || s.kind === 'method').length);
    out(`graph: ${tested.size} symbols marked tested`);
    if (testedRate < 0.05) {
      out(`[warn] almost nothing is marked tested despite the repo having test files —`);
      out(`[warn] codegraph's tested detection is not matching; family F verdicts will be unreliable.`);
    }
  }

  L.replaceSymbols(db, symbols);
  L.replaceEdges(db, edges);
  const deps = G.depHashes(edges, symbols, L.sha);
  L.setDepHashes(db, deps);
  const reach = G.reachability(edges, symbols, ENTRIES);
  L.replaceReach(db, reach);
  for (const e of ENTRIES) {
    out(`reach: ${reach.filter((r) => r.entry === e).length} symbols from ${e}`);
  }
  db.prepare('INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)').run('indexed_at', L.nowIso());
  out(`indexed.`);
}

// --- plan --------------------------------------------------------------------

function loadRulesOrDie(db) {
  const { rules, errors } = loadRules();
  if (errors.length) {
    for (const e of errors) out(`[rules] ${e}`);
    process.exit(1);
  }
  L.upsertRules(db, rules);
  return rules;
}

function cmdPlan() {
  const db = L.open();
  loadRulesOrDie(db);
  const rules = L.activeRules(db, 'T2');
  const symbols = L.liveSymbols(db);
  const edges = db.prepare('SELECT caller, callee FROM symbol_edge').all().map((r) => [r.caller, r.callee]);
  const reach = db.prepare('SELECT entry, symbol_key, hops FROM reach').all();

  const ctx = makeContext({
    symbols, edges, reach,
    readSlice: (s) => sliceOf(ROOT, s)
  });
  const { items, misses } = match(rules, symbols, ctx);
  L.plan(db, items);

  const cov = L.coverage(db);
  out(`planned ${items.length} work items over ${cov.inScope} of ${cov.symbols} symbols`);
  out(`  done ${cov.done}  claimed ${cov.claimed}  pending ${cov.pending}`);
  if (flag('why')) {
    for (const r of rules) {
      const hit = items.filter((i) => i.rule_id === r.id).length;
      const m = [...(misses.get(r.id) ?? new Map())].sort((a, b) => b[1] - a[1]).slice(0, 3);
      out(`  ${r.id.padEnd(6)} ${String(hit).padStart(5)} matched   top misses: ${m.map(([k, n]) => `${k} (${n})`).join('; ')}`);
    }
  }
}

// --- status ------------------------------------------------------------------

function cmdStatus() {
  const db = L.open();
  const cov = L.coverage(db);
  const indexed = db.prepare(`SELECT v FROM meta WHERE k='indexed_at'`).get()?.v ?? 'never';
  const pct = cov.total ? ((cov.done / cov.total) * 100).toFixed(1) : '0.0';
  out(`indexed at ${indexed}`);
  out(`symbols ${cov.symbols}   in scope ${cov.inScope}`);
  out(`work ${cov.total}   done ${cov.done} (${pct}%)   claimed ${cov.claimed}   pending ${cov.pending}`);
  out('');
  for (const s of cov.byStatus) out(`  ${s.status.padEnd(13)} ${s.n}`);
  out('');
  out('per rule:');
  out(`  ${'rule'.padEnd(7)}${'family'.padEnd(16)}${'done/total'.padEnd(14)}${'fail'.padEnd(7)}${'undec'.padEnd(7)}n/a`);
  for (const r of L.perRule(db)) {
    out(`  ${r.id.padEnd(7)}${(r.family ?? '').padEnd(16)}${`${r.done ?? 0}/${r.total ?? 0}`.padEnd(14)}${String(r.fails ?? 0).padEnd(7)}${String(r.undecidable ?? 0).padEnd(7)}${r.na ?? 0}`);
  }
}

// --- next --------------------------------------------------------------------

function cmdNext() {
  const db = L.open();
  const runId = arg('run', null);
  const limit = Number(arg('rules', 40));
  const batch = L.claimBatch(db, {
    worker: WORKER, runId, limit,
    leaseMinutes: Number(arg('lease', 30)),
    symbol: arg('symbol', null)
  });
  if (batch.length === 0) {
    out(JSON.stringify({ empty: true, worker: WORKER }));
    return;
  }
  const key = batch[0].symbol_key;
  const mine = batch;

  const symbol = db.prepare('SELECT * FROM symbol WHERE key=?').get(key);
  const rules = mine.map((m) => db.prepare('SELECT * FROM rule WHERE id=?').get(m.rule_id));
  const callers = db.prepare(
    'SELECT s.* FROM symbol_edge e JOIN symbol s ON s.key=e.caller WHERE e.callee=?').all(key);
  const callees = db.prepare(
    'SELECT s.* FROM symbol_edge e JOIN symbol s ON s.key=e.callee WHERE e.caller=?').all(key);

  const prompt = buildPrompt({
    root: ROOT, symbol, rules, callers, callees, slice: sliceOf(ROOT, symbol)
  });

  const task = {
    worker: WORKER,
    symbol_key: key,
    file: symbol.file,
    rules: mine.map((m) => ({
      rule_id: m.rule_id,
      content_hash: m.content_hash,
      dep_hash: m.dep_hash,
      rule_hash: m.rule_hash
    })),
    prompt
  };
  if (flag('prompt-only')) out(prompt);
  else out(JSON.stringify(task));
}

// --- submit ------------------------------------------------------------------

function cmdSubmit() {
  const db = L.open();
  const file = process.argv[3];
  if (!file) { out('usage: audit submit <response.json> [--task <task.json>]'); process.exit(2); }
  const taskFile = arg('task', null);
  const raw = readFileSync(file, 'utf8');

  let symbolKey = arg('symbol', null);
  let ruleIds = null;
  if (taskFile) {
    const t = JSON.parse(readFileSync(taskFile, 'utf8'));
    symbolKey = t.symbol_key;
    ruleIds = t.rules.map((r) => r.rule_id);
  }
  if (!symbolKey) { out('need --symbol <key> or --task <task.json>'); process.exit(2); }

  const claimed = db.prepare(
    `SELECT * FROM work WHERE symbol_key=? AND state='claimed'`).all(symbolKey);
  const rows = ruleIds ? claimed.filter((c) => ruleIds.includes(c.rule_id)) : claimed;
  const expectedRules = rows.map((r) => db.prepare('SELECT * FROM rule WHERE id=?').get(r.rule_id));
  const hashes = new Map(rows.map((r) => [r.rule_id, {
    content_hash: r.content_hash, dep_hash: r.dep_hash, rule_hash: r.rule_hash
  }]));

  let parsed;
  try { parsed = parseResponse(raw); }
  catch (e) { out(`[reject] ${e.message}`); process.exit(1); }

  const { ok, rejected } = validate(parsed, { expectedRules, symbolKey, hashes });
  const res = L.submit(db, ok, { worker: WORKER, runId: arg('run', null), model: arg('model', null) });
  L.openFindings(db, res.accepted);

  out(`accepted ${res.accepted.length}  rejected ${rejected.length + res.rejected.length}`);
  for (const r of rejected) out(`  [reject] ${r.rule_id}: ${r.reason}`);
  for (const r of res.rejected) out(`  [reject] ${r.rule_id}: ${r.reason}`);
  const fails = res.accepted.filter((v) => v.status === 'fail');
  for (const f of fails) out(`  [FAIL] ${f.rule_id} ${symbolKey}: ${f.summary}`);
}

// --- misc --------------------------------------------------------------------

function cmdRelease() {
  const db = L.open();
  out(`released ${L.releaseClaims(db, WORKER)} claims held by ${WORKER}`);
}

function cmdFindings() {
  const db = L.open();
  const state = arg('state', 'open');
  const rows = db.prepare(`
    SELECT f.*, s.file, s.start_line, r.title FROM finding f
      JOIN symbol s ON s.key = f.symbol_key
      JOIN rule r ON r.id = f.rule_id
     WHERE f.state = ? ORDER BY f.created_at DESC LIMIT ?`).all(state, Number(arg('limit', 50)));
  if (rows.length === 0) { out(`no ${state} findings`); return; }
  for (const f of rows) {
    out(`${f.rule_id}  ${f.file}:${f.start_line}`);
    out(`  ${f.summary}`);
    for (const e of JSON.parse(f.evidence)) out(`    - ${e}`);
  }
}

// Every n/a is a claim that the harness should not have asked. The harness knows it did,
// so these are read as evidence about the RULE, not the symbol: a rule with a high n/a
// rate is scoped too broadly and should have its trigger tightened.
function cmdNa() {
  const db = L.open();
  const rows = db.prepare(`
    SELECT v.rule_id, v.symbol_key, v.na_clause, s.file, s.start_line, r.title
      FROM verdict v JOIN symbol s ON s.key = v.symbol_key JOIN rule r ON r.id = v.rule_id
     WHERE v.status = 'n/a'
     ORDER BY v.rule_id, v.created_at DESC LIMIT ?`).all(Number(arg('limit', 40)));
  if (rows.length === 0) { out('no n/a verdicts'); return; }
  const rates = db.prepare(`
    SELECT rule_id, sum(status='n/a') na, count(*) total FROM verdict
     GROUP BY rule_id HAVING na > 0 ORDER BY (na * 1.0 / total) DESC`).all();
  out('n/a rate per rule (high means the trigger is too broad):');
  for (const r of rates) {
    out(`  ${r.rule_id.padEnd(7)}${r.na}/${r.total}  ${((r.na / r.total) * 100).toFixed(0)}%`);
  }
  out('');
  for (const r of rows) {
    out(`${r.rule_id}  ${r.file}:${r.start_line}`);
    out(`  ${r.na_clause}`);
  }
}

function cmdT0() {
  const db = L.open();
  const { rules } = loadRules();
  const drift = adrConstDrift(ROOT);
  out(`adr-const: ${drift.declared} constant(s) stated numerically in an ADR Decision section`);
  if (drift.declared < 5) {
    out('  (most ADRs state their invariant in prose, which is why family A exists at T2)');
  }
  for (const f of drift.findings) out(`  [${f.kind}] ${f.adr} ${f.name}: ${f.detail}`);
  if (drift.findings.length === 0) out('  no drift');

  const cov = adrCoverage(ROOT, rules);
  if (cov) {
    out('');
    out(`adr-coverage: ${cov.total} ADRs — ${cov.graphCheckable} verified by graph:check, ${cov.t2Covered} carry a T2 rule`);
    if (cov.unguarded.length) out(`  no check of any kind: ${cov.unguarded.join(' ')}`);
  }
  db.close();
  if (drift.findings.length && flag('strict')) process.exit(1);
}

function cmdDemote() {
  const db = L.open();
  const min = Number(arg('min', 3));
  const rows = db.prepare(`
    SELECT v.rule_id, r.title, count(*) fires, count(DISTINCT s.file) files
      FROM verdict v JOIN rule r ON r.id=v.rule_id JOIN symbol s ON s.key=v.symbol_key
     WHERE v.status='fail' AND r.demotable=1 AND r.status='active'
     GROUP BY v.rule_id HAVING fires >= ? ORDER BY fires DESC`).all(min);
  if (rows.length === 0) { out(`no rule has ${min}+ fails yet`); return; }
  out(`rules eligible to move down to T0 (>= ${min} fails, marked demotable):`);
  for (const r of rows) {
    out(`  ${r.rule_id}  ${r.fires} fails across ${r.files} files — ${r.title}`);
    const ev = db.prepare(`SELECT summary FROM verdict WHERE rule_id=? AND status='fail' LIMIT 3`).all(r.rule_id);
    for (const e of ev) out(`      e.g. ${e.summary}`);
  }
  out('');
  out('Write the semgrep/ast-grep rule, then set status "demoted" + demoted_to in the rule file.');
  out('Its verdicts stay in the ledger as the record of why it moved.');
}

function cmdExport() {
  const db = L.open();
  const dir = join(dirname(fileURLToPath(import.meta.url)), 'ledger');
  mkdirSync(dir, { recursive: true });
  const verdicts = db.prepare('SELECT * FROM verdict ORDER BY id').all();
  writeFileSync(join(dir, 'verdicts.jsonl'), verdicts.map((v) => JSON.stringify(v)).join('\n') + '\n');
  const findings = db.prepare('SELECT * FROM finding ORDER BY created_at').all();
  writeFileSync(join(dir, 'findings.jsonl'), findings.map((v) => JSON.stringify(v)).join('\n') + '\n');
  out(`exported ${verdicts.length} verdicts, ${findings.length} findings to tools/audit/ledger/`);
}

function cmdRules() {
  const { rules, errors } = loadRules();
  for (const e of errors) out(`[error] ${e}`);
  const byFamily = new Map();
  for (const r of rules) byFamily.set(r.family, [...(byFamily.get(r.family) ?? []), r]);
  for (const [fam, rs] of byFamily) {
    out(`${fam} (${rs.length})`);
    for (const r of rs) out(`  ${r.id.padEnd(7)}${r.tier}  ${r.status.padEnd(8)}${r.title}`);
  }
  out('');
  out(`${rules.length} rules, ${errors.length} errors`);
  if (errors.length) process.exit(1);
}

const commands = {
  index: cmdIndex, plan: cmdPlan, status: cmdStatus, next: cmdNext, submit: cmdSubmit,
  release: cmdRelease, findings: cmdFindings, t0: cmdT0, demote: cmdDemote, na: cmdNa,
  export: cmdExport, rules: cmdRules
};

const cmd = process.argv[2];
if (!cmd || !commands[cmd]) {
  out(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 15).join('\n').replace(/^\/\/ ?/gm, ''));
  process.exit(cmd ? 2 : 0);
}
commands[cmd]();
