export interface GameState {
	turn: number;
	race: Race;
	item: Item[];
	worldMap: WorldTile[][];
	discoveredLocations: Location[];
	buildingCounts: Record<string, number>;
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
	workPriorities: Record<string, number>; // workCategoryId -> priority (0-10)
	authorizedLocations: string[]; // Location IDs where pawn can work
	activeLocation?: string; // Currently working location
	currentWork?: string; // Current work category
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

export interface PawnState {
	mood: number; // 0-100, affects work efficiency
	health: number; // 0-100, affects everything
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

	// Construction requirements
	buildingCost: Record<string, number>; // Renamed from 'cost' to match item system
	buildTime: number;
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
	| 'social';

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
	populationRequired?: number;

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
	turnsRemaining: number;
	startedAt: number;
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
}
