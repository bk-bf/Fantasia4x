// Wounds.ts — loads wounds.jsonc and resolves wound types + severity (data-driven).
// Combat maps each hit's damage type to a wound here; severity escalates with the
// wound's accumulated damage relative to the struck part's max HP.
import woundsRaw from '../database/wounds.jsonc';
import { PART_DEF_MAP, boneBreakBudget } from './BodyParts';
import { rng } from './rng';
import type { DamageType } from './types';
import type { Injury, LimbState, BodyPartId } from './types/health';

export interface WoundDef {
  id: string;
  name: string;
  fromDamageType: string;
  /** 0–1 scale on open-wound bleed (cutting 1.0, piercing 0.5, blunt/burn 0). */
  bleedMod: number;
  /** Pain per accumulated HP of this wound (doubled on a vital part). */
  painPerDamage: number;
  /** Multiplier on heal time — higher mends slower. */
  healDifficulty: number;
  /** Bone/structural wound (fracture): destroying it BREAKS the limb (cripples function) rather than
   *  SEVERING it. Excluded from the isMissing trigger; drives the boneBroken flag instead. */
  structural?: boolean;
}

export interface HealingConfig {
  /** Part HP recovered per tick, per wound, at heal_rate 1.0. */
  baseHealPerTick: number;
  sleepingMultiplier: number;
  wellFedHunger: number;
  wellFedMultiplier: number;
  goodMood: number;
  goodMoodMultiplier: number;
}

export interface CareConfig {
  /** Ticks between tend attempts on a patient. */
  tendIntervalTicks: number;
  /** Base treatment lifespan (scaled by quality). */
  treatmentDurationTicks: number;
  /** Treated wounds heal up to this much faster (× quality). */
  treatedHealMultiplier: number;
  /** A tend below this rolled quality fails (no treatment applied). */
  minTendQuality: number;
  /** Incubation grace: a wound must be this many ticks old before it can start to fester. Fresh
   *  wounds carry no infection risk — infection is a days-later threat, not an at-the-moment-of-injury
   *  one. 18000 ticks = 1 in-game day (TURNS_PER_DAY 300 × 60 tps). */
  infectionIncubationTicks: number;
  /** Infection pressure PER SECOND per untended open wound (applied via perTick, like the need
   *  drivers — NOT a raw per-60Hz-tick value). */
  infectionRiskPerWound: number;
  /** Cap on total per-second infection pressure regardless of wound count — stops a heavily
   *  wounded pawn from infecting to lethal within a single fight (NT-3). */
  infectionRiskMax: number;
  /** Infection severity recovered PER SECOND when pressure is suppressed (all wounds tended/closed). */
  infectionRecovery: number;
  /** Infection severity removed by ONE successful tend (× tend quality) — the active cure a caretaker
   *  applies on top of the passive immune recovery. A discrete per-tend cut, NOT a per-second rate. */
  infectionTreatment: number;
  /** Base immune resistance (added to CON scaling). */
  immuneResistBase: number;
}

const data = woundsRaw as unknown as {
  healing: HealingConfig;
  care: CareConfig;
  wounds: WoundDef[];
};

export const WOUND_DEFS: WoundDef[] = data.wounds;
export const HEALING_CONFIG: HealingConfig = data.healing;
export const CARE_CONFIG: CareConfig = data.care;

const BY_DAMAGE_TYPE = new Map<string, WoundDef>(WOUND_DEFS.map((w) => [w.fromDamageType, w]));
const BY_ID = new Map<string, WoundDef>(WOUND_DEFS.map((w) => [w.id, w]));

/** The wound a given damage type inflicts (falls back to crush/blunt). */
export function woundForDamageType(dt: DamageType): WoundDef {
  return BY_DAMAGE_TYPE.get(dt) ?? BY_DAMAGE_TYPE.get('blunt') ?? WOUND_DEFS[0];
}

export function woundById(id: string): WoundDef | undefined {
  return BY_ID.get(id);
}

export type WoundSeverity = 'minor' | 'serious' | 'critical' | 'destroyed';

/** Severity from a wound's accumulated damage as a fraction of the part's max HP. */
export function severityFromFrac(frac: number): WoundSeverity {
  if (frac >= 1.0) return 'destroyed';
  if (frac >= 0.7) return 'critical';
  if (frac >= 0.4) return 'serious';
  return 'minor';
}

/** Is this wound currently under active treatment? A higher-quality tend lasts proportionally longer
 *  (treatmentDurationTicks × quality). Shared by the heal loop, infection check, and the caretake job. */
