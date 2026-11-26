import { it } from 'vitest';
import { runWorkPins } from './harness';
import { mobs200 } from './scenarios';

it('mobs-200', () => runWorkPins(mobs200), 600_000);
