import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { gameState, currentStockpile } from '$lib/stores/gameState';
import { gameEngine } from '$lib/game/systems/GameEngineImpl';
import type { GameState } from '$lib/game/core/types';

const push = (s: GameState, flush: boolean) =>
  (gameEngine as unknown as { outputSink: (s: GameState, flush: boolean) => void }).outputSink(
    s,
    flush
  );

describe('the game store fed by the engine', () => {
  it('tells subscribers only about flushed ticks', () => {
    const base = get(gameState) as GameState;
    let calls = 0;
    const stop = gameState.subscribe(() => calls++);
    calls = 0;
    push({ ...base, turn: base.turn + 1 }, false);
    expect(calls).toBe(0);
    push({ ...base, turn: base.turn + 2 }, true);
    expect(calls).toBe(1);
    stop();
  });

  it('lists a named heirloom once, without an empty row for its kind', () => {
    const base = get(gameState) as GameState;
    push(
      {
        ...base,
        droppedItems: [
          {
            id: 'heirloom',
            resourceId: 'copper_axe',
            name: 'Grandfather Axe',
            x: 1,
            y: 1,
            quantity: 1,
            stored: true
          }
        ]
      } as GameState,
      true
    );
    expect(get(currentStockpile).map((r) => [r.id, r.amount])).toEqual([['heirloom', 1]]);
  });
});
