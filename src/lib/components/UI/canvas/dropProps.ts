import type {
  DesignationType,
  DroppedItem,
  PlacedBuilding,
  WorldTile
} from '$lib/game/core/types.js';
import { buildingDefById } from '$lib/game/core/defs/buildings.js';
import { itemDefById } from '$lib/game/core/defs/items.js';
import { itemStorage } from '$lib/game/services/storageRules.js';
import { BASE_TILE_PX, type TileData } from '$lib/webgl/tile-types.js';
import type {
  PaintedDrop,
  PaintedProp,
  PaintedSprite,
  PaintedTileset
} from '$lib/webgl/painted/manifest.js';
import {
  copyOffset,
  isLowStation,
  planDrops,
  type DropPlacement,
  type DropStation,
  type DropSurroundings,
  type PlannedDrop
} from '$lib/webgl/painted/dropPlacement.js';

export interface DropWorld {
  map: readonly (readonly WorldTile[])[];
  buildings: readonly PlacedBuilding[];
  zoneTiles: Readonly<Record<string, readonly DesignationType[]>>;
  rev?: unknown;
}

const PLACEMENT_SEED = 7;
const ROCK_PIECES = 'rock';
const FIELD_GROUND = /^(tilled|soil_)/;
const NONE = { r: 0, g: 0, b: 0 };
const key = (x: number, y: number): string => `${x},${y}`;

function grassColour(tileset: PaintedTileset, tile: WorldTile | undefined): number | undefined {
  if (!tile || tile.floor || !tile.walkable || tile.type === 'water') return undefined;
  const grass = tileset.ground?.grass;
  const grows = Object.entries(tile.resources ?? {}).some(
    ([id, amount]) => amount > 0 && grass?.has(id)
  );
  return grows ? tileset.drops?.grass.get(tile.subType) : undefined;
}

export function dropSurroundings(
  world: DropWorld,
  tileset: PaintedTileset
): DropSurroundings & { grassColour(x: number, y: number): number | undefined } {
  const rock = tileset.pieces.get(ROCK_PIECES)?.members;
  const built = new Set<string>();
  const stations: DropStation[] = [];
  for (const b of world.buildings) {
    if (b.status !== 'complete') continue;
    const def = buildingDefById(b.type);
    if (!def) continue;
    if (def.category === 'structure' && def.walkable === false) built.add(key(b.x, b.y));
    else if (def.workstation || def.category === 'furniture')
      stations.push({ kind: b.type, x: b.x, y: b.y, low: isLowStation(b.type) });
  }
  const tileAt = (x: number, y: number): WorldTile | undefined => world.map[y]?.[x];
  const colour = (x: number, y: number) =>
    built.has(key(x, y)) ? undefined : grassColour(tileset, tileAt(x, y));
  return {
    stations,
    wall: (x, y) =>
      built.has(key(x, y)) ||
      Object.entries(tileAt(x, y)?.resources ?? {}).some(
        ([id, amount]) => amount > 0 && rock?.has(id)
      ),
    zone: (x, y) => world.zoneTiles[key(x, y)]?.includes('stockpile') ?? false,
    field: (x, y) => FIELD_GROUND.test(tileAt(x, y)?.subType ?? ''),
    grass: (x, y) => colour(x, y) !== undefined,
    grassColour: colour
  };
}

function propOf(drop: PaintedDrop, p: DropPlacement): PaintedProp | undefined {
  if (p.pose === 'pile') return drop.pile?.[Math.min(p.stage, drop.pile.length - 1)];
  if (p.pose === 'lean') return drop.lean?.[p.flip ? 1 : 0] ?? drop.lean?.[0];
  if (p.pose === 'lie') return drop.lie?.[p.flip ? 1 : 0] ?? drop.lie?.[0];
  return drop.ground;
}

const moved = (s: PaintedSprite, dx: number, dy: number, art: number): PaintedSprite =>
  dx || dy ? { ...s, ox: s.ox + dx / art, oy: s.oy + dy / art } : s;

export function propTile(
  p: DropPlacement,
  drop: PaintedDrop,
  art: number,
  grass: number | undefined
): TileData | undefined {
  const prop = propOf(drop, p);
  if (!prop) return undefined;
  const cover = p.cover && grass !== undefined ? prop.cover?.[grass] : undefined;
  const base = {
    char: ' ',
    foreground: NONE,
    background: NONE,
    backgroundAlpha: 0,
    position: { x: p.x, y: p.y },
    animationOffset: { x: (p.dx * BASE_TILE_PX) / art, y: (p.dy * BASE_TILE_PX) / art }
  };
  const overlays: TileData[] = [];
  for (let copy = 0; copy < p.copies; copy++) {
    const { dx, dy } = copyOffset(copy);
    if (copy > 0) overlays.push({ ...base, painted: moved(prop.sprite, dx, dy, art) });
    if (cover) overlays.push({ ...base, painted: moved(cover, dx, dy, art) });
  }
  return { ...base, painted: prop.sprite, ...(overlays.length ? { overlays } : null) };
}

function planned(d: DroppedItem, drop: PaintedDrop, art: number): PlannedDrop | undefined {
  const def = itemDefById(d.resourceId);
  if (!def) return undefined;
  const lean = drop.lean?.[0]?.sprite;
  const lie = drop.lie?.[0]?.sprite;
  return {
    id: d.id,
    item: d.resourceId,
    x: d.x,
    y: d.y,
    quantity: d.quantity ?? 1,
    storage: itemStorage(def),
    ...(lean && lie ? { reach: { leanHeight: lean.h * art, lieWidth: lie.w * art } } : null)
  };
}

export interface DropProps {
  tiles: TileData[];
  placements: DropPlacement[];
  flat: DroppedItem[];
}

export function dropProps(
  drops: readonly DroppedItem[],
  world: DropWorld,
  tileset: PaintedTileset,
  isHidden?: (x: number, y: number) => boolean
): DropProps {
  const shown = new Map<string, DroppedItem>();
  for (const d of drops) if (!isHidden?.(d.x, d.y)) shown.set(key(d.x, d.y), d);
  const art = tileset.tile;
  const plans: PlannedDrop[] = [];
  const flat: DroppedItem[] = [];
  for (const d of shown.values()) {
    const drop = tileset.drops?.items.get(d.resourceId);
    const plan = drop && planned(d, drop, art);
    if (plan) plans.push(plan);
    else flat.push(d);
  }
  const env = dropSurroundings(world, tileset);
  const placements = planDrops(env, plans, PLACEMENT_SEED);
  const tiles: TileData[] = [];
  for (const p of placements) {
    const drop = tileset.drops!.items.get(shown.get(key(p.x, p.y))!.resourceId)!;
    const tile = propTile(p, drop, art, env.grassColour(p.x, p.y));
    if (tile) tiles.push(tile);
  }
  return { tiles, placements, flat };
}
