// Zones, designations, and building types. Split out of core/types.ts (P-4); re-exported via the
// barrel.

export type DesignationType =
  | 'harvest'
  | 'woodcut'
  | 'forage'
  | 'construct'
  | 'mine'
  | 'haul'
  | 'clear'
  // ── PRODUCTION-CHAIN-II §F: dig — strip a fertile tile for its soil (the harvest-vs-cut twin) ──
  | 'dig'
  | 'stockpile'
  // ── PRODUCTION-CHAIN-EXPANSION §D: water/hygiene zones ──
  | 'drink'
  | 'wash'
  // ── PRODUCTION-CHAIN-II §F: growing zone — pawns sow the zone's seed onto eligible soil ──
  | 'grow';

/** Zone types that support item-category filtering. */
// Paintable zone-instance types. 'harvest'/'stockpile' carry an item filter; 'drink'/'wash' are
// pure location designations (no filter) that pawns route to for thirst/hygiene; 'grow' carries a
// seed filter (which crop to plant).
export type FilterableZoneType = 'harvest' | 'stockpile' | 'drink' | 'wash' | 'grow';

/**
 * DF-style category filter for a zone type.
 * An empty `allowedCategories` means "allow everything".
 */
export interface ZoneFilter {
  /** Item categories that are allowed. Empty = no filter (all categories pass). */
  allowedCategories: string[];
  /** Specific item IDs to block regardless of their category. */
  blockedItems: string[];
}

/** A named, individually-filterable zone instance (e.g. "Forage 1", "Stockpile 2"). */
export interface ZoneInstance {
  id: string;
  type: FilterableZoneType;
  label: string;
  filter: ZoneFilter;
  /** View-only: when true, this zone's tint is suppressed on the map. Persisted with the save. */
  colorHidden?: boolean;
}

/**
 * A named stockpile zone. Items physically live here — the colony aggregate
 * (GameState.stockpile) is always the sum of all zone inventories.
 * A zone with an empty `tiles` array is a virtual/non-spatial zone (catch-all).
 */
export interface StockpileZone {
  id: string;
  name: string;
  /** "x,y" map tile keys that belong to this zone. */
  tiles: string[];
  filter: ZoneFilter;
  /** Items stored here. Sum across all zones == GameState.stockpile. */
  inventory: Record<string, number>;
}

export interface FuelSettings {
  /** Refuel only when current fuel is below this percentage (0-100). */
  refuelThresholdPct?: number;
  /** Restrict fuel inputs to these item IDs. Empty/undefined means any fuel item. */
  allowedFuelItemIds?: string[];
  /** Restrict refuel jobs to these pawn IDs. Empty/undefined means any pawn. */
  allowedRefuelPawnIds?: string[];
  /** When true, no new refuel jobs are generated for this building. */
  paused?: boolean;
}

export interface PlacedBuilding {
  id: string; // unique instance id
  type: string; // building definition id (matches Building.id)
  x: number;
  y: number;
  status: 'planned' | 'under_construction' | 'complete';
  progress: number; // 0–1 (legacy; use workDone/workRequired for placed buildings)
  paused?: boolean; // construction paused by player
  // Phase 5c: work-point construction
  workRequired?: number; // = buildDef.workAmount
  workDone?: number; // accumulated work points
  materialsDelivered?: boolean; // materials consumed from stockpile?
  // Phase 6: fuel / lighting state
  fuel?: number; // current fuel units remaining
  lit?: boolean; // campfire is burning right now
  fuelSettings?: FuelSettings; // optional per-building refuel controls
  // Deconstruction
  deconstructQueued?: boolean; // player has queued this building for demolition
  deconstructWorkRequired?: number; // work points to demolish (½ workAmount)
  deconstructWorkDone?: number; // accumulated demolition work points
  // Shelter assignment
  assignedPawnId?: string; // pawn who owns this shelter; only they will use it
  // Quality from construction work stat
  quality?: number; // 0.1–2.0+ multiplier from construction_quality stat
  // §B/refactor Stage 1: per-instance structural condition.
  /** 0–100; 100 = pristine. Decays for buildings with a def `conditionDecayPerTurn`; restored by repair. Undefined = treat as full. */
  condition?: number;
}

export interface Building {
  id: string;
  name: string;
  description: string;

  // Visual representation
  emoji?: string;
  color?: string;
  /** Glyph source descriptors for map rendering (resolved via resolveCharSpans). */
  charSpans?: Array<{ sheet?: string; id?: number; from?: number; to?: number; literal?: string }>;
  /** Foreground color [r, g, b] 0–1 for map tile. */
  fg?: [number, number, number];
  /** Background color [r, g, b] 0–1 for map tile. */
  bg?: [number, number, number];

  /** Whether pawns/mobs can enter this building's tile. Defaults to true (passable
   *  furniture, spots, beds, doors). Set false for solid structures — walls, furnaces,
   *  fires — so a COMPLETED one blocks movement and pathfinding routes around it. Blueprints
   *  stay walkable; the flag is applied to the tile only on completion, restored on deconstruct
   *  (worldMap.walkable is persisted, so it survives save/load). */
  walkable?: boolean;

  /** Whether a COMPLETED building blocks combat line-of-sight (RANGED-COMBAT Part VII). Set true ONLY
   *  for walls — a campfire/furnace/window is non-walkable but see-through, so this is independent of
   *  `walkable`. Baked onto the tile's `blocksSight` flag on completion, cleared on deconstruct. */
  blocksSight?: boolean;

