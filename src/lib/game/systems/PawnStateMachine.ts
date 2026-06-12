/**
 * PawnStateMachine — Phase 5a/5e
 *
 * Turn-based state machine for pawn behaviour.
 * States: Idle → MovingToResource → Working → Idle
 *         Idle → Hungry → Eating → Idle
 *         Idle → Tired  → Sleeping → Idle
 *
 * Phase 5 change: Idle now picks jobs through JobService instead of directly
 * scanning designations. All job completion side-effects live in JobService.
 *
 * Port of Celestia pawn_state_machine.gd + states/*.gd, adapted to
 * turn-based ticks and Fantasia4x GameState immutability.
 */

import type {
    GameState,
    Pawn,
    Mob,
    Building,
    PlacedBuilding,
    ConditionDef,
    ConditionStage,
    Injury,
    LimbState
} from '../core/types';
import { recomputeWound } from './Combat';
import { HEALING_CONFIG, CARE_CONFIG, woundById } from '../core/Wounds';
import {
    addToStockpileZone,
    consumeFromStockpiles,
    absorbDropIfOnStockpileTile
} from '../core/GameState';
import ITEMS_DATABASE from '../database/items.jsonc';
import BUILDINGS_DATABASE_RAW from '../database/buildings.jsonc';
import conditionsData from '../database/conditions.jsonc';
import { jobService, BASE_WORK_RATE } from '../services/JobService';
import { pawnService } from '../services/PawnService';
import { itemService } from '../services/ItemService';
import { pawnStatService } from '../services/PawnStatService';
import { modifierSystem } from './ModifierSystem';
import { wasmPathfinderService } from '../services/WasmPathfinderService';
import { buildPathfindingGridsWithBlocked } from '../services/PathfinderService';
import { occupancyService } from '../services/OccupancyService';
import { logActivity } from '../../stores/Log';
import { gameLogger } from '../dev/gameLogger';
import { ticksFromSeconds, perTick } from '../core/time';
import { calcBloodRegenRate } from '../entities/Pawns';
import { rng } from '../core/rng';

// ===== STATE NAME CONSTANTS =====
export const PAWN_STATE = {
    IDLE: 'Idle',
    MOVING_TO_RESOURCE: 'MovingToResource',
    WORKING: 'Working',
    HUNGRY: 'Hungry',
    TIRED: 'Tired',
    MOVING_TO_NEED: 'MovingToNeed',
    EATING: 'Eating',
    SLEEPING: 'Sleeping',
    HAULING: 'Hauling',
    MOVING_TO_DEPOSIT: 'MovingToDeposit',
    // §D water needs: route to a drink/wash zone (or well), then drink/wash.
    DRINKING: 'Drinking',
    WASHING: 'Washing',
    // Combat states (COMBAT-SYSTEM): auto-engagement when a hostile enters aggro range.
    FIGHTING: 'Fighting',
    FLEEING: 'Fleeing',
    // Downed by cumulative pain — out of the fight until pain subsides.
    COLLAPSED: 'Collapsed'
} as const;

export type PawnStateName = (typeof PAWN_STATE)[keyof typeof PAWN_STATE];

// D9.4: index the item database by id ONCE. The hot need-interrupt path used to scan
// ITEMS_DATABASE.find(...) per stockpile entry per call for every needy pawn each tick.
const ITEM_DEF_BY_ID: Map<string, any> = new Map(
    (ITEMS_DATABASE as any[]).map((d) => [d.id, d])
);

// ===== NEED THRESHOLDS =====
// Calibrated to 1 in-game day = 300 turns (1 turn ≈ 5 in-game min; 1 day ≈ 5 real min at 1 turn/sec):
//   Hunger:  0.54/turn → 0→70 in ~130 turns ≈ 0.43 days  (matches Rimworld ~10.5h hunger trigger)
//   Fatigue: 0.32/turn → 0→72 in ~225 turns ≈ 0.75 days  (matches Rimworld ~18h sleep trigger)
//   Bed sleep: 0.72/turn → 72→0 in ~100 turns = 1/3 day ≈ 8h   (Rimworld 8h bed sleep)
//   Ground:    0.58/turn → 72→0 in ~124 turns ≈ 9.9h             (Rimworld ~10h ground sleep)
//   At 2× speed everything is 2× faster; at 4× speed 4× faster — matching Rimworld multi-speed feel.
const HUNGER_THRESHOLD = 70; // Seek food at 70% (= Rimworld 30% saturation trigger)
const FATIGUE_THRESHOLD = 72; // Seek rest after ~225 turns ≈ 0.75 days (28% rest = 72% fatigue)

// ===== COMBAT (COMBAT-SYSTEM) =====
/** Base vision radius in tiles for aggressive/flee stances, scaled by the pawn's
 *  aggro_range stat (perception + sight capacity). Defensive pawns ignore this and
 *  only react to adjacent hostiles. */
const PAWN_BASE_VISION = 6;
/** How far (tiles) a fleeing pawn tries to put between itself and the threat. */
const FLEE_DISTANCE = 6;
/** Consciousness (0–1) below which a pawn collapses (matches Combat.COLLAPSE_CONSCIOUSNESS).
 *  Folds in pain + blood loss + organ damage, so downing has one unified cause. */
const COLLAPSE_CONSCIOUSNESS = 0.3;
/** A collapsed pawn stands back up once consciousness recovers above this. */
const RECOVER_CONSCIOUSNESS = 0.45;

/** Vision/aggro radius in tiles for this pawn (perception- and sight-scaled). */
function pawnVisionTiles(pawn: Pawn): number {
    const mult = pawnStatService.evaluateStat('aggro_range', pawn);
    return Math.max(1, Math.round(PAWN_BASE_VISION * (mult > 0 ? mult : 1)));
}
// Dynamic need interruption (replaces flat CRITICAL_HUNGER / CRITICAL_FATIGUE thresholds).
// A pawn weighs need urgency against proximity — the hungrier/more tired, the greater the detour.
const NEED_DETOUR_MAX_FACTOR = 15; // At need=100%, willing to detour up to 15× the job distance
const NEED_DETOUR_MIN_DIST = 5; // Minimum effective job distance (prevents ÷0 when already at site)
// Work priority threshold adjustments:
//   Level 4 (critical) → +8 pts harder to interrupt; level 1 (low) → −4 pts easier
const WORK_PRIORITY_THRESHOLD_SHIFT = 4; // pts per labor level above/below default (2)
// Queue food lookahead: if no upcoming task passes near food, lower the threshold so pawn eats sooner.
const QUEUE_FOOD_THRESHOLD_REDUCTION = 5; // max threshold pts reduction when all queue jobs far from food
// How many ahead-of-time jobs to soft-preview in the pawn's jobQueue.
const JOB_QUEUE_SIZE = 4;
// NOTE: The constants below are turn-denominated. *_TURNS are durations (a turn = 60 ticks,
// so they keep their values). FATIGUE_PER_SLEEPING_* and the MALNUTRITION/BLOOD rates below
// deliberately stay PER-TURN: they are recovery/condition rates evaluated alongside the
// turn-based state machine and death checks, and at <0.001/turn they are sub-perceptual —
// smoothing them to per-tick would add risk for no visible benefit.
// NOTE: Values below are authored in SECONDS (the legacy "turn"). The sim runs the
// whole pipeline every tick, so DURATIONS are converted to ticks via ticksFromSeconds()
// and per-second RATES are converted to per-tick amounts via perTick(). One knob
// (TICKS_PER_SECOND in core/time) retunes all of them at once.
const EATING_TURNS = ticksFromSeconds(2); // ~2 in-game min to eat at a campfire
const EATING_TURNS_GROUND = ticksFromSeconds(3); // eating in-place (cold, uncomfortable)
const SLEEPING_TURNS = ticksFromSeconds(100); // Full recovery in bed: 72 / 0.72 = 100s = 1/3 day (progress bar ref)
const SLEEPING_TURNS_GROUND = ticksFromSeconds(124); // Full recovery on ground: 72 / 0.58 ≈ 124s ≈ 9.9h
const HUNGER_PER_FOOD_UNIT = 30; // Base hunger restored per 1 unit (×nutrition)
const SAFE_HUNGER = 10; // Target hunger level after a full meal
const MAX_UNITS_PER_FOOD_TYPE = 3; // Cap per food type per meal — avoids hoarding
const FATIGUE_PER_SLEEPING_TURN = 0.72; // Bed: 72 fatigue → 0 in ~100s = 8 in-game hours (per second; perTick at use)
const FATIGUE_PER_SLEEPING_GROUND = 0.58; // Ground: 72 → 0 in ~124s ≈ 9.9 in-game hours (per second; perTick at use)
// Wake thresholds — prevents yo-yo by requiring proper rest before resuming activity
const SLEEP_WAKE_THRESHOLD_FED = 0; // Sleep until fully restored when not hungry
const SLEEP_WAKE_THRESHOLD_HUNGRY = 30; // Allow early waking at 30% to go eat

// ===== CONDITION CONSTANTS (SURVIVAL-HEALTH spec) =====
const CONDITIONS_DB = conditionsData as unknown as ConditionDef[];
// Building definitions (for sleep quality lookup)
const BUILDINGS_DB = BUILDINGS_DATABASE_RAW as unknown as Building[];
const MALNUTRITION_ONSET_HUNGER = 87; // same as CRITICAL_HUNGER — condition starts here
const MALNUTRITION_SAFE_HUNGER = 40; // below this threshold, condition recovers
// Lethal timers slowed ~4× so starvation is a multi-day ordeal (~a week), not ~2 days.
const MALNUTRITION_RATE_CRITICAL = perTick(0.0002); // +/s at hunger 87–99  → lethal in ~5000s ≈ 16.7 days
const MALNUTRITION_RATE_MAX = perTick(0.0005); // +/s at hunger 100    → lethal in ~2000s ≈ 6.7 days
const MALNUTRITION_RECOVERY_RATE = perTick(0.0003); // −/s when hunger < 40 → fully clears in ~3333s ≈ 11 days

/**
 * §G light → work. Map a tile's cached lightLevel (~0.1 pitch-dark … 1.0 daylight … 1.6 firelit)
 * to a sight/work multiplier: full speed in good light, down to a 0.4 floor in the dark (a pawn
 * can still fumble through coarse work). Fed into `sight` so it flows through the *_speed formulas.
 */
function lightWorkMultiplier(lightLevel: number): number {
    return Math.min(1, Math.max(0.4, lightLevel));
}

// §D dehydration — faster than starvation (you die of thirst long before hunger).
const DEHYDRATION_ONSET_THIRST = 95; // condition starts here
const DEHYDRATION_SAFE_THIRST = 40; // below this threshold, condition recovers
const DEHYDRATION_RATE_CRITICAL = perTick(0.0006); // +/s at thirst 95–99 → lethal in ~1667s ≈ 5.6 days
const DEHYDRATION_RATE_MAX = perTick(0.0015); // +/s at thirst 100   → lethal in ~667s  ≈ 2.2 days
const DEHYDRATION_RECOVERY_RATE = perTick(0.0008); // −/s when thirst < 40
// Blood regen is computed per-pawn via calcBloodRegenRate(pawn.stats) × SECONDS_PER_TICK.
// See blood_regeneration entry in stats.jsonc for the formula.

/** Return the active ConditionStage for a condition at the given severity, or undefined. */
function getConditionStage(conditionId: string, severity: number): ConditionStage | undefined {
    const def = CONDITIONS_DB.find((d) => d.id === conditionId);
    if (!def) return undefined;
    let active: ConditionStage | undefined;
    for (const stage of def.stages) {
        if (severity >= stage.minSeverity) active = stage;
    }
    return active;
}

// ===== HELPERS =====

/**
 * Kill a pawn: set isAlive=false, record DeadPawnRecord, log, apply mood penalty to survivors.
 */
function killPawn(
    pawn: Pawn,
    cause:
        | 'malnutrition'
        | 'dehydration'
        | 'blood_loss'
        | 'critical_limb'
        | 'combat'
        | 'exhaustion_cascade'
        | 'infection',
    gameState: GameState
): GameState {
    logActivity({
        turn: gameState.turn,
        type: 'event',
        actor: pawn.id,
        action: 'died',
        target: cause,
        result: `${pawn.name} has died of ${cause.replace('_', ' ')}.`,
        severity: 'critical'
    });

    const deadRecord = {
        name: pawn.name,
        cause,
        turn: gameState.turn,
        stats: {
            strength: pawn.stats.strength ?? 10,
            dexterity: pawn.stats.dexterity ?? 10,
            intelligence: pawn.stats.intelligence ?? 10
        }
    };

    // Apply mood penalty to all living pawns
    const pawns = gameState.pawns.map((p) => {
        if (p.id === pawn.id) {
            return {
                ...p,
                isAlive: false,
                currentState: 'Dead',
                activeJob: undefined,
                path: [],
                isMoving: false
            };
        }
        if (p.isAlive === false) return p;
        return {
            ...p,
            state: { ...p.state, mood: Math.max(0, (p.state?.mood ?? 50) - 5) }
        };
    });

    // Release any pool jobs claimed by the dead pawn so a living pawn can take them.
    // Without this, a job stays claimedBy === deadPawnId forever and is unworkable.
    const jobs = (gameState.jobs ?? []).map((j) =>
        j.claimedBy === pawn.id ? { ...j, claimedBy: null } : j
    );

    return {
        ...gameState,
        pawns,
        jobs,
        deadPawns: [...(gameState.deadPawns ?? []), deadRecord]
    };
}

