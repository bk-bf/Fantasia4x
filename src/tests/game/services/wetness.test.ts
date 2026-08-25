import { describe, it, expect, beforeEach } from 'vitest';
import { pawnService } from '$lib/game/services/PawnService';
import { rebuildThermalField, biomeBaseMoisture } from '$lib/game/services/EnvironmentService';
import type {
  GameState,
  Pawn,
  WorldTile,
  WeatherState,
  PlacedBuilding
} from '$lib/game/core/types';

function tile(terrainType: string, temperature = 15): WorldTile {
  return {
    x: 0,
    y: 0,
    type: 'land',
    discovered: true,
    ascii: '.',
    terrainType,
    subType: 'dirt',
    density: 0.4,
    moisture: biomeBaseMoisture(terrainType),
    temperature,
    movementCost: 1,
    walkable: true,
    resources: {},
    territoryOwner: ''
  };
}
function pawn(wetness = 0): Pawn {
  return {
    id: 'p1',
    name: 'Tester',
    isAlive: true,
    drafted: false,
    position: { x: 0, y: 0 },
    needs: { hunger: 10, fatigue: 10, sleep: 0, lastSleep: 0, lastMeal: 0, wetness },
    state: { health: 100, mood: 50, isWorking: false, isSleeping: false, isEating: false },
    conditions: [],
    traits: [],
    stats: { strength: 10, dexterity: 10, constitution: 10, perception: 10, intelligence: 10 },
    limbs: [],
    injuries: []
  } as unknown as Pawn;
}
function state(p: Pawn, t: WorldTile, weather?: WeatherState, season?: string): GameState {
  return { seed: 1, turn: 0, pawns: [p], worldMap: [[t]], weather, season } as unknown as GameState;
}
function run(s: GameState, ticks: number): GameState {
  for (let i = 0; i < ticks; i++) s = pawnService.processNeedsTick(s);
  return s;
}
const HEAVY_RAIN: WeatherState = { type: 'heavy_rain', intensity: 0.75, turnsRemaining: 999 };
const CLEAR: WeatherState = { type: 'clear', intensity: 0, turnsRemaining: 999 };

describe('pawn wetness (SEASONS_WEATHER)', () => {
  beforeEach(() => rebuildThermalField([]));

  it('soaks over time when standing on a wet (>50%, <100%) tile in the rain — not instant', () => {
    const out = run(state(pawn(0), tile('plains'), HEAVY_RAIN), 1);
    expect(out.pawns[0].needs.wetness!).toBeGreaterThan(0);
    expect(out.pawns[0].needs.wetness!).toBeLessThan(5);
    const soaked = run(state(pawn(0), tile('plains'), HEAVY_RAIN), 8000);
    expect(soaked.pawns[0].needs.wetness!).toBeGreaterThan(50);
  });

  it('a fully-wet (100%) tile soaks the pawn instantly', () => {
    const out = run(state(pawn(0), tile('swamp'), HEAVY_RAIN), 1);
    expect(out.pawns[0].needs.wetness!).toBe(100);
  });

  it('a dry tile (clear weather, low-moisture biome) does NOT soak', () => {
    const out = run(state(pawn(0), tile('plains'), CLEAR), 500);
    expect(out.pawns[0].needs.wetness!).toBe(0);
  });

  it('dries off when off wet ground', () => {
    const out = run(state(pawn(80), tile('plains'), CLEAR), 500);
    expect(out.pawns[0].needs.wetness!).toBeLessThan(80);
  });

  it('dries FASTER when warm', () => {
    const warm = run(state(pawn(80), tile('plains'), CLEAR, 'summer'), 500).pawns[0].needs.wetness!;
    const cold = run(state(pawn(80), tile('plains'), CLEAR, 'winter'), 500).pawns[0].needs.wetness!;
    expect(warm).toBeLessThan(cold);
  });

  it('a roof keeps the tile dry → a pawn under it does not soak in the rain', () => {
    const roof = {
      id: 'r',
      type: 'tile_roof',
      x: 0,
      y: 0,
      status: 'complete',
      progress: 1
    } as unknown as PlacedBuilding;
    rebuildThermalField([roof]);
    const out = run(state(pawn(0), tile('plains'), HEAVY_RAIN), 500);
    expect(out.pawns[0].needs.wetness!).toBe(0);
  });
});
