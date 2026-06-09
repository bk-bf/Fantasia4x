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
    LimbId
} from '../core/types';
import { itemService } from '../services/ItemService';
import { getCreatureById } from '../core/Creatures';
import { pawnStatService } from '../services/PawnStatService';
import { logCombatStart, logCombatTurn, logCombatEnd } from '../../stores/Log';

// ── Tuning constants ─────────────────────────────────────────────────────────
/** Scales per-part bleed so a fully-severed 5%-mass hand ≈ 2 blood/turn. */
const BLEED_CONSTANT = 40;
/** Wounds with bleedRate below this clot naturally each turn. */
const CLOT_FLOOR = 0.5;
/** Stats are on a ~5–22 scale; this divisor keeps damage in a sensible range. */
const STAT_SCALE = 10;
/** Mob base damage when it has no weapon. */
const MOB_BASE_DAMAGE = 5;
/** Base attack interval in ticks — scaled by attack_speed stat.
 *  60 TPS: 30 ticks = 0.5s = 2 attacks/sec (base).
 *  Fast attackers (DEX 20) get down to ~20 ticks = 0.33s = 3 attacks/sec.
 */
const BASE_ATTACK_INTERVAL_TICKS = 30;
/** Stamina drained per auto-attack. Shared by mobs; pawn attacks will use same constant. */
const ATTACK_STAMINA_COST = 2;
/** Stamina regenerated per tick when winded (no attack this tick). */
const WINDED_STAMINA_REGEN_PER_TICK = 0.05;

// ── Body-part definitions ────────────────────────────────────────────────────
interface BodyPartDef {
    id: BodyPartId;
    parentLimb: LimbId;
    maxHp: number;
    bleedRatio: number; // 0–1 share of total body mass
    hitWeight: number; // 0 = internal only; never selected by roll
    containedIn?: BodyPartId;
    isPaired: boolean;
    isVital: boolean;
}

