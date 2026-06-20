// Body-part anatomy — now DATA-DRIVEN from limbmap.jsonc (body plans per creature category) instead of
// a single hardcoded humanoid table, so a wolf carries paws + a tail, not fingers + toes. This module
// loads the catalog into PART_DEF_MAP, builds per-plan limb trees + hit-roll tables, and scales each
// part's HP by bodyScale at build time (HP = round(default size × bodyScale)). Combat.ts re-exports the
// public surface so existing importers are unchanged.
import type { BodyPartId, LimbId, BodyPartState, LimbState } from './types';
import { rng } from './rng';
import limbmapRaw from '../database/limbmap.jsonc';

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
  /** Destroying this part is instant death regardless of limb-aggregate HP (a caved-in skull). */
  isCritical?: boolean;
  /** Natural-weapon ids this part can wield (jaw → bite, paw → claw, hoof → kick…). A creature can use
   *  one of its `naturalWeapons` ONLY while it still has a non-missing part that enables it. */
  weapons?: string[];
  /** Natural-armour SHARE for this part (0–1+): how much of the creature's `naturalArmor` magnitude
   *  protects it. The plan sets the DISTRIBUTION (armoured back/carapace ~1.0, soft belly ~0.5, exposed
   *  eyes ~0.1); the creature sets the strength. A destroyed part takes its armour with it. */
  armor?: number;
}

interface CatalogPart {
  size: number;
  bleedRatio: number;
  hitWeight: number;
  isVital?: boolean;
  isPaired?: boolean;
  containedIn?: string;
  bone?: boolean;
  critical?: boolean;
  weapons?: string[];
  armor?: number;
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

// Merge the shared catalog + every plan's own parts into ONE flat part catalog (a plan's `limbs` may
// reference parts declared by another plan — quadruped_hooved reuses quadruped's leg segments).
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
    maxHp: p.size,
    bleedRatio: p.bleedRatio,
    hitWeight: p.hitWeight,
    containedIn: p.containedIn as BodyPartId | undefined,
    isPaired: p.isPaired ?? false,
    isVital: p.isVital ?? false,
    boneHp: p.bone ? Math.round(p.size * BONE_FRACTION) : undefined,
    isCritical: p.critical ?? undefined,
    weapons: p.weapons,
    armor: p.armor
  };
}

// Every natural-weapon id that is bound to SOME body part. A weapon NOT in this set is "unbound" and
// stays always-available (back-compat / abstract attacks); a bound weapon needs a surviving enabling part.
export const BOUND_NATURAL_WEAPONS = new Set<string>();
for (const def of Object.values(PART_DEF_MAP)) {
  for (const w of def?.weapons ?? []) BOUND_NATURAL_WEAPONS.add(w);
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

/** When a container part is severed, its contents go with it: destroy every part nested inside
 *  `severedId` (set health 0 + isMissing). Returns the new parts array and whether the cascade took a
 *  VITAL organ (heart/lung/brain) — i.e. a gut-out of the chest that the caller must treat as lethal.
 *  Pure: returns the original array unchanged when nothing is contained / already gone. */
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

/** Natural-weapon ids currently usable given a limb tree: the union of `weapons` over every non-missing
 *  part (a destroyed jaw can't bite; one surviving front paw still claws). Unbound weapons aren't listed
 *  here — callers treat them as always-available via BOUND_NATURAL_WEAPONS. */
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
