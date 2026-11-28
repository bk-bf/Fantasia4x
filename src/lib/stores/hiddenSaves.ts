import { idbGet, idbPut, metaKey } from './saveDb';

const STORED_ENDPOINT = '/api/ledger/stored';

export interface HiddenMark {
  at: number;
  blob?: string;
  entry?: string;
}

export interface HiddenSave {
  id: string;
  meta: { hidden?: HiddenMark };
}

interface SettleDeps {
  stored: (blobs: string[]) => Promise<ReadonlySet<string>>;
  purge: (id: string) => Promise<void>;
  send: (id: string) => unknown;
}

export type ExportReply =
  | { id: string; blob: string; entry: string }
  | { id: string; error: string };

export function purgeable(saves: HiddenSave[], stored: ReadonlySet<string>): string[] {
  return saves
    .filter((s) => s.meta.hidden?.blob !== undefined && stored.has(s.meta.hidden.blob))
    .map((s) => s.id);
}

export async function settleHidden(saves: HiddenSave[], deps: SettleDeps): Promise<string[]> {
  const hidden = saves.filter((s) => s.meta.hidden);
  const blobs = hidden.flatMap((s) => (s.meta.hidden?.blob ? [s.meta.hidden.blob] : []));
  for (const s of hidden) if (!s.meta.hidden?.blob) deps.send(s.id);
  if (!blobs.length) return [];
  const gone = purgeable(hidden, await deps.stored(blobs));
  for (const id of gone) await deps.purge(id);
  return gone;
}

export async function askStored(blobs: string[]): Promise<ReadonlySet<string>> {
  const res = await fetch(STORED_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ blobs })
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return new Set(((await res.json()) as { stored: string[] }).stored);
}

async function markSent(id: string, blob: string, entry: string): Promise<void> {
  const meta = await idbGet<HiddenSave['meta']>(metaKey(id));
  if (!meta?.hidden) return;
  await idbPut(metaKey(id), { ...meta, hidden: { ...meta.hidden, blob, entry } });
}

function exportOnce(id: string): Promise<void> {
  return new Promise((done, fail) => {
    const worker = new Worker(new URL('./saveExport.worker.ts', import.meta.url), {
      type: 'module'
    });
    worker.onmessage = ({ data }: MessageEvent<ExportReply>) => {
      worker.terminate();
      if ('error' in data) fail(new Error(data.error));
      else markSent(id, data.blob, data.entry).then(done, fail);
    };
    worker.onerror = (event) => {
      worker.terminate();
      fail(new Error(event.message || 'export worker failed'));
    };
    worker.postMessage({ id });
  });
}

let sending: Promise<void> = Promise.resolve();

export function sendHidden(id: string): Promise<void> {
  sending = sending
    .then(() => exportOnce(id))
    .catch((err) => console.warn(`[SaveManager] hidden save ${id} not sent to the ledger:`, err));
  return sending;
}
