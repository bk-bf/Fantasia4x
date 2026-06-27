import { browser } from '$app/environment';
import { writable, derived, get } from 'svelte/store';
import {
  GameStateManager,
  consumeFromStockpiles,
  addToStockpileZone,
  GENERAL_ZONE_ID,
  computeAggregate,
  aggregateFromDrops,
  absorbDropIfOnStockpileTile
} from '$lib/game/core/GameState';
import { gameEngine } from '$lib/game/systems/GameEngineImpl';
// P-3: side-effect import — registers the real log/feedback sink before any tick runs.
import './simLogBridge';
// ADR-021: the sim runs in the worker (W4 complete). USE_SIM_WORKER = isClientRuntime — true in any
// browser, false only under SSR/tests (the `?simworker` opt-in flag is retired). The in-thread loop
// below is now the SSR/test-only fallback.
import { simWorkerBridge, USE_SIM_WORKER } from '$lib/game/sim/simWorkerClient';
// ADR-021 W3: serializable command registry (shared with the future sim worker).
import { applySimCommand } from '$lib/game/sim/commands';
import type { SimCommand } from '$lib/game/sim/simProtocol';
import type { GameState, Pawn, WorldTile, FilterableZoneType } from '$lib/game/core/types';
import { generateColonyPawns } from '$lib/game/entities/Pawns';
import { pawnService } from '$lib/game/services/PawnService';
import { generateRace, generateRacePool, generateRaceRelations } from '$lib/game/core/Race';
import { itemService } from '$lib/game/services/ItemService';
import { buildingService } from '$lib/game/services/BuildingService';
import { workService } from '$lib/game/services/WorkService';
import { calculatePawnStats } from '$lib/game/entities/Pawns';
import { generateWorld } from '$lib/game/world/WorldGenerator';
import {
  customizeMenuPreviewWorld,
  placeMenuPreviewMagicalGroves,
  placeMenuPreviewScatteredGroves,
  menuPreviewMagicalGroveIds,
  pickMenuPreviewClimate
} from '$lib/game/world/menuPreviewWorld';
import { resourceGeneratorService } from '$lib/game/services/ResourceGeneratorService';
import { entityService } from '$lib/game/services/EntityService';
import {
  loadSave,
  scheduleSave,
  deleteSave,
  saveGameNow,
  saveSnapshotNow,
  overwriteSnapshotNow,
  setActiveSave,
  mintActiveSave,
  ensureActiveSave,
  setActiveCommitted
} from './saveManager';
import { defaultGameSpeed, autoPauseOnThreat } from './uiPrefs';
import { clearActivityLog, reloadActivityLogForActiveSave, activityLog } from './Log';
import { applyDevWorld } from '$lib/game/dev/devWorld';
import { TICKS_PER_SECOND, ticksFromSeconds } from '$lib/game/core/time';
import { clearTileDeltas } from '$lib/game/core/tileDeltas';
import { rng, freshSeed } from '$lib/game/core/rng';
import { resetUnreachableJobs } from '$lib/game/systems/PawnStateMachine';
import { isSpawnableTile } from '$lib/game/core/Terrains';

// ===== CONFIGURATION =====
/** Real-time duration of one simulation tick at 1× speed (ms). */
const TICK_DURATION_MS = 1000 / TICKS_PER_SECOND;
/**
 * Upper bound on how many sim steps a single animation frame may run. This is the decouple
 * knob (ENGINE-PERFORMANCE): the sim runs on the render thread, so N ticks × per-tick cost is
 * added to every frame. At 16, a slow frame ran 16 heavy ticks (~330ms) which kept the frame
 * slow and starved render to ~2fps — and it bound identically at 1× and 4×. Capping it lower
 * trades sim catch-up speed (at high game-speed the sim runs slower than realtime, dropping
 * backlog) for render smoothness. 4 ticks supports 1× realtime (60 TPS) at 15 FPS.
 */
const MAX_STEPS_PER_FRAME = 4;

// ===== STATE VARIABLES =====
let gameSpeedValue = 1;
/** Whether the simulation should advance (set by start/stopAutoTurns). */
let simRunning = false;
/** Accumulated real time (× speed) not yet consumed by whole sim steps. */
let simAccumulatorMs = 0;

// ===== WORLD GENERATION =====
// D7: world generation is DEFERRED to the async init below rather than run at module
// import. Generating a 240×160 world here only to overwrite it when a save loads is pure
// waste; the fresh-start path regenerates from the empty worldMap in the migration block.

// ===== INITIAL STATE =====
export const initialGameState: GameState = {
  seed: freshSeed(), // P0-2: deterministic sim seed; reseeded from the save on load
  turn: ticksFromSeconds(100), // 08:00 — turn counts ticks; 100 in-game s × TICKS_PER_SECOND (TURNS_PER_DAY=300 s)
  // race == racePool[0] (home race); both are filled by bootstrapColony on a fresh run. The
  // single placeholder here is discarded once the pool is generated against the run's seed.
  race: generateRace(),
  racePool: [],
  raceRelations: [],
  pawns: [],
  worldMap: [], // generated lazily in the async init (D7)
  /** Living-world (SEASONS_WEATHER): start in spring, clear skies. */
  season: 'spring',
  seasonDay: 0,
  weather: { type: 'clear', intensity: 0, turnsRemaining: 0, wind: 0.3 },
  buildingCounts: {},
  /** Phase 4: placed buildings on the map */
  buildings: [],
  /** Phase 4: colony stockpile from harvesting */
  stockpile: {},
  /** Stockpile zones — each zone owns specific tiles and tracks its own inventory. */
  stockpileZones: [
    {
      id: 'zone-general',
      name: 'Colony Stockpile',
      tiles: [],
      filter: { allowedCategories: [], blockedItems: [] },
      inventory: {}
    }
  ],
  /** Phase 4: designated tile actions */
  designations: {},
  /** Phase 5a: active job pool */
  jobs: [],
  maxPopulation: 1,
  availableResearch: [],
  completedResearch: [],
  currentResearch: undefined,
  discoveredLore: [],
  _woodBonus: 0,
  _stoneBonus: 0,
  equippedItems: {
    weapon: null,
    head: null,
    chest: null,
    legs: null,
    feet: null,
    hands: null
  },
  craftingQueue: [],
  currentToolLevel: 0,
  workAssignments: {},
  pawnStats: {},
  droppedItems: [],
  deadPawns: [],
  mobs: [],
  tamedAnimals: []
};

// ===== UTILITY FUNCTIONS =====

