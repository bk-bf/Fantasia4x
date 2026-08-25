import { describe, it, expect } from 'vitest';
import { selectIdleNeed, selectInterruptNeed } from '$lib/game/systems/pawn/needSelection';
import type { GameState, Pawn } from '$lib/game/core/types';

const starving = (over: Partial<Pawn> = {}): Pawn =>
  ({
    id: 'p1',
    name: 'Test',
    position: { x: 0, y: 0 },
    needs: { hunger: 95, thirst: 0, fatigue: 0, hygiene: 0 },
    ...over
  }) as unknown as Pawn;

const gs = { stockpile: { spit_meat: 5 }, pawns: [] } as unknown as GameState;

describe('force work neglects needs', () => {
  it('a normal starving pawn chooses to eat (control)', () => {
    expect(selectIdleNeed(starving(), gs)).toEqual({ kind: 'eat' });
  });

  it('selectIdleNeed returns null when forceWork is on', () => {
    expect(selectIdleNeed(starving({ forceWork: true }), gs)).toBeNull();
  });

  it('selectInterruptNeed returns null when forceWork is on', () => {
    const out = selectInterruptNeed(starving({ forceWork: true }), gs, 'Working', 3, [], 2);
    expect(out).toBeNull();
  });
});
