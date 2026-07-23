import type {
  Pawn,
  ItemInstance,
  EquipmentSlot,
  Item,
  PawnEquipment,
  PawnInventory,
  EntityStats,
  GameState
} from './types';
import { itemDefById } from './itemDefs';
import { aggregateFromDrops } from './GameState';

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

/**
 * Count how many of each item id are currently EQUIPPED across all pawns. Equipping "borrows" an
 * item from the shared colony stockpile without decrementing it, so the equip UI's available pool is
 * `stockpile − equipped`. Exposed for the equip screen to derive that pool reactively (INV-1: the
 * pool is no longer written into pawn.inventory.items).
 */
export function equippedItemCounts(pawns: Pawn[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const pawn of pawns) {
    for (const inst of Object.values(pawn.equipment)) {
      if (inst) counts[inst.itemId] = (counts[inst.itemId] ?? 0) + 1;
    }
  }
  return counts;
}

/** One worn garment's cold/heat resistance contribution (0–1 each), with its display name. */
export interface WornThermalSource {
  name: string;
  cold: number;
  heat: number;
}

/** Per-garment cold/heat resistance (SEASONS_WEATHER) from a pawn's worn armour — the breakdown behind
 *  {@link equippedTemperatureResistance}, so the health-tab tolerance tooltip can itemise each piece. */
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

/**
 * Sum cold/heat resistance (0–1 each) from a pawn's worn armour (SEASONS_WEATHER). Added on top of
 * the CON-derived cold_resistance/fire_resistance stats when computing temperature exposure.
 */
export function equippedTemperatureResistance(pawn: Pawn): { cold: number; heat: number } {
  let cold = 0;
  let heat = 0;
  for (const g of equippedTemperatureSources(pawn)) {
    cold += g.cold;
    heat += g.heat;
  }
  return { cold, heat };
}

/** Derive which equipment slot an item belongs to based on its type/properties. */
export function getEquipmentSlot(item: Item): EquipmentSlot | null {
  if (item.armorProperties?.equipmentSlot) return item.armorProperties.equipmentSlot;
  switch (item.type) {
    case 'weapon': {
      // RANGED-COMBAT: a thrown weapon (ranged, no ammo bucket, one-handed) is worn in the OFF hand so
      // it pairs with a melee main-hand — the hybrid STR/PER build, instead of a shield. Mirrors
      // `rangedCombat.isThrownWeaponProps` (inlined: core/ must not import upward from systems/).
      const wp = item.weaponProperties;
      const thrown = !!wp && (wp.range ?? 0) > 1 && !wp.ammoCategory && !wp.twoHanded;
      return thrown ? 'offHand' : 'mainHand';
    }
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
      // A tool is held in hand, not worn on the belt — the belt slot is for belts/pouches
      // (inventoryBonus carry containers). Pawns carry tools in their inventory and only equip one
      // to the hand when actually working a tool-gated job (see handlers/work).
      return 'mainHand';
    default:
      return null;
  }
}

/** Equipment slots a pawn's cultural traits forbid (ADR-023 `blocksSlots`) — a clawed/furred/horned
 *  body can't wear gear there. The gear tab greys these; equip is refused. Empty for a plain pawn. */
export function blockedSlots(pawn: Pawn): Set<EquipmentSlot> {
  const set = new Set<EquipmentSlot>();
  for (const t of pawn.traits ?? []) for (const s of t.blocksSlots ?? []) set.add(s);
  return set;
}

/** Slots that come as a PAIR: equipping an item whose canonical slot is the key fills the partner
 *  slot when the canonical one is already occupied and the partner is free (so a pawn wears two
 *  rings). Only rings pair today. */
const PAIRED_SLOTS: Partial<Record<EquipmentSlot, EquipmentSlot>> = { ring: 'ring2' };

/** The actual slot this item should occupy on THIS pawn — like `getEquipmentSlot`, but for a paired
 *  slot (rings) it returns the free partner when the primary is taken, so a second ring goes to
 *  `ring2` instead of swapping out the first. Falls back to the primary (swap) when both are full. */
export function resolveEquipSlot(pawn: Pawn, item: Item): EquipmentSlot | null {
  const base = getEquipmentSlot(item);
  if (!base) return null;
  const partner = PAIRED_SLOTS[base];
  if (partner && pawn.equipment?.[base] && !pawn.equipment?.[partner]) return partner;
  return base;
}

