/**
 * Fantasia4x → WebGL grid adapter
 * Converts Fantasia4x WorldTile[][] into a GameGrid for the WebGL renderer.
 */

import { GameGrid } from './game-grid.js';
import type { WorldTile } from '$lib/game/core/types.js';
import type { RGB } from './tile-types.js';

// ── Tile visual mappings ─────────────────────────────────────────
interface TileStyle {
    char: string;
    fg: RGB;
    bg: RGB;
}

const UNDISCOVERED: TileStyle = {
    char: ' ',
    fg: { r: 0.1, g: 0.1, b: 0.1 },
    bg: { r: 0.02, g: 0.03, b: 0.02 }
};

const TILE_STYLES: Record<WorldTile['type'], TileStyle> = {
    land: {
        char: '.',
        fg: { r: 0.55, g: 0.40, b: 0.20 },
        bg: { r: 0.03, g: 0.04, b: 0.02 }
    },
    forest: {
        char: '♦',
        fg: { r: 0.20, g: 0.55, b: 0.20 },
        bg: { r: 0.02, g: 0.06, b: 0.02 }
    },
    mountain: {
        char: '▲',
        fg: { r: 0.60, g: 0.58, b: 0.55 },
        bg: { r: 0.05, g: 0.05, b: 0.05 }
    },
    water: {
        char: '~',
        fg: { r: 0.20, g: 0.55, b: 0.80 },
        bg: { r: 0.02, g: 0.04, b: 0.10 }
    }
};

/**
 * Build a GameGrid from a Fantasia4x WorldTile 2D array.
 * Call this whenever the world map changes (e.g. tiles discovered).
 */
export function buildGameGrid(worldMap: WorldTile[][]): GameGrid {
    const grid = new GameGrid();

    for (const row of worldMap) {
        for (const tile of row) {
            const style = tile.discovered ? TILE_STYLES[tile.type] : UNDISCOVERED;
            grid.setTile(tile.x, tile.y, {
                char: style.char,
                foreground: style.fg,
                background: style.bg,
                position: { x: tile.x, y: tile.y }
            });
        }
    }

    return grid;
}

/**
 * Generate a placeholder world when no worldMap exists yet.
 * 80×50 tiles with simple noise-based terrain.
 */
export function generatePlaceholderGrid(width = 80, height = 50): GameGrid {
    const grid = new GameGrid();

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const n = pseudoNoise(x, y);
            let style: TileStyle;

            if (y < 3 || y > height - 4 || x < 3 || x > width - 4) {
                style = TILE_STYLES.water;
            } else if (n < 0.15) {
                style = TILE_STYLES.water;
            } else if (n < 0.45) {
                style = TILE_STYLES.land;
            } else if (n < 0.72) {
                style = TILE_STYLES.forest;
            } else {
                style = TILE_STYLES.mountain;
            }

            grid.setTile(x, y, {
                char: style.char,
                foreground: style.fg,
                background: style.bg,
                position: { x, y }
            });
        }
    }

    // Settlement marker in the center
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);
    grid.setTile(cx, cy, {
        char: '#',
        foreground: { r: 0.90, g: 0.70, b: 0.25 },
        background: { r: 0.06, g: 0.04, b: 0.01 },
        position: { x: cx, y: cy }
    });

    return grid;
}

// Simple deterministic noise (no dependencies)
function pseudoNoise(x: number, y: number): number {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
}
