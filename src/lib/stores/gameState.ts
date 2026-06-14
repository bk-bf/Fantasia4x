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
import type {
  GameState,
  Pawn,
  WorldTile,
  FilterableZoneType,
  ItemInstance
} from '$lib/game/core/types';
import { generatePawns } from '$lib/game/entities/Pawns';
import { pawnService } from '$lib/game/services/PawnService';
import { generateRace } from '$lib/game/core/Race';
import { itemService } from '$lib/game/services/ItemService';
import { buildingService } from '$lib/game/services/BuildingService';
import { workService } from '$lib/game/services/WorkService';
import {
  syncPawnInventoryWithGlobal,
  syncAllPawnInventories,
  getEquipmentSlot
} from '$lib/game/core/PawnEquipment';
import { calculatePawnStats } from '$lib/game/entities/Pawns';
import { triggerEvent } from '$lib/stores/eventStore';
import { generateWorld } from '$lib/game/world/WorldGenerator';
import { resourceGeneratorService } from '$lib/game/services/ResourceGeneratorService';
import { entityService } from '$lib/game/services/EntityService';
import { loadSave, scheduleSave, deleteSave } from './saveManager';
import { clearActivityLog } from './Log';
import { applyDevWorld, devSpawnLooseItems, devDestroyAllItems } from '$lib/game/dev/devWorld';
import { TICKS_PER_SECOND, ticksFromSeconds } from '$lib/game/core/time';
import { rng, freshSeed } from '$lib/game/core/rng';
import { resetUnreachableJobs } from '$lib/game/systems/PawnStateMachine';

// ===== CONFIGURATION =====
/** Real-time duration of one simulation tick at 1× speed (ms). */
const TICK_DURATION_MS = 1000 / TICKS_PER_SECOND;
/**
 * Upper bound on how many sim steps a single animation frame may run. Caps the
 * cost per frame (each step ≈ 1 ms) so fast-forward / catch-up after a hitch
 * can never spiral and lock up the render thread. Backlog beyond this is dropped.
 */
const MAX_STEPS_PER_FRAME = 16;

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
  race: generateRace(),
  pawns: [],
  worldMap: [], // generated lazily in the async init (D7)
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

  // One-time migration: absorb any unstored dropped items that are physically sitting on
  // stockpile tiles but were never credited (saves predating the trigger-based absorption).
  {
    const unabsorbed = (state.droppedItems ?? []).filter((d) => {
      if (d.stored) return false;
      return (state.designations ?? {})[`${d.x},${d.y}`] === 'stockpile';
    });
    for (const drop of unabsorbed) {
      state = absorbDropIfOnStockpileTile(state, drop.id);
    }
  }

  return state;
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
        if (!tile?.walkable) continue;
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

// Speed is applied live by stepSimulation via gameSpeedValue (kept in sync by the
// gameSpeed store subscription below), so changing speed needs no loop restart.
function setGameSpeed(speed: number) {
  gameSpeed.set(speed);
} // ===== WORLD REGEN =====
function regenWorld(seed?: number, dev = false, itemQty = 500) {
  const s = (seed !== undefined ? seed : freshSeed()) >>> 0 || 1;
  // P0-2/D7: regenerating the world starts a fresh deterministic run — persist the seed,
  // reseed the sim RNG, and clear stale module-level unreachable-job memory.
  rng.reseed(s);
  resetUnreachableJobs();
  const newWorld = generateWorld(240, 160, s);
  resourceGeneratorService.generateResources(newWorld, s);
  // Set the engine's worldMap before seeding entities (resolveWorld reads it). The updateWithSave
  // below routes through the engine (P-2 single writer) and sets worldMap again, so this is belt-
  // and-braces — there is no longer a store read-back to race against.
  gameEngine.patchWorldMap(newWorld);
  if (dev) {
    updateWithSave((state) =>
      entityService.seedInitialEntities(
        applyDevWorld({ ...state, seed: s, worldMap: newWorld, mobs: [] }, itemQty)
      )
    );
  } else {
    updateWithSave((state) =>
      entityService.seedInitialEntities({ ...state, seed: s, worldMap: newWorld, mobs: [] })
    );
  }
}

// ===== ITEM MANAGEMENT =====
function consumeGlobalItem(itemId: string, quantity: number = 1) {
  updateWithSave((state) => {
    const current = (state.stockpile ?? {})[itemId] ?? 0;
    if (current < quantity) return state;
    return consumeFromStockpiles(state, { [itemId]: quantity });
  });
}

