import type { GameState, Mob, MobState, Pawn, DroppedItem } from '../../core/types';
import { getCreatureById, type CreatureDefinition } from '../../core/defs/creatures';
import { getAmbientLight, computeTileLightLevel, weatherSightMul } from '../EnvironmentService';
import {
  effectiveVisionRange,
  getNightVision,
  dampenLightByNightVision
} from '../../core/rules/body/vision';
import { hasLineOfSight } from '../../core/util/lineOfSight';
import { manhattan, chebyshev } from '../../core/util/distance';
import { ticksFromSeconds, SECONDS_PER_TICK } from '../../core/util/time';
import { calcMaxStamina } from '../../entities/Pawns';
import { gameLogger } from '../../debug/gameLogger';
import { rng } from '../../core/util/rng';
import { markTileDirty } from '../../core/state/tileDeltas';
import { addWildGrowth } from '../../core/rules/world/wildGrowth';
import { consumeTop } from '../../core/rules/world/carcassCondition';
import { resourceObjectService } from '../ResourceObjectService';
import { pawnStatService } from '../PawnStatService';
import { COLLAPSE_CONSCIOUSNESS, RECOVER_CONSCIOUSNESS } from '../../core/rules/body/conditions';
import {
  nearestPawn,
  isPawnDetected,
  dist,
  adjacent,
  moveToward,
  pathTo,
  fleeToSafety,
  wanderStep,
  nearestPredatorThreat,
  findNearestPrey,
  findNearestFoodTile,
  findReachableFoodTile,
  huntAttacker,
  approachForMelee,
  edibleResourceOnTile,
  mobInLiveRegion,
  isThinkTick,
  entityName
} from './entityHelpers';
import { simLog } from '../../core/util/logSink';
import {
  type TileFoodKind,
  NIGHT_THRESHOLD,
  STARVATION_COLLAPSE_SEVERITY,
  FLEE_HEALTH_FRACTION,
  HUNGER_SATED_THRESHOLD,
  HUNGER_EAT_THRESHOLD,
  willFinishOffDowned,
  FORAGE_RADIUS,
  LIVE_RADIUS,
  THREAT_INTERRUPT_RANGE,
  TERRITORIAL_LEASH,
  AI_THROTTLE_TICKS,
  SLEEP_FATIGUE_THRESHOLD,
  SLEEP_MAX_HUNGER,
  HUNT_OVERSTRETCH_TILES,
  HUNGER_OVERSTRETCH_THRESHOLD,
  SAFE_RESET_TICKS,
  STARTLED_TICKS,
  FLEE_STAMINA_DRAIN_PER_SECOND,
  sleepWakeThreshold,
  EAT_GRASS_SECONDS,
  EAT_CORPSE_SECONDS,
  EAT_GRASS_HUNGER_RESTORE,
  EAT_CORPSE_HUNGER_RESTORE,
  EAT_FORAGE_HUNGER_RESTORE,
  CORPSE_PORTION,
  HUNT_COOLDOWN_SECONDS,
  FORAGE_COOLDOWN_SECONDS,
  FEEDING_STUCK_SECONDS,
  HUNT_GIVE_UP_SECONDS,
  WILD_FORAGE_RESOURCE_IDS,
  CARCASS_SCAVENGE_RADIUS,
  EAT_CARCASS_HUNGER_RESTORE
} from './entityConstants';

let _huntSlots = 0;
let _thinkDtTicks = 1;
const ROTTEN_CARCASS_ID = 'rotten_carcass';
let _pendingDropConsumption = new Map<string, number>();
function findNearestCarcassDrop(state: GameState, mob: Mob): DroppedItem | null {
  const drops = state.droppedItems;
  if (!drops || drops.length === 0) return null;
  let best: DroppedItem | null = null;
  let bd = Infinity;
  for (const d of drops) {
    if (d.resourceId !== ROTTEN_CARCASS_ID || (d.quantity ?? 0) <= 0) continue;
    if (chebyshev(mob.x, mob.y, d.x, d.y) > CARCASS_SCAVENGE_RADIUS) continue;
    const md = manhattan(mob.x, mob.y, d.x, d.y);
    if (md < bd) {
      bd = md;
      best = d;
    }
  }
  return best;
}
function takeHuntSlot(): boolean {
  if (_huntSlots <= 0) return false;
  _huntSlots--;
  return true;
}
const HUNT_BUSY_BACKOFF_MIN_S = 4;
const HUNT_BUSY_BACKOFF_JITTER_S = 16;

const STUCK_TRACE_ENABLED = true;
const _posTrack = new Map<string, { x: number; y: number; since: number; lastLog: number }>();
const STUCK_LOG_AFTER = 60;
const STUCK_LOG_EVERY = 180;
const STUCK_MOVING_STATES = new Set<MobState>([
  'Wander',
  'Hunting',
  'Fleeing',
  'Alerted',
  'Foraging',
  'Grazing',
  'Startled'
]);

function cellDesc(state: GameState, x: number, y: number, selfId: string): string {
  const tile = state.worldMap[y]?.[x];
  if (!tile || !tile.walkable) return 'wall';
  for (const p of state.pawns)
    if (p.isAlive !== false && p.position?.x === x && p.position?.y === y)
      return `pawn#${p.id.slice(-6)}`;
  for (const m of state.mobs ?? []) {
    if (m.id === selfId || m.x !== x || m.y !== y) continue;
    if (m.state === 'Corpse') return `corpse#${m.id.slice(-6)}`;
    return `${getCreatureById(m.creatureId)?.id ?? 'mob'}#${m.id.slice(-6)}(${m.state})`;
  }
  return 'free';
}

function nearbyCorpse(state: GameState, mob: Mob, r: number): string {
  for (const m of state.mobs ?? []) {
    if (m.state !== 'Corpse' || (m.intactness ?? 1) <= 0) continue;
    const d = chebyshev(m.x, m.y, mob.x, mob.y);
    if (d <= r) return `(${m.x},${m.y})d=${d}i=${(m.intactness ?? 1).toFixed(2)}`;
  }
  return 'no';
}

function traceStuck(mob: Mob, def: CreatureDefinition, state: GameState, turn: number): void {
  if (!STUCK_TRACE_ENABLED || !gameLogger.isEnabled) return;
  if (_posTrack.size > 8000) _posTrack.clear();
  const rec = _posTrack.get(mob.id);
  if (!rec || rec.x !== mob.x || rec.y !== mob.y) {
    _posTrack.set(mob.id, { x: mob.x, y: mob.y, since: turn, lastLog: 0 });
    return;
  }
  const stuckFor = turn - rec.since;
  if (stuckFor < STUCK_LOG_AFTER || !STUCK_MOVING_STATES.has(mob.state)) return;
  if (rec.lastLog && turn - rec.lastLog < STUCK_LOG_EVERY) return;
  rec.lastLog = turn;
  const pathLen = mob.path?.length ?? 0;
  const nextCell = pathLen > 0 ? mob.path![mob.pathIndex ?? 0] : null;
  const nextDesc = nextCell
    ? `next=(${nextCell.x},${nextCell.y})[${cellDesc(state, nextCell.x, nextCell.y, mob.id)}]`
    : 'next=NONE';
  gameLogger.log(
    turn,
    'ENTITY-STUCK',
    `${def.id}#${mob.id.slice(-6)} STUCK ${stuckFor}t @(${mob.x},${mob.y}) state=${mob.state}` +
      ` hunger=${mob.needs.hunger.toFixed(1)}/${HUNGER_EAT_THRESHOLD} blockedTicks=${mob.blockedTicks ?? 0}` +
      ` costLeft=${(mob.nextCellCostLeft ?? 0).toFixed(1)} path=${pathLen > 0 ? `${mob.pathIndex ?? 0}/${pathLen}` : 'none'}` +
      ` ${nextDesc} adjCorpse=${nearbyCorpse(state, mob, 1)} corpse5=${nearbyCorpse(state, mob, 5)}` +
      (mob.huntTargetId ? ` prey=${mob.huntTargetId.slice(-6)}` : '')
  );
}

