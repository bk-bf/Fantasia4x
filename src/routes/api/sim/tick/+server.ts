/**
 * POST /api/sim/tick?n=60 — advance the headless session n ticks (default 1, cap 100k).
 * Synchronous in-thread: the response carries the turn actually reached. (HEADLESS-SIM / ADR-033)
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { guardHeadless, currentSession } from '$lib/server/simSession';

export const POST: RequestHandler = async ({ url }) => {
  const denied = guardHeadless();
  if (denied) return denied;
  const cur = currentSession();
  if (!cur)
    return json({ error: 'no active session — POST /api/sim/session first' }, { status: 409 });
  const n = Math.max(1, Math.min(100_000, Number(url.searchParams.get('n') ?? 1) || 1));
  const t0 = performance.now();
  const { turn, ticked, result } = cur.session.tick(n);
  return json({
    ok: result.success,
    turn,
    ticked,
    wallMs: Math.round(performance.now() - t0),
    errors: result.errors
  });
};
