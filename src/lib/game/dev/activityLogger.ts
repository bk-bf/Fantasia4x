/**
 * activityLogger — dev-only file-backed activity log writer.
 *
 * Buffers activity log entries and flushes them to the server-side
 * /api/activity-log endpoint, which appends to .debug/activity.log.
 * Only active in development; the server endpoint is a no-op in production.
 *
 * ─── Usage ────────────────────────────────────────────────────────────────
 *
 *   import { activityLogger } from '$lib/game/dev/activityLogger';
 *   activityLogger.log(entry);
 *
 * ─── File location ────────────────────────────────────────────────────────
 *
 *   .debug/activity.log  (project root, gitignored)
 */

import type { ActivityLogEntry } from '../core/Events';

/** Flush the buffer when it reaches this many entries. */
const FLUSH_SIZE = 20;
/** Also flush every N milliseconds even if buffer is small. */
const FLUSH_INTERVAL_MS = 2000;

class ActivityLoggerImpl {
  private buffer: ActivityLogEntry[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.timer = setInterval(() => {
        if (this.buffer.length > 0) this.flush();
      }, FLUSH_INTERVAL_MS);
    }
  }

  /** Append an activity entry to the write buffer. */
  log(entry: ActivityLogEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length >= FLUSH_SIZE) this.flush();
  }

  /** Flush buffered entries to the server immediately. */
  flush(): void {
    if (this.buffer.length === 0) return;
    const entries = this.buffer.splice(0);

    const body = JSON.stringify({ entries });
    const blob = new Blob([body], { type: 'application/json' });

    if (typeof navigator !== 'undefined' && navigator.sendBeacon('/api/activity-log', blob)) {
      return;
    }

    fetch('/api/activity-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true
    }).catch(() => {
      /* intentionally silent */
    });
  }

  /** Flush and stop the auto-flush timer. */
  destroy(): void {
    this.flush();
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const activityLogger = new ActivityLoggerImpl();

if (import.meta.hot) {
  import.meta.hot.dispose(() => activityLogger.destroy());
}
