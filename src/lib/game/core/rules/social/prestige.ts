import type { Pawn, Mob, ItemInstance } from '../../types';
import { itemDefById } from '../../defs/items';
import { combinedQualityMultiplier } from '../gear/itemQuality';

export function computePrestige(entity: Pawn | Mob): number {
  let total = 'basePrestige' in entity ? ((entity as Pawn).basePrestige ?? 0) : 0;
  const equipment = entity.equipment;
  if (!equipment) return total;
  for (const inst of Object.values(equipment) as (ItemInstance | undefined | null)[]) {
    if (!inst || !inst.itemId) continue;
    const def = itemDefById(inst.itemId);
    const bonus = def?.prestigeBonus ?? def?.armorProperties?.prestigeBonus;
    if (!bonus) continue;
    total += bonus * combinedQualityMultiplier(inst.quality, inst.famedStatMult);
  }
  return Math.round(total);
}
