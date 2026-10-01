#!/usr/bin/env node
// @ts-nocheck
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

export const MANIFEST = 'tools/ci/scope.json';

const manifest = JSON.parse(readFileSync(new URL('./scope.json', import.meta.url), 'utf8'));

const globToRegExp = (glob) =>
  new RegExp(
    '^' +
      glob
        .split(/(\*\*\/|\*\*|\*)/)
        .map((part) =>
          part === '**/'
            ? '(?:.*/)?'
            : part === '**'
              ? '.*'
              : part === '*'
                ? '[^/]*'
                : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        )
        .join('') +
      '$'
  );

const rules = manifest.rules.map((r) => ({ ...r, res: r.paths.map(globToRegExp) }));

export const ruleFor = (file) => rules.find((r) => r.res.some((re) => re.test(file)));

export const unmappedFiles = (files) => files.filter((f) => !ruleFor(f));

export function scopeOf(files) {
  const scope = Object.fromEntries(manifest.legs.map((leg) => [leg, false]));
  for (const f of files) for (const leg of ruleFor(f)?.legs ?? []) scope[leg] = true;
  return scope;
}

export const unmappedMessage = (files) =>
  [
    `${files.length} file(s) match no rule in ${MANIFEST}:`,
    ...files.map((f) => `  ${f}`),
    `Add a rule for each in ${MANIFEST}: the CI legs it needs, or [] to exclude it.`
  ].join('\n');

export const changedFiles = (base, head = 'HEAD') =>
  execFileSync('git', ['diff', '--name-only', base, head], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);

function main() {
  const i = process.argv.indexOf('--base');
  const files = changedFiles(i >= 0 ? process.argv[i + 1] : 'HEAD^1');
  const missing = unmappedFiles(files.filter((f) => existsSync(f)));
  if (missing.length) {
    process.stderr.write(`${unmappedMessage(missing)}\n`);
    if (process.env.GITHUB_ACTIONS === 'true')
      process.stdout.write(
        `::error title=Unmapped path::${missing.length} file(s) match no rule in ${MANIFEST}\n`
      );
    process.exit(1);
  }
  for (const [leg, needed] of Object.entries(scopeOf(files))) {
    process.stdout.write(`${leg}=${needed}\n`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${leg}=${needed}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
