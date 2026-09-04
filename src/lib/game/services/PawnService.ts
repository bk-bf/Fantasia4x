import type {
  GameState,
  Pawn,
  Mob,
  EntityNeeds,
  PawnState,
  TransientConditionDef,
  ConditionDef
} from '../core/types';
import { takeOut, carriedDrinkVessel, hydrationOf } from '../core/rules/gear/vessels';
import { pawnById } from '../core/state/pawnIndex';
import { categorizeStats, getStatDescription } from '../entities/Pawns';
import { pawnStatService } from './PawnStatService';
import { itemService } from './ItemService';
import { WORK_CATEGORIES } from '../core/defs/work';
import { SECONDS_PER_TICK, perTick } from '../core/util/time';
import { stepBody } from './MovementSystem';
import { occupancyService } from './OccupancyService';
import conditionsData from '../database/pawns/conditions.json';
import { NEEDS_DB, needNum } from '../core/defs/needs';
import { moodEffect, MOOD_BASE } from '../core/defs/moods';
import {
  getConditionCurrentStage,
  conditionNeedMultipliers,
  getConditionDefById
} from '../core/rules/body/conditions';
import { amenityAt } from '../core/defs/amenities';
import { effectiveMood, moodModifierValue } from '../core/rules/social/social';
import {
  getAmbientLight,
  weatherEffects,
  celestialMoodEffect,
  diurnalTempDelta,
  thermalAt,
  effectiveTemperature,
  isRoofedTile,
  tileWetness,
  accrueWetness,
  seasonBakedTemp
} from './EnvironmentService';
import { gatedConsole as console } from '../core/util/log';

const TRANSIENT_CONDITIONS_DB = (
  conditionsData as unknown as Array<ConditionDef | TransientConditionDef>
).filter((d): d is TransientConditionDef => d.transient === true);

function getActiveTransientConditions(entity: Pawn | Mob): TransientConditionDef[] {
  return (entity.transientConditions ?? [])
    .map((id) => TRANSIENT_CONDITIONS_DB.find((e) => e.id === id))
    .filter((e): e is TransientConditionDef => e !== undefined);
}

const NEED_MOOD = NEEDS_DB;
const MOOD_EASE_STEP = perTick(0.4);

function pawnHasCondition(pawn: Pawn, id: string): boolean {
  if (pawn.conditions?.some((c) => c.id === id)) return true;
  const tc = pawn.transientConditions;
  if (tc)
    for (const t of tc) if (t === id || (t.includes(':') && t.split(':')[0] === id)) return true;
  return false;
}

export interface PawnService {
  updatePawnNeeds(pawnId: string, gameState: GameState): GameState;

  updatePawnState(pawnId: string, gameState: GameState): GameState;

  getPawnActivities(pawnId: string, gameState: GameState): string[];

  categorizeStats(
    stats: Record<string, { value: number; sources: string[] }>
  ): Record<string, string[]>;
  getStatDescription(statName: string, statData: { value: number; sources: string[] }): string;

  processPawnTurn(gameState: GameState): GameState;

  processNeedsTick(gameState: GameState): GameState;

  processAutoDrink(gameState: GameState): GameState;

  processAutoWash(gameState: GameState): GameState;

  shouldPawnSleep(pawn: Pawn): boolean;

  clearTemporaryPawnStates(gameState: GameState): GameState;

  calculateNeedDecay(pawnId: string, gameState: GameState): { hunger: number; rest: number };
  getPawnNeedStatus(
    pawnId: string,
    gameState: GameState
  ): { critical: string[]; warning: string[]; normal: string[] };

  assignPath(pawnId: string, path: { x: number; y: number }[], gameState: GameState): GameState;
  teleportPawn(pawnId: string, pos: { x: number; y: number }, gameState: GameState): GameState;
  processMovement(gameState: GameState): GameState;

  getMoveSpeed(entity: Pawn | Mob): { tilesPerSecond: number; sources: string[] };

  getTransientConditions(entity: Pawn | Mob): TransientConditionDef[];
}

const THIRST_INCREASE_PER_SECOND = needNum('thirst', 'rate', 0.7);
const HYGIENE_INCREASE_PER_SECOND = needNum('hygiene', 'rate', 0.3);
const RELAXATION_DECREASE_PER_SECOND = needNum('relaxation', 'decayRate', 0.13);
const COMFORT_DECREASE_PER_SECOND = needNum('comfort', 'decayRate', 0.1);
const AUTO_DRINK_THIRST = needNum('thirst', 'autoSatisfy', 70);
const AUTO_WASH_HYGIENE = needNum('hygiene', 'autoSatisfy', 75);
const BAREFOOT_MOVE_FACTOR = 0.9;
const WASH_HYGIENE_RELIEF = needNum('hygiene', 'relief', 70);

