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
  resolveCharSpans,
  MSHOCK_TALL
} from '$lib/game/core/Terrains.js';
import { resourceObjectService } from '$lib/game/services/ResourceObjectService.js';
import { RESOURCE_VISIBLE_GROWTH } from '$lib/game/core/wildGrowth.js';
import { buildingService } from '$lib/game/services/BuildingService.js';
import { glyph, SHEET } from './tilesets.js';
import type { RGB } from './tile-types.js';

/** Glyph used as a demolition-queued overlay on top of buildings. */
const DECONSTRUCT_GLYPH = glyph(SHEET.MAP, 88);

/** Cool white that snow-covered terrain blends toward (SEASONS_WEATHER snow cover). */
const SNOW_WHITE: [number, number, number] = [0.92, 0.94, 0.97];
/** Pale blue-white a frozen tile glazes toward (SEASONS_WEATHER ice) — a thin sheen, not a snow blanket. */
const ICE_BLUE: [number, number, number] = [0.78, 0.88, 0.98];
/** Below this %, ice is hidden (mirrors EnvironmentService.ICE_VISIBLE) so a stray rime doesn't glaze tiles. */
const ICE_VISIBLE_RENDER = 8;

/** Snow-cover sprites (bitlands `tiles` 44 → 45 → 46): increasingly-filled textures the snow layer
 *  PROGRESSES through as it deepens, drawn fg-white over the kept (transparent) terrain bg — so light
 *  snow is a sparse white texture over the ground and deep snow nearly fills the cell, before the final
 *  stage goes completely white. */
const SNOW_STAGE_CHARS: string[] = [44, 45, 46].map(
  (id) => resolveCharSpans([{ sheet: 'tiles', id }] as Parameters<typeof resolveCharSpans>[0])[0]
);

/**
 * "Solid" = a cave/mineral_deposit mountain tile still carrying its wall/ore resource — impassable rock
 * you'd have to mine through. Mining clears the resource → the tile stops being solid (cave floor under
 * walls, the ore vein under ore). `cave` is the walkable mountain floor walls/gems/outcrops sit on.
 */
const SOLID_SUBTYPES = new Set(['cave', 'mineral_deposit']);

/**
 * Interior-mountain hiding mask (flood-fill). `mask[y][x] === true` means the tile is buried inside a
 * massif (or sealed in an enclosed pocket) and should behave as blank rock everywhere — no glyph (a
 * clean silhouette), no resource glow leaking out, no hover/jump reveal of what's underneath.
 *
 * We flood the EXTERIOR (every non-solid tile reachable from the map border through non-solid,
 * 4-connected tiles); solid rock blocks the flood. A tile is then hidden unless it's reachable from
 * outside:
 *   • a non-solid tile must itself BE exterior — so an open pocket fully walled inside a massif (a
 *     plains "oasis", or a smaller feature swallowed by a larger mountain) is hidden, not poking
 *     through as a revealed oasis;
 *   • a solid tile must touch the exterior on an 8-neighbour — the one-tile silhouette of the massif.
 *
 * The map EDGE (out-of-bounds) is NOT treated as exterior for the solid-silhouette test, so a
 * mountain/cliff wall flush against the map border is hidden too: it faces only the void off-map, not
 * open ground, so it reads as fog rather than a hard wall pinned to the map edge.
 *
 * Mining a wall clears its resource → it becomes non-solid → the flood reaches further in on the next
 * rebuild (the dig reveals inward, DF-style).
 */
/** A tile is "solid" iff it's a cave/mineral subtype STILL carrying its wall/ore resource. */
function tileSolidValue(t: WorldTile): boolean {
  return (
    SOLID_SUBTYPES.has(t.subType) && !!t.resources && Object.values(t.resources).some((a) => a > 0)
  );
}

/**
 * Persistent hidden-mask state (ADR-026): the `mask` PLUS the intermediate `solid`/`exterior` grids it
 * was derived from, so {@link updateHiddenMaskAt} can re-derive a LOCAL region after a tile's solidness
 * flips (mining) — no whole-map BFS on a per-tick delta. Built once per map by {@link computeHiddenMaskState}.
 */
export interface HiddenMaskState {
  mask: boolean[][];
  solid: boolean[][];
  exterior: boolean[][];
  mw: number;
  mh: number;
}

/** Coord pair returned by the incremental updater (tiles whose rendered mask actually changed). */
export interface TileCoord {
  y: number;
  x: number;
}

