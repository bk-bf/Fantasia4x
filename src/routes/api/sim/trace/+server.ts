/**
 * FSM trace control (HEADLESS-SIM / ADR-033).
 *   POST /api/sim/trace  { creature?, id?, capacity? }  → start tracing (verbose + entity pin)
 *   POST /api/sim/trace  { off: true }                  → stop
 *   GET  /api/sim/trace?category=ai&limit=200           → drain buffered trace lines
 *   GET  /api/sim/trace?timing=1                        → drain per-function timing table
 * Dev-only + --headless (404 otherwise).
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { guardHeadless, currentSession } from '$lib/server/simSession';

export const POST: RequestHandler = async ({ request }) => {
  const denied = guardHeadless();
  if (denied) return denied;
  const cur = currentSession();
  if (!cur) return json({ error: 'no active session — POST /api/sim/session first' }, { status: 409 });
  let body: { creature?: string; id?: string; capacity?: number; off?: boolean } = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    return json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (body.off) {
    cur.session.disableTrace();
    return json({ ok: true, tracing: false });
  }
  cur.session.enableTrace({ creature: body.creature, id: body.id, capacity: body.capacity });
  return json({ ok: true, tracing: true, creature: body.creature ?? null, id: body.id ?? null });
};

export const GET: RequestHandler = async ({ url }) => {
  const denied = guardHeadless();
  if (denied) return denied;
  const cur = currentSession();
  if (!cur) return json({ error: 'no active session — POST /api/sim/session first' }, { status: 409 });
  if (url.searchParams.get('timing')) return json({ timing: cur.session.drainTiming() });
  const category = url.searchParams.get('category') ?? undefined;
  const limit = Number(url.searchParams.get('limit')) || undefined;
  return json({ lines: cur.session.drainLogs({ category, limit }) });
};
