import type { Building } from './types';

export const AVAILABLE_BUILDINGS: Building[] = [
  {
    id: 'woodland_shelter',
    name: 'Woodland Shelter',
    description: 'Basic housing that increases population capacity',
    cost: { wood: 15, stone: 5 },
    buildTime: 3,
    populationRequired: 0,
    effects: { maxPopulation: 2 },
    category: 'housing'
  },
  {
    id: 'craftsmens_workshop',
    name: "Craftsmen's Workshop", 
    description: 'Enables tool crafting and improves production',
    cost: { wood: 20, stone: 10 },
    buildTime: 4,
    populationRequired: 2,
    effects: { woodProduction: 1, stoneProduction: 1 },
    category: 'production'
  },
  {
    id: 'sages_library',
    name: "Sage's Library",
    description: 'Increases knowledge generation through study',
    cost: { wood: 25, stone: 15 },
    buildTime: 5,
    populationRequired: 1,
    effects: { knowledgeMultiplier: 1.25 },
    category: 'research'
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

