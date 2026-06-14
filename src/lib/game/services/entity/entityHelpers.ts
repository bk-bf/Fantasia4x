// Shared entity helpers — queries, movement, and foraging lookups used by the spawning, AI, and
// lifecycle modules. Extracted from EntityService (P-4); converted from class methods to free
// functions (the class had no instance state but `idCounter`, so `this.` simply dropped away).
import type { GameState, Mob, Pawn } from '../../core/types';
import { getCreatureById, type CreatureDefinition } from '../../core/Creatures';
import { SECONDS_PER_TICK } from '../../core/time';
import { advanceAlongPath } from '../../systems/MovementSystem';
import { resourceObjectService } from '../ResourceObjectService';
import { wasmPathfinderService } from '../WasmPathfinderService';
import { buildPathfindingGridsWithBlocked } from '../PathfinderService';
import { occupancyService } from '../OccupancyService';
import { rng } from '../../core/rng';
import {
  type TileFoodKind,
  WILD_FORAGE_RESOURCE_IDS,
  HUNT_RADIUS,
  WANDER_MOVES_PER_SECOND,
  MAX_BLOCKED_TICKS
} from './entityConstants';

export function entityName(mob: Mob): string {
  const def = getCreatureById(mob.creatureId);
  return def ? `${def.name} #${mob.debugId ?? mob.id.slice(-4)}` : mob.id.slice(-6);
}

export function edibleResourceOnTile(
  tile: { resources?: Record<string, number> } | undefined,
  kinds: Set<TileFoodKind>
): string | null {
  if (!tile?.resources) return null;
  const wantGrass = kinds.has('grass');
  const wantForage = kinds.has('forage');
  for (const [k, v] of Object.entries(tile.resources)) {
    if ((v ?? 0) <= 0) continue;
    if (wantGrass && resourceObjectService.getById(k)?.grazing) return k;
    if (wantForage && WILD_FORAGE_RESOURCE_IDS.has(k)) return k;
  }
  return null;
}

/** Nearest tile (Manhattan) within `radius` that carries food matching `kinds`. */
export function findNearestFoodTile(
  state: GameState,
  x: number,
  y: number,
  radius: number,
  kinds: Set<TileFoodKind>
): { x: number; y: number } | null {
  if (kinds.size === 0) return null;
  let bestDist = Infinity;
  let best: { x: number; y: number } | null = null;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      const tile = state.worldMap[ny]?.[nx];
      if (!tile?.walkable) continue;
      if (!edibleResourceOnTile(tile, kinds)) continue;
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = { x: nx, y: ny };
      }
    }
  }
  return best;
}

/**
 * Nearest corpse (preferred) within HUNT_RADIUS, or — if `allowLivePrey` — the nearest
 * live huntable creature. `allowLivePrey` should be `predator || diet === 'carnivore'`:
 * scavenging a corpse doesn't require being a hunter, but stalking live prey does.
 */
export function findNearestPrey(mob: Mob, allMobs: Mob[], allowLivePrey: boolean): Mob | null {
  let best: Mob | null = null;
  let bestDist = Infinity;
  for (const candidate of allMobs) {
    if (candidate.id === mob.id) continue;
    const raw = Math.abs(candidate.x - mob.x) + Math.abs(candidate.y - mob.y);
    if (candidate.state === 'Corpse') {
      if ((candidate.intactness ?? 1.0) <= 0) continue; // stripped — skip
      // Corpses weighted as 50% closer — free food with no danger.
      const d = raw * 0.5;
      if (d < bestDist) {
        bestDist = d;
        best = candidate;
      }
    } else if (
      allowLivePrey &&
      getCreatureById(candidate.creatureId)?.huntable &&
      candidate.state !== 'Tamed' &&
      raw <= HUNT_RADIUS
    ) {
      if (raw < bestDist) {
        bestDist = raw;
        best = candidate;
      }
    }
  }
  return best;
}

/**
 * Returns the nearest predator within the prey's vision range.
 * Threat identity is driven solely by the `predator` flag in creatures.jsonc
 * (wolf, bear, goblin, wraith). Diet is irrelevant here \u2014 a passive omnivore
 * chicken is not a predator, so flockmates never frighten each other.
 */
/**
 * Position of whatever is currently attacking `mob` (tracked via `huntTargetId`) — a predator
 * MOB still in Attacking, or a colonist PAWN still Hunting/Fighting — or null if that attacker
 * is gone or has disengaged. This is the hook that lets the cornered-prey "fight back" state
 * trigger no matter who corners the animal (predator or hunter).
 */
