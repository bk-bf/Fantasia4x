// ===== PHASE 4 NEW TYPES =====

export type DesignationType =
	| 'harvest'
	| 'woodcut'
	| 'forage'
	| 'construct'
	| 'mine'
	| 'haul'
	| 'clear'
	| 'stockpile'
	// ── PRODUCTION-CHAIN-EXPANSION §D: water/hygiene zones ──
	| 'drink'
	| 'wash';

/** Zone types that support item-category filtering. */
// Paintable zone-instance types. 'harvest'/'stockpile' carry an item filter; 'drink'/'wash' are
// pure location designations (no filter) that pawns route to for thirst/hygiene.
export type FilterableZoneType = 'harvest' | 'stockpile' | 'drink' | 'wash';

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
	/**
	 * §B remaining durability of this stack. Starts at the item def's `maxDurability` (default 100)
	 * and counts DOWN by `deteriorationRate` each tick while loose/exposed; the stack is destroyed
	 * at 0. Halted entirely once `stored` (in a container / enclosed). Same pool tools wear from.
	 */
	durability?: number;
	/** §1 wood seasoning: accumulated drying seconds while within 2 tiles (not adjacent) of a lit fire. */
	drying?: number;
	/** §C per-stack spoilage clock (seconds, scaled by storage). At the def's decaySeconds, one unit rots. */
	decayAcc?: number;
	/** Present for tracked items (weapons, armour, tools with maxDurability). */
	instance?: ItemInstance;
}

export interface Job {
	id: string;
	type:
	| 'harvest'
	| 'construct'
	| 'haul'
	| 'craft'
	| 'eat'
	| 'sleep'
	| 'light'
	| 'refuel'
	| 'deconstruct';
	targetX: number;
	targetY: number;
	resourceId?: string; // harvest / haul: which resource
	droppedItemId?: string; // haul: which DroppedItem to pick up
	buildingId?: string; // construct: which PlacedBuilding.id
	craftQueueId?: string; // craft: which CraftingInProgress.id
	workRequired: number; // total work points to complete
	workDone: number; // accumulated progress
	claimedBy: string | null; // pawnId claiming this job; null = open
}

// ===== GAME STATE =====

export interface GameState {
	/** Deterministic RNG seed (P0-2). Persisted so a loaded save replays identically. */
	seed: number;
	turn: number;
	race: Race;
	item: Item[];
	worldMap: WorldTile[][];
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
	workAssignments: Record<string, WorkAssignment>;
	pawns: Pawn[];
	pawnStats: {}; // Record<pawnId, Record<statName, { value: number, sources: string[] }>>
	/** Per-workshop pawn assignment: key = workshopType, value = pawnId or null (any) */
	craftingStationAssignments?: Record<string, string | null>;
	/** Per-item crafting config: key = itemId */
	craftingOrderConfigs?: Record<
		string,
		{ amount: number; mode: 'once' | 'stockpile'; targetStockpile?: number }
	>;
	/** Phase 7: items dropped on the ground after harvesting, awaiting haulers */
	droppedItems?: DroppedItem[];
	/** Dead pawn records for colony history (SURVIVAL-HEALTH spec). */
	deadPawns?: DeadPawnRecord[];
	/** ENTITIES_SPAWNING Phase A: live hostile mobs + neutral animals on the map. */
	mobs?: Mob[];
	/** ENTITIES_SPAWNING Phase C: animals tamed and bound to a pawn. */
	tamedAnimals?: TamedAnimal[];
	/** Intactness (0–100) for each carcass item type currently in the stockpile. */
	carcassIntactness?: Record<string, number>;
	/** Accumulated decay-seconds per item type in the stockpile (for stepItemDecay). */
	stockpileDecaySeconds?: Record<string, number>;
	/**
	 * §B tool work-wear: accumulated durability spent per tool item id. When it reaches the
	 * tool's maxDurability, one tool of that type breaks (consumed) and the counter resets.
	 */
	toolWear?: Record<string, number>;
}

// ===== ENTITIES (ENTITIES_SPAWNING spec) =====

