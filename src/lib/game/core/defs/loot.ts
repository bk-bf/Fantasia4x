import lootpoolRaw from '../../database/items/lootpool.json';
import { isFluidId, servingL } from '../rules/gear/vessels';
import { rollFamedIdentity } from '../gen/famedNames';
import type { EquipmentSlot, ItemQuality } from '../types/items';

export type FamedIdentity = ReturnType<typeof rollFamedIdentity>;

export interface LootPick {
  id: string;
  w?: number;
  famed?: boolean;
}

export interface LootSlot {
  chance: number;
  pick: LootPick[];
}

export interface LootCarry {
  chance: number;
  count?: [number, number];
  pick: LootPick[];
}

export interface LootPool {
  dropChance: number;
  conditionRange?: [number, number];
  quality?: Array<[ItemQuality, number]>;
  slots: Partial<Record<EquipmentSlot, LootSlot>>;
  carried?: LootCarry[];
}

type LootPoolFile = { pools: Record<string, LootPool> };

const VALID_SLOTS = new Set<string>([
  'mainHand',
  'offHand',
  'head',
  'bodyBase',
  'bodyMid',
  'bodyOuter',
  'gloves',
  'boots',
  'bracers',
  'greaves',
  'ring',
  'ring2',
  'amulet',
  'belt',
  'back',
  'back2'
]);

const POOLS: Map<string, LootPool> = new Map(
  Object.entries((lootpoolRaw as unknown as LootPoolFile).pools ?? {})
);

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

export function validateLootItemIds(exists: (id: string) => boolean): void {
  for (const [poolId, pool] of POOLS) {
    for (const [slot, def] of Object.entries(pool.slots)) {
      for (const p of def?.pick ?? []) {
        if (!exists(p.id)) {
          throw new Error(`lootpool "${poolId}" slot "${slot}": unknown item id "${p.id}"`);
        }
      }
    }
    for (const carry of pool.carried ?? []) {
      for (const p of carry.pick) {
        if (!exists(p.id)) {
          throw new Error(`lootpool "${poolId}" carried: unknown item id "${p.id}"`);
        }
      }
    }
  }
}

export function drawCarried(pool: LootPool, rng: Rng): Array<{ itemId: string; qty: number }> {
  const out: Array<{ itemId: string; qty: number }> = [];
  for (const carry of pool.carried ?? []) {
    if (rng.random() >= carry.chance) continue;
    const [lo, hi] = carry.count ?? [1, 1];
    const qty = lo + Math.floor(rng.random() * (hi - lo + 1));
    if (qty <= 0) continue;
    const total = carry.pick.reduce((n, p) => n + (p.w ?? 1), 0);
    let roll = rng.random() * total;
    const chosen = carry.pick.find((p) => (roll -= p.w ?? 1) < 0) ?? carry.pick[0];
    if (!chosen) continue;
    const drawn = isFluidId(chosen.id) ? qty * servingL(chosen.id) : qty;
    const at = out.find((o) => o.itemId === chosen.id);
    if (at) at.qty += drawn;
    else out.push({ itemId: chosen.id, qty: drawn });
  }
  return out;
}

export interface DrawnPiece {
  slot: EquipmentSlot;
  itemId: string;
  quality: ItemQuality;
  famed?: FamedIdentity;
}

export interface Rng {
  random(): number;
}

function weightedPick(picks: LootPick[], rng: Rng): LootPick | null {
  const total = picks.reduce((s, p) => s + Math.max(0, p.w ?? 1), 0);
  if (total <= 0) return null;
  let r = rng.random() * total;
  for (const p of picks) {
    r -= Math.max(0, p.w ?? 1);
    if (r <= 0) return p;
  }
  return picks[picks.length - 1];
}

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

export function drawLoadout(pool: LootPool, rng: Rng): DrawnPiece[] {
  const out: DrawnPiece[] = [];
  for (const [slot, def] of Object.entries(pool.slots)) {
    if (!def) continue;
    if (rng.random() >= def.chance) continue;
    const picked = weightedPick(def.pick, rng);
    if (!picked) continue;
    const famed = picked.famed ? rollFamedIdentity(() => rng.random()) : undefined;
    out.push({
      slot: slot as EquipmentSlot,
      itemId: picked.id,
      quality: rollQuality(pool, rng),
      ...(famed ? { famed } : {})
    });
  }
  return out;
}

export function rollCondition(pool: LootPool, rng: Rng): number {
  const [lo, hi] = pool.conditionRange ?? [1, 1];
  return lo + rng.random() * Math.max(0, hi - lo);
}
