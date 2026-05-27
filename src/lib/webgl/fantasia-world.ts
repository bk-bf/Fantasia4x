/**
 * Fantasia4x → WebGL grid adapter
 * Converts Fantasia4x WorldTile[][] into a GameGrid for the WebGL renderer.
 */

import { GameGrid } from './game-grid.js';
import type { WorldTile, PlacedBuilding, DesignationType } from '$lib/game/core/types.js';
import { SUBTERRAINS, SUBTERRAIN_FALLBACK, pickChar } from '$lib/game/core/Terrains.js';
import type { RGB } from './tile-types.js';

/**
 * Build a GameGrid from a Fantasia4x WorldTile 2D array.
 * Uses subterrain glyph + color when available, falls back to legacy type.
 * Overlays placed buildings and designations on top of terrain tiles.
 */
export function buildGameGrid(
    worldMap: WorldTile[][],
    buildings?: PlacedBuilding[],
    designations?: Record<string, DesignationType>
): GameGrid {
    const grid = new GameGrid();

    for (const row of worldMap) {
        for (const tile of row) {
            const sub = SUBTERRAINS[tile.subType] ?? SUBTERRAIN_FALLBACK;
            const fg = sub.fg as [number, number, number];
            const bg = sub.bg as [number, number, number];

            // 5b: if this tile had resources and all have been depleted, render as bare ground
            const hasResourceSlots = tile.resources && Object.keys(tile.resources).length > 0;
            const allDepleted = hasResourceSlots && Object.values(tile.resources!).every((v) => v <= 0);

            if (allDepleted) {
                // Depleted tile: bare ground glyph '.' with a dim brownish tint
                grid.setTile(tile.x, tile.y, {
                    char: '.',
                    foreground: { r: fg[0] * 0.5, g: fg[1] * 0.5, b: fg[2] * 0.5 },
                    background: { r: bg[0], g: bg[1], b: bg[2] },
                    position: { x: tile.x, y: tile.y }
                });
            } else {
                grid.setTile(tile.x, tile.y, {
                    char: pickChar(sub, tile.x, tile.y),
                    foreground: { r: fg[0], g: fg[1], b: fg[2] },
                    background: { r: bg[0], g: bg[1], b: bg[2] },
                    position: { x: tile.x, y: tile.y }
                });
            }
        }
    }

    // Phase 4d: overlay placed buildings
    if (buildings) {
        for (const b of buildings) {
            if (b.status === 'complete') {
                // Completed building: amber '#'
                grid.setTile(b.x, b.y, {
                    char: '#',
                    foreground: { r: 0.87, g: 0.62, b: 0.12 },
                    background: { r: 0.06, g: 0.04, b: 0.01 },
                    position: { x: b.x, y: b.y }
                });
            } else if (b.status === 'under_construction' || b.status === 'planned') {
                // Under construction: dim cyan '+'
                grid.setTile(b.x, b.y, {
                    char: '+',
                    foreground: { r: 0.30, g: 0.70, b: 0.70 },
                    background: { r: 0.02, g: 0.06, b: 0.06 },
                    position: { x: b.x, y: b.y }
                });
            }
        }
    }

    // Phase 4b: overlay designations
    if (designations) {
        // Work designations: replace terrain glyph with a marker char
        const WORK_GLYPHS: Partial<Record<DesignationType, { char: string; fg: RGB }>> = {
            harvest: { char: '!', fg: { r: 0.25, g: 0.85, b: 0.25 } },
            mine: { char: 'X', fg: { r: 0.85, g: 0.55, b: 0.15 } },
            construct: { char: '+', fg: { r: 0.35, g: 0.75, b: 0.80 } },
            haul: { char: 'h', fg: { r: 0.75, g: 0.75, b: 0.25 } },
            clear: { char: 'x', fg: { r: 0.80, g: 0.25, b: 0.25 } }
        };

        // Zone designations: tint background, keep terrain glyph
        const ZONE_TINTS: Partial<Record<DesignationType, { bg: RGB; fg: RGB }>> = {
            forage: { bg: { r: 0.02, g: 0.22, b: 0.04 }, fg: { r: 0.35, g: 0.90, b: 0.35 } },
            scavenge: { bg: { r: 0.18, g: 0.14, b: 0.06 }, fg: { r: 0.70, g: 0.65, b: 0.45 } },
            stockpile: { bg: { r: 0.30, g: 0.18, b: 0.02 }, fg: { r: 1.00, g: 0.80, b: 0.20 } }
        };

        function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
        function blendRGB(a: RGB, b: RGB, t: number): RGB {
            return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) };
        }

        for (const [key, type] of Object.entries(designations)) {
            const [x, y] = key.split(',').map(Number);
            const existing = grid.getTile(x, y);
            if (!existing) continue;

            // Zone types: tint bg + fg, keep terrain glyph
            const zoneTint = ZONE_TINTS[type as DesignationType];
            if (zoneTint) {
                grid.setTile(x, y, {
                    char: existing.char,
                    foreground: blendRGB(existing.foreground, zoneTint.fg, 0.30),
                    background: blendRGB(existing.background, zoneTint.bg, 0.65),
                    position: { x, y }
                });
                continue;
            }

            // Work designations: replace with marker glyph
            const workGlyph = WORK_GLYPHS[type as DesignationType];
            if (workGlyph) {
                grid.setTile(x, y, {
                    char: workGlyph.char,
                    foreground: workGlyph.fg,
                    background: existing.background,
                    position: { x, y }
                });
            }
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
