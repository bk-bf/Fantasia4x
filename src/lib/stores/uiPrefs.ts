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
    } catch {}
  }
  return value;
}

function createCollapsedResourceCategories() {
  const { subscribe, set, update } = writable<string[]>(loadStringList(COLLAPSED_RES_CATS_KEY));
  const save = (v: string[]) => persistStringList(COLLAPSED_RES_CATS_KEY, v);
  return {
    subscribe,
    toggle: (cat: string) =>
      update((list) => save(list.includes(cat) ? list.filter((c) => c !== cat) : [...list, cat])),
    setAll: (cats: string[]) => set(save([...cats])),
    clear: () => set(save([]))
  };
}

export const collapsedResourceCategories = createCollapsedResourceCategories();

function loadBool(key: string, fallback: boolean): boolean {
  if (typeof localStorage === 'undefined') return fallback;
  const raw = localStorage.getItem(key);
  return raw === null ? fallback : raw === 'true';
}

function createPersistedBool(key: string, fallback: boolean) {
  const { subscribe, set, update } = writable<boolean>(loadBool(key, fallback));
  const save = (v: boolean) => {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(key, String(v));
      } catch {}
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

export const resourcesMinimized = createPersistedBool('fx.layout.resourcesMin', false);
export const chronicleMinimized = createPersistedBool('fx.layout.chronicleMin', false);

export const hideSidebars = createPersistedBool(HIDE_SIDEBARS_KEY, true);

export const debugMode = createPersistedBool(DEBUG_MODE_KEY, false);

if (typeof window !== 'undefined') {
  const shell = (window as unknown as { fantasia?: { setDebugMode?: (on: boolean) => void } })
    .fantasia;
  if (shell?.setDebugMode) debugMode.subscribe((on) => shell.setDebugMode!(on));
}

function loadNumber(key: string, fallback: number): number {
  if (typeof localStorage === 'undefined') return fallback;
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function createPersistedNumber(key: string, fallback: number) {
  const { subscribe, set } = writable<number>(loadNumber(key, fallback));
  const save = (v: number) => {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(key, String(v));
      } catch {}
    }
    return v;
  };
  return {
    subscribe,
    set: (v: number) => set(save(v))
  };
}

export const weatherEffects = createPersistedBool('fx.gfx.weather', true);

export const dayNightTint = createPersistedBool('fx.gfx.dayNightTint', true);

export const showDialogBubbles = createPersistedBool('fx.gfx.dialogBubbles', false);

export const showFps = createPersistedBool('fx.display.showFps', true);
export const showTps = createPersistedBool('fx.display.showTps', true);

export const autosaveEnabled = createPersistedBool('fx.gameplay.autosave', true);

export const defaultGameSpeed = createPersistedNumber('fx.gameplay.defaultSpeed', 1);

export const autoPauseOnThreat = createPersistedBool('fx.gameplay.autoPauseOnThreat', true);

export const autoPauseOnDeath = createPersistedBool('fx.gameplay.autoPauseOnDeath', true);

export const wasdPan = createPersistedBool('fx.controls.wasdPan', true);

export const masterVolume = createPersistedNumber('fx.audio.master', 70);
export const musicVolume = createPersistedNumber('fx.audio.music', 70);
export const sfxVolume = createPersistedNumber('fx.audio.sfx', 80);
export const ambientVolume = createPersistedNumber('fx.audio.ambient', 70);
