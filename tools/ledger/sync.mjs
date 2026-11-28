// @ts-nocheck
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { RECEIPTS, sha256Of } from './spool.mjs';
import { allEntries, ingestSpool, isLiveStore, putBlob, storeDir, verifyBlob } from './store.mjs';
import { ingestPerfLog } from './ingest.mjs';
import { ingestCI } from './ci.mjs';

export const MACHINES = {
  ubuntuserver: { ssh: null, checkouts: ['Documents/Projects/Fantasia4x'] },
  laptop: { ssh: 'laptop', checkouts: ['Documents/local/Projects/Fantasia4x'], blobs: { hour: 3, zone: 'Europe/Berlin' } },
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

const DAY_MS = 86_400_000;

/** @param {number} t @param {string} zone */
function zoneParts(t, zone) {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  return Object.fromEntries(format.formatToParts(new Date(t)).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
}

const offsetAt = (t, zone) => {
  const p = zoneParts(t, zone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - (t - (t % 1000));
};

function zonedHour(year, month, day, hour, zone) {
  const wall = Date.UTC(year, month - 1, day, hour);
  return wall - offsetAt(wall - offsetAt(wall, zone), zone);
}

export function lastMoveTime(now, { hour, zone }) {
  const t = now.getTime();
  const p = zoneParts(t, zone);
  const today = zonedHour(p.year, p.month, p.day, hour, zone);
  if (today <= t) return today;
  const y = new Date(Date.UTC(p.year, p.month - 1, p.day) - DAY_MS);
  return zonedHour(y.getUTCFullYear(), y.getUTCMonth() + 1, y.getUTCDate(), hour, zone);
}

const movesFile = (root) => join(root, 'state', 'blob-moves.json');

export function blobMoves(root) {
  try {
    return JSON.parse(readFileSync(movesFile(root), 'utf8'));
  } catch {
    return {};
  }
}

function recordMove(root, machine, now) {
  const path = movesFile(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify({ ...blobMoves(root), [machine]: now.toISOString() }) + '\n');
  renameSync(`${path}.tmp`, path);
}

export function blobsDue(root, machine, schedule, now = new Date()) {
  const last = Date.parse(blobMoves(root)[machine] ?? '');
  return Number.isNaN(last) || last < lastMoveTime(now, schedule);
}

function deletedBlobs(root) {
  const out = new Set();
  for (const e of allEntries(root)) {
    if (e.kind !== 'save' || e.perf?.capture?.reason !== 'deleted') continue;
    for (const f of e.files ?? []) out.add(f.sha256);
  }
  return out;
}

function clearSpool(cfg, spool, rel, receipts) {
  const touch = receipts.length ? `mkdir -p ${RECEIPTS} && touch ${receipts.map((sha) => `${RECEIPTS}/${sha}`).join(' ')} && ` : '';
  return shell(cfg, `cd "${spool}" && ${touch}xargs -0 rm -f --`, { input: rel.join('\0'), limit: '60s' });
}

const blobOf = (rel) => /^blobs\/[0-9a-f]{2}\/([0-9a-f]{64})$/.exec(rel)?.[1] ?? null;

export function pullSpool(root, machine, cfg, report, { spool = SPOOL, clear = isLiveStore(root), now = new Date() } = {}) {
  const stage = join(root, 'incoming', machine, 'spool');
  const deferred = Boolean(cfg.blobs);
  const moving = !deferred || blobsDue(root, machine, cfg.blobs, now);
  const blobs = moving ? ['--include=/blobs/***'] : [];
  const r = pull(cfg, `${spool}/`, `${stage}/`, [...blobs, '--include=/entries/***', '--exclude=*.tmp-*', '--exclude=*']);
  if (r.status !== 0 && /No such file|change_dir/.test(r.stderr)) {
    if (deferred && moving) recordMove(root, machine, now);
    return;
  }
  if (r.status !== 0 && r.status !== 23 && r.status !== 24) {
    report.errors.push(`${machine}: spool rsync exit ${r.status} ${r.stderr.trim().slice(0, 200)}`);
    return;
  }
  const got = ingestSpool(root, stage, { remove: false, deferred });
  report.entries += got.entries;
  report.errors.push(...got.errors.map((e) => `${machine}: ${e}`));
  const rel = [...got.removable.entries, ...got.removable.blobs]
    .map((p) => relative(stage, p))
    .filter((p) => /^(blobs\/[0-9a-f]{2}\/[0-9a-f]{64}|entries\/[\w.-]+\.json)$/.test(p));
  let cleared = !clear || !rel.length;
  if (clear && rel.length) {
    const deleted = deletedBlobs(root);
    const receipts = rel.map(blobOf).filter((sha) => sha && deleted.has(sha));
    const del = clearSpool(cfg, spool, rel, receipts);
    cleared = del.status === 0;
    if (cleared) {
      for (const p of rel) spawnSync('rm', ['-f', '--', join(stage, p)]);
      report.removed += rel.length;
    } else report.errors.push(`${machine}: could not clear the spool: ${del.stderr.trim().slice(0, 200)}`);
  }
  if (deferred && moving && r.status === 0 && !got.errors.some((e) => e.startsWith('spool blob ')) && cleared) {
    recordMove(root, machine, now);
    (report.moved ??= []).push(machine);
  }
}

export function fetchBlob(root, machine, sha, { cfg = MACHINES[machine], spool = SPOOL, clear = isLiveStore(root) } = {}) {
  if (!cfg) throw new Error(`no machine ${machine} to fetch a blob from`);
  const rel = `blobs/${sha.slice(0, 2)}/${sha}`;
  const stage = join(root, 'incoming', machine, 'spool');
  const r = pull(cfg, `${spool}/${rel}`, join(stage, dirname(rel)) + '/');
  if (r.status !== 0) throw new Error(`${machine} gave no blob ${sha.slice(0, 12)}: rsync exit ${r.status} ${r.stderr.trim().slice(0, 200)}`);
  const data = readFileSync(join(stage, rel));
  if (sha256Of(data) !== sha) throw new Error(`the ${machine} copy of blob ${sha.slice(0, 12)} does not match its hash`);
  putBlob(root, data);
  if (!verifyBlob(root, sha)) throw new Error(`blob ${sha.slice(0, 12)} did not verify in the store`);
  spawnSync('rm', ['-f', '--', join(stage, rel)]);
  if (!clear) return { cleared: false };
  const del = clearSpool(cfg, spool, [rel], deletedBlobs(root).has(sha) ? [sha] : []);
  return { cleared: del.status === 0 };
}

export function pullMachine(root, machine, cfg, report, { clear, now } = {}) {
  const { reached, tz } = timeZoneOf(cfg);
  if (!reached) {
    report.skipped.push(machine);
    return;
  }
  report.reached.push(machine);
  if (!tz) report.errors.push(`${machine}: /etc/localtime names no zone; its perf.log times are read as UTC`);
  pullSpool(root, machine, cfg, report, { clear: clear ?? isLiveStore(root), now });
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
  const report = { reached: [], skipped: [], entries: 0, play: 0, open: 0, removed: 0, moved: [], errors: [] };
  for (const step of steps) await step(root, report);
  console.log(JSON.stringify(report));
  return report;
}

