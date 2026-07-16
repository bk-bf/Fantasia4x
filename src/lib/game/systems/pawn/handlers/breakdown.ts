/** pawn/handlers/breakdown — the mental-breakdown FSM state + the pure moral-check helpers (MOOD).
 *
 *  A pawn worn down past a mood breakpoint periodically faces a moral check against its mental
 *  resistance; a failed check drops it into an UNCONTROLLABLE breakdown (draft refused, like collapse)
 *  that plays out as crying, hiding, or fleeing for a rolled span of hours, after which it recovers with
 *  a cathartic mood lift so it can't spiral straight back down.
 *
 *  The onset decision here is DELIBERATELY pure + allocation-free (no service imports): the common case
 *  is `mood > tier 1` and returns immediately, so the peace path stays cheap (ENGINE-PERFORMANCE). The
 *  lifecycle wiring (stamp the condition timer, force the state, apply catharsis) lives in the tick block
 *  in PawnStateMachine, next to the parallel collapse block. */
import type { GameState, Pawn } from '../../../core/types';
import { chebyshev } from '../../../core/distance';
import { TICKS_PER_GAME_HOUR } from '../../../services/EnvironmentService';
import { PAWN_STATE } from '../pawnStates';
import { findCombatThreat, tryWanderStep, tryAssignSleepPath, FLEE_DISTANCE } from '../pawnHelpers';

export type BreakdownKind = 'crying' | 'hiding' | 'fleeing';

// ── Tuning ──────────────────────────────────────────────────────────────────────────────────────
// Mood breakpoints — the eased `state.mood` at or below which a check may fire, worst-first.
export const BREAKDOWN_MOOD_TIER1 = 25;
export const BREAKDOWN_MOOD_TIER2 = 15;
export const BREAKDOWN_MOOD_TIER3 = 5;
// Per-check break chance at each tier (one check per in-game hour) BEFORE mental resistance.
const CHANCE_TIER1 = 0.03;
const CHANCE_TIER2 = 0.08;
const CHANCE_TIER3 = 0.2;
// How hard mental_resistance swings the odds. The stat sits around 0 (INT 10) and runs roughly
// ±0.15 across the INT range, so a weight of 4 turns that into ≈ ±60% on the break chance.
const MENTAL_RESIST_WEIGHT = 4;
// A breakdown lasts a random span in this range (in-game hours).
const BREAKDOWN_HOURS_MIN = 3;
const BREAKDOWN_HOURS_MAX = 8;
// The cathartic mood lift (mood_catharsis) fades over this many in-game hours after recovery — long
// enough that the eased mood climbs clear of the breakpoint before it wears off.
export const CATHARSIS_HOURS = 18;
// While hiding, retreat from anyone closer than this (tiles); once clear, huddle.
const HIDE_TRIGGER_DIST = 4;

const SALT_ROLL = 11;
const SALT_HOURS = 23;
const SALT_KIND = 41;

/** Deterministic 0–1 from (id, turn, salt) — so a breakdown roll NEVER consumes the shared sim/combat
 *  rng (which would perturb hit/damage rolls). Replay-safe + allocation-free (mirrors the combat barks). */
