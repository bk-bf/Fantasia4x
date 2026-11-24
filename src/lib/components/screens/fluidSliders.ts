import type { FluidKey } from '$lib/webgl/painted/fluids';

export interface FluidSlider {
  key: FluidKey;
  label: string;
  min: number;
  max: number;
  step: number;
}

export const FLUID_SLIDERS: FluidSlider[] = [
  { key: 'drift', label: 'Drift', min: 0, max: 20, step: 0.05 },
  { key: 'windDrift', label: 'Drift in wind', min: 0, max: 20, step: 0.05 },
  { key: 'glint', label: 'Glint drift', min: 0, max: 2, step: 0.05 },
  { key: 'grain', label: 'Grain size', min: 0.25, max: 4, step: 0.05 },
  { key: 'ruffle', label: 'Ruffle', min: 0, max: 2, step: 0.01 },
  { key: 'patches', label: 'Patches', min: 0, max: 2, step: 0.01 },
  { key: 'patchPace', label: 'Patch pace', min: 0, max: 10, step: 0.1 },
  { key: 'lap', label: 'Lap at the bank', min: 0, max: 2, step: 0.01 },
  { key: 'lapPace', label: 'Lap pace', min: 0, max: 3, step: 0.01 },
  { key: 'swash', label: 'Shore width', min: 0, max: 8, step: 0.05 },
  { key: 'wet', label: 'Wet margin', min: 0, max: 4, step: 0.05 },
  { key: 'wetShade', label: 'Wet shade', min: 0, max: 1, step: 0.01 },
  { key: 'line', label: 'Bank line', min: 0, max: 4, step: 0.05 },
  { key: 'foam', label: 'Foam', min: 0, max: 1.5, step: 0.01 },
  { key: 'tone', label: 'Tone', min: -3, max: 3, step: 0.05 },
  { key: 'depth', label: 'Depth', min: 0, max: 2, step: 0.01 },
  { key: 'shoal', label: 'Shoal reach', min: 0.5, max: 20, step: 0.1 },
  { key: 'afloat', label: 'Cover over weed', min: 0, max: 1, step: 0.01 },
  { key: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.01 },
  { key: 'flowCycle', label: 'River cycle', min: 0.5, max: 8, step: 0.05 },
  { key: 'flowPace', label: 'River pace', min: 0, max: 120, step: 1 }
];

export const TINT_SLIDERS = ['Tint red', 'Tint green', 'Tint blue'].map((label) => ({
  label,
  min: 0,
  max: 1.5,
  step: 0.01
}));

const places = (step: number) => Math.max(0, -Math.floor(Math.log10(step)));

export function snap(value: number, step: number): number {
  return Number((Math.round(value / step) * step).toFixed(places(step)));
}

export function readout(value: number, step: number): string {
  return value.toFixed(places(step));
}
