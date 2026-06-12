import { describe, it, expect } from 'vitest';
import { pawnService } from './PawnService';
import type { GameState, Pawn } from '../core/types';

/**
 * §D water needs — thirst & hygiene accrue each tick in processNeedsTick (like hunger),
 * and high values pressure mood. (Drinking/washing AI + dehydration→collapse are the
 * remaining Stage-4 piece; meals already quench some thirst so it isn't a no-relief penalty.)
 */
function pawn(needs: Partial<Pawn['needs']> = {}): Pawn {
  return {
    id: 'p1',
    name: 'Tester',
    isAlive: true,
    drafted: false,
    needs: { hunger: 10, fatigue: 10, sleep: 0, lastSleep: 0, lastMeal: 0, ...needs },
    state: { health: 100, mood: 50, isWorking: false, isSleeping: false, isEating: false },
    conditions: [],
    racialTraits: []
  } as unknown as Pawn;
}

function makeState(p: Pawn): GameState {
  return { seed: 1, turn: 0, pawns: [p] } as unknown as GameState;
}

describe('§D thirst & hygiene accrual (processNeedsTick)', () => {
  it('thirst rises from 0 each tick', () => {
    const out = pawnService.processNeedsTick(makeState(pawn({ thirst: 0 })));
    expect(out.pawns[0].needs.thirst!).toBeGreaterThan(0);
  });

  it('hygiene rises from 0 each tick (slower than thirst)', () => {
    const out = pawnService.processNeedsTick(makeState(pawn({ thirst: 0, hygiene: 0 })));
    const n = out.pawns[0].needs;
    expect(n.hygiene!).toBeGreaterThan(0);
    expect(n.hygiene!).toBeLessThan(n.thirst!);
  });

  it('thirst & hygiene are clamped at 100', () => {
    const out = pawnService.processNeedsTick(makeState(pawn({ thirst: 100, hygiene: 100 })));
    expect(out.pawns[0].needs.thirst!).toBeLessThanOrEqual(100);
    expect(out.pawns[0].needs.hygiene!).toBeLessThanOrEqual(100);
  });
});
