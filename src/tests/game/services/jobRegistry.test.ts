import { describe, it, expect } from 'vitest';
import { jobService } from '$lib/game/services/JobService';
import jobsData from '$lib/game/database/pawns/jobs.jsonc';
import type { JobDef } from '$lib/game/core/types';

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

  it('declares exactly the twelve colony pool job types', () => {
    expect(new Set(defs.map((d) => d.id))).toEqual(
      new Set([
        'harvest',
        'haul',
        'construct',
        'deconstruct',
        'fetch',
        'craft',
        'caretake',
        'rescue',
        'refuel',
        'repair',
        'plant',
        'fill'
      ])
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
    const wk = (type: string) => jobService.getJobWorkCategory({ type, targetX: 0, targetY: 0 });
    expect(wk('haul')).toBe('hauling');
    expect(wk('fetch')).toBe('hauling');
    expect(wk('construct')).toBe('construction');
    expect(wk('deconstruct')).toBe('construction');
    expect(wk('craft')).toBe('crafting');
    expect(wk('caretake')).toBe('caretaking');
    expect(wk('rescue')).toBe('caretaking'); // auto-rescue is a caretaking job
    expect(wk('refuel')).toBe('hauling'); // a carrying chore — sits with haul/fetch, not construction
    expect(wk('repair')).toBe('construction');
    // FSM-internal kinds (no JobDef) fall through to their own id, as before.
    expect(wk('eat')).toBe('eat');
    expect(wk('sleep')).toBe('sleep');
  });

  it('routes a craft job to its discipline PARENT (meal → cooking, stone tool → stoneworking)', () => {
    const job = { type: 'craft', targetX: 0, targetY: 0, craftQueueId: 'q1' };
    // A prepared `meal` cooks; a stone axe (tagged `knapping`) sits under Stoneworking — no generic bucket.
    const cookGs = { craftingQueue: [{ id: 'q1', item: { id: 'small_stew' } }] } as never;
    const knapGs = { craftingQueue: [{ id: 'q1', item: { id: 'stone_axe' } }] } as never;
    expect(jobService.getJobWorkCategory(job, cookGs)).toBe('cooking');
    expect(jobService.getJobWorkCategory(job, knapGs)).toBe('stoneworking'); // knapping leaf → its parent
    // No gs / unknown order → the `crafting` sentinel (dissolved as a Work-tab category; never a real route).
    expect(jobService.getJobWorkCategory(job)).toBe('crafting');
  });

  it('routes a craft order to its station DISCIPLINE — the Work-tab PARENT category', () => {
    // craftWorkCategory is the labor CATEGORY (the Work-tab parent): a butcher spot's leaf is
    // `butchery`, but that sits UNDER Cooking, so the labor slider it answers to is `cooking`.
    const at = (stationType: string) =>
      jobService.craftWorkCategory({ item: { id: 'iron_dagger' }, stationType });
    expect(at('anvil')).toBe('metalworking'); // flat discipline → its own parent
    expect(at('butcher_spot')).toBe('cooking'); // butchery leaf → Cooking parent
    expect(at('alchemy_lab')).toBe('alchemy'); // potions leaf → Alchemy parent
    expect(at('craft_spot')).toBe('crafting'); // generic station → no discipline
    expect(jobService.craftWorkCategory(undefined)).toBe('crafting');
  });

  it('a craft job resolves to its LEAF discipline as the within-parent subjob stat key', () => {
    const statKey = (stationType: string, itemId = 'iron_dagger') =>
      jobService.getJobWorkStatKey({ type: 'craft', targetX: 0, targetY: 0, craftQueueId: 'q' }, {
        craftingQueue: [{ id: 'q', item: { id: itemId }, stationType }]
      } as never);
    expect(statKey('butcher_spot')).toBe('butchery'); // leaf under Cooking
    expect(statKey('tanning_bucket_station')).toBe('leatherworking'); // leaf under Tailoring
    expect(statKey('hide_rack')).toBe('leatherworking'); // curing is leatherwork, not generic crafting
    expect(statKey('anvil')).toBe('metalworking'); // flat: leaf == parent
    expect(statKey('masons_bench')).toBe('masonry'); // leaf under Stoneworking
    expect(statKey('lapidary_bench')).toBe('lapidary'); // leaf under Stoneworking (was mis-routed to alchemy)
    expect(statKey('oven')).toBe('baking'); // leaf under Cooking
    expect(statKey('fermenter')).toBe('brewing'); // leaf under Cooking
    expect(statKey('weaving_frame')).toBe('weaving'); // leaf under Tailoring
    expect(statKey('sawtable')).toBe('woodworking'); // carpentry (hafts, planks, furniture)
    // A meal output is the `meals` leaf of Cooking.
    expect(statKey('campfire', 'small_stew')).toBe('meals');
  });

  it('the Work tab nests craft disciplines under their parent, like Construction', () => {
    const kids = (cat: string) => jobService.getSubjobsForCategory(cat).map((s) => s.id);
    expect(kids('construction')).toEqual(
      expect.arrayContaining(['construct', 'deconstruct', 'repair'])
    );
    expect(kids('tailoring')).toEqual(['leatherworking', 'weaving']);
    expect(kids('cooking')).toEqual(['meals', 'butchery', 'baking', 'brewing']);
    expect(kids('stoneworking')).toEqual(['knapping', 'masonry', 'lapidary', 'bonecarving']);
    expect(kids('metalworking')).toEqual([]); // flat — nothing to expand
    // leaf disciplines are dropped from the top-level Work-tab row
    expect(jobService.isCraftSubjob('butchery')).toBe(true);
    expect(jobService.isCraftSubjob('cooking')).toBe(false);
  });
});