/**
 * Tick all progressive health conditions for a single pawn:
 * malnutrition progression, blood loss, critical limb checks.
 * Returns updated GameState (may trigger death via killPawn).
 */
function tickConditions(pawn: Pawn, gameState: GameState): GameState {
    const hunger = pawn.needs?.hunger ?? 0;
    let conditions = [...(pawn.conditions ?? [])];
    const maxBloodVolume = pawn.maxBloodVolume ?? 100;
    let bloodVolume = pawn.bloodVolume ?? maxBloodVolume;
    const limbs = pawn.limbs ?? [];

    // ── Malnutrition ──────────────────────────────────────────────────────────
    const malnutritionIdx = conditions.findIndex((c) => c.id === 'malnutrition');

    if (hunger >= MALNUTRITION_ONSET_HUNGER) {
        const rate = hunger >= 100 ? MALNUTRITION_RATE_MAX : MALNUTRITION_RATE_CRITICAL;
        if (malnutritionIdx === -1) {
            conditions.push({ id: 'malnutrition', severity: rate });
        } else {
            conditions[malnutritionIdx] = {
                ...conditions[malnutritionIdx],
                severity: Math.min(1.0, conditions[malnutritionIdx].severity + rate)
            };
        }
    } else if (hunger < MALNUTRITION_SAFE_HUNGER && malnutritionIdx !== -1) {
        const newSeverity = conditions[malnutritionIdx].severity - MALNUTRITION_RECOVERY_RATE;
        if (newSeverity <= 0) {
            conditions.splice(malnutritionIdx, 1);
        } else {
            conditions[malnutritionIdx] = { ...conditions[malnutritionIdx], severity: newSeverity };
        }
    }

    // Check malnutrition lethality (re-find in case just added)
    const malnutritionCurrent = conditions.find((c) => c.id === 'malnutrition');
    const malnutritionDef = CONDITIONS_DB.find((d) => d.id === 'malnutrition');
    if (
        malnutritionCurrent &&
        malnutritionDef &&
        malnutritionCurrent.severity >= malnutritionDef.lethalSeverity
    ) {
        const updated = { ...pawn, conditions, bloodVolume };
        return killPawn(
            { ...gameState.pawns.find((p) => p.id === pawn.id)!, ...updated },
            'malnutrition',
            {
                ...gameState,
                pawns: gameState.pawns.map((p) =>
                    p.id === pawn.id ? { ...p, conditions, bloodVolume } : p
                )
            }
        );
    }

    // ── Dehydration (§D) ──────────────────────────────────────────────────────
    const thirst = pawn.needs?.thirst ?? 0;
    const dehydrationIdx = conditions.findIndex((c) => c.id === 'dehydration');
    if (thirst >= DEHYDRATION_ONSET_THIRST) {
        const rate = thirst >= 100 ? DEHYDRATION_RATE_MAX : DEHYDRATION_RATE_CRITICAL;
        if (dehydrationIdx === -1) conditions.push({ id: 'dehydration', severity: rate });
        else
            conditions[dehydrationIdx] = {
                ...conditions[dehydrationIdx],
                severity: Math.min(1.0, conditions[dehydrationIdx].severity + rate)
            };
    } else if (thirst < DEHYDRATION_SAFE_THIRST && dehydrationIdx !== -1) {
        const newSeverity = conditions[dehydrationIdx].severity - DEHYDRATION_RECOVERY_RATE;
        if (newSeverity <= 0) conditions.splice(dehydrationIdx, 1);
        else conditions[dehydrationIdx] = { ...conditions[dehydrationIdx], severity: newSeverity };
    }
    const dehydrationCurrent = conditions.find((c) => c.id === 'dehydration');
    const dehydrationDef = CONDITIONS_DB.find((d) => d.id === 'dehydration');
    if (
        dehydrationCurrent &&
        dehydrationDef &&
        dehydrationCurrent.severity >= dehydrationDef.lethalSeverity
    ) {
        return killPawn(
            { ...gameState.pawns.find((p) => p.id === pawn.id)!, conditions, bloodVolume },
            'dehydration',
            {
                ...gameState,
                pawns: gameState.pawns.map((p) =>
                    p.id === pawn.id ? { ...p, conditions, bloodVolume } : p
                )
            }
        );
    }

    // ── Blood Loss ────────────────────────────────────────────────────────────
    const totalBleedRate = limbs.reduce((sum, l) => sum + (l.bleedRate ?? 0), 0);

    if (totalBleedRate > 0) {
        bloodVolume = Math.max(0, bloodVolume - perTick(totalBleedRate));
    }

    // Sync blood_loss condition severity = 1 - (bloodVolume / maxBloodVolume)
    const bloodSeverity = 1 - bloodVolume / maxBloodVolume;
    const bloodLossIdx = conditions.findIndex((c) => c.id === 'blood_loss');
    if (bloodSeverity > 0) {
        if (bloodLossIdx === -1) {
            conditions.push({ id: 'blood_loss', severity: bloodSeverity });
        } else {
            conditions[bloodLossIdx] = { ...conditions[bloodLossIdx], severity: bloodSeverity };
        }
    } else if (bloodLossIdx !== -1) {
        conditions.splice(bloodLossIdx, 1);
    }

    // Regen blood when not bleeding — rate driven by blood_regeneration ability (CON-scaled)
    if (totalBleedRate === 0 && bloodVolume < maxBloodVolume) {
        bloodVolume = Math.min(maxBloodVolume, bloodVolume + perTick(calcBloodRegenRate(pawn.stats)));
    }

    // Check blood loss lethality
    if (bloodVolume <= 0) {
        const updatedGs = {
            ...gameState,
            pawns: gameState.pawns.map((p) =>
                p.id === pawn.id ? { ...p, conditions, bloodVolume: 0, limbs } : p
            )
        };
        return killPawn(updatedGs.pawns.find((p) => p.id === pawn.id)!, 'blood_loss', updatedGs);
    }

    // ── Infection ─────────────────────────────────────────────────────────────
    // Untended open wounds fester; the immune system (CON) and good care push back.
    // Drives the multi-stage `infection` condition, lethal at full severity.
    let infectionPressure = 0;
    for (const limb of limbs) {
        for (const part of limb.parts ?? []) {
            for (const w of part.injuries) {
                const open =
                    w.bleeding > 0 ||
                    w.severity === 'serious' ||
                    w.severity === 'critical' ||
                    w.severity === 'destroyed';
                if (open && !isTended(w, gameState.turn)) {
                    infectionPressure += CARE_CONFIG.infectionRiskPerWound;
                }
            }
        }
    }
    const immune = Math.max(
        0,
        Math.min(0.95, CARE_CONFIG.immuneResistBase + (pawn.stats.constitution - 10) * 0.02)
    );
    const infIdx = conditions.findIndex((c) => c.id === 'infection');
    const curInf = infIdx >= 0 ? conditions[infIdx].severity : 0;
    const nextInf =
        infectionPressure > 0
            ? Math.min(1, curInf + infectionPressure * (1 - immune))
            : Math.max(0, curInf - CARE_CONFIG.infectionRecoveryPerTick);
    if (nextInf <= 0) {
        if (infIdx >= 0) conditions.splice(infIdx, 1);
    } else if (infIdx >= 0) {
        conditions[infIdx] = { ...conditions[infIdx], severity: nextInf };
    } else {
        conditions.push({ id: 'infection', severity: nextInf });
    }
    const infectionDef = CONDITIONS_DB.find((d) => d.id === 'infection');
    if (infectionDef && nextInf >= infectionDef.lethalSeverity) {
        const updatedGs = {
            ...gameState,
            pawns: gameState.pawns.map((p) =>
                p.id === pawn.id ? { ...p, conditions, bloodVolume, limbs } : p
            )
        };
        return killPawn(updatedGs.pawns.find((p) => p.id === pawn.id)!, 'infection', updatedGs);
    }

    // ── Critical Limb Destruction ─────────────────────────────────────────────
    for (const limb of limbs) {
        if (limb.health <= 0 && (limb.id === 'head' || limb.id === 'torso')) {
            const updatedGs = {
                ...gameState,
                pawns: gameState.pawns.map((p) =>
                    p.id === pawn.id ? { ...p, conditions, bloodVolume, limbs } : p
                )
            };
            return killPawn(updatedGs.pawns.find((p) => p.id === pawn.id)!, 'critical_limb', updatedGs);
        }
    }

    // ── Persist updated condition/blood state ──────────────────────────────────
    return {
        ...gameState,
        pawns: gameState.pawns.map((p) =>
            p.id === pawn.id ? { ...p, conditions, bloodVolume, limbs } : p
        )
    };
}

/**
 * Mend wounds over time (COMBAT-SYSTEM). Each wound's accumulated damage shrinks by a
 * heal-rate- and difficulty-scaled amount, restoring part HP, lowering bleed, and
 * (since pain = Σ wounds) lowering pain — which is how a collapsed pawn recovers.
 * Recovery is boosted by sleep, being well-fed, and a good mood. Wounds do NOT mend
 * mid-fight (the caller skips FIGHTING/FLEEING), so a brawl still marches to collapse.
 */
/** Is this wound currently under active treatment? Higher-quality tends last longer. */
function isTended(w: Injury, turn: number): boolean {
    if (w.treatedAt == null) return false;
    return turn - w.treatedAt < CARE_CONFIG.treatmentDurationTicks * (w.treatmentQuality ?? 0);
}

/** The colony's best available medic (skill + mood) — anyone alive and not downed or
 *  mid-fight, including the patient (self-care). Returns null if no one can help. */
function bestCaretaker(gameState: GameState): { skill: number; mood: number } | null {
    let best: { skill: number; mood: number } | null = null;
    for (const p of gameState.pawns) {
        if (p.isAlive === false) continue;
        const st = p.currentState;
        if (st === PAWN_STATE.COLLAPSED || st === PAWN_STATE.FIGHTING || st === PAWN_STATE.FLEEING) continue;
        const skill = pawnStatService.evaluateStat('medical_skill', p);
        if (!best || skill > best.skill) best = { skill, mood: p.state?.mood ?? 50 };
    }
    return best;
}

/** Best medicine in the stockpile (highest `medicineQuality` with stock), or null. */
function bestMedicine(gameState: GameState): { id: string; quality: number } | null {
    let best: { id: string; quality: number } | null = null;
    for (const [id, amount] of Object.entries(gameState.stockpile ?? {})) {
        if (amount <= 0) continue;
        const q = itemService.getItemById(id)?.medicineQuality;
        if (q && q > 0 && (!best || q > best.quality)) best = { id, quality: q };
    }
    return best;
}

/**
 * Tend a patient's untended wounds (COMBAT-SYSTEM caretaking). The colony's best
 * available medic rolls a treatment quality from their `medical_skill` (which folds in
 * sight × manipulation × consciousness) × mood × variance, **plus the quality of the best
 * medicine in the stockpile**, which is consumed. The quality is stamped on each wound and
 * drives faster healing, a longer-lasting tend, and infection suppression. A botched roll
 * (below minTendQuality) does nothing. Returns the updated GameState (patient + stockpile).
 */
export function tendWounds(patient: Pawn, gameState: GameState): GameState {
    const turn = gameState.turn;
    const limbs = patient.limbs;
    if (!limbs) return gameState;
    const hasUntended = limbs.some((l) =>
        (l.parts ?? []).some((p) => p.injuries.some((w) => !isTended(w, turn)))
    );
    if (!hasUntended) return gameState;

    const medic = bestCaretaker(gameState);
    if (!medic) return gameState;
    const med = bestMedicine(gameState);
    const moodFactor = Math.max(0.3, Math.min(1.2, 0.6 + (medic.mood / 100) * 0.6));
    const skillRoll = medic.skill * moodFactor * (0.6 + rng.random() * 0.4);
    const quality = Math.max(0, Math.min(1, skillRoll + (med?.quality ?? 0)));
    if (quality < CARE_CONFIG.minTendQuality) return gameState; // botched tend

    const newLimbs = limbs.map((limb) => {
        const parts = limb.parts;
        if (!parts || !parts.some((p) => p.injuries.length > 0)) return limb;
        return {
            ...limb,
            parts: parts.map((part) =>
                part.injuries.length === 0
                    ? part
                    : {
                          ...part,
                          injuries: part.injuries.map((w) =>
                              isTended(w, turn) ? w : { ...w, treatedAt: turn, treatmentQuality: quality }
                          )
                      }
            )
        };
    });
    let next: GameState = {
        ...gameState,
        pawns: gameState.pawns.map((p) => (p.id === patient.id ? { ...patient, limbs: newLimbs } : p))
    };
    if (med) next = consumeFromStockpiles(next, { [med.id]: 1 }); // consume one dose
    return next;
}

