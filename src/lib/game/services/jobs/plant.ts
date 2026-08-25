import type { GameState, Job } from '../../core/types';
import { gatedConsole as console } from '../../core/util/log';
import { zoneTileKeys, zoneInstanceIdAt } from '../DesignationService';
import { resourceObjectService, type ResourceObjectDef } from '../ResourceObjectService';
import { itemService } from '../ItemService';
import { soilTierForTile, SUBTERRAINS, SUBTERRAIN_FALLBACK } from '../../core/defs/terrains';
import { itemMatchesFilter } from './filters';
import { markTileDirty } from '../../core/state/tileDeltas';
import { patchPathfindingWalkable } from '../PathfinderService';
import { absorbDropIfOnStockpileTile } from '../../core/state/stockpile';
import { rng } from '../../core/util/rng';

const PLANT_WORK = 12;

let _cropDefs: ResourceObjectDef[] | null = null;
function cropDefs(): ResourceObjectDef[] {
  return (_cropDefs ??= resourceObjectService.getAll().filter((d) => d.crop));
}
let _cropIds: Set<string> | null = null;
function cropIds(): Set<string> {
  return (_cropIds ??= new Set(cropDefs().map((d) => d.id)));
}

function hasCrop(tile: { resources?: Record<string, number> }): boolean {
  const ids = cropIds();
  for (const id in tile.resources ?? {}) if (ids.has(id)) return true;
  return false;
}

function cropForTile(
  gs: GameState,
  tile: { subType: string },
  tileKey: string
): ResourceObjectDef | null {
  const instId = zoneInstanceIdAt(gs, tileKey, 'grow');
  const inst = (gs.zoneInstances ?? []).find((z) => z.id === instId);
  const filter = inst?.filter;
  const tier = soilTierForTile(tile);
  for (const d of cropDefs()) {
    const seed = d.crop!.seedItem;
    if (filter && filter.allowedCategories.length > 0 && !itemMatchesFilter(seed, filter)) continue;
    if (tier < d.crop!.minSoil) continue;
    if ((gs.stockpile?.[seed] ?? 0) <= 0) continue;
    return d;
  }
  return null;
}

export function generate(jobs: Job[], gs: GameState): Job[] {
  const growTiles = zoneTileKeys(gs, 'grow');
  const growSet = new Set(growTiles);

  jobs = jobs.filter((j) => {
    if (j.type !== 'plant') return true;
    const key = `${j.targetX},${j.targetY}`;
    if (!growSet.has(key)) return false;
    const tile = gs.worldMap[j.targetY]?.[j.targetX];
    return !!tile && !hasCrop(tile);
  });

  const existing = new Set(
    jobs.filter((j) => j.type === 'plant').map((j) => `${j.targetX},${j.targetY}`)
  );

  for (const key of growTiles) {
    if (existing.has(key)) continue;
    const [x, y] = key.split(',').map(Number);
    const tile = gs.worldMap[y]?.[x];
    if (!tile) continue;
    if (hasCrop(tile)) continue;
    const crop = cropForTile(gs, tile, key);
    if (!crop) continue;
    jobs.push({
      id: `plant-${x}-${y}-t${gs.turn}-${rng.random().toString(36).slice(2, 5)}`,
      type: 'plant',
      targetX: x,
      targetY: y,
      resourceId: crop.id,
      workRequired: PLANT_WORK,
      workDone: 0,
      claimedBy: null
    });
  }
  return jobs;
}

export function complete(job: Job, gs: GameState): GameState {
  if (!job.resourceId) return gs;
  const def = resourceObjectService.getById(job.resourceId);
  if (!def?.crop) return gs;
  const tile = gs.worldMap[job.targetY]?.[job.targetX];
  if (!tile || hasCrop(tile)) return gs;

  const seed = def.crop.seedItem;
  if ((gs.stockpile?.[seed] ?? 0) <= 0) return gs;
  let state = itemService.consumeItems({ [seed]: 1 }, gs);

  const pawn = state.pawns.find((p) => p.id === job.claimedBy);
  const col = state.worldMap[job.targetY][job.targetX];
  const ids = cropIds();
  const cleared: string[] = [];
  const newDropped = [...(state.droppedItems ?? [])];
  const newDropIds: string[] = [];
  const occupantIds = new Set([
    ...Object.keys(col.resources ?? {}),
    ...Object.keys(col.growth ?? {})
  ]);
  for (const id of occupantIds) {
    if (ids.has(id)) continue;
    const amt = col.resources?.[id] ?? 0;
    const grw = col.growth?.[id] ?? 0;
    if (amt <= 0 && grw <= 0) continue;
    cleared.push(id);
    if (amt <= 0) continue;
    const growthPct = col.growth?.[id] ?? 100;
    const yields = resourceObjectService.calculateYield(id, pawn, undefined, undefined, growthPct);
    for (const [dropResourceId, dropAmount] of Object.entries(yields)) {
      const dropId = `drop-${dropResourceId}-${job.targetX}-${job.targetY}-t${gs.turn}-${rng.random().toString(36).slice(2, 5)}`;
      newDropped.push({
        id: dropId,
        resourceId: dropResourceId,
        x: job.targetX,
        y: job.targetY,
        quantity: dropAmount
      });
      newDropIds.push(dropId);
    }
  }

  const resources: Record<string, number> = {};
  for (const [id, amt] of Object.entries(col.resources ?? {}))
    if (!cleared.includes(id)) resources[id] = amt;
  resources[job.resourceId] = 0;
  col.resources = resources;
  const growth = { ...(col.growth ?? {}) };
  for (const id of cleared) delete growth[id];
  growth[job.resourceId] = 0;
  col.growth = growth;
  if (cleared.length) {
    const baseSub = SUBTERRAINS[col.subType] ?? SUBTERRAIN_FALLBACK;
    col.walkable = baseSub.walkable;
    col.blocksSight = baseSub.blocksSight ?? false;
    col.movementCost = baseSub.movementCost;
    patchPathfindingWalkable(col.x, col.y, baseSub.walkable);
  }
  markTileDirty(job.targetY, job.targetX, col);

  state = { ...state, droppedItems: newDropped };
  for (const id of newDropIds) state = absorbDropIfOnStockpileTile(state, id);

  console.log(
    `[JobService] Planted ${job.resourceId} at (${job.targetX},${job.targetY}) — sown at 0%${cleared.length ? `, cleared ${cleared.join(',')}` : ''}`
  );
  return state;
}
