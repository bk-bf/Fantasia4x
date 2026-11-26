import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { buildScenario, type ScenarioSpec } from '$lib/game/headless/Scenario';
import { fromSnapshot } from '../../src/lib/game/headless/snapshot';
import { CREATURES } from '../../src/lib/game/core/defs/creatures';
import { isSpawnableTile } from '../../src/lib/game/core/defs/terrains';
import { rng } from '../../src/lib/game/core/util/rng';
import { devSpawnMobAt } from '../../src/lib/game/services/entity/entitySpawning';
import { EDGE_BUFFER, MIN_PAWN_DISTANCE } from '../../src/lib/game/services/entity/entityConstants';
import type { SimCommand } from '../../src/lib/game/sim/simProtocol';
import type { GameState } from '../../src/lib/game/core/types';

export type CreaturePlacement = { family?: string; count: number };

export type WorkPinScenario = {
  name: string;
  ticks: number;
  commands?: SimCommand[];
  creatures?: CreaturePlacement;
} & ({ spec: ScenarioSpec } | { snapshotGz: string });

const dayCreatures = () => CREATURES.filter((c) => !c.nightOnly);

function openTilesInSeededOrder(state: GameState): { x: number; y: number }[] {
  const map = state.worldMap;
  const h = map.length;
  const w = map[0]?.length ?? 0;
  const pawns = state.pawns.flatMap((p) => (p.position ? [p.position] : []));
  const nearPawn = (x: number, y: number) =>
    pawns.some(
      (p) => Math.abs(p.x - x) < MIN_PAWN_DISTANCE && Math.abs(p.y - y) < MIN_PAWN_DISTANCE
    );
  const tiles: { x: number; y: number }[] = [];
  for (let y = EDGE_BUFFER; y < h - EDGE_BUFFER; y++)
    for (let x = EDGE_BUFFER; x < w - EDGE_BUFFER; x++)
      if (isSpawnableTile(map[y][x]) && !nearPawn(x, y)) tiles.push({ x, y });
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(rng.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles;
}

export function placeCreatures(state: GameState, count: number): GameState {
  const pool = dayCreatures();
  const tiles = openTilesInSeededOrder(state);
  if (pool.length === 0) throw new Error('no creature can be placed by the work pins');
  if (tiles.length < count)
    throw new Error(
      `work pins: ${count} creatures asked for, the map has ${tiles.length} open tiles`
    );
  let placed = state;
  for (const { x, y } of tiles.slice(0, count)) {
    const def = pool[Math.floor(rng.random() * pool.length)];
    placed = devSpawnMobAt(placed, def.id, x, y);
  }
  if (placed.mobs?.length !== count)
    throw new Error(`work pins: placed ${placed.mobs?.length ?? 0} of ${count} creatures`);
  return placed;
}

export function initialState(sc: WorkPinScenario): GameState {
  if ('spec' in sc) {
    const state = buildScenario(sc.spec);
    return sc.creatures ? placeCreatures(state, sc.creatures.count) : state;
  }
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

function creatureScenario(
  name: string,
  creatures: CreaturePlacement,
  map: ScenarioSpec['map']
): WorkPinScenario {
  return {
    name,
    ticks: 1500,
    creatures,
    spec: {
      seed: 11,
      map,
      researchMaxTier: 9,
      toolTier: 3,
      infiniteFuel: true,
      workReady: true,
      pawns: [{ count: 6, skillLevel: 20 }],
      seedEntities: false
    }
  };
}

export const mobs = creatureScenario('mobs-50', { family: 'mobs', count: 50 }, { w: 128, h: 128 });

export const mobs200 = creatureScenario(
  'mobs-200',
  { family: 'mobs', count: 200 },
  { w: 128, h: 128 }
);

export const generatedMap = creatureScenario(
  'generated-map',
  { count: 50 },
  { w: 64, h: 64, preset: 'generated' }
);

export const devSave: WorkPinScenario = {
  name: 'dev-save',
  ticks: 1500,
  snapshotGz: fileURLToPath(new URL('./fixtures/dev-save.json.gz', import.meta.url))
};
