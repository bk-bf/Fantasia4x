import type { GameState, Pawn } from '../../../core/types';
import { chebyshev } from '../../../core/util/distance';
import { TICKS_PER_GAME_HOUR } from '../../../services/EnvironmentService';
import { PAWN_STATE } from '../pawnStates';
import { findCombatThreat, tryWanderStep, tryAssignSleepPath, FLEE_DISTANCE } from '../pawnHelpers';

export type BreakdownKind = 'crying' | 'hiding' | 'fleeing';

export const BREAKDOWN_MOOD_TIER1 = 25;
export const BREAKDOWN_MOOD_TIER2 = 15;
export const BREAKDOWN_MOOD_TIER3 = 5;
const CHANCE_TIER1 = 0.03;
const CHANCE_TIER2 = 0.08;
const CHANCE_TIER3 = 0.2;
const MENTAL_RESIST_WEIGHT = 4;
const BREAKDOWN_HOURS_MIN = 3;
const BREAKDOWN_HOURS_MAX = 8;
export const CATHARSIS_HOURS = 18;
const HIDE_TRIGGER_DIST = 4;

const SALT_ROLL = 11;
const SALT_HOURS = 23;
const SALT_KIND = 41;

function breakdownHash(id: string, turn: number, salt: number): number {
  let h = (salt ^ turn) | 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return ((h >>> 0) % 100000) / 100000;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function shouldRollBreakdown(pawn: Pawn, turn: number): boolean {
  const mood = pawn.state?.mood ?? 50;
  if (mood > BREAKDOWN_MOOD_TIER1) return false;
  if ((pawn.conditionTimers?.rallied ?? 0) > 0) return false;
  return (turn + (pawn.debugId ?? 0)) % TICKS_PER_GAME_HOUR === 0;
}

export function breakdownChance(mood: number, mentalResistance: number): number {
  const base =
    mood <= BREAKDOWN_MOOD_TIER3
      ? CHANCE_TIER3
      : mood <= BREAKDOWN_MOOD_TIER2
        ? CHANCE_TIER2
        : CHANCE_TIER1;
  return clamp(base * (1 - mentalResistance * MENTAL_RESIST_WEIGHT), 0, base * 2);
}

export function rollBreakdown(pawn: Pawn, turn: number, chance: number): { hours: number } | null {
  if (breakdownHash(pawn.id, turn, SALT_ROLL) >= chance) return null;
  const hours =
    BREAKDOWN_HOURS_MIN +
    breakdownHash(pawn.id, turn, SALT_HOURS) * (BREAKDOWN_HOURS_MAX - BREAKDOWN_HOURS_MIN);
  return { hours };
}

export function pickBreakdownKind(id: string, turn: number, hasThreat: boolean): BreakdownKind {
  const r = breakdownHash(id, turn, SALT_KIND);
  if (hasThreat) return r < 0.75 ? 'fleeing' : r < 0.875 ? 'crying' : 'hiding';
  return r < 0.5 ? 'crying' : 'hiding';
}

export function handleCrying(pawn: Pawn, gameState: GameState): GameState {
  return tryWanderStep(pawn, gameState) ?? gameState;
}

export function handleHiding(pawn: Pawn, gameState: GameState): GameState {
  return hide(pawn, gameState);
}

export function handlePanicking(pawn: Pawn, gameState: GameState): GameState {
  return fleeFrom(pawn, gameState);
}

function fleeFrom(pawn: Pawn, gameState: GameState): GameState {
  const threat = findCombatThreat(pawn, gameState);
  if (!threat || !pawn.position) return tryWanderStep(pawn, gameState) ?? gameState;
  if ((pawn.path?.length ?? 0) > 0) return gameState;
  const mapH = gameState.worldMap.length;
  const mapW = mapH > 0 ? gameState.worldMap[0].length : 0;
  const dx = Math.sign(pawn.position.x - threat.x) || 1;
  const dy = Math.sign(pawn.position.y - threat.y) || 1;
  const fleeX = clamp(pawn.position.x + dx * FLEE_DISTANCE, 0, mapW - 1);
  const fleeY = clamp(pawn.position.y + dy * FLEE_DISTANCE, 0, mapH - 1);
  return (
    tryAssignSleepPath(pawn, fleeX, fleeY, gameState) ?? tryWanderStep(pawn, gameState) ?? gameState
  );
}

function hide(pawn: Pawn, gameState: GameState): GameState {
  if (!pawn.position) return tryWanderStep(pawn, gameState) ?? gameState;
  if ((pawn.path?.length ?? 0) > 0) return gameState;
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
  if (best > HIDE_TRIGGER_DIST) return tryWanderStep(pawn, gameState) ?? gameState;
  const mapH = gameState.worldMap.length;
  const mapW = mapH > 0 ? gameState.worldMap[0].length : 0;
  const dx = Math.sign(pawn.position.x - nearX) || 1;
  const dy = Math.sign(pawn.position.y - nearY) || 1;
  const hideX = clamp(pawn.position.x + dx * FLEE_DISTANCE, 0, mapW - 1);
  const hideY = clamp(pawn.position.y + dy * FLEE_DISTANCE, 0, mapH - 1);
  return (
    tryAssignSleepPath(pawn, hideX, hideY, gameState) ?? tryWanderStep(pawn, gameState) ?? gameState
  );
}