const DEFAULT_COMFORT_TEMP = 15;
const COLD_FATIGUE_PER_DEG = 0.03;
const HEAT_HUNGER_PER_DEG = 0.02;
const NIGHT_LIGHT_THRESHOLD = 0.3;
const NIGHT_FATIGUE_MUL = 1.1;

const WET_DRY_WARM_REF = 25;
const WET_DRY_SHELTER_SPEED = 0.7;
const WET_DRY_WARMTH_SPEED = 0.6;

const ARMOUR_FATIGUE_SCALE = 0.18;

function wornFatiguePerTurn(pawn: Pawn): number {
  const eq = pawn.equipment;
  if (!eq) return 0;
  let sum = 0;
  for (const slot in eq) {
    const inst = eq[slot as keyof typeof eq];
    if (!inst) continue;
    sum += itemService.getItemById(inst.itemId)?.armorProperties?.fatiguePerTurn ?? 0;
  }
  return sum;
}

export class PawnServiceImpl implements PawnService {
  private RECOVERY_CONFIG = {
    EATING: {
      BASE_HUNGER_REDUCTION: 8,
      BASE_MOOD_BOOST: 2,
      DURATION_TURNS: 2,
      MAX_RECOVERY_PER_TURN: 15
    },
    SLEEPING: {
      BASE_REST_REDUCTION: 12,
      BASE_MOOD_BOOST: 1,
      DURATION_TURNS: 3,
      MAX_RECOVERY_PER_TURN: 20,
      MIN_RECOVERY_THRESHOLD: 30
    },
    RESTING: {
      BASE_REST_REDUCTION: 3,
      DURATION_TURNS: 1,
      MAX_RECOVERY_PER_TURN: 8
    }
  };

  updatePawnNeeds(pawnId: string, gameState: GameState): GameState {
    const pawn = gameState.pawns.find((p) => p.id === pawnId);
    if (!pawn) return gameState;

    const updatedPawn = this.calculateNeedsUpdate(pawn, gameState.turn);

    return {
      ...gameState,
      pawns: gameState.pawns.map((p) => (p.id === pawnId ? updatedPawn : p))
    };
  }

  calculateNeedDecay(pawnId: string, gameState: GameState): { hunger: number; rest: number } {
    const pawn = gameState.pawns.find((p) => p.id === pawnId);
    if (!pawn) return { hunger: 0, rest: 0 };

    return {
      hunger: this.getHungerIncreasePerTurn(pawn),
      rest: this.getRestIncreasePerTurn(pawn)
    };
  }

  getPawnNeedStatus(
    pawnId: string,
    gameState: GameState
  ): { critical: string[]; warning: string[]; normal: string[] } {
    const pawn = gameState.pawns.find((p) => p.id === pawnId);
    if (!pawn) return { critical: [], warning: [], normal: [] };

    const critical = [];
    const warning = [];
    const normal = [];

    if (pawn.needs.hunger > 90) critical.push('hunger');
    else if (pawn.needs.hunger > 70) warning.push('hunger');
    else normal.push('hunger');

    if (pawn.needs.fatigue > 95) critical.push('rest');
    else if (pawn.needs.fatigue > 80) warning.push('rest');
    else normal.push('rest');

    return { critical, warning, normal };
  }

  updatePawnState(pawnId: string, gameState: GameState): GameState {
    const pawn = pawnById(gameState.pawns, pawnId);
    if (!pawn) return gameState;
    pawn.state = this.calculateStateUpdate(pawn, gameState);
    return gameState;
  }

