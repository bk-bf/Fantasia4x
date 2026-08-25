import type { GameState, Mob, MobState, DroppedItem, ItemInstance } from '../../core/types';
import { getCreatureById } from '../../core/defs/creatures';
import { stampForeignVessel } from '../../core/rules/gear/vessels';
import { drawCarried, getLootPool } from '../../core/defs/loot';
import { itemService } from '../ItemService';
import { rng } from '../../core/util/rng';
import { SECONDS_PER_TICK, perTick } from '../../core/util/time';
import {
  conditionNeedMultipliers,
  transientNeedMultipliers,
  driveNeedConditions,
  applyShock,
  snapshotConditionStages,
  emitPersistentConditionFloaters,
  conditionsSig,
  syncFractureConditions,
  driveWindchill,
  TIRED_FATIGUE_THRESHOLD
} from '../../core/rules/body/conditions';
import {
  creatureExposureAt,
  accrueWetness,
  getAmbientLight,
  weatherSightMul
} from '../EnvironmentService';
import { isWitnessedByColony } from '../../core/rules/body/vision';
import { absorbDropIfOnStockpileTile } from '../../core/state/stockpile';
import { pawnStatService } from '../PawnStatService';
import { simLog } from '../../core/util/logSink';
import { lethalAnatomyCause } from '../../core/defs/bodyParts';
import {
  healLimbsInPlace,
  rollWoundClotting,
  MOB_CLOT_ROLL_INTERVAL,
  MOB_BASE_CLOT_CHANCE,
  MOB_BLOODLETTING_CLOT_FACTOR
} from '../../core/defs/wounds';
import { entityName, mobInLiveRegion, isThinkTick } from './entityHelpers';
import {
  BASE_HUNGER_PER_SECOND,
  BASE_FATIGUE_PER_SECOND,
  SLEEP_RECOVERY_PER_SECOND,
  CORPSE_DECAY_TICKS,
  MOB_WEATHER_INTERVAL,
  MOB_WIND_ONSET,
  LIVE_RADIUS,
  AI_THROTTLE_TICKS
} from './entityConstants';

const MOB_WOUND_HEAL_PER_TICK = 0.00024;
const MOB_HEAL_INTERVAL = 15;

