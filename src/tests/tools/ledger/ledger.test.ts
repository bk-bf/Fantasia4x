import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import {
  writeBlob,
  writeEntry,
  newId,
  machineName,
  launchedBy,
  blobPath
} from '../../../../tools/ledger/spool.mjs';
import {
  putEntry,
  getEntry,
  listEntries,
  reindex,
  ingestSpool,
  readBlob,
  verifyBlob
} from '../../../../tools/ledger/store.mjs';
import { splitSessions, sessionPerf } from '../../../../tools/ledger/perflog.mjs';
import { ingestPerfLog, ingestResult, ingestSave } from '../../../../tools/ledger/ingest.mjs';
import { LIVE } from '../../../../tools/ledger/sync.mjs';
import { resolveSave, assembleSave } from '../../../../tools/ledger/fetch.mjs';

const SESSION_A =
  '2026-11-27 01:37:35.743 [T30058] [info] session build=detached@a96826d3 refs=origin/refactor/gpu-layer,origin/test/look-overhaul dirty=0 version=0.1.247 mode=debug serverStarted=2026-11-27T00:37:22.532Z shell=electron renderer=painted query=- switches=- gpu="ANGLE (Intel, Mesa Intel(R) Arc(tm) Graphics (MTL), OpenGL ES 3.2)" window=1440x870@2 screen=1440x900 cores=22 memoryGb=16 map=750x750 pawns=5 mobs=1280 buildings=0 drops=13 jobs=2 turn=30058 speed=1x power=Charging profile=performance governor=powersave load=1.20/1.00/0.90 freeGb=4.1/15.3';
const SESSION_B =
  '2026-11-27 14:48:43.414 [T06000] [info] session build=detached@8ee98b78 refs=origin/refactor/gpu-layer-webgpu-shape dirty=0 version=0.1.247 mode=debug serverStarted=2026-11-27T13:39:06.787Z shell=electron renderer=painted query=- switches=- gpu="ANGLE" window=1440x870@2 screen=1440x900 cores=22 memoryGb=16 map=750x750 pawns=5 mobs=1259 buildings=0 drops=0 jobs=0 turn=6000 speed=1x';
const tps = (stamp: string, turn: number, value: number, speed: string, paused = false) =>
  `2026-11-27 ${stamp} [T${String(turn).padStart(5, '0')}] [info] tps=${value} speed=${speed} pawns=5 mobs=1280 | zoom=64.0px paused=${paused} speed=${speed} map=750x750 pawns=5 mobs=1280 day=1 hour=16.1 season=spring weather=clear`;
const fps = (stamp: string, turn: number, value: number) =>
  `2026-11-27 ${stamp} [T${turn}] [info] render fps=${value} frameAvg=8.3ms frameMax=9.4ms terrain=0.10ms overlay=0.20ms rebuilds=0 resourceRebuilds=0 draws=11 verts=279582 mobs=1280 pawns=5 | zoom=64.0px paused=false speed=4x map=750x750 pawns=5 mobs=1280 day=1 hour=16.1 season=spring weather=clear`;

const LOG = [
  '[T06060] [info] tps=60 speed=1x pawns=5 mobs=61',
  '[T06121] [info] tps=61 speed=1x pawns=5 mobs=61',
  SESSION_A,
  '2026-11-27 01:37:36.000 [T30058] [info] ledger save=start0000 reason=session turn=30058 at=2026-11-27T00:37:35.900Z ms=800 speed=1x bytes=100 entry=20261127T003735Z-laptop-aaaaaa',
  tps('01:37:36.749', 30058, 0, '1x', true),
  tps('01:38:00.100', 30100, 100, '4x'),
  tps('01:38:01.100', 30340, 90, '4x'),
  fps('01:38:01.100', 30340, 92),
  '2026-11-27 01:38:02.000 [T30500] [info] ledger save=aaaa1111 reason=periodic turn=30500 at=2026-11-27T00:38:00.500Z ms=1500 speed=4x bytes=100 entry=20261127T003800Z-laptop-bbbbbb',
  tps('01:38:02.100', 30560, 5, '4x'),
  tps('01:38:03.100', 30800, 6, '4x'),
  tps('01:38:04.100', 31040, 70, '4x'),
  tps('01:38:05.100', 31280, 72, '4x'),
  '2026-11-27 01:38:06.000 host power=Discharging profile=low-power governor=powersave',
  '2026-11-27 01:38:07.000 [T31600] [info] ledger failed reason=periodic turn=31550 at=2026-11-27T00:38:06.000Z ms=900 speed=4x bytes=100 error="spool full"',
  tps('01:38:07.050', 31590, 3, '4x'),
  '2026-11-27 01:38:07.500 [T31600] [info] ledger save=bbbb2222 reason=periodic turn=31600 at=2026-11-27T00:38:07.300Z ms=200 speed=4x bytes=100 entry=20261127T003807Z-laptop-cccccc',
  tps('01:38:08.100', 31700, 4, '4x'),
  tps('01:38:09.100', 31940, 200, '4x'),
  '=== log reset at 2026-11-27T00:40:00.000Z (exceeded 16777216 bytes) ===',
  tps('01:40:01.100', 40000, 61, '1x'),
  SESSION_B,
  tps('14:48:44.414', 6060, 60, '1x')
].join('\n');

