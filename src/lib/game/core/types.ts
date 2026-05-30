// ===== PHASE 4 NEW TYPES =====

export type DesignationType = 'harvest' | 'woodcut' | 'forage' | 'construct' | 'mine' | 'haul' | 'clear' | 'stockpile';

/** Zone types that support item-category filtering. */
export type FilterableZoneType = 'harvest' | 'stockpile';

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
	id: string;           // unique instance id
	type: string;         // building definition id (matches Building.id)
	x: number;
	y: number;
	status: 'planned' | 'under_construction' | 'complete';
	progress: number;     // 0–1 (legacy; use workDone/workRequired for placed buildings)
	paused?: boolean;     // construction paused by player
	// Phase 5c: work-point construction
	workRequired?: number;       // = buildDef.workAmount
	workDone?: number;           // accumulated work points
	materialsDelivered?: boolean; // materials consumed from stockpile?
	// Phase 6: fuel / lighting state
	fuel?: number;               // current fuel units remaining
	lit?: boolean;               // campfire is burning right now
	fuelSettings?: FuelSettings; // optional per-building refuel controls
	// Deconstruction
	deconstructQueued?: boolean;       // player has queued this building for demolition
	deconstructWorkRequired?: number;  // work points to demolish (½ workAmount)
	deconstructWorkDone?: number;      // accumulated demolition work points
	// Shelter assignment
	assignedPawnId?: string;           // pawn who owns this shelter; only they will use it
}

// ===== PHASE 5 NEW TYPES =====

/** Celestia-compatible 5-level labor priority. 0 = disabled. */
export type LaborLevel = 0 | 1 | 2 | 3 | 4;
export const LABOR_LEVEL = { DISABLED: 0, LOW: 1, NORMAL: 2, HIGH: 3, URGENT: 4 } as const;

/**
 * A discrete unit of work at a specific map location.
 * Generated each turn by JobService from designations, buildings, crafting queue.
 */
/** An item that has been harvested and dropped on the map, awaiting a hauler. */
export interface DroppedItem {
	id: string;
	resourceId: string;
	x: number;
	y: number;
	quantity: number;
	/** True when this item has been hauled and placed on a stockpile zone tile. */
	stored?: boolean;
}

export interface Job {
	id: string;
	type: 'harvest' | 'construct' | 'haul' | 'craft' | 'eat' | 'sleep' | 'light' | 'refuel' | 'deconstruct';
	targetX: number;
	targetY: number;
	resourceId?: string;    // harvest / haul: which resource
	droppedItemId?: string; // haul: which DroppedItem to pick up
	buildingId?: string;    // construct: which PlacedBuilding.id
	craftQueueId?: string;  // craft: which CraftingInProgress.id
	workRequired: number;   // total work points to complete
	workDone: number;       // accumulated progress
	claimedBy: string | null; // pawnId claiming this job; null = open
}

// ===== GAME STATE =====

export interface GameState {
	turn: number;
	race: Race;
	item: Item[];
	worldMap: WorldTile[][];
	discoveredLocations: Location[];
	/** @deprecated Use buildings[] instead */
	buildingCounts: Record<string, number>;
	/** Phase 4: physically placed buildings on the map */
	buildings: PlacedBuilding[];
	/** Phase 4: colony-level stockpile (harvested resources) — aggregate of all stockpileZones. */
	stockpile: Record<string, number>;
	/** Named stockpile zones; each tracks its own item inventory. */
	stockpileZones: StockpileZone[];
	/** Phase 4: designated tile actions keyed as "x,y" */
	designations: Record<string, DesignationType>;
	/** @deprecated Use zoneInstances instead. Legacy type-level filters for backward compat. */
	zoneFilters?: Partial<Record<FilterableZoneType, ZoneFilter>>;
	/** Named zone instances, each with their own filter. Replaces zoneFilters. */
	zoneInstances?: ZoneInstance[];
	/** Maps "x,y" tile keys to ZoneInstance.id for per-instance filter lookup. */
	designationZoneId?: Record<string, string>;
	/** Phase 5a: active job pool — regenerated each turn by JobService */
	jobs: Job[];
	buildingQueue: BuildingInProgress[];
	maxPopulation: number;
	availableResearch: string[];
	completedResearch: string[];
	currentResearch?: ResearchProject;
	discoveredLore: LoreItem[];
	_woodBonus?: number;
	_stoneBonus?: number;
	// inventory: Record<string, number>; // REMOVE THIS LINE
	equippedItems: {
		weapon: string | null;
		head: string | null;
		chest: string | null;
		legs: string | null;
		feet: string | null;
		hands: string | null;
	};
	craftingQueue: CraftingInProgress[];
	currentToolLevel: number;
	activeExplorationMissions: ExplorationMissionInProgress[];
	workAssignments: Record<string, WorkAssignment>;
	productionTargets: ProductionTarget[];
	pawns: Pawn[];
	currentJobIndex: Record<string, number>;
	pawnAbilities: {}; // Record<pawnId, Record<abilityName, { value: number, sources: string[] }>>
	/** Per-workshop pawn assignment: key = workshopType, value = pawnId or null (any) */
	craftingStationAssignments?: Record<string, string | null>;
	/** Per-item crafting config: key = itemId */
	craftingOrderConfigs?: Record<string, { amount: number; mode: 'once' | 'stockpile'; targetStockpile?: number }>;
	/** Phase 7: items dropped on the ground after harvesting, awaiting haulers */
	droppedItems?: DroppedItem[];
	/** Dead pawn records for colony history (SURVIVAL-HEALTH spec). */
	deadPawns?: DeadPawnRecord[];
}
export interface WorkCategory {
	id: string;
	name: string;
	description: string;
	emoji: string;
	color: string;

