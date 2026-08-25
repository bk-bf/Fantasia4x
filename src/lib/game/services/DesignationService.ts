import type {
  GameState,
  DesignationType,
  FilterableZoneType,
  ZoneInstanceType,
  ZoneFilter,
  ZoneInstance,
  ZonePriority
} from '../core/types';
import { ZONE_PRIORITY_RANK } from '../core/types';
import { rng } from '../core/util/rng';
import { absorbDropIfOnStockpileTile } from '../core/state/stockpile';

const STANDING_ZONE_TYPES = new Set<DesignationType>(['stockpile', 'grow', 'restrict']);

export function isStandingZoneType(type: DesignationType): boolean {
  return STANDING_ZONE_TYPES.has(type);
}

const WALKABLE_ONLY_ZONE_TYPES = new Set<DesignationType>(['stockpile', 'grow']);

export function zoneTileKeys(gameState: GameState, type: DesignationType): string[] {
  const zt = gameState.zoneTiles ?? {};
  const out: string[] = [];
  for (const k in zt) if (zt[k]?.includes(type)) out.push(k);
  return out;
}

export function isZoneTile(
  gameState: GameState,
  x: number,
  y: number,
  type: DesignationType
): boolean {
  return !!gameState.zoneTiles?.[`${x},${y}`]?.includes(type);
}

export function zoneInstanceIdAt(
  gameState: GameState,
  tileKey: string,
  type: DesignationType
): string | null {
  return gameState.designationZoneId?.[tileKey]?.[type] ?? null;
}

export function zonePriorityRankAt(gs: GameState, x: number, y: number): number {
  const id = zoneInstanceIdAt(gs, `${x},${y}`, 'stockpile');
  if (id) {
    const z = (gs.zoneInstances ?? []).find((zi) => zi.id === id);
    return ZONE_PRIORITY_RANK[(z?.priority as ZonePriority) ?? 'normal'];
  }
  const bin = (gs.buildings ?? []).find(
    (b) => b.status === 'complete' && b.x === x && b.y === y && b.storageSettings?.priority
  );
  if (bin?.storageSettings?.priority) return ZONE_PRIORITY_RANK[bin.storageSettings.priority];
  return ZONE_PRIORITY_RANK.normal;
}

class DesignationServiceImpl {
  private key(x: number, y: number): string {
    return `${x},${y}`;
  }

  private addZoneTile(
    zoneTiles: Record<string, DesignationType[]>,
    k: string,
    type: DesignationType
  ): void {
    const cur = zoneTiles[k] ?? [];
    if (!cur.includes(type)) zoneTiles[k] = [...cur, type];
  }

  private removeZoneTile(
    zoneTiles: Record<string, DesignationType[]>,
    k: string,
    type: DesignationType
  ): void {
    const cur = zoneTiles[k];
    if (!cur) return;
    const next = cur.filter((t) => t !== type);
    if (next.length === 0) delete zoneTiles[k];
    else zoneTiles[k] = next;
  }

  private absorbLooseDropsOnTiles(state: GameState, tileKeys: Set<string>): GameState {
    let next = state;
    const looseIds = (state.droppedItems ?? [])
      .filter((d) => !d.stored && tileKeys.has(this.key(d.x, d.y)))
      .map((d) => d.id);
    for (const id of looseIds) next = absorbDropIfOnStockpileTile(next, id);
    return next;
  }

  private requiresWater(type: DesignationType): boolean {
    return type === 'drink' || type === 'wash';
  }

  isWaterTile(gameState: GameState, x: number, y: number): boolean {
    const t = gameState.worldMap?.[y]?.[x];
    return !!t && (t.type === 'water' || t.terrainType === 'river' || t.terrainType === 'lake');
  }

  isImpassableTile(gameState: GameState, x: number, y: number): boolean {
    return gameState.worldMap?.[y]?.[x]?.walkable === false;
  }

  private requiresWalkableLand(type: DesignationType): boolean {
    return WALKABLE_ONLY_ZONE_TYPES.has(type);
  }

  designate(
    x: number,
    y: number,
    type: DesignationType,
    gameState: GameState,
    zoneInstanceId?: string
  ): GameState {
    if (this.requiresWater(type) && !this.isWaterTile(gameState, x, y)) return gameState;
    if (this.requiresWalkableLand(type) && this.isImpassableTile(gameState, x, y)) return gameState;
    const k = this.key(x, y);
    let state: GameState;
    if (isStandingZoneType(type)) {
      const zoneTiles = { ...(gameState.zoneTiles ?? {}) };
      this.addZoneTile(zoneTiles, k, type);
      state = { ...gameState, zoneTiles };
    } else {
      state = { ...gameState, designations: { ...(gameState.designations ?? {}), [k]: type } };
    }
    if (zoneInstanceId) {
      const prev = (state.designationZoneId ?? {})[k];
      state = {
        ...state,
        designationZoneId: {
          ...(state.designationZoneId ?? {}),
          [k]: { ...prev, [type]: zoneInstanceId }
        }
      };
    }
    if (type === 'stockpile') state = this.absorbLooseDropsOnTiles(state, new Set([k]));
    return state;
  }

