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
import type { ActivityLogEntry } from '$lib/game/core/Events';

// ── constants ──────────────────────────────────────────────────────────────
const DB_NAME = 'fantasia4x';
const DB_VERSION = 1;
const STORE = 'saves';
const SAVE_KEY = 'current';
// The chronicle / activity log is persisted under its own key alongside the save
// so it survives a tab reload/discard (it lives in an in-memory store, not GameState).
const LOG_KEY = 'activity-log';
// The diagnostic debug log (unified logging: perf/ai/needs/job/system + verbose traces) is
// persisted under its own key too — same reason, but kept separate so its higher churn never
// competes with the chronicle's retention.
const DEBUG_LOG_KEY = 'debug-log';

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

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => resolve(null);
  });
}

async function idbPut(key: string, data: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(data, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
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
    const idbState = await idbGet<GameState>(SAVE_KEY);
    if (idbState) return hydrateState(idbState);

    // One-time migration from localStorage
    const legacy = readLegacyLocalStorage();
    if (legacy) {
      console.info('[SaveManager] Migrating save from localStorage → IndexedDB');
      idbPut(SAVE_KEY, stripState(legacy)).catch(console.error);
      clearLegacyLocalStorage();
      return legacy; // already has ascii / A* defaults from the old save
    }
  } catch (err) {
    console.warn('[SaveManager] Load failed:', err);
  }
  return null;
}

/** Delete the current save (and its chronicle) from both storage backends. */
export async function deleteSave(): Promise<void> {
  if (!browser) return;
  clearLegacyLocalStorage();
  await Promise.all([idbDelete(SAVE_KEY), idbDelete(LOG_KEY)]);
}

// ── debounced save ─────────────────────────────────────────────────────────

let _saveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Run `fn` when the main thread is next idle, falling back to a macrotask. ENGINE-PERFORMANCE.md §D3:
 * `stripState` clones all 38k worldMap tiles (`worldMap.map(row => row.map(stripTile))`) — a Chrome
 * trace of the heavy scene caught this running *synchronously inside the debounce timer*, hitching a
 * frame ~every 2 s during play. Deferring it to idle keeps the (already async) IDB write off the
 * frame-critical path; the `timeout` guarantees it still runs under sustained load.
 */
function runWhenIdle(fn: () => void): void {
  const ric = (
    globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }
  ).requestIdleCallback;
  if (ric) ric(fn, { timeout: 1000 });
  else setTimeout(fn, 0);
}

/**
 * Schedule a debounced save. Safe to call on every store update — writes are
 * batched into at most one IDB write every DEBOUNCE_MS milliseconds.
 */
export function scheduleSave(state: GameState): void {
  if (!browser) return;
  if (_saveTimer !== null) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    // Strip + write off the frame-critical path (§D3) — the 38k-tile clone is too heavy to run mid-frame.
    runWhenIdle(() => {
      idbPut(SAVE_KEY, stripState(state)).catch((err) => {
        console.warn('[SaveManager] IndexedDB write failed:', err);
      });
    });
  }, DEBOUNCE_MS);
}

// ── activity-log (chronicle) persistence ─────────────────────────────────────

/** Load the persisted chronicle. Returns [] if none exists. */
export async function loadActivityLog(): Promise<ActivityLogEntry[]> {
  if (!browser) return [];
  try {
    return (await idbGet<ActivityLogEntry[]>(LOG_KEY)) ?? [];
  } catch (err) {
    console.warn('[SaveManager] Chronicle load failed:', err);
    return [];
  }
}

let _logSaveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Schedule a debounced write of the chronicle. Safe to call on every log update —
 * writes are batched into at most one IDB write every DEBOUNCE_MS milliseconds.
 */
export function scheduleSaveActivityLog(entries: ActivityLogEntry[]): void {
  if (!browser) return;
  if (_logSaveTimer !== null) clearTimeout(_logSaveTimer);
  _logSaveTimer = setTimeout(() => {
    _logSaveTimer = null;
    idbPut(LOG_KEY, entries).catch((err) => {
      console.warn('[SaveManager] Chronicle write failed:', err);
    });
  }, DEBOUNCE_MS);
}

/**
 * Persist the chronicle IMMEDIATELY, cancelling any pending debounced write. Used when the player
 * clears the log: the debounced save is dropped on a page refresh, so without an eager flush a
 * quick reload after clearing would restore the old (never-written) log from IDB.
 */
export function saveActivityLogNow(entries: ActivityLogEntry[]): Promise<void> {
  if (!browser) return Promise.resolve();
  if (_logSaveTimer !== null) {
    clearTimeout(_logSaveTimer);
    _logSaveTimer = null;
  }
  return idbPut(LOG_KEY, entries).catch((err) => {
    console.warn('[SaveManager] Chronicle write failed:', err);
  });
}

// ── debug-log (diagnostics) persistence ──────────────────────────────────────

/** Load the persisted debug log. Returns [] if none exists. */
export async function loadDebugLog(): Promise<ActivityLogEntry[]> {
  if (!browser) return [];
  try {
    return (await idbGet<ActivityLogEntry[]>(DEBUG_LOG_KEY)) ?? [];
  } catch (err) {
    console.warn('[SaveManager] Debug-log load failed:', err);
    return [];
  }
}

let _debugLogSaveTimer: ReturnType<typeof setTimeout> | null = null;

/** Schedule a debounced write of the debug log (batched, same as the chronicle). */
export function scheduleSaveDebugLog(entries: ActivityLogEntry[]): void {
  if (!browser) return;
  if (_debugLogSaveTimer !== null) clearTimeout(_debugLogSaveTimer);
  _debugLogSaveTimer = setTimeout(() => {
    _debugLogSaveTimer = null;
    idbPut(DEBUG_LOG_KEY, entries).catch((err) => {
      console.warn('[SaveManager] Debug-log write failed:', err);
    });
  }, DEBOUNCE_MS);
}
