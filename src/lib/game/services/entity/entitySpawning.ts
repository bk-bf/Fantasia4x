// Entity spawning — initial seeding + periodic DF-style spawner, biome-weighted and capped.
// Extracted from EntityService (P-4). The former `this.idCounter` is now a module-level counter.
import type { GameState, Mob, MobState, EntityStats, EntityNeeds } from '../../core/types';
import { CREATURES, type CreatureDefinition } from '../../core/Creatures';
import { getAmbientLight } from '../EnvironmentService';
import { calcMaxStamina } from '../../entities/Pawns';
import { createBodyPlanLimbs } from '../../systems/Combat';
import { DEFAULT_PLAN } from '../../core/BodyParts';
import { rng } from '../../core/rng';
import { findNearbyWalkable } from './entityHelpers';
import { isSpawnableTile } from '../../core/Terrains';
import { resourceObjectService } from '../ResourceObjectService';
import { markTileDirty } from '../../core/tileDeltas';
import {
  SPAWN_CHECK_INTERVAL,
  BASE_SPAWN_CHANCE,
  NIGHT_SPAWN_MULT,
  NIGHT_THRESHOLD,
  EDGE_BUFFER,
  MIN_PAWN_DISTANCE,
  MAX_HOSTILE,
  MAX_NEUTRAL,
  HUNGER_EAT_THRESHOLD,
  targetEntityCount,
  populationCaps,
  LAIR_TICK_INTERVAL,
  LAIR_REPOP_CHANCE,
  LAIR_GROW_CHANCE,
  maxLairCount
} from './entityConstants';

let idCounter = 0;

/**
 * Seed the initial wild population. Normal play (no `packsOverride`) scales the count with map AREA
 * via `targetEntityCount` — a 500×500 map seeds ~325 entities — and stops once the total target is
 * reached. The roster is cycled evenly so the species mix is diverse and hostiles stay the minority.
 * An explicit `packsOverride` (profiler/dev) keeps the legacy fixed-pack behaviour + flat caps for
 * benchmark comparability.
 */