const TRACE_MOB_ID = '';
const TRACE_CREATURE = '';

let _traceMobId = TRACE_MOB_ID;
let _traceCreature = TRACE_CREATURE;
let _traceActive = !!(TRACE_MOB_ID || TRACE_CREATURE);

export function setEntityTrace(opts: { id?: string; creature?: string } | null): void {
  _traceMobId = opts?.id ?? '';
  _traceCreature = opts?.creature ?? '';
  _traceActive = !!(_traceMobId || _traceCreature);
  _stepReason = null;
  _stepTiming.clear();
}
export function isEntityTraceActive(): boolean {
  return _traceActive;
}

let _stepReason: string | null = null;
function stepReason(tag: string): void {
  if (_traceActive) _stepReason = tag;
}

const _stepTiming = new Map<string, { calls: number; ms: number }>();
function timedStep<T>(label: string, fn: () => T): T {
  if (!_traceActive) return fn();
  const t0 = performance.now();
  const r = fn();
  const e = _stepTiming.get(label) ?? { calls: 0, ms: 0 };
  e.calls++;
  e.ms += performance.now() - t0;
  _stepTiming.set(label, e);
  return r;
}
export function drainEntityTiming(): Array<{ label: string; calls: number; ms: number }> {
  const out = [..._stepTiming.entries()]
    .map(([label, e]) => ({ label, calls: e.calls, ms: Math.round(e.ms * 1000) / 1000 }))
    .sort((a, b) => b.ms - a.ms);
  _stepTiming.clear();
  return out;
}

function isTraced(mob: Mob): boolean {
  if (!gameLogger.isEnabled || mob.state === 'Sleeping' || mob.state === 'Corpse') return false;
  return (
    (!!_traceMobId && mob.id.endsWith(_traceMobId)) ||
    (!!_traceCreature && mob.creatureId === _traceCreature)
  );
}
function foodCtx(state: GameState, x: number, y: number): string {
  const res = state.worldMap[y]?.[x]?.resources;
  const resStr = res
    ? Object.entries(res)
        .filter(([, n]) => (n ?? 0) > 0)
        .map(([k, n]) => `${k}:${n}`)
        .join(',')
    : '';
  const drops = (state.droppedItems ?? [])
    .filter((d) => d.x === x && d.y === y)
    .map((d) => `${d.resourceId}×${d.quantity}`)
    .join(',');
  const corpse = (state.mobs ?? []).find((m) => m.x === x && m.y === y && m.state === 'Corpse');
  return (
    `res={${resStr}} drops=[${drops}]` +
    (corpse
      ? ` corpse=${getCreatureById(corpse.creatureId)?.id ?? '?'}#${corpse.id.slice(-6)}`
      : '')
  );
}
function traceMobTick(
  mob: Mob,
  state: GameState,
  turn: number,
  phase: string,
  prevState?: string
): void {
  if (!isTraced(mob)) return;
  const pathLen = mob.path?.length ?? 0;
  const nc = pathLen > 0 ? mob.path![mob.pathIndex ?? 0] : null;
  const end = pathLen > 0 ? mob.path![pathLen - 1] : null;
  const transition = prevState && prevState !== mob.state ? `${prevState}→${mob.state} ` : '';
  gameLogger.log(
    turn,
    'ENTITY-STATE',
    `${getCreatureById(mob.creatureId)?.id ?? 'mob'}#${mob.id.slice(-6)} [${phase}] ${transition}via=${_stepReason ?? '-'} state=${mob.state}` +
      ` pos=(${mob.x},${mob.y}) hunger=${mob.needs.hunger.toFixed(1)} fatigue=${mob.needs.fatigue.toFixed(1)}` +
      ` eat=${mob.eatProgress?.toFixed(2) ?? '-'} since=${turn - mob.stateSince}` +
      ` blocked=${mob.blockedTicks ?? 0} costLeft=${(mob.nextCellCostLeft ?? 0).toFixed(1)}` +
      ` path=${pathLen > 0 ? `${mob.pathIndex ?? 0}/${pathLen} end=(${end!.x},${end!.y})` : 'none'}` +
      (nc ? ` next=(${nc.x},${nc.y})[${cellDesc(state, nc.x, nc.y, mob.id)}]` : '') +
      ` fCD=${mob.forageCooldownUntil ? Math.max(0, mob.forageCooldownUntil - turn) : 0}` +
      ` hCD=${mob.huntCooldownUntil ? Math.max(0, mob.huntCooldownUntil - turn) : 0}` +
      (mob.huntTargetId ? ` prey=${mob.huntTargetId.slice(-6)}` : '') +
      ` | @pos ${foodCtx(state, mob.x, mob.y)}` +
      (end ? ` | @tgt(${end.x},${end.y}) ${foodCtx(state, end.x, end.y)}` : '')
  );
}

