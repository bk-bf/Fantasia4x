// src/lib/game/systems/Combat.ts
import type {
    GameState, Pawn, Mob, Injury, LimbState, BodyPartState, EntityCondition,
    BodyPartId, DamageType, LimbId,
} from '../core/types';
import { itemService } from '../services/ItemService';
import { getCreatureById } from '../core/Creatures';

// ── Tuning constants ─────────────────────────────────────────────────────────
/** Scales per-part bleed so a fully-severed 5%-mass hand ≈ 2 blood/turn. */
const BLEED_CONSTANT = 40;
/** Wounds with bleedRate below this clot naturally each turn. */
const CLOT_FLOOR = 0.5;
/** Stats are on a ~5–22 scale; this divisor keeps damage in a sensible range. */
const STAT_SCALE = 10;
/** Mob base damage when it has no weapon. */
const MOB_BASE_DAMAGE = 5;
/** Mobs in Attacking state fire once per this many ticks. */
const ATTACK_INTERVAL_TICKS = 10;
/** Stamina drained per auto-attack. Shared by mobs; pawn attacks will use same constant. */
const ATTACK_STAMINA_COST = 2;
/** Stamina regenerated per tick when winded (no attack this tick). */
const WINDED_STAMINA_REGEN_PER_TICK = 0.05;

// ── Body-part definitions ────────────────────────────────────────────────────
interface BodyPartDef {
    id: BodyPartId;
    parentLimb: LimbId;
    maxHp: number;
    bleedRatio: number;   // 0–1 share of total body mass
    hitWeight: number;    // 0 = internal only; never selected by roll
    containedIn?: BodyPartId;
    isPaired: boolean;
    isVital: boolean;
}

