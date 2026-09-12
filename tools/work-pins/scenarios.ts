import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { buildScenario, type ScenarioSpec } from '$lib/game/headless/Scenario';
import { fromSnapshot } from '$lib/game/headless/snapshot';
import type { SimCommand } from '$lib/game/sim/simProtocol';
import type { GameState } from '$lib/game/core/types';

export type WorkPinScenario = {
  name: string;
  ticks: number;
  commands?: SimCommand[];
} & ({ spec: ScenarioSpec } | { snapshotGz: string });

export function initialState(sc: WorkPinScenario): GameState {
  if ('spec' in sc) return buildScenario(sc.spec);
  return fromSnapshot(JSON.parse(gunzipSync(readFileSync(sc.snapshotGz)).toString('utf8')));
}

export const colony: WorkPinScenario = {
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
};

export const mobs: WorkPinScenario = {
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
};

export const devSave: WorkPinScenario = {
  name: 'dev-save',
  ticks: 1500,
  snapshotGz: fileURLToPath(new URL('./fixtures/dev-save.json.gz', import.meta.url))
};
