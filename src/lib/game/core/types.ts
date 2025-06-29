// src/lib/game/core/types.ts

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

export interface GameState {
  turn: number;
  race: Race;
  resources: Resource[];
  heroes: Hero[];
  knowledge: number;
  worldMap: WorldTile[][];
  discoveredLocations: Location[];
  currentResearch?: ResearchProject;
}

export interface ResearchProject {
  id: string;
  name: string;
  cost: number;
  progress: number;
  category: 'military' | 'magic' | 'exploration' | 'diplomacy';
}
