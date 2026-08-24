import type {
  Item,
  GameState,
  DynamicIngredientSlot,
  DroppedItem,
  Recipe,
  Pawn,
  ItemQuality,
  ItemInstance
} from '../core/types';
import { qualityPrefix } from '../core/itemQuality';
import { itemDefById, itemMatchesCostCategory } from '../core/itemDefs';
import { usedCapacityL, usedWeightKg, vesselOf } from '../core/vessels';
import {
  decayAll,
  normalizeConditions,
  carcassConditionByType as computeCarcassConditionByType
} from '../core/carcassCondition';
import {
  consumeFromStockpiles,
  addToStockpileZone,
  withDrops,
  availableQuantityFromDrops,
  colonyToolTier
} from '../core/GameState';
import { recipeService } from './RecipeService';
import { buildingService, weatherExposureFactor } from './BuildingService';
import {
  thermalAt,
  computeThermalAt,
  seasonBakedTemp,
  effectiveTemperature,
  tileWetness,
  weatherEffects,
  diurnalTempDelta
} from './EnvironmentService';
import itemsData from '../database/items/items.jsonc';
import buildingsData from '../database/world/buildings.jsonc';
import { SECONDS_PER_TICK } from '../core/time';
import { chebyshev } from '../core/distance';
import { sizeFromHeight } from '../core/Culture';
// Gated console shim (ADR-011): per-tick/per-action log/debug/info/warn are silent unless
// gameDebug(true); console.error still surfaces.
import { gatedConsole as console } from '../core/log';

const ITEMS_DATABASE = itemsData as unknown as Item[];

// Building defs are needed for tile-aware decay (storage multipliers, roofs).
const BUILDING_DEFS_FOR_ITEMS = buildingsData as unknown as import('../core/types').Building[];

// `category:<cat>` cost/slot matching lives in core/itemDefs.ts (single copy — was also pasted
// into BuildingService). Re-exported for existing importers.
export { itemMatchesCostCategory } from '../core/itemDefs';

/** How many units of a `category:` cost ONE of this item satisfies (see `Item.craftValue`). A crude
 *  material is worth a fraction, so the slot consumes more of it. Defaults to 1. */
function craftValueOf(item: { craftValue?: number } | undefined | null): number {
  const v = item?.craftValue;
  return typeof v === 'number' && v > 0 ? v : 1;
}

// §B Durability defaults — every item weathers when left exposed (loose, unsheltered).
// Explicit `deteriorationRate`/`maxDurability` on an item override these. Rate 0 = weather-immune.
const DEFAULT_MAX_DURABILITY = 100;
const DEFAULT_DETERIORATION_RATE = 0.02; // per tick (before the global scale below)
/**
 * Global lifespan scale applied to ALL deterioration rates. The per-item/category rates below set
 * the RELATIVE durability (stone/metal slowest → organics fastest); this single factor stretches
 * the absolute timescale to real-feeling lifespans without editing ~200 item rows. A day = 300
 * in-game s × 60 = 18,000 ticks; week ≈ 126k; month ≈ 540k. At 0.02 (≈1/50): most items
 * (wood/construction ~0.01–0.04) last ~1 week, metal/ingot/bar (0.008) ~1+ months, stone ~2 months,
 * organics/food (0.07–0.08) ~3–4 days (raw food also spoils separately via stepItemDecay).
 */
export const DETERIORATION_GLOBAL_SCALE = 0.02;
// Drying is data-driven (item def `driesTo`): green_firewood → dry_firewood ('fire-ring' mode, seasons
// only by a lit fire); plant_fiber → hay and any `meat` → dried_meat ('ambient' mode). AMBIENT cures
// ONLY where it is warm AND dry — a tile that's wet (rain / near water / a bog) reverses the cure. A hay
// rack / drying rack (effects.dryingBonus) multiplies the rate; a nearby fire warms the tile (via
// thermalAt) so it clears the temperature gate faster — the two stack. A future fuel-fired kiln is just
// an actual furnace carrying a larger dryingBonus, no special-casing.
const DRY_TEMP_FLOOR = 12; // °C below which ambient drying does not progress at all
const DRY_TEMP_REF = 28; // °C at/above which ambient drying runs at full (open-air) speed
const DRY_WET_DECAY = 2; // drying seconds lost per real second on a fully saturated tile
// Graded wetness gate (replaces the old hard ≥50% cliff, which made any tile at/above 50% wet reverse
// at full speed — so spring rain locked out hay-making entirely). Drying runs at full speed up to
// DRY_WET_DAMP, then ramps down through a stall (~70%) to reversing at DRY_WET_SOAK. A nearby fire
// EVAPORATES moisture: DRY_HEAT_DEWATER wetness points are removed per °C of radiated warmth, so a lit
// Stone Hearth (~+31°C one tile out → ~−15% wetness) beats ordinary rain, while a true storm still
// debuffs and a saturated / waterside tile still ruins the goods.
const DRY_WET_DAMP = 45; // effective wetness % up to which weather no longer slows drying
const DRY_WET_SOAK = 95; // effective wetness % at/above which drying reverses at full DRY_WET_DECAY
const DRY_HEAT_DEWATER = 0.5; // wetness % removed per °C of nearby fire warmth

/** Effective (fire-dried) wetness a drying stack feels: nearby fire warmth evaporates surface moisture,
 *  lowering the wetness the drying gate sees. Shared by the rate calc and the UI readout. */
function dryingWetness(wetness: number, warmth: number): number {
  return Math.max(0, wetness - warmth * DRY_HEAT_DEWATER);
}

type DryingRule = { itemId: string; seconds: number; mode: 'ambient' | 'fire-ring' };
// Category-level drying rules (item-def `driesTo` overrides these; `driesTo: null` opts out). Mirrors
// the old make_dried_meat recipe's `acceptsCategory: "meat"`.
const CATEGORY_DRYING: Record<string, DryingRule> = {
  meat: { itemId: 'dried_meat', seconds: 600, mode: 'ambient' },
  fruit: { itemId: 'dried_fruit', seconds: 700, mode: 'ambient' }
};

/**
 * Ambient drying rate at a spot: drying-seconds gained per second of exposure. >0 cures, 0 = stalled
 * (too cold, or too wet to progress), <0 = reversing (a saturated tile — rain ruins drying goods).
 * `wetness` is the raw tile wetness; `warmth` is nearby fire warmth (°C) which both raises `temp` AND
 * evaporates moisture. `bonus` is the tile's building dryingBonus (1 = open ground). The SINGLE formula
 * stepDrying + the UI dryness readout share so they can't drift. Open-ground full-warmth rate = 1.
 */
function ambientDryRate(temp: number, wetness: number, bonus: number, warmth = 0): number {
  const wet = dryingWetness(wetness, warmth);
  // Signed wetness factor: +1 (dry) → 0 (stall ~DRY_WET_DAMP..SOAK midpoint) → −1 (saturated).
  const wetF = Math.max(
    -1,
    Math.min(1, 1 - (2 * (wet - DRY_WET_DAMP)) / (DRY_WET_SOAK - DRY_WET_DAMP))
  );
  if (wetF < 0) return wetF * DRY_WET_DECAY; // reversing, scaled by how saturated
  const tempF = Math.max(0, Math.min(1, (temp - DRY_TEMP_FLOOR) / (DRY_TEMP_REF - DRY_TEMP_FLOOR)));
  return tempF * wetF * bonus;
}

/** The drying rule for a stack's resource — the item def's `driesTo` first, then a category rule
 *  (CATEGORY_DRYING). `driesTo: null` opts out; a product can't dry into itself. null = doesn't dry. */
function dryingRuleFor(resourceId: string): DryingRule | null {
  const def = itemDefById(resourceId);
  if (def?.driesTo !== undefined) return def.driesTo ? { mode: 'ambient', ...def.driesTo } : null;
  const rule = def?.category ? CATEGORY_DRYING[def.category] : undefined;
  return rule && rule.itemId !== resourceId ? rule : null;
}

