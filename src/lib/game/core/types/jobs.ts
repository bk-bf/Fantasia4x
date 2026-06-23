// Labor, dropped items, jobs, and work-assignment types. Split out of core/types.ts (P-4);
// re-exported via the barrel.

import type { ItemInstance, ItemQuality } from './items';
import type { EntityStats } from './race';

/** Celestia-compatible 5-level labor priority. 0 = disabled. */
export type LaborLevel = 0 | 1 | 2 | 3 | 4;
export const LABOR_LEVEL = { DISABLED: 0, LOW: 1, NORMAL: 2, HIGH: 3, URGENT: 4 } as const;

/** An item that has been harvested and dropped on the map, awaiting a hauler. */
export interface DroppedItem {
  id: string;
  resourceId: string;
  x: number;
  y: number;
  quantity: number;
  /** True when this item has been hauled and placed on a stockpile zone tile. */
  stored?: boolean;
  /**
   * §B remaining durability of this stack. Starts at the item def's `maxDurability` (default 100)
   * and counts DOWN by `deteriorationRate` each tick while loose/exposed; the stack is destroyed
   * at 0. Halted entirely once `stored` (in a container / enclosed). Same pool tools wear from.
   */
  durability?: number;
  /** §1 wood seasoning: accumulated drying seconds while within 2 tiles (not adjacent) of a lit fire. */
  drying?: number;
  /** §C per-stack spoilage clock (seconds, scaled by storage). At the def's decaySeconds, one unit rots. */
  decayAcc?: number;
  /**
   * Per-unit carcass CONDITION (0–100), one entry per unit in `quantity`; index 0 = the "top" unit
   * (next consumed / butchered). Replaces the old `gameState.carcassIntactness` per-type map — folds a
   * carcass's remaining mass onto the stack itself. Animal/butchery consumption erodes the top unit
   * only; environmental spoilage erodes every unit. See `core/carcassCondition.ts`. Carcasses only.
   */
  unitConditions?: number[];
  /** Present for tracked items (weapons, armour, tools with maxDurability). */
  instance?: ItemInstance;
  /**
   * §Q craft-quality tier of this stack (R8). Stamped at craft completion and propagated onto the
   * `ItemInstance` when the stack is equipped/picked up (mirrors how per-stack `durability` becomes
   * `instance.durability`). Undefined = Standard. A stack mixes only same-quality units (no
   * cross-tier merge).
   */
  quality?: ItemQuality;
  /**
   * Per-drop display-name override (R10). Used for `dynamicName` items (e.g. a pawn corpse, which
   * reads "Bjorn's Corpse" instead of the generic def name). Resolved at spawn; see
   * `itemService.makeDynamicName` / `getItemDisplayName`.
   */
  name?: string;
  /**
   * ADR-016 reserve-and-fetch: id of the craft order (CraftingInProgress.id) this stored stack
   * is locked for. A reserved stack is physically present (counts in `stockpile`) but excluded
   * from "available" stock and from haul/consume targeting, so a second order can't double-spend
   * it. Set when an order is queued; the stack is fetched to the station and destroyed on craft
   * completion; cleared if the order is cancelled. Undefined = free.
   */
  reservedFor?: string;
  /**
   * Haul lockout. When true, no haul job will target this stack (and any in-flight haul job for it
   * is pruned, so a pawn already walking to it turns back). Drops that appear in the world rather
   * than from colony work — chiefly animal carcasses from `dropCarcass` — default to forbidden, so
   * pawns don't wander into danger to retrieve a kill until the player explicitly allows it. Toggled
   * per-stack from the item's info card (the `setDropForbidden` command). Undefined = haulable.
   */
  forbidden?: boolean;
}