export function healWounds(pawn: Pawn, turn = 0): Pawn {
    const limbs = pawn.limbs;
    const hasWounds = limbs?.some((l) => (l.parts ?? []).some((p) => p.injuries.length > 0));
    if (!limbs || !hasWounds) return pawn;

    const healRate = Math.max(0, pawnStatService.evaluateStat('heal_rate', pawn));
    let mult = 1;
    if (pawn.currentState === PAWN_STATE.SLEEPING) mult *= HEALING_CONFIG.sleepingMultiplier;
    if ((pawn.needs?.hunger ?? 0) <= HEALING_CONFIG.wellFedHunger) mult *= HEALING_CONFIG.wellFedMultiplier;
    if ((pawn.state?.mood ?? 50) >= HEALING_CONFIG.goodMood) mult *= HEALING_CONFIG.goodMoodMultiplier;
    const baseHeal = HEALING_CONFIG.baseHealPerTick * healRate * mult; // part HP / tick, per wound
    if (baseHeal <= 0) return pawn;

    const newLimbs: LimbState[] = limbs.map((limb) => {
        const parts = limb.parts;
        if (!parts || !parts.some((p) => p.injuries.length > 0)) return limb;
        const newParts = parts.map((part) => {
            if (part.injuries.length === 0 || part.isMissing) return part;
            let healed = 0;
            const newWounds: Injury[] = [];
            for (const w of part.injuries) {
                // A tended wound knits faster, scaled by the tend's quality.
                const tendBoost = isTended(w, turn)
                    ? 1 + CARE_CONFIG.treatedHealMultiplier * (w.treatmentQuality ?? 0)
                    : 1;
                const heal = (baseHeal / (woundById(w.type)?.healDifficulty ?? 1)) * tendBoost;
                const newDamage = w.damage - heal;
                if (newDamage <= 0.05) {
                    healed += w.damage; // fully mended — drop the wound
                    continue;
                }
                healed += heal;
                newWounds.push(recomputeWound(part.id, w.type, newDamage, w));
            }
            return { ...part, health: Math.min(part.maxHp, part.health + healed), injuries: newWounds };
        });
        const totalBleed = newParts.reduce(
            (s, p) => s + p.injuries.reduce((ps, w) => ps + w.bleeding, 0),
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
    for (const l of newLimbs) {
        for (const p of l.parts ?? []) {
            for (const w of p.injuries) {
                painTotal += w.painContribution;
                newInjuries.push(w);
            }
        }
    }
    return {
        ...pawn,
        limbs: newLimbs,
        pain: Math.max(0, Math.min(100, Math.round(painTotal))),
        injuries: newInjuries
    };
}

function isAdjacent(ax: number, ay: number, bx: number, by: number): boolean {
    const dx = Math.abs(ax - bx);
    const dy = Math.abs(ay - by);
    return dx <= 1 && dy <= 1 && dx + dy > 0;
}

/** Tiles held by pawns that are currently stationary (eating, sleeping, or working). */
function findAdjacentApproach(
    tx: number,
    ty: number,
    worldMap: GameState['worldMap'],
    occupied?: Set<string>,
    fromX?: number,
    fromY?: number
): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = tx + dx;
            const ny = ty + dy;
            if (!worldMap[ny]?.[nx]?.walkable || occupied?.has(`${nx},${ny}`)) continue;
            const dist =
                fromX !== undefined && fromY !== undefined
                    ? Math.abs(nx - fromX) + Math.abs(ny - fromY)
                    : 0;
            if (dist < bestDist) {
                bestDist = dist;
                best = { x: nx, y: ny };
            }
        }
    }
    return best;
}

// Per-pawn "unreachable job" cooldown. A failed A* search to an unreachable target
// explores the whole connected map component — very expensive. Without this, an idle
// pawn that cannot reach its highest-priority job would claim → fail → release it every
// single tick, re-running that full-map search 60×/second (and ×N idle pawns). We instead
// remember the failure for UNREACHABLE_COOLDOWN_TICKS and skip the job until then.
const UNREACHABLE_COOLDOWN_TICKS = 60; // ~1 in-game second before retrying an unreachable job
const _unreachableJobs = new Map<string, Map<string, number>>(); // pawnId → (jobId → expiryTurn)

/**
 * Clear the module-level unreachable-job memory (D7). This Map is NOT part of GameState,
 * so without an explicit reset it survives save/load and new-game resets — stale entries
 * compared against a `turn` that resets can become permanent or expire instantly. Called
 * from the store init/load path whenever a fresh GameState is installed.
 */
export function resetUnreachableJobs(): void {
    _unreachableJobs.clear();
}

function isJobUnreachableForPawn(pawnId: string, jobId: string, turn: number): boolean {
    const expiry = _unreachableJobs.get(pawnId)?.get(jobId);
    return expiry !== undefined && expiry > turn;
}

function markJobUnreachable(pawnId: string, jobId: string, turn: number): void {
    let m = _unreachableJobs.get(pawnId);
    if (!m) {
        m = new Map();
        _unreachableJobs.set(pawnId, m);
    }
    // Prune expired entries so the map can't grow unbounded as job ids churn.
    if (m.size > 16) {
        for (const [id, exp] of m) if (exp <= turn) m.delete(id);
    }
    m.set(jobId, turn + UNREACHABLE_COOLDOWN_TICKS);
}

function tryAssignPath(pawn: Pawn, tx: number, ty: number, gameState: GameState): GameState | null {
    if (!pawn.position) return null;
    if (!wasmPathfinderService.isReady()) return null;
    if (isAdjacent(pawn.position.x, pawn.position.y, tx, ty)) return null;
    const occupied = occupancyService.blockedTiles(gameState, pawn.id);
    const approach = findAdjacentApproach(
        tx,
        ty,
        gameState.worldMap,
        occupied,
        pawn.position.x,
        pawn.position.y
    );
    if (!approach) return null;
    // Bodies are solid: route AROUND other pawns/mobs. The approach tile is kept
    // walkable (it was chosen as unoccupied), and the start tile too, so the pawn is
    // never blocked by itself.
    const { walkable, costs, width, height } = buildPathfindingGridsWithBlocked(
        gameState.worldMap,
        occupied,
        pawn.position.x,
        pawn.position.y,
        approach.x,
        approach.y
    );
    const path = wasmPathfinderService.findPath(
        walkable,
        costs,
        width,
        height,
        pawn.position.x,
        pawn.position.y,
        approach.x,
        approach.y
    );
    if (path.length === 0) return null;
    return pawnService.assignPath(pawn.id, path, gameState);
}

/**
 * Like tryAssignPath but paths the pawn directly TO (tx, ty) — used for beds
 * where the pawn should sleep ON the tile, not adjacent to it.
 */
function tryAssignSleepPath(
    pawn: Pawn,
    tx: number,
    ty: number,
    gameState: GameState
): GameState | null {
    if (!pawn.position) return null;
    if (!wasmPathfinderService.isReady()) return null;
    if (pawn.position.x === tx && pawn.position.y === ty) return null; // already on the bed
    // Route around other bodies; the bed tile (goal) and the pawn's own tile stay walkable.
    const blocked = occupancyService.blockedTiles(gameState, pawn.id);
    const { walkable, costs, width, height } = buildPathfindingGridsWithBlocked(
        gameState.worldMap,
        blocked,
        pawn.position.x,
        pawn.position.y,
        tx,
        ty
    );
    const path = wasmPathfinderService.findPath(
        walkable,
        costs,
        width,
        height,
        pawn.position.x,
        pawn.position.y,
        tx,
        ty
    );
    if (path.length === 0) return null;
    return pawnService.assignPath(pawn.id, path, gameState);
}

/** Quick check: is there any food available at all (no allocation). */
function hasAvailableFood(gs: GameState): boolean {
    return (
        gs.item.some((i) => {
            if (i.amount <= 0) return false;
            const def = ITEM_DEF_BY_ID.get(i.id);
            return def?.category === 'food' || (def?.nutrition ?? 0) > 0;
        }) ||
        Object.entries(gs.stockpile ?? {}).some(([id, amount]) => {
            if (amount <= 0) return false;
            const def = ITEM_DEF_BY_ID.get(id);
            return def?.category === 'food' || (def?.nutrition ?? 0) > 0;
        })
    );
}

type MealPortion = { source: 'item' | 'stockpile'; id: string; units: number };

/**
 * Select a balanced meal that brings the pawn to SAFE_HUNGER.
 * Takes the most nutritious food first, capped at MAX_UNITS_PER_FOOD_TYPE per type,
 * then supplements with less nutritious options if needed.
 */
function selectFoodForMeal(pawn: Pawn, gs: GameState): MealPortion[] {
    const hungerToSatisfy = Math.max(0, (pawn.needs?.hunger ?? 0) - SAFE_HUNGER);
    if (hungerToSatisfy <= 0) return [];

    type FoodOption = {
        source: 'item' | 'stockpile';
        id: string;
        available: number;
        nutrition: number;
    };
    const seenIds = new Set<string>();
    const options: FoodOption[] = [];

    for (const i of gs.item) {
        if (i.amount <= 0) continue;
        const def = ITEM_DEF_BY_ID.get(i.id);
        const nutrition = def?.nutrition ?? 0;
        if (def?.category !== 'food' && nutrition <= 0) continue;
        seenIds.add(i.id);
        options.push({ source: 'item', id: i.id, available: i.amount, nutrition });
    }
    for (const [id, amount] of Object.entries(gs.stockpile ?? {})) {
        if (amount <= 0 || seenIds.has(id)) continue;
        const def = ITEM_DEF_BY_ID.get(id);
        const nutrition = def?.nutrition ?? 0;
        if (def?.category !== 'food' && nutrition <= 0) continue;
        options.push({ source: 'stockpile', id, available: amount, nutrition });
    }

    options.sort((a, b) => b.nutrition - a.nutrition);

    const meal: MealPortion[] = [];
    let remaining = hungerToSatisfy;
    for (const food of options) {
        if (remaining <= 0) break;
        const hungerPerUnit = food.nutrition * HUNGER_PER_FOOD_UNIT;
        if (hungerPerUnit <= 0) continue;
        const unitsNeeded = Math.ceil(remaining / hungerPerUnit);
        const unitsTaken = Math.min(unitsNeeded, MAX_UNITS_PER_FOOD_TYPE, food.available);
        if (unitsTaken <= 0) continue;
        meal.push({ source: food.source, id: food.id, units: unitsTaken });
        remaining -= unitsTaken * hungerPerUnit;
    }
    return meal;
}

/** Consume a pre-selected meal, returning updated state and total hunger to recover. */
function consumeMeal(
    meal: MealPortion[],
    gs: GameState
): { state: GameState; hungerRecovered: number } {
    let state = gs;
    let hungerRecovered = 0;
    for (const { source, id, units } of meal) {
        const def = ITEM_DEF_BY_ID.get(id);
        hungerRecovered += (def?.nutrition ?? 0) * HUNGER_PER_FOOD_UNIT * units;
        if (source === 'item') {
            state = {
                ...state,
                item: state.item.map((i) =>
                    i.id === id ? { ...i, amount: Math.max(0, i.amount - units) } : i
                )
            };
        } else {
            // Use consumeFromStockpiles so both the aggregate and zone inventories stay in sync.
            state = consumeFromStockpiles(state, { [id]: units });
        }
    }
    return { state, hungerRecovered };
}

// Building type lists — module-level for use in helpers
const CAMPFIRE_TYPES = ['campfire'];
const REST_TYPES = ['lean_to_shelter', 'woodland_shelter', 'stone_hut', 'sleeping_spot', 'hay_bed'];

/** Phase 6: find the nearest complete storage building (campfire etc.) to a pawn. */
function findNearestStorageBuilding(
    pawn: Pawn,
    gs: GameState
): { x: number; y: number; buildingId: string } | null {
    if (!pawn.position) return null;
    let best: { x: number; y: number; buildingId: string; dist: number } | null = null;
    for (const b of gs.buildings ?? []) {
        if (b.status !== 'complete') continue;
        if (!CAMPFIRE_TYPES.includes(b.type)) continue;
        const dist = Math.abs(b.x - pawn.position.x) + Math.abs(b.y - pawn.position.y);
        if (!best || dist < best.dist) best = { x: b.x, y: b.y, buildingId: b.id, dist };
    }
    return best ? { x: best.x, y: best.y, buildingId: best.buildingId } : null;
}

/** Phase 6: find the best rest building for a pawn (assigned > quality > distance). */
function findNearestRestBuilding(
    pawn: Pawn,
    gs: GameState
): { x: number; y: number; buildingId: string } | null {
    if (!pawn.position) return null;
    // 1. Prefer a building specifically assigned to this pawn.
    const assigned = (gs.buildings ?? []).find(
        (b) => b.status === 'complete' && REST_TYPES.includes(b.type) && b.assignedPawnId === pawn.id
    );
    if (assigned) return { x: assigned.x, y: assigned.y, buildingId: assigned.id };
    // 2. Among unassigned buildings pick the highest quality one (distance as tie-break).
    //    Skip buildings owned by another pawn, and skip beds already occupied by a
    //    sleeping pawn (only one pawn per bed).
    let best: { x: number; y: number; buildingId: string; score: number } | null = null;
    for (const b of gs.buildings ?? []) {
        if (b.status !== 'complete') continue;
        if (!REST_TYPES.includes(b.type)) continue;
        if (b.assignedPawnId && b.assignedPawnId !== pawn.id) continue;
        // Exclusive occupancy: skip if another pawn is sleeping on this tile OR is already
        // en route to sleep here (MOVING_TO_NEED with targetState=SLEEPING).
        // Without the en-route check, all fatigued pawns simultaneously claim the same bed.
        if (
            gs.pawns.some(
                (p) =>
                    p.id !== pawn.id &&
                    ((p.currentState === PAWN_STATE.SLEEPING &&
                        p.position?.x === b.x &&
                        p.position?.y === b.y) ||
                        (p.currentState === PAWN_STATE.MOVING_TO_NEED &&
                            p.activeJob?.targetState === PAWN_STATE.SLEEPING &&
                            p.activeJob?.targetX === b.x &&
                            p.activeJob?.targetY === b.y))
            )
        )
            continue;
        const def = BUILDINGS_DB.find((d) => d.id === b.type);
        const quality = (def?.effects?.sleepQuality ?? 0) + (def?.effects?.fatigueRecovery ?? 0);
        const dist = Math.abs(b.x - pawn.position!.x) + Math.abs(b.y - pawn.position!.y);
        // Quality dominates; distance is a small tie-break penalty.
        const score = quality * 100 - dist * 0.01;
        if (!best || score > best.score) best = { x: b.x, y: b.y, buildingId: b.id, score };
    }
    return best ? { x: best.x, y: best.y, buildingId: best.buildingId } : null;
}

