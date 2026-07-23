import { describe, it, expect } from 'vitest';
import { pawnService } from '$lib/game/services/PawnService';
import type { GameState, Pawn, PlacedBuilding } from '$lib/game/core/types';

/**
 * MOOD-REWORK — getMoodBreakdown surfaces the pawn's CURRENT (eased) mood, the TARGET it eases toward,
 * and the itemised signed contributions behind that target. These lock the sign of each contribution
 * and that `target` = clamp(50 + Σ contributions) — the single source of truth mood moves toward.
 */
function pawn(
  needs: Partial<Pawn['needs']> = {},
  state: Partial<Pawn['state']> = {},
  extra: Partial<Pawn> = {}
): Pawn {
  return {
    id: 'p1',
    name: 'Tester',
    isAlive: true,
    drafted: false,
    position: { x: 0, y: 0 },
    needs: {
      hunger: 10,
      fatigue: 10,
      thirst: 10,
      hygiene: 10,
      sleep: 0,
      lastSleep: 0,
      lastMeal: 0,
      ...needs
    },
    state: {
      health: 100,
      mood: 50,
      isWorking: false,
      isSleeping: false,
      isEating: false,
      ...state
    },
    conditions: [],
    transientConditions: [],
    traits: [],
    ...extra
  } as unknown as Pawn;
}

function makeState(p: Pawn, buildings: PlacedBuilding[] = [], turn = 0): GameState {
  return { seed: 1, turn, pawns: [p], buildings, weather: undefined } as unknown as GameState;
}

const sum = (cs: { value: number }[]) => cs.reduce((s, c) => s + c.value, 0);

describe('MOOD-REWORK getMoodBreakdown', () => {
  it('a contented pawn (low needs) has no debuff contributions and a target at/above baseline', () => {
    const p = pawn();
    const out = pawnService.getMoodBreakdown(p, makeState(p));
    expect(out.contributions.every((c) => c.value >= 0)).toBe(true);
    expect(out.mood).toBe(50); // the eased value (state.mood)
    expect(out.target).toBeGreaterThanOrEqual(50);
  });

  it('target equals clamp(50 + Σ contributions)', () => {
    const p = pawn({ thirst: 95, hygiene: 90 });
    const out = pawnService.getMoodBreakdown(p, makeState(p));
    expect(out.target).toBe(Math.max(0, Math.min(100, Math.round(50 + sum(out.contributions)))));
    // Parched (-10) and Filthy (-4) both fire.
    expect(out.contributions.find((c) => c.label === 'Parched')?.value).toBe(-10);
    expect(out.contributions.find((c) => c.label === 'Filthy')?.value).toBe(-4);
  });

  it('a starving pawn gets a negative "Starving" contribution and a target below baseline', () => {
    const p = pawn({ hunger: 95 });
    const out = pawnService.getMoodBreakdown(p, makeState(p));
    expect(out.contributions.find((c) => c.label === 'Starving')?.value).toBe(-12);
    expect(out.target).toBeLessThan(50);
  });

  // Ambient mood comes from BEAUTY only. A bear rug is handsome (beauty 0.4), so being near it lifts mood.
  it('pleasant surroundings (nearby beautiful furniture) add a positive contribution', () => {
    const rug = {
      id: 'r1',
      type: 'bear_rug',
      x: 0,
      y: 0,
      status: 'complete',
      progress: 1
    } as PlacedBuilding;
    const p = pawn();
    const out = pawnService.getMoodBreakdown(p, makeState(p, [rug]));
    const pleasant = out.contributions.find((c) => c.label === 'Pleasant surroundings');
    expect(pleasant).toBeDefined();
    expect(pleasant!.value).toBeGreaterThan(0);
  });

  // COMFORT IS NOT AMBIENT: a couch is comfort-only (0.7) with no beauty, so merely STANDING near it
  // must not lift mood — a pawn earns comfort by sitting in it (handleLounging), not by walking past.
  it('a comfort-only piece (couch) gives no ambient lift — comfort is never ambient', () => {
    const couch = {
      id: 'c1',
      type: 'couch',
      x: 0,
      y: 0,
      status: 'complete',
      progress: 1
    } as PlacedBuilding;
    const p = pawn();
    const out = pawnService.getMoodBreakdown(p, makeState(p, [couch]));
    const pleasant = out.contributions.find((c) => c.label === 'Pleasant surroundings');
    expect(pleasant?.value ?? 0).toBe(0);
  });

  it('a full moon lifts mood — unless the pawn is sheltered (negatedBy)', () => {
    const D = 300 * 60; // ticks per in-game day
    const fullMoonNight = 15 * D + Math.round(0.95 * D); // day 15 (full moon), deep night
    const outdoor = pawnService.getMoodBreakdown(pawn(), makeState(pawn(), [], fullMoonNight));
    expect(outdoor.contributions.find((c) => c.label === 'A full moon')?.value).toBe(5);
    // Sheltered under a roof → the moon isn't visible, so the effect is negated.
    const sheltered = pawn({}, {}, { transientConditions: ['sheltered'] });
    const out = pawnService.getMoodBreakdown(sheltered, makeState(sheltered, [], fullMoonNight));
    expect(out.contributions.find((c) => c.label === 'A full moon')).toBeUndefined();
  });

  it('an event "thought" feeds the target and FADES to zero over its life', () => {
    const p = pawn(
      {},
      {},
      {
        moodModifiers: [
          { id: 'grief:x', label: 'Grieving', value: -12, expiresAt: 200, startedAt: 0 }
        ]
      }
    );
    // full weight at the moment it lands
    const atStart = pawnService.getMoodBreakdown(p, makeState(p, [], 0));
    expect(atStart.contributions.find((c) => c.label === 'Grieving')?.value).toBe(-12);
    // ~half faded halfway through its life
    const atHalf = pawnService.getMoodBreakdown(p, makeState(p, [], 100));
    expect(atHalf.contributions.find((c) => c.label === 'Grieving')?.value).toBeCloseTo(-6, 5);
    // gone once expired
    const afterExpiry = pawnService.getMoodBreakdown(p, makeState(p, [], 200));
    expect(afterExpiry.contributions.find((c) => c.label === 'Grieving')).toBeUndefined();
  });
});
