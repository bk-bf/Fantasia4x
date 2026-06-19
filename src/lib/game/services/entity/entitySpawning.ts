// Entity spawning — initial seeding + periodic DF-style spawner, biome-weighted and capped.
// Extracted from EntityService (P-4). The former `this.idCounter` is now a module-level counter.
import type { GameState, Mob, MobState, EntityStats, EntityNeeds } from '../../core/types';
import { CREATURES, type CreatureDefinition } from '../../core/Creatures';
import { getAmbientLight } from '../EnvironmentService';
import { calcMaxStamina } from '../../entities/Pawns';
import { createDefaultBodyParts } from '../../systems/Combat';
import { rng } from '../../core/rng';
import { findNearbyWalkable } from './entityHelpers';
import { isSpawnableTile } from '../../core/Terrains';
import {
  SPAWN_CHECK_INTERVAL,
  BASE_SPAWN_CHANCE,
  NIGHT_SPAWN_MULT,
  NIGHT_THRESHOLD,
  EDGE_BUFFER,
  MIN_PAWN_DISTANCE,
  MAX_HOSTILE,
  MAX_NEUTRAL
} from './entityConstants';

let idCounter = 0;

export function seedInitialEntities(state: GameState, packs = 10): GameState {
  if ((state.mobs?.length ?? 0) > 0) return state;
  const dayCreatures = CREATURES.filter((c) => !c.nightOnly);
  if (dayCreatures.length === 0) return state;

  const seeded: Mob[] = [];
  let hostile = 0;
  let neutral = 0;

  // Guarantee variety: attempt one pack of EACH distinct day creature first (shuffled),
  // then fill any remaining slots at random. Without this, the seeded RNG could pick the
  // same few creatures every time, so a species like wolf would "never spawn anymore".
  const shuffled = [...dayCreatures].sort(() => rng.random() - 0.5);
  const picks: CreatureDefinition[] = shuffled.slice(0, packs);
  while (picks.length < packs) {
    picks.push(dayCreatures[Math.floor(rng.random() * dayCreatures.length)]);
  }

  for (const def of picks) {
    if (def.entityClass === 'mob' && hostile >= MAX_HOSTILE) continue;
    if (def.entityClass === 'animal' && neutral >= MAX_NEUTRAL) continue;

    const origin = findSpawnTile(state, def);
    if (!origin) continue;

    const [packMin, packMax] = def.pack;
    const packSize = packMin + Math.floor(rng.random() * (packMax - packMin + 1));
    for (let i = 0; i < packSize; i++) {
      // Pack-mates spread to an adjacent tile only if it's also spawnable, else stack on origin —
      // never spill onto water/mountain.
      let tile = origin;
      if (i > 0) {
        const cand = findNearbyWalkable(state, origin.x, origin.y);
        if (cand && isSpawnableTile(state.worldMap[cand.y]?.[cand.x])) tile = cand;
      }
      seeded.push(makeMob(def, tile.x, tile.y, state.turn));
      if (def.entityClass === 'mob') hostile++;
      else neutral++;
    }
  }

  return { ...state, mobs: [...(state.mobs ?? []), ...seeded] };
}

/**
 * Debug spawner: force `count` mobs onto the map regardless of the current mob count or caps
 * (the in-game debug menu's "spawn entities" button). When `creatureId` is given, spawns that
 * species; otherwise picks day-creatures at random. Each spawn lands on a biome-valid tile away
 * from the colony (falls back to a nearby walkable). Worker-safe — pure transform.
 */
export function devSpawnMobs(state: GameState, count = 5, creatureId?: string): GameState {
  const pool = creatureId
    ? CREATURES.filter((c) => c.id === creatureId)
    : CREATURES.filter((c) => !c.nightOnly);
  if (pool.length === 0) return state;

  const seeded: Mob[] = [];
  for (let i = 0; i < count; i++) {
    const def = pool[Math.floor(rng.random() * pool.length)];
    const origin = findSpawnTile(state, def) ?? findNearbyWalkable(state, 0, 0);
    if (!origin) continue;
    seeded.push(makeMob(def, origin.x, origin.y, state.turn));
  }
  if (seeded.length === 0) return state;
  return { ...state, mobs: [...(state.mobs ?? []), ...seeded] };
}

// ===== SPAWNING =================================================================

export function spawnEntities(state: GameState): GameState {
  // Only roll on the spawn-check cadence to keep per-tick cost ~zero.
  if (state.turn % SPAWN_CHECK_INTERVAL !== 0) return state;

  const mobs = state.mobs ?? [];
  const isNight = getAmbientLight(state.turn) < NIGHT_THRESHOLD;
  const chance = BASE_SPAWN_CHANCE * (isNight ? NIGHT_SPAWN_MULT : 1);
  if (rng.random() > chance) return state;

  const hostileCount = mobs.filter((m) => m.entityClass === 'mob' && m.state !== 'Corpse').length;
  const neutralCount = mobs.filter(
    (m) => m.entityClass === 'animal' && m.state !== 'Corpse'
  ).length;

  const def = pickSpawnCreature(isNight);
  if (!def) return state;
  if (def.entityClass === 'mob' && hostileCount >= MAX_HOSTILE) return state;
  if (def.entityClass === 'animal' && neutralCount >= MAX_NEUTRAL) return state;

  const origin = findSpawnTile(state, def);
  if (!origin) return state;

  const [packMin, packMax] = def.pack;
  const packSize = packMin + Math.floor(rng.random() * (packMax - packMin + 1));
  const newMobs: Mob[] = [];
  for (let i = 0; i < packSize; i++) {
    // Pack-mates spread to an adjacent tile, but only if it's also spawnable — otherwise they stack
    // on the (already-validated) origin rather than spilling onto water/mountain.
    let tile = origin;
    if (i > 0) {
      const cand = findNearbyWalkable(state, origin.x, origin.y);
      if (cand && isSpawnableTile(state.worldMap[cand.y]?.[cand.x])) tile = cand;
    }
    newMobs.push(makeMob(def, tile.x, tile.y, state.turn));
  }

  return { ...state, mobs: [...mobs, ...newMobs] };
}

