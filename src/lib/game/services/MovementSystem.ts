import type { WorldTile } from '../core/types';
import { TICKS_PER_SECOND, ticksFromSeconds } from '../core/util/time';

export interface Movable {
  x: number;
  y: number;
  path?: { x: number; y: number }[];
  pathIndex?: number;
  nextCellCostLeft?: number;
}

export interface MovableBody extends Movable {
  id: string;
  blockedTicks?: number;
}

export const MAX_BLOCKED_TICKS = ticksFromSeconds(1.5);

export type StepStatus = 'idle' | 'held' | 'dropped' | 'moved';

export interface StepResult<T extends MovableBody> {
  body: T;
  status: StepStatus;
  done: boolean;
}

export function moveCostToEnter(
  from: { x: number; y: number },
  to: { x: number; y: number },
  worldMap: WorldTile[][]
): number {
  const tile = worldMap[to.y]?.[to.x];
  let base = tile && tile.movementCost > 0 ? tile.movementCost : 1;
  if (tile?.floor) base *= tile.floor.speed;
  const coverMul = 1 + ((tile?.snow ?? 0) + (tile?.ice ?? 0)) / 100;
  const diagonal = from.x !== to.x && from.y !== to.y ? Math.SQRT2 : 1;
  return base * coverMul * diagonal * TICKS_PER_SECOND;
}

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
  const progressed = moved.x !== body.x || moved.y !== body.y;
  const out = body.blockedTicks && progressed ? { ...moved, blockedTicks: 0 } : moved;
  return { body: out, status: 'moved', done };
}
