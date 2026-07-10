// LootPools.ts — loads database/lootpool.jsonc and draws a geared humanoid's loadout at spawn
// (CREATURE-COMBAT-OVERHAUL §2c). Data-only rosters live in the JSONC; this file is the loader + the
// PURE weighted-draw logic (no ItemService/rng singleton dependency — the caller passes an rng and
// resolves item durability), so the draw is unit-testable in isolation.
import lootpoolRaw from '../database/lootpool.jsonc';
import type { EquipmentSlot, ItemQuality } from './types/items';

/** One weighted item candidate for a slot. */
export interface LootPick {
  id: string; // items.jsonc id
  w?: number; // weight (default 1)
}

/** A per-slot draw: `chance` this slot is filled at all, then a weighted pick among `pick`. */
export interface LootSlot {
  chance: number; // 0–1
  pick: LootPick[];
}

export interface LootPool {
  /** Per-piece chance to drop on death (0–1). */
  dropChance: number;
  /** Spawn durability as a fraction of the item's max (worn gear starts below full). Default [1,1]. */
  conditionRange?: [number, number];
  /** Weighted [ItemQuality, weight] table for a drawn piece's quality tier. Omitted = Standard (1). */
  quality?: Array<[ItemQuality, number]>;
  /** Slot id → its draw. Keys are real EquipmentSlot ids. */
  slots: Partial<Record<EquipmentSlot, LootSlot>>;
}

type LootPoolFile = { pools: Record<string, LootPool> };

const VALID_SLOTS = new Set<string>([
  'mainHand',
  'offHand',
  'headBase',
  'headOuter',
  'bodyBase',
  'bodyMid',
  'bodyOuter',
  'gloves',
  'boots',
  'gorget',
  'pauldrons',
  'bracers',
  'greaves',
  'ring',
  'ring2',
  'amulet',
  'belt',
  'back'
]);

const POOLS: Map<string, LootPool> = new Map(
  Object.entries((lootpoolRaw as unknown as LootPoolFile).pools ?? {})
);

/** Validate slot keys at load — a typo'd slot must fail loud, not silently ship a naked raider. Item
 *  ids are validated by the SPAWN caller against ItemService (this module has no ItemService dep). */
for (const [poolId, pool] of POOLS) {
  for (const slot of Object.keys(pool.slots)) {
    if (!VALID_SLOTS.has(slot)) {
      throw new Error(`lootpool "${poolId}": unknown equipment slot "${slot}"`);
    }
  }
}

export function getLootPool(id: string): LootPool | undefined {
  return POOLS.get(id);
}

/** Validate every pick's item id against a caller-supplied existence check (ItemService lives a layer
 *  up, so the spawn code calls this once at load). Throws on the first unknown id — a typo can't
 *  silently ship an unarmed raider. No-op while the pools are empty. */
export function validateLootItemIds(exists: (id: string) => boolean): void {
  for (const [poolId, pool] of POOLS) {
    for (const [slot, def] of Object.entries(pool.slots)) {
      for (const p of def?.pick ?? []) {
        if (!exists(p.id)) {
          throw new Error(`lootpool "${poolId}" slot "${slot}": unknown item id "${p.id}"`);
        }
      }
    }
  }
}

export interface DrawnPiece {
  slot: EquipmentSlot;
  itemId: string;
  quality: ItemQuality;
}

/** Minimal rng surface (matches core/rng). */
export interface Rng {
  random(): number;
}

/** Weighted pick from a `LootPick[]` (weight default 1); null when the list is empty. */
function weightedPick(picks: LootPick[], rng: Rng): string | null {
  const total = picks.reduce((s, p) => s + Math.max(0, p.w ?? 1), 0);
  if (total <= 0) return null;
  let r = rng.random() * total;
  for (const p of picks) {
    r -= Math.max(0, p.w ?? 1);
    if (r <= 0) return p.id;
  }
  return picks[picks.length - 1].id;
}

/** Roll a quality tier from the pool's weighted table (default Standard = 1). */
function rollQuality(pool: LootPool, rng: Rng): ItemQuality {
  const table = pool.quality;
  if (!table || table.length === 0) return 1;
  const total = table.reduce((s, [, w]) => s + Math.max(0, w), 0);
  if (total <= 0) return 1;
  let r = rng.random() * total;
  for (const [q, w] of table) {
    r -= Math.max(0, w);
    if (r <= 0) return q;
  }
  return table[table.length - 1][0];
}

/**
 * Draw a loadout for a spawning mob: for each slot, roll `chance`; if filled, weighted-pick an item and
 * roll a quality tier. PURE — deterministic given the rng. The caller (entitySpawning) builds the
 * ItemInstances (durability = `conditionRange` × the item's max, resolved via ItemService).
 */
export function drawLoadout(pool: LootPool, rng: Rng): DrawnPiece[] {
  const out: DrawnPiece[] = [];
  for (const [slot, def] of Object.entries(pool.slots)) {
    if (!def) continue;
    if (rng.random() >= def.chance) continue;
    const itemId = weightedPick(def.pick, rng);
    if (!itemId) continue;
    out.push({ slot: slot as EquipmentSlot, itemId, quality: rollQuality(pool, rng) });
  }
  return out;
}

/** Spawn condition (0–1 fraction of max durability) for a drawn piece — uniform in the pool's
 *  `conditionRange` (default full). Kept here so quality+condition rolling lives in one module. */
export function rollCondition(pool: LootPool, rng: Rng): number {
  const [lo, hi] = pool.conditionRange ?? [1, 1];
  return lo + rng.random() * Math.max(0, hi - lo);
}
