/** pawn/rally — a nearby comrade talks a mentally-broken pawn back to its feet (battle-brother style).
 *
 *  Ambient (no player order): while a pawn is broken (Crying/Hiding/Panicking), the best eligible ally in
 *  earshot periodically attempts to steady it. Success is driven by the rallier's `oratory` stat
 *  (CHA + prestige + a clear voice) scaled by the pair's RELATIONSHIP — a close battle-brother rallies far
 *  better than a stranger, an enemy not at all. On success the breakdown clears early with the weaker
 *  `rallied` buffer (not the full natural-recovery catharsis) plus a grace window against re-breaking.
 *
 *  The roll is a deterministic hash (like the breakdown roll), NOT the shared sim/combat rng — so it's
 *  replay-safe and never perturbs hit/damage rolls. */
import type { GameState, Pawn } from '../../core/types';
import { chebyshev } from '../../core/distance';
import { findRelationship } from '../../core/Social';
import { pawnStatService } from '../../services/PawnStatService';
import { TICKS_PER_GAME_HOUR } from '../../services/EnvironmentService';
import { PAWN_STATE } from './pawnStates';

/** Chebyshev tiles within which a comrade can reach a broken pawn — a face-to-face word, not a shout
 *  across the map. Matches DIALOG_RANGE (2): rallying is just a pointed conversation. */
export const RALLY_RANGE = 2;
/** Per-attempt base chance, before the rallier's oratory × relationship scaling. */
const RALLY_BASE = 0.2;
/** Ceiling so even a silver-tongued best-friend can't rally with certainty. */
const RALLY_MAX = 0.75;
/** Talking capacity (0–1) below which a pawn can't get the words out to rally anyone. */
const MIN_TALKING = 0.3;
/** In-game hours the `rallied` buffer holds — the anti-yo-yo grace window. ~1/3 of catharsis (18h). */
export const RALLIED_HOURS = 6;
/** Relationship the rallied pawn gains toward whoever got through — an emotional rescue, on par with
 *  tending wounds (TEND_DELTA 8; below the 18 of physically carrying a downed body to shelter). */
export const RALLY_RELATION_BOOST = 8;
const RALLY_SALT = 53;

/** Deterministic 0–1 from (key, turn) — replay-safe, never touches the shared rng (mirrors breakdownHash). */
function rallyHash(key: string, turn: number): number {
  let h = (RALLY_SALT ^ turn) | 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  return ((h >>> 0) % 100000) / 100000;
}

/** Relationship score (−100..+100) → rally multiplier: enemy(−100)→0, stranger/neutral→1, best-friend(+100)→2. */
function relationFactor(score: number): number {
  return Math.max(0, 1 + score / 100);
}

/** The best comrade to rally `broken`: nearest-weighted by oratory × relationship among alive, conscious,
 *  not-broken, not-collapsed, in-earshot pawns who can actually speak. Null if no one qualifies. */
function bestRallier(broken: Pawn, state: GameState): { pawn: Pawn; power: number } | null {
  if (!broken.position) return null;
  const bx = broken.position.x;
  const by = broken.position.y;
  let best: Pawn | null = null;
  let bestPower = 0;
  for (const p of state.pawns) {
    if (p.id === broken.id || p.isAlive === false || !p.position) continue;
    // A rallier can't be down or broken itself.
    if (p.currentState === PAWN_STATE.COLLAPSED || (p.conditionTimers?.mental_breakdown ?? 0) > 0) continue;
    if (chebyshev(bx, by, p.position.x, p.position.y) > RALLY_RANGE) continue;
    if (pawnStatService.evaluateStat('talking', p) < MIN_TALKING) continue; // can't speak → can't rally
    const rel = findRelationship(state.relationships, broken.id, p.id)?.score ?? 0;
    const power = pawnStatService.evaluateStat('oratory', p) * relationFactor(rel);
    if (power > bestPower) {
      bestPower = power;
      best = p;
    }
  }
  return best ? { pawn: best, power: bestPower } : null;
}

// Per-pawn fail-cooldown (worker-transient, like the SocialService dialog cooldowns): once SOMEONE tries
// to rally a broken pawn, no one tries again for a game-hour — so a single comrade tries once, and a miss
// isn't immediately retried by every other nearby ally (the (pawns−1)× spam).
const _rallyCooldownUntil = new Map<string, number>();

/** Attempt to rally `broken` this tick. Returns the rallier on success, else null. At most ONE attempt per
 *  broken pawn per game-hour: the best adjacent comrade tries once, and hit or miss it locks out further
 *  attempts for `TICKS_PER_GAME_HOUR`. The caller clears the breakdown + stamps the `rallied` buffer. */
export function tryRally(broken: Pawn, state: GameState, turn: number): Pawn | null {
  if (turn < (_rallyCooldownUntil.get(broken.id) ?? 0)) return null; // still on cooldown from a recent try
  const r = bestRallier(broken, state);
  if (!r) return null; // no comrade in earshot — no attempt, no cooldown
  // An attempt is happening: lock this pawn out for a game-hour, hit or miss.
  _rallyCooldownUntil.set(broken.id, turn + TICKS_PER_GAME_HOUR);
  const chance = Math.min(RALLY_MAX, RALLY_BASE * r.power);
  return rallyHash(broken.id + r.pawn.id, turn) < chance ? r.pawn : null;
}

/** Test-only: clear the worker-transient rally cooldowns between cases. */
export function _resetRallyCooldowns(): void {
  _rallyCooldownUntil.clear();
}