interface Stats {
  median: number;
  p10: number;
  p90: number;
  n: number;
}
interface Session {
  start: { type: string; at: number };
}
interface Perf {
  header: Record<string, unknown> & { host: Record<string, unknown> };
  save: string;
  host: { load: number[]; cores: number; power: string; freeGb: string };
  perf: {
    checkpoints: { save: string; turn: number }[];
    stretches: { from: Record<string, unknown>; tps: Record<string, Stats> }[];
    speed: string;
    fps: Stats;
  };
}
interface Entry {
  id: string;
  at: string;
  files: { sha256: string }[];
  world: Record<string, unknown>;
  perf: Record<string, unknown>;
  host: Record<string, unknown>;
}
const sessionsOf = (text: string) => splitSessions(text, 'Europe/Berlin') as unknown as Session[];
const perfOf = (i: number) => sessionPerf(splitSessions(LOG, 'Europe/Berlin')[i]) as unknown as Perf;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ledger-test-'));
});

describe('spool', () => {
  it('stores a blob once under the sha256 of its bytes', () => {
    const spool = join(dir, 'spool');
    const a = writeBlob(Buffer.from('hello'), spool);
    expect(a).toBe(createHash('sha256').update('hello').digest('hex'));
    expect(writeBlob(Buffer.from('hello'), spool)).toBe(a);
    const path = join(dir, 'f.txt');
    writeFileSync(path, 'hello');
    expect(writeBlob(path, spool)).toBe(a);
    expect(readdirSync(join(spool, 'blobs', a.slice(0, 2)))).toEqual([a]);
  });

  it('writes an entry once and fills its id and recording time', () => {
    const spool = join(dir, 'spool');
    const id = writeEntry({ kind: 'bench', machine: 'desktop', at: '2026-11-27T10:00:00Z' }, spool);
    expect(id).toMatch(/^20261127T100000Z-desktop-[0-9a-f]{6}$/);
    const entry = JSON.parse(readFileSync(join(spool, 'entries', `${id}.json`), 'utf8'));
    expect(entry.v).toBe(1);
    expect(entry.recordedAt).toBeTruthy();
    expect(() => writeEntry({ id, kind: 'bench', machine: 'desktop' }, spool)).toThrow(/refusing to overwrite/);
  });

  it('names the machines by hostname and the launcher by environment', () => {
    expect(machineName({}, 'cachyos-x8664')).toBe('laptop');
    expect(machineName({}, 'cachyos-x8664-desktop')).toBe('desktop');
    expect(machineName({}, 'ubuntuserver')).toBe('ubuntuserver');
    expect(launchedBy({}).who).toBe('owner');
    expect(launchedBy({ T3CODE_THREAD_ID: 't' }).who).toBe('agent');
    expect(launchedBy({ CLAUDE_CODE_SESSION_ID: 's' })).toMatchObject({ who: 'agent', session: 's', thread: null });
    expect(launchedBy({ GITHUB_ACTIONS: 'true', GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '2', GITHUB_JOB: 'tps' })).toEqual({
      who: 'ci',
      session: null,
      thread: null,
      ciRunId: 42,
      ciJob: 'tps',
      ciAttempt: 2
    });
    expect(newId('laptop', new Date('2026-01-02T03:04:05Z'))).toMatch(/^20260102T030405Z-laptop-[0-9a-f]{6}$/);
  });
});

