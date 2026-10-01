import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readlinkSync } from 'node:fs';
import { basename, dirname, relative } from 'node:path';

const RUNS_DIR = 'test-runs/Fantasia4x';
const IDLE_MS = 60 * 60 * 1000;
const KEEP_BRANCHES = new Set(['dev', 'main']);
const SSH = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5'];

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const succeeds = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, stdio: 'ignore' }).status === 0;
const git = (args, cwd) => run('git', args, cwd);

export const mainCheckout = (root) =>
  dirname(git(['rev-parse', '--path-format=absolute', '--git-common-dir'], root));

function busyDirs() {
  const dirs = [];
  for (const pid of readdirSync('/proc')) {
    if (!/^\d+$/.test(pid)) continue;
    try {
      dirs.push(readlinkSync(`/proc/${pid}/cwd`));
    } catch {
      continue;
    }
  }
  return dirs;
}

function listWorktrees(main) {
  const found = [];
  let cur = {};
  for (const line of [...git(['worktree', 'list', '--porcelain'], main).split('\n'), '']) {
    if (!line) {
      if (cur.path) found.push(cur);
      cur = {};
      continue;
    }
    const [key, ...rest] = line.split(' ');
    const value = rest.join(' ');
    if (key === 'worktree') cur.path = value;
    else if (key === 'HEAD') cur.head = value;
    else if (key === 'branch') cur.branch = value.replace('refs/heads/', '');
  }
  return found;
}

const inDev = (main, ref) => succeeds('git', ['merge-base', '--is-ancestor', ref, 'origin/dev'], main);

function unchangedOnGitHub(main, branch) {
  try {
    return git(['rev-parse', branch], main) === git(['rev-parse', `refs/remotes/origin/${branch}`], main);
  } catch {
    return false;
  }
}

function idleMs(path) {
  try {
    return Date.now() - Number(git(['reflog', '-1', '--format=%ct', 'HEAD'], path)) * 1000;
  } catch {
    return Infinity;
  }
}

function settled(main, branch, open) {
  if (!branch || KEEP_BRANCHES.has(branch)) return '';
  if (inDev(main, branch)) return 'merged into dev';
  if (open && !open.has(branch) && unchangedOnGitHub(main, branch))
    return 'identical on GitHub, no open pull request';
  return '';
}

export function localLeftovers(root, open = null) {
  const main = mainCheckout(root);
  const busy = busyDirs();
  const trees = listWorktrees(main);
  const checkedOut = new Set(trees.map((t) => t.branch).filter(Boolean));
  const worktrees = [];
  for (const t of trees) {
    if (t.path === main) continue;
    const entry = { path: t.path, name: relative(main, t.path), branch: t.branch ?? '' };
    if (!existsSync(t.path)) {
      worktrees.push({ ...entry, removable: true, why: 'its folder is gone' });
      continue;
    }
    const dirty = git(['status', '--porcelain'], t.path).split('\n').filter(Boolean).length;
    const inUse = busy.some((d) => d === t.path || d.startsWith(`${t.path}/`));
    const idle = idleMs(t.path);
    const done = t.branch ? settled(main, t.branch, open) : inDev(main, t.head) ? 'detached, in dev' : '';
    const blockers = [
      dirty && `${dirty} uncommitted file(s)`,
      inUse && 'a process works in it',
      idle < IDLE_MS && `touched ${Math.round(idle / 60000)} min ago`,
      !done && 'not merged'
    ].filter(Boolean);
    worktrees.push({ ...entry, removable: !blockers.length, why: blockers.join(', ') || done });
  }
  const branches = [];
  for (const b of git(['for-each-ref', '--format=%(refname:short)', 'refs/heads/'], main).split('\n')) {
    if (!b || checkedOut.has(b) || KEEP_BRANCHES.has(b)) continue;
    const done = settled(main, b, open);
    branches.push({ name: b, removable: Boolean(done), why: done || 'not merged, no identical copy on GitHub' });
  }
  return { main, worktrees, branches };
}

function remoteClones(host, keep) {
  const script = [
    `cd ${RUNS_DIR} 2>/dev/null || exit 0;`,
    'for d in */; do d=${d%/}; busy=0;',
    '[ -e "$d/.git/f4x.lock" ] && ! flock -n "$d/.git/f4x.lock" true && busy=1;',
    'ls -l /proc/[0-9]*/cwd 2>/dev/null | grep -q " -> $PWD/$d" && busy=1;',
    'echo "$d $busy $(du -sm "$d" | cut -f1)"; done'
  ].join(' ');
  const r = spawnSync('ssh', [...SSH, host, script], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  return r.stdout
    .split('\n')
    .map((l) => l.split(' '))
    .filter(([name, busy]) => name && busy)
    .map(([name, busy, mb]) => {
      const stale = !keep.has(name);
      const why = !stale ? 'its worktree exists' : busy === '1' ? 'a run holds it' : 'its worktree is gone';
      return { host, name, mb: Number(mb), removable: stale && busy === '0', why };
    });
}

const removeRemote = (host, name) =>
  spawnSync('ssh', [
    ...SSH,
    host,
    `cd ${RUNS_DIR} && [ -d '${name}' ] && { [ ! -e '${name}/.git/f4x.lock' ] || flock -n '${name}/.git/f4x.lock' true; } && rm -rf '${name}'`
  ]).status === 0;

export function tidy({ root, remove = false, hosts = [], open = null, log = (s) => process.stdout.write(`${s}\n`) }) {
  const main = mainCheckout(root);
  if (open) succeeds('git', ['fetch', '-q', '--prune', 'origin'], main);
  const found = localLeftovers(main, open);
  const verb = remove ? 'removed' : 'removable';
  const removedTrees = new Set();

  log('worktrees:');
  for (const w of found.worktrees) {
    if (!w.removable) {
      log(`  keep       ${w.name} (${w.why})`);
      continue;
    }
    if (remove) {
      if (existsSync(w.path) && !succeeds('git', ['worktree', 'remove', w.path], main)) {
        log(`  keep       ${w.name} (git refused to remove it)`);
        continue;
      }
      succeeds('git', ['worktree', 'prune'], main);
      if (w.branch && settled(main, w.branch, open)) succeeds('git', ['branch', '-D', w.branch], main);
      removedTrees.add(w.path);
    }
    log(`  ${verb.padEnd(10)} ${w.name}${w.branch ? ` and ${w.branch}` : ''} (${w.why})`);
  }

  log('branches:');
  for (const b of found.branches) {
    if (b.removable && remove) succeeds('git', ['branch', '-D', b.name], main);
    log(`  ${(b.removable ? verb : 'keep').padEnd(10)} ${b.name} (${b.why})`);
  }

  const keep = new Set([
    basename(main),
    ...found.worktrees.filter((w) => existsSync(w.path) && !removedTrees.has(w.path)).map((w) => basename(w.path))
  ]);
  for (const host of hosts) {
    const clones = remoteClones(host, keep);
    if (!clones) {
      log(`test clones on ${host}: unreachable`);
      continue;
    }
    log(`test clones on ${host}:`);
    for (const c of clones) {
      const gone = c.removable && remove && removeRemote(host, c.name);
      log(`  ${(c.removable ? (remove ? (gone ? 'removed' : 'keep') : 'removable') : 'keep').padEnd(10)} ${c.name} ${c.mb} MB (${c.why})`);
    }
  }
  return found;
}
