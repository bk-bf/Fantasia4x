import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { guardHeadless, currentSession } from '$lib/server/simSession';

export const POST: RequestHandler = async () => {
  const denied = guardHeadless();
  if (denied) return denied;
  const cur = currentSession();
  if (!cur)
    return json({ error: 'no active session — POST /api/sim/session first' }, { status: 409 });
  return json(cur.session.snapshot());
};
