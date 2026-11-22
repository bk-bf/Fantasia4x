import { describe, it, expect } from 'vitest';
import conditionsData from '$lib/game/database/pawns/conditions.json';
import {
  getConditionCurrentStage,
  getConditionName,
  getConditionLabel,
  detectVitalEscalations,
  driveNeedConditions,
  driveTemperatureConditions
} from '$lib/game/core/rules/body/conditions';
import type { ConditionDef, EntityCondition } from '$lib/game/core/types';

const staged = (conditionsData as unknown as ConditionDef[]).filter(
  (d) => (d as { transient?: boolean }).transient !== true
);

describe('condition lookups', () => {
  it('every staged condition resolves to its own name and to the last stage its severity reaches', () => {
    expect(staged.length).toBeGreaterThan(10);
    for (const def of staged) {
      expect(getConditionName({ id: def.id, severity: 0 })).toBe(def.name);
      for (const [i, stage] of def.stages.entries()) {
        const c = { id: def.id, severity: stage.minSeverity };
        const reached = def.stages.filter((s) => c.severity >= s.minSeverity).at(-1);
        expect(getConditionCurrentStage(c), `${def.id} stage ${i}`).toBe(reached);
        expect(getConditionLabel(c)).toBe(`${def.name} (${reached!.label})`);
      }
    }
  });

  it('an unknown condition has no stage and is named from its id', () => {
    const c = { id: 'not_a_condition', severity: 1 };
    expect(getConditionCurrentStage(c)).toBeUndefined();
    expect(getConditionName(c)).toBe('not a condition');
    expect(getConditionLabel(c)).toBe('not a condition');
  });

  it('a vital condition crossing into a worse stage is reported once', () => {
    const def = staged.find((d) => d.id === 'malnutrition')!;
    const top = def.stages.at(-1)!;
    const out = detectVitalEscalations(new Map([['malnutrition', def.stages[0].label]]), [
      { id: 'malnutrition', severity: top.minSeverity }
    ]);
    expect(out).toEqual([{ id: 'malnutrition', stageLabel: top.label }]);
    expect(
      detectVitalEscalations(new Map([['malnutrition', top.label]]), [
        { id: 'malnutrition', severity: top.minSeverity }
      ])
    ).toEqual([]);
  });
});

describe('condition drivers', () => {
  it('needs drive only the need conditions, and exposure drives only the temperature ones', () => {
    const fromNeeds: EntityCondition[] = [];
    for (let i = 0; i < 2000; i++)
      driveNeedConditions(fromNeeds, { hunger: 100, thirst: 100, comfort: 100 });
    expect(fromNeeds.map((c) => c.id).sort()).toEqual([
      'comfortable',
      'dehydration',
      'malnutrition'
    ]);

    const fromExposure: EntityCondition[] = [];
    for (let i = 0; i < 2000; i++) driveTemperatureConditions(fromExposure, 100, 100);
    expect(fromExposure.map((c) => c.id).sort()).toEqual(['heat_stroke', 'hypothermia']);
  });

  it('a need condition at its lethal severity is named as the cause', () => {
    const conds: EntityCondition[] = [{ id: 'dehydration', severity: 1 - 1e-6 }];
    expect(driveNeedConditions(conds, { thirst: 100 })).toBe('dehydration');
    const cold: EntityCondition[] = [{ id: 'hypothermia', severity: 1 - 1e-6 }];
    expect(driveTemperatureConditions(cold, 100, 0)).toBe('hypothermia');
  });
});