const BODY_PART_DEFS: BodyPartDef[] = [
    // ── Head ──────────────────────────────────────────────────────────────────
    {
        id: 'skull',
        parentLimb: 'head',
        maxHp: 45,
        bleedRatio: 0.04,
        hitWeight: 8,
        isPaired: false,
        isVital: false
    },
    {
        id: 'jaw',
        parentLimb: 'head',
        maxHp: 25,
        bleedRatio: 0.02,
        hitWeight: 4,
        isPaired: false,
        isVital: false
    },
    {
        id: 'nose',
        parentLimb: 'head',
        maxHp: 15,
        bleedRatio: 0.01,
        hitWeight: 2,
        isPaired: false,
        isVital: false
    },
    {
        id: 'leftEye',
        parentLimb: 'head',
        maxHp: 10,
        bleedRatio: 0.01,
        hitWeight: 1,
        isPaired: true,
        isVital: false
    },
    {
        id: 'rightEye',
        parentLimb: 'head',
        maxHp: 10,
        bleedRatio: 0.01,
        hitWeight: 1,
        isPaired: true,
        isVital: false
    },
    {
        id: 'leftEar',
        parentLimb: 'head',
        maxHp: 10,
        bleedRatio: 0.005,
        hitWeight: 1,
        isPaired: true,
        isVital: false
    },
    {
        id: 'rightEar',
        parentLimb: 'head',
        maxHp: 10,
        bleedRatio: 0.005,
        hitWeight: 1,
        isPaired: true,
        isVital: false
    },
    {
        id: 'brain',
        parentLimb: 'head',
        maxHp: 30,
        bleedRatio: 0.05,
        hitWeight: 0,
        containedIn: 'skull',
        isPaired: false,
        isVital: true
    },
    // ── Torso ─────────────────────────────────────────────────────────────────
    {
        id: 'chest',
        parentLimb: 'torso',
        maxHp: 80,
        bleedRatio: 0.12,
        hitWeight: 25,
        isPaired: false,
        isVital: false
    },
    {
        id: 'abdomen',
        parentLimb: 'torso',
        maxHp: 70,
        bleedRatio: 0.1,
        hitWeight: 20,
        isPaired: false,
        isVital: false
    },
    {
        id: 'heart',
        parentLimb: 'torso',
        maxHp: 20,
        bleedRatio: 0.08,
        hitWeight: 0,
        containedIn: 'chest',
        isPaired: false,
        isVital: true
    },
    {
        id: 'leftLung',
        parentLimb: 'torso',
        maxHp: 30,
        bleedRatio: 0.06,
        hitWeight: 0,
        containedIn: 'chest',
        isPaired: true,
        isVital: false
    },
    {
        id: 'rightLung',
        parentLimb: 'torso',
        maxHp: 30,
        bleedRatio: 0.06,
        hitWeight: 0,
        containedIn: 'chest',
        isPaired: true,
        isVital: false
    },
    {
        id: 'liver',
        parentLimb: 'torso',
        maxHp: 25,
        bleedRatio: 0.05,
        hitWeight: 0,
        containedIn: 'abdomen',
        isPaired: false,
        isVital: false
    },
    {
        id: 'stomach',
        parentLimb: 'torso',
        maxHp: 20,
        bleedRatio: 0.03,
        hitWeight: 0,
        containedIn: 'abdomen',
        isPaired: false,
        isVital: false
    },
    {
        id: 'leftKidney',
        parentLimb: 'torso',
        maxHp: 15,
        bleedRatio: 0.02,
        hitWeight: 0,
        containedIn: 'abdomen',
        isPaired: true,
        isVital: false
    },
    {
        id: 'rightKidney',
        parentLimb: 'torso',
        maxHp: 15,
        bleedRatio: 0.02,
        hitWeight: 0,
        containedIn: 'abdomen',
        isPaired: true,
        isVital: false
    },
    {
        id: 'spine',
        parentLimb: 'torso',
        maxHp: 40,
        bleedRatio: 0.04,
        hitWeight: 0,
        containedIn: 'chest',
        isPaired: false,
        isVital: false
    },
    // ── Left arm ──────────────────────────────────────────────────────────────
    {
        id: 'leftShoulder',
        parentLimb: 'left_arm',
        maxHp: 40,
        bleedRatio: 0.03,
        hitWeight: 3,
        isPaired: true,
        isVital: false
    },
    {
        id: 'leftUpperArm',
        parentLimb: 'left_arm',
        maxHp: 45,
        bleedRatio: 0.05,
        hitWeight: 6,
        isPaired: true,
        isVital: false
    },
    {
        id: 'leftForearm',
        parentLimb: 'left_arm',
        maxHp: 35,
        bleedRatio: 0.04,
        hitWeight: 5,
        isPaired: true,
        isVital: false
    },
    {
        id: 'leftHand',
        parentLimb: 'left_arm',
        maxHp: 30,
        bleedRatio: 0.05,
        hitWeight: 3,
        isPaired: true,
        isVital: false
    },
    {
        id: 'leftThumb',
        parentLimb: 'left_arm',
        maxHp: 10,
        bleedRatio: 0.005,
        hitWeight: 1,
        containedIn: 'leftHand',
        isPaired: true,
        isVital: false
    },
    {
        id: 'leftIndexFinger',
        parentLimb: 'left_arm',
        maxHp: 8,
        bleedRatio: 0.003,
        hitWeight: 1,
        containedIn: 'leftHand',
        isPaired: true,
        isVital: false
    },
    {
        id: 'leftMiddleFinger',
        parentLimb: 'left_arm',
        maxHp: 8,
        bleedRatio: 0.003,
        hitWeight: 1,
        containedIn: 'leftHand',
        isPaired: true,
        isVital: false
    },
    {
        id: 'leftRingFinger',
        parentLimb: 'left_arm',
        maxHp: 8,
        bleedRatio: 0.003,
        hitWeight: 1,
        containedIn: 'leftHand',
        isPaired: true,
        isVital: false
    },
    {
        id: 'leftLittleFinger',
        parentLimb: 'left_arm',
        maxHp: 8,
        bleedRatio: 0.003,
        hitWeight: 1,
        containedIn: 'leftHand',
        isPaired: true,
        isVital: false
    },
    // ── Right arm ─────────────────────────────────────────────────────────────
    {
        id: 'rightShoulder',
        parentLimb: 'right_arm',
        maxHp: 40,
        bleedRatio: 0.03,
        hitWeight: 3,
        isPaired: true,
        isVital: false
    },
    {
        id: 'rightUpperArm',
        parentLimb: 'right_arm',
        maxHp: 45,
        bleedRatio: 0.05,
        hitWeight: 6,
        isPaired: true,
        isVital: false
    },
    {
        id: 'rightForearm',
        parentLimb: 'right_arm',
        maxHp: 35,
        bleedRatio: 0.04,
        hitWeight: 5,
        isPaired: true,
        isVital: false
    },
    {
        id: 'rightHand',
        parentLimb: 'right_arm',
        maxHp: 30,
        bleedRatio: 0.05,
        hitWeight: 3,
        isPaired: true,
        isVital: false
    },
    {
        id: 'rightThumb',
        parentLimb: 'right_arm',
        maxHp: 10,
        bleedRatio: 0.005,
        hitWeight: 1,
        containedIn: 'rightHand',
        isPaired: true,
        isVital: false
    },
    {
        id: 'rightIndexFinger',
        parentLimb: 'right_arm',
        maxHp: 8,
        bleedRatio: 0.003,
        hitWeight: 1,
        containedIn: 'rightHand',
        isPaired: true,
        isVital: false
    },
    {
        id: 'rightMiddleFinger',
        parentLimb: 'right_arm',
        maxHp: 8,
        bleedRatio: 0.003,
        hitWeight: 1,
        containedIn: 'rightHand',
        isPaired: true,
        isVital: false
    },
    {
        id: 'rightRingFinger',
        parentLimb: 'right_arm',
        maxHp: 8,
        bleedRatio: 0.003,
        hitWeight: 1,
        containedIn: 'rightHand',
        isPaired: true,
        isVital: false
    },
    {
        id: 'rightLittleFinger',
        parentLimb: 'right_arm',
        maxHp: 8,
        bleedRatio: 0.003,
        hitWeight: 1,
        containedIn: 'rightHand',
        isPaired: true,
        isVital: false
    },
    // ── Left leg ──────────────────────────────────────────────────────────────
    {
        id: 'leftHip',
        parentLimb: 'left_leg',
        maxHp: 50,
        bleedRatio: 0.04,
        hitWeight: 3,
        isPaired: true,
        isVital: false
    },
    {
        id: 'leftUpperLeg',
        parentLimb: 'left_leg',
        maxHp: 60,
        bleedRatio: 0.08,
        hitWeight: 8,
        isPaired: true,
        isVital: false
    },
    {
        id: 'leftLowerLeg',
        parentLimb: 'left_leg',
        maxHp: 50,
        bleedRatio: 0.06,
        hitWeight: 6,
        isPaired: true,
        isVital: false
    },
    {
        id: 'leftFoot',
        parentLimb: 'left_leg',
        maxHp: 30,
        bleedRatio: 0.04,
        hitWeight: 3,
        isPaired: true,
        isVital: false
    },
    {
        id: 'leftBigToe',
        parentLimb: 'left_leg',
        maxHp: 8,
        bleedRatio: 0.003,
        hitWeight: 0.5,
        containedIn: 'leftFoot',
        isPaired: true,
        isVital: false
    },
    {
        id: 'leftSecondToe',
        parentLimb: 'left_leg',
        maxHp: 6,
        bleedRatio: 0.002,
        hitWeight: 0.5,
        containedIn: 'leftFoot',
        isPaired: true,
        isVital: false
    },
    {
        id: 'leftMiddleToe',
        parentLimb: 'left_leg',
        maxHp: 6,
        bleedRatio: 0.002,
        hitWeight: 0.5,
        containedIn: 'leftFoot',
        isPaired: true,
        isVital: false
    },
    {
        id: 'leftFourthToe',
        parentLimb: 'left_leg',
        maxHp: 6,
        bleedRatio: 0.002,
        hitWeight: 0.5,
        containedIn: 'leftFoot',
        isPaired: true,
        isVital: false
    },
    {
        id: 'leftLittleToe',
        parentLimb: 'left_leg',
        maxHp: 6,
        bleedRatio: 0.002,
        hitWeight: 0.5,
        containedIn: 'leftFoot',
        isPaired: true,
        isVital: false
    },
    // ── Right leg ─────────────────────────────────────────────────────────────
    {
        id: 'rightHip',
        parentLimb: 'right_leg',
        maxHp: 50,
        bleedRatio: 0.04,
        hitWeight: 3,
        isPaired: true,
        isVital: false
    },
    {
        id: 'rightUpperLeg',
        parentLimb: 'right_leg',
        maxHp: 60,
        bleedRatio: 0.08,
        hitWeight: 8,
        isPaired: true,
        isVital: false
    },
    {
        id: 'rightLowerLeg',
        parentLimb: 'right_leg',
        maxHp: 50,
        bleedRatio: 0.06,
        hitWeight: 6,
        isPaired: true,
        isVital: false
    },
    {
        id: 'rightFoot',
        parentLimb: 'right_leg',
        maxHp: 30,
        bleedRatio: 0.04,
        hitWeight: 3,
        isPaired: true,
        isVital: false
    },
    {
        id: 'rightBigToe',
        parentLimb: 'right_leg',
        maxHp: 8,
        bleedRatio: 0.003,
        hitWeight: 0.5,
        containedIn: 'rightFoot',
        isPaired: true,
        isVital: false
    },
    {
        id: 'rightSecondToe',
        parentLimb: 'right_leg',
        maxHp: 6,
        bleedRatio: 0.002,
        hitWeight: 0.5,
        containedIn: 'rightFoot',
        isPaired: true,
        isVital: false
    },
    {
        id: 'rightMiddleToe',
        parentLimb: 'right_leg',
        maxHp: 6,
        bleedRatio: 0.002,
        hitWeight: 0.5,
        containedIn: 'rightFoot',
        isPaired: true,
        isVital: false
    },
    {
        id: 'rightFourthToe',
        parentLimb: 'right_leg',
        maxHp: 6,
        bleedRatio: 0.002,
        hitWeight: 0.5,
        containedIn: 'rightFoot',
        isPaired: true,
        isVital: false
    },
    {
        id: 'rightLittleToe',
        parentLimb: 'right_leg',
        maxHp: 6,
        bleedRatio: 0.002,
        hitWeight: 0.5,
        containedIn: 'rightFoot',
        isPaired: true,
        isVital: false
    }
];