	// Requirements
	toolsRequired?: string[];
	skillRequired?: string;
	locationTypesRequired?: string[]; // Location types where this work can be done

	// Efficiency modifiers
	primaryStat: keyof RaceStats;
	secondaryStat?: keyof RaceStats;

	// Base efficiency
	baseEfficiency: number;
}

export interface WorkAssignment {
	pawnId: string;
	/** @deprecated Use laborSettings instead. Legacy 0-10 scale. */
	workPriorities: Record<string, number>;
	/** Phase 5a: 5-level labor priorities (Celestia model). 0=disabled, 1=low, 2=normal, 3=high, 4=urgent */
	laborSettings?: Record<string, LaborLevel>;
	authorizedLocations: string[];
	activeLocation?: string;
	currentWork?: string;
}

export interface ProductionTarget {
	id: string; // Unique identifier
	workCategoryId: string;
	locationId: string;
	resourceTargets: Record<string, number>; // resourceId -> percentage (0-100)
	assignedPawns: string[]; // Pawn IDs assigned to this production
}
// NEW: Individual pawn interfaces
export interface PawnNeeds {
	hunger: number; // 0-100, 100 = starving
	fatigue: number; // 0-100, 100 = exhausted
	sleep: number; // 0-100, 100 = must sleep
	lastSleep: number; // turn when last slept
	lastMeal: number; // turn when last ate
}

export interface StatusEffectDef {
	id: string;
	name: string;
	description: string;
	color: string;
	modifiers: {
		hungerRate?: number;      // multiplier on hunger accrual (0 = paused, 0.33 = ⅓ rate)
		fatigueRate?: number;     // multiplier on fatigue accrual
		workEfficiency?: number;  // multiplier on work output
		moveSpeed?: number;       // multiplier on movement steps per turn
	};
}

// ===== SURVIVAL & HEALTH TYPES (SURVIVAL-HEALTH spec) =====

/** An active progressive health condition on a pawn. */
export interface PawnCondition {
	id: string;        // matches ConditionDef.id in conditions.jsonc
	severity: number;  // 0.0–1.0; reaches lethalSeverity → pawn dies
}

export type LimbId = 'head' | 'torso' | 'left_arm' | 'right_arm' | 'left_leg' | 'right_leg';

export const CRITICAL_LIMBS: LimbId[] = ['head', 'torso'];

export interface LimbState {
	id: LimbId;
	health: number;      // 0–100; 0 = destroyed
	isMissing: boolean;  // true after amputation
	bleedRate: number;   // blood points drained per turn while >0
}

/** A single severity stage within a ConditionDef. */
export interface ConditionStage {
	label: string;
	minSeverity: number;
	color: string;
	lifeThreatening?: boolean;
	modifiers: {
		workEfficiency?: number;  // multiplier on work output
		moveSpeed?: number;       // multiplier on movement
		hungerRate?: number;      // multiplier on hunger accrual rate
		fatigueRate?: number;     // multiplier on fatigue accrual rate
	};
}

/** A multi-stage progressive health condition definition (from conditions.jsonc). */
export interface ConditionDef {
	id: string;
	name: string;
	description: string;
	lethalSeverity: number;
	stages: ConditionStage[];
}

/** Record appended to gameState.deadPawns when a pawn dies. */
export interface DeadPawnRecord {
	name: string;
	cause: 'malnutrition' | 'blood_loss' | 'critical_limb' | 'combat' | 'exhaustion_cascade';
	turn: number;
	stats: { strength: number; dexterity: number; intelligence: number; };
}

