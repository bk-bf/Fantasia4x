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
 * **Not here (request-response):** `createZoneInstance` (returns a new id the caller reads back) and
 * `gameCoordinator.craftItem` need a *reply*, not fire-and-forget — they stay on their current path
 * until the worker's request-response channel exists (W3 follow-up). Everything else is converted.
 */
import type { GameState, EquipmentSlot } from '../core/types';
import { addToStockpileZone, consumeFromStockpiles, releaseReservation } from '../core/GameState';
import { equipItem, unequipItem, useConsumable } from '../core/PawnEquipment';
import { designationService } from '../services/DesignationService';
import { buildingService } from '../services/BuildingService';
import { researchService } from '../services/ResearchService';
import type { SimCommand } from './simProtocol';

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
  /** Set or clear (`target: null`) a pawn's draft target. */
  setPawnDraftTarget: (s, p: { pawnId: string; target: unknown }) => ({
    ...s,
    pawns: s.pawns.map((pw) =>
      pw.id === p.pawnId ? { ...pw, draftTarget: (p.target as never) ?? undefined } : pw
    )
  }),
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
  setPawnStance: (s, p: { pawnId: string; stance: string }) => ({
    ...s,
    pawns: s.pawns.map((pw) =>
      pw.id === p.pawnId ? { ...pw, combatStance: p.stance as never } : pw
    )
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
  placeBuilding: (s, p: { bid: string; x: number; y: number }) =>
    buildingService.placeBuilding(p.bid, p.x, p.y, s),
  placeBuildings: (s, p: { bid: string; tiles: [number, number][] }) =>
    p.tiles.reduce((cur, [tx, ty]) => buildingService.placeBuilding(p.bid, tx, ty, cur), s),
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
  clearRect: (s, p: { x1: number; y1: number; x2: number; y2: number }) =>
    designationService.clearRect(p.x1, p.y1, p.x2, p.y2, s),
  designateRect: (
    s,
    p: { x1: number; y1: number; x2: number; y2: number; type: string; instanceId?: string }
  ) => designationService.designateRect(p.x1, p.y1, p.x2, p.y2, p.type as never, s, p.instanceId),
  removeZoneInstance: (s, p: { instanceId: string }) =>
    designationService.removeZoneInstance(p.instanceId, s),
  toggleInstanceCategory: (
    s,
    p: { instanceId: string; category: string; allCategories: string[] }
  ) => designationService.toggleInstanceCategory(p.instanceId, p.category, p.allCategories, s),
  clearInstanceFilter: (s, p: { instanceId: string }) =>
    designationService.clearInstanceFilter(p.instanceId, s),

  // ── research / crafting ──────────────────────────────────────────────────────
  startResearch: (s, p: { researchId: string }) => researchService.startResearch(p.researchId, s),
  cancelResearch: (s) => ({ ...s, currentResearch: undefined }),
  cancelCrafting: (s, p: { queueId: string }) => {
    const next = releaseReservation(s, p.queueId);
    return { ...next, craftingQueue: (next.craftingQueue || []).filter((q) => q.id !== p.queueId) };
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
