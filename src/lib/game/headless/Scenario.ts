import type {
  GameState,
  EntityStats,
  EntityNeeds,
  DisableableNeed,
  WorldTile
} from '../core/types';
import {
  initialGameState,
  ensureCulturePool,
  ensureKingdomPool,
  markColonyCulturesDiscovered,
  spawnPawnsOnMap
} from '$lib/stores/gameState';
import { generateWorld } from '../world/WorldGenerator';
import { generateColonyPawns, generateWorldKin, resetPawnDebugIds } from '../entities/Pawns';
import { resetMobIdCounter } from '../services/entity/entitySpawning';
import { workService } from '../services/WorkService';
import { SKILL_CATEGORIES } from '../core/rules/body/workExperience';
import { entityService } from '../services/EntityService';
import { kingdomService } from '../services/KingdomService';
import { socialService } from '../services/SocialService';
import { researchService } from '../services/ResearchService';
import { itemService } from '../services/ItemService';
import { applySimCommand } from '../sim/commands';
import { SUBTERRAINS, SUBTERRAIN_FALLBACK, pickChar } from '../core/defs/terrains';
import { rng } from '../core/util/rng';

export interface ScenarioPawnGroup {
  count: number;
  stats?: Partial<EntityStats>;
  skills?: Record<string, number>;
  skillLevel?: number;
  needs?: Partial<EntityNeeds>;
  drafted?: boolean;
  equip?: string[];
  traits?: string[];
}

export interface ScenarioSpec {
  seed: number;
  map?: {
    w?: number;
    h?: number;
    preset?: 'flat' | 'generated';
  };
  pawns?: ScenarioPawnGroup[];
  research?: string[];
  researchMaxTier?: number;
  buildings?: Array<{ id: string; x?: number; y?: number }>;
  items?: Record<string, number>;
  spawnMobs?: Array<{ count: number; creatureId?: string }>;
  needsDisabled?: DisableableNeed[];
  toolTier?: number;
  infiniteFuel?: boolean;
  seedEntities?: boolean;
  workReady?: boolean;
}

function scenarioLog(msg: string): void {
  console.log(`[scenario] ${msg}`);
}

function flatWorld(w: number, h: number): WorldTile[][] {
  const sub = SUBTERRAINS['grass'] ?? SUBTERRAIN_FALLBACK;
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => ({
      x,
      y,
      type: 'land' as WorldTile['type'],
      discovered: true,
      ascii: pickChar(sub, x, y),
      terrainType: 'plains',
      subType: 'grass',
      density: 0.5,
      moisture: 0,
      temperature: 0,
      movementCost: sub.movementCost,
      walkable: sub.walkable,
      blocksSight: sub.blocksSight ?? false,
      resources: {},
      territoryOwner: '',
      gCost: 0,
      hCost: 0,
      fCost: 0,
      parent: null
    }))
  );
}

function walkableTiles(world: WorldTile[][], limit: number): Array<{ x: number; y: number }> {
  const h = world.length;
  const w = world[0]?.length ?? 0;
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const out: Array<{ x: number; y: number }> = [];
  for (let r = 0; r < Math.max(w, h) && out.length < limit; r++) {
    for (let dy = -r; dy <= r && out.length < limit; dy++) {
      for (let dx = -r; dx <= r && out.length < limit; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (world[y]?.[x]?.walkable) out.push({ x, y });
      }
    }
  }
  return out;
}

