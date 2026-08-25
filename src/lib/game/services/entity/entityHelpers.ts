import type { GameState, Mob, Pawn, WorldTile } from '../../core/types';
import { getCreatureById, type CreatureDefinition } from '../../core/defs/creatures';
import { pawnById } from '../../core/state/pawnIndex';
import { manhattan, chebyshev } from '../../core/util/distance';
import { SECONDS_PER_TICK, ticksFromSeconds } from '../../core/util/time';
import { getNightVision } from '../../core/rules/body/vision';
import {
  detectionScore,
  detectionChance,
  STEALTH_CHECK_INTERVAL_S,
  STEALTH_CHECK_JITTER_S,
  STEALTH_FORGET_S
} from '../../core/rules/body/stealth';
import { pawnStatService } from '../PawnStatService';
import { stepBody, seedMidCrossClaims } from '../MovementSystem';
import { resourceObjectService } from '../ResourceObjectService';
import { buildSharedSoftBlockedGrid, pathfinderService } from '../PathfinderService';
import { occupancyService } from '../OccupancyService';
import { hasLineOfSight } from '../../core/util/lineOfSight';
import { reachable } from './connectivity';
import { simLog, isVerboseLogging } from '../../core/util/logSink';
import { rng } from '../../core/util/rng';
import {
  type TileFoodKind,
  WILD_FORAGE_RESOURCE_IDS,
  HUNT_RADIUS,
  WANDER_MOVES_PER_SECOND,
  AI_THROTTLE_TICKS
} from './entityConstants';

export function entityName(mob: Mob): string {
  const base = mob.name ?? getCreatureById(mob.creatureId)?.name;
  return base ? `${base} #${mob.debugId ?? mob.id.slice(-4)}` : mob.id.slice(-6);
}

export function edibleResourceOnTile(
  tile: { resources?: Record<string, number> } | undefined,
  kinds: Set<TileFoodKind>
): string | null {
  const res = tile?.resources;
  if (!res) return null;
  const wantGrass = kinds.has('grass');
  const wantForage = kinds.has('forage');
  for (const k in res) {
    if ((res[k] ?? 0) <= 0) continue;
    if (wantGrass && resourceObjectService.getById(k)?.grazing) return k;
    if (wantForage && WILD_FORAGE_RESOURCE_IDS.has(k)) return k;
  }
  return null;
}

export function findNearestFoodTile(
  state: GameState,
  x: number,
  y: number,
  radius: number,
  kinds: Set<TileFoodKind>
): { x: number; y: number } | null {
  if (kinds.size === 0) return null;
  for (let d = 0; d <= radius; d++) {
    for (let dx = -d; dx <= d; dx++) {
      const ay = d - Math.abs(dx);
      const dys = ay === 0 ? [0] : [ay, -ay];
      for (const dy of dys) {
        const tile = state.worldMap[y + dy]?.[x + dx];
        if (tile?.walkable && edibleResourceOnTile(tile, kinds)) return { x: x + dx, y: y + dy };
      }
    }
  }
  return null;
}

export function findReachableFoodTile(
  state: GameState,
  mob: Mob,
  radius: number,
  kinds: Set<TileFoodKind>,
  maxCandidates = 12
): { target: { x: number; y: number }; path: { x: number; y: number }[] } | null {
  if (kinds.size === 0) return null;
  const candidates: { x: number; y: number }[] = [];
  collect: for (let d = 0; d <= radius; d++) {
    for (let dx = -d; dx <= d; dx++) {
      const ay = d - Math.abs(dx);
      const dys = ay === 0 ? [0] : [ay, -ay];
      for (const dy of dys) {
        const nx = mob.x + dx;
        const ny = mob.y + dy;
        const tile = state.worldMap[ny]?.[nx];
        if (
          tile?.walkable &&
          reachable(mob.x, mob.y, nx, ny) &&
          edibleResourceOnTile(tile, kinds)
        ) {
          candidates.push({ x: nx, y: ny });
          if (candidates.length >= maxCandidates) break collect;
        }
      }
    }
  }
  for (const c of candidates) {
    if (c.x === mob.x && c.y === mob.y) return { target: c, path: [] };
    const path = pathTo(state, mob.x, mob.y, c.x, c.y, mob.id, 'forage');
    if (path.length) return { target: c, path };
  }
  return null;
}

