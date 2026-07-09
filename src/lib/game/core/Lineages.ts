// Lineages.ts — ancestral-blood mutation trees (LINEAGES spec). Loads lineages.jsonc and drives the
// per-pawn lineage progression that rides the seasonal growth event (PawnGrowthService):
//   • seedAwakeningPaths — at pawn-gen, a standalone gateway trait seeds ≥2 awakening meters (§4).
//   • advanceAwakeningMeters — per DAY: fold fresh deeds into the meters, decay idle ones.
//   • lineageGrowthEvent — at each growth event: AWAKEN (a full meter grants the lineage parent + its
//     first trait), else EVOLVE a staged trait (~10%, prioritised), else GROW a new member (~10%).
// Self-contained: reads its own copy of the trait catalog (no Culture import → no cycle). Trait EFFECTS
// of a newly-granted trait are applied by the caller's `applyTrait` callback (kept out of core→entities).
import lineagesRaw from '../database/lineages.jsonc';
import traitDbData from '../database/traits.jsonc';
import { rng } from './rng';
import type { Pawn, Trait } from './types';
import type { LineagePath } from './types/culture';

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

export const LINEAGE_DEFS: LineageDef[] = (lineagesRaw as { lineages: LineageDef[] }).lineages;
export const AWAKENING_DEFS: AwakeningDef[] = (lineagesRaw as { awakenings: AwakeningDef[] }).awakenings;

const LINEAGE_BY_ID = new Map(LINEAGE_DEFS.map((l) => [l.id, l]));
const AWAKENING_BY_ID = new Map(AWAKENING_DEFS.map((a) => [a.id, a]));
const PARENT_TRAIT_IDS = new Set(LINEAGE_DEFS.map((l) => l.parent));

// Flat trait catalog (top-level + subcaps) keyed by id — the pool lineage growth draws from.
const ALL_TRAITS: Trait[] = (traitDbData as unknown as Trait[]).flatMap((t) => [
  t,
  ...(t.subCapabilities ?? [])
]);
const TRAIT_BY_ID = new Map(ALL_TRAITS.filter((t) => t.id).map((t) => [t.id as string, t]));

export function lineageDef(id: string): LineageDef | undefined {
  return LINEAGE_BY_ID.get(id);
}
export function awakeningLabel(conditionId: string): string | undefined {
  return AWAKENING_BY_ID.get(conditionId)?.label;
}
/** The lineage id whose parent marker this pawn holds, or undefined (not a lineage member). */
export function pawnLineage(pawn: Pawn): string | undefined {
  for (const t of pawn.traits ?? [])
    if (t.id && PARENT_TRAIT_IDS.has(t.id)) return LINEAGE_DEFS.find((l) => l.parent === t.id)?.id;
  return undefined;
}

// ── Tuning (LINEAGES §3/§4) ──────────────────────────────────────────────────
/** Chance per growth event to evolve a staged trait — checked FIRST (prioritised over growing a new one). */
const EVOLVE_CHANCE = 0.1;
/** Chance per growth event to grow a new member trait (only if evolution didn't fire). */
const GROW_CHANCE = 0.1;
/** Days a meter may idle before it starts to decay (a grace window). */
const DECAY_GRACE_DAYS = 3;
/** Meter points lost per idle day past the grace window. */
const DECAY_PER_DAY = 0.5;

/**
 * At pawn-gen: for every STANDALONE gateway trait the pawn carries (`lineageExclusive === false` with
 * `awakens`) — and only while the pawn does NOT already belong to that lineage — seed one awakening meter
 * per candidate condition (≥2 lineages), each with a target rolled in the condition's range.
 */
export function seedAwakeningPaths(pawn: Pawn, dayIndex = 0): void {
  if (pawnLineage(pawn)) return; // already a member — no awakening
  const paths: LineagePath[] = [];
  for (const t of pawn.traits ?? []) {
    if (t.lineageExclusive !== false || !t.awakens?.length) continue;
    for (const condId of t.awakens) {
      const a = AWAKENING_BY_ID.get(condId);
      if (!a) continue;
      const target = a.range[0] + Math.round(rng.random() * (a.range[1] - a.range[0]));
      paths.push({ condition: condId, lineage: a.lineage, deed: a.deed, target, value: 0, seen: 0, lastFedDay: dayIndex });
    }
  }
  if (paths.length) pawn.lineagePaths = paths;
}

/**
 * Per DAY: fold each meter's fresh deeds (deeds since last seen) into `value`, or decay it toward 0 when
 * the deed has stalled past the grace window. Mutates in place (per-day, not per-tick — cheap).
 */
export function advanceAwakeningMeters(pawn: Pawn, dayIndex: number): void {
  const paths = pawn.lineagePaths;
  if (!paths?.length) return;
  for (const p of paths) {
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

/** Traits the pawn could GROW into its lineage: tagged with its lineage, not already owned, and not
 *  conflicting (branch `conflictGroup`, or a base↔evolution pair it already sits on). */
function gainableMembers(pawn: Pawn, lineage: string): Trait[] {
  const owned = new Set((pawn.traits ?? []).map((t) => t.id).filter(Boolean) as string[]);
  const ownedGroups = new Set(
    (pawn.traits ?? []).map((t) => t.conflictGroup).filter(Boolean) as string[]
  );
  return ALL_TRAITS.filter((t) => {
    if (!t.id || owned.has(t.id) || !t.lineage?.includes(lineage)) return false;
    if (t.conflictGroup && ownedGroups.has(t.conflictGroup)) return false;
    // Don't grant a stage the pawn already advanced past / hasn't reached: only S1 or unstaged members
    // enter fresh; higher stages are reached by EVOLUTION, not granted outright.
    if (t.stage && t.stage > 1) return false;
    return true;
  });
}

export interface LineageGrowthResult {
  kind: 'awaken' | 'evolve' | 'grow' | 'none';
  lineage?: string;
  /** Trait ids ADDED this event (parent + first member on awaken; the evolved/grown trait otherwise). */
  added: string[];
  /** Trait id REMOVED (the pre-evolution trait, when a stage evolves). */
  removed?: string;
}

/**
 * Run one growth event's lineage progression on a pawn, mutating `pawn.traits`. `applyTrait(trait)` is
 * the caller's hook to apply a newly-granted trait's EFFECTS (stat bonus, grafts, bodyMods…). Priority:
 * awaken (full meter) → evolve a stage → grow a new member. Returns what happened (for the activity log).
 */
export function lineageGrowthEvent(pawn: Pawn, applyTrait: (t: Trait) => void): LineageGrowthResult {
  // 1) AWAKEN — a full meter grants the lineage parent + its first member, and clears the meters.
  const full = pawn.lineagePaths?.find((p) => p.value >= p.target);
  if (full && !pawnLineage(pawn)) {
    const parentId = LINEAGE_BY_ID.get(full.lineage)?.parent;
    const parent = parentId ? TRAIT_BY_ID.get(parentId) : undefined;
    if (parent) {
      const added: string[] = [];
      (pawn.traits ??= []).push(parent);
      applyTrait(parent);
      added.push(parent.id as string);
      const first = gainableMembers(pawn, full.lineage)[0]; // deterministic first member (the payoff)
      if (first) {
        pawn.traits.push(first);
        applyTrait(first);
        added.push(first.id as string);
      }
      pawn.lineagePaths = undefined; // the pawn has turned — no more awakening
      return { kind: 'awaken', lineage: full.lineage, added };
    }
  }

  // 2) EVOLVE — a staged trait grows to its next rung (prioritised, slight favour via first check).
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

  // 3) GROW — gain a new member trait of the pawn's lineage.
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
