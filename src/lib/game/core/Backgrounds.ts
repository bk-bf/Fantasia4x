import type { Culture, Kingdom, WealthBand } from './types';
import backgroundsData from '../database/backgrounds.jsonc';
import { rng } from './rng';
import { MAX_WORK_LEVEL } from './workExperience';

// Pawn backgrounds (KINGDOMS-TRADE / BACKGROUNDS). A pawn has a childhood (always) and, if adult, an
// adulthood the childhood makes reachable. Backgrounds are the narrative glue tying a pawn's traits,
// starting experience, inherent standing, and home-kingdom knowledge together — see backgrounds.jsonc.

/** Age at which a pawn is considered an adult and rolls a second (adulthood) background. */
export const ADULT_AGE = 18;

/** ~1-in-8 founders arrive stateless — no fixed homeland (a Wildlands Foundling childhood). */
export const STATELESS_CHANCE = 0.12;

/** Ceiling on seeded home-kingdom knowledge — founders can reach tier 4 (stale) but never "complete". */
export const SEED_KNOWLEDGE_CAP = 200;

export interface Background {
  id: string;
  slot?: 'childhood' | 'adulthood';
  title: string;
  description: string;
  /** Player-facing "what this shaped" line, shown under the flavour on hover. */
  influence?: string;
  weight?: number;
  /** Draw weight for a STARTING colonist (falls back to `weight`). 0 = never a founder; low = rare
   *  at colony start. Migrants ignore it. Keeps a fresh colony off worldly/noble founders. */
  founderWeight?: number;
  // Eligibility on the home kingdom
  kingdomWealth?: WealthBand[];
  raider?: boolean;
  stateless?: boolean;
  // Cohesion (childhood `opens` life-path tags; adulthood `requires` ≥1 of them)
  opens?: string[];
  requires?: string[];
  // Effects
  traitAffinity?: string[];
  traitGuaranteed?: string[];
  experience?: Record<string, [number, number]>;
  prestige?: [number, number];
  homeKnowledge?: [number, number];
  worldliness?: number;
  worldKnowledge?: [number, number];
}

const DATA = backgroundsData as unknown as {
  childhoods: Background[];
  adulthoods: Background[];
};
const CHILDHOODS: Background[] = DATA.childhoods.map((b) => ({ ...b, slot: 'childhood' }));
const ADULTHOODS: Background[] = DATA.adulthoods.map((b) => ({ ...b, slot: 'adulthood' }));
const BY_ID = new Map<string, Background>(
  [...CHILDHOODS, ...ADULTHOODS].map((b) => [b.id, b])
);

export function getBackgroundById(id: string | undefined): Background | undefined {
  return id ? BY_ID.get(id) : undefined;
}

// ─── Weighted pick ─────────────────────────────────────────────────────────

function weightedPick<T>(items: T[], weightOf: (t: T) => number): T | undefined {
  if (items.length === 0) return undefined;
  const total = items.reduce((s, it) => s + Math.max(0, weightOf(it)), 0);
  if (total <= 0) return items[rng.int(0, items.length - 1)];
  let roll = rng.random() * total;
  for (const it of items) {
    roll -= Math.max(0, weightOf(it));
    if (roll < 0) return it;
  }
  return items[items.length - 1];
}

function rollBand(band: [number, number] | undefined): number {
  if (!band) return 0;
  return rng.int(band[0], band[1]);
}

// ─── Origin (kingdom-first) ──────────────────────────────────────────────────

/**
 * Roll a founder's origin: kingdom-FIRST (their people are drawn from the home kingdom's culture mix),
 * with a `STATELESS_CHANCE` of a homeland-less wanderer. Raider kingdoms are somewhat less likely
 * origins than settled ones, but any kingdom can be a home.
 */
export function rollOrigin(
  culturePool: Culture[],
  kingdoms: Kingdom[]
): { homeKingdomId?: string; culture: Culture } {
  if (kingdoms.length === 0 || rng.random() < STATELESS_CHANCE) {
    return { culture: rng.pick(culturePool) };
  }
  const kingdom = weightedPick(kingdoms, (k) =>
    k.relationBias === 'always_hostile' ? 0.4 : 1
  )!;
  let culture: Culture | undefined;
  if (kingdom.cultureMix.length > 0) {
    const share = weightedPick(kingdom.cultureMix, (m) => m.weight);
    culture = culturePool.find((c) => c.id === share?.cultureId);
  }
  return { homeKingdomId: kingdom.id, culture: culture ?? rng.pick(culturePool) };
}

// ─── Eligibility ─────────────────────────────────────────────────────────────

