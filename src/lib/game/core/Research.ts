import type { ResearchProject, LoreItem, RaceStats } from './types';

// RESEARCH DATABASE - Complete Integration with Items and Buildings
export const RESEARCH_DATABASE: ResearchProject[] = [
  // TIER 0 - FOUNDATION RESEARCH (Basic Survival Technologies)

  // Basic Knowledge & Writing
  {
    id: 'basic_writing',
    name: 'Basic Writing',
    description: 'Learn to record knowledge on bark and hide scrolls',
    category: 'knowledge',
    tier: 0,
    prerequisites: [],
    scrollRequirement: {
      bark_scrolls: 3
    },
    canBypassWithLore: false,
    unlocks: {
      items: ['hide_scrolls', 'parchment'],
      effects: { writingSpeed: 1.2 }
    },
    researchTime: 5
  },

  // Basic Metallurgy Chain
  {
    id: 'copper_smelting',
    name: 'Copper Smelting',
    description: 'Learn to extract pure copper from ore using fire',
    category: 'crafting',
    tier: 0,
    prerequisites: [],
    scrollRequirement: {
      bark_scrolls: 5
    },
    materialRequirement: {
      copper_ore: 3,
      charcoal: 2
    },
    canBypassWithLore: true,
    loreItemRequired: 'ancient_forge_manual',
    unlocks: {
      buildings: ['smelting_furnace'],
      items: ['copper_ingot'],
      toolTierRequired: 1
    },
    researchTime: 8
  },

  // Basic Construction
  {
    id: 'stone_masonry',
    name: 'Stone Masonry',
    description: 'Advanced building methods using shaped stone',
    category: 'building',
    tier: 0,
    prerequisites: [],
    scrollRequirement: {
      bark_scrolls: 4
    },
    materialRequirement: {
      limestone: 10,
      sandstone: 5
    },
    canBypassWithLore: true,
    loreItemRequired: 'builders_codex',
    unlocks: {
      buildings: ['stone_hut'],
      items: ['cut_stone'],
      effects: { buildingDurability: 1.3 }
    },
    researchTime: 6
  },

  // Basic Processing
  {
    id: 'charcoal_making',
    name: 'Charcoal Making',
    description: 'Convert wood into high-heat fuel through controlled burning',
    category: 'crafting',
    tier: 0,
    prerequisites: [],
    scrollRequirement: {
      bark_scrolls: 3
    },
    materialRequirement: {
      oak_wood: 10
    },
    canBypassWithLore: false,
    unlocks: {
      buildings: ['charcoal_kiln'],
      items: ['charcoal'],
      effects: { fuelEfficiency: 1.5 }
    },
    researchTime: 4
  },

  // TIER 1 - BRONZE AGE TECHNOLOGIES

  // Advanced Writing & Knowledge
  {
    id: 'advanced_writing',
    name: 'Advanced Writing',
    description: 'Create parchment and develop scholarly methods',
    category: 'knowledge',
    tier: 1,
    prerequisites: ['basic_writing'],
    buildingRequired: 'scroll_hut',
    scrollRequirement: {
      bark_scrolls: 10,
      hide_scrolls: 5
    },
    canBypassWithLore: false,
    unlocks: {
      buildings: ['learning_hall'],
      items: ['scholars_ink'],
      effects: { researchSpeed: 1.3 }
    },
    researchTime: 12
  },

  // Bronze Working Chain
  {
    id: 'tin_smelting',
    name: 'Tin Smelting',
    description: 'Extract tin from cassiterite ore for bronze alloys',
    category: 'crafting',
    tier: 1,
    prerequisites: ['copper_smelting'],
    buildingRequired: 'smelting_furnace',
    scrollRequirement: {
      hide_scrolls: 4
    },
    materialRequirement: {
      tin_ore: 5,
      charcoal: 3
    },
    canBypassWithLore: true,
    loreItemRequired: 'ancient_forge_manual',
    unlocks: {
      items: ['tin_ingot'],
      effects: { alloyKnowledge: 1.0 }
    },
    researchTime: 10
  },

  {
    id: 'bronze_working',
    name: 'Bronze Working',
    description: 'Alloy copper and tin to create superior bronze',
    category: 'crafting',
    tier: 1,
    prerequisites: ['copper_smelting', 'tin_smelting'],
    buildingRequired: 'smelting_furnace',
    scrollRequirement: {
      hide_scrolls: 8
    },
    materialRequirement: {
      copper_ingot: 5,
      tin_ingot: 2
    },
    canBypassWithLore: true,
    loreItemRequired: 'ancient_forge_manual',
    unlocks: {
      buildings: ['bronze_foundry'],
      items: ['bronze_ingot'],
      toolTierRequired: 1
    },
    researchTime: 15
  },

  // Specialized Crafting
  {
    id: 'leather_working',
    name: 'Leather Working',
    description: 'Process hides into durable leather goods',
    category: 'crafting',
    tier: 1,
    prerequisites: [],
    scrollRequirement: {
      hide_scrolls: 6
    },
    materialRequirement: {
      hide: 10,
      oak_bark: 5
    },
    canBypassWithLore: false,
    unlocks: {
      buildings: ['tannery'],
      items: ['leather'],
      effects: { leatherQuality: 1.5 }
    },
    researchTime: 10
  },

  // Advanced Pottery
  {
    id: 'pottery',
    name: 'Pottery',
    description: 'Create heat-resistant ceramics and fire bricks',
    category: 'crafting',
    tier: 1,
    prerequisites: [],
    scrollRequirement: {
      hide_scrolls: 5
    },
    materialRequirement: {
      fire_clay: 8,
      charcoal: 4
    },
    canBypassWithLore: false,
    unlocks: {
      buildings: ['advanced_kiln'],
      items: ['fire_bricks'],
      effects: { ceramicQuality: 1.6 }
    },
    researchTime: 8
  },

  {
    id: 'fine_ceramics',
    name: 'Fine Ceramics',
    description: 'Master the art of delicate porcelain creation',
    category: 'crafting',
    tier: 1,
    prerequisites: ['pottery'],
    buildingRequired: 'advanced_kiln',
    scrollRequirement: {
      parchment: 8,
      scholars_ink: 3
    },
    materialRequirement: {
      porcelain_clay: 5
    },
    canBypassWithLore: false,
    unlocks: {
      buildings: ['porcelain_workshop'],
      items: ['porcelain_vessels'],
      effects: { luxuryProduction: 1.8 }
    },
    researchTime: 12
  },

  // Food & Agriculture
  {
    id: 'cooking',
    name: 'Cooking',
    description: 'Advanced food preparation techniques for nutrition',
    category: 'social',
    tier: 1,
    prerequisites: [],
    scrollRequirement: {
      hide_scrolls: 4
    },
    materialRequirement: {
      clay_pot: 2,
      herbs: 5
    },
    canBypassWithLore: false,
    unlocks: {
      buildings: ['kitchen'],
      items: ['hearty_stew'],
      effects: { nutritionBonus: 1.4 }
    },
    researchTime: 6
  },

  {
    id: 'baking',
    name: 'Baking',
    description: 'Stone oven techniques for bread and grain processing',
    category: 'social',
    tier: 1,
    prerequisites: ['cooking'],
    buildingRequired: 'kitchen',
    scrollRequirement: {
      parchment: 6
    },
    materialRequirement: {
      grain: 10,
      fire_bricks: 5
    },
    canBypassWithLore: false,
    unlocks: {
      buildings: ['bakery'],
      items: ['fresh_bread'],
      effects: { grainProcessing: 1.6 }
    },
    researchTime: 8
  },

  {
    id: 'fermentation',
    name: 'Fermentation',
    description: 'Controlled fermentation for alcoholic beverages',
    category: 'social',
    tier: 1,
    prerequisites: [],
    scrollRequirement: {
      hide_scrolls: 5
    },
    materialRequirement: {
      wild_berries: 15,
      honey: 5
    },
    canBypassWithLore: false,
    unlocks: {
      buildings: ['brewery'],
      items: ['berry_wine'],
      effects: { alcoholProduction: 1.5 }
    },
    researchTime: 10
  },

  // Exploration & Military
  {
    id: 'fishing_techniques',
    name: 'Fishing Techniques',
    description: 'Advanced methods for catching river and lake fish',
    category: 'exploration',
    tier: 1,
    prerequisites: [],
    scrollRequirement: {
      hide_scrolls: 4
    },
    materialRequirement: {
      bone_fishhook: 5,
      sinew: 10
    },
    canBypassWithLore: false,
    unlocks: {
      buildings: ['fishing_dock'],
      effects: { fishingYield: 1.8 }
    },
    researchTime: 6
  },

  {
    id: 'organized_hunting',
    name: 'Organized Hunting',
    description: 'Systematic hunting techniques and meat processing',
    category: 'military',
    tier: 1,
    prerequisites: [],
    scrollRequirement: {
      hide_scrolls: 6
    },
    materialRequirement: {
      bronze_weapons: 3,
      leather: 5
    },
    canBypassWithLore: false,
    unlocks: {
      buildings: ['hunting_lodge'],
      effects: { huntingEfficiency: 1.6 }
    },
    researchTime: 8
  },

  {
    id: 'military_organization',
    name: 'Military Organization',
    description: 'Establish professional armies and tactics',
    category: 'military',
    tier: 1,
    prerequisites: ['bronze_working'],
    populationRequired: 4,
    scrollRequirement: {
      parchment: 8
    },
    materialRequirement: {
      bronze_weapons: 5,
      bronze_armor: 3
    },
    canBypassWithLore: false,
    unlocks: {
      buildings: ['armory', 'war_camp'],
      effects: { militaryEfficiency: 1.5 }
    },
    researchTime: 14
  },

  // Alchemy & Magic
  {
    id: 'basic_alchemy',
    name: 'Basic Alchemy',
    description: 'Fundamental principles of material transformation',
    category: 'crafting',
    tier: 1,
    prerequisites: ['bronze_working'],
    buildingRequired: 'learning_hall',
    scrollRequirement: {
      parchment: 10,
      scholars_ink: 5
    },
    materialRequirement: {
      herbs: 15,
      bronze_vessel: 3
    },
    canBypassWithLore: false,
    unlocks: {
      buildings: ['alchemist_lab'],
      items: ['miners_elixir', 'crafters_focus'],
      effects: { alchemicalKnowledge: 1.0 }
    },
    researchTime: 15
  },

  {
    id: 'crystal_working',
    name: 'Crystal Working',
    description: 'Cutting and shaping crystals for magical focuses',
    category: 'crafting',
    tier: 1,
    prerequisites: ['basic_alchemy'],
    buildingRequired: 'alchemist_lab',
    scrollRequirement: {
      parchment: 12
    },
    materialRequirement: {
      crystal: 5,
      bronze_tools: 3
    },
    canBypassWithLore: false,
    unlocks: {
      buildings: ['crystal_workshop'],
      items: ['crystal_focus'],
      effects: { magicalFocus: 1.4 }
    },
    researchTime: 18
  },

  // TIER 2 - IRON AGE TECHNOLOGIES

  // Advanced Knowledge
  {
    id: 'scholarly_methods',
    name: 'Scholarly Methods',
    description: 'Systematic research and experimentation techniques',
    category: 'knowledge',
    tier: 2,
    prerequisites: ['advanced_writing'],
    buildingRequired: 'learning_hall',
    scrollRequirement: {
      parchment: 20,
      scholars_ink: 10
    },
    canBypassWithLore: false,
    unlocks: {
      buildings: ['scholars_workshop'],
      items: ['research_notes'],
      effects: { researchEfficiency: 2.0 }
    },
    researchTime: 20
  },

  // Iron Working Chain
  {
    id: 'iron_smelting',
    name: 'Iron Smelting',
    description: 'Extract iron from ore using advanced furnace techniques',
    category: 'crafting',
    tier: 2,
    prerequisites: ['bronze_working'],
    buildingRequired: 'bronze_foundry',
    scrollRequirement: {
      parchment: 15
    },
    materialRequirement: {
      iron_ore: 10,
      charcoal: 15
    },
    canBypassWithLore: true,
    loreItemRequired: 'ancient_forge_manual',
    unlocks: {
      items: ['wrought_iron'],
      effects: { ironKnowledge: 1.0 }
    },
    researchTime: 18
  },

  {
    id: 'iron_working',
    name: 'Iron Working',
    description: 'Forge wrought iron into tools and weapons',
    category: 'crafting',
    tier: 2,
    prerequisites: ['iron_smelting'],
    buildingRequired: 'bronze_foundry',
    scrollRequirement: {
      parchment: 18,
      research_notes: 5
    },
    materialRequirement: {
      wrought_iron: 8,
      charcoal: 10
    },
    canBypassWithLore: true,
    loreItemRequired: 'ancient_forge_manual',
    unlocks: {
      buildings: ['iron_forge'],
      toolTierRequired: 2,
      effects: { ironworking: 1.5 }
    },
    researchTime: 25
  },

  {
    id: 'steel_making',
    name: 'Steel Making',
    description: 'Master the art of creating superior steel alloys',
    category: 'crafting',
    tier: 2,
    prerequisites: ['iron_working'],
    buildingRequired: 'iron_forge',
    scrollRequirement: {
      parchment: 25,
      research_notes: 10
    },
    materialRequirement: {
      wrought_iron: 20,
      charcoal: 30,
      limestone: 10
    },
    canBypassWithLore: false,
    unlocks: {
      buildings: ['blast_furnace'],
      items: ['steel_ingot'],
      effects: { steelmastery: 2.0 }
    },
    researchTime: 30
  },

  // Advanced Food Processing
  {
    id: 'food_preservation',
    name: 'Food Preservation',
    description: 'Advanced techniques for storing food long-term',
    category: 'social',
    tier: 2,
    prerequisites: ['baking'],
    buildingRequired: 'bakery',
    scrollRequirement: {
      parchment: 12
    },
    materialRequirement: {
      salt: 10,
      porcelain_vessels: 5
    },
    canBypassWithLore: false,
    unlocks: {
      buildings: ['granary'],
      effects: { foodPreservation: 2.0 }
    },
    researchTime: 15
  },

  {
    id: 'distillation',
    name: 'Distillation',
    description: 'Advanced alcohol production through distillation',
    category: 'crafting',
    tier: 2,
    prerequisites: ['fermentation', 'bronze_working'],
    buildingRequired: 'brewery',
    scrollRequirement: {
      parchment: 15,
      research_notes: 3
    },
    materialRequirement: {
      bronze_ingot: 8,
      crystal: 2
    },
    canBypassWithLore: false,
    unlocks: {
      buildings: ['distillery'],
      items: ['distilled_spirits'],
      effects: { distillationMastery: 1.8 }
    },
    researchTime: 20
  },

  // Advanced Military
  {
    id: 'fortification',
    name: 'Fortification',
    description: 'Design and build defensive structures',
    category: 'military',
    tier: 2,
    prerequisites: ['military_organization', 'iron_working'],
    buildingRequired: 'war_camp',
    populationRequired: 5,
    scrollRequirement: {
      parchment: 20,
      research_notes: 5
    },
    materialRequirement: {
      granite: 25,
      wrought_iron: 10
    },
    canBypassWithLore: false,
    unlocks: {
      buildings: ['fortress_wall'],
      effects: { defensiveArchitecture: 2.0 }
    },
    researchTime: 25
  },

  // Advanced Alchemy
  {
    id: 'master_alchemy',
    name: 'Master Alchemy',
    description: 'Advanced alchemical techniques and powerful elixirs',
    category: 'crafting',
    tier: 2,
    prerequisites: ['basic_alchemy', 'iron_working'],
    buildingRequired: 'alchemist_lab',
    scrollRequirement: {
      parchment: 25,
      research_notes: 8
    },
    materialRequirement: {
      rare_herbs: 20,
      steel_essence: 5
    },
    canBypassWithLore: false,
    unlocks: {
      buildings: ['grand_laboratory'],
      items: ['master_crafters_elixir'],
      effects: { alchemicalMastery: 2.5 }
    },
    researchTime: 30
  },

  // Commerce & Trade
  {
    id: 'commerce',
    name: 'Commerce',
    description: 'Establish trade networks and market systems',
    category: 'social',
    tier: 1,
    prerequisites: ['bronze_working'],
    populationRequired: 3,
    scrollRequirement: {
      parchment: 10
    },
    materialRequirement: {
      bronze_ingot: 5,
      porcelain_vessels: 3
    },
    canBypassWithLore: false,
    unlocks: {
      buildings: ['marketplace'],
      effects: { tradeEfficiency: 1.5 }
    },
    researchTime: 12
  },

  {
    id: 'foreign_trade',
    name: 'Foreign Trade',
    description: 'Establish trade routes with distant civilizations',
    category: 'social',
    tier: 2,
    prerequisites: ['commerce', 'iron_working'],
    buildingRequired: 'marketplace',
    populationRequired: 4,
    scrollRequirement: {
      parchment: 18,
      research_notes: 4
    },
    materialRequirement: {
      luxury_goods: 10,
      steel_ingot: 3
    },
    canBypassWithLore: false,
    unlocks: {
      buildings: ['trading_post'],
      effects: { foreignTrade: 1.8 }
    },
    researchTime: 20
  },

  // Specialized Technologies
  {
    id: 'advanced_forestry',
    name: 'Advanced Forestry',
    description: 'Sustainable forestry and rare wood cultivation',
    category: 'exploration',
    tier: 1,
    prerequisites: [],
    scrollRequirement: {
      hide_scrolls: 8
    },
    materialRequirement: {
      oak_wood: 20,
      ash_wood: 15
    },
    canBypassWithLore: false,
    unlocks: {
      items: ['yew_wood', 'hickory_wood'],
      effects: { forestryMastery: 1.6 }
    },
    researchTime: 15
  },

  {
    id: 'masonry',
    name: 'Advanced Masonry',
    description: 'Sophisticated stone construction techniques',
    category: 'building',
    tier: 1,
    prerequisites: ['stone_masonry'],
    scrollRequirement: {
      parchment: 8
    },
    materialRequirement: {
      granite: 15,
      limestone: 20
    },
    canBypassWithLore: true,
    loreItemRequired: 'builders_codex',
    unlocks: {
      items: ['marble', 'cut_granite'],
      effects: { masonryMastery: 1.8 }
    },
    researchTime: 12
  }
];

