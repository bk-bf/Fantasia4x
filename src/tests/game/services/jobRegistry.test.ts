import { describe, it, expect } from 'vitest';
import { jobService } from '$lib/game/services/JobService';
import jobsData from '$lib/game/database/pawns/jobs.json';
import type { JobDef } from '$lib/game/core/types';

const defs = jobsData as unknown as JobDef[];

describe('job registry (jobs.json ↔ JobService)', () => {
  it('every jobs.json id has a registered behaviour handler, and vice versa', () => {
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
    expect(wk('rescue')).toBe('caretaking');
    expect(wk('refuel')).toBe('hauling');
    expect(wk('repair')).toBe('construction');
    expect(wk('eat')).toBe('eat');
    expect(wk('sleep')).toBe('sleep');
  });

  it('routes a craft job to its discipline PARENT (meal → cooking, stone tool → stoneworking)', () => {
    const job = { type: 'craft', targetX: 0, targetY: 0, craftQueueId: 'q1' };
    const cookGs = { craftingQueue: [{ id: 'q1', item: { id: 'small_stew' } }] } as never;
    const knapGs = { craftingQueue: [{ id: 'q1', item: { id: 'stone_axe' } }] } as never;
    expect(jobService.getJobWorkCategory(job, cookGs)).toBe('cooking');
    expect(jobService.getJobWorkCategory(job, knapGs)).toBe('stoneworking');
    expect(jobService.getJobWorkCategory(job)).toBe('crafting');
  });

  it('routes a craft order to its station DISCIPLINE — the Work-tab PARENT category', () => {
    const at = (stationType: string) =>
      jobService.craftWorkCategory({ item: { id: 'iron_dagger' }, stationType });
    expect(at('anvil')).toBe('metalworking');
    expect(at('butcher_spot')).toBe('cooking');
    expect(at('alchemy_lab')).toBe('alchemy');
    expect(at('craft_spot')).toBe('crafting');
    expect(jobService.craftWorkCategory(undefined)).toBe('crafting');
  });

  it('a craft job resolves to its LEAF discipline as the within-parent subjob stat key', () => {
    const statKey = (stationType: string, itemId = 'iron_dagger') =>
      jobService.getJobWorkStatKey({ type: 'craft', targetX: 0, targetY: 0, craftQueueId: 'q' }, {
        craftingQueue: [{ id: 'q', item: { id: itemId }, stationType }]
      } as never);
    expect(statKey('butcher_spot')).toBe('butchery');
    expect(statKey('tanning_bucket_station')).toBe('leatherworking');
    expect(statKey('hide_rack')).toBe('leatherworking');
    expect(statKey('anvil')).toBe('metalworking');
    expect(statKey('masons_bench')).toBe('masonry');
    expect(statKey('lapidary_bench')).toBe('lapidary');
    expect(statKey('oven')).toBe('baking');
    expect(statKey('fermenter')).toBe('brewing');
    expect(statKey('weaving_frame')).toBe('weaving');
    expect(statKey('sawtable')).toBe('woodworking');
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
    expect(kids('metalworking')).toEqual([]);
    expect(jobService.isCraftSubjob('butchery')).toBe(true);
    expect(jobService.isCraftSubjob('cooking')).toBe(false);
  });
});
