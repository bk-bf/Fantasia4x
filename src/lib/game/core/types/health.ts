// Survival, needs, transient conditions, and the combat body model. Split out of core/types.ts (P-4);
// re-exported via the barrel. (SURVIVAL-HEALTH + COMBAT-SYSTEM specs.)

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
}

/**
 * A transient condition (conditions.jsonc, `"duration": "transient"`). Re-derived from the pawn's
 * live state every tick (PawnStateMachine.syncTransientConditions) and stored as plain ids in
 * `pawn.transientConditions`; it appears/clears on its own when its cause does — no severity, no
 * stages. The persistent counterpart is {@link ConditionDef} (`"duration": "persistent"`).
 */
export interface TransientConditionDef {
  /** Discriminant against {@link ConditionDef} — always `"transient"` for this shape. */
  duration: 'transient';
  id: string;
  name: string;
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
  modifiers: {
    hungerRate?: number; // multiplier on hunger accrual (0 = paused, 0.33 = ⅓ rate)
    fatigueRate?: number; // multiplier on fatigue accrual
    workEfficiency?: number; // multiplier on work output
    moveSpeed?: number; // multiplier on movement steps per turn
    dodge?: number; // multiplier on combat evasion (winded → easier to hit)
  };
}

/** An active progressive health condition on a pawn. */
export interface EntityCondition {
  id: string; // matches ConditionDef.id in conditions.jsonc
  severity: number; // 0.0–1.0; reaches lethalSeverity → pawn dies
}

export type LimbId = 'head' | 'torso' | 'left_arm' | 'right_arm' | 'left_leg' | 'right_leg';

export const CRITICAL_LIMBS: LimbId[] = ['head', 'torso'];

// Physical types (cutting/piercing/blunt) + ELEMENTAL types (§M arcane staves). Each elemental type
// is mitigated by its existing `*_resistance` stat in stats.jsonc (fire→fire_resistance,
// frost→cold_resistance, lightning→lightning_resistance) and by per-creature `resistances`.
export type DamageType = 'cutting' | 'piercing' | 'blunt' | 'fire' | 'frost' | 'lightning';

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
    dodge?: number; // multiplier on the defender's evasion in combat (encumbered → easier to hit)
    hitChance?: number; // multiplier on the attacker's to-hit in combat (encumbered → hits worse)
  };
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
}

/**
 * A persistent condition (conditions.jsonc, `"duration": "persistent"`). Carries its own tracked
 * `severity` in `pawn.conditions` that worsens/recovers gradually across ticks and graduates through
 * {@link ConditionStage}s; can be lethal. The transient counterpart is {@link TransientConditionDef}.
 */
export interface ConditionDef {
  /** Discriminant against {@link TransientConditionDef} — always `"persistent"` for this shape. */
  duration: 'persistent';
  id: string;
  name: string;
  description: string;
  /** Sprite-sheet glyph for the condition icon (same shape as Item/Building.charSpans). Tinted by
   *  the active stage colour in the UI. Optional — falls back to a coloured glyph if absent. */
  charSpans?: Array<{ sheet?: string; id?: number; from?: number; to?: number; literal?: string }>;
  lethalSeverity: number;
  stages: ConditionStage[];
  /** Optional: a need that drives this condition's severity up/down (conditions.jsonc). */
  driver?: ConditionDriver;
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
    | 'heat_stroke';
  turn: number;
  stats: { strength: number; dexterity: number; intelligence: number };
}