export function isTended(w: Injury, turn: number): boolean {
  if (w.treatedAt == null) return false;
  return turn - w.treatedAt < CARE_CONFIG.treatmentDurationTicks * (w.treatmentQuality ?? 0);
}

// ── Wound derivation + bleed/clot model ───────────────────────────────────────
// Lives here (core) rather than in systems/Combat so the per-tick services (entityLifecycle) and the
// pawn state machine can drive bleed/clot/heal recompute without a services→systems layer hop (ADR-008).
/** Scales per-part bleed (bleeding = bleedRatio × this × bleedMod × wound-frac × clot-remaining, per
 *  second). Tuned so a SERIOUS wound bleeds out over several in-game HOURS — long enough that the
 *  periodic clot rolls + a caretaker dressing are a real race, not an instant death. */
const BLEED_CONSTANT = 32;
/** Effective bleedMod of a DESTROYED (severed / blown-off) part's open stump, regardless of how it was
 *  removed. Blunt crush wounds don't bleed (bleedMod 0) — their payoff is raw damage that craters limbs —
 *  but once a limb is actually blown off, the stump GUSHES. Set higher than any wound bleedMod (cut 1.0)
 *  so a ripped-off limb is the worst bleed in the game; still scaled by the clot/dressing factor. */
const SEVERED_STUMP_BLEED_MOD = 2.5;
/** Body-size multiplier on bleed. A part's SCALED maxHp ÷ its catalog default IS the creature's
 *  `bodyScale` (createBodyPlanLimbs builds HP = round(default × bodyScale)). Bleed is otherwise computed
 *  from `frac` (damage ÷ maxHp), which normalises size away — so a big beast bled at the SAME absolute
 *  blood/s as a pawn while carrying a bodyScale× larger blood pool (maxBloodVolume = health × bodyScale),
 *  i.e. it bled out 2–3.5× too slowly (a mammoth, scale 3.5, effectively never). Scaling bleed by bodyScale
 *  makes bleed-out TIME invariant to size. A pawn (scale 1) is unchanged. */
function bleedSizeScale(partDef: { maxHp: number } | undefined, maxHp: number): number {
  return partDef && partDef.maxHp > 0 ? maxHp / partDef.maxHp : 1;
}
/** How many successful clot rolls a wound needs before it fully stops bleeding, by severity. Each stage
 *  cuts the bleed proportionally (serious at 1/2 clots → half bleed). */
function clotsNeeded(severity: Injury['severity']): number {
  return severity === 'minor' ? 1 : severity === 'serious' ? 2 : 3; // critical / destroyed → 3
}
/** Fraction of the base bleed still flowing given clot progress: 1.0 fresh → 0 once fully clotted OR
 *  dressed. A DRESSED wound (treatedAt set) stops bleeding immediately — caretaking is the reliable stop. */
function clotRemaining(w: Pick<Injury, 'severity' | 'clotProgress' | 'treatedAt'>): number {
  if (w.treatedAt != null) return 0;
  const need = clotsNeeded(w.severity);
  return Math.max(0, (need - (w.clotProgress ?? 0)) / need);
}
/** Ticks between clot rolls (~3 in-game hours: TURNS_PER_DAY 300 / 24 × 3 × 60 tps = 2250). Deliberately
 *  sparse so a wound doesn't clot the instant it's made — bleeding stays a treat-or-die threat that only
 *  OCCASIONALLY resolves itself, leaving room for a caretaker to make it (or not). */
export const CLOT_ROLL_INTERVAL = 2250;
/** Base per-roll clot chance at `blood_clotting` 1.0 (CON 10); the stat scales it. */
export const BASE_CLOT_CHANCE = 0.4;
/** Creatures CAN'T be wound-dressed, so their bodies clot far more readily than a pawn's: they roll
 *  HOURLY (~750 ticks, vs the pawn's 3-hourly) at a much higher base chance, so a beast that breaks off
 *  a fight reliably self-stabilises within ~an in-game hour instead of bleeding out from a scratch. */
export const MOB_CLOT_ROLL_INTERVAL = 750;
export const MOB_BASE_CLOT_CHANCE = 0.7;

/**
 * Derive a wound's severity, bleed rate and pain from its accumulated damage on a part. Shared by damage
 * application (Combat) and healing (PawnStateMachine) so both the build-up and recovery use one formula.
 * Bleed/pain scale with the wound's total damage as a fraction of the part's max HP; vital parts hurt 2×.
 */
