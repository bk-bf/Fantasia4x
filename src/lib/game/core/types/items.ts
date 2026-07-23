// Items, recipes, inventory, and equipment types.

import type { DamageType } from './health';
import type { OnHitCondition, OnHitWound } from './culture';

/**
 * Discrete craft-quality tier: 0=Crude, 1=Standard (unmarked baseline), 2=Fine, 3=Superior,
 * 4=Masterwork, 5=Legendary. Rolled at craft completion and stamped per-stack/per-instance, like
 * durability. See `core/itemQuality.ts` for the tier table, roll, and multiplier/prefix/colour helpers.
 */
export type ItemQuality = 0 | 1 | 2 | 3 | 4 | 5;

export interface ItemInstance {
  instanceId: string;
  itemId: string; // references Item definition
  durability: number; // same field everywhere — ground/inventory/equipped
  /** Per-instance display name override for `dynamicName` items (e.g. a pawn carcass keeps
   *  "Vale's Carcass" through hauling/storage). Undefined for ordinary tracked items. */
  name?: string;
  /** Craft-quality tier, carried for the life of the item; readers scale quality-relevant stats by
   *  `qualityMultiplier(quality)`. Undefined = Standard (×1.0) — uncrafted / world-spawned items and
   *  bulk materials carry no quality. */
  quality?: ItemQuality;
  /**
   * Famed: a named legend ABOVE the quality tier scale, set on a vanishingly-rare craft roll (see
   * `rollFamed`) or a high-level mob drop. Carries a generated `famedName`/`famedHistory`, a per-stat
   * explosion multiplier (`famedStatMult`, ×2–5, layered over the quality tier), and `famedEnchants`
   * (1–3 condition ids granted while equipped, reusing `grantsConditions`).
   */
  famed?: boolean;
  famedName?: string;
  famedHistory?: string;
  famedStatMult?: number;
  famedEnchants?: string[];
  /** Liquid-container fill: UNITS of this container def's `container.holds` item currently inside
   *  (0 / undefined = empty; water is 1 L/unit, so for water it's the litres held). Drives the fill
   *  bar and how much the container can dispense. Only meaningful on `container` items. */
  contents?: number;
  /**
   * PRODUCTION-CHAIN-IIII §2 — a temporary weapon COATING applied to this instance (a venom/oil rubbed
   * on the blade). While unexpired it grants an EXTRA `onHitCondition` (read from the coating item's
   * `coatingEffect`) ON TOP of the weapon's own procs — Combat.applyOnHitEffect applies both. Time-based:
   * `expiresAtTurn` is the game turn it wears off. Re-coating overwrites. Only meaningful on weapons.
   */
  coating?: WeaponCoating;
}

/** A timed weapon coating stamped on an {@link ItemInstance} — `itemId` names the coating consumable
 *  whose `coatingEffect` is the granted on-hit proc; `expiresAtTurn` is when it dries off. */
export interface WeaponCoating {
  itemId: string;
  expiresAtTurn: number;
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
  pauldrons?: ItemInstance; // shoulder armour (covers leftShoulder/rightShoulder)
  bracers?: ItemInstance; // arm armour (upper arms + forearms)
  greaves?: ItemInstance; // leg armour (upper + lower legs)
  ring?: ItemInstance;
  ring2?: ItemInstance; // second ring slot — two rings can be worn at once (occupancy-resolved on equip)
  amulet?: ItemInstance; // neck slot for attuned amulets (distinct from the `gorget` neck armour)
  belt?: ItemInstance;
  back?: ItemInstance;
}

