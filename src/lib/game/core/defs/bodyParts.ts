import type { BodyPartId, LimbId, BodyPartState, LimbState } from '../types';
import limbmapRaw from '../../database/pawns/limbmap.json';

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

export const PLAN_DEFS: Record<string, Record<string, string[]>> = {};
for (const [name, block] of Object.entries(LIMBMAP.plans)) {
  PLAN_DEFS[name] = block.limbs ?? {};
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
