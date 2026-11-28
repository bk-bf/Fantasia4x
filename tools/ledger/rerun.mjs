// @ts-nocheck
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { randomBytes } from 'node:crypto';
import { buildEntry, hostRecord, LOAD_LIMIT, parseKv, snapshot } from './bench.mjs';
import { resolveSave } from './fetch.mjs';
import { harnessPerf } from './ingest.mjs';
import { spoolDir, writeEntry } from './spool.mjs';
import { allEntries, entryExists, getEntry, ingestSpool, isLiveStore, readBlob, withLock } from './store.mjs';

const REPO = new URL('../..', import.meta.url).pathname;
const ENTRY_ID = /^\d{8}T\d{6}Z-/;
const MODES = new Set(['loop', 'tick']);
const SSH_OPTS = ['-o', 'ConnectTimeout=10', '-o', 'BatchMode=yes', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=8'];
const REMOTE_REPO = 'Documents/Projects/Fantasia4x';
const QUIET_WAIT_MS = 20 * 60 * 1000;

export const USAGE =
  'usage: pnpm ledger rerun <entry id|world id> --ref <commit|branch> [--ref ...] [--machine desktop] [--mode loop|tick] [--speed 4] [--seconds 30] [--warm 600] [--ticks 1800] [--rounds N] [--harness-ref origin/test/look-overhaul] [--keep] [--note N]';

const positive = (name, raw, int = true) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || (int && !Number.isInteger(n))) throw new Error(`--${name} wants a positive ${int ? 'whole ' : ''}number, got ${raw}`);
  return n;
};

export function parseRerunArgs(args) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      ref: { type: 'string', multiple: true },
      machine: { type: 'string', default: 'desktop' },
      mode: { type: 'string', default: 'loop' },
      speed: { type: 'string', default: '4' },
      seconds: { type: 'string', default: '30' },
      warm: { type: 'string' },
      ticks: { type: 'string' },
      rounds: { type: 'string', default: '1' },
      'harness-ref': { type: 'string', default: 'origin/test/look-overhaul' },
      keep: { type: 'boolean', default: false },
      note: { type: 'string', default: '' }
    }
  });
  if (positionals.length !== 1) throw new Error(USAGE);
  if (!values.ref?.length) throw new Error(`rerun needs --ref\n${USAGE}`);
  if (!MODES.has(values.mode)) throw new Error(`--mode is loop or tick, got ${values.mode}`);
  if (values.machine === 'laptop') throw new Error('rerun never runs on the laptop');
  return {
    target: positionals[0],
    refs: values.ref,
    machine: values.machine,
    mode: values.mode,
    speed: positive('speed', values.speed, false),
    seconds: positive('seconds', values.seconds, false),
    warm: values.warm == null ? null : positive('warm', values.warm),
    ticks: values.ticks == null ? null : positive('ticks', values.ticks),
    rounds: positive('rounds', values.rounds),
    harnessRef: values['harness-ref'],
    keep: values.keep,
    note: values.note
  };
}

const saveFileOf = (e) => (e.files ?? []).find((f) => f.role === 'save') ?? null;

export function findSave(root, target) {
  if (ENTRY_ID.test(target)) {
    if (!entryExists(root, target)) throw new Error(`no entry ${target}`);
    const e = getEntry(root, target);
    const own = saveFileOf(e);
    if (own && e.world?.save) return { parent: e.id, world: e.world, file: own };
    if (!e.world?.save) throw new Error(`entry ${target} names no world, so there is nothing to rerun`);
    const s = resolveSave(root, e.world.save);
    return { parent: e.id, world: s.world, file: saveFileOf(s) };
  }
  try {
    const s = resolveSave(root, target);
    return { parent: s.id, world: s.world, file: saveFileOf(s) };
  } catch (err) {
    const carriers = allEntries(root).filter((e) => (e.world?.save ?? '').startsWith(target) && saveFileOf(e));
    const worlds = new Set(carriers.map((e) => e.world.save));
    if (worlds.size > 1) throw new Error(`${target} names ${worlds.size} worlds; give more of the id`);
    if (!carriers.length) throw err;
    return { parent: carriers[0].id, world: carriers[0].world, file: saveFileOf(carriers[0]) };
  }
}

