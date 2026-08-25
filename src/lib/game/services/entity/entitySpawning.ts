import type { GameState, Mob, MobState, EntityStats, EntityNeeds } from '../../core/types';
import { CREATURES, type CreatureDefinition } from '../../core/defs/creatures';
import { getAmbientLight } from '../EnvironmentService';
import { calcMaxStamina } from '../../entities/Pawns';
import { createBodyPlanLimbs } from '../../systems/Combat';
import { DEFAULT_PLAN } from '../../core/defs/bodyParts';
import { TRAIT_DATABASE } from '../../core/gen/culture';
import { creatureAptitudes } from '../../core/rules/body/aptitudes';
import { rng } from '../../core/util/rng';
import { getLootPool, drawLoadout, rollCondition, validateLootItemIds } from '../../core/defs/loot';
import { generateBossName } from '../../core/gen/bossNames';
import { itemService } from '../ItemService';
import type { PawnEquipment, ItemInstance } from '../../core/types';
import { findNearbyWalkable } from './entityHelpers';
import { isSpawnableTile } from '../../core/defs/terrains';
import { resourceObjectService } from '../ResourceObjectService';
import { markTileDirty } from '../../core/state/tileDeltas';
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
  LAIR_BREED_WEEK_DAYS,
  LAIR_BREED_BASE,
  LAIR_MAX_POP,
  MIN_LAIR_SPACING,
  LAIR_GROW_CHANCE,
  LAIR_ESCALATION_CHANCE,
  LAIR_MAX_ESCALATION,
  maxLairCount,
  STARTING_BUBBLE_RADIUS,
  STARTING_BUBBLE_TURNS,
  SEED_HUNGER_GRACE
} from './entityConstants';
import { chebyshev } from '../../core/util/distance';
import { getCreatureById } from '../../core/defs/creatures';

let idCounter = 0;

export function resetMobIdCounter(): void {
  idCounter = 0;
}

export function inStartingBubble(state: GameState, x: number, y: number): boolean {
  if (state.turn >= STARTING_BUBBLE_TURNS) return false;
  const r2 = STARTING_BUBBLE_RADIUS * STARTING_BUBBLE_RADIUS;
  let anyPawnPlaced = false;
  for (const p of state.pawns ?? []) {
    const pos = p.position;
    if (!pos) continue;
    anyPawnPlaced = true;
    const dx = x - pos.x;
    const dy = y - pos.y;
    if (dx * dx + dy * dy <= r2) return true;
  }
  if (anyPawnPlaced) return false;
  const map = state.worldMap;
  const cx = Math.floor((map[0]?.length ?? 0) / 2);
  const cy = Math.floor(map.length / 2);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r2;
}

const HERD_ANCHOR_RANGE = 6;

const MENU_HERD_CORNERS: ReadonlyArray<readonly [number, number]> = [
  [0.31, 0.34],
  [0.69, 0.34],
  [0.31, 0.66],
  [0.69, 0.66]
];
const MENU_HERD_CORNER_JITTER = 0.03;
const MENU_HERD_SIZE_MIN = 6;
const MENU_HERD_SIZE_MAX = 9;

const MENU_SCATTER_COLS = 3;
const MENU_SCATTER_ROWS = 2;
const MENU_SCATTER_REGION = { x0: 0.28, x1: 0.72, y0: 0.26, y1: 0.74 };
const MENU_SCATTER_JITTER = 0.06;
const MENU_SCATTER_HERD_MIN = 3;
const MENU_SCATTER_HERD_MAX = 5;

function pushHerd(
  state: GameState,
  seeded: Mob[],
  def: CreatureDefinition,
  origin: { x: number; y: number },
  size: number
): void {
  const map = state.worldMap;
  const anchorId = `herd-${origin.x}-${origin.y}`;
  for (let i = 0; i < size; i++) {
    let tile = origin;
    if (i > 0) {
      const cand = findNearbyWalkable(state, origin.x, origin.y);
      if (cand && isSpawnableTile(map[cand.y]?.[cand.x])) tile = cand;
    }
    const mob = makeMob(def, tile.x, tile.y, state.turn);
    mob.lairId = anchorId;
    mob.lairX = origin.x;
    mob.lairY = origin.y;
    mob.lairRange = HERD_ANCHOR_RANGE;
    seeded.push(mob);
  }
}

