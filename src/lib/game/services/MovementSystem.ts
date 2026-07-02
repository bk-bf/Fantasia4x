/**
 * MovementSystem — shared movement physics for every entity that follows a
 * tile path (Pawn and Mob).
 *
 * Separates "where to go" (AI / FSM) from "how to move" (tick-accurate
 * budget drain with sub-tile interpolation).
 *
 * Cost model:
 *   • Entering a tile costs  movementCost × diagonal × TICKS_PER_SECOND  budget units.
 *   • Each tick an entity spends  speedTilesPerSec  budget units.
 *   • Open terrain (movementCost 1, cardinal) costs TICKS_PER_SECOND units,
 *     so an entity with speed 4 crosses it in TICKS_PER_SECOND / 4 = 15 ticks.
 */

import type { WorldTile } from '../core/types';
import { TICKS_PER_SECOND, ticksFromSeconds } from '../core/time';

// ── Shared interface ──────────────────────────────────────────────────────────

/** Minimum interface for movement advancement and sim-target rendering. */
export interface Movable {
  x: number;
  y: number;
  path?: { x: number; y: number }[];
  pathIndex?: number;
  nextCellCostLeft?: number;
}

/** A body that runs through the shared per-tick move pass: a Movable with a stable id and the
 *  blocked-ticks counter that drives the drop-and-reroute deadlock breaker. */
export interface MovableBody extends Movable {
  id: string;
  blockedTicks?: number;
}

/** Ticks a body may wait behind a blocking body before dropping its path to re-route. The SINGLE
 *  source for both the pawn and mob passes — when it lived in two places the passes drifted apart. */
export const MAX_BLOCKED_TICKS = ticksFromSeconds(1.5);

export type StepStatus = 'idle' | 'held' | 'dropped' | 'moved';

export interface StepResult<T extends MovableBody> {
  body: T;
  status: StepStatus;
  /** For 'moved': true when the path was fully consumed this step (the body arrived). */
  done: boolean;
}

// ── Core helpers ──────────────────────────────────────────────────────────────

/**
 * Tick cost to enter `to` from `from` (terrain-aware, diagonal-aware).
 * Matches the identical formula used by the pathfinder.
 */
export function moveCostToEnter(
  from: { x: number; y: number },
  to: { x: number; y: number },
  worldMap: WorldTile[][]
): number {
  const tile = worldMap[to.y]?.[to.x];
  let base = tile && tile.movementCost > 0 ? tile.movementCost : 1;
  // A constructed floor speeds traversal (boards/flagstones over mud/grass): `floor.speed` < 1 lowers
  // the per-tile cost. Budget-only (like snow below) — route choice still uses the cached A* grid, so
  // floors quicken the walk WITHOUT becoming preferred "streets" the pawn detours onto.
  if (tile?.floor) base *= tile.floor.speed;
  // Snow (deep, trudging) and ice (slippery, picked-across carefully) both slow traversal: +1×base per
  // 100% combined cover (so a fully snowed/iced tile ⇒ double cost). Budget-only (route choice still uses
  // the cached A* grid), so it slows pawns over deep snow / frozen water without rebuilding pathfinding
  // every accumulation tick (SEASONS_WEATHER).
  // TODO(slipped): on a high-ice tile (ice ≥ ICE_WALKABLE — frozen water especially), roll a small chance
  // here / in stepBody to apply a transient "slipped" condition that knocks the entity prone for a beat
  // (a knockdown). Later, footwear (crampons / hobnailed boots) would carry a stat that lowers that
  // chance while crossing iced tiles. Needs a new condition def + a per-cross roll gated by ice%.
  const coverMul = 1 + ((tile?.snow ?? 0) + (tile?.ice ?? 0)) / 100;
  const diagonal = from.x !== to.x && from.y !== to.y ? Math.SQRT2 : 1;
  return base * coverMul * diagonal * TICKS_PER_SECOND;
}