// Per-pass drying context (built once): lit fires (fire-ring seasoning) + rack tiles (dryingBonus) +
// the global weather/diurnal temperature delta.
type DryingCtx = {
  fires: { x: number; y: number }[];
  dryRacks: Map<string, number>;
  weatherTemp: number;
};
function dryingContext(gameState: GameState): DryingCtx {
  const fires: { x: number; y: number }[] = [];
  const dryRacks = new Map<string, number>();
  for (const b of gameState.buildings ?? []) {
    if (b.status !== 'complete') continue;
    if (b.lit) fires.push({ x: b.x, y: b.y });
    const bonus = buildingService.getBuildingById(b.type)?.effects?.dryingBonus ?? 0;
    if (bonus > 0) {
      const key = b.y + ',' + b.x;
      dryRacks.set(key, Math.max(dryRacks.get(key) ?? 0, bonus));
    }
  }
  const weatherTemp =
    weatherEffects(gameState.weather).tempDelta +
    diurnalTempDelta(gameState.turn, gameState.season);
  return { fires, dryRacks, weatherTemp };
}

/**
 * Current drying rate for a stack (worker side — reads the prebuilt thermalAt field): drying-seconds
 * gained per second. >0 = curing, 0 = idle (too cold / not by a fire), <0 = reversing (wet). The
 * SINGLE determination both stepDrying (to cure) and stepItemDecay (to gate spoilage) consult, so a
 * stack can never both dry and spoil. Reserved/committed stacks are handled by the callers, not here.
 */
function dryRateFor(
  d: DroppedItem,
  gameState: GameState,
  ctx: DryingCtx,
  // CONTAINERS-AND-FLUIDS: a VESSEL is not dryable itself, but what is inside an open one is. The
  // caller passes the NESTED item's rule so the same tile/temperature/wetness maths is reused instead
  // of a second copy drifting away from this one.
  ruleOverride?: DryingRule | null
): number {
  const rule = ruleOverride ?? dryingRuleFor(d.resourceId);
  if (!rule) return 0;
  if (rule.mode === 'fire-ring') {
    if (ctx.fires.length === 0) return 0;
    let nearest = Infinity;
    for (const f of ctx.fires) nearest = Math.min(nearest, chebyshev(d.x, d.y, f.x, f.y));
    return nearest === 2 ? 1 : 0;
  }
  const tile = gameState.worldMap?.[d.y]?.[d.x];
  if (!tile) return 0;
  const thermal = thermalAt(d.x, d.y);
  const temp = effectiveTemperature(
    seasonBakedTemp(tile.terrainType, gameState.season),
    ctx.weatherTemp,
    thermal
  );
  const wet = tileWetness(tile.moisture ?? 0, gameState.weather, thermal);
  return ambientDryRate(temp, wet, ctx.dryRacks.get(d.y + ',' + d.x) ?? 1, thermal.warmth);
}

/** Live drying readout for one stack, for the UI dryness meter + speed arrow (null = doesn't dry). */
export interface DryingStatus {
  /** Total drying-seconds the stack needs before it cures. */
  target: number;
  /** Accrued drying-seconds so far. */
  progress: number;
  /** Drying-seconds gained per second now: >0 curing, 0 stalled, <0 reversing (wet). */
  rate: number;
  /** Why it isn't progressing (only when rate <= 0). */
  reason?: 'wet' | 'cold' | 'no-fire';
  /** Effective tile temperature (°C) — present for the temperature/wetness cure (plant_fiber). */
  temp?: number;
  /** Effective tile wetness (0–100%) — present for the temperature/wetness cure. */
  wetness?: number;
  /** Building drying multiplier in play (1 = open ground / no rack). */
  bonus: number;
}
const DETERIORATION_RATE_BY_CATEGORY: Record<string, number> = {
  stone: 0.004, // rock barely weathers
  primitive: 0.01,
  metal: 0.008,
  ingot: 0.008,
  bar: 0.008,
  construction: 0.01,
  wood: 0.04,
  fuel: 0.04,
  organic: 0.07,
  hide: 0.07, // raw animal skins weather like other organics (each also sets its own rate)
  food: 0.08,
  meat: 0.08,
  storage: 0.02,
  natural_weapon: 0 // innate attacks: never real dropped items, but immune for safety
};

/** Carry budget: `(CARRY_BASE_KG + brawn × CARRY_KG_PER_BRAWN) × frameFactor`.
 *  HIGH BASE, GENTLE SLOPE — calibrated against the growth ladder (ceiling 60, spawn cap 20) at both
 *  ends at once: a median SPAWN pawn (brawn 12) comfortably fields the light set plus a weapon
 *  (~11.6kg budget), while the steel heavy set (16.6kg) stays an EARNED milestone at ~90% of capacity
 *  at brawn 40, with medium arriving around brawn 30. A steep slope from a low base (tried first)
 *  gated steel correctly but starved the floor — spawn pawns were encumbered by cloth alone; the old
 *  0.85/brawn slope let a spawn pawn wear plate. Strength decides the CLASS you wear; it no longer
 *  decides whether you can dress at all. */
const CARRY_BASE_KG = 11;
const CARRY_KG_PER_BRAWN = 0.19;
/** The frame only MODULATES the brawn budget — a bigger body carries a little more, but mass can
 *  never stand in for strength (which is what the old bodyWeight-multiplied formula allowed). */
const CARRY_FRAME_REF_KG = 80;
const CARRY_FRAME_MIN = 0.85;
const CARRY_FRAME_MAX = 1.15;

/** Itemised carry-budget breakdown for the UI (see ItemService.getCarryCapacityBreakdown). */
export interface CarryCapacityBreakdown {
  /** Size category derived from the pawn's actual height (a description of height, not the culture box). */
  size: string;
  /** Height in cm (shown for context — carry is driven by body mass, not height). */
  height: number;
  /** Body mass in kg — the realistic driver of carry capacity. */
  bodyWeight: number;
  brawn: number;
  /** Realistic carry weight = bodyWeight × loadFraction (a STR-dependent % of body mass) + gear. */
  weight: {
    bodyWeight: number;
    loadFraction: number;
    capacity: number;
    gear: number;
    total: number;
  };
  /** Carry volume = bodyWeight × a frame fraction (brawn-independent bulk) + gear. */
  volume: { bodyWeight: number; fraction: number; capacity: number; gear: number; total: number };
  gearSources: { name: string; weightKg: number; volumeL: number }[];
}

/**
 * ItemService - Clean interface for item queries and operations
 * Separates business logic from data definitions
 */
export interface ItemService {
  // Query Methods
  getItemById(id: string): Item | undefined;
  /** R10: build a `dynamicName` item's per-instance name from a subject (e.g. "Bjorn's Corpse"). */
  makeDynamicName(itemId: string, subjectName: string): string;
  /** R10: display name for a dropped item — honours a `dynamicName` item's per-drop `name` override. */
  getItemDisplayName(drop: { resourceId: string; name?: string; quality?: ItemQuality }): string;
  /** §F8: compose a mixed-ingredient dish's per-instance name from the chosen ingredients
   *  ("Venison & Cabbage Stew"). Returns undefined unless the item is a `dynamicName` dynamicRecipe. */
  composeDynamicDishName(itemId: string, selected?: Record<string, string>): string | undefined;
  getItemsByType(type: string): Item[];
  getItemsByCategory(category: string): Item[];
  /** Distinct item categories (sorted), across the whole item DB. */
  getAllCategories(): string[];
  getCraftableItems(gameState: GameState, pawnId?: string): Item[];
  getItemsByWorkType(workType: string): Item[];

  // Validation Methods
  canCraftItem(itemId: string, gameState: GameState, pawnId?: string): boolean;
  /** Non-material craftability gates (station/tools/research/population/mold). Materials may be
   *  absent — a queued order then waits as `pending` until they're stocked. */
  canQueueCraft(itemId: string, gameState: GameState): boolean;
  /** The recipe-driven form of the non-material gate — used when the exact recipe is known (butchery
   *  resolved by carcass, an explicit alt-station recipe) rather than looked up by output item. */
  canQueueCraftRecipe(recipe: Recipe | undefined, gameState: GameState): boolean;
  /** Butchery dispatches by the CARCASS, not the shared meat output: the butchery recipe that consumes
   *  `carcassId`, preferring the highest-yield station currently built, else the lowest-tier recipe so
   *  it can queue pending a station. Undefined if nothing butchers this carcass. */
  resolveCarcassRecipe(carcassId: string, gameState: GameState): Recipe | undefined;
  hasRequiredMaterials(itemId: string, gameState: GameState): boolean;
  hasRequiredTools(itemId: string, gameState: GameState): boolean;
  hasRequiredBuilding(itemId: string, gameState: GameState): boolean;
  /** Returns the cost set to consume (primary or first matching alternative), or null if nothing is satisfied. */
  resolveActiveCost(
    itemId: string,
    gameState: GameState,
    selectedIngredients?: Record<string, string>
  ): Record<string, number> | null;
  /**
   * For items with a dynamicRecipe: auto-picks the first available item per slot
   * whose `category` matches `acceptsCategory`.
   * Returns {} for items with no dynamicRecipe, or null if a slot cannot be satisfied.
   */
  autoSelectIngredients(itemId: string, gameState: GameState): Record<string, string> | null;