  clearDesignation(x: number, y: number, gameState: GameState): GameState {
    const k = this.key(x, y);
    const newDesignations = { ...(gameState.designations ?? {}) };
    delete newDesignations[k];
    const newZoneIds = { ...(gameState.designationZoneId ?? {}) };
    delete newZoneIds[k];
    const newZoneTiles = { ...(gameState.zoneTiles ?? {}) };
    delete newZoneTiles[k];
    return {
      ...gameState,
      designations: newDesignations,
      designationZoneId: newZoneIds,
      zoneTiles: newZoneTiles
    };
  }

  clearActionDesignation(x: number, y: number, gameState: GameState): GameState {
    const k = this.key(x, y);
    if (!(k in (gameState.designations ?? {}))) return gameState;
    const newDesignations = { ...(gameState.designations ?? {}) };
    delete newDesignations[k];
    return { ...gameState, designations: newDesignations };
  }

  clearDesignationsForResource(resourceId: string, gameState: GameState): GameState {
    let state = gameState;
    for (const k of Object.keys(gameState.designations ?? {})) {
      const [x, y] = k.split(',').map(Number);
      if ((gameState.worldMap?.[y]?.[x]?.resources?.[resourceId] ?? 0) > 0) {
        state = this.clearActionDesignation(x, y, state);
      }
    }
    return state;
  }

  getOpenDesignations(
    gameState: GameState,
    type?: DesignationType
  ): { x: number; y: number; type: DesignationType }[] {
    const entries = Object.entries(gameState.designations ?? {});
    const filtered = type ? entries.filter(([, t]) => t === type) : entries;
    return filtered.map(([key, t]) => {
      const [x, y] = key.split(',').map(Number);
      return { x, y, type: t as DesignationType };
    });
  }

  hasDesignation(x: number, y: number, gameState: GameState): boolean {
    const k = this.key(x, y);
    return k in (gameState.designations ?? {}) || (gameState.zoneTiles?.[k]?.length ?? 0) > 0;
  }

  getDesignation(x: number, y: number, gameState: GameState): DesignationType | null {
    return (gameState.designations ?? {})[this.key(x, y)] ?? null;
  }

