/**
 * gameLogger — thin compatibility adapter over the unified log pipeline.
 *
 * Historically this buffered tagged lines and POSTed them to /api/debug-log (a per-tick firehose
 * that wrote 100 MB files and starved the sim). That is RETIRED. It now forwards each call to the
 * gated `vlog` (core/logSink): nothing is emitted unless the dev server was started with
 * `--debug`/`--profiler` (`LOG_VERBOSE`), and when it is, entries flow through the SAME pipeline as
 * everything else → the in-game debug tab + `.debug/<category>.log` (see stores/Log.ts).
 *
 * Kept as a shim so the existing `gameLogger.log(turn, 'TAG', msg)` call sites don't change; the
 * tag is mapped to a log category. New code should prefer `vlog(category, turn, msg)` directly.
 */
import { vlog, LOG_VERBOSE } from '../core/logSink';
import type { GameState } from '../core/types';
import type { LogCategory } from '../core/Events';

/** Map a legacy gameLogger tag to a unified log category. */
function tagToCategory(tag: string): LogCategory {
  if (tag.startsWith('ENTITY') || tag === 'MOB-SNAP' || tag === 'HUNT-UNREACHABLE') return 'ai';
  if (tag === 'PAWN-TICK' || tag === 'NEED-CHECK') return 'needs';
  if (tag === 'STATE-CHG' || tag === 'JOB-EVT') return 'job';
  if (tag === 'YIELD-DBG') return 'work';
  if (tag === 'PERF') return 'perf';
  return 'system'; // MAP-SNAP and any catch-all
}

class GameLoggerImpl {
  /** Verbose logging is on only under `--debug`/`--profiler` (the call-site fast-path guard). */
  get isEnabled(): boolean {
    return LOG_VERBOSE;
  }

  /** Forward a tagged line into the gated unified pipeline. No-op unless `LOG_VERBOSE`. */
  log(turn: number, tag: string, msg: string | (() => string)): void {
    vlog(tagToCategory(tag), turn, msg);
  }

  /** Periodic compact settlement snapshot (system category). No-op unless `LOG_VERBOSE`. */
  logMapSnap(gs: GameState): void {
    if (!LOG_VERBOSE) return;
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
