#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';

const TEST_HOSTNAME = 'ubuntuserver';
const TRUNK = 'origin/dev';
const quick = process.argv.includes('--quick');

if (process.env.CI !== 'true' && hostname() !== TEST_HOSTNAME) {
  process.stderr.write('[ci-local] runs on ubuntuserver only; start it with pnpm ci:local\n');
  process.exit(2);
}

if (process.env.CI !== 'true' && process.env.F4X_PREPARED !== '1') {
  const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const prepared = spawnSync(
    'bash',
    ['-c', 'cd "$1" && source tools/remote/prepare.sh && cd "$2" && shift 2 && exec node "$@"', 'bash', top, process.cwd(), ...process.argv.slice(1)],
    { stdio: 'inherit' }
  );
  process.exit(prepared.status ?? 1);
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const works = (cmd, args = ['--version']) => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;
const base = process.env.CI_LOCAL_BASE ?? git('merge-base', 'HEAD', TRUNK);
const pinnedGungraun = () =>
  execFileSync('cargo', ['pkgid', '--manifest-path', 'spatial-core/Cargo.toml', 'gungraun'], {
    encoding: 'utf8'
  })
    .trim()
    .replace(/.*@/, '');
const home = mkdtempSync(join(tmpdir(), 'ci-local-gungraun-'));

function gungraunMissing() {
  const version = pinnedGungraun();
  const runner = spawnSync('gungraun-runner', ['--version'], { encoding: 'utf8' });
  const missing = [];
  if (!works('valgrind')) missing.push('valgrind and libc6-dbg: sudo apt install valgrind libc6-dbg');
  if (runner.status !== 0 || !runner.stdout.includes(version))
    missing.push(`gungraun-runner ${version}: cargo install gungraun-runner --version ${version}`);
  return missing.length ? `needs ${missing.join('; ')}` : null;
}

function ensureActionlint() {
  if (works('actionlint')) return null;
  const bin = join(process.env.HOME, 'test-runs', 'bin');
  const got = spawnSync(
    'bash',
    ['-c', `cd ${bin} && curl -fsSL https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash | bash -s -- latest ${bin}`],
    { stdio: 'inherit' }
  );
  return got.status === 0 && works('actionlint') ? null : 'could not install actionlint';
}

function ensureChromium() {
  const got = spawnSync('pnpm', ['exec', 'playwright', 'install', '--only-shell', 'chromium'], {
    stdio: 'inherit'
  });
  return got.status === 0 ? null : 'could not install the Chromium headless shell';
}

const steps = [
  {
    name: 'pnpm check and the related tests',
    cmd: ['node', 'tools/audit/ci-check.mjs'],
    env: { CHECK_BASE: base }
  },
  { name: 'Architecture seams and component sizes', cmd: ['node', 'tools/audit/audit.mjs', 't0'] },
  { name: 'Work pins, base against head', cmd: ['node', 'tools/work-pins/gate.mjs', '--base', base] },
  {
    name: 'Instruction counts, base against head',
    cmd: ['node', 'tools/gungraun/gate.mjs', '--base', base, '--home', home],
    slow: true,
    skip: gungraunMissing
  },
  {
    name: 'Browser work pins, base against head',
    cmd: ['node', 'tools/work-pins/gate.mjs', '--leg', 'browser', '--base', base],
    slow: true,
    skip: () =>
      existsSync('tools/work-pins/browser.mjs') ? ensureChromium() : 'this commit has no browser leg'
  },
  {
    name: 'Benchmarks run',
    cmd: ['vitest', 'bench', '--run', '--config', 'tools/bench/vitest.config.ts']
  },
  { name: 'Workflow files', cmd: ['actionlint'], skip: ensureActionlint }
];

process.stdout.write(`[ci-local] ${git('rev-parse', 'HEAD')} against ${base} (merge base with ${TRUNK})\n`);
const results = [];
for (const step of steps) {
  if (quick && step.slow) {
    results.push({ name: step.name, outcome: 'skip', note: '--quick' });
    continue;
  }
  const reason = step.skip?.();
  if (reason) {
    results.push({ name: step.name, outcome: 'skip', note: reason });
    continue;
  }
  process.stdout.write(`\n[ci-local] ▶ ${step.name}: ${step.cmd.join(' ')}\n`);
  const started = Date.now();
  const r = spawnSync(step.cmd[0], step.cmd.slice(1), {
    stdio: 'inherit',
    env: { ...process.env, ...step.env }
  });
  const seconds = Math.round((Date.now() - started) / 1000);
  results.push({ name: step.name, outcome: r.status === 0 ? 'pass' : 'FAIL', note: `${seconds} s` });
}
rmSync(home, { recursive: true, force: true });

process.stdout.write('\n[ci-local] summary\n');
for (const r of results) process.stdout.write(`  ${r.outcome.padEnd(4)}  ${r.name}  (${r.note})\n`);
process.exit(results.some((r) => r.outcome === 'FAIL') ? 1 : 0);
