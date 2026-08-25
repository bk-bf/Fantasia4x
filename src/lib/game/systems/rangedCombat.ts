import type { Pawn, Mob, Item, ItemInstance, ItemQuality } from '../core/types';
import { chebyshev } from '../core/util/distance';
import { itemService } from '../services/ItemService';
import { pawnStatService } from '../services/PawnStatService';

const AIM_ACC_STAT_POINTS = 50;
const ACC_FALLOFF_PER_TILE = 2.5;
const AIM_TIME_PER_TILE = 0.08;
const MIN_SHOT_INTERVAL_TICKS = 72;
const DRAW_FUMBLE_PENALTY = -0.2;

export function isRangedWeaponProps(
  wp: NonNullable<Item['weaponProperties']> | undefined
): boolean {
  return !!wp && (wp.range ?? 0) > 1;
}

export function isThrownWeaponProps(
  wp: NonNullable<Item['weaponProperties']> | undefined
): boolean {
  return isRangedWeaponProps(wp) && !wp!.ammoCategory && !wp!.twoHanded;
}

export interface RangedWeapon {
  itemId: string;
  itemName: string;
  range: number;
  reach: number;
  reload: number;
  strScaled: boolean;
  ammoCategory?: string;
  quality?: ItemQuality;
  famedStatMult?: number;
  slot: 'mainHand' | 'offHand';
  projectile?: string;
  channeled?: boolean;
}

export function getRangedWeapon(attacker: Pawn | Mob): RangedWeapon | null {
  if (!('equipment' in attacker) || !attacker.equipment) return null;
  for (const slot of ['mainHand', 'offHand'] as const) {
    const inst = attacker.equipment[slot];
    if (!inst) continue;
    const item = itemService.getItemById(inst.itemId);
    const wp = item?.weaponProperties;
    if (item && isRangedWeaponProps(wp)) {
      return {
        itemId: item.id,
        itemName: item.name ?? 'weapon',
        range: wp!.range,
        reach: wp!.reach ?? 0,
        reload: wp!.reload ?? 0,
        strScaled: wp!.strScaled ?? true,
        ammoCategory: wp!.ammoCategory,
        quality: inst.quality,
        famedStatMult: inst.famedStatMult,
        slot,
        projectile: wp!.projectile,
        channeled: wp!.channeled
      };
    }
  }
  return null;
}

export function hasMeleeMainHand(pawn: Pawn): boolean {
  const inst = pawn.equipment?.mainHand;
  if (!inst) return false;
  const wp = itemService.getItemById(inst.itemId)?.weaponProperties;
  return !!wp && !isRangedWeaponProps(wp);
}

export type MeleeGrip = 'twoHanded' | 'shield' | 'dualWield' | 'duelist' | 'oneHanded';
export const DUELIST_TRAIT_ID = 'duelist';
const hasDuelistTraining = (entity: Pawn | Mob): boolean =>
  !!entity.traits?.some((t) => t.id === DUELIST_TRAIT_ID);

export function getGrip(entity: Pawn | Mob): MeleeGrip {
  const eq = 'equipment' in entity ? entity.equipment : undefined;
  if (!eq) return 'oneHanded';
  const mainWp = eq.mainHand
    ? itemService.getItemById(eq.mainHand.itemId)?.weaponProperties
    : undefined;
  if (mainWp?.twoHanded) return 'twoHanded';
  const offArmor = eq.offHand
    ? itemService.getItemById(eq.offHand.itemId)?.armorProperties
    : undefined;
  if (offArmor?.armorType === 'shield') return 'shield';
  const offWp = eq.offHand
    ? itemService.getItemById(eq.offHand.itemId)?.weaponProperties
    : undefined;
  if (mainWp?.offHandable && offWp?.offHandable) return 'dualWield';
  if (mainWp && !eq.offHand && hasDuelistTraining(entity)) return 'duelist';
  return 'oneHanded';
}

export function sumAimBonuses(pawn: Pawn): { accuracy: number; speed: number; range: number } {
  const out = { accuracy: 0, speed: 0, range: 0 };
  const eq = pawn.equipment as Record<string, ItemInstance | undefined> | undefined;
  if (!eq) return out;
  for (const slot in eq) {
    const inst = eq[slot];
    if (!inst) continue;
    const ab = itemService.getItemById(inst.itemId)?.aimBonuses;
    if (!ab) continue;
    out.accuracy += ab.accuracy ?? 0;
    out.speed += ab.speed ?? 0;
    out.range += ab.range ?? 0;
  }
  return out;
}

