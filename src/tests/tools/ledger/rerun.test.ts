import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  parseRerunArgs,
  plan,
  harnessVars,
  resultName,
  findSave,
  rerun,
  syncSpool
} from '../../../../tools/ledger/rerun.mjs';
import { recordRun, recordBench, agentEnv, hostRecord, hostInvalid, snapshot, parseKv } from '../../../../tools/ledger/bench.mjs';
import { ingestSave, worldIdOf } from '../../../../tools/ledger/ingest.mjs';
import { FIXES } from '../../../../tools/ledger/invalid.mjs';
import { listEntries, getEntry, ingestSpool } from '../../../../tools/ledger/store.mjs';

const SHA_DEV = 'a'.repeat(40);
const SHA_LO = 'b'.repeat(40);

const saveText = JSON.stringify({
  v: 1,
  dynamic: { seed: 7, turn: 120, pawns: [{}, {}], mobs: [{}, {}, {}], culture: { name: 'Fen' } },
  world: [
    [0, 0, 0],
    [0, 0, 0]
  ]
});
const worldId = worldIdOf(saveText);

let root: string;
let spool: string;
let env: Record<string, string>;

beforeEach(() => {
  const base = mkdtempSync(join(tmpdir(), 'f4x-rerun-test-'));
  root = join(base, 'store');
  spool = join(base, 'spool');
  env = { F4X_LEDGER_SPOOL: spool, F4X_LEDGER_SESSION: 'sess-1', F4X_LEDGER_THREAD: 'thread-1' };
});

const ownerSave = () =>
  ingestSave(root, { machine: 'laptop', who: 'owner', data: gzipSync(saveText), at: Date.parse('2026-11-27T15:00:00Z'), parent: null });

describe('rerun arguments', () => {
  it('fills the defaults and keeps every --ref', () => {
    const o = parseRerunArgs(['abc', '--ref', 'origin/dev', '--ref', 'origin/test/look-overhaul', '--rounds', '2']);
    expect(o).toMatchObject({
      target: 'abc',
      refs: ['origin/dev', 'origin/test/look-overhaul'],
      machine: 'desktop',
      mode: 'loop',
      speed: 4,
      seconds: 30,
      rounds: 2,
      harnessRef: 'origin/dev',
      keep: false
    });
  });

  it('refuses a run with no ref, a bad mode, the laptop or a round count that is not a whole number', () => {
    expect(() => parseRerunArgs(['abc'])).toThrow(/--ref/);
    expect(() => parseRerunArgs(['abc', '--ref', 'x', '--mode', 'fast'])).toThrow(/loop or tick/);
    expect(() => parseRerunArgs(['abc', '--ref', 'x', '--machine', 'laptop'])).toThrow(/laptop/);
    expect(() => parseRerunArgs(['abc', '--ref', 'x', '--rounds', '0'])).toThrow(/rounds/);
    expect(() => parseRerunArgs(['abc', '--ref', 'x', '--rounds', '1.5'])).toThrow(/rounds/);
    expect(() => parseRerunArgs(['--ref', 'x'])).toThrow(/usage/);
  });

  it('interleaves the refs round by round', () => {
    expect(plan(['a', 'b'], 2)).toEqual([
      { ref: 'a', round: 1 },
      { ref: 'b', round: 1 },
      { ref: 'a', round: 2 },
      { ref: 'b', round: 2 }
    ]);
  });

  it('passes speed and seconds to a loop run and warm and ticks to a tick run', () => {
    const loop = parseRerunArgs(['w', '--ref', 'x', '--speed', '2', '--seconds', '10']);
    expect(harnessVars(loop, '/s.gz', '/out', 't', 'dev')).toEqual([
      'PROF_SCENARIO=save',
      'PROF_SAVE=/s.gz',
      'PROF_OUT=/out',
      'PROF_TAG=t',
      'PROF_SPEED=2',
      'PROF_SECONDS=10',
      'PROF_BRANCH=dev'
    ]);
    const tick = parseRerunArgs(['w', '--ref', 'x', '--mode', 'tick', '--ticks', '300']);
    expect(harnessVars(tick, '/s.gz', '/out', 't', null)).toEqual([
      'PROF_SCENARIO=save',
      'PROF_SAVE=/s.gz',
      'PROF_OUT=/out',
      'PROF_TAG=t',
      'PROF_TICKS=300'
    ]);
    expect(resultName('loop', 't', 2)).toBe('t.loop2x.json');
    expect(resultName('tick', 't', 2)).toBe('t.json');
  });
});