function childhoodEligible(bg: Background, home: Kingdom | undefined): boolean {
  if (!home) return bg.stateless === true; // stateless founders get only stateless childhoods
  if (bg.stateless) return false; // …and a kingdom-born pawn is never a foundling
  const isRaider = home.relationBias === 'always_hostile';
  if ((bg.raider === true) !== isRaider) return false; // raider upbringing ↔ raider kingdoms
  if (bg.kingdomWealth && !bg.kingdomWealth.includes(home.lore.wealthBand)) return false;
  return true;
}

function adulthoodEligible(bg: Background, home: Kingdom | undefined): boolean {
  // A wealth-gated career can only be satisfied by a kingdom rich enough (stateless can't).
  if (bg.kingdomWealth) {
    if (!home) return false;
    if (!bg.kingdomWealth.includes(home.lore.wealthBand)) return false;
  }
  return true;
}

/** An adulthood is reachable only if the childhood opened one of the tags it requires. */
function adulthoodReachable(adult: Background, childhood: Background): boolean {
  const opened = childhood.opens ?? [];
  return (adult.requires ?? []).some((tag) => opened.includes(tag));
}

// ─── Background selection ─────────────────────────────────────────────────────

/** Draw weight for a background. Starting colonists (`forFounder`) use `founderWeight` when set,
 *  so worldly/noble stories can be made rare — or excluded (weight 0) — at colony start only. */
function drawWeight(bg: Background, forFounder: boolean): number {
  return forFounder ? (bg.founderWeight ?? bg.weight ?? 1) : (bg.weight ?? 1);
}

/** A founder-excluded background (`founderWeight: 0`) is dropped from a starting-colony pool. */
function eligibleForRoll(bg: Background, forFounder: boolean): boolean {
  return !(forFounder && bg.founderWeight === 0);
}

/**
 * Roll a pawn's childhood and (if adult) adulthood. Childhood is gated by the home kingdom;
 * adulthood is gated by the childhood's opened tags AND the home kingdom. `forFounder` applies the
 * founder-rarity weights (and excludes `founderWeight: 0`). Falls back gracefully so selection never
 * fails. Under-`ADULT_AGE` pawns get a childhood only.
 */
export function rollBackgrounds(
  home: Kingdom | undefined,
  age: number,
  forFounder = false
): { childhood: Background; adulthood?: Background } {
  const childhood =
    weightedPick(
      CHILDHOODS.filter((c) => childhoodEligible(c, home) && eligibleForRoll(c, forFounder)),
      (c) => drawWeight(c, forFounder)
    ) ??
    weightedPick(
      CHILDHOODS.filter((c) => (home ? !c.stateless : c.stateless)),
      (c) => drawWeight(c, forFounder)
    ) ??
    CHILDHOODS[0];

  if (age < ADULT_AGE) return { childhood };

  const reachable = ADULTHOODS.filter(
    (a) => adulthoodReachable(a, childhood) && eligibleForRoll(a, forFounder)
  );
  const adulthood =
    weightedPick(
      reachable.filter((a) => adulthoodEligible(a, home)),
      (a) => drawWeight(a, forFounder)
    ) ?? weightedPick(reachable, (a) => drawWeight(a, forFounder));
  return { childhood, adulthood: adulthood ?? undefined };
}

// ─── Effects ──────────────────────────────────────────────────────────────────

/** Trait bias for the personal-trait draw: ids to weight up + ids to force in. */
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

/** Add a background's starting-experience bands on top of the base roll (clamped to MAX_WORK_LEVEL). */
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

/** Inherent standing (basePrestige) from station/upbringing — 0 for a plain commoner. */
export function backgroundPrestige(
  childhood: Background | undefined,
  adulthood: Background | undefined
): number {
  return rollBand(childhood?.prestige) + rollBand(adulthood?.prestige);
}

/** Total home-kingdom knowledge xp a pawn's backgrounds contribute (childhood + adulthood). */
export function backgroundHomeKnowledge(
  childhood: Background | undefined,
  adulthood: Background | undefined
): number {
  return rollBand(childhood?.homeKnowledge) + rollBand(adulthood?.homeKnowledge);
}

/** How many OTHER kingdoms a pawn's backgrounds grant partial knowledge of, and the xp band per one. */
export function backgroundWorldliness(
  childhood: Background | undefined,
  adulthood: Background | undefined
): { count: number; band: [number, number] } {
  const count = (childhood?.worldliness ?? 0) + (adulthood?.worldliness ?? 0);
  const band = adulthood?.worldKnowledge ?? childhood?.worldKnowledge ?? [10, 25];
  return { count, band };
}
