// Craft job handler (ADR-016 / ADR-017). Opens a craft job at the workstation tile once an order's
// inputs are staged there (passive furnaces produce without a pawn job) and, on completion, runs the
// producing recipe: destroy staged inputs, spawn outputs on the station tile, apply mold wear, drain
// the queue. `completeCraftOrder` is also called directly for passive furnace production. Extracted
// from JobService (P-4 handler split).
import type { CraftingInProgress, GameState, Job, ItemQuality } from '../../core/types';
// Gated console shim — see core/log.ts. Silences per-tick log/debug/warn unless gameDebug(true).
import { gatedConsole as console } from '../../core/log';
import { itemService } from '../ItemService';
import { recipeService } from '../RecipeService';
import { pawnStatService } from '../PawnStatService';
import { craftWorkCategory } from './craftDiscipline';
import { rollCraftQuality, qualityMultiplier } from '../../core/itemQuality';
import { aggregateMaterialMods } from '../../core/materialProperties';
import {
  absorbDropIfOnStockpileTile,
  reserveForOrder,
  releaseReservation
} from '../../core/GameState';
import { rng } from '../../core/rng';
import { stationTileFor, orderSupplied } from './staging';
import { wearWorkingPawnTool } from './harvest';

/**
 * Queue-without-materials (ADR-016): a `pending` craft order holds no input reservations. Each tick
 * we retry reserving its full input set ATOMICALLY — only when every input is reservable do we commit
 * the reservations and clear `pending`, at which point the fetch/craft generators take over. A partial
 * reservation is discarded so the stock stays free for other (already-active) orders meanwhile.
 */
export function reservePendingOrders(gs: GameState): GameState {
  const queue = gs.craftingQueue ?? [];
  if (!queue.some((o) => o.pending)) return gs;

  let state = gs;
  let changed = false;
  const newQueue = queue.map((order) => {
    if (!order.pending) return order;
    let trial = state;
    let allReserved = true;
    for (const [id, q] of Object.entries(order.inputs)) {
      const res = reserveForOrder(trial, id, q, order.id);
      trial = res.state;
      if (res.reserved < q) {
        allReserved = false;
        break;
      }
    }
    if (!allReserved) {
      // Discard the partial reservations (they only ever touched the throwaway `trial`).
      releaseReservation(trial, order.id);
      return order; // still pending
    }
    state = trial; // commit
    changed = true;
    const { pending: _drop, ...rest } = order;
    return rest;
  });

  return changed ? { ...state, craftingQueue: newQueue } : gs;
}

export function generate(jobs: Job[], gs: GameState): Job[] {
  // Remove craft jobs for queue entries that no longer exist or are paused (pausing stops active work;
  // workDone on the order is preserved, the job re-opens on resume).
  jobs = jobs.filter((j) => {
    if (j.type !== 'craft') return true;
    const order = (gs.craftingQueue ?? []).find((e) => e.id === j.craftQueueId);
    return !!order && !order.paused;
  });

  // Real queue priority: a physical workstation works ONE order at a time, in queue (array) order.
  // `stationsBusy` holds the station building ids that already own an active craft job — pre-seeded
  // from in-progress craft jobs (don't preempt started work / waste workDone), then claimed by the
  // earliest supplied order as we walk the queue. Hand-craftable orders (no station building) aren't
  // gated — they have no shared station to serialise on. Keyed by stationBuildingId so two physical
  // stations of the same type still run in parallel.
  const stationsBusy = new Set<string>();
  for (const j of jobs) {
    if (j.type !== 'craft' || !j.buildingId) continue;
    stationsBusy.add(j.buildingId);
  }

  // Add a craft job only once the order's inputs are fully staged on its station tile, and
  // target that tile so the pawn actually walks to the workstation to craft (ADR-016).
  for (const order of gs.craftingQueue ?? []) {
    if (!order.id) continue;
    // Paused: no craft job, and (by skipping before the station-busy claim) it doesn't block later
    // orders queued at the same station.
    if (order.paused) continue;
    // ADR-016 passive furnaces: no pawn-worked craft job — the station produces it over time
    // (GameEngineImpl.processPassiveProduction). Inputs are still fetched/staged as usual. Honour
    // per-RECIPE `passive` (not just passive STATIONS) so a mixed station like stone_forge/hearth can
    // smelt/render passively while its shaping/cooking recipes stay pawn-worked.
    if (
      recipeService.isPassive(recipeService.getRecipeForItem(order.item.id)) ||
      recipeService.isPassiveStation(order.stationType)
    )
      continue;
    // Skip this order if a higher-priority (earlier-queued) order already holds its station.
    if (order.stationBuildingId && stationsBusy.has(order.stationBuildingId)) continue;
    const station = stationTileFor(order, gs);
    if (!station) continue;
    if (!orderSupplied(order, station, gs)) continue;
    const exists = jobs.some((j) => j.type === 'craft' && j.craftQueueId === order.id);
    if (!exists) {
      if (order.stationBuildingId) stationsBusy.add(order.stationBuildingId);
      jobs.push({
        id: `craft-${order.id}`,
        type: 'craft',
        targetX: station.x,
        targetY: station.y,
        craftQueueId: order.id,
        buildingId: order.stationBuildingId,
        workRequired: order.workRequired ?? order.item.craftingTime ?? 1,
        workDone: order.workDone ?? 0,
        claimedBy: null
      });
    }
  }

  return jobs;
}

