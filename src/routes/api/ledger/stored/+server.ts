import { json } from '@sveltejs/kit';
import { storedBlobs } from '../../../../../tools/ledger/spool.mjs';
import type { RequestHandler } from './$types';

const MAX_ASKED = 10_000;

export const POST: RequestHandler = async ({ request }) => {
  if (!import.meta.env.DEV) return new Response(null, { status: 404 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response('bad request', { status: 400 });
  }
  const blobs = (body as { blobs?: unknown }).blobs;
  if (!Array.isArray(blobs) || blobs.length > MAX_ASKED)
    return new Response('bad request', { status: 400 });
  return json({ stored: storedBlobs(blobs) });
};
