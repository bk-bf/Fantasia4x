import type { GameState, Pawn, EquippedItem, EquipmentSlot, Item, PawnEquipment, PawnInventory, RaceStats } from './types';
import { getItemInfo } from './Items';

export function createPawnInventory(baseSlots: number = 10): PawnInventory {
  return {
    items: {},
    maxSlots: baseSlots,
    currentSlots: 0
  };
}

export function createPawnEquipment(): PawnEquipment {
  return {
    weapon: undefined,
    armor: undefined,
    tool: undefined,
    accessory: undefined
  };
}
// Add this function to sync global items with pawn inventory
export function syncPawnInventoryWithGlobal(pawn: Pawn, globalItems: Item[]): Pawn {
  const updatedPawn = { ...pawn };
  const sharedItems: Record<string, number> = {};
  
  // Get list of items currently equipped by this pawn
  const equippedItemIds = Object.values(pawn.equipment)
    .filter(equipped => equipped !== undefined)
    .map(equipped => equipped!.itemId);
  
  // Copy all global items to pawn inventory, excluding materials and equipped items
  globalItems.forEach(globalItem => {
    if (globalItem.amount > 0 && 
        globalItem.type !== 'material' && 
        !equippedItemIds.includes(globalItem.id)) {
      sharedItems[globalItem.id] = Math.floor(globalItem.amount);
    }
  });
  
  updatedPawn.inventory = {
    ...updatedPawn.inventory,
    items: sharedItems
  };
  
  return updatedPawn;
}
// Add immediate sync function
export function syncAllPawnInventories(gameState: GameState): GameState {
  const equippedItems = getAllEquippedItems(gameState.pawns);
  
  // Create filtered global items (remove equipped items and reduce quantity)
  const filteredGlobalItems = gameState.item.map(globalItem => {
    if (equippedItems.has(globalItem.id)) {
      // Count how many times this item is equipped
      let equippedCount = 0;
      gameState.pawns.forEach(pawn => {
        Object.values(pawn.equipment).forEach(equipped => {
          if (equipped && equipped.itemId === globalItem.id) {
            equippedCount++;
          }
        });
      });
      
      // Return item with reduced amount
      return {
        ...globalItem,
        amount: Math.max(0, globalItem.amount - equippedCount)
      };
    }
    return globalItem;
  });
  
  // Sync all pawns with filtered items
  const updatedPawns = gameState.pawns.map(pawn => 
    syncPawnInventoryWithGlobal(pawn, filteredGlobalItems)
  );
  
  return {
    ...gameState,
    pawns: updatedPawns
  };
}

// Helper function to get all equipped items
function getAllEquippedItems(pawns: Pawn[]): Set<string> {
  const equippedItems = new Set<string>();
  
  pawns.forEach(pawn => {
    Object.values(pawn.equipment).forEach(equipped => {
      if (equipped) {
        equippedItems.add(equipped.itemId);
      }
    });
  });
  
  return equippedItems;
}
// Update canEquipItem to work with shared inventory
export function canEquipItem(pawn: Pawn, itemId: string): boolean {
  const item = getItemInfo(itemId);
  if (!item) return false;

  // Check if item type can be equipped
  const equipSlot = getEquipmentSlot(item);
  if (!equipSlot) return false;

  // Check if global storage has this item (since inventory is shared)
  return (pawn.inventory.items[itemId] || 0) > 0;
}
export function getEquipmentSlot(item: Item): EquipmentSlot | null {
  switch (item.type) {
    case 'weapon': return 'weapon';
    case 'armor': return 'armor';
    case 'tool': return 'tool';
    default: return null;
  }
}

export function equipItem(pawn: Pawn, itemId: string): Pawn {
  const item = getItemInfo(itemId);
  if (!item || !canEquipItem(pawn, itemId)) return pawn;

  const slot = getEquipmentSlot(item);
  if (!slot) return pawn;

  let updatedPawn = { ...pawn };

  // Unequip current item in slot if exists
  if (updatedPawn.equipment[slot]) {
    updatedPawn = unequipItem(updatedPawn, slot);
  }

  // DON'T remove from inventory - just equip it
  // (The syncPawnInventoryWithGlobal will handle hiding it from available items)
  
  // Equip the item
  updatedPawn.equipment = {
    ...updatedPawn.equipment,
    [slot]: {
      itemId,
      durability: item.durability || item.maxDurability || 100,
      maxDurability: item.maxDurability || 100,
      bonuses: calculateItemBonuses(item)
    }
  };

  return updatedPawn;
}

