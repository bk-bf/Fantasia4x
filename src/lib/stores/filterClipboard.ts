import { writable, get } from 'svelte/store';

const store = writable<string[] | null>(null);

export const filterClipboard = {
  subscribe: store.subscribe,
  copy: (ids: string[]) => store.set([...ids]),
  peek: (): string[] | null => get(store)
};
