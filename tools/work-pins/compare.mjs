#!/usr/bin/env node
import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SUMMARY_ROW_LIMIT = 300;
const THRESHOLD = Number(process.env.WORK_PINS_THRESHOLD ?? 0.05);

function readRuns(dir) {
  const runs = new Map();
  for (const f of readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .sort()) {
    const run = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    runs.set(run.scenario, run);
  }
  return runs;
}

function counterRows(scenario, section, base, head) {
  const rows = [];
  for (const key of new Set([...Object.keys(base), ...Object.keys(head)])) {
    const b = base[key] ?? 0;
    const h = head[key] ?? 0;
    if (b !== h) rows.push({ scenario, fn: `${section} ${key}`, where: '', base: b, head: h });
  }
  return rows;
}

function messageRows(scenario, base, head) {
  const pick = (m, field) =>
    Object.fromEntries(Object.entries(m).map(([kind, v]) => [kind, v[field]]));
  return [
    ...counterRows(scenario, 'messages', pick(base, 'count'), pick(head, 'count')),
    ...counterRows(scenario, 'message bytes', pick(base, 'bytes'), pick(head, 'bytes'))
  ];
}

const leafOf = (name) => name.split(' > ').at(-1);

function uniqueBy(pins, nameOf) {
  const out = new Map();
  for (const [key, pin] of pins) {
    const name = nameOf(pin.name);
    out.set(name, out.has(name) ? null : key);
  }
  return out;
}

function pairMoves(onlyBase, onlyHead, nameOf) {
  const pairs = [];
  const heads = uniqueBy(onlyHead, nameOf);
  for (const [name, baseKey] of uniqueBy(onlyBase, nameOf)) {
    const headKey = heads.get(name);
    if (!baseKey || !headKey) continue;
    pairs.push([onlyBase.get(baseKey), onlyHead.get(headKey)]);
    onlyBase.delete(baseKey);
    onlyHead.delete(headKey);
  }
  return pairs;
}

function functionRows(scenario, base, head) {
  const rows = [];
  const moved = [];
  const onlyBase = new Map();
  const onlyHead = new Map();
  for (const key of new Set([...Object.keys(base), ...Object.keys(head)])) {
    const b = base[key];
    const h = head[key];
    if (b && h) {
      if (b.count !== h.count)
        rows.push({ scenario, fn: h.name, where: `${h.file}:${h.line}`, base: b.count, head: h.count });
    } else if (b) onlyBase.set(key, b);
    else onlyHead.set(key, h);
  }
  const pairs = [
    ...pairMoves(onlyBase, onlyHead, (name) => name),
    ...pairMoves(onlyBase, onlyHead, leafOf)
  ];
  for (const [b, h] of pairs) {
    const where = `${b.file}:${b.line} → ${h.file}:${h.line}`;
    if (b.count === h.count) moved.push({ scenario, fn: `${b.name} → ${h.name}`, where, count: h.count });
    else rows.push({ scenario, fn: h.name, where, base: b.count, head: h.count });
  }
  for (const b of onlyBase.values())
    rows.push({ scenario, fn: b.name, where: `${b.file}:${b.line}`, base: b.count, head: 0 });
  for (const h of onlyHead.values())
    rows.push({ scenario, fn: h.name, where: `${h.file}:${h.line}`, base: 0, head: h.count });
  return { rows, moved };
}

const totalCalls = (run) => Object.values(run.functions ?? {}).reduce((s, f) => s + f.count, 0);
const overBudget = (t) => (t.base === 0 ? t.head > 0 : t.head > t.base * (1 + THRESHOLD));

