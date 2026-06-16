// Items, recipes, inventory, and equipment types. Split out of core/types.ts (P-4); re-exported
// via the barrel.

import type { DamageType } from './health';

export interface ItemInstance {
  instanceId: string; // unique stable ID
  itemId: string; // references Item definition
  durability: number; // current durability (same field everywhere — ground/inventory/equipped)
}

export interface PawnInventory {
  items: Record<string, number>; // bulk materials: itemId → quantity
  instances: ItemInstance[]; // tracked items: weapons, armour, tools with durability
  weightKg: number; // current carried weight
  maxWeightKg: number; // derived from pawn stats + equipped carry containers
  volumeL: number; // current carried volume
  maxVolumeL: number; // derived from pawn stats + equipped carry containers
}

export interface PawnEquipment {
  mainHand?: ItemInstance;
  offHand?: ItemInstance;
  headBase?: ItemInstance;
  headOuter?: ItemInstance;
  bodyBase?: ItemInstance;
  bodyMid?: ItemInstance;
  bodyOuter?: ItemInstance;
  gloves?: ItemInstance;
  boots?: ItemInstance;
  gorget?: ItemInstance;
  ring?: ItemInstance;
  belt?: ItemInstance;
  back?: ItemInstance;
}

/** @deprecated Use ItemInstance directly — EquippedItem kept for backward compat during migration. */
export interface EquippedItem {
  itemId: string;
  durability: number;
  maxDurability: number;
  bonuses?: Record<string, number>; // Applied bonuses
}

export type EquipmentSlot =
  | 'mainHand'
  | 'offHand'
  | 'headBase'
  | 'headOuter'
  | 'bodyBase'
  | 'bodyMid'
  | 'bodyOuter'
  | 'gloves'
  | 'boots'
  | 'gorget'
  | 'ring'
  | 'belt'
  | 'back';

/**
 * Defines a single dynamic ingredient slot in a recipe.
 * Any item whose `category` matches `acceptsCategory` is a valid substitute;
 * the chosen ingredient drives the output item's display name, description,
 * and optional stat tweaks.
 */
export interface DynamicIngredientSlot {
  /** Items with this `category` are accepted in this slot (e.g. "meat") */
  acceptsCategory: string;
  /** Units consumed from the chosen ingredient */
  quantity: number;
  /**
   * Per-ingredient overrides applied to the crafted item's display/stats.
   * Key = source itemId, value = overrides.
   */
  variants?: Record<
    string,
    {
      name?: string;
      description?: string;
      nutritionBonus?: number;
    }
  >;
  /** Fallback when the chosen ingredient has no specific variant entry */
  default?: { name?: string; description?: string };
}

// Fixed: Remove duplicate Tool interface - Item interface covers this
/**
 * A crafting recipe (PRODUCTION-CHAIN-EXPANSION recipe-registry refactor). Recipes are
 * first-class: items are pure materials; a recipe transforms `inputs` → `outputs` (the primary
 * product plus any byproducts) at a `station`. Authored in `recipes.jsonc`, and also
 * *synthesised* from an item's legacy inline `craftingCost`/`workshopType` fields during
 * migration so both sources work behind one accessor.
 */
export interface Recipe {
  id: string;
  /** workshopType / building id required to run this recipe (null/undefined = anywhere). */
  station?: string | null;
  /** Consumed inputs. */
  inputs: Record<string, number>;
  /** Alternative input sets — any ONE may be used in place of `inputs`. */
  inputAlternatives?: Record<string, number>[];
  /** Produced items: the primary product plus any byproducts (e.g. log → firewood + branches). */
  outputs: Record<string, number>;
  /** Total work points (legacy `craftingTime`). */
  workAmount: number;
  toolTierRequired?: number;
  /** ADR-009 step 2 — per-recipe craft-tool gate (overrides the recipe's station `toolRequirement`).
   *  A pawn must carry a qualifying tool to work this recipe. Omitted = inherit the station's. */
  toolRequirement?: { workType: string; minTier: number };
  researchRequired?: string | null;
  populationRequired?: number;
  buildingRequired?: string | null;
  /** Variant-output slot — folds in the legacy `dynamicRecipe` system (e.g. spit_meat, stew). */
  dynamicRecipe?: Record<string, DynamicIngredientSlot>;
  /**
   * Per-slot, per-material stat deltas applied to the crafted output.
   * Key = slot name → itemId → weaponProperties/armorProperties delta fields.
   * e.g. { "shaft": { "ash_log": { "accuracy": 3 }, "oak_log": { "maxDurability": 15 } } }
   */
  materialBonuses?: Record<string, Record<string, Record<string, number>>>;
  /** True when synthesised from an item's inline fields rather than authored in recipes.jsonc. */
  synthesized?: boolean;
  /**
   * ADR-016 passive furnaces: when true (or when the station is a known furnace), the recipe is
   * produced PASSIVELY — inputs (and fuel) are loaded onto the station and it transforms them
   * over time without a pawn working it, gated by the station being lit/hot. No craft job is
   * generated; see GameEngineImpl.processPassiveProduction. Defaults from the station type.
   */
  passive?: boolean;
}

