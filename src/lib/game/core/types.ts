// src/lib/game/core/types.ts
export interface GameState {
  turn: number;
  race: Race;
  resources: Resource[];
  heroes: Hero[];
  knowledge: number;
  worldMap: WorldTile[][];
  discoveredLocations: Location[];
  buildingCounts: Record<string, number>; // Replace buildings: Building[]
  currentBuilding: BuildingInProgress[];
  maxPopulation: number;
  availableResearch: string[]; // Research IDs player can start
  completedResearch: string[]; // Research IDs already finished
  currentResearch?: ResearchProject; // Currently researching
  discoveredLore: LoreItem[]; // Found lore items
  knowledgeGeneration: number; // Per-turn knowledge gain
}
export interface RaceStats {
  strength: number;
  dexterity: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  constitution: number;
}

export interface Race {
  id: string;
  name: string;
  baseStats: RaceStats;
  traits: any[]; // Changed from string[] to any[]
  population: number;
  statVariation: string;
  implications: Record<string, string>;
}
export interface Building {
  id: string;
  name: string;
  description: string;
  cost: Record<string, number>;
  buildTime: number;
  populationRequired: number;
  effects: Record<string, number>;
  category: 'housing' | 'production' | 'research' | 'military' | 'exploration' | 'social';
  researchRequired?: string | null; // Add this field
}

export interface ResearchProject {
  id: string;
  name: string;
  description: string;
  category: 'crafting' | 'building' | 'military' | 'exploration' | 'social';
  tier: number; // 0 = always available, 1+ = advanced
  
  // Unlock Requirements
  knowledgeCost: number;
  prerequisites: string[]; // Other research IDs required
  
  // Stat-based gating
  statRequirements?: {
    minStats?: Partial<RaceStats>;
    maxStats?: Partial<RaceStats>;
  };
  
  // Lore item requirements (optional bypass)
  loreItemRequired?: string;
  canBypassWithLore: boolean;
  
  // What this research unlocks
  unlocks: {
    toolLevel?: number;
    buildingLevel?: number;
    weaponLevel?: number;
    buildings?: string[]; // Specific building IDs
    ability?: string[]; // Screen access
    effects?: Record<string, number>; // Passive bonuses
  };
  
  // Research progress
  researchTime: number; // Turns to complete
  currentProgress?: number;
}

export interface LoreItem {
  id: string;
  name: string;
  description: string;
  type: 'scroll' | 'tome' | 'artifact' | 'manual' | 'fragment';
  researchUnlocks: string[]; // Research IDs this item can unlock
  discoveryWeight: number; // Rarity factor
}

export interface BuildingInProgress {
  building: Building;
  turnsRemaining: number;
  startedAt: number;
}

export interface Hero {
  id: string;
  name: string;
  stats: RaceStats;
  level: number;
  equipment: Equipment[];
  abilities: string[];
  location?: string;
}

export interface Equipment {
  id: string;
  name: string;
  type: 'weapon' | 'armor' | 'accessory';
  stats: Partial<RaceStats>;
  magical?: boolean;
}

export interface Resource {
  id: string;
  name: string;
  amount: number;
  type: 'basic' | 'magical' | 'legendary';
  properties?: Record<string, unknown>;
}

export interface Location {
  id: string;
  name: string;
  type: 'forest' | 'ruins' | 'mine' | 'settlement';
  x: number;
  y: number;
  discovered: boolean;
  resources?: Resource[];
}

export interface WorldTile {
  x: number;
  y: number;
  type: 'land' | 'water' | 'mountain' | 'forest';
  discovered: boolean;
  ascii: string;
}



