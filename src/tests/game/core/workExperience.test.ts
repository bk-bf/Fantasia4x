import { describe, it, expect } from 'vitest';
import { applyWorkXp, MAX_WORK_LEVEL, xpToNext } from '$lib/game/core/rules/body/workExperience';
import type { Pawn } from '$lib/game/core/types';

const pawnAt = (level: number, xp = 0): Pawn =>
  ({ id: 'p', skills: { mining: level }, skillXp: { mining: xp } }) as unknown as Pawn;

describe('applyWorkXp', () => {
  it('raises several levels from one award and keeps the overflow', () => {
    const out = applyWorkXp(pawnAt(1), 'mining', xpToNext(1) + xpToNext(2) + 5)!;
    expect(out.skills!.mining).toBe(3);
    expect(out.skillXp!.mining).toBe(5);
  });

  it('adds an award below the threshold to the stored progress', () => {
    const out = applyWorkXp(pawnAt(4, 10), 'mining', 7)!;
    expect(out.skills!.mining).toBe(4);
    expect(out.skillXp!.mining).toBe(17);
  });

  it('returns null for a pawn already at the maximum level', () => {
    expect(applyWorkXp(pawnAt(MAX_WORK_LEVEL), 'mining', 1000)).toBeNull();
  });

  it('stops at the maximum level with no progress left over', () => {
    const before = MAX_WORK_LEVEL - 1;
    const out = applyWorkXp(pawnAt(before), 'mining', xpToNext(before) + 50)!;
    expect(out.skills!.mining).toBe(MAX_WORK_LEVEL);
    expect(out.skillXp!.mining).toBe(0);
  });
});
