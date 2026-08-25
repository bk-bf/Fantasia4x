// buildFit.ts — DEV TOOL. Grades a pawn against the combat BUILDS and answers two questions the
// stat rebuild left open: does pawn generation actually produce pawns that fit a build, and does
// fitting a build measurably pay off?
//
// A build is a WEIGHTED PROFILE over the two axes the rebuild established:
//   PHYSIQUE — the core stat its weapon's grip names (two-hander → strength, one-hander → dexterity,
//              ranged/finesse → perception, staff → intelligence, banner → charisma), plus whatever the
//              build's armour and role demand (a frontline needs constitution to stand in it).
//   APTITUDE — the rolled combat stats the build leans on (an archer lives on marksmanship, a
//              hammerman on leverage).
//
// Fit is deliberately a SPECTRUM, not a label: most pawns are a decent fit for several builds and a
// poor fit for the rest, which is what makes the assignment interesting. `gradePawn` returns every
// build's score so the caller can see the whole ranking, not just the winner.

import type { Pawn } from '../game/core/types';
import { APTITUDE_IDS, type AptitudeId } from '../game/core/rules/body/aptitudes';

export type CoreStat = 'strength' | 'dexterity' | 'constitution' | 'perception' | 'intelligence' | 'charisma';

export interface BuildProfile {
  /** Weights over the core stats. Need not sum to 1 — `gradePawn` normalises. */
  stats: Partial<Record<CoreStat, number>>;
  /** Weights over the rolled aptitudes. */
  aptitudes: Partial<Record<AptitudeId, number>>;
  /** A weapon this build is built around, and one it has no business holding — the fight test uses both. */
  weapon: string;
  offHand?: string;
  /** Why this profile looks the way it does, in one line. */
  note: string;
}

/**
 * The build roster, as numbers. Weights are shares of the build's total demand, so a build that
 * lives on ONE stat (a duelist's dexterity) scores harder on it than one spreading across three.
 */
export const BUILD_PROFILES: Record<string, BuildProfile> = {
  'Sword & Shield': {
    stats: { dexterity: 0.45, constitution: 0.4, strength: 0.15 },
    aptitudes: { hit_chance: 0.4, dodge: 0.2, attack_speed: 0.2, hit_precision: 0.2 },
    weapon: 'steel_longsword',
    offHand: 'iron_boss_shield',
    note: 'One-handed, so dexterity drives the blade; the shield and the standing still need constitution.'
  },
  'Mace & Shield': {
    stats: { dexterity: 0.4, constitution: 0.4, strength: 0.2 },
    aptitudes: { armor_damage: 0.4, hit_chance: 0.3, dodge: 0.15, attack_speed: 0.15 },
    weapon: 'steel_mace',
    offHand: 'iron_boss_shield',
    note: 'Anti-armour behind a shield — leverage is what the mace is FOR.'
  },
  'Greatsword (2H)': {
    stats: { strength: 0.65, constitution: 0.35 },
    aptitudes: { hit_chance: 0.35, attack_speed: 0.3, hit_precision: 0.2, armor_damage: 0.15 },
    weapon: 'steel_greatsword',
    note: 'Two-handed: strength is the whole damage channel, constitution is what survives having no shield.'
  },
  '2H Hammer': {
    stats: { strength: 0.7, constitution: 0.3 },
    aptitudes: { armor_damage: 0.5, hit_chance: 0.3, attack_speed: 0.2 },
    weapon: 'steel_warhammer',
    note: 'The armour-breaker: strength for the swing, leverage for what it does on arrival.'
  },
  'Duelist (1H, no shield)': {
    stats: { dexterity: 0.7, constitution: 0.3 },
    aptitudes: { hit_chance: 0.3, attack_speed: 0.3, hit_precision: 0.25, dodge: 0.15 },
    weapon: 'steel_longsword',
    note: 'The trait-gated one-hander: the free hand buys damage instead of a shield, so nothing but skill keeps it alive.'
  },
  'Assassin (Dagger)': {
    stats: { dexterity: 0.75, perception: 0.25 },
    aptitudes: { hit_precision: 0.45, attack_speed: 0.3, dodge: 0.25 },
    weapon: 'steel_stiletto',
    note: 'A dagger is placed, not swung — dexterity damage, and precision is the entire case for it.'
  },
  'Fencer (Rapier)': {
    stats: { perception: 0.7, dexterity: 0.3 },
    aptitudes: { hit_precision: 0.4, hit_chance: 0.3, dodge: 0.3 },
    weapon: 'steel_rapier',
    note: 'Finesse: the point goes where the eye is, so perception carries the damage.'
  },
  'Archer (Bow)': {
    stats: { perception: 0.8, dexterity: 0.2 },
    aptitudes: { aim_accuracy: 0.6, hit_precision: 0.25, dodge: 0.15 },
    weapon: 'war_bow',
    note: 'Ranged damage is perception; marksmanship is the aptitude nothing else uses.'
  },
  'Battlemage (1H Staff)': {
    stats: { intelligence: 0.8, constitution: 0.2 },
    aptitudes: { aim_accuracy: 0.5, hit_chance: 0.3, dodge: 0.2 },
    weapon: 'storm_rod',
    offHand: 'iron_boss_shield',
    note: 'A channelled bolt scales on intelligence; the free hand keeps a shield.'
  }
};

