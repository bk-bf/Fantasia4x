import type { ResearchProject, LoreItem, RaceStats } from './types';

export const RESEARCH_DATABASE: ResearchProject[] = [
  // Tier 0 - Always Available
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

  // Stat-Gated Specializations
  {
    id: 'leverage_engineering',
    name: 'Leverage Engineering',
    description: 'Mechanical systems that multiply weak physical force',
    category: 'crafting',
    tier: 1,
    knowledgeCost: 200,
    prerequisites: ['basic_metallurgy'],
    statRequirements: {
      maxStats: { strength: 8 } // Only available to weak races
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
      minStats: { strength: 15 } // Only available to strong races
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

// Research availability logic
export function getAvailableResearch(
  completedResearch: string[],
  currentStats: RaceStats,
  discoveredLore: LoreItem[]
): ResearchProject[] {
  return RESEARCH_DATABASE.filter(research => {
    // Already completed
    if (completedResearch.includes(research.id)) return false;
    
    // Check prerequisites
    const hasPrereqs = research.prerequisites.every(prereq => 
      completedResearch.includes(prereq)
    );
    if (!hasPrereqs) return false;
    
    // Check stat requirements
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
