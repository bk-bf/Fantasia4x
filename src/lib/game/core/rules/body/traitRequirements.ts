import type { Trait } from '../../types';

export interface PawnPhysique {
  weight: number;
  height: number;
}

export function pawnMeetsRequires(t: Trait, phys?: PawnPhysique): boolean {
  const r = t.requires;
  if (!r || !phys) return true;
  const build = phys.height > 0 ? phys.weight / phys.height : 0;
  if (r.minWeightKg != null && phys.weight < r.minWeightKg) return false;
  if (r.maxWeightKg != null && phys.weight > r.maxWeightKg) return false;
  if (r.minHeightCm != null && phys.height < r.minHeightCm) return false;
  if (r.maxHeightCm != null && phys.height > r.maxHeightCm) return false;
  if (r.minBuild != null && build < r.minBuild) return false;
  if (r.maxBuild != null && build > r.maxBuild) return false;
  return true;
}
