import type { DamageType } from './health';
import type { OnHitCondition, OnHitWound } from './culture';
import type { PowerStat } from '../rules/body/powerScale';

export type ItemQuality = 0 | 1 | 2 | 3 | 4 | 5;

export interface ItemInstance {
  instanceId: string;
  itemId: string;
  durability: number;
  name?: string;
  quality?: ItemQuality;
  matWeight?: number;
  famed?: boolean;
  famedName?: string;
  famedHistory?: string;
  famedStatMult?: number;
  famedEnchants?: string[];
  contents?: VesselContent[];
  filter?: string[];
  coating?: WeaponCoating;
}

export interface VesselContent {
  itemId: string;
  litres?: number;
  amount?: number;
  instance?: ItemInstance;
  decayAcc?: number;
  drying?: number;
}

export interface WeaponCoating {
  itemId: string;
  expiresAtTurn: number;
}

export interface PawnInventory {
  items: Record<string, number>;
  instances: ItemInstance[];
  weightKg: number;
  maxWeightKg: number;
  volumeL: number;
  maxVolumeL: number;
}

export interface PawnEquipment {
  mainHand?: ItemInstance;
  offHand?: ItemInstance;
  head?: ItemInstance;
  bodyBase?: ItemInstance;
  bodyMid?: ItemInstance;
  bodyOuter?: ItemInstance;
  gloves?: ItemInstance;
  boots?: ItemInstance;
  socks?: ItemInstance;
  bracers?: ItemInstance;
  greaves?: ItemInstance;
  ring?: ItemInstance;
  ring2?: ItemInstance;
  amulet?: ItemInstance;
  belt?: ItemInstance;
  back?: ItemInstance;
  back2?: ItemInstance;
}

export interface EquippedItem {
  itemId: string;
  durability: number;
  maxDurability: number;
  bonuses?: Record<string, number>;
}

export type EquipmentSlot =
  | 'mainHand'
  | 'offHand'
  | 'head'
  | 'bodyBase'
  | 'bodyMid'
  | 'bodyOuter'
  | 'gloves'
  | 'boots'
  | 'socks'
  | 'bracers'
  | 'greaves'
  | 'ring'
  | 'ring2'
  | 'amulet'
  | 'belt'
  | 'back'
  | 'back2';

export interface DynamicIngredientSlot {
  acceptsCategory?: string;
  acceptsCategories?: string[];
  excludes?: string[];
  quantity: number;
  costFactor?: Record<string, number>;
  variants?: Record<
    string,
    {
      name?: string;
      description?: string;
      nutritionBonus?: number;
    }
  >;
  default?: { name?: string; description?: string };
}

export interface MaterialStatMods {
  durability?: number;
  beauty?: number;
  comfort?: number;
  insulation?: number;
  weight?: number;
}
export interface MaterialProperty {
  label: string;
  desc: string;
  building?: MaterialStatMods;
  item?: MaterialStatMods;
}

export interface Recipe {
  id: string;
  station?: string | null;
  inputs: Record<string, number>;
  inputAlternatives?: Record<string, number>[];
  outputs: Record<string, number>;
  workAmount: number;
  toolTierRequired?: number;
  toolRequirement?: { workType: string; minTier: number };
  discipline?: string;
  researchRequired?: string | null;
  populationRequired?: number;
  buildingRequired?: string | null;
  dynamicRecipe?: Record<string, DynamicIngredientSlot>;
  synthesized?: boolean;
  passive?: boolean;
}

export interface Item {
  craftValue?: number;

  prestigeBonus?: number;
  id: string;
  name: string;
  amount: number;
  dynamicName?: boolean;
  description?: string;
  charSpans?: Array<{ sheet?: string; id?: number; from?: number; to?: number; literal?: string }>;
  properties?: Record<string, any>;
  gatheringTypes?: string[];
  processingType?: string[];
  isCarcass?: boolean;
  yields?: Array<{
    item: string;
    min: number;
    max: number;
  }>;
  dynamicRecipe?: Record<string, DynamicIngredientSlot>;

  type:
    | 'material'
    | 'tool'
    | 'weapon'
    | 'armor'
    | 'consumable'
    | 'currency'
    | 'food'
    | 'container'
    | 'fluid';
  category: string;
  hidden?: boolean;

  emoji?: string;
  color?: string;

  maxValue?: number;
  passiveGeneration?: number;
  value?: number;

  craftingCost?: Record<string, number>;
  craftingCostAlternatives?: Record<string, number>[];
  craftingTime?: number;
  toolTierRequired?: number;
  buildingRequired?: string | null;
  workshopType?: string | null;
  populationRequired?: number;
  fuelValue?: number;
  burnDuration?: number;
  isCookingVessel?: boolean;
  components?: string[];

  durability?: number;
  maxDurability?: number;
  effects?: Record<string, number>;
  durabilityLossPerAction?: number;
  tier?: number;
  toolBoost?: { speed?: number; yield?: number };
  deteriorationRate?: number;
  fuelHeat?: number;

