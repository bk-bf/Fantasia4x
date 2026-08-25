import { browser } from '$app/environment';
import { writable, derived, get } from 'svelte/store';
import { GameStateManager } from '$lib/game/core/state/GameStateManager';
import {
  consumeFromStockpiles,
  addToStockpileZone,
  GENERAL_ZONE_ID,
  computeAggregate,
  colonyStock,
  availableAggregateFromDrops,
  absorbDropIfOnStockpileTile
} from '$lib/game/core/state/stockpile';
import { gameEngine } from '$lib/game/systems/GameEngineImpl';
import './simLogBridge';
import { simWorkerBridge, USE_SIM_WORKER } from '$lib/game/sim/simWorkerClient';
import { applySimCommand } from '$lib/game/sim/commands';
import type { SimCommand } from '$lib/game/sim/simProtocol';
import type {
  GameState,
  Pawn,
  WorldTile,
  FilterableZoneType,
  DesignationType
} from '$lib/game/core/types';
import { generateColonyPawns, generateWorldKin } from '$lib/game/entities/Pawns';
import { pawnService } from '$lib/game/services/PawnService';
import {
  generateCulture,
  generateCulturePool,
  generateCultureRelations
} from '$lib/game/core/gen/culture';
import { generateKingdomPool, generateKingdomRelations } from '$lib/game/core/gen/kingdom';
import { kingdomService } from '$lib/game/services/KingdomService';
import { socialService } from '$lib/game/services/SocialService';
import { itemService } from '$lib/game/services/ItemService';
import { buildingService } from '$lib/game/services/BuildingService';
import { workService } from '$lib/game/services/WorkService';
import { calculatePawnStats } from '$lib/game/systems/pawnDisplayStats';
import { generateWorld } from '$lib/game/world/WorldGenerator';
import {
  customizeMenuPreviewWorld,
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
import { defaultGameSpeed, autoPauseOnThreat, autoPauseOnDeath, debugMode } from './uiPrefs';
import { clearActivityLog, reloadActivityLogForActiveSave, activityLog } from './Log';
import { applyDevWorld } from '$lib/game/debug/devWorld';
import { TICKS_PER_SECOND, ticksFromSeconds } from '$lib/game/core/util/time';
import { clearTileDeltas } from '$lib/game/core/state/tileDeltas';
import { rng, freshSeed } from '$lib/game/core/util/rng';
import { resetUnreachableJobs } from '$lib/game/systems/PawnStateMachine';
import { isSpawnableTile } from '$lib/game/core/defs/terrains';

const TICK_DURATION_MS = 1000 / TICKS_PER_SECOND;
const MAX_STEPS_PER_FRAME = 4;

let gameSpeedValue = 1;
let simRunning = false;
let simAccumulatorMs = 0;

export const initialGameState: GameState = {
  seed: freshSeed(),
  turn: ticksFromSeconds(100),
  culture: generateCulture(),
  culturePool: [],
  cultureRelations: [],
  pawns: [],
  worldMap: [],
  season: 'spring',
  seasonDay: 0,
  weather: {
    type: 'clear',
    intensity: 0,
    precip: 'dry',
    windLevel: 'calm',
    turnsRemaining: 0,
    windTurns: 0,
    wind: 0.15
  },
  buildingCounts: {},
  buildings: [],
  stockpile: {},
  stockpileZones: [
    {
      id: 'zone-general',
      name: 'Colony Stockpile',
      tiles: [],
      filter: { allowedCategories: [], blockedItems: [] },
      inventory: {}
    }
  ],
  designations: {},
  jobs: [],
  maxPopulation: 1,
  availableResearch: [],
  completedResearch: [],
  currentResearch: undefined,
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

function applyMigrations(state: GameState): GameState {
  if (typeof state.seed !== 'number') state.seed = freshSeed();
  if (!state.season) state.season = 'spring';
  if (typeof state.seasonDay !== 'number') state.seasonDay = 0;
  if (!state.weather) state.weather = { type: 'clear', intensity: 0, turnsRemaining: 0 };
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
  if (
    state.designationZoneId &&
    Object.values(state.designationZoneId).some((v) => typeof v === 'string')
  ) {
    const typeById = new Map(
      (state.zoneInstances ?? []).map((z) => [z.id, z.type as DesignationType])
    );
    const STANDING: DesignationType[] = ['stockpile', 'grow', 'restrict'];
    const layered: Record<string, Partial<Record<DesignationType, string>>> = {};
    for (const [k, v] of Object.entries(state.designationZoneId)) {
      if (typeof v === 'string') {
        const t =
          typeById.get(v) ?? (state.zoneTiles?.[k] ?? []).find((zt) => STANDING.includes(zt));
        if (t) layered[k] = { [t]: v };
      } else if (v) {
        layered[k] = v;
      }
    }
    state = { ...state, designationZoneId: layered };
  }
  if ((!state.zoneInstances || state.zoneInstances.length === 0) && state.zoneFilters) {
    const instances: import('$lib/game/core/types').ZoneInstance[] = [];
    const zoneIdMap: Record<string, Partial<Record<DesignationType, string>>> = {
      ...(state.designationZoneId ?? {})
    };
    for (const [typeKey, filter] of Object.entries(state.zoneFilters)) {
      const type = typeKey as FilterableZoneType;
      if (!filter) continue;
      const tilesOfType = Object.entries(state.designations ?? {}).filter(([, t]) => t === type);
      if (tilesOfType.length > 0 || filter.allowedCategories.length > 0) {
        const id = `${type}-migrated`;
        const label = `${type.charAt(0).toUpperCase()}${type.slice(1)} 1`;
        instances.push({ id, type, label, filter });
        for (const [key] of tilesOfType) {
          zoneIdMap[key] = { ...zoneIdMap[key], [type]: id };
        }
      }
    }
    if (instances.length > 0) {
      state = { ...state, zoneInstances: instances, designationZoneId: zoneIdMap };
    }
  }
  {
    const ZONE_DESIGNATIONS: DesignationType[] = ['drink', 'wash'];
    const STANDING_ZONES: DesignationType[] = ['stockpile', 'grow', 'restrict'];
    const activeTypes = new Set((state.zoneInstances ?? []).map((z) => z.type as DesignationType));
    const validIds = new Set((state.zoneInstances ?? []).map((z) => z.id));
    let changed = false;
    const zoneTiles: Record<string, DesignationType[]> = {};
    for (const [k, types] of Object.entries(state.zoneTiles ?? {})) {
      const kept = types.filter((t) => !STANDING_ZONES.includes(t) || activeTypes.has(t));
      if (kept.length !== types.length) changed = true;
      if (kept.length > 0) zoneTiles[k] = kept;
    }
    const designations: Record<string, DesignationType> = { ...(state.designations ?? {}) };
    for (const [k, t] of Object.entries(designations)) {
      if (ZONE_DESIGNATIONS.includes(t) && !activeTypes.has(t)) {
        delete designations[k];
        changed = true;
      }
    }
    const zoneIdMap: Record<string, Partial<Record<DesignationType, string>>> = {};
    for (const [k, layers] of Object.entries(state.designationZoneId ?? {})) {
      const next: Partial<Record<DesignationType, string>> = {};
      for (const [t, id] of Object.entries(layers ?? {})) {
        if (validIds.has(id)) next[t as DesignationType] = id;
        else changed = true;
      }
      if (Object.keys(next).length > 0) zoneIdMap[k] = next;
    }
    if (changed) state = { ...state, zoneTiles, designations, designationZoneId: zoneIdMap };
  }
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
  {
    const dropAgg = colonyStock(state.droppedItems, state.buildings);
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
      stockpile: colonyStock(state.droppedItems, state.buildings)
    };
  }

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

export function ensureCulturePool(state: GameState): GameState {
  if (state.culturePool && state.culturePool.length > 0) {
    if (!state.cultureRelations || state.cultureRelations.length === 0) {
      return { ...state, cultureRelations: generateCultureRelations(state.culturePool) };
    }
    return state;
  }

  const legacyAndPopulated = state.pawns && state.pawns.length > 0;
  if (legacyAndPopulated) {
    const home = normalizeLegacyCulture(state.culture);
    const pawns = state.pawns.map((p) => ({
      ...p,
      cultureId: p.cultureId ?? home.id,
      cultureName: p.cultureName ?? home.name
    }));
    return { ...state, culture: home, culturePool: [home], cultureRelations: [], pawns };
  }

  const culturePool = generateCulturePool();
  return {
    ...state,
    culture: culturePool[0],
    culturePool,
    cultureRelations: generateCultureRelations(culturePool)
  };
}

export function ensureKingdomPool(state: GameState): GameState {
  if (state.kingdoms && state.kingdoms.length > 0) {
    if (!state.kingdomRelations || state.kingdomRelations.length === 0) {
      return {
        ...state,
        kingdomRelations: generateKingdomRelations(
          state.kingdoms,
          state.cultureRelations,
          state.culture.id
        )
      };
    }
    return state;
  }
  const kingdoms = generateKingdomPool(state.culturePool);
  return {
    ...state,
    kingdoms,
    kingdomRelations: generateKingdomRelations(kingdoms, state.cultureRelations, state.culture.id)
  };
}

function normalizeLegacyCulture(culture: GameState['culture']): GameState['culture'] {
  if (culture?.lore?.description && culture.archetype) return { ...culture, discovered: true };
  const fresh = generateCulture();
  return {
    ...fresh,
    id: culture?.id && culture.id !== 'player' ? culture.id : fresh.id,
    name: culture?.name ?? fresh.name,
    statRanges: culture?.statRanges ?? fresh.statRanges,
    physicalTraits: culture?.physicalTraits ?? fresh.physicalTraits,
    guaranteedTraits: culture?.guaranteedTraits ?? fresh.guaranteedTraits,
    culturalTraitPool: culture?.culturalTraitPool ?? fresh.culturalTraitPool,
    population: culture?.population ?? 0,
    discovered: true
  };
}

export function markColonyCulturesDiscovered(state: GameState): GameState {
  const counts = new Map<string, number>();
  const firstColonist = new Map<string, string>();
  for (const p of state.pawns) {
    if (!p.cultureId) continue;
    counts.set(p.cultureId, (counts.get(p.cultureId) ?? 0) + 1);
    if (p.isAlive !== false && !firstColonist.has(p.cultureId)) {
      firstColonist.set(p.cultureId, p.name);
    }
  }
  const culturePool = state.culturePool.map((r) => ({
    ...r,
    discovered: r.discovered || counts.has(r.id),
    discoveredVia: r.discoveredVia ?? firstColonist.get(r.id),
    population: counts.get(r.id) ?? r.population
  }));
  return {
    ...state,
    culturePool,
    culture: culturePool.find((r) => r.id === state.culture?.id) ?? culturePool[0]
  };
}

export function discoverCulture(state: GameState, cultureId: string): GameState {
  if (!state.culturePool.some((r) => r.id === cultureId && !r.discovered)) return state;
  return {
    ...state,
    culturePool: state.culturePool.map((r) => (r.id === cultureId ? { ...r, discovered: true } : r))
  };
}

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
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
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

export function spawnPawnsOnMap(pawns: Pawn[], worldMap: WorldTile[][]): Pawn[] {
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

function startAutoTurns() {
  simRunning = true;
  simAccumulatorMs = 0;
}

function stopAutoTurns() {
  simRunning = false;
  simAccumulatorMs = 0;
}

function stepSimulation(frameDtMs: number) {
  if (USE_SIM_WORKER) return;
  if (!browser || !simRunning) return;
  if (get(isPaused)) {
    simAccumulatorMs = 0;
    return;
  }

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

export function requestThreatPause() {
  if (!get(autoPauseOnThreat)) return;
  isPaused.set(true);
  if (USE_SIM_WORKER) simWorkerBridge.setPaused(true);
}

export function requestDeathPause() {
  if (!get(autoPauseOnDeath)) return;
  isPaused.set(true);
  if (USE_SIM_WORKER) simWorkerBridge.setPaused(true);
}

function setGameSpeed(speed: number) {
  gameSpeed.set(speed);
  if (USE_SIM_WORKER) simWorkerBridge.setSpeed(speed);
}
export const worldGenRev = writable(0);

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
    gameEngine.setGameStateManager(new GameStateManager(state));
  }
}

let currentMapSize = { w: 500, h: 500 };
function setMapSize(w: number, h: number) {
  currentMapSize = { w: Math.max(8, w | 0), h: Math.max(8, h | 0) };
}
function getMapSize() {
  return currentMapSize;
}

function regenWorld(seed?: number, dev = false, itemQty = 500, preview = false) {
  const s = (seed !== undefined ? seed : freshSeed()) >>> 0 || 1;
  rng.reseed(s);
  resetUnreachableJobs();
  const newWorld = generateWorld(currentMapSize.w, currentMapSize.h, s);
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

  const colonySize = base.pawns.length || 5;
  let next: GameState = {
    ...base,
    seed: s,
    worldMap: newWorld,
    mobs: [],
    culturePool: [],
    cultureRelations: [],
    kingdoms: [],
    kingdomRelations: [],
    pawns: []
  };
  next = ensureCulturePool(next);
  next = ensureKingdomPool(next);
  const founders = generateColonyPawns(next.culturePool, colonySize, {
    kingdoms: next.kingdoms,
    founders: true
  });
  const worldKin = generateWorldKin(founders, next.culturePool, next.kingdoms ?? []);
  next = { ...next, pawns: spawnPawnsOnMap(founders, newWorld), worldPawns: worldKin };
  next = markColonyCulturesDiscovered(next);
  next = kingdomService.seedKingdomKnowledgeFromPawns(next, next.pawns, false);
  next = socialService.meetColony(next);
  next = socialService.seedFamilyRelationships(next);
  next = workService.ensureDefaultWorkAssignments(next);
  if (dev) next = applyDevWorld(next, itemQty);
  next = entityService.seedInitialEntities(next);
  loadStateIntoWorker(next);
}

function restoreWorld(snapshot: GameState) {
  rng.reseed(snapshot.seed);
  loadStateIntoWorker(snapshot);
}

const MENU_PREVIEW_SEED = 4051283263;
const MENU_PREVIEW_MAP = { w: 161, h: 101 };
function startMenuPreview() {
  if (!browser || !USE_SIM_WORKER) return;
  rng.reseed(MENU_PREVIEW_SEED);
  resetUnreachableJobs();
  const world = generateWorld(MENU_PREVIEW_MAP.w, MENU_PREVIEW_MAP.h, MENU_PREVIEW_SEED, {
    skipResources: true,
    tidyWater: false
  });
  customizeMenuPreviewWorld(world);
  resourceGeneratorService.generateResources(world, MENU_PREVIEW_SEED, {
    exclude: menuPreviewMagicalGroveIds()
  });
  placeMenuPreviewScatteredGroves(world, MENU_PREVIEW_SEED);

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

  previewActive = true;
  gameStore.setSilent(preview);
  gameStore.notify();
  worldGenRev.update((n) => n + 1);

  simWorkerBridge.start();
  simWorkerBridge.init(preview, MENU_PREVIEW_SEED, { preview: true });
  simWorkerBridge.setSpeed(0.5);
  simWorkerBridge.setPaused(false);
  menuPreviewReady.set(true);
}

function consumeGlobalItem(itemId: string, quantity: number = 1) {
  dispatchCommand({ type: 'consumeGlobalItem', payload: { itemId, quantity }, save: true });
}

function addItem(itemId: string, amount: number) {
  dispatchCommand({ type: 'addItem', payload: { itemId, amount }, save: true });
}

function equipItemFromTile(pawnId: string, dropId: string) {
  dispatchCommand({ type: 'equipFromTile', payload: { pawnId, dropId }, save: true });
}

function pickUpItemFromTile(pawnId: string, dropId: string, quantity: number) {
  dispatchCommand({
    type: 'pickUpItemFromTile',
    payload: { pawnId, dropId, quantity },
    save: true
  });
}

function haulTileToStockpile(pawnId: string, x: number, y: number) {
  dispatchCommand({ type: 'haulTileToStockpile', payload: { pawnId, x, y }, save: true });
}

function devSpawnAllItems(amount = 500) {
  dispatchCommand({ type: 'devSpawnAllItems', payload: { amount }, save: true });
}

function devClearAllItems() {
  dispatchCommand({ type: 'devClearAllItems', payload: {}, save: true });
}

function resetGame() {
  deleteSave().catch(console.error);
  clearActivityLog();
  const seed = freshSeed();
  rng.reseed(seed);
  resetUnreachableJobs();
  const world = generateWorld(240, 160, seed);
  let fresh: GameState = {
    ...initialGameState,
    seed,
    worldMap: world,
    pawns: [],
    culturePool: [],
    cultureRelations: [],
    kingdoms: [],
    kingdomRelations: []
  };
  fresh = ensureCulturePool(fresh);
  fresh = ensureKingdomPool(fresh);
  fresh = {
    ...fresh,
    pawns: generateColonyPawns(fresh.culturePool, 5, { kingdoms: fresh.kingdoms, founders: true })
  };
  const resetWorldKin = generateWorldKin(fresh.pawns, fresh.culturePool, fresh.kingdoms ?? []);
  fresh = { ...fresh, pawns: spawnPawnsOnMap(fresh.pawns, world), worldPawns: resetWorldKin };
  fresh = markColonyCulturesDiscovered(fresh);
  fresh = kingdomService.seedKingdomKnowledgeFromPawns(fresh, fresh.pawns, false);
  fresh = socialService.meetColony(fresh);
  fresh = socialService.seedFamilyRelationships(fresh);
  fresh = workService.ensureDefaultWorkAssignments(fresh);
  fresh = entityService.seedInitialEntities(fresh);
  loadStateIntoWorker(fresh);
  console.info('[GameState] Game reset to initial state.');
}

async function loadScenarioPreset(presetId: string): Promise<boolean> {
  const [{ buildScenario }, { getScenarioPreset }] = await Promise.all([
    import('$lib/game/headless/Scenario'),
    import('$lib/game/headless/scenarios/presets')
  ]);
  const preset = getScenarioPreset(presetId);
  if (!preset) return false;
  clearActivityLog();
  mintActiveSave();
  setActiveCommitted(true);
  resetUnreachableJobs();
  const state = buildScenario(preset.spec);
  loadStateIntoWorker(state);
  console.info(`[GameState] Loaded scenario preset '${presetId}'.`);
  return true;
}

export const storeReady = writable(false);

export const menuPreviewReady = writable(false);

export const menuPreviewRendered = writable(false);

let previewActive = false;

export const rendererReady = writable(false);

export const bootReveal = writable(false);

export const loadingStatus = writable('Initializing…');

export type AppPhase = 'menu' | 'game';

const FORCE_MENU_KEY = 'f4x:forceMenu';
const forceMenuOnce = browser && sessionStorage.getItem(FORCE_MENU_KEY) === '1';
if (forceMenuOnce) sessionStorage.removeItem(FORCE_MENU_KEY);

const MENU_ENABLED =
  browser &&
  (forceMenuOnce ||
    (import.meta.env.VITE_DEBUG_MODE !== 'true' && import.meta.env.VITE_PROFILER !== 'true'));

export const appPhase = writable<AppPhase>(MENU_ENABLED ? 'menu' : 'game');

let _resolveBootGate!: () => void;
const bootGate = new Promise<void>((resolve) => {
  _resolveBootGate = resolve;
});
let _bootMode: 'new' | 'load' = 'load';
const bootMode = (): 'new' | 'load' => _bootMode;

if (!MENU_ENABLED) _resolveBootGate();

function startGame(mode: 'new' | 'load', saveId?: string) {
  _bootMode = mode;
  if (mode === 'load' && saveId) setActiveSave(saveId);
  else {
    mintActiveSave();
    setActiveCommitted(false);
  }
  menuPreviewReady.set(false);
  if (previewActive && USE_SIM_WORKER) simWorkerBridge.setPaused(true);
  appPhase.set('game');
  _resolveBootGate();
}

async function saveGame(): Promise<void> {
  await saveSnapshotNow(get(gameState) as GameState, get(activityLog));
}

async function overwriteSave(id: string): Promise<void> {
  await overwriteSnapshotNow(id, get(gameState) as GameState, get(activityLog));
}

function flushSave(): Promise<void> {
  return saveGameNow(get(gameState) as GameState);
}

async function goToMainMenu(): Promise<void> {
  await flushSave();
  if (browser) {
    sessionStorage.setItem(FORCE_MENU_KEY, '1');
    location.reload();
  }
}

export const WORKER_WARMUP_MS = import.meta.env.VITE_HMR === 'true' ? 0 : 2500;

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

function createGameStore(initial: GameState) {
  let value = initial;
  const subscribers = new Set<(v: GameState) => void>();
  return {
    subscribe(run: (v: GameState) => void) {
      subscribers.add(run);
      run(value);
      return () => subscribers.delete(run);
    },
    setSilent(v: GameState) {
      value = v;
    },
    notify() {
      subscribers.forEach((run) => run(value));
    }
  };
}

const gameStore = createGameStore(initialGameState);
const { subscribe } = gameStore;

const set = (v: GameState) => gameEngine.applyCommand(() => v, false);
const update = (updater: (v: GameState) => GameState) => gameEngine.applyCommand(updater, false);
const updateWithSave = (updater: (state: GameState) => GameState) =>
  gameEngine.applyCommand(updater, true);

const dispatchCommand = (cmd: SimCommand) => {
  if (USE_SIM_WORKER) {
    simWorkerBridge.command(cmd);
    return;
  }
  gameEngine.applyCommand((s) => applySimCommand(s, cmd), cmd.save ?? false);
};

const commitFromEngine = (state: GameState, save: boolean) => {
  gameStore.setSilent(state);
  if (save) scheduleSave(state);
  gameStore.notify();
};

const pushFromEngine = (state: GameState, flush: boolean) => {
  gameStore.setSilent(state);
  scheduleSave(state);
  if (flush) gameStore.notify();
  clearTileDeltas();
};

const gameStateManager = new GameStateManager(initialGameState);
gameEngine.setGameStateManager(gameStateManager);
gameEngine.setOutputSink(pushFromEngine);
gameEngine.setCommitSink(commitFromEngine);
console.log('[GameState] GameEngine initialized with GameStateManager');

export const savedStateReady: Promise<void> = (async () => {
  if (!browser) return;
  loadingStatus.set('Loading world…');

  if (import.meta.env.VITE_PROFILER === 'true') {
    const { buildProfilerScenario } = await import('$lib/game/debug/profilerScenario');
    const scenario = buildProfilerScenario();
    rng.reseed(scenario.seed);
    resetUnreachableJobs();
    set(scenario);
    gameEngine.setGameStateManager(new GameStateManager(scenario));
    setGameSpeed(4);
    storeReady.set(true);

    const autorun = import.meta.env.VITE_PROFILER_AUTORUN === 'true';
    if (autorun) {
      unpauseGame();
      bootReveal.set(true);
    }
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

  await bootGate;
  loadingStatus.set('Loading world…');

  const savedState = bootMode() === 'new' ? null : await loadSave();
  ensureActiveSave();
  let baseState = savedState ? applyMigrations(savedState) : initialGameState;
  if (bootMode() === 'new') baseState = { ...baseState, seed: freshSeed() };

  await reloadActivityLogForActiveSave();

  rng.reseed(baseState.seed);
  resetUnreachableJobs();

  if (
    !baseState.worldMap ||
    baseState.worldMap.length === 0 ||
    !baseState.worldMap[0]?.[0]?.terrainType
  ) {
    const genW = bootMode() === 'new' ? currentMapSize.w : 240;
    const genH = bootMode() === 'new' ? currentMapSize.h : 160;
    const migratedWorld = generateWorld(genW, genH, baseState.seed);
    baseState = { ...baseState, worldMap: migratedWorld };
  } else if (!baseState.worldMap[0]?.[1]?.discovered) {
    baseState = {
      ...baseState,
      worldMap: baseState.worldMap.map((row) =>
        row.map((tile) => (tile.discovered ? tile : { ...tile, discovered: true }))
      )
    };
  }

  if (
    baseState.worldMap.length > 0 &&
    baseState.worldMap.every((row) =>
      row.every((tile) => Object.keys(tile.resources ?? {}).length === 0)
    )
  ) {
    resourceGeneratorService.generateResources(baseState.worldMap, Date.now());
  }

  baseState = ensureCulturePool(baseState);

  baseState = ensureKingdomPool(baseState);

  const freshColony = !savedState && (!baseState.pawns || baseState.pawns.length === 0);
  if (freshColony) {
    const founders = generateColonyPawns(baseState.culturePool, 5, {
      kingdoms: baseState.kingdoms,
      founders: true
    });
    const worldKin = generateWorldKin(founders, baseState.culturePool, baseState.kingdoms ?? []);
    baseState = { ...baseState, pawns: founders, worldPawns: worldKin };
  }

  if (baseState.pawns.some((p) => !p.position)) {
    baseState = { ...baseState, pawns: spawnPawnsOnMap(baseState.pawns, baseState.worldMap) };
  }

  baseState = markColonyCulturesDiscovered(baseState);

  if (freshColony) {
    baseState = kingdomService.seedKingdomKnowledgeFromPawns(baseState, baseState.pawns, false);
  }

  baseState = socialService.meetColony(baseState);
  baseState = socialService.seedFamilyRelationships(baseState);

  baseState = workService.ensureDefaultWorkAssignments(baseState);

  baseState = entityService.seedInitialEntities(baseState);

  set(baseState);
  gameEngine.setGameStateManager(new GameStateManager(baseState));
  loadingStatus.set('Starting renderer…');
  storeReady.set(true);
})().catch((err) => {
  console.error('[GameState] Failed to load save, starting fresh:', err);
  storeReady.set(true);
});

const isPaused = writable(true);
const gameSpeed = writable(1);

if (USE_SIM_WORKER) {
  isPaused.subscribe((p) => simWorkerBridge.setPaused(p));
}
debugMode.subscribe((on) => simWorkerBridge.setVerbose(on));
gameSpeed.subscribe((value) => {
  gameSpeedValue = value;
});

export const gameState = {
  subscribe,
  set,
  update,
  updateWithSave,
  command: dispatchCommand,
  pushFromEngine,
  commitFromEngine,
  isPaused: { subscribe: isPaused.subscribe },
  gameSpeed: { subscribe: gameSpeed.subscribe },

  startAutoTurns,
  stopAutoTurns,
  stepSimulation,
  pauseGame,
  unpauseGame,
  togglePause,
  setGameSpeed,

  addItem,
  equipItemFromTile,
  pickUpItemFromTile,
  haulTileToStockpile,
  devSpawnAllItems,
  devClearAllItems,
  consumeGlobalItem,
  resetGame,
  startGame,
  saveGame,
  overwriteSave,
  flushSave,
  goToMainMenu,
  regenWorld,
  restoreWorld,
  setMapSize,
  getMapSize,
  loadScenarioPreset
};

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopAutoTurns();
  });
}