const BODY_PART_DEFS: BodyPartDef[] = [
    // ── Head ──────────────────────────────────────────────────────────────────
    { id: 'skull', parentLimb: 'head', maxHp: 45, bleedRatio: 0.040, hitWeight: 8, isPaired: false, isVital: false },
    { id: 'jaw', parentLimb: 'head', maxHp: 25, bleedRatio: 0.020, hitWeight: 4, isPaired: false, isVital: false },
    { id: 'nose', parentLimb: 'head', maxHp: 15, bleedRatio: 0.010, hitWeight: 2, isPaired: false, isVital: false },
    { id: 'leftEye', parentLimb: 'head', maxHp: 10, bleedRatio: 0.010, hitWeight: 1, isPaired: true, isVital: false },
    { id: 'rightEye', parentLimb: 'head', maxHp: 10, bleedRatio: 0.010, hitWeight: 1, isPaired: true, isVital: false },
    { id: 'leftEar', parentLimb: 'head', maxHp: 10, bleedRatio: 0.005, hitWeight: 1, isPaired: true, isVital: false },
    { id: 'rightEar', parentLimb: 'head', maxHp: 10, bleedRatio: 0.005, hitWeight: 1, isPaired: true, isVital: false },
    { id: 'brain', parentLimb: 'head', maxHp: 30, bleedRatio: 0.050, hitWeight: 0, containedIn: 'skull', isPaired: false, isVital: true },
    // ── Torso ─────────────────────────────────────────────────────────────────
    { id: 'chest', parentLimb: 'torso', maxHp: 80, bleedRatio: 0.120, hitWeight: 25, isPaired: false, isVital: false },
    { id: 'abdomen', parentLimb: 'torso', maxHp: 70, bleedRatio: 0.100, hitWeight: 20, isPaired: false, isVital: false },
    { id: 'heart', parentLimb: 'torso', maxHp: 20, bleedRatio: 0.080, hitWeight: 0, containedIn: 'chest', isPaired: false, isVital: true },
    { id: 'leftLung', parentLimb: 'torso', maxHp: 30, bleedRatio: 0.060, hitWeight: 0, containedIn: 'chest', isPaired: true, isVital: false },
    { id: 'rightLung', parentLimb: 'torso', maxHp: 30, bleedRatio: 0.060, hitWeight: 0, containedIn: 'chest', isPaired: true, isVital: false },
    { id: 'liver', parentLimb: 'torso', maxHp: 25, bleedRatio: 0.050, hitWeight: 0, containedIn: 'abdomen', isPaired: false, isVital: false },
    { id: 'stomach', parentLimb: 'torso', maxHp: 20, bleedRatio: 0.030, hitWeight: 0, containedIn: 'abdomen', isPaired: false, isVital: false },
    { id: 'leftKidney', parentLimb: 'torso', maxHp: 15, bleedRatio: 0.020, hitWeight: 0, containedIn: 'abdomen', isPaired: true, isVital: false },
    { id: 'rightKidney', parentLimb: 'torso', maxHp: 15, bleedRatio: 0.020, hitWeight: 0, containedIn: 'abdomen', isPaired: true, isVital: false },
    { id: 'spine', parentLimb: 'torso', maxHp: 40, bleedRatio: 0.040, hitWeight: 0, containedIn: 'chest', isPaired: false, isVital: false },
    // ── Left arm ──────────────────────────────────────────────────────────────
    { id: 'leftShoulder', parentLimb: 'left_arm', maxHp: 40, bleedRatio: 0.030, hitWeight: 3, isPaired: true, isVital: false },
    { id: 'leftUpperArm', parentLimb: 'left_arm', maxHp: 45, bleedRatio: 0.050, hitWeight: 6, isPaired: true, isVital: false },
    { id: 'leftForearm', parentLimb: 'left_arm', maxHp: 35, bleedRatio: 0.040, hitWeight: 5, isPaired: true, isVital: false },
    { id: 'leftHand', parentLimb: 'left_arm', maxHp: 30, bleedRatio: 0.050, hitWeight: 3, isPaired: true, isVital: false },
    { id: 'leftThumb', parentLimb: 'left_arm', maxHp: 10, bleedRatio: 0.005, hitWeight: 1, containedIn: 'leftHand', isPaired: true, isVital: false },
    { id: 'leftIndexFinger', parentLimb: 'left_arm', maxHp: 8, bleedRatio: 0.003, hitWeight: 1, containedIn: 'leftHand', isPaired: true, isVital: false },
    { id: 'leftMiddleFinger', parentLimb: 'left_arm', maxHp: 8, bleedRatio: 0.003, hitWeight: 1, containedIn: 'leftHand', isPaired: true, isVital: false },
    { id: 'leftRingFinger', parentLimb: 'left_arm', maxHp: 8, bleedRatio: 0.003, hitWeight: 1, containedIn: 'leftHand', isPaired: true, isVital: false },
    { id: 'leftLittleFinger', parentLimb: 'left_arm', maxHp: 8, bleedRatio: 0.003, hitWeight: 1, containedIn: 'leftHand', isPaired: true, isVital: false },
    // ── Right arm ─────────────────────────────────────────────────────────────
    { id: 'rightShoulder', parentLimb: 'right_arm', maxHp: 40, bleedRatio: 0.030, hitWeight: 3, isPaired: true, isVital: false },
    { id: 'rightUpperArm', parentLimb: 'right_arm', maxHp: 45, bleedRatio: 0.050, hitWeight: 6, isPaired: true, isVital: false },
    { id: 'rightForearm', parentLimb: 'right_arm', maxHp: 35, bleedRatio: 0.040, hitWeight: 5, isPaired: true, isVital: false },
    { id: 'rightHand', parentLimb: 'right_arm', maxHp: 30, bleedRatio: 0.050, hitWeight: 3, isPaired: true, isVital: false },
    { id: 'rightThumb', parentLimb: 'right_arm', maxHp: 10, bleedRatio: 0.005, hitWeight: 1, containedIn: 'rightHand', isPaired: true, isVital: false },
    { id: 'rightIndexFinger', parentLimb: 'right_arm', maxHp: 8, bleedRatio: 0.003, hitWeight: 1, containedIn: 'rightHand', isPaired: true, isVital: false },
    { id: 'rightMiddleFinger', parentLimb: 'right_arm', maxHp: 8, bleedRatio: 0.003, hitWeight: 1, containedIn: 'rightHand', isPaired: true, isVital: false },
    { id: 'rightRingFinger', parentLimb: 'right_arm', maxHp: 8, bleedRatio: 0.003, hitWeight: 1, containedIn: 'rightHand', isPaired: true, isVital: false },
    { id: 'rightLittleFinger', parentLimb: 'right_arm', maxHp: 8, bleedRatio: 0.003, hitWeight: 1, containedIn: 'rightHand', isPaired: true, isVital: false },
    // ── Left leg ──────────────────────────────────────────────────────────────
    { id: 'leftHip', parentLimb: 'left_leg', maxHp: 50, bleedRatio: 0.040, hitWeight: 3, isPaired: true, isVital: false },
    { id: 'leftUpperLeg', parentLimb: 'left_leg', maxHp: 60, bleedRatio: 0.080, hitWeight: 8, isPaired: true, isVital: false },
    { id: 'leftLowerLeg', parentLimb: 'left_leg', maxHp: 50, bleedRatio: 0.060, hitWeight: 6, isPaired: true, isVital: false },
    { id: 'leftFoot', parentLimb: 'left_leg', maxHp: 30, bleedRatio: 0.040, hitWeight: 3, isPaired: true, isVital: false },
    { id: 'leftBigToe', parentLimb: 'left_leg', maxHp: 8, bleedRatio: 0.003, hitWeight: 0.5, containedIn: 'leftFoot', isPaired: true, isVital: false },
    { id: 'leftSecondToe', parentLimb: 'left_leg', maxHp: 6, bleedRatio: 0.002, hitWeight: 0.5, containedIn: 'leftFoot', isPaired: true, isVital: false },
    { id: 'leftMiddleToe', parentLimb: 'left_leg', maxHp: 6, bleedRatio: 0.002, hitWeight: 0.5, containedIn: 'leftFoot', isPaired: true, isVital: false },
    { id: 'leftFourthToe', parentLimb: 'left_leg', maxHp: 6, bleedRatio: 0.002, hitWeight: 0.5, containedIn: 'leftFoot', isPaired: true, isVital: false },
    { id: 'leftLittleToe', parentLimb: 'left_leg', maxHp: 6, bleedRatio: 0.002, hitWeight: 0.5, containedIn: 'leftFoot', isPaired: true, isVital: false },
    // ── Right leg ─────────────────────────────────────────────────────────────
    { id: 'rightHip', parentLimb: 'right_leg', maxHp: 50, bleedRatio: 0.040, hitWeight: 3, isPaired: true, isVital: false },
    { id: 'rightUpperLeg', parentLimb: 'right_leg', maxHp: 60, bleedRatio: 0.080, hitWeight: 8, isPaired: true, isVital: false },
    { id: 'rightLowerLeg', parentLimb: 'right_leg', maxHp: 50, bleedRatio: 0.060, hitWeight: 6, isPaired: true, isVital: false },
    { id: 'rightFoot', parentLimb: 'right_leg', maxHp: 30, bleedRatio: 0.040, hitWeight: 3, isPaired: true, isVital: false },
    { id: 'rightBigToe', parentLimb: 'right_leg', maxHp: 8, bleedRatio: 0.003, hitWeight: 0.5, containedIn: 'rightFoot', isPaired: true, isVital: false },
    { id: 'rightSecondToe', parentLimb: 'right_leg', maxHp: 6, bleedRatio: 0.002, hitWeight: 0.5, containedIn: 'rightFoot', isPaired: true, isVital: false },
    { id: 'rightMiddleToe', parentLimb: 'right_leg', maxHp: 6, bleedRatio: 0.002, hitWeight: 0.5, containedIn: 'rightFoot', isPaired: true, isVital: false },
    { id: 'rightFourthToe', parentLimb: 'right_leg', maxHp: 6, bleedRatio: 0.002, hitWeight: 0.5, containedIn: 'rightFoot', isPaired: true, isVital: false },
    { id: 'rightLittleToe', parentLimb: 'right_leg', maxHp: 6, bleedRatio: 0.002, hitWeight: 0.5, containedIn: 'rightFoot', isPaired: true, isVital: false },
];