/** @deprecated Use ItemInstance directly. */
export interface EquippedItem {
  itemId: string;
  durability: number;
  maxDurability: number;
  bonuses?: Record<string, number>;
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
  | 'pauldrons'
  | 'bracers'
  | 'greaves'
  | 'ring'
  | 'ring2'
  | 'amulet'
  | 'belt'
  | 'back';

/**
 * A single dynamic ingredient slot in a recipe. Any item whose `category` matches is a valid
 * substitute; the chosen ingredient drives the output item's display name, description, and
 * optional stat tweaks.
 */
export interface DynamicIngredientSlot {
  /** Items with this `category` are accepted in this slot (e.g. "meat"). Single-category shorthand. */
  acceptsCategory?: string;
  /** Items in ANY of these categories are accepted (e.g. a stew slot taking meat/fish/vegetable/legume).
   *  Read both fields through `recipeService.slotCategories(slot)` so callers never branch. */
  acceptsCategories?: string[];
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

/**
 * Material properties — a dynamic build/craft material (oak vs pine plank, granite vs marble block)
 * shifts the finished building's / item's stats. Authored on the material's `Item.material` field in
 * `items.jsonc`. `building` mods adjust a placed building's stats; `item` mods the crafted output.
 * Multipliers default to 1 (neutral), additive deltas to 0.
 */
export interface MaterialStatMods {
  durability?: number; // ×maxDurability (item) / ÷conditionDecayPerTurn (building); 1 = neutral
  beauty?: number; // + building beauty
  comfort?: number; // + building comfort
  insulation?: number; // + building thermalInsulation
  weight?: number; // ×weightKg (item); 1 = neutral
}
export interface MaterialProperty {
  /** Short display name for the hover card, e.g. "Oak". */
  label: string;
  /** One-line benefit/detriment summary, e.g. "+durable, +handsome, heavier". */
  desc: string;
  building?: MaterialStatMods;
  item?: MaterialStatMods;
}

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
  /** Total work points. */
  workAmount: number;
  toolTierRequired?: number;
  /** Per-recipe craft-tool gate (overrides the recipe's station `toolRequirement`). A pawn must
   *  carry a qualifying tool to work this recipe. Omitted = inherit the station's. */
  toolRequirement?: { workType: string; minTier: number };
  researchRequired?: string | null;
  populationRequired?: number;
  buildingRequired?: string | null;
  /** Variant-output slot (e.g. spit_meat, stew). */
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
   * When true (or when the station is a known furnace), the recipe is produced PASSIVELY — inputs
   * (and fuel) are loaded onto the station and it transforms them over time without a pawn working
   * it, gated by the station being lit/hot. No craft job is generated; see
   * GameEngineImpl.processPassiveProduction. Defaults from the station type.
   */
  passive?: boolean;
}

export interface Item {
  id: string;
  name: string;
  amount: number;
  /**
   * The item's display name is derived per-instance from a subject (e.g. a pawn corpse →
   * "Bjorn's Corpse"). Spawners pass the subject to `itemService.makeDynamicName`, which stores the
   * result on the `DroppedItem.name`; renderers resolve via `itemService.getItemDisplayName`.
   */
  dynamicName?: boolean;
  description?: string;
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
   * Dynamic recipe slots — each key is a slot name (e.g. "meat"); any item whose `category` matches
   * can fill it, and the chosen item determines the output's name, description, and stat bonus.
   */
  dynamicRecipe?: Record<string, DynamicIngredientSlot>;

  type: 'material' | 'tool' | 'weapon' | 'armor' | 'consumable' | 'currency';
  category: string; // wood, iron, harvesting, combat, head, etc.
  /** Internal item never surfaced as a player resource (e.g. natural weapons like fists/claws).
   *  Excluded from the resource sidebar — its category won't appear in the "show all" list. */
  hidden?: boolean;

  // Visual
  emoji?: string;
  color?: string;

  maxValue?: number; // Stack limit
  passiveGeneration?: number; // Auto-generation rate
  /** KINGDOMS-TRADE §4: base economic value (barter pricing + colony wealth). Optional — items
   *  without an authored value fall back to the core/itemValue.ts heuristic (type/tier/category).
   *  Effective value scales with quality/material/Famed at the instance level. */
  value?: number;

  // Crafting requirements
  craftingCost?: Record<string, number>;
  /**
   * Alternative ingredient sets — crafting can use ANY ONE of these instead of craftingCost.
   * Useful when a product (e.g. medium_bones) can be obtained from multiple source items.
   */
  craftingCostAlternatives?: Record<string, number>[];
  craftingTime?: number;
  toolTierRequired?: number;
  buildingRequired?: string | null;
  workshopType?: string | null; // building type required to craft (e.g. 'forge')
  populationRequired?: number;
  // Fuel / container / cooking properties
  fuelValue?: number; // fuel units added when used as campfire fuel
  /** Burn-longevity multiplier (≥1, default 1): how much SLOWER a station burns while fed this fuel,
   *  independent of `fuelValue` (bulk) and `fuelHeat` (temperature). Dense seasoned fuel (charcoal,
   *  coke) smoulders far longer than kindling, so a tank of it needs refuelling far less often. */
  burnDuration?: number;
  isContainer?: boolean; // acts as a storage container
  storageCapacity?: number; // max items stored
  preservationBonus?: number; // 0–1, reduces food spoilage rate
  isCookingVessel?: boolean; // required in stockpile to cook stews
  components?: string[]; // for dynamic stew crafts: ingredient item ids

