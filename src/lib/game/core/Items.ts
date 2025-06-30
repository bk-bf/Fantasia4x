import type { Item } from './types';

export const ITEMS_DATABASE: Item[] = [
  // BASIC MATERIALS (formerly BASIC_RESOURCES)
  {
    id: 'food',
    name: 'Food',
    description: 'Essential sustenance for population growth',
    type: 'material',
    category: 'basic',
    level: 0,
    rarity: 'common',
    effects: {},
    researchRequired: null,
    emoji: '🌾',
    color: '#FFA726',
    amount: 0
  },
  {
    id: 'wood',
    name: 'Wood',
    description: 'Basic building material from trees',
    type: 'material',
    category: 'basic',
    level: 0,
    rarity: 'common',
    effects: {},
    researchRequired: null,
    emoji: '🪵',
    color: '#8BC34A',
    amount: 0
  },
  {
    id: 'stone',
    name: 'Stone',
    description: 'Sturdy material for construction',
    type: 'material',
    category: 'basic',
    level: 0,
    rarity: 'common',
    effects: {},
    researchRequired: null,
    emoji: '🪨',
    color: '#9E9E9E',
    amount: 0
  },
  {
    id: 'iron',
    name: 'Iron',
    description: 'Raw iron ore for metalworking',
    type: 'material',
    category: 'basic',
    level: 0,
    rarity: 'common',
    effects: {},
    researchRequired: null,
    emoji: '⛓️',
    color: '#4CAF50',
    amount: 0
  },
  {
    id: 'herbs',
    name: 'Herbs',
    description: 'Medicinal plants for healing and research',
    type: 'material',
    category: 'basic',
    level: 0,
    rarity: 'common',
    effects: {},
    researchRequired: null,
    emoji: '🌿',
    color: '#4CAF50',
    amount: 0
  },

  // TOOLS (with embedded crafting requirements)
  {
    id: 'stone_axe',
    name: 'Stone Axe',
    description: 'Basic tool for chopping wood',
    type: 'tool',
    category: 'harvesting',
    level: 0,
    rarity: 'common',
    durability: 100,
    maxDurability: 100,
    effects: { woodProduction: 0.2 },
    researchRequired: null,
    emoji: '🪓',
    color: '#8BC34A',
    amount: 0,
    // Embedded crafting requirements
    craftingCost: { wood: 5, stone: 3 },
    craftingTime: 2,
    toolLevelRequired: 0,
    buildingRequired: null,
    populationRequired: 0
  },
  
  {
    id: 'iron_axe',
    name: 'Iron Axe',
    description: 'Improved axe for efficient wood harvesting',
    type: 'tool',
    category: 'harvesting',
    level: 1,
    rarity: 'uncommon',
    durability: 200,
    maxDurability: 200,
    effects: { woodProduction: 0.5 },
    researchRequired: 'basic_metallurgy',
    emoji: '🪓',
    color: '#4CAF50',
    amount: 0,
    // Embedded crafting requirements
    craftingCost: { wood: 8, iron: 5 },
    craftingTime: 4,
    toolLevelRequired: 1,
    buildingRequired: 'iron_forge',
    populationRequired: 1
  },
  
  // WEAPONS (with embedded crafting requirements)
  {
    id: 'stone_spear',
    name: 'Stone Spear',
    description: 'Basic weapon for hunting and defense',
    type: 'weapon',
    category: 'melee',
    level: 0,
    rarity: 'common',
    durability: 80,
    maxDurability: 80,
    effects: { combatPower: 5 },
    researchRequired: null,
    emoji: '🔱',
    color: '#9E9E9E',
    weaponProperties: {
      damage: 8,
      attackSpeed: 1.2,
      range: 2
    },
    amount: 0,
    // Embedded crafting requirements
    craftingCost: { wood: 8, stone: 4 },
    craftingTime: 3,
    toolLevelRequired: 0,
    buildingRequired: null,
    populationRequired: 0
  },
  
  {
    id: 'iron_sword',
    name: 'Iron Sword',
    description: 'Well-balanced weapon for combat',
    type: 'weapon',
    category: 'melee',
    level: 1,
    rarity: 'uncommon',
    durability: 150,
    maxDurability: 150,
    effects: { combatPower: 12 },
    researchRequired: 'basic_metallurgy',
    emoji: '⚔️',
    color: '#4CAF50',
    weaponProperties: {
      damage: 15,
      attackSpeed: 1.0,
      range: 1
    },
    amount: 0,
    // Embedded crafting requirements
    craftingCost: { wood: 5, iron_ingot: 3 },
    craftingTime: 6,
    toolLevelRequired: 1,
    buildingRequired: 'iron_forge',
    populationRequired: 2
  },
  
  // ARMOR (with embedded crafting requirements)
  {
    id: 'leather_cap',
    name: 'Leather Cap',
    description: 'Basic head protection',
    type: 'armor',
    category: 'light',
    level: 0,
    rarity: 'common',
    durability: 60,
    maxDurability: 60,
    effects: { defense: 2 },
    researchRequired: null,
    emoji: '🧢',
    color: '#8D6E63',
    armorProperties: {
      defense: 3,
      armorType: 'light',
      slot: 'head'
    },
    amount: 0,
    // Embedded crafting requirements
    craftingCost: { leather: 3, thread: 1 },
    craftingTime: 2,
    toolLevelRequired: 0,
    buildingRequired: null,
    populationRequired: 0
  },
  
  {
    id: 'iron_helmet',
    name: 'Iron Helmet',
    description: 'Strong metal helmet for protection',
    type: 'armor',
    category: 'heavy',
    level: 1,
    rarity: 'uncommon',
    durability: 120,
    maxDurability: 120,
    effects: { defense: 5 },
    researchRequired: 'basic_metallurgy',
    emoji: '⛑️',
    color: '#4CAF50',
    armorProperties: {
      defense: 8,
      armorType: 'heavy',
      slot: 'head'
    },
    amount: 0,
    // Embedded crafting requirements
    craftingCost: { iron_ingot: 4, leather: 2 },
    craftingTime: 5,
    toolLevelRequired: 1,
    buildingRequired: 'iron_forge',
    populationRequired: 2
  },
  
  // CONSUMABLES (with embedded crafting requirements)
  {
    id: 'healing_herb',
    name: 'Healing Herb',
    description: 'Restores health when consumed',
    type: 'consumable',
    category: 'healing',
    level: 0,
    rarity: 'common',
    effects: { healthRestore: 25 },
    researchRequired: null,
    emoji: '🌿',
    color: '#4CAF50',
    consumableProperties: {
      uses: 1,
      consumeTime: 1
    },
    amount: 0,
    // Embedded crafting requirements (gathered, not crafted)
    craftingCost: {},
    craftingTime: 0,
    toolLevelRequired: 0,
    buildingRequired: null,
    populationRequired: 0
  },
  
  // PROCESSED MATERIALS (with embedded crafting requirements)
  {
    id: 'iron_ingot',
    name: 'Iron Ingot',
    description: 'Refined iron ready for crafting',
    type: 'material',
    category: 'processed',
    level: 1,
    rarity: 'common',
    effects: {},
    researchRequired: 'basic_metallurgy',
    emoji: '🔩',
    color: '#607D8B',
    amount: 0,
    // Embedded crafting requirements
    craftingCost: { iron: 2 },
    craftingTime: 2,
    toolLevelRequired: 1,
    buildingRequired: 'iron_forge',
    populationRequired: 1
  }
];