export function compareRuns(baseRuns, headRuns) {
  const rows = [];
  const moved = [];
  const notes = [];
  const totals = [];
  for (const scenario of new Set([...baseRuns.keys(), ...headRuns.keys()])) {
    const b = baseRuns.get(scenario);
    const h = headRuns.get(scenario);
    if (!b || !h) {
      notes.push(`scenario \`${scenario}\` ran only on ${b ? 'base' : 'head'}`);
      continue;
    }
    if (b.turn !== h.turn)
      rows.push({ scenario, fn: 'final turn', where: '', base: b.turn, head: h.turn });
    const fns = functionRows(scenario, b.functions, h.functions);
    rows.push(...fns.rows);
    moved.push(...fns.moved);
    if (b.phases && h.phases) rows.push(...counterRows(scenario, 'phase', b.phases, h.phases));
    else if (b.phases || h.phases)
      notes.push(
        `scenario \`${scenario}\`: phase counters missing on ${b.phases ? 'head' : 'base'}, not compared`
      );
    rows.push(...messageRows(scenario, b.messages, h.messages));
    rows.push(...counterRows(scenario, 'counter', b.counters ?? {}, h.counters ?? {}));
    totals.push({ scenario, fn: 'all calls', where: '', base: totalCalls(b), head: totalCalls(h) });
    for (const [key, head] of Object.entries(h.counters ?? {}))
      totals.push({ scenario, fn: `counter ${key}`, where: '', base: b.counters?.[key] ?? 0, head });
  }
  rows.sort(
    (x, y) => Math.abs(y.head - y.base) - Math.abs(x.head - x.base) || x.fn.localeCompare(y.fn)
  );
  return { rows, moved, notes, totals, over: totals.filter(overBudget) };
}

function change(r) {
  const d = r.head - r.base;
  const pct = r.base === 0 ? 'new' : `${d > 0 ? '+' : ''}${((d / r.base) * 100).toFixed(1)}%`;
  return `${d > 0 ? '+' : ''}${d} (${pct})`;
}

export function renderTable(rows) {
  const head =
    '| scenario | function | file:line | base | head | change |\n|---|---|---|---:|---:|---:|';
  const body = rows.map(
    (r) =>
      `| ${r.scenario} | \`${r.fn}\` | ${r.where ? `\`${r.where}\`` : ''} | ${r.base} | ${r.head} | ${change(r)} |`
  );
  return [head, ...body].join('\n');
}

function details(summary, body) {
  return ['', `<details><summary>${summary}</summary>`, '', body, '', '</details>', ''].join('\n');
}

function renderMoved(moved) {
  if (!moved.length) return '';
  const body = moved.map((m) => `| ${m.scenario} | \`${m.fn}\` | \`${m.where}\` | ${m.count} |`);
  return details(
    `${moved.length} function(s) moved with the same call count`,
    ['| scenario | function | moved | calls |', '|---|---|---|---:|', ...body].join('\n')
  );
}

function render({ rows, moved, notes, totals, over }, rowLimit) {
  const budget = `${Math.round(THRESHOLD * 100)}%`;
  const heading = over.length
    ? `## Work pins: ${over.length} total(s) grew by more than ${budget}`
    : `## Work pins: every total within ${budget}${rows.length ? `, ${rows.length} count(s) changed` : ', no change'}`;
  const parts = [[heading, ...notes.map((n) => `- ${n}`)].join('\n')];
  if (over.length) parts.push(`\nOver the ${budget} budget, which fails the check:\n\n${renderTable(over)}\n`);
  const changedTotals = totals.filter((t) => t.head !== t.base);
  if (changedTotals.length) parts.push(details('Totals that changed', renderTable(changedTotals)));
  if (rows.length) {
    const shown = rows.slice(0, rowLimit);
    const more = rows.length - shown.length;
    parts.push(
      details(
        `${rows.length} count(s) changed; reported, not gated`,
        `${renderTable(shown)}${more > 0 ? `\n\n${more} more row(s) in the job log.` : ''}`
      )
    );
  }
  parts.push(renderMoved(moved));
  return `${parts.join('\n')}\n`;
}

function writeNotes({ totals, rows }) {
  const file = process.env.WORK_PINS_NOTES;
  if (!file) return;
  const changed = totals.filter((t) => t.head !== t.base);
  appendFileSync(file, `${JSON.stringify({ totals: changed, changed: rows.length })}\n`);
}

export function report(baseDir, headDir) {
  const result = compareRuns(readRuns(baseDir), readRuns(headDir));
  writeNotes(result);
  process.stdout.write(render(result, Infinity));
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, render(result, SUMMARY_ROW_LIMIT));
  return result.over.length === 0 && result.notes.every((n) => !n.includes('ran only on'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [baseDir, headDir] = process.argv.slice(2);
  if (!baseDir || !headDir) {
    process.stderr.write('usage: compare.mjs <base-dir> <head-dir>\n');
    process.exit(2);
  }
  process.exit(report(baseDir, headDir) ? 0 : 1);
}
