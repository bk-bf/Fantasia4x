import type { DesignationType, Pawn } from '../core/types';
import {
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

  getRegrowsFromZeroInteraction(resourceId: string): ResourceInteractionDef | undefined {
    const def = this.getById(resourceId);
    if (!def) return undefined;
    const found = def.interactions?.find((i) => i.regrowsFromZero);
    if (found) return found;
    return def.interaction.regrowsFromZero ? def.interaction : undefined;
  }

  isRegrowsFromZero(resourceId: string): boolean {
    return this.getRegrowsFromZeroInteraction(resourceId) !== undefined;
  }

  calculateYield(
    resourceId: string,
    pawn?: Pawn,
    availableItemIds?: Set<string>,
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
    const growthMult = Math.max(0, Math.min(1, growthPct / 100));
    for (const y of interaction.yields) {
      if (availableItemIds && !availableItemIds.has(y.itemId)) continue;
      const roll = this.randomInt(y.min, y.max);
      const amount = Math.max(0, Math.ceil(roll * statYieldMult * growthMult));
      if (isGameDebug()) {
        gameLogger.log(
          0,
          'JOB-EVT',
          () =>
            `YIELD-DBG ${resourceId}/${interaction.workCategory} ${y.itemId} cfg[${y.min}-${y.max}] roll=${roll} statx${statYieldMult.toFixed(2)} -> ${amount}`
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
