import type { WorldTile } from '../core/types';
import { TICKS_PER_SECOND, ticksFromSeconds } from '../core/util/time';
import { tileKey } from '../core/util/tileKey';

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
  if (!entity.path || entity.path.length === 0) return entity;
  return advanceInPlace({ ...entity }, budget, worldMap);
}

function advanceInPlace<T extends Movable>(entity: T, budget: number, worldMap: WorldTile[][]): T {
  const path = entity.path!;
  let b = budget;
  let idx = entity.pathIndex ?? 0;
  let pos = { x: entity.x, y: entity.y };
  let costLeft: number | null = entity.nextCellCostLeft ?? null;

  while (b > 0 && idx < path.length) {
    const next = path[idx];
    if (!next) break;
    if (Math.abs(next.x - pos.x) > 1 || Math.abs(next.y - pos.y) > 1) {
      entity.path = [];
      entity.pathIndex = 0;
      entity.nextCellCostLeft = undefined;
      return entity;
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

  const done = idx >= path.length;
  entity.x = pos.x;
  entity.y = pos.y;
  entity.path = done ? [] : path;
  entity.pathIndex = done ? 0 : idx;
  entity.nextCellCostLeft = costLeft ?? undefined;
  return entity;
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
  claimed: Set<number>,
  width: number,
  isActive: (b: T) => boolean
): void {
  for (const b of bodies) {
    if (!isActive(b) || !b.path?.length || b.nextCellCostLeft == null) continue;
    const t = b.path[b.pathIndex ?? 0];
    if (t) claimed.add(tileKey(t.x, t.y, width));
  }
}

export function stepBody<T extends MovableBody>(
  body: T,
  occupancy: Set<number>,
  claimed: Set<number>,
  worldMap: WorldTile[][],
  speed: number,
  targetByTile?: Map<number, { id: string; target: number }>
): StepResult<T> {
  const target = body.path?.[body.pathIndex ?? 0];
  if (!body.path || body.path.length === 0 || !target) {
    return { body, status: 'idle', done: false };
  }
  const width = worldMap[0]?.length ?? 0;
  const targetKey = tileKey(target.x, target.y, width);
  const selfKey = tileKey(body.x, body.y, width);
  const midCrossing = body.nextCellCostLeft != null;
  const occupiedByOther = occupancy.has(targetKey) && targetKey !== selfKey;
  const blocked = occupiedByOther || (!midCrossing && claimed.has(targetKey));

  if (blocked) {
    if (occupiedByOther && targetByTile) {
      const blocker = targetByTile.get(targetKey);
      if (blocker && blocker.target === selfKey && body.id > blocker.id) {
        return { body: dropPath(body), status: 'dropped', done: false };
      }
    }
    const bt = (body.blockedTicks ?? 0) + 1;
    if (bt > MAX_BLOCKED_TICKS) return { body: dropPath(body), status: 'dropped', done: false };
    body.blockedTicks = bt;
    return { body, status: 'held', done: false };
  }

  if (!midCrossing) claimed.add(targetKey);
  const fromX = body.x;
  const fromY = body.y;
  advanceInPlace(body, Math.max(0.01, speed), worldMap);
  const done = !body.path || body.path.length === 0;
  if (body.blockedTicks && (body.x !== fromX || body.y !== fromY)) body.blockedTicks = 0;
  return { body, status: 'moved', done };
}

function dropPath<T extends MovableBody>(body: T): T {
  body.path = [];
  body.pathIndex = 0;
  body.nextCellCostLeft = undefined;
  body.blockedTicks = 0;
  return body;
}
