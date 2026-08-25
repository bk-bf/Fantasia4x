import { browser } from '$app/environment';
import { get } from 'svelte/store';
import type { GameState, WorldTile } from '$lib/game/core/types';
import type { ActivityLogEntry } from '$lib/game/core/defs/events';
import { TICKS_PER_SECOND } from '$lib/game/core/util/time';
import { SUBTERRAINS, SUBTERRAIN_FALLBACK } from '$lib/game/core/defs/terrains';
import { ensureWorkSkills } from '$lib/game/core/rules/body/workExperience';
import { ensureAptitudes } from '$lib/game/core/rules/body/aptitudes';
import { autosaveEnabled } from './uiPrefs';

const DB_NAME = 'fantasia4x';
const DB_VERSION = 1;
const STORE = 'saves';

const SAVE_PREFIX = 'save:';
const WORLD_PREFIX = 'world:';
const META_PREFIX = 'meta:';
const LOG_PREFIX = 'log:';
const saveKey = (id: string) => SAVE_PREFIX + id;
const worldKey = (id: string) => WORLD_PREFIX + id;
const metaKey = (id: string) => META_PREFIX + id;
const logKey = (id: string) => LOG_PREFIX + id;

function newSaveId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

let _savedWorldRef: unknown = null;
let _savedTerrainRev: number | undefined;
const terrainRevOf = (state: GameState): number | undefined =>
  (state as { _terrainRev?: number })._terrainRev;
function resetWorldDirty(): void {
  _savedWorldRef = null;
  _savedTerrainRev = undefined;
}
function worldDirty(state: GameState): boolean {
  return state.worldMap !== _savedWorldRef || terrainRevOf(state) !== _savedTerrainRev;
}
function markWorldSaved(state: GameState): void {
  _savedWorldRef = state.worldMap;
  _savedTerrainRev = terrainRevOf(state);
}

let activeSaveId: string | null = null;
export function setActiveSave(id: string): void {
  activeSaveId = id;
  _activeCommitted = true;
  resetWorldDirty();
}
export function mintActiveSave(): string {
  activeSaveId = newSaveId();
  _activeCommitted = true;
  resetWorldDirty();
  return activeSaveId;
}
export function ensureActiveSave(): string {
  return activeSaveId ?? mintActiveSave();
}

export interface SaveMeta {
  cultureName: string;
  day: number;
  season: string;
  population: number;
  savedAt: number;
  kind: 'auto' | 'manual';
  seed?: number;
}
export interface SaveEntry {
  id: string;
  meta: SaveMeta;
}
const TICKS_PER_DAY = 300 * TICKS_PER_SECOND;
function buildMeta(state: GameState, kind: 'auto' | 'manual'): SaveMeta {
  return {
    cultureName: state.culture?.name ?? 'Unknown',
    day: Math.floor((state.turn ?? 0) / TICKS_PER_DAY) + 1,
    season: state.season ?? 'spring',
    population: state.pawns?.length ?? 0,
    savedAt: Date.now(),
    kind,
    seed: state.seed
  };
}

const DEBUG_LOG_KEY = 'debug-log';

const LEGACY_SLOTS = 3;
const legacySaveKey = (i: number) => `save-${i}`;
const legacyLogKey = (i: number) => `activity-log-${i}`;
const legacyMetaKey = (i: number) => `save-${i}-meta`;
const LEGACY_IDB_SINGLE = 'current';
const LEGACY_IDB_SINGLE_LOG = 'activity-log';
const LS_SAVE_KEY = 'fantasia4x-save';
const LS_SAVE_VERSION_KEY = 'fantasia4x-save-version';

const DEBOUNCE_MS = 2000;

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

type SavedTile = Omit<WorldTile, 'gCost' | 'hCost' | 'fCost' | 'parent' | 'ascii'>;

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

function hydrateTile(tile: SavedTile): WorldTile {
  return { ...tile, ascii: ' ', gCost: 0, hCost: 0, fCost: 0, parent: null };
}

function stripState(state: GameState): unknown {
  return {
    ...state,
    worldMap: state.worldMap.map((row) => row.map(stripTile))
  };
}

function stripDynamic(state: GameState): unknown {
  const { worldMap: _worldMap, ...rest } = state;
  return rest;
}

function stripWorld(worldMap: GameState['worldMap']): SavedTile[][] {
  return worldMap.map((row) => row.map(stripTile));
}

function hydrateState(dynamic: GameState, world: SavedTile[][]): GameState {
  return {
    ...dynamic,
    worldMap: world.map((row) => row.map(hydrateTile))
  };
}

const REMAP_SUBTYPE: Record<string, string> = { cliff: 'cave', rocky: 'cave' };

function migrateLoadedTerrain(worldMap: WorldTile[][]): void {
  for (const row of worldMap) {
    for (const tile of row) {
      const next = REMAP_SUBTYPE[tile.subType];
      if (!next) continue;
      tile.subType = next;
      const blocked = !!tile.resources && Object.values(tile.resources).some((a) => a > 0);
      if (!blocked) {
        const sub = SUBTERRAINS[next] ?? SUBTERRAIN_FALLBACK;
        tile.walkable = sub.walkable;
        tile.blocksSight = sub.blocksSight ?? false;
        tile.movementCost = sub.movementCost;
      }
    }
  }
}

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