export function huntAttacker(
  mob: Mob,
  state: GameState,
  allMobs: Mob[]
): { x: number; y: number } | null {
  if (!mob.huntTargetId) return null;
  const m = allMobs.find((a) => a.id === mob.huntTargetId);
  if (m) return m.state === 'Attacking' ? { x: m.x, y: m.y } : null;
  const p = state.pawns.find((pp) => pp.id === mob.huntTargetId);
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
  allMobs: Mob[]
): { pos: { x: number; y: number } } | null {
  if (!def.huntable) return null;
  let best: Mob | null = null;
  let bestDist = Infinity;
  for (const m of allMobs) {
    if (m.id === prey.id || m.state === 'Corpse') continue;
    const mDef = getCreatureById(m.creatureId);
    if (!mDef || !mDef.predator) continue; // only flagged predators frighten prey
    const d = dist(prey, { x: m.x, y: m.y });
    if (d <= def.stats.visionRange && d < bestDist) {
      bestDist = d;
      best = m;
    }
  }
  return best ? { pos: { x: best.x, y: best.y } } : null;
}

export function wanderStep(mob: Mob, def: CreatureDefinition, state: GameState): Mob {
  // Still following a path — let it finish before picking the next step.
  if (mob.path && mob.path.length > 0 && (mob.pathIndex ?? 0) < mob.path.length) return mob;
  // Probabilistic idle: ~WANDER_MOVES_PER_SECOND steps/sec on average.
  if (rng.random() >= WANDER_MOVES_PER_SECOND * SECONDS_PER_TICK) return mob;
  const tile = findNearbyWalkable(state, mob.x, mob.y, mob.homeX, mob.homeY, mob.id);
  if (!tile) return mob;
  return { ...mob, path: [tile], pathIndex: 0, nextCellCostLeft: undefined };
}

export function moveToward(mob: Mob, target: { x: number; y: number }, state: GameState): Mob {
  return stepDirectional(mob, target, state, 1);
}

export function moveAway(mob: Mob, threat: { x: number; y: number }, state: GameState): Mob {
  return stepDirectional(mob, threat, state, -1);
}

/**
 * Nearest walkable tile adjacent to `target` (excluding target itself), ranked
 * by Manhattan distance from `from`. Used so hunters path to a tile beside their
 * prey rather than onto the prey's occupied tile.
 */
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
      const d = Math.abs(nx - from.x) + Math.abs(ny - from.y);
      if (d < bestDist) {
        bestDist = d;
        best = { x: nx, y: ny };
      }
    }
  }
  return best;
}

export function stepDirectional(
  mob: Mob,
  ref: { x: number; y: number },
  state: GameState,
  sign: 1 | -1
): Mob {
  const dx = Math.sign(ref.x - mob.x) * sign;
  const dy = Math.sign(ref.y - mob.y) * sign;
  // Primary candidates: diagonal away + 2 cardinal fallbacks.
  // Filter self-tile: when dx or dy is 0, one candidate can equal (mob.x, mob.y),
  // which would produce a stuck self-referential path.
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

  // All primary directions blocked (cornered against terrain) — try the full 8
  // neighbours sorted by how well they move away from / toward the reference point.
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
    const dA = Math.abs(a.x - ref.x) + Math.abs(a.y - ref.y);
    const dB = Math.abs(b.x - ref.x) + Math.abs(b.y - ref.y);
    // sign = -1 (flee): maximise distance → sort descending
    // sign = +1 (approach): minimise distance → sort ascending
    return (dA - dB) * sign;
  });

  for (const c of allNeighbours) {
    if (isWalkable(state, c.x, c.y) && !occupancyService.isBlocked(state, c.x, c.y, mob.id)) {
      const currentNext = mob.path?.[mob.pathIndex ?? 0];
      if (currentNext && currentNext.x === c.x && currentNext.y === c.y) return mob;
      return { ...mob, path: [c], pathIndex: 0, nextCellCostLeft: undefined };
    }
  }
  return mob; // truly boxed in on all sides
}

/**
 * Advance all moving mobs along their paths using the shared MovementSystem.
 * Called once per tick in GameEngineImpl, after stepEntities().
 */
