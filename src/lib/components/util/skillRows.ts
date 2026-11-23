import type { LaborLevel, Pawn, WorkAssignment, WorkCategory } from '$lib/game/core/types';
import { WORK_CATEGORIES } from '$lib/game/core/defs/work';
import { disciplineParent } from '$lib/game/core/defs/disciplines';
import { MAX_WORK_LEVEL, xpToNext } from '$lib/game/core/rules/body/workExperience';
import { getPawnLaborLevel, type CellRank } from '$lib/components/util/workUtils';
import {
  subjobLevel,
  workMods,
  workRanks,
  type WorkMods
} from '$lib/components/screens/work/workGrid';

export const SKILL_GROUPS: readonly { label: string; skills: readonly string[] }[] = [
  { label: 'Woodcutting', skills: ['woodcutting'] },
  { label: 'Foraging', skills: ['foraging', 'fishing'] },
  { label: 'Mining', skills: ['mining', 'digging'] },
  { label: 'Farming', skills: ['planting'] },
  { label: 'Building', skills: ['construction'] },
  { label: 'Cooking', skills: ['meals', 'butchery', 'baking', 'brewing'] },
  { label: 'Crafting', skills: ['metalworking', 'woodworking', 'pottery'] },
  { label: 'Stoneworking', skills: ['knapping', 'masonry', 'lapidary', 'bonecarving'] },
  { label: 'Tailoring', skills: ['leatherworking', 'weaving'] },
  { label: 'Alchemy', skills: ['herbalism', 'potions'] },
  { label: 'Caretaking', skills: ['caretaking'] },
  { label: 'Research', skills: ['research'] }
];

const CATEGORY = new Map(WORK_CATEGORIES.map((c) => [c.id, c]));

export interface SkillCell {
  id: string;
  name: string;
  level: number;
  frac: number;
  xp: number;
  need: number;
  wc: WorkCategory;
  mods: WorkMods;
  rank: CellRank;
  priority: LaborLevel;
}

export interface SkillRow {
  label: string;
  level: number;
  frac: number;
  stars: number;
  best: SkillCell;
  kids: SkillCell[];
}

const throughput = (m: WorkMods) => m.speed * (m.yield ?? 1) * (m.quality ?? 1);

function priorityOf(a: WorkAssignment | undefined, id: string): LaborLevel {
  const parent = disciplineParent(id);
  return parent === id ? getPawnLaborLevel(a, id) : subjobLevel(a, parent, id).level;
}

export function skillCell(
  pawn: Pawn,
  id: string,
  mods: Record<string, WorkMods>,
  ranks: Record<string, CellRank>,
  assignment: WorkAssignment | undefined
): SkillCell | null {
  const wc = CATEGORY.get(id);
  const m = mods[id];
  if (!wc || !m) return null;
  const level = pawn.skills?.[id] ?? 1;
  const mastered = level >= MAX_WORK_LEVEL;
  const xp = Math.floor(pawn.skillXp?.[id] ?? 0);
  const need = mastered ? 0 : xpToNext(level);
  return {
    id,
    name: wc.name,
    level,
    frac: mastered ? 1 : Math.min(1, xp / need),
    xp,
    need,
    wc,
    mods: m,
    rank: ranks[disciplineParent(id)] ?? { best: -1, worst: -1 },
    priority: priorityOf(assignment, id)
  };
}

export function pawnWorkTables(pawn: Pawn) {
  const mods = workMods([pawn])[pawn.id] ?? {};
  const ranks = workRanks([pawn], { [pawn.id]: mods })[pawn.id] ?? {};
  return { mods, ranks };
}

export function skillRows(pawn: Pawn, assignment: WorkAssignment | undefined): SkillRow[] {
  const { mods, ranks } = pawnWorkTables(pawn);
  const rows: SkillRow[] = [];
  for (const g of SKILL_GROUPS) {
    const kids = g.skills
      .map((id) => skillCell(pawn, id, mods, ranks, assignment))
      .filter((c): c is SkillCell => c !== null);
    if (!kids.length) continue;
    const best = kids.reduce((a, b) =>
      b.level > a.level || (b.level === a.level && throughput(b.mods) > throughput(a.mods)) ? b : a
    );
    const topRank = Math.min(...kids.map((k) => (k.rank.best >= 0 ? k.rank.best : 3)));
    rows.push({
      label: g.label,
      level: best.level,
      frac: best.frac,
      stars: 3 - topRank,
      best,
      kids: kids.length > 1 ? kids : []
    });
  }
  return rows;
}