function nearestSpawnable(
  state: GameState,
  cx: number,
  cy: number
): { x: number; y: number } | null {
  const map = state.worldMap;
  for (let r = 0; r <= 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (isSpawnableTile(map[y]?.[x])) return { x, y };
      }
    }
  }
  return null;
}

function seedMenuHerds(state: GameState, dayCreatures: CreatureDefinition[]): GameState {
  const map = state.worldMap;
  const h = map.length;
  const w = map[0]?.length ?? 0;
  if (w === 0 || h === 0 || dayCreatures.length === 0) return state;
  const roster = [...dayCreatures].sort(() => rng.random() - 0.5);
  const seeded: Mob[] = [];
  MENU_HERD_CORNERS.forEach(([fx, fy], corner) => {
    const def = roster[corner % roster.length];
    const jx = (rng.random() * 2 - 1) * MENU_HERD_CORNER_JITTER;
    const jy = (rng.random() * 2 - 1) * MENU_HERD_CORNER_JITTER;
    const origin = nearestSpawnable(state, Math.round((fx + jx) * w), Math.round((fy + jy) * h));
    if (!origin) return;
    const size =
      MENU_HERD_SIZE_MIN + Math.floor(rng.random() * (MENU_HERD_SIZE_MAX - MENU_HERD_SIZE_MIN + 1));
    pushHerd(state, seeded, def, origin, size);
  });
  return { ...state, mobs: [...(state.mobs ?? []), ...seeded] };
}

function seedMenuHerdsScattered(state: GameState, dayCreatures: CreatureDefinition[]): GameState {
  const map = state.worldMap;
  const h = map.length;
  const w = map[0]?.length ?? 0;
  if (w === 0 || h === 0 || dayCreatures.length === 0) return state;
  const roster = [...dayCreatures].sort(() => rng.random() - 0.5);
  const { x0, x1, y0, y1 } = MENU_SCATTER_REGION;
  const seeded: Mob[] = [];
  let idx = 0;
  for (let r = 0; r < MENU_SCATTER_ROWS; r++) {
    for (let c = 0; c < MENU_SCATTER_COLS; c++) {
      const fx =
        x0 +
        ((c + 0.5) / MENU_SCATTER_COLS) * (x1 - x0) +
        (rng.random() * 2 - 1) * MENU_SCATTER_JITTER;
      const fy =
        y0 +
        ((r + 0.5) / MENU_SCATTER_ROWS) * (y1 - y0) +
        (rng.random() * 2 - 1) * MENU_SCATTER_JITTER;
      const origin = nearestSpawnable(state, Math.round(fx * w), Math.round(fy * h));
      if (!origin) continue;
      const def = roster[idx++ % roster.length];
      const size =
        MENU_SCATTER_HERD_MIN +
        Math.floor(rng.random() * (MENU_SCATTER_HERD_MAX - MENU_SCATTER_HERD_MIN + 1));
      pushHerd(state, seeded, def, origin, size);
    }
  }
  return { ...state, mobs: [...(state.mobs ?? []), ...seeded] };
}

export function seedInitialEntities(
  state: GameState,
  packsOverride?: number,
  opts?: { preyOnly?: boolean; scatter?: boolean }
): GameState {
  if ((state.mobs?.length ?? 0) > 0) return state;
  const preyOnly = opts?.preyOnly ?? false;
  const dayCreatures = CREATURES.filter(
    (c) => !c.nightOnly && !c.lair && (c.tier ?? 2) < 3 && (!preyOnly || !c.predator)
  );
  if (dayCreatures.length === 0) return state;

  if (preyOnly)
    return opts?.scatter
      ? seedMenuHerdsScattered(state, dayCreatures)
      : seedMenuHerds(state, dayCreatures);

  const h = state.worldMap.length;
  const w = state.worldMap[0]?.length ?? 0;
  const fixed = packsOverride !== undefined;
  const target = fixed ? null : targetEntityCount(w, h);
  const caps = fixed ? { hostile: MAX_HOSTILE, neutral: MAX_NEUTRAL } : populationCaps(w, h);
  const packs = fixed ? packsOverride! : Math.ceil(target! / 2);

  const seeded: Mob[] = [];
  let hostile = 0;
  let neutral = 0;

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
      let tile = origin;
      if (i > 0) {
        const cand = findNearbyWalkable(state, origin.x, origin.y);
        if (cand && isSpawnableTile(state.worldMap[cand.y]?.[cand.x])) tile = cand;
      }
      seeded.push(makeMob(def, tile.x, tile.y, state.turn, SEED_HUNGER_GRACE));
      if (def.entityClass === 'mob') hostile++;
      else neutral++;
    }
  }

  const lairMobs = fixed || preyOnly ? [] : seedLairs(state, SEED_HUNGER_GRACE);

  return { ...state, mobs: [...(state.mobs ?? []), ...seeded, ...lairMobs] };
}

