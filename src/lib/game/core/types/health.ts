// Survival, needs, transient conditions, and the combat body model. Split out of core/types.ts (P-4);
// re-exported via the barrel. (SURVIVAL-HEALTH + COMBAT-SYSTEM specs.)

import type { KinTie } from './social';

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
  /** SEASONS_WEATHER: how soaked the pawn is, 0-100. Accrues on wet (>50%) tiles / rain, dries by
   *  temperature + shelter. High wetness amplifies cold (hypothermia) and dampens heat (heat stroke). */
  wetness?: number;
  /** SEASONS_WEATHER: tracked cold exposure 0-100 (NOT instantaneous). Lags toward the environmental
   *  cold past the comfort band (after resistance/wetness) and drains when comfortable/sheltered — the
   *  value that drives hypothermia onset/recovery. Mutually exclusive with `heatExposure`. */
  coldExposure?: number;
  /** SEASONS_WEATHER: tracked heat exposure 0-100 (mirror of `coldExposure`); drives heat stroke. */
  heatExposure?: number;
  /** LINEAGES-II §1/§2 — blood hunger 0–100, only on pawns whose trait carries `bloodNeed`. Fills over
   *  days (hourly cadence); sated by carcass-eating (werewolf) or feeding on a colonist (vampiric).
   *  At 100 the `bloodthirst` condition seizes the pawn into the lose-control hunt. */
  bloodHunger?: number;
  /** SOCIAL — recreation/company meter 0–100 (INVERTED vs the survival needs: 100 = well-entertained,
   *  0 = starved for company). Decays slowly each tick; recovered by SOCIALISING at a gathering place.
   *  Low fun seeds a mood debuff and drives the pawn to seek the fire. */
  fun?: number;
  /** Turn the pawn last socialised (for cadence/analytics; stripped from the snapshot). */
  lastSocialise?: number;
}

/**
 * A transient condition (conditions.jsonc, `"duration": "transient"`). Re-derived from the pawn's
 * live state every tick (PawnStateMachine.syncTransientConditions) and stored as plain ids in
 * `pawn.transientConditions`; it appears/clears on its own when its cause does — no severity, no
 * stages. The persistent counterpart is {@link ConditionDef} (`"duration": "persistent"`).
 */