export interface AmmoPick {
  itemId: string;
  props: NonNullable<Item['ammoProperties']>;
}

export function pickAmmo(pawn: Pawn, category: string): AmmoPick | null {
  const items = pawn.inventory?.items;
  if (!items) return null;
  let best: AmmoPick | null = null;
  let bestScore = -Infinity;
  for (const id in items) {
    if ((items[id] ?? 0) <= 0) continue;
    const props = itemService.getItemById(id)?.ammoProperties;
    if (!props || props.ammoCategory !== category) continue;
    const score = (props.damage ?? 0) + (props.damageBonus ?? 0) + (props.armorPen ?? 0) * 10;
    if (score > bestScore) {
      best = { itemId: id, props };
      bestScore = score;
    }
  }
  return best;
}

export function hasViableAmmo(pawn: Pawn, rw: RangedWeapon): boolean {
  return !rw.ammoCategory || pickAmmo(pawn, rw.ammoCategory) !== null;
}

export function tileDistance(ax: number, ay: number, bx: number, by: number): number {
  return chebyshev(ax, ay, bx, by);
}

export function withinSight(dist: number, visionRange: number): boolean {
  return dist <= visionRange;
}

export { hasLineOfSight, type SightCell } from '../core/util/lineOfSight';

export function pawnVisionRange(pawn: Pawn): number {
  return 10 + ((pawn.stats?.perception ?? 10) - 10) * 0.5;
}

export function effectiveRangedRange(pawn: Pawn, rw: RangedWeapon): number {
  const aimRange = pawnStatService.evaluateStat('aim_range', pawn);
  const equipRange = sumAimBonuses(pawn).range;
  const raw = Math.round(rw.range * aimRange) + equipRange;
  return Math.min(pawnVisionRange(pawn), Math.max(1, raw));
}

export function rangedAccuracyMod(
  aimAccStat: number,
  equipAccBonus: number,
  ammoAccBonus: number,
  dist: number,
  coverPenalty: number
): number {
  return (
    (aimAccStat - 1.0) * AIM_ACC_STAT_POINTS +
    equipAccBonus +
    ammoAccBonus -
    dist * ACC_FALLOFF_PER_TILE -
    coverPenalty * 100
  );
}

export function aimIntervalTicks(
  baseInterval: number,
  reload: number,
  dist: number,
  aimSpeedStat: number,
  equipSpeedBonus: number,
  reloadSpeedStat: number
): number {
  const aimFactor = Math.max(0.4, aimSpeedStat) * Math.max(0.2, 1 + equipSpeedBonus);
  const aimTime = (baseInterval * (1 + dist * AIM_TIME_PER_TILE)) / aimFactor;
  const spanTime = (baseInterval * Math.max(0, reload - 1)) / Math.max(0.4, reloadSpeedStat);
  return Math.max(MIN_SHOT_INTERVAL_TICKS, Math.round(aimTime + spanTime));
}

export function drawSpeedModifier(pawn: Pawn, ammoCategory: string | undefined): number {
  if (ammoCategory !== 'arrow' && ammoCategory !== 'bolt') return 0;
  const eq = pawn.equipment as Record<string, ItemInstance | undefined> | undefined;
  if (!eq) return 0;
  let quiverBonus = 0;
  let hasMatchingQuiver = false;
  let hasContainer = false;
  for (const slot in eq) {
    const inst = eq[slot];
    if (!inst) continue;
    const item = itemService.getItemById(inst.itemId);
    if (!item) continue;
    if (item.quiver?.ammoCategory === ammoCategory) {
      hasMatchingQuiver = true;
      quiverBonus = Math.max(quiverBonus, item.quiver.drawSpeed);
    } else if (item.inventoryBonus && (slot === 'back' || slot === 'belt')) {
      hasContainer = true;
    }
  }
  if (hasMatchingQuiver) return quiverBonus;
  if (hasContainer) return DRAW_FUMBLE_PENALTY;
  return 0;
}
