import type {
  Culture,
  CultureRelation,
  Kingdom,
  KingdomCultureShare,
  KingdomFamedItems,
  KingdomLore,
  KingdomRelation,
  WealthBand
} from './types';
import { COLONY_RELATION_ID } from './types';
import loreData from '../database/social/kingdom-lore.jsonc';
import { rng } from './rng';
import { clamp } from './math';

// Fork of the culture generator (core/Culture.ts) for the world's political layer
// (KINGDOMS-TRADE). Kingdoms are downstream from the culture pool: each is a weighted
// blend of existing cultures — no new cultures are minted here.

const LORE = loreData as unknown as {
  nameStems: string[];
  scaleTiers: { polities: string[]; forms: string[] }[];
  raiderPolities: string[];
  raiderNameForms: string[];
  epithetsSmall: string[];
  epithetsGrand: string[];
  raiderEpithets: string[];
  temperaments: string[];
  raiderTemperaments: string[];
  leaderTitlesByTier: string[][];
  raiderLeaderTitles: string[];
  leaderGivenNames: string[];
  leaderEpithets: string[];
  capitalPrefixes: string[];
  capitalSuffixes: string[];
  humbleHistory: string[];
  grandHistory: string[];
  raiderHistory: string[];
  figureRoles: string[];
  famedItemMaterials: string[];
  famedItemTypes: string[];
  famedItemEpithets: string[];
};

// ── Scale = wealth. Per-tier [min,max] counts, indexed by wealthIdx 0 (hamlet) .. 4 (empire). ──
const HISTORY_COUNT: [number, number][] = [[0, 1], [1, 1], [1, 2], [2, 3], [3, 4]];
const FIGURE_COUNT: [number, number][] = [[0, 0], [0, 1], [1, 2], [2, 3], [3, 4]];
const FAMED_CREATED_COUNT: [number, number][] = [[0, 0], [0, 0], [0, 1], [1, 2], [2, 3]];
const FAMED_HELD_COUNT: [number, number][] = [[0, 0], [0, 1], [0, 1], [1, 2], [2, 3]];
const TOWN_COUNT: [number, number][] = [[0, 0], [0, 1], [1, 3], [2, 6], [5, 12]];
const VILLAGE_COUNT: [number, number][] = [[0, 1], [1, 3], [2, 5], [4, 10], [8, 20]];

/** The "town and up" threshold: index ≥ 2 gets grand naming/leaders/epithets/history. */
const GRAND_TIER = 2;

function countFor(table: [number, number][], idx: number): number {
  const [lo, hi] = table[clamp(idx, 0, table.length - 1)];
  return rng.int(lo, hi);
}

// ─── Knowledge tiers ─────────────────────────────────────────────────────────

/** Hidden-xp thresholds unlocking lore tiers 0–4 (tier 0 = first contact). */
export const KNOWLEDGE_TIER_THRESHOLDS = [0, 25, 60, 110, 180];

/** Lore tier (0–4) the colony has earned about a kingdom. */
export function knowledgeTier(knowledge: number): number {
  let tier = 0;
  for (let i = KNOWLEDGE_TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (knowledge >= KNOWLEDGE_TIER_THRESHOLDS[i]) {
      tier = i;
      break;
    }
  }
  return tier;
}

// ─── Wealth bands ────────────────────────────────────────────────────────────

export const WEALTH_BANDS: WealthBand[] = [
  'destitute',
  'modest',
  'prosperous',
  'wealthy',
  'opulent'
];

/** Player-facing labels — never render the band id raw. */
export const WEALTH_BAND_LABEL: Record<WealthBand, string> = {
  destitute: 'Destitute',
  modest: 'Modest',
  prosperous: 'Prosperous',
  wealthy: 'Wealthy',
  opulent: 'Opulent'
};

/** Step a wealth band up/down one rung (drift), clamped to the scale. */
export function stepWealthBand(band: WealthBand, dir: 1 | -1): WealthBand {
  const i = clamp(WEALTH_BANDS.indexOf(band) + dir, 0, WEALTH_BANDS.length - 1);
  return WEALTH_BANDS[i];
}

function rollWealthBand(raider: boolean): WealthBand {
  // Raiders skew poor — plunder doesn't compound like trade does.
  const weights = raider ? [40, 35, 20, 5, 0] : [15, 30, 30, 18, 7];
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = rng.random() * total;
  for (let i = 0; i < WEALTH_BANDS.length; i++) {
    roll -= weights[i];
    if (roll < 0) return WEALTH_BANDS[i];
  }
  return 'modest';
}

// ─── Naming & lore pieces ────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function fill(template: string, slots: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, key) => slots[key] ?? m);
}

/** Name a kingdom by its scale (wealthIdx): a hamlet is "the Steading of Crag", an empire "the Crag
 *  Imperium". Returns the polity word too (for the {polity_lower} history slot). */
