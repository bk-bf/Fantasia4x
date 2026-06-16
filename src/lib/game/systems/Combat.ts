// src/lib/game/systems/Combat.ts
import type {
  GameState,
  Pawn,
  Mob,
  Injury,
  LimbState,
  BodyPartState,
  EntityCondition,
  BodyPartId,
  DamageType,
  LimbId,
  Item,
  ItemInstance
} from '../core/types';
import { itemService } from '../services/ItemService';
import { getCreatureById } from '../core/Creatures';
import { woundForDamageType, woundById, severityFromFrac } from '../core/Wounds';
import { pawnStatService } from '../services/PawnStatService';
import { calcMaxStamina } from '../entities/Pawns';
import statusEffectsData from '../database/status-effects.jsonc';
import type { StatusEffectDef } from '../core/types';
import { simLog, type CombatTextKind } from '../core/logSink';
import { rng } from '../core/rng';
import { perTick } from '../core/time';
// P-4: the body-part anatomy table + selection helpers moved to core/BodyParts. Re-export the two
// symbols external code imported from Combat (PawnHealth, EntityService, Pawns) so they're unchanged.
import { PART_DEF_MAP, rollBodyPart, createDefaultBodyParts } from '../core/BodyParts';
export { PART_DEF_MAP, createDefaultBodyParts };

const STATUS_EFFECTS_DB = statusEffectsData as unknown as StatusEffectDef[];

// ── Tuning constants ─────────────────────────────────────────────────────────
/** Scales per-part bleed so a fully-severed 5%-mass hand ≈ 2 blood/turn. */
const BLEED_CONSTANT = 40;
/** Stats are on a ~5–22 scale; this divisor keeps damage in a sensible range. */
const STAT_SCALE = 10;
/** Mob base damage when it has no weapon. */
const MOB_BASE_DAMAGE = 5;
/** Damage multiplier applied on a critical hit. */
const CRIT_MULTIPLIER = 1.5;
/** Upper bound on total crit chance (base stat + weapon critMod). */
const CRIT_CHANCE_CAP = 0.6;
/** Consciousness (capacity 0–1) below which an entity collapses — out of the fight,
 *  distinct from a brief blunt knockdown. Consciousness already folds in pain, blood
 *  loss and organ damage, so downing is unified rather than a separate pain threshold.
 *  Mobs are defeated on collapse; pawns go down until consciousness recovers. */
const COLLAPSE_CONSCIOUSNESS = 0.3;
/** Turns a blunt knockdown keeps an entity prone (short tactical stagger). */
const KNOCKDOWN_TURNS = 2;
/**
 * A pawn's innate attacks — ids of `natural_weapon` items in items.jsonc. Bare hands
 * are deliberately weak vs crafted gear so equipping a real weapon is a clear upgrade;
 * the per-weapon weight/stamina/crit (kicks rarer, costlier, harder) live on the items.
 */
const PAWN_NATURAL_WEAPON_IDS = ['fists', 'kick'];
/** Base attack interval in ticks — scaled by attack_speed stat.
 *  60 TPS: 120 ticks = 2.0s = 1 attack / 2s (base).
 *  Fast attackers (DEX 20) floor at 72 ticks = 1.2s.
 *  (Halved 2026-06-14, then halved AGAIN 2026-06-15 — at 100+ TPS combat resolved before the player
 *  could read it; swings should land at a watchable pace. May go to 1/4 of the original later.)
 */
const BASE_ATTACK_INTERVAL_TICKS = 120;
/** Minimum ticks between attacks regardless of attack_speed (caps the fastest attacker). */
const MIN_ATTACK_INTERVAL_TICKS = 72;
/** Stamina drained per auto-attack when a weapon defines no `staminaCost` of its own. */
const ATTACK_STAMINA_COST = 2;
/** Status-effect id for the winded state (latches at 0 stamina, clears at full). */
const WINDED = 'winded';
/** While actively fighting, stamina regenerates at this fraction of the full rate, so a
 *  sustained melee drains down to winded; a winded/resting entity recovers at the full rate. */
const COMBAT_REGEN_FRACTION = 0.2;

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
}