export interface TransientConditionDef extends ConditionGraphFields {
  id: string;
  name: string;
  /** Discriminant against {@link ConditionDef}: `true` for a transient condition. Persistent
   *  conditions omit it (treated as `false`). A plain bool — no string parsing. */
  transient: true;
  description: string;
  color: string;
  /** Sprite-sheet glyph for the condition icon (same shape as Item/Building.charSpans). */
  charSpans?: Array<{ sheet?: string; id?: number; from?: number; to?: number; literal?: string }>;
  /** Internal condition: never surfaced in any UI (pills, needs panel…). Its modifiers still apply.
   *  Used for FSM-driven states like eating/sleeping that would duplicate info already shown. */
  hidden?: boolean;
  /**
   * PRODUCTION-CHAIN-II §M — marks a magically-sourced condition (a passive buff granted by attuned
   * gear, and later by MAGIC-SKILLS spells/skill nodes through the SAME pipeline). Cosmetic/lore +
   * a future dispel/anti-magic hook; the modifiers apply exactly like any other transient condition.
   */
  magical?: boolean;
  /** When true, the condition pops a floating combat-text label (its `name`, in its `color`) the
   *  first tick it appears on an entity — surfaced by Combat (timer/combat-driven ids) or
   *  syncTransientConditions (sync-derived ids). Opt-in: unflagged conditions never float. */
  floater?: boolean;
  /** Combat-SFX cue (audio/manifest.ts `COMBAT_SFX`) played the tick this condition latches in combat
   *  — e.g. knockdown/envenomed/ensnared. Backend ref only; read by Combat → simLog.pushCombatSound. */
  audio?: string;
  /** Limbmap part ids that HOST this utility condition's benefit (wings → gliding_membrane's
   *  moveSpeed), so the pill (and its effect) drops when every host part is gone. ADR-029: natural
   *  weapons/armour no longer live on conditions — this gate now serves utility conditions only. */
  hostParts?: string[];
  /** Data-driven onset for a NEED-threshold transient (e.g. `tired` at fatigue ≥ 100). The deriving
   *  code (pawn syncTransientConditions / mob entityLifecycle) reads the threshold from HERE rather than
   *  a hardcoded constant, so designers tune it in the data and pawns + mobs can't drift. The behavioural
   *  suppression ("not while sleeping") stays in code; this is purely the need + cutoff. */
  needOnset?: { need: string; atOrAbove: number };
  /** Status-animation priority: when an entity has several conditions that each want to play their own
   *  glyph float (the ↓/Zzz over the sprite), the HIGHEST priority wins so the most important state shows
   *  (e.g. `collapse` must beat `winded`). Default 0 (no glyph / lowest). Read via `conditionPriority`. */
  priority?: number;
  /** When active, forces the pawn's FSM into this state and gates all other behaviour — the
   *  data-driven link between a condition and FSM incapacitation. Value is a PAWN_STATE name (typed
   *  `string` because `core/` must not depend on `systems/`). First user: `collapse` → "Collapsed";
   *  the precedent for future condition-driven FSM states. */
  fsmState?: string;
  /** Timed "aftermath" chain: when THIS condition's timer runs out, stamp `to` for `durationHours`
   *  in-game hours. The generic primitive behind a rage → exhaustion trade-off (berserk → berserk_spent).
   *  Stamped in `tickConditionTimers` at the tick the timer hits 0. */
  onExpiry?: { to: string; durationHours: number };
  /** The meter edge that fires THIS condition, when a pawn is eligible for it (a trait names the
   *  condition via `triggeredCondition`). The trigger REQUIREMENTS live here on the condition, not on
   *  the granting trait: when the pawn's `meter` reaches `atOrAbove`, stamp this condition for
   *  `durationHours` (rising-edge — see `stampTriggeredConditions`). Berserk/Adrenal fire on pain. */
  selfTrigger?: { meter: 'pain'; atOrAbove: number; durationHours: number };
  /** LINEAGES-II §1 — ADDITIVE grants the condition confers while active, mirroring a body part's
   *  `grants` (limbmap). `nightVision` is summed into `getNightVision` alongside traits and living
   *  parts — the werewolf transform's full dark-sight while the condition holds, gone at moonset. */
  grants?: { nightVision?: number };
  /** Info-only staging (e.g. `bleeding` → minor/severe/fatal). A transient normally has no stages;
   *  when present, the deriving code pushes `id:stageLabel` into `transientConditions` (like the
   *  persistent stage combos) and the chip picks colour/lethality from the matching stage. The stages'
   *  modifiers are typically empty — the point is a graded READOUT, not a stat effect. */
  stages?: ConditionStage[];
  modifiers: ConditionModifiers;
}

/** An active progressive health condition on a pawn. */
export interface EntityCondition {
  id: string; // matches ConditionDef.id in conditions.jsonc
  severity: number; // 0.0–1.0; reaches lethalSeverity → pawn dies
}

// Limb + body-part ids are DATA-DRIVEN (body plans in limbmap.jsonc — humanoid arms/legs, quadruped
// paws + tail, avian wings, serpentine body, arachnid legs, …), so these are open `string` aliases
// rather than closed unions. The humanoid set (head/torso/left_arm/…; skull/chest/leftHand/…) is the
// canonical baseline; other plans introduce their own ids (frontLeftPaw, leftWing, foreBody, …).
export type LimbId = string;

export const CRITICAL_LIMBS: LimbId[] = ['head', 'torso'];

// Physical types (cutting/piercing/blunt) + ELEMENTAL types (§M arcane staves). Each elemental type
// is mitigated by its existing `*_resistance` stat in stats.jsonc (fire→fire_resistance,
// frost→cold_resistance, lightning→lightning_resistance) and by per-creature `resistances`.
export type DamageType = 'cutting' | 'piercing' | 'blunt' | 'fire' | 'frost' | 'lightning';

/** A body-part id from limbmap.jsonc's catalog — open `string` (data-driven across body plans;
 *  humanoid skull/chest/leftHand…, quadruped frontLeftPaw/tail, avian leftWing/leftCarpometacarpus, …). */
export type BodyPartId = string;

