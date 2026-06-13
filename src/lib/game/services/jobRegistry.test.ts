import { describe, it, expect } from 'vitest';
import { jobService } from './JobService';
import jobsData from '../database/jobs.jsonc';
import type { JobDef } from '../core/types';

/**
 * Drift guards for the data-driven job registry (ADR-017). jobs.jsonc is the single declarative
 * source for colony job types; JobService binds behaviour by id. These lock the two together so a
 * job can't be half-added (data without a handler, or a handler without data). The compiler already
 * enforces `JobPoolType ⊆ Job['type']` and that `handlers` covers every JobPoolType; `graph:check`
 * (rule `job-registry`) adds the jsonc ↔ `Job['type']` union cross-check from source.
 */
const defs = jobsData as unknown as JobDef[];

describe('job registry (jobs.jsonc ↔ JobService)', () => {
  it('every jobs.jsonc id has a registered behaviour handler, and vice versa', () => {
    expect(new Set(defs.map((d) => d.id))).toEqual(new Set(jobService.jobTypeIds()));
  });

  it('declares exactly the seven colony pool job types', () => {
    expect(new Set(defs.map((d) => d.id))).toEqual(
      new Set(['harvest', 'haul', 'construct', 'deconstruct', 'fetch', 'craft', 'refuel'])
    );
  });

  it('every def is well-formed (id, label, and a work-category source or static category)', () => {
    for (const d of defs) {
      expect(d.id, 'id').toBeTruthy();
      expect(d.label, `label for ${d.id}`).toBeTruthy();
      expect(
        Boolean(d.workCategory) || d.workCategorySource === 'designation',
        `${d.id} needs workCategory or workCategorySource`
      ).toBe(true);
    }
  });

  it('maps static job types to their declared work category', () => {
    const wk = (type: string) =>
      jobService.getJobWorkCategory({ type, targetX: 0, targetY: 0 });
    expect(wk('haul')).toBe('hauling');
    expect(wk('fetch')).toBe('hauling');
    expect(wk('construct')).toBe('construction');
    expect(wk('deconstruct')).toBe('construction');
    expect(wk('craft')).toBe('crafting');
    expect(wk('refuel')).toBe('construction');
    // FSM-internal kinds (no JobDef) fall through to their own id, as before.
    expect(wk('eat')).toBe('eat');
    expect(wk('sleep')).toBe('sleep');
  });
});