  getPawnActivities(pawnId: string, gameState: GameState): string[] {
    const pawn = gameState.pawns.find((p) => p.id === pawnId);
    if (!pawn) return [];

    const activities = [];

    if (pawn.state.isWorking) {
      const workAssignment = gameState.workAssignments?.[pawnId];
      if (workAssignment?.currentWork) {
        const workCategory = WORK_CATEGORIES.find((w) => w.id === workAssignment.currentWork);
        const workName = workCategory?.name || workAssignment.currentWork;
        activities.push(`Working: ${workName}`);
      } else {
        activities.push('Working (unassigned)');
      }
    }

    if (pawn.state.isSleeping) activities.push('Sleeping');
    if (pawn.state.isEating) activities.push('Eating');

    if (activities.length === 0) {
      const workAssignment = gameState.workAssignments?.[pawnId];
      if (workAssignment?.currentWork) {
        const workCategory = WORK_CATEGORIES.find((w) => w.id === workAssignment.currentWork);
        const workName = workCategory?.name || workAssignment.currentWork;
        activities.push(`Idle (assigned to ${workName})`);
      } else {
        activities.push('Idle (no work assigned)');
      }
    }

    const needStatus = this.getPawnNeedStatus(pawnId, gameState);
    if (needStatus.critical.length > 0) {
      activities.push(`Critical needs: ${needStatus.critical.join(', ')}`);
    }

    return activities;
  }

  categorizeStats(
    stats: Record<string, { value: number; sources: string[] }>
  ): Record<string, string[]> {
    return categorizeStats(stats);
  }

  getStatDescription(statName: string, statData: { value: number; sources: string[] }): string {
    return getStatDescription(statName, statData);
  }

  processPawnTurn(gameState: GameState): GameState {
    let newState = { ...gameState };

    gameState.pawns.forEach((pawn) => {
      if (pawn.isAlive === false) return;
      if (pawn.drafted) return;
      newState = this.updatePawnState(pawn.id, newState);
    });

    return newState;
  }

  shouldPawnSleep(pawn: Pawn): boolean {
    const fatigue = pawn.needs.fatigue;
    const hunger = pawn.needs.hunger;

    if (pawn.state.isSleeping) {
      const wakeThreshold = hunger >= 70 ? 30 : 0;
      const shouldContinueSleeping = fatigue > wakeThreshold && hunger < 87;
      console.log(
        `[PawnService] ${pawn.name} sleeping: fatigue=${fatigue}, hunger=${hunger}, continue=${shouldContinueSleeping}`
      );
      return shouldContinueSleeping;
    }

    if (hunger < 87) {
      return fatigue >= 72;
    } else {
      return false;
    }
  }

  private getNeedIncreasePerTurn(pawn: Pawn): {
    hunger: number;
    fatigue: number;
    thirstRate: number;
    hygieneRate: number;
  } {
    const transientConditions = getActiveTransientConditions(pawn);

    let hungerRate = transientConditions.reduce((r, e) => r * (e.modifiers.hungerRate ?? 1), 1);
    let fatigueRate = transientConditions.reduce((r, e) => r * (e.modifiers.fatigueRate ?? 1), 1);
    let thirstRate = transientConditions.reduce((r, e) => r * (e.modifiers.thirstRate ?? 1), 1);
    let hygieneRate = transientConditions.reduce((r, e) => r * (e.modifiers.hygieneRate ?? 1), 1);

    const condMults = conditionNeedMultipliers(pawn.conditions ?? []);
    hungerRate *= condMults.hungerRate;
    fatigueRate *= condMults.fatigueRate;
    thirstRate *= condMults.thirstRate;
    hygieneRate *= condMults.hygieneRate;

    return {
      hunger: this.getHungerIncreasePerTurn(pawn) * hungerRate,
      fatigue: this.getRestIncreasePerTurn(pawn) * fatigueRate,
      thirstRate,
      hygieneRate
    };
  }

  private calculateNeedsUpdate(pawn: Pawn, currentTurn: number): Pawn {
    const updatedPawn = { ...pawn };
    const { hunger: hungerIncrease, fatigue: fatigueIncrease } = this.getNeedIncreasePerTurn(pawn);

    updatedPawn.needs = {
      ...pawn.needs,
      hunger: Math.min(100, pawn.needs.hunger + hungerIncrease),
      fatigue: Math.min(100, pawn.needs.fatigue + fatigueIncrease),
      sleep: pawn.needs.sleep || 0
    };

    return updatedPawn;
  }