export const FIT_BUILDS = Object.keys(BUILD_PROFILES);
/**
 * Builds whose weapon resolves through the MELEE path. The dps comparison is only meaningful within
 * this set — a bow or a channelled rod measured through `resolveHit` at melee range reports the
 * fumble, not the build (the first pass compared an archer's bow-as-club and read 0.5 dps).
 */
export const MELEE_FIT_BUILDS = FIT_BUILDS.filter(
  (b) => !['Archer (Bow)', 'Battlemage (1H Staff)'].includes(b)
);

/**
 * The stat scale a score is measured against: the band pawns are actually ROLLED in at growth level 1
 * (`SPAWN_STAT_FLOOR`..`SPAWN_STAT_CAP`), NOT the growth ceiling. Grading against the ceiling would
 * make every starting pawn an F and say nothing about generation.
 *
 * Note what this means for the tier ladder below: in the GAME every starting pawn is bunched at the
 * bottom of it, because tier is a growth axis earned over survived years. The per-build calibration
 * exists so a test can still tell an S-shaped pawn from an F-shaped one WITHIN a spawn cohort.
 */
export const STAT_REF = { lo: 4, hi: 20 };

const norm = (v: number) =>
  Math.max(0, Math.min(1, (v - STAT_REF.lo) / (STAT_REF.hi - STAT_REF.lo)));
/** Aptitudes are multipliers around 1.0 in a ±0.15 band; map that onto the same 0–1 scale. */
const normApt = (v: number) => Math.max(0, Math.min(1, (v - 0.85) / 0.3));

export interface BuildScore {
  build: string;
  /** 0–1. The weighted match between what the build wants and what the pawn has. */
  score: number;
  /** The physique half alone — useful for seeing whether a bad fit is body or luck. */
  statScore: number;
  /** The rolled half alone. */
  aptScore: number;
}

/** Score a pawn against EVERY build, best first. */
export function gradePawn(pawn: Pawn): BuildScore[] {
  const out: BuildScore[] = [];
  for (const [build, prof] of Object.entries(BUILD_PROFILES)) {
    let sw = 0;
    let ss = 0;
    for (const [k, w] of Object.entries(prof.stats)) {
      sw += w;
      ss += w * norm((pawn.stats as unknown as Record<string, number>)[k] ?? 10);
    }
    let aw = 0;
    let as_ = 0;
    for (const [k, w] of Object.entries(prof.aptitudes)) {
      aw += w;
      as_ += w * normApt(pawn.aptitudes?.[k as AptitudeId] ?? 1);
    }
    const statScore = sw ? ss / sw : 0;
    const aptScore = aw ? as_ / aw : 0;
    // Physique is the bigger lever (it spans a far wider range than the ±15% aptitude band), so it
    // carries most of the weight — but a good roll still separates two identical bodies.
    out.push({ build, score: statScore * 0.72 + aptScore * 0.28, statScore, aptScore });
  }
  return out.sort((a, b) => b.score - a.score);
}

export type Tier = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * PER-BUILD CALIBRATION — why the raw score cannot be compared across builds.
 *
 * A profile's raw score is a weighted average of the pawn's normalised stats. Averaging iid values
 * leaves the MEAN unchanged whatever the weights, but not the SPREAD: a build that leans on one stat
 * (Archer, perception 0.8) has a far wider score distribution than one spread over three (Sword &
 * Shield, 0.45/0.4/0.15), because a single lucky roll carries it. Taking the argmax of raw scores
 * therefore hands the concentrated profiles most of the population — measured at 3 builds taking 76%.
 * That is an artefact of the weight vectors, not a statement about pawn generation.
 *
 * So every build is scored against ITS OWN distribution: `calibrate` measures the mean and spread each
 * profile actually produces over a population, and `fitOf` compares z-scores. Two consequences, both
 * intended: each build wins a roughly equal share of pawns, and the tier ladder runs F–S INSIDE every
 * build — an S-tier Assassin is the top of the Assassin distribution, not a pawn who happened to roll
 * the stat that three profiles share.
 */
