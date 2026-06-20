// Entity lifecycle — hunger/fatigue/blood-loss tick, death → corpse conversion, carcass drops, and
// corpse decay. Extracted from EntityService (P-4).
import type { GameState, Mob, MobState, DroppedItem } from '../../core/types';
import { getCreatureById } from '../../core/Creatures';
import { SECONDS_PER_TICK, perTick } from '../../core/time';
import {
  conditionNeedMultipliers,
  driveNeedConditions,
  applyShock,
  snapshotConditionStages,
  emitPersistentConditionFloaters,
  conditionsSig,
  syncFractureConditions
} from '../../core/needs';
import { absorbDropIfOnStockpileTile } from '../../core/GameState';
import { pawnStatService } from '../PawnStatService';
import { simLog } from '../../core/logSink';
import { PART_DEF_MAP } from '../../core/BodyParts';
import {
  healLimbsInPlace,
  rollWoundClotting,
  MOB_CLOT_ROLL_INTERVAL,
  MOB_BASE_CLOT_CHANCE
} from '../../core/Wounds';
import { entityName } from './entityHelpers';
import {
  BASE_HUNGER_PER_SECOND,
  BASE_FATIGUE_PER_SECOND,
  SLEEP_HUNGER_RATE,
  SLEEP_RECOVERY_PER_SECOND,
  CORPSE_DECAY_TICKS,
  TIRED_FATIGUE_THRESHOLD
} from './entityConstants';

/** Per-tick natural wound mend for creatures (no rest gate, no tending). Tuned so a beast recovers a
 *  limb from ~half HP to full in ~1 in-game week — hardy wild healing, much faster per-HP than a pawn's
 *  (a pawn's lingering wounds need care), but still days-to-weeks, not the old "heals off in a minute". */
const MOB_WOUND_HEAL_PER_TICK = 0.00024;
/** Run the mob wound-mend once every N ticks (applying N× the per-tick rate) instead of every tick.
 *  Healing 0.02/tick is "days to close" anyway, so a periodic pass is gameplay-equivalent, and it cuts
 *  the heal work (+ the cache-invalidating ref bump) ~N× across a large wounded-mob population. Paired
 *  with the in-place mend (healLimbsInPlace) this kills the per-tick allocation cliff (ENGINE-PERF). */