function addItem(itemId: string, amount: number) {
  updateWithSave((state) => addToStockpileZone(state, null, { [itemId]: amount }));
}

/**
 * Equip a physical item sitting on a tile onto a pawn (ADR-016-faithful): the item moves off the
 * ground into `pawn.equipment[slot]`, and whatever was in that slot drops back onto the pawn's tile
 * as a loose item — no item enters/leaves the world. Slot is derived from the item via
 * `getEquipmentSlot`. Preserves the drop's `ItemInstance` (durability) if it carries one.
 */
function equipItemFromTile(pawnId: string, dropId: string) {
  updateWithSave((state) => {
    const drop = (state.droppedItems ?? []).find((d) => d.id === dropId);
    if (!drop) return state;
    const item = itemService.getItemById(drop.resourceId);
    if (!item) return state;
    const slot = getEquipmentSlot(item);
    if (!slot) return state;
    const pawnIdx = state.pawns.findIndex((p) => p.id === pawnId);
    if (pawnIdx < 0) return state;
    const pawn = state.pawns[pawnIdx];

    const instance: ItemInstance = drop.instance ?? {
      instanceId: `${item.id}-${pawnId}-${Date.now()}`,
      itemId: item.id,
      durability: item.maxDurability ?? 100
    };
    const px = pawn.position?.x ?? drop.x;
    const py = pawn.position?.y ?? drop.y;

    // Take one unit off the tile (instanced = qty 1 → gone; bulk stack → decrement).
    let drops = (state.droppedItems ?? [])
      .map((d) => (d.id === dropId ? { ...d, quantity: d.quantity - 1 } : d))
      .filter((d) => d.quantity > 0);

    // The previously worn item (if any) drops back onto the pawn's tile.
    const prev = pawn.equipment[slot];
    if (prev) {
      drops = [
        ...drops,
        {
          id: `unequip-${prev.instanceId}-${Date.now()}`,
          resourceId: prev.itemId,
          x: px,
          y: py,
          quantity: 1,
          stored: false,
          instance: prev
        }
      ];
    }

    const pawns = state.pawns.map((p, i) =>
      i === pawnIdx ? { ...p, equipment: { ...p.equipment, [slot]: instance } } : p
    );
    return { ...state, pawns, droppedItems: drops, stockpile: aggregateFromDrops(drops) };
  });
}

/** Dev timesaver (ADR-016-faithful): spawn `amount` of EVERY item as physical LOOSE drops on
 *  the ground around the colony — no world regen, no wipe, no write to the derived stockpile
 *  aggregate. Haulers carry them into stockpiles like anything gathered. The engine syncs from
 *  the store next tick. */
function devSpawnAllItems(amount = 500) {
  updateWithSave((state) => devSpawnLooseItems(state, amount));
}

/** Dev inverse: destroy every physical item (all drops + carried inventory). */
function devClearAllItems() {
  updateWithSave((state) => devDestroyAllItems(state));
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
  set({ ...initialGameState, seed, worldMap: world });
  console.info('[GameState] Game reset to initial state.');
}

/**
 * Completely nuke all persisted state and reload the page.
 *
 * Stops the auto-turn timer FIRST so no in-flight turn can
 * re-write localStorage after the wipe but before reload.
 * Then removes every fantasia4x-* key so nothing stale survives.
 */
function wipeAndReload() {
  // 1. Kill timers — no more saves can fire after this point.
  stopAutoTurns();

  if (browser) {
    // 2. Hide the game immediately so the old map doesn't flash while we
    //    delete the save.  The loading screen will show until reload completes.
    storeReady.set(false);
    // 3. Clear dev log files (fire-and-forget; don't block reload on failure).
    fetch('/api/logs', { method: 'DELETE', keepalive: true }).catch(() => {
      /* silently ignore */
    });
    // 4. Delete the IndexedDB save (also clears any lingering localStorage keys).
    deleteSave().finally(() => {
      // 5. Reload — no need to mutate the store here since we're reloading.
      location.reload();
    });
  }
}

// ===== STORE READY FLAG =====
/**
 * Becomes `true` once the persisted save has been loaded and applied to the
 * store. Use this to gate rendering so components never see the ephemeral
 * freshly-generated world that lives in `initialGameState`.
 */
export const storeReady = writable(false);

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
};