/** FSM state for a live entity. Hostile + neutral share one machine. */
export type MobState =
	// hostile mob states
	| 'Wander'
	| 'Alerted'
	| 'Attacking'
	| 'Fleeing'
	// neutral animal states
	| 'Grazing'
	| 'Startled'
	| 'Exhausted'
	| 'Tamed'
	// shared rest state
	| 'Sleeping'
	// hunger states (Phase B)
	| 'Foraging' // herbivore/omnivore moving to a grass tile to eat
	| 'Hunting' // carnivore/omnivore pursuing nearest animal or corpse
	| 'Eating' // actively consuming food (corpse or grass) — stays still
	// starvation: collapsed/incapacitated once hunger passes the collapse threshold
	| 'Collapsed'
	// shared terminal state
	| 'Corpse';

/**
 * A live entity instance on the map — either a hostile mob or a neutral animal.
 * `creatureId` references a CreatureDefinition in core/Creatures.ts (DB-driven).
 */
export interface Mob {
	id: string;
	/** Sequential integer shown in debug mode next to the entity name. */
	debugId?: number;
	creatureId: string;
	entityClass: 'mob' | 'animal';
	x: number;
	y: number;
	health: number;
	maxHealth: number;
	state: MobState;
	/** Anchor tile for grazing/wander home-range drift. */
	homeX: number;
	homeY: number;
	/** Tick when the FSM last changed state — drives timed transitions. */
	stateSince: number;
	/** Transient: pawn this entity is hunting or fleeing from. */
	targetPawnId?: string;
	// ── Shared path-based movement (same system as Pawn) ─────────────────────
	/** Queued 1-tile movement steps output by the FSM each tick. */
	path?: { x: number; y: number }[];
	/** Next step index into path[]. */
	pathIndex?: number;
	/** Remaining tick-budget cost to fully enter the next cell (sub-tile interp). */
	nextCellCostLeft?: number;
	/** Tick when the entity died (Corpse state) — used for decay timing. */
	diedAt?: number;
	// ── Shared pawn systems ───────────────────────────────────────────
	/** Hunger + fatigue accrual (same type as Pawn.needs). sleep fields are unused for mobs. */
	needs: EntityNeeds;
	/** Progressive conditions (wounds, malnutrition, etc.) — same system as Pawn. */
	conditions?: EntityCondition[];
	/** D&D-style stats mapped from CreatureDefinition at spawn. */
	stats: EntityStats;
	/** Progress 0–1 through current eat action (shown as progress bar). */
	eatProgress?: number;
	/** Target entity id when in Hunting state. */
	huntTargetId?: string;
	/** Tick when the hunter can re-enter Hunting state after a failed hunt. */
	huntCooldownUntil?: number;
	/** Consecutive ticks this mob has been unable to enter its next tile (blocked by
	 * another entity). Once it exceeds a threshold the path is dropped so the FSM
	 * re-routes around the obstruction instead of waiting forever (corridor deadlock). */
	blockedTicks?: number;
	// ── Survival & health (same system as Pawn) ──────────────────────────────
	/** Per-limb health state (same 6-limb model as Pawn). */
	limbs?: LimbState[];
	/** Blood volume 0–100; 0 = death by blood loss. Drains from limb bleed rates. */
	bloodVolume?: number;
	/** Maximum blood pool; derived from maxHealth (= con×5) at spawn. */
	maxBloodVolume?: number;
	/** Active status effect ids (drives modifier lookups, same as Pawn). */
	activeEffects?: string[];
	/** False once the mob dies. Stays in mobs[] as a Corpse for loot/butchering. */
	isAlive?: boolean;
	/**
	 * Fraction of the corpse not yet consumed (0–1). Set to 1.0 on death.
	 * Reduced by animals eating from it; scales loot yield when pawns butcher.
	 */
	intactness?: number;
	/** Skill levels — empty for primitive mobs; populated for sapient entities. */
	skills: Record<string, number>;
	/**
	 * Current stamina 0–maxStamina. Drains while fleeing; 0 = Exhausted.
	 * Derived from CON and DEX: 50 + (CON−10)×4 + (DEX−10)×2.
	 */
	stamina?: number;
	/** Maximum stamina pool for this mob. */
	maxStamina?: number;
	// ── Physical traits (same system as Pawn) ───────────────────────────────
	/** Height in cm, weight in kg, size category. */
	physicalTraits?: {
		height: number;
		weight: number;
		size: string;
	};
	/** All current open wounds; bleed/pain rolls up to root limb each turn. */
	injuries?: Injury[];
	/** Aggregate pain score 0–100; exceeding 80 causes collapse. */
	pain?: number;
	/** Radius in tiles within which this mob auto-engages hostiles. */
	aggroRange?: number;
	/** Milliseconds remaining until next auto-attack fires. */
	attackCooldown?: number;
	/** Remaining turns for temporary status effects (e.g. knockdown). */
	statusEffectDurations?: Record<string, number>;
	/** Player has queued this mob for hunting — drafted pawns with hunting work will prioritise it. */
	markedForHunt?: boolean;
	/** Player has tagged this mob for attention (generic marker, not task-specific). */
	marked?: boolean;
}