/** Apply all legacy field migrations to a loaded save. */
function applyMigrations(state: GameState): GameState {
  // P0-2: old saves predate the deterministic seed — assign one so future ticks replay.
  if (typeof state.seed !== 'number') state.seed = freshSeed();
  // SEASONS_WEATHER: backfill living-world fields for pre-season saves.
  if (!state.season) state.season = 'spring';
  if (typeof state.seasonDay !== 'number') state.seasonDay = 0;
  if (!state.weather) state.weather = { type: 'clear', intensity: 0, turnsRemaining: 0 };
  // Phase 4 migration: backfill new fields for old saves
  if (!state.buildings) {
    state.buildings = Object.entries(state.buildingCounts ?? {}).flatMap(([type, count]) =>
      Array.from({ length: count }, (_, i) => ({
        id: `${type}-legacy-${i}`,
        type,
        x: 0,
        y: 0,
        status: 'complete' as const,
        progress: 1
      }))
    );
  }
  if (!state.stockpile) state.stockpile = {};
  // Migrate to multi-zone stockpile system
  if (!state.stockpileZones || state.stockpileZones.length === 0) {
    const existingTiles = Object.entries(state.designations ?? {})
      .filter(([, t]) => t === 'stockpile')
      .map(([key]) => key);
    state.stockpileZones = [
      {
        id: 'zone-general',
        name: 'Colony Stockpile',
        tiles: existingTiles,
        filter: { allowedCategories: [], blockedItems: [] },
        inventory: { ...(state.stockpile ?? {}) }
      }
    ];
  }
  if (!state.designations) state.designations = {};
  if (!state.jobs) state.jobs = [];
  if (!state.mobs) state.mobs = [];
  if (!state.tamedAnimals) state.tamedAnimals = [];
  // Phase 5c: migrate ancient `buildingQueue` entries (field since removed — R6) into
  // `under_construction` PlacedBuildings so old saves don't lose pending construction.
  const legacyBuildingQueue = (state as { buildingQueue?: any[] }).buildingQueue;
  if (legacyBuildingQueue && legacyBuildingQueue.length > 0) {
    const migratedBuildings = legacyBuildingQueue.map((entry: any, i: number) => {
      const buildTime = entry.building?.buildTime ?? 10;
      const workRequired = buildTime * 10;
      const workDone = Math.round(
        (1 - Math.max(0, entry.turnsRemaining) / buildTime) * workRequired
      );
      return {
        id: `${entry.building.id}-migrated-${i}-${Date.now()}`,
        type: entry.building.id,
        x: 0,
        y: 0,
        status: 'under_construction' as const,
        progress: workDone / workRequired,
        workRequired,
        workDone,
        materialsDelivered: true
      };
    });
    state.buildings = [...(state.buildings ?? []), ...migratedBuildings];
    delete (state as { buildingQueue?: unknown }).buildingQueue;
  }
  // Migrate legacy zoneFilters to zoneInstances
  if ((!state.zoneInstances || state.zoneInstances.length === 0) && state.zoneFilters) {
    const instances: import('$lib/game/core/types').ZoneInstance[] = [];
    const zoneIdMap: Record<string, string> = { ...(state.designationZoneId ?? {}) };
    for (const [typeKey, filter] of Object.entries(state.zoneFilters)) {
      const type = typeKey as FilterableZoneType;
      if (!filter) continue;
      const tilesOfType = Object.entries(state.designations ?? {}).filter(([, t]) => t === type);
      if (tilesOfType.length > 0 || filter.allowedCategories.length > 0) {
        const id = `${type}-migrated`;
        const label = `${type.charAt(0).toUpperCase()}${type.slice(1)} 1`;
        instances.push({ id, type, label, filter });
        for (const [key] of tilesOfType) {
          zoneIdMap[key] = id;
        }
      }
    }
    if (instances.length > 0) {
      state = { ...state, zoneInstances: instances, designationZoneId: zoneIdMap };
    }
  }
  // SURVIVAL-HEALTH migration: backfill new pawn health fields for old saves
  if (!state.deadPawns) state.deadPawns = [];
  state.pawns = state.pawns.map((p) => {
    const needsInit = p.isAlive === undefined || !p.limbs || p.bloodVolume === undefined;
    if (!needsInit) return p;
    return {
      ...p,
      isAlive: p.isAlive ?? true,
      bloodVolume: p.bloodVolume ?? 100,
      conditions: p.conditions ?? [],
      limbs: p.limbs ?? [
        { id: 'head', health: 100, isMissing: false, bleedRate: 0 },
        { id: 'torso', health: 100, isMissing: false, bleedRate: 0 },
        { id: 'left_arm', health: 100, isMissing: false, bleedRate: 0 },
        { id: 'right_arm', health: 100, isMissing: false, bleedRate: 0 },
        { id: 'left_leg', health: 100, isMissing: false, bleedRate: 0 },
        { id: 'right_leg', health: 100, isMissing: false, bleedRate: 0 }
      ]
    };
  });
  // Stage 2: per-tile `stored` DroppedItems are the source of truth; the aggregate is summed
  // from them. Migrate any items that exist only in a legacy aggregate / zone.inventory into
  // stored drops, then clear vestigial zone inventories (zones are now pure drop-off zones).
  {
    const dropAgg = aggregateFromDrops(state.droppedItems);
    const zoneAgg = computeAggregate(state.stockpileZones ?? []);
    const oldAgg = state.stockpile ?? {};
    const target: Record<string, number> = { ...zoneAgg };
    for (const [id, q] of Object.entries(oldAgg)) target[id] = Math.max(target[id] ?? 0, q);

    const missing: Record<string, number> = {};
    for (const [id, q] of Object.entries(target)) {
      const have = dropAgg[id] ?? 0;
      if (q > have) missing[id] = q - have;
    }
    if (Object.keys(missing).length > 0) {
      state = addToStockpileZone(state, null, missing);
    }
    state = {
      ...state,
      stockpileZones: (state.stockpileZones ?? []).map((z) => ({ ...z, inventory: {} })),
      stockpile: aggregateFromDrops(state.droppedItems)
    };
  }

  // Stockpile-zone split migration: standing zones moved out of the single-value `designations`
  // map into `zoneTiles` so an action order (harvest/woodcut) can share a tile with a stockpile
  // without clobbering it. Move any legacy `stockpile` designations across. Idempotent. Runs
  // before the absorb backfill below so that reads `zoneTiles` (the new source of truth).
  if (!state.zoneTiles) state.zoneTiles = {};
  {
    const designations = { ...(state.designations ?? {}) };
    const zoneTiles = { ...(state.zoneTiles ?? {}) };
    let moved = false;
    for (const [k, type] of Object.entries(designations)) {
      if (type !== 'stockpile') continue;
      const cur = zoneTiles[k] ?? [];
      if (!cur.includes('stockpile')) zoneTiles[k] = [...cur, 'stockpile'];
      delete designations[k];
      moved = true;
    }
    if (moved) state = { ...state, designations, zoneTiles };
  }

  // One-time migration: absorb any unstored dropped items that are physically sitting on
  // stockpile tiles but were never credited (saves predating the trigger-based absorption).
  {
    const unabsorbed = (state.droppedItems ?? []).filter((d) => {
      if (d.stored) return false;
      return !!state.zoneTiles?.[`${d.x},${d.y}`]?.includes('stockpile');
    });
    for (const drop of unabsorbed) {
      state = absorbDropIfOnStockpileTile(state, drop.id);
    }
  }

  return state;
}

// ===== RACE POOL HELPERS (Race overhaul) =====

/** Ensure the state has a prerolled race pool + relations. Idempotent.
 *  - Fresh run (no pool, no pawns): generate a full pool, relations, and a home race.
 *  - Legacy save (no pool, but pawns exist): synthesize a single-entry pool from the
 *    existing `race`, normalising it to the new shape, and tag pawns to it. */
function ensureRacePool(state: GameState): GameState {
  if (state.racePool && state.racePool.length > 0) {
    // Backfill relations if a pool exists but relations were never generated.
    if (!state.raceRelations || state.raceRelations.length === 0) {
      return { ...state, raceRelations: generateRaceRelations(state.racePool) };
    }
    return state;
  }

  const legacyAndPopulated = state.pawns && state.pawns.length > 0;
  if (legacyAndPopulated) {
    const home = normalizeLegacyRace(state.race);
    const pawns = state.pawns.map((p) => ({
      ...p,
      raceId: p.raceId ?? home.id,
      raceName: p.raceName ?? home.name
    }));
    return { ...state, race: home, racePool: [home], raceRelations: [], pawns };
  }

  const racePool = generateRacePool();
  return {
    ...state,
    race: racePool[0],
    racePool,
    raceRelations: generateRaceRelations(racePool)
  };
}

/** Bring a pre-overhaul race up to the new shape (archetype/lore/unique id) so old saves
 *  still render in the pokédex without a procedural lore paragraph. */
function normalizeLegacyRace(race: GameState['race']): GameState['race'] {
  if (race?.lore?.description && race.archetype) return { ...race, discovered: true };
  const fresh = generateRace();
  return {
    ...fresh,
    // keep the player's existing identity + ranges; only fill the missing new fields.
    id: race?.id && race.id !== 'player' ? race.id : fresh.id,
    name: race?.name ?? fresh.name,
    statRanges: race?.statRanges ?? fresh.statRanges,
    physicalTraits: race?.physicalTraits ?? fresh.physicalTraits,
    racialTraits: race?.racialTraits ?? fresh.racialTraits,
    population: race?.population ?? 0,
    discovered: true
  };
}

/** Mark every race that has a colony pawn as discovered, and refresh per-race headcounts. */
function markColonyRacesDiscovered(state: GameState): GameState {
  const counts = new Map<string, number>();
  for (const p of state.pawns) {
    if (p.raceId) counts.set(p.raceId, (counts.get(p.raceId) ?? 0) + 1);
  }
  const racePool = state.racePool.map((r) => ({
    ...r,
    discovered: r.discovered || counts.has(r.id),
    population: counts.get(r.id) ?? r.population
  }));
  return { ...state, racePool, race: racePool.find((r) => r.id === state.race?.id) ?? racePool[0] };
}

