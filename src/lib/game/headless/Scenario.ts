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
    /** `generated` (default) = real world gen; `flat` = uniform walkable grass, no resources. */
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
  /** Seed the map's natural wildlife/lairs (default true; `false` = quiet map). */
  seedEntities?: boolean;
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
  const world = spec.map?.preset === 'flat' ? flatWorld(w, h) : generateWorld(w, h, seed);

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
  if (spec.seedEntities !== false && spec.map?.preset !== 'flat') {
    gs = entityService.seedInitialEntities(gs);
  }

  // ── Scenario deltas — applied through the command registry (the sanctioned path) ─────
  const cmd = (type: string, payload: unknown) => {
    gs = applySimCommand(gs, { type, payload });
  };

  // Colony stockpile: the fresh-colony state ships a `zone-general` with NO tiles, so hauled goods and
  // craft inputs have nowhere to live — crafting silently stalls (no reachable stockpile to fetch from).
  // Designate a compact stockpile around the pawn cluster so a headless scenario is haul/craft-ready out
  // of the box (a real colony always has one). Deterministic (no rng) ⇒ replay stays byte-identical.
  if (gs.pawns.length) {
    const clamp = (v: number, hi: number) => Math.max(0, Math.min(hi, v));
    const px = Math.round(gs.pawns.reduce((a, p) => a + (p.position?.x ?? 0), 0) / gs.pawns.length);
    const py = Math.round(gs.pawns.reduce((a, p) => a + (p.position?.y ?? 0), 0) / gs.pawns.length);
    cmd('designateRect', {
      x1: clamp(px - 3, w - 1),
      y1: clamp(py - 3, h - 1),
      x2: clamp(px + 3, w - 1),
      y2: clamp(py + 3, h - 1),
      type: 'stockpile'
    });
  }

  // Research: era tier sweep first, then explicit ids.
  if (spec.researchMaxTier !== undefined) {
    for (const r of researchService.getAllResearch()) {
      if ((r.tier ?? 0) <= spec.researchMaxTier) cmd('devUnlockResearch', { researchId: r.id });
    }
  }
  for (const id of spec.research ?? []) cmd('devUnlockResearch', { researchId: id });
  if (spec.toolTier !== undefined) cmd('devSetToolTier', { tier: spec.toolTier });

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

  // Stock: straight into the general stockpile (deterministic `addItem`, ADR-016-sanctioned).
  for (const [itemId, amount] of Object.entries(spec.items ?? {})) {
    if (amount > 0) cmd('addItem', { itemId, amount });
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

  return gs;
}