export interface Item {
  id: string;
  name: string;
  amount: number;
  /**
   * R10: the item's display name is derived per-instance from a subject (e.g. a pawn corpse →
   * "Bjorn's Corpse"). Spawners pass the subject to `itemService.makeDynamicName`, which stores the
   * result on the `DroppedItem.name`; renderers resolve via `itemService.getItemDisplayName`.
   */
  dynamicName?: boolean;
  description?: string; // Optional description for lore or flavor text
  /** Sprite-sheet glyph(s) for card/inventory icons (same shape as Building.charSpans). */
  charSpans?: Array<{ sheet?: string; id?: number; from?: number; to?: number; literal?: string }>;
  properties?: Record<string, any>;
  /** Gathering work types that produce this item from the world (e.g. foraging, hunting, mining). */
  gatheringTypes?: string[];
  /** Work categories that can use/process this item (e.g. butchery, cooking, leatherworking). */
  processingType?: string[];
  /** True if this item is an animal carcass subject to intactness decay. */
  isCarcass?: boolean;
  /** Butchery yields: what items this carcass produces and in what quantities. */
  yields?: Array<{
    item: string;
    min: number;
    max: number;
  }>;
  /**
   * Dynamic recipe slots — each key is a slot name (e.g. "meat").
   * Any item whose `category` matches `acceptsCategory` can fill that slot;
   * the chosen item determines the output's name, description, and optional stat bonus.
   */
  dynamicRecipe?: Record<string, DynamicIngredientSlot>;

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
  /**
   * Alternative ingredient sets — crafting can use ANY ONE of these instead of craftingCost.
   * Useful when a product (e.g. medium_bones) can be obtained from multiple source items.
   */
  craftingCostAlternatives?: Record<string, number>[];
  craftingTime?: number;
  toolTierRequired?: number;
  buildingRequired?: string | null;
  workshopType?: string | null; // Phase 5d: building type required to craft (e.g. 'forge')
  populationRequired?: number;
  // Phase 6: fuel / container / cooking properties
  fuelValue?: number; // fuel units added when used as campfire fuel
  isContainer?: boolean; // acts as a storage container
  storageCapacity?: number; // max items stored
  preservationBonus?: number; // 0–1, reduces food spoilage rate
  isCookingVessel?: boolean; // required in stockpile to cook stews
  components?: string[]; // for dynamic stew crafts: ingredient item ids

  // Item properties (durability, effects, etc.)
  durability?: number;
  maxDurability?: number;
  effects?: Record<string, number>;
  // ── PRODUCTION-CHAIN-EXPANSION §B: wear & deterioration ──
  // Both wear sources draw down the same `maxDurability` pool (default 100 when unset):
  //   • tools lose `durabilityLossPerAction` per work action,
  //   • any durable good loses `deteriorationRate` per tick while loose/unsheltered.
  // Lifespan of an exposed stack ≈ maxDurability / deteriorationRate ticks.
  /** Durability spent per work action when used as a tool (scaled by tier). */
  durabilityLossPerAction?: number;
  /** Per-tick durability lost to elemental exposure while a stack is loose/unsheltered. */
  deteriorationRate?: number;
  // ── §2: heat rating when burned as fuel (gates high-heat stations) ──
  fuelHeat?: number;

  // Food properties
  nutrition?: number; // Dedicated nutrition value for food items

