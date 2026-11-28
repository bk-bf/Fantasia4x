import type { LedgerCaptureMeta, LedgerReceipt } from './ledgerCapture';
import { packAndUpload } from './ledgerPack';

export interface PackRequest {
  id: number;
  buffer: ArrayBuffer;
  offset: number;
  length: number;
  meta: LedgerCaptureMeta;
}

export type PackReply = { id: number; receipt: LedgerReceipt } | { id: number; error: string };

let packer: Worker | null = null;
let nextId = 0;
const waiting = new Map<number, { done: (r: LedgerReceipt) => void; fail: (e: Error) => void }>();

function startPacker(): Worker | null {
  if (packer || typeof Worker === 'undefined') return packer;
  try {
    packer = new Worker(new URL('./ledgerPack.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
  packer.onmessage = ({ data }: MessageEvent<PackReply>) => {
    const call = waiting.get(data.id);
    waiting.delete(data.id);
    if (!call) return;
    if ('error' in data) call.fail(new Error(data.error));
    else call.done(data.receipt);
  };
  packer.onerror = (event) => {
    event.preventDefault();
    for (const call of waiting.values())
      call.fail(new Error(event.message || 'pack worker failed'));
    waiting.clear();
    packer?.terminate();
    packer = null;
  };
  return packer;
}

export function postCapture(save: Uint8Array, meta: LedgerCaptureMeta): Promise<LedgerReceipt> {
  const worker = startPacker();
  if (!worker) return packAndUpload(save, meta);
  const id = nextId++;
  const buffer = save.buffer as ArrayBuffer;
  return new Promise((done, fail) => {
    waiting.set(id, { done, fail });
    const request: PackRequest = { id, buffer, offset: save.byteOffset, length: save.length, meta };
    worker.postMessage(request, [buffer]);
  });
}