/** Full O(map) hidden-mask build (border-BFS). ADR-026: only legal on a new-map load, never per-delta. */
export function computeHiddenMaskState(worldMap: WorldTile[][]): HiddenMaskState {
  const mh = worldMap.length;
  const mw = worldMap[0]?.length ?? 0;
  const solid: boolean[][] = worldMap.map((row) => row.map(tileSolidValue));

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

  const mask: boolean[][] = worldMap.map((row) => row.map(() => false));
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) mask[y][x] = maskAt(solid, exterior, mw, mh, x, y);
  }
  return { mask, solid, exterior, mw, mh };
}

/** Back-compat thin wrapper: the mask only (used by buildGameGrid + tests). */
export function computeHiddenMask(worldMap: WorldTile[][]): boolean[][] {
  return computeHiddenMaskState(worldMap).mask;
}

/** In-bounds exterior test — the map edge is the void, not open ground (see doc above). */
function extInBounds(exterior: boolean[][], mw: number, mh: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < mw && y < mh && exterior[y][x];
}

/** Mask value for one tile from the current solid/exterior grids (the per-tile rule, shared by full + incremental). */
function maskAt(
  solid: boolean[][],
  exterior: boolean[][],
  mw: number,
  mh: number,
  x: number,
  y: number
): boolean {
  if (!solid[y][x]) return !exterior[y][x]; // enclosed open pocket → hidden
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (extInBounds(exterior, mw, mh, x + dx, y + dy)) return false; // wall facing open ground → silhouette
    }
  }
  return true;
}

/**
 * ADR-026 incremental hidden-mask update. Given the changed-tile coords from a `worldMapDelta`, re-derive
 * the mask for ONLY the affected region — never a whole-map BFS:
 *  - If no changed tile's `solid` value flipped (harvest/regrowth/grass — the per-tick common case) this
 *    early-outs at O(changed) with zero flood work.
 *  - A wall MINED (solid→non-solid) floods the freshly-opened pocket to exterior, bounded by pocket size.
 *  - A tile that becomes solid (rare — terraform) clears exterior on just that cell, then re-tests each
 *    non-solid neighbour's reachability; all OTHER exterior flags stay valid as anchors, so a neighbour
 *    still touching open ground resolves in O(1), and only a genuinely sealed pocket costs its own size.
 * Mutates `state` in place; returns the tiles whose rendered mask changed (caller repaints just those).
 */
export function updateHiddenMaskAt(
  state: HiddenMaskState,
  worldMap: WorldTile[][],
  changed: ReadonlyArray<TileCoord>
): TileCoord[] {
  const { solid, exterior, mw, mh } = state;
  // 1. Keep only coords whose solidness actually flipped — the topology that the mask depends on.
  const flips: TileCoord[] = [];
  for (const { y, x } of changed) {
    const t = worldMap[y]?.[x];
    if (!t) continue;
    if (tileSolidValue(t) !== solid[y][x]) flips.push({ y, x });
  }
  if (flips.length === 0) return []; // no topology change → mask unchanged (the per-tick fast path)

  // Tiles whose exterior flag we changed — their mask + their neighbours' masks may shift.
  const exteriorTouched = new Set<number>();
  const markExt = (x: number, y: number, val: boolean) => {
    if (exterior[y][x] !== val) {
      exterior[y][x] = val;
      exteriorTouched.add(y * mw + x);
    }
  };
  const nonSolidNbrs = (x: number, y: number): TileCoord[] => {
    const out: TileCoord[] = [];
    if (x > 0 && !solid[y][x - 1]) out.push({ y, x: x - 1 });
    if (x < mw - 1 && !solid[y][x + 1]) out.push({ y, x: x + 1 });
    if (y > 0 && !solid[y - 1][x]) out.push({ y: y - 1, x });
    if (y < mh - 1 && !solid[y + 1][x]) out.push({ y: y + 1, x });
    return out;
  };

  for (const { y, x } of flips) {
    const nowSolid = tileSolidValue(worldMap[y][x]);
    solid[y][x] = nowSolid;
    if (nowSolid) {
      // ── CLOSING: tile became solid ──────────────────────────────────────────
      markExt(x, y, false); // a solid tile is never "exterior"
      // Each non-solid neighbour that WAS exterior might now be cut off; re-test reachability.
      for (const n of nonSolidNbrs(x, y)) {
        if (!exterior[n.y][n.x]) continue;
        recomputeExteriorComponent(solid, exterior, mw, mh, n.x, n.y, markExt);
      }
    } else {
      // ── OPENING: tile became non-solid (mined) ──────────────────────────────
      // Flood the connected non-solid pocket from here; if it touches the border or an existing
      // exterior tile, the whole pocket becomes exterior (the dig reveals inward, DF-style).
      floodOpenedPocket(solid, exterior, mw, mh, x, y, markExt);
    }
  }

  // 2. Recompute mask for every exterior-touched tile AND its 8-neighbours (a solid tile's mask depends
  //    on whether a neighbour is exterior). Collect the cells whose mask value actually changed.
  const out: TileCoord[] = [];
  const recheck = new Set<number>();
  for (const key of exteriorTouched) {
    const tx = key % mw;
    const ty = (key / mw) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = tx + dx;
        const ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= mw || ny >= mh) continue;
        recheck.add(ny * mw + nx);
      }
    }
  }
  for (const key of recheck) {
    const tx = key % mw;
    const ty = (key / mw) | 0;
    const m = maskAt(solid, exterior, mw, mh, tx, ty);
    if (state.mask[ty][tx] !== m) {
      state.mask[ty][tx] = m;
      out.push({ y: ty, x: tx });
    }
  }
  return out;
}

