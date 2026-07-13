// Pure social-layer helpers (SOCIAL-LAYER §1/§7) — the platonic stage ladder with hysteresis,
// cultural relationship seeding, canonical pair keys, and effective-mood math. No state writes
// here; SocialService owns all mutation. Mirrors core/Kingdom.ts (pure) vs KingdomService (runtime).

import type {
  CultureRelation,
  KinKind,
  MoodModifier,
  Pawn,
  PawnRelationship,
  RelationStage
} from './types';

/** Ladder order, worst → best. */
export const STAGE_ORDER: RelationStage[] = [
  'enemies',
  'rivals',
  'strangers',
  'acquaintances',
  'friends',
  'best_friends'
];

/** Player-facing stage names (never leak the snake_case ids). */
export const STAGE_LABEL: Record<RelationStage, string> = {
  enemies: 'Enemies',
  rivals: 'Rivals',
  strangers: 'Strangers',
  acquaintances: 'Acquaintances',
  friends: 'Friends',
  best_friends: 'Best Friends'
};

// Lower score bound of each stage (index-aligned with STAGE_ORDER; enemies is the floor).
const STAGE_LOWER = [-Infinity, -60, -20, 15, 45, 75];
// Crossing a boundary needs this much overshoot, so a pair on the line doesn't flicker.
const HYSTERESIS = 3;

/** Stage for a raw score, no history (fresh relationships). */
export function rawStageForScore(score: number): RelationStage {
  for (let i = STAGE_LOWER.length - 1; i >= 0; i--) {
    if (score >= STAGE_LOWER[i]) return STAGE_ORDER[i];
  }
  return 'enemies';
}

/**
 * Hysteretic stage: from `prev`, climb only once the score clears the next stage's floor by
 * HYSTERESIS, drop only once it falls that far below the current floor. Big event deltas can
 * step several rungs at once.
 */
export function stageForScore(score: number, prev?: RelationStage): RelationStage {
  if (!prev) return rawStageForScore(score);
  let idx = STAGE_ORDER.indexOf(prev);
  if (idx < 0) return rawStageForScore(score);
  while (idx < STAGE_ORDER.length - 1 && score >= STAGE_LOWER[idx + 1] + HYSTERESIS) idx++;
  while (idx > 0 && score < STAGE_LOWER[idx] - HYSTERESIS) idx--;
  return STAGE_ORDER[idx];
}

// ── Cultural seeding (RACE-SYSTEM Phase 1) ────────────────────────────────────────────────────

/** Starting score by the two pawns' culture disposition — lived experience then drifts it. */
const DISPOSITION_SEED: Record<CultureRelation['disposition'], number> = {
  hostile: -40,
  wary: -15,
  neutral: 0,
  friendly: 15,
  allied: 30
};

/** Same-people familiarity: two pawns of one culture start on friendly footing. */
const SAME_CULTURE_SEED = 15;
/** Legacy flat kin bonus, used only when a tie carries no rolled `warmth` (back-compat / tests). */
export const KIN_SEED_BONUS = 50;

/** The cultural baseline a fresh `PawnRelationship` starts from, before any deltas. Kinship adds
 *  the tie's rolled `warmth` (a real bias, but a hated brother is possible), NOT a guaranteed bond. */
export function seedScore(a: Pawn, b: Pawn, cultureRelations: CultureRelation[]): number {
  const ca = a.cultureId;
  const cb = b.cultureId;
  let seed = 0;
  if (ca && cb) {
    if (ca === cb) {
      seed = SAME_CULTURE_SEED;
    } else {
      const rel = cultureRelations.find(
        (r) => (r.a === ca && r.b === cb) || (r.a === cb && r.b === ca)
      );
      if (rel) seed = DISPOSITION_SEED[rel.disposition] ?? 0;
    }
  }
  const tie = a.kin?.find((k) => k.pawnId === b.id);
  if (tie) seed += tie.warmth ?? KIN_SEED_BONUS;
  return seed;
}

// ── Kinship taxonomy (colony ties + the wider off-colony web) ────────────────────────────────────

/** What P is to Q, given what Q is to P (kin ties are stored on both sides). */
export const KIN_INVERSE: Record<KinKind, KinKind> = {
  parent: 'child',
  child: 'parent',
  sibling: 'sibling',
  grandparent: 'grandchild',
  grandchild: 'grandparent',
  auntuncle: 'nibling',
  nibling: 'auntuncle',
  cousin: 'cousin'
};

/** Sex-neutral kin labels — the fallback when the relative's sex is unknown. */
export const KIN_LABEL: Record<KinKind, string> = {
  parent: 'Parent',
  child: 'Child',
  sibling: 'Sibling',
  grandparent: 'Grandparent',
  grandchild: 'Grandchild',
  auntuncle: 'Aunt/Uncle',
  nibling: 'Niece/Nephew',
  cousin: 'Cousin'
};

