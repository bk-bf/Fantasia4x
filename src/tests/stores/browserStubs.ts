import { vi } from 'vitest';

function request<T>(result: () => T) {
  const req: { result?: T; onsuccess?: () => void; onerror?: () => void } = {};
  setTimeout(() => {
    req.result = result();
    req.onsuccess?.();
  }, 0);
  return req;
}

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    }
  };
}

export function stubBrowser(store: Map<string, unknown>, search = ''): void {
  const db = {
    objectStoreNames: { contains: () => true },
    transaction() {
      const tx: { oncomplete?: () => void; onerror?: () => void; objectStore: () => unknown } = {
        objectStore: () => ({
          getAllKeys: () => request(() => [...store.keys()]),
          get: (key: string) => request(() => store.get(key)),
          put(value: unknown, key: string) {
            store.set(key, value);
            setTimeout(() => tx.oncomplete?.(), 0);
          },
          delete(key: string) {
            store.delete(key);
            setTimeout(() => tx.oncomplete?.(), 0);
          }
        })
      };
      return tx;
    }
  };
  vi.stubGlobal('indexedDB', {
    open() {
      const req: { result?: unknown; onsuccess?: (e: unknown) => void } = {};
      setTimeout(() => {
        req.result = db;
        req.onsuccess?.({ target: req });
      }, 0);
      return req;
    }
  });
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('location', { search });
}

export async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
}
