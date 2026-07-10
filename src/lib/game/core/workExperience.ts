// WORK-EXPERIENCE — per-pawn work experience levels (1–50) as the BASE driver of the
// `*_speed`/`*_yield`/`*_quality` work stats, replacing the old core-stat-linear base (which blew
// past Legendary once stats could grow to 100). Core stats remain only a small tertiary supplement
// inside the stats.jsonc formulas (STR+DEX → speed, INT+PER → yield, all four → quality).
//
// The pieces:
//  - `pawn.skills[category]` — experience LEVEL 1–50 per work category (crafting, cooking, …),
//    seeded at pawn-gen by `seedWorkLevels` (bell-curve, 0–2 favoured "talent" categories — a fork
//    of `rollGrowthProfile`'s approach) and raised by doing (JobService grants XP on completion).
//  - `pawn.skillXp[category]` — XP progress within the CURRENT level (see `applyWorkXp`).
//  - `pawn.workStyle` — innate speed↔finesse spectrum, fixed at generation: most pawns trade one
//    off against the other; the rare near-balanced roll is good at BOTH (the prized all-rounder).
//  - `levelBase(level) × style weight` reaches the formulas as the `SKILL` token
//    (PawnStatService.getWorkModifiers / evaluateStat).
import type { Pawn } from './types';
import { WORK_CATEGORIES } from './Work';
import { rng } from './rng';

export const MAX_WORK_LEVEL = 50;

/** Level whose `levelBase` ≈ 1.0 — used for entities with no seeded skills (mobs, minimal test
 *  fixtures), so their work modifiers stay neutral rather than novice-crippled. */
export const NEUTRAL_WORK_LEVEL = 25;

/** Work categories that carry an experience level. Hunting is excluded — it resolves as combat,
 *  so combat stats (not a work skill) decide it. */
export const SKILL_CATEGORIES: readonly string[] = WORK_CATEGORIES.filter(
  (c) => c.id !== 'hunting'
).map((c) => c.id);

/** Subjob stat prefix → the parent category whose skill LEVEL it trains and reads (mirrors the
 *  per-axis stats.jsonc fallback: a repair runs at `repair_speed` but on the construction skill). */
const SUBJOB_SKILL_PARENT: Record<string, string> = {
  repair: 'construction',
  deconstruct: 'construction',
  refuel: 'construction',
  fetch: 'hauling'
};

/** The skill category behind a work-stat prefix (`repair` → `construction`, `crafting` → itself). */
export function workSkillCategory(statPrefix: string): string {
  return SUBJOB_SKILL_PARENT[statPrefix] ?? statPrefix;
}

/**
 * Level → the base work multiplier (the heart of the `SKILL` token). Piecewise linear:
 * 1 → 0.6 (fumbling novice), 25 → 1.0 (competent), 50 → 2.0 (master). The whole 0.6–2.0 spread is
 * what the old stat formulas produced across DEX 10–30 — now it's EARNED per category instead.
 */
export function levelBase(level: number): number {
  const L = Math.max(1, Math.min(MAX_WORK_LEVEL, level));
  return L <= 25 ? 0.6 + ((L - 1) / 24) * 0.4 : 1.0 + (L - 25) / 25;
}

// Style spectrum tuning: ±25% tilt between the speed and finesse (yield/quality) axes, plus a
// small "all-rounder" bonus to BOTH that peaks at style 0 — so the rare balanced pawn is genuinely
// good at both, not merely mediocre at both.
const STYLE_TILT = 0.25;
const STYLE_BALANCE_BONUS = 0.1;

/** Speed-axis weight for a pawn's work style. `undefined` (mobs / pre-WORK-EXPERIENCE fixtures) is
 *  exactly neutral. style −1 → 1.25 (fast but rough), +1 → 0.75, 0 → 1.1 (all-rounder). */
export function styleSpeedWeight(style: number | undefined): number {
  if (style === undefined) return 1;
  return 1 - STYLE_TILT * style + STYLE_BALANCE_BONUS * (1 - Math.abs(style));
}

