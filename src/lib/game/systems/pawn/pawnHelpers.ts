import type { GameState, Pawn, Mob, Building, PlacedBuilding, Job } from '../../core/types';
import { carriedDrinkVessel, carriedWaterVessel, isDrinkId } from '../../core/rules/gear/vessels';
export { carriedWaterVessel };
import { transientNeedOnset } from '../../core/rules/body/conditions';
import { gatheringLevelOf } from '../../core/defs/amenities';
import { needNum } from '../../core/defs/needs';
import { isUncareable } from '../../core/defs/wounds';
import BUILDINGS_DATABASE_RAW from '../../database/world/buildings.json';
import { jobService } from '../../services/JobService';
import { pawnService } from '../../services/PawnService';
import {
  buildPathfindingGrids,
  buildSharedSoftBlockedGrid,
  buildPathfindingGridsConfined,
  pathfinderService
} from '../../services/PathfinderService';
import { allowedTilesForPawn } from './zoneConfine';
import { occupancyService } from '../../services/OccupancyService';
import { getRangedWeapon, effectiveRangedRange } from '../rangedCombat';
import { gameLogger } from '../../debug/gameLogger';
import { ticksFromSeconds, SECONDS_PER_TICK } from '../../core/util/time';
import { rng } from '../../core/util/rng';
import { pawnById } from '../../core/state/pawnIndex';
import { manhattan, chebyshev, findNearestBy } from '../../core/util/distance';
import { computeTileLightLevel } from '../../services/EnvironmentService';
import { effectiveVisionRange } from '../../core/rules/body/vision';
import { PAWN_STATE, type PawnStateName } from './pawnStates';
import {
  isAdjacent,
  findAdjacentApproach,
  hasAvailableFood,
  findNearestFoodDrops
} from './pawnQueries';
import { tileHasBody } from './carry';

export const HUNGER_THRESHOLD = needNum('hunger', 'seek', 70);

export const FATIGUE_THRESHOLD = needNum('fatigue', 'seek', 72);

export const FILTHY_THRESHOLD = transientNeedOnset('filthy')?.atOrAbove ?? 100;
export const WET_THRESHOLD = transientNeedOnset('wet')?.atOrAbove ?? 100;

export const RECOVER_PAIN_THRESHOLD = 12;
const RECOVER_BLEED_THRESHOLD = 1.5;

export function needsRecovery(pawn: Pawn): boolean {
  if (pawn.isAlive === false) return false;
  let bleed = 0;
  let recoverablePain = 0;
  for (const l of pawn.limbs ?? []) {
    bleed += l.bleedRate ?? 0;
    for (const p of l.parts ?? [])
      for (const w of p.injuries) {
        if (isUncareable(w)) continue;
        recoverablePain += w.painContribution ?? 0;
        if (w.severity !== 'minor') return true;
      }
  }
  if (recoverablePain >= RECOVER_PAIN_THRESHOLD) return true;
  return bleed >= RECOVER_BLEED_THRESHOLD;
}

export const FLEE_DISTANCE = 6;

export function pawnVisionTiles(pawn: Pawn, gs: GameState): number {
  const light = pawn.position
    ? computeTileLightLevel(
        gs.turn,
        gs.buildings ?? [],
        pawn.position.x,
        pawn.position.y,
        gs.worldMap
      )
    : 1;
  return effectiveVisionRange(pawn, light);
}

export const NEED_DETOUR_MAX_FACTOR = 15;

export const NEED_DETOUR_MIN_DIST = 5;

export const WORK_PRIORITY_THRESHOLD_SHIFT = 4;

export const QUEUE_FOOD_THRESHOLD_REDUCTION = 5;

export const JOB_QUEUE_SIZE = 4;

export const EATING_TURNS = ticksFromSeconds(needNum('hunger', 'eatDurationSeconds', 2));

export const EATING_TURNS_GROUND = ticksFromSeconds(
  needNum('hunger', 'eatGroundDurationSeconds', 3)
);

