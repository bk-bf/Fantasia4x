import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getEntry,
  listEntries,
  putEntry,
  putBlob,
  readBlob
} from '../../../../tools/ledger/store.mjs';
import { fileRef } from '../../../../tools/ledger/spool.mjs';
import { attribute } from '../../../../tools/ledger/supersede.mjs';

type Entry = {
  id: string;
  kind: string;
  at: string;
  machine: string;
  branch: string | null;
  commit: string | null;
  dirty: number | null;
  tool: string | null;
  supersedes?: string;
  invalid?: string[];
  launchedBy: { who: string | null; session: string | null };
  perf: Record<string, unknown>;
  files: { role: string; name: string; sha256: string }[];
  note: string;
};

const STEADY_FIX = '1c851dacf7353ee56e4dcc60b25d4b9d96d01812';
const BEFORE_FIX = '30487224b8ede8a91872899b19fc841b290696c4';

let dir: string;
let root: string;
let run: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ledger-supersede-'));
  root = join(dir, 'store');
  run = join(dir, 'run');
  mkdirSync(join(run, 'capture'), { recursive: true });
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function bench(id: string, at: string, extra: Record<string, unknown> = {}) {
  writeFileSync(join(run, 'base-1-steady.json'), JSON.stringify({ rows: [1] }));
  const sha = putBlob(root, join(run, 'base-1-steady.json'));
  putEntry(root, {
    v: 1,
    id,
    kind: 'bench',
    at,
    recordedAt: at,
    launchedBy: {
      who: 'agent',
      session: null,
      thread: null,
      ciRunId: null,
      ciJob: null,
      ciAttempt: null
    },
    machine: 'desktop',
    branch: null,
    commit: null,
    dirty: null,
    refs: null,
    tool: 'steady',
    scenario: null,
    world: { save: null },
    perf: { rows: [1] },
    files: [fileRef('result', 'base-1-steady.json', sha, root)],
    parent: null,
    note: 'the output names no commit',
    ...extra
  });
}

