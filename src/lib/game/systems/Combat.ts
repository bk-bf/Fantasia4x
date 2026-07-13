import type {
  GameState,
  Pawn,
  Mob,
  Injury,
  LimbState,
  BodyPartState,
  BodyPartId,
  DamageType,
  LimbId,
  Item,
  ItemInstance,
  DroppedItem,
  OnHitCondition
} from '../core/types';
import { itemService } from '../services/ItemService';
import {
  getRangedWeapon,
  isRangedWeaponProps,
  pickAmmo,
  hasViableAmmo,
  effectiveRangedRange,
  hasLineOfSight,
  rangedAccuracyMod,
  aimIntervalTicks,
  drawSpeedModifier,
  sumAimBonuses,
  getGrip,
  type RangedWeapon,
  type AmmoPick,
  type MeleeGrip
} from './rangedCombat';
import {
  getConditionCurrentStage,
  getConditionFloater,
  conditionAudio,
  conditionStatMultipliers,
  getTransientConditionDef,
  COLLAPSE_CONSCIOUSNESS
} from '../core/needs';
import { getCreatureById } from '../core/Creatures';
import { willFinishOffDowned } from '../services/entity/entityConstants';
import { woundForDamageType, woundById, severityFromFrac, recomputeWound } from '../core/Wounds';
import { scaleWeaponQuality, scaleArmorQuality } from '../core/itemQuality';
import { pawnStatService } from '../services/PawnStatService';
import { calcMaxStamina } from '../entities/Pawns';
import conditionsData from '../database/conditions.jsonc';
import type { ConditionDef, TransientConditionDef } from '../core/types';
import { simLog, type CombatTextKind } from '../core/logSink';
import { rng } from '../core/rng';
import { chebyshev } from '../core/distance';
import { clamp } from '../core/math';
import { perTick } from '../core/time';
import {
  ticksFromGameHours,
  getAmbientLight,
  weatherSightMul
} from '../services/EnvironmentService';
import { isWitnessedByColony } from '../core/vision';
import { kingdomService } from '../services/KingdomService';
import { socialService } from '../services/SocialService';
import { memoryService } from '../services/MemoryService';
// Re-exported below for callers that import these via Combat.
import {
  PART_DEF_MAP,
  rollBodyPart,
  rollBodyPartOf,
  createDefaultBodyParts,
  createBodyPlanLimbs,
  parentLimbOf,
  enabledNaturalWeapons,
  cascadeSeveredContents,
  lethalAnatomyCause,
  skeletonPartOf,
  organsOf,
  boneBreakBudget,
  BOUND_NATURAL_WEAPONS,
  DEFAULT_PLAN,
  BONE_FRACTION
} from '../core/BodyParts';
import { coversPart, ARMOUR_SLOTS, SLOT_LAYER } from '../core/armorCoverage';

/** Armour share for a part with no explicit `armor` in limbmap — mid value, neither bare nor plated. */
const DEFAULT_ARMOR_SHARE = 0.5;
export { PART_DEF_MAP, createDefaultBodyParts, createBodyPlanLimbs };

/** The limb in this entity's OWN tree that holds a given part (a part's parent limb varies by body plan). */
function limbOfPart(entity: Pawn | Mob, partId: BodyPartId): LimbState | undefined {
  return (entity.limbs ?? []).find((l) => (l.parts ?? []).some((p) => p.id === partId));
}

/** The body plan of a defender (creatures carry `limbMap`; pawns are humanoid). */
function planOf(entity: Pawn | Mob): string {
  if ('creatureId' in entity) return getCreatureById(entity.creatureId)?.limbMap ?? DEFAULT_PLAN;
  return DEFAULT_PLAN;
}

/** Is the anatomy actually modelled (limbs carry parts)? Sparse test fixtures use empty parts and skip part-gating. */
function hasModelledAnatomy(entity: Pawn | Mob): boolean {
  return (entity.limbs ?? []).some((l) => (l.parts?.length ?? 0) > 0);
}

/** Can still hold a hand weapon — false only when hands are modelled and all gone. */
function hasUsableHand(entity: Pawn | Mob): boolean {
  let sawHand = false;
  for (const limb of entity.limbs ?? []) {
    for (const p of limb.parts ?? []) {
      if (p.id === 'leftHand' || p.id === 'rightHand') {
        sawHand = true;
        if (!p.isMissing && !limb.isMissing) return true;
      }
    }
  }
  return !sawHand; // no modelled hands → don't block; modelled-but-all-gone → can't wield
}

// Combat only needs the transient conditions (winded → dodge).
const TRANSIENT_CONDITIONS_DB = (
  conditionsData as unknown as Array<ConditionDef | TransientConditionDef>
).filter((d): d is TransientConditionDef => d.transient === true);

// ── Tuning constants ─────────────────────────────────────────────────────────
/** Bone-fracture roll on a hit to a boned part: blunt cracks bone far more readily (× bluntMod);
 *  chance scales with the blow vs the part's boneHp, capped. A broken bone cripples without severing. */
const FRACTURE_BLUNT_BASE = 0.6;
const FRACTURE_OTHER_BASE = 0.12;
const FRACTURE_BLUNT_CAP = 0.85;
const FRACTURE_OTHER_CAP = 0.3;
/** Every blow lands a DOUBLE wound: a flesh crush/cut plus an INDEPENDENT load on the bone beneath.
 *  The bone takes a share of the RAW force by damage class (blunt drives through, × bluntMod), shielded
 *  by worn armour but NOT by the flesh's own toughness. */
const BONE_TRANSFER_BLUNT = 0.7;
const BONE_TRANSFER_OTHER = 0.2;
/** ± spread on the transmitted bone load, so flesh and bone depth vary independently per blow. */
const BONE_DAMAGE_VARIANCE = 0.4;
/** Organ-penetration roll on a hit to a body cavity — the soft-tissue twin of the fracture roll, also
 *  independent of the flesh wound. Penetrating wounds find organs readily; blunt only on a hard hit.
 *  Organs sit deeper than bone, so chances/transfers sit below the fracture ones. The all-or-nothing
 *  cascade when the cavity itself is destroyed (cascadeSeveredContents) is separate. */
const ORGAN_PENETRATE_BASE = 1.0;
const ORGAN_BLUNT_BASE = 0.18;
const ORGAN_PENETRATE_CAP = 0.5;
const ORGAN_BLUNT_CAP = 0.18;
/** Share of the blow's RAW force driven inward to an organ, by damage class; shielded by worn armour. */
const ORGAN_TRANSFER_PENETRATING = 0.55;
const ORGAN_TRANSFER_BLUNT = 0.25;
/** ± spread on the transmitted organ load (mirrors bone). */
const ORGAN_DAMAGE_VARIANCE = 0.4;
/** ADR-031: precision finds the vital DIRECTLY — the organ-penetration and fracture chances are each
 *  multiplied by (1 + precision × K), where precision is the attacker's full crit chance (hit_precision
 *  stat + the weapon's critMod, the same number that drives crits and gap-aiming). A deft fighter (or a
 *  crit-prone stiletto) beats armour by PLACEMENT — the kidney thrust, the cracked femur — while the
 *  existing caps still bound the result. hit_precision runs ~0.05 base → ~0.11 high DEX/PER, so organ
 *  routing gains ~+30–65% and fractures ~+20–45% at the top end. Organs weigh heavier than bone:
 *  precision is a blade guided into a gap more than force driven through it. */
const K_PRECISION_ORGAN = 6;
const K_PRECISION_FRACTURE = 4;
/** ADR-031 natural-hide degradation: blows chip a creature's per-part hide the same way they wreck worn
 *  armour (weapon `armorDamage` × the attacker's `armor_damage` stat — one wear model for both). The
 *  wear is PER-FIGHT scratch, not permanent maiming: it expires once no chip has landed for this many
 *  ticks (~an in-game hour, mirroring MOB_CLOT_ROLL_INTERVAL — the beast's hide "settles" as it
 *  recovers), so a sustained fight progressively opens a tank up but a fled bear resets. */
const HIDE_WEAR_RESET_TICKS = 750;
/** Stats are on a ~5–22 scale; this divisor keeps damage in a sensible range. */
const STAT_SCALE = 10;
/** How strongly `bodyScale` boosts natural-weapon damage: damageMult = 1 + (bodyScale − 1) × this. */
const NATURAL_DAMAGE_BODYSCALE_FACTOR = 0.5;
/** Mob base damage when it has no weapon. */
const MOB_BASE_DAMAGE = 5;
/** Damage multiplier applied on a critical hit. */
const CRIT_MULTIPLIER = 1.5;
/** Upper bound on total crit chance (base stat + weapon critMod). */
const CRIT_CHANCE_CAP = 0.6;
// COLLAPSE_CONSCIOUSNESS (the down threshold) is the shared constant in core/needs — pawns and mobs
// go DOWN into the recoverable `collapse` condition at the same band (no instant kill).
// Blunt knockdown duration scales with the blow; floors at one attack interval so it reliably costs
// the target its next swing, capped so a huge hit (or a swarm refreshing it) can't stun-lock.
const KNOCKDOWN_FLOOR_TURNS = 72;
const KNOCKDOWN_TURNS_PER_DAMAGE = 4;
const KNOCKDOWN_MAX_TURNS = 240;
/** Keepalive floor for the `collapse` timer — the state machines refresh it each tick while
 *  unconscious and clear it on recovery; NOT the real down-time. */
const COLLAPSE_KEEPALIVE_TURNS = 2;
/** A pawn's innate attacks — ids of `natural_weapon` items; deliberately weak vs crafted gear. */
const PAWN_NATURAL_WEAPON_IDS = ['fists', 'kick'];
/** Buff stamped on a feeder after a successful blood DRAIN; non-refreshing while active. */
const FEASTED_CONDITION = 'feasted';
const FEASTED_DURATION_HOURS = 0.5;
/** Base attack interval in ticks, scaled by the attack_speed stat. */
const BASE_ATTACK_INTERVAL_TICKS = 120;
/** Minimum ticks between attacks regardless of attack_speed (caps the fastest attacker). */
const MIN_ATTACK_INTERVAL_TICKS = 72;
/** Stamina drained per auto-attack when a weapon defines no `staminaCost` of its own. */
const ATTACK_STAMINA_COST = 2;
/** Transient condition id for the winded state (latches at 0 stamina, clears at full). */
const WINDED = 'winded';
/** While actively fighting, stamina regenerates at this fraction of the full rate, so a
 *  sustained melee drains down to winded; a winded/resting entity recovers at the full rate. */
const COMBAT_REGEN_FRACTION = 0.2;

/** Fatigue penalty on stamina: 1.0× at fatigue 0 → 1.3× at 100. Recovery is DIVIDED by this, drain
 *  MULTIPLIED — the single channel by which fatigue degrades stamina (no double counting). */
const FATIGUE_STAMINA_MAX = 1.3;
function fatigueStaminaFactor(e: Pawn | Mob): number {
  const fatigue = Math.max(0, Math.min(100, e.needs?.fatigue ?? 0));
  return 1 + (FATIGUE_STAMINA_MAX - 1) * (fatigue / 100);
}

// ── Public types ─────────────────────────────────────────────────────────────
export interface HitResult {
  hit: boolean;
  bodyPart: BodyPartId | null;
  /** Final damage after armour reduction (and crit multiplier, if any). */
  damage: number;
  injury: Injury | null;
  knockdown: boolean;
  /** True when this swing rolled a critical hit. */
  crit: boolean;
  damageType: DamageType;
  /** Attack used this swing (weapon name / natural-weapon id). */
  weaponId: string;
  /** Stamina this swing drained — deducted by the caller regardless of hit/miss. */
  staminaCost: number;
  partRemainingHp?: number;
  partMaxHp?: number;
  /** Secondary BONE wound (fracture roll succeeded), applied alongside the soft-tissue injury. */
  fractureInjury?: Injury | null;
  /** Secondary ORGAN wound (organ-penetration roll succeeded), applied alongside the flesh injury. */
  organInjury?: Injury | null;
}

