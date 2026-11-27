import { it } from 'vitest';
import { runWorkPins } from './harness';
import { generatedMap } from './scenarios';

it('generated-map', () => runWorkPins(generatedMap), 600_000);