export const isGameOver = derived(gameState, ($gameState) => ($gameState.pawns?.length ?? 0) === 0);

export const currentTurn = derived(gameState, ($gameState) => $gameState.turn);
export const currentSeason = derived(gameState, ($gameState) => $gameState.season ?? 'spring');
export const currentWeather = derived(gameState, ($gameState) => $gameState.weather);
export const currentAvgTemperature = derived(gameState, ($gameState) => $gameState.avgTemperature);
export const currentCulture = derived(gameState, ($gameState) => $gameState.culture);
export const culturePool = derived(gameState, ($gameState) => $gameState.culturePool ?? []);
export const cultureRelations = derived(
  gameState,
  ($gameState) => $gameState.cultureRelations ?? []
);
export const discoveredCultures = derived(gameState, ($gameState) =>
  ($gameState.culturePool ?? []).filter((r) => r.discovered)
);
export const kingdoms = derived(gameState, ($gameState) => $gameState.kingdoms ?? []);
export const kingdomRelations = derived(
  gameState,
  ($gameState) => $gameState.kingdomRelations ?? []
);
export const discoveredKingdoms = derived(gameState, ($gameState) =>
  ($gameState.kingdoms ?? []).filter((k) => k.discovered)
);
export const pawnStats = derived(gameState, ($gameState) => $gameState.pawnStats || {});

