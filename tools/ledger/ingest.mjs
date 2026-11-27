import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { fileRef, newId, sha256Of } from './spool.mjs';
import { isOpen, sessionPerf, sessionTimes, splitSessions } from './perflog.mjs';
import { allEntries, keyedEntry, putBlob, putKeyed } from './store.mjs';

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
    ? `${session.start.type}@${session.start.stamp}`
    : `unstamped:${sha256Of(session.lines.slice(0, 200).map((l) => l.raw).join('\n'))}`;
  return `perf.log|${machine}|${checkout}|${start}`;
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
  for (const session of sessions) {
    const key = sessionKey(machine, checkout, session);
    if (keyedEntry(root, key)) {
      report.known++;
      continue;
    }
    if (isOpen(session, now, mtime)) {
      report.open++;
      continue;
    }
    const { header, perf } = sessionPerf(session);
    const { start } = sessionTimes(session);
    const body = Buffer.from(session.lines.map((l) => l.raw).join('\n') + '\n');
    const sha = putBlob(root, body);
    const notes = [note];
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
      id: newId(machine, start ?? mtime),
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
        save: header?.save ?? null,
        name: null,
        turn: header?.turn ?? null,
        seed: null,
        map: header?.map ?? null,
        pawns: header?.pawns ?? null,
        mobs: header?.mobs ?? null,
        generatedBy: null,
        savedBy: null
      },
      perf: { ...perf, checkout },
      files: [fileRef('perf-log', 'perf.log', sha, root)],
      parent: null,
      note: notes.filter(Boolean).join('; ')
    };
    const r = putKeyed(root, key, entry);
    if (r.created) {
      report.created++;
      report.ids.push(r.id);
    } else report.known++;
  }
  return report;
}

export function describeSave(text) {
  const save = JSON.parse(text);
  const dynamic = save.dynamic ?? {};
  const world = save.world ?? save.dynamic?.worldMap ?? null;
  return {
    seed: dynamic.seed ?? null,
    turn: dynamic.turn ?? null,
    name: dynamic.culture?.name ?? null,
    pawns: Array.isArray(dynamic.pawns) ? dynamic.pawns.length : null,
    mobs: Array.isArray(dynamic.mobs) ? dynamic.mobs.length : null,
    map: Array.isArray(world) && Array.isArray(world[0]) ? `${world[0].length}x${world.length}` : null,
    generatedBy: dynamic.generatedBy ?? save.generatedBy ?? null,
    savedBy: dynamic.savedBy ?? save.savedBy ?? null
  };
}

export function worldIdOf(gzOrText) {
  const text = Buffer.isBuffer(gzOrText) && gzOrText[0] === 0x1f && gzOrText[1] === 0x8b ? gunzipSync(gzOrText) : gzOrText;
  return sha256Of(text);
}

export function ingestSave(root, opts) {
  const { machine, who = null, at = null, name = null, note = '', fileName } = opts;
  let gz = opts.data ?? readFileSync(opts.path);
  const isGz = gz[0] === 0x1f && gz[1] === 0x8b;
  const text = isGz ? gunzipSync(gz) : gz;
  if (!isGz) gz = gzipSync(text);
  const worldId = sha256Of(text);
  const key = `save|${worldId}`;
  const known = keyedEntry(root, key);
  if (known) return { id: known, worldId, created: false };
  const info = describeSave(text.toString('utf8'));
  const sha = putBlob(root, gz);
  const when = at ?? (opts.path ? statSync(opts.path).mtimeMs : Date.now());
  const parent = opts.parent !== undefined ? opts.parent : sessionFor(root, machine, info, at);
  const entry = {
    v: 1,
    id: newId(machine, when),
    kind: 'save',
    at: new Date(when).toISOString(),
    recordedAt: new Date().toISOString(),
    launchedBy: nobody(who),
    machine,
    branch: opts.branch ?? null,
    commit: opts.commit ?? null,
    dirty: opts.dirty ?? null,
    refs: opts.refs ?? null,
    tool: opts.tool ?? null,
    scenario: 'save',
    world: { save: worldId, ...info, name: name ?? info.name },
    perf: null,
    files: [fileRef('save', fileName ?? (opts.path ? basename(opts.path) : `${worldId.slice(0, 12)}.json.gz`), sha, root)],
    parent,
    note
  };
  const r = putKeyed(root, key, entry);
  return { id: r.id, worldId, created: r.created };
}

export function sessionFor(root, machine, info, savedAt) {
  if (info.turn == null) return null;
  const hits = allEntries(root).filter((e) => {
    if (e.kind !== 'play' || e.machine !== machine || !e.perf?.turns) return false;
    if (info.map && e.world?.map && e.world.map !== info.map) return false;
    if (info.turn < e.perf.turns.first || info.turn > e.perf.turns.last + 600) return false;
    if (savedAt == null || !e.at) return true;
    return Date.parse(e.at) <= savedAt;
  });
  if (!hits.length) return null;
  return hits.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))[0].id;
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
  const entry = {
    v: 1,
    id: newId(machine, at),
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
      turn: result.turn ?? null,
      seed: result.seed ?? null,
      map,
      pawns: result.pawns ?? null,
      mobs: result.mobs ?? null,
      generatedBy: opts.generatedBy ?? null,
      savedBy: null
    },
    perf: { ...harnessPerf(result), ...(opts.perf ?? {}) },
    files: [fileRef('result', basename(path), sha, root), ...extra],
    parent: opts.parent ?? null,
    note
  };
  const r = putKeyed(root, k, entry);
  return { id: r.id, created: r.created };
}
