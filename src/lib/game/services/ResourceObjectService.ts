import type { DesignationType, Pawn } from '../core/types';
import { resolveCharSpans, type CharSpan } from '../core/Terrains';
import resourceObjectsData from '../database/resources.jsonc';
import { pawnStatService } from './PawnStatService';
import { rng } from '../core/rng';
import { gameLogger } from '../dev/gameLogger';
import { isGameDebug } from '../core/log';

export interface ResourceYieldDef {
  itemId: string;
  min: number;
  max: number;
  skillId: string;
  skillMultiplier: number;
  /**
   * When set, this specific yield item has its own regrowth timer (independent of
   * other yields from the same resource). Requires `persistent: true` on the interaction.
   * Cooldown is tracked as a compound key `resourceId:itemId` in `WorldTile.resourceCooldowns`.
   */
  regrowthTurns?: number;
}

export interface ToolRequirement {
  workType: string;
  minTier: number;
}

export interface ResourceInteractionDef {
  /** Which designation type triggers this interaction. Required when used in `interactions[]`. */
  designationType?: DesignationType;
  action: string;
  workCategory: string;
  workAmount: number;
  toolRequirement: ToolRequirement | null;
  yields: ResourceYieldDef[];
  /**
   * When true the resource object persists after harvesting — items are depleted
   * and a regrowth cooldown is started instead of removing the node permanently.
   */
  persistent?: boolean;
  /**
   * When true this interaction removes the resource node on completion (e.g. chopping).
   * When false (or absent) the node persists and yields regrow via cooldowns.
   */
  harvestDepletes?: boolean;
  /** Turns to wait before items regrow (requires persistent: true). */
  regrowthTurns?: number;
}

export interface ResourceObjectDef {
  id: string;
  displayName: string;
  subterrain: string;
  /**
   * Whether this resource object allows movement through its tile.
   * When false, placing this resource sets tile.walkable = false.
   * Defaults to true when absent.
   */
  walkable?: boolean;
  /** Resolved char array (from charSpans in JSON). */
  chars: string[];
  fg: [number, number, number];
  bg: [number, number, number];
  spawn: {
    subterrains: Record<string, number>;
  };
  nodeAmountRange: [number, number];
  /**
   * PRODUCTION-CHAIN-II §M — optional soft point-light overlay (a dim, campfire-style glow that
   * makes a resource stand out). Collected by `LightingService.collectResourceEmitters` and baked
   * into the tile-light field exactly like a building's light, just dimmer. Used by the ancient-wood
   * groves so their tiles read as faintly magical. Colour is normalised RGB.
   */
  glow?: {
    color: [number, number, number];
    radius: number;
    intensity: number;
    flicker?: boolean;
  };
  /** Which designation types can target this resource. */
  designationTypes: DesignationType[];
  /**
   * When true, grazing animals can eat this resource directly (depletes 1 unit per meal).
   * Used by EntityService to discover edible tiles without a hardcoded ID list.
   */
  grazing?: boolean;
  /** Primary interaction (backward-compat; also used when `interactions` is absent). */
  interaction: ResourceInteractionDef;
  /**
   * Per-designation-type interaction overrides.
   * When present, each entry's `designationType` field identifies which designation
   * triggers it. Resources without this field use `interaction` for all designations.
   */
  interactions?: ResourceInteractionDef[];
}

const WORK_STAT_FALLBACK: Record<string, keyof Pawn['stats']> = {
  foraging: 'perception',
  woodcutting: 'strength',
  mining: 'strength'
};

class ResourceObjectServiceImpl {
  private readonly defs: ResourceObjectDef[];
  private readonly byId: Map<string, ResourceObjectDef>;

  constructor() {
    this.defs = (resourceObjectsData as unknown as Array<Record<string, unknown>>).map((raw) => ({
      ...(raw as Omit<ResourceObjectDef, 'chars'>),
      chars: resolveCharSpans((raw.charSpans ?? []) as CharSpan[])
    }));
    this.byId = new Map(this.defs.map((d) => [d.id, d]));
  }

  getAll(): ResourceObjectDef[] {
    return this.defs;
  }

  getById(resourceId: string): ResourceObjectDef | undefined {
    return this.byId.get(resourceId);
  }

  getByDesignation(type: DesignationType): ResourceObjectDef[] {
    const HARVEST_TYPES: DesignationType[] = ['harvest', 'woodcut', 'forage'];
    if (!HARVEST_TYPES.includes(type)) return [];
    return this.defs.filter((d) => d.designationTypes.includes(type));
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

  calculateYield(
    resourceId: string,
    pawn?: Pawn,
    availableItemIds?: Set<string>,
    dtype?: DesignationType
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
    for (const y of interaction.yields) {
      if (availableItemIds && !availableItemIds.has(y.itemId)) continue;
      const roll = this.randomInt(y.min, y.max);
      const skill = this.getSkillLevel(pawn, y.skillId, interaction.workCategory);
      const multiplier = Math.max(1, 1 + skill * y.skillMultiplier);
      // Yield multiplier produces a float (e.g. roll 3 × 1.2 = 3.6) — round UP so a bonus
      // never silently rounds away.
      const amount = Math.max(0, Math.ceil(roll * multiplier * statYieldMult));
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