  // Calculation Methods
  calculateCraftingCost(itemId: string): Record<string, number>;
  calculateItemEffects(itemId: string): Record<string, number>;

  // Display Methods
  getItemIcon(itemId: string): string;
  getItemColor(itemId: string): string;

  // Inventory Methods
  getAvailableQuantity(itemId: string, gameState: GameState): number;
  consumeItems(itemIds: Record<string, number>, gameState: GameState): GameState;
  addItems(itemIds: Record<string, number>, gameState: GameState): GameState;

  // Carry capacity
  getCarryBudget(pawn: Pawn, state: GameState): { maxWeightKg: number; maxVolumeL: number };
  /** Itemised carry-budget breakdown (body mass × brawn-scaled load fraction + gear) — single
   *  source of truth for the CAPACITIES panel and the CARRYING header so the UI can show the maths. */
  getCarryCapacityBreakdown(pawn: Pawn): CarryCapacityBreakdown;
  canAddToInventory(pawn: Pawn, itemId: string, qty: number, state: GameState): boolean;
  clampPickupQuantity(
    pawn: Pawn,
    itemId: string,
    qty: number,
    state: GameState,
    capFactor?: number
  ): number;
  getCurrentCarryLoad(pawn: Pawn, state: GameState): { weightKg: number; volumeL: number };

  // Decay
  /** Spoil perishables. `elapsedTicks` = ticks since the last call (the caller throttles this to run
   *  every N ticks, not every tick — spoilage clocks are days-long, so per-tick re-referencing of the
   *  whole `droppedItems` array is waste that churns the snapshot diff). */
  stepItemDecay(gameState: GameState, elapsedTicks?: number): GameState;
  /** Average carcass CONDITION (0–100) per carcass item type across stored stacks — the readout the
   *  sidebar/butchery panel show (replaces the old `carcassIntactness` map). No stock → 100 (fresh). */
  carcassConditionByType(gameState: GameState): Record<string, number>;
  /** Weather loose items. `elapsedTicks` = ticks since the last call (the caller throttles this to
   *  run every N ticks, not every tick — durability lifespans are days/weeks, so per-tick is waste). */
  stepItemDeterioration(gameState: GameState, elapsedTicks?: number): GameState;
  /** §B tool work-wear: spend durability on the colony's tool for `workCategory`; break at 0. */
  applyToolWear(workCategory: string, gameState: GameState): GameState;
  /** §B: wear a specific tool by id; it breaks (consumed) at maxDurability. */
  wearToolById(toolId: string, gameState: GameState): GameState;
  /** Passive drying (throttled, data-driven via item `driesTo`): firewood seasons by a lit fire;
   *  plant_fiber → hay and meat → dried_meat cure where warm & dry, faster on a rack. */
  stepDrying(gameState: GameState, elapsedTicks?: number): GameState;
  /** Drying seconds a stack of this resource needs before it cures (firewood → dry_firewood,
   *  plant_fiber → hay), for the UI dryness meter; null when the resource doesn't dry. */
  dryingTargetSeconds(resourceId: string): number | null;
  /** Live drying readout for a stack — progress, current rate, and the temperature/wetness/bonus
   *  driving it — for the UI dryness meter + speed arrow. null when the resource doesn't dry. */
  dryingStatus(d: DroppedItem, gameState: GameState): DryingStatus | null;
}

/**
 * ItemService Implementation
 */
export class ItemServiceImpl implements ItemService {
  getItemById(id: string): Item | undefined {
    // O(1) via the shared core index (core/itemDefs.ts) — a per-call `.find()` showed up hot in
    // the sim worker profile.
    return itemDefById(id);
  }

  makeDynamicName(itemId: string, subjectName: string): string {
    const def = this.getItemById(itemId);
    if (!def?.dynamicName) return def?.name ?? itemId;
    return `${subjectName}'s ${def.name}`;
  }

  composeDynamicDishName(itemId: string, selected?: Record<string, string>): string | undefined {
    const def = this.getItemById(itemId);
    const recipe = recipeService.getRecipeForItem(itemId);
    if (!def?.dynamicName || !recipe?.dynamicRecipe || !selected) return undefined;
    // Unique ingredient display names in slot order → "A", "A & B", "A, B & C".
    const names: string[] = [];
    for (const slotKey of Object.keys(recipe.dynamicRecipe)) {
      const ingId = selected[slotKey];
      if (!ingId) continue;
      const n = this.getItemById(ingId)?.name ?? ingId;
      if (!names.includes(n)) names.push(n);
    }
    if (names.length === 0) return def.name;
    const list =
      names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
    return `${list} ${def.name}`;
  }

  getItemDisplayName(drop: { resourceId: string; name?: string; quality?: ItemQuality }): string {
    const def = this.getItemById(drop.resourceId);
    if (def?.dynamicName && drop.name) return drop.name;
    const base = def?.name ?? drop.resourceId.replace(/_/g, ' ');
    // §Q: prepend the craft-quality prefix ("Masterwork Iron Sword"); Standard/undefined adds nothing.
    const prefix = qualityPrefix(drop.quality);
    return prefix ? `${prefix} ${base}` : base;
  }

  getItemsByType(type: string): Item[] {
    return ITEMS_DATABASE.filter((item) => item.type === type);
  }

  getItemsByCategory(category: string): Item[] {
    return ITEMS_DATABASE.filter((item) => itemMatchesCostCategory(item, category));
  }

  getAllCategories(): string[] {
    return [
      ...new Set(
        ITEMS_DATABASE.filter((item) => !item.hidden)
          .map((item) => item.category)
          .filter(Boolean)
      )
    ].sort();
  }

  getItemsByWorkType(workType: string): Item[] {
    return ITEMS_DATABASE.filter(
      (item) => item.gatheringTypes && item.gatheringTypes.includes(workType)
    );
  }

  getCraftableItems(gameState: GameState, pawnId?: string): Item[] {
    return ITEMS_DATABASE.filter((item) => {
      // Must have a producing recipe (authored in recipes.jsonc or synthesised from inline fields)
      if (!recipeService.getRecipeForItem(item.id)) return false;
      return this.canCraftItem(item.id, gameState, pawnId);
    });
  }

  canCraftItem(itemId: string, gameState: GameState, pawnId?: string): boolean {
    // Materials gate first; the remaining (non-material) gates live in canQueueCraft so an order
    // can be QUEUED without stock and wait as `pending` until the materials are stocked.
    if (!this.hasRequiredMaterials(itemId, gameState)) return false;
    return this.canQueueCraft(itemId, gameState);
  }

  canQueueCraft(itemId: string, gameState: GameState): boolean {
    // Butchery: a carcass has no producing recipe (it's an INPUT) — dispatch by the carcass to its
    // butchery recipe. Everything else flows from the item's producing recipe.
    const item = this.getItemById(itemId);
    if (!item) return false;
    const recipe = item.isCarcass
      ? this.resolveCarcassRecipe(itemId, gameState)
      : recipeService.getRecipeForItem(itemId);
    return this.canQueueCraftRecipe(recipe, gameState);
  }

