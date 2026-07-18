/**
 * /api/sim/session — create / inspect / dispose the headless session (HEADLESS-SIM / ADR-033).
 *
 *   POST   { preset?: string } | { spec: ScenarioSpec } | { snapshot: HeadlessSnapshot }
 *   GET    → { active, label, turn, presets[] }
 *   DELETE → dispose
 *
 * Dev-only + `--headless` opt-in (404 otherwise); nothing boots until the first POST.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  guardHeadless,
  createSession,
  currentSession,
  disposeSession,
  listPresets
} from '$lib/server/simSession';

export const POST: RequestHandler = async ({ request }) => {
  const denied = guardHeadless();
  if (denied) return denied;
  let body: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    return json({ error: 'invalid JSON body' }, { status: 400 });
  }
  try {
    const { session, label } = await createSession(body);
    const s = session.getState();
    return json({
      ok: true,
      label,
      turn: s.turn,
      pawns: s.pawns.length,
      mobs: (s.mobs ?? []).length,
      map: { w: s.worldMap[0]?.length ?? 0, h: s.worldMap.length }
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
};

export const GET: RequestHandler = async () => {
  const denied = guardHeadless();
  if (denied) return denied;
  const cur = currentSession();
  return json({
    active: cur !== null,
    label: cur?.label ?? null,
    turn: cur ? cur.session.getState().turn : null,
    presets: listPresets()
  });
};

export const DELETE: RequestHandler = async () => {
  const denied = guardHeadless();
  if (denied) return denied;
  return json({ ok: true, disposed: disposeSession() });
};
