// @ts-nocheck
import { readFileSync, statSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import { fileRef, newId, sha256Of } from './spool.mjs';
import { getEntry, keyedEntry, putBlob, putKeyed, withLock } from './store.mjs';
import { fullCommit, noHost, nobody } from './ingest.mjs';
import { recheckInvalid } from './invalid.mjs';

const FIXED = ['v', 'id', 'files', 'supersedes', 'recordedAt'];

const roleOf = (name) =>
  name.endsWith('.cpuprofile') ? 'profile' : /\.(png|json)$/.test(name) ? 'result' : 'log';

const blank = (machine) => ({
  v: 1,
  kind: 'bench',
  at: null,
  launchedBy: nobody(null),
  machine,
  branch: null,
  commit: null,
  dirty: null,
  refs: null,
  tool: null,
  scenario: null,
  world: {
    save: null,
    name: null,
    turn: null,
    seed: null,
    map: null,
    pawns: null,
    mobs: null,
    generatedBy: null,
    savedBy: null
  },
  host: noHost(),
  perf: {},
  files: [],
  parent: null,
  note: ''
});

function attributeOne(root, item, base = process.cwd()) {
  const set = item.set ?? {};
  const fixed = FIXED.filter((k) => k in set);
  if (fixed.length) throw new Error(`set cannot change ${fixed.join(', ')}`);
  const old = item.supersedes ? getEntry(root, item.supersedes) : null;
  const machine = set.machine ?? old?.machine;
  if (!machine) throw new Error('a new entry needs set.machine');
  const added = (item.files ?? []).map((f) => {
    const path = isAbsolute(f.path) ? f.path : join(base, f.path);
    return { role: f.role, name: f.name ?? basename(path), path };
  });
  if (!old && !added.length) throw new Error('a new entry needs files');
  const key = old
    ? `supersede|${old.id}`
    : `attribute|${machine}|${sha256Of(added.map((f) => sha256Of(readFileSync(f.path))).join(','))}`;
  const known = keyedEntry(root, key);
  if (known) return { id: known, created: false };
  const was = old ?? blank(machine);
  const at =
    set.at ??
    was.at ??
    new Date(Math.min(...added.map((f) => statSync(f.path).mtimeMs))).toISOString();
  const entry = recheckInvalid({
    ...was,
    ...set,
    at,
    launchedBy: { ...was.launchedBy, ...(set.launchedBy ?? {}) },
    world: { ...was.world, ...(set.world ?? {}) },
    perf: { ...was.perf, ...(set.perf ?? {}) },
    commit: fullCommit(set.commit === undefined ? was.commit : set.commit),
    id: newId(machine, at, key),
    recordedAt: new Date().toISOString(),
    files: [
      ...was.files,
      ...added.map((f) => fileRef(f.role ?? roleOf(f.name), f.name, putBlob(root, f.path), root))
    ],
    note: [was.note, item.note].filter(Boolean).join('; '),
    ...(old ? { supersedes: old.id } : {})
  });
  return putKeyed(root, key, entry);
}

export function attribute(root, items, base = process.cwd()) {
  return withLock(root, () =>
    items.map((item) => ({
      supersedes: item.supersedes ?? null,
      ...attributeOne(root, item, base)
    }))
  );
}
