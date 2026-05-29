import type { DesignationType, Pawn } from '../core/types';
import { resolveCharSpans, type CharSpan } from '../core/Terrains';
import resourceObjectsData from '../database/resources.jsonc';

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
    objectSubType: string;
    /** Resolved char array (from charSpans in JSON). */
    chars: string[];
    fg: [number, number, number];
    bg: [number, number, number];
    spawn: {
        subterrains: Record<string, number>;
    };
    nodeAmountRange: [number, number];
    /** Which designation types can target this resource. */
    designationTypes: DesignationType[];
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
    foraging: 'wisdom',
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
        if (!def) return 5 * 3;
        const interaction = dtype
            ? (this.getInteractionByDesignationType(resourceId, dtype) ?? def.interaction)
            : def.interaction;
        return interaction.workAmount * 3;
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
        for (const y of interaction.yields) {
            if (availableItemIds && !availableItemIds.has(y.itemId)) continue;
            const roll = this.randomInt(y.min, y.max);
            const skill = this.getSkillLevel(pawn, y.skillId, interaction.workCategory);
            const multiplier = Math.max(1, 1 + skill * y.skillMultiplier);
            const amount = Math.max(0, Math.round(roll * multiplier));
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
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
}

export const resourceObjectService = new ResourceObjectServiceImpl();
