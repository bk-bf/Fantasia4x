/**
 * DesignationService — Phase 4b
 *
 * Manages tile-level designations on the world map.
 * Designations are stored in GameState.designations as "x,y" → DesignationType.
 *
 * Original system (no Celestia equivalent).
 */

import type {
  GameState,
  DesignationType,
  FilterableZoneType,
  ZoneInstanceType,
  ZoneFilter,
  ZoneInstance
} from '../core/types';
import { rng } from '../core/rng';
import { absorbDropIfOnStockpileTile } from '../core/GameState';

/**
 * Standing-zone designation types stored in `GameState.zoneTiles` (a per-tile array) rather than
 * the single-value `GameState.designations` map. These persist as areas and must be able to
 * coexist with a one-shot action order on the same tile — e.g. a `stockpile` under a bush that
 * also carries a `harvest`/`woodcut` order. (`drink`/`wash` are water-only and never overlap a
 * land action, so they stay in `designations` as simple location markers.)
 */
const STANDING_ZONE_TYPES = new Set<DesignationType>(['stockpile', 'grow', 'restrict']);

export function isStandingZoneType(type: DesignationType): boolean {
  return STANDING_ZONE_TYPES.has(type);
}

/**
 * Zone types that may ONLY be painted on walkable land — the gate that stops a stockpile/farm from
 * being drawn into water or onto a mountain/cliff wall (pawns stand on these tiles to work them).
 * This is the FLAG the impassable-tile block reads: a zone type is restricted iff it's in this set.
 * `drink`/`wash` are deliberately absent (they sit ON water, which is impassable — gated by
 * `requiresWater` instead), and a future HOME/territory zone is likewise left out so it CAN enclose
 * impassable tiles (walls, water). Add new land-only zones here; leave impassable-capable ones out.
 */
const WALKABLE_ONLY_ZONE_TYPES = new Set<DesignationType>(['stockpile', 'grow']);

/** Tile keys ("x,y") that belong to the given standing-zone type. */
export function zoneTileKeys(gameState: GameState, type: DesignationType): string[] {
  const zt = gameState.zoneTiles ?? {};
  const out: string[] = [];
  for (const k in zt) if (zt[k]?.includes(type)) out.push(k);
  return out;
}

/** True when tile (x,y) belongs to the given standing-zone type. */
export function isZoneTile(
  gameState: GameState,
  x: number,
  y: number,
  type: DesignationType
): boolean {
  return !!gameState.zoneTiles?.[`${x},${y}`]?.includes(type);
}

class DesignationServiceImpl {
  private key(x: number, y: number): string {
    return `${x},${y}`;
  }

  /** Add a standing-zone type to a tile's zone list (immutable, deduped). */
  private addZoneTile(
    zoneTiles: Record<string, DesignationType[]>,
    k: string,
    type: DesignationType
  ): void {
    const cur = zoneTiles[k] ?? [];
    if (!cur.includes(type)) zoneTiles[k] = [...cur, type];
  }

  /** Remove a standing-zone type from a tile (dropping the key when empty). */
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

  /**
   * A stockpile is just a place designation, so painting one over loose items on the ground
   * should immediately treat them as stored — no haul required. Absorbs every loose drop sitting
   * on a now-stockpile tile within the given tile keys (reuses the same trigger as a deposit).
   */
  private absorbLooseDropsOnTiles(state: GameState, tileKeys: Set<string>): GameState {
    let next = state;
    // Snapshot ids first: absorbing merges/removes drops, mutating the array as we go.
    const looseIds = (state.droppedItems ?? [])
      .filter((d) => !d.stored && tileKeys.has(this.key(d.x, d.y)))
      .map((d) => d.id);
    for (const id of looseIds) next = absorbDropIfOnStockpileTile(next, id);
    return next;
  }

  /** Drink/wash zones may only sit on water tiles (rivers, lakes, open water). */
  private requiresWater(type: DesignationType): boolean {
    return type === 'drink' || type === 'wash';
  }