/** Pokédex hook: flag a race as encountered. Called by future faction/visitor encounters —
 *  no such entity source exists yet, so this is currently exercised only by colony bootstrap. */
export function discoverRace(state: GameState, raceId: string): GameState {
  if (!state.racePool.some((r) => r.id === raceId && !r.discovered)) return state;
  return {
    ...state,
    racePool: state.racePool.map((r) => (r.id === raceId ? { ...r, discovered: true } : r))
  };
}

// ===== PAWN SPAWN HELPERS =====
function findNearestWalkable(
  worldMap: WorldTile[][],
  cx: number,
  cy: number,
  occupied: Set<string>
): { x: number; y: number } | null {
  const mapH = worldMap.length;
  const mapW = worldMap[0]?.length ?? 0;
  const maxR = Math.max(mapW, mapH);
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // border only
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= mapW || y >= mapH) continue;
        const tile = worldMap[y]?.[x];
        if (!isSpawnableTile(tile)) continue;
        const key = `${x},${y}`;
        if (occupied.has(key)) continue;
        return { x, y };
      }
    }
  }
  return null;
}

function spawnPawnsOnMap(pawns: Pawn[], worldMap: WorldTile[][]): Pawn[] {
  const mapW = worldMap[0]?.length ?? 120;
  const mapH = worldMap.length;
  const cx = Math.floor(mapW / 2);
  const cy = Math.floor(mapH / 2);
  const occupied = new Set<string>();
  return pawns.map((p) => {
    if (p.position) {
      occupied.add(`${p.position.x},${p.position.y}`);
      return p;
    }
    const pos = findNearestWalkable(worldMap, cx, cy, occupied) ?? { x: cx, y: cy };
    occupied.add(`${pos.x},${pos.y}`);
    return {
      ...p,
      position: pos,
      path: [],
      pathIndex: 0,
      isMoving: false,
      hasReachedDestination: false
    };
  });
}

function updatePawnStats(state: GameState): GameState {
  const newPawnStats: Record<string, Record<string, { value: number; sources: string[] }>> = {};

  state.pawns.forEach((pawn) => {
    newPawnStats[pawn.id] = calculatePawnStats(pawn);
  });

  return {
    ...state,
    pawnStats: newPawnStats
  };
}

// ===== AUTO-TURN FUNCTIONS =====
// The simulation is no longer driven by its own setInterval. A standalone timer
// competes with the rAF render loop for the single main thread and gets starved
// (browsers deprioritise timers under a busy frame), so a ~1 ms/tick sim could
// stall to ~20 TPS while rendering. Instead the render loop calls
// stepSimulation() once per frame with the elapsed time, and a fixed-timestep
// accumulator runs as many whole sim steps as that time (× speed) warrants.
function startAutoTurns() {
  simRunning = true;
  simAccumulatorMs = 0;
}

function stopAutoTurns() {
  simRunning = false;
  simAccumulatorMs = 0;
}

/**
 * Advance the simulation by the wall-clock time elapsed since the previous
 * frame. Called from the render loop (GameCanvas) so the sim and renderer share
 * one deterministic schedule instead of fighting over the main thread.
 *
 * @param frameDtMs Real milliseconds since the last frame.
 */
function stepSimulation(frameDtMs: number) {
  // ADR-021 cutover: the worker drives the tick loop; the render thread no longer steps the sim.
  if (USE_SIM_WORKER) return;
  if (!browser || !simRunning) return;
  if (get(isPaused)) {
    simAccumulatorMs = 0;
    return;
  }

  // Clamp the frame delta so returning from a long stall (or a backgrounded
  // tab where rAF was paused) doesn't try to replay minutes of backlog at once.
  const dt = Math.min(frameDtMs, 250);
  simAccumulatorMs += dt * gameSpeedValue;

  let steps = 0;
  while (simAccumulatorMs >= TICK_DURATION_MS && steps < MAX_STEPS_PER_FRAME) {
    const result = gameEngine.processGameTurn();
    if (!result.success) {
      console.error('[AutoTurn] GameEngine tick processing failed:', result.errors);
      simAccumulatorMs = 0;
      return;
    }
    simAccumulatorMs -= TICK_DURATION_MS;
    steps++;
  }

  // Couldn't keep up with the requested speed this frame — drop the backlog so
  // it doesn't accumulate into an ever-growing catch-up debt.
  if (steps >= MAX_STEPS_PER_FRAME) simAccumulatorMs = 0;
}

function pauseGame() {
  isPaused.set(true);
}

function unpauseGame() {
  isPaused.set(false);
}

function togglePause() {
  isPaused.update((paused) => !paused);
}

/** Auto-pause request from a threat alert (a mob spotting a colonist). Honours the `autoPauseOnThreat`
 *  setting — a no-op when the player has it off. Mirrors `pauseGame` (store + worker) so the sim halts.
 *  Called at runtime from the sim-log bridge, so the gameState↔simLogBridge import cycle stays safe. */
export function requestThreatPause() {
  if (!get(autoPauseOnThreat)) return;
  isPaused.set(true);
  if (USE_SIM_WORKER) simWorkerBridge.setPaused(true);
}

// Speed is applied live by stepSimulation via gameSpeedValue (kept in sync by the
// gameSpeed store subscription below), so changing speed needs no loop restart.
function setGameSpeed(speed: number) {
  gameSpeed.set(speed);
  if (USE_SIM_WORKER) simWorkerBridge.setSpeed(speed);
} // ===== WORLD REGEN =====
/**
 * Bumped on every full world REPLACE (regen / size change / preview / restore / reset). GameCanvas
 * watches it to force an IMMEDIATE terrain rebuild that bypasses its 500ms sim-rebuild throttle — so a
 * player-driven regen repaints the map this frame (kept hidden behind the Custom Map GENERATING
 * overlay) instead of up to half a second later, after the overlay has already dropped.
 */
export const worldGenRev = writable(0);

/**
 * Adopt a freshly-built GameState as the canonical state (world regen / reset). Under the worker
 * (the only browser path) a full-state REPLACE can't go through the command registry — it re-inits
 * the worker with the new state (which resets its snapshot baselines + restarts the tick loop). The
 * store projection is updated immediately so the UI repaints without waiting for the first snapshot.
 */
function loadStateIntoWorker(state: GameState) {
  gameStore.setSilent(state);
  gameStore.notify();
  worldGenRev.update((n) => n + 1);
  scheduleSave(state);
  if (USE_SIM_WORKER) {
    simWorkerBridge.init(state, state.seed);
    simWorkerBridge.setSpeed(gameSpeedValue);
    simWorkerBridge.setPaused(get(isPaused));
  } else {
    // SSR/test fallback: drive the in-thread engine directly.
    gameEngine.setGameStateManager(new GameStateManager(state));
  }
}

// Runtime world dimensions — toggled by the Custom Map menu (small→huge). regenWorld reads these so a
// size change takes effect on the next regeneration. Default is the M preset (500×500) so the Custom
// Map size toggle opens pre-selected on Medium and GENERATE matches that highlight.
let currentMapSize = { w: 500, h: 500 };
function setMapSize(w: number, h: number) {
  currentMapSize = { w: Math.max(8, w | 0), h: Math.max(8, h | 0) };
}
function getMapSize() {
  return currentMapSize;
}

/**
 * Regenerate the world from `seed` at the current map size.
 * `preview` (Custom Map menu, popup open): strip ALL pawns + mobs OFF the map — clear pawn positions
 * and seed no creatures — so nothing glitches on freshly-shuffled mountain/water tiles while sliders
 * move. A normal (non-preview) regen, e.g. when the popup closes, re-places pawns on valid
 * forest/plains/swamp land and re-seeds creatures.
 */
