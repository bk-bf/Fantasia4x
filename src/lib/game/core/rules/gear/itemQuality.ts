import type { Item, ItemQuality } from '../../types/items';

type WeaponProps = NonNullable<Item['weaponProperties']>;
type ArmorProps = NonNullable<Item['armorProperties']>;

const WEAPON_QUALITY_FIELDS = [
  'damage',
  'damMin',
  'damMax',
  'accuracy',
  'critMod',
  'armorPenetration'
] as const;

const ARMOR_QUALITY_FIELDS = ['defense', 'armorValue'] as const;

interface QualityTier {
  name: string;
  prefix: string;
  multiplier: number;
  color: string;
}

export const QUALITY_TIERS: readonly QualityTier[] = [
  { name: 'Crude', prefix: 'Crude', multiplier: 0.8, color: '#7a5c20' },
  { name: 'Standard', prefix: '', multiplier: 1.0, color: '#d4a840' },
  { name: 'Fine', prefix: 'Fine', multiplier: 1.15, color: '#68b030' },
  { name: 'Superior', prefix: 'Superior', multiplier: 1.3, color: '#4a90d8' },
  { name: 'Masterwork', prefix: 'Masterwork', multiplier: 1.5, color: '#a060d0' },
  { name: 'Legendary', prefix: 'Legendary', multiplier: 1.8, color: '#f0c020' }
] as const;

export const STANDARD_QUALITY: ItemQuality = 1;

const clampTier = (n: number): ItemQuality =>
  Math.max(0, Math.min(5, Math.round(n))) as ItemQuality;

export function rollCraftQuality(craftingQualityAxis: number, rand: () => number): ItemQuality {
  let score = craftingQualityAxis + (rand() * 2 - 1) * 0.18;
  if (craftingQualityAxis > 1.0 && rand() < 0.04 + (craftingQualityAxis - 1.0) * 0.12) {
    score += 0.25;
  }
  if (score < 0.8) return 0;
  if (score < 1.2) return 1;
  if (score < 1.55) return 2;
  if (score < 1.85) return 3;
  if (score < 2.15) return 4;
  return 5;
}

export function qualityMultiplier(quality: ItemQuality | undefined): number {
  if (quality === undefined) return 1.0;
  return QUALITY_TIERS[clampTier(quality)].multiplier;
}

export function combinedQualityMultiplier(
  quality: ItemQuality | undefined,
  famedStatMult?: number
): number {
  const q = qualityMultiplier(quality);
  return famedStatMult && famedStatMult > 0 ? q * famedStatMult : q;
}

export function qualityPrefix(quality: ItemQuality | undefined): string {
  if (quality === undefined) return '';
  return QUALITY_TIERS[clampTier(quality)].prefix;
}

export function qualityColor(quality: ItemQuality | undefined): string | undefined {
  if (quality === undefined || quality === STANDARD_QUALITY) return undefined;
  return QUALITY_TIERS[clampTier(quality)].color;
}

export function qualityName(quality: ItemQuality | undefined): string {
  if (quality === undefined) return QUALITY_TIERS[STANDARD_QUALITY].name;
  return QUALITY_TIERS[clampTier(quality)].name;
}

export function scaleWeaponQuality(
  wp: WeaponProps,
  quality: ItemQuality | undefined,
  famedStatMult?: number
): WeaponProps {
  const mult = combinedQualityMultiplier(quality, famedStatMult);
  if (mult === 1.0) return wp;
  const out: WeaponProps = { ...wp };
  for (const f of WEAPON_QUALITY_FIELDS) {
    const v = out[f];
    if (typeof v === 'number') out[f] = v * mult;
  }
  return out;
}

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
