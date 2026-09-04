import type { DesignationType, Season } from '../types';
import { resolveCharSpans, type CharSpan } from './terrains';
import resourceObjectsData from '../../database/world/resources.json';
import { hexToRgb01 } from '../util/color';

export interface ResourceYieldDef {
  itemId: string;
  min: number;
  max: number;
  skillId: string;
  skillMultiplier: number;
  regrowthTurns?: number;
}

export interface ToolRequirement {
  workType: string;
  minTier: number;
}

export interface ResourceInteractionDef {
  designationType?: DesignationType;
  action: string;
  workCategory: string;
  workAmount: number;
  toolRequirement: ToolRequirement | null;
  yields: ResourceYieldDef[];
  persistent?: boolean;
  harvestDepletes?: boolean;
  regrowthTurns?: number;
  harvestSubType?: string;
  harvestGrowthCost?: number;
  regrowsFromZero?: boolean;
}

export interface ResourceObjectDef {
  id: string;
  displayName: string;
  subterrain: string;
  walkable?: boolean;
  blocksSight?: boolean;
  roofSupport?: boolean;
  overheadRoof?: boolean;
  chars: string[];
  seasonVariants?: Partial<
    Record<
      Season,
      { chars?: string[]; fg?: [number, number, number]; detail?: [number, number, number] }
    >
  >;
  fg: [number, number, number];
  bg: [number, number, number];
  detail?: [number, number, number];
  renderScale?: number;
  showGroundBelow?: boolean;
  spawn: {
    subterrains: Record<string, number>;
  };
  nodeAmountRange: [number, number];
  glow?: {
    color: [number, number, number];
    radius: number;
    intensity: number;
    flicker?: boolean;
  };
  thermal?: { degrees: number; radius: number };
  designationTypes: DesignationType[];
  grazing?: boolean;
  lair?: boolean;
  lairAttractors?: string[];
  particleEffect?: string;
  interaction: ResourceInteractionDef;
  interactions?: ResourceInteractionDef[];
  crop?: {
    seedItem: string;
    minSoil: number;
    minMoisture: number;
    maxMoisture: number;
    minTemp: number;
    maxTemp: number;
    needsLight: boolean;
    growthTurns: number;
    fertilityCost: number;
  };
}

export function isGrowableResource(def: ResourceObjectDef): boolean {
  if (def.crop) return true;
  const ints = def.interactions ?? [def.interaction];
  return ints.some((i) => i.persistent === true || i.regrowthTurns !== undefined);
}

interface RawSeasonVariant {
  charSpans?: CharSpan[];
  fg?: string;
  detail?: string;
}

function resolveSeasonVariants(raw: unknown): ResourceObjectDef['seasonVariants'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: NonNullable<ResourceObjectDef['seasonVariants']> = {};
  for (const [season, v] of Object.entries(raw as Record<string, RawSeasonVariant>)) {
    if (!v) continue;
    out[season as Season] = {
      chars: v.charSpans ? resolveCharSpans(v.charSpans) : undefined,
      fg: v.fg ? hexToRgb01(v.fg, [0.87, 0.62, 0.12]) : undefined,
      detail: v.detail ? hexToRgb01(v.detail, [1, 1, 1]) : undefined
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export const RESOURCE_OBJECT_DEFS: ResourceObjectDef[] = (
  resourceObjectsData as unknown as Array<Record<string, unknown>>
).map((raw) => ({
  ...(raw as unknown as Omit<
    ResourceObjectDef,
    'chars' | 'seasonVariants' | 'fg' | 'bg' | 'detail'
  >),
  chars: resolveCharSpans((raw.charSpans ?? []) as CharSpan[]),
  seasonVariants: resolveSeasonVariants(raw.seasonVariants),
  fg: hexToRgb01(raw.fg, [0.87, 0.62, 0.12]),
  bg: hexToRgb01(raw.bg, [0.06, 0.04, 0.01]),
  detail: raw.detail ? hexToRgb01(raw.detail, [1, 1, 1]) : undefined
}));

const _byId: Map<string, ResourceObjectDef> = new Map(RESOURCE_OBJECT_DEFS.map((d) => [d.id, d]));

export function resourceObjectDefById(id: string): ResourceObjectDef | undefined {
  return _byId.get(id);
}
