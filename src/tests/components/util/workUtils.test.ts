import { describe, it, expect } from 'vitest';
import { ABBR, NON_SKILL_TASKS, LABOR_LABELS, LABOR_COLORS, LVL_NAMES } from '$lib/components/util/workUtils';
import { WORK_CATEGORIES } from '$lib/game/core/defs/work';
import { NON_SKILL_CATEGORIES } from '$lib/game/core/rules/body/workExperience';

describe('workUtils rosters', () => {
  it('gives every work category a distinct abbreviation, with no stray keys', () => {
    const ids = WORK_CATEGORIES.map((c) => c.id);
    expect(Object.keys(ABBR).sort()).toEqual([...ids].sort());
    const abbrs = Object.values(ABBR);
    expect(new Set(abbrs).size).toBe(abbrs.length);
  });

  it('keys NON_SKILL_TASKS to exactly the canonical non-skill category set', () => {
    expect(Object.keys(NON_SKILL_TASKS).sort()).toEqual([...NON_SKILL_CATEGORIES].sort());
  });

  it('covers every labor level in LABOR_LABELS, LABOR_COLORS and LVL_NAMES', () => {
    for (const lvl of [0, 1, 2, 3, 4] as const) {
      expect(LABOR_LABELS[lvl]).toBeTruthy();
      expect(LABOR_COLORS[lvl]).toBeTruthy();
      expect(LVL_NAMES[lvl]).toBeTruthy();
    }
  });
});
