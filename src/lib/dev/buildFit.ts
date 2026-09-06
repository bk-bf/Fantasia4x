import type { Pawn, StatKey } from '../game/core/types';
import { APTITUDE_IDS, type AptitudeId } from '../game/core/rules/body/aptitudes';

export type CoreStat = StatKey;

export interface BuildProfile {
  stats: Partial<Record<CoreStat, number>>;
  aptitudes: Partial<Record<AptitudeId, number>>;
  weapon: string;
  offHand?: string;
  note: string;
}

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
export const MELEE_FIT_BUILDS = FIT_BUILDS.filter(
  (b) => !['Archer (Bow)', 'Battlemage (1H Staff)'].includes(b)
);

export const STAT_REF = { lo: 4, hi: 20 };

const norm = (v: number) =>
  Math.max(0, Math.min(1, (v - STAT_REF.lo) / (STAT_REF.hi - STAT_REF.lo)));
const normApt = (v: number) => Math.max(0, Math.min(1, (v - 0.85) / 0.3));

export interface BuildScore {
  build: string;
  score: number;
  statScore: number;
  aptScore: number;
}

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
    out.push({ build, score: statScore * 0.72 + aptScore * 0.28, statScore, aptScore });
  }
  return out.sort((a, b) => b.score - a.score);
}

export type Tier = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface FitCalibration {
  by: Record<string, { mean: number; sd: number }>;
  offset: Record<string, number>;
  winners: Record<string, { mean: number; sd: number }>;
}

const moments = (xs: number[]) => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const varr = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return { mean, sd: Math.sqrt(varr) || 1e-9 };
};

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

  const builds = Object.keys(by);
  const zs = pawns.map((p) => {
    const row: Record<string, number> = {};
    for (const s of gradePawn(p)) row[s.build] = (s.score - by[s.build].mean) / by[s.build].sd;
    return row;
  });

  const offset: Record<string, number> = {};
  for (const b of builds) offset[b] = 0;
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
  const MAX_STEP = 0.08;
  for (let iter = 0; iter < 400; iter++) {
    const count = argmax();
    let worst = 0;
    for (const b of builds) {
      const want = shareOf(b);
      const share = Math.max(0.5 / zs.length, count[b] / zs.length);
      const raw = -0.3 * Math.log(share / want);
      offset[b] += Math.max(-MAX_STEP, Math.min(MAX_STEP, raw));
      worst = Math.max(worst, Math.abs(share - want) / want);
    }
    if (worst < 0.25) break;
  }

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
  for (const build of Object.keys(by)) winners[build] ??= by[build];
  return { by, winners, offset };
}

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
  margin: number;
  z: number;
  all: BuildScore[];
  useless: boolean;
  generalist: boolean;
}

const USELESS_Z = 0;
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

export const leanedOn = (build: string): AptitudeId[] =>
  APTITUDE_IDS.filter((id) => (BUILD_PROFILES[build]?.aptitudes[id] ?? 0) > 0.2);
