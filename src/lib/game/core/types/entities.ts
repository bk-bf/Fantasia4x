// Live entities (mobs/animals) and the Pawn model. Split out of core/types.ts (P-4); re-exported
// via the barrel.

import type { EntityStats, StatKey, GrowthOffer, LineagePath } from './culture';
import type { EntityNeeds, EntityCondition, Injury, LimbState } from './health';
import type { PawnInventory, PawnEquipment, EquipmentSlot } from './items';
import type { Trait } from './culture';
import type { KinTie, MoodModifier, SocialBreak } from './social';

/** FSM state for a live entity. Hostile + neutral share one machine. */
export type MobState =
  // hostile mob states
  | 'Wander'
  | 'Alerted'
  | 'Attacking'
  | 'Fleeing'
  // goal-directed travel (KINGDOMS-TRADE): a party marching to a fixed destination (the colony)
  | 'Traveling'
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
  /** Per-spawn display name override. Set only on T5 bosses — a procedurally rolled legend name
   *  ("Skarn, the Old Fang", core/BossNames) so every boss is unique; ordinary mobs leave it undefined
   *  and read the creature def's generic name. Cold snapshot field (rolled once at spawn). */
  name?: string;
  entityClass: 'mob' | 'animal';
  /** Age in whole years, rolled at spawn (display-only flavour for the entity card — creatures don't
   *  grow). */
  age?: number;
  /** Biological sex — rolled 50/50 at spawn (unless the creature def fixes or opts out). Shown on
   *  the entity card. */
  sex?: 'male' | 'female';
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
  /** Transient: DroppedItem id of a ground carcass (rotten_carcass) this scavenger is walking to / eating.
   *  Set only while actively scavenging a carcass off the ground; cleared when eaten, gone, or interrupted. */
  carcassTargetId?: string;
  /** Tick when the hunter can re-enter Hunting state after a failed hunt. */
  huntCooldownUntil?: number;
  /** Tick when the entity can re-enter Foraging after finding no REACHABLE food tile — stops a
   *  boxed-in forager re-scanning/re-pathing (and re-logging) the same unreachable tile every tick. */
  forageCooldownUntil?: number;
  /** Turn the mob last ran its full FSM think (stepOne). Off-bubble it normally thinks every
   *  AI_THROTTLE_TICKS, but a nearby predator forces a per-tick threat-interrupt think — so the
   *  elapsed-tick scale for time-based accrual (eat progress, flee stamina) must be the ACTUAL gap
   *  `turn - lastThinkTick`, not a fixed AI_THROTTLE_TICKS (else an interrupted flee drains stamina
   *  60× too fast). In-bubble this is just the previous turn (gap 1). */
  lastThinkTick?: number;
  /** Committed flee destination (a distant safe tile). While fleeing the mob runs to THIS point,
   *  re-routing around blocks, and only re-picks when it arrives or the point stops being safe —
   *  so it can't flip direction each time the path ends (the flee-yoyo). */
  fleeDest?: { x: number; y: number };
  /** Origin tile of a NON-aggressive territorial charge (boar/aurochs/mammoth defending its space).
   *  Set when such a creature begins charging a too-close pawn; the chase is leashed to TERRITORIAL_LEASH
   *  tiles of this anchor so it's escapeable (the beast gives up + heads back instead of pursuing across
   *  the map). Cleared on disengage. Aggressive hunters never set it (they pursue to ~1.5× vision). */
  chaseAnchorX?: number;
  chaseAnchorY?: number;
  /** Last tile at which this mob actually HAD line-of-sight to a pawn. A mob can only START aggro on a
   *  pawn it can SEE (detection is LOS-gated — no chasing a target spotted through a wall); once it has
   *  seen one, it remembers this spot and presses to it when the pawn slips behind cover, abandoning the
   *  hunt there if it can't re-acquire. Cleared on disengage. AI-internal — not in the render snapshot. */
  lastSeenX?: number;
  lastSeenY?: number;
  /** Set while this mob is in an active alert episode against a colonist (entered Alerted on a pawn).
   *  Gates the one-shot `threatAlert` (auto-pause + chronicle pulse) so it fires once per episode, not
   *  every tick; cleared when the mob disengages back to Wander. AI-internal — not in the render snapshot. */
  alertedPawn?: boolean;
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
  /** Active transient condition ids (drives modifier lookups, same as Pawn). */
  transientConditions?: string[];
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
  /** §G effective light on the mob's tile 0–1, already night-vision-dampened (mobs read their creature
   *  def's nightVision). Stashed per tick; `sight` = eyeHealth × this. 1 = full light / full night vision. */
  effectiveLight?: number;
  /** Radius in tiles within which this mob auto-engages hostiles. */
  aggroRange?: number;
  /** Milliseconds remaining until next auto-attack fires. */
  attackCooldown?: number;
  /** Remaining turns for timer-based transient conditions (e.g. knockdown). */
  conditionTimers?: Record<string, number>;
  /** ADR-031 per-fight natural-hide wear: struck part id → armour points chipped off its natural soak
   *  (blunt/high-armorDamage blows erode a tank's hide so a sustained fight opens it up). Combat-internal
   *  scratch — expires HIDE_WEAR_RESET_TICKS after `hideWearAt`, never rendered, dropped from the
   *  snapshot projection. Written only on landed hits (no per-tick cost). */
  hideWear?: Record<string, number>;
  /** Tick of the last hide chip — wear older than the reset window reads as zero (fight over). */
  hideWearAt?: number;
  // ── CREATURE-COMBAT-OVERHAUL §2 variant gear ──────────────────────────────
  /** §2c a geared humanoid's worn loadout (drawn from its creature def's `lootPool` at spawn). Combat
   *  reads it exactly like a pawn's (via `'equipment' in entity`): the weapon drives the attack profile,
   *  worn armour soaks per covered part, pieces wear on hit and drop on death. Cold snapshot field. */
  equipment?: PawnEquipment;
  /** §2a per-spawn natural armour, rolled from the def's `naturalArmorRange`; overrides the def scalar
   *  in combat when present (individual elites vary in hide toughness). Worker-only — dropped from the
   *  snapshot projection. */
  naturalArmorOverride?: number;
  /** TRAIT-LIBRARY-EXPANSION §4.0 shared lines: trait defs this creature carries (resolved from the
   *  creature def's `traits` id list at spawn — e.g. orc_reaver's Adrenal S1). Mobs get the
   *  stat/resistance/weaponBonus/combatMods effects through the same `'traits' in entity` reads as
   *  pawns; pawn-only machinery (selfCondition pills, trait draw) ignores them. */
  traits?: Trait[];
  /** Player has queued this mob for hunting — drafted pawns with hunting work will prioritise it. */
  markedForHunt?: boolean;
  /** Player has tagged this mob for attention (generic marker, not task-specific). */
  marked?: boolean;
  // ── Territory / lair (ENTITIES_SPAWNING territory) ───────────────────────
  /** Stable id of the lair this mob's pack belongs to (`lair-<resource>-<x>-<y>`). Bound at spawn;
   *  a mob NEVER adopts another lair — so packs can't drift onto a neighbour's lair and reclaim it. */
  lairId?: string;
  /** Lair anchor tile + leash radius. The mob wanders and aggros only within `lairRange` tiles of
   *  (lairX,lairY); beyond it, it abandons the chase/forage and returns home. */
  lairX?: number;
  lairY?: number;
  lairRange?: number;
  // ── Kingdom parties (KINGDOMS-TRADE) ─────────────────────────────────────
  /** Kingdom this entity belongs to (visitor/caravan member). Harming it sours
   *  colony↔kingdom relations. Undefined = unaffiliated wildlife/monster. */
  kingdomId?: string;
  /** The visiting party (GameState.kingdomParties) this entity marched in with. */
  partyId?: string;
  /** Role within the party — the `trader` is the interaction target for barter. */
  partyRole?: 'trader' | 'guard' | 'visitor' | 'pack';
  /** SOCIAL-LAYER: when this party member IS a colony founder's off-colony relative, their tie in
   *  words ("Kael's sister") — shown on the selected-entity card. `name` carries the kin's name. */
  worldKinRelation?: string;
  /** 'Traveling' goal tile — the entity walks toward it, then settles (Wander) on arrival. */
  travelGoalX?: number;
  travelGoalY?: number;
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

