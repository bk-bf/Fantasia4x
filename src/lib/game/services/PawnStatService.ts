import type { Pawn, Mob, BodyPartState } from '../core/types';
import statsData from '../database/stats.jsonc';

// ── Stat definitions loaded from JSONC ────────────────────────────────────
type StatDef = {
    id: string;
    category: string;
    primaryStat: string;
    description: string;
    formula?: string;
};

const STATS: StatDef[] = statsData as unknown as StatDef[];
const STAT_MAP: Record<string, StatDef> = {};
STATS.forEach((st) => {
    STAT_MAP[st.id] = st;
});

const WORK_STAT_IDS = new Set(STATS.filter((s) => s.category === 'work').map((s) => s.id));

// ── Formula evaluator: substitutes stat tokens + weight/height + capacities ──
// Safe: expression is from project JSONC (not user input); sanitised to arithmetic chars only.
function evaluateFormula(
    formula: string | undefined,
    p: Pawn | Mob,
    capacities: Record<string, number> = {}
): number {
    if (!formula) return 1.0;
    let expr = formula
        .replace(/×/g, '*')
        .replace(/−/g, '-')
        .replace(/\bSTR\b/g, String(p.stats.strength))
        .replace(/\bDEX\b/g, String(p.stats.dexterity))
        .replace(/\bCON\b/g, String(p.stats.constitution))
        .replace(/\bPER\b/g, String(p.stats.perception))
        .replace(/\bINT\b/g, String(p.stats.intelligence))
        .replace(/\bCHA\b/g, String(p.stats.charisma))
        .replace(/\bweight\b/g, String(p.physicalTraits?.weight ?? 70))
        .replace(/\bheight\b/g, String(p.physicalTraits?.height ?? 170))
        .replace(/\bconsciousness\b/g, String(capacities.consciousness ?? 1))
        .replace(/\bmanipulation\b/g, String(capacities.manipulation ?? 1))
        .replace(/\bsight\b/g, String(capacities.sight ?? 1))
        .replace(/\bmoving\b/g, String(capacities.moving ?? 1))
        .replace(/\bblood_pumping\b/g, String(capacities.blood_pumping ?? 1))
        .replace(/\bblood_filtration\b/g, String(capacities.blood_filtration ?? 1))
        .replace(/\bbreathing\b/g, String(capacities.breathing ?? 1))
        .replace(/\bdigestion\b/g, String(capacities.digestion ?? 1))
        .replace(/\btalking\b/g, String(capacities.talking ?? 1))
        .replace(/\bhearing\b/g, String(capacities.hearing ?? 1))
        .replace(/\bpain\b/g, String(capacities.pain ?? 0));
    if (!/^[\d\s+\-*/.()]+$/.test(expr)) return 1.0;
    try {
        // eslint-disable-next-line no-new-func
        const v = Function('"use strict"; return (' + expr + ')')() as number;
        return isFinite(v) ? Math.round(v * 1000) / 1000 : 1.0;
    } catch {
        return 1.0;
    }
}