// ===== INITIALIZE GAMEENGINE =====
const gameStateManager = new GameStateManager(initialGameState);
gameEngine.setGameStateManager(gameStateManager);
console.log('[GameState] GameEngine initialized with GameStateManager');

// ===== ASYNC SAVE LOAD + MIGRATIONS =====
/** Resolves when the persisted save (if any) has been loaded and applied. */
export const savedStateReady: Promise<void> = (async () => {
  if (!browser) return;

  const savedState = await loadSave();
  let baseState = savedState ? applyMigrations(savedState) : initialGameState;

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
    const migratedWorld = generateWorld(240, 160, baseState.seed);
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

  // Pawn generation / backfill
  if (!baseState.pawns || baseState.pawns.length === 0) {
    baseState = { ...baseState, pawns: generatePawns(baseState.race, 5) };
  } else if (baseState.pawns.length < 5) {
    const extra = generatePawns(baseState.race, 5 - baseState.pawns.length).map((p, i) => ({
      ...p,
      id: `pawn-extra-${i}-${Date.now()}`
    }));
    baseState = { ...baseState, pawns: [...baseState.pawns, ...extra] };
  }

  // Spawn pawns that have no map position yet
  if (baseState.pawns.some((p) => !p.position)) {
    baseState = { ...baseState, pawns: spawnPawnsOnMap(baseState.pawns, baseState.worldMap) };
  }

  // Give any pawn without a work assignment explicit default labor settings — ONCE.
  // (Replaces the old per-tick workService.ensureBasicWorkAssignments — see D4.)
  baseState = workService.ensureDefaultWorkAssignments(baseState);

  // Seed an initial mob/animal population so entities are visible on the map
  // immediately on load (no-op if the save already has live entities).
  baseState = entityService.seedInitialEntities(baseState);

  // Push loaded state into the store and sync GameEngine
  set(baseState);
  gameEngine.setGameStateManager(new GameStateManager(baseState));
  // Signal that the real state is now in the store — unblock rendering.
  storeReady.set(true);
})().catch((err) => {
  console.error('[GameState] Failed to load save, starting fresh:', err);
  // Still unblock rendering so the app doesn't stay stuck on the loading screen.
  storeReady.set(true);
});

// Create control stores — seed pause from sessionStorage so HMR doesn't unpause.
const _pausedSeed =
  typeof sessionStorage !== 'undefined'
    ? sessionStorage.getItem('fantasia4x-paused') === 'true'
    : false;
const isPaused = writable(_pausedSeed);
isPaused.subscribe((v) => {
  if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('fantasia4x-paused', String(v));
});
const gameSpeed = writable(1);

// Subscribe to keep track of current speed value
gameSpeed.subscribe((value) => {
  gameSpeedValue = value;
});

// ===== EXPORTS =====
export const gameState = {
  subscribe,
  set,
  update,
  updateWithSave,
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
  devSpawnAllItems,
  devClearAllItems,
  consumeGlobalItem,
  resetGame,
  wipeAndReload,
  regenWorld
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
export const currentTurn = derived(gameState, ($gameState) => $gameState.turn);
export const currentRace = derived(gameState, ($gameState) => $gameState.race);
export const pawnStats = derived(gameState, ($gameState) => $gameState.pawnStats || {});

/** Items currently in the colony stockpile, enriched from the items database, sorted by name. */
export const currentStockpile = derived(gameState, ($gameState) =>
  Object.entries($gameState.stockpile ?? {})
    .filter(([, amount]) => amount > 0)
    .map(([id, amount]) => {
      const def = itemService.getItemById(id);
      return { id, name: def?.name ?? id, amount, color: def?.color, emoji: def?.emoji };
    })
    .sort((a, b) => a.name.localeCompare(b.name))
);

/** Per-zone inventory view, derived from the `stored` DroppedItems on each zone's tiles. */
export const currentStockpileZones = derived(gameState, ($gameState) => {
  const drops = $gameState.droppedItems ?? [];
  return ($gameState.stockpileZones ?? []).map((zone) => {
    const tileSet = new Set(zone.tiles);
    const inv: Record<string, number> = {};
    for (const d of drops) {
      if (!d.stored || (d.quantity ?? 0) <= 0) continue;
      if (!tileSet.has(`${d.x},${d.y}`)) continue;
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
        .sort((a, b) => a.name.localeCompare(b.name))
    };
  });
});
