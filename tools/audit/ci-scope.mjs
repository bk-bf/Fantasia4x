#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const GAME = [
  /^src\//,
  /^sim-core\//,
  /^spatial-core\//,
  /^static\//,
  /^(package\.json|pnpm-lock\.yaml|tsconfig\.json)$/,
  /^(vite|svelte)\.config\.[cm]?[jt]s$/,
  /^\.github\/actions\//
];
const RUST = [/^sim-core\//, /^spatial-core\//, /^\.github\/actions\//];
const GATING = [
  /^tools\/audit\/ci-scope\.mjs$/,
  /^tools\/remote\/(ci\.mjs|prepare\.sh)$/,
  /^\.github\/workflows\/check\.yml$/
];
const HARNESS = {
  workPins: [/^tools\/work-pins\//],
  gungraun: [/^tools\/gungraun\//],
  browser: [/^tools\/work-pins\//],
  tps: [/^tools\/work-pins\//, /^tools\/bench\//],
  bench: [/^tools\/bench\//]
};

const touches = (files, rules) => files.some((f) => rules.some((r) => r.test(f)));

export function scopeOf(files) {
  const all = touches(files, GATING);
  const game = touches(files, GAME);
  const scope = {};
  for (const [leg, harness] of Object.entries(HARNESS)) {
    const measured = leg === 'gungraun' ? touches(files, RUST) : game;
    scope[leg] = all || measured || touches(files, harness);
  }
  return scope;
}

export const changedFiles = (base) =>
  execFileSync('git', ['diff', '--name-only', base, 'HEAD'], { encoding: 'utf8' }).split('\n').filter(Boolean);

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--base');
  const scope = scopeOf(changedFiles(i >= 0 ? process.argv[i + 1] : 'HEAD^1'));
  for (const [leg, needed] of Object.entries(scope)) {
    process.stdout.write(`${leg}=${needed}\n`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${leg}=${needed}\n`);
  }
}
