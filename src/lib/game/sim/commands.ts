import type {
  GameState,
  Pawn,
  Job,
  PawnOrder,
  EquipmentSlot,
  CraftingInProgress,
  ZoneInstanceType,
  PlacedBuilding,
  Season,
  ZoneFilter,
  ZonePriority,
  FoodSettings,
  ItemInstance,
  DesignationType,
  StatKey,
  EntityStats,
  Trait,
  DisableableNeed
} from '../core/types';
import { isHarvestableTileNow } from '../services/jobs/filters';
import { findAdjacentApproach, isAdjacent } from '../systems/pawn/pawnQueries';
import {
  addToStockpileZone,
  consumeFromStockpiles,
  releaseReservation,
  reserveForOrder,
  absorbDropIfOnStockpileTile,
  availableAggregateFromDrops,
  withDrops
} from '../core/state/stockpile';
import {
  carriedQuantities,
  carrierOf,
  emptyOut,
  heldQuantity,
  isFluidId,
  roomFor,
  servingL,
  takeOut
} from '../core/rules/gear/vessels';
import { equipItem, unequipItem, equipDropToPawn } from '../core/rules/gear/equipment';
import { rng } from '../core/util/rng';
import { pickUpFromTile } from '../systems/pawn/pawnHauling';
import { PAWN_STATE } from '../systems/pawn/pawnStates';
import { isUncontrollable } from '../core/defs/states';
import { killPawn } from '../systems/PawnStateMachine';
import { hasShelter } from '../systems/pawn/handlers/rescue';
import { dropCarriedPawn, freeDropTileNear, CARRIED_PAWN_ITEM } from '../systems/pawn/carry';
import { manhattan } from '../core/util/distance';
import { designationService } from '../services/DesignationService';
import { buildingService } from '../services/BuildingService';
import { itemService } from '../services/ItemService';
import { recipeService } from '../services/RecipeService';
import { pawnStatService } from '../services/PawnStatService';
import { getTraitById } from '../core/defs/lineages';
import { applyGainedTrait } from '../entities/Pawns';
import { researchService } from '../services/ResearchService';
import { devSpawnLooseItems, devDestroyAllItems } from '../debug/devWorld';
import { gameLogger } from '../debug/gameLogger';
import { generatePawns, applyConsumable, remapKinIds } from '../entities/Pawns';
import { pawnGrowthService } from '../services/PawnGrowthService';
import { devSpawnMobs, devSpawnMobAt } from '../services/entity/entitySpawning';
import { kingdomService, KNOWLEDGE_XP } from '../services/KingdomService';
import { socialService } from '../services/SocialService';
import { rollMigrantWave } from '../systems/migration';
import {
  makeWeather,
  tileWetness,
  ticksFromGameHours,
  ICE_WALKABLE,
  ICE_WATER_MOVE_COST
} from '../services/EnvironmentService';
import { SUBTERRAINS, SUBTERRAIN_FALLBACK } from '../core/defs/terrains';
import { resourceObjectService } from '../services/ResourceObjectService';
import { patchPathfindingWalkable } from '../services/PathfinderService';
import { occupancyService } from '../services/OccupancyService';
import { assignDraftMovePath } from '../services/draftMovePath';
import { markTileDirty } from '../core/state/tileDeltas';
import { simLog } from '../core/util/logSink';
import type { SimCommand } from './simProtocol';

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
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
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
    if (!free) break;
    claimed.add(`${free.x},${free.y}`);
    targets.set(sorted[i].id, free);
  }
  return targets;
}

type Cmd = (state: GameState, payload: any) => GameState;

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