export const LORE_DATABASE: LoreItem[] = [
  {
    id: 'ancient_forge_manual',
    name: 'Ancient Forge Manual',
    description: 'Weathered tome describing metallurgical techniques',
    type: 'manual',
    researchUnlocks: ['copper_smelting', 'bronze_working', 'iron_smelting', 'iron_working'],
    discoveryWeight: 0.3
  },

  {
    id: 'builders_codex',
    name: "Builder's Codex",
    description: 'Stone tablets with architectural knowledge',
    type: 'tome',
    researchUnlocks: ['stone_masonry', 'masonry'],
    discoveryWeight: 0.25
  },

  {
    id: 'explorers_journal',
    name: "Explorer's Journal",
    description: 'Personal notes from a legendary pathfinder',
    type: 'scroll',
    researchUnlocks: ['fishing_techniques', 'organized_hunting', 'advanced_forestry'],
    discoveryWeight: 0.2
  },

  {
    id: 'scholars_treatise',
    name: 'Ancient Scholars Treatise',
    description: 'Advanced research methodologies from a lost civilization',
    type: 'tome',
    researchUnlocks: ['scholarly_methods', 'master_alchemy'],
    discoveryWeight: 0.15
  },

  {
    id: 'alchemists_notes',
    name: 'Alchemists Notes',
    description: 'Cryptic formulas and experimental procedures',
    type: 'scroll',
    researchUnlocks: ['basic_alchemy', 'crystal_working'],
    discoveryWeight: 0.18
  }
];