const PART_DEF_MAP: Partial<Record<BodyPartId, BodyPartDef>> =
    Object.fromEntries(BODY_PART_DEFS.map(d => [d.id, d]));

/** Only outer parts (hitWeight > 0) are selected by random roll. */
const OUTER_PARTS = BODY_PART_DEFS.filter(d => d.hitWeight > 0);
const TOTAL_HIT_WEIGHT = OUTER_PARTS.reduce((s, d) => s + d.hitWeight, 0);

/** Build the default full body-part tree for a given root limb.
 *  Used when spawning pawns / mobs so every entity carries the complete anatomy. */
export function createDefaultBodyParts(limbId: LimbId): import('../core/types').BodyPartState[] {
    return BODY_PART_DEFS
        .filter(d => d.parentLimb === limbId)
        .map(d => ({
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
     * Advance all active mob-vs-pawn combats one tick.
     * Called from GameEngineImpl after Entity Step (Phase C wiring).
     */
    tickCombat(state: GameState, dtMs: number): GameState;
    /** Pure hit resolution: roll to-hit, pick body part, compute damage & injury. */
    resolveHit(attacker: Pawn | Mob, defender: Pawn | Mob, state: GameState): HitResult;
    /** Apply an already-resolved Injury to a pawn, updating limb tree + conditions. */
    applyInjury(pawnId: string, injury: Injury, state: GameState): GameState;
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
    const base = severity === 'destroyed' ? 30
        : severity === 'critical' ? 20
            : severity === 'serious' ? 10 : 4;
    return isVital ? base * 2 : base;
}

/** Return attacker's effective combat stats. Mobs check naturalWeapons from their creature def;
 *  pawns check their equipped weapon. Both fall back to unarmed/blunt. */
function attackerProfile(attacker: Pawn | Mob): {
    str: number; dex: number;
    baseDamage: number; accuracy: number;
    damageType: DamageType; bluntMod: number; armorPen: number;
} {
    const str = attacker.stats.strength;
    const dex = attacker.stats.dexterity;

    // Pawn with equipped weapon
    if ('equipment' in attacker && attacker.equipment?.weapon) {
        const wp = itemService.getItemById(attacker.equipment.weapon.itemId)?.weaponProperties;
        if (wp) {
            return {
                str, dex,
                baseDamage: wp.baseDamage ?? wp.damage,
                accuracy: wp.accuracy ?? 0,
                damageType: wp.damageType ?? 'blunt',
                bluntMod: wp.bluntMod ?? (wp.damageType === 'blunt' ? 1.0 : 0),
                armorPen: wp.armorPenetration ?? 0,
            };
        }
    }

    // Mob — pick a natural weapon at random (variety per-swing)
    if ('creatureId' in attacker) {
        const def = getCreatureById(attacker.creatureId);
        if (def?.naturalWeapons && def.naturalWeapons.length > 0) {
            const w = def.naturalWeapons[Math.floor(Math.random() * def.naturalWeapons.length)];
            return {
                str, dex,
                baseDamage: w.baseDamage,
                accuracy: 0,
                damageType: w.damageType,
                bluntMod: w.bluntMod ?? (w.damageType === 'blunt' ? 1.0 : 0),
                armorPen: 0,
            };
        }
    }

    // Unarmed fallback (fists / body-slam)
    return {
        str, dex,
        baseDamage: MOB_BASE_DAMAGE,
        accuracy: 0,
        damageType: 'blunt',
        bluntMod: 1.0,
        armorPen: 0,
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
    if (damageType === 'cutting')  res += (dex - 10) * 0.01;
    if (damageType === 'piercing') res += (con - 10) * 0.008;
    if (damageType === 'blunt')    res += (con - 10) * 0.008 + (str - 10) * 0.004;

    // Racial trait bonuses
    const traits = ('racialTraits' in defender) ? (defender.racialTraits ?? []) : [];
    for (const trait of traits) {
        res += trait.effects.damageReduction ?? 0;
        if (damageType === 'cutting')  res += trait.effects.cutting_resistance ?? 0;
        if (damageType === 'piercing') res += trait.effects.piercing_resistance ?? 0;
        if (damageType === 'blunt')    res += trait.effects.blunt_resistance ?? 0;
    }

    return clamp(res, 0, 0.90);
}

function partArmorReduction(defender: Pawn | Mob, partId: BodyPartId, armorPen: number): number {
    if (!('equipment' in defender) || !defender.equipment?.armor) return 0;
    const ap = itemService.getItemById(defender.equipment.armor.itemId)?.armorProperties;
    if (!ap) return 0;
    const def = PART_DEF_MAP[partId];
    if (!def) return 0;
    // Torso/head get full armour benefit; limbs only partial
    const base = (def.parentLimb === 'torso' || def.parentLimb === 'head')
        ? ap.defense / 100
        : (ap.defense / 100) * 0.3;
    return clamp(base * (1 - armorPen), 0, 0.9);
}

function currentPartHealth(defender: Pawn | Mob, partId: BodyPartId, defMaxHp: number): number {
    if (!('limbs' in defender) || !defender.limbs) return defMaxHp;
    const def = PART_DEF_MAP[partId];
    if (!def) return defMaxHp;
    const root = defender.limbs.find(l => l.id === def.parentLimb);
    const partState = root?.parts?.find(p => p.id === partId);
    return partState?.health ?? defMaxHp;
}

function upsertCondition(conditions: EntityCondition[], id: string, severity: number): EntityCondition[] {
    const i = conditions.findIndex(c => c.id === id);
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
        const { str, dex, baseDamage, accuracy, damageType, bluntMod, armorPen } = attackerProfile(attacker);
        const defDex = defender.stats.dexterity;

        const hitChance = clamp((dex * 3 + accuracy) - defDex * 2, 5, 95);
        if (Math.random() * 100 > hitChance) {
            return { hit: false, bodyPart: null, damage: 0, injury: null, knockdown: false };
        }

        const partId = rollBodyPart();
        const partDef = PART_DEF_MAP[partId]!;

        // Damage: baseDamage × str / STAT_SCALE, then armour reduces it.
        // STAT_SCALE=10 matches the real stat range (5–22) rather than the spec's
        // illustrative 0–100 scale.
        const raw = baseDamage * str / STAT_SCALE;
        const armorRed = partArmorReduction(defender, partId, armorPen);
        const physRes  = physicalResistance(defender, damageType);
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
            infected: false,
        };

        // Knockdown: blunt/crush hits roll chance based on damage vs constitution
        const defCon = defender.stats.constitution ?? 10;
        const knockChance = damageType === 'blunt'
            ? clamp((final - defCon / 4) * bluntMod, 0, 100)
            : 0;
        const knockdown = knockChance > 0 && Math.random() * 100 < knockChance;

        return { hit: true, bodyPart: partId, damage: final, injury, knockdown };
    }

    applyInjury(pawnId: string, injury: Injury, state: GameState): GameState {
        const pawn = state.pawns.find(p => p.id === pawnId);
        if (!pawn) return state;

        const partDef = PART_DEF_MAP[injury.bodyPart];
        if (!partDef) return state;

        // ── Update limb tree ─────────────────────────────────────────────────
        const limbs: LimbState[] = (pawn.limbs ?? []).map(limb => {
            if (limb.id !== partDef.parentLimb) return limb;

            const existing: BodyPartState[] = limb.parts ?? [];
            const idx = existing.findIndex(p => p.id === injury.bodyPart);

            let newParts: BodyPartState[];
            if (idx >= 0) {
                const prev = existing[idx];
                const newHp = Math.max(0, prev.health - injury.damage);
                newParts = [...existing];
                newParts[idx] = {
                    ...prev,
                    health: newHp,
                    isMissing: prev.isMissing || injury.severity === 'destroyed',
                    injuries: [...prev.injuries, injury],
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
                        injuries: [injury],
                    },
                ];
            }

            // Aggregate bleed from all fine-part injuries to the root limb's bleedRate
            const totalBleed = newParts.reduce(
                (sum, p) => sum + p.injuries.reduce((s, inj) => s + inj.bleeding, 0),
                0
            );

            return { ...limb, bleedRate: Math.max(limb.bleedRate, totalBleed) };
        });

        // ── Update pawn-level fields ─────────────────────────────────────────
        const newPain = clamp((pawn.pain ?? 0) + injury.painContribution, 0, 100);
        const newInjuries: Injury[] = [...(pawn.injuries ?? []), injury];

        // blood_loss severity derived from current bloodVolume
        const maxBV = pawn.maxBloodVolume ?? 100;
        const bloodLossSev = clamp(1 - (pawn.bloodVolume ?? maxBV) / maxBV, 0, 1);
        const newConditions = upsertCondition(pawn.conditions ?? [], 'blood_loss', bloodLossSev);

        // Pain collapse → knockdown 3 turns
        const newKnockdown = newPain >= 80
            ? Math.max(pawn.knockdown ?? 0, 3)
            : (pawn.knockdown ?? 0);

        let updated: Pawn = {
            ...pawn,
            limbs,
            injuries: newInjuries,
            pain: newPain,
            knockdown: newKnockdown,
            conditions: newConditions,
        };

        // Vital part destroyed → permadeath
        if (partDef.isVital && injury.severity === 'destroyed') {
            updated = { ...updated, isAlive: false, currentState: 'Dead' };
        }

        return { ...state, pawns: state.pawns.map(p => p.id === pawnId ? updated : p) };
    }

    tickCombat(state: GameState, _dtMs: number): GameState {
        const mobs = state.mobs;
        if (!mobs || mobs.length === 0) return state;

        let next = state;
        // Track stamina mutations for attacking mobs (id → new stamina value).
        const mobStaminaUpdates = new Map<string, number>();

        for (const mob of mobs) {
            // Only process mobs actively attacking and within their attack cadence
            if (mob.state !== 'Attacking' || mob.isAlive === false) continue;
            if ((state.turn - mob.stateSince) % ATTACK_INTERVAL_TICKS !== 0) continue;

            const curStamina = mob.stamina ?? (mob.maxStamina ?? 50);

            // Winded: skip attack this tick and regen instead
            if (curStamina <= 0) {
                mobStaminaUpdates.set(mob.id, Math.min(
                    curStamina + WINDED_STAMINA_REGEN_PER_TICK,
                    mob.maxStamina ?? 50
                ));
                continue;
            }

            // Find the closest alive pawn within 1 tile (Chebyshev)
            const target = state.pawns.find(p =>
                p.isAlive !== false &&
                p.position &&
                Math.abs(mob.x - p.position.x) <= 1 &&
                Math.abs(mob.y - p.position.y) <= 1
            );
            if (!target) continue;

            const result = this.resolveHit(mob, target, next);
            if (!result.hit || !result.injury) continue;

            next = this.applyInjury(target.id, result.injury, next);

            // Deduct stamina for the attack
            mobStaminaUpdates.set(mob.id, Math.max(0, curStamina - ATTACK_STAMINA_COST));

            if (result.knockdown) {
                const turns = Math.floor(Math.random() * 3) + 1;
                next = {
                    ...next,
                    pawns: next.pawns.map(p =>
                        p.id === target.id
                            ? { ...p, knockdown: Math.max(p.knockdown ?? 0, turns) }
                            : p
                    ),
                };
            }
        }

        // Apply stamina mutations to the mobs array in one pass
        if (mobStaminaUpdates.size > 0) {
            next = {
                ...next,
                mobs: next.mobs!.map(m =>
                    mobStaminaUpdates.has(m.id) ? { ...m, stamina: mobStaminaUpdates.get(m.id)! } : m
                ),
            };
        }

        return next;
    }

    /** Deferred — stub; wired by MAGIC-SKILLS spec. */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    triggerSkill(_skillId: string, _casterId: string, _targetId: string, state: GameState): GameState {
        return state;
    }
}

export const combatService: CombatService = new CombatServiceImpl();

/** Export the body-part definitions so Phase D UI and tests can access them. */
export { PART_DEF_MAP, BLEED_CONSTANT, CLOT_FLOOR };
export type { BodyPartDef };
