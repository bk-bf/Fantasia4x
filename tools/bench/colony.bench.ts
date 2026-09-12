import { bench, describe } from 'vitest';
import { colony } from '../work-pins/scenarios';
import { ROLLING, ticks, warmSession } from './session';

const session = await warmSession(colony, 2);

describe('colony', () => {
  bench('12 ticks', ticks(session, 12), ROLLING);
});