/** An animal tamed and bound to an owning pawn (Phase C+). */
export interface TamedAnimal {
	id: string;
	creatureId: string;
	ownerPawnId: string;
	x: number;
	y: number;
	health: number;
	maxHealth: number;
}
export interface WorkCategory {
	id: string;
	name: string;
	description: string;
	color: string;

	// Requirements
	toolsRequired?: string[];
	skillRequired?: string;

	// Efficiency modifiers
	primaryStat: keyof EntityStats;
	secondaryStat?: keyof EntityStats;

	// Base efficiency
	baseEfficiency: number;
}

export interface WorkAssignment {
	pawnId: string;
	/** @deprecated Use laborSettings instead. Legacy 0-10 scale. */
	workPriorities: Record<string, number>;
	/** Phase 5a: 5-level labor priorities (Celestia model). 0=disabled, 1=low, 2=normal, 3=high, 4=urgent */
	laborSettings?: Record<string, LaborLevel>;
	currentWork?: string;
}

// NEW: Individual pawn interfaces
export interface EntityNeeds {
	hunger: number; // 0-100, 100 = starving
	fatigue: number; // 0-100, 100 = exhausted
	sleep: number; // 0-100, 100 = must sleep
	lastSleep: number; // turn when last slept
	lastMeal: number; // turn when last ate
	// ── PRODUCTION-CHAIN-EXPANSION §D: water needs (optional; pawns only) ──
	thirst?: number; // 0-100, 100 = dehydrated
	hygiene?: number; // 0-100, 100 = filthy
	lastDrink?: number; // turn when last drank
	lastWash?: number; // turn when last washed
}

export interface StatusEffectDef {
	id: string;
	name: string;
	description: string;
	color: string;
	modifiers: {
		hungerRate?: number; // multiplier on hunger accrual (0 = paused, 0.33 = ⅓ rate)
		fatigueRate?: number; // multiplier on fatigue accrual
		workEfficiency?: number; // multiplier on work output
		moveSpeed?: number; // multiplier on movement steps per turn
	};
}

// ===== SURVIVAL & HEALTH TYPES (SURVIVAL-HEALTH spec) =====

/** An active progressive health condition on a pawn. */
export interface EntityCondition {
	id: string; // matches ConditionDef.id in conditions.jsonc
	severity: number; // 0.0–1.0; reaches lethalSeverity → pawn dies
}

export type LimbId = 'head' | 'torso' | 'left_arm' | 'right_arm' | 'left_leg' | 'right_leg';

export const CRITICAL_LIMBS: LimbId[] = ['head', 'torso'];

// ===== COMBAT BODY MODEL (COMBAT-SYSTEM spec) =====

export type DamageType = 'cutting' | 'piercing' | 'blunt';