let _mobThreatCache: { ref: Mob[] | undefined; predators: Mob[]; prey: Mob[] } | null = null;

function mobThreatSubsets(allMobs: Mob[]): { predators: Mob[]; prey: Mob[] } {
  if (_mobThreatCache && _mobThreatCache.ref === allMobs) return _mobThreatCache;
  const predators: Mob[] = [];
  const prey: Mob[] = [];
  for (const m of allMobs) {
    if (m.state === 'Corpse') {
      if ((m.intactness ?? 1.0) > 0) prey.push(m);
      continue;
    }
    const def = getCreatureById(m.creatureId);
    if (def?.predator) predators.push(m);
    if (def?.huntable && m.state !== 'Tamed') prey.push(m);
  }
  _mobThreatCache = { ref: allMobs, predators, prey };
  return _mobThreatCache;
}

const THREAT_QUERY_RANGE = 40;
let _predNearestCache: { ref: Mob[] | undefined; map: Map<string, Mob | null> } | null = null;

function nearestPredatorMap(allMobs: Mob[]): Map<string, Mob | null> {
  if (_predNearestCache && _predNearestCache.ref === allMobs) return _predNearestCache.map;
  const { predators, prey } = mobThreatSubsets(allMobs);
  const map = new Map<string, Mob | null>();
  if (predators.length > 0 && prey.length > 0) {
    const pts = new Float32Array(predators.length * 2);
    for (let i = 0; i < predators.length; i++) {
      pts[2 * i] = predators[i].x;
      pts[2 * i + 1] = predators[i].y;
    }
    const qrs = new Float32Array(prey.length * 2);
    for (let i = 0; i < prey.length; i++) {
      qrs[2 * i] = prey[i].x;
      qrs[2 * i + 1] = prey[i].y;
    }
    const res = pathfinderService.nearestEach(pts, qrs, THREAT_QUERY_RANGE);
    if (res) {
      for (let i = 0; i < prey.length; i++) {
        const idx = res[i];
        map.set(prey[i].id, idx >= 0 ? predators[idx] : null);
      }
    } else {
      for (const p of prey) {
        let best: Mob | null = null;
        let bd = THREAT_QUERY_RANGE;
        for (const m of predators) {
          if (m.id === p.id) continue;
          const d = dist(p, { x: m.x, y: m.y });
          if (d < bd) {
            bd = d;
            best = m;
          }
        }
        map.set(p.id, best);
      }
    }
  }
  _predNearestCache = { ref: allMobs, map };
  return map;
}

export function findNearestPrey(
  mob: Mob,
  allMobs: Mob[],
  allowLivePrey: boolean,
  worldMap: WorldTile[][]
): Mob | null {
  let best: Mob | null = null;
  let bestDist = Infinity;
  const canTarget = (c: Mob) =>
    reachable(mob.x, mob.y, c.x, c.y) && hasLineOfSight(worldMap, mob.x, mob.y, c.x, c.y);
  for (const candidate of mobThreatSubsets(allMobs).prey) {
    if (candidate.id === mob.id) continue;
    if (candidate.state !== 'Corpse' && candidate.creatureId === mob.creatureId) continue;
    const raw = manhattan(candidate.x, candidate.y, mob.x, mob.y);
    if (candidate.state === 'Corpse') {
      const d = raw * 0.5;
      if (d < bestDist && canTarget(candidate)) {
        bestDist = d;
        best = candidate;
      }
    } else if (allowLivePrey && raw <= HUNT_RADIUS) {
      if (raw < bestDist && canTarget(candidate)) {
        bestDist = raw;
        best = candidate;
      }
    }
  }
  return best;
}

