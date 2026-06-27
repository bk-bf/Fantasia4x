import { describe, it, expect } from 'vitest';
import { pawnService } from './PawnService';
import type { GameState, Pawn, PlacedBuilding } from '../core/types';

/**
 * §M getMoodBreakdown — the signed per-tick mood drivers + net trend surfaced by the MOOD pop-up.
 * MUST mirror the deltas applied in calculateStateUpdate (a drift here means the readout lies). These
 * lock the sign of each driver and that `trend` is their sum.
 */
function pawn(needs: Partial<Pawn['needs']> = {}, state: Partial<Pawn['state']> = {}): Pawn {
  return {
    id: 'p1',
    name: 'Tester',
    isAlive: true,
    drafted: false,
    position: { x: 0, y: 0 },
    needs: { hunger: 10, fatigue: 10, thirst: 10, hygiene: 10, sleep: 0, lastSleep: 0, lastMeal: 0, ...needs },
    state: { health: 100, mood: 50, isWorking: false, isSleeping: false, isEating: false, ...state },
    conditions: [],
    racialTraits: []
  } as unknown as Pawn;
}

function makeState(p: Pawn, buildings: PlacedBuilding[] = []): GameState {
  return { seed: 1, turn: 0, pawns: [p], buildings, weather: undefined } as unknown as GameState;
}

describe('§M getMoodBreakdown', () => {
  it('a contented pawn (low needs) has no debuff drivers — only the ambient weather, if any', () => {
    const out = pawnService.getMoodBreakdown(pawn(), makeState(pawn()));
    expect(out.drivers.every((d) => d.delta >= 0)).toBe(true);
    expect(out.trend).toBeGreaterThanOrEqual(0);
    expect(out.mood).toBe(50);
  });

  it('a starving pawn gets a negative "Starving" driver and a falling trend', () => {
    const out = pawnService.getMoodBreakdown(pawn({ hunger: 95 }), makeState(pawn({ hunger: 95 })));
    const starving = out.drivers.find((d) => d.label === 'Starving');
    expect(starving?.delta).toBe(-5);
    expect(out.trend).toBeLessThan(0);
  });

  it('trend equals the sum of all driver deltas', () => {
    const p = pawn({ thirst: 95, hygiene: 90 });
    const out = pawnService.getMoodBreakdown(p, makeState(p));
    const sum = out.drivers.reduce((s, d) => s + d.delta, 0);
    expect(out.trend).toBeCloseTo(sum, 5);
    // Parched (-4) and Filthy (-1) both fire.
    expect(out.drivers.find((d) => d.label === 'Parched')?.delta).toBe(-4);
    expect(out.drivers.find((d) => d.label === 'Filthy')?.delta).toBe(-1);
  });

  it('§M pleasant surroundings (nearby couch) add a positive driver', () => {
    const couch = { id: 'c1', type: 'couch', x: 0, y: 0, status: 'complete', progress: 1 } as PlacedBuilding;
    const p = pawn();
    const out = pawnService.getMoodBreakdown(p, makeState(p, [couch]));
    const pleasant = out.drivers.find((d) => d.label === 'Pleasant surroundings');
    expect(pleasant).toBeDefined();
    expect(pleasant!.delta).toBeGreaterThan(0);
  });
});