export type BodyPartId =
	// ── Head region ──────────────────────────────────────────────────────────
	| 'skull'
	| 'jaw'
	| 'nose'
	| 'leftEye'
	| 'rightEye'
	| 'leftEar'
	| 'rightEar'
	| 'brain'
	// ── Torso ────────────────────────────────────────────────────────────────
	| 'chest'
	| 'abdomen'
	| 'heart'
	| 'leftLung'
	| 'rightLung'
	| 'liver'
	| 'stomach'
	| 'leftKidney'
	| 'rightKidney'
	| 'spine'
	// ── Left arm ─────────────────────────────────────────────────────────────
	| 'leftShoulder'
	| 'leftUpperArm'
	| 'leftForearm'
	| 'leftHand'
	| 'leftThumb'
	| 'leftIndexFinger'
	| 'leftMiddleFinger'
	| 'leftRingFinger'
	| 'leftLittleFinger'
	// ── Right arm ────────────────────────────────────────────────────────────
	| 'rightShoulder'
	| 'rightUpperArm'
	| 'rightForearm'
	| 'rightHand'
	| 'rightThumb'
	| 'rightIndexFinger'
	| 'rightMiddleFinger'
	| 'rightRingFinger'
	| 'rightLittleFinger'
	// ── Left leg ─────────────────────────────────────────────────────────────
	| 'leftHip'
	| 'leftUpperLeg'
	| 'leftLowerLeg'
	| 'leftFoot'
	| 'leftBigToe'
	| 'leftSecondToe'
	| 'leftMiddleToe'
	| 'leftFourthToe'
	| 'leftLittleToe'
	// ── Right leg ────────────────────────────────────────────────────────────
	| 'rightHip'
	| 'rightUpperLeg'
	| 'rightLowerLeg'
	| 'rightFoot'
	| 'rightBigToe'
	| 'rightSecondToe'
	| 'rightMiddleToe'
	| 'rightFourthToe'
	| 'rightLittleToe';

export interface Injury {
	bodyPart: BodyPartId;
	/** Wound type id from wounds.jsonc (cut | puncture | crush | burn). One wound per type per part. */
	type: 'cut' | 'fracture' | 'puncture' | 'crush' | 'burn';
	severity: 'minor' | 'serious' | 'critical' | 'destroyed';
	/** Accumulated HP of damage this wound has dealt to the part (same-type hits stack here). */
	damage: number;
	/** Blood volume drained per turn; clots below CLOT_FLOOR or via herbal_kit. */
	bleeding: number;
	painContribution: number;
	infected: boolean; // doubles pain + bleeding after 20 untreated turns
	treatedAt?: number; // turn when a caretaker last tended this wound
	/** Quality 0–1 of the most recent tend; scales heal speed, treatment duration, infection resistance. */
	treatmentQuality?: number;
}

/** State of a single fine body part (organ, bone, sub-limb). */
export interface BodyPartState {
	id: BodyPartId;
	/** Current hit points; seeded from BodyPartDef.maxHp. */
	health: number;
	maxHp: number;
	isMissing: boolean;
	injuries: Injury[];
}

export interface LimbState {
	id: LimbId;
	health: number; // 0–100; 0 = destroyed
	isMissing: boolean; // true after amputation
	bleedRate: number; // blood points drained per turn while >0
	/** Fine parts nested inside this root limb (organs, bones, fingers…). Hidden in UI until injured. */
	parts?: BodyPartState[];
}