// ── Capacity calculator: derives body capacities from specific organs ──
// Uses partial-function logic with real organs (heart, lungs, kidneys, eyes…).
// Paired organs use weighted blend of weaker (bottleneck) and average (compensation).
function calculateCapacityValue(
    pawn: Pawn | Mob,
    capacityId: string,
    capacities: Record<string, number>,
    lightMultiplier?: number
): number {
    const limbs = pawn.limbs ?? [];
    const limb = (id: string) => limbs.find((l) => l.id === id);
    const limbH = (id: string) => limb(id)?.health ?? 100;
    const limbMissing = (id: string) => limb(id)?.isMissing ?? false;

    // Organ lookup: find a specific BodyPartState inside a limb's parts[]
    const organ = (limbId: string, organId: string): BodyPartState | undefined =>
        limb(limbId)?.parts?.find((p) => p.id === organId);
    // Health as a PERCENT of the organ's own maxHp (0–100), so callsites' `/100` yields the
    // correct 0–1 fraction. Organs carry realistic small maxHp (eyes 10, heart 20…); dividing
    // absolute hp by a flat 100 made a fully-healthy organ read as ~10% capacity. Absent/
    // unmodelled organ → treated as fully healthy (100), matching the prior fallback.
    const organH = (limbId: string, organId: string) => {
        const o = organ(limbId, organId);
        if (!o) return 100;
        const max = o.maxHp ?? 100;
        const hp = o.health ?? max;
        return max > 0 ? (hp / max) * 100 : 0;
    };
    const organMissing = (limbId: string, organId: string) =>
        organ(limbId, organId)?.isMissing ?? false;

    let value = 1.0;

    // Pre-compute pain since consciousness depends on it
    let injuryPain = 0;
    pawn.injuries?.forEach((inj) => (injuryPain += inj.painContribution));
    let limbPain = 0;
    limbs.forEach((l) => {
        if (!l.isMissing && l.health < 100) {
            limbPain += (100 - l.health) * 0.01;
        }
    });
    let bleedPain = 0;
    limbs.forEach((l) => {
        bleedPain += l.bleedRate * 0.5;
    });
    const painValue = (injuryPain + limbPain + bleedPain) / 100;

    switch (capacityId) {
        case 'consciousness': {
            const brain = organMissing('head', 'brain') ? 0.0 : organH('head', 'brain') / 100;
            const heart = organMissing('torso', 'heart') ? 0.0 : organH('torso', 'heart') / 100;
            const leftLung = organMissing('torso', 'leftLung') ? 0.0 : organH('torso', 'leftLung') / 100;
            const rightLung = organMissing('torso', 'rightLung')
                ? 0.0
                : organH('torso', 'rightLung') / 100;
            const avgLung = (leftLung + rightLung) / 2;
            const baseCon = brain * 0.5 + heart * 0.15 + avgLung * 0.1 + 0.1;
            const sightCap = capacities.sight ?? 1;
            const hearingCap = capacities.hearing ?? 1;
            // Pain drives consciousness down (RimWorld pain-shock): ~80 pain → ~0.3
            // consciousness, which is the colony's downing threshold. Organ/blood damage
            // lowers baseCon on top, so a wounded pawn faints at lower pain.
            const effectivePain = Math.max(0, painValue - 0.1);
            const painMult = Math.max(0.05, 1 - effectivePain);
            value = (baseCon + sightCap * 0.1 + hearingCap * 0.05) * painMult;
            break;
        }
        case 'pain': {
            value = painValue;
            break;
        }
        case 'manipulation': {
            const left = limbMissing('left_arm') ? 0.0 : limbH('left_arm') / 100;
            const right = limbMissing('right_arm') ? 0.0 : limbH('right_arm') / 100;
            const minArm = Math.min(left, right);
            const avgArm = (left + right) / 2;
            value = minArm * 0.3 + avgArm * 0.7;
            break;
        }
        case 'sight': {
            const leftEye = organMissing('head', 'leftEye') ? 0.0 : organH('head', 'leftEye') / 100;
            const rightEye = organMissing('head', 'rightEye') ? 0.0 : organH('head', 'rightEye') / 100;
            const minEye = Math.min(leftEye, rightEye);
            const avgEye = (leftEye + rightEye) / 2;
            const baseSight = minEye * 0.4 + avgEye * 0.6 + 0.05;
            value = baseSight * (lightMultiplier ?? 1.0);
            break;
        }
        case 'moving': {
            const left = limbMissing('left_leg') ? 0.0 : limbH('left_leg') / 100;
            const right = limbMissing('right_leg') ? 0.0 : limbH('right_leg') / 100;
            const minLeg = Math.min(left, right);
            const avgLeg = (left + right) / 2;
            value = minLeg * 0.5 + avgLeg * 0.5;
            break;
        }
        case 'blood_pumping': {
            const heart = organMissing('torso', 'heart') ? 0.0 : organH('torso', 'heart') / 100;
            value = heart * 0.9 + 0.1;
            break;
        }
        case 'blood_filtration': {
            const leftK = organMissing('torso', 'leftKidney') ? 0.0 : organH('torso', 'leftKidney') / 100;
            const rightK = organMissing('torso', 'rightKidney')
                ? 0.0
                : organH('torso', 'rightKidney') / 100;
            const minK = Math.min(leftK, rightK);
            const avgK = (leftK + rightK) / 2;
            value = minK * 0.4 + avgK * 0.6;
            break;
        }
        case 'breathing': {
            const leftL = organMissing('torso', 'leftLung') ? 0.0 : organH('torso', 'leftLung') / 100;
            const rightL = organMissing('torso', 'rightLung') ? 0.0 : organH('torso', 'rightLung') / 100;
            const minL = Math.min(leftL, rightL);
            const avgL = (leftL + rightL) / 2;
            value = minL * 0.5 + avgL * 0.5 + 0.05;
            break;
        }
        case 'digestion': {
            const stomach = organMissing('torso', 'stomach') ? 0.0 : organH('torso', 'stomach') / 100;
            const liver = organMissing('torso', 'liver') ? 0.0 : organH('torso', 'liver') / 100;
            value = stomach * 0.6 + liver * 0.4;
            break;
        }
        case 'talking': {
            const jaw = organMissing('head', 'jaw') ? 0.0 : organH('head', 'jaw') / 100;
            value = jaw * 0.9 + 0.1;
            break;
        }
        case 'hearing': {
            const leftE = organMissing('head', 'leftEar') ? 0.0 : organH('head', 'leftEar') / 100;
            const rightE = organMissing('head', 'rightEar') ? 0.0 : organH('head', 'rightEar') / 100;
            const minE = Math.min(leftE, rightE);
            const avgE = (leftE + rightE) / 2;
            value = minE * 0.3 + avgE * 0.7 + 0.15;
            break;
        }
        default:
            value = 1.0;
    }

    return value;
}

