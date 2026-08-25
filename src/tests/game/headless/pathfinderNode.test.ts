import { describe, it, expect, beforeAll } from 'vitest';
import { pathfinderService, buildPathfindingGrids } from '$lib/game/services/PathfinderService';
import { GameEngineImpl } from '$lib/game/systems/GameEngineImpl';
import { GameStateManager } from '$lib/game/core/state/GameStateManager';
import { applySimCommand } from '$lib/game/sim/commands';
import { generateWorld } from '$lib/game/world/WorldGenerator';
import { generatePawns } from '$lib/game/entities/Pawns';
import { workService } from '$lib/game/services/WorkService';
import { initialGameState } from '$lib/stores/gameState';
import { rng } from '$lib/game/core/util/rng';
import type { GameState, WorldTile } from '$lib/game/core/types';

const SEED = 0xad33;

beforeAll(async () => {
  await pathfinderService.init();
});

describe('WASM pathfinder under Node (Phase 0 spike)', () => {
  it('initialises and reports ready outside the browser', () => {
    expect(pathfinderService.isReady()).toBe(true);
  });

  it('finds a detour around a wall on a synthetic grid', () => {
    const w = 5;
    const h = 5;
    const walkable = new Uint8Array(w * h).fill(1);
    const costs = new Float32Array(w * h).fill(1);
    for (let y = 0; y < 4; y++) walkable[y * w + 2] = 0;

    const path = pathfinderService.findPath(walkable, costs, w, h, 0, 0, 4, 0);
    expect(path.length).toBeGreaterThan(4);
    expect(path[path.length - 1]).toEqual({ x: 4, y: 0 });
    for (const p of path) expect(walkable[p.y * w + p.x]).toBe(1);
  });

  it('a drafted pawn walks to a move order across a generated map (pure Node tick loop)', () => {
    rng.reseed(SEED);
    const world = generateWorld(32, 32, SEED);

    const grids = buildPathfindingGrids(world as WorldTile[][]);
    const pick = findConnectedPair(world as WorldTile[][], grids, 8);
    expect(pick, 'no connected walkable pair found on the generated map').not.toBeNull();
    const { start, goal } = pick!;

    const pawns = generatePawns(initialGameState.culture, 1);
    pawns[0].position = { ...start };

    let state: GameState = {
      ...initialGameState,
      seed: SEED,
      turn: 0,
      worldMap: world,
      pawns,
      mobs: [],
      buildings: [],
      droppedItems: [],
      stockpile: {}
    };
    state = workService.ensureDefaultWorkAssignments(state);

    const pawnId = state.pawns[0].id;
    state = applySimCommand(state, { type: 'toggleDraft', payload: { pawnId } });
    state = applySimCommand(state, {
      type: 'setPawnDraftTarget',
      payload: { pawnId, target: { type: 'move', x: goal.x, y: goal.y } }
    });

    const engine = new GameEngineImpl();
    engine.setGameStateManager(new GameStateManager(state));

    const startDist = chebyshev(start, goal);
    let arrivedAt = -1;
    for (let t = 0; t < 1200; t++) {
      const res = engine.processGameTurn();
      expect(res.success).toBe(true);
      const p = engine.getGameState().pawns[0];
      if (p.position && chebyshev(p.position, goal) === 0) {
        arrivedAt = t;
        break;
      }
    }

    const finalPos = engine.getGameState().pawns[0].position!;
    const endDist = chebyshev(finalPos, goal);
    expect(endDist, `pawn stalled at ${JSON.stringify(finalPos)} (start dist ${startDist})`).toBe(
      0
    );
    expect(arrivedAt).toBeGreaterThan(0);
  });
});

function chebyshev(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function findConnectedPair(
  world: WorldTile[][],
  grids: { walkable: Uint8Array; costs: Float32Array; width: number; height: number },
  minDist: number
): { start: { x: number; y: number }; goal: { x: number; y: number } } | null {
  const h = world.length;
  const w = world[0]?.length ?? 0;
  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      if (!world[sy][sx].walkable) continue;
      for (let gy = 0; gy < h; gy++) {
        for (let gx = 0; gx < w; gx++) {
          if (!world[gy][gx].walkable) continue;
          if (chebyshev({ x: sx, y: sy }, { x: gx, y: gy }) < minDist) continue;
          const path = pathfinderService.findPath(
            grids.walkable,
            grids.costs,
            grids.width,
            grids.height,
            sx,
            sy,
            gx,
            gy
          );
          if (path.length > 0) return { start: { x: sx, y: sy }, goal: { x: gx, y: gy } };
        }
      }
    }
  }
  return null;
}
