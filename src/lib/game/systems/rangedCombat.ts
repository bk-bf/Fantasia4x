/**
 * rangedCombat — pure helpers for RANGED-COMBAT, kept out of the 982-line Combat.ts so the firing
 * logic stays testable and the per-tick combat phase adds no array churn (ENGINE-PERFORMANCE §VI).
 *
 * Aim model: three INDEPENDENT stats (stats.jsonc) give build variety — `aim_accuracy` (PER deadeye),
 * `aim_speed` (DEX quick-draw), `aim_range` (STR draw/throw power). Combat turns each ~1.0 stat into hit
 * points / aim cadence / effective tiles and adds a LINEAR distance term (farther = less accurate AND
 * slower to aim). Equipped items (the weapon + worn marksman gear) add flat `aimBonuses` read directly
 * here — equipment never reaches the stat engine (`getEffectiveStats` is dead), so it can't go via
 * `evaluateStat`.
 *
 * Scope cut (per the user): "line of sight" is a `distance ≤ visionRange` scalar check — NOT
 * spatial-WASM occlusion (ADR-008 untouched). The real `blocksSight` raycast (ADR-019) can replace
 * `withinSight` later without changing callers.
 */
import type { Pawn, Mob, Item, ItemInstance, ItemQuality } from '../core/types';
import { itemService } from '../services/ItemService';
import { pawnStatService } from '../services/PawnStatService';

// ── Tuning constants ───────────────────────────────────────────────────────────
/** Each +1.0 of the `aim_accuracy` stat → this many hit-chance points (PER 20 ≈ +0.4 → +20). */
const AIM_ACC_STAT_POINTS = 50;
/** LINEAR distance falloff: each tile of range costs this many hit-chance points. */
const ACC_FALLOFF_PER_TILE = 2.5;
/** LINEAR aim-time falloff: each tile of range lengthens the aim interval by this fraction. */
const AIM_TIME_PER_TILE = 0.08;

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
  /** §Q craft-quality tier of the equipped instance — scales the shot's damage/accuracy/pen. */
  quality?: ItemQuality;
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
        quality: inst.quality
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

/**
 * Farthest tile this pawn can actually fire `rw` at: the weapon's base `range` scaled by the STR-driven
 * `aim_range` stat, plus flat gear `range` bonuses, hard-capped by `visionRange`. A strong archer draws
 * a bow farther; a war bow (range 10) out-reaches a self bow (6); sight is the ceiling either way.
 */
export function effectiveRangedRange(pawn: Pawn, rw: RangedWeapon): number {
  const aimRange = pawnStatService.evaluateStat('aim_range', pawn);
  const equipRange = sumAimBonuses(pawn).range;
  const raw = Math.round(rw.range * aimRange) + equipRange;
  return Math.min(pawnVisionRange(pawn), Math.max(1, raw));
}

/**
 * Hit-chance points a ranged shot adds to the base to-hit: the `aim_accuracy` stat (PER), flat gear +
 * ammo accuracy, a LINEAR distance penalty (farther = less likely), and cover. Can go negative.
 */
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
 * Aim cadence for one shot: the base attack interval × mechanical reload, LENGTHENED linearly by
 * distance (far targets take longer to line up) and SHORTENED by the `aim_speed` stat (DEX) + gear.
 */
export function aimIntervalTicks(
  baseInterval: number,
  reload: number,
  dist: number,
  aimSpeedStat: number,
  equipSpeedBonus: number
): number {
  const speedFactor = Math.max(0.4, aimSpeedStat) * (1 + equipSpeedBonus);
  const distanceFactor = 1 + dist * AIM_TIME_PER_TILE;
  return Math.max(
    1,
    Math.round((baseInterval * Math.max(1, reload) * distanceFactor) / speedFactor)
  );
}
