import { describe, it, expect } from 'vitest';
import {
  BUILD_PROFILES,
  STAT_REF,
  gradePawn,
  calibrate,
  fitOf,
  tierOf,
  type BuildScore
} from '$lib/dev/buildFit';
import type { Pawn } from '$lib/game/core/types';

const APT_MIN = 0.85;
const APT_MAX = 1.15;

const pawn = (stats: Record<string, number>, aptitudes: Record<string, number>): Pawn =>
  ({ stats, aptitudes }) as unknown as Pawn;

const FULL_STATS = {
  strength: 10,
  dexterity: 10,
  constitution: 10,
  perception: 10,
  intelligence: 10,
  charisma: 10
};
const FULL_APT = {
  hit_chance: 1,
  attack_speed: 1,
  hit_precision: 1,
  armor_damage: 1,
  dodge: 1,
  aim_accuracy: 1,
  block: 1
};

describe('gradePawn', () => {
  it('returns exactly one BuildScore per BUILD_PROFILES key', () => {
    const out = gradePawn(pawn(FULL_STATS, FULL_APT));
    expect(out).toHaveLength(Object.keys(BUILD_PROFILES).length);
    expect(new Set(out.map((s) => s.build))).toEqual(new Set(Object.keys(BUILD_PROFILES)));
  });

  it('sorts its output descending by score', () => {
    const out = gradePawn(
      pawn(
        { strength: 6, dexterity: 18, constitution: 9, perception: 14, intelligence: 5, charisma: 11 },
        { hit_chance: 1.05, attack_speed: 0.9, hit_precision: 1.1, armor_damage: 0.95, dodge: 1.0, aim_accuracy: 0.88, block: 1 }
      )
    );
    for (let i = 1; i < out.length; i++) expect(out[i - 1].score).toBeGreaterThanOrEqual(out[i].score);
  });

  it('matches the documented weighted-mean formula for a build', () => {
    const out = gradePawn(
      pawn(
        { ...FULL_STATS, perception: 12, dexterity: 8 },
        { ...FULL_APT, aim_accuracy: 1.0, hit_precision: 1.0, dodge: 1.0 }
      )
    );
    const archer = out.find((s) => s.build === 'Archer (Bow)') as BuildScore;
    expect(archer.statScore).toBeCloseTo(0.45, 10);
    expect(archer.aptScore).toBeCloseTo(0.5, 10);
    expect(archer.score).toBeCloseTo(archer.statScore * 0.72 + archer.aptScore * 0.28, 10);
  });

  it('clamps statScore and aptScore to [0,1] instead of letting out-of-range input escape', () => {
    const hi = { strength: 1000, dexterity: 1000, constitution: 1000, perception: 1000, intelligence: 1000, charisma: 1000 };
    const aptHi = { hit_chance: 100, attack_speed: 100, hit_precision: 100, armor_damage: 100, dodge: 100, aim_accuracy: 100, block: 100 };
    const lo = { strength: -1000, dexterity: -1000, constitution: -1000, perception: -1000, intelligence: -1000, charisma: -1000 };
    const aptLo = { hit_chance: -100, attack_speed: -100, hit_precision: -100, armor_damage: -100, dodge: -100, aim_accuracy: -100, block: -100 };

    for (const s of gradePawn(pawn(hi, aptHi))) {
      expect(s.statScore).toBe(1);
      expect(s.aptScore).toBe(1);
    }
    for (const s of gradePawn(pawn(lo, aptLo))) {
      expect(s.statScore).toBe(0);
      expect(s.aptScore).toBe(0);
    }
    expect(STAT_REF).toEqual({ lo: 4, hi: 20 });
  });
});

describe('tierOf', () => {
  it('maps z onto the documented threshold ladder, boundaries included', () => {
    expect(tierOf(2.0)).toBe('S');
    expect(tierOf(1.5)).toBe('S');
    expect(tierOf(1.49999)).toBe('A');
    expect(tierOf(0.8)).toBe('A');
    expect(tierOf(0.79999)).toBe('B');
    expect(tierOf(0.2)).toBe('B');
    expect(tierOf(0.19999)).toBe('C');
    expect(tierOf(-0.4)).toBe('C');
    expect(tierOf(-0.40001)).toBe('D');
    expect(tierOf(-1.0)).toBe('D');
    expect(tierOf(-1.00001)).toBe('F');
    expect(tierOf(-5)).toBe('F');
  });

  it('falls back to F for non-finite input rather than throwing or misclassifying', () => {
    expect(tierOf(NaN)).toBe('F');
    expect(tierOf(-Infinity)).toBe('F');
  });
});