  /** Matches the water predicate used by auto-drink routing (PawnService). */
  isWaterTile(gameState: GameState, x: number, y: number): boolean {
    const t = gameState.worldMap?.[y]?.[x];
    return !!t && (t.type === 'water' || t.terrainType === 'river' || t.terrainType === 'lake');
  }

  /** Impassable = the tile can't be walked onto (water, mountain/cliff wall, solid building). */
  isImpassableTile(gameState: GameState, x: number, y: number): boolean {
    return gameState.worldMap?.[y]?.[x]?.walkable === false;
  }

  /** True when `type` is a zone that may only be painted on walkable land (see WALKABLE_ONLY_ZONE_TYPES). */
  private requiresWalkableLand(type: DesignationType): boolean {
    return WALKABLE_ONLY_ZONE_TYPES.has(type);
  }

  /**
   * Add or update a designation at (x, y).
   * Optionally assigns the tile to a zone instance.
   * Returns the updated GameState.
   */
  designate(
    x: number,
    y: number,
    type: DesignationType,
    gameState: GameState,
    zoneInstanceId?: string
  ): GameState {
    // Drink/wash zones are only valid on water — silently ignore off-water paints.
    if (this.requiresWater(type) && !this.isWaterTile(gameState, x, y)) return gameState;
    // Land zones (stockpile/farm) can't be painted on impassable tiles (water / walls). Flag-gated via
    // WALKABLE_ONLY_ZONE_TYPES so future home/territory zones can still mark impassable tiles.
    if (this.requiresWalkableLand(type) && this.isImpassableTile(gameState, x, y)) return gameState;
    const k = this.key(x, y);
    let state: GameState;
    if (isStandingZoneType(type)) {
      // Standing zone: store in zoneTiles so it coexists with any action order on this tile.
      const zoneTiles = { ...(gameState.zoneTiles ?? {}) };
      this.addZoneTile(zoneTiles, k, type);
      state = { ...gameState, zoneTiles };
    } else {
      state = { ...gameState, designations: { ...(gameState.designations ?? {}), [k]: type } };
    }
    if (zoneInstanceId) {
      state = {
        ...state,
        designationZoneId: { ...(state.designationZoneId ?? {}), [k]: zoneInstanceId }
      };
    }
    // Painting a stockpile over existing loose items absorbs them in place.
    if (type === 'stockpile') state = this.absorbLooseDropsOnTiles(state, new Set([k]));
    return state;
  }

  /**
   * Remove the designation at (x, y), also clearing any zone instance assignment.
   * Returns the updated GameState.
   */
  clearDesignation(x: number, y: number, gameState: GameState): GameState {
    const k = this.key(x, y);
    const newDesignations = { ...(gameState.designations ?? {}) };
    delete newDesignations[k];
    const newZoneIds = { ...(gameState.designationZoneId ?? {}) };
    delete newZoneIds[k];
    // Erasing a tile clears both its action order and any standing zones on it.
    const newZoneTiles = { ...(gameState.zoneTiles ?? {}) };
    delete newZoneTiles[k];
    return {
      ...gameState,
      designations: newDesignations,
      designationZoneId: newZoneIds,
      zoneTiles: newZoneTiles
    };
  }

  /**
   * Clear ONLY the action order (harvest/woodcut/forage/dig) at (x, y), leaving any standing-zone
   * membership on the tile untouched. Cancelling a harvest must NOT evict the tile from a restrict /
   * stockpile / grow zone it also belongs to — `designationZoneId` and `zoneTiles` carry zone
   * membership, not action orders, so clearing those here silently shrank overlapping zones (the
   * "restrict zone keeps losing tiles when I harvest inside it" bug). Mirrors the harvest-completion
   * clear (jobs/harvest.ts), which only touches `designations` for the same reason.
   */
  clearActionDesignation(x: number, y: number, gameState: GameState): GameState {
    const k = this.key(x, y);
    if (!(k in (gameState.designations ?? {}))) return gameState;
    const newDesignations = { ...(gameState.designations ?? {}) };
    delete newDesignations[k];
    return { ...gameState, designations: newDesignations };
  }

