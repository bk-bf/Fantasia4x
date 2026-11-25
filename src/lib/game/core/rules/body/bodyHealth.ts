import type { LimbState } from '../../types';

export function bodyHealthShare(limbs: readonly LimbState[] | undefined): number {
  let left = 0;
  let total = 0;
  for (const limb of limbs ?? [])
    for (const part of limb.parts ?? []) {
      total += part.maxHp;
      if (!part.isMissing) left += Math.max(0, Math.min(part.maxHp, part.health));
    }
  return total > 0 ? left / total : 1;
}