export function stepEntities(state: GameState): GameState {
  const mobs = state.mobs;
  if (!mobs || mobs.length === 0) return state;
  const turn = state.turn;

  let activeHunts = 0;
  for (const m of mobs) if (m.state === 'Hunting' || m.state === 'Attacking') activeHunts++;
  const MAX_CONCURRENT_HUNTS = Math.max(40, Math.floor(mobs.length * 0.15));
  _huntSlots = Math.max(0, MAX_CONCURRENT_HUNTS - activeHunts);

  const livePawns = state.pawns.filter((p) => p.position && p.isAlive !== false);
  const pendingDamage = new Map<string, number>();
  const pendingMeatConsumption = new Map<string, number>();
  _pendingDropConsumption = new Map<string, number>();
  const pendingTileDepletion: Array<{ x: number; y: number; id: string }> = [];
  const pendingMobState = new Map<string, Partial<Mob>>();
  let changed = false;
  const next: Mob[] = new Array(mobs.length);

  const lodActive = livePawns.length > 0;

  for (let i = 0; i < mobs.length; i++) {
    const mob = mobs[i];
    if (mob.state === 'Corpse') {
      next[i] = mob;
      continue;
    }
    const def = getCreatureById(mob.creatureId);
    if (!def) {
      next[i] = mob;
      continue;
    }
    const inBubble = !lodActive || mobInLiveRegion(mob, livePawns, LIVE_RADIUS);
    if (
      !inBubble &&
      !isThinkTick(mob.id, turn) &&
      !nearestPredatorThreat(mob, def, mobs, THREAT_INTERRUPT_RANGE)
    ) {
      if (_traceActive) _stepReason = 'throttled';
      next[i] =
        mob.state === 'Traveling'
          ? travelStep(mob, state)
          : mob.state === 'Wander' || mob.state === 'Grazing'
            ? wanderStep(mob, def, state)
            : mob;
      traceMobTick(next[i], state, turn, 'throttled', mob.state);
      continue;
    }
    _thinkDtTicks = inBubble
      ? 1
      : Math.min(AI_THROTTLE_TICKS, Math.max(1, turn - (mob.lastThinkTick ?? turn - 1)));
    mob.lastThinkTick = turn;
    if (_traceActive) _stepReason = null;
    const stepped = timedStep('stepOne', () =>
      stepOne(
        mob,
        def,
        livePawns,
        mobs,
        state,
        pendingDamage,
        pendingMeatConsumption,
        pendingTileDepletion,
        pendingMobState
      )
    );
    const ticked = tickMobConditionTimers(stepped);
    next[i] = ticked;
    traceMobTick(ticked, state, turn, 'fsm', mob.state);
    if (ticked !== mob) changed = true;
  }

  if (pendingMobState.size > 0) {
    changed = true;
    for (let i = 0; i < next.length; i++) {
      const updates = pendingMobState.get(next[i].id);
      if (!updates) continue;
      next[i] = { ...next[i], ...updates };
    }
  }

  if (pendingMeatConsumption.size > 0) {
    changed = true;
    for (let i = 0; i < next.length; i++) {
      const consumed = pendingMeatConsumption.get(next[i].id);
      if (!consumed || next[i].state !== 'Corpse') continue;
      const newMeatLeft = Math.max(0, (next[i].intactness ?? 1.0) - consumed);
      next[i] = { ...next[i], intactness: newMeatLeft };
    }
  }

  if (pendingDamage.size > 0) {
    changed = true;
    for (let i = 0; i < next.length; i++) {
      const dmg = pendingDamage.get(next[i].id);
      if (!dmg || dmg <= 0) continue;
      let m = next[i];
      const newHealth = Math.max(0, m.health - dmg);

      let limbs = m.limbs ? [...m.limbs] : undefined;
      if (limbs) {
        const candidates = limbs.filter((l) => !l.isMissing && l.id !== 'head' && l.id !== 'torso');
        if (candidates.length > 0) {
          const hit = candidates[Math.floor(rng.random() * candidates.length)];
          const hitIdx = limbs.findIndex((l) => l.id === hit.id);
          const limbDmg = dmg * 0.5;
          const newLimbHealth = Math.max(0, hit.health - limbDmg);
          const bleedRate = newLimbHealth < 60 ? (60 - newLimbHealth) * 0.4 : 0;
          limbs[hitIdx] = { ...hit, health: newLimbHealth, bleedRate };
        }
      }

      next[i] = { ...m, health: newHealth, limbs };
    }
  }

  let finalState = changed ? { ...state, mobs: next } : state;

  if (pendingMeatConsumption.size > 0 && finalState.droppedItems?.length) {
    let touched = false;
    const drops = finalState.droppedItems
      .map((d) => {
        if (!d.unitConditions?.length) return d;
        for (const [mobId, consumed] of pendingMeatConsumption) {
          if (d.id.startsWith(`carcass-${mobId}-`)) {
            const { conditions, removed } = consumeTop(d.unitConditions, consumed * 100);
            touched = true;
            return {
              ...d,
              quantity: Math.max(0, d.quantity - removed),
              unitConditions: conditions
            };
          }
        }
        return d;
      })
      .filter((d) => !(d.unitConditions && (d.quantity ?? 0) <= 0));
    if (touched) finalState = { ...finalState, droppedItems: drops };
  }

  if (_pendingDropConsumption.size > 0 && finalState.droppedItems?.length) {
    const drops = finalState.droppedItems
      .map((d) => {
        const eaten = _pendingDropConsumption.get(d.id);
        if (!eaten) return d;
        return {
          ...d,
          quantity: Math.max(0, (d.quantity ?? 0) - eaten),
          unitConditions: d.unitConditions ? d.unitConditions.slice(eaten) : d.unitConditions
        };
      })
      .filter((d) => (d.quantity ?? 0) > 0);
    finalState = { ...finalState, droppedItems: drops };
  }

  for (const { x, y, id } of pendingTileDepletion) {
    const tile = finalState.worldMap[y]?.[x];
    if (!tile) continue;
    const current = tile.resources?.[id] ?? 0;
    if (current <= 0) continue;
    const remaining = Math.max(0, current - 1);
    tile.resources = { ...tile.resources, [id]: remaining };
    if (tile.growth && id in tile.growth && resourceObjectService.getById(id)?.crop) {
      tile.growth[id] = 1;
    }
    if (remaining === 0 && resourceObjectService.isRegrowsFromZero(id)) {
      addWildGrowth(x, y);
    }
    markTileDirty(y, x, tile);
  }

  return finalState;
}

const TRAVEL_ARRIVE_DIST = 4;

function travelStep(mob: Mob, state: GameState): Mob {
  const gx = mob.travelGoalX;
  const gy = mob.travelGoalY;
  if (gx == null || gy == null) return { ...mob, state: 'Wander', stateSince: state.turn };
  if (chebyshev(mob.x, mob.y, gx, gy) <= TRAVEL_ARRIVE_DIST) {
    return {
      ...mob,
      state: 'Wander',
      stateSince: state.turn,
      travelGoalX: undefined,
      travelGoalY: undefined,
      path: []
    };
  }
  if (mob.path && (mob.pathIndex ?? 0) < mob.path.length) return mob;
  const path = pathTo(state, mob.x, mob.y, gx, gy, mob.id, 'caravan-travel', 0);
  if (path.length > 0) return { ...mob, path, pathIndex: 0, nextCellCostLeft: undefined };
  return moveToward(mob, { x: gx, y: gy }, state);
}

export function stepOne(
  mob: Mob,
  def: CreatureDefinition,
  pawns: Pawn[],
  allMobs: Mob[],
  state: GameState,
  pendingDamage: Map<string, number>,
  pendingMeatConsumption: Map<string, number>,
  pendingTileDepletion: Array<{ x: number; y: number; id: string }>,
  pendingMobState: Map<string, Partial<Mob>>
): Mob {
  const turn = state.turn;

  if (STUCK_TRACE_ENABLED) traceStuck(mob, def, state, turn);

  if (turn % 300 === 0) {
    const pathLen = mob.path?.length ?? 0;
    const pathIdx = mob.pathIndex ?? 0;
    gameLogger.log(
      turn,
      'ENTITY-STATE',
      `${def.id}#${mob.id.slice(-6)} state=${mob.state} pos=(${mob.x},${mob.y})` +
        ` hunger=${mob.needs.hunger.toFixed(1)} fatigue=${mob.needs.fatigue.toFixed(1)}` +
        ` blockedTicks=${mob.blockedTicks ?? 0} costLeft=${(mob.nextCellCostLeft ?? 0).toFixed(1)}` +
        ` path=${pathLen > 0 ? `${pathIdx}/${pathLen} end=(${mob.path![pathLen - 1].x},${mob.path![pathLen - 1].y})` : 'none'}` +
        (mob.huntTargetId ? ` prey=${mob.huntTargetId.slice(-6)}` : '')
    );
  }

  const malnutritionSeverity = mob.conditions?.find((c) => c.id === 'malnutrition')?.severity ?? 0;
  const downedByStarvation = malnutritionSeverity >= STARVATION_COLLAPSE_SEVERITY;
  const maxBloodV = mob.maxBloodVolume ?? 100;
  const maybeDowned =
    mob.state === 'Collapsed' ||
    (mob.pain ?? 0) > 0 ||
    (mob.bloodVolume ?? maxBloodV) < maxBloodV * 0.5;
  const consciousness = maybeDowned
    ? (pawnStatService.computeCapacities(mob).consciousness ?? 1)
    : 1;
  const downThreshold = mob.state === 'Collapsed' ? RECOVER_CONSCIOUSNESS : COLLAPSE_CONSCIOUSNESS;
  if (downedByStarvation || consciousness < downThreshold) {
    const shock = consciousness < downThreshold;
    let conditionTimers = mob.conditionTimers;
    let transientConditions = mob.transientConditions;
    if (shock) {
      conditionTimers = {
        ...(mob.conditionTimers ?? {}),
        collapse: Math.max(mob.conditionTimers?.collapse ?? 0, 2)
      };
      transientConditions = (mob.transientConditions ?? []).includes('collapse')
        ? mob.transientConditions
        : [...(mob.transientConditions ?? []), 'collapse'];
    }
    if (mob.state === 'Collapsed') return { ...mob, conditionTimers, transientConditions };
    return {
      ...mob,
      state: 'Collapsed',
      stateSince: turn,
      path: [],
      huntTargetId: undefined,
      eatProgress: undefined,
      conditionTimers,
      transientConditions
    };
  }
  if (mob.state === 'Collapsed') {
    const conditionTimers = { ...(mob.conditionTimers ?? {}) };
    delete conditionTimers.collapse;
    const transientConditions = (mob.transientConditions ?? []).filter((c) => c !== 'collapse');
    return { ...mob, state: 'Wander', stateSince: turn, conditionTimers, transientConditions };
  }

  const finisher = willFinishOffDowned(mob.needs.hunger ?? 0, def);
  const tileLight = computeTileLightLevel(
    turn,
    state.buildings ?? [],
    mob.x,
    mob.y,
    state.worldMap
  );
  const nightVision = getNightVision(mob);
  const mel = dampenLightByNightVision(tileLight, nightVision);
  mob.effectiveLight = mel >= 0.5 ? 1 : Math.max(0.1, mel / 0.5);
  const visionRange = effectiveVisionRange(
    mob,
    tileLight,
    weatherSightMul(state.weather?.type),
    nightVision
  );
  let nearest = nearestPawn(mob, pawns, !finisher);
  let inVision: typeof nearest = null;
  let undetected: string[] | undefined;
  while (
    nearest &&
    dist(mob, nearest.pos) <= visionRange &&
    hasLineOfSight(state.worldMap, mob.x, mob.y, nearest.pos.x, nearest.pos.y)
  ) {
    if (isPawnDetected(mob, nearest.pawn, dist(mob, nearest.pos), visionRange, tileLight, turn)) {
      inVision = nearest;
      break;
    }
    (undetected ??= []).push(nearest.pawn.id);
    nearest = nearestPawn(mob, pawns, !finisher, undetected);
  }
  if (inVision) mob = { ...mob, lastSeenX: inVision.pos.x, lastSeenY: inVision.pos.y };
  const isNight = getAmbientLight(turn) < NIGHT_THRESHOLD;

  if (def.behaviour === 'passive') {
    return stepAnimal(
      mob,
      def,
      inVision,
      nearest,
      visionRange,
      turn,
      state,
      allMobs,
      pendingDamage,
      pendingMeatConsumption,
      pendingTileDepletion,
      pendingMobState
    );
  }
  return stepHostile(
    mob,
    def,
    inVision,
    nearest,
    visionRange,
    isNight,
    turn,
    state,
    allMobs,
    pendingDamage,
    pendingMeatConsumption,
    pendingTileDepletion,
    pendingMobState
  );
}

