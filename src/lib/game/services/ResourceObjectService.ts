import type { DesignationType, Pawn } from '../core/types';
import resourceObjectsData from '../database/resources.json';

export interface ResourceYieldDef {
    itemId: string;
    min: number;
    max: number;
    skillId: string;
    skillMultiplier: number;
}

export interface ResourceInteractionDef {
    action: string;
    workCategory: string;
    workAmount: number;
    requiredTool: string;
    yields: ResourceYieldDef[];
}

export interface ResourceObjectDef {
    id: string;
    displayName: string;
    objectSubType: string;
    spawn: {
        subterrains: Record<string, number>;
    };
    nodeAmountRange: [number, number];
    designationTypes: Array<'harvest' | 'forage' | 'scavenge'>;
    interaction: ResourceInteractionDef;
}

const WORK_STAT_FALLBACK: Record<string, keyof Pawn['stats']> = {
    foraging: 'wisdom',
    woodcutting: 'strength',
    mining: 'strength'
};

class ResourceObjectServiceImpl {
    private readonly defs: ResourceObjectDef[] = resourceObjectsData as unknown as ResourceObjectDef[];
    private readonly byId = new Map(this.defs.map((d) => [d.id, d]));

    getAll(): ResourceObjectDef[] {
        return this.defs;
    }

    getById(resourceId: string): ResourceObjectDef | undefined {
        return this.byId.get(resourceId);
    }

    getByDesignation(type: DesignationType): ResourceObjectDef[] {
        if (type !== 'harvest' && type !== 'forage' && type !== 'scavenge') return [];
        return this.defs.filter((d) => d.designationTypes.includes(type));
    }

    getWorkAmount(resourceId: string): number {
        return this.getById(resourceId)?.interaction.workAmount ?? 5;
    }

    calculateYield(resourceId: string, pawn?: Pawn): Record<string, number> {
        const def = this.getById(resourceId);
        if (!def) return { [resourceId]: 1 };

        const result: Record<string, number> = {};
        for (const y of def.interaction.yields) {
            const roll = this.randomInt(y.min, y.max);
            const skill = this.getSkillLevel(pawn, y.skillId, def.interaction.workCategory);
            const multiplier = Math.max(1, 1 + skill * y.skillMultiplier);
            const amount = Math.max(1, Math.round(roll * multiplier));
            result[y.itemId] = (result[y.itemId] ?? 0) + amount;
        }

        if (Object.keys(result).length === 0) {
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
