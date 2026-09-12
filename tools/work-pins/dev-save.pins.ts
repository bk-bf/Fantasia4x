import { it } from 'vitest';
import { runWorkPins } from './harness';
import { devSave } from './scenarios';

it('dev-save', () => runWorkPins(devSave), 600_000);