export function pickSpawnCreature(isNight: boolean): CreatureDefinition | undefined {
  const pool = CREATURES.filter((c) => !c.nightOnly || isNight);
  if (pool.length === 0) return undefined;
  return pool[Math.floor(rng.random() * pool.length)];
}

export function findSpawnTile(
  state: GameState,
  def: CreatureDefinition
): { x: number; y: number } | null {
  const map = state.worldMap;
  const h = map.length;
  const w = map[0]?.length ?? 0;
  if (w === 0 || h === 0) return null;

  const pawnPositions = state.pawns.filter((p) => p.position).map((p) => p.position!);

  for (let attempt = 0; attempt < 40; attempt++) {
    const x = EDGE_BUFFER + Math.floor(rng.random() * (w - 2 * EDGE_BUFFER));
    const y = EDGE_BUFFER + Math.floor(rng.random() * (h - 2 * EDGE_BUFFER));
    const tile = map[y]?.[x];
    // Hard rule: creatures only spawn on walkable forest/plains/swamp land — never water/mountain.
    if (!isSpawnableTile(tile)) continue;

    const weight = def.biomeWeights[tile!.terrainType] ?? 0;
    if (weight <= 0) continue;
    // Probabilistic accept by biome weight (max weight 1.2 → clamp).
    if (rng.random() > Math.min(1, weight)) continue;

    // Keep spawns away from the colony.
    const tooClose = pawnPositions.some(
      (p) => Math.abs(p.x - x) < MIN_PAWN_DISTANCE && Math.abs(p.y - y) < MIN_PAWN_DISTANCE
    );
    if (tooClose) continue;

    return { x, y };
  }
  return null;
}

export function makeMob(def: CreatureDefinition, x: number, y: number, turn: number): Mob {
  const initialState: MobState = def.behaviour === 'passive' ? 'Grazing' : 'Wander';
  const sizeClass: 'large' | 'medium' | 'small' =
    def.stats.str >= 14 ? 'large' : def.stats.str >= 6 ? 'medium' : 'small';
  const stats: EntityStats = {
    strength: def.stats.str,
    dexterity: def.stats.dex,
    perception: def.stats.per,
    constitution: def.stats.con,
    intelligence: def.behaviour === 'passive' ? 4 : 8,
    charisma: 5
  };
  const needs: EntityNeeds = {
    hunger: 0,
    fatigue: 0,
    sleep: 0,
    lastSleep: turn,
    lastMeal: turn
  };
  return {
    id: `mob-${def.id}-${turn}-${idCounter}`,
    debugId: idCounter++,
    creatureId: def.id,
    entityClass: def.entityClass,
    x,
    y,
    health: def.stats.health,
    maxHealth: def.stats.health,
    state: initialState,
    stateSince: turn,
    path: [],
    pathIndex: 0,
    needs,
    conditions: [],
    stats,
    // ── Full health/survival parity with Pawn ────────────────────────────────────────
    bloodVolume: def.stats.health,
    maxBloodVolume: def.stats.health,
    isAlive: true,
    transientConditions: [],
    skills: {},
    stamina: calcMaxStamina(stats),
    maxStamina: calcMaxStamina(stats),
    limbs: [
      {
        id: 'head',
        health: 100,
        isMissing: false,
        bleedRate: 0,
        parts: createDefaultBodyParts('head')
      },
      {
        id: 'torso',
        health: 100,
        isMissing: false,
        bleedRate: 0,
        parts: createDefaultBodyParts('torso')
      },
      {
        id: 'left_arm',
        health: 100,
        isMissing: false,
        bleedRate: 0,
        parts: createDefaultBodyParts('left_arm')
      },
      {
        id: 'right_arm',
        health: 100,
        isMissing: false,
        bleedRate: 0,
        parts: createDefaultBodyParts('right_arm')
      },
      {
        id: 'left_leg',
        health: 100,
        isMissing: false,
        bleedRate: 0,
        parts: createDefaultBodyParts('left_leg')
      },
      {
        id: 'right_leg',
        health: 100,
        isMissing: false,
        bleedRate: 0,
        parts: createDefaultBodyParts('right_leg')
      }
    ],
    // ── Combat & stat parity with Pawn ───────────────────────────────────────────
    // CreatureDefinition has no explicit size; derive a size class from strength
    // (bear str 22 → large, wolf 12 → medium, rabbit 1 → small).
    physicalTraits: {
      height: sizeClass === 'large' ? 180 : sizeClass === 'medium' ? 140 : 80,
      weight: sizeClass === 'large' ? 90 : sizeClass === 'medium' ? 50 : 20,
      size: sizeClass
    },
    injuries: [],
    pain: 0,
    aggroRange: def.behaviour === 'aggressive' ? 8 : 3,
    attackCooldown: 0,
    conditionTimers: {}
  };
}