export interface PawnState {
	mood: number; // 0-100, affects work efficiency
	/** @deprecated Use pawn.conditions for health tracking. Kept for backwards compatibility. */
	health?: number;
	isWorking: boolean;
	isSleeping: boolean;
	isEating: boolean;
}

export interface Pawn {
	id: string;
	name: string;
	inventory: PawnInventory;
	equipment: PawnEquipment;
	// Individual stats (rolled from race ranges)
	stats: RaceStats;

	// NEW: Individual physical traits
	physicalTraits: {
		height: number; // in cm
		weight: number; // in kg
		size: string; // inherited from race
	};

	// NEW: Needs and state tracking
	needs: PawnNeeds;
	state: PawnState;

	// Reference to racial traits for bonuses
	racialTraits: RacialTrait[];

	skills: Record<string, number>; // skillId -> level
	currentWork?: string; // Current work category
	workLocation?: string; // Current work location

	// Phase 3: Map position and pathfinding
	position?: { x: number; y: number };       // tile coordinates; undefined until spawned
	path?: { x: number; y: number }[];          // queued movement path
	pathIndex?: number;                          // next step in path (index into path[])
	isMoving?: boolean;                          // currently following a path
	hasReachedDestination?: boolean;            // just finished a path
	nextCellCostLeft?: number;                   // remaining tick-cost to enter the next path cell (RimWorld-style budget drain)

	// Active status effect ids (derived from state; drives UI cards and need rate modifiers)
	activeEffects?: string[];

	// ===== SURVIVAL & HEALTH (SURVIVAL-HEALTH spec) =====
	/** Active progressive health conditions (malnutrition, blood_loss, …). */
	conditions?: PawnCondition[];
	/** 6-limb health state. Initialized at pawn creation. */
	limbs?: LimbState[];
	/** Blood volume 0–100. 0 = dead. Slowly regenerates when not bleeding. */
	bloodVolume?: number;
	/** False once a pawn dies — dead pawns stay in pawns[] but are skipped by all processing. */
	isAlive?: boolean;

	// Phase 4/5: State machine primary state
	currentState?: string;                       // 'Idle' | 'Hungry' | 'Tired' | 'MovingToNeed' | 'MovingToResource' | 'Working' | 'Hauling' | 'MovingToDeposit' | 'Eating' | 'Sleeping' | 'Dead'
	/** Soft-preview of the next up-to-4 unclaimed job IDs the pawn would take after activeJob.
	 *  Not claimed — used only for need-priority lookahead in the state machine. */
	jobQueue?: string[];

	// Job payload for active state machine job
	activeJob?: {
		/** Phase 5: 'harvest'|'construct'|'craft'|'haul' use work-point jobs; 'need' for eat/sleep */
		type: 'harvest' | 'construct' | 'craft' | 'haul' | 'need' | 'deconstruct';
		/** Phase 5a: id of the Job in gameState.jobs[] (null for need-type jobs) */
		jobId?: string;
		targetX: number;
		targetY: number;
		resourceId?: string;
		droppedItemId?: string; // haul: id of the DroppedItem being picked up
		buildingId?: string;    // for construct jobs
		craftQueueId?: string;  // for craft jobs
		progress: number;       // 0–1 fractional (local display)
		timeRequired: number;
		targetState?: string;   // for MovingToNeed, which state to enter on arrival
		turnsInState?: number;  // for Eating/Sleeping duration tracking
		hungerToRecover?: number; // total hunger to restore over the eating duration
		depositX?: number;      // haul: destination x for deposit
		depositY?: number;      // haul: destination y for deposit
	};
}

export interface PawnInventory {
	items: Record<string, number>; // itemId -> quantity
	maxSlots: number;
	currentSlots: number;
}

export interface PawnEquipment {
	weapon?: EquippedItem;
	armor?: EquippedItem;
	tool?: EquippedItem;
	accessory?: EquippedItem;
}

export interface EquippedItem {
	itemId: string;
	durability: number;
	maxDurability: number;
	bonuses?: Record<string, number>; // Applied bonuses
}
export type EquipmentSlot = 'weapon' | 'armor' | 'tool' | 'accessory';
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

	// Construction requirements
	buildingCost: Record<string, number>; // Renamed from 'cost' to match item system
	workAmount: number;
	toolTierRequired: number; // Matches item system progression
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
	requiresLighting?: boolean;  // must be lit before use (e.g. campfire)
	maxFuel?: number;            // maximum fuel units it can hold
	fuelConsumptionRate?: number; // fuel units burned per turn when lit
	fuelRequirements?: {
		requiredFuelTypes?: number;
		tinderItemId?: string;
		tinderAmount?: number;
	};
	isStorage?: boolean;         // colonists can retrieve food/items here
	isRest?: boolean;            // colonists can sleep here

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