export function tickMobConditionTimers(mob: Mob): Mob {
  const durations = mob.conditionTimers;
  if (!durations || Object.keys(durations).length === 0) return mob;
  const next: Record<string, number> = {};
  for (const [key, val] of Object.entries(durations)) {
    const remaining = val - 1;
    if (remaining > 0) next[key] = remaining;
  }
  const changed =
    Object.keys(next).length !== Object.keys(durations).length ||
    Object.entries(next).some(([k, v]) => v !== durations[k]);
  if (!changed) return mob;
  const transientConditions = (mob.transientConditions ?? []).filter((e) => next[e] !== undefined);
  return { ...mob, conditionTimers: next, transientConditions };
}

function sleepOrReturnHome(mob: Mob, turn: number, state: GameState): Mob {
  if (
    mob.lairId != null &&
    chebyshev(mob.x, mob.y, mob.lairX ?? mob.x, mob.lairY ?? mob.y) > (mob.lairRange ?? Infinity)
  ) {
    return moveToward(
      {
        ...mob,
        state: 'Wander',
        stateSince: turn,
        huntTargetId: undefined,
        eatProgress: undefined
      },
      { x: mob.lairX!, y: mob.lairY! },
      state
    );
  }
  return { ...mob, state: 'Sleeping', stateSince: turn, path: [] };
}

function nearestEngageablePos(
  mob: Mob,
  pawns: Pawn[],
  finisher: boolean
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bd = Infinity;
  for (let i = 0; i < pawns.length; i++) {
    const p = pawns[i];
    if (p.isAlive === false || !p.position) continue;
    if (!finisher && p.currentState === 'Collapsed') continue;
    const d = manhattan(p.position.x, p.position.y, mob.x, mob.y);
    if (d < bd) {
      bd = d;
      best = p.position;
    }
  }
  return best;
}

