import type { EntityStats } from './culture';

export interface ResearchProject {
  id: string;
  name: string;
  description: string;
  category: 'knowledge' | 'crafting' | 'building' | 'military' | 'exploration' | 'social';
  tier: number;
  currentProgress?: number;

  prerequisites: string[];

  scrollRequirement?: Record<string, number>;

  materialRequirement?: Record<string, number>;

  buildingRequired?: string;
  toolRequirement?: string;
  toolTierRequired?: number;

  populationRequired?: number;

  statRequirements?: {
    minStats?: Partial<EntityStats>;
    maxStats?: Partial<EntityStats>;
  };

  unlocks: {
    toolTierRequired?: number;
    buildingLevel?: number;
    armyLevel?: number;
    weaponLevel?: number;
    buildings?: string[];
    items?: string[];
    abilities?: string[];
    effects?: Record<string, number>;
  };

  researchTime: number;
}