const PART_DEF_MAP: Partial<Record<BodyPartId, BodyPartDef>> = Object.fromEntries(
    BODY_PART_DEFS.map((d) => [d.id, d])
);

/** Only outer parts (hitWeight > 0) are selected by random roll. */
const OUTER_PARTS = BODY_PART_DEFS.filter((d) => d.hitWeight > 0);
const TOTAL_HIT_WEIGHT = OUTER_PARTS.reduce((s, d) => s + d.hitWeight, 0);

/** Build the default full body-part tree for a given root limb.
 *  Used when spawning pawns / mobs so every entity carries the complete anatomy. */
export function createDefaultBodyParts(limbId: LimbId): import('../core/types').BodyPartState[] {
    return BODY_PART_DEFS.filter((d) => d.parentLimb === limbId).map((d) => ({
        id: d.id,
        health: d.maxHp,
        maxHp: d.maxHp,
        isMissing: false,
        injuries: []
    }));
}

// ── Public types ─────────────────────────────────────────────────────────────
export interface HitResult {
    hit: boolean;
    bodyPart: BodyPartId | null;
    /** Final damage after armour reduction. */
    damage: number;
    injury: Injury | null;
    knockdown: boolean;
}

export interface CombatService {
    /**
     * Advance all active combats one tick (mob-vs-pawn, mob-vs-mob, pawn-vs-mob).
     * Called from GameEngineImpl after Entity Step (Phase C wiring).
     */
    tickCombat(state: GameState, dtMs: number): GameState;
    /** Pure hit resolution: roll to-hit, pick body part, compute damage & injury. */
    resolveHit(attacker: Pawn | Mob, defender: Pawn | Mob, state: GameState): HitResult;
    /** Apply an already-resolved Injury to a pawn, updating limb tree + conditions. */
    applyInjury(pawnId: string, injury: Injury, state: GameState): GameState;
    /** Apply an already-resolved Injury to a mob, updating limb tree + conditions. */
    applyInjuryToMob(mobId: string, injury: Injury, state: GameState): GameState;
    /** Deferred — stub; wired by MAGIC-SKILLS spec. */
    triggerSkill(skillId: string, casterId: string, targetId: string, state: GameState): GameState;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
}

