import FLUIDS from './fluids.json';
import type { Heading } from './wind.js';

export const FLUID_KEYS = [
  'drift',
  'windDrift',
  'glint',
  'grain',
  'ruffle',
  'patches',
  'patchPace',
  'lap',
  'lapPace',
  'swash',
  'wet',
  'wetShade',
  'line',
  'foam',
  'tone',
  'depth',
  'shoal',
  'afloat',
  'opacity',
  'flowCycle',
  'flowPace'
] as const;

export type FluidKey = (typeof FLUID_KEYS)[number];

export type FluidDef = {
  name: string;
  ground: string[];
  hides: string[];
  tint: [number, number, number];
} & Partial<Record<FluidKey, number>>;

export type FluidSet = Record<string, FluidDef>;

export const FLUID_DEFS = FLUIDS as unknown as FluidSet;
export const WATER_FLUID = 'water';
export const MAX_FLUIDS = 4;
export const FLUID_VEC4 = 7;

const TAU = Math.PI * 2;
const MAX_STEP = 0.25;
const FIELD_PERIOD = 2048;
const PATCH_PERIOD = 1024 / 0.04;

export const FLUID_IDS = [
  WATER_FLUID,
  ...Object.keys(FLUID_DEFS).filter((id) => id !== WATER_FLUID)
].slice(0, MAX_FLUIDS);

export function fluidIndex(subType: string): number {
  return FLUID_IDS.findIndex((id) => FLUID_DEFS[id].ground.includes(subType));
}

const HIDDEN = new Set(FLUID_IDS.flatMap((id) => FLUID_DEFS[id].hides));

export function hiddenUnderFluid(resourceId: string): boolean {
  return HIDDEN.has(resourceId);
}

export function cloneFluids(set: FluidSet): FluidSet {
  return Object.fromEntries(
    Object.entries(set).map(([id, def]) => [
      id,
      {
        ...def,
        ground: [...def.ground],
        hides: [...def.hides],
        tint: [...def.tint] as [number, number, number]
      }
    ])
  );
}

function wrap(v: number, period: number): number {
  return ((v % period) + period) % period;
}

interface Drift {
  grain: { x: number; y: number };
  glint: { x: number; y: number };
  patch: { x: number; y: number };
  lap: number;
}

function still(): Drift {
  return { grain: { x: 0, y: 0 }, glint: { x: 0, y: 0 }, patch: { x: 0, y: 0 }, lap: 0 };
}

export class FluidClock {
  private readonly drift = FLUID_IDS.map(still);
  private readonly out = new Float32Array(MAX_FLUIDS * FLUID_VEC4 * 4);
  private last: number | null = null;

  tick(nowMs: number, fluids: FluidSet, wind: number, dir: Heading, hold: boolean): void {
    const secs = this.last === null ? 0 : Math.min(MAX_STEP, Math.max(0, nowMs - this.last) / 1000);
    this.last = nowMs;
    if (hold) return;
    FLUID_IDS.forEach((id, f) => {
      const def = fluids[id] ?? FLUID_DEFS[id];
      const d = this.drift[f];
      const pace = ((def.drift ?? 0) + (def.windDrift ?? 0) * wind) * secs;
      const glint = pace * (def.glint ?? 0);
      const patch = (def.patchPace ?? 0) * secs;
      d.grain.x = wrap(d.grain.x + dir.x * pace, FIELD_PERIOD);
      d.grain.y = wrap(d.grain.y + dir.y * pace, FIELD_PERIOD);
      d.glint.x = wrap(d.glint.x + dir.x * glint, FIELD_PERIOD);
      d.glint.y = wrap(d.glint.y + dir.y * glint, FIELD_PERIOD);
      d.patch.x = wrap(d.patch.x + dir.x * patch, PATCH_PERIOD);
      d.patch.y = wrap(d.patch.y + dir.y * patch, PATCH_PERIOD);
      d.lap = wrap(d.lap + (def.lapPace ?? 0) * secs, TAU);
    });
  }

  uniforms(fluids: FluidSet): Float32Array {
    const out = this.out;
    FLUID_IDS.forEach((id, f) => {
      const def = fluids[id] ?? FLUID_DEFS[id];
      const d = this.drift[f];
      const v = (k: FluidKey) => def[k] ?? 0;
      out.set(
        [
          d.grain.x,
          d.grain.y,
          d.glint.x,
          d.glint.y,
          d.patch.x,
          d.patch.y,
          d.lap,
          def.grain ?? 1,
          v('ruffle'),
          v('patches'),
          v('lap'),
          v('swash'),
          v('wet'),
          def.wetShade ?? 1,
          v('line'),
          v('foam'),
          v('tone'),
          v('depth'),
          def.shoal ?? 1,
          v('afloat'),
          ...def.tint,
          def.opacity ?? 1,
          def.flowCycle ?? 1,
          v('flowPace'),
          0,
          0
        ],
        f * FLUID_VEC4 * 4
      );
    });
    return out;
  }
}
