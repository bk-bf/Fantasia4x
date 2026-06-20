import { describe, it, expect } from 'vitest';
import {
  consumeTop,
  decayAll,
  mergeConditions,
  normalizeConditions,
  averageCondition,
  FRESH_CONDITION
} from './carcassCondition';
import { itemService } from '../services/ItemService';
import type { GameState } from './types';

describe('carcass condition — per-unit rules', () => {
  // ── CONSUMPTION: top unit only ──────────────────────────────────────────────
  it('consumeTop erodes only the leading unit, leaving the rest untouched', () => {
    const { conditions, removed } = consumeTop([80, 100, 100], 30);
    expect(conditions).toEqual([50, 100, 100]); // only index 0 dropped
    expect(removed).toBe(0);
  });

  it('consumeTop strips the top unit when it hits 0 and never spills into the next', () => {
    const { conditions, removed } = consumeTop([20, 90, 100], 25);
    expect(removed).toBe(1);
    expect(conditions).toEqual([90, 100]); // the 90-unit is fully intact — overflow did NOT carry
  });

  // ── ENVIRONMENT: whole stack ────────────────────────────────────────────────
  it('decayAll erodes every unit and removes those that reach 0', () => {
    const { conditions, removed } = decayAll([10, 50, 100], 10);
    expect(removed).toBe(1); // the 10-unit rots away
    expect(conditions).toEqual([40, 90]); // both survivors lost 10 — the whole stack ages
  });

  it('merge concatenates per-unit conditions (no averaging); normalize pads with FRESH', () => {
    expect(mergeConditions([40], 1, [100, 100], 2)).toEqual([40, 100, 100]);
    expect(normalizeConditions(undefined, 2)).toEqual([FRESH_CONDITION, FRESH_CONDITION]);
    expect(normalizeConditions([30], 3)).toEqual([30, FRESH_CONDITION, FRESH_CONDITION]);
    expect(Math.round(averageCondition([[40], [100, 100]]))).toBe(80);
  });
});

describe('carcass condition — environmental decay over the whole stack (stepItemDecay)', () => {
  it('erodes every unit each tick and rots a unit to decaysTo when its condition hits 0', () => {
    // rabbit_carcass: decaySeconds 300, decaysTo rotten_carcass. One near-dead unit + two fresh.
    let state = {
      turn: 0,
      droppedItems: [
        {
          id: 'c1',
          resourceId: 'rabbit_carcass',
          x: 1,
          y: 1,
          quantity: 3,
          stored: false,
          unitConditions: [1, 100, 100]
        }
      ]
    } as unknown as GameState;

    // Step enough ticks that the 1%-condition unit erodes to 0 and rots, but the fresh units survive
    // (erosion ≈ 0.0056/tick at 60 tps over the 300s clock → ~180 ticks kills the 1-unit, ~18k a fresh one).
    for (let i = 0; i < 250; i++) state = itemService.stepItemDecay(state);

    const carcass = state.droppedItems!.find((d) => d.resourceId === 'rabbit_carcass');
    expect(carcass).toBeDefined();
    expect(carcass!.quantity).toBe(2); // the near-dead unit rotted away (whole stack aged)
    expect(carcass!.unitConditions!.length).toBe(2);
    expect(carcass!.unitConditions!.every((c) => c < 100)).toBe(true); // every survivor aged too
    // The rotted unit became a rotten_carcass on the same tile.
    const rotten = state.droppedItems!.find((d) => d.resourceId === 'rotten_carcass');
    expect(rotten?.quantity).toBe(1);
  });
});
