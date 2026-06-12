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
  ZoneFilter,
  ZoneInstance
} from '../core/types';
import { rng } from '../core/rng';

class DesignationServiceImpl {
  private key(x: number, y: number): string {
    return `${x},${y}`;
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
    const k = this.key(x, y);
    let state: GameState = {
      ...gameState,
      designations: { ...(gameState.designations ?? {}), [k]: type }
    };
    if (zoneInstanceId) {
      state = {
        ...state,
        designationZoneId: { ...(state.designationZoneId ?? {}), [k]: zoneInstanceId }
      };
    }
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
    return { ...gameState, designations: newDesignations, designationZoneId: newZoneIds };
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
    return this.key(x, y) in (gameState.designations ?? {});
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
    const newDesignations = { ...(gameState.designations ?? {}) };
    const newZoneIds = zoneInstanceId ? { ...(gameState.designationZoneId ?? {}) } : undefined;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (mapH > 0 && (x < 0 || y < 0 || x >= mapW || y >= mapH)) continue;
        // Drink/wash zones only paint onto water tiles within the dragged rect.
        if (waterOnly && !this.isWaterTile(gameState, x, y)) continue;
        const k = this.key(x, y);
        newDesignations[k] = type;
        if (zoneInstanceId && newZoneIds) newZoneIds[k] = zoneInstanceId;
      }
    }
    return {
      ...gameState,
      designations: newDesignations,
      ...(newZoneIds ? { designationZoneId: newZoneIds } : {})
    };
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
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const k = this.key(x, y);
        delete newDesignations[k];
        delete newZoneIds[k];
      }
    }
    return { ...gameState, designations: newDesignations, designationZoneId: newZoneIds };
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
    type: FilterableZoneType,
    label: string,
    gs: GameState
  ): { state: GameState; id: string } {
    const id = `${type}-${Date.now().toString(36)}-${rng.random().toString(36).slice(2, 6)}`;
    const instance: ZoneInstance = {
      id,
      type,
      label,
      filter: { allowedCategories: [], blockedItems: [] }
    };
    return { state: { ...gs, zoneInstances: [...(gs.zoneInstances ?? []), instance] }, id };
  }

  /** Remove a zone instance and all its tile designations. */
  removeZoneInstance(instanceId: string, gs: GameState): GameState {
    const zoneIdMap = { ...(gs.designationZoneId ?? {}) };
    const designations = { ...(gs.designations ?? {}) };
    for (const [k, zId] of Object.entries(zoneIdMap)) {
      if (zId === instanceId) {
        delete zoneIdMap[k];
        delete designations[k];
      }
    }
    return {
      ...gs,
      zoneInstances: (gs.zoneInstances ?? []).filter((z) => z.id !== instanceId),
      designationZoneId: zoneIdMap,
      designations
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

  /** Clear all category restrictions from a zone instance's filter. */
  clearInstanceFilter(instanceId: string, gs: GameState): GameState {
    return {
      ...gs,
      zoneInstances: (gs.zoneInstances ?? []).map((z) =>
        z.id === instanceId ? { ...z, filter: { allowedCategories: [], blockedItems: [] } } : z
      )
    };
  }
}

export const designationService = new DesignationServiceImpl();
