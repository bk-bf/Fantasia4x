import type { Culture } from '../../types';

export type Size = Culture['physicalTraits']['size'];

export const SIZES: Size[] = ['tiny', 'small', 'medium', 'large', 'huge'];

export const SIZE_BOX: Record<Size, { height: [number, number]; weight: [number, number] }> = {
  tiny: { height: [80, 120], weight: [25, 45] },
  small: { height: [120, 150], weight: [45, 70] },
  medium: { height: [150, 190], weight: [60, 100] },
  large: { height: [190, 230], weight: [100, 160] },
  huge: { height: [230, 280], weight: [160, 250] }
};

export function sizeFromHeight(cm: number): Size {
  if (cm < 120) return 'tiny';
  if (cm < 150) return 'small';
  if (cm < 190) return 'medium';
  if (cm < 230) return 'large';
  return 'huge';
}
