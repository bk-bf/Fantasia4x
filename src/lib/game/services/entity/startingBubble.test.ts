import { describe, it, expect } from 'vitest';
import { inStartingBubble } from './entitySpawning';
import { STARTING_BUBBLE_RADIUS, STARTING_BUBBLE_TURNS } from './entityConstants';
import type { GameState } from '../../core/types';

// A bare 100×100 world (centre = 50,50) at the given turn — only the fields inStartingBubble reads.
function stateAt(turn: number): GameState {
  const row = new Array(100).fill(null);
  const worldMap = new Array(100).fill(null).map(() => row.slice());
  return { turn, worldMap } as unknown as GameState;
}

describe('lair starting bubble', () => {
  const CX = 50;
  const CY = 50;

  it('blocks a tile at the colony start during the first month', () => {
    expect(inStartingBubble(stateAt(0), CX, CY)).toBe(true);
  });

  it('blocks tiles inside the radius', () => {
    const inside = STARTING_BUBBLE_RADIUS - 1;
    expect(inStartingBubble(stateAt(100), CX + inside, CY)).toBe(true);
  });

  it('allows tiles beyond the radius even early', () => {
    const outside = STARTING_BUBBLE_RADIUS + 2;
    expect(inStartingBubble(stateAt(0), CX + outside, CY)).toBe(false);
  });

  it('lifts entirely once the first month has passed (even at the start tile)', () => {
    expect(inStartingBubble(stateAt(STARTING_BUBBLE_TURNS), CX, CY)).toBe(false);
    expect(inStartingBubble(stateAt(STARTING_BUBBLE_TURNS + 1), CX + 2, CY + 2)).toBe(false);
  });

  it('is a round bubble — a corner just past the radius diagonally is clear', () => {
    // (r, r) from centre is r·√2 away — outside a radius-r circle.
    const r = STARTING_BUBBLE_RADIUS;
    expect(inStartingBubble(stateAt(0), CX + r, CY + r)).toBe(false);
  });
});