export const COMMANDS: Record<string, Cmd> = {
  addItem: (s, p: { itemId: string; amount: number; tileKey?: string }) =>
    addToStockpileZone(s, p.tileKey ?? null, { [p.itemId]: p.amount }),
  consumeGlobalItem: (s, p: { itemId: string; quantity: number }) => {
    const current = (s.stockpile ?? {})[p.itemId] ?? 0;
    if (current < p.quantity) return s;
    return consumeFromStockpiles(s, { [p.itemId]: p.quantity });
  },

  applyPawnGrowth: (s, p: { pawnId: string; stats: StatKey[] }) => ({
    ...s,
    pawns: s.pawns.map((pw) =>
      pw.id === p.pawnId ? pawnGrowthService.applyGrowthChoice(pw, p.stats) : pw
    )
  }),
  setPawnDraftTarget: (s, p: { pawnId: string; target: unknown; append?: boolean }) => {
    const target = (p.target as PawnOrder | null) ?? null;
    let gs: GameState;
    if (p.append && target) {
      gs = {
        ...s,
        pawns: s.pawns.map((pw) => {
          if (pw.id !== p.pawnId) return pw;
          return pw.draftTarget
            ? { ...pw, manualQueue: [...(pw.manualQueue ?? []), target] }
            : { ...pw, draftTarget: target };
        })
      };
    } else if (target) {
      gs = {
        ...s,
        pawns: s.pawns.map((pw) =>
          pw.id === p.pawnId ? { ...pw, draftTarget: target, manualQueue: undefined } : pw
        )
      };
    } else {
      const jobs = (s.jobs ?? []).some((j) => j.claimedBy === p.pawnId)
        ? s.jobs.map((j) => (j.claimedBy === p.pawnId ? { ...j, claimedBy: null } : j))
        : s.jobs;
      gs = {
        ...s,
        jobs,
        pawns: s.pawns.map((pw) =>
          pw.id === p.pawnId
            ? {
                ...pw,
                draftTarget: undefined,
                manualQueue: undefined,
                activeJob: undefined,
                currentState: 'Idle' as never
              }
            : pw
        )
      };
    }
    if (target && target.type === 'move') {
      const pawn = gs.pawns.find((pw) => pw.id === p.pawnId);
      if (pawn && pawn.position && !isUncontrollable(pawn.currentState)) {
        gs = assignDraftMovePath(gs, pawn, target.x, target.y);
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
            manualQueue: undefined,
            activeJob: undefined,
            currentState: 'Idle' as never
          }
        : pw
    )
  }),
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
              manualQueue: undefined,
              activeJob: undefined,
              currentState: 'Idle' as never
            }
          : pw
      )
    };
  },
  rescuePawn: (s, p: { victimId: string }) => {
    const victim = s.pawns.find((pw) => pw.id === p.victimId);
    if (!victim || victim.isAlive === false || !victim.position) return s;
    if (victim.currentState !== PAWN_STATE.COLLAPSED) return s;
    if (victim.carriedBy) return s;
    if (!hasShelter(s)) return s;
    if (
      s.pawns.some(
        (pw) => pw.draftTarget?.type === 'rescue' && pw.draftTarget.victimId === p.victimId
      )
    )
      return s;
    const BUSY = new Set<string>([
      PAWN_STATE.COLLAPSED,
      PAWN_STATE.CRYING,
      PAWN_STATE.HIDING,
      PAWN_STATE.PANICKING,
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
  movePawnsFormation: (s, p: { ids: string[]; x: number; y: number }) => {
    const claimed = new Set<string>();
    const targets = new Map<string, { x: number; y: number }>();
    for (const id of p.ids) {
      const tile = nearestFreeTile(s.worldMap, p.x, p.y, claimed);
      if (!tile) break;
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
    const occ = occupancyService.blockedTiles(gs);
    for (const [id, t] of targets) {
      const pawn = gs.pawns.find((pw) => pw.id === id);
      if (pawn && pawn.drafted && pawn.position && !isUncontrollable(pawn.currentState)) {
        gs = assignDraftMovePath(gs, pawn, t.x, t.y, occ);
      }
    }
    return gs;
  },
  movePawnsLine: (s, p: { ids: string[]; ax: number; ay: number; bx: number; by: number }) => {
    const pawns = s.pawns.filter(
      (pw) =>
        p.ids.includes(pw.id) && pw.drafted && pw.position && !isUncontrollable(pw.currentState)
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
      if (pawn && pawn.drafted && pawn.position && !isUncontrollable(pawn.currentState)) {
        gs = assignDraftMovePath(gs, pawn, t.x, t.y, occ);
      }
    }
    return gs;
  },
  attackTargetWith: (s, p: { ids: string[]; targetId: string; targetType: 'pawn' | 'mob' }) => ({
    ...s,
    pawns: s.pawns.map((pw) =>
      p.ids.includes(pw.id) &&
      pw.drafted &&
      pw.isAlive !== false &&
      !isUncontrollable(pw.currentState)
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
  forcePawnJob: (s, p: { ids: string[]; jobType: 'construct' | 'harvest' }) => {
    let gs = s;
    for (const id of p.ids) {
      const pawn = gs.pawns.find((pw) => pw.id === id);
      if (!pawn?.position || pawn.isAlive === false) continue;
      const { x: px, y: py } = pawn.position;
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
        claim(null);
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
  setPawnMedicineTier: (s, p: { pawnId: string; tier: number | null }) => ({
    ...s,
    pawns: s.pawns.map((pw) =>
      pw.id === p.pawnId
        ? { ...pw, medicineTierCap: p.tier == null ? undefined : Math.max(0, Math.round(p.tier)) }
        : pw
    )
  }),

  administerMedicine: (s, p: { caretakerId: string; patientId: string; itemId: string }) => {
    const ci = s.pawns.findIndex((pw) => pw.id === p.caretakerId);
    const pi = s.pawns.findIndex((pw) => pw.id === p.patientId);
    if (ci === -1 || pi === -1) return s;
    const carer = s.pawns[ci];
    const held = carriedQuantities(carer)[p.itemId] ?? 0;
    if (held < doseOf(p.itemId)) return s;
    const def = itemService.getItemById(p.itemId);
    if (!def?.curesConditions?.length && !def?.mendsWounds?.length) return s;
    const a = carer.position;
    const b = s.pawns[pi].position;
    if (!a || !b || !isAdjacent(a.x, a.y, b.x, b.y)) return s;

    const pawns = s.pawns.slice();
    const before = pawns[pi];
    pawns[pi] = applyConsumable(before, p.itemId, Math.random);
    if (pawns[pi] === before) return s;
    const vessel = carrierOf(carer, p.itemId);
    if (vessel)
      return drainCarriedDose({ ...s, pawns }, p.caretakerId, vessel.instanceId, p.itemId);
    const items = { ...(carer.inventory?.items ?? {}) };
    items[p.itemId] = (items[p.itemId] ?? 0) - doseOf(p.itemId);
    if (items[p.itemId] <= 0) delete items[p.itemId];
    pawns[ci] = { ...carer, inventory: { ...(carer.inventory ?? { instances: [] }), items } };
    return { ...s, pawns };
  },

  setPawnRestPolicy: (s, p: { pawnId: string; policy: string }) => ({
    ...s,
    pawns: s.pawns.map((pw) => {
      if (pw.id !== p.pawnId) return pw;
      const next = { ...pw, restPolicy: p.policy as never };
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
    pawns: s.pawns.map((pw) => (pw.id === p.pawnId ? equipItem(pw, p.itemId, s.turn) : pw))
  }),
  unequipPawnItem: (s, p: { pawnId: string; slot: string }) => {
    const pawn = s.pawns.find((pw) => pw.id === p.pawnId);
    const inst = pawn?.equipment?.[p.slot as EquipmentSlot];
    const afterUnequip: GameState = {
      ...s,
      pawns: s.pawns.map((pw) =>
        pw.id === p.pawnId ? unequipItem(pw, p.slot as EquipmentSlot) : pw
      )
    };
    if (!pawn?.position || !inst) return afterUnequip;
    return setInstanceDownOnTile(afterUnequip, p.pawnId, pawn.position, inst);
  },
  useConsumableItem: (s, p: { pawnId: string; itemId: string; vesselInstanceId?: string }) => {
    const idx = s.pawns.findIndex((pw) => pw.id === p.pawnId);
    if (idx === -1) return s;
    if (!p.vesselInstanceId && !stockedDose(s, p.itemId)) return s;
    if (p.vesselInstanceId && !carriedDose(s, p.pawnId, p.vesselInstanceId, p.itemId)) return s;
    const pawns = s.pawns.slice();
    const before = pawns[idx];
    const alchemyQuality =
      pawnStatService.getWorkModifiers(before, 'alchemy', undefined, 'crafting').quality ?? 1;
    pawns[idx] = applyConsumable(before, p.itemId, () => rng.random(), alchemyQuality);
    if (pawns[idx] === before) return s;
    return p.vesselInstanceId
      ? drainCarriedDose({ ...s, pawns }, p.pawnId, p.vesselInstanceId, p.itemId)
      : consumeFromStockpiles({ ...s, pawns }, { [p.itemId]: doseOf(p.itemId) });
  },

  applyWeaponCoating: (s, p: { pawnId: string; itemId: string; vesselInstanceId?: string }) => {
    const idx = s.pawns.findIndex((pw) => pw.id === p.pawnId);
    if (idx === -1) return s;
    if (!p.vesselInstanceId && !stockedDose(s, p.itemId)) return s;
    if (p.vesselInstanceId && !carriedDose(s, p.pawnId, p.vesselInstanceId, p.itemId)) return s;
    const pawn = s.pawns[idx];
    const mh = pawn.equipment?.mainHand;
    if (!mh) return s;
    const def = itemService.getItemById(p.itemId);
    if (!def?.coatingEffect) return s;
    const expiresAtTurn = s.turn + ticksFromGameHours(def.coatingDurationHours ?? 6);
    const pawns = s.pawns.slice();
    pawns[idx] = {
      ...pawn,
      equipment: {
        ...pawn.equipment,
        mainHand: { ...mh, coating: { itemId: p.itemId, expiresAtTurn } }
      }
    };
    return p.vesselInstanceId
      ? drainCarriedDose({ ...s, pawns }, p.pawnId, p.vesselInstanceId, p.itemId)
      : consumeFromStockpiles({ ...s, pawns }, { [p.itemId]: doseOf(p.itemId) });
  },

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

  dropCarriedItem: (s, p: { pawnId: string; itemId: string; instanceId?: string }) => {
    const pawn = s.pawns.find((pw) => pw.id === p.pawnId);
    if (!pawn?.position) return s;
    if (p.itemId === CARRIED_PAWN_ITEM) {
      const victim = s.pawns.find((pw) => pw.carriedBy === p.pawnId);
      if (!victim) return s;
      const tile = freeDropTileNear(s, pawn.position.x, pawn.position.y, victim.id);
      let gs = dropCarriedPawn(s, p.pawnId, victim.id, tile.x, tile.y);
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
    if (p.instanceId) {
      const inst = pawn.inventory?.instances?.find((i) => i.instanceId === p.instanceId);
      if (!inst) return s;
      const afterRemove: GameState = {
        ...s,
        pawns: s.pawns.map((pw) => {
          if (pw.id !== p.pawnId) return pw;
          const instances = (pw.inventory?.instances ?? []).filter(
            (i) => i.instanceId !== p.instanceId
          );
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
    return absorbDropIfOnStockpileTile(next, drop.id);
  },

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
  setVesselFilter: (s, p: { instanceId: string; allowedItemIds: string[] }) =>
    mapVesselInstance(s, p.instanceId, (inst) => ({ ...inst, filter: [...p.allowedItemIds] })),

  setVesselFilterDefault: (s, p: { vesselItemId: string; allowedItemIds: string[] }) => ({
    ...s,
    vesselFilterDefaults: {
      ...(s.vesselFilterDefaults ?? {}),
      [p.vesselItemId]: [...p.allowedItemIds]
    }
  }),

  drawFluidFromStation: (s, p: { buildingId: string; itemId: string; pawnId?: string }) => {
    const b = (s.buildings ?? []).find((x) => x.id === p.buildingId && x.status === 'complete');
    const held = (b?.fluidContents ?? []).find((e) => e.itemId === p.itemId)?.litres ?? 0;
    if (!b || held <= 0) return s;
    const free = (s.droppedItems ?? [])
      .filter(
        (d) =>
          d.stored &&
          !d.reservedFor &&
          !d.forbidden &&
          d.instance &&
          !d.instance.contents?.length &&
          roomFor(d.instance, p.itemId, 0.001) > 0
      )
      .sort(
        (l, r) =>
          Math.abs(l.x - b.x) + Math.abs(l.y - b.y) - (Math.abs(r.x - b.x) + Math.abs(r.y - b.y))
      )[0];
    if (!free?.instance) return s;
    const id = `fill-${free.instance.instanceId}-${p.itemId}`;
    if ((s.jobs ?? []).some((j) => j.id === id)) return s;
    return {
      ...s,
      jobs: [
        ...(s.jobs ?? []),
        {
          id,
          type: 'fill' as const,
          targetX: free.x,
          targetY: free.y,
          resourceId: p.itemId,
          droppedItemId: free.id,
          vesselInstanceId: free.instance.instanceId,
          manual: true,
          workRequired: 0.02,
          workDone: 0,
          claimedBy: p.pawnId ?? null
        }
      ]
    };
  },

  emptyVessel: (s, p: { instanceId: string }) =>
    mapVesselInstance(s, p.instanceId, (inst) => {
      const next = { ...inst };
      emptyOut(next);
      return next;
    }),

  setBuildingRepairSettings: (s, p: { id: string; updates: Record<string, unknown> }) => ({
    ...s,
    buildings: (s.buildings ?? []).map((b) =>
      b.id === p.id
        ? { ...b, repairSettings: { ...((b.repairSettings ?? {}) as object), ...p.updates } }
        : b
    )
  }),
  setAllBuildingsRepairThreshold: (s, p: { pct: number }) => ({
    ...s,
    buildings: (s.buildings ?? []).map((b) => ({
      ...b,
      repairSettings: { ...((b.repairSettings ?? {}) as object), repairThresholdPct: p.pct }
    }))
  }),
  setBuildingStorageSettings: (s, p: { id: string; updates: Record<string, unknown> }) => ({
    ...s,
    buildings: (s.buildings ?? []).map((b) =>
      b.id === p.id
        ? { ...b, storageSettings: { ...((b.storageSettings ?? {}) as object), ...p.updates } }
        : b
    )
  }),
  setFoodSettings: (s, p: { updates: Partial<FoodSettings> }) => ({
    ...s,
    foodSettings: { ...(s.foodSettings ?? {}), ...p.updates }
  }),

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
  clearActionDesignation: (s, p: { x: number; y: number }) =>
    designationService.clearActionDesignation(p.x, p.y, s),
  clearDesignationTiles: (s, p: { tiles: [number, number][] }) =>
    p.tiles.reduce((cur, [tx, ty]) => designationService.clearDesignation(tx, ty, cur), s),
  clearActionDesignationTiles: (s, p: { tiles: [number, number][] }) =>
    p.tiles.reduce((cur, [tx, ty]) => designationService.clearActionDesignation(tx, ty, cur), s),
  clearDesignationsForResource: (s, p: { resourceId: string }) =>
    designationService.clearDesignationsForResource(p.resourceId, s),
  clearRect: (s, p: { x1: number; y1: number; x2: number; y2: number }) =>
    designationService.clearRect(p.x1, p.y1, p.x2, p.y2, s),
  designateRect: (
    s,
    p: { x1: number; y1: number; x2: number; y2: number; type: string; instanceId?: string }
  ) => designationService.designateRect(p.x1, p.y1, p.x2, p.y2, p.type as never, s, p.instanceId),
  createZoneInstance: (s, p: { type: ZoneInstanceType; label: string; id: string }) =>
    designationService.createZoneInstanceWithId(p.type, p.label, p.id, s),
  removeZoneInstance: (s, p: { instanceId: string }) =>
    designationService.removeZoneInstance(p.instanceId, s),
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
  setInstancePriority: (s, p: { instanceId: string; priority: ZonePriority }) =>
    designationService.setInstancePriority(p.instanceId, p.priority, s),
  setInstanceContainerBudget: (s, p: { instanceId: string; containerBudget: number }) => ({
    ...s,
    zoneInstances: (s.zoneInstances ?? []).map((z) =>
      z.id === p.instanceId ? { ...z, containerBudget: p.containerBudget } : z
    )
  }),
  setDropForbidden: (s, p: { dropId: string; forbidden: boolean }) => ({
    ...s,
    droppedItems: (s.droppedItems ?? []).map((d) =>
      d.id === p.dropId ? { ...d, forbidden: p.forbidden } : d
    )
  }),
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

  startResearch: (s, p: { researchId: string }) => researchService.startResearch(p.researchId, s),
  cancelResearch: (s) => ({ ...s, currentResearch: undefined }),
  cancelCrafting: (s, p: { queueId: string }) => {
    const next = releaseReservation(s, p.queueId);
    return { ...next, craftingQueue: (next.craftingQueue || []).filter((q) => q.id !== p.queueId) };
  },
  moveCraftOrder: (s, p: { queueId: string; stationBuildingId?: string; beforeId?: string }) => {
    const queue = s.craftingQueue ?? [];
    const idx = queue.findIndex((o) => o.id === p.queueId);
    if (idx < 0) return s;
    let order = queue[idx];

    if (p.stationBuildingId && p.stationBuildingId !== order.stationBuildingId) {
      const target = (s.buildings ?? []).find(
        (b) => b.id === p.stationBuildingId && b.status === 'complete'
      );
      if (
        target &&
        buildingService.stationFulfills(target.type, order.stationType ?? 'craft_spot')
      ) {
        const recipe = order.recipeId
          ? recipeService.getRecipeById(order.recipeId)
          : recipeService.getRecipeForItem(order.item.id);
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
  toggleCraftPaused: (s, p: { queueId: string }) => ({
    ...s,
    craftingQueue: (s.craftingQueue ?? []).map((o) =>
      o.id === p.queueId ? { ...o, paused: !o.paused } : o
    )
  }),
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
  craftItem: (
    s,
    p: { itemId: string; quantity?: number; selectedIngredients?: Record<string, string> }
  ) => {
    const quantity = p.quantity ?? 1;
    const item = itemService.getItemById(p.itemId);
    if (!item) return s;
    if (!itemService.canQueueCraft(p.itemId, s)) return s;
    const recipe = item.isCarcass
      ? itemService.resolveCarcassRecipe(item.id, s)
      : recipeService.getRecipeForItem(item.id);
    if (!recipe) return s;
    const resolved = item.isCarcass
      ? {}
      : (p.selectedIngredients ?? itemService.autoSelectIngredients(p.itemId, s) ?? {});
    const activeCost = item.isCarcass
      ? { ...recipe.inputs }
      : (itemService.resolveActiveCost(item.id, s, resolved) ??
        itemService.calculateCraftingCost(item.id));
    const inputs: Record<string, number> = {};
    for (const [id, q] of Object.entries(activeCost)) inputs[id] = q * quantity;
    const stationType = recipe.station ?? null;
    const station = buildingService.bestCraftStation(stationType ?? 'craft_spot', s);
    const stationBuildingId = station?.id;
    const craftBonus = station ? buildingService.craftingBonusOf(station.type) : 0;
    const workRequired = Math.max(
      1,
      Math.ceil(((recipe.workAmount ?? 1) * quantity) / (1 + craftBonus))
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
    if (!allReserved) gs = releaseReservation(gs, orderId);
    const order: CraftingInProgress = {
      id: orderId,
      item,
      recipeId: recipe.id,
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

  equipFromTile: (s, p: { pawnId: string; dropId: string }) =>
    equipDropToPawn(s, p.pawnId, p.dropId),
  pickUpItemFromTile: (s, p: { pawnId: string; dropId: string; quantity: number }) => {
    const drop = (s.droppedItems ?? []).find((d) => d.id === p.dropId);
    if (!drop) return s;
    return pickUpFromTile(s, p.pawnId, drop.x, drop.y, {
      dropId: p.dropId,
      maxQty: Math.max(1, Math.floor(p.quantity))
    });
  },
  haulTileToStockpile: (s, p: { pawnId: string; x: number; y: number }) => ({
    ...s,
    pawns: s.pawns.map((pw) =>
      pw.id === p.pawnId ? { ...pw, draftTarget: { type: 'haul', x: p.x, y: p.y } } : pw
    )
  }),
  devSpawnAllItems: (s, p: { amount?: number }) => devSpawnLooseItems(s, p.amount ?? 500),
  devClearAllItems: (s) => devDestroyAllItems(s),

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
      id: `dev-spawn-${p.itemId}-${x}-${y}-t${s.turn}`,
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

  devSpawnPawns: (s, p: { count?: number }) => {
    const pawns = generatePawns(s.culture, p.count ?? 1);
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

  commitMigrants: (s, p: { acceptedIds?: string[] }) => {
    const ev = s.pendingEvent;
    if (!ev || ev.kind !== 'migrant-wave') return { ...s, pendingEvent: undefined };
    const accepted = new Set(p.acceptedIds ?? []);
    const chosen = ev.candidates.filter((c) => accepted.has(c.id));
    if (chosen.length === 0) return { ...s, pendingEvent: undefined };

    const w = s.worldMap[0]?.length ?? 0;
    const h = s.worldMap.length;
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    const occupied = new Set<string>(
      s.pawns.filter((pw) => pw.position).map((pw) => `${pw.position!.x},${pw.position!.y}`)
    );
    const existingIds = new Set(s.pawns.map((pw) => pw.id));
    let n = s.pawns.length;
    const commitIds = new Map<string, string>();
    const placed = chosen.map((c) => {
      let id = `pawn-${n++}`;
      while (existingIds.has(id)) id = `pawn-${n++}`;
      existingIds.add(id);
      commitIds.set(c.id, id);
      const pos = nearestFreeTile(s.worldMap, cx, cy, occupied) ?? { x: cx, y: cy };
      occupied.add(`${pos.x},${pos.y}`);
      return { ...c, id, position: pos, path: [], pathIndex: 0 };
    });
    remapKinIds(placed, commitIds);

    simLog.logActivity({
      turn: s.turn,
      type: 'event',
      actor: 'system',
      action:
        placed.length === 1
          ? `${placed[0].name} joins the colony`
          : `${placed.length} migrants join the colony`,
      result: placed.map((pw) => pw.name).join(', '),
      severity: 'success'
    });

    const joined: GameState = { ...s, pawns: [...s.pawns, ...placed], pendingEvent: undefined };
    return socialService.meetColony(kingdomService.seedKingdomKnowledgeFromPawns(joined, placed));
  },

  acknowledgeKingdomArrival: (s) =>
    s.pendingEvent?.kind === 'kingdom-arrival' ? { ...s, pendingEvent: undefined } : s,

  executeTrade: (
    s,
    p: {
      partyId: string;
      pawnId: string;
      give: { itemId: string; qty: number }[];
      receive: { itemId: string; qty: number }[];
    }
  ) => {
    const party = (s.kingdomParties ?? []).find((pt) => pt.id === p.partyId);
    if (!party || party.kind !== 'caravan') return s;
    const pawn = s.pawns.find((pw) => pw.id === p.pawnId && pw.isAlive !== false);
    if (!pawn) return s;

    const giveMap: Record<string, number> = {};
    for (const l of p.give) {
      if (l.qty <= 0) return s;
      giveMap[l.itemId] = (giveMap[l.itemId] ?? 0) + l.qty;
    }
    const receiveMap: Record<string, number> = {};
    for (const l of p.receive) {
      if (l.qty <= 0) return s;
      receiveMap[l.itemId] = (receiveMap[l.itemId] ?? 0) + l.qty;
    }
    if (Object.keys(giveMap).length === 0 && Object.keys(receiveMap).length === 0) return s;
    const available = availableAggregateFromDrops(s.droppedItems ?? []);
    for (const [id, qty] of Object.entries(giveMap)) {
      if ((available[id] ?? 0) < qty) return s;
    }
    for (const [id, qty] of Object.entries(receiveMap)) {
      if ((party.stock.find((g) => g.itemId === id)?.qty ?? 0) < qty) return s;
    }

    const tradeStat = pawnStatService.evaluateStat('trade', pawn);
    const sumValue = (map: Record<string, number>, side: 'give' | 'receive') =>
      Object.entries(map).reduce(
        (sum, [itemId, qty]) =>
          sum +
          kingdomService.effectiveTradePrice(s, party.kingdomId, { itemId, qty }, side, tradeStat) *
            qty,
        0
      );
    if (sumValue(giveMap, 'give') < sumValue(receiveMap, 'receive')) return s;

    let next: GameState = s;
    if (Object.keys(giveMap).length > 0) next = consumeFromStockpiles(next, giveMap);
    if (Object.keys(receiveMap).length > 0) next = addToStockpileZone(next, null, receiveMap);
    const stock = party.stock.map((g) => ({ ...g }));
    for (const [id, qty] of Object.entries(receiveMap)) {
      const line = stock.find((g) => g.itemId === id);
      if (line) line.qty -= qty;
    }
    for (const [id, qty] of Object.entries(giveMap)) {
      const line = stock.find((g) => g.itemId === id);
      if (line) line.qty += qty;
      else stock.push({ itemId: id, qty });
    }
    next = {
      ...next,
      kingdomParties: (next.kingdomParties ?? []).map((pt) =>
        pt.id === party.id ? { ...pt, stock: stock.filter((g) => g.qty > 0) } : pt
      )
    };

    next = kingdomService.recordContact(
      next,
      party.kingdomId,
      Math.round(KNOWLEDGE_XP.tradeCompleted * Math.max(0.5, tradeStat))
    );
    next = kingdomService.adjustColonyRelation(next, party.kingdomId, 4);

    const kingdomName =
      (next.kingdoms ?? []).find((k) => k.id === party.kingdomId)?.name ?? 'a kingdom';
    simLog.logActivity({
      turn: s.turn,
      type: 'event',
      actor: pawn.name,
      action: `struck a bargain with the caravan from ${kingdomName}`,
      result: '',
      severity: 'success'
    });
    return next;
  },

  devSpawnEntities: (s, p: { count?: number; creatureId?: string }) =>
    devSpawnMobs(s, p.count ?? 5, p.creatureId),

  devSpawnMobAt: (s, p: { creatureId: string; x: number; y: number }) =>
    devSpawnMobAt(s, p.creatureId, p.x, p.y),

  devTriggerKingdomArrival: (s, p: { kind?: 'caravan' | 'visitor' }) =>
    kingdomService.forceArrival(s, p.kind),

  devTriggerMigrantWave: (s) => rollMigrantWave(s, true),

  devKillEntity: (s, p: { id: string }) => {
    const pawn = (s.pawns ?? []).find((pw) => pw.id === p.id && pw.isAlive !== false);
    if (pawn) return killPawn(pawn, 'combat', s);
    const mobs = s.mobs ?? [];
    if (mobs.some((m) => m.id === p.id))
      return { ...s, mobs: mobs.map((m) => (m.id === p.id ? { ...m, health: 0 } : m)) };
    return s;
  },

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

    const dead = (s.pawns ?? []).find(
      (pw) => pw.isAlive === false && pw.position?.x === p.x && pw.position?.y === p.y
    );
    if (dead) {
      const name = dead.name;
      return {
        ...s,
        pawns: (s.pawns ?? []).map((pw) => (pw.id === dead.id ? revive(pw) : pw)),
        droppedItems: (s.droppedItems ?? []).filter(
          (d) => !(d.resourceId === 'pawn_carcass' && d.id.startsWith(`corpse-${dead.id}-`))
        ),
        deadPawns: (s.deadPawns ?? []).filter((r) => r.name !== name)
      };
    }

    const carcass = (s.droppedItems ?? []).find(
      (d) => d.resourceId === 'pawn_carcass' && d.x === p.x && d.y === p.y
    );
    if (!carcass) return s;
    const name = (carcass.name ?? '').replace(/'s [^']*$/, '') || 'Revenant';
    const occupied = new Set<string>(
      (s.pawns ?? []).filter((pw) => pw.position).map((pw) => `${pw.position!.x},${pw.position!.y}`)
    );
    const pos = nearestFreeTile(s.worldMap, p.x, p.y, occupied) ?? { x: p.x, y: p.y };
    const [body] = generatePawns(s.culture, 1);
    const revived = { ...body, name, position: pos, path: [], pathIndex: 0 };
    return {
      ...s,
      pawns: [...(s.pawns ?? []), revived],
      droppedItems: (s.droppedItems ?? []).filter((d) => d.id !== carcass.id),
      deadPawns: (s.deadPawns ?? []).filter((r) => r.name !== name)
    };
  },

  setWeather: (s, p: { type: string }) => ({ ...s, weather: makeWeather(p.type) }),

  setSeason: (s, p: { season: Season | null }) => ({ ...s, _debugSeason: p.season ?? undefined }),

  setTimeOfDay: (s, p: { timeOfDay: number | null }) => ({
    ...s,
    _debugTimeOfDay: p.timeOfDay ?? undefined
  }),

  setResearchGateOff: (s, p: { off: boolean }) => ({
    ...s,
    _devResearchGateOff: p.off || undefined
  }),

  devToggleDecay: (s, p: { kind: 'deterioration' | 'spoilage'; off: boolean }) => {
    const key = p.kind === 'spoilage' ? '_devFreezeSpoilage' : '_devFreezeDeterioration';
    return { ...s, [key]: p.off || undefined };
  },

  devInfiniteFuel: (s, p: { on: boolean }) => ({ ...s, _devInfiniteFuel: p.on || undefined }),

  devSetPawnStats: (s, p: { pawnId: string; stats: Partial<EntityStats> }) => ({
    ...s,
    pawns: s.pawns.map((pw) => {
      if (pw.id !== p.pawnId) return pw;
      const stats = { ...pw.stats, ...p.stats };
      const maxStats = pw.maxStats ? { ...pw.maxStats } : undefined;
      if (maxStats) {
        for (const k of Object.keys(p.stats) as (keyof EntityStats)[]) {
          maxStats[k] = Math.max(maxStats[k] ?? 0, stats[k]);
        }
      }
      return { ...pw, stats, maxStats };
    })
  }),

  devSetPawnTraits: (s, p: { pawnId: string; traitIds: string[] }) => {
    const traits = p.traitIds.map((id) => getTraitById(id)).filter((t): t is Trait => !!t);
    return {
      ...s,
      pawns: s.pawns.map((pw) => {
        if (pw.id !== p.pawnId) return pw;
        const next: Pawn = {
          ...pw,
          traits: [...traits],
          stats: { ...pw.stats },
          needs: pw.needs ? { ...pw.needs } : pw.needs,
          limbs: pw.limbs?.map((l) => ({ ...l, parts: l.parts?.map((pt) => ({ ...pt })) }))
        } as Pawn;
        for (const t of traits) applyGainedTrait(next, t);
        return next;
      })
    };
  },

  devSetPawnSkills: (s, p: { pawnId: string; skills: Record<string, number> }) => ({
    ...s,
    pawns: s.pawns.map((pw) => {
      if (pw.id !== p.pawnId) return pw;
      const skills = { ...pw.skills };
      const skillXp = { ...(pw.skillXp ?? {}) };
      for (const [k, v] of Object.entries(p.skills)) {
        skills[k] = Math.max(1, Math.min(50, Math.round(v)));
        skillXp[k] = 0;
      }
      return { ...pw, skills, skillXp };
    })
  }),

  devSetBloodNeed: (
    s,
    p: { pawnId: string; kind: 'carcass' | 'humanoid'; bloodHunger?: number; rage?: boolean }
  ) => ({
    ...s,
    pawns: s.pawns.map((pw) => {
      if (pw.id !== p.pawnId) return pw;
      const needs = { ...(pw.needs ?? {}) };
      if (p.bloodHunger !== undefined)
        needs.bloodHunger = Math.max(0, Math.min(100, p.bloodHunger));
      const conditionTimers = { ...(pw.conditionTimers ?? {}) };
      if (p.rage) conditionTimers.bloodthirst = Math.max(conditionTimers.bloodthirst ?? 0, 6 * 750);
      return { ...pw, bloodNeedKind: p.kind, needs, conditionTimers };
    })
  }),

  devSetDropCondition: (s, p: { resourceId: string; condition: number }) => ({
    ...s,
    droppedItems: (s.droppedItems ?? []).map((d) =>
      d.resourceId === p.resourceId
        ? {
            ...d,
            unitConditions: Array(d.quantity ?? 1).fill(Math.max(0, Math.min(100, p.condition)))
          }
        : d
    )
  }),

  devGrantGrowth: (s, p: { pawnId: string; doubled?: boolean }) => ({
    ...s,
    pawns: s.pawns.map((pw) => {
      if (pw.id !== p.pawnId) return pw;
      const copy = { ...pw, pendingGrowth: [...(pw.pendingGrowth ?? [])] };
      pawnGrowthService.grantGrowthOffer(copy, p.doubled ?? false);
      return copy;
    })
  }),

  devUnlockResearch: (s, p: { researchId?: string; all?: boolean }) => {
    if (p.all) {
      let gs = s;
      for (const r of researchService.getAllResearch()) {
        gs = researchService.completeResearch(r.id, gs);
      }
      return gs;
    }
    if (!p.researchId) return s;
    return researchService.completeResearch(p.researchId, s);
  },

  devSetToolTier: (s, p: { tier: number }) => ({
    ...s,
    currentToolLevel: Math.max(0, Math.round(p.tier))
  }),

  devToggleNeed: (s, p: { need: DisableableNeed; off: boolean }) => {
    const cur = { ...(s._needsDisabled ?? {}) };
    if (p.off) cur[p.need] = true;
    else delete cur[p.need];
    return { ...s, _needsDisabled: Object.keys(cur).length > 0 ? cur : undefined };
  },

  devSpawnBuildingAt: (s, p: { buildingId: string; x: number; y: number }) => {
    const def = buildingService.getBuildingById(p.buildingId);
    if (!def) return s;
    if (s.worldMap?.[p.y]?.[p.x]?.walkable === false) return s;
    const placed: PlacedBuilding = {
      id: `${p.buildingId}-${p.x}-${p.y}-t${s.turn}`,
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

  devSetMapMoisture: (s, p: { value: number }) => {
    const v = Math.max(0, Math.min(100, p.value ?? 0));
    for (const row of s.worldMap) {
      for (const tile of row) {
        if ((tile.moisture ?? 0) === v) continue;
        tile.moisture = v;
        markTileDirty(tile.y, tile.x, tile);
      }
    }
    return { ...s };
  },
  devSetMapSoil: (s, p: { subType: string }) => {
    const sub = SUBTERRAINS[p.subType] ?? SUBTERRAIN_FALLBACK;
    for (const row of s.worldMap) {
      for (const tile of row) {
        if (!tile.walkable) continue;
        tile.subType = p.subType;
        tile.walkable = sub.walkable;
        tile.movementCost = sub.movementCost;
        tile.blocksSight = sub.blocksSight ?? false;
        patchPathfindingWalkable(tile.x, tile.y, sub.walkable);
        markTileDirty(tile.y, tile.x, tile);
      }
    }
    return { ...s };
  },
  devCropGrowthScale: (s, p: { factor: number }) => ({
    ...s,
    _devCropGrowthScale: Math.max(1, p.factor || 1)
  }),
  devSetMapSnow: (s, p: { value: number }) => {
    const v = Math.max(0, Math.min(100, p.value ?? 0));
    for (const row of s.worldMap) {
      for (const tile of row) {
        const wet = tileWetness(tile.moisture ?? 0, s.weather);
        const factor = 0.4 + (Math.max(0, Math.min(100, wet)) / 100) * 1.4;
        const next = v <= 0 ? 0 : Math.max(0, Math.min(100, Math.round(v * factor)));
        if (next === (tile.snow ?? 0)) continue;
        tile.snow = next;
        markTileDirty(tile.y, tile.x, tile, 'snow');
      }
    }
    return { ...s };
  },

  devSetMapIce: (s, p: { value: number }) => {
    const v = Math.max(0, Math.min(100, p.value ?? 0));
    for (const row of s.worldMap) {
      for (const tile of row) {
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
        markTileDirty(tile.y, tile.x, tile, 'snow');
      }
    }
    return { ...s };
  }
};

export function applySimCommand(state: GameState, cmd: SimCommand): GameState {
  const fn = COMMANDS[cmd.type];
  if (!fn) {
    console.error('[sim] unknown command:', cmd.type);
    return state;
  }
  return fn(state, cmd.payload);
}

function mapVesselInstance(
  s: GameState,
  instanceId: string,
  fn: (inst: ItemInstance) => ItemInstance
): GameState {
  const drops = (s.droppedItems ?? []).map((d) =>
    d.instance?.instanceId === instanceId ? { ...d, instance: fn(d.instance) } : d
  );
  const pawns = s.pawns.map((p) => {
    const inInv = (p.inventory?.instances ?? []).some((i) => i.instanceId === instanceId);
    const wornSlot = Object.entries(p.equipment ?? {}).find(
      ([, i]) => i?.instanceId === instanceId
    )?.[0];
    if (!inInv && !wornSlot) return p;
    return {
      ...p,
      ...(inInv
        ? {
            inventory: {
              ...p.inventory,
              instances: (p.inventory?.instances ?? []).map((i) =>
                i.instanceId === instanceId ? fn(i) : i
              )
            }
          }
        : {}),
      ...(wornSlot
        ? {
            equipment: {
              ...p.equipment,
              [wornSlot]: fn(p.equipment[wornSlot as EquipmentSlot]!)
            }
          }
        : {})
    };
  });
  return { ...withDrops(s, drops), pawns };
}

function carriedDose(s: GameState, pawnId: string, instanceId: string, itemId: string): boolean {
  const pawn = s.pawns.find((p) => p.id === pawnId);
  const inst = (pawn?.inventory?.instances ?? []).find((i) => i.instanceId === instanceId);
  if (!inst) return false;
  const held = heldQuantity(inst, itemId);
  return isFluidId(itemId) ? held >= servingL(itemId) : held >= 1;
}

function doseOf(itemId: string): number {
  return isFluidId(itemId) ? servingL(itemId) : 1;
}

function stockedDose(s: GameState, itemId: string): boolean {
  return ((s.stockpile ?? {})[itemId] ?? 0) >= doseOf(itemId);
}

function drainCarriedDose(
  s: GameState,
  pawnId: string,
  instanceId: string,
  itemId: string
): GameState {
  const want = isFluidId(itemId) ? servingL(itemId) : 1;
  return {
    ...s,
    pawns: s.pawns.map((p) => {
      if (p.id !== pawnId) return p;
      const drain = (i: ItemInstance): ItemInstance => {
        if (i.instanceId !== instanceId) return i;
        const copy: ItemInstance = { ...i, contents: i.contents?.map((e) => ({ ...e })) };
        takeOut(copy, itemId, want);
        return copy;
      };
      const instances = (p.inventory?.instances ?? []).map(drain);
      const equipment = Object.fromEntries(
        Object.entries(p.equipment ?? {}).map(([slot, i]) => [slot, i ? drain(i) : i])
      ) as typeof p.equipment;
      return { ...p, equipment, inventory: { ...(p.inventory ?? { items: {} }), instances } };
    })
  };
}
