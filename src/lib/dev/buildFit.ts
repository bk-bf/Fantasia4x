// buildFit.ts — DEV TOOL. Grades a pawn against the combat BUILDS and answers two questions the
// stat rebuild left open: does pawn generation actually produce pawns that fit a build, and does
// fitting a build measurably pay off?
//
// A build is a WEIGHTED PROFILE over the two axes the rebuild established:
//   PHYSIQUE — the core stat its weapon's grip names (two-hander → brawn, one-hander → agility,
//              ranged/finesse → awareness, staff → intellect, banner → charisma), plus whatever the
//              build's armour and role demand (a frontline needs vigour to stand in it).
//   APTITUDE — the rolled combat stats the build leans on (an archer lives on marksmanship, a
//              hammerman on leverage).
//
// Fit is deliberately a SPECTRUM, not a label: most pawns are a decent fit for several builds and a
// poor fit for the rest, which is what makes the assignment interesting. `gradePawn` returns every
// build's score so the caller can see the whole ranking, not just the winner.

import type { Pawn } from '../game/core/types';
import { APTITUDE_IDS, type AptitudeId } from '../game/core/aptitudes';

export type CoreStat = 'brawn' | 'agility' | 'vigour' | 'awareness' | 'intellect' | 'charisma';

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
 * lives on ONE stat (a duelist's agility) scores harder on it than one spreading across three.
 */
export const BUILD_PROFILES: Record<string, BuildProfile> = {
  'Sword & Shield': {
    stats: { agility: 0.45, vigour: 0.4, brawn: 0.15 },
    aptitudes: { hit_chance: 0.4, dodge: 0.2, attack_speed: 0.2, hit_precision: 0.2 },
    weapon: 'steel_longsword',
    offHand: 'iron_boss_shield',
    note: 'One-handed, so agility drives the blade; the shield and the standing still need vigour.'
  },
  'Mace & Shield': {
    stats: { agility: 0.4, vigour: 0.4, brawn: 0.2 },
    aptitudes: { armor_damage: 0.4, hit_chance: 0.3, dodge: 0.15, attack_speed: 0.15 },
    weapon: 'steel_mace',
    offHand: 'iron_boss_shield',
    note: 'Anti-armour behind a shield — leverage is what the mace is FOR.'
  },
  'Greatsword (2H)': {
    stats: { brawn: 0.65, vigour: 0.35 },
    aptitudes: { hit_chance: 0.35, attack_speed: 0.3, hit_precision: 0.2, armor_damage: 0.15 },
    weapon: 'steel_greatsword',
    note: 'Two-handed: brawn is the whole damage channel, vigour is what survives having no shield.'
  },
  '2H Hammer': {
    stats: { brawn: 0.7, vigour: 0.3 },
    aptitudes: { armor_damage: 0.5, hit_chance: 0.3, attack_speed: 0.2 },
    weapon: 'steel_warhammer',
    note: 'The armour-breaker: brawn for the swing, leverage for what it does on arrival.'
  },
  'Assassin (Dagger)': {
    stats: { agility: 0.75, awareness: 0.25 },
    aptitudes: { hit_precision: 0.45, attack_speed: 0.3, dodge: 0.25 },
    weapon: 'steel_stiletto',
    note: 'A dagger is placed, not swung — agility damage, and precision is the entire case for it.'
  },
  'Fencer (Rapier)': {
    stats: { awareness: 0.7, agility: 0.3 },
    aptitudes: { hit_precision: 0.4, hit_chance: 0.3, dodge: 0.3 },
    weapon: 'steel_rapier',
    note: 'Finesse: the point goes where the eye is, so awareness carries the damage.'
  },
  'Archer (Bow)': {
    stats: { awareness: 0.8, agility: 0.2 },
    aptitudes: { aim_accuracy: 0.6, hit_precision: 0.25, dodge: 0.15 },
    weapon: 'war_bow',
    note: 'Ranged damage is awareness; marksmanship is the aptitude nothing else uses.'
  },
  'Battlemage (1H Staff)': {
    stats: { intellect: 0.8, vigour: 0.2 },
    aptitudes: { aim_accuracy: 0.5, hit_chance: 0.3, dodge: 0.2 },
    weapon: 'storm_rod',
    offHand: 'iron_boss_shield',
    note: 'A channelled bolt scales on intellect; the free hand keeps a shield.'
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
 * The stat scale a score is measured against. Core stats are graded against the band pawns are
 * actually ROLLED in (not the growth ceiling) — otherwise every starting pawn grades F and the
 * measure says nothing about generation.
 */
export const STAT_REF = { lo: 8, hi: 26 };

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
 * Cutoffs on the 0–1 fit score, CALIBRATED against the measured distribution of 300 generated pawns
 * (p5 0.571 · p25 0.679 · p50 0.750 · p75 0.813 · p95 0.876), so the ladder means something: S is the
 * top ~5%, F the bottom ~5%. The first pass used guessed cutoffs and graded 75% of the population S
 * or A, which tells you nothing about anything.
 */
const TIER_CUT: [Tier, number][] = [
  ['S', 0.876],
  ['A', 0.813],
  ['B', 0.75],
  ['C', 0.679],
  ['D', 0.571]
];
export const tierOf = (score: number): Tier => TIER_CUT.find(([, c]) => score >= c)?.[0] ?? 'F';

export interface PawnFit {
  best: BuildScore;
  tier: Tier;
  /** How far clear the best build is of the runner-up — a SPECIALIST has a wide gap, a generalist none. */
  margin: number;
  all: BuildScore[];
}

export function fitOf(pawn: Pawn): PawnFit {
  const all = gradePawn(pawn);
  return { best: all[0], tier: tierOf(all[0].score), margin: all[0].score - all[1].score, all };
}

/** The aptitude ids a build actually leans on — for reporting which roll made or broke a pawn. */
export const leanedOn = (build: string): AptitudeId[] =>
  APTITUDE_IDS.filter((id) => (BUILD_PROFILES[build]?.aptitudes[id] ?? 0) > 0.2);
