import { describe, it, expect } from 'vitest';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import { jobService } from '$lib/game/services/JobService';
import type { Pawn, Job } from '$lib/game/core/types';

/**
 * Per-subjob work stats (Work-tab fine-tuning): each splittable subjob reads its own
 * `<subjob>_speed`/`_quality` from stats.jsonc, with a per-axis fallback to the parent category.
 * WORK-EXPERIENCE: per-pawn variety now comes from the experience LEVEL (a subjob reads its
 * parent category's level via the SKILL token) and the innate speed↔finesse work style — core
 * stats are only a small supplement.
 */
const pawn = (stats: Partial<Record<string, number>>, extra: Partial<Pawn> = {}): Pawn =>
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
    },
    ...extra
  }) as unknown as Pawn;

const job = (type: string): Job => ({ type, targetX: 0, targetY: 0 }) as unknown as Job;

describe('per-subjob work stats', () => {
  it("a subjob shares its parent category's experience level (repair rides construction)", () => {
    const novice = pawn({}, { skills: { construction: 3 } });
    const master = pawn({}, { skills: { construction: 45 } });
    const repairNovice = pawnStatService.getWorkModifiers(
      novice,
      'repair',
      undefined,
      'construction'
    ).speed;
    const repairMaster = pawnStatService.getWorkModifiers(
      master,
      'repair',
      undefined,
      'construction'
    ).speed;
    expect(repairMaster).toBeGreaterThan(repairNovice * 2); // levelBase 0.6ish → ~1.8
    // and the parent's own speed moves in lockstep with the same level
    const buildMaster = pawnStatService.getWorkModifiers(master, 'construction').speed;
    expect(buildMaster).toBeGreaterThan(
      pawnStatService.getWorkModifiers(novice, 'construction').speed
    );
  });

  it('work style splits speed vs quality (fast-but-rough vs slow-but-fine twins)', () => {
    const rough = pawn({}, { skills: { construction: 25 }, workStyle: -1 });
    const fine = pawn({}, { skills: { construction: 25 }, workStyle: 1 });
    const roughMods = pawnStatService.getWorkModifiers(rough, 'repair', undefined, 'construction');
    const fineMods = pawnStatService.getWorkModifiers(fine, 'repair', undefined, 'construction');
    expect(roughMods.speed).toBeGreaterThan(fineMods.speed);
    expect(fineMods.quality ?? 0).toBeGreaterThan(roughMods.quality ?? 0);
  });

  it('core stats are only a small supplement — a huge stat spread barely moves the needle', () => {
    const weak = pawn({ strength: 6, dexterity: 6 });
    const mighty = pawn({ strength: 20, dexterity: 20 });
    const weakSpeed = pawnStatService.getWorkModifiers(weak, 'construction').speed;
    const mightySpeed = pawnStatService.getWorkModifiers(mighty, 'construction').speed;
    expect(mightySpeed).toBeGreaterThan(weakSpeed); // still a nudge…
    expect(mightySpeed / weakSpeed).toBeLessThan(1.1); // …but never the driver
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
