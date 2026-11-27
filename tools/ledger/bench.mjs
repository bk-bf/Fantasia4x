#!/usr/bin/env node
// @ts-nocheck
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { withInvalid } from './invalid.mjs';

const RUNNER = fileURLToPath(new URL('./rerun-remote.sh', import.meta.url));
export const LOAD_LIMIT = 1.5;

export function parseKv(text) {
  const out = { busy: [] };
  for (const l of String(text ?? '').split('\n')) {
    const eq = l.indexOf('=');
    if (eq < 1) continue;
    const k = l.slice(0, eq);
    const v = l.slice(eq + 1).trim();
    if (k === 'busy') out.busy.push(v);
    else out[k] = v;
  }
  return out;
}

export function snapshot(kv, at = new Date().toISOString()) {
  if (!kv?.load) return null;
  const others = kv.busy.map((b) => {
    const sp = b.indexOf(' ');
    return { pid: Number(sp < 0 ? b : b.slice(0, sp)), cmd: sp < 0 ? '' : b.slice(sp + 1) };
  });
  return { at, load: kv.load.split(' ').map(Number), cores: kv.cores ? Number(kv.cores) : null, others };
}

export function hostNow(self = process.pid) {
  try {
    return snapshot(parseKv(execFileSync('bash', [RUNNER, 'quiet', String(self)], { encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'ignore'] })));
  } catch {
    return null;
  }
}

const AT_IMPORT = process.env.F4X_LEDGER_OFF === '1' ? null : hostNow();

export function hostRecord(start, end) {
  if (!start && !end) return null;
  const seen = new Map();
  for (const o of [...(start?.others ?? []), ...(end?.others ?? [])]) seen.set(`${o.pid} ${o.cmd}`, o);
  return {
    load: start?.load ?? null,
    loadEnd: end?.load ?? null,
    cores: start?.cores ?? end?.cores ?? null,
    others: [...seen.values()],
    at: start?.at ?? null,
    atEnd: end?.at ?? null
  };
}

export function hostInvalid(host, limit = LOAD_LIMIT) {
  if (!host) return [];
  const reasons = [];
  if (host.others.length) reasons.push(`another f4x bench was running: ${host.others.map((o) => `${o.pid} ${o.cmd.slice(0, 120)}`).join('; ')}`);
  const l1 = host.load?.[0];
  if (l1 != null && l1 > limit) reasons.push(`load ${l1} at start, above ${limit}`);
  return reasons;
}

export function agentEnv(env = process.env) {
  return {
    ...env,
    CLAUDE_CODE_SESSION_ID: env.CLAUDE_CODE_SESSION_ID || env.F4X_LEDGER_SESSION || '',
    T3CODE_THREAD_ID: env.T3CODE_THREAD_ID || env.F4X_LEDGER_THREAD || ''
  };
}