function lairResourceIds(): Set<string> {
  return new Set(
    resourceObjectService
      .getAll()
      .filter((r) => r.lair)
      .map((r) => r.id)
  );
}

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

export const TIER_SPAWN_WEIGHT: Record<number, number> = { 1: 1.6, 2: 1.0, 3: 0.3, 4: 0.1, 5: 0 };

export function pickWeightedByTier(pool: CreatureDefinition[]): CreatureDefinition | undefined {
  let total = 0;
  for (const c of pool) total += TIER_SPAWN_WEIGHT[c.tier ?? 2] ?? 1;
  if (total <= 0) return undefined;
  let r = rng.random() * total;
  for (const c of pool) {
    r -= TIER_SPAWN_WEIGHT[c.tier ?? 2] ?? 1;
    if (r <= 0) return c;
  }
  return undefined;
}

export function pickSpeciesThenTier(pool: CreatureDefinition[]): CreatureDefinition | undefined {
  if (pool.length === 0) return undefined;
  const bySpecies = new Map<string, CreatureDefinition[]>();
  for (const c of pool) {
    const key = c.species ?? c.id;
    const arr = bySpecies.get(key);
    if (arr) arr.push(c);
    else bySpecies.set(key, [c]);
  }
  const keys = [...bySpecies.keys()];
  const key = keys[Math.floor(rng.random() * keys.length)];
  return pickWeightedByTier(bySpecies.get(key)!) ?? pickWeightedByTier(pool);
}

export function pickEscalatedCreature(
  pool: CreatureDefinition[],
  level: number,
  bossAlive: boolean
): CreatureDefinition | undefined {
  if (level <= 0 || pool.length === 0) return pickSpeciesThenTier(pool);
  const target = level >= LAIR_MAX_ESCALATION && !bossAlive ? 5 : Math.min(2 + level, 4);
  const bySpecies = new Map<string, CreatureDefinition[]>();
  for (const c of pool) {
    const k = c.species ?? c.id;
    const arr = bySpecies.get(k);
    if (arr) arr.push(c);
    else bySpecies.set(k, [c]);
  }
  const keys = [...bySpecies.keys()];
  const group = bySpecies.get(keys[Math.floor(rng.random() * keys.length)])!;
  let best: CreatureDefinition | undefined;
  let bestScore = Infinity;
  for (const c of group) {
    const t = c.tier ?? 2;
    const score = t <= target ? target - t : t - target + 100;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best ?? pickSpeciesThenTier(pool);
}

function spawnPackAt(
  state: GameState,
  def: CreatureDefinition,
  lairX: number,
  lairY: number,
  lairId: string,
  hungerGrace = 0
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
    const mob = makeMob(def, tx, ty, state.turn, hungerGrace);
    mob.lairId = lairId;
    mob.lairX = lairX;
    mob.lairY = lairY;
    mob.lairRange = range;
    out.push(mob);
  }
  return out;
}

function spawnBoundMobs(
  state: GameState,
  def: CreatureDefinition,
  lairX: number,
  lairY: number,
  lairId: string,
  count: number
): Mob[] {
  const map = state.worldMap;
  const range = def.lairRange ?? 40;
  const out: Mob[] = [];
  for (let i = 0; i < count; i++) {
    let tx = lairX;
    let ty = lairY;
    const cand = findNearbyWalkable(state, lairX, lairY);
    if (cand && isSpawnableTile(map[cand.y]?.[cand.x])) {
      tx = cand.x;
      ty = cand.y;
    }
    const mob = makeMob(def, tx, ty, state.turn, 0);
    mob.lairId = lairId;
    mob.lairX = lairX;
    mob.lairY = lairY;
    mob.lairRange = range;
    out.push(mob);
  }
  return out;
}

