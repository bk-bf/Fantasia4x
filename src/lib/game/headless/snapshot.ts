import type { GameState, WorldTile } from '../core/types';

type SavedTile = Omit<WorldTile, 'gCost' | 'hCost' | 'fCost' | 'parent' | 'ascii'>;

export interface HeadlessSnapshot {
  v: 1;
  dynamic: Omit<GameState, 'worldMap'>;
  world: SavedTile[][];
}

function stripTile({
  gCost: _g,
  hCost: _h,
  fCost: _f,
  parent: _p,
  ascii: _a,
  ...tile
}: WorldTile): SavedTile {
  return tile;
}

function hydrateTile(tile: SavedTile): WorldTile {
  return { ...tile, ascii: ' ', gCost: 0, hCost: 0, fCost: 0, parent: null };
}

export function toSnapshot(state: GameState): HeadlessSnapshot {
  const { worldMap, ...dynamic } = state;
  return { v: 1, dynamic, world: worldMap.map((row) => row.map(stripTile)) };
}

export function fromSnapshot(snap: HeadlessSnapshot): GameState {
  if (snap?.v !== 1 || !snap.dynamic || !Array.isArray(snap.world)) {
    throw new Error('Invalid headless snapshot (expected { v: 1, dynamic, world })');
  }
  return {
    ...(snap.dynamic as GameState),
    worldMap: snap.world.map((row) => row.map(hydrateTile))
  };
}
