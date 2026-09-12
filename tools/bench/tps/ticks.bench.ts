import { bench, describe } from 'vitest';
import { devSave } from '../../work-pins/scenarios';
import { ticks, warmSession } from '../session';

const ONE_GAME_SECOND = 60;
const RUNS = { time: 0, iterations: 10, warmupTime: 0, warmupIterations: 2 };

const session = await warmSession(devSave, 5);

describe('tps', () => {
  bench(`dev-save ${ONE_GAME_SECOND} ticks`, ticks(session, ONE_GAME_SECOND), RUNS);
});
