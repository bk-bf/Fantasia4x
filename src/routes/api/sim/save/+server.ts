/**
 * POST /api/sim/save — dump the headless session as a JSON snapshot (tile scratch stripped).
 * Pipe to a file and later POST it to /api/sim/load to resume. (HEADLESS-SIM / ADR-033)
 */
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
