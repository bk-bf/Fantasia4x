import { describe, it, expect } from 'vitest';
import { detectVitalEscalations, snapshotVitalStages } from './needs';
import type { EntityCondition } from './types';

/**
 * Vital-alert detector: malnutrition/dehydration raise a colony chronicle alert + bugle only when they
 * worsen to a NEW stage above the benign baseline (hungry/thirsty). Recovery and the baseline never alert.
 */
const malnutrition = (severity: number): EntityCondition[] => [{ id: 'malnutrition', severity }];
const dehydration = (severity: number): EntityCondition[] => [{ id: 'dehydration', severity }];

describe('detectVitalEscalations', () => {
  it('does not alert on the benign baseline stage (hungry)', () => {
    expect(detectVitalEscalations(undefined, malnutrition(0.05))).toEqual([]);
  });

  it('alerts when first crossing into a real stage (minor)', () => {
    const esc = detectVitalEscalations(undefined, malnutrition(0.25));
    expect(esc).toEqual([{ id: 'malnutrition', stageLabel: 'minor' }]);
  });

  it('alerts again when escalating to a worse stage', () => {
    const prev = snapshotVitalStages(malnutrition(0.25)); // minor
    const esc = detectVitalEscalations(prev, malnutrition(0.55)); // serious
    expect(esc).toEqual([{ id: 'malnutrition', stageLabel: 'serious' }]);
  });

  it('does NOT alert while staying in the same stage', () => {
    const prev = snapshotVitalStages(malnutrition(0.5)); // serious
    expect(detectVitalEscalations(prev, malnutrition(0.55))).toEqual([]); // still serious
  });

  it('does NOT alert on recovery (downgrade)', () => {
    const prev = snapshotVitalStages(malnutrition(0.65)); // severe
    expect(detectVitalEscalations(prev, malnutrition(0.25))).toEqual([]); // back to minor
  });

  it('ignores non-vital conditions', () => {
    expect(detectVitalEscalations(undefined, [{ id: 'pain_shock', severity: 0.9 }])).toEqual([]);
  });

  // Regression: dehydration is NOT a `floater` condition, so the floater snapshot
  // (snapshotConditionStages) never captured its prev stage → the alert re-fired EVERY tick (the
  // chronicle-spam bug). snapshotVitalStages captures it independently of the floater flag.
  it('snapshotVitalStages captures dehydration (a non-floater vital) so a stable stage does NOT re-alert', () => {
    const prev = snapshotVitalStages(dehydration(0.3)); // parched
    expect(prev?.get('dehydration')).toBe('parched');
    expect(detectVitalEscalations(prev, dehydration(0.35))).toEqual([]); // still parched → no spam
  });

  it('dehydration alerts once on escalation (parched → failing)', () => {
    const prev = snapshotVitalStages(dehydration(0.3)); // parched
    expect(detectVitalEscalations(prev, dehydration(0.55))).toEqual([
      { id: 'dehydration', stageLabel: 'failing' }
    ]);
  });
});