function breakdownHash(id: string, turn: number, salt: number): number {
  let h = (salt ^ turn) | 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return ((h >>> 0) % 100000) / 100000;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Cheap per-tick gate: is this pawn low enough, and is it this pawn's once-an-hour check tick? The
 *  `mood > tier1` early-out is the common case (a content pawn never rolls). Offset by debugId so checks
 *  spread across ticks instead of all firing on the same one. */
export function shouldRollBreakdown(pawn: Pawn, turn: number): boolean {
  const mood = pawn.state?.mood ?? 50;
  if (mood > BREAKDOWN_MOOD_TIER1) return false;
  return (turn + (pawn.debugId ?? 0)) % TICKS_PER_GAME_HOUR === 0;
}

/** The break chance this check, from the mood tier and the pawn's mental resistance (higher resistance →
 *  lower chance; a negative resistance from low INT raises it). Clamped so it never runs away. */
export function breakdownChance(mood: number, mentalResistance: number): number {
  const base =
    mood <= BREAKDOWN_MOOD_TIER3
      ? CHANCE_TIER3
      : mood <= BREAKDOWN_MOOD_TIER2
        ? CHANCE_TIER2
        : CHANCE_TIER1;
  return clamp(base * (1 - mentalResistance * MENTAL_RESIST_WEIGHT), 0, base * 2);
}

/** Resolve the moral check: given the already-computed break `chance`, either survive (null) or break —
 *  returning the rolled duration (in-game hours). Deterministic per (pawn, turn). */
export function rollBreakdown(pawn: Pawn, turn: number, chance: number): { hours: number } | null {
  if (breakdownHash(pawn.id, turn, SALT_ROLL) >= chance) return null;
  const hours =
    BREAKDOWN_HOURS_MIN +
    breakdownHash(pawn.id, turn, SALT_HOURS) * (BREAKDOWN_HOURS_MAX - BREAKDOWN_HOURS_MIN);
  return { hours };
}

/** Which way the breakdown plays out. Combat-aware: with a hostile near, it usually bolts (flee), but a
 *  pawn can still freeze up mid-fight (cry). With no threat it only cries or hides. */
export function pickBreakdownKind(id: string, turn: number, hasThreat: boolean): BreakdownKind {
  const r = breakdownHash(id, turn, SALT_KIND);
  if (hasThreat) return r < 0.75 ? 'fleeing' : r < 0.875 ? 'crying' : 'hiding';
  return r < 0.5 ? 'crying' : 'hiding';
}

/**
 * The three coping substates a broken pawn enters directly at onset (uncontrollable, `mental_breakdown`
 * condition) — distinct FSM states so the panel shows what it's actually doing, not a generic "Breaking
 * Down". In every case the pawn AMBLES rather than freezing. None runs need-selection, so a broken pawn
 * CANNOT eat/drink/wash/sleep — it copes uncontrollably until the breakdown timer runs out (the tick block
 * then stands it up with a cathartic lift) or it collapses from an unmet need.
 */

/** Crying (the default): a forced idle — wanders restlessly, out in the open, weeping. */
export function handleCrying(pawn: Pawn, gameState: GameState): GameState {
  return tryWanderStep(pawn, gameState) ?? gameState;
}

/** Hiding: scurries away from the nearest other pawn to be alone, then wanders. */
export function handleHiding(pawn: Pawn, gameState: GameState): GameState {
  return hide(pawn, gameState);
}

/** Panicking: bolts from any hostile, then wanders once nothing's chasing. */
export function handlePanicking(pawn: Pawn, gameState: GameState): GameState {
  return fleeFrom(pawn, gameState);
}

/** Path away from the nearest hostile (mirrors handleFleeing); amble once nothing's chasing. */
function fleeFrom(pawn: Pawn, gameState: GameState): GameState {
  const threat = findCombatThreat(pawn, gameState);
  if (!threat || !pawn.position) return tryWanderStep(pawn, gameState) ?? gameState; // nothing to flee — amble
  if ((pawn.path?.length ?? 0) > 0) return gameState; // already retreating
  const mapH = gameState.worldMap.length;
  const mapW = mapH > 0 ? gameState.worldMap[0].length : 0;
  const dx = Math.sign(pawn.position.x - threat.x) || 1;
  const dy = Math.sign(pawn.position.y - threat.y) || 1;
  const fleeX = clamp(pawn.position.x + dx * FLEE_DISTANCE, 0, mapW - 1);
  const fleeY = clamp(pawn.position.y + dy * FLEE_DISTANCE, 0, mapH - 1);
  return tryAssignSleepPath(pawn, fleeX, fleeY, gameState) ?? tryWanderStep(pawn, gameState) ?? gameState;
}

/** Scurry away from the nearest other living pawn to be alone; amble once far enough. */
function hide(pawn: Pawn, gameState: GameState): GameState {
  if (!pawn.position) return tryWanderStep(pawn, gameState) ?? gameState;
  if ((pawn.path?.length ?? 0) > 0) return gameState; // already scurrying off
  let nearX = 0;
  let nearY = 0;
  let best = Infinity;
  for (const other of gameState.pawns) {
    if (other.id === pawn.id || other.isAlive === false || !other.position) continue;
    const d = chebyshev(pawn.position.x, pawn.position.y, other.position.x, other.position.y);
    if (d < best) {
      best = d;
      nearX = other.position.x;
      nearY = other.position.y;
    }
  }
  if (best > HIDE_TRIGGER_DIST) return tryWanderStep(pawn, gameState) ?? gameState; // alone enough — amble restlessly
  const mapH = gameState.worldMap.length;
  const mapW = mapH > 0 ? gameState.worldMap[0].length : 0;
  const dx = Math.sign(pawn.position.x - nearX) || 1;
  const dy = Math.sign(pawn.position.y - nearY) || 1;
  const hideX = clamp(pawn.position.x + dx * FLEE_DISTANCE, 0, mapW - 1);
  const hideY = clamp(pawn.position.y + dy * FLEE_DISTANCE, 0, mapH - 1);
  return tryAssignSleepPath(pawn, hideX, hideY, gameState) ?? tryWanderStep(pawn, gameState) ?? gameState;
}
