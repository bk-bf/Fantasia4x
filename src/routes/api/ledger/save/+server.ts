import { json } from '@sveltejs/kit';
import { LEDGER_META_HEADER } from '$lib/game/sim/ledgerCapture';
import { looksLikeSnapshot, readCaptureMeta, spoolSave } from '$lib/server/ledgerSave';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  if (!import.meta.env.DEV) return new Response(null, { status: 404 });
  const meta = readCaptureMeta(request.headers.get(LEDGER_META_HEADER));
  if (!meta) return new Response('missing capture meta', { status: 400 });
  const text = Buffer.from(await request.arrayBuffer());
  if (!looksLikeSnapshot(text)) return new Response('not a save snapshot', { status: 400 });
  return json(await spoolSave(text, meta));
};
