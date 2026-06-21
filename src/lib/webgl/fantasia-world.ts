/**
 * Fantasia4x → WebGL grid adapter
 * Converts Fantasia4x WorldTile[][] into a GameGrid for the WebGL renderer.
 */

import { GameGrid } from './game-grid.js';
import type { WorldTile, PlacedBuilding } from '$lib/game/core/types.js';
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

/** Cool white that snow-covered terrain blends toward (SEASONS_WEATHER snow cover). */
const SNOW_WHITE: [number, number, number] = [0.92, 0.94, 0.97];

/** `#rrggbb` → [r,g,b] in 0..1, or null on a missing/bad hex. */
function hexToRgb01(hex?: string): [number, number, number] | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

/**
 * Build a GameGrid from a Fantasia4x WorldTile 2D array.
 * Uses subterrain glyph + color when available, falls back to legacy type.
 * Overlays placed buildings and designations on top of terrain tiles.
 */
export function buildGameGrid(worldMap: WorldTile[][], buildings?: PlacedBuilding[]): GameGrid {
  const grid = new GameGrid();

  // Interior-mountain hiding (flood-fill). "Solid" = a rocky/cliff/mineral_deposit tile still carrying
  // its wall/ore resource — impassable rock you'd have to mine through. We flood the EXTERIOR (every
  // non-solid tile reachable from the map border through non-solid, 4-connected, tiles); solid rock
  // blocks the flood. A tile then renders blank dirt-bg (hidden) unless it's reachable from outside:
  //   • a non-solid tile must itself BE exterior — so an open pocket fully walled inside a massif (a
  //     plains "oasis", or a smaller feature swallowed by a larger mountain) is NOT visible, instead
  //     of poking through as a revealed oasis;
  //   • a solid tile must touch the exterior on an 8-neighbour — the one-tile silhouette of the massif.
  // Mining a wall clears its resource → it becomes non-solid → the flood reaches further in on the next
  // terrain rebuild (the dig reveals inward, DF-style). Map edge (out-of-bounds) counts as exterior.
  const SOLID_SUBTYPES = new Set(['rocky', 'cliff', 'mineral_deposit']);
  const DIRT_BG = (SUBTERRAINS['dirt']?.bg ?? [0.08, 0.06, 0.03]) as [number, number, number];
  const mh = worldMap.length;
  const mw = worldMap[0]?.length ?? 0;
  const solid: boolean[][] = worldMap.map((row) =>
    row.map(
      (t) =>
        SOLID_SUBTYPES.has(t.subType) &&
        !!t.resources &&
        Object.values(t.resources).some((a) => a > 0)
    )
  );

  // BFS the exterior from the border through non-solid tiles (4-connected so walls seal diagonally).
  const exterior: boolean[][] = worldMap.map((row) => row.map(() => false));
  const queue: number[] = [];
  const flood = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= mw || y >= mh) return;
    if (exterior[y][x] || solid[y][x]) return;
    exterior[y][x] = true;
    queue.push(y * mw + x);
  };
  for (let x = 0; x < mw; x++) {
    flood(x, 0);
    flood(x, mh - 1);
  }
  for (let y = 0; y < mh; y++) {
    flood(0, y);
    flood(mw - 1, y);
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const cx = queue[qi] % mw;
    const cy = (queue[qi] / mw) | 0;
    flood(cx + 1, cy);
    flood(cx - 1, cy);
    flood(cx, cy + 1);
    flood(cx, cy - 1);
  }
  const extAt = (x: number, y: number): boolean =>
    x < 0 || y < 0 || x >= mw || y >= mh || exterior[y][x];
  const hidden = (x: number, y: number): boolean => {
    if (!solid[y][x]) return !exterior[y][x]; // enclosed open pocket → hidden
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (extAt(x + dx, y + dy)) return false; // wall facing the outside → visible rim
      }
    }
    return true;
  };

  for (const row of worldMap) {
    for (const tile of row) {
      // Hidden interior (buried rock or an enclosed pocket) → blank dirt-coloured tile.
      if (hidden(tile.x, tile.y)) {
        grid.setTile(tile.x, tile.y, {
          char: ' ',
          foreground: { r: DIRT_BG[0], g: DIRT_BG[1], b: DIRT_BG[2] },
          background: { r: DIRT_BG[0], g: DIRT_BG[1], b: DIRT_BG[2] },
          position: { x: tile.x, y: tile.y }
        });
        continue;
      }
      // Layer 1: base subterrain
      const sub = SUBTERRAINS[tile.subType] ?? SUBTERRAIN_FALLBACK;

      // Layer 2: resource — overrides subterrain visuals when an active resource is present
      const hasResources = tile.resources && Object.keys(tile.resources).length > 0;
      let char: string;
      let fg: [number, number, number];
      let bg: [number, number, number];

      if (hasResources) {
        const activeEntry = Object.entries(tile.resources!).find(([, amt]) => amt > 0);

        // §F: a depleted node (count 0) may still be STANDING. Foraging a tree/bush only takes its
        // branches/berries — the plant stays put and keeps a `growth` entry while its pickable yield
        // regrows; FELLING (woodcut), digging or mining DROPS the growth entry, so those tiles fall
        // through to bare subterrain (dirt). When nothing is pickable yet, draw the most-grown
        // standing resource and dim it by HOW grown it is — so a foraged tree reads as a living tree
        // (≈80% bright), not the old fixed 35% half-dead glyph that looked like the tree was gone.
        let resKey: string | undefined = activeEntry?.[0];
        let brightness = 1;
        if (resKey) {
          // Partial recovery: count back but some per-yield cooldowns still active → medium dim.
          const partial = Object.keys(tile.resourceCooldowns ?? {}).some((k) =>
            k.startsWith(resKey! + ':')
          );
          if (partial) brightness = 0.65;
        } else {
          let bestGrowth = 0;
          for (const [id, g] of Object.entries(tile.growth ?? {})) {
            if (g > bestGrowth) {
              bestGrowth = g;
              resKey = id;
            }
          }
          if (resKey) brightness = Math.max(0.4, bestGrowth / 100);
        }

        const resDef = resKey ? resourceObjectService.getById(resKey) : undefined;
        if (resDef && resDef.chars.length > 0) {
          // Resource layer: pick deterministic char from the resource's char pool
          const h = ((tile.x * 1619 + tile.y * 31337) >>> 0) % resDef.chars.length;
          char = resDef.chars[h];
          fg = [resDef.fg[0] * brightness, resDef.fg[1] * brightness, resDef.fg[2] * brightness];
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

      // Snow cover (SEASONS_WEATHER): blend the terrain/resource colours toward a cool white by the
      // tile's accumulated `snow` (0–100). Applied to the TERRAIN layer only — buildings & dropped
      // items are drawn on top (below / separate sprite pass) so they're never whitened.
      const snow = tile.snow ?? 0;
      if (snow > 0) {
        const t = Math.min(1, snow / 100);
        const wb = t * 0.9; // background whitens the most (the ground goes under snow)
        const wf = t * 0.75; // glyph fades toward white but stays faintly legible
        bg = [
          bg[0] + (SNOW_WHITE[0] - bg[0]) * wb,
          bg[1] + (SNOW_WHITE[1] - bg[1]) * wb,
          bg[2] + (SNOW_WHITE[2] - bg[2]) * wb
        ];
        fg = [
          fg[0] + (SNOW_WHITE[0] - fg[0]) * wf,
          fg[1] + (SNOW_WHITE[1] - fg[1]) * wf,
          fg[2] + (SNOW_WHITE[2] - fg[2]) * wf
        ];
      }

      grid.setTile(tile.x, tile.y, {
        char,
        foreground: { r: fg[0], g: fg[1], b: fg[2] },
        background: { r: bg[0], g: bg[1], b: bg[2] },
        position: { x: tile.x, y: tile.y }
      });
    }
  }

  // Phase 4d: overlay *completed* buildings only — they're opaque, so they live on the glyph grid.
  // Planned / under-construction blueprints are drawn separately on the 2D overlay (drawDesignations
  // in GameCanvas) where real alpha is available, so they can be semi-transparent ghosts.
  if (buildings) {
    for (const b of buildings) {
      if (b.status !== 'complete') continue;
      const def = buildingService.getBuildingById(b.type);
      const char = def?.charSpans
        ? (resolveCharSpans(def.charSpans as Parameters<typeof resolveCharSpans>[0])[0] ?? '#')
        : '#';
      // Render from the building's `color` tag (its single tunable hex), falling back to the legacy
      // `fg` array, then a default. So editing `color` in buildings.jsonc actually recolours it.
      const fg = hexToRgb01(def?.color) ?? def?.fg ?? [0.87, 0.62, 0.12];
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
    }
  }

  // NOTE: standing-zone tints (stockpile/drink/wash) are NOT baked here anymore. They — like the
  // work-designation icons — are painted on the lightweight 2D overlay in GameCanvas.drawDesignations,
  // so drawing/toggling a zone never triggers a full terrain-grid rebuild (the old cause of the
  // "map lags then the color appears" hitch). buildGameGrid is now purely terrain + buildings.

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
