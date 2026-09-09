import lootpoolRaw from '../../database/items/lootpool.json';
import type { EquipmentSlot, ItemQuality } from '../types/items';

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

export function allLootPools(): ReadonlyMap<string, LootPool> {
  return POOLS;
}