export const SLEEPING_TURNS = ticksFromSeconds(needNum('fatigue', 'sleepDurationSeconds', 100));

export const SLEEPING_TURNS_GROUND = ticksFromSeconds(
  needNum('fatigue', 'sleepGroundDurationSeconds', 124)
);

export const FATIGUE_PER_SLEEPING_GROUND = needNum('fatigue', 'groundRecoveryPerSecond', 0.58);

export const SLEEP_WAKE_THRESHOLD_FED = needNum('fatigue', 'wakeThresholdFed', 0);

export const SLEEP_WAKE_THRESHOLD_HUNGRY = needNum('fatigue', 'wakeThresholdHungry', 30);

export const BUILDINGS_DB = BUILDINGS_DATABASE_RAW as unknown as Building[];

export function lightWorkMultiplier(lightLevel: number): number {
  return Math.min(1, Math.max(0.4, lightLevel));
}

export const UNREACHABLE_COOLDOWN_TICKS = 60;

export const _unreachableJobs = new Map<string, Map<string, number>>();

export function resetUnreachableJobs(): void {
  _unreachableJobs.clear();
}

export function isJobUnreachableForPawn(pawnId: string, jobId: string, turn: number): boolean {
  const expiry = _unreachableJobs.get(pawnId)?.get(jobId);
  return expiry !== undefined && expiry > turn;
}

export function markJobUnreachable(pawnId: string, jobId: string, turn: number): void {
  let m = _unreachableJobs.get(pawnId);
  if (!m) {
    m = new Map();
    _unreachableJobs.set(pawnId, m);
  }
  if (m.size > 16) {
    for (const [id, exp] of m) if (exp <= turn) m.delete(id);
  }
  m.set(jobId, turn + UNREACHABLE_COOLDOWN_TICKS);
}

function gridForPawn(
  pawn: Pawn,
  gameState: GameState,
  blocked: Set<string>,
  sx: number,
  sy: number
) {
  if (!pawn.drafted) {
    const allowed = allowedTilesForPawn(gameState, pawn.id);
    if (allowed && allowed.has(`${sx},${sy}`))
      return buildPathfindingGridsConfined(gameState.worldMap, blocked, allowed, sx, sy);
  }
  return buildSharedSoftBlockedGrid(gameState.worldMap, blocked);
}

export function tryAssignPath(
  pawn: Pawn,
  tx: number,
  ty: number,
  gameState: GameState,
  _reason: string = 'assign'
): GameState | null {
  if (!pawn.position) return null;
  if (!pathfinderService.isReady()) return null;
  if (isAdjacent(pawn.position.x, pawn.position.y, tx, ty)) return null;
  const blocked = occupancyService.blockedTilesShared(gameState);
  const allowedZone = pawn.drafted ? null : allowedTilesForPawn(gameState, pawn.id);
  const confinedZone =
    allowedZone && allowedZone.has(`${pawn.position.x},${pawn.position.y}`) ? allowedZone : null;
  const approach = findAdjacentApproach(
    tx,
    ty,
    gameState.worldMap,
    blocked,
    pawn.position.x,
    pawn.position.y,
    confinedZone
  );
  if (!approach) {
    return null;
  }
  const { walkable, costs, width, height } = gridForPawn(
    pawn,
    gameState,
    blocked,
    pawn.position.x,
    pawn.position.y
  );
  const path = pathfinderService.findPath(
    walkable,
    costs,
    width,
    height,
    pawn.position.x,
    pawn.position.y,
    approach.x,
    approach.y
  );
  if (path.length === 0) {
    return null;
  }
  return pawnService.assignPath(pawn.id, path, gameState);
}

