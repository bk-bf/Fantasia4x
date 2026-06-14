// Live entities (mobs/animals) and the Pawn model. Split out of core/types.ts (P-4); re-exported
// via the barrel.

import type { EntityStats } from './race';
import type { EntityNeeds, EntityCondition, Injury, LimbState } from './health';
import type { PawnInventory, PawnEquipment } from './items';
import type { RacialTrait } from './race';

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
  /** Committed flee destination (a distant safe tile). While fleeing the mob runs to THIS point,
   *  re-routing around blocks, and only re-picks when it arrives or the point stops being safe —
   *  so it can't flip direction each time the path ends (the flee-yoyo). */
  fleeDest?: { x: number; y: number };
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
  /** Consecutive ticks blocked behind another body. Past MAX_BLOCKED_TICKS the path is
   *  dropped so the FSM re-routes around the obstruction (idle-pawn-on-approach deadlock). */
  blockedTicks?: number;

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
  /** False once a pawn dies. Dead pawns are finalised (corpse + gear dropped, deadPawns
   *  recorded) and then reaped from pawns[] at end of turn so they leave the UI. */
  isAlive?: boolean;
  /** Set true once a dead pawn has been finalised (corpse/gear dropped, deadPawns recorded).
   *  Guards the end-of-turn reaper against double-dropping a corpse for the same death. */
  corpseDropped?: boolean;

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

  /** Mob id this pawn is actively hunting (work-driven, set when it picks up a
   *  `markedForHunt` target). Chased + attacked while currentState === 'Hunting'. */
  huntTargetId?: string;

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

  /**
   * ADR-016: when this pawn is carrying fetched inputs for a craft order, the order id. Set on
   * fetch pickup, read at deposit so the items are staged ON that order's station (tagged
   * `reservedFor`) instead of dropped at the nearest stockpile; cleared after staging. Survives
   * need interrupts so a paused carry still completes.
   */
  carryingForOrder?: string;

  // Job payload for active state machine job
  activeJob?: {
    /** Phase 5: 'harvest'|'construct'|'craft'|'haul'|'fetch' use work-point jobs; 'need' for eat/sleep */
    type: 'harvest' | 'construct' | 'craft' | 'haul' | 'fetch' | 'need' | 'deconstruct';
    /** Phase 5a: id of the Job in gameState.jobs[] (null for need-type jobs) */
    jobId?: string;
    targetX: number;
    targetY: number;
    resourceId?: string;
    droppedItemId?: string; // haul / fetch: id of the DroppedItem being picked up
    buildingId?: string; // for construct jobs; fetch: the station building
    craftQueueId?: string; // craft / fetch: the order id (used to tag staged inputs)
    progress: number; // 0–1 fractional (local display)
    timeRequired: number;
    targetState?: string; // for MovingToNeed, which state to enter on arrival
    turnsInState?: number; // for Eating/Sleeping duration tracking
    hungerToRecover?: number; // total hunger to restore over the eating duration
    depositX?: number; // haul / fetch: destination x for deposit / staging
    depositY?: number; // haul / fetch: destination y for deposit / staging
  };
}
