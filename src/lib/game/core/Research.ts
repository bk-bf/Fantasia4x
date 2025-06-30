import type { ResearchProject, LoreItem, RaceStats } from './types';


// interface can be found at src/lib/game/core/types.ts ResearchProject 
// and possibly has to be updated with each modification of this database
export const RESEARCH_DATABASE: ResearchProject[] = [
  // Tier 0 - Always Available (existing)
  {
    id: 'basic_metallurgy',
    name: 'Basic Metallurgy',
    description: 'Learn to work with iron and basic metal crafting',
    category: 'crafting',
    tier: 0,
    knowledgeCost: 100,
    prerequisites: [],
    canBypassWithLore: true,
    loreItemRequired: 'ancient_forge_manual',
    unlocks: {
      toolLevel: 1,
      buildings: ['iron_forge']
    },
    researchTime: 10
  },
  
  {
    id: 'construction_techniques',
    name: 'Construction Techniques', 
    description: 'Advanced building methods using stone and mortar',
    category: 'building',
    tier: 0,
    knowledgeCost: 150,
    prerequisites: [],
    canBypassWithLore: true,
    loreItemRequired: 'builders_codex',
    unlocks: {
      buildingLevel: 1,
      buildings: ['stone_workshop', 'reinforced_shelter']
    },
    researchTime: 12
  },

  // Tier 1 - Gated Research (10 new options)
  
  // 1. Building + Tool Locked (10% = 1 option)
  {
    id: 'siege_engineering',
    name: 'Siege Engineering',
    description: 'Develop advanced siege weapons and tactics',
    category: 'military',
    tier: 1,
    knowledgeCost: 300,
    prerequisites: ['military_organization'],
    buildingRequired: 'military_academy',
    toolRequired: 'siege_hammer',
    canBypassWithLore: false,
    unlocks: {
      effects: { siegeBonus: 0.4 }
    },
    researchTime: 20
  },

  // 2-3. Building OR Tool Locked (20% = 2 options)
  {
    id: 'advanced_construction',
    name: 'Advanced Construction',
    description: 'Innovative building techniques for durability and speed',
    category: 'building',
    tier: 1,
    knowledgeCost: 280,
    prerequisites: ['construction_techniques'],
    toolRequired: 'stone_hammer',
    canBypassWithLore: true,
    loreItemRequired: 'builders_codex',
    unlocks: {
      buildingLevel: 2,
      buildings: ['engineering_hall']
    },
    researchTime: 16
  },

  {
    id: 'navigation',
    name: 'Navigation',
    description: 'Improve exploration and travel efficiency',
    category: 'exploration',
    tier: 1,
    knowledgeCost: 200,
    prerequisites: ['exploration_techniques'],
    buildingRequired: 'explorers_guild',
    canBypassWithLore: true,
    loreItemRequired: 'explorers_journal',
    unlocks: {
      effects: { explorationRange: 3 }
    },
    researchTime: 12
  },

  // 4-6. Population Locked (30% = 3 options)
  {
    id: 'guild_systems',
    name: 'Guild Systems',
    description: 'Organize specialized labor through guilds',
    category: 'social',
    tier: 1,
    knowledgeCost: 220,
    prerequisites: ['construction_techniques'],
    populationRequired: 5,
    canBypassWithLore: false,
    unlocks: {
      effects: { productionBonus: 0.2 }
    },
    researchTime: 12
  },

  {
    id: 'military_organization',
    name: 'Military Organization',
    description: 'Establish professional armies and tactics',
    category: 'military',
    tier: 1,
    knowledgeCost: 250,
    prerequisites: ['construction_techniques'],
    populationRequired: 4,
    canBypassWithLore: false,
    unlocks: {
      armyLevel: 1,
      buildings: ['military_academy']
    },
    researchTime: 14
  },
  
 {
  id: 'herbal_medicine',
  name: 'Herbal Medicine',
  description: 'Improve population health and recovery using medicinal herbs',
  category: 'social',
  tier: 1,
  knowledgeCost: 180,
  prerequisites: [],
  populationRequired: 3,
  resourceRequirement: { herbs: 50 }, // NEW: Resource gate
  canBypassWithLore: false,
  unlocks: {
    effects: { healthBonus: 0.15 }
  },
  researchTime: 10
},

  // 7-10. Knowledge Locked (40% = 4 options)
  {
    id: 'advanced_metallurgy',
    name: 'Advanced Metallurgy',
    description: 'Refine steel production and unlock superior tools',
    category: 'crafting',
    tier: 1,
    knowledgeCost: 300,
    prerequisites: ['basic_metallurgy'],
    canBypassWithLore: true,
    loreItemRequired: 'ancient_forge_manual',
    unlocks: {
      toolLevel: 2,
      buildings: ['steel_foundry']
    },
    researchTime: 15
  },

  {
    id: 'alchemy',
    name: 'Alchemy',
    description: 'Unlock magical crafting and resource enhancement',
    category: 'crafting',
    tier: 1,
    knowledgeCost: 270,
    prerequisites: ['basic_metallurgy'],
    canBypassWithLore: true,
    loreItemRequired: 'arcane_tome',
    unlocks: {
      effects: { magicalCrafting: 1 }
    },
    researchTime: 18
  },

  {
    id: 'diplomatic_mastery',
    name: 'Diplomatic Mastery',
    description: 'Enhance trade and alliances through diplomacy',
    category: 'social',
    tier: 1,
    knowledgeCost: 210,
    prerequisites: ['guild_systems'],
    canBypassWithLore: false,
    unlocks: {
      effects: { diplomaticBonus: 0.25 }
    },
    researchTime: 14
  },

  {
    id: 'advanced_scouting',
    name: 'Advanced Scouting',
    description: 'Improve scouting efficiency and map awareness',
    category: 'exploration',
    tier: 1,
    knowledgeCost: 220,
    prerequisites: ['exploration_techniques'],
    canBypassWithLore: true,
    loreItemRequired: 'explorers_journal',
    unlocks: {
      effects: { scoutingBonus: 0.3 }
    },
    researchTime: 14
  },

  // Existing Stat-Gated Options
  {
    id: 'leverage_engineering',
    name: 'Leverage Engineering',
    description: 'Mechanical systems that multiply weak physical force',
    category: 'crafting',
    tier: 1,
    knowledgeCost: 200,
    prerequisites: ['basic_metallurgy'],
    statRequirements: {
      maxStats: { strength: 8 }
    },
    canBypassWithLore: false,
    unlocks: {
      effects: { dexterityMultiplier: 1.5, productionBonus: 0.3 }
    },
    researchTime: 15
  },

  {
    id: 'brute_force_construction',
    name: 'Brute Force Construction',
    description: 'Raw strength-based building techniques',
    category: 'building', 
    tier: 1,
    knowledgeCost: 180,
    prerequisites: ['construction_techniques'],
    statRequirements: {
      minStats: { strength: 15 }
    },
    canBypassWithLore: false,
    unlocks: {
      effects: { buildingSpeed: 2.0, strengthBonus: 0.2 }
    },
    researchTime: 12
  },

  {
    id: 'exploration_techniques',
    name: 'Exploration Techniques',
    description: 'Systematic methods for discovering new territories',
    category: 'exploration',
    tier: 1,
    knowledgeCost: 250,
    prerequisites: ['construction_techniques'],
    canBypassWithLore: true,
    loreItemRequired: 'explorers_journal',
    unlocks: {
      ability: ['exploration']
    },
    researchTime: 20
  }
];


