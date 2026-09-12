import { it } from 'vitest';
import { runWorkPins } from './harness';

it(
  'colony',
  () =>
    runWorkPins({
      name: 'colony',
      ticks: 1500,
      spec: {
        seed: 11,
        map: { w: 40, h: 40 },
        researchMaxTier: 9,
        toolTier: 3,
        infiniteFuel: true,
        workReady: true,
        pawns: [{ count: 6, skillLevel: 20 }],
        buildings: [{ id: 'stone_forge' }],
        items: { malachite: 60, clay_mold: 80 },
        seedEntities: false
      },
      commands: [{ type: 'craftItem', payload: { itemId: 'copper_bar', quantity: 2 } } as never]
    }),
  600_000
);