function rollBodyPart(): BodyPartId {
    let r = Math.random() * TOTAL_HIT_WEIGHT;
    for (const part of OUTER_PARTS) {
        r -= part.hitWeight;
        if (r <= 0) return part.id;
    }
    return OUTER_PARTS[OUTER_PARTS.length - 1].id;
}

function bleedModForType(t: DamageType): number {
    return t === 'cutting' ? 1.0 : t === 'piercing' ? 0.5 : 0.0;
}

function injuryTypeFor(t: DamageType): Injury['type'] {
    return t === 'cutting' ? 'cut' : t === 'piercing' ? 'puncture' : 'crush';
}

function injurySeverity(hpMissingFrac: number): Injury['severity'] {
    if (hpMissingFrac >= 1.0) return 'destroyed';
    if (hpMissingFrac >= 0.7) return 'critical';
    if (hpMissingFrac >= 0.4) return 'serious';
    return 'minor';
}

function painFromSeverity(severity: Injury['severity'], isVital: boolean): number {
    const base =
        severity === 'destroyed' ? 30 : severity === 'critical' ? 20 : severity === 'serious' ? 10 : 4;
    return isVital ? base * 2 : base;
}

/** Return attacker's effective combat stats. Mobs check naturalWeapons from their creature def;
 *  pawns check their equipped weapon. Both fall back to unarmed/blunt. */
