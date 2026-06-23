/**
 * saveManager — IndexedDB-backed persistence for Fantasia4x.
 *
 * Why IndexedDB over localStorage:
 *   - No 5-10 MB quota: IndexedDB can hold hundreds of MB.
 *   - Async: never blocks the main thread.
 *   - Structured clone: stores objects directly (no JSON parse overhead on read).
 *
 * Save model — an OPEN LIST of snapshots, not fixed slots. Each save is one id with three rows:
 *   `save:<id>`  — the stripped GameState
 *   `meta:<id>`  — a SaveMeta summary (read by the picker without hydrating the full save)
 *   `log:<id>`   — that save's chronicle (activity log)
 * There is one ACTIVE save id — the autosave/exit-flush target. New Game mints a fresh id; loading a save
 * makes IT active (so autosave overwrites the save you loaded, per the chosen model). The manual "Save Game"
 * button instead writes a NEW frozen snapshot that never becomes active, so manual saves accumulate as an
 * unbounded list of checkpoints while autosave keeps the active one current.
 *
 * The worldMap A* scratch fields (gCost, hCost, fCost, parent) and the ascii display char are stripped
 * before saving — re-derived at runtime, they were ~2 MB of dead weight per save.
 *
 * Legacy migration: the old fixed 3-slot saves (and the even older single save) are promoted to list
 * entries on first access.
 */

import { browser } from '$app/environment';
import { get } from 'svelte/store';
import type { GameState, WorldTile } from '$lib/game/core/types';
import type { ActivityLogEntry } from '$lib/game/core/Events';
import { TICKS_PER_SECOND } from '$lib/game/core/time';
import { autosaveEnabled } from './uiPrefs';

// ── constants ──────────────────────────────────────────────────────────────
const DB_NAME = 'fantasia4x';
const DB_VERSION = 1;
const STORE = 'saves';

// Key scheme. The colon-prefixed namespaces are how listSaves() enumerates the open save list; the old
// dash-style fixed-slot keys (`save-0`, `activity-log-0`, …) never collide with these and are migrated away.
const SAVE_PREFIX = 'save:';
const META_PREFIX = 'meta:';
const LOG_PREFIX = 'log:';
const saveKey = (id: string) => SAVE_PREFIX + id;
const metaKey = (id: string) => META_PREFIX + id;
const logKey = (id: string) => LOG_PREFIX + id;

/** Mint a unique save id (timestamp + short random so two saves in the same millisecond can't collide). */
function newSaveId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// The active save id — what the RUNNING game autosaves into (and reads its chronicle from). Set by the
// menu (New mints a fresh id; Load adopts the picked id) or, on a menu-bypass boot, resolved lazily to the
// most-recent save by loadSave(). null until a game is chosen.
let activeSaveId: string | null = null;
export function setActiveSave(id: string): void {
  activeSaveId = id;
  _activeCommitted = true; // loading an existing save is committed — persist it normally
}
/** Mint a brand-new active id (New Game, or the --debug empty-DB fallback). Committed by default; the
 *  New-Game flow then uncommits it (setActiveCommitted(false)) until the map is confirmed with GENERATE. */
export function mintActiveSave(): string {
  activeSaveId = newSaveId();
  _activeCommitted = true;
  return activeSaveId;
}
/** Guarantee an active save id exists (mint one if not) — the boot calls this so a fresh game with no
 *  save on disk (e.g. a --debug launch with an empty DB) still has an autosave target. No-op if already set. */
export function ensureActiveSave(): string {
  return activeSaveId ?? mintActiveSave();
}

/** Small per-save summary shown by the picker — read without hydrating the full save. */
export interface SaveMeta {
  raceName: string;
  day: number;
  season: string;
  population: number;
  savedAt: number; // epoch ms
  kind: 'auto' | 'manual'; // the kind of the LAST write (autosave vs manual snapshot)
}
/** One row in the save list: its id + summary. */
export interface SaveEntry {
  id: string;
  meta: SaveMeta;
}
const TICKS_PER_DAY = 300 * TICKS_PER_SECOND; // TURNS_PER_DAY (EnvironmentService) × ticks/sec
function buildMeta(state: GameState, kind: 'auto' | 'manual'): SaveMeta {
  return {
    raceName: state.race?.name ?? 'Unknown',
    day: Math.floor((state.turn ?? 0) / TICKS_PER_DAY) + 1,
    season: state.season ?? 'spring',
    population: state.pawns?.length ?? 0,
    savedAt: Date.now(),
    kind
  };
}

