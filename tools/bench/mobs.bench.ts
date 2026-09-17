import { bench, describe } from 'vitest';
import { mobs } from '../work-pins/scenarios';
import { MEASURED_TICKS, measuredWindow, warmSession } from './session';

const session = await warmSession(mobs, 3);

describe('mobs', () => {
  bench(`${MEASURED_TICKS} ticks`, ...measuredWindow(session, 6));
});
