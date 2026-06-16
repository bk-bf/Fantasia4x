// Entity lifecycle — hunger/fatigue/blood-loss tick, death → corpse conversion, carcass drops, and
// corpse decay. Extracted from EntityService (P-4).
import type { GameState, Mob, MobState, DroppedItem } from '../../core/types';
import { getCreatureById } from '../../core/Creatures';
import { SECONDS_PER_TICK, perTick } from '../../core/time';
import { conditionNeedMultipliers, driveNeedConditions } from '../../core/needs';
import { absorbDropIfOnStockpileTile } from '../../core/GameState';
import { pawnStatService } from '../PawnStatService';
import { simLog } from '../../core/logSink';
import { entityName } from './entityHelpers';
import {
  BASE_HUNGER_PER_SECOND,
  BASE_FATIGUE_PER_SECOND,
  SLEEP_HUNGER_RATE,
  SLEEP_RECOVERY_PER_SECOND,
  CORPSE_DECAY_TICKS
} from './entityConstants';

export function stepHunger(state: GameState): GameState {
  const mobs = state.mobs;
  if (!mobs || mobs.length === 0) return state;
  const { turn } = state;

  // M3 (ENGINE-PERFORMANCE ★ ACTIVE): mutate mob fields IN PLACE (no per-mob {...mob} spread).
  // Deaths are captured explicitly in `justDied` because the old new-object-vs-old diff used for
  // carcass drops (`mobs[i].state !== next[i].state`) can't work once the object is mutated.
  // Per-mob only (hunger/blood/health) — no cross-mob dependency, so order/snapshot semantics are
  // unaffected (unlike the FSM stepEntities, which is left immutable on purpose).
  let changed = false;
  const justDied: Mob[] = [];

  for (const mob of mobs) {
    if (mob.state === 'Corpse' || mob.isAlive === false) continue;
    const def = getCreatureById(mob.creatureId);
    if (!def) continue;

    // Diet affects how fast hunger accrues. `none` (e.g. shadow_wraith) never gets hungry.
    const dietMult =
      def.diet === 'none'
        ? 0
        : def.diet === 'carnivore'
          ? 1.0
          : def.diet === 'herbivore'
            ? 0.5
            : 0.7; // omnivore

    const condMults = conditionNeedMultipliers(mob.conditions ?? []);
    // Body size drives appetite via the same data-driven `hunger_rate` stat as pawns.
    const sizeRate = pawnStatService.evaluateStat('hunger_rate', mob);
    const hungerDelta =
      BASE_HUNGER_PER_SECOND * SECONDS_PER_TICK * dietMult * condMults.hungerRate * sizeRate;
    const fatigueDelta = BASE_FATIGUE_PER_SECOND * SECONDS_PER_TICK * condMults.fatigueRate;

    // Sleeping: hunger accrues at 33% rate; fatigue recovers instead of rising.
    const sleepingNow = mob.state === 'Sleeping';
    const newHunger = Math.min(
      100,
      mob.needs.hunger + hungerDelta * (sleepingNow ? SLEEP_HUNGER_RATE : 1)
    );
    const newFatigue = sleepingNow
      ? Math.max(0, mob.needs.fatigue - SLEEP_RECOVERY_PER_SECOND * SECONDS_PER_TICK)
      : Math.min(100, mob.needs.fatigue + fatigueDelta);

    // ── Blood loss ──────────────────────────────────────────────────────────────────
    // Read limbs by reference (never mutated here) — copying it each tick would needlessly churn the
    // array AND break the limbs-identity capacity cache (PawnStatService) for every mob.
    const limbs = mob.limbs;
    const totalBleedRate = (limbs ?? []).reduce((sum, l) => sum + (l.bleedRate ?? 0), 0);
    const maxBV = mob.maxBloodVolume ?? 100;
    let bloodVolume = mob.bloodVolume ?? maxBV;

    if (totalBleedRate > 0) {
      bloodVolume = Math.max(0, bloodVolume - perTick(totalBleedRate));
    } else if (bloodVolume < maxBV) {
      // Slow regeneration when not bleeding (~2000s to full recovery).
      bloodVolume = Math.min(maxBV, bloodVolume + perTick(0.05));
    }

    // Sync blood_loss condition severity (mirrors pawn tickConditions).
    let conditions = [...(mob.conditions ?? [])];
    const bloodSeverity = Math.round((1 - bloodVolume / maxBV) * 1000) / 1000;
    const bloodLossIdx = conditions.findIndex((c) => c.id === 'blood_loss');
    if (bloodSeverity > 0) {
      if (bloodLossIdx === -1) conditions.push({ id: 'blood_loss', severity: bloodSeverity });
      else conditions[bloodLossIdx] = { ...conditions[bloodLossIdx], severity: bloodSeverity };
    } else if (bloodLossIdx !== -1) {
      conditions.splice(bloodLossIdx, 1);
    }

    // ── Need-driven conditions (malnutrition ← hunger) — the SAME data-driven model as pawns ──
    // Malnutrition onsets at hunger 87 and accrues slowly (conditions.jsonc), so a starving mob keeps
    // acting (trying to hunt/forage) for in-game DAYS, growing progressively weaker, and only dies
    // when malnutrition reaches lethal severity. The severe stage trips the FSM into Collapsed
    // (entityAI). Mobs carry no `thirst` need, so dehydration never onsets.
    const lethalCondition = driveNeedConditions(conditions, {
      ...(mob.needs as unknown as Record<string, number>),
      hunger: newHunger
    });
    if (lethalCondition) {
      const cause = lethalCondition === 'malnutrition' ? 'starvation' : lethalCondition;
      simLog.logEntityDeath(mob.id, entityName(mob), cause, turn, mob.x, mob.y);
      mob.state = 'Corpse';
      mob.isAlive = false;
      mob.diedAt = turn;
      mob.intactness = 1.0;
      mob.needs.hunger = newHunger;
      mob.needs.fatigue = newFatigue;
      mob.bloodVolume = bloodVolume;
      mob.conditions = conditions;
      if (limbs) mob.limbs = limbs;
      justDied.push(mob);
      changed = true;
      continue;
    }

    // Death by blood loss.
    if (bloodVolume <= 0) {
      simLog.logEntityDeath(mob.id, entityName(mob), 'blood_loss', turn, mob.x, mob.y);
      mob.state = 'Corpse';
      mob.isAlive = false;
      mob.diedAt = turn;
      mob.intactness = 1.0;
      mob.bloodVolume = 0;
      mob.conditions = conditions;
      if (limbs) mob.limbs = limbs;
      justDied.push(mob);
      changed = true;
      continue;
    }

    // Critical limb destruction (head or torso at 0 HP).
    let diedFromLimb = false;
    if (limbs) {
      for (const limb of limbs) {
        if (limb.health <= 0 && (limb.id === 'head' || limb.id === 'torso')) {
          simLog.logEntityDeath(mob.id, entityName(mob), 'critical_limb', turn, mob.x, mob.y);
          mob.state = 'Corpse';
          mob.isAlive = false;
          mob.diedAt = turn;
          mob.intactness = 1.0;
          mob.bloodVolume = bloodVolume;
          mob.conditions = conditions;
          mob.limbs = limbs;
          justDied.push(mob);
          changed = true;
          diedFromLimb = true;
          break;
        }
      }
    }
    if (diedFromLimb) continue;

    mob.needs.hunger = newHunger;
    mob.needs.fatigue = newFatigue;
    mob.bloodVolume = bloodVolume;
    mob.conditions = conditions;
    if (limbs) mob.limbs = limbs;
    changed = true;
  }

  if (!changed) return state;
  // New array ref (entities mutated in place) keeps the mob-subset memos invalidating correctly.
  let result: GameState = { ...state, mobs: mobs.slice() };
  // Drop a carcass item for every mob that just died this tick.
  for (const dead of justDied) result = dropCarcass(result, dead);
  return result;
}

