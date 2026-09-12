import { it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { runWorkPins } from './harness';

it(
  'dev-save',
  () =>
    runWorkPins({
      name: 'dev-save',
      ticks: 1500,
      snapshotGz: fileURLToPath(new URL('./fixtures/dev-save.json.gz', import.meta.url))
    }),
  600_000
);