describe('store', () => {
  const entry = (id: string, files: unknown[] = []) => ({ v: 1, id, kind: 'play', machine: 'laptop', files });

  it('refuses to overwrite an entry and to store one whose files it lacks', () => {
    const id = newId('laptop', new Date('2026-11-27T00:00:00Z'));
    putEntry(dir, entry(id));
    expect(getEntry(dir, id).id).toBe(id);
    expect(() => putEntry(dir, entry(id))).toThrow(/refusing to overwrite/);
    const missing = 'a'.repeat(64);
    expect(() => putEntry(dir, entry(newId('laptop'), [{ role: 'log', name: 'x', sha256: missing, bytes: 1 }]))).toThrow(/no blob/);
  });

  it('ingests a spool only where each blob matches its hash, then clears what it holds', () => {
    const spool = join(dir, 'spool');
    const store = join(dir, 'store');
    const good = writeBlob(Buffer.from('good'), spool);
    const bad = writeBlob(Buffer.from('bad'), spool);
    writeFileSync(blobPath(spool, bad), 'tampered');
    const id = writeEntry(
      { kind: 'bench', machine: 'desktop', files: [{ role: 'result', name: 'r.json', sha256: good, bytes: 4 }] },
      spool
    );
    const report = ingestSpool(store, spool, { remove: true });
    expect(report.entries).toBe(1);
    expect(report.errors.join()).toMatch(/does not match/);
    expect(verifyBlob(store, good)).toBe(true);
    expect(existsSync(blobPath(store, bad))).toBe(false);
    expect(existsSync(blobPath(spool, good))).toBe(false);
    expect(existsSync(blobPath(spool, bad))).toBe(true);
    expect(getEntry(store, id).files[0].sha256).toBe(good);
    expect(readBlob(store, good).toString()).toBe('good');
    expect((listEntries(store, { machine: 'desktop' }) as unknown as Entry[]).map((e) => e.id)).toEqual([id]);
    expect(reindex(store)).toBe(1);
  });
});

describe('perf.log sessions', () => {
  it('splits at each session line and log reset and keeps the lines before the first', () => {
    const sessions = sessionsOf(LOG);
    expect(sessions.map((s) => s.start.type)).toEqual(['tps', 'session', 'reset', 'session']);
    expect(new Date(sessions[1].start.at).toISOString()).toBe('2026-11-27T00:37:35.743Z');
  });

  it('reads the build and world from the session line and TPS per stretch between checkpoints', () => {
    const { header, perf, host, save } = perfOf(1);
    expect(header).toMatchObject({ branch: null, commit: 'a96826d3', map: '750x750', pawns: 5, mobs: 1280, turn: 30058, renderer: 'painted' });
    expect(header.host).toMatchObject({ power: 'Charging', freeGb: '4.1/15.3' });
    expect(perf.checkpoints.map((c) => [c.save, c.turn])).toEqual([
      ['start0000', 30058],
      ['aaaa1111', 30500],
      ['bbbb2222', 31600]
    ]);
    expect(save).toBe('start0000');
    expect(perf.stretches.map((s) => s.tps['4x'])).toEqual([
      undefined,
      { median: 100, p10: 90, p90: 100, n: 2 },
      { median: 72, p10: 70, p90: 72, n: 2 },
      { median: 200, p10: 200, p90: 200, n: 1 }
    ]);
    expect(perf.stretches[2].from).toMatchObject({ save: 'aaaa1111', turn: 30500 });
    expect(perf.speed).toBe('4x');
    expect(perf.fps.median).toBe(92);
    expect(host).toMatchObject({ load: [1.2, 1, 0.9], cores: 22, power: 'Discharging', freeGb: '4.1/15.3' });
  });

  it('treats a log with no capture lines as a session with no checkpoints', () => {
    const { perf } = perfOf(3);
    expect(perf.checkpoints).toEqual([]);
    expect(perf.stretches).toEqual([]);
  });

  it('re-ingests the same log without new entries and leaves an open session for later', () => {
    const log = join(dir, 'perf.log');
    writeFileSync(log, LOG + '\n');
    const opts = { machine: 'laptop', checkout: 'Documents/local/Projects/Fantasia4x', paths: [log], timeZone: 'Europe/Berlin' };
    const lastLine = Date.parse('2026-11-27T13:48:44.414Z');
    const first = ingestPerfLog(dir, { ...opts, now: lastLine + 60_000 });
    expect(first).toMatchObject({ created: 3, open: 1 });
    const again = ingestPerfLog(dir, { ...opts, now: lastLine + 60_000 });
    expect(again).toMatchObject({ created: 0, known: 3, open: 1 });
    const later = ingestPerfLog(dir, { ...opts, now: lastLine + 2 * 3600_000 });
    expect(later).toMatchObject({ created: 1, known: 3 });
    const plays = listEntries(dir, { kind: 'play' }) as unknown as Entry[];
    expect(plays).toHaveLength(4);
    expect(listEntries(dir, { world: 'bbbb' })).toHaveLength(1);
    const a = plays.find((e) => e.at === '2026-11-27T00:37:35.743Z');
    expect(a!.host).toMatchObject({ load: [1.2, 1, 0.9], loadEnd: null, cores: 22, others: null });
    expect(a!.world.save).toBe('start0000');
    expect(readBlob(dir, a!.files[0].sha256).toString().split('\n')[0]).toBe(SESSION_A);
  });
});