export function stepHostile(
  mob: Mob,
  def: CreatureDefinition,
  inVision: { pawn: Pawn; pos: { x: number; y: number } } | null,
  nearest: { pos: { x: number; y: number } } | null,
  visionRange: number,
  isNight: boolean,
  turn: number,
  state: GameState,
  allMobs: Mob[],
  pendingDamage: Map<string, number>,
  pendingMeatConsumption: Map<string, number>,
  pendingTileDepletion: Array<{ x: number; y: number; id: string }>,
  pendingMobState: Map<string, Partial<Mob>>
): Mob {
  const effectiveBehaviour = def.nocturnalAggro && isNight ? 'aggressive' : def.behaviour;
  const aggressive = effectiveBehaviour === 'aggressive';
  const placid = !aggressive && !def.territorial;

  if (
    mob.health <= mob.maxHealth * FLEE_HEALTH_FRACTION &&
    mob.state !== 'Fleeing' &&
    mob.state !== 'Exhausted'
  ) {
    return {
      ...mob,
      state: 'Fleeing',
      stateSince: turn,
      eatProgress: undefined,
      huntTargetId: undefined,
      path: []
    };
  }

  const onHunt = mob.state === 'Hunting' || mob.state === 'Attacking' || mob.huntTargetId != null;
  const feeding = mob.state === 'Eating';
  const desperate = mob.needs.hunger >= HUNGER_OVERSTRETCH_THRESHOLD;
  const huntTgt = mob.huntTargetId ? allMobs.find((m) => m.id === mob.huntTargetId) : null;
  const targetAsleep = huntTgt?.state === 'Sleeping';
  const leashReach =
    (mob.lairRange ?? Infinity) + (onHunt || feeding || desperate ? HUNT_OVERSTRETCH_TILES : 0);
  if (
    mob.lairId != null &&
    mob.state !== 'Fleeing' &&
    mob.state !== 'Exhausted' &&
    !targetAsleep &&
    chebyshev(mob.x, mob.y, mob.lairX ?? mob.x, mob.lairY ?? mob.y) > leashReach
  ) {
    return moveToward(
      {
        ...mob,
        state: 'Wander',
        stateSince: turn,
        huntTargetId: undefined,
        eatProgress: undefined,
        huntCooldownUntil: turn + ticksFromSeconds(HUNT_COOLDOWN_SECONDS)
      },
      { x: mob.lairX!, y: mob.lairY! },
      state
    );
  }

  if (
    def.huntable &&
    mob.state !== 'Fleeing' &&
    mob.state !== 'Attacking' &&
    mob.state !== 'Exhausted'
  ) {
    const predThreat = nearestPredatorThreat(mob, def, allMobs, visionRange);
    if (predThreat) {
      return {
        ...mob,
        state: 'Fleeing',
        stateSince: turn,
        eatProgress: undefined,
        huntTargetId: undefined,
        path: []
      };
    }
    const packCorpse = allMobs.find(
      (m) =>
        m.state === 'Corpse' &&
        m.creatureId === mob.creatureId &&
        dist(mob, { x: m.x, y: m.y }) <= visionRange
    );
    if (packCorpse) {
      return {
        ...mob,
        state: 'Fleeing',
        stateSince: turn,
        eatProgress: undefined,
        huntTargetId: undefined,
        path: []
      };
    }
  }

  const canHunt = def.predator || def.diet === 'carnivore';
  if (mob.carcassTargetId) return stepScavengeCarcass(mob, inVision, aggressive, turn, state);

  if (mob.state === 'Hunting' || mob.state === 'Eating' || mob.state === 'Foraging') {
    if (inVision && aggressive) {
      stepReason('maint:aggro-snap');
      return {
        ...mob,
        state: 'Alerted',
        stateSince: turn,
        eatProgress: undefined,
        huntTargetId: undefined
      };
    }
    if (mob.needs.hunger <= HUNGER_SATED_THRESHOLD) {
      stepReason('maint:sated');
      return {
        ...mob,
        state: 'Wander',
        stateSince: turn,
        eatProgress: undefined,
        huntTargetId: undefined
      };
    }
    if (
      (mob.state === 'Foraging' || (mob.state === 'Eating' && !mob.huntTargetId)) &&
      !mob.eatProgress &&
      mob.needs.fatigue >= SLEEP_FATIGUE_THRESHOLD &&
      mob.needs.hunger < SLEEP_MAX_HUNGER &&
      turn - mob.stateSince > ticksFromSeconds(FEEDING_STUCK_SECONDS)
    ) {
      return sleepOrReturnHome(mob, turn, state);
    }
    if (mob.state === 'Foraging' || (mob.state === 'Eating' && !mob.huntTargetId)) {
      return timedStep('stepForaging', () =>
        stepForaging(mob, def, turn, state, pendingTileDepletion)
      );
    }
    return timedStep('stepHunting', () =>
      stepHunting(
        mob,
        def,
        turn,
        state,
        allMobs,
        pendingDamage,
        pendingMeatConsumption,
        pendingMobState
      )
    );
  }
  const huntCooldownExpired = !mob.huntCooldownUntil || turn >= mob.huntCooldownUntil;
  const forageCooldownExpired = !mob.forageCooldownUntil || turn >= mob.forageCooldownUntil;
  const eatThreshold = HUNGER_EAT_THRESHOLD * (1 - (def.foodOverflow ?? 0));
  if (
    !inVision &&
    mob.needs.hunger >= eatThreshold &&
    mob.state !== 'Fleeing' &&
    mob.state !== 'Sleeping' &&
    mob.state !== 'Attacking' &&
    mob.state !== 'Alerted'
  ) {
    const tileKinds = new Set<TileFoodKind>();
    if (def.grazes) tileKinds.add('grass');
    if (def.eats.includes('food')) tileKinds.add('forage');
    const canForage = tileKinds.size > 0;
    const canScavengeOrHunt = canHunt || def.eats.includes('meat') || def.eats.includes('organic');

    const forageTile =
      canForage && forageCooldownExpired
        ? findNearestFoodTile(state, mob.x, mob.y, FORAGE_RADIUS, tileKinds)
        : null;
    const forageDist = forageTile ? manhattan(mob.x, mob.y, forageTile.x, forageTile.y) : Infinity;

    const prey =
      canScavengeOrHunt && huntCooldownExpired
        ? findNearestPrey(mob, allMobs, canHunt, state.worldMap)
        : null;
    const preyDist = prey ? manhattan(mob.x, mob.y, prey.x, prey.y) : Infinity;

    const carcassDrop = canScavengeOrHunt ? findNearestCarcassDrop(state, mob) : null;
    const carcassDist = carcassDrop
      ? manhattan(mob.x, mob.y, carcassDrop.x, carcassDrop.y)
      : Infinity;

    const tryHunt = (target: Mob): Mob | null => {
      if (target.state !== 'Corpse' && !takeHuntSlot()) {
        mob.huntCooldownUntil =
          turn +
          ticksFromSeconds(HUNT_BUSY_BACKOFF_MIN_S + rng.random() * HUNT_BUSY_BACKOFF_JITTER_S);
        stepReason('food:hunt-slotfull');
        return null;
      }
      stepReason('food:hunt');
      return { ...mob, state: 'Hunting', stateSince: turn, path: [] };
    };
    const enterForage = (): Mob => {
      stepReason('food:forage');
      return { ...mob, state: 'Foraging', stateSince: turn, path: [] };
    };

    if (carcassDrop && carcassDist <= forageDist && carcassDist <= preyDist) {
      return {
        ...mob,
        state: 'Eating',
        carcassTargetId: carcassDrop.id,
        stateSince: turn,
        path: []
      };
    }

    if (prey && preyDist <= forageDist) {
      const hunted = tryHunt(prey);
      if (hunted) return hunted;
      if (forageTile) return enterForage();
    } else if (forageTile) {
      return enterForage();
    } else if (prey) {
      const hunted = tryHunt(prey);
      if (hunted) return hunted;
    }
  }

  if (
    !inVision &&
    mob.needs.fatigue >= SLEEP_FATIGUE_THRESHOLD &&
    mob.needs.hunger < SLEEP_MAX_HUNGER &&
    mob.state !== 'Sleeping' &&
    mob.state !== 'Fleeing' &&
    mob.state !== 'Alerted' &&
    mob.state !== 'Attacking'
  ) {
    return sleepOrReturnHome(mob, turn, state);
  }

  switch (mob.state) {
    case 'Traveling':
      return travelStep(mob, state);
    case 'Wander': {
      const tooClose =
        !aggressive &&
        def.territorial &&
        inVision &&
        dist(mob, inVision.pos) <= Math.ceil(visionRange * 0.5);
      const pawnInTerritory =
        !inVision ||
        mob.lairId == null ||
        chebyshev(mob.lairX ?? mob.x, mob.lairY ?? mob.y, inVision.pos.x, inVision.pos.y) <=
          (mob.lairRange ?? Infinity);
      if (inVision && (aggressive || tooClose) && pawnInTerritory) {
        if (!mob.alertedPawn)
          simLog.threatAlert(
            mob.id,
            entityName(mob),
            inVision.pawn.name ?? 'a colonist',
            turn,
            mob.x,
            mob.y
          );
        const charger = aggressive ? mob : { ...mob, chaseAnchorX: mob.x, chaseAnchorY: mob.y };
        stepReason('wander:alert-pawn');
        return moveToward(
          { ...charger, state: 'Alerted', stateSince: turn, alertedPawn: true },
          inVision.pos,
          state
        );
      }
      if (
        !inVision &&
        canHunt &&
        huntCooldownExpired &&
        mob.needs.hunger > HUNGER_SATED_THRESHOLD
      ) {
        const spotted = findNearestPrey(mob, allMobs, canHunt, state.worldMap);
        if (
          spotted &&
          spotted.state !== 'Corpse' &&
          dist(mob, spotted) <= visionRange &&
          takeHuntSlot()
        ) {
          stepReason('wander:opp-hunt');
          return { ...mob, state: 'Hunting', stateSince: turn, huntTargetId: spotted.id, path: [] };
        }
        mob.huntCooldownUntil =
          turn +
          ticksFromSeconds(HUNT_BUSY_BACKOFF_MIN_S + rng.random() * HUNT_BUSY_BACKOFF_JITTER_S);
      }
      return wanderStep(mob, def, state);
    }
    case 'Alerted': {
      const finisher = willFinishOffDowned(mob.needs.hunger ?? 0, def);
      const adjPawn = state.pawns.some(
        (p) =>
          p.isAlive !== false &&
          (finisher || p.currentState !== 'Collapsed') &&
          p.position &&
          adjacent(mob, p.position)
      );
      const lockedOntoPawn =
        mob.huntTargetId != null && state.pawns.some((p) => p.id === mob.huntTargetId);
      if (adjPawn && (!placid || lockedOntoPawn))
        return { ...mob, state: 'Attacking', stateSince: turn };
      if (mob.chaseAnchorX != null && mob.chaseAnchorY != null) {
        if (chebyshev(mob.x, mob.y, mob.chaseAnchorX, mob.chaseAnchorY) > TERRITORIAL_LEASH) {
          return {
            ...mob,
            state: 'Wander',
            stateSince: turn,
            chaseAnchorX: undefined,
            chaseAnchorY: undefined,
            alertedPawn: undefined
          };
        }
      }
      const seen = inVision ? inVision.pos : null;
      const memory =
        mob.lastSeenX != null && mob.lastSeenY != null
          ? { x: mob.lastSeenX, y: mob.lastSeenY }
          : null;
      const engage = seen ?? memory;
      const giveUp =
        !engage ||
        (seen != null && dist(mob, seen) > visionRange * 1.5) ||
        (seen == null && memory != null && dist(mob, memory) <= 1);
      if (giveUp) {
        return {
          ...mob,
          state: 'Wander',
          stateSince: turn,
          chaseAnchorX: undefined,
          chaseAnchorY: undefined,
          lastSeenX: undefined,
          lastSeenY: undefined,
          alertedPawn: undefined,
          stealthChecks: undefined
        };
      }
      const decision = approachForMelee(mob, engage, state, turn);
      if (decision.kind === 'hold') return mob;
      if (decision.kind === 'unreachable') return moveToward(mob, engage, state);
      return { ...mob, path: decision.path, pathIndex: 0 };
    }
    case 'Attacking': {
      const preyTarget = mob.huntTargetId ? allMobs.find((m) => m.id === mob.huntTargetId) : null;
      if (preyTarget && preyTarget.state !== 'Corpse') {
        if (adjacent(mob, { x: preyTarget.x, y: preyTarget.y })) return mob;
        return { ...mob, state: 'Hunting', stateSince: turn };
      }
      const attackerIsPawn =
        mob.huntTargetId != null && state.pawns.some((p) => p.id === mob.huntTargetId);
      if (placid && !attackerIsPawn)
        return {
          ...mob,
          state: def.behaviour === 'passive' ? 'Grazing' : 'Wander',
          stateSince: turn,
          huntTargetId: undefined,
          chaseAnchorX: undefined,
          chaseAnchorY: undefined,
          alertedPawn: undefined
        };
      const atkFinisher = willFinishOffDowned(mob.needs.hunger ?? 0, def);
      const engage = nearestEngageablePos(mob, state.pawns, atkFinisher);
      if (!engage)
        return {
          ...mob,
          state: 'Wander',
          stateSince: turn,
          chaseAnchorX: undefined,
          chaseAnchorY: undefined,
          alertedPawn: undefined
        };
      if (!adjacent(mob, engage)) return { ...mob, state: 'Alerted', stateSince: turn };
      return mob;
    }
    case 'Fleeing': {
      const predThreat = def.huntable
        ? nearestPredatorThreat(mob, def, allMobs, visionRange)
        : null;
      const pawnDist = nearest ? dist(mob, nearest.pos) : Infinity;
      const predDist = predThreat ? dist(mob, predThreat.pos) : Infinity;
      const closestDist = Math.min(pawnDist, predDist);
      const cantEscape = !mob.fleeDest && turn - mob.stateSince > SAFE_RESET_TICKS;
      if (closestDist > def.stats.fleeRange || cantEscape) {
        return { ...mob, state: 'Wander', stateSince: turn, fleeDest: undefined };
      }
      const curStamina = mob.stamina ?? mob.maxStamina ?? calcMaxStamina(mob.stats);
      const drainedStamina =
        curStamina - FLEE_STAMINA_DRAIN_PER_SECOND * SECONDS_PER_TICK * _thinkDtTicks;
      if (drainedStamina <= 0) {
        return { ...mob, state: 'Exhausted', stateSince: turn, stamina: 0, path: [] };
      }
      const fleeThreats: { x: number; y: number }[] = [];
      if (nearest && pawnDist <= def.stats.fleeRange) fleeThreats.push(nearest.pos);
      if (predThreat && predDist <= def.stats.fleeRange) fleeThreats.push(predThreat.pos);
      if (fleeThreats.length > 0)
        return { ...fleeToSafety(mob, fleeThreats, state), stamina: drainedStamina };
      return { ...wanderStep(mob, def, state), stamina: drainedStamina };
    }
    case 'Exhausted': {
      if (!(mob.transientConditions ?? []).includes('winded')) {
        return { ...mob, state: 'Wander', stateSince: turn, path: [] };
      }
      return { ...mob, path: [] };
    }
    case 'Sleeping': {
      if (inVision) {
        const tooClose =
          !aggressive && def.territorial && dist(mob, inVision.pos) <= Math.ceil(visionRange * 0.5);
        if (aggressive || tooClose) {
          if (!mob.alertedPawn)
            simLog.threatAlert(
              mob.id,
              entityName(mob),
              inVision.pawn.name ?? 'a colonist',
              turn,
              mob.x,
              mob.y
            );
          return { ...mob, state: 'Alerted', stateSince: turn, alertedPawn: true };
        }
        return {
          ...mob,
          state: def.behaviour === 'passive' ? 'Grazing' : 'Wander',
          stateSince: turn
        };
      }
      if (
        mob.needs.fatigue <= sleepWakeThreshold(mob.needs.hunger) ||
        mob.needs.hunger >= SLEEP_MAX_HUNGER
      ) {
        return { ...mob, state: 'Wander', stateSince: turn };
      }
      return { ...mob, path: [] };
    }
    default:
      return { ...mob, state: 'Wander', stateSince: turn };
  }
}

