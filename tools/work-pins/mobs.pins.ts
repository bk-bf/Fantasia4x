import { it } from 'vitest';
import { runWorkPins } from './harness';
import { mobs } from './scenarios';

it('mobs-50', () => runWorkPins(mobs), 600_000);