// Enhanced research availability check
export function getAvailableResearch(
  completedResearch: string[],
  currentStats: RaceStats,
  currentPopulation: number,
  currentResources: Record<string, number>,
  availableBuildings: string[],
  availableTools: string[],
  discoveredLore: LoreItem[]
): ResearchProject[] {
  return RESEARCH_DATABASE.filter((research) => {
    // Already completed
    if (completedResearch.includes(research.id)) return false;

    // Prerequisites check
    if (!research.prerequisites.every((prereq) => completedResearch.includes(prereq))) return false;

    // Population requirements
    if (research.populationRequired && currentPopulation < research.populationRequired)
      return false;

    // Building requirements
    if (research.buildingRequired && !availableBuildings.includes(research.buildingRequired))
      return false;

    // Tool requirements
    if (research.toolRequirement && !availableTools.includes(research.toolRequirement))
      return false;

    // Scroll requirements (must have scrolls available)
    if (research.scrollRequirement) {
      const hasScrolls = Object.entries(research.scrollRequirement).every(
        ([scrollId, amount]) => (currentResources[scrollId] || 0) >= amount
      );
      if (!hasScrolls) return false;
    }

    // Material requirements (for actual crafting materials)
    if (research.materialRequirement) {
      const hasMaterials = Object.entries(research.materialRequirement).every(
        ([materialId, amount]) => (currentResources[materialId] || 0) >= amount
      );
      if (!hasMaterials) return false;
    }

    return true;
  });
}

