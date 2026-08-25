import { describe, it, expect } from 'vitest';
import {
  applyConditionDriver,
  transientNeedOnset,
  TIRED_FATIGUE_THRESHOLD
} from '$lib/game/core/rules/body/conditions';
import { TICKS_PER_SECOND } from '$lib/game/core/util/time';
import conditionsData from '$lib/game/database/pawns/conditions.jsonc';
import type { ConditionDef, EntityCondition } from '$lib/game/core/types';

const ALL = conditionsData as unknown as ConditionDef[];
const dehydration = ALL.find((d) => d.id === 'dehydration')!;
const ONE_DAY_SECONDS = 300;

describe('§needs condition onset delay', () => {
  it('dehydration is configured with a one-day onset delay', () => {
    expect(dehydration.driver?.onsetDelay).toBe(ONE_DAY_SECONDS);
  });

  it('the `tired` exhaustion threshold is driven by the condition data (needOnset)', () => {
    const onset = transientNeedOnset('tired');
    expect(onset).toEqual({ need: 'fatigue', atOrAbove: 100 });
    expect(TIRED_FATIGUE_THRESHOLD).toBe(onset!.atOrAbove);
  });

  it('a maxed need stays sub-zero (hidden) through the delay, then crosses 0 ~a day in', () => {
    const conditions: EntityCondition[] = [];
    const tickAtMax = () => applyConditionDriver(conditions, dehydration, 100);

    const halfDayTicks = (ONE_DAY_SECONDS / 2) * TICKS_PER_SECOND;
    for (let t = 0; t < halfDayTicks; t++) tickAtMax();
    expect(conditions[0].severity).toBeLessThan(0);

    const restOfDayPlus = (ONE_DAY_SECONDS / 2 + 5) * TICKS_PER_SECOND;
    for (let t = 0; t < restOfDayPlus; t++) tickAtMax();
    expect(conditions[0].severity).toBeGreaterThan(0);
  });

  it('the need dropping below safe during the delay removes the still-pending condition', () => {
    const conditions: EntityCondition[] = [];
    for (let t = 0; t < 60; t++) applyConditionDriver(conditions, dehydration, 100);
    expect(conditions[0].severity).toBeLessThan(0);
    applyConditionDriver(conditions, dehydration, 0);
    expect(conditions.find((c) => c.id === 'dehydration')).toBeUndefined();
  });
});