/** OPENING flood: mark the non-solid component at (sx,sy) exterior iff it reaches the border / existing exterior. */
function floodOpenedPocket(
  solid: boolean[][],
  exterior: boolean[][],
  mw: number,
  mh: number,
  sx: number,
  sy: number,
  markExt: (x: number, y: number, val: boolean) => void
): void {
  if (exterior[sy][sx]) return;
  const stack: number[] = [sy * mw + sx];
  const comp: number[] = [];
  const seen = new Set<number>(stack);
  let reachesExterior = false;
  while (stack.length) {
    const key = stack.pop()!;
    const cx = key % mw;
    const cy = (key / mw) | 0;
    comp.push(key);
    if (cx === 0 || cy === 0 || cx === mw - 1 || cy === mh - 1) reachesExterior = true;
    const nbr = (nx: number, ny: number) => {
      if (nx < 0 || ny < 0 || nx >= mw || ny >= mh) return;
      if (solid[ny][nx]) return;
      if (exterior[ny][nx]) {
        reachesExterior = true; // touches the known exterior → anchor
        return;
      }
      const k = ny * mw + nx;
      if (!seen.has(k)) {
        seen.add(k);
        stack.push(k);
      }
    };
    nbr(cx + 1, cy);
    nbr(cx - 1, cy);
    nbr(cx, cy + 1);
    nbr(cx, cy - 1);
  }
  if (reachesExterior) for (const k of comp) markExt(k % mw, (k / mw) | 0, true);
}

/** Max tiles a CLOSING re-test will flood before concluding "still open" — one added tile cannot seal a
 *  region larger than this, so exceeding the budget safely means the pocket is NOT sealed (keep exterior). */
const SEAL_TEST_BUDGET = 8192;

/** CLOSING re-test: if the non-solid component at (sx,sy) no longer reaches the map BORDER, mark it hidden.
 *  Floods over non-solid tiles WITHOUT using the `exterior` flag as an anchor — the component itself is
 *  still flagged exterior (it was, until this seal), so border-reachability is the only valid test. A real
 *  seal is a small pocket (explored fully → no border → hidden); a non-sealing wall reaches the border fast
 *  or blows the budget (a huge region one tile can't seal → keep exterior). */
function recomputeExteriorComponent(
  solid: boolean[][],
  exterior: boolean[][],
  mw: number,
  mh: number,
  sx: number,
  sy: number,
  markExt: (x: number, y: number, val: boolean) => void
): void {
  const stack: number[] = [sy * mw + sx];
  const comp: number[] = [];
  const seen = new Set<number>(stack);
  let reaches = false;
  let visited = 0;
  while (stack.length) {
    const key = stack.pop()!;
    const cx = key % mw;
    const cy = (key / mw) | 0;
    comp.push(key);
    if (cx === 0 || cy === 0 || cx === mw - 1 || cy === mh - 1) {
      reaches = true; // touches the map border → genuinely exterior
      break;
    }
    if (++visited > SEAL_TEST_BUDGET) {
      reaches = true; // too large to have been sealed by a single tile → leave exterior as-is
      break;
    }
    const nbr = (nx: number, ny: number) => {
      if (nx < 0 || ny < 0 || nx >= mw || ny >= mh) return;
      if (solid[ny][nx]) return;
      const k = ny * mw + nx;
      if (!seen.has(k)) {
        seen.add(k);
        stack.push(k);
      }
    };
    nbr(cx + 1, cy);
    nbr(cx - 1, cy);
    nbr(cx, cy + 1);
    nbr(cx, cy - 1);
  }
  if (!reaches) for (const k of comp) markExt(k % mw, (k / mw) | 0, false); // sealed → hide the pocket
}

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
const DIRT_BG = (SUBTERRAINS['dirt']?.bg ?? [0.08, 0.06, 0.03]) as [number, number, number];
// Per-position salt added to the glyph hash for GLOWING (magical) groves only, so they pick different
// sprites from their char range than the ordinary trees — bump this to reroll the magical-tree sprites.
const GLOWING_GROVE_SPRITE_SALT = 53;