export function repathStuckMover(
  pawn: Pawn,
  gameState: GameState
): GameState | 'unreachable' | null {
  const job = pawn.activeJob;
  if (!job || !pawn.position) return null;
  if (pawn.isMoving || pawn.hasReachedDestination) return null;
  if (isAdjacent(pawn.position.x, pawn.position.y, job.targetX, job.targetY)) {
    return {
      ...gameState,
      pawns: gameState.pawns.map((p) =>
        p.id === pawn.id ? { ...p, hasReachedDestination: true } : p
      )
    };
  }
  return tryAssignPath(pawn, job.targetX, job.targetY, gameState, 'blockedRepath') ?? 'unreachable';
}

const WANDER_MOVES_PER_SECOND = 0.4;

function randomWalkableNeighbour(
  gameState: GameState,
  x: number,
  y: number,
  selfId: string,
  allowed: Set<string> | null
): { x: number; y: number } | null {
  const dirs = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
    { dx: -1, dy: -1 },
    { dx: 1, dy: -1 },
    { dx: -1, dy: 1 },
    { dx: 1, dy: 1 }
  ];
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(rng.random() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }
  const walkable = (nx: number, ny: number) => gameState.worldMap?.[ny]?.[nx]?.walkable === true;
  for (const { dx, dy } of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (!walkable(nx, ny)) continue;
    if (dx !== 0 && dy !== 0 && !walkable(x + dx, y) && !walkable(x, y + dy)) continue;
    if (occupancyService.isBlocked(gameState, nx, ny, selfId)) continue;
    if (allowed && !allowed.has(`${nx},${ny}`)) continue;
    return { x: nx, y: ny };
  }
  return null;
}

export function tryWanderStep(pawn: Pawn, gameState: GameState): GameState | null {
  if (!pawn.position) return null;
  if (pawn.isMoving && (pawn.path?.length ?? 0) > 0) return null;
  if (rng.random() >= WANDER_MOVES_PER_SECOND * SECONDS_PER_TICK) return null;
  const allowed = pawn.drafted ? null : allowedTilesForPawn(gameState, pawn.id);
  const tile = randomWalkableNeighbour(
    gameState,
    pawn.position.x,
    pawn.position.y,
    pawn.id,
    allowed
  );
  if (!tile) return null;
  return pawnService.assignPath(pawn.id, [tile], gameState);
}

export function tryAssignSleepPath(
  pawn: Pawn,
  tx: number,
  ty: number,
  gameState: GameState
): GameState | null {
  if (!pawn.position) return null;
  if (!pathfinderService.isReady()) return null;
  if (pawn.position.x === tx && pawn.position.y === ty) return null;
  const blocked = occupancyService.blockedTilesShared(gameState);
  const { walkable, costs, width, height } = gridForPawn(
    pawn,
    gameState,
    blocked,
    pawn.position.x,
    pawn.position.y
  );
  const path = pathfinderService.findPath(
    walkable,
    costs,
    width,
    height,
    pawn.position.x,
    pawn.position.y,
    tx,
    ty
  );
  if (path.length === 0) {
    return null;
  }
  return pawnService.assignPath(pawn.id, path, gameState);
}

export const CAMPFIRE_TYPES = ['campfire'];

let _restTypeSet: Set<string> | null = null;
function restTypeSet(): Set<string> {
  if (!_restTypeSet) {
    _restTypeSet = new Set(
      BUILDINGS_DB.filter(
        (d) => (d.effects?.sleepQuality ?? 0) > 0 || (d.effects?.fatigueRecovery ?? 0) > 0
      ).map((d) => d.id)
    );
  }
  return _restTypeSet;
}

export function isRestBuildingType(type: string): boolean {
  return restTypeSet().has(type);
}

export function findNearestStorageBuilding(
  pawn: Pawn,
  gs: GameState
): { x: number; y: number; buildingId: string } | null {
  const pos = pawn.position;
  if (!pos) return null;
  const campfires = (gs.buildings ?? []).filter(
    (b) => b.status === 'complete' && CAMPFIRE_TYPES.includes(b.type)
  );
  const b = findNearestBy(campfires, (c) => manhattan(c.x, c.y, pos.x, pos.y));
  return b ? { x: b.x, y: b.y, buildingId: b.id } : null;
}

