import { describe, it, expect } from 'vitest';
import { isThinkTick, liveRegion, mobInLiveRegion } from '$lib/game/services/entity/entityHelpers';
import { AI_THROTTLE_TICKS } from '$lib/game/services/entity/entityConstants';
import { SeededRng } from '$lib/game/core/util/rng';
import type { Pawn } from '$lib/game/core/types';

function thinkTurns(id: string, from: number, to: number): number[] {
  const out: number[] = [];
  for (let t = from; t < to; t++) if (isThinkTick(id, t)) out.push(t);
  return out;
}

describe('isThinkTick — throttled mobs think once per window', () => {
  it('gives each id exactly one think tick per window, at the same phase every window', () => {
    for (const id of ['mob-boar-6000-5a1', 'mob-wolf-12-0', 'x']) {
      const first = thinkTurns(id, 0, AI_THROTTLE_TICKS);
      expect(first).toHaveLength(1);
      const later = thinkTurns(id, 10 * AI_THROTTLE_TICKS, 11 * AI_THROTTLE_TICKS);
      expect(later).toEqual([first[0] + 10 * AI_THROTTLE_TICKS]);
    }
  });

  it('spreads different ids across the window', () => {
    const phases = new Set<number>();
    for (let i = 0; i < 300; i++) phases.add(thinkTurns(`mob-deer-${i}`, 0, AI_THROTTLE_TICKS)[0]);
    expect(phases.size).toBeGreaterThan(AI_THROTTLE_TICKS / 2);
  });

  it('keeps every id on its phase while far more ids pass through than it remembers', () => {
    const before = thinkTurns('mob-elk-7', 0, AI_THROTTLE_TICKS);
    for (let i = 0; i < 20_000; i++) isThinkTick(`mob-churn-${i}`, i);
    expect(thinkTurns('mob-elk-7', 0, AI_THROTTLE_TICKS)).toEqual(before);
  });
});

function pawnAt(x: number, y: number): Pawn {
  return { id: `p-${x}-${y}`, position: { x, y } } as unknown as Pawn;
}

function naiveInRegion(mob: { x: number; y: number }, pawns: Pawn[], radius: number): boolean {
  return pawns.some(
    (p) =>
      !!p.position &&
      Math.abs(p.position.x - mob.x) <= radius &&
      Math.abs(p.position.y - mob.y) <= radius
  );
}

describe('mobInLiveRegion — the live bubble around the colony', () => {
  it('is true within the radius of any pawn on both axes, and false just past it', () => {
    const region = liveRegion([pawnAt(10, 10), pawnAt(60, 10)], 5);
    expect(mobInLiveRegion({ x: 15, y: 5 }, region)).toBe(true);
    expect(mobInLiveRegion({ x: 16, y: 10 }, region)).toBe(false);
    expect(mobInLiveRegion({ x: 35, y: 10 }, region)).toBe(false);
    expect(mobInLiveRegion({ x: 55, y: 15 }, region)).toBe(true);
  });

  it('is false for every mob when no pawn has a position', () => {
    const region = liveRegion([{ id: 'p' } as unknown as Pawn], 34);
    expect(mobInLiveRegion({ x: 0, y: 0 }, region)).toBe(false);
    expect(mobInLiveRegion({ x: 0, y: 0 }, liveRegion([], 34))).toBe(false);
  });

  it('agrees with a per-pawn check for scattered pawns and mobs', () => {
    const rng = new SeededRng(7);
    for (let round = 0; round < 20; round++) {
      const pawns = Array.from({ length: 1 + Math.floor(rng.random() * 6) }, () =>
        pawnAt(Math.floor(rng.random() * 200), Math.floor(rng.random() * 200))
      );
      const radius = Math.floor(rng.random() * 40);
      const region = liveRegion(pawns, radius);
      for (let i = 0; i < 200; i++) {
        const mob = {
          x: Math.floor(rng.random() * 260) - 30,
          y: Math.floor(rng.random() * 260) - 30
        };
        expect(mobInLiveRegion(mob, region)).toBe(naiveInRegion(mob, pawns, radius));
      }
    }
  });
});
