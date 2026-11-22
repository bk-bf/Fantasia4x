import { it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { getAmbientLight, TICKS_PER_GAME_HOUR } from '$lib/game/services/EnvironmentService';

const TICKS_PER_DAY = TICKS_PER_GAME_HOUR * 24;

function turnWhere(pred: (light: number) => boolean): number {
  for (let t = TICKS_PER_DAY; t < 2 * TICKS_PER_DAY; t += 50)
    if (pred(getAmbientLight(t))) return t;
  throw new Error('no such hour');
}

async function lightAt(turn: number): Promise<number[]> {
  const gs = buildScenario({
    seed: 5,
    map: { w: 12, h: 12 },
    pawns: [
      { count: 1, traits: [] },
      { count: 1, traits: ['night-blind'] },
      { count: 1, traits: ['nocturnal'] }
    ],
    needsDisabled: ['hunger', 'thirst', 'fatigue'],
    seedEntities: false
  });
  const s = new HeadlessSession();
  await s.start({ ...gs, turn });
  s.tick(1);
  return s.getState().pawns.map((p) => p.effectiveLight ?? -1);
}

it('in daylight every pawn sees fully, whatever its night vision', async () => {
  expect(await lightAt(turnWhere((l) => l >= 0.9))).toEqual([1, 1, 1]);
});

it('at night sight falls with the dark, night vision lifts it and a night-blind pawn sees no better', async () => {
  const [plain, blind, nocturnal] = await lightAt(turnWhere((l) => l < 0.2));
  expect(plain).toBeLessThan(1);
  expect(plain).toBeGreaterThanOrEqual(0.1);
  expect(blind).toBeLessThanOrEqual(plain);
  expect(blind).toBeGreaterThanOrEqual(0.1);
  expect(nocturnal).toBeGreaterThan(plain);
});
