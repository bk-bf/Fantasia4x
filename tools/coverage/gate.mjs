#!/usr/bin/env node
// @ts-nocheck
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const SUMMARY_FILE = 'coverage/coverage-summary.json';

export function changedGameFiles(summary, changed, cwd = process.cwd()) {
  return Object.entries(summary)
    .map(([file, s]) => [isAbsolute(file) ? relative(cwd, file) : file, s])
    .filter(([file]) => file !== 'total' && changed.has(file))
    .map(([file, s]) => ({ file, pct: s.lines.pct }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

export function summaryText(total, files, seconds) {
  const lines = [`### Coverage: ${total.toFixed(1)}% of \`src/lib/game\` lines, computed in ${Math.round(seconds)}s`, ''];
  if (files.length)
    lines.push(
      'Changed files under `src/lib/game`:',
      '',
      '| file | lines |',
      '|---|---:|',
      ...files.map((f) => `| \`${f.file}\` | ${f.pct.toFixed(1)}% |`),
      ''
    );
  return lines.join('\n');
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function changedFiles(base) {
  const from = base && !/^0+$/.test(base) ? base : 'HEAD^1';
  try {
    return new Set(
      execFileSync('git', ['diff', '--name-only', from, 'HEAD'], { encoding: 'utf8' })
        .split('\n')
        .filter(Boolean)
    );
  } catch {
    return new Set();
  }
}

function main() {
  const base = arg('--base', process.env.CHECK_BASE);
  const start = Date.now();
  const run = spawnSync('pnpm', ['exec', 'vitest', 'run', '--coverage'], { stdio: 'inherit' });
  const seconds = (Date.now() - start) / 1000;

  if (run.error) throw run.error;

  if (!existsSync(SUMMARY_FILE)) {
    process.stdout.write(`no ${SUMMARY_FILE} written; coverage did not run\n`);
    process.exit(run.status ?? 1);
  }

  const summary = JSON.parse(readFileSync(SUMMARY_FILE, 'utf8'));
  const total = summary.total.lines.pct;
  const files = changedGameFiles(summary, changedFiles(base));

  const text = summaryText(total, files, seconds);
  process.stdout.write(`${text}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  if (process.env.COVERAGE_NOTES) appendFileSync(process.env.COVERAGE_NOTES, `${JSON.stringify({ total, seconds, files })}\n`);

  process.exit(run.status ?? 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
