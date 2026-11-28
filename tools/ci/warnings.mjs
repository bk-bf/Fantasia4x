#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const BUDGET_FILE = 'tools/ci/warning-budget.json';
const FILES_FILE = 'tools/ci/warning-files.json';
const OUTPUT = { encoding: /** @type {const} */ ('utf8'), maxBuffer: 256 * 1024 * 1024 };

/** @typedef {'error' | 'warning'} Severity */
/** @typedef {{ tool: string, severity: Severity, rule: string, file: string, line: number, column: number, message: string }} Finding */
/** @typedef {{ rule: string, severity: Severity, items: Finding[] }} RuleGroup */
/** @typedef {{ ok: boolean, line: string }} Verdict */

/** @param {string} file @param {string} cwd */
const rel = (file, cwd) => (isAbsolute(file) ? relative(cwd, file) : file);
/** @param {unknown} message */
const firstLine = (message) => String(message).split('\n')[0];
/** @param {Finding} f */
const where = (f) => `${f.file}:${f.line}`;

/** @param {string} out @param {string} [cwd] @returns {Finding[]} */
export function parseSvelteCheck(out, cwd = process.cwd()) {
  /** @type {Finding[]} */
  const found = [];
  for (const line of out.split('\n')) {
    const json = line.replace(/^\d+ /, '');
    if (!json.startsWith('{')) continue;
    /** @type {{ type: string, code?: string | number, source?: string, filename: string, start: { line: number, character: number }, message: string }} */
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

/** @typedef {{ filePath: string, messages: { severity: number, ruleId: string | null, line?: number, column?: number, message: string }[] }} EslintFile */

/** @param {string} json @param {string} [cwd] @returns {Finding[]} */
export const parseEslint = (json, cwd = process.cwd()) =>
  /** @type {EslintFile[]} */ (JSON.parse(json)).flatMap((f) =>
    f.messages.map((m) => ({
      tool: 'eslint',
      severity: /** @type {Severity} */ (m.severity === 2 ? 'error' : 'warning'),
      rule: m.ruleId ?? 'parse',
      file: rel(f.filePath, cwd),
      line: m.line ?? 1,
      column: m.column ?? 1,
      message: m.message
    }))
  );

/** @param {string} out @param {string} [cwd] @returns {Finding[]} */
export function parseTsc(out, cwd = process.cwd()) {
  /** @type {Finding[]} */
  const found = [];
  for (const line of out.split('\n')) {
    const m = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(line.trim());
    if (!m) continue;
    found.push({
      tool: 'tools-types',
      severity: 'warning',
      rule: m[4],
      file: rel(m[1], cwd),
      line: Number(m[2]),
      column: Number(m[3]),
      message: m[5]
    });
  }
  return found;
}

/**
 * @param {string} command @param {string[]} args @param {(out: string) => Finding[]} parse
 * @param {{ exitsOnFindings?: boolean }} [options]
 */
function runTool(command, args, parse, { exitsOnFindings = false } = {}) {
  const r = spawnSync(command, args, OUTPUT);
  if (r.error) throw r.error;
  const found = parse(r.stdout);
  if (r.status !== 0 && !found.some((f) => f.severity === 'error') && !(exitsOnFindings && found.length))
    throw new Error(`${command} exited ${r.status} without reporting an error:\n${r.stdout.slice(-2000)}${r.stderr.slice(-2000)}`);
  return found;
}

const TOOLS_TSCONFIG = '.svelte-kit/tsconfig.tools.json';

/** @param {string[]} files */
function writeToolsTsconfig(files) {
  execFileSync('svelte-kit', ['sync'], OUTPUT);
  /** @type {{ compilerOptions: { paths: Record<string, string[]> } }} */
  const kit = JSON.parse(readFileSync('.svelte-kit/tsconfig.json', 'utf8'));
  const config = {
    compilerOptions: {
      noEmit: true,
      allowJs: true,
      checkJs: true,
      strict: true,
      skipLibCheck: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      target: 'es2022',
      resolveJsonModule: true,
      types: ['node', 'vite/client'],
      paths: kit.compilerOptions.paths
    },
    files: ['src/app.d.ts', ...files].map((f) => `../${f}`)
  };
  writeFileSync(TOOLS_TSCONFIG, JSON.stringify(config, null, 2));
  return TOOLS_TSCONFIG;
}

const toolFiles = () =>
  execFileSync('git', ['ls-files', '-z', 'tools'], OUTPUT)
    .split('\0')
    .filter((f) => /\.(mjs|js|ts)$/.test(f) && !f.startsWith('tools/tileset/art/'));

/** @type {Record<string, () => Finding[]>} */
const RUNNERS = {
  'svelte-check': () =>
    runTool('svelte-check', ['--tsconfig', './tsconfig.json', '--output', 'machine-verbose'], (out) =>
      parseSvelteCheck(out)
    ),
  eslint: () => runTool('eslint', ['.', '--format', 'json'], (out) => parseEslint(out || '[]')),
  'tools-types': () =>
    runTool('tsc', ['-p', writeToolsTsconfig(toolFiles()), '--pretty', 'false'], (out) => parseTsc(out), { exitsOnFindings: true })
};

/** @param {Finding[]} found @returns {RuleGroup[]} */
export function byRule(found) {
  /** @type {Map<string, RuleGroup>} */
  const groups = new Map();
  for (const f of found) {
    const key = `${f.severity} ${f.rule}`;
    const group = groups.get(key) ?? { rule: f.rule, severity: f.severity, items: [] };
    groups.set(key, group);
    group.items.push(f);
  }
  return [...groups.values()].sort(
    (a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1) || b.items.length - a.items.length || a.rule.localeCompare(b.rule)
  );
}

/** @param {string} tool @param {Finding[]} found @param {number} budget @returns {Verdict} */
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

/** @param {Finding[]} found @returns {Record<string, number>} */
export function warningsPerFile(found) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const f of found) if (f.severity === 'warning') counts[f.file] = (counts[f.file] ?? 0) + 1;
  return counts;
}

