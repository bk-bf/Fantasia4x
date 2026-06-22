import { describe, it, expect } from 'vitest';
import { applyConditionDriver, transientNeedOnset, TIRED_FATIGUE_THRESHOLD } from './needs';
import { TICKS_PER_SECOND } from './time';
import conditionsData from '$lib/game/database/conditions.jsonc';
import type { ConditionDef, EntityCondition } from './types';

// Dehydration/malnutrition must only BEGIN after ~a day of a maxed need — driver.onsetDelay seeds a
// negative severity that climbs to 0 over the window, so the condition stays hidden (severity ≤ 0
// matches no stage) until it surfaces. Regression for "the condition hits too fast".

const ALL = conditionsData as unknown as ConditionDef[];
const dehydration = ALL.find((d) => d.id === 'dehydration')!;
const ONE_DAY_SECONDS = 300; // TURNS_PER_DAY

describe('§needs condition onset delay', () => {
  it('dehydration is configured with a one-day onset delay', () => {
    expect(dehydration.driver?.onsetDelay).toBe(ONE_DAY_SECONDS);
  });

  // The `tired` debuff threshold is DATA (conditions.jsonc `needOnset`), not a hardcoded constant — the
  // shared TIRED_FATIGUE_THRESHOLD must be sourced from it (so it can't silently fall back to a default).
  it('the `tired` exhaustion threshold is driven by the condition data (needOnset)', () => {
    const onset = transientNeedOnset('tired');
    expect(onset).toEqual({ need: 'fatigue', atOrAbove: 100 });
    expect(TIRED_FATIGUE_THRESHOLD).toBe(onset!.atOrAbove); // derived from the JSON, not the fallback
  });

  it('a maxed need stays sub-zero (hidden) through the delay, then crosses 0 ~a day in', () => {
    const conditions: EntityCondition[] = [];
    const tickAtMax = () => applyConditionDriver(conditions, dehydration, 100);

    // Halfway through the onset window the condition exists but is still negative → invisible.
    const halfDayTicks = (ONE_DAY_SECONDS / 2) * TICKS_PER_SECOND;
    for (let t = 0; t < halfDayTicks; t++) tickAtMax();
    expect(conditions[0].severity).toBeLessThan(0);

    // By a little past a full day at 100% it has surfaced (severity > 0 → the "thirsty" stage begins).
    const restOfDayPlus = (ONE_DAY_SECONDS / 2 + 5) * TICKS_PER_SECOND;
    for (let t = 0; t < restOfDayPlus; t++) tickAtMax();
    expect(conditions[0].severity).toBeGreaterThan(0);
  });

  it('the need dropping below safe during the delay removes the still-pending condition', () => {
    const conditions: EntityCondition[] = [];
    for (let t = 0; t < 60; t++) applyConditionDriver(conditions, dehydration, 100); // start the delay
    expect(conditions[0].severity).toBeLessThan(0);
    applyConditionDriver(conditions, dehydration, 0); // drank water — recovers and clears
    expect(conditions.find((c) => c.id === 'dehydration')).toBeUndefined();
  });
});