export function huntAttacker(
  mob: Mob,
  state: GameState,
  allMobs: Mob[]
): { x: number; y: number } | null {
  if (!mob.huntTargetId) return null;
  const m = allMobs.find((a) => a.id === mob.huntTargetId);
  if (m) return m.state === 'Attacking' ? { x: m.x, y: m.y } : null;
  const p = pawnById(state.pawns, mob.huntTargetId);
  if (
    p &&
    p.isAlive !== false &&
    p.position &&
    (p.currentState === 'Hunting' || p.currentState === 'Fighting')
  ) {
    return { x: p.position.x, y: p.position.y };
  }
  return null;
}

export function nearestPredatorThreat(
  prey: Mob,
  def: CreatureDefinition,
  allMobs: Mob[],
  visionRange: number
): { pos: { x: number; y: number } } | null {
  if (!def.huntable || def.predator) return null;
  const best = nearestPredatorMap(allMobs).get(prey.id);
  if (!best) return null;
  const d = dist(prey, { x: best.x, y: best.y });
  return d <= visionRange ? { pos: { x: best.x, y: best.y } } : null;
}

export function wanderStep(mob: Mob, def: CreatureDefinition, state: GameState): Mob {
  if (mob.path && mob.path.length > 0 && (mob.pathIndex ?? 0) < mob.path.length) return mob;
  if (rng.random() >= WANDER_MOVES_PER_SECOND * SECONDS_PER_TICK) return mob;
  const tile = findNearbyWalkable(state, mob.x, mob.y, mob.id);
  if (!tile) return mob;
  return { ...mob, path: [tile], pathIndex: 0, nextCellCostLeft: undefined };
}

export function moveToward(mob: Mob, target: { x: number; y: number }, state: GameState): Mob {
  return stepDirectional(mob, target, state, 1);
}

export function moveAway(mob: Mob, threat: { x: number; y: number }, state: GameState): Mob {
  return stepDirectional(mob, threat, state, -1);
}

export function fleeFromThreats(
  mob: Mob,
  threats: { x: number; y: number }[],
  state: GameState
): Mob {
  if (threats.length === 0) return mob;
  const minThreatDist = (x: number, y: number) =>
    threats.reduce((m, t) => Math.min(m, chebyshev(t.x, t.y, x, y)), Infinity);

  const stayScore = minThreatDist(mob.x, mob.y);
  const heading = mob.path?.[mob.pathIndex ?? 0];
  let best: { x: number; y: number } | null = null;
  let bestScore = -Infinity;
  let bestIsHeading = false;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = mob.x + dx;
      const ny = mob.y + dy;
      if (!isWalkable(state, nx, ny)) continue;
      if (
        dx !== 0 &&
        dy !== 0 &&
        !isWalkable(state, mob.x + dx, mob.y) &&
        !isWalkable(state, mob.x, mob.y + dy)
      )
        continue;
      if (occupancyService.isBlocked(state, nx, ny, mob.id)) continue;
      const score = minThreatDist(nx, ny);
      const isHeading = !!heading && heading.x === nx && heading.y === ny;
      if (score > bestScore || (score === bestScore && isHeading && !bestIsHeading)) {
        best = { x: nx, y: ny };
        bestScore = score;
        bestIsHeading = isHeading;
      }
    }
  }

  if (!best || bestScore < stayScore) return { ...mob, path: [] };
  if (heading && heading.x === best.x && heading.y === best.y) return mob;
  return { ...mob, path: [best], pathIndex: 0, nextCellCostLeft: undefined };
}

const FLEE_REACHED_DIST = 3;
const FLEE_BURST_TILES = 22;
const MOB_PATH_MAX_ITER = 8000;

