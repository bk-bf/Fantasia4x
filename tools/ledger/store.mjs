import {
  appendFileSync,
  closeSync,
  openSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { blobPath, sha256Of, writeBlobAt, writeOnce } from './spool.mjs';

/** @typedef {{ role: string, name: string, sha256: string, bytes?: number }} FileRef */
/** @typedef {{ who: string | null, session: string | null, thread: string | null, ciRunId: number | null, ciJob: string | null, ciAttempt: number | null }} LaunchedBy */
/** @typedef {{ save: string | null, name: string | null, turn: number | null, seed: number | string | null, map: string | number[] | null, pawns: number | null, mobs: number | null, generatedBy: string | null, savedBy: string | null, captureId?: string | null }} World */
/** @typedef {{ load: number | (number | null)[] | null, loadEnd: number | (number | null)[] | null, cores: number | null, others: unknown, [field: string]: unknown }} Host */
/** @typedef {{ save?: string | null, capture?: string | null, [field: string]: unknown }} Checkpoint */
/** @typedef {{ median: number, p10: number | null, p90: number | null, n: number | null }} Stats */
/** @typedef {{ save: string | null, capture: string | null, turn: number | null, at: string | null }} StretchEnd */
/** @typedef {{ from: StretchEnd, to: StretchEnd | null, tps: Record<string, Stats | null> }} Stretch */
/** @typedef {{ tps?: Stats | null, speed?: string | null, stretches?: Stretch[], lines?: { from: number, to: number }, turns?: { first: number, last: number } | null, end?: string | null, capture?: { reason?: string | null, ms?: number }, checkpoints?: Checkpoint[], [field: string]: unknown }} Perf */
/**
 * @typedef {{
 *   v: number, id: string, kind: string, at: string | null, recordedAt?: string, launchedBy: LaunchedBy, machine: string,
 *   branch: string | null, commit: string | null, dirty: number | boolean | null, refs: string | null, tool: string | null,
 *   scenario: string | null, world: Partial<World>, host?: Host | null, perf: Perf | null, files: FileRef[], parent: string | null, note: string,
 *   invalid?: string[], supersedes?: string, checkout?: string, captureId?: string | null, ci?: { repo: string, jobId: number, [field: string]: unknown }
 * }} Entry
 */
/** @typedef {Pick<Entry, 'v' | 'id' | 'kind'> & Partial<Omit<Entry, 'v' | 'id' | 'kind'>>} NewEntry */
/** @typedef {{ all?: boolean, machine?: string | null, kind?: string | null, branch?: string | null, commit?: string | null, tool?: string | null, scenario?: string | null, world?: string | null, since?: string | null }} EntryFilter */
/** @typedef {{ blobs: number, entries: number, known: number, removed: number, errors: string[], removable: { blobs: string[], entries: string[] } }} SpoolReport */

const KINDS = new Set(['play', 'bench', 'harness', 'ci', 'save']);
const ID = /^(\d{4})(\d{2})\d{2}T\d{6}Z-[a-z0-9-]+-[0-9a-f]{6}$/;

/** @type {Map<string, number>} */
const held = new Map();
const pause = new Int32Array(new SharedArrayBuffer(4));

/** @param {string} lock */
function holder(lock) {
  try {
    return Number(readFileSync(lock, 'utf8')) || null;
  } catch {
    return null;
  }
}

/** @param {number} pid */
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return /** @type {NodeJS.ErrnoException} */ (err).code === 'EPERM';
  }
}

/** @param {string} root @param {number} waitMs */
function acquire(root, waitMs) {
  mkdirSync(root, { recursive: true });
  const lock = join(root, '.lock');
  const until = Date.now() + waitMs;
  for (;;) {
    try {
      const fd = openSync(lock, 'wx');
      writeFileSync(fd, String(process.pid));
      closeSync(fd);
      return lock;
    } catch (err) {
      if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'EEXIST') throw err;
    }
    const pid = holder(lock);
    if (pid != null && !alive(pid)) {
      rmSync(lock, { force: true });
      continue;
    }
    if (Date.now() >= until) throw new Error(`the store is held by process ${pid ?? '?'}`);
    Atomics.wait(pause, 0, 0, 200);
  }
}

