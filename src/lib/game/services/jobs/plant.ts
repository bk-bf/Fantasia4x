// Plant job handler (ADR-017) — PRODUCTION-CHAIN-II §F. A grow zone (`zoneTiles['grow']` + a seed
// filter on its zone instance) drives sowing: for each cleared, soil-eligible tile in the zone whose
// seed is in stock, a `plant` job is generated. On completion the pawn consumes one seed and places
// the crop as an IMMATURE resource (count 0) with a growth cooldown — the crop then matures via the
// existing regrowth mechanic (GameEngineImpl.processResourceRegrowth refills it). Growth SPEED scales
// with soil fertility × wetness at plant time. Reaping a matured crop is an ordinary `harvest` (the
// crop resource lists `designationTypes: ['harvest']`); after an annual depletes, the zone replants.
import type { GameState, Job } from '../../core/types';
import { gatedConsole as console } from '../../core/log';
import { zoneTileKeys } from '../DesignationService';
import { resourceObjectService, type ResourceObjectDef } from '../ResourceObjectService';
import { itemService } from '../ItemService';
import { soilFertilityPct, soilTierForTile } from '../../core/Terrains';
import { itemMatchesFilter } from './filters';
import { markTileDirty } from '../../core/tileDeltas';
import { ticksFromSeconds } from '../../core/time';
import { seasonRegrowthMultiplier } from '../EnvironmentService';
import { rng } from '../../core/rng';

/** Fixed sowing work (the crop's own workAmount is the REAP cost, not the plant cost). */
const PLANT_WORK = 12;

let _cropDefs: ResourceObjectDef[] | null = null;
function cropDefs(): ResourceObjectDef[] {
  return (_cropDefs ??= resourceObjectService.getAll().filter((d) => d.crop));
}
let _cropIds: Set<string> | null = null;
function cropIds(): Set<string> {
  return (_cropIds ??= new Set(cropDefs().map((d) => d.id)));
}

/** A tile already carries a crop (immature key present, growing, or mature) — don't re-plant. */
function hasCrop(tile: { resources?: Record<string, number> }): boolean {
  const ids = cropIds();
  for (const id in tile.resources ?? {}) if (ids.has(id)) return true;
  return false;
}

/** A non-crop resource (grass, bush…) still occupies the tile — must be cleared/dug before sowing. */
function isObstructed(tile: { resources?: Record<string, number> }): boolean {
  const ids = cropIds();
  for (const [id, amt] of Object.entries(tile.resources ?? {}))
    if ((amt ?? 0) > 0 && !ids.has(id)) return true;
  return false;
}

/** The crop to sow on a grow-zone tile: the first crop whose seed passes the zone's filter, fits the
 *  tile's soil tier, and is in stock. Null when nothing plantable applies. */
function cropForTile(gs: GameState, tile: { subType: string }, tileKey: string): ResourceObjectDef | null {
  const instId = gs.designationZoneId?.[tileKey];
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

  // Prune plant jobs whose tile left the grow zone, got obstructed, or already holds a crop.
  jobs = jobs.filter((j) => {
    if (j.type !== 'plant') return true;
    const key = `${j.targetX},${j.targetY}`;
    if (!growSet.has(key)) return false;
    const tile = gs.worldMap[j.targetY]?.[j.targetX];
    return !!tile && !hasCrop(tile) && !isObstructed(tile);
  });

  const existing = new Set(
    jobs.filter((j) => j.type === 'plant').map((j) => `${j.targetX},${j.targetY}`)
  );

  for (const key of growTiles) {
    if (existing.has(key)) continue;
    const [x, y] = key.split(',').map(Number);
    const tile = gs.worldMap[y]?.[x];
    if (!tile) continue;
    if (hasCrop(tile) || isObstructed(tile)) continue; // already sown, or needs clearing first
    const crop = cropForTile(gs, tile, key);
    if (!crop) continue;
    jobs.push({
      id: `plant-${x}-${y}-${Date.now()}-${rng.random().toString(36).slice(2, 5)}`,
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
  if (!tile || hasCrop(tile) || isObstructed(tile)) return gs;

  const seed = def.crop.seedItem;
  if ((gs.stockpile?.[seed] ?? 0) <= 0) return gs; // seed gone — abort, job re-evaluates next tick
  let state = itemService.consumeItems({ [seed]: 1 }, gs);

  // Growth speed = base growthTurns / (fertility × wetness), then season-scaled like any regrowth.
  const fertFactor = 0.5 + soilFertilityPct(tile) / 100; // ~0.75 (poor) … 1.5 (terra preta)
  const moisture = tile.moisture ?? 0;
  const wetFactor = Math.max(0.4, Math.min(1, 1 - Math.abs(moisture - def.crop.idealMoisture) / 100));
  const scaledTurns = def.crop.growthTurns / (fertFactor * wetFactor);
  const rate = seasonRegrowthMultiplier(state.season);
  const matureAt = state.turn + Math.max(1, Math.round(ticksFromSeconds(scaledTurns) / rate));

  // Place the crop IMMATURE (count 0) + start its growth cooldown — it matures (count → nodeAmount)
  // when processResourceRegrowth fires. In-place tile mutation + delta (ADR-002 amendment).
  const col = state.worldMap[job.targetY][job.targetX];
  col.resources = { ...col.resources, [job.resourceId]: 0 };
  col.resourceCooldowns = { ...(col.resourceCooldowns ?? {}), [job.resourceId]: matureAt };
  markTileDirty(job.targetY, job.targetX, col);

  console.log(
    `[JobService] Planted ${job.resourceId} at (${job.targetX},${job.targetY}) — matures in ~${Math.round(scaledTurns)} turns`
  );
  return state;
}
