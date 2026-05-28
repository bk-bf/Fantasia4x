/**
 * DesignationService — Phase 4b
 *
 * Manages tile-level designations on the world map.
 * Designations are stored in GameState.designations as "x,y" → DesignationType.
 *
 * Original system (no Celestia equivalent).
 */

import type { GameState, DesignationType, FilterableZoneType, ZoneFilter } from '../core/types';

class DesignationServiceImpl {
    private key(x: number, y: number): string {
        return `${x},${y}`;
    }

    /**
     * Add or update a designation at (x, y).
     * Returns the updated GameState.
     */
    designate(x: number, y: number, type: DesignationType, gameState: GameState): GameState {
        return {
            ...gameState,
            designations: {
                ...(gameState.designations ?? {}),
                [this.key(x, y)]: type
            }
        };
    }

    /**
     * Remove the designation at (x, y).
     * Returns the updated GameState.
     */
    clearDesignation(x: number, y: number, gameState: GameState): GameState {
        const newDesignations = { ...(gameState.designations ?? {}) };
        delete newDesignations[this.key(x, y)];
        return { ...gameState, designations: newDesignations };
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
     */
    designateRect(
        x1: number, y1: number,
        x2: number, y2: number,
        type: DesignationType,
        gameState: GameState
    ): GameState {
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        const mapH = gameState.worldMap?.length ?? 0;
        const mapW = gameState.worldMap?.[0]?.length ?? 0;

        const newDesignations = { ...(gameState.designations ?? {}) };
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                if (mapH > 0 && (x < 0 || y < 0 || x >= mapW || y >= mapH)) continue;
                newDesignations[this.key(x, y)] = type;
            }
        }
        return { ...gameState, designations: newDesignations };
    }

    /**
     * Clear all designations in a rectangular area.
     */
    clearRect(
        x1: number, y1: number,
        x2: number, y2: number,
        gameState: GameState
    ): GameState {
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        const newDesignations = { ...(gameState.designations ?? {}) };
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                delete newDesignations[this.key(x, y)];
            }
        }
        return { ...gameState, designations: newDesignations };
    }

    // ------------------------------------------------------------------ //
    // ZONE FILTERS                                                         //
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
}

export const designationService = new DesignationServiceImpl();