export function fleeToSafety(mob: Mob, threats: { x: number; y: number }[], state: GameState): Mob {
  if (threats.length === 0) return mob;

  const pathExhausted = !mob.path?.length || (mob.pathIndex ?? 0) >= mob.path.length;
  if (!pathExhausted && mob.fleeDest) return mob;

  const h = state.worldMap.length;
  const w = state.worldMap[0]?.length ?? 0;
  const fleeDistance = Math.min(FLEE_BURST_TILES, Math.max(8, Math.floor(Math.max(w, h) / 2)));
  const minThreatDist = (x: number, y: number) =>
    threats.reduce((m, t) => Math.min(m, chebyshev(t.x, t.y, x, y)), Infinity);

  const dest = mob.fleeDest;
  if (dest) {
    const reached = chebyshev(dest.x, dest.y, mob.x, mob.y) <= FLEE_REACHED_DIST;
    const stillSafe = minThreatDist(dest.x, dest.y) > fleeDistance / 2;
    if (!reached && stillSafe) {
      const path = pathTo(state, mob.x, mob.y, dest.x, dest.y, mob.id, 'flee');
      if (path.length > 0) return { ...mob, path, pathIndex: 0 };
    }
  }

  const dirs = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 1, dy: 1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: -1, dy: -1 }
  ];
  const candidates = dirs
    .map(({ dx, dy }) => {
      const tx = Math.max(0, Math.min(w - 1, mob.x + dx * fleeDistance));
      const ty = Math.max(0, Math.min(h - 1, mob.y + dy * fleeDistance));
      return { tx, ty, score: minThreatDist(tx, ty) };
    })
    .sort((a, b) => b.score - a.score);

  for (const c of candidates) {
    const goal = isWalkable(state, c.tx, c.ty)
      ? { x: c.tx, y: c.ty }
      : findNearbyWalkable(state, c.tx, c.ty, mob.id);
    if (!goal || (goal.x === mob.x && goal.y === mob.y) || !reachable(mob.x, mob.y, goal.x, goal.y))
      continue;
    const path = pathTo(state, mob.x, mob.y, goal.x, goal.y, mob.id, 'flee2');
    if (path.length > 0) return { ...mob, fleeDest: goal, path, pathIndex: 0 };
  }

  return { ...fleeFromThreats(mob, threats, state), fleeDest: undefined };
}

export function bestApproachTile(
  state: GameState,
  from: { x: number; y: number },
  target: { x: number; y: number },
  selfId: string
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = target.x + dx;
      const ny = target.y + dy;
      if (!isWalkable(state, nx, ny)) continue;
      if (occupancyService.isBlocked(state, nx, ny, selfId)) continue;
      const d = manhattan(nx, ny, from.x, from.y);
      if (d < bestDist) {
        bestDist = d;
        best = { x: nx, y: ny };
      }
    }
  }
  return best;
}

export type ApproachDecision =
  | { kind: 'hold' }
  | { kind: 'repath'; path: { x: number; y: number }[] }
  | { kind: 'unreachable' };

export function approachForMelee(
  mob: Mob,
  targetPos: { x: number; y: number },
  state: GameState,
  turn: number
): ApproachDecision {
  const pathEnd = mob.path && mob.path.length > 0 ? mob.path[mob.path.length - 1] : null;
  const pathExhausted = !mob.path?.length || (mob.pathIndex ?? 0) >= mob.path.length;
  const targetMoved = !pathEnd || chebyshev(pathEnd.x, pathEnd.y, targetPos.x, targetPos.y) > 1.5;
  const repathDue = pathExhausted || (targetMoved && (turn - mob.stateSince) % 10 === 0);
  if (!repathDue) return { kind: 'hold' };
  const approachTile = bestApproachTile(state, mob, targetPos, mob.id) ?? targetPos;
  const path = pathTo(state, mob.x, mob.y, approachTile.x, approachTile.y, mob.id, 'approach');
  if (!path.length) return { kind: 'unreachable' };
  return { kind: 'repath', path };
}