export function seedInitialEntities(
  state: GameState,
  packsOverride?: number,
  opts?: { preyOnly?: boolean }
): GameState {
  if ((state.mobs?.length ?? 0) > 0) return state;
  const preyOnly = opts?.preyOnly ?? false;
  // Free-roaming pool EXCLUDES laired hostiles — those come only from their lair tiles (seedLairs).
  // So this area-scaled seeding is now pure wildlife (prey + neutral roamers). The menu-preview's
  // `preyOnly` additionally drops any free-roaming predator so the backdrop never spawns a hunt.
  const dayCreatures = CREATURES.filter(
    (c) => !c.nightOnly && !c.lair && (!preyOnly || !c.predator)
  );
  if (dayCreatures.length === 0) return state;

  const h = state.worldMap.length;
  const w = state.worldMap[0]?.length ?? 0;
  const fixed = packsOverride !== undefined;
  // Total population target (null = no total cap → fixed-pack profiler path runs exactly `packs`).
  const target = fixed ? null : targetEntityCount(w, h);
  const caps = fixed ? { hostile: MAX_HOSTILE, neutral: MAX_NEUTRAL } : populationCaps(w, h);
  // Generous pack count: avg pack ≈ 4, so target/2 packs guarantees the total target is the real
  // limit (we break on it), not the pack count.
  const packs = fixed ? packsOverride! : Math.ceil(target! / 2);

  const seeded: Mob[] = [];
  let hostile = 0;
  let neutral = 0;

  // Guarantee variety: attempt one pack of EACH distinct day creature first (shuffled), then cycle
  // the roster for the remaining slots. Without this, the seeded RNG could pick the same few
  // creatures every time, so a species like wolf would "never spawn anymore".
  const shuffled = [...dayCreatures].sort(() => rng.random() - 0.5);
  const picks: CreatureDefinition[] = Array.from(
    { length: packs },
    (_, i) => shuffled[i % shuffled.length]
  );

  for (const def of picks) {
    if (target !== null && seeded.length >= target) break;
    if (def.entityClass === 'mob' && hostile >= caps.hostile) continue;
    if (def.entityClass === 'animal' && neutral >= caps.neutral) continue;

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

  // Laired hostiles: one bound pack per lair tile (skipped on the fixed/profiler path for benchmark
  // stability, and on the prey-only menu preview). These are the SOLE source of laired hostiles.
  const lairMobs = fixed || preyOnly ? [] : seedLairs(state);

  return { ...state, mobs: [...(state.mobs ?? []), ...seeded, ...lairMobs] };
}

/** Set of resource ids flagged `lair: true`. */
function lairResourceIds(): Set<string> {
  return new Set(
    resourceObjectService
      .getAll()
      .filter((r) => r.lair)
      .map((r) => r.id)
  );
}

/** Day creatures bound to each lair id (nightOnly excluded — they spawn via the periodic spawner). */
function creaturesByLair(lairIds: Set<string>): Map<string, CreatureDefinition[]> {
  const byLair = new Map<string, CreatureDefinition[]>();
  for (const c of CREATURES) {
    if (c.lair && lairIds.has(c.lair) && !c.nightOnly) {
      const arr = byLair.get(c.lair);
      if (arr) arr.push(c);
      else byLair.set(c.lair, [c]);
    }
  }
  return byLair;
}

/** Spawn one bound pack of `def` anchored at (lairX,lairY) with the given lairId. The first mob sits
 *  on the lair tile, the rest spread to adjacent spawnable land. Every member is leashed to the lair. */
function spawnPackAt(
  state: GameState,
  def: CreatureDefinition,
  lairX: number,
  lairY: number,
  lairId: string
): Mob[] {
  const map = state.worldMap;
  const range = def.lairRange ?? 40;
  const [packMin, packMax] = def.pack;
  const packSize = packMin + Math.floor(rng.random() * (packMax - packMin + 1));
  const out: Mob[] = [];
  for (let i = 0; i < packSize; i++) {
    let tx = lairX;
    let ty = lairY;
    if (i > 0) {
      const cand = findNearbyWalkable(state, lairX, lairY);
      if (cand && isSpawnableTile(map[cand.y]?.[cand.x])) {
        tx = cand.x;
        ty = cand.y;
      }
    }
    const mob = makeMob(def, tx, ty, state.turn);
    mob.lairId = lairId;
    mob.lairX = lairX;
    mob.lairY = lairY;
    mob.lairRange = range;
    out.push(mob);
  }
  return out;
}

/**
 * Seed one bound pack at every lair tile (resources.jsonc `lair: true`). Each pack is anchored to its
 * lair (stable `lairId`, `lairX/Y`, `lairRange` from the creature def) and stays leashed there — see
 * the territory checks in entityAI.stepHostile. A mob NEVER adopts another lair, so packs can't drift
 * onto a neighbour's lair and reclaim/extend it.
 */
function seedLairs(state: GameState): Mob[] {
  const lairIds = lairResourceIds();
  if (lairIds.size === 0) return [];
  const byLair = creaturesByLair(lairIds);
  const map = state.worldMap;
  const h = map.length;
  const w = map[0]?.length ?? 0;
  const seeded: Mob[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const res = map[y]?.[x]?.resources;
      if (!res) continue;
      let lairResId: string | undefined;
      for (const k of Object.keys(res)) {
        if (lairIds.has(k)) {
          lairResId = k;
          break;
        }
      }
      if (!lairResId) continue;
      const candidates = byLair.get(lairResId);
      if (!candidates || candidates.length === 0) continue;
      const def = candidates[Math.floor(rng.random() * candidates.length)];
      seeded.push(...spawnPackAt(state, def, x, y, `lair-${lairResId}-${x}-${y}`));
    }
  }
  return seeded;
}

/**
 * Lair lifecycle, ticked once per in-game day (LAIR_TICK_INTERVAL). Two slow, RNG-paced behaviours:
 *  • REPOPULATE — an emptied (pack fully wiped) but UN-destroyed lair re-occupies after ~weeks.
 *  • GROW — while below the world cap (maxLairCount), a new lair grows on a random eligible grass/bush
 *    tile after ~weeks; never on the same tile as before. Destroying a lair tile stops both for it.
 */
