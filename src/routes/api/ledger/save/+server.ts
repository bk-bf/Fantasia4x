import { json } from '@sveltejs/kit';
import { LEDGER_DROPPED, LEDGER_META_HEADER } from '$lib/game/sim/ledgerCapture';
import {
  SPOOL_BUSY,
  logCaptureFailure,
  looksLikeGzip,
  queueSave,
  readCaptureMeta,
  spoolFull
} from '$lib/server/ledgerSave';
import type { RequestHandler } from './$types';

const dropped = (captureId: string) =>
  json({ captureId, entry: null, error: SPOOL_BUSY }, { status: LEDGER_DROPPED });

export const POST: RequestHandler = async ({ request }) => {
  if (!import.meta.env.DEV) return new Response(null, { status: 404 });
  const meta = readCaptureMeta(request.headers.get(LEDGER_META_HEADER));
  if (!meta) return new Response('missing capture meta', { status: 400 });
  if (spoolFull()) {
    logCaptureFailure(meta, SPOOL_BUSY);
    return dropped(meta.captureId);
  }
  const gz = new Uint8Array(await request.arrayBuffer());
  if (!looksLikeGzip(gz)) return new Response('not a gzipped save', { status: 400 });
  const queued = queueSave(gz, meta);
  if (!queued) return dropped(meta.captureId);
  return json({ captureId: meta.captureId, entry: queued.entry }, { status: 202 });
};
