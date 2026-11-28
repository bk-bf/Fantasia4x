import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, utimesSync, rmSync } from 'node:fs';
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
  blobPath,
  worldId,
  storedBlobs
} from '../../../../tools/ledger/spool.mjs';
import {
  putEntry,
  getEntry,
  listEntries,
  reindex,
  ingestSpool,
  readBlob,
  verifyBlob,
  keyedEntry,
  putKeyed,
  hasBlob,
  missingBlobs
} from '../../../../tools/ledger/store.mjs';
import { splitSessions, sessionPerf } from '../../../../tools/ledger/perflog.mjs';
import { ingestBench, ingestPerfLog, ingestResult, ingestSave } from '../../../../tools/ledger/ingest.mjs';
import { LIVE, SPOOL, blobMoves, fetchBlob, lastMoveTime, mirror, pullMachine } from '../../../../tools/ledger/sync.mjs';
import { invalidReasons, withInvalid } from '../../../../tools/ledger/invalid.mjs';
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
  '2026-11-27 01:37:36.800 [T00000] [info] capCache hit=0 miss=12',
  tps('01:38:00.100', 30100, 100, '4x'),
  tps('01:38:01.100', 30340, 90, '4x'),
  fps('01:38:01.100', 30340, 92),
  '2026-11-27 01:38:01.300 [T30500] [info] ledger capture=on interval=120s',
  '2026-11-27 01:38:03.000 [T30500] [info] ledger save=aaaa1111 reason=periodic turn=30500 at=2026-11-27T00:38:01.200Z ms=1800 speed=4x bytes=100 entry=20261127T003800Z-laptop-bbbbbb',
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
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
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

  it('waits for the store lock while a live process holds it and takes it from a dead one', () => {
    process.env.F4X_LEDGER_LOCK_WAIT_MS = '300';
    try {
      writeFileSync(join(dir, '.lock'), String(process.ppid));
      const started = Date.now();
      expect(() => putEntry(dir, entry(newId('laptop')))).toThrow(/held by process/);
      expect(Date.now() - started).toBeGreaterThanOrEqual(250);
      expect(() => reindex(dir)).toThrow(/held by process/);
      writeFileSync(join(dir, '.lock'), '2147483646');
      const id = newId('laptop');
      putEntry(dir, entry(id));
      expect(existsSync(join(dir, '.lock'))).toBe(false);
      expect(reindex(dir)).toBe(1);
      expect(listEntries(dir).map((e) => e.id)).toEqual([id]);
    } finally {
      delete process.env.F4X_LEDGER_LOCK_WAIT_MS;
    }
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
    expect((perf as unknown as { turns: unknown }).turns).toEqual({ first: 30058, last: 31940 });
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

  it('keeps two session lines written in the same millisecond as two sessions', () => {
    const log = join(dir, 'perf.log');
    const reloaded = SESSION_B.replace('[T06000]', '[T00000]');
    writeFileSync(log, [SESSION_B, reloaded, tps('14:48:44.414', 60, 60, '1x')].join('\n') + '\n');
    const r = ingestPerfLog(dir, { machine: 'laptop', checkout: 'c', paths: [log], timeZone: 'Europe/Berlin', now: Date.parse('2026-11-28T00:00:00Z') });
    expect(r).toMatchObject({ created: 2, known: 0 });
    const plays = listEntries(dir, { kind: 'play' }) as unknown as (Entry & { parent: string | null })[];
    expect(plays.map((e) => [e.perf.lines, e.parent])).toEqual(
      expect.arrayContaining([
        [{ from: 0, to: 1 }, null],
        [{ from: 0, to: 2 }, null]
      ])
    );
  });

  it('reads a session line written twice in a row as one session', () => {
    const log = join(dir, 'perf.log');
    writeFileSync(log, [SESSION_B, SESSION_B, tps('14:48:44.414', 6060, 60, '1x')].join('\n') + '\n');
    const r = ingestPerfLog(dir, { machine: 'laptop', checkout: 'c', paths: [log], timeZone: 'Europe/Berlin', now: Date.parse('2026-11-28T00:00:00Z') });
    expect(r).toMatchObject({ created: 1, known: 0 });
    const plays = listEntries(dir, { kind: 'play' }) as unknown as (Entry & { parent: string | null })[];
    expect(plays.map((e) => [e.perf.lines, e.parent])).toEqual([[{ from: 0, to: 2 }, null]]);
  });

  it('records lines written after a session closed as a continuation of its entry', () => {
    const log = join(dir, 'perf.log');
    const head = [SESSION_B, tps('14:48:44.414', 6060, 60, '1x')];
    writeFileSync(log, head.join('\n') + '\n');
    const opts = { machine: 'laptop', checkout: 'c', paths: [log], timeZone: 'Europe/Berlin' };
    const closed = Date.parse('2026-11-27T16:00:00Z');
    expect(ingestPerfLog(dir, { ...opts, now: closed })).toMatchObject({ created: 1 });
    const late = [tps('17:20:00.000', 6100, 58, '1x'), tps('17:20:01.000', 6160, 59, '1x')];
    writeFileSync(log, [...head, ...late].join('\n') + '\n');
    expect(ingestPerfLog(dir, { ...opts, now: Date.parse('2026-11-27T16:20:30Z') })).toMatchObject({ created: 0, open: 1 });
    expect(ingestPerfLog(dir, { ...opts, now: Date.parse('2026-11-27T18:00:00Z') })).toMatchObject({ created: 1 });
    expect(ingestPerfLog(dir, { ...opts, now: Date.parse('2026-11-27T18:00:00Z') })).toMatchObject({ created: 0, known: 1 });
    const [first, rest] = (listEntries(dir, { kind: 'play' }) as unknown as (Entry & { parent: string })[]).sort((a, b) => a.id.localeCompare(b.id));
    expect(rest.parent).toBe(first.id);
    expect(first.perf.lines).toEqual({ from: 0, to: 2 });
    expect(rest.perf.lines).toEqual({ from: 2, to: 4 });
    expect(rest.at).toBe('2026-11-27T16:20:00.000Z');
    expect(rest.world).toMatchObject({ turn: 6000, mobs: 1259 });
    expect(readBlob(dir, rest.files[0].sha256).toString()).toBe(late.join('\n') + '\n');
  });
});