  canQueueCraftRecipe(recipe: Recipe | undefined, gameState: GameState): boolean {
    if (!recipe) return false;
    // Tools (ADR-009: a crafted/owned tool of the required tier satisfies the gate).
    if ((recipe.toolTierRequired ?? 0) > colonyToolTier(gameState)) return false;
    // Station (ADR-016 tiers: a higher generic/butchery station supersedes a lower one).
    if (!buildingService.bestCraftStation(recipe.station ?? 'craft_spot', gameState)) return false;
    if (
      recipe.buildingRequired &&
      !(gameState.buildings ?? []).some(
        (b) => b.type === recipe.buildingRequired && b.status === 'complete'
      )
    )
      return false;
    // Research (DEBUG: `_devResearchGateOff` turns this gate off — see gamestate.ts).
    if (
      !gameState._devResearchGateOff &&
      recipe.researchRequired &&
      !gameState.completedResearch.includes(recipe.researchRequired)
    )
      return false;
    // Population.
    if (recipe.populationRequired && gameState.pawns.length < recipe.populationRequired)
      return false;
    return true;
  }

  resolveCarcassRecipe(carcassId: string, gameState: GameState): Recipe | undefined {
    const recipes = recipeService
      .getRecipesUsing(carcassId)
      .filter((r) => (r.inputs?.[carcassId] ?? 0) > 0);
    if (recipes.length === 0) return undefined;
    // Prefer the recipe whose station is currently BUILT and highest-yield (a Sanguinary Altar flense
    // over a butcher-spot render); if none is built, the lowest-tier recipe so it queues pending.
    const builtRank = (r: Recipe): number => {
      const b = buildingService.bestCraftStation(r.station ?? 'craft_spot', gameState);
      return b
        ? (buildingService.butcheryTier(b.type) ?? buildingService.stationTier(b.type) ?? 0)
        : -1;
    };
    let best = recipes[0];
    let bestRank = builtRank(best);
    for (const r of recipes.slice(1)) {
      const rank = builtRank(r);
      if (rank > bestRank) {
        bestRank = rank;
        best = r;
      }
    }
    if (bestRank < 0) {
      const bt = (r: Recipe) => buildingService.butcheryTier(r.station ?? '') ?? 99;
      best = recipes.reduce((lo, r) => (bt(r) < bt(lo) ? r : lo), recipes[0]);
    }
    return best;
  }

  hasRequiredMaterials(itemId: string, gameState: GameState): boolean {
    if (!recipeService.getRecipeForItem(itemId)) return true;
    return this.resolveActiveCost(itemId, gameState) !== null;
  }

  autoSelectIngredients(itemId: string, gameState: GameState): Record<string, string> | null {
    const recipe = recipeService.getRecipeForItem(itemId);
    if (!recipe?.dynamicRecipe) return {};
    const selected: Record<string, string> = {};
    // DISTINCT across slots: a mixed-ingredient dish (e.g. a 3-ingredient stew) auto-fills each slot
    // with a DIFFERENT in-stock item so it composes a varied meal, not three of the same. Tracks both
    // the chosen ids AND the running per-id demand so two slots landing on the same item still verify
    // the COMBINED quantity is in stock (the resolveActiveCost sum-path mirrors this).
    const demand: Record<string, number> = {};
    for (const [slotKey, slot] of Object.entries(recipe.dynamicRecipe)) {
      const cats = recipeService.slotCategories(slot);
      const candidates = ITEMS_DATABASE.filter(
        (i) =>
          cats.some((c) => itemMatchesCostCategory(i, c)) &&
          this.getAvailableQuantity(i.id, gameState) >= (demand[i.id] ?? 0) + slot.quantity
      );
      if (!candidates.length) return null;
      // Prefer an item not already chosen by another slot (variety); fall back to the first that still
      // has enough combined stock if every candidate is already taken.
      const chosen = candidates.find((c) => !(c.id in demand)) ?? candidates[0];
      selected[slotKey] = chosen.id;
      demand[chosen.id] = (demand[chosen.id] ?? 0) + slot.quantity;
    }
    return selected;
  }

  /**
   * Expand a cost map's `category:<cat>` slots (e.g. `category:plank` = "any plank") into concrete item
   * ids, paid greedily from AVAILABLE stock. Concrete keys are checked against stock too. Returns the
   * concrete `{itemId: qty}` map, or null if any slot can't be covered — the recipe analogue of
   * BuildingService.resolveBuildingCost.
   */
  expandCategoryCost(
    cost: Record<string, number>,
    gameState: GameState
  ): Record<string, number> | null {
    const out: Record<string, number> = {};
    const used: Record<string, number> = {};
    for (const [key, qty] of Object.entries(cost)) {
      if (key.startsWith('category:')) {
        const cat = key.slice('category:'.length);
        let need = qty;
        for (const item of ITEMS_DATABASE) {
          if (need <= 1e-9) break;
          if (!itemMatchesCostCategory(item, cat)) continue;
          const avail = this.getAvailableQuantity(item.id, gameState) - (used[item.id] ?? 0);
          if (avail <= 0) continue;
          // A crude material satisfies only a fraction of a unit, so more of it is consumed for the
          // same slot — cordage is a quarter of a seam, thread is a whole one. Without this the
          // cheapest member always wins and a category slot costs nothing.
          const worth = craftValueOf(item);
          const take = Math.min(avail, Math.ceil(need / worth));
          out[item.id] = (out[item.id] ?? 0) + take;
          used[item.id] = (used[item.id] ?? 0) + take;
          need -= take * worth;
        }
        if (need > 1e-9) return null;
      } else {
        const avail = this.getAvailableQuantity(key, gameState) - (used[key] ?? 0);
        if (avail < qty) return null;
        out[key] = (out[key] ?? 0) + qty;
        used[key] = (used[key] ?? 0) + qty;
      }
    }
    return out;
  }