// The diagnostic debug log (perf/ai/needs/job/system + verbose traces) is global (not per-save) and kept
// under its own key so its high churn never competes with a save's chronicle retention.
const DEBUG_LOG_KEY = 'debug-log';

// Legacy keys (one-time migration only).
const LEGACY_SLOTS = 3;
const legacySaveKey = (i: number) => `save-${i}`;
const legacyLogKey = (i: number) => `activity-log-${i}`;
const legacyMetaKey = (i: number) => `save-${i}-meta`;
const LEGACY_IDB_SINGLE = 'current'; // pre-slots single IDB save
const LEGACY_IDB_SINGLE_LOG = 'activity-log';
const LS_SAVE_KEY = 'fantasia4x-save'; // pre-IDB localStorage save
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

/** Every key in the store (used to enumerate the save list and to wipe). */
async function idbKeys(): Promise<string[]> {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAllKeys();
    req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(String));
    req.onerror = () => resolve([]);
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
  try {
    localStorage.removeItem(LS_SAVE_KEY);
    localStorage.removeItem(LS_SAVE_VERSION_KEY);
  } catch {
    /* SSR / no localStorage — nothing to clear */
  }
}

// ── public API ─────────────────────────────────────────────────────────────

// One-time promotion of the old fixed-slot saves (and older single saves) into list entries. Idempotent:
// guarded by `_migrated` for the session and short-circuits once any `save:` entry exists.
let _migrated = false;
async function migrateLegacy(): Promise<void> {
  if (_migrated || !browser) return;
  _migrated = true;
  try {
    const keys = await idbKeys();
    if (keys.some((k) => k.startsWith(SAVE_PREFIX))) return; // already on the new format

    // Old 3 slots → one list entry each (preserving their meta + chronicle).
    for (let i = 0; i < LEGACY_SLOTS; i++) {
      const st = await idbGet<GameState>(legacySaveKey(i));
      if (!st) continue;
      const id = newSaveId();
      const oldMeta = await idbGet<Partial<SaveMeta>>(legacyMetaKey(i));
      await idbPut(saveKey(id), st);
      await idbPut(metaKey(id), { ...buildMeta(st, 'manual'), ...oldMeta, kind: 'manual' });
      const log = await idbGet<ActivityLogEntry[]>(legacyLogKey(i));
      if (log) await idbPut(logKey(id), log);
      await Promise.all([
        idbDelete(legacySaveKey(i)),
        idbDelete(legacyMetaKey(i)),
        idbDelete(legacyLogKey(i))
      ]);
    }

    // Even older single IDB save / localStorage save.
    const single = await idbGet<GameState>(LEGACY_IDB_SINGLE);
    if (single) {
      const id = newSaveId();
      await idbPut(saveKey(id), single);
      await idbPut(metaKey(id), buildMeta(single, 'manual'));
      const log = await idbGet<ActivityLogEntry[]>(LEGACY_IDB_SINGLE_LOG);
      if (log) await idbPut(logKey(id), log);
      await Promise.all([idbDelete(LEGACY_IDB_SINGLE), idbDelete(LEGACY_IDB_SINGLE_LOG)]);
    }
    const ls = readLegacyLocalStorage();
    if (ls) {
      const id = newSaveId();
      await idbPut(saveKey(id), stripState(ls));
      await idbPut(metaKey(id), buildMeta(ls, 'manual'));
      clearLegacyLocalStorage();
    }
  } catch (err) {
    console.warn('[SaveManager] legacy migration failed:', err);
  }
}

/**
 * Every save in the list, newest first. Back-fills a meta for any save row missing one (e.g. migrated or
 * interrupted writes) so the picker never drops a recoverable save.
 */
export async function listSaves(): Promise<SaveEntry[]> {
  if (!browser) return [];
  await migrateLegacy();
  const keys = await idbKeys();
  const ids = keys.filter((k) => k.startsWith(SAVE_PREFIX)).map((k) => k.slice(SAVE_PREFIX.length));
  const entries: SaveEntry[] = [];
  for (const id of ids) {
    let meta = await idbGet<SaveMeta>(metaKey(id)).catch(() => null);
    if (!meta) {
      const st = await idbGet<GameState>(saveKey(id)).catch(() => null);
      if (st) {
        meta = buildMeta(st, 'manual');
        idbPut(metaKey(id), meta).catch(() => {});
      }
    }
    if (meta) entries.push({ id, meta });
  }
  entries.sort((a, b) => b.meta.savedAt - a.meta.savedAt);
  return entries;
}