function regenWorld(seed?: number, dev = false, itemQty = 500, preview = false) {
  const s = (seed !== undefined ? seed : freshSeed()) >>> 0 || 1;
  // P0-2/D7: regenerating the world starts a fresh deterministic run — persist the seed,
  // reseed the sim RNG, and clear stale module-level unreachable-job memory.
  rng.reseed(s);
  resetUnreachableJobs();
  const newWorld = generateWorld(currentMapSize.w, currentMapSize.h, s);
  resourceGeneratorService.generateResources(newWorld, s);
  const base = get(gameState) as GameState;

  if (preview) {
    const next: GameState = {
      ...base,
      seed: s,
      worldMap: newWorld,
      mobs: [],
      pawns: base.pawns.map((p) => ({
        ...p,
        position: undefined,
        path: [],
        pathIndex: 0,
        isMoving: false,
        hasReachedDestination: false
      }))
    };
    loadStateIntoWorker(next);
    return;
  }

  // A GENERATE is a fresh deterministic run (see seed reseed above), so ROLL A NEW COLONY rather than
  // carrying the previous race/pawns over from the store — the old code re-placed `base.pawns` (same
  // pawns, new positions), so every regenerate produced the same colonists. Clear the race pool +
  // pawns so ensureRacePool re-rolls the whole pool from the (reseeded) rng — seed → world AND colony,
  // fully deterministic — then draw fresh pawns across it (same colony size) and re-derive work.
  const colonySize = base.pawns.length || 5;
  let next: GameState = {
    ...base,
    seed: s,
    worldMap: newWorld,
    mobs: [],
    racePool: [],
    raceRelations: [],
    pawns: []
  };
  next = ensureRacePool(next);
  next = {
    ...next,
    pawns: spawnPawnsOnMap(generateColonyPawns(next.racePool, colonySize), newWorld)
  };
  next = markColonyRacesDiscovered(next);
  next = workService.ensureDefaultWorkAssignments(next);
  if (dev) next = applyDevWorld(next, itemQty);
  next = entityService.seedInitialEntities(next);
  loadStateIntoWorker(next);
}

/**
 * Revert the live world to a snapshot (the Custom Map popup's CLOSE-without-GENERATE). Re-adopts the
 * prior full state into the store + sim worker, so any preview terrain shaped in the popup is
 * discarded and the worldMap/pawns/mobs/seed are exactly as they were before the popup opened. Safe
 * because regenWorld's preview path builds a NEW state object (never mutates the snapshot in place).
 */
function restoreWorld(snapshot: GameState) {
  rng.reseed(snapshot.seed);
  loadStateIntoWorker(snapshot);
}

// ===== MAIN-MENU BACKDROP PREVIEW =====
/** Fixed, curated seed so the title-screen world looks the same every launch. */
const MENU_PREVIEW_SEED = 4051283263;
/** Small world (cheap to build + seed) — big enough that the cover-fit zoom-out floor overflows the
 *  viewport for an atmospheric, slightly-oversized framing. NOT the player's Custom Map size. Width is
 *  Both dimensions are ODD so the map has an exact centre tile — the magical-tree ring then centres on
 *  a real tile on both axes (an even dimension puts the centre between tiles ⇒ a half-tile offset). */
const MENU_PREVIEW_MAP = { w: 161, h: 101 };
/** Legacy backdrop (set by `--legacy-menu` ⇒ VITE_LEGACY_MENU): the original four corner herds + a
 *  symmetric magical-tree ring. The DEFAULT backdrop is the MainMenu2 one: a checkerboard of 2× the
 *  magical trees and NO wildlife. */
const MENU_PREVIEW_LEGACY = import.meta.env.VITE_LEGACY_MENU === 'true';

/**
 * Boot the main-menu backdrop: a live but gutted preview of the game world that renders behind the
 * title screen (see MenuPreviewBackdrop / GameCanvas `menuPreview`). It starts the sim worker EARLY
 * (the heavy real boot still waits for New/Load) in `preview` mode, where the engine runs only the
 * atmospheric phases — weather + day/night roll and prey-only grazing/wandering — with NO pawns, NO
 * predators/hunting, and none of the environmental-consequence systems (regrowth, crop growth, item
 * decay, jobs, buildings, combat). Snapshots are not saved (`previewActive`). Clicking New/Load
 * re-inits this same worker into the full sim (savedStateReady → real init), so it's a clean hand-off.
 */
function startMenuPreview() {
  if (!browser || !USE_SIM_WORKER) return;
  rng.reseed(MENU_PREVIEW_SEED);
  resetUnreachableJobs();
  // `skipResources`: generateWorld normally scatters resources internally — but that pass can't exclude
  // the magical groves, leaving stray ones off the deliberate ring. So the menu skips it and runs its
  // OWN single excluded scatter below (otherwise the menu also double-generated resources).
  // tidyWater:false — the backdrop erases water below (customizeMenuPreviewWorld), so a riverbank ring
  // would be left stranded with no water. The Custom Map / game gen keep it (default true).
  const world = generateWorld(MENU_PREVIEW_MAP.w, MENU_PREVIEW_MAP.h, MENU_PREVIEW_SEED, {
    skipResources: true,
    tidyWater: false
  });
  // Title-screen art direction: flatten the mountain, erase water, and compute the magical-tree ring (see
  // module). Done BEFORE resource generation and entity seeding so prey spawn on the reshaped land.
  const groveCenters = customizeMenuPreviewWorld(world);
  // Exclude the magical groves from the RANDOM scatter so no stray ones spawn off the deliberate layout;
  // ordinary trees/plants still scatter normally.
  resourceGeneratorService.generateResources(world, MENU_PREVIEW_SEED, {
    exclude: menuPreviewMagicalGroveIds()
  });
  // …then plant the glowing magical trees (after the ordinary-tree scatter, so they aren't clobbered).
  // Default (MainMenu2): 2× the trees in a jittered checkerboard. Legacy (MainMenu): the symmetric ring.
  if (MENU_PREVIEW_LEGACY) placeMenuPreviewMagicalGroves(world, groveCenters, MENU_PREVIEW_SEED);
  else placeMenuPreviewScatteredGroves(world, MENU_PREVIEW_SEED);

  // Random (per launch) season-appropriate weather; season pinned to the real-world date via
  // `_debugSeason` (processEnvironment otherwise derives season from the turn). Falls back to a
  // spring breeze if the pick fails.
  const climate = pickMenuPreviewClimate();

  let preview: GameState = {
    ...initialGameState,
    seed: MENU_PREVIEW_SEED,
    worldMap: world,
    season: climate.season,
    _debugSeason: climate.season,
    weather: climate.weather,
    pawns: [],
    mobs: [],
    buildings: [],
    designations: {},
    jobs: []
  };
  // Prey only — no laired hostiles, no free-roaming predators — so the backdrop never spawns a hunt.
  // Legacy menu places four corner herds; the default (MainMenu2) backdrop has NO wildlife.
  if (MENU_PREVIEW_LEGACY) {
    preview = entityService.seedInitialEntities(preview, undefined, { preyOnly: true });
  }

  previewActive = true;
  gameStore.setSilent(preview);
  gameStore.notify();
  worldGenRev.update((n) => n + 1);

  simWorkerBridge.start();
  simWorkerBridge.init(preview, MENU_PREVIEW_SEED, { preview: true });
  // 0.5× → ~30 TPS (vs 60): the backdrop only needs a slow day/night roll, so halving the tick rate cuts
  // worker CPU/churn while the day still cycles in ~10 min (glow still visibly moves). Hiccup-side relief
  // comes from the 5 Hz flush throttle (PREVIEW_PUSH_MS); this is worker-side hygiene.
  simWorkerBridge.setSpeed(0.5);
  simWorkerBridge.setPaused(false); // the backdrop runs regardless of the (real game's) pause state
  menuPreviewReady.set(true);
}

// ===== ITEM MANAGEMENT =====
// ADR-021 W3: routed through the serializable command registry (`commands.ts`) instead of an inline
// closure, so the same logic can run in the sim worker after cutover. dispatchCommand on the main
// thread is still applyCommand — behaviour identical.
function consumeGlobalItem(itemId: string, quantity: number = 1) {
  dispatchCommand({ type: 'consumeGlobalItem', payload: { itemId, quantity }, save: true });
}

function addItem(itemId: string, amount: number) {
  dispatchCommand({ type: 'addItem', payload: { itemId, amount }, save: true });
}

/** Equip a physical item off a tile onto a pawn (ADR-016-faithful). Logic in the `equipFromTile`
 *  worker command (`sim/commands.ts`): the swapped-out item drops back onto the pawn's tile. */
function equipItemFromTile(pawnId: string, dropId: string) {
  dispatchCommand({ type: 'equipFromTile', payload: { pawnId, dropId }, save: true });
}

/** Pick `quantity` units of a tile drop straight into a pawn's inventory (carry-budget clamped). */
function pickUpItemFromTile(pawnId: string, dropId: string, quantity: number) {
  dispatchCommand({
    type: 'pickUpItemFromTile',
    payload: { pawnId, dropId, quantity },
    save: true
  });
}