function logFleeTrigger(
  mob: Mob,
  def: CreatureDefinition,
  threat: { pos: { x: number; y: number } },
  isPawn: boolean,
  turn: number,
  visionRange: number
): void {
  if (!gameLogger.isEnabled) return;
  const d = chebyshev(threat.pos.x, threat.pos.y, mob.x, mob.y);
  gameLogger.log(
    turn,
    'ENTITY-FLEE',
    `${mob.id} @(${mob.x},${mob.y}) flee ${isPawn ? 'pawn' : 'predator'}@(${threat.pos.x},${threat.pos.y}) d=${d} vision=${visionRange} flee=${def.stats.fleeRange}`
  );
}

export function stepAnimal(
  mob: Mob,
  def: CreatureDefinition,
  inVision: { pos: { x: number; y: number } } | null,
  nearest: { pos: { x: number; y: number } } | null,
  visionRange: number,
  turn: number,
  state: GameState,
  allMobs: Mob[],
  pendingDamage: Map<string, number>,
  pendingMeatConsumption: Map<string, number>,
  pendingTileDepletion: Array<{ x: number; y: number; id: string }>,
  pendingMobState: Map<string, Partial<Mob>>
): Mob {
  const predatorThreat = nearestPredatorThreat(mob, def, allMobs, visionRange);
  const threat = mob.partyId != null ? predatorThreat : (inVision ?? predatorThreat);

  if (!threat) {
    const hungry = mob.needs.hunger >= HUNGER_EAT_THRESHOLD;
    const sated = mob.needs.hunger <= HUNGER_SATED_THRESHOLD;

    if (sated && (mob.state === 'Foraging' || mob.state === 'Hunting' || mob.state === 'Eating')) {
      return {
        ...mob,
        state: 'Grazing',
        stateSince: turn,
        eatProgress: undefined,
        huntTargetId: undefined,
        path: []
      };
    }

    if (
      hungry &&
      mob.state !== 'Foraging' &&
      mob.state !== 'Hunting' &&
      mob.state !== 'Eating' &&
      mob.state !== 'Fleeing' &&
      mob.state !== 'Startled' &&
      mob.state !== 'Sleeping' &&
      mob.state !== 'Traveling'
    ) {
      const canForage = def.grazes || def.eats.includes('food');
      const canHuntLive = def.predator || def.diet === 'carnivore';
      const canScavengeOrHunt =
        canHuntLive || def.eats.includes('meat') || def.eats.includes('organic');
      const huntCooldownExpired = !mob.huntCooldownUntil || turn >= mob.huntCooldownUntil;
      const forageCooldownExpired = !mob.forageCooldownUntil || turn >= mob.forageCooldownUntil;
      if (canForage && forageCooldownExpired)
        return { ...mob, state: 'Foraging', stateSince: turn, path: [] };
      if (canScavengeOrHunt && huntCooldownExpired && (!canHuntLive || takeHuntSlot()))
        return { ...mob, state: 'Hunting', stateSince: turn, path: [] };
    }

    if (
      mob.needs.fatigue >= SLEEP_FATIGUE_THRESHOLD &&
      mob.needs.hunger < SLEEP_MAX_HUNGER &&
      mob.state !== 'Sleeping' &&
      mob.state !== 'Fleeing' &&
      mob.state !== 'Startled' &&
      mob.state !== 'Foraging' &&
      mob.state !== 'Hunting' &&
      mob.state !== 'Eating' &&
      mob.state !== 'Traveling'
    ) {
      return sleepOrReturnHome(mob, turn, state);
    }
  } else if (mob.state === 'Foraging' || mob.state === 'Hunting' || mob.state === 'Eating') {
    logFleeTrigger(mob, def, threat, inVision != null, turn, visionRange);
    return {
      ...mob,
      state: 'Startled',
      stateSince: turn,
      eatProgress: undefined,
      huntTargetId: undefined,
      path: []
    };
  }

  switch (mob.state) {
    case 'Traveling':
      return travelStep(mob, state);
    case 'Grazing': {
      if (threat) {
        logFleeTrigger(mob, def, threat, inVision != null, turn, visionRange);
        return { ...mob, state: 'Startled', stateSince: turn, path: [] };
      }
      if (
        mob.lairId != null &&
        chebyshev(mob.x, mob.y, mob.lairX ?? mob.x, mob.lairY ?? mob.y) >
          (mob.lairRange ?? Infinity)
      ) {
        return moveToward(mob, { x: mob.lairX!, y: mob.lairY! }, state);
      }
      return wanderStep(mob, def, state);
    }
    case 'Startled': {
      if (turn - mob.stateSince >= STARTLED_TICKS) {
        return { ...mob, state: 'Fleeing', stateSince: turn, path: [], fleeDest: undefined };
      }
      return { ...mob, path: [] };
    }
    case 'Fleeing': {
      const curStamina = mob.stamina ?? mob.maxStamina ?? calcMaxStamina(mob.stats);
      const drainedStamina =
        curStamina - FLEE_STAMINA_DRAIN_PER_SECOND * SECONDS_PER_TICK * _thinkDtTicks;
      if (drainedStamina <= 0) {
        return { ...mob, state: 'Exhausted', stateSince: turn, stamina: 0 };
      }
      const fleeThreats: { x: number; y: number }[] = [];
      if (nearest && dist(mob, nearest.pos) <= def.stats.fleeRange) fleeThreats.push(nearest.pos);
      if (predatorThreat && dist(mob, predatorThreat.pos) <= def.stats.fleeRange)
        fleeThreats.push(predatorThreat.pos);
      const cantEscape = !mob.fleeDest && turn - mob.stateSince > SAFE_RESET_TICKS;
      if (fleeThreats.length === 0 || cantEscape) {
        return {
          ...mob,
          state: 'Grazing',
          stateSince: turn,
          path: [],
          fleeDest: undefined,
          stamina: drainedStamina
        };
      }
      return { ...fleeToSafety(mob, fleeThreats, state), stamina: drainedStamina };
    }
    case 'Exhausted': {
      if (!(mob.transientConditions ?? []).includes('winded')) {
        return { ...mob, state: 'Grazing', stateSince: turn, path: [] };
      }
      return { ...mob, path: [] };
    }
    case 'Sleeping': {
      if (threat) {
        logFleeTrigger(mob, def, threat, inVision != null, turn, visionRange);
        return { ...mob, state: 'Startled', stateSince: turn, path: [] };
      }
      if (
        mob.needs.fatigue <= sleepWakeThreshold(mob.needs.hunger) ||
        mob.needs.hunger >= SLEEP_MAX_HUNGER
      ) {
        return { ...mob, state: 'Grazing', stateSince: turn, path: [] };
      }
      return { ...mob, path: [] };
    }
    case 'Tamed':
      return mob;
    case 'Attacking': {
      const atk = huntAttacker(mob, state, allMobs);
      if (atk && adjacent(mob, atk)) {
        return mob;
      }
      return { ...mob, state: 'Fleeing', stateSince: turn, huntTargetId: undefined, path: [] };
    }
    case 'Foraging':
      return stepForaging(mob, def, turn, state, pendingTileDepletion);
    case 'Hunting':
      return stepHunting(
        mob,
        def,
        turn,
        state,
        allMobs,
        pendingDamage,
        pendingMeatConsumption,
        pendingMobState
      );
    case 'Eating':
      if (mob.huntTargetId) {
        return stepHunting(
          mob,
          def,
          turn,
          state,
          allMobs,
          pendingDamage,
          pendingMeatConsumption,
          pendingMobState
        );
      }
      return stepForaging(mob, def, turn, state, pendingTileDepletion);
    default:
      return { ...mob, state: 'Grazing', stateSince: turn, path: [] };
  }
}