export function recomputeWound(
  bodyPart: BodyPartId,
  type: Injury['type'],
  accumDamage: number,
  prev?: Pick<
    Injury,
    'infected' | 'treatedAt' | 'treatmentQuality' | 'inflictedAt' | 'clotProgress'
  >,
  turn?: number,
  maxHpOverride?: number
): Injury {
  const partDef = PART_DEF_MAP[bodyPart];
  const wd = woundById(type);
  // Per-creature SCALED maxHp when the caller has it (bodyScale × default); else the catalog default.
  const maxHp = maxHpOverride ?? partDef?.maxHp ?? 1;
  // A structural (fracture) wound is measured against the bone's BREAK budget, not the part's full HP — so
  // "serious / critical / destroyed" track the actual break, in lockstep with the bone HP bar and the
  // `fractured` condition. Soft-tissue wounds use the part's full HP.
  const denom = wd?.structural ? boneBreakBudget(partDef, maxHp) : maxHp;
  const frac = denom > 0 ? Math.min(accumDamage / denom, 1) : 0;
  const severity = severityFromFrac(frac);
  const clotProgress = prev?.clotProgress ?? 0;
  // Bleed = base × clot-remaining: a fresh wound bleeds full, then tapers as it clots (rolled
  // separately) and stops once dressed or fully clotted — decoupled from the (now weeks-slow) tissue heal.
  const remaining = clotRemaining({ severity, clotProgress, treatedAt: prev?.treatedAt });
  return {
    bodyPart,
    type,
    severity,
    damage: accumDamage,
    // A destroyed part bleeds from the open stump regardless of wound type (crush bleedMod 0 still
    // gushes once the limb is off); otherwise the wound's own bleedMod governs.
    bleeding: partDef
      ? Math.round(
          partDef.bleedRatio *
            BLEED_CONSTANT *
            (severity === 'destroyed'
              ? Math.max(wd?.bleedMod ?? 0, SEVERED_STUMP_BLEED_MOD)
              : (wd?.bleedMod ?? 0)) *
            frac *
            remaining *
            bleedSizeScale(partDef, maxHp) *
            100
        ) / 100
      : 0,
    // Pain scales with the wound's SHARE of its part (frac) × the part's NOMINAL (default-scale) size, not
    // raw accumulated HP — so a part at 85% HP barely hurts, and a big creature's larger absolute damage
    // doesn't read as more pain than the same % wound on a pawn (size-invariant). For a pawn (bodyScale 1,
    // scaled maxHp = nominal) this equals the old accum × painPerDamage; bigger creatures hurt ÷ bodyScale.
    painContribution:
      Math.round(
        frac * (partDef?.maxHp ?? maxHp) * (wd?.painPerDamage ?? 0.5) * (partDef?.isVital ? 2 : 1) * 10
      ) / 10,
    infected: prev?.infected ?? false,
    // Carry the active dressing across recomputes — otherwise a wound reverts to "untended" the first
    // heal tick (treatmentQuality lost) and stalls (severity rule), undoing the medic's work.
    treatedAt: prev?.treatedAt,
    treatmentQuality: prev?.treatmentQuality,
    clotProgress,
    // Age clock for the infection incubation gate: keep the original time as same-type hits stack.
    inflictedAt: prev?.inflictedAt ?? turn
  };
}

/**
 * In-place variant of {@link recomputeWound}: recompute a wound's derived fields by MUTATING the existing
 * Injury rather than allocating a fresh one. Used by the hot per-tick mob heal (`entityLifecycle`), where
 * a fresh object per wounded mob per tick was the allocation cliff that GC-thrashed TPS (ENGINE-PERFORMANCE).
 * Behaviour mirrors recomputeWound; `infected`/`treatedAt`/`treatmentQuality`/`inflictedAt` are preserved.
 */