/** A single player-issued order — the discriminated union that drives both the drafted executor
 *  (`_processDraftOrders`) and, when the pawn is undrafted, the FSM (`handleIdle`). Used as the
 *  `draftTarget` head and as the `manualQueue` entries. `forceJob`/`forceConsume`/`drink` are the
 *  "force a colony job / eat this / drink now" verbs (DRAFTED-JOB-ORDERS §3.1). */
export type PawnOrder =
  | { type: 'move'; x: number; y: number }
  | {
      type: 'attack';
      targetId: string;
      targetType: 'pawn' | 'mob';
      /** How to engage: 'melee' forces a ranged pawn to close and swing; 'ranged'/undefined =
       *  auto (shoot from range if it has a ranged weapon + viable ammo, else close to melee). */
      mode?: 'ranged' | 'melee';
    }
  | { type: 'haul'; x: number; y: number }
  | { type: 'equip'; dropId: string; x: number; y: number; slot?: EquipmentSlot | 'inventory' }
  | { type: 'rescue'; victimId: string; auto?: boolean }
  | { type: 'tend'; patientId: string; nextTendTurn?: number }
  /** Claim + work a specific ALREADY-GENERATED colony job to completion (harvest/craft/build/
   *  demolish/repair/refuel/plant/haul). Drafted: hand-driven in the executor; undrafted: claimed in
   *  `handleIdle` and run by the normal FSM work loop. */
  | { type: 'forceJob'; jobId: string }
  /** Eat a specific edible dropped item now, regardless of hunger level. FSM-driven (undrafted). */
  | { type: 'forceConsume'; dropId: string; x: number; y: number }
  /** Drink from the colony water at a tile now, regardless of thirst level. FSM-driven (undrafted). */
  | { type: 'drink'; x: number; y: number };

