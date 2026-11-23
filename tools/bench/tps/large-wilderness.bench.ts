import { bench, describe } from 'vitest';
import { getScenarioPreset } from '$lib/game/headless/scenarios/presets';
import { ticks, warmSession } from '../session';

const ONE_GAME_SECOND = 60;
const TEN_GAME_SECONDS = 600;
const RUNS = { time: 0, iterations: 10, warmupTime: 0, warmupIterations: 2 };
const NAME = 'large-wilderness';

const session = await warmSession(
  { name: NAME, ticks: 0, spec: getScenarioPreset(NAME)!.spec },
  TEN_GAME_SECONDS
);

describe('tps', () => {
  bench(`${NAME} ${ONE_GAME_SECOND} ticks`, ticks(session, ONE_GAME_SECOND), RUNS);
});
