import { describe, it, expect, afterEach } from 'vitest';
import { CREATURES } from '$lib/game/core/defs/creatures';
import { occupancyService } from '$lib/game/services/OccupancyService';
import {
  findNearestPrey,
  mobById,
  indexStep,
  dropStepIndex
} from '$lib/game/services/entity/entityHelpers';
import type { GameState, Mob, WorldTile } from '$lib/game/core/types';

afterEach(() => dropStepIndex());

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const prey = CREATURES.filter((c) => c.huntable && !c.predator).map((c) => c.id);
const hunters = CREATURES.filter((c) => c.predator).map((c) => c.id);
const STATES = ['Wander', 'Hunting', 'Sleeping', 'Corpse', 'Tamed', 'Attacking'] as const;

function world(seed: number, side: number, mobCount: number): GameState {
  const r = lcg(seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const worldMap = Array.from({ length: side }, (_, y) =>
    Array.from({ length: side }, (_, x) => ({ x, y, walkable: r() > 0.15, movementCost: 1 }))
  ) as unknown as WorldTile[][];
  const mobs = Array.from({ length: mobCount }, (_, i) => ({
    id: `m${i % Math.max(1, mobCount - 3)}`,
    creatureId: r() < 0.3 ? pick(hunters) : pick(prey),
    state: pick(STATES),
    intactness: r() < 0.2 ? 0 : 1,
    x: Math.floor(r() * side),
    y: Math.floor(r() * side)
  })) as unknown as Mob[];
  const pawns = Array.from({ length: 6 }, (_, i) => ({
    id: i === 5 ? 'm0' : `p${i}`,
    position: i === 4 ? undefined : { x: Math.floor(r() * side), y: Math.floor(r() * side) }
  }));
  return { worldMap, mobs, pawns } as unknown as GameState;
}

function answers(state: GameState, side: number, withPrey = true): unknown[] {
  const mobs = state.mobs!;
  const out: unknown[] = [];
  for (const m of mobs) {
    if (withPrey) {
      out.push(findNearestPrey(m, mobs, true, state.worldMap)?.id ?? null);
      out.push(findNearestPrey(m, mobs, false, state.worldMap)?.id ?? null);
    }
    out.push(mobById(mobs, m.id) ?? null);
  }
  out.push(mobById(mobs, 'nobody') ?? null);
  const excludes = [undefined, 'm0', 'm1', 'p0', 'p3'];
  for (let y = -1; y <= side; y++)
    for (let x = -1; x <= side; x++)
      for (const ex of excludes) out.push(occupancyService.isBlocked(state, x, y, ex));
  return out;
}

describe('the per-step indexes answer as the scans do', () => {
  it('on crowded random worlds, duplicate ids, corpses and pawns without a position included', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const side = 12 + (seed % 5) * 6;
      const state = world(seed, side, 40 + seed * 12);
      const scanned = answers(state, side);
      indexStep(state);
      const indexed = answers(state, side);
      dropStepIndex();
      expect(indexed).toEqual(scanned);
    }
  });

  it('falls back to the scan for a state whose arrays it was not built from', () => {
    const state = world(3, 20, 80);
    indexStep(state);
    const moved = { ...state, mobs: state.mobs!.map((m) => ({ ...m, x: 0, y: 0 })) };
    const live = moved.mobs.find((m) => m.state !== 'Corpse')!;
    expect(occupancyService.isBlocked(moved, 0, 0)).toBe(true);
    expect(mobById(moved.mobs, live.id)).toBe(live);
  });

  it('answers as the scan does when a body stands between tiles or off the grid', () => {
    const state = world(4, 20, 60);
    const mobs = state.mobs!;
    for (const [x, y] of [
      [2.5, 3],
      [25, 3],
      [-1, 0]
    ]) {
      const off = {
        ...state,
        mobs: [...mobs, { ...mobs[0], id: 'far', state: 'Wander', x, y }]
      } as GameState;
      const scanned = answers(off, 20, false);
      indexStep(off);
      expect(answers(off, 20, false)).toEqual(scanned);
      dropStepIndex();
    }
  });
});