describe('saves', () => {
  it('links a save to the session it was written in', () => {
    const log = join(dir, 'perf.log');
    writeFileSync(log, LOG + '\n');
    ingestPerfLog(dir, { machine: 'laptop', checkout: 'c', paths: [log], timeZone: 'Europe/Berlin', now: Date.parse('2026-11-28T00:00:00Z') });
    const session = (listEntries(dir, { kind: 'play' }) as unknown as Entry[]).find((e) => e.at === '2026-11-27T00:37:35.743Z');
    const text = JSON.stringify({ dynamic: { turn: 31800, pawns: [], mobs: [] }, world: Array.from({ length: 750 }, () => Array(750).fill(0)) });
    const path = join(dir, 'end.json.gz');
    writeFileSync(path, gzipSync(text));
    const saved = ingestSave(dir, { machine: 'laptop', path, at: Date.parse('2026-11-27T00:42:00Z') });
    expect(getEntry(dir, saved.id).parent).toBe(session!.id);
    const early = join(dir, 'early.json.gz');
    writeFileSync(early, gzipSync(text.replace('31800', '31801')));
    expect(getEntry(dir, ingestSave(dir, { machine: 'laptop', path: early, at: Date.parse('2026-11-26T00:00:00Z') }).id).parent).toBeNull();
    expect((listEntries(dir, { world: saved.worldId.slice(0, 12) }) as unknown as Entry[]).map((e) => e.id)).toContain(session!.id);
  });

  it('keys a save by its uncompressed JSON and fetches it back', () => {
    const text = JSON.stringify({ dynamic: { turn: 30058, seed: 7, pawns: [{}], mobs: [{}, {}] }, world: [[{}, {}, {}], [{}, {}, {}]] });
    const path = join(dir, 'save.json.gz');
    writeFileSync(path, gzipSync(text, { level: 1 }));
    utimesSync(path, new Date('2026-11-27T01:00:00Z'), new Date('2026-11-27T01:00:00Z'));
    const first = ingestSave(dir, { machine: 'laptop', path });
    expect(first.worldId).toBe(createHash('sha256').update(text).digest('hex'));
    writeFileSync(path, gzipSync(text, { level: 9 }));
    expect(ingestSave(dir, { machine: 'laptop', path })).toMatchObject({ id: first.id, created: false });
    const save = resolveSave(dir, first.worldId.slice(0, 10));
    expect(save.world).toMatchObject({ turn: 30058, seed: 7, map: '3x2', pawns: 1, mobs: 2 });
    expect(resolveSave(dir, first.id).id).toBe(first.id);
    expect(assembleSave(dir, save).length).toBeGreaterThan(0);
  });

  it('takes the start counts from the save and keeps the result counts as the end', () => {
    const old = join(dir, 'old.json');
    writeFileSync(old, JSON.stringify({ scenario: 'owner-save', pawns: 5, mobs: 1274, turn: 17736, tps: 40 }));
    const from = { turn: 17136, pawns: 5, mobs: 1259 };
    const a = getEntry(dir, ingestResult(dir, { machine: 'desktop', path: old, saveWorld: from }).id) as unknown as Entry;
    expect(a.world).toMatchObject(from);
    expect(a.perf).toMatchObject({ endPawns: 5, endMobs: 1274 });
    expect(a.host).toEqual({ load: null, loadEnd: null, cores: null, others: null });
    const fresh = join(dir, 'new.json');
    const host = { load: [0.5, 0.4, 0.3], loadEnd: [1, 1, 1], cores: 16, others: [] };
    writeFileSync(fresh, JSON.stringify({ scenario: 'owner-save', pawns: 5, mobs: 1259, turn: 17136, endPawns: 4, endMobs: 1200, host }));
    const b = getEntry(dir, ingestResult(dir, { machine: 'desktop', path: fresh, saveWorld: { turn: 1, pawns: 1, mobs: 1 } }).id) as unknown as Entry;
    expect(b.world).toMatchObject({ turn: 17136, pawns: 5, mobs: 1259 });
    expect(b.perf).toMatchObject({ endPawns: 4, endMobs: 1200 });
    expect(b.host).toEqual(host);
  });
});

describe('sync', () => {
  it('reads perf.log and its rotated names as the live log and keeps older copies apart', () => {
    for (const n of ['perf.log', 'perf.log.1', 'perf.log.20261127T003735Z', 'perf.log.20261127T003735Z-2']) expect(LIVE.test(n)).toBe(true);
    for (const n of ['perf.log.kept-0a1b2c3d4e5f', 'perf.log.kept-012345678901', 'perf.log.bak', 'perf.log.20261127T0037Z']) expect(LIVE.test(n)).toBe(false);
  });
});
