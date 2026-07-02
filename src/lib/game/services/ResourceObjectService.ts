import type { DesignationType, Pawn } from '../core/types';
import {
  RESOURCE_OBJECT_DEFS,
  resourceObjectDefById,
  type ResourceObjectDef,
  type ResourceInteractionDef
} from '../core/resourceObjectDefs';
import { pawnStatService } from './PawnStatService';
import { rng } from '../core/rng';
import { gameLogger } from '../dev/gameLogger';
import { isGameDebug } from '../core/log';

// Def table + types moved to core/resourceObjectDefs.ts ("data files are definitions"; lets the
// renderer read defs without importing this service). Re-exported so existing importers keep working.
export {
  isGrowableResource,
  RESOURCE_OBJECT_DEFS,
  resourceObjectDefById,
  type ResourceObjectDef,
  type ResourceInteractionDef,
  type ResourceYieldDef,
  type ToolRequirement
} from '../core/resourceObjectDefs';

const WORK_STAT_FALLBACK: Record<string, keyof Pawn['stats']> = {
  foraging: 'perception',
  woodcutting: 'strength',
  mining: 'strength'
};

class ResourceObjectServiceImpl {
  getAll(): ResourceObjectDef[] {
    return RESOURCE_OBJECT_DEFS;
  }

  getById(resourceId: string): ResourceObjectDef | undefined {
    return resourceObjectDefById(resourceId);
  }

  /** Lazily-built map: item id → the cultivated crop it belongs to, as its SEED or harvested PRODUCE. */
  private cropByItem: Map<string, { def: ResourceObjectDef; role: 'seed' | 'produce' }> | null = null;

  /**
   * The cultivated crop an ITEM relates to — its SEED (`crop.seedItem`) or its harvested PRODUCE (a reap
   * yield) — so the item tooltip can surface the crop's grow window (temp/water/soil) for both. Seeds win
   * when an id is both (a crop yields its own seed). `undefined` for items that aren't tied to a crop.
   */
  getCropForItem(itemId: string): { def: ResourceObjectDef; role: 'seed' | 'produce' } | undefined {
    if (!this.cropByItem) {
      const m = new Map<string, { def: ResourceObjectDef; role: 'seed' | 'produce' }>();
      for (const def of RESOURCE_OBJECT_DEFS) if (def.crop) m.set(def.crop.seedItem, { def, role: 'seed' });
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
    // `workAmount` is the direct work-point requirement (1:1, like a building's `workAmount`) — the
    // authored value in resources.jsonc IS the work, no hidden multiplier. At BASE_WORK_RATE 1 pt/s a
    // pawn clears `workAmount` work-points in `workAmount` sim-seconds (≈ workAmount × 4.8 in-game min).
    return interaction.workAmount;
  }

  /**
   * Return the interaction matching the given designation type, or the primary
   * `interaction` as a fallback when no per-type override exists.
   */
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

  /**
   * The `regrowsFromZero` interaction for this resource (carries the 0→100 `regrowthTurns` the gradual
   * growth pass advances at), or `undefined` if the node uses the binary cooldown / depletes. Checks
   * `interactions[]` first (a grass patch's cut twin), then the primary `interaction`.
   */
  getRegrowsFromZeroInteraction(resourceId: string): ResourceInteractionDef | undefined {
    const def = this.getById(resourceId);
    if (!def) return undefined;
    const found = def.interactions?.find((i) => i.regrowsFromZero);
    if (found) return found;
    return def.interaction.regrowsFromZero ? def.interaction : undefined;
  }

  /** True when any of this resource's interactions resets growth to 0 and regrows gradually. */
  isRegrowsFromZero(resourceId: string): boolean {
    return this.getRegrowsFromZeroInteraction(resourceId) !== undefined;
  }

  calculateYield(
    resourceId: string,
    pawn?: Pawn,
    availableItemIds?: Set<string>,
    dtype?: DesignationType,
    /** §F: node maturity 0–100 (tile.growth) — scales the harvest down on under-grown nodes. */
    growthPct: number = 100
  ): Record<string, number> {
    const def = this.getById(resourceId);
    if (!def) return { [resourceId]: 1 };

    const interaction = dtype
      ? (this.getInteractionByDesignationType(resourceId, dtype) ?? def.interaction)
      : def.interaction;

    const result: Record<string, number> = {};
    // Wire stats.jsonc work yield into harvest output. getWorkModifiers is the single source —
    // the `*_yield` formula already folds in racial trait workYield (see PawnStatService).
    const statYieldMult = pawn
      ? (pawnStatService.getWorkModifiers(pawn, interaction.workCategory).yield ?? 1)
      : 1;
    // §F: an under-grown node (low growth%) yields proportionally less — but never zero on a real harvest.
    const growthMult = Math.max(0, Math.min(1, growthPct / 100));
    for (const y of interaction.yields) {
      if (availableItemIds && !availableItemIds.has(y.itemId)) continue;
      const roll = this.randomInt(y.min, y.max);
      const skill = this.getSkillLevel(pawn, y.skillId, interaction.workCategory);
      const multiplier = Math.max(1, 1 + skill * y.skillMultiplier);
      // Yield multiplier produces a float (e.g. roll 3 × 1.2 = 3.6) — round UP so a bonus
      // never silently rounds away.
      const amount = Math.max(0, Math.ceil(roll * multiplier * statYieldMult * growthMult));
      // YIELD-DBG: per-item harvest breakdown (config the build sees + every multiplier). A kept
      // debug tool — gated behind gameDebug() so it's off by default but toggleable when probing
      // yields (grep YIELD-DBG .debug/pawns.log). See dev-memory: yield-dbg-debug-tool.
      // statx already includes trait workYield (folded into getWorkModifiers).
      if (isGameDebug()) {
        gameLogger.log(
          0,
          'JOB-EVT',
          () =>
            `YIELD-DBG ${resourceId}/${interaction.workCategory} ${y.itemId} cfg[${y.min}-${y.max}] roll=${roll} skillx${multiplier.toFixed(2)} statx${statYieldMult.toFixed(2)} -> ${amount}`
        );
      }
      if (amount > 0) {
        result[y.itemId] = (result[y.itemId] ?? 0) + amount;
      }
    }

    // Only fall back to a raw resource drop when no yields are defined at all
    if (Object.keys(result).length === 0 && interaction.yields.length === 0) {
      result[resourceId] = 1;
    }

    return result;
  }

  private getSkillLevel(pawn: Pawn | undefined, skillId: string, workCategory: string): number {
    if (!pawn) return 0;

    const explicit = pawn.skills?.[skillId] ?? 0;
    if (explicit > 0) return explicit;

    const statKey = WORK_STAT_FALLBACK[workCategory];
    if (!statKey) return 0;

    const statValue = pawn.stats?.[statKey] ?? 10;
    return Math.max(0, (statValue - 10) / 4);
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(rng.random() * (max - min + 1)) + min;
  }
}

export const resourceObjectService = new ResourceObjectServiceImpl();
