// Migrant-wave roll (pure, worker-safe): called at season boundaries; arrival chance scales with
// completed buildings. Parks candidates on `GameState.pendingEvent`; empty wave returns state unchanged.

import type { GameState } from '../core/types';
import { rng } from '../core/rng';
import { generateColonyPawns, remapKinIds } from '../entities/Pawns';
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

export function rollMigrantWave(state: GameState, force = false): GameState {
  const built = completedBuildings(state);
  const p = Math.min(CFG.maxChance, Math.max(CFG.minChance, CFG.baseChance + CFG.perBuilding * built));

  let count = 0;
  for (let i = 0; i < CFG.slots; i++) if (rng.chance(p)) count++;
  // Debug force (the DEBUG tab's "migrant wave" button): guarantee a non-empty wave.
  if (force && count === 0) count = rng.int(2, Math.max(2, CFG.slots));
  if (count === 0) return state;

  // Re-id with a wave-unique key so a candidate can't be confused with a live `pawn-N` id while it
  // sits in the pending event (commit reassigns a fresh colony id).
  const rolled = generateColonyPawns(state.culturePool, count, {
    kingdoms: state.kingdoms
  });
  const waveIds = new Map(rolled.map((pw, i) => [pw.id, `migrant-${state.turn}-${i}`]));
  const candidates = rolled.map((pw) => ({ ...pw, id: waveIds.get(pw.id)! }));
  // SOCIAL-LAYER §2: a wave can roll siblings — repoint their kin ids at the wave-unique ids.
  remapKinIds(candidates, waveIds);
  if (candidates.length === 0) return state; // empty culture pool — nothing to offer



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
