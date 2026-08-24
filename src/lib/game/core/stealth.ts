// STEALTH — how easily a body goes unnoticed, and the creature-side detection roll.
//
// Two layers, mirroring night vision (vision.ts): Layer A is the `stealth` stat formula in
// stats.jsonc (sizeFactor × dexGate × moving — small AND deft AND sound-footed, multiplicative so
// any missing leg of the build zeroes it); Layer B (this module) sums the flat additives on top:
// trait `effects.stealth`, living-part `grants.stealth`, worn armour `stealthMod`, and a drag per
// point of natural armour (a matted or plated hide rustles and bulks). PawnStatService folds the
// two together, so `evaluateStat('stealth', pawn)` reads the FULL value.
//
// The detection half is a FILTER on the existing mob vision gate (entityAI `inVision`), not a new
// spatial system: when a pawn is inside a creature's (light- and weather-shortened) vision range
// WITH line of sight, the creature rolls pDetect every ~2 s; until a roll succeeds the pawn simply
// isn't acquired. The math here is pure — entityAI supplies light/distance and owns the per-mob
// cache (`mob.stealthChecks`).

import type { Pawn, Mob } from './types';
import { PART_DEF_MAP } from './BodyParts';
import { itemDefById } from './itemDefs';
import { dampenLightByNightVision } from './vision';

/** Multiplier on `hit_precision` for a strike against a creature that has NOT detected the
 *  attacker (melee and ranged alike — both route through resolveHit). The hit auto-reveals. */
export const STEALTH_STRIKE_MULT = 3.5;

/** Detection-roll cadence: a creature re-rolls against an unseen pawn about every 2 s (jittered
 *  so a pack that met the pawn together doesn't re-roll in lockstep). */
export const STEALTH_CHECK_INTERVAL_S = 2;
export const STEALTH_CHECK_JITTER_S = 1;

/** A creature that has DETECTED a pawn forgets it after this long without line of sight — the
 *  hostile give-up path clears its memory immediately; this timeout covers everything else
 *  (grazers, a pawn that simply walked away), so re-approach is always possible. */
export const STEALTH_FORGET_S = 30;

/** pDetect per check = BASE + (detectionScore − stealth) × SLOPE + proximityFrac × PROXIMITY,
 *  clamped to [MIN, MAX]. proximityFrac ramps 0 at the vision edge → 1 point-blank, so detection
 *  is a flat +25 % likelier adjacent than at the border. */
export const DETECT_BASE = 0.12;
export const DETECT_SLOPE = 0.15;
export const DETECT_PROXIMITY = 0.25;
export const DETECT_MIN = 0.02;
export const DETECT_MAX = 0.85;

/** Worn armour with no explicit `stealthMod` costs this much stealth per kg — weight IS the tread
 *  (a 3 kg hide vest ≈ −0.09, a mail shirt ≈ −0.4, full plate zeroes even a specialist). An
 *  authored `stealthMod` overrides it (the one deliberately quiet garment is a positive). */
export const ARMOR_WEIGHT_STEALTH_DRAG = 0.03;

/** Stealth lost per point of trait natural armour (ADR-029 `naturalArmor` scalar) — a hardened
 *  hide is bulk and rustle the body can't shed. Scaled Hide (12) ≈ −0.48: the beast's tanky path
 *  and its stealth path genuinely fork. */
export const NATURAL_ARMOR_STEALTH_DRAG = 0.04;

/** Layer B: the flat stealth additives on top of the stat formula — traits, living body parts,
 *  worn armour (explicit `stealthMod` or derived weight drag), natural-armour drag. Negative sums
 *  are possible (Constant Howling, plate); the caller floors the total at 0. */
export function stealthAdditives(entity: Pawn | Mob): number {
  let s = 0;
  for (const trait of (entity as Pawn).traits ?? []) {
    s += trait.effects?.stealth ?? 0;
    // Natural armour lives ON the trait (ADR-029) — no item to carry a stealthMod, so the drag
    // derives from the same scalar the dodge drag uses.
    s -= (trait.naturalArmor ?? 0) * NATURAL_ARMOR_STEALTH_DRAG;
  }
  // Part-granted stealth (a future slime's translucent membrane): summed over LIVING parts only,
  // same self-gating as part-granted night vision — a destroyed part stops contributing.
  for (const limb of entity.limbs ?? [])
    for (const part of limb.parts ?? []) {
      if (part.isMissing || part.health <= 0) continue;
      s += PART_DEF_MAP[part.id]?.grants?.stealth ?? 0;
    }
  const equipment = (entity as Pawn).equipment;
  if (equipment) {
    for (const inst of Object.values(equipment)) {
      if (!inst) continue;
      const item = itemDefById(inst.itemId);
      const ap = item?.armorProperties;
      if (!ap) continue;
      s += ap.stealthMod ?? -(item?.weightKg ?? 0) * ARMOR_WEIGHT_STEALTH_DRAG;
    }
  }
  return s;
}

/** The full stealth value: Layer A base (the evaluated `stealth` stat formula — injected by the
 *  caller because the formula engine lives in PawnStatService, which core/ must not import) plus
 *  the Layer B additives, floored at 0. Read it via `evaluateStat('stealth', pawn)`, which routes
 *  through here. Target scale: default pawn ≈ 0.2 (a non-stealther), master specialist ≈ 1.5–2.2. */
export function getStealth(entity: Pawn | Mob, base: number): number {
  return Math.max(0, base + stealthAdditives(entity));
}

/** Creature-side detection score: perception above a dull-animal floor, dimmed by the light on the
 *  PAWN's tile through the creature's night vision — so stealth is automatically stronger after
 *  dark against diurnal animals while nocturnal predators stay dangerous. */
export function detectionScore(
  mobPerception: number,
  tileLight: number,
  nightVision: number
): number {
  return Math.max(0, (mobPerception - 8) * 0.12) * dampenLightByNightVision(tileLight, nightVision);
}

/** Probability that one ~2 s check detects the pawn. `proximityFrac` = 1 − dist/visionRange
 *  (0 at the vision edge, 1 adjacent). Clamped so nothing is ever a sure miss or a sure spot. */
export function detectionChance(score: number, stealth: number, proximityFrac: number): number {
  const p = DETECT_BASE + (score - stealth) * DETECT_SLOPE + proximityFrac * DETECT_PROXIMITY;
  return p < DETECT_MIN ? DETECT_MIN : p > DETECT_MAX ? DETECT_MAX : p;
}

/** Has this creature detected this pawn? Absent entry = never noticed (a sniper the mob never saw is
 *  still an unseen attacker). Read-only — the roll itself lives at the entityAI vision gate. */
export function isDetectedBy(mob: Mob, pawnId: string): boolean {
  return mob.stealthChecks?.[pawnId]?.detected === true;
}

/** Auto-reveal: stamp the pawn as detected by this creature (a landed strike, a pack alert). Mutates
 *  the mob's `stealthChecks` in place (ADR-002 cold field — never shipped to the renderer). */
export function revealPawnToMob(mob: Mob, pawnId: string, turn: number): void {
  (mob.stealthChecks ??= {})[pawnId] = { at: turn, detected: true };
}

/** When a stealth strike lands, packmates this close to the struck creature (same lair brood or
 *  kingdom party) are alerted along with it — the yelp carries. Chebyshev tiles. */
export const STEALTH_PACK_ALERT_RADIUS = 12;