/**
 * @param {string} tool @param {Finding[]} found @param {Record<string, number>} entries @param {number} budget
 * @returns {{ ok: boolean, lines: string[] }}
 */
export function fileVerdict(tool, found, entries, budget) {
  const counts = warningsPerFile(found);
  /** @type {string[]} */
  const lines = [];
  for (const [file, n] of Object.entries(counts).sort()) {
    const cap = entries[file];
    if (cap === undefined)
      lines.push(`${file}: ${n} ${tool} warning(s); a file not in ${FILES_FILE} must have none`);
    else if (n > cap) lines.push(`${file}: ${n} ${tool} warnings, over its entry of ${cap} in ${FILES_FILE}`);
    else if (n < cap) lines.push(`${file}: ${n} ${tool} warnings, under its entry of ${cap}; lower it to ${n} in ${FILES_FILE}`);
  }
  for (const file of Object.keys(entries).sort())
    if (!counts[file]) lines.push(`${file}: no ${tool} warnings left; remove its entry from ${FILES_FILE}`);
  const sum = Object.values(entries).reduce((s, n) => s + n, 0);
  if (sum !== budget)
    lines.push(`${tool}: its entries in ${FILES_FILE} sum to ${sum}, but its budget in ${BUDGET_FILE} is ${budget}; make them agree`);
  return { ok: lines.length === 0, lines };
}

/** @param {unknown} s */
const html = (s) => firstLine(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** @param {string} tool @param {Finding[]} found @param {number} budget @param {Set<string>} changed */
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

/** @param {string} s */
const escapeData = (s) => s.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
/** @param {string} s */
const escapeProperty = (s) => escapeData(s).replaceAll(':', '%3A').replaceAll(',', '%2C');

/** @param {Finding} f */
export const annotation = (f) =>
  `::${f.severity} file=${escapeProperty(f.file)},line=${f.line},col=${f.column},title=${escapeProperty(`${f.tool} ${f.rule}`)}::${escapeData(firstLine(f.message))}`;

/** @param {string} tool @param {Finding[]} found @param {number} budget @param {Set<string>} changed */
export function note(tool, found, budget, changed) {
  /** @param {Finding} f @returns {Finding} */
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
    process.stderr.write(`usage: node tools/ci/warnings.mjs <${Object.keys(RUNNERS).join('|')}>\n`);
    process.exit(2);
  }
  /** @type {Record<string, number>} */
  const budgets = JSON.parse(readFileSync(new URL('./warning-budget.json', import.meta.url), 'utf8'));
  /** @type {Record<string, Record<string, number>>} */
  const files = JSON.parse(readFileSync(new URL('./warning-files.json', import.meta.url), 'utf8'));
  const budget = budgets[tool];
  const entries = files[tool] ?? {};
  const found = RUNNERS[tool]();
  const changed = changedFiles();
  for (const f of found) process.stdout.write(`${where(f)}:${f.column}  ${f.severity}  ${f.rule}  ${firstLine(f.message)}\n`);
  const v = verdict(tool, found, budget);
  const perFile = fileVerdict(tool, found, entries, budget);
  process.stdout.write(`${v.line}\n`);
  for (const line of perFile.lines) process.stdout.write(`${line}\n`);
  if (process.env.GITHUB_ACTIONS)
    for (const f of found) if (f.severity === 'error' || changed.has(f.file)) process.stdout.write(`${annotation(f)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `${summary(tool, found, budget, changed)}\n${perFile.lines.map((l) => `- ${html(l)}`).join('\n')}\n`
    );
  if (process.env.WARNINGS_NOTES)
    appendFileSync(process.env.WARNINGS_NOTES, `${JSON.stringify(note(tool, found, budget, changed))}\n`);
  process.exit(v.ok && perFile.ok ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