const MOB_HEAL_INTERVAL = 15;

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
    // Laired hostiles run a slow metabolism (def.hungerRate < 1) so a leashed pack penned near its
    // lair isn't on a starvation clock — they idle their territory instead of starving and roaming.
    const lairHungerMult = def.hungerRate ?? 1;
    const hungerDelta =
      BASE_HUNGER_PER_SECOND *
      SECONDS_PER_TICK *
      dietMult *
      condMults.hungerRate *
      sizeRate *
      lairHungerMult;
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

    // ── Clotting ──────────────────────────────────────────────────────────────────
    // Same lucky-roll model as pawns, but BUFFED: creatures can't be dressed, so they roll HOURLY at a
    // higher base chance (MOB_* constants) and reliably self-stabilise within ~an in-game hour after a
    // fight. Mutates the limb objects in place (M3 — no per-tick alloc).
    const limbs = mob.limbs;
    if (limbs && turn % MOB_CLOT_ROLL_INTERVAL === 0) {
      const clotChance = Math.min(
        0.95,
        Math.max(0, MOB_BASE_CLOT_CHANCE * pawnStatService.evaluateStat('blood_clotting', mob))
      );
      // Clotting mutates limb objects in place → bump mob.limbs ref so the worker re-ships the
      // updated bleed/clot state to the body panel (ref-diff cold sync).
      if (rollWoundClotting(limbs, clotChance, turn)) mob.limbs = limbs.slice();
    }

    // ── Blood loss ──────────────────────────────────────────────────────────────────
    const totalBleedRate = (limbs ?? []).reduce((sum, l) => sum + (l.bleedRate ?? 0), 0);
    const maxBV = mob.maxBloodVolume ?? 100;
    let bloodVolume = mob.bloodVolume ?? maxBV;

    if (totalBleedRate > 0) {
      bloodVolume = Math.max(0, bloodVolume - perTick(totalBleedRate));
    } else if (bloodVolume < maxBV) {
      // Slow regeneration when not bleeding (~2000s to full recovery).
      bloodVolume = Math.min(maxBV, bloodVolume + perTick(0.05));
    }

    // (The redundant `blood_loss` condition is gone — low blood now drives `shock` directly, below.)
    // Operate on the LIVE conditions array (no per-tick copy); we flip mob.conditions to a new ref
    // only when the in-place mutations below change it, so the worker's cold-field ref-diff re-ships
    // it to the UI only on change (not every tick).
    const conditions = (mob.conditions ??= []);
    // Pre-tick stages of flagged persistent conditions (e.g. shock) — to float a label on change.
    const prevStages = snapshotConditionStages(conditions);
    const condSigBefore = conditionsSig(conditions);

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
        // A caved-in skull (destroyed critical PART) kills outright, even if the head aggregate survives.
        const fatalPart =
          limb.id === 'head' &&
          (limb.parts ?? []).some(
            (p) => (p.isMissing || p.health <= 0) && PART_DEF_MAP[p.id]?.isCritical
          );
        if (fatalPart || (limb.health <= 0 && (limb.id === 'head' || limb.id === 'torso'))) {
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

    // Creatures can't dress wounds — they heal them OFF slowly over days (no tending, no severity
    // stall). MUTATED IN PLACE + throttled: the old immutable healLimbs rebuild ran every tick for
    // every wounded mob, and under sustained mob-vs-mob predation that growing wounded population
    // GC-thrashed TPS off a cliff (it had re-immutabled the de-immutabled M3 mob phase — ENGINE-PERF).
    // healLimbsInPlace mends the live limb objects (no deep alloc); the ref is only bumped (shallow
    // slice) when something actually healed, to invalidate the limbs-identity capacity cache.
    // No mending while in combat — a fighting/threatened mob doesn't knit wounds (mirrors the pawn
    // rule: healWounds is skipped while inMelee). Otherwise a tanky creature out-regenerates the chip
    // damage of a drawn-out fight and is effectively unkillable (the "mammoth insta-heals" report).
    const inCombat =
      mob.state === 'Attacking' ||
      mob.state === 'Alerted' ||
      mob.state === 'Hunting' ||
      mob.state === 'Fleeing';
    if (limbs && !inCombat && turn % MOB_HEAL_INTERVAL === 0) {
      const healed = healLimbsInPlace(
        limbs,
        MOB_WOUND_HEAL_PER_TICK * MOB_HEAL_INTERVAL,
        turn,
        false
      );
      if (healed) {
        let pain = 0;
        for (const l of limbs)
          for (const p of l.parts ?? []) for (const w of p.injuries) pain += w.painContribution;
        mob.pain = Math.max(0, Math.min(100, Math.round(pain)));
        mob.limbs = limbs.slice(); // ref bump → capacity cache recomputes against the healed body
      }
    }

    // ── Shock ──────────────────────────────────────────────────────────────────
    // Graded `fractured` condition synced from the limb tree — crushes the mob's STR/DEX on
    // top of the manipulation/moving capacity hit, same as pawns; cleared as the bones knit.
    if (limbs) syncFractureConditions(conditions, limbs);

    // Severe pain OR heavy blood loss sends a mob into shock — SAME rule as pawns (applyShock); this
    // subsumes the old blood_loss condition. mob.pain is kept current by combat + the heal block above.
    applyShock(conditions, mob.pain ?? 0, 1 - bloodVolume / maxBV);

    // `tired` (Exhausted) transient — high fatigue crushes a creature's STR/DEX exactly as it does a
    // pawn's (the pawn derives it in syncTransientConditions, which mobs don't run). Re-derived each
    // tick; reconcile ONLY 'tired' so the combat-managed timer transients (knockdown/winded/on-hit
    // venom…) on mob.transientConditions are left untouched.
    const wantTired = !sleepingNow && newFatigue >= TIRED_FATIGUE_THRESHOLD;
    if (wantTired !== (mob.transientConditions ?? []).includes('tired')) {
      const tc = (mob.transientConditions ?? []).filter((id) => id !== 'tired');
      if (wantTired) tc.push('tired');
      mob.transientConditions = tc;
    }

    mob.needs.hunger = newHunger;
    mob.needs.fatigue = newFatigue;
    mob.bloodVolume = bloodVolume;
    // Flip to a NEW conditions ref only when this tick changed it (worker ref-diff → live pill);
    // `conditions` IS mob.conditions, so an unchanged tick leaves the ref untouched and ships nothing.
    if (conditionsSig(conditions) !== condSigBefore) mob.conditions = conditions.slice();
    // Float a label for any flagged persistent condition (shock) that onset / changed stage this tick.
    emitPersistentConditionFloaters(prevStages, conditions, mob.x, mob.y);
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
  // Fold the corpse's remaining mass (mob.intactness, eaten down by scavengers) onto the carcass as its
  // starting CONDITION — a half-stripped corpse drops a half-condition carcass (less butchery yield).
  const condition = Math.round(Math.max(0, Math.min(1, mob.intactness ?? 1)) * 100);
  const drop: DroppedItem = {
    id,
    resourceId: carcassId,
    x: mob.x,
    y: mob.y,
    quantity: 1,
    unitConditions: [condition]
  };
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