export function advanceMobMovement(state: GameState): GameState {
  const mobs = state.mobs;
  if (!mobs || mobs.length === 0) return state;

  // Hard tile occupancy: one entity body per tile, no phasing. A mob may not
  // enter a tile that holds another entity (pawn or mob) and two mobs may not
  // converge on the same free tile in one tick. `occupancy` = every body's
  // CURRENT tile; `claimed` = tiles a mover has committed to entering this tick.
  const occupancy = occupancyService.blockedTiles(state); // includes self; self-tile guarded below
  const claimed = new Set<string>();
  // A mob already mid-crossing (nextCellCostLeft set) committed to its target on a
  // prior tick — it owns that tile, so reserve it before anyone else can claim it.
  for (const m of mobs) {
    if (m.state === 'Corpse' || !m.path?.length || m.nextCellCostLeft == null) continue;
    const t = m.path[m.pathIndex ?? 0];
    if (t) claimed.add(`${t.x},${t.y}`);
  }

  let changed = false;
  const next: Mob[] = new Array(mobs.length);

  for (let i = 0; i < mobs.length; i++) {
    const mob = mobs[i];
    const target = mob.path?.[mob.pathIndex ?? 0];
    if (!mob.path || mob.path.length === 0 || !target) {
      next[i] = mob;
      continue;
    }
    const targetKey = `${target.x},${target.y}`;
    const selfKey = `${mob.x},${mob.y}`;
    const midCrossing = mob.nextCellCostLeft != null;
    // Blocked if the target tile holds another body, or another fresh mover has
    // already claimed it this tick (a mid-crosser already owns its own claim).
    const blocked =
      (occupancy.has(targetKey) && targetKey !== selfKey) ||
      (!midCrossing && claimed.has(targetKey));

    if (blocked) {
      const bt = (mob.blockedTicks ?? 0) + 1;
      next[i] =
        bt > MAX_BLOCKED_TICKS
          ? // Stuck too long (e.g. corridor deadlock) — drop the path so the
            // FSM re-routes around the obstruction next tick.
            { ...mob, path: [], pathIndex: 0, nextCellCostLeft: undefined, blockedTicks: 0 }
          : { ...mob, blockedTicks: bt };
      changed = true;
      continue;
    }

    if (!midCrossing) claimed.add(targetKey);
    const def = getCreatureById(mob.creatureId);
    const speed = def ? Math.max(0.5, def.stats.speed) : 1;
    const moved = advanceAlongPath(mob, speed, state.worldMap);
    next[i] = mob.blockedTicks ? { ...moved, blockedTicks: 0 } : moved;
    if (next[i] !== mob) changed = true;
  }

  return changed ? { ...state, mobs: next } : state;
}

export function findNearbyWalkable(
  state: GameState,
  x: number,
  y: number,
  homeX?: number,
  homeY?: number,
  selfId?: string
): { x: number; y: number } | null {
  const HOME_RANGE = 10;
  // Enumerate all 8 neighbours in random order (Fisher-Yates) so every walkable
  // direction is considered exactly once — no wasted random retries that could
  // leave a boxed-in animal stuck even when an exit exists.
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
    // Diagonal wall-cut prevention (mirrors WASM A*): a diagonal step is only
    // allowed if at least one shared orthogonal neighbour is walkable.
    if (dx !== 0 && dy !== 0 && !isWalkable(state, x + dx, y) && !isWalkable(state, x, y + dy)) {
      continue;
    }
    if (
      homeX !== undefined &&
      homeY !== undefined &&
      (Math.abs(nx - homeX) > HOME_RANGE || Math.abs(ny - homeY) > HOME_RANGE)
    ) {
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

export function nearestPawn(
  mob: Mob,
  pawns: Pawn[]
): { pawn: Pawn; pos: { x: number; y: number } } | null {
  let best: { pawn: Pawn; pos: { x: number; y: number } } | null = null;
  let bestDist = Infinity;
  for (const p of pawns) {
    const pos = p.position!;
    const d = Math.abs(pos.x - mob.x) + Math.abs(pos.y - mob.y);
    if (d < bestDist) {
      bestDist = d;
      best = { pawn: p, pos };
    }
  }
  return best;
}

export function dist(mob: Mob, pos: { x: number; y: number }): number {
  return Math.max(Math.abs(pos.x - mob.x), Math.abs(pos.y - mob.y));
}

/**
 * WASM A* path from (sx,sy) to (ex,ey). Returns the route EXCLUDING the start
 * tile, or [] if WASM is not ready or the target is unreachable. The terrain layer
 * is memoized per-worldMap reference; the entity-aware grid clones only the walkable
 * mask (occupancyService is the single source of "what's blocked"), so a path that
 * routes around bodies costs one mask clone, not a full grid rebuild.
 */
export function pathTo(
  state: GameState,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  selfId?: string
): { x: number; y: number }[] {
  if (!wasmPathfinderService.isReady()) return [];
  // Entities are solid: every pawn/mob body (except the mover itself) is a wall,
  // so paths route AROUND other entities and never plan through an occupied tile.
  // The movement engine additionally blocks entry into a tile that becomes
  // occupied after this path was computed.
  const blocked = occupancyService.blockedTiles(state, selfId);
  const { walkable, costs, width, height } = buildPathfindingGridsWithBlocked(
    state.worldMap,
    blocked,
    sx,
    sy,
    ex,
    ey
  );
  return wasmPathfinderService.findPath(walkable, costs, width, height, sx, sy, ex, ey);
}

export function adjacent(mob: Mob, pos: { x: number; y: number }): boolean {
  return Math.abs(pos.x - mob.x) <= 1 && Math.abs(pos.y - mob.y) <= 1;
}
