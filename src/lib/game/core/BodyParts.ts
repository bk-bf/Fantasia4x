// Body-part anatomy, data-driven from limbmap.jsonc (one body plan per creature category). Loads the
// part catalog, builds per-plan limb trees + hit-roll tables, and scales part HP by bodyScale.
import type { BodyPartId, LimbId, BodyPartState, LimbState } from './types';
import { rng } from './rng';
import limbmapRaw from '../database/pawns/limbmap.jsonc';

export interface BodyPartDef {
  id: BodyPartId;
  /** Default HP at bodyScale 1.0 (the "default limb size"). Per-creature maxHp = round(maxHp×bodyScale). */
  maxHp: number;
  bleedRatio: number; // 0–1 share of total body mass
  hitWeight: number; // 0 = internal only; never selected by roll
  containedIn?: BodyPartId;
  isPaired: boolean;
  isVital: boolean;
  /** Default-scale bone HP (BONE_FRACTION × maxHp). Presence = "this part has a skeleton" (can fracture);
   *  the runtime BREAK threshold uses BONE_FRACTION × the part's SCALED maxHp, not this default. */
  boneHp?: number;
  /** This part IS bone: internal (hitWeight 0, never struck directly), takes ONLY fractures. A hit on
   *  the flesh part that CONTAINS it routes its fracture roll here (see `skeletonPartOf`). */
  skeleton?: boolean;
  /** Destroying this part is instant death regardless of limb-aggregate HP (a caved-in skull). */
  isCritical?: boolean;
  /** Natural-weapon ids this part enables (jaw → bite); usable only while a non-missing part enables it. */
  weapons?: string[];
  /** Natural-armour share 0–1+: the plan sets the distribution, the creature's `naturalArmor` the strength.
   *  A destroyed part takes its armour with it. */
  armor?: number;
  /** ADR-031: a major vessel (carotid/femoral). A penetrating organ-hit that finds it opens an
   *  UNCLOTTABLE bleed (`bloodletting` — flows until dressed), so a throat/groin thrust is a slow-kill
   *  rather than the instant kill a vital organ would be. */
  artery?: boolean;
  /** TRAITS §0 — permanent effects the part itself confers on whoever has it (a spider's extra eyes grant
   *  night vision + perception). This is how a GRAFTED organ pays out its buff without routing through a
   *  condition: `nightVision` is summed live over the entity's LIVING parts (vision.ts) — lose the eye,
   *  lose the sight; `perceptionBonus` (a core stat) is baked in once at pawn-gen from the grafted parts
   *  (applyCulturalTraitBonuses). Only a part unique to the granting body carries it, so it never leaks to
   *  a plain humanoid eye. Conditional benefits (gills only help when wet) still use a hostParts condition.
   *  `stealth` is summed the same live way (core/stealth.ts) — a translucent membrane hides while it lives. */
  grants?: { nightVision?: number; perceptionBonus?: number; stealth?: number };
}

interface CatalogPart {
  size: number;
  bleedRatio: number;
  hitWeight: number;
  isVital?: boolean;
  isPaired?: boolean;
  containedIn?: string;
  skeleton?: boolean;
  critical?: boolean;
  weapons?: string[];
  armor?: number;
  artery?: boolean;
  grants?: { nightVision?: number; perceptionBonus?: number; stealth?: number };
}
interface PlanBlock {
  parts?: Record<string, CatalogPart>;
  limbs?: Record<string, string[]>;
}
type LimbMapFile = {
  shared: { parts: Record<string, CatalogPart> };
  plans: Record<string, PlanBlock>;
};

const LIMBMAP = limbmapRaw as unknown as LimbMapFile;

// One flat part catalog: shared + every plan's own parts (a plan's `limbs` may reference parts
// declared by another plan).
const ALL_PARTS: Record<string, CatalogPart> = { ...LIMBMAP.shared.parts };
for (const block of Object.values(LIMBMAP.plans)) {
  if (block.parts) Object.assign(ALL_PARTS, block.parts);
}

/** Bone breaks at this fraction of a part's (scaled) maxHp — see Combat fracture handling. */
export const BONE_FRACTION = 0.55;

/** The default body plan — pawns and any creature without an explicit `limbMap`. */
export const DEFAULT_PLAN = 'humanoid';

/** Limbs treated as "core" (head/torso analogues) — full worn-armour benefit; everything else is a
 *  peripheral limb (partial armour). Covers every plan's trunk/head limb id. */
export const CORE_LIMB_IDS = new Set<string>(['head', 'torso', 'body', 'core', 'form']);