  processNeedsTick(gameState: GameState): GameState {
    const dt = SECONDS_PER_TICK;
    let changed = false;

    const pawns = gameState.pawns;
    const weatherFx = weatherEffects(gameState.weather);
    const weatherTemp = weatherFx.tempDelta + diurnalTempDelta(gameState.turn, gameState.season);
    const nightFatigueMul =
      getAmbientLight(gameState.turn) < NIGHT_LIGHT_THRESHOLD ? NIGHT_FATIGUE_MUL : 1;
    const dis = gameState._needsDisabled;
    const disHunger = dis?.hunger === true;
    const disFatigue = dis?.fatigue === true;
    const disThirst = dis?.thirst === true;
    const disHygiene = dis?.hygiene === true;
    const disWetness = dis?.wetness === true;
    const disRelaxation = dis?.relaxation === true;
    const disComfort = dis?.comfort === true;
    const worldMap = gameState.worldMap;
    for (let i = 0; i < pawns.length; i++) {
      const pawn = pawns[i];
      if (pawn.isAlive === false) continue;

      const rate = this.getNeedIncreasePerTurn(pawn);
      const pos = pawn.position;
      const tile = pos ? worldMap[pos.y]?.[pos.x] : undefined;
      const thermal = pos ? thermalAt(pos.x, pos.y) : undefined;
      const base = tile
        ? seasonBakedTemp(tile.terrainType, gameState.season)
        : DEFAULT_COMFORT_TEMP;
      const temp = thermal ? effectiveTemperature(base, weatherTemp, thermal) : base + weatherTemp;
      const tol = pawnStatService.temperatureTolerance(pawn);
      const cold = tol.coldOnset - temp;
      const heat = temp - tol.heatOnset;
      const fatigueMul =
        weatherFx.fatigueMul * nightFatigueMul * (cold > 0 ? 1 + cold * COLD_FATIGUE_PER_DEG : 1);
      const hungerMul = weatherFx.hungerMul * (heat > 0 ? 1 + heat * HEAT_HUNGER_PER_DEG : 1);

      const needs = pawn.needs;
      const hunger = disHunger
        ? needs.hunger
        : Math.min(100, needs.hunger + rate.hunger * hungerMul * dt);
      const fatigue = disFatigue
        ? needs.fatigue
        : Math.min(100, needs.fatigue + rate.fatigue * fatigueMul * dt);
      const thirst = disThirst
        ? (needs.thirst ?? 0)
        : Math.min(100, (needs.thirst ?? 0) + THIRST_INCREASE_PER_SECOND * rate.thirstRate * dt);
      const hygiene = disHygiene
        ? (needs.hygiene ?? 0)
        : Math.min(100, (needs.hygiene ?? 0) + HYGIENE_INCREASE_PER_SECOND * rate.hygieneRate * dt);

      const wet0 = needs.wetness ?? 0;
      let tileWet = tile
        ? tileWetness(tile.moisture ?? 0, gameState.weather, thermal, tile.ice ?? 0)
        : 0;
      if (tile?.floor) tileWet *= 1 - tile.floor.dryness;
      const warmth = Math.max(0, Math.min(1, temp / WET_DRY_WARM_REF));
      const drySpeed = Math.min(
        1,
        warmth * WET_DRY_WARMTH_SPEED + (thermal?.roofed ? WET_DRY_SHELTER_SPEED : 0)
      );
      const wetRes = pawnStatService.evaluateStat('wetness_resistance', pawn);
      const wetness = disWetness ? wet0 : accrueWetness(wet0, tileWet, dt, wetRes, drySpeed);

      const relaxation0 = needs.relaxation ?? 100;
      const relaxRate = pawn.conditions?.length
        ? conditionNeedMultipliers(pawn.conditions).relaxationRate
        : 1;
      const relaxation =
        disRelaxation || pawn.currentState === 'Socialising'
          ? relaxation0
          : Math.max(0, relaxation0 - RELAXATION_DECREASE_PER_SECOND * relaxRate * dt);

      const comfort0 = needs.comfort ?? 100;
      const comfort =
        disComfort || pawn.currentState === 'Lounging'
          ? comfort0
          : Math.max(0, comfort0 - COMFORT_DECREASE_PER_SECOND * dt);

      const prevHealth = pawn.state.health ?? 100;
      const health =
        prevHealth < 100
          ? Math.min(100, prevHealth + this.getHealthRegenPerTurn(needs) * dt)
          : prevHealth;

      if (
        hunger === needs.hunger &&
        fatigue === needs.fatigue &&
        thirst === (needs.thirst ?? 0) &&
        hygiene === (needs.hygiene ?? 0) &&
        wetness === wet0 &&
        relaxation === relaxation0 &&
        comfort === comfort0 &&
        health === prevHealth
      ) {
        continue;
      }

      needs.hunger = hunger;
      needs.fatigue = fatigue;
      needs.thirst = thirst;
      needs.hygiene = hygiene;
      needs.wetness = wetness;
      needs.relaxation = relaxation;
      needs.comfort = comfort;
      pawn.state.health = health;
      changed = true;
    }

    if (!changed) return gameState;
    return { ...gameState, pawns: pawns.slice() };
  }