export function stats(values) {
  const xs = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const at = (p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
  const mid = xs.length >> 1;
  const median = xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
  return { median, p10: at(0.1), p90: at(0.9), n: xs.length };
}

export function readSave(path) {
  let gz = readFileSync(path);
  const isGz = gz[0] === 0x1f && gz[1] === 0x8b;
  const text = isGz ? gunzipSync(gz) : gz;
  if (!isGz) gz = gzipSync(text);
  return { gz, text };
}

function measuredDirty(tree) {
  try {
    const out = execFileSync(
      'git',
      ['-C', tree, 'status', '--porcelain', '--untracked-files=no', '--', '.', ':!tools/tickprof'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    return out.split('\n').filter(Boolean).length;
  } catch {
    return null;
  }
}

export async function buildEntry(opts, dir) {
  const spool = await import('./spool.mjs');
  const { describeSave, worldIdOf } = await import('./ingest.mjs');
  const env = opts.env ?? process.env;
  const machine = opts.machine ?? spool.machineName(env);
  const at = opts.at ?? new Date().toISOString();
  const git = opts.git ?? spool.gitInfo(opts.tree ?? process.cwd());
  const dirty = opts.git ? git.dirty : (measuredDirty(opts.tree ?? process.cwd()) ?? git.dirty);
  const files = [];
  let world = { save: null, name: null, turn: null, seed: null, map: null, pawns: null, mobs: null, generatedBy: null, savedBy: null };
  if (opts.save) {
    const { gz, text } = readSave(opts.save);
    const sha = spool.writeBlob(gz, dir);
    files.push(spool.fileRef('save', basename(opts.save).replace(/(\.json)?(\.gz)?$/, '.json.gz'), sha, dir));
    world = { ...world, ...describeSave(text.toString('utf8')), save: worldIdOf(gz) };
  }
  for (const [k, v] of Object.entries(opts.world ?? {})) if (v != null) world[k] = v;
  for (const f of opts.files ?? []) {
    if (!f.path || !existsSync(f.path)) continue;
    files.push(spool.fileRef(f.role, f.name ?? basename(f.path), spool.writeBlob(f.path, dir), dir));
  }
  const host = opts.host !== undefined ? opts.host : hostRecord(opts.hostStart ?? null, hostNow());
  const invalid = hostInvalid(host);
  return withInvalid({
    v: 1,
    id: spool.newId(machine, at),
    kind: opts.kind ?? 'bench',
    at,
    launchedBy: spool.launchedBy(agentEnv(env)),
    machine,
    branch: git.branch ?? opts.branch ?? null,
    commit: git.commit,
    dirty,
    refs: git.refs,
    tool: opts.tool,
    scenario: opts.scenario ?? null,
    world,
    perf: opts.perf ?? null,
    files,
    host,
    ...(invalid.length ? { invalid } : {}),
    parent: opts.parent ?? null,
    note: opts.note ?? ''
  }, opts.has);
}

export async function recordRun(opts) {
  const env = opts.env ?? process.env;
  if (env.F4X_LEDGER_OFF === '1') return null;
  const warn = opts.warn ?? ((m) => console.warn(m));
  try {
    const spool = await import('./spool.mjs');
    const dir = opts.dir ?? spool.spoolDir(env);
    const entry = await buildEntry(opts, dir);
    const id = spool.writeEntry(entry, dir);
    (opts.log ?? ((m) => console.log(m)))(`ledger: recorded ${id}`);
    return id;
  } catch (err) {
    warn(`ledger: this run was not recorded (${err?.message ?? err})`);
    return null;
  }
}

const pick = (rows, pred, key) => stats(rows.filter(pred).map((r) => r[key]));
const byValue = (rows, group, key) =>
  Object.fromEntries([...new Set(rows.map((r) => r[group]))].map((g) => [g, pick(rows, (r) => r[group] === g, key)]));

export const BENCH_PERF = {
  'zoom-out': (rows) => ({
    speed: '1x',
    rounds: rows.length,
    maxMs: byValue(rows, 'mode', 'maxMs'),
    stallMs: byValue(rows, 'mode', 'stallMs'),
    over100: byValue(rows, 'mode', 'over100'),
    cells: rows.map(({ top5: _t, ...r }) => r)
  }),
  steady: (rows) => ({
    tps: pick(rows, (r) => r.mode === '4x', 'tps'),
    speed: '4x',
    fps: byValue(rows, 'mode', 'fps'),
    cells: rows.map(({ workerTps: _w, ...r }) => r)
  }),
  'frame-cost': (rows) => {
    const base = rows.some((r) => r.skipped === 'none') ? 'none' : rows[0]?.skipped;
    const own = rows.filter((r) => r.skipped === base);
    return {
      tps: pick(own, (r) => r.speed === '4x', 'tps'),
      speed: '4x',
      maxSpeedTps: pick(own, (r) => r.speed === 'max', 'tps'),
      fps: byValue(own, 'speed', 'fps'),
      cells: rows
    };
  }
};

/** @param {string} tool @param {{ tree: string, label: string, rows: any[], result: string, profiles?: string[], env?: NodeJS.ProcessEnv }} opts */
export function recordBench(tool, { tree, label, rows, result, profiles = [], env = process.env }) {
  const fixture = env.F4X_FIXTURE || null;
  const scenario = tool === 'frame-cost' ? env.F4X_SCENARIO || (fixture ? 'save' : 'large-wilderness') : fixture ? 'save' : 'dev-save';
  let perf = null;
  try {
    perf = { ...BENCH_PERF[tool](rows), query: env.F4X_QUERY ?? '' };
  } catch {
    perf = null;
  }
  return recordRun({
    env,
    hostStart: AT_IMPORT,
    tool,
    tree,
    scenario,
    save: fixture,
    perf,
    note: label,
    files: [{ role: 'result', path: result }, ...profiles.map((path) => ({ role: 'profile', path }))]
  });
}

function cpuProfiles(execArgv, since) {
  const m = /--cpu-prof-dir[= ](\S+)/.exec(execArgv ?? '');
  if (!m || !/--cpu-prof\b/.test(execArgv)) return [];
  const d = resolve(m[1]);
  if (!existsSync(d)) return [];
  return readdirSync(d)
    .filter((n) => n.endsWith('.cpuprofile') && statSync(join(d, n)).mtimeMs >= since)
    .map((n) => ({ role: 'profile', path: join(d, n) }));
}

export async function recordHarness(resultPath, logPath, env = process.env) {
  let result = {};
  try {
    result = JSON.parse(readFileSync(resultPath, 'utf8'));
  } catch (err) {
    console.warn(`ledger: this run was not recorded (${err.message})`);
    return null;
  }
  const { harnessPerf } = await import('./ingest.mjs').catch(() => ({ harnessPerf: () => null }));
  const started = logPath && existsSync(logPath) ? statSync(logPath).birthtimeMs || statSync(logPath).ctimeMs - 1_800_000 : Date.now() - 1_800_000;
  return recordRun({
    env,
    kind: 'harness',
    tool: 'tick-harness',
    tree: process.cwd(),
    branch: result.branch ?? null,
    scenario: result.scenario ?? env.PROF_SCENARIO ?? null,
    save: result.scenario === 'save' ? env.PROF_SAVE : null,
    world: { turn: result.turn ?? null, seed: result.seed ?? null, map: result.map ?? null, pawns: result.pawns ?? null, mobs: result.mobs ?? null },
    perf: harnessPerf(result),
    files: [
      { role: 'result', path: resultPath },
      { role: 'log', path: logPath },
      ...cpuProfiles(env.PROF_EXECARGV, started)
    ]
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [what, result, log] = process.argv.slice(2);
  if (what === 'harness' && result) await recordHarness(result, log);
  else console.warn('usage: node tools/ledger/bench.mjs harness <result.json> [log]');
}
