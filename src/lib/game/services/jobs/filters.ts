import type { DesignationType, GameState, Item, ZoneFilter } from '../../core/types';
import itemsData from '../../database/items/items.json';
import { resourceObjectService } from '../ResourceObjectService';
import { zoneInstanceIdAt } from '../DesignationService';

const ITEMS_DATABASE = itemsData as unknown as Item[];

export const HARVEST_DTYPES: DesignationType[] = ['harvest', 'woodcut', 'forage', 'dig'];

export function resourceMatchesDesignation(
  designationType: DesignationType,
  resourceId: string
): boolean {
  if (!HARVEST_DTYPES.includes(designationType)) return false;
  const def = resourceObjectService.getById(resourceId);
  if (!def) return true;
  return def.designationTypes.includes(designationType);
}

export function resourceMatchesFilter(
  designationType: DesignationType,
  resourceId: string,
  gs: GameState,
  tileKey?: string
): boolean {
  let filter: ZoneFilter | undefined;
  if (tileKey) {
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

export function meetsGrowthGate(
  interaction: { minGrowth?: number } | undefined,
  growth: number | undefined
): boolean {
  const gate = interaction?.minGrowth ?? 0;
  return gate <= 0 || (growth ?? 100) >= gate;
}

export function isHarvestableTileNow(
  gs: Pick<GameState, 'worldMap'>,
  x: number,
  y: number,
  designationType: DesignationType
): boolean {
  if (!HARVEST_DTYPES.includes(designationType)) return true;
  const tile = gs.worldMap?.[y]?.[x];
  if (!tile) return false;
  for (const [resourceId, amount] of Object.entries(tile.resources ?? {})) {
    if ((amount ?? 0) <= 0) continue;
    if (!resourceMatchesDesignation(designationType, resourceId)) continue;
    const interaction = resourceObjectService.getInteractionByDesignationType(
      resourceId,
      designationType
    );
    if (!meetsGrowthGate(interaction, tile.growth?.[resourceId])) continue;
    return true;
  }
  return false;
}

export function itemMatchesFilter(itemId: string, filter: ZoneFilter): boolean {
  if (filter.blockedItems.includes(itemId)) return false;
  const item = ITEMS_DATABASE.find((i) => i.id === itemId);
  return item ? filter.allowedCategories.includes(item.category) : false;
}
