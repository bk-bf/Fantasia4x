import { describe, it, expect } from 'vitest';
import { inStartingBubble } from '$lib/game/services/entity/entitySpawning';
import {
  STARTING_BUBBLE_RADIUS,
  STARTING_BUBBLE_TURNS
} from '$lib/game/services/entity/entityConstants';
import type { GameState } from '$lib/game/core/types';

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

  it('follows the actual pawn position, not the map centre (off-centre colony)', () => {
    // Mountainous-map case: the colony lands far from centre. The bubble must hug the pawn, leaving
    // the (now empty) centre clear and the area around the pawn protected.
    const px = 12;
    const py = 12;
    const state = {
      ...stateAt(0),
      pawns: [{ position: { x: px, y: py } }]
    } as unknown as GameState;
    expect(inStartingBubble(state, px, py)).toBe(true);
    expect(inStartingBubble(state, px + (STARTING_BUBBLE_RADIUS - 1), py)).toBe(true);
    expect(inStartingBubble(state, px + STARTING_BUBBLE_RADIUS + 2, py)).toBe(false);
    // The map centre is now outside the bubble (pawn is off-centre).
    expect(inStartingBubble(state, CX, CY)).toBe(false);
  });
});