export function tickLairs(state: GameState): GameState {
  if (state.turn % LAIR_TICK_INTERVAL !== 0) return state;
  const lairIds = lairResourceIds();
  if (lairIds.size === 0) return state;
  const map = state.worldMap;
  const h = map.length;
  const w = map[0]?.length ?? 0;
  if (w === 0) return state;

  // Daily full-map scan for live lair tiles (resource amount > 0) — amortised, cheap per-tick.
  const lairTiles: { x: number; y: number; resId: string; lairId: string }[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const res = map[y][x].resources;
      if (!res) continue;
      for (const k of Object.keys(res)) {
        if (lairIds.has(k) && (res[k] ?? 0) > 0) {
          lairTiles.push({ x, y, resId: k, lairId: `lair-${k}-${x}-${y}` });
          break;
        }
      }
    }
  }

  // Alive bound-mob count per lairId.
  const aliveByLair = new Map<string, number>();
  for (const m of state.mobs ?? []) {
    if (m.lairId && m.isAlive !== false && m.state !== 'Corpse') {
      aliveByLair.set(m.lairId, (aliveByLair.get(m.lairId) ?? 0) + 1);
    }
  }

  const byLair = creaturesByLair(lairIds);
  const newMobs: Mob[] = [];

  // Repopulate emptied lairs.
  for (const lt of lairTiles) {
    if ((aliveByLair.get(lt.lairId) ?? 0) > 0) continue;
    if (rng.random() >= LAIR_REPOP_CHANCE) continue;
    const cands = byLair.get(lt.resId);
    if (!cands || cands.length === 0) continue;
    const def = cands[Math.floor(rng.random() * cands.length)];
    newMobs.push(...spawnPackAt(state, def, lt.x, lt.y, lt.lairId));
  }

  // Grow a new lair toward the world cap.
  if (lairTiles.length < maxLairCount(w, h) && rng.random() < LAIR_GROW_CHANCE) {
    const placed = tryPlaceNewLair(state);
    if (placed) {
      const cands = byLair.get(placed.resId);
      if (cands && cands.length > 0) {
        const def = cands[Math.floor(rng.random() * cands.length)];
        newMobs.push(
          ...spawnPackAt(
            state,
            def,
            placed.x,
            placed.y,
            `lair-${placed.resId}-${placed.x}-${placed.y}`
          )
        );
      }
    }
  }

  if (newMobs.length === 0) return state; // worldMap mutations (if any) shipped via markTileDirty
  return { ...state, mobs: [...(state.mobs ?? []), ...newMobs] };
}

/** Try to place ONE new lair on a random eligible grass/bush tile (a lair def's own spawn subterrains).
 *  Mutates the tile's resources IN PLACE + ships a tile delta (mirrors harvest.ts). Returns the placed
 *  tile, or null if no clean spot was found in a bounded number of tries. */
