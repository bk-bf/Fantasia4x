#!/usr/bin/env node
// @ts-nocheck
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
  /^tools\/remote\/(ci\.mjs|run\.mjs|prepare\.sh)$/,
  /^tools\/hooks\/pre-push$/,
  /^\.github\/workflows\/check\.yml$/
];
const WORK_PINS = [/^tools\/work-pins\//];
const BENCH = [/^tools\/bench\//];
const GUNGRAUN = [/^tools\/gungraun\//];

const touches = (files, rules) => files.some((f) => rules.some((r) => r.test(f)));

export function scopeOf(files) {
  const all = touches(files, GATING);
  const game = all || touches(files, GAME);
  return {
    workPins: game || touches(files, WORK_PINS),
    gungraun: all || touches(files, RUST) || touches(files, GUNGRAUN),
    browser: game || touches(files, WORK_PINS),
    tps: game || touches(files, WORK_PINS) || touches(files, BENCH),
    bench: game || touches(files, BENCH)
  };
}

export const changedFiles = (base, head = 'HEAD') =>
  execFileSync('git', ['diff', '--name-only', base, head], { encoding: 'utf8' }).split('\n').filter(Boolean);

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--base');
  const scope = scopeOf(changedFiles(i >= 0 ? process.argv[i + 1] : 'HEAD^1'));
  for (const [leg, needed] of Object.entries(scope)) {
    process.stdout.write(`${leg}=${needed}\n`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${leg}=${needed}\n`);
  }
}