/** A single severity stage within a ConditionDef. */
export interface ConditionStage {
	label: string;
	minSeverity: number;
	color: string;
	lifeThreatening?: boolean;
	modifiers: {
		workEfficiency?: number; // multiplier on work output
		moveSpeed?: number; // multiplier on movement
		hungerRate?: number; // multiplier on hunger accrual rate
		fatigueRate?: number; // multiplier on fatigue accrual rate
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
	cause:
		| 'malnutrition'
		| 'dehydration'
		| 'blood_loss'
		| 'critical_limb'
		| 'combat'
		| 'exhaustion_cascade'
		| 'infection';
	turn: number;
	stats: { strength: number; dexterity: number; intelligence: number };
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
	/** Sequential integer shown in debug mode next to the entity name. */
	debugId?: number;
	name: string;
	inventory: PawnInventory;
	equipment: PawnEquipment;
	// Individual stats (rolled from race ranges)
	stats: EntityStats;

	// NEW: Individual physical traits
	physicalTraits: {
		height: number; // in cm
		weight: number; // in kg
		size: string; // inherited from race
	};

	// NEW: Needs and state tracking
	needs: EntityNeeds;
	state: PawnState;

	// Reference to racial traits for bonuses
	racialTraits: RacialTrait[];

	skills: Record<string, number>; // skillId -> level
	currentWork?: string; // Current work category
	workLocation?: string; // Current work location

	// Phase 3: Map position and pathfinding
	position?: { x: number; y: number }; // tile coordinates; undefined until spawned
	path?: { x: number; y: number }[]; // queued movement path
	pathIndex?: number; // next step in path (index into path[])
	isMoving?: boolean; // currently following a path
	hasReachedDestination?: boolean; // just finished a path
	nextCellCostLeft?: number; // remaining tick-cost to enter the next path cell (RimWorld-style budget drain)

	// Active status effect ids (derived from state; drives UI cards and need rate modifiers)
	activeEffects?: string[];

	// ===== SURVIVAL & HEALTH (SURVIVAL-HEALTH spec) =====
	/** Active progressive health conditions (malnutrition, blood_loss, …). */
	conditions?: EntityCondition[];
	/** 6-limb health state. Initialized at pawn creation. */
	limbs?: LimbState[];
	/** Blood volume; 0 = dead. Starts at maxBloodVolume. */
	bloodVolume?: number;
	/**
	 * Maximum blood pool — derived from weight and constitution.
	 * Formula: round(weight × 1.4 + (CON − 10) × 2).
	 * A 70kg pawn with CON 10 ≈ 98; heavier/tougher pawns go up to ~140.
	 */
	maxBloodVolume?: number;
	/** False once a pawn dies — dead pawns stay in pawns[] but are skipped by all processing. */
	isAlive?: boolean;

	// ===== COMBAT (COMBAT-SYSTEM spec) =====
	/** All current open wounds; bleed/pain rolls up to root limb each turn. */
	injuries?: Injury[];
	/** Aggregate pain score 0–100; exceeding 80 causes collapse. */
	pain?: number;
	/** Milliseconds remaining until next auto-attack fires. */
	attackCooldown?: number;
	/** Radius in tiles within which this pawn auto-engages hostiles. */
	aggroRange?: number;
	/** Remaining turns for temporary status effects (e.g. knockdown). */
	statusEffectDurations?: Record<string, number>;
	/**
	 * Current stamina 0–maxStamina. Drains while fleeing/sprinting or attacking;
	 * regenerates at rest. Reaching 0 forces a rest turn (attack skipped / Exhausted).
	 * Derived from CON and DEX: 50 + (CON−10)×4 + (DEX−10)×2.
	 */
	stamina?: number;
	/** Maximum stamina pool for this pawn. */
	maxStamina?: number;
	// hunger and fatigue are flat 0–100 needs (no per-pawn pool); body size affects the
	// hunger *rate* via the `hunger_rate` stat, not a variable cap.

	// ===== COMBAT =====
	/**
	 * Auto-combat behaviour when a hostile is detected (COMBAT-SYSTEM):
	 *  - 'aggressive' — engage any hostile within vision range (approach + fight)
	 *  - 'defensive'  — (default) only fight once a hostile is adjacent / attacking
	 *  - 'flee'       — retreat as soon as a hostile enters vision range
	 * Undefined is treated as 'defensive'. Drafted pawns ignore this (player-driven).
	 */
	combatStance?: 'aggressive' | 'defensive' | 'flee';

	// ===== DRAFT MODE =====
	/** When true, pawn ignores jobs/needs and follows player orders. */
	drafted?: boolean;
	/** Current draft order: move to tile or attack target. */
	draftTarget?:
	| { type: 'move'; x: number; y: number }
	| { type: 'attack'; targetId: string; targetType: 'pawn' | 'mob' };

	// Phase 4/5: State machine primary state
	currentState?: string; // 'Idle' | 'Hungry' | 'Tired' | 'MovingToNeed' | 'MovingToResource' | 'Working' | 'Hauling' | 'MovingToDeposit' | 'Eating' | 'Sleeping' | 'Fighting' | 'Fleeing' | 'Dead'
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
		buildingId?: string; // for construct jobs
		craftQueueId?: string; // for craft jobs
		progress: number; // 0–1 fractional (local display)
		timeRequired: number;
		targetState?: string; // for MovingToNeed, which state to enter on arrival
		turnsInState?: number; // for Eating/Sleeping duration tracking
		hungerToRecover?: number; // total hunger to restore over the eating duration
		depositX?: number; // haul: destination x for deposit
		depositY?: number; // haul: destination y for deposit
	};
}

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
	mainHand?:  ItemInstance;
	offHand?:   ItemInstance;
	headBase?:  ItemInstance;
	headOuter?: ItemInstance;
	bodyBase?:  ItemInstance;
	bodyMid?:   ItemInstance;
	bodyOuter?: ItemInstance;
	gloves?:    ItemInstance;
	boots?:     ItemInstance;
	gorget?:    ItemInstance;
	ring?:      ItemInstance;
	belt?:      ItemInstance;
	back?:      ItemInstance;
}