/** Deterministic per-tile [0,1) hash — gives each tile its own snow-patch threshold so snow fills in as
 *  patches rather than a uniform sheet. */
function tileHash(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth low-frequency value noise in [0,1] — bilinear-interpolated hashed lattice (smoothstep blend). */
function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = tileHash(x0, y0, 51);
  const b = tileHash(x0 + 1, y0, 51);
  const c = tileHash(x0, y0 + 1, 51);
  const d = tileHash(x0 + 1, y0 + 1, 51);
  const top = a + (b - a) * sx;
  const bot = c + (d - c) * sx;
  return top + (bot - top) * sy;
}

/** Snow DRIFT field [0,1] — smooth ~7-tile blobs whose high points are the patch "middles" where the
 *  deeper snow sprites accumulate, so snow reads as drifts that fill from the centres outward. */
function snowField(x: number, y: number): number {
  return valueNoise(x / 7, y / 7);
}

/** Global snow coverage [0,1] for a tile (0 = bare). Open water reads as ice, never snow. */
function snowCover(tile: WorldTile): number {
  const snow = tile.snow ?? 0;
  if (snow <= 6 || tile.type === 'water') return 0;
  return Math.min(1, snow / 100);
}

/** Resources that are standing OBSTACLES — they keep their glyph and take only the white-bg overlay
 *  (like trees/walls), instead of being buried under the ground snow. Covers walkable features plus a
 *  few (e.g. stone_outcrop) that should poke out regardless of how their tile's walkability resolves. */
const SNOW_FEATURE_RES = new Set([
  'berry_bush',
  'scrub_patch',
  'fallen_logs',
  'tree_stump',
  'stone_outcrop'
]);

/** A snow OBSTACLE: impassable terrain (trees, mountain/cliff walls, mineral & gem nodes, dead trees) or a
 *  standing walkable feature (berry bush, shrub, fallen log). Keeps its glyph; only its bg whitens. Open
 *  walkable GROUND (grass, dirt, crops, moss…) is not a feature — it takes the progressing snow sprite. */
function isSnowFeature(tile: WorldTile): boolean {
  if (!tile.walkable) return true;
  return tile.resources ? Object.keys(tile.resources).some((k) => SNOW_FEATURE_RES.has(k)) : false;
}

/**
 * Paint ONE tile's terrain/resource/snow visual into the grid. Shared by buildGameGrid (full rebuild)
 * and the incremental terrain update in GameCanvas — so a `worldMapDelta` re-applies only its changed
 * tiles instead of rebuilding all ~562k (the 4× FPS crater). `hiddenMask` is the caller's (it only
 * changes with walkability, never on a regrowth/harvest delta). Buildings are overlaid separately.
 *
 * Snow renders as a progressing white sprite over a white-bg overlay (see {@link snowCover}); ice as a faint blue glaze, strong on
 * open water but cut to a third on damp ground.
 */
/**
 * Pick the autotile variant suffix for a ground tile by which cardinal neighbours share its subType
 * (off-map counts as same, so the map border shows no spurious edges). Maps the 16 connection cases to
 * CDDA's named subtiles. Used for dirt, whose Ultica sprites blend grass→dirt at the connected edge.
 */
function autotileVariant(tile: WorldTile, worldMap: WorldTile[][]): string {
  const st = tile.subType;
  const same = (nx: number, ny: number): boolean => {
    const row = worldMap[ny];
    if (!row) return true;
    const n = row[nx];
    return !n || n.subType === st;
  };
  const N = same(tile.x, tile.y - 1);
  const E = same(tile.x + 1, tile.y);
  const S = same(tile.x, tile.y + 1);
  const W = same(tile.x - 1, tile.y);
  const cnt = (N ? 1 : 0) + (E ? 1 : 0) + (S ? 1 : 0) + (W ? 1 : 0);
  // Ultica's variant names are oriented opposite our connection set (a 180° flip — N↔S, E↔W): an
  // end_piece that CONNECTS north is the `end_piece_s` sprite, etc. Edges are symmetric so unaffected.
  if (cnt === 4) return 'center';
  if (cnt === 0) return 'unconnected';
  if (cnt === 1) return N ? 'end_piece_s' : E ? 'end_piece_w' : S ? 'end_piece_n' : 'end_piece_e';
  if (cnt === 3) {
    // 3 connected → T-junction; named for the open (grass) side = the one missing neighbour.
    if (!N) return 't_connection_n';
    if (!E) return 't_connection_e';
    if (!S) return 't_connection_s';
    return 't_connection_w';
  }
  if (N && S) return 'edge_ns';
  if (E && W) return 'edge_ew';
  if (N && E) return 'corner_sw';
  if (N && W) return 'corner_se';
  if (S && E) return 'corner_nw';
  return 'corner_ne';
}