  /**
   * Clear EVERY designated tile that still holds `resourceId` — the symmetric inverse of the
   * "MARK" bulk-designate (which marks all matching resource tiles). Without this, cancelling a
   * batch-marked resource only cleared the one selected tile. Cancels only the action order on each
   * tile (via `clearActionDesignation`) so a marked resource sitting inside a restrict/stockpile zone
   * doesn't strip the zone when its harvest order is cancelled. Returns the updated GameState.
   */
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

  /**
   * Return all current designations, optionally filtered by type.
   * Each entry includes the tile coordinates plus type.
   */
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

  /**
   * Check if a tile at (x, y) has any designation.
   */
  hasDesignation(x: number, y: number, gameState: GameState): boolean {
    const k = this.key(x, y);
    return k in (gameState.designations ?? {}) || (gameState.zoneTiles?.[k]?.length ?? 0) > 0;
  }

  /**
   * Get the designation type at (x, y), or null if none.
   */
  getDesignation(x: number, y: number, gameState: GameState): DesignationType | null {
    return (gameState.designations ?? {})[this.key(x, y)] ?? null;
  }

  /**
   * Fill a rectangular area with a designation.
   * Coordinates are inclusive on both ends. Out-of-bounds tiles are silently skipped.
   * Optionally assigns all tiles to a zone instance.
   */
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
        // Drink/wash zones only paint onto water tiles within the dragged rect.
        if (waterOnly && !this.isWaterTile(gameState, x, y)) continue;
        // Land zones skip impassable tiles (water / walls) — flag-gated for future home zones.
        if (walkableOnly && this.isImpassableTile(gameState, x, y)) continue;
        const k = this.key(x, y);
        if (standingZone) this.addZoneTile(newZoneTiles!, k, type);
        else newDesignations![k] = type;
        paintedTiles.add(k);
        if (zoneInstanceId && newZoneIds) newZoneIds[k] = zoneInstanceId;
      }
    }
    let state: GameState = {
      ...gameState,
      ...(newDesignations ? { designations: newDesignations } : {}),
      ...(newZoneTiles ? { zoneTiles: newZoneTiles } : {}),
      ...(newZoneIds ? { designationZoneId: newZoneIds } : {})
    };
    // Painting a stockpile over existing loose items absorbs them in place (no haul needed).
    if (type === 'stockpile') state = this.absorbLooseDropsOnTiles(state, paintedTiles);
    return state;
  }

  /**
   * Clear all designations in a rectangular area, also clearing zone instance assignments.
   */
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

  // ------------------------------------------------------------------ //
  // ZONE FILTERS (legacy — kept for backward compat)                    //
  // ------------------------------------------------------------------ //

  /**
   * Set (or replace) the category filter for a filterable zone type.
   * An empty `allowedCategories` array disables filtering for that zone type.
   */
  setZoneFilter(type: FilterableZoneType, filter: ZoneFilter, gameState: GameState): GameState {
    return {
      ...gameState,
      zoneFilters: { ...(gameState.zoneFilters ?? {}), [type]: filter }
    };
  }

  /** Remove the filter for a zone type, reverting it to "collect everything". */
  clearZoneFilter(type: FilterableZoneType, gameState: GameState): GameState {
    const next = { ...(gameState.zoneFilters ?? {}) };
    delete next[type];
    return { ...gameState, zoneFilters: next };
  }

  /** Get the current filter for a zone type (undefined = no filter). */
  getZoneFilter(type: FilterableZoneType, gameState: GameState): ZoneFilter | undefined {
    return gameState.zoneFilters?.[type];
  }

  // ------------------------------------------------------------------ //
  // ZONE INSTANCES                                                       //
  // ------------------------------------------------------------------ //

  /** Create a new zone instance with an empty filter. Returns the updated state and the new ID. */
  createZoneInstance(
    type: ZoneInstanceType,
    label: string,
    gs: GameState
  ): { state: GameState; id: string } {
    const id = `${type}-${Date.now().toString(36)}-${rng.random().toString(36).slice(2, 6)}`;
    return { state: this.createZoneInstanceWithId(type, label, id, gs), id };
  }

  /** Create a zone instance with a caller-supplied id (worker command path — the UI generates the
   *  id up front so it can enter paint mode immediately; no request-response reply needed). */
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
      // A new RESTRICT zone confines EVERY current colonist by default — the usual intent is "keep the
      // colony inside this area", and the player unchecks anyone who should roam free. (No tiles are
      // painted yet, so nobody is actually confined until you draw it. Other zone types ignore this.)
      ...(type === 'restrict' ? { assignedPawnIds: gs.pawns.map((p) => p.id) } : {})
    };
    return { ...gs, zoneInstances: [...(gs.zoneInstances ?? []), instance] };
  }

  /** Remove a zone instance and all its tile designations. */
  removeZoneInstance(instanceId: string, gs: GameState): GameState {
    const zoneIdMap = { ...(gs.designationZoneId ?? {}) };
    const designations = { ...(gs.designations ?? {}) };
    const zoneTiles = { ...(gs.zoneTiles ?? {}) };
    const instType = (gs.zoneInstances ?? []).find((z) => z.id === instanceId)?.type;
    for (const [k, zId] of Object.entries(zoneIdMap)) {
      if (zId === instanceId) {
        delete zoneIdMap[k];
        // Clear the tile from whichever map holds this instance's type.
        if (instType && isStandingZoneType(instType)) this.removeZoneTile(zoneTiles, k, instType);
        else delete designations[k];
      }
    }
    return {
      ...gs,
      zoneInstances: (gs.zoneInstances ?? []).filter((z) => z.id !== instanceId),
      designationZoneId: zoneIdMap,
      designations,
      zoneTiles
    };
  }

  /**
   * Toggle a category in a zone instance's filter.
   *
   * An empty `allowedCategories` means "allow everything" (all boxes shown checked).
   * `allCategories` is the full category universe so the first uncheck can materialise
   * the set ("all except this"); re-checking everything collapses back to empty.
   */
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
          // Currently all-allowed → unchecking one leaves all the others.
          allowed = allCategories.filter((c) => c !== category);
        } else if (cur.includes(category)) {
          allowed = cur.filter((c) => c !== category);
        } else {
          allowed = [...cur, category];
        }
        // Everything checked == no restriction; store as empty for consistency.
        if (allowed.length >= allCategories.length) allowed = [];
        return { ...z, filter: { ...z.filter, allowedCategories: allowed } };
      })
    };
  }

  /** Replace a zone instance's filter wholesale. Used by the per-item stockpile filter panel, which
   *  computes the next {allowedCategories, blockedItems} locally (item-level granularity the
   *  category-only toggle can't express) and sends it in one go. */
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

  /** Clear all category restrictions from a zone instance's filter. */
  clearInstanceFilter(instanceId: string, gs: GameState): GameState {
    return {
      ...gs,
      zoneInstances: (gs.zoneInstances ?? []).map((z) =>
        z.id === instanceId ? { ...z, filter: { allowedCategories: [], blockedItems: [] } } : z
      )
    };
  }

  /** Show/hide a single zone instance's map tint (view-only, persisted with the save). */
  setInstanceColorHidden(instanceId: string, hidden: boolean, gs: GameState): GameState {
    return {
      ...gs,
      zoneInstances: (gs.zoneInstances ?? []).map((z) =>
        z.id === instanceId ? { ...z, colorHidden: hidden } : z
      )
    };
  }

  /** RESTRICT zones: add/remove a pawn from this zone's `assignedPawnIds`. A pawn so assigned is
   *  confined to the union of every restrict zone it belongs to (see allowedTilesForPawn). */
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

  /** Show/hide every zone instance's map tint at once. */
  setAllColorHidden(hidden: boolean, gs: GameState): GameState {
    return {
      ...gs,
      zoneInstances: (gs.zoneInstances ?? []).map((z) => ({ ...z, colorHidden: hidden }))
    };
  }
}

export const designationService = new DesignationServiceImpl();
