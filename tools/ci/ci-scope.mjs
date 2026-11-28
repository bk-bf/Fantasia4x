#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

export const MANIFEST = 'tools/ci/scope.json';

/** @typedef {{ paths: string[], legs: string[] }} Rule */

/** @type {{ legs: string[], rules: Rule[], named?: Record<string, string> }} */
const manifest = JSON.parse(readFileSync(new URL('./scope.json', import.meta.url), 'utf8'));

/** @param {string} glob */
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

/** @param {string} registry @returns {{ file: string, tests: string[] }[]} */
const readRegistry = (registry) => JSON.parse(readFileSync(new URL(`../../${registry}`, import.meta.url), 'utf8'));

/** @type {[string, Set<string>][]} */
const namedBy = Object.entries(manifest.named ?? {}).map(([leg, registry]) => [
  leg,
  new Set(readRegistry(registry).flatMap((m) => [m.file, ...m.tests]))
]);

/** @param {string} file */
export const ruleFor = (file) => rules.find((r) => r.res.some((re) => re.test(file)));

/** @param {string[]} files */
export const unmappedFiles = (files) => files.filter((f) => !ruleFor(f));

/** @param {string[]} files */
export const unusedPatterns = (files) =>
  rules.flatMap((r) => r.paths.filter((p, i) => !files.some((f) => r.res[i].test(f))));

/** @param {string[]} files */
export function scopeOf(files) {
  /** @type {Record<string, boolean>} */
  const scope = Object.fromEntries(manifest.legs.map((leg) => [leg, false]));
  for (const f of files) for (const leg of ruleFor(f)?.legs ?? []) scope[leg] = true;
  for (const [leg, names] of namedBy) if (files.some((f) => names.has(f))) scope[leg] = true;
  return scope;
}

/** @param {string[]} files */
export const unmappedMessage = (files) =>
  [
    `${files.length} file(s) match no rule in ${MANIFEST}:`,
    ...files.map((f) => `  ${f}`),
    `Add a rule for each in ${MANIFEST}: the CI legs it needs, or [] to exclude it.`
  ].join('\n');

/** @param {string} base @param {string} [head] */
export const changedFiles = (base, head = 'HEAD') =>
  execFileSync('git', ['diff', '--name-only', base, head], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);

function main() {
  const i = process.argv.indexOf('--base');
  const files = changedFiles(i >= 0 ? process.argv[i + 1] : 'HEAD^1');
  const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  const unused = unusedPatterns(tracked);
  if (unused.length) {
    process.stderr.write(
      `${unused.length} pattern(s) in ${MANIFEST} match no tracked file:\n${unused.map((p) => `  ${p}`).join('\n')}\nRemove them.\n`
    );
    process.exit(1);
  }
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