/** @param {NodeJS.ProcessEnv} [env] */
export function lockWaitMs(env = process.env) {
  return Number(env.F4X_LEDGER_LOCK_WAIT_MS ?? 20 * 60_000);
}

/**
 * @template T
 * @param {string} root @param {() => T} fn @param {{ waitMs?: number }} [options]
 * @returns {T}
 */
export function withLock(root, fn, { waitMs = lockWaitMs() } = {}) {
  const depth = held.get(root) ?? 0;
  if (depth === 0) acquire(root, waitMs);
  held.set(root, depth + 1);
  const release = () => {
    const left = (held.get(root) ?? 0) - 1;
    if (left > 0) return held.set(root, left);
    held.delete(root);
    rmSync(join(root, '.lock'), { force: true });
  };
  try {
    const out = fn();
    if (out instanceof Promise) return /** @type {T} */ (out.finally(release));
    release();
    return out;
  } catch (err) {
    release();
    throw err;
  }
}

/** @param {NodeJS.ProcessEnv} [env] */
export function storeDir(env = process.env) {
  return env.F4X_LEDGER_DIR || join(homedir(), '.local', 'share', 'fantasia4x-ledger');
}

/** @param {string} root */
export function isLiveStore(root) {
  return resolve(root) === resolve(storeDir({}));
}

/** @param {string} root @param {Buffer | string} bufferOrPath */
export function putBlob(root, bufferOrPath) {
  return writeBlobAt(root, bufferOrPath);
}

/** @param {string} root @param {string} sha */
export function hasBlob(root, sha) {
  return existsSync(blobPath(root, sha));
}

/** @param {string} root @param {string} sha */
export function readBlob(root, sha) {
  const data = readFileSync(blobPath(root, sha));
  if (sha256Of(data) !== sha) throw new Error(`blob ${sha} does not match its hash`);
  return data;
}

/** @param {string} root @param {string} sha */
export function verifyBlob(root, sha) {
  try {
    readBlob(root, sha);
    return true;
  } catch {
    return false;
  }
}

/** @param {string} root @param {string} id */
function entryPath(root, id) {
  const m = ID.exec(id);
  if (!m) throw new Error(`not an entry id: ${id}`);
  return join(root, 'entries', `${m[1]}-${m[2]}`, `${id}.json`);
}

/** @param {NewEntry} entry @param {string} root @param {{ deferred?: boolean }} [options] */
export function checkEntry(entry, root, { deferred = false } = {}) {
  if (entry.v !== 1) throw new Error(`entry ${entry.id}: v must be 1`);
  if (!ID.test(entry.id ?? '')) throw new Error(`entry id ${entry.id} is not <stamp>-<machine>-<hex>`);
  if (!KINDS.has(entry.kind)) throw new Error(`entry ${entry.id}: kind ${entry.kind} is not one of ${[...KINDS]}`);
  if (entry.invalid !== undefined && (!Array.isArray(entry.invalid) || entry.invalid.some((r) => typeof r !== 'string' || !r)))
    throw new Error(`entry ${entry.id}: invalid must be a list of reasons`);
  for (const f of entry.files ?? []) {
    if (deferred && /^[0-9a-f]{64}$/.test(f.sha256 ?? '')) continue;
    if (!hasBlob(root, f.sha256)) throw new Error(`entry ${entry.id}: file ${f.name} has no blob ${f.sha256}`);
  }
  if (entry.supersedes !== undefined && (entry.supersedes === entry.id || !ID.test(entry.supersedes ?? '') || !entryExists(root, entry.supersedes)))
    throw new Error(`entry ${entry.id}: supersedes ${entry.supersedes}, which is not another entry in the store`);
}

/** @param {string} root @param {string} id */
export function entryExists(root, id) {
  return existsSync(entryPath(root, id));
}

