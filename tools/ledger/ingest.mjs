import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { fileRef, newId, sha256Of, worldId as worldIdOfSnapshot } from './spool.mjs';
import { isOpen, ledgerSession, sessionPerf, sessionTimes, splitSessions } from './perflog.mjs';
import { allEntries, getEntry, keyedEntry, putBlob, putKeyed, rememberKey } from './store.mjs';
import { withInvalid } from './invalid.mjs';

/** @typedef {import('./store.mjs').Entry} Entry */
/** @typedef {import('./store.mjs').World} World */
/** @typedef {import('./store.mjs').Perf} Perf */
/** @typedef {import('./store.mjs').LaunchedBy} LaunchedBy */
/** @typedef {import('./perflog.mjs').Session} Session */
/** @typedef {import('./perflog.mjs').LogCheckpoint} LogCheckpoint */
/** @typedef {ReturnType<typeof describeSave>} SaveInfo */
/** @typedef {{ branch?: string | null, commit?: string | null, dirty?: number | boolean | null, refs?: string | null }} Tree */
/** @typedef {{ seed?: number | string, turn?: number, culture?: { name?: string }, pawns?: unknown, mobs?: unknown, worldMap?: unknown, generatedBy?: Stamp, savedBy?: Stamp }} Dynamic */
/** @typedef {string | { commit?: string | null } | null} Stamp */
/** @typedef {{ dynamic?: Dynamic, world?: unknown, generatedBy?: Stamp, savedBy?: Stamp }} Snapshot */
/**
 * @typedef {{
 *   speed?: number | null, tps?: number | null, ticks?: number, targetTps?: number, tickMsMean?: number, busyShare?: number,
 *   seconds?: number, uncappedTps?: number | null, measured?: number, tick?: unknown, warm?: unknown, buildMs?: number,
 *   gc?: unknown, heapMB?: unknown, map?: number[] | string | null, endMobs?: number, endPawns?: number, scenario?: string,
 *   turn?: number, seed?: number | string, pawns?: number, mobs?: number, host?: import('./store.mjs').Host
 * }} HarnessResult
 */

const REPO = new URL('../..', import.meta.url).pathname;
/** @type {Map<string, string>} */
const expanded = new Map();

/** @param {string | null | undefined} short @param {string} [repo] @returns {string | null} */
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
  return expanded.get(short) ?? short;
}

/** @param {string | null} [who] @returns {LaunchedBy} */
export function nobody(who = null) {
  return { who, session: null, thread: null, ciRunId: null, ciJob: null, ciAttempt: null };
}

/** @param {string} machine @param {string} checkout @param {Session} session */
function sessionKey(machine, checkout, session) {
  const start = session.start.stamp
    ? `${session.start.type}@${session.start.stamp}|T${session.start.turn ?? '-'}`
    : `unstamped:${sha256Of(session.lines.slice(0, 200).map((l) => l.raw).join('\n'))}`;
  return `perf.log|${machine}|${checkout}|${start}`;
}

/** @param {Pick<Entry, 'captureId' | 'world'>} e */
export const captureOf = (e) => e.captureId ?? e.world?.captureId ?? null;

/** @param {string} root @param {string} machine @param {string} token @returns {LogCheckpoint[]} */
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

/** @param {string} root */
export function captureIndex(root) {
  /** @type {Map<string, { save: string | null, entry: string }>} */
  const out = new Map();
  for (const e of allEntries(root)) {
    const capture = e.kind === 'save' ? captureOf(e) : null;
    if (capture) out.set(capture, { save: e.world?.save ?? null, entry: e.id });
  }
  return out;
}

/** @param {string} root @param {string} key @param {string} firstId @returns {number | null} */
function coveredLines(root, key, firstId) {
  let to = getEntry(root, firstId).perf?.lines?.to;
  if (to == null) return null;
  for (let next = keyedEntry(root, `${key}|from:${to}`); next; next = keyedEntry(root, `${key}|from:${to}`)) {
    const lines = getEntry(root, next).perf?.lines;
    if (!lines) throw new Error(`entry ${next} records no line range`);
    to = lines.to;
  }
  return to;
}

