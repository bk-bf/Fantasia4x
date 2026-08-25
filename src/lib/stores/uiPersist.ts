const cache = new Map<string, unknown>();

export function persisted<T>(key: string, fallback: T): T {
  return cache.has(key) ? (cache.get(key) as T) : fallback;
}

export function persist(key: string, value: unknown): void {
  cache.set(key, value);
}
