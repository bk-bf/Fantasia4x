// The craft DISCIPLINE tree, parsed once from jobs.jsonc `disciplines`. A pure leaf module (data
// only — no service imports) so JobService, craftDiscipline, workExperience and the Work tab can all
// share ONE source of truth without an import cycle. See jobs.jsonc for the authoring contract.
//
// A craft runs through the single `craft` job handler; this module answers "which discipline is this
// craft?" (the LEAF — leatherworking / butchery / lapidary…) and "under which Work-tab parent does it
// sit?" (tailoring / cooking / stoneworking…). A flat discipline (metalworking) is its own parent.
import jobsData from '../../database/pawns/jobs.jsonc';
import type { DisciplineDef, JobDef } from '../../core/types';

// The discipline tree hangs off the single `craft` verb in jobs.jsonc.
const DISCIPLINES: DisciplineDef[] =
  (jobsData as unknown as JobDef[]).find((j) => j.id === 'craft')?.disciplines ?? [];

/** All parent categories in the tree (tailoring, stoneworking, cooking, alchemy, metalworking…). */
export const DISCIPLINE_PARENTS: string[] = DISCIPLINES.map((d) => d.id);
/** Every leaf discipline id (leatherworking, weaving, knapping, butchery, …). Flat disciplines excluded. */
export const DISCIPLINE_LEAVES = new Set<string>();
/** leaf id → parent category id. */
const PARENT_OF = new Map<string, string>();
/** parent id → ordered leaf ids (empty for a flat discipline). */
const LEAVES_OF = new Map<string, string[]>();
/** any discipline id (parent or leaf) → its display label. */
export const DISCIPLINE_LABEL = new Map<string, string>();

interface StationMatch {
  id: string;
  flags: string[];
  foodOutput: boolean;
}
// Ordered by tree declaration; the resolver takes the first flag match (food-output is the fallback).
const STATION_MATCHES: StationMatch[] = [];
function pushMatch(d: DisciplineDef) {
  if (!d.station) return;
  if (d.station === 'foodOutput') STATION_MATCHES.push({ id: d.id, flags: [], foodOutput: true });
  else STATION_MATCHES.push({ id: d.id, flags: d.station.split('|'), foodOutput: false });
}

for (const d of DISCIPLINES) {
  DISCIPLINE_LABEL.set(d.id, d.label);
  if (d.subjobs?.length) {
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
    pushMatch(d); // flat discipline routes by its own flags
  }
}

/** The Work-tab parent of a discipline id: a leaf → its parent; a flat/parent discipline → itself. */
export function disciplineParent(id: string): string {
  return PARENT_OF.get(id) ?? id;
}

/** The ordered leaf ids of a parent category (empty if it doesn't split). */
export function disciplineLeaves(parentId: string): string[] {
  return LEAVES_OF.get(parentId) ?? [];
}

/** Is this id a known discipline (parent or leaf)? */
export function isDiscipline(id: string): boolean {
  return DISCIPLINE_LABEL.has(id);
}

/**
 * Resolve the LEAF discipline for a craft, from its station's effect flags + tool workType + whether
 * its output is food. Specific station flags win; a plain food output falls back to the `meals` leaf;
 * an unmatched station is a generic `crafting` order (undefined here). Mirrors the historical
 * capability-flag routing, refined to leaves.
 */
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
