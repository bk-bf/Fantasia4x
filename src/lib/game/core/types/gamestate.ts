// The root GameState shape. Split out of core/types.ts (P-4); re-exported via the barrel.

import type { Race } from './race';
import type { WorldTile } from './world';
import type {
  PlacedBuilding,
  StockpileZone,
  DesignationType,
  FilterableZoneType,
  ZoneFilter,
  ZoneInstance
} from './buildings';
import type { Job, DroppedItem, WorkAssignment } from './jobs';
import type { CraftingInProgress } from './items';
import type { ResearchProject, LoreItem } from './research';
import type { Pawn, Mob, TamedAnimal } from './entities';
import type { DeadPawnRecord } from './health';

export interface GameState {
  /** Deterministic RNG seed (P0-2). Persisted so a loaded save replays identically. */
  seed: number;
  turn: number;
  race: Race;
  worldMap: WorldTile[][];
  /** @deprecated Use buildings[] instead */
  buildingCounts: Record<string, number>;
  /** Phase 4: physically placed buildings on the map */
  buildings: PlacedBuilding[];
  /** Phase 4: colony-level stockpile (harvested resources) — aggregate of all stockpileZones. */
  stockpile: Record<string, number>;
  /** Named stockpile zones; each tracks its own item inventory. */
  stockpileZones: StockpileZone[];
  /** Phase 4: one-shot tile *action* orders (harvest/woodcut/mine/construct/haul/clear…) keyed
   *  as "x,y". Cleared on completion. Standing *zones* live in {@link zoneTiles}, so an order and
   *  a zone can occupy the same tile without clobbering each other. */
  designations: Record<string, DesignationType>;
  /** Standing-zone membership keyed as "x,y" → zone types present on that tile (e.g.
   *  `['stockpile']`). Separate from {@link designations} so completing/clearing an action order
   *  on a tile never destroys the zone it sits on, and a tile can belong to multiple zones. */
  zoneTiles?: Record<string, DesignationType[]>;
  /** @deprecated Use zoneInstances instead. Legacy type-level filters for backward compat. */
  zoneFilters?: Partial<Record<FilterableZoneType, ZoneFilter>>;
  /** Named zone instances, each with their own filter. Replaces zoneFilters. */
  zoneInstances?: ZoneInstance[];
  /** Maps "x,y" tile keys to ZoneInstance.id for per-instance filter lookup. */
  designationZoneId?: Record<string, string>;
  /** Phase 5a: active job pool — regenerated each turn by JobService */
  jobs: Job[];
  maxPopulation: number;
  availableResearch: string[];
  completedResearch: string[];
  currentResearch?: ResearchProject;
  discoveredLore: LoreItem[];
  _woodBonus?: number;
  _stoneBonus?: number;
  // inventory: Record<string, number>; // REMOVE THIS LINE
  equippedItems: {
    weapon: string | null;
    head: string | null;
    chest: string | null;
    legs: string | null;
    feet: string | null;
    hands: string | null;
  };
  craftingQueue: CraftingInProgress[];
  currentToolLevel: number;
  workAssignments: Record<string, WorkAssignment>;
  pawns: Pawn[];
  pawnStats: {}; // Record<pawnId, Record<statName, { value: number, sources: string[] }>>
  /** Per-workshop pawn assignment: key = workshopType, value = pawnId or null (any) */
  craftingStationAssignments?: Record<string, string | null>;
  /** Per-item crafting config: key = itemId */
  craftingOrderConfigs?: Record<
    string,
    { amount: number; mode: 'once' | 'stockpile'; targetStockpile?: number }
  >;
  /** Phase 7: items dropped on the ground after harvesting, awaiting haulers */
  droppedItems?: DroppedItem[];
  /** Dead pawn records for colony history (SURVIVAL-HEALTH spec). */
  deadPawns?: DeadPawnRecord[];
  /** ENTITIES_SPAWNING Phase A: live hostile mobs + neutral animals on the map. */
  mobs?: Mob[];
  /** ENTITIES_SPAWNING Phase C: animals tamed and bound to a pawn. */
  tamedAnimals?: TamedAnimal[];
  /** Intactness (0–100) for each carcass item type currently in the stockpile. */
  carcassIntactness?: Record<string, number>;
  /** Accumulated decay-seconds per item type in the stockpile (for stepItemDecay). */
  stockpileDecaySeconds?: Record<string, number>;
  /**
   * §B tool work-wear: accumulated durability spent per tool item id. When it reaches the
   * tool's maxDurability, one tool of that type breaks (consumed) and the counter resets.
   */
  toolWear?: Record<string, number>;
}
