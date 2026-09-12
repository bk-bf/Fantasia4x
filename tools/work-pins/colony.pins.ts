import { it } from 'vitest';
import { runWorkPins } from './harness';
import { colony } from './scenarios';

it('colony', () => runWorkPins(colony), 600_000);
