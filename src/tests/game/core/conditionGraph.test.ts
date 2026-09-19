import { describe, it, expect } from 'vitest';
import {
  evaluatePredicate,
  fireTriggers,
  type GraphContext
} from '$lib/game/core/rules/body/conditionGraph';
import { conditionsSig } from '$lib/game/core/rules/body/conditions';
import type { ConditionTrigger } from '$lib/game/core/types/health';
import type { EntityCondition } from '$lib/game/core/types';

function ctx(over: Partial<GraphContext> = {}): GraphContext {
  return {
    needs: { wetness: 0, coldExposure: 0 },
    bloodFrac: 1,
    pain: 0,
    ambientLight: 1,
    unsheltered: false,
    fullMoon: false,
    hasCondition: () => false,
    sourceSeverity: 0,
    ...over
  };
}
const always = () => true;
const never = () => false;

describe('conditionGraph.evaluatePredicate', () => {
  it('empty predicate is always true', () => {
    expect(evaluatePredicate(undefined, ctx())).toBe(true);
    expect(evaluatePredicate({}, ctx())).toBe(true);
  });
  it('need thresholds', () => {
    const c = ctx({ needs: { wetness: 100 } });
    expect(evaluatePredicate({ need: 'wetness', atOrAbove: 100 }, c)).toBe(true);
    expect(
      evaluatePredicate({ need: 'wetness', atOrAbove: 100 }, ctx({ needs: { wetness: 99 } }))
    ).toBe(false);
  });
  it('meter thresholds (bloodFrac / pain / ambientLight)', () => {
    expect(evaluatePredicate({ meter: 'bloodFrac', atOrBelow: 0.4 }, ctx({ bloodFrac: 0.3 }))).toBe(
      true
    );
    expect(evaluatePredicate({ meter: 'bloodFrac', atOrBelow: 0.4 }, ctx({ bloodFrac: 0.5 }))).toBe(
      false
    );
    expect(evaluatePredicate({ meter: 'pain', atOrAbove: 80 }, ctx({ pain: 85 }))).toBe(true);
    expect(
      evaluatePredicate({ meter: 'ambientLight', atOrAbove: 0.95 }, ctx({ ambientLight: 0.9 }))
    ).toBe(false);
  });
  it('unsheltered + hasCondition / lacksCondition gates', () => {
    expect(evaluatePredicate({ unsheltered: true }, ctx({ unsheltered: true }))).toBe(true);
    expect(evaluatePredicate({ unsheltered: true }, ctx({ unsheltered: false }))).toBe(false);
    const wet = ctx({ hasCondition: (id) => id === 'wet' });
    expect(evaluatePredicate({ hasCondition: 'wet' }, wet)).toBe(true);
    expect(evaluatePredicate({ lacksCondition: 'wet' }, wet)).toBe(false);
    expect(evaluatePredicate({ hasCondition: 'sheltered' }, wet)).toBe(false);
  });
  it('fullMoon gate matches only the exact boolean, and severity reads sourceSeverity', () => {
    expect(evaluatePredicate({ fullMoon: true }, ctx({ fullMoon: false }))).toBe(false);
    expect(evaluatePredicate({ fullMoon: true }, ctx({ fullMoon: true }))).toBe(true);
    expect(evaluatePredicate({ fullMoon: false }, ctx({ fullMoon: true }))).toBe(false);
    expect(
      evaluatePredicate({ meter: 'severity', atOrAbove: 0.5 }, ctx({ sourceSeverity: 0.6 }))
    ).toBe(true);
    expect(
      evaluatePredicate({ meter: 'severity', atOrAbove: 0.5 }, ctx({ sourceSeverity: 0.4 }))
    ).toBe(false);
  });
});

describe('conditionGraph.fireTriggers', () => {
  const wetChill: ConditionTrigger = {
    to: 'hypothermia',
    when: { need: 'coldExposure', atOrAbove: 100 },
    chance: 0.5,
    severity: 0.05
  };
  const shockEdge: ConditionTrigger = { to: 'shock', when: { meter: 'pain', atOrAbove: 80 } };

  it('no triggers → shared empty array (no allocation)', () => {
    expect(fireTriggers(undefined, ctx(), always, false)).toHaveLength(0);
    expect(fireTriggers([], ctx(), always, false)).toBe(fireTriggers([], ctx(), always, false));
  });
  it('deterministic edge fires every eligible tick, never when ineligible', () => {
    expect(fireTriggers([shockEdge], ctx({ pain: 90 }), never, false)).toEqual([
      { to: 'shock', severity: undefined }
    ]);
    expect(fireTriggers([shockEdge], ctx({ pain: 50 }), always, false)).toHaveLength(0);
  });
  it('probabilistic edge gated by both predicate AND roll', () => {
    const eligible = ctx({ needs: { coldExposure: 100 } });
    expect(fireTriggers([wetChill], eligible, always, false)).toEqual([
      { to: 'hypothermia', severity: 0.05 }
    ]);
    expect(fireTriggers([wetChill], eligible, never, false)).toHaveLength(0);
    expect(
      fireTriggers([wetChill], ctx({ needs: { coldExposure: 50 } }), always, false)
    ).toHaveLength(0);
  });
  it('per:onset edges only fire on the onset tick', () => {
    const onsetEdge: ConditionTrigger = { to: 'panic', per: 'onset' };
    expect(fireTriggers([onsetEdge], ctx(), always, true)).toEqual([
      { to: 'panic', severity: undefined }
    ]);
    expect(fireTriggers([onsetEdge], ctx(), always, false)).toHaveLength(0);
  });
  it('two eligible triggers in one call both fire, in input order, with durationHours copied through', () => {
    const timedEdge: ConditionTrigger = {
      to: 'nausea',
      when: { meter: 'pain', atOrAbove: 10 },
      durationHours: 1.5
    };
    const out = fireTriggers([shockEdge, timedEdge], ctx({ pain: 90 }), always, false);
    expect(out).toEqual([
      { to: 'shock', severity: undefined, durationHours: undefined },
      { to: 'nausea', severity: undefined, durationHours: 1.5 }
    ]);
  });
});

describe('conditions.conditionsSig', () => {
  it('an empty list signs to the empty string', () => {
    expect(conditionsSig([])).toBe('');
  });
  it('identical id+severity lists sign equal', () => {
    const a: EntityCondition[] = [
      { id: 'wet', severity: 0.4 },
      { id: 'tired', severity: 0.9 }
    ];
    const b: EntityCondition[] = [
      { id: 'wet', severity: 0.4 },
      { id: 'tired', severity: 0.9 }
    ];
    expect(conditionsSig(a)).toBe(conditionsSig(b));
  });
  it('the same id with a different severity signs differently', () => {
    const a: EntityCondition[] = [{ id: 'wet', severity: 0.4 }];
    const b: EntityCondition[] = [{ id: 'wet', severity: 0.5 }];
    expect(conditionsSig(a)).not.toBe(conditionsSig(b));
  });
});
