// Migrant-wave roll (pure, worker-safe): called at season boundaries; arrival chance scales with
// completed buildings. Parks candidates on `GameState.pendingEvent`; empty wave returns state unchanged.

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

function completedBuildings(state: GameState): number {
  return (state.buildings ?? []).filter((b) => b.status === 'complete').length;
}

export function rollMigrantWave(state: GameState): GameState {
  const built = completedBuildings(state);
  const p = Math.min(CFG.maxChance, Math.max(CFG.minChance, CFG.baseChance + CFG.perBuilding * built));

  let count = 0;
  for (let i = 0; i < CFG.slots; i++) if (rng.chance(p)) count++;
  if (count === 0) return state;

  // Re-id with a wave-unique key so a candidate can't be confused with a live `pawn-N` id while it
  // sits in the pending event (commit reassigns a fresh colony id).
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
