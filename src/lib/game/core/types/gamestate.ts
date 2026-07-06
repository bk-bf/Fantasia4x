// The root GameState shape. Split out of core/types.ts (P-4); re-exported via the barrel.

import type { Race, RaceRelation } from './race';
import type { WorldTile } from './world';
import type { Season, WeatherState } from './environment';
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
import type { PendingEvent } from './events';

/** Colony-wide food policy (the food filter panel). `allowedFoodItemIds` is the explicit eat-list — an
 *  empty array means "eat nothing"; `undefined` falls back to the default (everything bar rotten food +
 *  raw carcasses). Resolved by services/foodRules.resolveAllowedFoodIds. */
export interface FoodSettings {
  allowedFoodItemIds?: string[];
}

export interface GameState {
  /** Deterministic RNG seed (P0-2). Persisted so a loaded save replays identically. */
  seed: number;
  turn: number;
  /** The colony's primary / "home" race. Back-compat alias for `racePool[0]`; the
   *  pool is canonical now that colonies are mixed (Race overhaul). */
  race: Race;
  /** Prerolled pool of 15–25 procedural races — the known-races pokédex backing store. */
  racePool: Race[];
  /** Stub procedural inter-race relations (data + pokédex display only; no mood wiring yet). */
  raceRelations: RaceRelation[];
  worldMap: WorldTile[][];
  /** Living-world (SEASONS_WEATHER Phase B): current season + 0-indexed day within it. */
  season?: Season;
  seasonDay?: number;
  /** Living-world (SEASONS_WEATHER Phase C): active weather, re-rolled by the Markov chain daily. */
  weather?: WeatherState;
  /** Debug override: when set, `processEnvironment` forces this season instead of the turn-derived
   *  one (the in-game debug menu's "change season" button). Clear it to resume the natural cycle. */
  _debugSeason?: Season;
  /** Debug override: when set (fraction in [0,1), 0=midnight, 0.5=noon), the renderer computes ambient
   *  light/tint from this fixed time-of-day instead of the live turn — lets the debug menu hold the
   *  world at day/night to test weather effects. Visual only; the sim turn keeps advancing. */
  _debugTimeOfDay?: number;
  /** Debug override: when true, RESEARCH gating is OFF — research-locked recipes & buildings appear in
   *  the Crafting/Building tabs AND can be queued/built without the prerequisite research (station,
   *  tools, materials still apply). Toggled from the DEBUG tab; rides gameState so the worker sees it. */
  _devResearchGateOff?: boolean;
  /** Average effective map temperature (°C, baked tile avg + weather delta), computed worker-side
   *  for the HUD readout. A scalar — tile `temperature` itself stays worker-only (PERF-2). */
  avgTemperature?: number;
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
  /** Standing-zone instance membership keyed as "x,y" → one instance id per zone *layer* (zone type)
   *  present on the tile, e.g. `{ stockpile: 'stockpile-ab', restrict: 'restrict-cd' }`. Layered by
   *  type so overlapping zones of different kinds (a stockpile drawn inside a restrict area) never
   *  clobber each other's instance id — the bug that silently shrank a restrict zone wherever it met
   *  another zone and stranded confined pawns Idle. Read a single layer via the DesignationService
   *  `zoneInstanceIdAt` helper. */
  designationZoneId?: Record<string, Partial<Record<DesignationType, string>>>;
  /** Colony-wide food filter (which items pawns may eat). Unset → the default eat-list. */
  foodSettings?: FoodSettings;
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
  /** Per-carcass-type average condition (0–100), computed worker-side and shipped in the snapshot so
   *  the panels never need the per-unit `unitConditions` arrays (stripped from the projected
   *  `droppedItems`). Projection-only — not persisted; see `core/carcassCondition.ts`. */
  _carcassCondition?: Record<string, number>;
  /** Dead pawn records for colony history (SURVIVAL-HEALTH spec). */
  deadPawns?: DeadPawnRecord[];
  /** ENTITIES_SPAWNING Phase A: live hostile mobs + neutral animals on the map. */
  mobs?: Mob[];
  /** ENTITIES_SPAWNING Phase C: animals tamed and bound to a pawn. */
  tamedAnimals?: TamedAnimal[];
  /** Accumulated decay-seconds per item type in the stockpile (for stepItemDecay). */
  stockpileDecaySeconds?: Record<string, number>;
  /**
   * §B tool work-wear: accumulated durability spent per tool item id. When it reaches the
   * tool's maxDurability, one tool of that type breaks (consumed) and the counter resets.
   */
  toolWear?: Record<string, number>;
  /** A world event awaiting a player decision (e.g. a migrant wave). Raised worker-side by the sim,
   *  rendered by the UI's EventModalHost, and cleared by its resolution command. Undefined = none. */
  pendingEvent?: PendingEvent;
}
