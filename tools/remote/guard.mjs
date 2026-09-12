#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { basename } from 'node:path';

const TEST_HOSTNAME = 'ubuntuserver';
const TEST_TOOLS = new Set(['vitest', 'svelte-check', 'eslint', 'knip', 'jscpd', 'playwright', 'tsc']);
const HARNESS = /^(\.\/)?tools\/(work-pins|bench|gungraun)\/|^(\.\/)?tools\/remote\/ci\.mjs|node_modules\/\.bin\//;
const WRAPPERS = new Set(['bgr', 'nice', 'ionice', 'env', 'time', 'sudo', 'command', 'exec']);
const SHELLS = new Set(['sh', 'bash', 'zsh']);

function words(segment) {
  return (segment.match(/'[^']*'|"[^"]*"|\S+/g) ?? []).map((w) => w.replace(/^['"]|['"]$/g, ''));
}

function localTest(segment) {
  const w = words(segment.trim());
  while (w.length && (/^\w+=/.test(w[0]) || WRAPPERS.has(w[0]) || /^-/.test(w[0]))) w.shift();
  if (w[0] === 'timeout') w.splice(0, 2);
  if (!w.length) return false;
  const exe = basename(w[0]);
  if (exe === 'ssh') return false;
  if (SHELLS.has(exe) && w[1] === '-c') return localTests(w.slice(2).join(' '));
  if (TEST_TOOLS.has(exe)) return true;
  if ((exe === 'pnpm' || exe === 'npx' || exe === 'pnpx') && w.some((x) => TEST_TOOLS.has(x)))
    return !w.includes('tools/remote/run.mjs');
  if (exe === 'node') return w[1] !== 'tools/remote/run.mjs' && HARNESS.test(w[1] ?? '');
  if (exe === 'cargo') return w[1] === 'test' || w[1] === 'bench';
  return false;
}

const REMOTE_SCRIPT = /\bssh\b[^'"\n;&|]*(['"])[\s\S]*?\1/g;

function localTests(command) {
  return command
    .replace(REMOTE_SCRIPT, 'ssh')
    .split(/&&|\|\||[;|\n]/)
    .some(localTest);
}

if (process.env.CI === 'true' || hostname() === TEST_HOSTNAME) process.exit(0);
const input = JSON.parse(readFileSync(0, 'utf8'));
const command = input.tool_input?.command ?? '';
if (!localTests(command)) process.exit(0);
process.stderr.write(
  'Tests, checks, lint, benchmarks and work pins never run on this laptop. ' +
    'Use the pnpm script (pnpm test, test:related, check, lint, knip, bench, work-pins), which runs it on ubuntuserver, ' +
    'or wrap the command: node tools/remote/run.mjs <command>.\n'
);
process.exit(2);