describe('finding the save to rerun', () => {
  it('resolves a world id prefix and a save entry id to the save entry', () => {
    const { id } = ownerSave();
    expect(findSave(root, worldId.slice(0, 10))).toMatchObject({ parent: id, world: { save: worldId } });
    expect(findSave(root, id).parent).toBe(id);
  });

  it('links a rerun of a bench entry to that entry and reads the save from its own files', async () => {
    const save = join(mkdtempSync(join(tmpdir(), 'f4x-save-')), 'fixture.json.gz');
    writeFileSync(save, gzipSync(saveText));
    const id = await recordRun({
      env,
      tool: 'frame-cost',
      machine: 'desktop',
      git: { branch: 'dev', commit: SHA_DEV, dirty: 0, refs: '' },
      save,
      log: () => {}
    });
    ingestSpool(root, spool, { remove: true });
    const found = findSave(root, id);
    expect(found.parent).toBe(id);
    expect(found.file.role).toBe('save');
    expect(findSave(root, worldId.slice(0, 12)).parent).toBe(id);
  });

  it('says so when nothing holds the world', () => {
    expect(() => findSave(root, 'deadbeef')).toThrow(/no save/);
  });
});

type Call = { host: string; script: string };
type Deps = Parameters<typeof rerun>[2];

function fakeDesktop(opts: { reachable?: boolean; failRound?: boolean; busyChecks?: number } = {}) {
  const calls: Call[] = [];
  let n = 0;
  let quietCalls = 0;
  const slept: number[] = [];
  const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
  const deps = {
    calls,
    slept,
    log: () => {},
    sleep: (ms: number) => slept.push(ms),
    now: () => Date.parse('2026-11-27T18:00:00Z') + n++ * 1000,
    git: (args: string[]) => {
      if (args[0] === 'fetch') return ok();
      if (args[0] === 'for-each-ref') return ok('origin/dev\n');
      const ref = args[args.length - 1];
      if (args.includes('--quiet') && ref.startsWith('refs/remotes/origin/'))
        return ['refs/remotes/origin/dev', 'refs/remotes/origin/test/look-overhaul'].includes(ref) ? ok() : { status: 1, stdout: '', stderr: '' };
      if (ref.startsWith('origin/dev')) return ok(SHA_DEV);
      if (ref.startsWith('origin/test/look-overhaul')) return ok(SHA_LO);
      return { status: 1, stdout: '', stderr: '' };
    },
    ssh: (host: string, script: string) => {
      calls.push({ host, script });
      if (opts.reachable === false) return { status: 255, stdout: '', stderr: 'ssh: connect to host desktop: No route to host' };
      if (script.startsWith('echo "home=')) return ok('home=/home/k\n');
      if (script.includes("'quiet'")) {
        const busy = (opts.busyChecks ?? 0) > quietCalls++;
        return ok(busy ? 'cores=16\nload=9.00 5.00 3.00\nbusy=77 node tools/gpu/steady.mjs\n' : 'cores=16\nload=0.20 0.30 0.40\n');
      }
      if (script.includes("'prepare'")) return ok('patched=1\ndirty=1\nready abc\n');
      if (script.includes("'round'")) return opts.failRound ? { status: 1, stdout: 'boom', stderr: '' } : ok('TPS 190\n');
      const cat = /^cat '([^']+)'$/.exec(script);
      if (cat) {
        const sha = cat[1].includes(SHA_DEV.slice(0, 12)) ? SHA_DEV : SHA_LO;
        return ok(
          JSON.stringify({ commit: sha, branch: 'x', dirty: true, turn: 120, endTurn: 6000, pawns: 2, mobs: 3, scenario: 'save', speed: 4, targetTps: 240, seconds: 30, ticks: 5700, tps: 190, tickMsMean: 5.1, busyShare: 0.99 })
        );
      }
      return ok();
    }
  };
  return deps;
}

