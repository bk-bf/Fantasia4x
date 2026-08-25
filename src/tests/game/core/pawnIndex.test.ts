import { describe, it, expect } from 'vitest';
import { pawnById } from '$lib/game/core/state/pawnIndex';
import type { Pawn } from '$lib/game/core/types';

const p = (id: string, over: Partial<Pawn> = {}): Pawn => ({ id, ...over }) as Pawn;

describe('pawnById', () => {
  it('finds a pawn by id', () => {
    const pawns = [p('a'), p('b'), p('c')];
    expect(pawnById(pawns, 'b')).toBe(pawns[1]);
    expect(pawnById(pawns, 'nope')).toBeUndefined();
  });

  it('reflects in-place mutation (same array ref, mutated element)', () => {
    const pawns = [p('a', { name: 'old' } as Partial<Pawn>)];
    expect(pawnById(pawns, 'a')).toBe(pawns[0]);
    (pawns[0] as { name?: string }).name = 'new';
    expect((pawnById(pawns, 'a') as { name?: string }).name).toBe('new');
  });

  it('rebuilds when the array reference changes (add/remove)', () => {
    const v1 = [p('a'), p('b')];
    expect(pawnById(v1, 'b')).toBe(v1[1]);
    const v2 = [v1[0]];
    expect(pawnById(v2, 'b')).toBeUndefined();
    expect(pawnById(v2, 'a')).toBe(v2[0]);
    const v3 = [...v2, p('c')];
    expect(pawnById(v3, 'c')).toBe(v3[1]);
  });
});
