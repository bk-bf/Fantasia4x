import { GameGrid } from './game-grid.js';
import type { WorldTile, PlacedBuilding, Season } from '$lib/game/core/types.js';
import {
  SUBTERRAINS,
  SUBTERRAIN_FALLBACK,
  pickChar,
  resolveCharSpans
} from '$lib/game/core/defs/terrains.js';
import {
  resourceObjectDefById,
  type ResourceObjectDef
} from '$lib/game/core/defs/resourceObjects.js';
import { RESOURCE_VISIBLE_GROWTH } from '$lib/game/core/rules/world/wildGrowth.js';
import { buildingDefById } from '$lib/game/core/defs/buildings.js';
import { parseHexRgb01 } from '$lib/game/core/util/color.js';
import { glyph, SHEET } from './tilesets.js';
import type { RGB } from './tile-types.js';

const DECONSTRUCT_GLYPH = glyph(SHEET.MAP, 88);

const SNOW_WHITE: [number, number, number] = [0.92, 0.94, 0.97];
const ICE_BLUE: [number, number, number] = [0.78, 0.88, 0.98];
const ICE_VISIBLE_RENDER = 8;

const SNOW_STAGE_CHARS: string[] = [44, 45, 46].map(
  (id) => resolveCharSpans([{ sheet: 'tiles', id }] as Parameters<typeof resolveCharSpans>[0])[0]
);
const SNOW_SPRITE_MIN = 0.4;
const SNOW_SPRITE_MID = 0.6;
const SNOW_SPRITE_LG = 0.82;

const SOLID_SUBTYPES = new Set(['cave', 'mineral_deposit']);

function tileSolidValue(t: WorldTile): boolean {
  return (
    SOLID_SUBTYPES.has(t.subType) && !!t.resources && Object.values(t.resources).some((a) => a > 0)
  );
}

export interface HiddenMaskState {
  mask: boolean[][];
  solid: boolean[][];
  exterior: boolean[][];
  mw: number;
  mh: number;
}

export interface TileCoord {
  y: number;
  x: number;
}

export function computeHiddenMaskState(worldMap: WorldTile[][]): HiddenMaskState {
  const mh = worldMap.length;
  const mw = worldMap[0]?.length ?? 0;
  const solid: boolean[][] = worldMap.map((row) => row.map(tileSolidValue));

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

export function computeHiddenMask(worldMap: WorldTile[][]): boolean[][] {
  return computeHiddenMaskState(worldMap).mask;
}

function extInBounds(exterior: boolean[][], mw: number, mh: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < mw && y < mh && exterior[y][x];
}

function maskAt(
  solid: boolean[][],
  exterior: boolean[][],
  mw: number,
  mh: number,
  x: number,
  y: number
): boolean {
  if (!solid[y][x]) return !exterior[y][x];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (extInBounds(exterior, mw, mh, x + dx, y + dy)) return false;
    }
  }
  return true;
}

export function updateHiddenMaskAt(
  state: HiddenMaskState,
  worldMap: WorldTile[][],
  changed: ReadonlyArray<TileCoord>
): TileCoord[] {
  const { solid, exterior, mw, mh } = state;
  const flips: TileCoord[] = [];
  for (const { y, x } of changed) {
    const t = worldMap[y]?.[x];
    if (!t) continue;
    if (tileSolidValue(t) !== solid[y][x]) flips.push({ y, x });
  }
  if (flips.length === 0) return [];

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
      markExt(x, y, false);
      for (const n of nonSolidNbrs(x, y)) {
        if (!exterior[n.y][n.x]) continue;
        recomputeExteriorComponent(solid, exterior, mw, mh, n.x, n.y, markExt);
      }
    } else {
      floodOpenedPocket(solid, exterior, mw, mh, x, y, markExt);
    }
  }

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
        reachesExterior = true;
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

const SEAL_TEST_BUDGET = 8192;

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
      reaches = true;
      break;
    }
    if (++visited > SEAL_TEST_BUDGET) {
      reaches = true;
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
  if (!reaches) for (const k of comp) markExt(k % mw, (k / mw) | 0, false);
}

const DIRT_BG = (SUBTERRAINS['dirt']?.bg ?? [0.08, 0.06, 0.03]) as [number, number, number];
const GLOWING_GROVE_SPRITE_SALT = 53;