/** Order a drafted pawn to shuttle the loose stack on a tile to the nearest stockpile (multi-trip). */
function haulTileToStockpile(pawnId: string, x: number, y: number) {
  dispatchCommand({ type: 'haulTileToStockpile', payload: { pawnId, x, y }, save: true });
}

/** Dev timesaver (ADR-016-faithful): spawn `amount` of EVERY item as physical LOOSE drops on
 *  the ground around the colony — haulers carry them into stockpiles like anything gathered. */
function devSpawnAllItems(amount = 500) {
  dispatchCommand({ type: 'devSpawnAllItems', payload: { amount }, save: true });
}

/** Dev inverse: destroy every physical item (all drops + carried inventory). */
function devClearAllItems() {
  dispatchCommand({ type: 'devClearAllItems', payload: {}, save: true });
}

function resetGame() {
  deleteSave().catch(console.error);
  clearActivityLog();
  // Fresh deterministic run: new seed, reseeded RNG, cleared module state, fresh world
  // (initialGameState.worldMap is now empty — world gen is no longer done at module load).
  const seed = freshSeed();
  rng.reseed(seed);
  resetUnreachableJobs();
  const world = generateWorld(240, 160, seed);
  resourceGeneratorService.generateResources(world, seed);
  // Fresh mixed colony: regenerate the race pool + relations, draw pawns across it, then run
  // the same spawn/work/entity bootstrap the load path uses (Race overhaul).
  let fresh: GameState = {
    ...initialGameState,
    seed,
    worldMap: world,
    pawns: [],
    racePool: [],
    raceRelations: []
  };
  fresh = ensureRacePool(fresh);
  fresh = { ...fresh, pawns: generateColonyPawns(fresh.racePool, 5) };
  fresh = { ...fresh, pawns: spawnPawnsOnMap(fresh.pawns, world) };
  fresh = markColonyRacesDiscovered(fresh);
  fresh = workService.ensureDefaultWorkAssignments(fresh);
  fresh = entityService.seedInitialEntities(fresh);
  loadStateIntoWorker(fresh);
  console.info('[GameState] Game reset to initial state.');
}

// ===== STORE READY FLAG =====
/**
 * Becomes `true` once the persisted save has been loaded and applied to the
 * store. Use this to gate rendering so components never see the ephemeral
 * freshly-generated world that lives in `initialGameState`.
 */
export const storeReady = writable(false);

/**
 * True once the main-menu backdrop preview world is in the store + the worker is ticking it (see
 * `startMenuPreview`). Gates the `<MenuPreviewBackdrop>` mount in MainMenu. Cleared on New/Load so
 * the backdrop unmounts before the real sim takes over the worker.
 */
export const menuPreviewReady = writable(false);

/**
 * Flipped true by GameCanvas once the backdrop has PAINTED its first terrain frame. The backdrop holds
 * at opacity 0 until then and fades in, so the WebGL init (which clears the whole canvas before the
 * first draw) happens invisibly behind the menu's dark background instead of flashing the screen.
 */
export const menuPreviewRendered = writable(false);

/**
 * The worker is currently running the menu-preview backdrop (gutted turn, prey-only, no pawns). While
 * true, snapshots are NOT persisted — the preview world must never be written to the save (it would
 * masquerade as a loadable game). Flipped off at the real New/Load worker re-init.
 */
let previewActive = false;

/**
 * Set true by GameCanvas once the WebGL renderer has finished initialising. `storeReady` mounts the
 * game-container so WebGL begins initialising BEHIND the loading overlay; `rendererReady` then marks
 * it up. The overlay itself is dropped by `bootReveal`, a paused beat LATER (see below).
 */
export const rendererReady = writable(false);

/**
 * Drops the single loading overlay (+page.svelte). Set true a short, paused `WORKER_WARMUP_MS` beat
 * AFTER the renderer is up — that lingering window hides the worker boot + WebGL-init GC behind the
 * overlay, so the game is revealed into a settled environment (and stays PAUSED — the player
 * unpauses when ready). A GameCanvas remount resets it (rendererReady → false re-arms the linger).
 */
export const bootReveal = writable(false);

/** Human-readable phase shown on the loading screen (LoadingScreen.svelte), updated through boot. */
export const loadingStatus = writable('Initializing…');

// ===== MAIN MENU / BOOT GATE =====
/**
 * Top-level app phase. `'menu'` shows the main menu (MainScreen logo + New/Load/Settings/Exit) and
 * holds the heavy sim boot; `'game'` mounts the game. The profiler sandbox auto-boots straight into
 * the game (no menu); everything else opens at the menu.
 */
export type AppPhase = 'menu' | 'game';

// One-shot override: `goToMainMenu()` sets this sessionStorage flag before reloading so the NEXT boot
// opens the menu even under --debug/--profiler (which normally skip it). Read-and-clear so it forces the
// menu exactly once — a later fresh launch still honours the build flags and boots straight into the save.
const FORCE_MENU_KEY = 'f4x:forceMenu';
const forceMenuOnce = browser && sessionStorage.getItem(FORCE_MENU_KEY) === '1';
if (forceMenuOnce) sessionStorage.removeItem(FORCE_MENU_KEY);

// The main menu is a player-facing affordance. Only `--debug` (VITE_DEBUG_MODE) SKIPS it — that's the
// dev-iteration launch, where a menu click is just friction. Every other launch (clean, `--log`, and
// `--play`) opens at the menu, so `./launch.sh --electron --play` exercises the real menu flow.
// `--profiler` (VITE_PROFILER) is the sole technical exception: its loader branch returns early with
// its own auto-boot sandbox and never goes through `startGame`, so it must bypass the menu too.
// `forceMenuOnce` overrides the skip for one boot (the explicit "Main Menu" navigation from Settings).
const MENU_ENABLED =
  browser &&
  (forceMenuOnce ||
    (import.meta.env.VITE_DEBUG_MODE !== 'true' && import.meta.env.VITE_PROFILER !== 'true'));

export const appPhase = writable<AppPhase>(MENU_ENABLED ? 'menu' : 'game');

// Boot gate: the heavy save-load + worker start is held inside savedStateReady until the menu fires
// New/Load (startGame resolves this). `_bootMode` tells the loader whether to ignore the save and
// start a fresh colony. Profiler mode returns before the gate, so it never waits.
let _resolveBootGate!: () => void;
const bootGate = new Promise<void>((resolve) => {
  _resolveBootGate = resolve;
});
let _bootMode: 'new' | 'load' = 'load';
// Read through a typed getter so the loader IIFE sees the declared union, not the narrowed
// initializer (TS CFA narrows a module-level `let` to its literal inside an immediately-invoked fn).
const bootMode = (): 'new' | 'load' => _bootMode;

// Dev/profiler launches have no menu to click — release the gate now so the loader boots straight
// into the (loaded) game, exactly as before the menu existed.
if (!MENU_ENABLED) _resolveBootGate();

/**
 * Leave the main menu and boot the game. `'new'` starts a fresh colony (ignores any save, fresh seed) and
 * mints a fresh active save id to autosave into; `'load'` adopts `saveId` as the active save and resumes
 * it from disk. Flips `appPhase` to `'game'` (mounting the loading overlay) and releases the boot gate so
 * savedStateReady proceeds. Idempotent — a second call no-ops because the resolved gate can't re-trigger
 * the one-shot loader. (The menu-bypass --debug/--profiler boot never calls this; loadSave() then resolves
 * the active id to the most-recent save.)
 */
function startGame(mode: 'new' | 'load', saveId?: string) {
  _bootMode = mode;
  if (mode === 'load' && saveId) setActiveSave(saveId);
  else {
    mintActiveSave(); // fresh colony → its own autosave snapshot…
    setActiveCommitted(false); // …but UNCOMMITTED until the player confirms the map with GENERATE, so
    // abandoning map-gen (exit to menu / reload) never persists a phantom colony.
  }
  // Tear down the menu backdrop: unmount it now, and freeze the preview worker so it stops emitting
  // (still-unsaved) snapshots during the gap before savedStateReady re-inits it into the real sim.
  menuPreviewReady.set(false);
  if (previewActive && USE_SIM_WORKER) simWorkerBridge.setPaused(true);
  appPhase.set('game');
  _resolveBootGate();
}