export interface CombatService {
  /** Advance all active combats one tick; called from GameEngineImpl after the entity step. */
  tickCombat(state: GameState, dtMs: number): GameState;
  /** Pure hit resolution: roll to-hit, pick body part, compute damage & injury. */
  resolveHit(attacker: Pawn | Mob, defender: Pawn | Mob, state: GameState): HitResult;
  /** Apply an already-resolved Injury to a pawn, updating limb tree + conditions.
   *  `knockdown` applies a short blunt-stagger status when the swing rolled one. */
  applyInjury(pawnId: string, injury: Injury, state: GameState, knockdown?: boolean): GameState;
  /** Apply an already-resolved Injury to a mob, updating limb tree + conditions. */
  applyInjuryToMob(mobId: string, injury: Injury, state: GameState, knockdown?: boolean): GameState;
  /** Stub — not implemented yet. */
  triggerSkill(skillId: string, casterId: string, targetId: string, state: GameState): GameState;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

interface AttackProfile {
  str: number;
  dex: number;
  baseDamage: number;
  accuracy: number;
  damageType: DamageType;
  bluntMod: number;
  /** Flat 0–1 chance to stun (knock down) on hit, regardless of damage type (maces/hammers). */
  stunChance: number;
  armorPen: number;
  /** Which attack was rolled this swing (weapon name / natural-weapon id) — for logs & floaters. */
  weaponId: string;
  /** Stamina this particular attack drains. */
  staminaCost: number;
  /** Crit chance this attack adds on top of the attacker's base hit_precision stat. */
  critMod: number;
  /** Finesse weapon (rapier): melee damage scales with PERCEPTION, not STRENGTH. */
  finesse: boolean;
  /** Arcane weapon (elemental staff): damage scales with INTELLIGENCE, not STRENGTH. */
  arcane: boolean;
  /** Chance (0–1) a landed open wound is marked unclottable — it bleeds until dressed. */
  bloodletting?: number;
}

/** Precomputed attack used in place of `attackerProfile` for a ranged shot, so `resolveHit`
 *  stays a single code path. Built once per shot. */
export interface RangedOverride {
  profile: AttackProfile;
  /** Additive hit-chance points: ammo accuracy − distance penalty×100 − cover×100. */
  hitMod: number;
  /** When false (crossbow/sling), damage does NOT scale with STR. */
  strScaled: boolean;
}

type WeaponProps = NonNullable<Item['weaponProperties']>;

/** One natural-weapon candidate this swing could roll. */
interface WeaponCandidate {
  id: string;
  wp: WeaponProps;
  bloodletting?: number;
}

/** Weighted pick over a candidate pool (weaponProperties.weight, default 1). */
function pickWeightedWeapon(candidates: WeaponCandidate[]): WeaponCandidate {
  const total = candidates.reduce((s, c) => s + Math.max(0, c.wp.weight ?? 1), 0);
  if (total <= 0) return candidates[candidates.length - 1];
  let r = rng.random() * total;
  for (const c of candidates) {
    r -= Math.max(0, c.wp.weight ?? 1);
    if (r <= 0) return c;
  }
  return candidates[candidates.length - 1];
}

/** Build an attack profile from a resolved weaponProperties block. */
function profileFromWeapon(
  str: number,
  dex: number,
  wp: WeaponProps,
  weaponId: string
): AttackProfile {
  const dtype = wp.damageType ?? 'blunt';
  return {
    str,
    dex,
    baseDamage: wp.damage,
    accuracy: wp.accuracy ?? 0,
    damageType: dtype,
    bluntMod: wp.bluntMod ?? (dtype === 'blunt' ? 1.0 : 0),
    stunChance: wp.stunChance ?? 0,
    armorPen: wp.armorPenetration ?? 0,
    weaponId,
    staminaCost: wp.staminaCost ?? ATTACK_STAMINA_COST,
    critMod: wp.critMod ?? 0,
    finesse: wp.finesse ?? false,
    arcane: wp.arcane ?? false
  };
}

/** Bonus a duelist (one-handed, off-hand free) adds to damage/armorPen/crit. */
const DUELIST_DAMAGE_MULT = 1.2;
const DUELIST_ARMOR_PEN = 0.1;
const DUELIST_CRIT = 0.05;
/** Bonus a two-handed grip adds. */
const TWOHAND_DAMAGE_MULT = 1.15;
const TWOHAND_ARMOR_PEN = 0.05;
/** Multiplier a shield applies to the WEARER's dodge (no active block — BB-style, defence = dodge). */
const SHIELD_DODGE_MULT = 1.25;
// Weight on a weapon's flat `accuracy` in the melee hit roll — ×2 so the accurate-vs-brutish weapon
// axis actually moves hit chance. Ranged uses `hitMod` instead, so launchers are unaffected.
const MELEE_ACCURACY_WEIGHT = 2;
/** Melee hit chance = BASE + DEX edge − dodge edge (+ weapon accuracy), × condition — ~60% at parity. */
const BASE_MELEE_HIT = 60;
/** Hit-chance points per attacker DEX above 10. Kept SYMMETRIC with the defender's dodge term so a
 *  parity fight stays ~60% hit / 40% dodge at any stat magnitude. */
const DEX_HIT_WEIGHT = 1;
/** Hit-chance points removed per +1.0 of defender `dodge` above the 1.0 baseline. */
const DODGE_HIT_WEIGHT = 50;
/** Dodge lost per point of NATURAL armour — heavy hide is dead weight that evades worse. Worn armour
 *  is separate: it drags dodge through the staged `encumbered` condition. */
const NATURAL_ARMOR_DODGE_DRAG = 0.01;
/** Default projectile particle style per ammo bucket when the ammo item doesn't author its own. */
const PROJECTILE_BY_CATEGORY: Record<string, string> = {
  arrow: 'arrow',
  bolt: 'bolt',
  sling_stone: 'stone'
};
/** Min ticks between repeated "No ammo" floats for the same pawn — avoids per-tick spam. */
const NOAMMO_NOTIFY_COOLDOWN = 90;
// Encumbrance is not a combat-local hook: the staged `encumbered` condition's dodge/hitChance
// modifiers flow through conditionDodgeMult / conditionHitMult below.

/** Apply the MELEE grip's offensive modifier to a built profile (duelist + two-hand add offense; a
 *  shield trades offense for the defender-side dodge bonus, applied separately in resolveHit). */
function applyMeleeGrip(p: AttackProfile, grip: MeleeGrip): AttackProfile {
  if (grip === 'duelist') {
    p.baseDamage *= DUELIST_DAMAGE_MULT;
    p.armorPen = clamp(p.armorPen + DUELIST_ARMOR_PEN, 0, 1);
    p.critMod += DUELIST_CRIT;
  } else if (grip === 'twoHanded') {
    p.baseDamage *= TWOHAND_DAMAGE_MULT;
    p.armorPen = clamp(p.armorPen + TWOHAND_ARMOR_PEN, 0, 1);
  }
  return p;
}

/** A pawn's unarmed pool = its cultural natural weapons ahead of the default fists/kick, so a
 *  clawed/fanged culture swings its body weapon when unarmed (or forced unarmed by a trait's
 *  `blocksSlots`). ADR-023: the weapon ids live on the trait's `selfCondition` DEF
 *  (`grantsNaturalWeapon`) — the body condition IS the source, so the health pill and the swing can't
 *  drift. Empty cultural set → the plain fists/kick default. */
function pawnNaturalWeaponIds(attacker: Pawn): string[] {
  // ADR-029: a pawn's natural-weapon ids live on its TRAITS (`naturalWeapons`, the mirror of a
  // creature's def list). Anatomy-gating happens downstream in attackerProfile via the SAME
  // `enabledNaturalWeapons`/`BOUND_NATURAL_WEAPONS` filter creatures use — every natural weapon id is
  // listed on its host part in limbmap (jaw→bite, head→goring-horns…), so losing the part loses the
  // weapon with no separate hostParts bookkeeping.
  const extra: string[] = [];
  for (const t of attacker.traits ?? []) {
    // LINEAGES-II §1: a transform-gated weapon set only exists while its condition holds (Moonlit
    // Claws under the `werewolf` transform).
    if (
      t.naturalWeaponsWhen &&
      !(attacker.transientConditions ?? []).includes(t.naturalWeaponsWhen) &&
      !((attacker.conditionTimers?.[t.naturalWeaponsWhen] ?? 0) > 0)
    )
      continue;
    for (const id of t.naturalWeapons ?? []) if (!extra.includes(id)) extra.push(id);
  }
  return extra.length > 0 ? [...extra, ...PAWN_NATURAL_WEAPON_IDS] : PAWN_NATURAL_WEAPON_IDS;
}

/** A weapon item's bloodletting proc chance (ADR-029 `onHitWound` list; 0 when absent). */
function bloodlettingChance(item: Item | undefined): number | undefined {
  const c = item?.onHitWound?.find((w) => w.wound === 'bloodletting')?.chance;
  return c && c > 0 ? c : undefined;
}

/** LINEAGES §4: credit a PAWN's kill toward its awakening deeds, by the victim's creature family and
 *  whether the killing blow was unarmed (fists / a natural weapon, not a crafted one). Mobs never accrue
 *  deeds (they don't grow lineages). Cheap: a couple of map lookups on a kill event. */
function creditKillDeeds(
  attacker: Pawn | Mob,
  victim: Mob,
  weaponId?: string,
  turn?: number
): void {
  if ('creatureId' in attacker) return; // attacker is a mob → no deeds
  const def = getCreatureById(victim.creatureId);
  if (!def) return;
  const deeds = (attacker.deeds ??= {});
  const bump = (k: string) => (deeds[k] = (deeds[k] ?? 0) + 1);
  if (def.audio === 'canine') bump('kill:canine'); // werewolf
  if (def.limbMap === 'arachnid') bump('kill:arachnid'); // arachnid
  const item = weaponId ? itemService.getItemById(weaponId) : undefined;
  const unarmed = !weaponId || item?.category === 'natural_weapon';
  if (unarmed && (def.bodyScale ?? 1) >= 1.3) bump('unarmedBigKill'); // beast
  // Arachnid hunter's-patience deeds: the prey died while envenomed / while held fast.
  const timers = victim.conditionTimers;
  if (timers?.envenomed && timers.envenomed > 0) bump('venomKills');
  if (timers?.ensnared && timers.ensnared > 0) bump('ensnaredKills');
  // Werewolf: a kill made in the dark (LINEAGES-II §1 nightKills).
  if (turn !== undefined && getAmbientLight(turn) < 0.35) bump('nightKills');
}

/** Summed wielded-weapon damage bonus from traits' `combatMods.melee_damage` (Giant's Grip, Dragon's
 *  Might…). Each is a multiplier (1.15 = +15%); we sum the deltas so two traits stack additively, as
 *  before. Applied only while a weapon is equipped. 0 for mobs and traitless pawns. */
function weaponBonusDamage(attacker: Pawn | Mob): number {
  if (!('traits' in attacker)) return 0;
  let bonus = 0;
  for (const t of attacker.traits ?? []) {
    const m = t.effects?.combatMods?.melee_damage;
    if (typeof m === 'number') bonus += m - 1;
  }
  return bonus;
}

/** Resolve the attack used for one swing. An equipped weapon wins; otherwise a
 *  weighted roll over the attacker's `natural_weapon` items (creature def, or a
 *  pawn's cultural/bare hands/feet); finally an unarmed fallback. Both gear paths
 *  resolve through the same ItemService lookup. `distTiles` (§3b breath weapons):
 *  when the target stands beyond arm's reach, only natural weapons whose `reach`
 *  covers the gap may be rolled — a reach-3 dragonfire strikes where claws can't. */
function attackerProfile(attacker: Pawn | Mob, distTiles = 1): AttackProfile {
  // Conditions cripple the attacker's raw STR/DEX here (damage scales with STR, the to-hit with DEX),
  // so a shocked/frostbitten/envenomed fighter genuinely hits softer and misses more — not just "works
  // slower". Dodge/crit/attack-speed already flow through evaluateStat, which applies the same penalty.
  const sm = conditionStatMultipliers(attacker);
  const str = attacker.stats.strength * sm.strength;
  const dex = attacker.stats.dexterity * sm.dexterity;

  // Equipped weapon (pawns; future-proofed for armed mobs) — but only if a hand can still hold it.
  // Lose both hands and the weapon drops; you fall through to natural attacks / the thrash fallback.
  if ('equipment' in attacker && attacker.equipment?.mainHand && hasUsableHand(attacker)) {
    const mh = attacker.equipment.mainHand;
    const item = itemService.getItemById(mh.itemId);
    if (item?.weaponProperties) {
      // §Q: a Masterwork blade hits harder — scale the quality-relevant fields by the stamped tier.
      // §I: a Famed blade explodes those fields ×2–5 on top of its tier.
      const wp = scaleWeaponQuality(item.weaponProperties, mh.quality, mh.famedStatMult);
      const p = profileFromWeapon(str, dex, wp, item.name ?? 'weapon');
      p.bloodletting = bloodlettingChance(item); // §3b: a deep-cutting blade leaves unclottable wounds
      // ADR-023: a cultural `weaponBonus` (Giant's Grip) rides the wielded weapon only.
      const wb = weaponBonusDamage(attacker);
      if (wb) p.baseDamage *= 1 + wb;
      // §2c wielding requirement: a crude, massive weapon (orc greataxe) punishes an under-strength
      // wielder. The penalty is carried by the `overmatched` CONDITION (driven per-tick from the
      // wieldRequirement shortfall in PawnStateMachine) — it flows into `str`/`dex` (conditionStat-
      // Multipliers) and the to-hit (conditionHitMult) here automatically, so no inline math is needed.
      return applyMeleeGrip(p, getGrip(attacker)); // BB grip: duelist/2H add offense (melee only)
    }
  }

  // Natural weapons: ids from the creature def, or the pawn's cultural+default set. Resolve
  // each to its item and weighted-pick one for this swing.
  const ids =
    'creatureId' in attacker
      ? (getCreatureById(attacker.creatureId)?.naturalWeapons ?? [])
      : pawnNaturalWeaponIds(attacker);
  const candidates: WeaponCandidate[] = [];
  for (const id of ids) {
    const it = itemService.getItemById(id);
    if (it?.weaponProperties)
      candidates.push({ id, wp: it.weaponProperties, bloodletting: bloodlettingChance(it) });
  }
  // Part-gating: a natural weapon is usable only while a surviving part enables it (a jaw to bite, a paw
  // to claw…). Unbound weapons stay always-available. Skipped for un-modelled fixtures (empty parts).
  let usable = candidates;
  if (candidates.length > 0 && hasModelledAnatomy(attacker)) {
    const enabled = enabledNaturalWeapons(attacker.limbs);
    usable = candidates.filter((c) => enabled.has(c.id) || !BOUND_NATURAL_WEAPONS.has(c.id));
  }
  // §3b reach gate: beyond arm's reach only a natural weapon whose `reach` covers the gap can strike
  // (dragonfire reach 3 behaves like a spear); adjacent keeps the full pool.
  if (distTiles > 1) usable = usable.filter((c) => (c.wp.reach ?? 1) >= distTiles);
  if (usable.length > 0) {
    const chosen = pickWeightedWeapon(usable);
    const p = profileFromWeapon(str, dex, chosen.wp, chosen.id);
    p.bloodletting = chosen.bloodletting; // §3b: raking claws / feeding fangs leave unclottable wounds
    // A big beast hits proportionally harder: scale natural-weapon base damage by the creature's
    // `bodyScale`, SOFTENED so a mammoth (scale 3.5) maims (≈2.25×) without one-shotting a limb —
    // one field drives both its blood pool (entitySpawning) and its hitting power.
    if ('creatureId' in attacker) {
      const scale = getCreatureById(attacker.creatureId)?.bodyScale ?? 1;
      if (scale !== 1) p.baseDamage *= 1 + (scale - 1) * NATURAL_DAMAGE_BODYSCALE_FACTOR;
    }
    return p;
  }

  // Thrash fallback (desperate body-blow) — no usable weapon left: every natural weapon's part is gone
  // (a jawless, clawless, legless wreck) or a disarmed pawn with no hands. Weak blunt, but the fight
  // still resolves rather than stalling on a creature that can't act.
  return {
    str,
    dex,
    baseDamage: MOB_BASE_DAMAGE,
    accuracy: 0,
    damageType: 'blunt',
    bluntMod: 1.0,
    stunChance: 0,
    armorPen: 0,
    weaponId: 'thrash',
    staminaCost: ATTACK_STAMINA_COST,
    critMod: 0,
    finesse: false,
    arcane: false
  };
}

/**
 * Compute the defender's physical damage resistance for a given damage type.
 * Sources: cultural trait general damageReduction + type-specific resistance + base stat contribution.
 * Clamped 0–0.90 (can never fully negate damage from this layer alone).
 */
// Damage type → the resistance stat shown in the attributes tab. ONE source of truth: combat soaks
// exactly the value the player sees (no hidden inline copy that could drift). `evaluateStat` folds the
// stat formula + cultural-trait resistance bonus; any condition that saps the underlying stat flows
// through automatically (and matches the tab).
const DAMAGE_RESISTANCE_STAT: Record<DamageType, string> = {
  cutting: 'cutting_resistance',
  piercing: 'piercing_resistance',
  blunt: 'blunt_resistance',
  fire: 'fire_resistance',
  frost: 'cold_resistance',
  lightning: 'lightning_resistance'
};

function physicalResistance(defender: Pawn | Mob, damageType: DamageType): number {
  // Base = the attributes-tab resistance stat (formula + cultural-trait bonus), not a duplicated formula.
  let res = pawnStatService.evaluateStat(DAMAGE_RESISTANCE_STAT[damageType], defender);

  // §M per-creature resistances/vulnerabilities (creatures.jsonc) — thematic on top (negative =
  // vulnerable). Mobs/animals only; not a pawn stat, so it lives here rather than in the stat engine.
  if ('creatureId' in defender) {
    res += getCreatureById(defender.creatureId)?.resistances?.[damageType] ?? 0;
  }

  // Cultural trait resistances (physical + elemental) are folded into the stat by evaluateStat above
  // (PawnStatService.RESISTANCE_TRAIT_KEY) — no separate flat `damageReduction` layer anymore. The
  // "armor-like" trait mitigation now lives in partArmorReduction as per-part `naturalArmor` soak.
  return clamp(res, 0, 0.9);
}

function partArmorReduction(
  defender: Pawn | Mob,
  partId: BodyPartId,
  armorPen: number,
  rawDamage: number,
  turn?: number
): number {
  const def = PART_DEF_MAP[partId];
  if (!def || rawDamage <= 0) return 0;
  // ADR-029: layered SUBTRACTIVE mitigation. `armorPen` is a flat BYPASS fraction — that share of the
  // weapon's damage IGNORES armour entirely (a bodkin's 25% slips through any plate); only the
  // remaining (1 − armorPen) share is blockable, and each covering layer subtracts its FULL defense
  // (in DAMAGE POINTS) from it, outermost → in, remainder passing inward. Armour can fully negate the
  // blockable share (a 3-dmg punch does nothing to a bear's hide) — damage comes from finding a
  // low-armour part (eye/throat/belly), a piercing weapon's bypass, or out-powering the plate. Worn
  // pieces only count where they COVER the struck part (`coversPart`); natural hide is the innermost layer.
  let blockable = rawDamage * (1 - armorPen);
  if ('equipment' in defender && defender.equipment) {
    const worn: { layer: number; defense: number }[] = [];
    for (const slot of ARMOUR_SLOTS) {
      const inst = (defender.equipment as Record<string, ItemInstance | undefined>)[slot];
      if (!inst) continue;
      const item = itemService.getItemById(inst.itemId);
      const baseAp = item?.armorProperties;
      if (!item || !baseAp || !coversPart(item, slot, partId)) continue;
      // §Q/§I: Masterwork/Famed scale the armour value by the stamped tier before it soaks.
      const scaled = scaleArmorQuality(baseAp, inst.quality, inst.famedStatMult);
      worn.push({ layer: SLOT_LAYER[slot] ?? 1, defense: scaled.defense });
    }
    worn.sort((a, b) => a.layer - b.layer);
    for (const w of worn) {
      blockable -= w.defense;
      if (blockable <= 0) {
        blockable = 0;
        break;
      }
    }
  }
  if (blockable > 0) {
    const natural = naturalArmorPoints(defender, def.armor ?? DEFAULT_ARMOR_SHARE, partId, turn);
    if (natural > 0) blockable = Math.max(0, blockable - natural);
  }
  const through = rawDamage * armorPen + blockable;
  return clamp((rawDamage - through) / rawDamage, 0, 1);
}

/** A defender's raw natural-armour scalar (hide/plate "weight") — a mob's `naturalArmor` or the sum of a
 *  pawn's trait `naturalArmor`. Drives the innate dodge drag (heavy hide = sluggish), NOT per-part soak. */
function entityNaturalArmor(defender: Pawn | Mob): number {
  if ('creatureId' in defender)
    return defender.naturalArmorOverride ?? getCreatureById(defender.creatureId)?.naturalArmor ?? 0;
  let s = 0;
  for (const t of defender.traits ?? []) s += t.naturalArmor ?? 0;
  return s;
}

/** Natural-armour DAMAGE POINTS at a part: a creature's hide (`naturalArmor`) or a pawn's cultural traits
 *  (ADR-029 `naturalArmor` sugar), the scalar distributed by the part's `share`, PLUS any explicit
 *  per-part `armorMods` (carapace back-heavy, soft belly). ADR-031: when `turn` is given, a mob's
 *  ACTIVE per-part hide wear (`hideWear`, chipped by blows this fight) is subtracted — worn-down hide
 *  soaks less until the fight ends and the wear expires. Floored at 0. */
function naturalArmorPoints(
  defender: Pawn | Mob,
  share: number,
  partId: BodyPartId,
  turn?: number
): number {
  let scalar = 0;
  let mods = 0;
  if ('creatureId' in defender) {
    const c = getCreatureById(defender.creatureId);
    // §2a: an individual elite's rolled hide toughness (naturalArmorOverride) supersedes the def scalar.
    scalar = defender.naturalArmorOverride ?? c?.naturalArmor ?? 0;
    for (const m of c?.armorMods ?? [])
      if (armorModHits(defender, m.target, partId)) mods += m.defense;
    let pts = scalar * share + mods;
    if (turn != null && pts > 0) {
      const wear = activeHideWear(defender as Mob, partId, turn);
      if (wear > 0) pts = Math.max(0, pts - wear);
    }
    return pts;
  }
  for (const t of defender.traits ?? []) {
    scalar += t.naturalArmor ?? 0;
    for (const m of t.armorMods ?? [])
      if (armorModHits(defender, m.target, partId)) mods += m.defense;
  }
  return scalar * share + mods;
}

/** A mob's live hide wear at a part — 0 unless a chip landed within the reset window (per-fight scratch). */
function activeHideWear(mob: Mob, partId: BodyPartId, turn: number): number {
  if (!mob.hideWear || mob.hideWearAt == null) return 0;
  if (turn - mob.hideWearAt > HIDE_WEAR_RESET_TICKS) return 0; // fight over — hide has settled
  return mob.hideWear[partId] ?? 0;
}

/** Does an `armorMods` target — a part id, a limb-group id, or `'all'` — apply to `partId`? */
function armorModHits(defender: Pawn | Mob, target: string, partId: BodyPartId): boolean {
  if (target === 'all' || target === partId) return true;
  return limbOfPart(defender, partId)?.id === target;
}

/** Total armour DAMAGE POINTS protecting a part (worn covering pieces + natural hide) — the "how plated
 *  is this spot" scan behind ADR-029 aimed targeting. Mirrors partArmorReduction's layer collection
 *  without running the subtraction. */
function partArmorPoints(defender: Pawn | Mob, partId: BodyPartId, turn?: number): number {
  const def = PART_DEF_MAP[partId];
  if (!def) return 0;
  let pts = 0;
  if ('equipment' in defender && defender.equipment) {
    for (const slot of ARMOUR_SLOTS) {
      const inst = (defender.equipment as Record<string, ItemInstance | undefined>)[slot];
      if (!inst) continue;
      const item = itemService.getItemById(inst.itemId);
      if (!item?.armorProperties || !coversPart(item, slot, partId)) continue;
      pts += scaleArmorQuality(item.armorProperties, inst.quality, inst.famedStatMult).defense;
    }
  }
  return pts + naturalArmorPoints(defender, def.armor ?? DEFAULT_ARMOR_SHARE, partId, turn);
}

/** ADR-029 skill-biased hit location (the CDDA crit-zone loop): roll the struck part as usual, but at
 *  `precision` — the attacker's full crit chance (`hit_precision` stat + weapon critMod, computed by the
 *  caller) — roll two extra candidate locations and take the LEAST ARMOURED: a skilled fighter works
 *  the gaps (eye/throat/belly) instead of clanging off the plate. One chance, two payoffs: a "crit"
 *  is both the damage spike AND the eye for openings; capacity-dimmed sight/consciousness aim worse. */
function aimedBodyPart(defender: Pawn | Mob, precision: number, turn?: number): BodyPartId {
  const plan = planOf(defender);
  const first = rollBodyPartOf(defender.limbs, plan);
  if (precision <= 0 || rng.random() >= precision) return first;
  let best = first;
  let bestArmor = partArmorPoints(defender, first, turn);
  for (let i = 0; i < 2; i++) {
    const cand = rollBodyPartOf(defender.limbs, plan);
    const a = partArmorPoints(defender, cand, turn);
    if (a < bestArmor) {
      best = cand;
      bestArmor = a;
    }
  }
  return best;
}

function currentPartHealth(defender: Pawn | Mob, partId: BodyPartId, defMaxHp: number): number {
  if (!('limbs' in defender) || !defender.limbs) return defMaxHp;
  const partState = limbOfPart(defender, partId)?.parts?.find((p) => p.id === partId);
  return partState?.health ?? defMaxHp;
}

// ── Implementation ────────────────────────────────────────────────────────────
class CombatServiceImpl implements CombatService {
  /** True only for the duration of `tickCombat`. While set, the per-hit entity appliers write the
   *  changed entity into its array SLOT in place instead of rebuilding the whole array via `.map()` —
   *  a 420-mob wave was doing dozens of full-array rebuilds per tick (the engagement-wave alloc tax,
   *  ADR-002 hot-phase amendment). Outside combat (public `applyInjury*`, called immutably by tests)
   *  it stays false → immutable rebuild. */
  private _combatWorking = false;
  /** COPY-ON-WRITE flags: whether `next.mobs`/`next.pawns` have been cloned into a PRIVATE array this
   *  tick yet. The arrays are cloned LAZILY on the first hit that writes to them (not upfront) so a
   *  peace tick — the overwhelmingly common case — allocates nothing (cloning both 420-mob + pawns
   *  arrays every tick regardless of combat was itself a perf regression). Reset each `tickCombat`. */
  private _mobsOwned = false;
  private _pawnsOwned = false;

