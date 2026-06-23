/**
 * commands.ts — the serializable command registry (ADR-021 W3).
 *
 * The single source of truth for "a player/dev action = a pure `(state, payload) => state`",
 * keyed by a string id. Both the main thread (current) and the sim worker (after cutover) import
 * this and apply commands to whichever copy of state they own — so the command LOGIC lives in one
 * worker-safe place and only the *dispatch target* changes at cutover.
 *
 * **Worker-safety rule:** everything imported here must run in a worker — no `$app/environment`,
 * no DOM, no Svelte. Pure core/service transforms only.
 *
 * Each former `gameState.update((s) => fn(s))` call site moved its `fn` here under a name; the site
 * now calls `gameState.command({ type, payload, save })`. On the main thread that's still
 * `applyCommand` (behaviour identical); the worker will postMessage instead.
 *
 * **All player/dev mutations are converted** (W4 complete). The two former request-response holdouts
 * are now fire-and-forget: `createZoneInstance` takes a caller-generated id (the caller needs it
 * immediately for paint mode, so no reply is required), and `craftItem` moved here wholesale from
 * GameCoordinator. State-REPLACING actions (regenWorld/resetGame) re-init the worker instead.
 */
import type {
  GameState,
  Pawn,
  EquipmentSlot,
  ItemInstance,
  CraftingInProgress,
  FilterableZoneType,
  PlacedBuilding,
  Season,
  ZoneFilter
} from '../core/types';
import {
  addToStockpileZone,
  consumeFromStockpiles,
  releaseReservation,
  reserveForOrder,
  aggregateFromDrops,
  absorbDropIfOnStockpileTile
} from '../core/GameState';
import { equipItem, unequipItem, useConsumable, resolveEquipSlot } from '../core/PawnEquipment';
import { pickUpFromTile } from '../systems/pawn/pawnHauling';
import { designationService } from '../services/DesignationService';
import { buildingService } from '../services/BuildingService';
import { itemService } from '../services/ItemService';
import { recipeService } from '../services/RecipeService';
import { researchService } from '../services/ResearchService';
import { devSpawnLooseItems, devDestroyAllItems } from '../dev/devWorld';
import { generatePawns } from '../entities/Pawns';
import { devSpawnMobs } from '../services/entity/entitySpawning';
import { makeWeather, tileWetness } from '../services/EnvironmentService';
import { resourceObjectService } from '../services/ResourceObjectService';
import { patchPathfindingWalkable } from '../services/PathfinderService';
import { occupancyService } from '../services/OccupancyService';
import { assignDraftMovePath } from '../services/draftMovePath';
import { markTileDirty } from '../core/tileDeltas';
import type { SimCommand } from './simProtocol';

/** Spiral out from (cx,cy) for the nearest walkable, un-occupied tile (worker-safe pawn placement). */
function nearestFreeTile(
  worldMap: GameState['worldMap'],
  cx: number,
  cy: number,
  occupied: Set<string>
): { x: number; y: number } | null {
  const h = worldMap.length;
  const w = worldMap[0]?.length ?? 0;
  const maxR = Math.max(w, h);
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // ring only
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        if (!worldMap[y]?.[x]?.walkable) continue;
        const key = `${x},${y}`;
        if (occupied.has(key)) continue;
        return { x, y };
      }
    }
  }
  return null;
}

/**
 * Achtung-style line formation: spread `pawns` evenly along the segment A→B. Slot i sits at
 * A + (i/(N−1))·(B−A) (a single pawn goes to B, the release tile). Pawns are SORTED by their projection
 * onto the line so they keep their left→right order and don't cross, then each slot snaps to the nearest
 * free walkable tile. Returns pawnId → destination. Shared by the `movePawnsLine` command and the live
 * client-side aim preview (GameCanvas), so the dots you drag match where they actually go.
 */
