/**
 * Scenario — declarative spin-up of a ready-to-tick GameState (HEADLESS-SIM / ADR-033).
 *
 * Generalises `dev/profilerScenario.ts`: the SAME fresh-colony bootstrap `resetGame` runs (reseed →
 * world → culture/kingdom pools → colony pawns → spawn → social seeding → default work → entities),
 * then the scenario's deltas are applied THROUGH the command registry (`applySimCommand` with the
 * `dev*` verbs) — so setup walks the exact same sanctioned mutation path as play, and a scenario
 * build is deterministic: same spec ⇒ byte-identical state (every sim-path id is turn-derived +
 * seeded-rng suffixed, never wall-clock — the ADR-033 replay guarantee).
 *
 * Consumed by three fronts: the `/api/sim` HTTP driver, the in-game DebugMenu scenario loader, and
 * the invariant regression suite.
 */
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
import { entityService } from '../services/EntityService';
import { kingdomService } from '../services/KingdomService';
import { socialService } from '../services/SocialService';
import { researchService } from '../services/ResearchService';
import { itemService } from '../services/ItemService';
import { applySimCommand } from '../sim/commands';
import { SUBTERRAINS, SUBTERRAIN_FALLBACK, pickChar } from '../core/Terrains';
import { rng } from '../core/rng';

export interface ScenarioPawnGroup {
  count: number;
  /** Base-stat overrides applied to every pawn in the group (raises growth caps too). */
  stats?: Partial<EntityStats>;
  /** Explicit work-skill levels (work-category id → 1–50). */
  skills?: Record<string, number>;
  /** Blanket skill level for EVERY work category (applied before `skills` overrides). */
  skillLevel?: number;
  /** Need-meter overrides at spawn (construction-time; e.g. `{ hunger: 85 }`). */
  needs?: Partial<EntityNeeds>;
  /** Draft the group on spawn (war-party style). */
  drafted?: boolean;
  /** Item ids equipped onto each pawn in the group (mints instances — godmode equip). */
  equip?: string[];
}

export interface ScenarioSpec {
  /** Determinism anchor — pins world gen, pawn rolls, and the sim trajectory. */
  seed: number;
  map?: {
    w?: number;
    h?: number;
    /**
     * `flat` (**DEFAULT**) = uniform walkable grass, every tile reachable, no resources/entities — the
     * safe TEST map. `generated` = real world gen (biomes, water, mountains, ore, wildlife).
     *
     * ⚠ **Pick `generated` only when the test is ABOUT the world** (worldgen, biomes, pathfinding around
     * obstacles, wildlife, resource nodes). On a generated map, tiles can be **unreachable** from the
     * pawns — cut off by water/mountain — and an unreachable job is silently dropped by
     * `selectJobForPawn`'s reachability filter. A craft then stalls forever with NO error: the order
     * sits queued, its inputs sit reserved, and the pawns sit Idle. That exact trap cost a long debug
     * session (mis-diagnosed as "passive stations are broken"); `flat` makes it impossible.
     */
    preset?: 'flat' | 'generated';
  };
  /** Pawn groups (default: one plain group of 5 founders). */
  pawns?: ScenarioPawnGroup[];
  /** Research ids completed at start (runs the real completion path — tool tier, unlocks). */
  research?: string[];
  /** Complete every research entry with `tier <= researchMaxTier` (era presets). */
  researchMaxTier?: number;
  /** Complete buildings. Omit x/y to auto-place on walkable tiles spiralling from map centre. */
  buildings?: Array<{ id: string; x?: number; y?: number }>;
  /** Starting stock, dropped into the general stockpile (itemId → quantity). */
  items?: Record<string, number>;
  /** Mobs to force-spawn (`creatureId` optional → random). */
  spawnMobs?: Array<{ count: number; creatureId?: string }>;
  /** Needs frozen from the start (same keys as `devToggleNeed`). */
  needsDisabled?: DisableableNeed[];
  /** Research-granted tool-tier floor (`currentToolLevel`). */
  toolTier?: number;
  /** Hold every fuel station full/lit/hot and skip the smelt fuel gate, so a test can drive smelting
   *  without also exercising the haul-fuel-and-light loop. See `_devInfiniteFuel`. */
  infiniteFuel?: boolean;
  /** Seed the map's natural wildlife/lairs (default true; `false` = quiet map). */
  seedEntities?: boolean;
  /**
   * **Set this on any scenario that expects pawns to WORK.** Clears the two setup traps that both
   * present identically — pawns sit `Idle`, the order stays queued, and nothing reports why:
   *
   * 1. **No labor enabled.** Founders start with every labor at 0, so no work job is ever claimed.
   * 2. **No tool for the gate.** ADR-009 gates a job on `{workType, minTier}`; with no qualifying
   *    tool held OR in colony stock, the job is silently unclaimable. A tool in stock is enough —
   *    the pawn picks it up en route.
   *
   * Enables all labor at level 3 for every pawn and stocks one top-tier tool per work category
   * (derived from `WorkCategory.toolsRequired`, so a newly added category is covered automatically).
   *
   * Leave it OFF only when the test is ABOUT labor priorities or tool scarcity — the era presets do,
   * because their limited toolset is the point.
   */
  workReady?: boolean;
}

