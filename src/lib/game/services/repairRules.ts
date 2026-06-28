// Repair rules — when a worn building wants repairing and whether the colony stock can supply the
// materials. Mirrors fuelRules (P-4): a building concern, but BuildingService is at the god-module
// limit, so these live as focused free functions. JobService owns repair job generation/completion
// and calls in here for the rules. The repair MATERIAL model is a FLAT POOL: a repair needs N total
// units of ANY allowed material (the build-cost items + per-def substitutes like plant_fiber for hay),
// so unticking one material just falls back to the others.
import type { GameState, PlacedBuilding } from '../core/types';
import { availableAggregateFromDrops } from '../core/GameState';
import { buildingService } from './BuildingService';
import { itemService } from './ItemService';

const DEFAULT_REPAIR_THRESHOLD_PCT = 30; // repair once condition drops below 30% by default

/** Condition % below which a building wants repairing (per-building override or default). */
export function getRepairThresholdPct(building: PlacedBuilding): number {
  const raw = building.repairSettings?.repairThresholdPct;
  if (raw === undefined || Number.isNaN(raw)) return DEFAULT_REPAIR_THRESHOLD_PCT;
  return Math.max(0, Math.min(100, raw));
}

/**
 * A building's DEFAULT repair-material set: its explicit def `repairMaterials` if given (e.g. a thatch
 * roof lists hay + branch + plant_fiber so fiber can stand in for hay), else its build-cost item ids
 * with any `category:` slot expanded to every item in that category.
 */
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

/**
 * Effective allow-list of materials a repair may consume. An explicit player list (even empty, meaning
 * "repair with nothing") is honoured; otherwise the building's default set above.
 */
export function resolveAllowedRepairIds(building: PlacedBuilding): Set<string> {
  return new Set(
    building.repairSettings?.allowedMaterialItemIds ?? getDefaultAllowedRepairIds(building.type)
  );
}

/** Full-repair material budget = sum of the build-cost quantities (the flat-pool unit total). */
function totalCostUnits(buildingType: string): number {
  const def = buildingService.getBuildingById(buildingType);
  let n = 0;
  for (const q of Object.values(def?.buildingCost ?? {})) n += q as number;
  return n;
}

/** Units of material a building at `condition%` needs to repair back to 100 — PROPORTIONAL to the wear. */
export function repairUnitsNeeded(building: PlacedBuilding): number {
  const cond = building.condition ?? 100;
  if (cond >= 100) return 0;
  return Math.ceil(totalCostUnits(building.type) * (1 - cond / 100));
}

export interface RepairPlan {
  /** Items to consume from colony stock (flat pool, greedy over the allowed set). */
  consumed: Record<string, number>;
  /** Always 100 — a repair restores the building to pristine. */
  newCondition: number;
}

/**
 * Plan a repair from colony stock, or `null` if it can't be done now. SINGLE SOURCE OF TRUTH shared by
 * `generate` (queue?) and `complete` (apply) — so a queued repair can never complete as a no-op, exactly
 * like planRefuel. Cost is proportional to the damage, drawn greedily (flat pool) from the AVAILABLE
 * (unreserved, stored) allowed materials. Returns null when pristine, when there's no material to repair
 * with (a free/marker building), or when stock can't cover the proportional cost.
 */
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
  if (remaining > 0) return null; // stock can't cover the proportional cost
  return { consumed, newCondition: 100 };
}
