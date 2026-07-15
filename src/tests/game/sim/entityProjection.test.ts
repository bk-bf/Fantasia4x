import { describe, it, expect } from 'vitest';
import { truncateSentPath, projectSentEntity, PATH_LOOKAHEAD } from '$lib/game/sim/entityProjection';

const cells = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i, y: 0 }));

describe('truncateSentPath (§D entity projection)', () => {
  it('keeps the next PATH_LOOKAHEAD cells and re-bases pathIndex to 0', () => {
    const o: Record<string, unknown> = { path: cells(10), pathIndex: 3 };
    truncateSentPath(o);
    expect(o.path).toEqual([
      { x: 3, y: 0 },
      { x: 4, y: 0 }
    ]);
    expect(o.pathIndex).toBe(0);
    expect(PATH_LOOKAHEAD).toBe(2);
  });

  it("preserves the renderer's next cell — truncated path[0] === original path[pathIndex]", () => {
    const original = cells(8);
    const o: Record<string, unknown> = { path: original.slice(), pathIndex: 5 };
    truncateSentPath(o);
    expect((o.path as { x: number }[])[0]).toEqual(original[5]);
  });

  it('keeps the FULL path for a drafted pawn with an active order (draft overlay reads it)', () => {
    const full = cells(10);
    const o: Record<string, unknown> = {
      path: full,
      pathIndex: 2,
      drafted: true,
      draftTarget: { type: 'move', x: 9, y: 0 }
    };
    truncateSentPath(o);
    expect(o.path).toBe(full); // same ref, untouched
    expect(o.pathIndex).toBe(2);
  });

  it('truncates a drafted pawn with NO active order (drafted alone is not enough)', () => {
    const o: Record<string, unknown> = { path: cells(6), pathIndex: 1, drafted: true };
    truncateSentPath(o);
    expect((o.path as unknown[]).length).toBe(PATH_LOOKAHEAD);
    expect(o.pathIndex).toBe(0);
  });

  it('does not reallocate an already-minimal path (no churn for idle/short-path entities)', () => {
    const short = cells(2);
    const o: Record<string, unknown> = { path: short, pathIndex: 0 };
    truncateSentPath(o);
    expect(o.path).toBe(short); // same ref — skipped the slice
  });

  it('is a no-op when there is no path or an empty path', () => {
    const a: Record<string, unknown> = {};
    truncateSentPath(a);
    expect(a.path).toBeUndefined();

    const b: Record<string, unknown> = { path: [], pathIndex: 0 };
    truncateSentPath(b);
    expect(b.path).toEqual([]);
  });
});

describe('projectSentEntity (§D entity projection — drop worker-only sub-fields)', () => {
  it('keeps every continuously-drifting need (incl. thirst & hygiene), drops only lastX timestamps', () => {
    const canonicalNeeds = {
      hunger: 50,
      fatigue: 30,
      sleep: 10,
      thirst: 40,
      hygiene: 20,
      lastSleep: 123,
      lastMeal: 456,
      lastDrink: 789,
      lastWash: 101
    };
    const o: Record<string, unknown> = { id: 'p1', needs: { ...canonicalNeeds } };
    projectSentEntity(o);
    expect(o.needs).toEqual({ hunger: 50, fatigue: 30, sleep: 10, thirst: 40, hygiene: 20 });
    // thirst (fastest-drifting) and hygiene (shown live in the work list) are NOT demoted.
    expect((o.needs as Record<string, unknown>).thirst).toBe(40);
    expect((o.needs as Record<string, unknown>).hygiene).toBe(20);
  });

  it('projects activeJob to the only main-thread reads (type/resourceId/progress)', () => {
    const o: Record<string, unknown> = {
      id: 'p1',
      activeJob: {
        type: 'harvest',
        resourceId: 'pine_tree',
        progress: 0.4,
        jobId: 'job-7',
        targetX: 12,
        targetY: 34,
        depositX: 1,
        depositY: 2,
        timeRequired: 5,
        buildingId: 'b1'
      }
    };
    projectSentEntity(o);
    expect(o.activeJob).toEqual({ type: 'harvest', resourceId: 'pine_tree', progress: 0.4 });
  });

  it('never mutates the canonical entity (nested objects rebuilt fresh)', () => {
    const needs = { hunger: 5, lastMeal: 99 };
    const activeJob = { type: 'craft', progress: 0.1, jobId: 'j1' };
    const e = { id: 'p1', needs, activeJob };
    const o: Record<string, unknown> = { ...e }; // shallow clone, as the worker does for full sends
    projectSentEntity(o);
    expect(needs).toEqual({ hunger: 5, lastMeal: 99 }); // untouched
    expect(activeJob).toEqual({ type: 'craft', progress: 0.1, jobId: 'j1' }); // untouched
    expect(o.needs).not.toBe(needs);
    expect(o.activeJob).not.toBe(activeJob);
  });

  it('handles entities without needs/activeJob (mobs, idle pawns)', () => {
    const o: Record<string, unknown> = { id: 'm1', path: [{ x: 0, y: 0 }], pathIndex: 0 };
    expect(() => projectSentEntity(o)).not.toThrow();
    expect(o.needs).toBeUndefined();
    expect(o.activeJob).toBeUndefined();
  });

  it('drops jobQueue (worker-only FSM lookahead) and the redundant state FSM booleans', () => {
    const o: Record<string, unknown> = {
      id: 'p1',
      jobQueue: ['job-1', 'job-2', 'job-3', 'job-4'],
      state: { mood: 60, health: 90, isWorking: true, isSleeping: false, isEating: false }
    };
    projectSentEntity(o);
    expect(o.jobQueue).toBeUndefined();
    expect(o.state).toEqual({ mood: 60, health: 90 }); // mood/health kept; booleans dropped
  });

  it("leaves a mob's STRING state intact (not turned into a char-indexed object)", () => {
    // Regression: omit() over a string `for…in`s its char-indices → {0:'C',…} → "[object Object]"
    // in the mob HUD. Mobs carry a MobState string, not the pawn's object state.
    const o: Record<string, unknown> = { id: 'm1', state: 'Collapsed' };
    projectSentEntity(o);
    expect(o.state).toBe('Collapsed');
  });
});