export function findNearestRestBuilding(
  pawn: Pawn,
  gs: GameState
): { x: number; y: number; buildingId: string } | null {
  if (!pawn.position) return null;
  const assigned = (gs.buildings ?? []).find(
    (b) => b.status === 'complete' && isRestBuildingType(b.type) && b.assignedPawnId === pawn.id
  );
  if (assigned) return { x: assigned.x, y: assigned.y, buildingId: assigned.id };
  let best: { x: number; y: number; buildingId: string; score: number } | null = null;
  for (const b of gs.buildings ?? []) {
    if (b.status !== 'complete') continue;
    if (!isRestBuildingType(b.type)) continue;
    if (b.assignedPawnId && b.assignedPawnId !== pawn.id) continue;
    if (tileHasBody(gs, b.x, b.y, [pawn.id])) continue;
    if (
      gs.pawns.some(
        (p) =>
          p.id !== pawn.id &&
          p.currentState === PAWN_STATE.MOVING_TO_NEED &&
          p.activeJob?.targetState === PAWN_STATE.SLEEPING &&
          p.activeJob?.targetX === b.x &&
          p.activeJob?.targetY === b.y
      )
    )
      continue;
    const def = BUILDINGS_DB.find((d) => d.id === b.type);
    const quality = (def?.effects?.sleepQuality ?? 0) + (def?.effects?.fatigueRecovery ?? 0);
    const dist = manhattan(b.x, b.y, pawn.position!.x, pawn.position!.y);
    const score = quality * 100 - dist * 0.01;
    if (!best || score > best.score) best = { x: b.x, y: b.y, buildingId: b.id, score };
  }
  return best ? { x: best.x, y: best.y, buildingId: best.buildingId } : null;
}

export function findNearestGatheringBuilding(
  pawn: Pawn,
  gs: GameState
): { x: number; y: number } | null {
  if (!pawn.position) return null;
  const gatherings = (gs.buildings ?? []).filter((b) => gatheringLevelOf(b) > 0);
  if (!gatherings.length) return null;
  const best = Math.max(...gatherings.map((b) => gatheringLevelOf(b)));
  const b = findNearestBy(
    gatherings.filter((c) => gatheringLevelOf(c) === best),
    (c) => manhattan(c.x, c.y, pawn.position!.x, pawn.position!.y)
  );
  return b ? { x: b.x, y: b.y } : null;
}

export function findNearestSeatBuilding(
  pawn: Pawn,
  gs: GameState
): { x: number; y: number } | null {
  if (!pawn.position) return null;
  const seats = (gs.buildings ?? []).filter(
    (b) =>
      b.status === 'complete' && BUILDINGS_DB.find((d) => d.id === b.type)?.buildingProperties?.seat
  );
  const b = findNearestBy(seats, (c) => manhattan(c.x, c.y, pawn.position!.x, pawn.position!.y));
  return b ? { x: b.x, y: b.y } : null;
}

export function isAtFoodBuilding(pawn: Pawn, gs: GameState): boolean {
  if (!pawn.position) return false;
  return (gs.buildings ?? []).some(
    (b) =>
      b.status === 'complete' &&
      CAMPFIRE_TYPES.includes(b.type) &&
      isAdjacent(pawn.position!.x, pawn.position!.y, b.x, b.y)
  );
}

export function getRestBuildingAtPawn(pawn: Pawn, gs: GameState): PlacedBuilding | null {
  if (!pawn.position) return null;
  return (
    (gs.buildings ?? []).find(
      (b) =>
        b.status === 'complete' &&
        isRestBuildingType(b.type) &&
        Math.abs(b.x - pawn.position!.x) <= 1 &&
        Math.abs(b.y - pawn.position!.y) <= 1
    ) ?? null
  );
}

export { amenityAt, AMENITY_RADIUS, buildingComfortOf } from '../../core/defs/amenities';
export { gatheringLevelOf };

