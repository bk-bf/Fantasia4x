import type { VesselContent } from './items';

export type DesignationType =
  | 'harvest'
  | 'woodcut'
  | 'forage'
  | 'construct'
  | 'mine'
  | 'haul'
  | 'clear'
  | 'dig'
  | 'stockpile'
  | 'drink'
  | 'wash'
  | 'grow'
  | 'restrict';

export type FilterableZoneType = 'harvest' | 'stockpile' | 'drink' | 'wash' | 'grow';

export type ZoneInstanceType = FilterableZoneType | 'restrict';

export interface ZoneFilter {
  allowedCategories: string[];
  blockedItems: string[];
}

export type ZonePriority = 'low' | 'normal' | 'preferred' | 'urgent';

export const ZONE_PRIORITY_RANK: Record<ZonePriority, number> = {
  low: 0,
  normal: 1,
  preferred: 2,
  urgent: 3
};

export interface ZoneInstance {
  id: string;
  type: ZoneInstanceType;
  label: string;
  filter: ZoneFilter;
  priority?: ZonePriority;
  containerBudget?: number;
  colorHidden?: boolean;
  assignedPawnIds?: string[];
}

export interface StockpileZone {
  id: string;
  name: string;
  tiles: string[];
  filter: ZoneFilter;
  inventory: Record<string, number>;
}

export interface FuelSettings {
  refuelThresholdPct?: number;
  allowedFuelItemIds?: string[];
  allowedRefuelPawnIds?: string[];
  paused?: boolean;
}

export interface RepairSettings {
  repairThresholdPct?: number;
  allowedMaterialItemIds?: string[];
  allowedRepairPawnIds?: string[];
  paused?: boolean;
}

export interface StorageSettings {
  allowedItemIds?: string[];
  priority?: ZonePriority;
}

export interface PlacedBuilding {
  id: string;
  type: string;
  x: number;
  y: number;
  status: 'planned' | 'under_construction' | 'complete';
  progress: number;
  paused?: boolean;
  materials?: Record<string, string>;
  workRequired?: number;
  workDone?: number;
  materialsDelivered?: boolean;
  fuel?: number;
  lit?: boolean;
  fireHeat?: number;
  burnFactor?: number;
  fuelItemIds?: string[];
  fuelSettings?: FuelSettings;
  storageSettings?: StorageSettings;
  repairSettings?: RepairSettings;
  deconstructQueued?: boolean;
  deconstructWorkRequired?: number;
  deconstructWorkDone?: number;
  assignedPawnId?: string;
  quality?: number;
  condition?: number;
  fluidContents?: VesselContent[];
}

export interface Building {
  id: string;
  name: string;
  description: string;

  emoji?: string;
  color?: string;
  charSpans?: Array<{ sheet?: string; id?: number; from?: number; to?: number; literal?: string }>;
  transparentBg?: boolean;

  walkable?: boolean;

  blocksSight?: boolean;

  notBuildable?: boolean;

  buildingCost: Record<string, number>;
  buildingCostAlternatives?: Record<string, number>[];
  workAmount: number;
  toolTierRequired: number;
  toolRequirement?: { workType: string; minTier: number };
  populationRequired: number;

  researchRequired: string | null;
  tier: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

  category:
    | 'housing'
    | 'production'
    | 'knowledge'
    | 'military'
    | 'food'
    | 'commerce'
    | 'magical'
    | 'exploration'
    | 'social'
    | 'furniture'
    | 'structure'
    | 'shelter';

  upkeepCost: Record<string, number>;

  effects: Record<string, number>;
  productionBonus: Record<string, number>;

  storageCapacity: Record<string, number>;
  storageFilter?: string[];

  buildingProperties?: {
    populationCapacity?: number;
    weatherProtection?: number;
    morale?: number;
    defenseBonus?: number;
    gathering?: boolean;
    gatheringLevel?: number;
    seat?: boolean;

    craftingSpeed?: number;
    qualityBonus?: number;
    efficiency?: number;
    specialization?: string[];

    knowledgeGeneration?: number;
    researchSpeed?: number;
    scholarCapacity?: number;

    defensiveStrength?: number;
    troopCapacity?: number;
    militaryTraining?: number;

    foodProduction?: number;
    preservationBonus?: number;
    nutritionBonus?: number;

    tradeBonus?: number;
    wealthGeneration?: number;
    marketCapacity?: number;

    magicalPower?: number;
    spellcasting?: number;
    enchantmentBonus?: number;

    temperatureControl?: number;
    weatherResistance?: number;
    naturalHarmony?: number;

    uniqueAbilities?: string[];
    passiveEffects?: Record<string, number>;
    activeAbilities?: Record<string, any>;
  };

  upgradeOptions?: {
    upgradeTo?: string;
    upgradeCost?: Record<string, number>;
    upgradeTime?: number;
    upgradeRequirements?: {
      research?: string;
      population?: number;
      toolLevel?: number;
    };
  };

  synergies?: {
    adjacencyBonus?: Record<string, number>;
    networkEffects?: Record<string, number>;
    chainBonus?: string[];
  };

  conditionalEffects?: {
    condition: string;
    effects: Record<string, number>;
  }[];

  buildingState?: {
    isUnique?: boolean;
    maxCount?: number;
    requiresLocation?: string;
    environmentalNeeds?: string[];
  };

  requiresLighting?: boolean;
  maxFuel?: number;
  fluidCapacityL?: number;
  fuelConsumptionRate?: number;
  lightRadius?: number;
  lightIntensity?: number;
  lightColor?: [number, number, number];
  conditionDecayPerTurn?: number;
  repairMaterials?: string[];
  tileCapacityBonus?: number;
  minFuelHeat?: number;
  passive?: boolean;
  terraformSubType?: string;
  fluxPerBatch?: number;
  moldRequired?: string;
  fuelRequirements?: {
    tinderItemId?: string;
    tinderAmount?: number;
  };
  defaultAllowedFuelItemIds?: string[];
  isStorage?: boolean;
  isRest?: boolean;

  itemInteractions?: {
    consumes?: Record<string, number>;
    produces?: Record<string, number>;
    transforms?: Record<string, string>;
    requires?: string[];
  };

  eventTriggers?: {
    onConstruction?: string[];
    onOperation?: string[];
    onUpgrade?: string[];
    onDestruction?: string[];
  };
}
