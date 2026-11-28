import { packAndUpload } from './ledgerPack';
import type { PackRequest, PackReply } from './ledgerPackClient';

self.onmessage = async ({ data }: MessageEvent<PackRequest>) => {
  const save = new Uint8Array(data.buffer, data.offset, data.length);
  let reply: PackReply;
  try {
    reply = { id: data.id, receipt: await packAndUpload(save, data.meta) };
  } catch (err) {
    reply = { id: data.id, error: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(reply);
};
