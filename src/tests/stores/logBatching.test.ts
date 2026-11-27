import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import {
  activityLog,
  debugLog,
  appendCapped,
  batchLogReplay,
  logActivity,
  logDiag,
  logCombatSwing,
  keepaliveBodies,
  postMirror,
  __resetCombatSessions
} from '$lib/stores/Log';

function diag(turn: number) {
  logDiag({ turn, category: 'needs', message: `line ${turn}` });
}

function activity(turn: number) {
  logActivity({
    turn,
    type: 'work',
    actor: 'p',
    action: `a ${turn}`,
    result: '',
    severity: 'info'
  });
}

describe('appendCapped', () => {
  it('keeps the newest entries in order and never exceeds the cap', () => {
    expect(appendCapped([1, 2, 3], [4, 5], 4)).toEqual([2, 3, 4, 5]);
    expect(appendCapped([1, 2], [3], 10)).toEqual([1, 2, 3]);
    expect(appendCapped([1, 2], [3, 4, 5, 6, 7], 3)).toEqual([5, 6, 7]);
    expect(appendCapped([], [], 3)).toEqual([]);
  });

  it('leaves the original array untouched', () => {
    const log = [1, 2, 3];
    appendCapped(log, [4], 3);
    expect(log).toEqual([1, 2, 3]);
  });
});

describe('debug log', () => {
  beforeEach(() => debugLog.set([]));

  it('caps at 2500 and keeps the newest lines in order, in and out of a batch', () => {
    for (let t = 0; t < 1500; t++) diag(t);
    batchLogReplay(() => {
      for (let t = 1500; t < 3000; t++) diag(t);
    });
    const log = get(debugLog);
    expect(log).toHaveLength(2500);
    expect(log[0].turn).toBe(500);
    expect(log[2499].turn).toBe(2999);
    expect(log.every((e, i) => i === 0 || e.turn === log[i - 1].turn + 1)).toBe(true);
  });

  it('notifies subscribers once per replayed batch with every line in it', () => {
    const seen: number[] = [];
    const unsub = debugLog.subscribe((log) => seen.push(log.length));
    seen.length = 0;
    batchLogReplay(() => {
      for (let t = 0; t < 30; t++) diag(t);
    });
    batchLogReplay(() => {
      for (let t = 30; t < 60; t++) diag(t);
    });
    unsub();
    expect(seen).toEqual([30, 60]);
  });

  it('shows lines appended inside a batch to a read made inside it', () => {
    batchLogReplay(() => {
      diag(1);
      diag(2);
      expect(get(debugLog).map((e) => e.turn)).toEqual([1, 2]);
      diag(3);
    });
    expect(get(debugLog).map((e) => e.turn)).toEqual([1, 2, 3]);
  });

  it('notifies once per line outside a batch', () => {
    const seen: number[] = [];
    const unsub = debugLog.subscribe((log) => seen.push(log.length));
    seen.length = 0;
    diag(1);
    diag(2);
    unsub();
    expect(seen).toEqual([1, 2]);
  });
});

describe('activity log', () => {
  beforeEach(() => {
    activityLog.set([]);
    __resetCombatSessions();
  });

  it('caps at 1000 and notifies once per batch', () => {
    const seen: number[] = [];
    const unsub = activityLog.subscribe((log) => seen.push(log.length));
    seen.length = 0;
    batchLogReplay(() => {
      for (let t = 0; t < 1200; t++) activity(t);
    });
    unsub();
    const log = get(activityLog);
    expect(seen).toEqual([1000]);
    expect(log[0].turn).toBe(200);
    expect(log[999].turn).toBe(1199);
  });

  it('folds swings replayed in one batch into the engagement entry logged in it', () => {
    batchLogReplay(() => {
      for (let t = 0; t < 5; t++) {
        logCombatSwing('mob-1', 'Wolf', 'pawn-1', 'Wren', t, 0, 0, {
          turn: t,
          attackerName: 'Wolf',
          defenderName: 'Wren',
          hit: true,
          damage: 2
        });
      }
    });
    const combat = get(activityLog).filter((e) => e.type === 'combat');
    expect(combat).toHaveLength(1);
    expect(combat[0].combatBreakdown).toHaveLength(5);
  });
});

describe('keepaliveBodies', () => {
  const line = (i: number) => ({ category: 'ai', line: `[T${i}] [info] ${'x'.repeat(200)}` });

  it('splits a burst into bodies the browser accepts for a keepalive post', () => {
    const entries = Array.from({ length: 600 }, (_, i) => line(i));
    const bodies = keepaliveBodies(entries, 60_000);
    expect(bodies.length).toBeGreaterThan(1);
    for (const body of bodies) expect(body.length).toBeLessThanOrEqual(60_000);
    expect(bodies.flatMap((b) => JSON.parse(b).entries)).toEqual(entries);
  });

  it('keeps a quiet second in one body', () => {
    expect(keepaliveBodies([line(1), line(2)])).toEqual([
      JSON.stringify({ entries: [line(1), line(2)] })
    ]);
  });
});

describe('postMirror', () => {
  it('sends a body as keepalive only while the bodies still in flight leave room for it', async () => {
    const pending: Array<() => void> = [];
    const sent: boolean[] = [];
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
      sent.push(init.keepalive === true);
      return new Promise<Response>((done) => pending.push(() => done(new Response(null))));
    });
    const body = 'x'.repeat(40_000);
    postMirror(body);
    postMirror(body);
    expect(sent).toEqual([true, false]);
    pending.splice(0).forEach((done) => done());
    await new Promise((r) => setTimeout(r, 0));
    postMirror(body);
    expect(sent).toEqual([true, false, true]);
    vi.unstubAllGlobals();
  });
});