/**
 * Advance an entity along its current path by `budget` cost-units
 * (1 budget unit = crossing 1 tile of cost 1 per TICKS_PER_SECOND ticks).
 *
 * Returns a new entity object (immutable spread).
 * If the path is exhausted or the entity has no active path the entity is
 * returned unchanged (reference equality preserved).
 */
export function advanceAlongPath<T extends Movable>(
  entity: T,
  budget: number,
  worldMap: WorldTile[][]
): T {
  const path = entity.path;
  if (!path || path.length === 0) return entity;

  let b = budget;
  let idx = entity.pathIndex ?? 0;
  let pos = { x: entity.x, y: entity.y };
  let costLeft: number | null = entity.nextCellCostLeft ?? null;
  let invalidPath = false;

  while (b > 0 && idx < path.length) {
    const next = path[idx];
    if (!next) break;
    // Guard: path steps must be strictly adjacent (1 tile max distance).
    if (Math.abs(next.x - pos.x) > 1 || Math.abs(next.y - pos.y) > 1) {
      invalidPath = true;
      break;
    }
    if (costLeft === null) costLeft = moveCostToEnter(pos, next, worldMap);
    if (b >= costLeft) {
      b -= costLeft;
      pos = next;
      idx++;
      costLeft = null;
    } else {
      costLeft -= b;
      b = 0;
    }
  }

  if (invalidPath) {
    return { ...entity, path: [], pathIndex: 0, nextCellCostLeft: undefined };
  }

  const done = idx >= path.length;
  return {
    ...entity,
    x: pos.x,
    y: pos.y,
    path: done ? [] : path,
    pathIndex: done ? 0 : idx,
    nextCellCostLeft: costLeft ?? undefined
  };
}

/**
 * Sub-tile interpolated world position for rendering (float tile coordinates).
 *
 * Derived from `nextCellCostLeft`: how much budget the entity still needs to
 * fully enter the next cell. When the entity is not mid-step, returns the
 * integer tile position exactly.
 *
 * Feed this as the lerp target in the renderer each animation frame.
 */
export function simTarget<T extends Movable>(
  entity: T,
  worldMap: WorldTile[][]
): { x: number; y: number } {
  const path = entity.path;
  if (!path || path.length === 0) return { x: entity.x, y: entity.y };

  const next = path[entity.pathIndex ?? 0];
  if (!next || (next.x === entity.x && next.y === entity.y)) {
    return { x: entity.x, y: entity.y };
  }

  const dx = next.x - entity.x;
  const dy = next.y - entity.y;
  const totalCost = moveCostToEnter({ x: entity.x, y: entity.y }, next, worldMap);
  const costLeft = entity.nextCellCostLeft ?? totalCost;
  const progress = Math.min(1, Math.max(0, 1 - costLeft / totalCost));
  return { x: entity.x + dx * progress, y: entity.y + dy * progress };
}

// ── Shared per-tick move pass (pawns + mobs) ──────────────────────────────────

/**
 * Pre-seed the claim set with the target tiles of bodies already mid-crossing. A mid-crosser
 * committed to entering that tile on a prior tick and owns it, so a fresh mover can't claim it
 * this tick (no two bodies converging on one tile). Call once per pass before {@link stepBody}.
 */
export function seedMidCrossClaims<T extends MovableBody>(
  bodies: T[],
  claimed: Set<string>,
  isActive: (b: T) => boolean
): void {
  for (const b of bodies) {
    if (!isActive(b) || !b.path?.length || b.nextCellCostLeft == null) continue;
    const t = b.path[b.pathIndex ?? 0];
    if (t) claimed.add(`${t.x},${t.y}`);
  }
}

