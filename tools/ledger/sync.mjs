// @ts-nocheck
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, utimesSync } from 'node:fs';
import { join, relative } from 'node:path';
import { sha256Of } from './spool.mjs';
import { ingestSpool, storeDir } from './store.mjs';
import { ingestPerfLog } from './ingest.mjs';

export const MACHINES = {
  ubuntuserver: { ssh: null, checkouts: ['Documents/Projects/Fantasia4x'] },
  laptop: { ssh: 'laptop', checkouts: ['Documents/local/Projects/Fantasia4x'] },
  desktop: { ssh: 'desktop', checkouts: ['Documents/Projects/Fantasia4x', 'Documents/Projects/Fantasia4x-painted'] }
};

const SSH_OPTS = ['-o', 'ConnectTimeout=10', '-o', 'BatchMode=yes', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=4'];

function run(cmd, args, { input, limit = '10m' } = {}) {
  return spawnSync('timeout', [limit, cmd, ...args], { encoding: 'utf8', input, maxBuffer: 2 ** 28 });
}

function shell(host, script, opts) {
  return host ? run('ssh', [...SSH_OPTS, host, script], opts) : run('sh', ['-c', script], opts);
}

const slug = (path) => path.replace(/^\/+/, '').replace(/[^\w.-]+/g, '-');

function probe(machine, cfg) {
  const lines = [
    'echo "tz=$(timedatectl show -p Timezone --value 2>/dev/null || cat /etc/timezone 2>/dev/null)"',
    'echo "home=$HOME"',
    'echo "spool=${F4X_LEDGER_SPOOL:-${XDG_DATA_HOME:-$HOME/.local/share}/fantasia4x/ledger-spool}"',
    ...cfg.checkouts.map(
      (c) =>
        `[ -d "$HOME/${c}" ] && { echo "wt=$HOME/${c}"; git -C "$HOME/${c}" worktree list --porcelain 2>/dev/null | sed -n 's/^worktree /wt=/p'; }`
    )
  ];
  const r = shell(cfg.ssh, lines.join('; '), { limit: '60s' });
  if (r.status !== 0 && !r.stdout) return null;
  const out = { tz: null, home: null, spool: null, worktrees: new Set() };
  for (const l of r.stdout.split('\n')) {
    const eq = l.indexOf('=');
    if (eq < 0) continue;
    const k = l.slice(0, eq);
    const v = l.slice(eq + 1).trim();
    if (k === 'wt') out.worktrees.add(v);
    else if (v) out[k] = v;
  }
  return out;
}

function pull(cfg, from, to, extra = []) {
  mkdirSync(to, { recursive: true });
  const src = cfg.ssh ? `${cfg.ssh}:${from}` : from;
  return run('rsync', ['-a', '--timeout=60', '-e', `ssh ${SSH_OPTS.join(' ')}`, ...extra, src, to], { limit: '20m' });
}

function sameStart(older, newer) {
  const a = statSync(older).size;
  if (statSync(newer).size < a) return false;
  const head = Buffer.alloc(a);
  readFileSync(newer).copy(head, 0, 0, a);
  return sha256Of(head) === sha256Of(readFileSync(older));
}

export function mirror(stage, raw) {
  mkdirSync(raw, { recursive: true });
  const archived = [];
  for (const name of readdirSync(stage)) {
    const from = join(stage, name);
    const to = join(raw, name);
    if (existsSync(to) && !sameStart(to, from)) {
      const kept = `${to}.${sha256Of(readFileSync(to)).slice(0, 12)}`;
      if (!existsSync(kept)) renameSync(to, kept);
      archived.push(kept);
    }
    if (!existsSync(to) || statSync(to).size !== statSync(from).size || sha256Of(readFileSync(to)) !== sha256Of(readFileSync(from))) {
      copyFileSync(from, `${to}.tmp`);
      const st = statSync(from);
      utimesSync(`${to}.tmp`, st.atime, st.mtime);
      renameSync(`${to}.tmp`, to);
    }
  }
  return archived;
}

const LIVE = /^perf\.log(\.\d+)?$/;

function ingestCheckout(root, machine, checkout, dir, timeZone, report) {
  const files = readdirSync(dir).filter((n) => n.startsWith('perf.log') && !n.endsWith('.tmp'));
  const kept = files.filter((n) => !LIVE.test(n)).sort();
  const live = files.filter((n) => LIVE.test(n));
  for (const paths of [...kept.map((n) => [join(dir, n)]), live.map((n) => join(dir, n))]) {
    if (!paths.length) continue;
    const r = ingestPerfLog(root, { machine, checkout, paths, timeZone });
    report.play += r.created;
    report.open += r.open;
  }
}

function pullSpool(root, machine, cfg, info, report) {
  const stage = join(root, 'incoming', machine, 'spool');
  const r = pull(cfg, `${info.spool}/`, `${stage}/`, ['--include=/blobs/***', '--include=/entries/***', '--exclude=*.tmp-*', '--exclude=*']);
  if (r.status !== 0 && r.status !== 23 && r.status !== 24) {
    report.errors.push(`${machine}: spool rsync exit ${r.status} ${r.stderr.trim().slice(0, 200)}`);
    return;
  }
  const got = ingestSpool(root, stage, { remove: false });
  report.entries += got.entries;
  report.errors.push(...got.errors.map((e) => `${machine}: ${e}`));
  const rel = [...got.removable.entries, ...got.removable.blobs].map((p) => relative(stage, p));
  if (!rel.length) return;
  const del = shell(cfg.ssh, `cd "${info.spool}" && xargs -0 rm -f --`, { input: rel.join('\0'), limit: '60s' });
  if (del.status === 0) {
    for (const p of rel) spawnSync('rm', ['-f', '--', join(stage, p)]);
    report.removed += rel.length;
  } else report.errors.push(`${machine}: could not clear the spool: ${del.stderr.trim().slice(0, 200)}`);
}

function pullMachine(root, machine, cfg, report) {
  const info = probe(machine, cfg);
  if (!info || !info.home) {
    report.skipped.push(machine);
    return;
  }
  report.reached.push(machine);
  pullSpool(root, machine, cfg, info, report);
  for (const wt of info.worktrees) {
    const checkout = wt.startsWith(`${info.home}/`) ? wt.slice(info.home.length + 1) : wt;
    const stage = join(root, 'incoming', machine, 'logs', slug(checkout));
    const r = pull(cfg, `${wt}/.debug/`, `${stage}/`, ['--include=perf.log*', '--exclude=*']);
    if (r.status !== 0) {
      if (!/No such file|change_dir/.test(r.stderr)) report.errors.push(`${machine} ${checkout}: rsync exit ${r.status}`);
      continue;
    }
    if (!readdirSync(stage).length) continue;
    const raw = join(root, 'raw', machine, slug(checkout));
    mirror(stage, raw);
    ingestCheckout(root, machine, checkout, raw, info.tz, report);
  }
}

export const steps = [
  (root, report) => {
    for (const [machine, cfg] of Object.entries(MACHINES)) pullMachine(root, machine, cfg, report);
  }
];

export async function sync(root = storeDir()) {
  mkdirSync(root, { recursive: true });
  const report = { reached: [], skipped: [], entries: 0, play: 0, open: 0, removed: 0, errors: [] };
  for (const step of steps) await step(root, report);
  console.log(JSON.stringify(report));
  return report;
}

