import { describe, it, expect } from 'vitest';
import { truncateSentPath, PATH_LOOKAHEAD } from './entityProjection';

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