// Update unequipItem to NOT add back to inventory
export function unequipItem(pawn: Pawn, slot: EquipmentSlot): Pawn {
  const equippedItem = pawn.equipment[slot];
  if (!equippedItem) return pawn;

  const updatedPawn = { ...pawn };

  // DON'T add back to inventory - just unequip it
  // (The syncPawnInventoryWithGlobal will handle showing it again in available items)

  // Remove from equipment
  updatedPawn.equipment = {
    ...updatedPawn.equipment,
    [slot]: undefined
  };

  return updatedPawn;
}

export function calculateItemBonuses(item: Item): Record<string, number> {
  const bonuses: Record<string, number> = {};

  // Convert all item effects to pawn bonuses
  Object.entries(item.effects || {}).forEach(([effect, value]) => {
    if (typeof value === 'number') {
      switch (effect) {
        // Combat effects
        case 'combatPower':
          bonuses.strengthBonus = Math.floor(value / 2);
          bonuses.combatBonus = value;
          break;
        case 'huntingBonus':
          bonuses.huntingEfficiency = value;
          break;
        case 'armorPiercing':
          bonuses.armorPiercing = value;
          break;
          
        // Crafting effects
        case 'craftingSpeed':
          bonuses.craftingBonus = value;
          break;
        case 'workability':
          bonuses.toolEfficiency = value;
          break;
          
        // Defense effects
        case 'defense':
          bonuses.constitutionBonus = Math.floor(value / 3);
          bonuses.defenseRating = value;
          break;
          
        // Movement effects
        case 'movementSpeed':
          bonuses.dexterityBonus = Math.floor(value * 2);
          break;
          
        // Direct stat bonuses
        case 'strengthBonus':
        case 'dexterityBonus':
        case 'intelligenceBonus':
        case 'wisdomBonus':
        case 'charismaBonus':
        case 'constitutionBonus':
          bonuses[effect] = value;
          break;
          
        // Resistance effects
        case 'fireResistance':
        case 'coldResistance':
        case 'crushResistance':
          bonuses[effect] = value;
          break;
          
        // Special effects
        case 'magicalPower':
          bonuses.intelligenceBonus = Math.floor(value / 2);
          bonuses.wisdomBonus = Math.floor(value / 3);
          break;
          
        default:
          // Pass through any other numeric effects
          bonuses[effect] = value;
      }
    }
  });


  // Weapon-specific bonuses
  if (item.type === 'weapon' && item.weaponProperties) {
    bonuses.attackDamage = item.weaponProperties.damage;
    bonuses.attackSpeed = item.weaponProperties.attackSpeed;
    bonuses.attackRange = item.weaponProperties.range;
  }

  // Armor-specific bonuses
  if (item.type === 'armor' && item.armorProperties) {
    bonuses.defenseRating = item.armorProperties.defense;
    bonuses.movementPenalty = item.armorProperties.movementPenalty || 0;
  }

  return bonuses;
}

export function addItemToInventory(pawn: Pawn, itemId: string, quantity: number = 1): Pawn {
  const updatedPawn = { ...pawn };
  
  updatedPawn.inventory = {
    ...updatedPawn.inventory,
    items: {
      ...updatedPawn.inventory.items,
      [itemId]: (updatedPawn.inventory.items[itemId] || 0) + quantity
    }
  };

  return updatedPawn;
}

export function removeItemFromInventory(pawn: Pawn, itemId: string, quantity: number = 1): Pawn {
  const currentAmount = pawn.inventory.items[itemId] || 0;
  if (currentAmount < quantity) return pawn;

  const updatedPawn = { ...pawn };
  const newAmount = currentAmount - quantity;

  if (newAmount <= 0) {
    const { [itemId]: removed, ...restItems } = updatedPawn.inventory.items;
    updatedPawn.inventory = {
      ...updatedPawn.inventory,
      items: restItems
    };
  } else {
    updatedPawn.inventory = {
      ...updatedPawn.inventory,
      items: {
        ...updatedPawn.inventory.items,
        [itemId]: newAmount
      }
    };
  }

  return updatedPawn;
}

