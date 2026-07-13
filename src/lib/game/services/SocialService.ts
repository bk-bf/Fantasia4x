// SocialService — the pawn-to-pawn social layer's service home (SOCIAL-LAYER). This pass ships
// only §6 prestige, which KINGDOMS-TRADE §4 consumes via the `trade` stat's `prestige` formula
// token: the sum of equipped items' `armorProperties.prestigeBonus`, scaled per instance by the
// same quality/Famed multiplier the combat stats use. Relationships, conversations, mood depth
// etc. land here later (SOCIAL-LAYER Phases B+).

import type { ItemInstance, Mob, Pawn } from '../core/types';
import { itemDefById } from '../core/itemDefs';
import { combinedQualityMultiplier } from '../core/itemQuality';

class SocialServiceImpl {
  /** Standing prestige: inherent bearing from station/upbringing (BACKGROUNDS `basePrestige`, pawns
   *  only) plus worn regalia. 0 for a plain commoner in rags. */
  getPrestige(entity: Pawn | Mob): number {
    let total = 'basePrestige' in entity ? ((entity as Pawn).basePrestige ?? 0) : 0;
    const equipment = entity.equipment;
    if (!equipment) return total;
    for (const inst of Object.values(equipment) as (ItemInstance | undefined | null)[]) {
      if (!inst || !inst.itemId) continue;
      const bonus = itemDefById(inst.itemId)?.armorProperties?.prestigeBonus;
      if (!bonus) continue;
      total += bonus * combinedQualityMultiplier(inst.quality, inst.famedStatMult);
    }
    return Math.round(total);
  }
}

export const socialService = new SocialServiceImpl();