/**
 * Pause-menu "Save Game" — write a NEW frozen snapshot (timestamped checkpoint). Unlike autosave, this
 * never overwrites the active save, so manual saves accumulate as an open list of restore points. Captures
 * the current chronicle alongside. Resolves when the IndexedDB write completes.
 */
async function saveGame(): Promise<void> {
  await saveSnapshotNow(get(gameState) as GameState, get(activityLog));
}

/**
 * Pause-menu "Save Game" → overwrite an EXISTING save the player picked, replacing it with the current
 * state + chronicle (keeps its id, re-stamps the time). The alternative to saveGame()'s new snapshot.
 */
async function overwriteSave(id: string): Promise<void> {
  await overwriteSnapshotNow(id, get(gameState) as GameState, get(activityLog));
}

/**
 * One-shot eager flush of the ACTIVE save (exit / quit / return-to-menu), cancelling any pending debounced
 * autosave. NOT a new snapshot and NOT gated by the autosave toggle — it's the safety write so progress
 * isn't lost on the way out, mirroring the old exit-save behaviour.
 */
function flushSave(): Promise<void> {
  return saveGameNow(get(gameState) as GameState);
}

/**
 * Flush the save and return to the main menu. A plain reload would bypass the menu under --debug/--profiler
 * (the dev launches boot straight into the save), so this arms the one-shot FORCE_MENU flag first — the
 * next boot reads it and opens the menu instead. In a normal launch the reload reaches the menu anyway;
 * the flag is harmless there. This is what lets a --debug session, which skips the menu at start, still get
 * INTO the menu on demand (the Settings "Main Menu" button).
 */
async function goToMainMenu(): Promise<void> {
  await flushSave();
  if (browser) {
    sessionStorage.setItem(FORCE_MENU_KEY, '1');
    location.reload();
  }
}

/** How long the loading overlay lingers after the renderer is up before the reveal — lets the worker
 *  boot (module eval + WASM + init-state deserialize, ~0–2s of native + GC) and the WebGL-init GC
 *  settle behind the overlay before the (paused) reveal. Also paces the loading bar (LoadingScreen
 *  reads it). Extend freely; load is one-time per page load. Skipped (0) under --hmr (VITE_HMR): when
 *  you're iterating with hot-reload the GC-hiding linger is just dead time on every reload. */
export const WORKER_WARMUP_MS = import.meta.env.VITE_HMR === 'true' ? 0 : 2500;

// Drop the overlay a paused beat after the renderer comes up. A remount (rendererReady → false)
// re-arms the linger so the overlay covers the WebGL re-init too.
if (browser) {
  let revealTimer: ReturnType<typeof setTimeout> | undefined;
  rendererReady.subscribe((up) => {
    if (up) {
      if (revealTimer) return;
      loadingStatus.set('Warming up simulation…');
      revealTimer = setTimeout(() => {
        loadingStatus.set('Ready');
        bootReveal.set(true);
      }, WORKER_WARMUP_MS);
    } else {
      clearTimeout(revealTimer);
      revealTimer = undefined;
      bootReveal.set(false);
    }
  });

  // Safety net: if the renderer never reports ready (e.g. WebGL unavailable — the error lives behind
  // the overlay), force the reveal after a generous timeout so the overlay can't strand the user.
  // ARM IT ONLY ONCE THE GAME ACTUALLY STARTS BOOTING (appPhase → 'game'). Otherwise sitting on the
  // main menu would, after 15s, flip bootReveal=true — which both fires the GAME OVER overlay on the
  // empty pre-game roster and skips the loading spinner on the next New/Load. (Dev/profiler launches
  // start at appPhase='game', so this still arms immediately for them.)
  let fallback: ReturnType<typeof setTimeout> | undefined;
  appPhase.subscribe((phase) => {
    if (phase === 'game' && fallback === undefined) {
      fallback = setTimeout(() => bootReveal.set(true), 15000);
    }
  });
  bootReveal.subscribe((revealed) => {
    if (revealed && fallback) clearTimeout(fallback);
  });
}

// ===== MAIN STORE SETUP =====

// Create the main store starting with a fresh game. The actual save is loaded
// asynchronously below.
//
// This is a custom store (not a plain `writable`) so the GameEngine — the single writer of
// canonical state (P-2) — can refresh the held value (setSilent) and choose when to NOTIFY.
// The store value is a read-only projection of engine state: it holds the value and manages
// subscribers but never derives new state itself. All mutations flow through the engine (see
// `set`/`update`/`updateWithSave` below → gameEngine.applyCommand → commitFromEngine).
function createGameStore(initial: GameState) {
  let value = initial;
  const subscribers = new Set<(v: GameState) => void>();
  return {
    subscribe(run: (v: GameState) => void) {
      subscribers.add(run);
      run(value);
      return () => subscribers.delete(run);
    },
    /** Update the held value WITHOUT notifying subscribers (engine hot path). */
    setSilent(v: GameState) {
      value = v;
    },
    /** Flush the current value to all subscribers. */
    notify() {
      subscribers.forEach((run) => run(value));
    }
  };
}

const gameStore = createGameStore(initialGameState);
const { subscribe } = gameStore;

// P-2 single source of truth: the GameEngine is the only writer of canonical state. Every store
// mutation is a *command* (an updater function) handed to the engine via applyCommand, which
// applies it to its own state and commits the result back here through commitFromEngine. The
// store value is purely a read-only projection. `set`/`update` don't schedule a save (the next
// tick's throttled push persists them); `updateWithSave` does — matching previous behaviour.
const set = (v: GameState) => gameEngine.applyCommand(() => v, false);
const update = (updater: (v: GameState) => GameState) => gameEngine.applyCommand(updater, false);
const updateWithSave = (updater: (state: GameState) => GameState) =>
  gameEngine.applyCommand(updater, true);

// ADR-021 W3: dispatch a serializable command. On the main thread it applies through the engine
// (identical to update/updateWithSave); after the worker cutover this becomes a postMessage to the
// sim worker. The command's logic lives in `commands.ts` (worker-safe), shared by both targets.
const dispatchCommand = (cmd: SimCommand) => {
  // ADR-021 cutover: in worker mode the worker owns state, so commands are posted to it; otherwise
  // they apply through the in-thread engine (identical logic via the shared registry).
  if (USE_SIM_WORKER) {
    simWorkerBridge.command(cmd);
    return;
  }
  gameEngine.applyCommand((s) => applySimCommand(s, cmd), cmd.save ?? false);
};

// Engine → store projection of a user command: refresh the held value, optionally schedule a
// debounced save, then notify subscribers immediately so user actions stay snappy.
const commitFromEngine = (state: GameState, save: boolean) => {
  gameStore.setSilent(state);
  if (save) scheduleSave(state);
  gameStore.notify();
};

// Engine tick push: refresh the held value every tick (so `get()` stays current) but only notify
// subscribers when `flush` is true (throttled ~15 Hz). Saves are debounced each tick as before.
const pushFromEngine = (state: GameState, flush: boolean) => {
  gameStore.setSilent(state);
  scheduleSave(state);
  if (flush) gameStore.notify();
  // In-thread path (tests/SSR): the engine mutates worldMap tiles in place on the live state we just
  // pushed, so changes are already reflected — just discard the worker-only tile-delta buffer so it
  // doesn't accumulate. (Under the worker this drain happens in publish(); see tileDeltas.ts.)
  clearTileDeltas();
};

// ===== INITIALIZE GAMEENGINE =====
const gameStateManager = new GameStateManager(initialGameState);
gameEngine.setGameStateManager(gameStateManager);
// Inject the per-tick output sink (ADR-021 W0): the engine pushes each tick's state to the store
// through this, instead of importing the store itself — so the engine can later run in a worker
// where the sink becomes a postMessage. Default = the existing store push (behaviour unchanged).
gameEngine.setOutputSink(pushFromEngine);
gameEngine.setCommitSink(commitFromEngine);
console.log('[GameState] GameEngine initialized with GameStateManager');