/**
 * Advance ONE body one tick along its path under the shared movement rules, so pawns and mobs
 * can't diverge (they used to — the hunt-yoyo regression and the duplicated hold logic; see MOVE-1):
 *   • HOLD when the next tile is occupied by another body, or already claimed by a fresh mover this
 *     tick — one body per tile, no phasing, no convergence;
 *   • after MAX_BLOCKED_TICKS held, DROP the path (status `dropped`) so the caller's FSM re-routes
 *     around the obstruction next tick — the deadlock breaker;
 *   • otherwise spend `speed` budget via advanceAlongPath, which preserves mid-crossing progress.
 *
 * `occupancy` = every body's start-of-tick tile (build once per pass). `claimed` is MUTATED: a fresh
 * mover adds its target; pre-seed it with {@link seedMidCrossClaims}. The body's own tile is never a
 * blocker. `targetByTile` (optional) maps each moving body's current tile → the tile it intends to
 * enter, enabling the head-on swap break (see below). Callers map any type-specific fields (pawn
 * isMoving/hasReachedDestination) from the result.
 */
export function stepBody<T extends MovableBody>(
  body: T,
  occupancy: Set<string>,
  claimed: Set<string>,
  worldMap: WorldTile[][],
  speed: number,
  targetByTile?: Map<string, { id: string; target: string }>
): StepResult<T> {
  const target = body.path?.[body.pathIndex ?? 0];
  if (!body.path || body.path.length === 0 || !target) {
    return { body, status: 'idle', done: false };
  }
  const targetKey = `${target.x},${target.y}`;
  const selfKey = `${body.x},${body.y}`;
  const midCrossing = body.nextCellCostLeft != null;
  const occupiedByOther = occupancy.has(targetKey) && targetKey !== selfKey;
  const blocked = occupiedByOther || (!midCrossing && claimed.has(targetKey));

  if (blocked) {
    // Head-on swap deadlock: the body sitting on our target tile is itself trying to step onto OUR
    // tile. Waiting is provably futile (it's waiting on us too), so don't burn the full
    // MAX_BLOCKED_TICKS patience — break it NOW. A deterministic id tiebreak drops exactly ONE of the
    // pair (the higher id) so its FSM re-routes next tick while the other proceeds; dropping both
    // would let them re-route symmetrically and re-collide on the next approach.
    if (occupiedByOther && targetByTile) {
      const blocker = targetByTile.get(targetKey);
      if (blocker && blocker.target === selfKey && body.id > blocker.id) {
        return {
          body: { ...body, path: [], pathIndex: 0, nextCellCostLeft: undefined, blockedTicks: 0 },
          status: 'dropped',
          done: false
        };
      }
    }
    const bt = (body.blockedTicks ?? 0) + 1;
    if (bt > MAX_BLOCKED_TICKS) {
      return {
        body: { ...body, path: [], pathIndex: 0, nextCellCostLeft: undefined, blockedTicks: 0 },
        status: 'dropped',
        done: false
      };
    }
    return { body: { ...body, blockedTicks: bt }, status: 'held', done: false };
  }

  if (!midCrossing) claimed.add(targetKey);
  const moved = advanceAlongPath(body, Math.max(0.01, speed), worldMap);
  const done = !moved.path || moved.path.length === 0;
  // Only clear the deadlock counter on REAL progress (a tile actually entered). Clearing it on every
  // non-blocked tick let an intermittently-blocked mob — e.g. a dense pack where each member's target
  // tile flickers occupied/free as packmates jostle — reset `blockedTicks` to 0 before it ever reached
  // MAX_BLOCKED_TICKS, so the drop-and-reroute breaker NEVER fired and the mob sat on a stale path
  // forever (frozen-in-Wander gridlock). A legit slow mob accumulating cost on a free tile never
  // entered the blocked branch, so its counter stays 0 regardless — this only affects the gridlock case.
  const progressed = moved.x !== body.x || moved.y !== body.y;
  const out = body.blockedTicks && progressed ? { ...moved, blockedTicks: 0 } : moved;
  return { body: out, status: 'moved', done };
}
