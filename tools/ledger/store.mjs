// @ts-nocheck
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
import { join } from 'node:path';
import { blobPath, sha256Of, writeBlobAt, writeOnce } from './spool.mjs';

const KINDS = new Set(['play', 'bench', 'harness', 'ci', 'save']);
const ID = /^(\d{4})(\d{2})\d{2}T\d{6}Z-[a-z0-9-]+-[0-9a-f]{6}$/;

const held = new Map();
const pause = new Int32Array(new SharedArrayBuffer(4));

function holder(lock) {
  try {
    return Number(readFileSync(lock, 'utf8')) || null;
  } catch {
    return null;
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

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
      if (err.code !== 'EEXIST') throw err;
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

export function lockWaitMs(env = process.env) {
  return Number(env.F4X_LEDGER_LOCK_WAIT_MS ?? 20 * 60_000);
}

export function withLock(root, fn, { waitMs = lockWaitMs() } = {}) {
  const depth = held.get(root) ?? 0;
  if (depth === 0) acquire(root, waitMs);
  held.set(root, depth + 1);
  const release = () => {
    const left = held.get(root) - 1;
    if (left > 0) return held.set(root, left);
    held.delete(root);
    rmSync(join(root, '.lock'), { force: true });
  };
  try {
    const out = fn();
    if (out && typeof out.then === 'function') return out.finally(release);
    release();
    return out;
  } catch (err) {
    release();
    throw err;
  }
}

export function storeDir(env = process.env) {
  return env.F4X_LEDGER_DIR || join(homedir(), '.local', 'share', 'fantasia4x-ledger');
}

export function putBlob(root, bufferOrPath) {
  return writeBlobAt(root, bufferOrPath);
}

export function hasBlob(root, sha) {
  return existsSync(blobPath(root, sha));
}

export function readBlob(root, sha) {
  const data = readFileSync(blobPath(root, sha));
  if (sha256Of(data) !== sha) throw new Error(`blob ${sha} does not match its hash`);
  return data;
}

export function verifyBlob(root, sha) {
  try {
    readBlob(root, sha);
    return true;
  } catch {
    return false;
  }
}

function entryPath(root, id) {
  const m = ID.exec(id);
  if (!m) throw new Error(`not an entry id: ${id}`);
  return join(root, 'entries', `${m[1]}-${m[2]}`, `${id}.json`);
}

export function checkEntry(entry, root) {
  if (entry.v !== 1) throw new Error(`entry ${entry.id}: v must be 1`);
  if (!ID.test(entry.id ?? '')) throw new Error(`entry id ${entry.id} is not <stamp>-<machine>-<hex>`);
  if (!KINDS.has(entry.kind)) throw new Error(`entry ${entry.id}: kind ${entry.kind} is not one of ${[...KINDS]}`);
  if (entry.invalid !== undefined && (!Array.isArray(entry.invalid) || entry.invalid.some((r) => typeof r !== 'string' || !r)))
    throw new Error(`entry ${entry.id}: invalid must be a list of reasons`);
  for (const f of entry.files ?? []) {
    if (!hasBlob(root, f.sha256)) throw new Error(`entry ${entry.id}: file ${f.name} has no blob ${f.sha256}`);
  }
}

export function entryExists(root, id) {
  return existsSync(entryPath(root, id));
}

export function putEntry(root, entry) {
  return withLock(root, () => {
    checkEntry(entry, root);
    const text = JSON.stringify(entry, null, 2) + '\n';
    writeOnce(entryPath(root, entry.id), text);
    appendFileSync(join(root, 'index.jsonl'), JSON.stringify(entry) + '\n');
    return entry.id;
  });
}

export function getEntry(root, id) {
  return JSON.parse(readFileSync(entryPath(root, id), 'utf8'));
}

function* entryFiles(root) {
  const dir = join(root, 'entries');
  if (!existsSync(dir)) return;
  for (const month of readdirSync(dir).sort()) {
    for (const f of readdirSync(join(dir, month)).sort()) {
      if (f.endsWith('.json')) yield join(dir, month, f);
    }
  }
}

export function reindex(root) {
  return withLock(root, () => rebuildIndex(root));
}

function rebuildIndex(root) {
  const lines = [];
  for (const f of entryFiles(root)) lines.push(JSON.stringify(JSON.parse(readFileSync(f, 'utf8'))));
  const index = join(root, 'index.jsonl');
  mkdirSync(root, { recursive: true });
  writeFileSync(`${index}.tmp-${process.pid}`, lines.map((l) => l + '\n').join(''));
  renameSync(`${index}.tmp-${process.pid}`, index);
  return lines.length;
}

export function allEntries(root) {
  const index = join(root, 'index.jsonl');
  if (!existsSync(index)) reindex(root);
  const seen = new Map();
  for (const line of readFileSync(index, 'utf8').split('\n')) {
    if (!line) continue;
    const e = JSON.parse(line);
    seen.set(e.id, e);
  }
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
}

const matches = (value, wanted) =>
  wanted == null || (value != null && String(value).toLowerCase().includes(String(wanted).toLowerCase()));

export function listEntries(root, f = {}) {
  const all = allEntries(root);
  const worldSaves = f.world == null ? [] : all.filter((e) => e.kind === 'save' && (e.world?.save ?? '').startsWith(f.world));
  const savedFrom = new Set(worldSaves.filter((e) => e.parent).map((e) => e.parent));
  const captures = new Set(worldSaves.map((e) => e.captureId ?? e.world?.captureId).filter(Boolean));
  return all.filter(
    (e) =>
      (f.machine == null || e.machine === f.machine) &&
      (f.kind == null || e.kind === f.kind) &&
      (f.branch == null || matches(e.branch, f.branch) || matches(e.refs, f.branch)) &&
      (f.commit == null || (e.commit ?? '').startsWith(f.commit)) &&
      matches(f.tool && e.tool, f.tool) &&
      matches(f.scenario && e.scenario, f.scenario) &&
      (f.world == null ||
        (e.world?.save ?? '').startsWith(f.world) ||
        savedFrom.has(e.id) ||
        (e.perf?.checkpoints ?? []).some((c) => (c.save ?? '').startsWith(f.world) || captures.has(c.capture))) &&
      (f.since == null || (e.at ?? '') >= f.since)
  );
}

function keyPath(root, key) {
  const sha = sha256Of(key);
  return join(root, 'keys', sha.slice(0, 2), sha);
}

export function keyedEntry(root, key) {
  const p = keyPath(root, key);
  return existsSync(p) ? readFileSync(p, 'utf8').trim() : null;
}

export function putKeyed(root, key, entry) {
  return withLock(root, () => {
    const existing = keyedEntry(root, key);
    if (existing) return { id: existing, created: false };
    putEntry(root, entry);
    writeOnce(keyPath(root, key), entry.id + '\n');
    return { id: entry.id, created: true };
  });
}

export function ingestSpool(root, spool, { remove = false } = {}) {
  const report = { blobs: 0, entries: 0, known: 0, removed: 0, errors: [] };
  const blobsDir = join(spool, 'blobs');
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
  const done = [];
  if (existsSync(entriesDir)) {
    for (const f of readdirSync(entriesDir).filter((n) => n.endsWith('.json')).sort()) {
      const src = join(entriesDir, f);
      let entry;
      try {
        entry = JSON.parse(readFileSync(src, 'utf8'));
      } catch (err) {
        report.errors.push(`spool entry ${f} is not JSON: ${err.message}`);
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
          putEntry(root, entry);
          report.entries++;
        }
        done.push(src);
      } catch (err) {
        report.errors.push(`spool entry ${f}: ${err.message}`);
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

export function blobSize(root, sha) {
  return statSync(blobPath(root, sha)).size;
}