export function applyTileToGrid(
  grid: GameGrid,
  tile: WorldTile,
  hiddenMask: boolean[][],
  worldMap?: WorldTile[][]
): void {
  // Hidden interior (buried rock or an enclosed pocket) → blank dirt-coloured tile.
  if (hiddenMask[tile.y]?.[tile.x]) {
    grid.setTile(tile.x, tile.y, {
      char: ' ',
      foreground: { r: DIRT_BG[0], g: DIRT_BG[1], b: DIRT_BG[2] },
      background: { r: DIRT_BG[0], g: DIRT_BG[1], b: DIRT_BG[2] },
      position: { x: tile.x, y: tile.y }
    });
    return;
  }
  // Base subterrain GROUND only. Resources (trees/grass/bushes/ore) are NO LONGER baked into this
  // grid — they render in a separate transparent overlay (applyResourceToGrid / buildResourceOverlay)
  // so a full-colour CDDA sprite composites over the actual ground instead of a flat near-black bg.
  const sub = SUBTERRAINS[tile.subType] ?? SUBTERRAIN_FALLBACK;
  // Autotile grounds (dirt) pick a neighbour-aware variant so they feather into the surrounding grass;
  // everything else uses the position-hashed random variant. Falls back to center / chars if a variant
  // sprite is missing or no worldMap (neighbour info) was passed.
  let char: string;
  if (sub.autotile && worldMap) {
    const v = autotileVariant(tile, worldMap);
    char = sub.autotile[v] ?? sub.autotile.center ?? pickChar(sub, tile.x, tile.y);
  } else {
    char = pickChar(sub, tile.x, tile.y);
  }
  let fg: [number, number, number] = sub.fg as [number, number, number];
  let bg: [number, number, number] = sub.bg as [number, number, number];
  // Ice glaze (SEASONS_WEATHER): a pale-blue sheen, only on wet-capable tiles past the visible threshold.
  // FULL strength on open water (a frozen pond reads as blue glass); cut to a THIRD on damp ground, where
  // it's just a faint rime — not the quasi-snow it used to read as. Drawn BENEATH snow.
  const ice = tile.walkable || tile.type === 'water' ? (tile.ice ?? 0) : 0;
  if (ice >= ICE_VISIBLE_RENDER) {
    const iceMax = tile.type === 'water' ? 0.4 : 0.4 / 3; // water full · dirt ⅓ (faint rime)
    const it = Math.min(1, ice / 100) * iceMax;
    bg = [
      bg[0] + (ICE_BLUE[0] - bg[0]) * it,
      bg[1] + (ICE_BLUE[1] - bg[1]) * it,
      bg[2] + (ICE_BLUE[2] - bg[2]) * it
    ];
    fg = [
      fg[0] + (ICE_BLUE[0] - fg[0]) * it * 0.8,
      fg[1] + (ICE_BLUE[1] - fg[1]) * it * 0.8,
      fg[2] + (ICE_BLUE[2] - fg[2]) * it * 0.8
    ];
  }
  // Snow cover (SEASONS_WEATHER) — two layers:
  //  • the MAIN look is a per-tile white BG overlay at VARYING opacity (drift field + jitter): some tiles
  //    barely tinted, others solid white. This is the snow blanket; it covers most tiles.
  //  • a MINORITY of GROUND tiles also get a scattered snow SPRITE accent for texture — never the whole
  //    map. The three sprites mix in EARLY (45 by ~¼ coverage, 46 soon after), picked by a wide-spread
  //    per-tile intensity so they scatter rather than form concentric rings.
  // Snow is an OVERLAY, never a glyph replacement:
  //  • a per-tile white BG overlay at VARYING opacity (drift field + jitter) — some tiles barely tinted,
  //    others solid white. The main blanket; it covers most tiles.
  //  • on GROUND, a matching white FG overlay (weighted to the high end) fades the ground-cover glyph
  //    (grass / clay / savanna / dirt) so it stays visible under a light dusting but is hidden once the
  //    tile reaches solid opaque white.
  //  • a MINORITY of ground tiles also get a scattered snow SPRITE accent (44/45/46, mixed in early).
  // OBSTACLES (trees, walls, mineral/gem nodes, bushes, shrubs, logs, dead trees — buildings in
  // applyBuildingToGrid) keep their glyph fully and take only the bg overlay, so they poke out of the snow.
  const gc = snowCover(tile);
  if (gc > 0) {
    const f = snowField(tile.x, tile.y);
    const wbg = Math.max(
      0,
      Math.min(1, gc * 1.3 + (f - 0.5) * 0.8 + (tileHash(tile.x, tile.y, 41) - 0.5) * 0.2)
    );
    bg = [
      bg[0] + (SNOW_WHITE[0] - bg[0]) * wbg,
      bg[1] + (SNOW_WHITE[1] - bg[1]) * wbg,
      bg[2] + (SNOW_WHITE[2] - bg[2]) * wbg
    ];
    if (!isSnowFeature(tile)) {
      const wfg = wbg * wbg; // hide the ground glyph only as the cell nears solid white (overlay, not erase)
      fg = [
        fg[0] + (SNOW_WHITE[0] - fg[0]) * wfg,
        fg[1] + (SNOW_WHITE[1] - fg[1]) * wfg,
        fg[2] + (SNOW_WHITE[2] - fg[2]) * wfg
      ];
      if (tileHash(tile.x, tile.y, 17) < Math.min(0.5, gc * 0.7)) {
        const intensity = gc + (f - 0.5) * 0.6 + (tileHash(tile.x, tile.y, 29) - 0.5) * 0.5;
        char = SNOW_STAGE_CHARS[intensity > 0.7 ? 2 : intensity > 0.45 ? 1 : 0];
        fg = [SNOW_WHITE[0], SNOW_WHITE[1], SNOW_WHITE[2]];
      }
    }
  }
  grid.setTile(tile.x, tile.y, {
    char,
    foreground: { r: fg[0], g: fg[1], b: fg[2] },
    background: { r: bg[0], g: bg[1], b: bg[2] },
    position: { x: tile.x, y: tile.y }
  });
}