/** @param {string} root @param {NewEntry} entry @param {{ deferred?: boolean }} [opts] */
export function putEntry(root, entry, opts = {}) {
  return withLock(root, () => {
    checkEntry(entry, root, opts);
    const text = JSON.stringify(entry, null, 2) + '\n';
    writeOnce(entryPath(root, entry.id), text);
    appendFileSync(join(root, 'index.jsonl'), JSON.stringify(entry) + '\n');
    return entry.id;
  });
}

/** @param {string} root @param {string} id @returns {Entry} */
export function getEntry(root, id) {
  return JSON.parse(readFileSync(entryPath(root, id), 'utf8'));
}

/** @param {string} root */
function* entryFiles(root) {
  const dir = join(root, 'entries');
  if (!existsSync(dir)) return;
  for (const month of readdirSync(dir).sort()) {
    for (const f of readdirSync(join(dir, month)).sort()) {
      if (f.endsWith('.json')) yield join(dir, month, f);
    }
  }
}

/** @param {string} root */
export function reindex(root) {
  return withLock(root, () => rebuildIndex(root));
}

/** @param {string} root */
function rebuildIndex(root) {
  /** @type {string[]} */
  const lines = [];
  for (const f of entryFiles(root)) lines.push(JSON.stringify(JSON.parse(readFileSync(f, 'utf8'))));
  const index = join(root, 'index.jsonl');
  mkdirSync(root, { recursive: true });
  writeFileSync(`${index}.tmp-${process.pid}`, lines.map((l) => l + '\n').join(''));
  renameSync(`${index}.tmp-${process.pid}`, index);
  return lines.length;
}

