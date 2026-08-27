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
} from '../core/rules/body/conditions';
import { getCreatureById } from '../core/defs/creatures';
import { willFinishOffDowned } from '../services/entity/entityConstants';
import {
  woundForDamageType,
  woundById,
  severityFromFrac,
  recomputeWound
} from '../core/defs/wounds';
import { scaleWeaponQuality, scaleArmorQuality } from '../core/rules/gear/itemQuality';
import { pawnStatService } from '../services/PawnStatService';
import { calcMaxStamina } from '../entities/Pawns';
import conditionsData from '../database/pawns/conditions.jsonc';
import type { ConditionDef, TransientConditionDef } from '../core/types';
import { simLog, type CombatTextKind } from '../core/util/logSink';
import { rng } from '../core/util/rng';
import { chebyshev } from '../core/util/distance';
import { clamp } from '../core/util/math';
import { perTick } from '../core/util/time';
import {
  ticksFromGameHours,
  getAmbientLight,
  weatherSightMul
} from '../services/EnvironmentService';
import { isWitnessedByColony } from '../core/rules/body/vision';
import {
  isDetectedBy,
  revealPawnToMob,
  STEALTH_STRIKE_MULT,
  STEALTH_PACK_ALERT_RADIUS
} from '../core/rules/body/stealth';
import { kingdomService } from '../services/KingdomService';
import { socialService } from '../services/SocialService';
import { memoryService } from '../services/MemoryService';
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
} from '../core/defs/bodyParts';
import { coversPart, ARMOUR_SLOTS, SLOT_LAYER } from '../core/rules/gear/armorCoverage';

const DEFAULT_ARMOR_SHARE = 0.5;
export { PART_DEF_MAP, createDefaultBodyParts, createBodyPlanLimbs };

function limbOfPart(entity: Pawn | Mob, partId: BodyPartId): LimbState | undefined {
  return (entity.limbs ?? []).find((l) => (l.parts ?? []).some((p) => p.id === partId));
}

function planOf(entity: Pawn | Mob): string {
  if ('creatureId' in entity) return getCreatureById(entity.creatureId)?.limbMap ?? DEFAULT_PLAN;
  return DEFAULT_PLAN;
}

function hasModelledAnatomy(entity: Pawn | Mob): boolean {
  return (entity.limbs ?? []).some((l) => (l.parts?.length ?? 0) > 0);
}

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
  return !sawHand;
}

const TRANSIENT_CONDITIONS_DB = (
  conditionsData as unknown as Array<ConditionDef | TransientConditionDef>
).filter((d): d is TransientConditionDef => d.transient === true);

const FRACTURE_BLUNT_BASE = 0.6;
const FRACTURE_OTHER_BASE = 0.12;
const FRACTURE_BLUNT_CAP = 0.85;
const FRACTURE_OTHER_CAP = 0.3;
const BONE_TRANSFER_BLUNT = 0.7;
const BONE_TRANSFER_OTHER = 0.2;
const BONE_DAMAGE_VARIANCE = 0.4;
const ORGAN_PENETRATE_BASE = 1.0;
const ORGAN_BLUNT_BASE = 0.18;
const ORGAN_PENETRATE_CAP = 0.5;
const ORGAN_BLUNT_CAP = 0.18;
const ORGAN_TRANSFER_PENETRATING = 0.55;
const ORGAN_TRANSFER_BLUNT = 0.25;
const ORGAN_DAMAGE_VARIANCE = 0.4;
const K_PRECISION_ORGAN = 6;
const K_PRECISION_FRACTURE = 4;
const HIDE_WEAR_RESET_TICKS = 750;
export { powerScale, STAT_SCALE } from '../core/rules/body/powerScale';
import { powerScale } from '../core/rules/body/powerScale';
const NATURAL_DAMAGE_BODYSCALE_FACTOR = 0.5;
const MOB_BASE_DAMAGE = 5;
const CRIT_MULTIPLIER = 1.5;
const CRIT_CHANCE_CAP = 0.6;
const KNOCKDOWN_FLOOR_TURNS = 72;
const KNOCKDOWN_TURNS_PER_DAMAGE = 4;
const KNOCKDOWN_MAX_TURNS = 240;
const COLLAPSE_KEEPALIVE_TURNS = 2;
const PAWN_NATURAL_WEAPON_IDS = ['fists', 'kick'];
const FEASTED_CONDITION = 'feasted';
const FEASTED_DURATION_HOURS = 0.5;
const BASE_ATTACK_INTERVAL_TICKS = 120;
const MIN_ATTACK_INTERVAL_TICKS = 72;
const ATTACK_STAMINA_COST = 2;
const WINDED = 'winded';
const COMBAT_REGEN_FRACTION = 0.2;

const FATIGUE_STAMINA_MAX = 1.3;
function fatigueStaminaFactor(e: Pawn | Mob): number {
  const fatigue = Math.max(0, Math.min(100, e.needs?.fatigue ?? 0));
  return 1 + (FATIGUE_STAMINA_MAX - 1) * (fatigue / 100);
}

export interface HitResult {
  hit: boolean;
  blocked?: boolean;
  parried?: boolean;
  bodyPart: BodyPartId | null;
  damage: number;
  injury: Injury | null;
  knockdown: boolean;
  crit: boolean;
  damageType: DamageType;
  weaponId: string;
  staminaCost: number;
  partRemainingHp?: number;
  partMaxHp?: number;
  fractureInjury?: Injury | null;
  organInjury?: Injury | null;
}

export interface CombatService {
  tickCombat(state: GameState, dtMs: number): GameState;
  resolveHit(attacker: Pawn | Mob, defender: Pawn | Mob, state: GameState): HitResult;
  applyInjury(pawnId: string, injury: Injury, state: GameState, knockdown?: boolean): GameState;
  applyInjuryToMob(mobId: string, injury: Injury, state: GameState, knockdown?: boolean): GameState;
  triggerSkill(skillId: string, casterId: string, targetId: string, state: GameState): GameState;
}

interface AttackProfile {
  str: number;
  dex: number;
  baseDamage: number;
  accuracy: number;
  partPreference?: Record<string, number>;
  damageType: DamageType;
  bluntMod: number;
  stunChance: number;
  armorPen: number;
  weaponId: string;
  staminaCost: number;
  critMod: number;
  finesse: boolean;
  arcane: boolean;
  powerStat?: PowerStat;
  critMultiplier?: number;
  bloodletting?: number;
}

export interface RangedOverride {
  profile: AttackProfile;
  hitMod: number;
  strScaled: boolean;
  armorDamage?: number;
}

type WeaponProps = NonNullable<Item['weaponProperties']>;

interface WeaponCandidate {
  id: string;
  wp: WeaponProps;
  bloodletting?: number;
}

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
    accuracy: (wp.accuracy ?? 0) - preferenceTotal(wp.partPreference) * PREFERENCE_ACCURACY_COST,
    partPreference: wp.partPreference,
    damageType: dtype,
    bluntMod: wp.bluntMod ?? (dtype === 'blunt' ? 1.0 : 0),
    stunChance: wp.stunChance ?? 0,
    armorPen: wp.armorPenetration ?? 0,
    weaponId,
    staminaCost: wp.staminaCost ?? ATTACK_STAMINA_COST,
    critMod: wp.critMod ?? 0,
    finesse: wp.finesse ?? false,
    arcane: wp.arcane ?? false,
    powerStat: wp.powerStat,
    critMultiplier: wp.critMultiplier
  };
}