export function complete(job: Job, gs: GameState): GameState {
  if (!job.craftQueueId) return gs;
  const entry = (gs.craftingQueue ?? []).find((e) => e.id === job.craftQueueId);
  if (!entry) return gs;
  // §Q (R8): roll the output's quality tier from the working pawn's quality work-axis (stats.jsonc) —
  // skill stat plus the sight/manipulation/consciousness capacities, so a wounded or in-the-dark
  // worker produces worse work through the existing model. Passive furnace production has no working
  // pawn (handled by completeCraftOrder's undefined default → Standard).
  // The quality axis is the DISCIPLINE's `*_quality` (cooking for a meal, metalworking at an anvil,
  // leatherworking at a tannery, alchemy at a lab, butchery at a butcher spot, else generic crafting) —
  // same resolution JobService uses for the labor category, so priority and quality can't drift. A
  // skilled cook also stretches ingredients into more nourishing portions (tier scales meal yield).
  let quality: ItemQuality | undefined;
  const pawn = job.claimedBy ? gs.pawns.find((p) => p.id === job.claimedBy) : undefined;
  if (pawn) {
    const discipline = craftWorkCategory(entry);
    const axis = pawnStatService.getWorkModifiers(pawn, discipline, undefined, 'crafting').quality ?? 1;
    quality = rollCraftQuality(axis, () => rng.random());
  }
  let state = completeCraftOrder(entry, gs, quality);
  // ADR-009 step 2: wear the WORKING pawn's craft tool (e.g. the knife used at a butcher spot /
  // tannery). Only the pawn-worked path wears a tool — passive furnace production has no pawn.
  const req = recipeService.toolRequirementForRecipe(recipeService.getRecipeForItem(entry.item.id));
  if (req && job.claimedBy) state = wearWorkingPawnTool(job.claimedBy, req.workType, state);
  return state;
}

/**
 * ADR-016: complete a craft ORDER (independent of a pawn job) — destroy the inputs staged on
 * its station, spawn outputs on the station tile, apply mold wear, and remove the order. Used
 * by both the pawn-worked craft completion (complete) and passive furnace production
 * (GameEngineImpl.processPassiveProduction).
 */
/** Output item types that carry a per-stack §Q quality tier (instance-bearing equipment & tools).
 *  Bulk materials/consumables stack freely and don't carry per-unit quality (batch-quality open Q). */
const QUALITY_STAMPED_TYPES = new Set(['weapon', 'armor', 'tool']);