  // Item properties (durability, effects, etc.)
  durability?: number;
  maxDurability?: number;
  effects?: Record<string, number>;
  // Wear & deterioration — both sources draw down the same `maxDurability` pool (default 100):
  //   • tools lose `durabilityLossPerAction` per work action,
  //   • any durable good loses `deteriorationRate` per tick while loose/unsheltered.
  /** Durability spent per work action when used as a tool (scaled by tier). */
  durabilityLossPerAction?: number;
  /** Tool tier (1 = primitive stone, higher = better materials). A colony owning a tier-N tool meets
   *  a `toolTierRequired: N` build/craft gate (see `colonyToolTier`) and the harvest tool gate. */
  tier?: number;
  /**
   * Additive work boost while this tool is held (equipped or carried). `speed`/`yield` are ADDED to
   * the matching work category's `*_speed`/`*_yield` modifier (stats.jsonc) in getWorkModifiers — e.g.
   * a stone_pick {speed:0.5,yield:0.4} turns a 1.0 mining mult into 1.5 speed / 1.4 yield. The tool's
   * work category comes from Work.ts `toolsRequired`.
   */
  toolBoost?: { speed?: number; yield?: number };
  /** Per-tick durability lost to elemental exposure while a stack is loose/unsheltered. */
  deteriorationRate?: number;
  // Heat rating when burned as fuel (gates high-heat stations)
  fuelHeat?: number;

  // Food properties
  nutrition?: number;

  /** Alcohol: the one-shot mood lift granted when this drink is consumed; its presence marks the
   *  item as alcoholic (also applies a short `intoxicated` condition). 0/absent = sober. */
  intoxication?: number;

  /** Food poisoning: per-serving probability (0–1) this food gives a pawn nausea/dysentery when
   *  eaten. Absent ⇒ a sane default by category (raw meat high, crops/foraged mild, drinks low).
   *  Routed through the eater's `poison_resistance` (CON) and, for cooked dishes, scaled by the
   *  item's `rarity` → rarities.jsonc `poisonMult`. See pawnQueries. */
  poisonChance?: number;

  /** Meal buff: a transient condition stamped on the eater when this cooked meal is consumed (via
   *  pawnQueries.applyMealBuff → conditionTimers, like nausea/intoxication). `condition` is a
   *  conditions.jsonc id; `seconds` is its duration in authored seconds (≈12.5s = 1 in-game hr).
   *  Cooked dishes only — raw food carries none. */
  mealBuff?: { condition: string; seconds: number };

  /** Medicine quality 0–1 — added to a tend's treatment quality when consumed. */
  medicineQuality?: number;

  // Weight & volume for inventory capacity system
  weightKg?: number;
  volumeL?: number;
  /**
   * Bonus carry capacity granted while equipped (belt/back pouches, or a wheelbarrow/handcart held
   * in hand). Raises the pawn's normal weight/volume carry budget.
   */
  inventoryBonus?: { weightKg: number; volumeL: number };
  /**
   * Liquid-container items (waterskin/flask/jug). `holds` is the item id it carries (e.g. "water");
   * `capacityL` the max VOLUME of contents in litres — the held item's `volumeL` sets how many units fit
   * (water is 1 L/unit, so capacityL ≈ max units). A filled instance tracks its level in
   * `ItemInstance.contents`, and the contents' weight (held units × held weightKg) rides on top of the
   * empty container's own `weightKg` for carry/encumbrance. */
  container?: { holds: string; capacityL: number };
  /** Durability lost per combat hit when this item is equipped. */
  durabilityLossPerCombatHit?: number;
  // Typed stubs — no logic reads these yet:
  weatherResistance?: number;
  coldProtection?: number;
  heatProtection?: number;

  // Decay properties
  decaySeconds?: number; // in-game seconds until one unit of this item spoils
  decaysTo?: string; // itemId it becomes on decay; omit to simply vanish

  /**
   * Passive drying: this stack cures into `itemId` after `seconds` of exposure (ItemService.stepDrying).
   * `mode`: 'ambient' (default) cures where warm & dry, faster on a hay rack (effects.dryingBonus) /
   * by a fire; 'fire-ring' cures only within 2 tiles of a lit fire (firewood seasoning). An explicit
   * `null` opts an item out of an otherwise-matching CATEGORY drying rule (e.g. salted_meat).
   */
  driesTo?: { itemId: string; seconds: number; mode?: 'ambient' | 'fire-ring' } | null;