export type PowerStat = 'strength' | 'dexterity' | 'perception' | 'intelligence' | 'charisma';

const DUELIST_DAMAGE_MULT = 1.28;
const DUELIST_ARMOR_PEN = 0.1;
const DUELIST_CRIT = 0.05;
const TWOHAND_DAMAGE_MULT = 1.15;
const TWOHAND_ARMOR_PEN = 0.05;

const DUAL_SPEED_MULT = 1.4;
const DUAL_CRIT = 0.08;
const DUAL_ARMOR_PEN = 0.08;
const DUAL_DAMAGE_MULT = 1.05;
const BLOCK_CAP = 0.65;
const BLOCK_FORCE_REF = 40;
const BLOCK_FORCE_MIN = 0.35;
const BLOCK_FORCE_MAX = 1.4;
const PARRY_CAP = 0.4;
const RANGED_BLOCK_MULT = 0.5;
const MELEE_ACCURACY_WEIGHT = 2;
const BASE_MELEE_HIT = 60;
const DEX_HIT_WEIGHT = 1;
const HIT_CHANCE_WEIGHT = 100 / 3;
const DODGE_HIT_WEIGHT = 50;
const NATURAL_ARMOR_DODGE_DRAG = 0.01;
const PROJECTILE_BY_CATEGORY: Record<string, string> = {
  arrow: 'arrow',
  bolt: 'bolt',
  sling_stone: 'stone'
};
const NOAMMO_NOTIFY_COOLDOWN = 90;

function applyMeleeGrip(p: AttackProfile, grip: MeleeGrip): AttackProfile {
  if (grip === 'duelist') {
    p.baseDamage *= DUELIST_DAMAGE_MULT;
    p.armorPen = clamp(p.armorPen + DUELIST_ARMOR_PEN, 0, 1);
    p.critMod += DUELIST_CRIT;
  } else if (grip === 'dualWield') {
    p.baseDamage *= DUAL_DAMAGE_MULT;
    p.armorPen = clamp(p.armorPen + DUAL_ARMOR_PEN, 0, 1);
    p.critMod += DUAL_CRIT;
  } else if (grip === 'twoHanded') {
    p.baseDamage *= TWOHAND_DAMAGE_MULT;
    p.armorPen = clamp(p.armorPen + TWOHAND_ARMOR_PEN, 0, 1);
  }
  return p;
}