  /** Write `updated` back into its array. In combat-working mode: clone the target array ONCE on first
   *  write (copy-on-write — the caller threads the returned state forward), then overwrite the slot in
   *  place; outside combat, rebuild immutably. Either way `updated` is a NEW object, so cold-field refs
   *  stay fresh for the snapshot diff AND the index-aligned fresh-corpse diff (`handleFreshCombatCorpses`)
   *  still sees the old object in `preCombatState` vs the new one here. */
  private spliceEntity<T extends Pawn | Mob>(
    state: GameState,
    id: string,
    updated: T,
    isMob: boolean
  ): GameState {
    if (this._combatWorking) {
      if (isMob) {
        if (!state.mobs) return state;
        let mobs = state.mobs;
        if (!this._mobsOwned) {
          mobs = mobs.slice();
          state = { ...state, mobs };
          this._mobsOwned = true;
        }
        const idx = mobs.findIndex((e) => e.id === id);
        if (idx >= 0) mobs[idx] = updated as Mob;
      } else {
        let pawns = state.pawns;
        if (!this._pawnsOwned) {
          pawns = pawns.slice();
          state = { ...state, pawns };
          this._pawnsOwned = true;
        }
        const idx = pawns.findIndex((e) => e.id === id);
        if (idx >= 0) pawns[idx] = updated as Pawn;
      }
      return state;
    }
    return isMob
      ? { ...state, mobs: state.mobs!.map((m) => (m.id === id ? (updated as Mob) : m)) }
      : { ...state, pawns: state.pawns.map((p) => (p.id === id ? (updated as Pawn) : p)) };
  }

