import type { GameState } from '../core/types';
import { rng } from '../core/util/rng';
import { generateColonyPawns, remapKinIds } from '../entities/Pawns';
import { simLog } from '../core/util/logSink';
import events from '../database/social/events.json';

const CFG = (
  events as {
    migration: {
      slots: number;
      baseChance: number;
      perBuilding: number;
      minChance: number;
      maxChance: number;
    };
  }
).migration;

function completedBuildings(state: GameState): number {
  return (state.buildings ?? []).filter((b) => b.status === 'complete').length;
}

export function rollMigrantWave(state: GameState, force = false): GameState {
  const built = completedBuildings(state);
  const p = Math.min(
    CFG.maxChance,
    Math.max(CFG.minChance, CFG.baseChance + CFG.perBuilding * built)
  );

  let count = 0;
  for (let i = 0; i < CFG.slots; i++) if (rng.chance(p)) count++;
  if (force && count === 0) count = rng.int(2, Math.max(2, CFG.slots));
  if (count === 0) return state;

  const rolled = generateColonyPawns(state.culturePool, count, {
    kingdoms: state.kingdoms
  });
  const waveIds = new Map(rolled.map((pw, i) => [pw.id, `migrant-${state.turn}-${i}`]));
  const candidates = rolled.map((pw) => ({ ...pw, id: waveIds.get(pw.id)! }));
  remapKinIds(candidates, waveIds);
  if (candidates.length === 0) return state;

  simLog.logActivity({
    turn: state.turn,
    type: 'event',
    actor: 'system',
    action:
      count === 1 ? 'A wanderer approaches the colony' : `${count} wanderers approach the colony`,
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