export interface Pawn {
  id: string;
  /** Sequential integer shown in debug mode next to the entity name. */
  debugId?: number;
  name: string;
  inventory: PawnInventory;
  equipment: PawnEquipment;
  /** Player-pinned item ids (by resourceId/itemId). A pinned carried item is never deposited during
   *  hauling — the pawn keeps it indefinitely — and pinned items sort to the top of the gear lists. */
  pinnedItems?: string[];
  // Individual stats (rolled from culture ranges)
  stats: EntityStats;

  // ===== PAWN-GROWTH: age + Battle-Brothers-style stat growth =====
  /** Per-stat ceilings this pawn can grow toward (rolled at generation, culture-derived, ~70–100 on
   *  favoured stats). A growth accept never lifts a stat above its cap. */
  maxStats?: EntityStats;
  /** The pawn's favoured ("talent-star") stats — a rolled 0–2 of them: higher caps AND biased to roll
   *  bigger growth gains. Some pawns have no innate talent; a rare few have two. */
  favStats?: StatKey[];
  /** Biological sex — rolled 50/50 at generation. Drives the gendered kin word (Father/Mother,
   *  Aunt/Uncle…) and shows in the Status tab / info panel. */
  sex?: 'male' | 'female';
  /** Age in whole years (rolled at generation; +1 each birthday). Shown in the Status tab. */
  age?: number;
  /** Fixed birthday as a 0-indexed day-of-year (0..359). On this day each year age++ and a guaranteed
   *  DOUBLED growth offer is banked. */
  birthDayOfYear?: number;
  /** Absolute season index (dayIndex/DAYS_PER_SEASON) in which this pawn last banked its seasonal
   *  growth — gates the "one seasonal growth per season" guarantee. */
  lastGrowthSeason?: number;
  /** Unresolved growth offers (season + birthday), oldest first. The player accepts two stats per
   *  offer in the Status tab; a non-empty queue shows a badge. */
  pendingGrowth?: GrowthOffer[];
  /** LINEAGES §4 — running deed counters (`ateRawMeat`, `kill:wolf`, `moonlightHours`…), incremented at
   *  the source event. The awakening meters read these. Sparse; absent until the pawn does a tracked deed. */
  deeds?: Record<string, number>;
  /** LINEAGES §4 — active awakening meters seeded by a standalone gateway trait. Each tracks progress
   *  toward one lineage; the player steers by which deeds the pawn performs, and the first to fill grants
   *  that lineage's parent at a growth event. Absent for pawns with no gateway (or already awakened). */
  lineagePaths?: LineagePath[];
  /** LINEAGES-II §1/§2 — cached from the trait carrying `bloodNeed` (set at pawn-gen / trait gain), so
   *  the per-tick paths gate on ONE field instead of scanning traits. Absent ⇒ no blood hunger. */
  bloodNeedKind?: 'carcass' | 'humanoid';
  /** LINEAGES-II §3 — cached "has grafted spinnerets" (set at pawn-gen / trait gain): the hourly silk
   *  trickle gates on this ONE field; the LIVING-part check only runs for flagged pawns. */
  silkSpinner?: boolean;

  // NEW: Individual physical traits
  physicalTraits: {
    height: number; // in cm
    weight: number; // in kg
    size: string; // inherited from culture
  };

  // NEW: Needs and state tracking
  needs: EntityNeeds;
  state: PawnState;

  // Culture identity — which pool culture this pawn was drawn from (mixed colonies).
  cultureId?: string;
  cultureName?: string;

