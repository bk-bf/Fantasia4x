// Migrant-wave roll (worker-safe, pure). Called from the engine's end-of-turn event phase when a
// season boundary was just crossed. Rolls 0–`slots` hopefuls — each slot's chance scales with how
// many buildings the colony has completed — generates them as full pawns (sim-authoritative), and
// parks them on `GameState.pendingEvent` for the player to accept/reject. Returns state unchanged
// when the wave is empty (no modal), so a barren early colony isn't nagged.

import type { GameState } from '../core/types';
import { rng } from '../core/rng';
import { generateColonyPawns } from '../entities/Pawns';
import { simLog } from '../core/logSink';
import config from '../database/migration.jsonc';

const CFG = config as {
  slots: number;
  baseChance: number;
  perBuilding: number;
  minChance: number;
  maxChance: number;
};

/** Number of completed buildings on the map — the colony-development heuristic that weights the roll. */
function completedBuildings(state: GameState): number {
  return (state.buildings ?? []).filter((b) => b.status === 'complete').length;
}

/**
 * Roll a migrant wave. Each of `CFG.slots` slots independently rolls an arrival with probability
 * `base + perBuilding * completedBuildings`, clamped to `[min, max]`. Sets `pendingEvent` when ≥ 1
 * migrant is drawn; otherwise returns the state untouched.
 */
export function rollMigrantWave(state: GameState): GameState {
  const built = completedBuildings(state);
  const p = Math.min(CFG.maxChance, Math.max(CFG.minChance, CFG.baseChance + CFG.perBuilding * built));

  let count = 0;
  for (let i = 0; i < CFG.slots; i++) if (rng.chance(p)) count++;
  if (count === 0) return state;

  // Each candidate is a fully-rolled pawn from the colony's race pool. Re-id with a wave-unique key so
  // it can't be confused with a live `pawn-N` id while it sits in the pending event (commit reassigns
  // to a fresh colony id).
  const candidates = generateColonyPawns(state.racePool, count).map((pw, i) => ({
    ...pw,
    id: `migrant-${state.turn}-${i}`
  }));
  if (candidates.length === 0) return state; // empty race pool — nothing to offer



  simLog.logActivity({
    turn: state.turn,
    type: 'event',
    actor: 'system',
    action: count === 1 ? 'A wanderer approaches the colony' : `${count} wanderers approach the colony`,
    result: 'seeking to join',
    severity: 'info'
  });

  return {
    ...state,
    pendingEvent: {
      kind: 'migrant-wave',
      id: `migrant-wave-${state.turn}`,
      turn: state.turn,
      candidates
    }
  };
}
