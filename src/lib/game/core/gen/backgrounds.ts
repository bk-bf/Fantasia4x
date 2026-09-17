import type { Culture, Kingdom } from '../types';
import { rng } from '../util/rng';
import { MAX_WORK_LEVEL } from '../rules/body/workExperience';
import { getTraitById } from '../defs/lineages';
import { WEALTH_BANDS } from './kingdom';
import { type Background, CHILDHOODS, ADULTHOODS } from '../defs/backgrounds';

export const ADULT_AGE = 18;

export const STATELESS_CHANCE = 0.12;

function rollBand(band: [number, number] | undefined): number {
  if (!band) return 0;
  return rng.int(band[0], band[1]);
}

const ORIGIN_SCALE_WEIGHT = [1.6, 1.4, 1.0, 0.6, 0.3];

export function rollOrigin(
  culturePool: Culture[],
  kingdoms: Kingdom[]
): { homeKingdomId?: string; culture: Culture } {
  if (kingdoms.length === 0 || rng.random() < STATELESS_CHANCE) {
    return { culture: rng.pick(culturePool) };
  }
  const kingdom = rng.pickWeighted(kingdoms, (k) => {
    if (k.relationBias === 'always_hostile') return 0.4;
    const idx = WEALTH_BANDS.indexOf(k.lore.wealthBand);
    return ORIGIN_SCALE_WEIGHT[idx < 0 ? 2 : idx];
  })!;
  let culture: Culture | undefined;
  if (kingdom.cultureMix.length > 0) {
    const share = rng.pickWeighted(kingdom.cultureMix, (m) => m.weight);
    culture = culturePool.find((c) => c.id === share?.cultureId);
  }
  return { homeKingdomId: kingdom.id, culture: culture ?? rng.pick(culturePool) };
}

function childhoodEligible(bg: Background, home: Kingdom | undefined): boolean {
  if (!home) return bg.stateless === true;
  if (bg.stateless) return false;
  const isRaider = home.relationBias === 'always_hostile';
  if ((bg.raider === true) !== isRaider) return false;
  if (bg.kingdomWealth && !bg.kingdomWealth.includes(home.lore.wealthBand)) return false;
  return true;
}

function adulthoodEligible(bg: Background, home: Kingdom | undefined): boolean {
  if (bg.kingdomWealth) {
    if (!home) return false;
    if (!bg.kingdomWealth.includes(home.lore.wealthBand)) return false;
  }
  return true;
}

function adulthoodReachable(adult: Background, childhood: Background): boolean {
  const opened = childhood.opens ?? [];
  return (adult.requires ?? []).some((tag) => opened.includes(tag));
}

function drawWeight(bg: Background, forFounder: boolean): number {
  return forFounder ? (bg.founderWeight ?? bg.weight ?? 1) : (bg.weight ?? 1);
}

function eligibleForRoll(bg: Background, forFounder: boolean): boolean {
  return !(forFounder && bg.founderWeight === 0);
}

export function rollBackgrounds(
  home: Kingdom | undefined,
  age: number,
  forFounder = false
): { childhood: Background; adulthood?: Background } {
  const childhood =
    rng.pickWeighted(
      CHILDHOODS.filter((c) => childhoodEligible(c, home) && eligibleForRoll(c, forFounder)),
      (c) => drawWeight(c, forFounder)
    ) ??
    rng.pickWeighted(
      CHILDHOODS.filter((c) => (home ? !c.stateless : c.stateless)),
      (c) => drawWeight(c, forFounder)
    ) ??
    CHILDHOODS[0];

  if (age < ADULT_AGE) return { childhood };

  const reachable = ADULTHOODS.filter(
    (a) => adulthoodReachable(a, childhood) && eligibleForRoll(a, forFounder)
  );
  const adulthood =
    rng.pickWeighted(
      reachable.filter((a) => adulthoodEligible(a, home)),
      (a) => drawWeight(a, forFounder)
    ) ?? rng.pickWeighted(reachable, (a) => drawWeight(a, forFounder));
  return { childhood, adulthood: adulthood ?? undefined };
}

function skillLabel(cat: string): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

function traitNames(ids: string[]): string {
  const names = ids.map((id) => getTraitById(id)?.name ?? id);
  return names.join(', ');
}

export function describeBackgroundEffects(bg: Background): string[] {
  const out: string[] = [];
  const traits = [...(bg.traitGuaranteed ?? []), ...(bg.traitAffinity ?? [])];
  if (traits.length > 0) out.push(`Leans toward ${traitNames(traits)}`);
  const skills = Object.keys(bg.experience ?? {});
  if (skills.length > 0) out.push(`A head start in ${skills.map(skillLabel).join(', ')}`);
  if (bg.prestige && bg.prestige[1] > 0) out.push('Carries some standing');
  if (bg.knows) out.push(`Knows ${bg.knows}`);
  if ((bg.worldliness ?? 0) > 0) out.push('Well-travelled, with word of distant realms');
  return out;
}

export function backgroundTraitAffinity(
  childhood: Background | undefined,
  adulthood: Background | undefined
): { boost: Set<string>; guaranteed: string[] } {
  const boost = new Set<string>();
  const guaranteed: string[] = [];
  for (const bg of [childhood, adulthood]) {
    if (!bg) continue;
    for (const id of bg.traitAffinity ?? []) boost.add(id);
    for (const id of bg.traitGuaranteed ?? []) guaranteed.push(id);
  }
  return { boost, guaranteed };
}

export function applyBackgroundExperience(
  skills: Record<string, number>,
  childhood: Background | undefined,
  adulthood: Background | undefined
): Record<string, number> {
  const out = { ...skills };
  for (const bg of [childhood, adulthood]) {
    if (!bg?.experience) continue;
    for (const [cat, band] of Object.entries(bg.experience)) {
      out[cat] = Math.min(MAX_WORK_LEVEL, (out[cat] ?? 1) + rollBand(band));
    }
  }
  return out;
}

export function backgroundPrestige(
  childhood: Background | undefined,
  adulthood: Background | undefined
): number {
  return rollBand(childhood?.prestige) + rollBand(adulthood?.prestige);
}

export function backgroundHomeKnowledge(
  childhood: Background | undefined,
  adulthood: Background | undefined
): number {
  return rollBand(childhood?.homeKnowledge) + rollBand(adulthood?.homeKnowledge);
}

export function backgroundWorldliness(
  childhood: Background | undefined,
  adulthood: Background | undefined
): { count: number; band: [number, number] } {
  const count = (childhood?.worldliness ?? 0) + (adulthood?.worldliness ?? 0);
  const band = adulthood?.worldKnowledge ?? childhood?.worldKnowledge ?? [10, 25];
  return { count, band };
}
