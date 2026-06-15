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
  ConditionDef,
  ConditionStage,
  Injury,
  LimbState,
  DroppedItem,
  DeadPawnRecord
} from '../core/types';
import { recomputeWound } from './Combat';
import { HEALING_CONFIG, CARE_CONFIG, woundById } from '../core/Wounds';
import { consumeFromStockpiles } from '../core/GameState';
import conditionsData from '../database/conditions.jsonc';
import { itemService } from '../services/ItemService';
import { pawnStatService } from '../services/PawnStatService';
import { simLog } from '../core/logSink';
import { gameLogger } from '../dev/gameLogger';
import { perTick } from '../core/time';
import { calcBloodRegenRate } from '../entities/Pawns';
import { rng } from '../core/rng';
import { pawnById } from '../core/pawnIndex';

// The pawn AI was decomposed out of this file (hotspot 2026-06-13): the 15 state handlers live in
// `pawn/handlers/{work,needs,combat}.ts`, the shared orchestration helpers + tuning constants in
// `pawn/pawnHelpers.ts`, the stateless queries in `pawn/pawnQueries.ts`, and the state enum in
// `pawn/pawnStates.ts`. What remains here is the health/lifecycle block + the per-pawn dispatcher.
import { PAWN_STATE, type PawnStateName } from './pawn/pawnStates';
import { findCombatThreat, HUNGER_THRESHOLD, FATIGUE_THRESHOLD } from './pawn/pawnHelpers';
import {
  handleIdle,
  handleMovingToResource,
  handleWorking,
  handleHauling,
  handleMovingToDeposit
} from './pawn/handlers/work';
import {
  handleHungry,
  handleTired,
  handleMovingToNeed,
  handleEating,
  handleSleeping,
  handleDrinking,
  handleWashing
} from './pawn/handlers/needs';
import { handleFighting, handleFleeing, handleHunting } from './pawn/handlers/combat';
// Re-exported for external consumers that imported them from this module historically.
export { PAWN_STATE, type PawnStateName };
export { resetUnreachableJobs } from './pawn/pawnHelpers';

/** RimWorld-style staggered AI (ENGINE-PERFORMANCE): a pawn NOT already in combat re-scans for
 *  threats once every N ticks (offset per pawn so the scans spread across ticks), instead of the
 *  whole colony scanning every tick (findCombatThreat was ~180 calls/tick — the combat-active
 *  spike). 6 ticks ≈ 0.1s max reaction delay, imperceptible; pawns already FIGHTING/FLEEING still
 *  scan every tick (live targeting + exit-when-clear is the combat handler's job). */
const COMBAT_SCAN_INTERVAL = 6;

/** Consciousness (0–1) below which a pawn collapses (matches Combat.COLLAPSE_CONSCIOUSNESS).
 *  Folds in pain + blood loss + organ damage, so downing has one unified cause. */
const COLLAPSE_CONSCIOUSNESS = 0.3;
/** A collapsed pawn stands back up once consciousness recovers above this. */
const RECOVER_CONSCIOUSNESS = 0.45;

// ===== CONDITION CONSTANTS (SURVIVAL-HEALTH spec) =====
const CONDITIONS_DB = conditionsData as unknown as ConditionDef[];
// Need-driven condition tuning (malnutrition ← hunger, dehydration ← thirst) now lives on each
// condition's `driver` block in conditions.jsonc — read generically by applyConditionDriver below.
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
 * Kill a pawn: finalise the death (corpse + gear drop, DeadPawnRecord, survivor mood, job
 * release) and log it. The dead pawn stays in pawns[] flagged `corpseDropped` until the
 * end-of-turn reaper (`reapDeadPawns`) removes it from the array.
 */
export function killPawn(
  pawn: Pawn,
  cause: DeadPawnRecord['cause'],
  gameState: GameState
): GameState {
  simLog.logActivity({
    turn: gameState.turn,
    type: 'event',
    actor: pawn.id,
    action: 'died',
    target: cause,
    result: `${pawn.name} has died of ${cause.replace('_', ' ')}.`,
    severity: 'critical'
  });
  return finalizePawnDeath(pawn, cause, gameState);
}

