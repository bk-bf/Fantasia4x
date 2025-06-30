import type { Item, CraftingRecipe } from './types';

export const ITEMS_DATABASE: Item[] = [
  // TOOLS (existing + expanded)
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
    color: '#8BC34A'
  },
  
  // WEAPONS
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
    }
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
    }
  },
  
  // ARMOR
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
    }
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
    }
  },
  
  // CONSUMABLES
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
    }
  },
  
  // MATERIALS
  {
    id: 'iron_ingot',
    name: 'Iron Ingot',
    description: 'Refined iron ready for crafting',
    type: 'material',
    category: 'metal',
    level: 1,
    rarity: 'common',
    effects: {},
    researchRequired: 'basic_metallurgy',
    emoji: '🔩',
    color: '#607D8B'
  }
];

// Helper functions following the search results pattern
export function getItemsByType(itemType: string): Item[] {
  return ITEMS_DATABASE.filter(item => item.type === itemType);
}

export function getItemsByCategory(category: string): Item[] {
  return ITEMS_DATABASE.filter(item => item.category === category);
}

export function getAvailableRecipes(
  completedResearch: string[],
  availableBuildings: string[],
  currentToolLevel: number
): CraftingRecipe[] {
  return CRAFTING_RECIPES.filter(recipe => {
    // Check tool level requirement
    if (recipe.toolLevelRequired > currentToolLevel) return false;
    
    // Check building requirement
    if (recipe.buildingRequired && !availableBuildings.includes(recipe.buildingRequired)) return false;
    
    // Check research requirement
    if (recipe.researchRequired && !completedResearch.includes(recipe.researchRequired)) return false;
    
    return true;
  });
}

export function canCraftRecipe(
  recipe: CraftingRecipe,
  currentResources: Record<string, number>
): boolean {
  return Object.entries(recipe.inputs).every(([resourceId, amount]) => 
    (currentResources[resourceId] || 0) >= amount
  );
}

export function getAvailableItems(
  completedResearch: string[],
  availableBuildings: string[],
  itemType?: string
): Item[] {
  let items = ITEMS_DATABASE;
  
  // Filter by type if specified
  if (itemType) {
    items = items.filter(item => item.type === itemType);
  }
  
  return items.filter(item => {
    // Always show items with no research requirement
    if (!item.researchRequired) return true;
    
    // Only show if research is completed
    return completedResearch.includes(item.researchRequired);
  });
}

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

// Updated crafting recipes to use unified items
export const CRAFTING_RECIPES: CraftingRecipe[] = [
  {
    id: 'craft_stone_spear',
    name: 'Craft Stone Spear',
    description: 'Create a basic weapon for hunting',
    inputs: { wood: 8, stone: 4 },
    outputs: { stone_spear: 1 },
    craftingTime: 3,
    toolLevelRequired: 0,
    researchRequired: null
  },
  
  {
    id: 'craft_iron_sword',
    name: 'Craft Iron Sword',
    description: 'Forge a reliable combat weapon',
    inputs: { wood: 5, iron_ingot: 3 },
    outputs: { iron_sword: 1 },
    craftingTime: 6,
    toolLevelRequired: 1,
    buildingRequired: 'iron_forge',
    researchRequired: 'basic_metallurgy'
  },
  
  {
    id: 'craft_leather_cap',
    name: 'Craft Leather Cap',
    description: 'Create basic head protection',
    inputs: { leather: 3, thread: 1 },
    outputs: { leather_cap: 1 },
    craftingTime: 2,
    toolLevelRequired: 0,
    researchRequired: null
  }
];