export const currentStockpile = derived(gameState, ($gameState) => {
  const drops = $gameState.droppedItems ?? [];
  const namedStored = drops.filter(
    (d) => d.stored && !d.reservedFor && (d.quantity ?? 0) > 0 && d.name != null
  );
  const namedCount: Record<string, number> = {};
  for (const d of namedStored)
    namedCount[d.resourceId] = (namedCount[d.resourceId] ?? 0) + d.quantity;

  const rows = Object.entries(availableAggregateFromDrops(drops))
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

export const currentStockpileZones = derived(gameState, ($gameState) => {
  const drops = $gameState.droppedItems ?? [];
  return ($gameState.stockpileZones ?? []).map((zone) => {
    const tileSet = new Set(zone.tiles);
    const inv: Record<string, number> = {};
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

if (USE_SIM_WORKER) {
  simWorkerBridge.onState = (s, flush) => {
    gameStore.setSilent(s);
    if (flush) {
      gameStore.notify();
      if (!previewActive) scheduleSave(s);
    }
  };
  simWorkerBridge.onFullState = (s) => {
    if (!previewActive) scheduleSave(s);
  };

  if (MENU_ENABLED) startMenuPreview();

  savedStateReady.then(() => {
    previewActive = false;
    gameSpeed.set(get(defaultGameSpeed));
    simWorkerBridge.start();
    const st = get(gameState) as GameState;
    simWorkerBridge.init(st, st.seed);
    simWorkerBridge.setSpeed(gameSpeedValue);
    simWorkerBridge.setPaused(get(isPaused));
    console.info('[SIM-WORKER] cutover active — sim now runs in the worker.');
  });
}
