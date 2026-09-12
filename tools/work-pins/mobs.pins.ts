import { it } from 'vitest';
import { runWorkPins } from './harness';

it(
  'mobs',
  () =>
    runWorkPins({
      name: 'mobs',
      ticks: 1500,
      spec: {
        seed: 11,
        map: { w: 64, h: 64, preset: 'generated' },
        researchMaxTier: 9,
        toolTier: 3,
        infiniteFuel: true,
        workReady: true,
        pawns: [{ count: 6, skillLevel: 20 }],
        spawnMobs: [{ count: 40 }],
        seedEntities: true
      }
    }),
  600_000
);
