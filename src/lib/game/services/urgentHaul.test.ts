import { describe, it, expect } from 'vitest';
import { jobService } from './JobService';
import type { GameState, WorldTile, Pawn, DroppedItem } from '../core/types';

/**
 * Urgent-haul: a stack flagged `urgent` (via the item card's URGENT HAUL button → `setDropUrgent`)
 * gets its haul job stamped `urgent` and sorted to the TOP of every pawn's available-job list, ahead
 * of labor level and distance. Flag also bypasses the stockpile-capacity cap.
 */
function tile(x: number, y: number): WorldTile {
  return { x, y, walkable: true, subType: 'grass', resources: {} } as unknown as WorldTile;
}

const wm: WorldTile[][] = [
  [tile(0, 0), tile(1, 0), tile(2, 0)],
  [tile(0, 1), tile(1, 1), tile(2, 1)]
];

function drop(over: Partial<DroppedItem>): DroppedItem {
  return { id: 'd', resourceId: 'branch', x: 2, y: 0, quantity: 3, ...over } as DroppedItem;
}

function baseState(droppedItems: DroppedItem[], jobs: GameState['jobs'] = []): GameState {
  return {
    jobs,
    worldMap: wm,
    designations: {},
    // one free stockpile tile so haul jobs are allowed
    zoneTiles: { '0,1': ['stockpile'] },
    buildings: [],
    droppedItems,
    craftingQueue: []
  } as unknown as GameState;
}

const pawnAt = (x: number, y: number): Pawn => ({ id: 'p1', position: { x, y } }) as unknown as Pawn;

describe('urgent haul', () => {
  it('stamps the generated haul job urgent for an urgent stack', () => {
    const out = jobService.generateJobs(baseState([drop({ id: 'u', urgent: true })]));
    const haul = (out.jobs ?? []).filter((j) => j.type === 'haul');
    expect(haul).toHaveLength(1);
    expect(haul[0].urgent).toBe(true);
  });

  it('sorts an urgent haul ahead of a CLOSER normal haul', () => {
    const out = jobService.generateJobs(
      baseState([
        drop({ id: 'near', x: 1, y: 0, urgent: false }), // closer to the pawn
        drop({ id: 'far', x: 2, y: 0, urgent: true }) // farther, but urgent
      ])
    );
    const avail = jobService.getAvailableJobs(pawnAt(0, 0), out);
    // Both are haul jobs; without urgency the closer "near" would come first.
    expect(avail[0].droppedItemId).toBe('far');
    expect(avail[0].urgent).toBe(true);
  });

  it('syncs the flag onto an already-queued haul job when urgency is toggled', () => {
    const first = jobService.generateJobs(baseState([drop({ id: 'd', urgent: false })]));
    expect((first.jobs ?? []).find((j) => j.type === 'haul')?.urgent).toBeUndefined();
    // Player flips it urgent; re-running generation must update the existing job (not duplicate).
    const flipped = jobService.generateJobs({
      ...first,
      droppedItems: [drop({ id: 'd', urgent: true })]
    });
    const haul = (flipped.jobs ?? []).filter((j) => j.type === 'haul');
    expect(haul).toHaveLength(1);
    expect(haul[0].urgent).toBe(true);
  });

  it('creates an urgent haul even when the stockpile is at capacity', () => {
    // Pre-fill the single stockpile slot worth of capacity with an existing haul job so the cap is hit.
    const existing = [
      {
        id: 'haul-existing',
        type: 'haul' as const,
        targetX: 1,
        targetY: 1,
        resourceId: 'branch',
        droppedItemId: 'other',
        workRequired: 1,
        workDone: 0,
        claimedBy: null
      }
    ];
    const out = jobService.generateJobs(
      baseState(
        [drop({ id: 'other', x: 1, y: 1 }), drop({ id: 'u', x: 2, y: 0, urgent: true })],
        existing
      )
    );
    const urgentJob = (out.jobs ?? []).find((j) => j.type === 'haul' && j.droppedItemId === 'u');
    expect(urgentJob?.urgent).toBe(true);
  });
});
