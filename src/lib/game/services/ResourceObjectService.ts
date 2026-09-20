import type { DesignationType, Pawn } from '../core/types';
import {
  isGrowableResource,
  RESOURCE_OBJECT_DEFS,
  resourceObjectDefById,
  type ResourceObjectDef,
  type ResourceInteractionDef
} from '../core/defs/resourceObjects';
import { pawnStatService } from './PawnStatService';
import { rng } from '../core/util/rng';
import { gameLogger } from '../debug/gameLogger';
import { isGameDebug } from '../core/util/log';

export {
  isGrowableResource,
  RESOURCE_OBJECT_DEFS,
  resourceObjectDefById,
  type ResourceObjectDef,
  type ResourceInteractionDef,
  type ResourceYieldDef,
  type ToolRequirement
} from '../core/defs/resourceObjects';

class ResourceObjectServiceImpl {
  getAll(): ResourceObjectDef[] {
    return RESOURCE_OBJECT_DEFS;
  }

  getById(resourceId: string): ResourceObjectDef | undefined {
    return resourceObjectDefById(resourceId);
  }

  private cropByItem: Map<string, { def: ResourceObjectDef; role: 'seed' | 'produce' }> | null =
    null;

  getCropForItem(itemId: string): { def: ResourceObjectDef; role: 'seed' | 'produce' } | undefined {
    if (!this.cropByItem) {
      const m = new Map<string, { def: ResourceObjectDef; role: 'seed' | 'produce' }>();
      for (const def of RESOURCE_OBJECT_DEFS)
        if (def.crop) m.set(def.crop.seedItem, { def, role: 'seed' });
      for (const def of RESOURCE_OBJECT_DEFS) {
        if (!def.crop) continue;
        for (const y of def.interaction.yields ?? [])
          if (!m.has(y.itemId)) m.set(y.itemId, { def, role: 'produce' });
      }
      this.cropByItem = m;
    }
    return this.cropByItem.get(itemId);
  }

  getByDesignation(type: DesignationType): ResourceObjectDef[] {
    const HARVEST_TYPES: DesignationType[] = ['harvest', 'woodcut', 'forage', 'dig'];
    if (!HARVEST_TYPES.includes(type)) return [];
    return RESOURCE_OBJECT_DEFS.filter((d) => d.designationTypes.includes(type));
  }

  getWorkAmount(resourceId: string, dtype?: DesignationType): number {
    const def = this.getById(resourceId);
    if (!def) return 15;
    const interaction = dtype
      ? (this.getInteractionByDesignationType(resourceId, dtype) ?? def.interaction)
      : def.interaction;
    return interaction.workAmount;
  }

  getInteractionByDesignationType(
    resourceId: string,
    dtype: DesignationType
  ): ResourceInteractionDef | undefined {
    const def = this.getById(resourceId);
    if (!def) return undefined;
    if (def.interactions) {
      const found = def.interactions.find((i) => i.designationType === dtype);
      if (found) return found;
    }
    return def.interaction;
  }

  private harvestGates = new Map<string, number>();

  minHarvestGrowth(resourceId: string): number {
    const cached = this.harvestGates.get(resourceId);
    if (cached !== undefined) return cached;
    const def = this.getById(resourceId);
    let lowest = Infinity;
    for (const i of def ? (def.interactions ?? [def.interaction]) : []) {
      if (i.minGrowth !== undefined) lowest = Math.min(lowest, i.minGrowth);
    }
    const gate = lowest === Infinity ? 100 : lowest;
    this.harvestGates.set(resourceId, gate);
    return gate;
  }

  calculateYield(
    resourceId: string,
    pawn?: Pawn,
    dtype?: DesignationType,
    growthPct: number = 100
  ): Record<string, number> {
    const def = this.getById(resourceId);
    if (!def) return { [resourceId]: 1 };

    const interaction = dtype
      ? (this.getInteractionByDesignationType(resourceId, dtype) ?? def.interaction)
      : def.interaction;

    const result: Record<string, number> = {};
    const statYieldMult = pawn
      ? (pawnStatService.getWorkModifiers(pawn, interaction.workCategory).yield ?? 1)
      : 1;
    const growable = isGrowableResource(def);
    const growthMult = Math.max(0, Math.min(1, growthPct / 100));
    for (const y of interaction.yields) {
      if (growthPct < (y.minGrowth ?? 0)) continue;
      const base = growable ? (y.amount ?? 0) * growthMult : this.randomInt(y.min ?? 0, y.max ?? 0);
      const amount = Math.max(0, Math.ceil(base * statYieldMult));
      if (isGameDebug()) {
        gameLogger.log(
          0,
          'JOB-EVT',
          () =>
            `YIELD-DBG ${resourceId}/${interaction.workCategory} ${y.itemId} ${growable ? `amount=${y.amount} growth=${growthPct.toFixed(0)}%` : `roll[${y.min}-${y.max}]`} statx${statYieldMult.toFixed(2)} -> ${amount}`
        );
      }
      if (amount > 0) {
        result[y.itemId] = (result[y.itemId] ?? 0) + amount;
      }
    }

    if (Object.keys(result).length === 0 && interaction.yields.length === 0) {
      result[resourceId] = 1;
    }

    return result;
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(rng.random() * (max - min + 1)) + min;
  }
}

export const resourceObjectService = new ResourceObjectServiceImpl();
