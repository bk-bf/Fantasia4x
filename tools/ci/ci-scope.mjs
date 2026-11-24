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

const namedBy = Object.entries(manifest.named ?? {}).map(([leg, registry]) => [
  leg,
  new Set(
    JSON.parse(readFileSync(new URL(`../../${registry}`, import.meta.url), 'utf8')).flatMap((m) => [
      m.file,
      ...m.tests
    ])
  )
]);

export const ruleFor = (file) => rules.find((r) => r.res.some((re) => re.test(file)));

export const unmappedFiles = (files) => files.filter((f) => !ruleFor(f));

export const unusedPatterns = (files) =>
  rules.flatMap((r) => r.paths.filter((p, i) => !files.some((f) => r.res[i].test(f))));

export function scopeOf(files) {
  const scope = Object.fromEntries(manifest.legs.map((leg) => [leg, false]));
  for (const f of files) for (const leg of ruleFor(f)?.legs ?? []) scope[leg] = true;
  for (const [leg, names] of namedBy) if (files.some((f) => names.has(f))) scope[leg] = true;
  return scope;
}

export const unmappedMessage = (files) =>
  [
    `${files.length} file(s) match no rule in ${MANIFEST}:`,
    ...files.map((f) => `  ${f}`),
    `Add a rule for each in ${MANIFEST}: the CI legs it needs, or [] to exclude it.`
  ].join('\n');

export const changedFiles = (base, head = 'HEAD', cwd) =>
  execFileSync('git', ['diff', '--name-only', base, head], { encoding: 'utf8', cwd })
    .split('\n')
    .filter(Boolean);

const mergeBase = (a, b, cwd) =>
  execFileSync('git', ['merge-base', a, b], { encoding: 'utf8', cwd }).trim();

export const runsNothing = (files) => Object.values(scopeOf(files)).every((needed) => !needed);

export const keepsGreen = ({ green, base, head = 'HEAD', dev = 'origin/dev', cwd }) =>
  runsNothing(changedFiles(green, head, cwd)) &&
  runsNothing(changedFiles(mergeBase(green, dev, cwd), base, cwd));

const ghApi = (path) => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8' }));

const passed = (job) => job.conclusion === 'success' || job.conclusion === 'skipped';

function lastGreen(branch, repo) {
  const { workflow_runs: runs } = ghApi(
    `repos/${repo}/actions/workflows/check.yml/runs?branch=${encodeURIComponent(branch)}&event=push&status=success&per_page=10`
  );
  return runs.find((run) => ghApi(`repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`).jobs.every(passed));
}

function greenToKeep(branch, base) {
  try {
    const run = lastGreen(branch, process.env.GITHUB_REPOSITORY);
    if (!run) return null;
    execFileSync('git', ['fetch', '-q', 'origin', run.head_sha], { stdio: 'inherit' });
    return keepsGreen({ green: run.head_sha, base }) ? run : null;
  } catch (error) {
    process.stdout.write(`::warning title=Kept green::could not read the last green run of ${branch}: ${error.message}\n`);
    return null;
  }
}

const option = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

function main() {
  const base = option('--base') ?? 'HEAD^1';
  const files = changedFiles(base);
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
  const branch = option('--green-of');
  const kept = branch ? greenToKeep(branch, base) : null;
  const scope = kept ? Object.fromEntries(manifest.legs.map((leg) => [leg, false])) : scopeOf(files);
  if (kept) {
    const line = `Every job is skipped: this commit and its dev base differ from ${kept.head_sha.slice(0, 8)}, green in ${kept.html_url}, only in paths that run no jobs.`;
    process.stdout.write(`::notice title=Kept green::${line}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
  }
  for (const [leg, needed] of Object.entries(scope)) {
    process.stdout.write(`${leg}=${needed}\n`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${leg}=${needed}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
