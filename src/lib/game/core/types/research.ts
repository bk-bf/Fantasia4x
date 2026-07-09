// Research and lore types. Split out of core/types.ts (P-4); re-exported via the barrel.

import type { EntityStats } from './culture';

export interface ResearchProject {
  id: string;
  name: string;
  description: string;
  category: 'knowledge' | 'crafting' | 'building' | 'military' | 'exploration' | 'social';
  tier: number;
  currentProgress?: number;

  // Prerequisites
  prerequisites: string[];

  // Scroll Requirements (replaces knowledgeCost)
  scrollRequirement?: Record<string, number>; // bark_scrolls, hide_scrolls, parchment, etc.

  // Material Requirements (actual crafting materials)
  materialRequirement?: Record<string, number>; // copper_ingot, iron_ore, etc.

  // Building and Tool Requirements
  buildingRequired?: string;
  toolRequirement?: string;
  toolTierRequired?: number; // Matches item system

  // Population Requirements
  populationRequired?: number;

  // Stat Requirements
  statRequirements?: {
    minStats?: Partial<EntityStats>;
    maxStats?: Partial<EntityStats>;
  };

  // Lore bypass system
  loreItemRequired?: string;
  canBypassWithLore: boolean;

  // What this research unlocks
  unlocks: {
    toolTierRequired?: number; // Matches item system naming
    buildingLevel?: number;
    armyLevel?: number;
    weaponLevel?: number;
    buildings?: string[];
    items?: string[]; // Items unlocked by this research
    abilities?: string[]; // Abilities unlocked
    effects?: Record<string, number>; // Stat bonuses and effects
  };

  // Research timing
  researchTime: number;
}

export interface LoreItem {
  id: string;
  name: string;
  description: string;
  type: 'scroll' | 'tome' | 'artifact' | 'manual' | 'fragment';
  researchUnlocks: string[];
  discoveryWeight: number;
}
