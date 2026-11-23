import type { Trait } from '$lib/game/core/types';
import type { GlyphName } from '$lib/pixelArt/glyphs';
import type { BadgeKind } from '$lib/pixelArt/skins';
import type { ConditionView } from '$lib/components/util/conditionInfo';

const TRAIT_GLYPH: Record<NonNullable<Trait['kind']>, GlyphName> = {
  stat: 'hammer',
  attribute: 'eye',
  naturalGear: 'shield',
  passive: 'pine',
  wound: 'drop',
  bodyMod: 'paw'
};

export function traitBadge(t: Trait): { glyph: GlyphName; kind: BadgeKind } {
  if (t.rarity === 'negative') return { glyph: 'bang', kind: 'neg' };
  return { glyph: t.kind ? TRAIT_GLYPH[t.kind] : 'lone', kind: 'trait' };
}

const COLD = new Set(['windchilled', 'hypothermia', 'wet']);
const HOT = new Set(['heat_stroke']);
const FED = new Set(['well_fed', 'hearty_meal', 'nourished', 'trail_fed', 'well_provisioned']);
const WARMED = new Set(['warmed_through', 'stock_warmed', 'banked_warmth']);
const WATERED = new Set(['cool_slaked', 'deep_slaked', 'clean']);

const lowerIsBetter = (key: string) => key.endsWith('Rate') || key === 'pain';
const additive = (key: string) => key.includes('_') || key === 'stamina';

export function modifierLean(mods: Record<string, number | undefined>): number {
  let lean = 0;
  for (const [key, v] of Object.entries(mods)) {
    if (v == null) continue;
    const better = lowerIsBetter(key) ? v < 1 : additive(key) ? v > 0 : v > 1;
    const worse = lowerIsBetter(key) ? v > 1 : additive(key) ? v < 0 : v < 1;
    lean += better ? 1 : worse ? -1 : 0;
  }
  return lean;
}

export function conditionKind(v: ConditionView): BadgeKind {
  if (v.lifeThreatening) return 'neg';
  if (COLD.has(v.id)) return 'cold';
  return modifierLean(v.modifiers) > 0 ? 'good' : 'warn';
}

const SEVERITY_RANK: Record<BadgeKind, number> = { neg: 0, warn: 1, cold: 1, trait: 2, good: 3 };

export function bySeverity(a: ConditionView, b: ConditionView): number {
  return (
    SEVERITY_RANK[conditionKind(a)] - SEVERITY_RANK[conditionKind(b)] ||
    (b.severityPct ?? 0) - (a.severityPct ?? 0)
  );
}

export function conditionBadge(v: ConditionView): { glyph: GlyphName; kind: BadgeKind } {
  const kind = conditionKind(v);
  if (COLD.has(v.id)) return { glyph: v.id === 'wet' ? 'drop' : 'snow', kind };
  if (HOT.has(v.id) || WARMED.has(v.id)) return { glyph: 'flame', kind };
  if (FED.has(v.id)) return { glyph: 'bowl', kind };
  if (WATERED.has(v.id)) return { glyph: 'drop', kind };
  if (kind === 'neg') return { glyph: 'bang', kind };
  return { glyph: kind === 'good' ? 'sprout' : 'flame', kind };
}

export const BADGE_TONE: Record<BadgeKind, string> = {
  warn: 'var(--ember)',
  cold: 'var(--cold)',
  good: 'var(--pos)',
  neg: 'var(--neg)',
  trait: 'var(--accent-hi)'
};