// ── Catalog → global part-def map (structural attrs; maxHp = the default/unscaled size) ──────────────
export const PART_DEF_MAP: Partial<Record<BodyPartId, BodyPartDef>> = {};
for (const [id, p] of Object.entries(ALL_PARTS)) {
  PART_DEF_MAP[id as BodyPartId] = {
    id: id as BodyPartId,
    // A `skeleton` part is pure bone: its whole HP IS the fracture budget (BONE_FRACTION of the flesh
    // part it mirrors) and it breaks when chipped to 0. Flesh parts keep their full size.
    maxHp: p.skeleton ? Math.max(1, Math.round(p.size * BONE_FRACTION)) : p.size,
    bleedRatio: p.bleedRatio,
    hitWeight: p.hitWeight,
    containedIn: p.containedIn as BodyPartId | undefined,
    isPaired: p.isPaired ?? false,
    isVital: p.isVital ?? false,
    // Flesh parts never fracture directly — they route to the skeleton child they wrap (skeletonPartOf).
    boneHp: p.skeleton ? Math.round(p.size * BONE_FRACTION) : undefined,
    skeleton: p.skeleton ?? undefined,
    isCritical: p.critical ?? undefined,
    weapons: p.weapons,
    armor: p.armor,
    artery: p.artery ?? undefined,
    grants: p.grants
  };
}

// Natural-weapon ids bound to SOME body part. An unbound weapon stays always-available; a bound one
// needs a surviving enabling part.
export const BOUND_NATURAL_WEAPONS = new Set<string>();
for (const def of Object.values(PART_DEF_MAP)) {
  for (const w of def?.weapons ?? []) BOUND_NATURAL_WEAPONS.add(w);
}

// Flesh part id → the skeletal part it WRAPS; a hit on the flesh routes its fracture roll to this bone.
const SKELETON_OF: Partial<Record<BodyPartId, BodyPartId>> = {};
for (const def of Object.values(PART_DEF_MAP)) {
  if (def?.skeleton && def.containedIn) SKELETON_OF[def.containedIn] = def.id;
}

/** Which part a hit on `partId` should FRACTURE: the skeleton child the flesh wraps (chest → ribcage),
 *  or undefined for soft parts with no skeleton (eyes, organs — can't fracture). Combat's single source
 *  of truth for fracture targeting. */
export function skeletonPartOf(partId: BodyPartId): BodyPartId | undefined {
  return SKELETON_OF[partId];
}

// Container part id → the soft internal organs it directly holds (contained, hitWeight 0, non-skeleton).
// External sub-parts (fingers, toes — hitWeight > 0) are excluded: they're hit on their own.
const ORGANS_OF: Partial<Record<BodyPartId, BodyPartId[]>> = {};
for (const def of Object.values(PART_DEF_MAP)) {
  if (def?.containedIn && !def.skeleton && def.hitWeight === 0) {
    (ORGANS_OF[def.containedIn] ??= []).push(def.id);
  }
}

/** The soft internal organs a deep hit on `partId` could PENETRATE to (chest → heart/lungs/spine). NOT
 *  the destruction cascade — this is the graded "a thrust reached an organ" roll on a non-fatal blow. */
export function organsOf(partId: BodyPartId): BodyPartId[] {
  return ORGANS_OF[partId] ?? [];
}

/** Fracture damage that BREAKS a bone part, scaled to its actual (per-creature) HP — a skeleton part's
 *  whole HP is its budget. The one break threshold shared by Combat / Wounds / needs. */
export function boneBreakBudget(def: BodyPartDef | undefined, scaledMaxHp: number): number {
  return def?.skeleton ? scaledMaxHp : BONE_FRACTION * scaledMaxHp;
}

/** Transitive closure of parts nested inside `parentId` (its organs/sub-parts, and theirs).
 *  Derived from the static `containedIn` topology — e.g. abdomen → {liver, stomach, kidneys}. */
export function containedParts(parentId: BodyPartId): Set<BodyPartId> {
  const out = new Set<BodyPartId>();
  const allIds = Object.keys(PART_DEF_MAP) as BodyPartId[];
  const stack: BodyPartId[] = [parentId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const id of allIds) {
      if (PART_DEF_MAP[id]?.containedIn === cur && !out.has(id)) {
        out.add(id);
        stack.push(id);
      }
    }
  }
  return out;
}

/** Parts whose containment closure holds a VITAL/CRITICAL organ (chest → heart). Destroying the
 *  container must read as dead even before the cascade zeroes the organ inside (the per-tick reaper
 *  doesn't cascade; a save can carry a 0-HP chest with an intact heart). */
