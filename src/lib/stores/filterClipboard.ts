/**
 * filterClipboard — a tiny, session-only clipboard for item-filter allow-lists. Lets the player copy
 * the checked-item set out of one filter panel (fuel / food / storage / stockpile) and paste it into
 * any other; on paste the consumer intersects with its own available items. Not persisted — it only
 * needs to survive between two clicks in the same session.
 */
import { writable, get } from 'svelte/store';

const store = writable<string[] | null>(null);

export const filterClipboard = {
  subscribe: store.subscribe,
  /** Stash a copy of the given allow-list ids. */
  copy: (ids: string[]) => store.set([...ids]),
  /** Read the last-copied ids without subscribing (null if nothing copied yet). */
  peek: (): string[] | null => get(store)
};