// Check if research can be unlocked with lore
export function canUnlockWithLore(researchId: string, discoveredLore: LoreItem[]): boolean {
  const research = RESEARCH_DATABASE.find((r) => r.id === researchId);
  if (!research?.canBypassWithLore) return false;

  return discoveredLore.some((lore) => lore.researchUnlocks.includes(researchId));
}

// Get research requirements for display
export function getResearchRequirements(researchId: string): {
  scrolls: Record<string, number>;
  materials: Record<string, number>;
  buildings: string[];
  population: number;
  prerequisites: string[];
} {
  const research = RESEARCH_DATABASE.find((r) => r.id === researchId);
  if (!research)
    return { scrolls: {}, materials: {}, buildings: [], population: 0, prerequisites: [] };

  return {
    scrolls: research.scrollRequirement || {},
    materials: research.materialRequirement || {},
    buildings: research.buildingRequired ? [research.buildingRequired] : [],
    population: research.populationRequired || 0,
    prerequisites: research.prerequisites
  };
}

// Calculate research progress based on available scrolls and materials
export function calculateResearchProgress(
  researchId: string,
  availableItems: Record<string, number>
): {
  canStart: boolean;
  scrollsNeeded: Record<string, number>;
  materialsNeeded: Record<string, number>;
} {
  const research = RESEARCH_DATABASE.find((r) => r.id === researchId);
  if (!research) return { canStart: false, scrollsNeeded: {}, materialsNeeded: {} };

  const scrollsNeeded: Record<string, number> = {};
  const materialsNeeded: Record<string, number> = {};
  let canStart = true;

  // Check scroll requirements
  if (research.scrollRequirement) {
    Object.entries(research.scrollRequirement).forEach(([scrollId, required]) => {
      const available = availableItems[scrollId] || 0;
      if (available < required) {
        scrollsNeeded[scrollId] = required - available;
        canStart = false;
      }
    });
  }

  // Check material requirements
  if (research.materialRequirement) {
    Object.entries(research.materialRequirement).forEach(([materialId, required]) => {
      const available = availableItems[materialId] || 0;
      if (available < required) {
        materialsNeeded[materialId] = required - available;
        canStart = false;
      }
    });
  }

  return {
    canStart,
    scrollsNeeded,
    materialsNeeded
  };
}
