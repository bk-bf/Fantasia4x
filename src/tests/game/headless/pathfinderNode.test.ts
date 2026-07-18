import { describe, it, expect, beforeAll } from 'vitest';
import { pathfinderService, buildPathfindingGrids } from '$lib/game/services/PathfinderService';
import { GameEngineImpl } from '$lib/game/systems/GameEngineImpl';
import { GameStateManager } from '$lib/game/core/GameState';
import { applySimCommand } from '$lib/game/sim/commands';
import { generateWorld } from '$lib/game/world/WorldGenerator';
import { generatePawns } from '$lib/game/entities/Pawns';
import { workService } from '$lib/game/services/WorkService';
import { initialGameState } from '$lib/stores/gameState';
import { rng } from '$lib/game/core/rng';
import type { GameState, WorldTile } from '$lib/game/core/types';

/**
 * HEADLESS-SIM Phase 0 (ADR-033) — the go/no-go gate: the WASM pathfinder must load and return
 * real paths under Node (it used to be hard-gated to `isClientRuntime`, so `findPath` returned []
 * headless and nothing could move). Verifies (a) init + a raw A* detour, (b) a pawn actually
 * NAVIGATING across a generated map inside a pure Node `processGameTurn` loop.
 */
const SEED = 0xad33; // arbitrary fixed seed — the whole spike is deterministic

beforeAll(async () => {
  await pathfinderService.init();
});

describe('WASM pathfinder under Node (Phase 0 spike)', () => {
  it('initialises and reports ready outside the browser', () => {
    expect(pathfinderService.isReady()).toBe(true);
  });

  it('finds a detour around a wall on a synthetic grid', () => {
    // 5×5, all walkable except a vertical wall at x=2 with a gap at y=4.
    const w = 5;
    const h = 5;
    const walkable = new Uint8Array(w * h).fill(1);
    const costs = new Float32Array(w * h).fill(1);
    for (let y = 0; y < 4; y++) walkable[y * w + 2] = 0;

    const path = pathfinderService.findPath(walkable, costs, w, h, 0, 0, 4, 0);
    expect(path.length).toBeGreaterThan(4); // forced detour down through the gap
    expect(path[path.length - 1]).toEqual({ x: 4, y: 0 });
    // Every step must be on a walkable tile.
    for (const p of path) expect(walkable[p.y * w + p.x]).toBe(1);
  });

  it('a drafted pawn walks to a move order across a generated map (pure Node tick loop)', () => {
    rng.reseed(SEED);
    const world = generateWorld(32, 32, SEED);

    // Pick a start + a goal ≥8 tiles apart that A* itself confirms are connected, so the test
    // exercises movement, not world-connectivity luck.
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

    // Draft + issue a MOVE order through the real command registry (the same path the UI uses).
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
    // Hard success: arrived. Soft floor (diagnosable failure): it must at least have moved most of
    // the way — a dead pathfinder leaves endDist === startDist and fails loudly here.
    expect(endDist, `pawn stalled at ${JSON.stringify(finalPos)} (start dist ${startDist})`).toBe(
      0
    );
    expect(arrivedAt).toBeGreaterThan(0);
  });
});

function chebyshev(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** First walkable start + goal pair ≥ minDist apart with a confirmed A* route between them. */
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