export function plan(refs, rounds) {
  const out = [];
  for (let r = 1; r <= rounds; r++) for (const ref of refs) out.push({ ref, round: r });
  return out;
}

export function resultName(mode, tag, speed) {
  return mode === 'loop' ? `${tag}.loop${speed}x.json` : `${tag}.json`;
}

export function harnessVars(o, saveOnRemote, out, tag, branch) {
  const v = [`PROF_SCENARIO=save`, `PROF_SAVE=${saveOnRemote}`, `PROF_OUT=${out}`, `PROF_TAG=${tag}`];
  if (o.mode === 'loop') v.push(`PROF_SPEED=${o.speed}`, `PROF_SECONDS=${o.seconds}`);
  else {
    if (o.warm != null) v.push(`PROF_WARM=${o.warm}`);
    if (o.ticks != null) v.push(`PROF_TICKS=${o.ticks}`);
  }
  if (branch) v.push(`PROF_BRANCH=${branch}`);
  return v;
}

const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

export function defaultDeps() {
  const run = (cmd, args, { input, limit = '25m', binary = false } = {}) => {
    const r = spawnSync('timeout', [limit, cmd, ...args], { input, encoding: binary ? null : 'utf8', maxBuffer: 2 ** 30 });
    return { status: r.status, stdout: r.stdout ?? '', stderr: String(r.stderr ?? '') };
  };
  return {
    ssh: (host, script, opts) => run('ssh', [...SSH_OPTS, host, script], opts),
    git: (args) => run('git', ['-C', REPO, ...args], { limit: '5m' }),
    sleep: (ms) => spawnSync('sleep', [String(ms / 1000)]),
    now: () => Date.now(),
    log: (m) => console.error(m)
  };
}