  resolveHit(
    attacker: Pawn | Mob,
    defender: Pawn | Mob,
    state: GameState,
    override?: RangedOverride
  ): HitResult {
    const {
      str,
      dex,
      baseDamage,
      accuracy,
      damageType,
      bluntMod,
      stunChance,
      armorPen,
      weaponId,
      staminaCost,
      critMod,
      finesse,
      arcane,
      bloodletting
    } = override
      ? override.profile
      : attackerProfile(attacker, this.entityDistance(attacker, defender));
    // Evasion uses the `dodge` stat (DEX − weight, × moving) rather than raw dexterity, so injury,
    // load, and the winded penalty (× 0.5) all lower it. ×20 keeps baseline parity with the old
    // `defDex × 2` term (dodge ≈ 1.0 at DEX 10 → 20).
    // Natural-armour weight is an innate dodge drag (heavy-hided beasts evade worse) — subtracted from
    // the base dodge before condition/shield scaling, floored at 0.
    const armorDrag = entityNaturalArmor(defender) * NATURAL_ARMOR_DODGE_DRAG;
    const defDodge =
      Math.max(0, pawnStatService.evaluateStat('dodge', defender) - armorDrag) *
      this.conditionDodgeMult(defender) * // injuries, winded, AND encumbrance (heavy load = easier to hit)
      (getGrip(defender) === 'shield' ? SHIELD_DODGE_MULT : 1); // BB: a shield raises evasion, not a block

    // MELEE gets the sane base (BASE_MELEE_HIT ± DEX/dodge edges). RANGED keeps its OWN calibrated
    // curve — its `hitMod` IS rangedAccuracyMod (aim_accuracy + distance + cover), layered on the
    // original DEX/dodge terms; don't double-buff it with the melee base. The attacker's encumbrance
    // spoils aim either way (conditionHitMult < 1 when encumbered/winded).
    const toHit = override
      ? dex * 3 + accuracy * MELEE_ACCURACY_WEIGHT + (override.hitMod ?? 0) - defDodge * 20
      : BASE_MELEE_HIT +
        (dex - 10) * DEX_HIT_WEIGHT +
        accuracy * MELEE_ACCURACY_WEIGHT -
        (defDodge - 1.0) * DODGE_HIT_WEIGHT;
    const hitChance = clamp(toHit * this.conditionHitMult(attacker), 5, 95);
    if (rng.random() * 100 > hitChance) {
      return {
        hit: false,
        bodyPart: null,
        damage: 0,
        injury: null,
        knockdown: false,
        crit: false,
        damageType,
        weaponId,
        staminaCost
      };
    }

    // Roll a hit location from the DEFENDER's own LIVE body tree (a wolf rolls paws/tail, not fingers;
    // §3d a pawn's GRAFTED wings/tail are hittable; an already-severed part can't be struck again).
    // Falls back to the static plan table for entities without a modelled tree (test fixtures).
    // Crit: base hit_precision stat (DEX/PER + capacities) plus this weapon's critMod.
    // A crit multiplies the post-mitigation damage — so a high-crit build with a
    // high-crit weapon spikes hard.
    const critChance = clamp(
      pawnStatService.evaluateStat('hit_precision', attacker) + critMod,
      0,
      CRIT_CHANCE_CAP
    );
    const crit = rng.random() < critChance;

    // ADR-029 skill-biased location: under the SUBTRACTIVE model an armoured part can fully negate a
    // weak hit, so a skilled fighter must FIND THE GAP — at the SAME hit_precision that governs crits
    // (stats.jsonc: DEX/PER × consciousness × sight, + the weapon's critMod, so a crit-prone stiletto
    // finds gaps more often), the attacker rolls extra candidate locations and takes the least-armoured
    // one (eye/throat/belly over plate).
    const partId = aimedBodyPart(defender, critChance, state.turn);
    const partDef = PART_DEF_MAP[partId]!;
    // The defender's part may be bodyScale-scaled; severity/fracture use its ACTUAL maxHp.
    const partMaxHp =
      limbOfPart(defender, partId)?.parts?.find((p) => p.id === partId)?.maxHp ?? partDef.maxHp;

    // Damage: baseDamage × str / STAT_SCALE, then armour + resistance reduce it,
    // then the crit multiplier. STAT_SCALE=10 matches the real stat range (5–22).
    // Ranged weapons with strScaled:false (crossbow/sling) bypass STR scaling — mechanical advantage.
    // Power stat for the damage roll: STR normally, but a FINESSE weapon (rapier) scales with PER and an
    // ARCANE weapon (§M elemental staff) with INT — a precise thrust / a focused mind finds the vital, no
    // brute force needed. Ranged (strScaled:false) bypasses both.
    const powerStat = arcane
      ? (attacker.stats.intelligence ?? 10)
      : finesse
        ? (attacker.stats.perception ?? 10)
        : str;
    const raw =
      override && !override.strScaled ? baseDamage : (baseDamage * powerStat) / STAT_SCALE;
    const armorRed = partArmorReduction(defender, partId, armorPen, raw, state.turn);
    const physRes = physicalResistance(defender, damageType);
    const mitigated = raw * (1 - armorRed) * (1 - physRes);
    const scaled = mitigated * (crit ? CRIT_MULTIPLIER : 1);
    // ADR-029: armour can FULLY stop a weak hit — 0 damage (was floored at 1). A 0 means the blow
    // clanged off; the wound below is a no-op (severity/bleed/fracture all gate on hpMissing > 0).
    const final = scaled <= 0 ? 0 : Math.max(1, Math.round(scaled));

    const prevHealth = currentPartHealth(defender, partId, partMaxHp);
    const newHealth = Math.max(0, prevHealth - final);
    const hpMissing = (partMaxHp - newHealth) / partMaxHp;

    // This-hit wound increment. The damage type picks the wound (cut/puncture/crush/
    // burn); accumulation, final severity, bleed rate and pain are computed when the
    // wound is merged into the part (applyInjury) — same-type hits stack into one.
    const woundDef = woundForDamageType(damageType);
    const injury: Injury = {
      bodyPart: partId,
      type: woundDef.id as Injury['type'],
      severity: severityFromFrac(hpMissing),
      damage: final,
      // Bleed cue: an open-wound type (cut/puncture) OR any hit that blows the part off (stump gush).
      bleeding: (woundDef.bleedMod > 0 || hpMissing >= 1.0) && hpMissing > 0 ? 1 : 0,
      painContribution: 0,
      infected: false,
      // §3b bleed-weapon: at the weapon's `bloodletting` chance, the open wound never self-clots —
      // it flows until a caretaker dresses it (the physical successor of `bloodletting`).
      ...(bloodletting && woundDef.bleedMod > 0 && hpMissing > 0 && rng.random() < bloodletting
        ? { bloodletting: true }
        : {})
    };

    // Knockdown/stun: blunt hits roll chance from damage vs constitution, PLUS the weapon's flat
    // `stunChance` (maces/hammers stun regardless of damage type). Reduced by knockdown_resistance.
    const defCon = defender.stats.constitution ?? 10;
    const stunResist = clamp(
      pawnStatService.evaluateStat('knockdown_resistance', defender),
      0.1,
      2
    );
    const knockChance = clamp(
      ((damageType === 'blunt' ? (final - defCon / 4) * bluntMod : 0) + stunChance * 100) /
        stunResist,
      0,
      100
    );
    const knockdown = knockChance > 0 && rng.random() * 100 < knockChance;

    // Fracture roll: the blow ALSO loads the bone beneath the flesh wound, INDEPENDENTLY of the flesh crush
    // (see BONE_TRANSFER_*). The fracture is a SEPARATE wound on the SKELETON the struck flesh wraps
    // (head→skull, forearm→forearmBone, chest→ribcage). Enough accumulated bone damage BREAKS it
    // (cripples the limb without severing — see _applyInjuryToEntity / boneBroken). A soft part with no
    // skeleton child (abdomen, eyes, organs) routes nowhere and can't fracture.
    let fractureInjury: Injury | null = null;
    const boneTargetId = skeletonPartOf(partId);
    if (boneTargetId != null && hpMissing > 0) {
      const isBlunt = damageType === 'blunt';
      const boneHp = BONE_FRACTION * partMaxHp; // the bone's break budget, scaled to this creature
      // Bone load is rolled from the RAW force, not the flesh `final`: type-based transfer, shielded by
      // worn armour but not flesh toughness, with a per-blow variance — so the two depths diverge.
      const transfer = isBlunt ? BONE_TRANSFER_BLUNT * bluntMod : BONE_TRANSFER_OTHER;
      const variance = 1 + (rng.random() * 2 - 1) * BONE_DAMAGE_VARIANCE;
      const boneDamage = Math.max(
        1,
        Math.round(raw * transfer * (1 - armorRed) * (crit ? CRIT_MULTIPLIER : 1) * variance)
      );
      // Chance scales with how hard the BONE was loaded (not the flesh crush), capped so it's never sure.
      // ADR-031: precision (the same critChance driving crits/gap-aiming) multiplies it — a placed blow
      // lands square on the bone.
      const fractureChance = clamp(
        (isBlunt ? FRACTURE_BLUNT_BASE : FRACTURE_OTHER_BASE) *
          (boneDamage / boneHp) *
          (1 + critChance * K_PRECISION_FRACTURE),
        0,
        isBlunt ? FRACTURE_BLUNT_CAP : FRACTURE_OTHER_CAP
      );
      if (rng.random() < fractureChance) {
        fractureInjury = {
          bodyPart: boneTargetId,
          type: 'fracture',
          // Severity against the bone's break budget — overwritten on merge by recomputeWound, but kept
          // consistent for the single-hit/test path.
          severity: severityFromFrac(boneDamage / boneHp),
          damage: boneDamage,
          bleeding: 0,
          painContribution: 0,
          infected: false
        };
      }
    }

    // Organ-penetration roll: a deep blow into a body cavity can reach an organ inside, INDEPENDENTLY of
    // the flesh wound — the soft-tissue twin of the fracture roll above. A shallow laceration across the
    // abdomen wall just chips the container HP; only a thrust / hard hit finds the kidney or liver. (The
    // destruction cascade still takes ALL contents when the cavity itself is gone — that path is separate.)
    let organInjury: Injury | null = null;
    const organCandidates = organsOf(partId);
    if (organCandidates.length > 0 && hpMissing > 0) {
      const isPenetrating = damageType === 'piercing' || damageType === 'cutting';
      const transfer = isPenetrating ? ORGAN_TRANSFER_PENETRATING : ORGAN_TRANSFER_BLUNT;
      const variance = 1 + (rng.random() * 2 - 1) * ORGAN_DAMAGE_VARIANCE;
      // Force driven inward this blow — shielded by worn armour (not flesh toughness), exactly like bone load.
      const organDamage = Math.max(
        1,
        Math.round(raw * transfer * (1 - armorRed) * (crit ? CRIT_MULTIPLIER : 1) * variance)
      );
      // Chance scales with that inward force vs the CAVITY's mass (a small thrust into a big torso rarely
      // finds an organ; a hard deep blow does), capped so an organ hit is never a sure thing.
      // ADR-031: precision multiplies it — the deft thrust is GUIDED to the kidney/carotid, so a skilled
      // fighter beats a tank's hide by placement where a mook's identical force glances off.
      const organChance = clamp(
        (isPenetrating ? ORGAN_PENETRATE_BASE : ORGAN_BLUNT_BASE) *
          (organDamage / partMaxHp) *
          (1 + critChance * K_PRECISION_ORGAN),
        0,
        isPenetrating ? ORGAN_PENETRATE_CAP : ORGAN_BLUNT_CAP
      );
      if (rng.random() < organChance) {
        // Which organ the blow found — weighted by size (a bigger organ is a bigger target), among the ones
        // this defender ACTUALLY still has (body plans vary; a destroyed organ is no longer there to hit).
        const present = organCandidates
          .map((id) => limbOfPart(defender, id)?.parts?.find((p) => p.id === id && !p.isMissing))
          .filter((p): p is BodyPartState => p != null);
        if (present.length > 0) {
          const totalW = present.reduce((s, p) => s + p.maxHp, 0);
          let pick = rng.random() * totalW;
          let chosen = present[0];
          for (const p of present) {
            pick -= p.maxHp;
            if (pick <= 0) {
              chosen = p;
              break;
            }
          }
          organInjury = {
            bodyPart: chosen.id,
            type: injury.type, // same damage class as the flesh wound (puncture / cut / crush)
            // Provisional severity vs the organ's own HP — recomputeWound overwrites it on apply/merge.
            severity: severityFromFrac(organDamage / chosen.maxHp),
            damage: organDamage,
            bleeding: 0,
            painContribution: 0,
            infected: false,
            // ADR-031: a nicked ARTERY (carotid/femoral) never self-clots — it flows until a caretaker
            // dresses it (the physical successor of `bloodletting`), so finding the throat/femoral is a
            // slow bleed-out kill. Only matters when the wound actually bleeds (a piercing/cutting hit;
            // a blunt crush has bleedMod 0 so the flag is inert). recomputeWound carries the flag on merge.
            ...(PART_DEF_MAP[chosen.id]?.artery ? { bloodletting: true } : {})
          };
        }
      }
    }

    return {
      hit: true,
      bodyPart: partId,
      damage: final,
      injury,
      fractureInjury,
      organInjury,
      knockdown,
      crit,
      damageType,
      weaponId,
      staminaCost,
      // Round for display only: per-tick fractional healing leaves part HP at e.g. 41.00001…, which
      // leaked into the combat chronicle as "41.00001616999995/70". Sim math keeps the raw value.
      partRemainingHp: Math.round(newHealth),
      partMaxHp: partDef.maxHp
    };
  }

  private _applyInjuryToEntity<T extends Pawn | Mob>(
    entity: T,
    injury: Injury,
    state: GameState,
    entityType: 'pawn' | 'mob',
    knockdown: boolean
  ): GameState {
    const partDef = PART_DEF_MAP[injury.bodyPart];
    if (!partDef) return state;

    // The limb that holds this part — found in the entity's OWN tree (plan-agnostic), falling back to
    // the plan's structural mapping so a part absent from a sparse tree (test fixtures) is still created.
    const targetLimbId =
      limbOfPart(entity, injury.bodyPart)?.id ?? parentLimbOf(planOf(entity), injury.bodyPart);

    // ── Update limb tree: merge this hit into the part's same-type wound ──────
    // A severed container takes its contents (cascadeSeveredContents → gutted chest takes heart/lungs).
    // Whether the resulting body is dead is decided ONCE below by lethalAnatomyCause(limbs).
    const limbs: LimbState[] = (entity.limbs ?? []).map((limb) => {
      if (limb.id !== targetLimbId) return limb;

      const existing: BodyPartState[] = limb.parts ?? [];
      const idx = existing.findIndex((p) => p.id === injury.bodyPart);
      const prev: BodyPartState =
        idx >= 0
          ? existing[idx]
          : {
              id: injury.bodyPart,
              health: partDef.maxHp,
              maxHp: partDef.maxHp,
              isMissing: false,
              injuries: []
            };
      // The part's ACTUAL (bodyScale-scaled) maxHp — set at spawn — drives severity, accum cap, and the
      // bone-break threshold, NOT the default-scale catalog value.
      const maxHp = prev.maxHp || partDef.maxHp;

      // Fracture HP handling. A distinct `skeleton` bone (hitWeight 0 — never struck directly) is pure
      // bone, so a fracture is the ONLY thing that damages it: chip its HP 1:1 with the accumulated bone
      // damage, so the bar empties exactly as the bone breaks (no more "full HP + serious fracture"). A
      // `bone: true` flesh-wrapped bone (skull) already lost HP to the crush from the same blow, so ITS
      // fracture stays break-only (no double-chip). Non-structural soft wounds reduce HP as before.
      const isStructural = woundById(injury.type)?.structural === true;
      const chipsBone = isStructural && partDef.skeleton === true;

      // Stack: one wound per type per part. Same-type hits accumulate damage and
      // escalate severity (5 crushes → one severe crush) instead of piling up.
      const wIdx = prev.injuries.findIndex((w) => w.type === injury.type);
      const prevW = wIdx >= 0 ? prev.injuries[wIdx] : undefined;
      const accum = Math.min((prevW?.damage ?? 0) + injury.damage, maxHp);
      // §3b: a bleed-weapon hit makes the (merged) wound unclottable — OR the flags so a raking-claw
      // follow-up on an ordinary cut upgrades it, and an ordinary hit never clears an existing flag.
      const mergePrev =
        injury.bloodletting && !prevW?.bloodletting
          ? { ...(prevW ?? { infected: false }), bloodletting: true }
          : prevW;
      const merged = recomputeWound(
        injury.bodyPart,
        injury.type,
        accum,
        mergePrev,
        state.turn,
        maxHp
      );
      const woundList =
        wIdx >= 0
          ? prev.injuries.map((w, i) => (i === wIdx ? merged : w))
          : [...prev.injuries, merged];

      const newHp = chipsBone
        ? Math.max(0, maxHp - accum) // pure bone: HP == remaining fracture budget
        : isStructural
          ? prev.health
          : Math.max(0, prev.health - injury.damage);

      const updatedPart: BodyPartState = {
        ...prev,
        health: newHp,
        // Soft-tissue destruction SEVERS the part; structural (fracture) destruction BREAKS the bone.
        isMissing: prev.isMissing || (merged.severity === 'destroyed' && !isStructural),
        boneBroken:
          prev.boneBroken ||
          (isStructural && partDef.boneHp != null && accum >= boneBreakBudget(partDef, maxHp)),
        injuries: woundList
      };
      const mergedParts =
        idx >= 0
          ? existing.map((p, i) => (i === idx ? updatedPart : p))
          : [...existing, updatedPart];

      // Containment cascade: when this part is DESTROYED, everything nested inside it goes too — a gutted
      // abdomen takes liver/stomach/kidneys, a caved-in chest takes heart/lungs/spine/ribcage. "Destroyed"
      // is EITHER severed (soft-tissue blown clean off → isMissing) OR caved in to 0 HP. The HP arm is the
      // fix for the "0-HP chest, pristine heart" regression: a chest beaten to 0 by MIXED wound types (a
      // serious crush + a serious puncture — neither alone reaching 'destroyed'/sever) left its organs
      // intact inside a flattened cavity, a walking corpse. cascadeSeveredContents is idempotent (it skips
      // contents already gone), so re-running it while the part sits at 0 HP is a harmless no-op.
      const cascade =
        updatedPart.isMissing || updatedPart.health <= 0
          ? cascadeSeveredContents(mergedParts, updatedPart.id)
          : { parts: mergedParts, lostVital: false };
      const newParts = cascade.parts;

      // Bleed rate = sum of all current part-wound bleed (falls as wounds heal),
      // and the root-limb health is the mass-weighted health of its parts.
      const totalBleed = newParts.reduce(
        (sum, p) => sum + p.injuries.reduce((s, w) => s + w.bleeding, 0),
        0
      );
      const partMaxTotal = newParts.reduce((s, p) => s + p.maxHp, 0);
      const partHealthTotal = newParts.reduce((s, p) => s + p.health, 0);
      const rolledHealth =
        partMaxTotal > 0 ? Math.round((partHealthTotal / partMaxTotal) * 100) : limb.health;

      return { ...limb, parts: newParts, health: rolledHealth, bleedRate: totalBleed };
    });

    // ── Entity-level fields. Pain is the SUM of all active wounds (so it falls as
    //    wounds heal), and the flat injuries list mirrors the merged part wounds. ──
    let painTotal = 0;
    const newInjuries: Injury[] = [];
    for (const l of limbs) {
      for (const p of l.parts ?? []) {
        for (const w of p.injuries) {
          painTotal += w.painContribution;
          newInjuries.push(w);
        }
      }
    }
    const newPain = clamp(Math.round(painTotal), 0, 100);

    // (Blood loss no longer writes a `blood_loss` condition — it folds into `shock`, derived from
    // pain OR blood-loss fraction in tickConditions/stepHunger. Combat leaves `conditions` untouched.)

    // Transient conditions. Knockdown = a blunt stagger scaled by the blow (this swing rolled one).
    // Collapse = loss of consciousness (pain + blood loss + organ damage, via the
    // capacity), kept active while it stays low; the pawn state machine clears it as
    // the pawn recovers. Deliberately distinct: a stagger is momentary, a collapse
    // ends the fight.
    const consciousness =
      pawnStatService.computeCapacities({ ...entity, limbs, injuries: newInjuries } as T)
        .consciousness ?? 1;
    const collapsed = consciousness < COLLAPSE_CONSCIOUSNESS;
    const durations = { ...(entity.conditionTimers ?? {}) };
    if (knockdown) {
      // Floor (reliably costs the next attack) + scale by this blow's blunt damage, capped.
      const kd = Math.min(
        KNOCKDOWN_MAX_TURNS,
        KNOCKDOWN_FLOOR_TURNS + Math.round(injury.damage * KNOCKDOWN_TURNS_PER_DAMAGE)
      );
      durations.knockdown = Math.max(durations.knockdown ?? 0, kd);
    }
    if (collapsed) durations.collapse = Math.max(durations.collapse ?? 0, COLLAPSE_KEEPALIVE_TURNS);
    const transientConditions = [...(entity.transientConditions ?? [])];
    const cpos = this.entityPos(entity);
    let condTier = 1; // stack each new condition label below the damage number (tier × ~13px)
    for (const id of ['knockdown', 'collapse']) {
      if ((durations[id] ?? 0) > 0 && !transientConditions.includes(id)) {
        transientConditions.push(id);
        // Newly latched this hit → pop its floater (below the damage number performAttack emits).
        this.emitConditionFloat(cpos.x, cpos.y, id, 13 * condTier++);
      }
    }

    const updated = {
      ...entity,
      limbs,
      injuries: newInjuries,
      pain: newPain,
      conditionTimers: durations,
      transientConditions
    };

    // Resolution: lethal anatomy is instant death — a destroyed vital organ (hit directly, crushed to
    // 0 HP, or taken when its container was gutted) or a head/torso at 0 HP. ONE shared rule
    // (lethalAnatomyCause), identical to the per-tick pawn/mob reapers, so a body that's dead by the
    // reaper's standard never survives the blow that made it so. Otherwise a collapse takes the entity
    // out of the fight WITHOUT killing it — a mob goes DOWN into the recoverable `Collapsed` state (the
    // same one starvation uses), exactly like a pawn. Death comes ONLY from lethal anatomy or from
    // bleeding out (blood ≤ 0, handled per-tick in entityLifecycle) — NOT from a single blunt blow that
    // merely tips an already-shocked creature under the consciousness floor. A downed mob lies there and
    // recovers as consciousness climbs, bleeds out, or is finished off (willFinishOffDowned).
    if (lethalAnatomyCause(limbs)) {
      if (entityType === 'pawn') {
        (updated as Pawn).isAlive = false;
        (updated as Pawn).currentState = 'Dead';
      } else {
        (updated as Mob).isAlive = false;
        (updated as Mob).state = 'Corpse';
        (updated as Mob).diedAt = state.turn;
        (updated as Mob).intactness = 1.0;
      }
    } else if (collapsed && entityType === 'mob' && (updated as Mob).state !== 'Collapsed') {
      (updated as Mob).state = 'Collapsed';
      (updated as Mob).stateSince = state.turn;
      (updated as Mob).path = [];
      (updated as Mob).huntTargetId = undefined;
    }

    // LINEAGES-II §4: a crushing blow ENDURED feeds the crustacean awakening (meter-pawns only — the
    // lineagePaths gate keeps this off every ordinary hit).
    if (
      entityType === 'pawn' &&
      (updated as Pawn).lineagePaths?.length &&
      injury.type === 'crush'
    ) {
      const deeds = ((updated as Pawn).deeds ??= {});
      deeds.bluntHitsTaken = (deeds.bluntHitsTaken ?? 0) + 1;
    }

    return this.spliceEntity(state, entity.id, updated, entityType === 'mob');
  }

