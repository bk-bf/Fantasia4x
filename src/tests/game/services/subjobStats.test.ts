import { describe, it, expect } from 'vitest';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import { jobService } from '$lib/game/services/JobService';
import {
  SKILL_CATEGORIES,
  workSkillCategory,
  levelBase,
  styleSpeedWeight,
  styleFinesseWeight,
  seedWorkLevels,
  xpToNext,
  workXpForJob
} from '$lib/game/core/rules/body/workExperience';
import { rng } from '$lib/game/core/util/rng';
import type { Pawn, Job } from '$lib/game/core/types';

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
    expect(repairMaster).toBeGreaterThan(repairNovice * 2);
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
    expect(mightySpeed).toBeGreaterThan(weakSpeed);
    expect(mightySpeed / weakSpeed).toBeLessThan(1.1);
  });

  it('a subjob with no own stat inherits the parent category (Build = construction)', () => {
    const p = pawn({ strength: 14, dexterity: 8 });
    const cat = pawnStatService.getWorkModifiers(p, 'construction').speed;
    const build = pawnStatService.getWorkModifiers(p, 'construct', undefined, 'construction').speed;
    expect(build).toBeCloseTo(cat);
  });

  it('quality is null when neither the subjob nor its category defines one (fetch under hauling)', () => {
    const p = pawn({});
    expect(pawnStatService.getWorkModifiers(p, 'fetch', undefined, 'hauling').quality).toBeNull();
    expect(
      pawnStatService.getWorkModifiers(p, 'repair', undefined, 'construction').quality
    ).not.toBeNull();
  });

  it('getJobWorkStatKey returns the subjob id for splittable categories, else the category', () => {
    expect(jobService.getJobWorkStatKey(job('repair'))).toBe('repair');
    expect(jobService.getJobWorkStatKey(job('construct'))).toBe('construct');
    expect(jobService.getJobWorkStatKey(job('fetch'))).toBe('fetch');
    expect(jobService.getJobWorkStatKey(job('craft'))).toBe('crafting');
  });
});

describe('craft-discipline leaves are INDEPENDENT skills', () => {
  it('each leaf trains itself — a weaver never levels leatherworking (and vice versa)', () => {
    expect(workSkillCategory('weaving')).toBe('weaving');
    expect(workSkillCategory('leatherworking')).toBe('leatherworking');
    expect(workSkillCategory('butchery')).toBe('butchery');
    expect(workSkillCategory('baking')).toBe('baking');
    expect(workSkillCategory('repair')).toBe('construction');
    expect(workSkillCategory('deconstruct')).toBe('construction');
    expect(workSkillCategory('refuel')).toBe('construction');
  });

  it('every leaf is a real skill; the grouping parents are NOT', () => {
    for (const leaf of [
      'leatherworking',
      'weaving',
      'knapping',
      'masonry',
      'lapidary',
      'butchery',
      'baking',
      'brewing',
      'meals',
      'herbalism',
      'potions'
    ])
      expect(SKILL_CATEGORIES, `${leaf} is a skill`).toContain(leaf);
    for (const parent of ['tailoring', 'stoneworking', 'cooking', 'alchemy'])
      expect(SKILL_CATEGORIES, `${parent} is a grouping category, not a skill`).not.toContain(
        parent
      );
    expect(SKILL_CATEGORIES, 'metalworking is flat → a skill').toContain('metalworking');
    expect(SKILL_CATEGORIES, 'construction verbs share it → a skill').toContain('construction');
  });

  it("a pawn's weaving level does not touch its leatherworking throughput", () => {
    const p = pawn({}, { skills: { weaving: 45, leatherworking: 3 } });
    const weave = pawnStatService.getWorkModifiers(p, 'weaving', undefined, 'tailoring').speed;
    const leather = pawnStatService.getWorkModifiers(
      p,
      'leatherworking',
      undefined,
      'tailoring'
    ).speed;
    expect(weave).toBeGreaterThan(leather * 2);
  });
});

describe('workExperience internals', () => {
  it('levelBase interpolates 0.6→1.0 over 1-25, then 1.0→2.0 over 25-50, and clamps outside range', () => {
    expect(levelBase(1)).toBeCloseTo(0.6, 5);
    expect(levelBase(25)).toBeCloseTo(1.0, 5);
    expect(levelBase(50)).toBeCloseTo(2.0, 5);
    expect(levelBase(0)).toBeCloseTo(levelBase(1), 5);
    expect(levelBase(100)).toBeCloseTo(levelBase(50), 5);
  });

  it('styleSpeedWeight and styleFinesseWeight both carry the balance bonus at workStyle=0, and default to 1 when undefined', () => {
    expect(styleSpeedWeight(0)).toBeCloseTo(1.1, 5);
    expect(styleFinesseWeight(0)).toBeCloseTo(1.1, 5);
    expect(styleSpeedWeight(undefined)).toBe(1);
    expect(styleFinesseWeight(undefined)).toBe(1);
  });

  it('seedWorkLevels seeds every skill category within [1,50], with 0-2 categories favoured', () => {
    let sawFavourite = false;
    for (let seed = 1; seed <= 30; seed++) {
      rng.reseed(seed);
      const skills = seedWorkLevels();
      expect(new Set(Object.keys(skills))).toEqual(new Set(SKILL_CATEGORIES));
      for (const cat of SKILL_CATEGORIES) {
        expect(skills[cat]).toBeGreaterThanOrEqual(1);
        expect(skills[cat]).toBeLessThanOrEqual(50);
      }
      const favoured = Object.values(skills).filter((lvl) => lvl > 9).length;
      expect(favoured).toBeGreaterThanOrEqual(0);
      expect(favoured).toBeLessThanOrEqual(2);
      if (favoured > 0) sawFavourite = true;
    }
    expect(sawFavourite, 'across seeds, the favourite bonus shows up at least once').toBe(true);
  });

  it('xpToNext returns the exact xp curve and is monotonically increasing', () => {
    expect(xpToNext(1)).toBe(52);
    expect(xpToNext(10)).toBe(341);
    expect(xpToNext(25)).toBe(1127);
    expect(xpToNext(50)).toBe(2909);
    const levels = [1, 5, 10, 25, 50];
    for (let i = 1; i < levels.length; i++)
      expect(xpToNext(levels[i])).toBeGreaterThan(xpToNext(levels[i - 1]));
  });

  it('workXpForJob rounds and clamps to [4, 300]', () => {
    expect(workXpForJob(2)).toBe(4);
    expect(workXpForJob(0.4)).toBe(4);
    expect(workXpForJob(150.4)).toBe(150);
    expect(workXpForJob(500)).toBe(300);
  });
});
