import { WORK_CATEGORIES } from '$lib/game/core/defs/work';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import { jobService } from '$lib/game/services/JobService';
import type { LaborLevel, Pawn, WorkAssignment } from '$lib/game/core/types';
import {
  ABBR,
  NON_SKILL_TASKS,
  getPawnLaborLevel,
  rankWorkCells,
  type CellRank
} from '$lib/components/util/workUtils';

export const TOP_CATEGORIES = WORK_CATEGORIES.filter((wc) => !jobService.isCraftSubjob(wc.id));

const SUBJOBS: Record<string, { id: string; label: string }[]> = Object.fromEntries(
  TOP_CATEGORIES.map((wc) => [wc.id, jobService.getSubjobsForCategory(wc.id)])
);

export type Col =
  | { kind: 'cat'; catId: string; name: string; abbr: string; splittable: boolean }
  | { kind: 'sub'; catId: string; subId: string; label: string; abbr: string };

export function workColumns(expanded: string[]): Col[] {
  const cols: Col[] = [];
  for (const wc of TOP_CATEGORIES) {
    const subs = SUBJOBS[wc.id];
    cols.push({
      kind: 'cat',
      catId: wc.id,
      name: wc.name,
      abbr: ABBR[wc.id] ?? wc.id.slice(0, 3).toUpperCase(),
      splittable: subs.length > 0
    });
    if (subs.length > 0 && expanded.includes(wc.id))
      for (const sj of subs)
        cols.push({
          kind: 'sub',
          catId: wc.id,
          subId: sj.id,
          label: sj.label,
          abbr: sj.label.slice(0, 3).toUpperCase()
        });
  }
  return cols;
}

export function subjobLevel(
  a: WorkAssignment | undefined,
  catId: string,
  subId: string
): { level: LaborLevel; inherited: boolean } {
  const ls = a?.laborSettings;
  if (ls && subId in ls) return { level: ls[subId] as LaborLevel, inherited: false };
  return { level: getPawnLaborLevel(a, catId), inherited: true };
}

export type WorkMods = { speed: number; yield: number | null; quality: number | null };
const throughput = (m: WorkMods) => m.speed * (m.yield ?? 1) * (m.quality ?? 1);

export function workMods(pawns: Pawn[]): Record<string, Record<string, WorkMods>> {
  const map: Record<string, Record<string, WorkMods>> = {};
  for (const pawn of pawns) {
    const row: Record<string, WorkMods> = {};
    for (const wc of TOP_CATEGORIES) {
      const subs = SUBJOBS[wc.id];
      for (const sj of subs)
        row[sj.id] = pawnStatService.getWorkModifiers(pawn, sj.id, undefined, wc.id);
      row[wc.id] =
        subs.length && jobService.isGroupingParent(wc.id)
          ? subs.reduce(
              (best, sj) => (throughput(row[sj.id]) > throughput(best) ? row[sj.id] : best),
              row[subs[0].id]
            )
          : pawnStatService.getWorkModifiers(pawn, wc.id);
    }
    map[pawn.id] = row;
  }
  return map;
}

export function workRanks(
  pawns: Pawn[],
  mods: Record<string, Record<string, WorkMods>>
): Record<string, Record<string, CellRank>> {
  const map: Record<string, Record<string, CellRank>> = {};
  for (const pawn of pawns) {
    const eff: Record<string, number> = {};
    for (const wc of TOP_CATEGORIES) {
      if (wc.id in NON_SKILL_TASKS) continue;
      const m = mods[pawn.id]?.[wc.id];
      eff[wc.id] = m ? throughput(m) : 0;
    }
    const ranked = rankWorkCells(eff);
    for (const id of Object.keys(NON_SKILL_TASKS)) ranked[id] = { best: -1, worst: -1 };
    map[pawn.id] = ranked;
  }
  return map;
}