export function stepDirectional(
  mob: Mob,
  ref: { x: number; y: number },
  state: GameState,
  sign: 1 | -1
): Mob {
  const dx = Math.sign(ref.x - mob.x) * sign;
  const dy = Math.sign(ref.y - mob.y) * sign;
  const primary = [
    { x: mob.x + dx, y: mob.y + dy },
    { x: mob.x + dx, y: mob.y },
    { x: mob.x, y: mob.y + dy }
  ].filter((c) => c.x !== mob.x || c.y !== mob.y);

  for (const c of primary) {
    if (isWalkable(state, c.x, c.y) && !occupancyService.isBlocked(state, c.x, c.y, mob.id)) {
      const currentNext = mob.path?.[mob.pathIndex ?? 0];
      if (currentNext && currentNext.x === c.x && currentNext.y === c.y) return mob;
      return { ...mob, path: [c], pathIndex: 0, nextCellCostLeft: undefined };
    }
  }

  const curDist = manhattan(mob.x, mob.y, ref.x, ref.y);
  const allNeighbours = [
    { x: mob.x - 1, y: mob.y - 1 },
    { x: mob.x, y: mob.y - 1 },
    { x: mob.x + 1, y: mob.y - 1 },
    { x: mob.x - 1, y: mob.y },
    { x: mob.x + 1, y: mob.y },
    { x: mob.x - 1, y: mob.y + 1 },
    { x: mob.x, y: mob.y + 1 },
    { x: mob.x + 1, y: mob.y + 1 }
  ].sort((a, b) => {
    const dA = manhattan(a.x, a.y, ref.x, ref.y);
    const dB = manhattan(b.x, b.y, ref.x, ref.y);
    return (dA - dB) * sign;
  });

  for (const c of allNeighbours) {
    if (sign === 1) {
      const cDist = manhattan(c.x, c.y, ref.x, ref.y);
      if (cDist >= curDist) break;
    }
    if (isWalkable(state, c.x, c.y) && !occupancyService.isBlocked(state, c.x, c.y, mob.id)) {
      const currentNext = mob.path?.[mob.pathIndex ?? 0];
      if (currentNext && currentNext.x === c.x && currentNext.y === c.y) return mob;
      return { ...mob, path: [c], pathIndex: 0, nextCellCostLeft: undefined };
    }
  }
  return mob;
}

export function advanceMobMovement(state: GameState): GameState {
  const mobs = state.mobs;
  if (!mobs || mobs.length === 0) return state;

  const occupancy = occupancyService.blockedTiles(state);
  const targetByTile = occupancyService.movingTargets(state);
  const claimed = new Set<string>();
  seedMidCrossClaims(mobs, claimed, (m) => m.state !== 'Corpse');

  let changed = false;
  const next: Mob[] = new Array(mobs.length);

  for (let i = 0; i < mobs.length; i++) {
    const mob = mobs[i];
    const def = getCreatureById(mob.creatureId);
    const speed = def ? Math.max(0.5, def.stats.speed) : 1;
    const res = stepBody(mob, occupancy, claimed, state.worldMap, speed, targetByTile);
    next[i] = res.body;
    if (res.body !== mob) changed = true;
  }

  return changed ? { ...state, mobs: next } : state;
}

export function findNearbyWalkable(
  state: GameState,
  x: number,
  y: number,
  selfId?: string
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
  for (const { dx, dy } of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (!isWalkable(state, nx, ny)) continue;
    if (dx !== 0 && dy !== 0 && !isWalkable(state, x + dx, y) && !isWalkable(state, x, y + dy)) {
      continue;
    }
    if (selfId && occupancyService.isBlocked(state, nx, ny, selfId)) continue;
    return { x: nx, y: ny };
  }
  return null;
}

export function isWalkable(state: GameState, x: number, y: number): boolean {
  const tile = state.worldMap[y]?.[x];
  return !!tile && tile.walkable;
}

export function mobInLiveRegion(
  mob: { x: number; y: number },
  pawns: Pawn[],
  radius: number
): boolean {
  for (let i = 0; i < pawns.length; i++) {
    const pos = pawns[i].position;
    if (pos && Math.abs(pos.x - mob.x) <= radius && Math.abs(pos.y - mob.y) <= radius) return true;
  }
  return false;
}

export function isThinkTick(id: string, turn: number): boolean {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return turn % AI_THROTTLE_TICKS === (h >>> 0) % AI_THROTTLE_TICKS;
}

export function nearestPawn(
  mob: Mob,
  pawns: Pawn[],
  skipDowned = false,
  skipIds?: string[]
): { pawn: Pawn; pos: { x: number; y: number } } | null {
  let best: Pawn | null = null;
  let bestDist = Infinity;
  const mx = mob.x;
  const my = mob.y;
  for (let i = 0; i < pawns.length; i++) {
    if (skipDowned && pawns[i].currentState === 'Collapsed') continue;
    if (skipIds && skipIds.includes(pawns[i].id)) continue;
    const pos = pawns[i].position!;
    const d = manhattan(pos.x, pos.y, mx, my);
    if (d < bestDist) {
      bestDist = d;
      best = pawns[i];
    }
  }
  return best ? { pawn: best, pos: best.position! } : null;
}

