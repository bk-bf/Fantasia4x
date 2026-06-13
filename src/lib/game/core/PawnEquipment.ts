import type {
  GameState,
  Pawn,
  ItemInstance,
  EquipmentSlot,
  Item,
  PawnEquipment,
  PawnInventory,
  EntityStats
} from './types';
import { itemService } from '../services/ItemService';

/** Default carry budget for a pawn with no stats/equipment. */
const DEFAULT_MAX_WEIGHT_KG = 20;
const DEFAULT_MAX_VOLUME_L = 20;

export function createPawnInventory(): PawnInventory {
  return {
    items: {},
    instances: [],
    weightKg: 0,
    maxWeightKg: DEFAULT_MAX_WEIGHT_KG,
    volumeL: 0,
    maxVolumeL: DEFAULT_MAX_VOLUME_L
  };
}

export function createPawnEquipment(): PawnEquipment {
  return {};
}

// Add this function to sync global items with pawn inventory
export function syncPawnInventoryWithGlobal(pawn: Pawn, globalItems: Item[]): Pawn {
  const updatedPawn = { ...pawn };
  const sharedItems: Record<string, number> = {};

  // Get list of items currently equipped by this pawn (by itemId in instances)
  const equippedItemIds = new Set(
    Object.values(pawn.equipment)
      .filter((inst): inst is ItemInstance => inst !== undefined)
      .map((inst) => inst.itemId)
  );

  // Copy all global items to pawn inventory, excluding materials and equipped items
  globalItems.forEach((globalItem) => {
    if (
      globalItem.amount > 0 &&
      globalItem.type !== 'material' &&
      !equippedItemIds.has(globalItem.id)
    ) {
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
  const equippedItems = getAllEquippedItemIds(gameState.pawns);

  // ADR-016: the equippable "global pool" is the colony's physical stockpile (no legacy
  // gs.item array). Build Item-shaped entries from stockpile quantities, minus what is
  // currently equipped. (Behaviour-preserving swap of the source; the equip UI's pool was
  // already the shared colony storage.)
  const filteredGlobalItems: Item[] = [];
  for (const [id, amount] of Object.entries(gameState.stockpile ?? {})) {
    const def = itemService.getItemById(id);
    if (!def || amount <= 0) continue;
    let avail = amount;
    if (equippedItems.has(id)) {
      let equippedCount = 0;
      gameState.pawns.forEach((pawn) => {
        Object.values(pawn.equipment).forEach((inst) => {
          if (inst && inst.itemId === id) equippedCount++;
        });
      });
      avail = Math.max(0, amount - equippedCount);
    }
    filteredGlobalItems.push({ ...def, amount: avail });
  }

  // Sync all pawns with filtered items
  const updatedPawns = gameState.pawns.map((pawn) =>
    syncPawnInventoryWithGlobal(pawn, filteredGlobalItems)
  );

  return {
    ...gameState,
    pawns: updatedPawns
  };
}

// Helper function to get all equipped item IDs across all pawns
function getAllEquippedItemIds(pawns: Pawn[]): Set<string> {
  const equippedItems = new Set<string>();

  pawns.forEach((pawn) => {
    Object.values(pawn.equipment).forEach((inst) => {
      if (inst) {
        equippedItems.add(inst.itemId);
      }
    });
  });

  return equippedItems;
}

/** Derive which equipment slot an item belongs to based on its type/properties. */
export function getEquipmentSlot(item: Item): EquipmentSlot | null {
  if (item.armorProperties?.equipmentSlot) return item.armorProperties.equipmentSlot;
  switch (item.type) {
    case 'weapon':
      return 'mainHand';
    case 'armor': {
      const slot = item.armorProperties?.slot;
      switch (slot) {
        case 'head':
          return 'headBase';
        case 'chest':
          return 'bodyBase';
        case 'legs':
          return 'bodyMid';
        case 'feet':
          return 'boots';
        case 'hands':
          return 'gloves';
        case 'offhand':
          return 'offHand';
        default:
          return 'bodyBase';
      }
    }
    case 'tool':
      return 'belt';
    default:
      return null;
  }
}

export function canEquipItem(pawn: Pawn, itemId: string): boolean {
  const item = itemService.getItemById(itemId);
  if (!item) return false;

  // Check if item type can be equipped
  const equipSlot = getEquipmentSlot(item);
  if (!equipSlot) return false;

  // Check if global storage has this item (since inventory is shared)
  return (pawn.inventory.items[itemId] || 0) > 0;
}

export function equipItem(pawn: Pawn, itemId: string): Pawn {
  const item = itemService.getItemById(itemId);
  if (!item || !canEquipItem(pawn, itemId)) return pawn;

  const slot = getEquipmentSlot(item);
  if (!slot) return pawn;

  let updatedPawn = { ...pawn };

  // Unequip current item in slot if exists
  if (updatedPawn.equipment[slot]) {
    updatedPawn = unequipItem(updatedPawn, slot);
  }

  // Create ItemInstance for the equipped item
  const instance: ItemInstance = {
    instanceId: `${itemId}-${pawn.id}-${Date.now()}`,
    itemId,
    durability: item.maxDurability ?? 100
  };

  // Equip the item
  updatedPawn.equipment = {
    ...updatedPawn.equipment,
    [slot]: instance
  };

  return updatedPawn;
}

export function unequipItem(pawn: Pawn, slot: EquipmentSlot): Pawn {
  if (!pawn.equipment[slot]) return pawn;

  const updatedPawn = { ...pawn };

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
        case 'perceptionBonus':
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
          bonuses.perceptionBonus = Math.floor(value / 3);
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
    void removed;
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
  const item = itemService.getItemById(itemId);
  if (!item || item.type !== 'consumable') return pawn;
  if ((pawn.inventory.items[itemId] || 0) < 1) return pawn;

  let updatedPawn = { ...pawn };

  // Apply consumable effects (don't remove from inventory here -
  // let the game state handle global inventory reduction)
  Object.entries(item.effects || {}).forEach(([effect, value]) => {
    if (typeof value === 'number') {
      switch (effect) {
        case 'healthRestore':
          updatedPawn.state.health = Math.min(100, (updatedPawn.state.health ?? 100) + value);
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

  Object.values(pawn.equipment).forEach((inst) => {
    if (!inst) return;
    const item = itemService.getItemById(inst.itemId);
    if (!item) return;
    const bonuses = calculateItemBonuses(item);
    Object.entries(bonuses).forEach(([bonus, value]) => {
      totalBonuses[bonus] = (totalBonuses[bonus] || 0) + (value as number);
    });
  });

  return totalBonuses;
}

// Get effective stats including equipment bonuses
export function getEffectiveStats(pawn: Pawn): EntityStats {
  const baseStats = { ...pawn.stats };
  const equipmentBonuses = getEquipmentBonuses(pawn);

  return {
    strength: baseStats.strength + (equipmentBonuses.strengthBonus || 0),
    dexterity: baseStats.dexterity + (equipmentBonuses.dexterityBonus || 0),
    intelligence: baseStats.intelligence + (equipmentBonuses.intelligenceBonus || 0),
    perception: baseStats.perception + (equipmentBonuses.perceptionBonus || 0),
    charisma: baseStats.charisma + (equipmentBonuses.charismaBonus || 0),
    constitution: baseStats.constitution + (equipmentBonuses.constitutionBonus || 0)
  };
}

// Damage equipment over time (by slot)
export function damageEquipment(pawn: Pawn, slot: EquipmentSlot, damage: number = 1): Pawn {
  const inst = pawn.equipment[slot];
  if (!inst) return pawn;

  const def = itemService.getItemById(inst.itemId);
  const newDurability = Math.max(0, inst.durability - damage);

  if (newDurability <= 0) {
    // Item breaks — unequip it
    return {
      ...pawn,
      equipment: {
        ...pawn.equipment,
        [slot]: undefined
      }
    };
  }

  return {
    ...pawn,
    equipment: {
      ...pawn.equipment,
      [slot]: { ...inst, durability: newDurability }
    }
  };

  void def; // suppress unused warning — kept for future break notifications
}