/** True when the pawn is adjacent to a lit campfire (better eating). */
function isAtFoodBuilding(pawn: Pawn, gs: GameState): boolean {
    if (!pawn.position) return false;
    return (gs.buildings ?? []).some(
        (b) =>
            b.status === 'complete' &&
            CAMPFIRE_TYPES.includes(b.type) &&
            isAdjacent(pawn.position!.x, pawn.position!.y, b.x, b.y)
    );
}

/** Returns the complete rest building the pawn is adjacent to, or null. */
function getRestBuildingAtPawn(pawn: Pawn, gs: GameState): PlacedBuilding | null {
    if (!pawn.position) return null;
    // Use dx<=1 && dy<=1 (includes same tile) so a pawn sleeping on the building
    // tile itself (e.g. exhaustion collapse) still receives the shelter bonus.
    return (
        (gs.buildings ?? []).find(
            (b) =>
                b.status === 'complete' &&
                REST_TYPES.includes(b.type) &&
                Math.abs(b.x - pawn.position!.x) <= 1 &&
                Math.abs(b.y - pawn.position!.y) <= 1
        ) ?? null
    );
}

/** True when the pawn is adjacent to a shelter (better sleep). */
function isAtRestBuilding(pawn: Pawn, gs: GameState): boolean {
    return getRestBuildingAtPawn(pawn, gs) !== null;
}

/**
 * Manhattan distance to the nearest food source (campfire).
 * Returns 0 when no campfire exists — pawn eats in-place, so food is always "here".
 * Returns Infinity when no food is available anywhere.
 */
function distToNearestFoodSource(pawn: Pawn, gs: GameState): number {
    if (!pawn.position) return Infinity;
    if (!hasAvailableFood(gs)) return Infinity;
    const building = findNearestStorageBuilding(pawn, gs);
    if (!building) return 0; // no campfire → eat in place
    return Math.abs(building.x - pawn.position.x) + Math.abs(building.y - pawn.position.y);
}

/**
 * Manhattan distance to the nearest rest source (shelter).
 * Returns 0 when no shelter exists — pawn sleeps in-place.
 */
function distToNearestRestSource(pawn: Pawn, gs: GameState): number {
    if (!pawn.position) return Infinity;
    const building = findNearestRestBuilding(pawn, gs);
    if (!building) return 0; // no shelter → sleep in place
    return Math.abs(building.x - pawn.position.x) + Math.abs(building.y - pawn.position.y);
}

/**
 * Manhattan distance from an arbitrary map point to the nearest food source (campfire).
 * Returns 0 when no campfire exists (eat in-place). Returns Infinity when no food available.
 */
export function distFromPointToNearestFoodSource(x: number, y: number, gs: GameState): number {
    if (!hasAvailableFood(gs)) return Infinity;
    let best = Infinity;
    for (const b of gs.buildings ?? []) {
        if (b.status !== 'complete') continue;
        if (!CAMPFIRE_TYPES.includes(b.type)) continue;
        const d = Math.abs(b.x - x) + Math.abs(b.y - y);
        if (d < best) best = d;
    }
    return best === Infinity ? 0 : best; // 0 = eat in place when no campfire exists
}

/**
 * Minimum Manhattan distance from any job in the pawn's soft queue to the nearest food source.
 * Returns null when the queue is empty or no food is available.
 * Jobs that are no longer in the pool or claimed by another pawn are skipped.
 */
export function computeMinQueueFoodDist(queueIds: string[], pawn: Pawn, gs: GameState): number | null {
    if (queueIds.length === 0 || !hasAvailableFood(gs)) return null;
    let min = Infinity;
    for (const id of queueIds) {
        const job = (gs.jobs ?? []).find(
            (j) => j.id === id && (j.claimedBy === null || j.claimedBy === pawn.id)
        );
        if (!job) continue;
        const d = distFromPointToNearestFoodSource(job.targetX, job.targetY, gs);
        if (d < min) min = d;
    }
    return min === Infinity ? null : min;
}

/**
 * Manhattan distance from an arbitrary map point to the nearest rest source (shelter).
 * Returns 0 when no shelter exists (sleep in-place), so rest is always reachable.
 */
export function distFromPointToNearestRestSource(x: number, y: number, gs: GameState): number {
    let best = Infinity;
    for (const b of gs.buildings ?? []) {
        if (b.status !== 'complete') continue;
        if (!REST_TYPES.includes(b.type)) continue;
        const d = Math.abs(b.x - x) + Math.abs(b.y - y);
        if (d < best) best = d;
    }
    return best === Infinity ? 0 : best; // 0 = sleep in place when no shelter exists
}

/**
 * Minimum Manhattan distance from any job in the pawn's soft queue to the nearest rest source.
 * Returns null when the queue is empty. Mirrors {@link computeMinQueueFoodDist} but for the
 * fatigue interrupt — D8 fixed the copy-paste that fed food distance into the rest threshold.
 */
export function computeMinQueueRestDist(queueIds: string[], pawn: Pawn, gs: GameState): number | null {
    if (queueIds.length === 0) return null;
    let min = Infinity;
    for (const id of queueIds) {
        const job = (gs.jobs ?? []).find(
            (j) => j.id === id && (j.claimedBy === null || j.claimedBy === pawn.id)
        );
        if (!job) continue;
        const d = distFromPointToNearestRestSource(job.targetX, job.targetY, gs);
        if (d < min) min = d;
    }
    return min === Infinity ? null : min;
}

/**
 * Compute the effective hunger/fatigue interrupt threshold for a working pawn,
 * incorporating two adjustments on top of the base threshold:
 *
 *  1. Work priority (laborLevel 1–4): higher-priority jobs resist interruption.
 *     Level 4 → +8 pts (harder). Level 1 → −4 pts (easier). Default level 2 → 0.
 *
 *  2. Queue food lookahead: if no upcoming task brings the pawn near food,
 *     lower the threshold slightly so they eat sooner rather than collapse later.
 *     minQueueFoodDist is the min(dist from any queued job → food).
 *     The farther that minimum is from food, the more the threshold drops (up to 5 pts).
 *
 * Result is clamped within ±12 pts of the base to prevent extreme values.
 */
export function computeAdjustedNeedThreshold(
    baseThreshold: number,
    laborLevel: number,
    minQueueFoodDist: number | null
): number {
    const priorityShift = (laborLevel - 2) * WORK_PRIORITY_THRESHOLD_SHIFT;
    // queueFoodPressure 0 = queue job right next to food; 1 = all jobs 20+ tiles from food
    const queueFoodPressure = minQueueFoodDist !== null ? Math.min(minQueueFoodDist / 20, 1) : 1; // no queue → full pressure (no known path to food)
    const queueShift = -(queueFoodPressure * QUEUE_FOOD_THRESHOLD_REDUCTION);
    return Math.max(
        baseThreshold - 12,
        Math.min(baseThreshold + 12, baseThreshold + priorityShift + queueShift)
    );
}

/**
 * Decides whether a busy pawn should interrupt their current activity to attend to a need.
 *
 * The formula combines two factors:
 *   1. Urgency  — how far past `threshold` the need has climbed (quadratic 0→1 curve)
 *   2. Proximity — how much further the need source is compared to the current job target
 *
 * At need = 100 the pawn always interrupts regardless of distance.
 * At need = threshold the pawn only detours if the source is within NEED_DETOUR_MIN_DIST tiles.
 * In between, the acceptable detour grows quadratically up to NEED_DETOUR_MAX_FACTOR × job distance.
 *
 * @param need         Current hunger or fatigue (0–100)
 * @param threshold    Adjusted trigger (already accounts for labor level + queue lookahead)
 * @param distToSource Manhattan distance to the nearest food / shelter
 * @param distToJob    Manhattan distance to the current job target (0 if already there)
 */
function shouldInterruptForNeed(
    need: number,
    threshold: number,
    distToSource: number,
    distToJob: number
): boolean {
    if (need >= 100) return true;
    if (need < threshold) return false;
    const urgency = (need - threshold) / (100 - threshold); // 0..1
    const urgencyBias = urgency * urgency; // quadratic: slow start, steep near 100%
    const effectiveJobDist = Math.max(distToJob, NEED_DETOUR_MIN_DIST);
    const maxAcceptableDist = effectiveJobDist * (1 + urgencyBias * (NEED_DETOUR_MAX_FACTOR - 1));
    return distToSource <= maxAcceptableDist;
}

function transitionTo(pawn: Pawn, state: PawnStateName, gs: GameState): GameState {
    const prev = pawn.currentState ?? PAWN_STATE.IDLE;
    if (prev !== state) {
        gameLogger.log(gs.turn, 'STATE-CHG', `${pawn.name} ${prev} → ${state}`);
    }
    return {
        ...gs,
        pawns: gs.pawns.map((p) => (p.id === pawn.id ? { ...p, currentState: state } : p))
    };
}

function goIdle(pawn: Pawn, gs: GameState): GameState {
    return {
        ...gs,
        pawns: gs.pawns.map((p) =>
            p.id === pawn.id
                ? { ...p, currentState: PAWN_STATE.IDLE, activeJob: undefined, isMoving: false, path: [] }
                : p
        )
    };
}

// ===== COMBAT STATE (COMBAT-SYSTEM) =====

/**
 * Nearest hostile mob this pawn should react to, or null. A `mob`-class creature
 * (goblins etc.) is always hostile; a neutral `animal` only counts once it has
 * actually turned aggressive (Alerted/Attacking) toward the colony.
 *
 * Detection range depends on stance: a "defensive" pawn reacts only once a hostile
 * is adjacent (it fights when drawn into melee), while "aggressive" and "flee" pawns
 * react anywhere inside their vision range.
 */
function findCombatThreat(pawn: Pawn, gs: GameState): Mob | null {
    if (!pawn.position || pawn.isAlive === false) return null;
    const stance = pawn.combatStance ?? 'defensive';
    const range = stance === 'defensive' ? 1 : pawnVisionTiles(pawn);
    const px = pawn.position.x;
    const py = pawn.position.y;
    let best: Mob | null = null;
    let bestDist = Infinity;
    for (const m of gs.mobs ?? []) {
        if (m.isAlive === false || m.state === 'Corpse') continue;
        const hostile = m.entityClass === 'mob' || m.state === 'Attacking' || m.state === 'Alerted';
        if (!hostile) continue;
        const d = Math.max(Math.abs(px - m.x), Math.abs(py - m.y));
        if (d <= range && d < bestDist) {
            best = m;
            bestDist = d;
        }
    }
    return best;
}

/** Stop a pawn's current movement in place (used when planting to fight). */
function haltMovement(pawn: Pawn, gs: GameState): GameState {
    if ((pawn.path?.length ?? 0) === 0 && !pawn.isMoving) return gs;
    return {
        ...gs,
        pawns: gs.pawns.map((p) =>
            p.id === pawn.id
                ? { ...p, path: [], isMoving: false, hasReachedDestination: false }
                : p
        )
    };
}

/**
 * FIGHTING: engage the hostile. Defensive pawns stand their ground (the threat is
 * adjacent by definition); aggressive pawns close the distance first. Pawns fight
 * until knocked down — there is no automatic pain-based retreat (that caused pawns
 * to break off fights they could win / disrupt crowd control). Exits to IDLE once
 * no hostile remains in range.
 */
function handleFighting(pawn: Pawn, gameState: GameState): GameState {
    const threat = findCombatThreat(pawn, gameState);
    if (!threat || !pawn.position) {
        return threat ? haltMovement(pawn, gameState) : transitionTo(pawn, PAWN_STATE.IDLE, gameState);
    }
    const adjacent = Math.max(Math.abs(pawn.position.x - threat.x), Math.abs(pawn.position.y - threat.y)) <= 1;
    if (adjacent) {
        // Stand and trade blows — combatService.tickCombat() resolves Fighting-pawn swings.
        return haltMovement(pawn, gameState);
    }
    // Not adjacent: only aggressive pawns chase a hostile down (defensive pawns only
    // ever see adjacent threats, so this is the aggressive-approach path).
    if ((pawn.combatStance ?? 'defensive') === 'aggressive') {
        if ((pawn.path?.length ?? 0) > 0) return gameState; // already approaching
        const afterPath = tryAssignPath(pawn, threat.x, threat.y, gameState);
        if (afterPath) return afterPath;
    }
    return haltMovement(pawn, gameState);
}

