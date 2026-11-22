import { describe, it, expect, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true, dev: false, building: false, version: 'test' }));

const OLDER = '1700000000000-aaaaa';
const DYING = '1800000000000-bbbbb';

const store = new Map<string, unknown>([
  [`save:${OLDER}`, { turn: 90000 }],
  [`world:${OLDER}`, [[]]],
  [`meta:${OLDER}`, { kind: 'manual', cultureName: 'Older colony' }],
  [`log:${OLDER}`, []],
  [`save:${DYING}`, { turn: 4000 }],
  [`meta:${DYING}`, { kind: 'auto', cultureName: 'Colony that just died' }],
  ['debug-log', []]
]);

function request<T>(result: () => T) {
  const req: { result?: T; onsuccess?: () => void; onerror?: () => void } = {};
  setTimeout(() => {
    req.result = result();
    req.onsuccess?.();
  }, 0);
  return req;
}

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

vi.stubGlobal('sessionStorage', memoryStorage());
vi.stubGlobal('localStorage', memoryStorage());

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
}

describe('RESTART on the game-over screen', () => {
  it("removes the dead colony's save and keeps every other colony's", async () => {
    const sm = await import('$lib/stores/saveManager');
    const { gameState } = await import('$lib/stores/gameState');
    sm.setActiveSave(DYING);

    gameState.resetGame();
    await settle();

    expect(store.has(`save:${OLDER}`)).toBe(true);
    expect(store.has(`meta:${OLDER}`)).toBe(true);
    expect(store.has(`save:${DYING}`)).toBe(false);
    expect(store.has(`meta:${DYING}`)).toBe(false);
    expect(sm.ensureActiveSave()).not.toBe(DYING);
  }, 120_000);
});
