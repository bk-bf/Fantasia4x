import type { Pawn, Mob } from '../../types';
import { PART_DEF_MAP } from '../../defs/bodyParts';
import { itemDefById } from '../../defs/items';
import { dampenLightByNightVision } from './vision';

export const STEALTH_STRIKE_MULT = 3.5;

export const STEALTH_CHECK_INTERVAL_S = 2;
export const STEALTH_CHECK_JITTER_S = 1;

export const STEALTH_FORGET_S = 30;

export const DETECT_BASE = 0.12;
export const DETECT_SLOPE = 0.15;
export const DETECT_PROXIMITY = 0.25;
export const DETECT_MIN = 0.02;
export const DETECT_MAX = 0.85;

export const ARMOR_WEIGHT_STEALTH_DRAG = 0.03;

export const NATURAL_ARMOR_STEALTH_DRAG = 0.04;

export function stealthAdditives(entity: Pawn | Mob): number {
  let s = 0;
  for (const trait of (entity as Pawn).traits ?? []) {
    s += trait.effects?.stealth ?? 0;
    s -= (trait.naturalArmor ?? 0) * NATURAL_ARMOR_STEALTH_DRAG;
  }
  for (const limb of entity.limbs ?? [])
    for (const part of limb.parts ?? []) {
      if (part.isMissing || part.health <= 0) continue;
      s += PART_DEF_MAP[part.id]?.grants?.stealth ?? 0;
    }
  const equipment = (entity as Pawn).equipment;
  if (equipment) {
    for (const inst of Object.values(equipment)) {
      if (!inst) continue;
      const item = itemDefById(inst.itemId);
      const ap = item?.armorProperties;
      if (!ap) continue;
      s += ap.stealthMod ?? -(item?.weightKg ?? 0) * ARMOR_WEIGHT_STEALTH_DRAG;
    }
  }
  return s;
}

export function getStealth(entity: Pawn | Mob, base: number): number {
  return Math.max(0, base + stealthAdditives(entity));
}

export function detectionScore(
  mobPerception: number,
  tileLight: number,
  nightVision: number
): number {
  return Math.max(0, (mobPerception - 8) * 0.12) * dampenLightByNightVision(tileLight, nightVision);
}

export function detectionChance(score: number, stealth: number, proximityFrac: number): number {
  const p = DETECT_BASE + (score - stealth) * DETECT_SLOPE + proximityFrac * DETECT_PROXIMITY;
  return p < DETECT_MIN ? DETECT_MIN : p > DETECT_MAX ? DETECT_MAX : p;
}

export function isDetectedBy(mob: Mob, pawnId: string): boolean {
  return mob.stealthChecks?.[pawnId]?.detected === true;
}

export function revealPawnToMob(mob: Mob, pawnId: string, turn: number): void {
  (mob.stealthChecks ??= {})[pawnId] = { at: turn, detected: true };
}

export const STEALTH_PACK_ALERT_RADIUS = 12;
