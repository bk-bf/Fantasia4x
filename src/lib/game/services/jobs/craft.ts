import type {
  CraftingInProgress,
  GameState,
  Job,
  ItemQuality,
  ItemInstance,
  DroppedItem,
  PlacedBuilding
} from '../../core/types';
import { gatedConsole as console } from '../../core/util/log';
import { itemService } from '../ItemService';
import { recipeService } from '../RecipeService';
import { pawnStatService } from '../PawnStatService';
import { buildingService } from '../BuildingService';
import { craftDiscipline, disciplineParent } from './craftDiscipline';
import { rollCraftQuality, qualityMultiplier } from '../../core/rules/gear/itemQuality';
import { rollFamed, rollFamedIdentity } from '../../core/gen/famedNames';
import { itemDefById } from '../../core/defs/items';
import {
  defaultFilterFor,
  heldQuantity,
  isFluidId,
  putIn,
  takeOut,
  vesselOf
} from '../../core/rules/gear/vessels';
import { memoryService } from '../MemoryService';
import { aggregateMaterialMods } from '../../core/defs/materials';
import {
  absorbDropIfOnStockpileTile,
  reserveForOrder,
  releaseReservation,
  withDrops
} from '../../core/state/stockpile';
import { rng } from '../../core/util/rng';
import { stationTileFor, orderSupplied } from './staging';
import { wearWorkingPawnTool } from './harvest';

const recipeForOrder = (o: CraftingInProgress) =>
  o.recipeId ? recipeService.getRecipeById(o.recipeId) : recipeService.getRecipeForItem(o.item.id);

function stationHeldUnits(gs: GameState, order: CraftingInProgress, itemId: string): number {
  if (!isFluidId(itemId) || !order.stationBuildingId) return 0;
  const b = (gs.buildings ?? []).find((x) => x.id === order.stationBuildingId);
  const litres = (b?.fluidContents ?? []).find((e) => e.itemId === itemId)?.litres ?? 0;
  return litres > 0 ? litres : 0;
}

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
      const need = q - stationHeldUnits(trial, order, id);
      if (need <= 0) continue;
      const res = reserveForOrder(trial, id, need, order.id);
      trial = res.state;
      if (res.reserved < need) {
        allReserved = false;
        break;
      }
    }
    if (!allReserved) {
      releaseReservation(trial, order.id);
      return order;
    }
    state = trial;
    changed = true;
    const { pending: _drop, ...rest } = order;
    return rest;
  });

  return changed ? { ...state, craftingQueue: newQueue } : gs;
}