function tileHash(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

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

function snowField(x: number, y: number): number {
  return valueNoise(x / 7, y / 7);
}

function snowCover(tile: WorldTile): number {
  const snow = tile.snow ?? 0;
  if (snow <= 6 || tile.type === 'water') return 0;
  return Math.min(1, snow / 100);
}

const SNOW_FEATURE_RES = new Set([
  'berry_bush',
  'scrub_patch',
  'fallen_logs',
  'tree_stump',
  'stone_outcrop'
]);

function isSnowFeature(tile: WorldTile): boolean {
  if (!tile.walkable) return true;
  return tile.resources ? Object.keys(tile.resources).some((k) => SNOW_FEATURE_RES.has(k)) : false;
}

function resolveActiveResource(
  tile: WorldTile
): { resDef: ResourceObjectDef; brightness: number } | undefined {
  if (!tile.resources || Object.keys(tile.resources).length === 0) return undefined;
  const activeEntry = Object.entries(tile.resources).find(([, amt]) => amt > 0);
  let resKey: string | undefined = activeEntry?.[0];
  let brightness = 1;
  if (resKey) {
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
    if (resKey && bestGrowth < RESOURCE_VISIBLE_GROWTH) resKey = undefined;
    else if (resKey) brightness = Math.max(0.4, bestGrowth / 100);
  }
  const resDef = resKey ? resourceObjectDefById(resKey) : undefined;
  if (!resDef || resDef.chars.length === 0) return undefined;
  return { resDef, brightness };
}

export function applyTileToGrid(grid: GameGrid, tile: WorldTile, hiddenMask: boolean[][]): void {
  if (hiddenMask[tile.y]?.[tile.x]) {
    grid.setTile(tile.x, tile.y, {
      char: ' ',
      foreground: { r: DIRT_BG[0], g: DIRT_BG[1], b: DIRT_BG[2] },
      background: { r: DIRT_BG[0], g: DIRT_BG[1], b: DIRT_BG[2] },
      position: { x: tile.x, y: tile.y }
    });
    return;
  }
  const sub = SUBTERRAINS[tile.subType] ?? SUBTERRAIN_FALLBACK;
  let char = pickChar(sub, tile.x, tile.y);
  let fg: [number, number, number] = sub.fg as [number, number, number];
  let bg: [number, number, number] = sub.bg as [number, number, number];
  const activeRes = resolveActiveResource(tile);
  if (activeRes && !activeRes.resDef.showGroundBelow) char = ' ';
  grid.setTile(tile.x, tile.y, {
    char,
    foreground: { r: fg[0], g: fg[1], b: fg[2] },
    background: { r: bg[0], g: bg[1], b: bg[2] },
    position: { x: tile.x, y: tile.y }
  });
}

export function applySnowToGrid(grid: GameGrid, tile: WorldTile, hiddenMask: boolean[][]): void {
  if (hiddenMask[tile.y]?.[tile.x]) {
    grid.removeTile(tile.x, tile.y);
    return;
  }
  const ice = tile.walkable || tile.type === 'water' ? (tile.ice ?? 0) : 0;
  const iceMax = tile.type === 'water' ? 0.4 : 0.4 / 3;
  const ai = ice >= ICE_VISIBLE_RENDER ? Math.min(1, ice / 100) * iceMax : 0;
  const gc = snowCover(tile);
  const f = snowField(tile.x, tile.y);
  const as =
    gc > 0 && !tileSolidValue(tile)
      ? Math.max(
          0,
          Math.min(1, gc * 1.3 + (f - 0.5) * 0.8 + (tileHash(tile.x, tile.y, 41) - 0.5) * 0.2)
        )
      : 0;
  const alphaFull = ai + as - ai * as;
  if (alphaFull < 0.01) {
    grid.removeTile(tile.x, tile.y);
    return;
  }
  const iw = (ai * (1 - as)) / alphaFull;
  const sw = as / alphaFull;
  const bg: [number, number, number] = [
    ICE_BLUE[0] * iw + SNOW_WHITE[0] * sw,
    ICE_BLUE[1] * iw + SNOW_WHITE[1] * sw,
    ICE_BLUE[2] * iw + SNOW_WHITE[2] * sw
  ];
  const alpha = Math.min(0.95, alphaFull);
  let char = ' ';
  if (gc > 0 && !isSnowFeature(tile)) {
    const depth = gc * 1.3 + (f - 0.5) * 0.8 + (tileHash(tile.x, tile.y, 29) - 0.5) * 0.2;
    if (depth > SNOW_SPRITE_MIN && tileHash(tile.x, tile.y, 17) < 0.9)
      char = SNOW_STAGE_CHARS[depth > SNOW_SPRITE_LG ? 2 : depth > SNOW_SPRITE_MID ? 1 : 0];
  }
  grid.setTile(tile.x, tile.y, {
    char,
    foreground: { r: SNOW_WHITE[0], g: SNOW_WHITE[1], b: SNOW_WHITE[2] },
    background: { r: bg[0], g: bg[1], b: bg[2] },
    backgroundAlpha: alpha,
    position: { x: tile.x, y: tile.y }
  });
}

export function buildSnowOverlay(worldMap: WorldTile[][], hiddenMask?: boolean[][]): GameGrid {
  const grid = new GameGrid();
  const mask = hiddenMask ?? computeHiddenMask(worldMap);
  for (const row of worldMap) {
    for (const tile of row) {
      if ((tile.snow ?? 0) > 0 || (tile.ice ?? 0) > 0) applySnowToGrid(grid, tile, mask);
    }
  }
  return grid;
}

export function applyResourceToGrid(
  gridShort: GameGrid,
  gridTall: GameGrid,
  tile: WorldTile,
  hiddenMask: boolean[][],
  season?: Season
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
  const active = resolveActiveResource(tile);
  if (!active) return clear();
  const { resDef, brightness } = active;
  const salt = resDef.glow ? GLOWING_GROVE_SPRITE_SALT : 0;
  const variant = season ? resDef.seasonVariants?.[season] : undefined;
  const pool = variant?.chars?.length ? variant.chars : resDef.chars;
  const baseFg = variant?.fg ?? resDef.fg;
  const baseDetail = variant?.detail ?? resDef.detail;
  const h = ((tile.x * 1619 + tile.y * 31337 + salt) >>> 0) % pool.length;
  const rs = resDef.renderScale;
  const scale = rs && rs !== 1 ? rs : undefined;
  const tall = rs !== undefined && rs > 1;
  blank(tall ? gridShort : gridTall);
  const detail = baseDetail
    ? {
        r: baseDetail[0] * brightness,
        g: baseDetail[1] * brightness,
        b: baseDetail[2] * brightness
      }
    : undefined;
  (tall ? gridTall : gridShort).setTile(tile.x, tile.y, {
    char: pool[h],
    foreground: {
      r: baseFg[0] * brightness,
      g: baseFg[1] * brightness,
      b: baseFg[2] * brightness
    },
    background: { r: 0, g: 0, b: 0 },
    position: { x: tile.x, y: tile.y },
    detail,
    scale
  });
}

export function resourceSeasonChanges(tile: WorldTile, a: Season, b: Season): boolean {
  const active = resolveActiveResource(tile);
  if (!active) return false;
  const { resDef } = active;
  if (!resDef.seasonVariants) return false;
  const va = resDef.seasonVariants[a];
  const vb = resDef.seasonVariants[b];
  if (va === vb) return false;
  return (
    (va?.chars ?? resDef.chars) !== (vb?.chars ?? resDef.chars) ||
    (va?.fg ?? resDef.fg) !== (vb?.fg ?? resDef.fg) ||
    (va?.detail ?? resDef.detail) !== (vb?.detail ?? resDef.detail)
  );
}

export function buildResourceOverlay(
  worldMap: WorldTile[][],
  hiddenMask?: boolean[][],
  season?: Season
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

  const mask = hiddenMask ?? computeHiddenMask(worldMap);
  for (const row of worldMap) {
    for (const tile of row) applyTileToGrid(grid, tile, mask);
  }

  if (buildings) {
    for (const b of buildings)
      if (isFloorBuilding(b)) applyBuildingToGrid(grid, b, worldMap[b.y]?.[b.x]);
    for (const b of buildings)
      if (isRoofBuilding(b)) applyBuildingToGrid(grid, b, worldMap[b.y]?.[b.x]);
  }

  return grid;
}

export function isRoofBuilding(b: PlacedBuilding): boolean {
  return !!buildingDefById(b.type)?.effects?.roof;
}

export function isFloorBuilding(b: PlacedBuilding): boolean {
  const eff = buildingDefById(b.type)?.effects;
  return !!eff && (eff.floorDryness != null || eff.floorSpeed != null);
}

const ROOF_SHADE_FG = 0.82;
const ROOF_SHADE_BG = 0.72;

export function applyBuildingToGrid(grid: GameGrid, b: PlacedBuilding, _tile?: WorldTile): void {
  if (b.status !== 'complete') return;
  const def = buildingDefById(b.type);

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
  const fg = parseHexRgb01(def?.color) ?? [0.87, 0.62, 0.12];
  const existingBg = def?.transparentBg ? grid.getTile(b.x, b.y)?.background : undefined;
  const bg: [number, number, number] = existingBg
    ? [existingBg.r, existingBg.g, existingBg.b]
    : [0.06, 0.04, 0.01];
  grid.setTile(b.x, b.y, {
    char,
    foreground: { r: fg[0], g: fg[1], b: fg[2] },
    background: { r: bg[0], g: bg[1], b: bg[2] },
    position: { x: b.x, y: b.y }
  });
  if (b.deconstructQueued) {
    grid.setTile(b.x, b.y, {
      char: DECONSTRUCT_GLYPH,
      foreground: { r: 1.0, g: 0.25, b: 0.05 },
      background: { r: bg[0], g: bg[1], b: bg[2] },
      position: { x: b.x, y: b.y }
    });
  }
}

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

function pseudoNoise(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
