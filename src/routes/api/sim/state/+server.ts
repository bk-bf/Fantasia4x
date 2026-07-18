/**
 * GET /api/sim/state?projection=summary|dynamic|full — read the headless session's state.
 *   summary (default) — the human/agent-readable colony overview (small, greppable)
 *   dynamic           — the full GameState minus its worldMap (~everything that changes)
 *   full              — everything, worldMap included (MBs — ask for it deliberately)
 * (HEADLESS-SIM / ADR-033)
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { guardHeadless, currentSession } from '$lib/server/simSession';

export const GET: RequestHandler = async ({ url }) => {
  const denied = guardHeadless();
  if (denied) return denied;
  const cur = currentSession();
  if (!cur)
    return json({ error: 'no active session — POST /api/sim/session first' }, { status: 409 });
  const s = cur.session.getState();
  const projection = url.searchParams.get('projection') ?? 'summary';

  if (projection === 'full') return json(s);
  if (projection === 'dynamic') {
    const { worldMap: _worldMap, ...dynamic } = s;
    return json(dynamic);
  }

  return json({
    label: cur.label,
    turn: s.turn,
    season: s.season,
    weather: s.weather?.type,
    pawns: s.pawns.map((p) => ({
      id: p.id,
      name: p.name,
      state: p.currentState ?? 'Idle',
      position: p.position,
      alive: p.isAlive !== false,
      drafted: p.drafted ?? false,
      mood: p.state.mood,
      needs: {
        hunger: Math.round(p.needs.hunger),
        fatigue: Math.round(p.needs.fatigue),
        thirst: Math.round(p.needs.thirst ?? 0)
      },
      job: p.activeJob ? { type: p.activeJob.type, jobId: p.activeJob.jobId } : null
    })),
    mobs: (s.mobs ?? []).map((m) => ({
      id: m.id,
      creatureId: m.creatureId,
      state: m.state,
      x: m.x,
      y: m.y,
      health: m.health
    })),
    stockpile: s.stockpile,
    droppedItemStacks: (s.droppedItems ?? []).length,
    buildings: (s.buildings ?? []).map((b) => ({ type: b.type, x: b.x, y: b.y, status: b.status })),
    jobsOpen: (s.jobs ?? []).filter((j) => !j.claimedBy).length,
    jobsClaimed: (s.jobs ?? []).filter((j) => !!j.claimedBy).length,
    research: {
      current: s.currentResearch
        ? { id: s.currentResearch.id, progress: s.currentResearch.currentProgress }
        : null,
      completed: s.completedResearch.length,
      toolLevel: s.currentToolLevel
    },
    needsDisabled: s._needsDisabled ?? {}
  });
};