export function completeCraftOrder(
  entry: CraftingInProgress,
  gs: GameState,
  quality?: ItemQuality
): GameState {
  // Recipe registry (Stage C): a craft completion runs the producing recipe once per queued
  // unit and emits ALL its outputs — the primary product plus any byproducts (e.g. splitting
  // a log yields firewood AND branches; charcoal burns yield ash).
  const itemId = entry.item.id;
  const quantity = entry.quantity ?? 1;
  const recipe = recipeService.getRecipeForItem(itemId);
  const recipeOutputs: Record<string, number> = recipe ? recipe.outputs : { [itemId]: 1 };

  // Butchery: the consumed carcass's CONDITION (its top unit — see core/carcassCondition.ts) scales the
  // meat/pelt yield, so a half-eaten or spoiled carcass gives less. Read it off the reserved carcass
  // input staged for this order (destroyed below); 1.0 for ordinary crafts with no carcass input.
  const carcassInput = (gs.droppedItems ?? []).find(
    (d) =>
      d.reservedFor === entry.id &&
      d.unitConditions?.length &&
      itemService.getItemById(d.resourceId)?.isCarcass
  );
  const conditionMult = carcassInput ? (carcassInput.unitConditions![0] ?? 100) / 100 : 1;

  const outputs: Record<string, number> = {};
  for (const [outId, outQty] of Object.entries(recipeOutputs)) {
    let qty = outQty * quantity;
    // Carcass condition scales the yield (floor + rng "carry" so a low-condition carcass still has a
    // proportional chance at each unit rather than always rounding down to nothing).
    if (conditionMult < 1) {
      const scaled = qty * conditionMult;
      const whole = Math.floor(scaled);
      qty = whole + (rng.random() < scaled - whole ? 1 : 0);
    }
    // §F cooked-meal quality: FOOD outputs are scaled by the rolled quality tier (cooking_quality →
    // 0.8×–1.8× via qualityMultiplier) — bulk food carries no per-unit identity, so meal quality
    // lands as nourishment YIELD at cook time rather than a per-stack tier. The fractional remainder
    // is an rng "carry" so even single-portion meals benefit on average (not just batches).
    if (quality !== undefined && itemService.getItemById(outId)?.category === 'food') {
      const scaled = qty * qualityMultiplier(quality);
      const whole = Math.floor(scaled);
      qty = Math.max(1, whole + (rng.random() < scaled - whole ? 1 : 0));
    }
    outputs[outId] = (outputs[outId] ?? 0) + qty;
  }

  // ADR-016: destroy the inputs staged on the station (the reserved drops carried here), then
  // spawn the outputs as drops ON the station tile. If the tile is a stockpile they're absorbed;
  // otherwise they sit on the station until a hauler stores them — exactly the physical model.
  // §M material durability: the dynamic material this craft consumed (oak vs pine plank, sturdy vs thin
  // leather) scales the finished item's durability. Read it off the reserved inputs before they're
  // destroyed below; 1 (neutral) when nothing material was used.
  const matDur = aggregateMaterialMods(
    (gs.droppedItems ?? []).filter((d) => d.reservedFor === entry.id).map((d) => d.resourceId),
    'item'
  ).durability;

  const station = stationTileFor(entry, gs);
  const droppedItems = (gs.droppedItems ?? []).filter((d) => d.reservedFor !== entry.id);
  const newQueue = (gs.craftingQueue ?? []).filter((e) => e.id !== entry.id);
  let state: GameState = { ...gs, droppedItems, craftingQueue: newQueue };

  if (station) {
    const newDropIds: string[] = [];
    const next = [...(state.droppedItems ?? [])];
    for (const [outId, qty] of Object.entries(outputs)) {
      if (qty <= 0) continue;
      // §Q: stamp the rolled tier onto instance-bearing equipment/tools only; bulk byproducts go plain.
      const stamp =
        quality !== undefined &&
        QUALITY_STAMPED_TYPES.has(itemService.getItemById(outId)?.type ?? '');
      // §F8: the PRIMARY output of a mixed-ingredient dish gets a composed per-instance name
      // ("Venison & Cabbage Stew"). A named drop won't fold into a counted pile (GameState.ts) — each
      // distinct dish stays its own stack, which is the intent for a self-naming meal.
      const dishName =
        outId === itemId
          ? itemService.composeDynamicDishName(itemId, entry.selectedIngredients)
          : undefined;
      // PERF (render-side FPS): a plain bulk output folds into an existing LOOSE pile of the same
      // resource already sitting on the station tile, instead of spawning a fresh stack every
      // completion. Without this, a station crafted repeatedly off any stockpile (e.g. a chopping_block
      // turning logs → firewood) piles up dozens of redundant same-tile stacks — `droppedItems` grows
      // unbounded and the per-frame item overlay (overlayDroppedItems, no viewport cull) iterates +
      // re-resolves them all every frame, tanking FPS while the sim TPS stays flat. (Stockpile tiles
      // already merge via absorbDropIfOnStockpileTile; this is the non-stockpile case.) Identity-bearing
      // drops — §Q quality, dish name, tracked instance, per-unit carcass conditions — never fold.
      const plain = !stamp && !dishName;
      if (plain) {
        const mergeIdx = next.findIndex(
          (d) =>
            d.resourceId === outId &&
            d.x === station.x &&
            d.y === station.y &&
            !d.stored &&
            !d.reservedFor &&
            !d.forbidden &&
            d.name == null &&
            d.quality == null &&
            d.instance == null &&
            d.unitConditions == null
        );
        if (mergeIdx >= 0) {
          next[mergeIdx] = { ...next[mergeIdx], quantity: next[mergeIdx].quantity + qty };
          continue;
        }
      }
      const id = `craft-${outId}-${station.x}-${station.y}-${Date.now()}-${rng.random().toString(36).slice(2, 5)}`;
      next.push({
        id,
        resourceId: outId,
        x: station.x,
        y: station.y,
        quantity: qty,
        ...(stamp ? { quality } : {}),
        ...(stamp && matDur !== 1 ? { matDur } : {}),
        ...(dishName ? { name: dishName } : {})
      });
      newDropIds.push(id);
    }
    state = { ...state, droppedItems: next };
    for (const id of newDropIds) state = absorbDropIfOnStockpileTile(state, id);
  } else {
    // Station vanished mid-craft — fall back to crediting the general stockpile so output isn't lost.
    state = itemService.addItems(outputs, state);
  }

  // §5 casting molds are single-use raw material: a casting recipe lists `clay_mold` in its
  // inputs and consumes it like any other ingredient (the mold is broken to free the casting).
  // No separate wear pass — input consumption already spent it.

  console.log(
    `[JobService] Crafting complete: ${itemId} ×${outputs[itemId] ?? 0} (${Object.keys(outputs).length} output types) at station ${entry.stationBuildingId ?? '—'}`
  );
  return state;
}
