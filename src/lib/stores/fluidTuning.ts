import { writable } from 'svelte/store';
import {
  FLUID_DEFS,
  FLUID_KEYS,
  cloneFluids,
  type FluidKey,
  type FluidSet
} from '$lib/webgl/painted/fluids';

const KEY = 'fx.debug.fluids';

type Tuned = Record<string, Partial<Record<FluidKey | 'tint', number | number[]>>>;

export function applyTuning(base: FluidSet, tuned: Tuned): FluidSet {
  const out = cloneFluids(base);
  for (const [id, values] of Object.entries(tuned)) {
    const def = out[id];
    if (!def) continue;
    for (const key of FLUID_KEYS) {
      const v = values[key];
      if (typeof v === 'number' && Number.isFinite(v) && def[key] !== undefined) def[key] = v;
    }
    const tint = values.tint;
    if (Array.isArray(tint) && tint.length === 3 && tint.every(Number.isFinite))
      def.tint = [tint[0], tint[1], tint[2]];
  }
  return out;
}

export function tuningOf(set: FluidSet): Tuned {
  return Object.fromEntries(
    Object.entries(set).map(([id, def]) => [
      id,
      {
        ...Object.fromEntries(
          FLUID_KEYS.filter((k) => def[k] !== undefined).map((k) => [k, def[k]])
        ),
        tint: def.tint
      }
    ])
  );
}

export function fluidFile(set: FluidSet): string {
  return (
    JSON.stringify(set, null, 2).replace(
      /\[\s+([^[\]{}]*?)\s+\]/g,
      (_, inner: string) => `[${inner.split(/,\s+/).join(', ')}]`
    ) + '\n'
  );
}

function load(): FluidSet {
  if (typeof localStorage === 'undefined') return cloneFluids(FLUID_DEFS);
  try {
    const raw = localStorage.getItem(KEY);
    return applyTuning(FLUID_DEFS, raw ? JSON.parse(raw) : {});
  } catch {
    return cloneFluids(FLUID_DEFS);
  }
}

function quietly(write: () => void): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    write();
    return true;
  } catch {
    return false;
  }
}

function save(set: FluidSet): FluidSet {
  quietly(() => localStorage.setItem(KEY, JSON.stringify(tuningOf(set))));
  return set;
}

function createFluidTuning() {
  const { subscribe, update, set } = writable<FluidSet>(load());
  return {
    subscribe,
    setValue(id: string, key: FluidKey, value: number) {
      update((all) => {
        const next = cloneFluids(all);
        if (next[id]) next[id][key] = value;
        return save(next);
      });
    },
    setTint(id: string, channel: number, value: number) {
      update((all) => {
        const next = cloneFluids(all);
        if (next[id]) next[id].tint[channel] = value;
        return save(next);
      });
    },
    reset() {
      quietly(() => localStorage.removeItem(KEY));
      set(cloneFluids(FLUID_DEFS));
    }
  };
}

export const fluidTuning = createFluidTuning();
