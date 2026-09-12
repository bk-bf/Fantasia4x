#!/usr/bin/env node
import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SUMMARY_ROW_LIMIT = 300;

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

function functionRows(scenario, base, head) {
  const rows = [];
  for (const key of new Set([...Object.keys(base), ...Object.keys(head)])) {
    const b = base[key];
    const h = head[key];
    const bc = b?.count ?? 0;
    const hc = h?.count ?? 0;
    if (bc === hc) continue;
    const at = h ?? b;
    rows.push({ scenario, fn: at.name, where: `${at.file}:${at.line}`, base: bc, head: hc });
  }
  return rows;
}

export function compareRuns(baseRuns, headRuns) {
  const rows = [];
  const notes = [];
  for (const scenario of new Set([...baseRuns.keys(), ...headRuns.keys()])) {
    const b = baseRuns.get(scenario);
    const h = headRuns.get(scenario);
    if (!b || !h) {
      notes.push(`scenario \`${scenario}\` ran only on ${b ? 'base' : 'head'}`);
      continue;
    }
    if (b.turn !== h.turn)
      rows.push({ scenario, fn: 'final turn', where: '', base: b.turn, head: h.turn });
    rows.push(...functionRows(scenario, b.functions, h.functions));
    if (b.phases && h.phases) rows.push(...counterRows(scenario, 'phase', b.phases, h.phases));
    else
      notes.push(
        `scenario \`${scenario}\`: phase counters missing on ${b.phases ? 'head' : 'base'}, not compared`
      );
    rows.push(...messageRows(scenario, b.messages, h.messages));
  }
  rows.sort(
    (x, y) => Math.abs(y.head - y.base) - Math.abs(x.head - x.base) || x.fn.localeCompare(y.fn)
  );
  return { rows, notes };
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

export function report(baseDir, headDir) {
  const { rows, notes } = compareRuns(readRuns(baseDir), readRuns(headDir));
  const lines = [];
  lines.push(
    rows.length ? `## Work pins: ${rows.length} count(s) changed` : '## Work pins: no change'
  );
  for (const n of notes) lines.push(`- ${n}`);
  const text = rows.length
    ? `${lines.join('\n')}\n\n${renderTable(rows)}\n`
    : `${lines.join('\n')}\n`;
  process.stdout.write(text);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const shown = rows.slice(0, SUMMARY_ROW_LIMIT);
    const more = rows.length - shown.length;
    const summary = rows.length
      ? `${lines.join('\n')}\n\n${renderTable(shown)}\n${more > 0 ? `\n${more} more row(s) in the job log.\n` : ''}`
      : text;
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
  return rows.length === 0 && notes.every((n) => !n.includes('ran only on'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [baseDir, headDir] = process.argv.slice(2);
  if (!baseDir || !headDir) {
    process.stderr.write('usage: compare.mjs <base-dir> <head-dir>\n');
    process.exit(2);
  }
  process.exit(report(baseDir, headDir) ? 0 : 1);
}
