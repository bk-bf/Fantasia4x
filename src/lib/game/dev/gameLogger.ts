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
import { vlog, isVerboseLogging } from '../core/logSink';
import type { GameState } from '../core/types';
import type { LogCategory } from '../core/Events';

/** Map a legacy gameLogger tag to a unified log category. */
function tagToCategory(tag: string): LogCategory {
  if (tag.startsWith('ENTITY') || tag === 'MOB-SNAP' || tag === 'HUNT-UNREACHABLE') return 'ai';
  if (tag === 'PAWN-TICK' || tag === 'NEED-CHECK') return 'needs';
  if (tag === 'STATE-CHG' || tag === 'JOB-EVT') return 'job';
  if (tag === 'YIELD-DBG') return 'work';
  // ITEM-DBG: per-stack item lifecycle trace (spawn → pickup → carry → deposit → drop → sync) →
  // .debug/item.log. Each line carries the DroppedItem `id` so a stack can be followed hop to hop.
  if (tag === 'ITEM-DBG') return 'item';
  if (tag === 'PERF') return 'perf';
  return 'system'; // MAP-SNAP and any catch-all
}

class GameLoggerImpl {
  /** Verbose logging gate (build flag `--debug`/`--profiler`, or the Settings → Debug mode toggle at
   *  runtime). Live read so call-site guards see a runtime toggle immediately. */
  get isEnabled(): boolean {
    return isVerboseLogging();
  }

  /** Forward a tagged line into the gated unified pipeline. No-op unless `LOG_VERBOSE`. */
  log(turn: number, tag: string, msg: string | (() => string)): void {
    vlog(tagToCategory(tag), turn, msg);
  }

  /** Periodic compact settlement snapshot (system category). No-op unless verbose logging is on. */
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
