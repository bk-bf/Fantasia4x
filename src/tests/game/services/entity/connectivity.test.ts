import { describe, it, expect, beforeEach } from 'vitest';
import type { WorldTile } from '$lib/game/core/types';
import { rebuildConnectivity, reachable, componentAt, clearConnectivity } from '$lib/game/services/entity/connectivity';

// Minimal walkable grid from an ASCII map: '#' = wall, anything else = floor.
function grid(rows: string[]): WorldTile[][] {
  return rows.map((row, y) =>
    [...row].map(
      (ch, x) => ({ x, y, walkable: ch !== '#', moisture: 0, snow: 0 }) as unknown as WorldTile
    )
  );
}

describe('connectivity flood-fill', () => {
  beforeEach(() => clearConnectivity());

  it('reports same component for connected floor and different across a wall', () => {
    // Two open halves split by a full wall column → two components.
    const map = grid(['....#....', '....#....', '....#....']);
    rebuildConnectivity(map);
    expect(reachable(0, 0, 3, 2)).toBe(true); // left half, connected
    expect(reachable(5, 0, 8, 2)).toBe(true); // right half, connected
    expect(reachable(0, 0, 8, 0)).toBe(false); // across the wall — unreachable
    expect(componentAt(4, 0)).toBe(-1); // the wall itself is unwalkable
  });

  it('honours the diagonal corner-cut rule (matches A*)', () => {
    // Floor at (0,0) and (1,1); the shared corner is sealed by walls at (1,0) and (0,1) → NOT connected.
    const map = grid(['.#', '#.']);
    rebuildConnectivity(map);
    expect(reachable(0, 0, 1, 1)).toBe(false);
    // Open ONE orthogonal of the corner → the diagonal now links.
    const map2 = grid(['..', '#.']);
    rebuildConnectivity(map2);
    expect(reachable(0, 0, 1, 1)).toBe(true);
  });

  it('degrades to "reachable" before the first build (so callers do not refuse every target)', () => {
    clearConnectivity();
    expect(reachable(0, 0, 99, 99)).toBe(true);
  });
});