export function recomputeWoundInPlace(
  w: Injury,
  accumDamage: number,
  turn?: number,
  maxHpOverride?: number
): void {
  const partDef = PART_DEF_MAP[w.bodyPart];
  const wd = woundById(w.type);
  const maxHp = maxHpOverride ?? partDef?.maxHp ?? 1;
  // Structural wounds measure against the bone BREAK budget; soft wounds against the part's full HP.
  const denom = wd?.structural ? boneBreakBudget(partDef, maxHp) : maxHp;
  const frac = denom > 0 ? Math.min(accumDamage / denom, 1) : 0;
  w.severity = severityFromFrac(frac);
  w.damage = accumDamage;
  const remaining = clotRemaining(w);
  // Destroyed part → open-stump gush regardless of wound type (mirrors recomputeWound).
  const effBleedMod =
    w.severity === 'destroyed'
      ? Math.max(wd?.bleedMod ?? 0, SEVERED_STUMP_BLEED_MOD)
      : (wd?.bleedMod ?? 0);
  w.bleeding = partDef
    ? Math.round(
        partDef.bleedRatio *
          BLEED_CONSTANT *
          effBleedMod *
          frac *
          remaining *
          bleedSizeScale(partDef, maxHp) *
          100
      ) / 100
    : 0;
  // Size-invariant, fraction-based pain (mirrors recomputeWound): frac × nominal part size × painPerDamage.
  w.painContribution =
    Math.round(
      frac * (partDef?.maxHp ?? maxHp) * (wd?.painPerDamage ?? 0.5) * (partDef?.isVital ? 2 : 1) * 10
    ) / 10;
  if (w.inflictedAt == null) w.inflictedAt = turn;
}

/**
 * Roll clotting for every bleeding, untended wound on an entity — called ~every CLOT_ROLL_INTERVAL ticks
 * (~3 in-game hours) from the pawn/mob tick. Each such wound gets ONE chance at `clotChance` to advance a
 * clot stage; a wound needs `clotsNeeded(severity)` stages to fully stop (each cuts the bleed). The "lucky
 * natural stop" — sparse and uncertain, so a wounded entity still mostly needs a caretaker's dressing.
 * Mutates limbs in place; returns true if any wound's bleed changed (so the caller refreshes bleedRate).
 */
export function rollWoundClotting(limbs: LimbState[], clotChance: number, turn: number): boolean {
  let changed = false;
  for (const limb of limbs) {
    let limbChanged = false;
    for (const part of limb.parts ?? []) {
      for (const w of part.injuries) {
        if (w.bleeding <= 0 || w.treatedAt != null) continue; // already dry or dressed
        if ((w.clotProgress ?? 0) >= clotsNeeded(w.severity)) continue; // fully clotted
        if (rng.random() < clotChance) {
          w.clotProgress = (w.clotProgress ?? 0) + 1;
          recomputeWoundInPlace(w, w.damage, turn); // re-derive bleed from the new clot stage
          limbChanged = true;
        }
      }
    }
    if (limbChanged) {
      limb.bleedRate = (limb.parts ?? []).reduce(
        (s, p) => s + p.injuries.reduce((ps, x) => ps + x.bleeding, 0),
        0
      );
      changed = true;
    }
  }
  return changed;
}

/** An UNTENDED serious+ wound barely mends — it must be dressed, while minor wounds self-close. */
const UNTENDED_SERIOUS_HEAL_MUL = 0.15;

/**
 * Mend the per-part wounds on a limb tree by `baseHeal` HP/tick/wound, returning a fresh limb array (or
 * the same ref if nothing changed). Shared by pawns (`healWounds`) and mobs (entityLifecycle's natural
 * heal-off) so both use one mend formula. `untendedSeriousStalls` gates the severity rule (pawns true,
 * mobs false — animals can't dress wounds). A part with no wounds left snaps back to full HP (UI auto-hide).
 */
export function healLimbs(
  limbs: LimbState[],
  baseHeal: number,
  turn: number,
  untendedSeriousStalls: boolean
): LimbState[] {
  if (baseHeal <= 0) return limbs;
  let changed = false;
  const newLimbs = limbs.map((limb) => {
    const parts = limb.parts;
    // PERMANENT (trait-stamped, healed-over) wounds never mend — and a limb carrying ONLY those must
    // return the SAME ref (no per-tick object churn for a one-eyed pawn; ENGINE-PERFORMANCE).
    if (!parts || !parts.some((p) => p.injuries.some((w) => !w.permanent))) return limb;
    const newParts = parts.map((part) => {
      if (part.isMissing || !part.injuries.some((w) => !w.permanent)) return part;
      let healed = 0;
      const newWounds: Injury[] = [];
      for (const w of part.injuries) {
        if (w.permanent) {
          newWounds.push(w); // carried as-is, forever
          continue;
        }
        const tended = isTended(w, turn);
        const tendBoost = tended
          ? 1 + CARE_CONFIG.treatedHealMultiplier * (w.treatmentQuality ?? 0)
          : untendedSeriousStalls && w.severity !== 'minor'
            ? UNTENDED_SERIOUS_HEAL_MUL
            : 1;
        const heal = (baseHeal / (woundById(w.type)?.healDifficulty ?? 1)) * tendBoost;
        const newDamage = w.damage - heal;
        if (newDamage <= 0.05) {
          healed += w.damage; // fully mended — drop the wound
          continue;
        }
        healed += heal;
        newWounds.push(recomputeWound(part.id, w.type, newDamage, w, turn, part.maxHp));
      }
      const health =
        newWounds.length === 0 ? part.maxHp : Math.min(part.maxHp, part.health + healed);
      // Un-break the bone once the fracture has knit below boneHp (scaled to the part's maxHp).
      const hasBone = PART_DEF_MAP[part.id]?.boneHp != null;
      const fractureW = newWounds.find((w) => woundById(w.type)?.structural);
      const boneBroken =
        hasBone &&
        fractureW != null &&
        fractureW.damage >= boneBreakBudget(PART_DEF_MAP[part.id], part.maxHp);
      return { ...part, health, injuries: newWounds, boneBroken };
    });
    const totalBleed = newParts.reduce(
      (s, p) => s + p.injuries.reduce((ps, w) => ps + w.bleeding, 0),
      0
    );
    const partMaxTotal = newParts.reduce((s, p) => s + p.maxHp, 0);
    const partHealthTotal = newParts.reduce((s, p) => s + p.health, 0);
    const rolledHealth =
      partMaxTotal > 0 ? Math.round((partHealthTotal / partMaxTotal) * 100) : limb.health;
    changed = true;
    return { ...limb, parts: newParts, health: rolledHealth, bleedRate: totalBleed };
  });
  return changed ? newLimbs : limbs;
}