  processAutoDrink(gameState: GameState): GameState {
    let state = gameState;
    for (const pawn of gameState.pawns) {
      if (pawn.isAlive === false) continue;
      if ((pawn.needs.thirst ?? 0) < AUTO_DRINK_THIRST) continue;

      const skin = carriedDrinkVessel(pawn);
      if (skin) {
        const litres = Math.min(1, skin.litres);
        takeOut(skin.inst, skin.itemId, litres);
        state = this.adjustThirst(pawn.id, -litres * hydrationOf(skin.itemId), 0, state);
        continue;
      }
      if (pawn.position && this.isNextToWater(pawn.position.x, pawn.position.y, state)) {
        state = this.adjustThirst(pawn.id, -hydrationOf('water'), 6, state);
      }
    }
    return state;
  }

  processAutoWash(gameState: GameState): GameState {
    let state = gameState;
    for (const pawn of gameState.pawns) {
      if (pawn.isAlive === false) continue;
      if ((pawn.needs.hygiene ?? 0) < AUTO_WASH_HYGIENE) continue;
      if (pawn.position && this.isNextToWater(pawn.position.x, pawn.position.y, state)) {
        state = this.adjustHygiene(pawn.id, -WASH_HYGIENE_RELIEF, state);
      }
    }
    return state;
  }

  private adjustHygiene(pawnId: string, hygieneDelta: number, gameState: GameState): GameState {
    const pawn = gameState.pawns.find((p) => p.id === pawnId);
    if (pawn) {
      pawn.needs.hygiene = Math.min(100, Math.max(0, (pawn.needs.hygiene ?? 0) + hygieneDelta));
      pawn.needs.lastWash = gameState.turn;
    }
    return gameState;
  }

  private adjustThirst(
    pawnId: string,
    thirstDelta: number,
    hygieneDelta: number,
    gameState: GameState
  ): GameState {
    const pawn = gameState.pawns.find((p) => p.id === pawnId);
    if (pawn) {
      pawn.needs.thirst = Math.max(0, (pawn.needs.thirst ?? 0) + thirstDelta);
      pawn.needs.hygiene = Math.min(100, Math.max(0, (pawn.needs.hygiene ?? 0) + hygieneDelta));
      pawn.needs.lastDrink = gameState.turn;
    }
    return gameState;
  }

