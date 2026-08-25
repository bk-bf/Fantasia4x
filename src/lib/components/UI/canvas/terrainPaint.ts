import type { GameGrid } from '$lib/webgl/game-grid.js';
import {
  buildGameGrid,
  buildResourceOverlay,
  buildSnowOverlay,
  computeHiddenMaskState,
  type HiddenMaskState
} from '$lib/webgl/fantasia-world.js';
import { lightingService, type LightEmitter } from '$lib/game/services/LightingService.js';
import type { WorldTile, PlacedBuilding, Season } from '$lib/game/core/types.js';

export interface FullTerrainBuild {
  terrainGrid: GameGrid;
  resourceGrid: GameGrid;
  resourceTallGrid: GameGrid;
  snowGrid: GameGrid;
  maskState: HiddenMaskState;
  emitterMap: Map<string, LightEmitter>;
  emitters: LightEmitter[];
  buildingsById: Map<string, { x: number; y: number; sig: string }>;
}

export function fullRebuildTerrain(
  worldMap: WorldTile[][],
  buildings: PlacedBuilding[],
  buildingSig: (b: PlacedBuilding) => string,
  season?: Season
): FullTerrainBuild {
  const maskState = computeHiddenMaskState(worldMap);
  const terrainGrid = buildGameGrid(worldMap, buildings, maskState.mask);
  const resources = buildResourceOverlay(worldMap, maskState.mask, season);
  const snowGrid = buildSnowOverlay(worldMap, maskState.mask);

  const buildingsById = new Map<string, { x: number; y: number; sig: string }>();
  for (const b of buildings) {
    if (b.status === 'complete') buildingsById.set(b.id, { x: b.x, y: b.y, sig: buildingSig(b) });
  }

  const emitterMap = new Map<string, LightEmitter>();
  for (const row of worldMap) {
    for (const tile of row) {
      const e = lightingService.emitterForTile(tile);
      if (e && !maskState.mask[e.y]?.[e.x]) emitterMap.set(e.y + ',' + e.x, e);
    }
  }

  return {
    terrainGrid,
    resourceGrid: resources.short,
    resourceTallGrid: resources.tall,
    snowGrid,
    maskState,
    emitterMap,
    emitters: [...emitterMap.values()],
    buildingsById
  };
}
