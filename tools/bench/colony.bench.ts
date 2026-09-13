import { bench, describe } from 'vitest';
import { colony } from '../work-pins/scenarios';
import { MEASURED_TICKS, measuredWindow, warmSession } from './session';

const session = await warmSession(colony, 2);

describe('colony', () => {
  bench(`${MEASURED_TICKS} ticks`, ...measuredWindow(session, 12));
});