  nutrition?: number;

  hydration?: number;

  intoxication?: number;

  poisonChance?: number;

  mealBuff?: { condition: string; seconds: number };

  medicineQuality?: number;

  weightKg?: number;
  volumeL?: number;
  inventoryBonus?: { weightKg: number; volumeL: number };
  container?: {
    capacityL: number;
    capacityKg?: number;
    accepts?: string[];
    sealed?: boolean;
    material?: string;
  };
  durabilityLossPerCombatHit?: number;
  weatherResistance?: number;
  coldProtection?: number;
  heatProtection?: number;

  decaySeconds?: number;
  decaysTo?: string;

  driesTo?: { itemId: string; seconds: number; mode?: 'ambient' | 'fire-ring' } | null;

  level?: number;
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

  grantsConditions?: string[];
  conditionDurationTurns?: number;
  curesConditions?: string[];
  mendsWounds?: string[];

  preservationMethod?: 'smoked' | 'salted' | 'pickled' | 'aged' | 'sealed';
  grantsTraitOnConsume?: string;
  rawConsumeRisk?: { sickness?: string; flawChance?: number };

  grantsLineage?: true | string[];

  tradeRelationsMin?: number;
  traitGamble?: {
    tier: number;
    traitPool: string[];
    flawSeverity?: 'mild' | 'harsh';
  };
  affinity?: string;

  weaponProperties?: {
    damage: number;
    attackSpeed: number;
    range: number;
    damageType?: DamageType;
    damMin?: number;
    damMax?: number;
    reach?: number;
    knockback?: number;
    accuracy?: number;
    armorPenetration?: number;
    bluntMod?: number;
    stunChance?: number;
    armorDamage?: number;
    powerStat?: PowerStat;
    critMultiplier?: number;
    finesse?: boolean;
    arcane?: boolean;
    channeled?: boolean;
    critMod?: number;
    twoHanded?: boolean;
    weaponFamily?:
      | 'sword'
      | 'axe'
      | 'cleaver'
      | 'mace'
      | 'flail'
      | 'spear'
      | 'rapier'
      | 'dagger'
      | 'bow'
      | 'crossbow'
      | 'sling'
      | 'thrown'
      | 'staff';
    offHandable?: boolean;
    partPreference?: Record<string, number>;
    pierceThrough?: number;
    tags?: string[];
    ammoCategory?: string;
    reload?: number;
    strScaled?: boolean;
    drawPower?: number;
    projectile?: string;
    weight?: number;
    staminaCost?: number;
    wieldRequirement?: { strength?: number };
  };

  onHitWound?: OnHitWound[];

  onHitCondition?: OnHitCondition;

  coatingEffect?: OnHitCondition;
  coatingDurationHours?: number;

  audio?: string;

  ammoProperties?: {
    ammoCategory: string;
    damage?: number;
    damageType?: DamageType;
    damageBonus?: number;
    accuracyBonus?: number;
    armorPen?: number;
    armorDamage?: number;
    recoverable?: number;
    projectile?: string;
  };

  heldBy?: string[];

  quiver?: {
    ammoCategory: string;
    drawSpeed: number;
  };

  aimBonuses?: {
    accuracy?: number;
    speed?: number;
    range?: number;
  };

  armorProperties?: {
    defense: number;
    covers?: string[];
    armorType?: 'light' | 'medium' | 'heavy' | 'shield';
    slot?: EquipmentSlot;
    armorSet?: string;
    armorLayer?: 'gambeson' | 'mail' | 'plate';
    boneHealMultiplier?: number;
    armorValue?: number;
    fatiguePerTurn?: number;
    equipmentSlot?: EquipmentSlot;
    movementPenalty?: number;
    sightPenalty?: number;

    slashResistance?: number;
    crushResistance?: number;
    pierceResistance?: number;

    blockBonus?: number;
    parryChance?: number;
    bashStagger?: number;
    bashKnockback?: number;
    bashKnockdown?: number;
    bashDamage?: number;

    flexibility?: number;
    visionProtection?: number;
    fullBodyProtection?: number;

    coldResistance?: number;
    heatResistance?: number;
    stealthMod?: number;
    terrainBonus?: number;

    prestigeBonus?: number;
    intimidation?: number;

    mobility?: number;
    chargeBonus?: number;
  };

  consumableProperties?: {
    uses: number;
    consumeTime: number;
  };

  material?: MaterialProperty;
}

export interface CraftingInProgress {
  item: Item;
  quantity: number;
  startedAt: number;
  selectedIngredients?: Record<string, string>;
  id: string;
  recipeId?: string;
  workRequired: number;
  workDone: number;
  inputs: Record<string, number>;
  pending?: boolean;
  stationType?: string | null;
  stationBuildingId?: string;
  paused?: boolean;
}