describe('superseding an entry', () => {
  it('writes a corrected copy with the new files, hides the old one from list, and keeps it readable', () => {
    const old = '20261127T005000Z-desktop-aaaaaa';
    bench(old, '2026-11-27T00:50:00.000Z');
    writeFileSync(join(run, 'base-1.log'), 'TREE bench-tg-base');
    const [r] = attribute(
      root,
      [
        {
          supersedes: old,
          set: {
            commit: BEFORE_FIX,
            branch: null,
            refs: 'origin/test/look-overhaul',
            dirty: 0,
            launchedBy: { session: 's-1' },
            checkout: 'wt/bench-tg-base'
          },
          files: [{ path: 'base-1.log' }],
          note: 'attributed from session s-1'
        }
      ],
      run
    );
    expect(r.created).toBe(true);
    const e = getEntry(root, r.id) as unknown as Entry & { checkout: string };
    expect(e.supersedes).toBe(old);
    expect(e.at).toBe('2026-11-27T00:50:00.000Z');
    expect(e.commit).toBe(BEFORE_FIX);
    expect(e.launchedBy).toMatchObject({ who: 'agent', session: 's-1' });
    expect(e.checkout).toBe('wt/bench-tg-base');
    expect(e.perf).toEqual({ rows: [1] });
    expect(e.files.map((f) => f.name)).toEqual(['base-1-steady.json', 'base-1.log']);
    expect(readBlob(root, e.files[1].sha256).toString()).toBe('TREE bench-tg-base');
    expect(e.note).toBe('the output names no commit; attributed from session s-1');
    expect((listEntries(root) as unknown as Entry[]).map((x) => x.id)).toEqual([r.id]);
    expect(
      (listEntries(root, { all: true }) as unknown as Entry[]).map((x) => x.id).sort()
    ).toEqual([old, r.id].sort());
    expect(getEntry(root, old).commit).toBeNull();
  });

  it('supersedes an entry once, however often the same list is applied', () => {
    const old = '20261127T005000Z-desktop-aaaaaa';
    bench(old, '2026-11-27T00:50:00.000Z');
    const item = { supersedes: old, set: { commit: BEFORE_FIX } };
    const [a] = attribute(root, [item], run);
    const [b] = attribute(root, [{ ...item, set: { commit: STEADY_FIX } }], run);
    expect(b).toMatchObject({ id: a.id, created: false });
    expect(listEntries(root, { all: true })).toHaveLength(2);
  });

  it('judges a run against the speed fix again once its commit is known', () => {
    const before = '20261127T005000Z-desktop-aaaaaa';
    const after = '20261127T051100Z-desktop-bbbbbb';
    bench(before, '2026-11-27T00:50:00.000Z', {
      invalid: ['tps: speed not set, fixed in 30487224/1c851dac', 'load 2.1 at start']
    });
    bench(after, '2026-11-27T05:11:00.000Z');
    const [fixed, unfixed] = attribute(
      root,
      [
        { supersedes: before, set: { commit: STEADY_FIX } },
        { supersedes: after, set: { commit: BEFORE_FIX } }
      ],
      run
    );
    expect((getEntry(root, fixed.id) as unknown as Entry).invalid).toEqual(['load 2.1 at start']);
    expect((getEntry(root, unfixed.id) as unknown as Entry).invalid).toEqual([
      'tps: speed not set, fixed in 30487224/1c851dac'
    ]);
  });

  it('writes a new entry for files the store lacks, timed by the oldest of them, once', () => {
    writeFileSync(join(run, 'capture', 'painted-spring-fit.png'), 'png-a');
    writeFileSync(join(run, 'capture.log'), 'wrote 6 scenes');
    utimesSync(
      join(run, 'capture', 'painted-spring-fit.png'),
      new Date('2026-11-27T01:20:00Z'),
      new Date('2026-11-27T01:20:00Z')
    );
    utimesSync(
      join(run, 'capture.log'),
      new Date('2026-11-27T01:21:00Z'),
      new Date('2026-11-27T01:21:00Z')
    );
    const item = {
      set: {
        machine: 'desktop',
        tool: 'capture',
        commit: STEADY_FIX,
        launchedBy: { who: 'agent', session: 's-2' }
      },
      files: [
        { path: 'capture/painted-spring-fit.png', name: 'capture/painted-spring-fit.png' },
        { path: 'capture.log' }
      ]
    };
    const [r] = attribute(root, [item], run);
    const e = getEntry(root, r.id) as unknown as Entry;
    expect(e).toMatchObject({
      kind: 'bench',
      machine: 'desktop',
      tool: 'capture',
      at: '2026-11-27T01:20:00.000Z',
      commit: STEADY_FIX
    });
    expect(e.supersedes).toBeUndefined();
    expect(e.files.map((f) => [f.role, f.name])).toEqual([
      ['result', 'capture/painted-spring-fit.png'],
      ['log', 'capture.log']
    ]);
    expect(attribute(root, [item], run)[0]).toMatchObject({ id: r.id, created: false });
  });

  it('refuses to supersede what the store does not hold and to rewrite the fields that name an entry', () => {
    const old = '20261127T005000Z-desktop-aaaaaa';
    bench(old, '2026-11-27T00:50:00.000Z');
    expect(() =>
      attribute(root, [{ supersedes: '20261127T005000Z-desktop-ffffff', set: {} }], run)
    ).toThrow();
    expect(() => attribute(root, [{ supersedes: old, set: { id: 'x' } }], run)).toThrow(
      /cannot change id/
    );
    expect(() => attribute(root, [{ set: { machine: 'desktop' } }], run)).toThrow(/needs files/);
    expect(() =>
      putEntry(root, {
        v: 1,
        id: '20261127T010000Z-desktop-cccccc',
        kind: 'bench',
        machine: 'desktop',
        files: [],
        supersedes: '20261127T005000Z-desktop-ffffff'
      })
    ).toThrow(/not another entry/);
  });
});
