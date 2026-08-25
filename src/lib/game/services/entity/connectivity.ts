import type { WorldTile } from '../../core/types';

let _comp: Int32Array | null = null;
let _w = 0;
let _h = 0;
let _ref: WorldTile[][] | null = null;
let _builtTurn = -1e9;

const REBUILD_TICKS = 300;

export function rebuildConnectivity(worldMap: WorldTile[][]): void {
  const h = worldMap.length;
  const w = h ? (worldMap[0]?.length ?? 0) : 0;
  const n = w * h;
  const comp = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  let id = 0;
  for (let s = 0; s < n; s++) {
    if (comp[s] !== -1 || !worldMap[(s / w) | 0][s % w].walkable) continue;
    comp[s] = id;
    let sp = 0;
    stack[sp++] = s;
    while (sp > 0) {
      const c = stack[--sp];
      const cx = c % w;
      const cy = (c / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = cy + dy;
        if (ny < 0 || ny >= h) continue;
        const row = worldMap[ny];
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          if (nx < 0 || nx >= w) continue;
          const ni = ny * w + nx;
          if (comp[ni] !== -1 || !row[nx].walkable) continue;
          if (dx !== 0 && dy !== 0 && !worldMap[cy][nx].walkable && !worldMap[ny][cx].walkable)
            continue;
          comp[ni] = id;
          stack[sp++] = ni;
        }
      }
    }
    id++;
  }
  _comp = comp;
  _w = w;
  _h = h;
}

export function maybeRebuildConnectivity(worldMap: WorldTile[][], turn: number): void {
  if (worldMap !== _ref || turn - _builtTurn >= REBUILD_TICKS) {
    rebuildConnectivity(worldMap);
    _ref = worldMap;
    _builtTurn = turn;
  }
}

export function componentAt(x: number, y: number): number {
  if (!_comp || x < 0 || y < 0 || x >= _w || y >= _h) return -1;
  return _comp[y * _w + x];
}

export function reachable(x1: number, y1: number, x2: number, y2: number): boolean {
  if (!_comp) return true;
  const a = componentAt(x1, y1);
  return a >= 0 && a === componentAt(x2, y2);
}

export function clearConnectivity(): void {
  _comp = null;
  _ref = null;
  _builtTurn = -1e9;
}
