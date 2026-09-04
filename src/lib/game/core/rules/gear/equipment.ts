import type {
  Pawn,
  ItemInstance,
  EquipmentSlot,
  Item,
  PawnEquipment,
  PawnInventory,
  EntityStats,
  GameState
} from '../../types';
import { itemDefById } from '../../defs/items';
import { emptyOut, isFluidId } from './vessels';
import { withDrops } from '../../state/stockpile';

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

export function equippedItemCounts(pawns: Pawn[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const pawn of pawns) {
    for (const inst of Object.values(pawn.equipment)) {
      if (inst) counts[inst.itemId] = (counts[inst.itemId] ?? 0) + 1;
    }
  }
  return counts;
}

export interface WornThermalSource {
  name: string;
  cold: number;
  heat: number;
}

export function equippedTemperatureSources(pawn: Pawn): WornThermalSource[] {
  const out: WornThermalSource[] = [];
  for (const inst of Object.values(pawn.equipment ?? {})) {
    if (!inst) continue;
    const item = itemDefById(inst.itemId);
    const ap = item?.armorProperties;
    if (!ap) continue;
    const cold = ap.coldResistance ?? 0;
    const heat = ap.heatResistance ?? 0;
    if (cold === 0 && heat === 0) continue;
    out.push({ name: item?.name ?? inst.itemId, cold, heat });
  }
  return out;
}

export function equippedTemperatureResistance(pawn: Pawn): { cold: number; heat: number } {
  let cold = 0;
  let heat = 0;
  for (const g of equippedTemperatureSources(pawn)) {
    cold += g.cold;
    heat += g.heat;
  }
  return { cold, heat };
}

export function getEquipmentSlot(item: Item): EquipmentSlot | null {
  if (item.armorProperties?.equipmentSlot) return item.armorProperties.equipmentSlot;
  switch (item.type) {
    case 'weapon': {
      const wp = item.weaponProperties;
      const thrown = !!wp && (wp.range ?? 0) > 1 && !wp.ammoCategory && !wp.twoHanded;
      return thrown ? 'offHand' : 'mainHand';
    }
    case 'armor':
      return item.armorProperties?.slot ?? 'bodyBase';
    case 'tool':
      return 'mainHand';
    default:
      return null;
  }
}

export function blockedSlots(pawn: Pawn): Set<EquipmentSlot> {
  const set = new Set<EquipmentSlot>();
  for (const t of pawn.traits ?? []) for (const s of t.blocksSlots ?? []) set.add(s);
  return set;
}

const PAIRED_SLOTS: Partial<Record<EquipmentSlot, EquipmentSlot>> = { ring: 'ring2' };

export function resolveEquipSlot(pawn: Pawn, item: Item): EquipmentSlot | null {
  const base = getEquipmentSlot(item);
  if (!base) return null;
  if (base === 'mainHand' && item.weaponProperties?.offHandable && !pawn.equipment?.offHand) {
    const held = pawn.equipment?.mainHand;
    const heldWp = held ? itemDefById(held.itemId)?.weaponProperties : undefined;
    if (heldWp?.offHandable) return 'offHand';
  }
  const partner = PAIRED_SLOTS[base];
  if (partner && pawn.equipment?.[base] && !pawn.equipment?.[partner]) return partner;
  return base;
}

