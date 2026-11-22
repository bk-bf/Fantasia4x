type Handler = ((e?: unknown) => void) | null;

interface FakeRequest {
  result: unknown;
  error: null;
  onsuccess: Handler;
  onerror: Handler;
  onupgradeneeded: Handler;
}

const later = (f: () => void) => queueMicrotask(f);

function request(read: () => unknown): FakeRequest {
  const req: FakeRequest = {
    result: undefined,
    error: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null
  };
  later(() => {
    req.result = read();
    req.onsuccess?.({ target: req });
  });
  return req;
}

export function installFakeIndexedDb(): Map<string, unknown> {
  const data = new Map<string, unknown>();
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => undefined,
    transaction: () => {
      const tx: { oncomplete: Handler; onerror: Handler; error: null; objectStore: () => unknown } =
        {
          oncomplete: null,
          onerror: null,
          error: null,
          objectStore: () => ({
            get: (key: string) => request(() => structuredClone(data.get(key))),
            getAllKeys: () => request(() => [...data.keys()]),
            put: (value: unknown, key: string) => {
              data.set(key, structuredClone(value));
              later(() => tx.oncomplete?.());
            },
            delete: (key: string) => {
              data.delete(key);
              later(() => tx.oncomplete?.());
            }
          })
        };
      return tx;
    }
  };
  (globalThis as Record<string, unknown>).indexedDB = { open: () => request(() => db) };
  return data;
}
