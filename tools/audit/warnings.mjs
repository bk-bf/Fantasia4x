#!/usr/bin/env node
// @ts-nocheck
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { isAbsolute, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const BUDGET_FILE = 'tools/audit/warning-budget.json';
const OUTPUT = { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 };

const rel = (file, cwd) => (isAbsolute(file) ? relative(cwd, file) : file);
const firstLine = (message) => String(message).split('\n')[0];
const where = (f) => `${f.file}:${f.line}`;

export function parseSvelteCheck(out, cwd = process.cwd()) {
  const found = [];
  for (const line of out.split('\n')) {
    const json = line.replace(/^\d+ /, '');
    if (!json.startsWith('{')) continue;
    const d = JSON.parse(json);
    found.push({
      tool: 'svelte-check',
      severity: d.type === 'ERROR' ? 'error' : 'warning',
      rule: String(d.code ?? d.source ?? 'unknown'),
      file: rel(d.filename, cwd),
      line: d.start.line + 1,
      column: d.start.character + 1,
      message: d.message
    });
  }
  return found;
}

export const parseEslint = (json, cwd = process.cwd()) =>
  JSON.parse(json).flatMap((f) =>
    f.messages.map((m) => ({
      tool: 'eslint',
      severity: m.severity === 2 ? 'error' : 'warning',
      rule: m.ruleId ?? 'parse',
      file: rel(f.filePath, cwd),
      line: m.line ?? 1,
      column: m.column ?? 1,
      message: m.message
    }))
  );

function runTool(command, args, parse) {
  const r = spawnSync(command, args, OUTPUT);
  if (r.error) throw r.error;
  const found = parse(r.stdout);
  if (r.status !== 0 && !found.some((f) => f.severity === 'error'))
    throw new Error(`${command} exited ${r.status} without reporting an error:\n${r.stdout.slice(-2000)}${r.stderr.slice(-2000)}`);
  return found;
}

const RUNNERS = {
  'svelte-check': () =>
    runTool('svelte-check', ['--tsconfig', './tsconfig.json', '--output', 'machine-verbose'], (out) =>
      parseSvelteCheck(out)
    ),
  eslint: () => runTool('eslint', ['.', '--format', 'json'], (out) => parseEslint(out || '[]'))
};

export function byRule(found) {
  const groups = new Map();
  for (const f of found) {
    const key = `${f.severity} ${f.rule}`;
    if (!groups.has(key)) groups.set(key, { rule: f.rule, severity: f.severity, items: [] });
    groups.get(key).items.push(f);
  }
  return [...groups.values()].sort(
    (a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1) || b.items.length - a.items.length || a.rule.localeCompare(b.rule)
  );
}

export function verdict(tool, found, budget) {
  const errors = found.filter((f) => f.severity === 'error').length;
  const warnings = found.length - errors;
  if (errors) return { ok: false, line: `${tool}: ${errors} error(s) and ${warnings} warning(s)` };
  if (warnings > budget)
    return { ok: false, line: `${tool}: ${warnings} warnings, over its budget of ${budget} in ${BUDGET_FILE}; fix the new ones` };
  if (warnings < budget)
    return { ok: true, line: `${tool}: ${warnings} warnings, under its budget of ${budget}; lower ${tool} in ${BUDGET_FILE} to ${warnings}` };
  return { ok: true, line: `${tool}: ${warnings} warnings, at its budget of ${budget}` };
}

const html = (s) => firstLine(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function summary(tool, found, budget, changed) {
  const touched = found.filter((f) => changed.has(f.file));
  const lines = [`### ${verdict(tool, found, budget).line}`, ''];
  if (touched.length)
    lines.push(
      'In files this change touches:',
      '',
      ...touched.map((f) => `- \`${where(f)}\` ${f.severity} \`${f.rule}\`: ${html(f.message)}`),
      ''
    );
  for (const g of byRule(found))
    lines.push(
      `<details><summary>${g.severity} <code>${g.rule}</code>: ${g.items.length}</summary>`,
      '',
      ...g.items.map((f) => `- \`${where(f)}\` ${html(f.message)}`),
      '',
      '</details>',
      ''
    );
  return lines.join('\n');
}

const escapeData = (s) => s.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
const escapeProperty = (s) => escapeData(s).replaceAll(':', '%3A').replaceAll(',', '%2C');

export const annotation = (f) =>
  `::${f.severity} file=${escapeProperty(f.file)},line=${f.line},col=${f.column},title=${escapeProperty(`${f.tool} ${f.rule}`)}::${escapeData(firstLine(f.message))}`;

export function note(tool, found, budget, changed) {
  const pick = ({ file, line, column, rule, severity, message, tool: t }) => ({
    tool: t,
    file,
    line,
    column,
    rule,
    severity,
    message: firstLine(message)
  });
  return {
    tool,
    budget,
    errors: found.filter((f) => f.severity === 'error').length,
    warnings: found.filter((f) => f.severity === 'warning').length,
    rules: byRule(found).map((g) => ({ rule: g.rule, severity: g.severity, count: g.items.length })),
    annotate: found.filter((f) => f.severity === 'error' || changed.has(f.file)).map(pick)
  };
}

function changedFiles() {
  const base = process.env.CHECK_BASE;
  const from = base && !/^0+$/.test(base) ? base : 'HEAD^1';
  try {
    return new Set(execFileSync('git', ['diff', '--name-only', from, 'HEAD'], { encoding: 'utf8' }).split('\n').filter(Boolean));
  } catch {
    return new Set();
  }
}

function main() {
  const tool = process.argv[2];
  if (!RUNNERS[tool]) {
    process.stderr.write(`usage: node tools/audit/warnings.mjs <${Object.keys(RUNNERS).join('|')}>\n`);
    process.exit(2);
  }
  const budget = JSON.parse(readFileSync(new URL('./warning-budget.json', import.meta.url), 'utf8'))[tool];
  const found = RUNNERS[tool]();
  const changed = changedFiles();
  for (const f of found) process.stdout.write(`${where(f)}:${f.column}  ${f.severity}  ${f.rule}  ${firstLine(f.message)}\n`);
  const v = verdict(tool, found, budget);
  process.stdout.write(`${v.line}\n`);
  if (process.env.GITHUB_ACTIONS)
    for (const f of found) if (f.severity === 'error' || changed.has(f.file)) process.stdout.write(`${annotation(f)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary(tool, found, budget, changed)}\n`);
  if (process.env.WARNINGS_NOTES)
    appendFileSync(process.env.WARNINGS_NOTES, `${JSON.stringify(note(tool, found, budget, changed))}\n`);
  process.exit(v.ok ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