export function isPawnDetected(
  mob: Mob,
  pawn: Pawn,
  distToPawn: number,
  visionRange: number,
  tileLight: number,
  turn: number
): boolean {
  const checks = (mob.stealthChecks ??= {});
  const e = checks[pawn.id];
  if (e?.detected) {
    if (turn - e.at <= ticksFromSeconds(STEALTH_FORGET_S)) {
      e.at = turn;
      return true;
    }
    delete checks[pawn.id];
  } else if (e && turn < e.at) {
    return false;
  }
  const score = detectionScore(mob.stats?.perception ?? 10, tileLight, getNightVision(mob));
  const stealth = pawnStatService.evaluateStat('stealth', pawn);
  const proximityFrac = 1 - distToPawn / Math.max(1, visionRange);
  if (rng.random() < detectionChance(score, stealth, proximityFrac)) {
    checks[pawn.id] = { at: turn, detected: true };
    return true;
  }
  checks[pawn.id] = {
    at: turn + ticksFromSeconds(STEALTH_CHECK_INTERVAL_S + rng.random() * STEALTH_CHECK_JITTER_S),
    detected: false
  };
  return false;
}

export function dist(mob: Mob, pos: { x: number; y: number }): number {
  return chebyshev(mob.x, mob.y, pos.x, pos.y);
}

export function pathTo(
  state: GameState,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  selfId?: string,
  label = '?',
  maxIter: number = MOB_PATH_MAX_ITER
): { x: number; y: number }[] {
  if (!pathfinderService.isReady()) return [];
  void selfId;
  const blocked = occupancyService.blockedTilesShared(state);
  const { walkable, costs, width, height } = buildSharedSoftBlockedGrid(state.worldMap, blocked);
  const dbg = isVerboseLogging();
  const _t0 = dbg ? performance.now() : 0;
  const res = pathfinderService.findPath(walkable, costs, width, height, sx, sy, ex, ey, maxIter);
  if (dbg) {
    _pathMs += performance.now() - _t0;
    _pathCalls++;
    const lab = (_pathByLabel[label] ??= { calls: 0, fails: 0 });
    lab.calls++;
    if (res.length === 0) {
      _pathFails++;
      lab.fails++;
      if (_failSamples < 8) {
        _failSamples++;
        simLog.logEvent({
          category: 'ai',
          severity: 'info',
          turn: state.turn,
          message: `PATHFAIL ${label} ${selfId ?? '?'} (${sx},${sy})->(${ex},${ey}) d=${Math.abs(ex - sx) + Math.abs(ey - sy)}`
        });
      }
    } else _pathLen += res.length;
  }
  return res;
}

const _pathByLabel: Record<string, { calls: number; fails: number }> = {};
let _failSamples = 0;
let _pathCalls = 0;
let _pathFails = 0;
let _pathMs = 0;
let _pathLen = 0;
export function readMobPathStats(): {
  calls: number;
  fails: number;
  ms: number;
  len: number;
  byLabel: string;
} {
  const byLabel = Object.entries(_pathByLabel)
    .sort((a, b) => b[1].fails - a[1].fails)
    .map(([k, v]) => `${k}=${v.fails}/${v.calls}`)
    .join(' ');
  const s = { calls: _pathCalls, fails: _pathFails, ms: _pathMs, len: _pathLen, byLabel };
  _pathCalls = _pathFails = _pathMs = _pathLen = 0;
  _failSamples = 0;
  for (const k in _pathByLabel) delete _pathByLabel[k];
  return s;
}

export function adjacent(mob: Mob, pos: { x: number; y: number }): boolean {
  return Math.abs(pos.x - mob.x) <= 1 && Math.abs(pos.y - mob.y) <= 1;
}