  /** Stock-agnostic expansion: map each `category:<cat>` slot to a REPRESENTATIVE concrete item (the
   *  first match) so a pending/display cost never carries a raw `category:` key. */
  expandCategoryCostLoose(cost: Record<string, number>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [key, qty] of Object.entries(cost)) {
      if (key.startsWith('category:')) {
        const cat = key.slice('category:'.length);
        const repItem = ITEMS_DATABASE.find((i) => itemMatchesCostCategory(i, cat));
        const rep = repItem?.id ?? key;
        out[rep] = (out[rep] ?? 0) + Math.ceil(qty / craftValueOf(repItem));
      } else {
        out[key] = (out[key] ?? 0) + qty;
      }
    }
    return out;
  }

  resolveActiveCost(
    itemId: string,
    gameState: GameState,
    selectedIngredients?: Record<string, string>
  ): Record<string, number> | null {
    const recipe = recipeService.getRecipeForItem(itemId);
    if (!recipe) return null;

    // Resolve base crafting cost (empty inputs {} is valid — no base materials needed). Expands any
    // `category:` slots from stock; an unaffordable base falls through to the alternatives.
    let baseCost = this.expandCategoryCost(recipe.inputs, gameState);
    if (baseCost === null && recipe.inputAlternatives?.length) {
      for (const alt of recipe.inputAlternatives) {
        baseCost = this.expandCategoryCost(alt, gameState);
        if (baseCost) break;
      }
    }
    if (baseCost === null) return null;

    // No dynamic recipe — return base cost (original behaviour)
    if (!recipe.dynamicRecipe) return baseCost;

    // Resolve dynamic ingredient slots
    const selected = selectedIngredients ?? this.autoSelectIngredients(itemId, gameState);
    if (!selected) return null;

    // SUM per id across slots (two slots may legitimately pick the same item) — never overwrite, or a
    // 2× pick would only charge once. Verify the COMBINED demand against stock.
    const dynamicCosts: Record<string, number> = {};
    for (const [slotKey, slot] of Object.entries(recipe.dynamicRecipe)) {
      const chosenId = selected[slotKey];
      if (!chosenId) return null;
      dynamicCosts[chosenId] = (dynamicCosts[chosenId] ?? 0) + slot.quantity;
    }
    for (const [id, qty] of Object.entries(dynamicCosts)) {
      if (this.getAvailableQuantity(id, gameState) < qty) return null;
    }

    // Merge base + dynamic by SUMMING (a dish could also list a base input that overlaps a slot pick).
    const total: Record<string, number> = { ...baseCost };
    for (const [id, qty] of Object.entries(dynamicCosts)) total[id] = (total[id] ?? 0) + qty;
    return total;
  }

  hasRequiredTools(itemId: string, gameState: GameState): boolean {
    const tier = recipeService.getRecipeForItem(itemId)?.toolTierRequired;
    if (!tier) return true;
    // ADR-009: a crafted/owned tool of the required tier satisfies the gate, not only research.
    return colonyToolTier(gameState) >= tier;
  }

  hasRequiredBuilding(itemId: string, gameState: GameState): boolean {
    const recipe = recipeService.getRecipeForItem(itemId);
    // null station → at minimum a craft_spot. ADR-016 station tiers: a higher generic workshop
    // (Crude Workbench) supersedes a lower one (craft_spot), so it can fulfill the requirement.
    const station = recipe?.station ?? 'craft_spot';
    if (!buildingService.bestCraftStation(station, gameState)) return false;

    // Legacy buildingRequired field (exact-type, separate from the crafting station).
    if (!recipe?.buildingRequired) return true;
    return (gameState.buildings ?? []).some(
      (b) => b.type === recipe.buildingRequired && b.status === 'complete'
    );
  }

  calculateCraftingCost(itemId: string): Record<string, number> {
    const recipe = recipeService.getRecipeForItem(itemId);
    if (recipe)
      return this.expandCategoryCostLoose(
        Object.keys(recipe.inputs).length ? recipe.inputs : (recipe.inputAlternatives?.[0] ?? {})
      );
    return {};
  }

  calculateItemEffects(itemId: string): Record<string, number> {
    const item = this.getItemById(itemId);
    return item?.effects || {};
  }

  getItemIcon(itemId: string): string {
    const item = this.getItemById(itemId);
    return item?.emoji || '📦';
  }

  getItemColor(itemId: string): string {
    const item = this.getItemById(itemId);
    return item?.color || '#4CAF50';
  }

  getAvailableQuantity(itemId: string, gameState: GameState): number {
    // ADR-016: spendable stock = stored drops NOT reserved for a craft order. `stockpile`
    // still counts reserved stacks (physically present, shown in the UI); affordability must
    // not, or two orders could double-spend the same stock.
    return availableQuantityFromDrops(gameState.droppedItems, itemId);
  }

  consumeItems(itemIds: Record<string, number>, gameState: GameState): GameState {
    return consumeFromStockpiles(gameState, itemIds);
  }

  addItems(itemIds: Record<string, number>, gameState: GameState): GameState {
    // Route through addToStockpileZone so zone inventories and aggregate stay in sync.
    return addToStockpileZone(gameState, null, itemIds);
  }

  // ── Carry capacity ───────────────────────────────────────────────────────────────────────

  /**
   * Carry weight/volume budget for this pawn — physically grounded:
   *   maxWeightKg = bodyWeight × loadFraction      (loadFraction = clamp(STR × 0.012, 0.05, 0.30))
   *   maxVolumeL  = bodyWeight × 0.13
   * Carry capacity scales with BODY MASS and STRENGTH (a porter bears a higher fraction of their own
   * weight than a weakling), not a flat base or a distance-from-10 term — so doubling STR ~doubles the
   * load fraction instead of swinging a low-STR pawn to near-zero. Belt/back containers (inventoryBonus)
   * add on top.
   */
  getCarryBudget(pawn: Pawn, _state: GameState): { maxWeightKg: number; maxVolumeL: number } {
    const b = this.getCarryCapacityBreakdown(pawn);
    return { maxWeightKg: b.weight.total, maxVolumeL: b.volume.total };
  }

  getCarryCapacityBreakdown(pawn: Pawn): CarryCapacityBreakdown {
    const height = pawn.physicalTraits?.height ?? 170;
    const bodyWeight = pawn.physicalTraits?.weight ?? 70;
    const size = sizeFromHeight(height);
    const str = pawn.stats.brawn ?? 10;

    // WHAT A PAWN CAN BEAR — brawn-led, mass-modulated.
    //
    // This used to be `bodyWeight × clamp(brawn × 0.012, 0.05, 0.3)`, which broke twice over once the
    // core stats expanded to a 1–100 band:
    //   • the 0.30 clamp BOUND AT BRAWN 25, so every pawn from 25 to 100 carried exactly the same —
    //     a quarter of the population sat at the cap and brawn bought nothing above it;
    //   • capacity scaled linearly with body mass, so the budget was decided by how HEAVY a pawn was
    //     rather than how strong. With a median bodyweight of ~108kg that handed a weak, fat pawn a
    //     bigger budget than a lean strong one, and let any build wear plate + shield regardless.
    //
    // Now brawn sets the budget directly and the frame only modulates it: a bigger body carries a
    // little more, but it cannot substitute for strength.
    const carried = CARRY_BASE_KG + str * CARRY_KG_PER_BRAWN;
    const frameFactor = Math.min(
      CARRY_FRAME_MAX,
      Math.max(CARRY_FRAME_MIN, bodyWeight / CARRY_FRAME_REF_KG)
    );
    const capacity = carried * frameFactor;
    // Kept for the UI breakdown and the carry_weight readout: the EFFECTIVE share of body mass.
    const loadFraction = bodyWeight > 0 ? capacity / bodyWeight : 0;
    const VOLUME_FRACTION = 0.13;
    const weight = {
      bodyWeight,
      loadFraction,
      capacity,
      gear: 0,
      total: 0
    };
    const volume = {
      bodyWeight,
      fraction: VOLUME_FRACTION,
      capacity: bodyWeight * VOLUME_FRACTION,
      gear: 0,
      total: 0
    };

    // Any equipped item with an inventoryBonus raises the budget — belt/back pouches and baskets, and
    // (§L) a wheelbarrow/handcart held in hand. Only containers and carts carry the field, so scanning
    // every slot is safe and means a cart grants capacity from the mainHand slot it occupies.
    const gearSources: CarryCapacityBreakdown['gearSources'] = [];
    for (const inst of Object.values(pawn.equipment ?? {})) {
      if (!inst) continue;
      const def = this.getItemById(inst.itemId);
      if (def?.inventoryBonus) {
        weight.gear += def.inventoryBonus.weightKg;
        volume.gear += def.inventoryBonus.volumeL;
        gearSources.push({
          name: def.name,
          weightKg: def.inventoryBonus.weightKg,
          volumeL: def.inventoryBonus.volumeL
        });
      }
    }

    // Unified load model: worn ARMOUR adds VOLUME capacity (belt pouches / strap points) even as its
    // weight fills the weight budget — so armour isn't a pure carry sink. ~0.5 L per kg of armour.
    // Excludes containers (their inventoryBonus is already counted above) and shields.
    let armorPocketL = 0;
    for (const inst of Object.values(pawn.equipment ?? {})) {
      if (!inst) continue;
      const def = this.getItemById(inst.itemId);
      const ap = def?.armorProperties;
      if (!ap || ap.armorType === 'shield' || def?.inventoryBonus) continue;
      armorPocketL += (def?.weightKg ?? 0) * 0.5;
    }
    if (armorPocketL > 0.05) {
      volume.gear += armorPocketL;
      gearSources.push({
        name: 'armour pockets',
        weightKg: 0,
        volumeL: Math.round(armorPocketL * 10) / 10
      });
    }

    // ADR-029 (was ADR-028 rev): natural armor (iron skin, scaled hide…) is worn permanently, so
    // it eats a FRACTION of the pawn's carry capacity — never adds absolute kg (which could exceed a
    // weak pawn's whole budget and encumber it while bare). Summed penalties are clamped so capacity
    // always stays a positive share of the base (a pawn is never immobilised by its own hide).
    let carryPenalty = 0;
    for (const t of pawn.traits ?? []) carryPenalty += t.carryPenalty ?? 0;
    const carryMult = Math.max(0.4, 1 - carryPenalty);
    if (carryMult < 1) {
      weight.gear -= weight.capacity * (1 - carryMult); // shown as a negative "natural armour" source
      gearSources.push({
        name: 'natural armour',
        weightKg: -Math.round(weight.capacity * (1 - carryMult) * 10) / 10,
        volumeL: 0
      });
    }

    weight.total = Math.max(1, weight.capacity + weight.gear);
    volume.total = Math.max(1, volume.capacity + volume.gear);

    return { size, height, bodyWeight, brawn: str, weight, volume, gearSources };
  }

  /**
   * Current weight and volume load for this pawn. The pack (bulk `inventory.items` +
   * tracked `inventory.instances`) costs both weight AND volume. Equipped gear costs WEIGHT
   * ONLY — the pawn bears its mass (so an armoured pawn hauls less), but worn gear isn't in the
   * pack, so it doesn't consume pack volume. Belt/back containers separately RAISE the budget
   * via getCarryBudget's inventoryBonus.
   */
  getCurrentCarryLoad(pawn: Pawn, _state: GameState): { weightKg: number; volumeL: number } {
    let weightKg = 0;
    let volumeL = 0;

    // Bulk items (pack) — weight + volume
    for (const [itemId, qty] of Object.entries(pawn.inventory?.items ?? {})) {
      if (qty <= 0) continue;
      const def = this.getItemById(itemId);
      weightKg += (def?.weightKg ?? 0.1) * qty;
      volumeL += (def?.volumeL ?? 0.2) * qty;
    }

    // Tracked instances in inventory (pack) — weight + volume. §M the material it was crafted from
    // scales its weight (heavier hide → heavier item).
    for (const inst of pawn.inventory?.instances ?? []) {
      const def = this.getItemById(inst.itemId);
      weightKg += (def?.weightKg ?? 0.5) * (inst.matWeight ?? 1);
      volumeL += def?.volumeL ?? 0.5;
      // CONTAINERS-AND-FLUIDS §1: a full jug is not a jug. What a vessel holds costs the pawn both
      // weight and pack volume on top of the empty vessel's own.
      if (inst.contents?.length) {
        weightKg += usedWeightKg(inst);
        volumeL += usedCapacityL(inst);
      }
    }

    // Equipped gear — weight only (worn, not packed; see method doc).
    for (const inst of Object.values(pawn.equipment ?? {})) {
      if (!inst) continue;
      const def = this.getItemById(inst.itemId);
      weightKg += (def?.weightKg ?? 0.5) * (inst.matWeight ?? 1);
      // A worn vessel (a filled waterskin on the belt) still weighs what is in it. Its contents are
      // NOT pack volume — they are in the vessel, not the pack. Worn quivers hold nothing: their load
      // moves into the pack on equip (see PawnEquipment.equipItem).
      if (inst.contents?.length) weightKg += usedWeightKg(inst);
    }

    // TRAIT-SYSTEM-V2 §3 (ADR-028 rev): natural armor's burden is a CAPACITY reduction (getCarryBudget),
    // NOT invisible added weight — so it can never exceed a pawn's whole capacity and encumber it while
    // bare. Nothing to add to the load here.

    return { weightKg, volumeL };
  }

  /** Returns true if adding `qty` of `itemId` would not exceed weight or volume budget. */
  canAddToInventory(pawn: Pawn, itemId: string, qty: number, state: GameState): boolean {
    const budget = this.getCarryBudget(pawn, state);
    const current = this.getCurrentCarryLoad(pawn, state);
    const def = this.getItemById(itemId);
    const addW = (def?.weightKg ?? 0.1) * qty;
    const addV = (def?.volumeL ?? 0.2) * qty;
    return (
      current.weightKg + addW <= budget.maxWeightKg && current.volumeL + addV <= budget.maxVolumeL
    );
  }

  /**
   * R5: how many units of `itemId` the pawn can pick up without exceeding its weight/volume
   * budget (belt/back containers raise it). A pawn that can't fit a whole stack takes what fits
   * and leaves the rest for another trip. **Always floors at 1**: a single item is carried in the
   * hands, so capacity never blocks picking up ONE of it — a pawn must be able to haul a heavy
   * carcass (or, later, carry a downed pawn to shelter) even when it exceeds the budget. In
   * practice haulers are empty at pickup anyway (they deposit before taking new work), so this
   * only relaxes the genuinely-over-budget single-unit case.
   */
  clampPickupQuantity(
    pawn: Pawn,
    itemId: string,
    qty: number,
    state: GameState,
    capFactor = 1
  ): number {
    if (qty <= 0) return 0;
    const budget = this.getCarryBudget(pawn, state);
    const load = this.getCurrentCarryLoad(pawn, state);
    const def = this.getItemById(itemId);
    const perW = def?.weightKg ?? 0.1;
    const perV = def?.volumeL ?? 0.2;
    // capFactor > 1 lets haulers load past full capacity into the `encumbered` band (ENC_OVERLOAD_FULL).
    const maxW = budget.maxWeightKg * capFactor;
    const maxV = budget.maxVolumeL * capFactor;
    const byW = perW > 0 ? Math.floor((maxW - load.weightKg) / perW) : qty;
    const byV = perV > 0 ? Math.floor((maxV - load.volumeL) / perV) : qty;
    return Math.max(1, Math.min(qty, byW, byV));
  }

  /**
   * §C organic spoilage — per-stack. Every stack (stored or loose) of a perishable item accrues a
   * spoilage clock; at the def's decaySeconds one unit rots into `decaysTo`. A storage BUILDING on the
   * tile slows a stored stack's clock by its `effects.preservation` (meat hooks −20%, salting barrel
   * −45%…). Deeper preservation (cold/freezing) is owned by the temperature system (Living World).
   *
   * CONTAINERS-AND-FLUIDS: the four ITEMS that used to radiate the same bonus — a jug lying on the
   * floor keeping the meat beside it fresh — no longer do. A vessel preserves what is INSIDE it, and
   * only when it is sealed: `stepVesselDecay` below runs the same clock on nested contents, so putting
   * food in an open bucket is not a way to make it immortal.
   */
  stepItemDecay(gameState: GameState, elapsedTicks = 1): GameState {
    if (gameState._devFreezeSpoilage) return gameState; // DEBUG: freeze food/carcass spoilage (headless tests)
    const drops = gameState.droppedItems;
    if (!drops || drops.length === 0) return gameState;

    // Best preservation per tile — the storage BUILDING on it (meat hooks, salting barrel, root clamp).
    // Best one wins. Items no longer contribute: a container preserves its contents, not its neighbours.
    const tilePreserve = new Map<string, number>();
    const bump = (key: string, bonus: number | undefined) => {
      if (bonus === undefined || bonus <= 0) return;
      if (bonus > (tilePreserve.get(key) ?? 0)) tilePreserve.set(key, bonus);
    };
    for (const b of gameState.buildings ?? []) {
      if (b.status !== 'complete') continue;
      bump(
        `${b.x},${b.y}`,
        BUILDING_DEFS_FOR_ITEMS.find((def) => def.id === b.type)?.effects?.preservation
      );
    }

    // Drying context — so spoilage and drying can never run on the same stack at once (a stack is
    // EITHER curing OR spoiling, never both). Priority: reserved/processing > drying > spoiling.
    const dryCtx = dryingContext(gameState);

    let changed = false;
    const next: DroppedItem[] = [];
    const rotted: { resourceId: string; x: number; y: number; stored?: boolean; qty: number }[] =
      [];

    for (const d of drops) {
      const def = this.getItemById(d.resourceId);
      // A VESSEL is not perishable itself, but what is in it may be. Run the nested clock and move on.
      if (d.instance?.contents?.length) {
        const spoiled = this.stepVesselContents(d.instance, elapsedTicks, rotted, d);
        if (spoiled) changed = true;
      }
      if (!def?.decaySeconds || (d.quantity ?? 0) <= 0) {
        next.push(d);
        continue;
      }
      // A stack committed to a craft/ferment order (reservedFor — the transformation preserves it) or
      // one that is ACTIVELY drying (dry rate > 0) does NOT spoil. Everything else spoils as normal.
      // TODO(realism, low-prio): `reservedFor` exempts ANY reserved input from spoilage, not just
      // fermentation — so meat queued for a recipe won't rot while waiting. The intended rule is that
      // only FERMENTING (sealed/anaerobic) preservation halts spoilage; other reservations should still
      // rot. Narrow this by resolving the reserved order → recipe and checking the fermenter station.
      if (d.reservedFor || dryRateFor(d, gameState, dryCtx) > 0) {
        next.push(d);
        continue;
      }
      // Living World cold preservation: a sub-zero tile FREEZES the stack — bacterial spoilage halts
      // entirely below 0°C (the cold/freezing the container note defers to the temperature system). Uses
      // the SAME effective tile temp as drying (baked biome+season + weather/diurnal + nearby fire warmth),
      // so an open frozen tile keeps food while a stockpile beside a fire still rots.
      const fTile = gameState.worldMap?.[d.y]?.[d.x];
      if (
        fTile &&
        effectiveTemperature(
          seasonBakedTemp(fTile.terrainType, gameState.season),
          dryCtx.weatherTemp,
          thermalAt(d.x, d.y)
        ) < 0
      ) {
        next.push(d);
        continue;
      }
      const mult = d.stored ? 1 - (tilePreserve.get(`${d.x},${d.y}`) ?? 0) : 1;
      changed = true;

      // Carcasses (per-unit `unitConditions`): the environment rots the WHOLE pile, so erode EVERY
      // unit's condition this tick (a unit fully erodes over the def's decaySeconds). Units that reach 0
      // are stripped → `decaysTo`. This is distinct from CONSUMPTION, which only touches the top unit.
      if (d.unitConditions) {
        const conds = normalizeConditions(d.unitConditions, d.quantity);
        const erosion = (100 * SECONDS_PER_TICK * elapsedTicks * mult) / def.decaySeconds;
        const { conditions, removed } = decayAll(conds, erosion);
        for (let r = 0; r < removed; r++) {
          if (def.decaysTo) {
            rotted.push({ resourceId: def.decaysTo, x: d.x, y: d.y, stored: d.stored, qty: 1 });
          }
        }
        if (conditions.length > 0)
          next.push({ ...d, quantity: conditions.length, unitConditions: conditions });
        // length 0 → whole pile rotted away; drop it
        continue;
      }

      let acc = (d.decayAcc ?? 0) + SECONDS_PER_TICK * elapsedTicks * mult;
      let qty = d.quantity;
      while (acc >= def.decaySeconds && qty > 0) {
        acc -= def.decaySeconds;
        qty -= 1;
        if (def.decaysTo) {
          rotted.push({ resourceId: def.decaysTo, x: d.x, y: d.y, stored: d.stored, qty: 1 });
        }
      }
      if (qty > 0) next.push({ ...d, quantity: qty, decayAcc: acc });
      // qty 0 → stack fully rotted away; drop it
    }

    if (!changed) return gameState;

    // Merge rotted output into stacks at the same tile.
    for (const r of rotted) {
      const idx = next.findIndex(
        (d) =>
          d.resourceId === r.resourceId && d.x === r.x && d.y === r.y && !!d.stored === !!r.stored
      );
      if (idx >= 0) next[idx] = { ...next[idx], quantity: next[idx].quantity + r.qty };
      else {
        next.push({
          id: `rot-${r.resourceId}-${r.x}-${r.y}`,
          resourceId: r.resourceId,
          x: r.x,
          y: r.y,
          quantity: r.qty,
          stored: r.stored
        });
      }
    }

    return withDrops(gameState, next);
  }

  carcassConditionByType(gameState: GameState): Record<string, number> {
    return computeCarcassConditionByType(gameState.droppedItems);
  }

  /**
   * §C spoilage for what a VESSEL is holding. A sealed vessel (a stoppered jug, a bunged cask) halts
   * the clock the way `stored` shelters a stack from weather; an OPEN one — a bucket — gives its
   * contents no protection at all, so stuffing food in a bucket is not a way to make it immortal.
   *
   * Mutates the instance's contents in place (a cold, rarely-touched path) and pushes anything that
   * rots into the shared `rotted` list, which is laid down on the vessel's own tile — a jar of berries
   * that turns leaves rotten berries where the jar is standing.
   */
  private stepVesselContents(
    inst: ItemInstance,
    elapsedTicks: number,
    rotted: { resourceId: string; x: number; y: number; stored?: boolean; qty: number }[],
    at: { x: number; y: number; stored?: boolean }
  ): boolean {
    if (vesselOf(inst.itemId)?.sealed) return false;
    let changed = false;
    const kept: NonNullable<ItemInstance['contents']> = [];
    for (const e of inst.contents ?? []) {
      const def = this.getItemById(e.itemId);
      if (!def?.decaySeconds || e.amount == null) {
        kept.push(e);
        continue;
      }
      let acc = (e.decayAcc ?? 0) + SECONDS_PER_TICK * elapsedTicks;
      let qty = e.amount;
      while (acc >= def.decaySeconds && qty > 0) {
        acc -= def.decaySeconds;
        qty -= 1;
        if (def.decaysTo)
          rotted.push({ resourceId: def.decaysTo, x: at.x, y: at.y, stored: at.stored, qty: 1 });
      }
      changed = true;
      if (qty > 0) kept.push({ ...e, amount: qty, decayAcc: acc });
    }
    if (changed) inst.contents = kept.length ? kept : undefined;
    return changed;
  }

  /**
   * §B Durability — the elements (wind/rain) physically wearing an item apart. EVERY item has a
   * durability pool: a loose stack (DroppedItem with `stored !== true`) loses `deteriorationRate`
   * durability per tick from its `maxDurability` pool; at 0 the stack is destroyed. Items in a
   * container / on a stockpile tile (`stored`) are sheltered — no exposure damage (spec §F).
   *
   * This is SEPARATE from spoilage (`stepItemDecay`/`decaySeconds`), which rots food into
   * `rotten_food` on a clock. A berry left out both weathers (durability) and rots (spoilage);
   * a plank only weathers. Rate/pool default by category and can be overridden per item; a rate
   * of 0 means weather-immune.
   */
  stepItemDeterioration(gameState: GameState, elapsedTicks = 1): GameState {
    if (gameState._devFreezeDeterioration) return gameState; // DEBUG: freeze weather wear (headless tests)
    const dropped = gameState.droppedItems;
    if (!dropped || dropped.length === 0) return gameState;

    // §G: a roof shelters the tile — loose items under it take no weather damage.
    const roofed = new Set<string>();
    for (const b of gameState.buildings ?? []) {
      if (b.status !== 'complete') continue;
      const def = BUILDING_DEFS_FOR_ITEMS.find((x) => x.id === b.type);
      if ((def?.effects as Record<string, number> | undefined)?.['roof'])
        roofed.add(`${b.x},${b.y}`);
    }
    // Weather scales the wear on EXPOSED (loose, un-roofed) stacks the same way it scales structural
    // wear — a storm rusts/warps loose gear fast, a clear calm day barely touches it. One scalar per
    // tick (SHARED with stepBuildingCondition, no per-tile calc; sheltered items are excluded below).
    const weatherMul = weatherExposureFactor(gameState.weather);

    let changed = false;
    const next: DroppedItem[] = [];
    for (const di of dropped) {
      if (di.stored || roofed.has(`${di.x},${di.y}`)) {
        next.push(di);
        continue;
      }
      const def = this.getItemById(di.resourceId);
      if (!def) {
        next.push(di);
        continue;
      }
      const rate = this.deteriorationRateFor(def);
      if (rate <= 0) {
        next.push(di); // weather-immune
        continue;
      }
      const max = def.maxDurability ?? DEFAULT_MAX_DURABILITY;
      const left =
        (di.durability ?? max) - rate * DETERIORATION_GLOBAL_SCALE * elapsedTicks * weatherMul;
      changed = true;
      if (left <= 0) {
        // destroyed by the elements — the stack is removed
        continue;
      }
      next.push({ ...di, durability: left });
    }

    return changed ? { ...gameState, droppedItems: next } : gameState;
  }

  /**
   * Per-tick durability lost to weather when exposed. Uses the item's explicit `deteriorationRate`
   * if set, else a sensible default by category so EVERY item weathers (stone barely; organics
   * fast). Return 0 to make an item weather-immune.
   */
  private deteriorationRateFor(def: Item): number {
    if (def.deteriorationRate !== undefined) return def.deteriorationRate;
    return DETERIORATION_RATE_BY_CATEGORY[def.category] ?? DEFAULT_DETERIORATION_RATE;
  }

  /** Drying seconds before a stack cures, for the UI dryness meter (null = doesn't dry). */
  dryingTargetSeconds(resourceId: string): number | null {
    return dryingRuleFor(resourceId)?.seconds ?? null;
  }

  /** Live drying readout for one stack (mirrors stepDrying via the shared ambientDryRate / fire-ring
   *  rules). Uses computeThermalAt so the HUD on the main thread samples fire warmth correctly. */
  dryingStatus(d: DroppedItem, gameState: GameState): DryingStatus | null {
    // Reserved → committed to a craft/ferment order: it's neither drying nor spoiling, so show nothing.
    if (d.reservedFor) return null;
    const rule = dryingRuleFor(d.resourceId);
    if (!rule) return null;
    const target = rule.seconds;
    const progress = d.drying ?? 0;

    if (rule.mode === 'fire-ring') {
      // Seasons only inside the lit-fire ring (Chebyshev exactly 2), at a fixed rate.
      let nearest = Infinity;
      for (const b of gameState.buildings ?? []) {
        if (b.status === 'complete' && b.lit)
          nearest = Math.min(nearest, chebyshev(d.x, d.y, b.x, b.y));
      }
      const inRing = nearest === 2;
      return {
        target,
        progress,
        rate: inRing ? 1 : 0,
        reason: inRing ? undefined : 'no-fire',
        bonus: 1
      };
    }

    // Ambient cure (hay, dried meat): temperature/wetness, multiplied by a rack's dryingBonus.
    const tile = gameState.worldMap?.[d.y]?.[d.x];
    if (!tile) return { target, progress, rate: 0, reason: 'cold', bonus: 1 };
    const thermal = computeThermalAt(d.x, d.y, gameState.buildings, gameState.worldMap);
    const weatherTemp =
      weatherEffects(gameState.weather).tempDelta +
      diurnalTempDelta(gameState.turn, gameState.season);
    const temp = effectiveTemperature(
      seasonBakedTemp(tile.terrainType, gameState.season),
      weatherTemp,
      thermal
    );
    let bonus = 1;
    for (const b of gameState.buildings ?? []) {
      if (b.status !== 'complete' || b.x !== d.x || b.y !== d.y) continue;
      bonus = Math.max(bonus, buildingService.getBuildingById(b.type)?.effects?.dryingBonus ?? 0);
    }
    const rate = ambientDryRate(
      temp,
      tileWetness(tile.moisture ?? 0, gameState.weather, thermal),
      bonus,
      thermal.warmth
    );
    // Effective wetness the stack feels — a nearby fire evaporates surface moisture (dryingWetness).
    const wetness = dryingWetness(
      tileWetness(tile.moisture ?? 0, gameState.weather, thermal),
      thermal.warmth
    );
    // rate ≤ 0 is either too wet (reversing / wetness-stall) or too cold — report whichever is binding.
    const reason = rate > 0 ? undefined : wetness >= DRY_WET_DAMP ? 'wet' : 'cold';
    return { target, progress, rate, reason, temp, wetness, bonus };
  }

  /**
   * Passive drying (data-driven via item `driesTo`), throttled to every `elapsedTicks` ticks like
   * spoilage (a drying clock is days-long). Two cures share the pass:
   *  • 'fire-ring' (green_firewood → dry_firewood): seasons within 2 tiles of a lit fire, at a fixed rate.
   *  • 'ambient' (plant_fiber → hay, any meat → dried_meat): cures where warm AND dry — accrues with
   *    warmth above DRY_TEMP_FLOOR up to DRY_TEMP_REF while wetness is below the wet threshold; a wet
   *    tile (rain/water/bog) reverses it. A rack (effects.dryingBonus) multiplies the rate; a nearby
   *    fire warms the tile (thermalAt), so the two stack.
   */
  stepDrying(gameState: GameState, elapsedTicks = 1): GameState {
    const drops = gameState.droppedItems;
    if (!drops || drops.length === 0) return gameState;

    // Cheap pre-scan: skip the whole (allocating) pass unless something free + dryable is on the ground
    // (reserved stacks are committed to an order — e.g. fermenting — and never dry).
    let hasDryable = false;
    for (const d of drops) {
      if ((d.quantity ?? 0) <= 0 || d.reservedFor) continue;
      if (dryingRuleFor(d.resourceId)) {
        hasDryable = true;
        break;
      }
      // CONTAINERS-AND-FLUIDS: firewood seasons just as well inside an OPEN crate as in the yard.
      if (
        d.instance?.contents?.length &&
        !vesselOf(d.resourceId)?.sealed &&
        d.instance.contents.some((e) => e.amount != null && dryingRuleFor(e.itemId))
      ) {
        hasDryable = true;
        break;
      }
    }
    if (!hasDryable) return gameState;

    const ctx = dryingContext(gameState);
    const dt = SECONDS_PER_TICK * elapsedTicks;

    let changed = false;
    const next = drops.map((d) => {
      // Reserved → committed to a craft/ferment order: the transformation owns it, so it neither
      // dries nor (in stepItemDecay) spoils. Fermenting overrides both.
      if ((d.quantity ?? 0) <= 0 || d.reservedFor) return d;
      const rule = dryingRuleFor(d.resourceId);
      if (!rule) {
        // Not dryable itself — but it may be a VESSEL holding something that is. An open vessel lets
        // the air through; a sealed one is exactly why you cannot season timber in a bunged cask.
        if (!d.instance?.contents?.length || vesselOf(d.resourceId)?.sealed) return d;
        let touched = false;
        const contents = d.instance.contents.map((e) => {
          const r = e.amount != null ? dryingRuleFor(e.itemId) : null;
          if (!r) return e;
          const rate = dryRateFor(d, gameState, ctx, r);
          if (rate <= 0) return e;
          const drying = Math.max(0, (e.drying ?? 0) + dt * rate);
          touched = true;
          return drying >= r.seconds
            ? { ...e, itemId: r.itemId, drying: undefined }
            : { ...e, drying };
        });
        if (!touched) return d;
        changed = true;
        return { ...d, instance: { ...d.instance, contents } };
      }
      const rate = dryRateFor(d, gameState, ctx);
      if (rate === 0) return d; // idle (too cold / not by a fire) — just sits (it spoils instead)
      const have = d.drying ?? 0;
      if (rate < 0 && have <= 0) return d; // wet, but nothing to lose
      const drying = Math.max(0, have + dt * rate);
      changed = true;
      if (rate > 0 && drying >= rule.seconds)
        return { ...d, resourceId: rule.itemId, drying: undefined };
      return { ...d, drying };
    });

    if (!changed) return gameState;
    return withDrops(gameState, next);
  }

  /**
   * §B tool work-wear. Each completed work action spends `durabilityLossPerAction` from the
   * colony's tool stock for that work category (tracked in gameState.toolWear). When the
   * accumulated wear reaches the tool's maxDurability, one tool breaks — consumed from the
   * stockpile — and the counter resets. Beginner stone tools are deliberately fragile
   * (stone_axe: 40/5 → ~8 fells per axe).
   */
  applyToolWear(workCategory: string, gameState: GameState): GameState {
    const stockpile = gameState.stockpile ?? {};
    // The tool in stock that serves this work category (e.g. stone_axe → woodcutting).
    const tool = ITEMS_DATABASE.find(
      (i) =>
        i.type === 'tool' &&
        (i.processingType?.includes(workCategory) || i.category === workCategory) &&
        (stockpile[i.id] ?? 0) > 0
    );
    if (!tool) return gameState; // bare hands — nothing to wear
    return this.wearToolById(tool.id, gameState);
  }

  /**
   * §B/§5: spend one action's wear on a specific tool/mold by id (tracked in gameState.toolWear);
   * when accumulated wear reaches its maxDurability, one unit breaks (consumed) and the counter
   * resets. Used for work-tool wear and per-cast casting-mold wear.
   */
  wearToolById(toolId: string, gameState: GameState): GameState {
    if ((gameState.stockpile?.[toolId] ?? 0) <= 0) return gameState;
    const def = this.getItemById(toolId);
    const loss = def?.durabilityLossPerAction ?? 2;
    const max = def?.maxDurability ?? 40;
    const wear = { ...(gameState.toolWear ?? {}) };
    wear[toolId] = (wear[toolId] ?? 0) + loss;
    if (wear[toolId] >= max) {
      wear[toolId] = 0;
      console.log(`[ItemService] ${def?.name ?? toolId} broke/cracked from use`);
      return { ...this.consumeItems({ [toolId]: 1 }, gameState), toolWear: wear };
    }
    return { ...gameState, toolWear: wear };
  }
}

// Export singleton instance
export const itemService = new ItemServiceImpl();
