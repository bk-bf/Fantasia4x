import type { Pawn } from '../../types';
import { WORK_CATEGORIES } from '../../defs/work';
import { rng } from '../../util/rng';
import { DISCIPLINE_LEAVES, DISCIPLINE_SPLIT_PARENTS } from '../../defs/disciplines';

export const MAX_WORK_LEVEL = 50;

export const NEUTRAL_WORK_LEVEL = 25;

export const NON_SKILL_CATEGORIES = new Set(['hunting', 'hauling']);

export const SKILL_CATEGORIES: readonly string[] = [
  ...new Set([
    ...WORK_CATEGORIES.filter(
      (c) => !NON_SKILL_CATEGORIES.has(c.id) && !DISCIPLINE_SPLIT_PARENTS.has(c.id)
    ).map((c) => c.id),
    ...DISCIPLINE_LEAVES
  ])
];

const SUBJOB_SKILL_PARENT: Record<string, string> = {
  repair: 'construction',
  deconstruct: 'construction',
  refuel: 'construction'
};

export function workSkillCategory(statPrefix: string): string {
  return SUBJOB_SKILL_PARENT[statPrefix] ?? statPrefix;
}

export function levelBase(level: number): number {
  const L = Math.max(1, Math.min(MAX_WORK_LEVEL, level));
  return L <= 25 ? 0.6 + ((L - 1) / 24) * 0.4 : 1.0 + (L - 25) / 25;
}

const STYLE_TILT = 0.25;
const STYLE_BALANCE_BONUS = 0.1;

export function styleSpeedWeight(style: number | undefined): number {
  if (style === undefined) return 1;
  return 1 - STYLE_TILT * style + STYLE_BALANCE_BONUS * (1 - Math.abs(style));
}

export function styleFinesseWeight(style: number | undefined): number {
  if (style === undefined) return 1;
  return 1 + STYLE_TILT * style + STYLE_BALANCE_BONUS * (1 - Math.abs(style));
}

export function rollWorkStyle(): number {
  const u = rng.random() * 2 - 1;
  return Math.round(Math.sign(u) * Math.sqrt(Math.abs(u)) * 100) / 100;
}

export function seedWorkLevels(): Record<string, number> {
  const favCount = rng.int(0, 2);
  const favs = new Set<string>();
  let guard = 0;
  while (favs.size < favCount && guard++ < 20) favs.add(rng.pick([...SKILL_CATEGORIES]));
  const skills: Record<string, number> = {};
  for (const cat of SKILL_CATEGORIES) {
    const bell = (rng.random() + rng.random()) / 2;
    let level = 1 + Math.round(bell * 8);
    if (favs.has(cat)) level += 5 + rng.int(0, 9);
    skills[cat] = Math.min(MAX_WORK_LEVEL, level);
  }
  return skills;
}

export function xpToNext(level: number): number {
  return Math.round(40 + 12 * Math.pow(level, 1.4));
}

export function workXpForJob(workRequired: number): number {
  return Math.max(4, Math.min(300, Math.round(workRequired)));
}

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

export function ensureWorkSkills(pawns: Pawn[]): void {
  for (const p of pawns) {
    if (!p.skills || Object.keys(p.skills).length === 0) p.skills = seedWorkLevels();
    if (p.workStyle === undefined) p.workStyle = rollWorkStyle();
  }
}
