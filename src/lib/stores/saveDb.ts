const DB_NAME = 'fantasia4x';
const DB_VERSION = 1;
const STORE = 'saves';

export const SAVE_PREFIX = 'save:';
const WORLD_PREFIX = 'world:';
const META_PREFIX = 'meta:';
const LOG_PREFIX = 'log:';
export const saveKey = (id: string) => SAVE_PREFIX + id;
export const worldKey = (id: string) => WORLD_PREFIX + id;
export const metaKey = (id: string) => META_PREFIX + id;
export const logKey = (id: string) => LOG_PREFIX + id;

let _db: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => resolve(null);
  });
}

export async function idbPut(key: string, data: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(data, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function idbKeys(): Promise<string[]> {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAllKeys();
    req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(String));
    req.onerror = () => resolve([]);
  });
}

export async function deleteRecords(id: string): Promise<void> {
  await Promise.all([
    idbDelete(saveKey(id)),
    idbDelete(worldKey(id)),
    idbDelete(metaKey(id)),
    idbDelete(logKey(id))
  ]);
}