  applyInjury(pawnId: string, injury: Injury, state: GameState, knockdown = false): GameState {
    const pawn = state.pawns.find((p) => p.id === pawnId);
    if (!pawn) return state;
    return this._applyInjuryToEntity(pawn, injury, state, 'pawn', knockdown);
  }

  applyInjuryToMob(mobId: string, injury: Injury, state: GameState, knockdown = false): GameState {
    const mob = state.mobs?.find((m) => m.id === mobId);
    if (!mob) return state;
    return this._applyInjuryToEntity(mob, injury, state, 'mob', knockdown);
  }

  // ── Combat feedback helpers ────────────────────────────────────────────────
  /** Display name for the Chronicle / floating text. */
  private entityName(e: Pawn | Mob): string {
    if ('entityClass' in e) {
      // A T5 boss carries a procedural legend name (e.name); ordinary mobs read the def name.
      const base = e.name ?? getCreatureById(e.creatureId)?.name;
      return base ? `${base} #${e.debugId ?? e.id.slice(-4)}` : e.id;
    }
    return e.name;
  }

  /** Live tile coordinate of an entity (mobs carry x/y, pawns a position object). */
  private entityPos(e: Pawn | Mob): { x: number; y: number } {
    if ('entityClass' in e) return { x: e.x, y: e.y };
    return { x: e.position?.x ?? -1, y: e.position?.y ?? -1 };
  }

  private emitFloat(x: number, y: number, kind: CombatTextKind, text: string, dy?: number): void {
    if (x < 0 || y < 0) return;
    simLog.pushCombatText({ worldX: x, worldY: y, text, kind, dy });
  }

  /** Pop a data-driven condition label (name + colour from conditions.jsonc) the tick a flagged
   *  condition latches. No-op for unflagged conditions, so callers can fire it unconditionally. */
  private emitConditionFloat(x: number, y: number, id: string, dy?: number): void {
    if (x < 0 || y < 0) return;
    const f = getConditionFloater(id);
    if (!f) return;
    simLog.pushCombatText({
      worldX: x,
      worldY: y,
      text: f.name,
      kind: 'condition',
      color: f.color,
      dy
    });
    const sound = conditionAudio(id);
    if (sound) simLog.pushCombatSound({ sound, worldX: x, worldY: y });
  }

  /**
   * Resolve one swing from attacker → target: roll, apply injury, surface floating
   * text + engagement log, and report a kill. Returns the updated state plus the
   * stamina this swing drained (deducted by the caller regardless of hit/miss).
   * Misses are surfaced too (as a "dodge") so the defender's evasion is visible.
   */
  private performAttack(
    attacker: Pawn | Mob,
    target: Pawn | Mob,
    state: GameState,
    turn: number,
    override?: RangedOverride
  ): { state: GameState; staminaCost: number } {
    const result = this.resolveHit(attacker, target, state, override);
    const pos = this.entityPos(target);

    // KINGDOMS-TRADE §3: a colonist raising a hand against a kingdom's party member is an act of
    // war — the sending kingdom flips hostile immediately (relation floored; -200 clamps to -100).
    if (!('entityClass' in attacker) && 'entityClass' in target && (target as Mob).kingdomId) {
      const kid = (target as Mob).kingdomId!;
      const rel = kingdomService.colonyRelationTo(state, kid);
      if (rel && rel.score > -100) {
        state = kingdomService.adjustColonyRelation(state, kid, -200);
      }
    }

    // SOCIAL-LAYER §1: a colonist striking a fellow colonist (a brawl, a stray blow) sours the
    // pair hard. Only landed hits count — a parried swing leaves no wound to resent.
    if (
      result.hit &&
      !('entityClass' in attacker) &&
      !('entityClass' in target) &&
      attacker.id !== target.id
    ) {
      state = socialService.onFriendlyFire(state, attacker as Pawn, target as Pawn);
    }

    // Visual lunge: thrust the attacker glyph toward the struck tile and snap it back
    // (renderer-only; emitted for hit AND miss so the swing reads regardless of outcome).
    const apos = this.entityPos(attacker);
    const ldx = pos.x - apos.x;
    const ldy = pos.y - apos.y;
    const lmag = Math.hypot(ldx, ldy) || 1;
    simLog.pushAttackLunge({ attackerId: attacker.id, dirX: ldx / lmag, dirY: ldy / lmag });
    // Weapon swing SFX (hit or miss) — the weapon / natural-weapon `audio` archetype at the struck tile.
    const swingSound = itemService.getItemById(result.weaponId)?.audio;
    if (swingSound) simLog.pushCombatSound({ sound: swingSound, worldX: pos.x, worldY: pos.y });

    const attackerName = this.entityName(attacker);
    const targetName = this.entityName(target);
    const isTargetMob = 'entityClass' in target;
    // Chronicle-scope: only log this engagement if the colony could see it (any pawn within sight range
    // of the struck tile). A pawn-vs-mob fight is always witnessed (the pawn is at/adjacent to `pos`); a
    // wildlife brawl off across the map drops out, so the chronicle stays the colony's own record.
    const witnessed = isWitnessedByColony(
      state.pawns,
      pos.x,
      pos.y,
      getAmbientLight(turn),
      weatherSightMul(state.weather?.type)
    );

    // Miss → no injury, but log + show the dodge. The swing still cost stamina.
    if (!result.hit) {
      this.emitFloat(pos.x, pos.y, 'dodge', 'dodge');
      if (witnessed)
        simLog.logCombatSwing(
          attacker.id,
          attackerName,
          target.id,
          targetName,
          turn,
          pos.x,
          pos.y,
          {
            turn,
            attackerName,
            defenderName: targetName,
            hit: false,
            weapon: result.weaponId
          }
        );
      return { state, staminaCost: result.staminaCost };
    }
    if (!result.injury) return { state, staminaCost: result.staminaCost };

    let next = isTargetMob
      ? this.applyInjuryToMob(target.id, result.injury, state, result.knockdown)
      : this.applyInjury(target.id, result.injury, state, result.knockdown);

    // A fracture from the same blow lands as a second (bone) wound — no extra knockdown.
    if (result.fractureInjury) {
      next = isTargetMob
        ? this.applyInjuryToMob(target.id, result.fractureInjury, next, false)
        : this.applyInjury(target.id, result.fractureInjury, next, false);
      this.emitFloat(pos.x, pos.y, 'fracture', 'Fractured!', 26);
      const fxSound = conditionAudio('fractured');
      if (fxSound) simLog.pushCombatSound({ sound: fxSound, worldX: pos.x, worldY: pos.y });
    }

    // An organ-penetration from the same blow lands as a third (internal) wound — no extra knockdown. The
    // organ's HP loss flows into its capacity (kidney → blood_filtration, lung → breathing) via PawnStatService.
    if (result.organInjury) {
      next = isTargetMob
        ? this.applyInjuryToMob(target.id, result.organInjury, next, false)
        : this.applyInjury(target.id, result.organInjury, next, false);
      this.emitFloat(pos.x, pos.y, 'fracture', 'Organ hit!', 26);
    }

    // Floating text: damage number — a rolled crit OR a part-wrecking hit reads as
    // 'crit'; plus a secondary knockdown / bleed cue.
    const critFloater =
      result.crit ||
      result.injury.severity === 'critical' ||
      result.injury.severity === 'destroyed';
    this.emitFloat(
      pos.x,
      pos.y,
      critFloater ? 'crit' : 'damage',
      result.crit ? `-${result.injury.damage}!` : `-${result.injury.damage}`
    );
    // Secondary bleed cue shares the struck tile + spawn instant with the damage number above, so
    // push it DOWN ~13px to stack below it. Knockdown/collapse now surface as data-driven condition
    // floaters from _applyInjuryToEntity (same tier), so suppress the bleed cue when knocked down to
    // avoid two labels colliding on the same row.
    if (!result.knockdown && result.injury.bleeding > 0)
      this.emitFloat(pos.x, pos.y, 'bleed', 'bleed', 13);

    if (witnessed)
      simLog.logCombatSwing(attacker.id, attackerName, target.id, targetName, turn, pos.x, pos.y, {
        turn,
        attackerName,
        defenderName: targetName,
        hit: true,
        damage: result.injury.damage,
        injury: result.injury.bodyPart,
        knockdown: result.knockdown,
        crit: result.crit,
        weapon: result.weaponId,
        bodyPart: result.injury.bodyPart,
        damageType: result.damageType,
        partMaxHp: result.partMaxHp,
        partRemainingHp: result.partRemainingHp,
        bleeding: result.injury.bleeding > 0,
        woundType: result.injury.type,
        woundSeverity: result.injury.severity
      });

    const after = isTargetMob
      ? next.mobs?.find((m) => m.id === target.id)
      : next.pawns.find((p) => p.id === target.id);
    const justDied =
      !!after && (after.isAlive === false || ('state' in after && after.state === 'Corpse'));
    if (witnessed && justDied) {
      simLog.logCombatKill(
        attacker.id,
        attackerName,
        target.id,
        targetName,
        turn,
        pos.x,
        pos.y,
        result.weaponId
      );
      // PAWN-MEMORY: a colonist's kill is talked about — nearby pawns remember who dropped what, and
      // may bring it up in banter (on the spot or later). Only a COLONY pawn's kill (mobs have entityClass).
      if (!('entityClass' in attacker) && attacker.isAlive !== false) {
        memoryService.recordAroundKind(next, pos.x, pos.y, attacker.id, 'combat', {
          subjectName: attackerName.split(' ')[0],
          detail: targetName
        });
      }
    }
    // LINEAGES §4: a pawn's kill feeds the Beast/Werewolf/Arachnid awakening deeds (regardless of whether
    // the colony saw it). By creature family + whether the killing blow was unarmed (fists / natural weapon).
    if (justDied && isTargetMob && 'traits' in attacker)
      creditKillDeeds(attacker, target as Mob, result.weaponId, turn);
    // SOCIAL-LAYER §1: colonists who stood together when the beast fell share the bond — every pawn
    // near the kill gets pairwise `battle_forged` points (deduped inside to once per pair per day).
    if (justDied && isTargetMob && !('entityClass' in attacker)) {
      next = socialService.onFoughtTogether(next, attacker as Pawn, pos.x, pos.y);
    }
    // On-hit status effect: venom/bleed/screech/tongue natural weapons roll to inflict a timed
    // transient condition (mitigated by the defender's resistance stat). Applied to the post-injury
    // state so it stacks onto the same target update.
    const afterEffect = this.applyOnHitEffect(
      next,
      attacker,
      target.id,
      isTargetMob,
      result.weaponId,
      pos
    );

    // Spear KNOCKBACK: a landed reach-weapon hit may shove the target back one tile (STR-scaled). Not
    // for a ranged shot (no `override`) — only a melee thrust in contact/reach drives someone back.
    const afterKnock = override
      ? afterEffect
      : this.applyKnockback(afterEffect, attacker, target, isTargetMob, result.weaponId, apos);

    // Every landed blow chips condition: the attacker's weapon + the defender's struck armour.
    const armorLoss = this.computeArmorDamage(attacker, result.damageType, !!override);
    let worn = this.applyGearWear(afterKnock, attacker, target, armorLoss);
    // ADR-031: the same blow chips a creature's NATURAL hide at the struck part (per-fight wear,
    // subtracted from its soak by naturalArmorPoints) — the attrition counter to a subtractive tank.
    if (isTargetMob && armorLoss > 0 && result.bodyPart) {
      worn = this.chipNaturalHide(worn, target.id, result.bodyPart, armorLoss, turn);
    }
    return {
      state: worn,
      staminaCost: result.staminaCost
    };
  }

