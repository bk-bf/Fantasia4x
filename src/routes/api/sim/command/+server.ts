/**
 * POST /api/sim/command — apply one registry command to the headless session.
 * Body: { type: string, payload?: unknown } — any key in sim/commands.ts COMMANDS (player verbs
 * and dev* godmode alike; an unknown type is a 400). Applies synchronously; the response returns
 * the post-command turn so a follow-up GET /state reads the result. (HEADLESS-SIM / ADR-033)
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { guardHeadless, currentSession } from '$lib/server/simSession';
import { COMMANDS } from '$lib/game/sim/commands';

export const POST: RequestHandler = async ({ request }) => {
  const denied = guardHeadless();
  if (denied) return denied;
  const cur = currentSession();
  if (!cur)
    return json({ error: 'no active session — POST /api/sim/session first' }, { status: 409 });
  let body: { type?: unknown; payload?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (typeof body.type !== 'string' || !(body.type in COMMANDS)) {
    return json(
      { error: `unknown command type '${body.type}'`, known: Object.keys(COMMANDS).sort() },
      { status: 400 }
    );
  }
  cur.session.command({ type: body.type, payload: body.payload });
  return json({ ok: true, turn: cur.session.getState().turn });
};