export function equipDropToPawn(
  state: GameState,
  pawnId: string,
  dropId: string,
  targetSlot?: EquipmentSlot
): GameState {
  const drop = (state.droppedItems ?? []).find((d) => d.id === dropId);
  if (!drop) return state;
  const item = itemDefById(drop.resourceId);
  if (!item) return state;
  const pawnIdx = state.pawns.findIndex((pw) => pw.id === pawnId);
  if (pawnIdx < 0) return state;
  const pawn = state.pawns[pawnIdx];
  const slot = targetSlot ?? resolveEquipSlot(pawn, item);
  if (!slot) return state;
  if (blockedSlots(pawn).has(slot)) return state;
  const instance: ItemInstance = drop.instance ?? {
    instanceId: `${item.id}-${pawnId}-t${state.turn}`,
    itemId: item.id,
    durability: Math.round((item.maxDurability ?? 100) * (drop.matDur ?? 1)),
    ...(drop.matWeight !== undefined && drop.matWeight !== 1 ? { matWeight: drop.matWeight } : {}),
    ...(drop.quality !== undefined ? { quality: drop.quality } : {})
  };
  const px = pawn.position?.x ?? drop.x;
  const py = pawn.position?.y ?? drop.y;
  let drops = (state.droppedItems ?? [])
    .map((d) => (d.id === dropId ? { ...d, quantity: d.quantity - 1 } : d))
    .filter((d) => d.quantity > 0);
  const prev = pawn.equipment[slot];
  if (prev) {
    drops = [
      ...drops,
      {
        id: `unequip-${prev.instanceId}-t${state.turn}`,
        resourceId: prev.itemId,
        x: px,
        y: py,
        quantity: 1,
        stored: false,
        instance: prev
      }
    ];
  }
  const pawns = state.pawns.map((pw, i) =>
    i === pawnIdx
      ? {
          ...drainWornVesselIntoPack(pw, instance),
          equipment: { ...pw.equipment, [slot]: instance }
        }
      : pw
  );
  return { ...withDrops(state, drops), pawns };
}

export function carryDropToInventory(state: GameState, pawnId: string, dropId: string): GameState {
  const drop = (state.droppedItems ?? []).find((d) => d.id === dropId);
  if (!drop) return state;
  const item = itemDefById(drop.resourceId);
  if (!item) return state;
  const pawnIdx = state.pawns.findIndex((pw) => pw.id === pawnId);
  if (pawnIdx < 0) return state;
  const pawn = state.pawns[pawnIdx];
  const instance: ItemInstance = drop.instance ?? {
    instanceId: `${item.id}-${pawnId}-t${state.turn}`,
    itemId: item.id,
    durability: Math.round((item.maxDurability ?? 100) * (drop.matDur ?? 1)),
    ...(drop.quality !== undefined ? { quality: drop.quality } : {})
  };
  const drops = (state.droppedItems ?? [])
    .map((d) => (d.id === dropId ? { ...d, quantity: d.quantity - 1 } : d))
    .filter((d) => d.quantity > 0);
  const inv = pawn.inventory ?? createPawnInventory();
  const pawns = state.pawns.map((pw, i) =>
    i === pawnIdx
      ? { ...pw, inventory: { ...inv, instances: [...(inv.instances ?? []), instance] } }
      : pw
  );
  return { ...withDrops(state, drops), pawns };
}

export function canEquipItem(_pawn: Pawn, itemId: string): boolean {
  const item = itemDefById(itemId);
  if (!item) return false;
  return getEquipmentSlot(item) !== null;
}

export function addInstanceToInventory(pawn: Pawn, itemId: string, turn?: number): Pawn {
  const item = itemDefById(itemId);
  if (!item) return pawn;
  const instance: ItemInstance = {
    instanceId: `${itemId}-${pawn.id}-${turn !== undefined ? `t${turn}` : Date.now()}`,
    itemId,
    durability: item.maxDurability ?? 100
  };
  const inv = pawn.inventory ?? { items: {}, instances: [] };
  return {
    ...pawn,
    inventory: { ...inv, instances: [...(inv.instances ?? []), instance] }
  };
}

function drainWornVesselIntoPack(pawn: Pawn, worn: ItemInstance): Pawn {
  if (!worn.contents?.length) return pawn;
  const inv = pawn.inventory ?? { items: {}, instances: [] };
  const items = { ...(inv.items ?? {}) };
  const instances = [...(inv.instances ?? [])];
  for (const entry of emptyOut(worn)) {
    if (isFluidId(entry.itemId)) continue;
    if (entry.instance) instances.push(entry.instance);
    else items[entry.itemId] = (items[entry.itemId] ?? 0) + (entry.amount ?? 0);
  }
  return { ...pawn, inventory: { ...inv, items, instances } };
}