// ===== ASYNC SAVE LOAD + MIGRATIONS =====
/** Resolves when the persisted save (if any) has been loaded and applied. */
export const savedStateReady: Promise<void> = (async () => {
  if (!browser) return;
  loadingStatus.set('Loading world…');

  // Heavy-load sandbox (./dev.sh --profiler → VITE_PROFILER=true): skip the save and boot a heavy
  // populated scenario (giant map, 150 pawns…) instead of the small fresh world — so the loading
  // hack and the sim can be exercised under realistic load. By DEFAULT it now boots like the REAL
  // game (PAUSED, behind the lingering loading overlay) so the loading-screen hack can be measured
  // under that load. The auto-run CAPTURE mode (unpause + 4× + instant reveal, to grab the running
  // sim's startup in the Firefox Profiler) is gated behind the SEPARATE VITE_PROFILER_AUTORUN flag
  // (./dev.sh --profiler-autorun). Dynamic import keeps the scenario out of the normal bundle; the
  // leading `await` also defers this past synchronous module init, so gameSpeed/isPaused are defined.
  if (import.meta.env.VITE_PROFILER === 'true') {
    const { buildProfilerScenario } = await import('$lib/game/dev/profilerScenario');
    const scenario = buildProfilerScenario();
    rng.reseed(scenario.seed);
    resetUnreachableJobs();
    set(scenario);
    gameEngine.setGameStateManager(new GameStateManager(scenario));
    setGameSpeed(4); // both modes run the heavy sim at 4× once unpaused
    storeReady.set(true);

    const autorun = import.meta.env.VITE_PROFILER_AUTORUN === 'true';
    if (autorun) {
      // Capture mode only: unpause + drop the overlay now, so the profiler records the running sim
      // rather than a paused, overlaid game.
      unpauseGame();
      bootReveal.set(true);
    }
    // Otherwise fall through to the normal reveal path: WebGL inits behind the overlay, then the
    // paused warmup linger drops it (rendererReady subscription) — the real-game startup, on the
    // giant map (still 4× once the player unpauses).
    console.info(
      `[PROFILER] sandbox loaded: ${scenario.pawns.length} pawns, ${(scenario.mobs ?? []).length} mobs, ` +
        `${scenario.buildings.length} buildings, ${(scenario.droppedItems ?? []).length} items, ` +
        `${Object.keys(scenario.designations).length} designations · ` +
        (autorun
          ? '4× speed, AUTORUN capture mode.'
          : 'PAUSED behind the loading overlay (real-game startup, giant map).')
    );
    return;
  }

  // Menu-gated boot: hold here until the player picks New/Load (startGame resolves bootGate). The
  // profiler branch returned above, so it never reaches this await.
  await bootGate;
  loadingStatus.set('Loading world…');

  // `'new'` ignores any save and rolls a fresh seed so each new game differs; `'load'` resumes disk
  // (loadSave with no active id — the --debug menu-bypass boot — resolves to the most-recent save).
  const savedState = bootMode() === 'new' ? null : await loadSave();
  // Guarantee an autosave target even on a fresh --debug launch with an empty DB (no save loaded, and
  // startGame — which mints one — was bypassed). No-op when New Game or a load already set the active id.
  ensureActiveSave();
  let baseState = savedState ? applyMigrations(savedState) : initialGameState;
  if (bootMode() === 'new') baseState = { ...baseState, seed: freshSeed() };

  // Load the active save's chronicle (the module-init load ran before a save was chosen). A fresh colony
  // has no log under its new id, so this resets it to []. Done before the sim starts so no stray entries
  // cross saves.
  await reloadActivityLogForActiveSave();

  // P0-2/D7: reseed the sim RNG from the persisted seed so the run replays deterministically,
  // and clear module-level state (unreachable-job memory) carried over from a prior session.
  rng.reseed(baseState.seed);
  resetUnreachableJobs();

  // Regenerate the world only when the save has no usable map. Otherwise the persisted world is
  // kept as-is — wipe localStorage manually to start fresh. World gen is seeded from
  // baseState.seed (D7) so the same save always yields the same world.
  if (
    !baseState.worldMap ||
    baseState.worldMap.length === 0 ||
    !baseState.worldMap[0]?.[0]?.terrainType
  ) {
    // A NEW game generates at the player's chosen size (currentMapSize — what the Custom Map popup shows
    // and GENERATE uses), so the first map drawn under the popup matches and renders correctly. The
    // legacy 240×160 is only for migrating an old save that somehow has no usable map. (Before this, a
    // new game booted a 240×160 world into a popup/grid expecting 500×500 — it read as an empty map until
    // the player rerolled the seed and regenerated at the right size.)
    const genW = bootMode() === 'new' ? currentMapSize.w : 240;
    const genH = bootMode() === 'new' ? currentMapSize.h : 160;
    const migratedWorld = generateWorld(genW, genH, baseState.seed);
    resourceGeneratorService.generateResources(migratedWorld, baseState.seed);
    baseState = { ...baseState, worldMap: migratedWorld };
  } else if (!baseState.worldMap[0]?.[1]?.discovered) {
    baseState = {
      ...baseState,
      worldMap: baseState.worldMap.map((row) =>
        row.map((tile) => (tile.discovered ? tile : { ...tile, discovered: true }))
      )
    };
  }

  // Backfill resources if all tiles are empty (migration from pre-resource-gen saves)
  if (
    baseState.worldMap.length > 0 &&
    baseState.worldMap.every((row) =>
      row.every((tile) => Object.keys(tile.resources ?? {}).length === 0)
    )
  ) {
    resourceGeneratorService.generateResources(baseState.worldMap, Date.now());
  }

  // Race overhaul: ensure a prerolled race pool + relations exist (migrates legacy single-race
  // saves) BEFORE pawn generation so a fresh colony can be drawn mixed from the pool.
  baseState = ensureRacePool(baseState);

  // Pawn generation — ONLY on a genuinely fresh boot (no save on disk). A LOADED save with an empty
  // roster is a colony wiped out by permadeath: we leave it empty so the UI shows GAME OVER (see
  // `isGameOver`) instead of resurrecting it. We also do NOT top up an under-5 roster — a colony
  // that lost members stays shrunk. (The old `length < 5` backfill silently undid permadeath on
  // every reload/HMR, spawning strangers next to the persisted corpses. Removed.)
  if (!savedState && (!baseState.pawns || baseState.pawns.length === 0)) {
    // Fresh colony — fully mixed: each pawn rolled from a random pool race.
    baseState = { ...baseState, pawns: generateColonyPawns(baseState.racePool, 5) };
  }

  // Spawn pawns that have no map position yet
  if (baseState.pawns.some((p) => !p.position)) {
    baseState = { ...baseState, pawns: spawnPawnsOnMap(baseState.pawns, baseState.worldMap) };
  }

  // Flag colony races as discovered + set per-race headcounts for the pokédex.
  baseState = markColonyRacesDiscovered(baseState);

  // Give any pawn without a work assignment explicit default labor settings — ONCE.
  // (Replaces the old per-tick workService.ensureBasicWorkAssignments — see D4.)
  baseState = workService.ensureDefaultWorkAssignments(baseState);

  // Seed an initial mob/animal population so entities are visible on the map
  // immediately on load (no-op if the save already has live entities).
  baseState = entityService.seedInitialEntities(baseState);

  // Push loaded state into the store and sync GameEngine
  set(baseState);
  gameEngine.setGameStateManager(new GameStateManager(baseState));
  // Mount the game-container so the WebGL renderer begins initialising BEHIND the loading overlay.
  // The overlay stays up (gated on `bootReveal`) until the renderer is up AND the paused warmup
  // linger has hidden the worker-boot/WebGL-init GC — see the `rendererReady` subscription above.
  loadingStatus.set('Starting renderer…');
  storeReady.set(true);
})().catch((err) => {
  console.error('[GameState] Failed to load save, starting fresh:', err);
  // Still unblock rendering so the app doesn't stay stuck on the loading screen.
  storeReady.set(true);
});

// The game ALWAYS starts PAUSED — the player unpauses when ready. Better gameplay (you survey the
// colony before it runs), and it never auto-unpauses, so the worker boot + GC get as long as the
// player takes to hit play to settle. (Deliberately NOT restored from a prior session — a fresh
// load is always paused; a dev hot-reload just re-pauses, which is fine.)
const isPaused = writable(true);
const gameSpeed = writable(1);

// Subscribe to keep track of current speed value
if (USE_SIM_WORKER) {
  // ADR-021 cutover: keep the worker's loop in sync with pause/speed.
  isPaused.subscribe((p) => simWorkerBridge.setPaused(p));
}
gameSpeed.subscribe((value) => {
  gameSpeedValue = value;
});