/** @deprecated Use ItemInstance directly — EquippedItem kept for backward compat during migration. */
export interface EquippedItem {
	itemId: string;
	durability: number;
	maxDurability: number;
	bonuses?: Record<string, number>; // Applied bonuses
}

export type EquipmentSlot =
	| 'mainHand' | 'offHand'
	| 'headBase' | 'headOuter'
	| 'bodyBase' | 'bodyMid' | 'bodyOuter'
	| 'gloves' | 'boots' | 'gorget' | 'ring' | 'belt' | 'back';
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
	requiresLighting?: boolean; // must be lit before use (e.g. campfire)
	maxFuel?: number; // maximum fuel units it can hold
	fuelConsumptionRate?: number; // fuel units burned per turn when lit
	// ── PRODUCTION-CHAIN-EXPANSION §2/§5/§F: heat, flux, molds, storage ──
	conditionDecayPerTurn?: number; // §B: structural wear/turn for complete instances (0/undefined = never decays)
	tileCapacityBonus?: number; // refactor Stage 2: extra item capacity this building grants to its tile (§F storage)
	minFuelHeat?: number; // station won't operate below this fuel heat rating (§2)
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
}

export interface Item {
	id: string;
	name: string;
	amount: number;
	description?: string; // Optional description for lore or flavor text
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
		slot?: 'head' | 'chest' | 'legs' | 'feet' | 'hands' | 'offhand'
			| 'headBase' | 'headOuter' | 'bodyBase' | 'bodyMid' | 'bodyOuter'
			| 'gloves' | 'boots' | 'gorget' | 'ring' | 'belt' | 'back' | 'offHand';
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
	startedAt: number;
	/** For dynamic recipes: maps slot key (e.g. "meat") → chosen itemId */
	selectedIngredients?: Record<string, string>;
	// Phase 5d: work-based crafting (produced by craftItem, consumed by JobService)
	id: string; // unique id for job correlation
	workRequired: number; // craftingTime × 5
	workDone: number; // accumulated work points
	materialsReserved: boolean; // materials locked in stockpile?
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
		minStats?: Partial<EntityStats>;
		maxStats?: Partial<EntityStats>;
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
export interface EntityStats {
	strength: number;
	dexterity: number;
	intelligence: number;
	perception: number;
	charisma: number;
	constitution: number;
}

export interface RacialTrait {
	name: string;
	description: string;
	effects: {
		// Stat bonuses/penalties
		strengthBonus?: number;
		dexterityBonus?: number;
		intelligenceBonus?: number;
		perceptionBonus?: number;
		charismaBonus?: number;
		constitutionBonus?: number;
		strengthPenalty?: number;
		dexterityPenalty?: number;
		intelligencePenalty?: number;
		perceptionPenalty?: number;
		charismaPenalty?: number;
		constitutionPenalty?: number;

		// Work efficiency modifiers
		workEfficiency?: Record<string, number>; // workType -> speed multiplier
		workYield?: Record<string, number>; // workType -> harvest yield multiplier

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
		mentalResistance?: number;
		/** General damage reduction applied before type-specific resistances. */
		damageReduction?: number;
		/** Physical damage resistances (0–1; stacks with damageReduction). */
		blunt_resistance?: number;
		cutting_resistance?: number;
		piercing_resistance?: number;

		// Movement and physical
		movementSpeed?: number;
		swimmingSpeed?: number;

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

		// Environmental dependencies and sensitivities
		heatSensitivity?: number;
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
}

export interface Equipment {
	id: string;
	name: string;
	type: 'weapon' | 'armor' | 'accessory';
	stats: Partial<EntityStats>;
	magical?: boolean;
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
	/** Cached ambient + point-light brightness at this tile (0.1–1.6). Recomputed each turn. */
	lightLevel?: number;
	// A* scratch fields (reset before each pathfind, not persisted)
	gCost?: number;
	hCost?: number;
	fCost?: number;
	parent?: { x: number; y: number } | null;
}