  /** ADR-031 natural-hide degradation: accumulate `loss` armour points of PER-FIGHT wear on the struck
   *  part of a mob's hide, capped at that part's full natural soak (wear can open the hide fully, never
   *  push it negative). Stale wear from a previous fight (outside HIDE_WEAR_RESET_TICKS) is discarded
   *  before the new chip. Event-rate (landed hits only) and routed through spliceEntity, so it respects
   *  the copy-on-write combat path — a peace tick allocates nothing. */
  private chipNaturalHide(
    state: GameState,
    mobId: string,
    partId: BodyPartId,
    loss: number,
    turn: number
  ): GameState {
    const mob = state.mobs?.find((m) => m.id === mobId);
    if (!mob || mob.isAlive === false || mob.state === 'Corpse') return state;
    const partDef = PART_DEF_MAP[partId];
    if (!partDef) return state;
    // Full (un-worn) soak at this part — the wear ceiling. No natural armour here → nothing to chip.
    const base = naturalArmorPoints(mob, partDef.armor ?? DEFAULT_ARMOR_SHARE, partId);
    if (base <= 0) return state;
    const stale = mob.hideWearAt == null || turn - mob.hideWearAt > HIDE_WEAR_RESET_TICKS;
    const prev = stale ? 0 : (mob.hideWear?.[partId] ?? 0);
    const next = Math.min(base, prev + loss);
    if (next === prev && !stale) return state;
    const hideWear = stale || !mob.hideWear ? {} : { ...mob.hideWear };
    hideWear[partId] = next;
    return this.spliceEntity(state, mobId, { ...mob, hideWear, hideWearAt: turn }, true);
  }

  /**
   * Apply every on-hit condition a landed melee blow can inflict: the held/natural weapon's own
   * `onHitCondition` (rides the swung weapon — including the natural fang/breath items a trait grants).
   * TRAITS §0: procs live ONLY on the weapon item now, never on the trait, so a venom bite behaves the
   * same however it was granted. No-op when nothing procs / target is down.
   */
  private applyOnHitEffect(
    state: GameState,
    attacker: Pawn | Mob,
    targetId: string,
    isMob: boolean,
    weaponId: string | undefined,
    pos: { x: number; y: number }
  ): GameState {
    const effects: OnHitCondition[] = [];
    const weaponEff = weaponId ? itemService.getItemById(weaponId)?.onHitCondition : undefined;
    if (weaponEff) effects.push(weaponEff);
    // PRODUCTION-CHAIN-IIII §2 weapon coating: a coated mainHand weapon lends an EXTRA on-hit proc (the
    // coating item's `coatingEffect`) ON TOP of the weapon's own, while unexpired. Only the equipped
    // weapon actually swung can be coated (weaponId === mainHand.itemId excludes natural weapons).
    const mh = 'equipment' in attacker ? attacker.equipment?.mainHand : undefined;
    if (mh?.coating && mh.itemId === weaponId && mh.coating.expiresAtTurn > state.turn) {
      const coatEff = itemService.getItemById(mh.coating.itemId)?.coatingEffect;
      if (coatEff) effects.push(coatEff);
    }
    if (effects.length === 0) return state;
    let s = state;
    for (const eff of effects) s = this.applyOneOnHitEffect(s, eff, targetId, isMob, pos, attacker);
    return s;
  }

  /**
   * Roll ONE `onHitEffect` against the defender and, on success, apply the named condition as a timed
   * transient (conditionTimers — same machinery as knockdown, so it surfaces in transientConditions and
   * decrements/clears on its own). The trigger chance is reduced by the defender's `resist` stat
   * (stats.jsonc); an optional `bloodDrain` also bleeds bloodVolume, feeding shock. No-op when the
   * target is already down.
   */
  private applyOneOnHitEffect(
    state: GameState,
    eff: OnHitCondition,
    targetId: string,
    isMob: boolean,
    pos: { x: number; y: number },
    attacker?: Pawn | Mob
  ): GameState {
    const target = isMob
      ? state.mobs?.find((m) => m.id === targetId)
      : state.pawns.find((p) => p.id === targetId);
    if (!target || target.isAlive === false) return state;
    if (isMob && (target as Mob).state === 'Corpse') return state;

    // Resistance → trigger reduction. `resist` names a 0-baseline `*_resistance` stat (poison/
    // piercing/mental/blunt), which evaluates to ~0 at the baseline stat and rises with it — used
    // directly as the fraction by which the trigger chance is cut.
    let resistFrac = 0;
    if (eff.resist) {
      resistFrac = clamp(pawnStatService.evaluateStat(eff.resist, target), 0, 0.9);
    }
    const chance = clamp(eff.chance * (1 - resistFrac), 0, 1);
    if (rng.random() >= chance) return state;

    // Target-side condition (optional — §3b: a pure feeding proc carries only bloodDrain).
    let timers = target.conditionTimers ?? {};
    let transientConditions = target.transientConditions ?? [];
    if (eff.condition) {
      timers = { ...timers };
      timers[eff.condition] = Math.max(
        timers[eff.condition] ?? 0,
        ticksFromGameHours(eff.durationHours ?? 1)
      );
      if (!transientConditions.includes(eff.condition))
        transientConditions = [...transientConditions, eff.condition];
    }

    // Optional blood drain (proboscis/feeding) → reduce bloodVolume; the low blood now drives `shock`
    // in tickConditions/stepHunger (the old `blood_loss` condition is gone), so no condition write here.
    let bloodVolume = target.bloodVolume;
    let fed = false;
    if (eff.bloodDrain && eff.bloodDrain > 0) {
      const maxBV = target.maxBloodVolume ?? 100;
      const before = target.bloodVolume ?? maxBV;
      bloodVolume = Math.max(0, before - eff.bloodDrain * (1 - resistFrac));
      fed = bloodVolume < before;
    }

    const updated = {
      ...target,
      conditionTimers: timers,
      transientConditions,
      bloodVolume
    };
    // The on-hit condition (envenomed / disoriented / ensnared…) just triggered → pop its data-driven
    // floater. Third tier (below the damage number AND any bleed/knockdown cue from the same hit) so a
    // weapon's on-hit label doesn't pile onto either of them.
    if (eff.condition) this.emitConditionFloat(pos.x, pos.y, eff.condition, 39);

    let s = this.spliceEntity(state, targetId, updated as Pawn | Mob, isMob);
    // §4.0 shared blood-feast: a successful DRAIN feeds the drinker — stamp the strong, ~30-min
    // `feasted` buff on the ATTACKER. Non-refreshing (only while absent), so it can't be perma-kept
    // by chain-feeding; it must lapse before another feed rearms it. Shared by every feeding weapon
    // (bloodsucking fangs / proboscis / vampiric bites), pawn and mob alike.
    if (fed && attacker && attacker.isAlive !== false) {
      // LINEAGES §4: a PAWN drinking HUMANOID blood feeds the vampiric awakening deed.
      if (!('creatureId' in attacker)) {
        const humanoidTarget =
          !isMob ||
          ['humanoid', 'winged_humanoid'].includes(
            getCreatureById((updated as Mob).creatureId)?.limbMap ?? ''
          );
        if (humanoidTarget) {
          const deeds = ((attacker as Pawn).deeds ??= {});
          deeds.drewHumanoidBlood = (deeds.drewHumanoidBlood ?? 0) + 1;
        }
      }
      const feastDef = getTransientConditionDef(FEASTED_CONDITION);
      const already = (attacker.conditionTimers ?? {})[FEASTED_CONDITION] ?? 0;
      if (feastDef && already <= 0) {
        const isAtkMob = 'entityClass' in attacker;
        const live = isAtkMob
          ? s.mobs?.find((m) => m.id === attacker.id)
          : s.pawns.find((p) => p.id === attacker.id);
        if (live && live.isAlive !== false) {
          const atkTimers = { ...(live.conditionTimers ?? {}) };
          atkTimers[FEASTED_CONDITION] = ticksFromGameHours(FEASTED_DURATION_HOURS);
          const atkTransient = (live.transientConditions ?? []).includes(FEASTED_CONDITION)
            ? live.transientConditions!
            : [...(live.transientConditions ?? []), FEASTED_CONDITION];
          const apos = this.entityPos(live);
          this.emitConditionFloat(apos.x, apos.y, FEASTED_CONDITION, 39);
          s = this.spliceEntity(
            s,
            live.id,
            { ...live, conditionTimers: atkTimers, transientConditions: atkTransient } as
              | Pawn
              | Mob,
            isAtkMob
          );
        }
      }
    }
    return s;
  }

  /** Melee reach in tiles for the entity's ACTIVE weapon: a mainHand melee weapon's `reach` (a reach-2
   *  polearm strikes and holds one tile away), else the LONGEST reach among its usable natural weapons
   *  (§3b: a reach-3 dragonfire engages like a spear), else 1 (adjacent). A ranged weapon's `reach` is
   *  its bow-butt melee fallback — not a pole reach — so it never extends here. */
  private meleeReach(entity: Pawn | Mob): number {
    if ('equipment' in entity && entity.equipment?.mainHand && hasUsableHand(entity)) {
      const wp = itemService.getItemById(entity.equipment.mainHand.itemId)?.weaponProperties;
      if (wp && !isRangedWeaponProps(wp)) return Math.max(1, wp.reach ?? 1);
    }
    // Natural weapons (unarmed): the longest reach among the granted set — host-part-gated for pawns.
    const ids =
      'creatureId' in entity
        ? (getCreatureById(entity.creatureId)?.naturalWeapons ?? [])
        : pawnNaturalWeaponIds(entity);
    let reach = 1;
    for (const id of ids) {
      const r = itemService.getItemById(id)?.weaponProperties?.reach ?? 1;
      if (r > reach) reach = r;
    }
    return reach;
  }

  /** Chebyshev tile distance between two combatants (1 = adjacent); 1 when either has no position
   *  (entityPos returns −1/−1 for an unplaced pawn — test fixtures fight "in contact"). */
  private entityDistance(a: Pawn | Mob, b: Pawn | Mob): number {
    const ap = this.entityPos(a);
    const bp = this.entityPos(b);
    if (ap.x < 0 || ap.y < 0 || bp.x < 0 || bp.y < 0) return 1;
    return Math.max(1, Math.max(Math.abs(ap.x - bp.x), Math.abs(ap.y - bp.y)));
  }

  /**
   * Spear KNOCKBACK: on a landed reach-weapon hit whose weapon carries `knockback`, roll a STR-scaled
   * chance to shove the target one tile directly away from the attacker. The push only takes if the
   * tile behind is in-bounds, walkable and unoccupied — otherwise the blow simply connects. On success
   * the target is displaced and marked `staggered` (a brief footing-loss transient; the displacement
   * itself is the real effect). Chance = base + STR advantage, cut by the target's knockdown_resistance.
   */
  private applyKnockback(
    state: GameState,
    attacker: Pawn | Mob,
    target: Pawn | Mob,
    isMob: boolean,
    weaponId: string | undefined,
    apos: { x: number; y: number }
  ): GameState {
    if (!weaponId) return state;
    const base = itemService.getItemById(weaponId)?.weaponProperties?.knockback ?? 0;
    if (base <= 0) return state;
    const tgt = isMob
      ? state.mobs?.find((m) => m.id === target.id)
      : state.pawns.find((p) => p.id === target.id);
    if (!tgt || tgt.isAlive === false) return state;
    if (isMob && (tgt as Mob).state === 'Corpse') return state;

    // +2% push chance per point of STR advantage; cut by the target's knockdown_resistance (bracing/mass).
    const atkStr = attacker.stats.strength * conditionStatMultipliers(attacker).strength;
    const defStr = tgt.stats.strength * conditionStatMultipliers(tgt).strength;
    const resist = clamp(pawnStatService.evaluateStat('knockdown_resistance', tgt), 0, 0.9);
    const chance = clamp((base + (atkStr - defStr) * 0.02) * (1 - resist), 0, 0.75);
    if (rng.random() >= chance) return state;

    // Push one tile along the attacker→target unit vector.
    const tpos = this.entityPos(tgt);
    const sx = Math.sign(tpos.x - apos.x);
    const sy = Math.sign(tpos.y - apos.y);
    if (sx === 0 && sy === 0) return state;
    const nx = tpos.x + sx;
    const ny = tpos.y + sy;
    const map = state.worldMap;
    if (ny < 0 || nx < 0 || ny >= map.length || nx >= (map[0]?.length ?? 0)) return state;
    if (map[ny][nx]?.walkable === false) return state;
    // Blocked if another living entity already stands on the destination tile.
    const occupied =
      state.pawns.some(
        (p) => p.isAlive !== false && p.position?.x === nx && p.position?.y === ny
      ) ||
      (state.mobs?.some(
        (m) => m.isAlive !== false && m.state !== 'Corpse' && m.x === nx && m.y === ny
      ) ??
        false);
    if (occupied) return state;

    // Displace + stamp the staggered marker (timed transient, decrements/clears like knockdown).
    const timers = { ...(tgt.conditionTimers ?? {}) };
    timers.staggered = Math.max(timers.staggered ?? 0, ticksFromGameHours(0.15));
    const transientConditions = (tgt.transientConditions ?? []).includes('staggered')
      ? tgt.transientConditions!
      : [...(tgt.transientConditions ?? []), 'staggered'];
    const moved = isMob
      ? { ...(tgt as Mob), x: nx, y: ny, conditionTimers: timers, transientConditions }
      : {
          ...(tgt as Pawn),
          position: { x: nx, y: ny },
          conditionTimers: timers,
          transientConditions
        };
    this.emitConditionFloat(nx, ny, 'staggered', 26);
    return this.spliceEntity(state, target.id, moved as Pawn | Mob, isMob);
  }

  /** The worn-armour slot with the highest `defense` (the piece that takes a blow — mirrors
   *  partArmorReduction's best-of selection). Null if the entity wears no armour. Pawn OR geared mob. */
  private bestArmorSlot(entity: Pawn | Mob): string | null {
    const slots = [
      'bodyOuter',
      'bodyMid',
      'bodyBase',
      'headOuter',
      'headBase',
      'gloves',
      'boots',
      'gorget'
    ];
    const eq = entity.equipment as Record<string, ItemInstance | undefined> | undefined;
    if (!eq) return null;
    let best: string | null = null;
    let bestDef = 0;
    for (const s of slots) {
      const inst = eq[s];
      if (!inst) continue;
      const def = itemService.getItemById(inst.itemId)?.armorProperties?.defense ?? 0;
      if (def > bestDef) {
        bestDef = def;
        best = s;
      }
    }
    return best;
  }

  /** Immutably reduce one equipped instance's durability by `loss` (floored at 0). Pawn OR mob. */
  private decrEquipDurability<T extends Pawn | Mob>(entity: T, slot: string, loss: number): T {
    const eq = entity.equipment as Record<string, ItemInstance | undefined> | undefined;
    const inst = eq?.[slot];
    if (!eq || !inst) return entity;
    const dur = Math.max(0, (inst.durability ?? 0) - loss);
    // Condition 0 = the item SHATTERS: remove it from the slot so it's no longer worn/usable (mirrors
    // the tool-wear break in harvest.ts — a worn-out item must leave the equipment doll, not linger at
    // cond 0). Covers both the attacker's mainHand weapon and the defender's struck armour.
    if (dur <= 0) {
      const next = { ...eq };
      delete next[slot];
      return { ...entity, equipment: next };
    }
    return { ...entity, equipment: { ...eq, [slot]: { ...inst, durability: dur } } };
  }

