import jobsData from '../../database/pawns/jobs.json';
import type { DisciplineDef, JobDef } from '../types';

const DISCIPLINES: DisciplineDef[] =
  (jobsData as unknown as JobDef[]).find((j) => j.id === 'craft')?.disciplines ?? [];

export const DISCIPLINE_PARENTS: string[] = DISCIPLINES.map((d) => d.id);
export const DISCIPLINE_LEAVES = new Set<string>();
export const DISCIPLINE_SPLIT_PARENTS = new Set<string>();
const PARENT_OF = new Map<string, string>();
const LEAVES_OF = new Map<string, string[]>();
export const DISCIPLINE_LABEL = new Map<string, string>();

interface StationMatch {
  id: string;
  flags: string[];
  foodOutput: boolean;
}
const STATION_MATCHES: StationMatch[] = [];
function pushMatch(d: DisciplineDef) {
  if (!d.station) return;
  if (d.station === 'foodOutput') STATION_MATCHES.push({ id: d.id, flags: [], foodOutput: true });
  else STATION_MATCHES.push({ id: d.id, flags: d.station.split('|'), foodOutput: false });
}

for (const d of DISCIPLINES) {
  DISCIPLINE_LABEL.set(d.id, d.label);
  if (d.subjobs?.length) {
    DISCIPLINE_SPLIT_PARENTS.add(d.id);
    LEAVES_OF.set(
      d.id,
      d.subjobs.map((s) => s.id)
    );
    for (const s of d.subjobs) {
      DISCIPLINE_LABEL.set(s.id, s.label);
      PARENT_OF.set(s.id, d.id);
      DISCIPLINE_LEAVES.add(s.id);
      pushMatch(s);
    }
  } else {
    LEAVES_OF.set(d.id, []);
    pushMatch(d);
  }
}

export function disciplineParent(id: string): string {
  return PARENT_OF.get(id) ?? id;
}

export function disciplineLeaves(parentId: string): string[] {
  return LEAVES_OF.get(parentId) ?? [];
}

export function isDiscipline(id: string): boolean {
  return DISCIPLINE_LABEL.has(id);
}

export function resolveDiscipline(opts: {
  effects: Record<string, number>;
  toolWorkType?: string;
  isFood: boolean;
}): string | undefined {
  if (opts.toolWorkType && isDiscipline(opts.toolWorkType)) return opts.toolWorkType;
  for (const m of STATION_MATCHES) {
    if (m.foodOutput) continue;
    if (m.flags.some((f) => opts.effects[f])) return m.id;
  }
  if (opts.isFood) return STATION_MATCHES.find((m) => m.foodOutput)?.id ?? 'meals';
  return undefined;
}
