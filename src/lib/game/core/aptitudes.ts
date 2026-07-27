// APTITUDES — the second combat axis (COMBAT-BALANCE tasks 8–9).
//
// The core stats say how hard a body CAN hit. Aptitudes say how well it fights: whether the blow
// lands, how often, where, how it wrecks armour, and how well it evades. They are rolled per pawn
// INDEPENDENTLY of the core stats — that independence is the whole point. While `hit_chance` was
// `1 + (agility − 10) × 0.03`, agility bought damage, cadence, accuracy and crit at once, so the
// weapon's named power stat was decoration and every build converged on the same stat.
//
// They are not new stats. `hit_chance`, `attack_speed`, `hit_precision`, `armor_damage`, `dodge` and
// `aim_accuracy` keep their ids, names, descriptions and place in `stats.jsonc`; only the input
// changed. Each formula still multiplies by its capacity terms, so injury and conditions apply
// exactly as before.

import { rng } from './rng';

/** The combat stats whose value is rolled per pawn rather than derived from a core stat. */
export const APTITUDE_IDS = [
  'hit_chance',
  'attack_speed',
  'hit_precision',
  'armor_damage',
  'dodge',
  'aim_accuracy'
] as const;
export type AptitudeId = (typeof APTITUDE_IDS)[number];

/** Per-pawn aptitude roll: statId → multiplier around 1.0. Absent ⇒ 1.0 (older saves, mobs, fixtures). */
export type Aptitudes = Partial<Record<AptitudeId, number>>;

/**
 * Roll band. Deliberately narrower than the ±0.25 the design sketch priced: three aptitudes at the
 * top of that band compounded to **+95%** damage output, which is a bigger swing than any legendary
 * trait. ±0.15, rolled independently per stat, keeps a good roll worth having without letting the
 * dice out-decide the build.
 */
export const APTITUDE_MIN = 0.85;
export const APTITUDE_MAX = 1.15;

/** Triangular: the average of two uniform draws, so the middle is common and an extreme is rare. */
function triangular(min: number, max: number): number {
  return min + ((rng.random() + rng.random()) / 2) * (max - min);
}

/**
 * Roll a fresh aptitude set. Body size tilts two of them the way physics does — a heavy frame swings
 * with more leverage behind it and evades worse — so the anatomy still speaks, just not the stat block.
 */
export function rollAptitudes(bodyWeightKg = 70): Aptitudes {
  const massTilt = Math.max(-0.08, Math.min(0.08, (bodyWeightKg - 70) * 0.0015));
  const out: Aptitudes = {};
  for (const id of APTITUDE_IDS) out[id] = round3(triangular(APTITUDE_MIN, APTITUDE_MAX));
  out.armor_damage = round3(clampBand((out.armor_damage ?? 1) + massTilt));
  out.dodge = round3(clampBand((out.dodge ?? 1) - massTilt));
  return out;
}

const clampBand = (v: number) => Math.max(APTITUDE_MIN - 0.1, Math.min(APTITUDE_MAX + 0.1, v));
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * A CREATURE's aptitudes, derived from its own stat block rather than rolled.
 *
 * The decoupling exists to stop player builds converging on one stat — a creature has no build to
 * choose, its stat block IS its design, and a quick wolf must stay a quick wolf. So a mob's aptitudes
 * reproduce exactly the formulas the shipped stats used, which keeps every existing encounter's
 * pacing untouched: without this, every creature in the game sits at a flat 1.0 and low-agility
 * beasts silently get BETTER at landing blows.
 */
export function creatureAptitudes(stats: {
  brawn?: number;
  agility?: number;
  awareness?: number;
}): Aptitudes {
  const agility = stats.agility ?? 10;
  const brawn = stats.brawn ?? 10;
  const awareness = stats.awareness ?? 10;
  return {
    hit_chance: 1 + (agility - 10) * 0.03,
    attack_speed: 1 + (agility - 10) * 0.03,
    hit_precision: 1 + ((agility - 10) * 0.005 + (awareness - 10) * 0.0025) / 0.05,
    armor_damage: 1 + (brawn - 10) * 0.02,
    dodge: 1 + (agility - 10) * 0.02,
    aim_accuracy: 1 + (awareness - 10) * 0.04
  };
}

/** The APT formula token for `statId` on this entity. 1.0 when unrolled — old saves are neutral. */
export function aptitudeOf(entity: { aptitudes?: Aptitudes }, statId: string): number {
  return entity.aptitudes?.[statId as AptitudeId] ?? 1;
}

export const isAptitudeStat = (statId: string): statId is AptitudeId =>
  (APTITUDE_IDS as readonly string[]).includes(statId);
