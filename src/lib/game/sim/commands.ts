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
  Job,
  EquipmentSlot,
  CraftingInProgress,
  ZoneInstanceType,
  PlacedBuilding,
  Season,
  ZoneFilter,
  ZonePriority,
  FoodSettings,
  ItemInstance,
  DesignationType
} from '../core/types';
import { isHarvestableTileNow } from '../services/jobs/filters';
import { findAdjacentApproach, isAdjacent } from '../systems/pawn/pawnQueries';
import {
  addToStockpileZone,
  consumeFromStockpiles,
  releaseReservation,
  reserveForOrder,
  absorbDropIfOnStockpileTile
} from '../core/GameState';
import { equipItem, unequipItem, useConsumable, equipDropToPawn } from '../core/PawnEquipment';
import { pickUpFromTile } from '../systems/pawn/pawnHauling';
import { PAWN_STATE } from '../systems/pawn/pawnStates';
import { killPawn } from '../systems/PawnStateMachine';
import { hasShelter } from '../systems/pawn/handlers/rescue';
import { dropCarriedPawn, freeDropTileNear, CARRIED_PAWN_ITEM } from '../systems/pawn/carry';
import { manhattan } from '../core/distance';
import { designationService } from '../services/DesignationService';
import { buildingService } from '../services/BuildingService';
import { itemService } from '../services/ItemService';
import { recipeService } from '../services/RecipeService';
import { researchService } from '../services/ResearchService';
import { devSpawnLooseItems, devDestroyAllItems } from '../dev/devWorld';
import { gameLogger } from '../dev/gameLogger';
import { generatePawns } from '../entities/Pawns';
import { devSpawnMobs } from '../services/entity/entitySpawning';
import {
  makeWeather,
  tileWetness,
  ICE_WALKABLE,
  ICE_WATER_MOVE_COST
} from '../services/EnvironmentService';
import { SUBTERRAINS, SUBTERRAIN_FALLBACK } from '../core/Terrains';
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

type Cmd = (state: GameState, payload: any) => GameState;

/**
 * Set a tracked ItemInstance (tool / weapon / armour) DOWN as a loose drop on `pos`, preserving its
 * durability / quality / per-instance name (a worn axe isn't reset to pristine), and absorb it if that
 * tile is a stockpile. The SINGLE drop path shared by the carry-card ↓ (`dropCarriedItem`) AND the
 * equipment-doll unequip ✕ (`unequipPawnItem`). The unequip path used to clear the slot WITHOUT this
 * and silently DESTROYED the item — both must go through here so they can never diverge again. The
 * caller has already removed the instance from its source (inventory.instances or the equipment slot).
 */
