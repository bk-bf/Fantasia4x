#!/usr/bin/env node
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { hostname } from 'node:os';
import { basename, isAbsolute, relative } from 'node:path';

const TEST_HOSTNAME = 'ubuntuserver';
const HOST = process.env.F4X_TEST_HOST ?? 'ubuntu';
const REPO_URL = 'https://github.com/bk-bf/Fantasia4x.git';
const RUNS_DIR = 'test-runs/Fantasia4x';
const TRUNK_REFS = ['origin/dev', 'origin/main'];
const FORWARDED_ENV = /^(WORK_PINS_|RUN_AUDITS$|CHECK_BASE$|VITEST_)/;
const SSH_UNREACHABLE = 255;
const WRONG_COMMIT = 3;
const DIRTY_LISTED = 10;

const die = (msg, code = 2) => {
  process.stderr.write(`[remote] ${msg}\n`);
  process.exit(code);
};

const argv = process.argv.slice(2);
if (!argv.length) die('usage: node tools/remote/run.mjs <command> [args...]');

if (process.env.CI === 'true' || hostname() === TEST_HOSTNAME) {
  const r = spawnSync(argv[0], argv.slice(1), { stdio: 'inherit' });
  if (r.error) die(`${argv[0]}: ${r.error.message}`, 127);
  process.exit(r.status ?? 1);
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const quote = (s) => `'${String(s).replaceAll("'", `'\\''`)}'`;
const top = git('rev-parse', '--show-toplevel');
const dir = `${RUNS_DIR}/${basename(top)}`;
const cwd = relative(top, process.cwd()) || '.';

const dirty = git('status', '--porcelain', '--untracked-files=normal').split('\n').filter(Boolean);
if (dirty.length)
  die(
    `${top} has ${dirty.length} uncommitted or untracked file(s); the server runs commits, so commit them first:\n` +
      dirty.slice(0, DIRTY_LISTED).map((l) => `  ${l}`).join('\n') +
      (dirty.length > DIRTY_LISTED ? `\n  … and ${dirty.length - DIRTY_LISTED} more` : '')
  );

const sha = git('rev-parse', 'HEAD');

function ssh(script, opts = {}) {
  return spawnSync('ssh', ['-o', 'BatchMode=yes', HOST, `bash -c ${quote(script)}`], {
    encoding: 'utf8',
    maxBuffer: 1 << 26,
    ...opts
  });
}

function checked(r, what) {
  if (r.status === SSH_UNREACHABLE || r.error)
    die(`cannot reach ${HOST} (${what}); tests never run on this machine`, SSH_UNREACHABLE);
  if (r.status !== 0) die(`${what} failed on ${HOST}:\n${r.stderr ?? ''}`, r.status ?? 1);
  return r;
}

function ensureCommit() {
  const probe = checked(
    ssh(
      [
        `mkdir -p ${quote(dir)} && cd ${quote(dir)}`,
        `test -d .git || git clone -q ${quote(REPO_URL)} .`,
        'git fetch -q origin',
        `git cat-file -e ${sha}^{commit} 2>/dev/null && echo have || echo need`
      ].join(' && ')
    ),
    'clone and fetch'
  );
  if (probe.stdout.trim() === 'have') return;
  const trunk = TRUNK_REFS.filter((ref) => {
    try {
      git('rev-parse', '--verify', '-q', ref);
      return true;
    } catch {
      return false;
    }
  });
  const bundle = execFileSync('git', ['bundle', 'create', '-', 'HEAD', '--not', ...trunk], {
    cwd: top,
    maxBuffer: 1 << 30
  });
  checked(
    ssh(
      `cd ${quote(dir)} && cat > .git/f4x.bundle && git fetch -q .git/f4x.bundle HEAD:refs/f4x/head && rm .git/f4x.bundle`,
      { input: bundle }
    ),
    'send unpushed commits'
  );
}

function localPath(arg) {
  return isAbsolute(arg) && arg.startsWith(`${top}/`) ? relative(top, arg) : arg;
}

function runScript() {
  const env = Object.entries(process.env)
    .filter(([k]) => FORWARDED_ENV.test(k))
    .map(([k, v]) => `${k}=${quote(v)}`);
  if (process.stdout.isTTY) env.push('FORCE_COLOR=1');
  const command = argv.map((a) => quote(localPath(a))).join(' ');
  const refuse = (msg) => `{ echo ${quote(`[remote] ${msg}`)} >&2; exit ${WRONG_COMMIT}; }`;
  return [
    'set -e',
    `cd ${quote(dir)}`,
    'exec 9>.git/f4x.lock',
    'flock 9',
    `git checkout -q -f --detach ${sha}`,
    'git clean -fdq',
    `test "$(git rev-parse HEAD)" = ${sha} || ${refuse(`server HEAD is not ${sha}`)}`,
    `test -z "$(git status --porcelain --untracked-files=normal)" || ${refuse('server tree differs from the commit')}`,
    'source tools/remote/prepare.sh',
    `test "$(git rev-parse HEAD)" = ${sha} || ${refuse(`setup moved server HEAD off ${sha}`)}`,
    `echo "[remote] laptop HEAD ${sha} = server HEAD $(git rev-parse HEAD)" >&2`,
    `cd ${quote(cwd)}`,
    'set +e',
    `env ${env.join(' ')} nice -n 10 ionice -c3 ${command}`
  ].join('\n');
}

function run() {
  ensureCommit();
  process.stderr.write(`[remote] ${argv.join(' ')} on ${HOST}:~/${dir} at ${sha}\n`);
  const remote = spawn('ssh', ['-o', 'BatchMode=yes', HOST, `bash -c ${quote(runScript())}`], {
    stdio: ['ignore', 'inherit', 'inherit']
  });
  remote.on('error', (e) => die(`ssh: ${e.message}`, SSH_UNREACHABLE));
  remote.on('close', (code) => {
    if (code === SSH_UNREACHABLE) die(`lost ${HOST}; tests never run on this machine`, code);
    const fetch = process.env.F4X_FETCH;
    if (fetch) {
      const back = spawnSync('rsync', ['-a', `${HOST}:${dir}/${fetch}/`, `${top}/${fetch}/`], {
        stdio: 'inherit'
      });
      if (back.status !== 0) die(`could not fetch ${fetch} back`, back.status ?? 1);
    }
    const now = git('rev-parse', 'HEAD');
    if (now !== sha) die(`result is for ${sha}; this tree moved to ${now} during the run`, code || 1);
    process.stderr.write(`[remote] exit ${code} for ${sha}\n`);
    process.exit(code ?? 1);
  });
}

run();