  // KINGDOMS-TRADE / BACKGROUNDS — origin & life story.
  /** The polity this pawn was born into (a kingdom id). Drives seeded home-kingdom knowledge and the
   *  background pool. Undefined = a stateless founder (no fixed homeland). */
  homeKingdomId?: string;
  /** Childhood background id (backgrounds.jsonc). Every pawn has one. */
  childhoodId?: string;
  /** Adulthood background id (backgrounds.jsonc). Undefined for pawns under 18 — a childhood only. */
  adulthoodId?: string;
  /** Inherent standing carried by station/upbringing (a noble bears it even in rags), summed on top of
   *  equipped `prestigeBonus` by SocialService.getPrestige. Undefined = commoner (0). */
  basePrestige?: number;

  // SOCIAL-LAYER — family, event moods, breaks. All three object/array fields are snapshot COLD
  // (sim.worker PAWN_COLD): they change rarely and ship by ref-diff, so REPLACE on change, never
  // mutate in place.
  /** Shared family key — pawns of one family carry the same id (and surname). */
  familyId?: string;
  /** Blood ties to other pawns (colony kin) OR to off-colony people in `GameState.worldPawns`
   *  (the wider family web). Sparse — most colony pawns have a few. */
  kin?: KinTie[];
  /** OFF-COLONY kin only (records in `GameState.worldPawns`): the turn the colony last had word of
   *  them (a caravan visit). Undefined ⇒ never seen since the founder emigrated — the FAMILY view
   *  renders them greyed "as you last knew" (the KINGDOMS-TRADE staleness principle). Refreshed
   *  ONLY on a caravan/visitor arrival (daily-gated) — never touched per tick. */
  lastSeenTurn?: number;
  /** Event mood "thoughts" (grief, a hot meal, a breakup, an insult…) plus standing social bands
   *  (finely arrayed, working among friends…). Each is a signed point contribution to the mood TARGET
   *  (PawnService.computeMoodTarget) that mood eases toward — the expiring ones FADE to zero over their
   *  life (MOOD-REWORK). Pruned on the daily social pass. */
  moodModifiers?: MoodModifier[];
  /** Active mental break — the pawn refuses colony work until `until`. Set/cleared by the daily
   *  social pass; the FSM job-claim path gates on it. */
  socialBreak?: SocialBreak;

  /** The pawn's COMBINED trait set (ADR-023): its guaranteed cultural identity traits + 1–2 drawn from
   *  its culture's mundane pool + 0–2 personal traits — rolled PER PAWN, so same-culture pawns differ. */
  traits: Trait[];

  /** WORK-EXPERIENCE: experience LEVEL (1–50) per work category id — the BASE driver of the
   *  `*_speed`/`*_yield`/`*_quality` work stats (via the `SKILL` formula token). Seeded at pawn-gen
   *  (`seedWorkLevels`), raised by completing jobs (JobService → `applyWorkXp`). */
  skills: Record<string, number>;
  /** WORK-EXPERIENCE: XP progress within the CURRENT level, per work category (resets on level-up). */
  skillXp?: Record<string, number>;
  /** WORK-EXPERIENCE: innate speed↔finesse work style ∈ [−1, 1], fixed at generation.
   *  −1 = fast but rough, +1 = slow but fine; the rare near-0 all-rounder is good at both. */
  workStyle?: number;
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

  // Active transient condition ids (derived from state; drives UI cards and need rate modifiers)
  transientConditions?: string[];

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
  /** §G the pawn's SIGHT MULTIPLIER from light 0–1 (night-vision folded in): 1.0 at ≥50% effective light
   *  (no penalty), a linear ramp to a floor below that. Stashed once per tick in tickConditions; `sight` =
   *  eyeHealth × this, so darkness lowers sight everywhere (the Darkness condition surfaces it). */
  effectiveLight?: number;
  /** Milliseconds remaining until next auto-attack fires. */
  attackCooldown?: number;
  /** Radius in tiles within which this pawn auto-engages hostiles. */
  aggroRange?: number;
  /** Remaining turns for timer-based transient conditions (e.g. knockdown). */
  conditionTimers?: Record<string, number>;
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

  /**
   * How readily this pawn breaks off work to lie down and recover from wounds (the wound-recovery
   * drive — see `needsRecovery`):
   *  - 'never'   — never auto-rests; keeps working and accepts the slow active heal rate (emergencies).
   *  - 'shelter' — only rests if a bed/roofed shelter is reachable; otherwise keeps working.
   *  - 'always'  — (default) rests freely, lying on the bare ground if no bed/shelter is reachable.
   * Independent of normal fatigue sleep, which is unaffected by this setting.
   */
  restPolicy?: 'never' | 'shelter' | 'always';