  // Requirements
  researchRequired?: string | null;
  level?: number;
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

  /**
   * Transient condition id(s) (conditions.jsonc, `magical: true`) granted while this item is worn.
   * Synced each tick by `PawnStateMachine.syncTransientConditions` into the pawn's
   * `transientConditions`, so the buff applies through the existing condition `modifiers` pipeline
   * and auto-clears on unequip. No bespoke stat-bonus system.
   */
  grantsConditions?: string[];
  /**
   * For a CONSUMABLE potion: how many turns its `grantsConditions` buff lasts once drunk (pushed as
   * a timed condition into `conditionTimers`). Absent on worn gear — that buff is
   * passive-while-equipped, no timer.
   */
  conditionDurationTurns?: number;
  /**
   * §2h(ii): consuming one of this item (a rare beast organ) PERMANENTLY grants this `traits.jsonc`
   * trait to the eater (pushed to `pawn.traits` + baked via `applyGainedTrait`) AND rolls a random
   * `negative` trait as a Faustian flaw — power with a price. Applied by `entities/Pawns.applyConsumable`
   * via the `useConsumableItem` command. One-shot; a no-op if the pawn already carries the trait.
   */
  grantsTraitOnConsume?: string;
  /** Magic-material affinity hook (e.g. "lunar"|"fire"|"earth") — quality/flavour edge now; a
   *  mana/affinity bonus later. Carried by ancient `magic_wood` species. */
  affinity?: string;

  // Item-specific properties
  weaponProperties?: {
    damage: number; // canonical base damage (before STR scaling); the one field the combat formula reads
    attackSpeed: number;
    range: number;
    damageType?: DamageType; // cutting | piercing | blunt
    damMin?: number; // minimum damage roll
    damMax?: number; // maximum damage roll
    reach?: number; // melee reach in tiles (1 = adjacent, 2 = pole-arm); a reach>1 weapon strikes a tile away and its wielder holds at that distance
    knockback?: number; // 0–1 BASE chance (before STR scaling) that a landed spear hit shoves the target back one tile — the displacement is code (Combat.performAttack), marked by the `staggered` condition. Reach polearms only.
    accuracy?: number; // added to hitChance formula
    armorPenetration?: number; // 0–1; fraction of armor reduction bypassed
    bluntMod?: number; // multiplier on knockdown chance (blunt weapons)
    stunChance?: number; // 0–1 FLAT chance to stun (knock down) the target on a hit, regardless of damage type — maces/hammers/heavy stocks. Adds on top of the blunt damage-based knockdown.
    armorDamage?: number; // armour CONDITION stripped per landed hit (× the attacker's armor_damage stat), SEPARATE from flesh damage. Hammers high, maces mid, cleavers ~0. Omitted = a sensible default by damageType (blunt > piercing > cutting).
    finesse?: boolean; // a FINESSE weapon (rapier/estoc): melee damage scales with PERCEPTION (precision/timing — finding the gap) instead of STRENGTH. Lets a high-PER duelist hit hard in melee, not just at range.
    arcane?: boolean; // an ARCANE weapon (elemental staff): damage scales with INTELLIGENCE instead of STRENGTH (mirrors `finesse`→PER).
    channeled?: boolean; // a CHANNELED ranged weapon (staff): fires with NO ammo, paying its `staminaCost` as MANA each shot, and is NOT self-consumed/dropped like a thrown weapon (it stays in hand). Bottoming out stamina latches `winded` = out of mana.
    critMod?: number; // added to the wielder's base hit_precision (0–1)
    twoHanded?: boolean; // requires both mainHand and offHand slots
    tags?: string[]; // ability grants
    ammoCategory?: string; // links a ranged weapon to its ammo (e.g. "arrow" | "bolt" | "sling_stone"); omit = no ammo (thrown weapons self-consume)
    reload?: number; // mechanical SPANNING multiplier on the aim_speed cadence (default 0→1×); a crossbow at 3 fires a third as often as a bow. See rangedCombat.aimIntervalTicks.
    strScaled?: boolean; // does damage scale with STR? (default true; crossbows/slings set false — mechanical advantage)
    /**
     * Draw weight / mechanical advantage of a LAUNCHER (bow/crossbow/sling): a multiplier on the
     * AMMUNITION's `damage` — the launcher itself deals ~no damage, the projectile does (set the
     * launcher's `damage`/`damMin`/`damMax` to 0). A war bow (1.7) drives the same arrow far harder than
     * a self bow (1.0); a crossbow (2.0) is all mechanism. Default 1.0. Thrown weapons ignore this (they
     * ARE the projectile and keep their own `damage`).
     */
    drawPower?: number;
    /** Visual: particle style for a THROWN weapon's flight ("spear"|"stone"). Launchers take theirs
     *  from the ammo instead; omitted = a sensible default by category. Purely cosmetic. */
    projectile?: string;
    // Natural-weapon fields (innate attacks rolled per swing):
    weight?: number; // relative roll frequency among an entity's natural weapons (default 1)
    staminaCost?: number; // stamina drained by this attack (default ATTACK_STAMINA_COST)
    /**
     * CREATURE-COMBAT-OVERHAUL §2c — wielding requirement (Battle-Brothers "heavy" weapons). A crude,
     * massive orc weapon needs raw muscle to swing WELL: a wielder with STR below `strength` still CAN
     * equip it but is driven the staged **`overmatched`** condition (PawnStateMachine `driveWieldStrain`,
     * scaled by the shortfall) — worse aim (hitChance), softer blows + less force (strength), harder to
     * dodge, and faster fatigue (drains stamina in a fight). An orc clears its own weapon's bar; a scrawny
     * colonist who loots it flails, and the condition shows as a pill so the player sees WHY. Absent =
     * anyone wields it fine. Gates by CAPABILITY, not by looting — you must field a STRONG pawn.
     */
    wieldRequirement?: { strength?: number };
  };

