export interface GameState {
	turn: number;
	race: Race;
	item: Item[];
	heroes: Hero[];
	knowledge: number;
	worldMap: WorldTile[][];
	discoveredLocations: Location[];
	buildingCounts: Record<string, number>; // Replace buildings: Building[]
	buildingQueue: BuildingInProgress[];
	maxPopulation: number;
	availableResearch: string[]; // Research IDs player can start
	completedResearch: string[]; // Research IDs already finished
	currentResearch?: ResearchProject; // Currently researching
	discoveredLore: LoreItem[]; // Found lore items
	knowledgeGeneration: number; // Per-turn knowledge gain
	_woodBonus?: number;
	_stoneBonus?: number;
	inventory: Record<string, number>; // resourceId -> quantity
	equippedItems: {
		weapon: string | null;
		head: string | null;
		chest: string | null;
		legs: string | null;
		feet: string | null;
		hands: string | null;
	};
	craftingQueue: CraftingInProgress[];
	currentToolLevel: number;
}

// Fixed: Remove duplicate Tool interface - Item interface covers this
export interface Item {
  id: string;
  name: string;
  amount: number;
  description?: string; // Optional description for lore or flavor text
  properties?: Record<string, any>;
  
  // Unified categorization
  type: 'material' | 'tool' | 'weapon' | 'armor' | 'consumable' | 'currency';
  category: string; // wood, iron, harvesting, combat, head, etc.
  
  // Visual
  emoji?: string;
  color?: string;
  
  // Resource properties (from search results pattern)
  maxValue?: number; // Stack limit
  passiveGeneration?: number; // Auto-generation rate
  
  // Embedded crafting requirements (like building system)
  craftingCost?: Record<string, number>;
  craftingTime?: number;
  toolLevelRequired?: number;
  buildingRequired?: string | null;
  populationRequired?: number;
  // Item properties (durability, effects, etc.)
  durability?: number;
  maxDurability?: number;
  effects?: Record<string, number>;
  
  // Requirements
  researchRequired?: string | null;
  level?: number;
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  
  // Item-specific properties
  weaponProperties?: {
    damage: number;
    attackSpeed: number;
    range: number;
  };
  
  armorProperties?: {
    defense: number;
    armorType: 'light' | 'medium' | 'heavy';
    slot: 'head' | 'chest' | 'legs' | 'feet' | 'hands';
  };
  
  consumableProperties?: {
    uses: number;
    consumeTime: number;
  };
}

// Added: Missing CraftingInProgress interface
export interface CraftingInProgress {
  item: Item; // The item being crafted
  quantity: number; // How many are being crafted
  turnsRemaining: number;
  startedAt: number;
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
  traits: any[];
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
  researchRequired: string | null; // Fixed: removed optional
}

export interface ResearchProject {
  id: string;
  name: string;
  description: string;
  category: 'crafting' | 'building' | 'military' | 'exploration' | 'social';
  tier: number;
  currentProgress?: number;
  
  // Unlock Requirements
  knowledgeCost: number;
  prerequisites: string[];
  
  // Resource gating
  resourceRequirement?: Record<string, number>;
  
  // Existing gates
  statRequirements?: {
    minStats?: Partial<RaceStats>;
    maxStats?: Partial<RaceStats>;
  };
  populationRequired?: number;
  buildingRequired?: string;
  toolRequired?: string;
  
  // Lore bypass
  loreItemRequired?: string;
  canBypassWithLore: boolean;
  
  // Unlocks and timing
  unlocks: {
    toolLevel?: number;
    buildingLevel?: number;
    armyLevel?: number;
    weaponLevel?: number;
    buildings?: string[];
    ability?: string[]; // Fixed: was ability
    effects?: Record<string, number>;
  };
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

export interface Location {
  id: string;
  name: string;
  type: 'forest' | 'ruins' | 'mine' | 'settlement';
  x: number;
  y: number;
  discovered: boolean;
  item?: Item[];
}

export interface WorldTile {
  x: number;
  y: number;
  type: 'land' | 'water' | 'mountain' | 'forest';
  discovered: boolean;
  ascii: string;
}