/**
 * Resource (tree / grass / bush / ore) glyph for ONE tile, painted into the TRANSPARENT resource
 * overlay that renders ABOVE the terrain ground (terrain → resources → buildings → items → pawns).
 * A full-colour CDDA sprite therefore composites over the real ground instead of a flat near-black bg.
 * Clears the cell (space glyph) when no visible resource so harvest/regrow deltas blank it. The bg is
 * irrelevant here — the resource pass is glyph-only (alpha-blended).
 */
export function applyResourceToGrid(
  gridShort: GameGrid,
  gridTall: GameGrid,
  tile: WorldTile,
  hiddenMask: boolean[][],
  season?: string
): void {
  const blank = (g: GameGrid) =>
    g.setTile(tile.x, tile.y, {
      char: ' ',
      foreground: { r: 0, g: 0, b: 0 },
      background: { r: 0, g: 0, b: 0 },
      position: { x: tile.x, y: tile.y }
    });
  const clear = () => {
    blank(gridShort);
    blank(gridTall);
  };
  if (hiddenMask[tile.y]?.[tile.x]) return clear();
  const hasResources = tile.resources && Object.keys(tile.resources).length > 0;
  if (!hasResources) return clear();

  // Pick the resource to draw: a ready (amt>0) node, else the most-grown standing one.
  const activeEntry = Object.entries(tile.resources!).find(([, amt]) => amt > 0);
  let resKey: string | undefined = activeEntry?.[0];
  let growthVal = 100;
  if (resKey) {
    growthVal = tile.growth?.[resKey] ?? 100;
  } else {
    let best = 0;
    for (const [id, g] of Object.entries(tile.growth ?? {})) {
      if (g > best) {
        best = g;
        resKey = id;
      }
    }
    growthVal = best;
  }
  const resDef = resKey ? resourceObjectService.getById(resKey) : undefined;
  if (!resDef) return clear();

  const salt = resDef.glow ? GLOWING_GROVE_SPRITE_SALT : 0;
  const hash = (tile.x * 1619 + tile.y * 31337 + salt) >>> 0;

  let brightness = 1;
  let char: string | undefined;
  if (resDef.growthChars && resDef.growthChars.length) {
    // CROP: always rendered (planted soil shows the seed stage); sprite = growth-stage, not season.
    const st = growthVal < 20 ? 0 : growthVal < 55 ? 1 : growthVal < 90 ? 2 : 3;
    char = resDef.growthChars[Math.min(st, resDef.growthChars.length - 1)];
  } else {
    // Standing wild plant. While foraged (on cooldown) swap to the bush's _harvested sprite if it has
    // one; otherwise fall back to dimming the ripe sprite.
    const onCooldown = Object.keys(tile.resourceCooldowns ?? {}).some((k) => k.startsWith(resKey! + ':'));
    if (onCooldown && resDef.harvestedChars?.length) {
      char = resDef.harvestedChars[hash % resDef.harvestedChars.length];
    } else {
      // A depleted (non-ready) plant fades out below the visible-growth threshold.
      if (!activeEntry) {
        if (growthVal < RESOURCE_VISIBLE_GROWTH) return clear();
        brightness = Math.max(0.4, growthVal / 100);
      } else if (onCooldown) {
        brightness = 0.65; // partly foraged, no harvested sprite available
      }
      const pool =
        season && resDef.seasonChars?.[season]?.length ? resDef.seasonChars[season] : resDef.chars;
      if (!pool.length) return clear();
      char = pool[hash % pool.length];
    }
  }
  if (!char) return clear();

  // Tall sprites (trees) go to the tall layer drawn ABOVE entities so they occlude pawns standing
  // behind them; everything else to the short layer drawn beneath entities. Clear the OTHER layer in
  // case this tile just switched (e.g. a sapling grew into a tall tree).
  const tall = MSHOCK_TALL.has(char);
  blank(tall ? gridShort : gridTall);
  (tall ? gridTall : gridShort).setTile(tile.x, tile.y, {
    char,
    foreground: {
      r: resDef.fg[0] * brightness,
      g: resDef.fg[1] * brightness,
      b: resDef.fg[2] * brightness
    },
    background: { r: 0, g: 0, b: 0 },
    position: { x: tile.x, y: tile.y }
  });
}