  designateRect(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    type: DesignationType,
    gameState: GameState,
    zoneInstanceId?: string
  ): GameState {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const mapH = gameState.worldMap?.length ?? 0;
    const mapW = gameState.worldMap?.[0]?.length ?? 0;

    const waterOnly = this.requiresWater(type);
    const walkableOnly = this.requiresWalkableLand(type);
    const standingZone = isStandingZoneType(type);
    const newDesignations = standingZone ? undefined : { ...(gameState.designations ?? {}) };
    const newZoneTiles = standingZone ? { ...(gameState.zoneTiles ?? {}) } : undefined;
    const newZoneIds = zoneInstanceId ? { ...(gameState.designationZoneId ?? {}) } : undefined;
    const paintedTiles = new Set<string>();
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (mapH > 0 && (x < 0 || y < 0 || x >= mapW || y >= mapH)) continue;
        if (waterOnly && !this.isWaterTile(gameState, x, y)) continue;
        if (walkableOnly && this.isImpassableTile(gameState, x, y)) continue;
        const k = this.key(x, y);
        if (standingZone) this.addZoneTile(newZoneTiles!, k, type);
        else newDesignations![k] = type;
        paintedTiles.add(k);
        if (zoneInstanceId && newZoneIds)
          newZoneIds[k] = { ...newZoneIds[k], [type]: zoneInstanceId };
      }
    }
    let state: GameState = {
      ...gameState,
      ...(newDesignations ? { designations: newDesignations } : {}),
      ...(newZoneTiles ? { zoneTiles: newZoneTiles } : {}),
      ...(newZoneIds ? { designationZoneId: newZoneIds } : {})
    };
    if (type === 'stockpile') state = this.absorbLooseDropsOnTiles(state, paintedTiles);
    return state;
  }

  clearRect(x1: number, y1: number, x2: number, y2: number, gameState: GameState): GameState {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const newDesignations = { ...(gameState.designations ?? {}) };
    const newZoneIds = { ...(gameState.designationZoneId ?? {}) };
    const newZoneTiles = { ...(gameState.zoneTiles ?? {}) };
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const k = this.key(x, y);
        delete newDesignations[k];
        delete newZoneIds[k];
        delete newZoneTiles[k];
      }
    }
    return {
      ...gameState,
      designations: newDesignations,
      designationZoneId: newZoneIds,
      zoneTiles: newZoneTiles
    };
  }

  setZoneFilter(type: FilterableZoneType, filter: ZoneFilter, gameState: GameState): GameState {
    return {
      ...gameState,
      zoneFilters: { ...(gameState.zoneFilters ?? {}), [type]: filter }
    };
  }

  clearZoneFilter(type: FilterableZoneType, gameState: GameState): GameState {
    const next = { ...(gameState.zoneFilters ?? {}) };
    delete next[type];
    return { ...gameState, zoneFilters: next };
  }

  getZoneFilter(type: FilterableZoneType, gameState: GameState): ZoneFilter | undefined {
    return gameState.zoneFilters?.[type];
  }

  createZoneInstance(
    type: ZoneInstanceType,
    label: string,
    gs: GameState
  ): { state: GameState; id: string } {
    const id = `${type}-t${gs.turn.toString(36)}-${rng.random().toString(36).slice(2, 6)}`;
    return { state: this.createZoneInstanceWithId(type, label, id, gs), id };
  }

  createZoneInstanceWithId(
    type: ZoneInstanceType,
    label: string,
    id: string,
    gs: GameState
  ): GameState {
    const instance: ZoneInstance = {
      id,
      type,
      label,
      filter: { allowedCategories: [], blockedItems: [] },
      ...(type === 'restrict' ? { assignedPawnIds: gs.pawns.map((p) => p.id) } : {})
    };
    return { ...gs, zoneInstances: [...(gs.zoneInstances ?? []), instance] };
  }

  removeZoneInstance(instanceId: string, gs: GameState): GameState {
    const zoneIdMap = { ...(gs.designationZoneId ?? {}) };
    const designations = { ...(gs.designations ?? {}) };
    const zoneTiles = { ...(gs.zoneTiles ?? {}) };
    const instType = (gs.zoneInstances ?? []).find((z) => z.id === instanceId)?.type;
    for (const [k, layers] of Object.entries(zoneIdMap)) {
      let touched = false;
      const next = { ...layers };
      for (const [t, zId] of Object.entries(next)) {
        if (zId === instanceId) {
          delete next[t as DesignationType];
          touched = true;
        }
      }
      if (!touched) continue;
      if (Object.keys(next).length === 0) delete zoneIdMap[k];
      else zoneIdMap[k] = next;
      if (instType && isStandingZoneType(instType)) this.removeZoneTile(zoneTiles, k, instType);
      else delete designations[k];
    }
    return {
      ...gs,
      zoneInstances: (gs.zoneInstances ?? []).filter((z) => z.id !== instanceId),
      designationZoneId: zoneIdMap,
      designations,
      zoneTiles
    };
  }

  toggleInstanceCategory(
    instanceId: string,
    category: string,
    allCategories: string[],
    gs: GameState
  ): GameState {
    return {
      ...gs,
      zoneInstances: (gs.zoneInstances ?? []).map((z) => {
        if (z.id !== instanceId) return z;
        const cur = z.filter.allowedCategories;
        let allowed: string[];
        if (cur.length === 0) {
          allowed = allCategories.filter((c) => c !== category);
        } else if (cur.includes(category)) {
          allowed = cur.filter((c) => c !== category);
        } else {
          allowed = [...cur, category];
        }
        if (allowed.length >= allCategories.length) allowed = [];
        return { ...z, filter: { ...z.filter, allowedCategories: allowed } };
      })
    };
  }

  setInstanceFilter(instanceId: string, filter: ZoneFilter, gs: GameState): GameState {
    return {
      ...gs,
      zoneInstances: (gs.zoneInstances ?? []).map((z) =>
        z.id === instanceId
          ? {
              ...z,
              filter: {
                allowedCategories: [...filter.allowedCategories],
                blockedItems: [...filter.blockedItems]
              }
            }
          : z
      )
    };
  }

  setInstancePriority(instanceId: string, priority: ZonePriority, gs: GameState): GameState {
    return {
      ...gs,
      zoneInstances: (gs.zoneInstances ?? []).map((z) =>
        z.id === instanceId ? { ...z, priority } : z
      )
    };
  }

  clearInstanceFilter(instanceId: string, gs: GameState): GameState {
    return {
      ...gs,
      zoneInstances: (gs.zoneInstances ?? []).map((z) =>
        z.id === instanceId ? { ...z, filter: { allowedCategories: [], blockedItems: [] } } : z
      )
    };
  }

  setInstanceColorHidden(instanceId: string, hidden: boolean, gs: GameState): GameState {
    return {
      ...gs,
      zoneInstances: (gs.zoneInstances ?? []).map((z) =>
        z.id === instanceId ? { ...z, colorHidden: hidden } : z
      )
    };
  }

  toggleZonePawn(instanceId: string, pawnId: string, gs: GameState): GameState {
    return {
      ...gs,
      zoneInstances: (gs.zoneInstances ?? []).map((z) => {
        if (z.id !== instanceId) return z;
        const cur = z.assignedPawnIds ?? [];
        const assignedPawnIds = cur.includes(pawnId)
          ? cur.filter((id) => id !== pawnId)
          : [...cur, pawnId];
        return { ...z, assignedPawnIds };
      })
    };
  }

  setAllColorHidden(hidden: boolean, gs: GameState): GameState {
    return {
      ...gs,
      zoneInstances: (gs.zoneInstances ?? []).map((z) => ({ ...z, colorHidden: hidden }))
    };
  }
}

export const designationService = new DesignationServiceImpl();
