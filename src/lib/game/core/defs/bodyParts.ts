import type { BodyPartId, LimbId, BodyPartState, LimbState } from '../types';
import { rng } from '../util/rng';
import limbmapRaw from '../../database/pawns/limbmap.jsonc';

export interface BodyPartDef {
  id: BodyPartId;
  maxHp: number;
  bleedRatio: number;
  hitWeight: number;
  containedIn?: BodyPartId;
  isPaired: boolean;
  isVital: boolean;
  boneHp?: number;
  skeleton?: boolean;
  isCritical?: boolean;
  weapons?: string[];
  armor?: number;
  artery?: boolean;
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

const ALL_PARTS: Record<string, CatalogPart> = { ...LIMBMAP.shared.parts };
for (const block of Object.values(LIMBMAP.plans)) {
  if (block.parts) Object.assign(ALL_PARTS, block.parts);
}

export const BONE_FRACTION = 0.55;

export const DEFAULT_PLAN = 'humanoid';

export const CORE_LIMB_IDS = new Set<string>(['head', 'torso', 'body', 'core', 'form']);

export const PART_DEF_MAP: Partial<Record<BodyPartId, BodyPartDef>> = {};
for (const [id, p] of Object.entries(ALL_PARTS)) {
  PART_DEF_MAP[id as BodyPartId] = {
    id: id as BodyPartId,
    maxHp: p.skeleton ? Math.max(1, Math.round(p.size * BONE_FRACTION)) : p.size,
    bleedRatio: p.bleedRatio,
    hitWeight: p.hitWeight,
    containedIn: p.containedIn as BodyPartId | undefined,
    isPaired: p.isPaired ?? false,
    isVital: p.isVital ?? false,
    boneHp: p.skeleton ? Math.round(p.size * BONE_FRACTION) : undefined,
    skeleton: p.skeleton ?? undefined,
    isCritical: p.critical ?? undefined,
    weapons: p.weapons,
    armor: p.armor,
    artery: p.artery ?? undefined,
    grants: p.grants
  };
}

export const BOUND_NATURAL_WEAPONS = new Set<string>();
for (const def of Object.values(PART_DEF_MAP)) {
  for (const w of def?.weapons ?? []) BOUND_NATURAL_WEAPONS.add(w);
}

const SKELETON_OF: Partial<Record<BodyPartId, BodyPartId>> = {};
for (const def of Object.values(PART_DEF_MAP)) {
  if (def?.skeleton && def.containedIn) SKELETON_OF[def.containedIn] = def.id;
}

export function skeletonPartOf(partId: BodyPartId): BodyPartId | undefined {
  return SKELETON_OF[partId];
}

const ORGANS_OF: Partial<Record<BodyPartId, BodyPartId[]>> = {};
for (const def of Object.values(PART_DEF_MAP)) {
  if (def?.containedIn && !def.skeleton && def.hitWeight === 0) {
    (ORGANS_OF[def.containedIn] ??= []).push(def.id);
  }
}

export function organsOf(partId: BodyPartId): BodyPartId[] {
  return ORGANS_OF[partId] ?? [];
}

export function boneBreakBudget(def: BodyPartDef | undefined, scaledMaxHp: number): number {
  return def?.skeleton ? scaledMaxHp : BONE_FRACTION * scaledMaxHp;
}

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

const PLAN_DEFS: Record<string, Record<string, string[]>> = {};
for (const [name, block] of Object.entries(LIMBMAP.plans)) {
  PLAN_DEFS[name] = block.limbs ?? {};
}

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
const PLAN_PART_SET: Record<string, Set<string>> = {};
for (const [plan, limbs] of Object.entries(PLAN_DEFS)) {
  PLAN_PART_SET[plan] = new Set(Object.values(limbs).flat());
}

export function rollBodyPartOf(
  limbs: LimbState[] | undefined,
  plan: string = DEFAULT_PLAN
): BodyPartId {
  if (!limbs || limbs.length === 0) return rollBodyPart(plan);
  const planKey = PLAN_OUTER[plan] ? plan : DEFAULT_PLAN;
  const planParts = PLAN_PART_SET[planKey];
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
  if (!missing && !extra) return rollBodyPart(planKey);
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

export function isBodyPlan(plan: string | undefined): boolean {
  return plan != null && plan in PLAN_DEFS;
}

export function parentLimbOf(plan: string, partId: BodyPartId): LimbId | undefined {
  const limbs = PLAN_DEFS[plan] ?? PLAN_DEFS[DEFAULT_PLAN];
  for (const [limbId, partIds] of Object.entries(limbs)) {
    if (partIds.includes(partId)) return limbId as LimbId;
  }
  return undefined;
}

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

export function createDefaultBodyParts(limbId: LimbId): BodyPartState[] {
  const partIds = PLAN_DEFS[DEFAULT_PLAN][limbId] ?? [];
  return partIds.map((pid) => {
    const def = PART_DEF_MAP[pid as BodyPartId];
    const maxHp = def?.maxHp ?? 10;
    return { id: pid as BodyPartId, health: maxHp, maxHp, isMissing: false, injuries: [] };
  });
}
