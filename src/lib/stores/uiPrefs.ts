// uiPrefs.ts — small, localStorage-backed UI preferences. These are view-only settings (panel
// collapse state, etc.), deliberately separate from the IndexedDB game save in saveManager.ts.
import { writable } from 'svelte/store';

const COLLAPSED_RES_CATS_KEY = 'fx.resourcePanel.collapsedCategories';
const HIDE_EMPTY_RES_CATS_KEY = 'fx.resourcePanel.hideEmptyCategories';
const HIDE_SIDEBARS_KEY = 'fx.layout.hideSidebars';
const DEBUG_MODE_KEY = 'fx.debug.enabled';

function loadStringList(key: string): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function persistStringList(key: string, value: string[]): string[] {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota / private mode — preference just won't persist */
    }
  }
  return value;
}

/**
 * Resource-sidebar category collapse state. Stores the set of COLLAPSED category ids, so the
 * default (and any newly-introduced category) is expanded. Persisted across sessions.
 */
function createCollapsedResourceCategories() {
  const { subscribe, set, update } = writable<string[]>(loadStringList(COLLAPSED_RES_CATS_KEY));
  const save = (v: string[]) => persistStringList(COLLAPSED_RES_CATS_KEY, v);
  return {
    subscribe,
    /** Collapse the category if open, expand it if collapsed. */
    toggle: (cat: string) =>
      update((list) => save(list.includes(cat) ? list.filter((c) => c !== cat) : [...list, cat])),
    /** Collapse exactly these categories (used by "collapse all"). */
    setAll: (cats: string[]) => set(save([...cats])),
    /** Expand everything. */
    clear: () => set(save([]))
  };
}

export const collapsedResourceCategories = createCollapsedResourceCategories();

function loadBool(key: string, fallback: boolean): boolean {
  if (typeof localStorage === 'undefined') return fallback;
  const raw = localStorage.getItem(key);
  return raw === null ? fallback : raw === 'true';
}

/**
 * Whether the resource sidebar hides categories that currently hold no resources. Enabled by
 * default; persisted across sessions.
 */
function createPersistedBool(key: string, fallback: boolean) {
  const { subscribe, set, update } = writable<boolean>(loadBool(key, fallback));
  const save = (v: boolean) => {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(key, String(v));
      } catch {
        /* quota / private mode */
      }
    }
    return v;
  };
  return {
    subscribe,
    set: (v: boolean) => set(save(v)),
    toggle: () => update((v) => save(!v))
  };
}

export const hideEmptyResourceCategories = createPersistedBool(HIDE_EMPTY_RES_CATS_KEY, true);

/**
 * Per-sidebar minimize toggles: collapse the Kingdom/Resources panel (left) or the Chronicle panel
 * (right) to a thin strip with just a restore button, widening the map. OFF by default; persisted.
 */
export const resourcesMinimized = createPersistedBool('fx.layout.resourcesMin', false);
export const chronicleMinimized = createPersistedBool('fx.layout.chronicleMin', false);

/**
 * "Cinematic" layout toggle: when on, the resource + chronicle sidebars go transparent and out of
 * flow (floating over the map), so the bottom nav and overlay panel reflow to fill the full viewport
 * width. ON by default; persisted across sessions (toggling it off sticks). Driven from the top-bar
 * settings menu.
 */
export const hideSidebars = createPersistedBool(HIDE_SIDEBARS_KEY, true);

/**
 * Debug mode: reveals the in-game DEBUG tab (map brushes / spawn tools / log) at runtime —
 * independent of the build-time VITE_DEBUG_MODE flag. OFF by default so a shipped/alpha build hides
 * the dev surface; the player opts in from Settings. Persisted.
 */
export const debugMode = createPersistedBool(DEBUG_MODE_KEY, false);

// ===== SETTINGS MENU (SettingsModal.svelte) =====

function loadNumber(key: string, fallback: number): number {
  if (typeof localStorage === 'undefined') return fallback;
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** localStorage-backed number preference (mirrors createPersistedBool). */
function createPersistedNumber(key: string, fallback: number) {
  const { subscribe, set } = writable<number>(loadNumber(key, fallback));
  const save = (v: number) => {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(key, String(v));
      } catch {
        /* quota / private mode */
      }
    }
    return v;
  };
  return {
    subscribe,
    set: (v: number) => set(save(v))
  };
}

/** Graphics — render the weather particle overlay (rain/snow/leaves). ON by default; persisted.
 *  Gates the <WeatherCanvas> mount in WorldEffectsLayer (in-game) + MenuPreviewBackdrop (title). */
export const weatherEffects = createPersistedBool('fx.gfx.weather', true);

/** Graphics — apply the day/night + weather hue tint to the UI panels/menu (the #ambient-tint
 *  feColorMatrix in +page.svelte). ON by default; persisted. The MAP's own day/night lighting is
 *  separate and unaffected — this is the UI tint only. */
export const dayNightTint = createPersistedBool('fx.gfx.dayNightTint', true);

/** Gameplay — debounced autosave to IndexedDB. ON by default; persisted. When off, scheduleSave is a
 *  no-op (manual "Save Game" still writes). */
export const autosaveEnabled = createPersistedBool('fx.gameplay.autosave', true);

/** Gameplay — simulation speed a freshly-started game runs at once unpaused (1×/2×/4×). Persisted. */
export const defaultGameSpeed = createPersistedNumber('fx.gameplay.defaultSpeed', 1);

/** Controls — pan the map camera with WASD, in ADDITION to the arrow keys + mouse-drag (never instead
 *  of them). ON by default; persisted. Gates only the WASD branch of GameCanvas.handleKeyDown. */
export const wasdPan = createPersistedBool('fx.controls.wasdPan', true);

/** Audio — volume buses (0–100), read by AudioController.svelte and pushed to audioService. Master
 *  scales everything; music / sfx / ambient scale their channel on top. Persisted.
 *  - music   = the soundtrack
 *  - sfx     = discrete one-shots: creature calls, work, combat, UI clicks
 *  - ambient = looping environment beds: weather/nature (rain/wind/birds/…) + fire */
export const masterVolume = createPersistedNumber('fx.audio.master', 70);
export const musicVolume = createPersistedNumber('fx.audio.music', 70);
export const sfxVolume = createPersistedNumber('fx.audio.sfx', 80);
export const ambientVolume = createPersistedNumber('fx.audio.ambient', 70);
