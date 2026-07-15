import { describe, it, expect } from 'vitest';
import {
  distFromPointToNearestRestSource,
  computeMinQueueRestDist,
  computeMinQueueFoodDist,
  computeAdjustedNeedThreshold
} from '$lib/game/systems/pawn/pawnHelpers';
import type { GameState } from '$lib/game/core/types';

function makeState(partial: Partial<GameState> = {}): GameState {
  return {
    jobs: [],
    buildings: [],
    stockpile: {},
    droppedItems: [],
    pawns: [],
    ...partial
  } as unknown as GameState;
}

const bed = (x: number, y: number) =>
  ({ id: `bed-${x}-${y}`, type: 'hay_bed', x, y, status: 'complete' }) as any;
const campfire = (x: number, y: number) =>
  ({ id: `fire-${x}-${y}`, type: 'campfire', x, y, status: 'complete' }) as any;

describe('rest-source distance', () => {
  it('measures Manhattan distance to the nearest shelter', () => {
    const gs = makeState({ buildings: [bed(10, 0), bed(3, 4)] });
    expect(distFromPointToNearestRestSource(0, 0, gs)).toBe(7); // 3+4 is closest
  });

  it('returns 0 when there is no shelter (sleep in place)', () => {
    const gs = makeState({ buildings: [campfire(5, 5)] });
    expect(distFromPointToNearestRestSource(0, 0, gs)).toBe(0);
  });
});

describe('D8: fatigue lookahead reads REST sources, hunger reads FOOD sources', () => {
  // Queued job sits next to a bed but far from the campfire: fatigue sees a short rest distance, hunger a long food distance.
  const gs = makeState({
    jobs: [{ id: 'j1', type: 'haul', targetX: 1, targetY: 0, claimedBy: null } as any],
    buildings: [bed(2, 0), campfire(40, 0)],
    // stock a real food item so computeMinQueueFoodDist doesn't short-circuit to null
    stockpile: { wild_berries: 10 }
  });

  it('rest distance from the queued job is small (next to the bed)', () => {
    expect(computeMinQueueRestDist(['j1'], { id: 'p', position: { x: 0, y: 0 } } as any, gs)).toBe(
      1
    );
  });

  it('food distance from the queued job is large (far from the campfire)', () => {
    const foodDist = computeMinQueueFoodDist(
      ['j1'],
      { id: 'p', position: { x: 0, y: 0 } } as any,
      gs
    );
    expect(foodDist).toBe(39);
  });

  it('the two are different — proving they read different building sets', () => {
    const p = { id: 'p', position: { x: 0, y: 0 } } as any;
    expect(computeMinQueueRestDist(['j1'], p, gs)).not.toBe(computeMinQueueFoodDist(['j1'], p, gs));
  });
});

describe('ADR-010 computeAdjustedNeedThreshold', () => {
  const BASE = 72;

  it('no queue (null) applies full pressure: base minus the full reduction', () => {
    // laborLevel 2 (default) → no priority shift; null dist → pressure 1 → -5 pts.
    expect(computeAdjustedNeedThreshold(BASE, 2, null)).toBe(BASE - 5);
  });

  it('a queued job right next to the source applies no reduction', () => {
    expect(computeAdjustedNeedThreshold(BASE, 2, 0)).toBe(BASE);
  });

  it('higher labor priority raises the threshold (harder to interrupt)', () => {
    // level 4 → +8 priority shift, dist 0 → no queue reduction.
    expect(computeAdjustedNeedThreshold(BASE, 4, 0)).toBe(BASE + 8);
  });

  it('result is clamped within ±12 of the base', () => {
    expect(computeAdjustedNeedThreshold(BASE, 4, 0)).toBeLessThanOrEqual(BASE + 12);
    expect(computeAdjustedNeedThreshold(BASE, 0, null)).toBeGreaterThanOrEqual(BASE - 12);
  });
});
