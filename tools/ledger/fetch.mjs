import { allEntries, entryExists, getEntry, readBlob } from './store.mjs';

const ENTRY_ID = /^\d{8}T\d{6}Z-/;

export function resolveSave(root, target) {
  const entries = allEntries(root);
  const saveOf = (worldId) => {
    const hits = entries.filter((e) => e.kind === 'save' && (e.world?.save ?? '').startsWith(worldId));
    const worlds = new Set(hits.map((e) => e.world.save));
    if (worlds.size > 1) throw new Error(`${worldId} names ${worlds.size} worlds; give more of the id`);
    if (!hits.length) throw new Error(`no save in the ledger holds world ${worldId}`);
    return hits[0];
  };
  if (ENTRY_ID.test(target)) {
    if (!entryExists(root, target)) throw new Error(`no entry ${target}`);
    const e = getEntry(root, target);
    if (e.kind === 'save') return e;
    if (!e.world?.save) throw new Error(`entry ${target} names no world`);
    return saveOf(e.world.save);
  }
  return saveOf(target);
}

export function assembleSave(root, saveEntry) {
  const file = saveEntry.files.find((f) => f.role === 'save');
  if (!file) throw new Error(`save entry ${saveEntry.id} has no save file`);
  return readBlob(root, file.sha256);
}