// Update useConsumable to consume from global storage
export function useConsumable(pawn: Pawn, itemId: string): Pawn {
  const item = getItemInfo(itemId);
  if (!item || item.type !== 'consumable') return pawn;
  if ((pawn.inventory.items[itemId] || 0) < 1) return pawn;

  let updatedPawn = { ...pawn };

  // Apply consumable effects (don't remove from inventory here - 
  // let the game state handle global inventory reduction)
  Object.entries(item.effects || {}).forEach(([effect, value]) => {
    if (typeof value === 'number') {
      switch (effect) {
        case 'healthRestore':
          updatedPawn.state.health = Math.min(100, updatedPawn.state.health + value);
          break;
        case 'energyBoost':
          updatedPawn.needs.fatigue = Math.max(0, updatedPawn.needs.fatigue - value * 10);
          break;
        case 'morale':
          updatedPawn.state.mood = Math.min(100, updatedPawn.state.mood + value * 20);
          break;
      }
    }
  });

  return updatedPawn;
}

// Calculate total equipment bonuses for a pawn
export function getEquipmentBonuses(pawn: Pawn): Record<string, number> {
  const totalBonuses: Record<string, number> = {};

  Object.values(pawn.equipment).forEach(equippedItem => {
    if (equippedItem?.bonuses) {
      Object.entries(equippedItem.bonuses).forEach(([bonus, value]) => {
        totalBonuses[bonus] = (totalBonuses[bonus] || 0) + (value as number);
      });
    }
  });

  return totalBonuses;
}

// Get effective stats including equipment bonuses
export function getEffectiveStats(pawn: Pawn): RaceStats {
  const baseStats = { ...pawn.stats };
  const equipmentBonuses = getEquipmentBonuses(pawn);

  return {
    strength: baseStats.strength + (equipmentBonuses.strengthBonus || 0),
    dexterity: baseStats.dexterity + (equipmentBonuses.dexterityBonus || 0),
    intelligence: baseStats.intelligence + (equipmentBonuses.intelligenceBonus || 0),
    wisdom: baseStats.wisdom + (equipmentBonuses.wisdomBonus || 0),
    charisma: baseStats.charisma + (equipmentBonuses.charismaBonus || 0),
    constitution: baseStats.constitution + (equipmentBonuses.constitutionBonus || 0)
  };
}

// Get work efficiency with equipment bonuses
export function getWorkEfficiency(pawn: Pawn, workType: string): number {
  const equipmentBonuses = getEquipmentBonuses(pawn);
  let efficiency = 1.0;

  // Apply general bonuses
  if (equipmentBonuses.craftingBonus && ['crafting', 'metalworking', 'leatherworking'].includes(workType)) {
    efficiency *= (1 + equipmentBonuses.craftingBonus);
  }

  if (equipmentBonuses.huntingEfficiency && workType === 'hunting') {
    efficiency *= equipmentBonuses.huntingEfficiency;
  }

  if (equipmentBonuses.toolEfficiency && ['woodcutting', 'mining', 'construction'].includes(workType)) {
    efficiency *= equipmentBonuses.toolEfficiency;
  }

  // Apply racial trait bonuses
  pawn.racialTraits.forEach(trait => {
    if (trait.effects.workEfficiency) {
      const workBonus = trait.effects.workEfficiency[workType] || trait.effects.workEfficiency['all'];
      if (workBonus) {
        efficiency *= workBonus;
      }
    }
  });

  return efficiency;
}

// Damage equipment over time
export function damageEquipment(pawn: Pawn, slot: EquipmentSlot, damage: number = 1): Pawn {
  const equippedItem = pawn.equipment[slot];
  if (!equippedItem) return pawn;

  const updatedPawn = { ...pawn };
  const newDurability = Math.max(0, equippedItem.durability - damage);

  if (newDurability <= 0) {
    // Item breaks - unequip it
    updatedPawn.equipment = {
      ...updatedPawn.equipment,
      [slot]: undefined
    };
  } else {
    updatedPawn.equipment = {
      ...updatedPawn.equipment,
      [slot]: {
        ...equippedItem,
        durability: newDurability
      }
    };
  }

  return updatedPawn;
}