describe('rerun on a machine', () => {
  it('stops before touching anything when the machine is unreachable', async () => {
    ownerSave();
    const deps = fakeDesktop({ reachable: false });
    const o = parseRerunArgs([worldId.slice(0, 12), '--ref', 'origin/dev']);
    await expect(rerun(root, o, deps as unknown as Deps, env)).rejects.toThrow(/desktop is unreachable/);
    expect(deps.calls).toHaveLength(1);
  });

  it('records every round as its own entry, linked to the save, on the same world, and syncs it into the store', async () => {
    const { id: saveId } = ownerSave();
    const deps = fakeDesktop();
    const o = parseRerunArgs([worldId.slice(0, 12), '--ref', 'origin/dev', '--ref', 'origin/test/look-overhaul', '--rounds', '2']);
    const ids = await rerun(root, o, deps as unknown as Deps, env);
    expect(ids).toHaveLength(4);
    const entries = ids.map((id: string) => getEntry(root, id));
    expect(entries.map((e) => e.commit)).toEqual([SHA_DEV, SHA_LO, SHA_DEV, SHA_LO]);
    expect(entries.map((e) => e.perf.round)).toEqual([1, 1, 2, 2]);
    for (const e of entries) {
      expect(e).toMatchObject({ kind: 'harness', tool: 'tick-harness', machine: 'desktop', parent: saveId, scenario: 'save' });
      expect(e.world).toMatchObject({ save: worldId, pawns: 2, mobs: 3, turn: 120, map: '3x2', name: 'Fen' });
      expect(e.perf).toMatchObject({ tps: { median: 190 }, speed: '4x', harnessCommit: SHA_DEV, enginePatched: true });
      expect(e.host).toMatchObject({ load: [0.2, 0.3, 0.4], loadEnd: [0.2, 0.3, 0.4], cores: 16, others: [] });
      expect(e.invalid).toBeUndefined();
      expect(e.launchedBy).toMatchObject({ who: 'agent', session: 'sess-1', thread: 'thread-1' });
      expect(e.files.map((f: { role: string }) => f.role).sort()).toEqual(['log', 'result', 'save']);
    }
    expect(listEntries(root, { world: worldId.slice(0, 12) }).map((e) => e.id)).toEqual([saveId, ...ids].sort());
    expect(readdirSync(join(spool, 'entries'))).toEqual([]);
    const cleanup = deps.calls.find((c) => c.script.includes("'cleanup'"))!.script;
    expect(cleanup).toContain(`ledger-rerun-${SHA_DEV.slice(0, 12)}`);
    expect(cleanup).toContain(`ledger-rerun-${SHA_LO.slice(0, 12)}`);
  });

  it('waits while another bench runs or the load is high before it builds or measures', async () => {
    ownerSave();
    const deps = fakeDesktop({ busyChecks: 2 });
    const [id] = await rerun(root, parseRerunArgs([worldId.slice(0, 12), '--ref', 'origin/dev']), deps as unknown as Deps, env);
    expect(deps.slept).toEqual([30_000, 30_000]);
    expect(getEntry(root, id).host.load).toEqual([0.2, 0.3, 0.4]);
  });

  it('keeps the worktrees with --keep and still clears the run directory', async () => {
    ownerSave();
    const deps = fakeDesktop();
    await rerun(root, parseRerunArgs([worldId.slice(0, 12), '--ref', 'origin/dev', '--keep']), deps as unknown as Deps, env);
    const cleanup = deps.calls.find((c) => c.script.includes("'cleanup'"))!.script;
    expect(cleanup).toContain('.cache/f4x-ledger-rerun/');
    expect(cleanup).not.toContain('ledger-rerun-');
  });

  it('records nothing for a round that failed and still cleans up', async () => {
    ownerSave();
    const deps = fakeDesktop({ failRound: true });
    await expect(rerun(root, parseRerunArgs([worldId.slice(0, 12), '--ref', 'origin/dev']), deps as unknown as Deps, env)).rejects.toThrow(/round 1/);
    expect(listEntries(root, { kind: 'harness' })).toEqual([]);
    expect(deps.calls.some((c) => c.script.includes("'cleanup'"))).toBe(true);
  });
});

describe('syncing a rerun into the store', () => {
  it('ingests the spool into a free store', async () => {
    ownerSave();
    const id = await recordRun({ env, tool: 'steady', host: null, log: () => {} });
    expect(syncSpool(root, spool)).toBe(true);
    expect(getEntry(root, id).tool).toBe('steady');
  });

  it('leaves the entry in the spool when the store stays held', () => {
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, '.lock'), String(process.ppid));
    expect(syncSpool(root, spool, 300)).toBe(false);
    rmSync(join(root, '.lock'));
  });
});

