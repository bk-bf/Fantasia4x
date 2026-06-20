// uiPrefs.ts — small, localStorage-backed UI preferences. These are view-only settings (panel
// collapse state, etc.), deliberately separate from the IndexedDB game save in saveManager.ts.
import { writable } from 'svelte/store';

const COLLAPSED_RES_CATS_KEY = 'fx.resourcePanel.collapsedCategories';
const HIDE_EMPTY_RES_CATS_KEY = 'fx.resourcePanel.hideEmptyCategories';
const HIDE_SIDEBARS_KEY = 'fx.layout.hideSidebars';

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
 * "Cinematic" layout toggle: when on, the resource + chronicle sidebars go transparent and out of
 * flow (floating over the map), so the bottom nav and overlay panel reflow to fill the full viewport
 * width. Off by default; persisted across sessions. Driven from the top-bar settings menu.
 */
export const hideSidebars = createPersistedBool(HIDE_SIDEBARS_KEY, false);