describe('calibrate', () => {
  const mkPop = (n: number): Pawn[] =>
    Array.from({ length: n }, (_, i) =>
      pawn(
        {
          strength: 4 + (i % 17),
          dexterity: 4 + ((i * 3) % 17),
          constitution: 4 + ((i * 5) % 17),
          perception: 4 + ((i * 7) % 17),
          intelligence: 4 + ((i * 11) % 17),
          charisma: 4 + ((i * 13) % 17)
        },
        {
          hit_chance: APT_MIN + ((i % 10) * (APT_MAX - APT_MIN)) / 10,
          attack_speed: APT_MIN + (((i * 3) % 10) * (APT_MAX - APT_MIN)) / 10,
          hit_precision: APT_MIN + (((i * 7) % 10) * (APT_MAX - APT_MIN)) / 10,
          armor_damage: APT_MIN + (((i * 9) % 10) * (APT_MAX - APT_MIN)) / 10,
          dodge: APT_MIN + (((i * 11) % 10) * (APT_MAX - APT_MIN)) / 10,
          aim_accuracy: APT_MIN + (((i * 13) % 10) * (APT_MAX - APT_MIN)) / 10,
          block: 1
        }
      )
    );

  it('returns a winners moment for every build, none of them missing', () => {
    const pop = mkPop(20);
    const calib = calibrate(pop);
    expect(Object.keys(calib.winners).sort()).toEqual(Object.keys(calib.by).sort());
    expect(Object.keys(calib.by).sort()).toEqual(Object.keys(BUILD_PROFILES).sort());
  });

  it('winners for a build that actually won pawns is the z-space moment of those wins, not calib.by', () => {
    const pop = mkPop(20);
    const calib = calibrate(pop);

    const wins: Record<string, number[]> = {};
    for (const p of pop) {
      const fit = fitOf(p, calib);
      expect(fit.z).toBe(fit.best.score);
      (wins[fit.best.build] ??= []).push(fit.z);
    }

    for (const [build, zs] of Object.entries(wins)) {
      const mean = zs.reduce((a, b) => a + b, 0) / zs.length;
      const variance = zs.reduce((a, b) => a + (b - mean) ** 2, 0) / zs.length;
      const sd = Math.sqrt(variance) || 1e-9;
      expect(calib.winners[build].mean).toBeCloseTo(mean, 6);
      expect(calib.winners[build].sd).toBeCloseTo(sd, 6);
      expect(calib.winners[build]).not.toBe(calib.by[build]);
    }

    for (const build of Object.keys(calib.by))
      if (!wins[build]) expect(calib.winners[build]).toBe(calib.by[build]);
  });
});

describe('fitOf', () => {
  const calib = calibrate([
    pawn(
      { strength: 18, dexterity: 6, constitution: 18, perception: 6, intelligence: 6, charisma: 6 },
      { hit_chance: 1, attack_speed: 1, hit_precision: 1, armor_damage: 1.1, dodge: 0.9, aim_accuracy: 1, block: 1 }
    ),
    pawn(
      { strength: 6, dexterity: 18, constitution: 10, perception: 8, intelligence: 6, charisma: 6 },
      { hit_chance: 1.1, attack_speed: 1.1, hit_precision: 1, armor_damage: 1, dodge: 1.1, aim_accuracy: 1, block: 1 }
    ),
    pawn(
      { strength: 6, dexterity: 6, constitution: 6, perception: 18, intelligence: 6, charisma: 6 },
      { hit_chance: 1, attack_speed: 1, hit_precision: 1, armor_damage: 1, dodge: 1, aim_accuracy: 1.1, block: 1 }
    )
  ]);

  it('sorts `all` descending and derives best/z/margin from it', () => {
    const p = pawn(
      { strength: 14, dexterity: 12, constitution: 10, perception: 8, intelligence: 6, charisma: 6 },
      FULL_APT
    );
    const fit = fitOf(p, calib);
    for (let i = 1; i < fit.all.length; i++)
      expect(fit.all[i - 1].score).toBeGreaterThanOrEqual(fit.all[i].score);
    expect(fit.best).toBe(fit.all[0]);
    expect(fit.z).toBe(fit.all[0].score);
    expect(fit.margin).toBeCloseTo(fit.all[0].score - fit.all[1].score, 10);
  });

  it('flags useless when the best build scores at or below 0, generalist when the margin is thin', () => {
    const uselessPawn = pawn(
      { strength: -1000, dexterity: -1000, constitution: -1000, perception: -1000, intelligence: -1000, charisma: -1000 },
      { hit_chance: -100, attack_speed: -100, hit_precision: -100, armor_damage: -100, dodge: -100, aim_accuracy: -100, block: 1 }
    );
    const uselessFit = fitOf(uselessPawn, calib);
    expect(uselessFit.all[0].score).toBeLessThanOrEqual(0);
    expect(uselessFit.useless).toBe(true);

    const specialistPawn = pawn(
      { strength: 20, dexterity: 4, constitution: 20, perception: 4, intelligence: 4, charisma: 4 },
      { hit_chance: 0.85, attack_speed: 0.85, hit_precision: 0.85, armor_damage: 1.15, dodge: 0.85, aim_accuracy: 0.85, block: 1 }
    );
    const specialistFit = fitOf(specialistPawn, calib);
    expect(specialistFit.margin).toBeGreaterThanOrEqual(0.25);
    expect(specialistFit.generalist).toBe(false);
  });
});