export const LORE_DATABASE: LoreItem[] = [
  {
    id: 'ancient_forge_manual',
    name: 'Ancient Forge Manual',
    description: 'Weathered tome describing metallurgical techniques',
    type: 'manual',
    researchUnlocks: ['basic_metallurgy', 'advanced_metallurgy'],
    discoveryWeight: 0.3
  },
  
  {
    id: 'builders_codex',
    name: "Builder's Codex",
    description: 'Stone tablets with architectural knowledge',
    type: 'tome',
    researchUnlocks: ['construction_techniques', 'engineering_mastery'],
    discoveryWeight: 0.25
  },
  
  {
    id: 'explorers_journal',
    name: "Explorer's Journal", 
    description: 'Personal notes from a legendary pathfinder',
    type: 'scroll',
    researchUnlocks: ['exploration_techniques', 'advanced_scouting'],
    discoveryWeight: 0.2
  },

  {
    id: 'weapon_fragment',
    name: 'Masterwork Weapon Fragment',
    description: 'Piece of an incredibly well-crafted blade',
    type: 'fragment',
    researchUnlocks: ['weapon_smithing', 'elite_armaments'],
    discoveryWeight: 0.15
  }
];

export function getAvailableResearch(
  completedResearch: string[],
  currentStats: RaceStats,
  currentPopulation: number,
  currentResources: Record<string, number>, // NEW parameter
  availableBuildings: string[],
  availableTools: string[],
  discoveredLore: LoreItem[]
): ResearchProject[] {
  return RESEARCH_DATABASE.filter(research => {
    // Already completed
    if (completedResearch.includes(research.id)) return false;
    
    // Prerequisites check
    if (!research.prerequisites.every(prereq => completedResearch.includes(prereq))) return false;
    
    // Stat requirements
    if (research.statRequirements) {
      const { minStats, maxStats } = research.statRequirements;
      if (minStats) {
        const meetsMin = Object.entries(minStats).every(([stat, min]) => 
          currentStats[stat as keyof RaceStats] >= min
        );
        if (!meetsMin) return false;
      }
      if (maxStats) {
        const meetsMax = Object.entries(maxStats).every(([stat, max]) => 
          currentStats[stat as keyof RaceStats] <= max
        );
        if (!meetsMax) return false;
      }
    }
    
    // Population requirements
    if (research.populationRequired && currentPopulation < research.populationRequired) return false;
    
    // Building requirements
    if (research.buildingRequired && !availableBuildings.includes(research.buildingRequired)) return false;
    
    // Tool requirements
    if (research.toolRequired && !availableTools.includes(research.toolRequired)) return false;
    
    // NEW: Resource requirements
    if (research.resourceRequirement) {
      const hasResources = Object.entries(research.resourceRequirement).every(([resourceId, amount]) => 
        (currentResources[resourceId] || 0) >= amount
      );
      if (!hasResources) return false;
    }
    
    return true;
  });
}


// Check if research can be unlocked with lore
export function canUnlockWithLore(
  researchId: string,
  discoveredLore: LoreItem[]
): boolean {
  const research = RESEARCH_DATABASE.find(r => r.id === researchId);
  if (!research?.canBypassWithLore) return false;
  
  return discoveredLore.some(lore => 
    lore.researchUnlocks.includes(researchId)
  );
}

// Calculate knowledge generation
export function calculateKnowledgeGeneration(
  raceStats: RaceStats,
  completedResearch: string[],
  buildings: Record<string, number>
): number {
  let baseGeneration = Math.floor((raceStats.intelligence + raceStats.wisdom) / 10);
  
  // Building bonuses
  const libraryCount = buildings['sages_library'] || 0;
  baseGeneration += libraryCount * 2;
  
  // Research bonuses
  const researchBonuses = completedResearch
    .map(id => RESEARCH_DATABASE.find(r => r.id === id))
    .filter(Boolean)
    .reduce((total, research) => {
      return total + (research!.unlocks.effects?.knowledgeBonus || 0);
    }, 0);
  
  return Math.max(1, baseGeneration + researchBonuses);
}