function resolveRef(deps, ref) {
  const remote = ref.replace(/^origin\//, '');
  const isBranch = deps.git(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${remote}`]).status === 0;
  const r = deps.git(['rev-parse', '--verify', '--quiet', `${isBranch ? `origin/${remote}` : ref}^{commit}`]);
  const sha = r.stdout.trim();
  if (r.status !== 0 || !/^[0-9a-f]{40}$/.test(sha)) throw new Error(`${ref} is not a commit here; push it or name it fully`);
  const refs = deps
    .git(['for-each-ref', '--points-at', sha, '--format=%(refname:short)', 'refs/remotes'])
    .stdout.split('\n')
    .filter(Boolean)
    .join(',');
  return { ref, sha, branch: isBranch ? remote : null, refs };
}

function remote(deps, host, ctx, args, limit = '25m') {
  return deps.ssh(host, `bash ${q(ctx.script)} ${args.map(q).join(' ')}`, { limit });
}

function unit(deps, host, ctx, name, args) {
  const log = `${ctx.run}/${name}.log`;
  const script = [
    'systemd-run --user --collect --wait --quiet',
    `--unit=${q(`f4x-ledger-rerun-${ctx.batch}-${name}`)}`,
    '-p RuntimeMaxSec=1260',
    `bash ${q(ctx.script)} logged ${q(log)} ${args.map(q).join(' ')}`,
    `; s=$?; tail -c 200000 ${q(log)}; exit $s`
  ].join(' ');
  return deps.ssh(host, script, { limit: '22m' });
}

function waitQuiet(deps, host, ctx) {
  const until = deps.now() + QUIET_WAIT_MS;
  for (;;) {
    const r = remote(deps, host, ctx, ['quiet'], '60s');
    if (r.status !== 0) throw new Error(`the quiet check on ${host} exited ${r.status}: ${(r.stderr || r.stdout).trim().slice(0, 300)}`);
    const kv = parseKv(r.stdout);
    const load = Number(String(kv.load ?? '').split(' ')[0]);
    if (!kv.busy.length && !(load > LOAD_LIMIT)) return snapshot(kv, new Date(deps.now()).toISOString());
    if (deps.now() >= until) throw new Error(`${host} stayed busy for 20 minutes (load ${kv.load}):\n  ${kv.busy.join('\n  ')}`);
    deps.log(`${host} is busy, waiting: load ${kv.load}${kv.busy.length ? `, ${kv.busy[0].slice(0, 160)}` : ''}`);
    deps.sleep(30_000);
  }
}

export async function rerun(root, o, deps = defaultDeps(), env = process.env) {
  const host = o.machine;
  const found = findSave(root, o.target);
  const gz = readBlob(root, found.file.sha256);
  const probe = deps.ssh(host, 'echo "home=$HOME"', { limit: '30s' });
  const home = parseKv(probe.stdout).home;
  if (probe.status !== 0 || !home) throw new Error(`${host} is unreachable (${(probe.stderr || '').trim().slice(0, 200) || `exit ${probe.status}`}); turn it on and run this again`);
  deps.git(['fetch', '-q', 'origin']);
  const harness = resolveRef(deps, o.harnessRef);
  const targets = new Map(o.refs.map((ref) => [ref, resolveRef(deps, ref)]));
  const batch = `${new Date(deps.now()).toISOString().replace(/[-:]/g, '').slice(0, 15)}-${randomBytes(2).toString('hex')}`;
  const ctx = { batch, run: `${home}/.cache/f4x-ledger-rerun/${batch}`, script: `${home}/.cache/f4x-ledger-rerun/${batch}/rerun-remote.sh` };
  const repo = `${home}/${REMOTE_REPO}`;
  const wtOf = (t) => `${repo}/.claude/worktrees/ledger-rerun-${t.sha.slice(0, 12)}`;
  const save = `${ctx.run}/save-${found.world.save.slice(0, 12)}.json.gz`;
  const fetched = deps.ssh(host, `git -C ${q(repo)} fetch -q origin`, { limit: '5m' });
  if (fetched.status !== 0) throw new Error(`git fetch failed in ${repo} on ${host}: ${fetched.stderr.trim().slice(0, 300)}`);
  const shipped = deps.ssh(host, `mkdir -p ${q(ctx.run)} && cat > ${q(ctx.script)}`, { input: readFileSync(new URL('./rerun-remote.sh', import.meta.url)), limit: '60s' });
  if (shipped.status !== 0) throw new Error(`could not copy the runner to ${host}: ${shipped.stderr.trim()}`);
  const copied = deps.ssh(host, `cat > ${q(save)}`, { input: gz, limit: '10m' });
  if (copied.status !== 0) throw new Error(`could not copy the save to ${host}: ${copied.stderr.trim()}`);
  deps.log(`world ${found.world.save.slice(0, 12)} (turn ${found.world.turn ?? '?'}) from ${found.parent} copied to ${host}`);
  const local = mkdtempSync(join(tmpdir(), 'f4x-rerun-'));
  const localSave = join(local, `save-${found.world.save.slice(0, 12)}.json.gz`);
  writeFileSync(localSave, gz);
  const ids = [];
  try {
    for (const t of targets.values()) {
      waitQuiet(deps, host, ctx);
      deps.log(`preparing ${t.ref} at ${t.sha.slice(0, 12)} on ${host}`);
      const r = unit(deps, host, ctx, `prepare-${t.sha.slice(0, 12)}`, ['prepare', repo, wtOf(t), t.sha, harness.sha]);
      if (r.status !== 0) throw new Error(`preparing ${t.ref} failed on ${host}:\n${r.stdout.slice(-3000)}`);
      t.prep = parseKv(r.stdout);
    }
    const order = plan(o.refs, o.rounds);
    for (const [i, step] of order.entries()) {
      const t = targets.get(step.ref);
      const hostBefore = waitQuiet(deps, host, ctx);
      const tag = `r${step.round}-${t.sha.slice(0, 12)}`;
      const out = `${ctx.run}/out`;
      const at = new Date(deps.now()).toISOString();
      deps.log(`round ${step.round}/${o.rounds} ${t.ref} ${o.mode} (${i + 1} of ${order.length}), load ${hostBefore.load.join(' ')}`);
      const r = unit(deps, host, ctx, tag, ['round', wtOf(t), o.mode, ...harnessVars(o, save, out, tag, t.branch)]);
      const after = remote(deps, host, ctx, ['quiet'], '60s');
      const hostAfter = after.status === 0 ? snapshot(parseKv(after.stdout), new Date(deps.now()).toISOString()) : null;
      const name = resultName(o.mode, tag, o.speed);
      const got = deps.ssh(host, `cat ${q(`${out}/${name}`)}`, { limit: '60s' });
      if (r.status !== 0 || got.status !== 0) throw new Error(`round ${step.round} at ${t.ref} failed on ${host}:\n${r.stdout.slice(-3000)}`);
      const result = JSON.parse(got.stdout);
      const resultPath = join(local, name);
      const logPath = join(local, `${tag}.log`);
      writeFileSync(resultPath, got.stdout);
      writeFileSync(logPath, r.stdout);
      const id = await recordRound(root, {
        o, t, step, result, at, found, harness, hostBefore, hostAfter, batch, env, localSave, resultPath, logPath, machine: host
      });
      ids.push(id);
      deps.log(`recorded ${id}: ${summary(result)}`);
    }
  } finally {
    remote(deps, host, ctx, ['cleanup', repo, ctx.run, ...(o.keep ? [] : [...targets.values()].map(wtOf))], '5m');
    rmSync(local, { recursive: true, force: true });
  }
  return ids;
}

export function summary(r) {
  const tps = r.tps ?? r.uncappedTps;
  return `${String(r.commit ?? '').slice(0, 8)} pawns ${r.pawns} mobs ${r.mobs} turn ${r.turn}→${r.endTurn} tps ${tps == null ? '-' : tps.toFixed(1)}${r.speed ? ` at ${r.speed}x` : ' uncapped'}`;
}

export async function recordRound(root, c) {
  const dir = c.spool ?? spoolDir(c.env);
  const entry = await buildEntry(
    {
      env: c.env,
      kind: 'harness',
      tool: 'tick-harness',
      scenario: 'save',
      machine: c.machine,
      at: c.at,
      git: { branch: c.t.branch, commit: c.t.sha, dirty: c.t.prep?.dirty == null ? null : Number(c.t.prep.dirty), refs: c.t.refs },
      save: c.localSave,
      world: { save: c.found.world.save, turn: c.result.turn ?? null, pawns: c.result.pawns ?? null, mobs: c.result.mobs ?? null },
      perf: {
        ...harnessPerf(c.result),
        mode: c.o.mode,
        round: c.step.round,
        rounds: c.o.rounds,
        batch: c.batch,
        ref: c.t.ref,
        harnessRef: c.harness.ref,
        harnessCommit: c.harness.sha,
        enginePatched: c.t.prep?.patched === '1'
      },
      host: hostRecord(c.hostBefore ?? null, c.hostAfter ?? null),
      files: [
        { role: 'result', path: c.resultPath },
        { role: 'log', path: c.logPath }
      ],
      parent: c.found.parent,
      note: [`rerun of ${c.found.parent} at ${c.t.ref}`, c.o.note].filter(Boolean).join('; ')
    },
    dir
  );
  const id = writeEntry(entry, dir);
  syncSpool(root, dir);
  return id;
}

export function syncSpool(root, dir, waitMs) {
  try {
    const remove = isLiveStore(root) || resolve(dir) !== resolve(spoolDir({}));
    const report = withLock(root, () => ingestSpool(root, dir, { remove }), waitMs == null ? {} : { waitMs });
    if (report.errors.length) console.error(`ledger: ${report.errors.join('; ')}`);
    return true;
  } catch (err) {
    console.error(`ledger: left in the spool for the sync timer: ${err.message}`);
    return false;
  }
}

export async function rerunCli(root, args) {
  if (!['ubuntuserver'].includes((await import('./spool.mjs')).machineName()) && !process.env.F4X_LEDGER_DIR)
    throw new Error('rerun runs on ubuntuserver, where the store is');
  const o = parseRerunArgs(args);
  mkdirSync(root, { recursive: true });
  const ids = await rerun(root, o);
  console.log(ids.join('\n'));
}
