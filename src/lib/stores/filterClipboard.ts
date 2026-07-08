// Session-only clipboard for item-filter allow-lists: copy the checked set from one filter panel,
// paste into another (the consumer intersects with its own available items). Not persisted.
import { writable, get } from 'svelte/store';

const store = writable<string[] | null>(null);

export const filterClipboard = {
  subscribe: store.subscribe,
  copy: (ids: string[]) => store.set([...ids]),
  peek: (): string[] | null => get(store)
};