/**
 * Drop a dead pawn's corpse + carried/equipped goods, record the death, apply the survivor
 * mood penalty, release its claimed jobs, and flag it `corpseDropped`. Shared by `killPawn`
 * (need/condition deaths) and `reapDeadPawns` (combat deaths that bypassed `killPawn`). Does
 * NOT log — callers that already logged (combat) skip the activity entry.
 */
function finalizePawnDeath(
  pawn: Pawn,
  cause: DeadPawnRecord['cause'],
  gameState: GameState
): GameState {
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

  // R10: a slain pawn leaves its carried goods, equipped gear, and a corpse on the death tile so
  // they re-enter the economy (permadeath must not silently delete the colony's best equipment).
  // The dead pawn's inventory/equipment are cleared (now physically on the ground).
  const pos = pawn.position;
  const newDrops: DroppedItem[] = [];
  if (pos) {
    const tag = `${pawn.id}-${gameState.turn}`;
    for (const [resourceId, qty] of Object.entries(pawn.inventory?.items ?? {})) {
      if (qty > 0)
        newDrops.push({
          id: `death-${tag}-${resourceId}`,
          resourceId,
          x: pos.x,
          y: pos.y,
          quantity: qty
        });
    }
    const droppedInstances = [
      ...(pawn.inventory?.instances ?? []),
      ...Object.values(pawn.equipment ?? {}).filter((i): i is NonNullable<typeof i> => !!i)
    ];
    for (const inst of droppedInstances) {
      newDrops.push({
        id: `death-${tag}-${inst.instanceId}`,
        resourceId: inst.itemId,
        x: pos.x,
        y: pos.y,
        quantity: 1,
        instance: inst
      });
    }
    // The corpse itself, with a dynamic per-instance name ("<Name>'s Corpse").
    newDrops.push({
      id: `corpse-${tag}`,
      resourceId: 'pawn_carcass',
      x: pos.x,
      y: pos.y,
      quantity: 1,
      name: itemService.makeDynamicName('pawn_carcass', pawn.name)
    });
  }

  // Apply mood penalty to all living pawns
  const pawns = gameState.pawns.map((p) => {
    if (p.id === pawn.id) {
      return {
        ...p,
        isAlive: false,
        corpseDropped: true,
        currentState: 'Dead',
        activeJob: undefined,
        path: [],
        isMoving: false,
        // Gear is on the ground now — clear it off the corpse-pawn so it isn't duplicated.
        equipment: {},
        inventory: p.inventory ? { ...p.inventory, items: {}, instances: [] } : p.inventory
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
    droppedItems: [...(gameState.droppedItems ?? []), ...newDrops],
    deadPawns: [...(gameState.deadPawns ?? []), deadRecord]
  };
}

/**
 * End-of-turn death reaper. Two jobs:
 *  1. **Finalise combat deaths.** `Combat.ts` kills a pawn by setting `isAlive=false` directly
 *     (it can't import `killPawn` — that would cycle), so such a pawn reaches here un-finalised
 *     (`corpseDropped` falsy): drop its corpse + gear, record it, dock survivor mood. Combat
 *     already logged the kill, so this path stays silent.
 *  2. **Reap.** Remove every dead pawn from `pawns[]` so it leaves all UI (entity list, work
 *     grid, selection). The death lives on only in `deadPawns` + the dropped corpse/gear.
 * No-op (returns the same reference) when no dead pawns are present — cheap to call every turn.
 */
export function reapDeadPawns(gameState: GameState): GameState {
  if (!gameState.pawns.some((p) => p.isAlive === false)) return gameState;

  let state = gameState;
  for (const p of gameState.pawns) {
    if (p.isAlive === false && !p.corpseDropped) {
      // Combat death that bypassed killPawn — finalise without re-logging.
      state = finalizePawnDeath(p, 'combat', state);
    }
  }

  return {
    ...state,
    pawns: state.pawns.filter((p) => p.isAlive !== false)
  };
}

/**
 * Tick all progressive health conditions for a single pawn:
 * malnutrition progression, blood loss, critical limb checks.
 * Returns updated GameState (may trigger death via killPawn).
 */
/**
 * Advance or recover a need-driven condition per its conditions.jsonc `driver`. Pure — returns the
 * new conditions array. Rates are authored per-second; `perTick()` scales them to one tick.
 */
// ADR-002 amendment (hot per-tick, behind the worker): mutate the live `conditions` array IN PLACE
// rather than returning a fresh array. Called per driven-condition per pawn per tick; the immutable
// `[...conditions]` rebuild was a top allocator (`next`/iterator churn, §C). The common case (need
// below onset, condition absent) now allocates NOTHING.
function applyConditionDriver(
  conditions: NonNullable<Pawn['conditions']>,
  def: ConditionDef,
  needVal: number
): void {
  const d = def.driver!;
  const idx = conditions.findIndex((c) => c.id === def.id);
  if (needVal >= d.onset) {
    const rate = perTick(needVal >= 100 ? d.rateMax : d.rateCritical);
    if (idx === -1) conditions.push({ id: def.id, severity: rate });
    else
      conditions[idx] = {
        ...conditions[idx],
        severity: Math.min(1.0, conditions[idx].severity + rate)
      };
    return;
  }
  if (needVal < d.safe && idx !== -1) {
    const newSeverity = conditions[idx].severity - perTick(d.recovery);
    if (newSeverity <= 0) conditions.splice(idx, 1);
    else conditions[idx] = { ...conditions[idx], severity: newSeverity };
  }
}

function tickConditions(pawn: Pawn, gameState: GameState): GameState {
  // ADR-002 amendment: operate on the LIVE conditions array in place (no per-tick `[...]` clone — it
  // was a top allocator for healthy pawns that never change, §C). conditions is a cold snapshot field
  // (resync, ADR-021 W2b), so in-place mutation is safe. Initialised once per pawn if absent.
  const conditions = (pawn.conditions ??= []);
  const maxBloodVolume = pawn.maxBloodVolume ?? 100;
  let bloodVolume = pawn.bloodVolume ?? maxBloodVolume;
  const limbs = pawn.limbs ?? [];

  // ── Need-driven conditions (malnutrition ← hunger, dehydration ← thirst, …) ──
  // Onset/safe thresholds + accrual/recovery rates are authored on each condition's `driver` block
  // in conditions.jsonc — no hardcoded MALNUTRITION_*/DEHYDRATION_* constants.
  const needVals = pawn.needs as unknown as Record<string, number> | undefined;
  for (const def of CONDITIONS_DB) {
    if (!def.driver) continue;
    const needVal = needVals?.[def.driver.need] ?? 0;
    applyConditionDriver(conditions, def, needVal);
    const current = conditions.find((c) => c.id === def.id);
    if (current && current.severity >= def.lethalSeverity) {
      return killPawn(
        { ...gameState.pawns.find((p) => p.id === pawn.id)!, conditions, bloodVolume },
        // A driven condition's id (malnutrition/dehydration) is also its death cause.
        def.id as Parameters<typeof killPawn>[1],
        {
          ...gameState,
          pawns: gameState.pawns.map((p) =>
            p.id === pawn.id ? { ...p, conditions, bloodVolume } : p
          )
        }
      );
    }
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
  // Cap total pressure so many simultaneous combat wounds can't stack into a near-instant
  // lethal infection — infection is the slow post-fight threat, not a mid-combat killer (NT-3).
  infectionPressure = Math.min(infectionPressure, CARE_CONFIG.infectionRiskMaxPerTick);
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
  // ADR-002 amendment (hot per-tick, behind the worker): the common (non-lethal) path mutates the
  // live pawn IN PLACE rather than rebuilding the whole pawns array each pawn each tick — that
  // per-pawn `.map` was a top steady-state line (`tickConditions/<.pawns<`). `pawn` is the live
  // object the caller fetched from gameState.pawns. (The lethal branches above stay immutable: rare,
  // and they hand a patched state to killPawn.) conditions/limbs are cold snapshot fields → resync;
  // bloodVolume is hot → every flush (ADR-021 W2b).
  pawn.conditions = conditions;
  pawn.bloodVolume = bloodVolume;
  pawn.limbs = limbs;
  return gameState;
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
    if (st === PAWN_STATE.COLLAPSED || st === PAWN_STATE.FIGHTING || st === PAWN_STATE.FLEEING)
      continue;
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
  if ((pawn.needs?.hunger ?? 0) <= HEALING_CONFIG.wellFedHunger)
    mult *= HEALING_CONFIG.wellFedMultiplier;
  if ((pawn.state?.mood ?? 50) >= HEALING_CONFIG.goodMood)
    mult *= HEALING_CONFIG.goodMoodMultiplier;
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

// ===== COMBAT STATE (COMBAT-SYSTEM) =====

// ===== HUNTING (work-driven) =====

// ===== PER-PAWN STATE HANDLERS =====

// ===== HAULING HELPERS =====

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
  const changed =
    Object.keys(next).length !== Object.keys(durations).length ||
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
  // §D thirst/hygiene consequences (before dehydration's lethal condition kicks in at 95).
  if ((pawn.needs?.thirst ?? 0) >= HUNGER_THRESHOLD) effects.push('thirsty');
  if ((pawn.needs?.hygiene ?? 0) >= HUNGER_THRESHOLD) effects.push('filthy');

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

/**
 * State → handler dispatch table (hotspot step 3). Replaces the 15-case `tickPawn` switch so
 * adding a state is a one-line registration and `tickPawn`'s fan-out drops from 16 to ~1. Every
 * handler has the same `(pawn, gameState) => GameState` shape. (Function declarations are hoisted,
 * so referencing the handlers here — above their definitions — is fine.)
 */
type PawnHandler = (pawn: Pawn, gameState: GameState) => GameState;
const STATE_HANDLERS: Record<string, PawnHandler> = {
  [PAWN_STATE.IDLE]: handleIdle,
  [PAWN_STATE.MOVING_TO_RESOURCE]: handleMovingToResource,
  [PAWN_STATE.WORKING]: handleWorking,
  [PAWN_STATE.HUNGRY]: handleHungry,
  [PAWN_STATE.TIRED]: handleTired,
  [PAWN_STATE.MOVING_TO_NEED]: handleMovingToNeed,
  [PAWN_STATE.EATING]: handleEating,
  [PAWN_STATE.SLEEPING]: handleSleeping,
  [PAWN_STATE.HAULING]: handleHauling,
  [PAWN_STATE.MOVING_TO_DEPOSIT]: handleMovingToDeposit,
  [PAWN_STATE.DRINKING]: handleDrinking,
  [PAWN_STATE.WASHING]: handleWashing,
  [PAWN_STATE.FIGHTING]: handleFighting,
  [PAWN_STATE.FLEEING]: handleFleeing,
  [PAWN_STATE.HUNTING]: handleHunting
};

function tickPawn(pawn: Pawn, gameState: GameState): GameState {
  // Throttle file logging to every 30 turns (~0.5 s at 60 TPS) so PAWN-TICK
  // doesn't flood the buffer and bury ENTITY-STATE / MOB-SNAP lines.
  if (gameState.turn % 30 === 0) logPawnTick(pawn, gameState);
  const state = pawn.currentState ?? PAWN_STATE.IDLE;
  const handler = STATE_HANDLERS[state];
  return handler ? handler(pawn, gameState) : gameState;
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
      const current = pawnById(state.pawns, pawn.id);
      if (!current) continue;
      // Skip dead pawns entirely.
      if (current.isAlive === false) continue;

      // Drafted pawns are player-controlled, so release any job they still claim (they don't
      // auto-work). R2: they do NOT `continue` here — they still run the full health block below
      // (caretaking, conditions/bleed/infection/death, healing, the collapse lifecycle, status
      // durations). ONLY the behavioural state machine is skipped (see the drafted check after the
      // collapse lifecycle). Otherwise a drafted pawn never bled, healed, or collapsed.
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
      }

      // Periodic caretaking: the colony's best available medic tends this pawn's
      // untended wounds (skipped mid-fight). Runs before conditions so infection
      // sees fresh treatment, and before healing so the tend boost applies.
      const inMeleeNow =
        current.currentState === PAWN_STATE.FIGHTING ||
        current.currentState === PAWN_STATE.FLEEING ||
        current.currentState === PAWN_STATE.HUNTING ||
        (current.drafted === true && current.draftTarget?.type === 'attack');
      let toTick = current;
      if (!inMeleeNow && state.turn % CARE_CONFIG.tendIntervalTicks === 0) {
        const afterTend = tendWounds(current, state);
        if (afterTend !== state) {
          state = afterTend;
          toTick = pawnById(state.pawns, pawn.id) ?? current;
        }
      }

      // Tick conditions (malnutrition, blood loss, infection, limb checks) — may kill pawn.
      state = tickConditions(toTick, state);
      // Re-fetch pawn in case tickConditions updated it.
      let afterConditions = pawnById(state.pawns, pawn.id);
      if (!afterConditions || afterConditions.isAlive === false) continue;

      // ── Wound healing + collapse lifecycle (COMBAT-SYSTEM) ────────────────
      // Pain is the sum of active wounds, so a pawn recovers by mending them — but
      // not mid-fight (wounds don't knit while trading blows), so a sustained brawl
      // still marches to collapse. A collapsed pawn is down until pain subsides.
      const inMelee =
        afterConditions.currentState === PAWN_STATE.FIGHTING ||
        afterConditions.currentState === PAWN_STATE.FLEEING ||
        afterConditions.currentState === PAWN_STATE.HUNTING ||
        (afterConditions.drafted === true && afterConditions.draftTarget?.type === 'attack');
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
      const consciousness = pawnStatService.computeCapacities(afterConditions).consciousness ?? 1;

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

      // R2: drafted pawns ran the full health block above (bleed/heal/death/collapse). They are
      // player-controlled, so skip the BEHAVIOURAL state machine (auto combat-engage, exhaustion
      // collapse, eat/sleep/work). Still tick status-effect durations so a combat-inflicted
      // knockdown/collapse actually expires, then sync activeEffects, and move on.
      if (forCollapse.drafted) {
        const stepped = tickStatusEffectDurations(forCollapse);
        const synced = syncActiveEffects(stepped);
        if (synced !== forCollapse) {
          state = {
            ...state,
            pawns: state.pawns.map((p) => (p.id === pawn.id ? synced : p))
          };
        }
        continue;
      }

      // ── Combat interrupt (top priority): a hostile is within aggro range. ──
      // Drop the current job and switch to a combat state so the pawn defends
      // itself instead of walking off to work. While already in a combat state we
      // leave path/movement to the handler (so a fleeing pawn can keep retreating).
      const inCombat =
        forCollapse.currentState === PAWN_STATE.FIGHTING ||
        forCollapse.currentState === PAWN_STATE.FLEEING;
      // Staggered detection (COMBAT_SCAN_INTERVAL): only re-scan a non-combat pawn every Nth tick,
      // offset by debugId so scans spread across ticks; in-combat pawns scan every tick.
      const scanForThreat =
        inCombat || (state.turn + (forCollapse.debugId ?? 0)) % COMBAT_SCAN_INTERVAL === 0;
      const threat = scanForThreat ? findCombatThreat(forCollapse, state) : null;
      if (threat) {
        const desired =
          (forCollapse.combatStance ?? 'defensive') === 'flee'
            ? PAWN_STATE.FLEEING
            : PAWN_STATE.FIGHTING;
        if (!inCombat) {
          // Entering combat: release any claimed job and plant in place.
          const jobs =
            forCollapse.activeJob || (state.jobs ?? []).some((j) => j.claimedBy === forCollapse.id)
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
        const afterCombat = pawnById(state.pawns, pawn.id);
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
      const updated = pawnById(state.pawns, pawn.id);
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
