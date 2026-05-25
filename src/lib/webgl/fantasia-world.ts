/**
 * Fantasia4x → WebGL grid adapter
 * Converts Fantasia4x WorldTile[][] into a GameGrid for the WebGL renderer.
 */

import { GameGrid } from './game-grid.js';
import type { WorldTile } from '$lib/game/core/types.js';
import { SUBTERRAINS, SUBTERRAIN_FALLBACK } from '$lib/game/core/Terrains.js';
import type { RGB } from './tile-types.js';

/**
 * Build a GameGrid from a Fantasia4x WorldTile 2D array.
 * Uses subterrain glyph + color when available, falls back to legacy type.
 */
export function buildGameGrid(worldMap: WorldTile[][]): GameGrid {
    const grid = new GameGrid();

    for (const row of worldMap) {
        for (const tile of row) {
            const sub = SUBTERRAINS[tile.subType] ?? SUBTERRAIN_FALLBACK;
            const fg = sub.fg as [number, number, number];
            const bg = sub.bg as [number, number, number];

            grid.setTile(tile.x, tile.y, {
                char: tile.ascii || sub.char,
                foreground: { r: fg[0], g: fg[1], b: fg[2] },
                background: { r: bg[0], g: bg[1], b: bg[2] },
                position: { x: tile.x, y: tile.y }
            });
        }
    }

    return grid;
}

/**
 * Generate a placeholder world when no worldMap exists yet (pre-game).
 * Uses the noise-based WorldGenerator so it looks the same as a real map.
 */
export function generatePlaceholderGrid(width = 80, height = 50): GameGrid {
    const grid = new GameGrid();

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const n = pseudoNoise(x, y);

            let char: string;
            let fg: RGB;
            let bg: RGB;

            if (y < 3 || y > height - 4 || x < 3 || x > width - 4 || n < 0.15) {
                char = '~'; fg = { r: 0.18, g: 0.40, b: 0.70 }; bg = { r: 0.01, g: 0.03, b: 0.10 };
            } else if (n < 0.35) {
                char = ','; fg = { r: 0.74, g: 0.64, b: 0.18 }; bg = { r: 0.05, g: 0.04, b: 0.01 };
            } else if (n < 0.55) {
                char = '.'; fg = { r: 0.34, g: 0.56, b: 0.20 }; bg = { r: 0.03, g: 0.05, b: 0.01 };
            } else if (n < 0.72) {
                char = '♣'; fg = { r: 0.11, g: 0.48, b: 0.11 }; bg = { r: 0.01, g: 0.06, b: 0.01 };
            } else {
                char = '^'; fg = { r: 0.72, g: 0.72, b: 0.70 }; bg = { r: 0.06, g: 0.06, b: 0.06 };
            }

            grid.setTile(x, y, { char, foreground: fg, background: bg, position: { x, y } });
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