export function isAtRestBuilding(pawn: Pawn, gs: GameState): boolean {
  return getRestBuildingAtPawn(pawn, gs) !== null;
}

export function distToNearestFoodSource(pawn: Pawn, gs: GameState): number {
  if (!pawn.position) return Infinity;
  if (!hasAvailableFood(gs)) return Infinity;
  const building = findNearestStorageBuilding(pawn, gs);
  if (!building) return 0;
  return manhattan(building.x, building.y, pawn.position.x, pawn.position.y);
}

export function distToNearestFoodFetch(pawn: Pawn, gs: GameState): number {
  if (!pawn.position) return Infinity;
  const drops = findNearestFoodDrops(pawn, gs);
  if (drops.length === 0) return Infinity;
  return manhattan(drops[0].x, drops[0].y, pawn.position.x, pawn.position.y);
}

export function distToNearestDrinkTarget(pawn: Pawn, gs: GameState): number {
  if (!pawn.position) return Infinity;
  const target = findNearestWaterTarget(pawn, gs, 'drink') ?? findNearestStoredDrink(pawn, gs);
  if (!target) return Infinity;
  return manhattan(target.x, target.y, pawn.position.x, pawn.position.y);
}

export function distToNearestRestSource(pawn: Pawn, gs: GameState): number {
  if (!pawn.position) return Infinity;
  const building = findNearestRestBuilding(pawn, gs);
  if (!building) return 0;
  return manhattan(building.x, building.y, pawn.position.x, pawn.position.y);
}

export function distFromPointToNearestFoodSource(x: number, y: number, gs: GameState): number {
  if (!hasAvailableFood(gs)) return Infinity;
  let best = Infinity;
  for (const b of gs.buildings ?? []) {
    if (b.status !== 'complete') continue;
    if (!CAMPFIRE_TYPES.includes(b.type)) continue;
    const d = manhattan(b.x, b.y, x, y);
    if (d < best) best = d;
  }
  return best === Infinity ? 0 : best;
}

