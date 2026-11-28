// @ts-nocheck
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { sha256Of } from './spool.mjs';
import { ingestSpool, isLiveStore, storeDir } from './store.mjs';
import { ingestPerfLog } from './ingest.mjs';
import { ingestCI } from './ci.mjs';

export const MACHINES = {
  ubuntuserver: { ssh: null, checkouts: ['Documents/Projects/Fantasia4x'] },
  laptop: { ssh: 'laptop', checkouts: ['Documents/local/Projects/Fantasia4x'] },
  desktop: { ssh: 'desktop', checkouts: ['Documents/Projects/Fantasia4x', 'Documents/Projects/Fantasia4x-painted'] }
};

const SSH_OPTS = ['-o', 'ConnectTimeout=10', '-o', 'BatchMode=yes', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=4'];

export const SPOOL = '.local/share/fantasia4x/ledger-spool';
const HOME = /^(\/home\/[^/]+|\/root|\/Users\/[^/]+)\//;

function run(cmd, args, { input, limit = '10m', cwd } = {}) {
  return spawnSync('timeout', [limit, cmd, ...args], { encoding: 'utf8', input, cwd, maxBuffer: 2 ** 28 });
}

const homeOf = (cfg) => cfg.root ?? homedir();

function shell(cfg, script, opts) {
  return cfg.ssh ? run('ssh', [...SSH_OPTS, cfg.ssh, script], opts) : run('sh', ['-c', script], { ...opts, cwd: homeOf(cfg) });
}

const slug = (path) => path.replace(/^\/+/, '').replace(/[^\w.-]+/g, '-');

function source(cfg, path) {
  if (cfg.ssh) return `${cfg.ssh}:${path}`;
  return isAbsolute(path) ? path : join(homeOf(cfg), path);
}

function rsync(cfg, args, limit = '20m') {
  return run('rsync', ['--timeout=60', '-e', `ssh ${SSH_OPTS.join(' ')}`, ...args], { limit });
}

function pull(cfg, from, to, extra = []) {
  mkdirSync(to, { recursive: true });
  return rsync(cfg, ['-a', ...extra, source(cfg, from), to]);
}

export function timeZoneOf(cfg) {
  const r = rsync(cfg, ['--list-only', '-l', source(cfg, '/etc/localtime')], '60s');
  if (r.status !== 0) return { reached: false, tz: null };
  const m = /-> \S*zoneinfo\/(\S+)\s*$/m.exec(r.stdout);
  return { reached: true, tz: m ? m[1] : null };
}

function homeRelative(cfg, path) {
  const home = cfg.ssh ? null : homeOf(cfg);
  if (home && path.startsWith(`${home}/`)) return path.slice(home.length + 1);
  const m = HOME.exec(path);
  return m ? path.slice(m[0].length) : path;
}

export function worktreesOf(root, machine, cfg) {
  const out = new Set();
  for (const c of cfg.checkouts) {
    out.add(c);
    const stage = join(root, 'incoming', machine, 'worktrees', slug(c));
    const r = pull(cfg, `${c}/.git/worktrees/`, `${stage}/`, ['--delete', '--include=/*/', '--include=/*/gitdir', '--exclude=*']);
    if (r.status !== 0) continue;
    for (const name of readdirSync(stage)) {
      const file = join(stage, name, 'gitdir');
      if (!existsSync(file)) continue;
      const gitdir = readFileSync(file, 'utf8').trim();
      if (gitdir) out.add(homeRelative(cfg, dirname(gitdir)));
    }
  }
  return out;
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
      const kept = `${to}.kept-${sha256Of(readFileSync(to)).slice(0, 12)}`;
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

export const LIVE = /^perf\.log(\.\d+|\.\d{8}T\d{6}Z(-\d+)?)?$/;

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

export function pullSpool(root, machine, cfg, report, { spool = SPOOL, clear = isLiveStore(root) } = {}) {
  const stage = join(root, 'incoming', machine, 'spool');
  const r = pull(cfg, `${spool}/`, `${stage}/`, ['--include=/blobs/***', '--include=/entries/***', '--exclude=*.tmp-*', '--exclude=*']);
  if (r.status !== 0 && /No such file|change_dir/.test(r.stderr)) return;
  if (r.status !== 0 && r.status !== 23 && r.status !== 24) {
    report.errors.push(`${machine}: spool rsync exit ${r.status} ${r.stderr.trim().slice(0, 200)}`);
    return;
  }
  const got = ingestSpool(root, stage, { remove: false });
  report.entries += got.entries;
  report.errors.push(...got.errors.map((e) => `${machine}: ${e}`));
  const rel = [...got.removable.entries, ...got.removable.blobs]
    .map((p) => relative(stage, p))
    .filter((p) => /^(blobs\/[0-9a-f]{2}\/[0-9a-f]{64}|entries\/[\w.-]+\.json)$/.test(p));
  if (!rel.length || !clear) return;
  const del = shell(cfg, `cd "${spool}" && xargs -0 rm -f --`, { input: rel.join('\0'), limit: '60s' });
  if (del.status === 0) {
    for (const p of rel) spawnSync('rm', ['-f', '--', join(stage, p)]);
    report.removed += rel.length;
  } else report.errors.push(`${machine}: could not clear the spool: ${del.stderr.trim().slice(0, 200)}`);
}

export function pullMachine(root, machine, cfg, report, { clear } = {}) {
  const { reached, tz } = timeZoneOf(cfg);
  if (!reached) {
    report.skipped.push(machine);
    return;
  }
  report.reached.push(machine);
  if (!tz) report.errors.push(`${machine}: /etc/localtime names no zone; its perf.log times are read as UTC`);
  pullSpool(root, machine, cfg, report, { clear: clear ?? isLiveStore(root) });
  for (const checkout of worktreesOf(root, machine, cfg)) {
    const stage = join(root, 'incoming', machine, 'logs', slug(checkout));
    const r = pull(cfg, `${checkout}/.debug/`, `${stage}/`, ['--include=perf.log*', '--exclude=*']);
    if (r.status !== 0) {
      if (!/No such file|change_dir/.test(r.stderr)) report.errors.push(`${machine} ${checkout}: rsync exit ${r.status}`);
      continue;
    }
    if (!readdirSync(stage).length) continue;
    const raw = join(root, 'raw', machine, slug(checkout));
    mirror(stage, raw);
    writeSource(raw, { machine, checkout, timeZone: tz });
    ingestCheckout(root, machine, checkout, raw, tz, report);
  }
}

export function writeSource(raw, source) {
  const path = join(raw, '.source.json');
  const text = JSON.stringify(source) + '\n';
  if (existsSync(path) && readFileSync(path, 'utf8') === text) return;
  writeFileSync(`${path}.tmp`, text);
  renameSync(`${path}.tmp`, path);
}

export function ingestRaw(root, report = { play: 0, open: 0, missing: [] }) {
  const base = join(root, 'raw');
  if (!existsSync(base)) return report;
  for (const machine of readdirSync(base).sort()) {
    for (const name of readdirSync(join(base, machine)).sort()) {
      const raw = join(base, machine, name);
      const path = join(raw, '.source.json');
      if (!existsSync(path)) {
        report.missing.push(`${machine}/${name}`);
        continue;
      }
      const source = JSON.parse(readFileSync(path, 'utf8'));
      ingestCheckout(root, source.machine, source.checkout, raw, source.timeZone, report);
    }
  }
  return report;
}

export const steps = [
  (root, report) => {
    for (const [machine, cfg] of Object.entries(MACHINES)) pullMachine(root, machine, cfg, report);
  },
  async (root, report) => {
    report.ci = await ingestCI(root);
  }
];

export async function sync(root = storeDir()) {
  mkdirSync(root, { recursive: true });
  const report = { reached: [], skipped: [], entries: 0, play: 0, open: 0, removed: 0, errors: [] };
  for (const step of steps) await step(root, report);
  console.log(JSON.stringify(report));
  return report;
}

