/**
 * saveManager — IndexedDB-backed persistence for Fantasia4x.
 *
 * Why IndexedDB over localStorage:
 *   - No 5-10 MB quota: IndexedDB can hold hundreds of MB.
 *   - Async: never blocks the main thread.
 *   - Structured clone: stores objects directly (no JSON parse overhead on read).
 *
 * The worldMap A* scratch fields (gCost, hCost, fCost, parent) and the ascii
 * display char are stripped before saving — they're re-derived at runtime and
 * were responsible for ~2 MB of unnecessary storage per save.
 *
 * Legacy migration: if no IndexedDB save is found, we look for the old
 * localStorage key and promote it automatically.
 */

import { browser } from '$app/environment';
import type { GameState, WorldTile } from '$lib/game/core/types';

// ── constants ──────────────────────────────────────────────────────────────
const DB_NAME = 'fantasia4x';
const DB_VERSION = 1;
const STORE = 'saves';
const SAVE_KEY = 'current';

// Legacy localStorage keys (for one-time migration)
const LS_SAVE_KEY = 'fantasia4x-save';
const LS_SAVE_VERSION_KEY = 'fantasia4x-save-version';

// Debounce delay (ms) — saves are batched so rapid updates don't hammer IDB.
const DEBOUNCE_MS = 2000;

// ── DB handle ──────────────────────────────────────────────────────────────
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

// ── field stripping ────────────────────────────────────────────────────────

type SavedTile = Omit<WorldTile, 'gCost' | 'hCost' | 'fCost' | 'parent' | 'ascii'>;

/** Strip runtime-only fields from tiles before persisting. */
function stripTile({
  gCost: _g,
  hCost: _h,
  fCost: _f,
  parent: _p,
  ascii: _a,
  ...tile
}: WorldTile): SavedTile {
  return tile;
}

/** Restore runtime defaults for stripped fields after loading. */
function hydrateTile(tile: SavedTile): WorldTile {
  return { ...tile, ascii: ' ', gCost: 0, hCost: 0, fCost: 0, parent: null };
}

function stripState(state: GameState): unknown {
  return {
    ...state,
    worldMap: state.worldMap.map((row) => row.map(stripTile))
  };
}

function hydrateState(raw: GameState): GameState {
  return {
    ...raw,
    worldMap: (raw.worldMap as unknown as SavedTile[][]).map((row) => row.map(hydrateTile))
  };
}

// ── core IDB operations ────────────────────────────────────────────────────

async function idbGet(): Promise<GameState | null> {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(SAVE_KEY);
    req.onsuccess = () => resolve((req.result as GameState) ?? null);
    req.onerror = () => resolve(null);
  });
}

async function idbPut(data: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(data, SAVE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(SAVE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// ── legacy localStorage fallback ───────────────────────────────────────────

function readLegacyLocalStorage(): GameState | null {
  try {
    const raw = localStorage.getItem(LS_SAVE_KEY);
    return raw ? (JSON.parse(raw) as GameState) : null;
  } catch {
    return null;
  }
}

function clearLegacyLocalStorage(): void {
  localStorage.removeItem(LS_SAVE_KEY);
  localStorage.removeItem(LS_SAVE_VERSION_KEY);
}

// ── public API ─────────────────────────────────────────────────────────────

/**
 * Load the most recent save.
 * Tries IndexedDB first; falls back to the old localStorage save and migrates it.
 * Returns null if no save exists.
 */
export async function loadSave(): Promise<GameState | null> {
  if (!browser) return null;
  try {
    const idbState = await idbGet();
    if (idbState) return hydrateState(idbState);

    // One-time migration from localStorage
    const legacy = readLegacyLocalStorage();
    if (legacy) {
      console.info('[SaveManager] Migrating save from localStorage → IndexedDB');
      idbPut(stripState(legacy)).catch(console.error);
      clearLegacyLocalStorage();
      return legacy; // already has ascii / A* defaults from the old save
    }
  } catch (err) {
    console.warn('[SaveManager] Load failed:', err);
  }
  return null;
}

/** Delete the current save from both storage backends. */
export async function deleteSave(): Promise<void> {
  if (!browser) return;
  clearLegacyLocalStorage();
  await idbDelete();
}

// ── debounced save ─────────────────────────────────────────────────────────

let _saveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Schedule a debounced save. Safe to call on every store update — writes are
 * batched into at most one IDB write every DEBOUNCE_MS milliseconds.
 */
export function scheduleSave(state: GameState): void {
  if (!browser) return;
  if (_saveTimer !== null) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    idbPut(stripState(state)).catch((err) => {
      console.warn('[SaveManager] IndexedDB write failed:', err);
    });
  }, DEBOUNCE_MS);
}
