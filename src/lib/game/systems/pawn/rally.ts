import type { GameState, Pawn } from '../../core/types';
import { chebyshev } from '../../core/util/distance';
import { findRelationship } from '../../core/rules/social/social';
import { pawnStatService } from '../../services/PawnStatService';
import { TICKS_PER_GAME_HOUR } from '../../services/EnvironmentService';
import { PAWN_STATE } from './pawnStates';

export const RALLY_RANGE = 2;
const RALLY_BASE = 0.2;
const RALLY_MAX = 0.75;
const MIN_TALKING = 0.3;
export const RALLIED_HOURS = 6;
export const RALLY_RELATION_BOOST = 8;
const RALLY_SALT = 53;

function rallyHash(key: string, turn: number): number {
  let h = (RALLY_SALT ^ turn) | 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  return ((h >>> 0) % 100000) / 100000;
}

function relationFactor(score: number): number {
  return Math.max(0, 1 + score / 100);
}

function bestRallier(broken: Pawn, state: GameState): { pawn: Pawn; power: number } | null {
  if (!broken.position) return null;
  const bx = broken.position.x;
  const by = broken.position.y;
  let best: Pawn | null = null;
  let bestPower = 0;
  for (const p of state.pawns) {
    if (p.id === broken.id || p.isAlive === false || !p.position) continue;
    if (p.currentState === PAWN_STATE.COLLAPSED || (p.conditionTimers?.mental_breakdown ?? 0) > 0)
      continue;
    if (chebyshev(bx, by, p.position.x, p.position.y) > RALLY_RANGE) continue;
    if (pawnStatService.evaluateStat('talking', p) < MIN_TALKING) continue;
    const rel = findRelationship(state.relationships, broken.id, p.id)?.score ?? 0;
    const power = pawnStatService.evaluateStat('oratory', p) * relationFactor(rel);
    if (power > bestPower) {
      bestPower = power;
      best = p;
    }
  }
  return best ? { pawn: best, power: bestPower } : null;
}

const _rallyCooldownUntil = new Map<string, number>();

export function tryRally(broken: Pawn, state: GameState, turn: number): Pawn | null {
  if (turn < (_rallyCooldownUntil.get(broken.id) ?? 0)) return null;
  const r = bestRallier(broken, state);
  if (!r) return null;
  _rallyCooldownUntil.set(broken.id, turn + TICKS_PER_GAME_HOUR);
  const chance = Math.min(RALLY_MAX, RALLY_BASE * r.power);
  return rallyHash(broken.id + r.pawn.id, turn) < chance ? r.pawn : null;
}

export function _resetRallyCooldowns(): void {
  _rallyCooldownUntil.clear();
}
