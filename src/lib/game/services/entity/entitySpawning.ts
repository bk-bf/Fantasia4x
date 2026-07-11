// Entity spawning — initial seeding + periodic DF-style spawner, biome-weighted and capped.
// Extracted from EntityService (P-4). The former `this.idCounter` is now a module-level counter.
import type { GameState, Mob, MobState, EntityStats, EntityNeeds } from '../../core/types';
import { CREATURES, type CreatureDefinition } from '../../core/Creatures';
import { getAmbientLight } from '../EnvironmentService';
import { calcMaxStamina } from '../../entities/Pawns';
import { createBodyPlanLimbs } from '../../systems/Combat';
import { DEFAULT_PLAN } from '../../core/BodyParts';
import { TRAIT_DATABASE } from '../../core/Culture';
import { rng } from '../../core/rng';
import { getLootPool, drawLoadout, rollCondition, validateLootItemIds } from '../../core/LootPools';
import { itemService } from '../ItemService';
import type { PawnEquipment, ItemInstance } from '../../core/types';
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
  LAIR_BREED_WEEK_DAYS,
  LAIR_BREED_BASE,
  LAIR_MAX_POP,
  MIN_LAIR_SPACING,
  LAIR_GROW_CHANCE,
  maxLairCount,
  STARTING_BUBBLE_RADIUS,
  STARTING_BUBBLE_TURNS,
  SEED_HUNGER_GRACE
} from './entityConstants';
import { chebyshev } from '../../core/distance';

let idCounter = 0;

/** Opening-game safety bubble: true while (x,y) sits within `STARTING_BUBBLE_RADIUS` of the colony AND
 *  the game is still in its first month. Gates every lair-spawn path (seed / repopulate / grow) so no
 *  den lands on the player's doorstep before they can arm up. Measured against the ACTUAL placed pawns,
 *  not the map centre — on mountainous maps `spawnPawnsOnMap` lands the colony on the nearest walkable
 *  tile, which can be far from the centre, so a centre-anchored bubble would leave the pawns exposed.
 *  Falls back to the map centre only when no pawn has a position yet (e.g. menu preview). Exported for
 *  unit testing. */
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
  // Fallback: no placed pawns — keep the legacy centre-anchored bubble.
  const map = state.worldMap;
  const cx = Math.floor((map[0]?.length ?? 0) / 2);
  const cy = Math.floor(map.length / 2);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r2;
}

// Soft tether radius (tiles, Chebyshev) for a menu-preview prey herd's invisible anchor — small enough
// that each corner herd reads as one tight cluster, large enough that they still graze/wander visibly
// within it. Menu-only (see seedMenuHerds + the leash in entityAI.stepAnimal).
const HERD_ANCHOR_RANGE = 6;

// Menu backdrop wildlife: exactly FOUR medium herds, one tucked into each corner of the on-screen view,
// framing the central title/menu. Corner anchors as map fractions — the menu zooms in 2× and centres on
// the map centre, so the visible window is ≈ x[0.25,0.75] × y[0.27,0.72]; these sit just inside it,
// clear of the central UI. A small per-herd jitter keeps the four off a perfect rectangle (natural).
const MENU_HERD_CORNERS: ReadonlyArray<readonly [number, number]> = [
  [0.31, 0.34], // upper-left
  [0.69, 0.34], // upper-right
  [0.31, 0.66], // lower-left
  [0.69, 0.66] // lower-right
];
const MENU_HERD_CORNER_JITTER = 0.03; // ± map-fraction wobble on each corner anchor
const MENU_HERD_SIZE_MIN = 6; // similar medium herd sizes (animals per corner)
const MENU_HERD_SIZE_MAX = 9;

// MM2 backdrop wildlife: instead of four corner herds, several SMALL herds spread across the CENTRE on a
// jittered grid — so the animals read as scattered through the middle without collapsing into one clump.
const MENU_SCATTER_COLS = 3;
const MENU_SCATTER_ROWS = 2; // 3×2 = 6 spread cluster anchors
const MENU_SCATTER_REGION = { x0: 0.28, x1: 0.72, y0: 0.26, y1: 0.74 }; // central map fractions
const MENU_SCATTER_JITTER = 0.06; // ± map-fraction wobble per anchor (keeps the grid from reading rigid)
const MENU_SCATTER_HERD_MIN = 3; // small clusters
const MENU_SCATTER_HERD_MAX = 5;

/** Spawn a `size`-strong herd of `def` anchored at `origin` (invisible lair ⇒ the leash in stepAnimal
 *  keeps it a cluster). Pack-mates spread to adjacent spawnable tiles. Appends to `seeded`. */
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

