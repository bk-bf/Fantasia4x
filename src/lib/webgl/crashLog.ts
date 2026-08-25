let _seq = 0;

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
  } catch {}
}