/** @param {string} root @returns {Entry[]} */
export function allEntries(root) {
  const index = join(root, 'index.jsonl');
  if (!existsSync(index)) reindex(root);
  /** @type {Map<string, Entry>} */
  const seen = new Map();
  for (const line of readFileSync(index, 'utf8').split('\n')) {
    if (!line) continue;
    /** @type {Entry} */
    const e = JSON.parse(line);
    seen.set(e.id, e);
  }
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** @param {unknown} value @param {unknown} wanted */
const matches = (value, wanted) =>
  wanted == null || (value != null && String(value).toLowerCase().includes(String(wanted).toLowerCase()));

/** @param {Pick<Entry, 'id' | 'supersedes'>[]} entries @returns {Map<string, string>} */
export function supersededBy(entries) {
  return new Map(entries.flatMap((e) => (e.supersedes ? [[e.supersedes, e.id]] : [])));
}

/** @param {string} root @param {EntryFilter} [f] */
export function listEntries(root, f = {}) {
  const every = allEntries(root);
  const replaced = supersededBy(every);
  const all = f.all ? every : every.filter((e) => !replaced.has(e.id));
  const world = f.world;
  const worldSaves = world == null ? [] : all.filter((e) => e.kind === 'save' && (e.world?.save ?? '').startsWith(world));
  const savedFrom = new Set(worldSaves.map((e) => e.parent).filter(Boolean));
  const captures = new Set(worldSaves.map((e) => e.captureId ?? e.world?.captureId).filter(Boolean));
  return all.filter(
    (e) =>
      (f.machine == null || e.machine === f.machine) &&
      (f.kind == null || e.kind === f.kind) &&
      (f.branch == null || matches(e.branch, f.branch) || matches(e.refs, f.branch)) &&
      (f.commit == null || (e.commit ?? '').startsWith(f.commit)) &&
      matches(f.tool && e.tool, f.tool) &&
      matches(f.scenario && e.scenario, f.scenario) &&
      (world == null ||
        (e.world?.save ?? '').startsWith(world) ||
        savedFrom.has(e.id) ||
        (e.perf?.checkpoints ?? []).some((c) => (c.save ?? '').startsWith(world) || captures.has(c.capture))) &&
      (f.since == null || (e.at ?? '') >= f.since)
  );
}

/** @param {string} root @param {string} key */
function keyPath(root, key) {
  const sha = sha256Of(key);
  return join(root, 'keys', sha.slice(0, 2), sha);
}

/** @param {string} root @param {string} key @returns {string | null} */
export function keyedEntry(root, key) {
  const p = keyPath(root, key);
  return existsSync(p) ? readFileSync(p, 'utf8').trim() : null;
}

/** @param {string} root @param {string} key @param {string} id */
export function rememberKey(root, key, id) {
  return withLock(root, () => {
    if (keyedEntry(root, key)) return false;
    writeOnce(keyPath(root, key), id + '\n');
    return true;
  });
}

/** @param {string} root @param {string} key @param {NewEntry} entry @returns {{ id: string, created: boolean }} */
export function putKeyed(root, key, entry) {
  return withLock(root, () => {
    const existing = keyedEntry(root, key);
    if (existing) return { id: existing, created: false };
    const halfWritten = entryExists(root, entry.id);
    if (halfWritten) appendFileSync(join(root, 'index.jsonl'), JSON.stringify(getEntry(root, entry.id)) + '\n');
    else putEntry(root, entry);
    writeOnce(keyPath(root, key), entry.id + '\n');
    return { id: entry.id, created: !halfWritten };
  });
}

/** @param {string} root @param {string} spool @param {{ remove?: boolean, deferred?: boolean }} [options] @returns {SpoolReport} */
export function ingestSpool(root, spool, { remove = false, deferred = false } = {}) {
  /** @type {SpoolReport} */
  const report = { blobs: 0, entries: 0, known: 0, removed: 0, errors: [], removable: { blobs: [], entries: [] } };
  const blobsDir = join(spool, 'blobs');
  /** @type {string[]} */
  const held = [];
  if (existsSync(blobsDir)) {
    for (const aa of readdirSync(blobsDir)) {
      for (const name of readdirSync(join(blobsDir, aa))) {
        const src = join(blobsDir, aa, name);
        if (!/^[0-9a-f]{64}$/.test(name)) continue;
        const data = readFileSync(src);
        if (sha256Of(data) !== name) {
          report.errors.push(`spool blob ${name} does not match its hash; left in the spool`);
          continue;
        }
        if (!hasBlob(root, name)) {
          putBlob(root, data);
          report.blobs++;
        }
        if (verifyBlob(root, name)) held.push(src);
      }
    }
  }
  const entriesDir = join(spool, 'entries');
  /** @type {string[]} */
  const done = [];
  if (existsSync(entriesDir)) {
    for (const f of readdirSync(entriesDir).filter((n) => n.endsWith('.json')).sort()) {
      const src = join(entriesDir, f);
      /** @type {Entry} */
      let entry;
      try {
        entry = JSON.parse(readFileSync(src, 'utf8'));
      } catch (err) {
        report.errors.push(`spool entry ${f} is not JSON: ${/** @type {Error} */ (err).message}`);
        continue;
      }
      try {
        if (entryExists(root, entry.id)) {
          if (JSON.stringify(getEntry(root, entry.id)) !== JSON.stringify(entry)) {
            report.errors.push(`spool entry ${entry.id} differs from the stored one; left in the spool`);
            continue;
          }
          report.known++;
        } else {
          putEntry(root, entry, { deferred });
          report.entries++;
        }
        done.push(src);
      } catch (err) {
        report.errors.push(`spool entry ${f}: ${/** @type {Error} */ (err).message}`);
      }
    }
  }
  report.removable = { blobs: held, entries: done };
  if (remove) {
    for (const p of [...done, ...held]) {
      rmSync(p, { force: true });
      report.removed++;
    }
  }
  return report;
}

/** @param {string} root @param {Pick<Entry, 'files'>} entry */
export function missingBlobs(root, entry) {
  return (entry.files ?? []).filter((f) => !hasBlob(root, f.sha256));
}

/** @param {string} root @param {string} sha */
export function blobSize(root, sha) {
  return statSync(blobPath(root, sha)).size;
}
