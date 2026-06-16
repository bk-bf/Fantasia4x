// uiPrefs.ts — small, localStorage-backed UI preferences. These are view-only settings (panel
// collapse state, etc.), deliberately separate from the IndexedDB game save in saveManager.ts.
import { writable } from 'svelte/store';

const COLLAPSED_RES_CATS_KEY = 'fx.resourcePanel.collapsedCategories';

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