export interface FitCalibration {
  /** build → mean and standard deviation of its raw score across the calibration population. */
  by: Record<string, { mean: number; sd: number }>;
  /**
   * build → a constant added to its z, chosen so every build wins a roughly EQUAL share of pawns.
   *
   * Normalising each build's spread is not enough on its own, because the builds do not compete on
   * equal terms: five of them want dexterity, so a strong-dexterity pawn is fought over and only one of
   * them can claim it, while `intelligence` is wanted by the Battlemage ALONE and is uncorrelated with
   * everything else (measured: |r| ≤ 0.05 against every physical stat). An uncontested stat wins its
   * argmax unopposed — the Battlemage was taking 27 pawns in every 100 against an even share of 11.
   *
   * The offset is a per-build constant, so it shifts which build a pawn lands in WITHOUT reordering
   * pawns inside a build: the F-to-S spread and every tier boundary are untouched.
   */
  offset: Record<string, number>;
  /**
   * build → mean and sd of the WINNING z among pawns whose best fit is that build. The tier is graded
   * against this, not against `by`. A pawn's best fit is the maximum of N z-scores, and the maximum of
   * N draws sits well above zero by construction — grading the raw winning z put 75% of the population
   * in S and A and left F empty. Ranking a pawn inside the cohort that ACTUALLY plays its build is
   * also the thing that makes the ladder mean what it should: an S-tier Assassin is the best of the
   * assassins, so every build carries its own full F–S spread.
   */
  winners: Record<string, { mean: number; sd: number }>;
}

const moments = (xs: number[]) => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const varr = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  // A degenerate profile (every pawn identical) would divide by zero; treat it as no spread.
  return { mean, sd: Math.sqrt(varr) || 1e-9 };
};

/**
 * The share of a generated population each build is MEANT to claim. Deliberately uneven: sword and
 * shield is the default a colonist falls back to, because a blade and a board is the loadout almost any
 * body can hold, while the specialist builds are meant to be harder to qualify for. An even split made
 * every build equally easy to reach, which is the "too easy to make a build" problem — nothing was a
 * fallback and nothing was special. Sums to 1.
 */
export const INTENDED_SHARE: Record<string, number> = {
  'Sword & Shield': 0.26,
  'Mace & Shield': 0.14,
  'Greatsword (2H)': 0.11,
  '2H Hammer': 0.09,
  'Archer (Bow)': 0.11,
  'Duelist (1H, no shield)': 0.08,
  'Fencer (Rapier)': 0.07,
  'Battlemage (1H Staff)': 0.07,
  'Assassin (Dagger)': 0.07
};