export function buildScenario(spec: ScenarioSpec): GameState {
  const seed = spec.seed;
  rng.reseed(seed);
  resetPawnDebugIds();
  resetMobIdCounter();

  const w = spec.map?.w ?? 96;
  const h = spec.map?.h ?? 96;
  const generated = spec.map?.preset === 'generated';
  const world = generated ? generateWorld(w, h, seed) : flatWorld(w, h);
  scenarioLog(
    `map ${w}x${h} preset=${generated ? 'generated' : 'flat'}` +
      (generated
        ? ' ⚠ generated: tiles may be UNREACHABLE from the pawns — a job on an unreachable tile is' +
          ' silently dropped and the craft stalls with no error. Use the default flat map unless the' +
          ' test is ABOUT the world (biomes/pathfinding/wildlife/ore).'
        : ' (uniformly walkable — every tile reachable; whole map is a stockpile)')
  );

  let gs: GameState = {
    ...initialGameState,
    seed,
    turn: 0,
    worldMap: world,
    pawns: [],
    culturePool: [],
    cultureRelations: [],
    kingdoms: [],
    kingdomRelations: []
  };
  gs = ensureCulturePool(gs);
  gs = ensureKingdomPool(gs);

  const groups = spec.pawns ?? [{ count: 5 }];
  const total = groups.reduce((n, g) => n + g.count, 0);
  if (total > 0) {
    gs = {
      ...gs,
      pawns: generateColonyPawns(gs.culturePool, total, { kingdoms: gs.kingdoms, founders: true })
    };
    const worldKin = generateWorldKin(gs.pawns, gs.culturePool, gs.kingdoms ?? []);
    gs = { ...gs, pawns: spawnPawnsOnMap(gs.pawns, world), worldPawns: worldKin };
    gs = markColonyCulturesDiscovered(gs);
    gs = kingdomService.seedKingdomKnowledgeFromPawns(gs, gs.pawns, false);
    gs = socialService.meetColony(gs);
    gs = socialService.seedFamilyRelationships(gs);
  }
  gs = workService.ensureDefaultWorkAssignments(gs);
  if (spec.seedEntities !== false && generated) {
    gs = entityService.seedInitialEntities(gs);
  }

  const cmd = (type: string, payload: unknown) => {
    gs = applySimCommand(gs, { type, payload });
  };

  cmd('designateRect', { x1: 0, y1: 0, x2: w - 1, y2: h - 1, type: 'stockpile' });

  if (spec.researchMaxTier !== undefined) {
    for (const r of researchService.getAllResearch()) {
      if ((r.tier ?? 0) <= spec.researchMaxTier) cmd('devUnlockResearch', { researchId: r.id });
    }
  }
  for (const id of spec.research ?? []) cmd('devUnlockResearch', { researchId: id });
  if (spec.toolTier !== undefined) cmd('devSetToolTier', { tier: spec.toolTier });
  if (spec.infiniteFuel) cmd('devInfiniteFuel', { on: true });

  if (spec.buildings?.length) {
    const taken = new Set(gs.pawns.map((p) => `${p.position?.x},${p.position?.y}`));
    const auto = walkableTiles(world, spec.buildings.length * 3 + gs.pawns.length + 8).filter(
      (t) => !taken.has(`${t.x},${t.y}`)
    );
    let ai = 0;
    for (const b of spec.buildings) {
      const at = b.x !== undefined && b.y !== undefined ? { x: b.x, y: b.y } : auto[ai++];
      if (!at) continue;
      cmd('devSpawnBuildingAt', { buildingId: b.id, x: at.x, y: at.y });
    }
  }

  const stockTile = gs.pawns.length
    ? `${Math.round(gs.pawns.reduce((a, p) => a + (p.position?.x ?? 0), 0) / gs.pawns.length)},` +
      `${Math.round(gs.pawns.reduce((a, p) => a + (p.position?.y ?? 0), 0) / gs.pawns.length)}`
    : undefined;
  for (const [itemId, amount] of Object.entries(spec.items ?? {})) {
    if (amount > 0) cmd('addItem', { itemId, amount, tileKey: stockTile });
  }

  for (const m of spec.spawnMobs ?? []) {
    cmd('devSpawnEntities', { count: m.count, creatureId: m.creatureId });
  }

  for (const need of spec.needsDisabled ?? []) cmd('devToggleNeed', { need, off: true });

  let idx = 0;
  for (const g of groups) {
    const members = gs.pawns.slice(idx, idx + g.count);
    idx += g.count;
    for (const p of members) {
      if (g.stats) cmd('devSetPawnStats', { pawnId: p.id, stats: g.stats });
      if (g.traits) cmd('devSetPawnTraits', { pawnId: p.id, traitIds: g.traits });
      if (g.skillLevel !== undefined || g.skills) {
        const skills: Record<string, number> = {};
        if (g.skillLevel !== undefined) {
          for (const c of SKILL_CATEGORIES) skills[c] = g.skillLevel;
        }
        Object.assign(skills, g.skills ?? {});
        cmd('devSetPawnSkills', { pawnId: p.id, skills });
      }
      for (const itemId of g.equip ?? []) cmd('equipPawnItem', { pawnId: p.id, itemId });
      if (g.drafted) cmd('toggleDraft', { pawnId: p.id });
    }
    if (g.needs) {
      gs = {
        ...gs,
        pawns: gs.pawns.map((p) =>
          members.some((m) => m.id === p.id) ? { ...p, needs: { ...p.needs, ...g.needs } } : p
        )
      };
    }
  }

  const categories = workService.getAllWorkCategories() as Array<{
    id: string;
    toolsRequired?: string[];
  }>;
  if (spec.workReady) {
    for (const p of gs.pawns) {
      for (const c of categories) cmd('setPawnLaborLevel', { pawnId: p.id, workId: c.id, level: 3 });
    }
    const stocked = new Set(Object.keys(spec.items ?? {}));
    for (const c of categories) {
      const best = (c.toolsRequired ?? [])
        .map((id) => ({ id, tier: (itemService.getItemById(id) as { tier?: number })?.tier ?? 1 }))
        .sort((a, b) => b.tier - a.tier)[0];
      if (best && !stocked.has(best.id)) cmd('addItem', { itemId: best.id, amount: 2, tileKey: stockTile });
    }
  }

  const anyLabor = gs.pawns.some((p) =>
    Object.values(gs.workAssignments?.[p.id]?.laborSettings ?? {}).some((l) => (l ?? 0) > 0)
  );
  if (gs.pawns.length && !anyLabor) {
    scenarioLog(
      '⚠ NO pawn has any labor enabled — every work job will go unclaimed and pawns will sit Idle. ' +
        'Set `workReady: true` (or call setPawnLaborLevel yourself) if this scenario expects work.'
    );
  }
  if (gs.pawns.length && !spec.workReady) {
    const held = new Set(Object.keys(spec.items ?? {}));
    const uncovered = categories
      .filter((c) => (c.toolsRequired ?? []).length && !(c.toolsRequired ?? []).some((t) => held.has(t)))
      .map((c) => c.id);
    if (uncovered.length) {
      scenarioLog(
        `⚠ no tool in stock for tool-gated work: ${uncovered.join(', ')}. Jobs needing one are ` +
          'silently unclaimable (ADR-009). Stock a tool or set `workReady: true`.'
      );
    }
  }

  return gs;
}