/** Build the transparent resource overlays (trees/grass/bushes/ore drawn over the terrain ground),
 *  SPLIT into a `short` layer (drawn beneath entities) and a `tall` layer (trees, drawn above entities
 *  so pawns behind them are occluded). Kept SPARSE — only resource tiles get a cell, so the renderer's
 *  viewport cull (getVisibleTiles, O(viewport)) and memory stay cheap. */
export function buildResourceOverlay(
  worldMap: WorldTile[][],
  hiddenMask?: boolean[][],
  season?: string
): { short: GameGrid; tall: GameGrid } {
  const short = new GameGrid();
  const tall = new GameGrid();
  const mask = hiddenMask ?? computeHiddenMask(worldMap);
  for (const row of worldMap)
    for (const tile of row)
      if (tile.resources && Object.keys(tile.resources).length > 0)
        applyResourceToGrid(short, tall, tile, mask, season);
  return { short, tall };
}

export function buildGameGrid(
  worldMap: WorldTile[][],
  buildings?: PlacedBuilding[],
  hiddenMask?: boolean[][]
): GameGrid {
  const grid = new GameGrid();

  // Interior-mountain hiding (flood-fill silhouette) — see computeHiddenMask. A hidden tile renders as
  // a blank dirt-bg square (clean massif silhouette / sealed pocket), the same mask GameCanvas uses to
  // stop glow, hover, and explore-jumps from revealing what's buried. The caller (ADR-026
  // `_fullRebuildTerrain`) passes the mask it already built so we don't BFS the whole map twice.
  const mask = hiddenMask ?? computeHiddenMask(worldMap);
  for (const row of worldMap) {
    for (const tile of row) applyTileToGrid(grid, tile, mask, worldMap);
  }

  // Phase 4d: overlay *completed* buildings only — they're opaque, so they live on the glyph grid.
  // Planned / under-construction blueprints are drawn separately on the 2D overlay (drawDesignations
  // in GameCanvas) where real alpha is available, so they can be semi-transparent ghosts.
  // Only FLOORS and ROOFS bake into the terrain grid. Floors are the ground surface (paint first);
  // roofs paint no glyph, they only SHADE the cell beneath, so they go LAST — on top of the terrain
  // AND any floor sharing the tile. Regular buildings are NOT baked: they render as a glyph-only
  // overlay (overlayBuildings) so the floor/ground sprite shows through their transparent pixels.
  if (buildings) {
    for (const b of buildings)
      if (isFloorBuilding(b)) applyBuildingToGrid(grid, b, worldMap[b.y]?.[b.x]);
    for (const b of buildings)
      if (isRoofBuilding(b)) applyBuildingToGrid(grid, b, worldMap[b.y]?.[b.x]);
  }

  // NOTE: standing-zone tints (stockpile/drink/wash) are NOT baked here anymore. They — like the
  // work-designation icons — are painted on the lightweight 2D overlay in GameCanvas.drawDesignations,
  // so drawing/toggling a zone never triggers a full terrain-grid rebuild (the old cause of the
  // "map lags then the color appears" hitch). buildGameGrid is now purely terrain + buildings.

  return grid;
}

