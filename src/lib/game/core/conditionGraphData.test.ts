import { describe, it, expect } from 'vitest';
import { getConditionDefById, CONDITION_IDS_WITH_TRIGGERS } from './needs';
import conditionsData from '../database/conditions.jsonc';
import type { ConditionDef, TransientConditionDef } from './types/health';

const DEFS = conditionsData as unknown as Array<ConditionDef | TransientConditionDef>;

describe('condition graph data (TRAIT-SYSTEM-V2 §5)', () => {
  it('every trigger `to` (and `when.hasCondition/lacksCondition`) resolves to a real condition', () => {
    const ids = new Set(DEFS.map((d) => d.id));
    for (const d of DEFS) {
      for (const t of d.triggers ?? []) {
        expect(ids.has(t.to), `${d.id} → ${t.to}`).toBe(true);
        for (const ref of [t.when?.hasCondition, t.when?.lacksCondition]) {
          if (ref) expect(ids.has(ref), `${d.id} when ${ref}`).toBe(true);
        }
      }
      for (const ref of [d.activateWhen?.hasCondition, d.activateWhen?.lacksCondition]) {
        if (ref) expect(ids.has(ref)).toBe(true);
      }
    }
  });

  it('CONDITION_IDS_WITH_TRIGGERS matches the data', () => {
    const expected = new Set(DEFS.filter((d) => (d.triggers?.length ?? 0) > 0).map((d) => d.id));
    expect(new Set(CONDITION_IDS_WITH_TRIGGERS)).toEqual(expected);
    expect(CONDITION_IDS_WITH_TRIGGERS.has('wet')).toBe(true);
    expect(CONDITION_IDS_WITH_TRIGGERS.has('envenomed')).toBe(true);
  });

  it('the wired edges are present: wet→hypothermia (severity) and envenomed→nausea (transient)', () => {
    const wet = getConditionDefById('wet')?.triggers?.find((t) => t.to === 'hypothermia');
    expect(wet).toMatchObject({ to: 'hypothermia', chance: 0.04, severity: 0.04 });
    expect(wet?.when).toMatchObject({ need: 'coldExposure', atOrAbove: 100 });
    const venom = getConditionDefById('envenomed')?.triggers?.find((t) => t.to === 'nausea');
    expect(venom).toMatchObject({ to: 'nausea', durationHours: 1.5 });
    // nausea is a transient (timer) target — the apply path stamps conditionTimers, not severity.
    expect((getConditionDefById('nausea') as TransientConditionDef).transient).toBe(true);
  });

  it('every condition carries flags (categorisation pass)', () => {
    for (const d of DEFS) expect(Array.isArray(d.flags), d.id).toBe(true);
  });
});
