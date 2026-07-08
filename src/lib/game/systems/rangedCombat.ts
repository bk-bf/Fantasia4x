/**
 * Pure ranged-combat helpers, kept out of Combat.ts so firing logic stays testable.
 *
 * Aim model: three independent stats — `aim_accuracy` (PER), `aim_speed` (DEX), `aim_range` (STR) —
 * plus a LINEAR distance term (farther = less accurate AND slower to aim). Equipped items add flat
 * `aimBonuses` read directly here — equipment never reaches the stat engine, so it can't go via
 * `evaluateStat`.
 *
 * Line of sight is combat-local and cheap: a `distance ≤ visionRange` scalar (`withinSight`) plus a
 * per-shot Bresenham `blocksSight` line (`hasLineOfSight`) — NOT the parked WASM fog-of-war raycast.
 */
import type { Pawn, Mob, Item, ItemInstance, ItemQuality } from '../core/types';
import { chebyshev } from '../core/distance';
import { itemService } from '../services/ItemService';
import { pawnStatService } from '../services/PawnStatService';

/** Each +1.0 of the `aim_accuracy` stat → this many hit-chance points (PER 20 ≈ +0.4 → +20). */
const AIM_ACC_STAT_POINTS = 50;
/** LINEAR distance falloff: each tile of range costs this many hit-chance points. */
const ACC_FALLOFF_PER_TILE = 2.5;
/** LINEAR aim-time falloff: each tile of range lengthens the aim interval by this fraction. */
const AIM_TIME_PER_TILE = 0.08;
/** Cadence floor in ticks. MIRRORS melee's `MIN_ATTACK_INTERVAL_TICKS` (72 = 1.2 s @ 60 TPS) so a
 *  built archer can't out-cycle a duelist. Duplicated, not imported, to avoid a rangedCombat → Combat cycle. */
const MIN_SHOT_INTERVAL_TICKS = 72;
/** Aim-speed penalty for drawing arrows/bolts from a pack (no ready quiver) — a fumbling nock. */
const DRAW_FUMBLE_PENALTY = -0.2;

/** A weapon counts as ranged when its `range` reaches past melee (all melee weapons author range 0). */
export function isRangedWeaponProps(
  wp: NonNullable<Item['weaponProperties']> | undefined
): boolean {
  return !!wp && (wp.range ?? 0) > 1;
}

/** A *thrown* weapon: ranged, no ammo bucket (self-consumes), one-handed → lives in the OFF hand so it
 *  pairs with a melee main-hand (the hybrid STR/PER build, instead of a shield). */
export function isThrownWeaponProps(
  wp: NonNullable<Item['weaponProperties']> | undefined
): boolean {
  return isRangedWeaponProps(wp) && !wp!.ammoCategory && !wp!.twoHanded;
}

export interface RangedWeapon {
  itemId: string;
  itemName: string;
  /** Base reach in tiles — the weapon's own limit, scaled by `aim_range` and capped by sight. */
  range: number;
  /** Melee reach (usually 0 for a bow) — at/under this the bow-butt fallback applies. */
  reach: number;
  /** Attack-interval multiplier added after a shot (crossbow 3 = a third the cadence of a bow). */
  reload: number;
  /** Does damage scale with STR (bows yes; crossbows/slings no — mechanical advantage)? */
  strScaled: boolean;
  /** Ammo bucket this weapon draws; undefined = self-thrown (no ammo). */
  ammoCategory?: string;
  /** Craft-quality tier of the equipped instance — scales the shot's damage/accuracy/pen. */
  quality?: ItemQuality;
  /** Famed stat-explosion multiplier of the equipped instance (×2–5, layered over the quality tier). */
  famedStatMult?: number;
  /** Which hand holds it — a thrown weapon's slot is cleared when it leaves the hand (self-consume). */
  slot: 'mainHand' | 'offHand';
  /** Visual particle style for the flight (thrown weapon's own; launchers override from the ammo). */
  projectile?: string;
  /** CHANNELED staff: ammo-less like a thrown weapon, but pays `staminaCost` as mana and is NOT
   *  self-consumed (stays in hand) — so the no-ammo firing branch must keep it equipped. */
  channeled?: boolean;
}

/** The equipped ranged weapon for a pawn — main-hand first (bow/crossbow/sling), then off-hand
 *  (a thrown weapon), or null. Mobs carry no equipment → no ranged yet. */
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

/** True when the pawn holds a real MELEE weapon in the main hand — so a hybrid (sword + off-hand
 *  thrown spear) melees with the sword rather than bow-butting the spear. */
export function hasMeleeMainHand(pawn: Pawn): boolean {
  const inst = pawn.equipment?.mainHand;
  if (!inst) return false;
  const wp = itemService.getItemById(inst.itemId)?.weaponProperties;
  return !!wp && !isRangedWeaponProps(wp);
}

