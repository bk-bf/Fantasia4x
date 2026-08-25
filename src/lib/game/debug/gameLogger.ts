import { vlog, isVerboseLogging } from '../core/util/logSink';
import type { GameState } from '../core/types';
import type { LogCategory } from '../core/defs/events';

function tagToCategory(tag: string): LogCategory {
  if (tag.startsWith('ENTITY') || tag === 'MOB-SNAP' || tag === 'HUNT-UNREACHABLE') return 'ai';
  if (tag === 'PAWN-TICK' || tag === 'NEED-CHECK') return 'needs';
  if (tag === 'STATE-CHG' || tag === 'JOB-EVT') return 'job';
  if (tag === 'YIELD-DBG') return 'work';
  if (tag === 'ITEM-DBG') return 'item';
  if (tag === 'PERF') return 'perf';
  return 'system';
}

class GameLoggerImpl {
  get isEnabled(): boolean {
    return isVerboseLogging();
  }

  log(turn: number, tag: string, msg: string | (() => string)): void {
    vlog(tagToCategory(tag), turn, msg);
  }

  logMapSnap(gs: GameState): void {
    if (!isVerboseLogging()) return;
    const pawns = (gs.pawns ?? []).filter((p) => p.isAlive !== false).length;
    const mobs = (gs.mobs ?? []).filter((m) => m.state !== 'Corpse').length;
    const claimed = (gs.jobs ?? []).filter((j) => j.claimedBy).length;
    vlog(
      'system',
      gs.turn,
      `snapshot pawns=${pawns} mobs=${mobs} jobs=${(gs.jobs ?? []).length}(${claimed} claimed)`
    );
  }
}

export const gameLogger = new GameLoggerImpl();
