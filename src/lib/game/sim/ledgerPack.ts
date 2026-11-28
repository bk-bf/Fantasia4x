import {
  LEDGER_DROPPED,
  LEDGER_ENDPOINT,
  LEDGER_META_HEADER,
  saveBody,
  saveSize,
  type LedgerCaptureMeta,
  type LedgerReceipt,
  type LedgerUploadMeta
} from './ledgerCapture';

const SLICE_BYTES = 1 << 20;

export interface PackedSave {
  worldId: string;
  blob: string;
  bytes: number;
  gz: Uint8Array;
}

async function sha256(data: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data as Bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

type Bytes = Uint8Array<ArrayBuffer>;

function sliced(chunks: Bytes[]): ReadableStream<Bytes> {
  let part = 0;
  let at = 0;
  return new ReadableStream({
    pull(controller) {
      while (part < chunks.length && at >= chunks[part].length) {
        part++;
        at = 0;
      }
      if (part >= chunks.length) return controller.close();
      const slice = chunks[part].subarray(at, at + SLICE_BYTES);
      at += slice.length;
      controller.enqueue(slice);
    }
  });
}

export async function packSave(save: Uint8Array): Promise<PackedSave> {
  const worldId = await sha256(save);
  const zipped = sliced(saveBody(save) as Bytes[]).pipeThrough(new CompressionStream('gzip'));
  const gz = new Uint8Array(await new Response(zipped).arrayBuffer());
  return { worldId, blob: await sha256(gz), bytes: saveSize(save), gz };
}

export async function uploadSave(
  packed: PackedSave,
  meta: LedgerCaptureMeta,
  packMs: number
): Promise<LedgerReceipt> {
  const upload: LedgerUploadMeta = {
    ...meta,
    worldId: packed.worldId,
    blob: packed.blob,
    bytes: packed.bytes,
    packMs
  };
  const res = await fetch(LEDGER_ENDPOINT, {
    method: 'POST',
    body: packed.gz as Bytes,
    headers: {
      'content-type': 'application/gzip',
      [LEDGER_META_HEADER]: encodeURIComponent(JSON.stringify(upload))
    }
  });
  if (res.status === LEDGER_DROPPED) return { captureId: meta.captureId, entry: null };
  if (!res.ok) throw new Error(`status ${res.status}`);
  return (await res.json()) as LedgerReceipt;
}

export async function packAndUpload(
  save: Uint8Array,
  meta: LedgerCaptureMeta,
  now: () => number = () => performance.now()
): Promise<LedgerReceipt> {
  const started = now();
  const packed = await packSave(save);
  return uploadSave(packed, meta, Math.round(now() - started));
}
