/**
 * crashLog — DEV-only SYNCHRONOUS crash breadcrumb → `.debug/crash.log`.
 *
 * WHY this exists: a pathological WebGL draw (a full-map re-vertex of several dense layers, a GPU
 * timeout/driver reset) can HARD-crash the whole renderer process mid-frame — taking DevTools and the
 * console with it. The normal log mirror (stores/Log.ts → `/api/log`) is DEBOUNCED + async, so its
 * in-memory batch is lost when the process dies: the crash leaves NO trace on disk, which is exactly
 * why it's been un-debuggable.
 *
 * This fires a **synchronous** XHR that the dev server appends with `appendFileSync` (see
 * routes/api/log/+server.ts), so the line is guaranteed FLUSHED TO DISK before the next JS statement
 * runs — i.e. before the risky draw that may hang. Blocking the main thread for the localhost
 * round-trip (~1 ms) is deliberate and fine: breadcrumbs fire ONLY on abnormal frames / exceptions /
 * context-loss, never on the steady render path.
 *
 * Read the trail with `grep . .debug/crash.log` (or `tail`). Each line carries a monotonic `#seq`, so
 * a gap / an "about to…" with no matching "…ok" pinpoints the frame the process died on.
 */

let _seq = 0;

/** Append ONE line to `.debug/crash.log` (dev only; a no-op in prod / SSR / no-fetch).
 *
 * NON-BLOCKING: a `keepalive` fetch queued in the browser's network stack, so it never stalls the main
 * thread (an earlier synchronous-XHR version risked ADDING to a freeze — the opposite of the point).
 * For a FREEZE (which recovers) the request flushes once the thread unblocks; for a hard process kill
 * nothing survives anyway. In practice the browser's own long-task Violation reporting is the more
 * reliable signal; this file just adds a durable record for context-loss + JS exceptions. */
export function crashBreadcrumb(turn: number, message: string): void {
  if (typeof fetch === 'undefined' || !import.meta.env.DEV) return;
  try {
    const t = String(turn ?? 0).padStart(5, '0');
    const line = `[T${t}] [warn] #${++_seq} ${message}`;
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: [{ category: 'crash', line }] }),
      keepalive: true
    }).catch(() => {});
  } catch {
    /* the breadcrumb must NEVER itself throw or block the game */
  }
}