// ── Service interface ──────────────────────────────────────────────────────
export interface PawnStatService {
    /** Evaluate any stat formula from stats.jsonc for a given pawn or mob. */
    evaluateStat(statId: string, pawn: Pawn | Mob): number;
    /** Compute all body capacities (0–1) for a pawn or mob. */
    computeCapacities(pawn: Pawn | Mob, lightMultiplier?: number): Record<string, number>;
    /** Get speed / yield / quality multipliers for a work type. */
    getWorkModifiers(
        pawn: Pawn | Mob,
        workType: string,
        lightMultiplier?: number
    ): { speed: number; yield: number; quality: number };
    /** Check if a stat ID exists in stats.jsonc. */
    hasStat(statId: string): boolean;
}

export class PawnStatServiceImpl implements PawnStatService {
    computeCapacities(pawn: Pawn | Mob, lightMultiplier?: number): Record<string, number> {
        const capacities: Record<string, number> = {};
        // Order matters: pain → sight → hearing → consciousness → everything else
        const capacityIds = [
            'pain',
            'sight',
            'hearing',
            'consciousness',
            'manipulation',
            'moving',
            'blood_pumping',
            'blood_filtration',
            'breathing',
            'digestion',
            'talking'
        ];
        for (const id of capacityIds) {
            capacities[id] = calculateCapacityValue(
                pawn,
                id,
                capacities,
                id === 'sight' ? lightMultiplier : undefined
            );
        }
        return capacities;
    }

    evaluateStat(statId: string, pawn: Pawn | Mob): number {
        const def = STAT_MAP[statId];
        if (!def) return 1.0;
        const capacities =
            def.category === 'capacity' ? this.computeCapacities(pawn) : this.computeCapacities(pawn);
        return evaluateFormula(def.formula, pawn, capacities);
    }

    getWorkModifiers(
        pawn: Pawn | Mob,
        workType: string,
        lightMultiplier?: number
    ): { speed: number; yield: number; quality: number } {
        // §G: a light multiplier dims the `sight` capacity, which every `*_speed`/`_yield`/`_quality`
        // formula multiplies by → work (and its quality) slows in the dark through the existing model.
        const capacities = this.computeCapacities(pawn, lightMultiplier);
        const speed = evaluateFormula(STAT_MAP[`${workType}_speed`]?.formula, pawn, capacities);
        const yieldVal = evaluateFormula(STAT_MAP[`${workType}_yield`]?.formula, pawn, capacities);
        const quality = evaluateFormula(STAT_MAP[`${workType}_quality`]?.formula, pawn, capacities);
        return {
            speed: Math.max(0.1, speed),
            yield: Math.max(0.1, yieldVal),
            quality: Math.max(0.1, quality)
        };
    }

    hasStat(statId: string): boolean {
        return statId in STAT_MAP;
    }
}

export const pawnStatService = new PawnStatServiceImpl();
