// Job filters — zone/designation matching shared by the harvest and haul job handlers. Extracted
// from JobService (P-4, ADR-017 handler split): these are pure predicates over GameState with no
// per-type behaviour, so they live alongside the job handlers rather than inside the service.
import type { DesignationType, GameState, Item, ZoneFilter } from '../../core/types';
import itemsData from '../../database/items.jsonc';
import { resourceObjectService } from '../ResourceObjectService';

const ITEMS_DATABASE = itemsData as unknown as Item[];

/** Designation types that produce harvest-category jobs. */
export const HARVEST_DTYPES: DesignationType[] = ['harvest', 'woodcut', 'forage'];

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
    const instanceId = gs.designationZoneId?.[tileKey];
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

/** Check whether a single item ID passes a ZoneFilter. */
export function itemMatchesFilter(itemId: string, filter: ZoneFilter): boolean {
  if (filter.blockedItems.includes(itemId)) return false;
  const item = ITEMS_DATABASE.find((i) => i.id === itemId);
  return item ? filter.allowedCategories.includes(item.category) : false;
}