  /** FORCE WORK (emergency): when true, the pawn neglects ALL needs — hunger, thirst, fatigue,
   *  hygiene and wound recovery — and keeps working, never breaking off to eat/drink/rest. Can drive
   *  a pawn to collapse or starve if left on; a deliberate, toggled override (PawnForceWork UI). */
  forceWork?: boolean;

  /** Mob id this pawn is actively hunting (work-driven, set when it picks up a
   *  `markedForHunt` target). Chased + attacked while currentState === 'Hunting'. */
  huntTargetId?: string;

  // ===== DRAFT MODE =====
  /** When true, pawn ignores jobs/needs and follows player orders. */
  drafted?: boolean;
  /** Current draft order: move to tile, attack target, haul a loose stack to a stockpile, fetch +
   *  equip a ground item, carry a downed ally to shelter, or rush emergency wound-care to a patient.
   *  For `haul`, x/y is the SOURCE tile; the pawn shuttles its carry-budget-worth to the nearest
   *  stockpile and back until the loose stack on that tile is cleared (multi-trip), then clears. For
   *  `equip`, the pawn walks to the drop's tile and, on arrival, either equips one unit into `slot`
   *  (or its auto-resolved slot when omitted) or — when `slot` is `'inventory'` — carries one unit in
   *  its pack (e.g. a tool kept in inventory so a weapon can stay in hand). Then clears.
   *  For `rescue`, the pawn walks to the COLLAPSED `victimId`, picks it up (the victim is set
   *  `carriedBy` this pawn and hidden — it travels inside the carrier, not as a floating glyph), hauls
   *  it to the nearest shelter and lays it down — exactly the pick-up→carry→drop shape of an item haul.
   *  For `tend`, the pawn walks adjacent to `patientId` and dresses its untended wounds ONE AT A TIME
   *  (worst/most-bleeding first, the same `tendPatient` the auto caretake job runs), pacing each tend
   *  off its `caretaking` work speed via `nextTendTurn`, then clears once no untended wound remains. */
  draftTarget?: PawnOrder;

  /** Pending MANUAL orders queued behind `draftTarget` (the active head). Shift-issuing an order
   *  appends here instead of replacing the head; when the head completes, `advancePawnOrders` pops the
   *  next entry into `draftTarget`. Reuses the same `PawnOrder` schema as the head. This is the "manual
   *  queue"; it always takes precedence over the pawn's AUTOMATIC pipeline (selectJobForPawn / jobQueue)
   *  and is only skipped when empty. Shared by drafted and undrafted pawns (DRAFTED-JOB-ORDERS §9). */
  manualQueue?: PawnOrder[];

  /** 0–1 fill for the on-map progress bar during a drafted `tend` (emergency care). The drafted tend is
   *  a draftTarget, not a WORKING job, so it has no `activeJob.progress`; this synthetic value (elapsed ÷
   *  per-wound work window) drives the same overlay the mob `eatProgress` uses. Set each tick while
   *  tending, cleared when the order finishes. */
  tendProgress?: number;

  /** When set, this (downed) pawn is being CARRIED by the pawn whose id this is. While carried the
   *  victim is hidden from the map (it rides inside the carrier as a `carried_pawn` inventory item —
   *  see systems/pawn/carry.ts) and its position is only restored when it's laid down at the shelter or
   *  the carry aborts. Lets the renderer skip the glyph/overlay so the body doesn't float behind. */
  carriedBy?: string;

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
    type: 'harvest' | 'construct' | 'craft' | 'haul' | 'fetch' | 'need' | 'deconstruct' | 'plant';
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
    startedTurn?: number; // turn the work job was claimed; used for debug job-duration logging
    targetState?: string; // for MovingToNeed, which state to enter on arrival
    turnsInState?: number; // for Eating/Sleeping duration tracking
    hungerToRecover?: number; // total hunger to restore over the eating duration
    depositX?: number; // haul / fetch: destination x for deposit / staging
    depositY?: number; // haul / fetch: destination y for deposit / staging
    /** ADR-009 step 2: when set, the pawn is detouring to grab the required tool BEFORE the job —
     *  targetX/targetY currently point at the tool's stockpile tile, and `siteX`/`siteY` is the real
     *  job tile to re-target once the tool is in hand. Cleared on pickup. */
    toolFetch?: { itemId: string; siteX: number; siteY: number };
  };
}
