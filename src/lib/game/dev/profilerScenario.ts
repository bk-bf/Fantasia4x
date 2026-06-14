/**
 * Profiler sandbox scenario (dev-only). Builds a deliberately heavy colony — hundreds of pawns,
 * mobs, buildings, dropped items, and designations on a full 240×160 map — so the per-tick cost of
 * every phase (pathfinding, mob AI, job generation, needs, regrowth) is exercised under real load.
 *
 * Launched via `./dev.sh --profiler` (or `./launch.sh --profiler`), which sets `VITE_PROFILER=true`;
 * `stores/gameState.ts` then loads this instead of the save, turns the turn profiler on, sets 4×
 * speed and unpauses. Also reused (with small counts) by the headless harness `profileSim.test.ts`.
 *
 * Pure: returns a GameState; the caller wires it into the store/engine.
 */
import type {
  GameState,
  Pawn,
  Mob,
  PlacedBuilding,
  DroppedItem,
  WorldTile,
  Item
} from '../core/types';
import { initialGameState } from '$lib/stores/gameState';
import { generateWorld } from '../world/WorldGenerator';
import { generatePawns } from '../entities/Pawns';
import { workService } from '../services/WorkService';
import { entityService } from '../services/EntityService';
import { buildingService } from '../services/BuildingService';
import itemsData from '../database/items.jsonc';

const ITEMS = itemsData as unknown as Item[];

export interface ProfilerScenarioOpts {
  seed?: number;
  pawns?: number;
  /** Target total live mobs (seeded ~80 at the entity caps, then cloned up to this). */
  mobs?: number;
  buildings?: number;
  designations?: number;
  droppedItems?: number;
}

/** Collect up to `limit` walkable tiles spiralling out from the map centre. */
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

export function buildProfilerScenario(opts: ProfilerScenarioOpts = {}): GameState {
  const seed = opts.seed ?? 0xf00d;
  const pawnCount = opts.pawns ?? 150;
  const mobTarget = opts.mobs ?? 140;
  const buildingCount = opts.buildings ?? 40;
  const designationCount = opts.designations ?? 300;
  const dropCount = opts.droppedItems ?? 150;

  const world = generateWorld(240, 160, seed); // includes resource generation

  // A big pool of walkable tiles to scatter everything across.
  const tiles = walkableTiles(world, pawnCount + mobTarget + buildingCount + dropCount + 50);
  let ti = 0;
  const nextTile = () => tiles[ti++ % tiles.length];

  // ── Pawns: many, with varied needs so they spread across work / eat / sleep / drink. ──
  const pawns: Pawn[] = generatePawns(initialGameState.race, pawnCount);
  pawns.forEach((p, i) => {
    p.position = { ...nextTile() };
    const r = i % 4;
    if (r === 0) p.needs = { ...p.needs, fatigue: 80 };
    else if (r === 1) p.needs = { ...p.needs, hunger: 85 };
    else if (r === 2) p.needs = { ...p.needs, thirst: 85 };
    // r === 3: rested + fed → takes work jobs
  });

  // ── Buildings: beds, campfires, craft spots, wells — give needs/jobs real targets. ──
  const buildingTypes = ['hay_bed', 'sleeping_spot', 'campfire', 'craft_spot', 'well'];
  const buildings: PlacedBuilding[] = [];
  for (let i = 0; i < buildingCount; i++) {
    const t = nextTile();
    const type = buildingTypes[i % buildingTypes.length];
    buildings.push({
      id: `prof-bld-${i}`,
      type,
      x: t.x,
      y: t.y,
      status: 'complete',
      progress: 1,
      ...(type === 'campfire' ? { lit: true, fuel: 50 } : {})
    });
    // Solid buildings (campfire, well…) block their tile — normal completion does this via
    // applyBuildingFootprint, but this scenario injects complete buildings directly, so flip
    // walkability here too. Otherwise pawns/mobs walk straight over campfires.
    if (buildingService.getBuildingById(type)?.walkable === false && world[t.y]?.[t.x]) {
      world[t.y][t.x] = { ...world[t.y][t.x], walkable: false };
    }
  }

  // ── Dropped items: loose materials scattered → haul jobs + overlay churn. ──
  const droppedItems: DroppedItem[] = [];
  for (let i = 0; i < dropCount; i++) {
    const t = nextTile();
    droppedItems.push({
      id: `prof-drop-${i}`,
      resourceId: i % 2 === 0 ? 'branch' : 'plant_fiber',
      x: t.x,
      y: t.y,
      quantity: 5
    });
  }

  // ── Designations: hundreds of harvest marks on resource tiles → a deep job pool. ──
  const designations: Record<string, string> = {};
  let added = 0;
  for (let y = 0; y < world.length && added < designationCount; y++) {
    for (let x = 0; x < (world[0]?.length ?? 0) && added < designationCount; x++) {
      if ((x + y) % 2 !== 0) continue; // sparse stride so they're spread out
      const tile = world[y]?.[x];
      if (tile?.walkable && Object.keys(tile.resources ?? {}).length > 0) {
        designations[`${x},${y}`] = 'harvest';
        added++;
      }
    }
  }

  // ── Stockpile: food + water + materials so eating/drinking/crafting actually proceed. ──
  const foodId =
    ITEMS.find((i) => i.category === 'food' || (i.nutrition ?? 0) > 0)?.id ?? 'cooked_meat';
  const stockpile: Record<string, number> = {
    [foodId]: 500,
    water: 500,
    branch: 500,
    plant_fiber: 500
  };

  let state: GameState = {
    ...initialGameState,
    seed,
    turn: 0,
    worldMap: world,
    pawns,
    buildings,
    droppedItems,
    designations: designations as GameState['designations'],
    stockpile
  };
  state = workService.ensureDefaultWorkAssignments(state);

  // Seed mobs at the entity caps, then clone up to the target count (caps are ~40+40; the sandbox
  // wants more bodies to stress the FSM + occupancy). Clones get fresh ids + scattered positions.
  state = entityService.seedInitialEntities(state, 24);
  const seeded = state.mobs ?? [];
  if (seeded.length > 0 && seeded.length < mobTarget) {
    const clones: Mob[] = [];
    let n = 0;
    while (seeded.length + clones.length < mobTarget) {
      const base = seeded[n % seeded.length];
      const t = nextTile();
      const clone: Mob = {
        ...structuredClone(base),
        id: `prof-mob-${n}`,
        x: t.x,
        y: t.y,
        state: base.entityClass === 'animal' ? 'Grazing' : 'Wander',
        stateSince: 0,
        path: [],
        pathIndex: 0
      };
      clones.push(clone);
      n++;
    }
    state = { ...state, mobs: [...seeded, ...clones] };
  }

  return state;
}