export function stepHunger(state: GameState): GameState {
  const mobs = state.mobs;
  if (!mobs || mobs.length === 0) return state;
  const { turn } = state;
  if (state._needsDisabled?.mobHunger === true) return state;

  let changed = false;
  const justDied: Mob[] = [];

  const livePawns = state.pawns.filter((p) => p.position && p.isAlive !== false);
  const lodActive = livePawns.length > 0;
  const witnessAmbient = getAmbientLight(turn);
  const witnessWeatherMul = weatherSightMul(state.weather?.type);
  const deathWitnessed = (x: number, y: number) =>
    isWitnessedByColony(state.pawns, x, y, witnessAmbient, witnessWeatherMul);
  for (const mob of mobs) {
    if (mob.state === 'Corpse' || mob.isAlive === false) continue;
    const inBubble = !lodActive || mobInLiveRegion(mob, livePawns, LIVE_RADIUS);
    const maxBV = mob.maxBloodVolume ?? 100;
    const bleeding =
      (mob.bloodVolume ?? maxBV) < maxBV &&
      (mob.limbs?.some((l) => (l.bleedRate ?? 0) > 0) ?? false);
    if (!inBubble && !isThinkTick(mob.id, turn) && !bleeding) continue;
    const tickScale = inBubble || bleeding ? 1 : AI_THROTTLE_TICKS;
    const def = getCreatureById(mob.creatureId);
    if (!def) continue;

    const dietMult =
      def.diet === 'none'
        ? 0
        : def.diet === 'carnivore'
          ? 0.65
          : def.diet === 'herbivore'
            ? 0.5
            : 0.7;

    const condMults = conditionNeedMultipliers(mob.conditions ?? []);
    const sizeRate = pawnStatService.evaluateStat('hunger_rate', mob);
    const lairHungerMult = def.hungerRate ?? 1;
    const hungerDelta =
      BASE_HUNGER_PER_SECOND *
      SECONDS_PER_TICK *
      dietMult *
      condMults.hungerRate *
      sizeRate *
      lairHungerMult *
      tickScale;
    const fatigueDelta =
      BASE_FATIGUE_PER_SECOND * SECONDS_PER_TICK * condMults.fatigueRate * tickScale;

    const sleepingNow = mob.state === 'Sleeping';
    const stateCond =
      mob.state === 'Sleeping' ? 'sleeping' : mob.state === 'Eating' ? 'eating' : null;
    const stateHungerRate = stateCond ? transientNeedMultipliers([stateCond]).hungerRate : 1;
    const newHunger = Math.min(100, mob.needs.hunger + hungerDelta * stateHungerRate);
    const newFatigue = sleepingNow
      ? Math.max(0, mob.needs.fatigue - SLEEP_RECOVERY_PER_SECOND * SECONDS_PER_TICK * tickScale)
      : Math.min(100, mob.needs.fatigue + fatigueDelta);

    const limbs = mob.limbs;
    if (limbs && (inBubble ? turn % MOB_CLOT_ROLL_INTERVAL === 0 : true)) {
      const clotChance =
        Math.min(
          0.95,
          Math.max(0, MOB_BASE_CLOT_CHANCE * pawnStatService.evaluateStat('blood_clotting', mob))
        ) * (inBubble ? 1 : tickScale / MOB_CLOT_ROLL_INTERVAL);
      if (rollWoundClotting(limbs, clotChance, turn, MOB_BLOODLETTING_CLOT_FACTOR))
        mob.limbs = limbs.slice();
    }

    const totalBleedRate = (limbs ?? []).reduce((sum, l) => sum + (l.bleedRate ?? 0), 0);
    let bloodVolume = mob.bloodVolume ?? maxBV;

    if (totalBleedRate > 0) {
      bloodVolume = Math.max(0, bloodVolume - perTick(totalBleedRate) * tickScale);
    } else if (bloodVolume < maxBV) {
      bloodVolume = Math.min(maxBV, bloodVolume + perTick(0.05) * tickScale);
    }

    const conditions = (mob.conditions ??= []);
    const prevStages = snapshotConditionStages(conditions);
    const condSigBefore = conditionsSig(conditions);

    const lethalCondition = driveNeedConditions(
      conditions,
      {
        ...(mob.needs as unknown as Record<string, number>),
        hunger: newHunger
      },
      tickScale
    );
    if (lethalCondition) {
      const cause = lethalCondition === 'malnutrition' ? 'starvation' : lethalCondition;
      if (deathWitnessed(mob.x, mob.y))
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

    if (bloodVolume <= 0) {
      if (deathWitnessed(mob.x, mob.y))
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

    if (lethalAnatomyCause(limbs)) {
      if (deathWitnessed(mob.x, mob.y))
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
      continue;
    }

    const inCombat =
      mob.state === 'Attacking' ||
      mob.state === 'Alerted' ||
      mob.state === 'Hunting' ||
      mob.state === 'Fleeing';
    if (limbs && !inCombat && (inBubble ? turn % MOB_HEAL_INTERVAL === 0 : true)) {
      const healed = healLimbsInPlace(
        limbs,
        MOB_WOUND_HEAL_PER_TICK * (inBubble ? MOB_HEAL_INTERVAL : tickScale),
        turn,
        false
      );
      if (healed) {
        let pain = 0;
        for (const l of limbs)
          for (const p of l.parts ?? []) for (const w of p.injuries) pain += w.painContribution;
        mob.pain = Math.max(0, Math.min(100, Math.round(pain)));
        mob.limbs = limbs.slice();
      }
    }

    if (limbs && ((mob.pain ?? 0) > 0 || conditions.some((c) => c.id === 'fractured')))
      syncFractureConditions(conditions, limbs);

    applyShock(conditions, mob.pain ?? 0, 1 - bloodVolume / maxBV);

    const wantTired = !sleepingNow && newFatigue >= TIRED_FATIGUE_THRESHOLD;
    if (wantTired !== (mob.transientConditions ?? []).includes('tired')) {
      const tc = (mob.transientConditions ?? []).filter((id) => id !== 'tired');
      if (wantTired) tc.push('tired');
      mob.transientConditions = tc;
    }

    if (inBubble ? turn % MOB_WEATHER_INTERVAL === 0 : true) {
      const tile = state.worldMap[mob.y]?.[mob.x];
      const { wind, wetness: rawTileWet } = creatureExposureAt(
        mob.x,
        mob.y,
        state.weather,
        state.worldMap,
        tile?.moisture ?? 0
      );
      const tileWet = tile?.floor ? rawTileWet * (1 - tile.floor.dryness) : rawTileWet;
      driveWindchill(conditions, wind, MOB_WIND_ONSET);
      const dt = (inBubble ? MOB_WEATHER_INTERVAL : tickScale) * SECONDS_PER_TICK;
      const wetRes = pawnStatService.evaluateStat('wetness_resistance', mob);
      const wet = accrueWetness(mob.needs.wetness ?? 0, tileWet, dt, wetRes, 0);
      mob.needs.wetness = wet;
      const wantWet = wet >= 100;
      if (wantWet !== (mob.transientConditions ?? []).includes('wet')) {
        const tc = (mob.transientConditions ?? []).filter((id) => id !== 'wet');
        if (wantWet) tc.push('wet');
        mob.transientConditions = tc;
      }
    }

    mob.needs.hunger = newHunger;
    mob.needs.fatigue = newFatigue;
    mob.bloodVolume = bloodVolume;
    if (conditionsSig(conditions) !== condSigBefore) mob.conditions = conditions.slice();
    emitPersistentConditionFloaters(prevStages, conditions, mob.x, mob.y);
    changed = true;
  }

  if (!changed) return state;
  let result: GameState = { ...state, mobs: mobs.slice() };
  for (const dead of justDied) result = dropCarcass(result, dead);
  return result;
}

export function dropCarcass(state: GameState, mob: Mob): GameState {
  const def = getCreatureById(mob.creatureId);
  const carcassId = def?.carcassItemId;
  if (!carcassId) return state;
  const id = `carcass-${mob.id}-${state.turn}`;
  const condition = Math.round(Math.max(0, Math.min(1, mob.intactness ?? 1)) * 100);
  const carcassName = itemService.getItemById(carcassId)?.dynamicName
    ? itemService.makeDynamicName(carcassId, mob.name ?? def?.name ?? mob.creatureId)
    : undefined;
  const drop: DroppedItem = {
    id,
    resourceId: carcassId,
    x: mob.x,
    y: mob.y,
    quantity: 1,
    unitConditions: [condition],
    ...(carcassName ? { name: carcassName } : {}),
    forbidden: true
  };
  let next: GameState = { ...state, droppedItems: [...(state.droppedItems ?? []), drop] };
  next = absorbDropIfOnStockpileTile(next, id);
  next = dropMobGear(next, mob, def);
  return next;
}

function dropMobGear(
  state: GameState,
  mob: Mob,
  def: ReturnType<typeof getCreatureById>
): GameState {
  if (!def?.lootPool) return state;
  const pool = getLootPool(def.lootPool);
  if (!pool) return state;
  const drops: DroppedItem[] = [];
  for (const [slot, inst] of Object.entries(mob.equipment ?? {}) as [
    string,
    ItemInstance | undefined
  ][]) {
    if (!inst || inst.durability <= 0) continue;
    if (rng.random() >= pool.dropChance) continue;
    drops.push({
      id: `loot-drop-${mob.id}-${slot}-${state.turn}`,
      resourceId: inst.itemId,
      x: mob.x,
      y: mob.y,
      quantity: 1,
      instance: stampForeignVessel(inst),
      quality: inst.quality,
      durability: inst.durability,
      forbidden: true
    });
  }
  for (const c of drawCarried(pool, rng)) {
    drops.push({
      id: `loot-carry-${mob.id}-${c.itemId}-${state.turn}`,
      resourceId: c.itemId,
      x: mob.x,
      y: mob.y,
      quantity: c.qty,
      forbidden: true
    });
  }
  if (drops.length === 0) return state;
  return { ...state, droppedItems: [...(state.droppedItems ?? []), ...drops] };
}

export function removeDead(state: GameState): GameState {
  const mobs = state.mobs;
  if (!mobs || mobs.length === 0) return state;

  const kept = mobs.filter((m) => {
    if (m.health <= 0 && m.state !== 'Corpse') return true;
    if (m.state === 'Corpse' && m.diedAt !== undefined) {
      if ((m.intactness ?? 1) <= 0) return false;
      return state.turn - m.diedAt < CORPSE_DECAY_TICKS;
    }
    return true;
  });

  let changed = kept.length !== mobs.length;
  const finalized = kept.map((m) => {
    if (m.health <= 0 && m.state !== 'Corpse') {
      changed = true;
      const cause =
        m.needs.hunger >= 95 ? 'starvation' : (m.bloodVolume ?? 1) <= 0 ? 'blood_loss' : 'injuries';
      if (
        isWitnessedByColony(
          state.pawns,
          m.x,
          m.y,
          getAmbientLight(state.turn),
          weatherSightMul(state.weather?.type)
        )
      )
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
