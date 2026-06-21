// PRODUCTION-CHAIN-II §Q — Item Quality Prefixes.
//
// Every crafted equipment/tool is rolled to a discrete quality TIER (0–5) at completion. The tier
// stamps a stat multiplier onto the item and shows as a name prefix + colour. This is the home of
// the long-blocked R8: `stats.jsonc` defines a `crafting_quality` work-axis that the work model
// computes per craft, but until now nothing mapped it to a tier, stamped it, or read it back.
//
// Flow: `rollCraftQuality(craftingQualityAxis, rng)` → tier stamped on the output `DroppedItem`
// (and propagated to the `ItemInstance` on equip/pickup, exactly like per-stack durability) →
// `qualityMultiplier(tier)` scales the item's quality-relevant properties at the existing reader
// sites (Combat weapon/armor, PawnStatService tool boost) → `qualityPrefix`/`qualityColor` drive
// the display. Tier 1 (Standard) is the unmarked baseline: no prefix, ×1.0, no colour shift.
import type { Item, ItemQuality } from './types/items';

type WeaponProps = NonNullable<Item['weaponProperties']>;
type ArmorProps = NonNullable<Item['armorProperties']>;

// Quality-relevant weapon fields — damage/accuracy/crit/armour-pen scale with the tier. Weight, reach,
// reload, ammo, stamina cost etc. are intrinsic to the design and are NOT scaled.
const WEAPON_QUALITY_FIELDS = [
  'damage',
  'damMin',
  'damMax',
  'accuracy',
  'critMod',
  'armorPenetration'
] as const;

// Quality-relevant armour fields — protective value scales with the tier.
const ARMOR_QUALITY_FIELDS = ['defense', 'armorValue'] as const;

interface QualityTier {
  /** Display tier name. */
  name: string;
  /** Name prefix prepended to the item (empty for the Standard baseline). */
  prefix: string;
  /** Multiplier on the item's quality-relevant properties (NOT weight/fuel/cost). */
  multiplier: number;
  /** Display colour — grey → amber → green → blue → purple → gold (palette convention). */
  color: string;
}

// Discrete DF/RimWorld-style tiers. Index = the stored `quality` value (0–5).
export const QUALITY_TIERS: readonly QualityTier[] = [
  { name: 'Crude', prefix: 'Crude', multiplier: 0.8, color: '#7a5c20' }, // 0 — dim/grey-brown
  { name: 'Standard', prefix: '', multiplier: 1.0, color: '#d4a840' }, // 1 — default amber
  { name: 'Fine', prefix: 'Fine', multiplier: 1.15, color: '#68b030' }, // 2 — green
  { name: 'Superior', prefix: 'Superior', multiplier: 1.3, color: '#4a90d8' }, // 3 — blue
  { name: 'Masterwork', prefix: 'Masterwork', multiplier: 1.5, color: '#a060d0' }, // 4 — purple
  { name: 'Legendary', prefix: 'Legendary', multiplier: 1.8, color: '#f0c020' } // 5 — gold
] as const;

/** Tier 1 (Standard) is the unmarked baseline used when an item carries no rolled quality. */
export const STANDARD_QUALITY: ItemQuality = 1;

const clampTier = (n: number): ItemQuality =>
  Math.max(0, Math.min(5, Math.round(n))) as ItemQuality;

/**
 * Roll a quality tier from the pawn's `crafting_quality` work-axis (1.0 = average crafter, higher =
 * skilled, lower = injured/dark/rushed — the axis already folds in DEX/INT and the sight/manipulation/
 * consciousness capacities, so dim light or wounds depress it through the existing model).
 *
 * Thresholds map the axis to a tier; a ±0.18 jitter keeps identical crafters from being deterministic;
 * a small skill-scaled long tail makes Legendary reachable for masters but rare for journeymen.
 */
