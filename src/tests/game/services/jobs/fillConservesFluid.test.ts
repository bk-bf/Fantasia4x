import { describe, it, expect } from 'vitest';
import type { GameState, Job, Pawn } from '$lib/game/core/types';
import { jobService } from '$lib/game/services/JobService';

function state(stationLitres: number, flaskLitres: number): GameState {
  const pawn = {
    id: 'p1',
    name: 'Ada Test',
    position: { x: 1, y: 1 },
    inventory: {
      items: {},
      instances: [
        {
          instanceId: 'flask-1',
          itemId: 'flask',
          durability: 50,
          filter: ['ale'],
          contents: flaskLitres > 0 ? [{ itemId: 'ale', litres: flaskLitres }] : []
        }
      ]
    }
  } as unknown as Pawn;
  const job: Job = {
    id: 'fill-flask-1-ale',
    type: 'fill',
    targetX: 3,
    targetY: 3,
    resourceId: 'ale',
    vesselInstanceId: 'flask-1',
    workRequired: 0.4,
    workDone: 0,
    claimedBy: 'p1'
  };
  return {
    turn: 10,
    pawns: [pawn],
    jobs: [job],
    designations: {},
    droppedItems: [],
    craftingQueue: [],
    buildings: [
      {
        id: 'barrel-1',
        type: 'brewing_barrel',
        x: 3,
        y: 3,
        status: 'complete',
        fluidContents: [{ itemId: 'ale', litres: stationLitres }]
      }
    ]
  } as unknown as GameState;
}

function totalAle(gs: GameState): number {
  const station = gs.buildings[0].fluidContents?.find((e) => e.itemId === 'ale')?.litres ?? 0;
  const flask =
    gs.pawns[0].inventory?.instances?.[0]?.contents?.find((e) => e.itemId === 'ale')?.litres ?? 0;
  return Math.round((station + flask) * 1000) / 1000;
}

describe('filling a vessel from a station conserves the fluid', () => {
  for (const [station, flask] of [
    [3, 1.2],
    [2.6, 1.2],
    [5, 0.6],
    [3, 0]
  ] as const) {
    it(`station ${station} L into a flask holding ${flask} L`, () => {
      const before = state(station, flask);
      const after = jobService.advanceJob('fill-flask-1-ale', 1, before);
      expect(after.jobs).toHaveLength(0);
      expect(totalAle(after)).toBe(totalAle(before));
    });
  }
});
