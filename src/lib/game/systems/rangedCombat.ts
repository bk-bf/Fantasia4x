/**
 * rangedCombat — pure helpers for RANGED-COMBAT, kept out of the 982-line Combat.ts so the firing
 * logic stays testable and the per-tick combat phase adds no array churn (ENGINE-PERFORMANCE §VI).
 *
 * Scope cut (per the user): "line of sight" is reduced to a `distance ≤ visionRange` stat check —
 * a scalar comparison, NOT spatial-WASM occlusion (ADR-008 untouched). The real `blocksSight`
 * raycast (ADR-019) can replace `withinSight` later without changing callers.
 */
import type { Pawn, Mob, Item, ItemQuality } from '../core/types';
import { itemService } from '../services/ItemService';

/** A weapon counts as ranged when its `range` reaches past melee (all melee weapons author range 0). */
export function isRangedWeaponProps(wp: NonNullable<Item['weaponProperties']> | undefined): boolean {
  return !!wp && (wp.range ?? 0) > 1;
}

export interface RangedWeapon {
  itemId: string;
  itemName: string;
  /** Max tiles the shot can reach. */
  range: number;
  /** Melee reach (usually 0 for a bow) — at/under this the bow-butt fallback applies. */
  reach: number;
  /** Attack-interval multiplier added after a shot (crossbow 3 = a third the cadence of a bow). */
  reload: number;
  /** Does damage scale with STR (bows yes; crossbows/slings no — mechanical advantage)? */
  strScaled: boolean;
  /** Ammo bucket this weapon draws; undefined = self-thrown (no ammo). */
  ammoCategory?: string;
  /** §Q craft-quality tier of the equipped instance — scales the shot's damage/accuracy/pen. */
  quality?: ItemQuality;
}

/** The equipped ranged weapon for a pawn, or null (mobs carry no equipment → no ranged yet). */
export function getRangedWeapon(attacker: Pawn | Mob): RangedWeapon | null {
  if (!('equipment' in attacker) || !attacker.equipment?.mainHand) return null;
  const item = itemService.getItemById(attacker.equipment.mainHand.itemId);
  const wp = item?.weaponProperties;
  if (!item || !isRangedWeaponProps(wp)) return null;
  return {
    itemId: item.id,
    itemName: item.name ?? 'weapon',
    range: wp!.range,
    reach: wp!.reach ?? 0,
    reload: wp!.reload ?? 0,
    strScaled: wp!.strScaled ?? true,
    ammoCategory: wp!.ammoCategory,
    quality: attacker.equipment.mainHand.quality
  };
}

export interface AmmoPick {
  itemId: string;
  props: NonNullable<Item['ammoProperties']>;
}

/**
 * The best available ammo in the pawn's inventory matching `category`, or null. "Best" = highest
 * damageBonus + armorPen (cheap heuristic — better ammo wins, the dynamic-material philosophy).
 * Ammo rides normal inventory for now (the quiver/haul logistics loop is deferred — see the spec).
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

/** Chebyshev (king-move) tile distance — the metric combat already uses for adjacency. */
export function tileDistance(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/**
 * Accuracy falloff with distance: 0 at the optimal mid-range band, climbing to 0.4 at the edge of
 * range. Point-blank is fine, the sweet spot is mid-range, the fringe is hard — so `range` is a real
 * stat, not just reach. Returned as a 0–1 fraction (callers scale ×100 into the hit-chance points).
 */
export function rangedDistancePenalty(dist: number, range: number): number {
  const optimalRange = Math.ceil(range * 0.5);
  return Math.max(0, Math.min((dist - optimalRange) * 0.04, 0.4));
}

/** Reduced line-of-sight: the target is "in sight" if within the attacker's vision range. */
export function withinSight(dist: number, visionRange: number): boolean {
  return dist <= visionRange;
}

/**
 * Base perception-driven sight range — mirrors the `visionRange` ability in Pawns.ts
 * (`10 + (perception − 10) × 0.5`). NOTE: `visionRange` is a Pawns.ts ability, NOT a stats.jsonc
 * stat, so `pawnStatService.evaluateStat('visionRange')` would return the 1.0 fallback — compute it
 * directly. No light scaling (the reduced-LoS scope); it's ≥ the light-scaled `pawnVisionTiles`, so it
 * never contradicts the FSM's perception gate.
 */
export function pawnVisionRange(pawn: Pawn): number {
  return 10 + ((pawn.stats?.perception ?? 10) - 10) * 0.5;
}