export function calibrate(pawns: Pawn[]): FitCalibration {
  const acc: Record<string, number[]> = {};
  for (const p of pawns) for (const s of gradePawn(p)) (acc[s.build] ??= []).push(s.score);
  const by: Record<string, { mean: number; sd: number }> = {};
  for (const [build, xs] of Object.entries(acc)) by[build] = moments(xs);

  // Pre-compute every pawn's z per build once — the offset solver below sweeps it repeatedly.
  const builds = Object.keys(by);
  const zs = pawns.map((p) => {
    const row: Record<string, number> = {};
    for (const s of gradePawn(p)) row[s.build] = (s.score - by[s.build].mean) / by[s.build].sd;
    return row;
  });

  // Solve the per-build offsets that even out the argmax shares. Plain iterative correction: measure
  // each build's share, nudge its offset by how far it is from an even share (in log space, so a build
  // taking twice its share is pushed exactly as hard as one taking half), repeat. Converges in a few
  // dozen passes and is deterministic — no randomness, so a given population always calibrates the same.
  const offset: Record<string, number> = {};
  for (const b of builds) offset[b] = 0;
  // NOT an even split. `Sword & Shield` is the DEFAULT a colonist falls back to — a blade and a board
  // is the loadout almost any body can hold — so it is deliberately the widest door, while the
  // specialist builds are meant to be harder to qualify for. An even nine-way split made every build
  // equally easy to reach, which read as "too easy to make a build": nothing was a fallback and nothing
  // was special. Shares below sum to 1.
  const SHARE = INTENDED_SHARE;
  const shareOf = (b: string) => SHARE[b] ?? 1 / builds.length;
  const argmax = () => {
    const count: Record<string, number> = {};
    for (const b of builds) count[b] = 0;
    for (const row of zs) {
      let bb = builds[0];
      let bz = -Infinity;
      for (const b of builds) {
        const z = row[b] + offset[b];
        if (z > bz) {
          bz = z;
          bb = b;
        }
      }
      count[bb]++;
    }
    return count;
  };
  // The step is CLAMPED. An unclamped log correction is unstable: a build that momentarily wins zero
  // pawns gets an unbounded push, overshoots into dominating, and the whole thing oscillates apart —
  // the first attempt drove four builds to a 0% share and the offsets to ~38.
  const MAX_STEP = 0.08;
  for (let iter = 0; iter < 400; iter++) {
    const count = argmax();
    let worst = 0;
    for (const b of builds) {
      const want = shareOf(b);
      const share = Math.max(0.5 / zs.length, count[b] / zs.length); // never log(0)
      const raw = -0.3 * Math.log(share / want);
      offset[b] += Math.max(-MAX_STEP, Math.min(MAX_STEP, raw));
      worst = Math.max(worst, Math.abs(share - want) / want);
    }
    if (worst < 0.25) break; // every build within a quarter of its intended share
  }

  // Winner moments, computed with the offsets in place so the tier ladder is measured on the same
  // scale the assignment actually uses.
  const wins: Record<string, number[]> = {};
  for (const row of zs) {
    let bestBuild = builds[0];
    let bestZ = -Infinity;
    for (const b of builds) {
      const z = row[b] + offset[b];
      if (z > bestZ) {
        bestZ = z;
        bestBuild = b;
      }
    }
    (wins[bestBuild] ??= []).push(bestZ);
  }
  const winners: Record<string, { mean: number; sd: number }> = {};
  for (const [build, xs] of Object.entries(wins)) winners[build] = moments(xs);
  // A build no pawn ever won falls back to the unconditional distribution rather than vanishing.
  for (const build of Object.keys(by)) winners[build] ??= by[build];
  return { by, winners, offset };
}

/**
 * Tier cutoffs in STANDARD DEVIATIONS above a build's own mean, so the ladder means the same thing in
 * every build and the shares are fixed by the normal curve: S ≈ top 7%, A ≈ next 15%, F ≈ bottom 16%.
 * The previous cutoffs were absolute scores calibrated against one pooled distribution, which is what
 * let a whole build sit permanently at the bottom of the ladder.
 */
const TIER_CUT: [Tier, number][] = [
  ['S', 1.5],
  ['A', 0.8],
  ['B', 0.2],
  ['C', -0.4],
  ['D', -1.0]
];
export const tierOf = (z: number): Tier => TIER_CUT.find(([, c]) => z >= c)?.[0] ?? 'F';

export interface PawnFit {
  best: BuildScore;
  tier: Tier;
  /** How far clear the best build is of the runner-up, in z — a SPECIALIST has a wide gap, a generalist none. */
  margin: number;
  /** Best-fit z-score against that build's own distribution. */
  z: number;
  /** Every build's z, best first. */
  all: BuildScore[];
  /** No build wants this pawn: even its best fit is below its build's own mean. */
  useless: boolean;
  /** Several builds want it about equally — playable as more than one thing. */
  generalist: boolean;
}

/** z at or below which a pawn's BEST build still doesn't really want it. */
const USELESS_Z = 0;
/** z gap under which the top two builds are effectively tied. */
const GENERALIST_MARGIN = 0.25;

export function fitOf(pawn: Pawn, calib: FitCalibration): PawnFit {
  const raw = gradePawn(pawn);
  const all = raw
    .map((s) => {
      const c = calib.by[s.build] ?? { mean: 0, sd: 1 };
      return { ...s, score: (s.score - c.mean) / c.sd + (calib.offset?.[s.build] ?? 0) };
    })
    .sort((a, b) => b.score - a.score);
  const margin = all[0].score - all[1].score;
  // Tier is graded INSIDE the winning build's cohort (see `winners`), so each build runs F–S.
  const w = calib.winners[all[0].build] ?? { mean: 0, sd: 1 };
  return {
    best: all[0],
    tier: tierOf((all[0].score - w.mean) / w.sd),
    margin,
    z: all[0].score,
    all,
    useless: all[0].score <= USELESS_Z,
    generalist: margin < GENERALIST_MARGIN
  };
}

/** The aptitude ids a build actually leans on — for reporting which roll made or broke a pawn. */
export const leanedOn = (build: string): AptitudeId[] =>
  APTITUDE_IDS.filter((id) => (BUILD_PROFILES[build]?.aptitudes[id] ?? 0) > 0.2);