function generateKingdomName(raider: boolean, wealthIdx: number): { name: string; polity: string } {
  const stem = rng.pick(LORE.nameStems);
  const polity = rng.pick(
    raider ? LORE.raiderPolities : LORE.scaleTiers[clamp(wealthIdx, 0, 4)].polities
  );
  const form = rng.pick(
    raider ? LORE.raiderNameForms : LORE.scaleTiers[clamp(wealthIdx, 0, 4)].forms
  );
  return { name: fill(form, { stem, polity }), polity };
}

/** Roll a leader name, titled to the kingdom's scale (a hamlet has a Reeve, an empire an Emperor).
 *  Also used by the runtime drift (succession). */
export function generateLeaderName(raider: boolean, wealthIdx = 3): string {
  const title = rng.pick(
    raider ? LORE.raiderLeaderTitles : LORE.leaderTitlesByTier[clamp(wealthIdx, 0, 4)]
  );
  const given = rng.pick(LORE.leaderGivenNames);
  const epithet = rng.random() < 0.6 ? ` ${rng.pick(LORE.leaderEpithets)}` : '';
  return `${title} ${given}${epithet}`;
}

/** Roll a famed-item name — also used by the runtime drift (treasures change hands). */
export function generateFamedItemName(): string {
  const material = rng.pick(LORE.famedItemMaterials);
  const type = rng.pick(LORE.famedItemTypes);
  const epithet = rng.random() < 0.5 ? ` ${rng.pick(LORE.famedItemEpithets)}` : '';
  return `The ${material} ${type}${epithet}`;
}

function generateCapitalName(): string {
  return rng.pick(LORE.capitalPrefixes) + rng.pick(LORE.capitalSuffixes);
}

function generateFamedItems(wealthIdx: number): KingdomFamedItems {
  const created: string[] = [];
  const held: string[] = [];
  const nCreated = countFor(FAMED_CREATED_COUNT, wealthIdx);
  const nHeld = countFor(FAMED_HELD_COUNT, wealthIdx);
  for (let i = 0; i < nCreated; i++) created.push(generateFamedItemName());
  for (let i = 0; i < nHeld; i++) held.push(generateFamedItemName());
  return { created, held };
}