// Fixed: Remove duplicate Tool interface - Item interface covers this
export interface Item {
	id: string;
	name: string;
	amount: number;
	description?: string; // Optional description for lore or flavor text
	properties?: Record<string, any>;
	workTypes?: string[]; // Work categories this item can be used in

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
	craftingTime?: number;
	toolTierRequired?: number;
	buildingRequired?: string | null;
	workshopType?: string | null;  // Phase 5d: building type required to craft (e.g. 'forge')
	populationRequired?: number;
	// Phase 6: fuel / container / cooking properties
	fuelValue?: number;          // fuel units added when used as campfire fuel
	isContainer?: boolean;       // acts as a storage container
	storageCapacity?: number;    // max items stored
	preservationBonus?: number;  // 0–1, reduces food spoilage rate
	isCookingVessel?: boolean;   // required in stockpile to cook stews
	components?: string[];       // for dynamic stew crafts: ingredient item ids

	// Item properties (durability, effects, etc.)
	durability?: number;
	maxDurability?: number;
	effects?: Record<string, number>;

	// Food properties
	nutrition?: number; // Dedicated nutrition value for food items

	// Requirements
	researchRequired?: string | null;
	level?: number;
	rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

	// Item-specific properties
	weaponProperties?: {
		damage: number;
		attackSpeed: number;
		range: number;
	};