/**
 * Load a save and make it the active (autosave) target. With no id, loads the ACTIVE save if one is set,
 * else the most-recent save (the menu-bypass / --debug boot path). null when there's nothing to load.
 */
export async function loadSave(id?: string): Promise<GameState | null> {
  if (!browser) return null;
  try {
    await migrateLegacy();
    let target = id ?? activeSaveId;
    if (!target) target = (await listSaves())[0]?.id ?? null; // newest, for the menu-bypass boot
    if (!target) return null;
    activeSaveId = target; // the game now autosaves into whatever we loaded
    const st = await idbGet<GameState>(saveKey(target));
    if (st) return hydrateState(st);
  } catch (err) {
    console.warn('[SaveManager] Load failed:', err);
  }
  return null;
}

/** Whether ANY save exists (cheap — key enumeration, no hydrate). Gates the menu's Load Game button. */
export async function hasSave(): Promise<boolean> {
  if (!browser) return false;
  try {
    await migrateLegacy();
    return (await idbKeys()).some((k) => k.startsWith(SAVE_PREFIX));
  } catch {
    return false;
  }
}

/** Delete one save — its state, meta and chronicle. */
export async function deleteSaveById(id: string): Promise<void> {
  if (!browser) return;
  await Promise.all([idbDelete(saveKey(id)), idbDelete(metaKey(id)), idbDelete(logKey(id))]);
}

/** Wipe EVERY save (and any lingering legacy keys) — the dev hard-reset / wipe-and-reload. */
export async function deleteSave(): Promise<void> {
  if (!browser) return;
  clearLegacyLocalStorage();
  const keys = await idbKeys();
  // Keep the global debug log; nuke everything else (all saves + any stale legacy rows).
  await Promise.all(keys.filter((k) => k !== DEBUG_LOG_KEY).map(idbDelete));
}

// ── debounced save (autosave → active save) ──────────────────────────────────

let _saveTimer: ReturnType<typeof setTimeout> | null = null;

// The active save is PERSISTED (autosave + eager flush) only once it is COMMITTED. A brand-new game is
// uncommitted until the player confirms its map with GENERATE — so abandoning map-gen (exit to menu, ✕,
// reload) never leaves a phantom colony in the save list — and the Custom Map popup also uncommits while
// previewing a dev regen so a half-shaped preview isn't written. Loading an existing save is committed.
let _activeCommitted = true;
/** Mark whether the active save may be written. Setting it false also drops any pending debounced write
 *  so an already-scheduled autosave can't land afterwards. */
export function setActiveCommitted(committed: boolean): void {
  _activeCommitted = committed;
  if (!committed && _saveTimer !== null) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }
}
export function isActiveCommitted(): boolean {
  return _activeCommitted;
}

/**
 * Run `fn` when the main thread is next idle, falling back to a macrotask. ENGINE-PERFORMANCE.md §D3:
 * `stripState` clones all 38k worldMap tiles — running it synchronously inside the debounce timer hitched
 * a frame ~every 2 s during play. Deferring to idle keeps the (already async) IDB write off the
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
 * Schedule a debounced autosave of the ACTIVE save. Safe to call on every store update — batched into at
 * most one IDB write every DEBOUNCE_MS. Gated by the Settings "Autosave" toggle: off → never auto-persist
 * (manual snapshots via saveSnapshotNow are unaffected, so a manual-save player can still checkpoint).
 */
export function scheduleSave(state: GameState): void {
  if (!browser) return;
  if (!_activeCommitted) return; // map not yet committed (new game pre-GENERATE) — don't persist it
  if (!get(autosaveEnabled)) return;
  if (!activeSaveId) return; // no game started yet (menu) — nothing to autosave
  if (_saveTimer !== null) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    const id = activeSaveId; // capture: the target shouldn't drift if it changes mid-idle
    if (!id) return;
    // Strip + write off the frame-critical path (§D3) — the 38k-tile clone is too heavy to run mid-frame.
    runWhenIdle(() => {
      idbPut(saveKey(id), stripState(state)).catch((err) => {
        console.warn('[SaveManager] IndexedDB write failed:', err);
      });
      idbPut(metaKey(id), buildMeta(state, 'auto')).catch(() => {});
    });
  }, DEBOUNCE_MS);
}

