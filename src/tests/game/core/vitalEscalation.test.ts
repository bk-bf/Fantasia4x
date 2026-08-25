import { describe, it, expect } from 'vitest';
import { detectVitalEscalations, snapshotVitalStages } from '$lib/game/core/rules/body/conditions';
import type { EntityCondition } from '$lib/game/core/types';

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
    const prev = snapshotVitalStages(malnutrition(0.25));
    const esc = detectVitalEscalations(prev, malnutrition(0.55));
    expect(esc).toEqual([{ id: 'malnutrition', stageLabel: 'serious' }]);
  });

  it('does NOT alert while staying in the same stage', () => {
    const prev = snapshotVitalStages(malnutrition(0.5));
    expect(detectVitalEscalations(prev, malnutrition(0.55))).toEqual([]);
  });

  it('does NOT alert on recovery (downgrade)', () => {
    const prev = snapshotVitalStages(malnutrition(0.65));
    expect(detectVitalEscalations(prev, malnutrition(0.25))).toEqual([]);
  });

  it('ignores non-vital conditions', () => {
    expect(detectVitalEscalations(undefined, [{ id: 'pain_shock', severity: 0.9 }])).toEqual([]);
  });

  it('snapshotVitalStages captures dehydration (a non-floater vital) so a stable stage does NOT re-alert', () => {
    const prev = snapshotVitalStages(dehydration(0.3));
    expect(prev?.get('dehydration')).toBe('parched');
    expect(detectVitalEscalations(prev, dehydration(0.35))).toEqual([]);
  });

  it('dehydration alerts once on escalation (parched → failing)', () => {
    const prev = snapshotVitalStages(dehydration(0.3));
    expect(detectVitalEscalations(prev, dehydration(0.55))).toEqual([
      { id: 'dehydration', stageLabel: 'failing' }
    ]);
  });
});