export function lineFormationTargets(
  worldMap: GameState['worldMap'],
  pawns: Pawn[],
  ax: number,
  ay: number,
  bx: number,
  by: number
): Map<string, { x: number; y: number }> {
  const targets = new Map<string, { x: number; y: number }>();
  const placeable = pawns.filter((p) => p.position);
  const n = placeable.length;
  if (n === 0) return targets;
  const dirX = bx - ax;
  const dirY = by - ay;
  const proj = (p: Pawn) => (p.position!.x - ax) * dirX + (p.position!.y - ay) * dirY;
  const sorted = [...placeable].sort((p, q) => proj(p) - proj(q));
  const claimed = new Set<string>();
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 1 : i / (n - 1);
    const free = nearestFreeTile(
      worldMap,
      Math.round(ax + dirX * t),
      Math.round(ay + dirY * t),
      claimed
    );
    if (!free) break; // map exhausted — leave the rest
    claimed.add(`${free.x},${free.y}`);
    targets.set(sorted[i].id, free);
  }
  return targets;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cmd = (state: GameState, payload: any) => GameState;

/** Registry. Add a command here + call `gameState.command({ type, payload, save })` at the site. */
export const COMMANDS: Record<string, Cmd> = {
  // ── items / stockpile ──────────────────────────────────────────────────────
  addItem: (s, p: { itemId: string; amount: number }) =>
    addToStockpileZone(s, null, { [p.itemId]: p.amount }),
  consumeGlobalItem: (s, p: { itemId: string; quantity: number }) => {
    const current = (s.stockpile ?? {})[p.itemId] ?? 0;
    if (current < p.quantity) return s;
    return consumeFromStockpiles(s, { [p.itemId]: p.quantity });
  },

  // ── pawns ──────────────────────────────────────────────────────────────────
  /** Set or clear (`target: null`) a pawn's draft target. For a MOVE target the A* path is computed
   *  right here so the preview line traces the real route immediately — even while paused (the
   *  per-tick draft pass would otherwise be the first to path it). */
  setPawnDraftTarget: (s, p: { pawnId: string; target: unknown }) => {
    let gs: GameState = {
      ...s,
      pawns: s.pawns.map((pw) =>
        pw.id === p.pawnId ? { ...pw, draftTarget: (p.target as never) ?? undefined } : pw
      )
    };
    const t = p.target as { type?: string; x?: number; y?: number } | null;
    if (t && t.type === 'move' && typeof t.x === 'number' && typeof t.y === 'number') {
      const pawn = gs.pawns.find((pw) => pw.id === p.pawnId);
      if (pawn && pawn.position && pawn.currentState !== 'Collapsed') {
        gs = assignDraftMovePath(gs, pawn, t.x, t.y);
      }
    }
    return gs;
  },
  toggleDraft: (s, p: { pawnId: string }) => ({
    ...s,
    pawns: s.pawns.map((pw) =>
      pw.id === p.pawnId
        ? {
            ...pw,
            drafted: !pw.drafted,
            draftTarget: undefined,
            activeJob: undefined,
            currentState: 'Idle' as never
          }
        : pw
    )
  }),
  /** MARK multi-select: draft (or, with `drafted:false`, undraft) every listed living pawn at once,
   *  clearing any current job/target. */
  draftPawns: (s, p: { ids: string[]; drafted?: boolean }) => {
    const draft = p.drafted !== false;
    return {
      ...s,
      pawns: s.pawns.map((pw) =>
        p.ids.includes(pw.id) && pw.isAlive !== false
          ? {
              ...pw,
              drafted: draft,
              draftTarget: undefined,
              activeJob: undefined,
              currentState: 'Idle' as never
            }
          : pw
      )
    };
  },
  /** MARK multi-move: spread the listed drafted pawns onto distinct walkable tiles around (x,y) so
   *  they don't all path to (and fight over) one cell. Each pawn claims the nearest free tile via a
   *  spiral from the target, the centre tile going to the first pawn. */
  movePawnsFormation: (s, p: { ids: string[]; x: number; y: number }) => {
    const claimed = new Set<string>();
    const targets = new Map<string, { x: number; y: number }>();
    for (const id of p.ids) {
      const tile = nearestFreeTile(s.worldMap, p.x, p.y, claimed);
      if (!tile) break; // map exhausted — leave the rest where they are
      claimed.add(`${tile.x},${tile.y}`);
      targets.set(id, tile);
    }
    let gs: GameState = {
      ...s,
      pawns: s.pawns.map((pw) => {
        const t = targets.get(pw.id);
        return t && pw.drafted
          ? { ...pw, draftTarget: { type: 'move', x: t.x, y: t.y } as never }
          : pw;
      })
    };
    // Path each pawn now (shared solid-body occupancy snapshot) so all the preview lines trace their
    // real routes the instant the order lands — paused or running.
    const occ = occupancyService.blockedTiles(gs);
    for (const [id, t] of targets) {
      const pawn = gs.pawns.find((pw) => pw.id === id);
      if (pawn && pawn.drafted && pawn.position && pawn.currentState !== 'Collapsed') {
        gs = assignDraftMovePath(gs, pawn, t.x, t.y, occ);
      }
    }
    return gs;
  },
  /** Achtung-style line move: spread the listed drafted pawns evenly along the segment (ax,ay)→(bx,by)
   *  — see lineFormationTargets. Same paths-now behaviour as movePawnsFormation. */
  movePawnsLine: (s, p: { ids: string[]; ax: number; ay: number; bx: number; by: number }) => {
    const pawns = s.pawns.filter(
      (pw) => p.ids.includes(pw.id) && pw.drafted && pw.position && pw.currentState !== 'Collapsed'
    );
    const targets = lineFormationTargets(s.worldMap, pawns, p.ax, p.ay, p.bx, p.by);
    let gs: GameState = {
      ...s,
      pawns: s.pawns.map((pw) => {
        const t = targets.get(pw.id);
        return t && pw.drafted
          ? { ...pw, draftTarget: { type: 'move', x: t.x, y: t.y } as never }
          : pw;
      })
    };
    const occ = occupancyService.blockedTiles(gs);
    for (const [id, t] of targets) {
      const pawn = gs.pawns.find((pw) => pw.id === id);
      if (pawn && pawn.drafted && pawn.position && pawn.currentState !== 'Collapsed') {
        gs = assignDraftMovePath(gs, pawn, t.x, t.y, occ);
      }
    }
    return gs;
  },
  setPawnStance: (s, p: { pawnId: string; stance: string }) => ({
    ...s,
    pawns: s.pawns.map((pw) =>
      pw.id === p.pawnId ? { ...pw, combatStance: p.stance as never } : pw
    )
  }),
  setPawnRestPolicy: (s, p: { pawnId: string; policy: string }) => ({
    ...s,
    pawns: s.pawns.map((pw) => (pw.id === p.pawnId ? { ...pw, restPolicy: p.policy as never } : pw))
  }),
  setPawnLaborLevel: (s, p: { pawnId: string; workId: string; level: 0 | 1 | 2 | 3 | 4 }) => {
    const a = { ...s.workAssignments };
    const cur = a[p.pawnId] ?? { pawnId: p.pawnId, workPriorities: {}, laborSettings: {} };
    a[p.pawnId] = {
      ...cur,
      laborSettings: { ...(cur.laborSettings ?? {}), [p.workId]: p.level },
      workPriorities: { ...(cur.workPriorities ?? {}), [p.workId]: p.level === 0 ? 0 : p.level * 3 }
    };
    return { ...s, workAssignments: a };
  },
  equipPawnItem: (s, p: { pawnId: string; itemId: string }) => ({
    ...s,
    pawns: s.pawns.map((pw) => (pw.id === p.pawnId ? equipItem(pw, p.itemId) : pw))
  }),
  unequipPawnItem: (s, p: { pawnId: string; slot: string }) => ({
    ...s,
    pawns: s.pawns.map((pw) => (pw.id === p.pawnId ? unequipItem(pw, p.slot as EquipmentSlot) : pw))
  }),
  useConsumableItem: (s, p: { pawnId: string; itemId: string }) => {
    const idx = s.pawns.findIndex((pw) => pw.id === p.pawnId);
    if (idx === -1) return s;
    if (((s.stockpile ?? {})[p.itemId] ?? 0) < 1) return s;
    const pawns = s.pawns.slice();
    pawns[idx] = useConsumable(pawns[idx], p.itemId);
    return consumeFromStockpiles({ ...s, pawns }, { [p.itemId]: 1 });
  },

  /** Toggle a player "pin" on an item id for one pawn: pinned carried items are never deposited
   *  during hauling (the pawn keeps them) and sort to the top of the gear lists. */
  togglePinItem: (s, p: { pawnId: string; itemId: string }) => ({
    ...s,
    pawns: s.pawns.map((pw) => {
      if (pw.id !== p.pawnId) return pw;
      const pinned = pw.pinnedItems ?? [];
      return {
        ...pw,
        pinnedItems: pinned.includes(p.itemId)
          ? pinned.filter((id) => id !== p.itemId)
          : [...pinned, p.itemId]
      };
    })
  }),

  /** Drop a carried item NOW: the whole stack lands as a loose drop on the pawn's tile (absorbed
   *  if that tile is a stockpile) and leaves the pawn's hands. Overrides a pin (explicit player act),
   *  so the pin is cleared too. */
  dropCarriedItem: (s, p: { pawnId: string; itemId: string }) => {
    const pawn = s.pawns.find((pw) => pw.id === p.pawnId);
    const qty = pawn?.inventory?.items?.[p.itemId] ?? 0;
    if (!pawn?.position || qty <= 0) return s;
    const drop = {
      id: `drop-${p.pawnId}-${p.itemId}-${Date.now()}`,
      resourceId: p.itemId,
      x: pawn.position.x,
      y: pawn.position.y,
      quantity: qty,
      stored: false
    };
    const next: GameState = {
      ...s,
      droppedItems: [...(s.droppedItems ?? []), drop],
      pawns: s.pawns.map((pw) => {
        if (pw.id !== p.pawnId) return pw;
        const items = { ...(pw.inventory?.items ?? {}) };
        delete items[p.itemId];
        return {
          ...pw,
          inventory: { ...pw.inventory, items },
          pinnedItems: (pw.pinnedItems ?? []).filter((id) => id !== p.itemId)
        };
      })
    };
    // If the pawn is standing on a stockpile tile, the dropped stack is absorbed (stored) immediately.
    return absorbDropIfOnStockpileTile(next, drop.id);
  },

  // ── mobs ───────────────────────────────────────────────────────────────────
  toggleHuntMark: (s, p: { mobId: string }) => ({
    ...s,
    mobs: (s.mobs ?? []).map((m) =>
      m.id === p.mobId ? { ...m, markedForHunt: !m.markedForHunt } : m
    )
  }),
  markMobsForHunt: (s, p: { ids: string[] }) => ({
    ...s,
    mobs: (s.mobs ?? []).map((m) => (p.ids.includes(m.id) ? { ...m, markedForHunt: true } : m))
  }),

  // ── buildings ──────────────────────────────────────────────────────────────
  placeBuilding: (
    s,
    p: { bid: string; x: number; y: number; materials?: Record<string, string> }
  ) => buildingService.placeBuilding(p.bid, p.x, p.y, s, p.materials),
  placeBuildings: (
    s,
    p: { bid: string; tiles: [number, number][]; materials?: Record<string, string> }
  ) =>
    p.tiles.reduce(
      (cur, [tx, ty]) => buildingService.placeBuilding(p.bid, tx, ty, cur, p.materials),
      s
    ),
  cancelBuilding: (s, p: { id: string }) => buildingService.cancelBuilding(p.id, s),
  /** BuildingMenu's refund-and-remove (distinct from the service cancel above). */
  cancelBuildingRefund: (s, p: { buildingId: string }) => {
    const placed = (s.buildings ?? []).find((b) => b.id === p.buildingId);
    if (!placed) return s;
    const def = buildingService.getBuildingById(placed.type);
    if (!def) return s;
    const refund = Object.fromEntries(
      Object.entries(def.buildingCost).filter(([k]) => !k.startsWith('category:'))
    );
    const withRefund = addToStockpileZone(s, null, refund);
    return {
      ...withRefund,
      buildings: (s.buildings ?? []).filter((b) => b.id !== p.buildingId),
      jobs: (s.jobs ?? []).filter((j) => !(j.type === 'construct' && j.buildingId === p.buildingId))
    };
  },
  deconstructBuilding: (s, p: { id: string }) => buildingService.deconstructBuilding(p.id, s),
  cancelDeconstructBuilding: (s, p: { id: string }) =>
    buildingService.cancelDeconstructBuilding(p.id, s),
  assignShelterPawn: (s, p: { id: string; pawnId: string }) =>
    buildingService.assignShelterPawn(p.id, p.pawnId, s),
  togglePausedBuilding: (s, p: { id: string }) => buildingService.togglePausedBuilding(p.id, s),
  setBuildingFuelSettings: (s, p: { id: string; updates: Record<string, unknown> }) => ({
    ...s,
    buildings: (s.buildings ?? []).map((b) =>
      b.id === p.id
        ? { ...b, fuelSettings: { ...((b.fuelSettings ?? {}) as object), ...p.updates } }
        : b
    )
  }),

  // ── designations / zones ─────────────────────────────────────────────────────
  designate: (s, p: { x: number; y: number; type: string; instanceId?: string }) =>
    designationService.designate(p.x, p.y, p.type as never, s, p.instanceId),
  designateTiles: (s, p: { tiles: [number, number][]; type: string }) =>
    p.tiles.reduce(
      (cur, [tx, ty]) => designationService.designate(tx, ty, p.type as never, cur),
      s
    ),
  clearDesignation: (s, p: { x: number; y: number }) =>
    designationService.clearDesignation(p.x, p.y, s),
  /** Clear the designation on each listed tile (the targeted inverse of designateTiles — cancels only
   *  the marked tiles, not every tile of a resource type). */
  clearDesignationTiles: (s, p: { tiles: [number, number][] }) =>
    p.tiles.reduce((cur, [tx, ty]) => designationService.clearDesignation(tx, ty, cur), s),
  /** Clear every designated tile holding this resource (symmetric inverse of bulk MARK). */
  clearDesignationsForResource: (s, p: { resourceId: string }) =>
    designationService.clearDesignationsForResource(p.resourceId, s),
  clearRect: (s, p: { x1: number; y1: number; x2: number; y2: number }) =>
    designationService.clearRect(p.x1, p.y1, p.x2, p.y2, s),
  designateRect: (
    s,
    p: { x1: number; y1: number; x2: number; y2: number; type: string; instanceId?: string }
  ) => designationService.designateRect(p.x1, p.y1, p.x2, p.y2, p.type as never, s, p.instanceId),
  // The caller generates the id (it needs it immediately to enter paint mode) and passes it in,
  // so this is fire-and-forget instead of the old request-response that returned a new id.
  createZoneInstance: (s, p: { type: FilterableZoneType; label: string; id: string }) =>
    designationService.createZoneInstanceWithId(p.type, p.label, p.id, s),
  removeZoneInstance: (s, p: { instanceId: string }) =>
    designationService.removeZoneInstance(p.instanceId, s),
  toggleInstanceCategory: (
    s,
    p: { instanceId: string; category: string; allCategories: string[] }
  ) => designationService.toggleInstanceCategory(p.instanceId, p.category, p.allCategories, s),
  clearInstanceFilter: (s, p: { instanceId: string }) =>
    designationService.clearInstanceFilter(p.instanceId, s),
  setInstanceFilter: (s, p: { instanceId: string; filter: ZoneFilter }) =>
    designationService.setInstanceFilter(p.instanceId, p.filter, s),
  /** Toggle a loose stack's haul lockout (DroppedItem.forbidden). Forbidden stacks are skipped by the
   *  haul generator and any in-flight haul for them is pruned next tick (see jobs/haul.ts). */
  setDropForbidden: (s, p: { dropId: string; forbidden: boolean }) => ({
    ...s,
    droppedItems: (s.droppedItems ?? []).map((d) =>
      d.id === p.dropId ? { ...d, forbidden: p.forbidden } : d
    )
  }),
  setZoneColorHidden: (s, p: { instanceId: string; hidden: boolean }) =>
    designationService.setInstanceColorHidden(p.instanceId, p.hidden, s),
  setAllZoneColorHidden: (s, p: { hidden: boolean }) =>
    designationService.setAllColorHidden(p.hidden, s),

  // ── research / crafting ──────────────────────────────────────────────────────
  startResearch: (s, p: { researchId: string }) => researchService.startResearch(p.researchId, s),
  cancelResearch: (s) => ({ ...s, currentResearch: undefined }),
  cancelCrafting: (s, p: { queueId: string }) => {
    const next = releaseReservation(s, p.queueId);
    return { ...next, craftingQueue: (next.craftingQueue || []).filter((q) => q.id !== p.queueId) };
  },
  /** Queue a crafting order (ADR-016 reserve-and-fetch). Moved here from GameCoordinator so it runs
   *  on the worker's canonical state instead of the stale main-thread projection. */
  craftItem: (
    s,
    p: { itemId: string; quantity?: number; selectedIngredients?: Record<string, string> }
  ) => {
    const quantity = p.quantity ?? 1;
    const item = itemService.getItemById(p.itemId);
    if (!item) return s;
    // Allow queueing without the materials in stock — only the non-material gates (station/tools/
    // research/population/mold) block queueing. A materials-short order is created `pending` and the
    // engine reserves its inputs once they're stocked (reservePendingOrders).
    if (!itemService.canQueueCraft(p.itemId, s)) return s;
    const resolved = p.selectedIngredients ?? itemService.autoSelectIngredients(p.itemId, s) ?? {};
    // resolveActiveCost returns null for a dynamic recipe whose chosen ingredient isn't stocked. Fall
    // back to the recipe's static/base cost so a dynamic order can still be queued pending materials.
    const activeCost =
      itemService.resolveActiveCost(item.id, s, resolved) ??
      itemService.calculateCraftingCost(item.id);
    const recipe = recipeService.getRecipeForItem(item.id);
    const inputs: Record<string, number> = {};
    for (const [id, q] of Object.entries(activeCost)) inputs[id] = q * quantity;
    const stationType = recipe?.station ?? null;
    const station = buildingService.bestCraftStation(stationType ?? 'craft_spot', s);
    const stationBuildingId = station?.id;
    const craftBonus = station ? buildingService.craftingBonusOf(station.type) : 0;
    const workRequired = Math.max(
      1,
      Math.ceil(((recipe?.workAmount ?? 1) * quantity) / (1 + craftBonus))
    );
    const orderId = crypto.randomUUID();
    let gs = s;
    let allReserved = true;
    for (const [id, q] of Object.entries(inputs)) {
      const res = reserveForOrder(gs, id, q, orderId);
      gs = res.state;
      if (res.reserved < q) {
        allReserved = false;
        break;
      }
    }
    // Materials short → queue the order `pending` with NO reservations held (release the partial
    // ones). The engine reserves its inputs once they're stocked (reservePendingOrders).
    if (!allReserved) gs = releaseReservation(gs, orderId);
    const order: CraftingInProgress = {
      id: orderId,
      item,
      quantity,
      workRequired,
      workDone: 0,
      inputs,
      pending: !allReserved || undefined,
      stationType,
      stationBuildingId,
      startedAt: gs.turn,
      selectedIngredients: Object.keys(resolved).length > 0 ? resolved : undefined
    };
    return { ...gs, craftingQueue: [...(gs.craftingQueue ?? []), order] };
  },

  // ── equipment / dev ──────────────────────────────────────────────────────────
  /** Equip a loose item off a tile onto a pawn (ADR-016: the swapped-out item drops back). */
  equipFromTile: (s, p: { pawnId: string; dropId: string }) => {
    const drop = (s.droppedItems ?? []).find((d) => d.id === p.dropId);
    if (!drop) return s;
    const item = itemService.getItemById(drop.resourceId);
    if (!item) return s;
    const pawnIdx = s.pawns.findIndex((pw) => pw.id === p.pawnId);
    if (pawnIdx < 0) return s;
    const pawn = s.pawns[pawnIdx];
    // Occupancy-aware: a 2nd ring goes to the free `ring2` slot instead of swapping the first.
    const slot = resolveEquipSlot(pawn, item);
    if (!slot) return s;
    const instance: ItemInstance = drop.instance ?? {
      instanceId: `${item.id}-${p.pawnId}-${Date.now()}`,
      itemId: item.id,
      durability: item.maxDurability ?? 100,
      // §Q: carry the stack's craft-quality tier onto the equipped instance (like durability).
      ...(drop.quality !== undefined ? { quality: drop.quality } : {})
    };
    const px = pawn.position?.x ?? drop.x;
    const py = pawn.position?.y ?? drop.y;
    let drops = (s.droppedItems ?? [])
      .map((d) => (d.id === p.dropId ? { ...d, quantity: d.quantity - 1 } : d))
      .filter((d) => d.quantity > 0);
    const prev = pawn.equipment[slot];
    if (prev) {
      drops = [
        ...drops,
        {
          id: `unequip-${prev.instanceId}-${Date.now()}`,
          resourceId: prev.itemId,
          x: px,
          y: py,
          quantity: 1,
          stored: false,
          instance: prev
        }
      ];
    }
    const pawns = s.pawns.map((pw, i) =>
      i === pawnIdx ? { ...pw, equipment: { ...pw.equipment, [slot]: instance } } : pw
    );
    return { ...s, pawns, droppedItems: drops, stockpile: aggregateFromDrops(drops) };
  },
  /** Pick `quantity` units of a specific tile drop straight into a pawn's inventory (instant, like
   *  equipFromTile). Carry budget is respected — only what fits is taken (floor of 1). */
  pickUpItemFromTile: (s, p: { pawnId: string; dropId: string; quantity: number }) => {
    const drop = (s.droppedItems ?? []).find((d) => d.id === p.dropId);
    if (!drop) return s;
    return pickUpFromTile(s, p.pawnId, drop.x, drop.y, {
      dropId: p.dropId,
      maxQty: Math.max(1, Math.floor(p.quantity))
    });
  },
  /** Order a (drafted) pawn to shuttle the loose stack on a tile to the nearest stockpile. The
   *  draft-haul branch in _processDraftOrders carries one budget-load at a time until it's clear. */
  haulTileToStockpile: (s, p: { pawnId: string; x: number; y: number }) => ({
    ...s,
    pawns: s.pawns.map((pw) =>
      pw.id === p.pawnId ? { ...pw, draftTarget: { type: 'haul', x: p.x, y: p.y } } : pw
    )
  }),
  devSpawnAllItems: (s, p: { amount?: number }) => devSpawnLooseItems(s, p.amount ?? 500),
  devClearAllItems: (s) => devDestroyAllItems(s),

  // ── debug menu (in-game DEBUG tab) ───────────────────────────────────────────
  /** Spawn a loose pile of one item id on a chosen tile (or near the colony when x/y omitted). */
  devSpawnItem: (s, p: { itemId: string; amount?: number; x?: number; y?: number }) => {
    const item = itemService.getItemById(p.itemId);
    if (!item) return s;
    const start = s.pawns?.find((pw) => pw.position)?.position ?? {
      x: Math.floor((s.worldMap[0]?.length ?? 0) / 2),
      y: Math.floor(s.worldMap.length / 2)
    };
    const x = p.x ?? start.x;
    const y = p.y ?? start.y;
    const drop = {
      id: `dev-spawn-${p.itemId}-${x}-${y}-${Date.now()}`,
      resourceId: p.itemId,
      x,
      y,
      quantity: p.amount ?? 50,
      stored: false
    };
    return absorbDropIfOnStockpileTile(
      { ...s, droppedItems: [...(s.droppedItems ?? []), drop] },
      drop.id
    );
  },

  /** Spawn `count` fresh pawns of the colony's race, placed on walkable tiles near map centre. */
  devSpawnPawns: (s, p: { count?: number }) => {
    const pawns = generatePawns(s.race, p.count ?? 1);
    const w = s.worldMap[0]?.length ?? 0;
    const h = s.worldMap.length;
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    const occupied = new Set<string>(
      s.pawns.filter((pw) => pw.position).map((pw) => `${pw.position!.x},${pw.position!.y}`)
    );
    const placed = pawns.map((pw) => {
      const pos = nearestFreeTile(s.worldMap, cx, cy, occupied) ?? { x: cx, y: cy };
      occupied.add(`${pos.x},${pos.y}`);
      return { ...pw, position: pos, path: [], pathIndex: 0 };
    });
    return { ...s, pawns: [...s.pawns, ...placed] };
  },

  /** Force-spawn `count` mobs (ignores caps / current count). Optional specific creature id. */
  devSpawnEntities: (s, p: { count?: number; creatureId?: string }) =>
    devSpawnMobs(s, p.count ?? 5, p.creatureId),

  /** Set the weather to a fixed type (sticky — won't re-roll until changed again). */
  setWeather: (s, p: { type: string }) => ({ ...s, weather: makeWeather(p.type) }),

  /** Override the season (null/undefined resumes the natural turn-derived cycle). */
  setSeason: (s, p: { season: Season | null }) => ({ ...s, _debugSeason: p.season ?? undefined }),

  /** Override the rendered time-of-day (fraction [0,1); null resumes the natural turn-derived cycle).
   *  Visual only — the sim turn keeps ticking; this just freezes the ambient light/tint for testing. */
  setTimeOfDay: (s, p: { timeOfDay: number | null }) => ({
    ...s,
    _debugTimeOfDay: p.timeOfDay ?? undefined
  }),

  /** DEBUG: turn research gating off/on. When on, research-locked recipes & buildings show in the
   *  Crafting/Building tabs and can be queued/built without their prerequisite research. */
  setResearchGateOff: (s, p: { off: boolean }) => ({
    ...s,
    _devResearchGateOff: p.off || undefined
  }),

  /** Instantly place a complete building on a tile (no cost, no construction work). */
  devSpawnBuildingAt: (s, p: { buildingId: string; x: number; y: number }) => {
    const def = buildingService.getBuildingById(p.buildingId);
    if (!def) return s;
    if (s.worldMap?.[p.y]?.[p.x]?.walkable === false) return s;
    const placed: PlacedBuilding = {
      id: `${p.buildingId}-${p.x}-${p.y}-${Date.now()}`,
      type: p.buildingId,
      status: 'complete',
      progress: 1,
      x: p.x,
      y: p.y,
      workRequired: def.workAmount ?? 0,
      workDone: def.workAmount ?? 0,
      materialsDelivered: true
    };
    const state: GameState = { ...s, buildings: [...(s.buildings ?? []), placed] };
    return buildingService.applyBuildingFootprint(state, placed, true);
  },

  /** Place a resource node on a tile (full node amount), updating walkability from its def. */
  devSpawnResourceAt: (s, p: { resourceId: string; x: number; y: number }) => {
    const def = resourceObjectService.getById(p.resourceId);
    const tile = s.worldMap?.[p.y]?.[p.x];
    if (!def || !tile) return s;
    const max = def.nodeAmountRange?.[1] ?? 3;
    tile.resources = { ...tile.resources, [p.resourceId]: max };
    const walkable = def.walkable ?? true;
    tile.walkable = walkable;
    tile.blocksSight = def.blocksSight ?? false;
    patchPathfindingWalkable(p.x, p.y, walkable);
    markTileDirty(p.y, p.x, tile);
    return { ...s };
  },

  /** Regrow a tile's resources: clear any cooldowns and restore every present/cooling node to full. */
  devRegrowTileAt: (s, p: { x: number; y: number }) => {
    const tile = s.worldMap?.[p.y]?.[p.x];
    if (!tile) return s;
    const ids = new Set<string>([
      ...Object.keys(tile.resources ?? {}),
      ...Object.keys(tile.resourceCooldowns ?? {}).map((k) =>
        k.includes(':') ? k.slice(0, k.indexOf(':')) : k
      )
    ]);
    if (ids.size === 0) return s;
    tile.resourceCooldowns = {};
    const resources = { ...tile.resources };
    for (const id of ids) {
      const def = resourceObjectService.getById(id);
      resources[id] = def?.nodeAmountRange?.[1] ?? 3;
      if (def?.walkable === false) {
        tile.walkable = false;
        tile.blocksSight = def.blocksSight ?? false;
        patchPathfindingWalkable(p.x, p.y, false);
      }
    }
    tile.resources = resources;
    markTileDirty(p.y, p.x, tile);
    return { ...s };
  },

  /** Debug: set snow cover across the whole map to `value` (0–100), scaled per tile by its wetness
   *  (wetter = whiter) so you can eyeball the non-uniform cover. 0 clears it. One-shot full-map pass. */
  devSetMapSnow: (s, p: { value: number }) => {
    const v = Math.max(0, Math.min(100, p.value ?? 0));
    for (const row of s.worldMap) {
      for (const tile of row) {
        const wet = tileWetness(tile.moisture ?? 0, s.weather);
        const factor = 0.4 + (Math.max(0, Math.min(100, wet)) / 100) * 1.4;
        const next = v <= 0 ? 0 : Math.max(0, Math.min(100, Math.round(v * factor)));
        if (next === (tile.snow ?? 0)) continue;
        tile.snow = next;
        markTileDirty(tile.y, tile.x, tile);
      }
    }
    return { ...s };
  }
};

/** Apply a serializable command to a state, returning the new state. Unknown ids are a no-op. */
export function applySimCommand(state: GameState, cmd: SimCommand): GameState {
  const fn = COMMANDS[cmd.type];
  if (!fn) {
    console.error('[sim] unknown command:', cmd.type);
    return state;
  }
  return fn(state, cmd.payload);
}
