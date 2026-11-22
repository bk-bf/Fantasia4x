import { describe, it, expect, beforeEach } from 'vitest';
import {
  rebuildConnectivity,
  maybeRebuildConnectivity,
  refreshConnectivity,
  patchConnectivity,
  reachable,
  separated,
  componentAt,
  clearConnectivity,
  type WalkableGrid
} from '$lib/game/services/entity/connectivity';

function grid(rows: string[]): WalkableGrid {
  const width = rows[0].length;
  const walkable = new Uint8Array(width * rows.length);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => (walkable[y * width + x] = ch === '#' ? 0 : 1))
  );
  return { walkable, width, height: rows.length };
}

function regionsBySearch(g: WalkableGrid): Int32Array {
  const open = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < g.width && y < g.height && g.walkable[y * g.width + x] === 1;
  const region = new Int32Array(g.width * g.height).fill(-1);
  let id = 0;
  for (let s = 0; s < region.length; s++) {
    if (region[s] >= 0 || !g.walkable[s]) continue;
    region[s] = id;
    const queue = [s];
    while (queue.length) {
      const c = queue.shift()!;
      const cx = c % g.width;
      const cy = (c / g.width) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (!open(nx, ny) || region[ny * g.width + nx] >= 0) continue;
          if (dx && dy && !open(nx, cy) && !open(cx, ny)) continue;
          region[ny * g.width + nx] = id;
          queue.push(ny * g.width + nx);
        }
    }
    id++;
  }
  return region;
}

function setTile(g: WalkableGrid, x: number, y: number, walkable: boolean): void {
  if (g.walkable[y * g.width + x] === (walkable ? 1 : 0)) return;
  g.walkable[y * g.width + x] = walkable ? 1 : 0;
  patchConnectivity(g, x, y, walkable);
}

describe('connectivity flood-fill', () => {
  beforeEach(() => clearConnectivity());

  it('reports same component for connected floor and different across a wall', () => {
    rebuildConnectivity(grid(['....#....', '....#....', '....#....']));
    expect(reachable(0, 0, 3, 2)).toBe(true);
    expect(reachable(5, 0, 8, 2)).toBe(true);
    expect(reachable(0, 0, 8, 0)).toBe(false);
    expect(componentAt(4, 0)).toBe(-1);
  });

  it('honours the diagonal corner-cut rule (matches A*)', () => {
    rebuildConnectivity(grid(['.#', '#.']));
    expect(reachable(0, 0, 1, 1)).toBe(false);
    rebuildConnectivity(grid(['..', '#.']));
    expect(reachable(0, 0, 1, 1)).toBe(true);
  });

  it('degrades to "reachable" before the first build (so callers do not refuse every target)', () => {
    clearConnectivity();
    expect(reachable(0, 0, 99, 99)).toBe(true);
  });
});

describe('connectivity patches', () => {
  beforeEach(() => clearConnectivity());

  it('joins two regions the moment a wall tile opens', () => {
    const g = grid(['....#....', '....#....', '....#....']);
    rebuildConnectivity(g);
    setTile(g, 4, 1, true);
    expect(reachable(0, 0, 8, 2)).toBe(true);
    expect(separated(g, 0, 0, 8, 2)).toBe(false);
  });

  it('joins diagonal neighbours whose corner the opened tile unblocks', () => {
    const g = grid(['.#', '#.']);
    rebuildConnectivity(g);
    setTile(g, 1, 0, true);
    expect(reachable(0, 0, 1, 1)).toBe(true);
  });

  it('gives an opened tile with no open neighbour a region of its own', () => {
    const g = grid(['.#.', '###', '...']);
    rebuildConnectivity(g);
    setTile(g, 1, 0, true);
    expect(reachable(0, 0, 2, 0)).toBe(true);
    expect(reachable(0, 0, 0, 2)).toBe(false);
  });

  it('keeps answers exact when a closed tile leaves its neighbours joined around it', () => {
    const g = grid(['...', '...', '...']);
    rebuildConnectivity(g);
    setTile(g, 1, 1, false);
    expect(componentAt(1, 1)).toBe(-1);
    const before = componentAt(0, 0);
    refreshConnectivity(g);
    expect(componentAt(0, 0)).toBe(before);
    expect(reachable(0, 1, 2, 1)).toBe(true);
  });

  it('splits a corridor cut in two on the next refresh', () => {
    const g = grid(['#####', '.....', '#####']);
    rebuildConnectivity(g);
    setTile(g, 2, 1, false);
    expect(reachable(0, 1, 4, 1)).toBe(true);
    refreshConnectivity(g);
    expect(reachable(0, 1, 4, 1)).toBe(false);
  });

  it('refines a split on the periodic rebuild, and not before it is due', () => {
    const g = grid(['#####', '.....', '#####']);
    maybeRebuildConnectivity(g, 0);
    setTile(g, 2, 1, false);
    maybeRebuildConnectivity(g, 299);
    expect(reachable(0, 1, 4, 1)).toBe(true);
    maybeRebuildConnectivity(g, 300);
    expect(reachable(0, 1, 4, 1)).toBe(false);
  });

  it('never rebuilds on schedule when no closure could have split a region', () => {
    const g = grid(['...', '...', '...']);
    maybeRebuildConnectivity(g, 0);
    setTile(g, 1, 1, false);
    setTile(g, 1, 1, true);
    const root = componentAt(1, 1);
    maybeRebuildConnectivity(g, 900);
    expect(componentAt(1, 1)).toBe(root);
  });

  it('ignores patches to a grid it was not built from', () => {
    const g = grid(['.#.']);
    rebuildConnectivity(g);
    patchConnectivity(grid(['...']), 1, 0, true);
    expect(reachable(0, 0, 2, 0)).toBe(false);
  });
});

describe('separated', () => {
  beforeEach(() => clearConnectivity());

  it('builds the map it is asked about and says only what a search cannot change', () => {
    const g = grid(['..#..', '..#..']);
    expect(separated(g, 0, 0, 4, 1)).toBe(true);
    expect(separated(g, 0, 0, 1, 1)).toBe(false);
    expect(separated(g, 2, 0, 4, 1)).toBe(false);
  });

  it('never calls two tiles separated that a search could join, across any run of patches', () => {
    const g = grid(['.........', '.........', '.........', '.........', '.........']);
    rebuildConnectivity(g);
    let seed = 7;
    const next = (m: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 16) % m;
    const n = g.width * g.height;
    const at = (t: number) => [t % g.width, (t / g.width) | 0] as const;
    const wrongSplits: string[] = [];
    const wrongAfterRefresh: string[] = [];
    for (let i = 0; i < 200; i++) {
      setTile(g, next(g.width), next(g.height), next(2) === 0);
      const truth = regionsBySearch(g);
      const refreshed = i % 10 === 0;
      if (refreshed) refreshConnectivity(g);
      for (let a = 0; a < n; a++)
        for (let b = a + 1; b < n; b++) {
          const joined = truth[a] >= 0 && truth[a] === truth[b];
          if (joined && separated(g, ...at(a), ...at(b))) wrongSplits.push(`${i}:${a}-${b}`);
          if (refreshed && reachable(...at(a), ...at(b)) !== joined)
            wrongAfterRefresh.push(`${i}:${a}-${b}`);
        }
    }
    expect(wrongSplits).toEqual([]);
    expect(wrongAfterRefresh).toEqual([]);
  });
});
