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

/** Append ONE line to `.debug/crash.log` synchronously (dev only; a no-op in prod / SSR / no-XHR). */
export function crashBreadcrumb(turn: number, message: string): void {
  // import.meta.env.DEV gates it to the dev server (where /api/log actually writes a file).
  if (typeof XMLHttpRequest === 'undefined' || !import.meta.env.DEV) return;
  try {
    const t = String(turn ?? 0).padStart(5, '0');
    const line = `[T${t}] [warn] #${++_seq} ${message}`;
    const xhr = new XMLHttpRequest();
    // `false` = SYNCHRONOUS: returns only once the server has appendFileSync'd the line, so it survives
    // a GPU hang / process kill on the very next statement. That guarantee is the whole point.
    xhr.open('POST', '/api/log', false);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify({ entries: [{ category: 'crash', line }] }));
  } catch {
    /* the breadcrumb must NEVER itself throw or block the game beyond the write attempt */
  }
}
