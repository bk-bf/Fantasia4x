import { describe, it, expect } from 'vitest';
import { getActiveConditionViews } from '$lib/components/util/conditionInfo';
import type { Pawn } from '$lib/game/core/types';

function pawnWithTransient(id: string): Pawn {
  return {
    id: 'test-pawn',
    conditions: [],
    transientConditions: [id],
    traits: []
  } as unknown as Pawn;
}

describe('conditionInfo.getActiveConditionViews', () => {
  it('lists an effect line for a hygieneRate modifier (the clean condition)', () => {
    const [view] = getActiveConditionViews(pawnWithTransient('clean'));
    expect(view).toBeDefined();
    expect(view.effects.length).toBeGreaterThan(0);
    expect(view.effects[0]).toMatch(/Hygiene rate/);
  });
});
