import { bench, describe } from 'vitest';
import { mobs } from '../work-pins/scenarios';
import { ROLLING, ticks, warmSession } from './session';

const session = await warmSession(mobs, 3);

describe('mobs', () => {
  bench('6 ticks', ticks(session, 6), ROLLING);
});