function pickSome<T>(pool: T[], count: number): T[] {
  const copy = [...pool];
  const out: T[] = [];
  while (out.length < count && copy.length > 0) {
    const i = rng.int(0, copy.length - 1);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

function generateFigures(wealthIdx: number): string[] {
  return pickSome(LORE.figureRoles, countFor(FIGURE_COUNT, wealthIdx)).map((role) => {
    const given = rng.pick(LORE.leaderGivenNames);
    const epithet = rng.pick(LORE.leaderEpithets);
    return `${given} ${epithet}, ${role}`;
  });
}

function generateHistory(
  raider: boolean,
  wealthIdx: number,
  slots: Record<string, string>
): string[] {
  const bank = raider
    ? LORE.raiderHistory
    : wealthIdx < GRAND_TIER
      ? LORE.humbleHistory
      : LORE.grandHistory;
  return pickSome(bank, countFor(HISTORY_COUNT, wealthIdx)).map((t) => fill(t, slots));
}

// ─── Culture composition ─────────────────────────────────────────────────────

function generateCultureMix(cultures: Culture[]): KingdomCultureShare[] {
  // Mono → multi spectrum: most kingdoms lean on 1–2 cultures, a few are true blends.
  const roll = rng.random();
  const n = Math.min(cultures.length, roll < 0.35 ? 1 : roll < 0.7 ? 2 : roll < 0.9 ? 3 : 4);
  const picked = pickSome(cultures, n);
  // First pick gets a dominance boost so even blends usually have a visible majority.
  const raws = picked.map((_, i) => rng.range(0.3, 1) * (i === 0 ? 2 : 1));
  const total = raws.reduce((s, w) => s + w, 0);
  return picked
    .map((c, i) => ({ cultureId: c.id, weight: raws[i] / total }))
    .sort((a, b) => b.weight - a.weight);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Generate one procedural kingdom as a weighted blend of the given culture pool. Scale (a poor
 *  hamlet vs a grand empire) is the wealth band: naming, leader title, epithet, history tone,
 *  settlement counts, and how much lore exists all follow it. */
export function generateKingdom(cultures: Culture[], alwaysHostile = false): Kingdom {
  const raider = alwaysHostile;
  // Wealth FIRST — it is the scale, so naming/leaders/lore all read from it.
  const wealthBand = rollWealthBand(raider);
  const wealthIdx = WEALTH_BANDS.indexOf(wealthBand);
  const { name, polity } = generateKingdomName(raider, wealthIdx);
  const leaderName = generateLeaderName(raider, wealthIdx);
  const capitalName = generateCapitalName();
  const grand = wealthIdx >= GRAND_TIER;

  const lore: KingdomLore = {
    epithet: rng.pick(
      raider ? LORE.raiderEpithets : grand ? LORE.epithetsGrand : LORE.epithetsSmall
    ),
    temperament: rng.pick(raider ? LORE.raiderTemperaments : LORE.temperaments),
    leaderName,
    wealthBand,
    capitalName,
    settlements: {
      towns: countFor(TOWN_COUNT, wealthIdx),
      villages: countFor(VILLAGE_COUNT, wealthIdx)
    },
    history: generateHistory(raider, wealthIdx, {
      leader: leaderName,
      capital: capitalName,
      polity_lower: polity.toLowerCase()
    }),
    figures: generateFigures(wealthIdx),
    famedItems: generateFamedItems(wealthIdx)
  };

  return {
    id: slugify(name),
    name,
    cultureMix: generateCultureMix(cultures),
    relationBias: raider ? 'always_hostile' : 'derived',
    lore,
    knowledge: 0
  };
}

/** Preroll the world's ~20 kingdoms; a handful are always-hostile raiding parties. */
export function generateKingdomPool(cultures: Culture[], count = 20): Kingdom[] {
  const hostileCount = Math.min(count, rng.int(2, 4));
  const pool: Kingdom[] = [];
  const usedIds = new Set<string>();
  let guard = 0;
  while (pool.length < count && guard < count * 20) {
    guard++;
    const kingdom = generateKingdom(cultures, pool.length < hostileCount);
    if (usedIds.has(kingdom.id)) continue;
    usedIds.add(kingdom.id);
    pool.push(kingdom);
  }
  return pool;
}

export function dispositionForScore(score: number): KingdomRelation['disposition'] {
  if (score >= 60) return 'allied';
  if (score >= 20) return 'friendly';
  if (score > -20) return 'neutral';
  if (score > -60) return 'wary';
  return 'hostile';
}

function makeRelation(a: string, b: string, score: number): KingdomRelation {
  const s = clamp(Math.round(score), -100, 100);
  return { a, b, score: s, disposition: dispositionForScore(s) };
}

/** Score between two cultures per the culture relation graph (same culture = strong kinship). */
function cultureScore(aId: string, bId: string, relations: CultureRelation[]): number {
  if (aId === bId) return 60;
  const rel = relations.find((r) => (r.a === aId && r.b === bId) || (r.a === bId && r.b === aId));
  return rel?.score ?? 0;
}

/** Weighted-average culture affinity between two kingdoms' member mixes. */
function mixAffinity(a: Kingdom, b: Kingdom, relations: CultureRelation[]): number {
  let score = 0;
  for (const sa of a.cultureMix) {
    for (const sb of b.cultureMix) {
      score += sa.weight * sb.weight * cultureScore(sa.cultureId, sb.cultureId, relations);
    }
  }
  return score;
}

/**
 * Derive the kingdom relation graph from member-culture dispositions, then jitter.
 * Includes colony↔kingdom rows keyed by COLONY_RELATION_ID, seeded from the colony's
 * home culture. Always-hostile raiders pin to −100 with everyone.
 */
export function generateKingdomRelations(
  kingdoms: Kingdom[],
  cultureRelations: CultureRelation[],
  homeCultureId: string
): KingdomRelation[] {
  const relations: KingdomRelation[] = [];
  for (let i = 0; i < kingdoms.length; i++) {
    for (let j = i + 1; j < kingdoms.length; j++) {
      const a = kingdoms[i];
      const b = kingdoms[j];
      if (a.relationBias === 'always_hostile' || b.relationBias === 'always_hostile') {
        relations.push(makeRelation(a.id, b.id, -100));
        continue;
      }
      const score = mixAffinity(a, b, cultureRelations) + rng.range(-20, 20);
      relations.push(makeRelation(a.id, b.id, score));
    }
  }
  // Colony rows — seeded from the home culture vs each kingdom's mix.
  for (const k of kingdoms) {
    if (k.relationBias === 'always_hostile') {
      relations.push(makeRelation(COLONY_RELATION_ID, k.id, -100));
      continue;
    }
    let score = 0;
    for (const share of k.cultureMix) {
      score += share.weight * cultureScore(homeCultureId, share.cultureId, cultureRelations);
    }
    relations.push(makeRelation(COLONY_RELATION_ID, k.id, score + rng.range(-15, 15)));
  }
  return relations;
}

/** Look up the symmetric relation between two participants (kingdom ids or the colony). */
export function findKingdomRelation(
  relations: KingdomRelation[],
  a: string,
  b: string
): KingdomRelation | undefined {
  return relations.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
}