export interface CombatService {
  /**
   * Advance all active combats one tick (mob-vs-pawn, mob-vs-mob, pawn-vs-mob).
   * Called from GameEngineImpl after Entity Step (Phase C wiring).
   */
  tickCombat(state: GameState, dtMs: number): GameState;
  /** Pure hit resolution: roll to-hit, pick body part, compute damage & injury. */
  resolveHit(attacker: Pawn | Mob, defender: Pawn | Mob, state: GameState): HitResult;
  /** Apply an already-resolved Injury to a pawn, updating limb tree + conditions.
   *  `knockdown` applies a short blunt-stagger status when the swing rolled one. */
  applyInjury(pawnId: string, injury: Injury, state: GameState, knockdown?: boolean): GameState;
  /** Apply an already-resolved Injury to a mob, updating limb tree + conditions. */
  applyInjuryToMob(mobId: string, injury: Injury, state: GameState, knockdown?: boolean): GameState;
  /** Deferred — stub; wired by MAGIC-SKILLS spec. */
  triggerSkill(skillId: string, casterId: string, targetId: string, state: GameState): GameState;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Derive a wound's severity, bleed rate and pain from its accumulated damage on a
 * part. Shared by damage application (Combat) and healing (PawnStateMachine) so both
 * the build-up and the recovery use one formula. Bleed/pain scale with the wound's
 * total damage as a fraction of the part's max HP; vital parts hurt twice as much.
 */
export function recomputeWound(
  bodyPart: BodyPartId,
  type: Injury['type'],
  accumDamage: number,
  prev?: Pick<Injury, 'infected' | 'treatedAt'>
): Injury {
  const partDef = PART_DEF_MAP[bodyPart];
  const wd = woundById(type);
  const maxHp = partDef?.maxHp ?? 1;
  const frac = maxHp > 0 ? Math.min(accumDamage / maxHp, 1) : 0;
  return {
    bodyPart,
    type,
    severity: severityFromFrac(frac),
    damage: accumDamage,
    bleeding: partDef
      ? Math.round(partDef.bleedRatio * BLEED_CONSTANT * (wd?.bleedMod ?? 0) * frac * 100) / 100
      : 0,
    painContribution:
      Math.round(accumDamage * (wd?.painPerDamage ?? 0.5) * (partDef?.isVital ? 2 : 1) * 10) / 10,
    infected: prev?.infected ?? false,
    treatedAt: prev?.treatedAt
  };
}

interface AttackProfile {
  str: number;
  dex: number;
  baseDamage: number;
  accuracy: number;
  damageType: DamageType;
  bluntMod: number;
  armorPen: number;
  /** Which attack was rolled this swing (weapon name / natural-weapon id) — for logs & floaters. */
  weaponId: string;
  /** Stamina this particular attack drains. */
  staminaCost: number;
  /** Crit chance this attack adds on top of the attacker's base crit_chance stat. */
  critMod: number;
}

type WeaponProps = NonNullable<Item['weaponProperties']>;

/** One natural-weapon candidate this swing could roll: its item id + properties. */
interface WeaponCandidate {
  id: string;
  wp: WeaponProps;
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
    baseDamage: wp.baseDamage ?? wp.damage,
    accuracy: wp.accuracy ?? 0,
    damageType: dtype,
    bluntMod: wp.bluntMod ?? (dtype === 'blunt' ? 1.0 : 0),
    armorPen: wp.armorPenetration ?? 0,
    weaponId,
    staminaCost: wp.staminaCost ?? ATTACK_STAMINA_COST,
    critMod: wp.critMod ?? 0
  };
}

/** Resolve the attack used for one swing. An equipped weapon wins; otherwise a
 *  weighted roll over the attacker's `natural_weapon` items (creature def, or a
 *  pawn's bare hands/feet); finally an unarmed fallback. Both gear paths resolve
 *  through the same ItemService lookup. */
