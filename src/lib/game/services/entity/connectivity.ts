export type WalkableGrid = { walkable: Uint8Array; width: number; height: number };

let _grid: Uint8Array | null = null;
let _label: Int32Array | null = null;
let _parent: number[] = [];
let _stack = new Int32Array(0);
let _w = 0;
let _h = 0;
let _builtTurn = -1e9;
let _maySplit = false;

const REBUILD_TICKS = 300;

const RING = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0]
] as const;

function open(walk: Uint8Array, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < _w && y < _h && walk[y * _w + x] !== 0;
}

function stepAllowed(walk: Uint8Array, ax: number, ay: number, bx: number, by: number): boolean {
  return ax === bx || ay === by || open(walk, bx, ay) || open(walk, ax, by);
}

function root(label: number): number {
  let l = label;
  while (_parent[l] !== l) {
    _parent[l] = _parent[_parent[l]];
    l = _parent[l];
  }
  return l;
}

export function rebuildConnectivity(grid: WalkableGrid): void {
  const { walkable, width: w, height: h } = grid;
  const n = w * h;
  const label = new Int32Array(n).fill(-1);
  if (_stack.length < n) _stack = new Int32Array(n);
  const stack = _stack;
  let id = 0;
  for (let s = 0; s < n; s++) {
    if (label[s] !== -1 || !walkable[s]) continue;
    label[s] = id;
    let sp = 0;
    stack[sp++] = s;
    while (sp > 0) {
      const c = stack[--sp];
      const cx = c % w;
      const cy = (c / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = cy + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          if (nx < 0 || nx >= w) continue;
          const ni = ny * w + nx;
          if (label[ni] !== -1 || !walkable[ni]) continue;
          if (dx !== 0 && dy !== 0 && !walkable[cy * w + nx] && !walkable[ny * w + cx]) continue;
          label[ni] = id;
          stack[sp++] = ni;
        }
      }
    }
    id++;
  }
  _grid = walkable;
  _label = label;
  _parent = Array.from({ length: id }, (_, i) => i);
  _w = w;
  _h = h;
  _maySplit = false;
}

export function maybeRebuildConnectivity(grid: WalkableGrid, turn: number): void {
  if (grid.walkable !== _grid || (_maySplit && turn - _builtTurn >= REBUILD_TICKS)) {
    rebuildConnectivity(grid);
    _builtTurn = turn;
  }
}

export function refreshConnectivity(grid: WalkableGrid): void {
  if (grid.walkable !== _grid || _maySplit) rebuildConnectivity(grid);
}

function joinOpened(walk: Uint8Array, label: Int32Array, x: number, y: number): void {
  let joined = -1;
  for (const [dx, dy] of RING) {
    const nx = x + dx;
    const ny = y + dy;
    if (!open(walk, nx, ny) || !stepAllowed(walk, x, y, nx, ny)) continue;
    const l = label[ny * _w + nx];
    if (l < 0) continue;
    const r = root(l);
    if (joined < 0) joined = r;
    else if (r !== joined) _parent[r] = joined;
  }
  if (joined < 0) {
    joined = _parent.length;
    _parent.push(joined);
  }
  label[y * _w + x] = joined;
}

function closingMaySplit(walk: Uint8Array, x: number, y: number): boolean {
  let linked = 0;
  let walkableRing = 0;
  for (let i = 0; i < RING.length; i++) {
    const nx = x + RING[i][0];
    const ny = y + RING[i][1];
    if (!open(walk, nx, ny)) continue;
    walkableRing |= 1 << i;
    if (stepAllowed(walk, x, y, nx, ny)) linked |= 1 << i;
  }
  if (linked === 0) return false;
  const first = 31 - Math.clz32(linked & -linked);
  let seen = 1 << first;
  const queue = [first];
  while (queue.length > 0) {
    const a = queue.pop()!;
    const ax = x + RING[a][0];
    const ay = y + RING[a][1];
    for (let b = 0; b < RING.length; b++) {
      if (seen & (1 << b) || !(walkableRing & (1 << b))) continue;
      const bx = x + RING[b][0];
      const by = y + RING[b][1];
      if (Math.abs(ax - bx) > 1 || Math.abs(ay - by) > 1) continue;
      if (!stepAllowed(walk, ax, ay, bx, by)) continue;
      seen |= 1 << b;
      queue.push(b);
    }
  }
  return (linked & seen) !== linked;
}

export function patchConnectivity(
  grid: WalkableGrid,
  x: number,
  y: number,
  walkable: boolean
): void {
  const label = _label;
  if (grid.walkable !== _grid || !label || x < 0 || y < 0 || x >= _w || y >= _h) return;
  if (walkable) {
    joinOpened(grid.walkable, label, x, y);
    return;
  }
  label[y * _w + x] = -1;
  if (!_maySplit && closingMaySplit(grid.walkable, x, y)) _maySplit = true;
}

export function componentAt(x: number, y: number): number {
  if (!_label || x < 0 || y < 0 || x >= _w || y >= _h) return -1;
  const l = _label[y * _w + x];
  return l < 0 ? -1 : root(l);
}

export function reachable(x1: number, y1: number, x2: number, y2: number): boolean {
  if (!_label) return true;
  const a = componentAt(x1, y1);
  return a >= 0 && a === componentAt(x2, y2);
}

export function separated(
  grid: WalkableGrid,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): boolean {
  if (grid.walkable !== _grid) rebuildConnectivity(grid);
  const a = componentAt(x1, y1);
  const b = componentAt(x2, y2);
  return a >= 0 && b >= 0 && a !== b;
}

export function clearConnectivity(): void {
  _grid = null;
  _label = null;
  _parent = [];
  _builtTurn = -1e9;
  _maySplit = false;
}
