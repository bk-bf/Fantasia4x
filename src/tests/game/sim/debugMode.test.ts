import { describe, it, expect } from 'vitest';
import { applySimCommand } from '$lib/game/sim/commands';
import { buildScenario } from '$lib/game/headless/Scenario';

describe('setDebugMode command', () => {
  it('sets debugMode on game state when turned on', () => {
    const state = buildScenario({ seed: 1, pawns: [] });
    expect(state.debugMode).toBeUndefined();

    const on = applySimCommand(state, { type: 'setDebugMode', payload: { on: true } });
    expect(on.debugMode).toBe(true);
  });

  it('clears debugMode on game state when turned off', () => {
    const state = buildScenario({ seed: 1, pawns: [] });
    const on = applySimCommand(state, { type: 'setDebugMode', payload: { on: true } });
    const off = applySimCommand(on, { type: 'setDebugMode', payload: { on: false } });
    expect(off.debugMode).toBeUndefined();
  });
});