export interface Injury {
  bodyPart: BodyPartId;
  /** Wound type id from wounds.jsonc. One wound per type per part. `frostbite`/`scorch` are the
   *  frost/lightning wounds; the `*_scar` variants are the PERMANENT healed-over marks (TRAITS §0b) —
   *  reached by the organic close-time scar roll (healLimbs) or stamped by a `wound`-kind trait. */
  type:
    | 'cut'
    | 'fracture'
    | 'puncture'
    | 'crush'
    | 'burn'
    | 'frostbite'
    | 'scorch'
    | 'cut_scar'
    | 'puncture_scar'
    | 'crush_scar'
    | 'fracture_scar'
    | 'burn_scar'
    | 'frostbite_scar'
    | 'scorch_scar';
  severity: 'minor' | 'serious' | 'critical' | 'destroyed';
  /** TRAITS §0b — the WORST severity this wound ever reached. Severity decays back toward `minor` as the
   *  wound mends (recomputeWound re-derives it from remaining damage), so the close-time scar roll reads
   *  this peak (the blow that nearly took the limb is the one that marks it), not the faded final band.
   *  Stamped/raised in recomputeWound(InPlace); absent on a scar means "always was this severity". */
  peakSeverity?: 'minor' | 'serious' | 'critical' | 'destroyed';
  /** Accumulated HP of damage this wound has dealt to the part (same-type hits stack here). */
  damage: number;
  /** Blood volume drained per turn; clots below CLOT_FLOOR or via herbal_kit. */
  bleeding: number;
  painContribution: number;
  infected: boolean; // doubles pain + bleeding after 20 untreated turns
  treatedAt?: number; // turn when a caretaker last tended this wound
  /** Turn the wound was first inflicted (preserved as same-type hits stack). Fresh wounds don't
   *  fester until they're `infectionIncubationTicks` old — see the infection block in PawnStateMachine. */
  inflictedAt?: number;
  /** Quality 0–1 of the most recent tend; scales heal speed, treatment duration, infection resistance. */
  treatmentQuality?: number;
  /** Number of successful CLOT rolls so far. A bleeding wound stops only once this reaches the stages
   *  its severity needs (minor 1 / serious 2 / critical+ 3); each stage cuts the bleed proportionally.
   *  Rolled ~every 3 in-game hours against `blood_clotting` — a lucky natural stop. Dressing (treatedAt)
   *  short-circuits this to 0 bleed immediately. See Combat.rollWoundClotting / recomputeWound. */
  clotProgress?: number;
  /** TRAIT-SYSTEM-V2 §4 — an OLD, healed-over wound stamped at pawn generation by a `wound`-kind trait
   *  (one-eyed → a destroyed eye). Permanent: skipped by healing (never mends away), by infection
   *  pressure (long since closed), and by caretaking (nothing to dress) — its effect flows purely
   *  through the body model (capacities, part health). */
  permanent?: boolean;
  /** TRAIT-LIBRARY-EXPANSION §3b — a BLEED-WOUND (raking claws / feeding fangs): the wound never
   *  advances clot stages on its own (rollWoundClotting skips it; clotRemaining stays 1), so it bleeds
   *  at full rate until a caretaker DRESSES it (treatedAt still zeroes the bleed). Replaces the retired
   *  `bloodletting` transient condition with a physical injury the health panel already shows. */
  bloodletting?: boolean;
}