  /** ON A HIT: wear the attacker's main-hand weapon and the defender's struck armour piece by their
   *  `durabilityLossPerCombatHit` (pawns AND geared humanoid mobs, §2c). Routed through `spliceEntity`
   *  so it rides the copy-on-write combat path (no unconditional array rebuild); no-op when neither side
   *  carries wearing gear. */
  private applyGearWear(
    state: GameState,
    attacker: Pawn | Mob,
    defender: Pawn | Mob,
    armorLoss: number
  ): GameState {
    let next = state;
    // The attacker's weapon wears from use (its own durabilityLossPerCombatHit).
    const weaponInst = 'equipment' in attacker ? attacker.equipment?.mainHand : undefined;
    const weaponLoss = weaponInst
      ? (itemService.getItemById(weaponInst.itemId)?.durabilityLossPerCombatHit ?? 0)
      : 0;
    if (weaponLoss > 0) {
      const isMob = 'creatureId' in attacker;
      const live = isMob
        ? next.mobs?.find((m) => m.id === attacker.id)
        : next.pawns.find((p) => p.id === attacker.id);
      if (live?.equipment?.mainHand) {
        next = this.spliceEntity(
          next,
          live.id,
          this.decrEquipDurability(live, 'mainHand', weaponLoss),
          isMob
        );
      }
    }
    // The defender's struck armour takes `armorLoss` — the WEAPON's armorDamage × the attacker's
    // armor_damage stat (computed by the caller), so a hammer caves plate fast, a cleaver barely scratches.
    if (armorLoss > 0 && 'equipment' in defender) {
      const isMob = 'creatureId' in defender;
      const live = isMob
        ? next.mobs?.find((m) => m.id === defender.id)
        : next.pawns.find((p) => p.id === defender.id);
      const slot = live ? this.bestArmorSlot(live) : null;
      if (live && slot) {
        next = this.spliceEntity(
          next,
          live.id,
          this.decrEquipDurability(live, slot, armorLoss),
          isMob
        );
      }
    }
    return next;
  }

  /** Default armour condition stripped per hit, by damage type, when a weapon doesn't author its own
   *  `armorDamage`: blunt crushes armour, piercing punches small holes, cutting skids off it. */
  private static readonly DEFAULT_ARMOR_DAMAGE: Record<string, number> = {
    blunt: 4,
    piercing: 2,
    cutting: 1.5
  };

  /** Armour condition this swing strips: weapon.armorDamage (or the by-type default) × the attacker's
   *  STR-driven `armor_damage` stat. A ranged shot pierces rather than wrecks → much less. */
  private computeArmorDamage(
    attacker: Pawn | Mob,
    damageType: DamageType,
    isRanged: boolean
  ): number {
    const stat = pawnStatService.evaluateStat('armor_damage', attacker);
    const byType = CombatServiceImpl.DEFAULT_ARMOR_DAMAGE[damageType] ?? 2;
    if (isRanged) return byType * 0.4 * stat; // arrows/bolts pierce, they don't cave armour
    const wp =
      'equipment' in attacker && attacker.equipment?.mainHand
        ? itemService.getItemById(attacker.equipment.mainHand.itemId)?.weaponProperties
        : undefined;
    return (wp?.armorDamage ?? byType) * stat;
  }

  /** Nearest living hostile mob within `maxRange` tiles of a pawn (auto-engagement; ranged
   *  acquisition passes the weapon range, melee passes 1 = adjacent). */
  private nearestHostileInRange(pawn: Pawn, mobs: Mob[], maxRange: number): Mob | undefined {
    if (!pawn.position) return undefined;
    const px = pawn.position.x;
    const py = pawn.position.y;
    let best: Mob | undefined;
    let bestDist = Infinity;
    for (const m of mobs) {
      if (m.isAlive === false || m.state === 'Corpse') continue;
      // A downed (Collapsed) mob is out of the fight — disengage rather than beat an unconscious body
      // (it recovers / bleeds out / is finished by a hungry predator). Mirrors the collapsed-pawn skip.
      // A drafted ATTACK order or a work-Hunt (huntTargetId) bypasses this acquire, so the player or a
      // committed hunter can still finish a downed quarry.
      if (m.state === 'Collapsed') continue;
      const hostile = m.entityClass === 'mob' || m.state === 'Attacking' || m.state === 'Alerted';
      if (!hostile) continue;
      const d = chebyshev(px, py, m.x, m.y);
      if (d <= maxRange && d < bestDist) {
        best = m;
        bestDist = d;
      }
    }
    return best;
  }