export function equipItem(pawn: Pawn, itemId: string, turn?: number): Pawn {
  const item = itemDefById(itemId);
  if (!item || !canEquipItem(pawn, itemId)) return pawn;

  const slot = resolveEquipSlot(pawn, item);
  if (!slot) return pawn;
  if (blockedSlots(pawn).has(slot)) return pawn;

  let updatedPawn = { ...pawn };

  if (updatedPawn.equipment[slot]) {
    updatedPawn = unequipItem(updatedPawn, slot);
  }

  const instance: ItemInstance = {
    instanceId: `${itemId}-${pawn.id}-${turn !== undefined ? `t${turn}` : Date.now()}`,
    itemId,
    durability: item.maxDurability ?? 100
  };

  updatedPawn.equipment = {
    ...updatedPawn.equipment,
    [slot]: instance
  };

  return updatedPawn;
}

export function unequipItem(pawn: Pawn, slot: EquipmentSlot): Pawn {
  if (!pawn.equipment[slot]) return pawn;

  const updatedPawn = { ...pawn };

  updatedPawn.equipment = {
    ...updatedPawn.equipment,
    [slot]: undefined
  };

  return updatedPawn;
}

export function calculateItemBonuses(item: Item): Record<string, number> {
  const bonuses: Record<string, number> = {};

  Object.entries(item.effects || {}).forEach(([effect, value]) => {
    if (typeof value === 'number') {
      switch (effect) {
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

        case 'craftingSpeed':
          bonuses.craftingBonus = value;
          break;
        case 'workability':
          bonuses.toolEfficiency = value;
          break;

        case 'defense':
          bonuses.constitutionBonus = Math.floor(value / 3);
          bonuses.defenseRating = value;
          break;

        case 'movementSpeed':
          bonuses.dexterityBonus = Math.floor(value * 2);
          break;

        case 'strengthBonus':
        case 'dexterityBonus':
        case 'intelligenceBonus':
        case 'perceptionBonus':
        case 'charismaBonus':
        case 'constitutionBonus':
          bonuses[effect] = value;
          break;

        case 'fireResistance':
        case 'coldResistance':
        case 'crushResistance':
          bonuses[effect] = value;
          break;

        case 'magicalPower':
          bonuses.intelligenceBonus = Math.floor(value / 2);
          bonuses.perceptionBonus = Math.floor(value / 3);
          break;

        default:
          bonuses[effect] = value;
      }
    }
  });

  if (item.type === 'weapon' && item.weaponProperties) {
    bonuses.attackDamage = item.weaponProperties.damage;
    bonuses.attackSpeed = item.weaponProperties.attackSpeed;
    bonuses.attackRange = item.weaponProperties.range;
  }

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

export function getEquipmentBonuses(pawn: Pawn): Record<string, number> {
  const totalBonuses: Record<string, number> = {};

  Object.values(pawn.equipment).forEach((inst) => {
    if (!inst) return;
    const item = itemDefById(inst.itemId);
    if (!item) return;
    const bonuses = calculateItemBonuses(item);
    Object.entries(bonuses).forEach(([bonus, value]) => {
      totalBonuses[bonus] = (totalBonuses[bonus] || 0) + (value as number);
    });
  });

  return totalBonuses;
}

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

export function damageEquipment(pawn: Pawn, slot: EquipmentSlot, damage: number = 1): Pawn {
  const inst = pawn.equipment[slot];
  if (!inst) return pawn;

  const def = itemDefById(inst.itemId);
  const newDurability = Math.max(0, inst.durability - damage);

  if (newDurability <= 0) {
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
}