/** Finesse-axis (yield + quality) weight — the mirror of `styleSpeedWeight`:
 *  style +1 → 1.25 (slow but fine), −1 → 0.75, 0 → 1.1. */
export function styleFinesseWeight(style: number | undefined): number {
  if (style === undefined) return 1;
  return 1 + STYLE_TILT * style + STYLE_BALANCE_BONUS * (1 - Math.abs(style));
}

/** Roll a pawn's innate work style ∈ [−1, 1]. The uniform roll is pushed toward the extremes
 *  (sign(u)·√|u|), so committed speed- or finesse-leaning pawns are the norm and near-balanced
 *  all-rounders are the rare prize (|style| < 0.32 ≈ 10% of pawns). */
export function rollWorkStyle(): number {
  const u = rng.random() * 2 - 1;
  return Math.round(Math.sign(u) * Math.sqrt(Math.abs(u)) * 100) / 100;
}

/**
 * Seed a fresh pawn's per-category experience levels — the WORK-EXPERIENCE fork of
 * `rollGrowthProfile`: a bell-curve roll keeps a green colony genuinely unskilled (most categories
 * land 1–9, no floor), while 0–2 favoured "talent" categories start noticeably ahead (up to ~23).
 */
export function seedWorkLevels(): Record<string, number> {
  const favCount = rng.int(0, 2);
  const favs = new Set<string>();
  let guard = 0;
  while (favs.size < favCount && guard++ < 20) favs.add(rng.pick([...SKILL_CATEGORIES]));
  const skills: Record<string, number> = {};
  for (const cat of SKILL_CATEGORIES) {
    const bell = (rng.random() + rng.random()) / 2; // sum-of-2 ≈ triangular: mid levels common, edges rare
    let level = 1 + Math.round(bell * 8); // 1–9, most around 4–6
    if (favs.has(cat)) level += 5 + rng.int(0, 9); // a talent starts well ahead (up to ~23)
    skills[cat] = Math.min(MAX_WORK_LEVEL, level);
  }
  return skills;
}

/** XP needed to advance FROM `level` to the next one. Early levels come in a job or two; the last
 *  stretch to 50 takes a working lifetime (~60k XP total at ~work-seconds per completed job). */
export function xpToNext(level: number): number {
  return Math.round(40 + 12 * Math.pow(level, 1.4));
}

/** XP a completed job teaches — its authored work amount (≈ seconds of work at speed 1), clamped so
 *  trivial jobs still teach a little and monuments don't grant a whole level at once. */
export function workXpForJob(workRequired: number): number {
  return Math.max(4, Math.min(300, Math.round(workRequired)));
}

/**
 * Grant `xp` toward `category`, returning a NEW pawn with updated `skills`/`skillXp` (immutable —
 * job completion is on the command-ish path, not per-tick). Returns null when nothing changes
 * (already at MAX_WORK_LEVEL), so the caller can skip the state churn.
 */
export function applyWorkXp(pawn: Pawn, category: string, xp: number): Pawn | null {
  let level = pawn.skills?.[category] ?? 1;
  if (level >= MAX_WORK_LEVEL) return null;
  let progress = (pawn.skillXp?.[category] ?? 0) + xp;
  while (level < MAX_WORK_LEVEL && progress >= xpToNext(level)) {
    progress -= xpToNext(level);
    level++;
  }
  if (level >= MAX_WORK_LEVEL) progress = 0;
  return {
    ...pawn,
    skills: { ...pawn.skills, [category]: level },
    skillXp: { ...pawn.skillXp, [category]: progress }
  };
}

/** Save migration: pawns from pre-WORK-EXPERIENCE saves have an empty `skills` map and no
 *  `workStyle` — seed both in place (runs once at load, before the state reaches the store). */
export function ensureWorkSkills(pawns: Pawn[]): void {
  for (const p of pawns) {
    if (!p.skills || Object.keys(p.skills).length === 0) p.skills = seedWorkLevels();
    if (p.workStyle === undefined) p.workStyle = rollWorkStyle();
  }
}