function pawnNaturalWeaponIds(attacker: Pawn): string[] {
  const extra: string[] = [];
  for (const t of attacker.traits ?? []) {
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

function bloodlettingChance(item: Item | undefined): number | undefined {
  const c = item?.onHitWound?.find((w) => w.wound === 'bloodletting')?.chance;
  return c && c > 0 ? c : undefined;
}

function sharpnessBleedMult(
  attacker: Pawn | Mob,
  weaponId: string | undefined,
  turn: number
): number {
  if (!weaponId || !('equipment' in attacker)) return 1;
  const mh = attacker.equipment?.mainHand;
  if (!mh?.coating || mh.coating.expiresAtTurn <= turn) return 1;
  const wpItem = itemService.getItemById(mh.itemId);
  if (weaponId !== mh.itemId && weaponId !== wpItem?.name) return 1;
  const m = itemService.getItemById(mh.coating.itemId)?.coatingEffect?.bleedMult;
  return typeof m === 'number' && m > 0 ? m : 1;
}

function creditKillDeeds(
  attacker: Pawn | Mob,
  victim: Mob,
  weaponId?: string,
  turn?: number
): void {
  if ('creatureId' in attacker) return;
  const def = getCreatureById(victim.creatureId);
  if (!def) return;
  const deeds = (attacker.deeds ??= {});
  const bump = (k: string) => (deeds[k] = (deeds[k] ?? 0) + 1);
  if (def.audio === 'canine') bump('kill:canine');
  if (def.limbMap === 'arachnid') bump('kill:arachnid');
  const item = weaponId ? itemService.getItemById(weaponId) : undefined;
  const unarmed = !weaponId || item?.category === 'natural_weapon';
  if (unarmed && (def.bodyScale ?? 1) >= 1.3) bump('unarmedBigKill');
  const timers = victim.conditionTimers;
  if (timers?.envenomed && timers.envenomed > 0) bump('venomKills');
  if (timers?.ensnared && timers.ensnared > 0) bump('ensnaredKills');
  if (turn !== undefined && getAmbientLight(turn) < 0.35) bump('nightKills');
}

function weaponBonusDamage(attacker: Pawn | Mob): number {
  if (!('traits' in attacker)) return 0;
  let bonus = 0;
  for (const t of attacker.traits ?? []) {
    const m = t.effects?.combatMods?.melee_damage;
    if (typeof m === 'number') bonus += m - 1;
  }
  return bonus;
}

function attackerProfile(attacker: Pawn | Mob, distTiles = 1): AttackProfile {
  const sm = conditionStatMultipliers(attacker);
  const str = attacker.stats.strength * sm.strength;
  const dex = attacker.stats.dexterity * sm.dexterity;

  if ('equipment' in attacker && attacker.equipment?.mainHand && hasUsableHand(attacker)) {
    const mh = attacker.equipment.mainHand;
    const item = itemService.getItemById(mh.itemId);
    if (item?.weaponProperties) {
      const wp = scaleWeaponQuality(item.weaponProperties, mh.quality, mh.famedStatMult);
      const p = profileFromWeapon(str, dex, wp, item.name ?? 'weapon');
      p.bloodletting = bloodlettingChance(item);
      const wb = weaponBonusDamage(attacker);
      if (wb) p.baseDamage *= 1 + wb;
      return applyMeleeGrip(p, getGrip(attacker));
    }
  }

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
  let usable = candidates;
  if (candidates.length > 0 && hasModelledAnatomy(attacker)) {
    const enabled = enabledNaturalWeapons(attacker.limbs);
    usable = candidates.filter((c) => enabled.has(c.id) || !BOUND_NATURAL_WEAPONS.has(c.id));
  }
  if (distTiles > 1) usable = usable.filter((c) => (c.wp.reach ?? 1) >= distTiles);
  if (usable.length > 0) {
    const chosen = pickWeightedWeapon(usable);
    const p = profileFromWeapon(str, dex, chosen.wp, chosen.id);
    p.bloodletting = chosen.bloodletting;
    if ('creatureId' in attacker) {
      const scale = getCreatureById(attacker.creatureId)?.bodyScale ?? 1;
      if (scale !== 1) p.baseDamage *= 1 + (scale - 1) * NATURAL_DAMAGE_BODYSCALE_FACTOR;
    }
    return p;
  }

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

const DAMAGE_RESISTANCE_STAT: Record<DamageType, string> = {
  cutting: 'cutting_resistance',
  piercing: 'piercing_resistance',
  blunt: 'blunt_resistance',
  fire: 'fire_resistance',
  frost: 'cold_resistance',
  lightning: 'lightning_resistance'
};

function physicalResistance(defender: Pawn | Mob, damageType: DamageType): number {
  let res = pawnStatService.evaluateStat(DAMAGE_RESISTANCE_STAT[damageType], defender);

  if ('creatureId' in defender) {
    res += getCreatureById(defender.creatureId)?.resistances?.[damageType] ?? 0;
  }

  return clamp(res, 0, 0.9);
}

function conditionSoakFactor(inst: ItemInstance, item: Item): number {
  const max = item.maxDurability ?? 0;
  if (max <= 0 || inst.durability == null) return 1;
  return 0.5 + 0.5 * clamp(inst.durability / max, 0, 1);
}

type ArmorProps = NonNullable<Item['armorProperties']>;
const ARMOR_DAMAGE_TYPE_RESISTANCE_FIELD: Partial<Record<DamageType, keyof ArmorProps>> = {
  cutting: 'slashResistance',
  piercing: 'pierceResistance',
  blunt: 'crushResistance'
};

function armorTypeResistance(ap: ArmorProps, damageType: DamageType): number {
  const field = ARMOR_DAMAGE_TYPE_RESISTANCE_FIELD[damageType];
  return field ? (ap[field] as number | undefined) ?? 0 : 0;
}

export function partArmorReduction(
  defender: Pawn | Mob,
  partId: BodyPartId,
  armorPen: number,
  rawDamage: number,
  damageType: DamageType,
  turn?: number
): number {
  const def = PART_DEF_MAP[partId];
  if (!def || rawDamage <= 0) return 0;
  let blockable = rawDamage * (1 - armorPen);
  if ('equipment' in defender && defender.equipment) {
    const worn: { layer: number; defense: number }[] = [];
    for (const slot of ARMOUR_SLOTS) {
      const inst = (defender.equipment as Record<string, ItemInstance | undefined>)[slot];
      if (!inst) continue;
      const item = itemService.getItemById(inst.itemId);
      const baseAp = item?.armorProperties;
      if (!item || !baseAp || !coversPart(item, slot, partId)) continue;
      const scaled = scaleArmorQuality(baseAp, inst.quality, inst.famedStatMult);
      worn.push({
        layer: SLOT_LAYER[slot] ?? 1,
        defense:
          scaled.defense *
          conditionSoakFactor(inst, item) *
          (1 + armorTypeResistance(scaled, damageType))
      });
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

function entityNaturalArmor(defender: Pawn | Mob): number {
  if ('creatureId' in defender)
    return defender.naturalArmorOverride ?? getCreatureById(defender.creatureId)?.naturalArmor ?? 0;
  let s = 0;
  for (const t of defender.traits ?? []) s += t.naturalArmor ?? 0;
  return s;
}

function wornStiffness(defender: Pawn | Mob): number {
  const eq = (defender as Pawn).equipment as Record<string, ItemInstance | undefined> | undefined;
  if (!eq) return 0;
  let s = 0;
  for (const slot in eq) {
    const inst = eq[slot];
    if (!inst) continue;
    s += itemService.getItemById(inst.itemId)?.armorProperties?.movementPenalty ?? 0;
  }
  return s;
}
const STIFFNESS_DODGE_CAP = 0.45;

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

function activeHideWear(mob: Mob, partId: BodyPartId, turn: number): number {
  if (!mob.hideWear || mob.hideWearAt == null) return 0;
  if (turn - mob.hideWearAt > HIDE_WEAR_RESET_TICKS) return 0;
  return mob.hideWear[partId] ?? 0;
}

function armorModHits(defender: Pawn | Mob, target: string, partId: BodyPartId): boolean {
  if (target === 'all' || target === partId) return true;
  return limbOfPart(defender, partId)?.id === target;
}

export function partArmorPoints(defender: Pawn | Mob, partId: BodyPartId, turn?: number): number {
  const def = PART_DEF_MAP[partId];
  if (!def) return 0;
  let pts = 0;
  if ('equipment' in defender && defender.equipment) {
    for (const slot of ARMOUR_SLOTS) {
      const inst = (defender.equipment as Record<string, ItemInstance | undefined>)[slot];
      if (!inst) continue;
      const item = itemService.getItemById(inst.itemId);
      if (!item?.armorProperties || !coversPart(item, slot, partId)) continue;
      pts +=
        scaleArmorQuality(item.armorProperties, inst.quality, inst.famedStatMult).defense *
        conditionSoakFactor(inst, item);
    }
  }
  return pts + naturalArmorPoints(defender, def.armor ?? DEFAULT_ARMOR_SHARE, partId, turn);
}

export function partLethality(partId: BodyPartId): number {
  const cached = _lethalityCache.get(partId);
  if (cached !== undefined) return cached;
  const def = PART_DEF_MAP[partId];
  let score = 1;
  if (def) {
    score += def.bleedRatio * 6;
    for (const organ of organsOf(partId)) {
      const o = PART_DEF_MAP[organ];
      if (o?.isCritical) score += 2.5;
      else if (o?.isVital) score += 2;
      if (o?.artery) score += 1.5;
    }
  }
  _lethalityCache.set(partId, score);
  return score;
}
const _lethalityCache = new Map<BodyPartId, number>();

const MAIM_SIGHT = 2.4;
const MAIM_MANIPULATION = 2;
const MAIM_MOVING = 1;
export function partIncapacitation(partId: BodyPartId): number {
  const cached = _maimCache.get(partId);
  if (cached !== undefined) return cached;
  const ids: string[] = [partId, ...organsOf(partId)];
  let score = 0;
  if (ids.some((id) => /eye/i.test(id))) score += MAIM_SIGHT;
  if (/arm|hand|finger|claw|wing/i.test(partId)) score += MAIM_MANIPULATION;
  if (/leg|foot|paw|hoof|talon/i.test(partId)) score += MAIM_MOVING;
  _maimCache.set(partId, score);
  return score;
}
const _maimCache = new Map<BodyPartId, number>();

export function partCombatValue(partId: BodyPartId): number {
  return partLethality(partId) + partIncapacitation(partId);
}

const PRECISION_ARMOUR_DISCOUNT = 0.05;
function preferenceTotal(pref: Record<string, number> | undefined): number {
  if (!pref) return 0;
  let t = 0;
  for (const k in pref) t += pref[k] ?? 0;
  return Math.min(1, t);
}
const PREFERENCE_ACCURACY_COST = 40;

function preferredPart(
  defender: Pawn | Mob,
  pref: Record<string, number> | undefined
): BodyPartId | null {
  if (!pref) return null;
  for (const key in pref) {
    if (rng.random() >= (pref[key] ?? 0)) continue;
    const want = key.toLowerCase();
    const hits: BodyPartId[] = [];
    for (const limb of defender.limbs ?? []) {
      if (limb.isMissing) continue;
      for (const part of limb.parts ?? []) {
        if (part.isMissing) continue;
        if (part.id.toLowerCase().includes(want)) hits.push(part.id as BodyPartId);
      }
    }
    if (hits.length) return hits[Math.floor(rng.random() * hits.length)];
  }
  return null;
}

const PRECISION_CANDIDATES = 3;
const PRECISION_CANDIDATE_SPAN = 14;

function aimedBodyPart(defender: Pawn | Mob, precision: number, turn?: number): BodyPartId {
  const plan = planOf(defender);
  let best = rollBodyPartOf(defender.limbs, plan);
  if (precision <= 0 || rng.random() >= precision) return best;
  const exact = PRECISION_CANDIDATES + precision * PRECISION_CANDIDATE_SPAN;
  const rolls = Math.floor(exact) + (rng.random() < exact - Math.floor(exact) ? 1 : 0);
  if (rolls <= 1) return best;
  const worth = (id: BodyPartId) =>
    (partLethality(id) + partIncapacitation(id)) /
    (1 + partArmorPoints(defender, id, turn) * PRECISION_ARMOUR_DISCOUNT);
  let bestWorth = worth(best);
  for (let i = 1; i < rolls; i++) {
    const cand = rollBodyPartOf(defender.limbs, plan);
    const w = worth(cand);
    if (w > bestWorth) {
      best = cand;
      bestWorth = w;
    }
  }
  return best;
}

function currentPartHealth(defender: Pawn | Mob, partId: BodyPartId, defMaxHp: number): number {
  if (!('limbs' in defender) || !defender.limbs) return defMaxHp;
  const partState = limbOfPart(defender, partId)?.parts?.find((p) => p.id === partId);
  return partState?.health ?? defMaxHp;
}

class CombatServiceImpl implements CombatService {
  private _combatWorking = false;
  private _mobsOwned = false;
  private _pawnsOwned = false;

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
    override?: RangedOverride,
    guaranteed = false
  ): HitResult {
    const profile = override
      ? override.profile
      : attackerProfile(attacker, this.entityDistance(attacker, defender));
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
      bloodletting
    } = profile;

    const ranged = !!override;
    const raw =
      override && !override.strScaled
        ? baseDamage
        : baseDamage *
          pawnStatService.evaluateStat(override ? 'ranged_damage' : 'melee_damage', attacker);

    if (!guaranteed) {
      const pc = ranged ? 0 : this.parryChanceOf(defender);
      if (pc > 0 && rng.random() < pc)
        return this.negatedHit(weaponId, staminaCost, damageType, 'parried');
      const bc = this.blockChance(defender, ranged, raw);
      if (bc > 0 && rng.random() < bc)
        return this.negatedHit(weaponId, staminaCost, damageType, 'blocked');
    }
    const armorDrag = entityNaturalArmor(defender) * NATURAL_ARMOR_DODGE_DRAG;
    const defDodge =
      Math.max(0, pawnStatService.evaluateStat('dodge', defender) - armorDrag) *
      (1 - Math.min(STIFFNESS_DODGE_CAP, wornStiffness(defender))) *
      this.conditionMult(defender, 'dodge');

    const toHit = override
      ? dex * 3 + accuracy * MELEE_ACCURACY_WEIGHT + (override.hitMod ?? 0) - defDodge * 20
      : BASE_MELEE_HIT +
        (pawnStatService.evaluateStat('hit_chance', attacker) - 1) * HIT_CHANCE_WEIGHT +
        accuracy * MELEE_ACCURACY_WEIGHT -
        (defDodge - 1.0) * DODGE_HIT_WEIGHT;
    const hitChance = clamp(toHit * this.conditionMult(attacker, 'hitChance'), 5, 95);
    if (!guaranteed && rng.random() * 100 > hitChance) {
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

    const stealthStrike =
      'entityClass' in defender &&
      !('entityClass' in attacker) &&
      !isDetectedBy(defender as Mob, attacker.id);
    const critChance = clamp(
      (pawnStatService.evaluateStat('hit_precision', attacker) *
        (stealthStrike ? STEALTH_STRIKE_MULT : 1) +
        critMod) *
        this.conditionMult(attacker, 'critChance'),
      0,
      CRIT_CHANCE_CAP
    );
    const crit = rng.random() < critChance;

    const partId =
      preferredPart(defender, profile.partPreference) ??
      aimedBodyPart(defender, critChance, state.turn);
    const partDef = PART_DEF_MAP[partId]!;
    const partMaxHp =
      limbOfPart(defender, partId)?.parts?.find((p) => p.id === partId)?.maxHp ?? partDef.maxHp;

    const armorRed = partArmorReduction(defender, partId, armorPen, raw, damageType, state.turn);
    const physRes = physicalResistance(defender, damageType);
    const mitigated = raw * (1 - armorRed) * (1 - physRes);
    const critMult = profile.critMultiplier ?? CRIT_MULTIPLIER;
    const scaled = mitigated * (crit ? critMult : 1) * this.conditionMult(attacker, 'weaponDamage');
    const final = scaled <= 0 ? 0 : Math.max(1, Math.round(scaled));

    const prevHealth = currentPartHealth(defender, partId, partMaxHp);
    const newHealth = Math.max(0, prevHealth - final);
    const hpMissing = (partMaxHp - newHealth) / partMaxHp;

    const woundDef = woundForDamageType(damageType);
    const injury: Injury = {
      bodyPart: partId,
      type: woundDef.id as Injury['type'],
      severity: severityFromFrac(hpMissing),
      damage: final,
      bleeding: (woundDef.bleedMod > 0 || hpMissing >= 1.0) && hpMissing > 0 ? 1 : 0,
      painContribution: 0,
      infected: false,
      ...(bloodletting &&
      woundDef.bleedMod > 0 &&
      hpMissing > 0 &&
      rng.random() <
        Math.min(0.95, bloodletting * sharpnessBleedMult(attacker, weaponId, state.turn))
        ? { bloodletting: true }
        : {})
    };

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

    let fractureInjury: Injury | null = null;
    const boneTargetId = skeletonPartOf(partId);
    if (boneTargetId != null && hpMissing > 0) {
      const isBlunt = damageType === 'blunt';
      const boneHp = BONE_FRACTION * partMaxHp;
      const transfer = isBlunt ? BONE_TRANSFER_BLUNT * bluntMod : BONE_TRANSFER_OTHER;
      const variance = 1 + (rng.random() * 2 - 1) * BONE_DAMAGE_VARIANCE;
      const boneDamage = Math.max(
        1,
        Math.round(raw * transfer * (1 - armorRed) * (crit ? CRIT_MULTIPLIER : 1) * variance)
      );
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
          severity: severityFromFrac(boneDamage / boneHp),
          damage: boneDamage,
          bleeding: 0,
          painContribution: 0,
          infected: false
        };
      }
    }

    let organInjury: Injury | null = null;
    const organCandidates = organsOf(partId);
    if (organCandidates.length > 0 && hpMissing > 0) {
      const isPenetrating = damageType === 'piercing' || damageType === 'cutting';
      const transfer = isPenetrating ? ORGAN_TRANSFER_PENETRATING : ORGAN_TRANSFER_BLUNT;
      const variance = 1 + (rng.random() * 2 - 1) * ORGAN_DAMAGE_VARIANCE;
      const organDamage = Math.max(
        1,
        Math.round(raw * transfer * (1 - armorRed) * (crit ? CRIT_MULTIPLIER : 1) * variance)
      );
      const organChance = clamp(
        (isPenetrating ? ORGAN_PENETRATE_BASE : ORGAN_BLUNT_BASE) *
          (organDamage / partMaxHp) *
          (1 + critChance * K_PRECISION_ORGAN),
        0,
        isPenetrating ? ORGAN_PENETRATE_CAP : ORGAN_BLUNT_CAP
      );
      if (rng.random() < organChance) {
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
            type: injury.type,
            severity: severityFromFrac(organDamage / chosen.maxHp),
            damage: organDamage,
            bleeding: 0,
            painContribution: 0,
            infected: false,
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

    const targetLimbId =
      limbOfPart(entity, injury.bodyPart)?.id ?? parentLimbOf(planOf(entity), injury.bodyPart);

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
      const maxHp = prev.maxHp || partDef.maxHp;

      const isStructural = woundById(injury.type)?.structural === true;
      const chipsBone = isStructural && partDef.skeleton === true;

      const wIdx = prev.injuries.findIndex((w) => w.type === injury.type);
      const prevW = wIdx >= 0 ? prev.injuries[wIdx] : undefined;
      const accum = Math.min((prevW?.damage ?? 0) + injury.damage, maxHp);
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
        ? Math.max(0, maxHp - accum)
        : isStructural
          ? prev.health
          : Math.max(0, prev.health - injury.damage);

      const updatedPart: BodyPartState = {
        ...prev,
        health: newHp,
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

      const cascade =
        updatedPart.isMissing || updatedPart.health <= 0
          ? cascadeSeveredContents(mergedParts, updatedPart.id)
          : { parts: mergedParts, lostVital: false };
      const newParts = cascade.parts;

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

    const consciousness =
      pawnStatService.computeCapacities({ ...entity, limbs, injuries: newInjuries } as T)
        .consciousness ?? 1;
    const collapsed = consciousness < COLLAPSE_CONSCIOUSNESS;
    const durations = { ...(entity.conditionTimers ?? {}) };
    if (knockdown) {
      const kd = Math.min(
        KNOCKDOWN_MAX_TURNS,
        KNOCKDOWN_FLOOR_TURNS + Math.round(injury.damage * KNOCKDOWN_TURNS_PER_DAMAGE)
      );
      durations.knockdown = Math.max(durations.knockdown ?? 0, kd);
    }
    if (collapsed) durations.collapse = Math.max(durations.collapse ?? 0, COLLAPSE_KEEPALIVE_TURNS);
    const transientConditions = [...(entity.transientConditions ?? [])];
    const cpos = this.entityPos(entity);
    let condTier = 1;
    for (const id of ['knockdown', 'collapse']) {
      if ((durations[id] ?? 0) > 0 && !transientConditions.includes(id)) {
        transientConditions.push(id);
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

  private entityName(e: Pawn | Mob): string {
    if ('entityClass' in e) {
      const base = e.name ?? getCreatureById(e.creatureId)?.name;
      return base ? `${base} #${e.debugId ?? e.id.slice(-4)}` : e.id;
    }
    return e.name;
  }

  private entityPos(e: Pawn | Mob): { x: number; y: number } {
    if ('entityClass' in e) return { x: e.x, y: e.y };
    return { x: e.position?.x ?? -1, y: e.position?.y ?? -1 };
  }

  private emitFloat(x: number, y: number, kind: CombatTextKind, text: string, dy?: number): void {
    if (x < 0 || y < 0) return;
    simLog.pushCombatText({ worldX: x, worldY: y, text, kind, dy });
  }

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

  private entityBehind(
    attacker: Pawn | Mob,
    target: Pawn | Mob,
    state: GameState
  ): Pawn | Mob | null {
    const a = this.entityPos(attacker);
    const t = this.entityPos(target);
    const dx = t.x - a.x;
    const dy = t.y - a.y;
    if (dx === 0 && dy === 0) return null;
    const bx = t.x + Math.sign(dx);
    const by = t.y + Math.sign(dy);
    for (const m of state.mobs ?? []) {
      if (m.isAlive === false || m.id === target.id || m.id === attacker.id) continue;
      if (m.x === bx && m.y === by) return m;
    }
    for (const p of state.pawns ?? []) {
      if (p.isAlive === false || p.id === target.id || p.id === attacker.id) continue;
      if (p.position?.x === bx && p.position?.y === by) return p;
    }
    return null;
  }

  private performAttack(
    attacker: Pawn | Mob,
    target: Pawn | Mob,
    state: GameState,
    turn: number,
    override?: RangedOverride,
    guaranteed = false
  ): { state: GameState; staminaCost: number } {
    const result = this.resolveHit(attacker, target, state, override, guaranteed);
    const pos = this.entityPos(target);

    if (!('entityClass' in attacker) && 'entityClass' in target && (target as Mob).kingdomId) {
      const kid = (target as Mob).kingdomId!;
      const rel = kingdomService.colonyRelationTo(state, kid);
      if (rel && rel.score > -100) {
        state = kingdomService.adjustColonyRelation(state, kid, -200);
      }
    }

    if (
      result.hit &&
      !('entityClass' in attacker) &&
      !('entityClass' in target) &&
      attacker.id !== target.id
    ) {
      state = socialService.onFriendlyFire(state, attacker as Pawn, target as Pawn);
    }

    if (result.hit && !('entityClass' in attacker) && 'entityClass' in target) {
      const struck = target as Mob;
      revealPawnToMob(struck, attacker.id, turn);
      const packKey = struck.lairId ?? struck.partyId;
      if (packKey != null) {
        for (const m of state.mobs ?? []) {
          if (m.id === struck.id || m.isAlive === false) continue;
          if ((m.lairId ?? m.partyId) !== packKey) continue;
          if (chebyshev(m.x, m.y, struck.x, struck.y) <= STEALTH_PACK_ALERT_RADIUS)
            revealPawnToMob(m, attacker.id, turn);
        }
      }
    }

    const apos = this.entityPos(attacker);
    const ldx = pos.x - apos.x;
    const ldy = pos.y - apos.y;
    const lmag = Math.hypot(ldx, ldy) || 1;
    simLog.pushAttackLunge({ attackerId: attacker.id, dirX: ldx / lmag, dirY: ldy / lmag });
    const swingSound = itemService.getItemById(result.weaponId)?.audio;
    if (swingSound) simLog.pushCombatSound({ sound: swingSound, worldX: pos.x, worldY: pos.y });

    const attackerName = this.entityName(attacker);
    const targetName = this.entityName(target);
    const isTargetMob = 'entityClass' in target;
    const witnessed = isWitnessedByColony(
      state.pawns,
      pos.x,
      pos.y,
      getAmbientLight(turn),
      weatherSightMul(state.weather?.type)
    );

    if (result.parried) {
      this.emitFloat(pos.x, pos.y, 'dodge', 'PARRY');
      state = this.performAttack(target, attacker, state, turn, undefined, true).state;
      return { state, staminaCost: result.staminaCost };
    }
    if (result.blocked) {
      this.emitFloat(pos.x, pos.y, 'dodge', 'BLOCK');
      return { state, staminaCost: result.staminaCost };
    }
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
      if (!('entityClass' in attacker) && attacker.isAlive !== false)
        socialService.combatBark(attacker as Pawn, 'miss', targetName, turn);
      return { state, staminaCost: result.staminaCost };
    }
    if (!result.injury) return { state, staminaCost: result.staminaCost };

    let next = isTargetMob
      ? this.applyInjuryToMob(target.id, result.injury, state, result.knockdown)
      : this.applyInjury(target.id, result.injury, state, result.knockdown);

    const pierce = itemService.getItemById(result.weaponId)?.weaponProperties?.pierceThrough ?? 0;
    if (pierce > 0 && result.bodyPart) {
      const behind = this.entityBehind(attacker, target, next);
      if (behind) {
        const carried: Injury = {
          ...result.injury,
          damage: Math.max(1, Math.round(result.injury.damage * pierce)),
          bleeding: result.injury.bleeding * pierce,
          painContribution: result.injury.painContribution * pierce
        };
        next =
          'entityClass' in behind
            ? this.applyInjuryToMob(behind.id, carried, next, false)
            : this.applyInjury(behind.id, carried, next, false);
        const bpos = this.entityPos(behind);
        this.emitFloat(bpos.x, bpos.y, 'damage', `-${carried.damage}`);
      }
    }

    if (result.fractureInjury) {
      next = isTargetMob
        ? this.applyInjuryToMob(target.id, result.fractureInjury, next, false)
        : this.applyInjury(target.id, result.fractureInjury, next, false);
      this.emitFloat(pos.x, pos.y, 'fracture', 'Fractured!', 26);
      const fxSound = conditionAudio('fractured');
      if (fxSound) simLog.pushCombatSound({ sound: fxSound, worldX: pos.x, worldY: pos.y });
    }

    if (result.organInjury) {
      next = isTargetMob
        ? this.applyInjuryToMob(target.id, result.organInjury, next, false)
        : this.applyInjury(target.id, result.organInjury, next, false);
      this.emitFloat(pos.x, pos.y, 'fracture', 'Organ hit!', 26);
    }

    if (!override) next = this.applyShieldBash(next, attacker, target, isTargetMob, pos, apos);

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

    if (isTargetMob && after && !justDied) {
      const victim = after as Mob;
      const victimDef = getCreatureById(victim.creatureId);
      if (
        victimDef?.chargesWhenWounded &&
        victim.state !== 'Attacking' &&
        victim.state !== 'Fleeing'
      ) {
        const attackerPos = this.entityPos(attacker);
        const adj =
          Math.max(Math.abs(victim.x - attackerPos.x), Math.abs(victim.y - attackerPos.y)) <= 1;
        next = {
          ...next,
          mobs: (next.mobs ?? []).map((m) =>
            m.id === victim.id
              ? {
                  ...m,
                  state: adj ? 'Attacking' : 'Alerted',
                  stateSince: turn,
                  huntTargetId: attacker.id,
                  path: []
                }
              : m
          )
        };
      }
    }
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
      if (!('entityClass' in attacker) && attacker.isAlive !== false) {
        memoryService.recordAroundKind(next, pos.x, pos.y, attacker.id, 'combat', {
          subjectName: attackerName.split(' ')[0],
          detail: targetName
        });
      }
    }
    if (
      witnessed &&
      !justDied &&
      !('entityClass' in attacker) &&
      attacker.isAlive !== false &&
      (result.crit ||
        result.injury.severity === 'critical' ||
        result.injury.severity === 'destroyed')
    ) {
      memoryService.recordAroundKind(next, pos.x, pos.y, attacker.id, 'combat', {
        subjectName: attackerName.split(' ')[0],
        detail: targetName,
        memorability: 0.4
      });
    }
    if (!('entityClass' in attacker) && attacker.isAlive !== false)
      socialService.combatBark(attacker as Pawn, justDied ? 'kill' : 'hit', targetName, turn);
    if (!isTargetMob && !justDied && (target as Pawn).isAlive !== false)
      socialService.combatBark(target as Pawn, 'hurt', attackerName, turn);
    if (justDied && isTargetMob && 'traits' in attacker)
      creditKillDeeds(attacker, target as Mob, result.weaponId, turn);
    if (justDied && isTargetMob && !('entityClass' in attacker)) {
      next = socialService.onFoughtTogether(next, attacker as Pawn, pos.x, pos.y);
    }
    const afterEffect = this.applyOnHitEffect(
      next,
      attacker,
      target.id,
      isTargetMob,
      result.weaponId,
      pos
    );

    const afterKnock = override
      ? afterEffect
      : this.applyKnockback(afterEffect, attacker, target, isTargetMob, result.weaponId, apos);

    const armorLoss = this.computeArmorDamage(
      attacker,
      result.damageType,
      !!override,
      override?.armorDamage
    );
    let worn = this.applyGearWear(afterKnock, attacker, target, armorLoss);
    if (isTargetMob && armorLoss > 0 && result.bodyPart) {
      worn = this.chipNaturalHide(worn, target.id, result.bodyPart, armorLoss, turn);
    }
    return {
      state: worn,
      staminaCost: result.staminaCost
    };
  }

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

    let resistFrac = 0;
    if (eff.resist) {
      resistFrac = clamp(pawnStatService.evaluateStat(eff.resist, target), 0, 0.9);
    }
    const chance = clamp(eff.chance * (1 - resistFrac), 0, 1);
    if (rng.random() >= chance) return state;

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
    if (eff.condition) this.emitConditionFloat(pos.x, pos.y, eff.condition, 39);

    let s = this.spliceEntity(state, targetId, updated as Pawn | Mob, isMob);
    if (fed && attacker && attacker.isAlive !== false) {
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

  private meleeReach(entity: Pawn | Mob): number {
    if ('equipment' in entity && entity.equipment?.mainHand && hasUsableHand(entity)) {
      const wp = itemService.getItemById(entity.equipment.mainHand.itemId)?.weaponProperties;
      if (wp && !isRangedWeaponProps(wp)) return Math.max(1, wp.reach ?? 1);
    }
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

  private entityDistance(a: Pawn | Mob, b: Pawn | Mob): number {
    const ap = this.entityPos(a);
    const bp = this.entityPos(b);
    if (ap.x < 0 || ap.y < 0 || bp.x < 0 || bp.y < 0) return 1;
    return Math.max(1, Math.max(Math.abs(ap.x - bp.x), Math.abs(ap.y - bp.y)));
  }

  private applyShieldBash(
    state: GameState,
    attacker: Pawn | Mob,
    target: Pawn | Mob,
    isMob: boolean,
    pos: { x: number; y: number },
    apos: { x: number; y: number }
  ): GameState {
    const sh = this.shieldDef(attacker)?.armorProperties;
    if (!sh) return state;
    if (sh.bashStagger)
      state = this.applyOneOnHitEffect(
        state,
        {
          condition: 'staggered',
          chance: sh.bashStagger,
          resist: 'knockdown_resistance',
          durationHours: 0.5
        },
        target.id,
        isMob,
        pos,
        attacker
      );
    if (sh.bashKnockdown)
      state = this.applyOneOnHitEffect(
        state,
        {
          condition: 'knockdown',
          chance: sh.bashKnockdown,
          resist: 'knockdown_resistance',
          durationHours: 0.4
        },
        target.id,
        isMob,
        pos,
        attacker
      );
    if (sh.bashKnockback)
      state = this.applyKnockback(
        state,
        attacker,
        target,
        isMob,
        undefined,
        apos,
        sh.bashKnockback
      );
    return state;
  }

  private applyKnockback(
    state: GameState,
    attacker: Pawn | Mob,
    target: Pawn | Mob,
    isMob: boolean,
    weaponId: string | undefined,
    apos: { x: number; y: number },
    baseOverride?: number
  ): GameState {
    const base =
      baseOverride ??
      (weaponId ? (itemService.getItemById(weaponId)?.weaponProperties?.knockback ?? 0) : 0);
    if (base <= 0) return state;
    const tgt = isMob
      ? state.mobs?.find((m) => m.id === target.id)
      : state.pawns.find((p) => p.id === target.id);
    if (!tgt || tgt.isAlive === false) return state;
    if (isMob && (tgt as Mob).state === 'Corpse') return state;

    const atkStr = attacker.stats.strength * conditionStatMultipliers(attacker).strength;
    const defStr = tgt.stats.strength * conditionStatMultipliers(tgt).strength;
    const resist = clamp(pawnStatService.evaluateStat('knockdown_resistance', tgt), 0, 0.9);
    const chance = clamp((base + (atkStr - defStr) * 0.02) * (1 - resist), 0, 0.75);
    if (rng.random() >= chance) return state;

    const tpos = this.entityPos(tgt);
    const sx = Math.sign(tpos.x - apos.x);
    const sy = Math.sign(tpos.y - apos.y);
    if (sx === 0 && sy === 0) return state;
    const nx = tpos.x + sx;
    const ny = tpos.y + sy;
    const map = state.worldMap;
    if (ny < 0 || nx < 0 || ny >= map.length || nx >= (map[0]?.length ?? 0)) return state;
    if (map[ny][nx]?.walkable === false) return state;
    const occupied =
      state.pawns.some(
        (p) => p.isAlive !== false && p.position?.x === nx && p.position?.y === ny
      ) ||
      (state.mobs?.some(
        (m) => m.isAlive !== false && m.state !== 'Corpse' && m.x === nx && m.y === ny
      ) ??
        false);
    if (occupied) return state;

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

  private bestArmorSlot(entity: Pawn | Mob): string | null {
    const slots = ['bodyOuter', 'bodyMid', 'bodyBase', 'head', 'gloves', 'boots'];
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

  private decrEquipDurability<T extends Pawn | Mob>(entity: T, slot: string, loss: number): T {
    const eq = entity.equipment as Record<string, ItemInstance | undefined> | undefined;
    const inst = eq?.[slot];
    if (!eq || !inst) return entity;
    const dur = Math.max(0, (inst.durability ?? 0) - loss);
    if (dur <= 0) {
      const next = { ...eq };
      delete next[slot];
      return { ...entity, equipment: next };
    }
    return { ...entity, equipment: { ...eq, [slot]: { ...inst, durability: dur } } };
  }

  private applyGearWear(
    state: GameState,
    attacker: Pawn | Mob,
    defender: Pawn | Mob,
    armorLoss: number
  ): GameState {
    let next = state;
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

  private static readonly DEFAULT_ARMOR_DAMAGE: Record<string, number> = {
    blunt: 4,
    piercing: 2,
    cutting: 1.5
  };

  private computeArmorDamage(
    attacker: Pawn | Mob,
    damageType: DamageType,
    isRanged: boolean,
    ammoArmorDamage?: number
  ): number {
    const stat = pawnStatService.evaluateStat('armor_damage', attacker);
    const byType = CombatServiceImpl.DEFAULT_ARMOR_DAMAGE[damageType] ?? 2;
    if (isRanged) return (ammoArmorDamage ?? byType * 0.4) * stat;
    const wp =
      'equipment' in attacker && attacker.equipment?.mainHand
        ? itemService.getItemById(attacker.equipment.mainHand.itemId)?.weaponProperties
        : undefined;
    return (wp?.armorDamage ?? byType) * stat;
  }

  private nearestHostileInRange(pawn: Pawn, mobs: Mob[], maxRange: number): Mob | undefined {
    if (!pawn.position) return undefined;
    const px = pawn.position.x;
    const py = pawn.position.y;
    let best: Mob | undefined;
    let bestDist = Infinity;
    for (const m of mobs) {
      if (m.isAlive === false || m.state === 'Corpse') continue;
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

  private buildRangedOverride(
    pawn: Pawn,
    rw: RangedWeapon,
    ammo: AmmoPick | null,
    dist: number,
    coverPenalty: number
  ): RangedOverride {
    const rawWp = itemService.getItemById(rw.itemId)?.weaponProperties;
    const wp = rawWp ? scaleWeaponQuality(rawWp, rw.quality, rw.famedStatMult) : undefined;
    const profile = profileFromWeapon(
      pawn.stats.strength,
      pawn.stats.dexterity,
      wp ?? { damage: 1, attackSpeed: 1, range: rw.range },
      rw.itemName
    );
    if (ammo) {
      const drawPower = rawWp?.drawPower ?? 1;
      profile.baseDamage = (ammo.props.damage ?? 0) * drawPower + (ammo.props.damageBonus ?? 0);
      if (ammo.props.damageType) profile.damageType = ammo.props.damageType;
    }
    profile.armorPen = clamp(profile.armorPen + (ammo?.props.armorPen ?? 0), 0, 1);
    const hitMod = rangedAccuracyMod(
      pawnStatService.evaluateStat('aim_accuracy', pawn),
      sumAimBonuses(pawn).accuracy,
      ammo?.props.accuracyBonus ?? 0,
      dist,
      coverPenalty
    );
    return { profile, hitMod, strScaled: rw.strScaled, armorDamage: ammo?.props.armorDamage };
  }

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
    if (dist > effectiveRangedRange(pawn, rw)) return null;

    if (
      pawn.position &&
      !hasLineOfSight(state.worldMap, pawn.position.x, pawn.position.y, tpos.x, tpos.y)
    ) {
      return null;
    }

    let ammo: AmmoPick | null = null;
    if (rw.ammoCategory) {
      ammo = pickAmmo(pawn, rw.ammoCategory);
      if (!ammo) return null;
    }

    const attackSpeed = Math.max(
      0.5,
      pawnStatService.evaluateStat('attack_speed', pawn) * this.conditionMult(pawn, 'attackSpeed')
    );
    const baseInterval = Math.max(
      MIN_ATTACK_INTERVAL_TICKS,
      Math.round(BASE_ATTACK_INTERVAL_TICKS / attackSpeed)
    );
    const interval = aimIntervalTicks(
      baseInterval,
      rw.reload,
      dist,
      pawnStatService.evaluateStat('aim_speed', pawn),
      sumAimBonuses(pawn).speed + drawSpeedModifier(pawn, rw.ammoCategory),
      pawnStatService.evaluateStat('reload_speed', pawn)
    );
    if (turn % interval !== 0) return null;

    const cover = this.rangedCoverPenalty(state, tpos.x, tpos.y);
    const override = this.buildRangedOverride(pawn, rw, ammo, dist, cover);
    const atk = this.performAttack(pawn, target, state, turn, override);

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
      atk.state = this.clearEquipSlot(atk.state, pawn.id, rw.slot);
      recovered.push({
        id: `thrown-${rw.itemId}-${turn}-${tpos.x}-${tpos.y}-${Math.floor(rng.random() * 1e6)}`,
        resourceId: rw.itemId,
        x: tpos.x,
        y: tpos.y,
        quantity: 1
      });
    }
    return atk;
  }

  private _noAmmoNotified = new Map<string, number>();

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

  private isKnockedDown(e: Pawn | Mob): boolean {
    const d = e.conditionTimers;
    return (d?.knockdown ?? 0) > 0 || (d?.collapse ?? 0) > 0;
  }

  private isWinded(e: Pawn | Mob): boolean {
    return (e.conditionTimers?.winded ?? 0) > 0;
  }

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

  private conditionMult(e: Pawn | Mob, key: string): number {
    let m = 1;
    for (const id of e.transientConditions ?? []) {
      const mods = TRANSIENT_CONDITIONS_DB.find((s) => s.id === id)?.modifiers as
        | Record<string, number>
        | undefined;
      if (mods?.[key] != null) m *= mods[key];
    }
    for (const c of e.conditions ?? []) {
      const mods = getConditionCurrentStage(c)?.modifiers as Record<string, number> | undefined;
      if (mods?.[key] != null) m *= mods[key];
    }
    return m;
  }

  private shieldDef(e: Pawn | Mob): Item | undefined {
    const eq = 'equipment' in e ? e.equipment : undefined;
    const off = eq?.offHand ? itemService.getItemById(eq.offHand.itemId) : undefined;
    return off?.armorProperties?.armorType === 'shield' ? off : undefined;
  }

  private blockChance(defender: Pawn | Mob, ranged: boolean, incoming = BLOCK_FORCE_REF): number {
    const shield = this.shieldDef(defender)?.armorProperties;
    const bonus = shield?.blockBonus ?? 0;
    const base =
      (pawnStatService.evaluateStat('block', defender) + bonus) *
      this.conditionMult(defender, 'block');
    const ref = BLOCK_FORCE_REF * (1 + bonus);
    const forceFactor = clamp(
      (2 * ref) / (ref + Math.max(0, incoming)),
      BLOCK_FORCE_MIN,
      BLOCK_FORCE_MAX
    );
    return clamp(base * forceFactor * (ranged ? RANGED_BLOCK_MULT : 1), 0, BLOCK_CAP);
  }

  private parryChanceOf(defender: Pawn | Mob): number {
    return clamp(this.shieldDef(defender)?.armorProperties?.parryChance ?? 0, 0, PARRY_CAP);
  }

  private negatedHit(
    weaponId: string,
    staminaCost: number,
    damageType: DamageType,
    kind: 'blocked' | 'parried'
  ): HitResult {
    return {
      hit: false,
      blocked: kind === 'blocked',
      parried: kind === 'parried',
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

  private tickStaminaAndWinded<T extends Pawn | Mob>(e: T): T {
    if (e.isAlive === false) return e;
    const max = e.maxStamina ?? calcMaxStamina(e.stats);
    const postDrain = e.stamina ?? max;
    const wasWinded = this.isWinded(e);
    let winded = wasWinded || postDrain <= 0;

    let stamina = postDrain;
    if (postDrain < max) {
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
      durations.winded = 2;
      if (!transientConditions.includes(WINDED)) {
        transientConditions = [...transientConditions, WINDED];
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
    let next: GameState = state;
    const mobStaminaUpdates = new Map<string, number>();
    const pawnStaminaUpdates = new Map<string, number>();
    const pawnAmmoUpdates = new Map<string, { itemId: string; newQty: number }>();
    const recoveredAmmo: DroppedItem[] = [];

    const mobs = state.mobs ?? [];
    for (const mob of mobs) {
      if (mob.state !== 'Attacking' || mob.isAlive === false) continue;
      if (this.isKnockedDown(mob)) continue;
      if (this.isWinded(mob)) continue;
      const attackSpeed = Math.max(0.5, pawnStatService.evaluateStat('attack_speed', mob));
      const interval = Math.max(
        MIN_ATTACK_INTERVAL_TICKS,
        Math.round(BASE_ATTACK_INTERVAL_TICKS / attackSpeed)
      );
      if ((state.turn - mob.stateSince) % interval !== 0) continue;

      const curStamina = mob.stamina ?? mob.maxStamina ?? 50;

      let target: Pawn | Mob | undefined;
      if (mob.huntTargetId) {
        target = mobs.find((m) => m.id === mob.huntTargetId && m.isAlive !== false);
      }
      if (!target) {
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
      mobStaminaUpdates.set(
        mob.id,
        Math.max(0, curStamina - atk.staminaCost * fatigueStaminaFactor(mob))
      );
    }

    for (const pawn of state.pawns) {
      if (pawn.isAlive === false || !pawn.position) continue;
      if (this.isKnockedDown(pawn)) continue;
      if (this.isWinded(pawn)) continue;

      const rw = getRangedWeapon(pawn);
      const acquireRange = rw ? effectiveRangedRange(pawn, rw) : this.meleeReach(pawn);

      let target: Pawn | Mob | undefined;
      if (pawn.drafted && pawn.draftTarget?.type === 'attack') {
        const dt = pawn.draftTarget;
        target =
          dt.targetType === 'mob'
            ? mobs.find((m) => m.id === dt.targetId && m.isAlive !== false)
            : state.pawns.find((p) => p.id === dt.targetId && p.isAlive !== false);
        if (!target) {
          next = {
            ...next,
            pawns: next.pawns.map((p) => (p.id === pawn.id ? { ...p, draftTarget: undefined } : p))
          };
          continue;
        }
      } else if (pawn.drafted) {
        target = this.nearestHostileInRange(pawn, mobs, acquireRange);
        if (!target) continue;
      } else if (pawn.currentState === 'Fighting') {
        target = this.nearestHostileInRange(pawn, mobs, acquireRange);
      } else if (pawn.currentState === 'BloodHunt' && pawn.huntTargetId) {
        target =
          mobs.find(
            (m) => m.id === pawn.huntTargetId && m.isAlive !== false && m.state !== 'Corpse'
          ) ??
          state.pawns.find(
            (p) => p.id === pawn.huntTargetId && p.id !== pawn.id && p.isAlive !== false
          );
        if (!target) continue;
      } else if (pawn.currentState === 'Hunting' && pawn.huntTargetId) {
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

      const forceMelee =
        !!pawn.drafted && pawn.draftTarget?.type === 'attack' && pawn.draftTarget.mode === 'melee';
      const rangedAuto = !!rw && !forceMelee;

      if (rangedAuto && !hasViableAmmo(pawn, rw)) {
        this.notifyNoAmmo(pawn, state.turn);
        continue;
      }

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
        continue;
      }

      if (tdist > this.meleeReach(pawn)) continue;

      const pawnAttackSpeed = Math.max(
        0.5,
        pawnStatService.evaluateStat('attack_speed', pawn) * this.conditionMult(pawn, 'attackSpeed')
      );
      const pawnInterval = Math.max(
        MIN_ATTACK_INTERVAL_TICKS,
        Math.round(BASE_ATTACK_INTERVAL_TICKS / pawnAttackSpeed)
      );
      if (state.turn % pawnInterval !== 0) continue;

      const atk = this.performAttack(pawn, target, next, state.turn);
      next = atk.state;
      pawnStaminaUpdates.set(
        pawn.id,
        Math.max(0, curStamina - atk.staminaCost * fatigueStaminaFactor(pawn))
      );
    }

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
    if (recoveredAmmo.length > 0) {
      next = { ...next, droppedItems: [...(next.droppedItems ?? []), ...recoveredAmmo] };
    }

    return next;
  }

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