export function stepForaging(
  mob: Mob,
  def: CreatureDefinition,
  turn: number,
  state: GameState,
  pendingTileDepletion: Array<{ x: number; y: number; id: string }>
): Mob {
  const tileKindOrder: TileFoodKind[] = [];
  if (def.grazes) tileKindOrder.push('grass');
  if (def.eats.includes('food')) tileKindOrder.push('forage');
  const kinds = new Set<TileFoodKind>(tileKindOrder);
  const idleState: MobState = def.behaviour === 'passive' ? 'Grazing' : 'Wander';

  const progress = mob.eatProgress ?? 0;
  if (progress > 0) {
    const next = progress + (_thinkDtTicks * SECONDS_PER_TICK) / EAT_GRASS_SECONDS;
    if (next >= 1) {
      const tile = state.worldMap[mob.y]?.[mob.x];
      const edibleId = edibleResourceOnTile(tile, kinds);
      if (edibleId) pendingTileDepletion.push({ x: mob.x, y: mob.y, id: edibleId });
      const restore =
        edibleId && WILD_FORAGE_RESOURCE_IDS.has(edibleId)
          ? EAT_FORAGE_HUNGER_RESTORE
          : EAT_GRASS_HUNGER_RESTORE;

      const newHunger = Math.max(0, mob.needs.hunger - restore);
      return {
        ...mob,
        eatProgress: undefined,
        path: [],
        needs: { ...mob.needs, hunger: newHunger, lastMeal: turn },
        state: newHunger > HUNGER_SATED_THRESHOLD ? 'Foraging' : idleState,
        stateSince: turn
      };
    }
    return { ...mob, eatProgress: next, path: [], state: 'Eating' as MobState };
  }

  if (mob.path && mob.path.length > 0 && (mob.pathIndex ?? 0) < mob.path.length) {
    return mob;
  }

  let found: { target: { x: number; y: number }; path: { x: number; y: number }[] } | null = null;
  for (const kind of tileKindOrder) {
    found = findReachableFoodTile(state, mob, FORAGE_RADIUS, new Set([kind]));
    if (found) break;
  }
  if (isTraced(mob)) {
    const onTile = edibleResourceOnTile(state.worldMap[mob.y]?.[mob.x], kinds);
    gameLogger.log(
      turn,
      'ENTITY-FEED',
      `stepForage#${mob.id.slice(-6)} @(${mob.x},${mob.y}) onTileEdible=${onTile ?? 'NO'}` +
        ` found=${found ? `(${found.target.x},${found.target.y})path${found.path.length}` : 'NULL→Wander+fCD'}` +
        ` kinds=[${[...kinds].join(',')}]`
    );
  }
  if (!found) {
    if (turn % 300 === 0) {
      gameLogger.log(
        turn,
        'ENTITY-FEED',
        `FORAGE-NO-REACHABLE ${mob.id} @(${mob.x},${mob.y}) hunger=${mob.needs.hunger.toFixed(1)}`
      );
    }
    return {
      ...wanderStep(mob, def, state),
      state: idleState,
      stateSince: turn,
      forageCooldownUntil: turn + ticksFromSeconds(FORAGE_COOLDOWN_SECONDS)
    };
  }

  if (found.path.length === 0) {
    return {
      ...mob,
      eatProgress: (_thinkDtTicks * SECONDS_PER_TICK) / EAT_GRASS_SECONDS,
      path: []
    };
  }
  return { ...mob, path: found.path, pathIndex: 0, nextCellCostLeft: undefined };
}