function lairWeekSlot(lairId: string): number {
  let h = 0;
  for (let i = 0; i < lairId.length; i++) h = (h * 31 + lairId.charCodeAt(i)) | 0;
  return ((h % LAIR_BREED_WEEK_DAYS) + LAIR_BREED_WEEK_DAYS) % LAIR_BREED_WEEK_DAYS;
}

function seedLairs(state: GameState, hungerGrace = 0): Mob[] {
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
      if (inStartingBubble(state, x, y)) continue;
      const candidates = byLair.get(lairResId);
      if (!candidates || candidates.length === 0) continue;
      const def = pickSpeciesThenTier(candidates);
      if (!def) continue;
      seeded.push(...spawnPackAt(state, def, x, y, `lair-${lairResId}-${x}-${y}`, hungerGrace));
    }
  }
  return seeded;
}

export function tickLairs(state: GameState): GameState {
  if (state.turn % LAIR_TICK_INTERVAL !== 0) return state;
  const lairIds = lairResourceIds();
  if (lairIds.size === 0) return state;
  const map = state.worldMap;
  const h = map.length;
  const w = map[0]?.length ?? 0;
  if (w === 0) return state;

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

  const aliveByLair = new Map<string, number>();
  const bossByLair = new Set<string>();
  for (const m of state.mobs ?? []) {
    if (m.lairId && m.isAlive !== false && m.state !== 'Corpse') {
      aliveByLair.set(m.lairId, (aliveByLair.get(m.lairId) ?? 0) + 1);
      if ((getCreatureById(m.creatureId)?.tier ?? 2) >= 5) bossByLair.add(m.lairId);
    }
  }

  const prevEsc = state.lairEscalation ?? {};
  const esc: Record<string, number> = {};
  for (const lt of lairTiles) {
    if (inStartingBubble(state, lt.x, lt.y)) continue;
    const alive = aliveByLair.get(lt.lairId) ?? 0;
    let level = prevEsc[lt.lairId] ?? 0;
    if (alive === 0) level = 0;
    else if (level < LAIR_MAX_ESCALATION && rng.random() < LAIR_ESCALATION_CHANCE) level += 1;
    if (level > 0) esc[lt.lairId] = level;
  }

  const byLair = creaturesByLair(lairIds);
  const newMobs: Mob[] = [];
  const dayIndex = Math.floor(state.turn / LAIR_TICK_INTERVAL);

  for (const lt of lairTiles) {
    if (inStartingBubble(state, lt.x, lt.y)) continue;
    if (dayIndex % LAIR_BREED_WEEK_DAYS !== lairWeekSlot(lt.lairId)) continue;
    const alive = aliveByLair.get(lt.lairId) ?? 0;
    if (alive >= LAIR_MAX_POP) continue;
    const breedChance = LAIR_BREED_BASE * (1 - alive / LAIR_MAX_POP);
    if (rng.random() >= breedChance) continue;
    const cands = byLair.get(lt.resId);
    if (!cands || cands.length === 0) continue;
    const level = esc[lt.lairId] ?? 0;
    const def =
      level > 0
        ? pickEscalatedCreature(cands, level, bossByLair.has(lt.lairId))
        : pickSpeciesThenTier(cands);
    if (!def) continue;
    newMobs.push(
      ...(alive === 0
        ? spawnPackAt(state, def, lt.x, lt.y, lt.lairId)
        : spawnBoundMobs(state, def, lt.x, lt.y, lt.lairId, 1))
    );
    if ((def.tier ?? 2) >= 5) {
      delete esc[lt.lairId];
      bossByLair.add(lt.lairId);
    }
  }

  if (lairTiles.length < maxLairCount(w, h) && rng.random() < LAIR_GROW_CHANCE) {
    const placed = tryPlaceNewLair(state, lairTiles);
    if (placed) {
      const cands = byLair.get(placed.resId);
      const def = cands && cands.length > 0 ? pickSpeciesThenTier(cands) : undefined;
      if (def) {
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

  const prevKeys = Object.keys(prevEsc);
  const escChanged =
    prevKeys.length !== Object.keys(esc).length ||
    prevKeys.some((k) => prevEsc[k] !== esc[k]) ||
    Object.keys(esc).some((k) => esc[k] !== prevEsc[k]);

  if (newMobs.length === 0 && !escChanged) return state;
  const mobs = newMobs.length ? [...(state.mobs ?? []), ...newMobs] : state.mobs;
  return { ...state, mobs, lairEscalation: esc };
}

function tryPlaceNewLair(
  state: GameState,
  existingLairs: { x: number; y: number }[]
): { x: number; y: number; resId: string } | null {
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
    if (inStartingBubble(state, x, y)) continue;
    if (!subs.includes(tile.subType)) continue;
    if (!isSpawnableTile(tile)) continue;
    if (existingLairs.some((l) => chebyshev(l.x, l.y, x, y) < MIN_LAIR_SPACING)) continue;
    const res = tile.resources;
    if (res && Object.keys(res).some((k) => (res[k] ?? 0) > 0)) continue;
    tile.resources = { ...(tile.resources ?? {}), [def.id]: 1 };
    markTileDirty(y, x, tile);
    return { x, y, resId: def.id };
  }
  return null;
}

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
    const mob = makeMob(def, origin.x, origin.y, state.turn);
    if (def.predator || def.diet === 'carnivore') {
      mob.lairId = `dev-lair-${def.id}-${origin.x}-${origin.y}-t${state.turn}`;
      mob.lairX = origin.x;
      mob.lairY = origin.y;
      mob.lairRange = def.lairRange ?? 40;
    }
    seeded.push(mob);
  }
  if (seeded.length === 0) return state;
  return { ...state, mobs: [...(state.mobs ?? []), ...seeded] };
}