export function generate(jobs: Job[], gs: GameState): Job[] {
  jobs = jobs.filter((j) => {
    if (j.type !== 'craft') return true;
    const order = (gs.craftingQueue ?? []).find((e) => e.id === j.craftQueueId);
    return !!order && !order.paused;
  });

  const stationsBusy = new Set<string>();
  for (const j of jobs) {
    if (j.type !== 'craft' || !j.buildingId) continue;
    stationsBusy.add(j.buildingId);
  }

  for (const order of gs.craftingQueue ?? []) {
    if (!order.id) continue;
    if (order.paused) continue;
    if (
      recipeService.isPassive(recipeForOrder(order)) ||
      recipeService.isPassiveStation(order.stationType)
    )
      continue;
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
  let rollQuality: (() => ItemQuality) | undefined;
  let rollFamedFn: (() => ReturnType<typeof rollFamedIdentity> | null) | undefined;
  const pawn = job.claimedBy ? gs.pawns.find((p) => p.id === job.claimedBy) : undefined;
  let bestTier = -1;
  let worstTier = 6;
  let skillYieldMult = 1;
  if (pawn) {
    const discipline = craftDiscipline(entry);
    const mods = pawnStatService.getWorkModifiers(
      pawn,
      discipline,
      undefined,
      disciplineParent(discipline)
    );
    const axis = mods.quality ?? 1;
    skillYieldMult = Math.max(1, mods.yield ?? 1);
    rollQuality = () => {
      const q = rollCraftQuality(axis, () => rng.random());
      if (q > bestTier) bestTier = q;
      if (q < worstTier) worstTier = q;
      return q;
    };
    const stationEffects = (
      entry.stationType
        ? ((buildingService.getBuildingById(entry.stationType)?.effects ?? {}) as Record<
            string,
            unknown
          >)
        : {}
    ) as Record<string, unknown>;
    const arcane = !!stationEffects.arcane;
    rollFamedFn = () =>
      rollFamed(axis, arcane, () => rng.random()) ? rollFamedIdentity(() => rng.random()) : null;
  }
  let state = completeCraftOrder(entry, gs, rollQuality, rollFamedFn, skillYieldMult);
  if (pawn && pawn.position && bestTier >= 0) {
    const itemName = itemDefById(entry.item.id)?.name ?? 'their work';
    const who = pawn.name.split(' ')[0];
    if (bestTier >= 4) {
      memoryService.recordAroundKind(
        state,
        pawn.position.x,
        pawn.position.y,
        pawn.id,
        'masterwork',
        {
          subjectName: who,
          detail: itemName,
          memorability: bestTier >= 5 ? 0.9 : undefined
        }
      );
    } else if (worstTier === 0) {
      memoryService.recordAroundKind(state, pawn.position.x, pawn.position.y, pawn.id, 'botch', {
        subjectName: who,
        detail: itemName
      });
    }
  }
  const req = recipeService.toolRequirementForRecipe(recipeForOrder(entry));
  if (req && job.claimedBy) state = wearWorkingPawnTool(job.claimedBy, req.workType, state);
  return state;
}

const QUALITY_STAMPED_TYPES = new Set(['weapon', 'armor', 'tool']);

export function completeCraftOrder(
  entry: CraftingInProgress,
  gs: GameState,
  rollQuality?: () => ItemQuality,
  rollFamedFn?: () => ReturnType<typeof rollFamedIdentity> | null,
  skillYieldMult = 1
): GameState {
  const itemId = entry.item.id;
  const quantity = entry.quantity ?? 1;
  const recipe = recipeForOrder(entry);
  const recipeOutputs: Record<string, number> = recipe ? recipe.outputs : { [itemId]: 1 };

  const carcassInput = (gs.droppedItems ?? []).find(
    (d) =>
      d.reservedFor === entry.id &&
      d.unitConditions?.length &&
      itemService.getItemById(d.resourceId)?.isCarcass
  );
  const conditionMult = carcassInput ? (carcassInput.unitConditions![0] ?? 100) / 100 : 1;

  const actualStationType = entry.stationBuildingId
    ? (gs.buildings ?? []).find((b) => b.id === entry.stationBuildingId)?.type
    : (entry.stationType ?? undefined);
  const yieldMult =
    (1 + (actualStationType ? buildingService.butcheryYieldBonusOf(actualStationType) : 0)) *
    skillYieldMult;

  const outputs: Record<string, number> = {};
  for (const [outId, outQty] of Object.entries(recipeOutputs)) {
    let qty = outQty * quantity;
    const yieldScale = conditionMult * yieldMult;
    if (yieldScale !== 1) {
      const scaled = qty * yieldScale;
      if (isFluidId(outId)) {
        qty = Math.round(scaled * 1000) / 1000;
      } else {
        const whole = Math.floor(scaled);
        qty = whole + (rng.random() < scaled - whole ? 1 : 0);
      }
    }
    if (rollQuality && itemService.getItemById(outId)?.category === 'food') {
      const scaled = qty * qualityMultiplier(rollQuality());
      if (isFluidId(outId)) {
        qty = Math.round(scaled * 1000) / 1000;
      } else {
        const whole = Math.floor(scaled);
        qty = Math.max(1, whole + (rng.random() < scaled - whole ? 1 : 0));
      }
    }
    outputs[outId] = (outputs[outId] ?? 0) + qty;
  }

  const matMods = aggregateMaterialMods(
    (gs.droppedItems ?? []).filter((d) => d.reservedFor === entry.id).map((d) => d.resourceId),
    'item'
  );
  const matDur = matMods.durability;
  const matWeight = matMods.weight;

  const station = stationTileFor(entry, gs);
  const droppedItems = consumeStagedInputs(gs, entry);
  const newQueue = (gs.craftingQueue ?? []).filter((e) => e.id !== entry.id);
  const drainedBuildings = drainStationFluidInputs(gs, entry, droppedItems);
  let state: GameState = {
    ...gs,
    droppedItems,
    craftingQueue: newQueue,
    ...(drainedBuildings ? { buildings: drainedBuildings } : {})
  };

  if (station) {
    const newDropIds: string[] = [];
    const next = [...(state.droppedItems ?? [])];
    for (const [outId, qty] of Object.entries(outputs)) {
      if (qty <= 0) continue;
      if (isFluidId(outId)) {
        const captured = captureFluid(outId, qty, entry, station, next, state);
        state = captured.state;
        if (captured.lost > 0)
          console.warn(
            `[Craft] ${captured.lost} unit(s) of ${outId} SPILLED — the ${entry.stationType ?? 'station'} ` +
              `is full and no vessel with room was staged on it. Empty it, or keep vessels here.`
          );
        continue;
      }
      if (vesselOf(outId)) {
        for (let i = 0; i < qty; i++) {
          const id = `craft-${outId}-${station.x}-${station.y}-t${gs.turn}-${rng.random().toString(36).slice(2, 5)}`;
          next.push({
            id,
            resourceId: outId,
            x: station.x,
            y: station.y,
            quantity: 1,
            instance: {
              instanceId: `${outId}-${station.x}-${station.y}-t${gs.turn}-${rng.random().toString(36).slice(2, 5)}`,
              itemId: outId,
              durability: Math.round(
                (itemService.getItemById(outId)?.maxDurability ?? 100) * matDur
              ),
              ...(matWeight !== 1 ? { matWeight } : {}),
              filter: defaultFilterFor(outId, gs.vesselFilterDefaults)
            }
          });
          newDropIds.push(id);
        }
        continue;
      }
      const stamp =
        rollQuality !== undefined &&
        QUALITY_STAMPED_TYPES.has(itemService.getItemById(outId)?.type ?? '');
      const dishName =
        outId === itemId
          ? itemService.composeDynamicDishName(itemId, entry.selectedIngredients)
          : undefined;
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
      if (stamp) {
        const byTier = new Map<ItemQuality, number>();
        const famedUnits: Array<{ q: ItemQuality; id: ReturnType<typeof rollFamedIdentity> }> = [];
        for (let i = 0; i < qty; i++) {
          const q = rollQuality!();
          const identity = outId === itemId ? (rollFamedFn?.() ?? null) : null;
          if (identity) famedUnits.push({ q, id: identity });
          else byTier.set(q, (byTier.get(q) ?? 0) + 1);
        }
        for (const [q, n] of byTier) {
          const id = `craft-${outId}-${station.x}-${station.y}-t${gs.turn}-${rng.random().toString(36).slice(2, 5)}`;
          next.push({
            id,
            resourceId: outId,
            x: station.x,
            y: station.y,
            quantity: n,
            quality: q,
            ...(matDur !== 1 ? { matDur } : {}),
            ...(matWeight !== 1 ? { matWeight } : {}),
            ...(dishName ? { name: dishName } : {})
          });
          newDropIds.push(id);
        }
        for (const { q, id: identity } of famedUnits) {
          const id = `craft-${outId}-${station.x}-${station.y}-t${gs.turn}-${rng.random().toString(36).slice(2, 5)}`;
          const instance: ItemInstance = {
            instanceId: `famed-${outId}-${station.x}-${station.y}-t${gs.turn}-${rng.random().toString(36).slice(2, 5)}`,
            itemId: outId,
            durability: Math.round((itemService.getItemById(outId)?.maxDurability ?? 100) * matDur),
            ...(matWeight !== 1 ? { matWeight } : {}),
            quality: q,
            famed: true,
            famedName: identity.famedName,
            famedHistory: identity.famedHistory,
            famedStatMult: identity.famedStatMult,
            famedEnchants: identity.famedEnchants
          };
          next.push({
            id,
            resourceId: outId,
            x: station.x,
            y: station.y,
            quantity: 1,
            quality: q,
            instance,
            ...(matDur !== 1 ? { matDur } : {}),
            ...(matWeight !== 1 ? { matWeight } : {})
          });
          newDropIds.push(id);
        }
        continue;
      }
      const id = `craft-${outId}-${station.x}-${station.y}-t${gs.turn}-${rng.random().toString(36).slice(2, 5)}`;
      next.push({
        id,
        resourceId: outId,
        x: station.x,
        y: station.y,
        quantity: qty,
        ...(dishName ? { name: dishName } : {})
      });
      newDropIds.push(id);
    }
    state = { ...state, droppedItems: next };
    for (const id of newDropIds) state = absorbDropIfOnStockpileTile(state, id);
  } else {
    state = itemService.addItems(outputs, state);
  }

  console.log(
    `[JobService] Crafting complete: ${itemId} ×${outputs[itemId] ?? 0} (${Object.keys(outputs).length} output types) at station ${entry.stationBuildingId ?? '—'}`
  );
  return withDrops(state, state.droppedItems ?? []);
}

function captureFluid(
  outId: string,
  qty: number,
  entry: CraftingInProgress,
  station: { x: number; y: number },
  next: DroppedItem[],
  state: GameState
): { state: GameState; lost: number } {
  let remainingL = qty;

  const placed = (state.buildings ?? []).find(
    (b) => b.id === entry.stationBuildingId && b.status === 'complete'
  );
  const capacityL = placed
    ? buildingService.getBuildingById(placed.type)?.fluidCapacityL
    : undefined;
  let buildings = state.buildings;
  if (placed && capacityL) {
    const held = (placed.fluidContents ?? []).reduce((s, e) => s + (e.litres ?? 0), 0);
    const room = Math.min(remainingL, Math.max(0, capacityL - held));
    if (room > 0) {
      const contents = (placed.fluidContents ?? []).map((e) => ({ ...e }));
      const existing = contents.find((e) => e.itemId === outId);
      if (existing) existing.litres = (existing.litres ?? 0) + room;
      else contents.push({ itemId: outId, litres: room });
      buildings = (state.buildings ?? []).map((b) =>
        b.id === placed.id ? { ...b, fluidContents: contents } : b
      );
      remainingL -= room;
    }
  }

  if (remainingL > 0) {
    const onTile = next
      .map((d, i) => ({ d, i }))
      .filter(
        ({ d }) => d.x === station.x && d.y === station.y && d.instance && vesselOf(d.resourceId)
      )
      .sort((a, b) => Number(b.d.reservedFor === entry.id) - Number(a.d.reservedFor === entry.id));
    for (const { d, i } of onTile) {
      if (remainingL <= 0) break;
      const inst: ItemInstance = {
        ...d.instance!,
        contents: d.instance!.contents?.map((e) => ({ ...e }))
      };
      const poured = putIn(inst, outId, remainingL);
      if (poured <= 0) continue;
      next[i] = { ...d, instance: inst };
      remainingL -= poured;
    }
  }

  return {
    state: buildings === state.buildings ? state : { ...state, buildings },
    lost: Math.round(remainingL * 1000) / 1000
  };
}

function drainStationFluidInputs(
  gs: GameState,
  entry: CraftingInProgress,
  remaining: DroppedItem[]
): PlacedBuilding[] | null {
  const placed = (gs.buildings ?? []).find((b) => b.id === entry.stationBuildingId);
  if (!placed?.fluidContents?.length) return null;
  type FluidEntry = NonNullable<PlacedBuilding['fluidContents']>[number];
  let contents: FluidEntry[] | null = null;
  for (const [itemId, units] of Object.entries(entry.inputs ?? {})) {
    if (!isFluidId(itemId) || units <= 0) continue;
    const inVessels = remaining
      .filter((d) => d.reservedFor === entry.id)
      .reduce((sum, d) => sum + heldQuantity(d.instance, itemId), 0);
    let needL = units - inVessels;
    if (needL <= 1e-6) continue;
    contents ??= (placed.fluidContents ?? []).map((e) => ({ ...e }));
    const held = contents.find((e: FluidEntry) => e.itemId === itemId);
    if (!held) continue;
    const take = Math.min(held.litres ?? 0, needL);
    held.litres = Math.round(((held.litres ?? 0) - take) * 1000) / 1000;
    needL -= take;
  }
  if (!contents) return null;
  const kept = contents.filter((e: FluidEntry) => (e.litres ?? 0) > 1e-6);
  return (gs.buildings ?? []).map((b) => (b.id === placed.id ? { ...b, fluidContents: kept } : b));
}

function consumeStagedInputs(gs: GameState, entry: CraftingInProgress): DroppedItem[] {
  const want: Record<string, number> = { ...(entry.inputs ?? {}) };
  const out: DroppedItem[] = [];
  for (const d of gs.droppedItems ?? []) {
    if (d.reservedFor !== entry.id) {
      out.push(d);
      continue;
    }
    if (!d.instance?.contents?.length) continue;
    const inst: ItemInstance = {
      ...d.instance,
      contents: d.instance.contents.map((e) => ({ ...e }))
    };
    for (const [itemId, units] of Object.entries(want)) {
      if (units <= 0) continue;
      const native = units;
      const got = takeOut(inst, itemId, native);
      if (got > 0) want[itemId] = units - got;
    }
    const { reservedFor, ...rest } = d;
    void reservedFor;
    out.push({ ...rest, instance: inst });
  }
  return out;
}
