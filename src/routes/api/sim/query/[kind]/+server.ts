/**
 * GET /api/sim/query/{pawns|jobs|recipes|research|buildings|map} — targeted read views backed by
 * the real service query getters (HEADLESS-SIM / ADR-033 §7).
 *
 *   pawns                       — full per-pawn detail (stats, skills, needs, equipment)
 *   jobs?pawn=<id>              — the job pool; with `pawn`, that pawn's claimable jobs
 *                                 (jobService.getAvailableJobs — the real claim/tool gate)
 *   recipes                     — craftable now (itemService.getCraftableItems) + the queue
 *   research                    — available now / current / completed (researchService)
 *   buildings                   — buildable now (buildingService.getAvailableBuildings) + placed
 *   map?x=&y=&r=8               — a tile window (slim tiles; whole map only via state?projection=full)
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { guardHeadless, currentSession } from '$lib/server/simSession';
import { jobService } from '$lib/game/services/JobService';
import { itemService } from '$lib/game/services/ItemService';
import { researchService } from '$lib/game/services/ResearchService';
import { buildingService } from '$lib/game/services/BuildingService';

export const GET: RequestHandler = async ({ params, url }) => {
  const denied = guardHeadless();
  if (denied) return denied;
  const cur = currentSession();
  if (!cur)
    return json({ error: 'no active session — POST /api/sim/session first' }, { status: 409 });
  const s = cur.session.getState();

  switch (params.kind) {
    case 'pawns':
      return json(
        s.pawns.map((p) => ({
          id: p.id,
          name: p.name,
          age: p.age,
          sex: p.sex,
          culture: p.cultureName,
          state: p.currentState ?? 'Idle',
          position: p.position,
          alive: p.isAlive !== false,
          drafted: p.drafted ?? false,
          stats: p.stats,
          skills: p.skills,
          needs: p.needs,
          mood: p.state.mood,
          traits: (p.traits ?? []).map((t) => t.name),
          conditions: (p.conditions ?? []).map((c) => c.id),
          equipment: Object.fromEntries(
            Object.entries(p.equipment ?? {})
              .filter(([, inst]) => inst)
              .map(([slot, inst]) => [slot, inst!.itemId])
          ),
          inventory: p.inventory?.items ?? {},
          pendingGrowth: (p.pendingGrowth ?? []).length
        }))
      );

    case 'jobs': {
      const pawnId = url.searchParams.get('pawn');
      if (pawnId) {
        const pawn = s.pawns.find((p) => p.id === pawnId);
        if (!pawn) return json({ error: `no pawn '${pawnId}'` }, { status: 404 });
        return json(jobService.getAvailableJobs(pawn, s));
      }
      return json(s.jobs ?? []);
    }

    case 'recipes':
      return json({
        craftable: itemService.getCraftableItems(s).map((i) => ({ id: i.id, name: i.name })),
        queue: s.craftingQueue
      });

    case 'research':
      return json({
        available: researchService
          .getAvailableResearch(s)
          .map((r) => ({ id: r.id, name: r.name, tier: r.tier })),
        current: s.currentResearch ?? null,
        completed: s.completedResearch,
        toolLevel: s.currentToolLevel
      });

    case 'buildings':
      return json({
        buildable: buildingService
          .getAvailableBuildings(s)
          .map((b) => ({ id: b.id, name: b.name })),
        placed: s.buildings ?? []
      });

    case 'map': {
      const w = s.worldMap[0]?.length ?? 0;
      const h = s.worldMap.length;
      const cx = Number(url.searchParams.get('x') ?? Math.floor(w / 2));
      const cy = Number(url.searchParams.get('y') ?? Math.floor(h / 2));
      const r = Math.max(1, Math.min(32, Number(url.searchParams.get('r') ?? 8)));
      const tiles = [];
      for (let y = Math.max(0, cy - r); y <= Math.min(h - 1, cy + r); y++) {
        for (let x = Math.max(0, cx - r); x <= Math.min(w - 1, cx + r); x++) {
          const t = s.worldMap[y][x];
          tiles.push({
            x,
            y,
            terrain: t.terrainType,
            sub: t.subType,
            walkable: t.walkable,
            resources: t.resources
          });
        }
      }
      return json({ w, h, center: { x: cx, y: cy }, r, tiles });
    }

    default:
      return json(
        { error: `unknown query '${params.kind}' (pawns|jobs|recipes|research|buildings|map)` },
        { status: 404 }
      );
  }
};
