import { it } from 'vitest';
import { runWorkPins } from './harness';
import { mobs } from './scenarios';

it('mobs', () => runWorkPins(mobs), 600_000);