function attackerProfile(attacker: Pawn | Mob): {
    str: number;
    dex: number;
    baseDamage: number;
    accuracy: number;
    damageType: DamageType;
    bluntMod: number;
    armorPen: number;
} {
    const str = attacker.stats.strength;
    const dex = attacker.stats.dexterity;

    // Pawn with equipped weapon
    if ('equipment' in attacker && attacker.equipment?.weapon) {
        const wp = itemService.getItemById(attacker.equipment.weapon.itemId)?.weaponProperties;
        if (wp) {
            return {
                str,
                dex,
                baseDamage: wp.baseDamage ?? wp.damage,
                accuracy: wp.accuracy ?? 0,
                damageType: wp.damageType ?? 'blunt',
                bluntMod: wp.bluntMod ?? (wp.damageType === 'blunt' ? 1.0 : 0),
                armorPen: wp.armorPenetration ?? 0
            };
        }
    }

    // Mob — pick a natural weapon at random (variety per-swing)
    if ('creatureId' in attacker) {
        const def = getCreatureById(attacker.creatureId);
        if (def?.naturalWeapons && def.naturalWeapons.length > 0) {
            const w = def.naturalWeapons[Math.floor(Math.random() * def.naturalWeapons.length)];
            return {
                str,
                dex,
                baseDamage: w.baseDamage,
                accuracy: 0,
                damageType: w.damageType,
                bluntMod: w.bluntMod ?? (w.damageType === 'blunt' ? 1.0 : 0),
                armorPen: 0
            };
        }
    }

    // Unarmed fallback (fists / body-slam)
    return {
        str,
        dex,
        baseDamage: MOB_BASE_DAMAGE,
        accuracy: 0,
        damageType: 'blunt',
        bluntMod: 1.0,
        armorPen: 0
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
    if (!('equipment' in defender) || !defender.equipment?.armor) return 0;
    const ap = itemService.getItemById(defender.equipment.armor.itemId)?.armorProperties;
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
        const { str, dex, baseDamage, accuracy, damageType, bluntMod, armorPen } =
            attackerProfile(attacker);
        const defDex = defender.stats.dexterity;

        const hitChance = clamp(dex * 3 + accuracy - defDex * 2, 5, 95);
        if (Math.random() * 100 > hitChance) {
            return { hit: false, bodyPart: null, damage: 0, injury: null, knockdown: false };
        }

        const partId = rollBodyPart();
        const partDef = PART_DEF_MAP[partId]!;

        // Damage: baseDamage × str / STAT_SCALE, then armour reduces it.
        // STAT_SCALE=10 matches the real stat range (5–22) rather than the spec's
        // illustrative 0–100 scale.
        const raw = (baseDamage * str) / STAT_SCALE;
        const armorRed = partArmorReduction(defender, partId, armorPen);
        const physRes = physicalResistance(defender, damageType);
        const final = Math.round(raw * (1 - armorRed) * (1 - physRes));

        const prevHealth = currentPartHealth(defender, partId, partDef.maxHp);
        const newHealth = Math.max(0, prevHealth - final);
        const hpMissing = (partDef.maxHp - newHealth) / partDef.maxHp;

        const bMod = bleedModForType(damageType);
        const bleeding = Math.round(partDef.bleedRatio * BLEED_CONSTANT * bMod * hpMissing * 100) / 100;
        const severity = injurySeverity(hpMissing);
        const pain = painFromSeverity(severity, partDef.isVital);

        const injury: Injury = {
            bodyPart: partId,
            type: injuryTypeFor(damageType),
            severity,
            damage: final,
            bleeding,
            painContribution: pain,
            infected: false
        };

        // Knockdown: blunt/crush hits roll chance based on damage vs constitution
        const defCon = defender.stats.constitution ?? 10;
        const knockChance = damageType === 'blunt' ? clamp((final - defCon / 4) * bluntMod, 0, 100) : 0;
        const knockdown = knockChance > 0 && Math.random() * 100 < knockChance;

        return { hit: true, bodyPart: partId, damage: final, injury, knockdown };
    }

    private _applyInjuryToEntity<T extends Pawn | Mob>(
        entity: T,
        injury: Injury,
        state: GameState,
        entityType: 'pawn' | 'mob'
    ): GameState {
        const partDef = PART_DEF_MAP[injury.bodyPart];
        if (!partDef) return state;

        // ── Update limb tree ─────────────────────────────────────────────────
        const limbs: LimbState[] = (entity.limbs ?? []).map((limb) => {
            if (limb.id !== partDef.parentLimb) return limb;

            const existing: BodyPartState[] = limb.parts ?? [];
            const idx = existing.findIndex((p) => p.id === injury.bodyPart);

            let newParts: BodyPartState[];
            if (idx >= 0) {
                const prev = existing[idx];
                const newHp = Math.max(0, prev.health - injury.damage);
                newParts = [...existing];
                newParts[idx] = {
                    ...prev,
                    health: newHp,
                    isMissing: prev.isMissing || injury.severity === 'destroyed',
                    injuries: [...prev.injuries, injury]
                };
            } else {
                // First hit on this fine part — seed health from partDef.maxHp
                const newHp: number = Math.max(0, partDef.maxHp - injury.damage);
                newParts = [
                    ...existing,
                    {
                        id: injury.bodyPart,
                        health: newHp,
                        maxHp: partDef.maxHp,
                        isMissing: injury.severity === 'destroyed',
                        injuries: [injury]
                    }
                ];
            }

            // Aggregate bleed from all fine-part injuries to the root limb's bleedRate
            const totalBleed = newParts.reduce(
                (sum, p) => sum + p.injuries.reduce((s, inj) => s + inj.bleeding, 0),
                0
            );

            return { ...limb, bleedRate: Math.max(limb.bleedRate, totalBleed) };
        });

        // ── Update entity-level fields ─────────────────────────────────────────
        const newPain = clamp((entity.pain ?? 0) + injury.painContribution, 0, 100);
        const newInjuries: Injury[] = [...(entity.injuries ?? []), injury];

        // blood_loss severity derived from current bloodVolume
        const maxBV = entity.maxBloodVolume ?? 100;
        const bloodLossSev = clamp(1 - (entity.bloodVolume ?? maxBV) / maxBV, 0, 1);
        const newConditions = upsertCondition(entity.conditions ?? [], 'blood_loss', bloodLossSev);

        // Pain collapse → knockdown 3 turns
        const newKnockdown =
            newPain >= 80 ? Math.max(entity.knockdown ?? 0, 3) : (entity.knockdown ?? 0);

        const updated = {
            ...entity,
            limbs,
            injuries: newInjuries,
            pain: newPain,
            knockdown: newKnockdown,
            conditions: newConditions
        };

        // Vital part destroyed → permadeath
        if (partDef.isVital && injury.severity === 'destroyed') {
            if (entityType === 'pawn') {
                (updated as Pawn).isAlive = false;
                (updated as Pawn).currentState = 'Dead';
            } else {
                (updated as Mob).isAlive = false;
                (updated as Mob).state = 'Corpse';
                (updated as Mob).diedAt = state.turn;
            }
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

    applyInjury(pawnId: string, injury: Injury, state: GameState): GameState {
        const pawn = state.pawns.find((p) => p.id === pawnId);
        if (!pawn) return state;
        return this._applyInjuryToEntity(pawn, injury, state, 'pawn');
    }

    applyInjuryToMob(mobId: string, injury: Injury, state: GameState): GameState {
        const mob = state.mobs?.find((m) => m.id === mobId);
        if (!mob) return state;
        return this._applyInjuryToEntity(mob, injury, state, 'mob');
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
            const attackSpeed = Math.max(0.5, pawnStatService.evaluateStat('attack_speed', mob));
            const interval = Math.max(18, Math.round(BASE_ATTACK_INTERVAL_TICKS / attackSpeed));
            if ((state.turn - mob.stateSince) % interval !== 0) continue;

            const curStamina = mob.stamina ?? mob.maxStamina ?? 50;
            if (curStamina <= 0) {
                mobStaminaUpdates.set(
                    mob.id,
                    Math.min(curStamina + WINDED_STAMINA_REGEN_PER_TICK, mob.maxStamina ?? 50)
                );
                continue;
            }

            // Determine target: huntTargetId mob first, then nearest pawn, then nearest mob
            let target: Pawn | Mob | undefined;
            if (mob.huntTargetId) {
                target = mobs.find((m) => m.id === mob.huntTargetId && m.isAlive !== false);
            }
            if (!target) {
                target = state.pawns.find(
                    (p) =>
                        p.isAlive !== false &&
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

            const result = this.resolveHit(mob, target, next);
            if (!result.hit || !result.injury) continue;

            if ('entityClass' in target) {
                next = this.applyInjuryToMob(target.id, result.injury, next);
            } else {
                next = this.applyInjury(target.id, result.injury, next);
            }

            mobStaminaUpdates.set(mob.id, Math.max(0, curStamina - ATTACK_STAMINA_COST));

            // Log combat turn
            const mobDef = getCreatureById(mob.creatureId);
            const attackerName = mobDef ? `${mobDef.name} #${mob.debugId ?? mob.id.slice(-4)}` : mob.id;
            const targetName = 'entityClass' in target
                ? (getCreatureById((target as Mob).creatureId)?.name ?? (target as Mob).id)
                : (target as Pawn).name;
            logCombatTurn(mob.id, attackerName, target.id, targetName, state.turn, true, result.injury.damage, result.injury.bodyPart, result.knockdown);

            // Check if target died this hit
            const targetAfter = 'entityClass' in target
                ? next.mobs?.find((m) => m.id === target.id)
                : next.pawns.find((p) => p.id === target.id);
            if (targetAfter && (targetAfter.isAlive === false || ('state' in targetAfter && targetAfter.state === 'Corpse'))) {
                logCombatEnd(mob.id, target.id, `${targetName} was killed`, state.turn);
            }

            if (result.knockdown) {
                const turns = Math.floor(Math.random() * 3) + 1;
                if ('entityClass' in target) {
                    next = {
                        ...next,
                        mobs: next.mobs!.map((m) =>
                            m.id === target.id ? { ...m, knockdown: Math.max(m.knockdown ?? 0, turns) } : m
                        )
                    };
                } else {
                    next = {
                        ...next,
                        pawns: next.pawns.map((p) =>
                            p.id === target.id ? { ...p, knockdown: Math.max(p.knockdown ?? 0, turns) } : p
                        )
                    };
                }
            }
        }

        // ── Drafted pawn attacks ─────────────────────────────────────────────
        for (const pawn of state.pawns) {
            if (
                pawn.isAlive === false ||
                !pawn.drafted ||
                !pawn.draftTarget ||
                pawn.draftTarget.type !== 'attack'
            )
                continue;
            if (!pawn.position) continue;

            const dt = pawn.draftTarget;
            let target: Pawn | Mob | undefined;
            if (dt.targetType === 'mob') {
                target = mobs.find((m) => m.id === dt.targetId && m.isAlive !== false);
            } else {
                target = state.pawns.find((p) => p.id === dt.targetId && p.isAlive !== false);
            }
            if (!target) {
                // Target dead — clear draft order
                next = {
                    ...next,
                    pawns: next.pawns.map((p) => (p.id === pawn.id ? { ...p, draftTarget: undefined } : p))
                };
                continue;
            }

            const tx = 'entityClass' in target ? target.x : (target.position?.x ?? -1);
            const ty = 'entityClass' in target ? target.y : (target.position?.y ?? -1);
            if (Math.abs(pawn.position.x - tx) > 1 || Math.abs(pawn.position.y - ty) > 1) continue;

            // Attack cadence for drafted pawns — scaled by attack_speed stat.
            const pawnAttackSpeed = Math.max(0.5, pawnStatService.evaluateStat('attack_speed', pawn));
            const pawnInterval = Math.max(18, Math.round(BASE_ATTACK_INTERVAL_TICKS / pawnAttackSpeed));
            if (state.turn % pawnInterval !== 0) continue;

            const curStamina = pawn.stamina ?? pawn.maxStamina ?? 50;
            if (curStamina <= 0) {
                pawnStaminaUpdates.set(
                    pawn.id,
                    Math.min(curStamina + WINDED_STAMINA_REGEN_PER_TICK, pawn.maxStamina ?? 50)
                );
                continue;
            }

            const result = this.resolveHit(pawn, target, next);
            if (!result.hit || !result.injury) continue;

            if ('entityClass' in target) {
                next = this.applyInjuryToMob(target.id, result.injury, next);
            } else {
                next = this.applyInjury(target.id, result.injury, next);
            }

            pawnStaminaUpdates.set(pawn.id, Math.max(0, curStamina - ATTACK_STAMINA_COST));

            // Log combat turn
            const targetName = 'entityClass' in target
                ? (getCreatureById((target as Mob).creatureId)?.name ?? (target as Mob).id)
                : (target as Pawn).name;
            logCombatTurn(pawn.id, pawn.name, target.id, targetName, state.turn, true, result.injury.damage, result.injury.bodyPart, result.knockdown);

            // Check if target died this hit
            const targetAfter = 'entityClass' in target
                ? next.mobs?.find((m) => m.id === target.id)
                : next.pawns.find((p) => p.id === target.id);
            if (targetAfter && (targetAfter.isAlive === false || ('state' in targetAfter && targetAfter.state === 'Corpse'))) {
                logCombatEnd(pawn.id, target.id, `${targetName} was killed`, state.turn);
            }

            if (result.knockdown) {
                const turns = Math.floor(Math.random() * 3) + 1;
                if ('entityClass' in target) {
                    next = {
                        ...next,
                        mobs: next.mobs!.map((m) =>
                            m.id === target.id ? { ...m, knockdown: Math.max(m.knockdown ?? 0, turns) } : m
                        )
                    };
                } else {
                    next = {
                        ...next,
                        pawns: next.pawns.map((p) =>
                            p.id === target.id ? { ...p, knockdown: Math.max(p.knockdown ?? 0, turns) } : p
                        )
                    };
                }
            }
        }

        // Apply stamina mutations in one pass
        if (mobStaminaUpdates.size > 0) {
            next = {
                ...next,
                mobs: next.mobs!.map((m) =>
                    mobStaminaUpdates.has(m.id) ? { ...m, stamina: mobStaminaUpdates.get(m.id)! } : m
                )
            };
        }
        if (pawnStaminaUpdates.size > 0) {
            next = {
                ...next,
                pawns: next.pawns.map((p) =>
                    pawnStaminaUpdates.has(p.id) ? { ...p, stamina: pawnStaminaUpdates.get(p.id)! } : p
                )
            };
        }

        return next;
    }

    /** Deferred — stub; wired by MAGIC-SKILLS spec. */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

/** Export the body-part definitions so Phase D UI and tests can access them. */
export { PART_DEF_MAP, BLEED_CONSTANT, CLOT_FLOOR };
export type { BodyPartDef };