function setInstanceDownOnTile(
  s: GameState,
  pawnId: string,
  pos: { x: number; y: number },
  inst: ItemInstance
): GameState {
  const def = itemService.getItemById(inst.itemId);
  const drop = {
    id: `drop-${pawnId}-${inst.instanceId}`,
    resourceId: inst.itemId,
    x: pos.x,
    y: pos.y,
    quantity: 1,
    stored: false,
    instance: inst,
    durability: inst.durability,
    ...(inst.quality !== undefined ? { quality: inst.quality } : {}),
    ...(def?.dynamicName && inst.name ? { name: inst.name } : {})
  };
  const next: GameState = { ...s, droppedItems: [...(s.droppedItems ?? []), drop] };
  return absorbDropIfOnStockpileTile(next, drop.id);
}

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
  /** Auto rescue (right-click a collapsed colonist, no pawn selected): commandeer the NEAREST able pawn
   *  to carry the downed one to shelter. It DRAFTS that pawn with an `auto` `rescue` order (drafted →
   *  it won't wander off mid-carry; the order un-drafts it again on drop). No-op when the victim isn't
   *  collapsed, is already being carried, the colony has no shelter, or no one's free. A drafted carrier
   *  the player picked themselves uses `setPawnDraftTarget` instead (GameCanvas), not this. */
  rescuePawn: (s, p: { victimId: string }) => {
    const victim = s.pawns.find((pw) => pw.id === p.victimId);
    if (!victim || victim.isAlive === false || !victim.position) return s;
    if (victim.currentState !== PAWN_STATE.COLLAPSED) return s;
    if (victim.carriedBy) return s; // already in someone's arms
    if (!hasShelter(s)) return s; // nowhere to take them
    if (
      s.pawns.some(
        (pw) => pw.draftTarget?.type === 'rescue' && pw.draftTarget.victimId === p.victimId
      )
    )
      return s; // already being carried/dispatched
    // Nearest pawn that can actually go: alive, on-map, not already drafted, not busy with its own crisis.
    const BUSY = new Set<string>([
      PAWN_STATE.COLLAPSED,
      PAWN_STATE.SLEEPING,
      PAWN_STATE.FIGHTING,
      PAWN_STATE.FLEEING,
      PAWN_STATE.HUNTING
    ]);
    let rescuerId: string | null = null;
    let bestD = Infinity;
    for (const pw of s.pawns) {
      if (pw.id === p.victimId || pw.isAlive === false || !pw.position || pw.drafted) continue;
      if (BUSY.has(pw.currentState ?? PAWN_STATE.IDLE)) continue;
      const d = manhattan(pw.position.x, pw.position.y, victim.position.x, victim.position.y);
      if (d < bestD) {
        bestD = d;
        rescuerId = pw.id;
      }
    }
    if (!rescuerId) return s;
    const id = rescuerId;
    // Release any pool job the rescuer had claimed so it isn't stranded.
    const jobs = (s.jobs ?? []).some((j) => j.claimedBy === id)
      ? (s.jobs ?? []).map((j) => (j.claimedBy === id ? { ...j, claimedBy: null } : j))
      : s.jobs;
    return {
      ...s,
      jobs,
      pawns: s.pawns.map((pw) =>
        pw.id === id
          ? {
              ...pw,
              drafted: true,
              currentState: 'Idle' as never,
              draftTarget: { type: 'rescue', victimId: p.victimId, auto: true },
              activeJob: undefined,
              path: [],
              isMoving: false
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
  /** MARK group attack: order every listed drafted pawn to attack the SAME target (a mob or pawn) — the
   *  right-click-a-mob-with-a-drafted-group order. Each pawn paths to the target and stops at adjacency
   *  (melee) / weapon range (auto-ranged); the per-tick draft pass routes them on the shared occupancy
   *  grid, so they fan onto distinct adjacent tiles and SURROUND it instead of stacking. Mode is auto per
   *  pawn (a shooter holds range, a melee pawn closes in) — mirrors a single `setPawnDraftTarget` attack,
   *  just applied to the whole group. Collapsed/dead/undrafted pawns in the list are skipped. */
  attackTargetWith: (s, p: { ids: string[]; targetId: string; targetType: 'pawn' | 'mob' }) => ({
    ...s,
    pawns: s.pawns.map((pw) =>
      p.ids.includes(pw.id) &&
      pw.drafted &&
      pw.isAlive !== false &&
      pw.currentState !== PAWN_STATE.COLLAPSED
        ? {
            ...pw,
            draftTarget: {
              type: 'attack',
              targetId: p.targetId,
              targetType: p.targetType
            } as never
          }
        : pw
    )
  }),
  /** Force the listed colonists to immediately take the NEAREST available job of a kind (Build /
   *  Harvest), overriding idle wandering, work-priority and restrict-zone gating — the manual "do this
   *  now" override behind the right-click BUILD / HARVEST verbs. The pawn claims the job, paths to an
   *  adjacent tile on the UNCONFINED grid (so a confined pawn can still reach it), and starts working;
   *  the normal FSM handles arrival, work and completion from there. */
  forcePawnJob: (s, p: { ids: string[]; jobType: 'construct' | 'harvest' }) => {
    let gs = s;
    for (const id of p.ids) {
      const pawn = gs.pawns.find((pw) => pw.id === id);
      if (!pawn?.position || pawn.isAlive === false) continue;
      const { x: px, y: py } = pawn.position;
      // Nearest unclaimed (or already-ours) job of the requested kind.
      let best: Job | null = null;
      let bestD = Infinity;
      for (const j of gs.jobs ?? []) {
        if (j.type !== p.jobType) continue;
        if (j.claimedBy !== null && j.claimedBy !== id) continue;
        const d = manhattan(j.targetX, j.targetY, px, py);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      if (!best) continue;
      const target = best;
      const claim = (by: string | null): void => {
        gs = {
          ...gs,
          jobs: (gs.jobs ?? []).map((j) => (j.id === target.id ? { ...j, claimedBy: by } : j))
        };
      };
      claim(id);
      const activeJob = {
        type: target.type as 'harvest' | 'construct',
        jobId: target.id,
        targetX: target.targetX,
        targetY: target.targetY,
        resourceId: target.resourceId,
        droppedItemId: target.droppedItemId,
        buildingId: target.buildingId,
        craftQueueId: target.craftQueueId,
        progress: 0,
        timeRequired: target.workRequired,
        startedTurn: gs.turn
      };
      const setPawn = (patch: Partial<Pawn>): void => {
        gs = { ...gs, pawns: gs.pawns.map((pw) => (pw.id === id ? { ...pw, ...patch } : pw)) };
      };
      // Adjacent already → start working this tick; else path to an adjacent approach (unconfined).
      if (isAdjacent(px, py, target.targetX, target.targetY)) {
        setPawn({
          currentState: PAWN_STATE.WORKING as never,
          activeJob: activeJob as never,
          draftTarget: undefined
        });
        continue;
      }
      const blocked = occupancyService.blockedTiles(gs);
      const approach = findAdjacentApproach(
        target.targetX,
        target.targetY,
        gs.worldMap,
        blocked,
        px,
        py
      );
      if (!approach) {
        claim(null); // nowhere to stand to work it — release so others can try
        continue;
      }
      gs = assignDraftMovePath(gs, pawn, approach.x, approach.y, blocked);
      setPawn({
        currentState: PAWN_STATE.MOVING_TO_RESOURCE as never,
        activeJob: activeJob as never,
        hasReachedDestination: false,
        draftTarget: undefined
      });
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
    pawns: s.pawns.map((pw) => {
      if (pw.id !== p.pawnId) return pw;
      const next = { ...pw, restPolicy: p.policy as never };
      // "No rest" takes effect IMMEDIATELY: if the pawn is mid-nap (or walking to a bed), roll it
      // straight back to Idle so the next tick re-picks work — rather than letting handleSleeping run
      // the nap down to its wake threshold first.
      if (
        p.policy === 'never' &&
        (pw.currentState === PAWN_STATE.SLEEPING ||
          pw.activeJob?.targetState === PAWN_STATE.SLEEPING)
      ) {
        next.currentState = PAWN_STATE.IDLE;
        next.activeJob = undefined;
        next.isMoving = false;
        next.path = [];
        if (pw.state) next.state = { ...pw.state, isSleeping: false };
      }
      return next;
    })
  }),
  /** FORCE WORK toggle: when enabled, the pawn neglects every need and keeps working. Like "no rest",
   *  it takes effect IMMEDIATELY — a pawn currently acting on a need (eating / drinking / sleeping /
   *  walking to one) is rolled back to Idle so the next tick re-picks work instead of finishing the need. */
  setPawnForceWork: (s, p: { pawnId: string; forceWork: boolean }) => ({
    ...s,
    pawns: s.pawns.map((pw) => {
      if (pw.id !== p.pawnId) return pw;
      const next = { ...pw, forceWork: p.forceWork || undefined };
      const NEED_STATES: string[] = [
        PAWN_STATE.HUNGRY,
        PAWN_STATE.TIRED,
        PAWN_STATE.MOVING_TO_NEED,
        PAWN_STATE.EATING,
        PAWN_STATE.SLEEPING,
        PAWN_STATE.DRINKING,
        PAWN_STATE.WASHING
      ];
      if (p.forceWork && NEED_STATES.includes(pw.currentState as string)) {
        next.currentState = PAWN_STATE.IDLE;
        next.activeJob = undefined;
        next.isMoving = false;
        next.path = [];
        if (pw.state) next.state = { ...pw.state, isSleeping: false };
      }
      return next;
    })
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
  unequipPawnItem: (s, p: { pawnId: string; slot: string }) => {
    const pawn = s.pawns.find((pw) => pw.id === p.pawnId);
    const inst = pawn?.equipment?.[p.slot as EquipmentSlot];
    // Clear the slot. (unequipItem only removes from the doll — on its own it would DESTROY the item.)
    const afterUnequip: GameState = {
      ...s,
      pawns: s.pawns.map((pw) =>
        pw.id === p.pawnId ? unequipItem(pw, p.slot as EquipmentSlot) : pw
      )
    };
    if (!pawn?.position || !inst) return afterUnequip;
    // Set the just-unequipped item DOWN on the pawn's tile via the SAME drop path as the carry-card ↓,
    // so the worn item lands on the ground (preserving durability/quality) instead of vanishing.
    return setInstanceDownOnTile(afterUnequip, p.pawnId, pawn.position, inst);
  },
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
  dropCarriedItem: (s, p: { pawnId: string; itemId: string; instanceId?: string }) => {
    const pawn = s.pawns.find((pw) => pw.id === p.pawnId);
    if (!pawn?.position) return s;
    // Carried colonist: an inventory "body" is a LIVE pawn — set it down (restored, on a FREE tile) and
    // end the carry, rather than spawning a `carried_pawn` item on the ground. Reuses the same drop UI.
    if (p.itemId === CARRIED_PAWN_ITEM) {
      const victim = s.pawns.find((pw) => pw.carriedBy === p.pawnId);
      if (!victim) return s;
      const tile = freeDropTileNear(s, pawn.position.x, pawn.position.y, victim.id);
      let gs = dropCarriedPawn(s, p.pawnId, victim.id, tile.x, tile.y);
      // Clear the rescue order so the carrier doesn't immediately walk back and re-grab the body.
      gs = {
        ...gs,
        pawns: gs.pawns.map((pw) =>
          pw.id === p.pawnId && pw.draftTarget?.type === 'rescue'
            ? { ...pw, draftTarget: undefined }
            : pw
        )
      };
      return gs;
    }
    // Tracked instance (a carried tool/weapon/armour — held in `inventory.instances`, not the bulk
    // count map). Drop that specific unit, preserving its durability/quality so a worn axe isn't reset
    // to pristine on the ground.
    if (p.instanceId) {
      const inst = pawn.inventory?.instances?.find((i) => i.instanceId === p.instanceId);
      if (!inst) return s;
      // Remove the unit from the pack (+ un-pin once none remain), then set it down via the shared drop.
      const afterRemove: GameState = {
        ...s,
        pawns: s.pawns.map((pw) => {
          if (pw.id !== p.pawnId) return pw;
          const instances = (pw.inventory?.instances ?? []).filter(
            (i) => i.instanceId !== p.instanceId
          );
          // Only un-pin the itemId once the pawn carries no more units of it (bulk or instance).
          const stillHeld =
            instances.some((i) => i.itemId === p.itemId) ||
            (pw.inventory?.items?.[p.itemId] ?? 0) > 0;
          return {
            ...pw,
            inventory: { ...pw.inventory, instances },
            pinnedItems: stillHeld
              ? pw.pinnedItems
              : (pw.pinnedItems ?? []).filter((id) => id !== p.itemId)
          };
        })
      };
      return setInstanceDownOnTile(afterRemove, p.pawnId, pawn.position, inst);
    }
    const qty = pawn?.inventory?.items?.[p.itemId] ?? 0;
    if (qty <= 0) {
      // ITEM-DBG: the player asked to drop an item the WORKER's pawn doesn't actually hold. If this
      // fires while the carry card shows the item, the main-thread inventory mirror is STALE (the
      // cold-field sync didn't deliver the change) — i.e. a sync bug, not a sim bug.
      gameLogger.log(
        s.turn,
        'ITEM-DBG',
        `dropCarriedItem(bulk): ${pawn?.name ?? p.pawnId} has 0×${p.itemId} in worker inventory ` +
          `(items=${JSON.stringify(pawn?.inventory?.items ?? {})}) — NO-OP. If the UI showed it, the mirror is STALE.`
      );
      return s;
    }
    const drop = {
      id: `drop-${p.pawnId}-${p.itemId}-${Date.now()}`,
      resourceId: p.itemId,
      x: pawn.position.x,
      y: pawn.position.y,
      quantity: qty,
      stored: false
    };
    gameLogger.log(
      s.turn,
      'ITEM-DBG',
      `dropCarriedItem(bulk): ${pawn.name} dropped ${p.itemId}×${qty} → drop ${drop.id} at (${pawn.position.x},${pawn.position.y})`
    );
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
  /** Per-building repair controls (threshold / material allow-list / pawns / pause) — the REPAIR fly-out. */
  setBuildingRepairSettings: (s, p: { id: string; updates: Record<string, unknown> }) => ({
    ...s,
    buildings: (s.buildings ?? []).map((b) =>
      b.id === p.id
        ? { ...b, repairSettings: { ...((b.repairSettings ?? {}) as object), ...p.updates } }
        : b
    )
  }),
  /** Push one building's repair threshold onto EVERY building — the REPAIR fly-out's "apply to all"
   *  (saves re-setting the same condition % per building by hand). */
  setAllBuildingsRepairThreshold: (s, p: { pct: number }) => ({
    ...s,
    buildings: (s.buildings ?? []).map((b) => ({
      ...b,
      repairSettings: { ...((b.repairSettings ?? {}) as object), repairThresholdPct: p.pct }
    }))
  }),
  /** §F storage bins — set a store building's per-item filter (the FILTER fly-out on its card). */
  setBuildingStorageSettings: (s, p: { id: string; updates: Record<string, unknown> }) => ({
    ...s,
    buildings: (s.buildings ?? []).map((b) =>
      b.id === p.id
        ? { ...b, storageSettings: { ...((b.storageSettings ?? {}) as object), ...p.updates } }
        : b
    )
  }),
  /** Colony-wide food filter (which items pawns may eat) — set by the food panel on the pawn card. */
  setFoodSettings: (s, p: { updates: Partial<FoodSettings> }) => ({
    ...s,
    foodSettings: { ...(s.foodSettings ?? {}), ...p.updates }
  }),

  // ── designations / zones ─────────────────────────────────────────────────────
  // A harvest-style mark is rejected on a tile with nothing harvestable RIGHT NOW (e.g. a forage node
  // still below the regrow floor) so it can't paint a phantom marker that never becomes a workable job
  // (isHarvestableTileNow returns true for non-harvest designations, so zones are unaffected).
  designate: (s, p: { x: number; y: number; type: string; instanceId?: string }) =>
    isHarvestableTileNow(s, p.x, p.y, p.type as DesignationType)
      ? designationService.designate(p.x, p.y, p.type as never, s, p.instanceId)
      : s,
  designateTiles: (s, p: { tiles: [number, number][]; type: string }) =>
    p.tiles.reduce(
      (cur, [tx, ty]) =>
        isHarvestableTileNow(cur, tx, ty, p.type as DesignationType)
          ? designationService.designate(tx, ty, p.type as never, cur)
          : cur,
      s
    ),
  clearDesignation: (s, p: { x: number; y: number }) =>
    designationService.clearDesignation(p.x, p.y, s),
  /** Cancel ONLY the action order (harvest/woodcut/forage) on a tile, leaving any restrict/stockpile/
   *  grow zone the tile belongs to intact. Use this — not `clearDesignation` — for harvest-mark cancel,
   *  so cancelling a harvest inside a restrict zone doesn't evict the tile from the zone. */
  clearActionDesignation: (s, p: { x: number; y: number }) =>
    designationService.clearActionDesignation(p.x, p.y, s),
  /** Clear the designation on each listed tile (the targeted inverse of designateTiles — cancels only
   *  the marked tiles, not every tile of a resource type). */
  clearDesignationTiles: (s, p: { tiles: [number, number][] }) =>
    p.tiles.reduce((cur, [tx, ty]) => designationService.clearDesignation(tx, ty, cur), s),
  /** Action-only variant of clearDesignationTiles — cancels harvest orders on the listed tiles without
   *  touching any standing zones they sit in. */
  clearActionDesignationTiles: (s, p: { tiles: [number, number][] }) =>
    p.tiles.reduce((cur, [tx, ty]) => designationService.clearActionDesignation(tx, ty, cur), s),
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
  createZoneInstance: (s, p: { type: ZoneInstanceType; label: string; id: string }) =>
    designationService.createZoneInstanceWithId(p.type, p.label, p.id, s),
  removeZoneInstance: (s, p: { instanceId: string }) =>
    designationService.removeZoneInstance(p.instanceId, s),
  /** RESTRICT zones: toggle a pawn's membership (which pawns are confined to this zone). */
  toggleZonePawn: (s, p: { instanceId: string; pawnId: string }) =>
    designationService.toggleZonePawn(p.instanceId, p.pawnId, s),
  toggleInstanceCategory: (
    s,
    p: { instanceId: string; category: string; allCategories: string[] }
  ) => designationService.toggleInstanceCategory(p.instanceId, p.category, p.allCategories, s),
  clearInstanceFilter: (s, p: { instanceId: string }) =>
    designationService.clearInstanceFilter(p.instanceId, s),
  setInstanceFilter: (s, p: { instanceId: string; filter: ZoneFilter }) =>
    designationService.setInstanceFilter(p.instanceId, p.filter, s),
  /** Set a stockpile zone's haul-fill priority (low/normal/preferred/urgent) — pawns top up higher
   *  zones before spilling into lower ones (see findNearestDepositPoint / depositInventory). */
  setInstancePriority: (s, p: { instanceId: string; priority: ZonePriority }) =>
    designationService.setInstancePriority(p.instanceId, p.priority, s),
  /** Toggle a loose stack's haul lockout (DroppedItem.forbidden). Forbidden stacks are skipped by the
   *  haul generator and any in-flight haul for them is pruned next tick (see jobs/haul.ts). */
  setDropForbidden: (s, p: { dropId: string; forbidden: boolean }) => ({
    ...s,
    droppedItems: (s.droppedItems ?? []).map((d) =>
      d.id === p.dropId ? { ...d, forbidden: p.forbidden } : d
    )
  }),
  /** Flag a loose stack as URGENT to haul — its haul job sorts to the top of every pawn's queue and is
   *  created even when the stockpile is otherwise at capacity (see jobs/haul.ts + getAvailableJobs). */
  setDropUrgent: (s, p: { dropId: string; urgent: boolean }) => ({
    ...s,
    droppedItems: (s.droppedItems ?? []).map((d) =>
      d.id === p.dropId ? { ...d, urgent: p.urgent || undefined } : d
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
  /** Drag-move a crafting order: optionally re-pin it to a different physical workstation
   *  (`stationBuildingId`) and reposition it before `beforeId` (or to the end). Array position drives
   *  priority — craft.ts works one order per station in queue order. Re-pinning recomputes
   *  `workRequired` for the new station's crafting bonus and rescales `workDone` so the progress %
   *  carries over; the reserve-and-fetch system re-routes any staged inputs to the new station tile.
   *  A station change to a building that can't fulfil the recipe (or doesn't exist) is ignored. */
  moveCraftOrder: (s, p: { queueId: string; stationBuildingId?: string; beforeId?: string }) => {
    const queue = s.craftingQueue ?? [];
    const idx = queue.findIndex((o) => o.id === p.queueId);
    if (idx < 0) return s;
    let order = queue[idx];

    // Re-pin to a new station (validated against the recipe's required station type).
    if (p.stationBuildingId && p.stationBuildingId !== order.stationBuildingId) {
      const target = (s.buildings ?? []).find(
        (b) => b.id === p.stationBuildingId && b.status === 'complete'
      );
      if (
        target &&
        buildingService.stationFulfills(target.type, order.stationType ?? 'craft_spot')
      ) {
        const recipe = recipeService.getRecipeForItem(order.item.id);
        const bonus = buildingService.craftingBonusOf(target.type);
        const newRequired = Math.max(
          1,
          Math.ceil(((recipe?.workAmount ?? 1) * order.quantity) / (1 + bonus))
        );
        const pct = order.workRequired > 0 ? (order.workDone ?? 0) / order.workRequired : 0;
        order = {
          ...order,
          stationBuildingId: target.id,
          workRequired: newRequired,
          workDone: Math.min(newRequired, Math.round(newRequired * pct))
        };
      }
    }

    const rest = queue.filter((o) => o.id !== p.queueId);
    const at = p.beforeId ? rest.findIndex((o) => o.id === p.beforeId) : -1;
    if (at >= 0) rest.splice(at, 0, order);
    else rest.push(order);
    return { ...s, craftingQueue: rest };
  },
  /** Toggle the paused flag on a crafting order (chip pause button). */
  toggleCraftPaused: (s, p: { queueId: string }) => ({
    ...s,
    craftingQueue: (s.craftingQueue ?? []).map((o) =>
      o.id === p.queueId ? { ...o, paused: !o.paused } : o
    )
  }),
  /** Drag-reorder the in-progress construction queue. `orderedIds` is the new order of the incomplete
   *  builds; their relative order drives fetch/haul priority (fetch.ts/construct.ts iterate buildings in
   *  array order). Completed buildings keep their slots — only the in-progress slots are refilled. */
  reorderBuilds: (s, p: { orderedIds: string[] }) => {
    const all = s.buildings ?? [];
    const byId = new Map(all.map((b) => [b.id, b]));
    const inOrder = p.orderedIds
      .map((id) => byId.get(id))
      .filter((b): b is PlacedBuilding => !!b && b.status !== 'complete');
    const positions: number[] = [];
    all.forEach((b, i) => {
      if (b.status !== 'complete') positions.push(i);
    });
    const next = [...all];
    positions.forEach((pos, k) => {
      if (inOrder[k]) next[pos] = inOrder[k];
    });
    return { ...s, buildings: next };
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
  // Instant equip-from-ground (no movement). The drafted equip ORDER walks the pawn over first and
  // then applies this same `equipDropToPawn` on arrival (see GameEngineImpl._processDraftOrders).
  equipFromTile: (s, p: { pawnId: string; dropId: string }) =>
    equipDropToPawn(s, p.pawnId, p.dropId),
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

  /** DEBUG insta-kill: kill the pawn OR mob with `id`. Pawns die immediately (killPawn → corpse +
   *  gear drop + chronicle). Mobs are set to 0 health so the entity lifecycle reaps them to a corpse
   *  (+ carcass) on the next tick. Targeted from the kill click-brush (GameCanvas). */
  devKillEntity: (s, p: { id: string }) => {
    const pawn = (s.pawns ?? []).find((pw) => pw.id === p.id && pw.isAlive !== false);
    if (pawn) return killPawn(pawn, 'combat', s);
    const mobs = s.mobs ?? [];
    if (mobs.some((m) => m.id === p.id))
      return { ...s, mobs: mobs.map((m) => (m.id === p.id ? { ...m, health: 0 } : m)) };
    return s;
  },

  /** DEBUG resurrect: bring back the dead colonist at tile (x,y) — targeted by the resurrect
   *  click-brush (click a corpse). A pawn still in the array (just died, not yet reaped) is FULLY
   *  restored in place — wounds/conditions cleared, blood/limbs topped up, needs reset — so it doesn't
   *  immediately re-die. Otherwise the `pawn_carcass` drop on the tile is revived: a fresh body keeping
   *  the dead pawn's name is spawned there and the carcass + its `deadPawns` record are cleared (the
   *  original instance's limbs/traits/skills are gone — it was already reaped). */
  devResurrectAt: (s, p: { x: number; y: number }) => {
    const revive = (pw: (typeof s.pawns)[number]) => ({
      ...pw,
      isAlive: true,
      corpseDropped: false,
      currentState: PAWN_STATE.IDLE,
      activeJob: undefined,
      path: [],
      isMoving: false,
      bloodVolume: pw.maxBloodVolume ?? 100,
      needs: { ...(pw.needs ?? {}), hunger: 0, thirst: 0, fatigue: 0, hygiene: 0 },
      state: { ...(pw.state ?? {}), health: 100, mood: Math.max(pw.state?.mood ?? 50, 50) },
      conditions: [],
      limbs: (pw.limbs ?? []).map((l) => ({
        ...l,
        isMissing: false,
        health: 100,
        bleedRate: 0,
        parts: (l.parts ?? []).map((pt) => ({
          ...pt,
          isMissing: false,
          health: pt.maxHp,
          boneBroken: false,
          injuries: []
        }))
      }))
    });

    // 1. A dead pawn still on the array at this tile (same-turn death) → revive in place.
    const dead = (s.pawns ?? []).find(
      (pw) => pw.isAlive === false && pw.position?.x === p.x && pw.position?.y === p.y
    );
    if (dead) {
      const name = dead.name;
      return {
        ...s,
        pawns: (s.pawns ?? []).map((pw) => (pw.id === dead.id ? revive(pw) : pw)),
        // Clear this pawn's corpse drop + memorial so the body doesn't linger alongside the revived pawn.
        droppedItems: (s.droppedItems ?? []).filter(
          (d) => !(d.resourceId === 'pawn_carcass' && d.id.startsWith(`corpse-${dead.id}-`))
        ),
        deadPawns: (s.deadPawns ?? []).filter((r) => r.name !== name)
      };
    }

    // 2. Otherwise revive the pawn_carcass sitting on this tile (the reaped case): spawn a fresh body
    //    with the same name, remove the carcass + its memorial record.
    const carcass = (s.droppedItems ?? []).find(
      (d) => d.resourceId === 'pawn_carcass' && d.x === p.x && d.y === p.y
    );
    if (!carcass) return s;
    // makeDynamicName stamps "<Name>'s Carcass" — strip the trailing possessive to recover the name.
    const name = (carcass.name ?? '').replace(/'s [^']*$/, '') || 'Revenant';
    const occupied = new Set<string>(
      (s.pawns ?? []).filter((pw) => pw.position).map((pw) => `${pw.position!.x},${pw.position!.y}`)
    );
    const pos = nearestFreeTile(s.worldMap, p.x, p.y, occupied) ?? { x: p.x, y: p.y };
    const [body] = generatePawns(s.race, 1);
    const revived = { ...body, name, position: pos, path: [], pathIndex: 0 };
    return {
      ...s,
      pawns: [...(s.pawns ?? []), revived],
      droppedItems: (s.droppedItems ?? []).filter((d) => d.id !== carcass.id),
      deadPawns: (s.deadPawns ?? []).filter((r) => r.name !== name)
    };
  },

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
        // 'snow' kind — full-map instant snow repaints only the blended snow layer (the stress case
        // the layer exists for), never the terrain/resource grids.
        markTileDirty(tile.y, tile.x, tile, 'snow');
      }
    }
    return { ...s };
  },

  /** Debug: set ice cover across the whole map to `value` (0–100), capped per tile by its wetness so
   *  only wet ground / open water freezes thick (mirrors the real freeze ceiling). 0 clears it. A water
   *  tile crossing ICE_WALKABLE flips to walkable-but-slippery (and back), keeping the A* grid in sync —
   *  so you can also test frozen-water traversal, not just the visual. One-shot full-map pass. */
  devSetMapIce: (s, p: { value: number }) => {
    const v = Math.max(0, Math.min(100, p.value ?? 0));
    for (const row of s.worldMap) {
      for (const tile of row) {
        // Match the sim gate: only walkable ground / open water freeze; dry impassable rock never ices.
        const canFreeze = tile.walkable || tile.type === 'water';
        const wetCeiling = Math.min(100, tileWetness(tile.moisture ?? 0, s.weather));
        const next = !canFreeze || v <= 0 ? 0 : Math.min(wetCeiling, v);
        const prev = tile.ice ?? 0;
        if (next === prev) continue;
        tile.ice = next;
        const baseSub = SUBTERRAINS[tile.subType] ?? SUBTERRAIN_FALLBACK;
        if (!baseSub.walkable) {
          const wasWalk = prev >= ICE_WALKABLE;
          const nowWalk = next >= ICE_WALKABLE;
          if (nowWalk && !wasWalk) {
            tile.walkable = true;
            tile.movementCost = ICE_WATER_MOVE_COST;
            patchPathfindingWalkable(tile.x, tile.y, true);
          } else if (!nowWalk && wasWalk) {
            tile.walkable = false;
            tile.movementCost = baseSub.movementCost;
            patchPathfindingWalkable(tile.x, tile.y, false);
          }
        }
        // 'snow' kind — the ice glaze lives in the blended snow layer (see accumulateSnow).
        markTileDirty(tile.y, tile.x, tile, 'snow');
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