// Helper functions following building system pattern
export function getItemsByType(itemType: string): Item[] {
  return ITEMS_DATABASE.filter(item => item.type === itemType);
}

export function getItemsByCategory(category: string): Item[] {
  return ITEMS_DATABASE.filter(item => item.category === category);
}

// Get basic materials (formerly BASIC_RESOURCES)
export function getBasicMaterials(): Item[] {
  return ITEMS_DATABASE.filter(item => 
    item.type === 'material' && item.category === 'basic'
  );
}

// Get craftable items (items with crafting requirements)
export function getCraftableItems(
  completedResearch: string[],
  availableBuildings: string[],
  currentToolLevel: number,
  currentPopulation: number,
  itemType?: string
): Item[] {
  let items = ITEMS_DATABASE.filter(item => 
    item.craftingCost && Object.keys(item.craftingCost).length > 0
  );
  
  // Filter by type if specified
  if (itemType) {
    items = items.filter(item => item.type === itemType);
  }
  
  return items.filter(item => {
    // Research requirements
    if (item.researchRequired && !completedResearch.includes(item.researchRequired)) return false;
    
    // Tool level requirements
    if (item.toolLevelRequired && item.toolLevelRequired > currentToolLevel) return false;
    
    // Building requirements
    if (item.buildingRequired && !availableBuildings.includes(item.buildingRequired)) return false;
    
    // Population requirements
    if (item.populationRequired && item.populationRequired > currentPopulation) return false;
    
    return true;
  });
}

