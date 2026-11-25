import type { Culture, CultureRelation } from '../../types';
import type { Size } from '../body/size';

export type StatBucket = 'mighty' | 'strong' | 'average' | 'frail';

export function statBucket(value: number): StatBucket {
  if (value >= 14) return 'mighty';
  if (value >= 12) return 'strong';
  if (value >= 9.5) return 'average';
  return 'frail';
}

const SIZE_BUCKET: Record<Size, string> = {
  tiny: 'diminutive',
  small: 'small',
  medium: 'average',
  large: 'tall',
  huge: 'towering'
};

export function sizeBucket(size: Size): string {
  return SIZE_BUCKET[size];
}

export function midpoint(range: [number, number]): number {
  return (range[0] + range[1]) / 2;
}

export function buildBucket(phys: Culture['physicalTraits']): string {
  const density = midpoint(phys.weightRange) / midpoint(phys.heightRange);
  if (density >= 0.7) return 'heavyset';
  if (density >= 0.52) return 'sturdy';
  if (density >= 0.4) return 'lean';
  if (density >= 0.3) return 'wiry';
  return 'gaunt';
}

export function gaitBucket(dex: number, build: string): string {
  if (dex >= 12) return 'quick';
  if (dex < 9.5 || build === 'heavyset') return 'slow';
  return 'steady';
}

export function comparativeKey(str: number, dex: number, con: number): string {
  const conDex = con - dex;
  const strDex = str - dex;
  if (Math.abs(conDex) < 1.5 && Math.abs(strDex) < 1.5) return 'balanced';
  if (Math.abs(conDex) >= Math.abs(strDex)) return conDex >= 0 ? 'con_over_dex' : 'dex_over_con';
  return strDex >= 0 ? 'str_over_dex' : 'dex_over_str';
}

export function dispositionFor(score: number): CultureRelation['disposition'] {
  if (score >= 60) return 'allied';
  if (score >= 20) return 'friendly';
  if (score > -20) return 'neutral';
  if (score > -60) return 'wary';
  return 'hostile';
}