/**
 * Paint ONE completed building's glyph onto the grid (its single cell). Shared by buildGameGrid (full
 * rebuild) and GameCanvas's incremental building diff (ADR-026) — so placing/removing a building repaints
 * only its footprint, never all ~562k tiles. Non-complete buildings (blueprints) are NOT drawn here —
 * they're semi-transparent ghosts on the 2D overlay. The caller repaints the underlying terrain first
 * (a removed building → terrain shows through), then calls this for any building still on the cell.
 */
/** A roof renders as invisible SHADE (no glyph of its own) rather than an opaque cell — its callers
 *  paint it last so it darkens whatever is beneath. */
export function isRoofBuilding(b: PlacedBuilding): boolean {
  return !!buildingService.getBuildingById(b.type)?.effects?.roof;
}

/** A floor is a walkable surface building (planks/flagstone/packed earth) — it carries a `floorSpeed`
 *  and/or `floorDryness` effect and reads AS the tile's ground (the hover panel relabels the surface
 *  to the floor's name rather than popping a separate building card). */
export function isFloorBuilding(b: PlacedBuilding): boolean {
  const eff = buildingService.getBuildingById(b.type)?.effects;
  return !!eff && (eff.floorDryness != null || eff.floorSpeed != null);
}

// How much a roof darkens the tile beneath it (per-channel multiply). A LIGHT shade — just enough to
// read as "under cover" without crushing the cell to black; backgrounds are already near-dark, so the
// multiplier stays gentle (anything aggressive makes the tile look empty/black).
const ROOF_SHADE_FG = 0.82;
const ROOF_SHADE_BG = 0.72;

export function applyBuildingToGrid(grid: GameGrid, b: PlacedBuilding, tile?: WorldTile): void {
  if (b.status !== 'complete') return;
  const def = buildingService.getBuildingById(b.type);

  // Roofs are INVISIBLE: they paint no glyph, so the floor/ground/items beneath stay visible. They only
  // cast SHADE — darken the cell so a roofed interior reads as "under cover". The caller paints roofs
  // last (after terrain + any floor on the tile), so this shades what's actually under the roof. A
  // deconstruct-queued roof falls through to the glyph path below so the demolish marker is visible.
  if (def?.effects?.roof && !b.deconstructQueued) {
    const t = grid.getTile(b.x, b.y);
    if (t) {
      grid.setTile(b.x, b.y, {
        char: t.char,
        foreground: {
          r: t.foreground.r * ROOF_SHADE_FG,
          g: t.foreground.g * ROOF_SHADE_FG,
          b: t.foreground.b * ROOF_SHADE_FG
        },
        background: {
          r: t.background.r * ROOF_SHADE_BG,
          g: t.background.g * ROOF_SHADE_BG,
          b: t.background.b * ROOF_SHADE_BG
        },
        position: { x: b.x, y: b.y }
      });
    }
    return;
  }

  const char = def?.charSpans
    ? (resolveCharSpans(def.charSpans as Parameters<typeof resolveCharSpans>[0])[0] ?? '#')
    : '#';
  // Render from the building's `color` tag (its single tunable hex), falling back to the legacy
  // `fg` array, then a default. So editing `color` in buildings.jsonc actually recolours it.
  const fg = hexToRgb01(def?.color) ?? def?.fg ?? [0.87, 0.62, 0.12];
  // `transparentBg` buildings (sleeping spot, flat markers) keep the terrain cell's background so they
  // blend into the ground they sit on, instead of painting their own bg square.
  const existingBg = def?.transparentBg ? grid.getTile(b.x, b.y)?.background : undefined;
  const bg: [number, number, number] = existingBg
    ? [existingBg.r, existingBg.g, existingBg.b]
    : (def?.bg ?? [0.06, 0.04, 0.01]);
  // Snow: a building is an obstacle, so (like trees/walls) it keeps its glyph and just takes the same
  // transparent→opaque white bg overlay as the terrain — using the same drift field so it whitens in step
  // with the snow around it instead of reading as a bare hole.
  if (!existingBg && tile) {
    const gc = snowCover(tile);
    if (gc > 0) {
      const wb = Math.max(
        0,
        Math.min(
          1,
          gc * 1.3 + (snowField(b.x, b.y) - 0.5) * 0.8 + (tileHash(b.x, b.y, 41) - 0.5) * 0.2
        )
      );
      bg[0] += (SNOW_WHITE[0] - bg[0]) * wb;
      bg[1] += (SNOW_WHITE[1] - bg[1]) * wb;
      bg[2] += (SNOW_WHITE[2] - bg[2]) * wb;
    }
  }
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