function attackerProfile(attacker: Pawn | Mob): AttackProfile {
  const str = attacker.stats.strength;
  const dex = attacker.stats.dexterity;

  // Equipped weapon (pawns; future-proofed for armed mobs).
  if ('equipment' in attacker && attacker.equipment?.mainHand) {
    const item = itemService.getItemById(attacker.equipment.mainHand.itemId);
    if (item?.weaponProperties) {
      return profileFromWeapon(str, dex, item.weaponProperties, item.name ?? 'weapon');
    }
  }

  // Natural weapons: ids from the creature def, or the pawn default set. Resolve
  // each to its item and weighted-pick one for this swing.
  const ids =
    'creatureId' in attacker
      ? (getCreatureById(attacker.creatureId)?.naturalWeapons ?? [])
      : PAWN_NATURAL_WEAPON_IDS;
  const candidates: WeaponCandidate[] = [];
  for (const id of ids) {
    const wp = itemService.getItemById(id)?.weaponProperties;
    if (wp) candidates.push({ id, wp });
  }
  if (candidates.length > 0) {
    const chosen = pickWeightedWeapon(candidates);
    return profileFromWeapon(str, dex, chosen.wp, chosen.id);
  }

  // Unarmed fallback (body-slam) — entity with no weapon and no natural-weapon items.
  return {
    str,
    dex,
    baseDamage: MOB_BASE_DAMAGE,
    accuracy: 0,
    damageType: 'blunt',
    bluntMod: 1.0,
    armorPen: 0,
    weaponId: 'strike',
    staminaCost: ATTACK_STAMINA_COST,
    critMod: 0
  };
}

/**
 * Compute the defender's physical damage resistance for a given damage type.
 * Sources: racial trait general damageReduction + type-specific resistance + base stat contribution.
 * Clamped 0–0.90 (can never fully negate damage from this layer alone).
 */
function physicalResistance(defender: Pawn | Mob, damageType: DamageType): number {
  const con = defender.stats.constitution;
  const dex = defender.stats.dexterity;
  const str = defender.stats.strength;

  // Base from stats (matches cutting/piercing/blunt_resistance ability formulas)
  let res = 0;
  if (damageType === 'cutting') res += (dex - 10) * 0.01;
  if (damageType === 'piercing') res += (con - 10) * 0.008;
  if (damageType === 'blunt') res += (con - 10) * 0.008 + (str - 10) * 0.004;

  // Racial trait bonuses
  const traits = 'racialTraits' in defender ? (defender.racialTraits ?? []) : [];
  for (const trait of traits) {
    res += trait.effects.damageReduction ?? 0;
    if (damageType === 'cutting') res += trait.effects.cutting_resistance ?? 0;
    if (damageType === 'piercing') res += trait.effects.piercing_resistance ?? 0;
    if (damageType === 'blunt') res += trait.effects.blunt_resistance ?? 0;
  }

  return clamp(res, 0, 0.9);
}

function partArmorReduction(defender: Pawn | Mob, partId: BodyPartId, armorPen: number): number {
  if (!('equipment' in defender)) return 0;
  // Combine armor from all body-slot instances (pick the best defense across worn slots).
  const bodySlots = [
    'bodyOuter',
    'bodyMid',
    'bodyBase',
    'headBase',
    'headOuter',
    'gloves',
    'boots',
    'gorget'
  ] as const;
  let ap: import('../core/types').Item['armorProperties'] | undefined;
  let bestDef = 0;
  for (const slot of bodySlots) {
    const inst = (defender.equipment as Record<string, ItemInstance | undefined>)[slot];
    if (!inst) continue;
    const candidate = itemService.getItemById(inst.itemId)?.armorProperties;
    if (candidate && candidate.defense > bestDef) {
      ap = candidate;
      bestDef = candidate.defense;
    }
  }
  if (!ap) return 0;
  const def = PART_DEF_MAP[partId];
  if (!def) return 0;
  // Torso/head get full armour benefit; limbs only partial
  const base =
    def.parentLimb === 'torso' || def.parentLimb === 'head'
      ? ap.defense / 100
      : (ap.defense / 100) * 0.3;
  return clamp(base * (1 - armorPen), 0, 0.9);
}

function currentPartHealth(defender: Pawn | Mob, partId: BodyPartId, defMaxHp: number): number {
  if (!('limbs' in defender) || !defender.limbs) return defMaxHp;
  const def = PART_DEF_MAP[partId];
  if (!def) return defMaxHp;
  const root = defender.limbs.find((l) => l.id === def.parentLimb);
  const partState = root?.parts?.find((p) => p.id === partId);
  return partState?.health ?? defMaxHp;
}