  /** Medicine quality 0–1 — added to a tend's treatment quality when consumed (COMBAT-SYSTEM caretaking). */
  medicineQuality?: number;

  // Weight & volume for inventory capacity system
  weightKg?: number;
  volumeL?: number;
  /** Bonus carry capacity granted when equipped in belt/back slot. */
  inventoryBonus?: { weightKg: number; volumeL: number };
  /** Durability lost per combat hit when this item is equipped. */
  durabilityLossPerCombatHit?: number;
  // Future SEASONS_WEATHER stubs (no logic yet, just typed):
  weatherResistance?: number;
  coldProtection?: number;
  heatProtection?: number;

  // Decay properties
  decaySeconds?: number; // in-game seconds until one unit of this item spoils
  decaysTo?: string; // itemId it becomes on decay; omit to simply vanish

  // Requirements
  researchRequired?: string | null;
  level?: number;
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

  // Item-specific properties
  weaponProperties?: {
    damage: number; // legacy flat damage; kept for backward compat
    attackSpeed: number;
    range: number;
    // ── COMBAT-SYSTEM additions ──────────────────────────────────────────
    damageType?: DamageType; // cutting | piercing | blunt
    baseDamage?: number; // base damage before str scaling
    damMin?: number; // minimum damage roll (EQUIPMENT-EXPANSION)
    damMax?: number; // maximum damage roll (EQUIPMENT-EXPANSION)
    reach?: number; // melee reach in tiles (1 = adjacent, 2 = pole-arm)
    accuracy?: number; // added to hitChance formula
    armorPenetration?: number; // 0–1; fraction of armor reduction bypassed
    bluntMod?: number; // multiplier on knockdown chance (blunt weapons)
    critMod?: number; // added to the wielder's base crit_chance (0–1)
    twoHanded?: boolean; // requires both mainHand and offHand slots
    tags?: string[]; // ability grants from COMBAT-SYSTEM
    // ── Natural-weapon additions (innate attacks rolled per swing) ───────
    weight?: number; // relative roll frequency among an entity's natural weapons (default 1)
    staminaCost?: number; // stamina drained by this attack (default ATTACK_STAMINA_COST)
  };

  armorProperties?: {
    defense: number;
    armorType?: 'light' | 'medium' | 'heavy' | 'shield';
    slot?:
      | 'head'
      | 'chest'
      | 'legs'
      | 'feet'
      | 'hands'
      | 'offhand'
      | 'headBase'
      | 'headOuter'
      | 'bodyBase'
      | 'bodyMid'
      | 'bodyOuter'
      | 'gloves'
      | 'boots'
      | 'gorget'
      | 'ring'
      | 'belt'
      | 'back'
      | 'offHand';
    armorLayer?: 'gambeson' | 'mail' | 'plate';
    armorValue?: number; // damage absorbed per hit from this layer
    fatiguePerTurn?: number; // fatigue drain per turn while worn
    equipmentSlot?: EquipmentSlot;
    movementPenalty?: number; // 0.0 to 1.0, where 0.3 = 30% movement penalty

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
    coldResistance?: number; // 0–1: reduces cold exposure (hypothermia) while worn (SEASONS_WEATHER)
    heatResistance?: number; // 0–1: reduces heat exposure (heat stroke) while worn (SEASONS_WEATHER)
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

export interface CraftingInProgress {
  item: Item; // The item being crafted
  quantity: number; // How many are being crafted
  startedAt: number;
  /** For dynamic recipes: maps slot key (e.g. "meat") → chosen itemId */
  selectedIngredients?: Record<string, string>;
  // Phase 5d: work-based crafting (produced by craftItem, consumed by JobService)
  id: string; // unique id for job correlation
  workRequired: number; // recipe.workAmount × quantity (ADR-016)
  workDone: number; // accumulated work points
  // ADR-016 reserve-and-fetch:
  /** Resolved input cost (× quantity) that must be physically staged on the station. */
  inputs: Record<string, number>;
  /** Workstation type required by the recipe (= recipe.station). */
  stationType?: string | null;
  /** Chosen workstation instance (PlacedBuilding.id) inputs are fetched to and crafted at. */
  stationBuildingId?: string;
}
