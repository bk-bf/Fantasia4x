/**
 * POST /api/sim/load — boot the headless session from a snapshot previously dumped by
 * /api/sim/save (replaces any live session). (HEADLESS-SIM / ADR-033)
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { guardHeadless, createSession } from '$lib/server/simSession';
import type { HeadlessSnapshot } from '$lib/game/headless/snapshot';

export const POST: RequestHandler = async ({ request }) => {
  const denied = guardHeadless();
  if (denied) return denied;
  let snapshot: HeadlessSnapshot;
  try {
    snapshot = await request.json();
  } catch {
    return json({ error: 'invalid JSON body' }, { status: 400 });
  }
  try {
    const { session } = await createSession({ snapshot });
    const s = session.getState();
    return json({ ok: true, turn: s.turn, pawns: s.pawns.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
};
