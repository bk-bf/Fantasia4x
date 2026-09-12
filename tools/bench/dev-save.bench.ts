import { bench, describe } from 'vitest';
import { entityService } from '$lib/game/services/EntityService';
import { devSave } from '../work-pins/scenarios';
import { ROLLING, phase, ticks, warmSession } from './session';

const session = await warmSession(devSave, 5);

describe('dev-save', () => {
  bench('3 ticks', ticks(session, 3), ROLLING);
  bench('es:step', phase(session, (s) => entityService.stepEntities(s)), ROLLING);
});