  private isNextToWater(x: number, y: number, gameState: GameState): boolean {
    const map = gameState.worldMap;
    if (!map) return false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const t = map[y + dy]?.[x + dx];
        if (t && (t.type === 'water' || t.terrainType === 'river' || t.terrainType === 'lake')) {
          return true;
        }
      }
    }
    return false;
  }

  private calculateStateUpdate(pawn: Pawn, gameState: GameState): PawnState {
    const needs = pawn.needs;
    const newState = { ...pawn.state };

    if (needs.hunger > 90) {
      newState.isWorking = false;
      newState.isSleeping = false;
      newState.isEating = true;
    } else if (needs.fatigue > 95) {
      newState.isWorking = false;
      newState.isEating = false;
      newState.isSleeping = true;
    } else if (needs.fatigue > 90) {
      newState.isWorking = false;
    }

    const target = this.computeMoodTarget(pawn, gameState);
    const cur = newState.mood ?? MOOD_BASE;
    const gap = target - cur;
    newState.mood =
      Math.abs(gap) <= MOOD_EASE_STEP ? target : cur + Math.sign(gap) * MOOD_EASE_STEP;

    return newState;
  }

  computeMoodTarget(
    pawn: Pawn,
    gameState: GameState,
    out: { label: string; value: number }[] | null = null
  ): number {
    let t = MOOD_BASE;

    const wEff = moodEffect(weatherEffects(gameState.weather).mood);
    if (wEff && wEff.value != null && wEff.value !== 0) {
      let v = wEff.value;
      if (v < 0 && pawn.position && isRoofedTile(pawn.position.x, pawn.position.y)) v *= 0.4;
      t += v;
      if (out) out.push({ label: wEff.label, value: v });
    }

    if (pawn.position) {
      const a = amenityAt(gameState.buildings, pawn.position.x, pawn.position.y);
      const am = Math.min(3, a.beauty * 1.5);
      if (am > 0) {
        t += am;
        const e = moodEffect('amenity_pleasant');
        if (out && e) out.push({ label: e.label, value: am });
      }
    }

    const cEff = moodEffect(celestialMoodEffect(gameState.turn) ?? undefined);
    if (
      cEff &&
      cEff.value != null &&
      cEff.value !== 0 &&
      !(cEff.negatedBy && pawnHasCondition(pawn, cEff.negatedBy))
    ) {
      t += cEff.value;
      if (out) out.push({ label: cEff.label, value: cEff.value });
    }

    const n = pawn.needs;
    for (const need in NEED_MOOD) {
      let v: number;
      switch (need) {
        case 'hunger':
          v = n.hunger;
          break;
        case 'fatigue':
          v = n.fatigue;
          break;
        case 'thirst':
          v = n.thirst ?? 0;
          break;
        case 'hygiene':
          v = n.hygiene ?? 0;
          break;
        case 'relaxation':
          v = n.relaxation ?? 100;
          break;
        default:
          continue;
      }
      for (const band of NEED_MOOD[need].moodBands ?? []) {
        const hit =
          (band.atOrAbove != null && v >= band.atOrAbove) ||
          (band.atOrBelow != null && v <= band.atOrBelow);
        if (hit) {
          const e = moodEffect(band.effect);
          if (e && e.value != null) {
            t += e.value;
            if (out) out.push({ label: e.label, value: e.value });
          }
          break;
        }
      }
    }

    for (const tr of pawn.traits ?? []) {
      const e = moodEffect(tr.mood);
      if (e && e.value != null) {
        t += e.value;
        if (out) out.push({ label: e.label, value: e.value });
      }
    }

    const countedConditions = new Set<string>();
    for (const c of pawn.conditions ?? []) {
      countedConditions.add(c.id);
      const e = moodEffect(getConditionDefById(c.id)?.mood);
      if (e && e.value != null) {
        t += e.value;
        if (out) out.push({ label: e.label, value: e.value });
      }
    }
    for (const id of pawn.transientConditions ?? []) {
      const cid = id.includes(':') ? id.split(':')[0] : id;
      if (countedConditions.has(cid)) continue;
      const e = moodEffect(getConditionDefById(cid)?.mood);
      if (e && e.value != null) {
        t += e.value;
        if (out) out.push({ label: e.label, value: e.value });
      }
    }

    for (const m of pawn.moodModifiers ?? []) {
      const v = moodModifierValue(m, gameState.turn);
      if (v) {
        t += v;
        if (out) out.push({ label: m.label, value: v });
      }
    }

    return t < 0 ? 0 : t > 100 ? 100 : t;
  }

  getMoodBreakdown(
    pawn: Pawn,
    gameState: GameState
  ): { mood: number; target: number; contributions: { label: string; value: number }[] } {
    const contributions: { label: string; value: number }[] = [];
    const target = this.computeMoodTarget(pawn, gameState, contributions);
    return { mood: Math.round(effectiveMood(pawn)), target: Math.round(target), contributions };
  }

  private getHealthRegenPerTurn(needs: EntityNeeds): number {
    let regen = 0.5;

    if (needs.hunger < 30 && needs.fatigue < 30) {
      regen *= 2;
    }

    if (needs.hunger > 80 || needs.fatigue > 80) {
      regen *= 0.5;
    }

    return regen;
  }

  private getRestIncreasePerTurn(pawn: Pawn): number {
    let baseRest = 0.32 * pawnStatService.evaluateStat('fatigue_rate', pawn);

    if (pawn.state.isWorking) {
      baseRest *= 1.5;
    }

    if ((pawn.state as any).inCombat) {
      baseRest *= 2.5;
    }

    pawn.traits.forEach((trait) => {
      if ((trait.effects as any).fatigueRate) {
        baseRest *= (trait.effects as any).fatigueRate;
      }
      switch (trait.name) {
        case 'Tireless':
          baseRest *= 0.7;
          break;
        case 'Energetic':
          baseRest *= 0.8;
          break;
        case 'Lazy':
          baseRest *= 1.3;
          break;
        case 'Frail':
          baseRest *= 1.4;
          break;
      }
    });

    baseRest += wornFatiguePerTurn(pawn) * ARMOUR_FATIGUE_SCALE;

    return Math.max(0.1, baseRest);
  }

  private getHungerIncreasePerTurn(pawn: Pawn): number {
    let baseHunger = 0.54 * pawnStatService.evaluateStat('hunger_rate', pawn);

    if (pawn.state.isWorking) {
      baseHunger *= 1.4;
    }

    pawn.traits.forEach((trait) => {
      switch (trait.name) {
        case 'Efficient Metabolism':
          baseHunger *= 0.7;
          break;
        case 'Large Appetite':
          baseHunger *= 1.4;
          break;
        case 'Hardy':
          baseHunger *= 0.9;
          break;
      }
    });

    return Math.max(0.1, baseHunger);
  }

  clearTemporaryPawnStates(gameState: GameState): GameState {
    try {
      let changed = false;
      for (const pawn of gameState.pawns) {
        let shouldClearStates = false;

        if (pawn.state.isEating) {
          shouldClearStates = true;
        }

        if (pawn.state.isSleeping && !this.shouldPawnSleep(pawn)) {
          shouldClearStates = true;
        }

        if (shouldClearStates) {
          pawn.state.isEating = false;
          pawn.state.isSleeping = false;
          changed = true;
        }
      }

      return changed ? { ...gameState, pawns: gameState.pawns.slice() } : gameState;
    } catch (error) {
      console.error('[PawnService] Error in clearTemporaryPawnStates:', error);
      return gameState;
    }
  }

  assignPath(pawnId: string, path: { x: number; y: number }[], gameState: GameState): GameState {
    return {
      ...gameState,
      pawns: gameState.pawns.map((p) =>
        p.id === pawnId
          ? {
              ...p,
              path,
              pathIndex: 0,
              isMoving: path.length > 0,
              hasReachedDestination: false
            }
          : p
      )
    };
  }

  teleportPawn(pawnId: string, pos: { x: number; y: number }, gameState: GameState): GameState {
    return {
      ...gameState,
      pawns: gameState.pawns.map((p) =>
        p.id === pawnId
          ? {
              ...p,
              position: pos,
              path: [],
              pathIndex: 0,
              isMoving: false,
              hasReachedDestination: true
            }
          : p
      )
    };
  }

  getMoveSpeed(entity: Pawn | Mob): { tilesPerSecond: number; sources: string[] } {
    const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
    const sources: string[] = [];

    const base = 4.0;

    const dex = entity.stats?.dexterity ?? 10;
    const dexFactor = clamp(0.5 + dex / 20, 0.4, 1.8);
    sources.push(`DEX ${dex} ×${dexFactor.toFixed(2)}`);

    const str = entity.stats?.strength ?? 10;
    const weight = entity.physicalTraits?.weight ?? 60;
    const capacity = Math.max(1, str * 6);
    const weightFactor = clamp(1.15 - 0.15 * (weight / capacity), 0.65, 1.1);
    sources.push(`${weight}kg/STR${str} ×${weightFactor.toFixed(2)}`);

    let legFactor = 1;
    const legs = (entity.limbs ?? []).filter((l) => l.id === 'left_leg' || l.id === 'right_leg');
    if (legs.length > 0) {
      const locomotion =
        legs.reduce((sum, l) => sum + (l.isMissing ? 0 : l.health / 100), 0) / legs.length;
      legFactor = clamp(locomotion, 0.1, 1);
      if (legFactor < 0.999) sources.push(`legs ×${legFactor.toFixed(2)}`);
    }

    const hunger = entity.needs?.hunger ?? 0;
    const fatigue = entity.needs?.fatigue ?? 0;
    const hungerPenalty = Math.max(0, (hunger - 50) / 50) * 0.25;
    const fatiguePenalty = Math.max(0, (fatigue - 50) / 50) * 0.25;
    const needsFactor = clamp(1 - hungerPenalty - fatiguePenalty, 0.5, 1);
    if (needsFactor < 0.999) sources.push(`needs ×${needsFactor.toFixed(2)}`);

    const boot = (entity as Pawn).equipment?.boots;
    const bootPenalty = boot
      ? (itemService.getItemById(boot.itemId)?.armorProperties?.movementPenalty ?? 0)
      : 0;
    const footFactor = boot ? clamp(1 - bootPenalty, 0.8, 1) : BAREFOOT_MOVE_FACTOR;
    if (Math.abs(footFactor - 1) > 0.001)
      sources.push(boot ? `boots ×${footFactor.toFixed(2)}` : `barefoot ×${footFactor.toFixed(2)}`);

    let conditionFactor = getActiveTransientConditions(entity).reduce(
      (r, e) => r * (e.modifiers.moveSpeed ?? 1),
      1
    );
    for (const c of entity.conditions ?? []) {
      const stage = getConditionCurrentStage(c);
      if (stage?.modifiers.moveSpeed != null) conditionFactor *= stage.modifiers.moveSpeed;
    }
    if (Math.abs(conditionFactor - 1) > 0.001)
      sources.push(`conditions ×${conditionFactor.toFixed(2)}`);

    let loadFactor = 1;
    const inv = (entity as Pawn).inventory;
    const itemEntries = inv?.items ? Object.entries(inv.items) : [];
    const instances = inv?.instances ?? [];
    if (itemEntries.length > 0 || instances.length > 0) {
      const budget = itemService.getCarryBudget(entity as Pawn, {} as GameState);
      let lw = 0;
      let lv = 0;
      for (const [id, qty] of itemEntries) {
        if (qty <= 0) continue;
        const d = itemService.getItemById(id);
        lw += (d?.weightKg ?? 0.1) * qty;
        lv += (d?.volumeL ?? 0.2) * qty;
      }
      for (const it of instances) {
        const d = itemService.getItemById(it.itemId);
        lw += d?.weightKg ?? 0.5;
        lv += d?.volumeL ?? 0.5;
      }
      const fw = budget.maxWeightKg > 0 ? lw / budget.maxWeightKg : 0;
      const fv = budget.maxVolumeL > 0 ? lv / budget.maxVolumeL : 0;
      const loadFrac = clamp(Math.max(fw, fv), 0, 1);
      loadFactor = clamp(1 - loadFrac * 0.4, 0.6, 1);
      if (loadFactor < 0.999) sources.push(`load ×${loadFactor.toFixed(2)}`);
    }

    const tilesPerSecond = Math.max(
      0.05,
      base *
        dexFactor *
        weightFactor *
        legFactor *
        needsFactor *
        conditionFactor *
        loadFactor *
        footFactor
    );
    return { tilesPerSecond, sources };
  }

  getTransientConditions(entity: Pawn | Mob): TransientConditionDef[] {
    return getActiveTransientConditions(entity).filter((e) => !e.hidden);
  }

  processMovement(gameState: GameState): GameState {
    let state = gameState;

    const occupied = occupancyService.blockedTiles(state);
    const targetByTile = occupancyService.movingTargets(state);
    const claimed = new Set<string>();
    for (const p of state.pawns) {
      if (p.isAlive === false || !p.position || !p.path?.length || p.nextCellCostLeft == null)
        continue;
      const t = p.path[p.pathIndex ?? 0];
      if (t) claimed.add(`${t.x},${t.y}`);
    }

    const patch = (p: Pawn, fields: Partial<Pawn>) => Object.assign(p, fields);

    for (const pawn of state.pawns) {
      if (pawn.isAlive === false) continue;
      if (!pawn.isMoving && pawn.path && pawn.path.length > 0) {
        patch(pawn, { path: [], pathIndex: 0, nextCellCostLeft: undefined });
        continue;
      }
      if (!pawn.isMoving || !pawn.path || pawn.path.length === 0 || !pawn.position) continue;

      const speed = Math.max(0.01, this.getMoveSpeed(pawn).tilesPerSecond);
      const res = stepBody(
        {
          id: pawn.id,
          x: pawn.position.x,
          y: pawn.position.y,
          path: pawn.path,
          pathIndex: pawn.pathIndex,
          nextCellCostLeft: pawn.nextCellCostLeft,
          blockedTicks: pawn.blockedTicks
        },
        occupied,
        claimed,
        state.worldMap,
        speed,
        targetByTile
      );

      if (res.status === 'held' || res.status === 'idle') {
        patch(pawn, { blockedTicks: res.body.blockedTicks });
      } else if (res.status === 'dropped') {
        patch(pawn, {
          path: [],
          pathIndex: 0,
          nextCellCostLeft: undefined,
          isMoving: false,
          hasReachedDestination: false,
          blockedTicks: 0
        });
      } else {
        const b = res.body;
        patch(pawn, {
          position: { x: b.x, y: b.y },
          path: b.path ?? [],
          pathIndex: b.pathIndex ?? 0,
          isMoving: !res.done,
          hasReachedDestination: res.done,
          blockedTicks: 0,
          nextCellCostLeft: b.nextCellCostLeft
        });
      }
    }
    return state;
  }
}

export const pawnService = new PawnServiceImpl();