export function computeMinQueueFoodDist(
  queueIds: string[],
  pawn: Pawn,
  gs: GameState
): number | null {
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

export function distFromPointToNearestRestSource(x: number, y: number, gs: GameState): number {
  let best = Infinity;
  for (const b of gs.buildings ?? []) {
    if (b.status !== 'complete') continue;
    if (!isRestBuildingType(b.type)) continue;
    const d = manhattan(b.x, b.y, x, y);
    if (d < best) best = d;
  }
  return best === Infinity ? 0 : best;
}

export function computeMinQueueRestDist(
  queueIds: string[],
  pawn: Pawn,
  gs: GameState
): number | null {
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

export function computeAdjustedNeedThreshold(
  baseThreshold: number,
  laborLevel: number,
  minQueueFoodDist: number | null
): number {
  const priorityShift = (laborLevel - 2) * WORK_PRIORITY_THRESHOLD_SHIFT;
  const queueFoodPressure = minQueueFoodDist !== null ? Math.min(minQueueFoodDist / 20, 1) : 1;
  const queueShift = -(queueFoodPressure * QUEUE_FOOD_THRESHOLD_REDUCTION);
  return Math.max(
    baseThreshold - 12,
    Math.min(baseThreshold + 12, baseThreshold + priorityShift + queueShift)
  );
}

export function shouldInterruptForNeed(
  need: number,
  threshold: number,
  distToSource: number,
  distToJob: number
): boolean {
  if (need >= 100) return true;
  if (need < threshold) return false;
  const urgency = (need - threshold) / (100 - threshold);
  const urgencyBias = urgency * urgency;
  const effectiveJobDist = Math.max(distToJob, NEED_DETOUR_MIN_DIST);
  const maxAcceptableDist = effectiveJobDist * (1 + urgencyBias * (NEED_DETOUR_MAX_FACTOR - 1));
  return distToSource <= maxAcceptableDist;
}

export function transitionTo(pawn: Pawn, state: PawnStateName, gs: GameState): GameState {
  const prev = pawn.currentState ?? PAWN_STATE.IDLE;
  if (prev !== state) {
    gameLogger.log(gs.turn, 'STATE-CHG', `${pawn.name} ${prev} → ${state}`);
  }
  const target = pawnById(gs.pawns, pawn.id);
  if (target) target.currentState = state;
  return gs;
}

export function goIdle(pawn: Pawn, gs: GameState): GameState {
  const target = pawnById(gs.pawns, pawn.id);
  if (target) {
    target.currentState = PAWN_STATE.IDLE;
    target.activeJob = undefined;
    target.isMoving = false;
    target.path = [];
  }
  return gs;
}

export function releaseClaimedJobs(jobs: Job[], pawnId: string): Job[] {
  if (!jobs?.some((j) => j.claimedBy === pawnId)) return jobs;
  return jobs.map((j) => (j.claimedBy === pawnId ? { ...j, claimedBy: null } : j));
}

export function forceUncontrolled(pawn: Pawn, forcedState: string, halt = true): Pawn {
  const base: Pawn = {
    ...pawn,
    currentState: forcedState,
    drafted: false,
    draftTarget: undefined,
    activeJob: undefined
  };
  return halt ? { ...base, path: [], isMoving: false, hasReachedDestination: false } : base;
}

export function mutatePawn(gs: GameState, id: string, mutate: (p: Pawn) => void): GameState {
  const p = pawnById(gs.pawns, id);
  if (p) mutate(p);
  return gs;
}

export function advancePawnOrders(p: Pawn): void {
  const q = p.manualQueue ?? [];
  if (q.length > 0) {
    p.draftTarget = q[0];
    p.manualQueue = q.length > 1 ? q.slice(1) : undefined;
  } else {
    p.draftTarget = undefined;
    p.manualQueue = undefined;
  }
}

let _mobSubsetCache: { mobsRef: Mob[] | undefined; hostiles: Mob[]; huntTargets: Mob[] } | null =
  null;

function mobSubsets(gs: GameState): { hostiles: Mob[]; huntTargets: Mob[] } {
  const mobs = gs.mobs;
  if (_mobSubsetCache && _mobSubsetCache.mobsRef === mobs) return _mobSubsetCache;
  const hostiles: Mob[] = [];
  const huntTargets: Mob[] = [];
  for (const m of mobs ?? []) {
    if (m.isAlive === false || m.state === 'Corpse') continue;
    if (m.entityClass === 'mob' || m.state === 'Attacking' || m.state === 'Alerted')
      hostiles.push(m);
    if (m.markedForHunt) huntTargets.push(m);
  }
  _mobSubsetCache = { mobsRef: mobs, hostiles, huntTargets };
  return _mobSubsetCache;
}

export function findCombatThreat(pawn: Pawn, gs: GameState): Mob | null {
  if (!pawn.position || pawn.isAlive === false) return null;
  const stance = pawn.combatStance ?? 'defensive';
  const vision = pawnVisionTiles(pawn, gs);
  let range = stance === 'defensive' ? 1 : vision;
  const rw = getRangedWeapon(pawn);
  if (rw) range = Math.max(range, effectiveRangedRange(pawn, rw));
  const ignoreDowned = stance !== 'aggressive';
  const px = pawn.position.x;
  const py = pawn.position.y;
  let best: Mob | null = null;
  let bestDist = Infinity;
  for (const m of mobSubsets(gs).hostiles) {
    if (ignoreDowned && m.state === 'Collapsed') continue;
    const d = chebyshev(px, py, m.x, m.y);
    if (d <= range && d < bestDist) {
      best = m;
      bestDist = d;
    }
  }
  return best;
}

export function haltMovement(pawn: Pawn, gs: GameState): GameState {
  if ((pawn.path?.length ?? 0) === 0 && !pawn.isMoving) return gs;
  const target = pawnById(gs.pawns, pawn.id);
  if (target) {
    target.path = [];
    target.isMoving = false;
    target.hasReachedDestination = false;
  }
  return gs;
}

export function laborLevel(pawn: Pawn, workId: string, gs: GameState): number {
  const ls = gs.workAssignments?.[pawn.id]?.laborSettings;
  if (ls && workId in ls) return ls[workId] ?? 2;
  const pri = gs.workAssignments?.[pawn.id]?.workPriorities?.[workId];
  return pri ?? 2;
}

export function findNearestHuntTarget(pawn: Pawn, gs: GameState): Mob | null {
  const pos = pawn.position;
  if (!pos) return null;
  return findNearestBy(mobSubsets(gs).huntTargets, (m) => chebyshev(m.x, m.y, pos.x, pos.y));
}

export function enterHunting(pawn: Pawn, target: Mob, gs: GameState): GameState {
  return {
    ...gs,
    pawns: gs.pawns.map((p) =>
      p.id === pawn.id
        ? { ...p, currentState: PAWN_STATE.HUNTING, huntTargetId: target.id, activeJob: undefined }
        : p
    )
  };
}

export function tryStartHunt(pawn: Pawn, gs: GameState, bestJob: Job | null): GameState | null {
  if (!pawn.position) return null;
  const huntLevel = laborLevel(pawn, 'hunting', gs);
  if (huntLevel <= 0) return null;
  const jobLevel = bestJob ? laborLevel(pawn, jobService.getJobWorkCategory(bestJob, gs), gs) : 0;
  if (huntLevel < jobLevel) return null;

  const target = findNearestHuntTarget(pawn, gs);
  if (!target) return null;

  if (chebyshev(pawn.position.x, pawn.position.y, target.x, target.y) <= 1) {
    return enterHunting(pawn, target, gs);
  }
  const afterPath = tryAssignPath(pawn, target.x, target.y, gs);
  if (!afterPath) return null;
  return enterHunting(pawn, target, afterPath);
}

export function endHunt(pawn: Pawn, state: PawnStateName, gs: GameState): GameState {
  return {
    ...gs,
    pawns: gs.pawns.map((p) =>
      p.id === pawn.id
        ? { ...p, currentState: state, huntTargetId: undefined, path: [], isMoving: false }
        : p
    )
  };
}

export const ROUTE_TO_DRINK_THIRST = needNum('thirst', 'seek', 82);

export const ROUTE_TO_WASH_HYGIENE = needNum('hygiene', 'seek', 88);

export const RELAXATION_THRESHOLD = needNum('relaxation', 'seek', 30);
export const SOCIALISE_TURNS = ticksFromSeconds(needNum('relaxation', 'durationSeconds', 20));
export const SOCIALISE_RELAXATION_RELIEF = needNum('relaxation', 'relief', 70);

export const COMFORT_THRESHOLD = needNum('comfort', 'seek', 35);
export const LOUNGE_TURNS = ticksFromSeconds(needNum('comfort', 'durationSeconds', 25));
export const LOUNGE_COMFORT_RELIEF = needNum('comfort', 'relief', 75);

export const WASH_NEED_RELIEF = needNum('hygiene', 'relief', 70);

export const DRINK_TURNS = ticksFromSeconds(needNum('thirst', 'durationSeconds', 2));

export const WASH_TURNS = ticksFromSeconds(needNum('hygiene', 'durationSeconds', 4));

export function findNearestWaterTarget(
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
    const dist = manhattan(x, y, px, py);
    if (!best || dist < best.dist) best = { x, y, dist };
  }
  if (best) return { x: best.x, y: best.y };

  for (const b of gs.buildings ?? []) {
    if (b.status !== 'complete' || b.type !== 'well') continue;
    const dist = manhattan(b.x, b.y, px, py);
    if (!best || dist < best.dist) best = { x: b.x, y: b.y, dist };
  }
  return best ? { x: best.x, y: best.y } : null;
}

export function findNearestStoredDrink(
  pawn: Pawn,
  gs: GameState
): { x: number; y: number; itemId: string } | null {
  const pos = pawn.position;
  if (!pos) return null;
  const held: { x: number; y: number; itemId: string; litres: number }[] = [];
  for (const d of gs.droppedItems ?? []) {
    if (!d.stored || d.forbidden || d.reservedFor || !d.instance) continue;
    for (const e of d.instance.contents ?? [])
      if (isDrinkId(e.itemId) && (e.litres ?? 0) > 0)
        held.push({ x: d.x, y: d.y, itemId: e.itemId, litres: e.litres ?? 0 });
  }
  for (const b of gs.buildings ?? []) {
    if (b.status !== 'complete') continue;
    for (const e of b.fluidContents ?? [])
      if (isDrinkId(e.itemId) && (e.litres ?? 0) > 0)
        held.push({ x: b.x, y: b.y, itemId: e.itemId, litres: e.litres ?? 0 });
  }
  if (held.length === 0) return null;
  let best = held[0];
  let bestDist = manhattan(best.x, best.y, pos.x, pos.y);
  for (const h of held) {
    const dist = manhattan(h.x, h.y, pos.x, pos.y);
    if (dist < bestDist) {
      best = h;
      bestDist = dist;
    }
  }
  return { x: best.x, y: best.y, itemId: best.itemId };
}

export function tryRouteToWaterNeed(
  pawn: Pawn,
  gameState: GameState,
  kind: 'drink' | 'wash'
): GameState | null {
  if (kind === 'drink' && carriedDrinkVessel(pawn)) {
    const gs = transitionTo(pawn, PAWN_STATE.DRINKING, gameState);
    return {
      ...gs,
      pawns: gs.pawns.map((p) =>
        p.id === pawn.id ? { ...p, path: [], isMoving: false, nextCellCostLeft: undefined } : p
      )
    };
  }
  let target = findNearestWaterTarget(pawn, gameState, kind);
  if (!target && kind === 'drink') target = findNearestStoredDrink(pawn, gameState);
  if (!target || !pawn.position) return null;
  const targetState = kind === 'drink' ? PAWN_STATE.DRINKING : PAWN_STATE.WASHING;
  if (isAdjacent(pawn.position.x, pawn.position.y, target.x, target.y)) {
    const gs = transitionTo(pawn, targetState, gameState);
    return {
      ...gs,
      pawns: gs.pawns.map((p) =>
        p.id === pawn.id ? { ...p, path: [], isMoving: false, nextCellCostLeft: undefined } : p
      )
    };
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

export function tryRouteToSocialise(pawn: Pawn, gameState: GameState): GameState | null {
  const target = findNearestGatheringBuilding(pawn, gameState);
  if (!target || !pawn.position) return null;
  if (isAdjacent(pawn.position.x, pawn.position.y, target.x, target.y)) {
    const gs = transitionTo(pawn, PAWN_STATE.SOCIALISING, gameState);
    return {
      ...gs,
      pawns: gs.pawns.map((p) =>
        p.id === pawn.id ? { ...p, path: [], isMoving: false, nextCellCostLeft: undefined } : p
      )
    };
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
              targetState: PAWN_STATE.SOCIALISING
            }
          }
        : p
    )
  };
}

export function tryRouteToLounge(pawn: Pawn, gameState: GameState): GameState | null {
  const target = findNearestSeatBuilding(pawn, gameState);
  if (!target || !pawn.position) return null;
  if (isAdjacent(pawn.position.x, pawn.position.y, target.x, target.y)) {
    const gs = transitionTo(pawn, PAWN_STATE.LOUNGING, gameState);
    return {
      ...gs,
      pawns: gs.pawns.map((p) =>
        p.id === pawn.id ? { ...p, path: [], isMoving: false, nextCellCostLeft: undefined } : p
      )
    };
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
              targetState: PAWN_STATE.LOUNGING
            }
          }
        : p
    )
  };
}