  /**
   * On-hit WOUND procs — flags stamped on the physical wound a landed hit opens (the INJURY layer,
   * parallel to `onHitCondition`'s condition layer). `{wound:'bloodletting', chance:0.3}` marks the
   * open wound unclottable (`Injury.bloodletting`) — it bleeds at full rate until a caretaker
   * DRESSES it. Raking claws, feeding fangs, deep-cutting blades.
   */
  onHitWound?: OnHitWound[];

  /**
   * On-hit CONDITION proc (venom/screech/tongue/blood-drain weapons). When a swing with this weapon
   * LANDS, roll `chance` (reduced by the defender's `resist` stat) to inflict `condition` as a
   * timed transient (via conditionTimers, like knockdown) for `durationHours`. ONE named type shared
   * with a trait's `onHitCondition` — Combat applies both through one path.
   */
  onHitCondition?: OnHitCondition;

  /**
   * PRODUCTION-CHAIN-IIII §2 — marks a consumable as a weapon COATING. `coatingEffect` is the on-hit
   * proc it lends the coated weapon (e.g. `envenomed`); `coatingDurationHours` is how long the coating
   * lasts on the blade once applied (in-game hours → an `expiresAtTurn` on the instance). The player
   * applies it to a pawn's mainHand via the `applyWeaponCoating` command (like drinking a potion).
   */
  coatingEffect?: OnHitCondition;
  coatingDurationHours?: number;

  /** Combat-SFX archetype (audio/manifest.ts `COMBAT_SFX`) played on each swing of this weapon or
   *  natural weapon — e.g. "slash" / "blunt" / "pierce" / "bow" / "bite" / "venom". Backend ref only;
   *  omitted = silent swing. Read by Combat → simLog.pushCombatSound. */
  audio?: string;

  /**
   * Tags an item as ammunition. Any ammo feeds any ranged weapon sharing its `ammoCategory`
   * (better ammo = better result). Ammo is a bulk consumable in pawn inventory, not an ItemInstance.
   */
  ammoProperties?: {
    ammoCategory: string; // "arrow" | "bolt" | "sling_stone"; matched against a weapon's weaponProperties.ammoCategory
    damage?: number; // the projectile's BASE damage — the real source of a shot's damage (× the launcher's drawPower, × STR for self-powered bows). The arrowhead, not the bow, kills.
    damageType?: DamageType; // wound type the projectile inflicts (broadhead → cutting/bleed, bodkin → piercing/AP); overrides the launcher's damageType for the shot
    damageBonus?: number; // legacy flat add on top of (damage × drawPower) (default 0)
    accuracyBonus?: number; // flat add to the hit roll (default 0)
    armorPen?: number; // added to the weapon's armorPenetration (default 0)
    recoverable?: number; // 0–1 chance to recover the spent projectile as a DroppedItem after a shot (default 0)
    projectile?: string; // visual: particle style of the flying shot ("arrow"|"bolt"|"stone"); omitted = default by ammoCategory. Cosmetic only.
  };