/**
 * FLEEING (flee stance only): break contact, pathing away from the nearest threat.
 * Stands down to IDLE once no hostile remains in vision range.
 */
function handleFleeing(pawn: Pawn, gameState: GameState): GameState {
    const threat = findCombatThreat(pawn, gameState);
    if (!threat) {
        return transitionTo(pawn, PAWN_STATE.IDLE, gameState);
    }
    if (!pawn.position) return gameState;
    // Already retreating — let processMovement carry it along the path.
    if ((pawn.path?.length ?? 0) > 0) return gameState;

    // Path to a tile away from the threat. Clamp to map bounds; if unreachable,
    // hold and fight rather than freeze uselessly.
    const mapH = gameState.worldMap.length;
    const mapW = mapH > 0 ? gameState.worldMap[0].length : 0;
    const dx = Math.sign(pawn.position.x - threat.x) || 1;
    const dy = Math.sign(pawn.position.y - threat.y) || 1;
    const fleeX = Math.max(0, Math.min(mapW - 1, pawn.position.x + dx * FLEE_DISTANCE));
    const fleeY = Math.max(0, Math.min(mapH - 1, pawn.position.y + dy * FLEE_DISTANCE));
    const afterPath = tryAssignSleepPath(pawn, fleeX, fleeY, gameState);
    if (afterPath) return afterPath;
    return haltMovement(pawn, gameState);
}

// ===== PER-PAWN STATE HANDLERS =====

// ===== HAULING HELPERS =====

/** Storage building types that accept deposited resources. */
const DEPOSIT_TYPES = [
    'storage_rack',
    'campfire',
    'lean_to_shelter',
    'woodland_shelter',
    'stone_hut',
    'sleeping_spot',
    'hay_bed'
];

/**
 * Find the nearest complete storage building to deposit hauled items.
 * Falls back to any complete building if no storage type found.
 * Returns null if no buildings exist (pawn will deposit in-place).
 */
function findNearestDepositPoint(pawn: Pawn, gs: GameState): { x: number; y: number } | null {
    if (!pawn.position) return null;
    const { x: px, y: py } = pawn.position;

    let best: { x: number; y: number; dist: number } | null = null;

    // First priority: stockpile zones designated on the map
    for (const [key, type] of Object.entries(gs.designations ?? {})) {
        if (type !== 'stockpile') continue;
        const [x, y] = key.split(',').map(Number);
        const dist = Math.abs(x - px) + Math.abs(y - py);
        if (!best || dist < best.dist) best = { x, y, dist };
    }
    if (best) return { x: best.x, y: best.y };

    // Second priority: designated storage building types
    for (const b of gs.buildings ?? []) {
        if (b.status !== 'complete') continue;
        if (!DEPOSIT_TYPES.includes(b.type)) continue;
        const dist = Math.abs(b.x - px) + Math.abs(b.y - py);
        if (!best || dist < best.dist) best = { x: b.x, y: b.y, dist };
    }
    if (best) return { x: best.x, y: best.y };

    // Fallback: any complete building
    for (const b of gs.buildings ?? []) {
        if (b.status !== 'complete') continue;
        const dist = Math.abs(b.x - px) + Math.abs(b.y - py);
        if (!best || dist < best.dist) best = { x: b.x, y: b.y, dist };
    }
    return best ? { x: best.x, y: best.y } : null;
}

// §D water-need routing thresholds (higher than the opportunistic auto-drink/wash at 70/75, so a
// pawn only abandons work to seek water when it's getting urgent) and relief amounts.
const ROUTE_TO_DRINK_THIRST = 82;
const ROUTE_TO_WASH_HYGIENE = 88;
const DRINK_NEED_RELIEF = 65;
const WASH_NEED_RELIEF = 70;

/**
 * §D: nearest place to satisfy a water need — a player-painted `drink`/`wash` zone tile (the way
 * the player controls where pawns go, exactly like stockpile drop-off), or for drinking a `well`
 * building. Mirrors findNearestDepositPoint (cheap: scans designations + buildings, not the map).
 */
function findNearestWaterTarget(
    pawn: Pawn,
    gs: GameState,
    kind: 'drink' | 'wash'
): { x: number; y: number } | null {
    if (!pawn.position) return null;
    const { x: px, y: py } = pawn.position;
    let best: { x: number; y: number; dist: number } | null = null;

    for (const [key, type] of Object.entries(gs.designations ?? {})) {
        if (type !== kind) continue;
        const [x, y] = key.split(',').map(Number);
        const dist = Math.abs(x - px) + Math.abs(y - py);
        if (!best || dist < best.dist) best = { x, y, dist };
    }
    if (best) return { x: best.x, y: best.y };

    if (kind === 'drink') {
        for (const b of gs.buildings ?? []) {
            if (b.status !== 'complete' || b.type !== 'well') continue;
            const dist = Math.abs(b.x - px) + Math.abs(b.y - py);
            if (!best || dist < best.dist) best = { x: b.x, y: b.y, dist };
        }
    }
    return best ? { x: best.x, y: best.y } : null;
}

/** §D: route a pawn to a drink/wash target via the MOVING_TO_NEED flow; null if none/unreachable. */
function tryRouteToWaterNeed(pawn: Pawn, gameState: GameState, kind: 'drink' | 'wash'): GameState | null {
    const target = findNearestWaterTarget(pawn, gameState, kind);
    if (!target || !pawn.position) return null;
    const targetState = kind === 'drink' ? PAWN_STATE.DRINKING : PAWN_STATE.WASHING;
    // Already there → don't move, just do it next turn.
    if (isAdjacent(pawn.position.x, pawn.position.y, target.x, target.y)) {
        return transitionTo(pawn, targetState, gameState);
    }
    const afterPath = tryAssignPath(pawn, target.x, target.y, gameState);
    if (!afterPath) return null;
    return {
        ...afterPath,
        pawns: afterPath.pawns.map((p) =>
            p.id === pawn.id
                ? {
                    ...p,
                    currentState: PAWN_STATE.MOVING_TO_NEED,
                    activeJob: {
                        type: 'need' as const,
                        targetX: target.x,
                        targetY: target.y,
                        progress: 0,
                        timeRequired: 1,
                        turnsInState: 0,
                        targetState
                    }
                }
                : p
        )
    };
}

/** §D: drink at the reached target — relieve thirst (consume stored water if any), then idle. */
function handleDrinking(pawn: Pawn, gameState: GameState): GameState {
    let state = gameState;
    if ((state.stockpile?.['water'] ?? 0) > 0) {
        state = consumeFromStockpiles(state, { water: 1 });
    }
    state = {
        ...state,
        pawns: state.pawns.map((p) =>
            p.id === pawn.id
                ? { ...p, needs: { ...p.needs, thirst: Math.max(0, (p.needs.thirst ?? 0) - DRINK_NEED_RELIEF), lastDrink: state.turn } }
                : p
        )
    };
    return goIdle(state.pawns.find((p) => p.id === pawn.id)!, state);
}

/** §D: wash at the reached target — relieve hygiene, then idle. */
function handleWashing(pawn: Pawn, gameState: GameState): GameState {
    const state = {
        ...gameState,
        pawns: gameState.pawns.map((p) =>
            p.id === pawn.id
                ? { ...p, needs: { ...p.needs, hygiene: Math.max(0, (p.needs.hygiene ?? 0) - WASH_NEED_RELIEF), lastWash: gameState.turn } }
                : p
        )
    };
    return goIdle(state.pawns.find((p) => p.id === pawn.id)!, state);
}

/** Transfer everything in pawn.inventory into the correct stockpile zone. */
function depositInventory(pawn: Pawn, gs: GameState): GameState {
    const inv = pawn.inventory?.items ?? {};
    if (Object.keys(inv).length === 0) return goIdle(pawn, gs);

    // Collect all stockpile tile coordinates.
    const stockpileTiles = Object.entries(gs.designations ?? {})
        .filter(([, t]) => t === 'stockpile')
        .map(([key]) => {
            const [x, y] = key.split(',').map(Number);
            return { key, x, y };
        });
    const stockpileTileKeys = new Set(stockpileTiles.map((t) => t.key));

    const newDropped = [...(gs.droppedItems ?? [])];
    // Track IDs of newly created unstored drops so we can trigger absorption below.
    const newDropIds: string[] = [];
    // Track which items landed on a physical tile (for fallback accounting).
    const placed = new Set<string>();

    for (const [resourceId, qty] of Object.entries(inv)) {
        if (qty <= 0) continue;

        // Prefer a tile that already holds this resource (stacking); otherwise a free tile.
        const existingStoredDrop = newDropped.find(
            (d) => d.stored && d.resourceId === resourceId && stockpileTileKeys.has(`${d.x},${d.y}`)
        );
        let tile: { x: number; y: number } | null = null;
        if (existingStoredDrop) {
            tile = { x: existingStoredDrop.x, y: existingStoredDrop.y };
        } else {
            const usedCoords = new Set(
                newDropped
                    .filter((d) => d.stored && stockpileTileKeys.has(`${d.x},${d.y}`))
                    .map((d) => `${d.x},${d.y}`)
            );
            const freeTile = stockpileTiles.find((t) => !usedCoords.has(t.key));
            if (freeTile) tile = { x: freeTile.x, y: freeTile.y };
        }

        if (tile) {
            // Create an UNSTORED drop at the tile — the absorption trigger below
            // will detect it, mark it stored, and credit the zone.
            const id = `deposit-${resourceId}-${Date.now()}-${rng.random().toString(36).slice(2, 5)}`;
            newDropIds.push(id);
            newDropped.push({ id, resourceId, x: tile.x, y: tile.y, quantity: qty, stored: false });
            placed.add(resourceId);
        }
    }

    const newPawns = gs.pawns.map((p) =>
        p.id === pawn.id
            ? {
                ...p,
                currentState: PAWN_STATE.IDLE,
                activeJob: undefined,
                inventory: {
                    ...(p.inventory ?? { items: {}, maxSlots: 20, currentSlots: 0 }),
                    items: {},
                    currentSlots: 0
                }
            }
            : p
    );

    gameLogger.log(gs.turn, 'JOB-EVT', `${pawn.name} deposited inventory: ${JSON.stringify(inv)}`);

    // Trigger-based absorption: each new drop sitting on a stockpile tile is absorbed
    // immediately — marked stored and credited to the zone — without a separate scan.
    let state: GameState = { ...gs, pawns: newPawns, droppedItems: newDropped };
    for (const id of newDropIds) {
        state = absorbDropIfOnStockpileTile(state, id);
    }

    // Fallback for items that had no available tile (rare): credit directly to the general zone.
    const unplaced: Record<string, number> = {};
    for (const [resourceId, qty] of Object.entries(inv)) {
        if (qty > 0 && !placed.has(resourceId)) unplaced[resourceId] = qty;
    }
    if (Object.keys(unplaced).length > 0) {
        state = addToStockpileZone(state, null, unplaced);
    }

    return state;
}

function handleHauling(pawn: Pawn, gameState: GameState): GameState {
    // Pawn just picked up an item and needs to find a deposit point
    const deposit = findNearestDepositPoint(pawn, gameState);
    if (!deposit) {
        // No building to deposit at — drop straight to stockpile
        return depositInventory(pawn, gameState);
    }

    const alreadyAdjacent =
        pawn.position && isAdjacent(pawn.position.x, pawn.position.y, deposit.x, deposit.y);

    if (alreadyAdjacent) {
        return depositInventory(pawn, gameState);
    }

    const afterPath = pawn.position ? tryAssignPath(pawn, deposit.x, deposit.y, gameState) : null;

    if (!afterPath) {
        return depositInventory(pawn, gameState);
    }

    return {
        ...afterPath,
        pawns: afterPath.pawns.map((p) =>
            p.id === pawn.id
                ? {
                    ...p,
                    currentState: PAWN_STATE.MOVING_TO_DEPOSIT,
                    activeJob: {
                        type: 'need' as const,
                        targetX: deposit.x,
                        targetY: deposit.y,
                        progress: 0,
                        timeRequired: 1,
                        depositX: deposit.x,
                        depositY: deposit.y
                    }
                }
                : p
        )
    };
}

function handleMovingToDeposit(pawn: Pawn, gameState: GameState): GameState {
    const activeJob = pawn.activeJob;
    if (!activeJob) return depositInventory(pawn, gameState);

    if (pawn.hasReachedDestination && pawn.position) {
        const adjacent = isAdjacent(
            pawn.position.x,
            pawn.position.y,
            activeJob.targetX,
            activeJob.targetY
        );
        if (adjacent) {
            return depositInventory(pawn, {
                ...gameState,
                pawns: gameState.pawns.map((p) =>
                    p.id === pawn.id ? { ...p, hasReachedDestination: false } : p
                )
            });
        }
        // Didn't quite make it — deposit in place anyway
        return depositInventory(pawn, gameState);
    }
    return gameState;
}

/**
 * Decrement temporary status effect durations and remove expired ones.
 */
function tickStatusEffectDurations(pawn: Pawn): Pawn {
    const durations = pawn.statusEffectDurations;
    if (!durations || Object.keys(durations).length === 0) return pawn;
    const next: Record<string, number> = {};
    for (const [key, val] of Object.entries(durations)) {
        const remaining = val - 1;
        if (remaining > 0) next[key] = remaining;
    }
    const changed = Object.keys(next).length !== Object.keys(durations).length ||
        Object.entries(next).some(([k, v]) => v !== durations[k]);
    if (!changed) return pawn;
    return { ...pawn, statusEffectDurations: next };
}