const CONTAINER_OF_VITAL = new Set<BodyPartId>();
for (const id of Object.keys(PART_DEF_MAP) as BodyPartId[]) {
  for (const child of containedParts(id)) {
    const cdef = PART_DEF_MAP[child];
    if (cdef?.isVital || cdef?.isCritical) {
      CONTAINER_OF_VITAL.add(id);
      break;
    }
  }
}

/** Severed container takes its contents with it: destroys every part nested inside `severedId` and
 *  reports whether a VITAL organ went (caller must treat as lethal). Pure — returns the original array
 *  when nothing changed. */
export function cascadeSeveredContents(
  parts: BodyPartState[],
  severedId: BodyPartId
): { parts: BodyPartState[]; lostVital: boolean } {
  const contained = containedParts(severedId);
  if (contained.size === 0) return { parts, lostVital: false };
  let lostVital = false;
  let changed = false;
  const next = parts.map((p) => {
    if (!contained.has(p.id) || p.isMissing) return p;
    changed = true;
    if (PART_DEF_MAP[p.id]?.isVital) lostVital = true;
    return { ...p, health: 0, isMissing: true };
  });
  return changed ? { parts: next, lostVital } : { parts, lostVital: false };
}

/**
 * The SINGLE "is this body dead?" rule, shared by the combat hit resolver and the per-tick reapers.
 * Dead when: a vital/critical part — or a container of one — is missing OR at ≤0 HP (HP-based, so a
 * crushed organ counts; a broken bone never kills, only flesh-container destruction does), or the
 * head/torso root limb hits ≤0 aggregate HP. Blood-loss death is separate (bloodVolume ≤ 0).
 */
export function lethalAnatomyCause(limbs: LimbState[] | undefined): 'critical_limb' | null {
  if (!limbs) return null;
  for (const limb of limbs) {
    for (const part of limb.parts ?? []) {
      const def = PART_DEF_MAP[part.id];
      const destroyed = part.isMissing || part.health <= 0;
      if (destroyed && (def?.isVital || def?.isCritical || CONTAINER_OF_VITAL.has(part.id))) {
        return 'critical_limb';
      }
    }
    if (limb.health <= 0 && (limb.id === 'head' || limb.id === 'torso')) {
      return 'critical_limb';
    }
  }
  return null;
}

/** Natural-weapon ids currently usable: union of `weapons` over non-missing parts (a destroyed jaw
 *  can't bite). Unbound weapons aren't listed — callers treat them as always-available. */
export function enabledNaturalWeapons(limbs: LimbState[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const limb of limbs ?? []) {
    if (limb.isMissing) continue;
    for (const part of limb.parts ?? []) {
      if (part.isMissing) continue;
      for (const w of PART_DEF_MAP[part.id]?.weapons ?? []) out.add(w);
    }
  }
  return out;
}

// Each plan's limb layout (id → part ids), pulled out of its co-located block.
const PLAN_DEFS: Record<string, Record<string, string[]>> = {};
for (const [name, block] of Object.entries(LIMBMAP.plans)) {
  PLAN_DEFS[name] = block.limbs ?? {};
}

// ── Per-plan outer-part hit-roll tables (hitWeight > 0) ─────────────────────────────────────────────
const PLAN_OUTER: Record<string, { id: BodyPartId; w: number }[]> = {};
const PLAN_TOTAL_W: Record<string, number> = {};
for (const [plan, limbs] of Object.entries(PLAN_DEFS)) {
  const outer: { id: BodyPartId; w: number }[] = [];
  for (const partIds of Object.values(limbs)) {
    for (const pid of partIds) {
      const w = PART_DEF_MAP[pid as BodyPartId]?.hitWeight ?? 0;
      if (w > 0) outer.push({ id: pid as BodyPartId, w });
    }
  }
  PLAN_OUTER[plan] = outer;
  PLAN_TOTAL_W[plan] = outer.reduce((s, o) => s + o.w, 0);
}
// Per-plan membership set (ALL part ids, outer + internal) — lets rollBodyPartOf spot GRAFTED parts
// (present in a live tree but foreign to its plan) without a per-roll scan of the plan lists.
const PLAN_PART_SET: Record<string, Set<string>> = {};
for (const [plan, limbs] of Object.entries(PLAN_DEFS)) {
  PLAN_PART_SET[plan] = new Set(Object.values(limbs).flat());
}

/**
 * Weighted random outer body part for an entity's LIVE body (TRAIT-LIBRARY-EXPANSION §3d): the
 * PLAN's hit table minus parts/limbs the tree has actually LOST (a severed part can't be struck
 * again), plus any GRAFTED parts the tree carries beyond its plan (a pawn's wings/tail are
 * hittable). Sparse trees (test fixtures with on-demand parts) keep the full plan table — a part
 * absent from the tree is simply unhurt, not gone. Falls back to the plain plan roll when nothing
 * survives.
 */