/**
 * In-place sibling of {@link healLimbs}: mend wounds by MUTATING the limb/part/wound objects, returning
 * whether anything changed. The per-tick mob heal (entityLifecycle) runs this across hundreds of wounded
 * mobs, where the immutable rebuild was an allocation cliff (ENGINE-PERFORMANCE). Behaviour mirrors
 * healLimbs; the caller invalidates the limbs-identity capacity cache on a `true` return (a slice() bump).
 */
export function healLimbsInPlace(
  limbs: LimbState[],
  baseHeal: number,
  turn: number,
  untendedSeriousStalls: boolean
): boolean {
  if (baseHeal <= 0) return false;
  let changed = false;
  for (const limb of limbs) {
    const parts = limb.parts;
    // Mirror healLimbs: permanent (trait-stamped) wounds never mend; skip limbs carrying only those.
    if (!parts || !parts.some((p) => p.injuries.some((w) => !w.permanent))) continue;
    for (const part of parts) {
      if (part.isMissing || !part.injuries.some((w) => !w.permanent)) continue;
      let healed = 0;
      let write = 0;
      const inj = part.injuries;
      for (let read = 0; read < inj.length; read++) {
        const w = inj[read];
        if (w.permanent) {
          inj[write++] = w; // kept as-is, forever
          continue;
        }
        const tended = isTended(w, turn);
        const tendBoost = tended
          ? 1 + CARE_CONFIG.treatedHealMultiplier * (w.treatmentQuality ?? 0)
          : untendedSeriousStalls && w.severity !== 'minor'
            ? UNTENDED_SERIOUS_HEAL_MUL
            : 1;
        const heal = (baseHeal / (woundById(w.type)?.healDifficulty ?? 1)) * tendBoost;
        const newDamage = w.damage - heal;
        if (newDamage <= 0.05) {
          healed += w.damage; // fully mended — drop the wound (don't compact it back in)
          continue;
        }
        healed += heal;
        recomputeWoundInPlace(w, newDamage, turn, part.maxHp);
        inj[write++] = w; // compact the survivors toward the front
      }
      if (write !== inj.length) inj.length = write; // truncate the dropped wounds
      part.health = inj.length === 0 ? part.maxHp : Math.min(part.maxHp, part.health + healed);
      const hasBone = PART_DEF_MAP[part.id]?.boneHp != null;
      const fractureW = inj.find((w) => woundById(w.type)?.structural);
      part.boneBroken =
        hasBone &&
        fractureW != null &&
        fractureW.damage >= boneBreakBudget(PART_DEF_MAP[part.id], part.maxHp);
    }
    let totalBleed = 0;
    let partMaxTotal = 0;
    let partHealthTotal = 0;
    for (const p of parts) {
      for (const w of p.injuries) totalBleed += w.bleeding;
      partMaxTotal += p.maxHp;
      partHealthTotal += p.health;
    }
    limb.health =
      partMaxTotal > 0 ? Math.round((partHealthTotal / partMaxTotal) * 100) : limb.health;
    limb.bleedRate = totalBleed;
    changed = true;
  }
  return changed;
}
