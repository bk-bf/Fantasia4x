import { json } from '@sveltejs/kit';
import { LEDGER_META_HEADER } from '$lib/game/sim/ledgerCapture';
import { looksLikeSnapshot, queueSave, readCaptureMeta } from '$lib/server/ledgerSave';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  if (!import.meta.env.DEV) return new Response(null, { status: 404 });
  const meta = readCaptureMeta(request.headers.get(LEDGER_META_HEADER));
  if (!meta) return new Response('missing capture meta', { status: 400 });
  const text = await request.arrayBuffer();
  if (!looksLikeSnapshot(new Uint8Array(text)))
    return new Response('not a save snapshot', { status: 400 });
  const { entry } = queueSave(text, meta);
  return json({ captureId: meta.captureId, entry }, { status: 202 });
};