// ===== DECAY ===================================================================

/** Drop a carcass DroppedItem at the mob's position when it dies. */
export function dropCarcass(state: GameState, mob: Mob): GameState {
  const def = getCreatureById(mob.creatureId);
  const carcassId = def?.carcassItemId;
  if (!carcassId) return state; // no carcass for this creature (e.g. shadow_wraith)
  const id = `carcass-${mob.id}-${state.turn}`;
  const drop: DroppedItem = { id, resourceId: carcassId, x: mob.x, y: mob.y, quantity: 1 };
  let next: GameState = { ...state, droppedItems: [...(state.droppedItems ?? []), drop] };
  next = absorbDropIfOnStockpileTile(next, id);
  return next;
}

export function removeDead(state: GameState): GameState {
  const mobs = state.mobs;
  if (!mobs || mobs.length === 0) return state;

  const kept = mobs.filter((m) => {
    if (m.health <= 0 && m.state !== 'Corpse') return true; // becomes corpse below
    if (m.state === 'Corpse' && m.diedAt !== undefined) {
      return state.turn - m.diedAt < CORPSE_DECAY_TICKS;
    }
    return true;
  });

  // Convert freshly-killed entities to corpses.
  let changed = kept.length !== mobs.length;
  const finalized = kept.map((m) => {
    if (m.health <= 0 && m.state !== 'Corpse') {
      changed = true;
      // Attribute the death so the log says "died of …" rather than the old
      // misfire where a starving entity "started fleeing" just before dying.
      const cause =
        m.needs.hunger >= 95 ? 'starvation' : (m.bloodVolume ?? 1) <= 0 ? 'blood_loss' : 'injuries';
      simLog.logEntityDeath(m.id, entityName(m), cause, state.turn, m.x, m.y);
      return {
        ...m,
        state: 'Corpse' as MobState,
        isAlive: false,
        diedAt: state.turn,
        intactness: 1.0
      };
    }
    return m;
  });

  if (!changed) return state;
  let result: GameState = { ...state, mobs: finalized };
  // Drop a carcass item for each mob freshly converted to Corpse this pass.
  for (let i = 0; i < kept.length; i++) {
    if (kept[i].state !== 'Corpse' && finalized[i].state === 'Corpse') {
      result = dropCarcass(result, finalized[i]);
    }
  }
  return result;
}

export function handleFreshCombatCorpses(prevState: GameState, nextState: GameState): GameState {
  const prevMobs = prevState.mobs ?? [];
  const nextMobs = nextState.mobs ?? [];
  let result = nextState;
  for (let i = 0; i < nextMobs.length; i++) {
    const prev = prevMobs[i];
    const next = nextMobs[i];
    if (prev?.state !== 'Corpse' && next?.state === 'Corpse') {
      result = dropCarcass(result, next);
    }
  }
  return result;
}
