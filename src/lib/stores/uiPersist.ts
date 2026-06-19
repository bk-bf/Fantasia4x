// Session-scoped cache for per-tab UI state — the selected filter/category/sub-tab (and similar
// "where was I" position) that would otherwise reset every time a tab is toggled closed, because the
// screen component unmounts and remounts. Generalises the SearchBar `cacheKey` pattern: a screen reads
// its last value with `persisted(key, fallback)` on init and writes back on change with `persist(key,
// value)` (a `$:`/`$effect` one-liner). Module-scoped, so it lives for the whole session and is shared
// across the mount/unmount cycles of a given screen. Not persisted to disk — purely in-memory.
const cache = new Map<string, unknown>();

/** Last stored value for `key`, or `fallback` if the screen hasn't stored one this session. */
export function persisted<T>(key: string, fallback: T): T {
  return cache.has(key) ? (cache.get(key) as T) : fallback;
}

/** Remember `value` for `key` so the next mount of the screen restores it. */
export function persist(key: string, value: unknown): void {
  cache.set(key, value);
}
