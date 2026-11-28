#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { withInvalid } from './invalid.mjs';

/** @typedef {import('./store.mjs').Entry} Entry */
/** @typedef {import('./store.mjs').World} World */
/** @typedef {import('./store.mjs').Perf} Perf */
/** @typedef {import('./store.mjs').FileRef} FileRef */
/** @typedef {{ busy: string[], load?: string, cores?: string, home?: string, dirty?: string, patched?: string, [key: string]: string | string[] | undefined }} Kv */
/** @typedef {{ pid: number, cmd: string }} Process */
/** @typedef {{ at: string, load: number[], cores: number | null, others: Process[] }} HostSnapshot */
/** @typedef {NonNullable<ReturnType<typeof hostRecord>>} HostRecord */
/** @typedef {Record<string, unknown>} Row */
/**
 * @typedef {{
 *   env?: NodeJS.ProcessEnv, machine?: string, at?: string, git?: { branch: string | null, commit: string | null, dirty: number | null, refs: string | null }, tree?: string,
 *   save?: string | null, world?: Partial<World>, files?: { role: string, name?: string, path?: string | null }[],
 *   host?: HostRecord | null, hostStart?: HostSnapshot | null, kind?: string, branch?: string | null, tool: string | null,
 *   scenario?: string | null, perf?: Perf | null, parent?: string | null, note?: string, has?: import('./invalid.mjs').Has
 * }} RunOptions
 */

const RUNNER = fileURLToPath(new URL('./rerun-remote.sh', import.meta.url));
export const LOAD_LIMIT = 1.5;

/** @param {unknown} text @returns {Kv} */
export function parseKv(text) {
  /** @type {Kv} */
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

/** @param {Kv | null | undefined} kv @param {string} [at] @returns {HostSnapshot | null} */
export function snapshot(kv, at = new Date().toISOString()) {
  if (!kv?.load) return null;
  const others = kv.busy.map((b) => {
    const sp = b.indexOf(' ');
    return { pid: Number(sp < 0 ? b : b.slice(0, sp)), cmd: sp < 0 ? '' : b.slice(sp + 1) };
  });
  return { at, load: kv.load.split(' ').map(Number), cores: kv.cores ? Number(kv.cores) : null, others };
}

/** @param {number} [self] */
export function hostNow(self = process.pid) {
  try {
    return snapshot(parseKv(execFileSync('bash', [RUNNER, 'quiet', String(self)], { encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'ignore'] })));
  } catch {
    return null;
  }
}

const AT_IMPORT = process.env.F4X_LEDGER_OFF === '1' ? null : hostNow();