export function rollBodyPartOf(
  limbs: LimbState[] | undefined,
  plan: string = DEFAULT_PLAN
): BodyPartId {
  if (!limbs || limbs.length === 0) return rollBodyPart(plan);
  const planKey = PLAN_OUTER[plan] ? plan : DEFAULT_PLAN;
  const planParts = PLAN_PART_SET[planKey];
  // Collect what the live tree says is GONE, and what it carries beyond the plan (grafts).
  let missing: Set<string> | null = null;
  let extra: { id: BodyPartId; w: number }[] | null = null;
  for (const l of limbs) {
    for (const p of l.parts ?? []) {
      if (l.isMissing || p.isMissing) {
        (missing ??= new Set()).add(p.id);
      } else if (!planParts.has(p.id)) {
        const w = PART_DEF_MAP[p.id]?.hitWeight ?? 0;
        if (w > 0) (extra ??= []).push({ id: p.id, w });
      }
    }
  }
  if (!missing && !extra) return rollBodyPart(planKey); // the common whole-bodied case — zero alloc
  const outer = PLAN_OUTER[planKey];
  let total = 0;
  for (const o of outer) if (!missing?.has(o.id)) total += o.w;
  if (extra) for (const e of extra) total += e.w;
  if (total <= 0) return rollBodyPart(planKey);
  let r = rng.random() * total;
  for (const o of outer) {
    if (missing?.has(o.id)) continue;
    r -= o.w;
    if (r <= 0) return o.id;
  }
  if (extra) {
    for (const e of extra) {
      r -= e.w;
      if (r <= 0) return e.id;
    }
  }
  return rollBodyPart(planKey);
}

/** Weighted random outer body part for a body plan (defaults to humanoid). */
export function rollBodyPart(plan: string = DEFAULT_PLAN): BodyPartId {
  const outer = PLAN_OUTER[plan] ?? PLAN_OUTER[DEFAULT_PLAN];
  const total = PLAN_TOTAL_W[plan] ?? PLAN_TOTAL_W[DEFAULT_PLAN];
  let r = rng.random() * total;
  for (const part of outer) {
    r -= part.w;
    if (r <= 0) return part.id;
  }
  return outer[outer.length - 1].id;
}

/** Does a body plan exist? */
export function isBodyPlan(plan: string | undefined): boolean {
  return plan != null && plan in PLAN_DEFS;
}

/** The parent limb id for a part WITHIN a plan (replaces the old global parentLimb field). */
export function parentLimbOf(plan: string, partId: BodyPartId): LimbId | undefined {
  const limbs = PLAN_DEFS[plan] ?? PLAN_DEFS[DEFAULT_PLAN];
  for (const [limbId, partIds] of Object.entries(limbs)) {
    if (partIds.includes(partId)) return limbId as LimbId;
  }
  return undefined;
}

/**
 * Build the FULL limb tree for a body plan, scaling every part's maxHp by bodyScale (HP = round(default
 * size × bodyScale)). The plan supplies STRUCTURE only — it never sets the blood pool. Spawn calls this.
 */
export function createBodyPlanLimbs(plan: string = DEFAULT_PLAN, bodyScale = 1): LimbState[] {
  const limbs = PLAN_DEFS[plan] ?? PLAN_DEFS[DEFAULT_PLAN];
  return Object.entries(limbs).map(([limbId, partIds]) => ({
    id: limbId as LimbId,
    health: 100,
    isMissing: false,
    bleedRate: 0,
    parts: partIds.map((pid) => {
      const def = PART_DEF_MAP[pid as BodyPartId];
      const maxHp = Math.max(1, Math.round((def?.maxHp ?? 10) * bodyScale));
      return {
        id: pid as BodyPartId,
        health: maxHp,
        maxHp,
        isMissing: false,
        injuries: []
      } as BodyPartState;
    })
  }));
}

/** Back-compat: the parts of ONE humanoid limb at default scale (legacy callers / the pawn body panel). */
export function createDefaultBodyParts(limbId: LimbId): BodyPartState[] {
  const partIds = PLAN_DEFS[DEFAULT_PLAN][limbId] ?? [];
  return partIds.map((pid) => {
    const def = PART_DEF_MAP[pid as BodyPartId];
    const maxHp = def?.maxHp ?? 10;
    return { id: pid as BodyPartId, health: maxHp, maxHp, isMissing: false, injuries: [] };
  });
}