/** @param {string[]} paths */
export function concatLogs(paths) {
  const ordered = [...paths].sort((a, b) => {
    /** @param {string} p */
    const rank = (p) => (basename(p) === 'perf.log' ? 1 : 0);
    return rank(a) - rank(b) || statSync(a).mtimeMs - statSync(b).mtimeMs || b.localeCompare(a);
  });
  return {
    text: ordered.map((p) => readFileSync(p, 'utf8')).map((t) => (t.endsWith('\n') || !t ? t : t + '\n')).join(''),
    mtime: Math.max(...ordered.map((p) => statSync(p).mtimeMs))
  };
}

/**
 * @param {string} root
 * @param {{ machine: string, checkout: string, paths: string[], timeZone?: string | null, who?: string | null, now?: number, note?: string }} opts
 */
export function ingestPerfLog(root, opts) {
  const { machine, checkout, paths, timeZone, who = null, now = Date.now(), note = '' } = opts;
  const { text, mtime } = concatLogs(paths);
  const sessions = splitSessions(text, timeZone);
  /** @type {{ created: number, known: number, open: number, ids: string[] }} */
  const report = { created: 0, known: 0, open: 0, ids: [] };
  /** @type {ReturnType<typeof captureIndex> | null} */
  let captures = null;
  /** @param {string} cap */
  const resolve = (cap) => {
    captures ??= captureIndex(root);
    return captures.get(cap) ?? null;
  };
  for (const session of sessions) {
    const key = sessionKey(machine, checkout, session);
    const first = keyedEntry(root, key);
    /** @type {number | null} */
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
    /** @type {Entry} */
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

/** @param {Stamp | undefined} stamp */
const commitOf = (stamp) => (stamp == null ? null : typeof stamp === 'string' ? stamp : stamp.commit ?? null);

export const noHost = () => ({ load: null, loadEnd: null, cores: null, others: null });

/** @param {string | Buffer | Snapshot} textOrSave */
export function describeSave(textOrSave) {
  /** @type {Snapshot} */
  const save = typeof textOrSave === 'string' || Buffer.isBuffer(textOrSave) ? JSON.parse(String(textOrSave)) : textOrSave;
  /** @type {Dynamic} */
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

/** @param {Buffer | string} gzOrText */
export function worldIdOf(gzOrText) {
  const text = Buffer.isBuffer(gzOrText) && gzOrText[0] === 0x1f && gzOrText[1] === 0x8b ? gunzipSync(gzOrText) : gzOrText;
  return worldIdOfSnapshot(JSON.parse(String(text)));
}

/**
 * @param {string} root
 * @param {Tree & { machine: string, who?: string | null, at?: number | null, name?: string | null, note?: string, fileName?: string, data?: Buffer, path?: string, parent?: string | null, tool?: string | null, amend?: (worldId: string, info: SaveInfo) => { branch?: string | null, commit?: string | null, notes?: string[] } | null | undefined }} opts
 */
export function ingestSave(root, opts) {
  const { machine, who = null, at = null, name = null, note = '', fileName } = opts;
  if (!opts.data && !opts.path) throw new Error('ingestSave needs data or a path');
  let gz = opts.data ?? readFileSync(/** @type {string} */ (opts.path));
  const isGz = gz[0] === 0x1f && gz[1] === 0x8b;
  const text = isGz ? gunzipSync(gz) : gz;
  if (!isGz) gz = gzipSync(text);
  const bytesKey = `save-bytes|${sha256Of(text)}`;
  const seen = keyedEntry(root, bytesKey);
  if (seen) return { id: seen, worldId: getEntry(root, seen).world.save ?? null, created: false };
  /** @type {Snapshot} */
  const snapshot = JSON.parse(String(text));
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
  /** @type {Entry} */
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

/** @param {string} root @param {string} machine @param {Pick<SaveInfo, 'turn' | 'map'>} info @param {number | null | undefined} savedAt @returns {string | null} */
export function sessionFor(root, machine, info, savedAt) {
  const turn = info.turn;
  if (turn == null) return null;
  const hits = allEntries(root).filter((e) => {
    if (e.kind !== 'play' || e.machine !== machine || !e.perf?.turns || !e.world?.map) return false;
    if (info.map && e.world.map !== info.map) return false;
    if (turn < e.perf.turns.first || turn > e.perf.turns.last) return false;
    if (savedAt == null) return true;
    if (!e.at || !e.perf.end) return false;
    return Date.parse(e.at) <= savedAt && savedAt <= Date.parse(e.perf.end) + 10 * 60_000;
  });
  return hits.length === 1 || (savedAt != null && hits.length) ? hits.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))[0].id : null;
}

/** @param {string} root @param {string} worldId */
export function saveEntryFor(root, worldId) {
  return allEntries(root).find((e) => e.kind === 'save' && e.world?.save === worldId) ?? null;
}

/** @param {HarnessResult} result @returns {Perf} */
export function harnessPerf(result) {
  /** @type {Perf} */
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

/**
 * @param {string} root
 * @param {Tree & { machine: string, path: string, kind?: string, tool?: string, who?: string | null, key?: string, note?: string, files?: { role: string, name?: string, path: string }[], at?: number, saveWorld?: Partial<Pick<World, 'turn' | 'pawns' | 'mobs'>> | null, launchedBy?: LaunchedBy, scenario?: string | null, worldId?: string | null, generatedBy?: string | null, perf?: Perf, parent?: string | null }} opts
 */
export function ingestResult(root, opts) {
  const { machine, path, kind = 'harness', tool = 'tick-harness', who = null, key, note = '' } = opts;
  const k = key ?? `result|${machine}|${sha256Of(readFileSync(path))}`;
  const known = keyedEntry(root, k);
  if (known) return { id: known, created: false };
  /** @type {HarnessResult} */
  const result = JSON.parse(readFileSync(path, 'utf8'));
  const sha = putBlob(root, path);
  const extra = (opts.files ?? []).map((f) => fileRef(f.role, f.name ?? basename(f.path), putBlob(root, f.path), root));
  const map = Array.isArray(result.map) ? result.map.join('x') : result.map ?? null;
  const at = opts.at ?? statSync(path).mtimeMs;
  const startCounts = result.endMobs !== undefined || result.endPawns !== undefined;
  const from = opts.saveWorld ?? null;
  /** @type {Entry} */
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

/**
 * @param {string} root
 * @param {Tree & { machine: string, path: string, tool?: string | null, who?: string | null, note?: string, siblings?: string[], key?: string, at?: number, launchedBy?: LaunchedBy, worldId?: string | null, parent?: string | null, invalid?: string[] }} opts
 */
export function ingestBench(root, opts) {
  const { machine, path, tool = null, who = null, note = '', siblings = [] } = opts;
  const k = opts.key ?? `bench|${machine}|${sha256Of(readFileSync(path))}`;
  const known = keyedEntry(root, k);
  if (known) return { id: known, created: false };
  /** @type {unknown[] | (Perf & { map?: number[] | string, scenario?: string, host?: import('./store.mjs').Host })} */
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const at = opts.at ?? statSync(path).mtimeMs;
  const shown = Array.isArray(data) ? null : data;
  const map = shown?.map ? (Array.isArray(shown.map) ? shown.map.join('x') : shown.map) : null;
  /** @param {string} n */
  const role = (n) => (n.endsWith('.cpuprofile') ? 'profile' : n.endsWith('.png') || n.endsWith('.json') ? 'result' : 'log');
  /** @type {Entry} */
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
    scenario: shown?.scenario ?? null,
    world: { save: opts.worldId ?? null, name: null, turn: null, seed: null, map, pawns: null, mobs: null, generatedBy: null, savedBy: null },
    host: shown?.host ?? noHost(),
    perf: shown ?? { rows: data },
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