export function devSpawnMobAt(
  state: GameState,
  creatureId: string,
  x: number,
  y: number
): GameState {
  const def = CREATURES.find((c) => c.id === creatureId);
  if (!def) return state;
  const origin =
    state.worldMap?.[y]?.[x]?.walkable !== false ? { x, y } : findNearbyWalkable(state, x, y);
  if (!origin) return state;
  const mob = makeMob(def, origin.x, origin.y, state.turn);
  if (def.predator || def.diet === 'carnivore') {
    mob.lairId = `dev-lair-${def.id}-${origin.x}-${origin.y}-t${state.turn}`;
    mob.lairX = origin.x;
    mob.lairY = origin.y;
    mob.lairRange = def.lairRange ?? 40;
  }
  return { ...state, mobs: [...(state.mobs ?? []), mob] };
}

export function spawnEntities(state: GameState, opts?: { preyOnly?: boolean }): GameState {
  if (state.turn % SPAWN_CHECK_INTERVAL !== 0) return state;

  const mobs = state.mobs ?? [];
  const isNight = getAmbientLight(state.turn) < NIGHT_THRESHOLD;
  const chance = BASE_SPAWN_CHANCE * (isNight ? NIGHT_SPAWN_MULT : 1);
  if (rng.random() > chance) return state;

  const live = mobs.filter((m) => m.state !== 'Corpse');
  const hostileCount = live.filter((m) => m.entityClass === 'mob').length;
  const neutralCount = live.filter((m) => m.entityClass === 'animal').length;

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
  const pool = CREATURES.filter(
    (c) => !c.lair && (!c.nightOnly || isNight) && (!preyOnly || !c.predator)
  );
  if (pool.length === 0) return undefined;
  return pickWeightedByTier(pool);
}

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
      if (tile.terrainType !== 'mountain') continue;
    } else {
      if (!isSpawnableTile(tile)) continue;
      if (
        def.maxMountainDistance !== undefined &&
        !isNearMountain(map, x, y, def.maxMountainDistance)
      )
        continue;
    }

    const weight = def.biomeWeights[tile.terrainType] ?? 0;
    if (weight <= 0) continue;
    if (rng.random() > Math.min(1, weight)) continue;

    const tooClose = pawnPositions.some(
      (p) => Math.abs(p.x - x) < MIN_PAWN_DISTANCE && Math.abs(p.y - y) < MIN_PAWN_DISTANCE
    );
    if (tooClose) continue;

    return { x, y };
  }
  return null;
}

