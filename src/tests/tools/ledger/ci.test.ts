import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, gunzipSync } from 'node:zlib';
import {
  parseJobLog,
  parseArtifactFile,
  executions,
  machineOf,
  measuredSteps,
  ingestCI,
  readCursor
} from '../../../../tools/ledger/ci.mjs';
import { listEntries, readBlob } from '../../../../tools/ledger/store.mjs';

const FIXTURES = join(import.meta.dirname, 'fixtures', 'ci');
const fixture = (name: string) => readFileSync(join(FIXTURES, name));
const log = (name: string) => fixture(name).toString('utf8');

interface Loose {
  [key: string]: Loose;
}
const parsed = (name: string) => {
  const { legs, artifacts } = parseJobLog(log(name));
  return { legs: legs as unknown as Loose, artifacts };
};
const artifactOf = (artifact: string, name: string, data: Buffer) =>
  parseArtifactFile(artifact, name, data) as unknown as Loose;

function storedZip(files: Record<string, Buffer>) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const nameBuf = Buffer.from(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

describe('CI job logs', () => {
  it('reads the base and head comparison and the large-wilderness floor from a ticks per second log', () => {
    const { legs, artifacts } = parsed('tps.log');
    expect(Object.keys(legs)).toEqual(['tps']);
    expect(legs.tps.compare).toEqual({
      name: 'dev-save 60 ticks',
      base: {
        runsMs: [158.5, 155.8, 152.1, 153, 152.9, 153.7, 151.9, 154.1, 154.2],
        medianMs: 153.7,
        tps: 390
      },
      head: {
        runsMs: [151.6, 152.6, 155.7, 156.2, 157.3, 157, 152.2, 153.4, 153.3],
        medianMs: 153.4,
        tps: 391
      }
    });
    expect(legs.tps.floor).toMatchObject({
      scenario: 'large-wilderness',
      runs: [264, 264, 267, 248, 268],
      median: 264
    });
    expect(artifacts).toEqual([{ name: 'tps-notes', bytes: 368, id: 14983072852 }]);
  });

  it('reads work pin totals and frame budgets from a measurements log', () => {
    const { legs, artifacts } = parsed('measure.log');
    expect(Object.keys(legs).sort()).toEqual(['frame-budget', 'work-pins']);
    expect(legs['work-pins'].changed).toBe(863);
    expect(legs['work-pins'].scenarios).toEqual(['colony', 'dev-save', 'mobs']);
    expect(legs['work-pins'].totals).toHaveLength(4);
    expect(legs['work-pins'].totals[0]).toEqual({
      scenario: 'colony',
      fn: 'all calls',
      where: '',
      base: 5127161,
      head: 4195632
    });
    expect(legs['work-pins'].overBudget).toEqual([
      { scenario: 'mobs', fn: 'counter mob upserts', where: '', base: 18488, head: 24249 }
    ]);
    const run1x = (legs['frame-budget'].budgets as unknown as Loose[]).find(
      (b) => String(b.phase) === 'run-1x'
    );
    expect(run1x).toMatchObject({
      scenario: 'large-wilderness',
      runs: [191, 192, 192],
      median: 192,
      limit: 'ceiling 145',
      unit: 'ms'
    });
    expect(artifacts.map((a: { name: string }) => a.name)).toEqual([
      'frame-budget',
      'work-pins-notes'
    ]);
  });

  it('reads the creature cost table and its scenarios when no total changed', () => {
    const { legs } = parsed('pins-no-change.log');
    expect(legs['work-pins'].totals).toEqual([]);
    expect(legs['work-pins'].scenarios).toEqual(['generated-map', 'mobs-200', 'mobs-50']);
    expect(legs['work-pins'].creatureCost).toHaveLength(14);
    expect(legs['work-pins'].creatureCost[2]).toEqual({
      scenario: 'generated-map',
      fn: 'creature calls per creature',
      where: '',
      base: 50841.06,
      head: 50841.06
    });
  });

  it('reads instruction counts and verdicts from a CodSpeed counts log', () => {
    const { legs } = parsed('codspeed.log');
    expect(legs.codspeed.benchmarks['body.bench.ts::body colony::conditions']).toEqual({
      instructions: 61589,
      instructionsChange: '-2.01%',
      llMisses: 1280,
      llMissesChange: '-0.2%',
      verdict: 'faster'
    });
    expect(legs.codspeed.against).toMatch(/against `dev` at `ddf5a6b3`/);
  });

  it('reads base and head counts of each gungraun benchmark and each crate verdict', () => {
    const { legs, artifacts } = parsed('gungraun.log');
    const scattered =
      legs.gungraun.benches['spatial::spatial::find_path scattered:(scattered_route())'];
    expect(scattered.base.instructions).toBe(20791789);
    expect(scattered.head.instructions).toBe(20791789);
    expect(scattered.head.estimatedCycles).toBe(28300281);
    expect(scattered.base.estimatedCycles).toBe(28300243);
    expect(legs.gungraun.crates).toEqual([
      { crate: 'spatial-core', compared: true, verdict: 'ok' },
      { crate: 'sim-core', compared: true, verdict: 'ok' }
    ]);
    expect(artifacts[0].name).toBe('gungraun-flamegraphs');
  });
});

describe('CI artifacts', () => {
  it('parses each perf artifact type', () => {
    expect(artifactOf('tps-notes', 'tps-notes.jsonl', fixture('tps-notes.jsonl'))).toMatchObject({
      leg: 'tps',
      notes: [{ name: 'dev-save 60 ticks', ticks: 60, headMs: 153.41965749999963 }]
    });
    const pins = artifactOf(
      'work-pins-notes',
      'work-pins-notes.jsonl',
      fixture('work-pins-notes.jsonl')
    );
    expect(pins.leg).toBe('work-pins');
    expect(pins.notes[0].totals).toHaveLength(4);
    const counts = artifactOf(
      'codspeed-counts-1',
      'codspeed-counts.json',
      fixture('codspeed-counts.json')
    );
    expect(counts.countsSha).toBe('bec6b24dd0a15c83c8881dd3944b205691b47a2e');
    expect(counts.counts['tools/bench/jobs.bench.ts::jobs::haul:full-budget'].Ir).toBe(2836382);
    const frames = artifactOf('frame-budget', 'frame-budget.json', fixture('frame-budget.json'));
    expect(frames.scenario).toBe('large-wilderness');
    expect(frames.rounds).toBe(2);
    expect(frames.phases['run-4x'].medianMs).toHaveLength(2);
    expect(parseArtifactFile('frame-budget', 'dev-server.log', Buffer.from('x'))).toBeNull();
  });
});

describe('CI jobs', () => {
  it('names the machine from the runner', () => {
    expect(machineOf({ runner_name: 'GitHub Actions 1000007880' })).toBe('github');
    expect(machineOf({ runner_name: 'ubuntuserver-fantasia4x-2' })).toBe('ubuntuserver');
    expect(machineOf({ runner_name: null })).toBeNull();
  });

  it('keeps one execution of a job that a later attempt copied without running it', () => {
    const one = {
      id: 1,
      run_attempt: 1,
      name: 'Ticks per second',
      started_at: 'a',
      completed_at: 'b',
      runner_name: 'r1'
    };
    const copy = { ...one, id: 5, run_attempt: 2 };
    const rerun = {
      ...one,
      id: 6,
      run_attempt: 3,
      started_at: 'c',
      completed_at: 'd',
      runner_name: 'r2'
    };
    expect(executions([rerun, copy, one]).map((j: { id: number }) => j.id)).toEqual([1, 6]);
  });

  it('counts a job as measured only when a perf step ran', () => {
    const step = (name: string, conclusion: string) => ({ name, conclusion });
    expect(
      measuredSteps({ steps: [step('Install Chromium for the browser work pins', 'success')] })
    ).toHaveLength(0);
    expect(
      measuredSteps({ steps: [step('Ticks per second, base against head', 'skipped')] })
    ).toHaveLength(0);
    expect(
      measuredSteps({ steps: [step('Ticks per second, base against head', 'failure')] })
    ).toHaveLength(1);
  });
});

interface Job {
  id: number;
  run_attempt: number;
  name: string;
  started_at: string;
  completed_at: string;
  runner_name: string;
  conclusion: string;
  steps: { name: string; conclusion: string }[];
}

function fakeGitHub() {
  const runs = [
    {
      id: 100,
      run_attempt: 1,
      run_number: 7,
      status: 'completed',
      event: 'push',
      conclusion: 'success',
      head_branch: 'dev',
      head_sha: 'a'.repeat(40),
      created_at: '2026-11-25T01:38:00Z',
      html_url: 'https://github.com/bk-bf/Fantasia4x/actions/runs/100',
      pull_requests: []
    },
    {
      id: 101,
      run_attempt: 1,
      run_number: 8,
      status: 'completed',
      event: 'push',
      conclusion: 'success',
      head_branch: 'dev',
      head_sha: 'b'.repeat(40),
      created_at: '2026-11-25T02:00:00Z',
      html_url: 'https://github.com/bk-bf/Fantasia4x/actions/runs/101',
      pull_requests: []
    }
  ];
  const job = (id: number, attempt: number, name: string, step: string, started: string): Job => ({
    id,
    run_attempt: attempt,
    name,
    started_at: started,
    completed_at: started.replace('01:4', '01:5'),
    runner_name: 'GitHub Actions 1',
    conclusion: 'success',
    steps: [{ name: step, conclusion: 'success' }]
  });
  const jobs: Record<number, Job[]> = {
    100: [
      job(1, 1, 'Ticks per second', 'Ticks per second, base against head', '2026-11-25T01:43:17Z'),
      job(
        2,
        1,
        'Measurements: work pins, Rust instruction counts, browser work pins',
        'Work pins, base against head',
        '2026-11-25T01:44:00Z'
      ),
      job(
        3,
        1,
        'Pre-check: pnpm check, related tests, seams, workflow lint',
        'pnpm check and the related tests',
        '2026-11-25T01:40:00Z'
      )
    ],
    101: [
      job(
        4,
        1,
        'Pre-check: pnpm check, related tests, seams, workflow lint',
        'pnpm check and the related tests',
        '2026-11-25T02:01:00Z'
      )
    ]
  };
  const logs: Record<number, string> = {
    1: log('tps.log'),
    2: log('measure.log'),
    7: log('codspeed.log')
  };
  const zips: Record<number, Buffer> = {
    14983072852: storedZip({ 'tps-notes.jsonl': fixture('tps-notes.jsonl') }),
    14983128949: storedZip({ 'codspeed-counts.json': fixture('codspeed-counts.json') })
  };
  const calls: string[] = [];
  const api = {
    counter: { calls: 0 },
    budget: 5000,
    remaining() {
      return this.budget;
    },
    json(path: string) {
      this.counter.calls++;
      calls.push(path);
      if (path.includes('/workflows/promote.yml/'))
        return { data: { total_count: 0, workflow_runs: [] } };
      if (path.includes('/workflows/check.yml/'))
        return { data: { total_count: runs.length, workflow_runs: runs } };
      const id = Number(/runs\/(\d+)\/jobs/.exec(path)?.[1]);
      return { data: { total_count: jobs[id].length, jobs: jobs[id] } };
    },
    text(path: string) {
      this.counter.calls++;
      calls.push(path);
      const id = Number(/jobs\/(\d+)\/logs/.exec(path)?.[1]);
      return logs[id] ? { data: logs[id] } : { error: 410 };
    },
    download(path: string, file: string) {
      this.counter.calls++;
      calls.push(path);
      const id = Number(/artifacts\/(\d+)\/zip/.exec(path)?.[1]);
      if (!zips[id]) return { error: 410 };
      writeFileSync(file, zips[id]);
      return { data: file };
    }
  };
  return { api, runs, jobs, calls, job, logs, zips };
}

describe('CI ingest', () => {
  let root: string;
  let localDir: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ledger-ci-'));
    localDir = mkdtempSync(join(tmpdir(), 'ledger-ci-artifacts-'));
    mkdirSync(join(localDir, '100', 'frame-budget'), { recursive: true });
    copyFileSync(
      join(FIXTURES, 'frame-budget.json'),
      join(localDir, '100', 'frame-budget', 'frame-budget.json')
    );
  });

  it('records one entry per measured job, with its log, artifacts and numbers', async () => {
    const gh = fakeGitHub();
    const report = await ingestCI(root, { api: gh.api, floor: 0, localDir });
    expect(report).toMatchObject({ runs: 2, entries: 2, expired: 1, errors: [], stopped: null });
    const entries = listEntries(root, { kind: 'ci' });
    expect(entries).toHaveLength(2);
    const tps = entries.find((e: { tool: string }) => e.tool === 'tps');
    expect(tps).toMatchObject({
      kind: 'ci',
      machine: 'github',
      branch: 'dev',
      commit: 'a'.repeat(40),
      scenario: 'dev-save,large-wilderness',
      launchedBy: { who: 'ci', ciRunId: 100, ciJob: 'Ticks per second', ciAttempt: 1 },
      perf: { tps: { median: 264, n: 5 } }
    });
    expect(tps.invalid).toBeUndefined();
    expect(tps.perf.legs.tps.notes[0].headMs).toBe(153.41965749999963);
    const logFile = tps.files.find((f: { role: string }) => f.role === 'log');
    expect(gunzipSync(readBlob(root, logFile.sha256)).toString('utf8')).toBe(log('tps.log'));
    expect(tps.files.map((f: { name: string }) => f.name)).toContain('tps-notes/tps-notes.jsonl');
    const measure = entries.find((e: { tool: string }) => e.tool === 'frame-budget,work-pins');
    expect(measure.invalid).toEqual(['artifacts expired']);
    expect(measure.scenario).toBe('colony,dev-save,large-wilderness,mobs');
    expect(measure.perf.legs['frame-budget'].phases.idle.medianMs).toHaveLength(2);
    expect(measure.files.map((f: { name: string }) => f.name)).toContain(
      'frame-budget/frame-budget.json'
    );
  });

  it('spends only the run listing on a second sync, and lists only recent runs once caught up', async () => {
    const gh = fakeGitHub();
    await ingestCI(root, { api: gh.api, floor: 0, localDir });
    gh.calls.length = 0;
    const again = await ingestCI(root, { api: gh.api, floor: 0, localDir });
    expect(again).toMatchObject({ runs: 0, entries: 0 });
    expect(gh.calls).toHaveLength(2);
    expect(gh.calls[0]).toMatch(/created=%3E%3D2026-11-18T02:00:00Z/);
    expect(readCursor(root).runs['100']).toMatchObject({ attempt: 1, workflow: 'check.yml' });
  });

  it('takes only the jobs a new attempt actually ran', async () => {
    const gh = fakeGitHub();
    await ingestCI(root, { api: gh.api, floor: 0, localDir });
    gh.runs[0].run_attempt = 2;
    const copied = { ...gh.jobs[100][0], id: 5, run_attempt: 2 };
    const rerun = gh.job(
      7,
      2,
      'CodSpeed benchmarks',
      'Exact counts from the profiles',
      '2026-11-25T01:46:00Z'
    );
    gh.jobs[100].push(copied, rerun);
    const report = await ingestCI(root, { api: gh.api, floor: 0, localDir });
    expect(report.entries).toBe(1);
    const codspeed = listEntries(root, { tool: 'codspeed' });
    expect(codspeed).toHaveLength(1);
    expect(codspeed[0].launchedBy.ciAttempt).toBe(2);
    expect(
      codspeed[0].perf.legs.codspeed.counts['tools/bench/jobs.bench.ts::jobs::haul:crowded'].Ir
    ).toBe(2215158);
    expect(codspeed[0].scenario).toBe('body,jobs');
  });

  it('stops at the budget floor and resumes where it stopped', async () => {
    const gh = fakeGitHub();
    gh.api.budget = 100;
    const stopped = await ingestCI(root, { api: gh.api, floor: 500, localDir });
    expect(stopped.stopped).toMatch(/floor of 500/);
    expect(stopped.calls).toBe(0);
    expect(listEntries(root, { kind: 'ci' })).toHaveLength(0);
    const capped = await ingestCI(root, {
      api: { ...gh.api, budget: 5000 },
      floor: 0,
      maxCalls: 14,
      localDir
    });
    expect(capped.stopped).toMatch(/14-call cap/);
    expect(capped.runs).toBe(1);
    expect(readCursor(root).workflows['check.yml'].complete).toBe(false);
    const rest = await ingestCI(root, { api: { ...gh.api, budget: 5000 }, floor: 0, localDir });
    expect(rest).toMatchObject({ runs: 1, stopped: null });
    expect(listEntries(root, { kind: 'ci' })).toHaveLength(2);
    expect(readCursor(root).workflows['check.yml'].complete).toBe(true);
  });

  it('rebuilds an empty store, taking what GitHub has dropped from the previous store', async () => {
    const gh = fakeGitHub();
    await ingestCI(root, { api: gh.api, floor: 0, localDir });
    delete gh.zips[14983072852];
    delete gh.logs[2];
    const fresh = mkdtempSync(join(tmpdir(), 'ledger-ci-fresh-'));
    const report = await ingestCI(fresh, { api: gh.api, floor: 0, localDir, previous: root });
    expect(report).toMatchObject({ runs: 2, entries: 2, restored: 2, carried: 0 });
    const tps = listEntries(fresh, { tool: 'tps' })[0];
    expect(tps.invalid).toBeUndefined();
    expect(tps.perf.legs.tps.notes[0].name).toBe('dev-save 60 ticks');
    const measure = listEntries(fresh, { tool: 'work-pins' })[0];
    expect(measure.perf.legs['work-pins'].changed).toBe(863);
    expect(measure.invalid).toEqual(['artifacts expired']);
  });

  it('carries over entries of runs GitHub no longer lists once the rebuild has caught up', async () => {
    const gh = fakeGitHub();
    await ingestCI(root, { api: gh.api, floor: 0, localDir });
    const old = listEntries(root, { kind: 'ci' });
    gh.runs.splice(0, 1);
    const fresh = mkdtempSync(join(tmpdir(), 'ledger-ci-fresh-'));
    const report = await ingestCI(fresh, { api: gh.api, floor: 0, localDir, previous: root });
    expect(report).toMatchObject({ runs: 1, entries: 0, carried: 2 });
    expect(listEntries(fresh, { kind: 'ci' }).map((e: { id: string }) => e.id)).toEqual(
      old.map((e: { id: string }) => e.id)
    );
    const again = await ingestCI(fresh, { api: gh.api, floor: 0, localDir, previous: root });
    expect(again.carried).toBe(0);
  });
});
