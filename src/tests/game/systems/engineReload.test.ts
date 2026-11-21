import { describe, it, expect, vi, beforeAll } from 'vitest';
import { GameEngineImpl } from '$lib/game/systems/GameEngineImpl';
import { GameStateManager } from '$lib/game/core/state/GameStateManager';
import { buildScenario } from '$lib/game/headless/Scenario';
import { pathfinderService } from '$lib/game/services/PathfinderService';
import { pawnGrowthService } from '$lib/game/services/PawnGrowthService';
import { TURNS_PER_DAY, DAYS_PER_SEASON } from '$lib/game/services/EnvironmentService';
import { TICKS_PER_SECOND } from '$lib/game/core/util/time';
import type { GameState } from '$lib/game/core/types';

const TICKS_PER_DAY = TURNS_PER_DAY * TICKS_PER_SECOND;

function run(engine: GameEngineImpl, state: GameState, n: number): GameState {
  engine.setGameStateManager(new GameStateManager(state));
  for (let i = 0; i < n; i++) {
    const r = engine.processGameTurn();
    if (!r.success) throw new Error(r.errors?.join());
  }
  return engine.getGameState();
}

describe('loading a world into an engine that already ran one', () => {
  beforeAll(() => pathfinderService.init());

  it('does not replay the growth days between the two saves', () => {
    const spec = { seed: 7, map: { w: 24, h: 24 }, pawns: [{ count: 2 }] };
    const engine = new GameEngineImpl();
    run(engine, buildScenario(spec), 5);

    const later: GameState = { ...buildScenario(spec), turn: 730 * TICKS_PER_DAY + 10 };
    const agesBefore = later.pawns.map((p) => p.age);
    const spy = vi.spyOn(pawnGrowthService, 'processDay');
    const after = run(engine, later, 1);
    const calls = spy.mock.calls.length;
    spy.mockRestore();

    expect(after.pawns.map((p) => p.age)).toEqual(agesBefore);
    expect(calls).toBe(0);
  });

  it('does not age the pawns of a save a year after the previous one', () => {
    const a = buildScenario({ seed: 5, map: { w: 16, h: 16 }, pawns: [{ count: 2 }] });
    a.turn = 10 * TICKS_PER_DAY - 5;
    const engine = new GameEngineImpl();
    run(engine, a, 10);

    const year = DAYS_PER_SEASON * 4;
    const b = buildScenario({ seed: 6, map: { w: 16, h: 16 }, pawns: [{ count: 4 }] });
    b.turn = (10 + year) * TICKS_PER_DAY - 3;
    b.pawns.forEach((p, i) => {
      p.birthDayOfYear = (5 + 13 + i * 7) % year;
      p.lastGrowthSeason = Math.floor((10 + year) / DAYS_PER_SEASON);
    });
    const ages = b.pawns.map((p) => p.age ?? 0);
    const after = run(engine, b, 1);

    expect(after.pawns.map((p) => p.age ?? 0)).toEqual(ages);
  });

  it('computes the average temperature of the new world, not the previous one', () => {
    const flat = buildScenario({ seed: 3, map: { w: 32, h: 32 }, pawns: [{ count: 1 }] });
    const generated = buildScenario({
      seed: 5,
      map: { w: 32, h: 32, preset: 'generated' },
      pawns: [{ count: 1 }],
      seedEntities: false
    });
    const save = JSON.stringify(run(new GameEngineImpl(), generated, 2));
    const fresh = run(new GameEngineImpl(), JSON.parse(save), 1);

    const reused = new GameEngineImpl();
    run(reused, flat, 2);
    const afterLoad = run(reused, JSON.parse(save), 1);

    expect(afterLoad.avgTemperature).toBe(fresh.avgTemperature);
  });
});
