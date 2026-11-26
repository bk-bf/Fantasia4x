import { bench, describe } from 'vitest';
import { mobs200 } from '../work-pins/scenarios';
import { MEASURED_TICKS, measuredWindow, warmSession } from './session';

const session = await warmSession(mobs200, 3);

describe('mobs-200', () => {
  bench(`${MEASURED_TICKS} ticks`, ...measuredWindow(session, 6));
});
