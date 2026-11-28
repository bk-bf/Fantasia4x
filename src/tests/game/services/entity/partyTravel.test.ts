import { describe, it, expect, beforeEach } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { getScenarioPreset } from '$lib/game/headless/scenarios/presets';
import { spawnKingdomParty } from '$lib/game/services/entity/kingdomParties';
import { generateCulturePool, generateCultureRelations } from '$lib/game/core/gen/culture';
import { generateKingdomPool, generateKingdomRelations } from '$lib/game/core/gen/kingdom';
import { pathfinderService } from '$lib/game/services/PathfinderService';
import { entityService } from '$lib/game/services/EntityService';
import { makeMob } from '$lib/game/services/entity/entitySpawning';
import { getCreatureById } from '$lib/game/core/defs/creatures';
import { clearConnectivity } from '$lib/game/services/entity/connectivity';
import { TRAVEL_MAX_FAILS, TRAVEL_RETRY_TICKS } from '$lib/game/services/entity/entityAI';
import { rng } from '$lib/game/core/util/rng';
import { countPathSearches } from '../pathSearchCounter';
import type { GameState, Mob, Pawn, WorldTile } from '$lib/game/core/types';

function stepMobs(state: GameState, ticks: number, until?: (s: GameState) => boolean): GameState {
  let s = state;
  for (let t = 0; t < ticks; t++) {
    s = { ...s, turn: s.turn + 1 };
    s = entityService.stepEntities(s);
    s = entityService.advanceMobMovement(s);
    if (until?.(s)) break;
  }
  return s;
}

function plainMap(w: number, h: number): WorldTile[][] {
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => ({
      x,
      y,
      walkable: true,
      terrainType: 'plains',
      movementCost: 1,
      resources: {}
    }))
  ) as unknown as WorldTile[][];
}

describe('a kingdom party travelling to the colony', () => {
  beforeEach(async () => {
    await pathfinderService.init();
    clearConnectivity();
  });

  it('walks in from the far edge of a 750x750 map without a failed path search', () => {
    const base = buildScenario(getScenarioPreset('large-wilderness')!.spec) as GameState;
    const cultures = base.culturePool?.length ? base.culturePool : generateCulturePool(10);
    const kingdoms = generateKingdomPool(cultures, 8);
    const kingdomRelations = generateKingdomRelations(
      kingdoms,
      generateCultureRelations(cultures),
      cultures[0].id
    );
    rng.reseed(3);
    const out = spawnKingdomParty(
      { ...base, culturePool: cultures, kingdoms, kingdomRelations } as GameState,
      kingdoms[0],
      'visitor',
      [],
      0
    )!;
    const members = out.state.mobs!.filter((m) => m.partyId === out.party.id);
    const start = members[0];
    expect(
      Math.abs(start.travelGoalX! - start.x) + Math.abs(start.travelGoalY! - start.y)
    ).toBeGreaterThan(600);
    const travelling = (s: GameState) =>
      (s.mobs ?? []).filter((m) => m.partyId === out.party.id && m.state === 'Traveling');
    const searches = countPathSearches();
    const end = stepMobs({ ...out.state, mobs: members }, 20_000, (s) => travelling(s).length === 0);
    searches.restore();
    expect(searches.fails).toBe(0);
    expect(travelling(end)).toHaveLength(0);
    for (const m of end.mobs ?? []) expect(m.travelGoalX).toBeUndefined();
  }, 180_000);

  it('waits between failed searches and gives the travel up after a few', () => {
    const def = getCreatureById('kingdom_visitor')!;
    const mob: Mob = {
      ...makeMob(def, 5, 60, 0),
      state: 'Traveling',
      travelGoalX: 110,
      travelGoalY: 60,
      partyId: 'party-x',
      kingdomId: 'k'
    };
    const pawn = {
      id: 'p',
      name: 'P',
      position: { x: 115, y: 60 },
      isAlive: true,
      currentState: 'Idle'
    } as unknown as Pawn;
    const state = {
      turn: 6000,
      mobs: [mob],
      pawns: [pawn],
      worldMap: plainMap(120, 120),
      stockpile: {},
      droppedItems: [],
      buildings: []
    } as unknown as GameState;
    const svc = pathfinderService as unknown as { findPathOnGrid: (...a: unknown[]) => unknown[] };
    const real = svc.findPathOnGrid;
    svc.findPathOnGrid = () => [];
    try {
      const searches = countPathSearches();
      const early = stepMobs(state, TRAVEL_RETRY_TICKS - 1);
      expect(searches.calls).toBe(1);
      const end = stepMobs(early, TRAVEL_RETRY_TICKS * (TRAVEL_MAX_FAILS + 2));
      searches.restore();
      expect(searches.calls).toBe(TRAVEL_MAX_FAILS);
      const after = end.mobs!.find((m) => m.id === mob.id)!;
      expect(after.state).not.toBe('Traveling');
      expect(after.travelGoalX).toBeUndefined();
    } finally {
      svc.findPathOnGrid = real;
    }
  });
});