export interface Job {
  id: string;
  type:
    | 'harvest'
    | 'construct'
    | 'haul'
    | 'fetch' // ADR-016: carry a reserved input stack from stockpile to a workstation tile
    | 'craft'
    | 'caretake' // ADR-017: a medic walks to a resting wounded patient and dresses its wounds
    | 'eat'
    | 'sleep'
    | 'light'
    | 'refuel'
    | 'deconstruct'
    | 'plant'; // PRODUCTION-CHAIN-II §F: sow a crop on a grow-zone tile
  targetX: number;
  targetY: number;
  /** caretake: id of the wounded pawn being tended (the job targets that pawn's tile). */
  patientId?: string;
  resourceId?: string; // harvest / haul / fetch: which resource
  droppedItemId?: string; // haul / fetch: which DroppedItem to pick up
  buildingId?: string; // construct: which PlacedBuilding.id; fetch/craft: the station building
  craftQueueId?: string; // craft / fetch: which CraftingInProgress.id (the order)
  /** fetch: where to deliver the carried input (the station tile). */
  stationX?: number;
  stationY?: number;
  workRequired: number; // total work points to complete
  workDone: number; // accumulated progress
  claimedBy: string | null; // pawnId claiming this job; null = open
}

/**
 * Declarative definition of a colony job type — the data half of the job system, authored in
 * `database/jobs.jsonc` (one entry per pool job type). The *behaviour* (how a job of this type is
 * generated and completed) is bound by `id` in `JobService`'s handler registry, exactly as
 * recipes.jsonc pairs with `JobService._completeCraft`. Adding a colony job = one jsonc entry + one
 * registry binding + one `Job['type']` union member (a `graph:check` rule guards the three from
 * drifting). FSM-internal job kinds (`eat`/`sleep`/`need`) are NOT colony jobs and have no entry.
 */
export interface JobDef {
  /** Stable kebab-case id; must equal the `Job['type']` member it describes. */
  id: string;
  /** Human label for UI/debug. */
  label: string;
  /** Static labor work-category id (see `Work.ts`). Omit when `workCategorySource` is `designation`;
   *  for `recipe-output` it is still used as the non-food fallback category. */
  workCategory?: string;
  /** Dynamic work-category resolution. `designation`: read it off the harvested resource's
   *  interaction (designation-specific). `recipe-output`: a craft job producing a `food` output maps
   *  to `cooking` (so the Cooking labor slider drives it), otherwise it falls back to `workCategory`. */
  workCategorySource?: 'designation' | 'recipe-output';
  /** Optional claim restriction enforced in `getAvailableJobs`. `harvestTool`/`craftTool`: ADR-009
   *  per-pawn tool gating (carry a qualifying tool, auto-grab otherwise); `refuelAllowlist`: the
   *  building's `allowedRefuelPawnIds`. */
  claimGate?: 'harvestTool' | 'craftTool' | 'refuelAllowlist';
  /** Whether low light slows this job (§G light→work). Defaults to true. Set false for jobs that
   *  don't need close sight — hauling/fetching/refuelling (carrying) are unaffected by darkness. */
  lightAffected?: boolean;
}

export interface WorkCategory {
  id: string;
  name: string;
  description: string;
  color: string;

  // Requirements
  // `toolsRequired` BOTH gates and boosts: a pawn can only work this category while holding one of
  // these (JobService), and the held tool's `toolBoost` is added to the modifier (PawnStatService).
  toolsRequired?: string[];
  // `boostTools` ONLY boosts — never gates. For tool-free categories (e.g. foraging is the
  // bootstrap activity) where a held tool should speed work up but must not become a requirement.
  boostTools?: string[];
  skillRequired?: string;

  // Efficiency modifiers
  primaryStat: keyof EntityStats;
  secondaryStat?: keyof EntityStats;

  // Base efficiency
  baseEfficiency: number;
}

export interface WorkAssignment {
  pawnId: string;
  /** @deprecated Use laborSettings instead. Legacy 0-10 scale. */
  workPriorities: Record<string, number>;
  /** Phase 5a: 5-level labor priorities (Celestia model). 0=disabled, 1=low, 2=normal, 3=high, 4=urgent */
  laborSettings?: Record<string, LaborLevel>;
  currentWork?: string;
}