/**
 * MELEE grip, derived from what's in the hands: twoHanded (+offense, incl. bows used as a stave);
 * shield (off-hand shield — no offense bonus, raises the wearer's dodge; there is NO active block,
 * defence is all dodge); duelist (1H with off-hand FREE: +damage/+armorPen/+crit); oneHanded (1H
 * with off-hand occupied by a non-shield: neutral). Melee only — the ranged path never calls `attackerProfile`.
 */
export type MeleeGrip = 'twoHanded' | 'shield' | 'duelist' | 'oneHanded';
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
  if (mainWp && !eq.offHand) return 'duelist';
  return 'oneHanded';
}

/** Sum the flat `aimBonuses` across every equipped slot (the ranged weapon's personality + worn
 *  marksman gear). Read directly because equipment never reaches `evaluateStat`. */
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

/**
 * Best available ammo in inventory matching `category` ("best" = highest damageBonus + armorPen).
 * Ammo rides normal inventory BY DESIGN — a quiver sells draw SPEED, not storage.
 */
export function pickAmmo(pawn: Pawn, category: string): AmmoPick | null {
  const items = pawn.inventory?.items;
  if (!items) return null;
  let best: AmmoPick | null = null;
  let bestScore = -Infinity;
  for (const id in items) {
    if ((items[id] ?? 0) <= 0) continue;
    const props = itemService.getItemById(id)?.ammoProperties;
    if (!props || props.ammoCategory !== category) continue;
    const score = (props.damageBonus ?? 0) + (props.armorPen ?? 0) * 10;
    if (score > bestScore) {
      best = { itemId: id, props };
      bestScore = score;
    }
  }
  return best;
}

/** Can this pawn actually fire `rw` right now? A thrown weapon (no ammoCategory) IS its own ammo, so
 *  it's always loaded; a launcher needs a matching ammo stack in inventory. */
export function hasViableAmmo(pawn: Pawn, rw: RangedWeapon): boolean {
  return !rw.ammoCategory || pickAmmo(pawn, rw.ammoCategory) !== null;
}

/** Chebyshev (king-move) tile distance — the metric combat already uses for adjacency. */
export function tileDistance(ax: number, ay: number, bx: number, by: number): number {
  return chebyshev(ax, ay, bx, by);
}

/** Reduced line-of-sight: the target is "in sight" if within the attacker's vision range. */
export function withinSight(dist: number, visionRange: number): boolean {
  return dist <= visionRange;
}

// Line-of-sight lives in core/lineOfSight.ts (shared with mob AI); re-exported for combat callers.
export { hasLineOfSight, type SightCell } from '../core/lineOfSight';

/**
 * Base perception-driven sight range. NOTE: `visionRange` is a Pawns.ts ability, NOT a stats.jsonc
 * stat — `pawnStatService.evaluateStat('visionRange')` would return the 1.0 fallback, so compute it
 * directly. It's ≥ the light-scaled `pawnVisionTiles`, so it never contradicts the FSM's perception gate.
 */
export function pawnVisionRange(pawn: Pawn): number {
  return 10 + ((pawn.stats?.perception ?? 10) - 10) * 0.5;
}

/** Farthest firable tile: weapon `range` scaled by `aim_range` (STR), plus flat gear bonuses,
 *  hard-capped by `visionRange`. */
export function effectiveRangedRange(pawn: Pawn, rw: RangedWeapon): number {
  const aimRange = pawnStatService.evaluateStat('aim_range', pawn);
  const equipRange = sumAimBonuses(pawn).range;
  const raw = Math.round(rw.range * aimRange) + equipRange;
  return Math.min(pawnVisionRange(pawn), Math.max(1, raw));
}

/** Hit-chance points added to the base to-hit: `aim_accuracy` (PER), flat gear + ammo accuracy,
 *  a LINEAR distance penalty, and cover. Can go negative. */
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

/**
 * Cadence for one shot = AIM time + SPAN time, each with its OWN stat: AIM is lengthened linearly by
 * distance and shortened by `aim_speed` + draw gear (every ranged weapon pays it); SPAN is the crank —
 * `(reload − 1)` extra base intervals shortened by `reload_speed`, zero for reload ≤ 1, distance-independent.
 */
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
  // Floor at the melee minimum so a high-DEX / aim-geared archer can't out-cycle the melee cap.
  return Math.max(MIN_SHOT_INTERVAL_TICKS, Math.round(aimTime + spanTime));
}

/**
 * Draw-speed delta by how the ammo is carried: matching quiver → bonus; worn pack/container (ammo
 * stowed, not ready) → fumble penalty; else neutral. ONLY arrows/bolts care — sling stones and
 * thrown weapons deploy equally fast from a belt pouch or the hand.
 */
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