function tryPlaceNewLair(state: GameState): { x: number; y: number; resId: string } | null {
  const lairDefs = resourceObjectService.getAll().filter((r) => r.lair);
  if (lairDefs.length === 0) return null;
  const def = lairDefs[Math.floor(rng.random() * lairDefs.length)];
  const subs = Object.keys(def.spawn?.subterrains ?? {});
  if (subs.length === 0) return null;
  const map = state.worldMap;
  const h = map.length;
  const w = map[0]?.length ?? 0;
  for (let attempt = 0; attempt < 60; attempt++) {
    const x = EDGE_BUFFER + Math.floor(rng.random() * (w - 2 * EDGE_BUFFER));
    const y = EDGE_BUFFER + Math.floor(rng.random() * (h - 2 * EDGE_BUFFER));
    const tile = map[y]?.[x];
    if (!tile) continue;
    if (!subs.includes(tile.subType)) continue;
    if (!isSpawnableTile(tile)) continue;
    const res = tile.resources;
    // Keep it clean: don't grow onto a tile already carrying a resource (incl. another lair).
    if (res && Object.keys(res).some((k) => (res[k] ?? 0) > 0)) continue;
    tile.resources = { ...(tile.resources ?? {}), [def.id]: 1 };
    markTileDirty(y, x, tile); // lairs are walkable, so no walkability patch needed
    return { x, y, resId: def.id };
  }
  return null;
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

export function spawnEntities(state: GameState, opts?: { preyOnly?: boolean }): GameState {
  // Only roll on the spawn-check cadence to keep per-tick cost ~zero.
  if (state.turn % SPAWN_CHECK_INTERVAL !== 0) return state;

  const mobs = state.mobs ?? [];
  const isNight = getAmbientLight(state.turn) < NIGHT_THRESHOLD;
  const chance = BASE_SPAWN_CHANCE * (isNight ? NIGHT_SPAWN_MULT : 1);
  if (rng.random() > chance) return state;

  const live = mobs.filter((m) => m.state !== 'Corpse');
  const hostileCount = live.filter((m) => m.entityClass === 'mob').length;
  const neutralCount = live.filter((m) => m.entityClass === 'animal').length;

  // Area-scaled caps from the live map. The total guard keeps the population near the map's target
  // instead of letting both per-class caps stack to a larger combined total.
  const caps = populationCaps(state.worldMap[0]?.length ?? 0, state.worldMap.length);
  if (live.length >= caps.total) return state;

  const def = pickSpawnCreature(isNight, opts?.preyOnly ?? false);
  if (!def) return state;
  if (def.entityClass === 'mob' && hostileCount >= caps.hostile) return state;
  if (def.entityClass === 'animal' && neutralCount >= caps.neutral) return state;

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

export function pickSpawnCreature(
  isNight: boolean,
  preyOnly = false
): CreatureDefinition | undefined {
  // Laired hostiles never spawn via the periodic spawner — their population is fixed by lair tiles.
  // `preyOnly` (menu preview) further drops predators so the backdrop stays a peaceful graze.
  const pool = CREATURES.filter(
    (c) => !c.lair && (!c.nightOnly || isNight) && (!preyOnly || !c.predator)
  );
  if (pool.length === 0) return undefined;
  return pool[Math.floor(rng.random() * pool.length)];
}

/** Any mountain tile within Chebyshev radius `r` of (x, y)? Used to keep mountain-edge grazers near
 *  the peaks they belong to (mountains themselves aren't spawnable). */
function isNearMountain(map: GameState['worldMap'], x: number, y: number, r: number): boolean {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (map[y + dy]?.[x + dx]?.terrainType === 'mountain') return true;
    }
  }
  return false;
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
    if (!tile) continue;
    if (def.spawnsInMountain) {
      // Mountain dwellers (incorporeal wraiths): any mountain tile, even non-walkable rock.
      if (tile.terrainType !== 'mountain') continue;
    } else {
      // Hard rule: creatures only spawn on walkable forest/plains/swamp land — never water/mountain.
      if (!isSpawnableTile(tile)) continue;
      // Mountain-edge grazers: must also be within range of a mountain tile.
      if (
        def.maxMountainDistance !== undefined &&
        !isNearMountain(map, x, y, def.maxMountainDistance)
      )
        continue;
    }

    const weight = def.biomeWeights[tile.terrainType] ?? 0;
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
  // bodyScale (default 1.0) enlarges the creature's blood/health POOL so a big beast soaks a whole
  // squad's hits before bleeding out — the durability half of the big-creature fix (the shared body-part
  // HP table is intentionally NOT rescaled; naturalArmor + this larger pool carry it). RANGED note: this
  // is the same field that softly scales its natural-weapon damage in Combat.attackerProfile.
  const bodyScale = def.bodyScale ?? 1;
  const scaledHealth = Math.round(def.stats.health * bodyScale);
  const stats: EntityStats = {
    strength: def.stats.str,
    dexterity: def.stats.dex,
    perception: def.stats.per,
    constitution: def.stats.con,
    intelligence: def.behaviour === 'passive' ? 4 : 8,
    charisma: 5
  };
  // ENGINE-PERFORMANCE-II §S5: STAGGER initial hunger across mobs. Spawning every mob at hunger 0 made
  // them all cross HUNGER_EAT_THRESHOLD on the SAME tick → a synchronized hunt→combat wave that collapsed
  // TPS (the engagement-wave spike). A uniform spread over [0, threshold) desyncs the first hunt: each
  // mob reaches the threshold at a different time, so hunts (and thus combat) smear across the fill
  // window instead of firing all at once. Deterministic (seeded rng). Fatigue gets a smaller spread so
  // sleep/wake cycles desync too.
  const needs: EntityNeeds = {
    hunger: rng.random() * HUNGER_EAT_THRESHOLD,
    fatigue: rng.random() * 20,
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
    health: scaledHealth,
    maxHealth: scaledHealth,
    state: initialState,
    stateSince: turn,
    path: [],
    pathIndex: 0,
    needs,
    conditions: [],
    stats,
    // ── Full health/survival parity with Pawn ────────────────────────────────────────
    bloodVolume: scaledHealth,
    maxBloodVolume: scaledHealth,
    isAlive: true,
    transientConditions: [],
    skills: {},
    stamina: calcMaxStamina(stats),
    maxStamina: calcMaxStamina(stats),
    // Anatomy from the creature's body plan (limbmap.jsonc — wolves get paws + a tail, not fingers),
    // with each part's HP scaled by bodyScale (bigger beast = bigger, tougher limbs).
    limbs: createBodyPlanLimbs(def.limbMap ?? DEFAULT_PLAN, bodyScale),
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
