// Pure social-layer helpers (SOCIAL-LAYER §1/§7) — the platonic stage ladder with hysteresis,
// cultural relationship seeding, canonical pair keys, and effective-mood math. No state writes
// here; SocialService owns all mutation. Mirrors core/Kingdom.ts (pure) vs KingdomService (runtime).

import type { CultureRelation, MoodModifier, Pawn, PawnRelationship, RelationStage } from './types';

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
/** Blood is thicker: kin pairs start solidly as friends. */
export const KIN_SEED_BONUS = 50;

/** The cultural baseline a fresh `PawnRelationship` starts from, before any deltas. */
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
  if (a.kin?.some((k) => k.pawnId === b.id)) seed += KIN_SEED_BONUS;
  return seed;
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

/** Ambient drift mood + Σ active event modifiers, clamped 0–100. The number every consumer
 *  (UI, break checks, work refusal) should read instead of raw `state.mood`. */
export function effectiveMood(pawn: Pawn, turn: number): number {
  let mood = pawn.state?.mood ?? 50;
  const mods = pawn.moodModifiers;
  if (mods && mods.length > 0) {
    for (const m of mods) {
      if (m.expiresAt === 0 || m.expiresAt > turn) mood += m.value;
    }
  }
  return Math.max(0, Math.min(100, mood));
}
