import type { BodyPartId, BodyPartState, LimbState } from '../../types';
import { rng } from '../../util/rng';
import { PART_DEF_MAP, PLAN_DEFS, DEFAULT_PLAN } from '../../defs/bodyParts';

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