function stepScavengeCarcass(
  mob: Mob,
  inVision: { pawn: Pawn; pos: { x: number; y: number } } | null,
  aggressive: boolean,
  turn: number,
  state: GameState
): Mob {
  if (inVision && aggressive) {
    return {
      ...mob,
      carcassTargetId: undefined,
      eatProgress: undefined,
      state: 'Wander',
      stateSince: turn
    };
  }
  const drop = (state.droppedItems ?? []).find(
    (d) => d.id === mob.carcassTargetId && (d.quantity ?? 0) > 0
  );
  if (!drop) {
    return {
      ...mob,
      carcassTargetId: undefined,
      eatProgress: undefined,
      state: 'Wander',
      stateSince: turn,
      path: []
    };
  }
  if (turn - mob.stateSince > ticksFromSeconds(HUNT_GIVE_UP_SECONDS)) {
    return {
      ...mob,
      carcassTargetId: undefined,
      eatProgress: undefined,
      state: 'Wander',
      stateSince: turn,
      huntCooldownUntil: turn + ticksFromSeconds(HUNT_COOLDOWN_SECONDS),
      path: []
    };
  }
  if (chebyshev(mob.x, mob.y, drop.x, drop.y) > 1) {
    return moveToward({ ...mob, state: 'Eating' as MobState }, { x: drop.x, y: drop.y }, state);
  }
  const progress = (mob.eatProgress ?? 0) + (_thinkDtTicks * SECONDS_PER_TICK) / EAT_CORPSE_SECONDS;
  if (progress >= 1) {
    _pendingDropConsumption.set(drop.id, (_pendingDropConsumption.get(drop.id) ?? 0) + 1);
    const newHunger = Math.max(0, mob.needs.hunger - EAT_CARCASS_HUNGER_RESTORE);
    const stillHungry = newHunger > HUNGER_SATED_THRESHOLD;
    const moreLeft = (drop.quantity ?? 0) - 1 > 0;
    if (stillHungry && moreLeft) {
      return {
        ...mob,
        eatProgress: undefined,
        needs: { ...mob.needs, hunger: newHunger, lastMeal: turn },
        state: 'Eating' as MobState,
        path: []
      };
    }
    return {
      ...mob,
      carcassTargetId: undefined,
      eatProgress: undefined,
      needs: { ...mob.needs, hunger: newHunger, lastMeal: turn },
      state: 'Wander',
      stateSince: turn,
      path: []
    };
  }
  return { ...mob, eatProgress: progress, state: 'Eating' as MobState, path: [] };
}

export function stepHunting(
  mob: Mob,
  def: CreatureDefinition,
  turn: number,
  state: GameState,
  allMobs: Mob[],
  pendingDamage: Map<string, number>,
  pendingMeatConsumption: Map<string, number>,
  pendingMobState: Map<string, Partial<Mob>>
): Mob {
  const progress = mob.eatProgress ?? 0;
  if (progress > 0) {
    const target = mob.huntTargetId ? allMobs.find((m) => m.id === mob.huntTargetId) : null;
    if (!target || target.state !== 'Corpse' || (target.intactness ?? 1.0) <= 0) {
      const restState: MobState = def.behaviour === 'passive' ? 'Grazing' : 'Wander';
      return {
        ...mob,
        eatProgress: undefined,
        huntTargetId: undefined,
        path: [],
        state: restState,
        stateSince: turn
      };
    }
    const next = progress + (_thinkDtTicks * SECONDS_PER_TICK) / EAT_CORPSE_SECONDS;
    if (next >= 1) {
      pendingMeatConsumption.set(
        target.id,
        (pendingMeatConsumption.get(target.id) ?? 0) + CORPSE_PORTION
      );
      const newHunger = Math.max(0, mob.needs.hunger - EAT_CORPSE_HUNGER_RESTORE);
      const targetStripped = (target.intactness ?? 1.0) - CORPSE_PORTION <= 0;
      const stillHungry = newHunger > HUNGER_SATED_THRESHOLD;

      if (stillHungry && !targetStripped) {
        return {
          ...mob,
          eatProgress: (_thinkDtTicks * SECONDS_PER_TICK) / EAT_CORPSE_SECONDS,
          needs: { ...mob.needs, hunger: newHunger, lastMeal: turn }
        };
      }

      const restState: MobState = def.behaviour === 'passive' ? 'Grazing' : 'Wander';
      return {
        ...mob,
        eatProgress: undefined,
        huntTargetId: undefined,
        path: [],
        needs: { ...mob.needs, hunger: newHunger, lastMeal: turn },
        state: restState,
        stateSince: turn
      };
    }
    return { ...mob, eatProgress: next, path: [], state: 'Eating' as MobState };
  }

  const allowLivePrey = def.predator || def.diet === 'carnivore';
  let prey: Mob | null = null;
  if (mob.huntTargetId) {
    const lockedTarget = allMobs.find((m) => m.id === mob.huntTargetId);
    if (lockedTarget && lockedTarget.state !== 'Tamed') {
      if (lockedTarget.state === 'Corpse' && (lockedTarget.intactness ?? 1.0) <= 0) {
        prey = findNearestPrey(mob, allMobs, allowLivePrey, state.worldMap);
      } else {
        prey = lockedTarget;
      }
    } else {
      prey = findNearestPrey(mob, allMobs, allowLivePrey, state.worldMap);
    }
  } else {
    prey = findNearestPrey(mob, allMobs, allowLivePrey, state.worldMap);
  }

  if (!prey) {
    stepReason('hunt:no-prey');
    const restState: MobState = def.behaviour === 'passive' ? 'Grazing' : 'Wander';
    return {
      ...wanderStep(mob, def, state),
      huntTargetId: undefined,
      state: restState,
      stateSince: turn
    };
  }

  const preyPos = { x: prey.x, y: prey.y };

  if (adjacent(mob, preyPos)) {
    if (prey.state === 'Corpse') {
      if ((prey.intactness ?? 1.0) <= 0) {
        const restState: MobState = def.behaviour === 'passive' ? 'Grazing' : 'Wander';
        return {
          ...wanderStep(mob, def, state),
          huntTargetId: undefined,
          state: restState,
          stateSince: turn
        };
      }
      return {
        ...mob,
        huntTargetId: prey.id,
        eatProgress: (_thinkDtTicks * SECONDS_PER_TICK) / EAT_CORPSE_SECONDS,
        path: []
      };
    }
    stepReason('hunt:attack');
    pendingMobState.set(prey.id, { state: 'Attacking', stateSince: turn, huntTargetId: mob.id });
    return { ...mob, state: 'Attacking', stateSince: turn, huntTargetId: prey.id, path: [] };
  }

  if (turn - mob.stateSince > ticksFromSeconds(HUNT_GIVE_UP_SECONDS)) {
    stepReason('hunt:giveup');
    const restState: MobState = def.behaviour === 'passive' ? 'Grazing' : 'Wander';
    return {
      ...wanderStep(mob, def, state),
      huntTargetId: undefined,
      huntCooldownUntil: turn + ticksFromSeconds(HUNT_COOLDOWN_SECONDS),
      state: restState,
      stateSince: turn
    };
  }

  const decision = approachForMelee(mob, preyPos, state, turn);
  if (decision.kind === 'unreachable') {
    stepReason('hunt:unreachable');
    gameLogger.log(
      turn,
      'ENTITY-FEED',
      `HUNT-UNREACHABLE ${mob.id} @(${mob.x},${mob.y}) prey ${prey.id}@(${preyPos.x},${preyPos.y})`
    );
    const cooldownUntil = turn + ticksFromSeconds(HUNT_COOLDOWN_SECONDS);
    const restState: MobState = def.behaviour === 'passive' ? 'Grazing' : 'Wander';
    return {
      ...wanderStep(mob, def, state),
      huntTargetId: undefined,
      huntCooldownUntil: cooldownUntil,
      state: restState,
      stateSince: turn
    };
  }
  if (decision.kind === 'repath') {
    stepReason('hunt:repath');
    return { ...mob, huntTargetId: prey.id, path: decision.path, pathIndex: 0 };
  }
  stepReason('hunt:hold');
  return { ...mob, huntTargetId: prey.id };
}