/**
 * Derive the pawn's activeEffects list from current state flags, needs, and durations.
 * Called after each tick so PawnService.calculateNeedsUpdate always reads fresh values.
 */
function syncActiveEffects(pawn: Pawn): Pawn {
    const effects: string[] = [];
    const isEating = pawn.state?.isEating || pawn.currentState === PAWN_STATE.EATING;
    const isSleeping = pawn.state?.isSleeping || pawn.currentState === PAWN_STATE.SLEEPING;

    if (isEating) effects.push('eating');
    if (isSleeping) effects.push('sleeping');
    // Only show need-state badges when the pawn is NOT already acting on them.
    // Eating supersedes hungry; sleeping supersedes tired.
    if (!isSleeping && (pawn.needs?.fatigue ?? 0) >= FATIGUE_THRESHOLD) effects.push('tired');
    if (!isEating && (pawn.needs?.hunger ?? 0) >= HUNGER_THRESHOLD) effects.push('hungry');

    // Duration-based status effects (knockdown, etc.)
    for (const [effectId, remaining] of Object.entries(pawn.statusEffectDurations ?? {})) {
        if (remaining > 0) effects.push(effectId);
    }

    // Mood-based status effects (discrete ranges replace continuous morale calculation)
    const mood = pawn.state?.mood ?? 50;
    if (mood >= 80) effects.push('mood_ecstatic');
    else if (mood >= 60) effects.push('mood_content');
    else if (mood >= 40) {
        /* neutral — no effect */
    } else if (mood >= 20) effects.push('mood_sad');
    else effects.push('mood_depressed');

    // Push condition stage labels as active effects (e.g. "malnutrition:moderate").
    for (const condition of pawn.conditions ?? []) {
        const stage = getConditionStage(condition.id, condition.severity);
        if (stage) effects.push(`${condition.id}:${stage.label}`);
    }

    const current = pawn.activeEffects ?? [];
    if (effects.length === current.length && effects.every((e, i) => e === current[i])) return pawn;
    return { ...pawn, activeEffects: effects };
}

// ===== PER-PAWN STATE HANDLERS =====

// ── Debug tick logger ─────────────────────────────────────────────────────────
/**
 * Writes a compact [PAWN-TICK] line to the file-backed gameLogger.
 * Suppressed for dead pawns.
 */
function logPawnTick(pawn: Pawn, gs: GameState): void {
    if (pawn.isAlive === false) return;
    // D9.5: skip all the per-pawn string assembly below when file logging is off.
    if (!gameLogger.isEnabled) return;

    const pos = pawn.position ? `(${pawn.position.x},${pawn.position.y})` : '(-,-)';
    const job = pawn.activeJob;
    const targetStr = job
        ? `(${job.targetX},${job.targetY}) [${job.type}${job.jobId ? `#${job.jobId.slice(-4)}` : ''}]`
        : 'none';

    const hunger = (pawn.needs?.hunger ?? 0).toFixed(1);
    const fatigue = (pawn.needs?.fatigue ?? 0).toFixed(1);
    const state = (pawn.currentState ?? 'Idle').padEnd(18);

    const queueLabels = (pawn.jobQueue ?? []).map((id) => {
        const j = (gs.jobs ?? []).find((j) => j.id === id);
        return j
            ? `${j.type}(${j.targetX},${j.targetY})${j.claimedBy && j.claimedBy !== pawn.id ? '!' : ''}`
            : `?${id.slice(-4)}`;
    });
    const queueStr = queueLabels.length ? queueLabels.join(' > ') : 'empty';

    gameLogger.log(
        gs.turn,
        'PAWN-TICK',
        `${pawn.name.padEnd(12)} ${state}` +
        ` H:${hunger.padStart(5)} F:${fatigue.padStart(5)}` +
        ` pos:${pos.padEnd(9)} → target:${targetStr.padEnd(30)}` +
        ` queue:[${queueStr}]`
    );
}

function tickPawn(pawn: Pawn, gameState: GameState): GameState {
    // Throttle file logging to every 30 turns (~0.5 s at 60 TPS) so PAWN-TICK
    // doesn't flood the buffer and bury ENTITY-STATE / MOB-SNAP lines.
    if (gameState.turn % 30 === 0) logPawnTick(pawn, gameState);
    const state = pawn.currentState ?? PAWN_STATE.IDLE;
    switch (state) {
        case PAWN_STATE.IDLE:
            return handleIdle(pawn, gameState);
        case PAWN_STATE.MOVING_TO_RESOURCE:
            return handleMovingToResource(pawn, gameState);
        case PAWN_STATE.WORKING:
            return handleWorking(pawn, gameState);
        case PAWN_STATE.HUNGRY:
            return handleHungry(pawn, gameState);
        case PAWN_STATE.TIRED:
            return handleTired(pawn, gameState);
        case PAWN_STATE.MOVING_TO_NEED:
            return handleMovingToNeed(pawn, gameState);
        case PAWN_STATE.EATING:
            return handleEating(pawn, gameState);
        case PAWN_STATE.SLEEPING:
            return handleSleeping(pawn, gameState);
        case PAWN_STATE.HAULING:
            return handleHauling(pawn, gameState);
        case PAWN_STATE.MOVING_TO_DEPOSIT:
            return handleMovingToDeposit(pawn, gameState);
        case PAWN_STATE.DRINKING:
            return handleDrinking(pawn, gameState);
        case PAWN_STATE.WASHING:
            return handleWashing(pawn, gameState);
        case PAWN_STATE.FIGHTING:
            return handleFighting(pawn, gameState);
        case PAWN_STATE.FLEEING:
            return handleFleeing(pawn, gameState);
        default:
            return gameState;
    }
}

function handleIdle(pawn: Pawn, gameState: GameState): GameState {
    if ((pawn.needs?.hunger ?? 0) >= HUNGER_THRESHOLD && hasAvailableFood(gameState)) {
        return transitionTo(pawn, PAWN_STATE.HUNGRY, gameState);
    }
    // §D water needs: when thirst/hygiene gets urgent and there's no stored water to drink in
    // place, walk to a player-painted drink/wash zone (or a well) and drink/wash there. Reuses the
    // MOVING_TO_NEED target+move flow (same as eating/hauling). Thirst takes priority — dehydration
    // kills faster than hunger.
    if ((pawn.needs?.thirst ?? 0) >= ROUTE_TO_DRINK_THIRST && (gameState.stockpile?.['water'] ?? 0) <= 0) {
        const routed = tryRouteToWaterNeed(pawn, gameState, 'drink');
        if (routed) return routed;
    }
    if ((pawn.needs?.hygiene ?? 0) >= ROUTE_TO_WASH_HYGIENE) {
        const routed = tryRouteToWaterNeed(pawn, gameState, 'wash');
        if (routed) return routed;
    }
    // Sleep if fatigued — pawn will collapse in-place if no shelter exists
    if ((pawn.needs?.fatigue ?? 0) >= FATIGUE_THRESHOLD) {
        return transitionTo(pawn, PAWN_STATE.TIRED, gameState);
    }

    // Don't pick jobs until the pathfinder is ready — prevents endless pick/release cycles
    if (!wasmPathfinderService.isReady()) return gameState;

    const availableJobs = jobService.getAvailableJobs(pawn, gameState);
    // Skip jobs this pawn recently failed to reach (see _unreachableJobs). Prevents an
    // unreachable target from triggering a full-map A* search every tick.
    const job = availableJobs.find((j) => !isJobUnreachableForPawn(pawn.id, j.id, gameState.turn));
    if (!job) return gameState;

    let gs = jobService.claimJob(pawn.id, job.id, gameState);

    const activeJob = {
        type: job.type as 'harvest' | 'construct' | 'craft' | 'haul',
        jobId: job.id,
        targetX: job.targetX,
        targetY: job.targetY,
        resourceId: job.resourceId,
        droppedItemId: job.droppedItemId,
        buildingId: job.buildingId,
        craftQueueId: job.craftQueueId,
        progress: 0,
        timeRequired: job.workRequired
    };

    const atSite =
        job.type === 'craft' ||
        (job.targetX === 0 && job.targetY === 0) || // abstract building placed off-map
        (pawn.position && isAdjacent(pawn.position.x, pawn.position.y, job.targetX, job.targetY));

    // Build a soft-preview queue of the next JOB_QUEUE_SIZE unclaimed jobs so that the
    // need-priority system can look ahead and decide when to eat/sleep more intelligently.
    const queuePreview = availableJobs
        .slice(1, 1 + JOB_QUEUE_SIZE)
        .filter((j) => j.claimedBy === null)
        .map((j) => j.id);

    if (atSite) {
        return {
            ...gs,
            pawns: gs.pawns.map((p) =>
                p.id === pawn.id
                    ? { ...p, currentState: PAWN_STATE.WORKING, activeJob, jobQueue: queuePreview }
                    : p
            )
        };
    }

    const afterPath = tryAssignPath(pawn, job.targetX, job.targetY, gs);
    if (!afterPath) {
        // Unreachable right now — cool the job down for this pawn so we don't re-run the
        // expensive failed pathfind every tick, then drop the claim.
        markJobUnreachable(pawn.id, job.id, gameState.turn);
        return jobService.releaseJob(pawn.id, job.id, gs);
    }

    return {
        ...afterPath,
        pawns: afterPath.pawns.map((p) =>
            p.id === pawn.id
                ? { ...p, currentState: PAWN_STATE.MOVING_TO_RESOURCE, activeJob, jobQueue: queuePreview }
                : p
        )
    };
}

/**
 * Shared hunger/fatigue interrupt check for a working OR en-route pawn (D9.2).
 *
 * Previously this ~35-line hunger block + ~35-line fatigue block were pasted into both
 * handleWorking and handleMovingToResource — four near-identical copies. That duplication
 * is exactly how D8 (the wrong distance fed to the fatigue threshold) slipped in: a fix to
 * one copy didn't reach the others. Extracting it means there is one place to get right.
 *
 * Returns the post-interrupt GameState (pawn transitioned to HUNGRY/TIRED, claimed job
 * released) when an interrupt fires, or null to continue. `label` only tags the debug log.
 */
function checkNeedInterrupts(
    pawn: Pawn,
    gameState: GameState,
    label: 'EnRoute' | 'Working',
    jobDist: number,
    queue: string[],
    laborLevel: number
): GameState | null {
    const jobId = pawn.activeJob?.jobId;

    const hunger = pawn.needs?.hunger ?? 0;
    if (hunger >= HUNGER_THRESHOLD && hasAvailableFood(gameState)) {
        const minQueueFood = computeMinQueueFoodDist(queue, pawn, gameState);
        const hungerThreshold = computeAdjustedNeedThreshold(HUNGER_THRESHOLD, laborLevel, minQueueFood);
        const foodDist = distToNearestFoodSource(pawn, gameState);
        const willInterrupt = shouldInterruptForNeed(hunger, hungerThreshold, foodDist, jobDist);
        gameLogger.log(
            gameState.turn,
            'NEED-CHECK',
            () =>
                `[${label}] ${pawn.name} H:${hunger.toFixed(1)}` +
                ` adjThr:${hungerThreshold.toFixed(1)} foodDist:${foodDist === Infinity ? '∞' : foodDist}` +
                ` jobDist:${jobDist} labor:${laborLevel} minQueueFood:${minQueueFood ?? 'null'}` +
                ` → ${willInterrupt ? 'INTERRUPT→EAT' : 'continue'}`
        );
        if (willInterrupt) {
            const gs = jobId ? jobService.releaseJob(pawn.id, jobId, gameState) : gameState;
            return transitionTo(pawn, PAWN_STATE.HUNGRY, gs);
        }
    }

    const fatigue = pawn.needs?.fatigue ?? 0;
    if (fatigue >= FATIGUE_THRESHOLD) {
        const minQueueRest = computeMinQueueRestDist(queue, pawn, gameState);
        const fatigueThreshold = computeAdjustedNeedThreshold(FATIGUE_THRESHOLD, laborLevel, minQueueRest);
        const restDist = distToNearestRestSource(pawn, gameState);
        const willInterrupt = shouldInterruptForNeed(fatigue, fatigueThreshold, restDist, jobDist);
        gameLogger.log(
            gameState.turn,
            'NEED-CHECK',
            () =>
                `[${label}] ${pawn.name} F:${fatigue.toFixed(1)}` +
                ` adjThr:${fatigueThreshold.toFixed(1)} restDist:${restDist === Infinity ? '∞' : restDist}` +
                ` jobDist:${jobDist} labor:${laborLevel}` +
                ` → ${willInterrupt ? 'INTERRUPT→SLEEP' : 'continue'}`
        );
        if (willInterrupt) {
            const gs = jobId ? jobService.releaseJob(pawn.id, jobId, gameState) : gameState;
            return transitionTo(pawn, PAWN_STATE.TIRED, gs);
        }
    }

    return null;
}