// Check if item can be crafted (similar to canAffordBuilding)
export function canCraftItem(item: Item, currentInventory: Record<string, number>): boolean {
  if (!item.craftingCost) return false;
  
  return Object.entries(item.craftingCost).every(([itemId, amount]) => 
    (currentInventory[itemId] || 0) >= amount
  );
}

// Check if item can be crafted with current game state (similar to canBuildWithPopulation)
export function canCraftWithRequirements(
  item: Item, 
  currentToolLevel: number,
  availableBuildings: string[],
  currentPopulation: number,
  completedResearch: string[]
): boolean {
  // Research requirements
  if (item.researchRequired && !completedResearch.includes(item.researchRequired)) return false;
  
  // Tool level requirements
  if (item.toolLevelRequired && item.toolLevelRequired > currentToolLevel) return false;
  
  // Building requirements
  if (item.buildingRequired && !availableBuildings.includes(item.buildingRequired)) return false;
  
  // Population requirements
  if (item.populationRequired && item.populationRequired > currentPopulation) return false;
  
  return true;
}

// Unified icon/color functions
export function getItemIcon(itemId: string): string {
  const item = ITEMS_DATABASE.find(i => i.id === itemId);
  return item?.emoji || '📦';
}

export function getItemColor(itemId: string): string {
  const item = ITEMS_DATABASE.find(i => i.id === itemId);
  return item?.color || '#4CAF50';
}

export function getItemRarityColor(rarity: string): string {
  switch (rarity) {
    case 'common': return '#9E9E9E';
    case 'uncommon': return '#4CAF50';
    case 'rare': return '#2196F3';
    case 'epic': return '#9C27B0';
    case 'legendary': return '#FF9800';
    default: return '#9E9E9E';
  }
}

// Magical resource creation (now creates magical materials)
export function createMagicalMaterial(): Item {
  const magicalTypes = ['Crystal', 'Essence', 'Rune', 'Shard'];
  const properties = ['Fire', 'Ice', 'Lightning', 'Shadow', 'Light'];
  
  const type = magicalTypes[Math.floor(Math.random() * magicalTypes.length)];
  const property = properties[Math.floor(Math.random() * properties.length)];
  
  return {
    id: `${property.toLowerCase()}_${type.toLowerCase()}`,
    name: `${property} ${type}`,
    description: `Magical ${type.toLowerCase()} infused with ${property.toLowerCase()} energy`,
    type: 'material',
    category: 'magical',
    level: 2,
    rarity: 'rare',
    effects: { magicalPower: Math.floor(Math.random() * 10) + 1 },
    researchRequired: null,
    emoji: '🔮',
    color: '#9C27B0',
    amount: 0,
    craftingCost: {},
    craftingTime: 0,
    toolLevelRequired: 0,
    buildingRequired: null,
    populationRequired: 0
  };
}
