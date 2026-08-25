import type { GameState, PlacedBuilding } from '../core/types';
import { availableAggregateFromDrops } from '../core/state/stockpile';
import { buildingService } from './BuildingService';
import { itemService } from './ItemService';

const DEFAULT_REPAIR_THRESHOLD_PCT = 30;

export function getRepairThresholdPct(building: PlacedBuilding): number {
  const raw = building.repairSettings?.repairThresholdPct;
  if (raw === undefined || Number.isNaN(raw)) return DEFAULT_REPAIR_THRESHOLD_PCT;
  return Math.max(0, Math.min(100, raw));
}

export function getDefaultAllowedRepairIds(buildingType: string): string[] {
  const def = buildingService.getBuildingById(buildingType);
  if (!def) return [];
  if (def.repairMaterials?.length) return [...def.repairMaterials];
  const ids = new Set<string>();
  for (const key of Object.keys(def.buildingCost ?? {})) {
    if (key.startsWith('category:')) {
      const cat = key.slice('category:'.length);
      for (const it of itemService.getItemsByCategory(cat)) ids.add(it.id);
    } else ids.add(key);
  }
  return [...ids];
}

export function resolveAllowedRepairIds(building: PlacedBuilding): Set<string> {
  return new Set(
    building.repairSettings?.allowedMaterialItemIds ?? getDefaultAllowedRepairIds(building.type)
  );
}

function totalCostUnits(buildingType: string): number {
  const def = buildingService.getBuildingById(buildingType);
  let n = 0;
  for (const q of Object.values(def?.buildingCost ?? {})) n += q as number;
  return n;
}

export function repairUnitsNeeded(building: PlacedBuilding): number {
  const cond = building.condition ?? 100;
  if (cond >= 100) return 0;
  return Math.ceil(totalCostUnits(building.type) * (1 - cond / 100));
}

export interface RepairPlan {
  consumed: Record<string, number>;
  newCondition: number;
}

export function planRepair(gs: GameState, building: PlacedBuilding): RepairPlan | null {
  const needed = repairUnitsNeeded(building);
  if (needed <= 0) return null;
  const allowed = resolveAllowedRepairIds(building);
  if (allowed.size === 0) return null;
  const avail = availableAggregateFromDrops(gs.droppedItems);
  const consumed: Record<string, number> = {};
  let remaining = needed;
  for (const itemId of allowed) {
    if (remaining <= 0) break;
    const have = avail[itemId] ?? 0;
    if (have <= 0) continue;
    const take = Math.min(have, remaining);
    consumed[itemId] = take;
    remaining -= take;
  }
  if (remaining > 0) return null;
  return { consumed, newCondition: 100 };
}