/** @param {HostSnapshot | null} start @param {HostSnapshot | null} end */
export function hostRecord(start, end) {
  if (!start && !end) return null;
  /** @type {Map<string, Process>} */
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

/** @param {HostRecord | null} host @param {number} [limit] @returns {string[]} */
export function hostInvalid(host, limit = LOAD_LIMIT) {
  if (!host) return [];
  /** @type {string[]} */
  const reasons = [];
  if (host.others.length) reasons.push(`another f4x bench was running: ${host.others.map((o) => `${o.pid} ${o.cmd.slice(0, 120)}`).join('; ')}`);
  const l1 = host.load?.[0];
  if (l1 != null && l1 > limit) reasons.push(`load ${l1} at start, above ${limit}`);
  return reasons;
}

/** @param {NodeJS.ProcessEnv} [env] */
export function agentEnv(env = process.env) {
  return {
    ...env,
    CLAUDE_CODE_SESSION_ID: env.CLAUDE_CODE_SESSION_ID || env.F4X_LEDGER_SESSION || '',
    T3CODE_THREAD_ID: env.T3CODE_THREAD_ID || env.F4X_LEDGER_THREAD || ''
  };
}

/** @param {unknown} v @returns {v is number} */
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** @param {unknown[]} values */
export function stats(values) {
  const xs = values.filter(finite).sort((a, b) => a - b);
  if (!xs.length) return null;
  /** @param {number} p */
  const at = (p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
  const mid = xs.length >> 1;
  const median = xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
  return { median, p10: at(0.1), p90: at(0.9), n: xs.length };
}

/** @param {string} path */
export function readSave(path) {
  let gz = readFileSync(path);
  const isGz = gz[0] === 0x1f && gz[1] === 0x8b;
  const text = isGz ? gunzipSync(gz) : gz;
  if (!isGz) gz = gzipSync(text);
  return { gz, text };
}

/** @param {string} tree */
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

/** @param {RunOptions} opts @param {string} dir @returns {Promise<Entry>} */
export async function buildEntry(opts, dir) {
  const spool = await import('./spool.mjs');
  const { describeSave, worldIdOf } = await import('./ingest.mjs');
  const env = opts.env ?? process.env;
  const machine = opts.machine ?? spool.machineName(env);
  const at = opts.at ?? new Date().toISOString();
  const git = opts.git ?? spool.gitInfo(opts.tree ?? process.cwd());
  const dirty = opts.git ? git.dirty : (measuredDirty(opts.tree ?? process.cwd()) ?? git.dirty);
  /** @type {FileRef[]} */
  const files = [];
  /** @type {World} */
  let world = { save: null, name: null, turn: null, seed: null, map: null, pawns: null, mobs: null, generatedBy: null, savedBy: null };
  if (opts.save) {
    const { gz, text } = readSave(opts.save);
    const sha = spool.writeBlob(gz, dir);
    files.push(spool.fileRef('save', basename(opts.save).replace(/(\.json)?(\.gz)?$/, '.json.gz'), sha, dir));
    world = { ...world, ...describeSave(text.toString('utf8')), save: worldIdOf(gz) };
  }
  world = { ...world, ...Object.fromEntries(Object.entries(opts.world ?? {}).filter(([, v]) => v != null)) };
  for (const f of opts.files ?? []) {
    if (!f.path || !existsSync(f.path)) continue;
    const path = f.path;
    files.push(spool.fileRef(f.role, f.name ?? basename(path), spool.writeBlob(path, dir), dir));
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

/** @param {RunOptions & { dir?: string, warn?: (m: string) => void, log?: (m: string) => void }} opts */
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
    warn(`ledger: this run was not recorded (${err instanceof Error ? err.message : err})`);
    return null;
  }
}

/** @param {Row[]} rows @param {(r: Row) => boolean} pred @param {string} key */
const pick = (rows, pred, key) => stats(rows.filter(pred).map((r) => r[key]));
/** @param {Row[]} rows @param {string} group @param {string} key */
const byValue = (rows, group, key) =>
  Object.fromEntries([...new Set(rows.map((r) => String(r[group])))].map((g) => [g, pick(rows, (r) => String(r[group]) === g, key)]));

/** @type {Record<string, (rows: Row[]) => Perf>} */
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

/** @param {string} tool @param {{ tree: string, label: string, rows: Row[], result: string, profiles?: string[], env?: NodeJS.ProcessEnv }} opts */
export function recordBench(tool, { tree, label, rows, result, profiles = [], env = process.env }) {
  const fixture = env.F4X_FIXTURE || null;
  const scenario = tool === 'frame-cost' ? env.F4X_SCENARIO || (fixture ? 'save' : 'large-wilderness') : fixture ? 'save' : 'dev-save';
  /** @type {Perf | null} */
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

/** @param {string | undefined} execArgv @param {number} since */
function cpuProfiles(execArgv, since) {
  const m = /--cpu-prof-dir[= ](\S+)/.exec(execArgv ?? '');
  if (!m || !/--cpu-prof\b/.test(execArgv ?? '')) return [];
  const d = resolve(m[1]);
  if (!existsSync(d)) return [];
  return readdirSync(d)
    .filter((n) => n.endsWith('.cpuprofile') && statSync(join(d, n)).mtimeMs >= since)
    .map((n) => ({ role: 'profile', path: join(d, n) }));
}

/** @param {string} resultPath @param {string | undefined} logPath @param {NodeJS.ProcessEnv} [env] */
export async function recordHarness(resultPath, logPath, env = process.env) {
  /** @type {import('./ingest.mjs').HarnessResult & { branch?: string }} */
  let result = {};
  try {
    result = JSON.parse(readFileSync(resultPath, 'utf8'));
  } catch (err) {
    console.warn(`ledger: this run was not recorded (${/** @type {Error} */ (err).message})`);
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