  /**
   * A worn item that speeds drawing AMMUNITION (a faster nock), NOT an ammo container — ammo rides
   * normal inventory by design. The slot it occupies (`armorProperties.equipmentSlot`) still drives
   * a realistic loadout trade-off: a BACK quiver blocks a backpack (bows lose general carry); a BELT
   * quiver leaves the back free. Carry rides the normal `inventoryBonus` (belt/back) channel.
   */
  quiver?: {
    ammoCategory: string; // which ammo bucket this quiver speeds ("arrow" | "bolt")
    /**
     * Fast-draw bonus folded into the `aim_speed` cadence (NOT a new stat) when this quiver's
     * `ammoCategory` matches the equipped weapon — nocking from a ready quiver beats fumbling a
     * shaft out of a pack. See `rangedCombat.drawSpeedModifier`.
     */
    drawSpeed: number;
  };

  /**
   * Flat aim boosts contributed by an EQUIPPED item — both a ranged weapon's own "personality" (a
   * war bow boosts `range`, a short bow `speed`, a crossbow `accuracy`) and worn marksman gear
   * (bracers/hood/cloak). Summed across ALL equipped slots in the ranged combat path (equipment
   * doesn't reach the stat engine, so these are read directly, NOT via `evaluateStat`).
   *   accuracy — flat hit-chance points added to the shot.
   *   speed    — fractional aim-cadence bonus (0.2 = aim 20% faster), stacks on the `aim_speed` stat.
   *   range    — flat tiles of effective reach added (still capped by visionRange).
   */
  aimBonuses?: {
    accuracy?: number;
    speed?: number;
    range?: number;
  };

  armorProperties?: {
    defense: number;
    /** The body parts this piece protects (limbmap part ids). Binary coverage — a mail shirt lists
     *  the shoulders, a plain vest does not. Omitted ⇒ the slot's default parts (SLOT_COVERAGE). */
    covers?: string[];
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
    coldResistance?: number; // 0–1: reduces cold exposure (hypothermia) while worn
    heatResistance?: number; // 0–1: reduces heat exposure (heat stroke) while worn
    /** STEALTH: flat stealth delta while worn — bonus OR penalty. When absent, a worn piece costs
     *  weight × ARMOR_WEIGHT_STEALTH_DRAG instead (core/stealth.ts), so only deliberately quiet
     *  (or deliberately loud) garments author it. */
    stealthMod?: number;
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

  /** §M material properties — present on a dynamic build/craft material (oak vs pine plank, granite
   *  vs marble block). Its `building`/`item` deltas shift the finished building's / crafted item's
   *  stats when this material fills a `category:` cost slot. Sourced by `core/materialProperties.ts`. */
  material?: MaterialProperty;
}

export interface CraftingInProgress {
  item: Item;
  quantity: number;
  startedAt: number;
  /** For dynamic recipes: maps slot key (e.g. "meat") → chosen itemId */
  selectedIngredients?: Record<string, string>;
  // Work-based crafting (produced by craftItem, consumed by JobService)
  id: string; // unique id for job correlation
  /** The EXACT producing recipe id. Set so completion/gating dispatch to THIS recipe rather than
   *  re-resolving by output item (getRecipeForItem = first-producer-wins, which shadows recipes that
   *  share an output — butchery keyed by carcass, blast-vs-finery steel…). Absent on legacy/simple
   *  orders → callers fall back to getRecipeForItem(item.id). */
  recipeId?: string;
  workRequired: number; // recipe.workAmount × quantity
  workDone: number; // accumulated work points
  // Reserve-and-fetch:
  /** Resolved input cost (× quantity) that must be physically staged on the station. */
  inputs: Record<string, number>;
  /** Queued without its inputs reserved yet (materials not in stock). A pending order generates no
   *  fetch/craft jobs and accrues no work; the engine retries reservation each tick and clears this
   *  flag once the full input set is reservable. */
  pending?: boolean;
  /** Workstation type required by the recipe (= recipe.station). */
  stationType?: string | null;
  /** Chosen workstation instance (PlacedBuilding.id) inputs are fetched to and crafted at. */
  stationBuildingId?: string;
  /** Paused by the player: generates no craft job and accrues no work (workDone preserved), and does
   *  not hold its station busy so later orders there can proceed. Materials still stage as normal. */
  paused?: boolean;
}