// ===== EXPORTS =====
export const gameState = {
  subscribe,
  set,
  update,
  updateWithSave,
  /** ADR-021 W3: dispatch a serializable command (worker-ready). Prefer this over update() for
   *  player/dev actions — the logic lives in `sim/commands.ts`, shared with the sim worker. */
  command: dispatchCommand,
  pushFromEngine,
  commitFromEngine,
  isPaused: { subscribe: isPaused.subscribe },
  gameSpeed: { subscribe: gameSpeed.subscribe },

  // Auto-turn functions
  startAutoTurns,
  stopAutoTurns,
  stepSimulation,
  pauseGame,
  unpauseGame,
  togglePause,
  setGameSpeed,

  // Game functions
  addItem,
  equipItemFromTile,
  pickUpItemFromTile,
  haulTileToStockpile,
  devSpawnAllItems,
  devClearAllItems,
  consumeGlobalItem,
  resetGame,
  /** Leave the main menu and boot the game ('new' = fresh colony, 'load' = resume save). */
  startGame,
  /** Pause menu "Save Game" → New Save: write a new frozen snapshot (a timestamped checkpoint). */
  saveGame,
  /** Pause menu "Save Game" → overwrite a picked existing save in place (keeps its id). */
  overwriteSave,
  /** Eager flush of the active save on exit/quit (not a new snapshot; ungated by the autosave toggle). */
  flushSave,
  /** Save and reload back to the main menu (forces the menu even under the menu-skipping --debug launch). */
  goToMainMenu,
  regenWorld,
  restoreWorld,
  setMapSize,
  getMapSize
};

// Export the updateWithSave function directly for GameEngine
// (Removed duplicate export to fix redeclaration error)

// ===== HMR CLEANUP =====
// When Vite hot-replaces this module during development, stop any running
// interval so the old module's timer doesn't keep firing with a stale
// isPaused reference that can never be updated by the new module.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopAutoTurns();
  });
}

// Derived stores
/** Permadeath: the whole colony is dead once the roster is empty (reapDeadPawns strips the dead).
 *  Drives the GAME OVER overlay. The load path never resurrects a wiped save, so an empty roster
 *  post-boot is always a genuine wipe — not a mid-boot transient. */
export const isGameOver = derived(gameState, ($gameState) => ($gameState.pawns?.length ?? 0) === 0);

export const currentTurn = derived(gameState, ($gameState) => $gameState.turn);
/** SEASONS_WEATHER: lightweight topbar readouts (avoid subscribing the whole state in the HUD). */
export const currentSeason = derived(gameState, ($gameState) => $gameState.season ?? 'spring');
export const currentWeather = derived(gameState, ($gameState) => $gameState.weather);
export const currentAvgTemperature = derived(gameState, ($gameState) => $gameState.avgTemperature);
export const currentRace = derived(gameState, ($gameState) => $gameState.race);
/** The full prerolled race pool (pokédex backing store). */
export const racePool = derived(gameState, ($gameState) => $gameState.racePool ?? []);
/** Procedural inter-race relations (stub — data + pokédex display only). */
export const raceRelations = derived(gameState, ($gameState) => $gameState.raceRelations ?? []);
/** Known (encountered) races — what the Race-tab pokédex lists. */
export const discoveredRaces = derived(gameState, ($gameState) =>
  ($gameState.racePool ?? []).filter((r) => r.discovered)
);
export const pawnStats = derived(gameState, ($gameState) => $gameState.pawnStats || {});

/** Items currently in the colony stockpile, enriched from the items database, sorted by name. */
export const currentStockpile = derived(gameState, ($gameState) => {
  // Identity-tracked stored drops (named carcasses etc.) surface as individual rows by name so a
  // dead colonist reads as "Vale's Carcass", not an anonymous "Carcass ×N". Their count is netted
  // out of the aggregate row for that resource (any remaining un-named stock still shows normally).
  const drops = $gameState.droppedItems ?? [];
  const namedStored = drops.filter((d) => d.stored && (d.quantity ?? 0) > 0 && d.name != null);
  const namedCount: Record<string, number> = {};
  for (const d of namedStored)
    namedCount[d.resourceId] = (namedCount[d.resourceId] ?? 0) + d.quantity;

  const rows = Object.entries($gameState.stockpile ?? {})
    .map(([id, amount]) => [id, amount - (namedCount[id] ?? 0)] as const)
    .filter(([, amount]) => amount > 0)
    .map(([id, amount]) => {
      const def = itemService.getItemById(id);
      return { id, name: def?.name ?? id, amount, color: def?.color, emoji: def?.emoji };
    });

  for (const d of namedStored) {
    const def = itemService.getItemById(d.resourceId);
    rows.push({
      id: d.id,
      name: d.name!,
      amount: d.quantity,
      color: def?.color,
      emoji: def?.emoji
    });
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name));
});

/** Per-zone inventory view, derived from the `stored` DroppedItems on each zone's tiles. */
export const currentStockpileZones = derived(gameState, ($gameState) => {
  const drops = $gameState.droppedItems ?? [];
  return ($gameState.stockpileZones ?? []).map((zone) => {
    const tileSet = new Set(zone.tiles);
    const inv: Record<string, number> = {};
    // Identity-tracked stored drops (named carcasses) show as individual rows; netted out of the
    // counted aggregate so the zone view matches the main sidebar (see currentStockpile).
    const namedRows: {
      id: string;
      name: string;
      amount: number;
      color: string | undefined;
      emoji: string | undefined;
    }[] = [];
    for (const d of drops) {
      if (!d.stored || (d.quantity ?? 0) <= 0) continue;
      if (!tileSet.has(`${d.x},${d.y}`)) continue;
      if (d.name != null) {
        const def = itemService.getItemById(d.resourceId);
        namedRows.push({
          id: d.id,
          name: d.name,
          amount: d.quantity,
          color: def?.color,
          emoji: def?.emoji
        });
        continue;
      }
      inv[d.resourceId] = (inv[d.resourceId] ?? 0) + d.quantity;
    }
    return {
      ...zone,
      displayInventory: Object.entries(inv)
        .filter(([, amount]) => amount > 0)
        .map(([id, amount]) => {
          const def = itemService.getItemById(id);
          return { id, name: def?.name ?? id, amount, color: def?.color, emoji: def?.emoji };
        })
        .concat(namedRows)
        .sort((a, b) => a.name.localeCompare(b.name))
    };
  });
});

// ADR-021 (W4 complete): once boot (load + migrations) has produced the canonical state on the
// in-thread engine, hand ownership to the sim worker. The worker then runs the tick loop and owns
// GameState; this store becomes a read-only projection fed by snapshots, and player commands post
// to the worker (see dispatchCommand). Always on in the browser; skipped only under SSR/tests.
if (USE_SIM_WORKER) {
  simWorkerBridge.onState = (s, flush) => {
    // Mirror the in-thread split: refresh the held value EVERY tick (renderer reads positions via
    // get() each frame → smooth interpolation), but only NOTIFY subscribers + save at flush (~15Hz)
    // so UI reactivity isn't hammered 50×/s.
    gameStore.setSilent(s);
    if (flush) {
      gameStore.notify();
      // Never persist the menu-preview world — it must not masquerade as a loadable save.
      if (!previewActive) scheduleSave(s);
    }
  };
  simWorkerBridge.onFullState = (s) => {
    if (!previewActive) scheduleSave(s);
  };

  // Main-menu backdrop: boot the gutted preview world into the worker right away (the heavy real boot
  // still waits for New/Load). Skipped when the menu is bypassed (--debug / --profiler launch straight
  // into the game).
  if (MENU_ENABLED) startMenuPreview();

  savedStateReady.then(() => {
    // Kick the worker off in parallel with the WebGL init that's already happening behind the
    // overlay; the paused warmup linger (rendererReady subscription) covers the worker boot + GC.
    // This is also the menu-preview → real-sim hand-off: re-init the SAME worker with the real state
    // (no `preview` flag ⇒ engine clears previewMode), so the backdrop's worker becomes the game sim.
    previewActive = false; // real snapshots persist from here on
    // Settings "Default game speed" — the rate the (always-paused-at-start) game runs at once unpaused.
    gameSpeed.set(get(defaultGameSpeed));
    simWorkerBridge.start();
    const st = get(gameState) as GameState;
    simWorkerBridge.init(st, st.seed);
    simWorkerBridge.setSpeed(gameSpeedValue);
    simWorkerBridge.setPaused(get(isPaused));
    console.info('[SIM-WORKER] cutover active — sim now runs in the worker.');
  });
}
