import { rng } from '../../util/rng';

export const APTITUDE_IDS = [
  'hit_chance',
  'attack_speed',
  'hit_precision',
  'armor_damage',
  'dodge',
  'aim_accuracy',
  'block'
] as const;
export type AptitudeId = (typeof APTITUDE_IDS)[number];

export type Aptitudes = Partial<Record<AptitudeId, number>>;

export const APTITUDE_MIN = 0.85;
export const APTITUDE_MAX = 1.15;

function triangular(min: number, max: number): number {
  return min + ((rng.random() + rng.random()) / 2) * (max - min);
}

export function rollAptitudes(bodyWeightKg = 70): Aptitudes {
  const massTilt = Math.max(-0.08, Math.min(0.08, (bodyWeightKg - 70) * 0.0015));
  const out: Aptitudes = {};
  for (const id of APTITUDE_IDS) out[id] = round3(triangular(APTITUDE_MIN, APTITUDE_MAX));
  out.armor_damage = round3(clampBand((out.armor_damage ?? 1) + massTilt));
  out.dodge = round3(clampBand((out.dodge ?? 1) - massTilt));
  out.block = round3(clampBand((out.block ?? 1) + massTilt));
  return out;
}

const clampBand = (v: number) => Math.max(APTITUDE_MIN - 0.1, Math.min(APTITUDE_MAX + 0.1, v));
const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function creatureAptitudes(stats: {
  strength?: number;
  dexterity?: number;
  perception?: number;
  constitution?: number;
}): Aptitudes {
  const dexterity = stats.dexterity ?? 10;
  const strength = stats.strength ?? 10;
  const perception = stats.perception ?? 10;
  const constitution = stats.constitution ?? 10;
  return {
    hit_chance: 1 + (dexterity - 10) * 0.03,
    attack_speed: 1 + (dexterity - 10) * 0.03,
    hit_precision: 1 + ((dexterity - 10) * 0.005 + (perception - 10) * 0.0025) / 0.05,
    armor_damage: 1 + (strength - 10) * 0.02,
    dodge: 1 + (dexterity - 10) * 0.02,
    aim_accuracy: 1 + (perception - 10) * 0.04,
    block: 0.5 + (constitution - 10) * 0.1
  };
}

export function aptitudeOf(entity: { aptitudes?: Aptitudes }, statId: string): number {
  return entity.aptitudes?.[statId as AptitudeId] ?? 1;
}

export const isAptitudeStat = (statId: string): statId is AptitudeId =>
  (APTITUDE_IDS as readonly string[]).includes(statId);

export function ensureAptitudes(pawns: { aptitudes?: Aptitudes }[]): void {
  for (const p of pawns) {
    const a = (p.aptitudes ??= {});
    for (const id of APTITUDE_IDS) if (a[id] == null) a[id] = 1;
  }
}