export function rollCraftQuality(craftingQualityAxis: number, rand: () => number): ItemQuality {
  let score = craftingQualityAxis + (rand() * 2 - 1) * 0.18;
  // Master-crafter long tail: above-average skill gets a small chance to bump one band up.
  if (craftingQualityAxis > 1.0 && rand() < 0.04 + (craftingQualityAxis - 1.0) * 0.12) {
    score += 0.25;
  }
  if (score < 0.85) return 0; // Crude
  if (score < 1.12) return 1; // Standard
  if (score < 1.38) return 2; // Fine
  if (score < 1.62) return 3; // Superior
  if (score < 1.9) return 4; // Masterwork
  return 5; // Legendary
}

/** Multiplier applied to an item's quality-relevant properties. Undefined/standard → 1.0. */
export function qualityMultiplier(quality: ItemQuality | undefined): number {
  if (quality === undefined) return 1.0;
  return QUALITY_TIERS[clampTier(quality)].multiplier;
}

/**
 * PRODUCTION-CHAIN-III §I: the full stat multiplier = the §Q tier multiplier × the Famed stat-
 * explosion (×2–5, layered on top — a Famed Masterwork is absurd). `famedStatMult` is the per-
 * instance value stamped by `rollFamedIdentity`; absent / ≤0 → no explosion (the common case), so the
 * result collapses to plain `qualityMultiplier(quality)` and the hot-path callers keep their
 * no-allocation early-return.
 */
export function combinedQualityMultiplier(
  quality: ItemQuality | undefined,
  famedStatMult?: number
): number {
  const q = qualityMultiplier(quality);
  return famedStatMult && famedStatMult > 0 ? q * famedStatMult : q;
}

/** Name prefix for a tier (e.g. "Masterwork"); empty string for the Standard baseline. */
export function qualityPrefix(quality: ItemQuality | undefined): string {
  if (quality === undefined) return '';
  return QUALITY_TIERS[clampTier(quality)].prefix;
}

/** Display colour for a tier; undefined when Standard (no colour shift needed). */
export function qualityColor(quality: ItemQuality | undefined): string | undefined {
  if (quality === undefined || quality === STANDARD_QUALITY) return undefined;
  return QUALITY_TIERS[clampTier(quality)].color;
}

/** Tier display name (e.g. "Superior"). */
export function qualityName(quality: ItemQuality | undefined): string {
  if (quality === undefined) return QUALITY_TIERS[STANDARD_QUALITY].name;
  return QUALITY_TIERS[clampTier(quality)].name;
}

/**
 * Return weapon properties scaled by quality (R8 consume side). At Standard/undefined the original is
 * returned unchanged (no allocation in the hot combat path); otherwise a shallow copy with the
 * quality-relevant fields multiplied. Used by Combat when resolving an equipped weapon's attack.
 */
export function scaleWeaponQuality(
  wp: WeaponProps,
  quality: ItemQuality | undefined,
  famedStatMult?: number
): WeaponProps {
  const mult = combinedQualityMultiplier(quality, famedStatMult);
  if (mult === 1.0) return wp; // common path: no allocation (peace + ordinary gear)
  const out: WeaponProps = { ...wp };
  for (const f of WEAPON_QUALITY_FIELDS) {
    const v = out[f];
    if (typeof v === 'number') out[f] = v * mult;
  }
  return out;
}

/** Return armour properties scaled by quality (R8 consume side) + the §I Famed explosion.
 *  Standard/undefined and non-Famed → unchanged (no allocation). */
export function scaleArmorQuality(
  ap: ArmorProps,
  quality: ItemQuality | undefined,
  famedStatMult?: number
): ArmorProps {
  const mult = combinedQualityMultiplier(quality, famedStatMult);
  if (mult === 1.0) return ap;
  const out: ArmorProps = { ...ap };
  for (const f of ARMOR_QUALITY_FIELDS) {
    const v = out[f];
    if (typeof v === 'number') out[f] = v * mult;
  }
  return out;
}