  /** Binary cover: 0.20 if the target hugs a sight-blocker (a non-walkable neighbour tile). Read-only. */
  private rangedCoverPenalty(state: GameState, x: number, y: number): number {
    const map = state.worldMap;
    const h = map.length;
    const w = h > 0 ? map[0].length : 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (map[ny][nx]?.walkable === false) return 0.2;
      }
    }
    return 0;
  }

  /** Build the ranged attack profile (weapon + ammo bonuses) and hit modifier for one shot (§VI-1). */
  private buildRangedOverride(
    pawn: Pawn,
    rw: RangedWeapon,
    ammo: AmmoPick | null,
    dist: number,
    coverPenalty: number
  ): RangedOverride {
    const rawWp = itemService.getItemById(rw.itemId)?.weaponProperties;
    // §Q: a Masterwork bow shoots harder/truer — scale the quality-relevant fields by the tier.
    // §I: a Famed bow explodes them ×2–5 on top of its tier.
    const wp = rawWp ? scaleWeaponQuality(rawWp, rw.quality, rw.famedStatMult) : undefined;
    const profile = profileFromWeapon(
      pawn.stats.strength,
      pawn.stats.dexterity,
      wp ?? { damage: 1, attackSpeed: 1, range: rw.range },
      rw.itemName
    );
    // Damage comes from the AMMUNITION, not the launcher: the arrowhead's `damage` × the bow's draw
    // power (war bow ≫ self bow on the same arrow). A bow/crossbow/sling authors `damage: 0`, so a shot
    // with no ammo would do nothing. THROWN weapons (no ammo) keep their own `damage` — they ARE the
    // projectile. The ammo also picks the wound type (broadhead → cutting/bleed, bodkin → piercing/AP).
    if (ammo) {
      const drawPower = rawWp?.drawPower ?? 1;
      profile.baseDamage = (ammo.props.damage ?? 0) * drawPower + (ammo.props.damageBonus ?? 0);
      if (ammo.props.damageType) profile.damageType = ammo.props.damageType;
    }
    profile.armorPen = clamp(profile.armorPen + (ammo?.props.armorPen ?? 0), 0, 1);
    // Hit chance: the PER-driven `aim_accuracy` stat + flat gear/ammo accuracy − a LINEAR distance
    // penalty − cover. (Replaces the old optimal-band curve with the requested linear falloff.)
    const hitMod = rangedAccuracyMod(
      pawnStatService.evaluateStat('aim_accuracy', pawn),
      sumAimBonuses(pawn).accuracy,
      ammo?.props.accuracyBonus ?? 0,
      dist,
      coverPenalty
    );
    return { profile, hitMod, strScaled: rw.strScaled };
  }

  /**
   * Attempt one ranged shot. Returns the new state + stamina cost if it fired, or null when the
   * target is out of range / out of sight / out of ammo / off-cadence (the FSM then closes to melee).
   * Records ammo spend + a recovery drop into the caller's collections (applied once in the merge).
   */
  private tryRangedShot(
    pawn: Pawn,
    target: Pawn | Mob,
    tpos: { x: number; y: number },
    dist: number,
    rw: RangedWeapon,
    state: GameState,
    turn: number,
    ammoUpdates: Map<string, { itemId: string; newQty: number }>,
    recovered: DroppedItem[]
  ): { state: GameState; staminaCost: number } | null {
    // Effective range = STR-scaled weapon reach + gear, capped by vision — subsumes the range/sight cap.
    if (dist > effectiveRangedRange(pawn, rw)) return null; // out of range/sight — close (FSM)

    // Part VII occlusion: a wall / natural rock on the shooter→target line blocks the shot. Cheap
    // bounded Bresenham over the baked `blocksSight` tile flag — null here makes the FSM close to
    // break the line of fire (no WASM raycast; ADR-008 untouched).
    if (
      pawn.position &&
      !hasLineOfSight(state.worldMap, pawn.position.x, pawn.position.y, tpos.x, tpos.y)
    ) {
      return null;
    }

    // Ammo: weapons with an ammoCategory need a matching stack; self-thrown weapons (no category)
    // fire freely for now (true self-consume is deferred — see the spec's Open Questions).
    let ammo: AmmoPick | null = null;
    if (rw.ammoCategory) {
      ammo = pickAmmo(pawn, rw.ammoCategory);
      if (!ammo) return null; // out of ammo — fall back to closing/melee
    }

    // Aim cadence = AIM time (aim_speed/DEX, distance-scaled, draw gear) + SPAN time (reload_speed/DEX,
    // crossbow crank only). The DEX SPEED axis governs both; PER governs precision (accuracy/range).
    const attackSpeed = Math.max(0.5, pawnStatService.evaluateStat('attack_speed', pawn));
    const baseInterval = Math.max(
      MIN_ATTACK_INTERVAL_TICKS,
      Math.round(BASE_ATTACK_INTERVAL_TICKS / attackSpeed)
    );
    const interval = aimIntervalTicks(
      baseInterval,
      rw.reload,
      dist,
      pawnStatService.evaluateStat('aim_speed', pawn),
      // General aim gear (bracers…) + the category-aware quiver draw bonus / no-quiver pack penalty.
      sumAimBonuses(pawn).speed + drawSpeedModifier(pawn, rw.ammoCategory),
      pawnStatService.evaluateStat('reload_speed', pawn)
    );
    if (turn % interval !== 0) return null;

    const cover = this.rangedCoverPenalty(state, tpos.x, tpos.y);
    const override = this.buildRangedOverride(pawn, rw, ammo, dist, cover);
    const atk = this.performAttack(pawn, target, state, turn, override);

    // Cosmetic: animate the shot flying shooter → target (the hit already resolved hitscan above).
    if (pawn.position) {
      simLog.pushProjectile({
        fromX: pawn.position.x,
        fromY: pawn.position.y,
        toX: tpos.x,
        toY: tpos.y,
        effect: ammo
          ? (ammo.props.projectile ?? PROJECTILE_BY_CATEGORY[rw.ammoCategory ?? ''] ?? 'arrow')
          : (rw.projectile ?? 'spear')
      });
    }

    if (ammo) {
      const have = pawn.inventory?.items?.[ammo.itemId] ?? 0;
      const newQty = Math.max(0, have - 1);
      ammoUpdates.set(pawn.id, { itemId: ammo.itemId, newQty });
      // One-time chronicle line as the quiver runs dry — the pawn then closes to melee/bow-butt.
      if (newQty === 0) {
        const ammoName = (itemService.getItemById(ammo.itemId)?.name ?? 'ammunition').toLowerCase();
        simLog.logEvent({
          category: 'combat',
          turn,
          message: `${pawn.name} looses the last ${ammoName} and falls back to melee.`
        });
      }
      const recover = ammo.props.recoverable ?? 0;
      if (recover > 0 && rng.random() < recover) {
        recovered.push({
          id: `recovered-${ammo.itemId}-${turn}-${tpos.x}-${tpos.y}-${Math.floor(rng.random() * 1e6)}`,
          resourceId: ammo.itemId,
          x: tpos.x,
          y: tpos.y,
          quantity: 1
        });
      }
    } else if (!rw.channeled) {
      // Thrown self-consume (RANGED-COMBAT spec): the spear/stone leaves the hand and lands on the
      // target tile as a recoverable drop; the slot empties so the pawn falls back to melee/closing
      // until it re-arms. The drop rides the same collected-once recovery array as spent ammo.
      atk.state = this.clearEquipSlot(atk.state, pawn.id, rw.slot);
      recovered.push({
        id: `thrown-${rw.itemId}-${turn}-${tpos.x}-${tpos.y}-${Math.floor(rng.random() * 1e6)}`,
        resourceId: rw.itemId,
        x: tpos.x,
        y: tpos.y,
        quantity: 1
      });
    }
    // §M channeled staff: no ammo and NOT self-consumed — it stays in hand. Its mana is the
    // `staminaCost` already drained by performAttack (winded = out of mana), so nothing to spend here.
    return atk;
  }

  /** Per-pawn last-turn a "No ammo" float was shown (throttle so it doesn't fire every tick). */
  private _noAmmoNotified = new Map<string, number>();

  /** Floating "No ammo" over a ranged pawn that wants to fire but has none — reuses the combat-text
   *  overlay channel, throttled per pawn. */
  private notifyNoAmmo(pawn: Pawn, turn: number): void {
    if (!pawn.position) return;
    const last = this._noAmmoNotified.get(pawn.id) ?? -Infinity;
    if (turn - last < NOAMMO_NOTIFY_COOLDOWN) return;
    this._noAmmoNotified.set(pawn.id, turn);
    simLog.pushCombatText({
      worldX: pawn.position.x,
      worldY: pawn.position.y,
      text: 'No ammo',
      kind: 'miss'
    });
  }

  /** Remove the item in `slot` from a pawn's equipment (immutable, mirrors decrEquipDurability). Used
   *  for thrown-weapon self-consume — the weapon physically left the hand. */
  private clearEquipSlot(state: GameState, pawnId: string, slot: string): GameState {
    return {
      ...state,
      pawns: state.pawns.map((p) => {
        if (p.id !== pawnId || !(p.equipment as Record<string, ItemInstance | undefined>)?.[slot])
          return p;
        const eq = { ...p.equipment } as Record<string, ItemInstance | undefined>;
        delete eq[slot];
        return { ...p, equipment: eq };
      })
    };
  }

  /** True while an entity is knocked down OR collapsed and cannot swing this tick. */
  private isKnockedDown(e: Pawn | Mob): boolean {
    const d = e.conditionTimers;
    return (d?.knockdown ?? 0) > 0 || (d?.collapse ?? 0) > 0;
  }

  /** True while an entity is winded (stamina bottomed out) — can't attack until stamina refills. */
  private isWinded(e: Pawn | Mob): boolean {
    return (e.conditionTimers?.winded ?? 0) > 0;
  }

  /** True while an entity is actively engaged in melee (throttles stamina regen mid-fight). */
  private isFighting(e: Pawn | Mob): boolean {
    if ('currentState' in e) {
      return (
        e.currentState === 'Fighting' ||
        e.currentState === 'Hunting' ||
        (!!e.drafted && e.draftTarget?.type === 'attack')
      );
    }
    return (e as Mob).state === 'Attacking';
  }

  /** Product of all active transient condition `dodge` modifiers (winded → 0.5 → easier to hit). */
  private conditionDodgeMult(e: Pawn | Mob): number {
    let m = 1;
    for (const id of e.transientConditions ?? []) {
      const v = TRANSIENT_CONDITIONS_DB.find((s) => s.id === id)?.modifiers.dodge;
      if (v != null) m *= v;
    }
    // Persistent conditions (encumbered…) — the active stage's `dodge` modifier.
    for (const c of e.conditions ?? []) {
      const v = getConditionCurrentStage(c)?.modifiers.dodge;
      if (v != null) m *= v;
    }
    return m;
  }

  /** Product of active persistent conditions' `hitChance` modifiers (encumbered → the attacker's aim
   *  suffers). Transient conditions carry no hitChance today. */
  private conditionHitMult(e: Pawn | Mob): number {
    let m = 1;
    for (const c of e.conditions ?? []) {
      const v = getConditionCurrentStage(c)?.modifiers.hitChance;
      if (v != null) m *= v;
    }
    return m;
  }

  /**
   * Per-tick stamina regen + winded latch for one entity. Drives the "fight until winded, then
   * pass turns until recovered" loop: regen the full `stamina_recovery_rate` while winded/resting
   * (throttled to a fraction while actively fighting so a melee actually depletes); on hitting 0
   * latch `winded`; clear it only once stamina is back to full. Persists through
   * `conditionTimers.winded` (so `syncTransientConditions` keeps it on pawns) and mirrors it into
   * `transientConditions` (mobs don't run that sync) so the moveSpeed/dodge modifiers apply.
   */
  private tickStaminaAndWinded<T extends Pawn | Mob>(e: T): T {
    if (e.isAlive === false) return e;
    const max = e.maxStamina ?? calcMaxStamina(e.stats);
    const postDrain = e.stamina ?? max;
    const wasWinded = this.isWinded(e);
    let winded = wasWinded || postDrain <= 0;

    let stamina = postDrain;
    if (postDrain < max) {
      // `stamina_recovery_rate` is a PER-SECOND value (like every other rate — mob flee drain,
      // needs via perTick); scale it to this tick. Previously the raw per-second number was added
      // every tick (~60×), so stamina refilled in ~1s and `winded` never bit (N-2).
      // Fatigue slows recovery (rate ÷ factor) — a tired entity catches its breath slower.
      const rate =
        perTick(pawnStatService.evaluateStat('stamina_recovery_rate', e)) / fatigueStaminaFactor(e);
      const eff = winded || !this.isFighting(e) ? rate : rate * COMBAT_REGEN_FRACTION;
      stamina = Math.min(max, Math.max(0, postDrain) + eff);
    }
    if (winded && stamina >= max) winded = false;

    if (stamina === postDrain && winded === wasWinded) return e;

    const durations = { ...(e.conditionTimers ?? {}) };
    let transientConditions = e.transientConditions ?? [];
    if (winded) {
      durations.winded = 2; // refresh so the per-tick duration decrement never expires the latch
      if (!transientConditions.includes(WINDED)) {
        transientConditions = [...transientConditions, WINDED];
        // Rising edge (just ran out of breath) → pop the floater. No damage number accompanies it
        // (separate from a swing), so it sits at the entity's own row (dy 0).
        const wpos = this.entityPos(e);
        this.emitConditionFloat(wpos.x, wpos.y, WINDED);
      }
    } else {
      delete durations.winded;
      if (transientConditions.includes(WINDED))
        transientConditions = transientConditions.filter((x) => x !== WINDED);
    }
    return { ...e, stamina, conditionTimers: durations, transientConditions };
  }

  tickCombat(state: GameState, _dtMs: number): GameState {
    this._combatWorking = true;
    this._mobsOwned = false;
    this._pawnsOwned = false;
    try {
      return this._tickCombat(state);
    } finally {
      this._combatWorking = false;
    }
  }

  private _tickCombat(state: GameState): GameState {
    // `next` starts as the caller's state; the per-hit appliers clone the pawns/mobs arrays COPY-ON-
    // WRITE on the first write (see `spliceEntity`) and write slots in place thereafter. A peace tick
    // never writes → never clones → zero allocation. The clone (when it happens) means combat never
    // mutates the caller's `state` (GameEngineImpl's `preCombatState`), which is index-diffed against
    // the result to spawn carcasses (`handleFreshCombatCorpses`).
    let next: GameState = state;
    // Track stamina mutations for attacking entities (id → new stamina value).
    const mobStaminaUpdates = new Map<string, number>();
    const pawnStaminaUpdates = new Map<string, number>();
    // RANGED-COMBAT: ammo spent this tick (pawnId → new stack qty) and recovered projectiles to drop,
    // both applied once in the final merge (§VI-1/§VI-3: no per-shot pawns-array rebuild, bounded drops).
    const pawnAmmoUpdates = new Map<string, { itemId: string; newQty: number }>();
    const recoveredAmmo: DroppedItem[] = [];

    // ── Mob attacks ──────────────────────────────────────────────────────
    const mobs = state.mobs ?? [];
    for (const mob of mobs) {
      if (mob.state !== 'Attacking' || mob.isAlive === false) continue;
      if (this.isKnockedDown(mob)) continue;
      if (this.isWinded(mob)) continue; // out of breath — pass turns until stamina recovers
      const attackSpeed = Math.max(0.5, pawnStatService.evaluateStat('attack_speed', mob));
      const interval = Math.max(
        MIN_ATTACK_INTERVAL_TICKS,
        Math.round(BASE_ATTACK_INTERVAL_TICKS / attackSpeed)
      );
      if ((state.turn - mob.stateSince) % interval !== 0) continue;

      const curStamina = mob.stamina ?? mob.maxStamina ?? 50;

      // Determine target: huntTargetId mob first, then nearest pawn, then nearest mob
      let target: Pawn | Mob | undefined;
      if (mob.huntTargetId) {
        target = mobs.find((m) => m.id === mob.huntTargetId && m.isAlive !== false);
      }
      if (!target) {
        // Skip collapsed pawns by default — a downed pawn is no longer a target, so the mob disengages
        // rather than beating an unconscious body (spec: a collapsed pawn is carried off or bleeds out).
        // EXCEPTION: a hungry predator finishes it off (willFinishOffDowned) — the same predicate the FSM
        // uses to decide whether to keep engaging, so the two never disagree (one holds, the other skips).
        const mobDef = getCreatureById(mob.creatureId);
        const finisher = mobDef ? willFinishOffDowned(mob.needs?.hunger ?? 0, mobDef) : false;
        target = state.pawns.find(
          (p) =>
            p.isAlive !== false &&
            (finisher || p.currentState !== 'Collapsed') &&
            p.position &&
            Math.abs(mob.x - p.position.x) <= 1 &&
            Math.abs(mob.y - p.position.y) <= 1
        );
      }
      if (!target) {
        // Retaliate ONLY against a mob that is actually attacking US (its huntTargetId points back at
        // this mob) — never swing at a same-faction ally merely because it's adjacent. Without this an
        // Attacking mob whose pawn target stepped out of reach clubbed whatever neighbour was nearest
        // (the harpies-fighting-each-other bug). Allies don't target us, so they're never hit.
        target = mobs.find(
          (m) =>
            m.id !== mob.id &&
            m.isAlive !== false &&
            m.huntTargetId === mob.id &&
            Math.abs(mob.x - m.x) <= 1 &&
            Math.abs(mob.y - m.y) <= 1
        );
      }
      if (!target) continue;

      const atk = this.performAttack(mob, target, next, state.turn);
      next = atk.state;
      // Fatigue raises the effective drain (cost × factor) — a tired attacker winds faster.
      mobStaminaUpdates.set(
        mob.id,
        Math.max(0, curStamina - atk.staminaCost * fatigueStaminaFactor(mob))
      );
    }

    // ── Pawn attacks (drafted order OR auto-engaged Fighting state) ───────
    for (const pawn of state.pawns) {
      if (pawn.isAlive === false || !pawn.position) continue;
      if (this.isKnockedDown(pawn)) continue;
      if (this.isWinded(pawn)) continue; // out of breath — pass turns until stamina recovers

      // RANGED-COMBAT: a ranged pawn acquires hostiles out to its weapon range; a melee pawn out to its
      // weapon reach (a reach-2 polearm engages one tile away, not just adjacent).
      const rw = getRangedWeapon(pawn);
      const acquireRange = rw ? effectiveRangedRange(pawn, rw) : this.meleeReach(pawn);

      // Resolve the pawn's target: an explicit draft order, or — for an undrafted pawn the FSM has
      // put into Fighting — the nearest hostile within reach (melee adjacent, or ranged weapon range).
      let target: Pawn | Mob | undefined;
      if (pawn.drafted && pawn.draftTarget?.type === 'attack') {
        const dt = pawn.draftTarget;
        target =
          dt.targetType === 'mob'
            ? mobs.find((m) => m.id === dt.targetId && m.isAlive !== false)
            : state.pawns.find((p) => p.id === dt.targetId && p.isAlive !== false);
        if (!target) {
          // Target dead — clear the stale draft order.
          next = {
            ...next,
            pawns: next.pawns.map((p) => (p.id === pawn.id ? { ...p, draftTarget: undefined } : p))
          };
          continue;
        }
      } else if (pawn.drafted) {
        // NT-4: a drafted pawn with no explicit attack order (idle, holding, or mid-move) still
        // defends itself — it swings at the nearest hostile in reach instead of standing inert
        // when the player walks it up to an enemy. No hostile in reach → nothing to do.
        target = this.nearestHostileInRange(pawn, mobs, acquireRange);
        if (!target) continue;
      } else if (pawn.currentState === 'Fighting') {
        target = this.nearestHostileInRange(pawn, mobs, acquireRange);
      } else if (pawn.currentState === 'BloodHunt' && pawn.huntTargetId) {
        // LINEAGES-II: the lose-control hunt swings at its acquired quarry — beast OR colonist.
        target =
          mobs.find(
            (m) => m.id === pawn.huntTargetId && m.isAlive !== false && m.state !== 'Corpse'
          ) ??
          state.pawns.find(
            (p) => p.id === pawn.huntTargetId && p.id !== pawn.id && p.isAlive !== false
          );
        if (!target) continue;
      } else if (pawn.currentState === 'Hunting' && pawn.huntTargetId) {
        // Work-driven hunt: swing at the marked quarry (a neutral animal isn't a
        // "hostile", so it must be targeted explicitly rather than via nearestAdjacentHostile).
        target = mobs.find((m) => m.id === pawn.huntTargetId && m.isAlive !== false);
      } else {
        continue;
      }
      if (!target) continue;

      const tpos = this.entityPos(target);
      const tdist = Math.max(
        Math.abs(pawn.position.x - tpos.x),
        Math.abs(pawn.position.y - tpos.y)
      );
      const curStamina = pawn.stamina ?? pawn.maxStamina ?? 50;

      // A draft order can FORCE melee: a ranged pawn told to "Target (melee)" skips the shot path,
      // closes (via _processDraftOrders' stopDist=1) and swings in contact instead.
      const forceMelee =
        !!pawn.drafted && pawn.draftTarget?.type === 'attack' && pawn.draftTarget.mode === 'melee';
      const rangedAuto = !!rw && !forceMelee; // a ranged pawn engaging at range (not opt-in melee)

      // Out of ammo + auto-ranged: warn (floating, throttled) and HOLD. It does NOT auto-close or
      // auto-swing in melee — engaging in melee is always opt-in ("Target (melee)"), so a fragile
      // shooter isn't dragged into a fight it can't win. Catches both at-range and in-contact.
      if (rangedAuto && !hasViableAmmo(pawn, rw)) {
        this.notifyNoAmmo(pawn, state.turn);
        continue;
      }

      // ── Ranged: fire at a target beyond melee but within range (on cadence; ammo present). ──
      if (rangedAuto && tdist > 1) {
        const shot = this.tryRangedShot(
          pawn,
          target,
          tpos,
          tdist,
          rw,
          next,
          state.turn,
          pawnAmmoUpdates,
          recoveredAmmo
        );
        if (shot) {
          next = shot.state;
          pawnStaminaUpdates.set(
            pawn.id,
            Math.max(0, curStamina - shot.staminaCost * fatigueStaminaFactor(pawn))
          );
        }
        continue; // out of range/sight/ammo → the FSM closes; never a melee swing at distance
      }

      // ── Melee: requires the target within weapon reach (1 = adjacent; a reach-2 polearm strikes one
      //    tile away). A ranged weapon in contact swings as a (weak) melee weapon via its own melee
      //    profile (bow stave / crossbow stock / sling pommel) — no special bow-butt path. ──
      if (tdist > this.meleeReach(pawn)) continue;

      // Attack cadence — scaled by attack_speed stat.
      const pawnAttackSpeed = Math.max(0.5, pawnStatService.evaluateStat('attack_speed', pawn));
      const pawnInterval = Math.max(
        MIN_ATTACK_INTERVAL_TICKS,
        Math.round(BASE_ATTACK_INTERVAL_TICKS / pawnAttackSpeed)
      );
      if (state.turn % pawnInterval !== 0) continue;

      const atk = this.performAttack(pawn, target, next, state.turn);
      next = atk.state;
      // Fatigue raises the effective drain (armour load tires you via the `encumbered` condition's
      // fatigueRate → the fatigue need → fatigueStaminaFactor — one channel, no double-count).
      pawnStaminaUpdates.set(
        pawn.id,
        Math.max(0, curStamina - atk.staminaCost * fatigueStaminaFactor(pawn))
      );
    }

    // Apply this tick's attack-drain, then regen + winded latch for EVERY alive entity (so a winded
    // one recovers even after the fight ends). #2 (ENGINE-PERFORMANCE): tickStaminaAndWinded already
    // returns the SAME ref for a full/not-winded entity (the common case), so rebuild each array
    // COPY-ON-WRITE — only allocate (and only once) if some entity actually changed. At peace nothing
    // changes → zero array allocation, vs the old unconditional double `.map`. (Inner evaluateStat is
    // now cached by #1.) Kept immutable — no mutation risk in the combat phase.
    const tickAll = <T extends Pawn | Mob>(arr: T[], drain: Map<string, number>): T[] => {
      let out: T[] | null = null;
      for (let i = 0; i < arr.length; i++) {
        const e = arr[i];
        const drained = drain.has(e.id) ? { ...e, stamina: drain.get(e.id)! } : e;
        const r = this.tickStaminaAndWinded(drained);
        if (r !== e) {
          if (!out) out = arr.slice();
          out[i] = r;
        }
      }
      return out ?? arr;
    };
    next = {
      ...next,
      mobs: tickAll(next.mobs ?? [], mobStaminaUpdates),
      pawns: tickAll(next.pawns, pawnStaminaUpdates)
    };

    // RANGED-COMBAT: apply ammo spend (decrement the fired stack) — gated, so no rebuild at peace.
    if (pawnAmmoUpdates.size > 0) {
      next = {
        ...next,
        pawns: next.pawns.map((p) => {
          const upd = pawnAmmoUpdates.get(p.id);
          if (!upd || !p.inventory) return p;
          const items = { ...p.inventory.items };
          if (upd.newQty <= 0) delete items[upd.itemId];
          else items[upd.itemId] = upd.newQty;
          return { ...p, inventory: { ...p.inventory, items } };
        })
      };
    }
    // Recovered projectiles drop on the struck tiles (haulable like any drop). §VI-3: appended once.
    if (recoveredAmmo.length > 0) {
      next = { ...next, droppedItems: [...(next.droppedItems ?? []), ...recoveredAmmo] };
    }

    return next;
  }

  /** Deferred — stub; wired by MAGIC-SKILLS spec. */
  triggerSkill(
    _skillId: string,
    _casterId: string,
    _targetId: string,
    state: GameState
  ): GameState {
    return state;
  }
}

export const combatService: CombatService = new CombatServiceImpl();
