import { bench, describe } from 'vitest';
import { entityService } from '$lib/game/services/EntityService';
import { pathTo } from '$lib/game/services/entity/entityHelpers';
import { devSave } from '../work-pins/scenarios';
import {
  MEASURED_TICKS,
  ROLLING,
  measuredWindow,
  mobMovement,
  phase,
  thermalSampling,
  warmSession
} from './session';

const session = await warmSession(devSave, 5);

describe('dev-save', () => {
  bench(`${MEASURED_TICKS} ticks`, ...measuredWindow(session, 3));
  bench('es:step', phase(session, (s) => entityService.stepEntities(s)), ROLLING);
  bench('es:move', mobMovement(session), ROLLING);
  bench(
    'path:short',
    phase(session, (s) => {
      const { x, y } = s.pawns[0].position!;
      pathTo(s, x, y, x + 6, y + 3);
      return s;
    }),
    ROLLING
  );
  bench('env:thermal', thermalSampling(session), ROLLING);
});