/**
 * Move ONE unit of a tile/stockpile drop into a pawn's matching equipment slot, returning the new
 * state (or the state unchanged if the drop / item / slot can't be resolved). Any item already in that
 * slot is dropped at the pawn. This is the SINGLE source of truth for equip-from-ground, shared by the
 * instant `equipFromTile` command and the drafted "walk over, then equip" order (applied on arrival).
 */
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
  // An explicit `targetSlot` (e.g. the player chose Off Hand) wins; otherwise auto-resolve — which is
  // occupancy-aware, sending a 2nd ring to the free `ring2` slot instead of swapping the first.
  const slot = targetSlot ?? resolveEquipSlot(pawn, item);
  if (!slot) return state;
  // ADR-023: the body forbids this slot (claws fill the hands, horns the crown…) — refuse the equip.
  if (blockedSlots(pawn).has(slot)) return state;
  const instance: ItemInstance = drop.instance ?? {
    instanceId: `${item.id}-${pawnId}-t${state.turn}`,
    itemId: item.id,
    // §M a tougher material (oak/sturdy leather ×1.3, ironwood ×1.7) gives the item more durability to
    // wear through; a flimsy one (pine/silk) less.
    durability: Math.round((item.maxDurability ?? 100) * (drop.matDur ?? 1)),
    // §M carry the material weight multiplier onto the instance (heavier hide → heavier to carry).
    ...(drop.matWeight !== undefined && drop.matWeight !== 1 ? { matWeight: drop.matWeight } : {}),
    // §Q: carry the stack's craft-quality tier onto the equipped instance (like durability).
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
    i === pawnIdx ? { ...pw, equipment: { ...pw.equipment, [slot]: instance } } : pw
  );
  return { ...state, pawns, droppedItems: drops, stockpile: aggregateFromDrops(drops) };
}

/**
 * Carry ONE unit of a tile/stockpile drop in the pawn's pack as a TRACKED instance (not the bulk
 * `inventory.items` count map). Instances are the only inventory form the tool system reads — both the
 * work boost (`heldToolBoost`) and the claim gate (`pawnHasToolFor`) scan `inventory.instances` — and
 * they survive a stockpile deposit, so a tool kept this way stays with the pawn instead of being
 * dropped. Used by the drafted "Carry … (inventory)" order so a carried tool actually boosts work.
 */
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
    // §M a tougher material (oak/sturdy leather ×1.3, ironwood ×1.7) gives the item more durability to
    // wear through; a flimsy one (pine/silk) less.
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
  return { ...state, pawns, droppedItems: drops, stockpile: aggregateFromDrops(drops) };
}

export function canEquipItem(_pawn: Pawn, itemId: string): boolean {
  const item = itemDefById(itemId);
  if (!item) return false;
  // Whether the item is in stock is the equip UI's concern (it only lists in-stock items, minus
  // what's already equipped). Here we only answer "does this item type have an equip slot" — so
  // availability no longer reads pawn.inventory.items (which is the pawn's CARRIED goods, not the
  // colony equip pool — INV-1).
  return getEquipmentSlot(item) !== null;
}

/**
 * Add one tracked instance of `itemId` to the pawn's CARRIED inventory (`inventory.instances`), not a
 * worn slot. Used for tools a pawn fetches for a tool-gated job: the job gate (`pawnHasToolFor`)
 * accepts a carried tool, so the pawn keeps it in inventory rather than occupying the belt slot.
 * Deposit + craft-staging both preserve `instances`, so the carried tool isn't dropped at a stockpile.
 */
export function addInstanceToInventory(pawn: Pawn, itemId: string, turn?: number): Pawn {
  const item = itemDefById(itemId);
  if (!item) return pawn;
  const instance: ItemInstance = {
    // Turn-stamped when the caller has one (tick path — keeps a scenario replay byte-identical,
    // ADR-033); wall-clock only as the no-context fallback.
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

export function equipItem(pawn: Pawn, itemId: string, turn?: number): Pawn {
  const item = itemDefById(itemId);
  if (!item || !canEquipItem(pawn, itemId)) return pawn;

  const slot = resolveEquipSlot(pawn, item);
  if (!slot) return pawn;
  if (blockedSlots(pawn).has(slot)) return pawn; // ADR-023: body forbids this slot

  let updatedPawn = { ...pawn };

  // Unequip current item in slot if exists
  if (updatedPawn.equipment[slot]) {
    updatedPawn = unequipItem(updatedPawn, slot);
  }

  // Create ItemInstance for the equipped item (turn-stamped when the caller has one — ADR-033
  // replay determinism; wall-clock only as the no-context fallback)
  const instance: ItemInstance = {
    instanceId: `${itemId}-${pawn.id}-${turn !== undefined ? `t${turn}` : Date.now()}`,
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

// §2h: item consumption moved to `entities/Pawns.applyConsumable` (timed potion buffs + beast-organ
// trait grants), driven by the `useConsumableItem` command. The old stub here read `pawn.state.health`/
// `.mood` — fields that don't exist on the current pawn model, so it was dead.

// Calculate total equipment bonuses for a pawn
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

  const def = itemDefById(inst.itemId);
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
