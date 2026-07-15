// Lineages.ts — ancestral-blood mutation trees (LINEAGES spec). The lineage registry + awakening table
// are DERIVED from the parent marker traits in traits.jsonc (the old lineages.jsonc was folded onto
// them — see LINEAGE_DEFS/AWAKENING_DEFS below). Drives the
// per-pawn lineage progression that rides the seasonal growth event (PawnGrowthService):
//   • seedAwakeningPaths — at pawn-gen, a standalone gateway trait seeds ≥2 awakening meters (§4).
//   • advanceAwakeningMeters — per DAY: fold fresh deeds into the meters, decay idle ones.
//   • lineageGrowthEvent — at each growth event: AWAKEN (a full meter grants the lineage parent + its
//     first trait), else EVOLVE a staged trait (~10%, prioritised), else GROW a new member (~10%).
// Self-contained: reads its own copy of the trait catalog (no Culture import → no cycle). Trait EFFECTS
// of a newly-granted trait are applied by the caller's `applyTrait` callback (kept out of core→entities).
import traitDbData from '../database/pawns/traits.jsonc';
import { rng } from './rng';
import { recomputeWound } from './Wounds';
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

// The trait catalog keyed by id — the pool lineage growth draws from. FLAT since the LINEAGES-II
// heritage flatten (no nested bundles exist; `traitExpansion.test.ts` guards against their return).
const ALL_TRAITS: Trait[] = traitDbData as unknown as Trait[];
const TRAIT_BY_ID = new Map(ALL_TRAITS.filter((t) => t.id).map((t) => [t.id as string, t]));

// Lineage registry + awakening table, DERIVED from the parent marker traits (the old `lineages.jsonc`
// folded onto them). A trait with `lineageParent` set IS a bloodline's parent — it carries the
// bloodline's display name/description and, one-to-many so still single-source, its awakening
// conditions. `parent` is the trait's own id, so it can never point at a trait that isn't there.
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

/** Look up a trait def by id (the same flat catalog lineage growth draws from). Used by the §2h
 *  trait-organ consume path to resolve a `grantsTraitOnConsume` id into the full Trait to bake. */
export function getTraitById(id: string): Trait | undefined {
  return TRAIT_BY_ID.get(id);
}

// §2h(ii): the Faustian flaw pool — a curated set of pure stat/attribute PENALTY negative traits a
// consumed beast-organ can inflict alongside its trait grant. Curated (NOT "any negative trait") so the
// flaw is always a clean stat hit `applyGainedTrait` can bake, never a graft/wound/bodyMod needing
// special handling. Missing ids are silently dropped.
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

/** Roll one Faustian flaw (a curated pure-penalty negative trait), or undefined if the pool is empty. */
export function rollFlawTrait(rand: () => number): Trait | undefined {
  if (FLAW_POOL.length === 0) return undefined;
  return FLAW_POOL[Math.floor(rand() * FLAW_POOL.length) % FLAW_POOL.length];
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
 * `awakens`) — and only while the pawn does NOT already belong to a lineage — seed ONE awakening meter
 * per candidate lineage, with a RANDOM condition drawn from the gateway's pool for that lineage. So a
 * claws pawn gets one beast meter + one werewolf meter (which deed each tracks varies pawn to pawn),
 * never a bar per condition. Deduped by lineage across gateways: claws + fur still yield one beast +
 * one werewolf meter. With the ≤2-gateways draw cap (Culture.ts) the practical maximum is 4 meters —
 * and a pawn that awakens is done: ONE parent lineage, all other meters cleared, no second awakening.
 */
export function seedAwakeningPaths(pawn: Pawn, dayIndex = 0): void {
  if (pawnLineage(pawn)) return; // already a member — no awakening
  const paths: LineagePath[] = [];
  const seededLineages = new Set<string>();
  for (const t of pawn.traits ?? []) {
    if (t.lineageExclusive !== false || !t.awakens?.length) continue;
    // Group this gateway's conditions by the lineage they awaken, then roll ONE per lineage.
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
      paths.push({ condition: a.id, lineage, deed: a.deed, target, value: 0, seen: 0, lastFedDay: dayIndex });
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
    if (p.value >= p.target) continue; // LOCKED at full — never decays; awaits the next growth event
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

/**
 * LINEAGES-II §2 — one vampiric feeding: a small puncture on the victim's neck (a real wound, bleeds a
 * little until it clots or is dressed) + a blood drain, and the feeder's blood hunger resets. Mutates
 * both live pawns in place (the FSM convention). Used by the routine hourly feed AND the lose-control
 * hunt; the werewolf's carcass-devour path resets the same meter through `sateBloodHunger`.
 */
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
    // Keep the flat injuries mirror in step (rare event — the rebuild is fine here).
    victim.injuries = (victim.limbs ?? []).flatMap((l) => l.parts ?? []).flatMap((p) => p.injuries);
  }
  const maxBV = victim.maxBloodVolume ?? 100;
  victim.bloodVolume = Math.max(15, (victim.bloodVolume ?? maxBV) - 12);
  sateBloodHunger(feeder);
}

/** Reset a pawn's blood hunger and lift the bloodthirst rage (fed — control returns next tick). */
export function sateBloodHunger(pawn: Pawn): void {
  if (pawn.needs) pawn.needs.bloodHunger = 0;
  if (pawn.conditionTimers?.bloodthirst) delete pawn.conditionTimers.bloodthirst;
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