/** Nearest spawnable tile to (cx,cy), searched outward in expanding Chebyshev rings (≤12). Used to land
 *  a menu corner anchor on walkable wildlife land even if the exact corner tile is a grove/edge. */
function nearestSpawnable(
  state: GameState,
  cx: number,
  cy: number
): { x: number; y: number } | null {
  const map = state.worldMap;
  for (let r = 0; r <= 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring perimeter only
        const x = cx + dx;
        const y = cy + dy;
        if (isSpawnableTile(map[y]?.[x])) return { x, y };
      }
    }
  }
  return null;
}

/**
 * Seed the menu backdrop's wildlife: four medium herds, one per corner, each anchored (invisible lair)
 * so it stays a tight cluster in its corner (leash in entityAI.stepAnimal). One species per corner from
 * a shuffled prey roster (variety), jittered position + size so it reads as a natural scene rather than
 * four identical blobs. No periodic top-up runs in preview, so this fixed cast persists.
 */
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

/**
 * MM2 backdrop wildlife: several SMALL herds spread across the centre on a jittered grid (see the
 * MENU_SCATTER_* constants) — animals scattered through the middle without forming one big clump. Each
 * cluster is anchored (leash keeps it tight); the spread-out anchors keep the clusters distinct.
 */
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
  opts?: { preyOnly?: boolean; scatter?: boolean }
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

  // MENU-PREVIEW: a hand-framed cast, not the area-scaled wildlife of real play. Default = four corner
  // herds (MM1); `scatter` = several small herds spread across the centre (MM2).
  if (preyOnly)
    return opts?.scatter
      ? seedMenuHerdsScattered(state, dayCreatures)
      : seedMenuHerds(state, dayCreatures);

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
      seeded.push(makeMob(def, tile.x, tile.y, state.turn, SEED_HUNGER_GRACE));
      if (def.entityClass === 'mob') hostile++;
      else neutral++;
    }
  }

  // Laired hostiles: one bound pack per lair tile (skipped on the fixed/profiler path for benchmark
  // stability, and on the prey-only menu preview). These are the SOLE source of laired hostiles.
  const lairMobs = fixed || preyOnly ? [] : seedLairs(state, SEED_HUNGER_GRACE);

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

/** §2e tier spawn rarity: relative pick weight by ladder `tier` (1 = chaff … 5 = boss). Untiered
 *  creatures count as the T2 baseline. **T5 is 0** — a boss NEVER arrives via the ambient spawner or a
 *  fresh den; it is Phase-3 escalation-only (until that lands, bosses exist for dev-spawn/testing). */
export const TIER_SPAWN_WEIGHT: Record<number, number> = { 1: 1.6, 2: 1.0, 3: 0.3, 4: 0.1, 5: 0 };

/** Weighted pick over a creature pool by ladder tier (seeded rng). Returns undefined when the pool is
 *  empty or all-zero-weight (e.g. only bosses). Replaces the old uniform `pool[floor(random*len)]` in
 *  every spawn path, so T1 chaff dominates, elites are rare, and T5 never ambient-spawns. */
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

/** Spawn one bound pack of `def` anchored at (lairX,lairY) with the given lairId. The first mob sits
 *  on the lair tile, the rest spread to adjacent spawnable land. Every member is leashed to the lair. */
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

/** Spawn `count` new hunters bound to an EXISTING lair — used by weekly growth to enlarge a living den.
 *  Unlike a fresh pack, every new hunter spreads to nearby walkable land (the den tile is likely already
 *  occupied by the current pack). */
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

/** Stable per-lair day-of-week slot (0..LAIR_BREED_WEEK_DAYS-1) from a hash of the lair id, so dens breed
 *  on staggered days instead of all firing on one synchronized weekly tick. */
function lairWeekSlot(lairId: string): number {
  let h = 0;
  for (let i = 0; i < lairId.length; i++) h = (h * 31 + lairId.charCodeAt(i)) | 0;
  return ((h % LAIR_BREED_WEEK_DAYS) + LAIR_BREED_WEEK_DAYS) % LAIR_BREED_WEEK_DAYS;
}