	armorProperties?: {
		defense: number;
		armorType: 'light' | 'medium' | 'heavy' | 'shield';
		slot: 'head' | 'chest' | 'legs' | 'feet' | 'hands' | 'offhand';
		movementPenalty: number; // 0.0 to 1.0, where 0.3 = 30% movement penalty

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
		coldResistance?: number;
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
export interface BuildingInProgress {
	building: Building;
	turnsRemaining: number;
	startedAt: number;
}
export interface CraftingInProgress {
	item: Item; // The item being crafted
	quantity: number; // How many are being crafted
	turnsRemaining: number;       // legacy countdown (kept for backward compat)
	startedAt: number;
	// Phase 5d: work-based crafting
	id?: string;                  // unique id for job correlation
	workRequired?: number;        // craftingTime × 5
	workDone?: number;            // accumulated work points
	materialsReserved?: boolean;  // materials locked in stockpile?
}
export interface ResearchProject {
	id: string;
	name: string;
	description: string;
	category: 'knowledge' | 'crafting' | 'building' | 'military' | 'exploration' | 'social';
	tier: number;
	currentProgress?: number;

	// Prerequisites
	prerequisites: string[];

	// Scroll Requirements (replaces knowledgeCost)
	scrollRequirement?: Record<string, number>; // bark_scrolls, hide_scrolls, parchment, etc.

	// Material Requirements (actual crafting materials)
	materialRequirement?: Record<string, number>; // copper_ingot, iron_ore, etc.

	// Building and Tool Requirements
	buildingRequired?: string;
	toolRequirement?: string;
	toolTierRequired?: number; // Matches item system

	// Population Requirements
	populationRequired?: number;

	// Stat Requirements
	statRequirements?: {
		minStats?: Partial<RaceStats>;
		maxStats?: Partial<RaceStats>;
	};

	// Lore bypass system
	loreItemRequired?: string;
	canBypassWithLore: boolean;

	// What this research unlocks
	unlocks: {
		toolTierRequired?: number; // Matches item system naming
		buildingLevel?: number;
		armyLevel?: number;
		weaponLevel?: number;
		buildings?: string[];
		items?: string[]; // Items unlocked by this research
		abilities?: string[]; // Abilities unlocked
		effects?: Record<string, number>; // Stat bonuses and effects
	};

	// Research timing
	researchTime: number;
}

export interface LoreItem {
	id: string;
	name: string;
	description: string;
	type: 'scroll' | 'tome' | 'artifact' | 'manual' | 'fragment';
	researchUnlocks: string[];
	discoveryWeight: number;
}
export interface RaceStats {
	strength: number;
	dexterity: number;
	intelligence: number;
	wisdom: number;
	charisma: number;
	constitution: number;
}

export interface RacialTrait {
	name: string;
	description: string;
	icon: string; // NEW: Add icon property
	effects: {
		// Stat bonuses/penalties
		strengthBonus?: number;
		dexterityBonus?: number;
		intelligenceBonus?: number;
		wisdomBonus?: number;
		charismaBonus?: number;
		constitutionBonus?: number;
		strengthPenalty?: number;
		dexterityPenalty?: number;
		intelligencePenalty?: number;
		wisdomPenalty?: number;
		charismaPenalty?: number;
		constitutionPenalty?: number;

		// Work efficiency modifiers
		workEfficiency?: Record<string, number>; // workType -> multiplier

		// Needs modifiers
		hungerRate?: number;
		fatigueRate?: number;
		sleepEfficiency?: number;

		// Resistances and special abilities
		fireResistance?: number;
		coldResistance?: number;
		poisonResistance?: number;
		diseaseResistance?: number;
		magicResistance?: number;
		damageReduction?: number;

		// Movement and physical
		movementSpeed?: number;
		swimmingSpeed?: number;
		fallDamageReduction?: number;

		// Special abilities
		nightVision?: number;
		tremorsense?: number;
		waterBreathing?: number;
		telepathicRange?: number;

		// Social and mental
		intimidation?: number;
		groupBonus?: number;
		groupPenalty?: number;
		isolationPenalty?: number;

		// Misc effects
		healingRate?: number;
		experienceGain?: number;
		productionBonus?: number;
		adaptability?: number;
		memoryBonus?: number;
		errorReduction?: number;
		dangerSense?: number;

		// Time-based effects
		daytimePenalty?: number;
		sunlightDependency?: number;

		// Combat effects
		combatRage?: number;

		// Environmental dependencies
		heatSensitivity?: number;
		coldImmunity?: number;
	};
}

export interface Race {
	id: string;
	name: string;

	// NEW: Stat ranges instead of fixed stats
	statRanges: Record<string, [number, number]>; // stat name -> [min, max]

	// NEW: Physical trait ranges
	physicalTraits: {
		heightRange: [number, number]; // in cm
		weightRange: [number, number]; // in kg
		size: 'tiny' | 'small' | 'medium' | 'large' | 'huge';
	};

	// NEW: Typed racial traits
	racialTraits: RacialTrait[];

	population: number;
	implications: Record<string, string>;
}

export interface Equipment {
	id: string;
	name: string;
	type: 'weapon' | 'armor' | 'accessory';
	stats: Partial<RaceStats>;
	magical?: boolean;
}
export interface Location {
	id: string;
	name: string;
	description: string;
	type:
	| 'plains'
	| 'hills'
	| 'forest'
	| 'swamp'
	| 'mountains'
	| 'river'
	| 'ruins'
	| 'caves'
	| 'magical_forest'
	| 'legendary_mountains'
	| 'special'
	| 'volcanic'
	| 'seasonal';
	tier: number; // 0-2, matching item/building progression
	rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
	discovered: boolean;

	// Available resources by tier
	availableResources: {
		tier0: string[]; // Basic materials
		tier1: string[]; // Advanced materials
		tier2: string[]; // Rare/legendary materials
	};

	// Work efficiency modifiers
	workModifiers: Record<string, number>; // jobType -> multiplier

	// Exploration requirements
	explorationRequirements: {
		population?: number;
		tools?: string[];
		research?: string[];
		buildings?: string[];
	};

	// Dangers and features
	hazards: string[];
	specialFeatures: string[];

	// Visual representation
	emoji: string;
	color: string;
}

export interface ExplorationMissionInProgress {
	id: string;
	name: string;
	description: string;
	targetLocation: string;
	explorersRequired: number;
	toolsRequired: string[];
	suppliesRequired: Record<string, number>;
	duration: number;
	successChance: number;
	riskLevel: 'low' | 'medium' | 'high' | 'extreme';

	// Progress tracking
	startedAt: number; // Turn when mission started
	turnsRemaining: number;
	progress: number; // 0-1 completion percentage
}

export interface WorldTile {
	x: number;
	y: number;
	type: 'land' | 'water' | 'mountain' | 'forest';
	discovered: boolean;
	ascii: string;
	// Phase 2 — rich terrain
	terrainType: string;
	subType: string;
	density: number;
	moisture: number;
	temperature: number;
	movementCost: number;
	walkable: boolean;
	resources: Record<string, number>;
	/** resourceId → turn number when that resource finishes regrowing (persistent resources). */
	resourceCooldowns?: Record<string, number>;
	territoryOwner: string;
	// A* scratch fields (reset before each pathfind, not persisted)
	gCost?: number;
	hCost?: number;
	fCost?: number;
	parent?: { x: number; y: number } | null;
}
