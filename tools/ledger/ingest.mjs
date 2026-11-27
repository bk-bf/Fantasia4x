// @ts-nocheck
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { fileRef, newId, sha256Of, worldId as worldIdOfSnapshot } from './spool.mjs';
import { isOpen, ledgerSession, sessionPerf, sessionTimes, splitSessions } from './perflog.mjs';
import { allEntries, getEntry, keyedEntry, putBlob, putKeyed, rememberKey } from './store.mjs';
import { withInvalid } from './invalid.mjs';

const REPO = new URL('../..', import.meta.url).pathname;
const expanded = new Map();

export function fullCommit(short, repo = REPO) {
  if (!short || !/^[0-9a-f]{7,40}$/.test(short)) return short ?? null;
  if (short.length === 40) return short;
  if (!expanded.has(short)) {
    let full = short;
    try {
      full = execFileSync('git', ['-C', repo, 'rev-parse', '--verify', '--quiet', `${short}^{commit}`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim();
    } catch {
      full = short;
    }
    expanded.set(short, full || short);
  }
  return expanded.get(short);
}

export function nobody(who = null) {
  return { who, session: null, thread: null, ciRunId: null, ciJob: null, ciAttempt: null };
}

function sessionKey(machine, checkout, session) {
  const start = session.start.stamp
    ? `${session.start.type}@${session.start.stamp}|T${session.start.turn ?? '-'}`
    : `unstamped:${sha256Of(session.lines.slice(0, 200).map((l) => l.raw).join('\n'))}`;
  return `perf.log|${machine}|${checkout}|${start}`;
}

export const captureOf = (e) => e.captureId ?? e.world?.captureId ?? null;

export function capturesOf(root, machine, token) {
  return allEntries(root)
    .filter((e) => e.kind === 'save' && e.machine === machine && (captureOf(e) ?? '').startsWith(`${token}-`))
    .map((e) => ({
      save: e.world?.save ?? null,
      capture: captureOf(e),
      reason: e.perf?.capture?.reason ?? null,
      turn: e.world?.turn ?? null,
      at: e.at ?? null,
      ms: e.perf?.capture?.ms ?? 0,
      entry: e.id
    }));
}

export function captureIndex(root) {
  const out = new Map();
  for (const e of allEntries(root)) if (e.kind === 'save' && captureOf(e)) out.set(captureOf(e), { save: e.world?.save ?? null, entry: e.id });
  return out;
}

function coveredLines(root, key, firstId) {
  let to = getEntry(root, firstId).perf?.lines?.to;
  if (to == null) return null;
  for (let next = keyedEntry(root, `${key}|from:${to}`); next; next = keyedEntry(root, `${key}|from:${to}`)) {
    to = getEntry(root, next).perf.lines.to;
  }
  return to;
}

export function concatLogs(paths) {
  const ordered = [...paths].sort((a, b) => {
    const rank = (p) => (basename(p) === 'perf.log' ? 1 : 0);
    return rank(a) - rank(b) || statSync(a).mtimeMs - statSync(b).mtimeMs || b.localeCompare(a);
  });
  return {
    text: ordered.map((p) => readFileSync(p, 'utf8')).map((t) => (t.endsWith('\n') || !t ? t : t + '\n')).join(''),
    mtime: Math.max(...ordered.map((p) => statSync(p).mtimeMs))
  };
}

export function ingestPerfLog(root, opts) {
  const { machine, checkout, paths, timeZone, who = null, now = Date.now(), note = '' } = opts;
  const { text, mtime } = concatLogs(paths);
  const sessions = splitSessions(text, timeZone);
  const report = { created: 0, known: 0, open: 0, ids: [] };
  let captures = null;
  const resolve = (cap) => {
    captures ??= captureIndex(root);
    return captures.get(cap) ?? null;
  };
  for (const session of sessions) {
    const key = sessionKey(machine, checkout, session);
    const first = keyedEntry(root, key);
    let from = 0;
    let entryKey = key;
    if (first) {
      from = coveredLines(root, key, first);
      if (from == null || from >= session.lines.length) {
        report.known++;
        continue;
      }
      entryKey = `${key}|from:${from}`;
    }
    if (isOpen(session, now, mtime)) {
      report.open++;
      continue;
    }
    const part = from ? { ...session, lines: session.lines.slice(from) } : session;
    const { start, end } = from ? sessionTimes({ start: part.lines.find((l) => l.at != null) ?? part.lines[0], lines: part.lines }) : sessionTimes(session);
    const token = ledgerSession(session);
    const spooled = token
      ? capturesOf(root, machine, token).filter((c) => {
          const t = Date.parse(c.at ?? '');
          if (Number.isNaN(t)) return !from;
          return (start == null || !from || t >= start) && (end == null || t <= end + 60_000);
        })
      : [];
    const { header, perf, host, save } = sessionPerf(part, resolve, spooled);
    const body = Buffer.from(part.lines.map((l) => l.raw).join('\n') + '\n');
    const sha = putBlob(root, body);
    const notes = [note];
    if (from) notes.push(`lines ${from + 1}–${session.lines.length} of a session whose first ${from} lines are in ${first}, written after that entry was made`);
    if (!header) {
      notes.push(
        session.start.type === 'reset'
          ? 'starts at a log reset; the session line before it was lost, so the build is unknown'
          : 'no session line; the build and the world are unknown'
      );
    }
    if (start == null) notes.push('the log lines carry no timestamps');
    const entry = {
      v: 1,
      id: newId(machine, start ?? mtime, entryKey),
      kind: 'play',
      at: start == null ? null : new Date(start).toISOString(),
      recordedAt: new Date().toISOString(),
      launchedBy: nobody(who),
      machine,
      branch: header?.branch ?? null,
      commit: fullCommit(header?.commit ?? null),
      dirty: header?.dirty ?? null,
      refs: header?.refs ?? null,
      tool: 'perf.log',
      scenario: null,
      world: {
        save,
        name: null,
        turn: header?.turn ?? null,
        seed: null,
        map: header?.map ?? null,
        pawns: header?.pawns ?? null,
        mobs: header?.mobs ?? null,
        generatedBy: null,
        savedBy: null
      },
      host,
      perf: { ...perf, end: end == null ? null : new Date(end).toISOString(), checkout, lines: { from, to: session.lines.length } },
      files: [fileRef('perf-log', 'perf.log', sha, root)],
      parent: first ?? null,
      note: notes.filter(Boolean).join('; ')
    };
    const r = putKeyed(root, entryKey, entry);
    if (r.created) {
      report.created++;
      report.ids.push(r.id);
    } else report.known++;
  }
  return report;
}

const commitOf = (stamp) => (stamp == null ? null : typeof stamp === 'string' ? stamp : stamp.commit ?? null);

export const noHost = () => ({ load: null, loadEnd: null, cores: null, others: null });

export function describeSave(textOrSave) {
  const save = typeof textOrSave === 'string' || Buffer.isBuffer(textOrSave) ? JSON.parse(textOrSave) : textOrSave;
  const dynamic = save.dynamic ?? {};
  const world = save.world ?? save.dynamic?.worldMap ?? null;
  return {
    seed: dynamic.seed ?? null,
    turn: dynamic.turn ?? null,
    name: dynamic.culture?.name ?? null,
    pawns: Array.isArray(dynamic.pawns) ? dynamic.pawns.length : null,
    mobs: Array.isArray(dynamic.mobs) ? dynamic.mobs.length : null,
    map: Array.isArray(world) && Array.isArray(world[0]) ? `${world[0].length}x${world.length}` : null,
    generatedBy: commitOf(dynamic.generatedBy ?? save.generatedBy),
    savedBy: commitOf(dynamic.savedBy ?? save.savedBy)
  };
}

export function worldIdOf(gzOrText) {
  const text = Buffer.isBuffer(gzOrText) && gzOrText[0] === 0x1f && gzOrText[1] === 0x8b ? gunzipSync(gzOrText) : gzOrText;
  return worldIdOfSnapshot(JSON.parse(text));
}

export function ingestSave(root, opts) {
  const { machine, who = null, at = null, name = null, note = '', fileName } = opts;
  let gz = opts.data ?? readFileSync(opts.path);
  const isGz = gz[0] === 0x1f && gz[1] === 0x8b;
  const text = isGz ? gunzipSync(gz) : gz;
  if (!isGz) gz = gzipSync(text);
  const bytesKey = `save-bytes|${sha256Of(text)}`;
  const seen = keyedEntry(root, bytesKey);
  if (seen) return { id: seen, worldId: getEntry(root, seen).world.save, created: false };
  const snapshot = JSON.parse(text);
  const worldId = worldIdOfSnapshot(snapshot);
  const key = `save|${worldId}`;
  const known = keyedEntry(root, key);
  if (known) {
    rememberKey(root, bytesKey, known);
    return { id: known, worldId, created: false };
  }
  const info = describeSave(snapshot);
  const amended = opts.amend?.(worldId, info) ?? {};
  const sha = putBlob(root, gz);
  const when = at ?? (opts.path ? statSync(opts.path).mtimeMs : Date.now());
  const parent = opts.parent !== undefined ? opts.parent : sessionFor(root, machine, info, at);
  const entry = {
    v: 1,
    id: newId(machine, when, key),
    kind: 'save',
    at: new Date(when).toISOString(),
    recordedAt: new Date().toISOString(),
    launchedBy: nobody(who),
    machine,
    branch: amended.branch ?? opts.branch ?? null,
    commit: fullCommit(amended.commit ?? opts.commit ?? null),
    dirty: opts.dirty ?? null,
    refs: opts.refs ?? null,
    tool: opts.tool ?? null,
    scenario: 'save',
    world: { save: worldId, ...info, name: name ?? info.name },
    host: noHost(),
    perf: null,
    files: [fileRef('save', fileName ?? (opts.path ? basename(opts.path) : `${worldId.slice(0, 12)}.json.gz`), sha, root)],
    parent,
    note: [note, ...(amended.notes ?? [])].filter(Boolean).join('; ')
  };
  const r = putKeyed(root, key, entry);
  rememberKey(root, bytesKey, r.id);
  return { id: r.id, worldId, created: r.created };
}

export function sessionFor(root, machine, info, savedAt) {
  if (info.turn == null) return null;
  const hits = allEntries(root).filter((e) => {
    if (e.kind !== 'play' || e.machine !== machine || !e.perf?.turns || !e.world?.map) return false;
    if (info.map && e.world.map !== info.map) return false;
    if (info.turn < e.perf.turns.first || info.turn > e.perf.turns.last) return false;
    if (savedAt == null) return true;
    if (!e.at || !e.perf.end) return false;
    return Date.parse(e.at) <= savedAt && savedAt <= Date.parse(e.perf.end) + 10 * 60_000;
  });
  return hits.length === 1 || (savedAt != null && hits.length) ? hits.sort((a, b) => b.at.localeCompare(a.at))[0].id : null;
}

export function saveEntryFor(root, worldId) {
  return allEntries(root).find((e) => e.kind === 'save' && e.world?.save === worldId) ?? null;
}

export function harnessPerf(result) {
  const perf = { tool: result.speed != null ? 'loop' : 'tick' };
  if (result.tps != null) {
    perf.tps = { median: result.tps, p10: null, p90: null, n: result.ticks ?? null };
    perf.speed = result.speed != null ? `${result.speed}x` : null;
    perf.targetTps = result.targetTps ?? null;
    perf.tickMsMean = result.tickMsMean ?? null;
    perf.busyShare = result.busyShare ?? null;
    perf.seconds = result.seconds ?? null;
  } else {
    perf.tps = result.uncappedTps != null ? { median: result.uncappedTps, p10: null, p90: null, n: result.measured ?? null } : null;
    perf.speed = 'uncapped';
    perf.tick = result.tick ?? null;
    perf.warm = result.warm ?? null;
    perf.measured = result.measured ?? null;
    perf.buildMs = result.buildMs ?? null;
  }
  if (result.gc) perf.gc = result.gc;
  if (result.heapMB) perf.heapMB = result.heapMB;
  return perf;
}

export function ingestResult(root, opts) {
  const { machine, path, kind = 'harness', tool = 'tick-harness', who = null, key, note = '' } = opts;
  const k = key ?? `result|${machine}|${sha256Of(readFileSync(path))}`;
  const known = keyedEntry(root, k);
  if (known) return { id: known, created: false };
  const result = JSON.parse(readFileSync(path, 'utf8'));
  const sha = putBlob(root, path);
  const extra = (opts.files ?? []).map((f) => fileRef(f.role, f.name ?? basename(f.path), putBlob(root, f.path), root));
  const map = Array.isArray(result.map) ? result.map.join('x') : result.map ?? null;
  const at = opts.at ?? statSync(path).mtimeMs;
  const startCounts = result.endMobs !== undefined || result.endPawns !== undefined;
  const from = opts.saveWorld ?? null;
  const entry = {
    v: 1,
    id: newId(machine, at, k),
    kind,
    at: new Date(at).toISOString(),
    recordedAt: new Date().toISOString(),
    launchedBy: opts.launchedBy ?? nobody(who),
    machine,
    branch: opts.branch ?? null,
    commit: opts.commit ?? null,
    dirty: opts.dirty ?? null,
    refs: opts.refs ?? null,
    tool,
    scenario: opts.scenario ?? result.scenario ?? null,
    world: {
      save: opts.worldId ?? null,
      name: null,
      turn: startCounts ? result.turn ?? null : from?.turn ?? null,
      seed: result.seed ?? null,
      map,
      pawns: startCounts ? result.pawns ?? null : from?.pawns ?? null,
      mobs: startCounts ? result.mobs ?? null : from?.mobs ?? null,
      generatedBy: opts.generatedBy ?? null,
      savedBy: null
    },
    host: result.host ?? noHost(),
    perf: {
      ...harnessPerf(result),
      endPawns: startCounts ? result.endPawns ?? null : result.pawns ?? null,
      endMobs: startCounts ? result.endMobs ?? null : result.mobs ?? null,
      ...(opts.perf ?? {})
    },
    files: [fileRef('result', basename(path), sha, root), ...extra],
    parent: opts.parent ?? null,
    note
  };
  const r = putKeyed(root, k, withInvalid(entry));
  return { id: r.id, created: r.created };
}

export function ingestBench(root, opts) {
  const { machine, path, tool = null, who = null, note = '', siblings = [] } = opts;
  const k = opts.key ?? `bench|${machine}|${sha256Of(readFileSync(path))}`;
  const known = keyedEntry(root, k);
  if (known) return { id: known, created: false };
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const at = opts.at ?? statSync(path).mtimeMs;
  const map = data.map ? (Array.isArray(data.map) ? data.map.join('x') : data.map) : null;
  const role = (n) => (n.endsWith('.cpuprofile') ? 'profile' : n.endsWith('.png') || n.endsWith('.json') ? 'result' : 'log');
  const entry = {
    v: 1,
    id: newId(machine, at, k),
    kind: 'bench',
    at: new Date(at).toISOString(),
    recordedAt: new Date().toISOString(),
    launchedBy: opts.launchedBy ?? nobody(who),
    machine,
    branch: opts.branch ?? null,
    commit: opts.commit ?? null,
    dirty: opts.dirty ?? null,
    refs: opts.refs ?? null,
    tool,
    scenario: Array.isArray(data) ? null : data.scenario ?? null,
    world: { save: opts.worldId ?? null, name: null, turn: null, seed: null, map, pawns: null, mobs: null, generatedBy: null, savedBy: null },
    host: data.host ?? noHost(),
    perf: Array.isArray(data) ? { rows: data } : data,
    files: [
      fileRef('result', basename(path), putBlob(root, path), root),
      ...siblings.map((p) => fileRef(role(basename(p)), basename(p), putBlob(root, p), root))
    ],
    parent: opts.parent ?? null,
    note
  };
  if (opts.invalid?.length) entry.invalid = opts.invalid;
  const r = putKeyed(root, k, withInvalid(entry));
  return { id: r.id, created: r.created, invalid: r.created ? (withInvalid(entry).invalid ?? []) : null };
}