function handleMovingToResource(pawn: Pawn, gameState: GameState): GameState {
    const activeJob = pawn.activeJob;
    if (!activeJob || activeJob.type === 'need') return goIdle(pawn, gameState);

    const jobInPool = activeJob.jobId
        ? (gameState.jobs ?? []).find((j) => j.id === activeJob.jobId)
        : null;
    if (!jobInPool) return goIdle(pawn, gameState);

    // Dynamic need interruption while en route to a job.
    // Re-evaluated every turn so needs that arise mid-journey are caught early.
    // Both work priority and queue lookahead adjust when the pawn will divert.
    const enRouteDist = pawn.position
        ? Math.abs(activeJob.targetX - pawn.position.x) + Math.abs(activeJob.targetY - pawn.position.y)
        : 0;
    const enRouteQueue = pawn.jobQueue ?? [];
    const enRouteLaborLevel = jobService.getJobLaborLevel(jobInPool, pawn, gameState);

    const interrupted = checkNeedInterrupts(
        pawn,
        gameState,
        'EnRoute',
        enRouteDist,
        enRouteQueue,
        enRouteLaborLevel
    );
    if (interrupted) return interrupted;

    if (pawn.hasReachedDestination && pawn.position) {
        const adjacent = isAdjacent(
            pawn.position.x,
            pawn.position.y,
            activeJob.targetX,
            activeJob.targetY
        );
        if (adjacent) {
            return {
                ...gameState,
                pawns: gameState.pawns.map((p) =>
                    p.id === pawn.id
                        ? { ...p, currentState: PAWN_STATE.WORKING, hasReachedDestination: false }
                        : p
                )
            };
        }
        return goIdle(pawn, gameState);
    }
    return gameState;
}

function handleWorking(pawn: Pawn, gameState: GameState): GameState {
    const activeJob = pawn.activeJob;
    if (!activeJob || activeJob.type === 'need') return goIdle(pawn, gameState);

    const jobId = activeJob.jobId;
    if (!jobId) return goIdle(pawn, gameState);

    const jobInPool = (gameState.jobs ?? []).find((j) => j.id === jobId);
    if (!jobInPool) return goIdle(pawn, gameState);

    // Dynamic need interruption: weighs urgency against proximity to food/shelter vs job target.
    // The threshold is adjusted by work priority (high-priority jobs resist interruption more)
    // and job-queue lookahead (if no upcoming task passes near food, eat sooner).
    const jobDist = pawn.position
        ? Math.abs(activeJob.targetX - pawn.position.x) + Math.abs(activeJob.targetY - pawn.position.y)
        : 0;
    const queue = pawn.jobQueue ?? [];
    // Reuse jobInPool (found above) instead of scanning gameState.jobs a second time (D9.3).
    const laborLevel = jobService.getJobLaborLevel(jobInPool, pawn, gameState);

    const interrupted = checkNeedInterrupts(pawn, gameState, 'Working', jobDist, queue, laborLevel);
    if (interrupted) return interrupted;

    if (
        activeJob.type !== 'craft' &&
        !(activeJob.targetX === 0 && activeJob.targetY === 0) && // abstract building
        pawn.position &&
        !isAdjacent(pawn.position.x, pawn.position.y, activeJob.targetX, activeJob.targetY)
    ) {
        return jobService.releaseJob(pawn.id, jobId, goIdle(pawn, gameState));
    }

    // §G light → sight → work speed. Read the pawn's cached tile light (LightingService sets it
    // each turn: daylight/fires/torches raise it). It scales the `sight` capacity, which every
    // `*_speed` formula multiplies by — so darkness slows ALL work through the existing model.
    const tileLight = pawn.position
        ? (gameState.worldMap?.[pawn.position.y]?.[pawn.position.x]?.lightLevel ?? 1)
        : 1;
    const lightSightFactor = lightWorkMultiplier(tileLight);

    // Wire work speed into job advancement.
    const workCategory = jobService.getJobWorkCategory(activeJob, gameState);
    // Pass the light factor so construction's sight-based `*_speed` formula is genuinely dimmed.
    const workSpeedMult = pawnStatService.getWorkModifiers(pawn, workCategory, lightSightFactor).speed;
    // For harvest/craft/haul/etc. use the SAME unified work-efficiency the UI shows
    // (skill + stats + traits + equipment + buildings + needs/mood/health). Previously these
    // used only the stat-based foraging_speed formula, so a skilled forager was no faster than
    // an unskilled one and mood-reduced stats didn't slow work. Construction keeps its own
    // skill-scaled rate so building times are unchanged.
    let workPoints =
        activeJob.type === 'construct' || activeJob.type === 'deconstruct'
            ? // construction speed already runs through getWorkModifiers → the `*_speed` formula,
              // whose `× sight` term is now light-scaled (workSpeedMult below), so don't re-apply.
              Math.max(1, pawn.skills['skill_construction'] ?? 0) * workSpeedMult
            : // crafting/harvest speed comes from calculateWorkEfficiency (no capacities); apply the
              // SAME sight-light factor here so darkness slows it identically — one unified model.
              BASE_WORK_RATE *
              Math.max(0.1, modifierSystem.calculateWorkEfficiency(pawn.id, workCategory, gameState).totalValue) *
              lightSightFactor;
    // workPoints is authored as work-points PER SECOND; deliver one tick's worth so
    // a job authored as N seconds of work still takes N seconds of real time.
    const afterAdvance = jobService.advanceJob(jobId, perTick(workPoints), gameState);
    const jobStillExists = (afterAdvance.jobs ?? []).some((j) => j.id === jobId);

    if (!jobStillExists) {
        // Job complete. If pawn is now carrying items, enter HAULING state.
        const updatedPawn = afterAdvance.pawns.find((p) => p.id === pawn.id);
        const invItems = updatedPawn?.inventory?.items ?? {};
        const hasInventory = Object.values(invItems).some((v) => v > 0);
        gameLogger.log(
            afterAdvance.turn,
            'JOB-EVT',
            `${pawn.name} job-complete hasInventory:${hasInventory} inv:${JSON.stringify(invItems)}`
        );

        if (hasInventory) {
            // Transition to HAULING — handleHauling will run next turn and find a deposit point.
            // This ensures items are visible in the CARRYING section for at least one turn.
            gameLogger.log(
                afterAdvance.turn,
                'JOB-EVT',
                `${pawn.name} → HAULING inv:${JSON.stringify(invItems)}`
            );
            return {
                ...afterAdvance,
                pawns: afterAdvance.pawns.map((p) =>
                    p.id === pawn.id ? { ...p, currentState: PAWN_STATE.HAULING, activeJob: undefined } : p
                )
            };
        }

        return {
            ...afterAdvance,
            pawns: afterAdvance.pawns.map((p) =>
                p.id === pawn.id ? { ...p, currentState: PAWN_STATE.IDLE, activeJob: undefined } : p
            )
        };
    }

    const updatedJob = (afterAdvance.jobs ?? []).find((j) => j.id === jobId);
    const progress = updatedJob
        ? Math.min(1, updatedJob.workDone / updatedJob.workRequired)
        : activeJob.progress;

    return {
        ...afterAdvance,
        pawns: afterAdvance.pawns.map((p) =>
            p.id === pawn.id ? { ...p, activeJob: { ...activeJob, progress } } : p
        )
    };
}

function handleHungry(pawn: Pawn, gameState: GameState): GameState {
    const meal = selectFoodForMeal(pawn, gameState);
    if (meal.length === 0) {
        return transitionTo(pawn, PAWN_STATE.IDLE, gameState);
    }

    // Phase 6: try to pathfind to the nearest campfire — eat there for better recovery speed
    const storageBuilding = findNearestStorageBuilding(pawn, gameState);
    if (
        storageBuilding &&
        pawn.position &&
        !isAdjacent(pawn.position.x, pawn.position.y, storageBuilding.x, storageBuilding.y)
    ) {
        const afterPath = tryAssignPath(pawn, storageBuilding.x, storageBuilding.y, gameState);
        if (afterPath) {
            // Food is NOT consumed yet — it will be taken on arrival at the campfire.
            return {
                ...afterPath,
                pawns: afterPath.pawns.map((p) =>
                    p.id === pawn.id
                        ? {
                            ...p,
                            currentState: PAWN_STATE.MOVING_TO_NEED,
                            activeJob: {
                                type: 'need' as const,
                                targetX: storageBuilding.x,
                                targetY: storageBuilding.y,
                                progress: 0,
                                timeRequired: EATING_TURNS,
                                turnsInState: 0,
                                targetState: PAWN_STATE.EATING
                            }
                        }
                        : p
                )
            };
        }
    }

    // Eat in place: consume all selected food now, then sit and eat for EATING_TURNS_GROUND turns.
    const { state: afterMeal, hungerRecovered } = consumeMeal(meal, gameState);
    return {
        ...afterMeal,
        pawns: afterMeal.pawns.map((p) =>
            p.id === pawn.id
                ? {
                    ...p,
                    currentState: PAWN_STATE.EATING,
                    activeJob: {
                        type: 'need' as const,
                        targetX: p.position?.x ?? 0,
                        targetY: p.position?.y ?? 0,
                        progress: 0,
                        timeRequired: EATING_TURNS_GROUND,
                        turnsInState: 0,
                        hungerToRecover: hungerRecovered
                    }
                }
                : p
        )
    };
}

function handleTired(pawn: Pawn, gameState: GameState): GameState {
    // Seek the assigned/nearest bed and walk ON to its tile to sleep.
    // Only one pawn can occupy a bed at a time (findNearestRestBuilding skips occupied ones).
    const restBuilding = findNearestRestBuilding(pawn, gameState);
    if (restBuilding && pawn.position) {
        const atBed = pawn.position.x === restBuilding.x && pawn.position.y === restBuilding.y;
        if (!atBed) {
            const afterPath = tryAssignSleepPath(pawn, restBuilding.x, restBuilding.y, gameState);
            if (afterPath) {
                return {
                    ...afterPath,
                    pawns: afterPath.pawns.map((p) =>
                        p.id === pawn.id
                            ? {
                                ...p,
                                currentState: PAWN_STATE.MOVING_TO_NEED,
                                activeJob: {
                                    type: 'need' as const,
                                    targetX: restBuilding.x,
                                    targetY: restBuilding.y,
                                    progress: 0,
                                    timeRequired: SLEEPING_TURNS,
                                    turnsInState: 0,
                                    targetState: PAWN_STATE.SLEEPING
                                }
                            }
                            : p
                    )
                };
            }
            // Bed unreachable this tick — hold in TIRED and retry next tick.
            // Exhaustion-collapse guard in tick() will force sleep at fatigue=100.
            gameLogger.log(
                gameState.turn,
                'NEED-CHECK',
                `${pawn.name} TIRED: bed at (${restBuilding.x},${restBuilding.y}) unreachable this tick, retrying`
            );
            return gameState;
        }
        // Already standing on the bed tile — sleep here.
    }

    // No bed available, or already on the bed tile: sleep at current position.
    // When sleeping on a bed, store the bed's coordinates as the job target so
    // the UI and handleSleeping can identify which bed the pawn is using.
    const sleepTargetX = restBuilding?.x ?? pawn.position?.x ?? 0;
    const sleepTargetY = restBuilding?.y ?? pawn.position?.y ?? 0;
    return {
        ...gameState,
        pawns: gameState.pawns.map((p) =>
            p.id === pawn.id
                ? {
                    ...p,
                    currentState: PAWN_STATE.SLEEPING,
                    path: [],
                    isMoving: false,
                    activeJob: {
                        type: 'need' as const,
                        targetX: sleepTargetX,
                        targetY: sleepTargetY,
                        progress: 0,
                        timeRequired: SLEEPING_TURNS,
                        turnsInState: 0
                    }
                }
                : p
        )
    };
}

function handleMovingToNeed(pawn: Pawn, gameState: GameState): GameState {
    const activeJob = pawn.activeJob;
    if (!activeJob) return goIdle(pawn, gameState);
    if (pawn.hasReachedDestination && pawn.position) {
        const targetState = (activeJob.targetState ?? PAWN_STATE.EATING) as PawnStateName;
        if (targetState === PAWN_STATE.EATING) {
            // Arrived at campfire — now select and consume the full meal, then start eating.
            const meal = selectFoodForMeal(pawn, gameState);
            if (meal.length === 0) return goIdle(pawn, gameState);
            const { state: afterMeal, hungerRecovered } = consumeMeal(meal, gameState);
            return {
                ...afterMeal,
                pawns: afterMeal.pawns.map((p) =>
                    p.id === pawn.id
                        ? {
                            ...p,
                            currentState: PAWN_STATE.EATING,
                            hasReachedDestination: false,
                            activeJob: {
                                ...activeJob,
                                timeRequired: EATING_TURNS,
                                turnsInState: 0,
                                hungerToRecover: hungerRecovered
                            }
                        }
                        : p
                )
            };
        }
        return {
            ...gameState,
            pawns: gameState.pawns.map((p) =>
                p.id === pawn.id
                    ? {
                        ...p,
                        currentState: targetState,
                        hasReachedDestination: false,
                        // Arrived — stop any residual movement so we don't sleepwalk past the tile.
                        path: [],
                        isMoving: false
                    }
                    : p
            )
        };
    }
    return gameState;
}

