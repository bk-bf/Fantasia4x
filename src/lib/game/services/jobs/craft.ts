// Craft job handler (ADR-016 / ADR-017). Opens a craft job at the workstation tile once an order's
// inputs are staged there (passive furnaces produce without a pawn job) and, on completion, runs the
// producing recipe: destroy staged inputs, spawn outputs on the station tile, apply mold wear, drain
// the queue. `completeCraftOrder` is also called directly for passive furnace production. Extracted
// from JobService (P-4 handler split).
import type { CraftingInProgress, GameState, Job } from '../../core/types';
// Gated console shim — see core/log.ts. Silences per-tick log/debug/warn unless gameDebug(true).
import { gatedConsole as console } from '../../core/log';
import { itemService } from '../ItemService';
import { recipeService } from '../RecipeService';
import { absorbDropIfOnStockpileTile } from '../../core/GameState';
import { rng } from '../../core/rng';
import { stationTileFor, orderSupplied } from './staging';

export function generate(jobs: Job[], gs: GameState): Job[] {
  // Remove craft jobs for queue entries that no longer exist
  jobs = jobs.filter((j) => {
    if (j.type !== 'craft') return true;
    return (gs.craftingQueue ?? []).some((e) => e.id === j.craftQueueId);
  });

  // Add a craft job only once the order's inputs are fully staged on its station tile, and
  // target that tile so the pawn actually walks to the workstation to craft (ADR-016).
  for (const order of gs.craftingQueue ?? []) {
    if (!order.id) continue;
    // ADR-016 passive furnaces: no pawn-worked craft job — the station produces it over time
    // (GameEngineImpl.processPassiveProduction). Inputs are still fetched/staged as usual. Honour
    // per-RECIPE `passive` (not just passive STATIONS) so a mixed station like stone_forge/hearth can
    // smelt/render passively while its shaping/cooking recipes stay pawn-worked.
    if (
      recipeService.isPassive(recipeService.getRecipeForItem(order.item.id)) ||
      recipeService.isPassiveStation(order.stationType)
    )
      continue;
    const station = stationTileFor(order, gs);
    if (!station) continue;
    if (!orderSupplied(order, station, gs)) continue;
    const exists = jobs.some((j) => j.type === 'craft' && j.craftQueueId === order.id);
    if (!exists) {
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
  return completeCraftOrder(entry, gs);
}

/**
 * ADR-016: complete a craft ORDER (independent of a pawn job) — destroy the inputs staged on
 * its station, spawn outputs on the station tile, apply mold wear, and remove the order. Used
 * by both the pawn-worked craft completion (complete) and passive furnace production
 * (GameEngineImpl.processPassiveProduction).
 */
export function completeCraftOrder(entry: CraftingInProgress, gs: GameState): GameState {
  // Recipe registry (Stage C): a craft completion runs the producing recipe once per queued
  // unit and emits ALL its outputs — the primary product plus any byproducts (e.g. splitting
  // a log yields firewood AND branches; charcoal burns yield ash).
  const itemId = entry.item.id;
  const quantity = entry.quantity ?? 1;
  const recipe = recipeService.getRecipeForItem(itemId);
  const recipeOutputs: Record<string, number> = recipe ? recipe.outputs : { [itemId]: 1 };

  const outputs: Record<string, number> = {};
  for (const [outId, outQty] of Object.entries(recipeOutputs)) {
    outputs[outId] = (outputs[outId] ?? 0) + outQty * quantity;
  }

  // ADR-016: destroy the inputs staged on the station (the reserved drops carried here), then
  // spawn the outputs as drops ON the station tile. If the tile is a stockpile they're absorbed;
  // otherwise they sit on the station until a hauler stores them — exactly the physical model.
  const station = stationTileFor(entry, gs);
  const droppedItems = (gs.droppedItems ?? []).filter((d) => d.reservedFor !== entry.id);
  const newQueue = (gs.craftingQueue ?? []).filter((e) => e.id !== entry.id);
  let state: GameState = { ...gs, droppedItems, craftingQueue: newQueue };

  if (station) {
    const newDropIds: string[] = [];
    const next = [...(state.droppedItems ?? [])];
    for (const [outId, qty] of Object.entries(outputs)) {
      if (qty <= 0) continue;
      const id = `craft-${outId}-${station.x}-${station.y}-${Date.now()}-${rng.random().toString(36).slice(2, 5)}`;
      next.push({ id, resourceId: outId, x: station.x, y: station.y, quantity: qty });
      newDropIds.push(id);
    }
    state = { ...state, droppedItems: next };
    for (const id of newDropIds) state = absorbDropIfOnStockpileTile(state, id);
  } else {
    // Station vanished mid-craft — fall back to crediting the general stockpile so output isn't lost.
    state = itemService.addItems(outputs, state);
  }

  // §5 casting-mold wear: if this recipe's station needs a mold (forge/bloomery), the clay mold
  // takes one cast's wear and cracks after enough pours.
  const mold = itemService.moldForRecipeStation(recipe?.station);
  if (mold) {
    for (let i = 0; i < quantity; i++) state = itemService.wearToolById(mold, state);
  }

  console.log(
    `[JobService] Crafting complete: ${itemId} ×${outputs[itemId] ?? 0} (${Object.keys(outputs).length} output types) at station ${entry.stationBuildingId ?? '—'}`
  );
  return state;
}
