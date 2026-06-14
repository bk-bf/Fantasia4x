import { describe, it, expect } from 'vitest';
import { jobService } from './JobService';
import { designationService } from './DesignationService';
import type { GameState, Job, Pawn } from '../core/types';

// Regression: harvesting/chopping a resource that sits on a stockpile tile must NOT destroy the
// stockpile zone. Standing zones live in `zoneTiles`; one-shot action orders live in
// `designations`. Completing a woodcut order clears only the order — the zone survives. (Before
// the split both shared a single-value-per-tile map, so the zone vanished on harvest.)

function makeState(partial: Partial<GameState> = {}): GameState {
  return {
    seed: 1,
    turn: 0,
    jobs: [],
    designations: {},
    zoneTiles: {},
    buildings: [],
    droppedItems: [],
    worldMap: [],
    pawns: [],
    stockpile: {},
    stockpileZones: [],
    ...partial
  } as unknown as GameState;
}

const tile = (resources: Record<string, number>) =>
  ({
    x: 0,
    y: 0,
    walkable: true,
    resources,
    subType: 'soil'
  }) as unknown as GameState['worldMap'][number][number];

const pawn = (): Pawn =>
  ({
    id: 'p',
    name: 'P',
    position: { x: 1, y: 0 },
    isAlive: true,
    stats: {},
    skills: {}
  }) as unknown as Pawn;

function woodcutJobOn(x: number, y: number): Job {
  return {
    id: 'wc',
    type: 'harvest',
    resourceId: 'pine_tree',
    targetX: x,
    targetY: y,
    claimedBy: 'p',
    workDone: 0,
    workRequired: 1,
    progress: 0,
    timeRequired: 1
  } as unknown as Job;
}

describe('harvest on a stockpile tile preserves the zone', () => {
  it('woodcut completing on a stockpile tile keeps the stockpile, clears only the order', () => {
    const job = woodcutJobOn(0, 0);
    const gs = makeState({
      pawns: [pawn()],
      jobs: [job],
      worldMap: [[tile({ pine_tree: 1 })]],
      zoneTiles: { '0,0': ['stockpile'] },
      designations: { '0,0': 'woodcut' }
    });

    const out = jobService.advanceJob('wc', 1, gs);

    // The stockpile zone survives the chop…
    expect(out.zoneTiles?.['0,0']).toEqual(['stockpile']);
    // …while the one-shot woodcut order is cleared.
    expect(out.designations['0,0']).toBeUndefined();
    // And the felled tree drops onto the stockpile (absorbed as stored).
    expect((out.droppedItems ?? []).some((d) => d.stored)).toBe(true);
  });

  it('painting a harvest order over a stockpile tile does not clobber the zone', () => {
    let gs = makeState({ worldMap: [[tile({ pine_tree: 1 })]] });
    gs = designationService.designate(0, 0, 'stockpile', gs);
    gs = designationService.designate(0, 0, 'woodcut', gs);
    expect(gs.zoneTiles?.['0,0']).toEqual(['stockpile']);
    expect(gs.designations['0,0']).toBe('woodcut');
  });
});
