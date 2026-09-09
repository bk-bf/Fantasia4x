import traitDbData from '../../database/pawns/traits.json';
import type { Trait } from '../types';

export interface LineageDef {
  id: string;
  name: string;
  parent: string;
  description: string;
}
export interface AwakeningDef {
  id: string;
  lineage: string;
  deed: string;
  range: [number, number];
  label: string;
}

export const ALL_TRAITS: Trait[] = traitDbData as unknown as Trait[];
const TRAIT_BY_ID = new Map(ALL_TRAITS.filter((t) => t.id).map((t) => [t.id as string, t]));

export const LINEAGE_DEFS: LineageDef[] = ALL_TRAITS.filter((t) => t.lineageParent).map((t) => ({
  id: t.lineageParent as string,
  name: t.lineageName ?? (t.lineageParent as string),
  parent: t.id as string,
  description: t.lineageDescription ?? ''
}));
export const AWAKENING_DEFS: AwakeningDef[] = ALL_TRAITS.flatMap((t) =>
  t.lineageParent && t.awakenDefs
    ? t.awakenDefs.map((a) => ({ ...a, lineage: t.lineageParent as string }))
    : []
);

const LINEAGE_BY_ID = new Map(LINEAGE_DEFS.map((l) => [l.id, l]));
const AWAKENING_BY_ID = new Map(AWAKENING_DEFS.map((a) => [a.id, a]));
export const PARENT_TRAIT_IDS = new Set(LINEAGE_DEFS.map((l) => l.parent));

export function lineageDef(id: string): LineageDef | undefined {
  return LINEAGE_BY_ID.get(id);
}
export function awakeningLabel(conditionId: string): string | undefined {
  return AWAKENING_BY_ID.get(conditionId)?.label;
}
export function awakeningDef(conditionId: string): AwakeningDef | undefined {
  return AWAKENING_BY_ID.get(conditionId);
}

export function getTraitById(id: string): Trait | undefined {
  return TRAIT_BY_ID.get(id);
}

export const FLAW_POOL: Trait[] = [
  'feral-manner',
  'wild-swinging',
  'clumsy',
  'nearsighted',
  'flat-footed',
  'sluggard',
  'short-winded',
  'slow-mending',
  'night-blind',
  'frail'
]
  .map((id) => TRAIT_BY_ID.get(id))
  .filter((t): t is Trait => !!t);

export function lineageParentTraits(): Trait[] {
  return ALL_TRAITS.filter((t) => t.lineageParent);
}