describe('the measuring machine', () => {
  it('marks a run invalid when another bench ran beside it or it started under load', () => {
    const quiet = snapshot(parseKv('cores=16\nload=0.5 0.4 0.3\n'), 'a');
    const busy = snapshot(parseKv('cores=16\nload=3.1 2 1\nbusy=42 node tools/gpu/frame-cost.mjs /t x /o 8\n'), 'b');
    expect(hostInvalid(hostRecord(quiet, quiet))).toEqual([]);
    const host = hostRecord(quiet, busy);
    expect(host).toEqual({
      load: [0.5, 0.4, 0.3],
      loadEnd: [3.1, 2, 1],
      cores: 16,
      others: [{ pid: 42, cmd: 'node tools/gpu/frame-cost.mjs /t x /o 8' }],
      at: 'a',
      atEnd: 'b'
    });
    expect(hostInvalid(host)).toEqual(['another f4x bench was running: 42 node tools/gpu/frame-cost.mjs /t x /o 8']);
    expect(hostInvalid(hostRecord(busy, quiet), 2.5)[1]).toBe('load 3.1 at start, above 2.5');
  });
});

describe('recording from the bench tools', () => {
  it('names the agent from F4X_LEDGER_SESSION and F4X_LEDGER_THREAD when the Claude variables are absent', () => {
    expect(agentEnv({ F4X_LEDGER_SESSION: 's', F4X_LEDGER_THREAD: 't' })).toMatchObject({ CLAUDE_CODE_SESSION_ID: 's', T3CODE_THREAD_ID: 't' });
    expect(agentEnv({ CLAUDE_CODE_SESSION_ID: 'c', F4X_LEDGER_SESSION: 's' }).CLAUDE_CODE_SESSION_ID).toBe('c');
  });

  it('warns once and carries on when the spool cannot be written', async () => {
    const blocked = join(mkdtempSync(join(tmpdir(), 'f4x-blocked-')), 'file');
    writeFileSync(blocked, 'not a directory');
    const warnings: string[] = [];
    const id = await recordRun({ env: { F4X_LEDGER_SPOOL: blocked }, tool: 'steady', warn: (m: string) => warnings.push(m), log: () => {} });
    expect(id).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/not recorded/);
  });

  it('marks a frame-cost run from before the speed fix invalid, alongside the load at its start', async () => {
    const busy = snapshot(parseKv('cores=16\nload=3.1 2 1\n'), 'a');
    const quiet = snapshot(parseKv('cores=16\nload=0.5 0.4 0.3\n'), 'b');
    const git = (commit: string) => ({ branch: 'dev', commit, dirty: 0, refs: [] });
    const has = (commit: string, fix: string) => commit === 'after' && fix === FIXES['frame-cost'].commit;
    const record = (commit: string, start: unknown) =>
      recordRun({ env, tool: 'frame-cost', git: git(commit), host: hostRecord(start, quiet), has, log: () => {} });
    const before = await record('before', busy);
    const after = await record('after', quiet);
    ingestSpool(root, spool, { remove: true });
    expect(getEntry(root, before).invalid).toEqual(['load 3.1 at start, above 1.5', FIXES['frame-cost'].reason]);
    expect(getEntry(root, after).invalid).toBeUndefined();
  });

  it('records nothing when F4X_LEDGER_OFF is set', async () => {
    expect(await recordRun({ env: { F4X_LEDGER_OFF: '1', F4X_LEDGER_SPOOL: spool }, tool: 'steady' })).toBeNull();
  });

  it('stores the fixture as the world and the key frame-cost numbers in perf', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'f4x-fc-'));
    const fixture = join(dir, 'owner.json.gz');
    writeFileSync(fixture, gzipSync(saveText));
    const result = join(dir, 'x-frame-cost.json');
    const rows = [
      { skipped: 'none', zoom: 'close', speed: '4x', fps: 90, tps: 230 },
      { skipped: 'none', zoom: 'far', speed: '4x', fps: 70, tps: 210 },
      { skipped: 'none', zoom: 'far', speed: 'max', fps: 60, tps: 400 },
      { skipped: 'gl', zoom: 'far', speed: '4x', fps: 200, tps: 239 }
    ];
    writeFileSync(result, JSON.stringify({ rows }));
    const id = await recordBench('frame-cost', {
      tree: dir,
      label: 'x',
      rows,
      result,
      env: { ...env, F4X_FIXTURE: fixture, F4X_QUERY: '?painted=1' }
    });
    ingestSpool(root, spool, { remove: true });
    const e = getEntry(root, id);
    expect(e).toMatchObject({ kind: 'bench', tool: 'frame-cost', scenario: 'save', world: { save: worldId, turn: 120 }, note: 'x' });
    expect(e.perf).toMatchObject({ tps: { median: 220, n: 2 }, maxSpeedTps: { median: 400 }, query: '?painted=1' });
    expect(e.files.map((f: { role: string }) => f.role).sort()).toEqual(['result', 'save']);
  });
});
