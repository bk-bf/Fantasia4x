import traitDbData from '../../database/pawns/traits.json';
import { rng } from '../util/rng';
import { recomputeWound } from './wounds';
import type { Pawn, Trait } from '../types';
import type { LineagePath } from '../types/culture';

interface LineageDef {
  id: string;
  name: string;
  parent: string;
  description: string;
}
interface AwakeningDef {
  id: string;
  lineage: string;
  deed: string;
  range: [number, number];
  label: string;
}

const ALL_TRAITS: Trait[] = traitDbData as unknown as Trait[];
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
const PARENT_TRAIT_IDS = new Set(LINEAGE_DEFS.map((l) => l.parent));

export function lineageDef(id: string): LineageDef | undefined {
  return LINEAGE_BY_ID.get(id);
}
export function awakeningLabel(conditionId: string): string | undefined {
  return AWAKENING_BY_ID.get(conditionId)?.label;
}

export function getTraitById(id: string): Trait | undefined {
  return TRAIT_BY_ID.get(id);
}

const FLAW_POOL: Trait[] = [
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

export function rollLineageTrait(pawn: Pawn, rand: () => number, pool?: string[]): Trait[] {
  const existing = pawnLineage(pawn);
  if (existing) {
    const next = gainableMembers(pawn, existing)[0];
    return next ? [next] : [];
  }
  const owned = new Set((pawn.traits ?? []).map((t) => t.id));
  const candidates = lineageParentTraits().filter(
    (t) => !owned.has(t.id) && (!pool?.length || pool.includes(t.lineageParent as string))
  );
  if (!candidates.length) return [];
  const parent = candidates[Math.floor(rand() * candidates.length)];
  const first = gainableMembers(pawn, parent.lineageParent as string)[0];
  return first ? [parent, first] : [parent];
}

export function rollFlawTrait(rand: () => number): Trait | undefined {
  if (FLAW_POOL.length === 0) return undefined;
  return FLAW_POOL[Math.floor(rand() * FLAW_POOL.length) % FLAW_POOL.length];
}

const HARSH_FLAWS = ['frail', 'clumsy', 'feral-manner', 'wild-swinging', 'sluggard'];
const MILD_FLAWS = ['nearsighted', 'flat-footed', 'short-winded', 'slow-mending', 'night-blind'];
function pickFlaw(ids: string[], rand: () => number): Trait | undefined {
  const pool = ids.map((id) => TRAIT_BY_ID.get(id)).filter((t): t is Trait => !!t);
  return pool.length ? pool[Math.floor(rand() * pool.length) % pool.length] : rollFlawTrait(rand);
}

export interface TraitGambleSpec {
  tier: number;
  traitPool: string[];
  flawSeverity?: 'mild' | 'harsh';
}

export function resolveTraitGamble(
  spec: TraitGambleSpec,
  alchemy01: number,
  rand: () => number
): { trait?: Trait; flaw?: Trait } {
  const t = Math.max(1, Math.min(3, Math.round(spec.tier)));
  const a = Math.max(0, Math.min(1, alchemy01));
  const goodBase = [0.05, 0.2, 0.4][t - 1];
  const badBase = [0.6, 0.35, 0.15][t - 1];
  const good = Math.min(0.85, goodBase + a * 0.25);
  const bad = Math.max(0.05, badBase - a * 0.25);
  const r = rand();
  const outcome = r < bad ? 'bad' : r < 1 - good ? 'mixed' : 'good';

  let trait: Trait | undefined;
  if (outcome !== 'bad' && spec.traitPool.length) {
    const skew = 1 / (1 + t * 0.4 + a);
    const idx = Math.min(
      spec.traitPool.length - 1,
      Math.floor(Math.pow(rand(), skew) * spec.traitPool.length)
    );
    trait = TRAIT_BY_ID.get(spec.traitPool[idx]);
  }
  const flaw =
    outcome === 'good'
      ? undefined
      : pickFlaw(spec.flawSeverity === 'mild' ? MILD_FLAWS : HARSH_FLAWS, rand);
  return { trait, flaw };
}
export function pawnLineage(pawn: Pawn): string | undefined {
  for (const t of pawn.traits ?? [])
    if (t.id && PARENT_TRAIT_IDS.has(t.id)) return LINEAGE_DEFS.find((l) => l.parent === t.id)?.id;
  return undefined;
}

const EVOLVE_CHANCE = 0.1;
const GROW_CHANCE = 0.1;
const DECAY_GRACE_DAYS = 3;
const DECAY_PER_DAY = 0.5;

export function seedAwakeningPaths(pawn: Pawn, dayIndex = 0): void {
  if (pawnLineage(pawn)) return;
  const paths: LineagePath[] = [];
  const seededLineages = new Set<string>();
  for (const t of pawn.traits ?? []) {
    if (t.lineageExclusive !== false || !t.awakens?.length) continue;
    const byLineage = new Map<string, AwakeningDef[]>();
    for (const condId of t.awakens) {
      const a = AWAKENING_BY_ID.get(condId);
      if (!a || seededLineages.has(a.lineage)) continue;
      (byLineage.get(a.lineage) ?? byLineage.set(a.lineage, []).get(a.lineage)!).push(a);
    }
    for (const [lineage, pool] of byLineage) {
      const a = pool[rng.int(0, pool.length - 1)];
      const target = a.range[0] + Math.round(rng.random() * (a.range[1] - a.range[0]));
      seededLineages.add(lineage);
      paths.push({
        condition: a.id,
        lineage,
        deed: a.deed,
        target,
        value: 0,
        seen: 0,
        lastFedDay: dayIndex
      });
    }
  }
  if (paths.length) pawn.lineagePaths = paths;
}

export function advanceAwakeningMeters(pawn: Pawn, dayIndex: number): void {
  const paths = pawn.lineagePaths;
  if (!paths?.length) return;
  for (const p of paths) {
    if (p.value >= p.target) continue;
    const now = pawn.deeds?.[p.deed] ?? 0;
    const fresh = now - p.seen;
    if (fresh > 0) {
      p.value = Math.min(p.target, p.value + fresh);
      p.seen = now;
      p.lastFedDay = dayIndex;
    } else if (dayIndex - p.lastFedDay > DECAY_GRACE_DAYS) {
      p.value = Math.max(0, p.value - DECAY_PER_DAY);
    }
  }
}

function gainableMembers(pawn: Pawn, lineage: string): Trait[] {
  const owned = new Set((pawn.traits ?? []).map((t) => t.id).filter(Boolean) as string[]);
  const ownedGroups = new Set(
    (pawn.traits ?? []).map((t) => t.conflictGroup).filter(Boolean) as string[]
  );
  return ALL_TRAITS.filter((t) => {
    if (!t.id || owned.has(t.id) || !t.lineage?.includes(lineage)) return false;
    if (t.lineageParent) return false;
    if (t.conflictGroup && ownedGroups.has(t.conflictGroup)) return false;
    if (t.stage && t.stage > 1) return false;
    return true;
  });
}

export function feedOnVictim(feeder: Pawn, victim: Pawn, turn: number): void {
  const limb = victim.limbs?.find((l) => l.parts?.some((p) => p.id === 'neck'));
  const part = limb?.parts?.find((p) => p.id === 'neck');
  if (part && !part.isMissing) {
    const existing = part.injuries.find((w) => w.type === 'puncture' && !w.permanent);
    const accum = Math.min((existing?.damage ?? 0) + 2, part.maxHp);
    const wound = recomputeWound('neck', 'puncture', accum, existing, turn, part.maxHp);
    if (existing) Object.assign(existing, wound);
    else part.injuries.push(wound);
    part.health = Math.max(0, part.health - 2);
    limb!.bleedRate = (limb!.parts ?? []).reduce(
      (s, p) => s + p.injuries.reduce((a, w) => a + w.bleeding, 0),
      0
    );
    victim.injuries = (victim.limbs ?? []).flatMap((l) => l.parts ?? []).flatMap((p) => p.injuries);
  }
  const maxBV = victim.maxBloodVolume ?? 100;
  victim.bloodVolume = Math.max(15, (victim.bloodVolume ?? maxBV) - 12);
  sateBloodHunger(feeder);
}

export function sateBloodHunger(pawn: Pawn): void {
  if (pawn.needs) pawn.needs.bloodHunger = 0;
  if (pawn.conditionTimers?.bloodthirst) delete pawn.conditionTimers.bloodthirst;
}

export interface LineageGrowthResult {
  kind: 'awaken' | 'evolve' | 'grow' | 'none';
  lineage?: string;
  added: string[];
  removed?: string;
}

export function lineageGrowthEvent(
  pawn: Pawn,
  applyTrait: (t: Trait) => void
): LineageGrowthResult {
  const full = pawn.lineagePaths?.find((p) => p.value >= p.target);
  if (full && !pawnLineage(pawn)) {
    const parentId = LINEAGE_BY_ID.get(full.lineage)?.parent;
    const parent = parentId ? TRAIT_BY_ID.get(parentId) : undefined;
    if (parent) {
      const added: string[] = [];
      (pawn.traits ??= []).push(parent);
      applyTrait(parent);
      added.push(parent.id as string);
      const first = gainableMembers(pawn, full.lineage)[0];
      if (first) {
        pawn.traits.push(first);
        applyTrait(first);
        added.push(first.id as string);
      }
      pawn.lineagePaths = undefined;
      return { kind: 'awaken', lineage: full.lineage, added };
    }
  }

  if (rng.random() < EVOLVE_CHANCE) {
    const staged = (pawn.traits ?? []).find((t) => t.evolvesTo && TRAIT_BY_ID.has(t.evolvesTo));
    if (staged) {
      const next = TRAIT_BY_ID.get(staged.evolvesTo as string) as Trait;
      pawn.traits = (pawn.traits ?? []).filter((t) => t !== staged);
      pawn.traits.push(next);
      applyTrait(next);
      return { kind: 'evolve', added: [next.id as string], removed: staged.id };
    }
  }

  const lineage = pawnLineage(pawn);
  if (lineage && rng.random() < GROW_CHANCE) {
    const pool = gainableMembers(pawn, lineage);
    if (pool.length) {
      const t = pool[rng.int(0, pool.length - 1)];
      (pawn.traits ??= []).push(t);
      applyTrait(t);
      return { kind: 'grow', lineage, added: [t.id as string] };
    }
  }

  return { kind: 'none', added: [] };
}
