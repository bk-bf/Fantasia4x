import type { GameState, Pawn, WorldTile } from '../types';
import { generateCulture, generateCulturePool, generateCultureRelations } from '../gen/culture';
import { generateKingdomPool, generateKingdomRelations } from '../gen/kingdom';
import { ticksFromSeconds } from '../util/time';
import { freshSeed } from '../util/rng';
import { isSpawnableTile } from '../defs/terrains';

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
