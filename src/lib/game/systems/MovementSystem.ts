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
import { TICKS_PER_SECOND } from '../core/time';

// ── Shared interface ──────────────────────────────────────────────────────────

/** Minimum interface for movement advancement and sim-target rendering. */
export interface Movable {
  x: number;
  y: number;
  path?: { x: number; y: number }[];
  pathIndex?: number;
  nextCellCostLeft?: number;
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
  const base = tile && tile.movementCost > 0 ? tile.movementCost : 1;
  const diagonal = from.x !== to.x && from.y !== to.y ? Math.SQRT2 : 1;
  return base * diagonal * TICKS_PER_SECOND;
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