/**
 * Seed one bound pack at every lair tile (resources.jsonc `lair: true`). Each pack is anchored to its
 * lair (stable `lairId`, `lairX/Y`, `lairRange` from the creature def) and stays leashed there — see
 * the territory checks in entityAI.stepHostile. A mob NEVER adopts another lair, so packs can't drift
 * onto a neighbour's lair and reclaim/extend it.
 */
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
      // Opening-game bubble: leave doorstep dens dormant (worldgen keeps the resource; no pack yet).
      if (inStartingBubble(state, x, y)) continue;
      const candidates = byLair.get(lairResId);
      if (!candidates || candidates.length === 0) continue;
      const def = pickWeightedByTier(candidates); // §2e tier rarity (T5 never seeds a den)
      if (!def) continue;
      seeded.push(...spawnPackAt(state, def, x, y, `lair-${lairResId}-${x}-${y}`, hungerGrace));
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
  const dayIndex = Math.floor(state.turn / LAIR_TICK_INTERVAL);

  // Breed new hunters. A lair keeps producing its themed hunters on its OWN weekly slot (staggered by a
  // hash of its id, so dens don't all breed on one synchronized tick) regardless of whether the current
  // pack is alive. The weekly chance is DENSITY-SCALED — reliable at an empty/small den, ~0 as it nears
  // LAIR_MAX_POP — so a neglected, well-fed den can creep up toward a real threat while the map as a whole
  // doesn't flood. An emptied den returns as a fresh starter pack; a living one grows by a single hunter.
  for (const lt of lairTiles) {
    if (inStartingBubble(state, lt.x, lt.y)) continue; // stay dormant inside the opening-game bubble
    if (dayIndex % LAIR_BREED_WEEK_DAYS !== lairWeekSlot(lt.lairId)) continue; // not this lair's day
    const alive = aliveByLair.get(lt.lairId) ?? 0;
    if (alive >= LAIR_MAX_POP) continue; // at the per-den ceiling
    const breedChance = LAIR_BREED_BASE * (1 - alive / LAIR_MAX_POP);
    if (rng.random() >= breedChance) continue;
    const cands = byLair.get(lt.resId);
    if (!cands || cands.length === 0) continue;
    const def = pickWeightedByTier(cands); // §2e tier rarity (T5 never breeds ambiently)
    if (!def) continue;
    newMobs.push(
      ...(alive === 0
        ? spawnPackAt(state, def, lt.x, lt.y, lt.lairId)
        : spawnBoundMobs(state, def, lt.x, lt.y, lt.lairId, 1))
    );
  }

  // Grow a NEW lair somewhere on the map (~1/month via LAIR_GROW_CHANCE), toward the world cap and no
  // closer than MIN_LAIR_SPACING to an existing den.
  if (lairTiles.length < maxLairCount(w, h) && rng.random() < LAIR_GROW_CHANCE) {
    const placed = tryPlaceNewLair(state, lairTiles);
    if (placed) {
      const cands = byLair.get(placed.resId);
      const def = cands && cands.length > 0 ? pickWeightedByTier(cands) : undefined; // §2e tier rarity
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

  if (newMobs.length === 0) return state; // worldMap mutations (if any) shipped via markTileDirty
  return { ...state, mobs: [...(state.mobs ?? []), ...newMobs] };
}

/** Try to place ONE new lair on a random eligible grass/bush tile (a lair def's own spawn subterrains).
 *  Mutates the tile's resources IN PLACE + ships a tile delta (mirrors harvest.ts). Returns the placed
 *  tile, or null if no clean spot was found in a bounded number of tries. */
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
    if (inStartingBubble(state, x, y)) continue; // no new dens on the doorstep during the first month
    if (!subs.includes(tile.subType)) continue;
    if (!isSpawnableTile(tile)) continue;
    // Spacing: never grow a den within MIN_LAIR_SPACING (Chebyshev) of an existing one — no clusters.
    if (existingLairs.some((l) => chebyshev(l.x, l.y, x, y) < MIN_LAIR_SPACING)) continue;
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
  return pickWeightedByTier(pool); // §2e tier rarity: T1 chaff common, elites rare, T5 never
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

export function makeMob(
  def: CreatureDefinition,
  x: number,
  y: number,
  turn: number,
  hungerGrace = 0
): Mob {
  const initialState: MobState = def.behaviour === 'passive' ? 'Grazing' : 'Wander';
  const sizeClass: 'large' | 'medium' | 'small' =
    def.stats.str >= 14 ? 'large' : def.stats.str >= 6 ? 'medium' : 'small';
  // bodyScale (default 1.0) enlarges the creature's blood/health POOL so a big beast soaks a whole
  // squad's hits before bleeding out — the durability half of the big-creature fix (the shared body-part
  // HP table is intentionally NOT rescaled; naturalArmor + this larger pool carry it). RANGED note: this
  // is the same field that softly scales its natural-weapon damage in Combat.attackerProfile.
  const bodyScale = def.bodyScale ?? 1;
  // §2a per-spawn stat spread: a named core stat rolls uniformly in its [min,max] band (seeded), else
  // the fixed def value. Base creatures author no `statRanges` → identical to before (fixed stats).
  const sr = def.statRanges;
  const stats: EntityStats = {
    strength: rollStatRange(sr?.str, def.stats.str),
    dexterity: rollStatRange(sr?.dex, def.stats.dex),
    perception: rollStatRange(sr?.per, def.stats.per),
    constitution: rollStatRange(sr?.con, def.stats.con),
    intelligence: def.behaviour === 'passive' ? 4 : 8,
    charisma: 5
  };
  // Blood/health pool tracks the ROLLED constitution (con×5), so a tougher individual soaks more — for a
  // base creature (no range) this equals the old def.stats.health.
  const scaledHealth = Math.round(stats.constitution * 5 * bodyScale);
  // §2a per-spawn natural-armour spread (individual elites vary in hide toughness); absent = fixed.
  const naturalArmorOverride = def.naturalArmorRange
    ? Math.round(
        def.naturalArmorRange[0] +
          rng.random() * (def.naturalArmorRange[1] - def.naturalArmorRange[0])
      )
    : undefined;
  // §2c a geared humanoid draws its worn loadout (quality + condition rolled) from its lootpool.
  const equipment = def.lootPool ? equipFromLootPool(def.lootPool) : undefined;
  // ENGINE-PERFORMANCE-II §S5: STAGGER initial hunger across mobs. Spawning every mob at hunger 0 made
  // them all cross HUNGER_EAT_THRESHOLD on the SAME tick → a synchronized hunt→combat wave that collapsed
  // TPS (the engagement-wave spike). A uniform spread over [0, threshold) desyncs the first hunt: each
  // mob reaches the threshold at a different time, so hunts (and thus combat) smear across the fill
  // window instead of firing all at once. Deterministic (seeded rng). Fatigue gets a smaller spread so
  // sleep/wake cycles desync too.
  const needs: EntityNeeds = {
    // §S5 stagger over [0, threshold); minus `hungerGrace` for the game-start seed so the band sits
    // negative (satiated) and predators don't hunt until they climb back to the eat threshold.
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
    // PAWN-GROWTH: a rolled age (display-only flavour — creatures don't grow like pawns).
    age: rng.int(1, 12),
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
    conditionTimers: {},
    // §4.0 shared lineage lines: resolve the creature def's trait ids to full Trait defs (an
    // orc_reaver carries Adrenal S1) — the stat/resistance/weaponBonus/combatMods effects flow
    // through the same `'traits' in entity` reads as a pawn's.
    ...(def.traits?.length
      ? {
          traits: def.traits.map((id) => TRAIT_DATABASE.find((t) => t.id === id)).filter((t) => !!t)
        }
      : {}),
    // §2a/§2c spawn-rolled extras (omitted for a plain base creature).
    ...(naturalArmorOverride !== undefined ? { naturalArmorOverride } : {}),
    ...(equipment ? { equipment } : {})
  };
}

/** §2a: roll a core stat from its optional [min,max] band (seeded), else the fixed value. */
function rollStatRange(range: [number, number] | undefined, fallback: number): number {
  if (!range) return fallback;
  return Math.round(range[0] + rng.random() * (range[1] - range[0]));
}

/** §2c: build a mob's worn equipment from a lootpool — draw the loadout, then stamp each drawn piece
 *  with a rolled quality tier + a worn starting durability (conditionRange × the item's max). Returns
 *  undefined when the pool is missing/empty so a mob without gear carries no `equipment` field. */
function equipFromLootPool(poolId: string): PawnEquipment | undefined {
  const pool = getLootPool(poolId);
  if (!pool) return undefined;
  const pieces = drawLoadout(pool, rng);
  if (pieces.length === 0) return undefined;
  const eq: Record<string, ItemInstance> = {};
  for (const p of pieces) {
    const item = itemService.getItemById(p.itemId);
    if (!item) continue; // defensive — ids are validated at load (validateLootItemIds)
    const maxDur = item.maxDurability ?? 100;
    const inst: ItemInstance = {
      instanceId: `loot-${p.itemId}-${idCounter}-${Math.floor(rng.random() * 1e6)}`,
      itemId: p.itemId,
      durability: Math.max(1, Math.round(maxDur * rollCondition(pool, rng))),
      quality: p.quality
    };
    eq[p.slot] = inst;
  }
  return Object.keys(eq).length > 0 ? (eq as PawnEquipment) : undefined;
}

// Validate every lootpool item id against ItemService at module load — a typo must fail loud, not
// silently ship an unarmed raider. (LootPools validates slot keys; item-id validation needs
// ItemService, which lives in this layer.) No-op while the pools are empty.
validateLootItemIds((id) => itemService.getItemById(id) != null);
