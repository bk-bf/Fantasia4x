import { describe, it, expect } from 'vitest';
import type { Pawn } from '$lib/game/core/types';
import {
  shouldRollBreakdown,
  breakdownChance,
  rollBreakdown,
  pickBreakdownKind,
  BREAKDOWN_MOOD_TIER1,
  BREAKDOWN_MOOD_TIER2,
  BREAKDOWN_MOOD_TIER3
} from '$lib/game/systems/pawn/handlers/breakdown';
import { moodEffect } from '$lib/game/core/moodEffects';
import { FSM_STATE_BY_CONDITION, getConditionDefById } from '$lib/game/core/needs';
import { TICKS_PER_GAME_HOUR } from '$lib/game/services/EnvironmentService';

/**
 * MOOD — mental breakdown. A pawn ground down past a mood breakpoint faces a periodic moral check
 * against its mental resistance; a failed check drops it into an uncontrollable state that recovers
 * with catharsis. These lock the pure onset logic (deterministic, no rng consumption) + the data wiring.
 */
function pawn(mood: number, id = 'p1', debugId = 0): Pawn {
  return { id, debugId, state: { mood } } as unknown as Pawn;
}

describe('breakdown onset', () => {
  it('a content pawn never rolls (mood above tier 1 is the early-out)', () => {
    // Even on a check tick, a happy pawn is skipped.
    expect(shouldRollBreakdown(pawn(50), TICKS_PER_GAME_HOUR)).toBe(false);
    expect(shouldRollBreakdown(pawn(BREAKDOWN_MOOD_TIER1 + 1), TICKS_PER_GAME_HOUR)).toBe(false);
  });

  it('a miserable pawn rolls once per in-game hour (offset by debugId), not every tick', () => {
    const miserable = pawn(BREAKDOWN_MOOD_TIER1);
    expect(shouldRollBreakdown(miserable, TICKS_PER_GAME_HOUR)).toBe(true); // on the hour
    expect(shouldRollBreakdown(miserable, TICKS_PER_GAME_HOUR + 1)).toBe(false); // one tick later
  });

  it('the break chance rises with the tier and swings on mental resistance', () => {
    // Deeper misery → higher base chance.
    const c1 = breakdownChance(BREAKDOWN_MOOD_TIER1, 0);
    const c2 = breakdownChance(BREAKDOWN_MOOD_TIER2, 0);
    const c3 = breakdownChance(BREAKDOWN_MOOD_TIER3, 0);
    expect(c1).toBeLessThan(c2);
    expect(c2).toBeLessThan(c3);
    // Resistance lowers it; a negative resistance (low INT) raises it. Both stay clamped ≥ 0.
    expect(breakdownChance(BREAKDOWN_MOOD_TIER3, 0.15)).toBeLessThan(c3);
    expect(breakdownChance(BREAKDOWN_MOOD_TIER3, -0.15)).toBeGreaterThan(c3);
    expect(breakdownChance(BREAKDOWN_MOOD_TIER3, 5)).toBe(0); // huge resistance → never
  });

  it('rollBreakdown is deterministic and gated by the chance (no rng consumed)', () => {
    const p = pawn(BREAKDOWN_MOOD_TIER3);
    expect(rollBreakdown(p, 750, 0)).toBeNull(); // chance 0 → survives
    const broke = rollBreakdown(p, 750, 1); // chance 1 → always breaks
    expect(broke).not.toBeNull();
    expect(broke!.hours).toBeGreaterThanOrEqual(3);
    expect(broke!.hours).toBeLessThanOrEqual(8);
    // Same (pawn, turn) → same outcome, replay-safe.
    expect(rollBreakdown(p, 750, 1)!.hours).toBe(broke!.hours);
  });

  it('flavour is combat-aware: fleeing only appears with a threat, never without', () => {
    let sawFleeWithThreat = false;
    for (let turn = 0; turn < 200; turn++) {
      expect(pickBreakdownKind('p1', turn, false)).not.toBe('fleeing'); // nothing to flee
      if (pickBreakdownKind('p1', turn, true) === 'fleeing') sawFleeWithThreat = true;
    }
    expect(sawFleeWithThreat).toBe(true); // and it's the common outcome under threat
  });
});

describe('breakdown data wiring', () => {
  it('mental_breakdown forces the Breakdown state and refuses control (fsmState + incapacitated)', () => {
    expect(FSM_STATE_BY_CONDITION['mental_breakdown']).toBe('Breakdown');
    const def = getConditionDefById('mental_breakdown');
    expect(def?.flags).toContain('incapacitated');
  });

  it('catharsis is a defined mood effect (the loop-breaker on recovery)', () => {
    const cath = moodEffect('mood_catharsis');
    expect(cath).toBeDefined();
    expect(cath!.value).toBeGreaterThan(0);
  });
});