/** State of a single fine body part (organ, bone, sub-limb). */
export interface BodyPartState {
  id: BodyPartId;
  /** Current hit points; seeded from BodyPartDef.maxHp. */
  health: number;
  maxHp: number;
  isMissing: boolean;
  /** Bone is broken (fracture damage ≥ boneHp): the limb is crippled — manipulation (arm) / moving
   *  (leg) gutted + the graded `fractured` condition crushing STR/DEX — but NOT severed. Clears as it heals. */
  boneBroken?: boolean;
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
/**
 * Multipliers a condition stage (or transient condition) applies while active. The BASE-STAT keys
 * (strength…intelligence) scale the raw attribute everywhere it's read — combat damage/hit, dodge,
 * carry, every work formula — so a severe condition genuinely cripples the body, not just "work
 * output". The legacy throughput keys (workEfficiency/moveSpeed/…) stack ON TOP for flavour. All are
 * multipliers, 1.0 = no change; <1 = penalty, >1 = boost (magical buffs).
 */
export interface ConditionModifiers {
  strength?: number;
  dexterity?: number;
  constitution?: number;
  perception?: number;
  intelligence?: number;
  workEfficiency?: number; // multiplier on work output (on top of the stat hit)
  moveSpeed?: number; // multiplier on movement
  hungerRate?: number; // multiplier on hunger accrual rate
  fatigueRate?: number; // multiplier on fatigue accrual rate
  thirstRate?: number; // multiplier on thirst accrual rate (e.g. dysentery's fluid loss)
  consciousness?: number; // multiplier on the consciousness capacity (e.g. heavy intoxication)
  dodge?: number; // extra multiplier on the defender's evasion (most evasion now flows via DEX)
  hitChance?: number; // extra multiplier on the attacker's to-hit (most accuracy now flows via DEX)
  pain?: number; // multiplier on felt pain (< 1 numbs it — alcohol/painkillers); see conditionPainMultiplier
  /** Index signature so the UI can iterate modifiers generically (effectLines); all values are multipliers. */
  [key: string]: number | undefined;
}

export interface ConditionStage {
  label: string;
  minSeverity: number;
  color: string;
  lifeThreatening?: boolean;
  modifiers: ConditionModifiers;
}

/**
 * Need-driven progression for a condition (e.g. hunger → malnutrition, thirst → dehydration). The
 * tuning that used to be hardcoded as `MALNUTRITION_*` / `DEHYDRATION_*` constants now lives on the
 * condition it belongs to. Rates are PER-SECOND magnitudes (the sim applies `perTick()` at use).
 */
export interface ConditionDriver {
  /** The `Pawn.needs` field that feeds this condition (e.g. 'hunger', 'thirst'). Omitted for
   *  environment-driven conditions, which use {@link source} instead and are driven separately. */
  need?: string;
  /** Environment driver (SEASONS_WEATHER): 'cold' → hypothermia, 'heat' → heat stroke. Driven by
   *  temperature exposure (not a `Pawn.needs` field), so these are skipped by the need loop. */
  source?: 'cold' | 'heat';
  /** At/above this need value (0–100) the condition accrues. */
  onset: number;
  /** Below this need value the condition recovers. */
  safe: number;
  /** Per-second severity gain while the need is in [onset, 100). */
  rateCritical: number;
  /** Per-second severity gain while the need is maxed (= 100). */
  rateMax: number;
  /** Per-second severity loss while the need is below `safe`. */
  recovery: number;
  /** Seconds the need must hold at/above `onset` before the condition BEGINS (severity rises above 0
   *  and the condition becomes visible, stat-affecting and lethal-eligible). Implemented by seeding a
   *  negative severity that climbs to 0 over this window at a maxed need — so e.g. dehydration only
   *  starts after ~a day of 100% thirst, not the instant thirst is high. Omit/0 for instant onset. */
  onsetDelay?: number;
}

/**
 * A threshold/probability predicate over a pawn's live state — the `when` gate on a condition edge
 * (TRAIT-SYSTEM-V2 §5). All present comparisons must hold. Kept allocation-free to evaluate: it's a
 * plain data bag read by `conditionGraph.evaluatePredicate`.
 */
export interface ConditionPredicate {
  /** A `Pawn.needs` field / tracked meter: hunger|thirst|fatigue|wetness|coldExposure|heatExposure|hygiene. */
  need?: string;
  /** A derived quantity: 'bloodFrac' (0–1 of max), 'pain' (0–100), 'ambientLight' (0–1), 'severity'
   *  (of the SOURCE condition, for escalation edges). */
  meter?: 'bloodFrac' | 'pain' | 'ambientLight' | 'severity';
  /** Threshold bounds on the chosen need/meter (any combination; all must hold). */
  atOrAbove?: number;
  atOrBelow?: number;
  /** Environment gate — the pawn is under an open sky (no roof). */
  unsheltered?: boolean;
  /** Celestial gate (LINEAGES-II §1) — true requires the full-moon window (the 3-night peak of the
   *  lunar cycle); false requires any other phase. The werewolf transform's trigger. */
  fullMoon?: boolean;
  /** Requires another condition present / absent on the pawn. */
  hasCondition?: string;
  lacksCondition?: string;
}

/**
 * A weather-style relationship edge from one condition to another (TRAIT-SYSTEM-V2 §5). While the
 * SOURCE condition is active and `when` holds, the edge may spawn/escalate `to`. Mirrors the
 * `weather.jsonc` transition shape.
 */
export interface ConditionTrigger {
  /** Target condition id to spawn or escalate. */
  to: string;
  /** Predicate that must hold for the edge to fire (omitted ⇒ always eligible). */
  when?: ConditionPredicate;
  /** Per-SECOND probability the edge fires while eligible. OMITTED ⇒ a DETERMINISTIC/certain edge that
   *  fires every eligible tick — this is how the shock-from-pain/blood certainty is preserved. */
  chance?: number;
  /** For a PERSISTENT target: severity added to `to` when the edge fires (0–1). Omit ⇒ just ensure
   *  the target is present. */
  severity?: number;
  /** For a TRANSIENT target (timer-based, e.g. nausea): how long to stamp it, in in-game hours. */
  durationHours?: number;
  /** 'tick' (default) — evaluate every tick; 'onset' — only the tick the source first appears. */
  per?: 'tick' | 'onset';
}

/** Fields shared by both condition shapes for the TRAIT-SYSTEM-V2 relationship graph. */
export interface ConditionGraphFields {
  /** Categorisation tags for querying, relationship rules, and UI grouping — e.g.
   *  ["environmental","cold"], ["combat","bleed"], ["disease"], ["cultural","aura"]. */
  flags?: string[];
  /** MOOD-REWORK — a STANDING mood-target offset (in 0–100 points) applied while this condition is
   *  active: negative for suffering (wet/hypothermia/pain…), positive for comfort (well_fed/intoxicated).
   *  Summed into the pawn's mood TARGET (PawnService.computeMoodTarget), which mood eases toward — NOT a
   *  per-tick drift. Omit for conditions with no bearing on mood (the `mood_*` band conditions omit it to
   *  avoid a feedback loop, since they are DERIVED from mood). */
  mood?: number;
  /** Outgoing edges: while active, these may trigger other conditions (probabilistic or deterministic). */
  triggers?: ConditionTrigger[];
  /** Environment gate — the condition is ACTIVE only while this predicate holds (generalises
   *  `needOnset` + the photosynthesis / light_sensitive gating). */
  activateWhen?: ConditionPredicate;
}

/**
 * A persistent condition (conditions.jsonc, `"duration": "persistent"`). Carries its own tracked
 * `severity` in `pawn.conditions` that worsens/recovers gradually across ticks and graduates through
 * {@link ConditionStage}s; can be lethal. The transient counterpart is {@link TransientConditionDef}.
 */
export interface ConditionDef extends ConditionGraphFields {
  id: string;
  name: string;
  /** Discriminant against {@link TransientConditionDef}: persistent conditions omit `transient`
   *  (or set it false). The bool replaces the old `duration` string. */
  transient?: false;
  description: string;
  /** Sprite-sheet glyph for the condition icon (same shape as Item/Building.charSpans). Tinted by
   *  the active stage colour in the UI. Optional — falls back to a coloured glyph if absent. */
  charSpans?: Array<{ sheet?: string; id?: number; from?: number; to?: number; literal?: string }>;
  lethalSeverity: number;
  stages: ConditionStage[];
  /** Optional: a need that drives this condition's severity up/down (conditions.jsonc). */
  driver?: ConditionDriver;
  /** When true, pop a floating label ("Name (stage)", in the active stage's colour) the tick the
   *  condition first appears or graduates to a new stage. Opt-in, mirroring the transient flag;
   *  surfaced pawn-side by syncTransientConditions (mobs don't run that sync). */
  floater?: boolean;
  /** Combat-SFX cue (audio/manifest.ts `COMBAT_SFX`) played when this condition latches in combat
   *  (e.g. shock, fractured). Backend ref only; read by Combat → simLog.pushCombatSound. */
  audio?: string;
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
    | 'infection'
    | 'hypothermia'
    | 'heat_stroke'
    | 'burning';
  turn: number;
  stats: { strength: number; dexterity: number; intelligence: number };
  /** SOCIAL-LAYER: the dead pawn's id + blood ties, retained minimally so a survivor's family
   *  tree can still name a lost parent/sibling (full retention waits on children). */
  id?: string;
  kin?: KinTie[];
}
