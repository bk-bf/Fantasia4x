import { describe, it, expect } from 'vitest';
import { pawnStatService } from './PawnStatService';
import { jobService } from './JobService';
import type { Pawn, Job } from '../core/types';

/**
 * Per-subjob work stats (Work-tab fine-tuning): each splittable subjob reads its own
 * `<subjob>_speed`/`_quality` from stats.jsonc, with a per-axis fallback to the parent category — so
 * a pawn is no longer equally skilled at every subjob of a category. construction leans STR/INT,
 * repair leans DEX/PER, demolish leans STR/CON; so attribute spread alone drives per-pawn variety.
 */
const pawn = (stats: Partial<Record<string, number>>): Pawn =>
  ({
    limbs: [],
    injuries: [],
    stats: {
      strength: 10,
      dexterity: 10,
      intelligence: 10,
      perception: 10,
      constitution: 10,
      wisdom: 10,
      charisma: 10,
      ...stats
    }
  }) as unknown as Pawn;

const job = (type: string): Job => ({ type, targetX: 0, targetY: 0 }) as unknown as Job;

describe('per-subjob work stats', () => {
  it('a STR-skewed pawn BUILDS faster than they REPAIR (different attributes)', () => {
    const p = pawn({ strength: 18, dexterity: 6, perception: 6 });
    const build = pawnStatService.getWorkModifiers(p, 'construction').speed;
    const repair = pawnStatService.getWorkModifiers(p, 'repair', undefined, 'construction').speed;
    expect(build).toBeGreaterThan(repair);
  });

  it('a DEX/PER-skewed pawn REPAIRS faster than they BUILD (inverse)', () => {
    const p = pawn({ strength: 6, dexterity: 18, perception: 18 });
    const build = pawnStatService.getWorkModifiers(p, 'construction').speed;
    const repair = pawnStatService.getWorkModifiers(p, 'repair', undefined, 'construction').speed;
    expect(repair).toBeGreaterThan(build);
  });

  it('a subjob with no own stat inherits the parent category (Build = construction)', () => {
    const p = pawn({ strength: 14, dexterity: 8 });
    const cat = pawnStatService.getWorkModifiers(p, 'construction').speed;
    const build = pawnStatService.getWorkModifiers(p, 'construct', undefined, 'construction').speed;
    expect(build).toBeCloseTo(cat);
  });

  it('quality is null when neither the subjob nor its category defines one (fetch under hauling)', () => {
    const p = pawn({});
    // hauling has no `hauling_quality`, so fetch has nothing to inherit → null.
    expect(pawnStatService.getWorkModifiers(p, 'fetch', undefined, 'hauling').quality).toBeNull();
    // repair defines its own quality.
    expect(
      pawnStatService.getWorkModifiers(p, 'repair', undefined, 'construction').quality
    ).not.toBeNull();
  });

  it('getJobWorkStatKey returns the subjob id for splittable categories, else the category', () => {
    expect(jobService.getJobWorkStatKey(job('repair'))).toBe('repair');
    expect(jobService.getJobWorkStatKey(job('construct'))).toBe('construct');
    expect(jobService.getJobWorkStatKey(job('fetch'))).toBe('fetch');
    expect(jobService.getJobWorkStatKey(job('craft'))).toBe('crafting'); // 1:1, no subjob split
  });
});