/** Gendered kin words by the RELATIVE's sex — `[male, female]` (cousin is the same either way). */
const KIN_LABEL_SEXED: Record<KinKind, [string, string]> = {
  parent: ['Father', 'Mother'],
  child: ['Son', 'Daughter'],
  sibling: ['Brother', 'Sister'],
  grandparent: ['Grandfather', 'Grandmother'],
  grandchild: ['Grandson', 'Granddaughter'],
  auntuncle: ['Uncle', 'Aunt'],
  nibling: ['Nephew', 'Niece'],
  cousin: ['Cousin', 'Cousin']
};

/** The kin label for a relative of the given `kind`, resolved by their `sex` (Father vs Mother).
 *  Falls back to the sex-neutral label when sex is unknown. */
export function kinLabel(kind: KinKind, sex?: 'male' | 'female'): string {
  if (sex === 'male') return KIN_LABEL_SEXED[kind][0];
  if (sex === 'female') return KIN_LABEL_SEXED[kind][1];
  return KIN_LABEL[kind];
}

/** Possessive kin phrase for the entity card ("Kael's sister"), gendered by the relative's sex. */
export function kinRelationPhrase(kind: KinKind, ofName: string, sex?: 'male' | 'female'): string {
  return `${ofName}'s ${kinLabel(kind, sex).toLowerCase()}`;
}

/** Off-colony kin knowledge goes stale after ~a month without word (mirrors the KINGDOMS-TRADE
 *  staleness clock). `daysSince` is computed by the caller from the game's day index. */
export const KIN_STALE_DAYS = 30;
export function isKinStale(daysSinceSeen: number | null): boolean {
  return daysSinceSeen === null || daysSinceSeen > KIN_STALE_DAYS;
}

// ── Pair keys & lookup ────────────────────────────────────────────────────────────────────────

/** Canonical sorted pair (pawnA < pawnB). */
export function sortedPair(aId: string, bId: string): [string, string] {
  return aId < bId ? [aId, bId] : [bId, aId];
}

export function relKey(aId: string, bId: string): string {
  const [a, b] = sortedPair(aId, bId);
  return `${a}|${b}`;
}

export function findRelationship(
  relationships: PawnRelationship[] | undefined,
  aId: string,
  bId: string
): PawnRelationship | undefined {
  if (!relationships) return undefined;
  const [a, b] = sortedPair(aId, bId);
  return relationships.find((r) => r.pawnA === a && r.pawnB === b);
}

/** All of one pawn's relationships (Relations tab). */
export function relationshipsOf(
  relationships: PawnRelationship[] | undefined,
  pawnId: string
): PawnRelationship[] {
  if (!relationships) return [];
  return relationships.filter((r) => r.pawnA === pawnId || r.pawnB === pawnId);
}

export function otherOf(rel: PawnRelationship, pawnId: string): string {
  return rel.pawnA === pawnId ? rel.pawnB : rel.pawnA;
}

// ── Effective mood (SOCIAL-LAYER §7) ──────────────────────────────────────────────────────────

/** An event modifier is live until its tick passes; `expiresAt: 0` marks a standing one that the
 *  daily social pass re-evaluates (it re-stamps or removes it). */
export function activeMoodModifiers(pawn: Pawn, turn: number): MoodModifier[] {
  const mods = pawn.moodModifiers;
  if (!mods || mods.length === 0) return [];
  return mods.filter((m) => m.expiresAt === 0 || m.expiresAt > turn);
}

/**
 * MOOD-REWORK — a modifier's CURRENT contribution to the mood target. A standing band (`expiresAt: 0`)
 * contributes its full value; an expiring thought fades linearly from `value` at `startedAt` to 0 at
 * `expiresAt` (a memory lifting over time). Past its expiry it contributes nothing.
 */
export function moodModifierValue(m: MoodModifier, turn: number): number {
  if (m.expiresAt === 0) return m.value; // standing band — no fade
  if (m.expiresAt <= turn) return 0; // expired
  const start = m.startedAt ?? m.expiresAt;
  if (start >= m.expiresAt) return m.value; // no fade window recorded → full until expiry
  const frac = (m.expiresAt - turn) / (m.expiresAt - start); // 1 at start → 0 at expiry
  return m.value * (frac < 0 ? 0 : frac > 1 ? 1 : frac);
}

/** MOOD-REWORK — the number every consumer (UI, break checks, work refusal) reads: the pawn's single
 *  eased mood value, clamped 0–100. All event/condition/weather/trait contributions now feed the
 *  TARGET this value eases toward (PawnService.computeMoodTarget), so nothing is layered on at read. */
export function effectiveMood(pawn: Pawn, _turn?: number): number {
  const mood = pawn.state?.mood ?? 50;
  return Math.max(0, Math.min(100, mood));
}