function handleEating(pawn: Pawn, gameState: GameState): GameState {
    const activeJob = pawn.activeJob;
    const turnsInState = (activeJob?.turnsInState ?? 0) + 1;
    const eatDuration = activeJob?.timeRequired ?? EATING_TURNS_GROUND;
    // Distribute the pre-paid hunger recovery evenly over the eating duration.
    const totalHunger = activeJob?.hungerToRecover ?? 0;
    const hungerRecoveryThisTurn = totalHunger / eatDuration;
    const newHunger = Math.max(0, (pawn.needs?.hunger ?? 50) - hungerRecoveryThisTurn);

    const updatedNeeds = {
        ...(pawn.needs ?? { hunger: 0, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0 }),
        hunger: newHunger,
        lastMeal: gameState.turn
    };
    const updatedState = {
        ...(pawn.state ?? {
            mood: 50,
            health: 100,
            isWorking: false,
            isSleeping: false,
            isEating: false
        }),
        isEating: turnsInState < eatDuration
    };

    if (turnsInState >= eatDuration) {
        return {
            ...gameState,
            pawns: gameState.pawns.map((p) =>
                p.id === pawn.id
                    ? {
                        ...p,
                        needs: updatedNeeds,
                        state: updatedState,
                        currentState: PAWN_STATE.IDLE,
                        activeJob: undefined
                    }
                    : p
            )
        };
    }

    return {
        ...gameState,
        pawns: gameState.pawns.map((p) =>
            p.id === pawn.id
                ? {
                    ...p,
                    needs: updatedNeeds,
                    state: updatedState,
                    activeJob: activeJob
                        ? { ...activeJob, turnsInState, progress: turnsInState / eatDuration }
                        : undefined
                }
                : p
        )
    };
}

function handleSleeping(pawn: Pawn, gameState: GameState): GameState {
    const activeJob = pawn.activeJob;
    const turnsInState = (activeJob?.turnsInState ?? 0) + 1;
    const restBuilding = getRestBuildingAtPawn(pawn, gameState);
    const def = restBuilding ? BUILDINGS_DB.find((d) => d.id === restBuilding.type) : null;
    // Recovery = base ground rate + building's quality bonus.
    // sleeping_spot (sleepQuality:0.1) → 0.58+0.10=0.68; hay_bed (fatigueRecovery:0.3) → 0.58+0.30=0.88.
    const shelterBonus = restBuilding
        ? (def?.effects?.fatigueRecovery ?? def?.effects?.sleepQuality ?? 0)
        : 0;
    const fatigueRecovery = FATIGUE_PER_SLEEPING_GROUND + shelterBonus;
    const sleepDuration = restBuilding ? SLEEPING_TURNS : SLEEPING_TURNS_GROUND; // for progress bar only
    // fatigueRecovery is a per-second rate; apply one tick's worth each step.
    const newFatigue = Math.max(0, (pawn.needs?.fatigue ?? 50) - perTick(fatigueRecovery));
    const newSleep = Math.max(0, (pawn.needs?.sleep ?? 50) - perTick(fatigueRecovery));

    // Wake when fatigue drops to the threshold for current hunger level.
    // Fed pawns sleep to 0 (full rest). Hungry pawns wake at 30 so they can eat,
    // but won't immediately re-sleep since 30 < FATIGUE_THRESHOLD (72).
    const wakeThreshold =
        (pawn.needs?.hunger ?? 0) >= HUNGER_THRESHOLD
            ? SLEEP_WAKE_THRESHOLD_HUNGRY
            : SLEEP_WAKE_THRESHOLD_FED;
    const shouldWake = newFatigue <= wakeThreshold;

    const updatedNeeds = {
        ...(pawn.needs ?? { hunger: 0, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0 }),
        fatigue: newFatigue,
        sleep: newSleep,
        lastSleep: gameState.turn
    };
    const updatedState = {
        ...(pawn.state ?? {
            mood: 50,
            health: 100,
            isWorking: false,
            isSleeping: false,
            isEating: false
        }),
        isSleeping: !shouldWake,
        isEating: false // can't be eating while sleeping
    };

    if (shouldWake) {
        return {
            ...gameState,
            pawns: gameState.pawns.map((p) =>
                p.id === pawn.id
                    ? {
                        ...p,
                        needs: updatedNeeds,
                        state: updatedState,
                        currentState: PAWN_STATE.IDLE,
                        activeJob: undefined
                    }
                    : p
            )
        };
    }

    return {
        ...gameState,
        pawns: gameState.pawns.map((p) =>
            p.id === pawn.id
                ? {
                    ...p,
                    needs: updatedNeeds,
                    state: updatedState,
                    activeJob: activeJob
                        ? { ...activeJob, turnsInState, progress: turnsInState / sleepDuration }
                        : undefined
                }
                : p
        )
    };
}

// ===== STATE MACHINE SERVICE =====

class PawnStateMachineImpl {
    /**
     * Run one turn tick for every pawn.
     * Called from GameEngineImpl.processPawns() AFTER processMovement().
     */
    tick(gameState: GameState): GameState {
        // Periodic map snapshot every 60 turns (~1 s at 60 TPS).
        if (gameState.turn % 60 === 0) gameLogger.logMapSnap(gameState);

        let state = gameState;
        for (const pawn of state.pawns) {
            const current = state.pawns.find((p) => p.id === pawn.id);
            if (!current) continue;
            // Skip dead pawns entirely.
            if (current.isAlive === false) continue;

            // Drafted pawns are player-controlled: skip AI state machine entirely.
            // They still tick conditions (bleeding, etc.) but won't auto-eat/sleep/work.
            // Release any job they still claim so a living, undrafted pawn can take it —
            // otherwise the claim leaks for as long as the pawn stays drafted.
            if (current.drafted) {
                if (current.activeJob || (state.jobs ?? []).some((j) => j.claimedBy === current.id)) {
                    const jobs = (state.jobs ?? []).map((j) =>
                        j.claimedBy === current.id ? { ...j, claimedBy: null } : j
                    );
                    state = {
                        ...state,
                        jobs,
                        pawns: state.pawns.map((p) =>
                            p.id === current.id ? { ...p, activeJob: undefined } : p
                        )
                    };
                }
                continue;
            }

            // Periodic caretaking: the colony's best available medic tends this pawn's
            // untended wounds (skipped mid-fight). Runs before conditions so infection
            // sees fresh treatment, and before healing so the tend boost applies.
            const inMeleeNow =
                current.currentState === PAWN_STATE.FIGHTING ||
                current.currentState === PAWN_STATE.FLEEING;
            let toTick = current;
            if (!inMeleeNow && state.turn % CARE_CONFIG.tendIntervalTicks === 0) {
                const afterTend = tendWounds(current, state);
                if (afterTend !== state) {
                    state = afterTend;
                    toTick = state.pawns.find((p) => p.id === pawn.id) ?? current;
                }
            }

            // Tick conditions (malnutrition, blood loss, infection, limb checks) — may kill pawn.
            state = tickConditions(toTick, state);
            // Re-fetch pawn in case tickConditions updated it.
            let afterConditions = state.pawns.find((p) => p.id === pawn.id);
            if (!afterConditions || afterConditions.isAlive === false) continue;

            // ── Wound healing + collapse lifecycle (COMBAT-SYSTEM) ────────────────
            // Pain is the sum of active wounds, so a pawn recovers by mending them — but
            // not mid-fight (wounds don't knit while trading blows), so a sustained brawl
            // still marches to collapse. A collapsed pawn is down until pain subsides.
            const inMelee =
                afterConditions.currentState === PAWN_STATE.FIGHTING ||
                afterConditions.currentState === PAWN_STATE.FLEEING;
            if (!inMelee) {
                const healed = healWounds(afterConditions, state.turn);
                if (healed !== afterConditions) {
                    afterConditions = healed;
                    state = {
                        ...state,
                        pawns: state.pawns.map((p) => (p.id === pawn.id ? healed : p))
                    };
                }
            }
            const consciousness =
                pawnStatService.computeCapacities(afterConditions).consciousness ?? 1;

            if (afterConditions.currentState === PAWN_STATE.COLLAPSED) {
                const durations = { ...(afterConditions.statusEffectDurations ?? {}) };
                let downed: Pawn;
                if (consciousness >= RECOVER_CONSCIOUSNESS) {
                    delete durations.collapse; // recovered — stand back up
                    downed = {
                        ...afterConditions,
                        currentState: PAWN_STATE.IDLE,
                        statusEffectDurations: durations
                    };
                } else {
                    durations.collapse = Math.max(durations.collapse ?? 0, 2); // keep it active
                    downed = { ...afterConditions, statusEffectDurations: durations };
                }
                state = {
                    ...state,
                    pawns: state.pawns.map((p) => (p.id === pawn.id ? syncActiveEffects(downed) : p))
                };
                continue;
            }

            if (consciousness < COLLAPSE_CONSCIOUSNESS) {
                // Enter collapse: drop the job, halt, and go down.
                const jobs = (state.jobs ?? []).some((j) => j.claimedBy === afterConditions.id)
                    ? (state.jobs ?? []).map((j) =>
                          j.claimedBy === afterConditions.id ? { ...j, claimedBy: null } : j
                      )
                    : state.jobs;
                const durations = { ...(afterConditions.statusEffectDurations ?? {}) };
                durations.collapse = Math.max(durations.collapse ?? 0, 2);
                const downed = syncActiveEffects({
                    ...afterConditions,
                    currentState: PAWN_STATE.COLLAPSED,
                    activeJob: undefined,
                    path: [],
                    isMoving: false,
                    hasReachedDestination: false,
                    statusEffectDurations: durations
                });
                state = {
                    ...state,
                    jobs,
                    pawns: state.pawns.map((p) => (p.id === pawn.id ? downed : p))
                };
                continue;
            }

            let forCollapse = afterConditions;

            // ── Combat interrupt (top priority): a hostile is within aggro range. ──
            // Drop the current job and switch to a combat state so the pawn defends
            // itself instead of walking off to work. While already in a combat state we
            // leave path/movement to the handler (so a fleeing pawn can keep retreating).
            const threat = findCombatThreat(forCollapse, state);
            if (threat) {
                const inCombat =
                    forCollapse.currentState === PAWN_STATE.FIGHTING ||
                    forCollapse.currentState === PAWN_STATE.FLEEING;
                const desired =
                    (forCollapse.combatStance ?? 'defensive') === 'flee'
                        ? PAWN_STATE.FLEEING
                        : PAWN_STATE.FIGHTING;
                if (!inCombat) {
                    // Entering combat: release any claimed job and plant in place.
                    const jobs =
                        forCollapse.activeJob ||
                        (state.jobs ?? []).some((j) => j.claimedBy === forCollapse.id)
                            ? (state.jobs ?? []).map((j) =>
                                  j.claimedBy === forCollapse.id ? { ...j, claimedBy: null } : j
                              )
                            : state.jobs;
                    forCollapse = {
                        ...forCollapse,
                        currentState: desired,
                        activeJob: undefined,
                        path: [],
                        isMoving: false,
                        hasReachedDestination: false
                    };
                    state = {
                        ...state,
                        jobs,
                        pawns: state.pawns.map((p) => (p.id === pawn.id ? forCollapse : p))
                    };
                } else if (forCollapse.currentState !== desired) {
                    // Switch between fighting/fleeing without clobbering an active flee path.
                    forCollapse = { ...forCollapse, currentState: desired };
                    state = {
                        ...state,
                        pawns: state.pawns.map((p) => (p.id === pawn.id ? forCollapse : p))
                    };
                }
                // Run the combat handler and tick status effects, then move to next pawn —
                // skip the need/work state machine entirely while a threat is present.
                state = tickPawn(forCollapse, state);
                const afterCombat = state.pawns.find((p) => p.id === pawn.id);
                if (afterCombat) {
                    const stepped = tickStatusEffectDurations(afterCombat);
                    const synced = syncActiveEffects(stepped);
                    if (synced !== afterCombat) {
                        state = {
                            ...state,
                            pawns: state.pawns.map((p) => (p.id === pawn.id ? synced : p))
                        };
                    }
                }
                continue;
            }

            // Exhaustion collapse: fatigue >= 100 → force sleeping on the ground.
            if (
                (forCollapse.needs?.fatigue ?? 0) >= 100 &&
                forCollapse.currentState !== PAWN_STATE.SLEEPING
            ) {
                forCollapse = {
                    ...forCollapse,
                    currentState: PAWN_STATE.SLEEPING,
                    activeJob: undefined,
                    // Stop movement on collapse — otherwise processMovement keeps walking the
                    // pawn along its old path while it's shown sleeping ("sleepwalking").
                    path: [],
                    isMoving: false,
                    hasReachedDestination: false,
                    state: { ...forCollapse.state, isSleeping: true, isWorking: false, isEating: false }
                };
                state = { ...state, pawns: state.pawns.map((p) => (p.id === pawn.id ? forCollapse : p)) };
            }

            // Run state machine for this pawn.
            state = tickPawn(forCollapse, state);
            // Tick status effect durations, then sync activeEffects so PawnService reads fresh values.
            const updated = state.pawns.find((p) => p.id === pawn.id);
            if (updated) {
                let stepped = tickStatusEffectDurations(updated);
                const synced = syncActiveEffects(stepped);
                if (synced !== stepped) {
                    state = { ...state, pawns: state.pawns.map((p) => (p.id === pawn.id ? synced : p)) };
                } else if (stepped !== updated) {
                    state = { ...state, pawns: state.pawns.map((p) => (p.id === pawn.id ? stepped : p)) };
                }
            }
        }
        return state;
    }
}

export const pawnStateMachineService = new PawnStateMachineImpl();
