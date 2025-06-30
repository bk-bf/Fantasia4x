import type { Building } from './types';

export const AVAILABLE_BUILDINGS: Building[] = [
  // Tier 0 - Always Available (Basic Survival)
  {
    id: 'woodland_shelter',
    name: 'Woodland Shelter',
    description: 'Basic housing that increases population capacity',
    cost: { wood: 15, stone: 5 },
    buildTime: 3,
    populationRequired: 0,
    effects: { maxPopulation: 2 },
    category: 'housing',
    researchRequired: null // Always available
  },
  {
    id: 'craftsmens_workshop',
    name: "Craftsmen's Workshop", 
    description: 'Enables tool crafting and improves production',
    cost: { wood: 20, stone: 10 },
    buildTime: 4,
    populationRequired: 2,
    effects: { woodProduction: 1, stoneProduction: 1 },
    category: 'production',
    researchRequired: null // Always available
  },
  {
    id: 'sages_library',
    name: "Sage's Library",
    description: 'Increases knowledge generation through study',
    cost: { wood: 25, stone: 15 },
    buildTime: 5,
    populationRequired: 1,
    effects: { knowledgeMultiplier: 1.25 },
    category: 'research',
    researchRequired: null // Always available
  },

  // Tier 1 - Research Unlocked Buildings
  {
    id: 'iron_forge',
    name: 'Iron Forge',
    description: 'Advanced metalworking facility for crafting iron tools',
    cost: { wood: 30, stone: 20, iron: 10 },
    buildTime: 6,
    populationRequired: 2,
    effects: { toolLevel: 1, ironProduction: 2 },
    category: 'production',
    researchRequired: 'basic_metallurgy'
  },
  {
    id: 'stone_workshop',
    name: 'Stone Workshop',
    description: 'Reinforced workspace for advanced construction projects',
    cost: { wood: 15, stone: 30 },
    buildTime: 5,
    populationRequired: 1,
    effects: { buildingSpeed: 1.5, stoneProduction: 2 },
    category: 'production',
    researchRequired: 'construction_techniques'
  },
  {
    id: 'reinforced_shelter',
    name: 'Reinforced Shelter',
    description: 'Sturdy stone housing that supports more population',
    cost: { wood: 10, stone: 25 },
    buildTime: 4,
    populationRequired: 0,
    effects: { maxPopulation: 4 },
    category: 'housing',
    researchRequired: 'construction_techniques'
  },
  {
    id: 'explorers_guild',
    name: "Explorer's Guild",
    description: 'Headquarters for organizing expeditions and mapping territories',
    cost: { wood: 35, stone: 20, iron: 5 },
    buildTime: 7,
    populationRequired: 3,
    effects: { explorationRange: 2, discoveryBonus: 1.3 },
    category: 'exploration',
    researchRequired: 'exploration_techniques'
  },

  // Tier 2 - Advanced Research Buildings
  {
    id: 'steel_foundry',
    name: 'Steel Foundry',
    description: 'High-temperature facility for producing superior steel tools',
    cost: { wood: 20, stone: 40, iron: 25 },
    buildTime: 8,
    populationRequired: 4,
    effects: { toolLevel: 2, steelProduction: 1 },
    category: 'production',
    researchRequired: 'advanced_metallurgy'
  },
  {
    id: 'engineering_hall',
    name: 'Engineering Hall',
    description: 'Center for mechanical innovation and complex construction',
    cost: { wood: 40, stone: 35, iron: 15 },
    buildTime: 9,
    populationRequired: 3,
    effects: { buildingLevel: 2, mechanicalBonus: 1.4 },
    category: 'research',
    researchRequired: 'engineering_mastery'
  },
  {
    id: 'military_academy',
    name: 'Military Academy',
    description: 'Training facility for professional soldiers and tactics',
    cost: { wood: 30, stone: 30, iron: 20 },
    buildTime: 8,
    populationRequired: 5,
    effects: { armyLevel: 1, combatBonus: 1.5 },
    category: 'military',
    researchRequired: 'military_organization'
  },
  {
    id: 'grand_library',
    name: 'Grand Library',
    description: 'Massive repository of knowledge and research center',
    cost: { wood: 50, stone: 40, iron: 10 },
    buildTime: 10,
    populationRequired: 4,
    effects: { knowledgeMultiplier: 2.0, researchSpeed: 1.3 },
    category: 'research',
    researchRequired: 'scholarly_tradition'
  },

  // Specialized Buildings (Stat-Gated Research)
  {
    id: 'leverage_workshop',
    name: 'Leverage Workshop',
    description: 'Mechanical systems that amplify weak physical force',
    cost: { wood: 25, stone: 15, iron: 20 },
    buildTime: 6,
    populationRequired: 2,
    effects: { dexterityMultiplier: 1.5, productionBonus: 1.3 },
    category: 'production',
    researchRequired: 'leverage_engineering'
  },
  {
    id: 'stronghold',
    name: 'Stronghold',
    description: 'Massive fortification built through raw strength',
    cost: { wood: 15, stone: 60 },
    buildTime: 5, // Faster due to brute force
    populationRequired: 6,
    effects: { maxPopulation: 8, defenseBonus: 2.0 },
    category: 'housing',
    researchRequired: 'brute_force_construction'
  },
  {
    id: 'diplomatic_embassy',
    name: 'Diplomatic Embassy',
    description: 'Elegant facility for hosting foreign dignitaries',
    cost: { wood: 40, stone: 25, iron: 5 },
    buildTime: 7,
    populationRequired: 2,
    effects: { diplomaticBonus: 1.8, tradeIncome: 1.4 },
    category: 'social',
    researchRequired: 'diplomatic_mastery'
  }
];


export function canAffordBuilding(building: Building, resources: Record<string, number>): boolean {
  return Object.entries(building.cost).every(([resourceId, cost]) => 
    (resources[resourceId] || 0) >= cost
  );
}

export function canBuildWithPopulation(building: Building, currentPop: number, maxPop: number): boolean {
  return currentPop >= building.populationRequired;
}