  // Construction requirements
  buildingCost: Record<string, number>; // Renamed from 'cost' to match item system
  workAmount: number;
  toolTierRequired: number; // Matches item system progression
  /** ADR-009 step 2 — craft-tool gate: a pawn must carry a qualifying tool to WORK a craft job at
   *  this station (mirrors resources.jsonc's harvest `toolRequirement`). The recipe's station maps
   *  here; a per-recipe `Recipe.toolRequirement` overrides it. Omitted = station needs no tool. */
  toolRequirement?: { workType: string; minTier: number };
  populationRequired: number;

  // Prerequisites
  researchRequired: string | null;
  tier: number; // Technology level (0-2) matching item progression
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

  // Building categories - expanded for comprehensive system
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

  // Operational costs and maintenance
  upkeepCost: Record<string, number>; // Daily/periodic resource consumption

  // Building effects and bonuses
  effects: Record<string, number>; // General effects (populationCapacity, weatherProtection, etc.)
  productionBonus: Record<string, number>; // Specific item production bonuses

  // Storage capabilities
  storageCapacity: Record<string, number>; // Storage for different item categories

  // Building-specific properties
  buildingProperties?: {
    // Housing properties
    populationCapacity?: number;
    weatherProtection?: number;
    morale?: number;
    defenseBonus?: number;

    // Production properties
    craftingSpeed?: number;
    qualityBonus?: number;
    efficiency?: number;
    specialization?: string[]; // What this building specializes in

    // Knowledge properties
    knowledgeGeneration?: number;
    researchSpeed?: number;
    scholarCapacity?: number;

    // Military properties
    defensiveStrength?: number;
    troopCapacity?: number;
    militaryTraining?: number;

    // Food properties
    foodProduction?: number;
    preservationBonus?: number;
    nutritionBonus?: number;

    // Commerce properties
    tradeBonus?: number;
    wealthGeneration?: number;
    marketCapacity?: number;

    // Magical properties
    magicalPower?: number;
    spellcasting?: number;
    enchantmentBonus?: number;

    // Environmental effects
    temperatureControl?: number;
    weatherResistance?: number;
    naturalHarmony?: number;

    // Special abilities
    uniqueAbilities?: string[];
    passiveEffects?: Record<string, number>;
    activeAbilities?: Record<string, any>;
  };

  // Upgrade system
  upgradeOptions?: {
    upgradeTo?: string; // ID of upgraded building
    upgradeCost?: Record<string, number>;
    upgradeTime?: number;
    upgradeRequirements?: {
      research?: string;
      population?: number;
      toolLevel?: number;
    };
  };

  // Building interactions
  synergies?: {
    adjacencyBonus?: Record<string, number>; // Bonuses when built near specific buildings
    networkEffects?: Record<string, number>; // Bonuses based on number of similar buildings
    chainBonus?: string[]; // Buildings that enhance this one's effects
  };

  // Conditional requirements and effects
  conditionalEffects?: {
    condition: string; // e.g., "population > 50", "has_building:marketplace"
    effects: Record<string, number>;
  }[];

  // Building state management
  buildingState?: {
    isUnique?: boolean; // Can only build one
    maxCount?: number; // Maximum number allowed
    requiresLocation?: string; // Specific terrain/location requirements
    environmentalNeeds?: string[]; // Environmental requirements
  };

  // Phase 6: fire / storage / rest semantics
  requiresLighting?: boolean; // must be lit before use (e.g. campfire)
  maxFuel?: number; // maximum fuel units it can hold
  fuelConsumptionRate?: number; // fuel units burned per turn when lit
  // ── Dynamic point lighting (data-driven; see LightingService / EnvironmentService) ──
  /** Falloff radius in tiles. PRESENCE is the toggle: any building with `lightRadius` emits
   *  light (no per-building code). A fuelled building (maxFuel>0) only glows while `lit`; a
   *  fuel-free one glows whenever complete. */
  lightRadius?: number;
  /** Peak additive light strength at the source. Defaults to the fire intensity (1.1). */
  lightIntensity?: number;
  /** Normalised RGB light colour [r,g,b] 0–1. Defaults to warm fire [1.0, 0.55, 0.22]. */
  lightColor?: [number, number, number];
  // ── PRODUCTION-CHAIN-EXPANSION §2/§5/§F: heat, flux, molds, storage ──
  conditionDecayPerTurn?: number; // §B: structural wear/turn for complete instances (0/undefined = never decays)
  tileCapacityBonus?: number; // refactor Stage 2: extra item capacity this building grants to its tile (§F storage)
  minFuelHeat?: number; // station won't operate below this fuel heat rating (§2)
  passive?: boolean; // ADR-016: a furnace that transforms loaded inputs over time with no pawn job
  /** PRODUCTION-CHAIN-II §F (Soil Works): a one-shot terraform build. On completion it rewrites the
   *  tile's `subType` to this subterrain (raising soil fertility) and then removes itself — "replace
   *  the dirt". Handled in jobs/construct.complete. */
  terraformSubType?: string;
  fluxPerBatch?: number; // limestone flux consumed per smelt batch (bloomery, §5)
  moldRequired?: string; // clay/metal mold consumed/worn per cast (§5/§G)
  fuelRequirements?: {
    requiredFuelTypes?: number;
    tinderItemId?: string;
    tinderAmount?: number;
  };
  isStorage?: boolean; // colonists can retrieve food/items here
  isRest?: boolean; // colonists can sleep here

  // Integration with item system
  itemInteractions?: {
    consumes?: Record<string, number>; // Items consumed during operation
    produces?: Record<string, number>; // Items produced over time
    transforms?: Record<string, string>; // Item transformation recipes
    requires?: string[]; // Specific items needed for operation
  };

  // Event system integration
  eventTriggers?: {
    onConstruction?: string[]; // Events triggered when built
    onOperation?: string[]; // Events triggered during operation
    onUpgrade?: string[]; // Events triggered when upgraded
    onDestruction?: string[]; // Events triggered when destroyed
  };
}