function upsertCondition(
  conditions: EntityCondition[],
  id: string,
  severity: number
): EntityCondition[] {
  const i = conditions.findIndex((c) => c.id === id);
  const clamped = clamp(severity, 0, 1);
  if (i >= 0) {
    const next = [...conditions];
    next[i] = { ...next[i], severity: clamped };
    return next;
  }
  return [...conditions, { id, severity: clamped }];
}

// ── Implementation ────────────────────────────────────────────────────────────
class CombatServiceImpl implements CombatService {
  resolveHit(attacker: Pawn | Mob, defender: Pawn | Mob, _state: GameState): HitResult {
    const {
      str,
      dex,
      baseDamage,
      accuracy,
      damageType,
      bluntMod,
      armorPen,
      weaponId,
      staminaCost,
      critMod
    } = attackerProfile(attacker);
    // Evasion uses the `dodge` stat (DEX − weight, × moving) rather than raw dexterity, so injury,
    // load, and the winded penalty (× 0.5) all lower it. ×20 keeps baseline parity with the old
    // `defDex × 2` term (dodge ≈ 1.0 at DEX 10 → 20).
    const defDodge =
      pawnStatService.evaluateStat('dodge', defender) * this.effectDodgeMult(defender);

    const hitChance = clamp(dex * 3 + accuracy - defDodge * 20, 5, 95);
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

    const partId = rollBodyPart();
    const partDef = PART_DEF_MAP[partId]!;

    // Crit: base crit_chance stat (DEX/PER + capacities) plus this weapon's critMod.
    // A crit multiplies the post-mitigation damage — so a high-crit build with a
    // high-crit weapon spikes hard.
    const critChance = clamp(
      pawnStatService.evaluateStat('crit_chance', attacker) + critMod,
      0,
      CRIT_CHANCE_CAP
    );
    const crit = rng.random() < critChance;

    // Damage: baseDamage × str / STAT_SCALE, then armour + resistance reduce it,
    // then the crit multiplier. STAT_SCALE=10 matches the real stat range (5–22).
    const raw = (baseDamage * str) / STAT_SCALE;
    const armorRed = partArmorReduction(defender, partId, armorPen);
    const physRes = physicalResistance(defender, damageType);
    const mitigated = raw * (1 - armorRed) * (1 - physRes);
    const final = Math.max(1, Math.round(mitigated * (crit ? CRIT_MULTIPLIER : 1)));

    const prevHealth = currentPartHealth(defender, partId, partDef.maxHp);
    const newHealth = Math.max(0, prevHealth - final);
    const hpMissing = (partDef.maxHp - newHealth) / partDef.maxHp;

    // This-hit wound increment. The damage type picks the wound (cut/puncture/crush/
    // burn); accumulation, final severity, bleed rate and pain are computed when the
    // wound is merged into the part (applyInjury) — same-type hits stack into one.
    const woundDef = woundForDamageType(damageType);
    const injury: Injury = {
      bodyPart: partId,
      type: woundDef.id as Injury['type'],
      severity: severityFromFrac(hpMissing),
      damage: final,
      bleeding: woundDef.bleedMod > 0 && hpMissing > 0 ? 1 : 0,
      painContribution: 0,
      infected: false
    };

    // Knockdown: blunt/crush hits roll chance based on damage vs constitution.
    const defCon = defender.stats.constitution ?? 10;
    const knockChance = damageType === 'blunt' ? clamp((final - defCon / 4) * bluntMod, 0, 100) : 0;
    const knockdown = knockChance > 0 && rng.random() * 100 < knockChance;

    return {
      hit: true,
      bodyPart: partId,
      damage: final,
      injury,
      knockdown,
      crit,
      damageType,
      weaponId,
      staminaCost,
      partRemainingHp: newHealth,
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

    // ── Update limb tree: merge this hit into the part's same-type wound ──────
    const limbs: LimbState[] = (entity.limbs ?? []).map((limb) => {
      if (limb.id !== partDef.parentLimb) return limb;

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

      const newHp = Math.max(0, prev.health - injury.damage);

      // Stack: one wound per type per part. Same-type hits accumulate damage and
      // escalate severity (5 crushes → one severe crush) instead of piling up.
      const wIdx = prev.injuries.findIndex((w) => w.type === injury.type);
      const prevW = wIdx >= 0 ? prev.injuries[wIdx] : undefined;
      const accum = Math.min((prevW?.damage ?? 0) + injury.damage, partDef.maxHp);
      const merged = recomputeWound(injury.bodyPart, injury.type, accum, prevW);
      const woundList =
        wIdx >= 0
          ? prev.injuries.map((w, i) => (i === wIdx ? merged : w))
          : [...prev.injuries, merged];

      const updatedPart: BodyPartState = {
        ...prev,
        health: newHp,
        isMissing: prev.isMissing || merged.severity === 'destroyed',
        injuries: woundList
      };
      const newParts =
        idx >= 0
          ? existing.map((p, i) => (i === idx ? updatedPart : p))
          : [...existing, updatedPart];

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

    // blood_loss severity derived from current bloodVolume
    const maxBV = entity.maxBloodVolume ?? 100;
    const bloodLossSev = clamp(1 - (entity.bloodVolume ?? maxBV) / maxBV, 0, 1);
    const newConditions = upsertCondition(entity.conditions ?? [], 'blood_loss', bloodLossSev);

    // Status effects. Knockdown = a short blunt stagger (this swing rolled one).
    // Collapse = loss of consciousness (pain + blood loss + organ damage, via the
    // capacity), kept active while it stays low; the pawn state machine clears it as
    // the pawn recovers. Deliberately distinct: a stagger is momentary, a collapse
    // ends the fight.
    const consciousness =
      pawnStatService.computeCapacities({ ...entity, limbs, injuries: newInjuries } as T)
        .consciousness ?? 1;
    const collapsed = consciousness < COLLAPSE_CONSCIOUSNESS;
    const durations = { ...(entity.statusEffectDurations ?? {}) };
    if (knockdown) durations.knockdown = Math.max(durations.knockdown ?? 0, KNOCKDOWN_TURNS);
    if (collapsed) durations.collapse = Math.max(durations.collapse ?? 0, KNOCKDOWN_TURNS);
    const activeEffects = [...(entity.activeEffects ?? [])];
    for (const id of ['knockdown', 'collapse']) {
      if ((durations[id] ?? 0) > 0 && !activeEffects.includes(id)) activeEffects.push(id);
    }

    const updated = {
      ...entity,
      limbs,
      injuries: newInjuries,
      pain: newPain,
      statusEffectDurations: durations,
      activeEffects,
      conditions: newConditions
    };

    // Resolution: a destroyed vital part is instant death. Otherwise a collapse
    // takes the entity out of the fight — a mob is defeated (no capture system yet),
    // a pawn goes down (the state machine drives the Collapsed state + recovery).
    if (partDef.isVital && injury.severity === 'destroyed') {
      if (entityType === 'pawn') {
        (updated as Pawn).isAlive = false;
        (updated as Pawn).currentState = 'Dead';
      } else {
        (updated as Mob).isAlive = false;
        (updated as Mob).state = 'Corpse';
        (updated as Mob).diedAt = state.turn;
        (updated as Mob).intactness = 1.0;
      }
    } else if (collapsed && entityType === 'mob') {
      (updated as Mob).isAlive = false;
      (updated as Mob).state = 'Corpse';
      (updated as Mob).diedAt = state.turn;
      (updated as Mob).intactness = 1.0;
    }

    if (entityType === 'pawn') {
      return {
        ...state,
        pawns: state.pawns.map((p) => (p.id === entity.id ? (updated as Pawn) : p))
      };
    } else {
      return {
        ...state,
        mobs: state.mobs!.map((m) => (m.id === entity.id ? (updated as Mob) : m))
      };
    }
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
      const def = getCreatureById(e.creatureId);
      return def ? `${def.name} #${e.debugId ?? e.id.slice(-4)}` : e.id;
    }
    return e.name;
  }

  /** Live tile coordinate of an entity (mobs carry x/y, pawns a position object). */
  private entityPos(e: Pawn | Mob): { x: number; y: number } {
    if ('entityClass' in e) return { x: e.x, y: e.y };
    return { x: e.position?.x ?? -1, y: e.position?.y ?? -1 };
  }

  private emitFloat(x: number, y: number, kind: CombatTextKind, text: string): void {
    if (x < 0 || y < 0) return;
    simLog.pushCombatText({ worldX: x, worldY: y, text, kind });
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
    turn: number
  ): { state: GameState; staminaCost: number } {
    const result = this.resolveHit(attacker, target, state);
    const pos = this.entityPos(target);
    const attackerName = this.entityName(attacker);
    const targetName = this.entityName(target);
    const isTargetMob = 'entityClass' in target;

    // Miss → no injury, but log + show the dodge. The swing still cost stamina.
    if (!result.hit) {
      this.emitFloat(pos.x, pos.y, 'dodge', 'dodge');
      simLog.logCombatSwing(attacker.id, attackerName, target.id, targetName, turn, pos.x, pos.y, {
        turn,
        attackerName,
        defenderName: targetName,
        hit: false,
        weapon: result.weaponId
      });
      return { state, staminaCost: result.staminaCost };
    }
    if (!result.injury) return { state, staminaCost: result.staminaCost };

    const next = isTargetMob
      ? this.applyInjuryToMob(target.id, result.injury, state, result.knockdown)
      : this.applyInjury(target.id, result.injury, state, result.knockdown);

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
    if (result.knockdown) this.emitFloat(pos.x, pos.y, 'knockdown', 'DOWN!');
    else if (result.injury.bleeding > 0) this.emitFloat(pos.x, pos.y, 'bleed', 'bleed');

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
    if (after && (after.isAlive === false || ('state' in after && after.state === 'Corpse'))) {
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
    }
    return { state: next, staminaCost: result.staminaCost };
  }

  /** Nearest living hostile mob adjacent to a pawn (for auto-engagement). */
  private nearestAdjacentHostile(pawn: Pawn, mobs: Mob[]): Mob | undefined {
    if (!pawn.position) return undefined;
    const px = pawn.position.x;
    const py = pawn.position.y;
    let best: Mob | undefined;
    let bestDist = Infinity;
    for (const m of mobs) {
      if (m.isAlive === false || m.state === 'Corpse') continue;
      const hostile = m.entityClass === 'mob' || m.state === 'Attacking' || m.state === 'Alerted';
      if (!hostile) continue;
      const d = Math.max(Math.abs(px - m.x), Math.abs(py - m.y));
      if (d <= 1 && d < bestDist) {
        best = m;
        bestDist = d;
      }
    }
    return best;
  }

  /** True while an entity is knocked down OR collapsed and cannot swing this tick. */
  private isKnockedDown(e: Pawn | Mob): boolean {
    const d = e.statusEffectDurations;
    return (d?.knockdown ?? 0) > 0 || (d?.collapse ?? 0) > 0;
  }

  /** True while an entity is winded (stamina bottomed out) — can't attack until stamina refills. */
  private isWinded(e: Pawn | Mob): boolean {
    return (e.statusEffectDurations?.winded ?? 0) > 0;
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

  /** Product of all active status-effect `dodge` modifiers (winded → 0.5 → easier to hit). */
  private effectDodgeMult(e: Pawn | Mob): number {
    let m = 1;
    for (const id of e.activeEffects ?? []) {
      const v = STATUS_EFFECTS_DB.find((s) => s.id === id)?.modifiers.dodge;
      if (v != null) m *= v;
    }
    return m;
  }

  /**
   * Per-tick stamina regen + winded latch for one entity. Drives the "fight until winded, then
   * pass turns until recovered" loop: regen the full `stamina_recovery_rate` while winded/resting
   * (throttled to a fraction while actively fighting so a melee actually depletes); on hitting 0
   * latch `winded`; clear it only once stamina is back to full. Persists through
   * `statusEffectDurations.winded` (so `syncActiveEffects` keeps it on pawns) and mirrors it into
   * `activeEffects` (mobs don't run that sync) so the moveSpeed/dodge modifiers apply.
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
      const rate = perTick(pawnStatService.evaluateStat('stamina_recovery_rate', e));
      const eff = winded || !this.isFighting(e) ? rate : rate * COMBAT_REGEN_FRACTION;
      stamina = Math.min(max, Math.max(0, postDrain) + eff);
    }
    if (winded && stamina >= max) winded = false;

    if (stamina === postDrain && winded === wasWinded) return e;

    const durations = { ...(e.statusEffectDurations ?? {}) };
    let activeEffects = e.activeEffects ?? [];
    if (winded) {
      durations.winded = 2; // refresh so the per-tick duration decrement never expires the latch
      if (!activeEffects.includes(WINDED)) activeEffects = [...activeEffects, WINDED];
    } else {
      delete durations.winded;
      if (activeEffects.includes(WINDED)) activeEffects = activeEffects.filter((x) => x !== WINDED);
    }
    return { ...e, stamina, statusEffectDurations: durations, activeEffects };
  }

  tickCombat(state: GameState, _dtMs: number): GameState {
    let next = state;
    // Track stamina mutations for attacking entities (id → new stamina value).
    const mobStaminaUpdates = new Map<string, number>();
    const pawnStaminaUpdates = new Map<string, number>();

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
        // Skip collapsed pawns — a downed pawn is no longer a target, so the
        // mob disengages rather than beating an unconscious body (spec: a
        // collapsed pawn is carried off or bleeds out, not auto-finished).
        target = state.pawns.find(
          (p) =>
            p.isAlive !== false &&
            p.currentState !== 'Collapsed' &&
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
            Math.abs(mob.x - m.x) <= 1 &&
            Math.abs(mob.y - m.y) <= 1
        );
      }
      if (!target) continue;

      const atk = this.performAttack(mob, target, next, state.turn);
      next = atk.state;
      mobStaminaUpdates.set(mob.id, Math.max(0, curStamina - atk.staminaCost));
    }

    // ── Pawn attacks (drafted order OR auto-engaged Fighting state) ───────
    for (const pawn of state.pawns) {
      if (pawn.isAlive === false || !pawn.position) continue;
      if (this.isKnockedDown(pawn)) continue;
      if (this.isWinded(pawn)) continue; // out of breath — pass turns until stamina recovers

      // Resolve the pawn's target: an explicit draft order, or — for an
      // undrafted pawn the FSM has put into Fighting — the nearest adjacent hostile.
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
        // defends itself — it swings at the nearest adjacent hostile instead of standing inert
        // when the player walks it up to an enemy. No adjacent hostile → nothing to do.
        target = this.nearestAdjacentHostile(pawn, mobs);
        if (!target) continue;
      } else if (pawn.currentState === 'Fighting') {
        target = this.nearestAdjacentHostile(pawn, mobs);
      } else if (pawn.currentState === 'Hunting' && pawn.huntTargetId) {
        // Work-driven hunt: swing at the marked quarry (a neutral animal isn't a
        // "hostile", so it must be targeted explicitly rather than via nearestAdjacentHostile).
        target = mobs.find((m) => m.id === pawn.huntTargetId && m.isAlive !== false);
      } else {
        continue;
      }
      if (!target) continue;

      const tpos = this.entityPos(target);
      if (Math.abs(pawn.position.x - tpos.x) > 1 || Math.abs(pawn.position.y - tpos.y) > 1)
        continue;

      // Attack cadence — scaled by attack_speed stat.
      const pawnAttackSpeed = Math.max(0.5, pawnStatService.evaluateStat('attack_speed', pawn));
      const pawnInterval = Math.max(
        MIN_ATTACK_INTERVAL_TICKS,
        Math.round(BASE_ATTACK_INTERVAL_TICKS / pawnAttackSpeed)
      );
      if (state.turn % pawnInterval !== 0) continue;

      const curStamina = pawn.stamina ?? pawn.maxStamina ?? 50;
      const atk = this.performAttack(pawn, target, next, state.turn);
      next = atk.state;
      pawnStaminaUpdates.set(pawn.id, Math.max(0, curStamina - atk.staminaCost));
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