describe('checkpoints by capture id', () => {
  const capLog = (cap: string) =>
    [
      SESSION_B,
      tps('14:48:44.414', 6060, 60, '1x'),
      `2026-11-27 14:48:45.000 [T06100] [info] ledger save cap=${cap} reason=periodic turn=6100 at=2026-11-27T13:48:45.000Z ms=1500 speed=1x`,
      tps('14:48:45.414', 6120, 20, '1x'),
      tps('14:48:46.414', 6180, 30, '1x'),
      tps('14:48:47.414', 6240, 40, '1x'),
      tps('14:48:48.414', 6300, 61, '1x')
    ].join('\n') + '\n';
  const saveEntry = (cap: string, world: string, at: string) => ({
    v: 1,
    id: newId('laptop', new Date(at)),
    kind: 'save',
    machine: 'laptop',
    captureId: cap,
    world: { save: world },
    files: []
  });
  const opts = (log: string) => ({ machine: 'laptop', checkout: 'c', paths: [log], timeZone: 'Europe/Berlin', now: Date.parse('2026-11-28T00:00:00Z') });

  it('links a checkpoint to the save entry with its capture id and leaves the capture window out of the TPS', () => {
    const save = saveEntry('cap-1', 'c'.repeat(64), '2026-11-27T13:48:45Z');
    putEntry(dir, save);
    const log = join(dir, 'perf.log');
    writeFileSync(log, capLog('cap-1'));
    ingestPerfLog(dir, opts(log));
    const [play] = listEntries(dir, { kind: 'play' }) as unknown as (Entry & { perf: { checkpoints: unknown[]; tps: Stats } })[];
    expect(play.perf.checkpoints).toEqual([
      { save: 'c'.repeat(64), capture: 'cap-1', reason: 'periodic', turn: 6100, at: '2026-11-27T13:48:45.000Z', ms: 1500, entry: save.id }
    ]);
    expect(play.perf.tps).toMatchObject({ median: 61, n: 2 });
    expect(listEntries(dir, { world: 'cccc' }).map((e) => e.id)).toContain(play.id);
  });

  it('places a checkpoint from its save entry when the perf.log line was lost, and merges one seen in both', () => {
    const spooled = (seq: number, at: string, turn: number, world: string) => ({
      v: 1,
      id: newId('laptop', new Date(at)),
      kind: 'save',
      machine: 'laptop',
      at,
      world: { save: world, captureId: `tok1-${seq}`, turn },
      perf: { speed: '1x', capture: { reason: 'periodic', session: 'tok1', ms: 1500 } },
      files: []
    });
    const lost = spooled(0, '2026-11-27T13:48:45.000Z', 6100, 'e'.repeat(64));
    const kept = spooled(1, '2026-11-27T13:48:50.000Z', 6400, 'f'.repeat(64));
    putEntry(dir, lost);
    putEntry(dir, kept);
    putEntry(dir, { ...spooled(0, '2026-11-27T13:48:46.000Z', 6100, '9'.repeat(64)), machine: 'desktop', id: newId('desktop', new Date('2026-11-27T13:48:46Z')) });
    const log = join(dir, 'perf.log');
    writeFileSync(
      log,
      [
        SESSION_B,
        '2026-11-27 14:48:43.500 [T06000] [info] ledger capture=on interval=120s session=tok1',
        tps('14:48:44.414', 6060, 60, '1x'),
        tps('14:48:45.414', 6120, 20, '1x'),
        tps('14:48:46.414', 6180, 30, '1x'),
        tps('14:48:47.414', 6240, 40, '1x'),
        tps('14:48:48.414', 6300, 70, '1x'),
        tps('14:48:49.414', 6360, 72, '1x'),
        '2026-11-27 14:48:50.100 [T06400] [info] ledger save cap=tok1-1 reason=periodic turn=6400 at=2026-11-27T13:48:50.000Z ms=1500 speed=1x bytes=10',
        tps('14:48:52.414', 6500, 80, '1x'),
        tps('14:48:53.414', 6560, 81, '1x')
      ].join('\n') + '\n'
    );
    ingestPerfLog(dir, opts(log));
    const [play] = listEntries(dir, { kind: 'play' }) as unknown as (Entry & {
      perf: { checkpoints: { capture: string; save: string; entry: string }[]; stretches: { tps: Record<string, Stats> }[] };
    })[];
    expect(play.perf.checkpoints.map((c) => [c.capture, c.save[0], c.entry])).toEqual([
      ['tok1-0', 'e', lost.id],
      ['tok1-1', 'f', kept.id]
    ]);
    expect(play.perf.stretches.map((st) => st.tps['1x']?.n ?? 0)).toEqual([1, 2, 1]);
    expect(play.perf.stretches[1].tps['1x'].median).toBe(72);
  });

  it('does not make a checkpoint of a capture that failed', () => {
    const lines = [
      SESSION_B,
      '2026-11-27 14:48:45.000 [T06100] [info] ledger save cap=tok2-0 reason=manual turn=6100 at=2026-11-27T13:48:45.000Z ms=900 speed=1x bytes=10',
      tps('14:48:45.414', 6120, 20, '1x'),
      '2026-11-27 14:48:46.000 [T06100] [error] ledger failed cap=tok2-0 error="disk full"',
      tps('14:48:46.414', 6180, 30, '1x'),
      tps('14:48:47.414', 6240, 61, '1x')
    ].join('\n');
    const perf = sessionPerf(splitSessions(lines, 'Europe/Berlin')[0]) as unknown as Perf;
    expect(perf.perf.checkpoints).toEqual([]);
    expect((perf.perf as unknown as { tps: Stats }).tps).toMatchObject({ median: 61, n: 1 });
  });

  it('finds a session by the world of a save that arrived after it', () => {
    const log = join(dir, 'perf.log');
    writeFileSync(log, capLog('cap-2'));
    ingestPerfLog(dir, opts(log));
    const [play] = listEntries(dir, { kind: 'play' });
    expect((play as unknown as { perf: { checkpoints: { save: null }[] } }).perf.checkpoints[0].save).toBeNull();
    putEntry(dir, saveEntry('cap-2', 'd'.repeat(64), '2026-11-27T13:48:46Z'));
    expect(listEntries(dir, { world: 'dddd' }).map((e) => e.id)).toContain(play.id);
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

  it('keys a save by the canonical JSON of its world, whatever its wrapper, key order or compression', () => {
    const dynamic = { turn: 30058, seed: 7, pawns: [{ a: 1, b: 2 }], mobs: [{}, {}] };
    const world = [[{}, {}, {}], [{}, {}, {}]];
    const text = JSON.stringify({ dynamic, world });
    const path = join(dir, 'save.json.gz');
    writeFileSync(path, gzipSync(text, { level: 1 }));
    utimesSync(path, new Date('2026-11-27T01:00:00Z'), new Date('2026-11-27T01:00:00Z'));
    const first = ingestSave(dir, { machine: 'laptop', path });
    expect(first.worldId).toBe(createHash('sha256').update('{"dynamic":{"mobs":[{},{}],"pawns":[{"a":1,"b":2}],"seed":7,"turn":30058},"world":[[{},{},{}],[{},{},{}]]}').digest('hex'));
    const reordered = { world, dynamic: { mobs: dynamic.mobs, turn: 30058, pawns: [{ b: 2, a: 1, c: undefined }], seed: 7, key: undefined } };
    expect(worldId(reordered)).toBe(first.worldId);
    expect(worldId({ v: 1, ...reordered })).toBe(first.worldId);
    writeFileSync(path, gzipSync(JSON.stringify({ v: 1, ...reordered }), { level: 9 }));
    expect(ingestSave(dir, { machine: 'laptop', path })).toMatchObject({ id: first.id, created: false });
    const save = resolveSave(dir, first.worldId.slice(0, 10));
    expect(save.world).toMatchObject({ turn: 30058, seed: 7, map: '3x2', pawns: 1, mobs: 2 });
    expect(resolveSave(dir, first.id).id).toBe(first.id);
    expect(assembleSave(dir, save).length).toBeGreaterThan(0);
  });

  it('completes a keyed write that died between its entry and its key', () => {
    const key = 'ci|bk-bf/Fantasia4x|1|2';
    const id = newId('github', new Date('2026-11-28T01:00:00Z'), key);
    const record = { v: 1, id, kind: 'ci', machine: 'github', files: [] };
    const sha = createHash('sha256').update(key).digest('hex');
    const keyDir = join(dir, 'keys', sha.slice(0, 2));
    mkdirSync(join(dir, 'keys'), { recursive: true });
    writeFileSync(keyDir, '');
    expect(() => putKeyed(dir, key, record)).toThrow();
    expect(getEntry(dir, id).id).toBe(id);
    expect(keyedEntry(dir, key)).toBeNull();
    rmSync(keyDir);
    expect(putKeyed(dir, key, record)).toEqual({ id, created: false });
    expect(keyedEntry(dir, key)).toBe(id);
    expect(putKeyed(dir, key, record)).toEqual({ id, created: false });
    expect(listEntries(dir, { kind: 'ci' }).map((e) => e.id)).toEqual([id]);
  });

  it('ingests a save again after its key was lost', () => {
    const path = join(dir, 'save.json.gz');
    writeFileSync(path, gzipSync(JSON.stringify({ dynamic: { turn: 1, seed: 2, pawns: [], mobs: [] }, world: [[{}]] })));
    utimesSync(path, new Date('2026-11-28T01:00:00Z'), new Date('2026-11-28T01:00:00Z'));
    const first = ingestSave(dir, { machine: 'laptop', path });
    rmSync(join(dir, 'keys'), { recursive: true });
    expect(ingestSave(dir, { machine: 'laptop', path })).toMatchObject({ id: first.id, created: false });
    expect(ingestSave(dir, { machine: 'laptop', path })).toMatchObject({ id: first.id, created: false });
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

describe('sync from a machine', () => {
  const tree = (base: string, files: Record<string, string | Buffer>) => {
    for (const [rel, body] of Object.entries(files)) {
      mkdirSync(join(base, rel, '..'), { recursive: true });
      writeFileSync(join(base, rel), body);
    }
  };
  const sha = (b: string | Buffer) => createHash('sha256').update(b).digest('hex');

  it('leaves the machine spool alone when syncing into a store other than the live one', () => {
    const home = join(dir, 'home');
    const store = join(dir, 'store');
    const blob = Buffer.from('spooled blob');
    const id = newId('test', new Date('2026-11-28T01:00:00Z'));
    const spooled = { v: 1, id, kind: 'play', machine: 'test', files: [{ role: 'log', name: 'b', sha256: sha(blob), bytes: blob.length }] };
    const files = {
      [`${SPOOL}/blobs/${sha(blob).slice(0, 2)}/${sha(blob)}`]: blob,
      [`${SPOOL}/entries/${id}.json`]: JSON.stringify(spooled)
    };
    tree(home, files);
    const report = { reached: [] as string[], skipped: [] as string[], entries: 0, play: 0, open: 0, removed: 0, errors: [] as string[] };
    pullMachine(store, 'test', { ssh: null, root: home, checkouts: [] }, report);
    expect(report).toMatchObject({ entries: 1, removed: 0, errors: [] });
    expect(getEntry(store, id).id).toBe(id);
    for (const rel of Object.keys(files)) expect(existsSync(join(home, rel))).toBe(true);
  });

  it('clears from the spool only what the store holds and verifies, and touches nothing else', () => {
    const home = join(dir, 'home');
    const store = join(dir, 'store');
    const good = Buffer.from('good blob');
    const keptId = newId('test', new Date('2026-11-27T10:00:00Z'));
    const changedId = newId('test', new Date('2026-11-27T11:00:00Z'));
    const kept = { v: 1, id: keptId, kind: 'play', machine: 'test', files: [{ role: 'log', name: 'g', sha256: sha(good), bytes: good.length }] };
    const changed = { v: 1, id: changedId, kind: 'play', machine: 'test', files: [], note: 'spool copy' };
    putEntry(store, { ...changed, note: 'stored copy' });
    const wt = join(home, 'wt', 'side');
    const outside = {
      [`${SPOOL}/../other.txt`]: 'not the spool',
      [`${SPOOL}/notes.txt`]: 'not a blob or entry',
      'proj/.debug/perf.log': `${SESSION_B}\n${tps('14:48:44.414', 6060, 60, '1x')}\n`,
      'proj/.debug/other.log': 'other log',
      'proj/.git/worktrees/side/gitdir': `${wt}/.git\n`,
      'wt/side/.debug/perf.log': `${SESSION_A}\n`
    };
    tree(home, {
      ...outside,
      [`${SPOOL}/blobs/${sha(good).slice(0, 2)}/${sha(good)}`]: good,
      [`${SPOOL}/blobs/${'b'.repeat(2)}/${'b'.repeat(64)}`]: 'does not hash to its name',
      [`${SPOOL}/entries/${keptId}.json`]: JSON.stringify(kept),
      [`${SPOOL}/entries/${changedId}.json`]: JSON.stringify(changed)
    });
    const report = { reached: [] as string[], skipped: [] as string[], entries: 0, play: 0, open: 0, removed: 0, errors: [] as string[] };
    pullMachine(store, 'test', { ssh: null, root: home, checkouts: ['proj'] }, report, { clear: true });
    expect(report.reached).toEqual(['test']);
    expect(report.entries).toBe(1);
    expect(report.removed).toBe(2);
    expect(report.errors.join('\n')).toMatch(/does not match its hash/);
    expect(report.errors.join('\n')).toMatch(/differs from the stored one/);
    expect(readdirSync(join(home, SPOOL, 'entries'))).toEqual([`${changedId}.json`]);
    expect(existsSync(join(home, SPOOL, 'blobs', 'bb', 'b'.repeat(64)))).toBe(true);
    expect(existsSync(join(home, SPOOL, 'blobs', sha(good).slice(0, 2), sha(good)))).toBe(false);
    for (const [rel, body] of Object.entries(outside)) expect(readFileSync(join(home, rel), 'utf8')).toBe(body);
    expect(getEntry(store, changedId).note).toBe('stored copy');
    expect(readBlob(store, sha(good)).toString()).toBe('good blob');
    const plays = listEntries(store, { kind: 'play', tool: 'perf.log' }) as unknown as (Entry & { perf: { checkout: string } })[];
    expect(plays.map((e) => e.perf.checkout).sort()).toEqual(['proj', 'wt/side']);
    expect(existsSync(join(store, 'raw', 'test', 'proj', 'perf.log'))).toBe(true);
    expect(existsSync(join(store, 'raw', 'test', 'proj', 'other.log'))).toBe(false);
  });

  const NIGHTLY = { hour: 3, zone: 'Europe/Berlin' };
  const spoolSave = (home: string, at: string, body: string, reason: string) => {
    const blob = Buffer.from(body);
    const id = newId('test', new Date(at));
    const entry = {
      v: 1,
      id,
      kind: 'save',
      machine: 'test',
      perf: { capture: { reason } },
      files: [{ role: 'save', name: 'save.json.gz', sha256: sha(blob), bytes: blob.length }]
    };
    tree(home, {
      [`${SPOOL}/blobs/${sha(blob).slice(0, 2)}/${sha(blob)}`]: blob,
      [`${SPOOL}/entries/${id}.json`]: JSON.stringify(entry)
    });
    return { id, sha: sha(blob), path: join(home, SPOOL, 'blobs', sha(blob).slice(0, 2), sha(blob)) };
  };
  const passAt = (store: string, home: string, at: string) => {
    const report = { reached: [] as string[], skipped: [] as string[], entries: 0, play: 0, open: 0, removed: 0, moved: [] as string[], errors: [] as string[] };
    pullMachine(store, 'test', { ssh: null, root: home, checkouts: [], blobs: NIGHTLY }, report, { clear: true, now: new Date(at) });
    return report;
  };

  it('finds the last 03:00 in Berlin on either side of a clock change', () => {
    const at = (t: string) => new Date(lastMoveTime(new Date(t), NIGHTLY)).toISOString();
    expect(at('2026-11-28T01:59:00Z')).toBe('2026-11-27T02:00:00.000Z');
    expect(at('2026-11-28T02:00:00Z')).toBe('2026-11-28T02:00:00.000Z');
    expect(at('2026-07-01T00:59:00Z')).toBe('2026-06-30T01:00:00.000Z');
    expect(at('2026-03-29T01:30:00Z')).toBe('2026-03-29T01:00:00.000Z');
    expect(at('2026-10-25T01:30:00Z')).toBe('2026-10-24T01:00:00.000Z');
    expect(at('2026-10-25T02:30:00Z')).toBe('2026-10-25T02:00:00.000Z');
  });

  it('takes a nightly machine\'s entries at once and holds its blobs until the first pass after 03:00 in Berlin', () => {
    const home = join(dir, 'home');
    const store = join(dir, 'store');
    expect(passAt(store, home, '2026-11-28T02:30:00Z')).toMatchObject({ moved: [], errors: [] });
    expect(blobMoves(store)).toEqual({ test: '2026-11-28T02:30:00.000Z' });
    const capture = spoolSave(home, '2026-11-28T09:00:00Z', 'periodic capture', 'periodic');

    expect(passAt(store, home, '2026-11-28T10:00:00Z')).toMatchObject({ entries: 1, removed: 1, moved: [], errors: [] });
    expect(getEntry(store, capture.id).files[0].sha256).toBe(capture.sha);
    expect(missingBlobs(store, getEntry(store, capture.id))).toHaveLength(1);
    expect(existsSync(capture.path)).toBe(true);
    expect(readdirSync(join(home, SPOOL, 'entries'))).toEqual([]);
    expect(passAt(store, home, '2026-11-29T01:59:00Z')).toMatchObject({ removed: 0, moved: [] });
    expect(existsSync(capture.path)).toBe(true);

    expect(passAt(store, home, '2026-11-29T02:01:00Z')).toMatchObject({ removed: 1, moved: ['test'], errors: [] });
    expect(readBlob(store, capture.sha).toString()).toBe('periodic capture');
    expect(existsSync(capture.path)).toBe(false);
    expect(storedBlobs([capture.sha], join(home, SPOOL))).toEqual([]);

    const late = spoolSave(home, '2026-11-29T20:00:00Z', 'a capture from a night the machine slept through', 'periodic');
    expect(passAt(store, home, '2026-11-29T21:00:00Z')).toMatchObject({ moved: [] });
    expect(passAt(store, home, '2026-11-30T15:00:00Z')).toMatchObject({ moved: ['test'], errors: [] });
    expect(hasBlob(store, late.sha)).toBe(true);
    expect(existsSync(late.path)).toBe(false);
  });

  it('leaves a receipt in the spool for a deleted save once the store holds and verifies it', () => {
    const home = join(dir, 'home');
    const store = join(dir, 'store');
    passAt(store, home, '2026-11-28T02:30:00Z');
    const deleted = spoolSave(home, '2026-11-28T09:00:00Z', 'a hidden save', 'deleted');
    passAt(store, home, '2026-11-28T10:00:00Z');
    expect(storedBlobs([deleted.sha], join(home, SPOOL))).toEqual([]);
    passAt(store, home, '2026-11-29T02:10:00Z');
    expect(storedBlobs([deleted.sha, 'c'.repeat(64), 'not a hash'], join(home, SPOOL))).toEqual([deleted.sha]);
    expect(existsSync(deleted.path)).toBe(false);
  });

  it('fetches one held blob on demand, verified, and clears it from the spool', () => {
    const home = join(dir, 'home');
    const store = join(dir, 'store');
    passAt(store, home, '2026-11-28T02:30:00Z');
    const held = spoolSave(home, '2026-11-28T09:00:00Z', 'wanted before the night', 'deleted');
    const other = spoolSave(home, '2026-11-28T09:01:00Z', 'not wanted yet', 'periodic');
    passAt(store, home, '2026-11-28T10:00:00Z');
    const cfg = { ssh: null, root: home, checkouts: [], blobs: NIGHTLY };
    expect(fetchBlob(store, 'test', held.sha, { cfg, clear: true })).toEqual({ cleared: true });
    expect(readBlob(store, held.sha).toString()).toBe('wanted before the night');
    expect(existsSync(held.path)).toBe(false);
    expect(storedBlobs([held.sha], join(home, SPOOL))).toEqual([held.sha]);
    expect(existsSync(other.path)).toBe(true);
    expect(hasBlob(store, other.sha)).toBe(false);
    expect(() => fetchBlob(store, 'test', 'd'.repeat(64), { cfg, clear: true })).toThrow(/gave no blob dddddddddddd/);
  });

  it('mirrors a log that grew in place and keeps a log that was replaced beside it', () => {
    const stage = join(dir, 'stage');
    const raw = join(dir, 'raw');
    tree(stage, { 'perf.log': 'one\n' });
    mirror(stage, raw);
    tree(stage, { 'perf.log': 'one\ntwo\n' });
    expect(mirror(stage, raw)).toEqual([]);
    expect(readFileSync(join(raw, 'perf.log'), 'utf8')).toBe('one\ntwo\n');
    tree(stage, { 'perf.log': 'fresh\n' });
    const archived = mirror(stage, raw);
    expect(archived).toEqual([join(raw, `perf.log.kept-${sha('one\ntwo\n').slice(0, 12)}`)]);
    expect(readFileSync(archived[0], 'utf8')).toBe('one\ntwo\n');
    expect(readFileSync(join(raw, 'perf.log'), 'utf8')).toBe('fresh\n');
  });
});

describe('invalid runs', () => {
  const reason = 'tps: speed not set, fixed in 30487224/1c851dac';
  const has = (commit: string, fix: string) => (commit === 'unknown' ? null : commit === `after-${fix.slice(0, 8)}`);

  it('flags frame-cost and steady runs whose commit lacks the speed fix, or that ran before it when the commit is unknown', () => {
    expect(invalidReasons({ tool: 'frame-cost', commit: 'old', at: '2026-11-28T00:00:00Z' }, has)).toEqual([reason]);
    expect(invalidReasons({ tool: 'frame-cost', commit: 'after-30487224', at: '2026-11-26T00:00:00Z' }, has)).toEqual([]);
    expect(invalidReasons({ tool: 'steady', commit: 'after-30487224', at: '2026-11-28T00:00:00Z' }, has)).toEqual([reason]);
    expect(invalidReasons({ tool: 'steady', commit: 'after-1c851dac', at: '2026-11-28T00:00:00Z' }, has)).toEqual([]);
    expect(invalidReasons({ tool: 'frame-cost', commit: null, at: '2026-11-27T02:47:14Z' }, has)).toEqual([reason]);
    expect(invalidReasons({ tool: 'frame-cost', commit: 'unknown', at: '2026-11-27T02:47:16Z' }, has)).toEqual([]);
    expect(invalidReasons({ tool: 'steady', commit: null, at: '2026-11-27T03:00:00Z' }, has)).toEqual([reason]);
    expect(invalidReasons({ tool: 'zoom-out', commit: null, at: '2026-11-20T00:00:00Z' }, has)).toEqual([]);
  });

  it('keeps reasons an entry already carries and adds none twice', () => {
    expect(withInvalid({ tool: 'steady', commit: null, at: '2026-11-27T03:00:00Z', invalid: [reason, 'busy host'] }, has).invalid).toEqual([reason, 'busy host']);
    expect(withInvalid({ tool: 'tick-harness', commit: null, at: null }, has)).not.toHaveProperty('invalid');
  });

  it('flags an imported frame-cost run from before the fix and keeps its files', () => {
    const path = join(dir, 'base-frame-cost.json');
    writeFileSync(path, JSON.stringify({ scenario: 'dev-save', map: [750, 750], rows: [] }));
    const shot = join(dir, 'base-frame-cost.png');
    writeFileSync(shot, 'png');
    const at = Date.parse('2026-11-27T01:00:00Z');
    const r = ingestBench(dir, { machine: 'desktop', path, tool: 'frame-cost', at, siblings: [shot] });
    const e = getEntry(dir, r.id);
    expect(e).toMatchObject({ kind: 'bench', tool: 'frame-cost', invalid: [reason], world: { map: '750x750' } });
    expect(e.files.map((f: { name: string }) => f.name)).toEqual(['base-frame-cost.json', 'base-frame-cost.png']);
    expect(ingestBench(dir, { machine: 'desktop', path, tool: 'frame-cost', at })).toMatchObject({ id: r.id, created: false });
  });

  it('reads the fix commits from this repository', () => {
    expect(invalidReasons({ tool: 'frame-cost', commit: '30487224b8ede8a91872899b19fc841b290696c4', at: null })).toEqual([]);
    expect(invalidReasons({ tool: 'steady', commit: '30487224b8ede8a91872899b19fc841b290696c4', at: null })).toEqual([reason]);
  });
});
