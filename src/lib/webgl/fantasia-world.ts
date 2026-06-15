/**
 * Fantasia4x → WebGL grid adapter
 * Converts Fantasia4x WorldTile[][] into a GameGrid for the WebGL renderer.
 */

import { GameGrid } from './game-grid.js';
import type { WorldTile, PlacedBuilding, DesignationType } from '$lib/game/core/types.js';
import {
  SUBTERRAINS,
  SUBTERRAIN_FALLBACK,
  pickChar,
  resolveCharSpans
} from '$lib/game/core/Terrains.js';
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
  designations?: Record<string, DesignationType>,
  zoneTiles?: Record<string, DesignationType[]>
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
          // Background ALWAYS comes from the subterrain, never the resource — a resource is a glyph
          // (fg char) drawn over uniform terrain. Using resDef.bg leaked the resource's own colour
          // (e.g. trees' green [0.07,0.1,0.03]) into the tile background, and it lingered after harvest
          // while the tile was on cooldown. The land subterrains all share the dirt-brown bg, so this
          // keeps the map background uniform.
          bg = sub.bg as [number, number, number];
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
        const char = def?.charSpans
          ? (resolveCharSpans(def.charSpans as Parameters<typeof resolveCharSpans>[0])[0] ?? '#')
          : '#';
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
          foreground: { r: 0.3 * dim, g: 0.7 * dim, b: 0.7 * dim },
          background: { r: 0.02, g: 0.06, b: 0.06 },
          position: { x: b.x, y: b.y }
        });
      }
    }
  }

  // Phase 4b: overlay designation zone tints
  // Work designation icons (harvest, mine, construct, haul, clear) are rendered
  // on a separate transparent 2D canvas overlay in GameCanvas.svelte so the
  // terrain glyphs remain visible underneath.  Only the stockpile zone tint is
  // applied here because it modifies background colour rather than the glyph.
  // Stockpile is a standing zone, read from `zoneTiles` (not `designations`) so the
  // tint survives a harvest/woodcut order completing on the same tile.
  if (zoneTiles) {
    function lerp(a: number, b: number, t: number) {
      return a + (b - a) * t;
    }
    function blendRGB(a: RGB, b: RGB, t: number): RGB {
      return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) };
    }
    const STOCKPILE_TINT = {
      bg: { r: 0.3, g: 0.18, b: 0.02 } as RGB,
      fg: { r: 1.0, g: 0.8, b: 0.2 } as RGB
    };

    for (const [key, types] of Object.entries(zoneTiles)) {
      if (!types.includes('stockpile')) continue;
      const [x, y] = key.split(',').map(Number);
      const existing = grid.getTile(x, y);
      if (!existing) continue;
      grid.setTile(x, y, {
        char: existing.char,
        foreground: blendRGB(existing.foreground, STOCKPILE_TINT.fg, 0.3),
        background: blendRGB(existing.background, STOCKPILE_TINT.bg, 0.65),
        position: { x, y }
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
        char = '~';
        fg = { r: 0.18, g: 0.4, b: 0.7 };
        bg = { r: 0.01, g: 0.03, b: 0.1 };
      } else if (n < 0.35) {
        char = ',';
        fg = { r: 0.74, g: 0.64, b: 0.18 };
        bg = { r: 0.05, g: 0.04, b: 0.01 };
      } else if (n < 0.55) {
        char = '.';
        fg = { r: 0.34, g: 0.56, b: 0.2 };
        bg = { r: 0.03, g: 0.05, b: 0.01 };
      } else if (n < 0.72) {
        char = '♣';
        fg = { r: 0.11, g: 0.48, b: 0.11 };
        bg = { r: 0.01, g: 0.06, b: 0.01 };
      } else {
        char = '^';
        fg = { r: 0.72, g: 0.72, b: 0.7 };
        bg = { r: 0.06, g: 0.06, b: 0.06 };
      }

      grid.setTile(x, y, { char, foreground: fg, background: bg, position: { x, y } });
    }
  }

  // Settlement marker in the center
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  grid.setTile(cx, cy, {
    char: '#',
    foreground: { r: 0.9, g: 0.7, b: 0.25 },
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
