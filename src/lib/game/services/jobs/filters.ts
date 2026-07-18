// Job filters — zone/designation matching shared by the harvest and haul job handlers. Extracted
// from JobService (P-4, ADR-017 handler split): these are pure predicates over GameState with no
// per-type behaviour, so they live alongside the job handlers rather than inside the service.
import type { DesignationType, GameState, Item, ZoneFilter } from '../../core/types';
import itemsData from '../../database/items/items.jsonc';
import { resourceObjectService } from '../ResourceObjectService';
import { zoneInstanceIdAt } from '../DesignationService';

const ITEMS_DATABASE = itemsData as unknown as Item[];

/** Designation types that produce harvest-category jobs. */
export const HARVEST_DTYPES: DesignationType[] = ['harvest', 'woodcut', 'forage', 'dig'];

/** Whether a tile resource is eligible for the given harvest-style designation. */
export function resourceMatchesDesignation(
  designationType: DesignationType,
  resourceId: string
): boolean {
  if (!HARVEST_DTYPES.includes(designationType)) return false;
  const def = resourceObjectService.getById(resourceId);
  if (!def) return true;
  return def.designationTypes.includes(designationType);
}

/**
 * Returns false if the zone's filter excludes this tile resource.
 * A resource passes if at least one of its yielded items falls in allowedCategories
 * and is not in blockedItems.
 */
export function resourceMatchesFilter(
  designationType: DesignationType,
  resourceId: string,
  gs: GameState,
  tileKey?: string
): boolean {
  let filter: ZoneFilter | undefined;
  if (tileKey) {
    // A harvest tile inherits the filter of any filterable standing zone it overlaps (stockpile/grow);
    // each lives in its own layer now, so an overlapping restrict zone no longer hides this filter.
    const instanceId =
      zoneInstanceIdAt(gs, tileKey, 'stockpile') ?? zoneInstanceIdAt(gs, tileKey, 'grow');
    if (instanceId) {
      const inst = (gs.zoneInstances ?? []).find((z) => z.id === instanceId);
      filter = inst?.filter;
    }
  }
  filter =
    filter ??
    gs.zoneFilters?.[designationType as import('$lib/game/core/types.js').FilterableZoneType];
  if (!filter || filter.allowedCategories.length === 0) return true;
  const def = resourceObjectService.getById(resourceId);
  if (!def) return true;
  const interaction =
    resourceObjectService.getInteractionByDesignationType(resourceId, designationType) ??
    def.interaction;
  return interaction.yields.some((y) => itemMatchesFilter(y.itemId, filter!));
}

// §F anti-spam: a forage (persistent, non-depleting) node can't be foraged again until it has regrown
// past this growth floor. Felling (woodcut), digging and mining DEPLETE the node and are never gated.
// Shared by the harvest job generator AND the mark UI/command, so the "can I mark this for harvest?"
// gate can't drift from the "will a job be generated?" gate (the phantom-harvest-marker bug: marking a
// below-growth forage node painted a marker that never produced a workable job).
export const MIN_FORAGE_GROWTH = 60;

/** True when this interaction is a regrow-gated forage (persistent, not a depleting cut/dig/mine). */
export function isForageGated(
  interaction: { persistent?: boolean; harvestDepletes?: boolean } | undefined
): boolean {
  return interaction?.persistent === true && interaction.harvestDepletes !== true;
}

/**
 * True when designating (x,y) for `designationType` would yield a workable harvest job RIGHT NOW — i.e.
 * the tile holds at least one matching resource that isn't a forage node still below the regrow floor.
 * Mirrors the per-tile loop in jobs/harvest.ts `generate`. Used to gate the mark UI/command so a player
 * can't paint a harvest marker on an immature forage node that no pawn will ever work.
 */
export function isHarvestableTileNow(
  gs: Pick<GameState, 'worldMap'>,
  x: number,
  y: number,
  designationType: DesignationType
): boolean {
  if (!HARVEST_DTYPES.includes(designationType)) return true; // non-harvest designations aren't gated
  const tile = gs.worldMap?.[y]?.[x];
  if (!tile) return false;
  for (const [resourceId, amount] of Object.entries(tile.resources ?? {})) {
    if ((amount ?? 0) <= 0) continue;
    if (!resourceMatchesDesignation(designationType, resourceId)) continue;
    const interaction = resourceObjectService.getInteractionByDesignationType(
      resourceId,
      designationType
    );
    if (isForageGated(interaction) && (tile.growth?.[resourceId] ?? 100) < MIN_FORAGE_GROWTH)
      continue;
    return true;
  }
  return false;
}

/** Check whether a single item ID passes a ZoneFilter. */
export function itemMatchesFilter(itemId: string, filter: ZoneFilter): boolean {
  if (filter.blockedItems.includes(itemId)) return false;
  const item = ITEMS_DATABASE.find((i) => i.id === itemId);
  return item ? filter.allowedCategories.includes(item.category) : false;
}
