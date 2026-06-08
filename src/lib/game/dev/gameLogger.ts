/**
 * gameLogger — dev-only file-backed structured logger.
 *
 * Buffers tagged log lines and flushes them to the server-side
 * /api/debug-log endpoint, which appends to .debug/game.log.
 * Only active in development; the server endpoint is a no-op in production.
 *
 * ─── Usage ────────────────────────────────────────────────────────────────
 *
 *   import { gameLogger } from '$lib/game/dev/gameLogger';
 *   gameLogger.log(gs.turn, 'MY-TAG', 'some message');
 *   gameLogger.logMapSnap(gs);   // full settlement snapshot
 *
 * ─── Tags (grep targets) ─────────────────────────────────────────────────
 *
 *   [PAWN-TICK]   Per-pawn per-turn status snapshot
 *   [NEED-CHECK]  Need-interruption decision trace (eat/sleep thresholds)
 *   [STATE-CHG]   Pawn state transition events
 *   [JOB-EVT]     Job claim / release events
 *   [MAP-SNAP]    Periodic full-settlement snapshot (every N turns)
 *
 * ─── Filtering examples ───────────────────────────────────────────────────
 *
 *   grep '\[NEED-CHECK\]' .debug/game.log
 *   grep '\[MAP-SNAP\]'   .debug/game.log
 *   grep 'Zara Ironforge' .debug/game.log
 *   grep 'INTERRUPT'      .debug/game.log
 *
 * ─── File location ────────────────────────────────────────────────────────
 *
 *   .debug/game.log  (project root, gitignored)
 */

import type { GameState } from '../core/types';

/** Flush the buffer when it reaches this many lines. */
const FLUSH_SIZE = 40;
/** Also flush every N milliseconds even if buffer is small. */
const FLUSH_INTERVAL_MS = 3000;

class GameLoggerImpl {
    private buffer: string[] = [];
    private timer: ReturnType<typeof setInterval> | null = null;

    constructor() {
        // Start auto-flush timer in browser only.
        if (typeof window !== 'undefined') {
            this.timer = setInterval(() => {
                if (this.buffer.length > 0) this.flush();
            }, FLUSH_INTERVAL_MS);
        }
    }

    /**
     * Append a tagged line to the write buffer.
     *
     * @param turn   Current game turn (used in prefix).
     * @param tag    Uppercase tag string — e.g. 'PAWN-TICK', 'NEED-CHECK'.
     * @param msg    Message body.
     */
    log(turn: number, tag: string, msg: string): void {
        const ts = new Date().toISOString();
        const t = String(turn).padStart(4, '0');
        this.buffer.push(`${ts} [T${t}] [${tag}] ${msg}`);
        if (this.buffer.length >= FLUSH_SIZE) this.flush();
    }

    /**
     * Emit a [MAP-SNAP] line: full settlement + all-pawn summary.
     * Intended to be called every N turns from PawnStateMachineImpl.tick().
     */
    logMapSnap(gs: GameState): void {
        const livePawns = (gs.pawns ?? []).filter((p) => p.isAlive !== false);
        const allJobs = gs.jobs ?? [];
        const claimedJobs = allJobs.filter((j) => j.claimedBy);
        const buildings = gs.buildings ?? [];
        const campfires = buildings.filter(
            (b) => b.status === 'complete' && /campfire|bonfire|hearth/i.test(b.type)
        );
        const shelters = buildings.filter(
            (b) => b.status === 'complete' && /shelter|bed|hut|tent/i.test(b.type)
        );

        const pawnLines = livePawns.map((p) => {
            const pos = p.position ? `(${p.position.x},${p.position.y})` : '(-,-)';
            const h = (p.needs?.hunger ?? 0).toFixed(0);
            const f = (p.needs?.fatigue ?? 0).toFixed(0);
            const idTag = p.debugId != null ? `#${p.debugId} ` : '';
            return `${idTag}${p.name}:${p.currentState ?? 'Idle'}@${pos} H${h}/F${f}`;
        });

        const msg =
            `pawns:${livePawns.length}` +
            ` jobs:${allJobs.length}(${claimedJobs.length}claimed)` +
            ` campfires:${campfires.length} shelters:${shelters.length}` +
            ` | ${pawnLines.join(' | ')}`;

        this.log(gs.turn, 'MAP-SNAP', msg);

        // Mob summary — emit if any entities are present.
        const mobs = gs.mobs ?? [];
        if (mobs.length > 0) {
            const byState: Record<string, number> = {};
            let hungry = 0;
            let dead = 0;
            for (const m of mobs) {
                byState[m.state] = (byState[m.state] ?? 0) + 1;
                if (m.state === 'Corpse') dead++;
                else if (m.needs.hunger >= 80) hungry++;
            }
            const stateSummary = Object.entries(byState)
                .map(([s, n]) => `${s}:${n}`)
                .join(' ');
            const mobLines = mobs
                .filter((m) => m.state !== 'Corpse')
                .slice(0, 10)
                .map((m) => {
                    const idTag = m.debugId != null ? `#${m.debugId} ` : '';
                    return `${idTag}${m.creatureId}:${m.state}@(${m.x},${m.y})`;
                })
                .join(' | ');
            const mobSuffix = mobs.filter((m) => m.state !== 'Corpse').length > 10 ? ' …' : '';
            this.log(gs.turn, 'MOB-SNAP', `total:${mobs.length} ${stateSummary} hungry(≥80):${hungry} corpses:${dead} | ${mobLines}${mobSuffix}`);
        }
    }

    /**
     * Flush buffered lines to the server immediately.
     * Fire-and-forget; errors are silently dropped so game never stalls.
     */
    flush(): void {
        if (this.buffer.length === 0) return;
        const lines = this.buffer.splice(0);

        // sendBeacon is more reliable during page unload.
        if (typeof navigator !== 'undefined') {
            const body = JSON.stringify({ lines });
            const blob = new Blob([body], { type: 'application/json' });
            if (navigator.sendBeacon('/api/debug-log', blob)) return;
        }

        // Fallback: fetch with keepalive.
        fetch('/api/debug-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lines }),
            keepalive: true
        }).catch(() => {
            /* intentionally silent */
        });
    }

    /** Flush and stop the auto-flush timer. Call on hot-module replacement. */
    destroy(): void {
        this.flush();
        if (this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
}

export const gameLogger = new GameLoggerImpl();

// Hot-module replacement: flush and recreate on code changes.
if (import.meta.hot) {
    import.meta.hot.dispose(() => gameLogger.destroy());
}