/**
 * Flush the ACTIVE save to disk immediately, cancelling any pending debounced autosave. Used by exit /
 * quit / return-to-menu so progress is never lost on the way out — intentionally NOT gated by the autosave
 * toggle (it's a one-shot safety flush of the current game, not periodic autosaving).
 */
export function saveGameNow(state: GameState): Promise<void> {
  if (!browser) return Promise.resolve();
  // An uncommitted new game (map-gen abandoned via exit-to-menu / ✕ / reload) must not be flushed —
  // this is the path goToMainMenu()/quit take, and it's why abandoning map-gen left a phantom colony.
  if (!_activeCommitted) return Promise.resolve();
  if (_saveTimer !== null) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }
  const id = activeSaveId ?? mintActiveSave();
  idbPut(metaKey(id), buildMeta(state, 'auto')).catch(() => {});
  return idbPut(saveKey(id), stripState(state)).catch((err) => {
    console.warn('[SaveManager] IndexedDB write failed:', err);
  });
}

/** Write the current state + chronicle as a manual snapshot under `id` (new or existing). Shared by the
 *  "new snapshot" and "overwrite existing" paths so both stamp meta/log/state identically. */
async function writeSnapshot(
  id: string,
  state: GameState,
  chronicle?: ActivityLogEntry[]
): Promise<void> {
  idbPut(metaKey(id), buildMeta(state, 'manual')).catch(() => {});
  if (chronicle && chronicle.length) idbPut(logKey(id), chronicle).catch(() => {});
  await idbPut(saveKey(id), stripState(state)).catch((err) => {
    console.warn('[SaveManager] Snapshot write failed:', err);
  });
}

/**
 * Write a NEW frozen snapshot (pause-menu "Save Game" → New Snapshot). Mints a fresh id that does NOT
 * become the active save, so the snapshot is a permanent checkpoint while autosave keeps advancing the
 * active save. `chronicle` is captured alongside so it carries the history as it stood. Resolves to the id.
 */
export async function saveSnapshotNow(
  state: GameState,
  chronicle?: ActivityLogEntry[]
): Promise<string> {
  if (!browser) return '';
  const id = newSaveId();
  await writeSnapshot(id, state, chronicle);
  return id;
}

/**
 * Overwrite an EXISTING save in place (pause-menu "Save Game" → pick a save). Replaces its state, meta and
 * chronicle and re-stamps savedAt, but keeps its id, so it stays the same list entry (re-sorted to newest).
 */
export async function overwriteSnapshotNow(
  id: string,
  state: GameState,
  chronicle?: ActivityLogEntry[]
): Promise<void> {
  if (!browser) return;
  await writeSnapshot(id, state, chronicle);
}

// ── activity-log (chronicle) persistence ─────────────────────────────────────
// The chronicle of the RUNNING game is persisted against the ACTIVE save id, exactly like the autosave,
// so a reload restores the active save's history. Manual snapshots get their own frozen copy (above).

/** Load the active save's chronicle. Returns [] if none (fresh game / unset active id). */
export async function loadActivityLog(): Promise<ActivityLogEntry[]> {
  if (!browser || !activeSaveId) return [];
  try {
    return (await idbGet<ActivityLogEntry[]>(logKey(activeSaveId))) ?? [];
  } catch (err) {
    console.warn('[SaveManager] Chronicle load failed:', err);
    return [];
  }
}

let _logSaveTimer: ReturnType<typeof setTimeout> | null = null;

/** Schedule a debounced write of the active save's chronicle (batched, same cadence as the state save). */
export function scheduleSaveActivityLog(entries: ActivityLogEntry[]): void {
  if (!browser || !activeSaveId) return;
  if (_logSaveTimer !== null) clearTimeout(_logSaveTimer);
  const id = activeSaveId;
  _logSaveTimer = setTimeout(() => {
    _logSaveTimer = null;
    idbPut(logKey(id), entries).catch((err) => {
      console.warn('[SaveManager] Chronicle write failed:', err);
    });
  }, DEBOUNCE_MS);
}

/**
 * Persist the active save's chronicle IMMEDIATELY, cancelling any pending debounced write. Used when the
 * player clears the log so a quick reload won't restore the old (never-written) log from a dropped debounce.
 */
export function saveActivityLogNow(entries: ActivityLogEntry[]): Promise<void> {
  if (!browser || !activeSaveId) return Promise.resolve();
  if (_logSaveTimer !== null) {
    clearTimeout(_logSaveTimer);
    _logSaveTimer = null;
  }
  return idbPut(logKey(activeSaveId), entries).catch((err) => {
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
