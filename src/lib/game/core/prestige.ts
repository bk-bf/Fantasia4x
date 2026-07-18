// Prestige — a pure standing-value scan over an entity's worn regalia (KINGDOMS-TRADE §4).
//
// Lives in core (not SocialService) so PawnStatService's `prestige` stat formula can read it without
// importing SocialService — which would form a PawnStatService ↔ SocialService module cycle (the
// correct direction is social → stats, never the reverse). SocialService re-exposes this as
// `getPrestige` for its own callers.
import type { Pawn, Mob, ItemInstance } from './types';
import { itemDefById } from './itemDefs';
import { combinedQualityMultiplier } from './itemQuality';

/**
 * Standing prestige = the entity's `basePrestige` (pawns only) plus every worn item's
 * `armorProperties.prestigeBonus`, each scaled by the piece's craft-quality + famed multiplier.
 * Pure and allocation-light; scans the whole equipment doll, so callers gate it behind
 * "does this formula actually use prestige" (see PawnStatService.evaluateFormula).
 */
export function computePrestige(entity: Pawn | Mob): number {
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