export function makeMob(
  def: CreatureDefinition,
  x: number,
  y: number,
  turn: number,
  hungerGrace = 0
): Mob {
  const initialState: MobState = def.behaviour === 'passive' ? 'Grazing' : 'Wander';
  const sizeClass: 'large' | 'medium' | 'small' =
    def.stats.strength >= 14 ? 'large' : def.stats.strength >= 6 ? 'medium' : 'small';
  const bodyScale = def.bodyScale ?? 1;
  const sr = def.statRanges;
  const stats: EntityStats = {
    strength: rollStatRange(sr?.strength, def.stats.strength),
    dexterity: rollStatRange(sr?.dexterity, def.stats.dexterity),
    perception: rollStatRange(sr?.perception, def.stats.perception),
    constitution: rollStatRange(sr?.constitution, def.stats.constitution),
    intelligence: def.behaviour === 'passive' ? 4 : 8,
    charisma: 5
  };
  const aptitudes = creatureAptitudes(stats);
  const scaledHealth = Math.round(stats.constitution * 5 * bodyScale);
  const naturalArmorOverride = def.naturalArmorRange
    ? Math.round(
        def.naturalArmorRange[0] +
          rng.random() * (def.naturalArmorRange[1] - def.naturalArmorRange[0])
      )
    : undefined;
  const equipment = def.lootPool ? equipFromLootPool(def.lootPool) : undefined;
  const needs: EntityNeeds = {
    hunger: rng.random() * HUNGER_EAT_THRESHOLD - hungerGrace,
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
    age: rng.int(1, 12),
    sex: def.sex === false ? undefined : rng.chance(0.5) ? 'male' : 'female',
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
    aptitudes,
    bloodVolume: scaledHealth,
    maxBloodVolume: scaledHealth,
    isAlive: true,
    transientConditions: [],
    skills: {},
    stamina: calcMaxStamina(stats),
    maxStamina: calcMaxStamina(stats),
    limbs: createBodyPlanLimbs(def.limbMap ?? DEFAULT_PLAN, bodyScale),
    physicalTraits: {
      height: sizeClass === 'large' ? 180 : sizeClass === 'medium' ? 140 : 80,
      weight: sizeClass === 'large' ? 90 : sizeClass === 'medium' ? 50 : 20,
      size: sizeClass
    },
    injuries: [],
    pain: 0,
    aggroRange: def.behaviour === 'aggressive' ? 8 : 3,
    attackCooldown: 0,
    conditionTimers: {},
    ...(def.traits?.length
      ? {
          traits: def.traits.map((id) => TRAIT_DATABASE.find((t) => t.id === id)).filter((t) => !!t)
        }
      : {}),
    ...(naturalArmorOverride !== undefined ? { naturalArmorOverride } : {}),
    ...(equipment ? { equipment } : {}),
    ...(def.tier === 5 ? { name: generateBossName(def.species) } : {})
  };
}

function rollStatRange(range: [number, number] | undefined, fallback: number): number {
  if (!range) return fallback;
  return Math.round(range[0] + rng.random() * (range[1] - range[0]));
}

export function equipFromLootPool(poolId: string): PawnEquipment | undefined {
  const pool = getLootPool(poolId);
  if (!pool) return undefined;
  const pieces = drawLoadout(pool, rng);
  if (pieces.length === 0) return undefined;
  const eq: Record<string, ItemInstance> = {};
  for (const p of pieces) {
    const item = itemService.getItemById(p.itemId);
    if (!item) continue;
    const maxDur = item.maxDurability ?? 100;
    const inst: ItemInstance = {
      instanceId: `loot-${p.itemId}-${idCounter}-${Math.floor(rng.random() * 1e6)}`,
      itemId: p.itemId,
      durability: Math.max(1, Math.round(maxDur * rollCondition(pool, rng))),
      quality: p.quality,
      ...(p.famed ? { famed: true, ...p.famed } : {})
    };
    eq[p.slot] = inst;
  }
  return Object.keys(eq).length > 0 ? (eq as PawnEquipment) : undefined;
}

validateLootItemIds((id) => itemService.getItemById(id) != null);
