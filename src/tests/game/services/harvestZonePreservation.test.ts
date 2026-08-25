import { describe, it, expect } from 'vitest';
import { jobService } from '$lib/game/services/JobService';
import { designationService } from '$lib/game/services/DesignationService';
import type { GameState, Job, Pawn } from '$lib/game/core/types';

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

    expect(out.zoneTiles?.['0,0']).toEqual(['stockpile']);
    expect(out.designations['0,0']).toBeUndefined();
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
