import { writable } from 'svelte/store';

export const EFFECT_KINDS = [
  { id: 'marks', label: 'Status marks' },
  { id: 'work', label: 'Work bars' },
  { id: 'health', label: 'Health bars' },
  { id: 'draft', label: 'Draft line' },
  { id: 'text', label: 'Floating text' },
  { id: 'icons', label: 'Floating icons' },
  { id: 'speech', label: 'Speech bubbles' },
  { id: 'projectiles', label: 'Projectiles' }
] as const;

export type EffectKind = (typeof EFFECT_KINDS)[number]['id'];
export type EffectToggles = Record<EffectKind, boolean>;

const KEY = 'fx.debug.effects';

const allSetTo = (on: boolean) =>
  Object.fromEntries(EFFECT_KINDS.map((k) => [k.id, on])) as EffectToggles;

function load(): EffectToggles {
  if (typeof localStorage === 'undefined') return allSetTo(true);
  try {
    return { ...allSetTo(true), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return allSetTo(true);
  }
}

function save(value: EffectToggles): EffectToggles {
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(value));
  return value;
}

function createEffectToggles() {
  const { subscribe, update } = writable<EffectToggles>(load());
  return {
    subscribe,
    toggle: (kind: EffectKind) => update((s) => save({ ...s, [kind]: !s[kind] })),
    setAll: (on: boolean) => update(() => save(allSetTo(on)))
  };
}

export const effectToggles = createEffectToggles();