async function idbKeys(): Promise<string[]> {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAllKeys();
    req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(String));
    req.onerror = () => resolve([]);
  });
}

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
  } catch {}
}

let _migrated = false;
async function migrateLegacy(): Promise<void> {
  if (_migrated || !browser) return;
  _migrated = true;
  try {
    const keys = await idbKeys();
    if (keys.some((k) => k.startsWith(SAVE_PREFIX))) return;

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

export async function loadSave(id?: string): Promise<GameState | null> {
  if (!browser) return null;
  try {
    await migrateLegacy();
    let target = id ?? activeSaveId;
    if (!target) target = (await listSaves())[0]?.id ?? null;
    if (!target) return null;
    activeSaveId = target;
    resetWorldDirty();
    const dyn = await idbGet<GameState>(saveKey(target));
    if (!dyn) return null;
    let world = await idbGet<SavedTile[][]>(worldKey(target));
    const embedded = (dyn as { worldMap?: SavedTile[][] }).worldMap;
    if (!world && embedded?.length) world = embedded;
    if (world) {
      const state = hydrateState(dyn, world);
      migrateLoadedTerrain(state.worldMap);
      ensureWorkSkills(state.pawns ?? []);
      ensureAptitudes(state.pawns ?? []);
      return state;
    }
  } catch (err) {
    console.warn('[SaveManager] Load failed:', err);
  }
  return null;
}

export async function hasSave(): Promise<boolean> {
  if (!browser) return false;
  try {
    await migrateLegacy();
    return (await idbKeys()).some((k) => k.startsWith(SAVE_PREFIX));
  } catch {
    return false;
  }
}

export async function deleteSaveById(id: string): Promise<void> {
  if (!browser) return;
  await Promise.all([
    idbDelete(saveKey(id)),
    idbDelete(worldKey(id)),
    idbDelete(metaKey(id)),
    idbDelete(logKey(id))
  ]);
}

export async function deleteSave(): Promise<void> {
  if (!browser) return;
  clearLegacyLocalStorage();
  const keys = await idbKeys();
  await Promise.all(keys.filter((k) => k !== DEBUG_LOG_KEY).map(idbDelete));
}

let _saveTimer: ReturnType<typeof setTimeout> | null = null;

let _activeCommitted = true;
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

function runWhenIdle(fn: () => void): void {
  const ric = (
    globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }
  ).requestIdleCallback;
  if (ric) ric(fn, { timeout: 1000 });
  else setTimeout(fn, 0);
}

export function scheduleSave(state: GameState): void {
  if (!browser) return;
  if (!_activeCommitted) return;
  if (!get(autosaveEnabled)) return;
  if (!activeSaveId) return;
  if (_saveTimer !== null) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    const id = activeSaveId;
    if (!id) return;
    runWhenIdle(() => {
      if (worldDirty(state)) {
        markWorldSaved(state);
        idbPut(worldKey(id), stripWorld(state.worldMap)).catch((err) => {
          resetWorldDirty();
          console.warn('[SaveManager] worldMap write failed:', err);
        });
      }
      idbPut(saveKey(id), stripDynamic(state)).catch((err) => {
        console.warn('[SaveManager] IndexedDB write failed:', err);
      });
      idbPut(metaKey(id), buildMeta(state, 'auto')).catch(() => {});
    });
  }, DEBOUNCE_MS);
}

export function saveGameNow(state: GameState): Promise<void> {
  if (!browser) return Promise.resolve();
  if (!_activeCommitted) return Promise.resolve();
  if (_saveTimer !== null) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }
  const id = activeSaveId ?? mintActiveSave();
  idbPut(metaKey(id), buildMeta(state, 'auto')).catch(() => {});
  const writes: Promise<unknown>[] = [
    idbPut(saveKey(id), stripDynamic(state)).catch((err) => {
      console.warn('[SaveManager] IndexedDB write failed:', err);
    })
  ];
  if (worldDirty(state)) {
    markWorldSaved(state);
    writes.push(
      idbPut(worldKey(id), stripWorld(state.worldMap)).catch((err) => {
        resetWorldDirty();
        console.warn('[SaveManager] worldMap write failed:', err);
      })
    );
  }
  return Promise.all(writes).then(() => {});
}

async function writeSnapshot(
  id: string,
  state: GameState,
  chronicle?: ActivityLogEntry[]
): Promise<void> {
  idbPut(metaKey(id), buildMeta(state, 'manual')).catch(() => {});
  if (chronicle && chronicle.length) idbPut(logKey(id), chronicle).catch(() => {});
  idbPut(worldKey(id), stripWorld(state.worldMap)).catch((err) => {
    console.warn('[SaveManager] Snapshot worldMap write failed:', err);
  });
  await idbPut(saveKey(id), stripDynamic(state)).catch((err) => {
    console.warn('[SaveManager] Snapshot write failed:', err);
  });
}

export async function saveSnapshotNow(
  state: GameState,
  chronicle?: ActivityLogEntry[]
): Promise<string> {
  if (!browser) return '';
  const id = newSaveId();
  await writeSnapshot(id, state, chronicle);
  return id;
}

export async function overwriteSnapshotNow(
  id: string,
  state: GameState,
  chronicle?: ActivityLogEntry[]
): Promise<void> {
  if (!browser) return;
  await writeSnapshot(id, state, chronicle);
}

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
