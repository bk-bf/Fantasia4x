// In-memory, session-scoped cache for per-tab UI position (selected filter/sub-tab etc.) that would
// otherwise reset when a screen unmounts on tab toggle. Not persisted to disk.
const cache = new Map<string, unknown>();

export function persisted<T>(key: string, fallback: T): T {
  return cache.has(key) ? (cache.get(key) as T) : fallback;
}

export function persist(key: string, value: unknown): void {
  cache.set(key, value);
}
