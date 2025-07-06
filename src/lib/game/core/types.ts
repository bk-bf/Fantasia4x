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

export interface Building {
  id: string;
  name: string;
  description: string;
  
  // Visual representation
  emoji?: string;
  color?: string;
  
  // Construction requirements
  buildingCost: Record<string, number>; // Renamed from 'cost' to match item system
  buildTime: number;
  toolTierRequired: number; // Matches item system progression
  populationRequired: number;
  
  // Prerequisites
  researchRequired: string | null;
  tier: number; // Technology level (0-2) matching item progression
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  
  // Building categories - expanded for comprehensive system
  category: 'housing' | 'production' | 'knowledge' | 'military' | 'food' | 'commerce' | 'magical' | 'exploration' | 'social';
  
  // Operational costs and maintenance
  upkeepCost: Record<string, number>; // Daily/periodic resource consumption
  
  // Building effects and bonuses
  effects: Record<string, number>; // General effects (populationCapacity, weatherProtection, etc.)
  productionBonus: Record<string, number>; // Specific item production bonuses
  
  // Storage capabilities
  storageCapacity: Record<string, number>; // Storage for different item categories
  
  // Building-specific properties
  buildingProperties?: {
    // Housing properties
    populationCapacity?: number;
    weatherProtection?: number;
    morale?: number;
    defenseBonus?: number;
    
    // Production properties
    craftingSpeed?: number;
    qualityBonus?: number;
    efficiency?: number;
    specialization?: string[]; // What this building specializes in
    
    // Knowledge properties
    knowledgeGeneration?: number;
    researchSpeed?: number;
    scholarCapacity?: number;
    
    // Military properties
    defensiveStrength?: number;
    troopCapacity?: number;
    militaryTraining?: number;
    
    // Food properties
    foodProduction?: number;
    preservationBonus?: number;
    nutritionBonus?: number;
    
    // Commerce properties
    tradeBonus?: number;
    wealthGeneration?: number;
    marketCapacity?: number;
    
    // Magical properties
    magicalPower?: number;
    spellcasting?: number;
    enchantmentBonus?: number;
    
    // Environmental effects
    temperatureControl?: number;
    weatherResistance?: number;
    naturalHarmony?: number;
    
    // Special abilities
    uniqueAbilities?: string[];
    passiveEffects?: Record<string, number>;
    activeAbilities?: Record<string, any>;
  };
  
  // Upgrade system
  upgradeOptions?: {
    upgradeTo?: string; // ID of upgraded building
    upgradeCost?: Record<string, number>;
    upgradeTime?: number;
    upgradeRequirements?: {
      research?: string;
      population?: number;
      toolLevel?: number;
    };
  };
  
  // Building interactions
  synergies?: {
    adjacencyBonus?: Record<string, number>; // Bonuses when built near specific buildings
    networkEffects?: Record<string, number>; // Bonuses based on number of similar buildings
    chainBonus?: string[]; // Buildings that enhance this one's effects
  };
  
  // Conditional requirements and effects
  conditionalEffects?: {
    condition: string; // e.g., "population > 50", "has_building:marketplace"
    effects: Record<string, number>;
  }[];
  
  // Building state management
  buildingState?: {
    isUnique?: boolean; // Can only build one
    maxCount?: number; // Maximum number allowed
    requiresLocation?: string; // Specific terrain/location requirements
    environmentalNeeds?: string[]; // Environmental requirements
  };
  
  // Integration with item system
  itemInteractions?: {
    consumes?: Record<string, number>; // Items consumed during operation
    produces?: Record<string, number>; // Items produced over time
    transforms?: Record<string, string>; // Item transformation recipes
    requires?: string[]; // Specific items needed for operation
  };
  
  // Event system integration
  eventTriggers?: {
    onConstruction?: string[]; // Events triggered when built
    onOperation?: string[]; // Events triggered during operation
    onUpgrade?: string[]; // Events triggered when upgraded
    onDestruction?: string[]; // Events triggered when destroyed
  };
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
  toolTierRequired?: number;
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
    armorType: 'light' | 'medium' | 'heavy' | 'shield';
    slot: 'head' | 'chest' | 'legs' | 'feet' | 'hands' | 'offhand';
    movementPenalty: number; // 0.0 to 1.0, where 0.3 = 30% movement penalty
    
    // Resistance properties
    slashResistance?: number;
    crushResistance?: number;
    pierceResistance?: number;
    
    // Combat bonuses
    parryChance?: number;
    bashDamage?: number;
    kickDamage?: number;
    
    // Special properties
    flexibility?: number;
    visionProtection?: number;
    fullBodyProtection?: number;
    
    // Environmental bonuses
    coldResistance?: number;
    stealthBonus?: number;
    terrainBonus?: number;
    
    // Social effects
    prestigeBonus?: number;
    intimidation?: number;
    
    // Movement effects
    mobility?: number;
    chargeBonus?: number;
  };
  
  consumableProperties?: {
    uses: number;
    consumeTime: number;
  };
}
export interface BuildingInProgress {
  building: Building;
  turnsRemaining: number;
  startedAt: number;
}
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
    minStats?: Partial<RaceStats>;
    maxStats?: Partial<RaceStats>;
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
