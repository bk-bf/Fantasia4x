import { describe, it, expect, beforeEach } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { entityService } from '$lib/game/services/EntityService';
import { makeMob } from '$lib/game/services/entity/entitySpawning';
import { getCreatureById } from '$lib/game/core/defs/creatures';
import { pathfinderService } from '$lib/game/services/PathfinderService';
import { countPathSearches } from '../pathSearchCounter';
import { clearConnectivity } from '$lib/game/services/entity/connectivity';
import type { GameState, Mob, Pawn, WorldTile } from '$lib/game/core/types';

function plainMap(w: number, h: number, wall: (x: number, y: number) => boolean): WorldTile[][] {
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => ({
      x,
      y,
      walkable: !wall(x, y),
      terrainType: 'plains',
      movementCost: 1,
      resources: {}
    }))
  ) as unknown as WorldTile[][];
}

function stepMobs(state: GameState, ticks: number): GameState {
  let s = state;
  for (let t = 0; t < ticks; t++) {
    s = { ...s, turn: s.turn + 1 };
    s = entityService.stepEntities(s);
    s = entityService.advanceMobMovement(s);
  }
  return s;
}

describe('mobs whose target sits in another walkable region', () => {
  beforeEach(async () => {
    await pathfinderService.init();
    clearConnectivity();
  });

  it('a goblin chasing a pawn sealed in a walled pocket never searches for a path to it', async () => {
    const st = buildScenario({
      seed: 4,
      map: { w: 48, h: 48 },
      needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene', 'wetness', 'relaxation', 'comfort'],
      pawns: [{ count: 1, skillLevel: 5 }],
      seedEntities: false
    }) as GameState;
    st.turn = 9000;
    const { x: px, y: py } = st.pawns[0].position!;
    for (let y = py - 2; y <= py + 2; y++)
      for (let x = px - 2; x <= px + 2; x++)
        if (Math.max(Math.abs(x - px), Math.abs(y - py)) === 2) st.worldMap[y][x].walkable = false;
    const goblin: Mob = {
      ...makeMob(getCreatureById('goblin')!, px + 5, py, st.turn),
      state: 'Alerted',
      stateSince: st.turn,
      lastSeenX: px,
      lastSeenY: py
    };
    st.mobs = [goblin];
    const s = new HeadlessSession();
    await s.start(st);
    s.tick(20);
    const searches = countPathSearches();
    s.tick(400);
    searches.restore();
    const mob = s.getState().mobs?.find((m) => m.id === goblin.id);
    expect(mob?.state).toBe('Alerted');
    expect(searches.fails).toBe(0);
  }, 120_000);

  it('a caravan whose anchor lies across a wall walks toward it without searching', () => {
    const wm = plainMap(120, 120, (x) => x === 60);
    const goal = { x: 100, y: 60 };
    const mobs: Mob[] = ['kingdom_trader', 'kingdom_guard', 'kingdom_pack_beast'].map((id, i) => ({
      ...makeMob(getCreatureById(id)!, 5, 50 + i * 2, 0),
      state: 'Traveling',
      travelGoalX: goal.x,
      travelGoalY: goal.y,
      partyId: 'party-x',
      kingdomId: 'k'
    }));
    const pawn = {
      id: 'p',
      name: 'P',
      position: { x: goal.x + 5, y: goal.y },
      isAlive: true,
      currentState: 'Idle'
    } as unknown as Pawn;
    const state = {
      turn: 6000,
      mobs,
      pawns: [pawn],
      worldMap: wm,
      stockpile: {},
      droppedItems: [],
      buildings: []
    } as unknown as GameState;
    const searches = countPathSearches();
    const end = stepMobs(state, 200);
    searches.restore();
    expect(searches.calls).toBe(0);
    for (const m of end.mobs ?? []) {
      expect(m.state).toBe('Traveling');
      expect(m.x).toBeGreaterThan(5);
    }
  });
});