/** Announce the scenario's world choice. Deliberately LOUD: which map a headless run got is the single
 *  most common source of "the craft stalls and nothing says why" (see ScenarioSpec.map). */
function scenarioLog(msg: string): void {
  console.log(`[scenario] ${msg}`);
}

/** A uniform walkable grass field — every WorldTile field a real generateWorld tile carries. */
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

/** Walkable tiles spiralling out from the map centre (same shape as profilerScenario's helper). */
function walkableTiles(world: WorldTile[][], limit: number): Array<{ x: number; y: number }> {
  const h = world.length;
  const w = world[0]?.length ?? 0;
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const out: Array<{ x: number; y: number }> = [];
  for (let r = 0; r < Math.max(w, h) && out.length < limit; r++) {
    for (let dy = -r; dy <= r && out.length < limit; dy++) {
      for (let dx = -r; dx <= r && out.length < limit; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring perimeter only
        const x = cx + dx;
        const y = cy + dy;
        if (world[y]?.[x]?.walkable) out.push({ x, y });
      }
    }
  }
  return out;
}

/** Build a ready-to-tick GameState from a spec. Pure given the spec (deterministic per seed). */
export function buildScenario(spec: ScenarioSpec): GameState {
  const seed = spec.seed;
  // Reseed BEFORE any generation — pool/pawn/entity rolls all draw from the shared `rng`
  // (same rule as buildProfilerScenario / resetGame). Debug-ids restart at 1 for the same reason:
  // module counters must not leak one build's tail into the next (replay determinism).
  rng.reseed(seed);
  resetPawnDebugIds();
  resetMobIdCounter();

  const w = spec.map?.w ?? 96;
  const h = spec.map?.h ?? 96;
  // DEFAULT = flat. A flat map is uniformly walkable, so every tile is reachable and no job can be
  // silently dropped by the reachability filter. Real world gen is an explicit opt-in (see ScenarioSpec).
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

  // ── The resetGame fresh-colony bootstrap ─────────────────────────────────────────────
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
  // Wildlife/lairs only seed on a real generated world (a flat test field has no biomes to seed into).
  if (spec.seedEntities !== false && generated) {
    gs = entityService.seedInitialEntities(gs);
  }

  // ── Scenario deltas — applied through the command registry (the sanctioned path) ─────
  const cmd = (type: string, payload: unknown) => {
    gs = applySimCommand(gs, { type, payload });
  };

  // Colony stockpile: the fresh-colony state ships a `zone-general` with NO tiles, so hauled goods and
  // craft inputs have nowhere to live — crafting silently stalls (no reachable stockpile to fetch from).
  // Designate the ENTIRE map as stockpile so a headless scenario is never bottlenecked on storage /
  // reachability — every walkable tile can hold hauled goods and craft inputs, so "nowhere to fetch
  // from" can never be a hidden variable in a test. Deterministic (no rng) ⇒ replay stays byte-identical.
  cmd('designateRect', { x1: 0, y1: 0, x2: w - 1, y2: h - 1, type: 'stockpile' });

  // Research: era tier sweep first, then explicit ids.
  if (spec.researchMaxTier !== undefined) {
    for (const r of researchService.getAllResearch()) {
      if ((r.tier ?? 0) <= spec.researchMaxTier) cmd('devUnlockResearch', { researchId: r.id });
    }
  }
  for (const id of spec.research ?? []) cmd('devUnlockResearch', { researchId: id });
  if (spec.toolTier !== undefined) cmd('devSetToolTier', { tier: spec.toolTier });
  if (spec.infiniteFuel) cmd('devInfiniteFuel', { on: true });

  // Buildings: explicit tiles, else auto-place spiralling from centre (skipping pawn tiles).
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

  // Stock: straight into the general stockpile (deterministic `addItem`, ADR-016-sanctioned). PINNED to
  // the pawn cluster — the whole map is a stockpile, so the generic tile-scan fallback would otherwise
  // drop the starting stock on a map-edge tile that may be unreachable from the pawns, and every fetch
  // job for it would sit unclaimed forever (crafting silently stalls with no visible cause).
  const stockTile = gs.pawns.length
    ? `${Math.round(gs.pawns.reduce((a, p) => a + (p.position?.x ?? 0), 0) / gs.pawns.length)},` +
      `${Math.round(gs.pawns.reduce((a, p) => a + (p.position?.y ?? 0), 0) / gs.pawns.length)}`
    : undefined;
  for (const [itemId, amount] of Object.entries(spec.items ?? {})) {
    if (amount > 0) cmd('addItem', { itemId, amount, tileKey: stockTile });
  }

  // Mobs (on top of natural seeding, or alone on a quiet map).
  for (const m of spec.spawnMobs ?? []) {
    cmd('devSpawnEntities', { count: m.count, creatureId: m.creatureId });
  }

  // Per-need kill-switches.
  for (const need of spec.needsDisabled ?? []) cmd('devToggleNeed', { need, off: true });

  // Pawn-group deltas (stats/skills/equipment/draft/needs), group order = generation order.
  let idx = 0;
  for (const g of groups) {
    const members = gs.pawns.slice(idx, idx + g.count);
    idx += g.count;
    for (const p of members) {
      if (g.stats) cmd('devSetPawnStats', { pawnId: p.id, stats: g.stats });
      if (g.skillLevel !== undefined || g.skills) {
        const skills: Record<string, number> = {};
        if (g.skillLevel !== undefined) {
          for (const c of workService.getAllWorkCategories()) skills[c.id] = g.skillLevel;
        }
        Object.assign(skills, g.skills ?? {});
        cmd('devSetPawnSkills', { pawnId: p.id, skills });
      }
      for (const itemId of g.equip ?? []) cmd('equipPawnItem', { pawnId: p.id, itemId });
      if (g.drafted) cmd('toggleDraft', { pawnId: p.id });
    }
    if (g.needs) {
      // Construction-time meter override (same style as profilerScenario's varied-needs setup).
      gs = {
        ...gs,
        pawns: gs.pawns.map((p) =>
          members.some((m) => m.id === p.id) ? { ...p, needs: { ...p.needs, ...g.needs } } : p
        )
      };
    }
  }

  // ── Work-readiness (see ScenarioSpec.workReady) ───────────────────────────────────────
  const categories = workService.getAllWorkCategories() as Array<{
    id: string;
    toolsRequired?: string[];
  }>;
  if (spec.workReady) {
    for (const p of gs.pawns) {
      for (const c of categories) cmd('setPawnLaborLevel', { pawnId: p.id, workId: c.id, level: 3 });
    }
    // One qualifying tool per gated category — highest tier available, so any `minTier` is met.
    const stocked = new Set(Object.keys(spec.items ?? {}));
    for (const c of categories) {
      const best = (c.toolsRequired ?? [])
        .map((id) => ({ id, tier: (itemService.getItemById(id) as { tier?: number })?.tier ?? 1 }))
        .sort((a, b) => b.tier - a.tier)[0];
      if (best && !stocked.has(best.id)) cmd('addItem', { itemId: best.id, amount: 2, tileKey: stockTile });
    }
  }

  // Preflight: a scenario that CANNOT work is announced here rather than discovered as a silent stall.
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
