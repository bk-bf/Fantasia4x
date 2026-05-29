/**
 * Fantasia4x → WebGL grid adapter
 * Converts Fantasia4x WorldTile[][] into a GameGrid for the WebGL renderer.
 */

import { GameGrid } from './game-grid.js';
import type { WorldTile, PlacedBuilding, DesignationType } from '$lib/game/core/types.js';
import { SUBTERRAINS, SUBTERRAIN_FALLBACK, pickChar, resolveCharSpans } from '$lib/game/core/Terrains.js';
import { resourceObjectService } from '$lib/game/services/ResourceObjectService.js';
import { buildingService } from '$lib/game/services/BuildingService.js';
import { glyph, SHEET } from './tilesets.js';
import type { RGB } from './tile-types.js';

/** Glyph used as a demolition-queued overlay on top of buildings. */
const DECONSTRUCT_GLYPH = glyph(SHEET.MAP, 88);

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
            // Layer 1: base subterrain
            const sub = SUBTERRAINS[tile.subType] ?? SUBTERRAIN_FALLBACK;

            // Layer 2: resource — overrides subterrain visuals when an active resource is present
            const hasResources = tile.resources && Object.keys(tile.resources).length > 0;
            let char: string;
            let fg: [number, number, number];
            let bg: [number, number, number];

            if (hasResources) {
                const activeEntry = Object.entries(tile.resources!).find(([, amt]) => amt > 0);

                // Resolve which resource is showing a cooldown glyph when fully depleted.
                // Cooldown keys are either "resourceId" (simple) or "resourceId:itemId" (compound).
                let cooldownResourceId: string | undefined;
                if (!activeEntry) {
                    const firstCoolingKey = Object.keys(tile.resourceCooldowns ?? {}).find(
                        (k) => (tile.resourceCooldowns![k] ?? 0) > 0
                    );
                    if (firstCoolingKey) {
                        cooldownResourceId = firstCoolingKey.includes(':')
                            ? firstCoolingKey.split(':')[0]
                            : firstCoolingKey;
                    }
                }

                // Partial recovery: resource count > 0 but some per-yield cooldowns still active.
                const isPartialRecovery = activeEntry
                    ? Object.keys(tile.resourceCooldowns ?? {}).some((k) =>
                        k.startsWith(activeEntry[0] + ':')
                    )
                    : false;

                const resKey = activeEntry?.[0] ?? cooldownResourceId;
                const resDef = resKey ? resourceObjectService.getById(resKey) : undefined;
                if (resDef && resDef.chars.length > 0) {
                    // Resource layer: pick deterministic char from the resource's char pool
                    const h = ((tile.x * 1619 + tile.y * 31337) >>> 0) % resDef.chars.length;
                    char = resDef.chars[h];
                    if (cooldownResourceId) {
                        // Fully depleted + on cooldown — very dim (35% brightness)
                        fg = [resDef.fg[0] * 0.35, resDef.fg[1] * 0.35, resDef.fg[2] * 0.35];
                    } else if (isPartialRecovery) {
                        // Some yields back, some still cooling — medium brightness (65%)
                        fg = [resDef.fg[0] * 0.65, resDef.fg[1] * 0.65, resDef.fg[2] * 0.65];
                    } else {
                        fg = resDef.fg;
                    }
                    bg = resDef.bg;
                } else {
                    // Resource depleted or unknown — show base subterrain
                    char = pickChar(sub, tile.x, tile.y);
                    fg = sub.fg as [number, number, number];
                    bg = sub.bg as [number, number, number];
                }
            } else {
                char = pickChar(sub, tile.x, tile.y);
                fg = sub.fg as [number, number, number];
                bg = sub.bg as [number, number, number];
            }

            grid.setTile(tile.x, tile.y, {
                char,
                foreground: { r: fg[0], g: fg[1], b: fg[2] },
                background: { r: bg[0], g: bg[1], b: bg[2] },
                position: { x: tile.x, y: tile.y }
            });
        }
    }

    // Phase 4d: overlay placed buildings
    if (buildings) {
        for (const b of buildings) {
            if (b.status === 'complete') {
                const def = buildingService.getBuildingById(b.type);
                const char = def?.charSpans ? (resolveCharSpans(def.charSpans as Parameters<typeof resolveCharSpans>[0])[0] ?? '#') : '#';
                const fg = def?.fg ?? [0.87, 0.62, 0.12];
                const bg = def?.bg ?? [0.06, 0.04, 0.01];
                grid.setTile(b.x, b.y, {
                    char,
                    foreground: { r: fg[0], g: fg[1], b: fg[2] },
                    background: { r: bg[0], g: bg[1], b: bg[2] },
                    position: { x: b.x, y: b.y }
                });
                // Deconstruct-queued overlay: render the demolition glyph in orange-red
                if (b.deconstructQueued) {
                    grid.setTile(b.x, b.y, {
                        char: DECONSTRUCT_GLYPH,
                        foreground: { r: 1.0, g: 0.25, b: 0.05 },
                        background: { r: bg[0], g: bg[1], b: bg[2] },
                        position: { x: b.x, y: b.y }
                    });
                }
            } else if (b.status === 'under_construction' || b.status === 'planned') {
                // Under construction/planned: cyan '+'; paused buildings are dimmed
                const dim = b.paused ? 0.35 : 1.0;
                grid.setTile(b.x, b.y, {
                    char: b.paused ? '…' : '+',
                    foreground: { r: 0.30 * dim, g: 0.70 * dim, b: 0.70 * dim },
                    background: { r: 0.02, g: 0.06, b: 0.06 },
                    position: { x: b.x, y: b.y }
                });
            }
        }
    }

    // Phase 4b: overlay designations
    if (designations) {
        // All designation icons are white + fairly transparent so they don't clutter the map.
        // Sprite mapping:
        //   harvest (woodcutting/other) → tiles#246  U+00F7 ÷
        //   harvest (gathering/forage)  → tiles#242  U+2265 ≥
        //   mine                        → items#207
        //   construct / haul / clear    → simple ASCII chars
        const WORK_FG: RGB = { r: 0.45, g: 0.45, b: 0.45 };

        const SIMPLE_ICONS: Partial<Record<DesignationType, string>> = {
            construct: '+',
            haul: 'h',
            clear: 'x'
        };

        const STOCKPILE_TINT = {
            bg: { r: 0.30, g: 0.18, b: 0.02 } as RGB,
            fg: { r: 1.00, g: 0.80, b: 0.20 } as RGB
        };

        function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
        function blendRGB(a: RGB, b: RGB, t: number): RGB {
            return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) };
        }

        for (const [key, type] of Object.entries(designations)) {
            const [x, y] = key.split(',').map(Number);
            const existing = grid.getTile(x, y);
            if (!existing) continue;

            if (type === 'stockpile') {
                grid.setTile(x, y, {
                    char: existing.char,
                    foreground: blendRGB(existing.foreground, STOCKPILE_TINT.fg, 0.30),
                    background: blendRGB(existing.background, STOCKPILE_TINT.bg, 0.65),
                    position: { x, y }
                });
                continue;
            }

            if (type === 'harvest') {
                // Pick sprite based on the resource's workCategory
                const tile = worldMap[y]?.[x];
                const resourceId = tile?.resources
                    ? Object.keys(tile.resources).find((id) => (tile.resources![id] ?? 0) > 0)
                    : undefined;
                const resDef = resourceId ? resourceObjectService.getById(resourceId) : undefined;
                const char = resDef?.interaction.workCategory === 'foraging'
                    ? '\u2265'  // tiles#242 — gathering
                    : '\u00F7'; // tiles#246 — woodcutting / harvest
                grid.setTile(x, y, { char, foreground: WORK_FG, background: existing.background, position: { x, y } });
                continue;
            }

            if (type === 'mine') {
                grid.setTile(x, y, {
                    char: glyph(SHEET.ITEMS, 207),
                    foreground: WORK_FG,
                    background: existing.background,
                    position: { x, y }
                });
                continue;
            }

            const icon = SIMPLE_ICONS[type as DesignationType];
            if (icon) {
                grid.setTile(x, y, { char: icon, foreground: WORK_FG, background: existing.background, position: { x, y } });
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
