import { bench, describe } from 'vitest';
import { entityService } from '$lib/game/services/EntityService';
import { devSave } from '../work-pins/scenarios';
import { MEASURED_TICKS, ROLLING, measuredWindow, phase, warmSession } from './session';

const session = await warmSession(devSave, 5);

describe('dev-save', () => {
  bench(`${MEASURED_TICKS} ticks`, ...measuredWindow(session, 3));
  bench('es:step', phase(session, (s) => entityService.stepEntities(s)), ROLLING);
  bench('es:move', phase(session, (s) => entityService.advanceMobMovement(s)), ROLLING);
});
